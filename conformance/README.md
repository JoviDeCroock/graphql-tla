# Conformance sheet

Which parts of the [GraphQL spec](https://spec.graphql.org/draft/) each implementation was checked against, and what it breaks. Every cell comes from a report written by the [conformance kit](../docs/conformance.md), which runs the implementation through an adapter and checks each response against the TLA+ reference. Nothing is judged by hand.

Section numbers are from graphql/graphql-spec@bfcc722b32f4 (spec/Section 2–7). Regenerate with `npm run conformance`.

A ✓ means no case the kit tried broke the rule. It is evidence, not proof: the fixtures are small, and each implementation's adapter decides which capabilities it claims.

## Implementations

| Implementation | Areas | Capabilities | Cases (distinct) | Malformed | Checker self-test |
| --- | --- | --- | --- | --- | --- |
| [async-graphql 7.0.17 (dynamic schema)](async-graphql-7.0.17-dynamic-schema.md) | execution | idle, invalid-results, mutation, subscription | 9674 (482) | 4432 | passed |
| [graphql-java 26.2](graphql-java-26.2.md) | execution | error-propagation-off, idle, invalid-results, mutation, subscription | 11726 (1955) | 1338 | passed |
| [graphql-js 16.15.0](graphql-js-16.15.0.md) | execution | deferred-items, idle, invalid-results, mutation, subscription | 10060 (1647) | 0 | passed |
| [graphql-js 17.1.0](graphql-js-17.1.0.md) | execution | deferred-items, error-propagation-off, idle, invalid-results, mutation, subscription | 11662 (1930) | 0 | passed |

## By spec section

✓ every case satisfied it · ✗ n cases broke a MUST · ! n cases broke a SHOULD · ~ inconclusive · – not exercised (the implementation's adapter lacks the capability, or no case reached it)

| Section | async-graphql 7.0.17 (dynamic schema) | graphql-java 26.2 | graphql-js 16.15.0 | graphql-js 17.1.0 |
| --- | :---: | :---: | :---: | :---: |
| [§3.5](https://spec.graphql.org/draft/#sec-Scalars) Scalars | ✗ | ✓ | ✓ | ✓ |
| [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) Interfaces | ✗ | ✓ | ✓ | ✓ |
| [§3.8](https://spec.graphql.org/draft/#sec-Unions) Unions | ✗ | ✓ | ✓ | ✓ |
| [§3.11](https://spec.graphql.org/draft/#sec-List) List | ✗ | ✓ | ✓ | ✓ |
| [§3.12](https://spec.graphql.org/draft/#sec-Non-Null) Non-Null | ✗ | ✓ | ✓ | ✓ |
| [§3.12.1](https://spec.graphql.org/draft/#sec-Combining-List-and-Non-Null) Combining List and Non-Null | ✗ | ✓ | ✓ | ✓ |
| [§3.13.1](https://spec.graphql.org/draft/#sec-skip) @skip | ✗ | ✓ | ✓ | ✓ |
| [§3.13.2](https://spec.graphql.org/draft/#sec-include) @include | ✗ | ✓ | ✓ | ✓ |
| [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) Mutation | ✗ | ✓ | ✓ | ✓ |
| [§6.2.3](https://spec.graphql.org/draft/#sec-Subscription) Subscription | ✗ | ✗ | ✓ | ✓ |
| [§6.2.3.2](https://spec.graphql.org/draft/#sec-Response-Stream) Response Stream | ✗ | ✗ | ✓ | ✓ |
| [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) Field Collection | ✗ | ✓ | ✓ | ✓ |
| [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) Executing Collected Fields | ✗ | ✓ | ✓ | ✓ |
| [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) Normal and Serial Execution | ✗ | ✓ | ✓ | ✓ |
| [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) Value Completion | ✗ | ✓ | ✓ | ✓ |
| [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) Handling Execution Errors | ✗ | ✓ | ✓ | ✓ |
| [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) Execution Result | ✗ | ✗ | ✓ | ✓ |
| [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) Response Position | ✓ | ✓ | ✓ | ✓ |
| [§7.1.5](https://spec.graphql.org/draft/#sec-Data) Data | ✓ | ✓ | ✓ | ✓ |
| [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) Errors | ✗ | ✗ | ✓ | ✓ |
| [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) Extensions | – | – | – | – |
| [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) Additional Entries | ✓ | ✓ | ✓ | ✓ |
| [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering) Serialized Map Ordering | ✓ | ✓ | ✓ | ✓ |

136 sections of 159 aren't checked by the kit yet. The references in [`specs/`](../specs) cover most of them, checked against graphql-js only (see [What is checked](../README.md#what-is-checked)). They are listed at the end.

## Execution: each check

✓ every case satisfied it · ✗ n cases broke a MUST · ! n cases broke a SHOULD · ~ inconclusive · – not exercised (the implementation's adapter lacks the capability, or no case reached it)

| Check | Level | Spec | async-graphql 7.0.17 (dynamic schema) | graphql-java 26.2 | graphql-js 16.15.0 | graphql-js 17.1.0 |
| --- | --- | --- | :---: | :---: | :---: | :---: |
| The response is sent only once execution is complete (`complete`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✗ 32 | ✓ | ✓ | ✓ |
| data is the completed value: field collection, value completion and null propagation (`dataMatches`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✗ 292 | ✓ | ✓ | ✓ |
| Response keys are in collected field order (`keyOrder`) | SHOULD | [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering) | ✓ | ✓ | ✓ | ✓ |
| Every error was raised, at the path where it was raised (`errorsWereRaised`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✗ 95 | ✓ | ✓ | ✓ |
| No two errors share a response path (`errorPathsUnique`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ | ✓ | ✓ | ✓ |
| Every error is inside a null in data (`errorsInsideNulls`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✗ 5 | ✓ | ✓ | ✓ |
| Every null an error caused comes with an error from its cause (`nullsExplained`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✗ 176 | ✓ | ✓ | ✓ |
| A mutation reports every error its earlier root fields raised (`serialErrorsKept`) | MUST | [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ | ✓ | ✓ | ✓ |
| A mutation's root fields execute one after another (`calledSerially`) | MUST | [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) | ✓ | ✓ | ✓ | ✓ |
| Each field is executed once, merged selections included (`callsOnce`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) | ✗ 101 | ✓ | ✓ | ✓ |
| Only fields the operation selects are executed (`callsSelected`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) | ✓ | ✓ | ✓ | ✓ |
| data holds only positions the operation selects (`dataShape`) | MUST | [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ | ✓ | ✓ | ✓ |
| Leaf values are the resolver's value, result-coerced (`leafValues`) | MUST | [§3.5](https://spec.graphql.org/draft/#sec-Scalars) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ | ✓ | ✓ | ✓ |
| An execution result has a data entry (`dataPresent`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ | ✗ 1338 | ✓ | ✓ |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ | ✓ | ✓ | ✓ |
| The response has no entries besides data, errors and extensions (`additionalEntries`) | MUST | [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ | ✓ | ✓ | ✓ |
| extensions is a map (`extensions`) | MUST | [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) | – | – | – | – |
| Errors are maps with a message, and well-formed locations and extensions (`errorFormat`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ | ✓ | ✓ | ✓ |
| Execution errors have a path to a position the operation selects (`errorPath`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✗ 4376 | ✗ 1338 | ✓ | ✓ |
| Paths use field names and integer list indices (`responsePosition`) | MUST | [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) | ✓ | ✓ | ✓ | ✓ |
| Errors have no entries besides message, locations, path and extensions (`errorEntries`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ | ✓ | ✓ | ✓ |
| The adapter follows the kit's protocol (call types, settles) (`protocol`) | ADAPTER | — | ✗ 101 | ✓ | ✓ | ✓ |

| Fixture | Spec | async-graphql 7.0.17 (dynamic schema) | graphql-java 26.2 | graphql-js 16.15.0 | graphql-js 17.1.0 |
| --- | --- | :---: | :---: | :---: | :---: |
| [`fragments`](../fixtures/fragments.graphql) | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§3.7](https://spec.graphql.org/draft/#sec-Interfaces) [§3.13.1](https://spec.graphql.org/draft/#sec-skip) [§3.13.2](https://spec.graphql.org/draft/#sec-include) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✗ | ✓ | ✓ | ✓ |
| [`lists`](../fixtures/lists.graphql) | [§3.11](https://spec.graphql.org/draft/#sec-List) [§3.12.1](https://spec.graphql.org/draft/#sec-Combining-List-and-Non-Null) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✗ | ✓ | ✓ | ✓ |
| [`mutation`](../fixtures/mutation.graphql) | [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✗ | ✓ | ✓ | ✓ |
| [`noPropagation`](../fixtures/noPropagation.graphql) | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | – (needs error-propagation-off) | ✓ | – (needs error-propagation-off) | ✓ |
| [`nullPropagation`](../fixtures/nullPropagation.graphql) | [§3.12](https://spec.graphql.org/draft/#sec-Non-Null) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) | ✗ | ✓ | ✓ | ✓ |
| [`subscription`](../fixtures/subscription.graphql) | [§6.2.3](https://spec.graphql.org/draft/#sec-Subscription) [§6.2.3.2](https://spec.graphql.org/draft/#sec-Response-Stream) | ✗ | ✗ | ✓ | ✓ |
| [`unions`](../fixtures/unions.graphql) | [§3.8](https://spec.graphql.org/draft/#sec-Unions) [§3.11](https://spec.graphql.org/draft/#sec-List) [§3.5](https://spec.graphql.org/draft/#sec-Scalars) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✗ | ✓ | ✓ | ✓ |

## Not checked by the kit yet

- [§2.1](https://spec.graphql.org/draft/#sec-Source-Text) Source Text
- [§2.1.1](https://spec.graphql.org/draft/#sec-White-Space) White Space
- [§2.1.2](https://spec.graphql.org/draft/#sec-Line-Terminators) Line Terminators
- [§2.1.3](https://spec.graphql.org/draft/#sec-Comments) Comments
- [§2.1.4](https://spec.graphql.org/draft/#sec-Insignificant-Commas) Insignificant Commas
- [§2.1.5](https://spec.graphql.org/draft/#sec-Lexical-Tokens) Lexical Tokens
- [§2.1.6](https://spec.graphql.org/draft/#sec-Ignored-Tokens) Ignored Tokens
- [§2.1.7](https://spec.graphql.org/draft/#sec-Punctuators) Punctuators
- [§2.1.8](https://spec.graphql.org/draft/#sec-Names) Names
- [§2.2](https://spec.graphql.org/draft/#sec-Descriptions) Descriptions
- [§2.3](https://spec.graphql.org/draft/#sec-Document) Document
- [§2.4](https://spec.graphql.org/draft/#sec-Operations) Operations
- [§2.5](https://spec.graphql.org/draft/#sec-Selection-Sets) Selection Sets
- [§2.6](https://spec.graphql.org/draft/#sec-Fields) Fields
- [§2.7](https://spec.graphql.org/draft/#sec-Arguments) Arguments
- [§2.8](https://spec.graphql.org/draft/#sec-Field-Alias) Field Alias
- [§2.9](https://spec.graphql.org/draft/#sec-Fragments) Fragments
- [§2.9.1](https://spec.graphql.org/draft/#sec-Type-Conditions) Type Conditions
- [§2.9.2](https://spec.graphql.org/draft/#sec-Inline-Fragments) Inline Fragments
- [§2.10](https://spec.graphql.org/draft/#sec-Input-Values) Input Values
- [§2.10.1](https://spec.graphql.org/draft/#sec-Int-Value) Int Value
- [§2.10.2](https://spec.graphql.org/draft/#sec-Float-Value) Float Value
- [§2.10.3](https://spec.graphql.org/draft/#sec-Boolean-Value) Boolean Value
- [§2.10.4](https://spec.graphql.org/draft/#sec-String-Value) String Value
- [§2.10.5](https://spec.graphql.org/draft/#sec-Null-Value) Null Value
- [§2.10.6](https://spec.graphql.org/draft/#sec-Enum-Value) Enum Value
- [§2.10.7](https://spec.graphql.org/draft/#sec-List-Value) List Value
- [§2.10.8](https://spec.graphql.org/draft/#sec-Input-Object-Values) Input Object Values
- [§2.11](https://spec.graphql.org/draft/#sec-Variables) Variables
- [§2.12](https://spec.graphql.org/draft/#sec-Type-References) Type References
- [§2.13](https://spec.graphql.org/draft/#sec-Directives) Directives
- [§2.14](https://spec.graphql.org/draft/#sec-Schema-Coordinates) Schema Coordinates
- [§3.1](https://spec.graphql.org/draft/#sec-Type-System-Extensions) Type System Extensions
- [§3.2](https://spec.graphql.org/draft/#sec-Type-System-Descriptions) Type System Descriptions
- [§3.3](https://spec.graphql.org/draft/#sec-Schema) Schema
- [§3.3.1](https://spec.graphql.org/draft/#sec-Root-Operation-Types) Root Operation Types
- [§3.3.2](https://spec.graphql.org/draft/#sec-Schema-Extension) Schema Extension
- [§3.4](https://spec.graphql.org/draft/#sec-Types) Types
- [§3.4.1](https://spec.graphql.org/draft/#sec-Wrapping-Types) Wrapping Types
- [§3.4.2](https://spec.graphql.org/draft/#sec-Input-and-Output-Types) Input and Output Types
- [§3.4.3](https://spec.graphql.org/draft/#sec-Type-Extensions) Type Extensions
- [§3.5.1](https://spec.graphql.org/draft/#sec-Int) Int
- [§3.5.2](https://spec.graphql.org/draft/#sec-Float) Float
- [§3.5.3](https://spec.graphql.org/draft/#sec-String) String
- [§3.5.4](https://spec.graphql.org/draft/#sec-Boolean) Boolean
- [§3.5.5](https://spec.graphql.org/draft/#sec-ID) ID
- [§3.5.6](https://spec.graphql.org/draft/#sec-Scalar-Extensions) Scalar Extensions
- [§3.6](https://spec.graphql.org/draft/#sec-Objects) Objects
- [§3.6.1](https://spec.graphql.org/draft/#sec-Field-Arguments) Field Arguments
- [§3.6.2](https://spec.graphql.org/draft/#sec-Field-Deprecation) Field Deprecation
- [§3.6.3](https://spec.graphql.org/draft/#sec-Object-Extensions) Object Extensions
- [§3.7.1](https://spec.graphql.org/draft/#sec-Interface-Extensions) Interface Extensions
- [§3.8.1](https://spec.graphql.org/draft/#sec-Union-Extensions) Union Extensions
- [§3.9](https://spec.graphql.org/draft/#sec-Enums) Enums
- [§3.9.1](https://spec.graphql.org/draft/#sec-Enum-Extensions) Enum Extensions
- [§3.10](https://spec.graphql.org/draft/#sec-Input-Objects) Input Objects
- [§3.10.1](https://spec.graphql.org/draft/#sec-OneOf-Input-Objects) OneOf Input Objects
- [§3.10.2](https://spec.graphql.org/draft/#sec-Input-Object-Extensions) Input Object Extensions
- [§3.13](https://spec.graphql.org/draft/#sec-Directives) Directives
- [§3.13.3](https://spec.graphql.org/draft/#sec-deprecated) @deprecated
- [§3.13.4](https://spec.graphql.org/draft/#sec-specifiedBy) @specifiedBy
- [§3.13.5](https://spec.graphql.org/draft/#sec-oneOf) @oneOf
- [§3.13.6](https://spec.graphql.org/draft/#sec-Directive-Extensions) Directive Extensions
- [§4.1](https://spec.graphql.org/draft/#sec-Type-Name-Introspection) Type Name Introspection
- [§4.2](https://spec.graphql.org/draft/#sec-Schema-Introspection) Schema Introspection
- [§4.2.1](https://spec.graphql.org/draft/#sec-The-Schema-Type) The \_\_Schema Type
- [§4.2.2](https://spec.graphql.org/draft/#sec-The-Type-Type) The \_\_Type Type
- [§4.2.3](https://spec.graphql.org/draft/#sec-The-Field-Type) The \_\_Field Type
- [§4.2.4](https://spec.graphql.org/draft/#sec-The-InputValue-Type) The \_\_InputValue Type
- [§4.2.5](https://spec.graphql.org/draft/#sec-The-EnumValue-Type) The \_\_EnumValue Type
- [§4.2.6](https://spec.graphql.org/draft/#sec-The-Directive-Type) The \_\_Directive Type
- [§5.1](https://spec.graphql.org/draft/#sec-Documents) Documents
- [§5.1.1](https://spec.graphql.org/draft/#sec-Executable-Definitions) Executable Definitions
- [§5.2](https://spec.graphql.org/draft/#sec-Operations) Operations
- [§5.2.1](https://spec.graphql.org/draft/#sec-All-Operation-Definitions) All Operation Definitions
- [§5.2.1.1](https://spec.graphql.org/draft/#sec-Operation-Type-Existence) Operation Type Existence
- [§5.2.2](https://spec.graphql.org/draft/#sec-Named-Operation-Definitions) Named Operation Definitions
- [§5.2.2.1](https://spec.graphql.org/draft/#sec-Operation-Name-Uniqueness) Operation Name Uniqueness
- [§5.2.3](https://spec.graphql.org/draft/#sec-Anonymous-Operation-Definitions) Anonymous Operation Definitions
- [§5.2.3.1](https://spec.graphql.org/draft/#sec-Lone-Anonymous-Operation) Lone Anonymous Operation
- [§5.2.4](https://spec.graphql.org/draft/#sec-Subscription-Operation-Definitions) Subscription Operation Definitions
- [§5.2.4.1](https://spec.graphql.org/draft/#sec-Single-Root-Field) Single Root Field
- [§5.3](https://spec.graphql.org/draft/#sec-Fields) Fields
- [§5.3.1](https://spec.graphql.org/draft/#sec-Field-Selections) Field Selections
- [§5.3.2](https://spec.graphql.org/draft/#sec-Field-Selection-Merging) Field Selection Merging
- [§5.3.3](https://spec.graphql.org/draft/#sec-Leaf-Field-Selections) Leaf Field Selections
- [§5.4](https://spec.graphql.org/draft/#sec-Arguments) Arguments
- [§5.4.1](https://spec.graphql.org/draft/#sec-Argument-Names) Argument Names
- [§5.4.2](https://spec.graphql.org/draft/#sec-Argument-Uniqueness) Argument Uniqueness
- [§5.4.3](https://spec.graphql.org/draft/#sec-Required-Arguments) Required Arguments
- [§5.5](https://spec.graphql.org/draft/#sec-Fragments) Fragments
- [§5.5.1](https://spec.graphql.org/draft/#sec-Fragment-Declarations) Fragment Declarations
- [§5.5.1.1](https://spec.graphql.org/draft/#sec-Fragment-Name-Uniqueness) Fragment Name Uniqueness
- [§5.5.1.2](https://spec.graphql.org/draft/#sec-Fragment-Spread-Type-Existence) Fragment Spread Type Existence
- [§5.5.1.3](https://spec.graphql.org/draft/#sec-Fragments-on-Object-Interface-or-Union-Types) Fragments on Object, Interface or Union Types
- [§5.5.1.4](https://spec.graphql.org/draft/#sec-Fragments-Must-Be-Used) Fragments Must Be Used
- [§5.5.2](https://spec.graphql.org/draft/#sec-Fragment-Spreads) Fragment Spreads
- [§5.5.2.1](https://spec.graphql.org/draft/#sec-Fragment-Spread-Target-Defined) Fragment Spread Target Defined
- [§5.5.2.2](https://spec.graphql.org/draft/#sec-Fragment-Spreads-Must-Not-Form-Cycles) Fragment Spreads Must Not Form Cycles
- [§5.5.2.3](https://spec.graphql.org/draft/#sec-Fragment-Spread-Is-Possible) Fragment Spread Is Possible
- [§5.5.2.3.1](https://spec.graphql.org/draft/#sec-Object-Spreads-in-Object-Scope) Object Spreads in Object Scope
- [§5.5.2.3.2](https://spec.graphql.org/draft/#sec-Abstract-Spreads-in-Object-Scope) Abstract Spreads in Object Scope
- [§5.5.2.3.3](https://spec.graphql.org/draft/#sec-Object-Spreads-in-Abstract-Scope) Object Spreads in Abstract Scope
- [§5.5.2.3.4](https://spec.graphql.org/draft/#sec-Abstract-Spreads-in-Abstract-Scope) Abstract Spreads in Abstract Scope
- [§5.6](https://spec.graphql.org/draft/#sec-Values) Values
- [§5.6.1](https://spec.graphql.org/draft/#sec-Values-of-Correct-Type) Values of Correct Type
- [§5.6.2](https://spec.graphql.org/draft/#sec-Input-Object-Field-Names) Input Object Field Names
- [§5.6.3](https://spec.graphql.org/draft/#sec-Input-Object-Field-Uniqueness) Input Object Field Uniqueness
- [§5.6.4](https://spec.graphql.org/draft/#sec-Input-Object-Required-Fields) Input Object Required Fields
- [§5.7](https://spec.graphql.org/draft/#sec-Directives) Directives
- [§5.7.1](https://spec.graphql.org/draft/#sec-Directives-Are-Defined) Directives Are Defined
- [§5.7.2](https://spec.graphql.org/draft/#sec-Directives-Are-in-Valid-Locations) Directives Are in Valid Locations
- [§5.7.3](https://spec.graphql.org/draft/#sec-Directives-Are-Unique-per-Location) Directives Are Unique per Location
- [§5.8](https://spec.graphql.org/draft/#sec-Variables) Variables
- [§5.8.1](https://spec.graphql.org/draft/#sec-Variable-Uniqueness) Variable Uniqueness
- [§5.8.2](https://spec.graphql.org/draft/#sec-Variables-Are-Input-Types) Variables Are Input Types
- [§5.8.3](https://spec.graphql.org/draft/#sec-All-Variable-Uses-Defined) All Variable Uses Defined
- [§5.8.4](https://spec.graphql.org/draft/#sec-All-Variables-Used) All Variables Used
- [§5.8.5](https://spec.graphql.org/draft/#sec-All-Variable-Usages-Are-Allowed) All Variable Usages Are Allowed
- [§6.1](https://spec.graphql.org/draft/#sec-Executing-Requests) Executing Requests
- [§6.1.1](https://spec.graphql.org/draft/#sec-Validating-Requests) Validating Requests
- [§6.1.2](https://spec.graphql.org/draft/#sec-Coercing-Variable-Values) Coercing Variable Values
- [§6.2](https://spec.graphql.org/draft/#sec-Executing-Operations) Executing Operations
- [§6.2.1](https://spec.graphql.org/draft/#sec-Query) Query
- [§6.2.3.1](https://spec.graphql.org/draft/#sec-Source-Stream) Source Stream
- [§6.2.3.3](https://spec.graphql.org/draft/#sec-Unsubscribe) Unsubscribe
- [§6.3](https://spec.graphql.org/draft/#sec-Executing-Selection-Sets) Executing Selection Sets
- [§6.3.1](https://spec.graphql.org/draft/#sec-Executing-the-Root-Selection-Set) Executing the Root Selection Set
- [§6.4](https://spec.graphql.org/draft/#sec-Executing-Fields) Executing Fields
- [§6.4.1](https://spec.graphql.org/draft/#sec-Coercing-Field-Arguments) Coercing Field Arguments
- [§6.4.2](https://spec.graphql.org/draft/#sec-Value-Resolution) Value Resolution
- [§7.1](https://spec.graphql.org/draft/#sec-Response-Format) Response Format
- [§7.1.2](https://spec.graphql.org/draft/#sec-Response-Stream) Response Stream
- [§7.1.3](https://spec.graphql.org/draft/#sec-Request-Error-Result) Request Error Result
- [§7.2](https://spec.graphql.org/draft/#sec-Serialization-Format) Serialization Format
- [§7.2.1](https://spec.graphql.org/draft/#sec-JSON-Serialization) JSON Serialization
