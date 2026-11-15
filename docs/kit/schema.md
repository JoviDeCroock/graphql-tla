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

**Crashes.** If the implementation crashes on a schema, say with a stack overflow or a null dereference, rather than rejecting it, answer `{"type":"error","id":12,"message":"…"}`. Unlike in other areas, the run goes on: the kit reports the vector as a crash. Only the message's first line reaches the report, so a stack trace's paths stay out of it.

The kit can only tell a crash from a rejection by this. A `valid: false` is a rejection, whatever made it, so an adapter that turns every exception into `valid: false` hides its crashes: they pass on invalid schemas and look over-strict on valid ones. Report as a crash any failure that isn't the implementation saying the schema is invalid. A silent adapter still stops the run.

The area needs SDL input. A code-first framework that can't build a schema from SDL can't take part. It just doesn't claim the `schema` capability.

## What is checked

The vectors come in minimal pairs. Each pair is an invalid schema that breaks exactly one rule, by the reference, and a valid sibling one small edit away:

```graphql
interface I { f: Int } type Query implements I { f(b: Int!): Int }      # breaks IMPL_EXTRA_ARG_OPTIONAL
interface I { f: Int } type Query implements I { f(b: Int! = 1): Int }  # valid
```

That gives a verdict per rule without asking which rule the implementation applied:

- the rule is **not enforced** when the implementation accepts an invalid schema;
- it is **over-strict** when it rejects the valid sibling;
- the implementation **crashes** on a schema, valid or not, when the adapter answers it with an `error`.

There is one check per rule in `TypeSystem!Rules`, at the section that states it. Every rule is a MUST. [`kit/schema/rules.mjs`](../../kit/schema/rules.mjs) lists them:

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

`directiveLocationsDefined` is always untested: SDL requires `on` and at least one location, so no document breaks it.

A failing vector counts toward one finding: "RULE not enforced", "RULE over-strict", or "RULE: crashes" on a valid or on an invalid schema. Each finding has a `kind`: `not enforced`, `over-strict`, `crash` or `malformed`. A crash fails its rule's check, whether the schema is valid or not, since the implementation gave no verdict. The run fails on any failing check, an answer without a boolean `valid`, or a failed self-test.

**Editions.** Some rules, and some syntax, are in the draft but not in the October 2021 edition:

- rules: `requiredArgNotDeprecated` and `requiredInputFieldNotDeprecated` (deprecated arguments and input fields), `argDefaultCompatible` and `inputObjectDefaultValueCycle` (default value validation), `implDeprecation`, `oneOfFieldNullable` and `oneOfFieldNoDefault`;
- syntax: `@oneOf`, `@deprecated` on an argument or input field, and directives on a directive definition.

Their checks carry `"edition": "draft"`, and so do vectors that use one, with the features in `editionNote`, as in the validate area. Findings count their draft-only vectors (`draftOnly`), and mark their example `[draft]`. A finding with nothing else carries `"edition": "draft"` too. The report's `draftOnly` gives how many vectors are draft only and how many of those failed. They are graded like any other vector, but an implementation of the October 2021 edition can fail them and still follow its edition.

**Self-test.** Every run also judges deliberately wrong answers, and requires each to be caught: every vector's verdict flipped, the next vector's answer where it differs, an answer without `valid`, and a crash on a valid and on an invalid schema, which must count as crashes even with the right `valid`. That makes 335 negative controls. The expected answers themselves must all pass.

## Vectors

[`kit/schema/vectors.json`](../../kit/schema/vectors.json) holds 166 vectors, 83 pairs. [`scripts/generate-vectors-schema.mjs`](../../scripts/generate-vectors-schema.mjs) writes it from the pairs it lists, after evaluating `TypeSystem!Verdict` on each schema with tla-ts. It fails unless every invalid schema breaks exactly its rule and every sibling breaks none, so a pair can't quietly test something else. `--check` regenerates the file and fails if it differs. graphql-js only parses the SDL.

Each vector has:
- **`rule`:** the rule its pair is about;
- **`verdict`:** the reference's `Verdict`, `[rule]` or `[]`;
- **`expected`:** `{ "valid": verdict = [] }`;
- **`pair`:** its sibling's id;
- **`edition`** and **`editionNote`:** `"draft"` and the draft-only features, for a vector whose rule or syntax the October 2021 edition doesn't have (46 vectors);
- **`origin`:** for the 15 pairs taken from the spec's own examples and counter-examples, where they come from. They're the ones `specs/TypeSystemVectors.tla` also checks, such as §3.10's circular input objects, §3.7's `Image` that must also implement `Node`, and §3.13's `@invalidExample`.

The schemas come from [`scripts/differential-type-system.mjs`](../../scripts/differential-type-system.mjs): its hand-written cases and its scenario families, which are the vectors' `family`:

| Family | Vectors | What it is |
| --- | --- | --- |
| `names` | 26 | duplicate names, names starting with `__`, types named like built-ins |
| `root` | 14 | root operation types, with and without a schema definition |
| `typeUse` | 22 | output and input types in the wrong place, empty types, deprecated required arguments |
| `defaults` | 18 | default values that don't coerce, including §3.10's and §3.10.1's coercion tables |
| `implementation` | 30 | IsValidImplementation, step by step |
| `union` | 10 | union members |
| `enum` | 6 | enum values |
| `input` | 32 | input fields, OneOf, cycles of Non-Null fields and of default values |
| `directive` | 8 | directives that reference themselves |

## graphql-js

[`adapters/graphql-js/areas/schema.mjs`](../../adapters/graphql-js/areas/schema.mjs) runs `buildSchema`, which applies the SDL rules, then `validateSchema`. A `GraphQLError`, or the plain `Error` `buildSchema` throws with the SDL rules' messages, is a rejection. Any other exception propagates, and the adapter answers with an `error`: a crash. The findings are the deviations `differential-type-system.mjs` documents in `VALIDATION_DEVIATIONS`. They aren't encoded as expected answers.

Both versions:
- **`typeNameNotBuiltin`:** accept `scalar String` and `type Int { … }`;
- **`directiveUsesItself`:** accept §3.13's `@invalidExample`;
- **`directiveReferencesItselfIndirectly`:** accept a directive that reaches itself through an input object, an enum or another directive.

16 also:
- **`argDefaultCompatible`:** doesn't validate default values (9 schemas);
- **`rootTypesDifferent`:** accepts the same type for two root operations;
- **`implDeprecation`:** accepts a deprecated field implementing one that isn't;
- **`inputObjectUnbreakableCycle`:** ignores OneOf input objects, so it misses `input A @oneOf { b: B } input B @oneOf { a: A }`;
- **`inputObjectDefaultValueCycle`, crashes:** overflows the stack (`RangeError: Maximum call stack size exceeded`) on input object defaults that mention each other's types, with a cycle or without: 4 invalid schemas, such as `input I { i: I = {} }`, and 3 valid ones, such as `input I { i: I = {i: null} }`.

17 passes the other 41 tested rules, 16 the other 36.

## Limits

- **Pairs, not coverage:** each rule is exercised by a handful of hand-picked pairs. The differential runs hundreds of generated schemas against graphql-js; the kit doesn't, so an implementation can pass here and still get a rarer schema wrong.
- **The reference's rules only:** the SDL rules outside §3's Type Validation, such as unknown types or a directive applied at a location it doesn't allow, aren't checked. Every valid sibling avoids them.
- **Default values:** the draft states default value compatibility for object field arguments only (§3.6). An implementation that also checks interface field arguments, input fields and directive arguments, as graphql-js 17 does, isn't marked over-strict, because no valid sibling has a bad default there.
