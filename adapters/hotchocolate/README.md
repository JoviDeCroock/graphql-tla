# Hot Chocolate adapter

A [graphql-tla adapter](../../docs/conformance.md) for [Hot Chocolate](https://github.com/ChilliCream/graphql-platform) 15.1 (.NET 8). It answers every area of the kit: execution, and `parse`, `validate`, `coerce`, `schema` and `introspect` ([docs/kit-areas.md](../../docs/kit-areas.md)).

For each `execute` it builds a request executor from the SDL (cached by SDL) with `AddGraphQL().AddDocumentFromString(sdl)`, and installs:

- one global field middleware (`UseField`) on every non-introspection field, which sends `call` and awaits the kit's `settle`;
- a type interceptor that sets `IsOfType` on every object type, so abstract types resolve to the type the kit named, and gives each subscription field a source stream that yields one event.

The response is the executor's result serialized with Hot Chocolate's JSON result formatter (`ToJson`).

Source references below are to Hot Chocolate at tag `15.1.21`, under `src/HotChocolate/`: `Core/src/...` and `Language/src/...`.

## Build

Needs the .NET 8 SDK.

```shell
cd adapters/hotchocolate
dotnet build -c Release
```

## Run

From the repository root:

```shell
node kit/cli.mjs run execution --adapter "adapters/hotchocolate/run.sh" --strict
node kit/cli.mjs run parse --adapter "adapters/hotchocolate/run.sh" --strict
node kit/cli.mjs run validate --adapter "adapters/hotchocolate/run.sh" --strict
node kit/cli.mjs run coerce --adapter "adapters/hotchocolate/run.sh" --strict
node kit/cli.mjs run schema --adapter "adapters/hotchocolate/run.sh" --strict
node kit/cli.mjs run introspect --adapter "adapters/hotchocolate/run.sh" --strict
```

`run.sh` uses `$DOTNET_ROOT/dotnet` if `DOTNET_ROOT` is set, otherwise `dotnet` from `PATH`. It passes its arguments on:

- `--idle` claims `idle` in execution (below).
- `--introspection-list-depth N` raises Hot Chocolate's introspection depth limit, which rejects the kit's introspection query by default (see [Introspect](#introspect-the-kits-query-is-rejected)).

## Execution

Capabilities: `invalid-results`, `uncoercible-results`, `mutation`, `subscription`. Not claimed:

- `deferred-items`: Hot Chocolate completes a list from an `IEnumerable` and doesn't await its items, so items come inline.
- `error-propagation-off`: Hot Chocolate 15 has no switch that disables null propagation for a request. `EnableSemanticNonNull` rewrites the schema instead, and skips `id` fields, mutation fields and the `Node` interface.
- `idle`: resolvers run on the thread pool, so by default the kit waits `--grace` ms (50 ms is plenty: after warm-up the next call arrives within about 1 ms of a settle, worst seen about 20 ms).

`run.sh --idle` claims `idle` anyway, based on thread-pool quiescence (no queued work, no busy worker, no work completed over several samples). That depends on how the .NET runtime schedules Hot Chocolate's work, not on anything Hot Chocolate promises, so it is opt-in. A `call` or `response` sent after `idle` is reported on stderr (none were in a full run, and the kit's determinism replay passed).

Every `call` carries `after`, the number of settles the execution had applied, so `calledSerially` is conclusive for mutations in both modes.

## Other areas

[`Areas.cs`](Areas.cs) answers them on the thread that reads stdin, one request at a time, and never sends `idle`, which only execution uses.

Every area but parse builds the schema the same way, with Hot Chocolate's default options: `AddGraphQL().AddDocumentFromString(sdl)`, then the request executor. Execution changes some options to keep the schema exactly as the kit wrote it (`EnableOneOf = false`, for one). The areas don't, since they ask what Hot Chocolate itself does with the SDL. Two things are needed for any SDL:

- Hot Chocolate refuses to build a schema with a field that has no resolver ("The field `Query.a` has no resolver"). So every field gets the same field middleware in every area, though it only runs in coerce.
- Hot Chocolate skips `scalar` definitions in SDL. `SchemaSyntaxVisitor` keeps only their directives (`Core/src/Types/Types/Factories/SchemaSyntaxVisitor.cs:152-161`). It resolves a scalar by name instead: a built-in one, or one of its own, such as `Date`, `JSON` or `Long` (`Core/src/Types/Types/Scalars/Scalars.cs:39-64`). Any other name has to be registered by the application, or the build fails with "Unable to resolve type reference". The adapter registers Hot Chocolate's `JsonType` under each such name (`Json`, `Plain`, `A`, ...). `JsonType` is the scalar Hot Chocolate provides for arbitrary values, and its `IsInstanceOfType` accepts every literal (`Core/src/Types/Types/Scalars/JsonType.cs:42-43`). `AnyType` would not do: it rejects enum literals (`AnyType.cs:48-68`).

### parse

`Utf8GraphQLParser.Parse` with the request executor's `ParserOptions`, as `DocumentParserMiddleware` parses a request's document. The parser also reads the type system language, so every definition must be an operation or a fragment.

A `SyntaxException` is `ok: false`. The parser also throws other exceptions on some sources: `Utf8EncodingException` (which isn't a `SyntaxException`) and `IndexOutOfRangeException` (below). `DocumentParserMiddleware` only catches `SyntaxException`, so on a server such an exception reaches the request pipeline's exception middleware, and the request fails without a syntax error. The adapter answers these with an `error`, which the kit reports as a crash ([docs/kit-areas.md](../../docs/kit-areas.md#protocol)), and writes the stack trace to stderr. A source holding a lone surrogate can't be read into a string by System.Text.Json, so it never reaches Hot Chocolate, and the answer is `ok: false`. `Parse(string)` refuses an empty source with an `ArgumentException`, which is also `ok: false`.

### validate

The executor's `IDocumentValidator`, from the application's `IDocumentValidatorFactory` as `DocumentValidationMiddleware` gets it, called as that middleware calls it: Hot Chocolate's default rules. Capability: `custom-scalar-literals`, from `JsonType` above.

The kit gives a valid schema, but Hot Chocolate refuses one of them: the differential schema's interface `Resource`, which no object type implements. That breaks Hot Chocolate's `InterfaceHasAtLeastOneImplementationRule` (see [Schema](#schema)). That rule, like every schema validation rule, only runs with `StrictValidation`, and nothing in document validation or execution reads that option. So when the default build throws a `SchemaException`, the adapter builds the schema again with `StrictValidation = false`, and says so on stderr. Only the differential schema needs it.

### coerce

The request is executed through the request executor, with a field middleware on every field that records the field's path and the arguments Hot Chocolate coerced, and returns `"ok"`. The arguments are read with `context.ArgumentValue<object?>` for every argument the field declares. That is how the resolver compiler reads a resolver method's parameters. An argument that fails to coerce throws there, before the call is recorded, as it would before a resolver method's body ran. The variables are read with `Utf8GraphQLRequestParser.ParseVariables`, the routine the request parser uses for a request's `variables`. A syntax error there is answered as a request error. If execution threw, the adapter would answer with an `error`, the kit's "no response"; no vector does that.

Capabilities:

- `exact-numbers`: `ParseVariables` turns each JSON value into a GraphQL literal and keeps a number's text as it is (`Language/src/Language.Web/Utf8GraphQLRequestParser.Syntax.cs:97-111`). 2^53 + 1 stays `9007199254740993`.
- Not `absent-vs-null`: Hot Chocolate gives a resolver every declared argument. A variable with no value is replaced by the argument's default or by the literal `null` (`Core/src/Execution/Processing/VariableRewriter.cs:280-286`), and nothing records that it was missing (`Core/src/Execution/Internal/ArgumentCoercionHelper.cs:84-98` keeps `IsDefaultValue` false). Input objects become dictionaries with an entry for every field, `null` where the literal has none (`Core/src/Types/Types/InputObjectType.Initialization.cs:159-169`). So a resolver can't tell a variable with no value from one set to null.
- Not `unvalidated`: `OperationResolverMiddleware` compiles an operation only when the request context holds a passing validation result, and otherwise ends the request (`Core/src/Execution/Pipeline/OperationResolverMiddleware.cs:34`, `:57-60`). Executing without validation would mean faking that result.

### schema

The request executor is built, which builds and validates the schema. Hot Chocolate rejects a schema by throwing `SchemaException`, and a syntax error in the SDL is a `SyntaxException`. Those are `valid: false`. Any other exception is a crash, and gets an `error` answer.

### introspect

The request executor is built, and the kit's query executed against it and serialized with `ToJson`. A schema that doesn't build is answered with a response that has only `errors`.

## Results

From full runs with `--strict` (`run.sh --idle`; execution with `--random 1500 --seed 1`):

| Area | Result |
| --- | --- |
| execution | 2095 of 2189 distinct well-formed cases satisfy the reference (11972 cases). `nullsExplained` fails on 94, and 384 cases are malformed under `intFraction` (the two deviations below). Unchanged by the other areas. |
| parse | 1526 of 1983 vectors agree, and 16 crash. 20 of 31 checks fail, most of them only through the byte order mark. |
| validate | 3004 of 3088 vectors agree. `valuesOfCorrectType`, `fieldSelectionMerging`, `singleRootField` (draft only) and `acceptsValid` fail; §5.6.2 and §5.6.4 are `subsumed`. |
| coerce | 1828 of 1930 vectors match (106 skipped: they need `absent-vs-null` or `unvalidated`). 10 checks fail: `int`, `inputObject`, `list`, `variables`, `arguments`, `invalidNotExecuted` and `fieldErrorPath` (MUST), `floatPrecision` and `idCoerced` (SHOULD), and the informational `loneSurrogates`. |
| schema | 131 of 165 schemas agree, 1 of them a crash. 19 of 44 rules fail. |
| introspect | 0 of 38: both queries are rejected by the introspection depth rule. With `--introspection-list-depth 2`: graded against October 2021, 6 of 28 results pass, and 8 checks fail (`builtinDefinitions`, `deprecation`, `defaultValue`, `specifiedByURL`, `descriptions`, `directives`, `builtinDirectives`, and the informational `builtinAdditions`). |

## Known Hot Chocolate deviations

Each one below was reproduced with plain Hot Chocolate 15.1.21 in a standalone program: `AddGraphQL().AddDocumentFromString(sdl)` with one field middleware returning `"ok"`, default options, and requests through `IRequestExecutor.ExecuteAsync`.

### Execution: a null at a Non-Null list item nulls the list without an error

When a list's item type is Non-Null and an item resolves to null, Hot Chocolate nulls the list (or the nearest nullable position) but adds no error. §6.4.3 completes each item with the item type, and a null at a Non-Null position must raise an execution error (§6.4.4), which graphql-js reports at the item's path, such as `["posts", 0]`. The kit reports it as `nullsExplained`:

```
call posts; call tags; settle posts = list(1); call posts.0; settle posts.0 = null; settle tags = list(0)
response: {"data":{"posts":null,"tags":[]}}
```

In Hot Chocolate 15.1.21:
- `Execution/Processing/ValueCompletion.cs` returns null for a null result without reporting anything.
- `ValueCompletion.List.cs` `TryCompleteElement` then returns `list.IsNullable`, so the list is nulled silently.
- The "Cannot return null for non-nullable field" error is only recorded for fields, in `Tasks/ResolverTask.CompleteValue.cs` (`AddNonNullViolation`).

### Execution: a fraction returned for an Int is truncated

A resolver that returns `1.2` for an `Int` field gives `1`, not an execution error. §3.5.1 allows coercing a non-integer value only "without losing information", otherwise an execution error must be raised. The kit reports it as `resultCoercion`. A plain Hot Chocolate 15.1.21 server shows the same: with `type Query { count: Int ratio: Float }` and resolvers returning `1.2` and `double.PositiveInfinity`, `{ count ratio }` gives `{"data":{"count":1,"ratio":null}}`, with an error only for `ratio`. A non-finite Float is rejected, as §3.5.2 requires.

### Parse

The lexer is `Language/src/Language.Utf8/Utf8GraphQLReader.cs`, and string escapes are decoded later, by `Utf8Helper.Unescape`, when the parser reads a string's value.

- **A byte order mark after the start is rejected (406 vectors, 38 draft only).** `{a﻿b}` gives "Unexpected character `ï` (239)". §2.1.1 makes U+FEFF ignored anywhere. The reader skips it only at position 0 (`Utf8GraphQLReader.cs:113-116`, `SkipBom` at `:736-751`). These vectors are spread over almost every check, since the generator puts ignored tokens between every pair of tokens.
- **Block strings decode escape sequences (4 vectors, all crashes).** In a block string only `\"""` is an escape, but `Unescape` treats every backslash as one when `isBlockString` is true (`Utf8Helper.cs:24-41`, `:85-95`). `"""\n"""` becomes a newline, and `"""\ """` throws `Utf8EncodingException: The escape char ` ` is invalid`. The 4 valid sources that fail throw like that, so the kit reports them as crashes on a source §2.10.4 accepts.
- **Malformed escapes crash instead of failing to parse.** `"\u004"` and `"\u{}"` throw `IndexOutOfRangeException`, since `Unescape` reads four bytes after `\u` without a bounds check (`Utf8Helper.cs:45-51`). An unpaired low surrogate, such as `"\uDEAD"`, throws `Utf8EncodingException` (`:62-68`). 12 rejected vectors (6 draft only) crash this way. A server still fails those requests, but with an unexpected exception, not a syntax error. The kit reports them as crashes on a source §2.10.4 rejects, which fail `stringValue`.
- **Variable-width escapes aren't supported.** `Unescape` always reads four hex digits after `\u`, with no check that they are hex digits, so `"\u{1F600}"` decodes to garbage, and `"\u{110000}"`, `"\u{D800}"` and the unterminated `"\u{1F4A9"` are accepted (5 vectors, §2.10.4). The area doesn't compare values, so the accepted valid ones pass.
- **A trailing high surrogate escape is accepted (3 vectors, all draft only).** `"\uD83D"` and `"\uD83Dx"`: `Unescape` keeps the high surrogate pending and never checks it at the end of the string, so it is dropped (`Utf8Helper.cs:52-59`).
- **Empty lists are accepted (3 vectors).** `{a()}`, `{a @d()}` and `query () {a}`: `ParseArguments` and `ParseVariableDefinitions` loop "until `)`", so zero items pass (`Utf8GraphQLParser.Operations.cs:91-105`, `:266-281`). §2.6, §2.11 and §2.13 require at least one.
- **A description before the `{ … }` shorthand is accepted (3 vectors).** `"d" {a}`: `ParseDefinition` reads a description before any definition, then the shorthand (`Utf8GraphQLParser.cs:91-97`, `:157-160`). The draft allows a description only on the long form.
- **An empty document is accepted (1 vector, §2.3).** `"  # only a comment"` parses to a document with no definitions (`Utf8GraphQLParser.cs:81-84`). A server then fails the request, since there is no operation.
- **Descriptions on variable definitions are rejected (16 vectors, all draft only).** Descriptions on operations and fragments parse, but `ParseVariableDefinition` doesn't read one (`Utf8GraphQLParser.Operations.cs:119-128`).
- **Control characters in comments (4 vectors, all draft only).** A vertical tab or form feed in a comment is rejected. October 2021 doesn't allow them either.

### Validate

Each document below was run through the request executor: the invalid ones execute (or fail only later, during execution), and the valid ones are refused at validation. The rules are in `Core/src/Validation/Rules/`.

- **§5.6.1 not enforced (28 vectors, 5 draft only).** `ValueVisitor` has three gaps:
  - Entering a variable definition, it pushes the variable's named type, dropping every wrapper (`ValueVisitor.cs:91-104`), and then checks the default value against that. So `query Q($v: Int! = null) { … }` is accepted (14 vectors). Variable coercion then fails the request, "Variable `v` is required".
  - Any null literal passes, whatever the type (`ValueVisitor.cs:335`). `{ echo(opt: null) }` with `opt: Int! = 1` is accepted, and fails during execution as a field error.
  - A list literal where an input object is expected stops the visitor with no error (`ValueVisitor.cs:298-318`: `UnexpectedErrorsDetected` and `Break`). `{ echo(filter: [1]) }` executes.
- **§5.8.5 over-strict (10 valid vectors).**
  - A list-typed variable with a list default is rejected, for the same reason as the first gap above: `query Q($v: [Int!] = [1]) { echo(list: $v) }` gives "The specified value type of variable `v` does not match the variable type" (6 vectors).
  - A variable with a non-null default is rejected as a Non-Null list item or input field: `query Q($v: Int = 1) { echo(list: [$v]) }` with `list: [Int!]`. Inside a value, `ValueVisitor` checks a variable's type alone, without the defaults §5.8.5 allows for (`ValueVisitor.cs:415-419`, `IsTypeCompatible` at `:476-512`) (4 vectors).
- **§5.3.2 not enforced (4 vectors).** `{ node(id: "1") { a: __typename ... on Post { a: name } } }`: both are `String!`, but with one parent an interface and the other an object type, the names must match. `IsParentTypeAligned` asks for both parents to be non-object types instead of either (`FieldVisitor.cs:328-330`).
- **§5.8.2 over-strict (5 valid vectors).** `query Q($v: Int) { json(value: {a: $v}) }` gives "The following variables were not used: v". `VariableVisitor` skips an object field whose parent type isn't an input object (`VariableVisitor.cs:216-228`), so a variable inside a custom scalar's literal is never counted as used.
- **The schema's own `@tag` is replaced (16 valid vectors rejected, under several rules).** The differential schema defines `directive @tag(name: String) repeatable on QUERY | … | FIELD | …`. With the default `EnableTag`, `SchemaSyntaxVisitor` skips an SDL directive named `tag` (`SchemaSyntaxVisitor.cs:166-170`) and Hot Chocolate registers its own, which has only type system locations (`Core/src/Types/Types/Directives/Directives.cs:47-50`, `Tag.cs:22-35`), and is then removed as unused. So `{ user { id @tag } }` gives "The specified directive `tag` is not supported by the current schema".
- **§5.2.4.1 not enforced for `@skip` and `@include` (22 vectors, all draft only).** The subscription rule counts the root selections' response names and ignores directives (`OperationVisitor.cs:100-131`).

### Coerce

- **Invalid documents that pass validation fail at execution, not as request errors (58 vectors, `invalidNotExecuted`).** These are the validate gaps above: an input object given a list literal (`{ point(v: [1]) }`, 54 vectors) and a null literal for a Non-Null argument with a default or a Non-Null list item (`{ intNNDefault(v: null) }`, `{ points(v: [null]) }`, 4 vectors). They end as field errors, with `data`.
- **A JSON number with a fraction or exponent isn't an Int or an ID.** `ParseVariables` keeps JSON numbers as GraphQL literals, so `1.0` and `1e21` are Float literals (`Utf8GraphQLRequestParser.Syntax.cs:105-111`), and Int and ID accept only Int literals (`Core/src/Types/Types/Scalars/IntegerTypeBase.cs:9`). `query($x: Int) { int(v: $x) }` with `{"x": 1.0}` is a request error, "Int cannot parse the given literal of type `FloatValueNode`". The kit counts JSON `1.0` as an integer (§3.5.1): 4 vectors under `int`, 7 under `list` and `inputObject`, and 3 under `idCoerced` (SHOULD), with `1e21` and `1e400` for ID.
- **List variables with list defaults are refused (7 vectors, `variables`), and a variable with a default as a Non-Null list item (3 vectors, `list` and `arguments`).** The §5.8.5 over-strictness above.
- **A null variable for a Non-Null argument gives a field error at the argument's path (5 vectors, `fieldErrorPath`).** `query($x: Int = 3) { intNN(v: $x) }` with `{"x": null}` gives `{"errors":[{"message":"Cannot accept null for non-nullable input.","path":["v"],…}],"data":{"intNN":null}}`. The field error is right, but its path is `["v"]`, not `["intNN"]`. The input parser builds the error with the path inside the argument (`Core/src/Types/Utilities/ThrowHelper.cs:290-305`), and `EnsurePathAndLocation` only adds the field's path to an error that has none (`Core/src/Execution/Processing/MiddlewareContext.Global.cs:137-145`). Worse, the check only happens when the resolver reads the argument: a resolver that doesn't runs with `v` null (`ArgumentCoercionHelper.cs:69-101` has no Non-Null check).
- **`floatPrecision` (1 vector, SHOULD):** a Float variable of 2^53 + 1 is rounded to 2^53.
- **Nested lists follow October 2021 (11 vectors, all draft only).** `{ matrix(v: [1]) }` for `[[Int]]` fails, "The item syntax node for a nested list must be `ListValue`" (`Core/src/Types/Types/InputParser.cs:152-160`). The draft coerces it to `[[1]]`. The literal case is a field error with the path `["v", 0]`: still a field error, and October 2021's answer, so these vectors count under that finding rather than `fieldErrorPath`.
- **A lone surrogate is dropped (2 vectors, informational).** `{"x": "\ud800"}` gives the string `""`: `Unescape` keeps the high surrogate pending and never writes it.

### Schema

All verdicts were reproduced with a plain `BuildRequestExecutorAsync`. The type system rules are in `Core/src/Types/Configuration/Validation/`.

- **An interface with no implementation is rejected (4 valid schemas, under `fieldNamesUnique`, `implementsItself`, `implTransitive` and `requiredArgNotDeprecated`).** "There is no object type implementing interface `I`" (`InterfaceHasAtLeastOneImplementationRule.cs:66`). The spec allows such an interface.
- **Crash:** `type O { a: Int } type Query implements O { a: Int }` throws `NullReferenceException` in `ObjectType.OnCompleteFields` (`implementsInterfaces`).
- **Definitions dropped silently:** `type Int { … }` (`typeNameNotBuiltin`): `RemoveBuiltInTypes` removes every definition named like a built-in type before the SDL is read (`Core/src/Types/SchemaBuilder.Setup.cs:152`). `scalar A scalar A` (`typeNamesUnique`): scalar definitions are skipped (above).
- **Duplicates merged:** `implements I & I`, `union U = Query | Query`, `enum E { A A }`.
- **No check:** names starting with `__` for types and enum values (`typeNameReserved`, `enumValueNameReserved`), the same type for two roots (`rootTypesDifferent`), a missing transitive interface (`implTransitive`), deprecation of an implementing field (`implDeprecation`, draft), default values that don't coerce (`argDefaultCompatible`, 10 schemas, draft), input object cycles through OneOf objects (`inputObjectUnbreakableCycle`, 2, draft) and through default values (`inputObjectDefaultValueCycle`, 4, draft), and directives that reference themselves (`directiveUsesItself`, `directiveReferencesItselfIndirectly`).

### Introspect: the kit's query is rejected

With default options, both the draft's and October 2021's query are rejected at validation: "Maximum allowed introspection depth exceeded." The kit's `wrappers` selection asks for `__Type.fields` of a field's type, so a path selects `__Type.fields` twice. `IntrospectionDepthVisitor` allows each of `fields`, `inputFields`, `interfaces` and `possibleTypes` once per path by default (`Core/src/Validation/Rules/IntrospectionDepthVisitor.cs:11-18`, `ValidationOptions.cs:14`). So only `executes` is graded, and every vector fails it.

`run.sh --introspection-list-depth 2` configures the executor with `SetIntrospectionAllowedDepth(16, 2)`, Hot Chocolate's own setting for this. Then the draft's query is still rejected, since Hot Chocolate names the field `__Type.oneOf`, not `isOneOf` (`Core/src/Types/Types/Introspection/__Type.cs:85-90`, `:191`). October 2021's query is answered, so the run is graded against October 2021, and the 10 draft-only vectors are skipped. Then:

- **Built-in definitions (`builtinDefinitions`, every `__schema` result):** Hot Chocolate has some of the draft's definitions: `@deprecated` on `ARGUMENT_DEFINITION` and `INPUT_FIELD_DEFINITION`, and `includeDeprecated: Boolean! = false` on `__Type.fields`, `enumValues` and `inputFields`. Its default reason is "No longer supported." with a full stop (`Core/src/Abstractions/WellKnownDirectives.cs:61`), which neither edition has. It also adds fields and arguments (`builtinAdditions`, informational): `__Type.oneOf`, `__InputValue.isDeprecated` and `deprecationReason`, `includeDeprecated` on `__Field.args` and `__Directive.args`, and `__Directive.onOperation`, `onFragment` and `onField`, which the spec dropped long ago.
- **`deprecation` (4 results):** `@deprecated` without a reason gives "No longer supported." for the same reason.
- **`defaultValue` (3 results):** a default of `null`, as in `f(n: Int = null)`, is introspected as `null`, as if there were no default (`__InputValue.cs:80` checks `IsNull()`, which is true for the null literal). It should be `"null"`.
- **`specifiedByURL` and `builtinDirectives` (`scalars`):** `scalar Date @specifiedBy(url: …)` gets its URL, but `@specifiedBy` isn't in `directives`. `ScalarType` registers the directive only if its own `SpecifiedBy` is set when its dependencies are registered (`Core/src/Types/Types/Scalars/ScalarType.Initialization.cs:53-58`). The SDL's URL is set later, by `SchemaFirstTypeInterceptor` (`Core/src/Types/Types/Factories/SchemaFirstTypeInterceptor.cs:27-35`).
- **`descriptions` (6 results):** `"A date" scalar Date` is described as Hot Chocolate's own `Date` scalar ("The `Date` scalar represents an ISO-8601 compliant date type."). Hot Chocolate skips scalar definitions and resolves `Date` to its `DateType`.
- **`directives` (`rich`):** the schema's own `@tag` directive is missing, as in validate.

Every other check passes: types, kinds, fields, arguments, input fields, enum values, interfaces, wrapper types, `__typename` and `__type(name:)`.
