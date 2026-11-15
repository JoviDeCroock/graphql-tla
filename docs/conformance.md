# Checking your GraphQL implementation

`Reference.tla` is an executable statement of what the spec allows a response to be. It doesn't predict one answer. Given what each resolver produced, it says whether a response is one of the responses the spec allows. That matters because execution has many correct answers:

- resolvers settle in any order;
- a response can go out before abandoned resolvers finish;
- errors under an already-nulled position may or may not be reported;
- a mutation may stop after its `data` is nulled.

A golden-file test suite would have to pick one of these. The reference accepts all of them and nothing else.

The kit in [`kit/`](../kit) runs your implementation through an *adapter* and checks every response with tla-ts. graphql-js 16 and 17 are checked this way in CI, through [`adapters/graphql-js/adapter.mjs`](../adapters/graphql-js/adapter.mjs), about 150 lines.

```shell
npx graphql-tla run execution --adapter "java -jar my-adapter.jar"
npx graphql-tla run execution --adapter "node adapters/graphql-js/adapter.mjs --graphql 17" --strict
npx graphql-tla check execution cases.jsonl
```

`run` drives the adapter, then checks. `check` reads cases you recorded yourself, in the [case format](#case-format), for implementations where a driven adapter is awkward.

Both take `--report FILE`, which writes what the run found as JSON: every check in [`kit/execution/checks.mjs`](../kit/execution/checks.mjs) with the spec sections it rests on, how many cases it applied to, how many broke it and the shortest one that did, plus which fixtures ran or were skipped and why, and `ok`, the run's verdict, which matches its exit code. [`scripts/conformance-sheet.mjs`](../scripts/conformance-sheet.mjs) turns the reports in [`conformance/reports/`](../conformance/reports) into the [conformance sheet](../conformance/README.md). To add an implementation to the sheet, add its adapter to [`conformance/implementations.json`](../conformance/implementations.json) and run `npm run conformance`.

## What your adapter does

The adapter is a process that reads and writes newline-delimited JSON on stdin and stdout. Escape U+2028 and U+2029 inside JSON strings as `\u2028` and `\u2029`: some line readers treat the raw characters as line endings. The kit does this for requests; adapters should do the same for replies. Anything on stderr is passed through. For each `execute`, it builds the schema, parses the document, and executes it with **one resolver installed on every field**. That resolver:

1. tells the kit it was called (`call`);
2. returns something that completes later (a promise, future, task or channel);
3. completes it however the kit says (`settle`).

### Messages

The adapter starts by announcing itself:

```json
{"type":"hello","protocol":1,"name":"my-graphql 2.3","capabilities":["idle","deferred-items","mutation","subscription"]}
```

Two optional `hello` fields tell the kit about outcomes a typed implementation can't produce (see [Capabilities](#capabilities)): `"uncoercibleTypes":["Float"]` and `"nullItems":false`.

The kit, for each execution:

```json
{"type":"execute","id":7,"fixture":"unions","schema":"type Query { … }","document":"query { … }","operationType":"query","variables":{},"errorPropagation":true}
{"type":"settle","id":7,"call":3,"outcome":{"kind":"object","type":"User"}}
{"type":"end","id":7}
```

The adapter:

```json
{"type":"call","id":7,"call":3,"path":["search","0"],"returnType":"SearchResult!","after":2}
{"type":"response","id":7,"response":{"data":{"search":[{"__typename":"User","name":null}]},"errors":[{"message":"…","path":["search",0,"name"]}]}}
{"type":"idle","id":7}
{"type":"stream-error","id":7,"message":"…"}
{"type":"no-response","id":7,"message":"…"}
{"type":"error","id":7,"message":"the adapter couldn't build the schema: …"}
```

Field by field:

- **`call`:** numbers calls within an execution. Each `settle` names one.
- **`path`:** the response path, with list indices as strings or numbers. This is only instrumentation. Paths in the response's errors must follow §7.1.4: integers for list indices.
- **`returnType`:** the field's type in SDL syntax, or the item type for a list item. The kit checks it against the fixture.
- **`after`:** optional but recommended. The number of `settle`s for this execution the adapter had applied when the resolver was called. Increment the count before completing the future. The kit uses it to place each call in the order the engine saw things, which is what makes `calledSerially` conclusive. A stamp can only be late, never early, so it's sound on any threading model.
- **`response`:** the response the client would get, serialized as JSON.
- **`stream-error`:** for a subscription whose response stream failed instead of yielding the event's result, so the client got no response at all. The kit counts it against `eventYieldsResult`. Don't make up a response for it.
- **`no-response`:** the implementation produced no response at all for a query or mutation, for example because serializing its result failed, or execution raised out to the caller. The kit counts it against `resultCoercion` when a resolver had returned a non-finite Float or an unknown enum value, against `intFraction` when the only such value was a fraction for an Int, and against `responds` otherwise. Only use it where a client would get nothing; an adapter bug is an `error`.
- **`error`:** the adapter itself failed. The kit stops.
- **`end`:** the kit is done with the execution. The adapter can drop it, and anything still pending can be abandoned.
- **`errorPropagation: false`:** execute without error propagation. graphql-js 17 does this with `@experimental_disableErrorPropagation`. The document doesn't carry the directive, so add it, or use your implementation's own switch. This mode is outside the spec: see [Error propagation off](#error-propagation-off).

### Outcomes

The resolver returns this for each outcome:

| `outcome` | The resolver returns |
| --- | --- |
| `{"kind":"leaf"}` | The canonical value for the named type: Int `1`, Float `1.5`, Boolean `true`, an enum's first value, anything else `"v"`. At a list position (a wrong shape), the number `1`. |
| `{"kind":"object","type":"User"}` | An object whose runtime type is `User`. For an abstract type, your type resolution must pick `User`. |
| `{"kind":"list","length":2}` | A list of `length` items. With `deferred-items`, each item is itself pending and is reported with its own `call`. |
| `{"kind":"null"}` | null |
| `{"kind":"error"}` | An error, by throwing, rejecting or returning an error value |
| `{"kind":"uncoercible"}` | A value the leaf type can't represent: `1.2` for an Int, a non-finite number (`Infinity` or `NaN`) for a Float, a name that isn't one of an enum's values. Only sent with `uncoercible-results`, and only for the leaf types in `uncoercibleTypes` if the adapter gives it. Each must raise an execution error (§3.5.1, §3.5.2, §3.9). A value passed through is graded as `intFraction` for the Int fraction and `resultCoercion` for the others; a null without an error as `coercionErrorReported`. All three are MUSTs; `coercionErrorReported` is a SHOULD in October 2021. |

The kit checks leaf values in the response against the same table, because the reference abstracts them away. Results of the wrong shape are only sent to adapters with `invalid-results`:

- a leaf for a list type;
- an object for an Int, Float or Boolean. Not for String or ID, which §3.5 lets a service coerce from other values "where reasonable".

The kit doesn't send a runtime type that isn't one of an abstract type's possible types. `ResolveAbstractType` (§6.4.3) is "the internal method provided by the type system", and no release says what an executor does when it returns a type that isn't a member. §3 says such a field "will return a valid implementing Object type", with no key word, and no sentence says the executor must raise an execution error, which is what graphql-js and `Reference.tla` do. So no response to such an outcome could be graded against the spec.

### Capabilities

| Capability | Meaning |
| --- | --- |
| `idle` | After each `execute` and `settle`, the adapter lets the engine run until it is blocked on the kit, then sends `idle`. That makes runs deterministic, which the exhaustive runs need. Without it, the kit waits `--grace` ms of silence instead and only does random runs. |
| `deferred-items` | A list's items settle one by one. Without it, a list `settle` carries `items`, the outcome of each item (never `error`), and the adapter returns them inline. |
| `invalid-results` | The adapter can return results of the wrong shape. Typed implementations usually can't. |
| `uncoercible-results` | The adapter can return the `uncoercible` values above, in fixtures with invalid results. If `hello` also has `uncoercibleTypes`, a list of `"Int"`, `"Float"` and `"Enum"`, the kit sends `uncoercible` only for those leaf types. In a typed implementation an Int field returns an integer type and an enum field a native enum, so neither can hold such a value: Juniper claims `["Float"]`, since an `f64` can be infinite. |
| `mutation`, `subscription` | It runs those operation types. A subscription's source stream yields one event, and the response is the result for that event. In graphql-js, the root field's resolver runs on the event (`{}`) and is the root `call`. In engines where the stream's item is the root field's value, the source stream's request for its event is the root `call`, and the settled outcome is the event. |
| `error-propagation-off` | It can execute with `errorPropagation: false`. That runs the `noPropagation` fixture, whose failures are informational. |

Fixtures that need a capability the adapter doesn't have are skipped, and the report says so.

`"nullItems": false` in `hello` says the adapter can't return null for a list item of a Non-Null type, or for a subscription's event when the root field's type is Non-Null. In a typed implementation the item type there (`Vec<Post>` for `[Post!]`, a stream of `Post` for `Post!`) has no null, so only an adapter's hand-written value could produce one. The kit then never settles such a position with `null`. Fields of a Non-Null type still get `null`, since the implementation checks those itself. It's an opt-out: without it, adapters get these outcomes as before.

Outcomes left out this way aren't graded. The report's `provenance.skipped` records each kind and how many times the kit left it out of a settle's choices, for example `{"uncoercible Int results (uncoercibleTypes: Float)": 2950}`.

### Engines that run resolvers synchronously

If your engine calls a resolver and blocks until it returns, the resolver can read the `settle` from stdin itself. Only one call is pending at a time, so every run is the FIFO schedule, and the protocol still works. Without `idle`, set `--grace` above your engine's worst pause between finishing one resolver and calling the next.

## What is checked

For each case, the kit evaluates `Cases!Failures` in [`kit/execution/Cases.tla`](../kit/execution/Cases.tla). That is each clause of `Reference!Clauses`, plus `Reference!CalledSerially` for mutations:

| Clause | The response breaks it when |
| --- | --- |
| `complete` | it was sent while a resolver it depends on was still pending |
| `dataMatches` | `data` isn't the completed value, up to key order. Sent while execution is pending, `data` is null though no root field can still null it: every root field is nullable or has completed, and no pending Non-Null position under a Non-Null root field remains (`DataNulledEarly` in [`Cases.tla`](../kit/execution/Cases.tla)). §6.4.4 nulls `data` only through Non-Null positions, so no outcome of the pending resolvers can make it null. If a Non-Null root field may still raise, an early null is only `complete` |
| `keyOrder` | keys aren't in collected field order. This is a SHOULD (§7.2.2); it only fails with `--strict`, as do extra entries in an error |
| `errorsWereRaised` | an error's path isn't where an execution error was raised. A raised error's path without its list indices counts against `responsePosition` instead, and one cut short where the error propagated to against `errorPathFull` (see below) |
| `errorPathsUnique` | two errors share a path (§6.4.4). A MUST in September 2026 ("each error added to the errors list during execution must have a unique response path"), a SHOULD in September 2025 ("only one error should be added to the errors list per response position") and October 2021 ("per field") |
| `errorsInsideNulls` | an error isn't inside a null in `data` |
| `nullsExplained` | a null caused by an error comes without an error from any of its causes. It doesn't require the cause that actually nulled it: see [How strict `nullsExplained` is](#how-strict-nullsexplained-is). A MUST since September 2025, a SHOULD in October 2021, whose §6.4.4 and §7.1.2 say errors "should be reported" and the errors entry "should include all raised field errors" |
| `calledSerially` | a mutation's root field was called before the previous one completed (§6.3.4). A SHOULD in every release: §6.2.2 says the root selection set "should be executed serially", and the sentence that says it "must be executed serially" is an example |
| `serialErrorsKept` | a mutation that passes `calledSerially` leaves out an error raised under an earlier root field, which no earlier error had nulled, even if a later root field then nulled `data`. Serial execution (§6.3.4) completes each root field before the next, so those errors can't have been cancelled (§6.3.3). A mutation that didn't run serially may have completed a later root field first, so it isn't graded on this clause. A MUST since September 2025, a SHOULD in October 2021, as `nullsExplained` |

Before that, the kit rejects malformed cases. It works out each position's type from the fixture, never from the adapter. A case is malformed if:

- a mutation root field's resolver is called twice, or one the operation doesn't select is called (`mutationFieldsOnce`, a MUST);
- any other resolver is called twice (`callsOnce`), called at a position the operation doesn't select (`callsSelected`; fragments that don't apply, and `@skip` and `@include` with the fixture's variables, are taken into account), or called before its parent position settled to an object, or to a list long enough for its index (`callsReachable`). These three are INFO: Appendix A lets an algorithm be fulfilled "in any way as long as the perceived result is equivalent", and §6.3.4 says fields other than top-level mutation fields "must always be side effect-free and idempotent", so an extra call isn't perceived. The reference still grades the response;
- a call is reported with the wrong type (`protocol`);
- a call's `after` stamp is negative, or more than the settles the adapter had been sent;
- a resolver settles twice, or settles without having been called;
- a subscription's response stream failed instead of yielding the event's result (`stream-error`);
- the implementation produced no response (`no-response`): `resultCoercion` or `intFraction` after an `uncoercible` value, otherwise `responds`;
- the response isn't a map (`resultMap`, §7.1.1), has entries other than `data`, `errors` and `extensions`, or has no `data`;
- an `extensions` entry isn't a map;
- an error has no `message` or `path`, or its `extensions` isn't a map;
- an error path isn't a list, has a string where §7.1.4 wants an integer list index, uses a field name where the response name is an alias, or is a raised error's path with its list indices left out, such as `["tags"]` for an error at `tags.0` (`responsePosition`, a MUST since September 2025, whose new §7.1.4 says the path "must be a list of path segments", and a SHOULD in October 2021, whose §7.1.2 says it "should be a list of path segments");
- an error path stops at a position the error propagated to, above the Non-Null position where it was raised, such as `["node"]` for an error at `node.id` (`errorPathFull`, a SHOULD: §7.1.6 says the path "should include the full path to the result field where the error was raised, even if that field is not present in the response");
- an error path names a position the operation doesn't select (`errorPath`);
- `errors` is an empty list;
- a leaf isn't the canonical value for its position's type;
- a position whose resolver returned an `uncoercible` value holds a value instead of null (`intFraction` for a fraction at an Int, `resultCoercion` otherwise), or is null without an error at its path (`coercionErrorReported`). A silent null there is graded as `coercionErrorReported`, not as `nullsExplained`: it is a MUST since September 2025, and a SHOULD in October 2021, where the response can't tell a value coerced to null (a must) from a raised error left out (a should). The leaf check above skips these positions, so a value passed through counts once.

The trace comes first, whatever the response, so a call with the wrong type is a `protocol` problem even when the implementation then produced no response.

`intFraction` is a MUST. §3.5.1's rule is: "GraphQL services may coerce non-integer internal values to integers when reasonable without losing information, otherwise they must raise an execution error." Truncating 1.2 to 1 loses information. The sentence after it, "For example, a floating-point number 1.2 should raise an execution error instead of being truncated to 1", is an example, and Appendix A makes examples non-normative, so its should doesn't set the level. September 2025 and October 2021 have the same sentences. A truncating case is still checked by the reference, as below, so a failure elsewhere in the same case isn't hidden.

Each check's `level` is its level in September 2026, the edition the kit grades. Where an older release's wording gives another level, the check (and the report) has `levels`, such as `{ "September2025": "SHOULD", "October2021": "SHOULD" }` for `errorPathsUnique`; a release it leaves out has `level`. Every other check has the same level in September 2025 and October 2021. Each check's `basis` in [`kit/execution/checks.mjs`](../kit/execution/checks.mjs) quotes the sentences it rests on in each release, and why its level is the one it is. A level comes only from normative prose: examples are non-normative, and where the text's level is in doubt the kit takes the weaker one.

These are reported as SHOULDs, and fail only with `--strict`:
- `calledSerially` and `keyOrder` among the clauses above;
- an error path cut short where the error propagated to (`errorPathFull`, §7.1.6);
- extra entries in an error (`errorEntries`, §7.1.6);
- an error's `locations` that isn't a list of maps with positive integer `line` and `column` (`errorLocations`, §7.1.6, where the whole sentence about locations is a should);
- a leaf with the canonical value but the wrong JSON type, such as `"1"` for Int 1 (`leafEncoding`, §7.2.1: "the following JSON values should be used").

These are INFO, and never fail a run: `callsOnce`, `callsSelected` and `callsReachable` (above), and `disabledPropagation` ([below](#error-propagation-off)).

Each problem belongs to one check in [`kit/execution/checks.mjs`](../kit/execution/checks.mjs), which also lists the spec sections each check rests on. In a report, a malformed case counts against every check it breaks, once per check, however many times it breaks it, so one problem never hides another. The exception is a case where the adapter broke the protocol (`protocol`): the response comes from a run the adapter misreported, so only the problems of its trace count (`protocol`, `callsOnce`, `callsSelected`, `callsReachable`, `mutationFieldsOnce`). `adapterProblems` counts each case where the adapter broke the protocol. A warning counts under the level of its own case's fixture.

A malformed case still goes to the reference when what it breaks leaves the trace and `data` usable, and its clause failures count like any other case's:
- if the adapter broke the protocol, a position settled twice with different outcomes (so the response can't say which one it was built from), it has no response or no `data`, or `data` holds a position the operation doesn't select, the reference doesn't see it. Extra calls (`callsOnce`, `callsSelected`, `callsReachable`, `mutationFieldsOnce`) don't keep a case from the reference;
- if an error has no usable path (`errorPath`, `responsePosition`, `errorPathFull`, or an error that isn't a map), only the clauses that don't read error paths count: `complete`, `dataMatches`, `keyOrder` and `calledSerially`. So errors without a path don't hide `data` nulled past a nullable position;
- otherwise every clause counts. A position whose resolver returned an `uncoercible` value is given to the reference as the implementation completed it: as a leaf if it holds a value, as null if it is null without an error. So an Int fraction truncated to 1 doesn't hide a dropped error elsewhere in the case, and isn't counted a second time.

The summary line says how many distinct malformed cases also break the reference, and those failures are listed after the malformed groups.

Failures are grouped by fixture and clause, and each group is shown by its shortest case: its trace, the response, and the data the reference expected.

Every run also checks the checker. [`kit/execution/controls.json`](../kit/execution/controls.json) holds known-good cases recorded from graphql-js, 36 broken variants of them, and 10 report controls. Some examples:
- an error dropped;
- an error reported under a field name instead of its alias;
- an error path without its list indices, and one cut short where the error propagated to;
- a mutation root field called twice;
- a location with line 0, and an Int written as a string (SHOULDs);
- the error that nulled an earlier mutation root field dropped once `data` was nulled;
- a key reordered;
- a mutation field called early;
- a response sent while a resolver it needs is pending;
- `data` null while only nullable root fields are pending;
- a non-finite Float that comes back as null without an error;
- a list index written as a string;
- a field called that `@include(if: false)` leaves out;
- a field called before its parent had a value;
- a negative stamp.

Each base must pass, and each control must be caught by the clause it names. A malformed control must be caught by the check it names, and a SHOULD control by the SHOULD check it names. So a green run can't be vacuous. No control base comes from the `noPropagation` fixture.

A report control is a small set of cases, and a fact their report must show. It tests the counting across cases that one case can't: a SHOULD warning in a normal fixture still counts as a SHOULD after the same warning in `noPropagation`; a case that breaks a SHOULD twice counts once; a call with the wrong type before a missing response is a `protocol` problem, not `intFraction`; an Int fraction passed through counts under `intFraction` only, not `leafValues`; an Int fraction truncated to 1 doesn't hide a dropped error in the same case (`nullsExplained`); errors without a path don't hide `data` nulled past a nullable position (`dataMatches`), and the clauses that read error paths aren't graded on that case; a case that breaks two checks counts against both; a field called twice with the same outcome still has its response graded, so a dropped error in it fails `nullsExplained`; a mutation that didn't run serially isn't graded on `serialErrorsKept`; and a root field called twice with different types in `noPropagation` counts under `callsOnce` and `protocol` and fails the fixture. Every report, the run's included, must also never count more failing cases for a check than the cases it applies to. The corpus doesn't depend on your cases. `node scripts/generate-controls.mjs` regenerates it.

### How strict `nullsExplained` is

§6.4.4 says the error that nulls a position "must be added to the errors list". `nullsExplained` is looser than that. When several errors could have nulled the same nullable position, it accepts a response that reports any one of them, including one that drops the error which actually nulled the position.

Every cause of a null reaches it through Non-Null positions only, so whichever cause the engine completed first nulled the position, and its error must be reported. The causes completed after it were raised inside a position that was already null, and graphql-spec#1184 lets those be dropped. So the strict rule is "report the error of the cause the engine completed first".

The kit can't tell which cause that was. The order in which resolvers settle isn't the order in which the engine completes their fields: §6.3.4 lets it complete sibling fields "in whatever order it chooses". `idle` doesn't help, because it means the engine is blocked on the kit, not that it has handled the settle the kit just sent. graphql-ruby's Dataloader, for example, pauses every field of a batch and resumes them in field order once the whole batch has settled. In `fragments`, if `node.nodeId` settles to null before `node.id` does, graphql-ruby still completes `node.id` first, reports its error, and drops `nodeId`'s, which is correct. A rule that took settle order as completion order failed graphql-ruby on such cases, wrongly. `after` stamps don't help either: they place calls among settles, and say nothing about when a field was completed.

So for a query, a response that drops the error which actually nulled a position passes, as long as it reports the error of another cause of the same null. For a mutation, `serialErrorsKept` closes the gap between root fields, since §6.3.4 orders those. Closing it within a selection set would need the adapter to report when the engine completes each field, which the protocol doesn't have.

### Error propagation off

The `noPropagation` fixture runs graphql-js 17's experimental `@experimental_disableErrorPropagation`: an error nulls the position where it happened, even a Non-Null one. No release of the spec has this mode. §6.4.4 says "Since `Non-Null` response positions cannot be {null}, execution errors are propagated". So the fixture cites no spec section, and every failure of its response (its data and errors), whichever clause or check it breaks, is reported under `disabledPropagation`. That check is INFO: it cites no section and never fails a run, even with `--strict`. Turning propagation off doesn't change which resolvers run, so protocol problems and the checks on calls (`callsOnce`, `callsSelected`, `callsReachable`, `mutationFieldsOnce`, `calledSerially`) keep their own checks and levels in the fixture. The fixture only runs for adapters that claim `error-propagation-off`.

## Case format

One JSON object per line. `run --out FILE` writes them, and `check` reads them.

```json
{"v":1,"fixture":"unions","implementation":"my-graphql 2.3",
 "trace":[{"call":["search"],"type":"[SearchResult!]"},
          {"settle":["search"],"outcome":{"kind":"list","length":1}},
          {"call":["search","0"],"type":"SearchResult!"},
          {"settle":["search","0"],"outcome":{"kind":"object","type":"User"}},
          {"call":["search","0","name"],"type":"String"},
          {"settle":["search","0","name"],"outcome":{"kind":"error"}}],
 "response":{"data":{"search":[{"__typename":"User","name":null}]},"errors":[{"message":"…","path":["search",0,"name"]}]}}
```

- **`trace`:** the calls and settles up to the moment the response was produced, in order. The outcomes the reference uses are the settles in it.
- **`after`** on a call: the adapter's stamp, if it sent one.
- **`inline`:** marks the call and settle of a list item that came with its list's settle (adapters without `deferred-items`). Stamps don't count inline settles.
- **`streamError`** instead of `response`: the subscription's response stream failed with this message.
- **`noResponse`** instead of `response`: the implementation produced no response, with this message.
- **`v`:** the format version. The kit refuses versions it doesn't know.

## Limits

- **Fixtures:** the fixtures in [`fixtures/`](../fixtures) are small, and their ids won't change. A pass means no fixture, outcome combination or schedule tried found a response the spec forbids. It doesn't prove the implementation correct.
- **Without `idle`:** the kit may record a settle the engine never looked at before it responded. The response clauses stay sound, because `Valid` stays true as more resolvers settle after a response (`ExecutionConformance.tla` checks this as `ResponseStaysValid`). With `idle`, the kit replays a few runs before it starts and fails if their traces, data or error paths differ, since exhaustive runs depend on determinism. Error messages, order and extensions may differ.
- **Without `after` stamps:** `calledSerially` uses the order messages arrived in. It can catch a non-serial engine but can't prove a serial one, and the report says so.
- **Not covered by this area:**
  - `@defer`/`@stream` and subscription streams beyond one event. Their models are checked against graphql-js only.
  - CreateSourceEventStream (§6.2.3.1). The kit starts a subscription at its one event, so the request error for a subscription that doesn't select exactly one root field, root-argument coercion, and September 2026's note that an error raised there is a request error aren't checked.
  - §2.2's rule, since September 2025, that descriptions in executable documents "MUST NOT affect the execution, validation, or response of a GraphQL document". The documents the kit sends have no descriptions or comments, so nothing tests it.
  - Whether an error has `locations` at all (a SHOULD, §7.1.6). Only the shape of `locations`, when present, is checked (`errorLocations`).
  - What an executor does when type resolution returns a type that isn't one of the abstract type's possible types. The spec doesn't say, so the kit doesn't send such an outcome (see [Outcomes](#outcomes)).
  - Parsing, validation, input coercion, schema validity and introspection are separate kit areas: see [Kit areas beyond execution](kit-areas.md).
