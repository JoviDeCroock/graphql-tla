# graphql-dotnet adapter

A [graphql-tla adapter](../../docs/conformance.md) for [graphql-dotnet](https://github.com/graphql-dotnet/graphql-dotnet) 8.8.5 (the `GraphQL` NuGet package, .NET 8), with `GraphQL.SystemTextJson` 8.8.5. graphql-dotnet parses with [GraphQL-Parser](https://github.com/graphql-dotnet/parser) 9.5.0.

Source references below are to graphql-dotnet at tag `8.8.5` (`src/GraphQL/...`) and GraphQL-Parser at tag `9.5.0` (`src/GraphQLParser/...`).

## Build

Needs the .NET 8 SDK.

```shell
cd adapters/graphql-dotnet
dotnet build -c Release
```

`bin/` and `obj/` are gitignored.

## Run

From the repository root:

```shell
node kit/cli.mjs run execution --adapter "adapters/graphql-dotnet/run.sh" --strict --random 1500
node kit/cli.mjs run parse --adapter "adapters/graphql-dotnet/run.sh" --strict
node kit/cli.mjs run validate --adapter "adapters/graphql-dotnet/run.sh" --strict
node kit/cli.mjs run schema --adapter "adapters/graphql-dotnet/run.sh" --strict
node kit/cli.mjs run introspect --adapter "adapters/graphql-dotnet/run.sh" --strict
```

`run.sh` uses `$DOTNET_ROOT/dotnet` if `DOTNET_ROOT` is set, otherwise `dotnet` from `PATH`. It passes its arguments on:

- `--no-idle` leaves out `idle`, so the kit falls back to `--grace`.
- `--inline-items` leaves out `deferred-items`, so list items come inline with the list's settle.

## How it works

For each `execute`, the adapter builds the schema from the kit's SDL with `Schema.For` (cached by SDL), configured through `SchemaBuilder.Types`:

- every field of every object type (and of every `extend type`) gets the same `IFieldResolver`, and the same `ISourceStreamResolver`, which returns the execution's source stream (graphql-dotnet only uses it on subscription root fields);
- every interface and union gets a `ResolveType` that returns the object type named in the kit's `object` outcome.

It runs the document with graphql-dotnet's default `DocumentExecuter` and serializes the `ExecutionResult` with `GraphQLSerializer` from `GraphQL.SystemTextJson`, as an application would. Variables are read with the same serializer, into `Inputs`.

The resolver sends `call`, stamped with `after` (the settles the execution had applied), and returns a `Task` from a `TaskCompletionSource` that the kit's `settle` completes. An `error` outcome fails the task with an `ExecutionError`. For an `uncoercible` outcome it returns `1.2` for an Int, `double.PositiveInfinity` for a Float, `"NOT_A_VALUE"` for an enum, and for a custom scalar a sentinel its serializer rejects (`custom-scalar-results`, below).

graphql-dotnet decides the order. Queries use `ParallelExecutionStrategy`, which starts every field of a level, awaits them all with `Task.WhenAll`, then starts the next level (`Execution/ParallelExecutionStrategy.cs:37-89`). Mutations use `SerialExecutionStrategy`, which executes one node at a time, depth first (`Execution/SerialExecutionStrategy.cs:35-50`).

If the serializer throws, or `ExecuteAsync` itself throws, the client gets no response, and the adapter sends `no-response`. For a one-event subscription it sends `stream-error`; for an event of a streamed subscription, `no-response`.

### Threading, and `idle`

Everything runs on the thread that reads stdin. The `GraphQL` package schedules no work of its own: it has no `Task.Run`, `Task.Yield` or thread-pool calls. Every `await` is on a resolver's task or on tasks built from them. The adapter completes each `TaskCompletionSource` on the stdin thread, without `RunContinuationsAsynchronously`, so graphql-dotnet's continuations run inline until every pending path waits on the kit again. When control comes back to the read loop, graphql-dotnet is blocked on the kit, and the adapter says `idle`. The kit's source stream (`subscription-stream`) is driven the same way: `emit`, `complete` and `fail` call the subscriber on the stdin thread, and graphql-dotnet's subscription pipeline (`SelectCatchAsync`, `Extensions/ObservableExtensions.cs`) runs the event inline.

The adapter checks this: every `call`, `response`, `no-response`, `stream-error`, `done` and `source-cancelled` must be sent from the stdin thread, and one that isn't is reported on stderr. No full run has reported one, and the kit's determinism replay passes.

## Capabilities

- `idle`: see above.
- `deferred-items`: graphql-dotnet only waits for a list item that is an `IDataLoaderResult`, and completes it once the other pending nodes are done (`Execution/ExecutionStrategy.cs:470-481`, `ParallelExecutionStrategy.cs:91-97`). So each item of a list is an `IDataLoaderResult`, the way a list of DataLoader loads is, and it sends its `call` when graphql-dotnet asks for its value. `--inline-items` returns plain values instead.
- `invalid-results`: resolvers return `object`, so any shape can be returned. Each wrong shape becomes a field error: a non-list for a list (`ExecutionStrategy.cs:440-443`), a runtime type that isn't a possible type (`ExecutionStrategy.cs:731-734`), an object for an Int, Float or Boolean (the scalar's `ParseValue`).
- `uncoercible-results`: the adapter returns the values above. Only the Float one fails (below).
- `mutation`: `SerialExecutionStrategy`, graphql-dotnet's default for mutations (`Execution/DefaultExecutionStrategySelector.cs:43-44`).
- `subscription`: the source stream yields one event. graphql-dotnet runs the root field's resolver on the event (`SubscriptionExecutionStrategy.cs:169-196`), as graphql-js does, so the kit's resolver is the root `call`. The response is the first `ExecutionResult` of the field's stream in `ExecutionResult.Streams`.
- `subscription-stream`: the source stream is an `IObservable<object?>` the kit drives. `emit` calls the subscriber's `OnNext`, `complete` its `OnCompleted`, `fail` its `OnError` with an exception carrying the kit's message. The adapter subscribes to the response stream (`ExecutionResult.Streams`) as a client would: each `OnNext` is a `response`, `OnCompleted` is `done`, `OnError` is `stream-error`. `cancel` disposes the client's subscription, the IObservable way to unsubscribe; once `Dispose` returns, the adapter reports `done`. graphql-dotnet then disposes its subscription to the source, which the adapter reports as `source-cancelled` if the source hadn't completed or failed. If the request ends with one result instead of a stream (a request error, such as the validation error below), that result is the `response`, and the kit's later `source` and `cancel` messages are ignored: nothing subscribed to the source, and the client has no stream.
- `parent-values`: the kit's `initialValue` token is the operation's root value (`ExecutionOptions.Root`), an object outcome returns an object carrying its `token`, and an event carries the event's token. Each resolver call reports the token of `IResolveFieldContext.Source` as `parent`.
- `custom-scalar-results`: each custom scalar is `KitScalar`, graphql-dotnet's `ComplexScalarGraphType` (see [Other areas](#other-areas)) whose `Serialize` raises graphql-dotnet's own `ThrowSerializationError` on one sentinel value, which the resolver returns for an `uncoercible` outcome at a custom scalar. graphql-dotnet turns the exception into a field error at the field's path (`ExecutionStrategy.CompleteNodeAsync`, `:612-647`).
- `scalar-results`: a leaf outcome with `value` returns it as is: the `int` 4 for an ID, which `IdGraphType.Serialize` writes as `"4"`, and the `long` 2147483648 for an Int, which `IntGraphType.ParseValue` refuses with an `OverflowException` (`checked((int)l)`), a field error.

Error `locations` and repeated keys are whatever graphql-dotnet and `GraphQLSerializer` write.

Not claimed:

- `error-propagation-off`: graphql-dotnet 8.8.5 has no option for it. Null propagation always runs (`Execution/Nodes/ObjectExecutionNode.cs:61-79`).

## Other areas

The adapter claims `parse`, `validate`, `schema` and `introspect`, with `parse-sdl` (parse), `schema-extensions` (schema) and `custom-directives` (validate and introspect): `Schema.For` builds the SDL's `directive @label(...) on ...` definitions, and graphql-dotnet knows them.

- **parse:** without `grammar`, `GraphQLDocumentBuilder.Build`, the parser `DocumentExecuter` uses by default. With a type system grammar (`parse-sdl`), `GraphQLParser.Parser.Parse` with comments ignored, as `SchemaBuilder.Build` parses SDL (`Utilities/SchemaBuilder.cs:84-89`). GraphQL-Parser reads the whole Document grammar, so every definition must then be of a kind the grammar allows (operations and fragments; schema, type and directive definitions; and their extensions). A `SyntaxError` or `GraphQLSyntaxErrorException` is `ok: false`. So is `GraphQLMaxDepthExceededException`: GraphQL-Parser has a documented recursion limit, `ParserOptions.MaxDepth`, 128 nodes by default (`GraphQLParser/ParserContext.cs:91`, `:111-120`), which refuses the kit's deeply nested crash probes; `GraphQLDocumentBuilder` doesn't wrap it in a `SyntaxError` (`Execution/GraphQLDocumentBuilder.cs:39-46`), so the adapter catches it on its own. A source with a lone surrogate can't be read into a string by System.Text.Json, and a graphql-dotnet server reads its requests with System.Text.Json too (`GraphQL.SystemTextJson`), so a request holding one never reaches graphql-dotnet. The adapter answers `unsupported` (reason "lone surrogate: …"), and the kit doesn't grade the vector (15 vectors). Only a source with a lone surrogate is answered that way.
- **validate:** `DocumentValidator`, as `DocumentExecuter` runs it. It first runs `DocumentValidator.CoreRules` over the whole document. Then, for the operation the request selected, it coerces the variables with the request's values and parses the arguments with them (`Validation/DocumentValidator.cs`, `ValidateAsyncCoreAsync`). Only the rules' verdict is the same for every request; the rest is CoerceVariableValues and CoerceArgumentValues (§6.1.2, §6.4.1), and depends on values a validate vector doesn't have. So the adapter runs the rules once with no operation selected, which makes the variable and argument steps do nothing. If the rules pass, it selects each operation in turn, with no rules and no variable values, so that argument parsing reports the literals graphql-dotnet refuses for every request, such as `{}` for a OneOf input object. It doesn't count errors that depend on the values: an `InvalidVariableError` (a Non-Null variable without a value), and an argument error whose value holds a variable, since that is parsed with the variable's default or `null` here. An `InvalidVariableError` also stops validation before arguments are parsed, so in an operation with a required variable, literals are only checked by the rules. A document GraphQL-Parser can't parse, or a rule that throws, is a crash (`error`).
- **schema:** `Schema.For` and `Initialize`, which validates the schema. graphql-dotnet rejects a schema by throwing `ArgumentException`, `InvalidOperationException` or `AggregateException` (from `SchemaValidationVisitor`), or a parser exception. Those are `valid: false`. `ArgumentNullException` is an `ArgumentException` too, but graphql-dotnet throws it from its own null checks, not to reject a schema (see the crashes below), so it is a crash. Any other exception is a crash and gets an `error` answer. `schema-extensions`: `Schema.For` takes a document with extensions, but `SchemaBuilder` applies only `extend type` (object type extensions) and drops every other kind silently (see [Schema](#schema)). The capability is claimed because that is what graphql-dotnet does with such a document; the kit's verdicts on the other kinds are graphql-dotnet's.
- **introspect:** `Schema.For`, then the kit's query through `DocumentExecuter` and `GraphQLSerializer`. A query that doesn't parse or validate comes back as `errors` with no `data` entry, as graphql-dotnet serializes a result that wasn't executed.

Every area builds the schema as execution does. Two things are needed for any SDL:

- `Initialize` rejects a union or interface with no `ResolveType` and no `IsTypeOf` on its members (`Types/Collections/SchemaTypes.cs:651`). It also rejects a subscription root field with no `StreamResolver` (`SchemaValidationVisitor`). So the resolvers are installed in every area, though they only run in execution.
- `SchemaBuilder` skips `scalar` definitions (`Utilities/SchemaBuilder.cs:124-171` has no case for them). A reference to `scalar Json` then fails with "Unable to resolve reference to type 'Json'" unless the application registers a scalar type named `Json`. The adapter registers graphql-dotnet's own `ComplexScalarGraphType` (as `KitScalar`, whose serializer only differs on the execution sentinel above) under each custom scalar's name, with the definition's description, as `SchemaBuilder` gives the types it builds.

`custom-scalar-literals` isn't claimed. `ComplexScalarGraphType` accepts every literal except one that holds a variable: a scalar gets the raw literal, with variables not substituted (`Execution/ExecutionHelper.cs:217-221`), and `ParseAnyLiteral` has no case for a variable (`Extensions/GraphQLExtensions.cs:605-616`). So `query Q($v: Int) { json(value: {a: $v}) }` is refused whatever `$v` is. How a custom scalar coerces a literal is up to the service, so that is a limitation, not a deviation, but the capability promises every literal. The validate vectors that need it (20) aren't graded.

Not claimed:

- `coerce`: the area isn't implemented for this adapter (it wasn't in scope when the adapter was written). graphql-dotnet has the APIs it would need (`DocumentExecuter` with `Inputs`, resolvers that read `IResolveFieldContext.Arguments`, `ISourceStreamResolver`, and `ExecutionOptions.Extensions`).
- `coordinate`: graphql-dotnet 8.8.5 and GraphQL-Parser 9.5.0 have no schema coordinate parser or resolver (a `TODO: switch to the schema coordinates?` in `Utilities/Visitors/AppliedDirectivesValidationVisitor.cs:86` is the only mention).

## Results

From runs on the current kit, with `--strict` (execution with `--random 1500`):

| Area | Result |
| --- | --- |
| execution | 30440 cases, 6171 distinct, 36 subscription streams. Every well-formed case satisfies the reference. 1885 cases are malformed: 365 under `resultCoercion` (a non-finite Float), and every `subscriptionAlias` case (1502 under `dataPresent` and `errorPath`, and its 18 streams under the stream lifecycle checks), which graphql-dotnet refuses at validation. `errorLocationsPresent` (SHOULD) fails on 2690 cases. `noPropagation` is skipped. |
| parse | 2832 of 2847 vectors graded (15 with a lone surrogate are `unsupported`); 2669 agree, 163 don't, no crashes. 12 of 51 checks fail. |
| validate | 3334 vectors graded (13 `unspecified`, 20 need `custom-scalar-literals`); 3092 agree, 63 of the rest are crashes. 8 checks fail. |
| schema | 490 schemas graded (5 `unspecified`); 376 agree, 8 of the rest are crashes. 33 checks fail, one of them informational. |
| introspect | Graded against the September 2025 profile, without the fields graphql-dotnet lacks: 23 of 61 results pass, 2 more fail only a SHOULD or informational check, 3 aren't graded (September 2025 lexical grammar in the schema's strings) and 7 are skipped (September 2026 only). 7 checks fail. |

`--inline-items` and `--no-idle` (grace-based, random runs only) found nothing more in execution in earlier runs.

## Known graphql-dotnet deviations

### Execution: a non-finite Float leaves the client without a response (`resultCoercion`, MUST)

A resolver that returns `double.PositiveInfinity` (or `NaN`) for a `Float` field doesn't get a field error. `FloatGraphType.ParseValue` returns any `double` as it is (`Types/Scalars/FloatGraphType.cs:36-38`), and `ScalarGraphType.Serialize` is `ParseValue` (`Types/Scalars/ScalarGraphType.cs:35`). Then `GraphQLSerializer` throws while writing the value (`src/GraphQL.SystemTextJson/ExecutionResultJsonConverter.cs:46`): "ArgumentException: .NET number values such as positive and negative infinity cannot be written as valid JSON." §3.5.2 requires an execution error, and the kit reports `resultCoercion` (`no-response`, 365 cases).

A standalone program with `enum Color { RED GREEN } type Query { count: Int ratio: Float color: Color }`, built with `Schema.For`, and resolvers returning `1.2`, `double.PositiveInfinity` and `"NOT_A_VALUE"`, shows this: `{ count }` and `{ color }` each give a field error and `null`, as the spec requires, and serializing the result of `{ ratio }` throws. Literal input is fine: `FloatGraphType` rejects a non-finite literal (`FloatGraphType.cs:31-33`). A custom scalar whose serializer raises, an Int outside 32 bits and an integer ID all pass.

### Execution: a subscription that selects its root field twice is refused (`dataPresent`, `errorPath`, stream checks; MUST)

The `subscriptionAlias` fixture selects the same root field twice under one response name, once directly and once through a fragment spread, which §5.2.4.1 allows (one grouped field set). graphql-dotnet's `SingleRootFieldSubscriptions` counts selections, not response names (`Validation/Rules/SingleRootFieldSubscriptions.cs:33-36`), so the request fails at validation: `{"errors":[{"message":"Anonymous Subscription must have exactly one root field and that field must not be an introspection field.", …}]}`. The kit expects an execution result, so each one-event run counts under `dataPresent` and `errorPath` (1502 cases), and each streamed run, which gets that one result and no stream, under `eventPerSourceEvent`, `completesWithSource`, `failsWithSource`, `cancelCompletes` and `cancelCancelsSource` (18 streams). It is the same root cause as the validate area's §5.2.4.1 over-strictness below. The `subscription` fixture's 18 streams pass every lifecycle check: events, completion, failure (`OnError` ends the response stream with the error) and cancellation (disposing the subscription disposes the source's).

### Execution: errors at merged fields have no `locations` (`errorLocationsPresent`, SHOULD)

When a field is selected more than once under one response name, as in `{ a { subfield1 } ...F } fragment F on Query { a { subfield2 } }`, `CollectFields` merges the selections into a new `GraphQLField` and copies `Location = original.Field.Location` (`Execution/ExecutionStrategy.cs:327-333`). But the base `GraphQLField` doesn't store a location: `ASTNode.Location` is `{ get => default; set { } }`, and only the parser's `GraphQLFieldWithLocation` subclass keeps one (GraphQL-Parser `AST/ASTNode.cs:16`, `AST/GraphQLField.cs:44-52`). `ExecutionError.AddLocation` then skips a node whose location is `default` (`Execution/Errors/ExecutionError.cs:106-113`), so an error raised at a merged field, or below it, has no `locations`. 2690 cases in `abstract`, `fragments`, `merging`, `mutationRoot` and `ordering`, such as `merging`'s `{"errors":[{"message":"resolver call 1 failed","path":["a"]}],"data":{"a":null,"b":null}}`. Errors at fields selected once carry the right location.

### Parse (GraphQL-Parser 9.5.0)

- **Newer syntax isn't supported (122 vectors):** a description on an operation, fragment or variable (85, `rejects what §2.2 accepts`, since September 2025: `ParserContext.Parse.cs:193-205` only reads a description before a type system definition), an empty selection set `{}` (11, §2.5, since September 2026: `ParseSelectionSet` uses `OneOrMore`, `ParserContext.Parse.cs:1240`), the variable-width escape `\u{1F600}` (6, §2.10.4, since September 2025: `GetUnicodeChar` reads exactly four hex digits, `LexerContext.cs:534-554`), directives on a directive definition such as `directive @d @x on FIELD` and the location `DIRECTIVE_DEFINITION` (6, §3.13, since September 2026), and `extend directive @d @x` (14, §3.13.6, since September 2026).
- **Raw control characters in strings are rejected (12 vectors, §2.1, since September 2025):** `{a(x: "<U+0000>")}`. The lexer refuses every code unit below U+0020 but tab inside a string (`LexerContext.cs:427`, error at `:479`), which October 2021's SourceCharacter does too.
- **A lone surrogate escape is accepted (9 vectors, §2.10.4, since September 2025):** `{a(x: "\uD83D")}`. `GetUnicodeChar` returns any UTF-16 code unit, without pairing surrogates (`LexerContext.cs:549-553`).
- **An Int followed by a name start is accepted (8 vectors, §2.10.1):** `[1_]`, `[0x123]`, `[123L]` lex as an Int and a Name. `ReadNumber` doesn't check what follows the number (`LexerContext.cs:84-122`).
- **An empty document is accepted (8 vectors: 4 §2.3, 3 §3.1, 1 §2.1.3):** `""`, `"  # only a comment"`, a lone byte order mark and a byte order mark followed by a comment parse to a document with no definitions (`ParseDefinitionsIfNotEOF`, `ParserContext.Parse.cs:207-220`), whichever grammar. `DocumentExecuter` then refuses the request with "Document does not contain any operations" (`Execution/DocumentExecuter.cs:348`), but as an operation error, not a syntax error.
- **Variables in constant positions are accepted (4 vectors, §2.10 and §2.11):** `query ($a: Int @d(x: $b)) {a}`, `scalar S @d(a: $v)` and `type T { f: Int @d(a: $v) }`. There is one `ParseDirectives` for every location, with no constant form (`ParserContext.Parse.cs:362`), so directives on variable definitions and in type system definitions take variables.
- **Crash probes:** none crash. The 7 probes deeper than 128 levels are refused with `GraphQLMaxDepthExceededException`, the documented limit, answered `ok: false`.
- **Not graded: lone surrogates (15 vectors).** A standalone program shows GraphQL-Parser accepts a raw lone surrogate inside a string, such as `{a(x: "<U+DC00>")}`: the lexer rejects only code units below U+0020 there (`LexerContext.cs:414-454`). September 2026 rejects such a source (a surrogate isn't a Unicode scalar value), and October 2021 accepts it. So at least 3 of the 15 vectors, all since September 2025, would fail if a request could carry them; the other 12 weren't checked.

### Validate

A standalone program ran an example of the rule findings through `DocumentExecuter.ExecuteAsync`: the invalid documents execute, and the valid ones are refused.

- **§5.8.5 not enforced (72 vectors, 1 since September 2025), and over-strict (10 valid vectors).** Three bugs:
  - `GraphType.Equals` compares `Name` (`Types/GraphType.cs:117-131`), and wrapper types have no name (`Types/Composite/NonNullGraphType.cs:44`). So any two Non-Null types, or any two list types, are equal, and `IsSubtypeOf` returns true on its first line (`Extensions/GraphQLExtensions.cs:330`). `query Q($v: Boolean!) { echo(req: $v) }` with `req: Int!` executes, and the resolver gets `true` as the Int argument.
  - Inside a list literal, the expected type is the named type, with every wrapper removed (`Validation/TypeInfo.cs:206-210`). So `query Q($v: [Int]) { matrix(rows: [$v]) }` with `rows: [[Int]]` is rejected ("Variable '$v' of type '[Int]' used in position expecting type 'Int'"), and `[$v]` with `$v: Int` for `[Int!]` is accepted.
  - Also, a variable default of `null` counts as a non-null default (`VariablesInAllowedPosition.cs:75` checks the AST node against C# `null`), so `($v: Boolean = null) @skip(if: $v)` is accepted.
- **§5.3.2 not enforced (22 vectors):** conflicts with `__typename`, such as `... on User { a: __typename } ... on Post { a: id }`. `OverlappingFieldsCanBeMerged` looks fields up with `GetField`, which doesn't know `__typename` (`OverlappingFieldsCanBeMerged.cs:711`), so the type comparison is skipped (`:241`).
- **§5.2.4.1 over-strict (26 valid vectors, reported under `acceptsValid` with the hints Single Root Field, Lone Anonymous Operation and Operation Type Existence) and not enforced (20 vectors, 6 since September 2025):** `subscription S7 { a: postAdded { id } a: postAdded { name } }` is rejected, since `SingleRootFieldSubscriptions` counts selections, not the grouped field set (`Validation/Rules/SingleRootFieldSubscriptions.cs:33-36`); the execution fixture `subscriptionAlias` fails the same way. It ignores `@skip` and `@include` on the root field, such as `subscription { postAdded @skip(if: false) { id } }`, which September 2025 forbids there.
- **§5.2.1.1 not enforced (11 vectors, since September 2025):** there is no rule. A mutation against a schema without a mutation type passes validation, then fails during execution with "Schema is not configured for mutations" (`Execution/ExecutionStrategy.cs:64`) and `"data": null`.
- **§5.1.1 not enforced (15 vectors), and a crash (4 vectors):** `CoreRules` has no Executable Definitions rule (`Validation/DocumentValidator.cs:24-53`), so `{ user { id } } scalar Date` validates and executes. With `{ user { id } } extend scalar Date @deprecated`, `KnownDirectivesInAllowedLocations` throws `InvalidOperationException: Unable to determine directive location for 'extend scalar Date @deprecated'`: its location switch has no case for a type extension (`Validation/Rules/5.7 - Directives/1+2. KnownDirectivesInAllowedLocations.cs:64-93`). Through `DocumentExecuter`, that exception ends the request with an unhandled-error response, not a validation error. The other 3 crashes are documents GraphQL-Parser can't parse (`extend directive`, directives on a directive definition, the location `DIRECTIVE_DEFINITION`), counted toward September 2026.
- **Newer syntax crashes (56 vectors):** the 53 description twins (descriptions on operations, fragments and variables, `descriptionsInert`, since September 2025) and the 3 empty selection sets (§5.3.3 and `acceptsValid`, since September 2026) don't parse, so they are crashes, as in [Parse](#parse-graphql-parser-950).

### Schema

The verdicts below were reproduced with plain `Schema.For` and `Initialize` in a standalone program.

- **Only object type extensions are applied (`schema-extensions`):** `SchemaBuilder.BuildSchemaFrom` handles `GraphQLObjectTypeExtension` and no other extension (`Utilities/SchemaBuilder.cs:131-145`, marked "TODO: rewrite and add support for other extensions"). `extend schema`, `extend scalar`, `extend interface`, `extend union`, `extend enum` and `extend input` are parsed and dropped without an error, so no rule about them is checked: `extensionTargetDefined` (6 schemas, such as `type Query { a: Int } extend enum E { B }`), `extensionTargetKind` (5), `extensionItemsNew` (5), `extensionItemsUnique` (4), `extensionDirectivesNotReapplied` (7), `extensionOneOf` (2), `specifiedByNotBuiltin` (2, `extend scalar Int @specifiedBy(…)`), and one schema each under `implFieldProvided`, `oneOfFieldNullable`, `unionMembersObjects` and `rootTypesDifferent`, whose invalid part is in a dropped extension. An `extend type` is applied, but not checked against what it extends: `extend type Query implements I` for a `Query` that already implements `I` is accepted (`extensionInterfacesNew`, 2). `extend directive` (September 2026) doesn't parse (`acceptsValid`, 1).
- **SchemaBuilder drops definitions silently:** `scalar String` and `type Int { … }` (`typeNameNotBuiltin`: there's no scalar case, `SchemaBuilder.cs:124-171`); an interface or input object as a root type (`rootTypesAreObjects`: `GetType(name) as IObjectGraphType` gives `null`, `SchemaBuilder.cs:180`, `203-205`); a second `schema` definition replaces the first (`schemaDefinitionUnique`, `SchemaBuilder.cs:115-122`).
- **Crashes (8 schemas):** `union U = Int` and a union member that is a union throw `NullReferenceException` (`SchemaBuilder.cs:522` casts the member with `as`, then `RemovePrivateTypesAndFieldsVisitor.cs:94`). A union member that is an interface or an enum, `union U = Query | E`, gets the same `null` from the cast, and `PossibleTypes.Add` throws `ArgumentNullException` on it ("Value cannot be null. (Parameter 'type')", `Types/Collections/PossibleTypes.cs:20`). `type Query implements O` with an object `O` throws `InvalidCastException` (`Types/Collections/SchemaTypes.cs:985`). `directive @d on OBJECT union U @d = Query` throws `NotSupportedException: UnionGraphType`: `AppliedDirectivesValidationVisitor.GetElementDescription`, which builds the message for a misplaced directive, has no case for a union (`Utilities/Visitors/AppliedDirectivesValidationVisitor.cs:87-100`).
- **Duplicates are merged, not rejected:** `implements I & I` (`Types/Collections/ResolvedInterfaces.cs` skips a duplicate), `union U = Query | Query`, `enum E { A A }`.
- **IsValidImplementation:** argument types are compared with `IsSubtypeOf`, not for equality (`GraphQLExtensions.cs:221`), so `f(a: Int!)` implements `f(a: Int)` (`implArgInvariant`). `IsSubtypeOf`'s wrapper equality (see Validate) also lets `f: [Int]` implement `f: [I]` (`implFieldCovariant`). `type Query implements Node { f: Query }` for `interface Node { f: Node }` is rejected, because the implementation is checked before `Query` is added to `Node`'s possible types (`Types/Composite/InterfaceGraphType.cs:84-85`; `acceptsValid`, 1). A missing transitive interface is added instead of rejected (`implTransitive`). `interface A implements A` is accepted (`implementsItself`). Deprecation isn't compared (`implDeprecation`, since September 2025).
- **Applied directives:** a built-in directive in the wrong place, such as `type Query @deprecated { a: Int }`, is accepted (`directiveLocationsValid`, 8), and so is a built-in directive with a missing required argument, `scalar S @specifiedBy` (`appliedDirectiveArguments`, informational, 7).
- **Rules with no check:** input object cycles through Non-Null fields or OneOf objects (5 schemas; `VisitInputObject`, `SchemaValidationVisitor.cs:305-317`), directives that reference themselves (5 schemas; marked TODO at `SchemaValidationVisitor.cs:428-434`), a deprecated required directive argument (`SchemaValidationVisitor.cs:444-470` has no check, though field arguments do at `:151`), a OneOf field with a default (2), and default values that don't coerce, such as `Int! = null` (4 schemas; `SchemaValidationVisitor.cs:471-481`).
- **September 2026 syntax:** directives on a directive definition and the location `DIRECTIVE_DEFINITION` don't parse (`acceptsValid`: 12 valid schemas in all, with the `extend directive` one above).

### Introspect: missing fields

graphql-dotnet 8.8.5 doesn't have `__Type.specifiedByURL`, `__Directive.isRepeatable`, `__InputValue.isDeprecated` and `deprecationReason`, or `includeDeprecated` on `__Type.inputFields`, `__Field.args` and `__Directive.args`, nor September 2026's `__Schema.directives(includeDeprecated:)`. So validation rejects both newer queries. The kit then asks which fields each introspection type has, drops the missing ones from September 2025's query, grades the rest under the September 2025 profile, and counts what is missing once, under `builtinDefinitions` (MUST). Beyond those:

- **`builtinDefinitions` and `builtinNullability` (most results):** `@deprecated` has October 2021's two locations and `reason: String`, and `includeDeprecated` on `__Type.fields` and `enumValues` is a nullable `Boolean`, as in October 2021; `__Directive` has the extra fields `onOperation`, `onFragment` and `onField` (`Introspection/__Directive.cs:44-57`, `builtinAdditions`, informational).
- **`directives` (MUST) and `builtinDirectives` (SHOULD):** the schema's own directive, declared `on FIELD_DEFINITION | QUERY`, and `@oneOf`, which an input object's `isOneOf: true` shows is provided, are missing from `__schema.directives`. The default schema filter hides every directive that has a type system location (`DefaultSchemaFilter.AllowDirective`, `Introspection/ISchemaFilter.cs:77-101`; see the doc comment at `Types/Directives/Directive.cs:64-70`). §4.2.1 and §3.13 require the schema's directives, in every edition. There is no `@specifiedBy` at all.
- **`defaultValueOmitted` (SHOULD, 3 results):** `n: Int = null` is introspected with `defaultValue: null`, as if it had no default: graphql-dotnet stores both as C# `null` (`Introspection/__InputValue.cs:48`).
- **`defaultValuePrinting` (SHOULD, 3 results, since September 2025):** a string default with a control character is printed with the character raw. `IGraphType.Print` returns `"` + the string + `"` unescaped when it holds none of `\b \f \n \r \t \\ "` (`Extensions/GraphQLExtensions.cs:580-591`), so `s: String = "\u0003"` prints a raw U+0003. Otherwise GraphQL-Parser's `SDLPrinter` escapes only code units below U+0020 (`GraphQLParser/Visitors/SDLPrinter.cs:1055-1100`), so U+007F to U+009F stay raw. §2.10.4 says those "should" be escaped.

`isRepeatable` and input-value deprecation are behind `Schema.Features.RepeatableDirectives` and `DeprecationOfInputValues` (`ExperimentalFeatures.cs`, off by default). The feature alone doesn't expose `isRepeatable`: the default schema filter hides that field too (`DefaultSchemaFilter.AllowField`, `Introspection/ISchemaFilter.cs:68`). Only `EnableExperimentalIntrospectionFeatures(ExperimentalIntrospectionFeaturesMode.IntrospectionAndExecution)` shows it, and that also adds `appliedDirectives`. Turning these on wouldn't help with `specifiedByURL`, which doesn't exist at all. The adapter keeps the defaults.
