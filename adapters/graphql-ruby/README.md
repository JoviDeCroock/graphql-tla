# graphql-ruby adapter

A [graphql-tla conformance adapter](../../docs/conformance.md) for
[graphql-ruby](https://github.com/rmosolgo/graphql-ruby) 2.6.15. It answers
every area: `execution`, and the [areas beyond it](../../docs/kit-areas.md),
`parse`, `validate`, `coerce`, `schema` and `introspect`.

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
node kit/cli.mjs run coerce --adapter "adapters/graphql-ruby/run.sh --unvalidated" --strict
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
- `error-propagation-off` isn't claimed: graphql-ruby 2.6.15 has no switch
  or directive that disables null propagation.

## Known graphql-ruby deviations in execution

With `--invalid-results`, every well-formed case satisfies the reference, and
the kit's one finding is a SHOULD: graphql-ruby truncates a fraction returned
for an Int (`intFraction`, below). That run's `resultCoercion` pass depends
on the hooks. Out of the box, graphql-ruby raises out of `execute` for
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
them as field errors at the field's path. With those, the kit's
`invalid-results` cases pass, and so does `resultCoercion`.

### Lenient result coercion

`Types::Boolean.coerce_result` is `!!value` (`lib/graphql/types/boolean.rb:15`),
so any value but `nil` and `false`, including an object or the string
`"false"`, becomes `true`. `Types::Int.coerce_result` is `value.to_i`, so
`1.5` becomes `1` and `"12abc"` becomes `12`. §3.5.1 and §3.5.4 ask for a field
error where a value can't be coerced without losing information. A schema with
resolvers returning `1.5` for an Int and `"false"` for a Boolean answers
`{"data":{"i":1,"b":true}}`. The kit's `leaves` fixture catches the Int case:
an `uncoercible` outcome returns `1.2` for an Int, and graphql-ruby answers `1`
instead of an error (`intFraction`, a SHOULD, in both modes, since no hook is
involved). It doesn't probe Boolean, since §3.5.4 leaves reasonable coercions
to the service.

## Other areas

[`areas.rb`](areas.rb) answers them on the thread that reads stdin, one
request at a time. Only execution sends `idle`. Every area uses graphql-ruby's
public API as an application would, on a plain `GraphQL::Schema` subclass
whose only setting is its logger: graphql-ruby logs to `$stdout` by default
(`Schema.default_logger`, `schema.rb:1387`), which is the kit's channel, so the
areas log errors to stderr and drop warnings (see [Validate](#validate-1) for
the warnings validation logs).

Capabilities claimed: `parse`, `validate`, `coerce`, `schema`, `introspect`,
`absent-vs-null` and `custom-directives` (`from_definition` builds the SDL's
`directive @label(...) on ...` definitions, so validation knows them and
introspection lists them), and `unvalidated` with `--unvalidated`. Not
claimed: `custom-scalar-literals` and `exact-numbers` (below).

A crash, an exception from graphql-ruby that isn't a parse error, a validation
error or a schema error, is answered with `error` in every area, introspect
included, and the kit records it as a crash for that vector. A crash is never
answered as a response, since graphql-ruby gave none.

### parse

`GraphQL.parse`, which is how `Schema.execute` parses a request, with the
default parser and settings. A `GraphQL::ParseError` is `ok: false`. The parser
also reads the type system language, so every definition must be an operation
or a fragment.

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
and returns `"ok"`. The request runs through `Schema.execute`, and the response
is `Query::Result#to_json`, read back. The variables are read with Ruby's
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
  does, and the kit grades invalid documents under `invalidNotExecuted`.

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

`run.sh --invalid-results --strict`, with the kit as of this writing:

| Area | Result |
| --- | --- |
| execution | With `--random 1500 --seed 1` (the sheet's run): 11864 cases, 1929 distinct. Every well-formed case satisfies the reference; the 385 malformed cases are `intFraction` (343 in `leaves`, 42 in `unions`, lenient result coercion, above). |
| parse | 1852 of the 1977 graded vectors agree; 6 lone-surrogate sources are `unsupported`, not graded. 10 of 31 checks fail. 73 of the 125 failing vectors are draft only. |
| validate | 2748 of 3079 vectors agree. 6 rule checks and `acceptsValid` fail. 282 of the 331 failing vectors are graphql-ruby's legacy defaults (below), and 25 are hidden types. |
| coerce | Validating: 1968 of the 1991 results run match (26 need `unvalidated`); 19 lone-surrogate vectors are `unsupported`, not graded. 5 failures are crashes. `int`, `inputObject`, `list` and `invalidNotExecuted` (MUST) and `idCoerced` (SHOULD) fail. With `--unvalidated` (before the lone-surrogate change): 1242 of 2036, 173 crashes. |
| schema | 115 of 165 schemas agree, 1 of the failures a crash. 31 of 44 rules fail, 5 of them on draft-only vectors only, most because graphql-ruby doesn't check them. |
| introspect | Graded against October 2021, since the draft's query is rejected. The 3 nested list defaults (below) crash and are answered with `error`, which the kit records as crashes. With a kit that still stops the run on an introspect `error`, the run stops at the first of them. Before the adapter answered crashes with `error`: 8 of 28 results matched, and `executes` (the crash), `types`, `typeByName`, `descriptions` and `builtinDefinitions` failed. |

Execution out of the box (`run.sh` without `--invalid-results`, `--random 50
--no-exhaustive`): every distinct well-formed case satisfies the reference,
and 59 of 350 cases are malformed: `no-response` for wrong-shaped results
(`responds`), for a non-finite Float or an unknown enum value
(`resultCoercion`), and `intFraction`.

## Known deviations in the other areas

Each one below was reproduced with a standalone Ruby script that calls
graphql-ruby's public API directly (`GraphQL.parse`, `Schema.from_definition`,
`Schema.validate`, `Schema.execute`), with no adapter code. The standalone
parse and validate runs over the kit's vectors give exactly the kit's failing
vectors.

### Parse

- **Draft grammar (73 vectors, all draft only, §2.2):** no description on an
  operation, fragment or variable. That is October 2021's grammar. The empty
  selection set `{}`, also new in the draft, parses.
- **A keyword as a type name (20 vectors, §2.12, §2.11, §2.10, §2.10.7):**
  `query ($b: on) {a}` fails ("Missing type definition for variable"), and
  `[on]` too. `Parser#type` takes only an `IDENTIFIER` token as a named type
  (`language/parser.rb:504-512`), and the lexer makes `on`, `query`, `true`,
  `fragment` and the other keywords tokens of their own. Names elsewhere go
  through `parse_name`, which accepts them, so `$on` and a field `on` parse.
- **A number followed by a name (17 vectors, §2.10.1, §2.10.2):**
  `{a(x: [0x123])}` parses as the list `[0, x123]`, and `1e`, `1_` and `123L`
  likewise. §2.10.1 forbids a NameStart right after an IntValue or FloatValue.
  The lexer checks only with `GraphQL.reject_numbers_followed_by_names = true`
  (`language/lexer.rb:89-95`), which is `false` by default (`graphql.rb:115`).
  With it on, these 17 vectors pass.
- **Block strings with `\"""` (9 vectors, §2.10.4, §2.1.5):**
  `{a(x: """\""")}` parses, with the value `\`, though `\"""` is an escaped
  triple quote and the string is unterminated. `{a(x: """\"""""")}`, a block
  string holding `"""`, fails. `BLOCK_STRING_REGEXP` reads `\` followed by up
  to three quotes as long as no quote follows, and ends the string at the
  first `"""` it can (`language/lexer.rb:315-325`).
- **An escape before a surrogate pair (1 vector, §2.10.4):**
  `"A💩"` fails with "Bad unicode escape". The escape pattern
  pairs every `\uXXXX` with the escape after it (`language/lexer.rb:154`), so
  `A\uD83D` becomes `A` and a lone surrogate, and `\uDCA9` is left alone
  (`:358-372`). `"💩"` and `"AB💩"` parse.
- **A fragment without a name (3 vectors, §2.9):** `fragment on F {a}`
  parses. The parser reads a name only if the next token isn't `on`
  (`language/parser.rb:134-136`).
- **`query () {a}` (§2.11):** the variable definitions loop runs until `)`,
  so zero definitions pass (`language/parser.rb:166-169`).
- **A variable in a variable definition's directive (§2.11):**
  `query ($a: Int @d(x: $b)) {a}` parses. Variable definitions use the same
  `parse_directives` as everything else (`language/parser.rb:180`), whose
  arguments aren't `Const`.

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
    vectors (3 draft only), such as `query Q($v: ID) { matrix(rows: [[$v]]) }`,
    an `ID` where an `Int` goes;
  - a union field without a selection set, under
    `allow_legacy_invalid_empty_selections_on_union`
    (`static_validation/rules/fields_have_appropriate_selections.rb:68-89`):
    §5.3.3, 3 vectors, such as `{ search }`.
- **Unreferenced types are hidden (25 valid documents rejected,
  `acceptsValid`).** With the default visibility (`Schema::Warden`), an
  interface with no implementations is hidden, and so is every field that
  returns it; so is a union or an input type that nothing references
  (`schema/warden.rb:492-520`). The differential schema's `resource: Resource`
  is such a field, so `{ resource { id } }` fails with "Field 'resource' doesn't
  exist on type 'Query'" (24 vectors). The examples schema's `DogOrHuman`
  union is unreferenced, so §5.5.2.3's own example `...dogOrHumanFragment`
  fails with "No such type DogOrHuman" (1 vector). The spec defines a schema's
  types as all the types it defines. The kit files the 25 under 11 findings,
  by the rule each vector's invalid sibling breaks, but they have this one
  cause. With graphql-ruby's newer `GraphQL::Schema::Visibility`
  (`schema.use(GraphQL::Schema::Visibility)`), the 24 `resource` documents are
  accepted; `DogOrHuman` is still hidden. The same hiding makes 15 invalid
  documents that use `resource` fail with "Field 'resource' doesn't exist"
  rather than for the rule they break, so they pass for the wrong reason.
- **§5.2.4.1 with `@skip` or `@include` at a subscription's root (22 vectors,
  tagged draft only):** accepted. The draft forbids both directives in the
  root selection set. October 2021 collects the root fields with no variable
  values and requires exactly one, so 11 of the 22, which put `@skip(if:
  true)` on the only root field (`subscription S5 { postAdded @skip(if: true)
  { id } }`), break October 2021's rule too: nothing is collected.
- **§5.7.3 not checked on variable definitions (1 vector):**
  `query Q($v: Int @once @once)` is accepted. `UniqueDirectivesPerLocation`
  hooks every node with directives except variable definitions
  (`static_validation/rules/unique_directives_per_location.rb:8-23`).
- **§5.6.3 not checked in a variable's default (1 vector):**
  `query Q($f: Filter = {limit: 1, limit: 2})` is accepted. A
  `VariableDefinition`'s default value isn't one of its children
  (`language/nodes.rb:954`, `:965`), so `InputObjectNamesAreUnique` never visits
  it.
- **A crash, outside the graded vectors:** a variable two levels deep in a
  custom scalar's literal, `query Q($v: Int) { json(value: {a: {b: $v}}) }`,
  raises `NoMethodError: undefined method 'type' for nil` from
  `Schema.validate`
  (`static_validation/rules/variable_usages_are_allowed.rb:83`). The vectors
  that reach it need `custom-scalar-literals`, so the kit skips them.

### Coerce

Validating, as graphql-ruby runs a request:

- **A JSON number written with a fraction or an exponent isn't an Int or an
  ID (14 vectors: `int`, `list`, `inputObject`, and `idCoerced`, a SHOULD):**
  `query($x: Int) { int(v: $x) }` with `{"x": 1.0}` is a request error, "Could
  not coerce value 1.0 to Int", and an ID given `1e21` is too. The `list` and
  `inputObject` ones are this Int coercion inside a list or an input object.
  Ruby's JSON parser reads `1.0` and `1e21` as a `Float`, and
  `Types::Int.coerce_input` accepts only an `Integer` (`types/int.rb:13-14`),
  `Types::ID` only a `String` or an `Integer` (`types/id.rb:15-23`). The kit
  counts JSON `1.0` as an integer (§3.5).
- **A non-finite number for an input object crashes (5 vectors, `inputObject`
  and `list`):** `query($x: Point) { point(v: $x) }` with `{"x": 1e400}`
  (`Infinity` once parsed) raises `JSON::GeneratorError: Infinity not allowed
  in JSON` out of `Schema.execute`. The error message for a value that isn't
  an object is built with `JSON.generate(value)`
  (`execution/variable_values.rb:140-143`). The same value for a `Float` is a
  proper request error.
- **A null variable as a Non-Null list item (1 vector, `list`):**
  `query($x: Int = 1) { intsNN(v: [1, $x]) }` with `{"x": null}` gives the
  resolver `[1, nil]` for `[Int!]!`. A variable inside a list literal is
  replaced by its value with no check against the item type
  (`execution/input_values.rb:183-194`).
- **`invalidNotExecuted` (3 vectors):** documents such as
  `query($x: Int) { matrix(v: [$x, [$x]]) }` execute, since the legacy
  variable usage default above lets them through validation.

With `--unvalidated`, graphql-ruby does what its documentation warns of. A
literal that doesn't coerce reaches the resolver as `nil` (`{ int(v: "") }`
gives `v: nil`, 152 vectors under `int` alone), a missing required argument is
left out, an input object literal without its required fields is passed on,
and an input object argument given a scalar literal, such as
`{ point(v: 0) }`, raises `NoMethodError: undefined method 'key?' for an
instance of Integer` (`schema/argument.rb:496`): 168 crashes.

The 19 vectors whose variables hold a lone surrogate (`{"x": "\ud800"}`) are
answered `unsupported` (above): the refusal is Ruby's JSON parser's, so
graphql-ruby isn't graded on them. Before, the adapter answered them with a
request error of its own, which passed 17 of them under MUST checks and the 2
others under the informational `loneSurrogates`.

### Schema

- **Rules graphql-ruby doesn't check (26 rules, and 2 it only warns about):** `typeNamesUnique`
  (`scalar A scalar A`), `typeNameNotBuiltin` (`type Int { … }`),
  `directiveNamesUnique`, the reserved `__` prefix on type, field, argument,
  input field, enum value and directive names, `rootTypesAreObjects` (an
  interface or input object as a root, 3 schemas) and `rootTypesDifferent`
  (2), `fieldOutputType` (an input object as a field's type, 2),
  `implementsUnique` (`implements I & I`), every IsValidImplementation rule
  except `implTransitive` (`implFieldProvided`, `implArgProvided`,
  `implArgInvariant`, `implExtraArgOptional`, `implFieldCovariant`,
  `implDeprecation`), `unionMembersDefined` and `unionMembersUnique`, and
  `inputObjectUnbreakableCycle` (5, 2 of them draft only, including §3.10's
  `input Example { self: Example! }`) and `inputObjectDefaultValueCycle` (4,
  draft only), `directiveUsesItself` and `directiveReferencesItselfIndirectly`
  (below), and `implementsItself` (below). `fieldsDefined` and
  `inputFieldsDefined` only warn on stderr that an empty type "will raise an
  error in a future GraphQL-Ruby version" (`schema/member/has_fields.rb:338`,
  `schema/input_object.rb:311`). `fieldsDefined.2.invalid`, an `interface I`
  without fields, is rejected only because graphql-ruby's parser requires
  braces on an interface definition ("Expected LCURLY, not end of file",
  `language/parser.rb:344-349`), which both editions' grammar doesn't.
- **Some rules checked only where a type is visible:** `fieldNamesUnique`
  catches duplicate fields on an object, but not on an interface with no
  implementations, which is hidden (above) and never loaded.
- **Default values (4 schemas, draft only, `argDefaultCompatible`):**
  `f(x: Int = "1")`, `f(x: Int = 1.5)`, `f(c: Color = "RED")` and
  `f(p: Point = {x: 1, z: 1})` are accepted. `Argument#validate_default_value`
  passes the default through result coercion before checking it
  (`schema/argument.rb:624-632`), and result coercion turns `"1"` and `1.5`
  into `1`. The other six invalid defaults are rejected.
- **Over-strict (2 valid schemas, draft only):** a deprecated required argument
  or input field is rejected even with a default:
  `f(oldArg: String! = "s" @deprecated)` gives "Required arguments cannot be
  deprecated" (`schema/argument.rb:680-683`). The draft forbids it only
  without a default.
- **Directive arguments are taken as input fields (1 valid schema, and 2
  invalid ones rejected for this reason):**
  `directive @d(a: Int @e) on ARGUMENT_DEFINITION directive @e(b: Int) on ARGUMENT_DEFINITION`
  fails: "Directive `@e` can't be attached to a because
  INPUT_FIELD_DEFINITION isn't included in its locations". A directive on an
  argument whose owner isn't a field is checked against
  `INPUT_FIELD_DEFINITION` (`schema/directive.rb:291-296`). §3.13's
  `@invalidExample` and `directiveReferencesItselfIndirectly.2.invalid` are
  rejected with the same message, so `directiveUsesItself` passes for the
  wrong reason. Declared `on ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION`,
  `directive @d(a: String @d)` and the `@d`/`@e` cycle build and introspect
  without error: graphql-ruby doesn't check §3.13's self-reference rules.
- **Crash (1 schema, `implementsItself`):** `interface A implements A` raises
  `ArgumentError: cyclic include detected`. graphql-ruby doesn't check §3.7's
  rule; it represents an interface as a Ruby module and `include`s each
  interface it implements (`schema/member/has_interfaces.rb:26`), and Ruby's
  `Module#include` refuses the cycle. The adapter counts as a rejection only
  what graphql-ruby reports as a schema error: its own error classes, or a
  `raise` in its own code. An exception Ruby raises from a core method that
  graphql-ruby called, as here, is a crash.

### Introspect

- **Between the two editions:** graphql-ruby has some of the draft's
  introspection: `__Type.isOneOf`, `__InputValue.isDeprecated` and
  `deprecationReason`, `includeDeprecated` on `__Field.args`,
  `__Directive.args` and `__Type.inputFields`, and `@oneOf`. It lacks
  `__Directive.isDeprecated` and `includeDeprecated` on `__Schema.directives`
  (`introspection/schema_type.rb:16`), so the draft's query is rejected
  ("Field 'directives' doesn't accept argument 'includeDeprecated'") and the
  run is graded against October 2021, skipping 10 draft-only vectors. There
  the draft's additions count as additions (`builtinAdditions`,
  informational), and so do `__Directive`'s deprecated `onOperation`,
  `onFragment` and `onField` (`introspection/directive_type.rb:19-21`).
- **Built-in definitions (`builtinDefinitions`, every `__schema` result,
  16):** `__Directive.isRepeatable` is `Boolean`, not `Boolean!`
  (`introspection/directive_type.rb:23`); every value it returns is still
  `true` or `false`. `@deprecated` is on `FIELD_DEFINITION`, `ENUM_VALUE`,
  `ARGUMENT_DEFINITION` and `INPUT_FIELD_DEFINITION`
  (`schema/directive/deprecated.rb:8`), with October 2021's `String` argument.
  The two extra locations are the draft's (which also has
  `DIRECTIVE_DEFINITION`), not a departure from both editions: the run is
  graded against October 2021 only because graphql-ruby lacks
  `__Schema.directives(includeDeprecated:)`.
- **A crash on a nested list default (3 vectors):**
  `type Query { f(w: [[Int]] = [1, 2]): Int }` makes `from_definition` raise
  `NoMethodError: undefined method 'map' for an instance of Integer`.
  `validate_default_value` wraps a single default in a list only at the outer
  level (`schema/argument.rb:624-630`), and `List#coerce_result` then calls
  `map` on each item (`schema/list.rb:51`). The draft coerces the default to
  `[[1], [2]]`.
- **The schema's description is dropped (2 results, `descriptions`):**
  `"""The schema""" schema { … }` gives `__schema { description }` null.
  `from_definition` takes the schema definition's directives but not its
  description (`schema/build_from_definition.rb:277-279`).
- **An unreferenced type is hidden (3 results, `types` and `typeByName`):**
  with `schema { query: Q subscription: S }`, a `type Mutation` nothing
  references is left out of `types`, and `__type(name: "Mutation")` is null
  (`schema/warden.rb:509-517`). `GraphQL::Schema::Visibility` hides it too.
