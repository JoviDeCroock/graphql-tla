# The coordinate area

`graphql-tla run coordinate` checks §2.14 Schema Coordinates, which September 2025 introduced (September 2026's text is the same): whether an implementation parses a schema coordinate exactly when §2.14's grammar allows it, and what it resolves the coordinate to in a schema. The reference is [`specs/SchemaCoordinates.tla`](../../specs/SchemaCoordinates.tla): `Parse` reads the coordinate with §2.14's own lexical tokens and no Ignored, and `Resolve` follows §2.14's five resolution algorithms over [`TypeSystem.tla`](../../specs/TypeSystem.tla)'s schema data, with [`Lexer.tla`](../../specs/Lexer.tla)'s names.

```shell
npx graphql-tla run coordinate --adapter "node adapters/graphql-js/adapter.mjs --graphql 17" --strict --report coordinate.json
```

The area follows [the contract for areas beyond execution](../kit-areas.md). An adapter takes part by claiming the `coordinate` capability in `hello`. An implementation with no schema coordinate API doesn't claim it, and `graphql-tla run coordinate` exits with code 3.

## Request

```json
{"type":"coordinate","id":12,"sdl":"type Query { searchBusiness(criteria: SearchCriteria!): [Business] } ...","coordinate":"Query.searchBusiness(criteria:)"}
```

- **`sdl`:** the schema, in the type system definition language. It is always a valid schema with no extensions. Build it the way your implementation builds a schema from SDL. Every vector uses one of two schemas (the `schemas` map of [`vectors.json`](../../kit/coordinate/vectors.json)), so an adapter may cache the built schema by its text.
- **`coordinate`:** the schema coordinate, as a JSON string. It may hold any character, including a byte order mark, a line separator (U+2028) or U+0000, written as JSON escapes or raw.

Parse the coordinate with your implementation's schema coordinate parser, then resolve what it parsed against the schema. Don't trim or normalise the string first.

## Result

One of:

```json
{"type":"result","id":12,"ok":false}
{"type":"result","id":12,"ok":true,"resolved":null}
{"type":"result","id":12,"ok":true,"resolved":{"kind":"argument","path":["Query","searchBusiness","criteria"]}}
{"type":"result","id":12,"ok":true,"error":"Expected \"Unknown\" to be defined as a type in the schema."}
```

- **`ok`:** whether the coordinate parses. A syntax error is `false`; it is an answer, not an adapter error.
- **`resolved`** (with `ok: true`): what resolving gave. `null` when the resolver yields no element. Otherwise the element:
  - **`kind`:** one of `"type"` (a named type), `"field"` (a field of an Object or Interface type), `"inputField"`, `"enumValue"`, `"argument"` (a field argument), `"directive"`, `"directiveArgument"`. These are §2.14's kinds of schema element.
  - **`path`:** the element's name and the names of the elements that contain it, outermost first: `["Business"]`, `["Business", "name"]`, `["SearchFilter", "OPEN_NOW"]`, `["Query", "searchBusiness", "criteria"]`, `["private"]` for `@private`, `["private", "scope"]` for `@private(scope:)`. No `@`.
- **`error`** (with `ok: true`, instead of `resolved`): resolving raised an error, as §2.14 says it does when a type, field or directive that contains the element isn't in the schema. The value is the error's message, a string; the kit doesn't read it.

Take `kind` and `path` from the element your implementation resolved to (its type, its field's name), not from the coordinate you sent: an implementation that resolves `Business.name` to some other element must not pass.

Any other fields in the result are ignored. A result with `ok: true` must have exactly one of `resolved` and `error`; anything else is malformed.

**Crashes.** If the implementation fails in some other way, such as an exception that isn't its syntax error or its resolution error, answer `{"type":"error","id":12,"message":"…"}`. The kit reports the vector as a crash ([the protocol](../kit-areas.md#protocol)). Don't answer `ok: false` or `error` for every exception: a crash then passes on every coordinate the reference rejects, or every one where it raises.

**An implementation that only parses, or only resolves.** The area needs both. An API that resolves a string directly (graphql-js's `resolveSchemaCoordinate`) is fine if its syntax error can be told apart from its resolution error.

## What is checked

Every check cites §2.14 and has `since: "September2025"`. Each check's `basis` in the report quotes the sentences it rests on.

| Check | Level | What fails it |
| --- | --- | --- |
| `grammar` | MUST | accepting a token sequence none of the five productions matches (`Query.f(x)`, `@private.scope`, `Business.name.first`, `...`), or rejecting a coordinate the reference accepts, whatever it resolves to |
| `tokens` | MUST | accepting a character that starts no SchemaCoordinateToken: `$`, `!`, `"`, a digit at a name's start, `é`, U+00A0, U+2028, U+0000 |
| `noIgnored` | MUST | accepting Whitespace, a LineTerminator, a comma, a comment or a byte order mark anywhere, at the start and end too |
| `resolvesTypes` | MUST | a TypeCoordinate that doesn't give the named type, or gives something for a name the schema doesn't have; built-in scalars the schema refers to (`String`, `Int`, `Float`, `ID`, and `Boolean` in the second schema) are types |
| `resolvesMembers` | MUST | a MemberCoordinate that doesn't give the field (of an object or an interface), input field or enum value, or gives something where none exists, without an error |
| `resolvesArguments` | MUST | the same for an ArgumentCoordinate's argument |
| `resolvesDirectives` | MUST | the same for a DirectiveCoordinate: the SDL's directives and `@deprecated`, which the schema applies |
| `resolvesDirectiveArguments` | MUST | the same for a DirectiveArgumentCoordinate, `@deprecated(reason:)` included |
| `missingContainers` | MUST | no error where a type, field or directive that contains the element isn't in the schema: `Unknown.name`, `Query.unknown(x:)`, `@unknown(x:)` |
| `containerKind` | INFO | see below |
| `builtinDirectives` | SHOULD | `@skip`, `@include`, `@specifiedBy`, `@oneOf` and their arguments not resolving, when the SDL doesn't define them and §3.13 asks for them (`@skip` and `@include` in both schemas, the other two in the first) |

A wrong answer counts against the vector's `check` only, and toward one finding. A coordinate the reference accepts and the implementation rejects counts against `grammar`, not against the resolution check. Findings are "accepts what §2.14 rejects", "rejects schema coordinates §2.14's grammar accepts", "gives an error where §2.14's algorithm gives no element" (and the other pairs of element, no element and error), "resolves to another element", "crashes on a coordinate" and "results not in the coordinate result format".

**Levels.** The algorithms' steps have the level of their algorithm ("Algorithm steps phrased in imperative grammar ... are to be interpreted with the same level of requirement as the algorithm", Appendix A), and §2.14's prose says "will" for both outcomes of a missing element. The kit grades both as MUST. `@deprecated` is a MUST where the others are SHOULDs because of §3.13: implementations that read SDL "must provide the `@deprecated` directive if representing deprecated portions of the schema", and the schema has a deprecated field; `@skip` and `@include` are "should provide", `@specifiedBy` and `@oneOf` "should provide ... if representing" custom scalars and OneOf input objects, which the schema has. Where the schema doesn't have what a directive describes, §3.13 doesn't ask for it, and its coordinates aren't graded (below).

**Editions.** Schema coordinates are new in September 2025, and September 2026 has the same §2.14, word for word. So every vector has `since: "September2025"`, every failing vector counts in `failingSince` and the finding's `since` (the sheet labels them "since September 2025"), and the report's `since` covers all of them. Crashes count there too: October 2021 can't express a coordinate request.

## The prose and the Asserts disagree on a type of the wrong kind

The MemberCoordinate algorithm asserts that the type "must be an Enum, Input Object, Object or Interface type", and ArgumentCoordinate that it must "be an Object or Interface type". The prose names one error only, "an error will be raised if any non-leaf nodes within a schema coordinate cannot be found in the schema", and says that otherwise, "If the schema element cannot be found, the resolve function will not yield a value (without raising an error)". For `Date.x` on a scalar, `SearchResult.id` on a union, or `SearchCriteria.filter(x:)` on an input field, every non-leaf node is found, so the prose gives no element and no error, and the Asserts give an error. `SchemaCoordinates.tla` follows the Asserts, but the kit doesn't take a side: `containerKind` is informational, an error and no element both pass, and the check's `observed` records which one the implementation gives. An element, or a rejection of the coordinate, fails it (informationally).

## Not graded

These vectors are sent, and the kit grades whether the implementation parses them (they are well formed, under `grammar`), but not what they resolve to, and a crash on them isn't graded either:

- **Meta-fields**: `Business.__typename`, `SearchResult.__typename`, `Query.__schema`, `Query.__type(name:)`, and the same on a query root that isn't named `Query`. §2.14: "they are not schema element and therefore resolving such coordinates does not have a defined behavior."
- **Introspection types**: `__Type`, `__Schema`, `__TypeKind.OBJECT`, `__Type.fields(includeDeprecated:)`. "By extension, an introspection type is not a schema element."
- **Built-in scalars the schema doesn't refer to**: `Boolean` in the first schema, `Int` in the second. §3.5 leaves a built-in scalar that no field, argument or input field refers to out of `__Schema.types`, but doesn't say whether the schema has it. graphql-js has `String` and `Boolean` always (the introspection types and the built-in directives' arguments refer to them) and `Int` only when the schema uses it. A built-in scalar the schema does refer to is a type, and graded.
- **Built-in directives the schema needn't have**: `@deprecated`, `@deprecated(reason:)`, `@specifiedBy`, `@oneOf` and `@oneOf(x:)` in the second schema, which deprecates nothing and has no custom scalar and no OneOf input object. §3.13 says implementations "must provide the `@deprecated` directive if representing deprecated portions of the schema" and "should provide" `@specifiedBy` and `@oneOf` "if representing" custom scalars and OneOf input objects; nothing says whether a schema without those has them ("any built-in directive may be omitted for brevity" is about writing SDL). `SchemaCoordinates.tla`'s `DirectiveExists` puts `@skip` and `@include` in every schema and the other three where their condition holds. graphql-js has all five always.

A field named `__schema` on a type other than the query root isn't a meta-field, so `Business.__schema` is graded: there is no such field, and the answer is no element.

## The vectors

[`kit/coordinate/vectors.json`](../../kit/coordinate/vectors.json) holds 210 vectors over two schemas, each with `coordinate`, `schema` (a key of `schemas`), `check`, `expected` (in the result's shape, with `"error": true` for an error), `alternatives` (other answers that pass, on `containerKind` vectors), `unspecified` (why the resolution isn't graded) and `reference` (how `SchemaCoordinates.tla` read it: the production, the Assert that failed, or why it rejects the coordinate). [`scripts/generate-vectors-coordinate.mjs`](../../scripts/generate-vectors-coordinate.mjs) writes it, taking every answer from `Parse` and `Resolve`, evaluated by tla-ts; graphql-js only parses the SDL into schema data. `--check` regenerates it and fails if it differs.

- **`business`** is §2.14's example schema with an interface, a union, arguments with defaults, a deprecated field, a custom scalar with `@specifiedBy`, a OneOf input object and a directive without arguments added. **`rooted`** has root operation types named `Root` and `Change`, and nothing deprecated, no custom scalar and no OneOf input object.
- **Syntax**: §2.14's table, names (underscores, digits, `true`, `query`), 25 coordinates with Ignored in every position, 15 with characters that start no token, and 31 token sequences no production matches (`Query.searchBusiness(criteria)`, `(criteria:)` missing its field, `@private()`, a trailing `.`).
- **Resolution**: every kind of element, found and not found (case-sensitive names, an interface's field that only its implementation has, an argument of a field without arguments, a `Query` type that isn't there because the root is named `Root`); every Assert on a missing type, field and directive; every kind Assert; built-in scalars and directives, in a schema that has what each built-in directive describes and in one that doesn't.

`SchemaCoordinates.cfg` checks the reference on its own schema (§2.14's example, with an interface, a union and a scalar): every schema element's coordinate parses and resolves back to it, no two elements share a coordinate (the uniqueness property), a coordinate with any Ignored inserted anywhere doesn't parse ("a single unambiguous and unique lexical form"), replacing the last name with an unknown one yields nothing, replacing any other raises an error, and hand-written syntax and resolution vectors (some of them over two smaller schemas, one with nothing deprecated, no custom scalar and no OneOf input object, and one with a OneOf input object, for the built-in directives). [`specs/coordinate.mutants.mjs`](../../specs/coordinate.mutants.mjs) plants a bug for each of those properties.

Every run also checks the checker: it must flag none of the reference's own answers, every flipped verdict, every resolution taken from the next vector where it differs, answers that echo the coordinate as a field, elements of the wrong kind, errors where the reference raises none, no element where the reference raises (on `missingContainers`, while `containerKind` passes it), results without `ok` or with both `resolved` and `error` as malformed, and every vector crashed as a crash since September 2025.

## graphql-js

The graphql-js adapter ([`adapters/graphql-js/areas/coordinate.mjs`](../../adapters/graphql-js/areas/coordinate.mjs)) parses with `parseSchemaCoordinate` and resolves with `resolveASTSchemaCoordinate`, both in graphql-js 16.15 and 17. A `GraphQLError` from the parser is `ok: false`; the plain `Error` the resolver throws is `error`. Both versions agree with the reference on every graded vector, and give an error on every `containerKind` vector.

## Limits

- No coordinate holds a lone surrogate: §2.14 requires SourceCharacters, but a JSON transport may not carry one (see [the parse area](parse.md#sources-an-adapter-cant-receive)). `SchemaCoordinates.tla` rejects one (`sourceCharacter`).
- The uniqueness property is checked in the reference, not on implementations: no API in the protocol gives an element's coordinate. The kit checks the other direction, that each element's coordinate resolves to it.
- Schemas built with extensions, or by code rather than SDL, aren't covered.
