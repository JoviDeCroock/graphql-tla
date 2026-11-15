# The schema area

`graphql-tla run schema` checks schema validation: whether an implementation accepts an SDL schema exactly when the type system rules of §3, and §4's Reserved Names, allow it. The reference is [`specs/TypeSystem.tla`](../../specs/TypeSystem.tla), whose `Verdict(S)` is the set of rules a schema breaks. It covers the Type Validation rules of:

- §3.3 Schema, with "a document must include at most one `schema` definition", and §3.3.1 Root Operation Types;
- §3.6 Objects, including IsValidImplementation, and §3.7 Interfaces;
- §3.8 Unions, §3.9 Enums, §3.10 Input Objects (with OneOf, and both kinds of cycle);
- §3.13 Directives, with "Directives must only be used in the locations they are declared to belong in" for the directives a document applies, and §3.13.3's rule that a required argument or input field can't be deprecated;
- §4's Reserved Names, for enum values: "any Name within a GraphQL type system must not start with two underscores". §3.9 says nothing about `__`.

```shell
npx graphql-tla run schema --adapter "node adapters/graphql-js/adapter.mjs --graphql 17" --strict --report schema.json
```

The area follows [the contract for areas beyond execution](../kit-areas.md).

## Request

```json
{"type":"schema","id":12,"sdl":"interface I { f: Int } type Query implements I { f(b: Int!): Int }"}
```

- **`sdl`:** a type system document with type, directive and schema definitions, and no extensions. Built-in scalars and directives aren't defined in it.

Build a schema from it and validate it, the way your implementation does before it would serve the schema.

## Result

```json
{"type":"result","id":12,"valid":false}
```

- **`valid`:** whether the implementation accepts the schema. A schema the implementation rejects, with its validation errors or by failing to build it, is `valid: false`. Rejecting is an answer, not an adapter error.

Any other fields, such as `errors` with the implementation's messages, are ignored, but they appear in the report's examples.

**Crashes.** If the implementation crashes on a schema, say with a stack overflow or a null dereference, rather than rejecting it, answer `{"type":"error","id":12,"message":"…"}`. The run goes on: the kit reports the vector as a crash, as it does in parse, validate and coerce ([the protocol](../kit-areas.md#protocol)). Only the message's first line reaches the report, so a stack trace's paths stay out of it.

The kit can only tell a crash from a rejection by this. A `valid: false` is a rejection, whatever made it, so an adapter that turns every exception into `valid: false` hides its crashes: they pass on invalid schemas and count as rejections of valid ones. Report as a crash any failure that isn't the implementation saying the schema is invalid. A silent adapter still stops the run.

The area needs SDL input. A code-first framework that can't build a schema from SDL can't take part. It just doesn't claim the `schema` capability.

## What is checked

The vectors come in minimal pairs. Each pair is an invalid schema that breaks exactly one rule, by the reference, and a valid sibling one small edit away:

```graphql
interface I { f: Int } type Query implements I { f(b: Int!): Int }      # breaks IMPL_EXTRA_ARG_OPTIONAL
interface I { f: Int } type Query implements I { f(b: Int): Int }       # valid
```

That gives a verdict per rule without asking which rule the implementation applied:

- the rule is **not enforced** when the implementation accepts an invalid schema. That is conclusive, and it is the only thing a rule's check rests on.
- rejecting a valid sibling fails a separate check, `acceptsValid`. The kit doesn't know which rule the implementation applied, so the rule the sibling's pair breaks is only a **hint**.
- the implementation **crashes** on a schema when the adapter answers it with an `error`. On an invalid schema a crash fails the rule, as accepting it would; on a valid one it fails `acceptsValid`.

There is one check per rule in `TypeSystem!Rules`, at the sections that state it, and `acceptsValid` (§3: a schema is invalid only when it breaks a rule). Every check is a MUST, and each has a `basis` that quotes the sentences it rests on, which the sheet prints. [`kit/schema/rules.mjs`](../../kit/schema/rules.mjs) lists the rules:

| Section | Checks |
| --- | --- |
| §3.3 | `typeNamesUnique`, `typeNameNotBuiltin`, `typeNameReserved`, `directiveNamesUnique`, `directiveNameReserved`, `schemaDefinitionUnique` |
| §3.3.1 | `queryRootProvided`, `rootTypesAreObjects`, `rootTypesDifferent` |
| §3.6, §3.7 | `fieldsDefined`, `fieldNamesUnique`, `fieldNameReserved`, `fieldOutputType`, `argNameReserved`, `argNamesUnique`, `argInputType`, `requiredArgNotDeprecated`, `argDefaultCompatible`, `implementsUnique`, `implementsInterfaces`, `implementsItself` |
| §3.6 IsValidImplementation (and §3.7, which applies it) | `implTransitive`, `implFieldProvided`, `implArgProvided`, `implArgInvariant`, `implExtraArgOptional`, `implFieldCovariant`, `implDeprecation` |
| §3.8 | `unionMembersDefined`, `unionMembersUnique`, `unionMembersObjects` |
| §3.9 | `enumValuesDefined`, `enumValuesUnique` |
| §4 | `enumValueNameReserved` |
| §3.10, §3.10.1 | `inputFieldsDefined`, `inputFieldNamesUnique`, `inputFieldNameReserved`, `inputFieldInputType`, `requiredInputFieldNotDeprecated`, `oneOfFieldNullable`, `oneOfFieldNoDefault`, `inputObjectUnbreakableCycle`, `inputObjectDefaultValueCycle` |
| §3.13 | `directiveLocationsDefined`, `directiveUsesItself`, `directiveReferencesItselfIndirectly`, `directivesDefined`, `directiveLocationsValid` |
| §3 | `acceptsValid`: the valid schemas are accepted |

A check cites every section its vectors rest on, not just the first. `fieldOutputType` and `argInputType` also cite §3.7 and §3.4.2 (and `argInputType` §3.13, for directive arguments); `implTransitive` also cites §3.7, whose "Interface definitions must not contain cyclic references nor implement themselves" a cycle of interfaces breaks. `argDefaultCompatible` cites the coercion rules a default is checked by: §3.5, §3.9, §3.10, §3.10.1, §3.11 and §3.12. A required input field that a default leaves out (`argDefaultCompatible.6`) is incompatible by §3.12, "If an argument or input-object field of a Non-Null type is not provided … then a request error must be raised"; §3.10's own sentence for that case says only "an error should be raised".

`directiveLocationsDefined` is always untested: SDL requires `on` and at least one location, so no document breaks it.

**References to undefined types.** A name the document doesn't define is no type. `TypeSystem.tla` gives it no kind, so §3.4.2's IsOutputType and IsInputType return false for it ("Return false"), and it isn't an Object or Interface type. So `type Query { a: Missing }` breaks `fieldOutputType`, an argument or input field of an undefined type `argInputType` or `inputFieldInputType`, `schema { query: Missing }` `rootTypesAreObjects`, `union U = Query | Missing` `unionMembersObjects`, and `implements Missing` `implementsInterfaces`. Each of these has a pair.

**Directives applied in SDL.** §3.13: "Directives must only be used in the locations they are declared to belong in." The same sentence is in October 2021. The kit reads where a document applies each directive (`kit/schema/tla.mjs`, `schemaVerdictData`) and `TypeSystem.tla` checks it against the directive's definition in the document, or the built-in directive of that name: `@skip` and `@include` on executable locations, `@deprecated` on field, argument, input field and enum value definitions and on directive definitions, `@specifiedBy` on scalars and `@oneOf` on input objects (§3.13.1 to §3.13.5). `directiveLocationsValid` fails for `directive @d on FIELD` applied to a field definition, and for `type Query @deprecated`. A directive that is neither defined nor built in isn't declared to belong anywhere, so applying it fails `directivesDefined`. A service "may provide any additional custom directive", so the vectors use a name no service is likely to provide, `@undefinedInThisSchema`. Applied directives' arguments, and a non-repeatable directive applied twice, aren't checked.

**One schema definition.** §3.3: "When using the type system definition language, a document must include at most one `schema` definition." `schemaDefinitionUnique` has one pair. Its invalid schema has two definitions that name the same root, so its roots are the same however a reader takes the two.

A failing vector counts toward one finding. Each finding has a `kind`: `not enforced`, `over-strict` (a rejected valid schema), `crash` or `malformed`.

- Accepted invalid schemas: one finding per rule, "RULE not enforced".
- Crashes on invalid schemas: one finding per rule and crash message, "RULE: crashes on a schema that breaks only this rule".
- Rejected valid schemas, and crashes on valid schemas: one finding per kind and **error message**, whatever the rule, under `acceptsValid`. The message is the first error in the answer's `errors` (or the crash's message), with the schema's own names, quoted text and numbers taken out, so that one error on two schemas groups. The finding's `hint` lists the rules the vectors' invalid siblings break, and `problem` gives the message. So a rule the spec doesn't have, such as "an interface needs an implementation", is one finding with every rule it touches in its hint, not one "over-strict" finding per rule. A finding calls its rule `likelyOverStrict` only when it has one rule in its hint, its vectors come from at least two of that rule's pairs, and another valid sibling of the rule is accepted. Otherwise which rule the implementation applied is a guess, and the message says. A rejection with no `errors` is grouped by its hint.

The run fails on any failing check, an answer without a boolean `valid`, or a failed self-test.

**Editions.** The kit grades September 2026, the latest release: every expected answer is `TypeSystem!Verdict`, and every `basis` quotes September 2026. October 2021 lacks some of its rules and syntax, and each of those first appeared in September 2025 or September 2026:

- rules new in September 2025, with the same wording as in September 2026: `argNamesUnique` (October 2021's Type Validation lists for objects, interfaces and directives have no argument uniqueness rule), `requiredArgNotDeprecated` and `requiredInputFieldNotDeprecated` (deprecated arguments and input fields), `argDefaultCompatible` and `inputObjectDefaultValueCycle` (default value validation), `implDeprecation`, `oneOfFieldNullable` and `oneOfFieldNoDefault`, and `directiveLocationsDefined` (October 2021's list for directives starts at "must not contain the use of a directive which references itself directly"). Their checks carry `"since": "September2025"`;
- syntax new in September 2025: `@oneOf`, and `@deprecated` on an argument or input field. New in September 2026: directives on a directive definition (`DIRECTIVE_DEFINITION`, graphql-spec #1206). No vector uses that yet;
- a rule that changed in September 2026: `inputObjectUnbreakableCycle`. September 2025 and October 2021 say "If an Input Object references itself either directly or through referenced Input Objects, at least one of the fields in the chain of references must be either a nullable or a List type." September 2026 replaced that with "InputObjectHasUnbreakableCycle(inputObject) must be false" (graphql-spec #1211), which also finds OneOf input objects that no finite value inhabits. The two agree on plain input objects. A OneOf input object's fields are nullable, so the older rule never finds a chain through one. `TypeSystem.tla` states the older rule too (`HasNoUnbrokenNonNullChain`, used only by `VerdictSeptember2025`), and the generator compares the two verdicts on every schema. Two invalid schemas differ: `inputObjectUnbreakableCycle.4.invalid` (`input First @oneOf { second: Second } input Second { first: First! }`) and `.5.invalid` (`input A @oneOf { b: B } input B @oneOf { a: A }`). September 2025 accepts both. Their valid siblings are valid in both releases.

A vector carries `since`, the first release whose text gives its verdict, with the features in `editionNote`, when October 2021 doesn't give that verdict. That is an invalid schema that breaks a rule new in September 2025 (October 2021 would accept it), any schema that uses new syntax, or a schema whose validity differs under September 2025's rules (since September 2026). A valid sibling of a new rule is not tagged unless it uses new syntax itself, because dropping a rule can't make a valid schema invalid. `type Query { f(x: Int, y: Int): Int }`, the sibling of an `argNamesUnique` pair, is valid in every release, so rejecting it is a failure under any of them.

A failing vector **relies on** its `since` release when the answer is a verdict: accepting a tagged invalid schema, or rejecting a tagged valid one. An implementation of an older release can give that answer and still follow its edition. A **crash is never tagged by release**. Under older releases every tagged schema still has a verdict, valid (`input I { i: I = {} }` breaks no October 2021 rule) or invalid (it uses a directive or location October 2021 doesn't define), and a crash is neither, so it fails in every release. Findings count the vectors that rely on each release (`since`, such as `{ "September2025": 3 }`), and mark their example `[since September 2025]` or `[since September 2026]`. A check with such failures gives `failingSince`, how many of its failing vectors rely on each release (zeros left out). A new rule's check whose failures include crashes says so in its note. The report's `since` gives, for each release, how many graded vectors are tagged with it and how many failed relying on it.

**Self-test.** Every run also judges deliberately wrong answers, and requires each to be caught: every vector's verdict flipped, the next vector's answer where it differs, an answer without `valid`, and a crash on a valid and on an invalid schema, which must count as crashes even with the right `valid`. It also builds reports from answers that are right but for a few, and requires, for each release, that a crash on an invalid schema tagged with it isn't counted under it while accepting the schema is, that rejecting (or crashing on) one valid schema fails `acceptsValid` and not its pair's rule and names no rule as likely over-strict, and that one message on valid siblings of two rules is one finding. That makes 409 negative controls. The expected answers themselves must all pass. The checker also fails if an `unspecified` vector is graded.

## Vectors

[`kit/schema/vectors.json`](../../kit/schema/vectors.json) holds 202 vectors: 102 pairs, in which two invalid schemas have two valid siblings each, so 100 invalid and 102 valid schemas. 198 are graded; 4 are `unspecified`. [`scripts/generate-vectors-schema.mjs`](../../scripts/generate-vectors-schema.mjs) writes it from the pairs it lists, after evaluating `TypeSystem!Verdict` on each schema with tla-ts. It fails unless every invalid schema breaks exactly its rule and every sibling breaks none, so a pair can't quietly test something else. `--check` regenerates the file and fails if it differs. graphql-js only parses the SDL; the generator reads it with `schemaVerdictData`, which adds the number of schema definitions and the directives the document applies to the schema data the introspect area also uses.

Each vector has:
- **`rule`:** the rule its pair is about;
- **`verdict`:** the reference's `Verdict`, `[rule]` or `[]`;
- **`expected`:** `{ "valid": verdict = [] }`;
- **`pair`:** its sibling's id. A valid sibling names its invalid schema;
- **`siblings`:** on an invalid schema with more than one valid sibling, all of them. `inputObjectUnbreakableCycle.1.invalid` (§3.10's `self: Example!`) has a nullable and a list sibling, and `requiredArgNotDeprecated.1.invalid` a nullable one and one with a default. The generator keeps an invalid schema listed in two pairs once, so it isn't graded twice;
- **`since`** and **`editionNote`:** the first release whose text gives the vector's verdict, `"September2025"` or `"September2026"`, and the features it relies on, for a vector whose verdict or syntax October 2021 doesn't have (38 vectors: 36 since September 2025, 24 invalid and 12 valid; 2 since September 2026, both invalid);
- **`unspecified`:** why the spec doesn't settle the vector's verdict. These vectors aren't sent to the adapter or graded (4 vectors, below);
- **`origin`:** for the 16 pairs taken from the spec's own examples, counter-examples and coercion rules, where they come from. They're the ones `specs/TypeSystemVectors.tla` also checks, such as §3.10's circular input objects, §3.7's `Image` that must also implement `Node`, and §3.13's `@invalidExample`.

The schemas come from [`scripts/differential-type-system.mjs`](../../scripts/differential-type-system.mjs): its hand-written cases and its scenario families, which are the vectors' `family`. The generator adds what the differential doesn't generate: undefined types, two schema definitions, and directives applied where they don't belong.

| Family | Vectors | What it is |
| --- | --- | --- |
| `names` | 28 | duplicate names, names starting with `__`, types named like built-ins |
| `root` | 18 | root operation types, with and without a schema definition, an undefined root, two schema definitions |
| `typeUse` | 27 | output and input types in the wrong place, undefined types, empty types, deprecated required arguments |
| `defaults` | 20 | default values that don't coerce, including §3.10's and §3.10.1's coercion tables, and a Float out of a double's range |
| `implementation` | 36 | IsValidImplementation, step by step, an undefined interface, a cycle of interfaces |
| `union` | 12 | union members, an undefined one included |
| `enum` | 6 | enum values |
| `input` | 33 | input fields, OneOf, cycles of Non-Null fields and of default values |
| `directive` | 22 | directives that reference themselves, undefined directives, directives in the wrong location |

Some rules have a second pair that only steers around a restriction an implementation adds, so that the invalid schema can't be rejected for that other reason. Hot Chocolate rejects a referenced interface that no object type implements, a rule the spec doesn't have, so it would reject an interface-only invalid schema whatever it does about the rule under test. `implementsItself.2`, `fieldNamesUnique.3`, `requiredArgNotDeprecated.5` and `implTransitive.3` give the interface an implementing object type. `implTransitive.3` is the cycle `interface A implements B`, `interface B implements A`, with `type Query implements A & B`: §3.7's "Interface definitions must not contain cyclic references nor implement themselves". `directiveUsesItself.2` and `directiveReferencesItselfIndirectly.4` allow their directives on `INPUT_FIELD_DEFINITION` too (graphql-ruby checks a directive's arguments as input fields). The first pairs stay as they are.

**Where the formal rule and the prose disagree.** §3.13 rule 3 says "A Directive definition must not contain the use of a Directive which references itself indirectly by referencing a Type or Directive which transitively includes a reference to this Directive." It speaks only of the directives a definition uses. The prose above it is broader: "While defining a directive, it must not reference itself directly or indirectly". `TypeSystem.tla` follows the prose, and also follows the directive's own argument types. Two invalid schemas depend on that reading, since their directive definition uses no directive at all and reaches itself only through its argument's type. They are `unspecified` and aren't graded:

| Vector | Schema |
| --- | --- |
| `directiveReferencesItselfIndirectly.1.invalid` | `directive @d(a: In) on INPUT_FIELD_DEFINITION input In { f: Int @d } type Query { a(x: In): Int }` |
| `directiveReferencesItselfIndirectly.3.invalid` | `directive @d(c: Color) on ENUM_VALUE enum Color { RED @d BLUE } type Query { a: Color }` |

Their valid siblings are valid under either reading, and are graded. So is `directiveReferencesItselfIndirectly.2.invalid`, where `@d` uses `@e` and `@e` uses `@d`, which breaks the formal rule too.

**A type named Mutation that isn't an object type.** `rootTypesAreObjects.2.invalid` is `type Query { a: Int } interface Mutation { a: Int }`, with no schema definition. `TypeSystem.tla` takes `Mutation` as the mutation root, an interface, so the schema breaks "If it is provided, it must be an Object type" (§3.3.1). No normative sentence says so. September 2026's §3.3.1 (and September 2025's) says "The type system definition language can omit the schema definition when each _root operation type_ uses its respective _default root type name_, no other type uses any _default root type name_, and the schema does not have a description", a condition on writing SDL that doesn't say what a reader makes of a document that omits the definition anyway. The reading rests on an example: "The schema definition must be included, otherwise the {"Mutation"} type would be incorrectly presumed to be the {`mutation`} _root operation type_ of the schema." October 2021 has neither the "no other type" clause nor that example, and its text allows reading the schema as one without a mutation root, which is valid. The vector is `unspecified`:

| Vector | Schema |
| --- | --- |
| `rootTypesAreObjects.2.invalid` | `type Query { a: Int } interface Mutation { a: Int }` |

Its valid sibling, which has `schema { query: Query }`, is graded, and so are `rootTypesAreObjects.1.invalid` (`interface Query { a: Int }`, invalid under either reading: if `Query` isn't the query root there is none) and `.3.invalid` (`schema { query: Q mutation: In }`, an input object named as the mutation root).

**Declaring a built-in scalar.** §3.3 says "No provided type may have a name which conflicts with any built in types (including Scalar and Introspection types)." §3.5 adds: "When representing a GraphQL schema using the type system definition language, all built-in scalars must be omitted for brevity." That second sentence binds whoever prints SDL. The spec doesn't say whether a schema that declares a built-in scalar anyway, as `scalar String`, provides a type that conflicts with the built-in, which a consumer must reject, or just names the built-in. `TypeSystem.tla` reads it as a conflict. The generator marks any `typeNameNotBuiltin` vector that declares `scalar Int`, `Float`, `String`, `Boolean` or `ID` as `unspecified`:

| Vector | Schema |
| --- | --- |
| `typeNameNotBuiltin.1.invalid` | `scalar String type Query { a: Int }` |

Its valid sibling, `scalar Str`, is graded. So is `typeNameNotBuiltin.2.invalid`, `type Int { a: String } type Query { a: String }`: an object type is not a built-in scalar, so it conflicts under any reading.

## graphql-js

[`adapters/graphql-js/areas/schema.mjs`](../../adapters/graphql-js/areas/schema.mjs) runs `buildSchema`, which applies the SDL rules, then `validateSchema`. A `GraphQLError`, or the plain `Error` `buildSchema` throws with the SDL rules' messages, is a rejection. Any other exception propagates, and the adapter answers with an `error`: a crash. The findings are the deviations `differential-type-system.mjs` documents in `VALIDATION_DEVIATIONS`. They aren't encoded as expected answers.

Both versions:
- **`typeNameNotBuiltin`:** accept `type Int { … }`. They also accept `scalar String`, which is `unspecified` and isn't graded;
- **`directiveUsesItself`:** accept §3.13's `@invalidExample`, and the same use on a directive also allowed on input fields (2 schemas);
- **`directiveReferencesItselfIndirectly`:** accept a directive that reaches itself through another directive (2 schemas). They also accept the two `unspecified` schemas above, which aren't graded.

17 also:
- **`argDefaultCompatible`:** accepts `type Query { f(x: Float = 1e400): Int }`, a Float default that no finite double represents (§3.5.2; since September 2025).

16 also:
- **`argDefaultCompatible`:** doesn't validate default values (10 schemas, all since September 2025);
- **`rootTypesDifferent`:** accepts the same type for two root operations;
- **`implDeprecation`:** accepts a deprecated field implementing one that isn't (since September 2025);
- **`inputObjectUnbreakableCycle`:** ignores OneOf input objects, so it accepts `inputObjectUnbreakableCycle.4.invalid` and `.5.invalid`, such as `input A @oneOf { b: B } input B @oneOf { a: A }`. Both are since September 2026: September 2025's rule accepts them too;
- **crashes:** overflows the stack (`RangeError: Maximum call stack size exceeded`) on an input field whose default is an object literal of an input type still being built, with a default value cycle or without. That fails `inputObjectDefaultValueCycle` on its 4 invalid schemas, such as `input I { i: I = {} }`, and `acceptsValid` on 3 valid ones, such as `input I { i: I = {i: null} }`, which break no rule in any release. The crashes aren't tagged by release: October 2021 has no default value rule, so it calls all 7 schemas valid, and a crash is no verdict.

Of the 48 checks with vectors, 17 passes 44 and 16 passes 39. Both enforce the rules this round added: undefined types, two schema definitions, and directive locations and definitions in SDL.

## Limits

- **Pairs, not coverage:** each rule is exercised by a handful of hand-picked pairs. The differential runs hundreds of generated schemas against graphql-js; the kit doesn't, so an implementation can pass here and still get a rarer schema wrong.
- **The reference's rules only:** undefined types, directive locations and undefined directives are checked (see [What is checked](#what-is-checked)). Type system extensions aren't: the request format excludes them, so none of their Type Validation rules is checked. The arguments of a directive applied in SDL aren't checked either, nor is a non-repeatable directive applied twice. Every valid sibling avoids them.
- **Default values:** September 2026 states default value compatibility for object field arguments only (§3.6). An implementation that also checks interface field arguments, input fields and directive arguments, as graphql-js 17 does, isn't marked over-strict, because no valid sibling has a bad default there.
- **Input field defaults inside a default:** when the reference checks an argument's default value, an input field the value leaves out isn't given its own default. §3.10 says the coerced default "should be used", a SHOULD. With `input I { x: Int = "a" }`, the reference finds `f(a: I = {}): Int` compatible, though following the SHOULD makes it incompatible. No vector depends on this: none has an argument default that leaves out an input field with a default.
- **Float defaults:** a Float default must be a finite double, so `1e400` is rejected. "A value outside the available precision" isn't checked.
- **Two schema definitions:** `schemaDefinitionUnique` checks that a document has at most one. Which roots a document with two definitions has isn't defined (the kit's SDL reader keeps the last), so its only invalid vector has two that name the same root.
- **Int defaults of any size coerce:** §3.5.1 says an Int input value outside 32 bits should raise a request error, a SHOULD, so the reference doesn't reject one, the weaker reading. No vector has one.
- **Introspection types:** the spec doesn't settle whether user SDL may refer to an introspection type, as in `type Query { s: __Schema }`. §3.3 counts them as built-in types and §3.4.2 makes every Object and Enum type an output type. §4's Reserved Names says "any Name within a GraphQL type system must not start with two underscores", which, read literally, forbids the reference. `TypeSystem.tla` treats such a name as an unknown type, and no vector uses one. graphql-js accepts them.
