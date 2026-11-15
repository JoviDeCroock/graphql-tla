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
