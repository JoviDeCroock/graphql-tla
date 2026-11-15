# async-graphql adapter

A graphql-tla conformance adapter ([docs/conformance.md](../../docs/conformance.md))
for [async-graphql](https://github.com/async-graphql/async-graphql) 7.0.17,
using its `dynamic` schema API.

The adapter parses the kit's SDL with `async-graphql-parser`, rebuilds it as
dynamic types with one resolver on every field, and runs every execution on a
single-threaded `futures` `LocalPool`. Nothing but a `settle` from the kit can
wake a task, so after each message the adapter runs the pool until it stalls
and reports `idle`.

Capabilities: `idle`, `invalid-results`, `mutation`, `subscription`,
`subscription-stream`, `parent-values`, `custom-scalar-results` and
`scalar-results`. The adapter claims only the execution area.

- `subscription-stream`: a subscription root field's stream (what a
  `SubscriptionField` resolver returns) is the kit's source. On `emit` it
  asks for the event (the root `call`; the settled outcome is the item), on
  `complete` it ends, and on `fail` it yields the failure as an `Err` item
  and then ends: a Rust `Stream` can't end with an error, and a stream of
  `Result`s is what a `SubscriptionField` returns. The adapter consumes
  `Schema::execute_stream` as a client would, reporting each `Response` and
  then `done` when it ends. The client cancels by dropping the response
  stream; the drop completes at once, so the adapter then reports `done`.
  The source stream, dropped before it ended, reports `source-cancelled`.
- `parent-values`: the request's root value
  (`DynamicRequestExt::root_value`) and each object outcome's
  `FieldValue::owned_any` carry the kit's token, and each resolver reports
  the token it finds in `ResolverContext::parent_value`. At a subscription's
  root, no resolver runs on an event: the stream's item is the root field's
  value. So the root `call` (the source's request for the event) reports
  the event's token by construction, and `parentValue` grades nothing
  there.
- `custom-scalar-results`: each custom scalar is registered with a
  validator (`Scalar::validator`), which async-graphql calls on every value
  a resolver returns for the scalar (`resolve.rs:496-505`). It rejects the
  value the adapter returns for `uncoercible`, an object
  `{"unrepresentable": true}`.
- `scalar-results`: a resolver returns `FieldValue::value` of the integer
  `4` for an ID and `2147483648` for an Int, as any dynamic resolver can.

The adapter writes async-graphql's own serialization of each `Response`
into its `response` message as it is, and escapes U+2028 and U+2029 in
every line it writes.

Not claimed:

- `deferred-items`: the items of a `FieldValue::list` are values rather
  than futures.
- `error-propagation-off`: async-graphql has no switch for it.
- `uncoercible-results`: the adapter doesn't return those values for the
  built-in leaf types, so `intFraction` is untested for async-graphql. That
  is a gap in the adapter, not evidence that async-graphql coerces leaves
  correctly. The dynamic schema registers the built-in scalars without a
  validator (`Scalar::new`, `src/dynamic/schema.rs:171-174`), and
  `Scalar::validate` accepts everything without one
  (`src/dynamic/scalar.rs:101-106`), so a fraction returned for an Int would
  most likely pass through, as `2147483648` does (below). An unknown enum
  name is refused (`src/dynamic/resolve.rs:526-547`). A non-finite Float
  can't be returned at all: `Value::from(f64::INFINITY)` is `Value::Null`
  (`async-graphql-value`, `src/lib.rs:217-221`).
- The other areas (`parse`, `validate`, `coerce`, `schema`, `introspect`,
  `coordinate`): not in scope for this adapter. async-graphql has no schema
  coordinate API (§2.14), so `coordinate` couldn't be claimed in any case,
  and its dynamic schema isn't built from SDL, so neither could `schema`.

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

## Results

From a `--strict` run of the execution area on the kit in this repository:
509 of 677 distinct well-formed cases satisfy the reference, and 16023 of
28385 cases are malformed (1155 distinct malformed cases also break the
reference). Only `directives_dropped` passes. `noPropagation` is skipped,
and the kit sends no `uncoercible` value for a built-in leaf type. No
adapter problems.

## Known async-graphql deviations

Source references are to async-graphql 7.0.17 (`src/dynamic/...`), as
published on crates.io. The same code is in 8.0.0-rc.5. All of it is in
`async_graphql::dynamic`, which only the dynamic API uses; the
derive-macro API has its own resolution code and may behave differently. It
does have the nullable boundary the second item is about. Levels are
September 2026's.

- **Resolver errors have no path (`errorPath`, MUST, 13819 cases).** When a
  resolver's future fails, `resolve.rs:262-266` turns the error into a
  server error with `err.into_server_error(field.pos)`, without
  `ctx_field.set_error_path`, which every other error in the file gets.
  §7.1.6: an error associated with a field "must contain an entry with the
  key path". This is the largest finding, because every resolver error has
  it.
- **Any error nulls all of `data` (`dataMatches`, MUST, 1275 cases;
  `complete`, MUST, 423).** Errors are `?`-propagated from `collect_field`
  (`resolve.rs:265-281`) through `resolve_container` (`resolve.rs:39-47`)
  to `execute_once`, so a nullable field is no boundary: `user` (nullable)
  failing gives `{"data": null}` instead of `{"data": {"user": null, ...}}`
  (§6.4.4). `try_join_all` (`resolve.rs:40`) then drops the sibling
  futures, so the response goes out while other resolvers are pending. The
  kit counts a case under `dataMatches` when the null can't be right
  whatever the pending resolvers do, and only under `complete` when a
  pending Non-Null root field might still null `data`. The derive API
  catches errors at `Option<T>` (`src/types/external/optional.rs:68-75`).
- **A null list item or subscription event is completed as an object
  (`callsReachable`, INFO, 1617 cases).** `(Type::Object(object), _)`
  matches `FieldValue::NULL` (`resolve.rs:507-516`), so the item's fields
  are executed on null: a null `posts` item gives
  `{"posts": [{"title": "v"}]}`. The items of a `FieldValue::list`, and a
  subscription stream's items, are `FieldValue`s, and the only null one can
  be is `FieldValue::NULL` (`field.rs:85-86`, "A null value").
- **A null for a Non-Null item isn't an error (`dataMatches`,
  `nullsExplained`, MUST).** `resolve.rs:415-417` raises "non-null types
  require a return value" only for `None`; `Some(Value::Null)` passes, so
  `matrix: [[Int!]]!` can hold `[[null]]`.
- **A null for a list type raises an error (`errorsWereRaised`, MUST, 112
  cases; `errorsInsideNulls`, MUST, 7).** `resolve.rs:437-439` raises
  "internal: expects an array" for `FieldValue::NULL` at a list type,
  instead of completing it to null. With the null items above, these also
  account for `nullsExplained` (MUST, 210 cases).
- **Fields aren't merged (`callsOnce`, INFO, 3367 cases;
  `mutationFieldsOnce`, MUST, 411 cases).** `collect_fields`
  (`resolve.rs:288-400`) pushes one future per field selection and never
  groups them by response key, so `node.id`, selected directly and again
  through `...UserFields`, is resolved twice (§6.3.2, §6.3.3). At the
  mutation root, `mutation { a: like { likes } ...M } fragment M on
  Mutation { a: like { likes } }` runs `like` twice under `a`.
- **A fragment on a union doesn't apply to its members (`dataMatches`,
  `complete`, in `abstract`).** `collect_fields` applies a fragment when its
  type condition is the object type or one of the interfaces it implements
  (`resolve.rs:376-381`), never a union it belongs to. So in
  `{ node { ... on SearchResult { __typename } ...Named } }`, with
  `Named` on `SearchResult`, a `User` node gets neither selection (§6.3.2
  DoesFragmentTypeApply).
- **An integer ID is passed through as a number (`idAsString`, MUST, 173
  cases), and an Int outside 32 bits as it is (`intRange`, SHOULD, 135
  cases).** The built-in scalars have no validator (`src/dynamic/schema.rs:171-174`),
  and a scalar's value goes into the response if its validator accepts it
  (`resolve.rs:496-498`). A resolver that returns `Value::from(4)` for an
  `id: ID` field gives `"id": 4`, where §3.5.5 says an ID "must always
  serialize as a String"; `Value::from(2147483648i64)` for an Int gives
  `2147483648`, where §3.5.1 says an execution error "should be raised".
- **The subscription root ignores fragment spreads and inline fragments
  (`dataMatches`, in `subscriptionAlias`).** `collect_streams` only looks
  at `Selection::Field` (`src/dynamic/subscription.rs:204`), so
  `subscription { liked: postLiked { likes } ...Liked }` never executes
  `Liked`'s selections (§6.2.3.2).
- **The response stream ends after an event whose result has an error
  (`streamEndsOnlyForCause`, SHOULD, 23 of 36 streams).** `collect_streams`
  yields the event's response and then `break`s if it has any error
  (`src/dynamic/subscription.rs:274-278`), which drops (cancels) the source
  stream and completes the response stream, though the source hadn't ended
  and the client hadn't cancelled. An `Err` item from the source ends it the
  same way, through `?` (`:237`).
- **A source stream's failure is an error result, then the stream
  completes (`failsWithSource`, MUST since September 2025, 4 streams;
  `eventPerSourceEvent`, MUST, the same 4).** The source's `Err` item
  becomes a `Response` with that error (`:237`, `:280-282`), and then the
  response stream ends normally: a client gets a result for no event and a
  normal completion, where §6.2.3.2 says it "must complete with that
  error". `execute_stream` returns a `Stream<Item = Response>`, which has no
  way to complete with an error.

`resultCoercion` and `coercionErrorReported` pass for custom scalars: the
validator's rejection is an execution error at the field's path. Every
other stream check passes: the stream completes with its source, a cancel
completes it and cancels the source, and nothing arrives after a cancel.
