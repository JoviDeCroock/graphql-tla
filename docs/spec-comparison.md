# The TLA+ references next to the GraphQL spec

How the references in [`specs/`](../specs) compare with the [GraphQL spec](https://spec.graphql.org/September2026/) they are written from: what each one covers, how it differs in form, where it had to pick a reading, where it goes beyond the spec, and what it leaves out. The comparison is against graphql/graphql-spec@bfcc722b32f4, the revision [`kit/spec-sections.json`](../kit/spec-sections.json) is pinned to. That was the head of `main` on 13 November 2026, just after the September 2026 edition, and differs from that release only editorially.

## Chapter by chapter

| Spec | Reference | Form | Checked by |
| --- | --- | --- | --- |
| §2 Language, executable documents | `Lexer.tla`, `Parser.tla` | The lexical grammar and its static semantics (escapes, surrogate pairs, `BlockStringValue()`), and a recursive-descent reading of `ExecutableDocument` | hand-written vectors, mutants, `differential-lexer.mjs`, kit `parse` |
| §2 Language, type system documents | none | | |
| §2.14 Schema Coordinates | none | | |
| §3 Type System, validation rules | `TypeSystem.tla` | One operator per rule, named after it (`INPUT_OBJECT_UNBREAKABLE_CYCLE`, …), over schema data. Also at most one schema definition (§3.3), references to undefined types, and directives applied in SDL: defined, and in one of their locations (§3.13), from optional `schemaDefinitions` and `uses` fields that only the kit's `schema` area fills in. `VerdictSeptember2025` swaps in September 2025's input object cycle rule ("at least one of the fields in the chain of references must be either a nullable or a List type"), so the kit can tell which release gives a schema its verdict | `TypeSystemVectors.tla`, `differential-type-system.mjs`, kit `schema` |
| §3.5, §3.9 to §3.12 input coercion | `Coercion.tla` | Input coercion of every built-in scalar, enums, input objects, OneOf input objects (§3.10.1, both the entry check before coercion and the coerced map's), lists and Non-Null, with numbers stored as decimal digits | vectors, `differential-coercion.mjs`, kit `coerce` |
| §3 result coercion | `Reference.tla` (shape only) and kit checks | Leaf values are abstract in the reference. The kit checks their serialized values directly (`resultCoercion`, `intFraction`, `coercionErrorReported`) | kit `execution` |
| §3.1 and the `…Extensions` sections | none | | |
| §4 Introspection | `Introspection.tla` | The `__schema` result a schema must have (`Matches`), under September 2026's, September 2025's or October 2021's built-ins | `IntrospectionVectors.tla`, `differential-type-system.mjs`, kit `introspect` |
| §5 Validation | `Validation.tla` | Every rule as an operator that returns its violations, quoting the formal text | vectors, `differential-validation.mjs`, kit `validate` |
| §6.1 Executing Requests, §6.1.2, §6.4.1 | `Coercion.tla` | `GetOperation`, `CoerceVariableValues`, `CoerceArgumentValues`, and request errors as opposed to execution errors. `Valid` accepts a request error whether or not its errors carry a path: no sentence says | kit `coerce` |
| §6.2.1, §6.3, §6.4 query execution | `Reference.tla` | `CollectFields`, `CompleteValue` with lists and abstract types, error propagation, `__typename` | `ExecutionConformance.tla` (refinement), kit `execution` |
| §6.2.2 Mutation, §6.3.4 serial execution | `Reference.tla` (`SeriallyExecuted`), `mutation.ts` | Serial root fields, and a scenario with side effects | `ExecutionConformance.tla`, mutants, kit `execution` |
| §6.2.3 Subscription | `subscription.ts` | A scenario: one subscription, a source of up to three events, unsubscribe | mutants only. The kit checks one event per fixture (`eventYieldsResult`) |
| §7 Response | `Reference.tla` (`Valid`), `GraphQLResponse.tla` | Which `{ data, errors }` pairs are allowed, and that one is sent, once, and never changes | kit `execution` (`errorLocations`, `keyOrder` and other direct checks) |

Every chapter from 2 to 7 has a reference. The [conformance sheet](../conformance/README.md#not-checked-by-the-kit-yet) lists 42 of the spec's 161 sections that no kit check cites. Most of them are parent sections, such as §5.3 Fields, whose rules are checked under their subsections. The ones with no reference at all are listed under [Not modelled](#not-modelled).

## How the references differ from the spec

The spec describes one executor, step by step. The references describe what an observer may see, so they differ from the spec in form even where they agree with it:

- **A set of answers, not one.** The spec's `ExecuteSelectionSet` produces one response. `Reference!Valid` accepts every response the spec allows for the resolvers that had settled: fields may resolve in any order (§6.3.3 "normal" execution), and errors raised under a position that was already nulled may be missing. The spec has no word for that set. It follows from what §6.3.3 and §6.4.4 leave open.
- **Resolvers are an oracle.** `ResolveFieldValue` (§6.4.2) and `ResolveAbstractType` are inputs: a map from response paths to what each resolver produced (an object, a leaf, a list of some length, null, an error, or a value of the wrong shape). The reference never computes a value, so it says nothing about what a resolver returns, only about what the executor does with it.
- **Time is explicit.** The spec has no notion of a response being sent while abandoned resolvers keep settling. `GraphQLResponse.tla` adds one: the response is sent once, is valid for the resolvers settled at that moment, stays valid, and is eventually sent (`EventuallyResponds`). These are properties of executors the spec only implies.
- **Rules return violations.** §5's rules are stated as "must" over a document. `Validation.tla` turns each into an operator that returns the offending nodes, so the kit can grade each rule alone. A document that breaks two rules is graded on both.
- **Data has fixed shapes.** TLC can't compare records of different shapes, so every value of a kind has the same fields, path segments are strings (`"0"` for list index 0), and numbers in `Coercion.tla` are digit sequences with an exponent. TLC's integers are 32 bits, too small to state the Int range.
- **Bounded.** The execution fixtures are small, and lists have at most two items. Model checking proves the references agree with the executor on those fixtures, not on every schema.

## Where the spec is ambiguous

Where the spec doesn't decide, each reference takes one reading, says so in a comment, and the vector generators leave the cases that depend on it ungraded or mark them `unspecified`:

| Spec | Question | Reading taken | Where |
| --- | --- | --- | --- |
| §5.3.2 `SameResponseShape`/`FieldsInSetCanMerge` | What "identical sets of arguments" means: the same text, the same value, or the same coerced values | The same value, with input object fields as a set: a block string equals the quoted string, `1` differs from `1.0` | `Validation.tla`, `ValueOf` |
| §5.8.5 | The prose says variables used for OneOf fields must be Non-Null. The algorithm lets a nullable variable with a non-null default through | The algorithm. `OneOfProseOnly` names the cases only the prose rejects | `Validation.tla` |
| §5.5.2.1 | Which fragment a spread targets when two have its name (§5.5.1.1 already rejects the document) | The last one, as in graphql-js | `Validation.tla`, `Fragment` |
| §3.11, §3.12 | What a list item coerces to when it is a variable with no runtime value | Null (so an error for a Non-Null item type). Two other readings, error or drop, are switches | `Coercion.tla`, `CoerceItems` |
| §3.11, §6.4.1 | What a list item becomes when it is a variable whose value isn't a list, where the item type is a list (`[$x]` for `[[Int]]` with `$x: Int`, only in a document §5.8.5 makes invalid) | The value as it is, by §6.4.1's Note that variable values are already coerced. The `variableItemWrapped` switch wraps it as §3.11's "list of size one", and the kit passes both | `Coercion.tla`, `CoerceItems` |
| §3.5.2 | What "a value outside the available precision" covers. It can't be every value without an exact double: `0.1` has none | An integer input value a double can't hold exactly is an error; a float input value (even `1e23`) is rounded. The `floatRounded` switch rounds integers too, and the kit's `floatPrecision` check is informational, passing both | `Coercion.tla`, `CoerceScalar` |
| §3.10, §3.12 | A missing Non-Null input field: §3.10 says "an error should be raised", §3.12 that "a _request error_ must be raised" | An error. The kit grades it at §3.12's MUST, and cites §3.12 | `Coercion.tla`, `CoerceFields` |
| §6.4.1 | The coercion rules call a failure a request error; CoerceArgumentValues raises an execution error, and "should" treat a request error as one | An execution error. The kit grades a request error there as a SHOULD (`argumentErrorKind`), except where §3.10 or §3.10.1 itself says "an _execution error_ must be raised" | `Coercion.tla`, `CoerceArgumentsFrom` |
| §3.13 directive cycles | The prose forbids a directive referencing itself "directly or indirectly". The formal rule only follows the directives a definition uses | The prose: the search also follows argument types | `TypeSystem.tla`, `DoesNotReferenceItselfIndirectly` |
| §4.2 `defaultValue` | It "may return a String encoding" of the default, with no canonical form | Two encodings match when they coerce to the same value (`[1]` and `1` for `[Int]`) | `Introspection.tla` |
| §4.2 ordering | "Stable Ordering" applies to lists with a source order. Built-ins have none | Source-ordered lists are compared in order. Built-ins, `possibleTypes` and `locations` are compared as sets | `Introspection.tla` |
| §4.2.1 `types` | Whether a type the document defines but nothing references is "contained within this schema" | `Introspection.tla` expects it. The kit grades leaving it out (or `null` from `__type(name:)`) as a SHOULD, `unreferencedTypes`, apart from `types` | `Introspection.tla`, `TypeNames`; `kit/introspect/IntrospectChecks.tla`, `Referenced` |
| §4.2, §3.13 Non-Null of built-ins | The Non-Null wrapping of the introspection fields and arguments, and of `@deprecated(reason:)`, is given only by the definitions, with no key word | `Matches` requires the definitions exactly. The kit grades a built-in field that differs only in Non-Null, or a built-in argument that is nullable where the spec's is Non-Null, as a SHOULD (`builtinNullability`) | `kit/introspect/IntrospectChecks.tla`, `Loosens` |
| §4.2.2 `specifiedByURL`, October 2021 `deprecationReason` | "`specifiedByURL` may return a String", and October 2021's "`deprecationReason` optionally provides a reason" | `Matches` requires the URL and the reason. The kit grades `null` for them as a SHOULD (`specifiedByURLOmitted`, and `deprecationReasonOmitted` under the October 2021 profile), as it does for `defaultValue` | `kit/introspect/IntrospectChecks.tla` |
| §6.3.3, §6.4.4 | Whether errors raised under an already-nulled position must be reported | They may or may not be. graphql-spec#1184, still open, would allow dropping them | `Reference.tla`, `Valid` |
| §6.2.2 | Whether root fields after a failed Non-Null root field still run | Either is allowed. The mutation scenario checks both | `mutation.ts`, `stopsAfterNullRoot` |
| §6.2.2, §6.3.4 serial mutations | §6.2.2 says a mutation's root selection set "should be executed serially". `ExecuteMutation` passes "serial", and the sentence that it "must be executed serially" is an example | The references execute mutations serially. The kit grades that as a SHOULD (`calledSerially`), and grades `serialErrorsKept`, which rests on serial order, only on runs that were serial | `Reference.tla`, `CalledSerially`; `kit/execution/Cases.tla`, `Failures` |

## Beyond the spec

Some parts model behaviour the spec doesn't define. They are kept apart from the spec's levels:

- **`@defer` and `@stream`** (`defer.ts`, `stream.ts`) follow the incremental delivery RFC (graphql-spec#1110) and graphql-js 17.1.0. Neither directive is in any release, September 2026 included, or in the working draft. The RFC doesn't yet specify `@stream` execution, so that model follows graphql-js.
- **Execution without error propagation** (`Reference!Propagates`, the `noPropagation` fixture) models graphql-js 17's `@experimental_disableErrorPropagation`. No edition has it. The kit grades it under an informational check, never against §6.4.4.
- **A runtime type that isn't a possible type** (`Reference!CompleteNullable`) is an execution error, as in graphql-js. `ResolveAbstractType` is "the internal method provided by the type system", and no release says what an executor does when it returns a type that isn't a member, so the kit never sends that outcome.
- **The subscription scenario** models graphql-js 17's `mapAsyncIterable`: event executions never overlap, and an in-flight event is still delivered after `return()`. §6.2.3 allows that but doesn't require it.
- **The September 2025 and October 2021 profiles.** `Introspection.tla` also states September 2025's and October 2021's built-in definitions (`Sep2025Builtins`, `Oct2021Builtins`), and the kit's `introspect` area grades an implementation whose introspection types are an older release's against that release, labelling what a later release would add, so implementations that target an older edition aren't marked down for what it allowed. September 2025's §4.2 has `includeDeprecated: Boolean! = false`, but its Appendix D still printed `Boolean = false` (#1142, corrected in September 2026 by #1192); the reference follows §4.2.

## Not modelled

What the spec specifies and no reference states:

- **Type system documents (§2, `TypeSystemDocument`).** `Parser.tla` rejects them, since they aren't an `ExecutableDocument`. The `schema` and `introspect` areas read SDL with graphql-js's parser and convert the syntax tree to `TypeSystem.tla` data (`kit/schema/tla.mjs`). Only the verdicts come from the reference, so a graphql-js parser bug in SDL would go unseen.
- **Type system extensions (§3.1, §3.3.2, §3.4.3 and every `… Extensions` section).** Nothing in `TypeSystem.tla` or `Parser.tla` handles `extend`, and none of their validation rules is checked.
- **Schema Coordinates (§2.14).** No grammar and no resolution.
- **Value resolution (§6.4.2) and custom scalars.** These are inputs to the reference. How a custom scalar coerces is up to the service. The kit's `custom-scalar-literals` capability only says an adapter's custom scalars accept every literal, so the validate vectors that use one can be graded.
- **Error contents (§7.1.6).** The reference checks which paths have errors. The kit checks that each error has a `message` (`errorFormat`) but not what it says, and checks `locations` only for shape (a SHOULD).
- **Coercion beyond one field.** `Coercion.tla` coerces one root field's arguments per operation, with no fragments. Arguments of nested fields go through the same `CoerceArgumentValues`, so the reference applies to them, but the coerce area only asks about root fields.
- **Subscriptions in general.** `subscription.ts` models one operation. `CreateSourceEventStream` errors and `Unsubscribe` (§6.2.3.1, §6.2.3.3) are only checked there, not against implementations.

## Trust

- **One oracle.** Every reference was checked differentially against graphql-js only. A misreading of the spec that graphql-js shares would pass everywhere. The documented discrepancies (in the [README](../README.md#what-is-checked)) show the references aren't copies of graphql-js: they disagree with it on long escapes, `__typename` in field merging, Float overflow, lone surrogates, and more.
- **Generators use graphql-js for syntax.** The validate, coerce and schema vector generators use graphql-js to parse and print documents. They take no verdict from it.
- **Mutants.** Every property must be broken by at least one planted bug (195 mutants over 103 properties), and each differential must catch the bugs planted in its reference. That shows the properties are not vacuous. It doesn't show they match the spec.

## Editorial drift

A few comments cite section numbers from before the October 2021 edition was renumbered: `§4.4` for Type Name Introspection (now §4.1), `§4.5` for the introspection types (now §4.2), and `§2.9.8` for Input Object Values (now §2.10.8). They are in `Reference.tla`, `Validation.tla` and `TypeSystem.tla`. The operators are right; only the citations are stale.

## Changes since the references were written

The spec changes the references already follow, from graphql-spec's history up to bfcc722:

- empty selection sets (#1227, September 2026), in `Parser.tla`, and in kit `validate`, whose two §5.3.3 examples with an empty selection set (`barkVolume {}` and `human {}`) are vectors with `since` September 2026. The same change reworded §5.3.3 from "must be empty" to "must not be present", which `Validation.tla` quotes;
- default value coercion (#793, September 2025), in `Coercion.tla`, whose `coerceDefaults` switch gives October 2021's answer, which uses a default as written: the kit's coerce vectors with `since` September 2025 for defaults;
- OneOf input objects (#825) and OneOf inhabitability (#1211, September 2026; `TypeSystem.tla` keeps September 2025's cycle rule beside it, for the kit's `since` tags), in `TypeSystem.tla` (the §3.10.1 type validation rules, and the OneOf check when a default value literal is coerced), `Validation.tla` (§5.8.5), and `Coercion.tla` (runtime OneOf coercion, the kit's `oneOf` check);
- directives on directive definitions (#1206, September 2026), with `DIRECTIVE_DEFINITION`, `__Directive.isDeprecated` and `__Schema.directives(includeDeprecated:)` in `Introspection.tla` (`Sep2025Builtins` has none of them) and directive cycles in `TypeSystem.tla`;
- deprecated arguments and input fields (#805, September 2025), `isOneOf` (#825) and Stable Ordering (#1092), in `Introspection.tla` and the kit's `introspect` checks;
- descriptions on executable definitions (#1170, September 2025), in `Parser.tla`;
- the full Unicode range (#849, September 2025): `SourceCharacter` as any Unicode scalar value, `\u{…}` escapes, and no lone surrogates, in `Lexer.tla`;
- Operation Type Existence (#955) and no `@skip` or `@include` at a subscription's root (#860), both September 2025, in `Validation.tla`;
- "unwrapped type" (#1253), quoted in `TypeSystem.tla`;
- response positions (#1183, #1238), which §7.1.4's checks cite. #1183 also made unique error paths a must, so `errorPathsUnique` is a MUST in September 2026 and a SHOULD in September 2025 and October 2021;
- strict error path format (#1073, September 2025), which made `responsePosition` a MUST (a SHOULD in October 2021);
- `CreateSourceEventStream` errors as request errors (#894, September 2026), which `subscription.ts` checks (`creationFailureIsRequestError`) and the kit doesn't.
