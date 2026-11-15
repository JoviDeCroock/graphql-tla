# async-graphql adapter

A graphql-tla conformance adapter ([docs/conformance.md](../../docs/conformance.md))
for [async-graphql](https://github.com/async-graphql/async-graphql) 7.0.17,
using its `dynamic` schema API.

The adapter parses the kit's SDL with `async-graphql-parser`, rebuilds it as
dynamic types with one resolver on every field, and runs every execution on a
single-threaded `futures` `LocalPool`. Nothing but a `settle` from the kit can
wake a task, so after each message the adapter runs the pool until it stalls
and reports `idle`.

Capabilities: `idle`, `invalid-results`, `mutation`, `subscription`. There's no
`deferred-items`, because the items of a `FieldValue::list` are values rather
than futures. There's no `error-propagation-off` either, because async-graphql
has no switch for it.

`uncoercible-results` isn't claimed: the adapter doesn't return those values,
so `resultCoercion` and `intFraction` are untested for async-graphql. That
is a gap in the adapter, not evidence that async-graphql coerces leaves
correctly. The dynamic schema registers the built-in scalars without a
validator (`Scalar::new`, `src/dynamic/schema.rs:171-174`), and
`Scalar::validate` accepts everything without one
(`src/dynamic/scalar.rs:101-106`), so a fraction returned for an Int would
most likely pass through. An unknown enum name is refused
(`src/dynamic/resolve.rs:526-547`). A non-finite Float can't be returned at
all: `Value::from(f64::INFINITY)` is `Value::Null` (`async-graphql-value`,
`src/lib.rs:217-221`).

## Build

Needs Rust 1.87 or later. `Cargo.lock` pins dependency versions that build
with 1.87.

```shell
cargo build --release --locked --manifest-path adapters/async-graphql/Cargo.toml
```

## Run

From the repository root:

```shell
node kit/cli.mjs run execution --adapter adapters/async-graphql/target/release/graphql-tla-async-graphql
node kit/cli.mjs run execution --adapter adapters/async-graphql/target/release/graphql-tla-async-graphql --strict
```

`--no-idle` leaves `idle` out, so the kit falls back to `--grace` and only
does random runs:

```shell
node kit/cli.mjs run execution --adapter "adapters/async-graphql/target/release/graphql-tla-async-graphql --no-idle" --random 300 --grace 20
```

## Known async-graphql deviations

Source references are to async-graphql 7.0.17 (`src/dynamic/...`), as
published on crates.io. The same code is in 8.0.0-rc.5. All of it is in
`async_graphql::dynamic::resolve`, which only the dynamic API uses; the
derive-macro API has its own resolution code and may behave differently. It
does have the nullable boundary the second item is about.

- **Resolver errors have no path (`errorPath`).** When a resolver's future
  fails, `resolve.rs:262-266` turns the error into a server error with
  `err.into_server_error(field.pos)`, without `ctx_field.set_error_path`,
  which every other error in the file gets. §7.1.6: an error associated
  with a field "must contain an entry with the key path". This is the
  largest finding, because every resolver error has it.
- **Any error nulls all of `data` (`dataMatches`, and `complete`).** Errors
  are `?`-propagated from `collect_field` (`resolve.rs:265-281`) through
  `resolve_container` (`resolve.rs:39-47`) to `execute_once`, so a nullable
  field is no boundary: `user` (nullable) failing gives `{"data": null}`
  instead of `{"data": {"user": null, ...}}` (§6.4.4). `try_join_all`
  (`resolve.rs:40`) then drops the sibling futures, so the response goes
  out while other resolvers are pending. The kit counts a case under
  `dataMatches` when the null can't be right whatever the pending resolvers
  do, and only under `complete` when a pending Non-Null root field might
  still null `data`. The derive API catches errors at `Option<T>`
  (`src/types/external/optional.rs:68-75`).
- **A null list item or subscription event is completed as an object
  (`callsReachable`).** `(Type::Object(object), _)` matches
  `FieldValue::NULL` (`resolve.rs:507-516`), so the item's fields are
  executed on null: a null `posts` item gives `{"posts": [{"title": "v"}]}`.
  The items of a `FieldValue::list`, and a subscription stream's items, are
  `FieldValue`s, and the only null one can be is `FieldValue::NULL`
  (`field.rs:85-86`, "A null value").
- **A null for a Non-Null item isn't an error (`dataMatches`,
  `nullsExplained`).** `resolve.rs:415-417` raises "non-null types require a
  return value" only for `None`; `Some(Value::Null)` passes, so
  `matrix: [[Int!]]!` can hold `[[null]]`.
- **A null for a list type raises an error.** `resolve.rs:437-439` raises
  "internal: expects an array" for `FieldValue::NULL` at a list type,
  instead of completing it to null (`errorsWereRaised`,
  `errorsInsideNulls`).
- **Fields aren't merged (`callsOnce`).** `collect_fields`
  (`resolve.rs:288-400`) pushes one future per field selection and never
  groups them by response key, so `node.id`, selected directly and again
  through `...UserFields`, is resolved twice (§6.3.2, §6.3.3).

