# graphql-java 26.2

Generated from the conformance kit's reports. Back to the [sheet](README.md).

**Notes** (hand-written, from outside the kit):

- The sheet runs the adapter with `--validate`: coerce validates each document first, as `GraphQL.execute` always does, so invalid documents are graded under `invalidNotExecuted` (§6.1.1). graphql-java isn't built to execute unvalidated documents.
- Introspection runs with graphql-java's Good Faith Introspection turned off per request (its documented switch); with it on, graphql-java refuses the kit's full introspection queries.
- The subscription finding and every other area's deviations are described, with source locations and standalone reproductions, in the [adapter's README](../adapters/graphql-java/README.md).

## Execution

- **Capabilities:** absent-vs-null, coerce, custom-directives, custom-scalar-literals, error-propagation-off, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 13450 submitted, 2544 distinct, 1338 malformed
- **Adapter problems:** none
- **Checker self-test:** passed (41 negative controls)
- **Run:** kit 71f0a24bdc40, 2026-11-15, strict, 1500 random runs per fixture (seed 1), exhaustive runs on

### Findings

<a id="execution-finding-1"></a>

#### 1. `eventYieldsResult`: the response stream failed instead of yielding the event's result: …

1338 cases, in `subscription` (1338).

- A subscription event yields an execution result, even when its data is null (MUST, [§6.2.3.2](https://spec.graphql.org/draft/#sec-Response-Stream))

The shortest case, from `subscription`:

```
problem:  the response stream failed instead of yielding the event's result: "response stream error: The field at path '/postLiked' was declared as a non null type, but the code involved in retrieving data has wrongly returned a null value.  The graphql specification requires that the parent field be set to null, or if that is non nullable that it bubble up null to its parent and so on. The non-nullable type is 'Post' within parent type 'Subscription'"
trace:    call postLiked; settle postLiked = null
stream:   failed: response stream error: The field at path '/postLiked' was declared as a non null type, but the code involved in retrieving data has wrongly returned a null value.  The graphql specification requires that the parent field be set to null, or if that is non nullable that it bubble up null to its parent and so on. The non-nullable type is 'Post' within parent type 'Subscription'
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
| The response is sent only once execution is complete (`complete`) | MUST | [§6.3.1](https://spec.graphql.org/draft/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ 2261 |
| data is the completed value: field collection, value completion and null propagation (`dataMatches`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2261 |
| Response keys are in collected field order (`keyOrder`) | SHOULD | [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering) | ✓ 2261 |
| Every error was raised, at the path where it was raised (`errorsWereRaised`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 2261 |
| No two errors share a response path (`errorPathsUnique`) | MUST (Oct 2021: SHOULD) | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2261 |
| Every error is inside a null in data (`errorsInsideNulls`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2261 |
| Every null an error caused comes with an error from one of its causes (`nullsExplained`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 2261 |
| A mutation reports every error its earlier root fields raised (`serialErrorsKept`) | MUST | [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 45 |
| A mutation's root fields execute one after another (`calledSerially`) | MUST | [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) | ✓ 45 |
| Each field is executed once, merged selections included (`callsOnce`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) | ✓ 13450 |
| Only fields the operation selects are executed (`callsSelected`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) | ✓ 13450 |
| A field executes only once its parent has a value that contains it (`callsReachable`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 13450 |
| A request gets a response (`responds`) | MUST | [§7.1](https://spec.graphql.org/draft/#sec-Response-Format) | ✓ 11848 |
| A subscription event yields an execution result, even when its data is null (`eventYieldsResult`) | MUST | [§6.2.3.2](https://spec.graphql.org/draft/#sec-Response-Stream) | ✗ 1338/1522 |
| data holds only positions the operation selects (`dataShape`) | MUST | [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ 6331 |
| A non-finite Float or an unknown enum value raises an execution error (`resultCoercion`) | MUST | [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 685 |
| A fraction returned for an Int (1.2) raises an execution error instead of being truncated (`intFraction`) | SHOULD | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 384 |
| Leaf values are the resolver's canonical value (Int 1, Float 1.5, Boolean true, an enum's first value, "v") (`leafValues`) | MUST | [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 6331 |
| Leaf values use the JSON type §7.2.1 gives their GraphQL type (a number for Int 1, not "1") (`leafEncoding`) | SHOULD | [§7.2.1](https://spec.graphql.org/draft/#sec-JSON-Serialization) | ✓ 6331 |
| An execution result has a data entry (`dataPresent`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 10510 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 10510 |
| The response has no entries besides data, errors and extensions (`additionalEntries`) | MUST | [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ 10510 |
| extensions is a map (`extensions`) | MUST | [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) | – |
| Errors are maps with a message, and extensions, if present, is a map (`errorFormat`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 8896 |
| An error's locations, if present, is a list of maps with line and column, both positive integers (`errorLocations`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 5773 |
| Execution errors have a path to a position the operation selects (`errorPath`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 8896 |
| Paths are lists of response names (aliases, not field names) and integer list indices (`responsePosition`) | MUST (Oct 2021: SHOULD) | [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) | ✓ 8896 |
| Errors have no entries besides message, locations, path and extensions (`errorEntries`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 8896 |
| The adapter follows the kit's protocol (call types, settles) (`protocol`) | ADAPTER | — | ✓ 13450 |
| With error propagation off, an error nulls the position where it happened (graphql-js 17's @experimental_disableErrorPropagation) (`disabledPropagation`) | INFO | — | ✓ 1602 |

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
| [`leaves`](../fixtures/leaves.graphql) | ✓ 1700 |  |
| [`lists`](../fixtures/lists.graphql) | ✓ 1914 |  |
| [`mutation`](../fixtures/mutation.graphql) | ✓ 1590 |  |
| [`noPropagation`](../fixtures/noPropagation.graphql) | ✓ 1602 | outside the spec (graphql-js 17's @experimental_disableErrorPropagation): its failures are informational, under disabledPropagation, except protocol problems and the checks on resolver calls |
| [`nullPropagation`](../fixtures/nullPropagation.graphql) | ✓ 1782 |  |
| [`subscription`](../fixtures/subscription.graphql) | ✗ 1338/1522 |  |
| [`unions`](../fixtures/unions.graphql) | ✓ 1764 |  |

## Parse

- **Capabilities:** absent-vs-null, coerce, custom-directives, custom-scalar-literals, error-propagation-off, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 2007 submitted, 2007 distinct, 0 malformed
- **Draft only:** 92 of the failing vectors (of 116 draft-only vectors) rely on grammar or rules only in the draft
- **Adapter problems:** none
- **Checker self-test:** passed (7 negative controls)
- **Run:** kit 71f0a24bdc40, 2026-11-15, strict

### Findings

<a id="parse-finding-1"></a>

#### 1. `descriptions`: rejects what §2.2 Descriptions accepts

84 cases, in `random-documents` (80), `parser-examples` (3), `variable-definitions` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- Descriptions on operations, fragments and variables, not on the query shorthand (MUST, [§2.2](https://spec.graphql.org/draft/#sec-Descriptions))

The shortest case, from `parser-examples`:

```
input:    [draft] "\"d\" query {a}"
response: {"ok":false,"error":"Invalid syntax with offending token '\"d\"' at line 1 column 1"}
expected: {"ok":true}
```

<a id="parse-finding-2"></a>

#### 2. `selectionSets`: rejects what §2.5 Selection Sets accepts

8 cases, in `random-documents` (4), `parser-examples` (3), `field-suffixes` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- Selection sets, including empty ones (MUST, [§2.5](https://spec.graphql.org/draft/#sec-Selection-Sets))

The shortest case, from `parser-examples`:

```
input:    [draft] "{}"
response: {"ok":false,"error":"Invalid syntax with offending token '}' at line 1 column 2"}
expected: {"ok":true}
```

<a id="parse-finding-3"></a>

#### 3. `stringValue`: accepts what §2.10.4 String Value rejects

4 cases, in `lexer-examples` (2), `block-strings` (2).

- String values and block strings (MUST, [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value))

The shortest case, from `lexer-examples`:

```
input:    "{a(x: \"\"\"\\\"\"\")}"
sibling:  "{a(x: \"\"\"\"\"\")}", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-4"></a>

#### 4. `lineTerminators`: accepts what §2.1.2 Line Terminators rejects

3 cases, in `ignored` (3).

- Line terminators are LF, CR and CR LF only (MUST, [§2.1.2](https://spec.graphql.org/draft/#sec-Line-Terminators))

The shortest case, from `ignored`:

```
input:    "{a b}"
sibling:  "{ab}", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-5"></a>

#### 5. `variables`: accepts what §2.11 Variables rejects

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
| Source text is a sequence of SourceCharacter (`sourceText`) | MUST | [§2.1](https://spec.graphql.org/draft/#sec-Source-Text) | ✓ 34 |
| White space is tab and space only (`whiteSpace`) | MUST | [§2.1.1](https://spec.graphql.org/draft/#sec-White-Space) | ✓ 27 |
| Line terminators are LF, CR and CR LF only (`lineTerminators`) | MUST | [§2.1.2](https://spec.graphql.org/draft/#sec-Line-Terminators) | ✗ 3/31 |
| A comment runs to the end of its line (`comments`) | MUST | [§2.1.3](https://spec.graphql.org/draft/#sec-Comments) | ✓ 21 |
| Commas are insignificant (`insignificantCommas`) | MUST | [§2.1.4](https://spec.graphql.org/draft/#sec-Insignificant-Commas) | ✓ 5 |
| Every character outside ignored tokens is part of a token (`lexicalTokens`) | MUST | [§2.1.5](https://spec.graphql.org/draft/#sec-Lexical-Tokens) | ✓ 43 |
| Ignored tokens may appear before and after every token (`ignoredTokens`) | MUST | [§2.1.6](https://spec.graphql.org/draft/#sec-Ignored-Tokens) | ✓ 427 |
| Punctuators, and `...` only as a whole (`punctuators`) | MUST | [§2.1.7](https://spec.graphql.org/draft/#sec-Punctuators) | ✓ 40 |
| Names (`names`) | MUST | [§2.1.8](https://spec.graphql.org/draft/#sec-Names) | ✓ 14 |
| Descriptions on operations, fragments and variables, not on the query shorthand (`descriptions`) | MUST | [§2.2](https://spec.graphql.org/draft/#sec-Descriptions) | ✗ 84/121 (all draft only) |
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
| Int values (`intValue`) | MUST | [§2.10.1](https://spec.graphql.org/draft/#sec-Int-Value) | ✓ 46 |
| Float values (`floatValue`) | MUST | [§2.10.2](https://spec.graphql.org/draft/#sec-Float-Value) | ✓ 35 |
| Boolean values (`booleanValue`) | MUST | [§2.10.3](https://spec.graphql.org/draft/#sec-Boolean-Value) | ✓ 3 |
| String values and block strings (`stringValue`) | MUST | [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value) | ✗ 4/153 |
| Null value (`nullValue`) | MUST | [§2.10.5](https://spec.graphql.org/draft/#sec-Null-Value) | ✓ 2 |
| Enum values (`enumValue`) | MUST | [§2.10.6](https://spec.graphql.org/draft/#sec-Enum-Value) | ✓ 14 |
| List values (`listValue`) | MUST | [§2.10.7](https://spec.graphql.org/draft/#sec-List-Value) | ✓ 102 |
| Input object values (`inputObjectValues`) | MUST | [§2.10.8](https://spec.graphql.org/draft/#sec-Input-Object-Values) | ✓ 107 |
| Variables and variable definitions (`variables`) | MUST | [§2.11](https://spec.graphql.org/draft/#sec-Variables) | ✗ 1/158 |
| Type references (`typeReferences`) | MUST | [§2.12](https://spec.graphql.org/draft/#sec-Type-References) | ✓ 114 |
| Directives (`directives`) | MUST | [§2.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 112 |

## Validate

- **Capabilities:** absent-vs-null, coerce, custom-directives, custom-scalar-literals, error-propagation-off, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 3088 submitted, 3088 distinct, 0 malformed
- **Vectors:** 3088 of 3100 graded (not graded: 12 unspecified)
- **Draft only:** 6 of the failing vectors (of 178 draft-only vectors) rely on grammar or rules only in the draft
- **Adapter problems:** none
- **Checker self-test:** passed (9 negative controls)
- **Run:** kit 71f0a24bdc40, 2026-11-15, strict

### Findings

<a id="validate-finding-1"></a>

#### 1. `singleRootField`: crashes on documents that break only §5.2.4.1 Single Root Field, instead of rejecting them

22 cases, in `operations` (20), `spec` (2).

- Single Root Field (MUST, [§5.2.4.1](https://spec.graphql.org/draft/#sec-Single-Root-Field))

The shortest case, from `spec`:

```
problem:  java.lang.NullPointerException: Cannot invoke "java.lang.Boolean.booleanValue()" because the return value of "java.util.Map.get(Object)" is null
input:    SingleRootField-spec-7: subscription sub($bool: Boolean!) { newMessage @include(if: $bool) { body sender } }
response: "the adapter answered with an error: java.lang.NullPointerException: Cannot invoke \"java.lang.Boolean.booleanValue()\" because the return value of \"java.util.Map.get(Object)\" is null"
expected: invalid: SingleRootField ["sub"]
```

<a id="validate-finding-2"></a>

#### 2. `fieldSelectionMerging`: §5.3.2 Field Selection Merging isn't enforced: accepts documents that break only this rule

22 cases, in `merging` (22).

- Field Selection Merging (MUST, [§5.3.2](https://spec.graphql.org/draft/#sec-Field-Selection-Merging))

The shortest case, from `merging`:

```
input:    FieldSelectionMerging-59: { node(id: "1") { ... on User { a: __typename } ... on Post { a: id } } }
response: {"valid":true,"errors":[]}
expected: invalid: FieldSelectionMerging ["conflict"]
```

<a id="validate-finding-3"></a>

#### 3. `allVariableUsagesAreAllowed`: §5.8.5 All Variable Usages Are Allowed isn't enforced: accepts documents that break only this rule; all rely on the draft

4 cases, in `variables` (2), `spec` (2). All rely on grammar or rules that are only in the draft, not in October 2021.

- All Variable Usages Are Allowed (MUST, [§5.8.5](https://spec.graphql.org/draft/#sec-All-Variable-Usages-Are-Allowed))

The shortest case, from `spec`:

```
input:    [draft] AllVariableUsagesAreAllowed-spec-8: mutation addNullableCat($cat: CatInput) { addPet(pet: {cat: $cat}) { name } }
response: {"valid":true,"errors":[]}
expected: invalid: AllVariableUsagesAreAllowed ["cat"]
```

<a id="validate-finding-4"></a>

#### 4. `singleRootField`: §5.2.4.1 Single Root Field isn't enforced: accepts documents that break only this rule; all rely on the draft

1 case, in `random` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- Single Root Field (MUST, [§5.2.4.1](https://spec.graphql.org/draft/#sec-Single-Root-Field))

The shortest case, from `random`:

```
input:    [draft] SingleRootField-51: subscription S0 { b: postAdded @include(if: true) { name ...F1 } } fragment F1 on Post { score }
response: {"valid":true,"errors":[]}
expected: invalid: SingleRootField ["S0"]
```

<a id="validate-finding-5"></a>

#### 5. `valuesOfCorrectType`: §5.6.1 Values of Correct Type isn't enforced: accepts documents that break only this rule; all rely on the draft

1 case, in `values` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- Values of Correct Type (MUST, [§5.6.1](https://spec.graphql.org/draft/#sec-Values-of-Correct-Type))

The shortest case, from `values`:

```
input:    [draft] ValuesOfCorrectType-82: { echo(pick: {id: null}) }
response: {"valid":true,"errors":[]}
expected: invalid: ValuesOfCorrectType ["value"]
```

<a id="validate-finding-6"></a>

#### 6. `directivesAreUniquePerLocation`: §5.7.3 Directives Are Unique per Location isn't enforced: accepts documents that break only this rule

1 case, in `directives` (1).

- Directives Are Unique per Location (MUST, [§5.7.3](https://spec.graphql.org/draft/#sec-Directives-Are-Unique-per-Location))

The shortest case, from `directives`:

```
input:    DirectivesAreUniquePerLocation-3: query Q($v: Int @once @once) { echo(int: $v) }
response: {"valid":true,"errors":[]}
expected: invalid: DirectivesAreUniquePerLocation ["once"]
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
| Single Root Field (`singleRootField`) | MUST | [§5.2.4.1](https://spec.graphql.org/draft/#sec-Single-Root-Field) | ✗ 23/59 (1 draft only) |
| Field Selections (`fieldSelections`) | MUST | [§5.3.1](https://spec.graphql.org/draft/#sec-Field-Selections) | ✓ 25 |
| Field Selection Merging (`fieldSelectionMerging`) | MUST | [§5.3.2](https://spec.graphql.org/draft/#sec-Field-Selection-Merging) | ✗ 22/674 |
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
| Values of Correct Type (`valuesOfCorrectType`) | MUST | [§5.6.1](https://spec.graphql.org/draft/#sec-Values-of-Correct-Type) | ✗ 1/282 (all draft only) |
| Input Object Field Names (`inputObjectFieldNames`). every document that breaks this rule also breaks §5.6.1 Values of Correct Type, which subsumes it, so a rejection can't be credited to this rule; accepting one fails both | MUST | [§5.6.2](https://spec.graphql.org/draft/#sec-Input-Object-Field-Names) | ⊂ |
| Input Object Field Uniqueness (`inputObjectFieldUniqueness`) | MUST | [§5.6.3](https://spec.graphql.org/draft/#sec-Input-Object-Field-Uniqueness) | ✓ 6 |
| Input Object Required Fields (`inputObjectRequiredFields`). every document that breaks this rule also breaks §5.6.1 Values of Correct Type, which subsumes it, so a rejection can't be credited to this rule; accepting one fails both | MUST | [§5.6.4](https://spec.graphql.org/draft/#sec-Input-Object-Required-Fields) | ⊂ |
| Directives Are Defined (`directivesAreDefined`) | MUST | [§5.7.1](https://spec.graphql.org/draft/#sec-Directives-Are-Defined) | ✓ 24 |
| Directives Are in Valid Locations (`directivesAreInValidLocations`) | MUST | [§5.7.2](https://spec.graphql.org/draft/#sec-Directives-Are-in-Valid-Locations) | ✓ 27 |
| Directives Are Unique per Location (`directivesAreUniquePerLocation`) | MUST | [§5.7.3](https://spec.graphql.org/draft/#sec-Directives-Are-Unique-per-Location) | ✗ 1/10 |
| Variable Uniqueness (`variableUniqueness`) | MUST | [§5.8.1](https://spec.graphql.org/draft/#sec-Variable-Uniqueness) | ✓ 6 |
| Variables Are Input Types (`variablesAreInputTypes`) | MUST | [§5.8.2](https://spec.graphql.org/draft/#sec-Variables-Are-Input-Types) | ✓ 4 |
| All Variable Uses Defined (`allVariableUsesDefined`) | MUST | [§5.8.3](https://spec.graphql.org/draft/#sec-All-Variable-Uses-Defined) | ✓ 15 |
| All Variables Used (`allVariablesUsed`) | MUST | [§5.8.4](https://spec.graphql.org/draft/#sec-All-Variables-Used) | ✓ 18 |
| All Variable Usages Are Allowed (`allVariableUsagesAreAllowed`) | MUST | [§5.8.5](https://spec.graphql.org/draft/#sec-All-Variable-Usages-Are-Allowed) | ✗ 4/636 (all draft only) |
| Valid documents are accepted (`acceptsValid`) | MUST | [§5](https://spec.graphql.org/draft/#sec-Validation) | ✓ 984 |

- **Basis for `acceptsValid`:** a document is valid when it satisfies every rule of §5, and only invalid requests are kept from execution (§6.1.1); rejecting a valid document applies a rule the spec doesn't have

## Coerce

- **Capabilities:** absent-vs-null, coerce, custom-directives, custom-scalar-literals, error-propagation-off, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 2042 submitted, 2042 distinct, 0 malformed
- **Draft only:** 3 of the failing vectors (of 45 draft-only vectors) rely on grammar or rules only in the draft
- **Adapter problems:** none
- **Checker self-test:** passed (24372 negative controls)
- **Run:** kit 71f0a24bdc40, 2026-11-15, strict

### Findings

<a id="coerce-finding-1"></a>

#### 1. `id`: accepts what §3.5.5 (ID) rejects

31 cases, in `variable` (31).

- ID rejects input values other than strings and integers (MUST, [§3.5.5](https://spec.graphql.org/draft/#sec-ID))

The shortest case, from `variable`:

```
input:    query($x: ID) { id(v: $x) }  variables: {"x": []}
response: {"response":{"data":{"id":"ok"}},"calls":[{"path":["id"],"arguments":{"v":"[]"}}]}
expected: a request error
```

<a id="coerce-finding-2"></a>

#### 2. `onlyValidExecuted`: executes an invalid document its validator doesn't reject, though §6.1.1 (Validating Requests) says only valid documents should be executed (the rule it misses is the validate area's)

3 cases, in `oneOf` (3). All rely on grammar or rules that are only in the draft, not in October 2021.

- Only valid documents are executed (SHOULD, [§6.1.1](https://spec.graphql.org/draft/#sec-Validating-Requests) [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `oneOf`:

```
input:    [draft] { oneOfExample(arg: { a: null }) }  variables: {}
response: {"response":{"errors":[{"message":"Exception while fetching data (/oneOfExample) : OneOf type field 'ExampleOneOfInputObject.a' must be non-null.","locations":[{"line":1,"column":3}],"path":["oneOfExample"],"extensions":{"classification":"DataFetchingException"}}],"data":{"oneOfExample":null}},"calls":[]}
expected: a request error
```

<a id="coerce-finding-3"></a>

#### 3. `list`: accepts what §3.11 (List) rejects

1 case, in `nested-variable` (1).

- Lists: each item coerced, a single value wrapped in a list (MUST, [§3.11](https://spec.graphql.org/draft/#sec-List))

The shortest case, from `nested-variable`:

```
input:    query($x: Int = 1) { intsNN(v: [1, $x]) }  variables: {"x": null}
response: {"response":{"data":{"intsNN":"ok"}},"calls":[{"path":["intsNN"],"arguments":{"v":[1,null]}}]}
expected: a field error at intsNN
```

<a id="coerce-finding-4"></a>

#### 4. `stringValue`: coerces to the wrong value under §2.10.4 (String Value)

1 case, in `string-value` (1).

- A string literal's escapes and block string indentation decode to its Unicode text (MUST, [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value))

The shortest case, from `string-value`:

```
input:    { string(v: """	a
		b  c""") }  variables: {}
response: {"response":{"data":{"string":"ok"}},"calls":[{"path":["string"],"arguments":{"v":"\ta\r\nb\r  c"}}]}
expected: string resolved with {"v":"\ta\nb\nc"}
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
| Int accepts only integer input values (`int`) | MUST | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) | ✓ 196 |
| Int rejects integers outside the signed 32-bit range (`intRange`) | SHOULD | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) | ✓ 20 |
| Float accepts integer and float input values, and rejects non-finite values (`float`) | MUST | [§3.5.2](https://spec.graphql.org/draft/#sec-Float) | ✓ 59 |
| Float rejects an integer a double can't hold exactly (`floatPrecision`) | SHOULD | [§3.5.2](https://spec.graphql.org/draft/#sec-Float) | – |
| String accepts only string input values (`string`) | MUST | [§3.5.3](https://spec.graphql.org/draft/#sec-String) | ✓ 52 |
| A string literal's escapes and block string indentation decode to its Unicode text (`stringValue`) | MUST | [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value) | ✗ 1/12 |
| Boolean accepts only boolean input values (`boolean`) | MUST | [§3.5.4](https://spec.graphql.org/draft/#sec-Boolean) | ✓ 51 |
| String and integer input values are coerced to ID strings (`idCoerced`) | SHOULD | [§3.5.5](https://spec.graphql.org/draft/#sec-ID) | ✓ 28 |
| ID rejects input values other than strings and integers (`id`) | MUST | [§3.5.5](https://spec.graphql.org/draft/#sec-ID) | ✗ 31/31 |
| Enums accept their own values, and reject string literals and unknown values (`enum`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✓ 100 |
| Input objects: an object of defined fields, required fields, variables in fields (`inputObject`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 237 |
| An omitted input field gets its default value (`inputFieldDefaults`) | SHOULD | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 56 |
| OneOf input objects take exactly one non-null field (`oneOf`) | MUST | [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 10 |
| Lists: each item coerced, a single value wrapped in a list (`list`) | MUST | [§3.11](https://spec.graphql.org/draft/#sec-List) | ✗ 1/308 |
| Non-Null rejects null (`nonNull`) | MUST | [§3.12](https://spec.graphql.org/draft/#sec-Non-Null) | – |
| CoerceVariableValues: defaults, missing and null values, and failures as request errors (`variables`) | MUST | [§6.1.2](https://spec.graphql.org/draft/#sec-Coercing-Variable-Values) | ✓ 875 |
| CoerceArgumentValues: defaults, missing variables, and failures as field errors (`arguments`) | MUST | [§6.4.1](https://spec.graphql.org/draft/#sec-Coercing-Field-Arguments) | ✓ 33 |
| GetOperation: the operation operationName names, or the only one, else a request error (`getOperation`) | MUST | [§6.1](https://spec.graphql.org/draft/#sec-Executing-Requests) | ✓ 18 |
| A document with known validation errors fails as a request error, without executing (`invalidNotExecuted`) | MUST | [§6.1.1](https://spec.graphql.org/draft/#sec-Validating-Requests) | ✓ 782 |
| Only valid documents are executed (`onlyValidExecuted`) | SHOULD | [§6.1.1](https://spec.graphql.org/draft/#sec-Validating-Requests) [§5](https://spec.graphql.org/draft/#sec-Validation) | ! 3/3 (all draft only) |
| A valid document isn't rejected at validation (`acceptsValid`) | MUST | [§5](https://spec.graphql.org/draft/#sec-Validation) | ✓ 1257 |
| A request error result has no data entry (`requestErrorNoData`) | MUST | [§7.1.3](https://spec.graphql.org/draft/#sec-Request-Error-Result) | ✓ 1586 |
| A request gets a response (`responds`) | MUST | [§7](https://spec.graphql.org/draft/#sec-Response) | ✓ 491 |
| A field error's path is the field's response path (`fieldErrorPath`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) | ✓ 8 |
| Every error is a map with a string message (`errorFormat`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 2042 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 2042 |
| JSON strings with a lone surrogate: kept as sent, replaced with U+FFFD, or refused (`loneSurrogates`). kept as sent: 2. Observed: kept as sent 2 | INFO | — | ✓ 2 |
| JSON numbers a double can't hold: read exactly, read as binary64, or refused (`jsonNumbers`) | INFO | — | ✓ 3 |

- **Basis for `intRange`:** "If the integer input value represents a value less than -2^31 or greater than or equal to 2^31, a request error should be raised."
- **Basis for `float`:** A fractional value is kept as its decimal, which the vectors only use with at most 15 significant digits. Integers a double can't hold exactly are floatPrecision's.
- **Basis for `floatPrecision`:** The sentence says a request error "must be raised" for "a value outside the available precision", but which values that covers is Coercion.tla's reading (an integral value must be exactly representable). A fraction such as 0.1 has no exact double either, and is accepted, so the text doesn't settle it, and the check takes the weaker level.
- **Basis for `string`:** A JSON string with a lone surrogate is graded under loneSurrogates, not here.
- **Basis for `stringValue`:** §2.10.4's Static Semantics give a StringValue's Unicode text: each escape sequence's value, and for a block string BlockStringValue(), which removes the common indentation and the leading and trailing blank lines. They have no key word, but they define the value §3.5.3 then accepts, and the draft says "Errors encountered during this evaluation ... must result in a parsing error". The vectors use only escapes and block strings whose text is the same in both editions (no braced or surrogate pair escapes). Expected texts come from Lexer.tla.
- **Basis for `idCoerced`:** "any string (such as \"4\") or integer (such as 4 or -4) input value should be coerced to ID". The format of an ID made from an integer is the service's: any string that writes the integer's exact value passes, such as "1e+21" for 10^21.
- **Basis for `enum`:** String literals must be rejected. For JSON variables, "strings may be interpreted as the enum input value with the same name": a MAY, so taking the string and rejecting it both pass.
- **Basis for `inputObject`:** The "must" sentences: the value must be an object without undefined fields, a variable's runtime value must be used, and §3.12 makes a missing Non-Null field an error that must be raised. Field defaults are a "should", graded by inputFieldDefaults.
- **Basis for `inputFieldDefaults`:** "If no value is provided for a defined input object field and that field definition provides a default value, the result of coercing the default value ... should be used." The SHOULD applies to each field: a result that is right except that it leaves out some or all of such defaults fails this check, not inputObject.
- **Basis for `oneOf`:** §3.10.1 (the draft only): the value "must contain exactly one entry and that entry must not be null or the null literal, otherwise a request error must be raised", and "The resulting coerced map must contain exactly one entry and the value for that entry must not be null, otherwise an execution error must be raised." The vectors are §3.10.1's table of examples and a few more, on a schema of their own (the vectors' `schema: "oneOf"`), all draft-only.
- **Basis for `list`:** An item that isn't a list, where the item type is a list, is coerced as a list of one: "list values are accepted only when each item in the list can be accepted by the list's item type", and a value that is "not a list" is accepted by a list type as "a list of size one". That prose is the same in both editions. October 2021's table of examples says "Error: Incorrect item value" for [1, 2, 3] as [[Int]], but examples are non-normative ("Examples in this document are non-normative"), and the draft's table gives [[1], [2], [3]]. So these vectors aren't draft-only, and the table's answer fails this check under a finding of its own.
- **Basis for `getOperation`:** Includes a mutation running on the mutation root type, and only the selected operation's variables being coerced.
- **Basis for `invalidNotExecuted`:** "If validation errors are known, they should be reported in the list of \"errors\" in the response and the request must fail without operation execution." The MUST holds only where the errors are known: graded for adapters without `unvalidated` that claim `validate`, on vectors Validation.tla rejects and the implementation's own validator (asked through the validate area) rejects too. A request error, no data, no resolver called. October 2021 says the same.
- **Basis for `onlyValidExecuted`:** "only operations from documents which pass all validation rules should be executed" (§6.1.1), and "execution should only occur for valid requests" (§5). Graded for adapters without `unvalidated`, on vectors Validation.tla rejects whose errors the implementation's validator doesn't report (it accepts the document in the validate area, or the adapter doesn't claim validate, so the kit can't tell). Such a document is a validation rule the implementation misses, which the validate area grades at MUST; executing it is only this SHOULD. October 2021 says the same.
- **Basis for `acceptsValid`:** As the validate area's check of the same name: a document that breaks no validation rule is valid, and must not be refused as invalid. Graded for adapters without `unvalidated` that claim `validate`: a valid vector answered with a request error whose document the implementation's own validator rejects (asked through the validate area) fails here, not under the coercion rule the vector is about, whether or not the reference's answer is also a request error.
- **Basis for `requestErrorNoData`:** The draft: "The request error result map must not contain an entry with key {"data"}." October 2021, §7.1: "If the request failed before execution, due to a syntax error, missing information, or validation error, this entry must not be present." and §7.1.2: "If a request error is raised, execution does not begin and the data entry in the response must not be present." Its §7.1.1 also says "should not be present", but the two MUST sentences are the ones about request errors, so the check is a MUST in both editions. A request error with "data": null is still a request error for the vector's own check, and fails this one.
- **Basis for `responds`:** "When a GraphQL service receives a request, it must return a well-formed response." October 2021 says the same. The adapter answers with an `error` when the implementation produced no response at all, for example because it threw. Execution's check of the same name grades the same sentence. A vector whose reference answer is a request error, under a MUST check, counts that against its own check instead: a request error is a response, so no response doesn't match it. Every other vector exercises this check.
- **Basis for `fieldErrorPath`:** §7.1.6: an error that "can be associated to a particular field in the GraphQL result ... must contain an entry with the key {"path"} with a response path which describes the response position which raised the error". §7.1.4: a response path names response positions, not arguments. A result whose data holds the field as null, with one error and no resolver call, is a field error whatever its path. If that is the answer the vector expects, a path other than the field's fails this check. Every vector that accepts a field error exercises it.
- **Basis for `errorFormat`:** "Every error must contain an entry with the key {"message"} with a string description of the error", and each error "must be a map" (§7.1.1, §7.1.3). October 2021 says the same ("each error is a map", "Every error must contain an entry with the key message"). A result whose errors aren't all maps with a string message, such as [null], or a field error with only a path, fails this check wherever its outcome would otherwise match. Every vector exercises it.
- **Basis for `errorsList`:** The same check as execution's. The draft, §7.1.1: "If any errors are raised during operation execution, the execution result must contain an entry with key {"errors"}. The value of this entry must be a non-empty list ... If the request completed without raising any errors, this entry must not be present." October 2021, §7.1: "If the request raised any errors, the response map must contain an entry with key errors. ... If the request completed without raising any errors, this entry must not be present." Its §7.1.2 also says "should not be present", but the §7.1 MUST is the sentence about the entry, so the check is a MUST in both editions, as in execution. A value with "errors": [] is still a value for the vector's own check, and fails this one. Every vector exercises it.
- **Basis for `loneSurrogates`:** §3.5.3 accepts "only valid Unicode string input values" without defining one, and calls a String "a sequence of Unicode code points", which a lone surrogate is. §3.5.5 says nothing about Unicode. RFC 8259 §8.2 calls the behaviour of software that receives such a string unpredictable. Coercion.tla refuses it, but the check also passes the value kept as sent and the value with U+FFFD, and records which happened. It never fails the run.
- **Basis for `jsonNumbers`:** Not a GraphQL rule: RFC 8259 §6 lets a JSON parser limit the range and precision of numbers. Vectors whose answer depends on that count here, never against Float or ID, unless the adapter claims exact-numbers.

## Schema

- **Capabilities:** absent-vs-null, coerce, custom-directives, custom-scalar-literals, error-propagation-off, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 168 submitted, 168 distinct, 0 malformed
- **Vectors:** 168 of 172 graded (not graded: 4 unspecified)
- **Draft only:** 4 of the failing vectors (of 36 draft-only vectors) rely on grammar or rules only in the draft
- **Adapter problems:** none
- **Checker self-test:** passed (343 negative controls)
- **Run:** kit 71f0a24bdc40, 2026-11-15, strict

### Findings

<a id="schema-finding-1"></a>

#### 1. `rootTypesDifferent`: ROOT_TYPES_DIFFERENT not enforced: accepts a schema that breaks only this rule

2 cases, in `root` (2).

- Root operation types are all different (MUST, [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types))

The shortest case, from `rootTypesDifferent.2.invalid`:

```
input:    schema { query: Q subscription: Q } type Q { a: Int } type S { a: Int }
response: {"valid":true}
expected: invalid: breaks ROOT_TYPES_DIFFERENT and no other rule
```

<a id="schema-finding-2"></a>

#### 2. `argDefaultCompatible`: ARG_DEFAULT_COMPATIBLE not enforced: accepts a schema that breaks only this rule

2 cases, in `defaults` (2). All rely on grammar or rules that are only in the draft, not in October 2021.

- An object field argument's default value coerces to its type (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects))

The shortest case, from `argDefaultCompatible.10.invalid`:

```
input:    [draft] type Query { f(x: Float = 1e400): Int }
response: {"valid":true}
expected: invalid: breaks ARG_DEFAULT_COMPATIBLE and no other rule
```

<a id="schema-finding-3"></a>

#### 3. `typeNameNotBuiltin`: TYPE_NAME_NOT_BUILTIN not enforced: accepts a schema that breaks only this rule

1 case, in `names` (1).

- No type is named like a built-in type (MUST, [§3.3](https://spec.graphql.org/draft/#sec-Schema))

The shortest case, from `typeNameNotBuiltin.2.invalid`:

```
input:    type Int { a: String } type Query { a: String }
response: {"valid":true}
expected: invalid: breaks TYPE_NAME_NOT_BUILTIN and no other rule
```

<a id="schema-finding-4"></a>

#### 4. `typeNameReserved`: TYPE_NAME_RESERVED not enforced: accepts a schema that breaks only this rule

1 case, in `names` (1).

- No type name begins with __ (MUST, [§3.3](https://spec.graphql.org/draft/#sec-Schema))

The shortest case, from `typeNameReserved.1.invalid`:

```
input:    type __T { a: Int } type Query { t: __T }
response: {"valid":true}
expected: invalid: breaks TYPE_NAME_RESERVED and no other rule
```

<a id="schema-finding-5"></a>

#### 5. `rootTypesAreObjects`: ROOT_TYPES_ARE_OBJECTS: crashes on a schema that breaks only this rule, instead of rejecting it

1 case, in `root` (1).

- Root operation types are object types (MUST, [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types))

The shortest case, from `rootTypesAreObjects.1.invalid`:

```
problem:  java.lang.ClassCastException: class graphql.schema.GraphQLInterfaceType cannot be cast to class graphql.schema.GraphQLObjectType (graphql.schema.GraphQLInterfaceType and graphql.schema.GraphQLObjectTy
input:    interface Query { a: Int }
response: "the adapter answered with an error: java.lang.ClassCastException: class graphql.schema.GraphQLInterfaceType cannot be cast to class graphql.schema.GraphQLObjectType (graphql.schema.GraphQLInterfaceType and graphql.schema.GraphQLObjectTy"
expected: invalid: breaks ROOT_TYPES_ARE_OBJECTS and no other rule
```

<a id="schema-finding-6"></a>

#### 6. `argInputType`: ARG_INPUT_TYPE: crashes on a schema that breaks only this rule, instead of rejecting it

1 case, in `typeUse` (1).

- Arguments accept input types (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types))

The shortest case, from `argInputType.1.invalid`:

```
problem:  java.lang.ClassCastException: class graphql.schema.GraphQLObjectType cannot be cast to class graphql.schema.GraphQLInputType (graphql.schema.GraphQLObjectType and graphql.schema.GraphQLInputType are i
input:    type Query { f(x: Query): Int }
response: "the adapter answered with an error: java.lang.ClassCastException: class graphql.schema.GraphQLObjectType cannot be cast to class graphql.schema.GraphQLInputType (graphql.schema.GraphQLObjectType and graphql.schema.GraphQLInputType are i"
expected: invalid: breaks ARG_INPUT_TYPE and no other rule
```

<a id="schema-finding-7"></a>

#### 7. `implementsUnique`: IMPLEMENTS_UNIQUE not enforced: accepts a schema that breaks only this rule

1 case, in `implementation` (1).

- A type implements each interface once (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces))

The shortest case, from `implementsUnique.1.invalid`:

```
input:    interface I { a: Int } type Query implements I & I { a: Int }
response: {"valid":true}
expected: invalid: breaks IMPLEMENTS_UNIQUE and no other rule
```

<a id="schema-finding-8"></a>

#### 8. `implDeprecation`: IMPL_DEPRECATION not enforced: accepts a schema that breaks only this rule

1 case, in `implementation` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- A deprecated implementation field implements a deprecated field (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects))

The shortest case, from `implDeprecation.1.invalid`:

```
input:    [draft] interface I { f: Int } type Query implements I { f: Int @deprecated }
response: {"valid":true}
expected: invalid: breaks IMPL_DEPRECATION and no other rule
```

<a id="schema-finding-9"></a>

#### 9. `inputFieldInputType`: INPUT_FIELD_INPUT_TYPE: crashes on a schema that breaks only this rule, instead of rejecting it

1 case, in `input` (1).

- Input fields accept input types (MUST, [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types))

The shortest case, from `inputFieldInputType.1.invalid`:

```
problem:  java.lang.ClassCastException: class graphql.schema.GraphQLObjectType cannot be cast to class graphql.schema.GraphQLInputType (graphql.schema.GraphQLObjectType and graphql.schema.GraphQLInputType are i
input:    input In { x: Query } type Query { f(i: In): Int }
response: "the adapter answered with an error: java.lang.ClassCastException: class graphql.schema.GraphQLObjectType cannot be cast to class graphql.schema.GraphQLInputType (graphql.schema.GraphQLObjectType and graphql.schema.GraphQLInputType are i"
expected: invalid: breaks INPUT_FIELD_INPUT_TYPE and no other rule
```

<a id="schema-finding-10"></a>

#### 10. `inputObjectUnbreakableCycle`: INPUT_OBJECT_UNBREAKABLE_CYCLE not enforced: accepts a schema that breaks only this rule

1 case, in `input` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- An input object can be given a finite value (MUST, [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects))

The shortest case, from `inputObjectUnbreakableCycle.4.invalid`:

```
input:    [draft] input First @oneOf { second: Second } input Second { first: First! } type Query { f(e: First): Int }
response: {"valid":true}
expected: invalid: breaks INPUT_OBJECT_UNBREAKABLE_CYCLE and no other rule
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
| No two types have the same name (`typeNamesUnique`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✓ 1 |
| No type is named like a built-in type (`typeNameNotBuiltin`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✗ 1/1 |
| No type name begins with __ (`typeNameReserved`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✗ 1/1 |
| No two directives have the same name (`directiveNamesUnique`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✓ 1 |
| No directive name begins with __ (`directiveNameReserved`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✓ 1 |
| The query root operation type is provided (`queryRootProvided`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✓ 2 |
| Root operation types are object types (`rootTypesAreObjects`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✗ 1/2 |
| Root operation types are all different (`rootTypesDifferent`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✗ 2/2 |
| An object or interface type defines one or more fields (`fieldsDefined`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 2 |
| Field names are unique within a type (`fieldNamesUnique`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 2 |
| No field name begins with __ (`fieldNameReserved`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 1 |
| Fields return output types (`fieldOutputType`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✓ 2 |
| No argument name begins with __ (`argNameReserved`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 2 |
| Argument names are unique within a field or directive (`argNamesUnique`). Draft only: the October 2021 edition doesn't have argument name uniqueness | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 2 |
| Arguments accept input types (`argInputType`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✗ 1/3 |
| A required argument isn't deprecated (`requiredArgNotDeprecated`). Draft only: the October 2021 edition doesn't have deprecated arguments | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✓ 3 |
| An object field argument's default value coerces to its type (`argDefaultCompatible`). Draft only: the October 2021 edition doesn't have default value validation | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 2/10 (all draft only) |
| A type implements each interface once (`implementsUnique`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✗ 1/1 |
| A type implements only interface types (`implementsInterfaces`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 1 |
| An interface doesn't implement itself (`implementsItself`) | MUST | [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 2 |
| A type also implements the interfaces its interfaces implement (`implTransitive`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 2 |
| An implementation has every field of the interface (`implFieldProvided`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 1 |
| An implementation's field has every argument of the interface field (`implArgProvided`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 1 |
| An implementation's field arguments have the interface's argument types (`implArgInvariant`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 2 |
| An implementation's additional arguments aren't required (`implExtraArgOptional`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 1 |
| An implementation's field returns a subtype of the interface field's type (`implFieldCovariant`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 4 |
| A deprecated implementation field implements a deprecated field (`implDeprecation`). Draft only: the October 2021 edition doesn't have deprecation of implementing fields | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 1/1 (all draft only) |
| A union has one or more member types (`unionMembersDefined`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✓ 1 |
| A union's member types are unique (`unionMembersUnique`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✓ 1 |
| A union's member types are object types (`unionMembersObjects`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✓ 3 |
| An enum has one or more values (`enumValuesDefined`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✓ 1 |
| An enum's values are unique (`enumValuesUnique`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✓ 1 |
| No enum value begins with __ (`enumValueNameReserved`) | MUST | [§4](https://spec.graphql.org/draft/#sec-Introspection) | ✓ 1 |
| An input object has one or more fields (`inputFieldsDefined`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 1 |
| Input field names are unique within an input object (`inputFieldNamesUnique`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 1 |
| No input field name begins with __ (`inputFieldNameReserved`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 1 |
| Input fields accept input types (`inputFieldInputType`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✗ 1/1 |
| A required input field isn't deprecated (`requiredInputFieldNotDeprecated`). Draft only: the October 2021 edition doesn't have deprecated input fields | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✓ 1 |
| A OneOf input object's fields are nullable (`oneOfFieldNullable`). Draft only: the October 2021 edition doesn't have OneOf input objects | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 1 |
| A OneOf input object's fields have no default value (`oneOfFieldNoDefault`). Draft only: the October 2021 edition doesn't have OneOf input objects | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 1 |
| An input object can be given a finite value (`inputObjectUnbreakableCycle`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✗ 1/4 (all draft only) |
| Input object default values don't form a cycle (`inputObjectDefaultValueCycle`). Draft only: the October 2021 edition doesn't have default value validation | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 4 |
| A directive has one or more locations (`directiveLocationsDefined`). SDL can't write a directive without locations, so no vector breaks this rule | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | – |
| A directive definition doesn't use itself (`directiveUsesItself`) | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 2 |
| A directive definition doesn't reference itself through a type or directive (`directiveReferencesItselfIndirectly`) | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 2 |
| Valid schemas are accepted (`acceptsValid`) | MUST | [§3](https://spec.graphql.org/draft/#sec-Type-System) | ✓ 87 |

- **Basis for `acceptsValid`:** a schema is invalid only when it breaks a Type Validation rule of §3 or §4's Reserved Names; rejecting, or crashing on, a schema that breaks none applies a rule the spec doesn't have

## Introspect

- **Capabilities:** absent-vs-null, coerce, custom-directives, custom-scalar-literals, error-propagation-off, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 39 submitted, 39 distinct, 0 malformed
- **Vectors:** 39 of 39 graded
- **Profile:** the draft's introspection types. The draft's introspection query was rejected ("Validation error (UnknownArgument@[__schema/directives]) : Unknown field argument 'includeDeprecated'"). The introspection types lack __Directive.isDeprecated, __Directive.deprecationReason and __Schema.directives(includeDeprecated:), so this run asks the draft's query without them, grades against the draft, and counts what they lack once, under builtinDefinitions.
- **Adapter problems:** none
- **Checker self-test:** passed (176 negative controls)
- **Run:** kit 71f0a24bdc40, 2026-11-15, strict

### Findings

<a id="introspect-finding-1"></a>

#### 1. `builtinAdditions`, `builtinDefinitions`, `builtinNullability`: the built-in @deprecated isn't as the spec defines it (directives); the built-in __Directive.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __Field.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __InputValue.isDeprecated has the spec's type, but not its Non-Null wrapping; October 2021 doesn't define it; the built-in __Type has a field the spec doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.inputFields(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments)

11 cases, in `minimal` (1), `rich` (1), `interfaces` (1), `defaults` (1), `deprecation` (1), `inputDeprecation` (1), `roots` (1), `builtinScalars` (1), `scalars` (1), `oneOf` (1), `order` (1). 2 of them rely on grammar or rules that are only in the draft, not in October 2021.

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- The fields of the introspection types have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))

The shortest case, from `minimal.inc`:

```
problem:  added:fields at __Type, arguments at __Directive.args(includeDeprecated:), arguments at __Field.args(includeDeprecated:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), arguments at __Type.inputFields(includeDeprecated:), directives at @deprecated, enumValues at __DirectiveLocation, nullability at __InputValue.isDeprecated
input:    type Query { a: Int }  (the introspection query; includeDeprecated: true)
response: {"name":"deprecated","description":"Marks the field, argument, input field or enum value as deprecated","isRepeatable":false,"locations":["FIELD_DEFINITION","ARGUMENT_DEFINITION","ENUM_VALUE","INPUT_FIELD_DEFINITION"],"args":[{"name":"reason","description":"The reason for the deprecation","type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"SCALAR","name":"String","ofType":null}},"defaultValue":"\"No longer supported\"","isDeprecated":false,"deprecationReason":null}]}
expected: [object Object]
```

<a id="introspect-finding-2"></a>

#### 2. `builtinDefinitions`, `builtinNullability`: the built-in @deprecated isn't as the spec defines it (directives); the built-in __Directive.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __Field.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __InputValue.isDeprecated has the spec's type, but not its Non-Null wrapping; October 2021 doesn't define it; the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.inputFields(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments)

11 cases, in `minimal` (1), `rich` (1), `interfaces` (1), `defaults` (1), `deprecation` (1), `inputDeprecation` (1), `roots` (1), `builtinScalars` (1), `scalars` (1), `oneOf` (1), `order` (1). 2 of them rely on grammar or rules that are only in the draft, not in October 2021.

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- The fields of the introspection types have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))

The shortest case, from `minimal.defaults`:

```
problem:  arguments at __Directive.args(includeDeprecated:), arguments at __Field.args(includeDeprecated:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), arguments at __Type.inputFields(includeDeprecated:), directives at @deprecated, enumValues at __DirectiveLocation, nullability at __InputValue.isDeprecated
input:    type Query { a: Int }  (the introspection query; includeDeprecated: the default)
response: {"name":"deprecated","description":"Marks the field, argument, input field or enum value as deprecated","isRepeatable":false,"locations":["FIELD_DEFINITION","ARGUMENT_DEFINITION","ENUM_VALUE","INPUT_FIELD_DEFINITION"],"args":[{"name":"reason","description":"The reason for the deprecation","type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"SCALAR","name":"String","ofType":null}},"defaultValue":"\"No longer supported\"","isDeprecated":false,"deprecationReason":null}]}
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
response: {"data":{"a":{"fields":[{"name":"description","args":[]},{"name":"types","args":[]},{"name":"queryType","args":[]},{"name":"mutationType","args":[]},{"name":"directives","args":[]},{"name":"subscriptionType","args":[]}]},"b":{"fields":[{"name":"kind","args":[]},{"name":"name","args":[]},{"name":"description","args":[]},{"name":"fields","args":[{"name":"includeDeprecated"}]},{"name":"interfaces","args":[]},{"name":"possibleTypes","args":[]},{"name":"enumValues","args":[{"name":"includeDeprecated"}]},{"name":"inputFields","args":[{"name":"includeDeprecated"}]},{"name":"ofType","args":[]},{"name":"isOneOf","args":[]},{"name":"specifiedByURL","args":[]}]},"c":{"fields":[{"name":"name","args":[]},{"name":"description","args":[]},{"name":"args","args":[{"name":"includeDeprecated"}]},{"name":"type","args":[]},{"name":"isDeprecated","args":[]},{"name":"deprecationReason","args":[]}]},"d":{"fields":[{"name":"name","args":[]},{"name":"description","args":[]},{"name":"type","args":[]},{"name":"defaultValue","args":[]},{"name":"isDeprecated","args":[]},{"name":"deprecationReason","args":[]}]},"e":{"fields":[{"name":"name","args":[]},{"name":"description","args":[]},{"name":"isDeprecated","args":[]},{"name":"deprecationReason","args":[]}]},"f":{"fields":[{"name":"name","args":[]},{"name":"description","args":[]},{"name":"isRepeatable","args":[]},{"name":"locations","args":[]},{"name":"args","args":[{"name":"includeDeprecated"}]}]}}}
expected: the fields and arguments the spec defines, including __Directive.isDeprecated, __Directive.deprecationReason and __Schema.directives(includeDeprecated:)
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
| The response is a well-formed execution result: data, errors only as a non-empty list, extensions a map, nothing else (`envelope`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ 39 |
| The query executes, and its result has exactly the fields it selects, nulls included (`executes`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 36 |
| queryType, mutationType and subscriptionType are the root operation types (`roots`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✓ 22 |
| types is the set of all named types (`types`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) | ✓ 22 |
| types has the built-in scalars the schema references, and no others (`builtinScalars`) | MUST | [§3.5](https://spec.graphql.org/draft/#sec-Scalars) [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) | ✓ 22 |
| __type(name:) returns the named type, and null for a name the schema doesn't have (`typeByName`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 13 |
| Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (`typeKinds`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) | ✓ 36 |
| An object's or interface's fields, with their types (`fields`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) | ✓ 35 |
| Field and directive arguments, with their types (`arguments`) | MUST | [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) | ✓ 35 |
| defaultValue is null for an input value without a default, and otherwise null or an encoding of the default (`defaultValue`) | MUST | [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | ✓ 35 |
| defaultValue encodes the default value of an input value that has one, rather than returning null (`defaultValueOmitted`) | SHOULD | [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | ✓ 35 |
| An input object's inputFields, with their types (`inputFields`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | ✓ 35 |
| An enum's enumValues (`enumValues`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) | ✓ 35 |
| interfaces, and possibleTypes for unions and interfaces (`interfaces`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) | ✓ 35 |
| isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something (`deprecation`) | MUST (Oct 2021: fields and enum values only) | [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✓ 35 |
| specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null (`specifiedByURL`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) | ✓ 35 |
| isOneOf is true exactly for OneOf input objects (`isOneOf`). Draft only: October 2021 has no OneOf input objects. | MUST (draft only) | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 35 |
| A description the document gives is returned as it is, the schema's included (`descriptions`) | SHOULD | [§3.2](https://spec.graphql.org/draft/#sec-Type-System-Descriptions) [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 35 |
| directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types (`directives`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 22 |
| @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (`builtinDirectives`) | SHOULD | [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.1](https://spec.graphql.org/draft/#sec-skip) [§3.13.2](https://spec.graphql.org/draft/#sec-include) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) [§3.13.5](https://spec.graphql.org/draft/#sec-oneOf) | ✓ 22 |
| The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (`builtinDefinitions`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 23/36 (5 draft only) |
| The fields of the introspection types have the Non-Null wrapping the spec gives them (`builtinNullability`) | SHOULD | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ! 22/35 (all draft only) |
| The introspection types have no field, argument, enum value or type the spec doesn't define (`builtinAdditions`) | INFO | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | i 11/35 (2 draft only) |
| Under the October 2021 profile, a built-in definition that differs from October 2021's is as the draft defines it (`builtinEdition`). Graded only under the October 2021 profile. | INFO | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | – |
| __typename names the root type, and no fields list includes it (`typename`) | MUST | [§4.1](https://spec.graphql.org/draft/#sec-Type-Name-Introspection) | ✓ 35 |
| Fields, arguments, enum values, directives, members and interfaces come in source order (`order`). Draft only: October 2021 has no Stable Ordering. | SHOULD (draft only) | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 35 |
| Anything else Introspection!Matches requires (`other`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 35 |

- **Basis for `defaultValueOmitted`:** §4.2.4: "defaultValue may return a String encoding (using the GraphQL language) of the default value used by this input value in the condition a value is not provided at runtime. If this input value has no default value, returns null." By Appendix A, a lowercase "may" keeps its RFC 2119 meaning, so the encoding is optional; the intent is plainly that a default is encoded, which makes this a SHOULD. A string that isn't an encoding of the default, or one for an input value without a default, still fails defaultValue.
- **Basis for `descriptions`:** §3.2: documentation is "written immediately alongside definitions in a TypeSystemDocument and made available via introspection", which has no key word, and §4.2 says of every description field that it "may return a String or null". So a description the document gives that is lost or replaced fails this SHOULD, and any description is accepted for a definition the document doesn't describe ("" or one of the service's own included).
- **Basis for `builtinNullability`:** The types of the introspection fields are given only by the definitions §4.2 introduces with "Below are the full set of type system definitions providing schema introspection, which are fully defined in the sections below", which has no key word. The sections below say what each field returns ("isRepeatable must return a Boolean"), and a field whose type differs only in Non-Null can still return exactly that. Any other change of type stays under builtinDefinitions, a MUST.
- **Basis for `builtinAdditions`:** No sentence of §4 forbids extending the introspection types. The nearest is "Below are the full set of type system definitions providing schema introspection, which are fully defined in the sections below", which uses no key word, and Appendix A says "A conforming implementation of GraphQL may provide additional functionality, but must not do so where explicitly disallowed". Leaving out or changing a definition stays a MUST, under builtinDefinitions.
- **Basis for `builtinEdition`:** The kit grades against the draft; the October 2021 profile is a fallback for a service whose introspection types the draft's query can't ask. A built-in definition (or an addition) that is exactly the draft's breaks nothing the draft requires, so it is reported here, not under builtinDefinitions or builtinAdditions.
