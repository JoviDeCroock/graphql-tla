# graphql-ruby adapter

A [graphql-tla conformance adapter](../../docs/conformance.md) for
[graphql-ruby](https://github.com/rmosolgo/graphql-ruby) 2.6.15.

## Setup

Needs Ruby and Bundler (checked with Ruby 3.4). The gems go into
`vendor/bundle`, which is gitignored.

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
```

`run.sh` runs `adapter.rb` with the gems in `vendor/bundle`, using `$RUBY` if
it is set, otherwise `ruby` from `PATH`. It passes its arguments on:

- `--lazy` waits through `lazy_resolve` instead of the Dataloader (below).
- `--invalid-results` turns wrong-shaped results into field errors with
  graphql-ruby's documented hooks, and claims `invalid-results` (below).
- `--no-idle` leaves out `idle`, so the kit falls back to `--grace`.

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
- `invalid-results` and `uncoercible-results`: only with `--invalid-results`.
  By default graphql-ruby doesn't produce a response for them (below). The
  conformance sheet runs the adapter with `--invalid-results`.
- `error-propagation-off` isn't claimed: graphql-ruby 2.6.15 has no switch
  or directive that disables null propagation.

## Known graphql-ruby deviations

The kit finds no failures in any mode. These are graphql-ruby's defaults
around wrong-shaped results, which the kit only reaches with
`--invalid-results` or doesn't reach at all.

### Wrong-shaped results raise out of `execute`

§3.5 and §6.4.3 make a result that can't be coerced, or a runtime type that
isn't a possible type, a field error. By default graphql-ruby raises out of
`Schema#execute` instead, so the client gets no response:

- a non-list for a list type: `.each` fails, and graphql-ruby raises
  `ListResultFailedError` (`runtime.rb:808-811`);
- an object for an Int or Float: `Types::Int.coerce_result` calls
  `value.to_i` (`lib/graphql/types/int.rb:25`), `Types::Float` calls
  `value.to_f` (`lib/graphql/types/float.rb:22`), and the `NoMethodError` is
  re-raised (`runtime.rb:714`, `Schema.handle_or_reraise`,
  `lib/graphql/schema.rb:1500`);
- a type that isn't one of the abstract type's possible types: the default
  `Schema.type_error` raises `UnresolvedTypeError`
  (`lib/graphql/schema.rb:1745-1746`).

graphql-ruby treats these as programming errors. `--invalid-results` uses the
two hooks its documentation offers, `rescue_from` and `type_error`, to report
them as field errors at the field's path. With those, the kit's
`invalid-results` cases pass.

### Lenient result coercion

`Types::Boolean.coerce_result` is `!!value` (`lib/graphql/types/boolean.rb:15`),
so any value but `nil` and `false`, including an object or the string
`"false"`, becomes `true`. `Types::Int.coerce_result` is `value.to_i`, so
`1.5` becomes `1` and `"12abc"` becomes `12`. §3.5.1 and §3.5.4 ask for a field
error where a value can't be coerced without losing information. A schema with
resolvers returning `1.5` for an Int and `"false"` for a Boolean answers
`{"data":{"i":1,"b":true}}`. The kit's `leaves` fixture catches the Int case:
with `--invalid-results`, an `uncoercible` outcome returns `1.2` for an Int,
and graphql-ruby answers `1` instead of an error (`resultCoercion`). It doesn't
probe Boolean, since §3.5.4 leaves reasonable coercions to the service.
