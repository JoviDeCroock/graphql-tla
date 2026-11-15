# graphql-ruby 2.6.15

Generated from the conformance kit's reports. Back to the [sheet](README.md).

**Notes** (hand-written, from outside the kit):

- The sheet runs graphql-ruby with `--invalid-results`: a schema that uses graphql-ruby's documented `type_error` and `rescue_from` hooks. Out of the box, a resolver result of the wrong shape (a non-list for a list, an object for an Int, a runtime type that isn't a possible type) or one its type can't represent (a non-finite Float, an unknown enum value) raises out of `execute` instead of becoming a field error (§6.4.4), so the client gets no response at all. The sheet's `resultCoercion` pass depends on the hooks; without them the adapter answers `no-response` and the kit counts these against `responds` and `resultCoercion`.
- The `intFraction` finding (a SHOULD) is graphql-ruby's Int coercion, which calls `to_i`, so `1.2` becomes `1`, with or without the hooks. Boolean is `!!value`, so `"false"` becomes `true`; the kit doesn't probe Boolean, since §3.5.4 leaves reasonable coercions to the service. See the [adapter's README](../adapters/graphql-ruby/README.md).
- graphql-ruby validates before executing, and documents running an invalid document with `validate: false` as undefined, so the sheet's coerce run validates first and grades invalid documents under `invalidNotExecuted` (§6.1.1). graphql-ruby's validate results use its defaults, including the `allow_legacy_*` settings that only log a warning; see the [adapter's README](../adapters/graphql-ruby/README.md).

## Execution

- **Capabilities:** absent-vs-null, coerce, custom-directives, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 11864 submitted, 1929 distinct, 385 malformed
- **Adapter problems:** none
- **Checker self-test:** passed (41 negative controls)
- **Run:** kit 71f0a24bdc40, 2026-11-15, strict, 1500 random runs per fixture (seed 1), exhaustive runs on

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

#### 2. `intFraction`: … is 1, though its resolver returned a value its type can't represent, which should raise an execution error

42 cases, in `unions` (42).

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
| The response is sent only once execution is complete (`complete`) | MUST | [§6.3.1](https://spec.graphql.org/draft/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ 2064 |
| data is the completed value: field collection, value completion and null propagation (`dataMatches`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2064 |
| Response keys are in collected field order (`keyOrder`) | SHOULD | [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering) | ✓ 2064 |
| Every error was raised, at the path where it was raised (`errorsWereRaised`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 2064 |
| No two errors share a response path (`errorPathsUnique`) | MUST (Oct 2021: SHOULD) | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2064 |
| Every error is inside a null in data (`errorsInsideNulls`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2064 |
| Every null an error caused comes with an error from one of its causes (`nullsExplained`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 2064 |
| A mutation reports every error its earlier root fields raised (`serialErrorsKept`) | MUST | [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 125 |
| A mutation's root fields execute one after another (`calledSerially`) | MUST | [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) | ✓ 125 |
| Each field is executed once, merged selections included (`callsOnce`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) | ✓ 11864 |
| Only fields the operation selects are executed (`callsSelected`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) | ✓ 11864 |
| A field executes only once its parent has a value that contains it (`callsReachable`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 11864 |
| A request gets a response (`responds`) | MUST | [§7.1](https://spec.graphql.org/draft/#sec-Response-Format) | ✓ 11864 |
| A subscription event yields an execution result, even when its data is null (`eventYieldsResult`) | MUST | [§6.2.3.2](https://spec.graphql.org/draft/#sec-Response-Stream) | ✓ 1522 |
| data holds only positions the operation selects (`dataShape`) | MUST | [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ 6230 |
| A non-finite Float or an unknown enum value raises an execution error (`resultCoercion`) | MUST | [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 685 |
| A fraction returned for an Int (1.2) raises an execution error instead of being truncated (`intFraction`) | SHOULD | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ! 385/385 |
| Leaf values are the resolver's canonical value (Int 1, Float 1.5, Boolean true, an enum's first value, "v") (`leafValues`) | MUST | [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 6230 |
| Leaf values use the JSON type §7.2.1 gives their GraphQL type (a number for Int 1, not "1") (`leafEncoding`) | SHOULD | [§7.2.1](https://spec.graphql.org/draft/#sec-JSON-Serialization) | ✓ 6230 |
| An execution result has a data entry (`dataPresent`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 11864 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 11864 |
| The response has no entries besides data, errors and extensions (`additionalEntries`) | MUST | [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ 11864 |
| extensions is a map (`extensions`) | MUST | [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) | – |
| Errors are maps with a message, and extensions, if present, is a map (`errorFormat`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 10155 |
| An error's locations, if present, is a list of maps with line and column, both positive integers (`errorLocations`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 10017 |
| Execution errors have a path to a position the operation selects (`errorPath`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 10155 |
| Paths are lists of response names (aliases, not field names) and integer list indices (`responsePosition`) | MUST (Oct 2021: SHOULD) | [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) | ✓ 10155 |
| Errors have no entries besides message, locations, path and extensions (`errorEntries`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 10155 |
| The adapter follows the kit's protocol (call types, settles) (`protocol`) | ADAPTER | — | ✓ 11864 |
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
| [`lists`](../fixtures/lists.graphql) | ✓ 1842 |  |
| [`mutation`](../fixtures/mutation.graphql) | ✓ 1750 |  |
| [`noPropagation`](../fixtures/noPropagation.graphql) | – | needs error-propagation-off |
| [`nullPropagation`](../fixtures/nullPropagation.graphql) | ✓ 1710 |  |
| [`subscription`](../fixtures/subscription.graphql) | ✓ 1522 |  |
| [`unions`](../fixtures/unions.graphql) | ! 42/1764 |  |

## Parse

- **Capabilities:** absent-vs-null, coerce, custom-directives, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 2001 submitted, 2001 distinct, 0 malformed
- **Vectors:** 2001 of 2007 graded (not graded: 6 unsupported by the adapter)
- **Draft only:** 84 of the failing vectors (of 116 draft-only vectors) rely on grammar or rules only in the draft
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
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-2"></a>

#### 2. `typeReferences`: rejects what §2.12 Type References accepts

20 cases, in `random-documents` (20).

- Type references (MUST, [§2.12](https://spec.graphql.org/draft/#sec-Type-References))

The shortest case, from `random-documents`:

```
input:    "mutation\n( $ #c\nb #c\n:,on,) {\n... query #c\n}"
sibling:  "mutation\n( null #c\nb #c\n:,on,) {\n... query #c\n}", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-3"></a>

#### 3. `floatValue`: accepts what §2.10.2 Float Value rejects

9 cases, in `numbers` (7), `lexer-examples` (2).

- Float values (MUST, [§2.10.2](https://spec.graphql.org/draft/#sec-Float-Value))

The shortest case, from `numbers`:

```
input:    "{a(x: [0E])}"
sibling:  "{a(x: [E])}", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-4"></a>

#### 4. `intValue`: accepts what §2.10.1 Int Value rejects

8 cases, in `numbers` (5), `lexer-examples` (3).

- Int values (MUST, [§2.10.1](https://spec.graphql.org/draft/#sec-Int-Value))

The shortest case, from `lexer-examples`:

```
input:    "{a(x: [1_])}"
sibling:  "{a(x: [_])}", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-5"></a>

#### 5. `stringValue`: rejects what §2.10.4 String Value accepts

5 cases, in `block-strings` (3), `lexer-examples` (2).

- String values and block strings (MUST, [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value))

The shortest case, from `lexer-examples`:

```
input:    "{a(x: \"\"\"\\\"\"\"\"\"\")}"
sibling:  "{a(x: \"\"\"\\\"\"\"\"\")}", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-6"></a>

#### 6. `stringValue`: accepts what §2.10.4 String Value rejects

5 cases, in `block-strings` (4), `lexer-examples` (1).

- String values and block strings (MUST, [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value))

The shortest case, from `lexer-examples`:

```
input:    "{a(x: \"\"\"\\\"\"\")}"
sibling:  "{a(x: \"\"\"\"\"\")}", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-7"></a>

#### 7. `fragments`: accepts what §2.9 Fragments rejects

3 cases, in `fragment-definitions` (3).

- Fragment definitions and fragment spreads (MUST, [§2.9](https://spec.graphql.org/draft/#sec-Fragments))

The shortest case, from `fragment-definitions`:

```
input:    "fragment on F {a}"
sibling:  "fragment F on F {a}", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-8"></a>

#### 8. `variables`: accepts what §2.11 Variables rejects

2 cases, in `parser-examples` (2).

- Variables and variable definitions (MUST, [§2.11](https://spec.graphql.org/draft/#sec-Variables))

The shortest case, from `parser-examples`:

```
input:    "query () {a}"
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
| Source text is a sequence of SourceCharacter (`sourceText`) | MUST | [§2.1](https://spec.graphql.org/draft/#sec-Source-Text) | ✓ 28 |
| White space is tab and space only (`whiteSpace`) | MUST | [§2.1.1](https://spec.graphql.org/draft/#sec-White-Space) | ✓ 27 |
| Line terminators are LF, CR and CR LF only (`lineTerminators`) | MUST | [§2.1.2](https://spec.graphql.org/draft/#sec-Line-Terminators) | ✓ 31 |
| A comment runs to the end of its line (`comments`) | MUST | [§2.1.3](https://spec.graphql.org/draft/#sec-Comments) | ✓ 21 |
| Commas are insignificant (`insignificantCommas`) | MUST | [§2.1.4](https://spec.graphql.org/draft/#sec-Insignificant-Commas) | ✓ 5 |
| Every character outside ignored tokens is part of a token (`lexicalTokens`) | MUST | [§2.1.5](https://spec.graphql.org/draft/#sec-Lexical-Tokens) | ✓ 43 |
| Ignored tokens may appear before and after every token (`ignoredTokens`) | MUST | [§2.1.6](https://spec.graphql.org/draft/#sec-Ignored-Tokens) | ✓ 421 |
| Punctuators, and `...` only as a whole (`punctuators`) | MUST | [§2.1.7](https://spec.graphql.org/draft/#sec-Punctuators) | ✓ 40 |
| Names (`names`) | MUST | [§2.1.8](https://spec.graphql.org/draft/#sec-Names) | ✓ 14 |
| Descriptions on operations, fragments and variables, not on the query shorthand (`descriptions`) | MUST | [§2.2](https://spec.graphql.org/draft/#sec-Descriptions) | ✗ 84/121 (all draft only) |
| A document is one or more executable definitions (`document`) | MUST | [§2.3](https://spec.graphql.org/draft/#sec-Document) | ✓ 98 |
| Operation definitions and the query shorthand (`operations`) | MUST | [§2.4](https://spec.graphql.org/draft/#sec-Operations) | ✓ 101 |
| Selection sets, including empty ones (`selectionSets`) | MUST | [§2.5](https://spec.graphql.org/draft/#sec-Selection-Sets) | ✓ 95 |
| Fields (`fields`) | MUST | [§2.6](https://spec.graphql.org/draft/#sec-Fields) | ✓ 96 |
| Arguments (`arguments`) | MUST | [§2.7](https://spec.graphql.org/draft/#sec-Arguments) | ✓ 111 |
| Field aliases (`fieldAlias`) | MUST | [§2.8](https://spec.graphql.org/draft/#sec-Field-Alias) | ✓ 94 |
| Fragment definitions and fragment spreads (`fragments`) | MUST | [§2.9](https://spec.graphql.org/draft/#sec-Fragments) | ✗ 3/117 |
| Type conditions (`typeConditions`) | MUST | [§2.9.1](https://spec.graphql.org/draft/#sec-Type-Conditions) | ✓ 112 |
| Inline fragments (`inlineFragments`) | MUST | [§2.9.2](https://spec.graphql.org/draft/#sec-Inline-Fragments) | ✓ 100 |
| Input values, and no variables in constant values (`inputValues`) | MUST | [§2.10](https://spec.graphql.org/draft/#sec-Input-Values) | ✓ 122 |
| Int values (`intValue`) | MUST | [§2.10.1](https://spec.graphql.org/draft/#sec-Int-Value) | ✗ 8/46 |
| Float values (`floatValue`) | MUST | [§2.10.2](https://spec.graphql.org/draft/#sec-Float-Value) | ✗ 9/35 |
| Boolean values (`booleanValue`) | MUST | [§2.10.3](https://spec.graphql.org/draft/#sec-Boolean-Value) | ✓ 3 |
| String values and block strings (`stringValue`) | MUST | [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value) | ✗ 10/153 |
| Null value (`nullValue`) | MUST | [§2.10.5](https://spec.graphql.org/draft/#sec-Null-Value) | ✓ 2 |
| Enum values (`enumValue`) | MUST | [§2.10.6](https://spec.graphql.org/draft/#sec-Enum-Value) | ✓ 14 |
| List values (`listValue`) | MUST | [§2.10.7](https://spec.graphql.org/draft/#sec-List-Value) | ✓ 102 |
| Input object values (`inputObjectValues`) | MUST | [§2.10.8](https://spec.graphql.org/draft/#sec-Input-Object-Values) | ✓ 107 |
| Variables and variable definitions (`variables`) | MUST | [§2.11](https://spec.graphql.org/draft/#sec-Variables) | ✗ 2/158 |
| Type references (`typeReferences`) | MUST | [§2.12](https://spec.graphql.org/draft/#sec-Type-References) | ✗ 20/114 |
| Directives (`directives`) | MUST | [§2.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 112 |

## Validate

- **Capabilities:** absent-vs-null, coerce, custom-directives, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 3079 submitted, 3079 distinct, 0 malformed
- **Vectors:** 3079 of 3100 graded (not graded: 12 unspecified, 9 custom-scalar-literals)
- **Draft only:** 4 of the failing vectors (of 178 draft-only vectors) rely on grammar or rules only in the draft
- **Adapter problems:** none
- **Checker self-test:** passed (9 negative controls)
- **Run:** kit 71f0a24bdc40, 2026-11-15, strict

### Findings

<a id="validate-finding-1"></a>

#### 1. `fieldSelectionMerging`: §5.3.2 Field Selection Merging isn't enforced: accepts documents that break only this rule

241 cases, in `merging` (239), `spec` (2).

- Field Selection Merging (MUST, [§5.3.2](https://spec.graphql.org/draft/#sec-Field-Selection-Merging))

The shortest case, from `spec`:

```
input:    FieldSelectionMerging-spec-12: { pet { ...conflictingNullability } } fragment conflictingNullability on Pet { ... on Dog { x: name } ... on Cat { x: nickname } }
response: {"valid":true,"errors":[]}
expected: invalid: FieldSelectionMerging ["conflict"]
```

<a id="validate-finding-2"></a>

#### 2. `allVariableUsagesAreAllowed`: §5.8.5 All Variable Usages Are Allowed isn't enforced: accepts documents that break only this rule; 3 of 38 rely on the draft

38 cases, in `variables` (38). 3 of them rely on grammar or rules that are only in the draft, not in October 2021.

- All Variable Usages Are Allowed (MUST, [§5.8.5](https://spec.graphql.org/draft/#sec-All-Variable-Usages-Are-Allowed))

The shortest case, from `variables`:

```
input:    AllVariableUsagesAreAllowed-50: query Q($v: ID) { matrix(rows: [[$v]]) }
response: {"valid":true,"errors":[]}
expected: invalid: AllVariableUsagesAreAllowed ["v"]
```

<a id="validate-finding-3"></a>

#### 3. `acceptsValid`: rejects valid documents, all with the same error message; their invalid siblings break §5.3.3 Leaf Field Selections (5), §5.5.2.3 Fragment Spread Is Possible (4), §5.3.1 Field Selections (3), §5.5.2.1 Fragment Spread Target Defined (3) and 7 other rules, so the hints point at no one rule: the message says what the implementation objected to

24 cases, in `random` (22), `leaves` (2).

Each rejected document is one edit from a document that breaks only `leafFieldSelections` or `fragmentSpreadIsPossible` or `fieldSelections` or `fragmentSpreadTargetDefined` or `allVariablesUsed` or `directivesAreDefined` or `valuesOfCorrectType` or `fieldSelectionMerging` or `fragmentsMustBeUsed` or `fragmentsOnObjectInterfaceOrUnionTypes` or `requiredArguments`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `random`:

```
problem:  Field 'resource' doesn't exist on type 'Query'
input:    FragmentSpreadTargetDefined-valid-1: { resource { url } }
response: {"valid":false,"errors":[{"message":"Field 'resource' doesn't exist on type 'Query'","locations":[{"line":2,"column":3}]}]}
expected: valid
```

<a id="validate-finding-4"></a>

#### 4. `singleRootField`: §5.2.4.1 Single Root Field isn't enforced: accepts documents that break only this rule; 1 of 22 rely on the draft

22 cases, in `operations` (20), `random` (1), `spec` (1). 1 of them rely on grammar or rules that are only in the draft, not in October 2021.

- Single Root Field (MUST, [§5.2.4.1](https://spec.graphql.org/draft/#sec-Single-Root-Field))

The shortest case, from `spec`:

```
input:    SingleRootField-spec-7: subscription sub($bool: Boolean!) { newMessage @include(if: $bool) { body sender } }
response: {"valid":true,"errors":[]}
expected: invalid: SingleRootField ["sub"]
```

<a id="validate-finding-5"></a>

#### 5. `leafFieldSelections`: §5.3.3 Leaf Field Selections isn't enforced: accepts documents that break only this rule

3 cases, in `leaves` (1), `random` (1), `spec` (1).

- Leaf Field Selections (MUST, [§5.3.3](https://spec.graphql.org/draft/#sec-Leaf-Field-Selections))

The shortest case, from `spec`:

```
input:    LeafFieldSelections-spec-5: query directQueryOnUnionWithoutSubFields { catOrDog }
response: {"valid":true,"errors":[]}
expected: invalid: LeafFieldSelections ["catOrDog"]
```

<a id="validate-finding-6"></a>

#### 6. `acceptsValid`: rejects valid documents, the spec's own examples of documents valid under §5.5.2.3 Fragment Spread Is Possible; the rule it applied is a guess, since the kit doesn't interpret error messages

1 case, in `spec` (1).

Each rejected document is one edit from a document that breaks only `fragmentSpreadIsPossible`; which rule the implementation applied is a guess.

- Valid documents are accepted (MUST, [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `spec`:

```
problem:  No such type DogOrHuman, so it can't be a fragment condition
input:    FragmentSpreadIsPossible-spec-8: { pet { ...unionWithInterface } } fragment unionWithInterface on Pet { ...dogOrHumanFragment } fragment dogOrHumanFragment on DogOrHuman { ... on Dog { barkVolume } }
response: {"valid":false,"errors":[{"message":"No such type DogOrHuman, so it can't be a fragment condition","locations":[{"line":11,"column":1}]}]}
expected: valid
```

<a id="validate-finding-7"></a>

#### 7. `inputObjectFieldUniqueness`: §5.6.3 Input Object Field Uniqueness isn't enforced: accepts documents that break only this rule

1 case, in `extra` (1).

- Input Object Field Uniqueness (MUST, [§5.6.3](https://spec.graphql.org/draft/#sec-Input-Object-Field-Uniqueness))

The shortest case, from `extra`:

```
input:    InputObjectFieldUniqueness-4: query Q($f: Filter = {limit: 1, limit: 2}) { echo(filter: $f) }
response: {"valid":true,"errors":[]}
expected: invalid: InputObjectFieldUniqueness ["limit"]
```

<a id="validate-finding-8"></a>

#### 8. `directivesAreUniquePerLocation`: §5.7.3 Directives Are Unique per Location isn't enforced: accepts documents that break only this rule

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
| Single Root Field (`singleRootField`) | MUST | [§5.2.4.1](https://spec.graphql.org/draft/#sec-Single-Root-Field) | ✗ 22/59 (1 draft only) |
| Field Selections (`fieldSelections`) | MUST | [§5.3.1](https://spec.graphql.org/draft/#sec-Field-Selections) | ✓ 25 |
| Field Selection Merging (`fieldSelectionMerging`) | MUST | [§5.3.2](https://spec.graphql.org/draft/#sec-Field-Selection-Merging) | ✗ 241/674 |
| Leaf Field Selections (`leafFieldSelections`) | MUST | [§5.3.3](https://spec.graphql.org/draft/#sec-Leaf-Field-Selections) | ✗ 3/39 |
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
| Input Object Field Uniqueness (`inputObjectFieldUniqueness`) | MUST | [§5.6.3](https://spec.graphql.org/draft/#sec-Input-Object-Field-Uniqueness) | ✗ 1/6 |
| Input Object Required Fields (`inputObjectRequiredFields`). every document that breaks this rule also breaks §5.6.1 Values of Correct Type, which subsumes it, so a rejection can't be credited to this rule; accepting one fails both | MUST | [§5.6.4](https://spec.graphql.org/draft/#sec-Input-Object-Required-Fields) | ⊂ |
| Directives Are Defined (`directivesAreDefined`) | MUST | [§5.7.1](https://spec.graphql.org/draft/#sec-Directives-Are-Defined) | ✓ 24 |
| Directives Are in Valid Locations (`directivesAreInValidLocations`) | MUST | [§5.7.2](https://spec.graphql.org/draft/#sec-Directives-Are-in-Valid-Locations) | ✓ 27 |
| Directives Are Unique per Location (`directivesAreUniquePerLocation`) | MUST | [§5.7.3](https://spec.graphql.org/draft/#sec-Directives-Are-Unique-per-Location) | ✗ 1/10 |
| Variable Uniqueness (`variableUniqueness`) | MUST | [§5.8.1](https://spec.graphql.org/draft/#sec-Variable-Uniqueness) | ✓ 6 |
| Variables Are Input Types (`variablesAreInputTypes`) | MUST | [§5.8.2](https://spec.graphql.org/draft/#sec-Variables-Are-Input-Types) | – |
| All Variable Uses Defined (`allVariableUsesDefined`) | MUST | [§5.8.3](https://spec.graphql.org/draft/#sec-All-Variable-Uses-Defined) | ✓ 15 |
| All Variables Used (`allVariablesUsed`) | MUST | [§5.8.4](https://spec.graphql.org/draft/#sec-All-Variables-Used) | ✓ 18 |
| All Variable Usages Are Allowed (`allVariableUsagesAreAllowed`) | MUST | [§5.8.5](https://spec.graphql.org/draft/#sec-All-Variable-Usages-Are-Allowed) | ✗ 38/636 (3 draft only) |
| Valid documents are accepted (`acceptsValid`) | MUST | [§5](https://spec.graphql.org/draft/#sec-Validation) | ✗ 25/979 |

- **Basis for `acceptsValid`:** a document is valid when it satisfies every rule of §5, and only invalid requests are kept from execution (§6.1.1); rejecting a valid document applies a rule the spec doesn't have

## Coerce

- **Capabilities:** absent-vs-null, coerce, custom-directives, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 2023 submitted, 2023 distinct, 0 malformed
- **Vectors:** 2023 of 2068 graded (not graded: 26 for missing capabilities, 19 unsupported by the adapter)
- **Draft only:** 0 of the failing vectors (of 45 draft-only vectors) rely on grammar or rules only in the draft
- **Adapter problems:** none
- **Checker self-test:** passed (24144 negative controls)
- **Run:** kit 71f0a24bdc40, 2026-11-15, strict

### Findings

<a id="coerce-finding-1"></a>

#### 1. `int`: rejects what §3.5.1 (Int) accepts

12 cases, in `variable` (12).

- Int accepts only integer input values (MUST, [§3.5.1](https://spec.graphql.org/draft/#sec-Int))

The shortest case, from `variable`:

```
input:    query($x: Int) { int(v: $x) }  variables: {"x": 1.0}
response: {"response":{"errors":[{"message":"Variable $x of type Int was provided invalid value","locations":[{"line":1,"column":7}],"extensions":{"value":1,"problems":[{"path":[],"explanation":"Could not coerce value 1.0 to Int"}]}}]},"calls":[]}
expected: int resolved with {"v":1}
```

<a id="coerce-finding-2"></a>

#### 2. `inputObject`: produces no response where §3.10 (Input Objects) requires a request error

5 cases, in `variable` (5).

- Input objects: an object of defined fields, required fields, variables in fields (MUST, [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects))

The shortest case, from `variable`:

```
problem:  JSON::GeneratorError: Infinity not allowed in JSON
input:    query($x: Point) { point(v: $x) }  variables: {"x": 1e400}
response: "the adapter answered with an error: JSON::GeneratorError: Infinity not allowed in JSON"
expected: a request error
```

<a id="coerce-finding-3"></a>

#### 3. `onlyValidExecuted`: executes an invalid document its validator doesn't reject, though §6.1.1 (Validating Requests) says only valid documents should be executed (the rule it misses is the validate area's)

3 cases, in `nested-variable` (3).

- Only valid documents are executed (SHOULD, [§6.1.1](https://spec.graphql.org/draft/#sec-Validating-Requests) [§5](https://spec.graphql.org/draft/#sec-Validation))

The shortest case, from `nested-variable`:

```
input:    query($x: Int) { matrix(v: [$x, [$x]]) }  variables: {}
response: {"response":{"data":{"matrix":"ok"}},"calls":[{"path":["matrix"],"arguments":{"v":[[null],[null]]}}]}
expected: a request error
```

<a id="coerce-finding-4"></a>

#### 4. `idCoerced`: rejects what §3.5.5 (ID) accepts

2 cases, in `variable` (2).

- String and integer input values are coerced to ID strings (SHOULD, [§3.5.5](https://spec.graphql.org/draft/#sec-ID))

The shortest case, from `variable`:

```
input:    query($x: ID) { id(v: $x) }  variables: {"x": 1.0}
response: {"response":{"errors":[{"message":"Variable $x of type ID was provided invalid value","locations":[{"line":1,"column":7}],"extensions":{"value":1,"problems":[{"path":[],"explanation":"Could not coerce value 1.0 to ID"}]}}]},"calls":[]}
expected: id resolved with {"v":"1"}
```

<a id="coerce-finding-5"></a>

#### 5. `stringValue`: coerces to the wrong value under §2.10.4 (String Value)

2 cases, in `string-value` (2).

- A string literal's escapes and block string indentation decode to its Unicode text (MUST, [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value))

The shortest case, from `string-value`:

```
input:    { string(v: """a \"""b""") }  variables: {}
response: {"response":{"data":{"string":"ok"}},"calls":[{"path":["string"],"arguments":{"v":"a \\\"\"\"b"}}]}
expected: string resolved with {"v":"a \"\"\"b"}
```

<a id="coerce-finding-6"></a>

#### 6. `list`: accepts what §3.11 (List) rejects

1 case, in `nested-variable` (1).

- Lists: each item coerced, a single value wrapped in a list (MUST, [§3.11](https://spec.graphql.org/draft/#sec-List))

The shortest case, from `nested-variable`:

```
input:    query($x: Int = 1) { intsNN(v: [1, $x]) }  variables: {"x": null}
response: {"response":{"data":{"intsNN":"ok"}},"calls":[{"path":["intsNN"],"arguments":{"v":[1,null]}}]}
expected: a field error at intsNN
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
| Int accepts only integer input values (`int`) | MUST | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) | ✗ 12/200 |
| Int rejects integers outside the signed 32-bit range (`intRange`) | SHOULD | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) | ✓ 20 |
| Float accepts integer and float input values, and rejects non-finite values (`float`) | MUST | [§3.5.2](https://spec.graphql.org/draft/#sec-Float) | ✓ 58 |
| Float rejects an integer a double can't hold exactly (`floatPrecision`) | SHOULD | [§3.5.2](https://spec.graphql.org/draft/#sec-Float) | – |
| String accepts only string input values (`string`) | MUST | [§3.5.3](https://spec.graphql.org/draft/#sec-String) | ✓ 52 |
| A string literal's escapes and block string indentation decode to its Unicode text (`stringValue`) | MUST | [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value) | ✗ 2/12 |
| Boolean accepts only boolean input values (`boolean`) | MUST | [§3.5.4](https://spec.graphql.org/draft/#sec-Boolean) | ✓ 50 |
| String and integer input values are coerced to ID strings (`idCoerced`) | SHOULD | [§3.5.5](https://spec.graphql.org/draft/#sec-ID) | ! 2/28 |
| ID rejects input values other than strings and integers (`id`) | MUST | [§3.5.5](https://spec.graphql.org/draft/#sec-ID) | ✓ 31 |
| Enums accept their own values, and reject string literals and unknown values (`enum`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✓ 98 |
| Input objects: an object of defined fields, required fields, variables in fields (`inputObject`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✗ 5/234 |
| An omitted input field gets its default value (`inputFieldDefaults`) | SHOULD | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 56 |
| OneOf input objects take exactly one non-null field (`oneOf`) | MUST | [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 10 |
| Lists: each item coerced, a single value wrapped in a list (`list`) | MUST | [§3.11](https://spec.graphql.org/draft/#sec-List) | ✗ 1/303 |
| Non-Null rejects null (`nonNull`) | MUST | [§3.12](https://spec.graphql.org/draft/#sec-Non-Null) | – |
| CoerceVariableValues: defaults, missing and null values, and failures as request errors (`variables`) | MUST | [§6.1.2](https://spec.graphql.org/draft/#sec-Coercing-Variable-Values) | ✓ 858 |
| CoerceArgumentValues: defaults, missing variables, and failures as field errors (`arguments`) | MUST | [§6.4.1](https://spec.graphql.org/draft/#sec-Coercing-Field-Arguments) | ✓ 33 |
| GetOperation: the operation operationName names, or the only one, else a request error (`getOperation`) | MUST | [§6.1](https://spec.graphql.org/draft/#sec-Executing-Requests) | ✓ 18 |
| A document with known validation errors fails as a request error, without executing (`invalidNotExecuted`) | MUST | [§6.1.1](https://spec.graphql.org/draft/#sec-Validating-Requests) | ✓ 782 |
| Only valid documents are executed (`onlyValidExecuted`) | SHOULD | [§6.1.1](https://spec.graphql.org/draft/#sec-Validating-Requests) [§5](https://spec.graphql.org/draft/#sec-Validation) | ! 3/3 |
| A valid document isn't rejected at validation (`acceptsValid`) | MUST | [§5](https://spec.graphql.org/draft/#sec-Validation) | ✓ 1238 |
| A request error result has no data entry (`requestErrorNoData`) | MUST | [§7.1.3](https://spec.graphql.org/draft/#sec-Request-Error-Result) | ✓ 1567 |
| A request gets a response (`responds`) | MUST | [§7](https://spec.graphql.org/draft/#sec-Response) | ✓ 489 |
| A field error's path is the field's response path (`fieldErrorPath`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) | ✓ 8 |
| Every error is a map with a string message (`errorFormat`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 2023 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 2023 |
| JSON strings with a lone surrogate: kept as sent, replaced with U+FFFD, or refused (`loneSurrogates`) | INFO | — | – |
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

- **Capabilities:** absent-vs-null, coerce, custom-directives, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 168 submitted, 168 distinct, 0 malformed
- **Vectors:** 168 of 172 graded (not graded: 4 unspecified)
- **Draft only:** 13 of the failing vectors (of 36 draft-only vectors) rely on grammar or rules only in the draft
- **Adapter problems:** none
- **Checker self-test:** passed (343 negative controls)
- **Run:** kit 71f0a24bdc40, 2026-11-15, strict

### Findings

<a id="schema-finding-1"></a>

#### 1. `argDefaultCompatible`: ARG_DEFAULT_COMPATIBLE not enforced: accepts a schema that breaks only this rule

4 cases, in `defaults` (4). All rely on grammar or rules that are only in the draft, not in October 2021.

- An object field argument's default value coerces to its type (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects))

The shortest case, from `argDefaultCompatible.1.invalid`:

```
input:    [draft] type Query { f(x: Int = "1"): Int }
response: {"valid":true}
expected: invalid: breaks ARG_DEFAULT_COMPATIBLE and no other rule
```

<a id="schema-finding-2"></a>

#### 2. `implFieldCovariant`: IMPL_FIELD_COVARIANT not enforced: accepts a schema that breaks only this rule

4 cases, in `implementation` (4).

- An implementation's field returns a subtype of the interface field's type (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects))

The shortest case, from `implFieldCovariant.2.invalid`:

```
input:    interface I { f: Int! } type Query implements I { f: Int }
response: {"valid":true}
expected: invalid: breaks IMPL_FIELD_COVARIANT and no other rule
```

<a id="schema-finding-3"></a>

#### 3. `inputObjectUnbreakableCycle`: INPUT_OBJECT_UNBREAKABLE_CYCLE not enforced: accepts a schema that breaks only this rule

4 cases, in `input` (4). 2 of them rely on grammar or rules that are only in the draft, not in October 2021.

- An input object can be given a finite value (MUST, [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects))

The shortest case, from `inputObjectUnbreakableCycle.5.invalid`:

```
input:    [draft] input A @oneOf { b: B } input B @oneOf { a: A } type Query { f(a: A): Int }
response: {"valid":true}
expected: invalid: breaks INPUT_OBJECT_UNBREAKABLE_CYCLE and no other rule
```

<a id="schema-finding-4"></a>

#### 4. `inputObjectDefaultValueCycle`: INPUT_OBJECT_DEFAULT_VALUE_CYCLE not enforced: accepts a schema that breaks only this rule

4 cases, in `input` (4). All rely on grammar or rules that are only in the draft, not in October 2021.

- Input object default values don't form a cycle (MUST, [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects))

The shortest case, from `inputObjectDefaultValueCycle.1.invalid`:

```
input:    [draft] input I { i: I = {} } type Query { f(i: I): Int }
response: {"valid":true}
expected: invalid: breaks INPUT_OBJECT_DEFAULT_VALUE_CYCLE and no other rule
```

<a id="schema-finding-5"></a>

#### 5. `rootTypesAreObjects`: ROOT_TYPES_ARE_OBJECTS not enforced: accepts a schema that breaks only this rule

2 cases, in `root` (2).

- Root operation types are object types (MUST, [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types))

The shortest case, from `rootTypesAreObjects.1.invalid`:

```
input:    interface Query { a: Int }
response: {"valid":true,"note":"graphql-ruby asked resolve_type for the root value"}
expected: invalid: breaks ROOT_TYPES_ARE_OBJECTS and no other rule
```

<a id="schema-finding-6"></a>

#### 6. `rootTypesDifferent`: ROOT_TYPES_DIFFERENT not enforced: accepts a schema that breaks only this rule

2 cases, in `root` (2).

- Root operation types are all different (MUST, [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types))

The shortest case, from `rootTypesDifferent.2.invalid`:

```
input:    schema { query: Q subscription: Q } type Q { a: Int } type S { a: Int }
response: {"valid":true}
expected: invalid: breaks ROOT_TYPES_DIFFERENT and no other rule
```

<a id="schema-finding-7"></a>

#### 7. `fieldOutputType`: FIELD_OUTPUT_TYPE not enforced: accepts a schema that breaks only this rule

2 cases, in `typeUse` (2).

- Fields return output types (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types))

The shortest case, from `fieldOutputType.1.invalid`:

```
input:    input In { x: Int } type O { x: Int } type Query { a: In }
response: {"valid":true}
expected: invalid: breaks FIELD_OUTPUT_TYPE and no other rule
```

<a id="schema-finding-8"></a>

#### 8. `argNameReserved`: ARG_NAME_RESERVED not enforced: accepts a schema that breaks only this rule

2 cases, in `names` (2).

- No argument name begins with __ (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `argNameReserved.1.invalid`:

```
input:    type Query { f(__x: Int): Int }
response: {"valid":true}
expected: invalid: breaks ARG_NAME_RESERVED and no other rule
```

<a id="schema-finding-9"></a>

#### 9. `acceptsValid`: rejects 2 valid schemas with the same error, one edit from schemas that break requiredArgNotDeprecated or requiredInputFieldNotDeprecated: one cause, which the pairs don't pin on any one rule; the message says what the implementation checked; all rely on the draft

2 cases, in `typeUse` (1), `input` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

Each rejected document is one edit from a document that breaks only `requiredArgNotDeprecated` or `requiredInputFieldNotDeprecated`; which rule the implementation applied is a guess.

- Valid schemas are accepted (MUST, [§3](https://spec.graphql.org/draft/#sec-Type-System))

The shortest case, from `requiredArgNotDeprecated.2.valid`:

```
problem:  ArgumentError: Required arguments cannot be deprecated: Query.f.oldArg.
input:    [draft] type Query { f(oldArg: String! = "s" @deprecated): Int }
response: {"valid":false,"errors":["ArgumentError: Required arguments cannot be deprecated: Query.f.oldArg."]}
expected: valid (TypeSystem!Verdict is empty)
```

<a id="schema-finding-10"></a>

#### 10. `implementsItself`: IMPLEMENTS_ITSELF: crashes on a schema that breaks only this rule, instead of rejecting it

2 cases, in `implementation` (2).

- An interface doesn't implement itself (MUST, [§3.7](https://spec.graphql.org/draft/#sec-Interfaces))

The shortest case, from `implementsItself.1.invalid`:

```
problem:  ArgumentError: cyclic include detected
input:    interface A implements A { x: Int } type Query { a: A }
response: "the adapter answered with an error: ArgumentError: cyclic include detected"
expected: invalid: breaks IMPLEMENTS_ITSELF and no other rule
```

<a id="schema-finding-11"></a>

#### 11. `implArgInvariant`: IMPL_ARG_INVARIANT not enforced: accepts a schema that breaks only this rule

2 cases, in `implementation` (2).

- An implementation's field arguments have the interface's argument types (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects))

The shortest case, from `implArgInvariant.1.invalid`:

```
input:    interface I { f(a: Int): Int } type Query implements I { f(a: Int!): Int }
response: {"valid":true}
expected: invalid: breaks IMPL_ARG_INVARIANT and no other rule
```

<a id="schema-finding-12"></a>

#### 12. `typeNamesUnique`: TYPE_NAMES_UNIQUE not enforced: accepts a schema that breaks only this rule

1 case, in `names` (1).

- No two types have the same name (MUST, [§3.3](https://spec.graphql.org/draft/#sec-Schema))

The shortest case, from `typeNamesUnique.1.invalid`:

```
input:    scalar A scalar A type Query { a: A }
response: {"valid":true}
expected: invalid: breaks TYPE_NAMES_UNIQUE and no other rule
```

<a id="schema-finding-13"></a>

#### 13. `typeNameNotBuiltin`: TYPE_NAME_NOT_BUILTIN not enforced: accepts a schema that breaks only this rule

1 case, in `names` (1).

- No type is named like a built-in type (MUST, [§3.3](https://spec.graphql.org/draft/#sec-Schema))

The shortest case, from `typeNameNotBuiltin.2.invalid`:

```
input:    type Int { a: String } type Query { a: String }
response: {"valid":true}
expected: invalid: breaks TYPE_NAME_NOT_BUILTIN and no other rule
```

<a id="schema-finding-14"></a>

#### 14. `typeNameReserved`: TYPE_NAME_RESERVED not enforced: accepts a schema that breaks only this rule

1 case, in `names` (1).

- No type name begins with __ (MUST, [§3.3](https://spec.graphql.org/draft/#sec-Schema))

The shortest case, from `typeNameReserved.1.invalid`:

```
input:    type __T { a: Int } type Query { t: __T }
response: {"valid":true}
expected: invalid: breaks TYPE_NAME_RESERVED and no other rule
```

<a id="schema-finding-15"></a>

#### 15. `directiveNamesUnique`: DIRECTIVE_NAMES_UNIQUE not enforced: accepts a schema that breaks only this rule

1 case, in `names` (1).

- No two directives have the same name (MUST, [§3.3](https://spec.graphql.org/draft/#sec-Schema))

The shortest case, from `directiveNamesUnique.1.invalid`:

```
input:    directive @d on FIELD directive @d on FIELD type Query { a: Int }
response: {"valid":true}
expected: invalid: breaks DIRECTIVE_NAMES_UNIQUE and no other rule
```

<a id="schema-finding-16"></a>

#### 16. `directiveNameReserved`: DIRECTIVE_NAME_RESERVED not enforced: accepts a schema that breaks only this rule

1 case, in `names` (1).

- No directive name begins with __ (MUST, [§3.3](https://spec.graphql.org/draft/#sec-Schema))

The shortest case, from `directiveNameReserved.1.invalid`:

```
input:    directive @__d on FIELD type Query { a: Int }
response: {"valid":true}
expected: invalid: breaks DIRECTIVE_NAME_RESERVED and no other rule
```

<a id="schema-finding-17"></a>

#### 17. `fieldsDefined`: FIELDS_DEFINED not enforced: accepts a schema that breaks only this rule

1 case, in `typeUse` (1).

- An object or interface type defines one or more fields (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces))

The shortest case, from `fieldsDefined.1.invalid`:

```
input:    type Query { a: Int } type Empty
response: {"valid":true}
expected: invalid: breaks FIELDS_DEFINED and no other rule
```

<a id="schema-finding-18"></a>

#### 18. `fieldNamesUnique`: FIELD_NAMES_UNIQUE not enforced: accepts a schema that breaks only this rule

1 case, in `names` (1).

- Field names are unique within a type (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces))

The shortest case, from `fieldNamesUnique.2.invalid`:

```
input:    type Query { a: I } interface I { x: Int x: String }
response: {"valid":true}
expected: invalid: breaks FIELD_NAMES_UNIQUE and no other rule
```

<a id="schema-finding-19"></a>

#### 19. `fieldNameReserved`: FIELD_NAME_RESERVED not enforced: accepts a schema that breaks only this rule

1 case, in `names` (1).

- No field name begins with __ (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces))

The shortest case, from `fieldNameReserved.1.invalid`:

```
input:    type Query { __a: Int }
response: {"valid":true}
expected: invalid: breaks FIELD_NAME_RESERVED and no other rule
```

<a id="schema-finding-20"></a>

#### 20. `implementsUnique`: IMPLEMENTS_UNIQUE not enforced: accepts a schema that breaks only this rule

1 case, in `implementation` (1).

- A type implements each interface once (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces))

The shortest case, from `implementsUnique.1.invalid`:

```
input:    interface I { a: Int } type Query implements I & I { a: Int }
response: {"valid":true}
expected: invalid: breaks IMPLEMENTS_UNIQUE and no other rule
```

<a id="schema-finding-21"></a>

#### 21. `implFieldProvided`: IMPL_FIELD_PROVIDED not enforced: accepts a schema that breaks only this rule

1 case, in `implementation` (1).

- An implementation has every field of the interface (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects))

The shortest case, from `implFieldProvided.1.invalid`:

```
input:    interface I { f: Int } type Query implements I { g: Int }
response: {"valid":true}
expected: invalid: breaks IMPL_FIELD_PROVIDED and no other rule
```

<a id="schema-finding-22"></a>

#### 22. `implArgProvided`: IMPL_ARG_PROVIDED not enforced: accepts a schema that breaks only this rule

1 case, in `implementation` (1).

- An implementation's field has every argument of the interface field (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects))

The shortest case, from `implArgProvided.1.invalid`:

```
input:    interface I { f(a: Int): Int } type Query implements I { f: Int }
response: {"valid":true}
expected: invalid: breaks IMPL_ARG_PROVIDED and no other rule
```

<a id="schema-finding-23"></a>

#### 23. `implExtraArgOptional`: IMPL_EXTRA_ARG_OPTIONAL not enforced: accepts a schema that breaks only this rule

1 case, in `implementation` (1).

- An implementation's additional arguments aren't required (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects))

The shortest case, from `implExtraArgOptional.1.invalid`:

```
input:    interface I { f: Int } type Query implements I { f(b: Int!): Int }
response: {"valid":true}
expected: invalid: breaks IMPL_EXTRA_ARG_OPTIONAL and no other rule
```

<a id="schema-finding-24"></a>

#### 24. `implDeprecation`: IMPL_DEPRECATION not enforced: accepts a schema that breaks only this rule

1 case, in `implementation` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- A deprecated implementation field implements a deprecated field (MUST, [§3.6](https://spec.graphql.org/draft/#sec-Objects))

The shortest case, from `implDeprecation.1.invalid`:

```
input:    [draft] interface I { f: Int } type Query implements I { f: Int @deprecated }
response: {"valid":true}
expected: invalid: breaks IMPL_DEPRECATION and no other rule
```

<a id="schema-finding-25"></a>

#### 25. `unionMembersDefined`: UNION_MEMBERS_DEFINED not enforced: accepts a schema that breaks only this rule

1 case, in `union` (1).

- A union has one or more member types (MUST, [§3.8](https://spec.graphql.org/draft/#sec-Unions))

The shortest case, from `unionMembersDefined.1.invalid`:

```
input:    union U type Query { u: U }
response: {"valid":true}
expected: invalid: breaks UNION_MEMBERS_DEFINED and no other rule
```

<a id="schema-finding-26"></a>

#### 26. `unionMembersUnique`: UNION_MEMBERS_UNIQUE not enforced: accepts a schema that breaks only this rule

1 case, in `union` (1).

- A union's member types are unique (MUST, [§3.8](https://spec.graphql.org/draft/#sec-Unions))

The shortest case, from `unionMembersUnique.1.invalid`:

```
input:    union U = Query | Query type Query { u: U }
response: {"valid":true}
expected: invalid: breaks UNION_MEMBERS_UNIQUE and no other rule
```

<a id="schema-finding-27"></a>

#### 27. `enumValueNameReserved`: ENUM_VALUE_NAME_RESERVED not enforced: accepts a schema that breaks only this rule

1 case, in `enum` (1).

- No enum value begins with __ (MUST, [§4](https://spec.graphql.org/draft/#sec-Introspection))

The shortest case, from `enumValueNameReserved.1.invalid`:

```
input:    enum E { __A } type Query { e: E }
response: {"valid":true}
expected: invalid: breaks ENUM_VALUE_NAME_RESERVED and no other rule
```

<a id="schema-finding-28"></a>

#### 28. `inputFieldsDefined`: INPUT_FIELDS_DEFINED not enforced: accepts a schema that breaks only this rule

1 case, in `input` (1).

- An input object has one or more fields (MUST, [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects))

The shortest case, from `inputFieldsDefined.1.invalid`:

```
input:    input In type Query { f(i: In): Int }
response: {"valid":true}
expected: invalid: breaks INPUT_FIELDS_DEFINED and no other rule
```

<a id="schema-finding-29"></a>

#### 29. `inputFieldNameReserved`: INPUT_FIELD_NAME_RESERVED not enforced: accepts a schema that breaks only this rule

1 case, in `input` (1).

- No input field name begins with __ (MUST, [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects))

The shortest case, from `inputFieldNameReserved.1.invalid`:

```
input:    input In { __x: Int } type Query { f(i: In): Int }
response: {"valid":true}
expected: invalid: breaks INPUT_FIELD_NAME_RESERVED and no other rule
```

<a id="schema-finding-30"></a>

#### 30. `directiveUsesItself`: DIRECTIVE_USES_ITSELF not enforced: accepts a schema that breaks only this rule

1 case, in `directive` (1).

- A directive definition doesn't use itself (MUST, [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `directiveUsesItself.2.invalid`:

```
input:    directive @d(arg: String @d) on ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION type Query { a: Int }
response: {"valid":true}
expected: invalid: breaks DIRECTIVE_USES_ITSELF and no other rule
```

<a id="schema-finding-31"></a>

#### 31. `acceptsValid`: rejects a valid schema, one edit from a schema that breaks only directiveReferencesItselfIndirectly; which rule it applied is a guess: the message says what the implementation checked

1 case, in `directive` (1).

Each rejected document is one edit from a document that breaks only `directiveReferencesItselfIndirectly`; which rule the implementation applied is a guess.

- Valid schemas are accepted (MUST, [§3](https://spec.graphql.org/draft/#sec-Type-System))

The shortest case, from `directiveReferencesItselfIndirectly.2.valid`:

```
problem:  ArgumentError: Directive `@e` can't be attached to a because INPUT_FIELD_DEFINITION isn't included in its locations (ARGUMENT_DEFINITION).
input:    directive @d(a: Int @e) on ARGUMENT_DEFINITION directive @e(b: Int) on ARGUMENT_DEFINITION type Query { a: Int }
response: {"valid":false,"errors":["ArgumentError: Directive `@e` can't be attached to a because INPUT_FIELD_DEFINITION isn't included in its locations (ARGUMENT_DEFINITION)."]}
expected: valid (TypeSystem!Verdict is empty)
```

<a id="schema-finding-32"></a>

#### 32. `directiveReferencesItselfIndirectly`: DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY not enforced: accepts a schema that breaks only this rule

1 case, in `directive` (1).

- A directive definition doesn't reference itself through a type or directive (MUST, [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `directiveReferencesItselfIndirectly.4.invalid`:

```
input:    directive @d(a: Int @e) on ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION directive @e(b: Int @d) on ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION type Query { a: Int }
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
| No two types have the same name (`typeNamesUnique`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✗ 1/1 |
| No type is named like a built-in type (`typeNameNotBuiltin`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✗ 1/1 |
| No type name begins with __ (`typeNameReserved`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✗ 1/1 |
| No two directives have the same name (`directiveNamesUnique`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✗ 1/1 |
| No directive name begins with __ (`directiveNameReserved`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✗ 1/1 |
| The query root operation type is provided (`queryRootProvided`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✓ 2 |
| Root operation types are object types (`rootTypesAreObjects`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✗ 2/2 |
| Root operation types are all different (`rootTypesDifferent`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✗ 2/2 |
| An object or interface type defines one or more fields (`fieldsDefined`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✗ 1/2 |
| Field names are unique within a type (`fieldNamesUnique`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✗ 1/2 |
| No field name begins with __ (`fieldNameReserved`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✗ 1/1 |
| Fields return output types (`fieldOutputType`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✗ 2/2 |
| No argument name begins with __ (`argNameReserved`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 2/2 |
| Argument names are unique within a field or directive (`argNamesUnique`). Draft only: the October 2021 edition doesn't have argument name uniqueness | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 2 |
| Arguments accept input types (`argInputType`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✓ 3 |
| A required argument isn't deprecated (`requiredArgNotDeprecated`). Draft only: the October 2021 edition doesn't have deprecated arguments | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✓ 3 |
| An object field argument's default value coerces to its type (`argDefaultCompatible`). Draft only: the October 2021 edition doesn't have default value validation | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 4/10 (all draft only) |
| A type implements each interface once (`implementsUnique`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✗ 1/1 |
| A type implements only interface types (`implementsInterfaces`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 1 |
| An interface doesn't implement itself (`implementsItself`) | MUST | [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✗ 2/2 |
| A type also implements the interfaces its interfaces implement (`implTransitive`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 2 |
| An implementation has every field of the interface (`implFieldProvided`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 1/1 |
| An implementation's field has every argument of the interface field (`implArgProvided`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 1/1 |
| An implementation's field arguments have the interface's argument types (`implArgInvariant`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 2/2 |
| An implementation's additional arguments aren't required (`implExtraArgOptional`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 1/1 |
| An implementation's field returns a subtype of the interface field's type (`implFieldCovariant`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 4/4 |
| A deprecated implementation field implements a deprecated field (`implDeprecation`). Draft only: the October 2021 edition doesn't have deprecation of implementing fields | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 1/1 (all draft only) |
| A union has one or more member types (`unionMembersDefined`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✗ 1/1 |
| A union's member types are unique (`unionMembersUnique`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✗ 1/1 |
| A union's member types are object types (`unionMembersObjects`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✓ 3 |
| An enum has one or more values (`enumValuesDefined`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✓ 1 |
| An enum's values are unique (`enumValuesUnique`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✓ 1 |
| No enum value begins with __ (`enumValueNameReserved`) | MUST | [§4](https://spec.graphql.org/draft/#sec-Introspection) | ✗ 1/1 |
| An input object has one or more fields (`inputFieldsDefined`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✗ 1/1 |
| Input field names are unique within an input object (`inputFieldNamesUnique`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 1 |
| No input field name begins with __ (`inputFieldNameReserved`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✗ 1/1 |
| Input fields accept input types (`inputFieldInputType`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✓ 1 |
| A required input field isn't deprecated (`requiredInputFieldNotDeprecated`). Draft only: the October 2021 edition doesn't have deprecated input fields | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✓ 1 |
| A OneOf input object's fields are nullable (`oneOfFieldNullable`). Draft only: the October 2021 edition doesn't have OneOf input objects | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 1 |
| A OneOf input object's fields have no default value (`oneOfFieldNoDefault`). Draft only: the October 2021 edition doesn't have OneOf input objects | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 1 |
| An input object can be given a finite value (`inputObjectUnbreakableCycle`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✗ 4/4 (2 draft only) |
| Input object default values don't form a cycle (`inputObjectDefaultValueCycle`). Draft only: the October 2021 edition doesn't have default value validation | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✗ 4/4 (all draft only) |
| A directive has one or more locations (`directiveLocationsDefined`). SDL can't write a directive without locations, so no vector breaks this rule | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | – |
| A directive definition doesn't use itself (`directiveUsesItself`) | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 1/2 |
| A directive definition doesn't reference itself through a type or directive (`directiveReferencesItselfIndirectly`) | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 1/2 |
| Valid schemas are accepted (`acceptsValid`) | MUST | [§3](https://spec.graphql.org/draft/#sec-Type-System) | ✗ 3/87 (2 draft only) |

- **Basis for `acceptsValid`:** a schema is invalid only when it breaks a Type Validation rule of §3 or §4's Reserved Names; rejecting, or crashing on, a schema that breaks none applies a rule the spec doesn't have

## Introspect

- **Capabilities:** absent-vs-null, coerce, custom-directives, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate
- **Cases:** 39 submitted, 39 distinct, 0 malformed
- **Vectors:** 39 of 39 graded
- **Profile:** the draft's introspection types. The draft's introspection query was rejected ("Field 'directives' doesn't accept argument 'includeDeprecated'"). The introspection types lack __Directive.isDeprecated, __Directive.deprecationReason and __Schema.directives(includeDeprecated:), so this run asks the draft's query without them, grades against the draft, and counts what they lack once, under builtinDefinitions.
- **Adapter problems:** none
- **Checker self-test:** passed (176 negative controls)
- **Run:** kit 71f0a24bdc40, 2026-11-15, strict

### Findings

<a id="introspect-finding-1"></a>

#### 1. `typeKinds`: a type's isOneOf is null for an input object, or not null for another kind (draft only)

4 cases, in `deprecation` (2), `inputDeprecation` (2). All rely on grammar or rules that are only in the draft, not in October 2021.

- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))

The shortest case, from `deprecation.lookup`:

```
problem:  isOneOfNull at E, isOneOfNull at Old, isOneOfNull at Query
input:    type Query { a: Int @deprecated, b(y: Int): Int @deprecated(reason: "Use c"), c: E, old: Old } type Old { x: Int @deprecated(reason: "All of it") } enum E { A B @deprecated(reason: "Gone") }  (__type(name:) for Query, Old, E, Unknown; includeDeprecated: true)
response: {"__type(name: \"E\")":{"kind":"ENUM","name":"E","description":null,"specifiedByURL":null,"isOneOf":false,"fields":null,"inputFields":null,"interfaces":null,"enumValues":[{"name":"A","description":null,"isDeprecated":false,"deprecationReason":null},{"name":"B","description":null,"isDeprecated":true,"deprecationReason":"Gone"}],"possibleTypes":null}}
expected: [object Object]
```

<a id="introspect-finding-2"></a>

#### 2. `builtinAdditions`, `builtinDefinitions`, `builtinNullability`, `typeKinds`: a type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in @deprecated isn't as the spec defines it (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in Boolean's isOneOf is null for an input object, or not null for another kind (draft only); the built-in Int's isOneOf is null for an input object, or not null for another kind (draft only); the built-in String's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive has a field the spec doesn't define; the built-in __Directive's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Directive.isRepeatable has the spec's type, but not its Non-Null wrapping; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __DirectiveLocation's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __EnumValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __InputValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Schema's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.inputFields(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Type.isOneOf has the spec's type, but not its Non-Null wrapping; October 2021 doesn't define it; the built-in __TypeKind's isOneOf is null for an input object, or not null for another kind (draft only)

3 cases, in `minimal` (1), `deprecation` (1), `inputDeprecation` (1). 1 of them rely on grammar or rules that are only in the draft, not in October 2021.

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- The fields of the introspection types have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))

The shortest case, from `minimal.inc`:

```
problem:  added:fields at __Directive, arguments at @deprecated(reason:), arguments at __Directive.args(includeDeprecated:), arguments at __Field.args(includeDeprecated:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), arguments at __Type.inputFields(includeDeprecated:), directives at @deprecated, enumValues at __DirectiveLocation, isOneOfNull at Boolean, isOneOfNull at Int, isOneOfNull at Query, isOneOfNull at String, isOneOfNull at __Directive, isOneOfNull at __DirectiveLocation, isOneOfNull at __EnumValue, isOneOfNull at __Field, isOneOfNull at __InputValue, isOneOfNull at __Schema, isOneOfNull at __Type, isOneOfNull at __TypeKind, nullability at __Directive.isRepeatable, nullability at __Type.isOneOf
input:    type Query { a: Int }  (the introspection query; includeDeprecated: true)
response: {"kind":"SCALAR","name":"Int","description":"Represents non-fractional signed whole numeric values. Int can represent values between -(2^31) and 2^31 - 1.","specifiedByURL":null,"isOneOf":false,"fields":null,"inputFields":null,"interfaces":null,"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-3"></a>

#### 3. `builtinDefinitions`, `builtinNullability`, `typeKinds`: a type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in @deprecated isn't as the spec defines it (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in Boolean's isOneOf is null for an input object, or not null for another kind (draft only); the built-in Int's isOneOf is null for an input object, or not null for another kind (draft only); the built-in String's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Directive.isRepeatable has the spec's type, but not its Non-Null wrapping; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __DirectiveLocation's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __EnumValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __InputValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Schema's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.inputFields(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Type.isOneOf has the spec's type, but not its Non-Null wrapping; October 2021 doesn't define it; the built-in __TypeKind's isOneOf is null for an input object, or not null for another kind (draft only)

3 cases, in `minimal` (1), `deprecation` (1), `inputDeprecation` (1). 1 of them rely on grammar or rules that are only in the draft, not in October 2021.

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- The fields of the introspection types have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))

The shortest case, from `minimal.defaults`:

```
problem:  arguments at @deprecated(reason:), arguments at __Directive.args(includeDeprecated:), arguments at __Field.args(includeDeprecated:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), arguments at __Type.inputFields(includeDeprecated:), directives at @deprecated, enumValues at __DirectiveLocation, isOneOfNull at Boolean, isOneOfNull at Int, isOneOfNull at Query, isOneOfNull at String, isOneOfNull at __Directive, isOneOfNull at __DirectiveLocation, isOneOfNull at __EnumValue, isOneOfNull at __Field, isOneOfNull at __InputValue, isOneOfNull at __Schema, isOneOfNull at __Type, isOneOfNull at __TypeKind, nullability at __Directive.isRepeatable, nullability at __Type.isOneOf
input:    type Query { a: Int }  (the introspection query; includeDeprecated: the default)
response: {"kind":"SCALAR","name":"Int","description":"Represents non-fractional signed whole numeric values. Int can represent values between -(2^31) and 2^31 - 1.","specifiedByURL":null,"isOneOf":false,"fields":null,"inputFields":null,"interfaces":null,"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-4"></a>

#### 4. `executes`: crashes: the adapter answered with an error

3 cases, in `defaults` (3).

- The query executes, and its result has exactly the fields it selects, nulls included (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))

The shortest case, from `defaults.inc`:

```
problem:  NoMethodError: undefined method 'map' for an instance of Integer
input:    enum E { X Y } input I { a: Int = 1, b: Int, c: [Int] = 1, e: E = Y, f: Float = 2 } type Query { f(x: [Int] = 1, y: Float = 1, z: ID = 7, w: [[Int]] = [1, 2], i: I = {b: 2}, s: String = "say \"hi\"", n: Int = null, l: [E!] = [X, Y]): Int }  (the introspection query; includeDeprecated: true)
response: "the adapter answered with an error: NoMethodError: undefined method 'map' for an instance of Integer"
expected: a well-formed execution result with exactly the fields the query selects, and no errors
```

<a id="introspect-finding-5"></a>

#### 5. `order`, `typeKinds`: a type's isOneOf is null for an input object, or not null for another kind (draft only); fields, arguments, enum values, directives, members and interfaces come in source order: differs from Introspection.tla

3 cases, in `rich` (1), `interfaces` (1), `order` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- Fields, arguments, enum values, directives, members and interfaces come in source order (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))

The shortest case, from `rich.lookup`:

```
problem:  isOneOfNull at Date, isOneOfNull at E, isOneOfNull at Q, isOneOfNull at U, order at Q, order at U
input:    """The schema""" schema { query: Q mutation: M } "The root" type Q { a("An argument" x: Int = 3, y: [Int] = 1, z: In = {b: 2}): U, old: String @deprecated(reason: "gone"), d: Date } type M { m(p: Pick!): Boolean } type A { a: Int } type B { b: Int } union U = B | A enum E { X "Why" Y @deprecated } input In { a: Int = 1, b: Int, e: E = Y, old: String } input Pick { id: ID, name: String } scalar Date "Labels a field" directive @label(v: String, w: Int = 2) repeatable on FIELD_DEFINITION | QUERY  (__type(name:) for Q, E, In, Pick, Date, U, Unknown; includeDeprecated: true)
response: {"__type(name: \"E\")":{"kind":"ENUM","name":"E","description":null,"specifiedByURL":null,"isOneOf":false,"fields":null,"inputFields":null,"interfaces":null,"enumValues":[{"name":"X","description":null,"isDeprecated":false,"deprecationReason":null},{"name":"Y","description":"Why","isDeprecated":true,"deprecationReason":"No longer supported"}],"possibleTypes":null}}
expected: [object Object]
```

<a id="introspect-finding-6"></a>

#### 6. `builtinDefinitions`: the introspection types lack __Directive.isDeprecated, __Directive.deprecationReason and __Schema.directives(includeDeprecated:), so the kit leaves them out of every query, and grades what it can see without them

1 case, in `discovery` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))

The shortest case, from `discovery`:

```
problem:  __Directive.isDeprecated, __Directive.deprecationReason, __Schema.directives(includeDeprecated:)
input:    the fields of each introspection type, with their arguments (the kit's IntrospectionFields query)
response: {"data":{"a":{"fields":[{"name":"description","args":[]},{"name":"directives","args":[]},{"name":"mutationType","args":[]},{"name":"queryType","args":[]},{"name":"subscriptionType","args":[]},{"name":"types","args":[]}]},"b":{"fields":[{"name":"description","args":[]},{"name":"enumValues","args":[{"name":"includeDeprecated"}]},{"name":"fields","args":[{"name":"includeDeprecated"}]},{"name":"inputFields","args":[{"name":"includeDeprecated"}]},{"name":"interfaces","args":[]},{"name":"isOneOf","args":[]},{"name":"kind","args":[]},{"name":"name","args":[]},{"name":"ofType","args":[]},{"name":"possibleTypes","args":[]},{"name":"specifiedByURL","args":[]}]},"c":{"fields":[{"name":"args","args":[{"name":"includeDeprecated"}]},{"name":"deprecationReason","args":[]},{"name":"description","args":[]},{"name":"isDeprecated","args":[]},{"name":"name","args":[]},{"name":"type","args":[]}]},"d":{"fields":[{"name":"defaultValue","args":[]},{"name":"deprecationReason","args":[]},{"name":"description","args":[]},{"name":"isDeprecated","args":[]},{"name":"name","args":[]},{"name":"type","args":[]}]},"e":{"fields":[{"name":"deprecationReason","args":[]},{"name":"description","args":[]},{"name":"isDeprecated","args":[]},{"name":"name","args":[]}]},"f":{"fields":[{"name":"args","args":[{"name":"includeDeprecated"}]},{"name":"description","args":[]},{"name":"isRepeatable","args":[]},{"name":"locations","args":[]},{"name":"name","args":[]}]}}}
expected: the fields and arguments the spec defines, including __Directive.isDeprecated, __Directive.deprecationReason and __Schema.directives(includeDeprecated:)
```

<a id="introspect-finding-7"></a>

#### 7. `builtinAdditions`, `builtinDefinitions`, `builtinNullability`, `descriptions`, `order`, `typeKinds`: a description the document gives is returned as it is, the schema's included: differs from Introspection.tla; a type's isOneOf is null for an input object, or not null for another kind (draft only); fields, arguments, enum values, directives, members and interfaces come in source order: differs from Introspection.tla; the built-in @deprecated isn't as the spec defines it (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in Boolean's isOneOf is null for an input object, or not null for another kind (draft only); the built-in ID's isOneOf is null for an input object, or not null for another kind (draft only); the built-in Int's isOneOf is null for an input object, or not null for another kind (draft only); the built-in String's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive has a field the spec doesn't define; the built-in __Directive's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Directive.isRepeatable has the spec's type, but not its Non-Null wrapping; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __DirectiveLocation's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __EnumValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __InputValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Schema's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.inputFields(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Type.isOneOf has the spec's type, but not its Non-Null wrapping; October 2021 doesn't define it; the built-in __TypeKind's isOneOf is null for an input object, or not null for another kind (draft only)

1 case, in `rich` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- The fields of the introspection types have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- A description the document gives is returned as it is, the schema's included (SHOULD, [§3.2](https://spec.graphql.org/draft/#sec-Type-System-Descriptions) [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Fields, arguments, enum values, directives, members and interfaces come in source order (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))

The shortest case, from `rich.inc`:

```
problem:  added:fields at __Directive, arguments at @deprecated(reason:), arguments at __Directive.args(includeDeprecated:), arguments at __Field.args(includeDeprecated:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), arguments at __Type.inputFields(includeDeprecated:), description at schema, directives at @deprecated, enumValues at __DirectiveLocation, isOneOfNull at A, isOneOfNull at B, isOneOfNull at Boolean, isOneOfNull at Date, isOneOfNull at E, isOneOfNull at ID, isOneOfNull at Int, isOneOfNull at M, isOneOfNull at Q, isOneOfNull at String, isOneOfNull at U, isOneOfNull at __Directive, isOneOfNull at __DirectiveLocation, isOneOfNull at __EnumValue, isOneOfNull at __Field, isOneOfNull at __InputValue, isOneOfNull at __Schema, isOneOfNull at __Type, isOneOfNull at __TypeKind, nullability at __Directive.isRepeatable, nullability at __Type.isOneOf, order at Q, order at U
input:    """The schema""" schema { query: Q mutation: M } "The root" type Q { a("An argument" x: Int = 3, y: [Int] = 1, z: In = {b: 2}): U, old: String @deprecated(reason: "gone"), d: Date } type M { m(p: Pick!): Boolean } type A { a: Int } type B { b: Int } union U = B | A enum E { X "Why" Y @deprecated } input In { a: Int = 1, b: Int, e: E = Y, old: String } input Pick { id: ID, name: String } scalar Date "Labels a field" directive @label(v: String, w: Int = 2) repeatable on FIELD_DEFINITION | QUERY  (the introspection query; includeDeprecated: true)
response: {"__typename":"Q","description":null,"queryType":{"kind":"OBJECT","name":"Q"},"mutationType":{"kind":"OBJECT","name":"M"},"subscriptionType":null,"types":["A","B","Boolean","Date","E","ID","In","Int","M","Pick","Q","String","U","__Directive","__DirectiveLocation","__EnumValue","__Field","__InputValue","__Schema","__Type","__TypeKind"],"directives":["deprecated","include","label","oneOf","skip","specifiedBy"]}
expected: [object Object]
```

<a id="introspect-finding-8"></a>

#### 8. `builtinDefinitions`, `builtinNullability`, `descriptions`, `order`, `typeKinds`: a description the document gives is returned as it is, the schema's included: differs from Introspection.tla; a type's isOneOf is null for an input object, or not null for another kind (draft only); fields, arguments, enum values, directives, members and interfaces come in source order: differs from Introspection.tla; the built-in @deprecated isn't as the spec defines it (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in Boolean's isOneOf is null for an input object, or not null for another kind (draft only); the built-in ID's isOneOf is null for an input object, or not null for another kind (draft only); the built-in Int's isOneOf is null for an input object, or not null for another kind (draft only); the built-in String's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Directive.isRepeatable has the spec's type, but not its Non-Null wrapping; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __DirectiveLocation's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __EnumValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __InputValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Schema's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.inputFields(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Type.isOneOf has the spec's type, but not its Non-Null wrapping; October 2021 doesn't define it; the built-in __TypeKind's isOneOf is null for an input object, or not null for another kind (draft only)

1 case, in `rich` (1).

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- The fields of the introspection types have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- A description the document gives is returned as it is, the schema's included (SHOULD, [§3.2](https://spec.graphql.org/draft/#sec-Type-System-Descriptions) [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Fields, arguments, enum values, directives, members and interfaces come in source order (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))

The shortest case, from `rich.defaults`:

```
problem:  arguments at @deprecated(reason:), arguments at __Directive.args(includeDeprecated:), arguments at __Field.args(includeDeprecated:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), arguments at __Type.inputFields(includeDeprecated:), description at schema, directives at @deprecated, enumValues at __DirectiveLocation, isOneOfNull at A, isOneOfNull at B, isOneOfNull at Boolean, isOneOfNull at Date, isOneOfNull at E, isOneOfNull at ID, isOneOfNull at Int, isOneOfNull at M, isOneOfNull at Q, isOneOfNull at String, isOneOfNull at U, isOneOfNull at __Directive, isOneOfNull at __DirectiveLocation, isOneOfNull at __EnumValue, isOneOfNull at __Field, isOneOfNull at __InputValue, isOneOfNull at __Schema, isOneOfNull at __Type, isOneOfNull at __TypeKind, nullability at __Directive.isRepeatable, nullability at __Type.isOneOf, order at U
input:    """The schema""" schema { query: Q mutation: M } "The root" type Q { a("An argument" x: Int = 3, y: [Int] = 1, z: In = {b: 2}): U, old: String @deprecated(reason: "gone"), d: Date } type M { m(p: Pick!): Boolean } type A { a: Int } type B { b: Int } union U = B | A enum E { X "Why" Y @deprecated } input In { a: Int = 1, b: Int, e: E = Y, old: String } input Pick { id: ID, name: String } scalar Date "Labels a field" directive @label(v: String, w: Int = 2) repeatable on FIELD_DEFINITION | QUERY  (the introspection query; includeDeprecated: the default)
response: {"__typename":"Q","description":null,"queryType":{"kind":"OBJECT","name":"Q"},"mutationType":{"kind":"OBJECT","name":"M"},"subscriptionType":null,"types":["A","B","Boolean","Date","E","ID","In","Int","M","Pick","Q","String","U","__Directive","__DirectiveLocation","__EnumValue","__Field","__InputValue","__Schema","__Type","__TypeKind"],"directives":["deprecated","include","label","oneOf","skip","specifiedBy"]}
expected: [object Object]
```

<a id="introspect-finding-9"></a>

#### 9. `builtinAdditions`, `builtinDefinitions`, `builtinNullability`, `order`, `typeKinds`: a type's isOneOf is null for an input object, or not null for another kind (draft only); fields, arguments, enum values, directives, members and interfaces come in source order: differs from Introspection.tla; the built-in @deprecated isn't as the spec defines it (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in Boolean's isOneOf is null for an input object, or not null for another kind (draft only); the built-in ID's isOneOf is null for an input object, or not null for another kind (draft only); the built-in String's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive has a field the spec doesn't define; the built-in __Directive's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Directive.isRepeatable has the spec's type, but not its Non-Null wrapping; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __DirectiveLocation's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __EnumValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __InputValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Schema's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.inputFields(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Type.isOneOf has the spec's type, but not its Non-Null wrapping; October 2021 doesn't define it; the built-in __TypeKind's isOneOf is null for an input object, or not null for another kind (draft only)

1 case, in `interfaces` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- The fields of the introspection types have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Fields, arguments, enum values, directives, members and interfaces come in source order (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))

The shortest case, from `interfaces.inc`:

```
problem:  added:fields at __Directive, arguments at @deprecated(reason:), arguments at __Directive.args(includeDeprecated:), arguments at __Field.args(includeDeprecated:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), arguments at __Type.inputFields(includeDeprecated:), directives at @deprecated, enumValues at __DirectiveLocation, isOneOfNull at Boolean, isOneOfNull at ID, isOneOfNull at Image, isOneOfNull at Node, isOneOfNull at Query, isOneOfNull at Resource, isOneOfNull at String, isOneOfNull at User, isOneOfNull at __Directive, isOneOfNull at __DirectiveLocation, isOneOfNull at __EnumValue, isOneOfNull at __Field, isOneOfNull at __InputValue, isOneOfNull at __Schema, isOneOfNull at __Type, isOneOfNull at __TypeKind, nullability at __Directive.isRepeatable, nullability at __Type.isOneOf, order at Image, order at User
input:    interface Node { id: ID! } interface Resource implements Node { id: ID! url: [[String!]]! } type Image implements Resource & Node { id: ID! url: [[String!]]! } type User implements Node { id: ID! friends: [User!] } type Query { node(id: ID!): Node, resource: Resource }  (the introspection query; includeDeprecated: true)
response: {"kind":"SCALAR","name":"String","description":"Represents textual data as UTF-8 character sequences. This type is most often used by GraphQL to represent free-form human-readable text.","specifiedByURL":null,"isOneOf":false,"fields":null,"inputFields":null,"interfaces":null,"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-10"></a>

#### 10. `builtinDefinitions`, `builtinNullability`, `order`, `typeKinds`: a type's isOneOf is null for an input object, or not null for another kind (draft only); fields, arguments, enum values, directives, members and interfaces come in source order: differs from Introspection.tla; the built-in @deprecated isn't as the spec defines it (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in Boolean's isOneOf is null for an input object, or not null for another kind (draft only); the built-in ID's isOneOf is null for an input object, or not null for another kind (draft only); the built-in String's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Directive.isRepeatable has the spec's type, but not its Non-Null wrapping; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __DirectiveLocation's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __EnumValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __InputValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Schema's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.inputFields(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Type.isOneOf has the spec's type, but not its Non-Null wrapping; October 2021 doesn't define it; the built-in __TypeKind's isOneOf is null for an input object, or not null for another kind (draft only)

1 case, in `interfaces` (1).

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- The fields of the introspection types have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Fields, arguments, enum values, directives, members and interfaces come in source order (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))

The shortest case, from `interfaces.defaults`:

```
problem:  arguments at @deprecated(reason:), arguments at __Directive.args(includeDeprecated:), arguments at __Field.args(includeDeprecated:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), arguments at __Type.inputFields(includeDeprecated:), directives at @deprecated, enumValues at __DirectiveLocation, isOneOfNull at Boolean, isOneOfNull at ID, isOneOfNull at Image, isOneOfNull at Node, isOneOfNull at Query, isOneOfNull at Resource, isOneOfNull at String, isOneOfNull at User, isOneOfNull at __Directive, isOneOfNull at __DirectiveLocation, isOneOfNull at __EnumValue, isOneOfNull at __Field, isOneOfNull at __InputValue, isOneOfNull at __Schema, isOneOfNull at __Type, isOneOfNull at __TypeKind, nullability at __Directive.isRepeatable, nullability at __Type.isOneOf, order at Image, order at User
input:    interface Node { id: ID! } interface Resource implements Node { id: ID! url: [[String!]]! } type Image implements Resource & Node { id: ID! url: [[String!]]! } type User implements Node { id: ID! friends: [User!] } type Query { node(id: ID!): Node, resource: Resource }  (the introspection query; includeDeprecated: the default)
response: {"kind":"SCALAR","name":"String","description":"Represents textual data as UTF-8 character sequences. This type is most often used by GraphQL to represent free-form human-readable text.","specifiedByURL":null,"isOneOf":false,"fields":null,"inputFields":null,"interfaces":null,"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-11"></a>

#### 11. `builtinAdditions`, `builtinDefinitions`, `builtinNullability`, `typeKinds`, `types`: a type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in @deprecated isn't as the spec defines it (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in Boolean's isOneOf is null for an input object, or not null for another kind (draft only); the built-in Int's isOneOf is null for an input object, or not null for another kind (draft only); the built-in String's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive has a field the spec doesn't define; the built-in __Directive's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Directive.isRepeatable has the spec's type, but not its Non-Null wrapping; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __DirectiveLocation's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __EnumValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __InputValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Schema's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.inputFields(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Type.isOneOf has the spec's type, but not its Non-Null wrapping; October 2021 doesn't define it; the built-in __TypeKind's isOneOf is null for an input object, or not null for another kind (draft only); types is the set of all named types: differs from Introspection.tla

1 case, in `roots` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- The fields of the introspection types have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))
- types is the set of all named types (MUST, [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type))

The shortest case, from `roots.inc`:

```
problem:  added:fields at __Directive, arguments at @deprecated(reason:), arguments at __Directive.args(includeDeprecated:), arguments at __Field.args(includeDeprecated:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), arguments at __Type.inputFields(includeDeprecated:), directives at @deprecated, enumValues at __DirectiveLocation, isOneOfNull at Boolean, isOneOfNull at Int, isOneOfNull at Q, isOneOfNull at S, isOneOfNull at String, isOneOfNull at __Directive, isOneOfNull at __DirectiveLocation, isOneOfNull at __EnumValue, isOneOfNull at __Field, isOneOfNull at __InputValue, isOneOfNull at __Schema, isOneOfNull at __Type, isOneOfNull at __TypeKind, nullability at __Directive.isRepeatable, nullability at __Type.isOneOf, types at Mutation
input:    schema { query: Q subscription: S } type Q { a: Int } type S { s: Int } type Mutation { m: Int }  (the introspection query; includeDeprecated: true)
response: "no type Mutation"
expected: [object Object]
```

<a id="introspect-finding-12"></a>

#### 12. `builtinDefinitions`, `builtinNullability`, `typeKinds`, `types`: a type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in @deprecated isn't as the spec defines it (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in Boolean's isOneOf is null for an input object, or not null for another kind (draft only); the built-in Int's isOneOf is null for an input object, or not null for another kind (draft only); the built-in String's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Directive.isRepeatable has the spec's type, but not its Non-Null wrapping; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __DirectiveLocation's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __EnumValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __InputValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Schema's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.inputFields(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Type.isOneOf has the spec's type, but not its Non-Null wrapping; October 2021 doesn't define it; the built-in __TypeKind's isOneOf is null for an input object, or not null for another kind (draft only); types is the set of all named types: differs from Introspection.tla

1 case, in `roots` (1).

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- The fields of the introspection types have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))
- types is the set of all named types (MUST, [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type))

The shortest case, from `roots.defaults`:

```
problem:  arguments at @deprecated(reason:), arguments at __Directive.args(includeDeprecated:), arguments at __Field.args(includeDeprecated:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), arguments at __Type.inputFields(includeDeprecated:), directives at @deprecated, enumValues at __DirectiveLocation, isOneOfNull at Boolean, isOneOfNull at Int, isOneOfNull at Q, isOneOfNull at S, isOneOfNull at String, isOneOfNull at __Directive, isOneOfNull at __DirectiveLocation, isOneOfNull at __EnumValue, isOneOfNull at __Field, isOneOfNull at __InputValue, isOneOfNull at __Schema, isOneOfNull at __Type, isOneOfNull at __TypeKind, nullability at __Directive.isRepeatable, nullability at __Type.isOneOf, types at Mutation
input:    schema { query: Q subscription: S } type Q { a: Int } type S { s: Int } type Mutation { m: Int }  (the introspection query; includeDeprecated: the default)
response: "no type Mutation"
expected: [object Object]
```

<a id="introspect-finding-13"></a>

#### 13. `builtinAdditions`, `builtinDefinitions`, `builtinNullability`, `typeKinds`: a type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in @deprecated isn't as the spec defines it (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in Boolean's isOneOf is null for an input object, or not null for another kind (draft only); the built-in Float's isOneOf is null for an input object, or not null for another kind (draft only); the built-in ID's isOneOf is null for an input object, or not null for another kind (draft only); the built-in String's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive has a field the spec doesn't define; the built-in __Directive's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Directive.isRepeatable has the spec's type, but not its Non-Null wrapping; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __DirectiveLocation's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __EnumValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __InputValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Schema's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.inputFields(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Type.isOneOf has the spec's type, but not its Non-Null wrapping; October 2021 doesn't define it; the built-in __TypeKind's isOneOf is null for an input object, or not null for another kind (draft only)

1 case, in `builtinScalars` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- The fields of the introspection types have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))

The shortest case, from `builtinScalars.inc`:

```
problem:  added:fields at __Directive, arguments at @deprecated(reason:), arguments at __Directive.args(includeDeprecated:), arguments at __Field.args(includeDeprecated:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), arguments at __Type.inputFields(includeDeprecated:), directives at @deprecated, enumValues at __DirectiveLocation, isOneOfNull at Boolean, isOneOfNull at Float, isOneOfNull at ID, isOneOfNull at Query, isOneOfNull at String, isOneOfNull at __Directive, isOneOfNull at __DirectiveLocation, isOneOfNull at __EnumValue, isOneOfNull at __Field, isOneOfNull at __InputValue, isOneOfNull at __Schema, isOneOfNull at __Type, isOneOfNull at __TypeKind, nullability at __Directive.isRepeatable, nullability at __Type.isOneOf
input:    directive @d(f: Float) on FIELD input In { id: ID } type Query { a(i: In): String }  (the introspection query; includeDeprecated: true)
response: {"kind":"SCALAR","name":"Float","description":"Represents signed double-precision fractional values as specified by [IEEE 754](https://en.wikipedia.org/wiki/IEEE_floating_point).","specifiedByURL":null,"isOneOf":false,"fields":null,"inputFields":null,"interfaces":null,"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-14"></a>

#### 14. `builtinDefinitions`, `builtinNullability`, `typeKinds`: a type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in @deprecated isn't as the spec defines it (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in Boolean's isOneOf is null for an input object, or not null for another kind (draft only); the built-in Float's isOneOf is null for an input object, or not null for another kind (draft only); the built-in ID's isOneOf is null for an input object, or not null for another kind (draft only); the built-in String's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Directive.isRepeatable has the spec's type, but not its Non-Null wrapping; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __DirectiveLocation's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __EnumValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __InputValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Schema's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.inputFields(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Type.isOneOf has the spec's type, but not its Non-Null wrapping; October 2021 doesn't define it; the built-in __TypeKind's isOneOf is null for an input object, or not null for another kind (draft only)

1 case, in `builtinScalars` (1).

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- The fields of the introspection types have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))

The shortest case, from `builtinScalars.defaults`:

```
problem:  arguments at @deprecated(reason:), arguments at __Directive.args(includeDeprecated:), arguments at __Field.args(includeDeprecated:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), arguments at __Type.inputFields(includeDeprecated:), directives at @deprecated, enumValues at __DirectiveLocation, isOneOfNull at Boolean, isOneOfNull at Float, isOneOfNull at ID, isOneOfNull at Query, isOneOfNull at String, isOneOfNull at __Directive, isOneOfNull at __DirectiveLocation, isOneOfNull at __EnumValue, isOneOfNull at __Field, isOneOfNull at __InputValue, isOneOfNull at __Schema, isOneOfNull at __Type, isOneOfNull at __TypeKind, nullability at __Directive.isRepeatable, nullability at __Type.isOneOf
input:    directive @d(f: Float) on FIELD input In { id: ID } type Query { a(i: In): String }  (the introspection query; includeDeprecated: the default)
response: {"kind":"SCALAR","name":"Float","description":"Represents signed double-precision fractional values as specified by [IEEE 754](https://en.wikipedia.org/wiki/IEEE_floating_point).","specifiedByURL":null,"isOneOf":false,"fields":null,"inputFields":null,"interfaces":null,"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-15"></a>

#### 15. `builtinAdditions`, `builtinDefinitions`, `builtinNullability`, `typeKinds`: a type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in @deprecated isn't as the spec defines it (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in Boolean's isOneOf is null for an input object, or not null for another kind (draft only); the built-in String's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive has a field the spec doesn't define; the built-in __Directive's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Directive.isRepeatable has the spec's type, but not its Non-Null wrapping; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __DirectiveLocation's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __EnumValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __InputValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Schema's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.inputFields(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Type.isOneOf has the spec's type, but not its Non-Null wrapping; October 2021 doesn't define it; the built-in __TypeKind's isOneOf is null for an input object, or not null for another kind (draft only)

1 case, in `scalars` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- The fields of the introspection types have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))

The shortest case, from `scalars.inc`:

```
problem:  added:fields at __Directive, arguments at @deprecated(reason:), arguments at __Directive.args(includeDeprecated:), arguments at __Field.args(includeDeprecated:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), arguments at __Type.inputFields(includeDeprecated:), directives at @deprecated, enumValues at __DirectiveLocation, isOneOfNull at Boolean, isOneOfNull at Date, isOneOfNull at Plain, isOneOfNull at Query, isOneOfNull at String, isOneOfNull at __Directive, isOneOfNull at __DirectiveLocation, isOneOfNull at __EnumValue, isOneOfNull at __Field, isOneOfNull at __InputValue, isOneOfNull at __Schema, isOneOfNull at __Type, isOneOfNull at __TypeKind, nullability at __Directive.isRepeatable, nullability at __Type.isOneOf
input:    "A date" scalar Date @specifiedBy(url: "https://example.com/date") scalar Plain type Query { d: Date, p: Plain }  (the introspection query; includeDeprecated: true)
response: {"kind":"SCALAR","name":"String","description":"Represents textual data as UTF-8 character sequences. This type is most often used by GraphQL to represent free-form human-readable text.","specifiedByURL":null,"isOneOf":false,"fields":null,"inputFields":null,"interfaces":null,"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-16"></a>

#### 16. `builtinDefinitions`, `builtinNullability`, `typeKinds`: a type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in @deprecated isn't as the spec defines it (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in Boolean's isOneOf is null for an input object, or not null for another kind (draft only); the built-in String's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Directive.isRepeatable has the spec's type, but not its Non-Null wrapping; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __DirectiveLocation's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __EnumValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __InputValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Schema's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.inputFields(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Type.isOneOf has the spec's type, but not its Non-Null wrapping; October 2021 doesn't define it; the built-in __TypeKind's isOneOf is null for an input object, or not null for another kind (draft only)

1 case, in `scalars` (1).

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- The fields of the introspection types have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))

The shortest case, from `scalars.defaults`:

```
problem:  arguments at @deprecated(reason:), arguments at __Directive.args(includeDeprecated:), arguments at __Field.args(includeDeprecated:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), arguments at __Type.inputFields(includeDeprecated:), directives at @deprecated, enumValues at __DirectiveLocation, isOneOfNull at Boolean, isOneOfNull at Date, isOneOfNull at Plain, isOneOfNull at Query, isOneOfNull at String, isOneOfNull at __Directive, isOneOfNull at __DirectiveLocation, isOneOfNull at __EnumValue, isOneOfNull at __Field, isOneOfNull at __InputValue, isOneOfNull at __Schema, isOneOfNull at __Type, isOneOfNull at __TypeKind, nullability at __Directive.isRepeatable, nullability at __Type.isOneOf
input:    "A date" scalar Date @specifiedBy(url: "https://example.com/date") scalar Plain type Query { d: Date, p: Plain }  (the introspection query; includeDeprecated: the default)
response: {"kind":"SCALAR","name":"String","description":"Represents textual data as UTF-8 character sequences. This type is most often used by GraphQL to represent free-form human-readable text.","specifiedByURL":null,"isOneOf":false,"fields":null,"inputFields":null,"interfaces":null,"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-17"></a>

#### 17. `builtinAdditions`, `builtinDefinitions`, `builtinNullability`, `typeKinds`: a type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in @deprecated isn't as the spec defines it (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in Boolean's isOneOf is null for an input object, or not null for another kind (draft only); the built-in ID's isOneOf is null for an input object, or not null for another kind (draft only); the built-in Int's isOneOf is null for an input object, or not null for another kind (draft only); the built-in String's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive has a field the spec doesn't define; the built-in __Directive's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Directive.isRepeatable has the spec's type, but not its Non-Null wrapping; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __DirectiveLocation's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __EnumValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __InputValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Schema's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.inputFields(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Type.isOneOf has the spec's type, but not its Non-Null wrapping; October 2021 doesn't define it; the built-in __TypeKind's isOneOf is null for an input object, or not null for another kind (draft only)

1 case, in `oneOf` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- The fields of the introspection types have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))

The shortest case, from `oneOf.inc`:

```
problem:  added:fields at __Directive, arguments at @deprecated(reason:), arguments at __Directive.args(includeDeprecated:), arguments at __Field.args(includeDeprecated:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), arguments at __Type.inputFields(includeDeprecated:), directives at @deprecated, enumValues at __DirectiveLocation, isOneOfNull at Boolean, isOneOfNull at ID, isOneOfNull at Int, isOneOfNull at Query, isOneOfNull at String, isOneOfNull at __Directive, isOneOfNull at __DirectiveLocation, isOneOfNull at __EnumValue, isOneOfNull at __Field, isOneOfNull at __InputValue, isOneOfNull at __Schema, isOneOfNull at __Type, isOneOfNull at __TypeKind, nullability at __Directive.isRepeatable, nullability at __Type.isOneOf
input:    [draft] input Pick @oneOf { id: ID, name: String } input Plain { x: Int! } type Query { a(p: Pick, q: Plain): Int }  (the introspection query; includeDeprecated: true)
response: {"kind":"SCALAR","name":"Int","description":"Represents non-fractional signed whole numeric values. Int can represent values between -(2^31) and 2^31 - 1.","specifiedByURL":null,"isOneOf":false,"fields":null,"inputFields":null,"interfaces":null,"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-18"></a>

#### 18. `builtinDefinitions`, `builtinNullability`, `typeKinds`: a type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in @deprecated isn't as the spec defines it (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in Boolean's isOneOf is null for an input object, or not null for another kind (draft only); the built-in ID's isOneOf is null for an input object, or not null for another kind (draft only); the built-in Int's isOneOf is null for an input object, or not null for another kind (draft only); the built-in String's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Directive.isRepeatable has the spec's type, but not its Non-Null wrapping; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __DirectiveLocation's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __EnumValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __InputValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Schema's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.inputFields(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Type.isOneOf has the spec's type, but not its Non-Null wrapping; October 2021 doesn't define it; the built-in __TypeKind's isOneOf is null for an input object, or not null for another kind (draft only)

1 case, in `oneOf` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- The fields of the introspection types have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))

The shortest case, from `oneOf.defaults`:

```
problem:  arguments at @deprecated(reason:), arguments at __Directive.args(includeDeprecated:), arguments at __Field.args(includeDeprecated:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), arguments at __Type.inputFields(includeDeprecated:), directives at @deprecated, enumValues at __DirectiveLocation, isOneOfNull at Boolean, isOneOfNull at ID, isOneOfNull at Int, isOneOfNull at Query, isOneOfNull at String, isOneOfNull at __Directive, isOneOfNull at __DirectiveLocation, isOneOfNull at __EnumValue, isOneOfNull at __Field, isOneOfNull at __InputValue, isOneOfNull at __Schema, isOneOfNull at __Type, isOneOfNull at __TypeKind, nullability at __Directive.isRepeatable, nullability at __Type.isOneOf
input:    [draft] input Pick @oneOf { id: ID, name: String } input Plain { x: Int! } type Query { a(p: Pick, q: Plain): Int }  (the introspection query; includeDeprecated: the default)
response: {"kind":"SCALAR","name":"Int","description":"Represents non-fractional signed whole numeric values. Int can represent values between -(2^31) and 2^31 - 1.","specifiedByURL":null,"isOneOf":false,"fields":null,"inputFields":null,"interfaces":null,"enumValues":null,"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-19"></a>

#### 19. `builtinAdditions`, `builtinDefinitions`, `builtinNullability`, `order`, `typeKinds`: a type's isOneOf is null for an input object, or not null for another kind (draft only); fields, arguments, enum values, directives, members and interfaces come in source order: differs from Introspection.tla; the built-in @deprecated isn't as the spec defines it (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in Boolean's isOneOf is null for an input object, or not null for another kind (draft only); the built-in Int's isOneOf is null for an input object, or not null for another kind (draft only); the built-in String's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive has a field the spec doesn't define; the built-in __Directive's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Directive.isRepeatable has the spec's type, but not its Non-Null wrapping; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __DirectiveLocation's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __EnumValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __InputValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Schema's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.inputFields(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Type.isOneOf has the spec's type, but not its Non-Null wrapping; October 2021 doesn't define it; the built-in __TypeKind's isOneOf is null for an input object, or not null for another kind (draft only)

1 case, in `order` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- The fields of the introspection types have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Fields, arguments, enum values, directives, members and interfaces come in source order (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))

The shortest case, from `order.inc`:

```
problem:  added:fields at __Directive, arguments at @deprecated(reason:), arguments at __Directive.args(includeDeprecated:), arguments at __Field.args(includeDeprecated:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), arguments at __Type.inputFields(includeDeprecated:), directives at @deprecated, enumValues at __DirectiveLocation, isOneOfNull at A2, isOneOfNull at B2, isOneOfNull at Boolean, isOneOfNull at E, isOneOfNull at I1, isOneOfNull at I2, isOneOfNull at Int, isOneOfNull at O, isOneOfNull at Query, isOneOfNull at String, isOneOfNull at U, isOneOfNull at __Directive, isOneOfNull at __DirectiveLocation, isOneOfNull at __EnumValue, isOneOfNull at __Field, isOneOfNull at __InputValue, isOneOfNull at __Schema, isOneOfNull at __Type, isOneOfNull at __TypeKind, nullability at __Directive.isRepeatable, nullability at __Type.isOneOf, order at O, order at Query, order at U
input:    type Query { z: Int, a: Int, m(c: Int, b: Int, a: Int): O, u: U, e: E } interface I1 { x: Int } interface I2 { x: Int } type O implements I2 & I1 { x: Int } type A2 { a: Int } type B2 { b: Int } union U = B2 | A2 enum E { Z A M }  (the introspection query; includeDeprecated: true)
response: {"kind":"ENUM","name":"E","description":null,"specifiedByURL":null,"isOneOf":false,"fields":null,"inputFields":null,"interfaces":null,"enumValues":[{"name":"Z","description":null,"isDeprecated":false,"deprecationReason":null},{"name":"A","description":null,"isDeprecated":false,"deprecationReason":null},{"name":"M","description":null,"isDeprecated":false,"deprecationReason":null}],"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-20"></a>

#### 20. `builtinDefinitions`, `builtinNullability`, `order`, `typeKinds`: a type's isOneOf is null for an input object, or not null for another kind (draft only); fields, arguments, enum values, directives, members and interfaces come in source order: differs from Introspection.tla; the built-in @deprecated isn't as the spec defines it (directives); the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in Boolean's isOneOf is null for an input object, or not null for another kind (draft only); the built-in Int's isOneOf is null for an input object, or not null for another kind (draft only); the built-in String's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Directive.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Directive.isRepeatable has the spec's type, but not its Non-Null wrapping; the built-in __DirectiveLocation isn't as the draft defines it, but is as October 2021 does (enumValues); the built-in __DirectiveLocation's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __EnumValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Field.args(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __InputValue's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Schema's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.inputFields(includeDeprecated:) isn't as the draft defines it; October 2021 doesn't define it (arguments); the built-in __Type.isOneOf has the spec's type, but not its Non-Null wrapping; October 2021 doesn't define it; the built-in __TypeKind's isOneOf is null for an input object, or not null for another kind (draft only)

1 case, in `order` (1).

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives))
- The fields of the introspection types have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Fields, arguments, enum values, directives, members and interfaces come in source order (SHOULD, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))

The shortest case, from `order.defaults`:

```
problem:  arguments at @deprecated(reason:), arguments at __Directive.args(includeDeprecated:), arguments at __Field.args(includeDeprecated:), arguments at __Type.enumValues(includeDeprecated:), arguments at __Type.fields(includeDeprecated:), arguments at __Type.inputFields(includeDeprecated:), directives at @deprecated, enumValues at __DirectiveLocation, isOneOfNull at A2, isOneOfNull at B2, isOneOfNull at Boolean, isOneOfNull at E, isOneOfNull at I1, isOneOfNull at I2, isOneOfNull at Int, isOneOfNull at O, isOneOfNull at Query, isOneOfNull at String, isOneOfNull at U, isOneOfNull at __Directive, isOneOfNull at __DirectiveLocation, isOneOfNull at __EnumValue, isOneOfNull at __Field, isOneOfNull at __InputValue, isOneOfNull at __Schema, isOneOfNull at __Type, isOneOfNull at __TypeKind, nullability at __Directive.isRepeatable, nullability at __Type.isOneOf, order at O, order at Query, order at U
input:    type Query { z: Int, a: Int, m(c: Int, b: Int, a: Int): O, u: U, e: E } interface I1 { x: Int } interface I2 { x: Int } type O implements I2 & I1 { x: Int } type A2 { a: Int } type B2 { b: Int } union U = B2 | A2 enum E { Z A M }  (the introspection query; includeDeprecated: the default)
response: {"kind":"ENUM","name":"E","description":null,"specifiedByURL":null,"isOneOf":false,"fields":null,"inputFields":null,"interfaces":null,"enumValues":[{"name":"Z","description":null,"isDeprecated":false,"deprecationReason":null},{"name":"A","description":null,"isDeprecated":false,"deprecationReason":null},{"name":"M","description":null,"isDeprecated":false,"deprecationReason":null}],"possibleTypes":null}
expected: [object Object]
```

<a id="introspect-finding-21"></a>

#### 21. `typeKinds`: a type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in Int's isOneOf is null for an input object, or not null for another kind (draft only); the built-in __TypeKind's isOneOf is null for an input object, or not null for another kind (draft only)

1 case, in `minimal` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))

The shortest case, from `minimal.lookup`:

```
problem:  isOneOfNull at Int, isOneOfNull at Query, isOneOfNull at __TypeKind
input:    type Query { a: Int }  (__type(name:) for Query, Int, Float, __TypeKind, Unknown; includeDeprecated: true)
response: {"__type(name: \"Int\")":{"kind":"SCALAR","name":"Int","description":"Represents non-fractional signed whole numeric values. Int can represent values between -(2^31) and 2^31 - 1.","specifiedByURL":null,"isOneOf":false,"fields":null,"inputFields":null,"interfaces":null,"enumValues":null,"possibleTypes":null}}
expected: [object Object]
```

<a id="introspect-finding-22"></a>

#### 22. `typeByName`, `typeKinds`: __type(name:) doesn't return a type the schema has; a type's isOneOf is null for an input object, or not null for another kind (draft only)

1 case, in `roots` (1).

- __type(name:) returns the named type, and null for a name the schema doesn't have (MUST, [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection))
- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))

The shortest case, from `roots.lookup`:

```
problem:  isOneOfNull at Q, isOneOfNull at S, typeByName at Mutation
input:    schema { query: Q subscription: S } type Q { a: Int } type S { s: Int } type Mutation { m: Int }  (__type(name:) for Q, S, Mutation, Float, Unknown; includeDeprecated: true)
response: {"__type(name: \"S\")":{"kind":"OBJECT","name":"S","description":null,"specifiedByURL":null,"isOneOf":false,"fields":[{"name":"s","description":null,"args":[],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}}
expected: [object Object]
```

<a id="introspect-finding-23"></a>

#### 23. `typeKinds`: the built-in Float's isOneOf is null for an input object, or not null for another kind (draft only); the built-in ID's isOneOf is null for an input object, or not null for another kind (draft only)

1 case, in `builtinScalars` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))

The shortest case, from `builtinScalars.lookup`:

```
problem:  isOneOfNull at Float, isOneOfNull at ID
input:    directive @d(f: Float) on FIELD input In { id: ID } type Query { a(i: In): String }  (__type(name:) for In, ID, Float, Int, Unknown; includeDeprecated: true)
response: {"__type(name: \"Float\")":{"kind":"SCALAR","name":"Float","description":"Represents signed double-precision fractional values as specified by [IEEE 754](https://en.wikipedia.org/wiki/IEEE_floating_point).","specifiedByURL":null,"isOneOf":false,"fields":null,"inputFields":null,"interfaces":null,"enumValues":null,"possibleTypes":null}}
expected: [object Object]
```

<a id="introspect-finding-24"></a>

#### 24. `typeKinds`: a type's isOneOf is null for an input object, or not null for another kind (draft only); the built-in String's isOneOf is null for an input object, or not null for another kind (draft only)

1 case, in `scalars` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))

The shortest case, from `scalars.lookup`:

```
problem:  isOneOfNull at Date, isOneOfNull at Plain, isOneOfNull at String
input:    "A date" scalar Date @specifiedBy(url: "https://example.com/date") scalar Plain type Query { d: Date, p: Plain }  (__type(name:) for Date, Plain, String, Unknown; includeDeprecated: true)
response: {"__type(name: \"String\")":{"kind":"SCALAR","name":"String","description":"Represents textual data as UTF-8 character sequences. This type is most often used by GraphQL to represent free-form human-readable text.","specifiedByURL":null,"isOneOf":false,"fields":null,"inputFields":null,"interfaces":null,"enumValues":null,"possibleTypes":null}}
expected: [object Object]
```

<a id="introspect-finding-25"></a>

#### 25. `typeKinds`: a List or Non-Null type has a non-null isOneOf (draft only)

1 case, in `wrappers` (1). All rely on grammar or rules that are only in the draft, not in October 2021.

- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type))

The shortest case, from `wrappers`:

```
problem:  wrapperIsOneOf at __Schema.directives, wrapperIsOneOf at __Schema.queryType, wrapperIsOneOf at __Schema.types
input:    type Query { a: Int }  (__type(name: "__Schema")'s fields and their types; includeDeprecated: the default)
response: {"name":"directives","type":{"kind":"NON_NULL","name":null,"description":null,"specifiedByURL":null,"isOneOf":false,"fields":null,"interfaces":null,"possibleTypes":null,"enumValues":null,"inputFields":null,"ofType":{"kind":"LIST","name":null,"description":null,"specifiedByURL":null,"isOneOf":false,"fields":null,"interfaces":null,"possibleTypes":null,"enumValues":null,"inputFields":null,"ofType":{"kind":"NON_NULL","name":null,"description":null,"specifiedByURL":null,"isOneOf":false,"fields":null,"interfaces":null,"possibleTypes":null,"enumValues":null,"inputFields":null,"ofType":{"kind":"OBJECT","name":"__Directive"}}}}}
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
| The query executes, and its result has exactly the fields it selects, nulls included (`executes`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✗ 3/36 |
| queryType, mutationType and subscriptionType are the root operation types (`roots`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✓ 20 |
| types is the set of all named types (`types`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) | ✗ 2/20 |
| types has the built-in scalars the schema references, and no others (`builtinScalars`) | MUST | [§3.5](https://spec.graphql.org/draft/#sec-Scalars) [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) | ✓ 20 |
| __type(name:) returns the named type, and null for a name the schema doesn't have (`typeByName`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✗ 1/12 |
| Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (`typeKinds`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) | ✗ 32/33 (all draft only) |
| An object's or interface's fields, with their types (`fields`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) | ✓ 32 |
| Field and directive arguments, with their types (`arguments`) | MUST | [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) | ✓ 32 |
| defaultValue is null for an input value without a default, and otherwise null or an encoding of the default (`defaultValue`) | MUST | [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | ✓ 32 |
| defaultValue encodes the default value of an input value that has one, rather than returning null (`defaultValueOmitted`) | SHOULD | [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | ✓ 32 |
| An input object's inputFields, with their types (`inputFields`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | ✓ 32 |
| An enum's enumValues (`enumValues`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) | ✓ 32 |
| interfaces, and possibleTypes for unions and interfaces (`interfaces`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) | ✓ 32 |
| isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something (`deprecation`) | MUST (Oct 2021: fields and enum values only) | [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✓ 32 |
| specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null (`specifiedByURL`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) | ✓ 32 |
| isOneOf is true exactly for OneOf input objects (`isOneOf`). Draft only: October 2021 has no OneOf input objects. | MUST (draft only) | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 32 |
| A description the document gives is returned as it is, the schema's included (`descriptions`) | SHOULD | [§3.2](https://spec.graphql.org/draft/#sec-Type-System-Descriptions) [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ! 2/32 |
| directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types (`directives`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 20 |
| @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (`builtinDirectives`) | SHOULD | [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.1](https://spec.graphql.org/draft/#sec-skip) [§3.13.2](https://spec.graphql.org/draft/#sec-include) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) [§3.13.5](https://spec.graphql.org/draft/#sec-oneOf) | ✓ 20 |
| The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (`builtinDefinitions`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 21/33 (5 draft only) |
| The fields of the introspection types have the Non-Null wrapping the spec gives them (`builtinNullability`) | SHOULD | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ! 20/32 (4 draft only) |
| The introspection types have no field, argument, enum value or type the spec doesn't define (`builtinAdditions`) | INFO | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | i 10/32 (2 draft only) |
| Under the October 2021 profile, a built-in definition that differs from October 2021's is as the draft defines it (`builtinEdition`). Graded only under the October 2021 profile. | INFO | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | – |
| __typename names the root type, and no fields list includes it (`typename`) | MUST | [§4.1](https://spec.graphql.org/draft/#sec-Type-Name-Introspection) | ✓ 32 |
| Fields, arguments, enum values, directives, members and interfaces come in source order (`order`). Draft only: October 2021 has no Stable Ordering. | SHOULD (draft only) | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ! 9/32 (all draft only) |
| Anything else Introspection!Matches requires (`other`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 32 |

- **Basis for `defaultValueOmitted`:** §4.2.4: "defaultValue may return a String encoding (using the GraphQL language) of the default value used by this input value in the condition a value is not provided at runtime. If this input value has no default value, returns null." By Appendix A, a lowercase "may" keeps its RFC 2119 meaning, so the encoding is optional; the intent is plainly that a default is encoded, which makes this a SHOULD. A string that isn't an encoding of the default, or one for an input value without a default, still fails defaultValue.
- **Basis for `descriptions`:** §3.2: documentation is "written immediately alongside definitions in a TypeSystemDocument and made available via introspection", which has no key word, and §4.2 says of every description field that it "may return a String or null". So a description the document gives that is lost or replaced fails this SHOULD, and any description is accepted for a definition the document doesn't describe ("" or one of the service's own included).
- **Basis for `builtinNullability`:** The types of the introspection fields are given only by the definitions §4.2 introduces with "Below are the full set of type system definitions providing schema introspection, which are fully defined in the sections below", which has no key word. The sections below say what each field returns ("isRepeatable must return a Boolean"), and a field whose type differs only in Non-Null can still return exactly that. Any other change of type stays under builtinDefinitions, a MUST.
- **Basis for `builtinAdditions`:** No sentence of §4 forbids extending the introspection types. The nearest is "Below are the full set of type system definitions providing schema introspection, which are fully defined in the sections below", which uses no key word, and Appendix A says "A conforming implementation of GraphQL may provide additional functionality, but must not do so where explicitly disallowed". Leaving out or changing a definition stays a MUST, under builtinDefinitions.
- **Basis for `builtinEdition`:** The kit grades against the draft; the October 2021 profile is a fallback for a service whose introspection types the draft's query can't ask. A built-in definition (or an addition) that is exactly the draft's breaks nothing the draft requires, so it is reported here, not under builtinDefinitions or builtinAdditions.
