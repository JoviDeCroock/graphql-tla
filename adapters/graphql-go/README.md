# graphql-go adapter

A [graphql-tla conformance adapter](../../docs/conformance.md) for
[graphql-go](https://github.com/graphql-go/graphql) 0.8.1
(`github.com/graphql-go/graphql`), the Go port of graphql-js.

## Why graphql-go

The kit sends a different SDL for each fixture, so the adapter has to build
a schema at runtime and put one resolver on every field.

- graphql-go builds schemas from Go values (`graphql.NewObject`,
  `graphql.Field{Resolve: ...}`), so any SDL can be turned into a schema and
  every field can get the same `Resolve` function. A resolver can return a
  thunk, `func() (interface{}, error)`, which graphql-go calls later, so
  many resolvers are pending at once.
- [graph-gophers/graphql-go](https://github.com/graph-gophers/graphql-go)
  parses SDL, but binds each field to a method or struct field of a Go type
  by reflection, and resolves abstract types through `ToUser()`-style
  methods. Go can't create types with methods at runtime (`reflect.StructOf`
  has no methods), so it can't serve an arbitrary SDL.
- gqlgen generates code from the SDL ahead of time.

## How it works

graphql-go has no `buildSchema`: a schema is a graph of Go values built with
`graphql.NewObject` and friends. [`schema.go`](schema.go) parses the SDL with
graphql-go's own parser (`language/parser`) and maps each element to one
graphql-go config value:

- every type with its description: custom scalars, objects (with their
  interfaces), interfaces, unions, enums and input objects. Only the SDL's
  own types go into `SchemaConfig.Types`; a built-in scalar is in the schema
  when something references it, as graphql-go decides;
- every field, argument, input field and enum value, with its type and
  description. A default value is a literal in SDL and an internal value in
  graphql-go, so it is converted with a copy of graphql-go's own literal
  coercion, `valueFromAST` (values.go:351-413, unexported): `[Int] = 1`
  becomes `[]interface{}{1}`, as a Go program building the schema would write
  it;
- `@deprecated` on a field or an enum value, as its `DeprecationReason`
  (graphql-go's `DefaultDeprecationReason` when no reason is given);
- every directive definition, with its description, arguments and
  locations, added to graphql-go's `SpecifiedDirectives`;
- the root types of a `schema` definition, or `Query`, `Mutation` and
  `Subscription` by name when there is none;
- custom scalars that pass every value through, and read every literal
  (`custom-scalar-literals`).

Other applied directives are left out: graphql-go keeps none on its types,
and graphql-js's `buildSchema` keeps none either. What graphql-go can't hold
is refused, and the schema isn't built, rather than dropped:

- `@deprecated` on an argument, an input field or a directive, or with the
  reason `""` (graphql-go reads an empty `DeprecationReason` as not
  deprecated);
- `@specifiedBy` and `@oneOf`, which graphql-go doesn't know;
- the directive locations `VARIABLE_DEFINITION` and `DIRECTIVE_DEFINITION`,
  for which graphql-go has no constant (directives.go:5-24);
- type extensions, which graphql-go has no API to apply.

What graphql-go's parser can't read never gets that far: an interface
implementing an interface, `repeatable`, a description on the schema
definition, the literal `null` and every extension but `extend type` are
syntax errors there. graphql-go 0.8.1 has no interface implementing an
interface at all (`InterfaceConfig` has no `Interfaces`).

Every field gets the adapter's `Resolve` (none for introspect), interfaces and unions get a `ResolveType` that picks the object
type named by the value's `__typename`, and every root subscription field
gets a `Subscribe`. Schemas are cached by SDL.

The resolver sends `call`, stamped with `after` (the settles applied so far),
and returns a thunk that blocks until the kit settles the call. The
execution runs with `graphql.Do`, or `graphql.Subscribe` for a subscription,
on its own goroutine, and its `*graphql.Result` is serialized with
`encoding/json`, untouched.

With `subscription-stream`, [`stream.go`](stream.go) gives graphql-go a
source stream the kit drives. graphql-go's source stream is the
`chan interface{}` a root subscription field's `Subscribe` returns;
`ExecuteSubscription` (subscription.go:206-221) executes the selection set
for each value it receives and closes its response channel when the source
channel closes or the request's context is done. So the kit's `emit` sends
an event on the channel, `complete` closes it, and `cancel` cancels the
context passed in `graphql.Params`, which is how a Go client cancels. Each
result on the response channel is a `response`, and the channel closing is
`done`. graphql-go passes the request's context on to `Subscribe`, and a
source stops when that context is done, as the sources in graphql-go's own
`subscription_test.go` do; the adapter's source reports that as
`source-cancelled`.

The other areas ([`areas.go`](areas.go)) run in a worker process, the
adapter itself started with `--area-worker` ([`worker.go`](worker.go)). A Go
stack overflow is a fatal error that no `recover` catches, and graphql-go's
validator overflows its stack on a fragment cycle (below). When the worker
dies, the adapter answers the request with an `error` quoting Go's fatal
error and the first graphql-go frame, which the kit records as a crash, and
starts a new worker.

## Build

Needs Go 1.22 or later.

```shell
cd adapters/graphql-go
go build -o bin/graphql-tla-graphql-go .
```

`bin/` is gitignored.

## Run

From the repository root:

```shell
node kit/cli.mjs run execution --adapter "adapters/graphql-go/run.sh"
node kit/cli.mjs run execution --adapter "adapters/graphql-go/run.sh" --strict
node kit/cli.mjs run parse --adapter "adapters/graphql-go/run.sh" --strict
node kit/cli.mjs run introspect --adapter "adapters/graphql-go/run.sh" --strict
node kit/cli.mjs run coerce --adapter "adapters/graphql-go/run.sh" --strict
```

The engine calls the next resolver within microseconds of a settle, so a
shorter `--grace` (10 ms) gives the same results faster.

`--sync` makes the resolver block until its call settles and return the
value instead of a thunk. That is graphql-go without concurrency: one
resolver pending at a time, and list items inline. It shows which deviations
come from thunks.

```shell
node kit/cli.mjs run execution --adapter "adapters/graphql-go/run.sh --sync" --strict --grace 10
```

## Capabilities

The adapter answers `execution`, `parse`, `introspect` and `coerce`.

- `deferred-items`: graphql-go completes a list item that is a
  `func() (interface{}, error)` as a thunk, like a field's result
  (`completeValue`, executor.go:687-694), so each item is its own call.
  Not claimed with `--sync`.
- `invalid-results`: resolvers return `interface{}`, so any shape can be
  returned.
- `mutation`, `subscription`: `graphql.Do` and `graphql.Subscribe`. The root
  subscription field's `Subscribe` returns the event stream, and its
  `Resolve` runs on the event, as in graphql-js, so it is the root `call`.
- `subscription-stream`: see [How it works](#how-it-works).
- `parent-values`: the root value (`graphql.Params.RootObject`), the
  subscription's events and every object a resolver returns are maps that
  carry the kit's token, and each field's call reports the token of the
  `Source` graphql-go gave its resolver.
- `scalar-results`: resolvers can return the Go `int` 4 for an ID and
  2147483648 for an Int.
- `uncoercible-results`: resolvers can return `1.2` for an Int, `+Inf` for a
  Float and `"NOT_A_VALUE"` for an enum. When `encoding/json` can't serialize
  graphql-go's result (below), the adapter sends `no-response`.

Not claimed:

- `idle`: runs aren't deterministic. graphql-go keeps a selection set's
  fields in a Go map and resolves them in map order (`executeSubFields`,
  executor.go:298), and calls the thunks in map order too
  (`dethunkMapBreadthFirst`, executor.go:339). Go randomizes map iteration,
  so the order of calls changes from run to run with the same settles. The
  kit waits `--grace` ms instead.
- `error-propagation-off`: graphql-go has no switch for it.
- `custom-scalar-results`: a custom scalar's result coercion can't raise an
  error. `SerializeFn` is `func(value interface{}) interface{}`, with no
  error result, and graphql-go's own custom scalar example
  (examples/custom-scalar-type) returns nil for a value it can't serialize,
  which `completeLeafValue` (executor.go:869-876) turns into null without an
  error. Making the serializer panic would get an error from graphql-go's
  recover, but that isn't its scalar API. The silent null is graded on the
  built-in scalars and enums anyway (below).
- `schema`: graphql-go can't build a schema from SDL, so every verdict
  would be the adapter's SDL handling, not graphql-go's.
- `coordinate`: graphql-go 0.8.1 has no schema coordinate API (§2.14).
- `validate` (and with it `custom-scalar-literals`): the kit's validation
  schemas use an interface implementing an interface and a `repeatable`
  directive, both in October 2021, and graphql-go 0.8.1 can express
  neither (`InterfaceConfig` has no `Interfaces`; the parser rejects
  `repeatable`). A strict run had 3215 of 3354 vectors fail on the schema,
  so the area would grade graphql-go's schema model rather than its
  validation rules, and the validate protocol has no `unsupported` answer.
  What graphql-go's rules do on the rest is below, under
  [Validate](#validate-not-claimed).

### The other areas

- **parse**, with `parse-sdl`: `parser.Parse`, the parser `graphql.Do`
  uses. It reads every kind of definition, so the adapter then checks the
  kinds the request's grammar allows. A `*gqlerrors.Error` is `ok: false`;
  anything else is an `error`. A source with a lone surrogate is answered
  `unsupported`: Go's `encoding/json` replaces it with U+FFFD, so graphql-go
  would parse another source.
- **introspect**, with `custom-directives`: the query through `graphql.Do`,
  and its `*graphql.Result` as `encoding/json` writes it. A schema
  graphql-go can't build is answered as a request error (`errors`, no
  `data`).
- **coerce**, with `nested-fields`, `subscription-source` and
  `request-extensions`: the request through `graphql.Do`, which parses,
  validates and executes, with a resolver on every field that records its
  path and `p.Args`. When `subscribe` is given and the operation the request
  selects is a subscription, it goes through `graphql.Subscribe` instead,
  with a source stream resolver that records its call and raises or returns
  a channel with one event; the response is the first result. The
  variables are read with `encoding/json`, as a Go server would
  (graphql-go/handler does). graphql-go has no request extensions, so they
  are read and dropped. Not claimed: `absent-vs-null` (`getArgumentValues`,
  values.go:41-68, leaves out an argument whose value is null, so null and
  absent can't be told apart), `unvalidated` (`graphql.Do` always
  validates) and `exact-numbers` (`encoding/json` reads numbers as
  `float64`).

## Known graphql-go deviations

Levels are September 2026's, as the kit grades them.

### Execution

From a strict run with 1500 random runs per fixture and `--grace 10`
(27080 cases, 5358 distinct, 36 subscription streams; 1514 satisfy the
reference, 928 malformed; no adapter problems,
no crashes). With thunks (the default):

- **A Non-Null error nulls all of `data`, drops the other errors, and
  abandons pending resolvers** (`dataMatches`, `nullsExplained`,
  `complete`; MUST). `handleFieldError` re-panics an error at a Non-Null
  position so that the nearest nullable parent catches it
  (executor.go:583-591). But a thunk runs from the dethunk loop
  (`completeThunkValueCatchingError`, executor.go:754, called from
  `dethunkMapBreadthFirst`), outside the parent's
  `completeValueCatchingError`. The panic reaches the recover in `Execute`
  (executor.go:53-58), which returns a new `Result` holding only that error
  and no data. So `{ user { id } }` with `id: ID!` null gives
  `{"data": null}`, not `{"data": {"user": null}}` (`dataMatches`), and
  errors raised earlier are lost (`nullsExplained`). The panic also abandons
  the thunks still pending, so the response goes out early (`complete`).
  The `complete` findings are this same panic: when no root field could
  still null `data` (in `lists`, `posts` has absorbed the error and `tags`
  only waits on nullable items), the kit counts them under `dataMatches`
  too. When a Non-Null root field is still pending, as in some `mutation`
  cases, `data: null` might yet be right, so only `complete` is certain.
  The same happens to a subscription event's result: in `subscriptionAlias`,
  `liked.likes: Int!` settled to null gives `{"data": null}` where
  `{"data": {"liked": null}}` was due.
- **Mutation root fields aren't serial** (`calledSerially`, SHOULD, every
  mutation case). `executeFieldsSerially` (executor.go:249-275) calls every
  root field's resolver, then dethunks the results (executor.go:268). With
  thunks, all root fields are called before the first completes. Since no
  mutation runs serially, `serialErrorsKept` isn't graded in this mode.

In both modes:

- **Leaf results that can't be coerced become null without an error.**
  `completeLeafValue` (executor.go:869-876) returns null when the type's
  `Serialize` returns nil, and raises nothing. `Enum.Serialize` returns nil
  for a name that isn't a value (definition.go:1007-1019), and `coerceInt`
  returns nil for an `int` outside 32 bits (scalars.go:29-33). A nullable
  position then holds null with no error; a Non-Null one gets graphql-go's
  "Cannot return null" error. The kit counts the unknown enum name and the
  Int 2147483648 under `coercionErrorReported` (MUST): §3.9 and §3.5.1 want
  an execution error. `coerceInt`, `coerceFloat` and `coerceBool` also
  return nil for an object; that silent null counts under `nullsExplained`.
- **A fraction for an Int is truncated** (`intFraction`, MUST). `1.2`
  becomes `1` (`coerceInt`, scalars.go:124-128), where §3.5.1 says a service
  must raise an execution error when it can't coerce "without losing
  information".
- **A non-finite Float leaves the client without a response**
  (`resultCoercion`, MUST). `coerceFloat` returns `+Inf` unchanged
  (scalars.go:259), where §3.5.2 requires an execution error.
  `encoding/json` then refuses to serialize the result
  (`json: unsupported value: +Inf`), so `graphql.Do`'s result never reaches
  the client. The adapter reports `no-response`.
- **Keys are sorted, not in field order** (`keyOrder`, SHOULD).
  `Result.Data` is a `map[string]interface{}` (executor.go:288-311), and
  `encoding/json` writes map keys sorted. §7.2.2 says they should follow the
  selection set. This is most of what fails in `leaves` and `ordering`:
  `color, count, ratio` never matches the selection's `count, ratio, color`.
- **A Non-Null mutation root error loses earlier errors** with `--sync`
  (`serialErrorsKept`, MUST): it panics up to the same recover in
  `Execute`, which drops the errors already collected.
- **A failing source stream ends the response stream normally**
  (`failsWithSource`, MUST since September 2025). graphql-go's source stream
  is a `chan interface{}` (subscription.go:206-218), which can't carry an
  error, and the `Subscribe` function's error result only covers setting the
  stream up. Nor is there an error item, as in engines whose stream items
  are results: any value sent on the channel is an event, which graphql-go
  executes the selection set on as the root value
  (`mapSourceToResponse`, subscription.go:81-90). A source that fails can
  only close its channel, and graphql-go
  then closes the response channel as for a completed source. Reproduction:
  a `Subscribe` returning a channel that is closed before any event; the
  response channel closes with no result and no error.
- **Cancelling while an event executes yields a "context canceled" result**
  (`nothingAfterCancel`, SHOULD; `errorPath`, MUST; `complete`). `Execute`
  waits on the request's context next to the execution (executor.go:86-89),
  and when the client cancels it returns at once
  `{"data": null, "errors": [{"message": "context canceled", "locations": []}]}`,
  an error with no path, while the event's resolvers are still pending.
  `ExecuteSubscription` (subscription.go:217) sends that result on the
  response channel after the cancellation, before closing it.

Passing: `parentValue` (each resolver gets the root value, the event or its
parent's object as `Source`), `idAsString` (the integer 4 for an ID becomes
`"4"`), `intRange` (no Int outside 32 bits is passed through),
`uniqueKeys`, the error `locations` checks, and the stream checks other than
`failsWithSource` and `nothingAfterCancel`. `cancelCancelsSource` passes
because graphql-go gives the `Subscribe` function the request's context; it
doesn't close or drain the source channel itself.

### Parse

A strict run: 2316 of 2832 graded vectors agree, no crashes (the 20 crash
probes all get an answer); 15 vectors with a lone surrogate are
`unsupported`. Every check is a MUST, and 41 of 51 fail. The causes, each in
graphql-go's lexer or parser (`language/lexer`, `language/parser`):

- **No `null` literal.** `parseValueLiteral` takes every name but `true`
  and `false` as an enum value, and `null` as a syntax error
  (parser.go:596-618): `{a(x: null)}` is rejected, and `enum E { null }`
  accepted (§2.10.5, §2.10.6).
- **A Byte Order Mark between tokens is an error** (§2.1.6, 133 vectors):
  `{a\uFEFFb}` is rejected; the lexer only skips one at the start
  (lexer.go:607).
- **September 2025 and 2026 grammar is missing**: descriptions on
  operations, fragments and variables (85 vectors, §2.2), empty selection
  sets (11, §2.5: "Unexpected empty IN {}", parser.go:1560), raw control
  characters other than tab, LF and CR (§2.1), `\u{…}` escapes, and the
  rule that an escaped lone surrogate is an error (`{a(x: "\uD83D")}` is
  accepted, §2.10.4).
- **The type system grammar is October 2016's**: no `implements A & B` with
  a leading `&` or commas between interfaces, no `repeatable`, no
  description on the schema definition, no extension but `extend type`
  (`parseTypeExtensionDefinition`, parser.go:1366-1381, so §3.3.2, §3.5.6,
  §3.7.1, §3.8.1, §3.9.1, §3.10.2 and §3.13.6 all fail), and a type, enum,
  input object or union without a body (`type T`, `enum E`) is an error.
  Empty bodies are accepted: `type T {}`, `enum E {}`, `input I {}`.
- **Other lexer and parser gaps:** an empty document is accepted (§2.3:
  `parseDocument` returns a document with no definitions); `query ($a: ) {a}`
  and `query ($a: !) {a}` are accepted (§2.11, §2.12); a name right after a
  number is accepted (`{a(x: [1_])}`, §2.10.1); a variable in a constant
  position is accepted in a type system document (`scalar S @d(a: $v)`,
  §2.10); `directive @d on FOO` is accepted (§3.13).

### Validate (not claimed)

Observed outside the kit's grading, in a strict run before the claim was
dropped. Of the 141 vectors whose schemas graphql-go builds (`examples`,
`hello`, `mutation`, `scalars`), 127 agreed with the reference; 5 documents
didn't parse (no `null`, empty selection sets, descriptions on executable
definitions; see Parse). The rest, with
`graphql.ValidateDocument` and its `SpecifiedRules`, which `graphql.Do`
runs. The kit's levels are given for reference only.

- **No Single Root Field rule** (§5.2.4.1, MUST):
  `subscription sub { newMessage { body } disallowedSecondRootField }` and
  `subscription sub { __typename }` are valid.
- **No Operation Type Existence rule** (§5.2.1.1, MUST, since September
  2025): `mutation goodbyeMutation { goodbye }` against a schema without a
  mutation root is valid.
- **No Directives Are Unique per Location rule** (§5.7.3, MUST):
  `mutation @audit @audit { increment(by: 1) }` is valid.
- **A fragment cycle overflows the stack**: §5.5.2.2's own example
  (`nameFragment` spreading `barkVolumeFragment` and back) makes the
  OverlappingFieldsCanBeMerged rule recurse until Go dies with
  `fatal error: stack overflow`
  (rules_overlapping_fields_can_be_merged.go:204-209 and 339). It isn't
  caught by `recover`; the adapter's area worker turns it into an `error`.
  `graphql.Do` runs the same rules, so a coerce request with such a cycle
  would do the same.
- **Valid documents rejected** (§5.4.3, §5.8.5, MUST): an argument of type
  `Boolean! = false` is required anyway (`optionalNonNullBooleanArgField`
  with no argument: "is required but not provided"), and a nullable
  variable can't be used there (`$booleanArg: Boolean` "used in position
  expecting type Boolean!"), though both are allowed since a default
  exists.

### Introspect

graphql-go rejects September 2026's and September 2025's queries
(`Cannot query field "description" on type "__Schema"`). Its introspection
types lack `__Schema.description`, `__Type.specifiedByURL`, `__Type.isOneOf`,
`__InputValue.isDeprecated` and `deprecationReason`,
`__Directive.isRepeatable`, and `includeDeprecated` on
`__Type.inputFields`, `__Field.args` and `__Directive.args`, so the kit
grades September 2025's query without them (`builtinDefinitions`, MUST, one
case). A strict run: 9 of 59 graded results satisfy the reference, 7 more
fail only a SHOULD or INFO check, 5 aren't graded (syntax only a later
release has).

- **Schemas graphql-go can't build** (`executes`, MUST, 23 results): an
  interface implementing an interface (`interfaces`), `repeatable`
  (`rich`, `locations`, `directiveArgDeprecation`), a description on the
  schema definition (`descriptions`, and `rich`), `= null` as a default
  (`defaults`), and deprecated arguments and input fields
  (`inputDeprecation`, `inputDeprecationAll`). `@specifiedBy` (`scalars`)
  and `@oneOf` (`oneOf`) count under `builtinDirectives` (SHOULD) instead.
- **List and input object defaults are printed with Go's `%v`**
  (`defaultValue`, MUST, 3 results). The `defaultValue` resolver passes the
  `*Argument` itself as the type to `astFromValue` (introspection.go:265 and
  272), so it never sees a list or input object type and prints the value
  as a string: `l: [String] = ["\u0002", "😀"]` gives `"[\x02 😀]"`, and
  an input object default `"map[s:\x04 t:[\x05😀]]"`.
- **An interface's `interfaces` is null** (`typeKinds`, MUST, 6): graphql-go
  answers `interfaces` for objects only.
- **A built-in scalar referenced only by a directive argument is left out**
  (`builtinScalars`, `typeByName`, MUST): with
  `directive @d(f: Float) on FIELD`, `Float` isn't in `types` and
  `__type(name: "Float")` is null. graphql-go collects the type map from the
  root types and `SchemaConfig.Types` (schema.go:81-100), not from
  directives.
- **Not in source order** (`order`, SHOULD, since September 2025, 8):
  fields, arguments and enum values are Go maps in graphql-go's config API,
  so no order survives.
- **Built-in definitions are October 2021's** (`builtinDefinitions`, MUST;
  `builtinNullability`, SHOULD): `@deprecated(reason: String)` on
  `FIELD_DEFINITION | ENUM_VALUE` only, `includeDeprecated: Boolean`
  without `!`, and `__DirectiveLocation` without `VARIABLE_DEFINITION`.
  `__Directive` also has graphql-go's own `onOperation`, `onFragment` and
  `onField` (`builtinAdditions`, INFO).

### Coerce

A strict run: 401 of 2139 results match the reference; 39 produced no
response.

- **A request error has `"data": null`** (`requestErrorNoData`, MUST, 1444
  vectors): `graphql.Result` declares `Data interface{} \`json:"data"\``
  without `omitempty` (types.go:11), so every request error graphql-go
  returns (a syntax error, a validation error, a variable that doesn't
  coerce) is written with `"data": null`. The adapter writes graphql-go's
  `Result` as it is.
- **Variables are coerced leniently** (MUST): a String variable takes `0`
  (`string`, 40), a Boolean `0` (`boolean`, 44), an ID `[]` as `"[]"`
  (`id`, 30), an Int `1.5` as `1` (`int`, 44), a Float `"1"` (`float`, 3).
  graphql-go's `coerceString`, `coerceBool`, `coerceInt` and `coerceFloat`
  (scalars.go) convert from other kinds instead of rejecting them. An Int
  literal `2147483648` is accepted too (`intRange`, SHOULD, 16).
- **No `null` literal** (see Parse): `{ ints(v: [null]) }`,
  `{ intDefault(v: null) }` and `query($x: Int = null)` are syntax errors
  (`list`, `int`, `enum`, `inputObject`, `variables`).
- **A null variable is replaced by the default** (`variables`, MUST):
  `getArgumentValues` (values.go:60-62) uses the default when the value is
  nullish, so `query($x: Int) { intDefault(v: $x) }` with `{"x": null}`
  gives `v: 7`, and `{"x": 1, "y": null}` for `Point` gives `y: 0`
  (`inputObject`). A null variable with a default for a Non-Null argument is
  accepted (`nonNull`, since September 2026, and `argumentsBelowRoot`).
- **An input field default isn't applied for a variable with no value**
  (`inputFieldDefaults`, SHOULD, 2): `{ origin: { x: 1 }, color: $c }` with
  no `$c` leaves `color` out instead of `RED`.
- **Block strings** (`stringValue`, MUST, 3): `"""\ta\r\n\t\tb\r  c"""`
  gives `"b\nc"`: graphql-go's block string dedent mishandles CR line ends
  and tabs.
- **Valid documents rejected at validation** (`acceptsValid`, MUST, 21): an
  argument `b: Int! = 2` is required anyway (`{ pair }`), as under Validate;
  descriptions on operations don't parse (`descriptionsInert`, 8).
- **Two subscription root fields are executed** (`onlyValidExecuted`,
  SHOULD): graphql-go has no Single Root Field rule.
- **No response** (`responds`, MUST, 39): the 20 OneOf vectors (graphql-go
  can't express `@oneOf`), and 19 whose variables hold `1e400`.
- **The 19 `1e400` vectors are a limit of the transport, Go's
  `encoding/json`, not of graphql-go.** `encoding/json` refuses to decode
  the number (`cannot unmarshal number 1e400 into Go value of type
  float64`), so the request never reaches graphql-go. A Go server reading
  JSON with `encoding/json` (graphql-go/handler does) refuses the request
  the same way before graphql-go sees it; the adapter doesn't make up a
  request error for it.

