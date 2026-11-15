# Hot Chocolate 15.1.21

Generated from the conformance kit's reports. Back to the [sheet](README.md).

**Notes** (hand-written, from outside the kit):

- The sheet runs the adapter with `--idle`, which claims `idle` by waiting for .NET's thread pool to go quiet: runtime behaviour, not something Hot Chocolate promises. The kit's determinism replay passed, and a run without `--idle` (grace-based, random runs only) found the same failures. See the [adapter's README](../adapters/hotchocolate/README.md).
- Both findings are described, with source locations and a standalone reproduction, in the [adapter's README](../adapters/hotchocolate/README.md#known-hot-chocolate-deviations).

## Execution

- **Capabilities:** idle, invalid-results, mutation, subscription, uncoercible-results
- **Cases:** 11972 submitted, 2189 distinct, 384 malformed
- **Adapter problems:** none
- **Checker self-test:** passed (25 negative controls)
- **Run:** kit f0039322bf59, 2026-11-15, strict, 1500 random runs per fixture (seed 1), exhaustive runs on

### Findings

<a id="finding-1"></a>

#### 1. `resultCoercion`: count is 1, though its resolver returned a value its type can't represent, which must raise an execution error

343 cases, in `leaves` (343).

- A leaf value its type can't represent (a fraction for an Int, a non-finite Float, an unknown enum value) raises an execution error (MUST, [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion))

The shortest case, from `leaves`:

```
problem:  count is 1, though its resolver returned a value its type can't represent, which must raise an execution error
trace:    call count; call ratio; call color; settle count = uncoercible; settle ratio = null; settle color = null
response: {"data":{"count":1,"ratio":null,"color":null}}
```

<a id="finding-2"></a>

#### 2. `nullsExplained`

94 cases, in `lists` (58), `unions` (36).

- Every null an error caused comes with an error from its cause (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `lists`:

```
trace:    call posts; call tags; settle posts = list(1); call posts.0; settle posts.0 = null; settle tags = list(0)
response: {"data":{"posts":null,"tags":[]}}
expected: data {"posts": null, "tags": []}
```

<a id="finding-3"></a>

#### 3. `resultCoercion`: … is 1, though its resolver returned a value its type can't represent, which must raise an execution error

41 cases, in `unions` (41).

- A leaf value its type can't represent (a fraction for an Int, a non-finite Float, an unknown enum value) raises an execution error (MUST, [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion))

The shortest case, from `unions`:

```
problem:  matrix.0.0 is 1, though its resolver returned a value its type can't represent, which must raise an execution error
trace:    call search; call matrix; settle search = null; settle matrix = list(1); call matrix.0; settle matrix.0 = list(1); call matrix.0.0; settle matrix.0.0 = uncoercible
response: {"data":{"search":null,"matrix":[[1]]}}
```

### Every check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | Result |
| --- | :---: | :---: | :---: |
| The response is sent only once execution is complete (`complete`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 2189 |
| data is the completed value: field collection, value completion and null propagation (`dataMatches`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2189 |
| Response keys are in collected field order (`keyOrder`) | SHOULD | [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering) | ✓ 2189 |
| Every error was raised, at the path where it was raised (`errorsWereRaised`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 2189 |
| No two errors share a response path (`errorPathsUnique`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2189 |
| Every error is inside a null in data (`errorsInsideNulls`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2189 |
| Every null an error caused comes with an error from its cause (`nullsExplained`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✗ 94/2189 |
| A mutation reports every error its earlier root fields raised (`serialErrorsKept`) | MUST | [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 125 |
| A mutation's root fields execute one after another (`calledSerially`) | MUST | [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) | ✓ 125 |
| Each field is executed once, merged selections included (`callsOnce`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) | ✓ 11972 |
| Only fields the operation selects are executed (`callsSelected`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) | ✓ 11972 |
| A field executes only once its parent has a value that contains it (`callsReachable`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 11972 |
| A request gets a response (`responds`) | MUST | [§7.1](https://spec.graphql.org/draft/#sec-Response-Format) | ✓ 11972 |
| A subscription event yields an execution result, even when its data is null (`eventYieldsResult`) | MUST | [§6.2.3.2](https://spec.graphql.org/draft/#sec-Response-Stream) | ✓ 1522 |
| data holds only positions the operation selects (`dataShape`) | MUST | [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ 6275 |
| A leaf value its type can't represent (a fraction for an Int, a non-finite Float, an unknown enum value) raises an execution error (`resultCoercion`) | MUST | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✗ 384/926 |
| Leaf values are the resolver's canonical value (Int 1, Float 1.5, Boolean true, an enum's first value, "v") (`leafValues`) | MUST | [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 6275 |
| An execution result has a data entry (`dataPresent`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 11972 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 11972 |
| The response has no entries besides data, errors and extensions (`additionalEntries`) | MUST | [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ 11972 |
| extensions is a map (`extensions`) | MUST | [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) | – |
| Errors are maps with a message, and well-formed locations and extensions (`errorFormat`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 9964 |
| Execution errors have a path to a position the operation selects (`errorPath`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 9964 |
| Paths use field names and integer list indices (`responsePosition`) | MUST (Oct 2021: SHOULD) | [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) | ✓ 775 |
| Errors have no entries besides message, locations, path and extensions (`errorEntries`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 9964 |
| The adapter follows the kit's protocol (call types, settles) (`protocol`) | ADAPTER | — | ✓ 11972 |

- **`serialErrorsKept`** is implied rather than stated: §6.4.4: an execution error "must be added to the errors list". §6.3.3 lets an implementation cancel fields that have not yet executed or yielded a value, but §6.3.4 completes each mutation root field before the next starts, so an earlier root field's errors can't have been cancelled.

### Fixtures

| Fixture | Result | Note |
| --- | :---: | :---: |
| [`fragments`](../fixtures/fragments.graphql) | ✓ 1576 |  |
| [`leaves`](../fixtures/leaves.graphql) | ✗ 343/1700 |  |
| [`lists`](../fixtures/lists.graphql) | ✗ 58/1878 |  |
| [`mutation`](../fixtures/mutation.graphql) | ✓ 1750 |  |
| [`noPropagation`](../fixtures/noPropagation.graphql) | – | needs error-propagation-off |
| [`nullPropagation`](../fixtures/nullPropagation.graphql) | ✓ 1782 |  |
| [`subscription`](../fixtures/subscription.graphql) | ✓ 1522 |  |
| [`unions`](../fixtures/unions.graphql) | ✗ 77/1764 |  |
