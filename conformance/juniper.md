# juniper 0.18.0 (GraphQLType with TypeInfo)

Generated from the conformance kit's reports. Back to the [sheet](README.md).

**Notes** (hand-written, from outside the kit):

- Juniper builds schemas from Rust types. The adapter uses its documented dynamic route, a hand-written `GraphQLType` with `TypeInfo`, and Juniper's own code completes objects, lists and scalars. Values a typed schema can't hold aren't sent: uncoercible results only for Float (`uncoercibleTypes`), so `intFraction` is untested, no `scalar-results` (an ID is a string type, an Int an `i32`), no `custom-scalar-results` (a Juniper scalar's output can't fail), and no null for a Non-Null list item or subscription event (`nullItems: false`). The report's provenance counts what was left out.
- Fields called twice (a mutation root field too, `mutationFieldsOnce`; repeated errors at one path, `errorPathsUnique`; a null lost when results merge), error paths without list indices, the nested list, the non-finite Float and the subscription findings reproduce with `#[graphql_object]` (`examples/macros.rs`). A source stream's failure can only be an error item in a Rust stream, which Juniper answers with an error result and a normal completion; the kit accepts that as completing with the error (the weaker reading of §6.2.3), so `failsWithSource` passes. See the [adapter's README](../adapters/juniper/README.md#known-juniper-deviations).
- The adapter doesn't claim `invalid-results` (result shapes are fixed by Rust types), `custom-directives` (Juniper can't declare a directive of its own), `parse-sdl` (Juniper parses only executable documents), or the schema and coordinate areas (Juniper doesn't read SDL and has no schema coordinate API, so every schema verdict would be the adapter's). Introspection descriptions are read from SDL by the adapter with `async-graphql-parser`, which can't read September 2025's string forms: those 3 vectors aren't graded.

## Execution

- **Capabilities:** deferred-items, idle, introspect, mutation, parent-values, parse, subscription, subscription-stream, uncoercible-results, validate
- **Cases:** 44329 submitted, 2512 distinct, 15543 malformed
- **Not sent:** 6323 null for a Non-Null list item or subscription event (nullItems: false), 8584 results of the wrong shape (no invalid-results capability), 3231 an Int outside 32 bits or an integer ID (no scalar-results capability), 1713 uncoercible Int results (uncoercibleTypes: Float), 1572 uncoercible Enum results (uncoercibleTypes: Float)
- **Adapter problems:** none
- **Checker self-test:** passed (87 negative controls)
- **Run:** kit 240a580eae23, 2026-11-26, strict, 1500 random runs per fixture (seed 1), exhaustive runs on

### Findings

<a id="execution-finding-1"></a>

#### 1. `callsOnce`: the resolver at req was called twice

3068 cases, in `conditionalMerge_on` (1534), `conditionalMerge_off` (1534).

- Each field is executed once, merged selections included (mutation root fields: mutationFieldsOnce) (INFO)

The shortest case, from `conditionalMerge_on`:

```
problem:  the resolver at req was called twice (§6.3.2 executes each field once)
trace:    call req; call req; call opt; settle req = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Query.req.","locations":[{"line":2,"column":3}],"path":["req"]}]}
```

<a id="execution-finding-2"></a>

#### 2. `responsePosition`: error path … leaves out the list indices of …, where the error was raised

3057 cases, in `lists` (916), `listPartialNull` (552), `nestedLists` (486), `abstractList` (475), `unions` (338), `deepLists` (144), `aliases` (93), `nonNullListItems` (53).

- Paths are lists of response names (aliases, not field names) and integer list indices, none left out (MUST, [§7.1.4](https://spec.graphql.org/September2026/#sec-Response-Position))

The shortest case, from `abstractList`:

```
problem:  error path ["nodes"] leaves out the list indices of ["nodes","0"], where the error was raised (§7.1.4)
trace:    call nodes; settle nodes = list(1); call nodes.0; settle nodes.0 = error
response: {"data":{"nodes":[null]},"errors":[{"message":"resolver at nodes.0 failed","locations":[{"line":2,"column":3}],"path":["nodes"]}]}
```

<a id="execution-finding-3"></a>

#### 3. `mutationFieldsOnce`: the resolver at a was called twice

2750 cases, in `mutationRoot` (2750).

- Each mutation root field the operation selects executes once, and no other mutation root field executes (MUST, [§6.2.2](https://spec.graphql.org/September2026/#sec-Mutation) [§6.3.2](https://spec.graphql.org/September2026/#sec-Field-Collection) [§6.3.4](https://spec.graphql.org/September2026/#sec-Normal-and-Serial-Execution))

The shortest case, from `mutationRoot`:

```
problem:  the resolver at a was called twice (§6.3.2 executes each field once)
trace:    call a; settle a = null; call b; settle b = null; call a; settle a = null; call likeAll; settle likeAll = null
response: {"data":{"a":null,"b":null,"__typename":"Mutation","root":"Mutation","likeAll":null}}
```

<a id="execution-finding-4"></a>

#### 4. `callsOnce`: the resolver at … was called twice

2432 cases, in `abstract` (1281), `mutationRoot` (596), `fragments` (555).

- Each field is executed once, merged selections included (mutation root fields: mutationFieldsOnce) (INFO)

The shortest case, from `abstract`:

```
problem:  the resolver at node.friend was called twice (§6.3.2 executes each field once)
trace:    call node; settle node = object(User); call node.friend; call node.latest; settle node.friend = null; settle node.latest = null; call node.friend; settle node.friend = null
response: {"data":{"node":{"__typename":"User","friend":null,"latest":null}}}
```

<a id="execution-finding-5"></a>

#### 5. `callsOnce`: the resolver at bar was called twice

1986 cases, in `ordering` (1986).

- Each field is executed once, merged selections included (mutation root fields: mutationFieldsOnce) (INFO)

The shortest case, from `ordering`:

```
problem:  the resolver at bar was called twice (§6.3.2 executes each field once)
trace:    call baz; call bar; settle baz = null; settle bar = null; call bar; call foo; call qux; settle bar = null; settle foo = null; settle qux = null
response: {"data":{"bar":null,"foo":null,"baz":null,"qux":null}}
```

<a id="execution-finding-6"></a>

#### 6. `callsOnce`: the resolver at a was called twice

1830 cases, in `merging` (1830).

- Each field is executed once, merged selections included (mutation root fields: mutationFieldsOnce) (INFO)

The shortest case, from `merging`:

```
problem:  the resolver at a was called twice (§6.3.2 executes each field once)
trace:    call a; call b; settle a = null; settle b = null; call a; settle a = null
response: {"data":{"a":null,"b":null}}
```

<a id="execution-finding-7"></a>

#### 7. `errorPathFull`: error path … stops where the error raised at … propagated to

1328 cases, in `lists` (580), `mutationRoot` (449), `unions` (155), `aliases` (74), `nonNullListItems` (70).

- An error that propagated to a nullable parent keeps the full path to where it was raised (SHOULD, [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors))

The shortest case, from `lists`:

```
problem:  error path ["posts"] stops where the error raised at ["posts","0"] propagated to (§7.1.6: should include the full path)
trace:    call posts; call tags; settle posts = list(1); call posts.0; settle tags = null; settle posts.0 = error
response: {"data":null,"errors":[{"message":"resolver at posts.0 failed","locations":[{"line":2,"column":3}],"path":["posts"]},{"message":"Cannot return null for non-nullable field Query.tags.","locations":[{"line":5,"column":3}],"path":["tags"]}]}
```

<a id="execution-finding-8"></a>

#### 8. `coercionErrorReported`: ratio is null without an error, though its resolver returned a value its type can't represent, which must raise an execution error

415 cases, in `leaves` (415).

- A position whose resolver returned a value its type can't represent isn't null without an error (MUST, [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) [§3.5.1](https://spec.graphql.org/September2026/#sec-Int) [§3.5.2](https://spec.graphql.org/September2026/#sec-Float) [§3.9](https://spec.graphql.org/September2026/#sec-Enums) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors))

The shortest case, from `leaves`:

```
problem:  ratio is null without an error, though its resolver returned a value its type can't represent, which must raise an execution error
trace:    call count; call ratio; call color; settle count = null; settle ratio = uncoercible; settle color = null
response: {"data":{"count":null,"ratio":null,"color":null}}
```

<a id="execution-finding-9"></a>

#### 9. `dataMatches`

414 cases, in `nestedLists` (191), `abstract` (117), `merging` (59), `unions` (34), `subscription` (11), `deepLists` (2).

- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/September2026/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors))

The shortest case, from `subscription`:

```
trace:    call postLiked; settle postLiked = error
response: {"data":{"postLiked":null},"errors":[{"message":"resolver at postLiked failed","locations":[{"line":2,"column":3}],"path":["postLiked"]}]}
expected: data null
```

<a id="execution-finding-10"></a>

#### 10. `errorPathsUnique`

272 cases, in `ordering` (163), `mutationRoot` (40), `abstract` (31), `merging` (15), `fragments` (9), `conditionalMerge_on` (7), `conditionalMerge_off` (7).

- No two errors share a response path (MUST, [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors))

The shortest case, from `conditionalMerge_on`:

```
trace:    call req; call req; call opt; settle req = error; settle req = error
response: {"data":null,"errors":[{"message":"resolver at req failed","locations":[{"line":2,"column":3}],"path":["req"]},{"message":"resolver at req failed","locations":[{"line":3,"column":3}],"path":["req"]}]}
expected: data null
```

<a id="execution-finding-11"></a>

#### 11. `dataMatches`, `errorPathsUnique`

10 cases, in `merging` (10).

- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/September2026/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors))
- No two errors share a response path (MUST, [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors))

The shortest case, from `merging`:

```
trace:    call a; call b; settle b = null; settle a = object(A); call a.subfield2; call a.subfield1; settle a.subfield1 = error; settle a.subfield2 = null; call a; settle a = object(A); call a.subfield1; settle a.subfield1 = error
response: {"data":{"a":{"subfield1":null},"b":null},"errors":[{"message":"resolver at a.subfield1 failed","locations":[{"line":3,"column":5}],"path":["a","subfield1"]},{"message":"Cannot return null for non-nullable field A.subfield2.","locations":[{"line":10,"column":5}],"path":["a","subfield2"]},{"message":"resolver at a.subfield1 failed","locations":[{"line":11,"column":5}],"path":["a","subfield1"]}]}
expected: data {"a": null, "b": null}
```

<a id="execution-finding-12"></a>

#### 12. `complete`, `dataMatches`

1 case, in `subscriptionAlias` (1).

- The response is sent only once execution is complete (MUST, [§6.3.1](https://spec.graphql.org/September2026/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/September2026/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/September2026/#sec-Data))
- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/September2026/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors))

The shortest case, from `subscriptionAlias`:

```
trace:    call liked; settle liked = object(Post); call liked.likes; settle liked.likes = leaf
response: {"data":{"liked":{"likes":1}}}
expected: data (incomplete)
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
| The response is sent only once execution is complete (`complete`) | MUST | [§6.3.1](https://spec.graphql.org/September2026/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/September2026/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/September2026/#sec-Data) | ✗ 1/5237 |
| data is the completed value: field collection, value completion and null propagation (`dataMatches`) | MUST | [§6.3.2](https://spec.graphql.org/September2026/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) | ✗ 425/5237 |
| Response keys are in collected field order (`keyOrder`) | SHOULD | [§7.2.2](https://spec.graphql.org/September2026/#sec-Serialized-Map-Ordering) | ✓ 5237 |
| Every error was raised, at the path where it was raised (`errorsWereRaised`) | MUST | [§7.1.4](https://spec.graphql.org/September2026/#sec-Response-Position) [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 3588 |
| No two errors share a response path (`errorPathsUnique`) | MUST (SHOULD in September 2025 and October 2021) | [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) | ✗ 282/3588 |
| Every error is inside a null in data (`errorsInsideNulls`) | MUST | [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 3588 |
| Every null an error caused comes with an error from one of its causes (`nullsExplained`) | MUST (SHOULD in October 2021) | [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) | ✓ 3588 |
| A mutation that ran its root fields serially reports every error its earlier root fields raised (`serialErrorsKept`) | MUST (SHOULD in October 2021) | [§6.3.4](https://spec.graphql.org/September2026/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) | ✓ 145 |
| A mutation's root fields execute one after another (`calledSerially`) | SHOULD | [§6.2.2](https://spec.graphql.org/September2026/#sec-Mutation) [§6.3.4](https://spec.graphql.org/September2026/#sec-Normal-and-Serial-Execution) | ✓ 170 |
| Each mutation root field the operation selects executes once, and no other mutation root field executes (`mutationFieldsOnce`) | MUST | [§6.2.2](https://spec.graphql.org/September2026/#sec-Mutation) [§6.3.2](https://spec.graphql.org/September2026/#sec-Field-Collection) [§6.3.4](https://spec.graphql.org/September2026/#sec-Normal-and-Serial-Execution) | ✗ 2750/4340 |
| Each field is executed once, merged selections included (mutation root fields: mutationFieldsOnce) (`callsOnce`) | INFO | — | i 9316/44293 |
| Only fields the operation selects are executed (mutation root fields: mutationFieldsOnce) (`callsSelected`) | INFO | — | ✓ 44293 |
| A field executes only once its parent has a value that contains it (`callsReachable`) | INFO | — | ✓ 44293 |
| A request gets a response (`responds`) | MUST | [§7](https://spec.graphql.org/September2026/#sec-Response) | ✓ 44293 |
| A subscription event yields an execution result, even when its data is null (`eventYieldsResult`) | MUST | [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) [§7.1.2](https://spec.graphql.org/September2026/#sec-Response-Format.Response-Stream) | ✓ 3066 |
| Each source event yields one execution result on the response stream, before it completes (`eventPerSourceEvent`) | MUST | [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) [§7.1.2](https://spec.graphql.org/September2026/#sec-Response-Format.Response-Stream) | ✓ 36 |
| The response stream completes only when its source completes or fails, or it is cancelled (`streamEndsOnlyForCause`) | SHOULD | [§6.2.3](https://spec.graphql.org/September2026/#sec-Subscription) [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) | ✓ 36 |
| When the source stream completes, the response stream completes normally (`completesWithSource`) | MUST (SHOULD in October 2021) | [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) | ✓ 16 |
| When the source stream fails, the response stream completes with an error (`failsWithSource`) | MUST (since September 2025) | [§6.2.3](https://spec.graphql.org/September2026/#sec-Subscription) [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) | ✓ 8 |
| A cancelled response stream completes normally (`cancelCompletes`) | MUST (since September 2025) | [§6.2.3](https://spec.graphql.org/September2026/#sec-Subscription) [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) [§6.2.3.3](https://spec.graphql.org/September2026/#sec-Unsubscribe) | ✓ 12 |
| Cancelling the response stream cancels the source stream (`cancelCancelsSource`) | MUST (since September 2025) | [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) [§6.2.3.3](https://spec.graphql.org/September2026/#sec-Unsubscribe) | ✓ 12 |
| No result arrives after the client cancels the response stream (`nothingAfterCancel`) | SHOULD (MUST in October 2021) | [§6.2.3](https://spec.graphql.org/September2026/#sec-Subscription) [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) | ✓ 12 |
| data holds only positions the operation selects (`dataShape`) | MUST | [§6.3.3](https://spec.graphql.org/September2026/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/September2026/#sec-Data) | ✓ 37694 |
| A non-finite Float, an unknown enum value or a value a custom scalar rejects raises an execution error instead of being passed through (`resultCoercion`) | MUST | [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) [§3.5.2](https://spec.graphql.org/September2026/#sec-Float) [§3.9](https://spec.graphql.org/September2026/#sec-Enums) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) | ✓ 415 |
| A fraction returned for an Int (1.2) raises an execution error instead of being truncated (`intFraction`) | MUST | [§3.5.1](https://spec.graphql.org/September2026/#sec-Int) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) | – |
| A position whose resolver returned a value its type can't represent isn't null without an error (`coercionErrorReported`) | MUST (SHOULD in October 2021) | [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) [§3.5.1](https://spec.graphql.org/September2026/#sec-Int) [§3.5.2](https://spec.graphql.org/September2026/#sec-Float) [§3.9](https://spec.graphql.org/September2026/#sec-Enums) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) | ✗ 415/415 |
| An Int outside 32 bits returned by a resolver (2147483648) raises an execution error instead of being passed through (`intRange`) | SHOULD | [§3.5.1](https://spec.graphql.org/September2026/#sec-Int) | – needs `scalar-results` |
| An ID whose resolver returned an integer (4) is serialized as a String ("4") (`idAsString`) | MUST (SHOULD in October 2021) | [§3.5.5](https://spec.graphql.org/September2026/#sec-ID) | – needs `scalar-results` |
| Leaf values are the resolver's canonical value (Int 1, Float 1.5, Boolean true, an enum's first value, "v") (`leafValues`) | MUST | [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) | ✓ 37694 |
| Leaf values use the JSON type §7.2.1 gives their GraphQL type (a number for Int 1, not "1") (`leafEncoding`) | SHOULD | [§7.2.1](https://spec.graphql.org/September2026/#sec-JSON-Serialization) | ✓ 37694 |
| The execution result is a map (`resultMap`) | MUST | [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) | ✓ 44293 |
| An execution result has a data entry (`dataPresent`) | MUST | [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) | ✓ 44293 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) | ✓ 44293 |
| The response has no entries besides data, errors and extensions (`additionalEntries`) | MUST | [§7.1.8](https://spec.graphql.org/September2026/#sec-Additional-Entries) | ✓ 44293 |
| extensions is a map (`extensions`). no response had an extensions entry, so there was nothing to grade (§7.1.7: the entry is a may) | MUST | [§7.1.7](https://spec.graphql.org/September2026/#sec-Extensions) | – |
| Errors are maps with a message, and extensions, if present, is a map (`errorFormat`) | MUST | [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 29822 |
| An error's locations, if present, is a list of maps with line and column, both positive integers (`errorLocations`) | SHOULD | [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 29822 |
| An execution error raised at a field has locations (`errorLocationsPresent`) | SHOULD | [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 29822 |
| An execution error's locations point at the field it was raised at (`errorLocationsAccurate`) | SHOULD | [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 29822 |
| Execution errors have a path to a position the operation selects (`errorPath`) | MUST | [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 29822 |
| Paths are lists of response names (aliases, not field names) and integer list indices, none left out (`responsePosition`) | MUST (SHOULD in October 2021) | [§7.1.4](https://spec.graphql.org/September2026/#sec-Response-Position) | ✗ 3057/29822 |
| An error that propagated to a nullable parent keeps the full path to where it was raised (`errorPathFull`) | SHOULD | [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ! 1328/29822 |
| Errors have no entries besides message, locations, path and extensions (`errorEntries`) | SHOULD | [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 29822 |
| No map in the serialized response repeats a key (`uniqueKeys`) | MUST | [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) [§7.2.1](https://spec.graphql.org/September2026/#sec-JSON-Serialization) [Appendix B](https://spec.graphql.org/September2026/#sec-Appendix-Notation-Conventions) | ✓ 44293 |
| Each field's resolver is given its parent's value: the initial value at the root, a subscription event's value at its root (`parentValue`) | MUST | [§6.2.1](https://spec.graphql.org/September2026/#sec-Query) [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) [§6.3.3](https://spec.graphql.org/September2026/#sec-Executing-Collected-Fields) [§6.4.2](https://spec.graphql.org/September2026/#sec-Value-Resolution) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) | ✓ 44293 |
| The adapter follows the kit's protocol (call types, settles) (`protocol`) | ADAPTER | — | ✓ 44293 |
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
- **Basis for `nothingAfterCancel`:** MapSourceToResponseEvent (§6.2.3.2): "When {responseStream} is cancelled: Cancel {sourceStream}. Complete {responseStream} normally", and a completed stream emits nothing more. But the algorithm doesn't say what happens to an event whose ExecuteSubscriptionEvent was already running when the stream was cancelled, whose step "emit {executionResult} on {responseStream}" comes after, and §6.2.3's "When an event stream is cancelled, it must complete" doesn't say how soon. With the level in doubt the kit takes the weaker one. The kit's scenario cancels the stream while an event's resolvers are pending, then settles them; a result for that event after the cancel fails here (graphql-js 17 delivers it, then completes). September 2025 says the same. October 2021's §6.2.3: after cancelling, an observer "must receive no more events from that event stream", a must.
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
| [`abstract`](../fixtures/abstract.graphql) | ✗ 148/2402 |  |
| [`abstractList`](../fixtures/abstractList.graphql) | ✗ 475/1650 |  |
| [`aliases`](../fixtures/aliases.graphql) | ✗ 167/1698 |  |
| [`booleanResult`](../fixtures/booleanResult.graphql) | ✓ 1506 | without results of the wrong shape (no invalid-results capability) |
| [`conditionalMerge_on`](../fixtures/conditionalMerge_on.graphql) | ✗ 7/1534 |  |
| [`conditionalMerge_off`](../fixtures/conditionalMerge_off.graphql) | ✗ 7/1534 |  |
| [`deepLists`](../fixtures/deepLists.graphql) | ✗ 144/1520 |  |
| [`directives_kept`](../fixtures/directives_kept.graphql) | ✓ 1662 |  |
| [`directives_skipped`](../fixtures/directives_skipped.graphql) | ✓ 1506 |  |
| [`directives_excluded`](../fixtures/directives_excluded.graphql) | ✓ 1506 |  |
| [`directives_dropped`](../fixtures/directives_dropped.graphql) | ✓ 1502 |  |
| [`fragments`](../fixtures/fragments.graphql) | ✗ 9/1684 |  |
| [`leaves`](../fixtures/leaves.graphql) | ✗ 415/1572 | without results of the wrong shape (no invalid-results capability) |
| [`listPartialNull`](../fixtures/listPartialNull.graphql) | ✗ 552/1618 |  |
| [`lists`](../fixtures/lists.graphql) | ✗ 1233/2097 |  |
| [`merging`](../fixtures/merging.graphql) | ✗ 84/1830 |  |
| [`mutation`](../fixtures/mutation.graphql) | ✓ 1590 |  |
| [`mutationRoot`](../fixtures/mutationRoot.graphql) | ✗ 2750/2750 |  |
| [`nestedLists`](../fixtures/nestedLists.graphql) | ✗ 486/1686 |  |
| [`noPropagation`](../fixtures/noPropagation.graphql) | – | needs error-propagation-off |
| [`nonNullListItems`](../fixtures/nonNullListItems.graphql) | ✗ 123/1554 |  |
| [`nullPropagation`](../fixtures/nullPropagation.graphql) | ✓ 1662 |  |
| [`ordering`](../fixtures/ordering.graphql) | ✗ 163/1986 |  |
| [`scalars`](../fixtures/scalars.graphql) | ✓ 1518 | without results of the wrong shape (no invalid-results capability) |
| [`subscription`](../fixtures/subscription.graphql) | ✗ 11/1554 |  |
| [`subscriptionAlias`](../fixtures/subscriptionAlias.graphql) | ✗ 1/1548 |  |
| [`unions`](../fixtures/unions.graphql) | ✗ 478/1660 | without results of the wrong shape (no invalid-results capability) |

## Parse

- **Capabilities:** deferred-items, idle, introspect, mutation, parent-values, parse, subscription, subscription-stream, uncoercible-results, validate
- **Cases:** 2119 submitted, 2119 distinct, 0 malformed
- **Vectors:** 2119 of 2847 graded (not graded: 713 needs capability parse-sdl, 15 unsupported by the adapter)
- **Vectors relying on rules after October 2021:** since September 2025, 2 of 126 vectors failing; new in September 2026, 8 of 8 vectors failing
- **Adapter problems:** none
- **Checker self-test:** passed (10 negative controls)
- **Run:** kit 0625b35d64dd, 2026-11-16, strict

### Findings

<a id="parse-finding-1"></a>

#### 1. `intValue`: accepts what §2.10.1 Int Value rejects

10 cases, in `lexer-examples` (5), `numbers` (5).

- Int values (MUST, [§2.10.1](https://spec.graphql.org/September2026/#sec-Int-Value))

The shortest case, from `lexer-examples`:

```
input:    "{a(x: [01])}"
sibling:  "{a(x: [1])}", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-2"></a>

#### 2. `selectionSets`: rejects what §2.5 Selection Sets accepts

8 cases, in `random-documents` (4), `parser-examples` (3), `field-suffixes` (1). All rely on grammar or rules introduced in September 2026, not in October 2021.

- Selection sets, including empty ones (MUST, [§2.5](https://spec.graphql.org/September2026/#sec-Selection-Sets))

The shortest case, from `parser-examples`:

```
input:    [since September 2026] "{}"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-3"></a>

#### 3. `stringValue`: rejects what §2.10.4 String Value accepts

6 cases, in `block-strings` (3), `lexer-examples` (2), `strings` (1). 2 of them rely on grammar or rules introduced in September 2025, not in October 2021.

- String values and block strings (MUST, [§2.10.4](https://spec.graphql.org/September2026/#sec-String-Value))

The shortest case, from `lexer-examples`:

```
input:    "{a(x: \"\"\"\\\"\"\"\"\"\")}"
sibling:  "{a(x: \"\"\"\\\"\"\"\"\")}", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-4"></a>

#### 4. `intValue`: rejects what §2.10.1 Int Value accepts

5 cases, in `int-range` (3), `lexer-examples` (1), `numbers` (1).

- Int values (MUST, [§2.10.1](https://spec.graphql.org/September2026/#sec-Int-Value))

The shortest case, from `numbers`:

```
input:    "{a(x: [0-0])}"
sibling:  "{a(x: [0-.])}", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-5"></a>

#### 5. `stringValue`: accepts what §2.10.4 String Value rejects

4 cases, in `lexer-examples` (2), `block-strings` (2).

- String values and block strings (MUST, [§2.10.4](https://spec.graphql.org/September2026/#sec-String-Value))

The shortest case, from `block-strings`:

```
input:    "{a(x: \"\"\"\\\"\"\"\")}"
sibling:  "{a(x: \"\"\"\\ \"\"\")}", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-6"></a>

#### 6. `variables`: rejects what §2.11 Variables accepts

1 case, in `parser-examples` (1).

- Variables and variable definitions (MUST, [§2.11](https://spec.graphql.org/September2026/#sec-Language.Variables))

The shortest case, from `parser-examples`:

```
input:    "query ($a: Int = {k: [1, E, null]}) {a}"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-7"></a>

#### 7. `variables`: accepts what §2.11 Variables rejects

1 case, in `parser-examples` (1).

- Variables and variable definitions (MUST, [§2.11](https://spec.graphql.org/September2026/#sec-Language.Variables))

The shortest case, from `parser-examples`:

```
input:    "query ($a: Int @d(x: $b)) {a}"
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
| Source text is a sequence of SourceCharacter (`sourceText`) | MUST | [§2.1](https://spec.graphql.org/September2026/#sec-Language.Source-Text) | ✓ 76 |
| White space is tab and space only (`whiteSpace`) | MUST | [§2.1.1](https://spec.graphql.org/September2026/#sec-White-Space) | ✓ 27 |
| Line terminators are LF, CR and CR LF only (`lineTerminators`) | MUST | [§2.1.2](https://spec.graphql.org/September2026/#sec-Line-Terminators) | ✓ 31 |
| A comment runs to the end of its line (`comments`) | MUST | [§2.1.3](https://spec.graphql.org/September2026/#sec-Comments) | ✓ 46 |
| Commas are insignificant (`insignificantCommas`) | MUST | [§2.1.4](https://spec.graphql.org/September2026/#sec-Insignificant-Commas) | ✓ 11 |
| Every character outside ignored tokens is part of a token (`lexicalTokens`) | MUST | [§2.1.5](https://spec.graphql.org/September2026/#sec-Language.Source-Text.Lexical-Tokens) | ✓ 61 |
| Ignored tokens may appear before and after every token (`ignoredTokens`) | MUST | [§2.1.6](https://spec.graphql.org/September2026/#sec-Language.Source-Text.Ignored-Tokens) | ✓ 424 |
| Punctuators, and `...` only as a whole (`punctuators`) | MUST | [§2.1.7](https://spec.graphql.org/September2026/#sec-Punctuators) | ✓ 40 |
| Names (`names`) | MUST | [§2.1.8](https://spec.graphql.org/September2026/#sec-Names) | ✓ 15 |
| Descriptions on operations, fragments and variables, not on the query shorthand (`descriptions`) | MUST | [§2.2](https://spec.graphql.org/September2026/#sec-Descriptions) | ✓ 121 |
| A document is one or more definitions of the kinds its grammar allows (`document`) | MUST | [§2.3](https://spec.graphql.org/September2026/#sec-Document) | ✓ 110 |
| Operation definitions and the query shorthand (`operations`) | MUST | [§2.4](https://spec.graphql.org/September2026/#sec-Language.Operations) | ✓ 102 |
| Selection sets, including empty ones (`selectionSets`) | MUST | [§2.5](https://spec.graphql.org/September2026/#sec-Selection-Sets) | ✗ 8/97 (all new in September 2026) |
| Fields (`fields`) | MUST | [§2.6](https://spec.graphql.org/September2026/#sec-Language.Fields) | ✓ 97 |
| Arguments (`arguments`) | MUST | [§2.7](https://spec.graphql.org/September2026/#sec-Language.Arguments) | ✓ 111 |
| Field aliases (`fieldAlias`) | MUST | [§2.8](https://spec.graphql.org/September2026/#sec-Field-Alias) | ✓ 94 |
| Fragment definitions and fragment spreads (`fragments`) | MUST | [§2.9](https://spec.graphql.org/September2026/#sec-Language.Fragments) | ✓ 117 |
| Type conditions (`typeConditions`) | MUST | [§2.9.1](https://spec.graphql.org/September2026/#sec-Type-Conditions) | ✓ 112 |
| Inline fragments (`inlineFragments`) | MUST | [§2.9.2](https://spec.graphql.org/September2026/#sec-Inline-Fragments) | ✓ 101 |
| Input values, and no variables in constant values (`inputValues`) | MUST | [§2.10](https://spec.graphql.org/September2026/#sec-Input-Values) | ✓ 122 |
| Int values (`intValue`) | MUST | [§2.10.1](https://spec.graphql.org/September2026/#sec-Int-Value) | ✗ 15/47 |
| Float values (`floatValue`) | MUST | [§2.10.2](https://spec.graphql.org/September2026/#sec-Float-Value) | ✓ 36 |
| Boolean values (`booleanValue`) | MUST | [§2.10.3](https://spec.graphql.org/September2026/#sec-Boolean-Value) | ✓ 6 |
| String values and block strings (`stringValue`) | MUST | [§2.10.4](https://spec.graphql.org/September2026/#sec-String-Value) | ✗ 10/195 (2 since September 2025) |
| Null value (`nullValue`) | MUST | [§2.10.5](https://spec.graphql.org/September2026/#sec-Null-Value) | ✓ 4 |
| Enum values (`enumValue`) | MUST | [§2.10.6](https://spec.graphql.org/September2026/#sec-Enum-Value) | ✓ 16 |
| List values (`listValue`) | MUST | [§2.10.7](https://spec.graphql.org/September2026/#sec-List-Value) | ✓ 104 |
| Input object values (`inputObjectValues`) | MUST | [§2.10.8](https://spec.graphql.org/September2026/#sec-Input-Object-Values) | ✓ 109 |
| Variables and variable definitions (`variables`) | MUST | [§2.11](https://spec.graphql.org/September2026/#sec-Language.Variables) | ✗ 2/159 |
| Type references (`typeReferences`) | MUST | [§2.12](https://spec.graphql.org/September2026/#sec-Type-References) | ✓ 115 |
| Directives (`directives`) | MUST | [§2.13](https://spec.graphql.org/September2026/#sec-Language.Directives) | ✓ 112 |
| Type system documents hold type system definitions, and extension documents extensions too (`typeSystemDocuments`) | MUST | [§3.1](https://spec.graphql.org/September2026/#sec-Type-System-Extensions) | – |
| Descriptions on type system definitions and their parts, not on extensions (`typeSystemDescriptions`) | MUST | [§3.2](https://spec.graphql.org/September2026/#sec-Type-System-Descriptions) | – |
| Schema definitions (`schemaDefinition`) | MUST | [§3.3](https://spec.graphql.org/September2026/#sec-Schema) | – |
| Schema extensions add directives or root operation types (`schemaExtension`) | MUST | [§3.3.2](https://spec.graphql.org/September2026/#sec-Schema-Extension) | – |
| A type extension names a kind of type (`typeExtensions`) | MUST | [§3.4.3](https://spec.graphql.org/September2026/#sec-Type-Extensions) | – |
| Scalar definitions (`scalarDefinition`) | MUST | [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) | – |
| Scalar extensions add directives (`scalarExtension`) | MUST | [§3.5.6](https://spec.graphql.org/September2026/#sec-Scalar-Extensions) | – |
| Object definitions, implemented interfaces and field definitions (`objectDefinition`) | MUST | [§3.6](https://spec.graphql.org/September2026/#sec-Objects) | – |
| Argument definitions (`argumentsDefinition`) | MUST | [§3.6.1](https://spec.graphql.org/September2026/#sec-Field-Arguments) | – |
| Object extensions add interfaces, directives or fields (`objectExtension`) | MUST | [§3.6.3](https://spec.graphql.org/September2026/#sec-Object-Extensions) | – |
| Interface definitions (`interfaceDefinition`) | MUST | [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces) | – |
| Interface extensions add interfaces, directives or fields (`interfaceExtension`) | MUST | [§3.7.1](https://spec.graphql.org/September2026/#sec-Interface-Extensions) | – |
| Union definitions and their member types (`unionDefinition`) | MUST | [§3.8](https://spec.graphql.org/September2026/#sec-Unions) | – |
| Union extensions add directives or member types (`unionExtension`) | MUST | [§3.8.1](https://spec.graphql.org/September2026/#sec-Union-Extensions) | – |
| Enum definitions and their values (`enumDefinition`) | MUST | [§3.9](https://spec.graphql.org/September2026/#sec-Enums) | – |
| Enum extensions add directives or values (`enumExtension`) | MUST | [§3.9.1](https://spec.graphql.org/September2026/#sec-Enum-Extensions) | – |
| Input object definitions and their fields (`inputObjectDefinition`) | MUST | [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects) | – |
| Input object extensions add directives or fields (`inputObjectExtension`) | MUST | [§3.10.2](https://spec.graphql.org/September2026/#sec-Input-Object-Extensions) | – |
| Directive definitions and their locations (`directiveDefinition`) | MUST | [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | – |
| Directive extensions add directives (`directiveExtension`) | MUST (new in September 2026) | [§3.13.6](https://spec.graphql.org/September2026/#sec-Directive-Extensions) | – |

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

- **Capabilities:** deferred-items, idle, introspect, mutation, parent-values, parse, subscription, subscription-stream, uncoercible-results, validate
- **Cases:** 3265 submitted, 3265 distinct, 0 malformed
- **Vectors:** 3265 of 3370 graded (not graded: 73 custom-directives, 13 unspecified, 20 custom-scalar-literals)
- **Vectors relying on rules after October 2021:** since September 2025, 22 of 242 vectors failing; new in September 2026, 1 of 3 vectors failing
- **Adapter problems:** none
- **Checker self-test:** passed (15 negative controls)
- **Run:** kit 0625b35d64dd, 2026-11-16, strict

### Findings

<a id="validate-finding-1"></a>

#### 1. `singleRootField`: §5.2.4.1 Single Root Field isn't enforced: accepts documents that break only this rule; 7 of 51 rely on rules since September 2025

51 cases, in `operations` (40), `twins` (5), `spec` (3), `random` (2), `extra` (1). 7 of them rely on grammar or rules introduced in September 2025, not in October 2021.

- Single Root Field (MUST, [§5.2.4.1](https://spec.graphql.org/September2026/#sec-Single-Root-Field))

The shortest case, from `spec`:

```
input:    SingleRootField-spec-3: subscription sub { newMessage { body sender } disallowedSecondRootField }
response: {"valid":true,"errors":[]}
expected: invalid: SingleRootField ["sub"]
```

<a id="validate-finding-2"></a>

#### 2. `allVariableUsagesAreAllowed`: §5.8.5 All Variable Usages Are Allowed isn't enforced: accepts documents that break only this rule; 5 of 13 rely on rules since September 2025

13 cases, in `variables` (10), `spec` (2), `twins` (1). 5 of them rely on grammar or rules introduced in September 2025, not in October 2021.

- All Variable Usages Are Allowed (MUST, [§5.8.5](https://spec.graphql.org/September2026/#sec-All-Variable-Usages-Are-Allowed))

The shortest case, from `spec`:

```
input:    [since September 2025] AllVariableUsagesAreAllowed-spec-8: mutation addNullableCat($cat: CatInput) { addPet(pet: {cat: $cat}) { name } }
response: {"valid":true,"errors":[]}
expected: invalid: AllVariableUsagesAreAllowed ["cat"]
```

<a id="validate-finding-3"></a>

#### 3. `operationTypeExistence`: §5.2.1.1 Operation Type Existence isn't enforced: accepts documents that break only this rule; all rely on rules since September 2025

10 cases, in `operations` (10). All rely on grammar or rules introduced in September 2025, not in October 2021.

- Operation Type Existence (MUST, [§5.2.1.1](https://spec.graphql.org/September2026/#sec-Operation-Type-Existence))

The shortest case, from `operations`:

```
input:    [since September 2025] OperationTypeExistence-8: query A { post { id } } mutation M { user { id } }
response: {"valid":true,"errors":[]}
expected: invalid: OperationTypeExistence ["mutation"]
```

<a id="validate-finding-4"></a>

#### 4. `directivesAreUniquePerLocation`: §5.7.3 Directives Are Unique per Location isn't enforced: accepts documents that break only this rule

10 cases, in `directives` (7), `twins` (3).

- Directives Are Unique per Location (MUST, [§5.7.3](https://spec.graphql.org/September2026/#sec-Directives-Are-Unique-per-Location))

The shortest case, from `directives`:

```
input:    DirectivesAreUniquePerLocation-4: { user @skip(if: true) @skip(if: true) { id } }
response: {"valid":true,"errors":[]}
expected: invalid: DirectivesAreUniquePerLocation ["skip"]
```

<a id="validate-finding-5"></a>

#### 5. `acceptsValid`: rejects valid documents, all with the same error message; their invalid siblings break §5.8.5 All Variable Usages Are Allowed (3), §5.8.1 Variable Uniqueness (3), §5.8.3 All Variable Uses Defined (1), so the hints point at no one rule: the message says what the implementation objected to

7 cases, in `extra` (2), `variables` (2), `names` (1), `twins` (1), `spec` (1).

Each rejected document is one edit from a document that breaks only `allVariableUsagesAreAllowed` or `variableUniqueness` or `allVariableUsesDefined`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/September2026/#sec-Validation) [§6.1](https://spec.graphql.org/September2026/#sec-Executing-Requests) [§6.1.1](https://spec.graphql.org/September2026/#sec-Validating-Requests))

The shortest case, from `spec`:

```
problem:  Variable "booleanArg" of type "Boolean" used in position expecting type "Boolean!"
input:    AllVariableUsagesAreAllowed-spec-10: query booleanArgQueryWithDefault($booleanArg: Boolean) { arguments { optionalNonNullBooleanArgField(optionalBooleanArg: $booleanArg) } }
response: {"valid":false,"errors":[{"message":"Variable \"booleanArg\" of type \"Boolean\" used in position expecting type \"Boolean!\"","locations":[{"line":1,"column":34},{"line":3,"column":56}]}]}
expected: valid
```

<a id="validate-finding-6"></a>

#### 6. `valuesOfCorrectType`: §5.6.1 Values of Correct Type isn't enforced: accepts documents that break only this rule

5 cases, in `twins` (5).

- Values of Correct Type (MUST, [§5.6.1](https://spec.graphql.org/September2026/#sec-Values-of-Correct-Type) [§3.5.2](https://spec.graphql.org/September2026/#sec-Float))

The shortest case, from `twins`:

```
input:    ValuesOfCorrectType-263: { echo(float: 1e400) }
response: {"valid":true,"errors":[]}
expected: invalid: ValuesOfCorrectType ["value"]
```

<a id="validate-finding-7"></a>

#### 7. `acceptsValid`: rejects valid documents, all with the same error message; their invalid siblings break §5.6.1 Values of Correct Type (3), §5.3.3 Leaf Field Selections (1), so the hints point at no one rule: the message says what the implementation objected to; 1 of 4 rely on rules since September 2026

4 cases, in `twins` (3), `spec` (1). 1 of them rely on grammar or rules introduced in September 2026, not in October 2021.

Each rejected document is one edit from a document that breaks only `valuesOfCorrectType` or `leafFieldSelections`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/September2026/#sec-Validation) [§6.1](https://spec.graphql.org/September2026/#sec-Executing-Requests) [§6.1.1](https://spec.graphql.org/September2026/#sec-Validating-Requests))

The shortest case, from `spec`:

```
problem:  parse error: Unexpected "}". At 1:9
input:    [since September 2026] LeafFieldSelections-spec-8: query directQueryOnObjectWithEmptySelection { human {} }
response: {"valid":false,"errors":[{"message":"parse error: Unexpected \"}\". At 1:9"}]}
expected: valid
```

<a id="validate-finding-8"></a>

#### 8. `leafFieldSelections`: §5.3.3 Leaf Field Selections isn't enforced: accepts documents that break only this rule

1 case, in `twins` (1).

- Leaf Field Selections (MUST, [§5.3.3](https://spec.graphql.org/September2026/#sec-Leaf-Field-Selections))

The shortest case, from `twins`:

```
input:    LeafFieldSelections-39: { search { __typename { x } } }
response: {"valid":true,"errors":[]}
expected: invalid: LeafFieldSelections ["__typename"]
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
| Executable Definitions (`executableDefinitions`) | MUST | [§5.1.1](https://spec.graphql.org/September2026/#sec-Executable-Definitions) | ✓ 19 |
| Operation Type Existence (`operationTypeExistence`) | MUST (since September 2025) | [§5.2.1.1](https://spec.graphql.org/September2026/#sec-Operation-Type-Existence) | ✗ 10/15 (all since September 2025) |
| Operation Name Uniqueness (`operationNameUniqueness`) | MUST | [§5.2.2.1](https://spec.graphql.org/September2026/#sec-Operation-Name-Uniqueness) | ✓ 6 |
| Lone Anonymous Operation (`loneAnonymousOperation`) | MUST | [§5.2.3.1](https://spec.graphql.org/September2026/#sec-Lone-Anonymous-Operation) | ✓ 21 |
| Single Root Field (`singleRootField`) | MUST | [§5.2.4.1](https://spec.graphql.org/September2026/#sec-Single-Root-Field) | ✗ 51/64 (7 since September 2025) |
| Field Selections (`fieldSelections`) | MUST | [§5.3.1](https://spec.graphql.org/September2026/#sec-Field-Selections) | ✓ 32 |
| Field Selection Merging (`fieldSelectionMerging`) | MUST | [§5.3.2](https://spec.graphql.org/September2026/#sec-Field-Selection-Merging) | ✓ 677 |
| Leaf Field Selections (`leafFieldSelections`) | MUST | [§5.3.3](https://spec.graphql.org/September2026/#sec-Leaf-Field-Selections) | ✗ 1/40 |
| Argument Names (`argumentNames`) | MUST | [§5.4.1](https://spec.graphql.org/September2026/#sec-Argument-Names) | ✓ 8 |
| Argument Uniqueness (`argumentUniqueness`) | MUST | [§5.4.2](https://spec.graphql.org/September2026/#sec-Argument-Uniqueness) | ✓ 5 |
| Required Arguments (`requiredArguments`) | MUST | [§5.4.3](https://spec.graphql.org/September2026/#sec-Required-Arguments) | ✓ 17 |
| Fragment Name Uniqueness (`fragmentNameUniqueness`) | MUST | [§5.5.1.1](https://spec.graphql.org/September2026/#sec-Fragment-Name-Uniqueness) | ✓ 11 |
| Fragment Spread Type Existence (`fragmentSpreadTypeExistence`) | MUST | [§5.5.1.2](https://spec.graphql.org/September2026/#sec-Fragment-Spread-Type-Existence) | ✓ 13 |
| Fragments on Object, Interface or Union Types (`fragmentsOnObjectInterfaceOrUnionTypes`) | MUST | [§5.5.1.3](https://spec.graphql.org/September2026/#sec-Fragments-on-Object-Interface-or-Union-Types) | ✓ 17 |
| Fragments Must Be Used (`fragmentsMustBeUsed`) | MUST | [§5.5.1.4](https://spec.graphql.org/September2026/#sec-Fragments-Must-Be-Used) | ✓ 77 |
| Fragment Spread Target Defined (`fragmentSpreadTargetDefined`) | MUST | [§5.5.2.1](https://spec.graphql.org/September2026/#sec-Fragment-Spread-Target-Defined) | ✓ 9 |
| Fragment Spreads Must Not Form Cycles (`fragmentSpreadsMustNotFormCycles`) | MUST | [§5.5.2.2](https://spec.graphql.org/September2026/#sec-Fragment-Spreads-Must-Not-Form-Cycles) | ✓ 54 |
| Fragment Spread Is Possible (`fragmentSpreadIsPossible`) | MUST | [§5.5.2.3](https://spec.graphql.org/September2026/#sec-Fragment-Spread-Is-Possible) | ✓ 38 |
| Values of Correct Type (`valuesOfCorrectType`) | MUST | [§5.6.1](https://spec.graphql.org/September2026/#sec-Values-of-Correct-Type) [§3.5.2](https://spec.graphql.org/September2026/#sec-Float) | ✗ 5/294 |
| Int literals out of 32-bit range are rejected (`intInputRange`) | SHOULD | [§3.5.1](https://spec.graphql.org/September2026/#sec-Int) [§5.6.1](https://spec.graphql.org/September2026/#sec-Values-of-Correct-Type) | ✓ 4 |
| Input Object Field Names (`inputObjectFieldNames`). every document that breaks this rule also breaks §5.6.1 Values of Correct Type, which subsumes it, so a rejection can't be credited to this rule; accepting one fails both | MUST | [§5.6.2](https://spec.graphql.org/September2026/#sec-Input-Object-Field-Names) | ⊂ |
| Input Object Field Uniqueness (`inputObjectFieldUniqueness`) | MUST | [§5.6.3](https://spec.graphql.org/September2026/#sec-Input-Object-Field-Uniqueness) | ✓ 9 |
| Input Object Required Fields (`inputObjectRequiredFields`). every document that breaks this rule also breaks §5.6.1 Values of Correct Type, which subsumes it, so a rejection can't be credited to this rule; accepting one fails both | MUST | [§5.6.4](https://spec.graphql.org/September2026/#sec-Input-Object-Required-Fields) | ⊂ |
| Directives Are Defined (`directivesAreDefined`) | MUST | [§5.7.1](https://spec.graphql.org/September2026/#sec-Directives-Are-Defined) | ✓ 24 |
| Directives Are in Valid Locations (`directivesAreInValidLocations`) | MUST | [§5.7.2](https://spec.graphql.org/September2026/#sec-Directives-Are-in-Valid-Locations) | ✓ 24 |
| Directives Are Unique per Location (`directivesAreUniquePerLocation`) | MUST | [§5.7.3](https://spec.graphql.org/September2026/#sec-Directives-Are-Unique-per-Location) | ✗ 10/10 |
| Variable Uniqueness (`variableUniqueness`) | MUST | [§5.8.1](https://spec.graphql.org/September2026/#sec-Variable-Uniqueness) | ✓ 7 |
| Variables Are Input Types (`variablesAreInputTypes`) | MUST | [§5.8.2](https://spec.graphql.org/September2026/#sec-Variables-Are-Input-Types) | – |
| All Variable Uses Defined (`allVariableUsesDefined`) | MUST | [§5.8.3](https://spec.graphql.org/September2026/#sec-All-Variable-Uses-Defined) | ✓ 14 |
| All Variables Used (`allVariablesUsed`) | MUST | [§5.8.4](https://spec.graphql.org/September2026/#sec-All-Variables-Used) | ✓ 16 |
| All Variable Usages Are Allowed (`allVariableUsagesAreAllowed`) | MUST | [§5.8.5](https://spec.graphql.org/September2026/#sec-All-Variable-Usages-Are-Allowed) | ✗ 13/637 (5 since September 2025) |
| Valid documents are accepted (`acceptsValid`) | MUST | [§5](https://spec.graphql.org/September2026/#sec-Validation) [§6.1](https://spec.graphql.org/September2026/#sec-Executing-Requests) [§6.1.1](https://spec.graphql.org/September2026/#sec-Validating-Requests) | ✗ 11/1007 (1 new in September 2026) |
| Descriptions and comments don't change validation (`descriptionsInert`) | MUST | [§2.2](https://spec.graphql.org/September2026/#sec-Descriptions) [§2.1.4](https://spec.graphql.org/September2026/#sec-Insignificant-Commas) | ✓ 104 |
| Interface spreads where §5.5.2.3's formal text and prose disagree: which reading (`fragmentSpreadReading`). valid (the prose): 2; valid (own scope, which the prose doesn't settle): 3. Observed: valid (the prose) 2, valid (own scope, which the prose doesn't settle) 3 | INFO | [§5.5.2.3](https://spec.graphql.org/September2026/#sec-Fragment-Spread-Is-Possible) | ✓ 5 |
| Nullable variables with a default in a OneOf field, where §5.8.5's formal text and prose disagree: which reading (`oneOfVariableReading`). valid (the formal text): 2. Observed: valid (the formal text) 2 | INFO | [§5.8.5](https://spec.graphql.org/September2026/#sec-All-Variable-Usages-Are-Allowed) | ✓ 2 |
| Two fields of one response name whose arguments are identical under one reading of §5.3.2 only: which reading (`identicalArgumentsReading`). valid (their literal values or their coerced values): 1; invalid (their literal values or their text): 3; valid (their coerced values): 1. Observed: valid (their literal values or their coerced values) 1, invalid (their literal values or their text) 3, valid (their coerced values) 1 | INFO | [§5.3.2](https://spec.graphql.org/September2026/#sec-Field-Selection-Merging) | ✓ 5 |

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

## Introspect

- **Capabilities:** deferred-items, idle, introspect, mutation, parent-values, parse, subscription, subscription-stream, uncoercible-results, validate
- **Cases:** 54 submitted, 54 distinct, 0 malformed
- **Vectors:** 54 of 71 graded (not graded: 15 custom-directives, 2 new in September 2026 (September 2025 profile))
- **Profile:** the September 2025 edition's introspection types. September 2026's introspection query was rejected ("Unknown argument "includeDeprecated" on field "directives" of type "__Schema""). September 2025's was answered, so this run grades against September 2025.
- **Vectors relying on rules after October 2021:** since September 2025, 6 of 17 vectors failing
- **Adapter problems:** none
- **Checker self-test:** passed (353 negative controls)
- **Run:** kit 0625b35d64dd, 2026-11-16, strict

### Findings

<a id="introspect-finding-1"></a>

#### 1. `builtinAdditions`: the built-in __Directive has a field September 2025 doesn't define

12 cases, in `minimal` (1), `interfaces` (1), `deprecation` (1), `inputDeprecation` (1), `roots` (1), `unreferenced` (1), `scalars` (1), `oneOf` (1), `order` (1), `interfaceDeprecation` (1), `inputDeprecationAll` (1), `descriptions` (1). 3 of them rely on grammar or rules introduced in September 2025, not in October 2021.

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))

The shortest case, from `minimal.inc`:

```
problem:  added:fields at __Directive
input:    type Query { a: Int }  (the introspection query, September 2025 profile; includeDeprecated: true)
response: {"kind":"OBJECT","name":"__Directive","description":null,"specifiedByURL":null,"isOneOf":null,"fields":[{"name":"name","description":null,"args":[],"type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"SCALAR","name":"String","ofType":null}},"isDeprecated":false,"deprecationReason":null},{"name":"description","description":null,"args":[],"type":{"kind":"SCALAR","name":"String","ofType":null},"isDeprecated":false,"deprecationReason":null},{"name":"isRepeatable","description":null,"args":[],"type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"SCALAR","name":"Boolean","ofType":null}},"isDeprecated":false,"deprecationReason":null},{"name":"locations","description":null,"args":[],"type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"ENUM","name":"__DirectiveLocation","ofType":null}}}},"isDeprecated":false,"deprecationReason":null},{"name":"args","description":null,"args":[{"name":"includeDeprecated","description":null,"type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"SCALAR","name":"Boolean","ofType":null}},"defaultValue":"false","isDeprecated":false,"deprecationReason":null}],"type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"OBJECT","name":"__InputValue","ofType":null}}}},"isDeprecated":false,"deprecationReason":null},{"name":"onOperation","description":null,"args":[],"type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"SCALAR","name":"Boolean","ofType":null}},"isDeprecated":true,"deprecationReason":"Use `__Directive.locations` instead."},{"name":"onFragment","description":null,"args":[],"type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"SCALAR","name":"Boolean","ofType":null}},"isDeprecated":true,"deprecationReason":"Use `__Directive.locations` instead."},{"name":"onField","description":null,"args":[],"type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"SCALAR","name":"Boolean","ofType":null}},"isDeprecated":true,"deprecationReason":"Use `__Directive.locations` instead."}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}
expected: {"kind":"OBJECT","name":"__Directive","description":null,"specifiedByURL":null,"isOneOf":null,"fields":[{"name":"name","description":null,"args":[],"type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"SCALAR","name":"String","ofType":null}},"isDeprecated":false,"deprecationReason":null},{"name":"description","description":null,"args":[],"type":{"kind":"SCALAR","name":"String","ofType":null},"isDeprecated":false,"deprecationReason":null},{"name":"isRepeatable","description":null,"args":[],"type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"SCALAR","name":"Boolean","ofType":null}},"isDeprecated":false,"deprecationReason":null},{"name":"locations","description":null,"args":[],"type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"ENUM","name":"__DirectiveLocation","ofType":null}}}},"isDeprecated":false,"deprecationReason":null},{"name":"args","description":null,"args":[{"name":"includeDeprecated","description":null,"type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"SCALAR","name":"Boolean","ofType":null}},"defaultValue":"false","isDeprecated":false,"deprecationReason":null}],"type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"OBJECT","name":"__InputValue","ofType":null}}}},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}
```

<a id="introspect-finding-2"></a>

#### 2. `defaultValue`, `defaultValuePrinting`: a printed default value has a control character in a string, unescaped; defaultValue is null for an input value without a default, and otherwise null or an encoding of the default: differs from Introspection.tla

4 cases, in `defaults` (2), `printing` (2). 2 of them rely on grammar or rules introduced in September 2025, not in October 2021.

- defaultValue is null for an input value without a default, and otherwise null or an encoding of the default (MUST, [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type))
- A default value's strings are printed with control characters escaped, and supplementary characters, if escaped, as \u{…} (SHOULD, [§2.10.4](https://spec.graphql.org/September2026/#sec-String-Value) [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type))

The shortest case, from `defaults.defaults`:

```
problem:  defaultValue at Query.f(big:), defaultValue at Query.f(s:), printedControl at Query.f(bell:)
input:    enum E { X Y } input I { a: Int = 1, b: Int, c: [Int] = 1, e: E = Y, f: Float = 2 } type Query { f(x: [Int] = 1, y: Float = 1, z: ID = 7, w: [[Int]] = [1, 2], i: I = {b: 2}, s: String = "say \"hi\"", n: Int = null, l: [E!] = [X, Y], big: ID = 9007199254740993, huge: Float = 1000000000000000000000, bell: String = "\u0007"): Int }  (the introspection query, September 2025 profile; includeDeprecated: the default)
response: {"kind":"OBJECT","name":"Query","description":null,"specifiedByURL":null,"isOneOf":null,"fields":[{"name":"f","description":null,"args":[{"name":"x","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}},"defaultValue":"1","isDeprecated":false,"deprecationReason":null},{"name":"y","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1","isDeprecated":false,"deprecationReason":null},{"name":"z","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"7","isDeprecated":false,"deprecationReason":null},{"name":"w","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}}},"defaultValue":"[1, 2]","isDeprecated":false,"deprecationReason":null},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"I","ofType":null},"defaultValue":"{b: 2}","isDeprecated":false,"deprecationReason":null},{"name":"s","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"say \"hi\"\"","isDeprecated":false,"deprecationReason":null},{"name":"n","description":null,"type":{"kind":"SCALAR","name":"Int","ofType":null},"defaultValue":"null","isDeprecated":false,"deprecationReason":null},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"ENUM","name":"E","ofType":null}}},"defaultValue":"[X, Y]","isDeprecated":false,"deprecationReason":null},{"name":"big","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"9007199254740992","isDeprecated":false,"deprecationReason":null},{"name":"huge","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1000000000000000000000","isDeprecated":false,"deprecationReason":null},{"name":"bell","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"\u0007\"","isDeprecated":false,"deprecationReason":null}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}
expected: {"kind":"OBJECT","name":"Query","description":null,"specifiedByURL":null,"isOneOf":null,"fields":[{"name":"f","description":null,"args":[{"name":"x","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}},"defaultValue":"1","isDeprecated":false,"deprecationReason":null},{"name":"y","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1","isDeprecated":false,"deprecationReason":null},{"name":"z","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"7","isDeprecated":false,"deprecationReason":null},{"name":"w","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}}},"defaultValue":"[1, 2]","isDeprecated":false,"deprecationReason":null},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"I","ofType":null},"defaultValue":"{b: 2}","isDeprecated":false,"deprecationReason":null},{"name":"s","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"say \\\"hi\\\"\"","isDeprecated":false,"deprecationReason":null},{"name":"n","description":null,"type":{"kind":"SCALAR","name":"Int","ofType":null},"defaultValue":"null","isDeprecated":false,"deprecationReason":null},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"ENUM","name":"E","ofType":null}}},"defaultValue":"[X, Y]","isDeprecated":false,"deprecationReason":null},{"name":"big","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"9007199254740993","isDeprecated":false,"deprecationReason":null},{"name":"huge","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1000000000000000000000","isDeprecated":false,"deprecationReason":null},{"name":"bell","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"\\u0007\"","isDeprecated":false,"deprecationReason":null}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}
```

<a id="introspect-finding-3"></a>

#### 3. `builtinAdditions`, `defaultValue`, `defaultValuePrinting`: a printed default value has a control character in a string, unescaped; defaultValue is null for an input value without a default, and otherwise null or an encoding of the default: differs from Introspection.tla; the built-in __Directive has a field September 2025 doesn't define

2 cases, in `defaults` (1), `printing` (1). 1 of them rely on grammar or rules introduced in September 2025, not in October 2021.

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))
- defaultValue is null for an input value without a default, and otherwise null or an encoding of the default (MUST, [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type))
- A default value's strings are printed with control characters escaped, and supplementary characters, if escaped, as \u{…} (SHOULD, [§2.10.4](https://spec.graphql.org/September2026/#sec-String-Value) [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type))

The shortest case, from `defaults.inc`:

```
problem:  added:fields at __Directive, defaultValue at Query.f(big:), defaultValue at Query.f(s:), printedControl at Query.f(bell:)
input:    enum E { X Y } input I { a: Int = 1, b: Int, c: [Int] = 1, e: E = Y, f: Float = 2 } type Query { f(x: [Int] = 1, y: Float = 1, z: ID = 7, w: [[Int]] = [1, 2], i: I = {b: 2}, s: String = "say \"hi\"", n: Int = null, l: [E!] = [X, Y], big: ID = 9007199254740993, huge: Float = 1000000000000000000000, bell: String = "\u0007"): Int }  (the introspection query, September 2025 profile; includeDeprecated: true)
response: {"kind":"OBJECT","name":"Query","description":null,"specifiedByURL":null,"isOneOf":null,"fields":[{"name":"f","description":null,"args":[{"name":"x","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}},"defaultValue":"1","isDeprecated":false,"deprecationReason":null},{"name":"y","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1","isDeprecated":false,"deprecationReason":null},{"name":"z","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"7","isDeprecated":false,"deprecationReason":null},{"name":"w","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}}},"defaultValue":"[1, 2]","isDeprecated":false,"deprecationReason":null},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"I","ofType":null},"defaultValue":"{b: 2}","isDeprecated":false,"deprecationReason":null},{"name":"s","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"say \"hi\"\"","isDeprecated":false,"deprecationReason":null},{"name":"n","description":null,"type":{"kind":"SCALAR","name":"Int","ofType":null},"defaultValue":"null","isDeprecated":false,"deprecationReason":null},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"ENUM","name":"E","ofType":null}}},"defaultValue":"[X, Y]","isDeprecated":false,"deprecationReason":null},{"name":"big","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"9007199254740992","isDeprecated":false,"deprecationReason":null},{"name":"huge","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1000000000000000000000","isDeprecated":false,"deprecationReason":null},{"name":"bell","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"\u0007\"","isDeprecated":false,"deprecationReason":null}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}
expected: {"kind":"OBJECT","name":"Query","description":null,"specifiedByURL":null,"isOneOf":null,"fields":[{"name":"f","description":null,"args":[{"name":"x","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}},"defaultValue":"1","isDeprecated":false,"deprecationReason":null},{"name":"y","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1","isDeprecated":false,"deprecationReason":null},{"name":"z","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"7","isDeprecated":false,"deprecationReason":null},{"name":"w","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}}},"defaultValue":"[1, 2]","isDeprecated":false,"deprecationReason":null},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"I","ofType":null},"defaultValue":"{b: 2}","isDeprecated":false,"deprecationReason":null},{"name":"s","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"say \\\"hi\\\"\"","isDeprecated":false,"deprecationReason":null},{"name":"n","description":null,"type":{"kind":"SCALAR","name":"Int","ofType":null},"defaultValue":"null","isDeprecated":false,"deprecationReason":null},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"ENUM","name":"E","ofType":null}}},"defaultValue":"[X, Y]","isDeprecated":false,"deprecationReason":null},{"name":"big","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"9007199254740993","isDeprecated":false,"deprecationReason":null},{"name":"huge","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1000000000000000000000","isDeprecated":false,"deprecationReason":null},{"name":"bell","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"\\u0007\"","isDeprecated":false,"deprecationReason":null}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}
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
| The response is a well-formed execution result: data, errors only as a non-empty list, extensions a map, nothing else (`envelope`) | MUST | [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) [§7.1.7](https://spec.graphql.org/September2026/#sec-Extensions) [§7.1.8](https://spec.graphql.org/September2026/#sec-Additional-Entries) | ✓ 54 |
| The query executes, and its result has exactly the fields it selects, nulls included (`executes`) | MUST | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) | ✓ 51 |
| queryType, mutationType and subscriptionType are the root operation types (`roots`) | MUST | [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type) [§3.3.1](https://spec.graphql.org/September2026/#sec-Root-Operation-Types) | ✓ 28 |
| types is the set of all named types (`types`) | MUST | [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type) | ✓ 28 |
| types includes, and __type(name:) finds, a type the document defines that nothing references (`unreferencedTypes`) | SHOULD | [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type) | ✓ 47 |
| types has the built-in scalars the schema references, and no others (`builtinScalars`) | MUST | [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type) | ✓ 28 |
| __type(name:) returns the named type, and null for a name the schema doesn't have (`typeByName`) | MUST | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) | ✓ 19 |
| Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (`typeKinds`) | MUST | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) | ✓ 49 |
| An object's or interface's fields, with their types (`fields`) | MUST | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) [§4.2.3](https://spec.graphql.org/September2026/#sec-The-__Field-Type) | ✓ 47 |
| Field and directive arguments, with their types (`arguments`) | MUST | [§4.2.3](https://spec.graphql.org/September2026/#sec-The-__Field-Type) [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type) [§4.2.6](https://spec.graphql.org/September2026/#sec-The-__Directive-Type) | ✓ 47 |
| defaultValue is null for an input value without a default, and otherwise null or an encoding of the default (`defaultValue`) | MUST | [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type) | ✗ 6/47 (3 since September 2025) |
| defaultValue encodes the default value of an input value that has one, rather than returning null (`defaultValueOmitted`) | SHOULD | [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type) | ✓ 47 |
| A default value's strings are printed with control characters escaped, and supplementary characters, if escaped, as \u{…} (`defaultValuePrinting`). Since September 2025: October 2021 has no rule on producing a StringValue. | SHOULD (since September 2025) | [§2.10.4](https://spec.graphql.org/September2026/#sec-String-Value) [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type) | ! 6/47 (all since September 2025) |
| An input object's inputFields, with their types (`inputFields`) | MUST | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type) | ✓ 47 |
| An enum's enumValues (`enumValues`) | MUST | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) [§4.2.5](https://spec.graphql.org/September2026/#sec-The-__EnumValue-Type) | ✓ 47 |
| interfaces, and possibleTypes for unions and interfaces (`interfaces`) | MUST | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) | ✓ 47 |
| isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something (`deprecation`). The implementation answered the September 2025 query, so this check is graded as September 2025 has it: September 2025 deprecates fields, arguments, input fields and enum values, but not directives, so this check covers no directive. | MUST | [§4.2.3](https://spec.graphql.org/September2026/#sec-The-__Field-Type) [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type) [§4.2.5](https://spec.graphql.org/September2026/#sec-The-__EnumValue-Type) [§4.2.6](https://spec.graphql.org/September2026/#sec-The-__Directive-Type) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) [§3.13.3](https://spec.graphql.org/September2026/#sec--deprecated) | ✓ 47 |
| Under the October 2021 profile, a deprecated field or enum value has its reason, rather than null (`deprecationReasonOmitted`). Graded only under the October 2021 profile. | SHOULD | [§4.2.3](https://spec.graphql.org/September2026/#sec-The-__Field-Type) [§4.2.5](https://spec.graphql.org/September2026/#sec-The-__EnumValue-Type) | – |
| specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null (`specifiedByURL`) | MUST | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) [§3.13.4](https://spec.graphql.org/September2026/#sec--specifiedBy) | ✓ 47 |
| specifiedByURL returns the URL @specifiedBy gives a custom scalar, rather than null, when the service provides @specifiedBy (`specifiedByURLOmitted`) | SHOULD | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) [§3.13.4](https://spec.graphql.org/September2026/#sec--specifiedBy) | ✓ 47 |
| isOneOf is true exactly for OneOf input objects (`isOneOf`). Since September 2025: October 2021 has no OneOf input objects. | MUST (since September 2025) | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) [§3.10.1](https://spec.graphql.org/September2026/#sec-OneOf-Input-Objects) | ✓ 47 |
| A description the document gives is returned as it is, the schema's included (`descriptions`) | SHOULD | [§3.2](https://spec.graphql.org/September2026/#sec-Type-System-Descriptions) [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) | ✓ 47 |
| directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types (`directives`) | MUST | [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type) [§4.2.6](https://spec.graphql.org/September2026/#sec-The-__Directive-Type) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | ✓ 30 |
| @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (`builtinDirectives`) | SHOULD | [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) [§3.13.1](https://spec.graphql.org/September2026/#sec--skip) [§3.13.2](https://spec.graphql.org/September2026/#sec--include) [§3.13.4](https://spec.graphql.org/September2026/#sec--specifiedBy) [§3.13.5](https://spec.graphql.org/September2026/#sec--oneOf) | ✓ 30 |
| The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (`builtinDefinitions`) | MUST | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | ✓ 47 |
| The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (`builtinNullability`) | SHOULD | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | ✓ 47 |
| The introspection types have no field, argument, enum value or type the spec doesn't define (`builtinAdditions`) | INFO | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) | i 14/47 (4 since September 2025) |
| Under an older release's profile, a built-in definition that differs from that release's is as a later release defines it (`builtinEdition`) | INFO | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | ✓ 47 |
| __typename names the root type, and no fields list includes it (`typename`) | MUST | [§4.1](https://spec.graphql.org/September2026/#sec-Type-Name-Introspection) | ✓ 47 |
| Fields, arguments, enum values, directives, members and interfaces come in source order (`order`). Since September 2025: October 2021 has no Stable Ordering. | SHOULD (since September 2025) | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) | ✓ 47 |
| Anything else Introspection!Matches requires (`other`) | MUST | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) | ✓ 47 |

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
