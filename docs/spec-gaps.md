# Gaps in the GraphQL specification text (September 2026)

Places where the September 2026 text is ambiguous, contradicts itself, or leaves out a rule, collected while extending the conformance kit (areas coordinate, parse, schema, validate, introspect, coerce, execution) and while auditing the TLA+ references against the text. Each says how the kit grades the point today; where the text allows more than one reading, the kit grades the weaker one or leaves the case `unspecified` (see [spec-comparison.md](spec-comparison.md)). We have filed none of these; five turned out to be tracked upstream already (see the review below).

- Section numbers are September 2026's, counted from heading order, and match `kit/spec-sections.json`.
- Quotes are copied from the September 2026 Markdown source (`spec/*.md` at tag `September2026`), braces and underscores included; `...` marks an elision. Quotes from October 2021 say so.
- "Kit today" says how the kit grades the point now: the check, its area and its level. INFO checks record what an implementation does and never fail a run. `unspecified` vectors are sent (or not) but never graded.
- Items are ordered by section. Items 5 and 29 are editorial (typos). Item 30 came from the audit of the references.


## Review

An independent review tried to refute every item. It checked the quotes mechanically against each tag, searched the whole spec for text that settles the question, searched the graphql/graphql-spec tracker (all issue and PR titles, plus the review threads of the PRs that introduced the text), and ran graphql-js 16.15.0 and 17.1.0. Every quote is verbatim, and every graphql-js behaviour cited reproduces. Its verdicts:

- **Real gap** (5): two readings with different observable results, nothing normative settles it, and not tracked upstream.
- **Wording** (16): the answer can be determined (from a definition elsewhere, intent recorded upstream, or because only one reading is sane), but the sentence is loose, stale or garbled. Items 10, 14 and 15 are missing formal rules whose intent nobody disputes.
- **Not a gap** (4): other normative text answers the question.
- **Known** (5): tracked upstream or already fixed.

| # | Short title | Verdict | Confidence | Reason |
|---|---|---|---|---|
| 1 | "Non-printable control characters" vs block strings | WORDING | high | The sentence sits in the escape-sequence text for quoted strings; block-string text says line terminators "may all be used unescaped". Nobody reads it the literal way. |
| 2 | Coordinates: wrong-kind container, prose vs Assert | WORDING | medium | One Assert covers existence and kind; prose gives existence failure an error, and the PR authors meant Asserts to be the error path. Prose summary is just incomplete. |
| 3 | "Assert" undefined in Appendix B | WORDING | medium | True that it is undefined, but everywhere an Assert can fail the prose states the consequence. The "is a within" typo is already fixed in open PR graphql/graphql-spec#1250. |
| 4 | Unreferenced built-in scalar as a schema element | WORDING | low | §3.5 excludes unreferenced built-ins from the schema's types and TypeCoordinate returns "the type in {schema}"; leans to "does not resolve", but not stated. Tooling-only. |
| 5 | Typo "every schema coordinates has" | WORDING | high | Real typo, still on `main`, not in any open PR. |
| 6 | Declaring a built-in scalar or directive in SDL | REAL-GAP | medium | "must be omitted" (scalars) and "may be omitted" (directives) bind the printer only; nothing says what a reader does, or what happens if the written-out built-in differs. |
| 7 | Roots when the schema definition is omitted | NOT-A-GAP | medium | Every reading consistent with the normative "can omit ... when ... no other type uses any default root type name" sentence rejects the cited document. Only the reason differs. |
| 8 | §3.3.2 Note vs lookahead in the grammar | WORDING | high | Grammar is unambiguous and normative; the Note is non-normative and only loosely scoped ("to avoid parsing ambiguity" does not arise for body-less productions). |
| 9 | `extend schema` with no schema definition | REAL-GAP | medium | "The Schema must already be defined" reads either way; graphql-js accepts, the kit's own reference rejected. |
| 10 | `extend schema` re-adding a root operation type | WORDING | medium | Missing rule (there is not even one for `schema { query: A query: B }`), but intent is undisputed: every type-extension kind forbids re-adding, and "adds additional operation types". |
| 11 | "Already defined" / "previous" and document order | WORDING | medium | (b) is answered by PR graphql/graphql-spec#1123, which changed "original" to "previous" to mean definition plus earlier extensions. (a) extension-before-definition is unstated but low risk. |
| 12 | Extending a built-in scalar or directive | REAL-GAP | medium | Unstated; graphql-js itself is inconsistent (rejects `extend scalar Int`, accepts `extend directive @deprecated`). |
| 13 | Interface extension re-adding an implemented interface | NOT-A-GAP | high | §3.7 rule 3 ("one or more unique interfaces") applies to the resulting type. The missing extension rule is an asymmetry, not a hole. |
| 14 | Non-repeatable directive twice in SDL | WORDING | medium | Missing formal rule, intent undisputed. Same class as open issue graphql/graphql-spec#1233; raise there, not separately. |
| 15 | Directive arguments in SDL not validated | WORDING | medium | Same as 14. A maintainer already said on graphql/graphql-spec#1233 that SDL-as-input validation as a whole is an acknowledged omission. |
| 16 | Int range: MUST or SHOULD | WORDING | medium | The specific sentences say "should"; the "must" sentence is introduced by "As an example", which Appendix A makes non-normative. Level is SHOULD. |
| 17 | Float: "a value outside the available precision" | REAL-GAP | medium | The phrase has no determinable meaning (underflow? integers above 2^53?) and sits behind a MUST. Narrow. |
| 18 | "Required" vs "non-nullable" extra argument | WORDING | medium | "required" is defined twice as non-null without a default (§5.4.3, §3.13.3); the "e.g." clause is an example and predates defaults on non-null arguments. Settled the same way in closed issue graphql/graphql-spec#401. |
| 19 | Default-value compatibility only for object field arguments | KNOWN | high | Open issue graphql/graphql-spec#1235 says exactly this; open PR graphql/graphql-spec#1248 fixes it. |
| 20 | Directive self-reference through an argument's type | WORDING | medium | The prose "must not reference itself directly or indirectly" is normative and covers it. Rule 3 is garbled, it does not grant permission. |
| 21 | "Identical sets of arguments" | WORDING | medium | The spec's own counter-examples (`$varOne` vs `$varTwo`, `SIT` vs omitted) rule out the coerced-value reading. Residue: `"x"` vs `"""x"""`, where over-rejecting is harmless. |
| 22 | Fragment spread on an interface with no implementers | KNOWN | high | Open issue graphql/graphql-spec#1109, with a fix proposed by a maintainer. |
| 23 | OneOf: nullable variable with a default | KNOWN | high | Found in the graphql/graphql-spec#825 review (June 2025), acknowledged by the author, deferred to open PR graphql/graphql-spec#1059. Implementations do diverge. |
| 24 | Subscription root argument coercion: which error | NOT-A-GAP | medium | §6.2 defines operation execution as starting at `Subscribe()`, and §7.1.5 normatively requires a request error result before that. Only the "execution error" label in CoerceArgumentValues is off for this call site. |
| 25 | Source stream error vs "stream of execution result" | KNOWN | high | Open issue graphql/graphql-spec#995 and open PR graphql/graphql-spec#1127. |
| 26 | Cancelling while an event executes | WORDING | medium | The October 2021 sentence was dropped by a PR titled and reviewed as editorial (graphql/graphql-spec#1099); a completed stream emits nothing. |
| 27 | When may a response stream complete | NOT-A-GAP | medium | "Internal user code also may cancel an event stream for any reason" plus the algorithm's "When {responseStream} is cancelled" branch already cover a service ending the stream. |
| 28 | Overlapping event executions and result order | WORDING | medium | The stream is a "sequence" that the algorithm "maps"; order-preserving is the only sane reading, and overlap is unobservable once order holds. |
| 29 | October 2021 circular "complete this event stream" | KNOWN | high | Fixed by graphql/graphql-spec#994 (merged 2024), in September 2025 and later. |
| 30 | `@skip`/`@include` with an explicitly null variable | REAL-GAP | medium | CollectFields gives a definite, silent answer; §3.12 says a null into a Non-Null argument must raise an error; graphql-js raises one and returns `data: null`. |

Items 6, 9 to 15 are all about validating SDL as input. On graphql/graphql-spec#1233 a maintainer wrote that the spec "mostly focuses on SDL as output" and that fixing it "would actually require resolving a much larger omission - validation of type system SDL", so expect them to be treated as one known omission.

The items below are the original write-ups, unchanged; read each with its verdict above.

---

## 1. Producing a StringValue: "non-printable control characters" includes LF, CR and tab, which a block string can't escape

**Sections:** §2.10.4 String Value; §4.2.4 The \_\_InputValue Type

§2.10.4:
> When producing a {StringValue}, implementations should use escape sequences to represent non-printable control characters (U+0000 to U+001F and U+007F to U+009F).

§2.10.4 (Escape Sequences, Block Strings):
> Escape sequences are only meaningful within a single-quoted string. Within a block string, they are simply that sequence of characters

> Whitespace, line terminators, quote, and backslash characters may all be used unescaped to enable verbatim text.

§2.10.4 (Note):
> Note: If non-printable ASCII characters are needed in a string value, a standard quoted string with appropriate escape sequences must be used instead of a block string.

§4.2.4:
> `defaultValue` may return a String encoding (using the GraphQL language) of the default value

**Problem:** A BlockString is one of the StringValue productions, and the range U+0000 to U+001F contains tab, line feed and carriage return. A block string can't escape anything, so read literally, every multi-line block string an implementation produces breaks the SHOULD, though §2.10.4 recommends block strings that "begin and end with an empty line". The Note's "non-printable ASCII characters" isn't defined either, so it doesn't say whether a line feed counts. The intent is probably the control characters other than tab, LF and CR, or quoted strings only.

**Kit today:** introspect `defaultValuePrinting`, SHOULD, since September 2025. The kit takes the weaker reading: raw tab, LF and CR inside a block string pass, and any other raw control character fails (`IntrospectChecks.tla`, `PrintingProblems`). This was the open "REVIEW" item in the introspect follow-ups; the code and `docs/kit/introspect.md` now both use the weaker reading.

---

## 2. Schema coordinates: the prose and the Asserts disagree on a containing type of the wrong kind

**Sections:** §2.14 Schema Coordinates

Prose:
> If the _schema element_ cannot be found, the resolve function will not yield a value (without raising an error). However, an error will be raised if any non-leaf nodes within a _schema coordinate_ cannot be found in the {schema}.

MemberCoordinate:
> Assert: {type} must exist, and must be an Enum, Input Object, Object or Interface type.

ArgumentCoordinate:
> Assert: {type} must exist, and be an Object or Interface type.

**Problem:** For `Date.x` (a scalar), `SearchResult.id` (a union) or `SearchCriteria.filter(x:)` (an input object), every non-leaf node is found. By the prose, resolving yields no value and raises no error. By the algorithms, the kind Assert fails, and in §2.14 the existence Asserts are how the algorithms express the error the prose describes (see item 3), so the kind Asserts read as raising an error too.

**Kit today:** coordinate `containerKind`, INFO. An error and no element both pass, and `observed` records which one the implementation gives; an element, or rejecting the coordinate, fails it. `SchemaCoordinates.tla` follows the Asserts. graphql-js 16 and 17 raise an error.

---

## 3. "Assert" is not defined, and §2.14 uses it differently from the rest of the spec

**Sections:** §2.14 Schema Coordinates; Appendix B Notation Conventions (Algorithms); for comparison §2.10.4 String Value and §6.2.1 Query

§2.14:
> Assert: {field} must exist.

> Assert: {directive} must exist.

> However, an error will be raised if any non-leaf nodes within a _schema coordinate_ cannot be found in the {schema}.

§6.2.1 (ExecuteQuery):
> Assert: {queryType} is an Object type.

§2.10.4 (Static Semantics, and the prose that gives the consequence):
> Assert: {value} is a within the _Unicode scalar value_ range

> The hexadecimal number encoded by a Unicode escape sequence must describe a _Unicode scalar value_, otherwise must result in a parse error.

Appendix B (Algorithms), the only description of algorithm steps:
> Each step may establish references to other values, check various conditions, call other algorithms, and eventually return a value representing the outcome of the algorithm for the provided arguments.

**Problem:** Appendix B never says what an "Assert" step means, and the spec uses it in two ways. In §3, §5 and §6 an Assert states something that schema or request validation already guarantees, so it can't fail in a conforming service. In §2.10.4 and §2.14 it checks input (an escape sequence, a coordinate) and must be able to fail, and only the surrounding prose says what a failure means: a parse error in §2.10.4, "an error will be raised" in §2.14. From the algorithm alone, a reader can't tell whether a failed Assert raises an error, is undefined behaviour, or can't happen. (Separately, "is a within" in the §2.10.4 Assert is a typo.)

**Kit today:** coordinate `missingContainers`, MUST: it reads the existence Asserts as raising an error, as the prose says. The kind Asserts are item 2.

---

## 4. Schema coordinates: is a built-in scalar the schema doesn't use a schema element?

**Sections:** §2.14 Schema Coordinates; §3.5 Scalars

§2.14:
> A _schema element_ can be a named type, a field, an input field, an enum value, a field argument, a directive, or a directive argument defined within a schema (including built-in types and directives).

> For example, `String` and `@deprecated(reason:)` are both valid schema coordinates which refer to built-in schema elements.

§2.14 (TypeCoordinate):
> Return the type in {schema} named {typeName} if it exists.

§3.5:
> When returning the set of types from the `__Schema` introspection type, all referenced built-in scalars must be included. If a built-in scalar type is not referenced anywhere in a schema (there is no field, argument, or input field of that type) then it must not be included.

**Problem:** Does `Int` resolve in a schema where no field, argument or input field has type `Int`? §2.14 counts built-in types as schema elements, while §3.5 leaves an unreferenced built-in scalar out of the schema's types, which suggests the schema doesn't have it. The text also doesn't say whether references from introspection types or built-in directives' arguments count as "referenced" (graphql-js always has `String` and `Boolean` for that reason).

**Kit today:** coordinate: the vectors for unreferenced built-in scalars (`Boolean` in one schema, `Int` in the other) are `unspecified`. Their parse is graded under `grammar` (MUST), their resolution isn't. Referenced built-in scalars are graded under `resolvesTypes` (MUST).

---

## 5. Typo in §2.14: "every schema coordinates has" (editorial)

**Sections:** §2.14 Schema Coordinates

> This ensures that every schema coordinates has a single unambiguous and unique lexical form.

**Problem:** It should read "every schema coordinate has".

**Kit today:** no grading effect. The sentence is quoted in the basis of coordinate `noIgnored` (MUST).

---

## 6. Declaring a built-in scalar or a built-in directive in SDL: conflict, or just the built-in written out?

**Sections:** §3.3 Schema; §3.5 Scalars; §3.13 Directives

§3.3:
> No provided type may have a name which conflicts with any built in types (including Scalar and Introspection types).

> All directives within a GraphQL schema must have unique names.

§3.5:
> When representing a GraphQL schema using the type system definition language, all built-in scalars must be omitted for brevity.

§3.13:
> When representing a GraphQL schema using the type system definition language any _built-in directive_ may be omitted for brevity.

**Problem:** The two "omitted" sentences bind whoever prints SDL. They don't say what a reader does with `scalar String` or `directive @include(if: Boolean!) on FIELD | FRAGMENT_SPREAD | INLINE_FRAGMENT` in a document. It may be a provided type or directive whose name conflicts with the built-in, which makes the schema invalid. Or it may just write out the built-in: "may be omitted" for directives implies they may also be included.

**Kit today:** schema `typeNameNotBuiltin` (MUST): `scalar String type Query { a: Int }` is `unspecified` and not graded (`TypeSystem.tla` reads it as a conflict); `type Int { ... }` stays graded. Redefining a built-in directive (`directiveNamesUnique`) has no vector.

---

## 7. Root types when the schema definition is omitted: the text says when a writer may omit it, not how a reader finds the roots

**Sections:** §3.3.1 Root Operation Types

> The type system definition language can omit the schema definition when each _root operation type_ uses its respective _default root type name_, no other type uses any _default root type name_, and the schema does not have a description.

> The schema definition must be included, otherwise the {"Mutation"} type would be incorrectly presumed to be the {`mutation`} _root operation type_ of the schema.

> If it is provided, it must be an Object type.

**Problem:** No normative sentence says how a reader finds the roots when the schema definition is omitted. That a type named `Query`, `Mutation` or `Subscription` is presumed to be a root is said only in the text around the examples, which Appendix A makes non-normative. For `type Query { a: Int } interface Mutation { a: Int }` without a schema definition there are three readings: `Mutation` is the mutation root and the schema is invalid ("must be an Object type"); the schema has no mutation root and is valid; or the document is wrong because "no other type uses any _default root type name_" doesn't hold. October 2021 has neither the "no other type" clause nor the example.

**Kit today:** schema `rootTypesAreObjects` (MUST): `rootTypesAreObjects.2.invalid` (the document above) is graded as invalid, since September 2025 (the release that added "no other type uses any _default root type name_"). `TypeSystem.tla` takes `Mutation` as the mutation root; the other reading rejects the document too.

---

## 8. The §3.3.2 Note asks for a `[lookahead != {]` that the grammar of scalars, unions and directives doesn't have

**Sections:** §3.3.2 Schema Extension; §3.5 Scalars; §3.8 Unions; §3.13 Directives; §3.13.6 Directive Extensions; Appendix A Conformance

§3.3.2 (Note):
> Note: Schema extensions without additional operation type definitions must not be followed by a {`{`} (such as a query shorthand) to avoid parsing ambiguity. The same limitation applies to the type definitions and extensions below.

§3.3.2 (grammar):
> extend schema Directives[Const] [lookahead != `{`]

§3.5, §3.8, §3.13.6 (grammar):
> ScalarTypeDefinition : Description? scalar Name Directives[Const]?

> UnionTypeDefinition : Description? union Name Directives[Const]? UnionMemberTypes?

> DirectiveExtension : extend directive @ Name Directives[Const]

Appendix A:
> Notes in this document are non-normative

**Problem:** The grammar puts the lookahead only on productions whose body is in braces (schema, object, interface, enum and input object definitions and extensions). Scalar and union definitions and extensions, directive definitions and directive extensions have none. So in a Document, `scalar S {a}` is a scalar definition followed by a query shorthand. The Note says "The same limitation applies to the type definitions and extensions below", which suggests the opposite. The Note is non-normative, so the grammar governs, but either the Note or the grammar should change.

**Kit today:** parse (capability `parse-sdl`), MUST, following the grammar: 6 accepted `"document"` vectors such as `scalar S {a}` (`scalarDefinition`), `union U = A {a}` (`unionDefinition`) and `extend directive @d @x {a}` (`directiveExtension`).

---

## 9. `extend schema` on a schema with no schema definition: is the schema "already defined"?

**Sections:** §3.3.2 Schema Extension; §3.3.1 Root Operation Types

§3.3.2:
> The Schema must already be defined.

§3.3.1:
> This example describes a valid complete GraphQL schema, despite not explicitly including a {`schema`} definition.

**Problem:** A document without a `schema` definition still has a schema, with its roots taken from the default names. The text doesn't say whether that schema is "already defined" for an `extend schema @d` in the same document, or whether the rule needs an explicit `schema { ... }`.

**Kit today:** schema `schemaExtensionDefined` (MUST) is always untested: its only invalid vector, `directive @d on SCHEMA type Query { a: Int } extend schema @d`, is `unspecified`. `TypeSystem.tla` reads the rule as requiring a `schema` definition in the document.

---

## 10. `extend schema` may name a root operation type the schema already has

**Sections:** §3.3.2 Schema Extension; §3.3.1 Root Operation Types

§3.3.2 (the whole rule list):
> 1. The Schema must already be defined.
> 2. Any non-repeatable directives provided must not already apply to the previous
>    Schema.

§3.3.2:
> For example, this might be used by a GraphQL service which adds additional operation types, or additional directives to an existing schema.

§3.6.3 (the kind of rule schema extensions lack):
> Any fields of an Object type extension must not be already defined on the previous Object type.

**Problem:** Every type extension kind forbids re-adding an item the previous type has. Schema extensions have no such rule, so `schema { query: Query } extend schema { query: Other }` breaks no rule. The text doesn't say whether that is invalid, replaces the root, or is ignored.

**Kit today:** not vectored (`docs/kit/schema.md`, Limits). `TypeSystem.tla` keeps the first root; graphql-js rejects the document.

---

## 11. "Already defined" and "the previous type" aren't defined in terms of document order

**Sections:** §3.1 Type System Extensions; §3.3.2 Schema Extension; §3.5.6 Scalar Extensions; §3.6.3 Object Extensions; §3.7.1 Interface Extensions; §3.8.1 Union Extensions; §3.9.1 Enum Extensions; §3.10.2 Input Object Extensions; §3.13.6 Directive Extensions

§3.6.3 (the same wording recurs for every kind):
> The named type must already be defined and must be an Object type.

> Any fields of an Object type extension must not be already defined on the previous Object type.

§3.1:
> Type system extensions are used to represent a GraphQL type system which has been extended from some previous type system.

October 2021, §3.6.3:
> Any fields of an Object type extension must not be already defined on the
>   original Object type.

**Problem:** There are two open questions. (a) Whether a definition that comes later in the same document counts as "already defined": `extend type Query { b: Int } type Query { a: Int }`. (b) What "the previous" type is when one document extends a type twice: the definition alone, or the definition plus the earlier extensions. October 2021 said "original", September 2025 changed it to "previous" without defining it. The two readings differ for `type Query { a: Int } extend type Query { b: Int } extend type Query { b: Int }`.

**Kit today:** schema. `TypeSystem.tla` applies extensions in document order, with "previous" meaning the definition plus the earlier extensions (`extensionItemsNew`, `extensionDirectivesNotReapplied`, MUST). The doubled-extension vector is tagged since September 2025. No vector puts an extension before its definition, so (a) isn't graded.

---

## 12. Can a built-in scalar or built-in directive be extended?

**Sections:** §3.5 Scalars; §3.5.6 Scalar Extensions; §3.13 Directives; §3.13.4 @specifiedBy; §3.13.6 Directive Extensions

§3.5.6:
> The named type must already be defined and must be a Scalar type.

§3.13.6:
> The previous directive must already be defined.

§3.13.4:
> It must not appear on built-in scalar types.

§3.5:
> Built-in scalar types must not provide a _scalar specification URL_ as they are specified by this document.

§3.13:
> When representing a GraphQL schema using the type system definition language any _built-in directive_ may be omitted for brevity.

**Problem:** Built-ins are left out of SDL, so the text doesn't say whether they count as "already defined" for `extend scalar Int @d` or `extend directive @deprecated @d`. The `@specifiedBy` rule implies that `extend scalar Int @specifiedBy(url: "...")` is at least something a document can say, but the extension rules don't say so.

**Kit today:** schema: `extensionTargetDefined` (MUST) treats a built-in scalar as defined, and `specifiedByNotBuiltin` (MUST) grades `extend scalar Int @specifiedBy(url: "...")`. Other extensions of built-in scalars, and any extension of a built-in directive, aren't vectored.

---

## 13. Interface extensions have no rule against adding an interface the type already implements

**Sections:** §3.6.3 Object Extensions; §3.7 Interfaces; §3.7.1 Interface Extensions

§3.6.3:
> Any interfaces provided must not be already implemented by the previous Object type.

§3.7.1 (grammar: interface extensions can add interfaces):
> extend interface Name ImplementsInterfaces [lookahead != `{`]

§3.7:
> An interface type may declare that it implements one or more unique interfaces, but may not implement itself.

**Problem:** §3.7.1's rule list has no counterpart to §3.6.3's rule 5, so `interface I implements A { ... } extend interface I implements A` breaks no extension rule. §3.7's "unique interfaces" might catch it on the merged type, but §3.6 has the same "unique interfaces" sentence and §3.6.3 still states rule 5, so the asymmetry looks unintended.

**Kit today:** schema `extensionInterfacesNew` (MUST) covers object type extensions. The interface case is graded under `implementsUnique` (MUST) on the resulting type: `TypeSystem.tla` keeps every interface an interface type extension adds (`AddedInterfaces`), and `implementsUnique.3` and `.4` are minimal pairs (`schema-extensions`).

---

## 14. No type system rule against a non-repeatable directive applied twice on a definition

**Sections:** §3.13 Directives; §3.6.3 Object Extensions (and the other extension sections); §5.7.3 Directives Are Unique per Location

§3.13:
> A directive may be defined as repeatable by including the "repeatable" keyword.

§3.6.3 (rules exist only for extensions, against the previous type):
> Any non-repeatable directives provided must not already apply to the previous Object type.

§5.7.3 (Validation, which is about requests):
> In contrast, if a directive is not `repeatable`, then only one occurrence of it is allowed per location.

**Problem:** For `directive @d on OBJECT type Query @d @d { a: Int }`, no rule in §3 applies. The extension rules compare an extension's directives with the previous type, not with each other, and §5.7.3 validates executable documents. The intent is clear from "repeatable", but no rule states it for type system definitions (or for a single extension that applies a directive twice).

**Kit today:** schema `directiveNotRepeated`, INFO.

---

## 15. No type system rule that a directive applied in SDL has fitting arguments

**Sections:** §3.13 Directives; §5.4 Arguments (§5.4.1 to §5.4.3); §5.6.1 Values of Correct Type

§3.13 (the general rule for directives applied in SDL, which is about locations only):
> Directives must only be used in the locations they are declared to belong in.

§5.4.3 (Validation, which is about requests):
> For each Field or Directive in the document:

§5:
> A GraphQL service does not just verify if a request is syntactically correct, but also ensures that it is unambiguous and mistake-free in the context of a given GraphQL schema.

**Problem:** §3 checks where an applied directive may appear, but nothing about its arguments: an undefined argument, a repeated one, a missing required one, or a value of the wrong type (`@deprecated(reason: 1)`, `@specifiedBy` without `url`) breaks no rule in §3. §5's argument and value rules apply to request documents.

**Kit today:** schema `appliedDirectiveArguments`, INFO.

---

## 16. Int's 32-bit range: a MUST in §3.5, a SHOULD in §3.5.1

**Sections:** §3.5 Scalars; §3.5.1 Int; §5.6.1 Values of Correct Type

§3.5:
> As an example, a service must not include a type called {Int} and use it to represent 64-bit numbers, internationalization information, or anything other than what is defined in this document.

§3.5.1 (input and result coercion):
> If the integer input value represents a value less than -2<sup>31</sup> or greater than or equal to 2<sup>31</sup>, a _request error_ should be raised.

> If the integer internal value represents a value less than -2<sup>31</sup> or greater than or equal to 2<sup>31</sup>, an _execution error_ should be raised.

§5.6.1:
> {value} must be coercible to {type}

**Problem:** A service that accepts or returns 2147483648 as an Int seems to use Int "to represent 64-bit numbers", which §3.5 forbids with a "must". But the sentences that would enforce the range are "should", and the §3.5 sentence starts with "As an example", which Appendix A makes non-normative. So the level of the range check is unclear. §5.6.1's MUST then depends on it: an out-of-range literal is "coercible" exactly when the service doesn't follow the SHOULD.

**Kit today:** SHOULD everywhere: validate `intInputRange`, coerce `intRange`, execution `intRange` (capability `scalar-results`). The schema reference accepts Int defaults of any size (the weaker reading); no vector depends on it.

---

## 17. Float input: "a value outside the available precision" isn't defined

**Sections:** §3.5.2 Float; §5.6.1 Values of Correct Type

§3.5.2:
> If the input value otherwise represents a value not representable by finite IEEE 754 (e.g. {NaN}, {Infinity}, or a value outside the available precision), a _request error_ must be raised.

**Problem:** The phrase can't mean every value that has no exact double, since `0.1` has none and every implementation rounds it. It might mean an integer a double can't hold exactly (`99999999999999999999`, 2^53 + 1), underflow (`1e-400` rounds to 0), or only overflow (`1e400`). Each reading gives different verdicts, in validation (§5.6.1) and in variable coercion.

**Kit today:** overflow (`1e400`) is graded as a MUST (validate `valuesOfCorrectType`, coerce `float`, schema `argDefaultCompatible`). Underflow isn't vectored in validate. Integers beyond double precision are coerce `floatPrecision`, INFO: refusing and rounding both pass. Schema default values aren't checked for precision.

---

## 18. IsValidImplementation: "required" vs "non-nullable" for an implementation's extra argument

**Sections:** §3.6 Objects (IsValidImplementation); §3.12 Non-Null; §3.13.3 @deprecated; §5.4.3 Required Arguments

§3.6:
> {field} may include additional arguments not defined in {implementedField}, but any additional argument must not be required, e.g. must not be of a non-nullable type.

§3.12:
> For the sake of simplicity nullable types are always optional and non-null types are always required.

§5.4.3:
> An argument is required if the argument type is non-null and does not have a default value. Otherwise, the argument is optional.

§3.13.3:
> The `@deprecated` directive must not appear on required (non-null without a default) arguments or input object field definitions.

**Problem:** An extra argument `b: Int! = 1` is optional by §5.4.3's and §3.13.3's definition, so an implementing field may have it. By the "e.g." clause and §3.12's sentence it is "required", so it may not. The spec uses both meanings of "required".

**Kit today:** schema `implExtraArgOptional` (MUST) is graded on a plain `Int!` extra argument only. `Int! = 1` isn't vectored. `TypeSystem.tla` uses "non-null without a default".

---

## 19. Default value compatibility is required for object field arguments only

**Sections:** §3.6 Objects; §3.7 Interfaces; §3.10 Input Objects; §3.13 Directives

§3.6, Type Validation 2.4.5:
> If the argument has a default value it must be compatible with {argumentType} as per the coercion rules for that type.

§3.7, Type Validation 2.4 (the argument rules end here):
> The argument must accept a type where {IsInputType(argumentType)} returns {true}.

**Problem:** §3.7 (interface field arguments), §3.10 (input field defaults) and §3.13 (directive arguments) have no counterpart, so `interface I { f(x: Int = "a"): Int }` or `input In { x: Int = "a" }` breaks no rule. §3.7's argument rules also lack §3.6's rule 2.4.4 (no `@deprecated` on a Non-Null argument without a default), though §3.13.3 states that one for all arguments.

**Kit today:** schema `argDefaultCompatible` (MUST) covers object field arguments only. `TypeSystem.tla` has `OtherDefaultsAreCompatible` outside the verdict. An implementation that also checks the others (graphql-js 17) isn't marked over-strict, because no valid sibling has a bad default there.

---

## 20. A directive referencing itself through its argument's type: the prose forbids it, rule 3 doesn't

**Sections:** §3.13 Directives

Prose:
> While defining a directive, it must not reference itself directly or indirectly:

Type Validation, rule 3:
> A Directive definition must not contain the use of a Directive which references itself indirectly by referencing a Type or Directive which transitively includes a reference to this Directive.

**Problem:** In `directive @d(a: In) on INPUT_FIELD_DEFINITION input In { f: Int @d }`, the definition of `@d` uses no directive at all, but reaches itself through its argument's type. The prose forbids that; rule 3 is only about directives the definition uses, so it allows it. Rule 3's "references itself" is also ambiguous: the used directive references itself, or references the directive being defined.

**Kit today:** schema `directiveReferencesItselfIndirectly` (MUST): the two vectors that depend on this (the one above and an enum-value variant) are `unspecified`. `TypeSystem.tla` follows the prose.

---

## 21. Field selection merging: "identical sets of arguments" isn't defined

**Sections:** §5.3.2 Field Selection Merging

Formal text:
> {fieldA} and {fieldB} must have identical sets of arguments.

Explanatory text:
> If multiple field selections with the same _response name_ are encountered during _operation execution_, the field and arguments to execute and the resulting value should be unambiguous.

**Problem:** "Identical" can be read as the same source text, the same literal values, or the same coerced values (defaults included). The readings differ on `a: search(term: "x")` with `a: search(term: """x""")`, `echo(float: 1)` with `echo(float: 1.0)`, `echo(list: [1])` with `echo(list: 1)`, and `echo(opt: 1)` with `echo` where `opt` defaults to 1. The explanatory text ("the field and arguments to execute ... should be unambiguous") fits the coerced reading best.

**Kit today:** validate `identicalArgumentsReading`, INFO: 5 vectors are `unspecified`. `fieldSelectionMerging` (MUST) grades the rest, comparing literal values.

---

## 22. Fragment spread is possible: the formal text and the prose disagree for an interface with no implementations

**Sections:** §5.5.2.3 Fragment Spread Is Possible

Formal text:
> Let {applicableTypes} be the intersection of {GetPossibleTypes(fragmentType)} and {GetPossibleTypes(parentType)}.

> {applicableTypes} must not be empty.

> If {type} is an interface type, return the set of types implementing {type}.

Prose:
> Additionally, an interface type fragment can always be spread into an interface scope which it implements.

**Problem:** If no object type implements interface `Resource` (which implements `Node`), the formal text finds no possible types and rejects `... on Resource` inside `Node`, and inside `Resource` itself. The prose says the first is "always" valid. The prose doesn't cover spreading an interface into its own scope. Once an object type implements the interface, the two texts agree.

**Kit today:** validate `fragmentSpreadReading`, INFO: 6 vectors are `unspecified`. `fragmentSpreadIsPossible` (MUST) follows the formal text everywhere else. graphql-js answers invalid for `Resource` in `Node` and valid for `Resource` in `Resource`.

---

## 23. OneOf: the formal text lets a nullable variable with a default into a OneOf field, the prose doesn't

**Sections:** §5.8.5 All Variable Usages Are Allowed (with §3.10.1 OneOf Input Objects)

Formal text:
> If {parentLocationType} is a _OneOf Input Object_ type, return {true}.

> Let {hasNonNullVariableDefaultValue} be {true} if a default value exists for {variableDefinition} and is not the value {null}.

> If {hasNonNullVariableDefaultValue} is NOT {true} AND {hasLocationDefaultValue} is NOT {true}, return {false}.

Explanatory text:
> Variables used for OneOf Input Object fields must be non-nullable.

**Problem:** IsNonNullPosition makes a OneOf field a non-null position, and then the general rule lets a nullable variable with a non-null default in. So `query Q($v: ID = "1") { echo(pick: {id: $v}) }` is valid by the formal text and invalid by the prose.

**Kit today:** validate `oneOfVariableReading`, INFO: 2 vectors are `unspecified`. `allVariableUsagesAreAllowed` (MUST) follows the formal text elsewhere. graphql-js 16 and 17 follow the prose.

---

## 24. A subscription root field's argument that can't be coerced: execution error or request error?

**Sections:** §6.1 Executing Requests; §6.2.3.1 Source Stream; §6.4.1 Coercing Field Arguments; §7.1.5 Data; §7.1.6 Errors

§6.4.1:
> Otherwise if {argumentType} is a Non-Nullable type, and either {hasValue} is not {true} or {value} is {null}, raise an _execution error_.

> Any _request error_ raised as a result of input coercion during {CoerceArgumentValues()} should be treated instead as an _execution error_.

§6.2.3.1 (CreateSourceEventStream, which ExecuteRequest calls before Subscribe):
> Let {argumentValues} be the result of {CoerceArgumentValues(subscriptionType, field, variableValues)}.

> Note: The call to {CreateSourceEventStream()} occurs before _operation execution_ begins, and thus an error raised here will be a _request error_.

§7.1.5:
> If an error was raised before _operation execution_ begins, the _response_ must be a _request error result_ which will result in no response data.

§7.1.6:
> An _execution error_ must occur at a specific _response position_

**Problem:** For `subscription { eventNN(v: null) }`, CoerceArgumentValues raises an execution error, and §6.4.1 says even a request error there "should be treated" as one. But the call happens before operation execution begins, where §7.1.5 requires a request error result, and there is no response position yet for an execution error to occur at. The Note sides with the request error, but Notes are non-normative.

**Kit today:** coerce `sourceStreamArguments`, MUST, since September 2026 (capability `subscription-source`, 5 vectors): only a request error passes. `Coercion.tla` gives the request error and has no switch for the other.

---

## 25. A response stream that must "complete with that error" vs one that "must be a stream of _execution result_"

**Sections:** §6.2.3 Subscription; §6.2.3.2 Response Stream; §7.1.2 Response Stream

§6.2.3 (Event Streams):
> If an _event stream_ encounters an error, it must complete with that error.

§6.2.3.2 (MapSourceToResponseEvent):
> When {sourceStream} completes with {error}: ... Complete {responseStream} with {error}.

§7.1.2:
> A response stream must be a stream of _execution result_.

§6.2.3 (Delivery Agnostic):
> GraphQL subscriptions do not require any specific serialization format or transport mechanism.

**Problem:** The algorithm ends the response stream with an error, but §7 defines a response stream only as a stream of execution results and doesn't say what a client receives when the stream completes with an error. Where a stream can't end with an error (a Rust `Stream` of `Result` items, as in Juniper and async-graphql), the only way to signal it is a last item, and that item has to be an execution result (with `data`) or something §7.1.2 doesn't allow.

**Kit today:** execution `failsWithSource`, MUST since September 2025 (capability `subscription-stream`), with the weaker reading: a result with `errors` after the source failed, then normal completion, passes; normal completion with no such result fails.

---

## 26. Cancelling a subscription while an event is executing

**Sections:** §6.2.3 Subscription; §6.2.3.2 Response Stream; §6.2.3.3 Unsubscribe

§6.2.3.2 (MapSourceToResponseEvent):
> When {sourceStream} emits {sourceValue}: ... Otherwise emit {executionResult} on {responseStream}.

> When {responseStream} is cancelled: ... Complete {responseStream} normally.

§6.2.3:
> When an _event stream_ is cancelled, it must complete.

October 2021, §6.2.3:
> An observer may at any point decide to stop observing an event stream by cancelling it, after which it must receive no more events from that event stream.

**Problem:** The algorithm doesn't say what happens to an event whose ExecuteSubscriptionEvent is still running when the client cancels. Its "emit" step comes after, and "it must complete" doesn't say how soon. So the result may be dropped, or emitted before the stream completes. October 2021 forbade any further event after cancelling; September 2025 removed that sentence and put nothing in its place.

**Kit today:** execution `nothingAfterCancel`, SHOULD (October 2021: MUST). graphql-js 16 and 17 both deliver the in-flight result.

---

## 27. When may a response stream complete? The algorithm's list vs "may complete at any point"

**Sections:** §6.2.3 Subscription; §6.2.3.2 Response Stream

§6.2.3 (Event Streams):
> An _event stream_ may complete at any point, often because no further events will occur.

> Internal user code also may cancel an _event stream_ for any reason, which would be observed as that _event stream_ completing.

§6.2.3.2:
> When {sourceStream} completes normally: ... Complete {responseStream} normally.

> the only remaining error condition handled from {ExecuteSubscriptionEvent()} are internal exceptional errors not described by this specification.

**Problem:** MapSourceToResponseEvent completes the response stream only when the source completes or fails, when the client cancels, or on an internal error. The general text on event streams, which covers response streams, lets any event stream complete at any point. The text doesn't say whether a service may end a response stream for other reasons (a timeout, a shutdown, a field error with `data: null`), or at what level the algorithm's list binds.

**Kit today:** execution `streamEndsOnlyForCause`, SHOULD. A stream that ends instead of answering an event fails `eventPerSourceEvent` (MUST).

---

## 28. Subscription events: may executions overlap, and must results keep source order?

**Sections:** §6.2.3 Subscription; §6.2.3.2 Response Stream

§6.2.3:
> If the operation is a subscription, the result is an _event stream_ called the _response stream_ where each event in the event stream is the result of executing the operation’s _root selection set_ for each new event on an underlying _source stream_

§6.2.3.2:
> When {sourceStream} emits {sourceValue}: ... Let {executionResult} be the result of running {ExecuteSubscriptionEvent(subscription, schema, variableValues, sourceValue)}.

§6.2.3 (Delivery Agnostic):
> There are intentionally no specifications for message acknowledgement, buffering, resend requests, or any other quality of service (QoS) details.

**Problem:** Event execution can be asynchronous. The text doesn't say whether the next event's execution may start before the previous result was emitted, or whether results must be emitted in source-event order when executions overlap. graphql-js 16 overlaps executions when a client calls `next()` concurrently, so results can settle out of order; graphql-js 17 never overlaps.

**Kit today:** not graded. The kit waits for each event's result before its next step, so overlapping executions are never tried. `eventPerSourceEvent` (MUST) checks that each event gets one result, not their order. Source order is a property of the model (`responsesInSourceOrder` in `specs/subscription.ts`) only.

---

## 29. October 2021: MapSourceToResponseEvent completes the response stream when the response stream completes (editorial, fixed)

**Sections:** §6.2.3.2 Response Stream (October 2021, same number)

October 2021:
> When {responseStream} completes: complete this event stream.

September 2026:
> When {sourceStream} completes normally: ... Complete {responseStream} normally.

**Problem:** In October 2021, "this event stream" is the response stream, so the step is circular. It means the source stream. September 2025 and September 2026 fix it.

**Kit today:** execution `completesWithSource`, MUST, with level SHOULD under October 2021 because of this wording.

## 30. `@skip` and `@include` with a variable that is explicitly null

**Sections:** §6.3.2 Field Collection, §5.8.5 All Variable Usages Are Allowed, §3.13.1 @skip, §3.13.2 @include.

A nullable variable with a non-null default may be used for `if: Boolean!` (§5.8.5, IsVariableUsageAllowed: "Let {hasNonNullVariableDefaultValue} be {true} if a default value exists for {variableDefinition} and is not the value {null}."), and a request may still send it as an explicit `null`, which CoerceVariableValues keeps. CollectFields then decides with the variable's value directly, without coercing the directive's arguments:

> If {skipDirective}'s {if} argument is {true} or is a variable in {variableValues} with the value {true}, continue with the next {selection} in {selectionSet}.

> If {includeDirective}'s {if} argument is not {true} and is not a variable in {variableValues} with the value {true}, continue with the next {selection} in {selectionSet}.

So for `query($s: Boolean = false) { a @skip(if: $s) b }` with `{"s": null}` the text keeps `a` (null is not true), and `@include(if: $s)` would drop it. graphql-js 16 and 17 instead coerce the directive's arguments and answer `{"errors": [{"message": "Argument \"if\" of non-null type \"Boolean!\" must not be null." …}], "data": null}`. Nothing says whether `if` must be coerced as an argument (which would raise an error) or read as CollectFields reads it.

**Kit today:** not graded. `Reference.tla`'s `IfValue` only takes Booleans, and no fixture sends a null for a directive's variable.

---

## Dropped

- **§3.13.2 @include: "must" in a Note** (from the inventory's spec observations). The Note says a field with both directives "_must_ be queried only if the `@skip` condition is false _and_ the `@include` condition is true". Notes are non-normative, but CollectFields (§6.3.2) states the same behaviour normatively, so the text already settles it. At most a style point.

## Merged

- The introspect "REVIEW" item on `defaultValuePrinting` (§2.10.4) is part of item 1. It was the kit's decision on that issue, and the kit now takes the weaker reading.
- The coordinate follow-up line "Assert undefined + typo" is split into items 3 and 5.
- The schema-ext items "doc order" and "original vs previous" are item 11.
- The inventory's S5-38 and S5-60 are the validate follow-ups for §5.5.2.3 and §5.8.5 (items 22 and 23). S5-22 ("identical" undefined) is item 21.
- The validate follow-up "§5.6.1 MUST vs §3.5.1 SHOULD" and the inventory's "§3.5 MUST vs §3.5.1 SHOULD" are item 16.
- The validate follow-up "§3.5.2 underflow" and the coerce `floatPrecision` reading are item 17.
- The inventory's "redefining a built-in directive" (§3.3, §3.13) and the schema area's "declaring a built-in scalar" are item 6.
