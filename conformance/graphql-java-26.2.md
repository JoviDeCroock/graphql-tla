# graphql-java 26.2

Generated from the conformance kit's reports. Back to the [sheet](README.md).

## execution

- **Capabilities:** error-propagation-off, idle, invalid-results, mutation, subscription
- **Cases:** 11726 submitted, 1955 distinct, 1338 malformed
- **Checker self-test:** passed (17 negative controls)
- **Strict (SHOULDs fail):** yes

| Check | Level | Spec | Status | Cases | Failing |
| --- | --- | --- | --- | --- | --- |
| The response is sent only once execution is complete (`complete`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ pass | 1955 | 0 |
| data is the completed value: field collection, value completion and null propagation (`dataMatches`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ pass | 1955 | 0 |
| Response keys are in collected field order (`keyOrder`) | SHOULD | [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering) | ✓ pass | 1955 | 0 |
| Every error was raised, at the path where it was raised (`errorsWereRaised`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ pass | 1955 | 0 |
| No two errors share a response path (`errorPathsUnique`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ pass | 1955 | 0 |
| Every error is inside a null in data (`errorsInsideNulls`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ pass | 1955 | 0 |
| Every null an error caused comes with an error from its cause (`nullsExplained`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ pass | 1955 | 0 |
| A mutation reports every error its earlier root fields raised (`serialErrorsKept`) | MUST | [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ pass | 45 | 0 |
| A mutation's root fields execute one after another (`calledSerially`) | MUST | [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) | ✓ pass | 45 | 0 |
| Each field is executed once, merged selections included (`callsOnce`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) | ✓ pass | 11726 | 0 |
| Only fields the operation selects are executed (`callsSelected`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) | ✓ pass | 11726 | 0 |
| data holds only positions the operation selects (`dataShape`) | MUST | [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ pass | 6209 | 0 |
| Leaf values are the resolver's value, result-coerced (`leafValues`) | MUST | [§3.5](https://spec.graphql.org/draft/#sec-Scalars) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ pass | 6209 | 0 |
| An execution result has a data entry (`dataPresent`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✗ 1338 fail | 11726 | 1338 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ pass | 11726 | 0 |
| The response has no entries besides data, errors and extensions (`additionalEntries`) | MUST | [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ pass | 11726 | 0 |
| extensions is a map (`extensions`) | MUST | [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) | – untested | 0 | 0 |
| Errors are maps with a message, and well-formed locations and extensions (`errorFormat`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ pass | 10051 | 0 |
| Execution errors have a path to a position the operation selects (`errorPath`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✗ 1338 fail | 10051 | 1338 |
| Paths use field names and integer list indices (`responsePosition`) | MUST | [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) | ✓ pass | 1334 | 0 |
| Errors have no entries besides message, locations, path and extensions (`errorEntries`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ pass | 10051 | 0 |
| The adapter follows the kit's protocol (call types, settles) (`protocol`) | ADAPTER | — | ✓ pass | 11726 | 0 |

| Fixture | Status | Cases | Note |
| --- | --- | --- | --- |
| [`fragments`](../fixtures/fragments.graphql) | pass | 1576 |  |
| [`lists`](../fixtures/lists.graphql) | pass | 1914 |  |
| [`mutation`](../fixtures/mutation.graphql) | pass | 1590 |  |
| [`noPropagation`](../fixtures/noPropagation.graphql) | pass | 1602 |  |
| [`nullPropagation`](../fixtures/nullPropagation.graphql) | pass | 1782 |  |
| [`subscription`](../fixtures/subscription.graphql) | fail | 1522 |  |
| [`unions`](../fixtures/unions.graphql) | pass | 1740 |  |

### What it breaks

#### An execution result has a data entry (`dataPresent`, MUST, [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

1338 cases of 11726. The shortest:

```
fixture:  subscription
problem:  the response has no data entry (§7.1.1: execution started, so data must be present)
trace:    call postLiked; settle postLiked = null
response: {"errors":[{"message":"response stream error: The field at path '/postLiked' was declared as a non null type, but the code involved in retrieving data has wrongly returned a null value.  The graphql specification requires that the parent field be set to null, or if that is non nullable that it bubble up null to its parent and so on. The non-nullable type is 'Post' within parent type 'Subscription'"}]}
```

#### Execution errors have a path to a position the operation selects (`errorPath`, MUST, [§7.1.6](https://spec.graphql.org/draft/#sec-Errors))

1338 cases of 10051. The shortest:

```
fixture:  subscription
problem:  an execution error without a path: {"message":"response stream error: The field at path '/postLiked' was declared as a non null type, but the code involved in retrieving data has wrongly returned a null value.  The graphql specification requires that the parent field be set to null, or if that is non nullable that it bubble up null to its parent and so on. The non-nullable type is 'Post' within parent type 'Subscription'"}
trace:    call postLiked; settle postLiked = null
response: {"errors":[{"message":"response stream error: The field at path '/postLiked' was declared as a non null type, but the code involved in retrieving data has wrongly returned a null value.  The graphql specification requires that the parent field be set to null, or if that is non nullable that it bubble up null to its parent and so on. The non-nullable type is 'Post' within parent type 'Subscription'"}]}
```
