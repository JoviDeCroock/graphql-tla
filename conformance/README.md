# Conformance sheet

Which parts of the [GraphQL spec](https://spec.graphql.org/draft/) each implementation was checked against, and what it breaks. Every verdict comes from a report written by the [conformance kit](../docs/conformance.md), which drives the implementation through an adapter and checks each response against the TLA+ reference. Section numbers are from graphql/graphql-spec@bfcc722b32f4 (spec/Section 2–7). Regenerate with `npm run conformance`.

Read it with these limits in mind:

- **Small fixtures.** A ✓ means no case the kit tried broke the rule, not that the implementation is correct. The cell gives the number of cases it rests on.
- **One oracle.** The TLA+ references were checked against graphql-js only (differentially, and through the negative controls, which are graphql-js cases broken on purpose). A bug the reference shares with graphql-js would show as ✓ everywhere.
- **Unreviewed adapters.** The kit's authors wrote every adapter, and no implementation's maintainers have reviewed theirs yet. A failure may be the adapter's, not the implementation's. Each adapter's README says how it maps the protocol onto its implementation.
- **Draft text.** Levels are the draft's. Where the October 2021 edition differs, the check says so.

## Implementations

| Implementation | Areas | Capabilities | Cases (distinct) | Finding groups | Cases failing direct checks | Adapter problems | Checker self-test | Kit |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| [graphql-js 16.15.0](graphql-js-16.md) | execution, parse, validate, coerce, schema, introspect | absent-vs-null, coerce, custom-scalar-literals, deferred-items, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, unvalidated, validate | 19096 (9549) | 21 | 3 | none | passed | ea0905982bf7, 2026-11-15 |
| [graphql-js 17.1.0](graphql-js-17.md) | execution, parse, validate, coerce, schema, introspect | absent-vs-null, coerce, custom-scalar-literals, deferred-items, error-propagation-off, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, unvalidated, validate | 20698 (9832) | 10 | 0 | none | passed | ea0905982bf7, 2026-11-15 |
| [graphql-java 26.2](graphql-java.md) | execution, parse, validate, coerce, schema, introspect | absent-vs-null, coerce, custom-scalar-literals, error-propagation-off, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate | 20724 (9818) | 27 | 1338 | none | passed | ea0905982bf7, 2026-11-15 |
| [async-graphql 7.0.17 (dynamic schema)](async-graphql.md) | execution | idle, invalid-results, mutation, subscription | 11213 (350) | 8 | 5801 | none | passed | 0bbe05428474, 2026-11-15 |
| [Hot Chocolate 15.1.21](hotchocolate.md) | execution, parse, validate, coerce, schema, introspect | coerce, custom-scalar-literals, exact-numbers, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate | 19166 (9383) | 92 | 384 | none | passed | 0bbe05428474, 2026-11-15 |
| [graphql-core 3.2.14](graphql-core.md) | execution | deferred-items, idle, invalid-results, mutation, subscription, uncoercible-results | 11858 (2704) | 1 | 0 | none | passed | 0bbe05428474, 2026-11-15 |
| [graphql-ruby 2.6.15](graphql-ruby.md) | execution | idle, invalid-results, mutation, subscription, uncoercible-results | 11864 (1929) | 2 | 385 | none | passed | 0bbe05428474, 2026-11-15 |
| [graphql-go/graphql 0.8.1](graphql-go.md) | execution | deferred-items, invalid-results, mutation, subscription, uncoercible-results | 10500 (1856) | 19 | 562 | none | passed | 0bbe05428474, 2026-11-15 |
| [graphql-dotnet 8.8.5](graphql-dotnet.md) | execution, parse, validate, schema, introspect | custom-scalar-literals, deferred-items, idle, introspect, invalid-results, mutation, parse, schema, subscription, uncoercible-results, validate | 17922 (8278) | 49 | 357 | none | passed | 0bbe05428474, 2026-11-15 |

**Finding groups** counts kinds of failure, not distinct bugs: one root cause can show up as several groups, and the number isn't a ranking. **Cases failing direct checks** are cases the kit rejected before consulting the reference, for something it checks on its own, such as a response stream that failed, a leaf value that should have raised an error, or a malformed error entry. They are the implementation's failures unless the adapter-problems column says otherwise.

## Findings

Each finding is one kind of failure: the set of clauses a case broke, or a malformed case's first problem, which is the root cause when one fault shows up several ways. A case counts toward one finding only.

- **[graphql-js 16.15.0](graphql-js-16.md):** 
  - [`selectionSets`](graphql-js-16.md#parse-finding-1): rejects what §2.5 Selection Sets accepts (8 cases, `random-documents`, `parser-examples`, `field-suffixes`)
  - [`stringValue`](graphql-js-16.md#parse-finding-2): rejects what §2.10.4 String Value accepts (2 cases, `lexer-examples`, `strings`)
  - [`fieldSelectionMerging`](graphql-js-16.md#validate-finding-1): §5.3.2 Field Selection Merging isn't enforced: accepts documents that break only this rule (22 cases, `merging`)
  - [`operationTypeExistence`](graphql-js-16.md#validate-finding-2): §5.2.1.1 Operation Type Existence isn't enforced: accepts documents that break only this rule; all rely on the draft (12 cases, `operations`, `spec`)
  - [`singleRootField`](graphql-js-16.md#validate-finding-3): §5.2.4.1 Single Root Field isn't enforced: accepts documents that break only this rule; all rely on the draft (12 cases, `operations`, `random`)
  - [`allVariableUsagesAreAllowed`](graphql-js-16.md#validate-finding-4): §5.8.5 All Variable Usages Are Allowed isn't enforced: accepts documents that break only this rule; all rely on the draft (2 cases, `spec`)
  - [`inputObject`](graphql-js-16.md#coerce-finding-1): accepts what §3.10 (Input Objects) rejects (4 cases, `literal`, `spec-example`)
  - [`floatPrecision`](graphql-js-16.md#coerce-finding-2): accepts what §3.5.2 (Float) rejects (1 case, `literal`)
  - [`float`](graphql-js-16.md#coerce-finding-3): accepts what §3.5.2 (Float) rejects (1 case, `literal`)
  - [`list`](graphql-js-16.md#coerce-finding-4): accepts what §3.11 (List) rejects (1 case, `literal`)
  - [`argDefaultCompatible`](graphql-js-16.md#schema-finding-1): ARG_DEFAULT_COMPATIBLE not enforced: accepts a schema that breaks only this rule (10 cases, `defaults`)
  - [`inputObjectDefaultValueCycle`](graphql-js-16.md#schema-finding-2): INPUT_OBJECT_DEFAULT_VALUE_CYCLE: crashes on a schema that breaks only this rule, instead of rejecting it (4 cases, `input`)
  - [`inputObjectDefaultValueCycle`](graphql-js-16.md#schema-finding-3): INPUT_OBJECT_DEFAULT_VALUE_CYCLE: crashes on a valid schema one small edit away from one that breaks it, instead of accepting it (3 cases, `input`)
  - [`rootTypesDifferent`](graphql-js-16.md#schema-finding-4): ROOT_TYPES_DIFFERENT not enforced: accepts a schema that breaks only this rule (2 cases, `root`)
  - [`inputObjectUnbreakableCycle`](graphql-js-16.md#schema-finding-5): INPUT_OBJECT_UNBREAKABLE_CYCLE not enforced: accepts a schema that breaks only this rule (2 cases, `input`)
  - [`typeNameNotBuiltin`](graphql-js-16.md#schema-finding-6): TYPE_NAME_NOT_BUILTIN not enforced: accepts a schema that breaks only this rule (1 case, `names`)
  - [`implDeprecation`](graphql-js-16.md#schema-finding-7): IMPL_DEPRECATION not enforced: accepts a schema that breaks only this rule (1 case, `implementation`)
  - [`directiveUsesItself`](graphql-js-16.md#schema-finding-8): DIRECTIVE_USES_ITSELF not enforced: accepts a schema that breaks only this rule (1 case, `directive`)
  - [`directiveReferencesItselfIndirectly`](graphql-js-16.md#schema-finding-9): DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY not enforced: accepts a schema that breaks only this rule (1 case, `directive`)
  - [`builtinDefinitions`](graphql-js-16.md#introspect-finding-1): the built-in @deprecated(reason:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Directive.args(includeDeprecated:) isn't as the spec defines it (arguments); the built-in __Field.args(includeDeprecated:) isn't as the spec defines it (arguments); the built-in __Type.enumValues(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.fields(includeDeprecated:) isn't as the draft defines it, but is as October 2021 does (arguments); the built-in __Type.inputFields(includeDeprecated:) isn't as the spec defines it (arguments) (22 cases, `minimal`, `rich`, `interfaces`, `defaults`, `deprecation`, `inputDeprecation`, `roots`, `builtinScalars`, `scalars`, `oneOf`, `order`)
  - [`executes`](graphql-js-16.md#introspect-finding-2): the schema didn't build, the query failed, or the result doesn't have the fields the query selects (3 cases, `directiveDeprecation`)
- **[graphql-js 17.1.0](graphql-js-17.md):** 
  - [`stringValue`](graphql-js-17.md#parse-finding-1): rejects what §2.10.4 String Value accepts (2 cases, `lexer-examples`, `strings`)
  - [`fieldSelectionMerging`](graphql-js-17.md#validate-finding-1): §5.3.2 Field Selection Merging isn't enforced: accepts documents that break only this rule (22 cases, `merging`)
  - [`allVariableUsagesAreAllowed`](graphql-js-17.md#validate-finding-2): §5.8.5 All Variable Usages Are Allowed isn't enforced: accepts documents that break only this rule; all rely on the draft (2 cases, `spec`)
  - [`floatPrecision`](graphql-js-17.md#coerce-finding-1): accepts what §3.5.2 (Float) rejects (1 case, `literal`)
  - [`float`](graphql-js-17.md#coerce-finding-2): accepts what §3.5.2 (Float) rejects (1 case, `literal`)
  - [`typeNameNotBuiltin`](graphql-js-17.md#schema-finding-1): TYPE_NAME_NOT_BUILTIN not enforced: accepts a schema that breaks only this rule (1 case, `names`)
  - [`argDefaultCompatible`](graphql-js-17.md#schema-finding-2): ARG_DEFAULT_COMPATIBLE not enforced: accepts a schema that breaks only this rule (1 case, `defaults`)
  - [`directiveUsesItself`](graphql-js-17.md#schema-finding-3): DIRECTIVE_USES_ITSELF not enforced: accepts a schema that breaks only this rule (1 case, `directive`)
  - [`directiveReferencesItselfIndirectly`](graphql-js-17.md#schema-finding-4): DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY not enforced: accepts a schema that breaks only this rule (1 case, `directive`)
  - (informational) [`builtinAdditions`](graphql-js-17.md#introspect-finding-1): the built-in __DirectiveLocation has an enum value the spec doesn't define (24 cases, `minimal`, `rich`, `interfaces`, `defaults`, `deprecation`, `inputDeprecation`, `directiveDeprecation`, `roots`, `builtinScalars`, `scalars`, `oneOf`, `order`)
- **[graphql-java 26.2](graphql-java.md):** 
  - [`eventYieldsResult`](graphql-java.md#execution-finding-1): the response stream failed instead of yielding the event's result: … (1338 cases, `subscription`)
  - [`descriptions`](graphql-java.md#parse-finding-1): rejects what §2.2 Descriptions accepts (73 cases, `random-documents`, `parser-examples`, `variable-definitions`)
  - [`selectionSets`](graphql-java.md#parse-finding-2): rejects what §2.5 Selection Sets accepts (8 cases, `random-documents`, `parser-examples`, `field-suffixes`)
  - [`stringValue`](graphql-java.md#parse-finding-3): accepts what §2.10.4 String Value rejects (4 cases, `lexer-examples`, `block-strings`)
  - [`lineTerminators`](graphql-java.md#parse-finding-4): accepts what §2.1.2 Line Terminators rejects (3 cases, `ignored`)
  - [`variables`](graphql-java.md#parse-finding-5): accepts what §2.11 Variables rejects (1 case, `parser-examples`)
  - [`fieldSelectionMerging`](graphql-java.md#validate-finding-1): §5.3.2 Field Selection Merging isn't enforced: accepts documents that break only this rule (22 cases, `merging`)
  - [`allVariableUsagesAreAllowed`](graphql-java.md#validate-finding-2): §5.8.5 All Variable Usages Are Allowed isn't enforced: accepts documents that break only this rule; all rely on the draft (4 cases, `variables`, `spec`)
  - [`singleRootField`](graphql-java.md#validate-finding-3): §5.2.4.1 Single Root Field isn't enforced: accepts documents that break only this rule; all rely on the draft (1 case, `random`)
  - [`valuesOfCorrectType`](graphql-java.md#validate-finding-4): §5.6.1 Values of Correct Type isn't enforced: accepts documents that break only this rule; all rely on the draft (1 case, `values`)
  - [`directivesAreUniquePerLocation`](graphql-java.md#validate-finding-5): §5.7.3 Directives Are Unique per Location isn't enforced: accepts documents that break only this rule (1 case, `directives`)
  - [`id`](graphql-java.md#coerce-finding-1): accepts what §3.5.5 (ID) rejects (30 cases, `variable`)
  - (informational) [`jsonNumbers`](graphql-java.md#coerce-finding-2): reads a JSON number a double can't hold in a way that neither exact nor binary64 parsing, nor a refusal, explains (1 case, `variable`)
  - [`list`](graphql-java.md#coerce-finding-3): accepts what §3.11 (List) rejects (1 case, `nested-variable`)
  - [`rootTypesAreObjects`](graphql-java.md#schema-finding-1): ROOT_TYPES_ARE_OBJECTS: crashes on a schema that breaks only this rule, instead of rejecting it (2 cases, `root`)
  - [`rootTypesDifferent`](graphql-java.md#schema-finding-2): ROOT_TYPES_DIFFERENT not enforced: accepts a schema that breaks only this rule (2 cases, `root`)
  - [`argDefaultCompatible`](graphql-java.md#schema-finding-3): ARG_DEFAULT_COMPATIBLE not enforced: accepts a schema that breaks only this rule (2 cases, `defaults`)
  - [`typeNameNotBuiltin`](graphql-java.md#schema-finding-4): TYPE_NAME_NOT_BUILTIN not enforced: accepts a schema that breaks only this rule (1 case, `names`)
  - [`typeNameReserved`](graphql-java.md#schema-finding-5): TYPE_NAME_RESERVED not enforced: accepts a schema that breaks only this rule (1 case, `names`)
  - [`argInputType`](graphql-java.md#schema-finding-6): ARG_INPUT_TYPE: crashes on a schema that breaks only this rule, instead of rejecting it (1 case, `typeUse`)
  - [`implementsUnique`](graphql-java.md#schema-finding-7): IMPLEMENTS_UNIQUE not enforced: accepts a schema that breaks only this rule (1 case, `implementation`)
  - [`implDeprecation`](graphql-java.md#schema-finding-8): IMPL_DEPRECATION not enforced: accepts a schema that breaks only this rule (1 case, `implementation`)
  - [`inputFieldInputType`](graphql-java.md#schema-finding-9): INPUT_FIELD_INPUT_TYPE: crashes on a schema that breaks only this rule, instead of rejecting it (1 case, `input`)
  - [`inputObjectUnbreakableCycle`](graphql-java.md#schema-finding-10): INPUT_OBJECT_UNBREAKABLE_CYCLE not enforced: accepts a schema that breaks only this rule (1 case, `input`)
  - [`builtinAdditions`, `builtinDefinitions`](graphql-java.md#introspect-finding-1): the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (arguments); the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.inputFields has an argument October 2021 doesn't define (14 cases, `minimal`, `interfaces`, `defaults`, `deprecation`, `roots`, `builtinScalars`, `order`)
  - [`builtinAdditions`, `builtinDefinitions`, `descriptions`](graphql-java.md#introspect-finding-2): descriptions are the schema's: differs from Introspection.tla; the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (arguments); the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.inputFields has an argument October 2021 doesn't define (4 cases, `rich`, `scalars`)
  - [`descriptions`](graphql-java.md#introspect-finding-3): descriptions are the schema's: differs from Introspection.tla (2 cases, `rich`, `scalars`)
- **[async-graphql 7.0.17 (dynamic schema)](async-graphql.md):** 
  - [`errorPath`](async-graphql.md#execution-finding-1): an execution error without a path (4658 cases, `mutation`, `nullPropagation`, `leaves`, `fragments`, `lists`, `unions`, `subscription`)
  - [`callsReachable`](async-graphql.md#execution-finding-2): a resolver was called at … but its parent settled as null (1042 cases, `lists`, `subscription`)
  - [`dataMatches`](async-graphql.md#execution-finding-3) (102 cases, `lists`, `unions`, `leaves`, `nullPropagation`, `fragments`, `mutation`)
  - [`callsOnce`](async-graphql.md#execution-finding-4): the resolver at … was called twice (101 cases, `fragments`)
  - [`complete`](async-graphql.md#execution-finding-5) (29 cases, `leaves`, `unions`, `nullPropagation`, `lists`, `mutation`)
  - [`dataMatches`, `nullsExplained`](async-graphql.md#execution-finding-6) (15 cases, `unions`)
  - [`complete`, `errorsInsideNulls`, `errorsWereRaised`](async-graphql.md#execution-finding-7) (3 cases, `unions`)
  - [`dataMatches`, `errorsInsideNulls`, `errorsWereRaised`](async-graphql.md#execution-finding-8) (2 cases, `unions`)
- **[Hot Chocolate 15.1.21](hotchocolate.md):** 
  - [`intFraction`](hotchocolate.md#execution-finding-1): count is 1, though its resolver returned a value its type can't represent, which should raise an execution error (343 cases, `leaves`)
  - [`nullsExplained`](hotchocolate.md#execution-finding-2) (94 cases, `lists`, `unions`)
  - [`intFraction`](hotchocolate.md#execution-finding-3): … is 1, though its resolver returned a value its type can't represent, which should raise an execution error (41 cases, `unions`)
  - [`descriptions`](hotchocolate.md#parse-finding-1): rejects what §2.2 Descriptions accepts (57 cases, `random-documents`, `parser-examples`, `variable-definitions`)
  - [`inlineFragments`](hotchocolate.md#parse-finding-2): rejects what §2.9.2 Inline Fragments accepts (42 cases, `random-documents`)
  - [`inputValues`](hotchocolate.md#parse-finding-3): rejects what §2.10 Input Values accepts (36 cases, `random-documents`)
  - [`listValue`](hotchocolate.md#parse-finding-4): rejects what §2.10.7 List Value accepts (35 cases, `random-documents`)
  - [`inputObjectValues`](hotchocolate.md#parse-finding-5): rejects what §2.10.8 Input Object Values accepts (35 cases, `random-documents`)
  - [`arguments`](hotchocolate.md#parse-finding-6): rejects what §2.7 Arguments accepts (29 cases, `random-documents`)
  - [`directives`](hotchocolate.md#parse-finding-7): rejects what §2.13 Directives accepts (27 cases, `random-documents`)
  - [`variables`](hotchocolate.md#parse-finding-8): rejects what §2.11 Variables accepts (25 cases, `random-documents`)
  - [`typeConditions`](hotchocolate.md#parse-finding-9): rejects what §2.9.1 Type Conditions accepts (24 cases, `random-documents`)
  - [`fieldAlias`](hotchocolate.md#parse-finding-10): rejects what §2.8 Field Alias accepts (21 cases, `random-documents`)
  - [`typeReferences`](hotchocolate.md#parse-finding-11): rejects what §2.12 Type References accepts (21 cases, `random-documents`)
  - [`operations`](hotchocolate.md#parse-finding-12): rejects what §2.4 Operations accepts (18 cases, `random-documents`)
  - [`fragments`](hotchocolate.md#parse-finding-13): rejects what §2.9 Fragments accepts (18 cases, `random-documents`)
  - [`fields`](hotchocolate.md#parse-finding-14): rejects what §2.6 Fields accepts (15 cases, `random-documents`)
  - [`document`](hotchocolate.md#parse-finding-15): rejects what §2.3 Document accepts (9 cases, `random-documents`)
  - [`stringValue`](hotchocolate.md#parse-finding-16): accepts what §2.10.4 String Value rejects (8 cases, `lexer-examples`, `strings`)
  - [`selectionSets`](hotchocolate.md#parse-finding-17): rejects what §2.5 Selection Sets accepts (6 cases, `random-documents`)
  - [`stringValue`](hotchocolate.md#parse-finding-18): rejects what §2.10.4 String Value accepts (4 cases, `block-strings`, `lexer-examples`)
  - [`ignoredTokens`](hotchocolate.md#parse-finding-19): rejects what §2.1.6 Ignored Tokens accepts (4 cases, `ignored`)
  - [`document`](hotchocolate.md#parse-finding-20): accepts what §2.3 Document rejects (3 cases, `random-documents`, `parser-examples`)
  - [`sourceText`](hotchocolate.md#parse-finding-21): rejects what §2.1 Source Text accepts (3 cases, `ignored`)
  - [`descriptions`](hotchocolate.md#parse-finding-22): accepts what §2.2 Descriptions rejects (1 case, `parser-examples`)
  - [`arguments`](hotchocolate.md#parse-finding-23): accepts what §2.7 Arguments rejects (1 case, `parser-examples`)
  - [`directives`](hotchocolate.md#parse-finding-24): accepts what §2.13 Directives rejects (1 case, `parser-examples`)
  - [`variables`](hotchocolate.md#parse-finding-25): accepts what §2.11 Variables rejects (1 case, `parser-examples`)
  - [`whiteSpace`](hotchocolate.md#parse-finding-26): rejects what §2.1.1 White Space accepts (1 case, `ignored`)
  - [`valuesOfCorrectType`](hotchocolate.md#validate-finding-1): §5.6.1 Values of Correct Type isn't enforced: accepts documents that break only this rule; 5 of 28 rely on the draft (28 cases, `variables`, `values`, `random`)
  - [`singleRootField`](hotchocolate.md#validate-finding-2): §5.2.4.1 Single Root Field isn't enforced: accepts documents that break only this rule; all rely on the draft (22 cases, `operations`, `random`, `spec`)
  - [`acceptsValid`](hotchocolate.md#validate-finding-3): rejects valid documents: §5.8.5 All Variable Usages Are Allowed is likely over-strict (10 valid siblings of 113 different invalid vectors rejected, 47 of the same family accepted) (10 cases, `variables`)
  - [`acceptsValid`](hotchocolate.md#validate-finding-4): rejects valid documents, each one edit from a document that breaks only §5.8.2 Variables Are Input Types; the rule it applied is a guess, since the kit doesn't read error messages (5 cases, `extra`)
  - [`fieldSelectionMerging`](hotchocolate.md#validate-finding-5): §5.3.2 Field Selection Merging isn't enforced: accepts documents that break only this rule (4 cases, `merging`)
  - [`acceptsValid`](hotchocolate.md#validate-finding-6): rejects valid documents: §5.3.3 Leaf Field Selections is likely over-strict (4 valid siblings of 4 different invalid vectors rejected, 6 of the same family accepted) (4 cases, `random`)
  - [`acceptsValid`](hotchocolate.md#validate-finding-7): rejects valid documents, each one edit from a document that breaks only §5.4.3 Required Arguments; the rule it applied is a guess, since the kit doesn't read error messages (2 cases, `values`, `random`)
  - [`acceptsValid`](hotchocolate.md#validate-finding-8): rejects valid documents, each one edit from a document that breaks §5.4.1 Argument Names and §5.7.1 Directives Are Defined; the rule it applied is a guess, since the kit doesn't read error messages (1 case, `values`)
  - [`acceptsValid`](hotchocolate.md#validate-finding-9): rejects valid documents, each one edit from a document that breaks §5.4.1 Argument Names and §5.4.2 Argument Uniqueness; the rule it applied is a guess, since the kit doesn't read error messages (1 case, `names`)
  - [`acceptsValid`](hotchocolate.md#validate-finding-10): rejects valid documents, each one edit from a document that breaks only §5.5.2.3 Fragment Spread Is Possible; the rule it applied is a guess, since the kit doesn't read error messages (1 case, `random`)
  - [`acceptsValid`](hotchocolate.md#validate-finding-11): rejects valid documents, each one edit from a document that breaks only §5.6.1 Values of Correct Type; the rule it applied is a guess, since the kit doesn't read error messages (1 case, `random`)
  - [`acceptsValid`](hotchocolate.md#validate-finding-12): rejects valid documents, each one edit from a document that breaks §5.7.1 Directives Are Defined and §5.7.2 Directives Are in Valid Locations; the rule it applied is a guess, since the kit doesn't read error messages (1 case, `directives`)
  - [`acceptsValid`](hotchocolate.md#validate-finding-13): rejects valid documents, each one edit from a document that breaks only §5.7.1 Directives Are Defined; the rule it applied is a guess, since the kit doesn't read error messages (1 case, `random`)
  - [`acceptsValid`](hotchocolate.md#validate-finding-14): rejects valid documents, each one edit from a document that breaks §5.8.4 All Variables Used and §5.7.2 Directives Are in Valid Locations; the rule it applied is a guess, since the kit doesn't read error messages (1 case, `directives`)
  - [`acceptsValid`](hotchocolate.md#validate-finding-15): rejects valid documents, each one edit from a document that breaks only §5.7.2 Directives Are in Valid Locations; the rule it applied is a guess, since the kit doesn't read error messages (1 case, `directives`)
  - [`acceptsValid`](hotchocolate.md#validate-finding-16): rejects valid documents, each one edit from a document that breaks only §5.8.3 All Variable Uses Defined; the rule it applied is a guess, since the kit doesn't read error messages (1 case, `random`)
  - [`invalidNotExecuted`](hotchocolate.md#coerce-finding-1): doesn't fail an invalid document without executing it, as §6.1.1 (Validating Requests) requires (58 cases, `literal`, `arguments`)
  - [`list`](hotchocolate.md#coerce-finding-2): rejects what §3.11 (List) accepts (7 cases, `variable`, `nested-variable`)
  - [`variables`](hotchocolate.md#coerce-finding-3): rejects what §6.1.2 (Coercing Variable Values) accepts (7 cases, `variable-default`)
  - [`list`](hotchocolate.md#coerce-finding-4): answers with none of the three outcomes, under §3.11 (List) (5 cases, `literal`)
  - [`list`](hotchocolate.md#coerce-finding-5): gives October 2021's answer where the draft changed it, under §3.11 (List) (5 cases, `variable`)
  - [`int`](hotchocolate.md#coerce-finding-6): rejects what §3.5.1 (Int) accepts (4 cases, `variable`)
  - [`variables`](hotchocolate.md#coerce-finding-7): answers with none of the three outcomes, under §6.1.2 (Coercing Variable Values) (3 cases, `variable-default`)
  - [`idCoerced`](hotchocolate.md#coerce-finding-8): rejects what §3.5.5 (ID) accepts (3 cases, `variable`)
  - [`arguments`](hotchocolate.md#coerce-finding-9): answers with none of the three outcomes, under §6.4.1 (Coercing Field Arguments) (2 cases, `nullable-variable`, `arguments`)
  - (informational) [`loneSurrogates`](hotchocolate.md#coerce-finding-10): treats a JSON string with a lone surrogate in a way that neither keeping it, replacing it with U+FFFD, nor a refusal explains (2 cases, `variable`)
  - [`arguments`](hotchocolate.md#coerce-finding-11): raises a request error where §6.4.1 (Coercing Field Arguments) requires a field error (2 cases, `variable-default`, `nested-variable`)
  - [`inputObject`](hotchocolate.md#coerce-finding-12): rejects what §3.10 (Input Objects) accepts (2 cases, `variable`)
  - [`floatPrecision`](hotchocolate.md#coerce-finding-13): accepts what §3.5.2 (Float) rejects (1 case, `variable`)
  - [`variables`](hotchocolate.md#coerce-finding-14): gives October 2021's answer where the draft changed it, under §6.1.2 (Coercing Variable Values) (1 case, `variable-default`)
  - [`argDefaultCompatible`](hotchocolate.md#schema-finding-1): ARG_DEFAULT_COMPATIBLE not enforced: accepts a schema that breaks only this rule (10 cases, `defaults`)
  - [`inputObjectDefaultValueCycle`](hotchocolate.md#schema-finding-2): INPUT_OBJECT_DEFAULT_VALUE_CYCLE not enforced: accepts a schema that breaks only this rule (4 cases, `input`)
  - [`rootTypesDifferent`](hotchocolate.md#schema-finding-3): ROOT_TYPES_DIFFERENT not enforced: accepts a schema that breaks only this rule (2 cases, `root`)
  - [`inputObjectUnbreakableCycle`](hotchocolate.md#schema-finding-4): INPUT_OBJECT_UNBREAKABLE_CYCLE not enforced: accepts a schema that breaks only this rule (2 cases, `input`)
  - [`typeNamesUnique`](hotchocolate.md#schema-finding-5): TYPE_NAMES_UNIQUE not enforced: accepts a schema that breaks only this rule (1 case, `names`)
  - [`typeNameNotBuiltin`](hotchocolate.md#schema-finding-6): TYPE_NAME_NOT_BUILTIN not enforced: accepts a schema that breaks only this rule (1 case, `names`)
  - [`typeNameReserved`](hotchocolate.md#schema-finding-7): TYPE_NAME_RESERVED not enforced: accepts a schema that breaks only this rule (1 case, `names`)
  - [`fieldNamesUnique`](hotchocolate.md#schema-finding-8): FIELD_NAMES_UNIQUE over-strict: rejects a valid schema one small edit away from one that breaks it (1 case, `names`)
  - [`requiredArgNotDeprecated`](hotchocolate.md#schema-finding-9): REQUIRED_ARG_NOT_DEPRECATED over-strict: rejects a valid schema one small edit away from one that breaks it (1 case, `typeUse`)
  - [`implementsUnique`](hotchocolate.md#schema-finding-10): IMPLEMENTS_UNIQUE not enforced: accepts a schema that breaks only this rule (1 case, `implementation`)
  - [`implementsInterfaces`](hotchocolate.md#schema-finding-11): IMPLEMENTS_INTERFACES: crashes on a schema that breaks only this rule, instead of rejecting it (1 case, `implementation`)
  - [`implementsItself`](hotchocolate.md#schema-finding-12): IMPLEMENTS_ITSELF over-strict: rejects a valid schema one small edit away from one that breaks it (1 case, `implementation`)
  - [`implTransitive`](hotchocolate.md#schema-finding-13): IMPL_TRANSITIVE not enforced: accepts a schema that breaks only this rule (1 case, `implementation`)
  - [`implTransitive`](hotchocolate.md#schema-finding-14): IMPL_TRANSITIVE over-strict: rejects a valid schema one small edit away from one that breaks it (1 case, `implementation`)
  - [`implDeprecation`](hotchocolate.md#schema-finding-15): IMPL_DEPRECATION not enforced: accepts a schema that breaks only this rule (1 case, `implementation`)
  - [`unionMembersUnique`](hotchocolate.md#schema-finding-16): UNION_MEMBERS_UNIQUE not enforced: accepts a schema that breaks only this rule (1 case, `union`)
  - [`enumValuesUnique`](hotchocolate.md#schema-finding-17): ENUM_VALUES_UNIQUE not enforced: accepts a schema that breaks only this rule (1 case, `enum`)
  - [`enumValueNameReserved`](hotchocolate.md#schema-finding-18): ENUM_VALUE_NAME_RESERVED not enforced: accepts a schema that breaks only this rule (1 case, `enum`)
  - [`directiveUsesItself`](hotchocolate.md#schema-finding-19): DIRECTIVE_USES_ITSELF not enforced: accepts a schema that breaks only this rule (1 case, `directive`)
  - [`directiveReferencesItselfIndirectly`](hotchocolate.md#schema-finding-20): DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY not enforced: accepts a schema that breaks only this rule (1 case, `directive`)
  - [`builtinAdditions`, `builtinDefinitions`](hotchocolate.md#introspect-finding-1): the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (defaultValue); the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define (6 cases, `minimal`, `interfaces`, `deprecation`, `roots`, `builtinScalars`, `order`)
  - [`builtinAdditions`, `builtinDefinitions`](hotchocolate.md#introspect-finding-2): the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (defaultValue); the built-in __Directive has a field October 2021 doesn't define; the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define (5 cases, `minimal`, `interfaces`, `roots`, `builtinScalars`, `order`)
  - [`builtinAdditions`, `builtinDefinitions`, `builtinDirectives`, `deprecation`, `descriptions`, `directives`](hotchocolate.md#introspect-finding-3): descriptions are the schema's: differs from Introspection.tla; directives describes the schema's own directives (name, locations, isRepeatable), and any of the service's own takes input types: differs from Introspection.tla; doesn't provide @specifiedBy; isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something: differs from Introspection.tla; the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (defaultValue); the built-in __Directive has a field October 2021 doesn't define; the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define (1 case, `rich`)
  - [`builtinAdditions`, `builtinDefinitions`, `builtinDirectives`, `descriptions`, `directives`](hotchocolate.md#introspect-finding-4): descriptions are the schema's: differs from Introspection.tla; directives describes the schema's own directives (name, locations, isRepeatable), and any of the service's own takes input types: differs from Introspection.tla; doesn't provide @specifiedBy; the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (defaultValue); the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define (1 case, `rich`)
  - [`builtinAdditions`, `builtinDefinitions`, `defaultValue`](hotchocolate.md#introspect-finding-5): defaultValue encodes the default value, and is null without one: differs from Introspection.tla; the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (defaultValue); the built-in __Directive has a field October 2021 doesn't define; the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define (1 case, `defaults`)
  - [`builtinAdditions`, `builtinDefinitions`, `defaultValue`](hotchocolate.md#introspect-finding-6): defaultValue encodes the default value, and is null without one: differs from Introspection.tla; the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (defaultValue); the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define (1 case, `defaults`)
  - [`builtinAdditions`, `builtinDefinitions`, `deprecation`](hotchocolate.md#introspect-finding-7): isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something: differs from Introspection.tla; the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (defaultValue); the built-in __Directive has a field October 2021 doesn't define; the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define (1 case, `deprecation`)
  - [`builtinAdditions`, `builtinDefinitions`, `descriptions`, `specifiedByURL`](hotchocolate.md#introspect-finding-8): descriptions are the schema's: differs from Introspection.tla; doesn't return @specifiedBy, though a scalar's specifiedByURL shows it is provided; specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null; @specifiedBy is returned when a scalar has a URL: differs from Introspection.tla; the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (defaultValue); the built-in __Directive has a field October 2021 doesn't define; the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define (1 case, `scalars`)
  - [`builtinAdditions`, `builtinDefinitions`, `descriptions`, `specifiedByURL`](hotchocolate.md#introspect-finding-9): descriptions are the schema's: differs from Introspection.tla; doesn't return @specifiedBy, though a scalar's specifiedByURL shows it is provided; specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null; @specifiedBy is returned when a scalar has a URL: differs from Introspection.tla; the built-in @deprecated isn't as October 2021 defines it (directives); the built-in @deprecated(reason:) isn't as October 2021 defines it (defaultValue); the built-in __Directive.args has an argument October 2021 doesn't define; the built-in __Field.args has an argument October 2021 doesn't define; the built-in __InputValue has a field October 2021 doesn't define; the built-in __Type has a field October 2021 doesn't define; the built-in __Type.enumValues(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.fields(includeDeprecated:) isn't as October 2021 defines it (arguments); the built-in __Type.inputFields has an argument October 2021 doesn't define (1 case, `scalars`)
  - [`deprecation`, `descriptions`](hotchocolate.md#introspect-finding-10): descriptions are the schema's: differs from Introspection.tla; isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something: differs from Introspection.tla (1 case, `rich`)
  - [`defaultValue`](hotchocolate.md#introspect-finding-11): defaultValue encodes the default value, and is null without one: differs from Introspection.tla (1 case, `defaults`)
  - [`deprecation`](hotchocolate.md#introspect-finding-12): isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something: differs from Introspection.tla (1 case, `deprecation`)
  - [`descriptions`, `specifiedByURL`](hotchocolate.md#introspect-finding-13): descriptions are the schema's: differs from Introspection.tla; specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null; @specifiedBy is returned when a scalar has a URL: differs from Introspection.tla (1 case, `scalars`)
- **[graphql-core 3.2.14](graphql-core.md):** 
  - [`calledSerially`](graphql-core.md#execution-finding-1) (510 cases, `mutation`)
- **[graphql-ruby 2.6.15](graphql-ruby.md):** 
  - [`intFraction`](graphql-ruby.md#execution-finding-1): count is 1, though its resolver returned a value its type can't represent, which should raise an execution error (343 cases, `leaves`)
  - [`intFraction`](graphql-ruby.md#execution-finding-2): … is 1, though its resolver returned a value its type can't represent, which should raise an execution error (42 cases, `unions`)
- **[graphql-go/graphql 0.8.1](graphql-go.md):** 
  - [`dataMatches`](graphql-go.md#execution-finding-1) (406 cases, `fragments`, `nullPropagation`, `lists`, `unions`)
  - [`resultCoercion`](graphql-go.md#execution-finding-2): the implementation produced no response, after a resolver returned a value its type can't represent: … (299 cases, `leaves`)
  - [`intFraction`](graphql-go.md#execution-finding-3): count is 1, though its resolver returned a value its type can't represent, which should raise an execution error (256 cases, `leaves`)
  - [`keyOrder`](graphql-go.md#execution-finding-4) (245 cases, `leaves`, `unions`, `nullPropagation`)
  - [`calledSerially`](graphql-go.md#execution-finding-5) (242 cases, `mutation`)
  - [`keyOrder`, `nullsExplained`](graphql-go.md#execution-finding-6) (208 cases, `leaves`)
  - [`dataMatches`, `nullsExplained`](graphql-go.md#execution-finding-7) (86 cases, `lists`, `unions`)
  - [`calledSerially`, `serialErrorsKept`](graphql-go.md#execution-finding-8) (85 cases, `mutation`)
  - [`calledSerially`, `nullsExplained`, `serialErrorsKept`](graphql-go.md#execution-finding-9) (79 cases, `mutation`)
  - [`complete`](graphql-go.md#execution-finding-10) (72 cases, `lists`, `unions`)
  - [`calledSerially`, `complete`](graphql-go.md#execution-finding-11) (54 cases, `mutation`)
  - [`calledSerially`, `complete`, `nullsExplained`](graphql-go.md#execution-finding-12) (14 cases, `mutation`)
  - [`calledSerially`, `dataMatches`, `nullsExplained`, `serialErrorsKept`](graphql-go.md#execution-finding-13) (10 cases, `mutation`)
  - [`calledSerially`, `dataMatches`](graphql-go.md#execution-finding-14) (9 cases, `mutation`)
  - [`calledSerially`, `nullsExplained`](graphql-go.md#execution-finding-15) (8 cases, `mutation`)
  - [`intFraction`](graphql-go.md#execution-finding-16): … is 1, though its resolver returned a value its type can't represent, which should raise an execution error (7 cases, `unions`)
  - [`complete`, `nullsExplained`](graphql-go.md#execution-finding-17) (5 cases, `lists`)
  - [`calledSerially`, `complete`, `nullsExplained`, `serialErrorsKept`](graphql-go.md#execution-finding-18) (3 cases, `mutation`)
  - [`calledSerially`, `dataMatches`, `nullsExplained`](graphql-go.md#execution-finding-19) (2 cases, `mutation`)
- **[graphql-dotnet 8.8.5](graphql-dotnet.md):** 
  - [`resultCoercion`](graphql-dotnet.md#execution-finding-1): the implementation produced no response, after a resolver returned a value its type can't represent: … threw ArgumentException: .NET number values such as positive and negative infinity cannot be written as valid JSON. To make it work when using 'JsonSerializer', consider specifying … (see … (357 cases, `leaves`)
  - [`descriptions`](graphql-dotnet.md#parse-finding-1): rejects what §2.2 Descriptions accepts (73 cases, `random-documents`, `parser-examples`, `variable-definitions`)
  - [`stringValue`](graphql-dotnet.md#parse-finding-2): accepts what §2.10.4 String Value rejects (9 cases, `lexer-examples`, `strings`)
  - [`intValue`](graphql-dotnet.md#parse-finding-3): accepts what §2.10.1 Int Value rejects (8 cases, `numbers`, `lexer-examples`)
  - [`selectionSets`](graphql-dotnet.md#parse-finding-4): rejects what §2.5 Selection Sets accepts (8 cases, `random-documents`, `parser-examples`, `field-suffixes`)
  - [`stringValue`](graphql-dotnet.md#parse-finding-5): rejects what §2.10.4 String Value accepts (6 cases, `strings`, `lexer-examples`)
  - [`document`](graphql-dotnet.md#parse-finding-6): accepts what §2.3 Document rejects (2 cases, `parser-examples`)
  - [`variables`](graphql-dotnet.md#parse-finding-7): accepts what §2.11 Variables rejects (1 case, `parser-examples`)
  - [`allVariableUsagesAreAllowed`](graphql-dotnet.md#validate-finding-1): §5.8.5 All Variable Usages Are Allowed isn't enforced: accepts documents that break only this rule (71 cases, `variables`)
  - [`fieldSelectionMerging`](graphql-dotnet.md#validate-finding-2): §5.3.2 Field Selection Merging isn't enforced: accepts documents that break only this rule (22 cases, `merging`)
  - [`singleRootField`](graphql-dotnet.md#validate-finding-3): §5.2.4.1 Single Root Field isn't enforced: accepts documents that break only this rule; all rely on the draft (15 cases, `operations`, `random`, `spec`)
  - [`acceptsValid`](graphql-dotnet.md#validate-finding-4): rejects valid documents: §5.2.4.1 Single Root Field is likely over-strict (14 valid siblings of 16 different invalid vectors rejected, 23 of the same family accepted) (14 cases, `operations`)
  - [`operationTypeExistence`](graphql-dotnet.md#validate-finding-5): §5.2.1.1 Operation Type Existence isn't enforced: accepts documents that break only this rule; all rely on the draft (9 cases, `operations`, `spec`)
  - [`acceptsValid`](graphql-dotnet.md#validate-finding-6): rejects valid documents: §5.2.3.1 Lone Anonymous Operation is likely over-strict (9 valid siblings of 6 different invalid vectors rejected, 7 of the same family accepted) (9 cases, `operations`)
  - [`acceptsValid`](graphql-dotnet.md#validate-finding-7): rejects valid documents: §5.8.5 All Variable Usages Are Allowed is likely over-strict (7 valid siblings of 28 different invalid vectors rejected, 50 of the same family accepted) (7 cases, `variables`)
  - [`executableDefinitions`](graphql-dotnet.md#validate-finding-8): §5.1.1 Executable Definitions isn't enforced: accepts documents that break only this rule (4 cases, `executable`)
  - [`acceptsValid`](graphql-dotnet.md#validate-finding-9): rejects valid documents: §5.8.2 Variables Are Input Types is likely over-strict (4 valid siblings of 3 different invalid vectors rejected, 1 of the same family accepted) (4 cases, `extra`)
  - [`acceptsValid`](graphql-dotnet.md#validate-finding-10): rejects valid documents: §5.2.3.1 Lone Anonymous Operation or §5.2.1.1 Operation Type Existence is likely over-strict (3 valid siblings of 6 different invalid vectors rejected, 4 of the same family accepted) (3 cases, `operations`)
  - [`acceptsValid`](graphql-dotnet.md#validate-finding-11): rejects valid documents, each one edit from a document that breaks only §5.5.2.1 Fragment Spread Target Defined; the rule it applied is a guess, since the kit doesn't read error messages (1 case, `random`)
  - [`acceptsValid`](graphql-dotnet.md#validate-finding-12): rejects valid documents, each one edit from a document that breaks §5.8.5 All Variable Usages Are Allowed and §5.6.1 Values of Correct Type; the rule it applied is a guess, since the kit doesn't read error messages (1 case, `variables`)
  - [`acceptsValid`](graphql-dotnet.md#validate-finding-13): rejects valid documents, each one edit from a document that breaks only §5.7.1 Directives Are Defined; the rule it applied is a guess, since the kit doesn't read error messages (1 case, `random`)
  - [`inputObjectUnbreakableCycle`](graphql-dotnet.md#schema-finding-1): INPUT_OBJECT_UNBREAKABLE_CYCLE not enforced: accepts a schema that breaks only this rule (5 cases, `input`)
  - [`argDefaultCompatible`](graphql-dotnet.md#schema-finding-2): ARG_DEFAULT_COMPATIBLE not enforced: accepts a schema that breaks only this rule (4 cases, `defaults`)
  - [`rootTypesAreObjects`](graphql-dotnet.md#schema-finding-3): ROOT_TYPES_ARE_OBJECTS not enforced: accepts a schema that breaks only this rule (2 cases, `root`)
  - [`implArgInvariant`](graphql-dotnet.md#schema-finding-4): IMPL_ARG_INVARIANT not enforced: accepts a schema that breaks only this rule (2 cases, `implementation`)
  - [`unionMembersObjects`](graphql-dotnet.md#schema-finding-5): UNION_MEMBERS_OBJECTS: crashes on a schema that breaks only this rule, instead of rejecting it (2 cases, `union`)
  - [`typeNameNotBuiltin`](graphql-dotnet.md#schema-finding-6): TYPE_NAME_NOT_BUILTIN not enforced: accepts a schema that breaks only this rule (1 case, `names`)
  - [`requiredArgNotDeprecated`](graphql-dotnet.md#schema-finding-7): REQUIRED_ARG_NOT_DEPRECATED not enforced: accepts a schema that breaks only this rule (1 case, `typeUse`)
  - [`implementsUnique`](graphql-dotnet.md#schema-finding-8): IMPLEMENTS_UNIQUE not enforced: accepts a schema that breaks only this rule (1 case, `implementation`)
  - [`implementsInterfaces`](graphql-dotnet.md#schema-finding-9): IMPLEMENTS_INTERFACES: crashes on a schema that breaks only this rule, instead of rejecting it (1 case, `implementation`)
  - [`implementsItself`](graphql-dotnet.md#schema-finding-10): IMPLEMENTS_ITSELF not enforced: accepts a schema that breaks only this rule (1 case, `implementation`)
  - [`implTransitive`](graphql-dotnet.md#schema-finding-11): IMPL_TRANSITIVE not enforced: accepts a schema that breaks only this rule (1 case, `implementation`)
  - [`implFieldCovariant`](graphql-dotnet.md#schema-finding-12): IMPL_FIELD_COVARIANT over-strict: rejects a valid schema one small edit away from one that breaks it (1 case, `implementation`)
  - [`implDeprecation`](graphql-dotnet.md#schema-finding-13): IMPL_DEPRECATION not enforced: accepts a schema that breaks only this rule (1 case, `implementation`)
  - [`unionMembersUnique`](graphql-dotnet.md#schema-finding-14): UNION_MEMBERS_UNIQUE not enforced: accepts a schema that breaks only this rule (1 case, `union`)
  - [`enumValuesUnique`](graphql-dotnet.md#schema-finding-15): ENUM_VALUES_UNIQUE not enforced: accepts a schema that breaks only this rule (1 case, `enum`)
  - [`directiveUsesItself`](graphql-dotnet.md#schema-finding-16): DIRECTIVE_USES_ITSELF not enforced: accepts a schema that breaks only this rule (1 case, `directive`)
  - [`directiveReferencesItselfIndirectly`](graphql-dotnet.md#schema-finding-17): DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY not enforced: accepts a schema that breaks only this rule (1 case, `directive`)
  - [`specifiedByURL`](graphql-dotnet.md#introspect-finding-1): the service has no __Type.specifiedByURL field, so the kit leaves it out of the query (8 cases, `deprecation`, `minimal`, `rich`, `interfaces`, `roots`, `builtinScalars`, `order`)
  - [`builtinAdditions`, `builtinDefinitions`, `directives`, `specifiedByURL`](graphql-dotnet.md#introspect-finding-2): the built-in __Directive has a field October 2021 doesn't define; the built-in __Directive isn't as October 2021 defines it (fields); the built-in __Type has a field October 2021 doesn't define; the built-in __Type isn't as October 2021 defines it (fields); the service has no __Directive.isRepeatable field, so the kit leaves it out of the query; the service has no __Type.specifiedByURL field, so the kit leaves it out of the query (6 cases, `minimal`, `interfaces`, `deprecation`, `roots`, `builtinScalars`, `order`)
  - [`builtinAdditions`, `builtinDefinitions`, `directives`, `specifiedByURL`](graphql-dotnet.md#introspect-finding-3): the built-in __Directive isn't as October 2021 defines it (fields); the built-in __Type has a field October 2021 doesn't define; the built-in __Type isn't as October 2021 defines it (fields); the service has no __Directive.isRepeatable field, so the kit leaves it out of the query; the service has no __Type.specifiedByURL field, so the kit leaves it out of the query (6 cases, `minimal`, `interfaces`, `deprecation`, `roots`, `builtinScalars`, `order`)
  - [`builtinAdditions`, `builtinDefinitions`, `builtinDirectives`, `directives`, `specifiedByURL`](graphql-dotnet.md#introspect-finding-4): directives describes the schema's own directives (name, locations, isRepeatable), and any of the service's own takes input types: differs from Introspection.tla; doesn't provide @specifiedBy; the built-in __Directive has a field October 2021 doesn't define; the built-in __Directive isn't as October 2021 defines it (fields); the built-in __Type has a field October 2021 doesn't define; the built-in __Type isn't as October 2021 defines it (fields); the service has no __Directive.isRepeatable field, so the kit leaves it out of the query; the service has no __Type.specifiedByURL field, so the kit leaves it out of the query (1 case, `rich`)
  - [`builtinAdditions`, `builtinDefinitions`, `builtinDirectives`, `directives`, `specifiedByURL`](graphql-dotnet.md#introspect-finding-5): directives describes the schema's own directives (name, locations, isRepeatable), and any of the service's own takes input types: differs from Introspection.tla; doesn't provide @specifiedBy; the built-in __Directive isn't as October 2021 defines it (fields); the built-in __Type has a field October 2021 doesn't define; the built-in __Type isn't as October 2021 defines it (fields); the service has no __Directive.isRepeatable field, so the kit leaves it out of the query; the service has no __Type.specifiedByURL field, so the kit leaves it out of the query (1 case, `rich`)
  - [`builtinAdditions`, `builtinDefinitions`, `defaultValue`, `directives`, `specifiedByURL`](graphql-dotnet.md#introspect-finding-6): defaultValue encodes the default value, and is null without one: differs from Introspection.tla; the built-in __Directive has a field October 2021 doesn't define; the built-in __Directive isn't as October 2021 defines it (fields); the built-in __Type has a field October 2021 doesn't define; the built-in __Type isn't as October 2021 defines it (fields); the service has no __Directive.isRepeatable field, so the kit leaves it out of the query; the service has no __Type.specifiedByURL field, so the kit leaves it out of the query (1 case, `defaults`)
  - [`builtinAdditions`, `builtinDefinitions`, `defaultValue`, `directives`, `specifiedByURL`](graphql-dotnet.md#introspect-finding-7): defaultValue encodes the default value, and is null without one: differs from Introspection.tla; the built-in __Directive isn't as October 2021 defines it (fields); the built-in __Type has a field October 2021 doesn't define; the built-in __Type isn't as October 2021 defines it (fields); the service has no __Directive.isRepeatable field, so the kit leaves it out of the query; the service has no __Type.specifiedByURL field, so the kit leaves it out of the query (1 case, `defaults`)
  - [`builtinAdditions`, `builtinDefinitions`, `builtinDirectives`, `descriptions`, `directives`, `specifiedByURL`](graphql-dotnet.md#introspect-finding-8): descriptions are the schema's: differs from Introspection.tla; doesn't provide @specifiedBy; the built-in __Directive has a field October 2021 doesn't define; the built-in __Directive isn't as October 2021 defines it (fields); the built-in __Type has a field October 2021 doesn't define; the built-in __Type isn't as October 2021 defines it (fields); the service has no __Directive.isRepeatable field, so the kit leaves it out of the query; the service has no __Type.specifiedByURL field, so the kit leaves it out of the query (1 case, `scalars`)
  - [`builtinAdditions`, `builtinDefinitions`, `builtinDirectives`, `descriptions`, `directives`, `specifiedByURL`](graphql-dotnet.md#introspect-finding-9): descriptions are the schema's: differs from Introspection.tla; doesn't provide @specifiedBy; the built-in __Directive isn't as October 2021 defines it (fields); the built-in __Type has a field October 2021 doesn't define; the built-in __Type isn't as October 2021 defines it (fields); the service has no __Directive.isRepeatable field, so the kit leaves it out of the query; the service has no __Type.specifiedByURL field, so the kit leaves it out of the query (1 case, `scalars`)
  - [`defaultValue`, `specifiedByURL`](graphql-dotnet.md#introspect-finding-10): defaultValue encodes the default value, and is null without one: differs from Introspection.tla; the service has no __Type.specifiedByURL field, so the kit leaves it out of the query (1 case, `defaults`)
  - [`descriptions`, `specifiedByURL`](graphql-dotnet.md#introspect-finding-11): descriptions are the schema's: differs from Introspection.tla; the service has no __Type.specifiedByURL field, so the kit leaves it out of the query (1 case, `scalars`)

## Execution: each check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **(draft only):** the failing cases rely on grammar or rules that are only in the draft, not in the October 2021 edition.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | graphql-js 16.15.0 | graphql-js 17.1.0 | graphql-java 26.2 | async-graphql 7.0.17 (dynamic schema) | Hot Chocolate 15.1.21 | graphql-core 3.2.14 | graphql-ruby 2.6.15 | graphql-go/graphql 0.8.1 | graphql-dotnet 8.8.5 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| The response is sent only once execution is complete (`complete`) | MUST | [§6.3.1](https://spec.graphql.org/draft/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ 2239 | ✓ 2239 | ✓ 2261 | ✗ 32/350 | ✓ 2189 | ✓ 2704 | ✓ 1929 | ✗ 148/1856 | ✓ 3014 |
| data is the completed value: field collection, value completion and null propagation (`dataMatches`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2239 | ✓ 2239 | ✓ 2261 | ✗ 119/350 | ✓ 2189 | ✓ 2704 | ✓ 1929 | ✗ 513/1856 | ✓ 3014 |
| Response keys are in collected field order (`keyOrder`) | SHOULD | [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering) | ✓ 2239 | ✓ 2239 | ✓ 2261 | ✓ 350 | ✓ 2189 | ✓ 2704 | ✓ 1929 | ! 453/1856 | ✓ 3014 |
| Every error was raised, at the path where it was raised (`errorsWereRaised`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 2239 | ✓ 2239 | ✓ 2261 | ✗ 5/350 | ✓ 2189 | ✓ 2704 | ✓ 1929 | ✓ 1856 | ✓ 3014 |
| No two errors share a response path (`errorPathsUnique`) | MUST (Oct 2021: SHOULD) | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2239 | ✓ 2239 | ✓ 2261 | ✓ 350 | ✓ 2189 | ✓ 2704 | ✓ 1929 | ✓ 1856 | ✓ 3014 |
| Every error is inside a null in data (`errorsInsideNulls`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2239 | ✓ 2239 | ✓ 2261 | ✗ 5/350 | ✓ 2189 | ✓ 2704 | ✓ 1929 | ✓ 1856 | ✓ 3014 |
| Every null an error caused comes with an error from one of its causes (`nullsExplained`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 2239 | ✓ 2239 | ✓ 2261 | ✗ 15/350 | ✗ 94/2189 | ✓ 2704 | ✓ 1929 | ✗ 415/1856 | ✓ 3014 |
| A mutation reports every error its earlier root fields raised (`serialErrorsKept`) | MUST | [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 45 | ✓ 45 | ✓ 45 | ✓ 11 | ✓ 125 | ✓ 510 | ✓ 125 | ✗ 177/506 | ✓ 125 |
| A mutation's root fields execute one after another (`calledSerially`) | MUST | [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) | ✓ 45 | ✓ 45 | ✓ 45 | ✓ 11 | ✓ 125 | ✗ 510/510 | ✓ 125 | ✗ 506/506 | ✓ 125 |
| Each field is executed once, merged selections included (`callsOnce`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) | ✓ 11786 | ✓ 13388 | ✓ 13450 | ✗ 101/11213 | ✓ 11972 | ✓ 11858 | ✓ 11864 | ✓ 10500 | ✓ 12658 |
| Only fields the operation selects are executed (`callsSelected`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) | ✓ 11786 | ✓ 13388 | ✓ 13450 | ✓ 11213 | ✓ 11972 | ✓ 11858 | ✓ 11864 | ✓ 10500 | ✓ 12658 |
| A field executes only once its parent has a value that contains it (`callsReachable`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 11786 | ✓ 13388 | ✓ 13450 | ✗ 1042/11213 | ✓ 11972 | ✓ 11858 | ✓ 11864 | ✓ 10500 | ✓ 12658 |
| A request gets a response (`responds`) | MUST | [§7.1](https://spec.graphql.org/draft/#sec-Response-Format) | ✓ 11786 | ✓ 11786 | ✓ 11848 | ✓ 11213 | ✓ 11972 | ✓ 11858 | ✓ 11864 | ✓ 10500 | ✓ 12658 |
| A subscription event yields an execution result, even when its data is null (`eventYieldsResult`) | MUST | [§6.2.3.2](https://spec.graphql.org/draft/#sec-Response-Stream) | ✓ 1518 | ✓ 1518 | ✗ 1338/1522 | ✓ 1522 | ✓ 1522 | ✓ 1518 | ✓ 1522 | ✓ 1500 | ✓ 1522 |
| data holds only positions the operation selects (`dataShape`) | MUST | [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ 6521 | ✓ 6521 | ✓ 6331 | ✓ 1924 | ✓ 6275 | ✓ 6510 | ✓ 6230 | ✓ 3718 | ✓ 6555 |
| A non-finite Float or an unknown enum value raises an execution error (`resultCoercion`) | MUST | [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 685 | ✓ 685 | ✓ 685 | – | ✓ 685 | ✓ 685 | ✓ 685 | ✗ 299/588 | ✗ 357/685 |
| A fraction returned for an Int (1.2) raises an execution error instead of being truncated (`intFraction`) | SHOULD | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 378 | ✓ 378 | ✓ 384 | – | ! 384/384 | ✓ 378 | ! 385/385 | ! 263/334 | ✓ 384 |
| Leaf values are the resolver's canonical value (Int 1, Float 1.5, Boolean true, an enum's first value, "v") (`leafValues`) | MUST | [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 6521 | ✓ 6521 | ✓ 6331 | ✓ 1924 | ✓ 6275 | ✓ 6510 | ✓ 6230 | ✓ 3718 | ✓ 6555 |
| Leaf values use the JSON type §7.2.1 gives their GraphQL type (a number for Int 1, not "1") (`leafEncoding`) | SHOULD | [§7.2.1](https://spec.graphql.org/draft/#sec-JSON-Serialization) | ✓ 6521 | ✓ 6521 | ✓ 6331 | ✓ 1924 | ✓ 6275 | ✓ 6510 | ✓ 6230 | ✓ 3718 | ✓ 6555 |
| An execution result has a data entry (`dataPresent`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 11786 | ✓ 11786 | ✓ 10510 | ✓ 11213 | ✓ 11972 | ✓ 11858 | ✓ 11864 | ✓ 10201 | ✓ 12301 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 11786 | ✓ 11786 | ✓ 10510 | ✓ 11213 | ✓ 11972 | ✓ 11858 | ✓ 11864 | ✓ 10201 | ✓ 12301 |
| The response has no entries besides data, errors and extensions (`additionalEntries`) | MUST | [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ 11786 | ✓ 11786 | ✓ 10510 | ✓ 11213 | ✓ 11972 | ✓ 11858 | ✓ 11864 | ✓ 10201 | ✓ 12301 |
| extensions is a map (`extensions`) | MUST | [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) | – | – | – | – | – | – | – | – | – |
| Errors are maps with a message, and extensions, if present, is a map (`errorFormat`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 10283 | ✓ 10283 | ✓ 8896 | ✓ 9289 | ✓ 9964 | ✓ 10353 | ✓ 10155 | ✓ 8424 | ✓ 10832 |
| An error's locations, if present, is a list of maps with line and column, both positive integers (`errorLocations`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 10283 | ✓ 10283 | ✓ 5773 | ✓ 9289 | ✓ 9964 | ✓ 10353 | ✓ 10017 | ✓ 8424 | ✓ 10766 |
| Execution errors have a path to a position the operation selects (`errorPath`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 10283 | ✓ 10283 | ✓ 8896 | ✗ 4658/9289 | ✓ 9964 | ✓ 10353 | ✓ 10155 | ✓ 8424 | ✓ 10832 |
| Paths are lists of response names (aliases, not field names) and integer list indices (`responsePosition`) | MUST (Oct 2021: SHOULD) | [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) | ✓ 10283 | ✓ 10283 | ✓ 8896 | ✓ 9289 | ✓ 9964 | ✓ 10353 | ✓ 10155 | ✓ 8424 | ✓ 10832 |
| Errors have no entries besides message, locations, path and extensions (`errorEntries`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 10283 | ✓ 10283 | ✓ 8896 | ✓ 9289 | ✓ 9964 | ✓ 10353 | ✓ 10155 | ✓ 8424 | ✓ 10832 |
| The adapter follows the kit's protocol (call types, settles) (`protocol`) | ADAPTER | — | ✓ 11786 | ✓ 13388 | ✓ 13450 | ✓ 11213 | ✓ 11972 | ✓ 11858 | ✓ 11864 | ✓ 10500 | ✓ 12658 |
| With error propagation off, an error nulls the position where it happened (graphql-js 17's @experimental_disableErrorPropagation) (`disabledPropagation`) | INFO | — | – | ✓ 1602 | ✓ 1602 | – | – | – | – | – | – |

### Execution: each fixture

The sections a fixture lists are the ones it exercises; its verdict is whether any of its cases failed a check.

| Fixture | Exercises | graphql-js 16.15.0 | graphql-js 17.1.0 | graphql-java 26.2 | async-graphql 7.0.17 (dynamic schema) | Hot Chocolate 15.1.21 | graphql-core 3.2.14 | graphql-ruby 2.6.15 | graphql-go/graphql 0.8.1 | graphql-dotnet 8.8.5 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| [`fragments`](../fixtures/fragments.graphql) | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) [§3.13.1](https://spec.graphql.org/draft/#sec-skip) [§3.13.2](https://spec.graphql.org/draft/#sec-include) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 1536 | ✓ 1536 | ✓ 1576 | ✗ 819/1540 | ✓ 1576 | ✓ 1536 | ✓ 1576 | ✗ 148/1500 | ✓ 1576 |
| [`leaves`](../fixtures/leaves.graphql) | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 1700 | ✓ 1700 | ✓ 1700 | ✗ 787/1539 | ✗ 343/1700 | ✓ 1700 | ✗ 343/1700 | ✗ 928/1500 | ✗ 357/1700 |
| [`lists`](../fixtures/lists.graphql) | [§3.11](https://spec.graphql.org/draft/#sec-List) [§3.12.1](https://spec.graphql.org/draft/#sec-Combining-List-and-Non-Null) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 2002 | ✓ 2002 | ✓ 1914 | ✗ 1184/1918 | ✗ 58/1878 | ✓ 2002 | ✓ 1842 | ✗ 236/1500 | ✓ 2490 |
| [`mutation`](../fixtures/mutation.graphql) | [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 1590 | ✓ 1590 | ✓ 1590 | ✗ 1038/1542 | ✓ 1750 | ✗ 510/1662 | ✓ 1750 | ✗ 506/1500 | ✓ 1750 |
| [`noPropagation`](../fixtures/noPropagation.graphql) |  | – needs error-propagation-off | ✓ 1602 | ✓ 1602 | – needs error-propagation-off | – needs error-propagation-off | – needs error-propagation-off | – needs error-propagation-off | – needs error-propagation-off | – needs error-propagation-off |
| [`nullPropagation`](../fixtures/nullPropagation.graphql) | [§3.12](https://spec.graphql.org/draft/#sec-Non-Null) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) | ✓ 1662 | ✓ 1662 | ✓ 1782 | ✗ 898/1538 | ✓ 1782 | ✓ 1662 | ✓ 1710 | ✗ 123/1500 | ✓ 1782 |
| [`subscription`](../fixtures/subscription.graphql) | [§6.2.3](https://spec.graphql.org/draft/#sec-Subscription) [§6.2.3.2](https://spec.graphql.org/draft/#sec-Response-Stream) | ✓ 1518 | ✓ 1518 | ✗ 1338/1522 | ✗ 722/1522 | ✓ 1522 | ✓ 1518 | ✓ 1522 | ✓ 1500 | ✓ 1522 |
| [`unions`](../fixtures/unions.graphql) | [§3.8](https://spec.graphql.org/draft/#sec-Unions) [§3.11](https://spec.graphql.org/draft/#sec-List) [§3.5](https://spec.graphql.org/draft/#sec-Scalars) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 1778 | ✓ 1778 | ✓ 1764 | ✗ 504/1614 | ✗ 77/1764 | ✓ 1778 | ✗ 42/1764 | ✗ 149/1500 | ✓ 1838 |

## Parse: each check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **(draft only):** the failing cases rely on grammar or rules that are only in the draft, not in the October 2021 edition.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | graphql-js 16.15.0 | graphql-js 17.1.0 | graphql-java 26.2 | async-graphql 7.0.17 (dynamic schema) | Hot Chocolate 15.1.21 | graphql-core 3.2.14 | graphql-ruby 2.6.15 | graphql-go/graphql 0.8.1 | graphql-dotnet 8.8.5 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Source text is a sequence of SourceCharacter (`sourceText`) | MUST | [§2.1](https://spec.graphql.org/draft/#sec-Source-Text) | ✓ 33 | ✓ 33 | ✓ 33 | n/a | ✗ 3/33 (all draft only) | n/a | n/a | n/a | ✓ 33 |
| White space is tab and space only (`whiteSpace`) | MUST | [§2.1.1](https://spec.graphql.org/draft/#sec-White-Space) | ✓ 28 | ✓ 28 | ✓ 28 | n/a | ✗ 1/28 (all draft only) | n/a | n/a | n/a | ✓ 28 |
| Line terminators are LF, CR and CR LF only (`lineTerminators`) | MUST | [§2.1.2](https://spec.graphql.org/draft/#sec-Line-Terminators) | ✓ 31 | ✓ 31 | ✗ 3/31 | n/a | ✓ 31 | n/a | n/a | n/a | ✓ 31 |
| A comment runs to the end of its line (`comments`) | MUST | [§2.1.3](https://spec.graphql.org/draft/#sec-Comments) | ✓ 17 | ✓ 17 | ✓ 17 | n/a | ✓ 17 | n/a | n/a | n/a | ✓ 17 |
| Commas are insignificant (`insignificantCommas`) | MUST | [§2.1.4](https://spec.graphql.org/draft/#sec-Insignificant-Commas) | ✓ 5 | ✓ 5 | ✓ 5 | n/a | ✓ 5 | n/a | n/a | n/a | ✓ 5 |
| Every character outside ignored tokens is part of a token (`lexicalTokens`) | MUST | [§2.1.5](https://spec.graphql.org/draft/#sec-Lexical-Tokens) | ✓ 43 | ✓ 43 | ✓ 43 | n/a | ✓ 43 | n/a | n/a | n/a | ✓ 43 |
| Ignored tokens may appear before and after every token (`ignoredTokens`) | MUST | [§2.1.6](https://spec.graphql.org/draft/#sec-Ignored-Tokens) | ✓ 81 | ✓ 81 | ✓ 81 | n/a | ✗ 4/81 | n/a | n/a | n/a | ✓ 81 |
| Punctuators, and `...` only as a whole (`punctuators`) | MUST | [§2.1.7](https://spec.graphql.org/draft/#sec-Punctuators) | ✓ 40 | ✓ 40 | ✓ 40 | n/a | ✓ 40 | n/a | n/a | n/a | ✓ 40 |
| Names (`names`) | MUST | [§2.1.8](https://spec.graphql.org/draft/#sec-Names) | ✓ 14 | ✓ 14 | ✓ 14 | n/a | ✓ 14 | n/a | n/a | n/a | ✓ 14 |
| Descriptions on operations, fragments and variables, not on the query shorthand (`descriptions`) | MUST | [§2.2](https://spec.graphql.org/draft/#sec-Descriptions) | ✓ 100 | ✓ 100 | ✗ 73/100 (all draft only) | n/a | ✗ 58/100 (54 draft only) | n/a | n/a | n/a | ✗ 73/100 (all draft only) |
| A document is one or more executable definitions (`document`) | MUST | [§2.3](https://spec.graphql.org/draft/#sec-Document) | ✓ 99 | ✓ 99 | ✓ 99 | n/a | ✗ 12/99 | n/a | n/a | n/a | ✗ 2/99 |
| Operation definitions and the query shorthand (`operations`) | MUST | [§2.4](https://spec.graphql.org/draft/#sec-Operations) | ✓ 100 | ✓ 100 | ✓ 100 | n/a | ✗ 18/100 | n/a | n/a | n/a | ✓ 100 |
| Selection sets, including empty ones (`selectionSets`) | MUST | [§2.5](https://spec.graphql.org/draft/#sec-Selection-Sets) | ✗ 8/95 (all draft only) | ✓ 95 | ✗ 8/95 (all draft only) | n/a | ✗ 6/95 | n/a | n/a | n/a | ✗ 8/95 (all draft only) |
| Fields (`fields`) | MUST | [§2.6](https://spec.graphql.org/draft/#sec-Fields) | ✓ 96 | ✓ 96 | ✓ 96 | n/a | ✗ 15/96 | n/a | n/a | n/a | ✓ 96 |
| Arguments (`arguments`) | MUST | [§2.7](https://spec.graphql.org/draft/#sec-Arguments) | ✓ 110 | ✓ 110 | ✓ 110 | n/a | ✗ 30/110 | n/a | n/a | n/a | ✓ 110 |
| Field aliases (`fieldAlias`) | MUST | [§2.8](https://spec.graphql.org/draft/#sec-Field-Alias) | ✓ 94 | ✓ 94 | ✓ 94 | n/a | ✗ 21/94 | n/a | n/a | n/a | ✓ 94 |
| Fragment definitions and fragment spreads (`fragments`) | MUST | [§2.9](https://spec.graphql.org/draft/#sec-Fragments) | ✓ 117 | ✓ 117 | ✓ 117 | n/a | ✗ 18/117 | n/a | n/a | n/a | ✓ 117 |
| Type conditions (`typeConditions`) | MUST | [§2.9.1](https://spec.graphql.org/draft/#sec-Type-Conditions) | ✓ 112 | ✓ 112 | ✓ 112 | n/a | ✗ 24/112 | n/a | n/a | n/a | ✓ 112 |
| Inline fragments (`inlineFragments`) | MUST | [§2.9.2](https://spec.graphql.org/draft/#sec-Inline-Fragments) | ✓ 100 | ✓ 100 | ✓ 100 | n/a | ✗ 42/100 | n/a | n/a | n/a | ✓ 100 |
| Input values, and no variables in constant values (`inputValues`) | MUST | [§2.10](https://spec.graphql.org/draft/#sec-Input-Values) | ✓ 122 | ✓ 122 | ✓ 122 | n/a | ✗ 36/122 | n/a | n/a | n/a | ✓ 122 |
| Int values (`intValue`) | MUST | [§2.10.1](https://spec.graphql.org/draft/#sec-Int-Value) | ✓ 42 | ✓ 42 | ✓ 42 | n/a | ✓ 42 | n/a | n/a | n/a | ✗ 8/42 |
| Float values (`floatValue`) | MUST | [§2.10.2](https://spec.graphql.org/draft/#sec-Float-Value) | ✓ 35 | ✓ 35 | ✓ 35 | n/a | ✓ 35 | n/a | n/a | n/a | ✓ 35 |
| Boolean values (`booleanValue`) | MUST | [§2.10.3](https://spec.graphql.org/draft/#sec-Boolean-Value) | ✓ 3 | ✓ 3 | ✓ 3 | n/a | ✓ 3 | n/a | n/a | n/a | ✓ 3 |
| String values and block strings (`stringValue`) | MUST | [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value) | ✗ 2/146 (all draft only) | ✗ 2/146 (all draft only) | ✗ 4/146 | n/a | ✗ 12/146 (3 draft only) | n/a | n/a | n/a | ✗ 15/146 (all draft only) |
| Null value (`nullValue`) | MUST | [§2.10.5](https://spec.graphql.org/draft/#sec-Null-Value) | ✓ 2 | ✓ 2 | ✓ 2 | n/a | ✓ 2 | n/a | n/a | n/a | ✓ 2 |
| Enum values (`enumValue`) | MUST | [§2.10.6](https://spec.graphql.org/draft/#sec-Enum-Value) | ✓ 10 | ✓ 10 | ✓ 10 | n/a | ✓ 10 | n/a | n/a | n/a | ✓ 10 |
| List values (`listValue`) | MUST | [§2.10.7](https://spec.graphql.org/draft/#sec-List-Value) | ✓ 101 | ✓ 101 | ✓ 101 | n/a | ✗ 35/101 | n/a | n/a | n/a | ✓ 101 |
| Input object values (`inputObjectValues`) | MUST | [§2.10.8](https://spec.graphql.org/draft/#sec-Input-Object-Values) | ✓ 107 | ✓ 107 | ✓ 107 | n/a | ✗ 35/107 | n/a | n/a | n/a | ✓ 107 |
| Variables and variable definitions (`variables`) | MUST | [§2.11](https://spec.graphql.org/draft/#sec-Variables) | ✓ 157 | ✓ 157 | ✗ 1/157 | n/a | ✗ 26/157 | n/a | n/a | n/a | ✗ 1/157 |
| Type references (`typeReferences`) | MUST | [§2.12](https://spec.graphql.org/draft/#sec-Type-References) | ✓ 102 | ✓ 102 | ✓ 102 | n/a | ✗ 21/102 | n/a | n/a | n/a | ✓ 102 |
| Directives (`directives`) | MUST | [§2.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 113 | ✓ 113 | ✓ 113 | n/a | ✗ 28/113 | n/a | n/a | n/a | ✓ 113 |

## Validate: each check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **(draft only):** the failing cases rely on grammar or rules that are only in the draft, not in the October 2021 edition.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | graphql-js 16.15.0 | graphql-js 17.1.0 | graphql-java 26.2 | async-graphql 7.0.17 (dynamic schema) | Hot Chocolate 15.1.21 | graphql-core 3.2.14 | graphql-ruby 2.6.15 | graphql-go/graphql 0.8.1 | graphql-dotnet 8.8.5 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Executable Definitions (`executableDefinitions`) | MUST | [§5.1.1](https://spec.graphql.org/draft/#sec-Executable-Definitions) | ✓ 4 | ✓ 4 | ✓ 4 | n/a | ✓ 4 | n/a | n/a | n/a | ✗ 4/4 |
| Operation Type Existence (`operationTypeExistence`) | MUST | [§5.2.1.1](https://spec.graphql.org/draft/#sec-Operation-Type-Existence) | ✗ 12/12 (all draft only) | ✓ 12 | ✓ 12 | n/a | ✓ 12 | n/a | n/a | n/a | ✗ 9/12 (all draft only) |
| Operation Name Uniqueness (`operationNameUniqueness`) | MUST | [§5.2.2.1](https://spec.graphql.org/draft/#sec-Operation-Name-Uniqueness) | ✓ 6 | ✓ 6 | ✓ 6 | n/a | ✓ 6 | n/a | n/a | n/a | ✓ 6 |
| Lone Anonymous Operation (`loneAnonymousOperation`) | MUST | [§5.2.3.1](https://spec.graphql.org/draft/#sec-Lone-Anonymous-Operation) | ✓ 21 | ✓ 21 | ✓ 21 | n/a | ✓ 21 | n/a | n/a | n/a | ✓ 21 |
| Single Root Field (`singleRootField`) | MUST | [§5.2.4.1](https://spec.graphql.org/draft/#sec-Single-Root-Field) | ✗ 12/59 (all draft only) | ✓ 59 | ✗ 1/59 (all draft only) | n/a | ✗ 22/59 (all draft only) | n/a | n/a | n/a | ✗ 15/59 (all draft only) |
| Field Selections (`fieldSelections`) | MUST | [§5.3.1](https://spec.graphql.org/draft/#sec-Field-Selections) | ✓ 25 | ✓ 25 | ✓ 25 | n/a | ✓ 25 | n/a | n/a | n/a | ✓ 25 |
| Field Selection Merging (`fieldSelectionMerging`) | MUST | [§5.3.2](https://spec.graphql.org/draft/#sec-Field-Selection-Merging) | ✗ 22/674 | ✗ 22/674 | ✗ 22/674 | n/a | ✗ 4/674 | n/a | n/a | n/a | ✗ 22/674 |
| Leaf Field Selections (`leafFieldSelections`) | MUST | [§5.3.3](https://spec.graphql.org/draft/#sec-Leaf-Field-Selections) | ✓ 39 | ✓ 39 | ✓ 39 | n/a | ✓ 39 | n/a | n/a | n/a | ✓ 39 |
| Argument Names (`argumentNames`) | MUST | [§5.4.1](https://spec.graphql.org/draft/#sec-Argument-Names) | ✓ 8 | ✓ 8 | ✓ 8 | n/a | ✓ 8 | n/a | n/a | n/a | ✓ 8 |
| Argument Uniqueness (`argumentUniqueness`) | MUST | [§5.4.2](https://spec.graphql.org/draft/#sec-Argument-Uniqueness) | ✓ 6 | ✓ 6 | ✓ 6 | n/a | ✓ 6 | n/a | n/a | n/a | ✓ 6 |
| Required Arguments (`requiredArguments`) | MUST | [§5.4.3](https://spec.graphql.org/draft/#sec-Required-Arguments) | ✓ 11 | ✓ 11 | ✓ 11 | n/a | ✓ 11 | n/a | n/a | n/a | ✓ 11 |
| Fragment Name Uniqueness (`fragmentNameUniqueness`) | MUST | [§5.5.1.1](https://spec.graphql.org/draft/#sec-Fragment-Name-Uniqueness) | ✓ 10 | ✓ 10 | ✓ 10 | n/a | ✓ 10 | n/a | n/a | n/a | ✓ 10 |
| Fragment Spread Type Existence (`fragmentSpreadTypeExistence`) | MUST | [§5.5.1.2](https://spec.graphql.org/draft/#sec-Fragment-Spread-Type-Existence) | ✓ 12 | ✓ 12 | ✓ 12 | n/a | ✓ 12 | n/a | n/a | n/a | ✓ 12 |
| Fragments on Object, Interface or Union Types (`fragmentsOnObjectInterfaceOrUnionTypes`) | MUST | [§5.5.1.3](https://spec.graphql.org/draft/#sec-Fragments-on-Object-Interface-or-Union-Types) | ✓ 14 | ✓ 14 | ✓ 14 | n/a | ✓ 14 | n/a | n/a | n/a | ✓ 14 |
| Fragments Must Be Used (`fragmentsMustBeUsed`) | MUST | [§5.5.1.4](https://spec.graphql.org/draft/#sec-Fragments-Must-Be-Used) | ✓ 78 | ✓ 78 | ✓ 78 | n/a | ✓ 78 | n/a | n/a | n/a | ✓ 78 |
| Fragment Spread Target Defined (`fragmentSpreadTargetDefined`) | MUST | [§5.5.2.1](https://spec.graphql.org/draft/#sec-Fragment-Spread-Target-Defined) | ✓ 9 | ✓ 9 | ✓ 9 | n/a | ✓ 9 | n/a | n/a | n/a | ✓ 9 |
| Fragment Spreads Must Not Form Cycles (`fragmentSpreadsMustNotFormCycles`) | MUST | [§5.5.2.2](https://spec.graphql.org/draft/#sec-Fragment-Spreads-Must-Not-Form-Cycles) | ✓ 54 | ✓ 54 | ✓ 54 | n/a | ✓ 54 | n/a | n/a | n/a | ✓ 54 |
| Fragment Spread Is Possible (`fragmentSpreadIsPossible`) | MUST | [§5.5.2.3](https://spec.graphql.org/draft/#sec-Fragment-Spread-Is-Possible) | ✓ 36 | ✓ 36 | ✓ 36 | n/a | ✓ 36 | n/a | n/a | n/a | ✓ 36 |
| Values of Correct Type (`valuesOfCorrectType`) | MUST | [§5.6.1](https://spec.graphql.org/draft/#sec-Values-of-Correct-Type) | ✓ 282 | ✓ 282 | ✗ 1/282 (all draft only) | n/a | ✗ 28/282 (5 draft only) | n/a | n/a | n/a | ✓ 282 |
| Input Object Field Names (`inputObjectFieldNames`) | MUST | [§5.6.2](https://spec.graphql.org/draft/#sec-Input-Object-Field-Names) | ⊂ | ⊂ | ⊂ | n/a | ⊂ | n/a | n/a | n/a | ⊂ |
| Input Object Field Uniqueness (`inputObjectFieldUniqueness`) | MUST | [§5.6.3](https://spec.graphql.org/draft/#sec-Input-Object-Field-Uniqueness) | ✓ 6 | ✓ 6 | ✓ 6 | n/a | ✓ 6 | n/a | n/a | n/a | ✓ 6 |
| Input Object Required Fields (`inputObjectRequiredFields`) | MUST | [§5.6.4](https://spec.graphql.org/draft/#sec-Input-Object-Required-Fields) | ⊂ | ⊂ | ⊂ | n/a | ⊂ | n/a | n/a | n/a | ⊂ |
| Directives Are Defined (`directivesAreDefined`) | MUST | [§5.7.1](https://spec.graphql.org/draft/#sec-Directives-Are-Defined) | ✓ 24 | ✓ 24 | ✓ 24 | n/a | ✓ 24 | n/a | n/a | n/a | ✓ 24 |
| Directives Are in Valid Locations (`directivesAreInValidLocations`) | MUST | [§5.7.2](https://spec.graphql.org/draft/#sec-Directives-Are-in-Valid-Locations) | ✓ 27 | ✓ 27 | ✓ 27 | n/a | ✓ 27 | n/a | n/a | n/a | ✓ 27 |
| Directives Are Unique per Location (`directivesAreUniquePerLocation`) | MUST | [§5.7.3](https://spec.graphql.org/draft/#sec-Directives-Are-Unique-per-Location) | ✓ 10 | ✓ 10 | ✗ 1/10 | n/a | ✓ 10 | n/a | n/a | n/a | ✓ 10 |
| Variable Uniqueness (`variableUniqueness`) | MUST | [§5.8.1](https://spec.graphql.org/draft/#sec-Variable-Uniqueness) | ✓ 6 | ✓ 6 | ✓ 6 | n/a | ✓ 6 | n/a | n/a | n/a | ✓ 6 |
| Variables Are Input Types (`variablesAreInputTypes`) | MUST | [§5.8.2](https://spec.graphql.org/draft/#sec-Variables-Are-Input-Types) | ✓ 4 | ✓ 4 | ✓ 4 | n/a | ✓ 4 | n/a | n/a | n/a | ✓ 4 |
| All Variable Uses Defined (`allVariableUsesDefined`) | MUST | [§5.8.3](https://spec.graphql.org/draft/#sec-All-Variable-Uses-Defined) | ✓ 15 | ✓ 15 | ✓ 15 | n/a | ✓ 15 | n/a | n/a | n/a | ✓ 15 |
| All Variables Used (`allVariablesUsed`) | MUST | [§5.8.4](https://spec.graphql.org/draft/#sec-All-Variables-Used) | ✓ 18 | ✓ 18 | ✓ 18 | n/a | ✓ 18 | n/a | n/a | n/a | ✓ 18 |
| All Variable Usages Are Allowed (`allVariableUsagesAreAllowed`) | MUST | [§5.8.5](https://spec.graphql.org/draft/#sec-All-Variable-Usages-Are-Allowed) | ✗ 2/636 (all draft only) | ✗ 2/636 (all draft only) | ✗ 4/636 (all draft only) | n/a | ✓ 636 | n/a | n/a | n/a | ✗ 71/636 |
| Valid documents are accepted (`acceptsValid`) | MUST | [§5](https://spec.graphql.org/draft/#sec-Validation) | ✓ 984 | ✓ 984 | ✓ 984 | n/a | ✗ 30/984 | n/a | n/a | n/a | ✗ 40/984 |

## Coerce: each check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **(draft only):** the failing cases rely on grammar or rules that are only in the draft, not in the October 2021 edition.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | graphql-js 16.15.0 | graphql-js 17.1.0 | graphql-java 26.2 | async-graphql 7.0.17 (dynamic schema) | Hot Chocolate 15.1.21 | graphql-core 3.2.14 | graphql-ruby 2.6.15 | graphql-go/graphql 0.8.1 | graphql-dotnet 8.8.5 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Int accepts only integer input values (`int`) | MUST | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) | ✓ 342 | ✓ 342 | ✓ 190 | n/a | ✗ 4/189 | n/a | n/a | n/a | n/a |
| Int rejects integers outside the signed 32-bit range (`intRange`) | SHOULD | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) | ✓ 32 | ✓ 32 | ✓ 20 | n/a | ✓ 20 | n/a | n/a | n/a | n/a |
| Float accepts integer and float input values, and rejects non-finite values (`float`) | MUST | [§3.5.2](https://spec.graphql.org/draft/#sec-Float) | ✗ 1/92 | ✗ 1/92 | ✓ 58 | n/a | ✓ 57 | n/a | n/a | n/a | n/a |
| Float rejects an integer a double can't hold exactly (`floatPrecision`) | SHOULD | [§3.5.2](https://spec.graphql.org/draft/#sec-Float) | ! 1/1 | ! 1/1 | – | n/a | ! 1/1 | n/a | n/a | n/a | n/a |
| String accepts only string input values (`string`) | MUST | [§3.5.3](https://spec.graphql.org/draft/#sec-String) | ✓ 93 | ✓ 93 | ✓ 51 | n/a | ✓ 50 | n/a | n/a | n/a | n/a |
| Boolean accepts only boolean input values (`boolean`) | MUST | [§3.5.4](https://spec.graphql.org/draft/#sec-Boolean) | ✓ 94 | ✓ 94 | ✓ 50 | n/a | ✓ 49 | n/a | n/a | n/a | n/a |
| String and integer input values are coerced to ID strings (`idCoerced`) | SHOULD | [§3.5.5](https://spec.graphql.org/draft/#sec-ID) | ✓ 27 | ✓ 27 | ✓ 27 | n/a | ! 3/28 | n/a | n/a | n/a | n/a |
| ID rejects input values other than strings and integers (`id`) | MUST | [§3.5.5](https://spec.graphql.org/draft/#sec-ID) | ✓ 64 | ✓ 64 | ✗ 30/30 | n/a | ✓ 30 | n/a | n/a | n/a | n/a |
| Enums accept their own values, and reject string literals and unknown values (`enum`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✓ 188 | ✓ 188 | ✓ 98 | n/a | ✓ 97 | n/a | n/a | n/a | n/a |
| Input objects: an object of defined fields, required fields, variables in fields (`inputObject`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✗ 4/413 | ✓ 413 | ✓ 232 | n/a | ✗ 2/219 | n/a | n/a | n/a | n/a |
| An omitted input field gets its default value (`inputFieldDefaults`) | SHOULD | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 59 | ✓ 59 | ✓ 56 | n/a | ✓ 49 | n/a | n/a | n/a | n/a |
| OneOf input objects take exactly one non-null field (`oneOf`) | MUST | [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | – | – | – | n/a | – | n/a | n/a | n/a | n/a |
| Lists: each item coerced, a single value wrapped in a list (`list`) | MUST | [§3.11](https://spec.graphql.org/draft/#sec-List) | ✗ 1/489 | ✓ 489 | ✗ 1/302 | n/a | ✗ 17/299 (10 draft only) | n/a | n/a | n/a | n/a |
| Non-Null rejects null (`nonNull`) | MUST | [§3.12](https://spec.graphql.org/draft/#sec-Non-Null) | ✓ 4 | ✓ 4 | – | n/a | – | n/a | n/a | n/a | n/a |
| CoerceVariableValues: defaults, missing and null values, and failures as request errors (`variables`) | MUST | [§6.1.2](https://spec.graphql.org/draft/#sec-Coercing-Variable-Values) | ✓ 896 | ✓ 896 | ✓ 893 | n/a | ✗ 11/849 (1 draft only) | n/a | n/a | n/a | n/a |
| CoerceArgumentValues: defaults, missing variables, and failures as field errors (`arguments`) | MUST | [§6.4.1](https://spec.graphql.org/draft/#sec-Coercing-Field-Arguments) | ✓ 820 | ✓ 820 | ✓ 33 | n/a | ✗ 4/20 | n/a | n/a | n/a | n/a |
| GetOperation: the operation operationName names, or the only one, else a request error (`getOperation`) | MUST | [§6.1](https://spec.graphql.org/draft/#sec-Executing-Requests) | ✓ 22 | ✓ 22 | ✓ 18 | n/a | ✓ 18 | n/a | n/a | n/a | n/a |
| An invalid document fails as a request error, without executing (`invalidNotExecuted`) | MUST | [§6.1.1](https://spec.graphql.org/draft/#sec-Validating-Requests) | – | – | ✓ 775 | n/a | ✗ 58/775 | n/a | n/a | n/a | n/a |
| A request error result has no data entry (`requestErrorNoData`) | MUST (Oct 2021: SHOULD) | [§7.1.3](https://spec.graphql.org/draft/#sec-Request-Error-Result) | ✓ 801 | ✓ 801 | ✓ 1571 | n/a | ✓ 1569 | n/a | n/a | n/a | n/a |
| JSON strings with a lone surrogate: kept as sent, replaced with U+FFFD, or refused (`loneSurrogates`) | INFO | — | ✓ 2 | ✓ 2 | ✓ 2 | n/a | i 2/2 | n/a | n/a | n/a | n/a |
| JSON numbers a double can't hold: read exactly, read as binary64, or refused (`jsonNumbers`) | INFO | — | ✓ 3 | ✓ 3 | i 1/3 | n/a | – | n/a | n/a | n/a | n/a |

## Schema: each check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **(draft only):** the failing cases rely on grammar or rules that are only in the draft, not in the October 2021 edition.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | graphql-js 16.15.0 | graphql-js 17.1.0 | graphql-java 26.2 | async-graphql 7.0.17 (dynamic schema) | Hot Chocolate 15.1.21 | graphql-core 3.2.14 | graphql-ruby 2.6.15 | graphql-go/graphql 0.8.1 | graphql-dotnet 8.8.5 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| No two types have the same name (`typeNamesUnique`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✓ 2 | ✓ 2 | ✓ 2 | n/a | ✗ 1/2 | n/a | n/a | n/a | ✓ 2 |
| No type is named like a built-in type (`typeNameNotBuiltin`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✗ 1/3 | ✗ 1/3 | ✗ 1/3 | n/a | ✗ 1/3 | n/a | n/a | n/a | ✗ 1/3 |
| No type name begins with __ (`typeNameReserved`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✓ 2 | ✓ 2 | ✗ 1/2 | n/a | ✗ 1/2 | n/a | n/a | n/a | ✓ 2 |
| No two directives have the same name (`directiveNamesUnique`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✓ 2 | ✓ 2 | ✓ 2 | n/a | ✓ 2 | n/a | n/a | n/a | ✓ 2 |
| No directive name begins with __ (`directiveNameReserved`) | MUST | [§3.3](https://spec.graphql.org/draft/#sec-Schema) | ✓ 2 | ✓ 2 | ✓ 2 | n/a | ✓ 2 | n/a | n/a | n/a | ✓ 2 |
| The query root operation type is provided (`queryRootProvided`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✓ 4 | ✓ 4 | ✓ 4 | n/a | ✓ 4 | n/a | n/a | n/a | ✓ 4 |
| Root operation types are object types (`rootTypesAreObjects`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✓ 6 | ✓ 6 | ✗ 2/6 | n/a | ✓ 6 | n/a | n/a | n/a | ✗ 2/6 |
| Root operation types are all different (`rootTypesDifferent`) | MUST | [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✗ 2/4 | ✓ 4 | ✗ 2/4 | n/a | ✗ 2/4 | n/a | n/a | n/a | ✓ 4 |
| An object or interface type defines one or more fields (`fieldsDefined`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 4 | ✓ 4 | ✓ 4 | n/a | ✓ 4 | n/a | n/a | n/a | ✓ 4 |
| Field names are unique within a type (`fieldNamesUnique`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 4 | ✓ 4 | ✓ 4 | n/a | ✗ 1/4 | n/a | n/a | n/a | ✓ 4 |
| No field name begins with __ (`fieldNameReserved`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 2 | ✓ 2 | ✓ 2 | n/a | ✓ 2 | n/a | n/a | n/a | ✓ 2 |
| Fields return output types (`fieldOutputType`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✓ 4 | ✓ 4 | ✓ 4 | n/a | ✓ 4 | n/a | n/a | n/a | ✓ 4 |
| No argument name begins with __ (`argNameReserved`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 4 | ✓ 4 | ✓ 4 | n/a | ✓ 4 | n/a | n/a | n/a | ✓ 4 |
| Argument names are unique within a field or directive (`argNamesUnique`) | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 4 | ✓ 4 | ✓ 4 | n/a | ✓ 4 | n/a | n/a | n/a | ✓ 4 |
| Arguments accept input types (`argInputType`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✓ 6 | ✓ 6 | ✗ 1/6 | n/a | ✓ 6 | n/a | n/a | n/a | ✓ 6 |
| A required argument isn't deprecated (`requiredArgNotDeprecated`) | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✓ 8 | ✓ 8 | ✓ 8 | n/a | ✗ 1/8 (all draft only) | n/a | n/a | n/a | ✗ 1/8 (all draft only) |
| An object field argument's default value coerces to its type (`argDefaultCompatible`) | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 10/20 (all draft only) | ✗ 1/20 (all draft only) | ✗ 2/20 (all draft only) | n/a | ✗ 10/20 (all draft only) | n/a | n/a | n/a | ✗ 4/20 (all draft only) |
| A type implements each interface once (`implementsUnique`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 2 | ✓ 2 | ✗ 1/2 | n/a | ✗ 1/2 | n/a | n/a | n/a | ✗ 1/2 |
| A type implements only interface types (`implementsInterfaces`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 2 | ✓ 2 | ✓ 2 | n/a | ✗ 1/2 | n/a | n/a | n/a | ✗ 1/2 |
| An interface doesn't implement itself (`implementsItself`) | MUST | [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) | ✓ 2 | ✓ 2 | ✓ 2 | n/a | ✗ 1/2 | n/a | n/a | n/a | ✗ 1/2 |
| A type also implements the interfaces its interfaces implement (`implTransitive`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 4 | ✓ 4 | ✓ 4 | n/a | ✗ 2/4 | n/a | n/a | n/a | ✗ 1/4 |
| An implementation has every field of the interface (`implFieldProvided`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 2 | ✓ 2 | ✓ 2 | n/a | ✓ 2 | n/a | n/a | n/a | ✓ 2 |
| An implementation's field has every argument of the interface field (`implArgProvided`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 2 | ✓ 2 | ✓ 2 | n/a | ✓ 2 | n/a | n/a | n/a | ✓ 2 |
| An implementation's field arguments have the interface's argument types (`implArgInvariant`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 4 | ✓ 4 | ✓ 4 | n/a | ✓ 4 | n/a | n/a | n/a | ✗ 2/4 |
| An implementation's additional arguments aren't required (`implExtraArgOptional`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 2 | ✓ 2 | ✓ 2 | n/a | ✓ 2 | n/a | n/a | n/a | ✓ 2 |
| An implementation's field returns a subtype of the interface field's type (`implFieldCovariant`) | MUST | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✓ 8 | ✓ 8 | ✓ 8 | n/a | ✓ 8 | n/a | n/a | n/a | ✗ 1/8 |
| A deprecated implementation field implements a deprecated field (`implDeprecation`) | MUST (draft only) | [§3.6](https://spec.graphql.org/draft/#sec-Objects) | ✗ 1/2 (all draft only) | ✓ 2 | ✗ 1/2 (all draft only) | n/a | ✗ 1/2 (all draft only) | n/a | n/a | n/a | ✗ 1/2 (all draft only) |
| A union has one or more member types (`unionMembersDefined`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✓ 2 | ✓ 2 | ✓ 2 | n/a | ✓ 2 | n/a | n/a | n/a | ✓ 2 |
| A union's member types are unique (`unionMembersUnique`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✓ 2 | ✓ 2 | ✓ 2 | n/a | ✗ 1/2 | n/a | n/a | n/a | ✗ 1/2 |
| A union's member types are object types (`unionMembersObjects`) | MUST | [§3.8](https://spec.graphql.org/draft/#sec-Unions) | ✓ 6 | ✓ 6 | ✓ 6 | n/a | ✓ 6 | n/a | n/a | n/a | ✗ 2/6 |
| An enum has one or more values (`enumValuesDefined`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✓ 2 | ✓ 2 | ✓ 2 | n/a | ✓ 2 | n/a | n/a | n/a | ✓ 2 |
| An enum's values are unique (`enumValuesUnique`) | MUST | [§3.9](https://spec.graphql.org/draft/#sec-Enums) | ✓ 2 | ✓ 2 | ✓ 2 | n/a | ✗ 1/2 | n/a | n/a | n/a | ✗ 1/2 |
| No enum value begins with __ (`enumValueNameReserved`) | MUST | [§4](https://spec.graphql.org/draft/#sec-Introspection) | ✓ 2 | ✓ 2 | ✓ 2 | n/a | ✗ 1/2 | n/a | n/a | n/a | ✓ 2 |
| An input object has one or more fields (`inputFieldsDefined`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 2 | ✓ 2 | ✓ 2 | n/a | ✓ 2 | n/a | n/a | n/a | ✓ 2 |
| Input field names are unique within an input object (`inputFieldNamesUnique`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 2 | ✓ 2 | ✓ 2 | n/a | ✓ 2 | n/a | n/a | n/a | ✓ 2 |
| No input field name begins with __ (`inputFieldNameReserved`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✓ 2 | ✓ 2 | ✓ 2 | n/a | ✓ 2 | n/a | n/a | n/a | ✓ 2 |
| Input fields accept input types (`inputFieldInputType`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) | ✓ 2 | ✓ 2 | ✗ 1/2 | n/a | ✓ 2 | n/a | n/a | n/a | ✓ 2 |
| A required input field isn't deprecated (`requiredInputFieldNotDeprecated`) | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✓ 2 | ✓ 2 | ✓ 2 | n/a | ✓ 2 | n/a | n/a | n/a | ✓ 2 |
| A OneOf input object's fields are nullable (`oneOfFieldNullable`) | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 2 | ✓ 2 | ✓ 2 | n/a | ✓ 2 | n/a | n/a | n/a | ✓ 2 |
| A OneOf input object's fields have no default value (`oneOfFieldNoDefault`) | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) | ✓ 2 | ✓ 2 | ✓ 2 | n/a | ✓ 2 | n/a | n/a | n/a | ✓ 2 |
| An input object can be given a finite value (`inputObjectUnbreakableCycle`) | MUST | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✗ 2/10 (all draft only) | ✓ 10 | ✗ 1/10 (all draft only) | n/a | ✗ 2/10 (all draft only) | n/a | n/a | n/a | ✗ 5/10 (2 draft only) |
| Input object default values don't form a cycle (`inputObjectDefaultValueCycle`) | MUST (draft only) | [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) | ✗ 7/8 (4 draft only) | ✓ 8 | ✓ 8 | n/a | ✗ 4/8 (all draft only) | n/a | n/a | n/a | ✓ 8 |
| A directive has one or more locations (`directiveLocationsDefined`) | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | – | – | – | n/a | – | n/a | n/a | n/a | – |
| A directive definition doesn't use itself (`directiveUsesItself`) | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 1/2 | ✗ 1/2 | ✓ 2 | n/a | ✗ 1/2 | n/a | n/a | n/a | ✗ 1/2 |
| A directive definition doesn't reference itself through a type or directive (`directiveReferencesItselfIndirectly`) | MUST | [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 1/4 | ✗ 1/4 | ✓ 4 | n/a | ✗ 1/4 | n/a | n/a | n/a | ✗ 1/4 |

## Introspect: each check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **(draft only):** the failing cases rely on grammar or rules that are only in the draft, not in the October 2021 edition.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | graphql-js 16.15.0 | graphql-js 17.1.0 | graphql-java 26.2 | async-graphql 7.0.17 (dynamic schema) | Hot Chocolate 15.1.21 | graphql-core 3.2.14 | graphql-ruby 2.6.15 | graphql-go/graphql 0.8.1 | graphql-dotnet 8.8.5 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| The response is a well-formed execution result: data, errors only as a non-empty list, extensions a map, nothing else (`envelope`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ 38 | ✓ 38 | ✓ 28 | n/a | ✓ 28 | n/a | n/a | n/a | ✓ 28 |
| The query executes, and its result has exactly the fields it selects, nulls included (`executes`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✗ 3/38 (all draft only) | ✓ 38 | ✓ 28 | n/a | ✓ 28 | n/a | n/a | n/a | ✓ 28 |
| queryType, mutationType and subscriptionType are the root operation types (`roots`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) | ✓ 22 | ✓ 24 | ✓ 18 | n/a | ✓ 18 | n/a | n/a | n/a | ✓ 18 |
| types is the set of all named types (`types`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) | ✓ 22 | ✓ 24 | ✓ 18 | n/a | ✓ 18 | n/a | n/a | n/a | ✓ 18 |
| types has the built-in scalars the schema references, and no others (`builtinScalars`) | MUST | [§3.5](https://spec.graphql.org/draft/#sec-Scalars) [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) | ✓ 22 | ✓ 24 | ✓ 18 | n/a | ✓ 18 | n/a | n/a | n/a | ✓ 18 |
| __type(name:) returns the named type, and null for a name the schema doesn't have (`typeByName`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 13 | ✓ 14 | ✓ 10 | n/a | ✓ 10 | n/a | n/a | n/a | ✓ 10 |
| Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (`typeKinds`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) | ✓ 35 | ✓ 38 | ✓ 28 | n/a | ✓ 28 | n/a | n/a | n/a | ✓ 28 |
| An object's or interface's fields, with their types (`fields`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) | ✓ 35 | ✓ 38 | ✓ 28 | n/a | ✓ 28 | n/a | n/a | n/a | ✓ 28 |
| Field and directive arguments, with their types (`arguments`) | MUST | [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) | ✓ 35 | ✓ 38 | ✓ 28 | n/a | ✓ 28 | n/a | n/a | n/a | ✓ 28 |
| defaultValue encodes the default value, and is null without one (`defaultValue`) | MUST | [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | ✓ 35 | ✓ 38 | ✓ 28 | n/a | ✗ 3/28 | n/a | n/a | n/a | ✗ 3/28 |
| An input object's inputFields, with their types (`inputFields`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) | ✓ 35 | ✓ 38 | ✓ 28 | n/a | ✓ 28 | n/a | n/a | n/a | ✓ 28 |
| An enum's enumValues (`enumValues`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) | ✓ 35 | ✓ 38 | ✓ 28 | n/a | ✓ 28 | n/a | n/a | n/a | ✓ 28 |
| interfaces, and possibleTypes for unions and interfaces (`interfaces`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) | ✓ 35 | ✓ 38 | ✓ 28 | n/a | ✓ 28 | n/a | n/a | n/a | ✓ 28 |
| isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something (`deprecation`) | MUST (Oct 2021: fields and enum values only) | [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) | ✓ 35 | ✓ 38 | ✓ 28 | n/a | ✗ 4/28 | n/a | n/a | n/a | ✓ 28 |
| specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null; @specifiedBy is returned when a scalar has a URL (`specifiedByURL`) | MUST | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) | ✓ 35 | ✓ 38 | ✓ 28 | n/a | ✗ 3/28 | n/a | n/a | n/a | ✗ 28/28 |
| isOneOf is true exactly for OneOf input objects; @oneOf is returned when one is (`isOneOf`) | MUST (draft only) | [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 35 | ✓ 38 | – | n/a | – | n/a | n/a | n/a | – |
| Descriptions are the schema's (`descriptions`) | MUST | [§3.2](https://spec.graphql.org/draft/#sec-Type-System-Descriptions) [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 35 | ✓ 38 | ✗ 6/28 | n/a | ✗ 6/28 | n/a | n/a | n/a | ✗ 3/28 |
| directives describes the schema's own directives (name, locations, isRepeatable), and any of the service's own takes input types (`directives`) | MUST | [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✓ 22 | ✓ 24 | ✓ 18 | n/a | ✗ 2/18 | n/a | n/a | n/a | ✗ 18/18 |
| @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (`builtinDirectives`) | SHOULD | [§3.13](https://spec.graphql.org/draft/#sec-Directives) [§3.13.1](https://spec.graphql.org/draft/#sec-skip) [§3.13.2](https://spec.graphql.org/draft/#sec-include) [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) [§3.13.5](https://spec.graphql.org/draft/#sec-oneOf) | ✓ 22 | ✓ 24 | ✓ 18 | n/a | ! 2/18 | n/a | n/a | n/a | ! 4/18 |
| The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (`builtinDefinitions`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/draft/#sec-Directives) | ✗ 22/35 (4 draft only) | ✓ 38 | ✗ 18/28 | n/a | ✗ 18/28 | n/a | n/a | n/a | ✗ 18/28 |
| The introspection types have no field, argument, enum value or type the spec doesn't define (`builtinAdditions`) | INFO | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 35 | i 24/38 | i 18/28 | n/a | i 18/28 | n/a | n/a | n/a | i 18/28 |
| __typename names the root type, and no fields list includes it (`typename`) | MUST | [§4.1](https://spec.graphql.org/draft/#sec-Type-Name-Introspection) | ✓ 35 | ✓ 38 | ✓ 28 | n/a | ✓ 28 | n/a | n/a | n/a | ✓ 28 |
| Fields, arguments, enum values, directives, members and interfaces come in source order (`order`) | SHOULD (draft only) | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 35 | ✓ 38 | – | n/a | – | n/a | n/a | n/a | – |
| Anything else Introspection!Matches requires (`other`) | MUST | [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) | ✓ 35 | ✓ 38 | ✓ 28 | n/a | ✓ 28 | n/a | n/a | n/a | ✓ 28 |

## By spec section

A section's verdict comes from the checks that cite it, and names the ones that failed. Sections that fixtures exercise but no check targets have no verdict of their own; their fixtures' verdicts are above.

| Section | graphql-js 16.15.0 | graphql-js 17.1.0 | graphql-java 26.2 | async-graphql 7.0.17 (dynamic schema) | Hot Chocolate 15.1.21 | graphql-core 3.2.14 | graphql-ruby 2.6.15 | graphql-go/graphql 0.8.1 | graphql-dotnet 8.8.5 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| [§2.1](https://spec.graphql.org/draft/#sec-Source-Text) Source Text | ✓ | ✓ | ✓ |   | ✗ (draft only) `sourceText` |   |   |   | ✓ |
| [§2.1.1](https://spec.graphql.org/draft/#sec-White-Space) White Space | ✓ | ✓ | ✓ |   | ✗ (draft only) `whiteSpace` |   |   |   | ✓ |
| [§2.1.2](https://spec.graphql.org/draft/#sec-Line-Terminators) Line Terminators | ✓ | ✓ | ✗ `lineTerminators` |   | ✓ |   |   |   | ✓ |
| [§2.1.3](https://spec.graphql.org/draft/#sec-Comments) Comments | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§2.1.4](https://spec.graphql.org/draft/#sec-Insignificant-Commas) Insignificant Commas | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§2.1.5](https://spec.graphql.org/draft/#sec-Lexical-Tokens) Lexical Tokens | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§2.1.6](https://spec.graphql.org/draft/#sec-Ignored-Tokens) Ignored Tokens | ✓ | ✓ | ✓ |   | ✗ `ignoredTokens` |   |   |   | ✓ |
| [§2.1.7](https://spec.graphql.org/draft/#sec-Punctuators) Punctuators | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§2.1.8](https://spec.graphql.org/draft/#sec-Names) Names | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§2.2](https://spec.graphql.org/draft/#sec-Descriptions) Descriptions | ✓ | ✓ | ✗ (draft only) `descriptions` |   | ✗ `descriptions` |   |   |   | ✗ (draft only) `descriptions` |
| [§2.3](https://spec.graphql.org/draft/#sec-Document) Document | ✓ | ✓ | ✓ |   | ✗ `document` |   |   |   | ✗ `document` |
| [§2.4](https://spec.graphql.org/draft/#sec-Operations) Operations | ✓ | ✓ | ✓ |   | ✗ `operations` |   |   |   | ✓ |
| [§2.5](https://spec.graphql.org/draft/#sec-Selection-Sets) Selection Sets | ✗ (draft only) `selectionSets` | ✓ | ✗ (draft only) `selectionSets` |   | ✗ `selectionSets` |   |   |   | ✗ (draft only) `selectionSets` |
| [§2.6](https://spec.graphql.org/draft/#sec-Fields) Fields | ✓ | ✓ | ✓ |   | ✗ `fields` |   |   |   | ✓ |
| [§2.7](https://spec.graphql.org/draft/#sec-Arguments) Arguments | ✓ | ✓ | ✓ |   | ✗ `arguments` |   |   |   | ✓ |
| [§2.8](https://spec.graphql.org/draft/#sec-Field-Alias) Field Alias | ✓ | ✓ | ✓ |   | ✗ `fieldAlias` |   |   |   | ✓ |
| [§2.9](https://spec.graphql.org/draft/#sec-Fragments) Fragments | ✓ | ✓ | ✓ |   | ✗ `fragments` |   |   |   | ✓ |
| [§2.9.1](https://spec.graphql.org/draft/#sec-Type-Conditions) Type Conditions | ✓ | ✓ | ✓ |   | ✗ `typeConditions` |   |   |   | ✓ |
| [§2.9.2](https://spec.graphql.org/draft/#sec-Inline-Fragments) Inline Fragments | ✓ | ✓ | ✓ |   | ✗ `inlineFragments` |   |   |   | ✓ |
| [§2.10](https://spec.graphql.org/draft/#sec-Input-Values) Input Values | ✓ | ✓ | ✓ |   | ✗ `inputValues` |   |   |   | ✓ |
| [§2.10.1](https://spec.graphql.org/draft/#sec-Int-Value) Int Value | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✗ `intValue` |
| [§2.10.2](https://spec.graphql.org/draft/#sec-Float-Value) Float Value | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§2.10.3](https://spec.graphql.org/draft/#sec-Boolean-Value) Boolean Value | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value) String Value | ✗ (draft only) `stringValue` | ✗ (draft only) `stringValue` | ✗ `stringValue` |   | ✗ `stringValue` |   |   |   | ✗ (draft only) `stringValue` |
| [§2.10.5](https://spec.graphql.org/draft/#sec-Null-Value) Null Value | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§2.10.6](https://spec.graphql.org/draft/#sec-Enum-Value) Enum Value | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§2.10.7](https://spec.graphql.org/draft/#sec-List-Value) List Value | ✓ | ✓ | ✓ |   | ✗ `listValue` |   |   |   | ✓ |
| [§2.10.8](https://spec.graphql.org/draft/#sec-Input-Object-Values) Input Object Values | ✓ | ✓ | ✓ |   | ✗ `inputObjectValues` |   |   |   | ✓ |
| [§2.11](https://spec.graphql.org/draft/#sec-Variables) Variables | ✓ | ✓ | ✗ `variables` |   | ✗ `variables` |   |   |   | ✗ `variables` |
| [§2.12](https://spec.graphql.org/draft/#sec-Type-References) Type References | ✓ | ✓ | ✓ |   | ✗ `typeReferences` |   |   |   | ✓ |
| [§2.13](https://spec.graphql.org/draft/#sec-Directives) Directives | ✓ | ✓ | ✓ |   | ✗ `directives` |   |   |   | ✓ |
| [§3.2](https://spec.graphql.org/draft/#sec-Type-System-Descriptions) Type System Descriptions | ✓ | ✓ | ✗ `descriptions` |   | ✗ `descriptions` |   |   |   | ✗ `descriptions` |
| [§3.3](https://spec.graphql.org/draft/#sec-Schema) Schema | ✗ `typeNameNotBuiltin` | ✗ `typeNameNotBuiltin` | ✗ `typeNameNotBuiltin` `typeNameReserved` |   | ✗ `typeNamesUnique` `typeNameNotBuiltin` `typeNameReserved` |   |   |   | ✗ `typeNameNotBuiltin` |
| [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) Root Operation Types | ✗ `rootTypesDifferent` | ✓ | ✗ `rootTypesAreObjects` `rootTypesDifferent` |   | ✗ `rootTypesDifferent` |   |   |   | ✗ `rootTypesAreObjects` |
| [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) Input and Output Types | ✓ | ✓ | ✗ `argInputType` `inputFieldInputType` |   | ✓ |   |   |   | ✓ |
| [§3.5](https://spec.graphql.org/draft/#sec-Scalars) Scalars | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§3.5.1](https://spec.graphql.org/draft/#sec-Int) Int | ✓ | ✓ | ✓ | – | ✗ `int` | ✓ | ! `intFraction` | ! `intFraction` | ✓ |
| [§3.5.2](https://spec.graphql.org/draft/#sec-Float) Float | ✗ `float` | ✗ `float` | ✓ | – | ! `floatPrecision` | ✓ | ✓ | ✗ `resultCoercion` | ✗ `resultCoercion` |
| [§3.5.3](https://spec.graphql.org/draft/#sec-String) String | ✓ | ✓ | ✓ |   | ✓ |   |   |   |   |
| [§3.5.4](https://spec.graphql.org/draft/#sec-Boolean) Boolean | ✓ | ✓ | ✓ |   | ✓ |   |   |   |   |
| [§3.5.5](https://spec.graphql.org/draft/#sec-ID) ID | ✓ | ✓ | ✗ `id` |   | ! `idCoerced` |   |   |   |   |
| [§3.6](https://spec.graphql.org/draft/#sec-Objects) Objects | ✗ (draft only) `argDefaultCompatible` `implDeprecation` | ✗ (draft only) `argDefaultCompatible` | ✗ `argInputType` `implementsUnique` |   | ✗ `fieldNamesUnique` `implementsUnique` `implementsInterfaces` `implTransitive` |   |   |   | ✗ `implementsUnique` `implementsInterfaces` `implTransitive` `implArgInvariant` `implFieldCovariant` |
| [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) Interfaces | ✓ | ✓ | ✗ `implementsUnique` |   | ✗ `fieldNamesUnique` `implementsUnique` `implementsInterfaces` `implementsItself` |   |   |   | ✗ `implementsUnique` `implementsInterfaces` `implementsItself` |
| [§3.8](https://spec.graphql.org/draft/#sec-Unions) Unions | ✓ | ✓ | ✓ |   | ✗ `unionMembersUnique` |   |   |   | ✗ `unionMembersUnique` `unionMembersObjects` |
| [§3.9](https://spec.graphql.org/draft/#sec-Enums) Enums | ✓ | ✓ | ✓ | – | ✗ `enumValuesUnique` | ✓ | ✓ | ✗ `resultCoercion` | ✗ `resultCoercion` `enumValuesUnique` |
| [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) Input Objects | ✗ `inputObject` `inputObjectDefaultValueCycle` | ✓ | ✗ `inputFieldInputType` |   | ✗ `inputObject` |   |   |   | ✗ `inputObjectUnbreakableCycle` |
| [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) OneOf Input Objects | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§3.11](https://spec.graphql.org/draft/#sec-List) List | ✗ `list` | ✓ | ✗ `list` |   | ✗ `list` |   |   |   |   |
| [§3.12](https://spec.graphql.org/draft/#sec-Non-Null) Non-Null | ✓ | ✓ | – |   | – |   |   |   |   |
| [§3.13](https://spec.graphql.org/draft/#sec-Directives) Directives | ✗ `directiveUsesItself` `directiveReferencesItselfIndirectly` `builtinDefinitions` | ✗ `directiveUsesItself` `directiveReferencesItselfIndirectly` | ✗ `builtinDefinitions` |   | ✗ `directiveUsesItself` `directiveReferencesItselfIndirectly` `deprecation` `specifiedByURL` `directives` `builtinDefinitions` |   |   |   | ✗ `directiveUsesItself` `directiveReferencesItselfIndirectly` `specifiedByURL` `directives` `builtinDefinitions` |
| [§3.13.1](https://spec.graphql.org/draft/#sec-skip) @skip | ✓ | ✓ | ✓ |   | ! `builtinDirectives` |   |   |   | ! `builtinDirectives` |
| [§3.13.2](https://spec.graphql.org/draft/#sec-include) @include | ✓ | ✓ | ✓ |   | ! `builtinDirectives` |   |   |   | ! `builtinDirectives` |
| [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) @deprecated | ✓ | ✓ | ✓ |   | ✗ `deprecation` |   |   |   | ✗ (draft only) `requiredArgNotDeprecated` |
| [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) @specifiedBy | ✓ | ✓ | ✓ |   | ✗ `specifiedByURL` |   |   |   | ✗ `specifiedByURL` |
| [§3.13.5](https://spec.graphql.org/draft/#sec-oneOf) @oneOf | ✓ | ✓ | ✓ |   | ! `builtinDirectives` |   |   |   | ! `builtinDirectives` |
| [§4](https://spec.graphql.org/draft/#sec-Introspection) Introspection | ✓ | ✓ | ✓ |   | ✗ `enumValueNameReserved` |   |   |   | ✓ |
| [§4.1](https://spec.graphql.org/draft/#sec-Type-Name-Introspection) Type Name Introspection | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) Schema Introspection | ✗ `builtinDefinitions` | ✓ | ✗ `descriptions` `builtinDefinitions` |   | ✗ `descriptions` `builtinDefinitions` |   |   |   | ✗ `descriptions` `builtinDefinitions` |
| [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) The \_\_Schema Type | ✓ | ✓ | ✓ |   | ✗ `directives` |   |   |   | ✗ `directives` |
| [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) The \_\_Type Type | ✓ | ✓ | ✓ |   | ✗ `specifiedByURL` |   |   |   | ✗ `specifiedByURL` |
| [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) The \_\_Field Type | ✓ | ✓ | ✓ |   | ✗ `deprecation` |   |   |   | ✓ |
| [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) The \_\_InputValue Type | ✓ | ✓ | ✓ |   | ✗ `defaultValue` `deprecation` |   |   |   | ✗ `defaultValue` |
| [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) The \_\_EnumValue Type | ✓ | ✓ | ✓ |   | ✗ `deprecation` |   |   |   | ✓ |
| [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) The \_\_Directive Type | ✓ | ✓ | ✓ |   | ✗ `deprecation` `directives` |   |   |   | ✗ `directives` |
| [§5](https://spec.graphql.org/draft/#sec-Validation) Validation | ✓ | ✓ | ✓ |   | ✗ `acceptsValid` |   |   |   | ✗ `acceptsValid` |
| [§5.1.1](https://spec.graphql.org/draft/#sec-Executable-Definitions) Executable Definitions | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✗ `executableDefinitions` |
| [§5.2.1.1](https://spec.graphql.org/draft/#sec-Operation-Type-Existence) Operation Type Existence | ✗ (draft only) `operationTypeExistence` | ✓ | ✓ |   | ✓ |   |   |   | ✗ (draft only) `operationTypeExistence` |
| [§5.2.2.1](https://spec.graphql.org/draft/#sec-Operation-Name-Uniqueness) Operation Name Uniqueness | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§5.2.3.1](https://spec.graphql.org/draft/#sec-Lone-Anonymous-Operation) Lone Anonymous Operation | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§5.2.4.1](https://spec.graphql.org/draft/#sec-Single-Root-Field) Single Root Field | ✗ (draft only) `singleRootField` | ✓ | ✗ (draft only) `singleRootField` |   | ✗ (draft only) `singleRootField` |   |   |   | ✗ (draft only) `singleRootField` |
| [§5.3.1](https://spec.graphql.org/draft/#sec-Field-Selections) Field Selections | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§5.3.2](https://spec.graphql.org/draft/#sec-Field-Selection-Merging) Field Selection Merging | ✗ `fieldSelectionMerging` | ✗ `fieldSelectionMerging` | ✗ `fieldSelectionMerging` |   | ✗ `fieldSelectionMerging` |   |   |   | ✗ `fieldSelectionMerging` |
| [§5.3.3](https://spec.graphql.org/draft/#sec-Leaf-Field-Selections) Leaf Field Selections | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§5.4.1](https://spec.graphql.org/draft/#sec-Argument-Names) Argument Names | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§5.4.2](https://spec.graphql.org/draft/#sec-Argument-Uniqueness) Argument Uniqueness | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§5.4.3](https://spec.graphql.org/draft/#sec-Required-Arguments) Required Arguments | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§5.5.1.1](https://spec.graphql.org/draft/#sec-Fragment-Name-Uniqueness) Fragment Name Uniqueness | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§5.5.1.2](https://spec.graphql.org/draft/#sec-Fragment-Spread-Type-Existence) Fragment Spread Type Existence | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§5.5.1.3](https://spec.graphql.org/draft/#sec-Fragments-on-Object-Interface-or-Union-Types) Fragments on Object, Interface or Union Types | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§5.5.1.4](https://spec.graphql.org/draft/#sec-Fragments-Must-Be-Used) Fragments Must Be Used | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§5.5.2.1](https://spec.graphql.org/draft/#sec-Fragment-Spread-Target-Defined) Fragment Spread Target Defined | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§5.5.2.2](https://spec.graphql.org/draft/#sec-Fragment-Spreads-Must-Not-Form-Cycles) Fragment Spreads Must Not Form Cycles | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§5.5.2.3](https://spec.graphql.org/draft/#sec-Fragment-Spread-Is-Possible) Fragment Spread Is Possible | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§5.6.1](https://spec.graphql.org/draft/#sec-Values-of-Correct-Type) Values of Correct Type | ✓ | ✓ | ✗ (draft only) `valuesOfCorrectType` |   | ✗ `valuesOfCorrectType` |   |   |   | ✓ |
| [§5.6.2](https://spec.graphql.org/draft/#sec-Input-Object-Field-Names) Input Object Field Names | – | – | – |   | – |   |   |   | – |
| [§5.6.3](https://spec.graphql.org/draft/#sec-Input-Object-Field-Uniqueness) Input Object Field Uniqueness | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§5.6.4](https://spec.graphql.org/draft/#sec-Input-Object-Required-Fields) Input Object Required Fields | – | – | – |   | – |   |   |   | – |
| [§5.7.1](https://spec.graphql.org/draft/#sec-Directives-Are-Defined) Directives Are Defined | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§5.7.2](https://spec.graphql.org/draft/#sec-Directives-Are-in-Valid-Locations) Directives Are in Valid Locations | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§5.7.3](https://spec.graphql.org/draft/#sec-Directives-Are-Unique-per-Location) Directives Are Unique per Location | ✓ | ✓ | ✗ `directivesAreUniquePerLocation` |   | ✓ |   |   |   | ✓ |
| [§5.8.1](https://spec.graphql.org/draft/#sec-Variable-Uniqueness) Variable Uniqueness | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§5.8.2](https://spec.graphql.org/draft/#sec-Variables-Are-Input-Types) Variables Are Input Types | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§5.8.3](https://spec.graphql.org/draft/#sec-All-Variable-Uses-Defined) All Variable Uses Defined | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§5.8.4](https://spec.graphql.org/draft/#sec-All-Variables-Used) All Variables Used | ✓ | ✓ | ✓ |   | ✓ |   |   |   | ✓ |
| [§5.8.5](https://spec.graphql.org/draft/#sec-All-Variable-Usages-Are-Allowed) All Variable Usages Are Allowed | ✗ (draft only) `allVariableUsagesAreAllowed` | ✗ (draft only) `allVariableUsagesAreAllowed` | ✗ (draft only) `allVariableUsagesAreAllowed` |   | ✓ |   |   |   | ✗ `allVariableUsagesAreAllowed` |
| [§6.1](https://spec.graphql.org/draft/#sec-Executing-Requests) Executing Requests | ✓ | ✓ | ✓ |   | ✓ |   |   |   |   |
| [§6.1.1](https://spec.graphql.org/draft/#sec-Validating-Requests) Validating Requests | – | – | ✓ |   | ✗ `invalidNotExecuted` |   |   |   |   |
| [§6.1.2](https://spec.graphql.org/draft/#sec-Coercing-Variable-Values) Coercing Variable Values | ✓ | ✓ | ✓ |   | ✗ `variables` |   |   |   |   |
| [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) Mutation | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ `calledSerially` | ✓ | ✗ `calledSerially` | ✓ |
| [§6.2.3.2](https://spec.graphql.org/draft/#sec-Response-Stream) Response Stream | ✓ | ✓ | ✗ `eventYieldsResult` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| [§6.3.1](https://spec.graphql.org/draft/#sec-Executing-the-Root-Selection-Set) Executing the Root Selection Set | ✓ | ✓ | ✓ | ✗ `complete` | ✓ | ✓ | ✓ | ✗ `complete` | ✓ |
| [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) Field Collection | ✓ | ✓ | ✓ | ✗ `dataMatches` `callsOnce` | ✓ | ✓ | ✓ | ✗ `dataMatches` | ✓ |
| [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) Executing Collected Fields | ✓ | ✓ | ✓ | ✗ `complete` `callsOnce` `callsReachable` | ✓ | ✓ | ✓ | ✗ `complete` | ✓ |
| [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) Normal and Serial Execution | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ `calledSerially` | ✓ | ✗ `serialErrorsKept` `calledSerially` | ✓ |
| [§6.4.1](https://spec.graphql.org/draft/#sec-Coercing-Field-Arguments) Coercing Field Arguments | ✓ | ✓ | ✓ |   | ✗ `arguments` |   |   |   |   |
| [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) Value Completion | ✓ | ✓ | ✓ | ✗ `dataMatches` `callsReachable` | ! `intFraction` | ✓ | ! `intFraction` | ✗ `dataMatches` `resultCoercion` | ✗ `resultCoercion` |
| [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) Handling Execution Errors | ✓ | ✓ | ✓ | ✗ `dataMatches` `errorsWereRaised` `errorsInsideNulls` `nullsExplained` | ✗ `nullsExplained` | ✓ | ✓ | ✗ `dataMatches` `nullsExplained` `serialErrorsKept` | ✓ |
| [§7.1](https://spec.graphql.org/draft/#sec-Response-Format) Response Format | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) Execution Result | ✓ | ✓ | ✓ | ✗ `nullsExplained` | ✗ `nullsExplained` | ✓ | ✓ | ✗ `nullsExplained` | ✓ |
| [§7.1.3](https://spec.graphql.org/draft/#sec-Request-Error-Result) Request Error Result | ✓ | ✓ | ✓ |   | ✓ |   |   |   |   |
| [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) Response Position | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| [§7.1.5](https://spec.graphql.org/draft/#sec-Data) Data | ✓ | ✓ | ✓ | ✗ `complete` | ✓ | ✓ | ✓ | ✗ `complete` | ✓ |
| [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) Errors | ✓ | ✓ | ✓ | ✗ `errorsWereRaised` `errorPath` | ✓ | ✓ | ✓ | ✓ | ✓ |
| [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) Extensions | ✓ | ✓ | ✓ | – | ✓ | – | – | – | ✓ |
| [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) Additional Entries | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| [§7.2.1](https://spec.graphql.org/draft/#sec-JSON-Serialization) JSON Serialization | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering) Serialized Map Ordering | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ! `keyOrder` | ✓ |

Exercised by fixtures, without a check of their own: [§3.12.1](https://spec.graphql.org/draft/#sec-Combining-List-and-Non-Null) Combining List and Non-Null, [§6.2.3](https://spec.graphql.org/draft/#sec-Subscription) Subscription.

## Not checked by the kit yet

42 sections of 161. The references in [`specs/`](../specs) cover most of them, but are checked against graphql-js only, by the differential scripts (see [What is checked](../README.md#what-is-checked)).

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
- [§6.2](https://spec.graphql.org/draft/#sec-Executing-Operations) Executing Operations
- [§6.2.1](https://spec.graphql.org/draft/#sec-Query) Query
- [§6.2.3.1](https://spec.graphql.org/draft/#sec-Source-Stream) Source Stream
- [§6.2.3.3](https://spec.graphql.org/draft/#sec-Unsubscribe) Unsubscribe
- [§6.3](https://spec.graphql.org/draft/#sec-Executing-Selection-Sets) Executing Selection Sets
- [§6.4](https://spec.graphql.org/draft/#sec-Executing-Fields) Executing Fields
- [§6.4.2](https://spec.graphql.org/draft/#sec-Value-Resolution) Value Resolution
- [§7.1.2](https://spec.graphql.org/draft/#sec-Response-Stream) Response Stream
- [§7.2](https://spec.graphql.org/draft/#sec-Serialization-Format) Serialization Format
