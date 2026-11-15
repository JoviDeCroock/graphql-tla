# graphql-dotnet 8.8.5

Generated from the conformance kit's reports. Back to the [sheet](README.md).

**Notes** (hand-written, from outside the kit):

- The adapter uses graphql-dotnet's schema-first `Schema.For`, its default `DocumentExecuter` and the System.Text.Json serializer. List items are `IDataLoaderResult` values, the only kind of item graphql-dotnet waits for. `idle` holds because everything runs on one thread; the determinism replay passed.
- The `resultCoercion` finding: `FloatGraphType` passes a non-finite double through, and `GraphQLSerializer` then throws, so the client gets no response. graphql-dotnet rejects the kit's full introspection queries: it has no `specifiedByURL`, input-value deprecation is behind an experimental flag that is off by default, and `isRepeatable` needs that kind of flag and is also hidden by the default schema filter (only `EnableExperimentalIntrospectionFeatures` shows it). The kit then discovers which fields exist and grades the rest under the October 2021 profile. The default schema filter also hides every directive with a type system location from `__schema.directives`. Parse, validate, schema and introspect findings are described with source locations in the [adapter's README](../adapters/graphql-dotnet/README.md#known-graphql-dotnet-deviations).

## Execution

- **Capabilities:** custom-directives, deferred-items, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 12658 submitted, 3014 distinct, 357 malformed
- **Adapter problems:** none
- **Checker self-test:** passed (41 negative controls)
- **Run:** kit 71f0a24bdc40, 2026-11-15, strict, 1500 random runs per fixture (seed 1), exhaustive runs on

### Findings

<a id="execution-finding-1"></a>

#### 1. `resultCoercion`: the implementation produced no response, after a resolver returned a value its type can't represent: … threw ArgumentException: .NET number values such as positive and negative infinity cannot be written as valid JSON. To make it work when using 'JsonSerializer', consider specifying … (see …

357 cases, in `leaves` (357).

- A non-finite Float or an unknown enum value raises an execution error (MUST, [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion))

The shortest case, from `leaves`:

```
problem:  the implementation produced no response, after a resolver returned a value its type can't represent: "GraphQLSerializer.Serialize threw ArgumentException: .NET number values such as positive and negative infinity cannot be written as valid JSON. To make it work when using 'JsonSerializer', consider specifying 'JsonNumberHandling.AllowNamedFloatingPointLiterals' (see https://docs.microsoft.com/dotnet/api/system.text.json.serialization.jsonnumberhandling)."
trace:    call count; call ratio; call color; settle count = null; settle ratio = uncoercible; settle color = null
response: none: GraphQLSerializer.Serialize threw ArgumentException: .NET number values such as positive and negative infinity cannot be written as valid JSON. To make it work when using 'JsonSerializer', consider specifying 'JsonNumberHandling.AllowNamedFloatingPointLiterals' (see https://docs.microsoft.com/dotnet/api/system.text.json.serialization.jsonnumberhandling).
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
| The response is sent only once execution is complete (`complete`) | MUST | [§6.3.1](https://spec.graphql.org/draft/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ 3014 |
| data is the completed value: field collection, value completion and null propagation (`dataMatches`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 3014 |
| Response keys are in collected field order (`keyOrder`) | SHOULD | [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering) | ✓ 3014 |
| Every error was raised, at the path where it was raised (`errorsWereRaised`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 3014 |
| No two errors share a response path (`errorPathsUnique`) | MUST (Oct 2021: SHOULD) | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 3014 |
| Every error is inside a null in data (`errorsInsideNulls`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 3014 |
| Every null an error caused comes with an error from one of its causes (`nullsExplained`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 3014 |
| A mutation reports every error its earlier root fields raised (`serialErrorsKept`) | MUST | [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 125 |
| A mutation's root fields execute one after another (`calledSerially`) | MUST | [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) | ✓ 125 |
| Each field is executed once, merged selections included (`callsOnce`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) | ✓ 12658 |
| Only fields the operation selects are executed (`callsSelected`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) | ✓ 12658 |
| A field executes only once its parent has a value that contains it (`callsReachable`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 12658 |
| A request gets a response (`responds`) | MUST | [§7.1](https://spec.graphql.org/draft/#sec-Response-Format) | ✓ 12658 |
| A subscription event yields an execution result, even when its data is null (`eventYieldsResult`) | MUST | [§6.2.3.2](https://spec.graphql.org/draft/#sec-Response-Stream) | ✓ 1522 |
| data holds only positions the operation selects (`dataShape`) | MUST | [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ 6555 |
| A non-finite Float or an unknown enum value raises an execution error (`resultCoercion`) | MUST | [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✗ 357/685 |
| A fraction returned for an Int (1.2) raises an execution error instead of being truncated (`intFraction`) | SHOULD | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 384 |
| Leaf values are the resolver's canonical value (Int 1, Float 1.5, Boolean true, an enum's first value, "v") (`leafValues`) | MUST | [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 6555 |
| Leaf values use the JSON type §7.2.1 gives their GraphQL type (a number for Int 1, not "1") (`leafEncoding`) | SHOULD | [§7.2.1](https://spec.graphql.org/draft/#sec-JSON-Serialization) | ✓ 6555 |
| An execution result has a data entry (`dataPresent`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 12301 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 12301 |
| The response has no entries besides data, errors and extensions (`additionalEntries`) | MUST | [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ 12301 |
| extensions is a map (`extensions`) | MUST | [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) | – |
| Errors are maps with a message, and extensions, if present, is a map (`errorFormat`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 10832 |
| An error's locations, if present, is a list of maps with line and column, both positive integers (`errorLocations`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 10766 |
| Execution errors have a path to a position the operation selects (`errorPath`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 10832 |
| Paths are lists of response names (aliases, not field names) and integer list indices (`responsePosition`) | MUST (Oct 2021: SHOULD) | [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) | ✓ 10832 |
| Errors have no entries besides message, locations, path and extensions (`errorEntries`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 10832 |
| The adapter follows the kit's protocol (call types, settles) (`protocol`) | ADAPTER | — | ✓ 12658 |
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
| [`leaves`](../fixtures/leaves.graphql) | ✗ 357/1700 |  |
| [`lists`](../fixtures/lists.graphql) | ✓ 2490 |  |
| [`mutation`](../fixtures/mutation.graphql) | ✓ 1750 |  |
| [`noPropagation`](../fixtures/noPropagation.graphql) | – | needs error-propagation-off |
| [`nullPropagation`](../fixtures/nullPropagation.graphql) | ✓ 1782 |  |
| [`subscription`](../fixtures/subscription.graphql) | ✓ 1522 |  |
| [`unions`](../fixtures/unions.graphql) | ✓ 1838 |  |

## Parse

- **Capabilities:** custom-directives, deferred-items, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 1992 submitted, 1992 distinct, 0 malformed
- **Vectors:** 1992 of 2007 graded (not graded: 15 unsupported by the adapter)
- **Draft only:** 107 of the failing vectors (of 113 draft-only vectors) rely on grammar or rules only in the draft
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
response: {"ok":false,"error":"Error parsing query: Unexpected String \"d\""}
expected: {"ok":true}
```

<a id="parse-finding-2"></a>

#### 2. `stringValue`: accepts what §2.10.4 String Value rejects

9 cases, in `lexer-examples` (6), `strings` (3). All rely on grammar or rules that are only in the draft, not in October 2021.

- String values and block strings (MUST, [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value))

The shortest case, from `lexer-examples`:

```
input:    [draft] "{a(x: \"\\uD83D\")}"
sibling:  "{a(x: \"\")}", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-3"></a>

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

<a id="parse-finding-4"></a>

#### 4. `selectionSets`: rejects what §2.5 Selection Sets accepts

8 cases, in `random-documents` (4), `parser-examples` (3), `field-suffixes` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- Selection sets, including empty ones (MUST, [§2.5](https://spec.graphql.org/draft/#sec-Selection-Sets))

The shortest case, from `parser-examples`:

```
input:    [draft] "{}"
response: {"ok":false,"error":"Error parsing query: Expected Name, found }; for more information see http://spec.graphql.org/October2021/#Field"}
expected: {"ok":true}
```

<a id="parse-finding-5"></a>

#### 5. `stringValue`: rejects what §2.10.4 String Value accepts

6 cases, in `strings` (4), `lexer-examples` (2). All rely on grammar or rules that are only in the draft, not in October 2021.

- String values and block strings (MUST, [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value))

The shortest case, from `strings`:

```
input:    [draft] "{a(x: \"\\u{1F600}\")}"
response: {"ok":false,"error":"Error parsing query: Invalid character escape sequence: \\u{1F6."}
expected: {"ok":true}
```

<a id="parse-finding-6"></a>

#### 6. `document`: accepts what §2.3 Document rejects

2 cases, in `parser-examples` (2).

- A document is one or more executable definitions (MUST, [§2.3](https://spec.graphql.org/draft/#sec-Document))

The shortest case, from `parser-examples`:

```
input:    "  # only a comment"
response: {"ok":true}
expected: {"ok":false}
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
| Descriptions on operations, fragments and variables, not on the query shorthand (`descriptions`) | MUST | [§2.2](https://spec.graphql.org/draft/#sec-Descriptions) | ✗ 84/121 (all draft only) |
| A document is one or more executable definitions (`document`) | MUST | [§2.3](https://spec.graphql.org/draft/#sec-Document) | ✗ 2/98 |
| Operation definitions and the query shorthand (`operations`) | MUST | [§2.4](https://spec.graphql.org/draft/#sec-Operations) | ✓ 101 |
| Selection sets, including empty ones (`selectionSets`) | MUST | [§2.5](https://spec.graphql.org/draft/#sec-Selection-Sets) | ✗ 8/95 (all draft only) |
| Fields (`fields`) | MUST | [§2.6](https://spec.graphql.org/draft/#sec-Fields) | ✓ 96 |
| Arguments (`arguments`) | MUST | [§2.7](https://spec.graphql.org/draft/#sec-Arguments) | ✓ 111 |
| Field aliases (`fieldAlias`) | MUST | [§2.8](https://spec.graphql.org/draft/#sec-Field-Alias) | ✓ 94 |
| Fragment definitions and fragment spreads (`fragments`) | MUST | [§2.9](https://spec.graphql.org/draft/#sec-Fragments) | ✓ 117 |
| Type conditions (`typeConditions`) | MUST | [§2.9.1](https://spec.graphql.org/draft/#sec-Type-Conditions) | ✓ 112 |
| Inline fragments (`inlineFragments`) | MUST | [§2.9.2](https://spec.graphql.org/draft/#sec-Inline-Fragments) | ✓ 100 |
| Input values, and no variables in constant values (`inputValues`) | MUST | [§2.10](https://spec.graphql.org/draft/#sec-Input-Values) | ✓ 122 |
| Int values (`intValue`) | MUST | [§2.10.1](https://spec.graphql.org/draft/#sec-Int-Value) | ✗ 8/46 |
| Float values (`floatValue`) | MUST | [§2.10.2](https://spec.graphql.org/draft/#sec-Float-Value) | ✓ 35 |
| Boolean values (`booleanValue`) | MUST | [§2.10.3](https://spec.graphql.org/draft/#sec-Boolean-Value) | ✓ 3 |
| String values and block strings (`stringValue`) | MUST | [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value) | ✗ 15/153 (all draft only) |
| Null value (`nullValue`) | MUST | [§2.10.5](https://spec.graphql.org/draft/#sec-Null-Value) | ✓ 2 |
| Enum values (`enumValue`) | MUST | [§2.10.6](https://spec.graphql.org/draft/#sec-Enum-Value) | ✓ 14 |
| List values (`listValue`) | MUST | [§2.10.7](https://spec.graphql.org/draft/#sec-List-Value) | ✓ 102 |
| Input object values (`inputObjectValues`) | MUST | [§2.10.8](https://spec.graphql.org/draft/#sec-Input-Object-Values) | ✓ 107 |
| Variables and variable definitions (`variables`) | MUST | [§2.11](https://spec.graphql.org/draft/#sec-Variables) | ✗ 1/158 |
| Type references (`typeReferences`) | MUST | [§2.12](https://spec.graphql.org/draft/#sec-Type-References) | ✓ 114 |
| Directives (`directives`) | MUST | [§2.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 112 |

## Validate

- **Capabilities:** custom-directives, deferred-items, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 3079 submitted, 3079 distinct, 0 malformed
- **Vectors:** 3079 of 3100 graded (not graded: 12 unspecified, 9 custom-scalar-literals)
- **Draft only:** 11 of the failing vectors (of 178 draft-only vectors) rely on grammar or rules only in the draft
- **Adapter problems:** none
- **Checker self-test:** passed (9 negative controls)
- **Run:** kit 71f0a24bdc40, 2026-11-15, strict

### Findings

<a id="validate-finding-1"></a>

#### 1. `allVariableUsagesAreAllowed`: §5.8.5 All Variable Usages Are Allowed isn't enforced: accepts documents that break only this rule; 1 of 72 rely on the draft

72 cases, in `variables` (72). 1 of them rely on grammar or rules that are only in the draft, not in October 2021.

- All Variable Usages Are Allowed (MUST, [§5.8.5](https://spec.graphql.org/draft/#sec-All-Variable-Usages-Are-Allowed))

The shortest case, from `variables`:

```
input:    AllVariableUsagesAreAllowed-4: query Q($v: ID!) { echo(opt: $v) }
response: {"valid":true,"errors":[]}
expected: invalid: AllVariableUsagesAreAllowed ["v"]
```

<a id="validate-finding-2"></a>

#### 2. `acceptsValid`: rejects valid documents, all with the same error message; their invalid siblings break §5.2.4.1 Single Root Field (14), §5.2.3.1 Lone Anonymous Operation (12), §5.2.1.1 Operation Type Existence (3), so the hints point at no one rule: the message says what the implementation objected to

26 cases, in `operations` (26).

Each rejected document is one edit from a document that breaks only `singleRootField` or `loneAnonymousOperation` or `operationTypeExistence`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `operations`:

```
problem:  Subscription 'S7' must have exactly one root field and that field must not be an introspection field.
input:    SingleRootField-valid-22: subscription S7 { a: postAdded { id } a: postAdded { name } }
response: {"valid":false,"errors":[{"message":"Subscription 'S7' must have exactly one root field and that field must not be an introspection field.","locations":[{"line":5,"column":3}]}]}
expected: valid
```

<a id="validate-finding-3"></a>

#### 3. `fieldSelectionMerging`: §5.3.2 Field Selection Merging isn't enforced: accepts documents that break only this rule

22 cases, in `merging` (22).

- Field Selection Merging (MUST, [§5.3.2](https://spec.graphql.org/draft/#sec-Field-Selection-Merging))

The shortest case, from `merging`:

```
input:    FieldSelectionMerging-59: { node(id: "1") { ... on User { a: __typename } ... on Post { a: id } } }
response: {"valid":true,"errors":[]}
expected: invalid: FieldSelectionMerging ["conflict"]
```

<a id="validate-finding-4"></a>

#### 4. `singleRootField`: §5.2.4.1 Single Root Field isn't enforced: accepts documents that break only this rule; 1 of 15 rely on the draft

15 cases, in `operations` (13), `random` (1), `spec` (1). 1 of them rely on grammar or rules that are only in the draft, not in October 2021.

- Single Root Field (MUST, [§5.2.4.1](https://spec.graphql.org/draft/#sec-Single-Root-Field))

The shortest case, from `spec`:

```
input:    SingleRootField-spec-7: subscription sub($bool: Boolean!) { newMessage @include(if: $bool) { body sender } }
response: {"valid":true,"errors":[]}
expected: invalid: SingleRootField ["sub"]
```

<a id="validate-finding-5"></a>

#### 5. `acceptsValid`: rejects valid documents, all with the same error message; their invalid siblings break §5.8.5 All Variable Usages Are Allowed (8), §5.7.1 Directives Are Defined (1), §5.5.2.1 Fragment Spread Target Defined (1), §5.6.1 Values of Correct Type (1), so the hints point at no one rule: the message says what the implementation objected to

10 cases, in `variables` (8), `random` (2).

Each rejected document is one edit from a document that breaks only `allVariableUsagesAreAllowed` or `directivesAreDefined` or `fragmentSpreadTargetDefined` or `valuesOfCorrectType`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `variables`:

```
problem:  Variable '$v' of type '[Int]' used in position expecting type 'Int'.
input:    AllVariableUsagesAreAllowed-valid-47: query Q($v: [Int]) { matrix(rows: [$v]) }
response: {"valid":false,"errors":[{"message":"Variable '$v' of type '[Int]' used in position expecting type 'Int'.","locations":[{"line":1,"column":9},{"line":2,"column":17}]}]}
expected: valid
```

<a id="validate-finding-6"></a>

#### 6. `operationTypeExistence`: §5.2.1.1 Operation Type Existence isn't enforced: accepts documents that break only this rule; all rely on the draft

9 cases, in `operations` (8), `spec` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- Operation Type Existence (MUST, [§5.2.1.1](https://spec.graphql.org/draft/#sec-Operation-Type-Existence))

The shortest case, from `spec`:

```
input:    [draft] OperationTypeExistence-spec-2: mutation goodbyeMutation { goodbye }
response: {"valid":true,"errors":[]}
expected: invalid: OperationTypeExistence ["mutation"]
```

<a id="validate-finding-7"></a>

#### 7. `executableDefinitions`: §5.1.1 Executable Definitions isn't enforced: accepts documents that break only this rule

4 cases, in `executable` (4).

- Executable Definitions (MUST, [§5.1.1](https://spec.graphql.org/draft/#sec-Executable-Definitions))

The shortest case, from `executable`:

```
input:    ExecutableDefinitions-1: directive @x on FIELD { user { id } }
response: {"valid":true,"errors":[]}
expected: invalid: ExecutableDefinitions ["document"]
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
| Executable Definitions (`executableDefinitions`) | MUST | [§5.1.1](https://spec.graphql.org/draft/#sec-Executable-Definitions) | ✗ 4/4 |
| Operation Type Existence (`operationTypeExistence`) | MUST | [§5.2.1.1](https://spec.graphql.org/draft/#sec-Operation-Type-Existence) | ✗ 9/12 (all draft only) |
| Operation Name Uniqueness (`operationNameUniqueness`) | MUST | [§5.2.2.1](https://spec.graphql.org/draft/#sec-Operation-Name-Uniqueness) | ✓ 6 |
| Lone Anonymous Operation (`loneAnonymousOperation`) | MUST | [§5.2.3.1](https://spec.graphql.org/draft/#sec-Lone-Anonymous-Operation) | ✓ 21 |
| Single Root Field (`singleRootField`) | MUST | [§5.2.4.1](https://spec.graphql.org/draft/#sec-Single-Root-Field) | ✗ 15/59 (1 draft only) |
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
| Values of Correct Type (`valuesOfCorrectType`) | MUST | [§5.6.1](https://spec.graphql.org/draft/#sec-Values-of-Correct-Type) | ✓ 282 |
| Input Object Field Names (`inputObjectFieldNames`). every document that breaks this rule also breaks §5.6.1 Values of Correct Type, which subsumes it, so a rejection can't be credited to this rule; accepting one fails both | MUST | [§5.6.2](https://spec.graphql.org/draft/#sec-Input-Object-Field-Names) | ⊂ |
| Input Object Field Uniqueness (`inputObjectFieldUniqueness`) | MUST | [§5.6.3](https://spec.graphql.org/draft/#sec-Input-Object-Field-Uniqueness) | ✓ 6 |
| Input Object Required Fields (`inputObjectRequiredFields`). every document that breaks this rule also breaks §5.6.1 Values of Correct Type, which subsumes it, so a rejection can't be credited to this rule; accepting one fails both | MUST | [§5.6.4](https://spec.graphql.org/draft/#sec-Input-Object-Required-Fields) | ⊂ |
| Directives Are Defined (`directivesAreDefined`) | MUST | [§5.7.1](https://spec.graphql.org/draft/#sec-Directives-Are-Defined) | ✓ 24 |
| Directives Are in Valid Locations (`directivesAreInValidLocations`) | MUST | [§5.7.2](https://spec.graphql.org/draft/#sec-Directives-Are-in-Valid-Locations) | ✓ 27 |
| Directives Are Unique per Location (`directivesAreUniquePerLocation`) | MUST | [§5.7.3](https://spec.graphql.org/draft/#sec-Directives-Are-Unique-per-Location) | ✓ 10 |
| Variable Uniqueness (`variableUniqueness`) | MUST | [§5.8.1](https://spec.graphql.org/draft/#sec-Variable-Uniqueness) | ✓ 6 |
| Variables Are Input Types (`variablesAreInputTypes`) | MUST | [§5.8.2](https://spec.graphql.org/draft/#sec-Variables-Are-Input-Types) | – |
| All Variable Uses Defined (`allVariableUsesDefined`) | MUST | [§5.8.3](https://spec.graphql.org/draft/#sec-All-Variable-Uses-Defined) | ✓ 15 |
| All Variables Used (`allVariablesUsed`) | MUST | [§5.8.4](https://spec.graphql.org/draft/#sec-All-Variables-Used) | ✓ 18 |
| All Variable Usages Are Allowed (`allVariableUsagesAreAllowed`) | MUST | [§5.8.5](https://spec.graphql.org/draft/#sec-All-Variable-Usages-Are-Allowed) | ✗ 72/636 (1 draft only) |
| Valid documents are accepted (`acceptsValid`) | MUST | [§5](https://spec.graphql.org/draft/#sec-Validation) | ✗ 36/979 |

- **Basis for `acceptsValid`:** a document is valid when it satisfies every rule of §5, and only invalid requests are kept from execution (§6.1.1); rejecting a valid document applies a rule the spec doesn't have

## Schema

- **Capabilities:** custom-directives, deferred-items, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 168 submitted, 168 distinct, 0 malformed
- **Vectors:** 168 of 172 graded (not graded: 4 unspecified)
- **Draft only:** 8 of the failing vectors (of 36 draft-only vectors) rely on grammar or rules only in the draft
- **Adapter problems:** none
- **Checker self-test:** passed (343 negative controls)
- **Run:** kit 71f0a24bdc40, 2026-11-15, strict

### Findings

<a id="schema-finding-1"></a>

#### 1. `argDefaultCompatible`: ARG_DEFAULT_COMPATIBLE not enforced: accepts a schema that breaks only this rule

4 cases, in `defaults` (4). All rely on grammar or rules that are only in the draft, not in October 2021.

- An object field argument's default value coerces to its type (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects))

The shortest case, from `argDefaultCompatible.3.invalid`:

```
input:    [draft] type Query { f(x: Int! = null): Int }
response: {"valid":true}
expected: invalid: breaks ARG_DEFAULT_COMPATIBLE and no other rule
```

<a id="schema-finding-2"></a>

#### 2. `inputObjectUnbreakableCycle`: INPUT_OBJECT_UNBREAKABLE_CYCLE not enforced: accepts a schema that breaks only this rule

4 cases, in `input` (4). 2 of them rely on grammar or rules that are only in the draft, not in October 2021.

- An input object can be given a finite value (MUST, [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects))

The shortest case, from `inputObjectUnbreakableCycle.5.invalid`:

```
input:    [draft] input A @oneOf { b: B } input B @oneOf { a: A } type Query { f(a: A): Int }
response: {"valid":true}
expected: invalid: breaks INPUT_OBJECT_UNBREAKABLE_CYCLE and no other rule
```

<a id="schema-finding-3"></a>

#### 3. `implementsItself`: IMPLEMENTS_ITSELF not enforced: accepts a schema that breaks only this rule

2 cases, in `implementation` (2).

- An interface doesn't implement itself (MUST, [§3.7](https://spec.graphql.org/draft/#sec-Interfaces))

The shortest case, from `implementsItself.1.invalid`:

```
input:    interface A implements A { x: Int } type Query { a: A }
response: {"valid":true}
expected: invalid: breaks IMPLEMENTS_ITSELF and no other rule
```

<a id="schema-finding-4"></a>

#### 4. `implArgInvariant`: IMPL_ARG_INVARIANT not enforced: accepts a schema that breaks only this rule

2 cases, in `implementation` (2).

- An implementation's field arguments have the interface's argument types (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects))

The shortest case, from `implArgInvariant.1.invalid`:

```
input:    interface I { f(a: Int): Int } type Query implements I { f(a: Int!): Int }
response: {"valid":true}
expected: invalid: breaks IMPL_ARG_INVARIANT and no other rule
```

<a id="schema-finding-5"></a>

#### 5. `unionMembersObjects`: UNION_MEMBERS_OBJECTS: crashes on a schema that breaks only this rule, instead of rejecting it

2 cases, in `union` (2).

- A union's member types are object types (MUST, [§3.8](https://spec.graphql.org/draft/#sec-Unions))

The shortest case, from `unionMembersObjects.1.invalid`:

```
problem:  NullReferenceException: Object reference not set to an instance of an object.
input:    union U = Int type Query { u: U }
response: "the adapter answered with an error: NullReferenceException: Object reference not set to an instance of an object."
expected: invalid: breaks UNION_MEMBERS_OBJECTS and no other rule
```

<a id="schema-finding-6"></a>

#### 6. `directiveUsesItself`: DIRECTIVE_USES_ITSELF not enforced: accepts a schema that breaks only this rule

2 cases, in `directive` (2).

- A directive definition doesn't use itself (MUST, [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `directiveUsesItself.2.invalid`:

```
input:    directive @d(arg: String @d) on ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION type Query { a: Int }
response: {"valid":true}
expected: invalid: breaks DIRECTIVE_USES_ITSELF and no other rule
```

<a id="schema-finding-7"></a>

#### 7. `directiveReferencesItselfIndirectly`: DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY not enforced: accepts a schema that breaks only this rule

2 cases, in `directive` (2).

- A directive definition doesn't reference itself through a type or directive (MUST, [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `directiveReferencesItselfIndirectly.2.invalid`:

```
input:    directive @d(a: Int @e) on ARGUMENT_DEFINITION directive @e(b: Int @d) on ARGUMENT_DEFINITION type Query { a: Int }
response: {"valid":true}
expected: invalid: breaks DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY and no other rule
```

<a id="schema-finding-8"></a>

#### 8. `typeNameNotBuiltin`: TYPE_NAME_NOT_BUILTIN not enforced: accepts a schema that breaks only this rule

1 case, in `names` (1).

- No type is named like a built-in type (MUST, [§3.3](https://spec.graphql.org/draft/#sec-Schema))

The shortest case, from `typeNameNotBuiltin.2.invalid`:

```
input:    type Int { a: String } type Query { a: String }
response: {"valid":true}
expected: invalid: breaks TYPE_NAME_NOT_BUILTIN and no other rule
```

<a id="schema-finding-9"></a>

#### 9. `rootTypesAreObjects`: ROOT_TYPES_ARE_OBJECTS not enforced: accepts a schema that breaks only this rule

1 case, in `root` (1).

- Root operation types are object types (MUST, [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types))

The shortest case, from `rootTypesAreObjects.3.invalid`:

```
input:    schema { query: Q mutation: In } type Q { a: Int } input In { a: Int }
response: {"valid":true}
expected: invalid: breaks ROOT_TYPES_ARE_OBJECTS and no other rule
```

<a id="schema-finding-10"></a>

#### 10. `requiredArgNotDeprecated`: REQUIRED_ARG_NOT_DEPRECATED not enforced: accepts a schema that breaks only this rule

1 case, in `typeUse` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- A required argument isn't deprecated (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated))

The shortest case, from `requiredArgNotDeprecated.4.invalid`:

```
input:    [draft] directive @d(x: Int! @deprecated) on FIELD type Query { a: Int }
response: {"valid":true}
expected: invalid: breaks REQUIRED_ARG_NOT_DEPRECATED and no other rule
```

<a id="schema-finding-11"></a>

#### 11. `implementsUnique`: IMPLEMENTS_UNIQUE not enforced: accepts a schema that breaks only this rule

1 case, in `implementation` (1).

- A type implements each interface once (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces))

The shortest case, from `implementsUnique.1.invalid`:

```
input:    interface I { a: Int } type Query implements I & I { a: Int }
response: {"valid":true}
expected: invalid: breaks IMPLEMENTS_UNIQUE and no other rule
```

<a id="schema-finding-12"></a>

#### 12. `implementsInterfaces`: IMPLEMENTS_INTERFACES: crashes on a schema that breaks only this rule, instead of rejecting it

1 case, in `implementation` (1).

- A type implements only interface types (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces))

The shortest case, from `implementsInterfaces.1.invalid`:

```
problem:  InvalidCastException: Unable to cast object of type 'GraphQL.Types.ObjectGraphType' to type 'GraphQL.Types.IInterfaceGraphType'.
input:    type O { a: Int } type Query implements O { a: Int }
response: "the adapter answered with an error: InvalidCastException: Unable to cast object of type 'GraphQL.Types.ObjectGraphType' to type 'GraphQL.Types.IInterfaceGraphType'."
expected: invalid: breaks IMPLEMENTS_INTERFACES and no other rule
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

#### 14. `acceptsValid`: rejects a valid schema, one edit from a schema that breaks only implFieldCovariant; which rule it applied is a guess: the message says what the implementation checked

1 case, in `implementation` (1).

Each rejected document is one edit from a document that breaks only `implFieldCovariant`; which rule the implementation applied is a guess.

- Valid schemas are accepted (MUST, [§3](https://spec.graphql.org/draft/#sec-Type-System))

The shortest case, from `implFieldCovariant.3.valid`:

```
problem:  Type ObjectGraphType with name 'Query' does not implement interface InterfaceGraphType with name 'Node'. Field 'f' must be of type 'Node' or covariant from it, but in fact it is of type 'Query'.
input:    interface Node { f: Node } type Other { x: Int } type Query implements Node { f: Query }
response: {"valid":false,"errors":["Type ObjectGraphType with name 'Query' does not implement interface InterfaceGraphType with name 'Node'. Field 'f' must be of type 'Node' or covariant from it, but in fact it is of type 'Query'."]}
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

#### 17. `unionMembersObjects`: UNION_MEMBERS_OBJECTS: crashes on a schema that breaks only this rule, instead of rejecting it

1 case, in `union` (1).

- A union's member types are object types (MUST, [§3.8](https://spec.graphql.org/draft/#sec-Unions))

The shortest case, from `unionMembersObjects.2.invalid`:

```
problem:  ArgumentNullException: Value cannot be null. (Parameter 'type')
input:    interface I { x: Int } union U = I type Query { u: U }
response: "the adapter answered with an error: ArgumentNullException: Value cannot be null. (Parameter 'type')"
expected: invalid: breaks UNION_MEMBERS_OBJECTS and no other rule
```

<a id="schema-finding-18"></a>

#### 18. `enumValuesUnique`: ENUM_VALUES_UNIQUE not enforced: accepts a schema that breaks only this rule

1 case, in `enum` (1).

- An enum's values are unique (MUST, [§3.9](https://spec.graphql.org/draft/#sec-Enums))

The shortest case, from `enumValuesUnique.1.invalid`:

```
input:    enum E { A A } type Query { e: E }
response: {"valid":true}
expected: invalid: breaks ENUM_VALUES_UNIQUE and no other rule
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
| No type name begins with __ (`typeNameReserved`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✓ 1 |
| No two directives have the same name (`directiveNamesUnique`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✓ 1 |
| No directive name begins with __ (`directiveNameReserved`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✓ 1 |
| The query root operation type is provided (`queryRootProvided`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✓ 2 |
| Root operation types are object types (`rootTypesAreObjects`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✗ 1/2 |
| Root operation types are all different (`rootTypesDifferent`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✓ 2 |
| An object or interface type defines one or more fields (`fieldsDefined`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 2 |
| Field names are unique within a type (`fieldNamesUnique`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 2 |
| No field name begins with __ (`fieldNameReserved`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 1 |
| Fields return output types (`fieldOutputType`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✓ 2 |
| No argument name begins with __ (`argNameReserved`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 2 |
| Argument names are unique within a field or directive (`argNamesUnique`). Draft only: the October 2021 edition doesn't have argument name uniqueness | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 2 |
| Arguments accept input types (`argInputType`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✓ 3 |
| A required argument isn't deprecated (`requiredArgNotDeprecated`). Draft only: the October 2021 edition doesn't have deprecated arguments | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✗ 1/3 (all draft only) |
| An object field argument's default value coerces to its type (`argDefaultCompatible`). Draft only: the October 2021 edition doesn't have default value validation | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 4/10 (all draft only) |
| A type implements each interface once (`implementsUnique`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✗ 1/1 |
| A type implements only interface types (`implementsInterfaces`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✗ 1/1 |
| An interface doesn't implement itself (`implementsItself`) | MUST | [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✗ 2/2 |
| A type also implements the interfaces its interfaces implement (`implTransitive`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 1/2 |
| An implementation has every field of the interface (`implFieldProvided`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 1 |
| An implementation's field has every argument of the interface field (`implArgProvided`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 1 |
| An implementation's field arguments have the interface's argument types (`implArgInvariant`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 2/2 |
| An implementation's additional arguments aren't required (`implExtraArgOptional`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 1 |
| An implementation's field returns a subtype of the interface field's type (`implFieldCovariant`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 4 |
| A deprecated implementation field implements a deprecated field (`implDeprecation`). Draft only: the October 2021 edition doesn't have deprecation of implementing fields | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 1/1 (all draft only) |
| A union has one or more member types (`unionMembersDefined`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✓ 1 |
| A union's member types are unique (`unionMembersUnique`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✗ 1/1 |
| A union's member types are object types (`unionMembersObjects`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✗ 3/3 |
| An enum has one or more values (`enumValuesDefined`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✓ 1 |
| An enum's values are unique (`enumValuesUnique`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✗ 1/1 |
| No enum value begins with __ (`enumValueNameReserved`) | MUST | [§4](https://spec.graphql.org/draft/#sec-Introspection) | ✓ 1 |
| An input object has one or more fields (`inputFieldsDefined`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 1 |
| Input field names are unique within an input object (`inputFieldNamesUnique`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 1 |
| No input field name begins with __ (`inputFieldNameReserved`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 1 |
| Input fields accept input types (`inputFieldInputType`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✓ 1 |
| A required input field isn't deprecated (`requiredInputFieldNotDeprecated`). Draft only: the October 2021 edition doesn't have deprecated input fields | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✓ 1 |
| A OneOf input object's fields are nullable (`oneOfFieldNullable`). Draft only: the October 2021 edition doesn't have OneOf input objects | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 1 |
| A OneOf input object's fields have no default value (`oneOfFieldNoDefault`). Draft only: the October 2021 edition doesn't have OneOf input objects | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 1 |
| An input object can be given a finite value (`inputObjectUnbreakableCycle`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✗ 4/4 (2 draft only) |
| Input object default values don't form a cycle (`inputObjectDefaultValueCycle`). Draft only: the October 2021 edition doesn't have default value validation | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 4 |
| A directive has one or more locations (`directiveLocationsDefined`). SDL can't write a directive without locations, so no vector breaks this rule | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | – |
| A directive definition doesn't use itself (`directiveUsesItself`) | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 2/2 |
| A directive definition doesn't reference itself through a type or directive (`directiveReferencesItselfIndirectly`) | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 2/2 |
| Valid schemas are accepted (`acceptsValid`) | MUST | [§3](https://spec.graphql.org/draft/#sec-Type-System) | ✗ 1/87 |

- **Basis for `acceptsValid`:** a schema is invalid only when it breaks a Type Validation rule of §3 or §4's Reserved Names; rejecting, or crashing on, a schema that breaks none applies a rule the spec doesn't have

## Introspect

- **Capabilities:** custom-directives, deferred-items, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 39 submitted, 39 distinct, 0 malformed
- **Vectors:** 39 of 39 graded
- **Profile:** the draft's introspection types. The draft's introspection query was rejected ("Unknown argument 'includeDeprecated' on field 'directives' of type '__Schema'."). The introspection types lack __Type.specifiedByURL, __InputValue.isDeprecated, __InputValue.deprecationReason, __Directive.isRepeatable, __Directive.isDeprecated, __Directive.deprecationReason, __Type.inputFields(includeDeprecated:), __Field.args(includeDeprecated:), __Directive.args(includeDeprecated:) and __Schema.directives(includeDeprecated:), so this run asks the draft's query without them, grades against the draft, and counts what they lack once, under builtinDefinitions.
- **Adapter problems:** none
- **Checker self-test:** passed (176 negative controls)
- **Run:** kit 71f0a24bdc40, 2026-11-15, strict

### Findings

<a id="introspect-finding-1"></a>

#### 1. `builtinAdditions`, `builtinDefinitions`: the built-in @deprecated isn't as the draft defines it, but is as October 2021 does (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Directive has a field the spec doesn't define; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments)

7 cases, in `minimal` (1), `interfaces` (1), `deprecation` (1), `inputDeprecation` (1), `roots` (1), `builtinScalars` (1), `order` (1). 1 of them rely on grammar or rules that are only in the draft, not in October 2021.

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `minimal.inc`:

```
problem:  added:fields at __Directive, arguments at @deprecated(reason:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), directives at @deprecated, enumValues at __DirectiveLocation
input:    type Query { a: Int }  (the introspection query; includeDeprecated: true)
response: {"name":"deprecated","description":"Marks an element of a GraphQL schema as no longer supported.","locations":["FIELD_DEFINITION","ENUM_VALUE"],"args":[{"name":"reason","description":"Explains why this element was deprecated, usually also including a suggestion for how to access supported similar data. Formatted in [Markdown](https://daringfireball.net/projects/markdown/).","type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"No longer supported\""}]}
expected: [object Object]
```

<a id="introspect-finding-2"></a>

#### 2. `builtinDefinitions`: the built-in @deprecated isn't as the draft defines it, but is as October 2021 does (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments)

7 cases, in `minimal` (1), `interfaces` (1), `deprecation` (1), `inputDeprecation` (1), `roots` (1), `builtinScalars` (1), `order` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `minimal.defaults`:

```
problem:  arguments at @deprecated(reason:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), directives at @deprecated, enumValues at __DirectiveLocation
input:    type Query { a: Int }  (the introspection query; includeDeprecated: the default)
response: {"name":"deprecated","description":"Marks an element of a GraphQL schema as no longer supported.","locations":["FIELD_DEFINITION","ENUM_VALUE"],"args":[{"name":"reason","description":"Explains why this element was deprecated, usually also including a suggestion for how to access supported similar data. Formatted in [Markdown](https://daringfireball.net/projects/markdown/).","type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"No longer supported\""}]}
expected: [object Object]
```

<a id="introspect-finding-3"></a>

#### 3. `builtinDefinitions`: the introspection types lack __Type.specifiedByURL, __InputValue.isDeprecated, __InputValue.deprecationReason, __Directive.isRepeatable, __Directive.isDeprecated, __Directive.deprecationReason, __Type.inputFields(includeDeprecated:), __Field.args(includeDeprecated:), __Directive.args(includeDeprecated:) and __Schema.directives(includeDeprecated:), so the kit leaves them out of every query, and grades what it can see without them

1 case, in `discovery` (1).

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `discovery`:

```
problem:  __Type.specifiedByURL, __InputValue.isDeprecated, __InputValue.deprecationReason, __Directive.isRepeatable, __Directive.isDeprecated, __Directive.deprecationReason, __Type.inputFields(includeDeprecated:), __Field.args(includeDeprecated:), __Directive.args(includeDeprecated:), __Schema.directives(includeDeprecated:)
input:    the fields of each introspection type, with their arguments (the kit's IntrospectionFields query)
response: {"data":{"a":{"fields":[{"name":"description","args":[]},{"name":"types","args":[]},{"name":"queryType","args":[]},{"name":"mutationType","args":[]},{"name":"subscriptionType","args":[]},{"name":"directives","args":[]}]},"b":{"fields":[{"name":"kind","args":[]},{"name":"name","args":[]},{"name":"description","args":[]},{"name":"fields","args":[{"name":"includeDeprecated"}]},{"name":"interfaces","args":[]},{"name":"possibleTypes","args":[]},{"name":"enumValues","args":[{"name":"includeDeprecated"}]},{"name":"inputFields","args":[]},{"name":"ofType","args":[]},{"name":"isOneOf","args":[]}]},"c":{"fields":[{"name":"name","args":[]},{"name":"description","args":[]},{"name":"args","args":[]},{"name":"type","args":[]},{"name":"isDeprecated","args":[]},{"name":"deprecationReason","args":[]}]},"d":{"fields":[{"name":"name","args":[]},{"name":"description","args":[]},{"name":"type","args":[]},{"name":"defaultValue","args":[]}]},"e":{"fields":[{"name":"name","args":[]},{"name":"description","args":[]},{"name":"isDeprecated","args":[]},{"name":"deprecationReason","args":[]}]},"f":{"fields":[{"name":"name","args":[]},{"name":"description","args":[]},{"name":"locations","args":[]},{"name":"args","args":[]}]}}}
expected: the fields and arguments the spec defines, including __Type.specifiedByURL, __InputValue.isDeprecated, __InputValue.deprecationReason, __Directive.isRepeatable, __Directive.isDeprecated, __Directive.deprecationReason, __Type.inputFields(includeDeprecated:), __Field.args(includeDeprecated:), __Directive.args(includeDeprecated:) and __Schema.directives(includeDeprecated:)
```

<a id="introspect-finding-4"></a>

#### 4. `builtinAdditions`, `builtinDefinitions`, `builtinDirectives`, `directives`: directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types: differs from Introspection.tla; doesn't provide @specifiedBy; the built-in @deprecated isn't as the draft defines it, but is as October 2021 does (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Directive has a field the spec doesn't define; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments)

1 case, in `rich` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (SHOULD, [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.1](https://spec.graphql.org/draft/#sec-skip) [§3.13.2](https://spec.graphql.org/draft/#sec-include) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) [§3.13.5](https://spec.graphql.org/draft/#sec-oneOf))
- directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types (MUST, [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `rich.inc`:

```
problem:  added:fields at __Directive, arguments at @deprecated(reason:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), builtinDirectives at @specifiedBy, directives at @deprecated, directives at the root, enumValues at __DirectiveLocation
input:    """The schema""" schema { query: Q mutation: M } "The root" type Q { a("An argument" x: Int = 3, y: [Int] = 1, z: In = {b: 2}): U, old: String @deprecated(reason: "gone"), d: Date } type M { m(p: Pick!): Boolean } type A { a: Int } type B { b: Int } union U = B | A enum E { X "Why" Y @deprecated } input In { a: Int = 1, b: Int, e: E = Y, old: String } input Pick { id: ID, name: String } scalar Date "Labels a field" directive @label(v: String, w: Int = 2) repeatable on FIELD_DEFINITION | QUERY  (the introspection query; includeDeprecated: true)
response: {"__typename":"Q","description":"The schema","queryType":{"kind":"OBJECT","name":"Q"},"mutationType":{"kind":"OBJECT","name":"M"},"subscriptionType":null,"types":["E","Date","__Schema","String","__Type","__TypeKind","__Field","__InputValue","Boolean","__EnumValue","__Directive","__DirectiveLocation","Q","M","A","B","U","In","Pick","Int","ID"],"directives":["include","skip","deprecated"]}
expected: [object Object]
```

<a id="introspect-finding-5"></a>

#### 5. `builtinDefinitions`, `builtinDirectives`, `directives`: directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types: differs from Introspection.tla; doesn't provide @specifiedBy; the built-in @deprecated isn't as the draft defines it, but is as October 2021 does (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments)

1 case, in `rich` (1).

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (SHOULD, [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.1](https://spec.graphql.org/draft/#sec-skip) [§3.13.2](https://spec.graphql.org/draft/#sec-include) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) [§3.13.5](https://spec.graphql.org/draft/#sec-oneOf))
- directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types (MUST, [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `rich.defaults`:

```
problem:  arguments at @deprecated(reason:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), builtinDirectives at @specifiedBy, directives at @deprecated, directives at the root, enumValues at __DirectiveLocation
input:    """The schema""" schema { query: Q mutation: M } "The root" type Q { a("An argument" x: Int = 3, y: [Int] = 1, z: In = {b: 2}): U, old: String @deprecated(reason: "gone"), d: Date } type M { m(p: Pick!): Boolean } type A { a: Int } type B { b: Int } union U = B | A enum E { X "Why" Y @deprecated } input In { a: Int = 1, b: Int, e: E = Y, old: String } input Pick { id: ID, name: String } scalar Date "Labels a field" directive @label(v: String, w: Int = 2) repeatable on FIELD_DEFINITION | QUERY  (the introspection query; includeDeprecated: the default)
response: {"__typename":"Q","description":"The schema","queryType":{"kind":"OBJECT","name":"Q"},"mutationType":{"kind":"OBJECT","name":"M"},"subscriptionType":null,"types":["E","Date","__Schema","String","__Type","__TypeKind","__Field","__InputValue","Boolean","__EnumValue","__Directive","__DirectiveLocation","Q","M","A","B","U","In","Pick","Int","ID"],"directives":["include","skip","deprecated"]}
expected: [object Object]
```

<a id="introspect-finding-6"></a>

#### 6. `builtinAdditions`, `builtinDefinitions`, `defaultValueOmitted`: defaultValue is null for an input value that has a default; the built-in @deprecated isn't as the draft defines it, but is as October 2021 does (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Directive has a field the spec doesn't define; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments)

1 case, in `defaults` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- defaultValue encodes the default value of an input value that has one, rather than returning null (SHOULD, [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type))

The shortest case, from `defaults.inc`:

```
problem:  added:fields at __Directive, arguments at @deprecated(reason:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), defaultValueOmitted at Query.f(n:), directives at @deprecated, enumValues at __DirectiveLocation
input:    enum E { X Y } input I { a: Int = 1, b: Int, c: [Int] = 1, e: E = Y, f: Float = 2 } type Query { f(x: [Int] = 1, y: Float = 1, z: ID = 7, w: [[Int]] = [1, 2], i: I = {b: 2}, s: String = "say \"hi\"", n: Int = null, l: [E!] = [X, Y]): Int }  (the introspection query; includeDeprecated: true)
response: {"kind":"OBJECT","name":"Query","description":null,"isOneOf":null,"fields":[{"name":"f","description":null,"args":[{"name":"x","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}},"defaultValue":"[1]"},{"name":"y","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1"},{"name":"z","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"\"7\""},{"name":"w","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}}},"defaultValue":"[[1], [2]]"},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"I","ofType":null},"defaultValue":"{a: 1, b: 2, c: [1], e: Y, f: 2}"},{"name":"s","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"say \\\"hi\\\"\""},{"name":"n","description":null,"type":{"kind":"SCALAR","name":"Int","ofType":null},"defaultValue":null},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"ENUM","name":"E","ofType":null}}},"defaultValue":"[X, Y]"}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-7"></a>

#### 7. `builtinDefinitions`, `defaultValueOmitted`: defaultValue is null for an input value that has a default; the built-in @deprecated isn't as the draft defines it, but is as October 2021 does (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments)

1 case, in `defaults` (1).

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- defaultValue encodes the default value of an input value that has one, rather than returning null (SHOULD, [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type))

The shortest case, from `defaults.defaults`:

```
problem:  arguments at @deprecated(reason:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), defaultValueOmitted at Query.f(n:), directives at @deprecated, enumValues at __DirectiveLocation
input:    enum E { X Y } input I { a: Int = 1, b: Int, c: [Int] = 1, e: E = Y, f: Float = 2 } type Query { f(x: [Int] = 1, y: Float = 1, z: ID = 7, w: [[Int]] = [1, 2], i: I = {b: 2}, s: String = "say \"hi\"", n: Int = null, l: [E!] = [X, Y]): Int }  (the introspection query; includeDeprecated: the default)
response: {"kind":"OBJECT","name":"Query","description":null,"isOneOf":null,"fields":[{"name":"f","description":null,"args":[{"name":"x","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}},"defaultValue":"[1]"},{"name":"y","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1"},{"name":"z","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"\"7\""},{"name":"w","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}}},"defaultValue":"[[1], [2]]"},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"I","ofType":null},"defaultValue":"{a: 1, b: 2, c: [1], e: Y, f: 2}"},{"name":"s","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"say \\\"hi\\\"\""},{"name":"n","description":null,"type":{"kind":"SCALAR","name":"Int","ofType":null},"defaultValue":null},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"ENUM","name":"E","ofType":null}}},"defaultValue":"[X, Y]"}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-8"></a>

#### 8. `builtinAdditions`, `builtinDefinitions`, `builtinDirectives`: doesn't provide @specifiedBy; the built-in @deprecated isn't as the draft defines it, but is as October 2021 does (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Directive has a field the spec doesn't define; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments)

1 case, in `scalars` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (SHOULD, [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.1](https://spec.graphql.org/draft/#sec-skip) [§3.13.2](https://spec.graphql.org/draft/#sec-include) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) [§3.13.5](https://spec.graphql.org/draft/#sec-oneOf))

The shortest case, from `scalars.inc`:

```
problem:  added:fields at __Directive, arguments at @deprecated(reason:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), builtinDirectives at @specifiedBy, directives at @deprecated, enumValues at __DirectiveLocation
input:    "A date" scalar Date @specifiedBy(url: "https://example.com/date") scalar Plain type Query { d: Date, p: Plain }  (the introspection query; includeDeprecated: true)
response: "no directive specifiedBy"
expected: [object Object]
```

<a id="introspect-finding-9"></a>

#### 9. `builtinDefinitions`, `builtinDirectives`: doesn't provide @specifiedBy; the built-in @deprecated isn't as the draft defines it, but is as October 2021 does (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments)

1 case, in `scalars` (1).

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (SHOULD, [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.1](https://spec.graphql.org/draft/#sec-skip) [§3.13.2](https://spec.graphql.org/draft/#sec-include) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) [§3.13.5](https://spec.graphql.org/draft/#sec-oneOf))

The shortest case, from `scalars.defaults`:

```
problem:  arguments at @deprecated(reason:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), builtinDirectives at @specifiedBy, directives at @deprecated, enumValues at __DirectiveLocation
input:    "A date" scalar Date @specifiedBy(url: "https://example.com/date") scalar Plain type Query { d: Date, p: Plain }  (the introspection query; includeDeprecated: the default)
response: "no directive specifiedBy"
expected: [object Object]
```

<a id="introspect-finding-10"></a>

#### 10. `builtinAdditions`, `builtinDefinitions`, `directives`: doesn't return @oneOf in directives, though an input object's isOneOf shows it is provided (draft only); the built-in @deprecated isn't as the draft defines it, but is as October 2021 does (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Directive has a field the spec doesn't define; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments)

1 case, in `oneOf` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types (MUST, [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `oneOf.inc`:

```
problem:  added:fields at __Directive, arguments at @deprecated(reason:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), directives at @deprecated, enumValues at __DirectiveLocation, requiredDirective at @oneOf
input:    [draft] input Pick @oneOf { id: ID, name: String } input Plain { x: Int! } type Query { a(p: Pick, q: Plain): Int }  (the introspection query; includeDeprecated: true)
response: "no directive oneOf"
expected: [object Object]
```

<a id="introspect-finding-11"></a>

#### 11. `builtinDefinitions`, `directives`: doesn't return @oneOf in directives, though an input object's isOneOf shows it is provided (draft only); the built-in @deprecated isn't as the draft defines it, but is as October 2021 does (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments)

1 case, in `oneOf` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types (MUST, [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `oneOf.defaults`:

```
problem:  arguments at @deprecated(reason:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), directives at @deprecated, enumValues at __DirectiveLocation, requiredDirective at @oneOf
input:    [draft] input Pick @oneOf { id: ID, name: String } input Plain { x: Int! } type Query { a(p: Pick, q: Plain): Int }  (the introspection query; includeDeprecated: the default)
response: "no directive oneOf"
expected: [object Object]
```

<a id="introspect-finding-12"></a>

#### 12. `defaultValueOmitted`: defaultValue is null for an input value that has a default

1 case, in `defaults` (1).

- defaultValue encodes the default value of an input value that has one, rather than returning null (SHOULD, [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type))

The shortest case, from `defaults.lookup`:

```
problem:  defaultValueOmitted at Query.f(n:)
input:    enum E { X Y } input I { a: Int = 1, b: Int, c: [Int] = 1, e: E = Y, f: Float = 2 } type Query { f(x: [Int] = 1, y: Float = 1, z: ID = 7, w: [[Int]] = [1, 2], i: I = {b: 2}, s: String = "say \"hi\"", n: Int = null, l: [E!] = [X, Y]): Int }  (__type(name:) for Query, I, Unknown; includeDeprecated: true)
response: {"__type(name: \"Query\")":{"kind":"OBJECT","name":"Query","description":null,"isOneOf":null,"fields":[{"name":"f","description":null,"args":[{"name":"x","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}},"defaultValue":"[1]"},{"name":"y","description":null,"type":{"kind":"SCALAR","name":"Float","ofType":null},"defaultValue":"1"},{"name":"z","description":null,"type":{"kind":"SCALAR","name":"ID","ofType":null},"defaultValue":"\"7\""},{"name":"w","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"Int","ofType":null}}},"defaultValue":"[[1], [2]]"},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"I","ofType":null},"defaultValue":"{a: 1, b: 2, c: [1], e: Y, f: 2}"},{"name":"s","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"say \\\"hi\\\"\""},{"name":"n","description":null,"type":{"kind":"SCALAR","name":"Int","ofType":null},"defaultValue":null},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"NON_NULL","name":null,"ofType":{"kind":"ENUM","name":"E","ofType":null}}},"defaultValue":"[X, Y]"}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}}
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
| defaultValue encodes the default value of an input value that has one, rather than returning null (`defaultValueOmitted`) | SHOULD | [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | ! 3/35 |
| An input object's inputFields, with their types (`inputFields`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | ✓ 35 |
| An enum's enumValues (`enumValues`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) | ✓ 35 |
| interfaces, and possibleTypes for unions and interfaces (`interfaces`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) | ✓ 35 |
| isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something (`deprecation`) | MUST (Oct 2021: fields and enum values only) | [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✓ 35 |
| specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null (`specifiedByURL`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) | ✓ 35 |
| isOneOf is true exactly for OneOf input objects (`isOneOf`). Draft only: October 2021 has no OneOf input objects. | MUST (draft only) | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 35 |
| A description the document gives is returned as it is, the schema's included (`descriptions`) | SHOULD | [§3.2](https://spec.graphql.org/draft/#sec-Type-System-Descriptions) [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 35 |
| directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types (`directives`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 4/22 (2 draft only) |
| @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (`builtinDirectives`) | SHOULD | [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.1](https://spec.graphql.org/draft/#sec-skip) [§3.13.2](https://spec.graphql.org/draft/#sec-include) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) [§3.13.5](https://spec.graphql.org/draft/#sec-oneOf) | ! 4/22 |
| The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (`builtinDefinitions`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 23/36 (22 draft only) |
| The fields of the introspection types have the Non-Null wrapping the spec gives them (`builtinNullability`) | SHOULD | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 35 |
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
