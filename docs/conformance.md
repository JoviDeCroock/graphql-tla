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

The adapter is a process that reads and writes newline-delimited JSON on stdin and stdout. Anything on stderr is passed through. For each `execute`, it builds the schema, parses the document, and executes it with **one resolver installed on every field**. That resolver:

1. tells the kit it was called (`call`);
2. returns something that completes later (a promise, future, task or channel);
3. completes it however the kit says (`settle`).

### Messages

The adapter starts by announcing itself:

```json
{"type":"hello","protocol":1,"name":"my-graphql 2.3","capabilities":["idle","deferred-items","mutation","subscription"]}
```

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
- **`no-response`:** the implementation produced no response at all for a query or mutation, for example because serializing its result failed, or execution raised out to the caller. The kit counts it against `resultCoercion` (or `intFraction`, when the only such value was a fraction for an Int) when a resolver had returned an `uncoercible` value, and against `responds` otherwise. Only use it where a client would get nothing; an adapter bug is an `error`.
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
| `{"kind":"uncoercible"}` | A value the leaf type can't represent: `1.2` for an Int, a non-finite number (`Infinity` or `NaN`) for a Float, a name that isn't one of an enum's values. Only sent with `uncoercible-results`. Each must raise an execution error (§3.5.1, §3.5.2, §3.9). The Int fraction is graded as `intFraction`, the others as `resultCoercion`. |

The kit checks leaf values in the response against the same table, because the reference abstracts them away. Results of the wrong shape are only sent to adapters with `invalid-results`:

- a leaf for a list type;
- an object for an Int, Float or Boolean. Not for String or ID, which §3.5 lets a service coerce from other values "where reasonable";
- a runtime type that isn't one of an abstract type's possible types.

### Capabilities

| Capability | Meaning |
| --- | --- |
| `idle` | After each `execute` and `settle`, the adapter lets the engine run until it is blocked on the kit, then sends `idle`. That makes runs deterministic, which the exhaustive runs need. Without it, the kit waits `--grace` ms of silence instead and only does random runs. |
| `deferred-items` | A list's items settle one by one. Without it, a list `settle` carries `items`, the outcome of each item (never `error`), and the adapter returns them inline. |
| `invalid-results` | The adapter can return results of the wrong shape. Typed implementations usually can't. |
| `uncoercible-results` | The adapter can return the `uncoercible` values above, in fixtures with invalid results. |
| `mutation`, `subscription` | It runs those operation types. A subscription's source stream yields one event, and the response is the result for that event. In graphql-js, the root field's resolver runs on the event (`{}`) and is the root `call`. In engines where the stream's item is the root field's value, the source stream's request for its event is the root `call`, and the settled outcome is the event. |
| `error-propagation-off` | It can execute with `errorPropagation: false`. That runs the `noPropagation` fixture, whose failures are informational. |

Fixtures that need a capability the adapter doesn't have are skipped, and the report says so.

### Engines that run resolvers synchronously

If your engine calls a resolver and blocks until it returns, the resolver can read the `settle` from stdin itself. Only one call is pending at a time, so every run is the FIFO schedule, and the protocol still works. Without `idle`, set `--grace` above your engine's worst pause between finishing one resolver and calling the next.

## What is checked

For each case, the kit evaluates `Cases!Failures` in [`kit/execution/Cases.tla`](../kit/execution/Cases.tla). That is each clause of `Reference!Clauses`, plus `Reference!CalledSerially` for mutations:

| Clause | The response breaks it when |
| --- | --- |
| `complete` | it was sent while a resolver it depends on was still pending |
| `dataMatches` | `data` isn't the completed value, up to key order |
| `keyOrder` | keys aren't in collected field order. This is a SHOULD (§7.2.2); it only fails with `--strict`, as do extra entries in an error |
| `errorsWereRaised` | an error's path isn't where an execution error was raised |
| `errorPathsUnique` | two errors share a path (§6.4.4). A MUST in the draft, a SHOULD in October 2021 |
| `errorsInsideNulls` | an error isn't inside a null in `data` |
| `nullsExplained` | a null caused by an error comes without an error from any of its causes. It doesn't require the cause that actually nulled it: see [How strict `nullsExplained` is](#how-strict-nullsexplained-is) |
| `calledSerially` | a mutation's root field was called before the previous one completed (§6.3.4) |
| `serialErrorsKept` | a mutation leaves out an error raised under an earlier root field, which no earlier error had nulled, even if a later root field then nulled `data`. §6.3.4 completes each root field before the next, so those errors can't have been cancelled (§6.3.3). This holds whatever order the trace is in |

Before that, the kit rejects malformed cases. It works out each position's type from the fixture, never from the adapter. A case is malformed if:

- the response has entries other than `data`, `errors` and `extensions`, or no `data`;
- an `extensions` entry isn't a map;
- an error has no `message` or `path`, or its `extensions` isn't a map;
- an error path isn't a list, has a string where §7.1.4 wants an integer list index, uses a field name where the response name is an alias (`responsePosition`, a MUST in the draft and a SHOULD in October 2021), or names a position the operation doesn't select (`errorPath`);
- `errors` is an empty list;
- a leaf isn't the canonical value for its position's type;
- a position whose resolver returned an `uncoercible` value holds a value instead of null (`intFraction` for a fraction at an Int, `resultCoercion` otherwise);
- a resolver is called twice, called at a position the operation doesn't select (fragments that don't apply, and `@skip` and `@include` with the fixture's variables, are taken into account), or reported with the wrong type;
- a resolver is called before its parent position settled to an object, or to a list long enough for its index;
- a call's `after` stamp is negative, or more than the settles the adapter had been sent;
- a resolver settles twice, or settles without having been called;
- a subscription's response stream failed instead of yielding the event's result (`stream-error`);
- the implementation produced no response (`no-response`): `resultCoercion` after an `uncoercible` value, otherwise `responds`.

These are reported as SHOULDs, and fail only with `--strict`:
- extra entries in an error (`errorEntries`, §7.1.6);
- an error's `locations` that isn't a list of maps with positive integer `line` and `column` (`errorLocations`, §7.1.6, where the whole sentence about locations is a should);
- a leaf with the canonical value but the wrong JSON type, such as `"1"` for Int 1 (`leafEncoding`, §7.2.1: "the following JSON values should be used").

Each problem belongs to one check in [`kit/execution/checks.mjs`](../kit/execution/checks.mjs), which also lists the spec sections each check rests on. In a report, a malformed case counts against its first problem only, in the order above. That is the root cause when one fault shows up several ways.

Failures are grouped by fixture and clause, and each group is shown by its shortest case: its trace, the response, and the data the reference expected.

Every run also checks the checker. [`kit/execution/controls.json`](../kit/execution/controls.json) holds known-good cases recorded from graphql-js, and 30 broken variants of them. Some examples:
- an error dropped;
- an error reported under a field name instead of its alias;
- a location with line 0, and an Int written as a string (SHOULDs);
- the error that nulled an earlier mutation root field dropped once `data` was nulled;
- a key reordered;
- a mutation field called early;
- a response sent while a resolver it needs is pending;
- a list index written as a string;
- a field called that `@include(if: false)` leaves out;
- a field called before its parent had a value;
- a negative stamp.

Each base must pass, and each control must be caught by the clause it names. A malformed control must be caught by the check it names, and a SHOULD control by the SHOULD check it names. So a green run can't be vacuous. No base comes from the `noPropagation` fixture. The corpus doesn't depend on your cases. `node scripts/generate-controls.mjs` regenerates it.

### How strict `nullsExplained` is

§6.4.4 says the error that nulls a position "must be added to the errors list". `nullsExplained` is looser than that. When several errors could have nulled the same nullable position, it accepts a response that reports any one of them, including one that drops the error which actually nulled the position.

Every cause of a null reaches it through Non-Null positions only, so whichever cause the engine completed first nulled the position, and its error must be reported. The causes completed after it were raised inside a position that was already null, and graphql-spec#1184 lets those be dropped. So the strict rule is "report the error of the cause the engine completed first".

The kit can't tell which cause that was. The order in which resolvers settle isn't the order in which the engine completes their fields: §6.3.4 lets it complete sibling fields "in whatever order it chooses". `idle` doesn't help, because it means the engine is blocked on the kit, not that it has handled the settle the kit just sent. graphql-ruby's Dataloader, for example, pauses every field of a batch and resumes them in field order once the whole batch has settled. In `fragments`, if `node.nodeId` settles to null before `node.id` does, graphql-ruby still completes `node.id` first, reports its error, and drops `nodeId`'s, which is correct. A rule that took settle order as completion order failed graphql-ruby on such cases, wrongly. `after` stamps don't help either: they place calls among settles, and say nothing about when a field was completed.

So for a query, a response that drops the error which actually nulled a position passes, as long as it reports the error of another cause of the same null. For a mutation, `serialErrorsKept` closes the gap between root fields, since §6.3.4 orders those. Closing it within a selection set would need the adapter to report when the engine completes each field, which the protocol doesn't have.

### Error propagation off

The `noPropagation` fixture runs graphql-js 17's experimental `@experimental_disableErrorPropagation`: an error nulls the position where it happened, even a Non-Null one. Neither edition of the spec has this mode. §6.4.4 says "Since `Non-Null` response positions cannot be {null}, execution errors are propagated". So the fixture cites no spec section, and every failure in it, whichever clause or check it breaks, is reported under `disabledPropagation`. That check is INFO: it cites no section and never fails a run, even with `--strict`. An adapter protocol problem in the fixture still counts as `protocol`. The fixture only runs for adapters that claim `error-propagation-off`.

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
  - CreateSourceEventStream (§6.2.3.1). The kit starts a subscription at its one event, so the request error for a subscription that doesn't select exactly one root field, root-argument coercion, and the draft's rule that an error raised there is a request error aren't checked.
  - The draft's note that descriptions and comments in executable documents "MUST be ignored during execution". The documents the kit sends have neither, so nothing tests it.
  - Whether an error has `locations` at all (a SHOULD, §7.1.6). Only the shape of `locations`, when present, is checked (`errorLocations`).
  - Parsing, validation, input coercion, schema validity and introspection are separate kit areas: see [Kit areas beyond execution](kit-areas.md).
