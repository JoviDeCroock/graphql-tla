# Apollo Kotlin adapter

A [graphql-tla conformance adapter](../../docs/conformance.md) for Apollo
Kotlin's server-side execution library,
[apollo-execution](https://github.com/apollographql/apollo-kotlin/tree/main/libraries/apollo-execution),
version 5.2.0 (`com.apollographql.apollo:apollo-execution-jvm:5.2.0` on Maven
Central, which brings `apollo-ast` and `apollo-api` 5.2.0 with it). It
answers `execution` and every [area beyond it](../../docs/kit-areas.md):
`parse`, `validate`, `coerce`, `schema`, `introspect` and `coordinate`.

Source references below are to Apollo Kotlin at tag `v5.2.0`, relative to
each library's `src/commonMain/kotlin/com/apollographql/apollo/` directory:
`execution/…` is `libraries/apollo-execution`, `ast/…` is
`libraries/apollo-ast`, and `api/…` is `libraries/apollo-api`.

## Build

Needs JDK 21 and Maven. Maven fetches Kotlin and Apollo itself.

```shell
cd adapters/apollo-kotlin
mvn -q package        # writes target/apollo-kotlin-adapter.jar (a fat jar)
```

The version is pinned in `pom.xml` (`apollo.version`). The adapter reports it
in `hello`.

## Run

```shell
node kit/cli.mjs run execution --adapter "adapters/apollo-kotlin/run.sh" --strict --random 1500
node kit/cli.mjs run coerce --adapter "adapters/apollo-kotlin/run.sh" --strict
```

`run.sh` runs `java -jar target/apollo-kotlin-adapter.jar`, with
`$JAVA_HOME/bin/java` if `JAVA_HOME` is set, and passes its arguments on.
`--no-idle` leaves out `idle`, so the kit falls back to `--grace`.

## How it works

`Adapter.kt` handles execution. Each `execute` builds an `ExecutableSchema`
the way a server does:

- `ExecutableSchema.Builder().schema(sdl)`.
- One `Resolver` on every field.
- A `TypeResolver` that picks the object type named by the value's
  `__typename`.
- A `Coercing` for each custom scalar. apollo-execution refuses to serialize
  a custom scalar it has none for.

The request is a JSON body parsed with apollo-execution's own
`parseAsGraphQLRequest`, so Apollo's JSON reader reads the variables. The
response is `GraphQLResponse#serialize`'s JSON, passed to the kit as Apollo
wrote it.

The resolver sends `call`, stamped with `after` (the settles applied so far).
It then suspends on a `CompletableDeferred` that the kit's `settle` completes.
On an `error` outcome it throws; otherwise it returns the outcome's value.

The determinism hook is the coroutine dispatcher.

- apollo-execution starts every field with `CoroutineStart.UNDISPATCHED` and
  has no dispatcher of its own.
- The adapter runs every coroutine on a dispatcher that queues resumptions
  and drains the queue on the thread that reads stdin.
- Once the queue is empty after a kit message, every coroutine is suspended
  on a kit deferred or the kit's source stream. That is when the adapter
  sends `idle`.

### Capabilities claimed

- `idle`: see above. The kit's determinism replay passes.
- `invalid-results`: a wrong-shape value becomes a field error.
  `completeValue` reports a non-list in a list position, an object for a leaf
  and a value without a matching runtime type.
- `uncoercible-results`: the resolver returns one of these:
  - `1.2` for an Int
  - `Double.POSITIVE_INFINITY` for a Float
  - the name `NOT_A_VALUE` for an enum
- `custom-scalar-results`: each custom scalar's `Coercing` is Apollo's own
  `JsonCoercing`, which passes values through. Its `serialize` throws on one
  marker value, the kit's `uncoercible`, and apollo-execution turns that into
  a field error.
- `scalar-results`: the resolver returns the kit's `value` as read: an
  `Int` 4 for an ID, a `Long` 2147483648 for an Int.
- `parent-values`: the root value and every object a resolver returns are
  maps carrying the kit's token. Each `call` reports the token of
  `ResolveInfo#parentObject`.
  - The root value comes from `queryRoot`, `mutationRoot` and
    `subscriptionRoot`, apollo-execution's root resolvers.
- `mutation`: apollo-execution runs mutation root fields serially.
- `error-propagation-off`: `ExecutableSchema.Builder#onError(OnError.NULL)`.
  This is apollo-execution's own switch for the service's default error
  behavior. It also advertises the behavior in `__service`.
- `subscription`: apollo-execution uses each item of the source stream as
  the root field's value.
  - `OperationContext#executeSubscriptionEvent` completes the item and calls
    no resolver on it (`execution/internal/OperationContext.kt:262-278`). So
    the source stream's request for an event is the root `call`, and the
    settled outcome is the event.
  - An `error` outcome is emitted as an apollo `Error` at the root field's
    path. `completeValue` treats an `Error` value as the field's error, as it
    does when a resolver throws.
  - So `parentValue` at a subscription's root says nothing about Apollo;
    below the root it does.
- `subscription-stream`: the subscription root field's resolver returns a
  `Flow` that the kit drives.
  - `emit` is the root `call` above. `complete` ends the flow, and `fail`
    throws from it.
  - apollo-execution cancelling the flow's collection is reported as
    `source-cancelled`.
  - The adapter collects `ExecutableSchema#subscribe` as a client would.
    Each `SubscriptionResponse` is a `response`, and the flow's normal end is
    `done`.
  - A `SubscriptionError` is a `stream-error`. That is apollo-execution's
    terminal "the subscription failed" item, not an execution result.
  - The kit's `cancel` cancels the collecting coroutine. When it has
    finished, the adapter reports `done`.

### Capabilities not claimed

- `deferred-items`: apollo-execution doesn't wait for list items. Each item
  is completed as it is (`execution/internal/OperationContext.kt:411-415`),
  and a resolver can only suspend for a whole field. The kit's items come
  inline.
- `exact-numbers` (coerce): Apollo's JSON reader keeps integers as `Int` or
  `Long`. Any other number, an integer beyond a `Long` included, goes through
  `Double` (`api/json/JsonReaders.kt:77-98`, whose comment says so).
- `unvalidated` (coerce): `ExecutableSchema#execute` always parses and
  validates first. There is no public way to run an unvalidated document.
  The persisted-document cache could hand one over, but that cache is meant
  for documents apollo-execution validated itself.

## The other areas

`Areas.kt` answers them. Besides the area names, it claims:

- `parse-sdl`
- `schema-extensions`
- `custom-scalar-literals`
- `custom-directives`
- `absent-vs-null`
- `nested-fields`
- `subscription-source`
- `request-extensions`

An exception Apollo throws where it should have given a verdict or a response
is answered with an `error`. The kit reports that as a crash of Apollo's on
that vector (in coerce, as no response). Only the message's first line
reaches the report; the stack trace goes to stderr.

- **parse:** `parseAsGQLDocument(ParserOptions.Default)`.
  - This is how apollo-execution parses a request's document and how
    `ExecutableSchema.Builder#schema` parses SDL. A `ParsingError` is
    `ok: false`.
  - Apollo has one parser for the whole Document grammar. So for a narrower
    grammar, every definition must also be of a kind it allows:
    - executable definitions for `executable`
    - schema, type and directive definitions for `typeSystem`
    - those and type system extensions for `typeSystemExtension`
    - anything for `document`
- **validate:** apollo-execution has no public validate function.
  - It validates in `ExecutableSchema#execute`:
    1. Parse with the schema's `ParserOptions`.
    2. `validateAsExecutable`.
    3. Keep only the `GraphQLIssue`s (`execution/internal/prepare.kt:23-40`).
  - It hands the verdict to a `PersistedDocumentCache` when a request names
    a persisted query the cache doesn't have yet: `ValidPersistedDocument`,
    or `ErrorPersistedDocument` with the issues.
  - The adapter's cache records that verdict and throws, so nothing runs
    after validation. The request carries
    `extensions: {persistedQuery: {sha256Hash}}` and the document.
  - That is the verdict a request gets, and the issues are apollo-ast's
    own. A parse error is a crash, since every vector parses.
  - `custom-scalar-literals`: the validator accepts any literal for a custom
    scalar.
  - `custom-directives`: the SDL's directive definitions are part of the
    schema.
- **coerce:** every field's resolver records its path and its arguments.
  - The arguments are `ResolveInfo#getArgument` for each argument the field
    defines, leaving out `Optional.Absent`. That is `absent-vs-null`.
  - Each resolver returns what the field's type needs (`nested-fields`):
    `"ok"` for a leaf, a map for an object, two maps for a list of objects.
  - The request is a JSON body parsed with `parseAsGraphQLRequest`, so the
    request's `extensions` travel in the body (`request-extensions`). It runs
    through `ExecutableSchema#execute`.
  - The response is `GraphQLResponse#serialize`'s JSON.
  - JSON has no form for a non-finite number, so one becomes the string
    `"Infinity"`.
  - When apollo-execution hands a resolver an uncoerced AST literal (see the
    deviations), the adapter writes it as its class and GraphQL text, such as
    `"GQLIntValue: 7"`. That matches no coerced value.
  - `subscription-source`: a subscription goes through
    `ExecutableSchema#subscribe`, as a server routes a subscription request.
    - The subscription root field's resolver is its source stream resolver.
      It records the source call, then throws (`subscribe: "raise"`) or
      returns a `Flow` of one event.
    - The response is the first item of the response flow, which is then
      cancelled.
    - As in execution, the event is the root field's value. The adapter
      records the root call, with the source resolver's arguments, when the
      flow emits the event.
- **schema:** `ExecutableSchema.Builder().schema(sdl).build()`.
  - It adds Apollo's built-in definitions, then runs `GQLDocument#toSchema`,
    which is `validateAsSchema().getOrThrow()`. That merges extensions
    (`schema-extensions`) and validates
    (`execution/ExecutableSchema.kt:295-310`).
  - Apollo reports an invalid schema in one of two ways. Either can be
    `valid: false`:
    - a `SourceAwareException` (parse errors and issues)
    - an `IllegalStateException` saying "Source schema cannot contain
      definition", for a definition of one of its own built-in names
  - Any other exception is a crash.
- **introspect:** the schema is built as for `schema`, and the kit's query
  runs through `ExecutableSchema#execute`. A schema Apollo refuses is
  answered as a request error.
- **coordinate:** apollo-ast's schema coordinate API.
  1. `parseAsGQLSchemaCoordinate`: an issue is `ok: false`.
  2. `resolveSchemaCoordinate` against the `Schema` that `toSchema` builds
     from the SDL. It throws `IllegalArgumentException` when the element
     containing the coordinate's isn't in the schema, which is `error`.
  - The resolved element's kind is its `Resolved*` class.
  - `ResolvedSchemaElement` doesn't carry its container, so the container
    names in `path` are the ones Apollo parsed.

## Results

`--strict` with the kit as of this writing. No adapter problems, kit errors
or timeouts. Every checker self-test passes.

| Area | Result |
| --- | --- |
| execution | `--random 1500`: 31362 cases, 5788 distinct, plus 36 subscription streams. 5714 of 5788 distinct well-formed cases satisfy the reference, and 701 cases are malformed (`resultCoercion`). 60 cases fail `serialErrorsKept` and 14 fail `dataMatches`. `errorLocationsPresent` (SHOULD) fails in 20207 cases. No stream lifecycle failure. |
| parse | 2824 of 2847 vectors agree, and 5 crash. 4 of the failures are since September 2025. |
| validate | 3206 of 3357 vectors agree, and 2 crash; 13 unspecified vectors aren't graded. 14 of the 151 failing vectors are since September 2025. |
| coerce | 556 of 2222 results match. 1621 fail only because a request error carries `"data": null`. No crash and no "no response". |
| schema | 381 of 496 schemas are judged as `TypeSystem.tla` judges them, and 5 crash; 5 unspecified schemas aren't graded. 22 of 62 checks pass. |
| introspect | Graded against September 2025, since the introspection types lack `__Type.isOneOf`. 4 of 64 results satisfy the reference, and 2 more fail only a SHOULD or informational check. 7 queries, new in September 2026, aren't asked. |
| coordinate | 185 of 210 vectors agree. All 25 failures are `noIgnored`, since September 2025. |

## Known Apollo Kotlin deviations

Every failure below is apollo-execution's or apollo-ast's own behavior,
reached through the public API (`ExecutableSchema`, `parseAsGQLDocument`,
`parseAsGQLSchemaCoordinate`, `resolveSchemaCoordinate`). None comes from
the adapter. Levels are the kit's: MUST unless noted.

### Execution

- **An unknown enum value is passed through (`resultCoercion`, MUST, 336
  cases):**
  - Example: `{ color }`, where `color: Color` resolves to `"NOT_A_VALUE"`,
    gives `{"data":{"color":"NOT_A_VALUE"}}` with no error.
  - Cause: with no `Coercing` registered for an enum, `serialize` only checks
    that the value is a `String`, not that it is one of the enum's values
    (`execution/Coercing.kt:80-87`).
- **A non-finite Float leaves the client with no response
  (`resultCoercion`, MUST, 365 cases):**
  - Example: `{ ratio }`, where `ratio: Float` resolves to `Infinity`.
  - Cause: Float's `serialize` checks only that the value is a `Double`
    (`execution/Coercing.kt:51-56`). The value lands in `data`, and
    `GraphQLResponse#serialize` then throws "Numeric values must be finite,
    but was Infinity" (`api/json/BufferedSinkJsonWriter.kt:142-147`).
  - Effect: a server serializing the response gets an exception instead of a
    field error.
- **Errors at earlier root fields are lost when a Non-Null error propagates
  (`serialErrorsKept`, MUST since September 2025, SHOULD in October 2021,
  60 cases):**
  - Example: `mutation { first second third }`, where `first: Int` throws
    and `second: Int!` resolves to null. The result is
    `{"errors":[{"message":"A resolver returned null in a non-nullable position","path":["second"]}],"data":null}`,
    and `first`'s error is missing.
  - Cause: apollo-execution keeps field errors as `Error` values inside the
    result tree, and collects them only when it finalizes the response
    (`execution/internal/OperationContext.kt:158-163`). When a Non-Null field's error
    propagates, `executeGroupedFieldSet` returns that one `Error` in place of
    the whole map, and the errors already in the map are dropped
    (`execution/internal/OperationContext.kt:541-551`).
  - Queries go through the same function (with `serial = false`), but the
    kit grades this in `mutation`.
- **A subscription event whose Non-Null root field is null keeps the field
  (`dataMatches`, MUST, 14 cases):**
  - Example: `subscription { postLiked { id } }`, where `postLiked: Post!`
    and the event is null. The result is
    `{"errors":[{"message":"A resolver returned null in a non-nullable position","path":["postLiked"]}],"data":{"postLiked":null}}`
    instead of `"data": null`.
  - Cause: `executeSubscriptionEvent` wraps the completed value as
    `mapOf(responseName to fieldData)` without propagating the root field's
    error (`execution/internal/OperationContext.kt:262-278`). Queries and
    mutations propagate it through `executeGroupedFieldSet`.
- **Execution errors have no `locations` (`errorLocationsPresent`, SHOULD,
  20207 cases, and 1399 more in `noPropagation`, INFO):**
  - Example: `{ node { id } }` where `node`'s resolver throws gives
    `{"message":"Cannot resolve 'node': resolver at node failed","path":["node"]}`.
  - Cause: every error raised while executing a field is built with
    `Error.Builder(message).path(path)` and no location. Examples are the
    resolver failure at `execution/internal/OperationContext.kt:482`, the
    null in a non-null position at `:393`, and the non-list at `:406`.

### Parse

- **Empty documents are accepted (`document`, 4 vectors;
  `typeSystemDocuments`, 3; `comments`, 1):**
  - Examples: `""`, and a byte order mark followed by a comment, parse as
    documents with no definitions.
  - Cause: `ParserOptions.allowEmptyDocuments` defaults to `true`
    (`ast/api.kt:91`), and `parseDocument` then uses `parseList`, which
    takes zero definitions (`ast/internal/Parser.kt:21-27`).
  - apollo-execution parses requests and SDL with the default options.
- **A description on the query shorthand (`descriptions`, 3 vectors):**
  - Example: `"d" {a}` parses.
  - Cause: `parseOperationDefinition` reads an optional description before
    checking for `{` (`ast/internal/Parser.kt:286-300`). §2.2 allows a
    description only on an operation with an operation type.
- **The parser crashes on a missing fragment name (`fragments`, 3 vectors;
  `operations`, 1; `document`, 1; all crashes):**
  - Examples: `fragment $ on F {a}` and `fragment {` throw
    `ClassCastException: Token$Dollar cannot be cast to Token$Name` instead
    of a `ParsingError`.
  - Cause: `parseFragmentName` casts the current token to `Token.Name`
    without checking it (`ast/internal/Parser.kt:159-160`).
- **Braced escapes with more than 8 hex digits (`stringValue`, 2 vectors,
  since September 2025):**
  - Example: `{a(x: "\u{000000041}")}` is a syntax error ("Invalid Unicode
    escape").
  - Cause: the lexer reads at most 9 characters, the closing brace included,
    after `\u{` ("An int32 has 8 hex digits max",
    `ast/internal/Lexer.kt:215-252`). Leading zeros are allowed by §2.10.4.
- **A lone surrogate in a string is accepted (`sourceText`, 2 vectors, since
  September 2025):**
  - Example: `{a(x: "\udc00")}`, with U+DC00 written as source text, parses.
  - Cause: the lexer copies string characters as they are
    (`ast/internal/Lexer.kt:333-334`: "TODO: we are lenient here and allow
    potentially invalid chars like invalid surrogate pairs").
- **Empty variable definitions (`variables`, 1 vector;
  `insignificantCommas`, 1):**
  - Examples: `query () {a}` and `query (,) {a}` parse.
  - Cause: `parseVariableDefinitions` uses `parseListOrNull`, which accepts
    `()` (`ast/internal/Parser.kt:324-328`). §2.11's `VariablesDefinition`
    needs at least one.
- **Any name as an operation type (`schemaDefinition`, 1 vector):**
  - Example: `schema { Query: Q }` parses.
  - Cause: `parseOperationType` takes any `Name`
    (`ast/internal/Parser.kt:282-284`). The schema is then refused when it
    is built, but not by the parser.

### Validate

apollo-execution counts only `GraphQLIssue`s (`execution/internal/prepare.kt:27, 36`).
apollo-ast reports some spec rules as `ApolloIssue`s, which are warnings for
the Apollo compiler, so apollo-execution drops them.

- **§5.2.4.1 Single Root Field (`singleRootField`, 62 vectors, 7 since
  September 2025):**
  - Examples: `subscription sub { __typename }` and `subscription { a b }`
    are valid for Apollo.
  - Cause: apollo-ast has no rule for a subscription's root fields.
- **§5.2.3.1 Lone Anonymous Operation (`loneAnonymousOperation`, 21
  vectors):**
  - Example: `{ dog { name } } query getName { dog { owner { name } } }` is
    valid for Apollo.
  - Cause: the rule reports an `AnonymousOperation`, an `ApolloIssue`
    (`ast/internal/ExecutableValidationScope.kt:685-690`, `ast/Issue.kt:112`),
    and apollo-execution drops it.
- **§5.8.4 All Variables Used (`allVariablesUsed`, 18 vectors, 1 since
  September 2025):**
  - Example: `query variableUnused($atOtherHomes: Boolean) { dog { isHouseTrained } }`
    is valid for Apollo.
  - Cause: an `UnusedVariable` is an `ApolloIssue`
    (`ast/internal/ExecutableValidationScope.kt:528`, `ast/Issue.kt:131`).
- **§5.6.3 Input Object Field Uniqueness (`inputObjectFieldUniqueness`, 9
  vectors):**
  - Example: `{ echo(filter: {limit: 1, limit: 2}) }` is valid for Apollo.
  - Cause: the input object check only looks for unknown fields
    (`ast/internal/InputValueValidationScope.kt:148-153`). Nothing checks
    for duplicates.
- **§5.8.5 with a `= null` default (`allVariableUsagesAreAllowed`, 8
  vectors):**
  - Example: `query Q($v: Int = null) { echo(list: [$v]) }`, where the item
    type is `Int!`, is valid for Apollo.
  - Cause: `isVariableUsageAllowed` lets a nullable variable into a Non-Null
    position whenever it has a default value, without checking that the
    default isn't `null` (`ast/gqltype.kt:25-27`).
- **§5.8.1 Variable Uniqueness (`variableUniqueness`, 7 vectors):**
  - Example: `query q($a: Boolean, $a: Boolean) { … }` is valid for Apollo.
  - Cause: variable definitions are checked one by one, never against each
    other (`ast/internal/ExecutableValidationScope.kt:459-480`).
- **Non-finite Float literals (`valuesOfCorrectType`, 6 vectors):**
  - Examples: `{ echo(float: 1e400) }` and `{ echo(float: -1e309) }` are
    valid for Apollo.
  - Cause: a Float literal is accepted by its token kind, with no check that
    it is finite (`ast/internal/InputValueValidationScope.kt:272-281`).
- **Int literals out of range (`intInputRange`, SHOULD, 4 vectors):**
  - Example: `{ echo(int: 2147483648) }` is valid for Apollo.
  - Cause: Int is checked by token kind only
    (`ast/internal/InputValueValidationScope.kt:265-270`).
- **Field Selection Merging compares list and object arguments wrongly
  (`fieldSelectionMerging`, 2 vectors):**
  - Example: `{ a: echo(list: [1, 2]) a: echo(list: [2, 1]) }` is valid for
    Apollo.
  - Cause: the argument comparison is `areEqual`
    (`ast/internal/fields_merging.kt:292`).
    - For lists, it returns `false` as soon as two items are *equal*, and
      `true` otherwise (`ast/internal/ExtensionsMerger.kt:520`).
    - For objects, it returns after comparing the first field
      (`ast/internal/ExtensionsMerger.kt:543`).
  - The same bug shows in the informational `identicalArgumentsReading`:
    4 pairs of identical arguments are read as conflicting.
- **The validator crashes on a fragment on an input type
  (`fragmentsOnObjectInterfaceOrUnionTypes`, 2 vectors, crashes):**
  - Example: `{ post { ... on Filter { __typename } } }`, where `Filter` is
    an input object. `execute` throws `SchemaValidationException: Cannot
    determine possibleTypes of GQLInputObjectTypeDefinition…` instead of
    answering with an error.
  - Cause: the "fragment spread is possible" check calls
    `Schema#possibleTypes` on the fragment's type
    (`ast/internal/ExecutableValidationScope.kt:330, 362`, through
    `ast/gqltypedefinition.kt:9`), and that throws for an input object
    (`ast/Schema.kt:163-175`).

The informational readings are:

- `fragmentSpreadReading`: invalid, the formal text (6)
- `oneOfVariableReading`: invalid, the prose (2)
- `identicalArgumentsReading`: valid for 1 and invalid for 4, as above

### Coerce

- **Every request error has `"data": null` (`requestErrorNoData`, MUST,
  1621 vectors; 12 since September 2025, 9 since September 2026):**
  - Example: an empty document gives
    `{"errors":[{"message":"The document does not contain any operation."}],"data":null}`.
  - Cause: `GraphQLResponse#serialize` always writes `data`
    (`execution/GraphQLResponse.kt:68-69`). §7.1.3 says a request error
    result has no `data` entry.
  - These vectors would otherwise pass, which is why the coerce total is
    low.
- **An Int literal for a Float is a field error (`float`, MUST, 9 vectors):**
  - Example: `{ float(v: 0) }` gives
    `{"errors":[{"message":"Check failed.","path":["float"]}],"data":{"float":null}}`.
    The resolver isn't called.
  - Cause: the validator accepts it (§3.5.2 input coercion). Argument
    coercion, though, does `check(value is GQLFloatValue)`
    (`execution/Coercing.kt:198-200`).
- **A Float default that is an Int literal (`variables`, MUST, 1 vector):**
  - Example: `query($x: Float = 2) { float(v: $x) }` is a request error,
    "Cannot coerce variable values: 'Check failed.'".
  - Cause: same as above.
- **Non-finite Float literals reach the resolver (`float`, MUST, 3
  vectors):**
  - Example: `{ float(v: 1e400) }` calls the resolver with `Infinity`.
  - Cause: `GQLFloatValue` is converted with `toDouble()`
    (`execution/Coercing.kt:198-201`). The validator doesn't check it either
    (see Validate).
- **An argument's default value goes to the resolver uncoerced (`variables`,
  MUST, 4 vectors; `arguments`, MUST, 2):**
  - Example: `query($x: Int) { intDefault(v: $x) }`, where
    `intDefault(v: Int = 7)` and there are no variables. The resolver's
    `v` is the AST node `GQLIntValue(7)`, not the Int 7.
  - Enum defaults (`GQLEnumValue`) and input object defaults
    (`GQLObjectValue`) behave the same.
  - Cause: when the variable has no value, `coerceArgumentValues` takes the
    argument's default literal. Because the argument is a variable, it then
    skips coercion
    (`execution/internal/coerceArgumentValues.kt:84-102`).
- **A field default is ignored for a variable with no value inside an input
  object literal (`inputObject`, MUST, 7 vectors, 2 since September 2025):**
  - Example: `query($y: Int) { point(v: { x: 1, y: $y }) }`, where
    `input Point { x: Int, y: Int = 0 }` and there are no variables. The
    resolver gets `{x: 1, y: null}` instead of `{x: 1, y: 0}`.
  - Cause: a variable in a literal is looked up with no fallback
    (`execution/internal/coerceArgumentValues.kt:149`). The field's default
    is only used when the field is absent from the literal (`:258-261`).
- **Unknown fields in a variable's input object are ignored (`inputObject`,
  MUST, 5 vectors):**
  - Example: `query($x: Point) { point(v: $x) }` with
    `{"x": {"x": 1, "z": 1}}` runs with `{x: 1, y: 0}`.
  - Cause: `coerceInputObject` maps the type's fields and never looks at
    the value's other keys (`execution/internal/coerceVariablesValues.kt:121-141`).
- **OneOf input objects aren't checked when coerced (`oneOf`, MUST, 4
  vectors, since September 2025):**
  - Examples: the variable values `{}`, `{"a": null}`, `{"a": 1, "b": 2}`
    and `{"c": 1}` for a `@oneOf` input are all accepted.
  - Cause: `coerceInputObject` has no OneOf case
    (`execution/internal/coerceVariablesValues.kt:121-141`).
- **The operation name isn't checked for a single operation
  (`getOperation`, MUST, 3 vectors):**
  - Example: `{ int(v: 1) }` with `operationName: "A"` runs the anonymous
    operation.
  - Cause: with one operation in the document, `prepare` takes it without
    comparing names (`execution/internal/prepare.kt:67-69`).
- **A null variable as a Non-Null list item (`list`, MUST, 1 vector):**
  - Example: `query($x: Int = 1) { intsNN(v: [1, $x]) }` with
    `{"x": null}` calls the resolver with `[1, null]` for `[Int!]!`.
  - Cause: a variable in a list literal is taken as is
    (`execution/internal/coerceArgumentValues.kt:149`), and nothing checks
    the item's Non-Null type.
- **A description on the query shorthand executes (`syntaxError`, MUST, 1
  vector):**
  - Example: `"d" { int(v: 1) }` executes. This is the parse deviation
    above.
- **An integer ID beyond a `Long` is refused (`idCoerced`, SHOULD, 3
  vectors):**
  - Example: `query($x: ID) { id(v: $x) }` with `{"x": 1e21}` is a request
    error, "Cannot deserialize '1.0E21' to an ID String".
  - Cause: Apollo's JSON reader reads the number as a `Double`
    (`api/json/JsonReaders.kt:77-98`), and ID input coercion accepts only a
    `String`, an `Int` or a `JsonNumber` (`execution/Coercing.kt:255-261`).
- **Unused variables are executed (`onlyValidExecuted`, SHOULD, 2
  vectors):**
  - Example: `query($x: Int, $unused: Int) { int(v: $x) }` runs.
  - Cause: this is the dropped `UnusedVariable` issue from Validate.

Observed, not graded:

- `floatPrecision`: refused, 1
- `loneSurrogates`: kept as sent, 2
- `requestExtensions`: the same answer as without extensions, 3

### Schema

The schema validation function's own documentation says it "does not pretend
to implement the full GraphQL validation rules" (`ast/api.kt:258-272`). The
rules it doesn't enforce, each with one example the kit gives, all MUST:

| Rule | Vectors | Example accepted |
| --- | --- | --- |
| `IMPL_FIELD_COVARIANT` | 9 | `interface I { f: Int! } type Query implements I { f: Int }` |
| `UNION_MEMBERS_OBJECTS` | 7 | `union U = Int type Query { u: U }` |
| `ARG_INPUT_TYPE` | 6 | `type Query { f(x: Query): Int }` |
| `DIRECTIVE_LOCATIONS_VALID` | 6 | `enum E @deprecated { A } type Query { e: E }` |
| `IMPL_FIELD_PROVIDED` | 5 | `interface I { f: Int } type Query implements I { g: Int }` |
| `IMPL_ARG_INVARIANT` | 5 | `interface I { f(a: Int): Int } type Query implements I { f(a: Int!): Int }` |
| `DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY` | 5 (1 since Sep 2026) | `directive @a @b on DIRECTIVE_DEFINITION directive @b @a on DIRECTIVE_DEFINITION type Query { a: Int }` |
| `ROOT_TYPES_DIFFERENT` | 4 | `schema { query: Q subscription: Q } type Q { a: Int } type S { a: Int }` |
| `FIELD_OUTPUT_TYPE` | 4 | `type O { x: Int } type Query { a: Missing }` |
| `REQUIRED_ARG_NOT_DEPRECATED` | 4 (since Sep 2025) | `type Query { f(oldArg: String! @deprecated): Int }` |
| `INPUT_FIELD_INPUT_TYPE` | 4 | `input In { x: Query } type Query { f(i: In): Int }` |
| `DIRECTIVE_EXTENSION_REFERENCES_PREVIOUS` | 4 (since Sep 2026) | `directive @d on FIELD \| DIRECTIVE_DEFINITION directive @e @d on DIRECTIVE_DEFINITION type Query { a: Int } extend directive @d @e` |
| `ROOT_TYPES_ARE_OBJECTS` | 3 | `schema { query: Q mutation: In } type Q { a: Int } input In { a: Int }` |
| `FIELD_NAMES_UNIQUE` | 3 | `type Query { a: Int a: Int }` |
| `FIELD_NAME_RESERVED` | 3 | `type Query { __a: Int }` |
| `ARG_NAME_RESERVED` | 3 | `type Query { f(__x: Int): Int }` |
| `ARG_NAMES_UNIQUE` | 3 (since Sep 2025) | `type Query { f(x: Int, x: Int): Int }` |
| `DIRECTIVE_USES_ITSELF` | 3 (1 since Sep 2026) | `directive @d @d on DIRECTIVE_DEFINITION type Query { a: Int }` |
| `IMPLEMENTS_UNIQUE` | 2 | `interface I { a: Int } type Query implements I & I { a: Int }` |
| `IMPL_ARG_PROVIDED` | 2 | `interface I { f(a: Int): Int } type Query implements I { f: Int }` |
| `IMPL_EXTRA_ARG_OPTIONAL` | 2 | `interface I { f: Int } type Query implements I { f(b: Int!): Int }` |
| `IMPL_DEPRECATION` | 2 (since Sep 2025) | `interface I { f: Int } type Query implements I { f: Int @deprecated }` |
| `UNION_MEMBERS_UNIQUE` | 2 | `union U = Query \| Query type Query { u: U }` |
| `EXTENSION_ITEMS_NEW` | 2 (1 since Sep 2025) | `enum E { A } type Query { e: E } extend enum E { A }` |
| `EXTENSION_ONEOF` | 2 (since Sep 2025) | `input In { a: Int } type Query { f(i: In): Int } extend input In @oneOf` |
| `SPECIFIED_BY_NOT_BUILTIN` | 2 | `type Query { a: Int } extend scalar Int @specifiedBy(url: "https://example.com/int")` |
| `ARG_DEFAULT_COMPATIBLE` | 1 (since Sep 2025) | `type Query { f(x: Float = 1e400): Int }` |
| `IMPL_TRANSITIVE` | 1 | `interface Node { id: ID } interface Resource implements Node { id: ID url: String } type Image implements Resource { id: ID url: String } type Query { i: Image }` |
| `UNION_MEMBERS_DEFINED` | 1 | `union U type Query { u: U }` |
| `ENUM_VALUES_DEFINED` | 1 | `enum E type Query { e: E }` |
| `ENUM_VALUES_UNIQUE` | 1 | `enum E { A A } type Query { e: E }` |
| `ENUM_VALUE_NAME_RESERVED` | 1 | `enum E { __A } type Query { e: E }` |
| `INPUT_FIELD_NAMES_UNIQUE` | 1 | `input In { x: Int x: Int } type Query { f(i: In): Int }` |
| `INPUT_FIELD_NAME_RESERVED` | 1 | `input In { __x: Int } type Query { f(i: In): Int }` |
| `REQUIRED_INPUT_FIELD_NOT_DEPRECATED` | 1 (since Sep 2025) | `input In { x: Int! @deprecated } type Query { f(i: In): Int }` |
| `EXTENSION_ITEMS_UNIQUE` | 1 | `enum E { A } type Query { e: E } extend enum E { B B }` |
| `DIRECTIVE_EXTENSION_USES_PREVIOUS` | 1 (since Sep 2026) | `directive @d on FIELD \| DIRECTIVE_DEFINITION type Query { a: Int } extend directive @d @d` |

Two more findings aren't missing rules:

- **Crashes on interface cycles and unknown interfaces (`IMPLEMENTS_ITSELF`,
  2 vectors; `IMPL_TRANSITIVE`, 2; `IMPLEMENTS_INTERFACES`, 1; all
  crashes):**
  - Examples, with the error each throws:
    - `interface A implements A { x: Int } type Query { a: A }` and
      `interface A implements B { x: Int } interface B implements A { x: Int } type Query { a: A }`
      throw `StackOverflowError`.
    - `type Query implements Missing { a: Int }` throws
      `NullPointerException`.
  - Cause: after the rules run, `validateSchema` computes the cache key
    fields (`computeKeyFields` defaults to `true`,
    `ast/SchemaValidationOptions.kt:90`;
    `ast/internal/SchemaValidationScope.kt:292-296`).
    - `keyFields` recurses through each type's interfaces with no cycle
      check, and looks each one up with `typeDefinitions[it]!!`
      (`ast/internal/SchemaValidationScope.kt:1137-1152`).
    - This is Apollo's normalized cache feature. A server has no use for
      it, but `ExecutableSchema` builds the schema with the default options.
- **`@deprecated` on a directive definition is refused (`acceptsValid`, 2
  vectors, since September 2026):**
  - Example: `directive @d @deprecated on FIELD type Query { a: Int }` is
    rejected.
  - Cause: Apollo's built-in `@deprecated` lists `FIELD_DEFINITION |
    ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION | ENUM_VALUE`
    (`ast/internal/definitions.kt:511-513`). September 2026 adds
    `DIRECTIVE_DEFINITION`.

### Introspect

apollo-execution's introspection types have no `__Type.isOneOf`, so the kit
grades against September 2025 and leaves the 7 September 2026 queries out.
That counts once, as `builtinDefinitions` (MUST, 1 run, since September
2025). The `__Type` definition is in `ast/internal/definitions.kt`.

- **`__type` with an unknown name raises (`executes`, MUST, 22 of 24
  results):**
  - Example: `{ __type(name: "Unknown") { name } }` gives
    `{"errors":[{"message":"Cannot resolve '__type': e: (unknown location): Cannot find type `Unknown`","path":["__type"]}],"data":null}`.
    §4.2 says `__type` returns null for a name that isn't in the schema,
    with no error.
  - Cause: the `__type` resolver builds an `IntrospectionType`, which looks
    the name up with `Schema#typeDefinition`
    (`execution/internal/introspection.kt:26-29, 316-321`). That throws for
    an unknown name (`ast/Schema.kt:150-153`).
- **A default value with a C1 control character crashes the printer
  (`executes`, MUST, 2 of 24 results):**
  - Example: `type Query { f(c: String = "\u0080"): Int }`. Asking for
    the argument's `defaultValue` gives a field error, "Cannot resolve
    'defaultValue': Index 268435448 out of bounds for length 16".
  - Cause: the string printer escapes U+007F–U+009F with
    `c.code.toByte().hexString()`. The byte is negative from 0x80, and
    `ushr(4)` on it indexes far outside the hex table
    (`ast/gqlstrings.kt:120, 143-147`).
- **Unreferenced built-in scalars are listed (`builtinScalars`, MUST, 34 of
  36 results, 10 since September 2025):**
  - Example: for `type Query { a: Int }`, `__schema.types` includes `Float`
    and `ID`.
  - Cause: `buildSchema` always adds Apollo's built-in definitions
    (`execution/ExecutableSchema.kt:295-309`), and introspection lists every
    type.
- **`includeDeprecated` is nullable (`builtinNullability`, SHOULD, 36
  results):**
  - Example: `__Type.fields(includeDeprecated: Boolean = false)`. September
    2025 has `Boolean! = false`, and the same goes for `enumValues`,
    `inputFields`, `__Field.args` and `__Directive.args`.
  - Source: `ast/internal/definitions.kt:426-481`.
- **The schema's description is always null (`descriptions`, SHOULD, 4
  results):**
  - Example: `"""The schema""" schema { query: Q } …` gives
    `__schema.description: null`.
  - Cause: the `__Schema.description` resolver is `Resolver { null }`
    (`execution/internal/introspection.kt:45`).
- **Extra introspection types (`builtinAdditions`, INFO, 36 results):**
  `__Service` and `__Capability` are listed.
  - Cause: `exposeServiceCapabilities` defaults to `true`
    (`execution/ExecutableSchema.kt:200`).
  - `ExecutableSchema.Builder#exposeServiceCapabilities(false)` turns them
    off. The adapter keeps the default, as a server would.

### Coordinate

- **Ignored tokens inside a coordinate are accepted (`noIgnored`, MUST, 25
  vectors, all since September 2025):**
  - Examples: `" Business"`, `"Business ."`, `"Business,"`, a coordinate
    with a comment, and one with a byte order mark all parse and resolve.
  - Cause: `parseAsGQLSchemaCoordinate` runs the document lexer, which skips
    whitespace, commas, the BOM and comments between tokens
    (`ast/internal/Lexer.kt:76-83`, `ast/internal/Parser.kt:1060`). §2.14
    allows no ignored tokens in a schema coordinate.

`containerKind` (INFO) reads Apollo as "an error, as the Asserts say" in all
10 vectors.
