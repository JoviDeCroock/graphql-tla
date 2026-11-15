# juniper 0.18.0 (GraphQLType with TypeInfo)

Generated from the conformance kit's reports. Back to the [sheet](README.md).

**Notes** (hand-written, from outside the kit):

- Juniper builds schemas from Rust types. The adapter uses its documented dynamic route, a hand-written `GraphQLType` with `TypeInfo`, and Juniper's own code completes objects, lists and scalars. Values a typed schema can't hold aren't sent: uncoercible results only for Float (`uncoercibleTypes`), so `intFraction` is untested, and no null for a Non-Null list item or subscription event (`nullItems: false`). The report's provenance counts what was left out.
- Fields called twice, error paths without list indices, the nested list, the non-finite Float and the subscription findings reproduce with `#[graphql_object]` (`examples/macros.rs`). The findings where a list item's error is reported at the list's path need an item type whose own resolution fails, which only a hand-written type (here, the adapter's deferred items) has; with `--inline-items` they go away. See the [adapter's README](../adapters/juniper/README.md#known-juniper-deviations).
- The adapter doesn't claim `invalid-results` (result shapes are fixed by Rust types), `custom-directives` (Juniper can't declare a directive of its own), or the schema area (Juniper doesn't read SDL, so every verdict would be the adapter's).

## Execution

- **Capabilities:** deferred-items, idle, introspect, mutation, parse, subscription, uncoercible-results, validate
- **Cases:** 11781 submitted, 1262 distinct, 1754 malformed
- **Not sent:** 1713 uncoercible Int results (uncoercibleTypes: Float), 1572 uncoercible Enum results (uncoercibleTypes: Float), 3936 null for a Non-Null list item or subscription event (nullItems: false)
- **Adapter problems:** none
- **Checker self-test:** passed (41 negative controls)
- **Run:** kit 71f0a24bdc40, 2026-11-15, strict, 1500 random runs per fixture (seed 1), exhaustive runs on

### Findings

<a id="execution-finding-1"></a>

#### 1. `responsePosition`: error path … has … where … wants an integer index

784 cases, in `lists` (579), `unions` (205).

- Paths are lists of response names (aliases, not field names) and integer list indices (MUST, [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position))

The shortest case, from `lists`:

```
problem:  error path ["posts","title"] has "title" where §7.1.4 wants an integer index
trace:    call posts; call tags; settle posts = list(1); call posts.0; settle tags = null; settle posts.0 = object(Post); call posts.0.title; settle posts.0.title = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Post.title.","locations":[{"line":3,"column":5}],"path":["posts","title"]},{"message":"Cannot return null for non-nullable field Query.tags.","locations":[{"line":5,"column":3}],"path":["tags"]}]}
```

<a id="execution-finding-2"></a>

#### 2. `callsOnce`: the resolver at … was called twice

555 cases, in `fragments` (555).

- Each field is executed once, merged selections included (MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields))

The shortest case, from `fragments`:

```
problem:  the resolver at node.id was called twice (§6.3.3 executes each field once)
trace:    call node; settle node = object(User); call node.name; settle node.name = null; call node.id; settle node.id = null; call node.nodeId; settle node.nodeId = null; call node.id; settle node.id = null
response: {"data":{"node":null},"errors":[{"message":"Cannot return null for non-nullable field User.id.","locations":[{"line":12,"column":7}],"path":["node","nodeId"]},{"message":"Cannot return null for non-nullable field User.id.","locations":[{"line":19,"column":3}],"path":["node","id"]}]}
```

<a id="execution-finding-3"></a>

#### 3. `resultCoercion`: ratio is null without an error, though its resolver returned a value its type can't represent, which must raise an execution error

415 cases, in `leaves` (415).

- A non-finite Float or an unknown enum value raises an execution error (MUST, [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion))

The shortest case, from `leaves`:

```
problem:  ratio is null without an error, though its resolver returned a value its type can't represent, which must raise an execution error
trace:    call count; call ratio; call color; settle count = null; settle ratio = uncoercible; settle color = null
response: {"data":{"count":null,"ratio":null,"color":null}}
```

<a id="execution-finding-4"></a>

#### 4. `errorsInsideNulls`, `errorsWereRaised`, `nullsExplained`

172 cases, in `lists` (150), `unions` (22).

- Every error is inside a null in data (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))
- Every error was raised, at the path where it was raised (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `lists`:

```
trace:    call posts; call tags; settle posts = null; settle tags = list(1); call tags.0; settle tags.0 = error
response: {"data":{"posts":null,"tags":[null]},"errors":[{"message":"resolver at tags.0 failed","locations":[{"line":5,"column":3}],"path":["tags"]}]}
expected: data {"posts": null, "tags": [null]}
```

<a id="execution-finding-5"></a>

#### 5. `errorsWereRaised`, `nullsExplained`

111 cases, in `lists` (92), `unions` (19).

- Every error was raised, at the path where it was raised (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `lists`:

```
trace:    call posts; call tags; settle posts = list(1); call posts.0; settle tags = list(0); settle posts.0 = error
response: {"data":{"posts":null,"tags":[]},"errors":[{"message":"resolver at posts.0 failed","locations":[{"line":2,"column":3}],"path":["posts"]}]}
expected: data {"posts": null, "tags": []}
```

<a id="execution-finding-6"></a>

#### 6. `errorPathsUnique`, `errorsInsideNulls`, `errorsWereRaised`, `nullsExplained`

46 cases, in `lists` (46).

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

<a id="execution-finding-7"></a>

#### 7. `errorsWereRaised`

40 cases, in `lists` (34), `unions` (6).

- Every error was raised, at the path where it was raised (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors))

The shortest case, from `lists`:

```
trace:    call posts; call tags; settle posts = list(1); call posts.0; settle tags = null; settle posts.0 = error
response: {"data":null,"errors":[{"message":"resolver at posts.0 failed","locations":[{"line":2,"column":3}],"path":["posts"]},{"message":"Cannot return null for non-nullable field Query.tags.","locations":[{"line":5,"column":3}],"path":["tags"]}]}
expected: data null
```

<a id="execution-finding-8"></a>

#### 8. `dataMatches`, `errorsInsideNulls`, `errorsWereRaised`, `nullsExplained`

25 cases, in `unions` (25).

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

<a id="execution-finding-9"></a>

#### 9. `dataMatches`

20 cases, in `subscription` (11), `unions` (9).

- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))

The shortest case, from `subscription`:

```
trace:    call postLiked; settle postLiked = error
response: {"data":{"postLiked":null},"errors":[{"message":"resolver at postLiked failed","locations":[{"line":2,"column":3}],"path":["postLiked"]}]}
expected: data null
```

<a id="execution-finding-10"></a>

#### 10. `errorPathsUnique`, `errorsWereRaised`, `nullsExplained`

18 cases, in `lists` (18).

- No two errors share a response path (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))
- Every error was raised, at the path where it was raised (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `lists`:

```
trace:    call posts; call tags; settle tags = list(0); settle posts = list(2); call posts.0; call posts.1; settle posts.1 = error; settle posts.0 = error
response: {"data":{"posts":null,"tags":[]},"errors":[{"message":"resolver at posts.0 failed","locations":[{"line":2,"column":3}],"path":["posts"]},{"message":"resolver at posts.1 failed","locations":[{"line":2,"column":3}],"path":["posts"]}]}
expected: data {"posts": null, "tags": []}
```

<a id="execution-finding-11"></a>

#### 11. `errorPathsUnique`, `errorsWereRaised`

6 cases, in `lists` (6).

- No two errors share a response path (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))
- Every error was raised, at the path where it was raised (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors))

The shortest case, from `lists`:

```
trace:    call posts; call tags; settle tags = null; settle posts = list(2); call posts.0; call posts.1; settle posts.1 = error; settle posts.0 = error
response: {"data":null,"errors":[{"message":"resolver at posts.0 failed","locations":[{"line":2,"column":3}],"path":["posts"]},{"message":"resolver at posts.1 failed","locations":[{"line":2,"column":3}],"path":["posts"]},{"message":"Cannot return null for non-nullable field Query.tags.","locations":[{"line":5,"column":3}],"path":["tags"]}]}
expected: data null
```

### Every check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **(all draft only), (k draft only):** all, or k, of the n failing cases rely on grammar or rules that are only in the draft, not in the October 2021 edition. The symbol still gives the check's level.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | Result |
| --- | :---: | :---: | :---: |
| The response is sent only once execution is complete (`complete`) | MUST | [§6.3.1](https://spec.graphql.org/draft/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ 1896 |
| data is the completed value: field collection, value completion and null propagation (`dataMatches`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✗ 45/1896 |
| Response keys are in collected field order (`keyOrder`) | SHOULD | [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering) | ✓ 1896 |
| Every error was raised, at the path where it was raised (`errorsWereRaised`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✗ 418/1315 |
| No two errors share a response path (`errorPathsUnique`) | MUST (Oct 2021: SHOULD) | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✗ 70/1315 |
| Every error is inside a null in data (`errorsInsideNulls`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✗ 243/1315 |
| Every null an error caused comes with an error from one of its causes (`nullsExplained`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✗ 372/1315 |
| A mutation reports every error its earlier root fields raised (`serialErrorsKept`) | MUST | [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 45 |
| A mutation's root fields execute one after another (`calledSerially`) | MUST | [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) | ✓ 45 |
| Each field is executed once, merged selections included (`callsOnce`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) | ✗ 555/11781 |
| Only fields the operation selects are executed (`callsSelected`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) | ✓ 11781 |
| A field executes only once its parent has a value that contains it (`callsReachable`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 11781 |
| A request gets a response (`responds`) | MUST | [§7.1](https://spec.graphql.org/draft/#sec-Response-Format) | ✓ 11781 |
| A subscription event yields an execution result, even when its data is null (`eventYieldsResult`) | MUST | [§6.2.3.2](https://spec.graphql.org/draft/#sec-Response-Stream) | ✓ 1516 |
| data holds only positions the operation selects (`dataShape`) | MUST | [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ 7890 |
| A non-finite Float or an unknown enum value raises an execution error (`resultCoercion`) | MUST | [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✗ 415/415 |
| A fraction returned for an Int (1.2) raises an execution error instead of being truncated (`intFraction`) | SHOULD | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | – |
| Leaf values are the resolver's canonical value (Int 1, Float 1.5, Boolean true, an enum's first value, "v") (`leafValues`) | MUST | [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 7890 |
| Leaf values use the JSON type §7.2.1 gives their GraphQL type (a number for Int 1, not "1") (`leafEncoding`) | SHOULD | [§7.2.1](https://spec.graphql.org/draft/#sec-JSON-Serialization) | ✓ 7890 |
| An execution result has a data entry (`dataPresent`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 11781 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 11781 |
| The response has no entries besides data, errors and extensions (`additionalEntries`) | MUST | [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ 11781 |
| extensions is a map (`extensions`) | MUST | [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) | – |
| Errors are maps with a message, and extensions, if present, is a map (`errorFormat`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 9672 |
| An error's locations, if present, is a list of maps with line and column, both positive integers (`errorLocations`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 9672 |
| Execution errors have a path to a position the operation selects (`errorPath`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 9672 |
| Paths are lists of response names (aliases, not field names) and integer list indices (`responsePosition`) | MUST (Oct 2021: SHOULD) | [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) | ✗ 784/9672 |
| Errors have no entries besides message, locations, path and extensions (`errorEntries`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 9672 |
| The adapter follows the kit's protocol (call types, settles) (`protocol`) | ADAPTER | — | ✓ 11781 |
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
| [`leaves`](../fixtures/leaves.graphql) | ✗ 415/1572 | without results of the wrong shape (no invalid-results capability) |
| [`lists`](../fixtures/lists.graphql) | ✗ 925/2097 |  |
| [`mutation`](../fixtures/mutation.graphql) | ✓ 1590 |  |
| [`noPropagation`](../fixtures/noPropagation.graphql) | – | needs error-propagation-off |
| [`nullPropagation`](../fixtures/nullPropagation.graphql) | ✓ 1662 |  |
| [`subscription`](../fixtures/subscription.graphql) | ✗ 11/1516 |  |
| [`unions`](../fixtures/unions.graphql) | ✗ 277/1660 | without results of the wrong shape (no invalid-results capability) |

## Parse

- **Capabilities:** deferred-items, idle, introspect, mutation, parse, subscription, uncoercible-results, validate
- **Cases:** 1992 submitted, 1992 distinct, 0 malformed
- **Vectors:** 1992 of 2007 graded (not graded: 15 unsupported by the adapter)
- **Draft only:** 10 of the failing vectors (of 113 draft-only vectors) rely on grammar or rules only in the draft
- **Adapter problems:** none
- **Checker self-test:** passed (7 negative controls)
- **Run:** kit 71f0a24bdc40, 2026-11-15, strict

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

6 cases, in `block-strings` (3), `lexer-examples` (2), `strings` (1). 2 of them rely on grammar or rules that are only in the draft, not in October 2021.

- String values and block strings (MUST, [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value))

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

- Int values (MUST, [§2.10.1](https://spec.graphql.org/draft/#sec-Int-Value))

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

- String values and block strings (MUST, [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value))

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

- Variables and variable definitions (MUST, [§2.11](https://spec.graphql.org/draft/#sec-Variables))

The shortest case, from `parser-examples`:

```
input:    "query ($a: Int = {k: [1, E, null]}) {a}"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-7"></a>

#### 7. `variables`: accepts what §2.11 Variables rejects

1 case, in `parser-examples` (1).

- Variables and variable definitions (MUST, [§2.11](https://spec.graphql.org/draft/#sec-Variables))

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
- **(all draft only), (k draft only):** all, or k, of the n failing cases rely on grammar or rules that are only in the draft, not in the October 2021 edition. The symbol still gives the check's level.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | Result |
| --- | :---: | :---: | :---: |
| Source text is a sequence of SourceCharacter (`sourceText`) | MUST | [§2.1](https://spec.graphql.org/draft/#sec-Source-Text) | ✓ 19 |
| White space is tab and space only (`whiteSpace`) | MUST | [§2.1.1](https://spec.graphql.org/draft/#sec-White-Space) | ✓ 27 |
| Line terminators are LF, CR and CR LF only (`lineTerminators`) | MUST | [§2.1.2](https://spec.graphql.org/draft/#sec-Line-Terminators) | ✓ 31 |
| A comment runs to the end of its line (`comments`) | MUST | [§2.1.3](https://spec.graphql.org/draft/#sec-Comments) | ✓ 21 |
| Commas are insignificant (`insignificantCommas`) | MUST | [§2.1.4](https://spec.graphql.org/draft/#sec-Insignificant-Commas) | ✓ 5 |
| Every character outside ignored tokens is part of a token (`lexicalTokens`) | MUST | [§2.1.5](https://spec.graphql.org/draft/#sec-Lexical-Tokens) | ✓ 43 |
| Ignored tokens may appear before and after every token (`ignoredTokens`) | MUST | [§2.1.6](https://spec.graphql.org/draft/#sec-Ignored-Tokens) | ✓ 418 |
| Punctuators, and `...` only as a whole (`punctuators`) | MUST | [§2.1.7](https://spec.graphql.org/draft/#sec-Punctuators) | ✓ 40 |
| Names (`names`) | MUST | [§2.1.8](https://spec.graphql.org/draft/#sec-Names) | ✓ 14 |
| Descriptions on operations, fragments and variables, not on the query shorthand (`descriptions`) | MUST | [§2.2](https://spec.graphql.org/draft/#sec-Descriptions) | ✓ 121 |
| A document is one or more executable definitions (`document`) | MUST | [§2.3](https://spec.graphql.org/draft/#sec-Document) | ✓ 98 |
| Operation definitions and the query shorthand (`operations`) | MUST | [§2.4](https://spec.graphql.org/draft/#sec-Operations) | ✓ 101 |
| Selection sets, including empty ones (`selectionSets`) | MUST | [§2.5](https://spec.graphql.org/draft/#sec-Selection-Sets) | ✗ 8/95 (all draft only) |
| Fields (`fields`) | MUST | [§2.6](https://spec.graphql.org/draft/#sec-Fields) | ✓ 96 |
| Arguments (`arguments`) | MUST | [§2.7](https://spec.graphql.org/draft/#sec-Arguments) | ✓ 111 |
| Field aliases (`fieldAlias`) | MUST | [§2.8](https://spec.graphql.org/draft/#sec-Field-Alias) | ✓ 94 |
| Fragment definitions and fragment spreads (`fragments`) | MUST | [§2.9](https://spec.graphql.org/draft/#sec-Fragments) | ✓ 117 |
| Type conditions (`typeConditions`) | MUST | [§2.9.1](https://spec.graphql.org/draft/#sec-Type-Conditions) | ✓ 112 |
| Inline fragments (`inlineFragments`) | MUST | [§2.9.2](https://spec.graphql.org/draft/#sec-Inline-Fragments) | ✓ 100 |
| Input values, and no variables in constant values (`inputValues`) | MUST | [§2.10](https://spec.graphql.org/draft/#sec-Input-Values) | ✓ 122 |
| Int values (`intValue`) | MUST | [§2.10.1](https://spec.graphql.org/draft/#sec-Int-Value) | ✗ 15/46 |
| Float values (`floatValue`) | MUST | [§2.10.2](https://spec.graphql.org/draft/#sec-Float-Value) | ✓ 35 |
| Boolean values (`booleanValue`) | MUST | [§2.10.3](https://spec.graphql.org/draft/#sec-Boolean-Value) | ✓ 3 |
| String values and block strings (`stringValue`) | MUST | [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value) | ✗ 10/153 (2 draft only) |
| Null value (`nullValue`) | MUST | [§2.10.5](https://spec.graphql.org/draft/#sec-Null-Value) | ✓ 2 |
| Enum values (`enumValue`) | MUST | [§2.10.6](https://spec.graphql.org/draft/#sec-Enum-Value) | ✓ 14 |
| List values (`listValue`) | MUST | [§2.10.7](https://spec.graphql.org/draft/#sec-List-Value) | ✓ 102 |
| Input object values (`inputObjectValues`) | MUST | [§2.10.8](https://spec.graphql.org/draft/#sec-Input-Object-Values) | ✓ 107 |
| Variables and variable definitions (`variables`) | MUST | [§2.11](https://spec.graphql.org/draft/#sec-Variables) | ✗ 2/158 |
| Type references (`typeReferences`) | MUST | [§2.12](https://spec.graphql.org/draft/#sec-Type-References) | ✓ 114 |
| Directives (`directives`) | MUST | [§2.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 112 |

## Validate

- **Capabilities:** deferred-items, idle, introspect, mutation, parse, subscription, uncoercible-results, validate
- **Cases:** 3028 submitted, 3028 distinct, 0 malformed
- **Vectors:** 3028 of 3100 graded (not graded: 52 custom-directives, 12 unspecified, 9 custom-scalar-literals)
- **Draft only:** 16 of the failing vectors (of 178 draft-only vectors) rely on grammar or rules only in the draft
- **Adapter problems:** none
- **Checker self-test:** passed (9 negative controls)
- **Run:** kit 71f0a24bdc40, 2026-11-15, strict

### Findings

<a id="validate-finding-1"></a>

#### 1. `singleRootField`: §5.2.4.1 Single Root Field isn't enforced: accepts documents that break only this rule; 2 of 46 rely on the draft

46 cases, in `operations` (40), `spec` (4), `random` (2). 2 of them rely on grammar or rules that are only in the draft, not in October 2021.

- Single Root Field (MUST, [§5.2.4.1](https://spec.graphql.org/draft/#sec-Single-Root-Field))

The shortest case, from `spec`:

```
input:    SingleRootField-spec-3: subscription sub { newMessage { body sender } disallowedSecondRootField }
response: {"valid":true,"errors":[]}
expected: invalid: SingleRootField ["sub"]
```

<a id="validate-finding-2"></a>

#### 2. `allVariableUsagesAreAllowed`: §5.8.5 All Variable Usages Are Allowed isn't enforced: accepts documents that break only this rule; 4 of 12 rely on the draft

12 cases, in `variables` (10), `spec` (2). 4 of them rely on grammar or rules that are only in the draft, not in October 2021.

- All Variable Usages Are Allowed (MUST, [§5.8.5](https://spec.graphql.org/draft/#sec-All-Variable-Usages-Are-Allowed))

The shortest case, from `spec`:

```
input:    [draft] AllVariableUsagesAreAllowed-spec-8: mutation addNullableCat($cat: CatInput) { addPet(pet: {cat: $cat}) { name } }
response: {"valid":true,"errors":[]}
expected: invalid: AllVariableUsagesAreAllowed ["cat"]
```

<a id="validate-finding-3"></a>

#### 3. `operationTypeExistence`: §5.2.1.1 Operation Type Existence isn't enforced: accepts documents that break only this rule; all rely on the draft

10 cases, in `operations` (10). All rely on grammar or rules that are only in the draft, not in October 2021.

- Operation Type Existence (MUST, [§5.2.1.1](https://spec.graphql.org/draft/#sec-Operation-Type-Existence))

The shortest case, from `operations`:

```
input:    [draft] OperationTypeExistence-8: query A { post { id } } mutation M { user { id } }
response: {"valid":true,"errors":[]}
expected: invalid: OperationTypeExistence ["mutation"]
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

#### 5. `acceptsValid`: rejects valid documents, all with the same error message; their invalid siblings break §5.8.5 All Variable Usages Are Allowed (3), §5.8.1 Variable Uniqueness (2), §5.8.3 All Variable Uses Defined (1), so the hints point at no one rule: the message says what the implementation objected to

6 cases, in `extra` (2), `variables` (2), `names` (1), `spec` (1).

Each rejected document is one edit from a document that breaks only `allVariableUsagesAreAllowed` or `variableUniqueness` or `allVariableUsesDefined`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `spec`:

```
problem:  Variable "booleanArg" of type "Boolean" used in position expecting type "Boolean!"
input:    AllVariableUsagesAreAllowed-spec-10: query booleanArgQueryWithDefault($booleanArg: Boolean) { arguments { optionalNonNullBooleanArgField(optionalBooleanArg: $booleanArg) } }
response: {"valid":false,"errors":[{"message":"Variable \"booleanArg\" of type \"Boolean\" used in position expecting type \"Boolean!\"","locations":[{"line":1,"column":34},{"line":3,"column":56}]}]}
expected: valid
```

### Every check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **(all draft only), (k draft only):** all, or k, of the n failing cases rely on grammar or rules that are only in the draft, not in the October 2021 edition. The symbol still gives the check's level.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | Result |
| --- | :---: | :---: | :---: |
| Executable Definitions (`executableDefinitions`) | MUST | [§5.1.1](https://spec.graphql.org/draft/#sec-Executable-Definitions) | ✓ 4 |
| Operation Type Existence (`operationTypeExistence`) | MUST | [§5.2.1.1](https://spec.graphql.org/draft/#sec-Operation-Type-Existence) | ✗ 10/12 (all draft only) |
| Operation Name Uniqueness (`operationNameUniqueness`) | MUST | [§5.2.2.1](https://spec.graphql.org/draft/#sec-Operation-Name-Uniqueness) | ✓ 6 |
| Lone Anonymous Operation (`loneAnonymousOperation`) | MUST | [§5.2.3.1](https://spec.graphql.org/draft/#sec-Lone-Anonymous-Operation) | ✓ 21 |
| Single Root Field (`singleRootField`) | MUST | [§5.2.4.1](https://spec.graphql.org/draft/#sec-Single-Root-Field) | ✗ 46/59 (2 draft only) |
| Field Selections (`fieldSelections`) | MUST | [§5.3.1](https://spec.graphql.org/draft/#sec-Field-Selections) | ✓ 23 |
| Field Selection Merging (`fieldSelectionMerging`) | MUST | [§5.3.2](https://spec.graphql.org/draft/#sec-Field-Selection-Merging) | ✓ 674 |
| Leaf Field Selections (`leafFieldSelections`) | MUST | [§5.3.3](https://spec.graphql.org/draft/#sec-Leaf-Field-Selections) | ✓ 35 |
| Argument Names (`argumentNames`) | MUST | [§5.4.1](https://spec.graphql.org/draft/#sec-Argument-Names) | ✓ 6 |
| Argument Uniqueness (`argumentUniqueness`) | MUST | [§5.4.2](https://spec.graphql.org/draft/#sec-Argument-Uniqueness) | ✓ 5 |
| Required Arguments (`requiredArguments`) | MUST | [§5.4.3](https://spec.graphql.org/draft/#sec-Required-Arguments) | ✓ 11 |
| Fragment Name Uniqueness (`fragmentNameUniqueness`) | MUST | [§5.5.1.1](https://spec.graphql.org/draft/#sec-Fragment-Name-Uniqueness) | ✓ 10 |
| Fragment Spread Type Existence (`fragmentSpreadTypeExistence`) | MUST | [§5.5.1.2](https://spec.graphql.org/draft/#sec-Fragment-Spread-Type-Existence) | ✓ 12 |
| Fragments on Object, Interface or Union Types (`fragmentsOnObjectInterfaceOrUnionTypes`) | MUST | [§5.5.1.3](https://spec.graphql.org/draft/#sec-Fragments-on-Object-Interface-or-Union-Types) | ✓ 13 |
| Fragments Must Be Used (`fragmentsMustBeUsed`) | MUST | [§5.5.1.4](https://spec.graphql.org/draft/#sec-Fragments-Must-Be-Used) | ✓ 77 |
| Fragment Spread Target Defined (`fragmentSpreadTargetDefined`) | MUST | [§5.5.2.1](https://spec.graphql.org/draft/#sec-Fragment-Spread-Target-Defined) | ✓ 9 |
| Fragment Spreads Must Not Form Cycles (`fragmentSpreadsMustNotFormCycles`) | MUST | [§5.5.2.2](https://spec.graphql.org/draft/#sec-Fragment-Spreads-Must-Not-Form-Cycles) | ✓ 54 |
| Fragment Spread Is Possible (`fragmentSpreadIsPossible`) | MUST | [§5.5.2.3](https://spec.graphql.org/draft/#sec-Fragment-Spread-Is-Possible) | ✓ 36 |
| Values of Correct Type (`valuesOfCorrectType`) | MUST | [§5.6.1](https://spec.graphql.org/draft/#sec-Values-of-Correct-Type) | ✓ 280 |
| Input Object Field Names (`inputObjectFieldNames`). every document that breaks this rule also breaks §5.6.1 Values of Correct Type, which subsumes it, so a rejection can't be credited to this rule; accepting one fails both | MUST | [§5.6.2](https://spec.graphql.org/draft/#sec-Input-Object-Field-Names) | ⊂ |
| Input Object Field Uniqueness (`inputObjectFieldUniqueness`) | MUST | [§5.6.3](https://spec.graphql.org/draft/#sec-Input-Object-Field-Uniqueness) | ✓ 6 |
| Input Object Required Fields (`inputObjectRequiredFields`). every document that breaks this rule also breaks §5.6.1 Values of Correct Type, which subsumes it, so a rejection can't be credited to this rule; accepting one fails both | MUST | [§5.6.4](https://spec.graphql.org/draft/#sec-Input-Object-Required-Fields) | ⊂ |
| Directives Are Defined (`directivesAreDefined`) | MUST | [§5.7.1](https://spec.graphql.org/draft/#sec-Directives-Are-Defined) | ✓ 23 |
| Directives Are in Valid Locations (`directivesAreInValidLocations`) | MUST | [§5.7.2](https://spec.graphql.org/draft/#sec-Directives-Are-in-Valid-Locations) | ✓ 22 |
| Directives Are Unique per Location (`directivesAreUniquePerLocation`) | MUST | [§5.7.3](https://spec.graphql.org/draft/#sec-Directives-Are-Unique-per-Location) | ✗ 7/7 |
| Variable Uniqueness (`variableUniqueness`) | MUST | [§5.8.1](https://spec.graphql.org/draft/#sec-Variable-Uniqueness) | ✓ 6 |
| Variables Are Input Types (`variablesAreInputTypes`) | MUST | [§5.8.2](https://spec.graphql.org/draft/#sec-Variables-Are-Input-Types) | – |
| All Variable Uses Defined (`allVariableUsesDefined`) | MUST | [§5.8.3](https://spec.graphql.org/draft/#sec-All-Variable-Uses-Defined) | ✓ 14 |
| All Variables Used (`allVariablesUsed`) | MUST | [§5.8.4](https://spec.graphql.org/draft/#sec-All-Variables-Used) | ✓ 16 |
| All Variable Usages Are Allowed (`allVariableUsagesAreAllowed`) | MUST | [§5.8.5](https://spec.graphql.org/draft/#sec-All-Variable-Usages-Are-Allowed) | ✗ 12/635 (4 draft only) |
| Valid documents are accepted (`acceptsValid`) | MUST | [§5](https://spec.graphql.org/draft/#sec-Validation) | ✗ 6/954 |

- **Basis for `acceptsValid`:** a document is valid when it satisfies every rule of §5, and only invalid requests are kept from execution (§6.1.1); rejecting a valid document applies a rule the spec doesn't have

## Introspect

- **Capabilities:** deferred-items, idle, introspect, mutation, parse, subscription, uncoercible-results, validate
- **Cases:** 30 submitted, 30 distinct, 0 malformed
- **Vectors:** 30 of 39 graded (not graded: 9 custom-directives)
- **Profile:** the draft's introspection types. The draft's introspection query was rejected ("Unknown argument "includeDeprecated" on field "directives" of type "__Schema""). The introspection types lack __Directive.isDeprecated, __Directive.deprecationReason and __Schema.directives(includeDeprecated:), so this run asks the draft's query without them, grades against the draft, and counts what they lack once, under builtinDefinitions.
- **Adapter problems:** none
- **Checker self-test:** passed (176 negative controls)
- **Run:** kit 71f0a24bdc40, 2026-11-15, strict

### Findings

<a id="introspect-finding-1"></a>

#### 1. `builtinAdditions`, `builtinDefinitions`: the built-in @deprecated isn't as the spec defines it (directives); the built-in __Directive has a field the spec doesn't define; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues)

8 cases, in `minimal` (1), `interfaces` (1), `deprecation` (1), `inputDeprecation` (1), `roots` (1), `scalars` (1), `oneOf` (1), `order` (1). 2 of them rely on grammar or rules that are only in the draft, not in October 2021.

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `minimal.inc`:

```
problem:  added:fields at __Directive, directives at @deprecated, enumValues at __DirectiveLocation
input:    type Query { a: Int }  (the introspection query; includeDeprecated: true)
response: {"name":"deprecated","description":null,"isRepeatable":false,"locations":["FIELD_DEFINITION","ARGUMENT_DEFINITION","INPUT_FIELD_DEFINITION","ENUM_VALUE"],"args":[{"name":"reason","description":null,"type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"SCALAR","name":"String","ofType":null}},"defaultValue":"\"No longer supported\"","isDeprecated":false,"deprecationReason":null}]}
expected: [object Object]
```

<a id="introspect-finding-2"></a>

#### 2. `builtinDefinitions`: the built-in @deprecated isn't as the spec defines it (directives); the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues)

8 cases, in `minimal` (1), `interfaces` (1), `deprecation` (1), `inputDeprecation` (1), `roots` (1), `scalars` (1), `oneOf` (1), `order` (1). 2 of them rely on grammar or rules that are only in the draft, not in October 2021.

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `minimal.defaults`:

```
problem:  directives at @deprecated, enumValues at __DirectiveLocation
input:    type Query { a: Int }  (the introspection query; includeDeprecated: the default)
response: {"name":"deprecated","description":null,"isRepeatable":false,"locations":["FIELD_DEFINITION","ARGUMENT_DEFINITION","INPUT_FIELD_DEFINITION","ENUM_VALUE"],"args":[{"name":"reason","description":null,"type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"SCALAR","name":"String","ofType":null}},"defaultValue":"\"No longer supported\"","isDeprecated":false,"deprecationReason":null}]}
expected: [object Object]
```

<a id="introspect-finding-3"></a>

#### 3. `builtinDefinitions`: the introspection types lack __Directive.isDeprecated, __Directive.deprecationReason and __Schema.directives(includeDeprecated:), so the kit leaves them out of every query, and grades what it can see without them

1 case, in `discovery` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `discovery`:

```
problem:  __Directive.isDeprecated, __Directive.deprecationReason, __Schema.directives(includeDeprecated:)
input:    the fields of each introspection type, with their arguments (the kit's IntrospectionFields query)
response: {"data":{"a":{"fields":[{"name":"description","args":[]},{"name":"types","args":[]},{"name":"queryType","args":[]},{"name":"mutationType","args":[]},{"name":"subscriptionType","args":[]},{"name":"directives","args":[]}]},"b":{"fields":[{"name":"kind","args":[]},{"name":"name","args":[]},{"name":"description","args":[]},{"name":"specifiedByURL","args":[]},{"name":"fields","args":[{"name":"includeDeprecated"}]},{"name":"interfaces","args":[]},{"name":"possibleTypes","args":[]},{"name":"enumValues","args":[{"name":"includeDeprecated"}]},{"name":"inputFields","args":[{"name":"includeDeprecated"}]},{"name":"ofType","args":[]},{"name":"isOneOf","args":[]}]},"c":{"fields":[{"name":"name","args":[]},{"name":"description","args":[]},{"name":"args","args":[{"name":"includeDeprecated"}]},{"name":"type","args":[]},{"name":"isDeprecated","args":[]},{"name":"deprecationReason","args":[]}]},"d":{"fields":[{"name":"name","args":[]},{"name":"description","args":[]},{"name":"type","args":[]},{"name":"defaultValue","args":[]},{"name":"isDeprecated","args":[]},{"name":"deprecationReason","args":[]}]},"e":{"fields":[{"name":"name","args":[]},{"name":"description","args":[]},{"name":"isDeprecated","args":[]},{"name":"deprecationReason","args":[]}]},"f":{"fields":[{"name":"name","args":[]},{"name":"description","args":[]},{"name":"isRepeatable","args":[]},{"name":"locations","args":[]},{"name":"args","args":[{"name":"includeDeprecated"}]}]}}}
expected: the fields and arguments the spec defines, including __Directive.isDeprecated, __Directive.deprecationReason and __Schema.directives(includeDeprecated:)
```

<a id="introspect-finding-4"></a>

#### 4. `builtinAdditions`, `builtinDefinitions`, `defaultValue`: defaultValue is null for an input value without a default, and otherwise null or an encoding of the default: differs from Introspection.tla; the built-in @deprecated isn't as the spec defines it (directives); the built-in __Directive has a field the spec doesn't define; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues)

1 case, in `defaults` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- defaultValue is null for an input value without a default, and otherwise null or an encoding of the default (MUST, [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type))

The shortest case, from `defaults.inc`:

```
problem:  added:fields at __Directive, defaultValue at Query.f(s:), directives at @deprecated, enumValues at __DirectiveLocation
input:    enum E { X Y } input I { a: Int = 1, b: Int, c: [Int] = 1, e: E = Y, f: Float = 2 } type Query { f(x: [Int] = 1, y: Float = 1, z: ID = 7, w: [[Int]] = [1, 2], i: I = {b: 2}, s: String = "say \"hi\"", n: Int = null, l: [E!] = [X, Y]): Int }  (the introspection query; includeDeprecated: true)
response: {"kind":"OBJECT","name":"Query","description":null,"specifiedByURL":null,"isOneOf":null,"fields":[{"name":"f","description":null,"args":[{"name":"x","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}},"defaultValue":"1","isDeprecated":false,"deprecationReason":null},{"name":"y","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1","isDeprecated":false,"deprecationReason":null},{"name":"z","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"7","isDeprecated":false,"deprecationReason":null},{"name":"w","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}}},"defaultValue":"[1, 2]","isDeprecated":false,"deprecationReason":null},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"I","ofType":null},"defaultValue":"{b: 2}","isDeprecated":false,"deprecationReason":null},{"name":"s","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"say \"hi\"\"","isDeprecated":false,"deprecationReason":null},{"name":"n","description":null,"type":{"kind":"SCALAR","name":"Int","ofType":null},"defaultValue":"null","isDeprecated":false,"deprecationReason":null},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"ENUM","name":"E","ofType":null}}},"defaultValue":"[X, Y]","isDeprecated":false,"deprecationReason":null}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-5"></a>

#### 5. `builtinDefinitions`, `defaultValue`: defaultValue is null for an input value without a default, and otherwise null or an encoding of the default: differs from Introspection.tla; the built-in @deprecated isn't as the spec defines it (directives); the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues)

1 case, in `defaults` (1).

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- defaultValue is null for an input value without a default, and otherwise null or an encoding of the default (MUST, [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type))

The shortest case, from `defaults.defaults`:

```
problem:  defaultValue at Query.f(s:), directives at @deprecated, enumValues at __DirectiveLocation
input:    enum E { X Y } input I { a: Int = 1, b: Int, c: [Int] = 1, e: E = Y, f: Float = 2 } type Query { f(x: [Int] = 1, y: Float = 1, z: ID = 7, w: [[Int]] = [1, 2], i: I = {b: 2}, s: String = "say \"hi\"", n: Int = null, l: [E!] = [X, Y]): Int }  (the introspection query; includeDeprecated: the default)
response: {"kind":"OBJECT","name":"Query","description":null,"specifiedByURL":null,"isOneOf":null,"fields":[{"name":"f","description":null,"args":[{"name":"x","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}},"defaultValue":"1","isDeprecated":false,"deprecationReason":null},{"name":"y","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1","isDeprecated":false,"deprecationReason":null},{"name":"z","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"7","isDeprecated":false,"deprecationReason":null},{"name":"w","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}}},"defaultValue":"[1, 2]","isDeprecated":false,"deprecationReason":null},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"I","ofType":null},"defaultValue":"{b: 2}","isDeprecated":false,"deprecationReason":null},{"name":"s","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"say \"hi\"\"","isDeprecated":false,"deprecationReason":null},{"name":"n","description":null,"type":{"kind":"SCALAR","name":"Int","ofType":null},"defaultValue":"null","isDeprecated":false,"deprecationReason":null},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"ENUM","name":"E","ofType":null}}},"defaultValue":"[X, Y]","isDeprecated":false,"deprecationReason":null}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-6"></a>

#### 6. `defaultValue`: defaultValue is null for an input value without a default, and otherwise null or an encoding of the default: differs from Introspection.tla

1 case, in `defaults` (1).

- defaultValue is null for an input value without a default, and otherwise null or an encoding of the default (MUST, [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type))

The shortest case, from `defaults.lookup`:

```
problem:  defaultValue at Query.f(s:)
input:    enum E { X Y } input I { a: Int = 1, b: Int, c: [Int] = 1, e: E = Y, f: Float = 2 } type Query { f(x: [Int] = 1, y: Float = 1, z: ID = 7, w: [[Int]] = [1, 2], i: I = {b: 2}, s: String = "say \"hi\"", n: Int = null, l: [E!] = [X, Y]): Int }  (__type(name:) for Query, I, Unknown; includeDeprecated: true)
response: {"__type(name: \"Query\")":{"kind":"OBJECT","name":"Query","description":null,"specifiedByURL":null,"isOneOf":null,"fields":[{"name":"f","description":null,"args":[{"name":"x","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}},"defaultValue":"1","isDeprecated":false,"deprecationReason":null},{"name":"y","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1","isDeprecated":false,"deprecationReason":null},{"name":"z","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"7","isDeprecated":false,"deprecationReason":null},{"name":"w","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}}},"defaultValue":"[1, 2]","isDeprecated":false,"deprecationReason":null},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"I","ofType":null},"defaultValue":"{b: 2}","isDeprecated":false,"deprecationReason":null},{"name":"s","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"say \"hi\"\"","isDeprecated":false,"deprecationReason":null},{"name":"n","description":null,"type":{"kind":"SCALAR","name":"Int","ofType":null},"defaultValue":"null","isDeprecated":false,"deprecationReason":null},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"ENUM","name":"E","ofType":null}}},"defaultValue":"[X, Y]","isDeprecated":false,"deprecationReason":null}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}}
expected: [object Object]
```

### Every check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **(all draft only), (k draft only):** all, or k, of the n failing cases rely on grammar or rules that are only in the draft, not in the October 2021 edition. The symbol still gives the check's level.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | Result |
| --- | :---: | :---: | :---: |
| The response is a well-formed execution result: data, errors only as a non-empty list, extensions a map, nothing else (`envelope`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ 30 |
| The query executes, and its result has exactly the fields it selects, nulls included (`executes`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 30 |
| queryType, mutationType and subscriptionType are the root operation types (`roots`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✓ 18 |
| types is the set of all named types (`types`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) | ✓ 18 |
| types has the built-in scalars the schema references, and no others (`builtinScalars`) | MUST | [§3.5](https://spec.graphql.org/draft/#sec-Scalars) [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) | ✓ 18 |
| __type(name:) returns the named type, and null for a name the schema doesn't have (`typeByName`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 11 |
| Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (`typeKinds`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) | ✓ 30 |
| An object's or interface's fields, with their types (`fields`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) | ✓ 29 |
| Field and directive arguments, with their types (`arguments`) | MUST | [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) | ✓ 29 |
| defaultValue is null for an input value without a default, and otherwise null or an encoding of the default (`defaultValue`) | MUST | [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | ✗ 3/29 |
| defaultValue encodes the default value of an input value that has one, rather than returning null (`defaultValueOmitted`) | SHOULD | [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | ✓ 29 |
| An input object's inputFields, with their types (`inputFields`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | ✓ 29 |
| An enum's enumValues (`enumValues`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) | ✓ 29 |
| interfaces, and possibleTypes for unions and interfaces (`interfaces`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) | ✓ 29 |
| isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something (`deprecation`) | MUST (Oct 2021: fields and enum values only) | [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✓ 29 |
| specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null (`specifiedByURL`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) | ✓ 29 |
| isOneOf is true exactly for OneOf input objects (`isOneOf`). Draft only: October 2021 has no OneOf input objects. | MUST (draft only) | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 29 |
| A description the document gives is returned as it is, the schema's included (`descriptions`) | SHOULD | [§3.2](https://spec.graphql.org/draft/#sec-Type-System-Descriptions) [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 29 |
| directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types (`directives`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 18 |
| @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (`builtinDirectives`) | SHOULD | [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.1](https://spec.graphql.org/draft/#sec-skip) [§3.13.2](https://spec.graphql.org/draft/#sec-include) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) [§3.13.5](https://spec.graphql.org/draft/#sec-oneOf) | ✓ 18 |
| The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (`builtinDefinitions`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 19/30 (5 draft only) |
| The fields of the introspection types have the Non-Null wrapping the spec gives them (`builtinNullability`) | SHOULD | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 29 |
| The introspection types have no field, argument, enum value or type the spec doesn't define (`builtinAdditions`) | INFO | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | i 9/29 (2 draft only) |
| Under the October 2021 profile, a built-in definition that differs from October 2021's is as the draft defines it (`builtinEdition`). Graded only under the October 2021 profile. | INFO | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | – |
| __typename names the root type, and no fields list includes it (`typename`) | MUST | [§4.1](https://spec.graphql.org/draft/#sec-Type-Name-Introspection) | ✓ 29 |
| Fields, arguments, enum values, directives, members and interfaces come in source order (`order`). Draft only: October 2021 has no Stable Ordering. | SHOULD (draft only) | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 29 |
| Anything else Introspection!Matches requires (`other`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 29 |

- **Basis for `defaultValueOmitted`:** §4.2.4: "defaultValue may return a String encoding (using the GraphQL language) of the default value used by this input value in the condition a value is not provided at runtime. If this input value has no default value, returns null." By Appendix A, a lowercase "may" keeps its RFC 2119 meaning, so the encoding is optional; the intent is plainly that a default is encoded, which makes this a SHOULD. A string that isn't an encoding of the default, or one for an input value without a default, still fails defaultValue.
- **Basis for `descriptions`:** §3.2: documentation is "written immediately alongside definitions in a TypeSystemDocument and made available via introspection", which has no key word, and §4.2 says of every description field that it "may return a String or null". So a description the document gives that is lost or replaced fails this SHOULD, and any description is accepted for a definition the document doesn't describe ("" or one of the service's own included).
- **Basis for `builtinNullability`:** The types of the introspection fields are given only by the definitions §4.2 introduces with "Below are the full set of type system definitions providing schema introspection, which are fully defined in the sections below", which has no key word. The sections below say what each field returns ("isRepeatable must return a Boolean"), and a field whose type differs only in Non-Null can still return exactly that. Any other change of type stays under builtinDefinitions, a MUST.
- **Basis for `builtinAdditions`:** No sentence of §4 forbids extending the introspection types. The nearest is "Below are the full set of type system definitions providing schema introspection, which are fully defined in the sections below", which uses no key word, and Appendix A says "A conforming implementation of GraphQL may provide additional functionality, but must not do so where explicitly disallowed". Leaving out or changing a definition stays a MUST, under builtinDefinitions.
- **Basis for `builtinEdition`:** The kit grades against the draft; the October 2021 profile is a fallback for a service whose introspection types the draft's query can't ask. A built-in definition (or an addition) that is exactly the draft's breaks nothing the draft requires, so it is reported here, not under builtinDefinitions or builtinAdditions.
