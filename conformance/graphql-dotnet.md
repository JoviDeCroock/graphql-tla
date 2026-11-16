# graphql-dotnet 8.8.5

Generated from the conformance kit's reports. Back to the [sheet](README.md).

**Notes** (hand-written, from outside the kit):

- The adapter uses graphql-dotnet's schema-first `Schema.For`, its default `DocumentExecuter` and the System.Text.Json serializer. List items are `IDataLoaderResult` values, the only kind of item graphql-dotnet waits for. `idle` holds because everything runs on one thread, the kit-driven subscription source stream included; the determinism replay passed.
- Execution: `resultCoercion`, because `FloatGraphType` passes a non-finite double through and `GraphQLSerializer` then throws, so the client gets no response; the `subscriptionAlias` fixture, which graphql-dotnet refuses at validation because its single-root-field rule counts selections rather than response names; and `errorLocationsPresent` (SHOULD), because a field selected twice is merged into a `GraphQLField` that can't hold a location. `coerce` isn't implemented for this adapter, and graphql-dotnet has no schema coordinate API, so neither area is claimed.
- `schema-extensions` is claimed, but `SchemaBuilder` applies only `extend type`, and drops every other kind of extension without an error, so the rules about them are not enforced. graphql-dotnet rejects the kit's full introspection queries: it has no `specifiedByURL`, input-value deprecation is behind an experimental flag that is off by default, and `isRepeatable` needs that kind of flag and is also hidden by the default schema filter. The kit then discovers which fields exist and grades the rest under the September 2025 profile. The default schema filter also hides every directive with a type system location from `__schema.directives`. Every finding is described with source locations in the [adapter's README](../adapters/graphql-dotnet/README.md#known-graphql-dotnet-deviations).

## Execution

- **Capabilities:** custom-directives, custom-scalar-results, deferred-items, idle, introspect, invalid-results, mutation, parent-values, parse, parse-sdl, scalar-results, schema, schema-extensions, subscription, subscription-stream, uncoercible-results, validate
- **Cases:** 30440 submitted, 6171 distinct, 1885 malformed
- **Adapter problems:** none
- **Checker self-test:** passed (87 negative controls)
- **Run:** kit 0625b35d64dd, 2026-11-16, strict, 1500 random runs per fixture (seed 1), exhaustive runs on

### Findings

<a id="execution-finding-1"></a>

#### 1. `errorLocationsPresent`: execution errors raised at a field have no locations

2690 cases, in `mutationRoot` (1048), `merging` (677), `ordering` (559), `fragments` (290), `abstract` (116).

- An execution error raised at a field has locations (SHOULD, [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors))

The shortest case, from `merging`:

```
problem:  execution errors raised at a field have no locations (§7.1.6: should)
trace:    call a; call b; settle a = error; settle b = null
response: {"errors":[{"message":"resolver call 1 failed","path":["a"]}],"data":{"a":null,"b":null}}
```

<a id="execution-finding-2"></a>

#### 2. `dataPresent`: the response has no data entry

1502 cases, in `subscriptionAlias` (1502).

- An execution result has a data entry (MUST, [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result))

The shortest case, from `subscriptionAlias`:

```
problem:  the response has no data entry (§7.1.1: execution started, so data must be present)
trace:    
response: {"errors":[{"message":"Anonymous Subscription must have exactly one root field and that field must not be an introspection field.","locations":[{"line":5,"column":3}],"extensions":{"code":"SINGLE_ROOT_FIELD_SUBSCRIPTIONS","codes":["SINGLE_ROOT_FIELD_SUBSCRIPTIONS"],"number":"5.2.3.1"}}]}
```

<a id="execution-finding-3"></a>

#### 3. `errorPath`: an execution error without a path

1502 cases, in `subscriptionAlias` (1502).

- Execution errors have a path to a position the operation selects (MUST, [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors))

The shortest case, from `subscriptionAlias`:

```
problem:  an execution error without a path: {"message":"Anonymous Subscription must have exactly one root field and that field must not be an introspection field.","locations":[{"line":5,"column":3}],"extensions":{"code":"SINGLE_ROOT_FIELD_SUBSCRIPTIONS","codes":["SINGLE_ROOT_FIELD_SUBSCRIPTIONS"],"number":"5.2.3.1"}}
trace:    
response: {"errors":[{"message":"Anonymous Subscription must have exactly one root field and that field must not be an introspection field.","locations":[{"line":5,"column":3}],"extensions":{"code":"SINGLE_ROOT_FIELD_SUBSCRIPTIONS","codes":["SINGLE_ROOT_FIELD_SUBSCRIPTIONS"],"number":"5.2.3.1"}}]}
```

<a id="execution-finding-4"></a>

#### 4. `resultCoercion`: the implementation produced no response, after a resolver returned a value its type can't represent: … threw ArgumentException: .NET number values such as positive and negative infinity cannot be written as valid JSON. To make it work when using 'JsonSerializer', consider specifying … (see …

365 cases, in `leaves` (365).

- A non-finite Float, an unknown enum value or a value a custom scalar rejects raises an execution error instead of being passed through (MUST, [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) [§3.5.2](https://spec.graphql.org/September2026/#sec-Float) [§3.9](https://spec.graphql.org/September2026/#sec-Enums) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion))

The shortest case, from `leaves`:

```
problem:  the implementation produced no response, after a resolver returned a value its type can't represent: "GraphQLSerializer.Serialize threw ArgumentException: .NET number values such as positive and negative infinity cannot be written as valid JSON. To make it work when using 'JsonSerializer', consider specifying 'JsonNumberHandling.AllowNamedFloatingPointLiterals' (see https://docs.microsoft.com/dotnet/api/system.text.json.serialization.jsonnumberhandling)."
trace:    call count; call ratio; call color; settle count = null; settle ratio = uncoercible; settle color = null
response: none: GraphQLSerializer.Serialize threw ArgumentException: .NET number values such as positive and negative infinity cannot be written as valid JSON. To make it work when using 'JsonSerializer', consider specifying 'JsonNumberHandling.AllowNamedFloatingPointLiterals' (see https://docs.microsoft.com/dotnet/api/system.text.json.serialization.jsonnumberhandling).
```

<a id="execution-finding-5"></a>

#### 5. `eventPerSourceEvent`: a result arrived for no source event

18 cases, in `subscriptionAlias` (18).

- Each source event yields one execution result on the response stream, before it completes (MUST, [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) [§7.1.2](https://spec.graphql.org/September2026/#sec-Response-Format.Response-Stream))

The shortest case, from `subscriptionAlias`:

```
problem:  a result arrived for no source event
trace:    
response: undefined
```

<a id="execution-finding-6"></a>

#### 6. `completesWithSource`: the source completed, and the response stream never completed

8 cases, in `subscriptionAlias` (8).

- When the source stream completes, the response stream completes normally (MUST, [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream))

The shortest case, from `subscriptionAlias`:

```
problem:  the source completed, and the response stream never completed
trace:    
response: undefined
```

<a id="execution-finding-7"></a>

#### 7. `cancelCompletes`: the client cancelled the response stream, which then never completed

6 cases, in `subscriptionAlias` (6).

- A cancelled response stream completes normally (MUST, [§6.2.3](https://spec.graphql.org/September2026/#sec-Subscription) [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) [§6.2.3.3](https://spec.graphql.org/September2026/#sec-Unsubscribe))

The shortest case, from `subscriptionAlias`:

```
problem:  the client cancelled the response stream, which then never completed
trace:    
response: undefined
```

<a id="execution-finding-8"></a>

#### 8. `cancelCancelsSource`: the client cancelled the response stream, and the source stream wasn't cancelled

6 cases, in `subscriptionAlias` (6).

- Cancelling the response stream cancels the source stream (MUST, [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) [§6.2.3.3](https://spec.graphql.org/September2026/#sec-Unsubscribe))

The shortest case, from `subscriptionAlias`:

```
problem:  the client cancelled the response stream, and the source stream wasn't cancelled
trace:    
response: undefined
```

<a id="execution-finding-9"></a>

#### 9. `failsWithSource`: the source failed, and the response stream never completed

4 cases, in `subscriptionAlias` (4).

- When the source stream fails, the response stream completes with an error (MUST, [§6.2.3](https://spec.graphql.org/September2026/#sec-Subscription) [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream))

The shortest case, from `subscriptionAlias`:

```
problem:  the source failed, and the response stream never completed
trace:    
response: undefined
```

### Every check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **(k since September 2025, j new in September 2026), (all …):** k of the n failing cases rely on grammar or rules introduced in September 2025, and j on ones introduced in September 2026; none of them is in the October 2021 edition. The symbol still gives the check's level.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it. **– needs `x`:** the adapter doesn't claim capability `x`, which the check needs.
- **n/a:** the adapter doesn't take part in this area, or its report predates the check.

| Check | Level | Spec | Result |
| --- | :---: | :---: | :---: |
| The response is sent only once execution is complete (`complete`) | MUST | [§6.3.1](https://spec.graphql.org/September2026/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/September2026/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/September2026/#sec-Data) | ✓ 6171 |
| data is the completed value: field collection, value completion and null propagation (`dataMatches`) | MUST | [§6.3.2](https://spec.graphql.org/September2026/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) | ✓ 6171 |
| Response keys are in collected field order (`keyOrder`) | SHOULD | [§7.2.2](https://spec.graphql.org/September2026/#sec-Serialized-Map-Ordering) | ✓ 6171 |
| Every error was raised, at the path where it was raised (`errorsWereRaised`) | MUST | [§7.1.4](https://spec.graphql.org/September2026/#sec-Response-Position) [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 6171 |
| No two errors share a response path (`errorPathsUnique`) | MUST (SHOULD in September 2025 and October 2021) | [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) | ✓ 6171 |
| Every error is inside a null in data (`errorsInsideNulls`) | MUST | [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 6171 |
| Every null an error caused comes with an error from one of its causes (`nullsExplained`) | MUST (SHOULD in October 2021) | [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) | ✓ 6171 |
| A mutation that ran its root fields serially reports every error its earlier root fields raised (`serialErrorsKept`) | MUST (SHOULD in October 2021) | [§6.3.4](https://spec.graphql.org/September2026/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) | ✓ 275 |
| A mutation's root fields execute one after another (`calledSerially`) | SHOULD | [§6.2.2](https://spec.graphql.org/September2026/#sec-Mutation) [§6.3.4](https://spec.graphql.org/September2026/#sec-Normal-and-Serial-Execution) | ✓ 275 |
| Each mutation root field the operation selects executes once, and no other mutation root field executes (`mutationFieldsOnce`) | MUST | [§6.2.2](https://spec.graphql.org/September2026/#sec-Mutation) [§6.3.2](https://spec.graphql.org/September2026/#sec-Field-Collection) [§6.3.4](https://spec.graphql.org/September2026/#sec-Normal-and-Serial-Execution) | ✓ 3550 |
| Each field is executed once, merged selections included (mutation root fields: mutationFieldsOnce) (`callsOnce`) | INFO | — | ✓ 30404 |
| Only fields the operation selects are executed (mutation root fields: mutationFieldsOnce) (`callsSelected`) | INFO | — | ✓ 30404 |
| A field executes only once its parent has a value that contains it (`callsReachable`) | INFO | — | ✓ 30404 |
| A request gets a response (`responds`) | MUST | [§7](https://spec.graphql.org/September2026/#sec-Response) | ✓ 30404 |
| A subscription event yields an execution result, even when its data is null (`eventYieldsResult`) | MUST | [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) [§7.1.2](https://spec.graphql.org/September2026/#sec-Response-Format.Response-Stream) | ✓ 3044 |
| Each source event yields one execution result on the response stream, before it completes (`eventPerSourceEvent`) | MUST | [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) [§7.1.2](https://spec.graphql.org/September2026/#sec-Response-Format.Response-Stream) | ✗ 18/36 |
| The response stream completes only when its source completes or fails, or it is cancelled (`streamEndsOnlyForCause`) | SHOULD | [§6.2.3](https://spec.graphql.org/September2026/#sec-Subscription) [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) | ✓ 36 |
| When the source stream completes, the response stream completes normally (`completesWithSource`) | MUST (SHOULD in October 2021) | [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) | ✗ 8/16 |
| When the source stream fails, the response stream completes with an error (`failsWithSource`) | MUST (since September 2025) | [§6.2.3](https://spec.graphql.org/September2026/#sec-Subscription) [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) | ✗ 4/8 |
| A cancelled response stream completes normally (`cancelCompletes`) | MUST (since September 2025) | [§6.2.3](https://spec.graphql.org/September2026/#sec-Subscription) [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) [§6.2.3.3](https://spec.graphql.org/September2026/#sec-Unsubscribe) | ✗ 6/12 |
| Cancelling the response stream cancels the source stream (`cancelCancelsSource`) | MUST (since September 2025) | [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) [§6.2.3.3](https://spec.graphql.org/September2026/#sec-Unsubscribe) | ✗ 6/12 |
| No result arrives after the client cancels the response stream (`nothingAfterCancel`) | MUST | [§6.2.3](https://spec.graphql.org/September2026/#sec-Subscription) [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) | ✓ 12 |
| data holds only positions the operation selects (`dataShape`) | MUST | [§6.3.3](https://spec.graphql.org/September2026/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/September2026/#sec-Data) | ✓ 22779 |
| A non-finite Float, an unknown enum value or a value a custom scalar rejects raises an execution error instead of being passed through (`resultCoercion`) | MUST | [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) [§3.5.2](https://spec.graphql.org/September2026/#sec-Float) [§3.9](https://spec.graphql.org/September2026/#sec-Enums) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) | ✗ 365/1112 |
| A fraction returned for an Int (1.2) raises an execution error instead of being truncated (`intFraction`) | MUST | [§3.5.1](https://spec.graphql.org/September2026/#sec-Int) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) | ✓ 316 |
| A position whose resolver returned a value its type can't represent isn't null without an error (`coercionErrorReported`) | MUST (SHOULD in October 2021) | [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) [§3.5.1](https://spec.graphql.org/September2026/#sec-Int) [§3.5.2](https://spec.graphql.org/September2026/#sec-Float) [§3.9](https://spec.graphql.org/September2026/#sec-Enums) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) | ✓ 1441 |
| An Int outside 32 bits returned by a resolver (2147483648) raises an execution error instead of being passed through (`intRange`) | SHOULD | [§3.5.1](https://spec.graphql.org/September2026/#sec-Int) | ✓ 267 |
| An ID whose resolver returned an integer (4) is serialized as a String ("4") (`idAsString`) | MUST (SHOULD in October 2021) | [§3.5.5](https://spec.graphql.org/September2026/#sec-ID) | ✓ 391 |
| Leaf values are the resolver's canonical value (Int 1, Float 1.5, Boolean true, an enum's first value, "v") (`leafValues`) | MUST | [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) | ✓ 22779 |
| Leaf values use the JSON type §7.2.1 gives their GraphQL type (a number for Int 1, not "1") (`leafEncoding`) | SHOULD | [§7.2.1](https://spec.graphql.org/September2026/#sec-JSON-Serialization) | ✓ 22779 |
| The execution result is a map (`resultMap`) | MUST | [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) | ✓ 30039 |
| An execution result has a data entry (`dataPresent`) | MUST | [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) | ✗ 1502/30039 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) | ✓ 30039 |
| The response has no entries besides data, errors and extensions (`additionalEntries`) | MUST | [§7.1.8](https://spec.graphql.org/September2026/#sec-Additional-Entries) | ✓ 30039 |
| extensions is a map (`extensions`). no response had an extensions entry, so there was nothing to grade (§7.1.7: the entry is a may) | MUST | [§7.1.7](https://spec.graphql.org/September2026/#sec-Extensions) | – |
| Errors are maps with a message, and extensions, if present, is a map (`errorFormat`) | MUST | [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 21984 |
| An error's locations, if present, is a list of maps with line and column, both positive integers (`errorLocations`) | SHOULD | [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 21135 |
| An execution error raised at a field has locations (`errorLocationsPresent`) | SHOULD | [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ! 2690/21984 |
| An execution error's locations point at the field it was raised at (`errorLocationsAccurate`) | SHOULD | [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 21135 |
| Execution errors have a path to a position the operation selects (`errorPath`) | MUST | [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✗ 1502/21984 |
| Paths are lists of response names (aliases, not field names) and integer list indices, none left out (`responsePosition`) | MUST (SHOULD in October 2021) | [§7.1.4](https://spec.graphql.org/September2026/#sec-Response-Position) | ✓ 21984 |
| An error that propagated to a nullable parent keeps the full path to where it was raised (`errorPathFull`) | SHOULD | [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 21984 |
| Errors have no entries besides message, locations, path and extensions (`errorEntries`) | SHOULD | [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 21984 |
| No map in the serialized response repeats a key (`uniqueKeys`) | MUST | [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) [§7.2.1](https://spec.graphql.org/September2026/#sec-JSON-Serialization) [Appendix B](https://spec.graphql.org/September2026/#sec-Appendix-Notation-Conventions) | ✓ 30039 |
| Each field's resolver is given its parent's value: the initial value at the root, a subscription event's value at its root (`parentValue`) | MUST | [§6.2.1](https://spec.graphql.org/September2026/#sec-Query) [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) [§6.3.3](https://spec.graphql.org/September2026/#sec-Executing-Collected-Fields) [§6.4.2](https://spec.graphql.org/September2026/#sec-Value-Resolution) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) | ✓ 30404 |
| The adapter follows the kit's protocol (call types, settles) (`protocol`) | ADAPTER | — | ✓ 30404 |
| With error propagation off, an error nulls the position where it happened (graphql-js 17's @experimental_disableErrorPropagation) (`disabledPropagation`) | INFO | — | – |

- **Basis for `complete`:** No sentence says to respond only once execution is complete; the algorithms do. ExecuteRootSelectionSet (§6.3.1) returns {data} once ExecuteCollectedFields has run, and §6.3.3 says "Execution will recursively resolve and complete the value of every entry in the collected fields map". §7.1.5 adds: "The response data is the result of accumulating the resolved result of all response positions during execution." Positions §6.3.3 lets an implementation cancel don't hold the response back. September 2025 has the same algorithms and sentences, and October 2021's algorithms are the same.
- **Basis for `dataMatches`:** When an error propagates to the root, §6.4.4 and §7.1.5 say data "should be null", in every release (October 2021: §6.4.4 and §7.1.1). The kit still requires null, because no other value conforms: the execution result must have a data entry (§7.1.1), {} or a partial map leaves out an entry ExecuteCollectedFields must produce (§6.3.3), and a map with null at the failed root field breaks that field's Non-Null type.
- **Basis for `keyOrder`:** §7.2.2: "Serialization formats which only represent unordered maps but where order is still implicit in the serialization's textual order (such as JSON) should preserve the order of requested fields textually." September 2025 and October 2021 say the same.
- **Basis for `errorsWereRaised`:** §7.1.6: an error that "can be associated to a particular field in the GraphQL result ... must contain an entry with the key {"path"} with a response path which describes the response position which raised the error"; §7.1.4: "When a response path is present on an error result, it identifies the response position which raised the error." September 2025 has both sentences. October 2021's §7.1.2: it "must contain an entry with the key path that details the path of the response field which experienced the error". A path that leaves out list indices counts against responsePosition instead, and one cut short at the nullable position the error propagated to against errorPathFull: both are paths to the raised error in the wrong form, not errors that weren't raised.
- **Basis for `errorPathsUnique`:** September 2026's §6.4.4: "That is, each error added to the errors list during execution must have a unique response path." September 2025's: "That is, only one error should be added to the errors list per response position." October 2021's: "That is, only one error should be added to the errors list per field." The must is new in September 2026 (graphql-spec#1183). All three say the errors list "must not be further affected" when a position is null because of an error already added. A response with two errors at one path doesn't say whether the second was added for a position the first had already nulled (which breaks that must) or raised on its own, so in September 2025 and October 2021 the kit takes the weaker reading, the should.
- **Basis for `errorsInsideNulls`:** §7.1.6: "When an execution error is raised at a given response position, then that response position must not be present within the response {"data"} entry (except {null})", and §6.4.4 propagates it to the nearest nullable parent. September 2025 has the same sentences. October 2021, §6.4.4: a field error "is handled as though the field returned {null}", and §6.3 (Errors and Non-Null Fields): the error "must propagate to this entire selection set, either resolving to {null} if allowed or further propagated to a parent field." An error whose position holds a value breaks these in every release.
- **Basis for `nullsExplained`:** September 2026's §6.4.4: "While these errors must be reported in the response", and twice "the error must be added to the {"errors"} list in the execution result"; §7.1.1: the errors entry "must be a non-empty list of execution error raised during operation execution"; §7.1.6: "the {"errors"} entry must include the error". September 2025 has the same musts (its §7.1.1: "must be a non-empty list of execution error raised during execution"). October 2021 has both words. Its §6.4.4 says twice that "the error must be added to the {"errors"} list in the response", but opens with "While these errors should be reported in the response", and its §7.1.2 says "If field errors were raised during execution, it should contain those errors" and "The errors entry should include all raised field errors." September 2025 made each of these a must. With the October 2021 level in doubt, the kit takes the weaker one there. (October 2021's §7.1 still says the response "must contain an entry with key errors" if any errors were raised, so a response with no errors entry at all breaks a must in every release; the check doesn't count that case apart.)
- **Basis for `serialErrorsKept`:** §6.4.4: an execution error "must be added to the errors list". §6.3.3 lets an implementation cancel fields that have not yet executed or yielded a value, but serial execution (§6.3.4) completes each mutation root field before the next starts, so an earlier root field's errors can't have been cancelled. That argument needs serial execution, which is only a SHOULD (calledSerially), so this check is graded only on cases whose trace passes calledSerially. September 2025 has the same sentences. October 2021: the level is in doubt as for nullsExplained ("must be added", but "should be reported", "should include all raised field errors"), so it is a SHOULD there.
- **Basis for `calledSerially`:** The one sentence that says whether a mutation's root selection set is executed serially is §6.2.2's, in every release: "This selection set should be executed serially." §6.3.4 adds, with no key word: "When executing a mutation, the selections in the top most selection set will be executed in serial order, starting with the first appearing field textually." Its musts ("When executing a collected fields map serially, the executor must consider each entry ... It must determine the corresponding entry in the result map for each item to completion before it continues on to the next entry") say what serial execution is, once a selection set is executed serially. The sentence that the root selection set "must be executed serially" is introduced by "For example", which Appendix A makes non-normative. ExecuteMutation passes "serial" unconditionally, but the prose about the same step says should, so the level is in doubt and the kit takes the weaker one. September 2025 and October 2021 (§6.2.2, §6.3.1) say the same.
- **Basis for `mutationFieldsOnce`:** §6.3.2 collects the root fields before execution: "This ensures that multiple references to fields with the same response name will only be executed once", and CollectFields leaves out fields @skip and @include exclude. Appendix A lets an implementation fulfil an algorithm "in any way as long as the perceived result is equivalent", and §6.3.4 says "the resolution of fields other than top-level mutation fields must always be side effect-free and idempotent", so for every other field an extra call isn't perceived (callsOnce, callsSelected and callsReachable are INFO). Top-level mutation fields are the exception: §6.2.2 expects them to "perform side-effects on the underlying data system", so running one twice, or one the operation doesn't select, is perceived. September 2025 and October 2021 (§6.2.2, §6.3.1, §6.3.2: "executed at the same time") say the same.
- **Basis for `callsOnce`:** §6.3.2: collecting fields "ensures that multiple references to fields with the same response name will only be executed once". That describes what the algorithm does, and Appendix A lets an implementation fulfil it "in any way as long as the perceived result is equivalent". §6.3.4: "the resolution of fields other than top-level mutation fields must always be side effect-free and idempotent", so calling such a field's resolver twice isn't perceived in the response, which the reference still grades whenever both calls settled to the same outcome. Recorded, never a failure. A mutation root field called twice is mutationFieldsOnce, a MUST.
- **Basis for `callsSelected`:** CollectFields (§6.3.2) leaves out fields that @skip, @include or a fragment's type condition exclude, so the algorithm never executes them. As for callsOnce, Appendix A's "perceived result is equivalent" and §6.3.4's side-effect-free fields mean an extra call below the mutation root isn't perceived; the reference still grades the response. A mutation root field the operation doesn't select is mutationFieldsOnce, a MUST.
- **Basis for `callsReachable`:** CompleteValue (§6.4.3) executes subfields only for an object value, and list items only for the items of a list. The example in §6.3.4 that says "of course `birthday` must be resolved before `month`" is non-normative (Appendix A). A call under a parent that settled null, or past a list's length, isn't perceived in the response for side-effect-free fields (§6.3.4, Appendix A), and the reference still grades the response.
- **Basis for `responds`:** §7: "When a GraphQL service receives a request, it must return a well-formed response." September 2025 and October 2021 say the same.
- **Basis for `eventYieldsResult`:** §7.1.2: "A response stream must be a stream of execution result", and §7.1.1: "for each event in a subscription's source stream, the response stream will emit an execution result." MapSourceToResponseEvent (§6.2.3.2) completes the response stream with an error only if "internal {error} was raised", and its Note says the only such errors "are internal exceptional errors not described by this specification": execution errors are handled by ExecuteSubscriptionEvent. September 2025 has the same sentences and Note. October 2021's MapSourceToResponseEvent yields an event containing the result for each source event, and §7 requires "a well-formed response".
- **Basis for `eventPerSourceEvent`:** MapSourceToResponseEvent (§6.2.3.2): "When {sourceStream} emits {sourceValue}: Let {executionResult} be the result of running {ExecuteSubscriptionEvent(...)} ... Otherwise emit {executionResult} on {responseStream}", and the response stream completes only after that, when the source completes, fails or the stream is cancelled. §7.1.2: "A response stream must be a stream of execution result", and §6.2.3: "each event in the event stream is the result of executing the operation's root selection set for each new event on an underlying source stream". Algorithm steps have the algorithm's level (Appendix A). The only other way out is an internal error, which the Note after the algorithm says is "not described by this specification": the kit's resolvers raise execution errors, which ExecuteSubscriptionEvent handles. So an event emitted while the stream is open that yields no result before the stream completes, a result for no event, or a result after the stream completed, fails here. An event still executing when the kit cancels the stream isn't counted (nothingAfterCancel), nor is a result that arrives after the source failed, before the stream completed: it answers the failure, and failsWithSource grades it. September 2025 says the same; October 2021's MapSourceToResponseEvent says "For each {event} on {sourceStream}: ... Yield an event containing {response}".
- **Basis for `streamEndsOnlyForCause`:** MapSourceToResponseEvent (§6.2.3.2) completes {responseStream} when the source completes normally or with an error, when it is cancelled, and on an internal error, which its Note says is "not described by this specification". But §6.2.3 says of event streams in general, which a response stream is: "An event stream may complete at any point, often because no further events will occur", and "Internal user code also may cancel an event stream for any reason, which would be observed as that event stream completing." With the level in doubt the kit takes the weaker one. A stream that completes instead of yielding an event's result fails eventPerSourceEvent, a MUST, instead. September 2025 says the same; October 2021: "Event streams may produce an infinite sequence of events or may complete at any point."
- **Basis for `completesWithSource`:** MapSourceToResponseEvent (§6.2.3.2): "When {sourceStream} completes normally: Complete {responseStream} normally." Algorithm steps have the algorithm's level (Appendix A). A response stream that completes with an error, or doesn't complete once every event has its result, fails. September 2025 says the same. October 2021's step reads "When {responseStream} completes: complete this event stream", which names the response stream where the source is meant; with its level in doubt the kit takes the weaker one there.
- **Basis for `failsWithSource`:** §6.2.3 (Event Streams): "If an event stream encounters an error, it must complete with that error." MapSourceToResponseEvent (§6.2.3.2): "When {sourceStream} completes with {error}: Complete {responseStream} with {error}." A response stream that completes normally, or doesn't complete, fails. The kit doesn't compare error messages: an implementation may wrap the source's error. A stream whose last item after the source failed is a result with errors, followed by normal completion, passes: that is how an implementation whose streams can't end with an error (a stream of results, as in Rust) ends one with an error. The text doesn't say how "complete with that error" appears to a client: §6.2.3 says "GraphQL specifies algorithms for ... the closing of that stream", but leaves "serialization format or transport mechanism" to the service (Delivery Agnostic). §7.1.2's "A response stream must be a stream of execution result" argues against an error-only item, but with the text in doubt the kit takes the weaker reading. A result without errors there, then normal completion, fails. New in September 2025; October 2021 says only "Event streams may complete in response to an error".
- **Basis for `cancelCompletes`:** §6.2.3 (Event Streams): "When an event stream is cancelled, it must complete." MapSourceToResponseEvent (§6.2.3.2): "When {responseStream} is cancelled: Cancel {sourceStream}. Complete {responseStream} normally." Unsubscribe (§6.2.3.3): "Cancel {responseStream}." A response stream that completes with an error after the client cancelled it, or doesn't complete, fails. New in September 2025; October 2021 says only that after cancelling, an observer "must receive no more events from that event stream" (nothingAfterCancel).
- **Basis for `cancelCancelsSource`:** MapSourceToResponseEvent (§6.2.3.2): "When {responseStream} is cancelled: Cancel {sourceStream}." §6.2.3.3: "Unsubscribe cancels the response stream when a client no longer wishes to receive payloads for a subscription. This in turn also cancels the Source Stream". Algorithm steps have the algorithm's level (Appendix A). The adapter reports the source being cancelled (`source-cancelled`); a cancelled stream whose source never is fails. September 2025 says the same. October 2021: "This may in turn also cancel the Source Stream", a may.
- **Basis for `nothingAfterCancel`:** §6.2.3 (Event Streams): "An observer may at any point decide to stop observing an event stream by cancelling it. When an event stream is cancelled, it must complete." MapSourceToResponseEvent (§6.2.3.2): "When {responseStream} is cancelled: Cancel {sourceStream}. Complete {responseStream} normally." A completed stream emits nothing more, so a result for an event whose ExecuteSubscriptionEvent was still running when the client cancelled must not be emitted: the algorithm's step "emit {executionResult} on {responseStream}" comes after the stream completed. October 2021's §6.2.3 said so outright: "An observer may at any point decide to stop observing an event stream by cancelling it, after which it must receive no more events from that event stream." September 2025 dropped that sentence in graphql/graphql-spec#1099, "Editorial changes for Event Streams", which its description calls a rewrite of the Event Streams definition "to be more clear", so the kit reads the requirement as unchanged: a MUST in every release. The kit's scenario cancels the stream while an event's resolvers are pending, then settles them; a result for that event after the cancel fails here (graphql-js 16 and 17 deliver it, then complete).
- **Basis for `dataShape`:** ExecuteCollectedFields (§6.3.3) sets an entry in the result map only for each entry of the collected fields map, and §7.1.5 says "The response data is the result of accumulating the resolved result of all response positions during execution." A value at a position the operation doesn't select isn't the completed value, as for dataMatches. September 2025 has the same algorithm and sentence, and October 2021's algorithms are the same.
- **Basis for `resultCoercion`:** §3.5.2: "Non-finite floating-point internal values ({NaN} and {Infinity}) cannot be coerced to {Float} and must raise an execution error." §3.5, for every scalar, custom ones included: a service "must uphold the contract the scalar type describes, either by coercing the value or producing an execution error if a value cannot be coerced" (custom scalars with custom-scalar-results, whose resolver returns a value the scalar's result coercion rejects). §3.9: "GraphQL services must return one of the defined set of possible values. If a reasonable coercion is not possible they must raise an execution error." CoerceResult (§6.4.3): the internal method "must return a valid value for the type and not {null}. Otherwise raise an execution error." September 2025 says the same, and October 2021 too, with "field error". A value passed through fails here, as does no response at all after such a value, whose root cause it is. A null without an error is coercionErrorReported.
- **Basis for `intFraction`:** §3.5.1: "GraphQL services may coerce non-integer internal values to integers when reasonable without losing information, otherwise they must raise an execution error." Truncating 1.2 to 1 loses information, so the must applies. The sentence after it, "For example, a floating-point number 1.2 should raise an execution error instead of being truncated to 1", is an example, which Appendix A makes non-normative, so its should doesn't set the level. September 2025 has the same sentences, and October 2021 too, with "field error". A value passed through fails here, as does no response at all after such a value. A null without an error is coercionErrorReported.
- **Basis for `coercionErrorReported`:** Such a value "must raise an execution error" (§3.5.1, §3.5.2, §3.9), CoerceResult's internal method "must return a valid value for the type and not {null}" (§6.4.3), and §6.4.4 says the error "must be added to the {"errors"} list" and opens "While these errors must be reported in the response". A null without an error at its path breaks one of these, in September 2026 and September 2025 alike, whichever the service did: coerced the value to null, or raised the error and left it out. October 2021 keeps the musts on raising, but says raised field errors "should be reported" and "should include all raised field errors" (see nullsExplained). The response can't tell the two apart, so the kit takes the weaker reading there: a SHOULD.
- **Basis for `intRange`:** §3.5.1: "If the integer internal value represents a value less than -2^31 or greater than or equal to 2^31, an execution error should be raised." September 2025 says the same, and October 2021 too, with "a field error". Graded only for adapters with scalar-results, in fixtures with invalid results. A null without an error is coercionErrorReported.
- **Basis for `idAsString`:** §3.5.5: "The ID type is serialized in the same way as a String; however, it is not intended to be human-readable. While it is often numeric, it must always serialize as a String." Its Result Coercion lets a service raise an execution error when "coercion is not possible", which also passes. September 2025 says the same. October 2021: "it should always serialize as a String". Graded only for adapters with scalar-results, in fixtures with invalid results.
- **Basis for `leafValues`:** CompleteValue returns {CoerceResult(fieldType, result)} for a leaf (§6.4.3), and the kit's resolvers return a value that is already valid for the type. §3.5 lets a service coerce internal values only "when reasonable without losing information", so a valid value coerces to itself. September 2025 and October 2021 say the same.
- **Basis for `leafEncoding`:** §7.2.1: "When using JSON as a serialization of GraphQL responses, the following JSON values should be used to encode the related GraphQL values". §7.2 lets "a string or simpler primitive ... be used as a substitute" when a format lacks one. September 2025 and October 2021 say the same.
- **Basis for `resultMap`:** §7.1.1: "An execution result must be a map." September 2025 says the same. October 2021's §7.1: "A response to a GraphQL request must be a map."
- **Basis for `dataPresent`:** §7.1.1: "The execution result must contain an entry with key {"data"}." September 2025 says the same. October 2021's §7.1: "If the request included execution, the response map must contain an entry with key data", and §7.1.2: "The data entry in the response must be present."
- **Basis for `errorsList`:** September 2026's §7.1.1: "If any errors are raised during operation execution, the execution result must contain an entry with key {"errors"}. The value of this entry must be a non-empty list ... If the request completed without raising any errors, this entry must not be present." September 2025's opens "If execution raised any errors" and has the same musts. October 2021's §7.1: "If the request raised any errors, the response map must contain an entry with key errors. ... If the request completed without raising any errors, this entry must not be present." Its §7.1.2 also says "should not be present", but the §7.1 must is the sentence about the entry, so the check is a MUST in every release, as in coerce.
- **Basis for `additionalEntries`:** §7.1.8: "the execution result and request error result maps must not contain any entries other than those described above." September 2025 says the same. October 2021's §7.1: "the top level response map must not contain any entries other than the three described above."
- **Basis for `extensions`:** §7.1.7: "The {"extensions"} entry in an execution result or request error result, if set, must have a map as its value." September 2025 says the same. October 2021's §7.1: "This entry, if set, must have a map as its value."
- **Basis for `errorFormat`:** §7.1.1: "Each error must be a map"; §7.1.6: "Every error must contain an entry with the key {"message"} with a string description of the error", and an error's extensions entry, "if set, must have a map as its value." September 2025 says the same. October 2021's §7.1.2 says each error "is a map", and has the same musts on message and extensions.
- **Basis for `errorLocations`:** §7.1.6: "it should contain an entry with the key {"locations"} with a list of locations, where each location is a map with the keys {"line"} and {"column"}, both positive numbers starting from `1`". The whole sentence, shape included, is a should. September 2025 and October 2021 (§7.1.2) say the same.
- **Basis for `errorLocationsPresent`:** §7.1.6: "If an error can be associated to a particular point in the requested GraphQL document, it should contain an entry with the key {"locations"} with a list of locations". Every error the kit's resolvers cause is raised at a field, or a list item of a field, of the document the kit sent. An error without locations, or with an empty list, fails. September 2025 and October 2021 (§7.1.2) say the same.
- **Basis for `errorLocationsAccurate`:** §7.1.6: each location is a map with the keys line and column, "both positive numbers starting from `1` which describe the beginning of an associated syntax element". For an error raised at a field, or at an item of a list field, the associated element is that field's selection in the document the kit sent: the kit accepts the start of any of its field nodes (several when selections merge), or the start of the field's name after an alias. A location elsewhere fails. Locations are only compared for errors whose path is where the kit's outcome raised the error. The whole sentence is a should. September 2025 and October 2021 (§7.1.2) say the same.
- **Basis for `errorPath`:** §7.1.6: an error that "can be associated to a particular field in the GraphQL result ... must contain an entry with the key {"path"} with a response path which describes the response position which raised the error". Every error the kit's resolvers cause is raised at a field or list item. A path to a position the operation doesn't select describes no response position. September 2025 has the same sentence, and October 2021's §7.1.2 the same must ("must contain an entry with the key path that details the path of the response field which experienced the error").
- **Basis for `responsePosition`:** §7.1.4: "The value for a response path must be a list of path segments", "path segments that represent list indices must be 0-indexed integers", and an aliased field "must use the aliased name". A path that is a raised error's path with its list indices left out (`["tags"]` for an error at `tags.0`) breaks the first two. September 2025's §7.1.4 has the same musts; they came with its new Response Position section (graphql-spec#1073). October 2021 has no such section: its §7.1.2 says each of these with should: "This field should be a list of path segments starting at the root of the response and ending with the field associated with the error", list indices "should be 0-indexed integers", "the path to the error should use the aliased name".
- **Basis for `errorPathFull`:** §7.1.6, in every release (October 2021: §7.1.2): "If the field which experienced an error was declared as `Non-Null`, the `null` result will bubble up to the next nullable field. In that case, the `path` for the error should include the full path to the result field where the error was raised, even if that field is not present in the response." The general sentence before it says the path "must" describe the position which raised the error, but the sentence about this very case says should, so the level is in doubt and the kit takes the weaker one. A path that stops at a position the error propagated to, above where it was raised, fails here.
- **Basis for `errorEntries`:** §7.1.6: "GraphQL services should not provide any additional entries to the error format", and its Note: "While non-specified entries are not violations, they are still discouraged." September 2025 and October 2021 (§7.1.2) say the same.
- **Basis for `uniqueKeys`:** §7.1.1: "An execution result must be a map", and Appendix B defines a map: "Each entry has a unique key". Data is built of maps too (ExecuteCollectedFields, §6.3.3, sets one entry per response name), as is each error. §7.2.1 serializes a map as a JSON object; a JSON object that repeats a name, which JSON.parse silently reduces to the last one, describes no map with unique keys. The kit reads the adapter's raw line for this. September 2025 says the same; October 2021's §7.1 says "A response to a GraphQL request must be a map", and its Appendix A defines no map, so the rule rests there on JSON objects meaning maps.
- **Basis for `parentValue`:** ResolveFieldValue (§6.4.2): "Return the result of calling {resolver}, providing {objectValue} and {argumentValues}". ExecuteCollectedFields (§6.3.3) passes its {objectValue} to ExecuteField for every field; CompleteValue (§6.4.3) runs an object's subfields with {result}, the resolved value, as theirs; ExecuteRootSelectionSet passes the {initialValue} (§6.2.1: "An initial value may be provided when executing a query operation"), and §6.2.3.2: "Each event from the underlying source stream triggers execution of the subscription selection set using that event's value as the {initialValue}". Algorithm steps have the algorithm's level (Appendix A). Graded only for adapters with parent-values: the kit names each object its outcomes stand for, and each call reports the one its resolver got. September 2025 and October 2021 have the same algorithms.
- **Basis for `protocol`:** Not a spec rule: the kit's protocol with the adapter (docs/conformance.md). A case where the adapter broke it says nothing reliable about the implementation.
- **Basis for `disabledPropagation`:** Not a GraphQL rule: no release (October 2021, September 2025, September 2026) has execution without error propagation. §6.4.4 says: "Since Non-Null response positions cannot be null, execution errors are propagated to be handled by the parent response position." Every failure of the noPropagation fixture's response (its data and errors) counts here, never against a spec section, and never fails the run. Turning propagation off doesn't change which resolvers run, so protocol problems and the checks on calls (callsOnce, callsSelected, callsReachable, mutationFieldsOnce, calledSerially) keep their own checks.

### Fixtures

| Fixture | Result | Note |
| --- | :---: | :---: |
| [`abstract`](../fixtures/abstract.graphql) | ! 116/1730 |  |
| [`aliases`](../fixtures/aliases.graphql) | ✓ 1720 |  |
| [`directives_kept`](../fixtures/directives_kept.graphql) | ✓ 1662 |  |
| [`directives_skipped`](../fixtures/directives_skipped.graphql) | ✓ 1506 |  |
| [`directives_excluded`](../fixtures/directives_excluded.graphql) | ✓ 1506 |  |
| [`directives_dropped`](../fixtures/directives_dropped.graphql) | ✓ 1502 |  |
| [`fragments`](../fixtures/fragments.graphql) | ! 290/1576 |  |
| [`leaves`](../fixtures/leaves.graphql) | ✗ 365/1740 |  |
| [`lists`](../fixtures/lists.graphql) | ✓ 2490 |  |
| [`merging`](../fixtures/merging.graphql) | ! 677/1566 |  |
| [`mutation`](../fixtures/mutation.graphql) | ✓ 1750 |  |
| [`mutationRoot`](../fixtures/mutationRoot.graphql) | ! 1048/1800 |  |
| [`noPropagation`](../fixtures/noPropagation.graphql) | – | needs error-propagation-off |
| [`nullPropagation`](../fixtures/nullPropagation.graphql) | ✓ 1782 |  |
| [`ordering`](../fixtures/ordering.graphql) | ! 559/1662 |  |
| [`scalars`](../fixtures/scalars.graphql) | ✓ 1532 |  |
| [`subscription`](../fixtures/subscription.graphql) | ✓ 1560 |  |
| [`subscriptionAlias`](../fixtures/subscriptionAlias.graphql) | ✗ 1520/1520 |  |
| [`unions`](../fixtures/unions.graphql) | ✓ 1836 |  |

## Parse

- **Capabilities:** custom-directives, custom-scalar-results, deferred-items, idle, introspect, invalid-results, mutation, parent-values, parse, parse-sdl, scalar-results, schema, schema-extensions, subscription, subscription-stream, uncoercible-results, validate
- **Cases:** 2832 submitted, 2804 distinct, 0 malformed
- **Vectors:** 2832 of 2847 graded (not graded: 15 unsupported by the adapter)
- **Vectors relying on rules after October 2021:** since September 2025, 112 of 127 vectors failing; new in September 2026, 31 of 31 vectors failing
- **Adapter problems:** none
- **Checker self-test:** passed (10 negative controls)
- **Run:** kit 0625b35d64dd, 2026-11-16, strict

### Findings

<a id="parse-finding-1"></a>

#### 1. `descriptions`: rejects what §2.2 Descriptions accepts

85 cases, in `random-documents` (80), `parser-examples` (3), `variable-definitions` (1), `grammar-examples` (1). All rely on grammar or rules introduced in September 2025, not in October 2021.

- Descriptions on operations, fragments and variables, not on the query shorthand (MUST, [§2.2](https://spec.graphql.org/September2026/#sec-Descriptions))

The shortest case, from `parser-examples`:

```
input:    [since September 2025] "\"d\" query {a}"
response: {"ok":false,"error":"Error parsing query: Unexpected String \"d\""}
expected: {"ok":true}
```

<a id="parse-finding-2"></a>

#### 2. `directiveExtension`: rejects what §3.13.6 Directive Extensions accepts

14 cases, in `type-system-documents` (9), `grammar-examples` (4), `extensions` (1). All rely on grammar or rules introduced in September 2026, not in October 2021.

- Directive extensions add directives (MUST, [§3.13.6](https://spec.graphql.org/September2026/#sec-Directive-Extensions))

The shortest case, from `extensions`:

```
input:    [since September 2026] "extend directive @d @d"
sibling:  "extend directive @d T", which the reference rejects
response: {"ok":false,"error":"Syntax Error GraphQL (1:8) Expected \"schema/scalar/type/interface/union/enum/input\", found Name \"directive\"\n1: extend directive @d @d\n          ^\n"}
expected: {"ok":true}
```

<a id="parse-finding-3"></a>

#### 3. `sourceText`: rejects what §2.1 Source Text accepts

12 cases, in `raw-characters` (12). All rely on grammar or rules introduced in September 2025, not in October 2021.

- Source text is a sequence of SourceCharacter (MUST, [§2.1](https://spec.graphql.org/September2026/#sec-Language.Source-Text))

The shortest case, from `raw-characters`:

```
input:    [since September 2025] "{a(x: \"\u0000\")}"
sibling:  "{a(x: \u0000)}", which the reference rejects
response: {"ok":false,"error":"Error parsing query: Invalid character within String: \\u0000."}
expected: {"ok":true}
```

<a id="parse-finding-4"></a>

#### 4. `selectionSets`: rejects what §2.5 Selection Sets accepts

11 cases, in `random-documents` (4), `parser-examples` (3), `type-system-documents` (2), `field-suffixes` (1), `grammar-examples` (1). All rely on grammar or rules introduced in September 2026, not in October 2021.

- Selection sets, including empty ones (MUST, [§2.5](https://spec.graphql.org/September2026/#sec-Selection-Sets))

The shortest case, from `parser-examples`:

```
input:    [since September 2026] "{}"
response: {"ok":false,"error":"Error parsing query: Expected Name, found }; for more information see http://spec.graphql.org/October2021/#Field"}
expected: {"ok":true}
```

<a id="parse-finding-5"></a>

#### 5. `stringValue`: accepts what §2.10.4 String Value rejects

9 cases, in `lexer-examples` (6), `strings` (3). All rely on grammar or rules introduced in September 2025, not in October 2021.

- String values and block strings (MUST, [§2.10.4](https://spec.graphql.org/September2026/#sec-String-Value))

The shortest case, from `lexer-examples`:

```
input:    [since September 2025] "{a(x: \"\\uD83D\")}"
sibling:  "{a(x: \"\")}", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-6"></a>

#### 6. `intValue`: accepts what §2.10.1 Int Value rejects

8 cases, in `numbers` (5), `lexer-examples` (3).

- Int values (MUST, [§2.10.1](https://spec.graphql.org/September2026/#sec-Int-Value))

The shortest case, from `lexer-examples`:

```
input:    "{a(x: [1_])}"
sibling:  "{a(x: [_])}", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-7"></a>

#### 7. `stringValue`: rejects what §2.10.4 String Value accepts

6 cases, in `strings` (4), `lexer-examples` (2). All rely on grammar or rules introduced in September 2025, not in October 2021.

- String values and block strings (MUST, [§2.10.4](https://spec.graphql.org/September2026/#sec-String-Value))

The shortest case, from `strings`:

```
input:    [since September 2025] "{a(x: \"\\u{1F600}\")}"
response: {"ok":false,"error":"Error parsing query: Invalid character escape sequence: \\u{1F6."}
expected: {"ok":true}
```

<a id="parse-finding-8"></a>

#### 8. `directiveDefinition`: rejects what §3.13 Directives accepts

6 cases, in `grammar-examples` (3), `directive-definitions` (3). All rely on grammar or rules introduced in September 2026, not in October 2021.

- Directive definitions and their locations (MUST, [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))

The shortest case, from `grammar-examples`:

```
input:    [since September 2026] "directive @d @x on FIELD"
response: {"ok":false,"error":"Syntax Error GraphQL (1:14) Expected \"on\", found @\n1: directive @d @x on FIELD\n                ^\n"}
expected: {"ok":true}
```

<a id="parse-finding-9"></a>

#### 9. `document`: accepts what §2.3 Document rejects

4 cases, in `parser-examples` (2), `byte-order-marks` (1), `grammar-examples` (1).

- A document is one or more definitions of the kinds its grammar allows (MUST, [§2.3](https://spec.graphql.org/September2026/#sec-Document))

The shortest case, from `grammar-examples`:

```
input:    ""
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-10"></a>

#### 10. `inputValues`: accepts what §2.10 Input Values rejects

3 cases, in `grammar-examples` (3).

- Input values, and no variables in constant values (MUST, [§2.10](https://spec.graphql.org/September2026/#sec-Input-Values))

The shortest case, from `grammar-examples`:

```
input:    "scalar S @d(a: $v)"
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-11"></a>

#### 11. `typeSystemDocuments`: accepts what §3.1 Type System Extensions rejects

3 cases, in `grammar-examples` (3).

- Type system documents hold type system definitions, and extension documents extensions too (MUST, [§3.1](https://spec.graphql.org/September2026/#sec-Type-System-Extensions))

The shortest case, from `grammar-examples`:

```
input:    ""
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-12"></a>

#### 12. `variables`: accepts what §2.11 Variables rejects

1 case, in `parser-examples` (1).

- Variables and variable definitions (MUST, [§2.11](https://spec.graphql.org/September2026/#sec-Language.Variables))

The shortest case, from `parser-examples`:

```
input:    "query ($a: Int @d(x: $b)) {a}"
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-13"></a>

#### 13. `comments`: accepts what §2.1.3 Comments rejects

1 case, in `byte-order-marks` (1).

- A comment runs to the end of its line (MUST, [§2.1.3](https://spec.graphql.org/September2026/#sec-Comments))

The shortest case, from `byte-order-marks`:

```
input:    "﻿#{a}"
response: {"ok":true}
expected: {"ok":false}
```

### Every check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **(k since September 2025, j new in September 2026), (all …):** k of the n failing cases rely on grammar or rules introduced in September 2025, and j on ones introduced in September 2026; none of them is in the October 2021 edition. The symbol still gives the check's level.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it. **– needs `x`:** the adapter doesn't claim capability `x`, which the check needs.
- **n/a:** the adapter doesn't take part in this area, or its report predates the check.

| Check | Level | Spec | Result |
| --- | :---: | :---: | :---: |
| Source text is a sequence of SourceCharacter (`sourceText`) | MUST | [§2.1](https://spec.graphql.org/September2026/#sec-Language.Source-Text) | ✗ 12/76 (all since September 2025) |
| White space is tab and space only (`whiteSpace`) | MUST | [§2.1.1](https://spec.graphql.org/September2026/#sec-White-Space) | ✓ 27 |
| Line terminators are LF, CR and CR LF only (`lineTerminators`) | MUST | [§2.1.2](https://spec.graphql.org/September2026/#sec-Line-Terminators) | ✓ 31 |
| A comment runs to the end of its line (`comments`) | MUST | [§2.1.3](https://spec.graphql.org/September2026/#sec-Comments) | ✗ 1/46 |
| Commas are insignificant (`insignificantCommas`) | MUST | [§2.1.4](https://spec.graphql.org/September2026/#sec-Insignificant-Commas) | ✓ 14 |
| Every character outside ignored tokens is part of a token (`lexicalTokens`) | MUST | [§2.1.5](https://spec.graphql.org/September2026/#sec-Language.Source-Text.Lexical-Tokens) | ✓ 61 |
| Ignored tokens may appear before and after every token (`ignoredTokens`) | MUST | [§2.1.6](https://spec.graphql.org/September2026/#sec-Language.Source-Text.Ignored-Tokens) | ✓ 425 |
| Punctuators, and `...` only as a whole (`punctuators`) | MUST | [§2.1.7](https://spec.graphql.org/September2026/#sec-Punctuators) | ✓ 40 |
| Names (`names`) | MUST | [§2.1.8](https://spec.graphql.org/September2026/#sec-Names) | ✓ 15 |
| Descriptions on operations, fragments and variables, not on the query shorthand (`descriptions`) | MUST | [§2.2](https://spec.graphql.org/September2026/#sec-Descriptions) | ✗ 85/122 (all since September 2025) |
| A document is one or more definitions of the kinds its grammar allows (`document`) | MUST | [§2.3](https://spec.graphql.org/September2026/#sec-Document) | ✗ 4/127 |
| Operation definitions and the query shorthand (`operations`) | MUST | [§2.4](https://spec.graphql.org/September2026/#sec-Language.Operations) | ✓ 114 |
| Selection sets, including empty ones (`selectionSets`) | MUST | [§2.5](https://spec.graphql.org/September2026/#sec-Selection-Sets) | ✗ 11/109 (all new in September 2026) |
| Fields (`fields`) | MUST | [§2.6](https://spec.graphql.org/September2026/#sec-Language.Fields) | ✓ 97 |
| Arguments (`arguments`) | MUST | [§2.7](https://spec.graphql.org/September2026/#sec-Language.Arguments) | ✓ 123 |
| Field aliases (`fieldAlias`) | MUST | [§2.8](https://spec.graphql.org/September2026/#sec-Field-Alias) | ✓ 94 |
| Fragment definitions and fragment spreads (`fragments`) | MUST | [§2.9](https://spec.graphql.org/September2026/#sec-Language.Fragments) | ✓ 129 |
| Type conditions (`typeConditions`) | MUST | [§2.9.1](https://spec.graphql.org/September2026/#sec-Type-Conditions) | ✓ 123 |
| Inline fragments (`inlineFragments`) | MUST | [§2.9.2](https://spec.graphql.org/September2026/#sec-Inline-Fragments) | ✓ 101 |
| Input values, and no variables in constant values (`inputValues`) | MUST | [§2.10](https://spec.graphql.org/September2026/#sec-Input-Values) | ✗ 3/144 |
| Int values (`intValue`) | MUST | [§2.10.1](https://spec.graphql.org/September2026/#sec-Int-Value) | ✗ 8/47 |
| Float values (`floatValue`) | MUST | [§2.10.2](https://spec.graphql.org/September2026/#sec-Float-Value) | ✓ 36 |
| Boolean values (`booleanValue`) | MUST | [§2.10.3](https://spec.graphql.org/September2026/#sec-Boolean-Value) | ✓ 6 |
| String values and block strings (`stringValue`) | MUST | [§2.10.4](https://spec.graphql.org/September2026/#sec-String-Value) | ✗ 15/195 (all since September 2025) |
| Null value (`nullValue`) | MUST | [§2.10.5](https://spec.graphql.org/September2026/#sec-Null-Value) | ✓ 4 |
| Enum values (`enumValue`) | MUST | [§2.10.6](https://spec.graphql.org/September2026/#sec-Enum-Value) | ✓ 39 |
| List values (`listValue`) | MUST | [§2.10.7](https://spec.graphql.org/September2026/#sec-List-Value) | ✓ 115 |
| Input object values (`inputObjectValues`) | MUST | [§2.10.8](https://spec.graphql.org/September2026/#sec-Input-Object-Values) | ✓ 120 |
| Variables and variable definitions (`variables`) | MUST | [§2.11](https://spec.graphql.org/September2026/#sec-Language.Variables) | ✗ 1/159 |
| Type references (`typeReferences`) | MUST | [§2.12](https://spec.graphql.org/September2026/#sec-Type-References) | ✓ 128 |
| Directives (`directives`) | MUST | [§2.13](https://spec.graphql.org/September2026/#sec-Language.Directives) | ✓ 150 |
| Type system documents hold type system definitions, and extension documents extensions too (`typeSystemDocuments`) | MUST | [§3.1](https://spec.graphql.org/September2026/#sec-Type-System-Extensions) | ✗ 3/33 |
| Descriptions on type system definitions and their parts, not on extensions (`typeSystemDescriptions`) | MUST | [§3.2](https://spec.graphql.org/September2026/#sec-Type-System-Descriptions) | ✓ 25 |
| Schema definitions (`schemaDefinition`) | MUST | [§3.3](https://spec.graphql.org/September2026/#sec-Schema) | ✓ 23 |
| Schema extensions add directives or root operation types (`schemaExtension`) | MUST | [§3.3.2](https://spec.graphql.org/September2026/#sec-Schema-Extension) | ✓ 26 |
| A type extension names a kind of type (`typeExtensions`) | MUST | [§3.4.3](https://spec.graphql.org/September2026/#sec-Type-Extensions) | ✓ 15 |
| Scalar definitions (`scalarDefinition`) | MUST | [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) | ✓ 17 |
| Scalar extensions add directives (`scalarExtension`) | MUST | [§3.5.6](https://spec.graphql.org/September2026/#sec-Scalar-Extensions) | ✓ 15 |
| Object definitions, implemented interfaces and field definitions (`objectDefinition`) | MUST | [§3.6](https://spec.graphql.org/September2026/#sec-Objects) | ✓ 55 |
| Argument definitions (`argumentsDefinition`) | MUST | [§3.6.1](https://spec.graphql.org/September2026/#sec-Field-Arguments) | ✓ 16 |
| Object extensions add interfaces, directives or fields (`objectExtension`) | MUST | [§3.6.3](https://spec.graphql.org/September2026/#sec-Object-Extensions) | ✓ 32 |
| Interface definitions (`interfaceDefinition`) | MUST | [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces) | ✓ 16 |
| Interface extensions add interfaces, directives or fields (`interfaceExtension`) | MUST | [§3.7.1](https://spec.graphql.org/September2026/#sec-Interface-Extensions) | ✓ 17 |
| Union definitions and their member types (`unionDefinition`) | MUST | [§3.8](https://spec.graphql.org/September2026/#sec-Unions) | ✓ 44 |
| Union extensions add directives or member types (`unionExtension`) | MUST | [§3.8.1](https://spec.graphql.org/September2026/#sec-Union-Extensions) | ✓ 30 |
| Enum definitions and their values (`enumDefinition`) | MUST | [§3.9](https://spec.graphql.org/September2026/#sec-Enums) | ✓ 34 |
| Enum extensions add directives or values (`enumExtension`) | MUST | [§3.9.1](https://spec.graphql.org/September2026/#sec-Enum-Extensions) | ✓ 15 |
| Input object definitions and their fields (`inputObjectDefinition`) | MUST | [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects) | ✓ 20 |
| Input object extensions add directives or fields (`inputObjectExtension`) | MUST | [§3.10.2](https://spec.graphql.org/September2026/#sec-Input-Object-Extensions) | ✓ 15 |
| Directive definitions and their locations (`directiveDefinition`) | MUST | [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | ✗ 6/72 (all new in September 2026) |
| Directive extensions add directives (`directiveExtension`) | MUST (new in September 2026) | [§3.13.6](https://spec.graphql.org/September2026/#sec-Directive-Extensions) | ✗ 14/37 (all new in September 2026) |

- **Basis for `sourceText`:** SourceCharacter :: "Any Unicode scalar value"; "The source text of a GraphQL document must be a sequence of {SourceCharacter}."
- **Basis for `whiteSpace`:** Whitespace :: "Horizontal Tab (U+0009)" | "Space (U+0020)"
- **Basis for `lineTerminators`:** LineTerminator :: "New Line (U+000A)" | "Carriage Return (U+000D)" [lookahead != "New Line (U+000A)"] | "Carriage Return (U+000D)" "New Line (U+000A)"
- **Basis for `comments`:** Comment :: `#` CommentChar* [lookahead != CommentChar]; CommentChar :: SourceCharacter but not LineTerminator
- **Basis for `insignificantCommas`:** Comma :: ,; commas "are used to improve the legibility of source text and separate lexical tokens but are otherwise syntactically and semantically insignificant within GraphQL documents."
- **Basis for `lexicalTokens`:** Token :: Punctuator | Name | IntValue | FloatValue | StringValue; "The character sequence must be described by a sequence of {Token} and {Ignored} lexical grammars."
- **Basis for `ignoredTokens`:** Ignored :: UnicodeBOM | Whitespace | LineTerminator | Comment | Comma; "Any amount of {Ignored} may appear before and after every lexical token."
- **Basis for `punctuators`:** Punctuator :: one of ! $ & ( ) ... : = @ [ ] { | }
- **Basis for `names`:** Name :: NameStart NameContinue* [lookahead != NameContinue]; NameStart :: Letter | `_`; NameContinue :: Letter | Digit | `_`
- **Basis for `descriptions`:** Description : StringValue; OperationDefinition : Description? OperationType Name? VariablesDefinition? Directives? SelectionSet | SelectionSet; FragmentDefinition : Description? fragment …; VariableDefinition : Description? Variable : …
- **Basis for `document`:** Document : Definition+; Definition : ExecutableDefinition | TypeSystemDefinitionOrExtension; ExecutableDocument : ExecutableDefinition+; ExecutableDefinition : OperationDefinition | FragmentDefinition
- **Basis for `operations`:** OperationDefinition : Description? OperationType Name? VariablesDefinition? Directives? SelectionSet | SelectionSet; OperationType : one of `query` `mutation` `subscription`
- **Basis for `selectionSets`:** SelectionSet : { Selection* }; Selection : Field | FragmentSpread | InlineFragment
- **Basis for `fields`:** Field : Alias? Name Arguments? Directives? SelectionSet?
- **Basis for `arguments`:** Arguments[Const] : ( Argument[?Const]+ ); Argument[Const] : Name : Value[?Const]
- **Basis for `fieldAlias`:** Alias : Name :
- **Basis for `fragments`:** FragmentSpread : ... FragmentName Directives?; FragmentDefinition : Description? fragment FragmentName TypeCondition Directives? SelectionSet; FragmentName : Name but not `on`
- **Basis for `typeConditions`:** TypeCondition : on NamedType
- **Basis for `inlineFragments`:** InlineFragment : ... TypeCondition? Directives? SelectionSet
- **Basis for `inputValues`:** Value[Const] : [~Const] Variable | IntValue | FloatValue | StringValue | BooleanValue | NullValue | EnumValue | ListValue[?Const] | ObjectValue[?Const]
- **Basis for `intValue`:** IntValue :: IntegerPart [lookahead != {Digit, `.`, NameStart}]; IntegerPart :: NegativeSign? 0 | NegativeSign? NonZeroDigit Digit*; "It must not have any leading {0}."
- **Basis for `floatValue`:** FloatValue :: IntegerPart FractionalPart ExponentPart | IntegerPart FractionalPart | IntegerPart ExponentPart, each [lookahead != {Digit, `.`, NameStart}]
- **Basis for `booleanValue`:** BooleanValue : one of `true` `false`
- **Basis for `stringValue`:** StringValue :: `""` [lookahead != `"`] | `"` StringCharacter+ `"` | BlockString; "The hexadecimal number encoded by a Unicode escape sequence must describe a _Unicode scalar value_, otherwise must result in a parse error."
- **Basis for `nullValue`:** NullValue : `null`
- **Basis for `enumValue`:** EnumValue : Name but not `true`, `false` or `null`
- **Basis for `listValue`:** ListValue[Const] : [ ] | [ Value[?Const]+ ]
- **Basis for `inputObjectValues`:** ObjectValue[Const] : { } | { ObjectField[?Const]+ }; ObjectField[Const] : Name : Value[?Const]
- **Basis for `variables`:** Variable : $ Name; VariablesDefinition : ( VariableDefinition+ ); VariableDefinition : Description? Variable : Type DefaultValue? Directives[Const]?; DefaultValue : = Value[Const]
- **Basis for `typeReferences`:** Type : NamedType | ListType | NonNullType; NamedType : Name; ListType : [ Type ]; NonNullType : NamedType ! | ListType !
- **Basis for `directives`:** Directives[Const] : Directive[?Const]+; Directive[Const] : @ Name Arguments[?Const]?
- **Basis for `typeSystemDocuments`:** TypeSystemDocument : TypeSystemDefinition+ (§3); TypeSystemExtensionDocument : TypeSystemDefinitionOrExtension+; TypeSystemDefinitionOrExtension : TypeSystemDefinition | TypeSystemExtension (§3.1)
- **Basis for `typeSystemDescriptions`:** Description : StringValue, where a production allows one: every type system definition, FieldDefinition, InputValueDefinition and EnumValueDefinition starts with Description?, and no extension does
- **Basis for `schemaDefinition`:** SchemaDefinition : Description? schema Directives[Const]? { RootOperationTypeDefinition+ }; RootOperationTypeDefinition : OperationType : NamedType
- **Basis for `schemaExtension`:** SchemaExtension : extend schema Directives[Const]? { RootOperationTypeDefinition+ } | extend schema Directives[Const] [lookahead != `{`]
- **Basis for `typeExtensions`:** TypeExtension : ScalarTypeExtension | ObjectTypeExtension | InterfaceTypeExtension | UnionTypeExtension | EnumTypeExtension | InputObjectTypeExtension
- **Basis for `scalarDefinition`:** ScalarTypeDefinition : Description? scalar Name Directives[Const]?
- **Basis for `scalarExtension`:** ScalarTypeExtension : extend scalar Name Directives[Const]
- **Basis for `objectDefinition`:** ObjectTypeDefinition : Description? type Name ImplementsInterfaces? Directives[Const]? FieldsDefinition | Description? type Name ImplementsInterfaces? Directives[Const]? [lookahead != `{`]; ImplementsInterfaces : ImplementsInterfaces & NamedType | implements `&`? NamedType; FieldsDefinition : { FieldDefinition+ }; FieldDefinition : Description? Name ArgumentsDefinition? : Type Directives[Const]?
- **Basis for `argumentsDefinition`:** ArgumentsDefinition : ( InputValueDefinition+ ); InputValueDefinition : Description? Name : Type DefaultValue? Directives[Const]?
- **Basis for `objectExtension`:** ObjectTypeExtension : extend type Name ImplementsInterfaces? Directives[Const]? FieldsDefinition | extend type Name ImplementsInterfaces? Directives[Const] [lookahead != `{`] | extend type Name ImplementsInterfaces [lookahead != `{`]
- **Basis for `interfaceDefinition`:** InterfaceTypeDefinition : Description? interface Name ImplementsInterfaces? Directives[Const]? FieldsDefinition | Description? interface Name ImplementsInterfaces? Directives[Const]? [lookahead != `{`]
- **Basis for `interfaceExtension`:** InterfaceTypeExtension : extend interface Name ImplementsInterfaces? Directives[Const]? FieldsDefinition | extend interface Name ImplementsInterfaces? Directives[Const] [lookahead != `{`] | extend interface Name ImplementsInterfaces [lookahead != `{`]
- **Basis for `unionDefinition`:** UnionTypeDefinition : Description? union Name Directives[Const]? UnionMemberTypes?; UnionMemberTypes : UnionMemberTypes | NamedType | = `|`? NamedType
- **Basis for `unionExtension`:** UnionTypeExtension : extend union Name Directives[Const]? UnionMemberTypes | extend union Name Directives[Const]
- **Basis for `enumDefinition`:** EnumTypeDefinition : Description? enum Name Directives[Const]? EnumValuesDefinition | Description? enum Name Directives[Const]? [lookahead != `{`]; EnumValuesDefinition : { EnumValueDefinition+ }; EnumValueDefinition : Description? EnumValue Directives[Const]?
- **Basis for `enumExtension`:** EnumTypeExtension : extend enum Name Directives[Const]? EnumValuesDefinition | extend enum Name Directives[Const] [lookahead != `{`]
- **Basis for `inputObjectDefinition`:** InputObjectTypeDefinition : Description? input Name Directives[Const]? InputFieldsDefinition | Description? input Name Directives[Const]? [lookahead != `{`]; InputFieldsDefinition : { InputValueDefinition+ }
- **Basis for `inputObjectExtension`:** InputObjectTypeExtension : extend input Name Directives[Const]? InputFieldsDefinition | extend input Name Directives[Const] [lookahead != `{`]
- **Basis for `directiveDefinition`:** DirectiveDefinition : Description? directive @ Name ArgumentsDefinition? Directives[Const]? `repeatable`? on DirectiveLocations; DirectiveLocations : DirectiveLocations | DirectiveLocation | `|`? DirectiveLocation; DirectiveLocation : ExecutableDirectiveLocation | TypeSystemDirectiveLocation, each one of a list of names
- **Basis for `directiveExtension`:** DirectiveExtension : extend directive @ Name Directives[Const]

## Validate

- **Capabilities:** custom-directives, custom-scalar-results, deferred-items, idle, introspect, invalid-results, mutation, parent-values, parse, parse-sdl, scalar-results, schema, schema-extensions, subscription, subscription-stream, uncoercible-results, validate
- **Cases:** 3337 submitted, 3337 distinct, 0 malformed
- **Vectors:** 3337 of 3370 graded (not graded: 13 unspecified, 20 custom-scalar-literals)
- **Vectors relying on rules after October 2021:** since September 2025, 75 of 246 vectors failing; new in September 2026, 6 of 3 vectors failing
- **Adapter problems:** none
- **Checker self-test:** passed (15 negative controls)
- **Run:** kit 0625b35d64dd, 2026-11-16, strict

### Findings

<a id="validate-finding-1"></a>

#### 1. `allVariableUsagesAreAllowed`: §5.8.5 All Variable Usages Are Allowed isn't enforced: accepts documents that break only this rule; 1 of 72 rely on rules since September 2025

72 cases, in `variables` (72). 1 of them rely on grammar or rules introduced in September 2025, not in October 2021.

- All Variable Usages Are Allowed (MUST, [§5.8.5](https://spec.graphql.org/September2026/#sec-All-Variable-Usages-Are-Allowed))

The shortest case, from `variables`:

```
input:    AllVariableUsagesAreAllowed-4: query Q($v: ID!) { echo(opt: $v) }
response: {"valid":true,"errors":[]}
expected: invalid: AllVariableUsagesAreAllowed ["v"]
```

<a id="validate-finding-2"></a>

#### 2. `descriptionsInert`: crashes on documents with a description on each operation, fragment and variable definition, though it answers the same documents without them; all rely on rules since September 2025

56 cases, in `descriptions` (56). All rely on grammar or rules introduced in September 2025, not in October 2021.

- Descriptions and comments don't change validation (MUST, [§2.2](https://spec.graphql.org/September2026/#sec-Descriptions) [§2.1.4](https://spec.graphql.org/September2026/#sec-Insignificant-Commas))

The shortest case, from `descriptions`:

```
problem:  SyntaxError: Error parsing query: Unexpected String "Runs the test.
input:    [since September 2025] LeafFieldSelections-1-described: """ Runs the test. It mentions query Q { user { id } }, fragment F on User, $v and # a hash, all inside the description. """ query { post }
response: "the adapter answered with an error: SyntaxError: Error parsing query: Unexpected String \"Runs the test."
expected: invalid: LeafFieldSelections ["post"], as for LeafFieldSelections-1, which was answered right
```

<a id="validate-finding-3"></a>

#### 3. `acceptsValid`: rejects valid documents, all with the same error message; their invalid siblings break §5.2.4.1 Single Root Field (14), §5.2.3.1 Lone Anonymous Operation (12), §5.2.1.1 Operation Type Existence (3), so the hints point at no one rule: the message says what the implementation objected to

26 cases, in `operations` (26).

Each rejected document is one edit from a document that breaks only `singleRootField` or `loneAnonymousOperation` or `operationTypeExistence`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/September2026/#sec-Validation) [§6.1](https://spec.graphql.org/September2026/#sec-Executing-Requests) [§6.1.1](https://spec.graphql.org/September2026/#sec-Validating-Requests))

The shortest case, from `operations`:

```
problem:  Subscription 'S7' must have exactly one root field and that field must not be an introspection field.
input:    SingleRootField-valid-22: subscription S7 { a: postAdded { id } a: postAdded { name } }
response: {"valid":false,"errors":[{"message":"Subscription 'S7' must have exactly one root field and that field must not be an introspection field.","locations":[{"line":5,"column":3}]}]}
expected: valid
```

<a id="validate-finding-4"></a>

#### 4. `fieldSelectionMerging`: §5.3.2 Field Selection Merging isn't enforced: accepts documents that break only this rule

22 cases, in `merging` (22).

- Field Selection Merging (MUST, [§5.3.2](https://spec.graphql.org/September2026/#sec-Field-Selection-Merging))

The shortest case, from `merging`:

```
input:    FieldSelectionMerging-59: { node(id: "1") { ... on User { a: __typename } ... on Post { a: id } } }
response: {"valid":true,"errors":[]}
expected: invalid: FieldSelectionMerging ["conflict"]
```

<a id="validate-finding-5"></a>

#### 5. `singleRootField`: §5.2.4.1 Single Root Field isn't enforced: accepts documents that break only this rule; 6 of 20 rely on rules since September 2025

20 cases, in `operations` (13), `twins` (5), `random` (1), `extra` (1). 6 of them rely on grammar or rules introduced in September 2025, not in October 2021.

- Single Root Field (MUST, [§5.2.4.1](https://spec.graphql.org/September2026/#sec-Single-Root-Field))

The shortest case, from `twins`:

```
input:    [since September 2025] SingleRootField-55: subscription { postAdded @skip(if: false) { id } }
response: {"valid":true,"errors":[]}
expected: invalid: SingleRootField [""]
```

<a id="validate-finding-6"></a>

#### 6. `executableDefinitions`: §5.1.1 Executable Definitions isn't enforced: accepts documents that break only this rule

15 cases, in `twins` (11), `executable` (4).

- Executable Definitions (MUST, [§5.1.1](https://spec.graphql.org/September2026/#sec-Executable-Definitions))

The shortest case, from `twins`:

```
input:    ExecutableDefinitions-5: { user { id } } scalar Date
response: {"valid":true,"errors":[]}
expected: invalid: ExecutableDefinitions ["document"]
```

<a id="validate-finding-7"></a>

#### 7. `operationTypeExistence`: §5.2.1.1 Operation Type Existence isn't enforced: accepts documents that break only this rule; all rely on rules since September 2025

11 cases, in `operations` (8), `twins` (2), `spec` (1). All rely on grammar or rules introduced in September 2025, not in October 2021.

- Operation Type Existence (MUST, [§5.2.1.1](https://spec.graphql.org/September2026/#sec-Operation-Type-Existence))

The shortest case, from `spec`:

```
input:    [since September 2025] OperationTypeExistence-spec-2: mutation goodbyeMutation { goodbye }
response: {"valid":true,"errors":[]}
expected: invalid: OperationTypeExistence ["mutation"]
```

<a id="validate-finding-8"></a>

#### 8. `acceptsValid`: rejects valid documents, all with the same error message; their invalid siblings break §5.8.5 All Variable Usages Are Allowed (8), §5.7.1 Directives Are Defined (1), §5.5.2.1 Fragment Spread Target Defined (1), §5.6.1 Values of Correct Type (1), so the hints point at no one rule: the message says what the implementation objected to

10 cases, in `variables` (8), `random` (2).

Each rejected document is one edit from a document that breaks only `allVariableUsagesAreAllowed` or `directivesAreDefined` or `fragmentSpreadTargetDefined` or `valuesOfCorrectType`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/September2026/#sec-Validation) [§6.1](https://spec.graphql.org/September2026/#sec-Executing-Requests) [§6.1.1](https://spec.graphql.org/September2026/#sec-Validating-Requests))

The shortest case, from `variables`:

```
problem:  Variable '$v' of type '[Int]' used in position expecting type 'Int'.
input:    AllVariableUsagesAreAllowed-valid-47: query Q($v: [Int]) { matrix(rows: [$v]) }
response: {"valid":false,"errors":[{"message":"Variable '$v' of type '[Int]' used in position expecting type 'Int'.","locations":[{"line":1,"column":9},{"line":2,"column":17}]}]}
expected: valid
```

<a id="validate-finding-9"></a>

#### 9. `executableDefinitions`: crashes on documents that break only §5.1.1 Executable Definitions, instead of rejecting them; 3 of 4 rely on rules since September 2026

4 cases, in `twins` (4). 3 of them rely on grammar or rules introduced in September 2026, not in October 2021.

- Executable Definitions (MUST, [§5.1.1](https://spec.graphql.org/September2026/#sec-Executable-Definitions))

The shortest case, from `twins`:

```
problem:  InvalidOperationException: Unable to determine directive location for 'extend scalar Date @deprecated'.
input:    ExecutableDefinitions-6: { user { id } } extend scalar Date @deprecated
response: "the adapter answered with an error: InvalidOperationException: Unable to determine directive location for 'extend scalar Date @deprecated'."
expected: invalid: ExecutableDefinitions ["document"]
```

<a id="validate-finding-10"></a>

#### 10. `leafFieldSelections`: crashes on documents that break only §5.3.3 Leaf Field Selections, instead of rejecting them; all rely on rules since September 2026

2 cases, in `twins` (1), `spec` (1). All rely on grammar or rules introduced in September 2026, not in October 2021.

- Leaf Field Selections (MUST, [§5.3.3](https://spec.graphql.org/September2026/#sec-Leaf-Field-Selections))

The shortest case, from `spec`:

```
problem:  SyntaxError: Error parsing query: Expected Name, found }; for more information see http://spec.graphql.org/October2021/#Field
input:    [since September 2026] LeafFieldSelections-spec-3: { dog { ...scalarEmptySelectionsNotAllowedOnInt } } fragment scalarEmptySelectionsNotAllowedOnInt on Dog { barkVolume {} }
response: "the adapter answered with an error: SyntaxError: Error parsing query: Expected Name, found }; for more information see http://spec.graphql.org/October2021/#Field"
expected: invalid: LeafFieldSelections ["barkVolume"]
```

<a id="validate-finding-11"></a>

#### 11. `acceptsValid`: crashes on valid documents instead of accepting them; hint: §5.3.3 Leaf Field Selections, the rules their invalid siblings break; all rely on rules since September 2026

1 case, in `spec` (1). All rely on grammar or rules introduced in September 2026, not in October 2021.

Each rejected document is one edit from a document that breaks only `leafFieldSelections`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/September2026/#sec-Validation) [§6.1](https://spec.graphql.org/September2026/#sec-Executing-Requests) [§6.1.1](https://spec.graphql.org/September2026/#sec-Validating-Requests))

The shortest case, from `spec`:

```
problem:  SyntaxError: Error parsing query: Expected Name, found }; for more information see http://spec.graphql.org/October2021/#Field
input:    [since September 2026] LeafFieldSelections-spec-8: query directQueryOnObjectWithEmptySelection { human {} }
response: "the adapter answered with an error: SyntaxError: Error parsing query: Expected Name, found }; for more information see http://spec.graphql.org/October2021/#Field"
expected: valid
```

### Every check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **(k since September 2025, j new in September 2026), (all …):** k of the n failing cases rely on grammar or rules introduced in September 2025, and j on ones introduced in September 2026; none of them is in the October 2021 edition. The symbol still gives the check's level.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it. **– needs `x`:** the adapter doesn't claim capability `x`, which the check needs.
- **n/a:** the adapter doesn't take part in this area, or its report predates the check.

| Check | Level | Spec | Result |
| --- | :---: | :---: | :---: |
| Executable Definitions (`executableDefinitions`) | MUST | [§5.1.1](https://spec.graphql.org/September2026/#sec-Executable-Definitions) | ✗ 19/19 (3 new in September 2026) |
| Operation Type Existence (`operationTypeExistence`) | MUST (since September 2025) | [§5.2.1.1](https://spec.graphql.org/September2026/#sec-Operation-Type-Existence) | ✗ 11/15 (all since September 2025) |
| Operation Name Uniqueness (`operationNameUniqueness`) | MUST | [§5.2.2.1](https://spec.graphql.org/September2026/#sec-Operation-Name-Uniqueness) | ✓ 6 |
| Lone Anonymous Operation (`loneAnonymousOperation`) | MUST | [§5.2.3.1](https://spec.graphql.org/September2026/#sec-Lone-Anonymous-Operation) | ✓ 21 |
| Single Root Field (`singleRootField`) | MUST | [§5.2.4.1](https://spec.graphql.org/September2026/#sec-Single-Root-Field) | ✗ 20/64 (6 since September 2025) |
| Field Selections (`fieldSelections`) | MUST | [§5.3.1](https://spec.graphql.org/September2026/#sec-Field-Selections) | ✓ 34 |
| Field Selection Merging (`fieldSelectionMerging`) | MUST | [§5.3.2](https://spec.graphql.org/September2026/#sec-Field-Selection-Merging) | ✗ 22/677 |
| Leaf Field Selections (`leafFieldSelections`) | MUST | [§5.3.3](https://spec.graphql.org/September2026/#sec-Leaf-Field-Selections) | ✗ 2/44 (all new in September 2026) |
| Argument Names (`argumentNames`) | MUST | [§5.4.1](https://spec.graphql.org/September2026/#sec-Argument-Names) | ✓ 10 |
| Argument Uniqueness (`argumentUniqueness`) | MUST | [§5.4.2](https://spec.graphql.org/September2026/#sec-Argument-Uniqueness) | ✓ 6 |
| Required Arguments (`requiredArguments`) | MUST | [§5.4.3](https://spec.graphql.org/September2026/#sec-Required-Arguments) | ✓ 17 |
| Fragment Name Uniqueness (`fragmentNameUniqueness`) | MUST | [§5.5.1.1](https://spec.graphql.org/September2026/#sec-Fragment-Name-Uniqueness) | ✓ 11 |
| Fragment Spread Type Existence (`fragmentSpreadTypeExistence`) | MUST | [§5.5.1.2](https://spec.graphql.org/September2026/#sec-Fragment-Spread-Type-Existence) | ✓ 13 |
| Fragments on Object, Interface or Union Types (`fragmentsOnObjectInterfaceOrUnionTypes`) | MUST | [§5.5.1.3](https://spec.graphql.org/September2026/#sec-Fragments-on-Object-Interface-or-Union-Types) | ✓ 18 |
| Fragments Must Be Used (`fragmentsMustBeUsed`) | MUST | [§5.5.1.4](https://spec.graphql.org/September2026/#sec-Fragments-Must-Be-Used) | ✓ 78 |
| Fragment Spread Target Defined (`fragmentSpreadTargetDefined`) | MUST | [§5.5.2.1](https://spec.graphql.org/September2026/#sec-Fragment-Spread-Target-Defined) | ✓ 9 |
| Fragment Spreads Must Not Form Cycles (`fragmentSpreadsMustNotFormCycles`) | MUST | [§5.5.2.2](https://spec.graphql.org/September2026/#sec-Fragment-Spreads-Must-Not-Form-Cycles) | ✓ 54 |
| Fragment Spread Is Possible (`fragmentSpreadIsPossible`) | MUST | [§5.5.2.3](https://spec.graphql.org/September2026/#sec-Fragment-Spread-Is-Possible) | ✓ 38 |
| Values of Correct Type (`valuesOfCorrectType`) | MUST | [§5.6.1](https://spec.graphql.org/September2026/#sec-Values-of-Correct-Type) [§3.5.2](https://spec.graphql.org/September2026/#sec-Float) | ✓ 296 |
| Int literals out of 32-bit range are rejected (`intInputRange`) | SHOULD | [§3.5.1](https://spec.graphql.org/September2026/#sec-Int) [§5.6.1](https://spec.graphql.org/September2026/#sec-Values-of-Correct-Type) | ✓ 4 |
| Input Object Field Names (`inputObjectFieldNames`). every document that breaks this rule also breaks §5.6.1 Values of Correct Type, which subsumes it, so a rejection can't be credited to this rule; accepting one fails both | MUST | [§5.6.2](https://spec.graphql.org/September2026/#sec-Input-Object-Field-Names) | ⊂ |
| Input Object Field Uniqueness (`inputObjectFieldUniqueness`) | MUST | [§5.6.3](https://spec.graphql.org/September2026/#sec-Input-Object-Field-Uniqueness) | ✓ 9 |
| Input Object Required Fields (`inputObjectRequiredFields`). every document that breaks this rule also breaks §5.6.1 Values of Correct Type, which subsumes it, so a rejection can't be credited to this rule; accepting one fails both | MUST | [§5.6.4](https://spec.graphql.org/September2026/#sec-Input-Object-Required-Fields) | ⊂ |
| Directives Are Defined (`directivesAreDefined`) | MUST | [§5.7.1](https://spec.graphql.org/September2026/#sec-Directives-Are-Defined) | ✓ 25 |
| Directives Are in Valid Locations (`directivesAreInValidLocations`) | MUST | [§5.7.2](https://spec.graphql.org/September2026/#sec-Directives-Are-in-Valid-Locations) | ✓ 32 |
| Directives Are Unique per Location (`directivesAreUniquePerLocation`) | MUST | [§5.7.3](https://spec.graphql.org/September2026/#sec-Directives-Are-Unique-per-Location) | ✓ 14 |
| Variable Uniqueness (`variableUniqueness`) | MUST | [§5.8.1](https://spec.graphql.org/September2026/#sec-Variable-Uniqueness) | ✓ 7 |
| Variables Are Input Types (`variablesAreInputTypes`) | MUST | [§5.8.2](https://spec.graphql.org/September2026/#sec-Variables-Are-Input-Types) | – |
| All Variable Uses Defined (`allVariableUsesDefined`) | MUST | [§5.8.3](https://spec.graphql.org/September2026/#sec-All-Variable-Uses-Defined) | ✓ 15 |
| All Variables Used (`allVariablesUsed`) | MUST | [§5.8.4](https://spec.graphql.org/September2026/#sec-All-Variables-Used) | ✓ 18 |
| All Variable Usages Are Allowed (`allVariableUsagesAreAllowed`) | MUST | [§5.8.5](https://spec.graphql.org/September2026/#sec-All-Variable-Usages-Are-Allowed) | ✗ 72/638 (1 since September 2025) |
| Valid documents are accepted (`acceptsValid`) | MUST | [§5](https://spec.graphql.org/September2026/#sec-Validation) [§6.1](https://spec.graphql.org/September2026/#sec-Executing-Requests) [§6.1.1](https://spec.graphql.org/September2026/#sec-Validating-Requests) | ✗ 37/1041 (1 new in September 2026) |
| Descriptions and comments don't change validation (`descriptionsInert`) | MUST | [§2.2](https://spec.graphql.org/September2026/#sec-Descriptions) [§2.1.4](https://spec.graphql.org/September2026/#sec-Insignificant-Commas) | ✗ 56/109 (all since September 2025) |
| Interface spreads where §5.5.2.3's formal text and prose disagree: which reading (`fragmentSpreadReading`). invalid (the formal text): 2; valid (own scope, which the prose doesn't settle): 4. Observed: invalid (the formal text) 2, valid (own scope, which the prose doesn't settle) 4 | INFO | [§5.5.2.3](https://spec.graphql.org/September2026/#sec-Fragment-Spread-Is-Possible) | ✓ 6 |
| Nullable variables with a default in a OneOf field, where §5.8.5's formal text and prose disagree: which reading (`oneOfVariableReading`). valid (the formal text): 2. Observed: valid (the formal text) 2 | INFO | [§5.8.5](https://spec.graphql.org/September2026/#sec-All-Variable-Usages-Are-Allowed) | ✓ 2 |
| Two fields of one response name whose arguments are identical under one reading of §5.3.2 only: which reading (`identicalArgumentsReading`). valid (their literal values or their coerced values): 1; invalid (their literal values or their text): 4. Observed: valid (their literal values or their coerced values) 1, invalid (their literal values or their text) 4 | INFO | [§5.3.2](https://spec.graphql.org/September2026/#sec-Field-Selection-Merging) | ✓ 5 |

- **Basis for `executableDefinitions`:** Formal Specification: "For each definition definition in the document: definition must be ExecutableDefinition (it must not be TypeSystemDefinitionOrExtension)."
- **Basis for `operationTypeExistence`:** Formal Specification: "For each operation definition operation in the document: Let rootOperationType be the root operation type in schema corresponding to the kind of operation. rootOperationType must exist." The rule is new in September 2025 (§5.2.1.1); October 2021 has no such rule, so its vectors have since September 2025.
- **Basis for `operationNameUniqueness`:** Formal Specification: "If operationName exists: Let operations be all operation definitions in the document named operationName. operations must be a set of one."
- **Basis for `loneAnonymousOperation`:** Formal Specification: "If operations is a set of more than 1: anonymous must be empty."
- **Basis for `singleRootField`:** Formal Specification: "Let collectedFieldsMap be the result of CollectSubscriptionFields(subscriptionType, selectionSet). collectedFieldsMap must have exactly one entry, which must not be an introspection field." CollectSubscriptionFields: "selection must not provide the @skip directive. selection must not provide the @include directive." September 2025 has the same text. October 2021 (its §5.2.3.1) collects the root fields with CollectFields and "Let variableValues be the empty set", so it applies @skip and @include instead of forbidding them: a selection with @include(if: $v) is dropped, one with @skip(if: $v) kept. A vector that only September 2025 and later reject has since September 2025.
- **Basis for `fieldSelections`:** Formal Specification: "For each selection in the document: Let fieldName be the target field of selection. fieldName must be defined on type in scope."
- **Basis for `fieldSelectionMerging`:** Formal Specification: "Let set be any selection set defined in the GraphQL document. FieldsInSetCanMerge(set) must be true." FieldsInSetCanMerge: "SameResponseShape(fieldA, fieldB) must be true", and, for the same parent type or a parent that isn't an Object type, "fieldA and fieldB must have identical field names. fieldA and fieldB must have identical sets of arguments."
- **Basis for `leafFieldSelections`:** Formal Specification: "If selectionType is a scalar or enum: The subselection set of that selection must not be present. If selectionType is an interface, union, or object: The subselection set of that selection must be present." September 2025 says "must be empty" and "must not be empty", October 2021 "must be empty" and "must NOT BE empty": a MUST in every release. September 2026 reworded the rule when it added empty selection sets (§2.5 SelectionSet : { Selection* }, where the older releases have Selection+): "An empty selection is a selection", so `barkVolume {}` is invalid, and `human {}` is valid. The vectors with an empty selection set have since September 2026.
- **Basis for `argumentNames`:** Formal Specification: "For each argument in the document: ... Let argumentDefinition be the argument definition provided by the parent field or definition named argumentName. argumentDefinition must exist."
- **Basis for `argumentUniqueness`:** Formal Specification: "Let arguments be all Arguments named argumentName in the Argument Set which contains argument. arguments must be the set containing only argument."
- **Basis for `requiredArguments`:** Formal Specification: "If type is Non-Null and defaultValue does not exist: ... argument must exist. Let value be the value of argument. value must not be the null literal."
- **Basis for `fragmentNameUniqueness`:** Formal Specification: "Let fragments be all fragment definitions in the document named fragmentName. fragments must be a set of one."
- **Basis for `fragmentSpreadTypeExistence`:** Formal Specification: "For each named spread namedSpread in the document: Let fragment be the target of namedSpread. The target type of fragment must be defined in the schema."
- **Basis for `fragmentsOnObjectInterfaceOrUnionTypes`:** Formal Specification: "For each fragment defined in the document: The target type of fragment must have kind UNION, INTERFACE, or OBJECT."
- **Basis for `fragmentsMustBeUsed`:** Formal Specification: "For each fragment defined in the document: fragment must be the target of at least one spread in the document."
- **Basis for `fragmentSpreadTargetDefined`:** Formal Specification: "For every namedSpread in the document: Let fragment be the target of namedSpread. fragment must be defined in the document."
- **Basis for `fragmentSpreadsMustNotFormCycles`:** Formal Specification: "For each fragmentDefinition in the document: ... DetectFragmentCycles(fragmentDefinition, visited)." DetectFragmentCycles: "visited must not contain spread."
- **Basis for `fragmentSpreadIsPossible`:** Formal Specification: "Let applicableTypes be the intersection of GetPossibleTypes(fragmentType) and GetPossibleTypes(parentType). applicableTypes must not be empty."
- **Basis for `valuesOfCorrectType`:** Formal Specification: "For each literal Input Value value in the document: Let type be the type expected in the position value is found. value must be coercible to type" For a Float, §3.5.2 (the same in every release): "If the input value otherwise represents a value not representable by finite IEEE 754 (e.g. NaN, Infinity, or a value outside the available precision), a request error must be raised." A literal too large for binary64, which rounds to Infinity (1e400), isn't coercible. A literal too small (1e-400) isn't graded: whether rounding it to 0 is "outside the available precision" the spec doesn't say.
- **Basis for `intInputRange`:** §3.5.1 Int, Input Coercion: "If the integer input value represents a value less than -2^31 or greater than or equal to 2^31, a request error should be raised." A SHOULD, the same in every release. §5.6.1 asks for a literal "coercible to type", so a service that follows the SHOULD rejects such a literal at validation. ID takes any integer, and Float has its own bound.
- **Basis for `inputObjectFieldNames`:** Formal Specification: "For each Input Object Field inputField in the document: ... inputFieldDefinition must exist."
- **Basis for `inputObjectFieldUniqueness`:** Formal Specification: "For every inputField in inputObject: ... Let fields be all Input Object Fields named name in inputObject. fields must be the set containing only inputField."
- **Basis for `inputObjectRequiredFields`:** Formal Specification: "If type is Non-Null and defaultValue does not exist: ... field must exist. Let value be the value of field. value must not be the null literal."
- **Basis for `directivesAreDefined`:** Formal Specification: "For every directive in a document: Let directiveName be the name of directive. Let directiveDefinition be the directive named directiveName. directiveDefinition must exist."
- **Basis for `directivesAreInValidLocations`:** Formal Specification: "Let locations be the valid locations for directiveDefinition. Let adjacent be the AST node the directive affects. adjacent must be represented by an item within locations."
- **Basis for `directivesAreUniquePerLocation`:** Formal Specification: "Let directives be the set of Directives which apply to location and are not repeatable. ... namedDirectives must be a set of one."
- **Basis for `variableUniqueness`:** Formal Specification: "For every variable defined on operation: ... Let variables be the set of all variables named variableName on operation. variables must be a set of one."
- **Basis for `variablesAreInputTypes`:** Formal Specification: "For every variable on each operation: Let variableType be the type of variable. IsInputType(variableType) must be true."
- **Basis for `allVariableUsesDefined`:** Formal Specification: "For each variableUsage in scope, variable must be in operation's variable list." The same for every fragment the operation references transitively.
- **Basis for `allVariablesUsed`:** Formal Specification: "Each variable in variables must be used at least once in either the operation scope itself or any fragment transitively referenced by that operation."
- **Basis for `allVariableUsagesAreAllowed`:** Formal Specification: "For each variableUsage in variableUsages: ... IsVariableUsageAllowed(variableDefinition, variableUsage) must be true." IsNonNullPosition, and with it OneOf Input Objects, are new in September 2025: October 2021's IsVariableUsageAllowed has neither, so a variable in a OneOf Input Object's field isn't a Non-Null position there. The vectors that rest on it have since September 2025.
- **Basis for `acceptsValid`:** §5 has no sentence that requires accepting; it only says "operation execution should only occur for valid requests". The requirement to go on comes from §6.1, which executes a request ("The result of the request is determined by the result of executing this operation"), and §6.1.1, which fails it only for validation errors: "If validation errors are known, they should be reported in the list of "errors" in the response and the request must fail without operation execution." A document that satisfies every rule of §5 has none, so rejecting it applies a rule the spec doesn't have.
- **Basis for `descriptionsInert`:** §2.2 (since September 2025): "Descriptions in GraphQL executable documents are purely for documentation purposes. They MUST NOT affect the execution, validation, or response of a GraphQL document. It is safe to remove all descriptions and comments from executable documents without changing their behavior or results." §2.1.4 (every release): comments "have no significance to the semantic meaning of a GraphQL Document". Each twin is a vector of another check with a description on every operation, fragment and variable definition (since September 2025), or a comment after every line. It is graded only when the implementation answers its original right, or, for a crash, answers it without crashing, so a failure here is the description's or the comment's doing; a parser without descriptions crashes on the first kind.
- **Basis for `fragmentSpreadReading`:** The formal text: "Let applicableTypes be the intersection of GetPossibleTypes(fragmentType) and GetPossibleTypes(parentType). applicableTypes must not be empty." An interface no object type implements has no possible types, so it rejects every spread of one. The prose: "an interface type fragment can always be spread into an interface scope which it implements", and it doesn't say whether an interface may be spread into its own scope. Where an object type implements both, the readings agree, and those vectors are graded under fragmentSpreadIsPossible.
- **Basis for `oneOfVariableReading`:** The formal text allows a nullable variable in a non-null position when "a default value exists for variableDefinition and is not the value null", and IsNonNullPosition makes a OneOf Input Object's field such a position. The prose: "Variables used for OneOf Input Object fields must be non-nullable."
- **Basis for `identicalArgumentsReading`:** FieldsInSetCanMerge: "fieldA and fieldB must have identical sets of arguments", without defining identical. The arguments can be compared by their literal values (the reference), by their text, or by their coerced values (defaults included).

## Schema

- **Capabilities:** custom-directives, custom-scalar-results, deferred-items, idle, introspect, invalid-results, mutation, parent-values, parse, parse-sdl, scalar-results, schema, schema-extensions, subscription, subscription-stream, uncoercible-results, validate
- **Cases:** 501 submitted, 501 distinct, 0 malformed
- **Vectors:** 501 of 505 graded (not graded: 4 unspecified)
- **Vectors relying on rules after October 2021:** since September 2025, 16 of 67 vectors failing; new in September 2026, 17 of 31 vectors failing
- **Adapter problems:** none
- **Checker self-test:** passed (1015 negative controls)
- **Run:** kit 0625b35d64dd, 2026-11-16, strict

### Findings

<a id="schema-finding-1"></a>

#### 1. `acceptsValid`: rejects 11 valid schemas with the same error, one edit from schemas that break directiveExtensionDefined, directiveExtensionNotReapplied, directiveExtensionReferencesPrevious, directiveExtensionUsesPrevious, directiveLocationsValid or directiveUsesItself: one cause, which the pairs don't pin on any one rule; the message says what the implementation checked; all rely on September 2026

11 cases, in `extension` (9), `directive` (2). All rely on grammar or rules introduced in September 2026, not in October 2021.

Each rejected document is one edit from a document that breaks only `directiveExtensionDefined` or `directiveExtensionNotReapplied` or `directiveExtensionReferencesPrevious` or `directiveExtensionUsesPrevious` or `directiveLocationsValid` or `directiveUsesItself`; which rule the implementation applied is a guess.

- Valid schemas are accepted (MUST, [§3](https://spec.graphql.org/September2026/#sec-Type-System))

The shortest case, from `directiveUsesItself.3.valid`:

```
problem:  Syntax Error GraphQL (1:17) Expected "QUERY/MUTATION/SUBSCRIPTION/FIELD/FRAGMENT_DEFINITION/FRAGMENT_SPREAD/INLINE_FRAGMENT/VARIABLE_DEFINITION/SCHEMA/SCALAR/OBJECT/FIELD_DEFINITION/ARGUMENT_DEFINITIO
input:    [since September 2026] directive @d on DIRECTIVE_DEFINITION type Query { a: Int }
response: {"valid":false,"errors":["Syntax Error GraphQL (1:17) Expected \"QUERY/MUTATION/SUBSCRIPTION/FIELD/FRAGMENT_DEFINITION/FRAGMENT_SPREAD/INLINE_FRAGMENT/VARIABLE_DEFINITION/SCHEMA/SCALAR/OBJECT/FIELD_DEFINITION/ARGUMENT_DEFINITION/INTERFACE/UNION/ENUM/ENUM_VALUE/INPUT_OBJECT/INPUT_FIELD_DEFINITION\", found Name \"DIRECTIVE_DEFINITION\"\n1: directive @d on DIRECTIVE_DEFINITION type Query { a: Int }\n                   ^\n"]}
expected: valid (TypeSystem!Verdict is empty)
```

<a id="schema-finding-2"></a>

#### 2. `directiveLocationsValid`: DIRECTIVE_LOCATIONS_VALID not enforced: accepts a schema that breaks only this rule

8 cases, in `directive` (8).

- Every directive the document applies is at a location it is declared for (MUST, [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))

The shortest case, from `directiveLocationsValid.3.invalid`:

```
input:    type Query @deprecated { a: Int }
response: {"valid":true}
expected: invalid: breaks DIRECTIVE_LOCATIONS_VALID and no other rule
```

<a id="schema-finding-3"></a>

#### 3. `appliedDirectiveArguments`: APPLIED_DIRECTIVE_ARGUMENTS not enforced: accepts a schema that breaks only this rule (informational: §3 states no such rule)

7 cases, in `directive` (7). 1 of them rely on grammar or rules introduced in September 2025, not in October 2021.

- A directive applied in SDL has the arguments its definition gives it (INFO, [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) [§2.13](https://spec.graphql.org/September2026/#sec-Language.Directives) [§5.4](https://spec.graphql.org/September2026/#sec-Validation.Arguments))

The shortest case, from `appliedDirectiveArguments.5.invalid`:

```
input:    scalar S @specifiedBy type Query { a: S }
response: {"valid":true}
expected: invalid: breaks APPLIED_DIRECTIVE_ARGUMENTS and no other rule
```

<a id="schema-finding-4"></a>

#### 4. `extensionDirectivesNotReapplied`: EXTENSION_DIRECTIVES_NOT_REAPPLIED not enforced: accepts a schema that breaks only this rule

7 cases, in `extension` (7).

- An extension doesn't apply a non-repeatable directive again (MUST, [§3.3.2](https://spec.graphql.org/September2026/#sec-Schema-Extension) [§3.5.6](https://spec.graphql.org/September2026/#sec-Scalar-Extensions) [§3.6.3](https://spec.graphql.org/September2026/#sec-Object-Extensions) [§3.7.1](https://spec.graphql.org/September2026/#sec-Interface-Extensions) [§3.8.1](https://spec.graphql.org/September2026/#sec-Union-Extensions) [§3.9.1](https://spec.graphql.org/September2026/#sec-Enum-Extensions) [§3.10.2](https://spec.graphql.org/September2026/#sec-Input-Object-Extensions))

The shortest case, from `extensionDirectivesNotReapplied.4.invalid`:

```
input:    directive @d on SCALAR scalar S @d type Query { a: S } extend scalar S @d
response: {"valid":true}
expected: invalid: breaks EXTENSION_DIRECTIVES_NOT_REAPPLIED and no other rule
```

<a id="schema-finding-5"></a>

#### 5. `extensionTargetDefined`: EXTENSION_TARGET_DEFINED not enforced: accepts a schema that breaks only this rule

6 cases, in `extension` (6).

- A type extension extends a type that is defined (MUST, [§3.5.6](https://spec.graphql.org/September2026/#sec-Scalar-Extensions) [§3.6.3](https://spec.graphql.org/September2026/#sec-Object-Extensions) [§3.7.1](https://spec.graphql.org/September2026/#sec-Interface-Extensions) [§3.8.1](https://spec.graphql.org/September2026/#sec-Union-Extensions) [§3.9.1](https://spec.graphql.org/September2026/#sec-Enum-Extensions) [§3.10.2](https://spec.graphql.org/September2026/#sec-Input-Object-Extensions))

The shortest case, from `extensionTargetDefined.4.invalid`:

```
input:    type Query { a: Int } extend enum E { B }
response: {"valid":true}
expected: invalid: breaks EXTENSION_TARGET_DEFINED and no other rule
```

<a id="schema-finding-6"></a>

#### 6. `inputObjectUnbreakableCycle`: INPUT_OBJECT_UNBREAKABLE_CYCLE not enforced: accepts a schema that breaks only this rule

5 cases, in `input` (4), `extension` (1). 3 of them rely on grammar or rules introduced in September 2026, not in October 2021.

- An input object can be given a finite value (MUST, [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects))

The shortest case, from `inputObjectUnbreakableCycle.5.invalid`:

```
input:    [since September 2026] input A @oneOf { b: B } input B @oneOf { a: A } type Query { f(a: A): Int }
response: {"valid":true}
expected: invalid: breaks INPUT_OBJECT_UNBREAKABLE_CYCLE and no other rule
```

<a id="schema-finding-7"></a>

#### 7. `extensionTargetKind`: EXTENSION_TARGET_KIND not enforced: accepts a schema that breaks only this rule

5 cases, in `extension` (5).

- A type extension extends a type of its own kind (MUST, [§3.5.6](https://spec.graphql.org/September2026/#sec-Scalar-Extensions) [§3.6.3](https://spec.graphql.org/September2026/#sec-Object-Extensions) [§3.7.1](https://spec.graphql.org/September2026/#sec-Interface-Extensions) [§3.8.1](https://spec.graphql.org/September2026/#sec-Union-Extensions) [§3.9.1](https://spec.graphql.org/September2026/#sec-Enum-Extensions) [§3.10.2](https://spec.graphql.org/September2026/#sec-Input-Object-Extensions))

The shortest case, from `extensionTargetKind.2.invalid`:

```
input:    type Query { a: Int } extend interface Query { b: Int }
response: {"valid":true}
expected: invalid: breaks EXTENSION_TARGET_KIND and no other rule
```

<a id="schema-finding-8"></a>

#### 8. `extensionItemsNew`: EXTENSION_ITEMS_NEW not enforced: accepts a schema that breaks only this rule

5 cases, in `extension` (5). 1 of them rely on grammar or rules introduced in September 2025, not in October 2021.

- A type extension adds only fields, values or member types the type doesn't have (MUST, [§3.6.3](https://spec.graphql.org/September2026/#sec-Object-Extensions) [§3.7.1](https://spec.graphql.org/September2026/#sec-Interface-Extensions) [§3.8.1](https://spec.graphql.org/September2026/#sec-Union-Extensions) [§3.9.1](https://spec.graphql.org/September2026/#sec-Enum-Extensions) [§3.10.2](https://spec.graphql.org/September2026/#sec-Input-Object-Extensions))

The shortest case, from `extensionItemsNew.4.invalid`:

```
input:    enum E { A } type Query { e: E } extend enum E { A }
response: {"valid":true}
expected: invalid: breaks EXTENSION_ITEMS_NEW and no other rule
```

<a id="schema-finding-9"></a>

#### 9. `rootTypesAreObjects`: ROOT_TYPES_ARE_OBJECTS not enforced: accepts a schema that breaks only this rule

4 cases, in `root` (3), `extension` (1). 1 of them rely on grammar or rules introduced in September 2025, not in October 2021.

- Root operation types are object types (MUST, [§3.3.1](https://spec.graphql.org/September2026/#sec-Root-Operation-Types))

The shortest case, from `rootTypesAreObjects.2.invalid`:

```
input:    [since September 2025] type Query { a: Int } interface Mutation { a: Int }
response: {"valid":true}
expected: invalid: breaks ROOT_TYPES_ARE_OBJECTS and no other rule
```

<a id="schema-finding-10"></a>

#### 10. `argDefaultCompatible`: ARG_DEFAULT_COMPATIBLE not enforced: accepts a schema that breaks only this rule

4 cases, in `defaults` (4). All rely on grammar or rules introduced in September 2025, not in October 2021.

- An object field argument's default value coerces to its type (MUST, [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) [§3.9](https://spec.graphql.org/September2026/#sec-Enums) [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects) [§3.10.1](https://spec.graphql.org/September2026/#sec-OneOf-Input-Objects) [§3.11](https://spec.graphql.org/September2026/#sec-List) [§3.12](https://spec.graphql.org/September2026/#sec-Non-Null))

The shortest case, from `argDefaultCompatible.3.invalid`:

```
input:    [since September 2025] type Query { f(x: Int! = null): Int }
response: {"valid":true}
expected: invalid: breaks ARG_DEFAULT_COMPATIBLE and no other rule
```

<a id="schema-finding-11"></a>

#### 11. `implementsUnique`: IMPLEMENTS_UNIQUE not enforced: accepts a schema that breaks only this rule

4 cases, in `implementation` (2), `extension` (2).

- A type implements each interface once (MUST, [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces) [§3.7.1](https://spec.graphql.org/September2026/#sec-Interface-Extensions))

The shortest case, from `implementsUnique.1.invalid`:

```
input:    interface I { a: Int } type Query implements I & I { a: Int }
response: {"valid":true}
expected: invalid: breaks IMPLEMENTS_UNIQUE and no other rule
```

<a id="schema-finding-12"></a>

#### 12. `extensionItemsUnique`: EXTENSION_ITEMS_UNIQUE not enforced: accepts a schema that breaks only this rule

4 cases, in `extension` (4).

- A type extension's fields, values or member types are unique (MUST, [§3.6.3](https://spec.graphql.org/September2026/#sec-Object-Extensions) [§3.7.1](https://spec.graphql.org/September2026/#sec-Interface-Extensions) [§3.8.1](https://spec.graphql.org/September2026/#sec-Union-Extensions) [§3.9.1](https://spec.graphql.org/September2026/#sec-Enum-Extensions) [§3.10.2](https://spec.graphql.org/September2026/#sec-Input-Object-Extensions))

The shortest case, from `extensionItemsUnique.4.invalid`:

```
input:    enum E { A } type Query { e: E } extend enum E { B B }
response: {"valid":true}
expected: invalid: breaks EXTENSION_ITEMS_UNIQUE and no other rule
```

<a id="schema-finding-13"></a>

#### 13. `implArgInvariant`: IMPL_ARG_INVARIANT not enforced: accepts a schema that breaks only this rule

3 cases, in `implementation` (3).

- An implementation's field arguments have the interface's argument types (MUST, [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces))

The shortest case, from `implArgInvariant.1.invalid`:

```
input:    interface I { f(a: Int): Int } type Query implements I { f(a: Int!): Int }
response: {"valid":true}
expected: invalid: breaks IMPL_ARG_INVARIANT and no other rule
```

<a id="schema-finding-14"></a>

#### 14. `unionMembersObjects`: UNION_MEMBERS_OBJECTS: crashes on a schema that breaks only this rule, instead of rejecting it

3 cases, in `union` (3).

- A union's member types are object types (MUST, [§3.8](https://spec.graphql.org/September2026/#sec-Unions) [§3.8.1](https://spec.graphql.org/September2026/#sec-Union-Extensions))

The shortest case, from `unionMembersObjects.5.invalid`:

```
problem:  ArgumentNullException: Value cannot be null. (Parameter 'type')
input:    enum E { A } union U = Query | E type Query { u: U }
response: "the adapter answered with an error: ArgumentNullException: Value cannot be null. (Parameter 'type')"
expected: invalid: breaks UNION_MEMBERS_OBJECTS and no other rule
```

<a id="schema-finding-15"></a>

#### 15. `directiveReferencesItselfIndirectly`: DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY not enforced: accepts a schema that breaks only this rule

3 cases, in `directive` (3).

- A directive definition doesn't reference itself through a type or directive (MUST, [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))

The shortest case, from `directiveReferencesItselfIndirectly.2.invalid`:

```
input:    directive @d(a: Int @e) on ARGUMENT_DEFINITION directive @e(b: Int @d) on ARGUMENT_DEFINITION type Query { a: Int }
response: {"valid":true}
expected: invalid: breaks DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY and no other rule
```

<a id="schema-finding-16"></a>

#### 16. `implFieldCovariant`: IMPL_FIELD_COVARIANT not enforced: accepts a schema that breaks only this rule

3 cases, in `implementation` (3).

- An implementation's field returns a subtype of the interface field's type (MUST, [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces))

The shortest case, from `implFieldCovariant.6.invalid`:

```
input:    interface I { f: [I] } type Query implements I { f: [Int] }
response: {"valid":true}
expected: invalid: breaks IMPL_FIELD_COVARIANT and no other rule
```

<a id="schema-finding-17"></a>

#### 17. `typeNameNotBuiltin`: TYPE_NAME_NOT_BUILTIN not enforced: accepts a schema that breaks only this rule

2 cases, in `names` (2).

- No type is named like a built-in type (MUST, [§3.3](https://spec.graphql.org/September2026/#sec-Schema))

The shortest case, from `typeNameNotBuiltin.2.invalid`:

```
input:    type Int { a: String } type Query { a: String }
response: {"valid":true}
expected: invalid: breaks TYPE_NAME_NOT_BUILTIN and no other rule
```

<a id="schema-finding-18"></a>

#### 18. `schemaDefinitionUnique`: SCHEMA_DEFINITION_UNIQUE not enforced: accepts a schema that breaks only this rule

2 cases, in `root` (2).

- A document has at most one schema definition (MUST, [§3.3](https://spec.graphql.org/September2026/#sec-Schema))

The shortest case, from `schemaDefinitionUnique.1.invalid`:

```
input:    schema { query: Query } schema { query: Query } type Query { a: Int }
response: {"valid":true}
expected: invalid: breaks SCHEMA_DEFINITION_UNIQUE and no other rule
```

<a id="schema-finding-19"></a>

#### 19. `implementsInterfaces`: IMPLEMENTS_INTERFACES: crashes on a schema that breaks only this rule, instead of rejecting it

2 cases, in `implementation` (2).

- A type implements only interface types (MUST, [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces))

The shortest case, from `implementsInterfaces.1.invalid`:

```
problem:  InvalidCastException: Unable to cast object of type 'GraphQL.Types.ObjectGraphType' to type 'GraphQL.Types.IInterfaceGraphType'.
input:    type O { a: Int } type Query implements O { a: Int }
response: "the adapter answered with an error: InvalidCastException: Unable to cast object of type 'GraphQL.Types.ObjectGraphType' to type 'GraphQL.Types.IInterfaceGraphType'."
expected: invalid: breaks IMPLEMENTS_INTERFACES and no other rule
```

<a id="schema-finding-20"></a>

#### 20. `implementsItself`: IMPLEMENTS_ITSELF not enforced: accepts a schema that breaks only this rule

2 cases, in `implementation` (2).

- An interface doesn't implement itself (MUST, [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces))

The shortest case, from `implementsItself.1.invalid`:

```
input:    interface A implements A { x: Int } type Query { a: A }
response: {"valid":true}
expected: invalid: breaks IMPLEMENTS_ITSELF and no other rule
```

<a id="schema-finding-21"></a>

#### 21. `implDeprecation`: IMPL_DEPRECATION not enforced: accepts a schema that breaks only this rule

2 cases, in `implementation` (2). All rely on grammar or rules introduced in September 2025, not in October 2021.

- A deprecated implementation field implements a deprecated field (MUST, [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces))

The shortest case, from `implDeprecation.1.invalid`:

```
input:    [since September 2025] interface I { f: Int } type Query implements I { f: Int @deprecated }
response: {"valid":true}
expected: invalid: breaks IMPL_DEPRECATION and no other rule
```

<a id="schema-finding-22"></a>

#### 22. `unionMembersUnique`: UNION_MEMBERS_UNIQUE not enforced: accepts a schema that breaks only this rule

2 cases, in `union` (2).

- A union's member types are unique (MUST, [§3.8](https://spec.graphql.org/September2026/#sec-Unions))

The shortest case, from `unionMembersUnique.1.invalid`:

```
input:    union U = Query | Query type Query { u: U }
response: {"valid":true}
expected: invalid: breaks UNION_MEMBERS_UNIQUE and no other rule
```

<a id="schema-finding-23"></a>

#### 23. `unionMembersObjects`: UNION_MEMBERS_OBJECTS: crashes on a schema that breaks only this rule, instead of rejecting it

2 cases, in `union` (2).

- A union's member types are object types (MUST, [§3.8](https://spec.graphql.org/September2026/#sec-Unions) [§3.8.1](https://spec.graphql.org/September2026/#sec-Union-Extensions))

The shortest case, from `unionMembersObjects.1.invalid`:

```
problem:  NullReferenceException: Object reference not set to an instance of an object.
input:    union U = Int type Query { u: U }
response: "the adapter answered with an error: NullReferenceException: Object reference not set to an instance of an object."
expected: invalid: breaks UNION_MEMBERS_OBJECTS and no other rule
```

<a id="schema-finding-24"></a>

#### 24. `directiveUsesItself`: DIRECTIVE_USES_ITSELF not enforced: accepts a schema that breaks only this rule

2 cases, in `directive` (2).

- A directive definition doesn't use itself (MUST, [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))

The shortest case, from `directiveUsesItself.2.invalid`:

```
input:    directive @d(arg: String @d) on ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION type Query { a: Int }
response: {"valid":true}
expected: invalid: breaks DIRECTIVE_USES_ITSELF and no other rule
```

<a id="schema-finding-25"></a>

#### 25. `oneOfFieldNoDefault`: ONEOF_FIELD_NO_DEFAULT not enforced: accepts a schema that breaks only this rule

2 cases, in `input` (1), `extension` (1). All rely on grammar or rules introduced in September 2025, not in October 2021.

- A OneOf input object's fields have no default value (MUST, [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects) [§3.10.1](https://spec.graphql.org/September2026/#sec-OneOf-Input-Objects) [§3.10.2](https://spec.graphql.org/September2026/#sec-Input-Object-Extensions))

The shortest case, from `oneOfFieldNoDefault.2.invalid`:

```
input:    [since September 2025] input In @oneOf { a: Int = null b: String } type Query { f(i: In): Int }
response: {"valid":true}
expected: invalid: breaks ONEOF_FIELD_NO_DEFAULT and no other rule
```

<a id="schema-finding-26"></a>

#### 26. `acceptsValid`: rejects 2 valid schemas with the same error, one edit from schemas that break directiveLocationsValid or directiveReferencesItselfIndirectly: one cause, which the pairs don't pin on any one rule; the message says what the implementation checked; all rely on September 2026

2 cases, in `directive` (2). All rely on grammar or rules introduced in September 2026, not in October 2021.

Each rejected document is one edit from a document that breaks only `directiveLocationsValid` or `directiveReferencesItselfIndirectly`; which rule the implementation applied is a guess.

- Valid schemas are accepted (MUST, [§3](https://spec.graphql.org/September2026/#sec-Type-System))

The shortest case, from `directiveLocationsValid.19.valid`:

```
problem:  Syntax Error GraphQL (1:14) Expected "on", found @
input:    [since September 2026] directive @d @deprecated on FIELD type Query { a: Int }
response: {"valid":false,"errors":["Syntax Error GraphQL (1:14) Expected \"on\", found @\n1: directive @d @deprecated on FIELD type Query { a: Int }\n                ^\n"]}
expected: valid (TypeSystem!Verdict is empty)
```

<a id="schema-finding-27"></a>

#### 27. `extensionInterfacesNew`: EXTENSION_INTERFACES_NEW not enforced: accepts a schema that breaks only this rule

2 cases, in `extension` (2). 1 of them rely on grammar or rules introduced in September 2025, not in October 2021.

- An object type extension adds only interfaces the type doesn't implement (MUST, [§3.6.3](https://spec.graphql.org/September2026/#sec-Object-Extensions))

The shortest case, from `extensionInterfacesNew.1.invalid`:

```
input:    interface I { a: Int } interface J { a: Int } type Query implements I { a: Int } extend type Query implements I
response: {"valid":true}
expected: invalid: breaks EXTENSION_INTERFACES_NEW and no other rule
```

<a id="schema-finding-28"></a>

#### 28. `implFieldProvided`: IMPL_FIELD_PROVIDED not enforced: accepts a schema that breaks only this rule

2 cases, in `extension` (2).

- An implementation has every field of the interface (MUST, [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces) [§3.6.3](https://spec.graphql.org/September2026/#sec-Object-Extensions) [§3.7.1](https://spec.graphql.org/September2026/#sec-Interface-Extensions))

The shortest case, from `implFieldProvided.6.invalid`:

```
input:    interface K { k: Int } interface I { a: Int } type Query implements I & K { a: Int k: Int } extend interface I implements K
response: {"valid":true}
expected: invalid: breaks IMPL_FIELD_PROVIDED and no other rule
```

<a id="schema-finding-29"></a>

#### 29. `extensionOneOf`: EXTENSION_ONEOF not enforced: accepts a schema that breaks only this rule

2 cases, in `extension` (2). All rely on grammar or rules introduced in September 2025, not in October 2021.

- An input object type extension doesn't apply @oneOf (MUST, [§3.10.2](https://spec.graphql.org/September2026/#sec-Input-Object-Extensions) [§3.10.1](https://spec.graphql.org/September2026/#sec-OneOf-Input-Objects))

The shortest case, from `extensionOneOf.1.invalid`:

```
input:    [since September 2025] input In { a: Int } type Query { f(i: In): Int } extend input In @oneOf
response: {"valid":true}
expected: invalid: breaks EXTENSION_ONEOF and no other rule
```

<a id="schema-finding-30"></a>

#### 30. `specifiedByNotBuiltin`: SPECIFIED_BY_NOT_BUILTIN not enforced: accepts a schema that breaks only this rule

2 cases, in `extension` (2).

- @specifiedBy isn't applied to a built-in scalar (MUST, [§3.13.4](https://spec.graphql.org/September2026/#sec--specifiedBy) [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) [§3.5.6](https://spec.graphql.org/September2026/#sec-Scalar-Extensions))

The shortest case, from `specifiedByNotBuiltin.1.invalid`:

```
input:    type Query { a: Int } extend scalar Int @specifiedBy(url: "https://example.com/int")
response: {"valid":true}
expected: invalid: breaks SPECIFIED_BY_NOT_BUILTIN and no other rule
```

<a id="schema-finding-31"></a>

#### 31. `requiredArgNotDeprecated`: REQUIRED_ARG_NOT_DEPRECATED not enforced: accepts a schema that breaks only this rule

1 case, in `typeUse` (1). All rely on grammar or rules introduced in September 2025, not in October 2021.

- A required argument isn't deprecated (MUST, [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.13.3](https://spec.graphql.org/September2026/#sec--deprecated))

The shortest case, from `requiredArgNotDeprecated.4.invalid`:

```
input:    [since September 2025] directive @d(x: Int! @deprecated) on FIELD type Query { a: Int }
response: {"valid":true}
expected: invalid: breaks REQUIRED_ARG_NOT_DEPRECATED and no other rule
```

<a id="schema-finding-32"></a>

#### 32. `implTransitive`: IMPL_TRANSITIVE not enforced: accepts a schema that breaks only this rule

1 case, in `implementation` (1).

- A type also implements the interfaces its interfaces implement (MUST, [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces))

The shortest case, from `implTransitive.1.invalid`:

```
input:    interface Node { id: ID } interface Resource implements Node { id: ID url: String } type Image implements Resource { id: ID url: String } type Query { i: Image }
response: {"valid":true}
expected: invalid: breaks IMPL_TRANSITIVE and no other rule
```

<a id="schema-finding-33"></a>

#### 33. `acceptsValid`: rejects a valid schema, one edit from a schema that breaks only implFieldCovariant; which rule it applied is a guess: the message says what the implementation checked

1 case, in `implementation` (1).

Each rejected document is one edit from a document that breaks only `implFieldCovariant`; which rule the implementation applied is a guess.

- Valid schemas are accepted (MUST, [§3](https://spec.graphql.org/September2026/#sec-Type-System))

The shortest case, from `implFieldCovariant.3.valid`:

```
problem:  Type ObjectGraphType with name 'Query' does not implement interface InterfaceGraphType with name 'Node'. Field 'f' must be of type 'Node' or covariant from it, but in fact it is of type 'Query'.
input:    interface Node { f: Node } type Other { x: Int } type Query implements Node { f: Query }
response: {"valid":false,"errors":["Type ObjectGraphType with name 'Query' does not implement interface InterfaceGraphType with name 'Node'. Field 'f' must be of type 'Node' or covariant from it, but in fact it is of type 'Query'."]}
expected: valid (TypeSystem!Verdict is empty)
```

<a id="schema-finding-34"></a>

#### 34. `enumValuesUnique`: ENUM_VALUES_UNIQUE not enforced: accepts a schema that breaks only this rule

1 case, in `enum` (1).

- An enum's values are unique (MUST, [§3.9](https://spec.graphql.org/September2026/#sec-Enums))

The shortest case, from `enumValuesUnique.1.invalid`:

```
input:    enum E { A A } type Query { e: E }
response: {"valid":true}
expected: invalid: breaks ENUM_VALUES_UNIQUE and no other rule
```

<a id="schema-finding-35"></a>

#### 35. `directiveLocationsValid`: DIRECTIVE_LOCATIONS_VALID: crashes on a schema that breaks only this rule, instead of rejecting it

1 case, in `directive` (1).

- Every directive the document applies is at a location it is declared for (MUST, [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))

The shortest case, from `directiveLocationsValid.7.invalid`:

```
problem:  NotSupportedException: UnionGraphType
input:    directive @d on OBJECT union U @d = Query type Query { a: U }
response: "the adapter answered with an error: NotSupportedException: UnionGraphType"
expected: invalid: breaks DIRECTIVE_LOCATIONS_VALID and no other rule
```

<a id="schema-finding-36"></a>

#### 36. `acceptsValid`: rejects a valid schema, one edit from a schema that breaks only directiveReferencesItselfIndirectly; which rule it applied is a guess: the message says what the implementation checked

1 case, in `directive` (1).

Each rejected document is one edit from a document that breaks only `directiveReferencesItselfIndirectly`; which rule the implementation applied is a guess.

- Valid schemas are accepted (MUST, [§3](https://spec.graphql.org/September2026/#sec-Type-System))

The shortest case, from `directiveReferencesItselfIndirectly.7.valid`:

```
problem:  All types within a GraphQL schema must have unique names. No two provided types may have the same name.
input:    directive @d(arg: Int @e) on ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION directive @e(arg: X) on ARGUMENT_DEFINITION directive @Y on INPUT_FIELD_DEFINITION input X { a: Y @Y } input Y { b: Int } type Query { a: Int }
response: {"valid":false,"errors":["All types within a GraphQL schema must have unique names. No two provided types may have the same name.\nSchema contains a redefinition of these types: Y (Parameter 'document')"]}
expected: valid (TypeSystem!Verdict is empty)
```

<a id="schema-finding-37"></a>

#### 37. `unionMembersObjects`: UNION_MEMBERS_OBJECTS not enforced: accepts a schema that breaks only this rule

1 case, in `extension` (1).

- A union's member types are object types (MUST, [§3.8](https://spec.graphql.org/September2026/#sec-Unions) [§3.8.1](https://spec.graphql.org/September2026/#sec-Union-Extensions))

The shortest case, from `unionMembersObjects.7.invalid`:

```
input:    type A { a: Int } type Query { a: Int } union U = Query extend union U = Int
response: {"valid":true}
expected: invalid: breaks UNION_MEMBERS_OBJECTS and no other rule
```

<a id="schema-finding-38"></a>

#### 38. `oneOfFieldNullable`: ONEOF_FIELD_NULLABLE not enforced: accepts a schema that breaks only this rule

1 case, in `extension` (1). All rely on grammar or rules introduced in September 2025, not in October 2021.

- A OneOf input object's fields are nullable (MUST, [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects) [§3.10.1](https://spec.graphql.org/September2026/#sec-OneOf-Input-Objects) [§3.10.2](https://spec.graphql.org/September2026/#sec-Input-Object-Extensions))

The shortest case, from `oneOfFieldNullable.4.invalid`:

```
input:    [since September 2025] input In @oneOf { a: Int } type Query { f(i: In): Int } extend input In { b: String! }
response: {"valid":true}
expected: invalid: breaks ONEOF_FIELD_NULLABLE and no other rule
```

<a id="schema-finding-39"></a>

#### 39. `rootTypesDifferent`: ROOT_TYPES_DIFFERENT not enforced: accepts a schema that breaks only this rule

1 case, in `extension` (1).

- Root operation types are all different (MUST, [§3.3.1](https://spec.graphql.org/September2026/#sec-Root-Operation-Types))

The shortest case, from `rootTypesDifferent.4.invalid`:

```
input:    schema { query: Query } type Query { a: Int } type M { a: Int } extend schema { mutation: Query }
response: {"valid":true}
expected: invalid: breaks ROOT_TYPES_DIFFERENT and no other rule
```

<a id="schema-finding-40"></a>

#### 40. `acceptsValid`: rejects a valid schema, one edit from a schema that breaks only directiveExtensionNotReapplied; which rule it applied is a guess: the message says what the implementation checked; all rely on September 2026

1 case, in `extension` (1). All rely on grammar or rules introduced in September 2026, not in October 2021.

Each rejected document is one edit from a document that breaks only `directiveExtensionNotReapplied`; which rule the implementation applied is a guess.

- Valid schemas are accepted (MUST, [§3](https://spec.graphql.org/September2026/#sec-Type-System))

The shortest case, from `directiveExtensionNotReapplied.2.valid`:

```
problem:  Syntax Error GraphQL (1:52) Expected "schema/scalar/type/interface/union/enum/input", found Name "directive"
input:    [since September 2026] directive @d on FIELD type Query { a: Int } extend directive @d @deprecated(reason: "x")
response: {"valid":false,"errors":["Syntax Error GraphQL (1:52) Expected \"schema/scalar/type/interface/union/enum/input\", found Name \"directive\"\n1: directive @d on FIELD type Query { a: Int } extend directive @d @deprecated(reason: \"x\")\n                                                      ^\n"]}
expected: valid (TypeSystem!Verdict is empty)
```

### Every check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **(k since September 2025, j new in September 2026), (all …):** k of the n failing cases rely on grammar or rules introduced in September 2025, and j on ones introduced in September 2026; none of them is in the October 2021 edition. The symbol still gives the check's level.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it. **– needs `x`:** the adapter doesn't claim capability `x`, which the check needs.
- **n/a:** the adapter doesn't take part in this area, or its report predates the check.

| Check | Level | Spec | Result |
| --- | :---: | :---: | :---: |
| No two types have the same name (`typeNamesUnique`) | MUST | [§3.3](https://spec.graphql.org/September2026/#sec-Schema) | ✓ 4 |
| No type is named like a built-in type (`typeNameNotBuiltin`) | MUST | [§3.3](https://spec.graphql.org/September2026/#sec-Schema) | ✗ 2/3 |
| No type name begins with __ (`typeNameReserved`) | MUST | [§3.3](https://spec.graphql.org/September2026/#sec-Schema) | ✓ 6 |
| No two directives have the same name (`directiveNamesUnique`) | MUST | [§3.3](https://spec.graphql.org/September2026/#sec-Schema) | ✓ 1 |
| No directive name begins with __ (`directiveNameReserved`) | MUST | [§3.3](https://spec.graphql.org/September2026/#sec-Schema) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | ✓ 1 |
| A document has at most one schema definition (`schemaDefinitionUnique`) | MUST | [§3.3](https://spec.graphql.org/September2026/#sec-Schema) | ✗ 2/2 |
| The query root operation type is provided (`queryRootProvided`) | MUST | [§3.3.1](https://spec.graphql.org/September2026/#sec-Root-Operation-Types) | ✓ 2 |
| Root operation types are object types (`rootTypesAreObjects`) | MUST | [§3.3.1](https://spec.graphql.org/September2026/#sec-Root-Operation-Types) | ✗ 4/7 (1 since September 2025) |
| Root operation types are all different (`rootTypesDifferent`) | MUST | [§3.3.1](https://spec.graphql.org/September2026/#sec-Root-Operation-Types) | ✗ 1/4 |
| An object or interface type defines one or more fields (`fieldsDefined`) | MUST | [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces) | ✓ 2 |
| Field names are unique within a type (`fieldNamesUnique`) | MUST | [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces) | ✓ 3 |
| No field name begins with __ (`fieldNameReserved`) | MUST | [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces) | ✓ 3 |
| Fields return output types (`fieldOutputType`) | MUST | [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces) [§3.4.2](https://spec.graphql.org/September2026/#sec-Input-and-Output-Types) | ✓ 4 |
| No argument name begins with __ (`argNameReserved`) | MUST | [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | ✓ 3 |
| Argument names are unique within a field or directive (`argNamesUnique`). New in September 2025: October 2021 doesn't have argument name uniqueness | MUST (since September 2025) | [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | ✓ 3 |
| Arguments accept input types (`argInputType`) | MUST | [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) [§3.4.2](https://spec.graphql.org/September2026/#sec-Input-and-Output-Types) | ✓ 6 |
| A required argument isn't deprecated (`requiredArgNotDeprecated`). New in September 2025: October 2021 doesn't have deprecated arguments | MUST (since September 2025) | [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.13.3](https://spec.graphql.org/September2026/#sec--deprecated) | ✗ 1/4 (all since September 2025) |
| An object field argument's default value coerces to its type (`argDefaultCompatible`). New in September 2025: October 2021 doesn't have default value validation | MUST (since September 2025) | [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) [§3.9](https://spec.graphql.org/September2026/#sec-Enums) [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects) [§3.10.1](https://spec.graphql.org/September2026/#sec-OneOf-Input-Objects) [§3.11](https://spec.graphql.org/September2026/#sec-List) [§3.12](https://spec.graphql.org/September2026/#sec-Non-Null) | ✗ 4/14 (all since September 2025) |
| A type implements each interface once (`implementsUnique`) | MUST | [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces) [§3.7.1](https://spec.graphql.org/September2026/#sec-Interface-Extensions) | ✗ 4/4 |
| A type implements only interface types (`implementsInterfaces`) | MUST | [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces) | ✗ 2/3 |
| An interface doesn't implement itself (`implementsItself`) | MUST | [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces) | ✗ 2/2 |
| A type also implements the interfaces its interfaces implement (`implTransitive`) | MUST | [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces) | ✗ 1/3 |
| An implementation has every field of the interface (`implFieldProvided`) | MUST | [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces) [§3.6.3](https://spec.graphql.org/September2026/#sec-Object-Extensions) [§3.7.1](https://spec.graphql.org/September2026/#sec-Interface-Extensions) | ✗ 2/5 |
| An implementation's field has every argument of the interface field (`implArgProvided`) | MUST | [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces) | ✓ 2 |
| An implementation's field arguments have the interface's argument types (`implArgInvariant`) | MUST | [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces) | ✗ 3/5 |
| An implementation's additional arguments aren't required (`implExtraArgOptional`) | MUST | [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces) | ✓ 2 |
| An implementation's field returns a subtype of the interface field's type (`implFieldCovariant`) | MUST | [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces) | ✗ 3/9 |
| A deprecated implementation field implements a deprecated field (`implDeprecation`). New in September 2025: October 2021 doesn't have deprecation of implementing fields | MUST (since September 2025) | [§3.6](https://spec.graphql.org/September2026/#sec-Objects) [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces) | ✗ 2/2 (all since September 2025) |
| A union has one or more member types (`unionMembersDefined`) | MUST | [§3.8](https://spec.graphql.org/September2026/#sec-Unions) | ✓ 1 |
| A union's member types are unique (`unionMembersUnique`) | MUST | [§3.8](https://spec.graphql.org/September2026/#sec-Unions) | ✗ 2/2 |
| A union's member types are object types (`unionMembersObjects`) | MUST | [§3.8](https://spec.graphql.org/September2026/#sec-Unions) [§3.8.1](https://spec.graphql.org/September2026/#sec-Union-Extensions) | ✗ 6/7 |
| An enum has one or more values (`enumValuesDefined`) | MUST | [§3.9](https://spec.graphql.org/September2026/#sec-Enums) | ✓ 1 |
| An enum's values are unique (`enumValuesUnique`) | MUST | [§3.9](https://spec.graphql.org/September2026/#sec-Enums) | ✗ 1/1 |
| No enum value begins with __ (`enumValueNameReserved`) | MUST | [§4](https://spec.graphql.org/September2026/#sec-Introspection) | ✓ 1 |
| An input object has one or more fields (`inputFieldsDefined`) | MUST | [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects) | ✓ 1 |
| Input field names are unique within an input object (`inputFieldNamesUnique`) | MUST | [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects) | ✓ 1 |
| No input field name begins with __ (`inputFieldNameReserved`) | MUST | [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects) | ✓ 1 |
| Input fields accept input types (`inputFieldInputType`) | MUST | [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects) [§3.4.2](https://spec.graphql.org/September2026/#sec-Input-and-Output-Types) | ✓ 4 |
| A required input field isn't deprecated (`requiredInputFieldNotDeprecated`). New in September 2025: October 2021 doesn't have deprecated input fields | MUST (since September 2025) | [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects) [§3.13.3](https://spec.graphql.org/September2026/#sec--deprecated) | ✓ 1 |
| A OneOf input object's fields are nullable (`oneOfFieldNullable`). New in September 2025: October 2021 doesn't have OneOf input objects | MUST (since September 2025) | [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects) [§3.10.1](https://spec.graphql.org/September2026/#sec-OneOf-Input-Objects) [§3.10.2](https://spec.graphql.org/September2026/#sec-Input-Object-Extensions) | ✗ 1/4 (all since September 2025) |
| A OneOf input object's fields have no default value (`oneOfFieldNoDefault`). New in September 2025: October 2021 doesn't have OneOf input objects | MUST (since September 2025) | [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects) [§3.10.1](https://spec.graphql.org/September2026/#sec-OneOf-Input-Objects) [§3.10.2](https://spec.graphql.org/September2026/#sec-Input-Object-Extensions) | ✗ 2/3 (all since September 2025) |
| An input object can be given a finite value (`inputObjectUnbreakableCycle`) | MUST | [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects) | ✗ 5/5 (3 new in September 2026) |
| Input object default values don't form a cycle (`inputObjectDefaultValueCycle`). New in September 2025: October 2021 doesn't have default value validation | MUST (since September 2025) | [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects) | ✓ 4 |
| A directive has one or more locations (`directiveLocationsDefined`). New in September 2025: October 2021 doesn't have the rule that a directive definition includes a location. SDL can't write a directive without locations, so no vector breaks this rule | MUST (since September 2025) | [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | – |
| A directive definition doesn't use itself (`directiveUsesItself`) | MUST | [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | ✗ 2/3 |
| A directive definition doesn't reference itself through a type or directive (`directiveReferencesItselfIndirectly`) | MUST | [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | ✗ 3/5 |
| Every directive the document applies is defined, or built in (`directivesDefined`) | MUST | [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | ✓ 3 |
| Every directive the document applies is at a location it is declared for (`directiveLocationsValid`) | MUST | [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | ✗ 9/28 |
| A type extension extends a type that is defined (`extensionTargetDefined`) | MUST | [§3.5.6](https://spec.graphql.org/September2026/#sec-Scalar-Extensions) [§3.6.3](https://spec.graphql.org/September2026/#sec-Object-Extensions) [§3.7.1](https://spec.graphql.org/September2026/#sec-Interface-Extensions) [§3.8.1](https://spec.graphql.org/September2026/#sec-Union-Extensions) [§3.9.1](https://spec.graphql.org/September2026/#sec-Enum-Extensions) [§3.10.2](https://spec.graphql.org/September2026/#sec-Input-Object-Extensions) | ✗ 6/6 |
| A type extension extends a type of its own kind (`extensionTargetKind`) | MUST | [§3.5.6](https://spec.graphql.org/September2026/#sec-Scalar-Extensions) [§3.6.3](https://spec.graphql.org/September2026/#sec-Object-Extensions) [§3.7.1](https://spec.graphql.org/September2026/#sec-Interface-Extensions) [§3.8.1](https://spec.graphql.org/September2026/#sec-Union-Extensions) [§3.9.1](https://spec.graphql.org/September2026/#sec-Enum-Extensions) [§3.10.2](https://spec.graphql.org/September2026/#sec-Input-Object-Extensions) | ✗ 5/6 |
| A type extension's fields, values or member types are unique (`extensionItemsUnique`) | MUST | [§3.6.3](https://spec.graphql.org/September2026/#sec-Object-Extensions) [§3.7.1](https://spec.graphql.org/September2026/#sec-Interface-Extensions) [§3.8.1](https://spec.graphql.org/September2026/#sec-Union-Extensions) [§3.9.1](https://spec.graphql.org/September2026/#sec-Enum-Extensions) [§3.10.2](https://spec.graphql.org/September2026/#sec-Input-Object-Extensions) | ✗ 4/5 |
| A type extension adds only fields, values or member types the type doesn't have (`extensionItemsNew`) | MUST | [§3.6.3](https://spec.graphql.org/September2026/#sec-Object-Extensions) [§3.7.1](https://spec.graphql.org/September2026/#sec-Interface-Extensions) [§3.8.1](https://spec.graphql.org/September2026/#sec-Union-Extensions) [§3.9.1](https://spec.graphql.org/September2026/#sec-Enum-Extensions) [§3.10.2](https://spec.graphql.org/September2026/#sec-Input-Object-Extensions) | ✗ 5/7 (1 since September 2025) |
| An object type extension adds only interfaces the type doesn't implement (`extensionInterfacesNew`) | MUST | [§3.6.3](https://spec.graphql.org/September2026/#sec-Object-Extensions) | ✗ 2/2 (1 since September 2025) |
| An extension doesn't apply a non-repeatable directive again (`extensionDirectivesNotReapplied`) | MUST | [§3.3.2](https://spec.graphql.org/September2026/#sec-Schema-Extension) [§3.5.6](https://spec.graphql.org/September2026/#sec-Scalar-Extensions) [§3.6.3](https://spec.graphql.org/September2026/#sec-Object-Extensions) [§3.7.1](https://spec.graphql.org/September2026/#sec-Interface-Extensions) [§3.8.1](https://spec.graphql.org/September2026/#sec-Union-Extensions) [§3.9.1](https://spec.graphql.org/September2026/#sec-Enum-Extensions) [§3.10.2](https://spec.graphql.org/September2026/#sec-Input-Object-Extensions) | ✗ 7/10 |
| An input object type extension doesn't apply @oneOf (`extensionOneOf`). New in September 2025: October 2021 doesn't have OneOf input objects | MUST (since September 2025) | [§3.10.2](https://spec.graphql.org/September2026/#sec-Input-Object-Extensions) [§3.10.1](https://spec.graphql.org/September2026/#sec-OneOf-Input-Objects) | ✗ 2/2 (all since September 2025) |
| A schema extension extends a schema (`schemaExtensionDefined`). Never graded: every vector that breaks it is unspecified: the spec doesn't say whether a document without a schema definition has a schema that is already defined | MUST | [§3.3.2](https://spec.graphql.org/September2026/#sec-Schema-Extension) | – |
| @specifiedBy isn't applied to a built-in scalar (`specifiedByNotBuiltin`) | MUST | [§3.13.4](https://spec.graphql.org/September2026/#sec--specifiedBy) [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) [§3.5.6](https://spec.graphql.org/September2026/#sec-Scalar-Extensions) | ✗ 2/2 |
| A directive extension extends a defined directive (`directiveExtensionDefined`). New in September 2026: October 2021 doesn't have directive extensions | MUST (new in September 2026) | [§3.13.6](https://spec.graphql.org/September2026/#sec-Directive-Extensions) | ✓ 1 |
| A directive extension doesn't apply a non-repeatable directive again (`directiveExtensionNotReapplied`). New in September 2026: October 2021 doesn't have directive extensions | MUST (new in September 2026) | [§3.13.6](https://spec.graphql.org/September2026/#sec-Directive-Extensions) | ✓ 3 |
| A directive extension doesn't apply the directive it extends (`directiveExtensionUsesPrevious`). New in September 2026: October 2021 doesn't have directive extensions | MUST (new in September 2026) | [§3.13.6](https://spec.graphql.org/September2026/#sec-Directive-Extensions) | ✓ 1 |
| A directive extension doesn't reference the directive it extends through a type or directive (`directiveExtensionReferencesPrevious`). New in September 2026: October 2021 doesn't have directive extensions | MUST (new in September 2026) | [§3.13.6](https://spec.graphql.org/September2026/#sec-Directive-Extensions) | ✓ 4 |
| A definition doesn't apply a non-repeatable directive twice to one element (`directiveNotRepeated`) | INFO | [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) [§5.7.3](https://spec.graphql.org/September2026/#sec-Directives-Are-Unique-per-Location) | ✓ 3 |
| A directive applied in SDL has the arguments its definition gives it (`appliedDirectiveArguments`) | INFO | [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) [§2.13](https://spec.graphql.org/September2026/#sec-Language.Directives) [§5.4](https://spec.graphql.org/September2026/#sec-Validation.Arguments) | i 7/9 (1 since September 2025) |
| Valid schemas are accepted (`acceptsValid`) | MUST | [§3](https://spec.graphql.org/September2026/#sec-Type-System) | ✗ 16/255 (14 new in September 2026) |

- **Basis for `typeNamesUnique`:** §3.3: "All types within a GraphQL schema must have unique names. No two provided types may have the same name."
- **Basis for `typeNameNotBuiltin`:** §3.3: "No provided type may have a name which conflicts with any built in types (including Scalar and Introspection types)."
- **Basis for `typeNameReserved`:** §3.3: "All types and directives defined within a schema must not have a name which begins with "__" (two underscores)"
- **Basis for `directiveNamesUnique`:** §3.3: "All directives within a GraphQL schema must have unique names."
- **Basis for `directiveNameReserved`:** §3.3: "All types and directives defined within a schema must not have a name which begins with "__" (two underscores)", and §3.13 Type Validation: "The Directive must not have a name which begins with the characters "__" (two underscores)."
- **Basis for `schemaDefinitionUnique`:** §3.3: "When using the type system definition language, a document must include at most one schema definition." The same sentence is in October 2021.
- **Basis for `queryRootProvided`:** §3.3.1: "The query root operation type must be provided and must be an Object type."
- **Basis for `rootTypesAreObjects`:** §3.3.1: "The query root operation type must be provided and must be an Object type." For mutation: "If it is provided, it must be an Object type", and "Similarly" for subscription. A root operation type the document names but doesn't define isn't an Object type. Without a schema definition, a type named Mutation is the mutation root ("would be incorrectly presumed to be the mutation root operation type", in an example), so one that isn't an Object type breaks this rule. Reading it as no mutation root rejects the document too: "The type system definition language can omit the schema definition when each root operation type uses its respective default root type name, no other type uses any default root type name, and the schema does not have a description", and such a Mutation would be another type that uses a default root type name. That clause is new in September 2025, so `rootTypesAreObjects.2.invalid` has `since` September 2025: October 2021 says only "can omit the schema definition when the query, mutation, and subscription root types are named "Query", "Mutation", and "Subscription" respectively".
- **Basis for `rootTypesDifferent`:** §3.3.1: "The query, mutation, and subscription root types must all be different types if provided."
- **Basis for `fieldsDefined`:** §3.6 Type Validation: "An Object type must define one or more fields." §3.7: "An Interface type must define one or more fields."
- **Basis for `fieldNamesUnique`:** §3.6 Type Validation (and the same item of §3.7 for interfaces): "The field must have a unique name within that Object type; no two fields may share the same name."
- **Basis for `fieldNameReserved`:** §3.6 Type Validation (and the same item of §3.7 for interfaces): "The field must not have a name which begins with the characters "__" (two underscores)."
- **Basis for `fieldOutputType`:** §3.6 Type Validation (and the same item of §3.7 for interfaces): "The field must return a type where IsOutputType(fieldType) returns true." §3.4.2's IsOutputType returns true only for a Scalar, Object, Interface, Union or Enum type, and otherwise "Return false", so a type the document doesn't define fails it too.
- **Basis for `argNameReserved`:** §3.6, §3.7 and §3.13 Type Validation, for each argument of a field or directive: "The argument must not have a name which begins with the characters "__" (two underscores)."
- **Basis for `argNamesUnique`:** §3.6 and §3.7 Type Validation: "The argument must have a unique name within that field; no two arguments may share the same name." §3.13: "The argument must have a unique name within that Directive; no two arguments may share the same name." September 2025 has both sentences; October 2021's lists have neither.
- **Basis for `argInputType`:** §3.6, §3.7 and §3.13 Type Validation, for each argument of a field or directive: "The argument must accept a type where IsInputType(argumentType) returns true." §3.4.2's IsInputType returns true only for a Scalar, Enum or Input Object type, and otherwise "Return false", so a type the document doesn't define fails it too.
- **Basis for `requiredArgNotDeprecated`:** §3.6 Type Validation: "If argument type is Non-Null and a default value is not defined: The @deprecated directive must not be applied to this argument." §3.13.3 states it for every argument, interface and directive arguments included: "The @deprecated directive must not appear on required (non-null without a default) arguments or input object field definitions."
- **Basis for `argDefaultCompatible`:** §3.6 Type Validation: "If the argument has a default value it must be compatible with argumentType as per the coercion rules for that type." The coercion rules are each type's Input Coercion: §3.5 ("If an input value does not match a coercion rule, a request error must be raised"), §3.9, §3.10 ("must not contain any entries with names not defined by a field of this input object type, otherwise a request error must be raised"), §3.10.1 ("must contain exactly one entry and that entry must not be null"), §3.11 and §3.12. A required input field the default leaves out is incompatible by §3.12: "If an argument or input-object field of a Non-Null type is not provided, is provided with the literal value null, ... then a request error must be raised." (§3.10's own sentence for that case says only "an error should be raised".)
- **Basis for `implementsUnique`:** §3.6 Type Validation, a list "This set of rules must be adhered to by every Object type": "An object type may declare that it implements one or more unique interfaces." §3.7: "An interface type may declare that it implements one or more unique interfaces, but may not implement itself." For extended interface types (tagged `schema-extensions`): §3.7.1 has no rule like §3.6.3's "Any interfaces provided must not be already implemented by the previous Object type", but its extensions add to the interface type ("Interface type extensions are used to represent an interface which has been extended from some previous interface"), so one that adds an interface the type already implements leaves the resulting type implementing it twice, which §3.7's rule forbids. October 2021 says the same.
- **Basis for `implementsInterfaces`:** §3.6 Type Validation: "An object type may declare that it implements one or more unique interfaces" and "For each interface declared implemented as interfaceType, IsValidImplementation(objectType, interfaceType) must be true"; §3.7 says the same of interfaces. A type that isn't an interface, or isn't defined, can't be implemented.
- **Basis for `implementsItself`:** §3.7 Type Validation: "An interface type may declare that it implements one or more unique interfaces, but may not implement itself." The prose: "Interface definitions must not contain cyclic references nor implement themselves."
- **Basis for `implTransitive`:** §3.6 IsValidImplementation(type, implementedType), applied by "For each interface declared implemented as interfaceType, IsValidImplementation(objectType, interfaceType) must be true" (§3.6) and "IsValidImplementation(implementingType, implementedType) must be true" (§3.7): "If implementedType declares it implements any interfaces, type must also declare it implements those interfaces." A cycle of interfaces breaks it, and §3.7's "Interface definitions must not contain cyclic references nor implement themselves".
- **Basis for `implFieldProvided`:** §3.6 IsValidImplementation(type, implementedType), applied by "For each interface declared implemented as interfaceType, IsValidImplementation(objectType, interfaceType) must be true" (§3.6) and "IsValidImplementation(implementingType, implementedType) must be true" (§3.7): "type must include a field of the same name for every field defined in implementedType." For extended types (tagged `schema-extensions`): §3.6.3, "The resulting extended object type must be a super-set of all interfaces it implements", and §3.7.1, "Any Object or Interface type which implemented the previous Interface type must also be a super-set of the fields of the Interface type extension (which may be due to Object type extension)."
- **Basis for `implArgProvided`:** §3.6 IsValidImplementation(type, implementedType), applied by "For each interface declared implemented as interfaceType, IsValidImplementation(objectType, interfaceType) must be true" (§3.6) and "IsValidImplementation(implementingType, implementedType) must be true" (§3.7): "field must include an argument of the same name for every argument defined in implementedField."
- **Basis for `implArgInvariant`:** §3.6 IsValidImplementation(type, implementedType), applied by "For each interface declared implemented as interfaceType, IsValidImplementation(objectType, interfaceType) must be true" (§3.6) and "IsValidImplementation(implementingType, implementedType) must be true" (§3.7): "That named argument on field must accept the same type (invariant) as that named argument on implementedField."
- **Basis for `implExtraArgOptional`:** §3.6 IsValidImplementation(type, implementedType), applied by "For each interface declared implemented as interfaceType, IsValidImplementation(objectType, interfaceType) must be true" (§3.6) and "IsValidImplementation(implementingType, implementedType) must be true" (§3.7): "field may include additional arguments not defined in implementedField, but any additional argument must not be required, e.g. must not be of a non-nullable type."
- **Basis for `implFieldCovariant`:** §3.6 IsValidImplementation(type, implementedType), applied by "For each interface declared implemented as interfaceType, IsValidImplementation(objectType, interfaceType) must be true" (§3.6) and "IsValidImplementation(implementingType, implementedType) must be true" (§3.7): "field must return a type which is equal to or a sub-type of (covariant) the return type of implementedField field's return type"
- **Basis for `implDeprecation`:** §3.6 IsValidImplementation(type, implementedType), applied by "For each interface declared implemented as interfaceType, IsValidImplementation(objectType, interfaceType) must be true" (§3.6) and "IsValidImplementation(implementingType, implementedType) must be true" (§3.7): "If field is deprecated then implementedField must also be deprecated."
- **Basis for `unionMembersDefined`:** §3.8 Type Validation: "A Union type must include one or more unique member types."
- **Basis for `unionMembersUnique`:** §3.8 Type Validation: "A Union type must include one or more unique member types."
- **Basis for `unionMembersObjects`:** §3.8 Type Validation: "The member types of a Union type must all be Object base types; Scalar, Interface and Union types must not be member types of a Union." A member the document doesn't define isn't an Object type. §3.8.1 says the same of a union type extension's member types: "The member types of a Union type extension must all be Object base types".
- **Basis for `enumValuesDefined`:** §3.9 Type Validation: "An Enum type must define one or more unique enum values."
- **Basis for `enumValuesUnique`:** §3.9 Type Validation: "An Enum type must define one or more unique enum values."
- **Basis for `enumValueNameReserved`:** §4 Reserved Names: "Otherwise, any Name within a GraphQL type system must not start with two underscores "__"." §3.9 has no rule of its own about "__".
- **Basis for `inputFieldsDefined`:** §3.10 Type Validation: "An Input Object type must define one or more input fields."
- **Basis for `inputFieldNamesUnique`:** §3.10 Type Validation: "The input field must have a unique name within that Input Object type; no two input fields may share the same name."
- **Basis for `inputFieldNameReserved`:** §3.10 Type Validation: "The input field must not have a name which begins with the characters "__" (two underscores)."
- **Basis for `inputFieldInputType`:** §3.10 Type Validation: "The input field must accept a type where IsInputType(inputFieldType) returns true."
- **Basis for `requiredInputFieldNotDeprecated`:** §3.10 Type Validation: "If input field type is Non-Null and a default value is not defined: The @deprecated directive must not be applied to this input field." §3.13.3: "The @deprecated directive must not appear on required (non-null without a default) arguments or input object field definitions."
- **Basis for `oneOfFieldNullable`:** §3.10 Type Validation: "If the Input Object is a OneOf Input Object then: The type of the input field must be nullable." §3.10.2, for an extension: "If the original Input Object is a OneOf Input Object then: All fields of the Input Object type extension must be nullable."
- **Basis for `oneOfFieldNoDefault`:** §3.10 Type Validation: "If the Input Object is a OneOf Input Object then: ... The input field must not have a default value." §3.10.2, for an extension: "If the original Input Object is a OneOf Input Object then: ... All fields of the Input Object type extension must not have default values."
- **Basis for `inputObjectUnbreakableCycle`:** §3.10 Type Validation: "InputObjectHasUnbreakableCycle(inputObject) must be false." September 2025 and October 2021 have, as item 3: "If an Input Object references itself either directly or through referenced Input Objects, at least one of the fields in the chain of references must be either a nullable or a List type." The two agree on plain input objects. Only September 2026's form (graphql-spec #1211) finds a cycle through OneOf input objects, whose fields are nullable, such as `input A @oneOf { b: B } input B @oneOf { a: A }`; the vectors whose verdict rests on it are tagged since September 2026.
- **Basis for `inputObjectDefaultValueCycle`:** §3.10 Type Validation: "InputObjectDefaultValueHasCycle(inputObject) must be false."
- **Basis for `directiveLocationsDefined`:** §3.13 Type Validation: "A Directive definition must include at least one DirectiveLocation." September 2025 has the same item; October 2021's list has no such item.
- **Basis for `directiveUsesItself`:** §3.13 Type Validation: "A Directive definition must not contain the use of a Directive which references itself directly."
- **Basis for `directiveReferencesItselfIndirectly`:** §3.13 Type Validation: "A Directive definition must not contain the use of a Directive which references itself indirectly by referencing a Type or Directive which transitively includes a reference to this Directive." The vectors that rest only on the prose, "While defining a directive, it must not reference itself directly or indirectly", aren't graded.
- **Basis for `directivesDefined`:** §3.13: "Directives must only be used in the locations they are declared to belong in." The same sentence is in October 2021. A directive that is neither built in nor defined isn't declared to belong in any location. A service "may provide any additional custom directive", so the vectors use a name no service is likely to provide.
- **Basis for `directiveLocationsValid`:** §3.13: "Directives must only be used in the locations they are declared to belong in." The same sentence is in October 2021. The built-in directives' locations are September 2026's (§3.13.1 to §3.13.5). @deprecated goes on arguments and input fields since September 2025, and on directive definitions since September 2026; a vector that applies it there is tagged with that release.
- **Basis for `extensionTargetDefined`:** Each kind of type extension's Type Validation, item 1: "The named type must already be defined and must be a Scalar type" (§3.5.6), "... an Object type" (§3.6.3), "... an Interface type" (§3.7.1), "... a Union type" (§3.8.1), "... an Enum type" (§3.9.1), "... a Input Object type" (§3.10.2).
- **Basis for `extensionTargetKind`:** Each kind of type extension's Type Validation, item 1: "The named type must already be defined and must be a Scalar type" (§3.5.6), "... an Object type" (§3.6.3), "... an Interface type" (§3.7.1), "... a Union type" (§3.8.1), "... an Enum type" (§3.9.1), "... a Input Object type" (§3.10.2).
- **Basis for `extensionItemsUnique`:** §3.6.3: "The fields of an Object type extension must have unique names; no two fields may share the same name." §3.7.1 says the same of an Interface type extension. §3.8.1: "All member types of a Union type extension must be unique." §3.9.1: "All values of an Enum type extension must be unique." §3.10.2: "All fields of an Input Object type extension must have unique names."
- **Basis for `extensionItemsNew`:** §3.6.3: "Any fields of an Object type extension must not be already defined on the previous Object type." §3.7.1 says the same of an Interface type extension. §3.8.1: "All member types of a Union type extension must not already be a member of the previous Union type." §3.9.1: "All values of an Enum type extension must not already be a value of the previous Enum." §3.10.2: "All fields of an Input Object type extension must not already be a field of the previous Input Object." The previous type is the type as extended so far. October 2021 says "the original" type instead of "the previous" one; a vector whose item an earlier extension adds is tagged since September 2025.
- **Basis for `extensionInterfacesNew`:** §3.6.3: "Any interfaces provided must not be already implemented by the previous Object type." §3.7.1 has no such rule for interface type extensions; an interface type extension that adds an interface the type already implements is graded under implementsUnique, on the resulting type.
- **Basis for `extensionDirectivesNotReapplied`:** Every kind of extension's Type Validation: "Any non-repeatable directives provided must not already apply to the previous Schema" (§3.3.2), "... the previous Scalar type" (§3.5.6), "... the previous Object type" (§3.6.3), "... the previous Interface type" (§3.7.1), "... the previous Union type" (§3.8.1), "... the previous Enum type" (§3.9.1), "... the previous Input Object type" (§3.10.2). A directive applied by the definition or by an earlier extension already applies. October 2021 says "the original" instead of "the previous"; a vector whose directive only an earlier extension applies is tagged since September 2025.
- **Basis for `extensionOneOf`:** §3.10.2: "The @oneOf directive must not be provided by an Input Object type extension."
- **Basis for `schemaExtensionDefined`:** §3.3.2 Schema Validation: "The Schema must already be defined." Whether a document with no schema definition, whose root operation types have the default names, has a schema that is "already defined", the spec doesn't say, so no vector is graded.
- **Basis for `specifiedByNotBuiltin`:** §3.13.4: "It must not appear on built-in scalar types." §3.5: "Built-in scalar types must not provide a scalar specification URL as they are specified by this document." A document can apply it to one only through a scalar type extension, `extend scalar Int @specifiedBy(url: "…")`. The spec doesn't say whether a built-in scalar may be extended at all (§3.5.6, "The named type must already be defined"); either way the schema is invalid, so an implementation that rejects every extension of a built-in scalar passes this check without checking @specifiedBy.
- **Basis for `directiveExtensionDefined`:** §3.13.6 Type Validation: "The previous directive must already be defined." New in September 2026, with directive extensions.
- **Basis for `directiveExtensionNotReapplied`:** §3.13.6 Type Validation: "Any non-repeatable directives provided must not already apply to the previous directive."
- **Basis for `directiveExtensionUsesPrevious`:** §3.13.6 Type Validation: "Any directives provided must not contain the use of a Directive which references the previous directive directly."
- **Basis for `directiveExtensionReferencesPrevious`:** §3.13.6 Type Validation: "Any directives provided must not contain the use of a Directive which references the previous directive indirectly by referencing a Type or Directive which transitively includes a reference to the previous Directive."
- **Basis for `directiveNotRepeated`:** §3.13: "A directive may be defined as repeatable by including the "repeatable" keyword. Repeatable directives are often useful when the same directive should be used with different arguments at a single location". §3 states the rule against applying a non-repeatable directive again only for extensions ("must not already apply to the previous ..."), and §5.7.3 Directives Are Unique per Location only for executable documents ("if a directive is not repeatable, then only one occurrence of it is allowed per location"). §3 states no such rule for SDL: this check is informational, and never fails a run. It records whether an implementation rejects such a schema.
- **Basis for `appliedDirectiveArguments`:** §3.13 defines a directive's arguments, such as `directive @specifiedBy(url: String!) on SCALAR` (§3.13.4), and §2.13 says "Directives have a name along with a list of arguments which may accept values of any input type". The rules that an argument is defined, given once, given when required, and of its type are §5.4's, which apply to executable documents. §3 states no such rule for SDL: this check is informational, and never fails a run. It records whether an implementation rejects such a schema.
- **Basis for `acceptsValid`:** a schema is invalid only when it breaks a Type Validation rule of §3 or §4's Reserved Names; rejecting, or crashing on, a schema that breaks none applies a rule the spec doesn't have

## Introspect

- **Capabilities:** custom-directives, custom-scalar-results, deferred-items, idle, introspect, invalid-results, mutation, parent-values, parse, parse-sdl, scalar-results, schema, schema-extensions, subscription, subscription-stream, uncoercible-results, validate
- **Cases:** 64 submitted, 64 distinct, 0 malformed
- **Vectors:** 64 of 71 graded (not graded: 7 new in September 2026 (September 2025 profile))
- **Profile:** the September 2025 edition's introspection types. September 2026's introspection query was rejected ("Unknown argument 'includeDeprecated' on field 'directives' of type '__Schema'."); so was September 2025's ("Cannot query field 'isRepeatable' on type '__Directive'."). The introspection types lack __Type.specifiedByURL, __InputValue.isDeprecated, __InputValue.deprecationReason, __Directive.isRepeatable, __Type.inputFields(includeDeprecated:), __Field.args(includeDeprecated:) and __Directive.args(includeDeprecated:), so this run asks September 2025's query without them, grades against September 2025, and counts what they lack once, under builtinDefinitions.
- **Vectors relying on rules after October 2021:** since September 2025, 11 of 19 vectors failing
- **Adapter problems:** none
- **Checker self-test:** passed (353 negative controls)
- **Run:** kit 0625b35d64dd, 2026-11-16, strict

### Findings

<a id="introspect-finding-1"></a>

#### 1. `builtinAdditions`, `builtinDefinitions`, `builtinNullability`: the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Directive has a field September 2025 doesn't define; the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

11 cases, in `minimal` (1), `interfaces` (1), `deprecation` (1), `inputDeprecation` (1), `roots` (1), `unreferenced` (1), `builtinScalars` (1), `order` (1), `interfaceDeprecation` (1), `inputDeprecationAll` (1), `directiveArgDeprecation` (1). 3 of them rely on grammar or rules introduced in September 2025, not in October 2021.

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))

The shortest case, from `minimal.inc`:

```
problem:  added:fields at __Directive, inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), locations at @deprecated
input:    type Query { a: Int }  (the introspection query, September 2025 profile; includeDeprecated: true)
response: {"name":"deprecated","description":"Marks an element of a GraphQL schema as no longer supported.","locations":["FIELD_DEFINITION","ENUM_VALUE"],"args":[{"name":"reason","description":"Explains why this element was deprecated, usually also including a suggestion for how to access supported similar data. Formatted in [Markdown](https://daringfireball.net/projects/markdown/).","type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"No longer supported\""}]}
expected: [object Object]
```

<a id="introspect-finding-2"></a>

#### 2. `builtinDefinitions`, `builtinNullability`: the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

11 cases, in `minimal` (1), `interfaces` (1), `deprecation` (1), `inputDeprecation` (1), `roots` (1), `unreferenced` (1), `builtinScalars` (1), `order` (1), `interfaceDeprecation` (1), `inputDeprecationAll` (1), `directiveArgDeprecation` (1). All rely on grammar or rules introduced in September 2025, not in October 2021.

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))

The shortest case, from `minimal.defaults`:

```
problem:  inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), locations at @deprecated
input:    type Query { a: Int }  (the introspection query, September 2025 profile; includeDeprecated: the default)
response: {"name":"deprecated","description":"Marks an element of a GraphQL schema as no longer supported.","locations":["FIELD_DEFINITION","ENUM_VALUE"],"args":[{"name":"reason","description":"Explains why this element was deprecated, usually also including a suggestion for how to access supported similar data. Formatted in [Markdown](https://daringfireball.net/projects/markdown/).","type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"No longer supported\""}]}
expected: [object Object]
```

<a id="introspect-finding-3"></a>

#### 3. `builtinAdditions`, `builtinDefinitions`, `builtinDirectives`, `builtinNullability`: doesn't provide @specifiedBy; the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Directive has a field September 2025 doesn't define; the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

2 cases, in `scalars` (1), `descriptions` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (SHOULD, [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) [§3.13.1](https://spec.graphql.org/September2026/#sec--skip) [§3.13.2](https://spec.graphql.org/September2026/#sec--include) [§3.13.4](https://spec.graphql.org/September2026/#sec--specifiedBy) [§3.13.5](https://spec.graphql.org/September2026/#sec--oneOf))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))

The shortest case, from `scalars.inc`:

```
problem:  added:fields at __Directive, builtinDirectives at @specifiedBy, inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), locations at @deprecated
input:    "A date" scalar Date @specifiedBy(url: "https://example.com/date") scalar Plain scalar Odd @specifiedBy(url: "https://example.com/a?b=c&d=%20#x") type Query { d: Date, p: Plain, o: Odd }  (the introspection query, September 2025 profile; includeDeprecated: true)
response: "no directive specifiedBy"
expected: [object Object]
```

<a id="introspect-finding-4"></a>

#### 4. `builtinDefinitions`, `builtinDirectives`, `builtinNullability`: doesn't provide @specifiedBy; the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

2 cases, in `scalars` (1), `descriptions` (1).

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (SHOULD, [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) [§3.13.1](https://spec.graphql.org/September2026/#sec--skip) [§3.13.2](https://spec.graphql.org/September2026/#sec--include) [§3.13.4](https://spec.graphql.org/September2026/#sec--specifiedBy) [§3.13.5](https://spec.graphql.org/September2026/#sec--oneOf))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))

The shortest case, from `scalars.defaults`:

```
problem:  builtinDirectives at @specifiedBy, inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), locations at @deprecated
input:    "A date" scalar Date @specifiedBy(url: "https://example.com/date") scalar Plain scalar Odd @specifiedBy(url: "https://example.com/a?b=c&d=%20#x") type Query { d: Date, p: Plain, o: Odd }  (the introspection query, September 2025 profile; includeDeprecated: the default)
response: "no directive specifiedBy"
expected: [object Object]
```

<a id="introspect-finding-5"></a>

#### 5. `builtinDefinitions`: the introspection types lack __Type.specifiedByURL, __InputValue.isDeprecated, __InputValue.deprecationReason, __Directive.isRepeatable, __Type.inputFields(includeDeprecated:), __Field.args(includeDeprecated:) and __Directive.args(includeDeprecated:), so the kit leaves them out of every query, and grades what it can see without them

1 case, in `discovery` (1).

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))

The shortest case, from `discovery`:

```
problem:  __Type.specifiedByURL, __InputValue.isDeprecated, __InputValue.deprecationReason, __Directive.isRepeatable, __Type.inputFields(includeDeprecated:), __Field.args(includeDeprecated:), __Directive.args(includeDeprecated:)
input:    the fields of each introspection type, with their arguments (the kit's IntrospectionFields query)
response: {"data":{"a":{"fields":[{"name":"description","args":[]},{"name":"types","args":[]},{"name":"queryType","args":[]},{"name":"mutationType","args":[]},{"name":"subscriptionType","args":[]},{"name":"directives","args":[]}]},"b":{"fields":[{"name":"kind","args":[]},{"name":"name","args":[]},{"name":"description","args":[]},{"name":"fields","args":[{"name":"includeDeprecated"}]},{"name":"interfaces","args":[]},{"name":"possibleTypes","args":[]},{"name":"enumValues","args":[{"name":"includeDeprecated"}]},{"name":"inputFields","args":[]},{"name":"ofType","args":[]},{"name":"isOneOf","args":[]}]},"c":{"fields":[{"name":"name","args":[]},{"name":"description","args":[]},{"name":"args","args":[]},{"name":"type","args":[]},{"name":"isDeprecated","args":[]},{"name":"deprecationReason","args":[]}]},"d":{"fields":[{"name":"name","args":[]},{"name":"description","args":[]},{"name":"type","args":[]},{"name":"defaultValue","args":[]}]},"e":{"fields":[{"name":"name","args":[]},{"name":"description","args":[]},{"name":"isDeprecated","args":[]},{"name":"deprecationReason","args":[]}]},"f":{"fields":[{"name":"name","args":[]},{"name":"description","args":[]},{"name":"locations","args":[]},{"name":"args","args":[]}]}}}
expected: the fields and arguments September 2025 defines, including __Type.specifiedByURL, __InputValue.isDeprecated, __InputValue.deprecationReason, __Directive.isRepeatable, __Type.inputFields(includeDeprecated:), __Field.args(includeDeprecated:) and __Directive.args(includeDeprecated:)
```

<a id="introspect-finding-6"></a>

#### 6. `builtinAdditions`, `builtinDefinitions`, `builtinDirectives`, `builtinNullability`, `directives`: directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types: differs from Introspection.tla; doesn't provide @specifiedBy; the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Directive has a field September 2025 doesn't define; the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

1 case, in `rich` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (SHOULD, [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) [§3.13.1](https://spec.graphql.org/September2026/#sec--skip) [§3.13.2](https://spec.graphql.org/September2026/#sec--include) [§3.13.4](https://spec.graphql.org/September2026/#sec--specifiedBy) [§3.13.5](https://spec.graphql.org/September2026/#sec--oneOf))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types (MUST, [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type) [§4.2.6](https://spec.graphql.org/September2026/#sec-The-__Directive-Type) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))

The shortest case, from `rich.inc`:

```
problem:  added:fields at __Directive, builtinDirectives at @specifiedBy, directives at the root, inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), locations at @deprecated
input:    """The schema""" schema { query: Q mutation: M } "The root" type Q { a("An argument" x: Int = 3, y: [Int] = 1, z: In = {b: 2}): U, old: String @deprecated(reason: "gone"), d: Date } type M { m(p: Pick!): Boolean } type A { a: Int } type B { b: Int } union U = B | A enum E { X "Why" Y @deprecated } input In { a: Int = 1, b: Int, e: E = Y, old: String } input Pick { id: ID, name: String } scalar Date "Labels a field" directive @label(v: String, w: Int = 2) repeatable on FIELD_DEFINITION | QUERY  (the introspection query, September 2025 profile; includeDeprecated: true)
response: {"__typename":"Q","description":"The schema","queryType":{"kind":"OBJECT","name":"Q"},"mutationType":{"kind":"OBJECT","name":"M"},"subscriptionType":null,"types":["E","Date","__Schema","String","__Type","__TypeKind","__Field","__InputValue","Boolean","__EnumValue","__Directive","__DirectiveLocation","Q","M","A","B","U","In","Pick","Int","ID"],"directives":["include","skip","deprecated"]}
expected: [object Object]
```

<a id="introspect-finding-7"></a>

#### 7. `builtinDefinitions`, `builtinDirectives`, `builtinNullability`, `directives`: directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types: differs from Introspection.tla; doesn't provide @specifiedBy; the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

1 case, in `rich` (1).

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (SHOULD, [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) [§3.13.1](https://spec.graphql.org/September2026/#sec--skip) [§3.13.2](https://spec.graphql.org/September2026/#sec--include) [§3.13.4](https://spec.graphql.org/September2026/#sec--specifiedBy) [§3.13.5](https://spec.graphql.org/September2026/#sec--oneOf))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types (MUST, [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type) [§4.2.6](https://spec.graphql.org/September2026/#sec-The-__Directive-Type) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))

The shortest case, from `rich.defaults`:

```
problem:  builtinDirectives at @specifiedBy, directives at the root, inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), locations at @deprecated
input:    """The schema""" schema { query: Q mutation: M } "The root" type Q { a("An argument" x: Int = 3, y: [Int] = 1, z: In = {b: 2}): U, old: String @deprecated(reason: "gone"), d: Date } type M { m(p: Pick!): Boolean } type A { a: Int } type B { b: Int } union U = B | A enum E { X "Why" Y @deprecated } input In { a: Int = 1, b: Int, e: E = Y, old: String } input Pick { id: ID, name: String } scalar Date "Labels a field" directive @label(v: String, w: Int = 2) repeatable on FIELD_DEFINITION | QUERY  (the introspection query, September 2025 profile; includeDeprecated: the default)
response: {"__typename":"Q","description":"The schema","queryType":{"kind":"OBJECT","name":"Q"},"mutationType":{"kind":"OBJECT","name":"M"},"subscriptionType":null,"types":["E","Date","__Schema","String","__Type","__TypeKind","__Field","__InputValue","Boolean","__EnumValue","__Directive","__DirectiveLocation","Q","M","A","B","U","In","Pick","Int","ID"],"directives":["include","skip","deprecated"]}
expected: [object Object]
```

<a id="introspect-finding-8"></a>

#### 8. `builtinAdditions`, `builtinDefinitions`, `builtinNullability`, `defaultValueOmitted`, `defaultValuePrinting`: a printed default value has a control character in a string, unescaped; defaultValue is null for an input value that has a default; the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Directive has a field September 2025 doesn't define; the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

1 case, in `defaults` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- defaultValue encodes the default value of an input value that has one, rather than returning null (SHOULD, [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type))
- A default value's strings are printed with control characters escaped, and supplementary characters, if escaped, as \u{…} (SHOULD, [§2.10.4](https://spec.graphql.org/September2026/#sec-String-Value) [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type))

The shortest case, from `defaults.inc`:

```
problem:  added:fields at __Directive, defaultValueOmitted at Query.f(n:), inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), locations at @deprecated, printedControl at Query.f(bell:)
input:    enum E { X Y } input I { a: Int = 1, b: Int, c: [Int] = 1, e: E = Y, f: Float = 2 } type Query { f(x: [Int] = 1, y: Float = 1, z: ID = 7, w: [[Int]] = [1, 2], i: I = {b: 2}, s: String = "say \"hi\"", n: Int = null, l: [E!] = [X, Y], big: ID = 9007199254740993, huge: Float = 1000000000000000000000, bell: String = "\u0007"): Int }  (the introspection query, September 2025 profile; includeDeprecated: true)
response: {"kind":"OBJECT","name":"Query","description":null,"isOneOf":null,"fields":[{"name":"f","description":null,"args":[{"name":"x","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}},"defaultValue":"[1]"},{"name":"y","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1"},{"name":"z","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"\"7\""},{"name":"w","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}}},"defaultValue":"[[1], [2]]"},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"I","ofType":null},"defaultValue":"{a: 1, b: 2, c: [1], e: Y, f: 2}"},{"name":"s","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"say \\\"hi\\\"\""},{"name":"n","description":null,"type":{"kind":"SCALAR","name":"Int","ofType":null},"defaultValue":null},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"ENUM","name":"E","ofType":null}}},"defaultValue":"[X, Y]"},{"name":"big","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"\"9007199254740993\""},{"name":"huge","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1E+21"},{"name":"bell","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"\u0007\""}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-9"></a>

#### 9. `builtinDefinitions`, `builtinNullability`, `defaultValueOmitted`, `defaultValuePrinting`: a printed default value has a control character in a string, unescaped; defaultValue is null for an input value that has a default; the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

1 case, in `defaults` (1).

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- defaultValue encodes the default value of an input value that has one, rather than returning null (SHOULD, [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type))
- A default value's strings are printed with control characters escaped, and supplementary characters, if escaped, as \u{…} (SHOULD, [§2.10.4](https://spec.graphql.org/September2026/#sec-String-Value) [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type))

The shortest case, from `defaults.defaults`:

```
problem:  defaultValueOmitted at Query.f(n:), inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), locations at @deprecated, printedControl at Query.f(bell:)
input:    enum E { X Y } input I { a: Int = 1, b: Int, c: [Int] = 1, e: E = Y, f: Float = 2 } type Query { f(x: [Int] = 1, y: Float = 1, z: ID = 7, w: [[Int]] = [1, 2], i: I = {b: 2}, s: String = "say \"hi\"", n: Int = null, l: [E!] = [X, Y], big: ID = 9007199254740993, huge: Float = 1000000000000000000000, bell: String = "\u0007"): Int }  (the introspection query, September 2025 profile; includeDeprecated: the default)
response: {"kind":"OBJECT","name":"Query","description":null,"isOneOf":null,"fields":[{"name":"f","description":null,"args":[{"name":"x","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}},"defaultValue":"[1]"},{"name":"y","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1"},{"name":"z","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"\"7\""},{"name":"w","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}}},"defaultValue":"[[1], [2]]"},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"I","ofType":null},"defaultValue":"{a: 1, b: 2, c: [1], e: Y, f: 2}"},{"name":"s","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"say \\\"hi\\\"\""},{"name":"n","description":null,"type":{"kind":"SCALAR","name":"Int","ofType":null},"defaultValue":null},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"ENUM","name":"E","ofType":null}}},"defaultValue":"[X, Y]"},{"name":"big","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"\"9007199254740993\""},{"name":"huge","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1E+21"},{"name":"bell","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"\u0007\""}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-10"></a>

#### 10. `builtinAdditions`, `builtinDefinitions`, `builtinNullability`, `directives`: doesn't return @oneOf in directives, though an input object's isOneOf shows it is provided (since September 2025); the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Directive has a field September 2025 doesn't define; the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

1 case, in `oneOf` (1). All rely on grammar or rules introduced in September 2025, not in October 2021.

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types (MUST, [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type) [§4.2.6](https://spec.graphql.org/September2026/#sec-The-__Directive-Type) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))

The shortest case, from `oneOf.inc`:

```
problem:  added:fields at __Directive, inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), locations at @deprecated, requiredDirective at @oneOf
input:    [since September 2025] input Pick @oneOf { id: ID, name: String } input Plain { x: Int! } type Query { a(p: Pick, q: Plain): Int }  (the introspection query, September 2025 profile; includeDeprecated: true)
response: "no directive oneOf"
expected: [object Object]
```

<a id="introspect-finding-11"></a>

#### 11. `builtinDefinitions`, `builtinNullability`, `directives`: doesn't return @oneOf in directives, though an input object's isOneOf shows it is provided (since September 2025); the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

1 case, in `oneOf` (1). All rely on grammar or rules introduced in September 2025, not in October 2021.

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types (MUST, [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type) [§4.2.6](https://spec.graphql.org/September2026/#sec-The-__Directive-Type) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))

The shortest case, from `oneOf.defaults`:

```
problem:  inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), locations at @deprecated, requiredDirective at @oneOf
input:    [since September 2025] input Pick @oneOf { id: ID, name: String } input Plain { x: Int! } type Query { a(p: Pick, q: Plain): Int }  (the introspection query, September 2025 profile; includeDeprecated: the default)
response: "no directive oneOf"
expected: [object Object]
```

<a id="introspect-finding-12"></a>

#### 12. `builtinAdditions`, `builtinDefinitions`, `builtinNullability`, `directives`: directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types: differs from Introspection.tla; the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Directive has a field September 2025 doesn't define; the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

1 case, in `locations` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types (MUST, [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type) [§4.2.6](https://spec.graphql.org/September2026/#sec-The-__Directive-Type) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))

The shortest case, from `locations.inc`:

```
problem:  added:fields at __Directive, directives at the root, inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), locations at @deprecated
input:    """ Every location but one. """ directive @z(z: Int, a: Int, m: Int) repeatable on QUERY | MUTATION | SUBSCRIPTION | FIELD | FRAGMENT_DEFINITION | FRAGMENT_SPREAD | INLINE_FRAGMENT | VARIABLE_DEFINITION | SCHEMA | SCALAR | OBJECT | FIELD_DEFINITION | ARGUMENT_DEFINITION | INTERFACE | UNION | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION directive @a on SCHEMA directive @m(b: String, a: String) on VARIABLE_DEFINITION | FRAGMENT_DEFINITION type Query { a: Int }  (the introspection query, September 2025 profile; includeDeprecated: true)
response: {"__typename":"Query","description":null,"queryType":{"kind":"OBJECT","name":"Query"},"mutationType":null,"subscriptionType":null,"types":["__Schema","String","__Type","__TypeKind","__Field","__InputValue","Boolean","__EnumValue","__Directive","__DirectiveLocation","Query","Int"],"directives":["include","skip","deprecated","m"]}
expected: [object Object]
```

<a id="introspect-finding-13"></a>

#### 13. `builtinDefinitions`, `builtinNullability`, `directives`: directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types: differs from Introspection.tla; the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

1 case, in `locations` (1).

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types (MUST, [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type) [§4.2.6](https://spec.graphql.org/September2026/#sec-The-__Directive-Type) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))

The shortest case, from `locations.defaults`:

```
problem:  directives at the root, inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), locations at @deprecated
input:    """ Every location but one. """ directive @z(z: Int, a: Int, m: Int) repeatable on QUERY | MUTATION | SUBSCRIPTION | FIELD | FRAGMENT_DEFINITION | FRAGMENT_SPREAD | INLINE_FRAGMENT | VARIABLE_DEFINITION | SCHEMA | SCALAR | OBJECT | FIELD_DEFINITION | ARGUMENT_DEFINITION | INTERFACE | UNION | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION directive @a on SCHEMA directive @m(b: String, a: String) on VARIABLE_DEFINITION | FRAGMENT_DEFINITION type Query { a: Int }  (the introspection query, September 2025 profile; includeDeprecated: the default)
response: {"__typename":"Query","description":null,"queryType":{"kind":"OBJECT","name":"Query"},"mutationType":null,"subscriptionType":null,"types":["__Schema","String","__Type","__TypeKind","__Field","__InputValue","Boolean","__EnumValue","__Directive","__DirectiveLocation","Query","Int"],"directives":["include","skip","deprecated","m"]}
expected: [object Object]
```

<a id="introspect-finding-14"></a>

#### 14. `builtinAdditions`, `builtinDefinitions`, `builtinNullability`, `defaultValuePrinting`: a printed default value has a control character in a string, unescaped; the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Directive has a field September 2025 doesn't define; the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

1 case, in `printing` (1). All rely on grammar or rules introduced in September 2025, not in October 2021.

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- A default value's strings are printed with control characters escaped, and supplementary characters, if escaped, as \u{…} (SHOULD, [§2.10.4](https://spec.graphql.org/September2026/#sec-String-Value) [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type))

The shortest case, from `printing.inc`:

```
problem:  added:fields at __Directive, inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), locations at @deprecated, printedControl at In.s, printedControl at Query.f(c:)
input:    [since September 2025] input In { s: String = "\u0003", t: [String] = ["😀"] } type Query { f(c: String = "\u0000\u0001\t\n\u001F\u007F\u0080\u0085\u009F", e: String = "😀 é", l: [String] = ["\u0002", "😀"], i: In = {s: "\u0004", t: ["\u0005😀"]}): Int }  (the introspection query, September 2025 profile; includeDeprecated: true)
response: {"kind":"OBJECT","name":"Query","description":null,"isOneOf":null,"fields":[{"name":"f","description":null,"args":[{"name":"c","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"\\u0000\\u0001\\t\\n\\u001F\""},{"name":"e","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"😀 é\""},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"String","ofType":null}},"defaultValue":"[\"\\u0002\", \"😀\"]"},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"In","ofType":null},"defaultValue":"{s: \"\\u0004\", t: [\"\\u0005😀\"]}"}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-15"></a>

#### 15. `builtinDefinitions`, `builtinNullability`, `defaultValuePrinting`: a printed default value has a control character in a string, unescaped; the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

1 case, in `printing` (1). All rely on grammar or rules introduced in September 2025, not in October 2021.

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- A default value's strings are printed with control characters escaped, and supplementary characters, if escaped, as \u{…} (SHOULD, [§2.10.4](https://spec.graphql.org/September2026/#sec-String-Value) [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type))

The shortest case, from `printing.defaults`:

```
problem:  inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), locations at @deprecated, printedControl at In.s, printedControl at Query.f(c:)
input:    [since September 2025] input In { s: String = "\u0003", t: [String] = ["😀"] } type Query { f(c: String = "\u0000\u0001\t\n\u001F\u007F\u0080\u0085\u009F", e: String = "😀 é", l: [String] = ["\u0002", "😀"], i: In = {s: "\u0004", t: ["\u0005😀"]}): Int }  (the introspection query, September 2025 profile; includeDeprecated: the default)
response: {"kind":"OBJECT","name":"Query","description":null,"isOneOf":null,"fields":[{"name":"f","description":null,"args":[{"name":"c","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"\\u0000\\u0001\\t\\n\\u001F\""},{"name":"e","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"😀 é\""},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"String","ofType":null}},"defaultValue":"[\"\\u0002\", \"😀\"]"},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"In","ofType":null},"defaultValue":"{s: \"\\u0004\", t: [\"\\u0005😀\"]}"}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-16"></a>

#### 16. `defaultValueOmitted`, `defaultValuePrinting`: a printed default value has a control character in a string, unescaped; defaultValue is null for an input value that has a default

1 case, in `defaults` (1).

- defaultValue encodes the default value of an input value that has one, rather than returning null (SHOULD, [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type))
- A default value's strings are printed with control characters escaped, and supplementary characters, if escaped, as \u{…} (SHOULD, [§2.10.4](https://spec.graphql.org/September2026/#sec-String-Value) [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type))

The shortest case, from `defaults.lookup`:

```
problem:  defaultValueOmitted at Query.f(n:), printedControl at Query.f(bell:)
input:    enum E { X Y } input I { a: Int = 1, b: Int, c: [Int] = 1, e: E = Y, f: Float = 2 } type Query { f(x: [Int] = 1, y: Float = 1, z: ID = 7, w: [[Int]] = [1, 2], i: I = {b: 2}, s: String = "say \"hi\"", n: Int = null, l: [E!] = [X, Y], big: ID = 9007199254740993, huge: Float = 1000000000000000000000, bell: String = "\u0007"): Int }  (__type(name:) for Query, I, Unknown, September 2025 profile; includeDeprecated: true)
response: {"__type(name: \"Query\")":{"kind":"OBJECT","name":"Query","description":null,"isOneOf":null,"fields":[{"name":"f","description":null,"args":[{"name":"x","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}},"defaultValue":"[1]"},{"name":"y","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1"},{"name":"z","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"\"7\""},{"name":"w","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}}},"defaultValue":"[[1], [2]]"},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"I","ofType":null},"defaultValue":"{a: 1, b: 2, c: [1], e: Y, f: 2}"},{"name":"s","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"say \\\"hi\\\"\""},{"name":"n","description":null,"type":{"kind":"SCALAR","name":"Int","ofType":null},"defaultValue":null},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"ENUM","name":"E","ofType":null}}},"defaultValue":"[X, Y]"},{"name":"big","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"\"9007199254740993\""},{"name":"huge","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1E+21"},{"name":"bell","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"\u0007\""}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}}
expected: [object Object]
```

<a id="introspect-finding-17"></a>

#### 17. `defaultValuePrinting`: a printed default value has a control character in a string, unescaped

1 case, in `printing` (1). All rely on grammar or rules introduced in September 2025, not in October 2021.

- A default value's strings are printed with control characters escaped, and supplementary characters, if escaped, as \u{…} (SHOULD, [§2.10.4](https://spec.graphql.org/September2026/#sec-String-Value) [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type))

The shortest case, from `printing.lookup`:

```
problem:  printedControl at In.s, printedControl at Query.f(c:)
input:    [since September 2025] input In { s: String = "\u0003", t: [String] = ["😀"] } type Query { f(c: String = "\u0000\u0001\t\n\u001F\u007F\u0080\u0085\u009F", e: String = "😀 é", l: [String] = ["\u0002", "😀"], i: In = {s: "\u0004", t: ["\u0005😀"]}): Int }  (__type(name:) for Query, In, Unknown, September 2025 profile; includeDeprecated: true)
response: {"__type(name: \"Query\")":{"kind":"OBJECT","name":"Query","description":null,"isOneOf":null,"fields":[{"name":"f","description":null,"args":[{"name":"c","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"\\u0000\\u0001\\t\\n\\u001F\""},{"name":"e","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"😀 é\""},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"String","ofType":null}},"defaultValue":"[\"\\u0002\", \"😀\"]"},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"In","ofType":null},"defaultValue":"{s: \"\\u0004\", t: [\"\\u0005😀\"]}"}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}}
expected: [object Object]
```

### Every check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **(k since September 2025, j new in September 2026), (all …):** k of the n failing cases rely on grammar or rules introduced in September 2025, and j on ones introduced in September 2026; none of them is in the October 2021 edition. The symbol still gives the check's level.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it. **– needs `x`:** the adapter doesn't claim capability `x`, which the check needs.
- **n/a:** the adapter doesn't take part in this area, or its report predates the check.

| Check | Level | Spec | Result |
| --- | :---: | :---: | :---: |
| The response is a well-formed execution result: data, errors only as a non-empty list, extensions a map, nothing else (`envelope`) | MUST | [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) [§7.1.7](https://spec.graphql.org/September2026/#sec-Extensions) [§7.1.8](https://spec.graphql.org/September2026/#sec-Additional-Entries) | ✓ 64 |
| The query executes, and its result has exactly the fields it selects, nulls included (`executes`) | MUST | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) | ✓ 61 |
| queryType, mutationType and subscriptionType are the root operation types (`roots`) | MUST | [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type) [§3.3.1](https://spec.graphql.org/September2026/#sec-Root-Operation-Types) | ✓ 36 |
| types is the set of all named types (`types`) | MUST | [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type) | ✓ 36 |
| types includes, and __type(name:) finds, a type the document defines that nothing references (`unreferencedTypes`) | SHOULD | [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type) | ✓ 57 |
| types has the built-in scalars the schema references, and no others (`builtinScalars`) | MUST | [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type) | ✓ 36 |
| __type(name:) returns the named type, and null for a name the schema doesn't have (`typeByName`) | MUST | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) | ✓ 21 |
| Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (`typeKinds`) | MUST | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) | ✓ 59 |
| An object's or interface's fields, with their types (`fields`) | MUST | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) [§4.2.3](https://spec.graphql.org/September2026/#sec-The-__Field-Type) | ✓ 57 |
| Field and directive arguments, with their types (`arguments`) | MUST | [§4.2.3](https://spec.graphql.org/September2026/#sec-The-__Field-Type) [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type) [§4.2.6](https://spec.graphql.org/September2026/#sec-The-__Directive-Type) | ✓ 57 |
| defaultValue is null for an input value without a default, and otherwise null or an encoding of the default (`defaultValue`) | MUST | [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type) | ✓ 57 |
| defaultValue encodes the default value of an input value that has one, rather than returning null (`defaultValueOmitted`) | SHOULD | [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type) | ! 3/57 |
| A default value's strings are printed with control characters escaped, and supplementary characters, if escaped, as \u{…} (`defaultValuePrinting`). Since September 2025: October 2021 has no rule on producing a StringValue. | SHOULD (since September 2025) | [§2.10.4](https://spec.graphql.org/September2026/#sec-String-Value) [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type) | ! 6/57 (all since September 2025) |
| An input object's inputFields, with their types (`inputFields`) | MUST | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type) | ✓ 57 |
| An enum's enumValues (`enumValues`) | MUST | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) [§4.2.5](https://spec.graphql.org/September2026/#sec-The-__EnumValue-Type) | ✓ 57 |
| interfaces, and possibleTypes for unions and interfaces (`interfaces`) | MUST | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) | ✓ 57 |
| isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something (`deprecation`). The implementation answered the September 2025 query, so this check is graded as September 2025 has it: September 2025 deprecates fields, arguments, input fields and enum values, but not directives, so this check covers no directive. | MUST | [§4.2.3](https://spec.graphql.org/September2026/#sec-The-__Field-Type) [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type) [§4.2.5](https://spec.graphql.org/September2026/#sec-The-__EnumValue-Type) [§4.2.6](https://spec.graphql.org/September2026/#sec-The-__Directive-Type) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) [§3.13.3](https://spec.graphql.org/September2026/#sec--deprecated) | ✓ 57 |
| Under the October 2021 profile, a deprecated field or enum value has its reason, rather than null (`deprecationReasonOmitted`). Graded only under the October 2021 profile. | SHOULD | [§4.2.3](https://spec.graphql.org/September2026/#sec-The-__Field-Type) [§4.2.5](https://spec.graphql.org/September2026/#sec-The-__EnumValue-Type) | – |
| specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null (`specifiedByURL`) | MUST | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) [§3.13.4](https://spec.graphql.org/September2026/#sec--specifiedBy) | ✓ 57 |
| specifiedByURL returns the URL @specifiedBy gives a custom scalar, rather than null, when the service provides @specifiedBy (`specifiedByURLOmitted`) | SHOULD | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) [§3.13.4](https://spec.graphql.org/September2026/#sec--specifiedBy) | ✓ 57 |
| isOneOf is true exactly for OneOf input objects (`isOneOf`). Since September 2025: October 2021 has no OneOf input objects. | MUST (since September 2025) | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) [§3.10.1](https://spec.graphql.org/September2026/#sec-OneOf-Input-Objects) | ✓ 57 |
| A description the document gives is returned as it is, the schema's included (`descriptions`) | SHOULD | [§3.2](https://spec.graphql.org/September2026/#sec-Type-System-Descriptions) [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) | ✓ 57 |
| directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types (`directives`) | MUST | [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type) [§4.2.6](https://spec.graphql.org/September2026/#sec-The-__Directive-Type) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | ✗ 6/38 (2 since September 2025) |
| @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (`builtinDirectives`) | SHOULD | [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) [§3.13.1](https://spec.graphql.org/September2026/#sec--skip) [§3.13.2](https://spec.graphql.org/September2026/#sec--include) [§3.13.4](https://spec.graphql.org/September2026/#sec--specifiedBy) [§3.13.5](https://spec.graphql.org/September2026/#sec--oneOf) | ! 6/38 |
| The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (`builtinDefinitions`) | MUST | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | ✗ 37/58 (36 since September 2025) |
| The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (`builtinNullability`) | SHOULD | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | ! 36/57 (all since September 2025) |
| The introspection types have no field, argument, enum value or type the spec doesn't define (`builtinAdditions`) | INFO | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) | i 18/57 (5 since September 2025) |
| Under an older release's profile, a built-in definition that differs from that release's is as a later release defines it (`builtinEdition`) | INFO | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | ✓ 57 |
| __typename names the root type, and no fields list includes it (`typename`) | MUST | [§4.1](https://spec.graphql.org/September2026/#sec-Type-Name-Introspection) | ✓ 57 |
| Fields, arguments, enum values, directives, members and interfaces come in source order (`order`). Since September 2025: October 2021 has no Stable Ordering. | SHOULD (since September 2025) | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) | ✓ 57 |
| Anything else Introspection!Matches requires (`other`) | MUST | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) | ✓ 57 |

- **Basis for `envelope`:** §7.1: "An execution result must be a map." "If any errors are raised during operation execution, the execution result must contain an entry with key errors. The value of this entry must be a non-empty list". "The extensions entry in an execution result or request error result, if set, must have a map as its value." "the execution result and request error result maps must not contain any entries other than those described above."
- **Basis for `executes`:** §4.2: "The schema introspection system is accessible from the meta-fields __schema and __type which are accessible from the type of the root of a query operation", with "__schema: __Schema!". Each field the kit selects is one §4.2 defines, so a request error, an execution error, a crash, or a result without a selected field fails to return what those definitions say each field returns.
- **Basis for `roots`:** §4.2.1: "queryType is the root type of a query operation." "mutationType is the root type of a mutation operation, if supported. Otherwise null." The same for subscriptionType. Appendix A: "Conformance requirements are described in this document via both descriptive assertions and key words with clearly defined meanings."
- **Basis for `types`:** §4.2.1: "types must return the set of all named types contained within this schema. Any named type which can be found through a field of any introspection type must be included in this set." A type a field, argument, interface, union or root reaches, left out, or a type the schema doesn't have, fails this check. A type the document defines but nothing reaches is unreferencedTypes.
- **Basis for `unreferencedTypes`:** §4.2.1: "types must return the set of all named types contained within this schema. Any named type which can be found through a field of any introspection type must be included in this set." The second sentence is about types found through fields; whether a type the document defines that no root, field, argument, interface, union or directive argument reaches is "contained within this schema" isn't settled by the text, which doesn't define the phrase. The plain reading is that a schema built from a document contains every type the document defines, so leaving one out is graded at the weaker level, a SHOULD.
- **Basis for `builtinScalars`:** §3.5: "When returning the set of types from the __Schema introspection type, all referenced built-in scalars must be included. If a built-in scalar type is not referenced anywhere in a schema (there is no field, argument, or input field of that type) then it must not be included."
- **Basis for `typeByName`:** §4.2: "The schema introspection system is accessible from the meta-fields __schema and __type which are accessible from the type of the root of a query operation", with "__type(name: String!): __Type". The spec gives no more prose for __type, so the kit takes its answer to be the named type's entry in types (§4.2.1: "types must return the set of all named types contained within this schema"), and null, which its nullable type allows, for a name no type has. A type the document defines that nothing references is unreferencedTypes.
- **Basis for `typeKinds`:** §4.2.2, for each kind: "kind must return __TypeKind.OBJECT" (and so on) and "All other fields must return {null}." For List and Non-Null: "ofType must return a type of any kind." isOneOf, new in September 2025, is part of "all other fields" since then.
- **Basis for `fields`:** §4.2.2: "fields must return the set of fields that can be selected for this type." §4.2.3: "type must return a __Type that represents the type of value returned by this field."
- **Basis for `arguments`:** §4.2.3: "args returns a List of __InputValue representing the arguments this field accepts." §4.2.6: "args returns a List of __InputValue representing the arguments this directive accepts." §4.2.4: "type must return a __Type that represents the type this input value expects." Appendix A: "Conformance requirements are described in this document via both descriptive assertions and key words with clearly defined meanings."
- **Basis for `defaultValue`:** §4.2.4: "defaultValue may return a String encoding (using the GraphQL language) of the default value used by this input value in the condition a value is not provided at runtime. If this input value has no default value, returns null." A string that encodes another value, or one for an input value without a default, contradicts that. Appendix A: "Conformance requirements are described in this document via both descriptive assertions and key words with clearly defined meanings."
- **Basis for `defaultValueOmitted`:** §4.2.4: "defaultValue may return a String encoding (using the GraphQL language) of the default value used by this input value in the condition a value is not provided at runtime. If this input value has no default value, returns null." By Appendix A, a lowercase "may" keeps its RFC 2119 meaning, so the encoding is optional; the intent is plainly that a default is encoded, which makes this a SHOULD. A string that isn't an encoding of the default, or one for an input value without a default, still fails defaultValue.
- **Basis for `defaultValuePrinting`:** §2.10.4: "When producing a StringValue, implementations should use escape sequences to represent non-printable control characters (U+0000 to U+001F and U+007F to U+009F)." "If an implementation chooses to escape a supplementary character, it should only use a variable-width unicode escape sequence." §4.2.4: "defaultValue may return a String encoding (using the GraphQL language) of the default value". So a string in the encoding that has a control character unescaped, or a surrogate pair of fixed-width escapes, fails this check. A block string can't escape anything, so one that holds a control character fails it too; read literally that would rule out every multi-line block string, so the kit takes the weaker reading and lets a block string hold tabs, line feeds and carriage returns. September 2025 introduced both sentences; the value the encoding stands for is graded by defaultValue.
- **Basis for `inputFields`:** §4.2.2: "inputFields must return the set of input fields as a list of __InputValue." §4.2.4: "type must return a __Type that represents the type this input value expects."
- **Basis for `enumValues`:** §4.2.2: "enumValues must return the set of enum values as a list of __EnumValue."
- **Basis for `interfaces`:** §4.2.2: "interfaces must return the set of interfaces that an object implements (if none, interfaces must return the empty set)." For a union, "possibleTypes returns the list of types that can be represented within this union", and for an interface, "possibleTypes returns the list of types that implement this interface". Appendix A: "Conformance requirements are described in this document via both descriptive assertions and key words with clearly defined meanings."
- **Basis for `deprecation`:** §4.2.3: "isDeprecated returns true if this field should no longer be used, otherwise false." "deprecationReason returns the reason why this field is deprecated, or null if this field is not deprecated." (likewise §4.2.4 to §4.2.6), and each list "Accepts the argument includeDeprecated which defaults to false. If true, deprecated fields are also returned." Appendix A: "Conformance requirements are described in this document via both descriptive assertions and key words with clearly defined meanings." §3.13: "GraphQL implementations that support the type system definition language must provide the @deprecated directive if representing deprecated portions of the schema." The reason of an item deprecated without one is the default of the service's own @deprecated(reason:); a default that differs from §3.13.3's fails builtinDefinitions only. September 2025 has the same sentences for fields, arguments, input fields and enum values (its §4.2.6 has no isDeprecated on __Directive, which is new in September 2026). October 2021 has them for fields and enum values only, and says "deprecationReason optionally provides a reason why this field is deprecated", so under the October 2021 profile a null reason is deprecationReasonOmitted.
- **Basis for `deprecationReasonOmitted`:** October 2021 §4.2.3 and §4.2.5: "deprecationReason optionally provides a reason why this field is deprecated." That makes the reason optional, where September 2025 and September 2026 say "returns the reason why this field is deprecated" (a MUST, under deprecation). The intent is plainly that the reason the schema gives is returned, which makes null a SHOULD here; another string still fails deprecation.
- **Basis for `specifiedByURL`:** §4.2.2: "specifiedByURL may return a String (in the form of a URL) for custom scalars, otherwise must be null." A URL other than the one @specifiedBy gives, or a URL on a built-in scalar, fails this check. Null for a scalar the document gives a URL is specifiedByURLOmitted.
- **Basis for `specifiedByURLOmitted`:** §4.2.2: "specifiedByURL may return a String (in the form of a URL) for custom scalars, otherwise must be null." By Appendix A, a lowercase "may" keeps its RFC 2119 meaning, so returning the URL is optional; the intent is plainly that the URL @specifiedBy gives is returned, which makes null a SHOULD, as for defaultValueOmitted. A service that doesn't provide @specifiedBy at all fails builtinDirectives instead.
- **Basis for `isOneOf`:** §4.2.2: "isOneOf must return true when representing a OneOf Input Object, otherwise false." September 2025 introduced OneOf Input Objects (§3.10.1) and isOneOf with this sentence.
- **Basis for `descriptions`:** §3.2: documentation is "written immediately alongside definitions in a TypeSystemDocument and made available via introspection", which has no key word, and §4.2 says of every description field that it "may return a String or null". So a description the document gives that is lost or replaced fails this SHOULD, and any description is accepted for a definition the document doesn't describe ("" or one of the service's own included).
- **Basis for `directives`:** §4.2.1: "directives must return the set of all directives available within this schema including all built-in directives." §3.13: "When introspecting a GraphQL service all provided directives, including any built-in directive, must be included in the set of returned directives." §4.2.6: "locations returns a List of __DirectiveLocation representing the valid locations this directive may be placed", and "isRepeatable must return a Boolean that indicates if the directive may be used repeatedly at a single location." A directive's argument "must accept a type where IsInputType(argumentType) returns true" (§3.13, Type Validation).
- **Basis for `builtinDirectives`:** §3.13: "GraphQL implementations should provide the @skip and @include directives." "GraphQL implementations that support the type system definition language should provide the @specifiedBy directive if representing custom scalar definitions." "... should provide the @oneOf directive if representing OneOf Input Objects." @oneOf is new in September 2025.
- **Basis for `builtinDefinitions`:** §4.2 gives the introspection types with "Below are the full set of type system definitions providing schema introspection, which are fully defined in the sections below", and the sections below say what each field returns ("kind must return __TypeKind.OBJECT", "isRepeatable must return a Boolean", "args returns a List of __InputValue"). A field, argument or enum value left out, or with another type, can't return what they say. §3.13: "A built-in directive is any directive defined within this specification", each with its definition (§3.13.1 to §3.13.5). Appendix A: "Conformance requirements are described in this document via both descriptive assertions and key words with clearly defined meanings." Where only the Non-Null wrapping differs, and the result accepts or returns everything the spec's would, the difference is builtinNullability; an addition is builtinAdditions.
- **Basis for `builtinNullability`:** The Non-Null wrapping of the introspection fields and arguments, and of the built-in directives' arguments, is given only by the definitions (§4.2 introduces them with "Below are the full set of type system definitions providing schema introspection, which are fully defined in the sections below", and §3.13.3 has "directive @deprecated(reason: String! = \"No longer supported\")"), which have no key word. The prose says what each field returns ("isRepeatable must return a Boolean") and, of each includeDeprecated, only "Accepts the argument includeDeprecated which defaults to false". A field whose type differs only in Non-Null can still return exactly that, and an argument that is nullable where the spec has Non-Null, with the same default, accepts every value the spec's does. So these are graded at the weaker level. An argument that is Non-Null where the spec's is nullable rejects requests the spec accepts, and stays under builtinDefinitions.
- **Basis for `builtinAdditions`:** No sentence of §4 forbids extending the introspection types. The nearest is "Below are the full set of type system definitions providing schema introspection, which are fully defined in the sections below", which uses no key word, and Appendix A says "A conforming implementation of GraphQL may provide additional functionality, but must not do so where explicitly disallowed". Leaving out or changing a definition stays a MUST, under builtinDefinitions.
- **Basis for `builtinEdition`:** The kit grades September 2026, the latest release; the September 2025 and October 2021 profiles are for a service whose introspection types September 2026's query can't ask. A built-in definition (or an addition) that is exactly as a later release defines it breaks nothing that release requires, so it is reported here, labelled with that release, and not under builtinDefinitions or builtinAdditions.
- **Basis for `typename`:** §4.1: "Type name introspection is accomplished via the meta-field __typename: String! on any Object, Interface, or Union. It returns the name of the concrete Object type at that point during operation execution." "As a meta-field, __typename is implicit and does not appear in the fields list in any defined type."
- **Basis for `order`:** §4 "Stable Ordering": "When a schema is produced from a TypeSystemDocument, introspection should return items in the same source order for each element list: object fields, input object fields, arguments, enum values, directives, union member types, and implemented interfaces." September 2025 introduced this paragraph.
- **Basis for `other`:** A difference Introspection!Matches finds that IntrospectChecks can't name. Matches compares with the result §4.2 defines, so a difference there is one from what §4.2's sentences require.
