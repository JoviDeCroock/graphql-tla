# graphql-js 17.1.0

Generated from the conformance kit's reports. Back to the [sheet](README.md).

**Notes** (hand-written, from outside the kit):

- The differential scripts check graphql-js against the references more broadly than the kit's vectors, and document where it departs from the draft: [lexer and parser](../scripts/differential-lexer.mjs) (`KNOWN`), [validation](../scripts/differential-validation.mjs) (`DISCREPANCIES`), [coercion](../scripts/differential-coercion.mjs) (`KNOWN`) and [type system](../scripts/differential-type-system.mjs) (`VALIDATION_DEVIATIONS`).
- Behaviour outside the kit's fixtures is described in the README's [What graphql-js does](../README.md#what-graphql-js-does).

## Execution

- **Capabilities:** absent-vs-null, coerce, custom-scalar-literals, deferred-items, error-propagation-off, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, unvalidated, validate
- **Cases:** 13388 submitted, 2522 distinct, 0 malformed
- **Adapter problems:** none
- **Checker self-test:** passed (25 negative controls)
- **Run:** kit f0039322bf59, 2026-11-15, strict, 1500 random runs per fixture (seed 1), exhaustive runs on

### Findings

None.

### Every check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | Result |
| --- | :---: | :---: | :---: |
| The response is sent only once execution is complete (`complete`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 2522 |
| data is the completed value: field collection, value completion and null propagation (`dataMatches`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2522 |
| Response keys are in collected field order (`keyOrder`) | SHOULD | [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering) | ✓ 2522 |
| Every error was raised, at the path where it was raised (`errorsWereRaised`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 2522 |
| No two errors share a response path (`errorPathsUnique`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2522 |
| Every error is inside a null in data (`errorsInsideNulls`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2522 |
| Every null an error caused comes with an error from its cause (`nullsExplained`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 2522 |
| A mutation reports every error its earlier root fields raised (`serialErrorsKept`) | MUST | [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 45 |
| A mutation's root fields execute one after another (`calledSerially`) | MUST | [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) | ✓ 45 |
| Each field is executed once, merged selections included (`callsOnce`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) | ✓ 13388 |
| Only fields the operation selects are executed (`callsSelected`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) | ✓ 13388 |
| A field executes only once its parent has a value that contains it (`callsReachable`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 13388 |
| A request gets a response (`responds`) | MUST | [§7.1](https://spec.graphql.org/draft/#sec-Response-Format) | ✓ 13388 |
| A subscription event yields an execution result, even when its data is null (`eventYieldsResult`) | MUST | [§6.2.3.2](https://spec.graphql.org/draft/#sec-Response-Stream) | ✓ 1518 |
| data holds only positions the operation selects (`dataShape`) | MUST | [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ 8123 |
| A leaf value its type can't represent (a fraction for an Int, a non-finite Float, an unknown enum value) raises an execution error (`resultCoercion`) | MUST | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 920 |
| Leaf values are the resolver's canonical value (Int 1, Float 1.5, Boolean true, an enum's first value, "v") (`leafValues`) | MUST | [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 8123 |
| An execution result has a data entry (`dataPresent`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 13388 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 13388 |
| The response has no entries besides data, errors and extensions (`additionalEntries`) | MUST | [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ 13388 |
| extensions is a map (`extensions`) | MUST | [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) | – |
| Errors are maps with a message, and well-formed locations and extensions (`errorFormat`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 11682 |
| Execution errors have a path to a position the operation selects (`errorPath`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 11682 |
| Paths use field names and integer list indices (`responsePosition`) | MUST (Oct 2021: SHOULD) | [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) | ✓ 1456 |
| Errors have no entries besides message, locations, path and extensions (`errorEntries`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 11682 |
| The adapter follows the kit's protocol (call types, settles) (`protocol`) | ADAPTER | — | ✓ 13388 |

- **`serialErrorsKept`** is implied rather than stated: §6.4.4: an execution error "must be added to the errors list". §6.3.3 lets an implementation cancel fields that have not yet executed or yielded a value, but §6.3.4 completes each mutation root field before the next starts, so an earlier root field's errors can't have been cancelled.

### Fixtures

| Fixture | Result | Note |
| --- | :---: | :---: |
| [`fragments`](../fixtures/fragments.graphql) | ✓ 1536 |  |
| [`leaves`](../fixtures/leaves.graphql) | ✓ 1700 |  |
| [`lists`](../fixtures/lists.graphql) | ✓ 2002 |  |
| [`mutation`](../fixtures/mutation.graphql) | ✓ 1590 |  |
| [`noPropagation`](../fixtures/noPropagation.graphql) | ✓ 1602 |  |
| [`nullPropagation`](../fixtures/nullPropagation.graphql) | ✓ 1662 |  |
| [`subscription`](../fixtures/subscription.graphql) | ✓ 1518 |  |
| [`unions`](../fixtures/unions.graphql) | ✓ 1778 |  |

## Parse

- **Capabilities:** absent-vs-null, coerce, custom-scalar-literals, deferred-items, error-propagation-off, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, unvalidated, validate
- **Cases:** 1983 submitted, 1983 distinct, 0 malformed
- **Adapter problems:** none
- **Checker self-test:** passed (3 negative controls)
- **Run:** kit f0039322bf59, 2026-11-15, strict

### Findings

<a id="finding-1"></a>

#### 1. `stringValue`: rejects what §2.10.4 String Value accepts

2 cases, in `lexer-examples` (1), `strings` (1).

- String values and block strings (MUST, [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value))

The shortest case, from `lexer-examples`:

```
input:    "{a(x: \"\\u{000000041}\")}"
response: {"ok":false}
expected: {"ok":true}
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
| Source text is a sequence of SourceCharacter (`sourceText`) | MUST | [§2.1](https://spec.graphql.org/draft/#sec-Source-Text) | ✓ 33 |
| White space is tab and space only (`whiteSpace`) | MUST | [§2.1.1](https://spec.graphql.org/draft/#sec-White-Space) | ✓ 28 |
| Line terminators are LF, CR and CR LF only (`lineTerminators`) | MUST | [§2.1.2](https://spec.graphql.org/draft/#sec-Line-Terminators) | ✓ 31 |
| A comment runs to the end of its line (`comments`) | MUST | [§2.1.3](https://spec.graphql.org/draft/#sec-Comments) | ✓ 17 |
| Commas are insignificant (`insignificantCommas`) | MUST | [§2.1.4](https://spec.graphql.org/draft/#sec-Insignificant-Commas) | ✓ 5 |
| Every character outside ignored tokens is part of a token (`lexicalTokens`) | MUST | [§2.1.5](https://spec.graphql.org/draft/#sec-Lexical-Tokens) | ✓ 43 |
| Ignored tokens may appear before and after every token (`ignoredTokens`) | MUST | [§2.1.6](https://spec.graphql.org/draft/#sec-Ignored-Tokens) | ✓ 81 |
| Punctuators, and `...` only as a whole (`punctuators`) | MUST | [§2.1.7](https://spec.graphql.org/draft/#sec-Punctuators) | ✓ 40 |
| Names (`names`) | MUST | [§2.1.8](https://spec.graphql.org/draft/#sec-Names) | ✓ 14 |
| Descriptions on operations, fragments and variables, not on the query shorthand (`descriptions`) | MUST | [§2.2](https://spec.graphql.org/draft/#sec-Descriptions) | ✓ 100 |
| A document is one or more executable definitions (`document`) | MUST | [§2.3](https://spec.graphql.org/draft/#sec-Document) | ✓ 99 |
| Operation definitions and the query shorthand (`operations`) | MUST | [§2.4](https://spec.graphql.org/draft/#sec-Operations) | ✓ 100 |
| Selection sets, including empty ones (`selectionSets`) | MUST | [§2.5](https://spec.graphql.org/draft/#sec-Selection-Sets) | ✓ 95 |
| Fields (`fields`) | MUST | [§2.6](https://spec.graphql.org/draft/#sec-Fields) | ✓ 96 |
| Arguments (`arguments`) | MUST | [§2.7](https://spec.graphql.org/draft/#sec-Arguments) | ✓ 110 |
| Field aliases (`fieldAlias`) | MUST | [§2.8](https://spec.graphql.org/draft/#sec-Field-Alias) | ✓ 94 |
| Fragment definitions and fragment spreads (`fragments`) | MUST | [§2.9](https://spec.graphql.org/draft/#sec-Fragments) | ✓ 117 |
| Type conditions (`typeConditions`) | MUST | [§2.9.1](https://spec.graphql.org/draft/#sec-Type-Conditions) | ✓ 112 |
| Inline fragments (`inlineFragments`) | MUST | [§2.9.2](https://spec.graphql.org/draft/#sec-Inline-Fragments) | ✓ 100 |
| Input values, and no variables in constant values (`inputValues`) | MUST | [§2.10](https://spec.graphql.org/draft/#sec-Input-Values) | ✓ 122 |
| Int values (`intValue`) | MUST | [§2.10.1](https://spec.graphql.org/draft/#sec-Int-Value) | ✓ 42 |
| Float values (`floatValue`) | MUST | [§2.10.2](https://spec.graphql.org/draft/#sec-Float-Value) | ✓ 35 |
| Boolean values (`booleanValue`) | MUST | [§2.10.3](https://spec.graphql.org/draft/#sec-Boolean-Value) | ✓ 3 |
| String values and block strings (`stringValue`) | MUST | [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value) | ✗ 2/146 |
| Null value (`nullValue`) | MUST | [§2.10.5](https://spec.graphql.org/draft/#sec-Null-Value) | ✓ 2 |
| Enum values (`enumValue`) | MUST | [§2.10.6](https://spec.graphql.org/draft/#sec-Enum-Value) | ✓ 10 |
| List values (`listValue`) | MUST | [§2.10.7](https://spec.graphql.org/draft/#sec-List-Value) | ✓ 101 |
| Input object values (`inputObjectValues`) | MUST | [§2.10.8](https://spec.graphql.org/draft/#sec-Input-Object-Values) | ✓ 107 |
| Variables and variable definitions (`variables`) | MUST | [§2.11](https://spec.graphql.org/draft/#sec-Variables) | ✓ 157 |
| Type references (`typeReferences`) | MUST | [§2.12](https://spec.graphql.org/draft/#sec-Type-References) | ✓ 102 |
| Directives (`directives`) | MUST | [§2.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 113 |

## Validate

- **Capabilities:** absent-vs-null, coerce, custom-scalar-literals, deferred-items, error-propagation-off, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, unvalidated, validate
- **Cases:** 3087 submitted, 3087 distinct, 0 malformed
- **Adapter problems:** none
- **Checker self-test:** passed (7 negative controls)
- **Run:** kit f0039322bf59, 2026-11-15, strict

### Findings

<a id="finding-1"></a>

#### 1. `fieldSelectionMerging`: §5.3.2 Field Selection Merging isn't enforced: accepts documents that break only this rule

22 cases, in `merging` (22).

- Field Selection Merging (MUST, [§5.3.2](https://spec.graphql.org/draft/#sec-Field-Selection-Merging))

The shortest case, from `merging`:

```
input:    FieldSelectionMerging-59: { node(id: "1") { ... on User { a: __typename } ... on Post { a: id } } }
response: {"valid":true,"errors":[]}
expected: invalid: FieldSelectionMerging ["conflict"]
```

<a id="finding-2"></a>

#### 2. `allVariableUsagesAreAllowed`: §5.8.5 All Variable Usages Are Allowed isn't enforced: accepts documents that break only this rule; all rely on the draft

2 cases, in `spec` (2). All rely on grammar or rules that are only in the draft, not in October 2021.

- All Variable Usages Are Allowed (MUST, [§5.8.5](https://spec.graphql.org/draft/#sec-All-Variable-Usages-Are-Allowed))

The shortest case, from `spec`:

```
input:    [draft] AllVariableUsagesAreAllowed-spec-8: mutation addNullableCat($cat: CatInput) { addPet(pet: {cat: $cat}) { name } }
response: {"valid":true,"errors":[]}
expected: invalid: AllVariableUsagesAreAllowed ["cat"]
```

<a id="finding-3"></a>

#### 3. `acceptsValid`: rejects valid documents, each one edit from a document that breaks only §5.3.2 Field Selection Merging; the rule it applied is a guess, since the kit doesn't read error messages

1 case, in `merging` (1).

Each rejected document is one edit from a document that breaks only `fieldSelectionMerging`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `merging`:

```
problem:  Fields "a" conflict because they have differing arguments. Use different aliases on the fields to fetch both if this was intentional.
input:    FieldSelectionMerging-valid-11: { a: search(term: "x") { __typename } a: search(term: """x""") { __typename } }
response: {"valid":false,"errors":[{"message":"Fields \"a\" conflict because they have differing arguments. Use different aliases on the fields to fetch both if this was intentional.","locations":[{"line":2,"column":3},{"line":5,"column":3}]}]}
expected: valid
```

<a id="finding-4"></a>

#### 4. `acceptsValid`: rejects valid documents, each one edit from a document that breaks only §5.8.5 All Variable Usages Are Allowed; the rule it applied is a guess, since the kit doesn't read error messages; all rely on the draft

1 case, in `variables` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

Each rejected document is one edit from a document that breaks only `allVariableUsagesAreAllowed`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `variables`:

```
problem:  Variable "$v" is of type "ID" but must be non-nullable to be used for OneOf Input Object "Pick".
input:    [draft] AllVariableUsagesAreAllowed-valid-30: query Q($v: ID = "1") { echo(pick: {id: $v}) }
response: {"valid":false,"errors":[{"message":"Variable \"$v\" is of type \"ID\" but must be non-nullable to be used for OneOf Input Object \"Pick\".","locations":[{"line":1,"column":9},{"line":2,"column":19}]}]}
expected: valid
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
| Executable Definitions (`executableDefinitions`) | MUST | [§5.1.1](https://spec.graphql.org/draft/#sec-Executable-Definitions) | ✓ 4 |
| Operation Type Existence (`operationTypeExistence`) | MUST | [§5.2.1.1](https://spec.graphql.org/draft/#sec-Operation-Type-Existence) | ✓ 12 |
| Operation Name Uniqueness (`operationNameUniqueness`) | MUST | [§5.2.2.1](https://spec.graphql.org/draft/#sec-Operation-Name-Uniqueness) | ✓ 6 |
| Lone Anonymous Operation (`loneAnonymousOperation`) | MUST | [§5.2.3.1](https://spec.graphql.org/draft/#sec-Lone-Anonymous-Operation) | ✓ 21 |
| Single Root Field (`singleRootField`) | MUST | [§5.2.4.1](https://spec.graphql.org/draft/#sec-Single-Root-Field) | ✓ 57 |
| Field Selections (`fieldSelections`) | MUST | [§5.3.1](https://spec.graphql.org/draft/#sec-Field-Selections) | ✓ 22 |
| Field Selection Merging (`fieldSelectionMerging`) | MUST | [§5.3.2](https://spec.graphql.org/draft/#sec-Field-Selection-Merging) | ✗ 22/678 |
| Leaf Field Selections (`leafFieldSelections`) | MUST | [§5.3.3](https://spec.graphql.org/draft/#sec-Leaf-Field-Selections) | ✓ 39 |
| Argument Names (`argumentNames`) | MUST | [§5.4.1](https://spec.graphql.org/draft/#sec-Argument-Names) | ✓ 8 |
| Argument Uniqueness (`argumentUniqueness`) | MUST | [§5.4.2](https://spec.graphql.org/draft/#sec-Argument-Uniqueness) | ✓ 6 |
| Required Arguments (`requiredArguments`) | MUST | [§5.4.3](https://spec.graphql.org/draft/#sec-Required-Arguments) | ✓ 10 |
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
| Directives Are Unique per Location (`directivesAreUniquePerLocation`) | MUST | [§5.7.3](https://spec.graphql.org/draft/#sec-Directives-Are-Unique-per-Location) | ✓ 10 |
| Variable Uniqueness (`variableUniqueness`) | MUST | [§5.8.1](https://spec.graphql.org/draft/#sec-Variable-Uniqueness) | ✓ 6 |
| Variables Are Input Types (`variablesAreInputTypes`) | MUST | [§5.8.2](https://spec.graphql.org/draft/#sec-Variables-Are-Input-Types) | ✓ 4 |
| All Variable Uses Defined (`allVariableUsesDefined`) | MUST | [§5.8.3](https://spec.graphql.org/draft/#sec-All-Variable-Uses-Defined) | ✓ 15 |
| All Variables Used (`allVariablesUsed`) | MUST | [§5.8.4](https://spec.graphql.org/draft/#sec-All-Variables-Used) | ✓ 18 |
| All Variable Usages Are Allowed (`allVariableUsagesAreAllowed`) | MUST | [§5.8.5](https://spec.graphql.org/draft/#sec-All-Variable-Usages-Are-Allowed) | ✗ 2/636 |
| Valid documents are accepted (`acceptsValid`) | MUST | [§5](https://spec.graphql.org/draft/#sec-Validation) | ✗ 2/983 |

- **`acceptsValid`** is implied rather than stated: a document is valid when it satisfies every rule of §5, and only invalid requests are kept from execution (§6.1.1); rejecting a valid document applies a rule the spec doesn't have

## Coerce

- **Capabilities:** absent-vs-null, coerce, custom-scalar-literals, deferred-items, error-propagation-off, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, unvalidated, validate
- **Cases:** 2036 submitted, 2036 distinct, 0 malformed
- **Adapter problems:** none
- **Checker self-test:** passed (11675 negative controls)
- **Run:** kit f0039322bf59, 2026-11-15, strict

### Findings

<a id="finding-1"></a>

#### 1. `floatPrecision`: accepts what §3.5.2 (Float) rejects

1 case, in `literal` (1).

- Float rejects an integer a double can't hold exactly (SHOULD, [§3.5.2](https://spec.graphql.org/draft/#sec-Float))

The shortest case, from `literal`:

```
input:    { float(v: 99999999999999999999) }  variables: {}
response: {"response":{"data":{"float":"ok"}},"calls":[{"path":["float"],"arguments":{"v":100000000000000000000}}]}
expected: a field error at float
```

<a id="finding-2"></a>

#### 2. `float`: accepts what §3.5.2 (Float) rejects

1 case, in `literal` (1).

- Float accepts integer and float input values, and rejects non-finite values (MUST, [§3.5.2](https://spec.graphql.org/draft/#sec-Float))

The shortest case, from `literal`:

```
input:    { float(v: 1e400) }  variables: {}
response: {"response":{"data":{"float":"ok"}},"calls":[{"path":["float"],"arguments":{"v":"Infinity"}}]}
expected: a field error at float
```

<a id="finding-3"></a>

#### 3. `string`: accepts what §3.5.3 (String) rejects

1 case, in `variable` (1).

- String accepts only valid Unicode string input values (MUST, [§3.5.3](https://spec.graphql.org/draft/#sec-String))

The shortest case, from `variable`:

```
input:    query($x: String) { string(v: $x) }  variables: {"x": "\ud800"}
response: {"response":{"data":{"string":"ok"}},"calls":[{"path":["string"],"arguments":{"v":"\ud800"}}]}
expected: a request error
```

<a id="finding-4"></a>

#### 4. `id`: accepts what §3.5.5 (ID) rejects

1 case, in `variable` (1).

- ID rejects input values other than strings and integers (MUST, [§3.5.5](https://spec.graphql.org/draft/#sec-ID))

The shortest case, from `variable`:

```
input:    query($x: ID) { id(v: $x) }  variables: {"x": "\ud800"}
response: {"response":{"data":{"id":"ok"}},"calls":[{"path":["id"],"arguments":{"v":"\ud800"}}]}
expected: a request error
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
| Int accepts only integer input values (`int`) | MUST | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) | ✓ 342 |
| Int rejects integers outside the signed 32-bit range (`intRange`) | SHOULD | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) | ✓ 32 |
| Float accepts integer and float input values, and rejects non-finite values (`float`) | MUST | [§3.5.2](https://spec.graphql.org/draft/#sec-Float) | ✗ 1/92 |
| Float rejects an integer a double can't hold exactly (`floatPrecision`) | SHOULD | [§3.5.2](https://spec.graphql.org/draft/#sec-Float) | ! 1/1 |
| String accepts only valid Unicode string input values (`string`) | MUST | [§3.5.3](https://spec.graphql.org/draft/#sec-String) | ✗ 1/94 |
| Boolean accepts only boolean input values (`boolean`) | MUST | [§3.5.4](https://spec.graphql.org/draft/#sec-Boolean) | ✓ 94 |
| String and integer input values are coerced to ID strings (`idCoerced`) | SHOULD | [§3.5.5](https://spec.graphql.org/draft/#sec-ID) | ✓ 27 |
| ID rejects input values other than strings and integers (`id`) | MUST | [§3.5.5](https://spec.graphql.org/draft/#sec-ID) | ✗ 1/65 |
| Enums accept their own values, and reject string literals and unknown values (`enum`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✓ 188 |
| Input objects: an object of defined fields, required fields, variables in fields (`inputObject`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 413 |
| An omitted input field gets its default value (`inputFieldDefaults`) | SHOULD | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 59 |
| OneOf input objects take exactly one non-null field (`oneOf`). Coercion.tla doesn't model OneOf input objects, so there are no vectors for them. | MUST | [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | – |
| Lists: each item coerced, a single value wrapped in a list (`list`) | MUST | [§3.11](https://spec.graphql.org/draft/#sec-List) | ✓ 489 |
| Non-Null rejects null (`nonNull`) | MUST | [§3.12](https://spec.graphql.org/draft/#sec-Non-Null) | ✓ 4 |
| CoerceVariableValues: defaults, missing and null values, and failures as request errors (`variables`) | MUST | [§6.1.2](https://spec.graphql.org/draft/#sec-Coercing-Variable-Values) | ✓ 898 |
| CoerceArgumentValues: defaults, missing variables, and failures as field errors (`arguments`) | MUST | [§6.4.1](https://spec.graphql.org/draft/#sec-Coercing-Field-Arguments) | ✓ 820 |
| GetOperation: the operation operationName names, or the only one, else a request error (`getOperation`) | MUST | [§6.1](https://spec.graphql.org/draft/#sec-Executing-Requests) | ✓ 22 |
| An invalid document fails as a request error, without executing (`invalidNotExecuted`) | MUST | [§6.1.1](https://spec.graphql.org/draft/#sec-Validating-Requests) | – |
| JSON numbers a double can't hold: read exactly, read as binary64, or refused (`jsonNumbers`) | INFO | — | ✓ 3 |

- **`intRange`** is implied rather than stated: "If the integer input value represents a value less than -2^31 or greater than or equal to 2^31, a request error should be raised."
- **`float`** is implied rather than stated: A fractional value is kept as its decimal, which the vectors only use with at most 15 significant digits. Integers a double can't hold exactly are floatPrecision's.
- **`floatPrecision`** is implied rather than stated: The sentence says a request error "must be raised" for "a value outside the available precision", but which values that covers is Coercion.tla's reading (an integral value must be exactly representable), so the check takes the weaker level.
- **`idCoerced`** is implied rather than stated: "any string (such as \"4\") or integer (such as 4 or -4) input value should be coerced to ID". The format of an ID made from an integer is the service's: any string that writes the integer's exact value passes, such as "1e+21" for 10^21.
- **`enum`** is implied rather than stated: String literals must be rejected. For JSON variables, "strings may be interpreted as the enum input value with the same name": a MAY, so taking the string and rejecting it both pass.
- **`inputObject`** is implied rather than stated: The "must" sentences: the value must be an object without undefined fields, a variable's runtime value must be used, and §3.12 makes a missing Non-Null field an error that must be raised. Field defaults are a "should", graded by inputFieldDefaults.
- **`inputFieldDefaults`** is implied rather than stated: "If no value is provided for a defined input object field and that field definition provides a default value, the result of coercing the default value ... should be used." A result that is right except that it leaves such defaults out fails this check, not inputObject.
- **`getOperation`** is implied rather than stated: Includes a mutation running on the mutation root type, and only the selected operation's variables being coerced.
- **`invalidNotExecuted`** is implied rather than stated: "If validation errors are known, they should be reported in the list of \"errors\" in the response and the request must fail without operation execution." Graded for adapters without `unvalidated`, on vectors Validation.tla rejects: a request error, no data, no resolver called.
- **`jsonNumbers`** is implied rather than stated: Not a GraphQL rule: RFC 8259 §6 lets a JSON parser limit the range and precision of numbers. Vectors whose answer depends on that count here, never against Float or ID, unless the adapter claims exact-numbers.

## Schema

- **Capabilities:** absent-vs-null, coerce, custom-scalar-literals, deferred-items, error-propagation-off, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, unvalidated, validate
- **Cases:** 166 submitted, 166 distinct, 0 malformed
- **Adapter problems:** none
- **Checker self-test:** passed (335 negative controls)
- **Run:** kit f0039322bf59, 2026-11-15, strict

### Findings

<a id="finding-1"></a>

#### 1. `directiveReferencesItselfIndirectly`: DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY not enforced: accepts a schema that breaks only this rule

3 cases, in `directive` (3).

- A directive definition doesn't reference itself through a type or directive (MUST, [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `directiveReferencesItselfIndirectly.3.invalid`:

```
input:    directive @d(c: Color) on ENUM_VALUE enum Color { RED @d BLUE } type Query { a: Color }
response: {"valid":true}
expected: invalid: breaks DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY and no other rule
```

<a id="finding-2"></a>

#### 2. `typeNameNotBuiltin`: TYPE_NAME_NOT_BUILTIN not enforced: accepts a schema that breaks only this rule

2 cases, in `names` (2).

- No type is named like a built-in type (MUST, [§3.3](https://spec.graphql.org/draft/#sec-Schema))

The shortest case, from `typeNameNotBuiltin.1.invalid`:

```
input:    scalar String type Query { a: Int }
response: {"valid":true}
expected: invalid: breaks TYPE_NAME_NOT_BUILTIN and no other rule
```

<a id="finding-3"></a>

#### 3. `directiveUsesItself`: DIRECTIVE_USES_ITSELF not enforced: accepts a schema that breaks only this rule

1 case, in `directive` (1).

- A directive definition doesn't use itself (MUST, [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `directiveUsesItself.1.invalid`:

```
input:    directive @invalidExample(arg: String @invalidExample) on ARGUMENT_DEFINITION type Query { a: Int }
response: {"valid":true}
expected: invalid: breaks DIRECTIVE_USES_ITSELF and no other rule
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
| No two types have the same name (`typeNamesUnique`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✓ 2 |
| No type is named like a built-in type (`typeNameNotBuiltin`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✗ 2/4 |
| No type name begins with __ (`typeNameReserved`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✓ 2 |
| No two directives have the same name (`directiveNamesUnique`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✓ 2 |
| No directive name begins with __ (`directiveNameReserved`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✓ 2 |
| The query root operation type is provided (`queryRootProvided`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✓ 4 |
| Root operation types are object types (`rootTypesAreObjects`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✓ 6 |
| Root operation types are all different (`rootTypesDifferent`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✓ 4 |
| An object or interface type defines one or more fields (`fieldsDefined`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 4 |
| Field names are unique within a type (`fieldNamesUnique`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 4 |
| No field name begins with __ (`fieldNameReserved`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 2 |
| Fields return output types (`fieldOutputType`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✓ 4 |
| No argument name begins with __ (`argNameReserved`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 4 |
| Argument names are unique within a field or directive (`argNamesUnique`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 4 |
| Arguments accept input types (`argInputType`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✓ 6 |
| A required argument isn't deprecated (`requiredArgNotDeprecated`). Draft only: the October 2021 edition doesn't have deprecated arguments. | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✓ 8 |
| An object field argument's default value coerces to its type (`argDefaultCompatible`). Draft only: the October 2021 edition doesn't have default value validation. | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 18 |
| A type implements each interface once (`implementsUnique`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 2 |
| A type implements only interface types (`implementsInterfaces`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 2 |
| An interface doesn't implement itself (`implementsItself`) | MUST | [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 2 |
| A type also implements the interfaces its interfaces implement (`implTransitive`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 4 |
| An implementation has every field of the interface (`implFieldProvided`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 2 |
| An implementation's field has every argument of the interface field (`implArgProvided`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 2 |
| An implementation's field arguments have the interface's argument types (`implArgInvariant`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 4 |
| An implementation's additional arguments aren't required (`implExtraArgOptional`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 2 |
| An implementation's field returns a subtype of the interface field's type (`implFieldCovariant`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 8 |
| A deprecated implementation field implements a deprecated field (`implDeprecation`). Draft only: the October 2021 edition doesn't have deprecation of implementing fields. | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 2 |
| A union has one or more member types (`unionMembersDefined`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✓ 2 |
| A union's member types are unique (`unionMembersUnique`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✓ 2 |
| A union's member types are object types (`unionMembersObjects`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✓ 6 |
| An enum has one or more values (`enumValuesDefined`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✓ 2 |
| An enum's values are unique (`enumValuesUnique`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✓ 2 |
| No enum value begins with __ (`enumValueNameReserved`) | MUST | [§4](https://spec.graphql.org/draft/#sec-Introspection) | ✓ 2 |
| An input object has one or more fields (`inputFieldsDefined`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 2 |
| Input field names are unique within an input object (`inputFieldNamesUnique`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 2 |
| No input field name begins with __ (`inputFieldNameReserved`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 2 |
| Input fields accept input types (`inputFieldInputType`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✓ 2 |
| A required input field isn't deprecated (`requiredInputFieldNotDeprecated`). Draft only: the October 2021 edition doesn't have deprecated input fields. | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✓ 2 |
| A OneOf input object's fields are nullable (`oneOfFieldNullable`). Draft only: the October 2021 edition doesn't have OneOf input objects. | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 2 |
| A OneOf input object's fields have no default value (`oneOfFieldNoDefault`). Draft only: the October 2021 edition doesn't have OneOf input objects. | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 2 |
| An input object can be given a finite value (`inputObjectUnbreakableCycle`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 10 |
| Input object default values don't form a cycle (`inputObjectDefaultValueCycle`). Draft only: the October 2021 edition doesn't have default value validation. | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 8 |
| A directive has one or more locations (`directiveLocationsDefined`). SDL can't write a directive without locations, so no vector breaks this rule | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | – |
| A directive definition doesn't use itself (`directiveUsesItself`) | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 1/2 |
| A directive definition doesn't reference itself through a type or directive (`directiveReferencesItselfIndirectly`) | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 3/6 |

## Introspect

- **Capabilities:** absent-vs-null, coerce, custom-scalar-literals, deferred-items, error-propagation-off, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, unvalidated, validate
- **Cases:** 34 submitted, 34 distinct, 0 malformed
- **Adapter problems:** none
- **Checker self-test:** passed (83 negative controls)
- **Run:** kit f0039322bf59, 2026-11-15, strict

### Findings

<a id="finding-1"></a>

#### 1. `builtinDefinitions`: the built-in __DirectiveLocation isn't as the spec defines it (enumValues)

22 cases, in `minimal` (2), `rich` (2), `interfaces` (2), `defaults` (2), `deprecation` (2), `directiveDeprecation` (2), `roots` (2), `builtinScalars` (2), `scalars` (2), `oneOf` (2), `order` (2).

- The introspection types and built-in directives are as the spec defines them (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `minimal.inc`:

```
problem:  enumValues at __DirectiveLocation
input:    type Query { a: Int }  (the introspection query; includeDeprecated: true)
response: {"kind":"ENUM","name":"__DirectiveLocation","description":"A Directive can be adjacent to many parts of the GraphQL language, a __DirectiveLocation describes one such possible adjacencies.","specifiedByURL":null,"isOneOf":null,"fields":null,"inputFields":null,"interfaces":null,"enumValues":[{"name":"QUERY","description":"Location adjacent to a query operation.","isDeprecated":false,"deprecationReason":null},{"name":"MUTATION","description":"Location adjacent to a mutation operation.","isDeprecated":false,"deprecationReason":null},{"name":"SUBSCRIPTION","description":"Location adjacent to a subscription operation.","isDeprecated":false,"deprecationReason":null},{"name":"FIELD","description":"Location adjacent to a field.","isDeprecated":false,"deprecationReason":null},{"name":"FRAGMENT_DEFINITION","description":"Location adjacent to a fragment definition.","isDeprecated":false,"deprecationReason":null},{"name":"FRAGMENT_SPREAD","description":"Location adjacent to a fragment spread.","isDeprecated":false,"deprecationReason":null},{"name":"INLINE_FRAGMENT","description":"Location adjacent to an inline fragment.","isDeprecated":false,"deprecationReason":null},{"name":"VARIABLE_DEFINITION","description":"Location adjacent to an operation variable definition.","isDeprecated":false,"deprecationReason":null},{"name":"FRAGMENT_VARIABLE_DEFINITION","description":"Location adjacent to a fragment variable definition.","isDeprecated":false,"deprecationReason":null},{"name":"SCHEMA","description":"Location adjacent to a schema definition.","isDeprecated":false,"deprecationReason":null},{"name":"SCALAR","description":"Location adjacent to a scalar definition.","isDeprecated":false,"deprecationReason":null},{"name":"OBJECT","description":"Location adjacent to an object type definition.","isDeprecated":false,"deprecationReason":null},{"name":"FIELD_DEFINITION","description":"Location adjacent to a field definition.","isDeprecated":false,"deprecationReason":null},{"name":"ARGUMENT_DEFINITION","description":"Location adjacent to an argument definition.","isDeprecated":false,"deprecationReason":null},{"name":"INTERFACE","description":"Location adjacent to an interface definition.","isDeprecated":false,"deprecationReason":null},{"name":"UNION","description":"Location adjacent to a union definition.","isDeprecated":false,"deprecationReason":null},{"name":"ENUM","description":"Location adjacent to an enum definition.","isDeprecated":false,"deprecationReason":null},{"name":"ENUM_VALUE","description":"Location adjacent to an enum value definition.","isDeprecated":false,"deprecationReason":null},{"name":"INPUT_OBJECT","description":"Location adjacent to an input object type definition.","isDeprecated":false,"deprecationReason":null},{"name":"INPUT_FIELD_DEFINITION","description":"Location adjacent to an input object field definition.","isDeprecated":false,"deprecationReason":null},{"name":"DIRECTIVE_DEFINITION","description":"Location adjacent to a directive definition.","isDeprecated":false,"deprecationReason":null}],"possibleTypes":null}
expected: [object Object]
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
| The response is a well-formed execution result: data, errors only as a non-empty list, extensions a map, nothing else (`envelope`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ 34 |
| The query executes, and its result has exactly the fields it selects, nulls included (`executes`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 34 |
| queryType, mutationType and subscriptionType are the root operation types (`roots`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✓ 22 |
| types is the set of all named types (`types`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) | ✓ 22 |
| types has the built-in scalars the schema references, and no others (`builtinScalars`) | MUST | [§3.5](https://spec.graphql.org/draft/#sec-Scalars) [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) | ✓ 22 |
| __type(name:) returns the named type, and null for a name the schema doesn't have (`typeByName`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 12 |
| Each __Type has its type's kind, and its fields are null exactly where that kind requires (`typeKinds`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) | ✓ 34 |
| An object's or interface's fields, with their types (`fields`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) | ✓ 34 |
| Field and directive arguments, with their types (`arguments`) | MUST | [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) | ✓ 34 |
| defaultValue encodes the default value, and is null without one (`defaultValue`) | MUST | [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | ✓ 34 |
| An input object's inputFields, with their types (`inputFields`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | ✓ 34 |
| An enum's enumValues (`enumValues`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) | ✓ 34 |
| interfaces, and possibleTypes for unions and interfaces (`interfaces`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) | ✓ 34 |
| isDeprecated, deprecationReason and includeDeprecated; @deprecated is provided when the schema deprecates something (`deprecation`) | MUST | [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✓ 34 |
| specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null (`specifiedByURL`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) | ✓ 34 |
| isOneOf is true exactly for OneOf input objects (`isOneOf`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 34 |
| Descriptions are the schema's (`descriptions`) | MUST | [§3.2](https://spec.graphql.org/draft/#sec-Type-System-Descriptions) [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 34 |
| directives describes the schema's own directives (name, locations, isRepeatable), and any of the service's own takes input types (`directives`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 22 |
| @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (`builtinDirectives`) | SHOULD | [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.1](https://spec.graphql.org/draft/#sec-skip) [§3.13.2](https://spec.graphql.org/draft/#sec-include) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) [§3.13.5](https://spec.graphql.org/draft/#sec-oneOf) | ✓ 22 |
| The introspection types and built-in directives are as the spec defines them (`builtinDefinitions`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 22/34 |
| __typename names the root type, and no fields list includes it (`typename`) | MUST | [§4.1](https://spec.graphql.org/draft/#sec-Type-Name-Introspection) | ✓ 34 |
| Fields, arguments, enum values, directives, members and interfaces come in source order (`order`) | SHOULD | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 34 |
| Anything else Introspection!Matches requires (`other`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 34 |
