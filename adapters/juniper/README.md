# Juniper adapter

A [graphql-tla adapter](../../docs/conformance.md) for [Juniper](https://github.com/graphql-rust/juniper) 0.18.0 (the `juniper` crate), with `juniper_subscriptions` 0.19.0 for subscription responses.

Source references below are to `juniper` 0.18.0 (`src/...`), `juniper_codegen` 0.18.0, `juniper_subscriptions` 0.19.0 and `juniper_graphql_ws` 0.6.0, as published on crates.io.

## Build

Needs Rust 1.87 or later. `Cargo.lock` pins dependency versions that build with 1.87.

```shell
cargo build --release --locked --manifest-path adapters/juniper/Cargo.toml
```

`target/` is gitignored.

## Run

From the repository root:

```shell
node kit/cli.mjs run execution --adapter adapters/juniper/target/release/graphql-tla-juniper --strict
node kit/cli.mjs run parse --adapter adapters/juniper/target/release/graphql-tla-juniper --strict
node kit/cli.mjs run validate --adapter adapters/juniper/target/release/graphql-tla-juniper --strict
node kit/cli.mjs run introspect --adapter adapters/juniper/target/release/graphql-tla-juniper --strict
```

Options:

- `--no-idle` leaves out `idle`, so the kit falls back to `--grace` and only does random runs.
- `--inline-items` leaves out `deferred-items`, so list items come inline with the list's settle.

`examples/macros.rs` reproduces, with an ordinary schema built with `#[graphql_object]` and `#[graphql_subscription]` and no adapter code involved, the execution findings a typed schema can show: fields called twice, error paths without list indices, the nested list, the non-finite Float and the subscription errors (see [Execution](#execution)):

```shell
cargo run --release --example macros --manifest-path adapters/juniper/Cargo.toml
```

## How it works

Juniper is built around Rust types: `#[graphql_object]` and the other macros expand into implementations of `GraphQLType` and `GraphQLValue`. Those traits have a `TypeInfo` associated type, documented as the way to build a schema "that is partly dynamic, meaning that it can use information that is not known at compile time" (`src/types/base.rs`, `GraphQLValue::TypeInfo`). `GraphQLType::name(info)` and `GraphQLType::meta(info, registry)` take the info, so one Rust type can stand for any number of GraphQL types. Juniper's own test of this is `src/tests/type_info_tests.rs`.

The adapter does exactly that. For each `execute`, it reads the kit's SDL with `async-graphql-parser` (Juniper can print SDL but not read it), and builds a `RootNode` with `RootNode::new_with_info`. One Rust type, `Obj`, with `TypeInfo` holding the SDL and a type name, stands for every named type. Its `meta` builds the type's `MetaType` from the SDL with Juniper's `Registry` and `juniper::meta` builders: fields, arguments and their defaults, descriptions, `@deprecated`, `@specifiedBy`, `@oneOf`, interfaces, unions, enums and input objects. A schema without a mutation or subscription type gets the `_EmptyMutation` and `_EmptySubscription` roots that Juniper's `EmptyMutation` and `EmptySubscription` use, which introspection hides.

`Obj::resolve_field_async` is the one resolver on every field. It sends `call`, stamped with `after` (the settles the execution had applied), and awaits a oneshot channel that the kit's `settle` completes. An `error` outcome returns a `FieldError`. Anything else is handed back to Juniper to complete:

- an object is an `Obj` whose `concrete_type_name` is the kit's type, completed by Juniper's own selection-set code (the default `GraphQLValueAsync::resolve_async`); `resolve_into_type_async` resolves it as its concrete type, as the macros do for interfaces and unions;
- a list is a `Vec`, completed by Juniper's `Vec<T>` implementation;
- an Int, Float, Boolean, String or ID is a Rust `i32`, `f64`, `bool`, `String` or `ID`, completed by Juniper's own scalar implementations;
- an enum value is `Value::scalar(name)` with one of the enum's names, which is what a derived `GraphQLEnum` returns, and a custom scalar's value is `"v"`.

Queries and mutations run through `juniper::http::GraphQLRequest::execute`, and the response is the `GraphQLResponse` serialized with `serde_json`, as Juniper's HTTP integrations send it. The adapter puts that text in its `response` message as it is, without reading it back into a JSON value, so the kit sees what a client would (`uniqueKeys` reads the line). It escapes U+2028 and U+2029 in every line it writes, which can only occur inside JSON strings. Juniper itself runs a mutation's root fields serially (`Executor::serial`, `src/executor/mod.rs:76-83`, `src/types/async_await.rs:427`).

If the task panics, the client gets no response, and the adapter sends `no-response`. No run has panicked.

A subscription's response (without `subscription-stream`, or for each event with it) is sent as `juniper_graphql_ws` sends it: the `ExecutionOutput`'s `data`, and its `errors` only when there are any. `juniper_graphql_ws` copies the output into its `NextPayload` (aliased `DataPayload` for the graphql-ws protocol), whose `errors` has `#[serde(skip_serializing_if = "Vec::is_empty")]` (`src/server_message.rs:13-25`). Serializing the `ExecutionOutput` itself would always write `errors`, but no Juniper transport sends it that way.

### Threading, and `idle`

Everything runs on one thread, on a `futures` `LocalPool`. Juniper spawns no tasks and has no timers: it composes futures with `FuturesOrdered` (`src/types/async_await.rs:198`). So the only thing that can wake a task is a `settle` from the kit. After each message the adapter runs the pool until it stalls (`run_until_stalled`), at which point every unfinished execution is waiting on the kit, and says `idle`. The kit's determinism replay passes.

### Input types

Juniper checks an input value with a plain function pointer from `FromInputValue` (`src/schema/meta.rs:820-828`), which can't see the type info. So:

- each enum gets its own Rust type, `EnumSlot<N>`, whose `from_input_value` accepts the enum's values, as `#[derive(GraphQLEnum)]` generates it (an enum value, or a string with a value's name);
- an input object takes only an object, as `#[derive(GraphQLInputObject)]` does (`juniper_codegen` `src/graphql_input_object/mod.rs:713-719`); Juniper checks the fields against the metadata itself;
- a custom scalar takes any scalar literal. Juniper refuses a list or object literal for every scalar.

## Capabilities

- `idle`: see above.
- `deferred-items`: Juniper completes a list's items as futures, all at once, in a `FuturesOrdered` (`src/types/containers.rs:568-570`). Each item is a value whose `resolve_async` sends its own `call` and awaits its settle. A macro-built list holds values that are already there, so this is the adapter's doing; it is how an item type with an async `resolve_async` behaves. `--inline-items` returns the items with the list.
- `uncoercible-results`, for Float only (`"uncoercibleTypes": ["Float"]` in `hello`): Juniper completes a leaf with whatever `Value` its Rust type's `resolve` returns, and checks nothing. A Float field returns an `f64`, which can be infinite, so the adapter returns `f64::INFINITY` through Juniper's `f64`, as any Juniper schema can. An Int field returns an `i32`, which can't hold 1.2, and an enum field a `#[derive(GraphQLEnum)]` Rust enum, whose `resolve` only writes the names of its variants. So a typed schema can't return a fraction for an Int or an unknown enum name, and the adapter doesn't claim them: the kit doesn't send them, and `intFraction` is untested.
- `"nullItems": false` in `hello`: a Non-Null list item is a non-`Option` Rust type (`Vec<Post>` for `[Post!]`), and the item a `#[graphql_subscription]` stream yields for a Non-Null root field is too (`Ok(None)` exists only for an `Option` item type, `juniper_codegen` `src/common/field/mod.rs:371-373`). Neither has a null, so the kit never settles those positions with `null`. Non-Null fields still get `null`; Juniper checks those itself.
- `mutation`: Juniper's own serial execution.
- `subscription`: the subscription root field is resolved as `#[graphql_subscription]` generates it (`juniper_codegen` `src/common/field/mod.rs:318-380`): the field returns its source stream, and each item is resolved with an owned executor. The stream's request for its one event is the root `call`, and the settled outcome is the event. The response is the first `ExecutionOutput` of a `juniper_subscriptions::Coordinator` connection, serialized as `juniper_graphql_ws` sends it (see above).
- `subscription-stream`: the root field's source stream is the kit's. On `emit` it asks for the event (the root `call`; the settled outcome is the item), on `complete` it ends, and on `fail` it yields the failure as an error item and then ends. A Rust `Stream` can't end with an error: a stream of `Result`s, whose `Err` items `#[graphql_subscription]` turns into errors of the root field (`juniper_codegen` `src/common/field/mod.rs:365-368`), is how a Juniper source reports one. The adapter consumes the `Coordinator` connection as `juniper_graphql_ws` does, reports each `ExecutionOutput` as a `response` and its end as `done`. The client cancels by dropping the connection, which is how a Juniper client unsubscribes; the drop completes at once, so the adapter then reports `done`. Dropping the connection drops the source stream with it: a source stream dropped before it ended reports `source-cancelled`.
- `parent-values`: every `Obj` carries the kit's token: the root objects `RootNode` resolves the operation on carry `initialValue`, and an object outcome's value carries its `token`. Each `call` reports the token of the `Obj` whose `resolve_field_async` Juniper called, which is the value Juniper gave the resolver. A list item's call has no `parent`. At a subscription's root, no resolver runs on an event: the source stream's item is the root field's value. So the root `call` (the source's request for the event) reports the event's token by construction, and `parentValue` grades nothing there; below the root, it grades Juniper.

Not claimed:

- `invalid-results`: a Juniper resolver returns a Rust value whose shape the type system fixes: a `Vec` for a list, a union or interface enum whose variants are the possible types, an `i32` for an Int. Juniper's executor never checks a result's shape, so the adapter would have to make up a `Value` of the wrong shape, and the run would test the adapter, not Juniper.
- `error-propagation-off`: Juniper has no option for it.
- `scalar-results`: an ID field returns Juniper's `ID`, a string type, and an Int field an `i32`, so a typed schema can't return the integer 4 for an ID or 2147483648 for an Int. `idAsString` and `intRange` are untested.
- `custom-scalar-results`: a Juniper custom scalar's result coercion can't raise. `#[graphql_scalar]` generates `resolve` as `Ok(Value::Scalar(ToScalarValue::to_scalar_value(self)))` (`juniper_codegen` `src/graphql_scalar/mod.rs:408-420`), and `to_scalar_value` returns a value, not a `Result` (`src/value/scalar.rs:690-694`). The scalar's Rust type is what keeps out values it can't represent, as for Int and enums above.
- `custom-directives` (validate and introspect): Juniper can't declare a directive of its own (see below), so the adapter drops the SDL's directive definitions, and the kit doesn't grade the vectors that declare or use one.

## Other areas

The adapter claims `parse`, `validate` and `introspect`, with none of their optional capabilities.

- **parse:** `juniper::parser::parse_document_source`, which `ValidatedOperation::new` calls for every request (`src/executor/validated_operation.rs`). Juniper's parser needs a schema: it reads a scalar literal as the type of the argument it's given to, and when that isn't known, by its token, which needs a scalar of that name in the schema (`src/parser/value.rs:204-244`). Against a schema without a Float type, `{a(x: 1.5)}` is a parse error. So the parse schema declares every built-in scalar: `type Query { a: Int b: Float c: String d: Boolean e: ID }`. Juniper's parser only reads operations and fragments, so type system definitions are rejected. A source with a lone surrogate can't be read into a Rust string (`serde_json` refuses the request), so it never reaches Juniper; the adapter answers `unsupported` ("lone surrogate: …"), and the kit doesn't grade the vector. A panic in the parser is reported as an `error` (a crash), not as `ok: false`. None of the vectors makes it panic. Juniper 0.18.0 limits documents to 64 levels of nesting and 15,000 tokens by default (`Limits`, `src/parser/parser.rs:45-87`; CHANGELOG, GHSA-34cw-x8g7-rcv5 and GHSA-36rq-8957-mjrx), so it refuses the deep and long crash probes with a parse error (`DepthLimitExceeded`, `TokenLimitExceeded`), which the kit counts as an answer.
- **validate:** the kit's schema built as for execution, then `parse_document_source`, `ValidatorContext::new` and `visit_all_rules`, which is what `ValidatedOperation::new` runs. A parse error is `valid: false`. A document with one operation, for which the schema has no root type (a mutation against a schema without a mutation type), is `valid: false` too, with Juniper's own message ("Schema is not configured for mutations operations"): executing it fails before any resolver runs (`GraphQLError::NotSupported`, `src/executor/validated_operation.rs:347-355`), so Juniper never executes it. A panic in the validator is reported as an `error` (a crash), not as `valid: false`: `query ($x: Missing = 1) { a }` panics with "Type not found in schema".
- **introspect:** the schema built as for execution, then the kit's query through `GraphQLRequest::execute`, whose serialized response goes to the kit as it is. A request error (the query doesn't parse or validate) is `GraphQLResponse`'s `Err` case, which Juniper serializes as `errors` with no `data` entry (`src/http/mod.rs:225-229`). A description is read by `async-graphql-parser`, so a block string's value is its `BlockStringValue` (§2.10.4). That parser leaves the block string escape `\"""` as it is (`block_string_value`, `async-graphql-parser` 7.0.17 `src/parse/utils.rs:28-80`), so the adapter turns it into `"""` in each description written as a block string. A description on the schema definition, which that parser doesn't read, is taken out first and read the same way. The SDL reader is the adapter's, not Juniper's, and it doesn't read September 2025's lexical forms: a schema with `\u{…}` escapes or raw control characters in its strings (the 3 `descriptionText` vectors) isn't built, the adapter answers a request error, and the kit leaves those vectors ungraded.

Not claimed:

- `schema`: Juniper has no way to build a schema from SDL, and checks almost nothing when a `RootNode` is built (it panics on a type that is still a placeholder, `src/schema/model.rs:365-367`). Every verdict would be the adapter's SDL handling, not Juniper's.
- `coerce`: not in scope for this adapter.
- `coordinate`: Juniper has no schema coordinate API (§2.14): nothing in the `juniper` crate parses or resolves one.
- `parse-sdl`: Juniper's parser reads only executable documents (`src/parser/document.rs`); it has no type system grammar.

## Results

From `--strict` runs on the kit in this repository (the sheet's reports are the authority; rerun to refresh):

| Area | Result |
| --- | --- |
| execution | 2319 of 2331 distinct well-formed cases satisfy the reference, and 10703 of 31727 cases are malformed (478 distinct malformed cases also break the reference). `mutation`, `nullPropagation`, `scalars` and the four `directives_*` fixtures pass. `noPropagation` is skipped. The kit sent no Int or enum `uncoercible` values, no wrong shapes, no `scalar-results` values and no null for a Non-Null list item or subscription event; the report's `provenance.skipped` counts them. No adapter problems. |
| parse | 2084 of 2119 graded vectors agree, no crashes; 15 vectors with a lone surrogate aren't graded (`unsupported`), and the 713 type system vectors aren't asked (no `parse-sdl`). |
| validate | 3162 of 3262 graded vectors agree, no crashes; 73 vectors that need `custom-directives` and 20 that need `custom-scalar-literals` aren't graded. 6 rule checks and `acceptsValid` fail. |
| introspect | September 2026's query is rejected, September 2025's answered, so the run grades against September 2025: 33 of 51 results satisfy the reference and 12 more fail only a SHOULD or informational check; 3 aren't graded (the adapter's SDL reader, see above). `defaultValue` (MUST, 6 results) fails. |

`--inline-items` finds the same execution failures except those that need an item to fail by itself. `--no-idle` (grace-based, random runs only) finds the same failures.

## Known Juniper deviations

### Execution

Levels are September 2026's. `examples/macros.rs` shows the first group's findings, the missing indices, the nested list, the non-finite Float and the subscription errors with a macro-built schema; the item errors need a hand-written item type.

- **Fields aren't collected.** Juniper doesn't build a grouped field set (§6.3.2). It runs each `Field` selection by itself, fragments included, calling the field's resolver every time (`src/types/async_await.rs:211-296`), and merges the results by response key (`merge_key_into`, `src/types/base.rs:646-670`). With macros, `{ node { id ...F } } fragment F on User { id name }` calls `User.id` twice. One cause, four checks:
  - `callsOnce` (INFO, 6248 cases in `abstract`, `fragments`, `merging`, `mutationRoot`, `ordering`): a resolver called once per selection.
  - `mutationFieldsOnce` (MUST, 2750 cases, `mutationRoot`): a mutation root field is executed once per selection, so its side effect happens twice. `mutation { a: like { likes } ...M } fragment M on Mutation { a: like { likes } }` runs `like` twice under `a`.
  - `errorPathsUnique` (MUST since September 2026, 268 cases): each run of a failing field adds its own error, so `{ a ...F } fragment F on Query { a }` with `a` failing gives two errors at `["a"]`.
  - `dataMatches` (MUST, 175 of its 232 cases, in `abstract` and `merging`): `merge_key_into` merges an object into an object, and otherwise keeps the first value (`:665`). When one run of a field completes to an object and another nulls it (a Non-Null subfield of its own selection fails), the response keeps the object: in `merging`, `{ a { subfield1 } ...F } fragment F on Query { a { subfield2 } }` with `subfield2: Int!` failing gives `{"a": {"subfield1": null}}`, where the merged `a` is null.
- **Error paths have no list indices (`responsePosition`, MUST, 1347 cases; `errorPathFull`, SHOULD, 1258 cases).** An `ExecutionError`'s path is a `Vec<String>` built from the response names of the enclosing fields (`FieldPath`, `src/executor/mod.rs:52-55`, `805-813`). List positions aren't in it. With macros, `{ posts { title } }`, with a failing Non-Null `title`, reports the error at `["posts", "title"]`. With the item errors below, `posts.0` failing is reported at `["posts"]`, which the kit counts as a path cut short (`errorPathFull`).
- **An item that fails by itself is reported at its list's path (`errorsWereRaised`, `errorsInsideNulls`, `errorPathsUnique`, `nullsExplained`; not in the sheet's run, which sends no failing list item of this kind).** `resolve_into_list_async` resolves each item with the list's own executor, and `resolve_into_value_async` pushes an item's error at that executor's path, the list field's (`src/executor/mod.rs:537-548`, `src/types/containers.rs:568-570`). So `tags.0` failing is reported at `["tags"]`, where `tags` has a value, and two failing items give two errors with the same path. This is not the missing indices above: even with indices, the error would sit at the list. It needs an item whose own `resolve_async` fails. No built-in container or macro item type can (Juniper has no `GraphQLValue` for `Result`), so it takes a hand-written item type, here the adapter's deferred items. With `--inline-items` these findings go away.
- **An inner list's items are checked against the outer list's item type (`dataMatches`).** `resolve_into_list_async` reads whether items are Non-Null from `executor.current_type()` (`src/types/containers.rs:562-566`), but resolves each item with the same executor (`:569`), so a list inside a list sees the outer list's item type. For `matrix: [[Int!]]!`, an inner item that fails doesn't null the inner list, and the response holds `[[null]]`. With macros, `matrix: Option<Vec<Option<Vec<Post>>>>` (`[[Post!]]`) with a failing `Post.title` gives `{"matrix": [[null]]}`, behind an error path without indices; in the kit's runs, it shows behind the item errors above.
- **A non-finite Float is null without an error (`coercionErrorReported`, MUST, 415 cases).** Juniper's executor puts the `Value` a leaf's `resolve` returns into the response unchanged, and Juniper's `f64` passes a non-finite number through (`src/types/scalars.rs:310-312`). `DefaultScalarValue` derives `Serialize` (`src/value/scalar.rs:752-754`), and `serde_json` writes a non-finite `f64` as `null`, so the client gets `"ratio": null` with no error, where §3.5.2 says it "must raise an execution error". With macros, `fn ratio() -> Option<f64> { Some(f64::INFINITY) }` gives `{"data":{"ratio":null}}`.
- **Subscription errors don't propagate (`dataMatches`, MUST, 11 distinct cases).** The generated subscription field turns an event whose resolution recorded any error into an error for the whole root field (`juniper_codegen` `src/common/field/mod.rs:365-368`), and `juniper_subscriptions` then sets that field to `null`, whatever its type (`src/lib.rs:216-222`). An error in a nullable `title` gives `{"postLiked": null}` instead of `{"postLiked": {"likes": 1, "title": null}}`, and an error in the Non-Null root field `postLiked` gives `{"postLiked": null}` instead of `"data": null`.

- **A subscription root field selected again through a fragment loses that selection (`dataMatches`, `complete`, 1 distinct case, `subscriptionAlias`).** `resolve_selection_set_into_stream_recursive` resolves each root selection into a stream of its own and merges a fragment's by response key with `merge_key_into` (`src/types/subscriptions.rs:346-379`). A stream is a `Value::Scalar`, which `merge_key_into` doesn't merge: it keeps the first stream and drops the second (`src/types/base.rs:665`). So in `subscription { liked: postLiked { likes } ...Liked } fragment Liked on Subscription { liked: postLiked { title __typename } }`, the response is `{"liked": {"likes": 1}}`, without `title` and `__typename` (§6.2.3.2 executes the merged selection set).
- **A source stream's failure is an error event, then the stream completes.** A Juniper source stream is a Rust `Stream`, which can only end normally; an error is an `Err` item, which `#[graphql_subscription]` turns into an error of the root field (`juniper_codegen` `src/common/field/mod.rs:365-368`), and `juniper_subscriptions` into an `ExecutionOutput` with `data: {"postLiked": null}` and that error (`src/lib.rs:145-151`). The response stream then completes normally. §6.2.3 says the stream "must complete with that error" but leaves how that reaches a client to the transport, so the kit takes the weaker reading and accepts an error result followed by completion: `failsWithSource` and `eventPerSourceEvent` pass. Every other stream check passes too.

Not graded, because a typed schema can't produce the input:

- An Int field returns an `i32`, an ID field an `ID` and an enum field a Rust enum, and a custom scalar's result coercion can't fail (see [Capabilities](#capabilities)), so none of them can return a value its type can't represent. Juniper's executor wouldn't catch one (it checks no leaf `Value`), but no Juniper schema with matching Rust types can hand it one.
- A null for a Non-Null list item. `resolve_into_list_async` would null the whole list without an error (`src/types/containers.rs:574-576`), but a non-`Option` item type can only be null through propagation, which has already recorded its error.

### Parse

Every check is a MUST (§2: the token sequence "must be described by a single Document syntactic grammar"). 35 of the 2119 graded vectors fail, none by a crash.

- **The end of a number isn't checked (`intValue`, 10 vectors, §2.10.1).** `scan_number` rejects a second `0` only right after a leading `0` (`src/parser/lexer.rs:540-547`), and has no `[lookahead != NameStart]`. So `[01]` and `[-01]` (leading zeros) are accepted, and so are `[0x123]`, `[123L]`, `[1_]`, `[1x]`, `[-0_]`, `[-0x]`, `[-1_]` and `[-1x]`.
- **A `-` after a number's first digit is read into the number (`intValue`, 2 vectors, §2.10.1):** `[1-2]` and `[0-0]` are rejected, though they are two numbers each. `scan_number` takes `-` whenever it is at the start or right after the first character (`src/parser/lexer.rs:541`), then the parser gets the token `1-2`.
- **Int literals outside the `i32` range are a parse error (`intValue`, 3 vectors, §2.10.1):** `{a(x: [2147483648])}`, `[-2147483649]` and `[18446744073709551616]`. The parser reads a literal for an unknown argument by its token (`parse_scalar_literal_by_infered_type`, `src/parser/value.rs:204-244`), and an Int token through `i32`'s `parse_token` (`src/types/scalars.rs:281-288`), which fails on these. §2.10.1 puts no bound on an IntValue; the range of Int is input coercion's (§3.5.1). The same rejection shows in validate (below).
- **`\"""` in a block string only escapes its first quote (`stringValue`, §2.10.4):** `"""\""""""` is rejected and `"""\""""` accepted (7 vectors in all, both ways). In `scan_block_string`, `\` marks the next character only, and the other two quotes count toward the closing `"""` (`src/parser/lexer.rs:417-420`).
- **`\u{…}` takes at most six hex digits (`stringValue`, 2 vectors, since September 2025, §2.10.4):** September 2025 allows leading zeros, as in `"\u{000000041}"` (`src/parser/lexer.rs:500-506`).
- **`"\uD83D\u{DCA9}"` is accepted as a surrogate pair (`stringValue`, 1 vector, §2.10.4):** September 2025 pairs only two fixed-width escapes (`src/parser/lexer.rs:323-341`).
- **An empty selection set is rejected (`selectionSets`, 8 vectors, since September 2026, §2.5):** `parse_selection_set` uses a non-empty list (`src/parser/document.rs:368-380`).
- **A variable's default is parsed as the variable's type (`variables`, 1 vector, §2.11):** `query ($a: Int = {k: [1, E, null]}) {a}` is a parse error, because the parser reads an object literal only for an input object or an unknown type (`src/parser/value.rs:24-48`). The grammar doesn't depend on types.
- **A variable in a variable definition's directive is accepted (`variables`, 1 vector, §2.11):** `query ($a: Int @d(x: $b)) {a}`. The directives are parsed with the non-constant `parse_directives` (`src/parser/document.rs:633`).

The crash probes all pass: the deep and long ones end in Juniper's documented limits (see [Other areas](#other-areas)), and the 1001-digit Int in the `i32` rejection above.

### Validate

Every rule check is a MUST. 100 of the 3262 graded vectors fail, none by a crash.

- **No rule for Single Root Field (51 vectors, §5.2.4.1), Operation Type Existence (10, since September 2025, §5.2.1.1) or Directives Are Unique per Location (10, §5.7.3).** `visit_all_rules` has no such rules (`src/validation/rules/mod.rs:49-78`). A document whose one operation has no root type isn't executed (see [Other areas](#other-areas)), so the adapter answers `valid: false` for it; with several operations, the one with no root type is accepted.
- **§5.8.5 follows an older algorithm (13 vectors not enforced, 5 of them since September 2025; 7 valid vectors rejected, under `acceptsValid`).** `VariableInAllowedPosition` makes a variable with any default Non-Null, `= null` included, and ignores the default of the argument or input field it is used for (`src/validation/rules/variables_in_allowed_position.rs:89-95`). So `($v: Int = null) { echo(list: [$v]) }` with `list: [Int!]` is accepted, and `($v: Int) { echo(opt: $v) }` with `opt: Int! = 1` is rejected. September 2025's rule that a nullable variable can't be used for a OneOf input field (`query Q($v: ID) { echo(pick: {id: $v}) }`) isn't there either.
- **Int literals outside the `i32` range are a parse error (`acceptsValid`, 3 vectors):** `{ user(id: 2147483648) { id } }` for an `ID`, and `{ echo(float: 2147483648) }` and a 97-digit Int for a `Float`, are valid (§3.5.2 and §3.5.5 take any Int literal), but Juniper's `ID` (`#[graphql(parse_token(String, i32))]`, `src/types/scalars.rs:34-35`) and `f64` (`src/types/scalars.rs:316-319`) read an Int token through `i32`, so the parser rejects them.
- **A Float literal beyond `f64` is accepted (`valuesOfCorrectType`, 4 vectors, §5.6.1):** `{ echo(float: 1e400) }`, `-1e309`, `10e308` and `1.7976931348623159e308`. `f64`'s `parse_token` uses Rust's `str::parse` (`src/types/scalars.rs:320-323`), which reads them as infinity instead of failing, so `ArgumentsOfCorrectType` sees a value. §3.5.2 says a Float input outside the available precision "must raise a request error".
- **`__typename` with a selection set is accepted on a union (`leafFieldSelections`, 1 vector, §5.3.3):** `{ search { __typename { x } } }`. `ScalarLeafs` checks a field only when the validator knows its type (`src/validation/rules/scalar_leafs.rs:23-38`), and it doesn't know `__typename`'s on a union.
- **An empty selection set is a parse error (`acceptsValid`, 1 vector, since September 2026):** `query { human {} }`, as in parse.

Juniper has only its built-in directives. `SchemaType::add_directive` takes a `DirectiveType` (`src/schema/model.rs:395`, `648`), but that type and `DirectiveLocation` are in the private `schema` module (`pub(crate) mod schema`, `src/lib.rs:52`) and aren't re-exported, so no application can declare one. Custom directives are a MAY (§3.13), so this isn't a deviation: the adapter doesn't claim `custom-directives`, and the vectors that declare or use one aren't graded.

### Introspect

Graded under the September 2025 profile.

- **What Juniper lacks of September 2026's introspection types:** `__Schema.directives` takes no `includeDeprecated` argument (`src/schema/schema.rs:178`), `__Directive` has no `isDeprecated` or `deprecationReason`, and `__DirectiveLocation` has no `DIRECTIVE_DEFINITION` (`src/schema/model.rs:684-692`). So September 2026's query is rejected ("Unknown argument "includeDeprecated" on field "directives" of type "__Schema""), and September 2025's is answered: `includeDeprecated: Boolean! = false` on `fields`, `enumValues`, `inputFields` and `args`, `@deprecated(reason: String! = "No longer supported")`, `__InputValue.isDeprecated` and `deprecationReason`, and `__Type.isOneOf`. The 2 vectors new in September 2026 aren't asked.
- **String defaults aren't escaped (`defaultValue`, MUST, 6 results; `defaultValuePrinting`, SHOULD, 3 results):** `s: String = "say \"hi\""` gives `"say "hi""`, which isn't a String encoding of the value, and `c: String = "\u0000\u0001"` gives the raw control characters between quotes. `default_value_` uses `ToString` (`src/schema/schema.rs:455-456`), and `Scalar`'s `Display` writes a string between quotes as it is (`src/value/scalar.rs:711-718`). §2.10.4 says a printed StringValue "should" escape control characters.
- **`__Directive` has `onOperation`, `onFragment` and `onField` (`builtinAdditions`, INFO, 14 results):** deprecated fields kept "for compatibility with the introspection query in GraphQL.js" (`src/schema/schema.rs:521-544`).
