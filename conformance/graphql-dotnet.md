# graphql-dotnet 8.8.5

Generated from the conformance kit's reports. Back to the [sheet](README.md).

**Notes** (hand-written, from outside the kit):

- The adapter uses graphql-dotnet's schema-first `Schema.For`, its default `DocumentExecuter` and the System.Text.Json serializer. List items are `IDataLoaderResult` values, the only kind of item graphql-dotnet waits for. `idle` holds because everything runs on one thread; the determinism replay passed.
- The `resultCoercion` finding: `FloatGraphType` passes a non-finite double through, and `GraphQLSerializer` then throws, so the client gets no response. The introspect area grades almost nothing because graphql-dotnet rejects the kit's introspection query (it has no `specifiedByURL`, `isRepeatable` or input-value deprecation). Parse, validate, schema and introspect findings are described with source locations in the [adapter's README](../adapters/graphql-dotnet/README.md#known-graphql-dotnet-deviations).

## Execution

- **Capabilities:** custom-scalar-literals, deferred-items, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 12658 submitted, 3014 distinct, 357 malformed
- **Adapter problems:** none
- **Checker self-test:** passed (25 negative controls)
- **Run:** kit f0039322bf59, 2026-11-15, strict, 1500 random runs per fixture (seed 1), exhaustive runs on

### Findings

<a id="finding-1"></a>

#### 1. `resultCoercion`: the implementation produced no response, after a resolver returned a value its type can't represent: … threw ArgumentException: .NET number values such as positive and negative infinity cannot be written as valid JSON. To make it work when using 'JsonSerializer', consider specifying … (see …

357 cases, in `leaves` (357).

- A leaf value its type can't represent (a fraction for an Int, a non-finite Float, an unknown enum value) raises an execution error (MUST, [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion))

The shortest case, from `leaves`:

```
problem:  the implementation produced no response, after a resolver returned a value its type can't represent: "GraphQLSerializer.Serialize threw ArgumentException: .NET number values such as positive and negative infinity cannot be written as valid JSON. To make it work when using 'JsonSerializer', consider specifying 'JsonNumberHandling.AllowNamedFloatingPointLiterals' (see https://docs.microsoft.com/dotnet/api/system.text.json.serialization.jsonnumberhandling)."
trace:    call count; call ratio; call color; settle count = null; settle ratio = uncoercible; settle color = null
response: none: GraphQLSerializer.Serialize threw ArgumentException: .NET number values such as positive and negative infinity cannot be written as valid JSON. To make it work when using 'JsonSerializer', consider specifying 'JsonNumberHandling.AllowNamedFloatingPointLiterals' (see https://docs.microsoft.com/dotnet/api/system.text.json.serialization.jsonnumberhandling).
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
| The response is sent only once execution is complete (`complete`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 3014 |
| data is the completed value: field collection, value completion and null propagation (`dataMatches`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 3014 |
| Response keys are in collected field order (`keyOrder`) | SHOULD | [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering) | ✓ 3014 |
| Every error was raised, at the path where it was raised (`errorsWereRaised`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 3014 |
| No two errors share a response path (`errorPathsUnique`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 3014 |
| Every error is inside a null in data (`errorsInsideNulls`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 3014 |
| Every null an error caused comes with an error from its cause (`nullsExplained`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 3014 |
| A mutation reports every error its earlier root fields raised (`serialErrorsKept`) | MUST | [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 125 |
| A mutation's root fields execute one after another (`calledSerially`) | MUST | [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) | ✓ 125 |
| Each field is executed once, merged selections included (`callsOnce`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) | ✓ 12658 |
| Only fields the operation selects are executed (`callsSelected`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) | ✓ 12658 |
| A field executes only once its parent has a value that contains it (`callsReachable`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 12658 |
| A request gets a response (`responds`) | MUST | [§7.1](https://spec.graphql.org/draft/#sec-Response-Format) | ✓ 12658 |
| A subscription event yields an execution result, even when its data is null (`eventYieldsResult`) | MUST | [§6.2.3.2](https://spec.graphql.org/draft/#sec-Response-Stream) | ✓ 1522 |
| data holds only positions the operation selects (`dataShape`) | MUST | [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ 6555 |
| A leaf value its type can't represent (a fraction for an Int, a non-finite Float, an unknown enum value) raises an execution error (`resultCoercion`) | MUST | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✗ 357/926 |
| Leaf values are the resolver's canonical value (Int 1, Float 1.5, Boolean true, an enum's first value, "v") (`leafValues`) | MUST | [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 6555 |
| An execution result has a data entry (`dataPresent`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 12301 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 12301 |
| The response has no entries besides data, errors and extensions (`additionalEntries`) | MUST | [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ 12301 |
| extensions is a map (`extensions`) | MUST | [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) | – |
| Errors are maps with a message, and well-formed locations and extensions (`errorFormat`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 10832 |
| Execution errors have a path to a position the operation selects (`errorPath`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 10832 |
| Paths use field names and integer list indices (`responsePosition`) | MUST (Oct 2021: SHOULD) | [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) | ✓ 2238 |
| Errors have no entries besides message, locations, path and extensions (`errorEntries`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 10832 |
| The adapter follows the kit's protocol (call types, settles) (`protocol`) | ADAPTER | — | ✓ 12658 |

- **`serialErrorsKept`** is implied rather than stated: §6.4.4: an execution error "must be added to the errors list". §6.3.3 lets an implementation cancel fields that have not yet executed or yielded a value, but §6.3.4 completes each mutation root field before the next starts, so an earlier root field's errors can't have been cancelled.

### Fixtures

| Fixture | Result | Note |
| --- | :---: | :---: |
| [`fragments`](../fixtures/fragments.graphql) | ✓ 1576 |  |
| [`leaves`](../fixtures/leaves.graphql) | ✗ 357/1700 |  |
| [`lists`](../fixtures/lists.graphql) | ✓ 2490 |  |
| [`mutation`](../fixtures/mutation.graphql) | ✓ 1750 |  |
| [`noPropagation`](../fixtures/noPropagation.graphql) | – | needs error-propagation-off |
| [`nullPropagation`](../fixtures/nullPropagation.graphql) | ✓ 1782 |  |
| [`subscription`](../fixtures/subscription.graphql) | ✓ 1522 |  |
| [`unions`](../fixtures/unions.graphql) | ✓ 1838 |  |

## Parse

- **Capabilities:** custom-scalar-literals, deferred-items, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 1983 submitted, 1983 distinct, 0 malformed
- **Adapter problems:** none
- **Checker self-test:** passed (3 negative controls)
- **Run:** kit f0039322bf59, 2026-11-15, strict

### Findings

<a id="finding-1"></a>

#### 1. `descriptions`: rejects what §2.2 Descriptions accepts

73 cases, in `random-documents` (69), `parser-examples` (3), `variable-definitions` (1).

- Descriptions on operations, fragments and variables, not on the query shorthand (MUST, [§2.2](https://spec.graphql.org/draft/#sec-Descriptions))

The shortest case, from `parser-examples`:

```
input:    "\"d\" query {a}"
response: {"ok":false,"error":"Error parsing query: Unexpected String \"d\""}
expected: {"ok":true}
```

<a id="finding-2"></a>

#### 2. `stringValue`: accepts what §2.10.4 String Value rejects

9 cases, in `lexer-examples` (6), `strings` (3).

- String values and block strings (MUST, [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value))

The shortest case, from `lexer-examples`:

```
input:    "{a(x: \"\\uD83D\")}"
sibling:  "{a(x: \"\")}", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="finding-3"></a>

#### 3. `intValue`: accepts what §2.10.1 Int Value rejects

8 cases, in `numbers` (5), `lexer-examples` (3).

- Int values (MUST, [§2.10.1](https://spec.graphql.org/draft/#sec-Int-Value))

The shortest case, from `lexer-examples`:

```
input:    "{a(x: [1_])}"
sibling:  "{a(x: [_])}", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="finding-4"></a>

#### 4. `selectionSets`: rejects what §2.5 Selection Sets accepts

8 cases, in `random-documents` (4), `parser-examples` (3), `field-suffixes` (1).

- Selection sets, including empty ones (MUST, [§2.5](https://spec.graphql.org/draft/#sec-Selection-Sets))

The shortest case, from `parser-examples`:

```
input:    "{}"
response: {"ok":false,"error":"Error parsing query: Expected Name, found }; for more information see http://spec.graphql.org/October2021/#Field"}
expected: {"ok":true}
```

<a id="finding-5"></a>

#### 5. `stringValue`: rejects what §2.10.4 String Value accepts

6 cases, in `strings` (4), `lexer-examples` (2).

- String values and block strings (MUST, [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value))

The shortest case, from `strings`:

```
input:    "{a(x: \"\\u{1F600}\")}"
response: {"ok":false,"error":"Error parsing query: Invalid character escape sequence: \\u{1F6."}
expected: {"ok":true}
```

<a id="finding-6"></a>

#### 6. `document`: accepts what §2.3 Document rejects

2 cases, in `parser-examples` (2).

- A document is one or more executable definitions (MUST, [§2.3](https://spec.graphql.org/draft/#sec-Document))

The shortest case, from `parser-examples`:

```
input:    "  # only a comment"
response: {"ok":true}
expected: {"ok":false}
```

<a id="finding-7"></a>

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
| Descriptions on operations, fragments and variables, not on the query shorthand (`descriptions`) | MUST | [§2.2](https://spec.graphql.org/draft/#sec-Descriptions) | ✗ 73/100 |
| A document is one or more executable definitions (`document`) | MUST | [§2.3](https://spec.graphql.org/draft/#sec-Document) | ✗ 2/99 |
| Operation definitions and the query shorthand (`operations`) | MUST | [§2.4](https://spec.graphql.org/draft/#sec-Operations) | ✓ 100 |
| Selection sets, including empty ones (`selectionSets`) | MUST | [§2.5](https://spec.graphql.org/draft/#sec-Selection-Sets) | ✗ 8/95 |
| Fields (`fields`) | MUST | [§2.6](https://spec.graphql.org/draft/#sec-Fields) | ✓ 96 |
| Arguments (`arguments`) | MUST | [§2.7](https://spec.graphql.org/draft/#sec-Arguments) | ✓ 110 |
| Field aliases (`fieldAlias`) | MUST | [§2.8](https://spec.graphql.org/draft/#sec-Field-Alias) | ✓ 94 |
| Fragment definitions and fragment spreads (`fragments`) | MUST | [§2.9](https://spec.graphql.org/draft/#sec-Fragments) | ✓ 117 |
| Type conditions (`typeConditions`) | MUST | [§2.9.1](https://spec.graphql.org/draft/#sec-Type-Conditions) | ✓ 112 |
| Inline fragments (`inlineFragments`) | MUST | [§2.9.2](https://spec.graphql.org/draft/#sec-Inline-Fragments) | ✓ 100 |
| Input values, and no variables in constant values (`inputValues`) | MUST | [§2.10](https://spec.graphql.org/draft/#sec-Input-Values) | ✓ 122 |
| Int values (`intValue`) | MUST | [§2.10.1](https://spec.graphql.org/draft/#sec-Int-Value) | ✗ 8/42 |
| Float values (`floatValue`) | MUST | [§2.10.2](https://spec.graphql.org/draft/#sec-Float-Value) | ✓ 35 |
| Boolean values (`booleanValue`) | MUST | [§2.10.3](https://spec.graphql.org/draft/#sec-Boolean-Value) | ✓ 3 |
| String values and block strings (`stringValue`) | MUST | [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value) | ✗ 15/146 |
| Null value (`nullValue`) | MUST | [§2.10.5](https://spec.graphql.org/draft/#sec-Null-Value) | ✓ 2 |
| Enum values (`enumValue`) | MUST | [§2.10.6](https://spec.graphql.org/draft/#sec-Enum-Value) | ✓ 10 |
| List values (`listValue`) | MUST | [§2.10.7](https://spec.graphql.org/draft/#sec-List-Value) | ✓ 101 |
| Input object values (`inputObjectValues`) | MUST | [§2.10.8](https://spec.graphql.org/draft/#sec-Input-Object-Values) | ✓ 107 |
| Variables and variable definitions (`variables`) | MUST | [§2.11](https://spec.graphql.org/draft/#sec-Variables) | ✗ 1/157 |
| Type references (`typeReferences`) | MUST | [§2.12](https://spec.graphql.org/draft/#sec-Type-References) | ✓ 102 |
| Directives (`directives`) | MUST | [§2.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 113 |

## Validate

- **Capabilities:** custom-scalar-literals, deferred-items, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 3087 submitted, 3087 distinct, 0 malformed
- **Adapter problems:** none
- **Checker self-test:** passed (7 negative controls)
- **Run:** kit f0039322bf59, 2026-11-15, strict

### Findings

<a id="finding-1"></a>

#### 1. `allVariableUsagesAreAllowed`: §5.8.5 All Variable Usages Are Allowed isn't enforced: accepts documents that break only this rule

71 cases, in `variables` (71).

- All Variable Usages Are Allowed (MUST, [§5.8.5](https://spec.graphql.org/draft/#sec-All-Variable-Usages-Are-Allowed))

The shortest case, from `variables`:

```
input:    AllVariableUsagesAreAllowed-4: query Q($v: ID!) { echo(opt: $v) }
response: {"valid":true,"errors":[]}
expected: invalid: AllVariableUsagesAreAllowed ["v"]
```

<a id="finding-2"></a>

#### 2. `fieldSelectionMerging`: §5.3.2 Field Selection Merging isn't enforced: accepts documents that break only this rule

22 cases, in `merging` (22).

- Field Selection Merging (MUST, [§5.3.2](https://spec.graphql.org/draft/#sec-Field-Selection-Merging))

The shortest case, from `merging`:

```
input:    FieldSelectionMerging-59: { node(id: "1") { ... on User { a: __typename } ... on Post { a: id } } }
response: {"valid":true,"errors":[]}
expected: invalid: FieldSelectionMerging ["conflict"]
```

<a id="finding-3"></a>

#### 3. `singleRootField`: §5.2.4.1 Single Root Field isn't enforced: accepts documents that break only this rule; all rely on the draft

15 cases, in `operations` (13), `random` (1), `spec` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- Single Root Field (MUST, [§5.2.4.1](https://spec.graphql.org/draft/#sec-Single-Root-Field))

The shortest case, from `spec`:

```
input:    [draft] SingleRootField-spec-7: subscription sub($bool: Boolean!) { newMessage @include(if: $bool) { body sender } }
response: {"valid":true,"errors":[]}
expected: invalid: SingleRootField ["sub"]
```

<a id="finding-4"></a>

#### 4. `acceptsValid`: rejects valid documents: §5.2.4.1 Single Root Field is likely over-strict (14 valid siblings of 16 different invalid vectors rejected, 23 of the same family accepted)

14 cases, in `operations` (14).

Each rejected document is one edit from a document that breaks only `singleRootField`, so that rule is likely over-strict.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `operations`:

```
problem:  Subscription 'S7' must have exactly one root field and that field must not be an introspection field.
input:    SingleRootField-valid-22: subscription S7 { a: postAdded { id } a: postAdded { name } }
response: {"valid":false,"errors":[{"message":"Subscription 'S7' must have exactly one root field and that field must not be an introspection field.","locations":[{"line":5,"column":3}]}]}
expected: valid
```

<a id="finding-5"></a>

#### 5. `operationTypeExistence`: §5.2.1.1 Operation Type Existence isn't enforced: accepts documents that break only this rule; all rely on the draft

9 cases, in `operations` (8), `spec` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- Operation Type Existence (MUST, [§5.2.1.1](https://spec.graphql.org/draft/#sec-Operation-Type-Existence))

The shortest case, from `spec`:

```
input:    [draft] OperationTypeExistence-spec-2: mutation goodbyeMutation { goodbye }
response: {"valid":true,"errors":[]}
expected: invalid: OperationTypeExistence ["mutation"]
```

<a id="finding-6"></a>

#### 6. `acceptsValid`: rejects valid documents: §5.2.3.1 Lone Anonymous Operation is likely over-strict (9 valid siblings of 6 different invalid vectors rejected, 7 of the same family accepted)

9 cases, in `operations` (9).

Each rejected document is one edit from a document that breaks only `loneAnonymousOperation`, so that rule is likely over-strict.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `operations`:

```
problem:  Subscription 'S7' must have exactly one root field and that field must not be an introspection field.
input:    LoneAnonymousOperation-valid-7: query A { post { id } } subscription S7 { a: postAdded { id } a: postAdded { name } }
response: {"valid":false,"errors":[{"message":"Subscription 'S7' must have exactly one root field and that field must not be an introspection field.","locations":[{"line":11,"column":3}]}]}
expected: valid
```

<a id="finding-7"></a>

#### 7. `acceptsValid`: rejects valid documents: §5.8.5 All Variable Usages Are Allowed is likely over-strict (7 valid siblings of 28 different invalid vectors rejected, 51 of the same family accepted)

7 cases, in `variables` (7).

Each rejected document is one edit from a document that breaks only `allVariableUsagesAreAllowed`, so that rule is likely over-strict.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `variables`:

```
problem:  Variable '$v' of type '[Int]' used in position expecting type 'Int'.
input:    AllVariableUsagesAreAllowed-valid-47: query Q($v: [Int]) { matrix(rows: [$v]) }
response: {"valid":false,"errors":[{"message":"Variable '$v' of type '[Int]' used in position expecting type 'Int'.","locations":[{"line":1,"column":9},{"line":2,"column":17}]}]}
expected: valid
```

<a id="finding-8"></a>

#### 8. `executableDefinitions`: §5.1.1 Executable Definitions isn't enforced: accepts documents that break only this rule

4 cases, in `executable` (4).

- Executable Definitions (MUST, [§5.1.1](https://spec.graphql.org/draft/#sec-Executable-Definitions))

The shortest case, from `executable`:

```
input:    ExecutableDefinitions-1: directive @x on FIELD { user { id } }
response: {"valid":true,"errors":[]}
expected: invalid: ExecutableDefinitions ["document"]
```

<a id="finding-9"></a>

#### 9. `acceptsValid`: rejects valid documents: §5.8.2 Variables Are Input Types is likely over-strict (4 valid siblings of 3 different invalid vectors rejected, 1 of the same family accepted)

4 cases, in `extra` (4).

Each rejected document is one edit from a document that breaks only `variablesAreInputTypes`, so that rule is likely over-strict.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `extra`:

```
problem:  Invalid literal for argument 'value' of field 'json'. Unable to convert 'GraphQLParser.AST.GraphQLVariableWithLocation' literal from AST representation to any possible type
input:    VariablesAreInputTypes-valid-2: query Q($v: Int) { json(value: {a: $v}) }
response: {"valid":false,"errors":[{"message":"Invalid literal for argument 'value' of field 'json'. Unable to convert 'GraphQLParser.AST.GraphQLVariableWithLocation' literal from AST representation to any possible type","locations":[{"line":2,"column":15}]}]}
expected: valid
```

<a id="finding-10"></a>

#### 10. `acceptsValid`: rejects valid documents: §5.2.3.1 Lone Anonymous Operation or §5.2.1.1 Operation Type Existence is likely over-strict (3 valid siblings of 6 different invalid vectors rejected, 4 of the same family accepted)

3 cases, in `operations` (3).

Each rejected document is one edit from a document that breaks only `loneAnonymousOperation` or `operationTypeExistence`, so that rule is likely over-strict.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `operations`:

```
problem:  Subscription 'S7' must have exactly one root field and that field must not be an introspection field.
input:    OperationTypeExistence-valid-3: query A { user { id } } subscription S7 { a: postAdded { id } a: postAdded { name } }
response: {"valid":false,"errors":[{"message":"Subscription 'S7' must have exactly one root field and that field must not be an introspection field.","locations":[{"line":11,"column":3}]}]}
expected: valid
```

<a id="finding-11"></a>

#### 11. `acceptsValid`: rejects valid documents, each one edit from a document that breaks only §5.5.2.1 Fragment Spread Target Defined; the rule it applied is a guess, since the kit doesn't read error messages

1 case, in `random` (1).

Each rejected document is one edit from a document that breaks only `fragmentSpreadTargetDefined`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `random`:

```
problem:  Variable '$v0' of type '[Int]' used in position expecting type 'Int'.
input:    FragmentSpreadTargetDefined-valid-3: query Q0($v0: [Int]) { b: node(id: "1") { id } matrix(rows: [$v0]) }
response: {"valid":false,"errors":[{"message":"Variable '$v0' of type '[Int]' used in position expecting type 'Int'.","locations":[{"line":1,"column":10},{"line":5,"column":17}]}]}
expected: valid
```

<a id="finding-12"></a>

#### 12. `acceptsValid`: rejects valid documents, each one edit from a document that breaks §5.8.5 All Variable Usages Are Allowed and §5.6.1 Values of Correct Type; the rule it applied is a guess, since the kit doesn't read error messages

1 case, in `variables` (1).

Each rejected document is one edit from a document that breaks only `allVariableUsagesAreAllowed` or `valuesOfCorrectType`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `variables`:

```
problem:  Variable '$v' of type '[Int]' used in position expecting type 'Int'.
input:    ValuesOfCorrectType-valid-9: query Q($v: [Int] = null) { matrix(rows: [$v]) }
response: {"valid":false,"errors":[{"message":"Variable '$v' of type '[Int]' used in position expecting type 'Int'.","locations":[{"line":1,"column":9},{"line":2,"column":17}]}]}
expected: valid
```

<a id="finding-13"></a>

#### 13. `acceptsValid`: rejects valid documents, each one edit from a document that breaks only §5.7.1 Directives Are Defined; the rule it applied is a guess, since the kit doesn't read error messages

1 case, in `random` (1).

Each rejected document is one edit from a document that breaks only `directivesAreDefined`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `random`:

```
problem:  Variable '$v1' of type '[Int]' used in position expecting type 'Int'.
input:    DirectivesAreDefined-valid-16: query Q0($v1: [Int], $v0: [Int!]) { matrix(rows: [$v1]) echo(list: $v0, nums: [1], role: ADMIN) a: node(id: "1") { id id } }
response: {"valid":false,"errors":[{"message":"Variable '$v1' of type '[Int]' used in position expecting type 'Int'.","locations":[{"line":1,"column":10},{"line":2,"column":17}]}]}
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
| Executable Definitions (`executableDefinitions`) | MUST | [§5.1.1](https://spec.graphql.org/draft/#sec-Executable-Definitions) | ✗ 4/4 |
| Operation Type Existence (`operationTypeExistence`) | MUST | [§5.2.1.1](https://spec.graphql.org/draft/#sec-Operation-Type-Existence) | ✗ 9/12 |
| Operation Name Uniqueness (`operationNameUniqueness`) | MUST | [§5.2.2.1](https://spec.graphql.org/draft/#sec-Operation-Name-Uniqueness) | ✓ 6 |
| Lone Anonymous Operation (`loneAnonymousOperation`) | MUST | [§5.2.3.1](https://spec.graphql.org/draft/#sec-Lone-Anonymous-Operation) | ✓ 21 |
| Single Root Field (`singleRootField`) | MUST | [§5.2.4.1](https://spec.graphql.org/draft/#sec-Single-Root-Field) | ✗ 15/57 |
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
| All Variable Usages Are Allowed (`allVariableUsagesAreAllowed`) | MUST | [§5.8.5](https://spec.graphql.org/draft/#sec-All-Variable-Usages-Are-Allowed) | ✗ 71/636 |
| Valid documents are accepted (`acceptsValid`) | MUST | [§5](https://spec.graphql.org/draft/#sec-Validation) | ✗ 40/983 |

- **`acceptsValid`** is implied rather than stated: a document is valid when it satisfies every rule of §5, and only invalid requests are kept from execution (§6.1.1); rejecting a valid document applies a rule the spec doesn't have

## Schema

- **Capabilities:** custom-scalar-literals, deferred-items, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 166 submitted, 166 distinct, 0 malformed
- **Adapter problems:** none
- **Checker self-test:** passed (335 negative controls)
- **Run:** kit f0039322bf59, 2026-11-15, strict

### Findings

<a id="finding-1"></a>

#### 1. `inputObjectUnbreakableCycle`: INPUT_OBJECT_UNBREAKABLE_CYCLE not enforced: accepts a schema that breaks only this rule

5 cases, in `input` (5). 2 of them rely on grammar or rules that are only in the draft, not in October 2021.

- An input object can be given a finite value (MUST, [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects))

The shortest case, from `inputObjectUnbreakableCycle.5.invalid`:

```
input:    [draft] input A @oneOf { b: B } input B @oneOf { a: A } type Query { f(a: A): Int }
response: {"valid":true}
expected: invalid: breaks INPUT_OBJECT_UNBREAKABLE_CYCLE and no other rule
```

<a id="finding-2"></a>

#### 2. `argDefaultCompatible`: ARG_DEFAULT_COMPATIBLE not enforced: accepts a schema that breaks only this rule

4 cases, in `defaults` (4). All rely on grammar or rules that are only in the draft, not in October 2021.

- An object field argument's default value coerces to its type (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects))

The shortest case, from `argDefaultCompatible.3.invalid`:

```
input:    [draft] type Query { f(x: Int! = null): Int }
response: {"valid":true}
expected: invalid: breaks ARG_DEFAULT_COMPATIBLE and no other rule
```

<a id="finding-3"></a>

#### 3. `directiveReferencesItselfIndirectly`: DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY not enforced: accepts a schema that breaks only this rule

3 cases, in `directive` (3).

- A directive definition doesn't reference itself through a type or directive (MUST, [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `directiveReferencesItselfIndirectly.3.invalid`:

```
input:    directive @d(c: Color) on ENUM_VALUE enum Color { RED @d BLUE } type Query { a: Color }
response: {"valid":true}
expected: invalid: breaks DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY and no other rule
```

<a id="finding-4"></a>

#### 4. `typeNameNotBuiltin`: TYPE_NAME_NOT_BUILTIN not enforced: accepts a schema that breaks only this rule

2 cases, in `names` (2).

- No type is named like a built-in type (MUST, [§3.3](https://spec.graphql.org/draft/#sec-Schema))

The shortest case, from `typeNameNotBuiltin.1.invalid`:

```
input:    scalar String type Query { a: Int }
response: {"valid":true}
expected: invalid: breaks TYPE_NAME_NOT_BUILTIN and no other rule
```

<a id="finding-5"></a>

#### 5. `rootTypesAreObjects`: ROOT_TYPES_ARE_OBJECTS not enforced: accepts a schema that breaks only this rule

2 cases, in `root` (2).

- Root operation types are object types (MUST, [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types))

The shortest case, from `rootTypesAreObjects.2.invalid`:

```
input:    type Query { a: Int } interface Mutation { a: Int }
response: {"valid":true}
expected: invalid: breaks ROOT_TYPES_ARE_OBJECTS and no other rule
```

<a id="finding-6"></a>

#### 6. `implArgInvariant`: IMPL_ARG_INVARIANT not enforced: accepts a schema that breaks only this rule

2 cases, in `implementation` (2).

- An implementation's field arguments have the interface's argument types (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects))

The shortest case, from `implArgInvariant.1.invalid`:

```
input:    interface I { f(a: Int): Int } type Query implements I { f(a: Int!): Int }
response: {"valid":true}
expected: invalid: breaks IMPL_ARG_INVARIANT and no other rule
```

<a id="finding-7"></a>

#### 7. `unionMembersObjects`: UNION_MEMBERS_OBJECTS: crashes on a schema that breaks only this rule, instead of rejecting it

2 cases, in `union` (2).

- A union's member types are object types (MUST, [§3.8](https://spec.graphql.org/draft/#sec-Unions))

The shortest case, from `unionMembersObjects.1.invalid`:

```
problem:  NullReferenceException: Object reference not set to an instance of an object.
input:    union U = Int type Query { u: U }
response: "the adapter answered with an error: NullReferenceException: Object reference not set to an instance of an object."
expected: invalid: breaks UNION_MEMBERS_OBJECTS and no other rule
```

<a id="finding-8"></a>

#### 8. `requiredArgNotDeprecated`: REQUIRED_ARG_NOT_DEPRECATED not enforced: accepts a schema that breaks only this rule

1 case, in `typeUse` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- A required argument isn't deprecated (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated))

The shortest case, from `requiredArgNotDeprecated.4.invalid`:

```
input:    [draft] directive @d(x: Int! @deprecated) on FIELD type Query { a: Int }
response: {"valid":true}
expected: invalid: breaks REQUIRED_ARG_NOT_DEPRECATED and no other rule
```

<a id="finding-9"></a>

#### 9. `implementsUnique`: IMPLEMENTS_UNIQUE not enforced: accepts a schema that breaks only this rule

1 case, in `implementation` (1).

- A type implements each interface once (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces))

The shortest case, from `implementsUnique.1.invalid`:

```
input:    interface I { a: Int } type Query implements I & I { a: Int }
response: {"valid":true}
expected: invalid: breaks IMPLEMENTS_UNIQUE and no other rule
```

<a id="finding-10"></a>

#### 10. `implementsInterfaces`: IMPLEMENTS_INTERFACES: crashes on a schema that breaks only this rule, instead of rejecting it

1 case, in `implementation` (1).

- A type implements only interface types (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces))

The shortest case, from `implementsInterfaces.1.invalid`:

```
problem:  InvalidCastException: Unable to cast object of type 'GraphQL.Types.ObjectGraphType' to type 'GraphQL.Types.IInterfaceGraphType'.
input:    type O { a: Int } type Query implements O { a: Int }
response: "the adapter answered with an error: InvalidCastException: Unable to cast object of type 'GraphQL.Types.ObjectGraphType' to type 'GraphQL.Types.IInterfaceGraphType'."
expected: invalid: breaks IMPLEMENTS_INTERFACES and no other rule
```

<a id="finding-11"></a>

#### 11. `implementsItself`: IMPLEMENTS_ITSELF not enforced: accepts a schema that breaks only this rule

1 case, in `implementation` (1).

- An interface doesn't implement itself (MUST, [§3.7](https://spec.graphql.org/draft/#sec-Interfaces))

The shortest case, from `implementsItself.1.invalid`:

```
input:    interface A implements A { x: Int } type Query { a: A }
response: {"valid":true}
expected: invalid: breaks IMPLEMENTS_ITSELF and no other rule
```

<a id="finding-12"></a>

#### 12. `implTransitive`: IMPL_TRANSITIVE not enforced: accepts a schema that breaks only this rule

1 case, in `implementation` (1).

- A type also implements the interfaces its interfaces implement (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects))

The shortest case, from `implTransitive.1.invalid`:

```
input:    interface Node { id: ID } interface Resource implements Node { id: ID url: String } type Image implements Resource { id: ID url: String } type Query { i: Image }
response: {"valid":true}
expected: invalid: breaks IMPL_TRANSITIVE and no other rule
```

<a id="finding-13"></a>

#### 13. `implExtraArgOptional`: IMPL_EXTRA_ARG_OPTIONAL over-strict: rejects a valid schema one small edit away from one that breaks it

1 case, in `implementation` (1).

- An implementation's additional arguments aren't required (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects))

The shortest case, from `implExtraArgOptional.1.valid`:

```
input:    interface I { f: Int } type Query implements I { f(b: Int! = 1): Int }
response: {"valid":false,"errors":["Type ObjectGraphType with name 'Query' does not implement interface InterfaceGraphType with name 'I'. Field 'f' argument 'b' is not defined in the interface. Please define the argument to be optional (nullable), include it on the interface field, or remove it from the implementing field."]}
expected: valid (TypeSystem!Verdict is empty)
```

<a id="finding-14"></a>

#### 14. `implFieldCovariant`: IMPL_FIELD_COVARIANT over-strict: rejects a valid schema one small edit away from one that breaks it

1 case, in `implementation` (1).

- An implementation's field returns a subtype of the interface field's type (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects))

The shortest case, from `implFieldCovariant.3.valid`:

```
input:    interface Node { f: Node } type Other { x: Int } type Query implements Node { f: Query }
response: {"valid":false,"errors":["Type ObjectGraphType with name 'Query' does not implement interface InterfaceGraphType with name 'Node'. Field 'f' must be of type 'Node' or covariant from it, but in fact it is of type 'Query'."]}
expected: valid (TypeSystem!Verdict is empty)
```

<a id="finding-15"></a>

#### 15. `implDeprecation`: IMPL_DEPRECATION not enforced: accepts a schema that breaks only this rule

1 case, in `implementation` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- A deprecated implementation field implements a deprecated field (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects))

The shortest case, from `implDeprecation.1.invalid`:

```
input:    [draft] interface I { f: Int } type Query implements I { f: Int @deprecated }
response: {"valid":true}
expected: invalid: breaks IMPL_DEPRECATION and no other rule
```

<a id="finding-16"></a>

#### 16. `unionMembersUnique`: UNION_MEMBERS_UNIQUE not enforced: accepts a schema that breaks only this rule

1 case, in `union` (1).

- A union's member types are unique (MUST, [§3.8](https://spec.graphql.org/draft/#sec-Unions))

The shortest case, from `unionMembersUnique.1.invalid`:

```
input:    union U = Query | Query type Query { u: U }
response: {"valid":true}
expected: invalid: breaks UNION_MEMBERS_UNIQUE and no other rule
```

<a id="finding-17"></a>

#### 17. `enumValuesUnique`: ENUM_VALUES_UNIQUE not enforced: accepts a schema that breaks only this rule

1 case, in `enum` (1).

- An enum's values are unique (MUST, [§3.9](https://spec.graphql.org/draft/#sec-Enums))

The shortest case, from `enumValuesUnique.1.invalid`:

```
input:    enum E { A A } type Query { e: E }
response: {"valid":true}
expected: invalid: breaks ENUM_VALUES_UNIQUE and no other rule
```

<a id="finding-18"></a>

#### 18. `directiveUsesItself`: DIRECTIVE_USES_ITSELF not enforced: accepts a schema that breaks only this rule

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
| Root operation types are object types (`rootTypesAreObjects`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✗ 2/6 |
| Root operation types are all different (`rootTypesDifferent`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✓ 4 |
| An object or interface type defines one or more fields (`fieldsDefined`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 4 |
| Field names are unique within a type (`fieldNamesUnique`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 4 |
| No field name begins with __ (`fieldNameReserved`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 2 |
| Fields return output types (`fieldOutputType`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✓ 4 |
| No argument name begins with __ (`argNameReserved`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 4 |
| Argument names are unique within a field or directive (`argNamesUnique`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 4 |
| Arguments accept input types (`argInputType`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✓ 6 |
| A required argument isn't deprecated (`requiredArgNotDeprecated`). Draft only: the October 2021 edition doesn't have deprecated arguments. | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✗ 1/8 |
| An object field argument's default value coerces to its type (`argDefaultCompatible`). Draft only: the October 2021 edition doesn't have default value validation. | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 4/18 |
| A type implements each interface once (`implementsUnique`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✗ 1/2 |
| A type implements only interface types (`implementsInterfaces`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✗ 1/2 |
| An interface doesn't implement itself (`implementsItself`) | MUST | [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✗ 1/2 |
| A type also implements the interfaces its interfaces implement (`implTransitive`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 1/4 |
| An implementation has every field of the interface (`implFieldProvided`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 2 |
| An implementation's field has every argument of the interface field (`implArgProvided`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 2 |
| An implementation's field arguments have the interface's argument types (`implArgInvariant`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 2/4 |
| An implementation's additional arguments aren't required (`implExtraArgOptional`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 1/2 |
| An implementation's field returns a subtype of the interface field's type (`implFieldCovariant`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 1/8 |
| A deprecated implementation field implements a deprecated field (`implDeprecation`). Draft only: the October 2021 edition doesn't have deprecation of implementing fields. | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 1/2 |
| A union has one or more member types (`unionMembersDefined`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✓ 2 |
| A union's member types are unique (`unionMembersUnique`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✗ 1/2 |
| A union's member types are object types (`unionMembersObjects`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✗ 2/6 |
| An enum has one or more values (`enumValuesDefined`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✓ 2 |
| An enum's values are unique (`enumValuesUnique`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✗ 1/2 |
| No enum value begins with __ (`enumValueNameReserved`) | MUST | [§4](https://spec.graphql.org/draft/#sec-Introspection) | ✓ 2 |
| An input object has one or more fields (`inputFieldsDefined`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 2 |
| Input field names are unique within an input object (`inputFieldNamesUnique`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 2 |
| No input field name begins with __ (`inputFieldNameReserved`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 2 |
| Input fields accept input types (`inputFieldInputType`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✓ 2 |
| A required input field isn't deprecated (`requiredInputFieldNotDeprecated`). Draft only: the October 2021 edition doesn't have deprecated input fields. | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✓ 2 |
| A OneOf input object's fields are nullable (`oneOfFieldNullable`). Draft only: the October 2021 edition doesn't have OneOf input objects. | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 2 |
| A OneOf input object's fields have no default value (`oneOfFieldNoDefault`). Draft only: the October 2021 edition doesn't have OneOf input objects. | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 2 |
| An input object can be given a finite value (`inputObjectUnbreakableCycle`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✗ 5/10 |
| Input object default values don't form a cycle (`inputObjectDefaultValueCycle`). Draft only: the October 2021 edition doesn't have default value validation. | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 8 |
| A directive has one or more locations (`directiveLocationsDefined`). SDL can't write a directive without locations, so no vector breaks this rule | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | – |
| A directive definition doesn't use itself (`directiveUsesItself`) | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 1/2 |
| A directive definition doesn't reference itself through a type or directive (`directiveReferencesItselfIndirectly`) | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 3/6 |

## Introspect

- **Capabilities:** custom-scalar-literals, deferred-items, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 34 submitted, 34 distinct, 34 malformed
- **Adapter problems:** none
- **Checker self-test:** passed (83 negative controls)
- **Run:** kit f0039322bf59, 2026-11-15, strict

### Findings

<a id="finding-1"></a>

#### 1. `executes`: the schema didn't build, the query failed, or the result doesn't have the fields the query selects

34 cases, in `deprecation` (4), `minimal` (3), `rich` (3), `interfaces` (3), `defaults` (3), `directiveDeprecation` (3), `roots` (3), `builtinScalars` (3), `scalars` (3), `oneOf` (3), `order` (3).

- The query executes, and its result has exactly the fields it selects, nulls included (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))

The shortest case, from `minimal.inc`:

```
problem:  the response has errors: Unknown argument 'includeDeprecated' on field 'directives' of type '__Schema'.; Cannot query field 'isRepeatable' on type '__Directive'.; Unknown argument 'includeDeprecated' on field 'args' of type '[__Directive!]!'.; Cannot query field 'isDeprecated' on type '__Directive'.; Cannot query field 'dep
input:    type Query { a: Int }  (the introspection query; includeDeprecated: true)
response: {"response":{"errors":[{"message":"Unknown argument 'includeDeprecated' on field 'directives' of type '__Schema'.","locations":[{"line":9,"column":16}],"extensions":{"code":"KNOWN_ARGUMENT_NAMES","codes":["KNOWN_ARGUMENT_NAMES"],"number":"5.4.1"}},{"message":"Cannot query field 'isRepeatable' on type '__Directive'.","locations":[{"line":12,"column":7}],"extensions":{"code":"FIELDS_ON_CORRECT_TYPE","codes":["FIELDS_ON_CORRECT_TYPE"],"number":"5.3.1"}},{"message":"Unknown argument 'includeDeprecated' on field 'args' of type '[__Directive!]!'.","locations":[{"line":14,"column":12}],"extensions":{"code":"KNOWN_ARGUMENT_NAMES","codes":["KNOWN_ARGUMENT_NAMES"],"number":"5.4.1"}},{"message":"Cannot query field 'isDeprecated' on type '__Directive'.","locations":[{"line":15,"column":7}],"extensions":{"code":"FIELDS_ON_CORRECT_TYPE","codes":["FIELDS_ON_CORRECT_TYPE"],"number":"5.3.1"}},{"message":"Cannot query field 'deprecationReason' on type '__Directive'.","locations":[{"line":16,"column":7}],"extensions":{"code":"FIELDS_ON_CORRECT_TYPE","codes":["FIELDS_ON_CORRECT_TYPE"],"number":"5.3.1"}},{"message":"Cannot query field 'specifiedByURL' on type '__Type'.","locations":[{"line":25,"column":3}],"extensions":{"code":"FIELDS_ON_CORRECT_TYPE","codes":["FIELDS_ON_CORRECT_TYPE"],"number":"5.3.1"}},{"message":"Unknown argument 'includeDeprecated' on field 'args' of type '[__Field!]'.","locations":[{"line":30,"column":10}],"extensions":{"code":"KNOWN_ARGUMENT_NAMES","codes":["KNOWN_ARGUMENT_NAMES"],"number":"5.4.1"}},{"message":"Unknown argument 'includeDeprecated' on field 'inputFields' of type '__Type'.","locations":[{"line":35,"column":15}],"extensions":{"code":"KNOWN_ARGUMENT_NAMES","codes":["KNOWN_ARGUMENT_NAMES"],"number":"5.4.1"}},{"message":"Cannot query field 'isDeprecated' on type '__InputValue'.","locations":[{"line":51,"column":3}],"extensions":{"code":"FIELDS_ON_CORRECT_TYPE","codes":["FIELDS_ON_CORRECT_TYPE"],"number":"5.3.1"}},{"message":"Cannot query field 'deprecationReason' on type '__InputValue'.","locations":[{"line":52,"column":3}],"extensions":{"code":"FIELDS_ON_CORRECT_TYPE","codes":["FIELDS_ON_CORRECT_TYPE"],"number":"5.3.1"}}]}}
expected: a well-formed execution result with exactly the fields the query selects, and no errors
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
| The query executes, and its result has exactly the fields it selects, nulls included (`executes`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✗ 34/34 |
| queryType, mutationType and subscriptionType are the root operation types (`roots`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | – |
| types is the set of all named types (`types`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) | – |
| types has the built-in scalars the schema references, and no others (`builtinScalars`) | MUST | [§3.5](https://spec.graphql.org/draft/#sec-Scalars) [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) | – |
| __type(name:) returns the named type, and null for a name the schema doesn't have (`typeByName`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | – |
| Each __Type has its type's kind, and its fields are null exactly where that kind requires (`typeKinds`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) | – |
| An object's or interface's fields, with their types (`fields`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) | – |
| Field and directive arguments, with their types (`arguments`) | MUST | [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) | – |
| defaultValue encodes the default value, and is null without one (`defaultValue`) | MUST | [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | – |
| An input object's inputFields, with their types (`inputFields`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | – |
| An enum's enumValues (`enumValues`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) | – |
| interfaces, and possibleTypes for unions and interfaces (`interfaces`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) | – |
| isDeprecated, deprecationReason and includeDeprecated; @deprecated is provided when the schema deprecates something (`deprecation`) | MUST | [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | – |
| specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null (`specifiedByURL`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) | – |
| isOneOf is true exactly for OneOf input objects (`isOneOf`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | – |
| Descriptions are the schema's (`descriptions`) | MUST | [§3.2](https://spec.graphql.org/draft/#sec-Type-System-Descriptions) [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | – |
| directives describes the schema's own directives (name, locations, isRepeatable), and any of the service's own takes input types (`directives`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | – |
| @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (`builtinDirectives`) | SHOULD | [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.1](https://spec.graphql.org/draft/#sec-skip) [§3.13.2](https://spec.graphql.org/draft/#sec-include) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) [§3.13.5](https://spec.graphql.org/draft/#sec-oneOf) | – |
| The introspection types and built-in directives are as the spec defines them (`builtinDefinitions`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | – |
| __typename names the root type, and no fields list includes it (`typename`) | MUST | [§4.1](https://spec.graphql.org/draft/#sec-Type-Name-Introspection) | – |
| Fields, arguments, enum values, directives, members and interfaces come in source order (`order`) | SHOULD | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | – |
| Anything else Introspection!Matches requires (`other`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | – |
