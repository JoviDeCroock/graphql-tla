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
node kit/cli.mjs run execution --adapter "adapters/graphql-dotnet/run.sh" --strict
node kit/cli.mjs run validate --adapter "adapters/graphql-dotnet/run.sh" --strict
```

`run.sh` uses `$DOTNET_ROOT/dotnet` if `DOTNET_ROOT` is set, otherwise `dotnet` from `PATH`. It passes its arguments on:

- `--no-idle` leaves out `idle`, so the kit falls back to `--grace`.
- `--inline-items` leaves out `deferred-items`, so list items come inline with the list's settle.

## How it works

For each `execute`, the adapter builds the schema from the kit's SDL with `Schema.For` (cached by SDL), configured through `SchemaBuilder.Types`:

- every field of every object type gets the same `IFieldResolver`, and the same one-event `ISourceStreamResolver` (graphql-dotnet only uses it on subscription root fields);
- every interface and union gets a `ResolveType` that returns the object type named in the kit's `object` outcome.

It runs the document with graphql-dotnet's default `DocumentExecuter` and serializes the `ExecutionResult` with `GraphQLSerializer` from `GraphQL.SystemTextJson`, as an application would. Variables are read with the same serializer, into `Inputs`.

The resolver sends `call`, stamped with `after` (the settles the execution had applied), and returns a `Task` from a `TaskCompletionSource` that the kit's `settle` completes. An `error` outcome fails the task with an `ExecutionError`. For an `uncoercible` outcome it returns `1.2` for an Int, `double.PositiveInfinity` for a Float and `"NOT_A_VALUE"` for an enum.

graphql-dotnet decides the order. Queries use `ParallelExecutionStrategy`, which starts every field of a level, awaits them all with `Task.WhenAll`, then starts the next level (`Execution/ParallelExecutionStrategy.cs:37-89`). Mutations use `SerialExecutionStrategy`, which executes one node at a time, depth first (`Execution/SerialExecutionStrategy.cs:35-50`).

If the serializer throws, or `ExecuteAsync` itself throws, the client gets no response, and the adapter sends `no-response`. For a subscription it sends `stream-error`.

### Threading, and `idle`

Everything runs on the thread that reads stdin. The `GraphQL` package schedules no work of its own: it has no `Task.Run`, `Task.Yield` or thread-pool calls. Every `await` is on a resolver's task or on tasks built from them. The adapter completes each `TaskCompletionSource` on the stdin thread, without `RunContinuationsAsynchronously`, so graphql-dotnet's continuations run inline until every pending path waits on the kit again. When control comes back to the read loop, graphql-dotnet is blocked on the kit, and the adapter says `idle`.

The adapter checks this: every `call`, `response`, `no-response` and `stream-error` must be sent from the stdin thread, and one that isn't is reported on stderr. No full run has reported one, and the kit's determinism replay passes.

## Capabilities

- `idle`: see above.
- `deferred-items`: graphql-dotnet only waits for a list item that is an `IDataLoaderResult`, and completes it once the other pending nodes are done (`Execution/ExecutionStrategy.cs:470-481`, `ParallelExecutionStrategy.cs:91-97`). So each item of a list is an `IDataLoaderResult`, the way a list of DataLoader loads is, and it sends its `call` when graphql-dotnet asks for its value. `--inline-items` returns plain values instead.
- `invalid-results`: resolvers return `object`, so any shape can be returned. Each wrong shape becomes a field error: a non-list for a list (`ExecutionStrategy.cs:440-443`), a runtime type that isn't a possible type (`ExecutionStrategy.cs:731-734`), an object for an Int, Float or Boolean (the scalar's `ParseValue`).
- `uncoercible-results`: the adapter returns the values above. Only the Float one fails (below).
- `mutation`: `SerialExecutionStrategy`, graphql-dotnet's default for mutations (`Execution/DefaultExecutionStrategySelector.cs:43-44`).
- `subscription`: the source stream yields one event. graphql-dotnet runs the root field's resolver on the event (`SubscriptionExecutionStrategy.cs:169-196`), as graphql-js does, so the kit's resolver is the root `call`. The response is the first `ExecutionResult` of the field's stream in `ExecutionResult.Streams`.

Not claimed:

- `error-propagation-off`: graphql-dotnet 8.8.5 has no option for it. Null propagation always runs (`Execution/Nodes/ObjectExecutionNode.cs:61-79`).

## Other areas

The adapter claims `parse`, `validate`, `schema` and `introspect`, and `custom-directives` (validate and introspect): `Schema.For` builds the SDL's `directive @label(...) on ...` definitions, and graphql-dotnet knows them.

- **parse:** `GraphQLDocumentBuilder.Build`, the parser `DocumentExecuter` uses by default. A `SyntaxError` is `ok: false`. GraphQL-Parser also reads the type system language, so every definition must be an operation or a fragment. A source with a lone surrogate can't be read into a string by System.Text.Json, and a graphql-dotnet server reads its requests with System.Text.Json too (`GraphQL.SystemTextJson`), so a request holding one never reaches graphql-dotnet. The adapter answers `unsupported` (reason "lone surrogate: …"), and the kit doesn't grade the vector (15 vectors). Only a source with a lone surrogate is answered that way.
- **validate:** `DocumentValidator`, as `DocumentExecuter` runs it. It first runs `DocumentValidator.CoreRules` over the whole document. Then, for the operation the request selected, it coerces the variables with the request's values and parses the arguments with them (`Validation/DocumentValidator.cs`, `ValidateAsyncCoreAsync`). Only the rules' verdict is the same for every request; the rest is CoerceVariableValues and CoerceArgumentValues (§6.1.2, §6.4.1), and depends on values a validate vector doesn't have. So the adapter runs the rules once with no operation selected, which makes the variable and argument steps do nothing. If the rules pass, it selects each operation in turn, with no rules and no variable values, so that argument parsing reports the literals graphql-dotnet refuses for every request, such as `{}` for a OneOf input object. It doesn't count errors that depend on the values: an `InvalidVariableError` (a Non-Null variable without a value), and an argument error whose value holds a variable, since that is parsed with the variable's default or `null` here. An `InvalidVariableError` also stops validation before arguments are parsed, so in an operation with a required variable, literals are only checked by the rules.
- **schema:** `Schema.For` and `Initialize`, which validates the schema. graphql-dotnet rejects a schema by throwing `ArgumentException`, `InvalidOperationException` or `AggregateException` (from `SchemaValidationVisitor`), or a parser exception. Those are `valid: false`. `ArgumentNullException` is an `ArgumentException` too, but graphql-dotnet throws it from its own null checks, not to reject a schema (see the crashes below), so it is a crash. Any other exception is a crash and gets an `error` answer.
- **introspect:** `Schema.For`, then the kit's query through `DocumentExecuter` and `GraphQLSerializer`.

Every area builds the schema as execution does. Two things are needed for any SDL:

- `Initialize` rejects a union or interface with no `ResolveType` and no `IsTypeOf` on its members (`Types/Collections/SchemaTypes.cs:651`). It also rejects a subscription root field with no `StreamResolver` (`SchemaValidationVisitor`). So the resolvers are installed in every area, though they only run in execution.
- `SchemaBuilder` skips `scalar` definitions (`Utilities/SchemaBuilder.cs:124-171` has no case for them). A reference to `scalar Json` then fails with "Unable to resolve reference to type 'Json'" unless the application registers a scalar type named `Json`. The adapter registers graphql-dotnet's own `ComplexScalarGraphType` under each custom scalar's name, with the definition's description, as `SchemaBuilder` gives the types it builds.

`custom-scalar-literals` isn't claimed. `ComplexScalarGraphType` accepts every literal except one that holds a variable: a scalar gets the raw literal, with variables not substituted (`Execution/ExecutionHelper.cs:217-221`), and `ParseAnyLiteral` has no case for a variable (`Extensions/GraphQLExtensions.cs:605-616`). So `query Q($v: Int) { json(value: {a: $v}) }` is refused whatever `$v` is. How a custom scalar coerces a literal is up to the service, so that is a limitation, not a deviation, but the capability promises every literal. The validate vectors that need it (9) aren't graded. (The adapter's validate answer would also miss this refusal, since the argument's value holds a variable.)

`coerce` isn't claimed: it wasn't in scope for this adapter.

## Results

Execution is from the full run the conformance sheet uses (`--strict`, `--random 1500`). The other areas are from runs on the kit as of this README's last change, whose vectors have since grown; the conformance sheet has the current numbers.

| Area | Result |
| --- | --- |
| execution | Every well-formed case satisfies the reference: 3014 distinct cases, exhaustive and random. `resultCoercion` fails on 357 of 12658 cases, the Float case below. `noPropagation` is skipped. |
| parse | 1874 of 1992 graded vectors agree. 15 vectors with a lone surrogate aren't graded (`unsupported`). 6 checks fail. |
| validate | 2921 of 3079 graded vectors agree; 9 that need `custom-scalar-literals` and 12 `unspecified` ones aren't graded. 5 rule checks and `acceptsValid` fail. |
| schema | 139 of 168 schemas agree. Of the 29 that don't, 4 are crashes. 17 of 46 checks fail. |
| introspect | Both full queries are rejected; the kit discovers the missing fields and grades 28 vectors under the October 2021 profile. |

`--inline-items` and `--no-idle` (grace-based, random runs only) find nothing more in execution.

## Known graphql-dotnet deviations

### Execution: a non-finite Float leaves the client without a response

A resolver that returns `double.PositiveInfinity` (or `NaN`) for a `Float` field doesn't get a field error. `FloatGraphType.ParseValue` returns any `double` as it is (`Types/Scalars/FloatGraphType.cs:36-38`), and `ScalarGraphType.Serialize` is `ParseValue` (`Types/Scalars/ScalarGraphType.cs:35`). Then `GraphQLSerializer` throws while writing the value (`src/GraphQL.SystemTextJson/ExecutionResultJsonConverter.cs:46`): "ArgumentException: .NET number values such as positive and negative infinity cannot be written as valid JSON." §3.5.2 requires an execution error, and the kit reports `resultCoercion` (`no-response`).

A standalone program with `enum Color { RED GREEN } type Query { count: Int ratio: Float color: Color }`, built with `Schema.For`, and resolvers returning `1.2`, `double.PositiveInfinity` and `"NOT_A_VALUE"`, shows this: `{ count }` and `{ color }` each give a field error and `null`, as the spec requires, and serializing the result of `{ ratio }` throws. Literal input is fine: `FloatGraphType` rejects a non-finite literal (`FloatGraphType.cs:31-33`).

### Parse (GraphQL-Parser 9.5.0)

- **Draft syntax isn't supported (98 vectors):** a description on an operation, fragment or variable (84, `rejects what §2.2 accepts`: `ParserContext.Parse.cs:193-205` only reads a description before a type system definition), an empty selection set `{}` (8, §2.5: `ParseSelectionSet` uses `OneOrMore`, `ParserContext.Parse.cs:1240`), and the variable-width escape `\u{1F600}` (6, §2.10.4: `GetUnicodeChar` reads exactly four hex digits, `LexerContext.cs:534-554`).
- **A lone surrogate escape is accepted (9 vectors, §2.10.4):** `{a(x: "\uD83D")}`. `GetUnicodeChar` returns any UTF-16 code unit, without pairing surrogates (`LexerContext.cs:549-553`).
- **An Int followed by a name start is accepted (8 vectors, §2.10.1):** `[1_]`, `[0x123]`, `[123L]` lex as an Int and a Name. `ReadNumber` doesn't check what follows the number (`LexerContext.cs:84-122`).
- **An empty document is accepted (2 vectors, §2.3):** `""` and `"  # only a comment"` parse to a document with no definitions (`ParseDefinitionsIfNotEOF`, `ParserContext.Parse.cs:207-220`). `DocumentExecuter` then refuses the request with "Document does not contain any operations" (`Execution/DocumentExecuter.cs:348`), but as an operation error, not a syntax error.
- **A variable in a variable definition's directive is accepted (1 vector, §2.11):** `query ($a: Int @d(x: $b)) {a}`. There is one `ParseDirectives` for every location, with no constant form (`ParserContext.Parse.cs:362`), and variable definitions use it.
- **Not graded: lone surrogates (15 vectors).** A standalone program shows GraphQL-Parser accepts a raw lone surrogate inside a string, such as `{a(x: "<U+DC00>")}`: the lexer rejects only code units below U+0020 there (`LexerContext.cs:414-454`). The draft rejects such a source (a surrogate isn't a Unicode scalar value), and October 2021 accepts it. So at least 3 of the 15 vectors, all draft only, would fail if a request could carry them; the other 12 weren't checked.

### Validate

A standalone program ran an example of the first five findings through `DocumentExecuter.ExecuteAsync`: the invalid documents execute, and the valid ones are refused.

- **§5.8.5 not enforced (72 vectors, 1 draft only), and over-strict (10 valid vectors).** Three bugs:
  - `GraphType.Equals` compares `Name` (`Types/GraphType.cs:117-131`), and wrapper types have no name (`Types/Composite/NonNullGraphType.cs:44`). So any two Non-Null types, or any two list types, are equal, and `IsSubtypeOf` returns true on its first line (`Extensions/GraphQLExtensions.cs:330`). `query Q($v: Boolean!) { echo(req: $v) }` with `req: Int!` executes, and the resolver gets `true` as the Int argument.
  - Inside a list literal, the expected type is the named type, with every wrapper removed (`Validation/TypeInfo.cs:206-210`). So `query Q($v: [Int]) { matrix(rows: [$v]) }` with `rows: [[Int]]` is rejected ("expecting type 'Int'"), and `[$v]` with `$v: Int` for `[Int!]` is accepted.
  - Also, a variable default of `null` counts as a non-null default (`VariablesInAllowedPosition.cs:75` checks the AST node against C# `null`), so `($v: Boolean = null) @skip(if: $v)` is accepted.
  - The draft-only vector is `query Q($v: ID = null) { echo(pick: {id: $v}) }` with a OneOf `pick`: no rule checks a variable in a OneOf field. Executed with no variables, argument parsing refuses the null default; with `{"v": "1"}` it executes.
- **§5.3.2 not enforced (22 vectors):** conflicts with `__typename`, such as `... on User { a: __typename } ... on Post { a: id }`. `OverlappingFieldsCanBeMerged` looks fields up with `GetField`, which doesn't know `__typename` (`OverlappingFieldsCanBeMerged.cs:711`), so the type comparison is skipped (`:241`).
- **§5.2.4.1 over-strict (26 vectors, reported under Single Root Field, Lone Anonymous Operation and Operation Type Existence):** `subscription { a: postAdded { id } a: postAdded { name } }` is rejected. `SingleRootFieldSubscriptions` counts selections, not the grouped field set (`SingleRootFieldSubscriptions.cs:34-37`). Not enforced for `@skip`/`@include` on the root field (15 vectors). Only the draft forbids those directives there, but 14 of the 15 are invalid under October 2021 as well: its CollectFields, run with empty variables, leaves no root field for `@skip(if: true)` or `@include(if: $v)`. Only `@include(if: true)` is draft only.
- **§5.2.1.1 not enforced (9 vectors, draft):** there is no rule. A mutation against a schema without a mutation type passes validation, then fails during execution with "Schema is not configured for mutations" (`Execution/ExecutionStrategy.cs:64`) and `"data": null`.
- **§5.1.1 not enforced (4 vectors):** `CoreRules` has no Executable Definitions rule (`Validation/DocumentValidator.cs:24-53`). `directive @x on FIELD { post { id } }` executes.

### Schema

The verdicts below were reproduced with plain `Schema.For` and `Initialize` in a standalone program.

- **SchemaBuilder drops definitions silently:** `scalar String` and `type Int { … }` (`typeNameNotBuiltin`: there's no scalar case, `SchemaBuilder.cs:124-171`); an interface or input object as a root type (`rootTypesAreObjects`: `GetType(name) as IObjectGraphType` gives `null`, `SchemaBuilder.cs:180`, `203-205`).
- **Crashes (4 schemas):** `union U = Int` and a union member that is a union throw `NullReferenceException` (`SchemaBuilder.cs:522` casts the member with `as`, then `RemovePrivateTypesAndFieldsVisitor.cs:94`). A union member that is an interface, `union U = I`, gets the same `null` from the cast, and `PossibleTypes.Add` throws `ArgumentNullException` on it ("Value cannot be null. (Parameter 'type')", `Types/Collections/PossibleTypes.cs:20`). `type Query implements O` with an object `O` throws `InvalidCastException` (`Types/Collections/SchemaTypes.cs:985`).
- **Duplicates are merged, not rejected:** `implements I & I` (`Types/Collections/ResolvedInterfaces.cs` skips a duplicate), `union U = Query | Query`, `enum E { A A }`.
- **IsValidImplementation:** argument types are compared with `IsSubtypeOf`, not for equality (`GraphQLExtensions.cs:221`), so `f(a: Int!)` implements `f(a: Int)` (`implArgInvariant`). `type Query implements Node { f: Query }` for `interface Node { f: Node }` is rejected, because the implementation is checked before `Query` is added to `Node`'s possible types (`Types/Composite/InterfaceGraphType.cs:84-85`; `implFieldCovariant` over-strict). A missing transitive interface is added instead of rejected (`implTransitive`). `interface A implements A` is accepted (`implementsItself`). Deprecation isn't compared (`implDeprecation`, draft).
- **Rules with no check:** input object cycles through Non-Null fields or OneOf objects (5 schemas; `VisitInputObject`, `SchemaValidationVisitor.cs:305-317`), directives that reference themselves (4 schemas; marked TODO at `SchemaValidationVisitor.cs:428-434`), a deprecated required directive argument (`SchemaValidationVisitor.cs:444-470` has no check, though field arguments do at `:151`), and default values that don't coerce, such as `Int! = null` and `[Int!] = [1, null]` (4 schemas; `SchemaValidationVisitor.cs:471-481`).

### Introspect: missing fields

graphql-dotnet 8.8.5 doesn't have the draft's `__Type.specifiedByURL`, `__Directive.isDeprecated` and `deprecationReason`, `__Schema.directives(includeDeprecated:)`, `__Directive.isRepeatable`, or `includeDeprecated` on `args` and `inputFields` with `__InputValue.isDeprecated`. So validation rejects the whole query. The kit then tries its October 2021 query, which leaves out the draft-only fields, but graphql-dotnet rejects that too: `specifiedByURL` and `isRepeatable` are both in the October 2021 edition's introspection types. The kit then asks which fields each introspection type has, drops the missing ones from its query, and grades the rest under the October 2021 profile (28 of 38 vectors; the other 10 are draft-only). The kit counts each missing field in every result whose query would select it, so the two fields fail `specifiedByURL` (28 results), and `builtinDefinitions` and `directives` (18 each). Beyond those:

- **`directives` (`rich`):** the schema's own directive, declared `on FIELD_DEFINITION | QUERY`, is missing from `__schema.directives`. The default schema filter hides every directive that has a type system location (`DefaultSchemaFilter.AllowDirective`, `Introspection/ISchemaFilter.cs:77-101`; see the doc comment at `Types/Directives/Directive.cs:64-70`). §4.2.1 and §3.13 require the schema's directives, in both editions.
- **`defaultValue` (3 results):** `n: Int = null` is introspected with `defaultValue: null`, as if it had no default: graphql-dotnet stores both as C# `null` (`Introspection/__InputValue.cs:48`). The kit expects `"null"`. That is its reading of §4.2.4, which says `defaultValue` "may return a String encoding … of the default value"; the text doesn't say it must.
- **`builtinDirectives` (SHOULD):** no `@specifiedBy` among the directives.

`isRepeatable` and input-value deprecation are behind `Schema.Features.RepeatableDirectives` and `DeprecationOfInputValues` (`ExperimentalFeatures.cs`, off by default). The feature alone doesn't expose `isRepeatable`: the default schema filter hides that field too (`DefaultSchemaFilter.AllowField`, `Introspection/ISchemaFilter.cs:68`). Only `EnableExperimentalIntrospectionFeatures(ExperimentalIntrospectionFeaturesMode.IntrospectionAndExecution)` shows it, and that also adds `appliedDirectives`. Turning these on wouldn't help, since `specifiedByURL` and directive deprecation don't exist at all. The adapter keeps the defaults.
