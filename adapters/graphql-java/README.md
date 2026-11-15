# graphql-java adapter

A [graphql-tla conformance adapter](../../docs/conformance.md) for
[graphql-java](https://github.com/graphql-java/graphql-java) 26.2. It answers
every area: `execution`, and the [areas beyond it](../../docs/kit-areas.md),
`parse`, `validate`, `coerce`, `schema` and `introspect`.

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
  `unvalidated` capability.
- `--good-faith` keeps Good Faith Introspection on in `introspect` (see
  below).

## How it works

The schema is built with `SchemaParser` and `SchemaGenerator`. A
`WiringFactory` puts one data fetcher on every field, and a type resolver on
every interface and union that picks the object type named by the value's
`__typename`. The data fetcher sends `call`, stamped with `after` (the settles
applied so far), and returns a `CompletableFuture` that the kit's `settle`
completes.

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
- `mutation`: graphql-java's default `AsyncSerialExecutionStrategy`.
- `error-propagation-off`: graphql-java's `@experimental_disableErrorPropagation`
  directive, added to the operation. It is built in, and
  `NonNullableFieldValidator` then stops throwing instead of propagating.
- `subscription`: graphql-java uses each source stream event as the root
  field's value (`SubscriptionExecutionStrategy#executeSubscriptionEvent`), so
  the source stream's request for its one event is the root `call`, and the
  settled outcome is the event.

## Known graphql-java deviation

When a subscription event's Non-Null root field ends up null, graphql-java
doesn't publish `{"data": null, "errors": [...]}` (§6.4.4). The event's
`NonNullableFieldWasNullException` fails the mapped future, and
`CompletionStageSubscriber` ends the response stream with `onError`. A client
gets no execution result, only the stream error, so the adapter reports a
`stream-error`, which the kit counts against `eventYieldsResult` (§6.2.3.2).

## Other areas

`Areas.java` answers them. Capabilities claimed: `parse`, `validate`,
`coerce`, `schema`, `introspect`, `custom-scalar-literals`, `absent-vs-null`,
and `unvalidated` (not with `--validate`). `exact-numbers` isn't claimed.

- **parse:** `ParseAndValidate.parse`, which is how `GraphQL` parses a
  request, with the default operation parser options. An
  `InvalidSyntaxException` is `ok: false`. The parser also reads the type
  system language, so every definition must be an operation or a fragment.
- **validate:** the schema is built with `SchemaGenerator` and
  `RuntimeWiring.MOCKED_WIRING`, graphql-java's wiring for a schema that is
  inspected but not executed. Then `Validator.validateDocument` with no rule
  predicate and no limits, which is what `GraphQL` runs on a request. Good
  Faith Introspection stays on, as it is by default; it throws
  `GoodFaithIntrospectionExceeded`, which `GraphQL` turns into an error
  response, so that is a rejection. `custom-scalar-literals`:
  `MockedWiringFactory#getScalar` gives a custom scalar whose `parseLiteral`
  accepts every kind of literal, variables included.
- **coerce:** the schema has one data fetcher on every field, which reads
  `env.getArguments()`, records it with the field's path, and returns `"ok"`.
  The request runs through `GraphQL.execute`. The variables are read with
  Jackson, as a Java server reads a request body: integers exactly (`Integer`,
  `Long`, `BigInteger`), other numbers as `Double`. That is why
  `exact-numbers` isn't claimed. The response is `ExecutionResult#toSpecification()`.
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
  `GraphQLSchema`. graphql-java reports an invalid schema with a
  `GraphQLException` subclass: `InvalidSyntaxException`, `SchemaProblem`,
  `InvalidSchemaException` or `AssertException`. Those are `valid: false`. Any
  other exception or error, such as a `ClassCastException`, is a crash and gets
  an `error` answer.
- **introspect:** the schema is built as for `schema`, and the kit's query
  runs through `GraphQL.execute`. Good Faith Introspection, which graphql-java
  turns on by default, allows one `__schema` and one `__type` per operation,
  and each of `__Type`'s `fields`, `inputFields`, `interfaces` and
  `possibleTypes` once. The kit's queries ask for more (`wrappers: __type(…)`
  next to `__schema`, and several `__type` lookups), so the adapter turns it
  off for the request with its documented per-request switch
  (`GoodFaithIntrospection.GOOD_FAITH_INTROSPECTION_DISABLED`). It is a
  denial-of-service guard, not part of introspection. With `--good-faith`, both
  editions' queries are rejected ("`__Type.fields` is present too often") and
  all 38 vectors fail `executes`.

## Results

`--strict`, with the kit as of this writing:

| Area | Result |
| --- | --- |
| execution | Unchanged: 2544 of 2544 distinct well-formed cases satisfy the reference (`--random 1500`). 1338 subscription cases are malformed, the deviation above. |
| parse | 1894 of 1983 vectors agree. 5 checks fail. 81 of the 89 failing vectors are draft only. |
| validate | 3059 of 3088 vectors agree. 5 rule checks fail, 3 of them on draft-only vectors only. `acceptsValid` passes. |
| coerce | Unvalidated: 1977 of 2036 results match. With `--validate`: 1978 of 2010 (26 need `unvalidated`), `invalidNotExecuted` passes on all 775 invalid documents, and only `id` and `list` fail. |
| schema | 152 of 165 schemas agree, 4 of the failures crashes. 10 of 44 rules fail, 3 of them on draft-only vectors only. |
| introspect | Graded against October 2021, since the draft's query is rejected. 8 of 28 results match. `builtinDefinitions` and `descriptions` fail. |

## Known deviations in the other areas

Each one below was reproduced with a standalone program that calls
graphql-java's public API directly (`Parser.parse`, `SchemaGenerator`,
`Validator`, `GraphQL.execute`), with no adapter code.

### Parse

- **Draft grammar (81 vectors, all draft only):** no description on an
  operation, fragment or variable (73, §2.2: `GraphqlOperation.g4:4`), and no
  empty selection set (8, §2.5: `selectionSet : '{' selection+ '}'`,
  `GraphqlOperation.g4:13`). Both are October 2021's grammar.
- **`"""\"""` is a complete block string (4 vectors, §2.10.4):** the lexer
  rule is `'"""' BlockStringCharacter*? '"""'`, and `BlockStringCharacter` is
  `'\\"""' | SourceCharacter` (`GraphqlCommon.g4:116-120`). The non-greedy loop
  takes `\` as a SourceCharacter and stops at the next `"""`. So
  `{a(x: """\""")}` parses, with the value `\`. By §2.10.4, `\"""` is an
  escaped triple quote, and the string is unterminated.
- **A surrogate pair from a fixed and a braced escape (1 vector, §2.10.4):**
  `"\uD83D\u{DCA9}"` parses as U+1F4A9. `UnicodeUtil` pairs a leading
  surrogate with the next escape whatever its form (`parser/UnicodeUtil.java:44-60`).
  The draft only pairs two fixed-width escapes.
- **U+2028 and U+2029 are ignored (3 vectors, §2.1.2):** `{a b}` parses
  as `{a b}`. The lexer has `LineTerminator: [  ] -> channel(3)`
  (`GraphqlCommon.g4:146`), which the spec doesn't.
- **A variable in a variable definition's directive (1 vector, §2.11):**
  `query ($a: Int @d(x: $b)) {a}` parses. `variableDefinition` uses the
  non-const `directives` (`GraphqlOperation.g4:10`), whose arguments take
  `valueWithVariable` (`GraphqlCommon.g4:30`). The spec has `Directives[Const]`
  there.

### Validate

- **§5.3.2 not enforced with `__typename` (22 vectors):**
  `... on User { a: __typename } ... on Post { a: id }` is accepted. The
  field merging rule looks each field up in its parent type, where
  `__typename` isn't found, so its type is `null`
  (`validation/OperationValidator.java:1245-1246`), and the type comparison
  skips a pair with a `null` type (`:1417-1418`).
- **§5.7.3 not checked on variable definitions (1 vector):**
  `query Q($v: Int @once @once)` is accepted. `validateUniqueDirectiveNamesPerLocation`
  runs for fields, fragments, inline fragments, spreads and operations
  (`OperationValidator.java:624, 685, 727, 796, 820`), but not in
  `checkVariableDefinition` (`:589-607`).
- **OneOf is checked during execution, not validation (5 vectors, all
  draft):** `{ echo(pick: {id: null}) }` (§5.6.1) and a nullable variable
  for a OneOf field (§5.8.5, 4 vectors) are accepted. The validator only counts
  a OneOf literal's fields (`validation/ValidationUtil.java:163-167`), and
  `VariablesTypesMatcher` knows nothing of OneOf.
  `execution/ValuesResolverOneOfValidation` rejects both while executing.
- **§5.2.4.1 with `@include(if: true)` at a subscription's root (1 vector,
  draft):** accepted, since graphql-java applies the directive when it
  collects the root fields. October 2021 does the same.
- **The validator crashes (22 draft-only vectors, counted as rejections):**
  for a subscription whose root field has `@skip` or `@include`,
  `validateSubscriptionUniqueRootField` collects the root fields with no
  variables (`OperationValidator.java:1817`). `@include(if: $v)` then throws
  `NullPointerException` (`execution/conditional/ConditionalNodes.java:99`),
  and `@skip(if: true)` leaves no field, so `get(0)` throws
  `ArrayIndexOutOfBoundsException` (`OperationValidator.java:1827`).
  `GraphQL.execute` would throw rather than answer. The documents are invalid
  under the draft, so the adapter answers `valid: false`, and these vectors
  pass.

### Coerce

With validation (`--validate`), what graphql-java does for a request:

- **ID accepts any value (30 vectors, §3.5.5):** a variable of `true`, `1.5`,
  `[]` or `{"a": 1}` for `ID` becomes `"true"`, `"1.5"`, `"[]"`, `"{a=1}"`.
  `GraphqlIDCoercing#convertImpl` ends with `return String.valueOf(input)`
  (`scalar/GraphqlIDCoercing.java:47`). The JSON number `1e400` becomes
  `"Infinity"` the same way (`jsonNumbers`, informational).
- **A null variable as a Non-Null list item (1 vector, §3.11):**
  `query($x: Int = 1) { intsNN(v: [1, $x]) }` with `{"x": null}` gives the
  resolver `[1, null]` for `[Int!]!`. List literals coerce each item with
  `literalToInternalValue` (`execution/ValuesResolverConversion.java:744-753`),
  which returns a variable's value as it is (`:659-662`), with no Non-Null
  check.

Also with validation, though the kit only grades these vectors unvalidated:
the Float literal `1e400` reaches the resolver as `Infinity`, and
`99999999999999999999` as `1.0E20`. `GraphqlFloatCoercing#parseLiteralImpl`
has no finiteness check (`scalar/GraphqlFloatCoercing.java:84-88`), and the
validator uses the same `parseLiteral`. The same gap lets
`f(x: Float = 1e400)` through in the schema area.

Without validation, graphql-java's literal coercion assumes a validated
document. `ValuesResolverConversion` says so: "no validation" (`:711`, `:729`,
`:770`) and `assertShouldNeverHappen("Should have been validated before")`
(`:811`). These 29 vectors fail only unvalidated, besides the 30 ID vectors:

- **A null literal for a Non-Null type (16 vectors, §3.10, §3.11, §3.12,
  §6.4.1):** `{ intNN(v: null) }`, `{ pair(b: null) }`,
  `{ intsNN(v: [null]) }` and `{ point(v: { x: null }) }` reach the resolver
  with the nulls. `isNullValue` doesn't recognise a `NullValue` literal
  (`ValuesResolverConversion.java:833-841`), so the Non-Null checks
  (`ValuesResolver.java:360`, `ValuesResolverConversion.java:810`) miss it, and
  `literalToInternalValueImpl` returns null for it before looking at the type
  (`:663-665`).
- **An unknown input object field is dropped (5 vectors, §3.10):**
  `{ point(v: { x: 1, z: 1 }) }` gives `{x: 1, y: 0}`. Input object literals
  are coerced by looping over the type's fields (`:786`), so a field the type
  doesn't define is never looked at.
- **A null or missing variable as a Non-Null list item (5 vectors, §3.11):**
  the one above, and four more that validation would reject, such as
  `query($x: Int) { intsNN(v: [1, $x]) }` with `{}`, which gives `[1, null]`.
- **Float literals (2 vectors, §3.5.2):** `1e400` and `99999999999999999999`,
  as above.
- **A document with no operation (1 vector, §6.1):**
  `fragment F on Query { int(v: 1) }` with no `operationName` makes
  `NodeUtil.getOperation` call `next()` on an empty iterator
  (`language/NodeUtil.java:82`), and `GraphQL.execute` throws
  `NoSuchElementException` instead of returning a request error. The client
  gets no result, so the adapter answers an empty `response`, with the
  exception in `noResponse`. The kit counts that as none of its outcomes.

A JSON string with a lone surrogate reaches String and ID as sent, which the
informational `loneSurrogates` check records.

### Schema

- **Crashes (4 schemas):** a type of the wrong kind where graphql-java casts
  it, instead of a validation error: `type Query { f(x: Query): Int }`
  (`ClassCastException` at `schema/GraphQLTypeResolvingVisitor.java:78`),
  `input In { x: Query }` (`:90`), and an interface named `Query` or
  `Mutation` with no `schema` definition (2 schemas, `ClassCastException` at
  `schema/idl/SchemaGeneratorHelper.java:923` and `:934`, which assign the
  type found by that name to a `GraphQLObjectType`). With a `schema { … }` definition,
  the same mistake is a `SchemaProblem` ("The operation type 'query' MUST have
  a object type as its definition"). `SchemaValidator` has an
  `InputAndOutputTypesUsedAppropriately` rule, but the build fails before it
  runs. The first two crash with a plain `RuntimeWiring` too.
- **Rules with no check:** the same type for two root operations
  (`rootTypesDifferent`, 2 schemas), `implements I & I` (`implementsUnique`),
  a type named `__T` (`typeNameReserved`: `TypeAndFieldRule` checks `__` on
  fields, arguments and enum values, `schema/validation/TypeAndFieldRule.java:184-227`,
  not on type names), and `type Int { … }` (`typeNameNotBuiltin`).
  `SchemaValidator` lists its rules at `schema/validation/SchemaValidator.java:18-28`.
- **Draft rules (4 schemas):** `f(x: Float = 1e400)` (`argDefaultCompatible`,
  2 schemas: the Float literal isn't checked for finiteness, as in coerce),
  a deprecated field implementing one that isn't (`implDeprecation`), and a
  cycle through a OneOf input object (`inputObjectUnbreakableCycle`).

### Introspect

- **Between the two editions:** graphql-java has the draft's `__Type.isOneOf`,
  `__InputValue.isDeprecated` and `deprecationReason`, and `includeDeprecated`
  on `args` and `inputFields`, but not `__Directive.isDeprecated` or
  `__Schema.directives(includeDeprecated:)` (`introspection/Introspection.java:612-677`).
  So the draft's query is rejected ("Unknown field argument
  'includeDeprecated'"), and the run is graded against October 2021. There,
  `@deprecated` is `@deprecated(reason: String! = "No longer supported") on
  FIELD_DEFINITION | ENUM_VALUE | ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION`
  (`Directives.java:217-227`): the draft's `String!` and locations, without the
  draft's `DIRECTIVE_DEFINITION`. That fails `builtinDefinitions` in every
  `__schema` result (18). The draft-only fields are additions under October
  2021, which the informational `builtinAdditions` records.
- **A custom scalar without a description gets `""` (6 results,
  `descriptions`):** `SchemaGeneratorHelper#getScalarDesc` returns `""` when
  neither the wired scalar nor the SDL has a description
  (`schema/idl/SchemaGeneratorHelper.java:484-494`). Other types get `null`.
  This happens with any wiring, not only `MOCKED_WIRING`.
- `@defer` and `@experimental_disableErrorPropagation` are returned as the
  service's own directives, which the spec allows.
