# Hot Chocolate 15.1.21

Generated from the conformance kit's reports. Back to the [sheet](README.md).

**Notes** (hand-written, from outside the kit):

- The sheet runs the adapter with `--idle`, which claims `idle` by waiting for .NET's thread pool to go quiet: runtime behaviour, not something Hot Chocolate promises. The kit's determinism replay passed, and a run without `--idle` (grace-based, random runs only) found the same failures. See the [adapter's README](../adapters/hotchocolate/README.md).
- The sheet also passes `--introspection-list-depth 2`, which raises Hot Chocolate's own introspection depth limit (`ValidationOptions`); with the default, Hot Chocolate refuses the kit's full introspection queries. For validate only, the adapter builds the kit's schema with `StrictValidation = false`, because Hot Chocolate refuses an interface with no implementation; that option affects schema checks, not document validation. See the [adapter's README](../adapters/hotchocolate/README.md).
- Both findings are described, with source locations and a standalone reproduction, in the [adapter's README](../adapters/hotchocolate/README.md#known-hot-chocolate-deviations).

## Execution

- **Capabilities:** coerce, custom-scalar-literals, exact-numbers, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 11972 submitted, 2189 distinct, 384 malformed
- **Adapter problems:** none
- **Checker self-test:** passed (35 negative controls)
- **Run:** kit 5da3deb09c91, 2026-11-15, strict, 1500 random runs per fixture (seed 1), exhaustive runs on

### Findings

<a id="execution-finding-1"></a>

#### 1. `intFraction`: count is 1, though its resolver returned a value its type can't represent, which should raise an execution error

343 cases, in `leaves` (343).

- A fraction returned for an Int (1.2) raises an execution error instead of being truncated (SHOULD, [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion))

The shortest case, from `leaves`:

```
problem:  count is 1, though its resolver returned a value its type can't represent, which should raise an execution error
trace:    call count; call ratio; call color; settle count = uncoercible; settle ratio = null; settle color = null
response: {"data":{"count":1,"ratio":null,"color":null}}
```

<a id="execution-finding-2"></a>

#### 2. `nullsExplained`

94 cases, in `lists` (58), `unions` (36).

- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `lists`:

```
trace:    call posts; call tags; settle posts = list(1); call posts.0; settle posts.0 = null; settle tags = list(0)
response: {"data":{"posts":null,"tags":[]}}
expected: data {"posts": null, "tags": []}
```

<a id="execution-finding-3"></a>

#### 3. `intFraction`: … is 1, though its resolver returned a value its type can't represent, which should raise an execution error

41 cases, in `unions` (41).

- A fraction returned for an Int (1.2) raises an execution error instead of being truncated (SHOULD, [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion))

The shortest case, from `unions`:

```
problem:  matrix.0.0 is 1, though its resolver returned a value its type can't represent, which should raise an execution error
trace:    call search; call matrix; settle search = null; settle matrix = list(1); call matrix.0; settle matrix.0 = list(1); call matrix.0.0; settle matrix.0.0 = uncoercible
response: {"data":{"search":null,"matrix":[[1]]}}
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
| The response is sent only once execution is complete (`complete`) | MUST | [§6.3.1](https://spec.graphql.org/draft/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ 2189 |
| data is the completed value: field collection, value completion and null propagation (`dataMatches`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2189 |
| Response keys are in collected field order (`keyOrder`) | SHOULD | [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering) | ✓ 2189 |
| Every error was raised, at the path where it was raised (`errorsWereRaised`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 2189 |
| No two errors share a response path (`errorPathsUnique`) | MUST (Oct 2021: SHOULD) | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2189 |
| Every error is inside a null in data (`errorsInsideNulls`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2189 |
| Every null an error caused comes with an error from one of its causes (`nullsExplained`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✗ 94/2189 |
| A mutation reports every error its earlier root fields raised (`serialErrorsKept`) | MUST | [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 125 |
| A mutation's root fields execute one after another (`calledSerially`) | MUST | [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) | ✓ 125 |
| Each field is executed once, merged selections included (`callsOnce`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) | ✓ 11972 |
| Only fields the operation selects are executed (`callsSelected`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) | ✓ 11972 |
| A field executes only once its parent has a value that contains it (`callsReachable`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 11972 |
| A request gets a response (`responds`) | MUST | [§7.1](https://spec.graphql.org/draft/#sec-Response-Format) | ✓ 11972 |
| A subscription event yields an execution result, even when its data is null (`eventYieldsResult`) | MUST | [§6.2.3.2](https://spec.graphql.org/draft/#sec-Response-Stream) | ✓ 1522 |
| data holds only positions the operation selects (`dataShape`) | MUST | [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ 6275 |
| A non-finite Float or an unknown enum value raises an execution error (`resultCoercion`) | MUST | [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 685 |
| A fraction returned for an Int (1.2) raises an execution error instead of being truncated (`intFraction`) | SHOULD | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ! 384/384 |
| Leaf values are the resolver's canonical value (Int 1, Float 1.5, Boolean true, an enum's first value, "v") (`leafValues`) | MUST | [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 6275 |
| Leaf values use the JSON type §7.2.1 gives their GraphQL type (a number for Int 1, not "1") (`leafEncoding`) | SHOULD | [§7.2.1](https://spec.graphql.org/draft/#sec-JSON-Serialization) | ✓ 6275 |
| An execution result has a data entry (`dataPresent`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 11972 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 11972 |
| The response has no entries besides data, errors and extensions (`additionalEntries`) | MUST | [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ 11972 |
| extensions is a map (`extensions`) | MUST | [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) | – |
| Errors are maps with a message, and extensions, if present, is a map (`errorFormat`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 9964 |
| An error's locations, if present, is a list of maps with line and column, both positive integers (`errorLocations`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 9964 |
| Execution errors have a path to a position the operation selects (`errorPath`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 9964 |
| Paths are lists of response names (aliases, not field names) and integer list indices (`responsePosition`) | MUST (Oct 2021: SHOULD) | [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) | ✓ 9964 |
| Errors have no entries besides message, locations, path and extensions (`errorEntries`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 9964 |
| The adapter follows the kit's protocol (call types, settles) (`protocol`) | ADAPTER | — | ✓ 11972 |
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
| [`fragments`](../fixtures/fragments.graphql) | ✓ 1576 |  |
| [`leaves`](../fixtures/leaves.graphql) | ! 343/1700 |  |
| [`lists`](../fixtures/lists.graphql) | ✗ 58/1878 |  |
| [`mutation`](../fixtures/mutation.graphql) | ✓ 1750 |  |
| [`noPropagation`](../fixtures/noPropagation.graphql) | – | needs error-propagation-off |
| [`nullPropagation`](../fixtures/nullPropagation.graphql) | ✓ 1782 |  |
| [`subscription`](../fixtures/subscription.graphql) | ✓ 1522 |  |
| [`unions`](../fixtures/unions.graphql) | ✗ 77/1764 |  |

## Parse

- **Capabilities:** coerce, custom-scalar-literals, exact-numbers, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 1983 submitted, 1983 distinct, 0 malformed
- **Draft only:** 67 of the failing vectors (of 105 draft-only vectors) rely on grammar or rules only in the draft
- **Adapter problems:** none
- **Checker self-test:** passed (4 negative controls)
- **Run:** kit 5da3deb09c91, 2026-11-15, strict

### Findings

<a id="parse-finding-1"></a>

#### 1. `descriptions`: rejects what §2.2 Descriptions accepts

57 cases, in `random-documents` (55), `parser-examples` (1), `variable-definitions` (1). 54 of them rely on grammar or rules that are only in the draft, not in October 2021.

- Descriptions on operations, fragments and variables, not on the query shorthand (MUST, [§2.2](https://spec.graphql.org/draft/#sec-Descriptions))

The shortest case, from `random-documents`:

```
input:    [draft] "\"\"\"\"\"\" mutation {﻿x1 }"
sibling:  "\"\"\"\"\"\" { {﻿x1 }", which the reference rejects
response: {"ok":false,"error":"Unexpected character `ï` (239)."}
expected: {"ok":true}
```

<a id="parse-finding-2"></a>

#### 2. `inlineFragments`: rejects what §2.9.2 Inline Fragments accepts

42 cases, in `random-documents` (42).

- Inline fragments (MUST, [§2.9.2](https://spec.graphql.org/draft/#sec-Inline-Fragments))

The shortest case, from `random-documents`:

```
input:    "{﻿... {,x1 ...﻿x1\r\n}\t}"
sibling:  "{﻿{ ...,x1 ...﻿x1\r\n}\t}", which the reference rejects
response: {"ok":false,"error":"Unexpected character `ï` (239)."}
expected: {"ok":true}
```

<a id="parse-finding-3"></a>

#### 3. `inputValues`: rejects what §2.10 Input Values accepts

36 cases, in `random-documents` (36).

- Input values, and no variables in constant values (MUST, [§2.10](https://spec.graphql.org/draft/#sec-Input-Values))

The shortest case, from `random-documents`:

```
input:    "{\r\nb﻿(﻿Foo : on ),{ #c\ntrue } }"
sibling:  "{\r\nb﻿(﻿Foo : ] ),{ #c\ntrue } }", which the reference rejects
response: {"ok":false,"error":"Unexpected character `ï` (239)."}
expected: {"ok":true}
```

<a id="parse-finding-4"></a>

#### 4. `listValue`: rejects what §2.10.7 List Value accepts

35 cases, in `random-documents` (35).

- List values (MUST, [§2.10.7](https://spec.graphql.org/draft/#sec-List-Value))

The shortest case, from `random-documents`:

```
input:    "{ mutation﻿(\r\nx1 #c\n: [ #c\n[,]\n]\r\n)﻿}"
sibling:  "{ mutation﻿(\r\nx1 #c\n: [ #c\n[,] =\n]\r\n)﻿}", which the reference rejects
response: {"ok":false,"error":"Unexpected character `ï` (239)."}
expected: {"ok":true}
```

<a id="parse-finding-5"></a>

#### 5. `inputObjectValues`: rejects what §2.10.8 Input Object Values accepts

35 cases, in `random-documents` (35).

- Input object values (MUST, [§2.10.8](https://spec.graphql.org/draft/#sec-Input-Object-Values))

The shortest case, from `random-documents`:

```
input:    "{\nx1 (\r\nFoo﻿:\t{\ttrue﻿:\r\n6.02E+23,} #c\n),}"
sibling:  "{\nx1 (\r\nFoo﻿:\t{\ttrue﻿: :\r\n6.02E+23,} #c\n),}", which the reference rejects
response: {"ok":false,"error":"Unexpected character `ï` (239)."}
expected: {"ok":true}
```

<a id="parse-finding-6"></a>

#### 6. `arguments`: rejects what §2.7 Arguments accepts

29 cases, in `random-documents` (29).

- Arguments (MUST, [§2.7](https://spec.graphql.org/draft/#sec-Arguments))

The shortest case, from `random-documents`:

```
input:    "{ x1\n(﻿false :﻿RED #c\n) }"
sibling:  "{ x1\n( (﻿false :﻿RED #c\n) }", which the reference rejects
response: {"ok":false,"error":"Unexpected character `ï` (239)."}
expected: {"ok":true}
```

<a id="parse-finding-7"></a>

#### 7. `directives`: rejects what §2.13 Directives accepts

27 cases, in `random-documents` (27).

- Directives (MUST, [§2.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `random-documents`:

```
input:    "{ null\ta﻿}"
response: {"ok":false,"error":"Unexpected character `ï` (239)."}
expected: {"ok":true}
```

<a id="parse-finding-8"></a>

#### 8. `variables`: rejects what §2.11 Variables accepts

25 cases, in `random-documents` (25).

- Variables and variable definitions (MUST, [§2.11](https://spec.graphql.org/draft/#sec-Variables))

The shortest case, from `random-documents`:

```
input:    "query {﻿true,( true\r\n:﻿$﻿_x )\t}"
sibling:  "query {﻿true,( true\r\n:﻿$ )\t}", which the reference rejects
response: {"ok":false,"error":"Unexpected character `ï` (239)."}
expected: {"ok":true}
```

<a id="parse-finding-9"></a>

#### 9. `typeConditions`: rejects what §2.9.1 Type Conditions accepts

24 cases, in `random-documents` (24).

- Type conditions (MUST, [§2.9.1](https://spec.graphql.org/draft/#sec-Type-Conditions))

The shortest case, from `random-documents`:

```
input:    "fragment﻿x1﻿on\ton\n{﻿x1﻿}"
sibling:  "fragment﻿x1﻿on on\ton\n{﻿x1﻿}", which the reference rejects
response: {"ok":false,"error":"Unexpected character `ï` (239)."}
expected: {"ok":true}
```

<a id="parse-finding-10"></a>

#### 10. `fieldAlias`: rejects what §2.8 Field Alias accepts

21 cases, in `random-documents` (21).

- Field aliases (MUST, [§2.8](https://spec.graphql.org/draft/#sec-Field-Alias))

The shortest case, from `random-documents`:

```
input:    "{ #c\na\n:\tb﻿}"
sibling:  "{ #c\n{\n:\tb﻿}", which the reference rejects
response: {"ok":false,"error":"Unexpected character `ï` (239)."}
expected: {"ok":true}
```

<a id="parse-finding-11"></a>

#### 11. `typeReferences`: rejects what §2.12 Type References accepts

21 cases, in `random-documents` (21).

- Type references (MUST, [§2.12](https://spec.graphql.org/draft/#sec-Type-References))

The shortest case, from `random-documents`:

```
input:    "query\r\nfragment,(﻿$﻿on,: #c\nInt #c\n)\n{,false }"
sibling:  "query\r\nfragment,(﻿$﻿on,: #c\n)\n{,false }", which the reference rejects
response: {"ok":false,"error":"Unexpected character `ï` (239)."}
expected: {"ok":true}
```

<a id="parse-finding-12"></a>

#### 12. `operations`: rejects what §2.4 Operations accepts

18 cases, in `random-documents` (18).

- Operation definitions and the query shorthand (MUST, [§2.4](https://spec.graphql.org/draft/#sec-Operations))

The shortest case, from `random-documents`:

```
input:    "mutation\n_x﻿{ x1 }"
sibling:  "mutation\n_x null﻿{ x1 }", which the reference rejects
response: {"ok":false,"error":"Unexpected character `ï` (239)."}
expected: {"ok":true}
```

<a id="parse-finding-13"></a>

#### 13. `fragments`: rejects what §2.9 Fragments accepts

18 cases, in `random-documents` (18).

- Fragment definitions and fragment spreads (MUST, [§2.9](https://spec.graphql.org/draft/#sec-Fragments))

The shortest case, from `random-documents`:

```
input:    "{﻿Foo,}"
response: {"ok":false,"error":"Unexpected character `ï` (239)."}
expected: {"ok":true}
```

<a id="parse-finding-14"></a>

#### 14. `fields`: rejects what §2.6 Fields accepts

15 cases, in `random-documents` (15).

- Fields (MUST, [§2.6](https://spec.graphql.org/draft/#sec-Fields))

The shortest case, from `random-documents`:

```
input:    "{ on on @﻿Foo,}"
response: {"ok":false,"error":"Unexpected character `ï` (239)."}
expected: {"ok":true}
```

<a id="parse-finding-15"></a>

#### 15. `stringValue`: crashes on a source §2.10.4 String Value rejects, instead of rejecting it

12 cases, in `lexer-examples` (7), `strings` (5). 6 of them rely on grammar or rules that are only in the draft, not in October 2021.

- String values and block strings (MUST, [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value))

The shortest case, from `strings`:

```
problem:  IndexOutOfRangeException: Index was outside the bounds of the array.
input:    "{a(x: \"\\u00\")}"
sibling:  "{a(x: \"\")}", which the reference accepts
response: "the adapter answered with an error: IndexOutOfRangeException: Index was outside the bounds of the array."
expected: {"ok":false}
```

<a id="parse-finding-16"></a>

#### 16. `document`: rejects what §2.3 Document accepts

9 cases, in `random-documents` (9).

- A document is one or more executable definitions (MUST, [§2.3](https://spec.graphql.org/draft/#sec-Document))

The shortest case, from `random-documents`:

```
input:    "{﻿true\r\n}"
sibling:  "a {﻿true\r\n}", which the reference rejects
response: {"ok":false,"error":"Unexpected character `ï` (239)."}
expected: {"ok":true}
```

<a id="parse-finding-17"></a>

#### 17. `stringValue`: accepts what §2.10.4 String Value rejects

8 cases, in `lexer-examples` (5), `strings` (3). 3 of them rely on grammar or rules that are only in the draft, not in October 2021.

- String values and block strings (MUST, [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value))

The shortest case, from `lexer-examples`:

```
input:    [draft] "{a(x: \"\\uD83D\")}"
sibling:  "{a(x: \"\")}", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-18"></a>

#### 18. `selectionSets`: rejects what §2.5 Selection Sets accepts

6 cases, in `random-documents` (6).

- Selection sets, including empty ones (MUST, [§2.5](https://spec.graphql.org/draft/#sec-Selection-Sets))

The shortest case, from `random-documents`:

```
input:    "{\ta﻿}"
sibling:  ":\ta﻿}", which the reference rejects
response: {"ok":false,"error":"Unexpected character `ï` (239)."}
expected: {"ok":true}
```

<a id="parse-finding-19"></a>

#### 19. `stringValue`: crashes on a source §2.10.4 String Value accepts, instead of accepting it

4 cases, in `block-strings` (3), `lexer-examples` (1).

- String values and block strings (MUST, [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value))

The shortest case, from `block-strings`:

```
problem:  Utf8EncodingException: The escape char `	` is invalid.
input:    "{a(x: \"\"\"\\\t\"\"\")}"
response: "the adapter answered with an error: Utf8EncodingException: The escape char `\t` is invalid."
expected: {"ok":true}
```

<a id="parse-finding-20"></a>

#### 20. `ignoredTokens`: rejects what §2.1.6 Ignored Tokens accepts

4 cases, in `ignored` (4).

- Ignored tokens may appear before and after every token (MUST, [§2.1.6](https://spec.graphql.org/draft/#sec-Ignored-Tokens))

The shortest case, from `ignored`:

```
input:    "{a﻿b}"
response: {"ok":false,"error":"Unexpected character `ï` (239)."}
expected: {"ok":true}
```

<a id="parse-finding-21"></a>

#### 21. `document`: accepts what §2.3 Document rejects

3 cases, in `random-documents` (2), `parser-examples` (1).

- A document is one or more executable definitions (MUST, [§2.3](https://spec.graphql.org/draft/#sec-Document))

The shortest case, from `random-documents`:

```
input:    "\"s\" { mutation }"
sibling:  "{ mutation }", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-22"></a>

#### 22. `sourceText`: rejects what §2.1 Source Text accepts

3 cases, in `ignored` (3). All rely on grammar or rules that are only in the draft, not in October 2021.

- Source text is a sequence of SourceCharacter (MUST, [§2.1](https://spec.graphql.org/draft/#sec-Source-Text))

The shortest case, from `ignored`:

```
input:    [draft] "{a#\u000b\nb}"
sibling:  "{a\ud800\u000b\nb}", which the reference rejects
response: {"ok":false,"error":"Unexpected character `\u000b` (11)."}
expected: {"ok":true}
```

<a id="parse-finding-23"></a>

#### 23. `descriptions`: accepts what §2.2 Descriptions rejects

1 case, in `parser-examples` (1).

- Descriptions on operations, fragments and variables, not on the query shorthand (MUST, [§2.2](https://spec.graphql.org/draft/#sec-Descriptions))

The shortest case, from `parser-examples`:

```
input:    "\"d\" {a}"
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-24"></a>

#### 24. `arguments`: accepts what §2.7 Arguments rejects

1 case, in `parser-examples` (1).

- Arguments (MUST, [§2.7](https://spec.graphql.org/draft/#sec-Arguments))

The shortest case, from `parser-examples`:

```
input:    "{a()}"
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-25"></a>

#### 25. `directives`: accepts what §2.13 Directives rejects

1 case, in `parser-examples` (1).

- Directives (MUST, [§2.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `parser-examples`:

```
input:    "{a @d()}"
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-26"></a>

#### 26. `variables`: accepts what §2.11 Variables rejects

1 case, in `parser-examples` (1).

- Variables and variable definitions (MUST, [§2.11](https://spec.graphql.org/draft/#sec-Variables))

The shortest case, from `parser-examples`:

```
input:    "query () {a}"
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-27"></a>

#### 27. `whiteSpace`: rejects what §2.1.1 White Space accepts

1 case, in `ignored` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- White space is tab and space only (MUST, [§2.1.1](https://spec.graphql.org/draft/#sec-White-Space))

The shortest case, from `ignored`:

```
input:    [draft] "{a#\f\rb}"
response: {"ok":false,"error":"Unexpected character `\f` (12)."}
expected: {"ok":true}
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
| Source text is a sequence of SourceCharacter (`sourceText`) | MUST | [§2.1](https://spec.graphql.org/draft/#sec-Source-Text) | ✗ 3/33 (all draft only) |
| White space is tab and space only (`whiteSpace`) | MUST | [§2.1.1](https://spec.graphql.org/draft/#sec-White-Space) | ✗ 1/28 (all draft only) |
| Line terminators are LF, CR and CR LF only (`lineTerminators`) | MUST | [§2.1.2](https://spec.graphql.org/draft/#sec-Line-Terminators) | ✓ 31 |
| A comment runs to the end of its line (`comments`) | MUST | [§2.1.3](https://spec.graphql.org/draft/#sec-Comments) | ✓ 17 |
| Commas are insignificant (`insignificantCommas`) | MUST | [§2.1.4](https://spec.graphql.org/draft/#sec-Insignificant-Commas) | ✓ 5 |
| Every character outside ignored tokens is part of a token (`lexicalTokens`) | MUST | [§2.1.5](https://spec.graphql.org/draft/#sec-Lexical-Tokens) | ✓ 43 |
| Ignored tokens may appear before and after every token (`ignoredTokens`) | MUST | [§2.1.6](https://spec.graphql.org/draft/#sec-Ignored-Tokens) | ✗ 4/81 |
| Punctuators, and `...` only as a whole (`punctuators`) | MUST | [§2.1.7](https://spec.graphql.org/draft/#sec-Punctuators) | ✓ 40 |
| Names (`names`) | MUST | [§2.1.8](https://spec.graphql.org/draft/#sec-Names) | ✓ 14 |
| Descriptions on operations, fragments and variables, not on the query shorthand (`descriptions`) | MUST | [§2.2](https://spec.graphql.org/draft/#sec-Descriptions) | ✗ 58/100 (54 draft only) |
| A document is one or more executable definitions (`document`) | MUST | [§2.3](https://spec.graphql.org/draft/#sec-Document) | ✗ 12/99 |
| Operation definitions and the query shorthand (`operations`) | MUST | [§2.4](https://spec.graphql.org/draft/#sec-Operations) | ✗ 18/100 |
| Selection sets, including empty ones (`selectionSets`) | MUST | [§2.5](https://spec.graphql.org/draft/#sec-Selection-Sets) | ✗ 6/95 |
| Fields (`fields`) | MUST | [§2.6](https://spec.graphql.org/draft/#sec-Fields) | ✗ 15/96 |
| Arguments (`arguments`) | MUST | [§2.7](https://spec.graphql.org/draft/#sec-Arguments) | ✗ 30/110 |
| Field aliases (`fieldAlias`) | MUST | [§2.8](https://spec.graphql.org/draft/#sec-Field-Alias) | ✗ 21/94 |
| Fragment definitions and fragment spreads (`fragments`) | MUST | [§2.9](https://spec.graphql.org/draft/#sec-Fragments) | ✗ 18/117 |
| Type conditions (`typeConditions`) | MUST | [§2.9.1](https://spec.graphql.org/draft/#sec-Type-Conditions) | ✗ 24/112 |
| Inline fragments (`inlineFragments`) | MUST | [§2.9.2](https://spec.graphql.org/draft/#sec-Inline-Fragments) | ✗ 42/100 |
| Input values, and no variables in constant values (`inputValues`) | MUST | [§2.10](https://spec.graphql.org/draft/#sec-Input-Values) | ✗ 36/122 |
| Int values (`intValue`) | MUST | [§2.10.1](https://spec.graphql.org/draft/#sec-Int-Value) | ✓ 42 |
| Float values (`floatValue`) | MUST | [§2.10.2](https://spec.graphql.org/draft/#sec-Float-Value) | ✓ 35 |
| Boolean values (`booleanValue`) | MUST | [§2.10.3](https://spec.graphql.org/draft/#sec-Boolean-Value) | ✓ 3 |
| String values and block strings (`stringValue`) | MUST | [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value) | ✗ 24/146 (9 draft only) |
| Null value (`nullValue`) | MUST | [§2.10.5](https://spec.graphql.org/draft/#sec-Null-Value) | ✓ 2 |
| Enum values (`enumValue`) | MUST | [§2.10.6](https://spec.graphql.org/draft/#sec-Enum-Value) | ✓ 10 |
| List values (`listValue`) | MUST | [§2.10.7](https://spec.graphql.org/draft/#sec-List-Value) | ✗ 35/101 |
| Input object values (`inputObjectValues`) | MUST | [§2.10.8](https://spec.graphql.org/draft/#sec-Input-Object-Values) | ✗ 35/107 |
| Variables and variable definitions (`variables`) | MUST | [§2.11](https://spec.graphql.org/draft/#sec-Variables) | ✗ 26/157 |
| Type references (`typeReferences`) | MUST | [§2.12](https://spec.graphql.org/draft/#sec-Type-References) | ✗ 21/102 |
| Directives (`directives`) | MUST | [§2.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 28/113 |

## Validate

- **Capabilities:** coerce, custom-scalar-literals, exact-numbers, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 3088 submitted, 3088 distinct, 0 malformed
- **Vectors:** 3088 of 3100 graded (not graded: 12 unspecified)
- **Draft only:** 27 of the failing vectors (of 206 draft-only vectors) rely on grammar or rules only in the draft
- **Adapter problems:** none
- **Checker self-test:** passed (8 negative controls)
- **Run:** kit 5da3deb09c91, 2026-11-15, strict

### Findings

<a id="validate-finding-1"></a>

#### 1. `valuesOfCorrectType`: §5.6.1 Values of Correct Type isn't enforced: accepts documents that break only this rule; 5 of 28 rely on the draft

28 cases, in `variables` (14), `values` (13), `random` (1). 5 of them rely on grammar or rules that are only in the draft, not in October 2021.

- Values of Correct Type (MUST, [§5.6.1](https://spec.graphql.org/draft/#sec-Values-of-Correct-Type))

The shortest case, from `values`:

```
input:    ValuesOfCorrectType-28: { echo(opt: null) }
response: {"valid":true,"errors":[]}
expected: invalid: ValuesOfCorrectType ["value"]
```

<a id="validate-finding-2"></a>

#### 2. `singleRootField`: §5.2.4.1 Single Root Field isn't enforced: accepts documents that break only this rule; all rely on the draft

22 cases, in `operations` (20), `random` (1), `spec` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- Single Root Field (MUST, [§5.2.4.1](https://spec.graphql.org/draft/#sec-Single-Root-Field))

The shortest case, from `spec`:

```
input:    [draft] SingleRootField-spec-7: subscription sub($bool: Boolean!) { newMessage @include(if: $bool) { body sender } }
response: {"valid":true,"errors":[]}
expected: invalid: SingleRootField ["sub"]
```

<a id="validate-finding-3"></a>

#### 3. `acceptsValid`: rejects valid documents: §5.8.5 All Variable Usages Are Allowed is likely over-strict (10 valid siblings of 113 different invalid vectors rejected, 47 of the same family accepted)

10 cases, in `variables` (10).

Each rejected document is one edit from a document that breaks only `allVariableUsagesAreAllowed`, so that rule is likely over-strict.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `variables`:

```
problem:  The specified argument value does not match the argument type.
input:    AllVariableUsagesAreAllowed-valid-23: query Q($v: Int = 1) { echo(list: [$v]) }
response: {"valid":false,"errors":[{"message":"The specified argument value does not match the argument type.","locations":[{"line":2,"column":14}]}]}
expected: valid
```

<a id="validate-finding-4"></a>

#### 4. `acceptsValid`: rejects valid documents, each one edit from a document that breaks only §5.8.2 Variables Are Input Types; the rule it applied is a guess, since the kit doesn't read error messages

5 cases, in `extra` (5).

Each rejected document is one edit from a document that breaks only `variablesAreInputTypes`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `extra`:

```
problem:  The following variables were not used: v.
input:    VariablesAreInputTypes-valid-2: query Q($v: Int) { json(value: {a: $v}) }
response: {"valid":false,"errors":[{"message":"The following variables were not used: v.","locations":[{"line":1,"column":1}]}]}
expected: valid
```

<a id="validate-finding-5"></a>

#### 5. `fieldSelectionMerging`: §5.3.2 Field Selection Merging isn't enforced: accepts documents that break only this rule

4 cases, in `merging` (4).

- Field Selection Merging (MUST, [§5.3.2](https://spec.graphql.org/draft/#sec-Field-Selection-Merging))

The shortest case, from `merging`:

```
input:    FieldSelectionMerging-16: { node(id: "1") { a: __typename ... on Post { a: name } } }
response: {"valid":true,"errors":[]}
expected: invalid: FieldSelectionMerging ["conflict"]
```

<a id="validate-finding-6"></a>

#### 6. `acceptsValid`: rejects valid documents: §5.3.3 Leaf Field Selections is likely over-strict (4 valid siblings of 4 different invalid vectors rejected, 6 of the same family accepted)

4 cases, in `random` (4).

Each rejected document is one edit from a document that breaks only `leafFieldSelections`, so that rule is likely over-strict.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `random`:

```
problem:  The specified directive `tag` is not supported by the current schema.
input:    LeafFieldSelections-valid-22: { resource { id id @tag } }
response: {"valid":false,"errors":[{"message":"The specified directive `tag` is not supported by the current schema.","locations":[{"line":4,"column":8}]}]}
expected: valid
```

<a id="validate-finding-7"></a>

#### 7. `acceptsValid`: rejects valid documents, each one edit from a document that breaks only §5.4.3 Required Arguments; the rule it applied is a guess, since the kit doesn't read error messages

2 cases, in `values` (1), `random` (1).

Each rejected document is one edit from a document that breaks only `requiredArguments`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `values`:

```
problem:  The specified directive `tag` is not supported by the current schema.
input:    RequiredArguments-valid-1: { user { id @tag } }
response: {"valid":false,"errors":[{"message":"The specified directive `tag` is not supported by the current schema.","locations":[{"line":3,"column":8}]}]}
expected: valid
```

<a id="validate-finding-8"></a>

#### 8. `acceptsValid`: rejects valid documents, each one edit from a document that breaks §5.4.1 Argument Names and §5.7.1 Directives Are Defined; the rule it applied is a guess, since the kit doesn't read error messages

1 case, in `values` (1).

Each rejected document is one edit from a document that breaks only `argumentNames` or `directivesAreDefined`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `values`:

```
problem:  The specified directive `tag` is not supported by the current schema.
input:    ArgumentNames-valid-1: { user { id @tag(name: null) } }
response: {"valid":false,"errors":[{"message":"The specified directive `tag` is not supported by the current schema.","locations":[{"line":3,"column":8}]}]}
expected: valid
```

<a id="validate-finding-9"></a>

#### 9. `acceptsValid`: rejects valid documents, each one edit from a document that breaks §5.4.1 Argument Names and §5.4.2 Argument Uniqueness; the rule it applied is a guess, since the kit doesn't read error messages

1 case, in `names` (1).

Each rejected document is one edit from a document that breaks only `argumentNames` or `argumentUniqueness`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `names`:

```
problem:  The specified directive `tag` is not supported by the current schema.
input:    ArgumentNames-valid-3: { user @tag(name: "a") { id } }
response: {"valid":false,"errors":[{"message":"The specified directive `tag` is not supported by the current schema.","locations":[{"line":2,"column":8}]}]}
expected: valid
```

<a id="validate-finding-10"></a>

#### 10. `acceptsValid`: rejects valid documents, each one edit from a document that breaks only §5.5.2.3 Fragment Spread Is Possible; the rule it applied is a guess, since the kit doesn't read error messages

1 case, in `random` (1).

Each rejected document is one edit from a document that breaks only `fragmentSpreadIsPossible`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `random`:

```
problem:  The specified directive `tag` is not supported by the current schema.
input:    FragmentSpreadIsPossible-valid-22: query Q0 { user { id @tag } __typename } query Q1 { resource { id url } echo(opt: 1, role: GUEST) }
response: {"valid":false,"errors":[{"message":"The specified directive `tag` is not supported by the current schema.","locations":[{"line":3,"column":8}]}]}
expected: valid
```

<a id="validate-finding-11"></a>

#### 11. `acceptsValid`: rejects valid documents, each one edit from a document that breaks only §5.6.1 Values of Correct Type; the rule it applied is a guess, since the kit doesn't read error messages

1 case, in `random` (1).

Each rejected document is one edit from a document that breaks only `valuesOfCorrectType`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `random`:

```
problem:  The specified directive `tag` is not supported by the current schema.
input:    ValuesOfCorrectType-valid-55: { post @include(if: true) { tags @tag b: author { a: avatar(size: 1) id @include(if: true) id } } }
response: {"valid":false,"errors":[{"message":"The specified directive `tag` is not supported by the current schema.","locations":[{"line":3,"column":10}]}]}
expected: valid
```

<a id="validate-finding-12"></a>

#### 12. `acceptsValid`: rejects valid documents, each one edit from a document that breaks §5.7.1 Directives Are Defined and §5.7.2 Directives Are in Valid Locations; the rule it applied is a guess, since the kit doesn't read error messages

1 case, in `directives` (1).

Each rejected document is one edit from a document that breaks only `directivesAreDefined` or `directivesAreInValidLocations`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `directives`:

```
problem:  The specified directive `tag` is not supported by the current schema.
input:    DirectivesAreDefined-valid-8: { user { ...F } } fragment F on User @tag(name: "x") { id }
response: {"valid":false,"errors":[{"message":"The specified directive `tag` is not supported by the current schema.","locations":[{"line":7,"column":20}]}]}
expected: valid
```

<a id="validate-finding-13"></a>

#### 13. `acceptsValid`: rejects valid documents, each one edit from a document that breaks only §5.7.1 Directives Are Defined; the rule it applied is a guess, since the kit doesn't read error messages

1 case, in `random` (1).

Each rejected document is one edit from a document that breaks only `directivesAreDefined`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `random`:

```
problem:  The specified directive `tag` is not supported by the current schema.
input:    DirectivesAreDefined-valid-11: { post { ...F2 } matrix } fragment F2 on Post { name @tag name }
response: {"valid":false,"errors":[{"message":"The specified directive `tag` is not supported by the current schema.","locations":[{"line":9,"column":8}]}]}
expected: valid
```

<a id="validate-finding-14"></a>

#### 14. `acceptsValid`: rejects valid documents, each one edit from a document that breaks §5.8.4 All Variables Used and §5.7.2 Directives Are in Valid Locations; the rule it applied is a guess, since the kit doesn't read error messages

1 case, in `directives` (1).

Each rejected document is one edit from a document that breaks only `allVariablesUsed` or `directivesAreInValidLocations`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `directives`:

```
problem:  The specified directive `tag` is not supported by the current schema.
input:    DirectivesAreInValidLocations-valid-1: query Q @tag(name: "x") { user { id } }
response: {"valid":false,"errors":[{"message":"The specified directive `tag` is not supported by the current schema.","locations":[{"line":1,"column":9}]}]}
expected: valid
```

<a id="validate-finding-15"></a>

#### 15. `acceptsValid`: rejects valid documents, each one edit from a document that breaks only §5.7.2 Directives Are in Valid Locations; the rule it applied is a guess, since the kit doesn't read error messages

1 case, in `directives` (1).

Each rejected document is one edit from a document that breaks only `directivesAreInValidLocations`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `directives`:

```
problem:  The specified directive `tag` is not supported by the current schema.
input:    DirectivesAreInValidLocations-valid-2: subscription S @tag(name: "x") { postAdded { id } }
response: {"valid":false,"errors":[{"message":"The specified directive `tag` is not supported by the current schema.","locations":[{"line":1,"column":16}]}]}
expected: valid
```

<a id="validate-finding-16"></a>

#### 16. `acceptsValid`: rejects valid documents, each one edit from a document that breaks only §5.8.3 All Variable Uses Defined; the rule it applied is a guess, since the kit doesn't read error messages

1 case, in `random` (1).

Each rejected document is one edit from a document that breaks only `allVariableUsesDefined`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `random`:

```
problem:  The specified directive `tag` is not supported by the current schema.
input:    AllVariableUsesDefined-valid-4: query Q0 { ...F2 } fragment F2 on Query { search(term: "s", filter: {limit: 1, offset: 1}) @tag { a: __typename } a: node(id: "1") { id id } }
response: {"valid":false,"errors":[{"message":"The specified directive `tag` is not supported by the current schema.","locations":[{"line":6,"column":52}]}]}
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
| Operation Type Existence (`operationTypeExistence`) | MUST | [§5.2.1.1](https://spec.graphql.org/draft/#sec-Operation-Type-Existence) | ✓ 12 |
| Operation Name Uniqueness (`operationNameUniqueness`) | MUST | [§5.2.2.1](https://spec.graphql.org/draft/#sec-Operation-Name-Uniqueness) | ✓ 6 |
| Lone Anonymous Operation (`loneAnonymousOperation`) | MUST | [§5.2.3.1](https://spec.graphql.org/draft/#sec-Lone-Anonymous-Operation) | ✓ 21 |
| Single Root Field (`singleRootField`) | MUST | [§5.2.4.1](https://spec.graphql.org/draft/#sec-Single-Root-Field) | ✗ 22/59 (all draft only) |
| Field Selections (`fieldSelections`) | MUST | [§5.3.1](https://spec.graphql.org/draft/#sec-Field-Selections) | ✓ 25 |
| Field Selection Merging (`fieldSelectionMerging`) | MUST | [§5.3.2](https://spec.graphql.org/draft/#sec-Field-Selection-Merging) | ✗ 4/674 |
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
| Values of Correct Type (`valuesOfCorrectType`) | MUST | [§5.6.1](https://spec.graphql.org/draft/#sec-Values-of-Correct-Type) | ✗ 28/282 (5 draft only) |
| Input Object Field Names (`inputObjectFieldNames`). every document that breaks this rule also breaks §5.6.1 Values of Correct Type, which subsumes it, so a rejection can't be credited to this rule; accepting one fails both | MUST | [§5.6.2](https://spec.graphql.org/draft/#sec-Input-Object-Field-Names) | ⊂ |
| Input Object Field Uniqueness (`inputObjectFieldUniqueness`) | MUST | [§5.6.3](https://spec.graphql.org/draft/#sec-Input-Object-Field-Uniqueness) | ✓ 6 |
| Input Object Required Fields (`inputObjectRequiredFields`). every document that breaks this rule also breaks §5.6.1 Values of Correct Type, which subsumes it, so a rejection can't be credited to this rule; accepting one fails both | MUST | [§5.6.4](https://spec.graphql.org/draft/#sec-Input-Object-Required-Fields) | ⊂ |
| Directives Are Defined (`directivesAreDefined`) | MUST | [§5.7.1](https://spec.graphql.org/draft/#sec-Directives-Are-Defined) | ✓ 24 |
| Directives Are in Valid Locations (`directivesAreInValidLocations`) | MUST | [§5.7.2](https://spec.graphql.org/draft/#sec-Directives-Are-in-Valid-Locations) | ✓ 27 |
| Directives Are Unique per Location (`directivesAreUniquePerLocation`) | MUST | [§5.7.3](https://spec.graphql.org/draft/#sec-Directives-Are-Unique-per-Location) | ✓ 10 |
| Variable Uniqueness (`variableUniqueness`) | MUST | [§5.8.1](https://spec.graphql.org/draft/#sec-Variable-Uniqueness) | ✓ 6 |
| Variables Are Input Types (`variablesAreInputTypes`) | MUST | [§5.8.2](https://spec.graphql.org/draft/#sec-Variables-Are-Input-Types) | ✓ 4 |
| All Variable Uses Defined (`allVariableUsesDefined`) | MUST | [§5.8.3](https://spec.graphql.org/draft/#sec-All-Variable-Uses-Defined) | ✓ 15 |
| All Variables Used (`allVariablesUsed`) | MUST | [§5.8.4](https://spec.graphql.org/draft/#sec-All-Variables-Used) | ✓ 18 |
| All Variable Usages Are Allowed (`allVariableUsagesAreAllowed`) | MUST | [§5.8.5](https://spec.graphql.org/draft/#sec-All-Variable-Usages-Are-Allowed) | ✓ 636 |
| Valid documents are accepted (`acceptsValid`) | MUST | [§5](https://spec.graphql.org/draft/#sec-Validation) | ✗ 30/984 |

- **Basis for `acceptsValid`:** a document is valid when it satisfies every rule of §5, and only invalid requests are kept from execution (§6.1.1); rejecting a valid document applies a rule the spec doesn't have

## Coerce

- **Capabilities:** coerce, custom-scalar-literals, exact-numbers, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 1930 submitted, 1930 distinct, 0 malformed
- **Draft only:** 11 of the failing vectors (of 35 draft-only vectors) rely on grammar or rules only in the draft
- **Adapter problems:** none
- **Checker self-test:** passed (14769 negative controls)
- **Run:** kit 5da3deb09c91, 2026-11-15, strict

### Findings

<a id="coerce-finding-1"></a>

#### 1. `invalidNotExecuted`: doesn't fail an invalid document without executing it, as §6.1.1 (Validating Requests) requires

58 cases, in `literal` (57), `arguments` (1).

- An invalid document fails as a request error, without executing (MUST, [§6.1.1](https://spec.graphql.org/draft/#sec-Validating-Requests))

The shortest case, from `literal`:

```
input:    { point(v: []) }  variables: {}
response: {"response":{"errors":[{"message":"The syntax node `ListValue` is incompatible with the type `Point`.","locations":[{"line":1,"column":3}],"path":["v"],"extensions":{"type":"Point"}}],"data":{"point":null}},"calls":[]}
expected: a request error
```

<a id="coerce-finding-2"></a>

#### 2. `list`: gives October 2021's answer where the draft changed it, under §3.11 (List)

10 cases, in `literal` (5), `variable` (5). All rely on grammar or rules that are only in the draft, not in October 2021.

- Lists: each item coerced, a single value wrapped in a list (MUST, [§3.11](https://spec.graphql.org/draft/#sec-List))

The shortest case, from `literal`:

```
input:    [draft] { matrix(v: [1, null, 3]) }  variables: {}
response: {"response":{"errors":[{"message":"The item syntax node for a nested list must be `ListValue` but the parser found `IntValue`.","locations":[{"line":1,"column":3}],"path":["v",0],"extensions":{"specifiedBy":"https://spec.graphql.org/June2018/#sec-Type-System.List"}}],"data":{"matrix":null}},"calls":[]}
expected: matrix resolved with {"v":[[1],null,[3]]}
```

<a id="coerce-finding-3"></a>

#### 3. `list`: rejects what §3.11 (List) accepts

7 cases, in `variable` (5), `nested-variable` (2).

- Lists: each item coerced, a single value wrapped in a list (MUST, [§3.11](https://spec.graphql.org/draft/#sec-List))

The shortest case, from `variable`:

```
input:    query($x: [Int]) { ints(v: $x) }  variables: {"x": 1.0}
response: {"response":{"errors":[{"message":"Int cannot parse the given literal of type `FloatValueNode`.","path":["x",0]}]},"calls":[]}
expected: ints resolved with {"v":[1]}
```

<a id="coerce-finding-4"></a>

#### 4. `variables`: rejects what §6.1.2 (Coercing Variable Values) accepts

7 cases, in `variable-default` (7).

- CoerceVariableValues: defaults, missing and null values, and failures as request errors (MUST, [§6.1.2](https://spec.graphql.org/draft/#sec-Coercing-Variable-Values))

The shortest case, from `variable-default`:

```
input:    query($x: [Int!] = [1, 2]) { intsNN(v: $x) }  variables: {}
response: {"response":{"errors":[{"message":"The specified value type of variable `x` does not match the variable type.","locations":[{"line":1,"column":20}],"extensions":{"variable":"x","variableType":"[Int!]","locationType":"Int","specifiedBy":"https://spec.graphql.org/October2021/#sec-Values-of-Correct-Type"}}]},"calls":[]}
expected: intsNN resolved with {"v":[1,2]}
```

<a id="coerce-finding-5"></a>

#### 5. `fieldErrorPath`: raises the field error with a path other than the field's response path, which §7.1.6 (Errors) requires

5 cases, in `variable-default` (3), `nullable-variable` (1), `arguments` (1).

- A field error's path is the field's response path (MUST, [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position))

The shortest case, from `variable-default`:

```
input:    query($x: Int = 3) { intNN(v: $x) }  variables: {"x": null}
response: {"response":{"errors":[{"message":"Cannot accept null for non-nullable input.","locations":[{"line":1,"column":22}],"path":["v"],"extensions":{"code":"HC0018"}}],"data":{"intNN":null}},"calls":[]}
expected: a field error at intNN
```

<a id="coerce-finding-6"></a>

#### 6. `int`: rejects what §3.5.1 (Int) accepts

4 cases, in `variable` (4).

- Int accepts only integer input values (MUST, [§3.5.1](https://spec.graphql.org/draft/#sec-Int))

The shortest case, from `variable`:

```
input:    query($x: Int) { int(v: $x) }  variables: {"x": 1.0}
response: {"response":{"errors":[{"message":"Int cannot parse the given literal of type `FloatValueNode`.","path":["x"]}]},"calls":[]}
expected: int resolved with {"v":1}
```

<a id="coerce-finding-7"></a>

#### 7. `idCoerced`: rejects what §3.5.5 (ID) accepts

3 cases, in `variable` (3).

- String and integer input values are coerced to ID strings (SHOULD, [§3.5.5](https://spec.graphql.org/draft/#sec-ID))

The shortest case, from `variable`:

```
input:    query($x: ID) { id(v: $x) }  variables: {"x": 1.0}
response: {"response":{"errors":[{"message":"ID cannot parse the given literal of type `FloatValueNode`.","path":["x"]}]},"calls":[]}
expected: id resolved with {"v":"1"}
```

<a id="coerce-finding-8"></a>

#### 8. `loneSurrogates`: treats a JSON string with a lone surrogate in a way that neither keeping it, replacing it with U+FFFD, nor a refusal explains

2 cases, in `variable` (2).

- JSON strings with a lone surrogate: kept as sent, replaced with U+FFFD, or refused (INFO)

The shortest case, from `variable`:

```
input:    query($x: ID) { id(v: $x) }  variables: {"x": "\ud800"}
response: {"response":{"data":{"id":"ok"}},"calls":[{"path":["id"],"arguments":{"v":""}}]}
expected: a request error, or id resolved with {"v":"\ud800"}, or id resolved with {"v":"�"}
```

<a id="coerce-finding-9"></a>

#### 9. `arguments`: raises a request error where §6.4.1 (Coercing Field Arguments) requires a field error

2 cases, in `variable-default` (1), `nested-variable` (1).

- CoerceArgumentValues: defaults, missing variables, and failures as field errors (MUST, [§6.4.1](https://spec.graphql.org/draft/#sec-Coercing-Field-Arguments))

The shortest case, from `nested-variable`:

```
input:    query($x: Int = 1) { intsNN(v: [1, $x]) }  variables: {"x": null}
response: {"response":{"errors":[{"message":"The specified argument value does not match the argument type.","locations":[{"line":1,"column":32}],"path":["intsNN"],"extensions":{"argument":"v","argumentValue":"[ 1, $x ]","locationType":"[Int!]!","specifiedBy":"https://spec.graphql.org/October2021/#sec-Values-of-Correct-Type"}}]},"calls":[]}
expected: a field error at intsNN
```

<a id="coerce-finding-10"></a>

#### 10. `inputObject`: rejects what §3.10 (Input Objects) accepts

2 cases, in `variable` (2).

- Input objects: an object of defined fields, required fields, variables in fields (MUST, [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects))

The shortest case, from `variable`:

```
input:    query($x: Point!) { pointNN(v: $x) }  variables: {"x": {"x": 1.0}}
response: {"response":{"errors":[{"message":"Int cannot parse the given literal of type `FloatValueNode`.","path":["x","x"],"extensions":{"fieldCoordinate":"Point.x","fieldType":"Int"}}]},"calls":[]}
expected: pointNN resolved with {"v":{"x":1,"y":0}}
```

<a id="coerce-finding-11"></a>

#### 11. `floatPrecision`: accepts what §3.5.2 (Float) rejects

1 case, in `variable` (1).

- Float rejects an integer a double can't hold exactly (SHOULD, [§3.5.2](https://spec.graphql.org/draft/#sec-Float))

The shortest case, from `variable`:

```
input:    query($x: Float) { float(v: $x) }  variables: {"x": 9007199254740993}
response: {"response":{"data":{"float":"ok"}},"calls":[{"path":["float"],"arguments":{"v":9007199254740992}}]}
expected: a request error
```

<a id="coerce-finding-12"></a>

#### 12. `variables`: gives October 2021's answer where the draft changed it, under §6.1.2 (Coercing Variable Values)

1 case, in `variable-default` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- CoerceVariableValues: defaults, missing and null values, and failures as request errors (MUST, [§6.1.2](https://spec.graphql.org/draft/#sec-Coercing-Variable-Values))

The shortest case, from `variable-default`:

```
input:    [draft] query($x: [[Int]] = 1) { matrix(v: $x) }  variables: {"x": [1, [2]]}
response: {"response":{"errors":[{"message":"The item syntax node for a nested list must be `ListValue` but the parser found `IntValue`.","path":["x",0],"extensions":{"specifiedBy":"https://spec.graphql.org/June2018/#sec-Type-System.List"}}]},"calls":[]}
expected: matrix resolved with {"v":[[1],[2]]}
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
| Int accepts only integer input values (`int`) | MUST | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) | ✗ 4/189 |
| Int rejects integers outside the signed 32-bit range (`intRange`) | SHOULD | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) | ✓ 20 |
| Float accepts integer and float input values, and rejects non-finite values (`float`) | MUST | [§3.5.2](https://spec.graphql.org/draft/#sec-Float) | ✓ 57 |
| Float rejects an integer a double can't hold exactly (`floatPrecision`) | SHOULD | [§3.5.2](https://spec.graphql.org/draft/#sec-Float) | ! 1/1 |
| String accepts only string input values (`string`) | MUST | [§3.5.3](https://spec.graphql.org/draft/#sec-String) | ✓ 50 |
| Boolean accepts only boolean input values (`boolean`) | MUST | [§3.5.4](https://spec.graphql.org/draft/#sec-Boolean) | ✓ 49 |
| String and integer input values are coerced to ID strings (`idCoerced`) | SHOULD | [§3.5.5](https://spec.graphql.org/draft/#sec-ID) | ! 3/28 |
| ID rejects input values other than strings and integers (`id`) | MUST | [§3.5.5](https://spec.graphql.org/draft/#sec-ID) | ✓ 30 |
| Enums accept their own values, and reject string literals and unknown values (`enum`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✓ 97 |
| Input objects: an object of defined fields, required fields, variables in fields (`inputObject`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✗ 2/219 |
| An omitted input field gets its default value (`inputFieldDefaults`) | SHOULD | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 49 |
| OneOf input objects take exactly one non-null field (`oneOf`). Coercion.tla doesn't model OneOf input objects, so there are no vectors for them. | MUST | [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | – |
| Lists: each item coerced, a single value wrapped in a list (`list`) | MUST | [§3.11](https://spec.graphql.org/draft/#sec-List) | ✗ 17/299 (10 draft only) |
| Non-Null rejects null (`nonNull`) | MUST | [§3.12](https://spec.graphql.org/draft/#sec-Non-Null) | – |
| CoerceVariableValues: defaults, missing and null values, and failures as request errors (`variables`) | MUST | [§6.1.2](https://spec.graphql.org/draft/#sec-Coercing-Variable-Values) | ✗ 8/849 (1 draft only) |
| CoerceArgumentValues: defaults, missing variables, and failures as field errors (`arguments`) | MUST | [§6.4.1](https://spec.graphql.org/draft/#sec-Coercing-Field-Arguments) | ✗ 2/20 |
| GetOperation: the operation operationName names, or the only one, else a request error (`getOperation`) | MUST | [§6.1](https://spec.graphql.org/draft/#sec-Executing-Requests) | ✓ 18 |
| An invalid document fails as a request error, without executing (`invalidNotExecuted`) | MUST | [§6.1.1](https://spec.graphql.org/draft/#sec-Validating-Requests) | ✗ 58/775 |
| A request error result has no data entry (`requestErrorNoData`) | MUST (Oct 2021: SHOULD) | [§7.1.3](https://spec.graphql.org/draft/#sec-Request-Error-Result) | ✓ 1569 |
| A request gets a response (`responds`) | MUST | [§7](https://spec.graphql.org/draft/#sec-Response) | ✓ 391 |
| A field error's path is the field's response path (`fieldErrorPath`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) | ✗ 5/8 |
| JSON strings with a lone surrogate: kept as sent, replaced with U+FFFD, or refused (`loneSurrogates`) | INFO | — | i 2/2 |
| JSON numbers a double can't hold: read exactly, read as binary64, or refused (`jsonNumbers`) | INFO | — | – |

- **Basis for `intRange`:** "If the integer input value represents a value less than -2^31 or greater than or equal to 2^31, a request error should be raised."
- **Basis for `float`:** A fractional value is kept as its decimal, which the vectors only use with at most 15 significant digits. Integers a double can't hold exactly are floatPrecision's.
- **Basis for `floatPrecision`:** The sentence says a request error "must be raised" for "a value outside the available precision", but which values that covers is Coercion.tla's reading (an integral value must be exactly representable), so the check takes the weaker level.
- **Basis for `string`:** A JSON string with a lone surrogate is graded under loneSurrogates, not here.
- **Basis for `idCoerced`:** "any string (such as \"4\") or integer (such as 4 or -4) input value should be coerced to ID". The format of an ID made from an integer is the service's: any string that writes the integer's exact value passes, such as "1e+21" for 10^21.
- **Basis for `enum`:** String literals must be rejected. For JSON variables, "strings may be interpreted as the enum input value with the same name": a MAY, so taking the string and rejecting it both pass.
- **Basis for `inputObject`:** The "must" sentences: the value must be an object without undefined fields, a variable's runtime value must be used, and §3.12 makes a missing Non-Null field an error that must be raised. Field defaults are a "should", graded by inputFieldDefaults.
- **Basis for `inputFieldDefaults`:** "If no value is provided for a defined input object field and that field definition provides a default value, the result of coercing the default value ... should be used." The SHOULD applies to each field: a result that is right except that it leaves out some or all of such defaults fails this check, not inputObject.
- **Basis for `list`:** An item that isn't a list, where the item type is a list, is coerced as a list of one, as the draft's table gives [[1], [2], [3]] for [1, 2, 3] as [[Int]]. October 2021's table says "Error: Incorrect item value", so those vectors are draft-only.
- **Basis for `getOperation`:** Includes a mutation running on the mutation root type, and only the selected operation's variables being coerced.
- **Basis for `invalidNotExecuted`:** "If validation errors are known, they should be reported in the list of \"errors\" in the response and the request must fail without operation execution." Graded for adapters without `unvalidated`, on vectors Validation.tla rejects: a request error, no data, no resolver called.
- **Basis for `requestErrorNoData`:** The draft: "The request error result map must not contain an entry with key {"data"}." October 2021 (§7.1.1): "If an error was raised before execution begins, the data entry should not be present in the result." A request error with "data": null is still a request error for the vector's own check, and fails this one.
- **Basis for `responds`:** "When a GraphQL service receives a request, it must return a well-formed response." October 2021 says the same. The adapter answers with an `error` when the implementation produced no response at all, for example because it threw. Execution's check of the same name grades the same sentence. A vector whose reference answer is a request error, under a MUST check, counts that against its own check instead: a request error is a response, so no response doesn't match it. Every other vector exercises this check.
- **Basis for `fieldErrorPath`:** §7.1.6: an error that "can be associated to a particular field in the GraphQL result ... must contain an entry with the key {"path"} with a response path which describes the response position which raised the error". §7.1.4: a response path names response positions, not arguments. A result whose data holds the field as null, with one error and no resolver call, is a field error whatever its path. If that is the answer the vector expects, a path other than the field's fails this check. Every vector that accepts a field error exercises it.
- **Basis for `loneSurrogates`:** §3.5.3 accepts "only valid Unicode string input values" without defining one, and calls a String "a sequence of Unicode code points", which a lone surrogate is. §3.5.5 says nothing about Unicode. RFC 8259 §8.2 calls the behaviour of software that receives such a string unpredictable. Coercion.tla refuses it, but the check also passes the value kept as sent and the value with U+FFFD, and records which happened. It never fails the run.
- **Basis for `jsonNumbers`:** Not a GraphQL rule: RFC 8259 §6 lets a JSON parser limit the range and precision of numbers. Vectors whose answer depends on that count here, never against Float or ID, unless the adapter claims exact-numbers.

## Schema

- **Capabilities:** coerce, custom-scalar-literals, exact-numbers, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 165 submitted, 165 distinct, 0 malformed
- **Vectors:** 165 of 168 graded (not graded: 3 unspecified)
- **Draft only:** 18 of the failing vectors (of 37 draft-only vectors) rely on grammar or rules only in the draft
- **Adapter problems:** none
- **Checker self-test:** passed (330 negative controls)
- **Run:** kit 5da3deb09c91, 2026-11-15, strict

### Findings

<a id="schema-finding-1"></a>

#### 1. `argDefaultCompatible`: ARG_DEFAULT_COMPATIBLE not enforced: accepts a schema that breaks only this rule

10 cases, in `defaults` (10). All rely on grammar or rules that are only in the draft, not in October 2021.

- An object field argument's default value coerces to its type (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects))

The shortest case, from `argDefaultCompatible.1.invalid`:

```
input:    [draft] type Query { f(x: Int = "1"): Int }
response: {"valid":true}
expected: invalid: breaks ARG_DEFAULT_COMPATIBLE and no other rule
```

<a id="schema-finding-2"></a>

#### 2. `inputObjectDefaultValueCycle`: INPUT_OBJECT_DEFAULT_VALUE_CYCLE not enforced: accepts a schema that breaks only this rule

4 cases, in `input` (4). All rely on grammar or rules that are only in the draft, not in October 2021.

- Input object default values don't form a cycle (MUST, [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects))

The shortest case, from `inputObjectDefaultValueCycle.1.invalid`:

```
input:    [draft] input I { i: I = {} } type Query { f(i: I): Int }
response: {"valid":true}
expected: invalid: breaks INPUT_OBJECT_DEFAULT_VALUE_CYCLE and no other rule
```

<a id="schema-finding-3"></a>

#### 3. `rootTypesDifferent`: ROOT_TYPES_DIFFERENT not enforced: accepts a schema that breaks only this rule

2 cases, in `root` (2).

- Root operation types are all different (MUST, [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types))

The shortest case, from `rootTypesDifferent.2.invalid`:

```
input:    schema { query: Q subscription: Q } type Q { a: Int } type S { a: Int }
response: {"valid":true}
expected: invalid: breaks ROOT_TYPES_DIFFERENT and no other rule
```

<a id="schema-finding-4"></a>

#### 4. `inputObjectUnbreakableCycle`: INPUT_OBJECT_UNBREAKABLE_CYCLE not enforced: accepts a schema that breaks only this rule

2 cases, in `input` (2). All rely on grammar or rules that are only in the draft, not in October 2021.

- An input object can be given a finite value (MUST, [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects))

The shortest case, from `inputObjectUnbreakableCycle.5.invalid`:

```
input:    [draft] input A @oneOf { b: B } input B @oneOf { a: A } type Query { f(a: A): Int }
response: {"valid":true}
expected: invalid: breaks INPUT_OBJECT_UNBREAKABLE_CYCLE and no other rule
```

<a id="schema-finding-5"></a>

#### 5. `typeNamesUnique`: TYPE_NAMES_UNIQUE not enforced: accepts a schema that breaks only this rule

1 case, in `names` (1).

- No two types have the same name (MUST, [§3.3](https://spec.graphql.org/draft/#sec-Schema))

The shortest case, from `typeNamesUnique.1.invalid`:

```
input:    scalar A scalar A type Query { a: A }
response: {"valid":true}
expected: invalid: breaks TYPE_NAMES_UNIQUE and no other rule
```

<a id="schema-finding-6"></a>

#### 6. `typeNameNotBuiltin`: TYPE_NAME_NOT_BUILTIN not enforced: accepts a schema that breaks only this rule

1 case, in `names` (1).

- No type is named like a built-in type (MUST, [§3.3](https://spec.graphql.org/draft/#sec-Schema))

The shortest case, from `typeNameNotBuiltin.2.invalid`:

```
input:    type Int { a: String } type Query { a: String }
response: {"valid":true}
expected: invalid: breaks TYPE_NAME_NOT_BUILTIN and no other rule
```

<a id="schema-finding-7"></a>

#### 7. `typeNameReserved`: TYPE_NAME_RESERVED not enforced: accepts a schema that breaks only this rule

1 case, in `names` (1).

- No type name begins with __ (MUST, [§3.3](https://spec.graphql.org/draft/#sec-Schema))

The shortest case, from `typeNameReserved.1.invalid`:

```
input:    type __T { a: Int } type Query { t: __T }
response: {"valid":true}
expected: invalid: breaks TYPE_NAME_RESERVED and no other rule
```

<a id="schema-finding-8"></a>

#### 8. `fieldNamesUnique`: FIELD_NAMES_UNIQUE over-strict: rejects a valid schema one small edit away from one that breaks it

1 case, in `names` (1).

- Field names are unique within a type (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces))

The shortest case, from `fieldNamesUnique.2.valid`:

```
input:    type Query { a: I } interface I { x: Int y: String }
response: {"valid":false,"errors":["There is no object type implementing interface `I`."]}
expected: valid (TypeSystem!Verdict is empty)
```

<a id="schema-finding-9"></a>

#### 9. `requiredArgNotDeprecated`: REQUIRED_ARG_NOT_DEPRECATED over-strict: rejects a valid schema one small edit away from one that breaks it

1 case, in `typeUse` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- A required argument isn't deprecated (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated))

The shortest case, from `requiredArgNotDeprecated.3.valid`:

```
input:    [draft] type Query { a: I } interface I { f(x: Int @deprecated): Int }
response: {"valid":false,"errors":["There is no object type implementing interface `I`."]}
expected: valid (TypeSystem!Verdict is empty)
```

<a id="schema-finding-10"></a>

#### 10. `implementsUnique`: IMPLEMENTS_UNIQUE not enforced: accepts a schema that breaks only this rule

1 case, in `implementation` (1).

- A type implements each interface once (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces))

The shortest case, from `implementsUnique.1.invalid`:

```
input:    interface I { a: Int } type Query implements I & I { a: Int }
response: {"valid":true}
expected: invalid: breaks IMPLEMENTS_UNIQUE and no other rule
```

<a id="schema-finding-11"></a>

#### 11. `implementsInterfaces`: IMPLEMENTS_INTERFACES: crashes on a schema that breaks only this rule, instead of rejecting it

1 case, in `implementation` (1).

- A type implements only interface types (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces))

The shortest case, from `implementsInterfaces.1.invalid`:

```
problem:  NullReferenceException: Object reference not set to an instance of an object.
input:    type O { a: Int } type Query implements O { a: Int }
response: "the adapter answered with an error: NullReferenceException: Object reference not set to an instance of an object."
expected: invalid: breaks IMPLEMENTS_INTERFACES and no other rule
```

<a id="schema-finding-12"></a>

#### 12. `implementsItself`: IMPLEMENTS_ITSELF over-strict: rejects a valid schema one small edit away from one that breaks it

1 case, in `implementation` (1).

- An interface doesn't implement itself (MUST, [§3.7](https://spec.graphql.org/draft/#sec-Interfaces))

The shortest case, from `implementsItself.1.valid`:

```
input:    interface A { x: Int } type Query { a: A }
response: {"valid":false,"errors":["There is no object type implementing interface `A`."]}
expected: valid (TypeSystem!Verdict is empty)
```

<a id="schema-finding-13"></a>

#### 13. `implTransitive`: IMPL_TRANSITIVE not enforced: accepts a schema that breaks only this rule

1 case, in `implementation` (1).

- A type also implements the interfaces its interfaces implement (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects))

The shortest case, from `implTransitive.1.invalid`:

```
input:    interface Node { id: ID } interface Resource implements Node { id: ID url: String } type Image implements Resource { id: ID url: String } type Query { i: Image }
response: {"valid":true}
expected: invalid: breaks IMPL_TRANSITIVE and no other rule
```

<a id="schema-finding-14"></a>

#### 14. `implTransitive`: IMPL_TRANSITIVE over-strict: rejects a valid schema one small edit away from one that breaks it

1 case, in `implementation` (1).

- A type also implements the interfaces its interfaces implement (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects))

The shortest case, from `implTransitive.2.valid`:

```
input:    interface A implements B { x: Int } interface B { x: Int } type Query { a: A }
response: {"valid":false,"errors":["There is no object type implementing interface `A`."]}
expected: valid (TypeSystem!Verdict is empty)
```

<a id="schema-finding-15"></a>

#### 15. `implDeprecation`: IMPL_DEPRECATION not enforced: accepts a schema that breaks only this rule

1 case, in `implementation` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- A deprecated implementation field implements a deprecated field (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects))

The shortest case, from `implDeprecation.1.invalid`:

```
input:    [draft] interface I { f: Int } type Query implements I { f: Int @deprecated }
response: {"valid":true}
expected: invalid: breaks IMPL_DEPRECATION and no other rule
```

<a id="schema-finding-16"></a>

#### 16. `unionMembersUnique`: UNION_MEMBERS_UNIQUE not enforced: accepts a schema that breaks only this rule

1 case, in `union` (1).

- A union's member types are unique (MUST, [§3.8](https://spec.graphql.org/draft/#sec-Unions))

The shortest case, from `unionMembersUnique.1.invalid`:

```
input:    union U = Query | Query type Query { u: U }
response: {"valid":true}
expected: invalid: breaks UNION_MEMBERS_UNIQUE and no other rule
```

<a id="schema-finding-17"></a>

#### 17. `enumValuesUnique`: ENUM_VALUES_UNIQUE not enforced: accepts a schema that breaks only this rule

1 case, in `enum` (1).

- An enum's values are unique (MUST, [§3.9](https://spec.graphql.org/draft/#sec-Enums))

The shortest case, from `enumValuesUnique.1.invalid`:

```
input:    enum E { A A } type Query { e: E }
response: {"valid":true}
expected: invalid: breaks ENUM_VALUES_UNIQUE and no other rule
```

<a id="schema-finding-18"></a>

#### 18. `enumValueNameReserved`: ENUM_VALUE_NAME_RESERVED not enforced: accepts a schema that breaks only this rule

1 case, in `enum` (1).

- No enum value begins with __ (MUST, [§4](https://spec.graphql.org/draft/#sec-Introspection))

The shortest case, from `enumValueNameReserved.1.invalid`:

```
input:    enum E { __A } type Query { e: E }
response: {"valid":true}
expected: invalid: breaks ENUM_VALUE_NAME_RESERVED and no other rule
```

<a id="schema-finding-19"></a>

#### 19. `directiveUsesItself`: DIRECTIVE_USES_ITSELF not enforced: accepts a schema that breaks only this rule

1 case, in `directive` (1).

- A directive definition doesn't use itself (MUST, [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `directiveUsesItself.1.invalid`:

```
input:    directive @invalidExample(arg: String @invalidExample) on ARGUMENT_DEFINITION type Query { a: Int }
response: {"valid":true}
expected: invalid: breaks DIRECTIVE_USES_ITSELF and no other rule
```

<a id="schema-finding-20"></a>

#### 20. `directiveReferencesItselfIndirectly`: DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY not enforced: accepts a schema that breaks only this rule

1 case, in `directive` (1).

- A directive definition doesn't reference itself through a type or directive (MUST, [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `directiveReferencesItselfIndirectly.2.invalid`:

```
input:    directive @d(a: Int @e) on ARGUMENT_DEFINITION directive @e(b: Int @d) on ARGUMENT_DEFINITION type Query { a: Int }
response: {"valid":true}
expected: invalid: breaks DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY and no other rule
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
| No two types have the same name (`typeNamesUnique`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✗ 1/2 |
| No type is named like a built-in type (`typeNameNotBuiltin`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✗ 1/3 |
| No type name begins with __ (`typeNameReserved`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✗ 1/2 |
| No two directives have the same name (`directiveNamesUnique`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✓ 2 |
| No directive name begins with __ (`directiveNameReserved`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✓ 2 |
| The query root operation type is provided (`queryRootProvided`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✓ 4 |
| Root operation types are object types (`rootTypesAreObjects`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✓ 6 |
| Root operation types are all different (`rootTypesDifferent`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✗ 2/4 |
| An object or interface type defines one or more fields (`fieldsDefined`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 4 |
| Field names are unique within a type (`fieldNamesUnique`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✗ 1/4 |
| No field name begins with __ (`fieldNameReserved`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 2 |
| Fields return output types (`fieldOutputType`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✓ 4 |
| No argument name begins with __ (`argNameReserved`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 4 |
| Argument names are unique within a field or directive (`argNamesUnique`). Draft only: the October 2021 edition doesn't have argument name uniqueness. | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 4 |
| Arguments accept input types (`argInputType`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✓ 6 |
| A required argument isn't deprecated (`requiredArgNotDeprecated`). Draft only: the October 2021 edition doesn't have deprecated arguments. | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✗ 1/8 (all draft only) |
| An object field argument's default value coerces to its type (`argDefaultCompatible`). Draft only: the October 2021 edition doesn't have default value validation. | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 10/20 (all draft only) |
| A type implements each interface once (`implementsUnique`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✗ 1/2 |
| A type implements only interface types (`implementsInterfaces`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✗ 1/2 |
| An interface doesn't implement itself (`implementsItself`) | MUST | [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✗ 1/2 |
| A type also implements the interfaces its interfaces implement (`implTransitive`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 2/4 |
| An implementation has every field of the interface (`implFieldProvided`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 2 |
| An implementation's field has every argument of the interface field (`implArgProvided`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 2 |
| An implementation's field arguments have the interface's argument types (`implArgInvariant`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 4 |
| An implementation's additional arguments aren't required (`implExtraArgOptional`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 2 |
| An implementation's field returns a subtype of the interface field's type (`implFieldCovariant`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 8 |
| A deprecated implementation field implements a deprecated field (`implDeprecation`). Draft only: the October 2021 edition doesn't have deprecation of implementing fields. | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 1/2 (all draft only) |
| A union has one or more member types (`unionMembersDefined`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✓ 2 |
| A union's member types are unique (`unionMembersUnique`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✗ 1/2 |
| A union's member types are object types (`unionMembersObjects`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✓ 6 |
| An enum has one or more values (`enumValuesDefined`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✓ 2 |
| An enum's values are unique (`enumValuesUnique`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✗ 1/2 |
| No enum value begins with __ (`enumValueNameReserved`) | MUST | [§4](https://spec.graphql.org/draft/#sec-Introspection) | ✗ 1/2 |
| An input object has one or more fields (`inputFieldsDefined`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 2 |
| Input field names are unique within an input object (`inputFieldNamesUnique`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 2 |
| No input field name begins with __ (`inputFieldNameReserved`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 2 |
| Input fields accept input types (`inputFieldInputType`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✓ 2 |
| A required input field isn't deprecated (`requiredInputFieldNotDeprecated`). Draft only: the October 2021 edition doesn't have deprecated input fields. | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✓ 2 |
| A OneOf input object's fields are nullable (`oneOfFieldNullable`). Draft only: the October 2021 edition doesn't have OneOf input objects. | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 2 |
| A OneOf input object's fields have no default value (`oneOfFieldNoDefault`). Draft only: the October 2021 edition doesn't have OneOf input objects. | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 2 |
| An input object can be given a finite value (`inputObjectUnbreakableCycle`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✗ 2/10 (all draft only) |
| Input object default values don't form a cycle (`inputObjectDefaultValueCycle`). Draft only: the October 2021 edition doesn't have default value validation. | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✗ 4/8 (all draft only) |
| A directive has one or more locations (`directiveLocationsDefined`). SDL can't write a directive without locations, so no vector breaks this rule | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | – |
| A directive definition doesn't use itself (`directiveUsesItself`) | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 1/2 |
| A directive definition doesn't reference itself through a type or directive (`directiveReferencesItselfIndirectly`) | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 1/4 |

## Introspect

- **Capabilities:** coerce, custom-scalar-literals, exact-numbers, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 28 submitted, 28 distinct, 0 malformed
- **Skipped:** 10
- **Profile:** the oct2021 edition's introspection types. The draft's introspection query was rejected ("The field `isOneOf` does not exist on the type `__Type`.") and October 2021's was answered, so this run grades against October 2021.
- **Adapter problems:** none
- **Checker self-test:** passed (148 negative controls)
- **Run:** kit 5da3deb09c91, 2026-11-15, strict

### Findings

<a id="introspect-finding-1"></a>

#### 1. `builtinAdditions`, `builtinDefinitions`: the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (defaultValue); the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define

6 cases, in `minimal` (1), `interfaces` (1), `deprecation` (1), `roots` (1), `builtinScalars` (1), `order` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `minimal.defaults`:

```
problem:  added:arguments at __Directive.args, added:arguments at __Field.args, added:arguments at __Type.inputFields, added:fields at __InputValue, added:fields at __Type, arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), defaultValue at @deprecated(reason:), directives at @deprecated
input:    type Query { a: Int }  (the introspection query, October 2021 profile; includeDeprecated: the default)
response: {"name":"deprecated","description":"The @deprecated directive is used within the type system definition language to indicate deprecated portions of a GraphQL service’s schema,such as deprecated fields on a type or deprecated enum values.","isRepeatable":false,"locations":["FIELD_DEFINITION","ARGUMENT_DEFINITION","ENUM_VALUE","INPUT_FIELD_DEFINITION"],"args":[{"name":"reason","description":"Deprecations include a reason for why it is deprecated, which is formatted using Markdown syntax (as specified by CommonMark).","type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"No longer supported.\""}]}
expected: [object Object]
```

<a id="introspect-finding-2"></a>

#### 2. `builtinAdditions`, `builtinDefinitions`: the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (defaultValue); the built-in __Directive has a field October 2021 doesn't define; the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define

5 cases, in `minimal` (1), `interfaces` (1), `roots` (1), `builtinScalars` (1), `order` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `minimal.inc`:

```
problem:  added:arguments at __Directive.args, added:arguments at __Field.args, added:arguments at __Type.inputFields, added:fields at __Directive, added:fields at __InputValue, added:fields at __Type, arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), defaultValue at @deprecated(reason:), directives at @deprecated
input:    type Query { a: Int }  (the introspection query, October 2021 profile; includeDeprecated: true)
response: {"name":"deprecated","description":"The @deprecated directive is used within the type system definition language to indicate deprecated portions of a GraphQL service’s schema,such as deprecated fields on a type or deprecated enum values.","isRepeatable":false,"locations":["FIELD_DEFINITION","ARGUMENT_DEFINITION","ENUM_VALUE","INPUT_FIELD_DEFINITION"],"args":[{"name":"reason","description":"Deprecations include a reason for why it is deprecated, which is formatted using Markdown syntax (as specified by CommonMark).","type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"No longer supported.\""}]}
expected: [object Object]
```

<a id="introspect-finding-3"></a>

#### 3. `builtinAdditions`, `builtinDefinitions`, `builtinDirectives`, `deprecation`, `descriptions`, `directives`: descriptions are the schema's: differs from Introspection.tla; directives describes the schema's own directives (name, locations, isRepeatable), and any of the service's own takes input types: differs from Introspection.tla; doesn't provide @specifiedBy; isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something: differs from Introspection.tla; the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (defaultValue); the built-in __Directive has a field October 2021 doesn't define; the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define

1 case, in `rich` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (SHOULD, [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.1](https://spec.graphql.org/draft/#sec-skip) [§3.13.2](https://spec.graphql.org/draft/#sec-include) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) [§3.13.5](https://spec.graphql.org/draft/#sec-oneOf))
- isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something (MUST, [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated))
- Descriptions are the schema's (MUST, [§3.2](https://spec.graphql.org/draft/#sec-Type-System-Descriptions) [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- directives describes the schema's own directives (name, locations, isRepeatable), and any of the service's own takes input types (MUST, [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `rich.inc`:

```
problem:  added:arguments at __Directive.args, added:arguments at __Field.args, added:arguments at __Type.inputFields, added:fields at __Directive, added:fields at __InputValue, added:fields at __Type, arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), builtinDirectives at @specifiedBy, defaultValue at @deprecated(reason:), deprecation at E.Y, description at Date, directives at @deprecated, directives at the root
input:    """The schema""" schema { query: Q mutation: M } "The root" type Q { a("An argument" x: Int = 3, y: [Int] = 1, z: In = {b: 2}): U, old: String @deprecated(reason: "gone"), d: Date } type M { m(p: Pick!): Boolean } type A { a: Int } type B { b: Int } union U = B | A enum E { X "Why" Y @deprecated } input In { a: Int = 1, b: Int, e: E = Y, old: String } input Pick { id: ID, name: String } scalar Date "Tags a field" directive @tag(v: String, w: Int = 2) repeatable on FIELD_DEFINITION | QUERY  (the introspection query, October 2021 profile; includeDeprecated: true)
response: {"kind":"SCALAR","name":"Date","description":"The `Date` scalar represents an ISO-8601 compliant date type.","specifiedByURL":null,"fields":null,"inputFields":null,"interfaces":null,"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-4"></a>

#### 4. `builtinAdditions`, `builtinDefinitions`, `builtinDirectives`, `descriptions`, `directives`: descriptions are the schema's: differs from Introspection.tla; directives describes the schema's own directives (name, locations, isRepeatable), and any of the service's own takes input types: differs from Introspection.tla; doesn't provide @specifiedBy; the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (defaultValue); the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define

1 case, in `rich` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (SHOULD, [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.1](https://spec.graphql.org/draft/#sec-skip) [§3.13.2](https://spec.graphql.org/draft/#sec-include) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) [§3.13.5](https://spec.graphql.org/draft/#sec-oneOf))
- Descriptions are the schema's (MUST, [§3.2](https://spec.graphql.org/draft/#sec-Type-System-Descriptions) [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- directives describes the schema's own directives (name, locations, isRepeatable), and any of the service's own takes input types (MUST, [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `rich.defaults`:

```
problem:  added:arguments at __Directive.args, added:arguments at __Field.args, added:arguments at __Type.inputFields, added:fields at __InputValue, added:fields at __Type, arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), builtinDirectives at @specifiedBy, defaultValue at @deprecated(reason:), description at Date, directives at @deprecated, directives at the root
input:    """The schema""" schema { query: Q mutation: M } "The root" type Q { a("An argument" x: Int = 3, y: [Int] = 1, z: In = {b: 2}): U, old: String @deprecated(reason: "gone"), d: Date } type M { m(p: Pick!): Boolean } type A { a: Int } type B { b: Int } union U = B | A enum E { X "Why" Y @deprecated } input In { a: Int = 1, b: Int, e: E = Y, old: String } input Pick { id: ID, name: String } scalar Date "Tags a field" directive @tag(v: String, w: Int = 2) repeatable on FIELD_DEFINITION | QUERY  (the introspection query, October 2021 profile; includeDeprecated: the default)
response: {"kind":"SCALAR","name":"Date","description":"The `Date` scalar represents an ISO-8601 compliant date type.","specifiedByURL":null,"fields":null,"inputFields":null,"interfaces":null,"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-5"></a>

#### 5. `builtinAdditions`, `builtinDefinitions`, `defaultValue`: defaultValue encodes the default value, and is null without one: differs from Introspection.tla; the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (defaultValue); the built-in __Directive has a field October 2021 doesn't define; the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define

1 case, in `defaults` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- defaultValue encodes the default value, and is null without one (MUST, [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type))

The shortest case, from `defaults.inc`:

```
problem:  added:arguments at __Directive.args, added:arguments at __Field.args, added:arguments at __Type.inputFields, added:fields at __Directive, added:fields at __InputValue, added:fields at __Type, arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), defaultValue at @deprecated(reason:), defaultValue at Query.f(n:), directives at @deprecated
input:    enum E { X Y } input I { a: Int = 1, b: Int, c: [Int] = 1, e: E = Y, f: Float = 2 } type Query { f(x: [Int] = 1, y: Float = 1, z: ID = 7, w: [[Int]] = [1, 2], i: I = {b: 2}, s: String = "say \"hi\"", n: Int = null, l: [E!] = [X, Y]): Int }  (the introspection query, October 2021 profile; includeDeprecated: true)
response: {"kind":"OBJECT","name":"Query","description":null,"specifiedByURL":null,"fields":[{"name":"f","description":null,"args":[{"name":"x","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}},"defaultValue":"1"},{"name":"y","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1"},{"name":"z","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"7"},{"name":"w","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}}},"defaultValue":"[ 1, 2 ]"},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"I","ofType":null},"defaultValue":"{ b: 2 }"},{"name":"s","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"say \\\"hi\\\"\""},{"name":"n","description":null,"type":{"kind":"SCALAR","name":"Int","ofType":null},"defaultValue":null},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"ENUM","name":"E","ofType":null}}},"defaultValue":"[ X, Y ]"}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-6"></a>

#### 6. `builtinAdditions`, `builtinDefinitions`, `defaultValue`: defaultValue encodes the default value, and is null without one: differs from Introspection.tla; the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (defaultValue); the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define

1 case, in `defaults` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- defaultValue encodes the default value, and is null without one (MUST, [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type))

The shortest case, from `defaults.defaults`:

```
problem:  added:arguments at __Directive.args, added:arguments at __Field.args, added:arguments at __Type.inputFields, added:fields at __InputValue, added:fields at __Type, arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), defaultValue at @deprecated(reason:), defaultValue at Query.f(n:), directives at @deprecated
input:    enum E { X Y } input I { a: Int = 1, b: Int, c: [Int] = 1, e: E = Y, f: Float = 2 } type Query { f(x: [Int] = 1, y: Float = 1, z: ID = 7, w: [[Int]] = [1, 2], i: I = {b: 2}, s: String = "say \"hi\"", n: Int = null, l: [E!] = [X, Y]): Int }  (the introspection query, October 2021 profile; includeDeprecated: the default)
response: {"kind":"OBJECT","name":"Query","description":null,"specifiedByURL":null,"fields":[{"name":"f","description":null,"args":[{"name":"x","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}},"defaultValue":"1"},{"name":"y","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1"},{"name":"z","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"7"},{"name":"w","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}}},"defaultValue":"[ 1, 2 ]"},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"I","ofType":null},"defaultValue":"{ b: 2 }"},{"name":"s","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"say \\\"hi\\\"\""},{"name":"n","description":null,"type":{"kind":"SCALAR","name":"Int","ofType":null},"defaultValue":null},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"ENUM","name":"E","ofType":null}}},"defaultValue":"[ X, Y ]"}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-7"></a>

#### 7. `builtinAdditions`, `builtinDefinitions`, `deprecation`: isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something: differs from Introspection.tla; the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (defaultValue); the built-in __Directive has a field October 2021 doesn't define; the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define

1 case, in `deprecation` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something (MUST, [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated))

The shortest case, from `deprecation.inc`:

```
problem:  added:arguments at __Directive.args, added:arguments at __Field.args, added:arguments at __Type.inputFields, added:fields at __Directive, added:fields at __InputValue, added:fields at __Type, arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), defaultValue at @deprecated(reason:), deprecation at Query.a, directives at @deprecated
input:    type Query { a: Int @deprecated, b(y: Int): Int @deprecated(reason: "Use c"), c: E, old: Old } type Old { x: Int @deprecated(reason: "All of it") } enum E { A B @deprecated(reason: "Gone") }  (the introspection query, October 2021 profile; includeDeprecated: true)
response: {"kind":"OBJECT","name":"Query","description":null,"specifiedByURL":null,"fields":[{"name":"a","description":null,"args":[],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":true,"deprecationReason":"No longer supported."},{"name":"b","description":null,"args":[{"name":"y","description":null,"type":{"kind":"SCALAR","name":"Int","ofType":null},"defaultValue":null}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":true,"deprecationReason":"Use c"},{"name":"c","description":null,"args":[],"type":{"kind":"ENUM","name":"E","ofType":null},"isDeprecated":false,"deprecationReason":null},{"name":"old","description":null,"args":[],"type":{"kind":"OBJECT","name":"Old","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-8"></a>

#### 8. `builtinAdditions`, `builtinDefinitions`, `descriptions`, `specifiedByURL`: descriptions are the schema's: differs from Introspection.tla; doesn't return @specifiedBy, though a scalar's specifiedByURL shows it is provided; specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null; @specifiedBy is returned when a scalar has a URL: differs from Introspection.tla; the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (defaultValue); the built-in __Directive has a field October 2021 doesn't define; the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define

1 case, in `scalars` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- Descriptions are the schema's (MUST, [§3.2](https://spec.graphql.org/draft/#sec-Type-System-Descriptions) [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null; @specifiedBy is returned when a scalar has a URL (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy))

The shortest case, from `scalars.inc`:

```
problem:  added:arguments at __Directive.args, added:arguments at __Field.args, added:arguments at __Type.inputFields, added:fields at __Directive, added:fields at __InputValue, added:fields at __Type, arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), defaultValue at @deprecated(reason:), description at Date, directives at @deprecated, requiredDirective at @specifiedBy, specifiedByURL at Date
input:    "A date" scalar Date @specifiedBy(url: "https://example.com/date") scalar Plain type Query { d: Date, p: Plain }  (the introspection query, October 2021 profile; includeDeprecated: true)
response: {"kind":"SCALAR","name":"Date","description":"The `Date` scalar represents an ISO-8601 compliant date type.","specifiedByURL":"https://example.com/date","fields":null,"inputFields":null,"interfaces":null,"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-9"></a>

#### 9. `builtinAdditions`, `builtinDefinitions`, `descriptions`, `specifiedByURL`: descriptions are the schema's: differs from Introspection.tla; doesn't return @specifiedBy, though a scalar's specifiedByURL shows it is provided; specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null; @specifiedBy is returned when a scalar has a URL: differs from Introspection.tla; the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (defaultValue); the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define

1 case, in `scalars` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- Descriptions are the schema's (MUST, [§3.2](https://spec.graphql.org/draft/#sec-Type-System-Descriptions) [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null; @specifiedBy is returned when a scalar has a URL (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy))

The shortest case, from `scalars.defaults`:

```
problem:  added:arguments at __Directive.args, added:arguments at __Field.args, added:arguments at __Type.inputFields, added:fields at __InputValue, added:fields at __Type, arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), defaultValue at @deprecated(reason:), description at Date, directives at @deprecated, requiredDirective at @specifiedBy, specifiedByURL at Date
input:    "A date" scalar Date @specifiedBy(url: "https://example.com/date") scalar Plain type Query { d: Date, p: Plain }  (the introspection query, October 2021 profile; includeDeprecated: the default)
response: {"kind":"SCALAR","name":"Date","description":"The `Date` scalar represents an ISO-8601 compliant date type.","specifiedByURL":"https://example.com/date","fields":null,"inputFields":null,"interfaces":null,"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-10"></a>

#### 10. `deprecation`, `descriptions`: descriptions are the schema's: differs from Introspection.tla; isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something: differs from Introspection.tla

1 case, in `rich` (1).

- isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something (MUST, [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated))
- Descriptions are the schema's (MUST, [§3.2](https://spec.graphql.org/draft/#sec-Type-System-Descriptions) [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))

The shortest case, from `rich.lookup`:

```
problem:  deprecation at E.Y, description at Date
input:    """The schema""" schema { query: Q mutation: M } "The root" type Q { a("An argument" x: Int = 3, y: [Int] = 1, z: In = {b: 2}): U, old: String @deprecated(reason: "gone"), d: Date } type M { m(p: Pick!): Boolean } type A { a: Int } type B { b: Int } union U = B | A enum E { X "Why" Y @deprecated } input In { a: Int = 1, b: Int, e: E = Y, old: String } input Pick { id: ID, name: String } scalar Date "Tags a field" directive @tag(v: String, w: Int = 2) repeatable on FIELD_DEFINITION | QUERY  (__type(name:) for Q, E, In, Pick, Date, U, Unknown, October 2021 profile; includeDeprecated: true)
response: {"__type(name: \"Date\")":{"kind":"SCALAR","name":"Date","description":"The `Date` scalar represents an ISO-8601 compliant date type.","specifiedByURL":null,"fields":null,"inputFields":null,"interfaces":null,"enumValues":null,"possibleTypes":null}}
expected: [object Object]
```

<a id="introspect-finding-11"></a>

#### 11. `defaultValue`: defaultValue encodes the default value, and is null without one: differs from Introspection.tla

1 case, in `defaults` (1).

- defaultValue encodes the default value, and is null without one (MUST, [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type))

The shortest case, from `defaults.lookup`:

```
problem:  defaultValue at Query.f(n:)
input:    enum E { X Y } input I { a: Int = 1, b: Int, c: [Int] = 1, e: E = Y, f: Float = 2 } type Query { f(x: [Int] = 1, y: Float = 1, z: ID = 7, w: [[Int]] = [1, 2], i: I = {b: 2}, s: String = "say \"hi\"", n: Int = null, l: [E!] = [X, Y]): Int }  (__type(name:) for Query, I, Unknown, October 2021 profile; includeDeprecated: true)
response: {"__type(name: \"Query\")":{"kind":"OBJECT","name":"Query","description":null,"specifiedByURL":null,"fields":[{"name":"f","description":null,"args":[{"name":"x","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}},"defaultValue":"1"},{"name":"y","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1"},{"name":"z","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"7"},{"name":"w","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}}},"defaultValue":"[ 1, 2 ]"},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"I","ofType":null},"defaultValue":"{ b: 2 }"},{"name":"s","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"say \\\"hi\\\"\""},{"name":"n","description":null,"type":{"kind":"SCALAR","name":"Int","ofType":null},"defaultValue":null},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"ENUM","name":"E","ofType":null}}},"defaultValue":"[ X, Y ]"}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}}
expected: [object Object]
```

<a id="introspect-finding-12"></a>

#### 12. `deprecation`: isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something: differs from Introspection.tla

1 case, in `deprecation` (1).

- isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something (MUST, [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated))

The shortest case, from `deprecation.lookup`:

```
problem:  deprecation at Query.a
input:    type Query { a: Int @deprecated, b(y: Int): Int @deprecated(reason: "Use c"), c: E, old: Old } type Old { x: Int @deprecated(reason: "All of it") } enum E { A B @deprecated(reason: "Gone") }  (__type(name:) for Query, Old, E, Unknown, October 2021 profile; includeDeprecated: true)
response: {"__type(name: \"Query\")":{"kind":"OBJECT","name":"Query","description":null,"specifiedByURL":null,"fields":[{"name":"a","description":null,"args":[],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":true,"deprecationReason":"No longer supported."},{"name":"b","description":null,"args":[{"name":"y","description":null,"type":{"kind":"SCALAR","name":"Int","ofType":null},"defaultValue":null}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":true,"deprecationReason":"Use c"},{"name":"c","description":null,"args":[],"type":{"kind":"ENUM","name":"E","ofType":null},"isDeprecated":false,"deprecationReason":null},{"name":"old","description":null,"args":[],"type":{"kind":"OBJECT","name":"Old","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}}
expected: [object Object]
```

<a id="introspect-finding-13"></a>

#### 13. `descriptions`, `specifiedByURL`: descriptions are the schema's: differs from Introspection.tla; specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null; @specifiedBy is returned when a scalar has a URL: differs from Introspection.tla

1 case, in `scalars` (1).

- Descriptions are the schema's (MUST, [§3.2](https://spec.graphql.org/draft/#sec-Type-System-Descriptions) [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null; @specifiedBy is returned when a scalar has a URL (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy))

The shortest case, from `scalars.lookup`:

```
problem:  description at Date, specifiedByURL at Date
input:    "A date" scalar Date @specifiedBy(url: "https://example.com/date") scalar Plain type Query { d: Date, p: Plain }  (__type(name:) for Date, Plain, String, Unknown, October 2021 profile; includeDeprecated: true)
response: {"__type(name: \"Date\")":{"kind":"SCALAR","name":"Date","description":"The `Date` scalar represents an ISO-8601 compliant date type.","specifiedByURL":"https://example.com/date","fields":null,"inputFields":null,"interfaces":null,"enumValues":null,"possibleTypes":null}}
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
| The response is a well-formed execution result: data, errors only as a non-empty list, extensions a map, nothing else (`envelope`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ 28 |
| The query executes, and its result has exactly the fields it selects, nulls included (`executes`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 28 |
| queryType, mutationType and subscriptionType are the root operation types (`roots`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✓ 18 |
| types is the set of all named types (`types`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) | ✓ 18 |
| types has the built-in scalars the schema references, and no others (`builtinScalars`) | MUST | [§3.5](https://spec.graphql.org/draft/#sec-Scalars) [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) | ✓ 18 |
| __type(name:) returns the named type, and null for a name the schema doesn't have (`typeByName`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 10 |
| Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (`typeKinds`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) | ✓ 28 |
| An object's or interface's fields, with their types (`fields`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) | ✓ 28 |
| Field and directive arguments, with their types (`arguments`) | MUST | [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) | ✓ 28 |
| defaultValue encodes the default value, and is null without one (`defaultValue`) | MUST | [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | ✗ 3/28 |
| An input object's inputFields, with their types (`inputFields`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | ✓ 28 |
| An enum's enumValues (`enumValues`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) | ✓ 28 |
| interfaces, and possibleTypes for unions and interfaces (`interfaces`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) | ✓ 28 |
| isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something (`deprecation`). Graded for fields and enum values only: the implementation answered the October 2021 query. | MUST (Oct 2021: fields and enum values only) | [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✗ 4/28 |
| specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null; @specifiedBy is returned when a scalar has a URL (`specifiedByURL`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) | ✗ 3/28 |
| isOneOf is true exactly for OneOf input objects; @oneOf is returned when one is (`isOneOf`). Not graded: the implementation answered the October 2021 query, and October 2021 has no OneOf input objects. | MUST (draft only) | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | – |
| Descriptions are the schema's (`descriptions`) | MUST | [§3.2](https://spec.graphql.org/draft/#sec-Type-System-Descriptions) [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✗ 6/28 |
| directives describes the schema's own directives (name, locations, isRepeatable), and any of the service's own takes input types (`directives`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 2/18 |
| @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (`builtinDirectives`) | SHOULD | [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.1](https://spec.graphql.org/draft/#sec-skip) [§3.13.2](https://spec.graphql.org/draft/#sec-include) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) [§3.13.5](https://spec.graphql.org/draft/#sec-oneOf) | ! 2/18 |
| The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (`builtinDefinitions`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 18/28 |
| The introspection types have no field, argument, enum value or type the spec doesn't define (`builtinAdditions`) | INFO | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | i 18/28 |
| __typename names the root type, and no fields list includes it (`typename`) | MUST | [§4.1](https://spec.graphql.org/draft/#sec-Type-Name-Introspection) | ✓ 28 |
| Fields, arguments, enum values, directives, members and interfaces come in source order (`order`). Not graded: the implementation answered the October 2021 query, and October 2021 has no Stable Ordering. | SHOULD (draft only) | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | – |
| Anything else Introspection!Matches requires (`other`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 28 |

- **Basis for `builtinAdditions`:** No sentence of §4 forbids extending the introspection types. The nearest is "Below are the full set of type system definitions providing schema introspection, which are fully defined in the sections below", which uses no key word, and Appendix A says "A conforming implementation of GraphQL may provide additional functionality, but must not do so where explicitly disallowed". Leaving out or changing a definition stays a MUST, under builtinDefinitions.
