# The introspect area

`graphql-tla run introspect` checks schema introspection: what an implementation answers to the standard introspection query, and to `__type(name:)`, for an SDL schema. The reference is [`specs/Introspection.tla`](../../specs/Introspection.tla). `SchemaResult` is the `__schema` a service must return, and `Matches` says whether a service's result is one the spec allows. `TypeByName` is the answer to `__type(name:)`, and `TypeByNameMatches` judges one. It covers:

- §4.1 `__typename`;
- §4.2 Schema Introspection: `__schema` and `__type(name:)`, and `__Schema`, `__Type` for each kind, `__Field`, `__InputValue`, `__EnumValue` and `__Directive`, as in the draft, including `isOneOf`, `specifiedByURL` and deprecated arguments, input fields and directives;
- §3.5's rule on which built-in scalars appear, and when §3.13 says a service must or should provide each built-in directive;
- the response envelope of §7.1.1, §7.1.7 and §7.1.8.

```shell
npx graphql-tla run introspect --adapter "node adapters/graphql-js/adapter.mjs --graphql 17" --strict --report introspect.json
```

The area follows [the contract for areas beyond execution](../kit-areas.md).

## Request

```json
{"type":"introspect","id":12,"sdl":"type Query { a: Int }","query":"query IntrospectionQuery { __typename __schema { … } } …"}
```

- **`sdl`:** a valid type system document, with no extensions.
- **`query`:** one of the kit's queries, in [`kit/introspect/query.mjs`](../../kit/introspect/query.mjs). The introspection query is the usual full query (graphql-js's `getIntrospectionQuery` with every option on), with every field of the draft's introspection types, plus `__typename` at the root. Each schema is asked it twice: once with `includeDeprecated: true` on every list, once without the argument. A lookup query asks `__type(name:)` for a few names, each under an alias (`t0: __type(name: "Query") { ...FullType }`), with the same `FullType` fragment.

Build the schema from the SDL, with no resolvers needed, and execute the query against it.

## Result

```json
{"type":"result","id":12,"response":{"data":{"__typename":"Query","__schema":{…}}}}
```

- **`response`:** the execution result, as JSON, exactly as the implementation would send it. If the schema doesn't build or the query is rejected, answer with a response that has `errors`. That is an answer, and fails the `executes` check. It isn't an adapter error.

The area needs SDL input. A code-first framework that can't build a schema from SDL can't take part. It just doesn't claim the `introspect` capability.

## What is checked

First the kit checks the response's shape, in JS ([`kit/introspect/data.mjs`](../../kit/introspect/data.mjs)):

- **The envelope** (§7.1.1, §7.1.7, §7.1.8): the response is a map with `data`, or with `errors` and no data. `errors`, when present, is a non-empty list of maps with a `message`: `errors: []` and `errors: "not a list"` fail `envelope`. `extensions`, when present, is a map. No other entries. A bad envelope fails `envelope` only: the data is still graded.
- **The selected fields:** the data has exactly the fields the query selects, at every level, with an explicit `null` where a value is null. A missing field, such as an `ofType` the `TypeRef` fragment selects, or one the query doesn't select, fails `executes`, and nothing else is graded.

Then tla-ts evaluates `Introspection!Matches` (`TypeByNameMatches` for a lookup) and [`kit/introspect/IntrospectChecks.tla`](../../kit/introspect/IntrospectChecks.tla)'s `Problems`. `Problems` compares with the reference's own operators, item by item, and names the aspect of each difference. `Matches` stays the verdict: the kit stops with an error if `Problems` finds a difference `Matches` doesn't, and counts a mismatch `Problems` can't name against `other`.

The comparison allows what the spec allows:

- **`types`** is a set: any order.
- **`possibleTypes`** of an interface and a directive's **`locations`** have no source order: any order.
- **Built-in lists** have no source order either. The fields of `__Type`, the values of `__TypeKind`, and every other list of a built-in type or directive are compared by name, each once. The appendix's order isn't normative. Order is graded only where the document gives one.
- **`defaultValue`** is re-parsed, and two encodings match when they coerce to the same value for the input value's type: `1` and `[1]` for `[Int]`, `1` and `1.0` for `Float`.
- **Descriptions** of built-in types, fields and directives may be anything: the spec gives none.
- **Built-in directives** (§3.13): `Matches` compares the result with `SchemaResult` for the built-in directives the service returned. Each one it returns must be as §3.13 defines it. Which ones it must return depends on the schema, since every schema here comes from SDL:
  - `@deprecated` is a MUST "if representing deprecated portions of the schema": a schema that deprecates a field, argument, input field, enum value or directive. A missing `@deprecated` there fails `deprecation`. Elsewhere it may be left out.
  - `@skip` and `@include` are a SHOULD, for every schema.
  - `@specifiedBy` is a SHOULD "if representing custom scalar definitions": a schema with a custom scalar.
  - `@oneOf` is a SHOULD "if representing OneOf Input Objects": a schema with one. It is draft only: the October 2021 edition has no OneOf input objects. A finding about it says "(draft only)", and carries `"edition": "draft"` and a `draftOnly` count.

  A missing SHOULD fails `builtinDirectives`. The reference states these conditions as `RequiredDirectiveNames` and `RecommendedDirectiveNames`.
- **Other directives:** "GraphQL services and client tooling may provide any additional custom directive". A directive the service returns that is neither in the document nor one of §3.13's is accepted as the service describes it. So are the types its arguments reach, through input fields too, that the document doesn't define: they count as the schema's types, and as referencing the built-in scalars they use, for §3.5's rule. They must be input types, or the result fails `directives`. A type nothing in the schema reaches still fails `types`.
- **Order** ("Stable Ordering", §4) is a SHOULD. A list with the right items in another order fails `order` only.

What the spec doesn't allow:

- **Built-in scalars:** "all referenced built-in scalars must be included", and an unreferenced one "must not be included". The introspection types reference `String` and `Boolean`, so those two always appear.
- **Introspection types:** `types` includes the eight introspection types, since "any named type which can be found through a field of any introspection type must be included". Their fields, arguments and enum values must be as §4.2 defines them.
- **`__type(name:)`:** the named type's entry in `types`, as `SchemaResult` has it, and `null` for a name the schema doesn't have: an unknown name, or a built-in scalar nothing references.

| Check | Section | Level | What it covers |
| --- | --- | --- | --- |
| `envelope` | §7.1.1, §7.1.7, §7.1.8 | MUST | `data`, `errors` only as a non-empty list, `extensions` a map, no other entries |
| `executes` | §4.2 | MUST | The query executes without errors, and the result has exactly the fields it selects, nulls included |
| `roots` | §4.2.1, §3.3.1 | MUST | `queryType`, `mutationType` and `subscriptionType` |
| `types` | §4.2.1 | MUST | `types` is the set of all named types, each once |
| `builtinScalars` | §3.5, §4.2.1 | MUST | The built-in scalars the schema references, and no others |
| `typeByName` | §4.2 | MUST | `__type(name:)` returns the named type, and `null` for a name the schema doesn't have |
| `typeKinds` | §4.2.2 | MUST | Each type's kind, and which `__Type` fields are null for that kind |
| `fields` | §4.2.2, §4.2.3 | MUST | Fields of objects and interfaces, with their types |
| `arguments` | §4.2.3, §4.2.4, §4.2.6 | MUST | Arguments of fields and directives, with their types |
| `defaultValue` | §4.2.4 | MUST | Default values, and null without one |
| `inputFields` | §4.2.2, §4.2.4 | MUST | Input fields, with their types |
| `enumValues` | §4.2.2, §4.2.5 | MUST | Enum values |
| `interfaces` | §4.2.2 | MUST | `interfaces`, and `possibleTypes` of unions and interfaces |
| `deprecation` | §4.2.3 to §4.2.6, §3.13, §3.13.3 | MUST | `isDeprecated`, `deprecationReason`, `includeDeprecated` on every list, and `@deprecated` when the schema deprecates something |
| `specifiedByURL` | §4.2.2, §3.13.4 | MUST | A custom scalar's `@specifiedBy` URL, otherwise null |
| `isOneOf` | §4.2.2, §3.10.1 | MUST | True for OneOf input objects, false for other input objects, null otherwise |
| `descriptions` | §3.2, §4.2 | MUST | Descriptions from the document, including the schema's |
| `directives` | §4.2.1, §4.2.6, §3.13 | MUST | The document's directives: names, locations, `isRepeatable`; the service's own take input types |
| `builtinDirectives` | §3.13, §3.13.1, §3.13.2, §3.13.4, §3.13.5 | SHOULD | `@skip` and `@include`; `@specifiedBy` with a custom scalar; `@oneOf` with a OneOf input object |
| `builtinDefinitions` | §4.2, §3.13 | MUST | The introspection types and built-in directives are as the spec defines them |
| `typename` | §4.1 | MUST | The root's `__typename` names the query root type, and no `fields` list includes `__typename` |
| `order` | §4.2 | SHOULD | Fields, arguments, input fields, enum values, the document's directives, union members and interfaces in source order, where the document gives one |
| `other` | §4.2 | MUST | A mismatch `Problems` can't name |

Every response exercises `envelope` and `executes`. A `__schema` result that has the selected fields exercises every other check but `typeByName`. A lookup result exercises `typeByName` and the checks about a single type, but not `roots`, `types`, `builtinScalars`, `directives` or `builtinDirectives`. A result counts toward one finding: the set of problems it has. Problems with the document's types are grouped by aspect, problems with built-ins by the exact field or argument. The run fails on any failing MUST check, a failing SHOULD check with `--strict`, an answer without `response`, or a failed self-test.

**Self-test** ([`kit/introspect/controls.mjs`](../../kit/introspect/controls.mjs)). Every run also evaluates responses built from the reference's expected ones, 83 of which must fail:
- each vector's expected response, which must pass;
- the next vector's expected response, where it differs, which must fail;
- 57 responses broken on purpose, each of which must fail the check it targets. Among them: a response with errors (`executes`), a deleted `ofType`, a deleted null, an extra field (`executes`), `errors: []` and `errors: "not a list"` (`envelope`), a dropped enum value (`enumValues`), a changed default (`defaultValue`), `__typename` listed as a field (`typename`), an unreferenced `Float` (`builtinScalars`), reordered fields (`order`), a missing `@skip`, a missing `@specifiedBy` with a custom scalar and a missing `@oneOf` with a OneOf input (`builtinDirectives`), a missing `@deprecated` in a schema that deprecates (`deprecation`), a dropped `__TypeKind` value (`builtinDefinitions`), a service directive whose argument type isn't in `types` (`arguments`) or is an object type (`directives`), and for `__type(name:)` a type for an unknown name, `null` for a known one, another type's entry, and an unreferenced `Float` (`typeByName`);
- 11 changes the spec allows, which must pass: `minimal` without `@deprecated`, `@specifiedBy` and `@oneOf`; `deprecation` without `@specifiedBy` and `@oneOf`; a directive of the service's own; one that takes its own scalar; one that takes its own input object, which uses its own enum and `Float`; other encodings of default values; types in another order; an interface's possible types in another order; and `__TypeKind`'s values and `__Type`'s fields in another order, in `__schema` and in a lookup.

## Vectors

[`kit/introspect/vectors.json`](../../kit/introspect/vectors.json) holds 34 vectors for 11 schemas: 22 `__schema` vectors, each schema with and without `includeDeprecated: true`, and 12 lookup vectors, one per schema with `includeDeprecated: true` and one more for `deprecation` without it. [`scripts/generate-vectors-introspect.mjs`](../../scripts/generate-vectors-introspect.mjs) writes it. It checks each schema valid by `TypeSystem!Verdict`, with every default value coercible, then evaluates `Introspection!SchemaResult` with the spec's built-ins, the query root's name and `Introspection!TypeByName` for each lookup with tla-ts. `--check` regenerates the file and fails if it differs. graphql-js only parses the SDL.

Each `__schema` vector's `expected.response` is the response the reference expects, without the built-ins, which every schema shares and the file holds once in `builtins`. A lookup vector has `lookups` (`[{ "alias", "name" }]`), and its `expected.response` has the reference's `__Type`, or `null`, under each alias. Each asks for a few of the schema's types, among them a built-in scalar or introspection type, and for `Unknown`. `minimal`, `roots` and `builtinScalars` also ask for a built-in scalar they don't reference, whose answer is `null`. Descriptions the spec leaves open are null. The kit doesn't compare responses with them directly: it evaluates `Matches` or `TypeByNameMatches`, as above. The expected responses are what the self-test starts from and what findings show.

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

[`adapters/graphql-js/areas/introspect.mjs`](../../adapters/graphql-js/areas/introspect.mjs) runs `buildSchema`, then `graphqlSync` with the query. Every `__schema` result fails `builtinDefinitions`, on the deviations `differential-type-system.mjs` documents in `INTROSPECTION_DEVIATIONS`. They aren't encoded as expected answers. Every lookup that builds passes, and every other check passes.

- **17:** `__DirectiveLocation` has `FRAGMENT_VARIABLE_DEFINITION`, for fragment arguments, which the draft doesn't.
- **16:**
  - `@deprecated(reason: String = …)`, where the draft has `String!`;
  - `includeDeprecated: Boolean = false` on `__Type.fields`, `enumValues` and `inputFields`, and on `__Field.args` and `__Directive.args`, where the draft has `Boolean!`;
  - `directiveDeprecation` fails `executes`, in all three of its vectors: 16 can't parse `directive @old @deprecated on FIELD`.

## Limits

- **`__type(name:)` for a few names:** each lookup vector asks for four to six names. The kit doesn't ask for every type, nor for the service's own types.
- **Built-ins compared by name, not loosely:** the comparison assumes the spec's introspection types, in any order. A service that adds a field or enum value to one fails `builtinDefinitions`, as graphql-js 17 does.
- **A failing query hides the rest:** the query selects every draft field. An implementation without, say, `__Directive.isDeprecated` rejects the whole query, and only `executes` is graded.
- **No extensions:** the schemas have no `extend` definitions, since `TypeSystem.tla`'s data comes from definitions.
