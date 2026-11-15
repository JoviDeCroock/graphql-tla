# The introspect area

`graphql-tla run introspect` checks schema introspection: what an implementation answers to the standard introspection query for an SDL schema. The reference is [`specs/Introspection.tla`](../../specs/Introspection.tla). `SchemaResult` is the `__schema` a service must return, and `Matches` says whether a service's result is one the spec allows. It covers:

- §4.1 `__typename`;
- §4.2 Schema Introspection: `__Schema`, `__Type` for each kind, `__Field`, `__InputValue`, `__EnumValue` and `__Directive`, as in the draft, including `isOneOf`, `specifiedByURL` and deprecated arguments, input fields and directives;
- §3.5's rule on which built-in scalars appear, and §3.13's built-in directives.

```shell
npx graphql-tla run introspect --adapter "node adapters/graphql-js/adapter.mjs --graphql 17" --strict --report introspect.json
```

The area follows [the contract for areas beyond execution](../kit-areas.md).

## Request

```json
{"type":"introspect","id":12,"sdl":"type Query { a: Int }","query":"query IntrospectionQuery { __typename __schema { … } } …"}
```

- **`sdl`:** a valid type system document, with no extensions.
- **`query`:** the kit's fixed introspection query, in [`kit/introspect/query.mjs`](../../kit/introspect/query.mjs). It is the usual full query (graphql-js's `getIntrospectionQuery` with every option on), with every field of the draft's introspection types, plus `__typename` at the root. Each schema is asked twice: once with `includeDeprecated: true` on every list, once without the argument.

Build the schema from the SDL, with no resolvers needed, and execute the query against it.

## Result

```json
{"type":"result","id":12,"response":{"data":{"__typename":"Query","__schema":{…}}}}
```

- **`response`:** the execution result, as JSON. If the schema doesn't build or the query is rejected, answer with a response that has `errors`. That is an answer, and fails the `executes` check. It isn't an adapter error.

The area needs SDL input. A code-first framework that can't build a schema from SDL can't take part. It just doesn't claim the `introspect` capability.

## What is checked

For each response, tla-ts evaluates `Introspection!Matches` and [`kit/introspect/IntrospectChecks.tla`](../../kit/introspect/IntrospectChecks.tla)'s `Problems`. `Problems` compares with the reference's own operators, item by item, and names the aspect of each difference. `Matches` stays the verdict: the kit stops with an error if `Problems` finds a difference `Matches` doesn't, and counts a mismatch `Problems` can't name against `other`.

The comparison allows what the spec allows:

- **`types`** is a set: any order.
- **`possibleTypes`** of an interface and a directive's **`locations`** have no source order: any order.
- **`defaultValue`** is re-parsed, and two encodings match when they coerce to the same value for the input value's type: `1` and `[1]` for `[Int]`, `1` and `1.0` for `Float`.
- **Descriptions** of built-in types, fields and directives may be anything: the spec gives none.
- **Other directives:** "GraphQL services and tools may also provide any additional custom directive". A directive the service returns that is neither in the document nor one of §3.13's is accepted as the service describes it. The types its arguments reference count as referenced, for §3.5's rule.
- **Built-in directives:** a service "should provide" `@skip`, `@include`, `@specifiedBy` and `@oneOf`, and "must provide" `@deprecated` "if representing deprecated portions of the schema". A missing one fails `builtinDirectives`, a SHOULD, or `deprecation` for a missing `@deprecated` when the schema deprecates something. Each built-in it does return must be as §3.13 defines it.
- **Order** ("Stable Ordering", §4) is a SHOULD. A list with the right items in another order fails `order` only.

What the spec doesn't allow:

- **Built-in scalars:** "all referenced built-in scalars must be included", and an unreferenced one "must not be included". The introspection types reference `String` and `Boolean`, so those two always appear.
- **Introspection types:** `types` includes the eight introspection types, since "any named type which can be found through a field of any introspection type must be included". Their fields, arguments and enum values must be as §4.2 defines them.

| Check | Section | Level | What it covers |
| --- | --- | --- | --- |
| `executes` | §4.2 | MUST | The query executes without errors, and the result has every field it selects |
| `roots` | §4.2.1, §3.3.1 | MUST | `queryType`, `mutationType` and `subscriptionType` |
| `types` | §4.2.1 | MUST | `types` is the set of all named types, each once |
| `builtinScalars` | §3.5, §4.2.1 | MUST | The built-in scalars the schema references, and no others |
| `typeKinds` | §4.2.2 | MUST | Each type's kind, and which `__Type` fields are null for that kind |
| `fields` | §4.2.2, §4.2.3 | MUST | Fields of objects and interfaces, with their types |
| `arguments` | §4.2.3, §4.2.4, §4.2.6 | MUST | Arguments of fields and directives, with their types |
| `defaultValue` | §4.2.4 | MUST | Default values, and null without one |
| `inputFields` | §4.2.2, §4.2.4 | MUST | Input fields, with their types |
| `enumValues` | §4.2.2, §4.2.5 | MUST | Enum values |
| `interfaces` | §4.2.2 | MUST | `interfaces`, and `possibleTypes` of unions and interfaces |
| `deprecation` | §4.2.3 to §4.2.6, §3.13.3 | MUST | `isDeprecated`, `deprecationReason`, `includeDeprecated` on every list, and `@deprecated` |
| `specifiedByURL` | §4.2.2, §3.13.4 | MUST | A custom scalar's `@specifiedBy` URL, otherwise null |
| `isOneOf` | §4.2.2, §3.10.1 | MUST | True for OneOf input objects, false for other input objects, null otherwise |
| `descriptions` | §3.2, §4.2 | MUST | Descriptions from the document, including the schema's |
| `directives` | §4.2.1, §4.2.6 | MUST | The document's directives: names, locations, `isRepeatable` |
| `builtinDirectives` | §3.13.1, §3.13.2, §3.13.4, §3.13.5 | SHOULD | `@skip`, `@include`, `@specifiedBy` and `@oneOf` are provided |
| `builtinDefinitions` | §4.2, §3.13 | MUST | The introspection types and built-in directives are as the spec defines them |
| `typename` | §4.1 | MUST | The root's `__typename` names the query root type, and no `fields` list includes `__typename` |
| `order` | §4.2 | SHOULD | Fields, arguments, input fields, enum values, the document's directives, union members and interfaces in source order |
| `other` | §4.2 | MUST | A mismatch `Problems` can't name |

Every result that executes exercises every check but `executes`. A result counts toward one finding: the set of problems it has. Problems with the document's types are grouped by aspect, problems with built-ins by the exact field or argument. The run fails on any failing MUST check, a failing SHOULD check with `--strict`, an answer without `response`, or a failed self-test.

**Self-test** ([`kit/introspect/controls.mjs`](../../kit/introspect/controls.mjs)). Every run also evaluates responses built from the reference's expected ones:
- each vector's expected response, which must pass;
- the next vector's expected response, where it differs, which must fail;
- 32 responses broken on purpose, each of which must fail the check it targets, such as a response with errors (`executes`), a dropped enum value (`enumValues`), a changed default (`defaultValue`), `__typename` listed as a field (`typename`), an unreferenced `Float` (`builtinScalars`) or reordered fields (`order`);
- 4 changes the spec allows, which must pass: an extra directive of the service's own, other encodings of default values, types in another order, and an interface's possible types in another order.

## Vectors

[`kit/introspect/vectors.json`](../../kit/introspect/vectors.json) holds 22 vectors: 11 schemas, each with and without `includeDeprecated: true`. [`scripts/generate-vectors-introspect.mjs`](../../scripts/generate-vectors-introspect.mjs) writes it. It checks each schema valid by `TypeSystem!Verdict`, with every default value coercible, then evaluates `Introspection!SchemaResult` with the spec's built-ins and the query root's name with tla-ts. `--check` regenerates the file and fails if it differs. graphql-js only parses the SDL.

Each vector's `expected.response` is the response the reference expects, without the built-ins, which every schema shares and the file holds once in `builtins`. Descriptions the spec leaves open are null there. The kit doesn't compare responses with it directly: it evaluates `Matches`, as above. The expected responses are what the self-test starts from and what findings show.

| Family | What it exercises |
| --- | --- |
| `minimal` | `type Query { a: Int }` |
| `rich` | a schema description, a mutation root, a union, a deprecated enum value, input objects with defaults, OneOf, `@specifiedBy`, a repeatable directive with a deprecated argument |
| `interfaces` | interfaces implementing interfaces, `possibleTypes`, deep wrapping types |
| `defaults` | default values for lists, floats, IDs, input objects, strings with escapes, null and enums |
| `deprecation` | deprecated fields, arguments, input fields and enum values, with and without reasons, and an object whose only field is deprecated |
| `directiveDeprecation` | a deprecated directive: draft SDL syntax |
| `roots` | a schema definition with a subscription root, and a type named `Mutation` that isn't a root |
| `builtinScalars` | `Float` referenced by a directive argument only, `ID` by an input field only |
| `scalars` | custom scalars with and without `@specifiedBy` |
| `oneOf` | OneOf and plain input objects |
| `order` | fields, arguments, enum values, union members and interfaces out of alphabetical order |

## graphql-js

[`adapters/graphql-js/areas/introspect.mjs`](../../adapters/graphql-js/areas/introspect.mjs) runs `buildSchema`, then `graphqlSync` with the query. Every result fails `builtinDefinitions`, on the deviations `differential-type-system.mjs` documents in `INTROSPECTION_DEVIATIONS`. They aren't encoded as expected answers. Every other check passes.

- **17:** `__DirectiveLocation` has `FRAGMENT_VARIABLE_DEFINITION`, for fragment arguments, which the draft doesn't.
- **16:**
  - `@deprecated(reason: String = …)`, where the draft has `String!`;
  - `includeDeprecated: Boolean = false` on `__Type.fields`, `enumValues` and `inputFields`, and on `__Field.args` and `__Directive.args`, where the draft has `Boolean!`;
  - `directiveDeprecation` fails `executes`: 16 can't parse `directive @old @deprecated on FIELD`.

## Limits

- **`__type(name:)`** isn't asked: `Introspection.tla` doesn't model it.
- **Built-ins compared whole:** the comparison assumes the spec's introspection types exactly. A service that adds a field or enum value to one fails `builtinDefinitions`, as graphql-js 17 does.
- **A failing query hides the rest:** the query selects every draft field. An implementation without, say, `__Directive.isDeprecated` rejects the whole query, and only `executes` is graded.
- **No extensions:** the schemas have no `extend` definitions, since `TypeSystem.tla`'s data comes from definitions.
