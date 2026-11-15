# graphql-js 17.1.0

Generated from the conformance kit's reports. Back to the [sheet](README.md).

## execution

- **Capabilities:** deferred-items, error-propagation-off, idle, invalid-results, mutation, subscription
- **Cases:** 11662 submitted, 1930 distinct, 0 malformed
- **Checker self-test:** passed (17 negative controls)
- **Strict (SHOULDs fail):** yes

| Check | Level | Spec | Status | Cases | Failing |
| --- | --- | --- | --- | --- | --- |
| The response is sent only once execution is complete (`complete`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ pass | 1930 | 0 |
| data is the completed value: field collection, value completion and null propagation (`dataMatches`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ pass | 1930 | 0 |
| Response keys are in collected field order (`keyOrder`) | SHOULD | [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering) | ✓ pass | 1930 | 0 |
| Every error was raised, at the path where it was raised (`errorsWereRaised`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ pass | 1930 | 0 |
| No two errors share a response path (`errorPathsUnique`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ pass | 1930 | 0 |
| Every error is inside a null in data (`errorsInsideNulls`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ pass | 1930 | 0 |
| Every null an error caused comes with an error from its cause (`nullsExplained`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ pass | 1930 | 0 |
| A mutation reports every error its earlier root fields raised (`serialErrorsKept`) | MUST | [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ pass | 45 | 0 |
| A mutation's root fields execute one after another (`calledSerially`) | MUST | [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) | ✓ pass | 45 | 0 |
| Each field is executed once, merged selections included (`callsOnce`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) | ✓ pass | 11662 | 0 |
| Only fields the operation selects are executed (`callsSelected`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) | ✓ pass | 11662 | 0 |
| data holds only positions the operation selects (`dataShape`) | MUST | [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ pass | 6397 | 0 |
| Leaf values are the resolver's value, result-coerced (`leafValues`) | MUST | [§3.5](https://spec.graphql.org/draft/#sec-Scalars) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ pass | 6397 | 0 |
| An execution result has a data entry (`dataPresent`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ pass | 11662 | 0 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ pass | 11662 | 0 |
| The response has no entries besides data, errors and extensions (`additionalEntries`) | MUST | [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ pass | 11662 | 0 |
| extensions is a map (`extensions`) | MUST | [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) | – untested | 0 | 0 |
| Errors are maps with a message, and well-formed locations and extensions (`errorFormat`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ pass | 10103 | 0 |
| Execution errors have a path to a position the operation selects (`errorPath`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ pass | 10103 | 0 |
| Paths use field names and integer list indices (`responsePosition`) | MUST | [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) | ✓ pass | 1433 | 0 |
| Errors have no entries besides message, locations, path and extensions (`errorEntries`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ pass | 10103 | 0 |
| The adapter follows the kit's protocol (call types, settles) (`protocol`) | ADAPTER | — | ✓ pass | 11662 | 0 |

| Fixture | Status | Cases | Note |
| --- | --- | --- | --- |
| [`fragments`](../fixtures/fragments.graphql) | pass | 1536 |  |
| [`lists`](../fixtures/lists.graphql) | pass | 2002 |  |
| [`mutation`](../fixtures/mutation.graphql) | pass | 1590 |  |
| [`noPropagation`](../fixtures/noPropagation.graphql) | pass | 1602 |  |
| [`nullPropagation`](../fixtures/nullPropagation.graphql) | pass | 1662 |  |
| [`subscription`](../fixtures/subscription.graphql) | pass | 1518 |  |
| [`unions`](../fixtures/unions.graphql) | pass | 1752 |  |
