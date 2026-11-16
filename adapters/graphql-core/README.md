# graphql-core adapter

A [graphql-tla conformance adapter](../../docs/conformance.md) for
[graphql-core](https://github.com/graphql-python/graphql-core) 3.2.14, the
Python port of graphql-js. It answers every area of the kit: execution, and
`parse`, `validate`, `coerce`, `schema`, `introspect` and `coordinate`
([docs/kit-areas.md](../../docs/kit-areas.md)).

Source references below are to graphql-core 3.2.14, under `src/graphql/`.
The installed package has the same files, without the `src/` prefix.

## Setup

Needs Python 3.10 or later. `requirements.txt` pins graphql-core, which is the
only dependency. The virtualenv lives in the adapter directory and is
gitignored.

```shell
cd adapters/graphql-core
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Run

From the repository root:

```shell
node kit/cli.mjs run execution --adapter "adapters/graphql-core/run.sh" --strict
node kit/cli.mjs run parse --adapter "adapters/graphql-core/run.sh" --strict
node kit/cli.mjs run validate --adapter "adapters/graphql-core/run.sh" --strict
node kit/cli.mjs run coerce --adapter "adapters/graphql-core/run.sh" --strict
node kit/cli.mjs run schema --adapter "adapters/graphql-core/run.sh" --strict
node kit/cli.mjs run introspect --adapter "adapters/graphql-core/run.sh" --strict
node kit/cli.mjs run coordinate --adapter "adapters/graphql-core/run.sh" --strict
```

`run.sh` runs `adapter.py` with `.venv/bin/python`, and passes its arguments
on:

- `--no-idle` leaves out `idle`, so the kit falls back to `--grace`.
- `--coroutine-resolvers` is described under the
  [mutation deviation](#execution-mutation-root-fields-arent-called-serially).
- `--validate` makes coerce validate before it executes (see
  [coerce](#coerce)).

## Execution

The adapter mirrors the [graphql-js adapter](../graphql-js/adapter.mjs). The
schema is built with `build_schema`, and `execute` gets one `field_resolver`
for every field. The resolver sends `call`, stamped with `after` (the settles
applied so far), and returns an asyncio future that the kit's `settle`
completes. An object is a dict with `__typename`, which graphql-core's
`default_type_resolver` reads for abstract types.

The adapter owns its event loop and reads stdin outside it, with a blocking
`readline`. After each message it runs the loop until the loop's ready queue
is empty, then sends `idle`. Nothing else can wake the loop: there is no I/O
on it and graphql-core sets no timers.

Capabilities:

- `idle`: as above. The check reads `loop._ready`, CPython's queue of ready
  callbacks, since asyncio has no public way to ask whether anything is
  runnable. The kit's determinism replay passed, and a `--no-idle` run found
  the same failure.
- `deferred-items`: a list of futures works. `complete_list_value` awaits each
  item that `is_awaitable` (`execute.py`, line 886).
- `invalid-results`: wrong-shape values become field errors. `1` for a list
  isn't iterable, `Int`, `Float` and `Boolean` don't serialize a dict, and a
  `__typename` that isn't a possible type fails runtime type checking.
- `mutation`: graphql-core's `execute_fields_serially`. It fails
  `calledSerially`, see below.
- `subscription`: `subscribe` with a `subscribe_field_resolver` that is an
  async generator yielding one event (`{}`). As in graphql-js, the root
  field's resolver then runs on the event and is the root `call`.
  `subscribe` passes no type resolver to the event's execution, which is one
  reason the adapter relies on the default type resolver everywhere.
- `subscription-stream`: the `subscribe_field_resolver` returns the kit's
  source stream, an async iterator whose `__anext__` waits for the kit's
  `source` messages and whose `aclose` reports `source-cancelled`.
  `subscribe` maps it with `MapAsyncIterator`, and the adapter consumes the
  response stream as a client does: each result is a `response`,
  `StopAsyncIteration` is `done`, any other exception `stream-error`. The
  kit's `cancel` is `aclose()` on the response stream, then `done`.
- `parent-values`: the root value is `{"token": initialValue}`, each object a
  resolver returns carries its outcome's `token`, a subscription's event is
  `{"token": …}`, and the resolver reports the `token` of the `source`
  graphql-core gave it.
- `custom-scalar-results`: a scalar `build_schema` makes from SDL passes every
  value through. The adapter gives each custom scalar a `serialize` that
  raises a `GraphQLError` on one sentinel value, as graphql-core's own scalars
  do on a value they can't represent, and returns that sentinel for the
  `uncoercible` outcome. `complete_leaf_value` turns the raise into a field
  error (`execution/execute.py:956`).
- `scalar-results`: the resolver returns the integer the kit names as it is.
  `GraphQLID.serialize` turns `4` into `"4"`, and `GraphQLInt.serialize`
  raises on `2147483648`.
- `error-propagation-off` isn't claimed. graphql-core 3.2 has no switch for
  it and doesn't know `@experimental_disableErrorPropagation`.

## Other areas

[`areas.py`](areas.py) answers them, one request at a time, and never sends
`idle`, which only execution uses. Each area mirrors the graphql-js adapter's
module in [`../graphql-js/areas/`](../graphql-js/areas).

**Rejections and crashes.** What graphql-core raises to reject its input is
an answer: a `GraphQLError` (`GraphQLSyntaxError` is one), or a `TypeError`
that graphql-core raises on purpose. `build_schema` raises the SDL rules'
errors as a `TypeError` (`assert_valid_sdl`,
`validation/validate.py:298`), and the type constructors raise one for a type
in the wrong place, such as "Argument type must be a GraphQL input type."
(`type/definition.py:1135`). graphql-core wraps any exception from resolving
a type's fields, interfaces or members in another `TypeError` ("Query fields
cannot be resolved. ...", `type/definition.py:2921-2924` and the like), so
the adapter looks at the innermost cause. It is a rejection if it is a
`GraphQLError`, or a `TypeError` raised by a `raise` statement in
graphql-core's own source. Anything else, such as a `RecursionError` or a
`TypeError` from a failing expression, is a crash, and the adapter answers
`{"type":"error"}`. Its first line names the innermost exception.

### parse

`graphql.language.parse` with its default options. It reads the whole
Document grammar, so the answer is `ok: true` only if every definition is of
a kind the request's grammar allows: an operation or a fragment
(`is_executable_definition_node`) without `grammar`, and with `parse-sdl`
type system definitions for `"typeSystem"`, those and extensions for
`"typeSystemExtension"`, anything for `"document"`. graphql-core's
`TypeExtensionNode` is a subclass of `TypeSystemDefinitionNode`
(`language/ast.py:1106`), so `is_type_system_definition_node` is true for a
type extension too; the adapter leaves extensions out of `"typeSystem"`
itself. A `GraphQLSyntaxError` is `ok: false`. Python strings hold lone
surrogates, so those sources reach the parser as sent. graphql-core turns a
`RecursionError` in the parser into a `GraphQLSyntaxError`
(`language/parser.py:201-205`), so a crash probe too deep for it is
`ok: false`, not a crash.

Capability: `parse-sdl`.

### validate

`build_schema` and `assert_valid_schema` (cached by SDL), `parse`, and
`validate` with graphql-core's default rules. `validate` returns the errors
that reject a document. It can also raise from inside a rule:
`SingleFieldSubscriptionsRule` collects the root fields with no variable
values (`validation/rules/single_field_subscriptions.py:75-88`), so
`subscription ($v: Boolean!) { postAdded @include(if: $v) { id } }` raises
"Argument 'if' of required type 'Boolean!' was provided the variable '$v'
which was not provided a runtime value." That is a crash, not a rejection:
`graphql_sync` doesn't catch it either (`graphql.py:301` calls `validate`
outside any `try`), so a server's caller gets the exception, not a response.
The adapter lets it propagate and answers `error`, and the kit records a
crash. The graphql-js adapter does the same for graphql-js 16.

Capabilities:

- `custom-scalar-literals`: a scalar `build_schema` makes from SDL gets the
  default `parse_literal`, `value_from_ast_untyped`, which accepts every
  literal.
- `custom-directives` (validate and introspect): `build_schema` keeps the
  SDL's `directive @label(...) on ...` definitions, so validation knows them
  and introspection lists them.

### coerce

The schema is built with `build_schema`, the variables are read with
Python's `json.loads`, and the document is executed with a `field_resolver`
that records `info.path.as_list()` and its keyword arguments, and returns
`"ok"`. The response is the `ExecutionResult`'s `formatted`, graphql-core's
serialization.

- By default, the adapter parses and calls `execute` without validating, and
  claims `unvalidated`, as the graphql-js adapter does.
- With `run.sh --validate`, it calls `graphql_sync`, which parses, validates
  and executes, as a server does. Then it doesn't claim `unvalidated`, and the
  kit grades invalid documents under `invalidNotExecuted` where its validate
  run rejects them, and under `onlyValidExecuted` (SHOULD) otherwise.

A document that doesn't parse gets graphql-core's own answer to it, the one
`graphql_sync` gives (`graphql.py:293-296`): `ExecutionResult(data=None,
errors=[syntax_error])`, serialized with `formatted`. A subscription
operation goes through `subscribe` (with `--validate`, after `validate`, as
`graphql_sync` does for other operations).

Capabilities:

- `absent-vs-null`: `get_argument_values` leaves out an argument that has no
  value and no default, so `{ int }` calls the resolver with no `v`, and
  `{ int(v: null) }` with `v=None`. `coerce_input_value` and `value_from_ast`
  leave out such an input field the same way.
- `unvalidated`, unless `--validate`.
- `nested-fields`: the resolver returns `{}` for an object type, two of them
  for a list of objects, and `"ok"` for a leaf, and records
  `info.path.as_list()`, which has the list indices.
- `subscription-source`: the `subscribe_field_resolver` records its call
  (`info.field_name` and its keyword arguments) in `sourceCalls`, then
  returns an async generator of one event, or raises. The response is the
  first result of the stream `subscribe` returns, or the `ExecutionResult` it
  returns instead (`create_source_event_stream` turns the raise into one,
  `execution/subscribe.py:303-305`).
- `request-extensions`: `execute` and `graphql_sync` take no request
  extensions, so the adapter reads them and drops them.
- Not `exact-numbers`: `json.loads` reads integers exactly, so 2^53 + 1
  stays exact, but reads floats as doubles, and `1e400` becomes `inf`. The
  kit grades those vectors under the informational `jsonNumbers`.

Enum values are their names, which is what `build_schema` makes their
internal values. A non-finite float is sent as a string (`"Infinity"`).

### schema

`build_schema`, then `validate_schema`. Rejections and crashes are told apart
as above.

Capability: `schema-extensions`. `build_schema` takes a document with type
system extensions and applies each to the type it names
(`build_ast_schema` calls `extend_schema_impl` with the whole document), and
`assert_valid_sdl` checks them (Possible Type Extensions, Unique Directives
Per Location and the like).

### introspect

`build_schema`, then `graphql_sync` with the kit's query. A schema
graphql-core rejects is answered with a request error. graphql-core answers
September 2026's query, so the run is graded against September 2026.

A query that doesn't parse is answered by `graphql_sync` itself, as
`ExecutionResult(data=None, errors=[...])`, which `formatted` writes with
`"data": null` (see the coerce deviation below). That is graphql-core's
answer, not the adapter's, so the adapter passes it through.

### coordinate

`parse_schema_coordinate`, then `resolve_ast_schema_coordinate`
(`utilities/resolve_schema_coordinate.py`), against the schema
`build_schema` makes from the SDL. A `GraphQLError` from the parser is
`ok: false`. The resolver raises a `TypeError` for a missing type, field or
directive and for a type of the wrong kind; one raised by a `raise` in
graphql-core is `error`, anything else a crash. The answer's `kind` comes from
the resolved element's `kind`, and its `path` from the resolved objects: a
type's or directive's `name`, and for a field, argument, input field or enum
value, the key graphql-core keeps that object under in its type's,
field's or directive's map (those objects carry no name of their own).

## Results

From runs with `--strict` on graphql-core 3.2.14 and the kit as of this
writing (execution with `--random 1500 --seed 1`, the sheet's run):

| Area | Result |
| --- | --- |
| execution | 29642 cases, 6777 distinct, and 36 subscription streams. `calledSerially` (SHOULD) fails on 1394 mutation cases (510 in `mutation`, 884 in `mutationRoot`, below), and `nothingAfterCancel` (MUST) on 4 streams (below); every other check passes. With `--coroutine-resolvers` (`--random 200`), only `nothingAfterCancel` fails. |
| parse | 2815 of 2847 vectors agree, with `parse-sdl`. 32 fail, every one on a vector with `since`: §2.5 (11), §3.13 (5) and §3.13.6 (14), since September 2026, and §2.10.4 (2), since September 2025. No crash, crash probes included. |
| validate | 3275 of 3354 vectors agree; 16 of the failures are crashes. `fieldSelectionMerging`, `singleRootField`, `valuesOfCorrectType`, `operationTypeExistence`, `allVariableUsagesAreAllowed`, and through syntax crashes `executableDefinitions`, `leafFieldSelections` and `acceptsValid`, fail (below). |
| coerce | 1375 of 2219 vectors match. `requestErrorNoData` fails on 829 (below); `inputObject` (5), `notExecutable` (5), `oneOf` (2), `unvalidatedBranches` (2) and `float` (1) on 15 more. Every new check of this round passes: `syntaxError`, `argumentsBelowRoot`, `sourceStream`, `sourceStreamError`. A lone surrogate is kept as sent. With `--validate`: 558 match, and only `requestErrorNoData` (1660) and `float` (1) fail. |
| schema | 436 of 490 schemas agree, 7 of the failures crashes. 11 checks fail, one of them informational (below). |
| introspect | 26 of 66 graded results satisfy the reference, graded against September 2026; 38 more fail only `builtinNullability` (SHOULD), and 2 fail `executes`. 5 aren't graded: their schemas use September 2026 syntax `build_schema` can't parse. |
| coordinate | 203 of 203 vectors agree; every `containerKind` vector gets an error, as the Asserts say. |

### Compared with graphql-js 16

graphql-core 3.2 tracks graphql-js 16. In parse, validate, schema and
coordinate, every check has the same status and the same number of failing
vectors as graphql-js 16.15.0's run on the same kit, crashes included. In
coerce and introspect, the only differences come from one cause:
graphql-core's `formatted` always writes `"data"`, which `JSON.stringify`
leaves out of graphql-js's `data: undefined` (below). That fails
`requestErrorNoData` in coerce, which graphql-js 16 passes, and `executes`
on the two introspect queries with an empty selection set, which neither
parses, but which graphql-js 16 answers with a request error that isn't
graded.

The only difference in how a finding shows up: on `input I { i: I = {} }`,
graphql-js 16 overflows the stack with a `RangeError`, and graphql-core with
a `RecursionError`, wrapped in a `TypeError`. Both are crashes.

## Known graphql-core deviations

Each one below was reproduced with plain graphql-core 3.2.14: `build_schema`,
`parse`, `validate`, `validate_schema`, `execute` and `graphql_sync`, called
directly.

### Execution: mutation root fields aren't called serially

graphql-core 3.2 calls the resolver of every mutation root field before the
previous root field has completed, which §6.3.4 forbids. The kit reports it
as `calledSerially` on every mutation case. The shortest:

```
trace:    call first; call second; call third; settle first = null; settle second = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Mutation.second.", ...,"path":["second"]}]}
```

All three calls carry `after: 0`: graphql-core had seen no settle when it
called `second` and `third`.

`ExecutionContext.execute_fields_serially`
([`src/graphql/execution/execute.py`](https://github.com/graphql-python/graphql-core/blob/v3.2.14/src/graphql/execution/execute.py#L518-L572),
line 536) calls `self.execute_field` for each root field inside a plain `for`
loop. `execute_field` invokes the resolver straight away. Only awaiting the
results is chained (`await_and_set_result`, line 548). graphql-js's
`executeFieldsSerially` instead calls `executeField` from a `promiseReduce`
callback, which runs only after the previous field's promise has resolved
(`src/execution/execute.ts` in 16, `src/execution/Executor.ts` in 17).
graphql-core 3.3 does the same
with `async_reduce`
([`src/graphql/execution/executor.py`](https://github.com/graphql-python/graphql-core/blob/v3.3.2/src/graphql/execution/executor.py#L813-L861)).

Whether a user sees this depends on what the resolver does when it is called:

- An `async def` resolver only creates a coroutine, which doesn't run until
  graphql-core awaits it, and that happens in order. So its body runs
  serially. `run.sh --coroutine-resolvers` makes the adapter's resolver an
  `async def` that sends `call` once it first runs, and with it every case
  passes, mutations included.
- A resolver that does work before it returns runs early: one that returns a
  future or a task (for example a DataLoader's `load`, `asyncio.create_task`
  or `run_in_executor`), or a synchronous resolver, whose side effects happen
  while an earlier root field's sub-selection is still pending. When a later
  root field nulls `data`, the resolvers after it have still been called,
  though their results are never awaited.

### Execution: a result after the client cancelled (MUST)

In the stream scenario "cancelled while an event executes", graphql-core
delivers the event's result after `aclose()` on the response stream has
returned, so the kit sees the stream complete and then a result
(`nothingAfterCancel`, a MUST, 4 streams). `MapAsyncIterator.__anext__`
(`execution/map_async_iterator.py:55-83`) runs the event's execution (its
callback) once the source has yielded, and `aclose` only closes the source
and sets a flag; it doesn't stop an `__anext__` already past the source, so
that call still returns the result. graphql-js 16 does the same. Every other
lifecycle check passes: the stream completes with its source, fails with it,
completes when cancelled, and cancels the source.

### Coerce: a request error has `"data": null`

`ExecutionResult.formatted` always writes a `data` entry
(`execution/execute.py:188-195`), and a request error is an
`ExecutionResult` with `data=None` (`execution/execute.py:1345`,
`execution/subscribe.py:290` and `:305`, and `graphql.py:290`, `:296` and
`:303` for schema, syntax and validation errors). So it serializes as
`{"data": null, "errors": [...]}`, where §7.1.3 says a request error result
must not contain `data` (MUST in every edition):

```
graphql_sync(schema, "{ int(v: 1) }", operation_name="A").formatted
{'data': None, 'errors': [{'message': "Unknown operation named 'A'."}]}
```

The kit classifies these as request errors, so the other checks still grade
them, and only `requestErrorNoData` fails: 829 vectors, and 1660 with
`--validate`, where validation errors are request errors too. The 16
documents that don't parse and the 4 source streams that raise are among
them, and pass `syntaxError` and `sourceStreamError`.
`ExecutionResult` can't tell no data from null data, since both are `None`;
a server that wants to leave the entry out has to decide from the errors.

The introspect area sees the same cause: a query that doesn't parse (the
two `emptySelection` vectors, `{}`, below) comes back from `graphql_sync`
with `"data": null`, which the introspect area grades as a failed execution
(`executes`), not as a request error it would leave ungraded.

### Coerce: what only validation catches

Without validation (`unvalidated`), as in graphql-js 16:

- **§3.5.2 Float (MUST):** `parse_float_literal` returns
  `float(value_node.value)` with no range check (`type/scalars.py:151-158`).
  `{ float(v: 1e400) }` gets `inf`. `{ float(v: 99999999999999999999) }`
  gets `1e+20`, which the informational `floatPrecision` records. With
  `--validate` the first still fails: `ValuesOfCorrectTypeRule` accepts the
  literal too (below).
- **§3.10 Input Objects (MUST, 5 vectors):** `value_from_ast` reads only the
  fields the input object type defines, and ignores the rest
  (`utilities/value_from_ast.py:130-149`). `{ point(v: { x: 1, z: 1 }) }`
  gets `{'x': 1, 'y': 0}`. graphql-js 17 rejects this; 16 doesn't.
- **§3.10.1 OneOf (MUST, 2 vectors, since September 2025):** a OneOf literal
  whose second entry is a variable with no runtime value,
  `query($b: Int) { oneOfExample(arg: { a: "abc", b: $b }) }` with `{}`,
  counts as one entry and resolves to `{'a': 'abc'}`.
- **§2.3 (`notExecutable`, MUST, 5 vectors):** `execute` skips type system
  definitions, so `type T { a: Int } query { int(v: 1) }` runs its
  operation. A document with no operation is a request error.
- **§6.3.2 and §6.2.3.1 (`unvalidatedBranches`, MUST, 2 vectors):**
  `execute_subscription` creates the source stream for the first root field
  only (`execution/subscribe.py:337`) and doesn't refuse a second, and the
  event's execution then runs every root field.
  `subscription { event(v: 1) nope }` resolves `event`, and
  `subscription { event(v: 1) eventNN(v: 1) }` resolves both. graphql-core
  leaves that to validation (`SingleFieldSubscriptionsRule`).

With `--validate`, the validation rules reject all of these but `1e400`.

### Parse

Every failure is on a vector with `since`. graphql-js 16 rejects the same 32
vectors.

- **Empty selection sets (11 vectors, §2.5, since September 2026).**
  `parse_selection_set` reads `{ Selection+ }` with `many`
  (`language/parser.py:770-777`), so `{}` gives "Expected Name, found '}'".
  September 2026 allows an empty selection set (graphql-spec#1227); September
  2025 and October 2021 don't.
- **Directives on a directive definition (5 vectors, §3.13) and directive
  extensions (14 vectors, §3.13.6), since September 2026.**
  `directive @d @x on FIELD` and `extend directive @d @x` are syntax errors
  with the default options. The parser reads both only with
  `experimental_directives_on_directive_definitions=True`
  (`language/parser.py:1068`, `:1444`), which the adapter leaves off, as the
  kit asks.
- **Variable-width escapes over eight hex digits (2 vectors, §2.10.4, since
  September 2025).** `read_escaped_unicode_variable_width` stops after 12
  characters (`language/lexer.py:470-491`), so `"\u{000000041}"` gives
  "Invalid Unicode escape sequence". `{ HexDigit+ }` has no limit.

### Validate

The same findings as graphql-js 16, with the same counts. The library
behaves the same, vector for vector.

- **§5.3.2 isn't enforced for `__typename` (22 vectors).** In
  `{ node(id: "1") { ... on User { a: __typename } ... on Post { a: id } } }`
  the two `a` fields have different types, `String!` and `ID!`, which §5.3.2
  forbids even when the parents differ. `__typename` isn't in a type's
  `fields`, so the rule finds no definition for it
  (`validation/rules/overlapping_fields_can_be_merged.py:946-950`), and only
  compares types when both fields have one (`:709-710`, `:745`). Every one of
  the 22 vectors pairs `__typename` with another field.
- **§5.2.1.1 Operation Type Existence (15 vectors, since September 2025).**
  No rule checks that the schema has a root type for the operation, so
  `mutation { ... }` against a schema without `Mutation` passes. Execution
  then fails it.
- **§5.2.4.1 with `@skip` or `@include` at a subscription's root (17
  vectors accepted, 11 crashes).**
  `subscription { postAdded @skip(if: true) { id } }` is accepted. September
  2025 forbids `@skip` and `@include` in a subscription's root selection set.
  October 2021 forbids some of these documents too: it collects the root
  fields with no variable values and requires exactly one entry, and
  `@skip(if: true)` on the only root field leaves none. graphql-core reports
  an error only when it collects more than one field
  (`validation/rules/single_field_subscriptions.py:93`). With a variable as
  the condition (`@include(if: $v)`), `validate` raises instead (above), a
  crash.
- **§5.6.1 for a Float literal out of range (5 vectors).**
  `{ echo(float: 1e400) }` is valid to `ValuesOfCorrectTypeRule`:
  `parse_float_literal` reads it as `inf` without complaint (above).
- **§5.8.5 for OneOf (2 vectors, since September 2025).** `mutation
  addNullableCat($cat: CatInput) { addPet(pet: {cat: $cat}) { name } }` is
  accepted. `VariablesInAllowedPositionRule` does check for a nullable
  variable in a OneOf field, but tests `is_input_object_type(parent_type)`
  (`validation/rules/variables_in_allowed_position.py:95-98`), and the parent
  type is still wrapped in Non-Null when the OneOf argument or list item is
  non-null (`pet: PetInput!` here). With a nullable `PetInput` argument,
  graphql-core rejects the same document.
- **September 2026 syntax (5 crashes):** documents with an empty selection
  set (`leafFieldSelections` 2, `acceptsValid` 1, §5.3.3's
  `directQueryOnObjectWithEmptySelection`) or a directive on a directive
  definition (`executableDefinitions` 2) don't parse (above). The validate
  area takes a document that doesn't parse as a crash, counted toward
  September 2026.

### Schema

The same 11 failing checks as graphql-js 16, with the same schemas.

- **`typeNameNotBuiltin` (3 schemas):** `type Int { a: String } type Query { a: String }`
  is accepted. `build_schema` replaces a definition named like a built-in
  type with the built-in (`utilities/extend_schema.py:274`).
- **`rootTypesDifferent` (4 schemas):** `validate_root_types` checks only that
  each root is an object type, not that they differ
  (`type/validate.py:137-165`).
- **`directiveUsesItself` (2), `directiveReferencesItselfIndirectly` (3):**
  nothing in `type/validate.py` follows a directive's uses of directives.
- **`argDefaultCompatible` (14 schemas, since September 2025):** default
  values aren't validated. `build_schema` coerces each with `value_from_ast`
  (`utilities/extend_schema.py:663`), and a default that doesn't coerce
  becomes `Undefined`: `f(x: Int = "1")` silently has no default.
- **`implDeprecation` (2 schemas, since September 2025):** a deprecated field
  may implement one that isn't.
- **`inputObjectUnbreakableCycle` (3 schemas, since September 2026):** the
  cycle check follows only Non-Null input object fields
  (`type/validate.py:589`), so it misses
  `input A @oneOf { b: B } input B @oneOf { a: A }`, whose fields are
  nullable but can't be left all null.
- **`extensionOneOf` (2 schemas, since September 2025):**
  `input In { a: Int } extend input In @oneOf` is accepted. §3.10.2 says
  "The @oneOf directive must not be provided by an Input Object type
  extension"; graphql-core checks a OneOf input object's fields, wherever
  `@oneOf` came from (`type/validate.py:526`).
- **`appliedDirectiveArguments` (informational, 3 schemas):** an applied
  directive's arguments aren't checked against its definition in SDL, such
  as `@deprecated(reason: null)`.
- **`inputObjectDefaultValueCycle`, crashes (4 invalid schemas, 3 valid).**
  `input I { i: I = {i: null} }` raises `RecursionError` from `build_schema`.
  Building `I`'s fields coerces the default `{i: null}` with
  `value_from_ast` (`utilities/extend_schema.py:681`), which reads `I`'s
  fields, which aren't built yet. The `RecursionError` comes out wrapped in
  `TypeError: I fields cannot be resolved. ...`
  (`type/definition.py:2921-2924`). Valid schemas crash too, and count
  against `acceptsValid`.
- **September 2026 syntax (`acceptsValid`, 11 valid schemas):** a directive
  extension (7) or a directive on a directive definition (4) doesn't parse
  with the default options (see Parse).

### Introspect

graphql-core 3.2.14 has September 2026's introspection fields (`isOneOf`,
deprecated arguments, input fields and directives, `DIRECTIVE_DEFINITION`,
`@oneOf`), with some October 2021 definitions. They fail
`builtinNullability` (SHOULD) on 38 results:

- `@deprecated(reason: String = "No longer supported")`
  (`type/directives.py:372-380`), and `includeDeprecated: Boolean = false` on
  `__Type.fields` and `enumValues` (`type/introspection.py:312`, `:328`).
  September 2026 has `String!` and `Boolean!`; October 2021 has what
  graphql-core has.
- `includeDeprecated: Boolean = false` on `__Type.inputFields`,
  `__Field.args` and `__Directive.args` (`type/introspection.py:337`, `:461`,
  `:147`). September 2026 has `Boolean!`, and October 2021 has no argument
  there.

The 2 `emptySelection` results fail `executes`: graphql-core can't parse
`{}` (see Parse), and its request error has `"data": null` (see Coerce). 5
results aren't graded: `build_schema` can't parse
`directive @old @deprecated on FIELD` ("Expected 'on', found '@'"), September
2026 syntax that the parser reads only with
`experimental_directives_on_directive_definitions=True`. With the flag, the
schema builds and introspection reports the deprecated directive correctly.

Every other check passes, wrapper types and printed defaults included.
graphql-js 16 fails `builtinNullability` the same way; it answers the two
`emptySelection` queries with a request error, which isn't graded.
