# Hot Chocolate adapter

A [graphql-tla adapter](../../docs/conformance.md) for [Hot Chocolate](https://github.com/ChilliCream/graphql-platform) 15.1 (.NET 8). It answers every area of the kit: execution, and `parse`, `validate`, `coerce`, `schema`, `introspect` and `coordinate` ([docs/kit-areas.md](../../docs/kit-areas.md)).

For each `execute` it builds a request executor from the SDL (cached by SDL) with `AddGraphQL().AddDocumentFromString(sdl)`, and installs:

- one global field middleware (`UseField`) on every non-introspection field, which sends `call` and awaits the kit's `settle`;
- a type interceptor that sets `IsOfType` on every object type, so abstract types resolve to the type the kit named, and gives each subscription field a subscribe resolver: the kit's source stream with `stream`, otherwise a stream of one event.

The response is the executor's result serialized with Hot Chocolate's JSON result formatter (`ToJson`).

Source references below are to Hot Chocolate at tag `15.1.21`, under `src/HotChocolate/`: `Core/src/...`, `Language/src/...` and `AspNetCore/src/...`.

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
node kit/cli.mjs run coordinate --adapter "adapters/hotchocolate/run.sh" --strict
```

`run.sh` uses `$DOTNET_ROOT/dotnet` if `DOTNET_ROOT` is set, otherwise `dotnet` from `PATH`. It passes its arguments on:

- `--idle` claims `idle` in execution (below).
- `--introspection-list-depth N` raises Hot Chocolate's introspection depth limit, which rejects the kit's introspection query by default (see [Introspect](#introspect-the-kits-query-is-rejected-by-default)).

## Execution

Capabilities: `invalid-results`, `uncoercible-results`, `mutation`, `subscription`, `subscription-stream`, `parent-values`, `custom-scalar-results`, `scalar-results`. Not claimed:

- `deferred-items`: Hot Chocolate completes a list from an `IEnumerable` and doesn't await its items, so items come inline.
- `error-propagation-off`: Hot Chocolate 15 has no switch that disables null propagation for a request. `EnableSemanticNonNull` rewrites the schema instead, and skips `id` fields, mutation fields and the `Node` interface.
- `idle`: resolvers run on the thread pool, so by default the kit waits `--grace` ms (50 ms is plenty: after warm-up the next call arrives within about 1 ms of a settle, worst seen about 20 ms).

`run.sh --idle` claims `idle` anyway, based on thread-pool quiescence (no queued work, no busy worker, no work completed over several samples). That depends on how the .NET runtime schedules Hot Chocolate's work, not on anything Hot Chocolate promises, so it is opt-in. A `call` or `response` sent after `idle` is reported on stderr (none were in a full run, and the kit's determinism replay passed).

Every `call` carries `after`, the number of settles the execution had applied, so `calledSerially` is conclusive for mutations in both modes.

- **`scalar-results`:** a leaf outcome's `value` is what the resolver returns, as a .NET `int`, `long` or `double`. Hot Chocolate's own result coercion then decides: the ID serializes the integer as a string, and an Int outside 32 bits is an execution error.
- **`custom-scalar-results`:** Hot Chocolate skips `scalar` definitions in SDL (see [Other areas](#other-areas)), so the application registers each custom scalar. In execution it is `KitScalarType`, Hot Chocolate's `AnyType` under the SDL's name, whose `TrySerialize` also refuses one marker value, the resolver's return for `uncoercible`. That makes Hot Chocolate's leaf completion raise its usual execution error (`ValueCompletion.Leaf.cs` catches the `SerializationException`).
- **`parent-values`:** the `execute`'s `initialValue` is the request's root value (`WellKnownContextData.InitialValue`), objects carry the kit's tokens, and each call reports the token of `IResolverContext.Parent`. At a subscription's root, Hot Chocolate's parent is still the operation's root value; it hands the root field's resolver the event as the *event message* (`GetEventMessage`, or an `[EventMessage]` parameter), and the resolver `[SubscribeAndResolve]` gives a field returns that message as the field's value (`Core/src/Types/Types/Attributes/SubscribeAndResolveAttribute.cs:46-49`). So Hot Chocolate is an engine where the event is the root field's value, and the root call reports the event message's token, as [docs/conformance.md](../../docs/conformance.md) prescribes under `parent`. `parentValue` grades the calls below a subscription's root.
- **`subscription-stream`:** the subscribe resolver returns `KitSource`, an `ISourceStream` fed by the kit's `source` messages (`fail` throws from the enumerator). The response stream is read the way Hot Chocolate's websocket transport reads it (`AspNetCore/src/AspNetCore/Subscriptions/OperationSession.cs:69-80`): `ReadResultsAsync().WithCancellation(token)`, each result a `response`, then the stream is disposed, and its end is `done` (or `stream-error` if reading threw). `cancel` cancels that token. Hot Chocolate cancelling or disposing the source before it completed or failed is reported as `source-cancelled`, once. A source that fails ends as Hot Chocolate makes it end: `SubscriptionExecutor` catches the error, yields one result with it, and completes, which the kit accepts as `failsWithSource`. If the executor answers a streamed subscription with a single result instead of a stream (a request error), that result is the one `response`.

## Other areas

[`Areas.cs`](Areas.cs) answers them on the thread that reads stdin, one request at a time, and never sends `idle`, which only execution uses.

Every area but parse builds the schema the same way, with Hot Chocolate's default options: `AddGraphQL().AddDocumentFromString(sdl)`, then the request executor. Execution changes some options to keep the schema exactly as the kit wrote it (`EnableOneOf = false`, `RemoveUnreachableTypes = false`). The areas don't, since they ask what Hot Chocolate itself does with the SDL. Two things are needed for any SDL:

- Hot Chocolate refuses to build a schema with a field that has no resolver ("The field `Query.a` has no resolver"). So every field gets the same field middleware in every area, though it only runs in coerce. It returns `"ok"` for a leaf, an object for a field of an object type, and two objects for a list of objects (`nested-fields`). Every subscription root field also gets a subscribe resolver, without which `SubscriptionExecutor` throws.
- Hot Chocolate skips `scalar` definitions in SDL. `SchemaSyntaxVisitor` keeps only their directives (`Core/src/Types/Types/Factories/SchemaSyntaxVisitor.cs:152-161`). It resolves a scalar by name instead: a built-in one, or one of its own, such as `Date`, `JSON` or `Long` (`Core/src/Types/Types/Scalars/Scalars.cs:39-64`). Any other name has to be registered by the application, or the build fails with "Unable to resolve type reference". The adapter registers Hot Chocolate's `JsonType` under each such name (`Json`, `Plain`, `A`, ...). `JsonType` is the scalar Hot Chocolate provides for arbitrary values, and its `IsInstanceOfType` accepts every literal (`Core/src/Types/Types/Scalars/JsonType.cs:42-43`). `AnyType` would not do: it rejects enum literals (`AnyType.cs:48-68`).

### parse

Capabilities: `parse-sdl`.

An executable source is read the way a Hot Chocolate server reads a request. The request body `{"query": <source>}`, with the source's JSON string exactly as the kit sent it, goes through a `Utf8GraphQLRequestParser` made as a server makes it: with the application's `ParserOptions`, `IDocumentCache` and `IDocumentHashProvider`. That parser unescapes the JSON string with `Utf8Helper.Unescape` and parses the result with `Utf8GraphQLParser` (`Language/src/Language.Web/Utf8GraphQLRequestParser.cs:265-300`). The parser also reads the type system language, so every definition must be an operation or a fragment. With a document cache, an empty query is left unparsed, so the request has neither a document nor an id, a `SyntaxException` ("NoIdAndNoQuery").

A source with a `grammar` is read the way `AddDocumentFromString` reads a schema's SDL: `Utf8GraphQLParser.Parse(string)`, with the default options. The parser reads every kind of definition into one document, so the answer is whether every definition is of a kind the grammar allows (`ITypeSystemDefinitionNode`, `ITypeSystemExtensionNode`). Its default limits (`ParserOptions`: a recursion depth of 200, 2048 fields, 4 directives per location; `Language/src/Language.Utf8/ParserOptions.cs:36-49`) throw `SyntaxException`, so the kit's crash probes are answered `ok: false`, none crash.

A `SyntaxException` is `ok: false`. The parser also throws other exceptions on some sources: `Utf8EncodingException` (which isn't a `SyntaxException`), `IndexOutOfRangeException` and `ArgumentException` (below). `DocumentParserMiddleware` only catches `SyntaxException`, so on a server such an exception reaches the request pipeline's exception middleware, and the request fails without a syntax error. The adapter answers these with an `error`, which the kit reports as a crash ([docs/kit-areas.md](../../docs/kit-areas.md#protocol)), and writes the stack trace to stderr.

A source holding a lone surrogate reaches Hot Chocolate this way, as it does on a server: the kit's request escapes it (`\ud800`), and `Unescape` decodes the escape (see [Parse](#parse-1) for what it does with it). The adapter never answers `unsupported`.

### validate

The executor's `IDocumentValidator`, from the application's `IDocumentValidatorFactory` as `DocumentValidationMiddleware` gets it, called as that middleware calls it: Hot Chocolate's default rules, on the document `Utf8GraphQLParser` parses with the request parser options. A document Hot Chocolate can't parse is a crash on that vector (the kit's validate vectors all parse). Capabilities: `custom-scalar-literals`, from `JsonType` above, and `custom-directives` (validate and introspect): Hot Chocolate builds the SDL's `directive @label(...) on ...` definitions and knows them.

The kit gives a valid schema, but Hot Chocolate refuses one of them: the differential schema's interface `Resource`, which no object type implements. That breaks Hot Chocolate's `InterfaceHasAtLeastOneImplementationRule` (see [Schema](#schema-1)). That rule, like every schema validation rule, only runs with `StrictValidation`, and nothing in document validation or execution reads that option. So when the default build throws a `SchemaException` whose every error is that rule's ("There is no object type implementing interface `Resource`.", code `SCHEMA_INTERFACE_NO_IMPL`), the adapter builds the schema again with `StrictValidation = false`, and says so on stderr. Only the differential schema needs it. Any other `SchemaException` isn't retried: it is answered with an `error`, a crash on the vector.

### coerce

The request is what a client sends to a Hot Chocolate server. The body `{"query", "operationName", "variables", "extensions"}`, with the kit's document, variables and extensions as JSON text, goes through the server's `Utf8GraphQLRequestParser` (parser options, document cache and hash provider from the application's services, as `DefaultHttpRequestParser` makes it). A `SyntaxException` there is answered as the HTTP middleware answers it: `OperationResultBuilder.CreateError` with the exception's message and location and the code `HC0011` (`ErrorCodes.Server.SyntaxError`), and no calls. That covers a document that doesn't parse and an empty one. Otherwise the parsed request goes to `IRequestExecutor.ExecuteAsync` (`OperationRequestBuilder.From`), and a document with only type definitions is refused there, by Hot Chocolate. A subscription's response is the first result of the response stream, which is then closed.

The field middleware records the field's path and the arguments Hot Chocolate coerced, read with `context.ArgumentValue<object?>` for every argument the field declares. That is how the resolver compiler reads a resolver method's parameters. An argument that fails to coerce throws there, before the call is recorded, as it would before a resolver method's body ran.

Capabilities:

- `exact-numbers`: the request parser turns each JSON value into a GraphQL literal and keeps a number's text as it is (`Language/src/Language.Web/Utf8GraphQLRequestParser.Syntax.cs:97-111`). 2^53 + 1 stays `9007199254740993`.
- `nested-fields`: see the field middleware above.
- `subscription-source`: the subscribe resolver records the field and its coerced arguments (`sourceCalls`), then returns a source stream of one event, or throws a `GraphQLException` when the request's `subscribe` is `raise`. Hot Chocolate turns that into the response's error.
- `request-extensions`: the request's `extensions` are part of the body the request parser reads.
- Not `absent-vs-null`: Hot Chocolate gives a resolver every declared argument. A variable with no value is replaced by the argument's default or by the literal `null` (`Core/src/Execution/Processing/VariableRewriter.cs:280-286`), and nothing records that it was missing (`Core/src/Execution/Internal/ArgumentCoercionHelper.cs:84-98` keeps `IsDefaultValue` false). Input objects become dictionaries with an entry for every field (see [Coerce](#coerce-1) for the values it puts there). So a resolver can't tell a variable with no value from one set to null.
- Not `unvalidated`: `OperationResolverMiddleware` compiles an operation only when the request context holds a passing validation result, and otherwise ends the request (`Core/src/Execution/Pipeline/OperationResolverMiddleware.cs:34`, `:57-60`). Executing without validation would mean faking that result.

### schema

Capabilities: `schema-extensions`. The request executor is built from the SDL, extensions included, which builds and validates the schema. `SchemaSyntaxVisitor` applies object, interface, union, enum and input object extensions to their types; it skips scalar extensions as it skips scalar definitions, keeps a schema extension's directives but not its operation types, and the parser can't read directive extensions or directives on directive definitions (September 2026). Those are deviations, below. Hot Chocolate rejects a schema by throwing `SchemaException`, and a syntax error in the SDL is a `SyntaxException`. Those are `valid: false`. Any other exception is a crash, and gets an `error` answer.

### introspect

The request executor is built, and the kit's query executed against it and serialized with `ToJson`. A schema that doesn't build is answered with a response that has only `errors`. So is a query that doesn't parse: Hot Chocolate's own request error, without `data`.

### coordinate

Hot Chocolate has a schema coordinate API: `SchemaCoordinate.Parse` reads a coordinate with `Utf8GraphQLParser`'s `ParseSchemaCoordinate`, and `ISchema.TryGetMember` resolves it in a schema (`Core/src/Types/Extensions/SchemaExtensions.cs:51-200`). The adapter parses with the first, resolves in the schema the SDL builds with the second, and reports the element's kind and path from the class `TryGetMember` returns and the names of what declares it. A `SyntaxException` is `ok: false`.

Hot Chocolate has two resolvers: `TryGetMember`, which returns `false` whenever no element is found, and `GetMember`, which throws `InvalidSchemaCoordinateException` whenever no element is found. Neither tells a missing element from a missing container, as §2.14 does (no element, or an error). The adapter uses `TryGetMember`, so it never answers with `error` (see [Coordinate](#coordinate-1)).

## Results

From full runs with `--strict` (`run.sh --idle --introspection-list-depth 2`; execution with `--random 1500 --seed 1`), against the kit of 15 November 2026:

| Area | Result |
| --- | --- |
| execution | 29728 cases, 5558 distinct, 36 subscription streams. 4297 of the 5558 distinct well-formed cases satisfy the reference; 321 cases are malformed: 317 under `intFraction` and 4 stream cases under `nothingAfterCancel`. Failing: `nullsExplained` (MUST, 153 cases), and in the `ordering` fixture `keyOrder` (SHOULD, 1110) and `errorLocationsAccurate` (SHOULD, 559). `parentValue` passes. `noPropagation` is skipped. |
| parse | 2338 of 2847 vectors agree, and 27 crash. 24 of 51 checks fail; `ignoredTokens` fails on 352 vectors, all through the byte order mark. |
| validate | 3258 of 3354 vectors agree, and 16 crash (13 unspecified not graded). `valuesOfCorrectType`, `singleRootField`, `fieldSelectionMerging`, `leafFieldSelections`, `executableDefinitions`, `descriptionsInert` and `acceptsValid` fail. |
| coerce | 2012 of 2139 vectors match (80 skipped: they need `absent-vs-null` or `unvalidated`), none crash. 12 checks fail: `int`, `list`, `inputObject`, `oneOf`, `stringValue`, `descriptionsInert`, `syntaxError`, `acceptsValid` and `fieldErrorPath` (MUST), `idCoerced` and `onlyValidExecuted` (SHOULD), and the informational `loneSurrogates`. |
| schema | 370 of 490 schemas agree, and 2 crash (5 unspecified not graded). 32 of 64 checks fail. |
| introspect | Graded against September 2025 (both newer queries ask for `__Type.isOneOf`, which Hot Chocolate names `oneOf`): 21 of 61 results pass, 3 more fail only a SHOULD or informational check, and 3 aren't graded (their SDL needs September 2025's lexical grammar). 9 checks fail. Without `--introspection-list-depth 2`, both queries are rejected. |
| coordinate | 163 of 203 vectors agree, and 3 crash. `grammar`, `noIgnored`, `missingContainers` and `resolvesDirectives` (MUST) and `builtinDirectives` (SHOULD) fail. |

## Known Hot Chocolate deviations

Each one below was reproduced with plain Hot Chocolate 15.1.21: `AddGraphQL().AddDocumentFromString(sdl)` with one field middleware, default options, and requests through `IRequestExecutor.ExecuteAsync`, or the named API.

### Execution: a null at a Non-Null list item nulls the list without an error (`nullsExplained`, MUST)

When a list's item type is Non-Null and an item resolves to null, Hot Chocolate nulls the list (or the nearest nullable position) but adds no error. §6.4.3 completes each item with the item type, and a null at a Non-Null position must raise an execution error (§6.4.4), which graphql-js reports at the item's path, such as `["posts", 0]`:

```
call posts; call tags; settle posts = list(1); call posts.0; settle posts.0 = null; settle tags = list(0)
response: {"data":{"posts":null,"tags":[]}}
```

In Hot Chocolate 15.1.21:
- `Execution/Processing/ValueCompletion.cs` returns null for a null result without reporting anything.
- `ValueCompletion.List.cs` `TryCompleteElement` then returns `list.IsNullable`, so the list is nulled silently.
- The "Cannot return null for non-nullable field" error is only recorded for fields, in `Tasks/ResolverTask.CompleteValue.cs` (`AddNonNullViolation`).

### Execution: a fraction returned for an Int is rounded (`intFraction`, MUST)

A resolver that returns `1.2` for an `Int` field gives `1`, not an execution error. Hot Chocolate converts the double with `Convert.ToInt32` (`Core/src/Execution/Processing/ValueCompletion.Leaf.cs:26-30`, `Core/src/Types/Utilities/DefaultTypeConverter.Setup.cs:317`), which rounds half to even: `1.5` gives `2`, and `2.5` gives `2`. §3.5.1 allows coercing a non-integer value only "without losing information", otherwise an execution error must be raised. The kit counts these cases as malformed (317, in `leaves` and `unions`). A plain server shows the same: with `type Query { count: Int ratio: Float }` and resolvers returning `1.2` and `double.PositiveInfinity`, `{ count ratio }` gives `{"data":{"count":1,"ratio":null}}`, with an error only for `ratio`. A non-finite Float is rejected, as §3.5.2 requires.

### Execution: a skipped first occurrence fixes a field's position and location (`keyOrder` and `errorLocationsAccurate`, SHOULD)

In the `ordering` fixture, `query { foo @skip(if: true) bar ... { foo } ... }` answers `{"foo":…,"bar":…}`; CollectFields skips the first `foo`, so `bar` comes first (§6.3.2, the §3.6 example). An error at `foo` has the location of the skipped selection (line 2, column 3), not of the one that was executed. `OperationCompiler.ResolveField` adds a response name to the selection set at its first occurrence, whatever its include condition, and merges later occurrences into it; `@skip` and `@include` are only evaluated per request, as include flags (`Core/src/Execution/Processing/OperationCompiler.cs:410-470`). 1110 cases fail `keyOrder` and 559 `errorLocationsAccurate`, all in `ordering`.

### Execution: a result after the client cancelled (`nothingAfterCancel`, MUST)

When the client cancels the response stream while an event is executing, the event's result still arrives: `ReadResultsAsync` yields it although its cancellation token was cancelled (4 stream cases, `subscription` and `subscriptionAlias`). Hot Chocolate's websocket transport sends such a result too: it reads with `WithCancellation(ct)` and sends each result with the session's token, not the operation's (`AspNetCore/src/AspNetCore/Subscriptions/OperationSession.cs:69-80`).

### Parse

The lexer is `Language/src/Language.Utf8/Utf8GraphQLReader.cs`, and string escapes are decoded later, by `Utf8Helper.Unescape`, when the parser reads a string's value. Every failure is a MUST.

- **A byte order mark after the start is rejected (352 vectors, `ignoredTokens`).** Each of them passes with the mark replaced by a space. `{a﻿b}` gives "Unexpected character `ï` (239)". §2.1.6 makes U+FEFF ignored anywhere. The reader skips it only at position 0 (`Utf8GraphQLReader.cs:113-116`, `SkipBom` at `:736-751`). A source that is only a byte order mark, or one followed by a comment, parses to an empty document and is accepted (3 vectors, `document` and `comments`).
- **Raw control characters in comments and strings are rejected (22 vectors, `sourceText`, since September 2025).** September 2025 makes every Unicode scalar value a source character, so `{a #\u0000\n}`, `{a#\f\nb}` and `{a(x: "\u0001")}` with the control character raw are valid. `ReadCommentToken` stops at every C0 control character but tab (`Utf8GraphQLReader.cs:455-500`), and the character then starts no token; strings and block strings reject them ("Invalid character within String", `:560-591`, `:684-687`).
- **U+007F is rejected (2 vectors, `comments` and `stringValue`).** DEL is a source character in every edition, but `{a #␡\n}` and `{a(x: "␡")}` are rejected, by the same code.
- **Block strings decode escape sequences (4 vectors, all crashes, `stringValue`).** In a block string only `\"""` is an escape, but `Unescape` treats every backslash as one when `isBlockString` is true (`Language/src/Language.Utf8/Utf8Helper.cs:24-41`, `:85-95`). `"""\n"""` becomes a newline, and `"""\	"""` throws `Utf8EncodingException: The escape char … is invalid`. The kit reports these as crashes on a source §2.10.4 accepts.
- **Malformed escapes crash instead of failing to parse (12 vectors, crashes, `stringValue`).** `"\u004"` and `"\u00"` throw `IndexOutOfRangeException`, since `Unescape` reads four bytes after `\u` without a bounds check (`Utf8Helper.cs:45-51`). An unpaired low surrogate, such as `"\uDEAD"`, throws `Utf8EncodingException` (`:62-68`).
- **Variable-width escapes and trailing surrogates (8 vectors accepted, `stringValue`).** `Unescape` always reads four hex digits after `\u`, with no check that they are hex digits, so `"\u{110000}"`, `"\u{D800}"` and the unterminated `"\u{1F4A9"` are accepted. `"\uD83D"`: `Unescape` keeps the high surrogate pending and never checks it at the end of the string, so it is dropped (`Utf8Helper.cs:52-59`).
- **Lone surrogates in the source (11 vectors, `sourceText`).** The request parser decodes the `query` string with `Unescape` (`Utf8GraphQLRequestParser.cs:265-300`), which keeps a high surrogate pending and drops it if no low surrogate follows (`Utf8Helper.cs:53-61`). 3 are accepted: `{a\ud800b}` parses as `{ ab }`, two names merged into one; `{a\t\ud800b}` and `{a\n\ud800b}` parse as `{ a b }`. 8 crash: a lone low surrogate, or a high surrogate followed by something other than a low one, throws `Utf8EncodingException` (`Utf8Helper.cs:56-80`), for example `{a\ud800\v\nb}`.
- **Descriptions on variable definitions are rejected (21 vectors, `descriptions`, since September 2025).** Descriptions on operations and fragments parse, but `ParseVariableDefinition` doesn't read one (`Language/src/Language.Utf8/Utf8GraphQLParser.Operations.cs:119-128`).
- **A description before the `{ … }` shorthand, or before an extension, is accepted (6 vectors, `descriptions` and `typeSystemDescriptions`).** `"d" {a}` and `"d" extend schema @d`: `ParseDefinition` reads a description before any definition (`Utf8GraphQLParser.cs:91-97`, `:157-160`).
- **Empty lists and bodies are accepted (23 vectors).** `{a()}`, `{a @d()}`, `query () {a}`, `{a(,)}`, `query (,) {a}`, `type T { f(): Int }` and `directive @d() on FIELD` (`arguments`, `variables`, `insignificantCommas`, `argumentsDefinition`, `directiveDefinition`): the parser loops "until `)`", so zero items pass (`Utf8GraphQLParser.Operations.cs:91-105`, `:266-281`). `type T {}`, `interface I {}`, `input I {}`, `enum E {}`, `schema {}`, `extend type T @d {}`, `extend type T implements I {}`, `extend enum E @d {}` and `extend schema @d {}` (`objectDefinition`, `interfaceDefinition`, `inputObjectDefinition`, `enumDefinition`, `schemaDefinition`, `objectExtension`, `enumExtension`, `schemaExtension`) likewise.
- **`null`, `true` and `false` as enum values (14 vectors, `enumValue`).** `enum E { null }` and `extend enum E { true }` are accepted: `ParseEnumValueDefinition` reads any name (`Utf8GraphQLParser.TypeDefinition.cs:437-443`). §2.10.6 excludes them.
- **`extend interface I implements J` without a body is rejected (6 vectors, `interfaceExtension`).** `ParseInterfaceTypeExtension` throws unless the extension has directives or fields, and doesn't count the interfaces (`Language/src/Language.Utf8/Utf8GraphQLParser.Extensions.cs:159-174`); §3.7.1 allows an extension that only adds interfaces.
- **September 2026's directive syntax is rejected (20 vectors, `directiveExtension` and `directiveDefinition`).** `extend directive @d @x` and `directive @d @x on FIELD` give "Expected a `on`-token, but found a `At`-token" or "Unexpected token: Name".
- **An empty type system document (4 vectors, `typeSystemDocuments` and `document`).** `# only a comment` parses to a document with no definitions and is accepted. The empty source `""` in a type system grammar crashes: `Utf8GraphQLParser.Parse(string)` throws `ArgumentException` ("The source text mustn't be null or empty", `Utf8GraphQLParser.cs:197-207`), as `AddDocumentFromString("")` does (`Core/src/Types/Extensions/SchemaBuilderExtensions.Document.cs:18-23`), not a `SyntaxException` (3 crashes).

### Validate

Each document below was run through the request executor: the invalid ones execute (or fail only later, during execution), and the valid ones are refused at validation. The rules are in `Core/src/Validation/Rules/`. Every failure is a MUST.

- **§5.6.1 not enforced (28 vectors, 5 since September 2025).** `ValueVisitor` has three gaps:
  - Entering a variable definition, it pushes the variable's named type, dropping every wrapper (`ValueVisitor.cs:91-104`), and then checks the default value against that. So `query Q($v: Int! = null) { … }` is accepted. Variable coercion then fails the request, "Variable `v` is required".
  - Any null literal passes, whatever the type (`ValueVisitor.cs:335`). `{ echo(opt: null) }` with `opt: Int! = 1` is accepted, and fails during execution as a field error.
  - A list literal where an input object is expected stops the visitor with no error (`ValueVisitor.cs:298-318`: `UnexpectedErrorsDetected` and `Break`). `{ echo(filter: [1]) }` executes.
- **§5.8.5: valid documents rejected (10 vectors, `acceptsValid`).** A list-typed variable with a list default is rejected, for the same reason as the first gap above: `query Q($v: [Int!] = [1]) { echo(list: $v) }` gives "The specified value type of variable `v` does not match the variable type". A variable with a non-null default is rejected as a Non-Null list item or input field: `query Q($v: Int = 1) { echo(list: [$v]) }` with `list: [Int!]`. Inside a value, `ValueVisitor` checks a variable's type alone, without the defaults §5.8.5 allows for (`ValueVisitor.cs:415-419`, `IsTypeCompatible` at `:476-512`).
- **A variable inside a custom scalar's literal counts as unused (6 valid vectors rejected, `acceptsValid`).** `query Q($v: Int) { json(value: {a: $v}) }` gives "The following variables were not used: v" (§5.8.4). `VariableVisitor` skips an object field whose parent type isn't an input object (`VariableVisitor.cs:216-228`).
- **§5.2.4.1 not enforced for `@skip` and `@include` (27 vectors, 6 since September 2025).** The subscription rule counts the root selections' response names and ignores directives (`OperationVisitor.cs:100-131`). `subscription { postAdded @skip(if: false) { id } }` is accepted.
- **§5.3.2 not enforced (4 vectors).** `{ node(id: "1") { a: __typename ... on Post { a: name } } }`: with one parent an interface and the other an object type, the names must match. `IsParentTypeAligned` asks for both parents to be non-object types instead of either (`FieldVisitor.cs:328-330`).
- **A selection on `__typename` crashes (3 vectors, `leafFieldSelections`).** `{ __typename { x } }` throws `ArgumentNullException` in `VariableVisitor.Enter`: it pushes the static `__typename` field's type, which is null, and then calls `NamedType()` on it for the inner field (`VariableVisitor.cs:123-131`).
- **An empty selection set counts as none (3 vectors, September 2026).** `FieldVisitor` checks `SelectionSet is null || Selections.Count == 0` (`FieldVisitor.cs:109`), so `barkVolume {}` on a leaf is accepted (`leafFieldSelections`, 2) and `human {}` on an object type is rejected (`acceptsValid`, 1).
- **Documents Hot Chocolate can't parse crash (13 of the 16 crashes).** Descriptions on variable definitions (10, since September 2025; the kit files 8 under `descriptionsInert`) and September 2026's `directive @x @deprecated on FIELD` in an executable document (`executableDefinitions`, 3): see Parse.

### Coerce

- **Invalid documents that pass validation are executed (60 vectors, `onlyValidExecuted`, SHOULD).** These are the validate gaps above: an input object given a list literal (`{ point(v: []) }`) and a null literal for a Non-Null argument or list item. They end as field errors, with `data`.
- **Nullable value-type input fields get a default (10 vectors, `inputObject`, MUST; 3 vectors, `oneOf`, MUST, since September 2025).** `{ settings(v: {}) }` with `input Settings { count: Int ratio: Float enabled: Boolean }` resolves with `{"count":0,"ratio":0,"enabled":false}`, not `{}` (§3.10: "no entry is added"). For a OneOf input, `{ oneOfExample(arg: { a: "abc" }) }` gives `{"a":"abc","b":0}`. The SDL's `Int`, `Float` and `Boolean` have value runtime types, and `InputParser.CreateDefaultValue` fills a missing field without a default with `Activator.CreateInstance(field.RuntimeType)` (`Core/src/Types/Types/InputParser.cs:654-678`). A resolver can't tell that from an explicit `0`.
- **A JSON number with a fraction or exponent isn't an Int or an ID (11 vectors, `int`, MUST; 3, `idCoerced`, SHOULD).** This is a server's behaviour, not only the adapter's: a server reads a request's variables with the same `Utf8GraphQLRequestParser`, which keeps JSON numbers as GraphQL literals, so `1.0` and `1e21` are Float literals (`Utf8GraphQLRequestParser.Syntax.cs:105-111`), and Int and ID accept only Int literals (`Core/src/Types/Types/Scalars/IntegerTypeBase.cs:9`). `query($x: Int) { int(v: $x) }` with `{"x": 1.0}` is a request error, "Int cannot parse the given literal of type `FloatValueNode`". The kit counts JSON `1.0` as an integer (§3.5).
- **Nested list items aren't wrapped (11 vectors, `list`, MUST).** `{ matrix(v: [1]) }` for `[[Int]]` fails, "The item syntax node for a nested list must be `ListValue`" (`Core/src/Types/Types/InputParser.cs:152-160`), as a field error at `["v", 0]`. §3.11's prose coerces it to `[[1]]`; Hot Chocolate follows October 2021's non-normative example table.
- **Valid documents refused at validation (12 vectors, `acceptsValid`, MUST).** The §5.8.5 over-strictness above, such as `query($x: Int = 1) { intsNN(v: [1, $x]) }`.
- **A null variable for a Non-Null argument gives a field error at the argument's path (7 vectors, `fieldErrorPath`, MUST).** `query($x: Int = 3) { intNN(v: $x) }` with `{"x": null}` gives `{"errors":[{"message":"Cannot accept null for non-nullable input.","path":["v"],…}],"data":{"intNN":null}}`. The path is `["v"]`, not `["intNN"]`. The input parser builds the error with the path inside the argument (`Core/src/Types/Utilities/ThrowHelper.cs:290-305`), and `EnsurePathAndLocation` only adds the field's path to an error that has none (`Core/src/Execution/Processing/MiddlewareContext.Global.cs:137-145`). The check only happens when the resolver reads the argument (`ArgumentCoercionHelper.cs:69-101` has no Non-Null check).
- **Block string values (4 vectors, `stringValue`, MUST).** `StringHelper.TrimBlockStringToken` (`Language/src/Language.Utf8/StringHelper.cs:28-122`) counts whitespace-only lines toward the common indentation, and removes leading and trailing lines only when they are empty, not when they hold only whitespace, keeping one trailing line: `"""\n    a\n  \n    b\n"""` gives `"  a\n\n  b"`, and `"""\n\n  x\n\n"""` gives `"x\n"`. With the escapes Parse describes, `"""a\nbA"""` gives `"a\nbA"`.
- **Syntax (4 vectors, MUST).** `"d" { int(v: 1) }` executes (`syntaxError`), and a description on a variable definition is a syntax error (`descriptionsInert`, 3, since September 2025): see Parse.
- **A lone surrogate is dropped (2 vectors, `loneSurrogates`, informational).** `{"x": "\ud800"}` gives the string `""`: `Unescape` keeps the high surrogate pending and never writes it. A server reads variables the same way.

### Schema

All verdicts were reproduced with a plain `BuildRequestExecutorAsync`. The type system rules are in `Core/src/Types/Configuration/Validation/`. Every failure is a MUST unless marked.

- **An interface with no implementation is rejected (9 valid schemas, `acceptsValid`).** "There is no object type implementing interface `A`" (`InterfaceHasAtLeastOneImplementationRule.cs:66`) for `interface A { x: Int } type Query { a: A }`. The spec allows such an interface.
- **September 2026's directive syntax doesn't parse (12 valid schemas, `acceptsValid`).** `directive @d on DIRECTIVE_DEFINITION` ("Unexpected token: Name") and `directive @d @deprecated on FIELD`.
- **Crash (2 schemas, `implementsInterfaces`):** `type O { a: Int } type Query implements O { a: Int }` throws `NullReferenceException` in `ObjectType.OnCompleteFields`. Hot Chocolate first reports that it can't resolve the interface, stores `null` for it and goes on (`CompleteInterfacesHelper.cs:28-38`), then dereferences the `null` (`ObjectType.Initialization.cs:117-119`).
- **Extensions:** none of §3's extension rules is enforced. A field, value or member an extension adds again is merged or kept (`extensionItemsNew` 7, `extensionItemsUnique` 5, `extensionInterfacesNew` 2: `type Query { a: Int } extend type Query { a: Int }`); an extension of an undefined type is dropped (`extensionTargetDefined` 6: `extend enum E { B }`) and one of the wrong kind too (`extensionTargetKind` 1: `extend scalar Query @d`); a non-repeatable directive applied again by an extension is accepted (`extensionDirectivesNotReapplied` 7); `extend input In @oneOf` is accepted (`extensionOneOf` 2). Scalar extensions are skipped, as scalar definitions are (`specifiedByNotBuiltin` 2: `extend scalar Int @specifiedBy(…)`), and a schema extension's operation types are ignored (`rootTypesAreObjects` 1: `extend schema { mutation: M }` with `M` an input object).
- **Definitions dropped silently:** `enum Boolean { YES NO }` (`typeNameNotBuiltin` 3): `RemoveBuiltInTypes` removes every definition named like a built-in type before the SDL is read (`Core/src/Types/SchemaBuilder.Setup.cs:152`). `scalar A scalar A` (`typeNamesUnique` 1): scalar definitions are skipped (above). A second `schema { … }` (`schemaDefinitionUnique` 2).
- **Duplicates merged or kept:** `implements I & I` (`implementsUnique` 2, `CompleteInterfacesHelper.cs:35`), `union U = Query | Query` (`unionMembersUnique` 2), and `enum E { A A }` (`enumValuesUnique` 1), which introspection returns with `A` twice.
- **Interfaces:** `interface A implements A` is accepted when an object implements `A` (`implementsItself` 1): there is no check that an interface doesn't implement itself (`TypeValidationHelper.cs:139-179`). A missing transitive interface is added instead of refused (`implTransitive` 1): `InterfaceCompletionTypeInterceptor` adds it before the check (`TypeValidationHelper.cs:158-161`). `interface I implements J { b: Int }` without `J`'s field `a` is accepted (`implFieldProvided` 1).
- **`@deprecated` on a type is accepted (5 of the 6 `directiveLocationsValid` vectors):** `type Query @deprecated { a: Int }`, and the same on an interface, union, enum and input object. A directive on a directive definition's argument isn't checked either: `directive @e(x: Int @d) on FIELD` with `@d` on `FIELD_DEFINITION`.
- **No check:** names starting with `__` for types and enum values (`typeNameReserved` 6, `enumValueNameReserved` 1), the same type for two roots (`rootTypesDifferent` 4), deprecation of an implementing field (`implDeprecation` 2), default values that don't coerce (`argDefaultCompatible` 14: `f(x: Int = "1")`), input object cycles through OneOf objects (`inputObjectUnbreakableCycle` 3) and through default values (`inputObjectDefaultValueCycle` 4), and directives that reference themselves (`directiveUsesItself` 2, `directiveReferencesItselfIndirectly` 3). Informational: `@deprecated @deprecated` (`directiveNotRepeated` 1) and unknown arguments to an applied directive (`appliedDirectiveArguments` 4: `@deprecated(why: "x")`).

### Introspect: the kit's query is rejected by default

With default options, every introspection query of the kit is rejected at validation: "Maximum allowed introspection depth exceeded." The kit's `wrappers` selection asks for `__Type.fields` of a field's type, so a path selects `__Type.fields` twice. `IntrospectionDepthVisitor` allows each of `fields`, `inputFields`, `interfaces` and `possibleTypes` once per path by default (`Core/src/Validation/Rules/IntrospectionDepthVisitor.cs:11-18`, `ValidationOptions.cs:14`). `run.sh --introspection-list-depth 2` configures the executor with `SetIntrospectionAllowedDepth(16, 2)`, Hot Chocolate's own setting for this.

Then September 2026's and September 2025's queries are still rejected, since Hot Chocolate names the field `__Type.oneOf`, not `isOneOf` (`Core/src/Types/Types/Introspection/__Type.cs:85-90`, `:191`). The kit asks September 2025's query without it and grades against September 2025 (7 vectors new in September 2026 aren't asked). Then:

- **Built-in definitions (`builtinDefinitions`, MUST, 37 results; `builtinNullability`, SHOULD, 36; `builtinAdditions`, informational, 36):** `__Type.isOneOf` is missing (named `oneOf`). `@deprecated(reason:)` is `String`, as October 2021 has it, not `String!`, and its default is "No longer supported." with a full stop (`Core/src/Abstractions/WellKnownDirectives.cs:61`). Hot Chocolate adds `__Type.oneOf` and `__Directive.onOperation`, `onFragment` and `onField`, which the spec dropped long ago.
- **`specifiedByURL` (MUST, 3) and `builtinDirectives` (SHOULD, 4), `directives` (MUST, 4):** `scalar Odd @specifiedBy(url: "https://example.com/a?b=c&d=%20#x")` introspects as `https://example.com/a?b=c&d= #x`: the URL is stored as a `Uri` (`Core/src/Types/Types/Factories/SchemaFirstTypeInterceptor.cs:32`) and returned with `Uri.ToString()`, which unescapes it (`__Type.cs:167-169`). `@specifiedBy` itself isn't in `directives`: `ScalarType` registers the directive only if its own `SpecifiedBy` is set when its dependencies are registered (`Core/src/Types/Types/Scalars/ScalarType.Initialization.cs:53-58`), and the SDL's URL is set later, by `SchemaFirstTypeInterceptor`. A type system directive the schema defines but never applies, such as `directive @a on SCHEMA`, is removed (`RemoveUnusedTypeSystemDirectives`, on by default; `Core/src/Types/Types/Directives/DirectiveTypeInterceptor.cs:34-37`).
- **`descriptions` (SHOULD, 6):** block-string descriptions keep part of their indentation, through `TrimBlockStringToken` (see Coerce): `"""\n      A field with\n    a block description\n  """` gives `"    A field with\n  a block description"`. A scalar's description is lost, since scalar definitions are skipped, and `Date` gets Hot Chocolate's own ("The `Date` scalar represents an ISO-8601 compliant date type.").
- **`defaultValueOmitted` (SHOULD, 3):** a default of `null`, as in `f(n: Int = null)`, is introspected as `null`, as if there were no default (`Core/src/Types/Types/Introspection/__InputValue.cs:80` checks `IsNull()`, which is true for the null literal).
- **`defaultValuePrinting` (SHOULD, 3):** a printed string default holds control characters other than `\b`, `\f`, `\n`, `\r` and `\t` raw, unescaped (`Language/src/Language.SyntaxTree/Utilities/SyntaxWriterExtensions.cs:184-230`).

### Coordinate

- **Ignored tokens are accepted (23 vectors, `noIgnored`, MUST).** `SchemaCoordinate.Parse` reads a coordinate with the GraphQL lexer, which skips whitespace, commas, comments and the byte order mark (`Language/src/Language.Utf8/Utf8GraphQLParser.SchemaCoordinate.cs`), so `" Business"` resolves to the type `Business`. §2.14 allows no Ignored token anywhere.
- **A missing container is no element, not an error (11 vectors, `missingContainers`, MUST).** `root.me` where the schema has no type `root`: `TryGetMember` returns `false` for any part it doesn't find, and `GetMember` throws for any of them (`Core/src/Types/Extensions/SchemaExtensions.cs:51-200`), so neither tells §2.14's two answers apart. The kit also notes 10 vectors where the prose's "no element" holds (`containerKind`, informational).
- **Crashes (3 vectors, `grammar`, MUST).** `""` throws `ArgumentException` ("The source text mustn't be null or empty", `Utf8GraphQLParser.Syntax.cs:258`); `Query(criteria:)` throws `ArgumentException` from the `SchemaCoordinateNode` constructor ("A argument name without a member name is only allowed on directive coordinates"), which the parser calls before checking the grammar; `Business.` throws `IndexOutOfRangeException` in `Utf8GraphQLReader.Read`. Each should be a syntax error.
- **Directives the schema doesn't keep (1 vector, `resolvesDirectives`, MUST; 2, `builtinDirectives`, SHOULD).** `@cached`, defined but never applied, is removed (see Introspect), and `@specifiedBy` isn't registered.
