# graphql-java adapter

A [graphql-tla conformance adapter](../../docs/conformance.md) for
[graphql-java](https://github.com/graphql-java/graphql-java) 26.2. It answers
`execution` and the [areas beyond it](../../docs/kit-areas.md) `parse`,
`validate`, `coerce`, `schema` and `introspect`. It doesn't answer
`coordinate`: graphql-java has no schema coordinate API (§2.14). Its
`FieldCoordinates` is a pair of a type name and a field name that the code
registry is keyed by; nothing parses a coordinate such as
`Query.searchBusiness(criteria:)` or resolves one in a schema, and the adapter
doesn't write its own (that would grade the adapter).

Source references below are to graphql-java at tag `v26.2`: Java files under
`src/main/java/graphql/`, grammar files under `src/main/antlr/`.

## Build

Needs JDK 21 and Maven.

```shell
cd adapters/graphql-java
mvn -q package        # writes target/graphql-java-adapter.jar (a fat jar)
```

## Run

```shell
node kit/cli.mjs run execution --adapter "adapters/graphql-java/run.sh" --strict
node kit/cli.mjs run parse --adapter "adapters/graphql-java/run.sh" --strict
node kit/cli.mjs run coerce --adapter "adapters/graphql-java/run.sh --validate" --strict
```

`run.sh` runs `java -jar target/graphql-java-adapter.jar`, with
`$JAVA_HOME/bin/java` if `JAVA_HOME` is set. It passes its arguments on:

- `--no-idle` leaves out `idle`, so the kit falls back to `--grace`.
- `--validate` makes `coerce` validate before executing, and drops the
  `unvalidated` capability. The conformance sheet runs with it.
- `--good-faith` keeps Good Faith Introspection on in `introspect` (see
  below).

## How it works

The schema is built with `SchemaParser` and `SchemaGenerator`. A
`WiringFactory` puts one data fetcher on every field, a type resolver on
every interface and union that picks the object type named by the value's
`__typename`, and a scalar implementation on every custom scalar. The data
fetcher sends `call`, stamped with `after` (the settles applied so far), and
returns a `CompletableFuture` that the kit's `settle` completes.

Capabilities:

- `idle`: everything runs on the thread that reads stdin. graphql-java runs
  data fetchers and future continuations on the thread that calls
  `executeAsync` or completes a future, and the adapter installs no executor.
  So once a message has been handled, graphql-java is blocked on kit futures.
- `deferred-items` isn't claimed. graphql-java doesn't wait for a
  `CompletableFuture` that is a list item (`ExecutionStrategy#completeValueForList`
  only unboxes `Optional` and `DataFetcherResult`), so items are returned inline.
- `invalid-results`: wrong-shape values become field errors (type mismatch,
  unresolved type, Int/Float/Boolean coercion). `String` coerces anything with
  `String.valueOf` (`GraphqlStringCoercing`); the kit doesn't send objects for
  String or ID, which §3.5 lets a service coerce "where reasonable".
- `uncoercible-results`: `1.2` for an Int, `Infinity` for a Float, an unknown
  name for an enum.
- `custom-scalar-results`: graphql-java refuses to build a schema with a
  custom scalar that has no implementation, so the adapter gives each one a
  `Coercing` that passes values through and whose `serialize` throws
  `CoercingSerializeException` on one marker value, the kit's `uncoercible`.
- `scalar-results`: the resolver returns the kit's `value` as Jackson reads
  it, an `Integer` 4 for an ID or a `Long` 2147483648 for an Int.
  `GraphqlIDCoercing` writes `"4"`, and `GraphqlIntCoercing` raises.
- `parent-values`: the operation's root value (`ExecutionInput#root`) and
  every object a resolver returns are maps that carry the kit's token, and
  each `call` reports the token of `DataFetchingEnvironment#getSource`.
- `mutation`: graphql-java's default `AsyncSerialExecutionStrategy`.
- `error-propagation-off`: graphql-java's `@experimental_disableErrorPropagation`
  directive, added to the operation. It is built in, and
  `NonNullableFieldValidator` then stops throwing instead of propagating.
- `subscription`: graphql-java uses each source stream event as the root
  field's value (`SubscriptionExecutionStrategy#executeSubscriptionEvent`), so
  the source stream's request for its one event is the root `call`, and the
  settled outcome is the event. A settled `error` is an event that is a
  `DataFetcherResult` with an error built as a data fetcher builds one for its
  field (`GraphqlErrorBuilder` with the field's path and location). With
  `parent-values`, that call reports the event's token: graphql-java executes
  each event with the event as the root value (`builder.root(eventPayload)`),
  and there is no resolver call on the event that could report anything else.
  So `parentValue` at a subscription's root says nothing about graphql-java;
  below the root it does.
- `subscription-stream`: the subscription root field's data fetcher returns
  a `Flow.Publisher` that the kit drives. An `emit` is signalled while
  graphql-java has demand, as the root `call` above, and goes to graphql-java
  once the kit settles it; `complete` and `fail` are `onComplete` and
  `onError`, in order after any event still being settled. graphql-java
  cancelling its subscription is reported as `source-cancelled`. The adapter
  subscribes to graphql-java's response `Publisher` as a client would, with
  unbounded demand, and reports each `onNext` as a `response`, `onComplete` as
  `done` and `onError` as `stream-error`. The kit's `cancel` calls
  `Subscription#cancel` on the response stream. Reactive Streams has no signal
  after that, so the stream is over for the client once `cancel` returns, and
  the adapter reports `done`. Because an event is the root call itself, an
  event "in flight" when the client cancels (the kit's last scenario) hasn't
  reached graphql-java yet: the cancelled source never signals it (Reactive
  Streams 1.8). That scenario can't put graphql-java in the middle of an event,
  so `nothingAfterCancel` passing there says little.

## Known graphql-java deviations in execution

`--strict`, `--random 1500`: 5910 of 5916 distinct well-formed cases satisfy
the reference, and 1349 cases are malformed.

- **A subscription event whose Non-Null root field is null ends the stream
  (`eventYieldsResult`, MUST, 1338 cases; `eventPerSourceEvent`, MUST, 11
  streams):** graphql-java doesn't publish `{"data": null, "errors": [...]}`
  (§6.4.4). The event's `NonNullableFieldWasNullException` fails the mapped
  future, and `CompletionStageSubscriber#handleThrowableDuringMapping` ends the
  response stream with `onError` and cancels the source
  (`execution/reactive/CompletionStageSubscriber.java:90-95, 115-130`). A client gets
  no execution result for that event, only the stream error, so the adapter
  reports a `stream-error`.
- **Two errors at one path in a subscription event (`errorPathsUnique`, MUST
  since September 2026, SHOULD before, 6 cases):** in
  `subscription { liked: postLiked { likes title } }`, when `likes: Int!`'s
  data fetcher throws, the event's result has the fetch error and a
  `NullValueInNonNullableField` error, both at `["liked", "likes"]`. For an
  event, `NonNullableFieldValidator` adds its error with
  `AlternativeCallContext#addError`, which has no per-path check
  (`execution/NonNullableFieldValidator.java:53-54`). A query or mutation goes
  through `ExecutionContext#addError(error, path)`, which drops a second error
  at a path (`execution/ExecutionContext.java:288`), so only subscriptions show
  it.
- **Errors without `locations` (`errorLocationsPresent`, SHOULD, 7428 cases,
  and 728 more in `noPropagation`, INFO):** errors graphql-java raises while
  completing a value carry no location: `NonNullableFieldWasNullError`
  (`execution/NonNullableFieldWasNullError.java:38-40`), `TypeMismatchError`
  (`TypeMismatchError.java:71-73`), `UnresolvedTypeError`
  (`UnresolvedTypeError.java:51-53`), and `SerializationError`, which takes
  the locations of the `CoercingSerializeException` (`SerializationError.java:44-46`)
  that the scalars throw without one. `ExecutionStrategy` builds it with the
  path only (`execution/ExecutionStrategy.java:973`). For `{ a }` where `a: Int`
  resolves to `1.2`, the error is `{"message": "Can't serialize value (/a) : …",
  "path": ["a"]}`. Errors from a throwing data fetcher (`ExceptionWhileDataFetching`)
  do have the field's location.

## Other areas

`Areas.java` answers them. Capabilities claimed: `parse`, `parse-sdl`,
`validate`, `coerce`, `schema`, `schema-extensions`, `introspect`,
`custom-scalar-literals`, `custom-directives`, `absent-vs-null`,
`nested-fields`, `subscription-source`, `request-extensions`, and
`unvalidated` (not with `--validate`). `exact-numbers` isn't claimed.
`custom-directives` (validate and introspect): `SchemaGenerator` builds the
SDL's `directive @label(...) on ...` definitions, and graphql-java knows them.

In parse, validate, coerce and schema, an exception graphql-java throws where
it should have given a verdict or a response is answered with an `error`. The
kit reports that as a crash of graphql-java's on that vector
([docs/kit-areas.md](../../docs/kit-areas.md#protocol)), and only the
message's first line reaches the report. The stack trace goes to stderr.

- **parse:** an executable document is parsed with `ParseAndValidate.parse`,
  which is how `GraphQL` parses a request, with the default operation parser
  options. An `InvalidSyntaxException` is `ok: false`. The parser reads the
  whole Document grammar, so every definition must be an operation or a
  fragment. `parse-sdl`: a type system grammar is parsed as `SchemaParser`
  parses SDL, `Parser.parse` with `ParserOptions.getDefaultSdlParserOptions()`,
  without building a `TypeDefinitionRegistry` (which would check more than
  syntax). Then every definition must be of a kind the grammar allows:
  `SDLDefinition` but not `SDLExtensionDefinition` for `typeSystem`, any
  `SDLDefinition` for `typeSystemExtension`, anything for `document`.
  graphql-java's documented parser limits (`ParserOptions`: 15000 tokens, a
  rule depth of 500, 100 characters in a numeric literal, 1 MB for an
  operation) throw a `ParseCancelled…Exception`, a subclass of
  `InvalidSyntaxException`, so a crash probe over them is `ok: false`. The
  SDL options lift every limit but the numeric literal's.
- **validate:** the schema is built with `SchemaGenerator` and
  `RuntimeWiring.MOCKED_WIRING`, graphql-java's wiring for a schema that is
  inspected but not executed. The document is parsed with
  `ParseAndValidate.parse`, as `GraphQL` parses a request. A document over one
  of the parser limits above is refused, which `GraphQL` answers with an error
  response, so that is `valid: false`; any other syntax error is a crash,
  since every vector parses. Then `Validator.validateDocument` with no rule
  predicate and no limits, which is what `GraphQL` runs on a request. Good
  Faith Introspection stays on, as it is by default; it throws
  `GoodFaithIntrospectionExceeded`, which `GraphQL` turns into an error
  response, so that is a rejection. Any other exception, the validator's own
  included, is a crash. `custom-scalar-literals`:
  `MockedWiringFactory#getScalar` gives a custom scalar whose `parseLiteral`
  accepts every kind of literal, variables included.
- **coerce:** the schema has one data fetcher on every field, which reads
  `env.getArguments()`, records it with the field's path, and returns what
  the field's type needs (`nested-fields`): `"ok"` for a leaf, a map for an
  object, two maps for a list of objects. The request runs through
  `GraphQL.execute`, with the request's `extensions` in
  `ExecutionInput#extensions` (`request-extensions`). The variables and
  extensions are read with Jackson, as a Java server reads a request body:
  integers exactly (`Integer`, `Long`, `BigInteger`), other numbers as
  `Double`. That is why `exact-numbers` isn't claimed. The response is
  `ExecutionResult#toSpecification()`. A document that doesn't parse gets
  `GraphQL`'s own request error. If `GraphQL.execute` throws instead, the
  client gets no response, and the adapter answers with an `error`: the kit's
  "no response".
  - `subscription-source`: `GraphQL.execute` runs a subscription operation
    through `SubscriptionExecutionStrategy`, which calls the subscription root
    field's data fetcher once to create the source stream. That data fetcher
    records the source call (field name and arguments) and then throws
    (`subscribe: "raise"`) or returns a `Flow.Publisher` of one event. The
    response is the first result of graphql-java's response stream, which is
    then cancelled, or the result `GraphQL.execute` returns instead of a
    stream. graphql-java doesn't call a resolver on the event: the event is
    the root field's value. So, as in execution, the event stands for the root
    field's resolution: when the source stream emits it, the adapter records
    the root call with the arguments the source stream resolver got.
  - `absent-vs-null`: graphql-java leaves an argument or input field with no
    value out of the map (`execution/ValuesResolver.java:351-380`,
    `ValuesResolverConversion.java:801-827`), so absent and null differ.
  - `unvalidated`: a `PreparsedDocumentProvider`, graphql-java's hook for
    documents parsed and validated earlier, hands over the parsed document
    without calling the parse-and-validate function. `GraphQL` then executes
    it without validating (`GraphQL.java:540-558`). With `--validate`, the
    adapter uses `GraphQL` as it comes, so validation runs first.
  - graphql-java coerces arguments lazily, when the data fetcher first asks
    for them (`execution/ExecutionStrategy.java:436`). If they can't be
    coerced, asking throws, graphql-java reports a field error, and no call is
    recorded, since the resolver never got arguments.
- **schema:** `SchemaParser`, then `SchemaGenerator` with `MOCKED_WIRING`,
  which runs `SchemaTypeChecker` and then `SchemaValidator` when it builds the
  `GraphQLSchema`. `schema-extensions`: `SchemaParser` keeps the document's
  type system extensions in the `TypeDefinitionRegistry`, and
  `SchemaGenerator` checks them (`SchemaTypeExtensionsChecker`) and applies
  them to the types they extend. graphql-java reports an invalid schema with a
  `GraphQLException` subclass: `InvalidSyntaxException`, `SchemaProblem`,
  `InvalidSchemaException` or `AssertException`. Those are `valid: false`. Any
  other exception or error, such as a `ClassCastException`, is a crash and gets
  an `error` answer.
- **introspect:** the schema is built as for `schema`, and the kit's query
  runs through `GraphQL.execute`. A query that doesn't parse gets `GraphQL`'s
  request error, with no `data` entry. Good Faith Introspection, which
  graphql-java turns on by default, allows one `__schema` and one `__type` per
  operation, and each of `__Type`'s `fields`, `inputFields`, `interfaces` and
  `possibleTypes` once. The kit's queries ask for more (`wrappers: __type(…)`
  next to `__schema`, and several `__type` lookups), so the adapter turns it
  off for the request with its documented per-request switch
  (`GoodFaithIntrospection.GOOD_FAITH_INTROSPECTION_DISABLED`). It is a
  denial-of-service guard, not part of introspection. With `--good-faith`, the
  kit's queries are rejected ("`__Type.fields` is present too often").

## Results

`--strict`, `--validate`, with the kit as of this writing:

| Area | Result |
| --- | --- |
| execution | `--random 1500`: 5910 of 5916 distinct well-formed cases satisfy the reference; 1349 cases malformed (1338 `eventYieldsResult`, 11 streams `eventPerSourceEvent`); 6 fail `errorPathsUnique`. 36 subscription streams. |
| parse | 2701 of 2847 vectors agree, no crash (the 20 probes included). 85 of the 146 failing vectors are since September 2025 and 30 since September 2026. |
| validate | 3229 of 3354 vectors agree, and 85 crash: 58 description twins and 5 September 2026 documents that graphql-java's parser can't read, and 22 in the validator. |
| coerce | 2167 of 2219 results match, and 1 gets no response. `invalidNotExecuted` passes on all 807 invalid documents the validator rejects. Without `--validate`: 2117 of 2219, and 7 get no response. |
| schema | 445 of 490 schemas agree, 4 of the failures crashes. 17 of 62 checks fail; 13 of the 45 failing schemas are since September 2026 and 7 since September 2025. |
| introspect | Graded against September 2025, since September 2026's query is rejected. 24 of 64 results satisfy the reference, and the other 40 fail only SHOULD or informational checks. |

## Known deviations in the other areas

Each one below was reproduced with graphql-java's public API (`Parser.parse`,
`SchemaGenerator`, `Validator`, `GraphQL.execute`) through the adapter's
plain wiring.

### Parse

- **Descriptions on executable definitions (85 vectors, all since September
  2025, §2.2):** `"d" query {a}` is a syntax error. October 2021's grammar
  (`GraphqlOperation.g4:4`).
- **Empty selection sets (11 vectors, since September 2026, §2.5):** `{}` is a
  syntax error: `selectionSet : '{' selection+ '}'` (`GraphqlOperation.g4:13`).
- **No directive extensions, no directives on directive definitions (19
  vectors, since September 2026, §3.13.6, §3.13):** `extend directive @d @x`
  and `directive @d @x on FIELD` are syntax errors. `typeSystemExtension` has
  no directive extension, and `directiveDefinition` no directives
  (`GraphqlSDL.g4:10-12, 124`).
- **`"""\"""` is a complete block string (3 vectors, §2.10.4):** the lexer
  rule is `'"""' BlockStringCharacter*? '"""'`, and `BlockStringCharacter` is
  `'\\"""' | SourceCharacter` (`GraphqlCommon.g4:116-120`). The non-greedy loop
  takes `\` as a SourceCharacter and stops at the next `"""`. So
  `{a(x: """\""")}` parses, with the value `\`. By §2.10.4, `\"""` is an
  escaped triple quote, and the string is unterminated.
- **A surrogate pair from a fixed and a braced escape (1 vector, §2.10.4):**
  `"\uD83D\u{DCA9}"` parses as U+1F4A9. `UnicodeUtil` pairs a leading
  surrogate with the next escape whatever its form (`parser/UnicodeUtil.java:44-60`).
  Only two fixed-width escapes make a pair.
- **U+2028 and U+2029 are ignored (3 vectors, §2.1.2):** `{a b}` parses
  as `{a b}`. The lexer has `LineTerminator: [  ] -> channel(3)`
  (`GraphqlCommon.g4:146`), which the spec doesn't.
- **A variable in a variable definition's directive (1 vector, §2.11):**
  `query ($a: Int @d(x: $b)) {a}` parses. `variableDefinition` uses the
  non-const `directives` (`GraphqlOperation.g4:10`), whose arguments take
  `valueWithVariable` (`GraphqlCommon.g4:30`). The spec has `Directives[Const]`
  there.
- **Type system documents (`parse-sdl`):**
  - empty braces (12 vectors: §3.6, §3.7, §3.9, §3.10, §3.6.3, §3.9.1):
    `type T {}`, `interface I {}`, `enum E {}`, `input I {}`,
    `extend type T @d {}` and `extend enum E @d {}` parse. `fieldsDefinition`,
    `enumValueDefinitions` and `inputObjectValueDefinitions` take zero items
    (`GraphqlSDL.g4:65, 105, 119`), and an extension may end in
    `emptyParentheses` (`GraphqlSDL.g4:57`). The spec's lists need one item.
  - no `[lookahead != {]` (3 vectors, `document` grammar): `type T {a}`,
    `interface I @d {a}` and `extend schema @d {a}` parse as a definition
    followed by a query shorthand. `objectTypeDefinition` makes
    `fieldsDefinition` optional with no lookahead (`GraphqlSDL.g4:53`).
  - any name is a directive location (5 vectors, §3.13):
    `directive @d on FOO`, `on field`, `on on | FIELD` parse:
    `directiveLocation : name` (`GraphqlSDL.g4:126`). `SchemaTypeChecker`
    rejects an unknown location later, when a schema is built.
  - variables in type system directives (3 vectors, §2.10):
    `scalar S @d(a: $v)` parses. The type system grammar uses the same
    non-const `directives` as operations (`GraphqlCommon.g4:23, 30`).

### Validate

- **§5.3.2 not enforced with `__typename` (22 vectors):**
  `... on User { a: __typename } ... on Post { a: id }` is accepted. The
  field merging rule looks each field up in its parent type, where
  `__typename` isn't found, so its type is `null`
  (`validation/OperationValidator.java:1245-1246`), and the type comparison
  skips a pair with a `null` type (`:1417-1418`).
- **§5.2.4.1 with `@skip` or `@include` at a subscription's root (6 vectors,
  since September 2025):** `subscription { postAdded @skip(if: false) { id } }`
  is accepted, also through fragments. `validateSubscriptionUniqueRootField`
  collects the root fields with the directives applied and counts them, and
  never looks at the directives (`OperationValidator.java:1812-1834`).
- **The validator crashes on a subscription's root (22 vectors, §5.2.4.1):**
  it collects the root fields with no variables (`OperationValidator.java:1818`).
  `@include(if: $v)` then throws `NullPointerException`
  (`execution/conditional/ConditionalNodes.java:149`, unboxing the missing
  variable), and `@skip(if: true)` leaves no field, so `get(0)` throws
  `ArrayIndexOutOfBoundsException` (`:1827`). `GraphQL.execute` throws rather than
  answer. 21 of the 22 documents are invalid under October 2021 too: its
  CollectFields, run with empty variables, leaves no root field for
  `@skip(if: true)` or `@include(if: $v)`.
- **Non-finite Float literals (4 vectors, §5.6.1):** `{ echo(float: 1e400) }`,
  `-1e309`, `10e308` and `1.7976931348623159e308` are accepted.
  `GraphqlFloatCoercing#parseLiteralImpl` returns `doubleValue()` with no
  finiteness check (`scalar/GraphqlFloatCoercing.java:83-87`), and the
  validator uses that `parseLiteral`.
- **OneOf is checked during execution, not validation (6 vectors, since
  September 2025):** `{ echo(pick: {id: null}) }` (§5.6.1) and a nullable
  variable for a OneOf field (§5.8.5, 5 vectors, such as
  `query Q($v: ID) { echo(pick: {id: $v}) }`) are accepted. The validator only
  counts a OneOf literal's fields (`validation/ValidationUtil.java:163-167`),
  and `VariablesTypesMatcher` knows nothing of OneOf.
  `execution/ValuesResolverOneOfValidation` rejects both while executing.
- **§5.7.3 not checked on variable definitions (1 vector):**
  `query Q($v: Int @once @once)` is accepted. `validateUniqueDirectiveNamesPerLocation`
  runs for fields, fragments, inline fragments, spreads and operations, but
  not in `checkVariableDefinition` (`OperationValidator.java:589-607`).
- **A numeric literal over 100 characters (1 valid vector, `acceptsValid`):**
  `{ echo(float: 1000…0) }` with a 309-digit literal is refused by the parser's
  documented limit (`ParserOptions.MAX_NUMERIC_LITERAL_CHARACTERS`,
  `parser/ParserOptions.java:54`). The invalid sibling is refused the same
  way, which passes.
- **Grammar newer than graphql-java's parser (63 crashes):** the 58 description
  twins (since September 2025) and 5 documents with September 2026 grammar
  (an empty selection set, `directive @x @deprecated on FIELD`) don't parse.
  The kit counts these as crashes toward the release that introduced the
  grammar; one of them is valid (`acceptsValid`).

### Coerce

With validation (`--validate`), what graphql-java does for a request:

- **ID accepts any value (31 vectors, §3.5.5):** a variable of `true`, `1.5`,
  `[]` or `{"a": 1}` for `ID` becomes `"true"`, `"1.5"`, `"[]"`, `"{a=1}"`.
  `GraphqlIDCoercing#convertImpl` ends with `return String.valueOf(input)`
  (`scalar/GraphqlIDCoercing.java:47`). The JSON number `1e400`, which Jackson
  reads as the binary64 infinity, becomes `"Infinity"` the same way; the kit
  counts that one under `id` too.
- **Descriptions on executable definitions (8 vectors, since September 2025,
  `descriptionsInert`):** `"d" query Q { int(v: 1) }` is a syntax error, as in
  parse.
- **A source stream that can't be created answers `"data": null`
  (`requestErrorNoData`, MUST, 5 vectors, since September 2026):** when the
  subscription root field's data fetcher throws (4 vectors), or its arguments
  can't be coerced (`subscription($x: Int = 1) { eventNN(v: $x) }` with
  `{"x": null}`), the result is `{"errors": [...], "data": null}`.
  `SubscriptionExecutionStrategy#execute` returns
  `new ExecutionResultImpl(null, errors)` when there is no publisher
  (`execution/SubscriptionExecutionStrategy.java:80-81`), and
  `ExecutionResultImpl` writes `data` whenever it is given one. September
  2026 makes this a request error, which has no `data` entry (§7.1.3, §7.1.5).
- **Block strings (2 vectors, §2.10.4):** `"""\ta\r\n\t\tb\r  c"""` reaches
  the resolver as `"\ta\r\nb\r  c"` instead of `"\ta\nb\nc"`, and a
  whitespace-only line shorter than the common indent keeps its spaces
  (`a\n  \nb` instead of `a\n\nb`). `StringValueParsing#removeIndentation`
  splits lines on `\n` only, so CR and CRLF don't end a line
  (`parser/StringValueParsing.java:29`), and only removes the common indent
  from a line longer than it (`:56`).
- **The literal `1e400` for Float (1 vector, §3.5.2):** accepted, and reaches
  the resolver as `Infinity` (`GraphqlFloatCoercing.java:83-87`, as in
  validate). The literal `99999999999999999999` reaches it as `1.0E20`, which
  the informational `floatPrecision` records.
- **A null variable as a Non-Null list item (1 vector, §3.11):**
  `query($x: Int = 1) { intsNN(v: [1, $x]) }` with `{"x": null}` gives the
  resolver `[1, null]` for `[Int!]!`. List literals coerce each item with
  `literalToInternalValue` (`execution/ValuesResolverConversion.java:744-753`),
  which returns a variable's value as it is (`:659-662`), with no Non-Null
  check.
- **OneOf (3 vectors, `onlyValidExecuted`, SHOULD, since September 2025):** the
  validator accepts `{ oneOfExample(arg: { a: null }) }` (see Validate), and
  execution then raises a field error instead of a request error.
- **The validator crashes on a missing fragment in a subscription (1 vector,
  `responds`):** for `subscription { event(v: 1) ...Missing }`,
  `validateSubscriptionUniqueRootField` collects the root fields, and
  `FieldCollector` passes the missing fragment's `null` definition to
  `ConditionalNodes#shouldInclude` (`execution/FieldCollector.java:96-98`),
  which throws `NullPointerException` (`ConditionalNodes.java:39`).
  `GraphQL.execute` throws, so there is no response.

The new checks pass: the 16 documents that don't parse and the 6 with type
system definitions are request errors, argument errors below the root are
field errors at every position, the source stream gets the root field's
arguments, and request extensions don't change the answer.

Without validation, graphql-java's literal coercion assumes a validated
document. `ValuesResolverConversion` says so: "no validation" (`:711`, `:729`,
`:770`) and `assertShouldNeverHappen("Should have been validated before")`
(`:811`). These fail only unvalidated:

- **A null literal for a Non-Null type (16 vectors in `nonNull`, 9 in
  `argumentsBelowRoot`, 3 in `arguments`; §3.10, §3.11, §3.12, §6.4.1):**
  `{ intNN(v: null) }`, `{ pair(b: null) }`, `{ items { intNN(v: null) } }`
  and `{ point(v: { x: null }) }` reach the resolver with the nulls.
  `isNullValue` doesn't recognise a `NullValue` literal
  (`ValuesResolverConversion.java:833-841`), so the Non-Null checks
  (`ValuesResolver.java:360`, `ValuesResolverConversion.java:810`) miss it, and
  `literalToInternalValueImpl` returns null for it before looking at the type
  (`:663-665`).
- **An unknown input object field is dropped (5 vectors, §3.10):**
  `{ point(v: { x: 1, z: 1 }) }` gives `{x: 1, y: 0}`. Input object literals
  are coerced by looping over the type's fields (`:786`), so a field the type
  doesn't define is never looked at.
- **A null or missing variable as a Non-Null list item (5 vectors, §3.11):**
  as above, and four more that validation would reject, such as
  `query($x: Int) { intsNN(v: [1, $x]) }` with `{}`, which gives `[1, null]`.
- **Type system definitions are skipped (5 vectors, §2.3):**
  `type T { a: Int } query { int(v: 1) }` runs the operation.
- **A second subscription root field (2 vectors, §6.3.2, §6.2.3.1):**
  `subscription { event(v: 1) nope }` creates `event`'s source stream instead
  of raising a request error; graphql-java leaves the rule to validation.
- **A subscription whose source stream can't be created** answers
  `"data": null` here too (8 vectors).
- **No response (7 vectors, `responds`):** `GraphQL.execute` throws instead of
  answering. An undefined field, `{ int(v: 1) nope }`, throws `AssertException`
  ("Unknown field 'nope'", `introspection/Introspection.java:818`, from
  `ExecutionStrategy#getFieldDef`); a missing fragment throws
  `NullPointerException` (`FieldCollector.java:96-98`); and a document with no
  operation, `fragment F on Query { int(v: 1) }` or `type T { a: Int }`, makes
  `NodeUtil.getOperation` call `next()` on an empty iterator
  (`language/NodeUtil.java:82`), which throws `NoSuchElementException`.

A JSON string with a lone surrogate reaches String and ID as sent, which the
informational `loneSurrogates` check records.

### Schema

- **Crashes (4 schemas):** a type of the wrong kind where graphql-java casts
  it, instead of a validation error: `type Query { f(x: Query): Int }` and the
  same argument on an interface field (`ClassCastException` at
  `schema/GraphQLTypeResolvingVisitor.java:78`), `input In { x: Query }`
  (`:90`), and `interface Query { a: Int }` with no `schema` definition
  (`ClassCastException` at `schema/idl/SchemaGeneratorHelper.java:923`, which
  assigns the type found by that name to a `GraphQLObjectType`). With a
  `schema { … }` definition, the same mistake is a `SchemaProblem` ("The
  operation type 'query' MUST have a object type as its definition").
  `SchemaValidator` has an `InputAndOutputTypesUsedAppropriately` rule, but
  the build fails before it runs.
- **Rules with no check:** a type named `__T`, for every kind of type
  (`typeNameReserved`, 5 schemas: `TypeAndFieldRule` checks `__` on fields,
  arguments and enum values, `schema/validation/TypeAndFieldRule.java:184-227`,
  not on type names), the same type for two root operations, an extension's
  included (`rootTypesDifferent`, 4), `implements I & I`, on an object and an
  interface (`implementsUnique`, 2), `type Int { … }` and `input ID { … }`
  (`typeNameNotBuiltin`, 2), `extend scalar Int @specifiedBy(url: …)`
  (`specifiedByNotBuiltin`, 2), `extend schema @d` for a non-repeatable `@d`
  the schema already has (`extensionDirectivesNotReapplied`, 1), a directive
  applied to a directive definition's argument at a location it isn't
  declared for (`directiveLocationsValid`, 1: `SchemaTypeDirectivesChecker`
  doesn't look at directive definitions), and a directive that reaches itself
  through an input field's directive (`directiveReferencesItselfIndirectly`, 1).
  `SchemaValidator` lists its rules at `schema/validation/SchemaValidator.java:18-28`.
- **A scalar and another type with the same name (`typeNamesUnique`, 1
  schema):** `input A { a: Int } scalar A` is accepted.
  `TypeDefinitionRegistry` keeps scalars in their own map and checks names
  within each map (`schema/idl/TypeDefinitionRegistry.java:286-291`).
- **Since September 2025 (6 schemas):** default values that don't coerce
  (`argDefaultCompatible`, 2): `f(x: Float = 1e400)` (no finiteness check, as
  in coerce) and a OneOf default with a null entry; a deprecated field
  implementing one that isn't (`implDeprecation`, 2); and
  `extend input In @oneOf` (`extensionOneOf`, 2).
- **Since September 2026:** a cycle through a OneOf input object
  (`inputObjectUnbreakableCycle`, 2 schemas), which September 2025's rule
  accepts too.
- **Rejects valid schemas (`acceptsValid`, 14 schemas):**
  - September 2026 syntax (11, all since September 2026): directives on a
    directive definition and `extend directive`, which the parser can't read;
  - the location `DIRECTIVE_DEFINITION` (1): `directive @d on DIRECTIVE_DEFINITION`
    is "tried to use a location 'DIRECTIVE_DEFINITION' but that is illegal".
    `Introspection.DirectiveLocation` has no such value
    (`introspection/Introspection.java:559-582`), and `SchemaTypeChecker`
    rejects a location it doesn't list (`schema/idl/SchemaTypeChecker.java:157`);
  - an argument default that differs from the interface's (1, since September
    2025): with `interface I { f(x: Int! = 1 @deprecated): Int }`,
    `type Query implements I { a: I f(x: Int!): Int }` is "tried to redefine
    field 'f' arguments … from 'x:Int! =1' to 'x:Int!'". `ImplementingTypesChecker`
    compares the printed arguments, defaults included
    (`schema/idl/ImplementingTypesChecker.java:190-193`); §3.6 only asks for
    the same type;
  - a list of a union member for a list of the union (1): with
    `interface I { f: [U] }` and `union U = A`, `type Query implements I { f: [A!] }`
    "does not implement interface 'I'". `TypesImplementInterfaces#isCompatible`
    checks union membership before it unwraps the implementation's Non-Null,
    so `A!` isn't found among `U`'s members
    (`schema/validation/TypesImplementInterfaces.java:191-192`). `f: [A]`
    passes.

### Introspect

- **Between the editions:** graphql-java has September 2025's
  `__Type.isOneOf`, `__InputValue.isDeprecated` and `deprecationReason`, and
  `includeDeprecated` on `args` and `inputFields`, but not September 2026's
  `__Directive.isDeprecated` or `__Schema.directives(includeDeprecated:)`
  (`introspection/Introspection.java:612-677`). So September 2026's query is
  rejected ("Unknown field argument 'includeDeprecated'"), and the run is
  graded against September 2025, where every MUST check passes.
- **Nullability of the built-in fields (`builtinNullability`, SHOULD, 38
  results, since September 2025):** every `includeDeprecated` argument is
  `Boolean = false`, not `Boolean! = false` (`Introspection.java:335, 503,
  516, 523, 631`), and `__InputValue.isDeprecated` is `Boolean`, not
  `Boolean!` (`:259-260`).
- **`__Type.specifiedByUrl` (`builtinAdditions`, INFO):** a deprecated legacy
  field next to `specifiedByURL` (`Introspection.java:537-540`).
- **Block descriptions with CR (`descriptions`, SHOULD, 3 results):**
  `"""An interface\r\nover x\r\n"""` is returned as `"An interface\r\nover x\r"`,
  not `"An interface\nover x"`: the same `StringValueParsing#removeIndentation`
  as in coerce.
- **Control characters in a printed default value (`defaultValuePrinting`,
  SHOULD, 3 results, since September 2025):** `f(c: String = "\u0001")` has
  the `defaultValue` `"` U+0001 `"`, unescaped. `EscapeUtil#escapeJsonStringTo`
  escapes `"`, `\`, `\b`, `\f`, `\n`, `\r` and `\t` and writes every other
  character as it is (`util/EscapeUtil.java:24-53`).
- `@defer` and `@experimental_disableErrorPropagation` are returned as the
  service's own directives, which the spec allows.
