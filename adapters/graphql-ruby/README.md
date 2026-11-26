# graphql-ruby adapter

A [graphql-tla conformance adapter](../../docs/conformance.md) for
[graphql-ruby](https://github.com/rmosolgo/graphql-ruby) 2.6.15. It answers
`execution`, and the [areas beyond it](../../docs/kit-areas.md) `parse`,
`validate`, `coerce`, `schema` and `introspect`. It doesn't claim
`coordinate`: graphql-ruby has no schema coordinate API (below).

Source references below are to graphql-ruby 2.6.15, files under
`lib/graphql/` in the gem.

## Setup

Needs Ruby and Bundler (checked with Ruby 3.4.3). The gems go into
`vendor/bundle`, which is gitignored. The Gemfile pins graphql-ruby and the
`json` gem (2.9.1, the version Ruby 3.4.3 ships), since the adapter reads
the kit's messages with it, and which inputs it refuses shows up in the
results ([parse](#parse), [coerce](#coerce)).

```shell
cd adapters/graphql-ruby
bundle config set --local path vendor/bundle
bundle install
```

## Run

From the repository root:

```shell
node kit/cli.mjs run execution --adapter "adapters/graphql-ruby/run.sh"
node kit/cli.mjs run execution --adapter "adapters/graphql-ruby/run.sh" --strict
node kit/cli.mjs run parse --adapter "adapters/graphql-ruby/run.sh" --strict
node kit/cli.mjs run validate --adapter "adapters/graphql-ruby/run.sh" --strict
node kit/cli.mjs run coerce --adapter "adapters/graphql-ruby/run.sh" --strict
node kit/cli.mjs run coerce --adapter "adapters/graphql-ruby/run.sh --unvalidated" --strict
node kit/cli.mjs run schema --adapter "adapters/graphql-ruby/run.sh" --strict
node kit/cli.mjs run introspect --adapter "adapters/graphql-ruby/run.sh" --strict
```

`run.sh` runs `adapter.rb` with the gems in `vendor/bundle`, using `$RUBY` if
it is set, otherwise `ruby` from `PATH`. It passes its arguments on:

- `--lazy` waits through `lazy_resolve` instead of the Dataloader (below).
- `--invalid-results` turns wrong-shaped and uncoercible results into field
  errors with graphql-ruby's documented hooks (below). Without it,
  graphql-ruby raises out of `execute` for them, and the adapter answers
  `no-response`.
- `--no-idle` leaves out `idle`, so the kit falls back to `--grace`.
- `--unvalidated` makes `coerce` execute without validating, and claims
  `unvalidated` (see [coerce](#coerce)).

`--lazy` and `--invalid-results` only change execution. The other areas build
their own schemas and ignore them.

## How it works

The schema is built from the kit's SDL with `GraphQL::Schema.from_definition`
(cached by SDL), with one `default_resolve` object. Its `call` is the resolver
of every field, and its `resolve_type` picks the type named by the kit's
`object` outcome. The resolver sends `call`, stamped with `after` (the settles
the execution had applied), then waits for the kit's `settle`. An `error`
outcome is raised as a `GraphQL::ExecutionError`. The response is
`Query::Result#to_h`.

graphql-ruby's `Schema#execute` doesn't return until the response is
complete, so the adapter runs it on the thread that reads stdin. Where
graphql-ruby needs a value the kit hasn't settled yet, the adapter reads the
kit's messages, applying each `settle`, until it has. So graphql-ruby is
blocked on the kit exactly when the adapter is reading, and it says `idle`
before each read.

### Concurrency: GraphQL::Dataloader

By default the resolver loads its call from a `GraphQL::Dataloader::Source`
(`dataloader.with(KitSource, execution).load(call)`). That pauses the
resolver's fiber, and graphql-ruby runs the other fields' fibers until every
one is paused. Then it runs the source, whose `fetch` gets every call loaded
so far and waits for each to be settled (`Dataloader#run_pending_steps`,
`lib/graphql/dataloader.rb:357`). So the kit sees several pending resolvers at
once, settles them in any order, and graphql-ruby resumes the paused fields
when the whole batch has settled.

This is the default because the Dataloader is graphql-ruby's built-in way to
batch and wait for external data, and the one new applications reach for.
`GraphQL::Dataloader::AsyncDataloader` runs the sources' fetches concurrently
with the `async` gem, but it also waits until every running source has
finished before it resumes any field (`run_queue`,
`lib/graphql/dataloader/async_dataloader.rb:324`). From the kit's side it
behaves the same, without the extra gem.

### `--lazy`: lazy_resolve

With `--lazy`, the resolver returns a `KitLazy` registered with
`lazy_resolve(KitLazy, :value)`, the way GraphQL::Batch and other promise
libraries plug in. graphql-ruby queues each lazy by depth
(`lib/graphql/execution/interpreter/runtime.rb:1002`), runs everything it can,
then syncs the shallowest lazies one by one, continuing each field as soon as
its own value arrives. A list's items can be lazy too, so this mode claims
`deferred-items`. It passes the kit as well.

## Capabilities

- `idle`: graphql-ruby only runs on the adapter's one thread, and only waits
  for the kit in the adapter's read loop. The kit's determinism replay
  passes.
- `mutation`: graphql-ruby evaluates each root field of a mutation in its own
  `Dataloader#run_isolated` (`runtime.rb:329-331`), so it completes before the
  next one starts. The `after` stamps make `calledSerially` conclusive.
- `subscription`: the adapter installs an in-memory `GraphQL::Subscriptions`
  subclass. It executes the subscription, which records the event the
  subscription listens to (the root resolver returns `context.skip` here and
  isn't reported). Then it delivers one event with `Subscriptions#execute`, as
  an `execute_all` implementation does when the event is triggered. That
  re-executes the operation with the event's topic, the root field's resolver
  runs on the event and is the root `call`, and the response is what
  graphql-ruby delivers.
- `deferred-items`: only with `--lazy`. The Dataloader's `load` happens inside
  a resolver, and graphql-ruby only waits for a list item that is a
  registered lazy (`resolve_list_item`, `runtime.rb:840`), so by default
  items come inline.
- `invalid-results` and `uncoercible-results`: in both modes. Out of the box
  graphql-ruby raises out of `Schema#execute` for most of these values
  (below). Then a client gets no response, so the adapter answers
  `no-response`, and the kit counts it against `responds`, or
  `resultCoercion` after an uncoercible value. With `--invalid-results` they
  become field errors. The conformance sheet runs the adapter with
  `--invalid-results`. An exception that is the adapter's own (a message
  from the kit it didn't expect) is answered with `error`, in both modes.
- `parent-values`: the root value is `{token: initialValue}` (passed as
  `root_value`), an object outcome is a `KitObject` carrying its `token`, and
  a subscription's event is delivered with `{token: event}` as its object
  (`Subscriptions#execute` passes it as `root_value`,
  `subscriptions.rb:148`). The resolver reports the token of the `object`
  graphql-ruby gave it.
- `custom-scalar-results`: `from_definition` gives every custom scalar the
  `coerce_input` and `coerce_result` of the `default_resolve` object, if it
  has them (`schema/build_from_definition.rb:585-589`). The adapter's
  `coerce_result` raises `GraphQL::ExecutionError` on one sentinel value,
  which it returns for the `uncoercible` outcome at a custom scalar, and
  passes everything else through (as does its `coerce_input`). graphql-ruby
  turns an `ExecutionError` from `coerce_result` into a field error
  (`execution/interpreter/runtime.rb:708-711`).
- `scalar-results`: the resolver returns the kit's integer as it is.
  `Types::ID.coerce_result` turns `4` into `"4"`; `Types::Int` hands
  `2147483648` to `Schema.type_error` as an `IntegerEncodingError`, which
  raises out of `execute` out of the box (`no-response`) and is a field error
  with `--invalid-results`.
- `subscription-stream` isn't claimed. graphql-ruby's subscriptions have no
  source stream an adapter could drive: the subscribe step records events
  (`GraphQL::Subscriptions::Event`), the application triggers each one with
  `Subscriptions#trigger` or `#execute`, and the transport delivers each
  result. Nothing in graphql-ruby completes, fails or cancels a source
  stream, or completes a response stream with it, so the lifecycle the kit
  drives has no counterpart. `context.unsubscribe` only ends the
  subscription from inside a resolver.
- `error-propagation-off` isn't claimed: graphql-ruby 2.6.15 has no switch
  or directive that disables null propagation.

## Known graphql-ruby deviations in execution

With `--invalid-results`, every well-formed case satisfies the reference, and
the kit's one finding is `intFraction` (MUST): graphql-ruby truncates a
fraction returned for an Int (below). That run's `resultCoercion` pass
depends on the hooks. Out of the box, graphql-ruby raises out of `execute` for
wrong-shaped results, a non-finite Float and an unknown enum value, and the
kit reports those runs as `responds` and `resultCoercion` failures.

### Wrong-shaped results raise out of `execute`

§3.5 and §6.4.3 make a result that can't be coerced, or a runtime type that
isn't a possible type, a field error. By default graphql-ruby raises out of
`Schema#execute` instead, so the client gets no response, and the adapter
answers `no-response`:

- a non-list for a list type: `.each` fails, and graphql-ruby raises
  `ListResultFailedError` (`runtime.rb:808-811`);
- an object for an Int or Float: `Types::Int.coerce_result` calls
  `value.to_i` (`lib/graphql/types/int.rb:25`), `Types::Float` calls
  `value.to_f` (`lib/graphql/types/float.rb:22`), and the `NoMethodError` is
  re-raised (`runtime.rb:714`, `Schema.handle_or_reraise`,
  `lib/graphql/schema.rb:1500`);
- a type that isn't one of the abstract type's possible types: the default
  `Schema.type_error` raises `UnresolvedTypeError`
  (`lib/graphql/schema.rb:1745-1746`);
- a non-finite Float: `Types::Float.coerce_result` passes a
  `FloatEncodingError` to `Schema.type_error`, which raises it
  (`lib/graphql/types/float.rb:22-27`, `lib/graphql/schema.rb:1745-1746`);
- a name that isn't one of an enum's values: `Enum.coerce_result` raises
  `Enum::UnresolvedValueError` (`lib/graphql/schema/enum.rb:255`).

graphql-ruby treats these as programming errors. `--invalid-results` uses the
two hooks its documentation offers, `rescue_from` and `type_error`, to report
them as field errors. Both raise a `GraphQL::ExecutionError` where
graphql-ruby rescues one, so graphql-ruby gives the error the field's path
and location (`runtime.rb:604-609`), as for any execution error. With those,
the kit's `invalid-results` cases pass, and so does `resultCoercion`. (An
earlier version of the hook appended its own error, without a location,
which failed `errorLocationsPresent`; that was the adapter's doing.)

### Lenient result coercion

`Types::Boolean.coerce_result` is `!!value` (`lib/graphql/types/boolean.rb:15`),
so any value but `nil` and `false`, including an object or the string
`"false"`, becomes `true`. `Types::Int.coerce_result` is `value.to_i`, so
`1.5` becomes `1` and `"12abc"` becomes `12`. §3.5.1 and §3.5.4 ask for a field
error where a value can't be coerced without losing information. A schema with
resolvers returning `1.5` for an Int and `"false"` for a Boolean answers
`{"data":{"i":1,"b":true}}`. The kit's `leaves` fixture catches the Int case:
an `uncoercible` outcome returns `1.2` for an Int, and graphql-ruby answers `1`
instead of an error (`intFraction`, a MUST, in both modes, since no hook is
involved). The `booleanResult` fixture returns an object for a Boolean, which
can't become a Boolean without losing information, and graphql-ruby answers
`true` instead of an error (`dataMatches`, `nullsExplained`). The kit doesn't
send strings such as `"false"` for a Boolean, since §3.5.4 lets a service
coerce other values "where reasonable".

## Other areas

[`areas.rb`](areas.rb) answers them on the thread that reads stdin, one
request at a time. Only execution sends `idle`. Every area uses graphql-ruby's
public API as an application would, on a plain `GraphQL::Schema` subclass
whose only setting is its logger: graphql-ruby logs to `$stdout` by default
(`Schema.default_logger`, `schema.rb:1387`), which is the kit's channel, so the
areas log errors to stderr and drop warnings (see [Validate](#validate-1) for
the warnings validation logs).

Capabilities claimed: `parse`, `validate`, `coerce`, `schema`, `introspect`,
`parse-sdl`, `absent-vs-null`, `nested-fields`, `subscription-source`,
`request-extensions`, `schema-extensions` and `custom-directives`
(`from_definition` builds the SDL's `directive @label(...) on ...`
definitions, so validation knows them and introspection lists them), and
`unvalidated` with `--unvalidated`. Not claimed: `custom-scalar-literals`,
`exact-numbers` (below) and `coordinate`.

**coordinate isn't claimed.** graphql-ruby 2.6.15 has no parser or resolver
for §2.14's schema coordinates. `Schema.find("Type.field.argument")`
(`schema/finder.rb`) looks members up by a dotted path of its own, which
isn't §2.14's syntax (`Query.searchBusiness(criteria:)`, `@private(scope:)`),
and the adapter would have to translate one into the other, which would
grade the adapter.

A crash, an exception from graphql-ruby that isn't a parse error, a validation
error or a schema error, is answered with `error` in every area, introspect
included, and the kit records it as a crash for that vector. A crash is never
answered as a response, since graphql-ruby gave none.

### parse

`GraphQL.parse`, which is how `Schema.execute` parses a request and
`from_definition` parses SDL, with the default parser and settings. A
`GraphQL::ParseError` is `ok: false`. The parser reads the whole Document
grammar, so the adapter checks the class of every definition against the
request's grammar (`parse-sdl`): an operation or a fragment without
`grammar`, the type system definition nodes for `"typeSystem"`, those and the
extension nodes for `"typeSystemExtension"`, any of them for `"document"`.
graphql-ruby has no node for a directive extension. No crash probe crashes
the parser.

Ruby's JSON parser (json 2.9.1) refuses an escaped lone high surrogate
("incomplete surrogate pair"), so the kit's messages for the vectors that
hold one can't be read. The adapter answers those parse requests
`{"unsupported": "lone surrogate: ..."}`, so the kit doesn't grade them:
graphql-ruby's parser never sees the source. A lone low surrogate is read,
into a string that isn't valid UTF-8, and reaches the parser. Any other line
the adapter can't read is answered with `error`.

### validate

`Schema.from_definition`, then `Schema.validate`, which runs
`GraphQL::StaticValidation::ALL_RULES` with the schema's settings, as
`Schema.execute` does for a request.

`custom-scalar-literals` isn't claimed. A custom scalar from SDL accepts every
constant literal, `{a: [1, RED, "s"]}` included, but refuses a literal with a
variable inside: "Variables aren't supported inside scalar literals"
(`execution/input_values.rb:310-313`). Every vector that needs the capability
has one, so claiming it would grade that choice, which §3.5.6 leaves to the
service. §5.8.2 is therefore untested.

### coerce

The schema has one resolver on every field, which records the field's path and
the arguments graphql-ruby passed it, converted to JSON by their GraphQL names,
and returns `"ok"` for a leaf, `{}` for an object type and two of them for a
list of objects (`nested-fields`). The request runs through `Schema.execute`,
and the response is `Query::Result#to_json`, read back. A document that
doesn't parse goes to `Schema.execute` like any other, which answers it with
its parse error and no `data` (`Schema.parse_error` adds it to the errors).
The request's `extensions` have no place in `Schema.execute`, so the adapter
reads them and drops them (`request-extensions`).

`subscription-source`: the coerce schema uses an in-memory
`GraphQL::Subscriptions`. A subscription runs as graphql-ruby runs one:
`Schema.execute` runs the subscribe step, in which the root field's resolver
is graphql-ruby's counterpart of the source stream resolver. It records its
call (`field.graphql_name` and its arguments) in `sourceCalls`, then returns
`context.skip`, so graphql-ruby writes the subscription, or for
`"raise"` raises a `GraphQL::ExecutionError`, the error graphql-ruby turns
into a GraphQL error rather than raising out of `execute`. If graphql-ruby wrote the subscription, the adapter triggers
its one event with `Subscriptions#execute`, which reruns the operation as an
update, and the response is the result graphql-ruby delivers. Otherwise the
response is what the subscribe step returned. The variables are read with Ruby's
`JSON.parse`, as Rack and Rails read a request body: integers exactly, other
numbers as `Float`, so `1e400` becomes `Infinity` and `exact-numbers` isn't
claimed. Variables with an escaped lone high surrogate (`{"x": "\ud800"}`)
are refused by that parser, as a Ruby server would refuse the request body
before graphql-ruby ran. The adapter answers them
`{"unsupported": "lone surrogate: ..."}`, so the kit doesn't grade them.

- `absent-vs-null`: graphql-ruby leaves an argument or input field that has
  no value out of the keyword arguments, and out of an input object
  (`InputObject#key?`), so absent and null differ.
- `unvalidated`: only with `--unvalidated`, which passes `validate: false` to
  `Schema.execute`. That does execute without static validation (variables are
  still coerced). graphql-ruby documents the option only for documents
  validated earlier: "execution of an invalid document is undefined"
  (`query.rb:31-32`). So by default the adapter validates, as an application
  does, and the kit grades invalid documents under `invalidNotExecuted` where
  its validate run rejects them, and under `onlyValidExecuted` (SHOULD)
  otherwise.

### schema

graphql-ruby has no step that validates a schema as a whole.
`Schema.from_definition` checks some rules while it builds. Others hold only
when a query first loads the types: duplicate field, argument and enum value
names raise `DuplicateNamesError` then, and an enum with no values
`Enum::MissingValuesError`. An application only uses a schema by executing
queries against it, so the adapter builds the schema, then executes
graphql-ruby's own `GraphQL::Introspection::INTROSPECTION_QUERY`, which loads
every type it can reach.

A rejection is a `GraphQL::Error` (`ParseError`, `InvalidDocumentError`,
`DuplicateNamesError`, `InvalidDefaultValueError`, ...), or a `RuntimeError`
or `ArgumentError` raised by a `raise` statement in graphql-ruby, which is how
its definition methods report mistakes ("Union possible_types can only be
object types", "Required arguments cannot be deprecated"). Anything else is a
crash: another exception class, an error Ruby raises itself, and an
"Invariant:" error.

A query root that is an interface or a union builds. Executing a query then
asks the application's `resolve_type` for the root value. The adapter answers
`valid: true` there, since graphql-ruby accepted the schema.

### introspect

`Schema.from_definition`, then the kit's query through `Schema.execute`, and
`Query::Result#to_json`. A schema graphql-ruby rejects, by the same test as in
schema above, whether `from_definition` or `Schema.execute` raises it, is
answered as a request error. Any other exception is a crash, answered with
`error`.

## Results

`run.sh --invalid-results --strict` (the sheet's command; only execution
reads `--invalid-results`), with the kit as of this writing:

| Area | Result |
| --- | --- |
| execution | With `--random 1500 --seed 1` (the sheet's run): 29540 cases, 5088 distinct. Every well-formed case satisfies the reference; the 318 malformed cases are `intFraction` (284 in `leaves`, 34 in `unions`, lenient result coercion, above). `parentValue`, the custom scalar and scalar results, and error locations all pass. |
| parse | 2594 of the 2841 graded vectors agree; 6 lone-surrogate sources are `unsupported`, not graded. 136 executable documents and 111 type system or mixed documents (`parse-sdl`) fail; 85 of the 247 fail only since September 2025 and 19 only since September 2026. No crash, crash probes included. |
| validate | 2937 of 3334 vectors agree; 58 of the failures are crashes, 56 of them documents with descriptions (September 2025 grammar) that don't parse. 7 rule checks, `acceptsValid` and `descriptionsInert` fail. 282 failing vectors are graphql-ruby's legacy defaults (below), and 25 are hidden types. |
| coerce | Validating: 2161 of the 2200 graded vectors match; 19 lone-surrogate vectors are `unsupported`, not graded. 5 produce no response. `int`, `stringValue`, `descriptionsInert`, `list`, `sourceStreamError`, `responds` and `fieldErrorPath` (MUST), and `idCoerced` and `onlyValidExecuted` (SHOULD) fail. The 16 documents that don't parse and the 6 with type system definitions get graphql-ruby's request error. With `--unvalidated`: 1364 of 2200, 179 with no response. |
| schema | 335 of 490 schemas agree, 18 of the failures crashes. 44 of 62 checks fail (2 of them informational), most because graphql-ruby doesn't check the rule; `schema-extensions` adds 8 failing extension rules. |
| introspect | Graded against September 2025: September 2026's query is rejected, September 2025's answered; 7 September 2026 vectors are skipped. 3 of 64 results satisfy the reference; 3 crash. `typeKinds` (MUST) fails on 58, all since September 2025, for `isOneOf` (below). |

Execution out of the box (`run.sh` without `--invalid-results`, `--random 50
--no-exhaustive`): every distinct well-formed case satisfies the reference,
and 61 of 900 cases are malformed: `no-response` for wrong-shaped results
(`responds`, 34), for a non-finite Float, an unknown enum value or an Int
outside 32 bits (`resultCoercion`, 22), and `intFraction` (5).

## Known deviations in the other areas

Each one below was reproduced with a standalone Ruby script that calls
graphql-ruby's public API directly (`GraphQL.parse`, `Schema.from_definition`,
`Schema.validate`, `Schema.execute`), with no adapter code. The standalone
parse run over the kit's vectors gives exactly the kit's failing vectors.

### Parse

Executable documents (136 vectors):

- **Descriptions on executable definitions (85 vectors, §2.2, since
  September 2025, one of them a document that mixes an operation and a type
  definition):** no description on an operation, fragment or variable,
  which is October 2021's grammar. The empty selection set `{}`, new in
  September 2026, parses.
- **A keyword as a type name (20 vectors, §2.12):** `query ($b: on) {a}`
  fails ("Missing type definition for variable"), and `[on]` too.
  `Parser#type` takes only an `IDENTIFIER` token as a named type
  (`language/parser.rb:504-512`), and the lexer makes `on`, `query`, `true`,
  `fragment` and the other keywords tokens of their own. Names elsewhere go
  through `parse_name`, which accepts them, so `$on` and a field `on` parse.
- **A number followed by a name (17 vectors, §2.10.1, §2.10.2):**
  `{a(x: [0x123])}` parses as the list `[0, x123]`, and `1e`, `1_` and `123L`
  likewise. §2.10.1 forbids a NameStart right after an IntValue or FloatValue.
  The lexer checks only with `GraphQL.reject_numbers_followed_by_names = true`
  (`language/lexer.rb:89-95`), which is `false` by default (`graphql.rb:115`).
  With it on, these 17 vectors pass.
- **Block strings with `\"""` (9 vectors, §2.10.4):**
  `{a(x: """\""")}` parses, with the value `\`, though `\"""` is an escaped
  triple quote and the string is unterminated. `{a(x: """\"""""")}`, a block
  string holding `"""`, fails. `BLOCK_STRING_REGEXP` reads `\` followed by up
  to three quotes as long as no quote follows, and ends the string at the
  first `"""` it can (`language/lexer.rb:315-325`).
- **An escape before a surrogate pair (1 vector, §2.10.4):**
  `"\u0041\uD83D\uDCA9"` fails with "Bad unicode escape". The escape pattern
  pairs every `\uXXXX` with the escape after it (`language/lexer.rb:154`), so
  `\u0041\uD83D` becomes `A` and a lone surrogate, and `\uDCA9` is left
  alone (`:358-372`).
- **A fragment without a name (3 vectors, §2.9):** `fragment on F {a}`
  parses. The parser reads a name only if the next token isn't `on`
  (`language/parser.rb:134-136`).
- **Empty variable definitions (1 vector, §2.11):** `query () {a}` parses:
  the variable definitions loop runs until `)`, so zero definitions pass
  (`language/parser.rb:166-169`).
- **A variable in a variable definition's directive (1 vector, §2.11):**
  `query ($a: Int @d(x: $b)) {a}` parses. Variable definitions use the same
  `parse_directives` as everything else (`language/parser.rb:180`), whose
  arguments aren't `Const`.

Type system and mixed documents (111 vectors, `parse-sdl`):

- **Empty braces and parentheses:** `type T {}`, `interface I {}`,
  `enum E {}`, `input I {}`, `schema {}`, `type T { f(): Int }`,
  `directive @d() on FIELD`, `extend type T {}` and the like parse.
  `parse_field_definitions`, `parse_input_object_field_definitions` and
  `parse_enum_value_definitions` loop `while !at?(:RCURLY)`, so zero items
  pass (`language/parser.rb:384-421`, `:454-471`). The grammar's
  `FieldsDefinition`, `EnumValuesDefinition`, `InputFieldsDefinition` and
  `ArgumentsDefinition` need at least one.
- **Extensions with nothing in them:** `extend schema`, `extend scalar S`,
  `extend type T`, `extend interface I`, `extend union U`, `extend enum E`
  and `extend input I` parse. Each extension production needs directives or
  a body; the parser reads every part as optional (`language/parser.rb:210-286`).
- **An interface without fields:** `interface I` fails ("Expected LCURLY"):
  `InterfaceTypeDefinition` always calls `parse_field_definitions`
  (`language/parser.rb:344-349`), unlike an object type's
  (`at?(:LCURLY) ? ... : EMPTY_ARRAY`, `:341`). `FieldsDefinition` is
  optional there.
- **`implements` lists:** `type T implements I J { f: Int }`,
  `type T implements I, J { f: Int }`, `type T implements I & { f: Int }` and
  `type T implements { f: Int }` parse: `parse_implements` skips an optional `&` before each name and stops
  at the first non-name (`language/parser.rb:439-452`), so `&` is never
  required and the list may be empty.
- **Keywords as names:** `type type { type(type: type): type }`,
  `input extend { extend: extend = extend }`, `interface union` fail, as a
  keyword is a token of its own where the parser expects an `IDENTIFIER`
  (the type reference above, and the names in an `implements` list).
- **Directive locations:** `directive @d on | FIELD` fails (no leading `|`),
  and `directive @d on FOO`, `on field`, `on on | FIELD` and `on x | FIELD`
  parse: locations
  are read with `parse_name`, with no check against §3.13's
  `DirectiveLocation`s (`language/parser.rb:329-334`).
- **A field definition without a type:** `type T { f: }` parses.
- **Variables in constant positions:** `scalar S @d(a: $v)` and
  `type T { f: Int @d(a: $v) }` parse; applied directives in SDL use the same
  `parse_directives` as executable documents.
- **September 2026 syntax (19 vectors):** directives on a directive
  definition (`directive @d @x on FIELD`, 5 vectors; the parser goes from the
  arguments to `repeatable` and `on`, `:318-335`) and directive extensions
  (`extend directive @d @x`, 14 vectors; `extend` takes only the seven type
  system keywords, `:287`).

### Validate

- **Legacy defaults (282 vectors).** graphql-ruby lets three kinds of invalid
  documents through by default, logging a warning that "this will return an
  error in future GraphQL-Ruby versions". Each has a schema setting, and with
  all of them `false` these 282 vectors pass:
  - fields that can't be merged, under `allow_legacy_invalid_field_conflicts`
    and `allow_legacy_invalid_return_type_conflicts`
    (`static_validation/rules/fields_will_merge.rb:68-71`, `:141-162`,
    `:522-546`): §5.3.2, 241 vectors, such as
    `{ node(id: "1") { ... on User { a: id } ... on Post { a: name } } }`
    (`ID!` against `String!`);
  - variables used where their type isn't allowed, under
    `allow_legacy_invalid_variable_usages`
    (`static_validation/rules/variable_usages_are_allowed.rb:20`): §5.8.5, 38
    vectors (3 since September 2025), such as
    `query Q($v: ID) { matrix(rows: [[$v]]) }`, an `ID` where an `Int` goes;
  - a union field without a selection set, under
    `allow_legacy_invalid_empty_selections_on_union`
    (`static_validation/rules/fields_have_appropriate_selections.rb:68-89`):
    §5.3.3, 3 vectors, such as `{ catOrDog }`.
- **Unreferenced types are hidden (25 valid documents rejected,
  `acceptsValid`).** With the default visibility (`Schema::Warden`), an
  interface with no implementations is hidden, and so is every field that
  returns it; so is a union or an input type that nothing references
  (`schema/warden.rb:492-520`). The differential schema's `resource: Resource`
  is such a field, so `{ resource { id } }` fails with "Field 'resource' doesn't
  exist on type 'Query'" (24 vectors). The examples schema's `DogOrHuman`
  union is unreferenced, so §5.5.2.3's own example `...dogOrHumanFragment`
  fails with "No such type DogOrHuman" (1 vector). The spec defines a schema's
  types as all the types it defines. With graphql-ruby's newer
  `GraphQL::Schema::Visibility` (`schema.use(GraphQL::Schema::Visibility)`),
  the 24 `resource` documents are accepted; `DogOrHuman` is still hidden. The
  same hiding makes 15 invalid documents that use `resource` fail with "Field
  'resource' doesn't exist" rather than for the rule they break, so they pass
  for the wrong reason.
- **§5.2.4.1 with `@skip` or `@include` at a subscription's root (27
  vectors, 6 of them since September 2025):** accepted, such as
  `subscription { postAdded @skip(if: false) { id } }`. September 2025
  forbids both directives in the root selection set. October 2021 collects
  the root fields with no variable values and requires exactly one, so the
  vectors that put `@skip(if: true)` on the only root field break October
  2021's rule too: nothing is collected.
- **Empty selection sets (3 vectors, since September 2026):** they parse, but
  §5.3.3's leaf rule accepts `barkVolume {}` (2 vectors), and
  `human {}`, which September 2026 allows on an object, is rejected with
  "Field must have selections" (`acceptsValid`).
- **§5.7.3 not checked on variable definitions (1 vector):**
  `query Q($v: Int @once @once)` is accepted. `UniqueDirectivesPerLocation`
  hooks every node with directives except variable definitions
  (`static_validation/rules/unique_directives_per_location.rb:8-23`).
- **§5.6.3 not checked in a variable's default (1 vector):**
  `query Q($f: Filter = {limit: 1, limit: 2})` is accepted. A
  `VariableDefinition`'s default value isn't one of its children
  (`language/nodes.rb:954`, `:965`), so `InputObjectNamesAreUnique` never visits
  it.
- **Crashes on syntax (58 vectors):** a document `GraphQL.parse` can't read is
  a crash in this area, as the kit asks. 56 are the `-described` twins, with
  a description on each operation, fragment and variable definition
  (September 2025 grammar, `descriptionsInert`), and 2 have a directive on a
  directive definition (September 2026, `executableDefinitions`).
- **A crash, outside the graded vectors:** a variable two levels deep in a
  custom scalar's literal, `query Q($v: Int) { json(value: {a: {b: $v}}) }`,
  raises `NoMethodError: undefined method 'type' for nil` from
  `Schema.validate`
  (`static_validation/rules/variable_usages_are_allowed.rb:83`). The vectors
  that reach it need `custom-scalar-literals`, so the kit skips them.

### Coerce

Validating, as graphql-ruby runs a request:

- **A JSON number written with a fraction or an exponent isn't an Int or an
  ID (14 vectors: `int` 12, 8 of them through a list item or an input
  field, and `idCoerced` 2, a SHOULD):** `query($x: Int) { int(v: $x) }` with
  `{"x": 1.0}` is a request error, "Could not coerce value 1.0 to Int", and
  an ID given `1e21` is too. Ruby's JSON parser reads `1.0` and `1e21` as a
  `Float`, and `Types::Int.coerce_input` accepts only an `Integer`
  (`types/int.rb:13-14`), `Types::ID` only a `String` or an `Integer`
  (`types/id.rb:15-23`). The kit counts JSON `1.0` as an integer (§3.5).
- **Descriptions on operations and variable definitions (8 vectors,
  `descriptionsInert`, since September 2025):** the document doesn't parse
  (see Parse), so the request is a request error where its twin without
  descriptions runs.
- **Block strings with `\"""` (3 vectors, `stringValue`):**
  `{ string(v: """a \"""b""") }` gives the resolver `a \"""b` instead of
  `a """b` (see Parse).
- **A non-finite number for an input object gives no response (5 vectors,
  `responds`):** `query($x: Point) { point(v: $x) }` with `{"x": 1e400}`
  (`Infinity` once parsed) raises `JSON::GeneratorError: Infinity not allowed
  in JSON` out of `Schema.execute`. The error message for a value that isn't
  an object is built with `JSON.generate(value)`
  (`execution/variable_values.rb:140-143`). The same value for a `Float` is a
  proper request error.
- **An error establishing a subscription is a field error (4 vectors,
  `sourceStreamError`, since September 2026):** a `GraphQL::ExecutionError`
  raised in the subscribe step gives
  `{"data": {"event": null}, "errors": [...]}`. September 2026 makes a
  failure to establish the source stream a request error (§7.1.6, §6.2.3.1).
  graphql-ruby runs the subscribe step as an ordinary execution of the
  operation; the error doesn't write the subscription
  (`subscriptions/default_subscription_resolve_extension.rb:45-47`), but
  the response is that execution's result. For a subscription argument that
  can't be coerced, graphql-ruby gives an execution error, which fails
  `sourceStreamArguments` (MUST, new in September 2026, §7.1.5).
- **A null variable as a Non-Null list item (1 vector, `list`):**
  `query($x: Int = 1) { intsNN(v: [1, $x]) }` with `{"x": null}` gives the
  resolver `[1, nil]` for `[Int!]!`. A variable inside a list literal is
  replaced by its value with no check against the item type
  (`execution/input_values.rb:183-194`).
- **One argument error for every list item, at the first item's path (1
  vector, `fieldErrorPath`):**
  `query($x: Int = 1) { items { strict(v: $x) } }` with `{"x": null}` gives
  two errors, both at `["items", 0, "strict"]`; the second should be at
  `["items", 1, "strict"]`. Arguments that don't depend on the parent object
  are coerced once per field node and cached
  (`execution/interpreter/arguments_cache.rb:11-35`), so both positions get
  the same `ExecutionError` object, and the runtime sets its path only if it
  has none (`value.path ||= current_path`,
  `execution/interpreter/runtime.rb:608`).
- **`onlyValidExecuted` (3 vectors, SHOULD):** documents such as
  `query($x: Int) { matrix(v: [$x, [$x]]) }` execute, since the legacy
  variable usage default above lets them through validation.

With `--unvalidated`, graphql-ruby does what its documentation warns of. A
literal that doesn't coerce reaches the resolver as `nil` (`{ int(v: "") }`
gives `v: nil`), a missing required argument is left out, an input object
literal without its required fields is passed on, and an input object
argument given a scalar literal, such as `{ point(v: 0) }`, raises
`NoMethodError: undefined method 'key?' for an instance of Integer`
(`schema/argument.rb:496`): 179 vectors get no response.

The 19 vectors whose variables hold a lone surrogate (`{"x": "\ud800"}`) are
answered `unsupported` (above): the refusal is Ruby's JSON parser's, so
graphql-ruby isn't graded on them.

### Schema

- **Rules graphql-ruby doesn't check:** `typeNamesUnique`
  (`scalar A scalar A`), `typeNameNotBuiltin` (`type Int { … }`),
  `directiveNamesUnique`, the reserved `__` prefix on type, field, argument,
  input field, enum value and directive names, `rootTypesAreObjects` (an
  interface or input object as a root) and `rootTypesDifferent`,
  `fieldOutputType` (an input object as a field's type), `implementsUnique`
  (`implements I & I`), every IsValidImplementation rule except
  `implTransitive` (`implFieldProvided`, `implArgProvided`,
  `implArgInvariant`, `implExtraArgOptional`, `implFieldCovariant`,
  `implDeprecation`), `unionMembersDefined` and `unionMembersUnique`,
  `inputObjectUnbreakableCycle` (including §3.10's
  `input Example { self: Example! }`) and `inputObjectDefaultValueCycle`,
  `directiveUsesItself` and `directiveReferencesItselfIndirectly` (below),
  `directiveLocationsValid` for most locations
  (`type Query @deprecated { a: Int }` is accepted), `specifiedByNotBuiltin`
  (`extend scalar Int @specifiedBy(url: "...")`), and the informational
  `appliedDirectiveArguments` (`@deprecated(why: "x")`) and
  `directiveNotRepeated` (`@deprecated @deprecated`). `fieldsDefined` and
  `inputFieldsDefined` only warn on stderr that an empty type "will raise an
  error in a future GraphQL-Ruby version" (`schema/member/has_fields.rb:338`,
  `schema/input_object.rb:311`).
- **Extensions (`schema-extensions`):** `from_definition` applies each
  extension to `types[ext.name]` without checking that the type exists or
  has the extension's kind (`schema/build_from_definition.rb:198-225`). An
  extension of a type that isn't there, or of a type of another kind, raises
  `NoMethodError` or `NameError` (`undefined method 'field' for nil`): 10
  crashes, under `extensionTargetDefined` (6) and `extensionTargetKind` (4).
  Where the target has the methods the extension calls, the extension is
  applied: `type Query { a: Int } extend interface Query { b: Int }` builds
  (`extensionTargetKind`, 2). Nor does it check `extensionItemsUnique`, `extensionItemsNew`,
  `extensionInterfacesNew`, `extensionDirectivesNotReapplied`
  (`type Query @d { a: Int } extend type Query @d`, 10 schemas) or
  `extensionOneOf` (`extend input In @oneOf`).
- **Some rules checked only where a type is visible:** `fieldNamesUnique`
  and `argNamesUnique` catch duplicates on an object, but not on an
  interface with no implementations, which is hidden (above) and never
  loaded: `type Query { a: I } interface I { x: Int x: String }` and
  `interface I { f(x: Int, x: Int): Int }` build.
- **Default values (`argDefaultCompatible`, 5 schemas since September 2025,
  and 2 crashes):** `f(x: Int = "1")`, `f(x: Int = 1.5)`,
  `f(c: Color = "RED")` and `f(p: Point = {x: 1, z: 1})` are accepted.
  `Argument#validate_default_value` passes the default through result
  coercion before checking it (`schema/argument.rb:624-632`), and result
  coercion turns `"1"` and `1.5` into `1`. `f(x: Int = {a: 1})` raises
  `NoMethodError: undefined method 'to_i' for an instance of Hash`, and the
  valid `f(x: [[Int]] = 1)` raises `undefined method 'map' for an instance
  of Integer` (introspect, below).
- **Over-strict (3 valid schemas, since September 2025):** a deprecated
  required argument or input field is rejected even with a default:
  `f(oldArg: String! = "s" @deprecated)` gives "Required arguments cannot be
  deprecated" (`schema/argument.rb:680-683`). §3.13.3 forbids it only
  without a default.
- **Directive arguments are taken as input fields (3 valid schemas
  rejected, and invalid ones rejected for this reason):**
  `directive @d on ARGUMENT_DEFINITION directive @e(x: Int @d) on FIELD`
  fails: "Directive `@d` can't be attached to x because
  INPUT_FIELD_DEFINITION isn't included in its locations". A directive on an
  argument whose owner isn't a field is checked against
  `INPUT_FIELD_DEFINITION` (`schema/directive.rb:291-296`). Declared `on
  ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION`, `directive @d(a: String @d)`
  and the `@d`/`@e` cycle build and introspect without error: graphql-ruby
  doesn't check §3.13's self-reference rules.
- **Directive location syntax:** `directive @d on | FIELD_DEFINITION | OBJECT`
  doesn't parse (see Parse), and `directive @d on DIRECTIVE_DEFINITION` is
  rejected as "an invalid directive location": graphql-ruby doesn't know
  September 2026's location. Directive extensions (7 valid schemas) and
  directives on a directive definition (4) don't parse.
- **Crashes on applied directives (4 schemas):**
  `type Query @undefinedInThisSchema { a: Int }` raises `NoMethodError:
  undefined method 'repeatable?' for an instance of
  GraphQL::Schema::LateBoundType` (`directivesDefined`, 3), and
  `directive @d on OBJECT schema @d { query: Query }` raises `NoMethodError:
  undefined method 'graphql_name'` (`directiveLocationsValid`, 1).
- **Crash (2 schemas, `implementsItself`):** `interface A implements A`
  raises `ArgumentError: cyclic include detected`. graphql-ruby doesn't check
  §3.7's rule; it represents an interface as a Ruby module and `include`s
  each interface it implements (`schema/member/has_interfaces.rb:26`), and
  Ruby's `Module#include` refuses the cycle. The adapter counts as a
  rejection only what graphql-ruby reports as a schema error: its own error
  classes, or a `raise` in its own code. An exception Ruby raises from a core
  method that graphql-ruby called, as here, is a crash.

### Introspect

- **Profile:** graphql-ruby has September 2025's introspection:
  `__Type.isOneOf`, `__InputValue.isDeprecated` and `deprecationReason`,
  `includeDeprecated` on `__Field.args`, `__Directive.args` and
  `__Type.inputFields`, and `@oneOf`. It lacks September 2026's
  `__Directive.isDeprecated` and `includeDeprecated` on
  `__Schema.directives` (`introspection/schema_type.rb:16`), so September
  2026's query is rejected and the run is graded against September 2025,
  skipping 7 September 2026 vectors. `__Directive`'s deprecated
  `onOperation`, `onFragment` and `onField`
  (`introspection/directive_type.rb:19-21`) count as additions
  (`builtinAdditions`, informational).
- **`isOneOf` is `false` for every type that isn't a OneOf input object
  (`typeKinds`, MUST, 58 results, since September 2025):**
  `field :is_one_of, Boolean, null: false` is `object.kind.input_object? &&
  ...` (`introspection/type_type.rb:33-37`), so a scalar, an object, a list
  or a Non-Null type answers `false`. September 2025's `__Type` has
  `isOneOf` only for input objects, and null for every other kind.
- **Built-in nullability (`builtinNullability`, SHOULD, 36 results):** the
  built-ins have September 2025's types but not all of its Non-Null
  wrappings. `__Directive.isRepeatable` is `Boolean`, not `Boolean!`
  (`introspection/directive_type.rb:23`); `includeDeprecated` on
  `__Type.fields`, `enumValues` and `inputFields`, `__Field.args` and
  `__Directive.args` is `Boolean`, not `Boolean!`; `@deprecated(reason:)` is
  October 2021's `String`, not `String!`; and `__Type.isOneOf` is `Boolean!`,
  where September 2025 has a nullable `Boolean`.
- **Order (`order`, SHOULD, 24 results, since September 2025):** fields,
  interfaces and possible types are sorted by name
  (`introspection/type_type.rb:84`, `:110`, `:128`), not in source order.
- **Descriptions (`descriptions`, SHOULD, 5 results):** the schema's
  description is dropped: `from_definition` takes the schema definition's
  directives but not its description
  (`schema/build_from_definition.rb:277-279`). A block string description
  keeps `\"""` escaped (see Parse), and keeps the `\r` of a CRLF line ending
  (`language/block_string.rb:16` splits on `\n` only).
- **Printed defaults (`defaultValuePrinting`, SHOULD, 3 results, since
  September 2025):** a string default with U+007F to U+009F is printed with
  the raw character. `GraphQL::Language.serialize` writes strings with
  `JSON.generate` (`language.rb:34`), which escapes only U+0000 to U+001F.
- **A crash on a nested list default (3 results, `executes`):**
  `type Query { f(w: [[Int]] = [1, 2]): Int }` makes `from_definition` raise
  `NoMethodError: undefined method 'map' for an instance of Integer`.
  `validate_default_value` wraps a single default in a list only at the outer
  level (`schema/argument.rb:624-630`), and `List#coerce_result` then calls
  `map` on each item (`schema/list.rb:51`). September 2026 coerces the default
  to `[[1], [2]]`.
- **An unreferenced type is hidden (3 results, `unreferencedTypes`, SHOULD):**
  a `type Orphan` nothing references is left out of `types`, and
  `__type(name: "Orphan")` is null (`schema/warden.rb:509-517`).
  `GraphQL::Schema::Visibility` hides it too.
