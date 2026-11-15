# graphql-core adapter

A [graphql-tla conformance adapter](../../docs/conformance.md) for
[graphql-core](https://github.com/graphql-python/graphql-core) 3.2.14, the
Python port of graphql-js. It answers every area of the kit: execution, and
`parse`, `validate`, `coerce`, `schema` and `introspect`
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

`graphql.language.parse` with its default options. It also reads the type
system language, so the answer is `ok: true` only if every definition is an
operation or a fragment (`is_executable_definition_node`). A
`GraphQLSyntaxError` is `ok: false`. Python strings hold lone surrogates, so
those sources reach the parser as sent.

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
  kit grades invalid documents under `invalidNotExecuted`.

Capabilities:

- `absent-vs-null`: `get_argument_values` leaves out an argument that has no
  value and no default, so `{ int }` calls the resolver with no `v`, and
  `{ int(v: null) }` with `v=None`. `coerce_input_value` and `value_from_ast`
  leave out such an input field the same way.
- `unvalidated`, unless `--validate`.
- Not `exact-numbers`: `json.loads` reads integers exactly, so 2^53 + 1
  stays exact, but reads floats as doubles, and `1e400` becomes `inf`. The
  kit grades those vectors under the informational `jsonNumbers`.

Enum values are their names, which is what `build_schema` makes their
internal values. A non-finite float is sent as a string (`"Infinity"`).

### schema

`build_schema`, then `validate_schema`. Rejections and crashes are told apart
as above.

### introspect

`build_schema`, then `graphql_sync` with the kit's query. A schema
graphql-core rejects is answered with a request error. graphql-core answers
the draft's query, so the run is graded against the draft.

## Results

From full runs with `--strict` on graphql-core 3.2.14 (execution with
`--random 1500 --seed 1`, the sheet's run):

| Area | Result |
| --- | --- |
| execution | 11858 cases, 2704 distinct. `calledSerially` fails on 510 mutation cases (below); every other check passes. With `--coroutine-resolvers`, every case passes. |
| parse | 1973 of 1983 vectors agree. `selectionSets` and `stringValue` fail, on draft-only vectors only. |
| validate | 3029 of 3088 vectors agree; 11 of the 59 failures are crashes. `fieldSelectionMerging` and `singleRootField` fail; `operationTypeExistence` and `allVariableUsagesAreAllowed` fail on draft-only vectors only. §5.6.2 and §5.6.4 are `subsumed`. |
| coerce | 1239 of 2036 vectors match. `requestErrorNoData` fails on 790 (below). `float`, `floatPrecision` (SHOULD), `inputObject` and `list` fail on 7 more. A lone surrogate is kept as sent. With `--validate`: 450 of 2010 match (26 skipped), and only `requestErrorNoData` fails, on 1560. |
| schema | 140 of 165 schemas agree. The other 25 include 7 crashes. 36 of 44 tested rules pass, 8 fail. |
| introspect | 13 of 38 results pass, graded against the draft. `builtinDefinitions` fails on every `__schema` result, and `executes` on the 3 draft-only `directiveDeprecation` results. |

### Compared with graphql-js 16

graphql-core 3.2 tracks graphql-js 16. In parse, validate, schema and
introspect, every check has the same status and the same number of failing
vectors as in [graphql-js 16.15.0's
reports](../../conformance/reports/), and the findings are the same, with the
same counts, crashes included (validate's 11 `validate()` throws, as of the
adapter change that answers them with `error`). In coerce, every check is the same except `requestErrorNoData`,
which graphql-js 16 passes: `JSON.stringify` drops graphql-js's `data:
undefined`, but graphql-core's `formatted` always writes `"data"` (below).

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

### Coerce: a request error has `"data": null`

`ExecutionResult.formatted` always writes a `data` entry
(`execution/execute.py:188-195`), and a request error is an
`ExecutionResult` with `data=None` (`execution/execute.py:1345`, and
`graphql.py:290`, `:296` and `:303` for schema, syntax and validation
errors). So it serializes as `{"data": null, "errors": [...]}`, where the
draft's §7.1.3 says a request error result must not contain `data`.
October 2021 says "must not be present" too, in §7.1 and under "Request
errors" in §7.1.2 (its "Data" paragraph alone says "should not"):

```
graphql_sync(schema, "{ int(v: 1) }", operation_name="A").formatted
{'data': None, 'errors': [{'message': "Unknown operation named 'A'."}]}
```

The kit classifies these as request errors, so the other checks still grade
them, and only `requestErrorNoData` fails: 790 vectors, and 1560 with
`--validate`, where validation errors are request errors too.
`ExecutionResult` can't tell no data from null data, since both are `None`;
a server that wants to leave the entry out has to decide from the errors.

### Coerce: literals that only validation catches

Without validation (`unvalidated`), as in graphql-js 16:

- **§3.5.2 Float (MUST) and `floatPrecision` (SHOULD):** `parse_float_literal`
  returns `float(value_node.value)` with no range check
  (`type/scalars.py:151-158`). `{ float(v: 1e400) }` gets `inf`, and
  `{ float(v: 99999999999999999999) }` gets `1e+20`.
- **§3.10 and §3.11 (MUST, 5 vectors):** `value_from_ast` reads only the
  fields the input object type defines, and ignores the rest
  (`utilities/value_from_ast.py:130-149`). `{ point(v: { x: 1, z: 1 }) }`
  gets `{'x': 1, 'y': 0}`. graphql-js 17 rejects this; 16 doesn't.

`ValuesOfCorrectTypeRule` rejects all of these, so with `--validate` none of
them fails.

### Parse

Both are draft-only. graphql-js 16 rejects the same 10 vectors.

- **Empty selection sets (8 vectors).** `parse_selection_set` reads
  `{ Selection+ }` with `many` (`language/parser.py:770-777`), so `{}` gives
  "Expected Name, found '}'". The draft allows an empty selection set since
  graphql-spec#1227; October 2021 doesn't.
- **Variable-width escapes over eight hex digits (2 vectors).**
  `read_escaped_unicode_variable_width` stops after 12 characters
  (`language/lexer.py:470-491`), so `"\u{000000041}"` gives "Invalid Unicode
  escape sequence". `{ HexDigit+ }` has no limit.

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
- **§5.2.1.1 Operation Type Existence (12 vectors, draft only).** No rule
  checks that the schema has a root type for the operation, so
  `mutation { ... }` against a schema without `Mutation` passes. Execution
  then fails it.
- **§5.2.4.1 with `@skip` or `@include` at a subscription's root (12
  vectors accepted, 11 crashes; the kit tags them draft only).**
  `subscription { postAdded @skip(if: true) { id } }` is accepted. The draft
  forbids `@skip` and `@include` in a subscription's root selection set. But
  October 2021 forbids this document too: it collects the root fields with no
  variable values and requires exactly one entry, and `@skip(if: true)` on
  the only root field leaves none. graphql-core reports an error only when it
  collects more than one field (`validation/rules/single_field_subscriptions.py:93`).
  With a variable as the condition (`@include(if: $v)`), `validate` raises
  instead (above), a crash.
- **§5.8.5 for OneOf (2 vectors, draft only).** `mutation
  addNullableCat($cat: CatInput) { addPet(pet: {cat: $cat}) { name } }` is
  accepted. `VariablesInAllowedPositionRule` does check for a nullable
  variable in a OneOf field, but tests `is_input_object_type(parent_type)`
  (`validation/rules/variables_in_allowed_position.py:95-98`), and the parent
  type is still wrapped in Non-Null when the OneOf argument or list item is
  non-null (`pet: PetInput!` here). With a nullable `PetInput` argument,
  graphql-core rejects the same document.

### Schema

The same 8 failing rules as graphql-js 16, with the same schemas.

- **`typeNameNotBuiltin`:** `type Int { a: String } type Query { a: String }`
  is accepted. `build_schema` replaces a definition named like a built-in
  type with the built-in (`utilities/extend_schema.py:274`).
- **`rootTypesDifferent` (2 schemas):** `validate_root_types` checks only that
  each root is an object type, not that they differ
  (`type/validate.py:136-165`).
- **`directiveUsesItself`, `directiveReferencesItselfIndirectly`:** nothing in
  `type/validate.py` follows a directive's uses of directives.
- **`argDefaultCompatible` (10 schemas, draft only):** default values aren't
  validated. `build_schema` coerces each with `value_from_ast`
  (`utilities/extend_schema.py:663`), and a default that doesn't coerce
  becomes `Undefined`: `f(x: Int = "1")` silently has no default.
- **`implDeprecation` (1 schema, draft only):** a deprecated field may
  implement one that isn't.
- **`inputObjectUnbreakableCycle` (2 schemas, draft only):** the cycle check
  follows only Non-Null input object fields (`type/validate.py:589`), so it
  misses `input A @oneOf { b: B } input B @oneOf { a: A }`, whose fields are
  nullable but can't be left all null.
- **`inputObjectDefaultValueCycle`, crashes (4 invalid schemas, 3 valid).**
  `input I { i: I = {i: null} }` raises `RecursionError` from `build_schema`.
  Building `I`'s fields coerces the default `{i: null}` with
  `value_from_ast` (`utilities/extend_schema.py:681`), which reads `I`'s
  fields, which aren't built yet. The `RecursionError` comes out wrapped in
  `TypeError: I fields cannot be resolved. ...`
  (`type/definition.py:2921-2924`). Valid schemas crash too.

### Introspect

graphql-core 3.2.14 has the draft's introspection fields (`isOneOf`,
deprecated arguments, input fields and directives, `DIRECTIVE_DEFINITION`,
`@oneOf`), with some October 2021 definitions. They fail
`builtinDefinitions` on all 22 `__schema` results that execute:

- `@deprecated(reason: String = "No longer supported")`
  (`type/directives.py:372-380`), and `includeDeprecated: Boolean = false` on
  `__Type.fields` and `enumValues` (`type/introspection.py:312`, `:328`). The
  draft has `String!` and `Boolean!`; October 2021 has what graphql-core has.
- `includeDeprecated: Boolean = false` on `__Type.inputFields`,
  `__Field.args` and `__Directive.args` (`type/introspection.py:337`, `:461`,
  `:147`). The draft has `Boolean!`, and October 2021 has no argument there.

`directiveDeprecation` fails `executes` in all 3 of its vectors, which are
draft only: `build_schema` can't parse `directive @old @deprecated on FIELD`
("Expected 'on', found '@'"). The failure is the SDL parser's, not
introspection's. The parser reads directives on a directive definition only
with `experimental_directives_on_directive_definitions=True`
(`language/parser.py:1442-1446`), which `build_schema` accepts but which is
off by default. The adapter keeps the default. With the flag, the schema
builds and introspection reports the deprecated directive correctly.

Every lookup whose schema builds passes, and so does every other check,
wrapper types included.
graphql-js 16 fails the same way.
