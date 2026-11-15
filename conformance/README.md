# Conformance sheet

Which parts of the [GraphQL spec](https://spec.graphql.org/draft/) each implementation was checked against, and what it breaks. Every verdict comes from a report written by the [conformance kit](../docs/conformance.md), which drives the implementation through an adapter and checks each response against the TLA+ reference. Section numbers are from graphql/graphql-spec@bfcc722b32f4 (spec/Section 2–7). Regenerate with `npm run conformance`.

Read it with these limits in mind:

- **Small fixtures.** A ✓ means no case the kit tried broke the rule, not that the implementation is correct. The cell gives the number of cases it rests on.
- **One oracle.** The TLA+ references were checked against graphql-js only (differentially, and through the negative controls, which are graphql-js cases broken on purpose). A bug the reference shares with graphql-js would show as ✓ everywhere.
- **Unreviewed adapters.** The kit's authors wrote every adapter, and no implementation's maintainers have reviewed theirs yet. A failure may be the adapter's, not the implementation's. Each adapter's README says how it maps the protocol onto its implementation.
- **Draft text.** Levels are the draft's. Where the October 2021 edition differs, the check says so.

## Implementations

| Implementation | Areas | Capabilities | Cases (distinct) | Findings | Malformed cases | Adapter problems | Checker self-test | Kit |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| [graphql-js 16.15.0](graphql-js-16.md) | execution, parse, validate, coerce, schema, introspect | absent-vs-null, coerce, deferred-items, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, unvalidated, validate | 19064 (9517) | 28 | 2 | none | passed | c8d6acb7c6e2, 2026-11-15 |
| [graphql-js 17.1.0](graphql-js-17.md) | execution, parse, validate, coerce, schema, introspect | absent-vs-null, coerce, deferred-items, error-propagation-off, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, unvalidated, validate | 20666 (9800) | 17 | 0 | none | passed | c8d6acb7c6e2, 2026-11-15 |
| [graphql-java 26.2](graphql-java.md) | execution | error-propagation-off, idle, invalid-results, mutation, subscription, uncoercible-results | 13450 (2544) | 1 | 1338 | none | passed | c8d6acb7c6e2, 2026-11-15 |
| [async-graphql 7.0.17 (dynamic schema)](async-graphql.md) | execution | idle, invalid-results, mutation, subscription | 11213 (350) | 8 | 5801 | none | passed | c8d6acb7c6e2, 2026-11-15 |
| [Hot Chocolate 15.1.21](hotchocolate.md) | execution | idle, invalid-results, mutation, subscription, uncoercible-results | 11972 (2189) | 3 | 384 | none | passed | c8d6acb7c6e2, 2026-11-15 |
| [graphql-core 3.2.14](graphql-core.md) | execution | deferred-items, idle, invalid-results, mutation, subscription, uncoercible-results | 11858 (2704) | 1 | 0 | none | passed | c8d6acb7c6e2, 2026-11-15 |
| [graphql-ruby 2.6.15](graphql-ruby.md) | execution | idle, invalid-results, mutation, subscription, uncoercible-results | 11864 (1929) | 2 | 385 | none | passed | c8d6acb7c6e2, 2026-11-15 |

## Findings

Each finding is one kind of failure: the set of clauses a case broke, or a malformed case's first problem, which is the root cause when one fault shows up several ways. A case counts toward one finding only.

- **[graphql-js 16.15.0](graphql-js-16.md):** 
  - [`selectionSets`](graphql-js-16.md#finding-1): rejects what §2.5 Selection Sets accepts (8 cases, `random-documents`, `parser-examples`, `field-suffixes`)
  - [`stringValue`](graphql-js-16.md#finding-2): rejects what §2.10.4 String Value accepts (2 cases, `lexer-examples`, `strings`)
  - [`fieldSelectionMerging`](graphql-js-16.md#finding-3): §5.3.2 Field Selection Merging isn't enforced: accepts documents that break only this rule (22 cases, `merging`)
  - [`operationTypeExistence`](graphql-js-16.md#finding-4): §5.2.1.1 Operation Type Existence isn't enforced: accepts documents that break only this rule (12 cases, `operations`, `spec`)
  - [`singleRootField`](graphql-js-16.md#finding-5): §5.2.4.1 Single Root Field isn't enforced: accepts documents that break only this rule (12 cases, `operations`, `random`)
  - [`fragmentSpreadIsPossible`](graphql-js-16.md#finding-6): §5.5.2.3 Fragment Spread Is Possible isn't enforced: accepts documents that break only this rule (4 cases, `spreads`, `random`)
  - [`allVariableUsagesAreAllowed`](graphql-js-16.md#finding-7): §5.8.5 All Variable Usages Are Allowed isn't enforced: accepts documents that break only this rule (2 cases, `spec`)
  - [`fieldSelectionMerging`](graphql-js-16.md#finding-8): §5.3.2 Field Selection Merging is over-strict: rejects valid documents one edit away from a document that breaks only this rule (1 case, `merging`)
  - [`allVariableUsagesAreAllowed`](graphql-js-16.md#finding-9): §5.8.5 All Variable Usages Are Allowed is over-strict: rejects valid documents one edit away from a document that breaks only this rule (1 case, `variables`)
  - [`inputObject`](graphql-js-16.md#finding-10): accepts what §3.10 (Input Objects) rejects (4 cases, `literal`, `spec-example`)
  - [`float`](graphql-js-16.md#finding-11): accepts what §3.5.2 (Float) rejects (2 cases, `literal`)
  - [`float`](graphql-js-16.md#finding-12): accepts what §3.5.2 (Float) rejects; the variables hold a number a double can't hold, so the JSON parser decides this (1 case, `variable`)
  - [`string`](graphql-js-16.md#finding-13): accepts what §3.5.3 (String) rejects (1 case, `variable`)
  - [`idCoerced`](graphql-js-16.md#finding-14): coerces to the wrong value under §3.5.5 (ID); the variables hold a number a double can't hold, so the JSON parser decides this (1 case, `variable`)
  - [`idCoerced`](graphql-js-16.md#finding-15): coerces to the wrong value under §3.5.5 (ID) (1 case, `variable`)
  - [`idCoerced`](graphql-js-16.md#finding-16): rejects what §3.5.5 (ID) accepts; the variables hold a number a double can't hold, so the JSON parser decides this (1 case, `variable`)
  - [`id`](graphql-js-16.md#finding-17): accepts what §3.5.5 (ID) rejects (1 case, `variable`)
  - [`list`](graphql-js-16.md#finding-18): accepts what §3.11 (List) rejects (1 case, `literal`)
  - [`argDefaultCompatible`](graphql-js-16.md#finding-19): ARG_DEFAULT_COMPATIBLE not enforced: accepts a schema that breaks only this rule (9 cases, `defaults`)
  - [`inputObjectDefaultValueCycle`](graphql-js-16.md#finding-20): INPUT_OBJECT_DEFAULT_VALUE_CYCLE over-strict: rejects a valid schema one small edit away from one that breaks it (3 cases, `input`)
  - [`directiveReferencesItselfIndirectly`](graphql-js-16.md#finding-21): DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY not enforced: accepts a schema that breaks only this rule (3 cases, `directive`)
  - [`typeNameNotBuiltin`](graphql-js-16.md#finding-22): TYPE_NAME_NOT_BUILTIN not enforced: accepts a schema that breaks only this rule (2 cases, `names`)
  - [`rootTypesDifferent`](graphql-js-16.md#finding-23): ROOT_TYPES_DIFFERENT not enforced: accepts a schema that breaks only this rule (2 cases, `root`)
  - [`inputObjectUnbreakableCycle`](graphql-js-16.md#finding-24): INPUT_OBJECT_UNBREAKABLE_CYCLE not enforced: accepts a schema that breaks only this rule (2 cases, `input`)
  - [`implDeprecation`](graphql-js-16.md#finding-25): IMPL_DEPRECATION not enforced: accepts a schema that breaks only this rule (1 case, `implementation`)
  - [`directiveUsesItself`](graphql-js-16.md#finding-26): DIRECTIVE_USES_ITSELF not enforced: accepts a schema that breaks only this rule (1 case, `directive`)
  - [`builtinDefinitions`](graphql-js-16.md#finding-27): the built-in @deprecated(reason:) isn't as the spec defines it (arguments); the built-in __Directive.args(includeDeprecated:) isn't as the spec defines it (arguments); the built-in __Field.args(includeDeprecated:) isn't as the spec defines it (arguments); the built-in __Type.enumValues(includeDeprecated:) isn't as the spec defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the spec defines it (arguments); the built-in __Type.inputFields(includeDeprecated:) isn't as the spec defines it (arguments) (20 cases, `minimal`, `rich`, `interfaces`, `defaults`, `deprecation`, `roots`, `builtinScalars`, `scalars`, `oneOf`, `order`)
  - [`executes`](graphql-js-16.md#finding-28): the schema didn't build, the query failed, or the result is malformed (2 cases, `directiveDeprecation`)
- **[graphql-js 17.1.0](graphql-js-17.md):** 
  - [`stringValue`](graphql-js-17.md#finding-1): rejects what §2.10.4 String Value accepts (2 cases, `lexer-examples`, `strings`)
  - [`fieldSelectionMerging`](graphql-js-17.md#finding-2): §5.3.2 Field Selection Merging isn't enforced: accepts documents that break only this rule (22 cases, `merging`)
  - [`fragmentSpreadIsPossible`](graphql-js-17.md#finding-3): §5.5.2.3 Fragment Spread Is Possible isn't enforced: accepts documents that break only this rule (4 cases, `spreads`, `random`)
  - [`allVariableUsagesAreAllowed`](graphql-js-17.md#finding-4): §5.8.5 All Variable Usages Are Allowed isn't enforced: accepts documents that break only this rule (2 cases, `spec`)
  - [`fieldSelectionMerging`](graphql-js-17.md#finding-5): §5.3.2 Field Selection Merging is over-strict: rejects valid documents one edit away from a document that breaks only this rule (1 case, `merging`)
  - [`allVariableUsagesAreAllowed`](graphql-js-17.md#finding-6): §5.8.5 All Variable Usages Are Allowed is over-strict: rejects valid documents one edit away from a document that breaks only this rule (1 case, `variables`)
  - [`float`](graphql-js-17.md#finding-7): accepts what §3.5.2 (Float) rejects (2 cases, `literal`)
  - [`float`](graphql-js-17.md#finding-8): accepts what §3.5.2 (Float) rejects; the variables hold a number a double can't hold, so the JSON parser decides this (1 case, `variable`)
  - [`string`](graphql-js-17.md#finding-9): accepts what §3.5.3 (String) rejects (1 case, `variable`)
  - [`idCoerced`](graphql-js-17.md#finding-10): coerces to the wrong value under §3.5.5 (ID); the variables hold a number a double can't hold, so the JSON parser decides this (1 case, `variable`)
  - [`idCoerced`](graphql-js-17.md#finding-11): coerces to the wrong value under §3.5.5 (ID) (1 case, `variable`)
  - [`idCoerced`](graphql-js-17.md#finding-12): rejects what §3.5.5 (ID) accepts; the variables hold a number a double can't hold, so the JSON parser decides this (1 case, `variable`)
  - [`id`](graphql-js-17.md#finding-13): accepts what §3.5.5 (ID) rejects (1 case, `variable`)
  - [`directiveReferencesItselfIndirectly`](graphql-js-17.md#finding-14): DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY not enforced: accepts a schema that breaks only this rule (3 cases, `directive`)
  - [`typeNameNotBuiltin`](graphql-js-17.md#finding-15): TYPE_NAME_NOT_BUILTIN not enforced: accepts a schema that breaks only this rule (2 cases, `names`)
  - [`directiveUsesItself`](graphql-js-17.md#finding-16): DIRECTIVE_USES_ITSELF not enforced: accepts a schema that breaks only this rule (1 case, `directive`)
  - [`builtinDefinitions`](graphql-js-17.md#finding-17): the built-in __DirectiveLocation isn't as the spec defines it (enumValues) (22 cases, `minimal`, `rich`, `interfaces`, `defaults`, `deprecation`, `directiveDeprecation`, `roots`, `builtinScalars`, `scalars`, `oneOf`, `order`)
- **[graphql-java 26.2](graphql-java.md):** 
  - [`eventYieldsResult`](graphql-java.md#finding-1): the response stream failed instead of yielding the event's result: … (1338 cases, `subscription`)
- **[async-graphql 7.0.17 (dynamic schema)](async-graphql.md):** 
  - [`errorPath`](async-graphql.md#finding-1): an execution error without a path (4658 cases, `mutation`, `nullPropagation`, `leaves`, `fragments`, `lists`, `unions`, `subscription`)
  - [`callsReachable`](async-graphql.md#finding-2): a resolver was called at … but its parent settled as null (1042 cases, `lists`, `subscription`)
  - [`dataMatches`](async-graphql.md#finding-3) (102 cases, `lists`, `unions`, `leaves`, `nullPropagation`, `fragments`, `mutation`)
  - [`callsOnce`](async-graphql.md#finding-4): the resolver at … was called twice (101 cases, `fragments`)
  - [`complete`](async-graphql.md#finding-5) (29 cases, `leaves`, `unions`, `nullPropagation`, `lists`, `mutation`)
  - [`dataMatches`, `nullsExplained`](async-graphql.md#finding-6) (15 cases, `unions`)
  - [`complete`, `errorsInsideNulls`, `errorsWereRaised`](async-graphql.md#finding-7) (3 cases, `unions`)
  - [`dataMatches`, `errorsInsideNulls`, `errorsWereRaised`](async-graphql.md#finding-8) (2 cases, `unions`)
- **[Hot Chocolate 15.1.21](hotchocolate.md):** 
  - [`resultCoercion`](hotchocolate.md#finding-1): count is 1, though its resolver returned a value its type can't represent, which must raise an execution error (343 cases, `leaves`)
  - [`nullsExplained`](hotchocolate.md#finding-2) (94 cases, `lists`, `unions`)
  - [`resultCoercion`](hotchocolate.md#finding-3): … is 1, though its resolver returned a value its type can't represent, which must raise an execution error (41 cases, `unions`)
- **[graphql-core 3.2.14](graphql-core.md):** 
  - [`calledSerially`](graphql-core.md#finding-1) (510 cases, `mutation`)
- **[graphql-ruby 2.6.15](graphql-ruby.md):** 
  - [`resultCoercion`](graphql-ruby.md#finding-1): count is 1, though its resolver returned a value its type can't represent, which must raise an execution error (343 cases, `leaves`)
  - [`resultCoercion`](graphql-ruby.md#finding-2): … is 1, though its resolver returned a value its type can't represent, which must raise an execution error (42 cases, `unions`)

## Execution: each check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **~:** inconclusive (see the implementation's page).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | graphql-js 16.15.0 | graphql-js 17.1.0 | graphql-java 26.2 | async-graphql 7.0.17 (dynamic schema) | Hot Chocolate 15.1.21 | graphql-core 3.2.14 | graphql-ruby 2.6.15 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| The response is sent only once execution is complete (`complete`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 2239 | ✓ 2522 | ✓ 2544 | ✗ 32/350 | ✓ 2189 | ✓ 2704 | ✓ 1929 |
| data is the completed value: field collection, value completion and null propagation (`dataMatches`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2239 | ✓ 2522 | ✓ 2544 | ✗ 119/350 | ✓ 2189 | ✓ 2704 | ✓ 1929 |
| Response keys are in collected field order (`keyOrder`) | SHOULD | [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering) | ✓ 2239 | ✓ 2522 | ✓ 2544 | ✓ 350 | ✓ 2189 | ✓ 2704 | ✓ 1929 |
| Every error was raised, at the path where it was raised (`errorsWereRaised`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 2239 | ✓ 2522 | ✓ 2544 | ✗ 5/350 | ✓ 2189 | ✓ 2704 | ✓ 1929 |
| No two errors share a response path (`errorPathsUnique`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2239 | ✓ 2522 | ✓ 2544 | ✓ 350 | ✓ 2189 | ✓ 2704 | ✓ 1929 |
| Every error is inside a null in data (`errorsInsideNulls`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2239 | ✓ 2522 | ✓ 2544 | ✗ 5/350 | ✓ 2189 | ✓ 2704 | ✓ 1929 |
| Every null an error caused comes with an error from its cause (`nullsExplained`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 2239 | ✓ 2522 | ✓ 2544 | ✗ 15/350 | ✗ 94/2189 | ✓ 2704 | ✓ 1929 |
| A mutation reports every error its earlier root fields raised (`serialErrorsKept`) | MUST | [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 45 | ✓ 45 | ✓ 45 | ✓ 11 | ✓ 125 | ✓ 510 | ✓ 125 |
| A mutation's root fields execute one after another (`calledSerially`) | MUST | [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) | ✓ 45 | ✓ 45 | ✓ 45 | ✓ 11 | ✓ 125 | ✗ 510/510 | ✓ 125 |
| Each field is executed once, merged selections included (`callsOnce`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) | ✓ 11786 | ✓ 13388 | ✓ 13450 | ✗ 101/11213 | ✓ 11972 | ✓ 11858 | ✓ 11864 |
| Only fields the operation selects are executed (`callsSelected`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) | ✓ 11786 | ✓ 13388 | ✓ 13450 | ✓ 11213 | ✓ 11972 | ✓ 11858 | ✓ 11864 |
| A field executes only once its parent has a value that contains it (`callsReachable`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 11786 | ✓ 13388 | ✓ 13450 | ✗ 1042/11213 | ✓ 11972 | ✓ 11858 | ✓ 11864 |
| A subscription event yields an execution result, even when its data is null (`eventYieldsResult`) | MUST | [§6.2.3.2](https://spec.graphql.org/draft/#sec-Response-Stream) | ✓ 1518 | ✓ 1518 | ✗ 1338/1522 | ✓ 1522 | ✓ 1522 | ✓ 1518 | ✓ 1522 |
| data holds only positions the operation selects (`dataShape`) | MUST | [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ 6521 | ✓ 8123 | ✓ 7933 | ✓ 1924 | ✓ 6275 | ✓ 6510 | ✓ 6230 |
| A leaf value its type can't represent (a fraction for an Int, a non-finite Float, an unknown enum value) raises an execution error (`resultCoercion`) | MUST | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 11786 | ✓ 13388 | ✓ 13450 | ✓ 11213 | ✗ 384/11972 | ✓ 11858 | ✗ 385/11864 |
| Leaf values are the resolver's canonical value (Int 1, Float 1.5, Boolean true, an enum's first value, "v") (`leafValues`) | MUST | [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 6521 | ✓ 8123 | ✓ 7933 | ✓ 1924 | ✓ 6275 | ✓ 6510 | ✓ 6230 |
| An execution result has a data entry (`dataPresent`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 11786 | ✓ 13388 | ✓ 12112 | ✓ 11213 | ✓ 11972 | ✓ 11858 | ✓ 11864 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 11786 | ✓ 13388 | ✓ 12112 | ✓ 11213 | ✓ 11972 | ✓ 11858 | ✓ 11864 |
| The response has no entries besides data, errors and extensions (`additionalEntries`) | MUST | [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ 11786 | ✓ 13388 | ✓ 12112 | ✓ 11213 | ✓ 11972 | ✓ 11858 | ✓ 11864 |
| extensions is a map (`extensions`) | MUST | [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) | – | – | – | – | – | – | – |
| Errors are maps with a message, and well-formed locations and extensions (`errorFormat`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 10283 | ✓ 11682 | ✓ 10295 | ✓ 9289 | ✓ 9964 | ✓ 10353 | ✓ 10155 |
| Execution errors have a path to a position the operation selects (`errorPath`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 10283 | ✓ 11682 | ✓ 10295 | ✗ 4658/9289 | ✓ 9964 | ✓ 10353 | ✓ 10155 |
| Paths use field names and integer list indices (`responsePosition`) | MUST (Oct 2021: SHOULD) | [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) | ✓ 1456 | ✓ 1456 | ✓ 1364 | ✓ 598 | ✓ 775 | ✓ 1456 | ✓ 1272 |
| Errors have no entries besides message, locations, path and extensions (`errorEntries`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 10283 | ✓ 11682 | ✓ 10295 | ✓ 9289 | ✓ 9964 | ✓ 10353 | ✓ 10155 |
| The adapter follows the kit's protocol (call types, settles) (`protocol`) | ADAPTER | — | ✓ 11786 | ✓ 13388 | ✓ 13450 | ✓ 11213 | ✓ 11972 | ✓ 11858 | ✓ 11864 |

### Execution: each fixture

The sections a fixture lists are the ones it exercises; its verdict is whether any of its cases failed a check.

| Fixture | Exercises | graphql-js 16.15.0 | graphql-js 17.1.0 | graphql-java 26.2 | async-graphql 7.0.17 (dynamic schema) | Hot Chocolate 15.1.21 | graphql-core 3.2.14 | graphql-ruby 2.6.15 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| [`fragments`](../fixtures/fragments.graphql) | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) [§3.13.1](https://spec.graphql.org/draft/#sec-skip) [§3.13.2](https://spec.graphql.org/draft/#sec-include) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 1536 | ✓ 1536 | ✓ 1576 | ✗ 819/1540 | ✓ 1576 | ✓ 1536 | ✓ 1576 |
| [`leaves`](../fixtures/leaves.graphql) | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 1700 | ✓ 1700 | ✓ 1700 | ✗ 787/1539 | ✗ 343/1700 | ✓ 1700 | ✗ 343/1700 |
| [`lists`](../fixtures/lists.graphql) | [§3.11](https://spec.graphql.org/draft/#sec-List) [§3.12.1](https://spec.graphql.org/draft/#sec-Combining-List-and-Non-Null) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2002 | ✓ 2002 | ✓ 1914 | ✗ 1184/1918 | ✗ 58/1878 | ✓ 2002 | ✓ 1842 |
| [`mutation`](../fixtures/mutation.graphql) | [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 1590 | ✓ 1590 | ✓ 1590 | ✗ 1038/1542 | ✓ 1750 | ✗ 510/1662 | ✓ 1750 |
| [`noPropagation`](../fixtures/noPropagation.graphql) | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | – needs error-propagation-off | ✓ 1602 | ✓ 1602 | – needs error-propagation-off | – needs error-propagation-off | – needs error-propagation-off | – needs error-propagation-off |
| [`nullPropagation`](../fixtures/nullPropagation.graphql) | [§3.12](https://spec.graphql.org/draft/#sec-Non-Null) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) | ✓ 1662 | ✓ 1662 | ✓ 1782 | ✗ 898/1538 | ✓ 1782 | ✓ 1662 | ✓ 1710 |
| [`subscription`](../fixtures/subscription.graphql) | [§6.2.3](https://spec.graphql.org/draft/#sec-Subscription) [§6.2.3.2](https://spec.graphql.org/draft/#sec-Response-Stream) | ✓ 1518 | ✓ 1518 | ✗ 1338/1522 | ✗ 722/1522 | ✓ 1522 | ✓ 1518 | ✓ 1522 |
| [`unions`](../fixtures/unions.graphql) | [§3.8](https://spec.graphql.org/draft/#sec-Unions) [§3.11](https://spec.graphql.org/draft/#sec-List) [§3.5](https://spec.graphql.org/draft/#sec-Scalars) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 1778 | ✓ 1778 | ✓ 1764 | ✗ 504/1614 | ✗ 77/1764 | ✓ 1778 | ✗ 42/1764 |

## Parse: each check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **~:** inconclusive (see the implementation's page).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | graphql-js 16.15.0 | graphql-js 17.1.0 | graphql-java 26.2 | async-graphql 7.0.17 (dynamic schema) | Hot Chocolate 15.1.21 | graphql-core 3.2.14 | graphql-ruby 2.6.15 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Source text is a sequence of SourceCharacter (`sourceText`) | MUST | [§2.1](https://spec.graphql.org/draft/#sec-Source-Text) | ✓ 33 | ✓ 33 | n/a | n/a | n/a | n/a | n/a |
| White space is tab and space only (`whiteSpace`) | MUST | [§2.1.1](https://spec.graphql.org/draft/#sec-White-Space) | ✓ 28 | ✓ 28 | n/a | n/a | n/a | n/a | n/a |
| Line terminators are LF, CR and CR LF only (`lineTerminators`) | MUST | [§2.1.2](https://spec.graphql.org/draft/#sec-Line-Terminators) | ✓ 31 | ✓ 31 | n/a | n/a | n/a | n/a | n/a |
| A comment runs to the end of its line (`comments`) | MUST | [§2.1.3](https://spec.graphql.org/draft/#sec-Comments) | ✓ 17 | ✓ 17 | n/a | n/a | n/a | n/a | n/a |
| Commas are insignificant (`insignificantCommas`) | MUST | [§2.1.4](https://spec.graphql.org/draft/#sec-Insignificant-Commas) | ✓ 5 | ✓ 5 | n/a | n/a | n/a | n/a | n/a |
| Every character outside ignored tokens is part of a token (`lexicalTokens`) | MUST | [§2.1.5](https://spec.graphql.org/draft/#sec-Lexical-Tokens) | ✓ 43 | ✓ 43 | n/a | n/a | n/a | n/a | n/a |
| Ignored tokens may appear before and after every token (`ignoredTokens`) | MUST | [§2.1.6](https://spec.graphql.org/draft/#sec-Ignored-Tokens) | ✓ 81 | ✓ 81 | n/a | n/a | n/a | n/a | n/a |
| Punctuators, and `...` only as a whole (`punctuators`) | MUST | [§2.1.7](https://spec.graphql.org/draft/#sec-Punctuators) | ✓ 40 | ✓ 40 | n/a | n/a | n/a | n/a | n/a |
| Names (`names`) | MUST | [§2.1.8](https://spec.graphql.org/draft/#sec-Names) | ✓ 14 | ✓ 14 | n/a | n/a | n/a | n/a | n/a |
| Descriptions on operations, fragments and variables, not on the query shorthand (`descriptions`) | MUST | [§2.2](https://spec.graphql.org/draft/#sec-Descriptions) | ✓ 100 | ✓ 100 | n/a | n/a | n/a | n/a | n/a |
| A document is one or more executable definitions (`document`) | MUST | [§2.3](https://spec.graphql.org/draft/#sec-Document) | ✓ 99 | ✓ 99 | n/a | n/a | n/a | n/a | n/a |
| Operation definitions and the query shorthand (`operations`) | MUST | [§2.4](https://spec.graphql.org/draft/#sec-Operations) | ✓ 100 | ✓ 100 | n/a | n/a | n/a | n/a | n/a |
| Selection sets, including empty ones (`selectionSets`) | MUST | [§2.5](https://spec.graphql.org/draft/#sec-Selection-Sets) | ✗ 8/95 | ✓ 95 | n/a | n/a | n/a | n/a | n/a |
| Fields (`fields`) | MUST | [§2.6](https://spec.graphql.org/draft/#sec-Fields) | ✓ 96 | ✓ 96 | n/a | n/a | n/a | n/a | n/a |
| Arguments (`arguments`) | MUST | [§2.7](https://spec.graphql.org/draft/#sec-Arguments) | ✓ 110 | ✓ 110 | n/a | n/a | n/a | n/a | n/a |
| Field aliases (`fieldAlias`) | MUST | [§2.8](https://spec.graphql.org/draft/#sec-Field-Alias) | ✓ 94 | ✓ 94 | n/a | n/a | n/a | n/a | n/a |
| Fragment definitions and fragment spreads (`fragments`) | MUST | [§2.9](https://spec.graphql.org/draft/#sec-Fragments) | ✓ 117 | ✓ 117 | n/a | n/a | n/a | n/a | n/a |
| Type conditions (`typeConditions`) | MUST | [§2.9.1](https://spec.graphql.org/draft/#sec-Type-Conditions) | ✓ 112 | ✓ 112 | n/a | n/a | n/a | n/a | n/a |
| Inline fragments (`inlineFragments`) | MUST | [§2.9.2](https://spec.graphql.org/draft/#sec-Inline-Fragments) | ✓ 100 | ✓ 100 | n/a | n/a | n/a | n/a | n/a |
| Input values, and no variables in constant values (`inputValues`) | MUST | [§2.10](https://spec.graphql.org/draft/#sec-Input-Values) | ✓ 122 | ✓ 122 | n/a | n/a | n/a | n/a | n/a |
| Int values (`intValue`) | MUST | [§2.10.1](https://spec.graphql.org/draft/#sec-Int-Value) | ✓ 42 | ✓ 42 | n/a | n/a | n/a | n/a | n/a |
| Float values (`floatValue`) | MUST | [§2.10.2](https://spec.graphql.org/draft/#sec-Float-Value) | ✓ 35 | ✓ 35 | n/a | n/a | n/a | n/a | n/a |
| Boolean values (`booleanValue`) | MUST | [§2.10.3](https://spec.graphql.org/draft/#sec-Boolean-Value) | ✓ 3 | ✓ 3 | n/a | n/a | n/a | n/a | n/a |
| String values and block strings (`stringValue`) | MUST | [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value) | ✗ 2/146 | ✗ 2/146 | n/a | n/a | n/a | n/a | n/a |
| Null value (`nullValue`) | MUST | [§2.10.5](https://spec.graphql.org/draft/#sec-Null-Value) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| Enum values (`enumValue`) | MUST | [§2.10.6](https://spec.graphql.org/draft/#sec-Enum-Value) | ✓ 10 | ✓ 10 | n/a | n/a | n/a | n/a | n/a |
| List values (`listValue`) | MUST | [§2.10.7](https://spec.graphql.org/draft/#sec-List-Value) | ✓ 101 | ✓ 101 | n/a | n/a | n/a | n/a | n/a |
| Input object values (`inputObjectValues`) | MUST | [§2.10.8](https://spec.graphql.org/draft/#sec-Input-Object-Values) | ✓ 107 | ✓ 107 | n/a | n/a | n/a | n/a | n/a |
| Variables and variable definitions (`variables`) | MUST | [§2.11](https://spec.graphql.org/draft/#sec-Variables) | ✓ 157 | ✓ 157 | n/a | n/a | n/a | n/a | n/a |
| Type references (`typeReferences`) | MUST | [§2.12](https://spec.graphql.org/draft/#sec-Type-References) | ✓ 102 | ✓ 102 | n/a | n/a | n/a | n/a | n/a |
| Directives (`directives`) | MUST | [§2.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 113 | ✓ 113 | n/a | n/a | n/a | n/a | n/a |

## Validate: each check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **~:** inconclusive (see the implementation's page).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | graphql-js 16.15.0 | graphql-js 17.1.0 | graphql-java 26.2 | async-graphql 7.0.17 (dynamic schema) | Hot Chocolate 15.1.21 | graphql-core 3.2.14 | graphql-ruby 2.6.15 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Executable Definitions (`executableDefinitions`) | MUST | [§5.1.1](https://spec.graphql.org/draft/#sec-Executable-Definitions) | ✓ 6 | ✓ 6 | n/a | n/a | n/a | n/a | n/a |
| Operation Type Existence (`operationTypeExistence`) | MUST | [§5.2.1.1](https://spec.graphql.org/draft/#sec-Operation-Type-Existence) | ✗ 12/27 | ✓ 27 | n/a | n/a | n/a | n/a | n/a |
| Operation Name Uniqueness (`operationNameUniqueness`) | MUST | [§5.2.2.1](https://spec.graphql.org/draft/#sec-Operation-Name-Uniqueness) | ✓ 10 | ✓ 10 | n/a | n/a | n/a | n/a | n/a |
| Lone Anonymous Operation (`loneAnonymousOperation`) | MUST | [§5.2.3.1](https://spec.graphql.org/draft/#sec-Lone-Anonymous-Operation) | ✓ 38 | ✓ 38 | n/a | n/a | n/a | n/a | n/a |
| Single Root Field (`singleRootField`) | MUST | [§5.2.4.1](https://spec.graphql.org/draft/#sec-Single-Root-Field) | ✗ 12/98 | ✓ 98 | n/a | n/a | n/a | n/a | n/a |
| Field Selections (`fieldSelections`) | MUST | [§5.3.1](https://spec.graphql.org/draft/#sec-Field-Selections) | ✓ 42 | ✓ 42 | n/a | n/a | n/a | n/a | n/a |
| Field Selection Merging (`fieldSelectionMerging`) | MUST | [§5.3.2](https://spec.graphql.org/draft/#sec-Field-Selection-Merging) | ✗ 23/1232 | ✗ 23/1232 | n/a | n/a | n/a | n/a | n/a |
| Leaf Field Selections (`leafFieldSelections`) | MUST | [§5.3.3](https://spec.graphql.org/draft/#sec-Leaf-Field-Selections) | ✓ 68 | ✓ 68 | n/a | n/a | n/a | n/a | n/a |
| Argument Names (`argumentNames`) | MUST | [§5.4.1](https://spec.graphql.org/draft/#sec-Argument-Names) | ✓ 18 | ✓ 18 | n/a | n/a | n/a | n/a | n/a |
| Argument Uniqueness (`argumentUniqueness`) | MUST | [§5.4.2](https://spec.graphql.org/draft/#sec-Argument-Uniqueness) | ✓ 9 | ✓ 9 | n/a | n/a | n/a | n/a | n/a |
| Required Arguments (`requiredArguments`) | MUST | [§5.4.3](https://spec.graphql.org/draft/#sec-Required-Arguments) | ✓ 20 | ✓ 20 | n/a | n/a | n/a | n/a | n/a |
| Fragment Name Uniqueness (`fragmentNameUniqueness`) | MUST | [§5.5.1.1](https://spec.graphql.org/draft/#sec-Fragment-Name-Uniqueness) | ✓ 14 | ✓ 14 | n/a | n/a | n/a | n/a | n/a |
| Fragment Spread Type Existence (`fragmentSpreadTypeExistence`) | MUST | [§5.5.1.2](https://spec.graphql.org/draft/#sec-Fragment-Spread-Type-Existence) | ✓ 22 | ✓ 22 | n/a | n/a | n/a | n/a | n/a |
| Fragments on Object, Interface or Union Types (`fragmentsOnObjectInterfaceOrUnionTypes`) | MUST | [§5.5.1.3](https://spec.graphql.org/draft/#sec-Fragments-on-Object-Interface-or-Union-Types) | ✓ 30 | ✓ 30 | n/a | n/a | n/a | n/a | n/a |
| Fragments Must Be Used (`fragmentsMustBeUsed`) | MUST | [§5.5.1.4](https://spec.graphql.org/draft/#sec-Fragments-Must-Be-Used) | ✓ 100 | ✓ 100 | n/a | n/a | n/a | n/a | n/a |
| Fragment Spread Target Defined (`fragmentSpreadTargetDefined`) | MUST | [§5.5.2.1](https://spec.graphql.org/draft/#sec-Fragment-Spread-Target-Defined) | ✓ 14 | ✓ 14 | n/a | n/a | n/a | n/a | n/a |
| Fragment Spreads Must Not Form Cycles (`fragmentSpreadsMustNotFormCycles`) | MUST | [§5.5.2.2](https://spec.graphql.org/draft/#sec-Fragment-Spreads-Must-Not-Form-Cycles) | ✓ 57 | ✓ 57 | n/a | n/a | n/a | n/a | n/a |
| Fragment Spread Is Possible (`fragmentSpreadIsPossible`) | MUST | [§5.5.2.3](https://spec.graphql.org/draft/#sec-Fragment-Spread-Is-Possible) | ✗ 4/71 | ✗ 4/71 | n/a | n/a | n/a | n/a | n/a |
| Values of Correct Type (`valuesOfCorrectType`) | MUST | [§5.6.1](https://spec.graphql.org/draft/#sec-Values-of-Correct-Type) | ✓ 342 | ✓ 342 | n/a | n/a | n/a | n/a | n/a |
| Input Object Field Names (`inputObjectFieldNames`) | MUST | [§5.6.2](https://spec.graphql.org/draft/#sec-Input-Object-Field-Names) | ✓ 12 | ✓ 12 | n/a | n/a | n/a | n/a | n/a |
| Input Object Field Uniqueness (`inputObjectFieldUniqueness`) | MUST | [§5.6.3](https://spec.graphql.org/draft/#sec-Input-Object-Field-Uniqueness) | ✓ 10 | ✓ 10 | n/a | n/a | n/a | n/a | n/a |
| Input Object Required Fields (`inputObjectRequiredFields`) | MUST | [§5.6.4](https://spec.graphql.org/draft/#sec-Input-Object-Required-Fields) | ✓ 9 | ✓ 9 | n/a | n/a | n/a | n/a | n/a |
| Directives Are Defined (`directivesAreDefined`) | MUST | [§5.7.1](https://spec.graphql.org/draft/#sec-Directives-Are-Defined) | ✓ 42 | ✓ 42 | n/a | n/a | n/a | n/a | n/a |
| Directives Are in Valid Locations (`directivesAreInValidLocations`) | MUST | [§5.7.2](https://spec.graphql.org/draft/#sec-Directives-Are-in-Valid-Locations) | ✓ 29 | ✓ 29 | n/a | n/a | n/a | n/a | n/a |
| Directives Are Unique per Location (`directivesAreUniquePerLocation`) | MUST | [§5.7.3](https://spec.graphql.org/draft/#sec-Directives-Are-Unique-per-Location) | ✓ 13 | ✓ 13 | n/a | n/a | n/a | n/a | n/a |
| Variable Uniqueness (`variableUniqueness`) | MUST | [§5.8.1](https://spec.graphql.org/draft/#sec-Variable-Uniqueness) | ✓ 12 | ✓ 12 | n/a | n/a | n/a | n/a | n/a |
| Variables Are Input Types (`variablesAreInputTypes`) | MUST | [§5.8.2](https://spec.graphql.org/draft/#sec-Variables-Are-Input-Types) | ✓ 10 | ✓ 10 | n/a | n/a | n/a | n/a | n/a |
| All Variable Uses Defined (`allVariableUsesDefined`) | MUST | [§5.8.3](https://spec.graphql.org/draft/#sec-All-Variable-Uses-Defined) | ✓ 27 | ✓ 27 | n/a | n/a | n/a | n/a | n/a |
| All Variables Used (`allVariablesUsed`) | MUST | [§5.8.4](https://spec.graphql.org/draft/#sec-All-Variables-Used) | ✓ 27 | ✓ 27 | n/a | n/a | n/a | n/a | n/a |
| All Variable Usages Are Allowed (`allVariableUsagesAreAllowed`) | MUST | [§5.8.5](https://spec.graphql.org/draft/#sec-All-Variable-Usages-Are-Allowed) | ✗ 3/703 | ✗ 3/703 | n/a | n/a | n/a | n/a | n/a |

## Coerce: each check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **~:** inconclusive (see the implementation's page).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | graphql-js 16.15.0 | graphql-js 17.1.0 | graphql-java 26.2 | async-graphql 7.0.17 (dynamic schema) | Hot Chocolate 15.1.21 | graphql-core 3.2.14 | graphql-ruby 2.6.15 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Int accepts only integer input values (`int`) | MUST | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) | ✓ 342 | ✓ 342 | n/a | n/a | n/a | n/a | n/a |
| Int rejects integers outside the signed 32-bit range (`intRange`) | SHOULD | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) | ✓ 32 | ✓ 32 | n/a | n/a | n/a | n/a | n/a |
| Float accepts integer and float input values a finite double holds (`float`) | MUST | [§3.5.2](https://spec.graphql.org/draft/#sec-Float) | ✗ 3/94 | ✗ 3/94 | n/a | n/a | n/a | n/a | n/a |
| String accepts only valid Unicode string input values (`string`) | MUST | [§3.5.3](https://spec.graphql.org/draft/#sec-String) | ✗ 1/94 | ✗ 1/94 | n/a | n/a | n/a | n/a | n/a |
| Boolean accepts only boolean input values (`boolean`) | MUST | [§3.5.4](https://spec.graphql.org/draft/#sec-Boolean) | ✓ 94 | ✓ 94 | n/a | n/a | n/a | n/a | n/a |
| String and integer input values are coerced to ID strings (`idCoerced`) | SHOULD | [§3.5.5](https://spec.graphql.org/draft/#sec-ID) | ! 3/29 | ! 3/29 | n/a | n/a | n/a | n/a | n/a |
| ID rejects input values other than strings and integers (`id`) | MUST | [§3.5.5](https://spec.graphql.org/draft/#sec-ID) | ✗ 1/65 | ✗ 1/65 | n/a | n/a | n/a | n/a | n/a |
| Enums accept their own values: enum literals, and strings in variables (`enum`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✓ 188 | ✓ 188 | n/a | n/a | n/a | n/a | n/a |
| Input objects: an object with only defined fields, field defaults, required fields (`inputObject`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✗ 4/413 | ✓ 413 | n/a | n/a | n/a | n/a | n/a |
| OneOf input objects take exactly one non-null field (`oneOf`) | MUST | [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | – | – | n/a | n/a | n/a | n/a | n/a |
| Lists: each item coerced, a single value wrapped in a list (`list`) | MUST | [§3.11](https://spec.graphql.org/draft/#sec-List) | ✗ 1/489 | ✓ 489 | n/a | n/a | n/a | n/a | n/a |
| Non-Null rejects null (`nonNull`) | MUST | [§3.12](https://spec.graphql.org/draft/#sec-Non-Null) | ✓ 4 | ✓ 4 | n/a | n/a | n/a | n/a | n/a |
| CoerceVariableValues: defaults, missing and null values, and failures as request errors (`variables`) | MUST | [§6.1.2](https://spec.graphql.org/draft/#sec-Coercing-Variable-Values) | ✓ 897 | ✓ 897 | n/a | n/a | n/a | n/a | n/a |
| CoerceArgumentValues: defaults, missing variables, and failures as field errors (`arguments`) | MUST | [§6.4.1](https://spec.graphql.org/draft/#sec-Coercing-Field-Arguments) | ✓ 820 | ✓ 820 | n/a | n/a | n/a | n/a | n/a |

## Schema: each check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **~:** inconclusive (see the implementation's page).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | graphql-js 16.15.0 | graphql-js 17.1.0 | graphql-java 26.2 | async-graphql 7.0.17 (dynamic schema) | Hot Chocolate 15.1.21 | graphql-core 3.2.14 | graphql-ruby 2.6.15 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| No two types have the same name (`typeNamesUnique`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| No type is named like a built-in type (`typeNameNotBuiltin`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✗ 2/4 | ✗ 2/4 | n/a | n/a | n/a | n/a | n/a |
| No type name begins with __ (`typeNameReserved`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| No two directives have the same name (`directiveNamesUnique`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| No directive name begins with __ (`directiveNameReserved`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| The query root operation type is provided (`queryRootProvided`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✓ 4 | ✓ 4 | n/a | n/a | n/a | n/a | n/a |
| Root operation types are object types (`rootTypesAreObjects`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✓ 6 | ✓ 6 | n/a | n/a | n/a | n/a | n/a |
| Root operation types are all different (`rootTypesDifferent`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✗ 2/4 | ✓ 4 | n/a | n/a | n/a | n/a | n/a |
| An object or interface type defines one or more fields (`fieldsDefined`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 4 | ✓ 4 | n/a | n/a | n/a | n/a | n/a |
| Field names are unique within a type (`fieldNamesUnique`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 4 | ✓ 4 | n/a | n/a | n/a | n/a | n/a |
| No field name begins with __ (`fieldNameReserved`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| Fields return output types (`fieldOutputType`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✓ 4 | ✓ 4 | n/a | n/a | n/a | n/a | n/a |
| No argument name begins with __ (`argNameReserved`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 4 | ✓ 4 | n/a | n/a | n/a | n/a | n/a |
| Argument names are unique within a field or directive (`argNamesUnique`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 4 | ✓ 4 | n/a | n/a | n/a | n/a | n/a |
| Arguments accept input types (`argInputType`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✓ 6 | ✓ 6 | n/a | n/a | n/a | n/a | n/a |
| A required argument isn't deprecated (`requiredArgNotDeprecated`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✓ 8 | ✓ 8 | n/a | n/a | n/a | n/a | n/a |
| An object field argument's default value coerces to its type (`argDefaultCompatible`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 9/18 | ✓ 18 | n/a | n/a | n/a | n/a | n/a |
| A type implements each interface once (`implementsUnique`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| A type implements only interface types (`implementsInterfaces`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| An interface doesn't implement itself (`implementsItself`) | MUST | [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| A type also implements the interfaces its interfaces implement (`implTransitive`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 4 | ✓ 4 | n/a | n/a | n/a | n/a | n/a |
| An implementation has every field of the interface (`implFieldProvided`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| An implementation's field has every argument of the interface field (`implArgProvided`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| An implementation's field arguments have the interface's argument types (`implArgInvariant`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 4 | ✓ 4 | n/a | n/a | n/a | n/a | n/a |
| An implementation's additional arguments aren't required (`implExtraArgOptional`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| An implementation's field returns a subtype of the interface field's type (`implFieldCovariant`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 8 | ✓ 8 | n/a | n/a | n/a | n/a | n/a |
| A deprecated implementation field implements a deprecated field (`implDeprecation`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 1/2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| A union has one or more member types (`unionMembersDefined`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| A union's member types are unique (`unionMembersUnique`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| A union's member types are object types (`unionMembersObjects`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✓ 6 | ✓ 6 | n/a | n/a | n/a | n/a | n/a |
| An enum has one or more values (`enumValuesDefined`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| An enum's values are unique (`enumValuesUnique`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| No enum value begins with __ (`enumValueNameReserved`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| An input object has one or more fields (`inputFieldsDefined`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| Input field names are unique within an input object (`inputFieldNamesUnique`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| No input field name begins with __ (`inputFieldNameReserved`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| Input fields accept input types (`inputFieldInputType`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| A required input field isn't deprecated (`requiredInputFieldNotDeprecated`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| A OneOf input object's fields are nullable (`oneOfFieldNullable`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| A OneOf input object's fields have no default value (`oneOfFieldNoDefault`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 2 | ✓ 2 | n/a | n/a | n/a | n/a | n/a |
| An input object can be given a finite value (`inputObjectUnbreakableCycle`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✗ 2/10 | ✓ 10 | n/a | n/a | n/a | n/a | n/a |
| Input object default values don't form a cycle (`inputObjectDefaultValueCycle`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✗ 3/8 | ✓ 8 | n/a | n/a | n/a | n/a | n/a |
| A directive has one or more locations (`directiveLocationsDefined`) | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | – | – | n/a | n/a | n/a | n/a | n/a |
| A directive definition doesn't use itself (`directiveUsesItself`) | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 1/2 | ✗ 1/2 | n/a | n/a | n/a | n/a | n/a |
| A directive definition doesn't reference itself through a type or directive (`directiveReferencesItselfIndirectly`) | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 3/6 | ✗ 3/6 | n/a | n/a | n/a | n/a | n/a |

## Introspect: each check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **~:** inconclusive (see the implementation's page).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | graphql-js 16.15.0 | graphql-js 17.1.0 | graphql-java 26.2 | async-graphql 7.0.17 (dynamic schema) | Hot Chocolate 15.1.21 | graphql-core 3.2.14 | graphql-ruby 2.6.15 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| The introspection query executes, and its result has every field it selects (`executes`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✗ 2/22 | ✓ 22 | n/a | n/a | n/a | n/a | n/a |
| queryType, mutationType and subscriptionType are the root operation types (`roots`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✓ 20 | ✓ 22 | n/a | n/a | n/a | n/a | n/a |
| types is the set of all named types (`types`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) | ✓ 20 | ✓ 22 | n/a | n/a | n/a | n/a | n/a |
| types has the built-in scalars the schema references, and no others (`builtinScalars`) | MUST | [§3.5](https://spec.graphql.org/draft/#sec-Scalars) [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) | ✓ 20 | ✓ 22 | n/a | n/a | n/a | n/a | n/a |
| Each __Type has its type's kind, and its fields are null exactly where that kind requires (`typeKinds`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) | ✓ 20 | ✓ 22 | n/a | n/a | n/a | n/a | n/a |
| An object's or interface's fields, with their types (`fields`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) | ✓ 20 | ✓ 22 | n/a | n/a | n/a | n/a | n/a |
| Field and directive arguments, with their types (`arguments`) | MUST | [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) | ✓ 20 | ✓ 22 | n/a | n/a | n/a | n/a | n/a |
| defaultValue encodes the default value, and is null without one (`defaultValue`) | MUST | [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | ✓ 20 | ✓ 22 | n/a | n/a | n/a | n/a | n/a |
| An input object's inputFields, with their types (`inputFields`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | ✓ 20 | ✓ 22 | n/a | n/a | n/a | n/a | n/a |
| An enum's enumValues (`enumValues`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) | ✓ 20 | ✓ 22 | n/a | n/a | n/a | n/a | n/a |
| interfaces, and possibleTypes for unions and interfaces (`interfaces`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) | ✓ 20 | ✓ 22 | n/a | n/a | n/a | n/a | n/a |
| isDeprecated, deprecationReason and includeDeprecated; @deprecated is provided (`deprecation`) | MUST | [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✓ 20 | ✓ 22 | n/a | n/a | n/a | n/a | n/a |
| specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null (`specifiedByURL`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) | ✓ 20 | ✓ 22 | n/a | n/a | n/a | n/a | n/a |
| isOneOf is true exactly for OneOf input objects (`isOneOf`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 20 | ✓ 22 | n/a | n/a | n/a | n/a | n/a |
| Descriptions are the schema's (`descriptions`) | MUST | [§3.2](https://spec.graphql.org/draft/#sec-Type-System-Descriptions) [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 20 | ✓ 22 | n/a | n/a | n/a | n/a | n/a |
| directives describes the schema's own directives: name, locations, isRepeatable (`directives`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) | ✓ 20 | ✓ 22 | n/a | n/a | n/a | n/a | n/a |
| @skip, @include, @specifiedBy and @oneOf are provided (`builtinDirectives`) | SHOULD | [§3.13.1](https://spec.graphql.org/draft/#sec-skip) [§3.13.2](https://spec.graphql.org/draft/#sec-include) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) [§3.13.5](https://spec.graphql.org/draft/#sec-oneOf) | ✓ 20 | ✓ 22 | n/a | n/a | n/a | n/a | n/a |
| The introspection types and built-in directives are as the spec defines them (`builtinDefinitions`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 20/20 | ✗ 22/22 | n/a | n/a | n/a | n/a | n/a |
| __typename names the root type, and no fields list includes it (`typename`) | MUST | [§4.1](https://spec.graphql.org/draft/#sec-Type-Name-Introspection) | ✓ 20 | ✓ 22 | n/a | n/a | n/a | n/a | n/a |
| Fields, arguments, enum values, directives, members and interfaces come in source order (`order`) | SHOULD | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 20 | ✓ 22 | n/a | n/a | n/a | n/a | n/a |
| Anything else Introspection!Matches requires (`other`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 20 | ✓ 22 | n/a | n/a | n/a | n/a | n/a |

## By spec section

A section's verdict comes from the checks that cite it, and names the ones that failed. Sections that fixtures exercise but no check targets have no verdict of their own; their fixtures' verdicts are above.

| Section | graphql-js 16.15.0 | graphql-js 17.1.0 | graphql-java 26.2 | async-graphql 7.0.17 (dynamic schema) | Hot Chocolate 15.1.21 | graphql-core 3.2.14 | graphql-ruby 2.6.15 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| [§2.1](https://spec.graphql.org/draft/#sec-Source-Text) Source Text | ✓ | ✓ |   |   |   |   |   |
| [§2.1.1](https://spec.graphql.org/draft/#sec-White-Space) White Space | ✓ | ✓ |   |   |   |   |   |
| [§2.1.2](https://spec.graphql.org/draft/#sec-Line-Terminators) Line Terminators | ✓ | ✓ |   |   |   |   |   |
| [§2.1.3](https://spec.graphql.org/draft/#sec-Comments) Comments | ✓ | ✓ |   |   |   |   |   |
| [§2.1.4](https://spec.graphql.org/draft/#sec-Insignificant-Commas) Insignificant Commas | ✓ | ✓ |   |   |   |   |   |
| [§2.1.5](https://spec.graphql.org/draft/#sec-Lexical-Tokens) Lexical Tokens | ✓ | ✓ |   |   |   |   |   |
| [§2.1.6](https://spec.graphql.org/draft/#sec-Ignored-Tokens) Ignored Tokens | ✓ | ✓ |   |   |   |   |   |
| [§2.1.7](https://spec.graphql.org/draft/#sec-Punctuators) Punctuators | ✓ | ✓ |   |   |   |   |   |
| [§2.1.8](https://spec.graphql.org/draft/#sec-Names) Names | ✓ | ✓ |   |   |   |   |   |
| [§2.2](https://spec.graphql.org/draft/#sec-Descriptions) Descriptions | ✓ | ✓ |   |   |   |   |   |
| [§2.3](https://spec.graphql.org/draft/#sec-Document) Document | ✓ | ✓ |   |   |   |   |   |
| [§2.4](https://spec.graphql.org/draft/#sec-Operations) Operations | ✓ | ✓ |   |   |   |   |   |
| [§2.5](https://spec.graphql.org/draft/#sec-Selection-Sets) Selection Sets | ✗ `selectionSets` | ✓ |   |   |   |   |   |
| [§2.6](https://spec.graphql.org/draft/#sec-Fields) Fields | ✓ | ✓ |   |   |   |   |   |
| [§2.7](https://spec.graphql.org/draft/#sec-Arguments) Arguments | ✓ | ✓ |   |   |   |   |   |
| [§2.8](https://spec.graphql.org/draft/#sec-Field-Alias) Field Alias | ✓ | ✓ |   |   |   |   |   |
| [§2.9](https://spec.graphql.org/draft/#sec-Fragments) Fragments | ✓ | ✓ |   |   |   |   |   |
| [§2.9.1](https://spec.graphql.org/draft/#sec-Type-Conditions) Type Conditions | ✓ | ✓ |   |   |   |   |   |
| [§2.9.2](https://spec.graphql.org/draft/#sec-Inline-Fragments) Inline Fragments | ✓ | ✓ |   |   |   |   |   |
| [§2.10](https://spec.graphql.org/draft/#sec-Input-Values) Input Values | ✓ | ✓ |   |   |   |   |   |
| [§2.10.1](https://spec.graphql.org/draft/#sec-Int-Value) Int Value | ✓ | ✓ |   |   |   |   |   |
| [§2.10.2](https://spec.graphql.org/draft/#sec-Float-Value) Float Value | ✓ | ✓ |   |   |   |   |   |
| [§2.10.3](https://spec.graphql.org/draft/#sec-Boolean-Value) Boolean Value | ✓ | ✓ |   |   |   |   |   |
| [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value) String Value | ✗ `stringValue` | ✗ `stringValue` |   |   |   |   |   |
| [§2.10.5](https://spec.graphql.org/draft/#sec-Null-Value) Null Value | ✓ | ✓ |   |   |   |   |   |
| [§2.10.6](https://spec.graphql.org/draft/#sec-Enum-Value) Enum Value | ✓ | ✓ |   |   |   |   |   |
| [§2.10.7](https://spec.graphql.org/draft/#sec-List-Value) List Value | ✓ | ✓ |   |   |   |   |   |
| [§2.10.8](https://spec.graphql.org/draft/#sec-Input-Object-Values) Input Object Values | ✓ | ✓ |   |   |   |   |   |
| [§2.11](https://spec.graphql.org/draft/#sec-Variables) Variables | ✓ | ✓ |   |   |   |   |   |
| [§2.12](https://spec.graphql.org/draft/#sec-Type-References) Type References | ✓ | ✓ |   |   |   |   |   |
| [§2.13](https://spec.graphql.org/draft/#sec-Directives) Directives | ✓ | ✓ |   |   |   |   |   |
| [§3.2](https://spec.graphql.org/draft/#sec-Type-System-Descriptions) Type System Descriptions | ✓ | ✓ |   |   |   |   |   |
| [§3.3](https://spec.graphql.org/draft/#sec-Schema) Schema | ✗ `typeNameNotBuiltin` | ✗ `typeNameNotBuiltin` |   |   |   |   |   |
| [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) Root Operation Types | ✗ `rootTypesDifferent` | ✓ |   |   |   |   |   |
| [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) Input and Output Types | ✓ | ✓ |   |   |   |   |   |
| [§3.5](https://spec.graphql.org/draft/#sec-Scalars) Scalars | ✓ | ✓ |   |   |   |   |   |
| [§3.5.1](https://spec.graphql.org/draft/#sec-Int) Int | ✓ | ✓ | ✓ | ✓ | ✗ `resultCoercion` | ✓ | ✗ `resultCoercion` |
| [§3.5.2](https://spec.graphql.org/draft/#sec-Float) Float | ✗ `float` | ✗ `float` | ✓ | ✓ | ✗ `resultCoercion` | ✓ | ✗ `resultCoercion` |
| [§3.5.3](https://spec.graphql.org/draft/#sec-String) String | ✗ `string` | ✗ `string` |   |   |   |   |   |
| [§3.5.4](https://spec.graphql.org/draft/#sec-Boolean) Boolean | ✓ | ✓ |   |   |   |   |   |
| [§3.5.5](https://spec.graphql.org/draft/#sec-ID) ID | ✗ `id` | ✗ `id` |   |   |   |   |   |
| [§3.6](https://spec.graphql.org/draft/#sec-Objects) Objects | ✗ `argDefaultCompatible` `implDeprecation` | ✓ |   |   |   |   |   |
| [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) Interfaces | ✓ | ✓ |   |   |   |   |   |
| [§3.8](https://spec.graphql.org/draft/#sec-Unions) Unions | ✓ | ✓ |   |   |   |   |   |
| [§3.9](https://spec.graphql.org/draft/#sec-Enums) Enums | ✓ | ✓ | ✓ | ✓ | ✗ `resultCoercion` | ✓ | ✗ `resultCoercion` |
| [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) Input Objects | ✗ `inputObject` `inputObjectUnbreakableCycle` `inputObjectDefaultValueCycle` | ✓ |   |   |   |   |   |
| [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) OneOf Input Objects | ✓ | ✓ |   |   |   |   |   |
| [§3.11](https://spec.graphql.org/draft/#sec-List) List | ✗ `list` | ✓ |   |   |   |   |   |
| [§3.12](https://spec.graphql.org/draft/#sec-Non-Null) Non-Null | ✓ | ✓ |   |   |   |   |   |
| [§3.13](https://spec.graphql.org/draft/#sec-Directives) Directives | ✗ `directiveUsesItself` `directiveReferencesItselfIndirectly` `builtinDefinitions` | ✗ `directiveUsesItself` `directiveReferencesItselfIndirectly` `builtinDefinitions` |   |   |   |   |   |
| [§3.13.1](https://spec.graphql.org/draft/#sec-skip) @skip | ✓ | ✓ |   |   |   |   |   |
| [§3.13.2](https://spec.graphql.org/draft/#sec-include) @include | ✓ | ✓ |   |   |   |   |   |
| [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) @deprecated | ✓ | ✓ |   |   |   |   |   |
| [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) @specifiedBy | ✓ | ✓ |   |   |   |   |   |
| [§3.13.5](https://spec.graphql.org/draft/#sec-oneOf) @oneOf | ✓ | ✓ |   |   |   |   |   |
| [§4.1](https://spec.graphql.org/draft/#sec-Type-Name-Introspection) Type Name Introspection | ✓ | ✓ |   |   |   |   |   |
| [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) Schema Introspection | ✗ `executes` `builtinDefinitions` | ✗ `builtinDefinitions` |   |   |   |   |   |
| [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) The \_\_Schema Type | ✓ | ✓ |   |   |   |   |   |
| [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) The \_\_Type Type | ✓ | ✓ |   |   |   |   |   |
| [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) The \_\_Field Type | ✓ | ✓ |   |   |   |   |   |
| [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) The \_\_InputValue Type | ✓ | ✓ |   |   |   |   |   |
| [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) The \_\_EnumValue Type | ✓ | ✓ |   |   |   |   |   |
| [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) The \_\_Directive Type | ✓ | ✓ |   |   |   |   |   |
| [§5.1.1](https://spec.graphql.org/draft/#sec-Executable-Definitions) Executable Definitions | ✓ | ✓ |   |   |   |   |   |
| [§5.2.1.1](https://spec.graphql.org/draft/#sec-Operation-Type-Existence) Operation Type Existence | ✗ `operationTypeExistence` | ✓ |   |   |   |   |   |
| [§5.2.2.1](https://spec.graphql.org/draft/#sec-Operation-Name-Uniqueness) Operation Name Uniqueness | ✓ | ✓ |   |   |   |   |   |
| [§5.2.3.1](https://spec.graphql.org/draft/#sec-Lone-Anonymous-Operation) Lone Anonymous Operation | ✓ | ✓ |   |   |   |   |   |
| [§5.2.4.1](https://spec.graphql.org/draft/#sec-Single-Root-Field) Single Root Field | ✗ `singleRootField` | ✓ |   |   |   |   |   |
| [§5.3.1](https://spec.graphql.org/draft/#sec-Field-Selections) Field Selections | ✓ | ✓ |   |   |   |   |   |
| [§5.3.2](https://spec.graphql.org/draft/#sec-Field-Selection-Merging) Field Selection Merging | ✗ `fieldSelectionMerging` | ✗ `fieldSelectionMerging` |   |   |   |   |   |
| [§5.3.3](https://spec.graphql.org/draft/#sec-Leaf-Field-Selections) Leaf Field Selections | ✓ | ✓ |   |   |   |   |   |
| [§5.4.1](https://spec.graphql.org/draft/#sec-Argument-Names) Argument Names | ✓ | ✓ |   |   |   |   |   |
| [§5.4.2](https://spec.graphql.org/draft/#sec-Argument-Uniqueness) Argument Uniqueness | ✓ | ✓ |   |   |   |   |   |
| [§5.4.3](https://spec.graphql.org/draft/#sec-Required-Arguments) Required Arguments | ✓ | ✓ |   |   |   |   |   |
| [§5.5.1.1](https://spec.graphql.org/draft/#sec-Fragment-Name-Uniqueness) Fragment Name Uniqueness | ✓ | ✓ |   |   |   |   |   |
| [§5.5.1.2](https://spec.graphql.org/draft/#sec-Fragment-Spread-Type-Existence) Fragment Spread Type Existence | ✓ | ✓ |   |   |   |   |   |
| [§5.5.1.3](https://spec.graphql.org/draft/#sec-Fragments-on-Object-Interface-or-Union-Types) Fragments on Object, Interface or Union Types | ✓ | ✓ |   |   |   |   |   |
| [§5.5.1.4](https://spec.graphql.org/draft/#sec-Fragments-Must-Be-Used) Fragments Must Be Used | ✓ | ✓ |   |   |   |   |   |
| [§5.5.2.1](https://spec.graphql.org/draft/#sec-Fragment-Spread-Target-Defined) Fragment Spread Target Defined | ✓ | ✓ |   |   |   |   |   |
| [§5.5.2.2](https://spec.graphql.org/draft/#sec-Fragment-Spreads-Must-Not-Form-Cycles) Fragment Spreads Must Not Form Cycles | ✓ | ✓ |   |   |   |   |   |
| [§5.5.2.3](https://spec.graphql.org/draft/#sec-Fragment-Spread-Is-Possible) Fragment Spread Is Possible | ✗ `fragmentSpreadIsPossible` | ✗ `fragmentSpreadIsPossible` |   |   |   |   |   |
| [§5.6.1](https://spec.graphql.org/draft/#sec-Values-of-Correct-Type) Values of Correct Type | ✓ | ✓ |   |   |   |   |   |
| [§5.6.2](https://spec.graphql.org/draft/#sec-Input-Object-Field-Names) Input Object Field Names | ✓ | ✓ |   |   |   |   |   |
| [§5.6.3](https://spec.graphql.org/draft/#sec-Input-Object-Field-Uniqueness) Input Object Field Uniqueness | ✓ | ✓ |   |   |   |   |   |
| [§5.6.4](https://spec.graphql.org/draft/#sec-Input-Object-Required-Fields) Input Object Required Fields | ✓ | ✓ |   |   |   |   |   |
| [§5.7.1](https://spec.graphql.org/draft/#sec-Directives-Are-Defined) Directives Are Defined | ✓ | ✓ |   |   |   |   |   |
| [§5.7.2](https://spec.graphql.org/draft/#sec-Directives-Are-in-Valid-Locations) Directives Are in Valid Locations | ✓ | ✓ |   |   |   |   |   |
| [§5.7.3](https://spec.graphql.org/draft/#sec-Directives-Are-Unique-per-Location) Directives Are Unique per Location | ✓ | ✓ |   |   |   |   |   |
| [§5.8.1](https://spec.graphql.org/draft/#sec-Variable-Uniqueness) Variable Uniqueness | ✓ | ✓ |   |   |   |   |   |
| [§5.8.2](https://spec.graphql.org/draft/#sec-Variables-Are-Input-Types) Variables Are Input Types | ✓ | ✓ |   |   |   |   |   |
| [§5.8.3](https://spec.graphql.org/draft/#sec-All-Variable-Uses-Defined) All Variable Uses Defined | ✓ | ✓ |   |   |   |   |   |
| [§5.8.4](https://spec.graphql.org/draft/#sec-All-Variables-Used) All Variables Used | ✓ | ✓ |   |   |   |   |   |
| [§5.8.5](https://spec.graphql.org/draft/#sec-All-Variable-Usages-Are-Allowed) All Variable Usages Are Allowed | ✗ `allVariableUsagesAreAllowed` | ✗ `allVariableUsagesAreAllowed` |   |   |   |   |   |
| [§6.1.2](https://spec.graphql.org/draft/#sec-Coercing-Variable-Values) Coercing Variable Values | ✓ | ✓ |   |   |   |   |   |
| [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) Mutation | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ `calledSerially` | ✓ |
| [§6.2.3.2](https://spec.graphql.org/draft/#sec-Response-Stream) Response Stream | ✓ | ✓ | ✗ `eventYieldsResult` | ✓ | ✓ | ✓ | ✓ |
| [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) Field Collection | ✓ | ✓ | ✓ | ✗ `dataMatches` `callsOnce` | ✓ | ✓ | ✓ |
| [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) Executing Collected Fields | ✓ | ✓ | ✓ | ✗ `complete` `callsOnce` `callsReachable` | ✓ | ✓ | ✓ |
| [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) Normal and Serial Execution | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ `calledSerially` | ✓ |
| [§6.4.1](https://spec.graphql.org/draft/#sec-Coercing-Field-Arguments) Coercing Field Arguments | ✓ | ✓ |   |   |   |   |   |
| [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) Value Completion | ✓ | ✓ | ✓ | ✗ `dataMatches` `callsReachable` | ✗ `resultCoercion` | ✓ | ✗ `resultCoercion` |
| [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) Handling Execution Errors | ✓ | ✓ | ✓ | ✗ `dataMatches` `errorsWereRaised` `errorsInsideNulls` `nullsExplained` | ✗ `nullsExplained` | ✓ | ✓ |
| [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) Execution Result | ✓ | ✓ | ✓ | ✗ `complete` `nullsExplained` | ✗ `nullsExplained` | ✓ | ✓ |
| [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) Response Position | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| [§7.1.5](https://spec.graphql.org/draft/#sec-Data) Data | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) Errors | ✓ | ✓ | ✓ | ✗ `errorsWereRaised` `errorPath` | ✓ | ✓ | ✓ |
| [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) Extensions | – | – | – | – | – | – | – |
| [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) Additional Entries | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering) Serialized Map Ordering | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Exercised by fixtures, without a check of their own: [§3.12.1](https://spec.graphql.org/draft/#sec-Combining-List-and-Non-Null) Combining List and Non-Null, [§6.2.3](https://spec.graphql.org/draft/#sec-Subscription) Subscription.

## Not checked by the kit yet

48 sections of 159. The references in [`specs/`](../specs) cover most of them, but are checked against graphql-js only, by the differential scripts (see [What is checked](../README.md#what-is-checked)).

- [§2.14](https://spec.graphql.org/draft/#sec-Schema-Coordinates) Schema Coordinates
- [§3.1](https://spec.graphql.org/draft/#sec-Type-System-Extensions) Type System Extensions
- [§3.3.2](https://spec.graphql.org/draft/#sec-Schema-Extension) Schema Extension
- [§3.4](https://spec.graphql.org/draft/#sec-Types) Types
- [§3.4.1](https://spec.graphql.org/draft/#sec-Wrapping-Types) Wrapping Types
- [§3.4.3](https://spec.graphql.org/draft/#sec-Type-Extensions) Type Extensions
- [§3.5.6](https://spec.graphql.org/draft/#sec-Scalar-Extensions) Scalar Extensions
- [§3.6.1](https://spec.graphql.org/draft/#sec-Field-Arguments) Field Arguments
- [§3.6.2](https://spec.graphql.org/draft/#sec-Field-Deprecation) Field Deprecation
- [§3.6.3](https://spec.graphql.org/draft/#sec-Object-Extensions) Object Extensions
- [§3.7.1](https://spec.graphql.org/draft/#sec-Interface-Extensions) Interface Extensions
- [§3.8.1](https://spec.graphql.org/draft/#sec-Union-Extensions) Union Extensions
- [§3.9.1](https://spec.graphql.org/draft/#sec-Enum-Extensions) Enum Extensions
- [§3.10.2](https://spec.graphql.org/draft/#sec-Input-Object-Extensions) Input Object Extensions
- [§3.13.6](https://spec.graphql.org/draft/#sec-Directive-Extensions) Directive Extensions
- [§5.1](https://spec.graphql.org/draft/#sec-Documents) Documents
- [§5.2](https://spec.graphql.org/draft/#sec-Operations) Operations
- [§5.2.1](https://spec.graphql.org/draft/#sec-All-Operation-Definitions) All Operation Definitions
- [§5.2.2](https://spec.graphql.org/draft/#sec-Named-Operation-Definitions) Named Operation Definitions
- [§5.2.3](https://spec.graphql.org/draft/#sec-Anonymous-Operation-Definitions) Anonymous Operation Definitions
- [§5.2.4](https://spec.graphql.org/draft/#sec-Subscription-Operation-Definitions) Subscription Operation Definitions
- [§5.3](https://spec.graphql.org/draft/#sec-Fields) Fields
- [§5.4](https://spec.graphql.org/draft/#sec-Arguments) Arguments
- [§5.5](https://spec.graphql.org/draft/#sec-Fragments) Fragments
- [§5.5.1](https://spec.graphql.org/draft/#sec-Fragment-Declarations) Fragment Declarations
- [§5.5.2](https://spec.graphql.org/draft/#sec-Fragment-Spreads) Fragment Spreads
- [§5.5.2.3.1](https://spec.graphql.org/draft/#sec-Object-Spreads-in-Object-Scope) Object Spreads in Object Scope
- [§5.5.2.3.2](https://spec.graphql.org/draft/#sec-Abstract-Spreads-in-Object-Scope) Abstract Spreads in Object Scope
- [§5.5.2.3.3](https://spec.graphql.org/draft/#sec-Object-Spreads-in-Abstract-Scope) Object Spreads in Abstract Scope
- [§5.5.2.3.4](https://spec.graphql.org/draft/#sec-Abstract-Spreads-in-Abstract-Scope) Abstract Spreads in Abstract Scope
- [§5.6](https://spec.graphql.org/draft/#sec-Values) Values
- [§5.7](https://spec.graphql.org/draft/#sec-Directives) Directives
- [§5.8](https://spec.graphql.org/draft/#sec-Variables) Variables
- [§6.1](https://spec.graphql.org/draft/#sec-Executing-Requests) Executing Requests
- [§6.1.1](https://spec.graphql.org/draft/#sec-Validating-Requests) Validating Requests
- [§6.2](https://spec.graphql.org/draft/#sec-Executing-Operations) Executing Operations
- [§6.2.1](https://spec.graphql.org/draft/#sec-Query) Query
- [§6.2.3.1](https://spec.graphql.org/draft/#sec-Source-Stream) Source Stream
- [§6.2.3.3](https://spec.graphql.org/draft/#sec-Unsubscribe) Unsubscribe
- [§6.3](https://spec.graphql.org/draft/#sec-Executing-Selection-Sets) Executing Selection Sets
- [§6.3.1](https://spec.graphql.org/draft/#sec-Executing-the-Root-Selection-Set) Executing the Root Selection Set
- [§6.4](https://spec.graphql.org/draft/#sec-Executing-Fields) Executing Fields
- [§6.4.2](https://spec.graphql.org/draft/#sec-Value-Resolution) Value Resolution
- [§7.1](https://spec.graphql.org/draft/#sec-Response-Format) Response Format
- [§7.1.2](https://spec.graphql.org/draft/#sec-Response-Stream) Response Stream
- [§7.1.3](https://spec.graphql.org/draft/#sec-Request-Error-Result) Request Error Result
- [§7.2](https://spec.graphql.org/draft/#sec-Serialization-Format) Serialization Format
- [§7.2.1](https://spec.graphql.org/draft/#sec-JSON-Serialization) JSON Serialization
