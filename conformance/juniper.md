# juniper 0.18.0 (GraphQLType with TypeInfo)

Generated from the conformance kit's reports. Back to the [sheet](README.md).

**Notes** (hand-written, from outside the kit):

- Juniper builds schemas from Rust types. The adapter uses its documented dynamic route, a hand-written `GraphQLType` with `TypeInfo`, and Juniper's own code completes objects, lists and scalars. The Int fraction, unknown enum value and null list item findings need hand-written types; every other execution finding reproduces with `#[graphql_object]` (`examples/macros.rs`). See the [adapter's README](../adapters/juniper/README.md#known-juniper-deviations).
- The adapter doesn't claim `invalid-results` (result shapes are fixed by Rust types) or the schema area (Juniper doesn't read SDL, so every verdict would be the adapter's).

## Execution

- **Capabilities:** deferred-items, idle, introspect, mutation, parse, subscription, uncoercible-results, validate
- **Cases:** 12160 submitted, 1573 distinct, 2663 malformed
- **Adapter problems:** none
- **Checker self-test:** passed (35 negative controls)
- **Run:** kit 5da3deb09c91, 2026-11-15, strict, 1500 random runs per fixture (seed 1), exhaustive runs on

### Findings

<a id="execution-finding-1"></a>

#### 1. `responsePosition`: error path … has … where … wants an integer index

743 cases, in `lists` (574), `unions` (169).

- Paths are lists of response names (aliases, not field names) and integer list indices (MUST, [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position))

The shortest case, from `lists`:

```
problem:  error path ["posts","title"] has "title" where §7.1.4 wants an integer index
trace:    call posts; call tags; settle posts = list(1); call posts.0; settle tags = null; settle posts.0 = object(Post); call posts.0.title; settle posts.0.title = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Post.title.","locations":[{"line":3,"column":5}],"path":["posts","title"]},{"message":"Cannot return null for non-nullable field Query.tags.","locations":[{"line":5,"column":3}],"path":["tags"]}]}
```

<a id="execution-finding-2"></a>

#### 2. `errorsList`: errors is present but empty

605 cases, in `subscription` (605).

- errors, when present, is a non-empty list (MUST, [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `subscription`:

```
problem:  errors is present but empty (§7.1.1)
trace:    call postLiked; settle postLiked = null
response: {"data":{"postLiked":null},"errors":[]}
```

<a id="execution-finding-3"></a>

#### 3. `callsOnce`: the resolver at … was called twice

555 cases, in `fragments` (555).

- Each field is executed once, merged selections included (MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields))

The shortest case, from `fragments`:

```
problem:  the resolver at node.id was called twice (§6.3.3 executes each field once)
trace:    call node; settle node = object(User); call node.name; settle node.name = null; call node.id; settle node.id = null; call node.nodeId; settle node.nodeId = null; call node.id; settle node.id = null
response: {"data":{"node":null},"errors":[{"message":"Cannot return null for non-nullable field User.id.","locations":[{"line":12,"column":7}],"path":["node","nodeId"]},{"message":"Cannot return null for non-nullable field User.id.","locations":[{"line":19,"column":3}],"path":["node","id"]}]}
```

<a id="execution-finding-4"></a>

#### 4. `leafValues`: a leaf isn't the canonical value

403 cases, in `leaves` (360), `unions` (43).

- Leaf values are the resolver's canonical value (Int 1, Float 1.5, Boolean true, an enum's first value, "v") (MUST, [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion))

The shortest case, from `leaves`:

```
problem:  count is 1.2, not the canonical 1
trace:    call count; call ratio; call color; settle count = uncoercible; settle ratio = null; settle color = null
response: {"data":{"count":1.2,"ratio":null,"color":null}}
```

<a id="execution-finding-5"></a>

#### 5. `resultCoercion`: color is …, though its resolver returned a value its type can't represent, which must raise an execution error

402 cases, in `leaves` (402).

- A non-finite Float or an unknown enum value raises an execution error (MUST, [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion))

The shortest case, from `leaves`:

```
problem:  color is "NOT_A_VALUE", though its resolver returned a value its type can't represent, which must raise an execution error
trace:    call count; call ratio; call color; settle count = null; settle ratio = null; settle color = uncoercible
response: {"data":{"count":null,"ratio":null,"color":"NOT_A_VALUE"}}
```

<a id="execution-finding-6"></a>

#### 6. `intFraction`: count is … though its resolver returned a value its type can't represent, which should raise an execution error

360 cases, in `leaves` (360).

- A fraction returned for an Int (1.2) raises an execution error instead of being truncated (SHOULD, [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion))

The shortest case, from `leaves`:

```
problem:  count is 1.2, though its resolver returned a value its type can't represent, which should raise an execution error
trace:    call count; call ratio; call color; settle count = uncoercible; settle ratio = null; settle color = null
response: {"data":{"count":1.2,"ratio":null,"color":null}}
```

<a id="execution-finding-7"></a>

#### 7. `errorsInsideNulls`, `errorsWereRaised`, `nullsExplained`

252 cases, in `lists` (226), `unions` (26).

- Every error is inside a null in data (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))
- Every error was raised, at the path where it was raised (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `lists`:

```
trace:    call posts; call tags; settle posts = null; settle tags = list(1); call tags.0; settle tags.0 = error
response: {"data":{"posts":null,"tags":[null]},"errors":[{"message":"resolver at tags.0 failed","locations":[{"line":5,"column":3}],"path":["tags"]}]}
expected: data {"posts": null, "tags": [null]}
```

<a id="execution-finding-8"></a>

#### 8. `nullsExplained`

164 cases, in `lists` (96), `leaves` (53), `unions` (15).

- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `leaves`:

```
trace:    call count; call ratio; call color; settle count = null; settle ratio = uncoercible; settle color = null
response: {"data":{"count":null,"ratio":null,"color":null}}
expected: data {"count": null, "ratio": null, "color": null}
```

<a id="execution-finding-9"></a>

#### 9. `errorsWereRaised`, `nullsExplained`

130 cases, in `lists` (115), `unions` (15).

- Every error was raised, at the path where it was raised (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `lists`:

```
trace:    call posts; call tags; settle posts = list(1); call posts.0; settle tags = list(0); settle posts.0 = error
response: {"data":{"posts":null,"tags":[]},"errors":[{"message":"resolver at posts.0 failed","locations":[{"line":2,"column":3}],"path":["posts"]}]}
expected: data {"posts": null, "tags": []}
```

<a id="execution-finding-10"></a>

#### 10. `errorPathsUnique`, `errorsInsideNulls`, `errorsWereRaised`, `nullsExplained`

58 cases, in `lists` (58).

- No two errors share a response path (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))
- Every error is inside a null in data (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))
- Every error was raised, at the path where it was raised (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `lists`:

```
trace:    call posts; call tags; settle posts = null; settle tags = list(2); call tags.0; call tags.1; settle tags.0 = error; settle tags.1 = error
response: {"data":{"posts":null,"tags":[null,null]},"errors":[{"message":"resolver at tags.0 failed","locations":[{"line":5,"column":3}],"path":["tags"]},{"message":"resolver at tags.1 failed","locations":[{"line":5,"column":3}],"path":["tags"]}]}
expected: data {"posts": null, "tags": [null, null]}
```

<a id="execution-finding-11"></a>

#### 11. `intFraction`: … is … though its resolver returned a value its type can't represent, which should raise an execution error

43 cases, in `unions` (43).

- A fraction returned for an Int (1.2) raises an execution error instead of being truncated (SHOULD, [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion))

The shortest case, from `unions`:

```
problem:  matrix.0.0 is 1.2, though its resolver returned a value its type can't represent, which should raise an execution error
trace:    call search; call matrix; settle search = null; settle matrix = list(1); call matrix.0; settle matrix.0 = list(1); call matrix.0.0; settle matrix.0.0 = uncoercible
response: {"data":{"search":null,"matrix":[[1.2]]}}
```

<a id="execution-finding-12"></a>

#### 12. `errorsWereRaised`

40 cases, in `lists` (34), `unions` (6).

- Every error was raised, at the path where it was raised (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors))

The shortest case, from `lists`:

```
trace:    call posts; call tags; settle posts = list(1); call posts.0; settle tags = null; settle posts.0 = error
response: {"data":null,"errors":[{"message":"resolver at posts.0 failed","locations":[{"line":2,"column":3}],"path":["posts"]},{"message":"Cannot return null for non-nullable field Query.tags.","locations":[{"line":5,"column":3}],"path":["tags"]}]}
expected: data null
```

<a id="execution-finding-13"></a>

#### 13. `dataMatches`, `errorsInsideNulls`, `errorsWereRaised`, `nullsExplained`

28 cases, in `unions` (28).

- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))
- Every error is inside a null in data (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))
- Every error was raised, at the path where it was raised (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `unions`:

```
trace:    call search; call matrix; settle search = null; settle matrix = list(1); call matrix.0; settle matrix.0 = list(1); call matrix.0.0; settle matrix.0.0 = error
response: {"data":{"search":null,"matrix":[[null]]},"errors":[{"message":"resolver at matrix.0.0 failed","locations":[{"line":11,"column":3}],"path":["matrix"]}]}
expected: data {"search": null, "matrix": [null]}
```

<a id="execution-finding-14"></a>

#### 14. `dataMatches`, `nullsExplained`

17 cases, in `unions` (17).

- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `unions`:

```
trace:    call search; call matrix; settle search = null; settle matrix = list(1); call matrix.0; settle matrix.0 = list(1); call matrix.0.0; settle matrix.0.0 = null
response: {"data":{"search":null,"matrix":[[null]]}}
expected: data {"search": null, "matrix": [null]}
```

<a id="execution-finding-15"></a>

#### 15. `errorPathsUnique`, `errorsWereRaised`, `nullsExplained`

15 cases, in `lists` (15).

- No two errors share a response path (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))
- Every error was raised, at the path where it was raised (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `lists`:

```
trace:    call posts; call tags; settle tags = list(0); settle posts = list(2); call posts.0; call posts.1; settle posts.1 = error; settle posts.0 = error
response: {"data":{"posts":null,"tags":[]},"errors":[{"message":"resolver at posts.0 failed","locations":[{"line":2,"column":3}],"path":["posts"]},{"message":"resolver at posts.1 failed","locations":[{"line":2,"column":3}],"path":["posts"]}]}
expected: data {"posts": null, "tags": []}
```

<a id="execution-finding-16"></a>

#### 16. `dataMatches`

11 cases, in `subscription` (11).

- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))

The shortest case, from `subscription`:

```
trace:    call postLiked; settle postLiked = error
response: {"data":{"postLiked":null},"errors":[{"message":"resolver at postLiked failed","locations":[{"line":2,"column":3}],"path":["postLiked"]}]}
expected: data null
```

<a id="execution-finding-17"></a>

#### 17. `errorPathsUnique`, `errorsWereRaised`

4 cases, in `lists` (4).

- No two errors share a response path (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))
- Every error was raised, at the path where it was raised (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors))

The shortest case, from `lists`:

```
trace:    call posts; call tags; settle tags = null; settle posts = list(2); call posts.0; call posts.1; settle posts.1 = error; settle posts.0 = error
response: {"data":null,"errors":[{"message":"resolver at posts.0 failed","locations":[{"line":2,"column":3}],"path":["posts"]},{"message":"resolver at posts.1 failed","locations":[{"line":2,"column":3}],"path":["posts"]},{"message":"Cannot return null for non-nullable field Query.tags.","locations":[{"line":5,"column":3}],"path":["tags"]}]}
expected: data null
```

<a id="execution-finding-18"></a>

#### 18. `dataMatches`, `errorsWereRaised`, `nullsExplained`

3 cases, in `unions` (3).

- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))
- Every error was raised, at the path where it was raised (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `unions`:

```
trace:    call search; call matrix; settle search = list(1); call search.0; settle matrix = list(1); call matrix.0; settle search.0 = error; settle matrix.0 = list(1); call matrix.0.0; settle matrix.0.0 = null
response: {"data":{"search":null,"matrix":[[null]]},"errors":[{"message":"resolver at search.0 failed","locations":[{"line":2,"column":3}],"path":["search"]}]}
expected: data {"search": null, "matrix": [null]}
```

### Every check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **(draft only):** the failing cases rely on grammar or rules that are only in the draft, not in the October 2021 edition.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | Result |
| --- | :---: | :---: | :---: |
| The response is sent only once execution is complete (`complete`) | MUST | [§6.3.1](https://spec.graphql.org/draft/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ 1573 |
| data is the completed value: field collection, value completion and null propagation (`dataMatches`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✗ 59/1573 |
| Response keys are in collected field order (`keyOrder`) | SHOULD | [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering) | ✓ 1573 |
| Every error was raised, at the path where it was raised (`errorsWereRaised`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✗ 530/1573 |
| No two errors share a response path (`errorPathsUnique`) | MUST (Oct 2021: SHOULD) | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✗ 77/1573 |
| Every error is inside a null in data (`errorsInsideNulls`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✗ 338/1573 |
| Every null an error caused comes with an error from one of its causes (`nullsExplained`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✗ 667/1573 |
| A mutation reports every error its earlier root fields raised (`serialErrorsKept`) | MUST | [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 45 |
| A mutation's root fields execute one after another (`calledSerially`) | MUST | [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) | ✓ 45 |
| Each field is executed once, merged selections included (`callsOnce`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) | ✗ 555/12160 |
| Only fields the operation selects are executed (`callsSelected`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) | ✓ 12160 |
| A field executes only once its parent has a value that contains it (`callsReachable`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 12160 |
| A request gets a response (`responds`) | MUST | [§7.1](https://spec.graphql.org/draft/#sec-Response-Format) | ✓ 12160 |
| A subscription event yields an execution result, even when its data is null (`eventYieldsResult`) | MUST | [§6.2.3.2](https://spec.graphql.org/draft/#sec-Response-Stream) | ✓ 1518 |
| data holds only positions the operation selects (`dataShape`) | MUST | [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ 8249 |
| A non-finite Float or an unknown enum value raises an execution error (`resultCoercion`) | MUST | [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✗ 402/721 |
| A fraction returned for an Int (1.2) raises an execution error instead of being truncated (`intFraction`) | SHOULD | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ! 403/476 |
| Leaf values are the resolver's canonical value (Int 1, Float 1.5, Boolean true, an enum's first value, "v") (`leafValues`) | MUST | [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✗ 403/8249 |
| Leaf values use the JSON type §7.2.1 gives their GraphQL type (a number for Int 1, not "1") (`leafEncoding`) | SHOULD | [§7.2.1](https://spec.graphql.org/draft/#sec-JSON-Serialization) | ✓ 8249 |
| An execution result has a data entry (`dataPresent`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 12160 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✗ 605/12160 |
| The response has no entries besides data, errors and extensions (`additionalEntries`) | MUST | [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ 12160 |
| extensions is a map (`extensions`) | MUST | [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) | – |
| Errors are maps with a message, and extensions, if present, is a map (`errorFormat`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 9204 |
| An error's locations, if present, is a list of maps with line and column, both positive integers (`errorLocations`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 9204 |
| Execution errors have a path to a position the operation selects (`errorPath`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 9204 |
| Paths are lists of response names (aliases, not field names) and integer list indices (`responsePosition`) | MUST (Oct 2021: SHOULD) | [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) | ✗ 743/9204 |
| Errors have no entries besides message, locations, path and extensions (`errorEntries`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 9204 |
| The adapter follows the kit's protocol (call types, settles) (`protocol`) | ADAPTER | — | ✓ 12160 |
| With error propagation off, an error nulls the position where it happened (graphql-js 17's @experimental_disableErrorPropagation) (`disabledPropagation`) | INFO | — | – |

- **Basis for `complete`:** No sentence says to respond only once execution is complete; the algorithms do. ExecuteRootSelectionSet (§6.3.1) returns {data} once ExecuteCollectedFields has run, and §6.3.3 says "Execution will recursively resolve and complete the value of every entry in the collected fields map". The draft's §7.1.5 adds: "The response data is the result of accumulating the resolved result of all response positions during execution." Positions §6.3.3 lets an implementation cancel don't hold the response back.
- **Basis for `dataMatches`:** When an error propagates to the root, §6.4.4 and §7.1.5 say data "should be null", in both editions. The kit still requires null, because no other value conforms: the execution result must have a data entry (§7.1.1), {} or a partial map leaves out an entry ExecuteCollectedFields must produce (§6.3.3), and a map with null at the failed root field breaks that field's Non-Null type.
- **Basis for `errorPathsUnique`:** The draft's §6.4.4: "each error added to the errors list during execution must have a unique response path." October 2021's: "only one error should be added to the errors list per field." Both editions say the errors list "must not be further affected" when a position is null because of an error already added.
- **Basis for `serialErrorsKept`:** §6.4.4: an execution error "must be added to the errors list". §6.3.3 lets an implementation cancel fields that have not yet executed or yielded a value, but §6.3.4 completes each mutation root field before the next starts, so an earlier root field's errors can't have been cancelled.
- **Basis for `intFraction`:** The level is contested. §3.5.1 states a rule with must: services "may coerce non-integer internal values to integers when reasonable without losing information, otherwise they must raise an execution error". Truncating 1.2 loses information, so on that reading the must applies. But the example that applies the rule to this very case says should: "a floating-point number 1.2 should raise an execution error instead of being truncated to 1". Where the level is in doubt, the kit takes the weaker one, so this is a SHOULD. October 2021 has the same sentences, with "field error".
- **Basis for `responsePosition`:** The draft's §7.1.4: "The value for a response path must be a list of path segments", with list indices "0-indexed integers", and an aliased field "must use the aliased name". October 2021's §7.1.6 says each of these with should: "This field should be a list of path segments", "If the error happens in an aliased field, the path to the error should use the aliased name".
- **Basis for `disabledPropagation`:** Not a GraphQL rule: neither edition has execution without error propagation. §6.4.4 says: "Since Non-Null response positions cannot be null, execution errors are propagated to be handled by the parent response position." Every failure of the noPropagation fixture's response (its data and errors) counts here, never against a spec section, and never fails the run. Turning propagation off doesn't change which resolvers run, so protocol problems and the checks on calls (callsOnce, callsSelected, callsReachable, calledSerially) keep their own checks.

### Fixtures

| Fixture | Result | Note |
| --- | :---: | :---: |
| [`fragments`](../fixtures/fragments.graphql) | ✗ 555/1684 |  |
| [`leaves`](../fixtures/leaves.graphql) | ✗ 770/1628 | without results of the wrong shape (no invalid-results capability) |
| [`lists`](../fixtures/lists.graphql) | ✗ 1122/2358 |  |
| [`mutation`](../fixtures/mutation.graphql) | ✓ 1590 |  |
| [`noPropagation`](../fixtures/noPropagation.graphql) | – | needs error-propagation-off |
| [`nullPropagation`](../fixtures/nullPropagation.graphql) | ✓ 1662 |  |
| [`subscription`](../fixtures/subscription.graphql) | ✗ 616/1518 |  |
| [`unions`](../fixtures/unions.graphql) | ✗ 322/1720 | without results of the wrong shape (no invalid-results capability) |

## Parse

- **Capabilities:** deferred-items, idle, introspect, mutation, parse, subscription, uncoercible-results, validate
- **Cases:** 1983 submitted, 1983 distinct, 0 malformed
- **Draft only:** 10 of the failing vectors (of 105 draft-only vectors) rely on grammar or rules only in the draft
- **Adapter problems:** none
- **Checker self-test:** passed (4 negative controls)
- **Run:** kit 5da3deb09c91, 2026-11-15, strict

### Findings

<a id="parse-finding-1"></a>

#### 1. `intValue`: accepts what §2.10.1 Int Value rejects

10 cases, in `lexer-examples` (5), `numbers` (5).

- Int values (MUST, [§2.10.1](https://spec.graphql.org/draft/#sec-Int-Value))

The shortest case, from `lexer-examples`:

```
input:    "{a(x: [01])}"
sibling:  "{a(x: [1])}", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-2"></a>

#### 2. `selectionSets`: rejects what §2.5 Selection Sets accepts

8 cases, in `random-documents` (4), `parser-examples` (3), `field-suffixes` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- Selection sets, including empty ones (MUST, [§2.5](https://spec.graphql.org/draft/#sec-Selection-Sets))

The shortest case, from `parser-examples`:

```
input:    [draft] "{}"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-3"></a>

#### 3. `stringValue`: rejects what §2.10.4 String Value accepts

4 cases, in `lexer-examples` (2), `strings` (1), `block-strings` (1). 2 of them rely on grammar or rules that are only in the draft, not in October 2021.

- String values and block strings (MUST, [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value))

The shortest case, from `lexer-examples`:

```
input:    "{a(x: \"\"\"\\\"\"\"\"\"\")}"
sibling:  "{a(x: \"\"\"\\\"\"\"\"\")}", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-4"></a>

#### 4. `stringValue`: accepts what §2.10.4 String Value rejects

4 cases, in `lexer-examples` (2), `block-strings` (2).

- String values and block strings (MUST, [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value))

The shortest case, from `block-strings`:

```
input:    "{a(x: \"\"\"\\\"\"\"\")}"
sibling:  "{a(x: \"\"\"\\ \"\"\")}", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-5"></a>

#### 5. `lexicalTokens`: rejects what §2.1.5 Lexical Tokens accepts

2 cases, in `block-strings` (2).

- Every character outside ignored tokens is part of a token (MUST, [§2.1.5](https://spec.graphql.org/draft/#sec-Lexical-Tokens))

The shortest case, from `block-strings`:

```
input:    "{a(x: \"\"\"\"\\\"\"\"\"\"\")}"
sibling:  "{a(x: \"\"\"\"\"\"\\\"\"\"\"\"\")}", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-6"></a>

#### 6. `intValue`: rejects what §2.10.1 Int Value accepts

1 case, in `lexer-examples` (1).

- Int values (MUST, [§2.10.1](https://spec.graphql.org/draft/#sec-Int-Value))

The shortest case, from `lexer-examples`:

```
input:    "{a(x: [1-2])}"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-7"></a>

#### 7. `variables`: rejects what §2.11 Variables accepts

1 case, in `parser-examples` (1).

- Variables and variable definitions (MUST, [§2.11](https://spec.graphql.org/draft/#sec-Variables))

The shortest case, from `parser-examples`:

```
input:    "query ($a: Int = {k: [1, E, null]}) {a}"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-8"></a>

#### 8. `variables`: accepts what §2.11 Variables rejects

1 case, in `parser-examples` (1).

- Variables and variable definitions (MUST, [§2.11](https://spec.graphql.org/draft/#sec-Variables))

The shortest case, from `parser-examples`:

```
input:    "query ($a: Int @d(x: $b)) {a}"
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-9"></a>

#### 9. `floatValue`: rejects what §2.10.2 Float Value accepts

1 case, in `numbers` (1).

- Float values (MUST, [§2.10.2](https://spec.graphql.org/draft/#sec-Float-Value))

The shortest case, from `numbers`:

```
input:    "{a(x: [0-0])}"
sibling:  "{a(x: [0-.])}", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

### Every check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **(draft only):** the failing cases rely on grammar or rules that are only in the draft, not in the October 2021 edition.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | Result |
| --- | :---: | :---: | :---: |
| Source text is a sequence of SourceCharacter (`sourceText`) | MUST | [§2.1](https://spec.graphql.org/draft/#sec-Source-Text) | ✓ 33 |
| White space is tab and space only (`whiteSpace`) | MUST | [§2.1.1](https://spec.graphql.org/draft/#sec-White-Space) | ✓ 28 |
| Line terminators are LF, CR and CR LF only (`lineTerminators`) | MUST | [§2.1.2](https://spec.graphql.org/draft/#sec-Line-Terminators) | ✓ 31 |
| A comment runs to the end of its line (`comments`) | MUST | [§2.1.3](https://spec.graphql.org/draft/#sec-Comments) | ✓ 17 |
| Commas are insignificant (`insignificantCommas`) | MUST | [§2.1.4](https://spec.graphql.org/draft/#sec-Insignificant-Commas) | ✓ 5 |
| Every character outside ignored tokens is part of a token (`lexicalTokens`) | MUST | [§2.1.5](https://spec.graphql.org/draft/#sec-Lexical-Tokens) | ✗ 2/43 |
| Ignored tokens may appear before and after every token (`ignoredTokens`) | MUST | [§2.1.6](https://spec.graphql.org/draft/#sec-Ignored-Tokens) | ✓ 81 |
| Punctuators, and `...` only as a whole (`punctuators`) | MUST | [§2.1.7](https://spec.graphql.org/draft/#sec-Punctuators) | ✓ 40 |
| Names (`names`) | MUST | [§2.1.8](https://spec.graphql.org/draft/#sec-Names) | ✓ 14 |
| Descriptions on operations, fragments and variables, not on the query shorthand (`descriptions`) | MUST | [§2.2](https://spec.graphql.org/draft/#sec-Descriptions) | ✓ 100 |
| A document is one or more executable definitions (`document`) | MUST | [§2.3](https://spec.graphql.org/draft/#sec-Document) | ✓ 99 |
| Operation definitions and the query shorthand (`operations`) | MUST | [§2.4](https://spec.graphql.org/draft/#sec-Operations) | ✓ 100 |
| Selection sets, including empty ones (`selectionSets`) | MUST | [§2.5](https://spec.graphql.org/draft/#sec-Selection-Sets) | ✗ 8/95 (all draft only) |
| Fields (`fields`) | MUST | [§2.6](https://spec.graphql.org/draft/#sec-Fields) | ✓ 96 |
| Arguments (`arguments`) | MUST | [§2.7](https://spec.graphql.org/draft/#sec-Arguments) | ✓ 110 |
| Field aliases (`fieldAlias`) | MUST | [§2.8](https://spec.graphql.org/draft/#sec-Field-Alias) | ✓ 94 |
| Fragment definitions and fragment spreads (`fragments`) | MUST | [§2.9](https://spec.graphql.org/draft/#sec-Fragments) | ✓ 117 |
| Type conditions (`typeConditions`) | MUST | [§2.9.1](https://spec.graphql.org/draft/#sec-Type-Conditions) | ✓ 112 |
| Inline fragments (`inlineFragments`) | MUST | [§2.9.2](https://spec.graphql.org/draft/#sec-Inline-Fragments) | ✓ 100 |
| Input values, and no variables in constant values (`inputValues`) | MUST | [§2.10](https://spec.graphql.org/draft/#sec-Input-Values) | ✓ 122 |
| Int values (`intValue`) | MUST | [§2.10.1](https://spec.graphql.org/draft/#sec-Int-Value) | ✗ 11/42 |
| Float values (`floatValue`) | MUST | [§2.10.2](https://spec.graphql.org/draft/#sec-Float-Value) | ✗ 1/35 |
| Boolean values (`booleanValue`) | MUST | [§2.10.3](https://spec.graphql.org/draft/#sec-Boolean-Value) | ✓ 3 |
| String values and block strings (`stringValue`) | MUST | [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value) | ✗ 8/146 (2 draft only) |
| Null value (`nullValue`) | MUST | [§2.10.5](https://spec.graphql.org/draft/#sec-Null-Value) | ✓ 2 |
| Enum values (`enumValue`) | MUST | [§2.10.6](https://spec.graphql.org/draft/#sec-Enum-Value) | ✓ 10 |
| List values (`listValue`) | MUST | [§2.10.7](https://spec.graphql.org/draft/#sec-List-Value) | ✓ 101 |
| Input object values (`inputObjectValues`) | MUST | [§2.10.8](https://spec.graphql.org/draft/#sec-Input-Object-Values) | ✓ 107 |
| Variables and variable definitions (`variables`) | MUST | [§2.11](https://spec.graphql.org/draft/#sec-Variables) | ✗ 2/157 |
| Type references (`typeReferences`) | MUST | [§2.12](https://spec.graphql.org/draft/#sec-Type-References) | ✓ 102 |
| Directives (`directives`) | MUST | [§2.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 113 |

## Validate

- **Capabilities:** deferred-items, idle, introspect, mutation, parse, subscription, uncoercible-results, validate
- **Cases:** 3079 submitted, 3079 distinct, 0 malformed
- **Vectors:** 3079 of 3100 graded (not graded: 12 unspecified, 9 custom-scalar-literals)
- **Draft only:** 39 of the failing vectors (of 206 draft-only vectors) rely on grammar or rules only in the draft
- **Adapter problems:** none
- **Checker self-test:** passed (8 negative controls)
- **Run:** kit 5da3deb09c91, 2026-11-15, strict

### Findings

<a id="validate-finding-1"></a>

#### 1. `singleRootField`: §5.2.4.1 Single Root Field isn't enforced: accepts documents that break only this rule; 23 of 46 rely on the draft

46 cases, in `operations` (40), `spec` (4), `random` (2). 23 of them rely on grammar or rules that are only in the draft, not in October 2021.

- Single Root Field (MUST, [§5.2.4.1](https://spec.graphql.org/draft/#sec-Single-Root-Field))

The shortest case, from `spec`:

```
input:    SingleRootField-spec-3: subscription sub { newMessage { body sender } disallowedSecondRootField }
response: {"valid":true,"errors":[]}
expected: invalid: SingleRootField ["sub"]
```

<a id="validate-finding-2"></a>

#### 2. `operationTypeExistence`: §5.2.1.1 Operation Type Existence isn't enforced: accepts documents that break only this rule; all rely on the draft

12 cases, in `operations` (11), `spec` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- Operation Type Existence (MUST, [§5.2.1.1](https://spec.graphql.org/draft/#sec-Operation-Type-Existence))

The shortest case, from `spec`:

```
input:    [draft] OperationTypeExistence-spec-2: mutation goodbyeMutation { goodbye }
response: {"valid":true,"errors":[]}
expected: invalid: OperationTypeExistence ["mutation"]
```

<a id="validate-finding-3"></a>

#### 3. `allVariableUsagesAreAllowed`: §5.8.5 All Variable Usages Are Allowed isn't enforced: accepts documents that break only this rule; 4 of 12 rely on the draft

12 cases, in `variables` (10), `spec` (2). 4 of them rely on grammar or rules that are only in the draft, not in October 2021.

- All Variable Usages Are Allowed (MUST, [§5.8.5](https://spec.graphql.org/draft/#sec-All-Variable-Usages-Are-Allowed))

The shortest case, from `spec`:

```
input:    [draft] AllVariableUsagesAreAllowed-spec-8: mutation addNullableCat($cat: CatInput) { addPet(pet: {cat: $cat}) { name } }
response: {"valid":true,"errors":[]}
expected: invalid: AllVariableUsagesAreAllowed ["cat"]
```

<a id="validate-finding-4"></a>

#### 4. `directivesAreUniquePerLocation`: §5.7.3 Directives Are Unique per Location isn't enforced: accepts documents that break only this rule

7 cases, in `directives` (7).

- Directives Are Unique per Location (MUST, [§5.7.3](https://spec.graphql.org/draft/#sec-Directives-Are-Unique-per-Location))

The shortest case, from `directives`:

```
input:    DirectivesAreUniquePerLocation-4: { user @skip(if: true) @skip(if: true) { id } }
response: {"valid":true,"errors":[]}
expected: invalid: DirectivesAreUniquePerLocation ["skip"]
```

<a id="validate-finding-5"></a>

#### 5. `acceptsValid`: rejects valid documents: §5.3.3 Leaf Field Selections is likely over-strict (4 valid siblings of 4 different invalid vectors rejected, 6 of the same family accepted)

4 cases, in `random` (4).

Each rejected document is one edit from a document that breaks only `leafFieldSelections`, so that rule is likely over-strict.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `random`:

```
problem:  Unknown directive "tag"
input:    LeafFieldSelections-valid-22: { resource { id id @tag } }
response: {"valid":false,"errors":[{"message":"Unknown directive \"tag\"","locations":[{"line":4,"column":8}]}]}
expected: valid
```

<a id="validate-finding-6"></a>

#### 6. `acceptsValid`: rejects valid documents: §5.8.5 All Variable Usages Are Allowed is likely over-strict (4 valid siblings of 16 different invalid vectors rejected, 62 of the same family accepted)

4 cases, in `variables` (2), `random` (1), `spec` (1).

Each rejected document is one edit from a document that breaks only `allVariableUsagesAreAllowed`, so that rule is likely over-strict.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `spec`:

```
problem:  Variable "booleanArg" of type "Boolean" used in position expecting type "Boolean!"
input:    AllVariableUsagesAreAllowed-spec-10: query booleanArgQueryWithDefault($booleanArg: Boolean) { arguments { optionalNonNullBooleanArgField(optionalBooleanArg: $booleanArg) } }
response: {"valid":false,"errors":[{"message":"Variable \"booleanArg\" of type \"Boolean\" used in position expecting type \"Boolean!\"","locations":[{"line":1,"column":34},{"line":3,"column":56}]}]}
expected: valid
```

<a id="validate-finding-7"></a>

#### 7. `acceptsValid`: rejects valid documents, each one edit from a document that breaks §5.7.1 Directives Are Defined and §5.7.2 Directives Are in Valid Locations and §5.7.3 Directives Are Unique per Location; the rule it applied is a guess, since the kit doesn't read error messages

3 cases, in `directives` (3).

Each rejected document is one edit from a document that breaks only `directivesAreDefined` or `directivesAreInValidLocations` or `directivesAreUniquePerLocation`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `directives`:

```
problem:  Unknown directive "once"
input:    DirectivesAreDefined-valid-1: { user @once { id } }
response: {"valid":false,"errors":[{"message":"Unknown directive \"once\"","locations":[{"line":2,"column":8}]}]}
expected: valid
```

<a id="validate-finding-8"></a>

#### 8. `acceptsValid`: rejects valid documents, each one edit from a document that breaks only §5.3.1 Field Selections; the rule it applied is a guess, since the kit doesn't read error messages

2 cases, in `random` (2).

Each rejected document is one edit from a document that breaks only `fieldSelections`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `random`:

```
problem:  Unknown directive "once"
input:    FieldSelections-valid-13: { resource { id @once } }
response: {"valid":false,"errors":[{"message":"Unknown directive \"once\"","locations":[{"line":3,"column":8}]}]}
expected: valid
```

<a id="validate-finding-9"></a>

#### 9. `acceptsValid`: rejects valid documents, each one edit from a document that breaks only §5.4.3 Required Arguments; the rule it applied is a guess, since the kit doesn't read error messages

2 cases, in `values` (1), `random` (1).

Each rejected document is one edit from a document that breaks only `requiredArguments`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `values`:

```
problem:  Unknown directive "tag"
input:    RequiredArguments-valid-1: { user { id @tag } }
response: {"valid":false,"errors":[{"message":"Unknown directive \"tag\"","locations":[{"line":3,"column":8}]}]}
expected: valid
```

<a id="validate-finding-10"></a>

#### 10. `acceptsValid`: rejects valid documents, each one edit from a document that breaks only §5.6.1 Values of Correct Type; the rule it applied is a guess, since the kit doesn't read error messages

2 cases, in `random` (2).

Each rejected document is one edit from a document that breaks only `valuesOfCorrectType`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `random`:

```
problem:  Unknown directive "once"
input:    ValuesOfCorrectType-valid-57: query Q0 { post { name @once score score } b: matrix }
response: {"valid":false,"errors":[{"message":"Unknown directive \"once\"","locations":[{"line":3,"column":10}]}]}
expected: valid
```

<a id="validate-finding-11"></a>

#### 11. `acceptsValid`: rejects valid documents, each one edit from a document that breaks only §5.7.1 Directives Are Defined; the rule it applied is a guess, since the kit doesn't read error messages

2 cases, in `directives` (1), `random` (1).

Each rejected document is one edit from a document that breaks only `directivesAreDefined`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `directives`:

```
problem:  Unknown directive "once"
input:    DirectivesAreDefined-valid-6: { user @once { id @once } }
response: {"valid":false,"errors":[{"message":"Unknown directive \"once\"","locations":[{"line":2,"column":8}]},{"message":"Unknown directive \"once\"","locations":[{"line":3,"column":8}]}]}
expected: valid
```

<a id="validate-finding-12"></a>

#### 12. `acceptsValid`: rejects valid documents, each one edit from a document that breaks only §5.8.1 Variable Uniqueness; the rule it applied is a guess, since the kit doesn't read error messages

2 cases, in `names` (1), `extra` (1).

Each rejected document is one edit from a document that breaks only `variableUniqueness`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `names`:

```
problem:  Variable "b" of type "Int" used in position expecting type "Int!"
input:    VariableUniqueness-valid-3: query ($a: Int, $b: Int) { echo(int: $a, opt: $b) }
response: {"valid":false,"errors":[{"message":"Variable \"b\" of type \"Int\" used in position expecting type \"Int!\"","locations":[{"line":1,"column":17},{"line":2,"column":22}]}]}
expected: valid
```

<a id="validate-finding-13"></a>

#### 13. `acceptsValid`: rejects valid documents, each one edit from a document that breaks only §5.8.3 All Variable Uses Defined; the rule it applied is a guess, since the kit doesn't read error messages

2 cases, in `random` (1), `extra` (1).

Each rejected document is one edit from a document that breaks only `allVariableUsesDefined`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `extra`:

```
problem:  Variable "w" of type "Int" used in position expecting type "Int!"
input:    AllVariableUsesDefined-valid-7: query Q($w: Int) { echo(opt: $w) }
response: {"valid":false,"errors":[{"message":"Variable \"w\" of type \"Int\" used in position expecting type \"Int!\"","locations":[{"line":1,"column":9},{"line":2,"column":13}]}]}
expected: valid
```

<a id="validate-finding-14"></a>

#### 14. `acceptsValid`: rejects valid documents, each one edit from a document that breaks §5.4.1 Argument Names and §5.7.1 Directives Are Defined; the rule it applied is a guess, since the kit doesn't read error messages

1 case, in `values` (1).

Each rejected document is one edit from a document that breaks only `argumentNames` or `directivesAreDefined`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `values`:

```
problem:  Unknown directive "tag"
input:    ArgumentNames-valid-1: { user { id @tag(name: null) } }
response: {"valid":false,"errors":[{"message":"Unknown directive \"tag\"","locations":[{"line":3,"column":8}]}]}
expected: valid
```

<a id="validate-finding-15"></a>

#### 15. `acceptsValid`: rejects valid documents, each one edit from a document that breaks §5.4.1 Argument Names and §5.4.2 Argument Uniqueness; the rule it applied is a guess, since the kit doesn't read error messages

1 case, in `names` (1).

Each rejected document is one edit from a document that breaks only `argumentNames` or `argumentUniqueness`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `names`:

```
problem:  Unknown directive "tag"
input:    ArgumentNames-valid-3: { user @tag(name: "a") { id } }
response: {"valid":false,"errors":[{"message":"Unknown directive \"tag\"","locations":[{"line":2,"column":8}]}]}
expected: valid
```

<a id="validate-finding-16"></a>

#### 16. `acceptsValid`: rejects valid documents, each one edit from a document that breaks only §5.5.1.4 Fragments Must Be Used; the rule it applied is a guess, since the kit doesn't read error messages

1 case, in `random` (1).

Each rejected document is one edit from a document that breaks only `fragmentsMustBeUsed`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `random`:

```
problem:  Unknown directive "once"
input:    FragmentsMustBeUsed-valid-20: query Q0 { resource @once { __typename } }
response: {"valid":false,"errors":[{"message":"Unknown directive \"once\"","locations":[{"line":2,"column":12}]}]}
expected: valid
```

<a id="validate-finding-17"></a>

#### 17. `acceptsValid`: rejects valid documents, each one edit from a document that breaks only §5.5.2.3 Fragment Spread Is Possible; the rule it applied is a guess, since the kit doesn't read error messages

1 case, in `random` (1).

Each rejected document is one edit from a document that breaks only `fragmentSpreadIsPossible`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `random`:

```
problem:  Unknown directive "tag"
input:    FragmentSpreadIsPossible-valid-22: query Q0 { user { id @tag } __typename } query Q1 { resource { id url } echo(opt: 1, role: GUEST) }
response: {"valid":false,"errors":[{"message":"Unknown directive \"tag\"","locations":[{"line":3,"column":8}]}]}
expected: valid
```

<a id="validate-finding-18"></a>

#### 18. `acceptsValid`: rejects valid documents, each one edit from a document that breaks §5.7.1 Directives Are Defined and §5.7.2 Directives Are in Valid Locations; the rule it applied is a guess, since the kit doesn't read error messages

1 case, in `directives` (1).

Each rejected document is one edit from a document that breaks only `directivesAreDefined` or `directivesAreInValidLocations`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `directives`:

```
problem:  Unknown directive "tag"
input:    DirectivesAreDefined-valid-8: { user { ...F } } fragment F on User @tag(name: "x") { id }
response: {"valid":false,"errors":[{"message":"Unknown directive \"tag\"","locations":[{"line":7,"column":20}]}]}
expected: valid
```

<a id="validate-finding-19"></a>

#### 19. `acceptsValid`: rejects valid documents, each one edit from a document that breaks §5.8.4 All Variables Used and §5.7.2 Directives Are in Valid Locations; the rule it applied is a guess, since the kit doesn't read error messages

1 case, in `directives` (1).

Each rejected document is one edit from a document that breaks only `allVariablesUsed` or `directivesAreInValidLocations`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `directives`:

```
problem:  Unknown directive "tag"
input:    DirectivesAreInValidLocations-valid-1: query Q @tag(name: "x") { user { id } }
response: {"valid":false,"errors":[{"message":"Unknown directive \"tag\"","locations":[{"line":1,"column":9}]}]}
expected: valid
```

<a id="validate-finding-20"></a>

#### 20. `acceptsValid`: rejects valid documents, each one edit from a document that breaks only §5.7.2 Directives Are in Valid Locations; the rule it applied is a guess, since the kit doesn't read error messages

1 case, in `directives` (1).

Each rejected document is one edit from a document that breaks only `directivesAreInValidLocations`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `directives`:

```
problem:  Unknown directive "tag"
input:    DirectivesAreInValidLocations-valid-2: subscription S @tag(name: "x") { postAdded { id } }
response: {"valid":false,"errors":[{"message":"Unknown directive \"tag\"","locations":[{"line":1,"column":16}]}]}
expected: valid
```

<a id="validate-finding-21"></a>

#### 21. `acceptsValid`: rejects valid documents, each one edit from a document that breaks only §5.8.4 All Variables Used; the rule it applied is a guess, since the kit doesn't read error messages

1 case, in `random` (1).

Each rejected document is one edit from a document that breaks only `allVariablesUsed`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `random`:

```
problem:  Unknown directive "once"
input:    AllVariablesUsed-valid-2: query Q0 { matrix @once }
response: {"valid":false,"errors":[{"message":"Unknown directive \"once\"","locations":[{"line":2,"column":10}]}]}
expected: valid
```

### Every check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **(draft only):** the failing cases rely on grammar or rules that are only in the draft, not in the October 2021 edition.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | Result |
| --- | :---: | :---: | :---: |
| Executable Definitions (`executableDefinitions`) | MUST | [§5.1.1](https://spec.graphql.org/draft/#sec-Executable-Definitions) | ✓ 4 |
| Operation Type Existence (`operationTypeExistence`) | MUST | [§5.2.1.1](https://spec.graphql.org/draft/#sec-Operation-Type-Existence) | ✗ 12/12 (all draft only) |
| Operation Name Uniqueness (`operationNameUniqueness`) | MUST | [§5.2.2.1](https://spec.graphql.org/draft/#sec-Operation-Name-Uniqueness) | ✓ 6 |
| Lone Anonymous Operation (`loneAnonymousOperation`) | MUST | [§5.2.3.1](https://spec.graphql.org/draft/#sec-Lone-Anonymous-Operation) | ✓ 21 |
| Single Root Field (`singleRootField`) | MUST | [§5.2.4.1](https://spec.graphql.org/draft/#sec-Single-Root-Field) | ✗ 46/59 (23 draft only) |
| Field Selections (`fieldSelections`) | MUST | [§5.3.1](https://spec.graphql.org/draft/#sec-Field-Selections) | ✓ 25 |
| Field Selection Merging (`fieldSelectionMerging`) | MUST | [§5.3.2](https://spec.graphql.org/draft/#sec-Field-Selection-Merging) | ✓ 674 |
| Leaf Field Selections (`leafFieldSelections`) | MUST | [§5.3.3](https://spec.graphql.org/draft/#sec-Leaf-Field-Selections) | ✓ 39 |
| Argument Names (`argumentNames`) | MUST | [§5.4.1](https://spec.graphql.org/draft/#sec-Argument-Names) | ✓ 8 |
| Argument Uniqueness (`argumentUniqueness`) | MUST | [§5.4.2](https://spec.graphql.org/draft/#sec-Argument-Uniqueness) | ✓ 6 |
| Required Arguments (`requiredArguments`) | MUST | [§5.4.3](https://spec.graphql.org/draft/#sec-Required-Arguments) | ✓ 11 |
| Fragment Name Uniqueness (`fragmentNameUniqueness`) | MUST | [§5.5.1.1](https://spec.graphql.org/draft/#sec-Fragment-Name-Uniqueness) | ✓ 10 |
| Fragment Spread Type Existence (`fragmentSpreadTypeExistence`) | MUST | [§5.5.1.2](https://spec.graphql.org/draft/#sec-Fragment-Spread-Type-Existence) | ✓ 12 |
| Fragments on Object, Interface or Union Types (`fragmentsOnObjectInterfaceOrUnionTypes`) | MUST | [§5.5.1.3](https://spec.graphql.org/draft/#sec-Fragments-on-Object-Interface-or-Union-Types) | ✓ 14 |
| Fragments Must Be Used (`fragmentsMustBeUsed`) | MUST | [§5.5.1.4](https://spec.graphql.org/draft/#sec-Fragments-Must-Be-Used) | ✓ 78 |
| Fragment Spread Target Defined (`fragmentSpreadTargetDefined`) | MUST | [§5.5.2.1](https://spec.graphql.org/draft/#sec-Fragment-Spread-Target-Defined) | ✓ 9 |
| Fragment Spreads Must Not Form Cycles (`fragmentSpreadsMustNotFormCycles`) | MUST | [§5.5.2.2](https://spec.graphql.org/draft/#sec-Fragment-Spreads-Must-Not-Form-Cycles) | ✓ 54 |
| Fragment Spread Is Possible (`fragmentSpreadIsPossible`) | MUST | [§5.5.2.3](https://spec.graphql.org/draft/#sec-Fragment-Spread-Is-Possible) | ✓ 36 |
| Values of Correct Type (`valuesOfCorrectType`) | MUST | [§5.6.1](https://spec.graphql.org/draft/#sec-Values-of-Correct-Type) | ✓ 282 |
| Input Object Field Names (`inputObjectFieldNames`). every document that breaks this rule also breaks §5.6.1 Values of Correct Type, which subsumes it, so a rejection can't be credited to this rule; accepting one fails both | MUST | [§5.6.2](https://spec.graphql.org/draft/#sec-Input-Object-Field-Names) | ⊂ |
| Input Object Field Uniqueness (`inputObjectFieldUniqueness`) | MUST | [§5.6.3](https://spec.graphql.org/draft/#sec-Input-Object-Field-Uniqueness) | ✓ 6 |
| Input Object Required Fields (`inputObjectRequiredFields`). every document that breaks this rule also breaks §5.6.1 Values of Correct Type, which subsumes it, so a rejection can't be credited to this rule; accepting one fails both | MUST | [§5.6.4](https://spec.graphql.org/draft/#sec-Input-Object-Required-Fields) | ⊂ |
| Directives Are Defined (`directivesAreDefined`) | MUST | [§5.7.1](https://spec.graphql.org/draft/#sec-Directives-Are-Defined) | ✓ 24 |
| Directives Are in Valid Locations (`directivesAreInValidLocations`) | MUST | [§5.7.2](https://spec.graphql.org/draft/#sec-Directives-Are-in-Valid-Locations) | ✓ 27 |
| Directives Are Unique per Location (`directivesAreUniquePerLocation`) | MUST | [§5.7.3](https://spec.graphql.org/draft/#sec-Directives-Are-Unique-per-Location) | ✗ 7/10 |
| Variable Uniqueness (`variableUniqueness`) | MUST | [§5.8.1](https://spec.graphql.org/draft/#sec-Variable-Uniqueness) | ✓ 6 |
| Variables Are Input Types (`variablesAreInputTypes`) | MUST | [§5.8.2](https://spec.graphql.org/draft/#sec-Variables-Are-Input-Types) | – |
| All Variable Uses Defined (`allVariableUsesDefined`) | MUST | [§5.8.3](https://spec.graphql.org/draft/#sec-All-Variable-Uses-Defined) | ✓ 15 |
| All Variables Used (`allVariablesUsed`) | MUST | [§5.8.4](https://spec.graphql.org/draft/#sec-All-Variables-Used) | ✓ 18 |
| All Variable Usages Are Allowed (`allVariableUsagesAreAllowed`) | MUST | [§5.8.5](https://spec.graphql.org/draft/#sec-All-Variable-Usages-Are-Allowed) | ✗ 12/636 (4 draft only) |
| Valid documents are accepted (`acceptsValid`) | MUST | [§5](https://spec.graphql.org/draft/#sec-Validation) | ✗ 31/979 |

- **Basis for `acceptsValid`:** a document is valid when it satisfies every rule of §5, and only invalid requests are kept from execution (§6.1.1); rejecting a valid document applies a rule the spec doesn't have

## Introspect

- **Capabilities:** deferred-items, idle, introspect, mutation, parse, subscription, uncoercible-results, validate
- **Cases:** 28 submitted, 28 distinct, 0 malformed
- **Skipped:** 10
- **Profile:** the oct2021 edition's introspection types. The draft's introspection query was rejected ("Unknown argument "includeDeprecated" on field "directives" of type "__Schema"") and October 2021's was answered, so this run grades against October 2021.
- **Adapter problems:** none
- **Checker self-test:** passed (148 negative controls)
- **Run:** kit 5da3deb09c91, 2026-11-15, strict

### Findings

<a id="introspect-finding-1"></a>

#### 1. `builtinAdditions`, `builtinDefinitions`: the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (arguments); the built-in __Directive has a field October 2021 doesn't define; the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define

6 cases, in `minimal` (1), `interfaces` (1), `deprecation` (1), `roots` (1), `scalars` (1), `order` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `minimal.inc`:

```
problem:  added:arguments at __Directive.args, added:arguments at __Field.args, added:arguments at __Type.inputFields, added:fields at __Directive, added:fields at __InputValue, added:fields at __Type, arguments at @deprecated(reason:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), directives at @deprecated
input:    type Query { a: Int }  (the introspection query, October 2021 profile; includeDeprecated: true)
response: {"name":"deprecated","description":null,"isRepeatable":false,"locations":["FIELD_DEFINITION","ARGUMENT_DEFINITION","INPUT_FIELD_DEFINITION","ENUM_VALUE"],"args":[{"name":"reason","description":null,"type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"SCALAR","name":"String","ofType":null}},"defaultValue":"\"No longer supported\""}]}
expected: [object Object]
```

<a id="introspect-finding-2"></a>

#### 2. `builtinAdditions`, `builtinDefinitions`: the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (arguments); the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define

6 cases, in `minimal` (1), `interfaces` (1), `deprecation` (1), `roots` (1), `scalars` (1), `order` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `minimal.defaults`:

```
problem:  added:arguments at __Directive.args, added:arguments at __Field.args, added:arguments at __Type.inputFields, added:fields at __InputValue, added:fields at __Type, arguments at @deprecated(reason:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), directives at @deprecated
input:    type Query { a: Int }  (the introspection query, October 2021 profile; includeDeprecated: the default)
response: {"name":"deprecated","description":null,"isRepeatable":false,"locations":["FIELD_DEFINITION","ARGUMENT_DEFINITION","INPUT_FIELD_DEFINITION","ENUM_VALUE"],"args":[{"name":"reason","description":null,"type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"SCALAR","name":"String","ofType":null}},"defaultValue":"\"No longer supported\""}]}
expected: [object Object]
```

<a id="introspect-finding-3"></a>

#### 3. `builtinAdditions`, `builtinDefinitions`, `directives`: directives describes the schema's own directives (name, locations, isRepeatable), and any of the service's own takes input types: differs from Introspection.tla; the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (arguments); the built-in __Directive has a field October 2021 doesn't define; the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define

1 case, in `rich` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- directives describes the schema's own directives (name, locations, isRepeatable), and any of the service's own takes input types (MUST, [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `rich.inc`:

```
problem:  added:arguments at __Directive.args, added:arguments at __Field.args, added:arguments at __Type.inputFields, added:fields at __Directive, added:fields at __InputValue, added:fields at __Type, arguments at @deprecated(reason:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), directives at @deprecated, directives at the root
input:    """The schema""" schema { query: Q mutation: M } "The root" type Q { a("An argument" x: Int = 3, y: [Int] = 1, z: In = {b: 2}): U, old: String @deprecated(reason: "gone"), d: Date } type M { m(p: Pick!): Boolean } type A { a: Int } type B { b: Int } union U = B | A enum E { X "Why" Y @deprecated } input In { a: Int = 1, b: Int, e: E = Y, old: String } input Pick { id: ID, name: String } scalar Date "Tags a field" directive @tag(v: String, w: Int = 2) repeatable on FIELD_DEFINITION | QUERY  (the introspection query, October 2021 profile; includeDeprecated: true)
response: {"__typename":"Q","description":"The schema","queryType":{"kind":"OBJECT","name":"Q"},"mutationType":{"kind":"OBJECT","name":"M"},"subscriptionType":null,"types":["E","__DirectiveLocation","__TypeKind","In","Pick","Boolean","Date","ID","Int","String","A","B","M","Q","__Directive","__EnumValue","__Field","__InputValue","__Schema","__Type","U"],"directives":["deprecated","include","oneOf","skip","specifiedBy"]}
expected: [object Object]
```

<a id="introspect-finding-4"></a>

#### 4. `builtinAdditions`, `builtinDefinitions`, `directives`: directives describes the schema's own directives (name, locations, isRepeatable), and any of the service's own takes input types: differs from Introspection.tla; the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (arguments); the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define

1 case, in `rich` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- directives describes the schema's own directives (name, locations, isRepeatable), and any of the service's own takes input types (MUST, [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `rich.defaults`:

```
problem:  added:arguments at __Directive.args, added:arguments at __Field.args, added:arguments at __Type.inputFields, added:fields at __InputValue, added:fields at __Type, arguments at @deprecated(reason:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), directives at @deprecated, directives at the root
input:    """The schema""" schema { query: Q mutation: M } "The root" type Q { a("An argument" x: Int = 3, y: [Int] = 1, z: In = {b: 2}): U, old: String @deprecated(reason: "gone"), d: Date } type M { m(p: Pick!): Boolean } type A { a: Int } type B { b: Int } union U = B | A enum E { X "Why" Y @deprecated } input In { a: Int = 1, b: Int, e: E = Y, old: String } input Pick { id: ID, name: String } scalar Date "Tags a field" directive @tag(v: String, w: Int = 2) repeatable on FIELD_DEFINITION | QUERY  (the introspection query, October 2021 profile; includeDeprecated: the default)
response: {"__typename":"Q","description":"The schema","queryType":{"kind":"OBJECT","name":"Q"},"mutationType":{"kind":"OBJECT","name":"M"},"subscriptionType":null,"types":["E","__DirectiveLocation","__TypeKind","In","Pick","Boolean","Date","ID","Int","String","A","B","M","Q","__Directive","__EnumValue","__Field","__InputValue","__Schema","__Type","U"],"directives":["deprecated","include","oneOf","skip","specifiedBy"]}
expected: [object Object]
```

<a id="introspect-finding-5"></a>

#### 5. `builtinAdditions`, `builtinDefinitions`, `defaultValue`: defaultValue encodes the default value, and is null without one: differs from Introspection.tla; the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (arguments); the built-in __Directive has a field October 2021 doesn't define; the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define

1 case, in `defaults` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- defaultValue encodes the default value, and is null without one (MUST, [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type))

The shortest case, from `defaults.inc`:

```
problem:  added:arguments at __Directive.args, added:arguments at __Field.args, added:arguments at __Type.inputFields, added:fields at __Directive, added:fields at __InputValue, added:fields at __Type, arguments at @deprecated(reason:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), defaultValue at Query.f(s:), directives at @deprecated
input:    enum E { X Y } input I { a: Int = 1, b: Int, c: [Int] = 1, e: E = Y, f: Float = 2 } type Query { f(x: [Int] = 1, y: Float = 1, z: ID = 7, w: [[Int]] = [1, 2], i: I = {b: 2}, s: String = "say \"hi\"", n: Int = null, l: [E!] = [X, Y]): Int }  (the introspection query, October 2021 profile; includeDeprecated: true)
response: {"kind":"OBJECT","name":"Query","description":null,"specifiedByURL":null,"fields":[{"name":"f","description":null,"args":[{"name":"x","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}},"defaultValue":"1"},{"name":"y","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1"},{"name":"z","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"7"},{"name":"w","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}}},"defaultValue":"[1, 2]"},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"I","ofType":null},"defaultValue":"{b: 2}"},{"name":"s","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"say \"hi\"\""},{"name":"n","description":null,"type":{"kind":"SCALAR","name":"Int","ofType":null},"defaultValue":"null"},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"ENUM","name":"E","ofType":null}}},"defaultValue":"[X, Y]"}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-6"></a>

#### 6. `builtinAdditions`, `builtinDefinitions`, `defaultValue`: defaultValue encodes the default value, and is null without one: differs from Introspection.tla; the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (arguments); the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define

1 case, in `defaults` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- defaultValue encodes the default value, and is null without one (MUST, [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type))

The shortest case, from `defaults.defaults`:

```
problem:  added:arguments at __Directive.args, added:arguments at __Field.args, added:arguments at __Type.inputFields, added:fields at __InputValue, added:fields at __Type, arguments at @deprecated(reason:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), defaultValue at Query.f(s:), directives at @deprecated
input:    enum E { X Y } input I { a: Int = 1, b: Int, c: [Int] = 1, e: E = Y, f: Float = 2 } type Query { f(x: [Int] = 1, y: Float = 1, z: ID = 7, w: [[Int]] = [1, 2], i: I = {b: 2}, s: String = "say \"hi\"", n: Int = null, l: [E!] = [X, Y]): Int }  (the introspection query, October 2021 profile; includeDeprecated: the default)
response: {"kind":"OBJECT","name":"Query","description":null,"specifiedByURL":null,"fields":[{"name":"f","description":null,"args":[{"name":"x","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}},"defaultValue":"1"},{"name":"y","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1"},{"name":"z","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"7"},{"name":"w","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}}},"defaultValue":"[1, 2]"},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"I","ofType":null},"defaultValue":"{b: 2}"},{"name":"s","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"say \"hi\"\""},{"name":"n","description":null,"type":{"kind":"SCALAR","name":"Int","ofType":null},"defaultValue":"null"},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"ENUM","name":"E","ofType":null}}},"defaultValue":"[X, Y]"}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-7"></a>

#### 7. `builtinAdditions`, `builtinDefinitions`, `builtinScalars`, `directives`: directives describes the schema's own directives (name, locations, isRepeatable), and any of the service's own takes input types: differs from Introspection.tla; leaves out Float, a built-in scalar the schema references; the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (arguments); the built-in __Directive has a field October 2021 doesn't define; the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define

1 case, in `builtinScalars` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- types has the built-in scalars the schema references, and no others (MUST, [§3.5](https://spec.graphql.org/draft/#sec-Scalars) [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type))
- directives describes the schema's own directives (name, locations, isRepeatable), and any of the service's own takes input types (MUST, [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `builtinScalars.inc`:

```
problem:  added:arguments at __Directive.args, added:arguments at __Field.args, added:arguments at __Type.inputFields, added:fields at __Directive, added:fields at __InputValue, added:fields at __Type, arguments at @deprecated(reason:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), builtinScalars at Float, directives at @deprecated, directives at the root
input:    directive @d(f: Float) on FIELD input In { id: ID } type Query { a(i: In): String }  (the introspection query, October 2021 profile; includeDeprecated: true)
response: {"__typename":"Query","description":null,"queryType":{"kind":"OBJECT","name":"Query"},"mutationType":null,"subscriptionType":null,"types":["__DirectiveLocation","__TypeKind","In","Boolean","ID","String","Query","__Directive","__EnumValue","__Field","__InputValue","__Schema","__Type"],"directives":["deprecated","include","oneOf","skip","specifiedBy"]}
expected: [object Object]
```

<a id="introspect-finding-8"></a>

#### 8. `builtinAdditions`, `builtinDefinitions`, `builtinScalars`, `directives`: directives describes the schema's own directives (name, locations, isRepeatable), and any of the service's own takes input types: differs from Introspection.tla; leaves out Float, a built-in scalar the schema references; the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (arguments); the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define

1 case, in `builtinScalars` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- types has the built-in scalars the schema references, and no others (MUST, [§3.5](https://spec.graphql.org/draft/#sec-Scalars) [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type))
- directives describes the schema's own directives (name, locations, isRepeatable), and any of the service's own takes input types (MUST, [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `builtinScalars.defaults`:

```
problem:  added:arguments at __Directive.args, added:arguments at __Field.args, added:arguments at __Type.inputFields, added:fields at __InputValue, added:fields at __Type, arguments at @deprecated(reason:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), builtinScalars at Float, directives at @deprecated, directives at the root
input:    directive @d(f: Float) on FIELD input In { id: ID } type Query { a(i: In): String }  (the introspection query, October 2021 profile; includeDeprecated: the default)
response: {"__typename":"Query","description":null,"queryType":{"kind":"OBJECT","name":"Query"},"mutationType":null,"subscriptionType":null,"types":["__DirectiveLocation","__TypeKind","In","Boolean","ID","String","Query","__Directive","__EnumValue","__Field","__InputValue","__Schema","__Type"],"directives":["deprecated","include","oneOf","skip","specifiedBy"]}
expected: [object Object]
```

<a id="introspect-finding-9"></a>

#### 9. `defaultValue`: defaultValue encodes the default value, and is null without one: differs from Introspection.tla

1 case, in `defaults` (1).

- defaultValue encodes the default value, and is null without one (MUST, [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type))

The shortest case, from `defaults.lookup`:

```
problem:  defaultValue at Query.f(s:)
input:    enum E { X Y } input I { a: Int = 1, b: Int, c: [Int] = 1, e: E = Y, f: Float = 2 } type Query { f(x: [Int] = 1, y: Float = 1, z: ID = 7, w: [[Int]] = [1, 2], i: I = {b: 2}, s: String = "say \"hi\"", n: Int = null, l: [E!] = [X, Y]): Int }  (__type(name:) for Query, I, Unknown, October 2021 profile; includeDeprecated: true)
response: {"__type(name: \"Query\")":{"kind":"OBJECT","name":"Query","description":null,"specifiedByURL":null,"fields":[{"name":"f","description":null,"args":[{"name":"x","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}},"defaultValue":"1"},{"name":"y","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1"},{"name":"z","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"7"},{"name":"w","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}}},"defaultValue":"[1, 2]"},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"I","ofType":null},"defaultValue":"{b: 2}"},{"name":"s","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"say \"hi\"\""},{"name":"n","description":null,"type":{"kind":"SCALAR","name":"Int","ofType":null},"defaultValue":"null"},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"ENUM","name":"E","ofType":null}}},"defaultValue":"[X, Y]"}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}}
expected: [object Object]
```

<a id="introspect-finding-10"></a>

#### 10. `typeByName`: __type(name:) doesn't return a type the schema has

1 case, in `builtinScalars` (1).

- __type(name:) returns the named type, and null for a name the schema doesn't have (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))

The shortest case, from `builtinScalars.lookup`:

```
problem:  typeByName at Float
input:    directive @d(f: Float) on FIELD input In { id: ID } type Query { a(i: In): String }  (__type(name:) for In, ID, Float, Int, Unknown, October 2021 profile; includeDeprecated: true)
response: {"__type(name: \"Float\")":null}
expected: [object Object]
```

### Every check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **(draft only):** the failing cases rely on grammar or rules that are only in the draft, not in the October 2021 edition.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | Result |
| --- | :---: | :---: | :---: |
| The response is a well-formed execution result: data, errors only as a non-empty list, extensions a map, nothing else (`envelope`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ 28 |
| The query executes, and its result has exactly the fields it selects, nulls included (`executes`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 28 |
| queryType, mutationType and subscriptionType are the root operation types (`roots`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✓ 18 |
| types is the set of all named types (`types`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) | ✓ 18 |
| types has the built-in scalars the schema references, and no others (`builtinScalars`) | MUST | [§3.5](https://spec.graphql.org/draft/#sec-Scalars) [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) | ✗ 2/18 |
| __type(name:) returns the named type, and null for a name the schema doesn't have (`typeByName`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✗ 1/10 |
| Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (`typeKinds`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) | ✓ 28 |
| An object's or interface's fields, with their types (`fields`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) | ✓ 28 |
| Field and directive arguments, with their types (`arguments`) | MUST | [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) | ✓ 28 |
| defaultValue encodes the default value, and is null without one (`defaultValue`) | MUST | [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | ✗ 3/28 |
| An input object's inputFields, with their types (`inputFields`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | ✓ 28 |
| An enum's enumValues (`enumValues`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) | ✓ 28 |
| interfaces, and possibleTypes for unions and interfaces (`interfaces`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) | ✓ 28 |
| isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something (`deprecation`). Graded for fields and enum values only: the implementation answered the October 2021 query. | MUST (Oct 2021: fields and enum values only) | [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✓ 28 |
| specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null; @specifiedBy is returned when a scalar has a URL (`specifiedByURL`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) | ✓ 28 |
| isOneOf is true exactly for OneOf input objects; @oneOf is returned when one is (`isOneOf`). Not graded: the implementation answered the October 2021 query, and October 2021 has no OneOf input objects. | MUST (draft only) | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | – |
| Descriptions are the schema's (`descriptions`) | MUST | [§3.2](https://spec.graphql.org/draft/#sec-Type-System-Descriptions) [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 28 |
| directives describes the schema's own directives (name, locations, isRepeatable), and any of the service's own takes input types (`directives`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 4/18 |
| @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (`builtinDirectives`) | SHOULD | [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.1](https://spec.graphql.org/draft/#sec-skip) [§3.13.2](https://spec.graphql.org/draft/#sec-include) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) [§3.13.5](https://spec.graphql.org/draft/#sec-oneOf) | ✓ 18 |
| The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (`builtinDefinitions`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 18/28 |
| The introspection types have no field, argument, enum value or type the spec doesn't define (`builtinAdditions`) | INFO | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | i 18/28 |
| __typename names the root type, and no fields list includes it (`typename`) | MUST | [§4.1](https://spec.graphql.org/draft/#sec-Type-Name-Introspection) | ✓ 28 |
| Fields, arguments, enum values, directives, members and interfaces come in source order (`order`). Not graded: the implementation answered the October 2021 query, and October 2021 has no Stable Ordering. | SHOULD (draft only) | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | – |
| Anything else Introspection!Matches requires (`other`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 28 |

- **Basis for `builtinAdditions`:** No sentence of §4 forbids extending the introspection types. The nearest is "Below are the full set of type system definitions providing schema introspection, which are fully defined in the sections below", which uses no key word, and Appendix A says "A conforming implementation of GraphQL may provide additional functionality, but must not do so where explicitly disallowed". Leaving out or changing a definition stays a MUST, under builtinDefinitions.
