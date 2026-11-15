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

Queries and mutations run through `juniper::http::GraphQLRequest::execute`, and the response is the `GraphQLResponse` serialized with `serde_json`, as Juniper's HTTP integrations send it. Juniper itself runs a mutation's root fields serially (`Executor::serial`, `src/executor/mod.rs:76-83`, `src/types/async_await.rs:427`).

If the task panics, the client gets no response, and the adapter sends `no-response`. No run has panicked.

A subscription's response is its first event, sent as `juniper_graphql_ws` sends it: the `ExecutionOutput`'s `data`, and its `errors` only when there are any. `juniper_graphql_ws` copies the output into its `NextPayload` (aliased `DataPayload` for the graphql-ws protocol), whose `errors` has `#[serde(skip_serializing_if = "Vec::is_empty")]` (`src/server_message.rs:13-25`). Serializing the `ExecutionOutput` itself would always write `errors`, but no Juniper transport sends it that way.

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

Not claimed:

- `invalid-results`: a Juniper resolver returns a Rust value whose shape the type system fixes: a `Vec` for a list, a union or interface enum whose variants are the possible types, an `i32` for an Int. Juniper's executor never checks a result's shape, so the adapter would have to make up a `Value` of the wrong shape, and the run would test the adapter, not Juniper.
- `error-propagation-off`: Juniper has no option for it.
- `custom-directives` (validate and introspect): Juniper can't declare a directive of its own (see below), so the adapter drops the SDL's directive definitions, and the kit doesn't grade the vectors that declare or use one.

## Other areas

The adapter claims `parse`, `validate` and `introspect`.

- **parse:** `juniper::parser::parse_document_source`, which `ValidatedOperation::new` calls for every request (`src/executor/validated_operation.rs`). Juniper's parser needs a schema: it reads a scalar literal as the type of the argument it's given to, and when that isn't known, by its token, which needs a scalar of that name in the schema (`src/parser/value.rs:204-244`). Against a schema without a Float type, `{a(x: 1.5)}` is a parse error. So the parse schema declares every built-in scalar: `type Query { a: Int b: Float c: String d: Boolean e: ID }`. Juniper's parser only reads operations and fragments, so type system definitions are rejected. A source with a lone surrogate can't be read into a Rust string (`serde_json` refuses the request), so it never reaches Juniper; the adapter answers `unsupported` ("lone surrogate: …"), and the kit doesn't grade the vector. A panic in the parser is reported as an `error` (a crash), not as `ok: false`. None of the vectors makes it panic.
- **validate:** the kit's schema built as for execution, then `parse_document_source`, `ValidatorContext::new` and `visit_all_rules`, which is what `ValidatedOperation::new` runs. A parse error is `valid: false`. A document with one operation, for which the schema has no root type (a mutation against a schema without a mutation type), is `valid: false` too, with Juniper's own message ("Schema is not configured for mutations operations"): executing it fails before any resolver runs (`GraphQLError::NotSupported`, `src/executor/validated_operation.rs:347-355`), so Juniper never executes it. A panic in the validator is reported as an `error` (a crash), not as `valid: false`: `query ($x: Missing = 1) { a }` panics with "Type not found in schema".
- **introspect:** the schema built as for execution, then the kit's query through `GraphQLRequest::execute`. A description is read by `async-graphql-parser`, so a block string's value is its `BlockStringValue` (§2.10.4), as written. A description on the schema definition, which that parser doesn't read, is taken out first and read the same way.

Not claimed:

- `schema`: Juniper has no way to build a schema from SDL, and checks almost nothing when a `RootNode` is built (it panics on a type that is still a placeholder, `src/schema/model.rs:365-367`). Every verdict would be the adapter's SDL handling, not Juniper's.
- `coerce`: not in scope for this adapter.

## Results

From `--strict` runs on the kit in this repository (the sheet's reports are the authority; rerun to refresh):

| Area | Result |
| --- | --- |
| execution | 833 of 1262 distinct well-formed cases satisfy the reference, and 1754 of 11781 cases are malformed (9 distinct malformed cases also break `dataMatches`). `mutation` and `nullPropagation` pass. `noPropagation` is skipped. The kit sent no Int or enum `uncoercible` values and no null for a Non-Null list item or subscription event; the report's `provenance.skipped` counts them. |
| parse | 1957 of 1992 graded vectors agree; 15 vectors with a lone surrogate aren't graded (`unsupported`). |
| validate | 2947 of 3028 graded vectors agree; 52 vectors that need `custom-directives` aren't graded. 4 rule checks and `acceptsValid` fail. |
| introspect | The draft's query is rejected; the kit asks it without what Juniper lacks and grades against the draft (see below). |

`--inline-items` finds the same execution failures except those that need an item to fail by itself. `--no-idle` (grace-based, random runs only) finds the same failures.

## Known Juniper deviations

### Execution

`examples/macros.rs` shows each of these with a macro-built schema, except the item errors, which need a hand-written item type.

- **Fields aren't collected (`callsOnce`, 555 cases).** Juniper doesn't build a grouped field set (§6.3.2). It runs each `Field` selection by itself, fragments included, calling the field's resolver every time (`src/types/async_await.rs:211-296`), and merges the results by response key (`merge_key_into`, `src/types/base.rs:646-672`). In `fragments`, `node.id` is selected directly and again through `...UserFields`, so the `id` resolver runs twice. With macros, `{ node { id ...F } } fragment F on User { id name }` calls `User.id` twice.
- **Error paths have no list indices (`responsePosition`, 784 cases).** An `ExecutionError`'s path is a `Vec<String>` built from the response names of the enclosing fields (`FieldPath`, `src/executor/mod.rs:52-55`, `805-813`). List positions aren't in it. With macros, `{ posts { title } }`, with a failing Non-Null `title`, reports the error at `["posts", "title"]`. A MUST in the draft (§7.1.4), a SHOULD in October 2021.
- **An item that fails by itself is reported at its list's path (`errorsWereRaised`, `errorsInsideNulls`, `errorPathsUnique`, `nullsExplained`).** `resolve_into_list_async` resolves each item with the list's own executor, and `resolve_into_value_async` pushes an item's error at that executor's path, the list field's (`src/executor/mod.rs:537-548`, `src/types/containers.rs:568-570`). So `tags.0` failing is reported at `["tags"]`, where `tags` has a value, and two failing items give two errors with the same path. This is not the missing indices above: even with indices, the error would sit at the list. It needs an item whose own `resolve_async` fails. No built-in container or macro item type can (Juniper has no `GraphQLValue` for `Result`), so it takes a hand-written item type, here the adapter's deferred items. With `--inline-items` these findings go away.
- **An inner list's items are checked against the outer list's item type (`dataMatches`).** `resolve_into_list_async` reads whether items are Non-Null from `executor.current_type()` (`src/types/containers.rs:562-566`), but resolves each item with the same executor (`:569`), so a list inside a list sees the outer list's item type. For `matrix: [[Int!]]!`, an inner item that fails doesn't null the inner list, and the response holds `[[null]]`. With macros, `matrix: Option<Vec<Option<Vec<Post>>>>` (`[[Post!]]`) with a failing `Post.title` gives `{"matrix": [[null]]}`, behind an error path without indices; in the kit's runs, it shows behind the item errors above.
- **A non-finite Float is null without an error (`resultCoercion`, 415 cases).** Juniper's executor puts the `Value` a leaf's `resolve` returns into the response unchanged, and Juniper's `f64` passes a non-finite number through (`src/types/scalars.rs:310-312`). `DefaultScalarValue` derives `Serialize` (`src/value/scalar.rs:752-754`), and `serde_json` writes a non-finite `f64` as `null`, so the client gets `"ratio": null` with no error, where §3.5.2 says it "must raise an execution error". With macros, `fn ratio() -> Option<f64> { Some(f64::INFINITY) }` gives `{"data":{"ratio":null}}`.
- **Subscription errors don't propagate (`dataMatches`, 11 cases).** The generated subscription field turns an event whose resolution recorded any error into an error for the whole root field (`juniper_codegen` `src/common/field/mod.rs:365-368`), and `juniper_subscriptions` then sets that field to `null`, whatever its type (`src/lib.rs:216-222`). An error in a nullable `title` gives `{"postLiked": null}` instead of `{"postLiked": {"likes": 1, "title": null}}`, and an error in the Non-Null root field `postLiked` gives `{"postLiked": null}` instead of `"data": null`.

Not graded, because a typed schema can't produce the input:

- An Int field returns an `i32` and an enum field a Rust enum, so neither can return a value its type can't represent. Juniper's executor wouldn't catch one (it checks no leaf `Value`), but no Juniper schema with matching Rust types can hand it one.
- A null for a Non-Null list item. `resolve_into_list_async` would null the whole list without an error (`src/types/containers.rs:574-576`), but a non-`Option` item type can only be null through propagation, which has already recorded its error.

### Parse

- **The end of a number isn't checked (10 vectors, §2.10.1).** `scan_number` rejects a second `0` only right after a leading `0` (`src/parser/lexer.rs:540-547`), and has no `[lookahead != NameStart]`. So `[01]` and `[-01]` (leading zeros) are accepted, and so are `[0x123]`, `[123L]` and `[1_]`.
- **A `-` after a number's first digit is read into the number (§2.10.1):** `[1-2]` and `[0-0]` are rejected, though they are two numbers each. `scan_number` takes `-` whenever it is at the start or right after the first character (`src/parser/lexer.rs:541`), then the parser gets the token `1-2`.
- **`\"""` in a block string only escapes its first quote (§2.10.4):** `"""\""""""` is rejected and `"""\""""` accepted. In `scan_block_string`, `\` marks the next character only, and the other two quotes count toward the closing `"""` (`src/parser/lexer.rs:417-420`).
- **`\u{…}` takes at most six hex digits (2 vectors, draft only, §2.10.4):** the draft allows leading zeros (`src/parser/lexer.rs:500-506`).
- **`"\uD83D\u{DCA9}"` is accepted as a surrogate pair (1 vector, §2.10.4):** the draft pairs only two fixed-width escapes (`src/parser/lexer.rs:323-341`).
- **An empty selection set is rejected (8 vectors, draft only, §2.5):** `parse_selection_set` uses a non-empty list (`src/parser/document.rs:377`).
- **A variable's default is parsed as the variable's type (1 vector, §2.11):** `query ($a: Int = {k: [1, E, null]}) {a}` is a parse error, because the parser reads an object literal only for an input object or an unknown type (`src/parser/value.rs:24-48`). The grammar doesn't depend on types.
- **A variable in a variable definition's directive is accepted (1 vector, §2.11):** `query ($a: Int @d(x: $b)) {a}`. The directives are parsed with the non-constant `parse_directives` (`src/parser/document.rs:633`).
- **Untested: Int literals outside the `i32` range are rejected.** `{a(x: 2147483648)}` is a parse error (`src/parser/value.rs:204-244`, `src/types/scalars.rs:281-285`). No vector has such a number.

### Validate

- **No rule for Single Root Field (46 vectors, §5.2.4.1), Operation Type Existence (10, draft, §5.2.1.1) or Directives Are Unique per Location (7, §5.7.3).** `visit_all_rules` has no such rules (`src/validation/rules/mod.rs:49-78`). A document whose one operation has no root type isn't executed (see [Other areas](#other-areas)), so the adapter answers `valid: false` for it; with several operations, the one with no root type is accepted.
- **§5.8.5 follows an older algorithm (12 vectors not enforced, 4 draft only; 6 valid vectors rejected).** `VariableInAllowedPosition` makes a variable with any default Non-Null, `= null` included, and ignores the default of the argument or input field it is used for (`src/validation/rules/variables_in_allowed_position.rs:89-95`). So `($v: Int = null) { echo(list: [$v]) }` with `list: [Int!]` is accepted, and `($v: Int) { echo(opt: $v) }` with `opt: Int! = 1` is rejected.

Juniper has only its built-in directives. `SchemaType::add_directive` takes a `DirectiveType` (`src/schema/model.rs:395`, `648`), but that type and `DirectiveLocation` are in the private `schema` module (`pub(crate) mod schema`, `src/lib.rs:52`) and aren't re-exported, so no application can declare one. Custom directives are a MAY (§3.13), so this isn't a deviation: the adapter doesn't claim `custom-directives`, and the vectors that declare or use one aren't graded.

### Introspect

- **What Juniper lacks of the draft's introspection types:** `__Schema.directives` takes no `includeDeprecated` argument (`src/schema/schema.rs:178`), `__Directive` has no `isDeprecated` or `deprecationReason`, and `__DirectiveLocation` has no `DIRECTIVE_DEFINITION` (`src/schema/model.rs:684-692`). So the draft's query is rejected ("Unknown argument "includeDeprecated" on field "directives" of type "__Schema""), and the kit asks it without those fields (`builtinDefinitions`). The rest is the draft's: `includeDeprecated: Boolean! = false` on `fields`, `enumValues`, `inputFields` and `args` (graphql-spec#1142), `@deprecated(reason: String! = "No longer supported")` (graphql-spec#1040), `__InputValue.isDeprecated` and `deprecationReason`, and `__Type.isOneOf`.
- **String defaults aren't escaped (`defaultValue`):** `s: String = "say \"hi\""` gives `"say "hi""`. `default_value_` uses `ToString` (`src/schema/schema.rs:455-456`), and `Scalar`'s `Display` writes a string between quotes as it is (`src/value/scalar.rs:711-718`). §4.2.4 says the default "may" be given as a String encoding in the GraphQL language.
