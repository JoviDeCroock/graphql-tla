# The schema area

`graphql-tla run schema` checks schema validation: whether an implementation accepts an SDL schema exactly when the type system rules of §3, and §4's Reserved Names, allow it. The reference is [`specs/TypeSystem.tla`](../../specs/TypeSystem.tla), whose `Verdict(S)` is the set of rules a schema breaks. It covers the Type Validation rules of:

- §3.3 Schema and §3.3.1 Root Operation Types;
- §3.6 Objects, including IsValidImplementation, and §3.7 Interfaces;
- §3.8 Unions, §3.9 Enums, §3.10 Input Objects (with OneOf, and both kinds of cycle);
- §3.13 Directives, and §3.13.3's rule that a required argument or input field can't be deprecated;
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

There is one check per rule in `TypeSystem!Rules`, at the section that states it, and `acceptsValid` (§3: a schema is invalid only when it breaks a rule). Every check is a MUST. [`kit/schema/rules.mjs`](../../kit/schema/rules.mjs) lists the rules:

| Section | Checks |
| --- | --- |
| §3.3 | `typeNamesUnique`, `typeNameNotBuiltin`, `typeNameReserved`, `directiveNamesUnique`, `directiveNameReserved` |
| §3.3.1 | `queryRootProvided`, `rootTypesAreObjects`, `rootTypesDifferent` |
| §3.6, §3.7 | `fieldsDefined`, `fieldNamesUnique`, `fieldNameReserved`, `fieldOutputType`, `argNameReserved`, `argNamesUnique`, `argInputType`, `requiredArgNotDeprecated`, `argDefaultCompatible`, `implementsUnique`, `implementsInterfaces`, `implementsItself` |
| §3.6 IsValidImplementation | `implTransitive`, `implFieldProvided`, `implArgProvided`, `implArgInvariant`, `implExtraArgOptional`, `implFieldCovariant`, `implDeprecation` |
| §3.8 | `unionMembersDefined`, `unionMembersUnique`, `unionMembersObjects` |
| §3.9 | `enumValuesDefined`, `enumValuesUnique` |
| §4 | `enumValueNameReserved` |
| §3.10, §3.10.1 | `inputFieldsDefined`, `inputFieldNamesUnique`, `inputFieldNameReserved`, `inputFieldInputType`, `requiredInputFieldNotDeprecated`, `oneOfFieldNullable`, `oneOfFieldNoDefault`, `inputObjectUnbreakableCycle`, `inputObjectDefaultValueCycle` |
| §3.13 | `directiveLocationsDefined`, `directiveUsesItself`, `directiveReferencesItselfIndirectly` |
| §3 | `acceptsValid`: the valid schemas are accepted |

`directiveLocationsDefined` is always untested: SDL requires `on` and at least one location, so no document breaks it.

A failing vector counts toward one finding. Each finding has a `kind`: `not enforced`, `over-strict` (a rejected valid schema), `crash` or `malformed`.

- Accepted invalid schemas: one finding per rule, "RULE not enforced".
- Crashes on invalid schemas: one finding per rule and crash message, "RULE: crashes on a schema that breaks only this rule".
- Rejected valid schemas, and crashes on valid schemas: one finding per kind and **error message**, whatever the rule, under `acceptsValid`. The message is the first error in the answer's `errors` (or the crash's message), with the schema's own names, quoted text and numbers taken out, so that one error on two schemas groups. The finding's `hint` lists the rules the vectors' invalid siblings break, and `problem` gives the message. So a rule the spec doesn't have, such as "an interface needs an implementation", is one finding with every rule it touches in its hint, not one "over-strict" finding per rule. A finding calls its rule `likelyOverStrict` only when it has one rule in its hint, its vectors come from at least two of that rule's pairs, and another valid sibling of the rule is accepted. Otherwise which rule the implementation applied is a guess, and the message says. A rejection with no `errors` is grouped by its hint.

The run fails on any failing check, an answer without a boolean `valid`, or a failed self-test.

**Editions.** Some rules, and some syntax, are in the draft but not in the October 2021 edition:

- rules: `argNamesUnique` (October 2021's Type Validation lists for objects, interfaces and directives have no argument uniqueness rule), `requiredArgNotDeprecated` and `requiredInputFieldNotDeprecated` (deprecated arguments and input fields), `argDefaultCompatible` and `inputObjectDefaultValueCycle` (default value validation), `implDeprecation`, `oneOfFieldNullable` and `oneOfFieldNoDefault`;
- syntax: `@oneOf`, `@deprecated` on an argument or input field, and directives on a directive definition.

Their checks carry `"edition": "draft"`. A vector carries it, with the features in `editionNote`, when its own verdict or syntax differs under October 2021: an invalid schema that breaks a draft-only rule (October 2021 would accept it), or any schema that uses draft-only syntax. A valid sibling of a draft-only rule is not tagged unless it uses draft syntax itself, because dropping a rule can't make a valid schema invalid. `type Query { f(x: Int, y: Int): Int }`, the sibling of an `argNamesUnique` pair, is valid in both editions, so rejecting it is a failure under either.

A failing vector is **draft only** when it is tagged and the answer is a verdict: accepting a tagged invalid schema, or rejecting a tagged valid one. An implementation of the October 2021 edition can give that answer and still follow its edition. A **crash is never draft only**. Under October 2021 every tagged schema still has a verdict, valid (`input I { i: I = {} }` breaks no October 2021 rule) or invalid (it uses a directive or location October 2021 doesn't define), and a crash is neither, so it fails in both editions. Findings count their draft-only vectors (`draftOnly`), and mark their example `[draft]`; a finding whose every vector is draft only carries `"edition": "draft"` too. Each check gives `failingDraftOnly`, how many of its failing vectors are draft only. A draft-only rule's check whose failures include crashes says so in its note. The report's `draftOnly` gives how many graded vectors are draft only and how many failed as draft only.

**Self-test.** Every run also judges deliberately wrong answers, and requires each to be caught: every vector's verdict flipped, the next vector's answer where it differs, an answer without `valid`, and a crash on a valid and on an invalid schema, which must count as crashes even with the right `valid`. It also builds reports from answers that are right but for a few, and requires that a crash on a draft-only invalid schema isn't counted as draft only, that rejecting (or crashing on) one valid schema fails `acceptsValid` and not its pair's rule and names no rule as likely over-strict, and that one message on valid siblings of two rules is one finding. That makes 343 negative controls. The expected answers themselves must all pass. The checker also fails if an `unspecified` vector is graded.

## Vectors

[`kit/schema/vectors.json`](../../kit/schema/vectors.json) holds 172 vectors: 87 pairs, in which two invalid schemas have two valid siblings each, so 85 invalid and 87 valid schemas. 168 are graded; 4 are `unspecified`. [`scripts/generate-vectors-schema.mjs`](../../scripts/generate-vectors-schema.mjs) writes it from the pairs it lists, after evaluating `TypeSystem!Verdict` on each schema with tla-ts. It fails unless every invalid schema breaks exactly its rule and every sibling breaks none, so a pair can't quietly test something else. `--check` regenerates the file and fails if it differs. graphql-js only parses the SDL.

Each vector has:
- **`rule`:** the rule its pair is about;
- **`verdict`:** the reference's `Verdict`, `[rule]` or `[]`;
- **`expected`:** `{ "valid": verdict = [] }`;
- **`pair`:** its sibling's id. A valid sibling names its invalid schema;
- **`siblings`:** on an invalid schema with more than one valid sibling, all of them. `inputObjectUnbreakableCycle.1.invalid` (§3.10's `self: Example!`) has a nullable and a list sibling, and `requiredArgNotDeprecated.1.invalid` a nullable one and one with a default. The generator keeps an invalid schema listed in two pairs once, so it isn't graded twice;
- **`edition`** and **`editionNote`:** `"draft"` and the draft-only features, for a vector whose own verdict or syntax differs under the October 2021 edition (36 vectors: 25 invalid, 11 valid);
- **`unspecified`:** why the spec doesn't settle the vector's verdict. These vectors aren't sent to the adapter or graded (4 vectors, below);
- **`origin`:** for the 16 pairs taken from the spec's own examples, counter-examples and coercion rules, where they come from. They're the ones `specs/TypeSystemVectors.tla` also checks, such as §3.10's circular input objects, §3.7's `Image` that must also implement `Node`, and §3.13's `@invalidExample`.

The schemas come from [`scripts/differential-type-system.mjs`](../../scripts/differential-type-system.mjs): its hand-written cases and its scenario families, which are the vectors' `family`:

| Family | Vectors | What it is |
| --- | --- | --- |
| `names` | 26 | duplicate names, names starting with `__`, types named like built-ins |
| `root` | 14 | root operation types, with and without a schema definition |
| `typeUse` | 21 | output and input types in the wrong place, empty types, deprecated required arguments |
| `defaults` | 20 | default values that don't coerce, including §3.10's and §3.10.1's coercion tables, and a Float out of a double's range |
| `implementation` | 32 | IsValidImplementation, step by step |
| `union` | 10 | union members |
| `enum` | 6 | enum values |
| `input` | 31 | input fields, OneOf, cycles of Non-Null fields and of default values |
| `directive` | 12 | directives that reference themselves |

Some rules have a second pair that only steers around a restriction an implementation adds, so that the invalid schema can't be rejected for that other reason: `implementsItself.2` gives the interface an implementing object type (Hot Chocolate rejects an interface nothing implements), and `directiveUsesItself.2` and `directiveReferencesItselfIndirectly.4` allow their directives on `INPUT_FIELD_DEFINITION` too (graphql-ruby checks a directive's arguments as input fields). The first pairs stay as they are.

**Where the formal rule and the prose disagree.** §3.13 rule 3 says "A Directive definition must not contain the use of a Directive which references itself indirectly by referencing a Type or Directive which transitively includes a reference to this Directive." It speaks only of the directives a definition uses. The prose above it is broader: "While defining a directive, it must not reference itself directly or indirectly". `TypeSystem.tla` follows the prose, and also follows the directive's own argument types. Two invalid schemas depend on that reading, since their directive definition uses no directive at all and reaches itself only through its argument's type. They are `unspecified` and aren't graded:

| Vector | Schema |
| --- | --- |
| `directiveReferencesItselfIndirectly.1.invalid` | `directive @d(a: In) on INPUT_FIELD_DEFINITION input In { f: Int @d } type Query { a(x: In): Int }` |
| `directiveReferencesItselfIndirectly.3.invalid` | `directive @d(c: Color) on ENUM_VALUE enum Color { RED @d BLUE } type Query { a: Color }` |

Their valid siblings are valid under either reading, and are graded. So is `directiveReferencesItselfIndirectly.2.invalid`, where `@d` uses `@e` and `@e` uses `@d`, which breaks the formal rule too.

**A type named Mutation that isn't an object type.** `rootTypesAreObjects.2.invalid` is `type Query { a: Int } interface Mutation { a: Int }`, with no schema definition. `TypeSystem.tla` takes `Mutation` as the mutation root, an interface, so the schema breaks "If it is provided, it must be an Object type" (§3.3.1). No normative sentence says so. The draft's §3.3.1 says "The type system definition language can omit the schema definition when each _root operation type_ uses its respective _default root type name_, no other type uses any _default root type name_, and the schema does not have a description", a condition on writing SDL that doesn't say what a reader makes of a document that omits the definition anyway. The reading rests on an example: "The schema definition must be included, otherwise the {"Mutation"} type would be incorrectly presumed to be the {`mutation`} _root operation type_ of the schema." October 2021 has neither the "no other type" clause nor that example, and its text allows reading the schema as one without a mutation root, which is valid. The vector is `unspecified`:

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
- **`argDefaultCompatible`:** accepts `type Query { f(x: Float = 1e400): Int }`, a Float default that no finite double represents (§3.5.2).

16 also:
- **`argDefaultCompatible`:** doesn't validate default values (10 schemas);
- **`rootTypesDifferent`:** accepts the same type for two root operations;
- **`implDeprecation`:** accepts a deprecated field implementing one that isn't;
- **`inputObjectUnbreakableCycle`:** ignores OneOf input objects, so it misses `input A @oneOf { b: B } input B @oneOf { a: A }`;
- **crashes:** overflows the stack (`RangeError: Maximum call stack size exceeded`) on an input field whose default is an object literal of an input type still being built, with a default value cycle or without. That fails `inputObjectDefaultValueCycle` on its 4 invalid schemas, such as `input I { i: I = {} }`, and `acceptsValid` on 3 valid ones, such as `input I { i: I = {i: null} }`, which break no rule in either edition. The crashes are not draft only: October 2021 has no default value rule, so it calls all 7 schemas valid.

Of the 45 checks with vectors, 17 passes 41 and 16 passes 36.

## Limits

- **Pairs, not coverage:** each rule is exercised by a handful of hand-picked pairs. The differential runs hundreds of generated schemas against graphql-js; the kit doesn't, so an implementation can pass here and still get a rarer schema wrong.
- **The reference's rules only:** the SDL rules outside §3's Type Validation, such as unknown types or a directive applied at a location it doesn't allow, aren't checked. Every valid sibling avoids them.
- **Default values:** the draft states default value compatibility for object field arguments only (§3.6). An implementation that also checks interface field arguments, input fields and directive arguments, as graphql-js 17 does, isn't marked over-strict, because no valid sibling has a bad default there.
- **Input field defaults inside a default:** when the reference checks an argument's default value, an input field the value leaves out isn't given its own default. §3.10 says the coerced default "should be used", a SHOULD. With `input I { x: Int = "a" }`, the reference finds `f(a: I = {}): Int` compatible, though following the SHOULD makes it incompatible. No vector depends on this: none has an argument default that leaves out an input field with a default.
- **Float defaults:** a Float default must be a finite double, so `1e400` is rejected. "A value outside the available precision" isn't checked.
- **One schema definition:** §3.3 says "a document must include at most one `schema` definition". The reference reads only one, and the kit's SDL reader keeps the last, so this sentence isn't checked and no vector has two.
- **Introspection types:** the spec doesn't settle whether user SDL may refer to an introspection type, as in `type Query { s: __Schema }`. §3.3 counts them as built-in types and §3.4.2 makes every Object and Enum type an output type. §4's Reserved Names says "any Name within a GraphQL type system must not start with two underscores", which, read literally, forbids the reference. `TypeSystem.tla` treats such a name as an unknown type, and no vector uses one. graphql-js accepts them.
