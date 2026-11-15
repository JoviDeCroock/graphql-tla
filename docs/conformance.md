# Checking your GraphQL implementation

`Reference.tla` is an executable statement of what the spec allows a response to be. It doesn't predict one answer. Given what each resolver produced, it says whether a response is one of the responses the spec allows. That matters because execution has many correct answers:

- resolvers settle in any order;
- a response can go out before abandoned resolvers finish;
- errors under an already-nulled position may or may not be reported;
- a mutation may stop after its `data` is nulled.

A golden-file test suite would have to pick one of these. The reference accepts all of them and nothing else.

The kit in [`kit/`](../kit) runs your implementation through an *adapter* and checks every response with tla-ts. graphql-js 16 and 17 are checked this way in CI, through [`adapters/graphql-js/adapter.mjs`](../adapters/graphql-js/adapter.mjs), about 200 lines for execution.

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

With some [capabilities](#capabilities) there is more: `initialValue`, `event` and `stream` on `execute`, `token` on object outcomes and `value` on leaf outcomes, `parent` on `call`, and the [subscription stream](#subscription-streams) messages `source`, `cancel`, `done` and `source-cancelled`.

Field by field:

- **`fixture`:** the fixture's id: a [`fixtures/*.graphql`](../fixtures) file's name, or `<file>_<variant>` for a file with a `# variants:` header, which runs the same schema and document once per set of variable values (`directives` is `directives_kept`, `directives_skipped`, `directives_excluded` and `directives_dropped`). The 16 files make 19 fixtures. `schema`, `document` and `variables` hold everything needed to run it.
- **`call`:** numbers calls within an execution. Each `settle` names one.
- **`path`:** the response path, with list indices as strings or numbers. This is only instrumentation. Paths in the response's errors must follow §7.1.4: integers for list indices.
- **`returnType`:** the field's type in SDL syntax, or the item type for a list item. The kit checks it against the fixture.
- **`after`:** optional but recommended. The number of `settle`s for this execution the adapter had applied when the resolver was called. Increment the count before completing the future. The kit uses it to place each call in the order the engine saw things, which is what makes `calledSerially` conclusive. A stamp can only be late, never early, so it's sound on any threading model.
- **`parent`:** with `parent-values` only. The `token` of the value the field's resolver was called on (its `objectValue`, §6.4.2): for a root field, the `execute`'s `initialValue`, or for a subscription the event's token; below the root, the token of the object its parent position settled to (`null` if the resolver got something without one). Leave it out on a list item's call, which has no resolver of its own. In engines where a subscription's event is the root field's value (the source stream's request for its event is the root `call`, see `subscription` under [Capabilities](#capabilities)), no resolver runs on the event: report the event's token as the root call's `parent`. That grades nothing at the subscription root for such an engine, only below it; `parentValue` at a subscription's root is only meaningful where a resolver runs on the event, as in graphql-js.
- **`response`:** the response the client would get, serialized as JSON. The kit also reads the line as text, for a map that repeats a key (`uniqueKeys`): `JSON.parse` would keep the last one without a word. Write the response as your implementation serializes it.
- **`stream-error`:** for a subscription whose response stream failed instead of yielding the event's result, so the client got no response at all. The kit counts it against `eventYieldsResult`. Don't make up a response for it.
- **`no-response`:** the implementation produced no response at all for a query or mutation, for example because serializing its result failed, or execution raised out to the caller. The kit counts it against `resultCoercion` when a resolver had returned a non-finite Float or an unknown enum value, against `intFraction` when the only such value was a fraction for an Int, and against `responds` otherwise. Only use it where a client would get nothing; an adapter bug is an `error`.
- **`error`:** the adapter itself failed. The kit stops.
- **`end`:** the kit is done with the execution. The adapter can drop it, and anything still pending can be abandoned.
- **`initialValue`:** with `parent-values` only. A token for the initial value (§6.2.1, §6.4: `initialValue`): pass an object that carries it as the operation's root value, so that root fields' resolvers can report it as `parent`. For a subscription, it is the root value of CreateSourceEventStream, which no `call` reports.
- **`event`:** with `parent-values`, on a subscription's `execute` without `stream`. The token of the one event the source stream yields: yield an object that carries it.
- **`stream`:** `true` on a subscription's `execute` for an adapter with `subscription-stream`: the kit drives the source stream (see [Subscription streams](#subscription-streams)). Without it, a subscription yields one event, as before.
- **`errorPropagation: false`:** execute without error propagation. graphql-js 17 does this with `@experimental_disableErrorPropagation`. The document doesn't carry the directive, so add it, or use your implementation's own switch. This mode is outside the spec: see [Error propagation off](#error-propagation-off).

### Outcomes

The resolver returns this for each outcome:

| `outcome` | The resolver returns |
| --- | --- |
| `{"kind":"leaf"}` | The canonical value for the named type: Int `1`, Float `1.5`, Boolean `true`, an enum's first value, anything else (String, ID, custom scalars) `"v"`. At a list position (a wrong shape), the number `1`. |
| `{"kind":"leaf","value":4}` | The internal value `value`, as it is: the integer `4` for an ID, `2147483648` (outside 32 bits) for an Int. Only sent with `scalar-results`, in fixtures with invalid results. An ID "must always serialize as a String" (§3.5.5), so the response holds `"4"`, or an execution error if your ID can't take it (`idAsString`, a MUST; a number fails). The Int "should" raise an execution error (§3.5.1; passing it through fails `intRange`, a SHOULD). Null without an error fails `coercionErrorReported`. |
| `{"kind":"object","type":"User"}` | An object whose runtime type is `User`. For an abstract type, your type resolution must pick `User`. With `parent-values`, the outcome has a `token` (`{"kind":"object","type":"User","token":"o:search.0"}`): the object must carry it, so that the resolvers of its fields can report it as `parent`. |
| `{"kind":"list","length":2}` | A list of `length` items. With `deferred-items`, each item is itself pending and is reported with its own `call`. |
| `{"kind":"null"}` | null |
| `{"kind":"error"}` | An error, by throwing, rejecting or returning an error value |
| `{"kind":"uncoercible"}` | A value the leaf type can't represent: `1.2` for an Int, a non-finite number (`Infinity` or `NaN`) for a Float, a name that isn't one of an enum's values. Only sent with `uncoercible-results`, and only for the leaf types in `uncoercibleTypes` if the adapter gives it. For a custom scalar, with `custom-scalar-results`, in any fixture: a value the scalar's result coercion (its serializer) rejects, which the adapter defines, and whose result coercion must raise on it. Each must raise an execution error (§3.5, §3.5.1, §3.5.2, §3.9). A value passed through is graded as `intFraction` for the Int fraction and `resultCoercion` for the others; a null without an error as `coercionErrorReported`. All three are MUSTs; `coercionErrorReported` is a SHOULD in October 2021. |

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
| `subscription-stream` | The kit can drive a subscription's source stream: emit events, complete it, fail it, and cancel the response stream. See [Subscription streams](#subscription-streams). Needs `subscription`. |
| `parent-values` | Each field's `call` reports the value its resolver was given, as a token (`parent`): the kit sends `initialValue` and `event` on `execute`, a `token` on each object outcome, and a `token` on each emitted event of a stream. Graded by `parentValue`. Where a subscription's event is the root field's value, the root call reports the event's token by construction, so only the calls below the root are graded there (see `parent` under [Messages](#messages)). |
| `custom-scalar-results` | For a custom scalar, the adapter's resolver can return a value the scalar's result coercion rejects, and that coercion raises an execution error on it, as the scalar's serializer would on a value it can't represent. The kit sends `uncoercible` at custom scalar positions in any fixture. |
| `scalar-results` | The adapter's resolvers can return the integer `4` for an ID and `2147483648` for an Int (leaf outcomes with a `value`), in fixtures with invalid results. A typed implementation whose ID field returns a string type can't. |
| `error-propagation-off` | It can execute with `errorPropagation: false`. That runs the `noPropagation` fixture, whose failures are informational. |

Fixtures that need a capability the adapter doesn't have are skipped, and the report says so.

`"nullItems": false` in `hello` says the adapter can't return null for a list item of a Non-Null type, or for a subscription's event when the root field's type is Non-Null. In a typed implementation the item type there (`Vec<Post>` for `[Post!]`, a stream of `Post` for `Post!`) has no null, so only an adapter's hand-written value could produce one. The kit then never settles such a position with `null`. Fields of a Non-Null type still get `null`, since the implementation checks those itself. It's an opt-out: without it, adapters get these outcomes as before.

Outcomes left out this way aren't graded. The report's `provenance.skipped` records each kind and how many times the kit left it out of a settle's choices, for example `{"uncoercible Int results (uncoercibleTypes: Float)": 2950}`. It also counts the outcomes a fixture with invalid results would have offered but a capability the adapter lacks ruled out: `results of the wrong shape (no invalid-results capability)`, such as a leaf for a list (§6.4.3: "If {result} is not a collection of values, raise an execution error"), `values a leaf type can't represent (no uncoercible-results capability)` and `an Int outside 32 bits or an integer ID (no scalar-results capability)`.

### Subscription streams

With `subscription-stream`, besides the one-event runs above, the kit runs each subscription fixture as a stream it drives, through nine scenarios, each twice with seeded outcomes:

| Scenario | The kit's steps |
| --- | --- |
| the source completes before any event | complete |
| one event, then the source completes | emit, complete |
| three events, then the source completes | emit, emit, emit, complete |
| the source fails before any event | fail |
| two events, then the source fails | emit, emit, fail |
| an event whose root field raises, another event, then the source completes | emit (its root field's resolver raises), emit, complete |
| cancelled before any event | cancel |
| cancelled after an event | emit, cancel |
| cancelled while an event executes | emit, emit (its resolvers left pending), cancel, then the pending resolvers are settled |

After an `emit`, the kit settles the event's resolvers until the event's result arrives, before its next step. The messages:

```json
{"type":"execute","id":9,"fixture":"subscription","schema":"…","document":"subscription { … }","operationType":"subscription","variables":{},"errorPropagation":true,"stream":true}
{"type":"source","id":9,"action":"emit"}
{"type":"settle","id":9,"call":1,"outcome":{"kind":"object","type":"Post"}}
{"type":"source","id":9,"action":"complete"}
{"type":"source","id":9,"action":"fail","message":"the source stream failed"}
{"type":"cancel","id":9}
{"type":"end","id":9}
```

- **`execute` with `"stream": true`:** subscribe, with a subscribe resolver (the source stream, §6.2.3.1 ResolveFieldEventStream) whose stream the kit controls. Then consume the response stream as a client would, reporting each thing it does.
- **`source` `emit`:** the source stream emits an event. With `parent-values` it has a `token` (`"event-2"`): the event's value must carry it. The event's execution calls resolvers (`call`) as in any execution, and its result is reported as a `response`.
- **`source` `complete`:** the source stream completes normally.
- **`source` `fail`:** the source stream completes with an error whose message is `message`. If the implementation's source streams can't end with an error, as in a stream of `Result` items (Juniper, async-graphql), map `fail` to the nearest thing the implementation has: yield an error item carrying `message`, then end the source. Then report what the client gets, as it gets it: if the response stream yields an error result and ends, that is a `response` (with `errors`) and then `done`, never a `stream-error` the client didn't see. The kit takes that as the stream completing with the error (`failsWithSource`).
- **`cancel`:** the client cancels the response stream (Unsubscribe, §6.2.3.3): for example `return()` on an async iterator, `cancel()` on a subscription, or disposing it.
- **`end`:** the kit is done with the stream. Close anything still open without reporting it.

The adapter, besides `call`, `response` and `idle`:

```json
{"type":"response","id":9,"response":{"data":{"postLiked":{"likes":1,"title":null}}}}
{"type":"done","id":9}
{"type":"stream-error","id":9,"message":"the source stream failed"}
{"type":"source-cancelled","id":9}
```

- **`response`:** the response stream yielded this execution result.
- **`done`:** the response stream completed normally (the client's `next()` said done, or its `return()` resolved). Once only.
- **`stream-error`:** the response stream completed with an error (the client's `next()` threw). Once only, and never after `done`.
- **`source-cancelled`:** the implementation cancelled the kit's source stream (called its `return()`, `cancel()` or disposal). Report it only for a source that hadn't completed or failed.
- **`no-response`:** the implementation produced nothing for the event, though the stream goes on.

With `idle`, say `idle` after each kit message once the implementation is blocked on the kit, as for any execution. Without it, the kit waits up to the timeout for what it expects next (a call or result after an emit, the completion and the source's cancellation after a cancel) and `--grace` ms of silence otherwise.

**When subscribe gives no stream.** If the implementation answers the streamed `execute` with a single result instead of a response stream (a request error: Subscribe returns one when CreateSourceEventStream raises, §6.2.3.1, or the request fails before that), report that result as one `response`, and nothing else for the execution: no `done`, `stream-error` or `source-cancelled`, since there is no stream to complete or source to cancel. Ignore the kit's later `source` and `cancel` messages for that execution rather than answering them with `error`, and with `idle`, still say `idle` after each. The kit's subscribe resolvers never fail, so the kit logs that result as a result for no event, and the stream's checks fail: `eventPerSourceEvent` (a result for no source event, and no result for the events the kit emits), and the checks on how the stream ends that the scenario grades (`completesWithSource`, `failsWithSource`, or `cancelCompletes` and `cancelCancelsSource`), since it never completes.

**Engines where the event is the root field's value.** In such an engine (see `subscription` under [Capabilities](#capabilities)), the root `call` is the source stream's request for the event, and settling it is the event. So in the scenario that cancels while an event executes, the call left pending is that request: the second event hasn't reached the implementation when the kit cancels, and the kit settles the call only after the cancel. The scenario can't catch such an engine in the middle of an event, so passing `nothingAfterCancel` there says little about it.

Each event's result is a case of its own, graded like any other: the reference, the checks on errors, leaves and so on. The stream as a whole is a lifecycle case, the log of the kit's steps and the adapter's reports, graded by the checks below (MapSourceToResponseEvent, §6.2.3.2; the model they follow is [`specs/subscription.ts`](../specs/subscription.ts)).

| Check | Level | The stream breaks it when |
| --- | --- | --- |
| `eventPerSourceEvent` | MUST | an event emitted while the stream is open yields no result before the stream completes, a result arrives for no event, or a result arrives after the stream completed |
| `streamEndsOnlyForCause` | SHOULD | the stream completes though its source hadn't completed or failed and the client hadn't cancelled it, with every event answered. §6.2.3.2 lists when the response stream completes, but §6.2.3 also says "An event stream may complete at any point", so the level is in doubt. A stream that completes instead of yielding an event's result is `eventPerSourceEvent`'s |
| `completesWithSource` | MUST (October 2021: SHOULD) | the source completed, and the stream completed with an error or never completed |
| `failsWithSource` | MUST, since September 2025 | the source failed, and the stream completed normally or never completed ("If an event stream encounters an error, it must complete with that error"). The kit doesn't compare messages. A result with `errors` after the source failed, then normal completion, passes: the spec leaves how "complete with that error" reaches a client to the service ("Delivery Agnostic", §6.2.3), and a stream of results can only end with an error that way. §7.1.2's "A response stream must be a stream of execution result" argues against an error-only item, so the text is in doubt, and the kit takes the weaker reading. A result after the source failed never counts against `eventPerSourceEvent`: it answers the failure, not an event |
| `cancelCompletes` | MUST, since September 2025 | the client cancelled, and the stream completed with an error or never completed ("When an event stream is cancelled, it must complete"; "Complete {responseStream} normally") |
| `cancelCancelsSource` | MUST, since September 2025 | the client cancelled, and the source wasn't cancelled ("Cancel {sourceStream}"). October 2021's Unsubscribe "may" cancel it |
| `nothingAfterCancel` | SHOULD (October 2021: MUST) | a result arrives after the client cancelled. The algorithm completes the response stream when it is cancelled, but doesn't say what becomes of an event already executing. graphql-js 16 and 17 both deliver it: 17 before completing the stream, 16 after. October 2021 says after cancelling, an observer "must receive no more events from that event stream" |

A problem in the log that isn't the implementation's, such as completing twice, is `protocol`.

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
- with `parent-values`, a field's call reports a `parent` other than its parent position's object, or, at the root, the initial value or a subscription's event, or reports none (`parentValue`, a MUST: ResolveFieldValue, §6.4.2, calls the resolver "providing {objectValue} and {argumentValues}", and ExecuteQuery, ExecuteMutation and ExecuteSubscriptionEvent pass the initial value, the event's value for a subscription, §6.2.3.2);
- a call's `after` stamp is negative, or more than the settles the adapter had been sent;
- a resolver settles twice, or settles without having been called;
- a subscription's response stream failed instead of yielding the event's result (`stream-error`);
- the implementation produced no response (`no-response`): `resultCoercion` or `intFraction` after an `uncoercible` value, otherwise `responds`;
- the response isn't a map (`resultMap`, §7.1.1), has entries other than `data`, `errors` and `extensions`, or has no `data`;
- a map in the response, as the adapter wrote it, repeats a key (`uniqueKeys`, a MUST: §7.1.1's "An execution result must be a map", and Appendix B: "Each entry has a unique key");
- an `extensions` entry isn't a map;
- an error has no `message` or `path`, or its `extensions` isn't a map;
- an error path isn't a list, has a string where §7.1.4 wants an integer list index, uses a field name where the response name is an alias, or is a raised error's path with its list indices left out, such as `["tags"]` for an error at `tags.0` (`responsePosition`, a MUST since September 2025, whose new §7.1.4 says the path "must be a list of path segments", and a SHOULD in October 2021, whose §7.1.2 says it "should be a list of path segments");
- an error path stops at a position the error propagated to, above the Non-Null position where it was raised, such as `["node"]` for an error at `node.id` (`errorPathFull`, a SHOULD: §7.1.6 says the path "should include the full path to the result field where the error was raised, even if that field is not present in the response");
- an error path names a position the operation doesn't select (`errorPath`);
- `errors` is an empty list;
- a leaf isn't the canonical value for its position's type;
- with `scalar-results`, an ID whose resolver returned the integer `4` is the number `4` instead of `"4"` (`idAsString`, a MUST, §3.5.5; a SHOULD in October 2021, whose ID "should always serialize as a String"), an Int whose resolver returned `2147483648` holds a value (`intRange`, a SHOULD, §3.5.1: "an execution error should be raised"), or either is null without an error (`coercionErrorReported`);
- a position whose resolver returned an `uncoercible` value holds a value instead of null (`intFraction` for a fraction at an Int, `resultCoercion` otherwise), or is null without an error at its path (`coercionErrorReported`). A silent null there is graded as `coercionErrorReported`, not as `nullsExplained`: it is a MUST since September 2025, and a SHOULD in October 2021, where the response can't tell a value coerced to null (a must) from a raised error left out (a should). The leaf check above skips these positions, so a value passed through counts once.

The trace comes first, whatever the response, so a call with the wrong type is a `protocol` problem even when the implementation then produced no response.

`intFraction` is a MUST. §3.5.1's rule is: "GraphQL services may coerce non-integer internal values to integers when reasonable without losing information, otherwise they must raise an execution error." Truncating 1.2 to 1 loses information. The sentence after it, "For example, a floating-point number 1.2 should raise an execution error instead of being truncated to 1", is an example, and Appendix A makes examples non-normative, so its should doesn't set the level. September 2025 and October 2021 have the same sentences. A truncating case is still checked by the reference, as below, so a failure elsewhere in the same case isn't hidden.

Each check's `level` is its level in September 2026, the edition the kit grades. Where an older release's wording gives another level, the check (and the report) has `levels`, such as `{ "September2025": "SHOULD", "October2021": "SHOULD" }` for `errorPathsUnique`; a release it leaves out has `level`. Every other check has the same level in September 2025 and October 2021. Each check's `basis` in [`kit/execution/checks.mjs`](../kit/execution/checks.mjs) quotes the sentences it rests on in each release, and why its level is the one it is. A level comes only from normative prose: examples are non-normative, and where the text's level is in doubt the kit takes the weaker one.

These are reported as SHOULDs, and fail only with `--strict`:
- `calledSerially` and `keyOrder` among the clauses above;
- an error path cut short where the error propagated to (`errorPathFull`, §7.1.6);
- extra entries in an error (`errorEntries`, §7.1.6);
- an error's `locations` that isn't a list of maps with positive integer `line` and `column` (`errorLocations`, §7.1.6, where the whole sentence about locations is a should);
- an execution error without `locations`, or with an empty list (`errorLocationsPresent`, §7.1.6: an error that "can be associated to a particular point in the requested GraphQL document ... should contain an entry with the key locations"). Every error the kit's resolvers cause is raised at a field;
- a location that isn't where the field the error was raised at begins (`errorLocationsAccurate`, §7.1.6: locations "describe the beginning of an associated syntax element"). For an error at the very path where an outcome raised it, the kit accepts the start of any of the field's nodes in the document it sent (several when selections merge, the list field for an error at a list item), or of the field's name after an alias;
- an Int outside 32 bits passed through (`intRange`, above);
- a leaf with the canonical value but the wrong JSON type, such as `"1"` for Int 1 (`leafEncoding`, §7.2.1: "the following JSON values should be used");
- for a [subscription stream](#subscription-streams), the stream completing for no cause (`streamEndsOnlyForCause`) or a result after the client cancelled (`nothingAfterCancel`).

These are INFO, and never fail a run: `callsOnce`, `callsSelected` and `callsReachable` (above), and `disabledPropagation` ([below](#error-propagation-off)).

The checks on [subscription streams](#subscription-streams) grade a stream's lifecycle case, and only those; every other check skips it. Each event's result in a stream is an ordinary case.

When no response had an `extensions` entry, the report's `extensions` check is `untested` with a note saying so: the entry is a may (§7.1.7), and graphql-js never writes one.

Each problem belongs to one check in [`kit/execution/checks.mjs`](../kit/execution/checks.mjs), which also lists the spec sections each check rests on. In a report, a malformed case counts against every check it breaks, once per check, however many times it breaks it, so one problem never hides another. The exception is a case where the adapter broke the protocol (`protocol`): the response comes from a run the adapter misreported, so only the problems of its trace count (`protocol`, `callsOnce`, `callsSelected`, `callsReachable`, `mutationFieldsOnce`). `adapterProblems` counts each case where the adapter broke the protocol. A warning counts under the level of its own case's fixture.

A malformed case still goes to the reference when what it breaks leaves the trace and `data` usable, and its clause failures count like any other case's:
- if the adapter broke the protocol, a position settled twice with different outcomes (so the response can't say which one it was built from), it has no response or no `data`, or `data` holds a position the operation doesn't select, the reference doesn't see it. Extra calls (`callsOnce`, `callsSelected`, `callsReachable`, `mutationFieldsOnce`) don't keep a case from the reference;
- if an error has no usable path (`errorPath`, `responsePosition`, `errorPathFull`, or an error that isn't a map), only the clauses that don't read error paths count: `complete`, `dataMatches`, `keyOrder` and `calledSerially`. So errors without a path don't hide `data` nulled past a nullable position;
- otherwise every clause counts. A position whose resolver returned an `uncoercible` value is given to the reference as the implementation completed it: as a leaf if it holds a value, as null if it is null without an error. So an Int fraction truncated to 1 doesn't hide a dropped error elsewhere in the case, and isn't counted a second time.

The summary line says how many distinct malformed cases also break the reference, and those failures are listed after the malformed groups.

Failures are grouped by fixture and clause, and each group is shown by its shortest case: its trace, the response, and the data the reference expected.

Every run also checks the checker. [`kit/execution/controls.json`](../kit/execution/controls.json) holds 31 known-good cases recorded from graphql-js, 50 broken variants of them, and 10 report controls. [`kit/execution/protocol-controls.mjs`](../kit/execution/protocol-controls.mjs) adds 10 bases and 27 controls (87 controls in all) for checks the recordings can't exercise, made at check time from the corpus's bases or written out: parent tokens (a field given the initial value instead of its parent's, a root field reporting no parent, a subscription's root field given the initial value instead of the event's), stream logs (a base for each kind of scenario, and a control for each lifecycle check, such as a stream that completes normally when its source fails), locations (left out, empty, on the wrong line, from a base whose locations are graphql-js's), a repeated key, and on a fixture of their own, a value a custom scalar rejects passed through or nulled without an error, an Int outside 32 bits passed through and an integer ID written as a number. A base made there must also not break the SHOULD checks its controls are caught by. Some examples:
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
- **`initialValue`**, and **`event`** for a subscription: with `parent-values`, the tokens the kit gave for the initial value and the event. A call then has **`parent`**, the token the adapter reported, and an object outcome a **`token`**.
- **`duplicateKeys`:** the keys the adapter's line repeated within one map of the response, each as its path, such as `[["data","a"]]` (`uniqueKeys`). Left out when there are none.
- **`stream`** instead of `response`, with `"trace": []`: a [subscription stream](#subscription-streams)'s lifecycle case, `{"scenario": "…", "log": [...]}`. The log has the kit's steps, `{"kit":"emit","event":1}`, `{"kit":"complete"}`, `{"kit":"fail","message":"…"}` and `{"kit":"cancel"}`, and the adapter's reports, `{"adapter":"response","event":1}` (`event` left out for a result the kit can't match to an event it was waiting on, which then has `"errors": true` if the result had errors), `{"adapter":"done"}`, `{"adapter":"stream-error","message":"…"}`, `{"adapter":"source-cancelled"}` and `{"adapter":"no-response","message":"…"}`, in order. Each event's result is a case of its own in the same file.
- **`noResponse`** instead of `response`: the implementation produced no response, with this message.
- **`v`:** the format version. The kit refuses versions it doesn't know.

## Limits

- **Fixtures:** the fixtures in [`fixtures/`](../fixtures) are small, and their ids won't change. A pass means no fixture, outcome combination or schedule tried found a response the spec forbids. It doesn't prove the implementation correct.
- **Without `idle`:** the kit may record a settle the engine never looked at before it responded. The response clauses stay sound, because `Valid` stays true as more resolvers settle after a response (`ExecutionConformance.tla` checks this as `ResponseStaysValid`). With `idle`, the kit replays a few runs before it starts and fails if their traces, data or error paths differ, since exhaustive runs depend on determinism. Error messages, order and extensions may differ.
- **Without `after` stamps:** `calledSerially` uses the order messages arrived in. It can catch a non-serial engine but can't prove a serial one, and the report says so.
- **Not covered by this area:**
  - `@defer`/`@stream`. Their models are checked against graphql-js only. Subscription streams beyond one event are only checked for adapters with `subscription-stream`; executions of events that overlap aren't tried, since the kit waits for each event's result before its next step.
  - CreateSourceEventStream (§6.2.3.1). The kit starts a subscription at its one event. The coerce area checks it instead, for adapters with `subscription-source`: the source stream's arguments, root-argument coercion, September 2026's request error for an error raised there, and (with `unvalidated`) the request error for a subscription that doesn't select exactly one root field ([coerce](kit/coerce.md)).
  - §2.2's rule, since September 2025, that descriptions in executable documents "MUST NOT affect the execution, validation, or response of a GraphQL document". The documents this area sends have no descriptions or comments; the coerce area's `descriptionsInert` checks it on requests with and without them ([coerce](kit/coerce.md)).
  - The locations of errors other than those the kit's resolvers raise at fields: the kit sends no document with an error elsewhere.
  - What an executor does when type resolution returns a type that isn't one of the abstract type's possible types. The spec doesn't say, so the kit doesn't send such an outcome (see [Outcomes](#outcomes)).
  - Parsing, validation, input coercion, schema validity and introspection are separate kit areas: see [Kit areas beyond execution](kit-areas.md).
