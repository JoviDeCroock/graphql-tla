# The schema area

`graphql-tla run schema` checks schema validation: whether an implementation accepts an SDL schema exactly when the type system rules of §3 allow it. The reference is [`specs/TypeSystem.tla`](../../specs/TypeSystem.tla), whose `Verdict(S)` is the set of rules a schema breaks. It covers the Type Validation rules of:

- §3.3 Schema and §3.3.1 Root Operation Types;
- §3.6 Objects, including IsValidImplementation, and §3.7 Interfaces;
- §3.8 Unions, §3.9 Enums, §3.10 Input Objects (with OneOf, and both kinds of cycle);
- §3.13 Directives, and §3.13.3's rule that a required argument or input field can't be deprecated.

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

- **`valid`:** whether the implementation accepts the schema. A schema that fails to build counts as rejected, whatever the reason, including an unexpected exception. Rejecting is an answer, not an adapter error.

Any other fields, such as `errors` with the implementation's messages, are ignored, but they appear in the report's examples.

The area needs SDL input. A code-first framework that can't build a schema from SDL can't take part. It just doesn't claim the `schema` capability.

## What is checked

The vectors come in minimal pairs. Each pair is an invalid schema that breaks exactly one rule, by the reference, and a valid sibling one small edit away:

```graphql
interface I { f: Int } type Query implements I { f(b: Int!): Int }      # breaks IMPL_EXTRA_ARG_OPTIONAL
interface I { f: Int } type Query implements I { f(b: Int! = 1): Int }  # valid
```

That gives a verdict per rule without asking which rule the implementation applied:

- the rule is **not enforced** when the implementation accepts an invalid schema;
- it is **over-strict** when it rejects the valid sibling.

There is one check per rule in `TypeSystem!Rules`, at the §3 section that states it. Every rule is a MUST. [`kit/schema/rules.mjs`](../../kit/schema/rules.mjs) lists them:

| Section | Checks |
| --- | --- |
| §3.3 | `typeNamesUnique`, `typeNameNotBuiltin`, `typeNameReserved`, `directiveNamesUnique`, `directiveNameReserved` |
| §3.3.1 | `queryRootProvided`, `rootTypesAreObjects`, `rootTypesDifferent` |
| §3.6, §3.7 | `fieldsDefined`, `fieldNamesUnique`, `fieldNameReserved`, `fieldOutputType`, `argNameReserved`, `argNamesUnique`, `argInputType`, `requiredArgNotDeprecated`, `argDefaultCompatible`, `implementsUnique`, `implementsInterfaces`, `implementsItself` |
| §3.6 IsValidImplementation | `implTransitive`, `implFieldProvided`, `implArgProvided`, `implArgInvariant`, `implExtraArgOptional`, `implFieldCovariant`, `implDeprecation` |
| §3.8 | `unionMembersDefined`, `unionMembersUnique`, `unionMembersObjects` |
| §3.9 | `enumValuesDefined`, `enumValuesUnique`, `enumValueNameReserved` |
| §3.10, §3.10.1 | `inputFieldsDefined`, `inputFieldNamesUnique`, `inputFieldNameReserved`, `inputFieldInputType`, `requiredInputFieldNotDeprecated`, `oneOfFieldNullable`, `oneOfFieldNoDefault`, `inputObjectUnbreakableCycle`, `inputObjectDefaultValueCycle` |
| §3.13 | `directiveLocationsDefined`, `directiveUsesItself`, `directiveReferencesItselfIndirectly` |

`directiveLocationsDefined` is always untested: SDL requires `on` and at least one location, so no document breaks it.

A failing vector counts toward one finding: "RULE not enforced" or "RULE over-strict". The run fails on any failing check, an answer without a boolean `valid`, or a failed self-test.

**Self-test.** Every run also judges deliberately wrong answers, and requires each to be caught: every vector's verdict flipped, the next vector's answer where it differs, and an answer without `valid`. The expected answers themselves must all pass.

## Vectors

[`kit/schema/vectors.json`](../../kit/schema/vectors.json) holds 166 vectors, 83 pairs. [`scripts/generate-vectors-schema.mjs`](../../scripts/generate-vectors-schema.mjs) writes it from the pairs it lists, after evaluating `TypeSystem!Verdict` on each schema with tla-ts. It fails unless every invalid schema breaks exactly its rule and every sibling breaks none, so a pair can't quietly test something else. `--check` regenerates the file and fails if it differs. graphql-js only parses the SDL.

Each vector has:
- **`rule`:** the rule its pair is about;
- **`verdict`:** the reference's `Verdict`, `[rule]` or `[]`;
- **`expected`:** `{ "valid": verdict = [] }`;
- **`pair`:** its sibling's id;
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

[`adapters/graphql-js/areas/schema.mjs`](../../adapters/graphql-js/areas/schema.mjs) runs `buildSchema`, which applies the SDL rules, then `validateSchema`. The findings are the deviations `differential-type-system.mjs` documents in `VALIDATION_DEVIATIONS`. They aren't encoded as expected answers.

Both versions:
- **`typeNameNotBuiltin`:** accept `scalar String` and `type Int { … }`;
- **`directiveUsesItself`:** accept §3.13's `@invalidExample`;
- **`directiveReferencesItselfIndirectly`:** accept a directive that reaches itself through an input object, an enum or another directive.

16 also:
- **`argDefaultCompatible`:** doesn't validate default values (9 schemas);
- **`rootTypesDifferent`:** accepts the same type for two root operations;
- **`implDeprecation`:** accepts a deprecated field implementing one that isn't;
- **`inputObjectUnbreakableCycle`:** ignores OneOf input objects, so it misses `input A @oneOf { b: B } input B @oneOf { a: A }`;
- **`inputObjectDefaultValueCycle`, over-strict:** overflows the stack (`Maximum call stack size exceeded`) on input object defaults that mention each other's types, even without a cycle: `input I { i: I = {i: null} }`.

17 passes the other 41 tested rules, 16 the other 36.

## Limits

- **Pairs, not coverage:** each rule is exercised by a handful of hand-picked pairs. The differential runs hundreds of generated schemas against graphql-js; the kit doesn't, so an implementation can pass here and still get a rarer schema wrong.
- **The reference's rules only:** the SDL rules outside §3's Type Validation, such as unknown types or a directive applied at a location it doesn't allow, aren't checked. Every valid sibling avoids them.
- **Default values:** the draft states default value compatibility for object field arguments only (§3.6). An implementation that also checks interface field arguments, input fields and directive arguments, as graphql-js 17 does, isn't marked over-strict, because no valid sibling has a bad default there.
