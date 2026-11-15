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

graphql-go has no `buildSchema`. [`schema.go`](schema.go) parses the SDL with
graphql-go's own parser (`language/parser`) and builds the types: objects,
interfaces, unions, enums, input objects and custom scalars, with arguments
and default values. Every field gets the adapter's `Resolve`, interfaces and
unions get a `ResolveType` that picks the object type named by the value's
`__typename`, and every root subscription field gets a `Subscribe` that
returns a channel with one event. Schemas are cached by SDL.

The resolver sends `call`, stamped with `after` (the settles applied so far),
and returns a thunk that blocks until the kit settles the call. The
execution runs with `graphql.Do`, or `graphql.Subscribe` for a subscription,
on its own goroutine, and its `*graphql.Result` is serialized with
`encoding/json`.

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

- `deferred-items`: graphql-go completes a list item that is a
  `func() (interface{}, error)` as a thunk, like a field's result
  (`completeValue`, executor.go:687-694), so each item is its own call.
  Not claimed with `--sync`.
- `invalid-results`: resolvers return `interface{}`, so any shape can be
  returned.
- `mutation`, `subscription`: `graphql.Do` and `graphql.Subscribe`. The root
  subscription field's `Subscribe` returns the event stream, and its
  `Resolve` runs on the event, as in graphql-js, so it is the root `call`.
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

## Known graphql-go deviations

With thunks (the default):

- **A Non-Null error nulls all of `data`, drops the other errors, and
  abandons pending resolvers.** `handleFieldError` re-panics an error at a
  Non-Null position so that the nearest nullable parent catches it
  (executor.go:583-591). But a thunk runs from the dethunk loop
  (`completeThunkValueCatchingError`, executor.go:754, called from
  `dethunkMapBreadthFirst`), outside the parent's
  `completeValueCatchingError`. The panic reaches the recover in `Execute`
  (executor.go:53-58), which returns a new `Result` holding only that error
  and no data. So `{ user { id } }` with `id: ID!` null gives
  `{"data": null}`, not `{"data": {"user": null}}` (`dataMatches`), errors
  raised earlier are lost (`nullsExplained`), and the response goes out
  while other resolvers are pending (`complete`).
- **Mutation root fields aren't serial.** `executeFieldsSerially`
  (executor.go:249-275) calls every root field's resolver, then dethunks the
  results (executor.go:268). With thunks, all root fields are called before
  the first completes (`calledSerially`). The dethunking also goes in map
  order, and a Non-Null root error loses earlier errors as above
  (`serialErrorsKept`).

In both modes:

- **Leaf results that can't be coerced become null without an error.**
  `completeLeafValue` (executor.go:869-876) returns null when the type's
  `Serialize` returns nil, and raises nothing. `coerceInt`, `coerceFloat`
  and `coerceBool` return nil for an object, and `Enum.Serialize` returns
  nil for a name that isn't a value (definition.go:1007-1019). A nullable
  position then holds null with no error (`nullsExplained`); a Non-Null one
  gets graphql-go's "Cannot return null" error. The same goes for an
  unknown enum name (`resultCoercion`).
- **A fraction for an Int is truncated.** `1.2` becomes `1` (`coerceInt`,
  scalars.go:124-128), where §3.5.1 requires an execution error
  (`resultCoercion`).
- **A non-finite Float leaves the client without a response.** `coerceFloat`
  returns `+Inf` unchanged (scalars.go:259), where §3.5.2 requires an
  execution error. `encoding/json` then refuses to serialize the result
  (`json: unsupported value: +Inf`), so `graphql.Do`'s result never reaches
  the client. The adapter reports `no-response`, which the kit counts
  against `resultCoercion`.
- **Keys are sorted, not in field order.** `Result.Data` is a
  `map[string]interface{}` (executor.go:288-311), and `encoding/json` writes
  map keys sorted. §7.2.2 says they SHOULD follow the selection set
  (`keyOrder`, `--strict` only).
- **A Non-Null mutation root error loses earlier errors**, even with
  `--sync`: it panics up to the same recover in `Execute`, which drops the
  errors already collected (`serialErrorsKept`).
