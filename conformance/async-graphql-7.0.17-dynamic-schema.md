# async-graphql 7.0.17 (dynamic schema)

Generated from the conformance kit's reports. Back to the [sheet](README.md).

## execution

- **Capabilities:** idle, invalid-results, mutation, subscription
- **Cases:** 9674 submitted, 482 distinct, 4432 malformed
- **Checker self-test:** passed (17 negative controls)
- **Strict (SHOULDs fail):** yes

| Check | Level | Spec | Status | Cases | Failing |
| --- | --- | --- | --- | --- | --- |
| The response is sent only once execution is complete (`complete`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✗ 32 fail | 482 | 32 |
| data is the completed value: field collection, value completion and null propagation (`dataMatches`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✗ 292 fail | 482 | 292 |
| Response keys are in collected field order (`keyOrder`) | SHOULD | [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering) | ✓ pass | 482 | 0 |
| Every error was raised, at the path where it was raised (`errorsWereRaised`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✗ 95 fail | 482 | 95 |
| No two errors share a response path (`errorPathsUnique`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ pass | 482 | 0 |
| Every error is inside a null in data (`errorsInsideNulls`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✗ 5 fail | 482 | 5 |
| Every null an error caused comes with an error from its cause (`nullsExplained`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✗ 176 fail | 482 | 176 |
| A mutation reports every error its earlier root fields raised (`serialErrorsKept`) | MUST | [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ pass | 11 | 0 |
| A mutation's root fields execute one after another (`calledSerially`) | MUST | [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) | ✓ pass | 11 | 0 |
| Each field is executed once, merged selections included (`callsOnce`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) | ✗ 101 fail | 9674 | 101 |
| Only fields the operation selects are executed (`callsSelected`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) | ✓ pass | 9674 | 0 |
| data holds only positions the operation selects (`dataShape`) | MUST | [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ pass | 1668 | 0 |
| Leaf values are the resolver's value, result-coerced (`leafValues`) | MUST | [§3.5](https://spec.graphql.org/draft/#sec-Scalars) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ pass | 1668 | 0 |
| An execution result has a data entry (`dataPresent`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ pass | 9674 | 0 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ pass | 9674 | 0 |
| The response has no entries besides data, errors and extensions (`additionalEntries`) | MUST | [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ pass | 9674 | 0 |
| extensions is a map (`extensions`) | MUST | [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) | – untested | 0 | 0 |
| Errors are maps with a message, and well-formed locations and extensions (`errorFormat`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ pass | 8006 | 0 |
| Execution errors have a path to a position the operation selects (`errorPath`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✗ 4376 fail | 8006 | 4376 |
| Paths use field names and integer list indices (`responsePosition`) | MUST | [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) | ✓ pass | 598 | 0 |
| Errors have no entries besides message, locations, path and extensions (`errorEntries`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ pass | 8006 | 0 |
| The adapter follows the kit's protocol (call types, settles) (`protocol`) | ADAPTER | — | ✗ 101 fail | 9674 | 101 |

| Fixture | Status | Cases | Note |
| --- | --- | --- | --- |
| [`fragments`](../fixtures/fragments.graphql) | fail | 1540 |  |
| [`lists`](../fixtures/lists.graphql) | fail | 1918 |  |
| [`mutation`](../fixtures/mutation.graphql) | fail | 1542 |  |
| [`noPropagation`](../fixtures/noPropagation.graphql) | skipped | 0 | needs error-propagation-off |
| [`nullPropagation`](../fixtures/nullPropagation.graphql) | fail | 1538 |  |
| [`subscription`](../fixtures/subscription.graphql) | fail | 1522 |  |
| [`unions`](../fixtures/unions.graphql) | fail | 1614 |  |

### What it breaks

#### The response is sent only once execution is complete (`complete`, MUST, [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

32 cases of 482. The shortest:

```
fixture:  lists
trace:    call posts; call tags; settle posts = list(1); call posts.0; settle posts.0 = object(Post); call posts.0.title; settle posts.0.title = null
response: {"data":null,"errors":[{"message":"internal: non-null types require a return value","locations":[{"line":3,"column":5}],"path":["posts",0,"title"]}]}
expected: data (incomplete)
```

#### data is the completed value: field collection, value completion and null propagation (`dataMatches`, MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))

292 cases of 482. The shortest:

```
fixture:  fragments
trace:    call node; settle node = object(Bot); call node.id; settle node.id = null
response: {"data":null,"errors":[{"message":"internal: non-null types require a return value","locations":[{"line":3,"column":5}],"path":["node","id"]}]}
expected: data {"node": null}
```

#### Every error was raised, at the path where it was raised (`errorsWereRaised`, MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors))

95 cases of 482. The shortest:

```
fixture:  lists
trace:    call posts; call tags; settle posts = list(1); call posts.0; settle posts.0 = null; call posts.0.title; settle tags = list(0); settle posts.0.title = null
response: {"data":null,"errors":[{"message":"internal: non-null types require a return value","locations":[{"line":3,"column":5}],"path":["posts",0,"title"]}]}
expected: data {"posts": null, "tags": []}
```

#### Every error is inside a null in data (`errorsInsideNulls`, MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))

5 cases of 482. The shortest:

```
fixture:  unions
trace:    call search; call matrix; settle search = null; settle matrix = list(1); call matrix.0; settle matrix.0 = null
response: {"data":null,"errors":[{"message":"internal: expects an array","locations":[{"line":11,"column":3}],"path":["matrix",0]}]}
expected: data {"search": null, "matrix": [null]}
```

#### Every null an error caused comes with an error from its cause (`nullsExplained`, MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

176 cases of 482. The shortest:

```
fixture:  lists
trace:    call posts; call tags; settle posts = list(1); call posts.0; settle posts.0 = null; call posts.0.title; settle tags = list(0); settle posts.0.title = null
response: {"data":null,"errors":[{"message":"internal: non-null types require a return value","locations":[{"line":3,"column":5}],"path":["posts",0,"title"]}]}
expected: data {"posts": null, "tags": []}
```

#### Each field is executed once, merged selections included (`callsOnce`, MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields))

101 cases of 9674. The shortest:

```
fixture:  fragments
problem:  the resolver at node.id was called twice (§6.3.3 executes each field once)
trace:    call node; settle node = object(User); call node.id; settle node.id = leaf; call node.name; settle node.name = null; call node.id; settle node.id = null
response: {"data":null,"errors":[{"message":"internal: non-null types require a return value","locations":[{"line":19,"column":3}],"path":["node","id"]}]}
```

#### Execution errors have a path to a position the operation selects (`errorPath`, MUST, [§7.1.6](https://spec.graphql.org/draft/#sec-Errors))

4376 cases of 8006. The shortest:

```
fixture:  fragments
problem:  an execution error without a path: {"message":"resolver at node failed","locations":[{"line":2,"column":3}]}
trace:    call node; settle node = error
response: {"data":null,"errors":[{"message":"resolver at node failed","locations":[{"line":2,"column":3}]}]}
```

#### The adapter follows the kit's protocol (call types, settles) (`protocol`, ADAPTER, the kit's protocol)

101 cases of 9674. The shortest:

```
fixture:  fragments
problem:  node.id settled twice
trace:    call node; settle node = object(User); call node.id; settle node.id = leaf; call node.name; settle node.name = null; call node.id; settle node.id = null
response: {"data":null,"errors":[{"message":"internal: non-null types require a return value","locations":[{"line":19,"column":3}],"path":["node","id"]}]}
```
