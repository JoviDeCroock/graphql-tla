# Juniper adapter

A [graphql-tla adapter](../../docs/conformance.md) for [Juniper](https://github.com/graphql-rust/juniper) 0.18.0 (the `juniper` crate), with `juniper_subscriptions` 0.19.0 for subscription responses.

Source references below are to `juniper` 0.18.0 (`src/...`), `juniper_codegen` 0.18.0 and `juniper_subscriptions` 0.19.0, as published on crates.io.

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

`examples/macros.rs` reproduces the execution findings with an ordinary schema built with `#[graphql_object]` and `#[graphql_subscription]`, with no adapter code involved:

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
- an enum value is `Value::scalar(name)`, which is what a derived `GraphQLEnum` returns, and a custom scalar's value is `"v"`.

Queries and mutations run through `juniper::http::GraphQLRequest::execute`, and the response is the `GraphQLResponse` serialized with `serde_json`, as Juniper's HTTP integrations send it. Juniper itself runs a mutation's root fields serially (`Executor::serial`, `src/executor/mod.rs:76-83`, `src/types/async_await.rs:427`).

If the task panics, the client gets no response, and the adapter sends `no-response`. No run has panicked.

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
- `uncoercible-results`: Juniper completes a leaf with whatever `Value` its Rust type's `resolve` returns, and checks nothing. The adapter returns `f64::INFINITY` through Juniper's `f64`, an enum name that isn't a value through the enum (as a derived enum's `resolve` would), and `Value::scalar(1.2)` for an Int. Only the Float can come from a macro-built schema: an `i32` can't hold 1.2, and a Rust enum can't hold an unknown name. See below.
- `mutation`: Juniper's own serial execution.
- `subscription`: the subscription root field is resolved as `#[graphql_subscription]` generates it (`juniper_codegen` `src/common/field/mod.rs:318-380`): the field returns its source stream, and each item is resolved with an owned executor. The stream's request for its one event is the root `call`, and the settled outcome is the event. The response is the first `ExecutionOutput` of a `juniper_subscriptions::Coordinator` connection, serialized with `serde_json`, which is what `juniper_graphql_ws` sends as a payload.

Not claimed:

- `invalid-results`: a Juniper resolver returns a Rust value whose shape the type system fixes: a `Vec` for a list, a union or interface enum whose variants are the possible types, an `i32` for an Int. Juniper's executor never checks a result's shape, so the adapter would have to make up a `Value` of the wrong shape, and the run would test the adapter, not Juniper.
- `error-propagation-off`: Juniper has no option for it.

## Other areas

The adapter claims `parse`, `validate` and `introspect`.

- **parse:** `juniper::parser::parse_document_source`, which `ValidatedOperation::new` calls for every request (`src/executor/validated_operation.rs`). Juniper's parser needs a schema: it reads a scalar literal as the type of the argument it's given to, and when that isn't known, by its token, which needs a scalar of that name in the schema (`src/parser/value.rs:204-244`). Against a schema without a Float type, `{a(x: 1.5)}` is a parse error. So the parse schema declares every built-in scalar: `type Query { a: Int b: Float c: String d: Boolean e: ID }`. Juniper's parser only reads operations and fragments, so type system definitions are rejected. A source with a lone surrogate can't be read into a Rust string, so it never reaches Juniper, and the answer is `ok: false`.
- **validate:** the kit's schema built as for execution, then `parse_document_source`, `ValidatorContext::new` and `visit_all_rules`, which is what `ValidatedOperation::new` runs. A parse error is `valid: false`.
- **introspect:** the schema built as for execution, then the kit's query through `GraphQLRequest::execute`.

Not claimed:

- `schema`: Juniper has no way to build a schema from SDL, and checks almost nothing when a `RootNode` is built (it panics on a type that is still a placeholder, `src/schema/model.rs:365-367`). Every verdict would be the adapter's SDL handling, not Juniper's.
- `coerce`: not in scope for this adapter.

## Results

From full `--strict` runs:

| Area | Result |
| --- | --- |
| execution | 851 of 1573 distinct well-formed cases satisfy the reference, and 2663 of 12160 cases are malformed. `mutation` and `nullPropagation` pass. `noPropagation` is skipped. |
| parse | 1951 of 1983 vectors agree. 6 checks fail; 10 of the 32 failing vectors rely on the draft. |
| validate | 2971 of 3079 graded vectors agree; 39 of the 108 failing vectors rely on the draft. 4 rule checks and `acceptsValid` fail. |
| introspect | The draft's query is rejected; the October 2021 query is answered and 28 vectors are graded under the October 2021 profile. 5 MUST checks fail. |

`--inline-items` (919 distinct cases) finds the same execution failures except those that need an item to fail by itself. `--no-idle` (grace-based, random runs only) finds the same failures.

## Known Juniper deviations

### Execution

`examples/macros.rs` shows every finding but the fourth with a macro-built schema.

- **Fields aren't collected (`callsOnce`, 555 cases).** Juniper doesn't build a grouped field set (§6.3.2). It runs each `Field` selection by itself, fragments included, calling the field's resolver every time (`src/types/async_await.rs:211-296`), and merges the results by response key (`merge_key_into`, `src/types/base.rs:646-672`). In `fragments`, `node.id` is selected directly and again through `...UserFields`, so the `id` resolver runs twice. With macros, `{ node { id ...F } } fragment F on User { id name }` calls `User.id` twice.
- **Error paths have no list indices (`responsePosition`, 743 cases; also `errorsWereRaised`, `errorPathsUnique`, `errorsInsideNulls`).** An `ExecutionError`'s path is a `Vec<String>` built from the response names of the enclosing fields (`FieldPath`, `src/executor/mod.rs:52-55`, `805-813`). List positions aren't in it. With macros, `{ posts { title } }`, with a failing Non-Null `title`, reports the error at `["posts", "title"]`. An item that fails is reported at the list's path (`resolve_into_value_async`, `src/executor/mod.rs:537-548`), so two failing items give two errors with the same path.
- **An inner list's items are checked against the outer list's item type (`dataMatches`).** `resolve_into_list_async` reads whether items are Non-Null from `executor.current_type()` (`src/types/containers.rs:562-566`), but resolves each item with the same executor (`:569`), so a list inside a list sees the outer list's item type. For `matrix: [[Int!]]!`, an inner `null` item doesn't null the inner list, and the response holds `[[null]]`. With macros, `matrix: Option<Vec<Option<Vec<Post>>>>` (`[[Post!]]`) with a failing `Post.title` gives `{"matrix": [[null]]}`.
- **A null item in a Non-Null position nulls the list without an error (`nullsExplained`).** `resolve_into_list_async` returns `null` for the whole list (`src/types/containers.rs:574-576`) and records nothing; the field-level check (`push_non_null_violation_at`) only sees the list, which is nullable. An item that is null because one of its own fields failed already has that error, so this only shows when the item value itself is null, which a macro-built `Vec<Post>` can't hold. It takes a hand-written `GraphQLValue`, as here.
- **Leaf results aren't coerced (`resultCoercion` 402 cases, `intFraction` 403, `leafValues` 403; `nullsExplained` for the Float).** Juniper's executor puts the `Value` a leaf's `resolve` returns into the response unchanged. Leaf coercion is the Rust type's job, and Juniper's `f64` passes a non-finite number through (`src/types/scalars.rs`, `impl_float_scalar::to_output`). `DefaultScalarValue` derives `Serialize` (`src/value/scalar.rs:752-754`), and `serde_json` writes a non-finite `f64` as `null`, so the client gets `"ratio": null` with no error. That one is in any Juniper schema: with macros, `fn ratio() -> Option<f64> { Some(f64::INFINITY) }` gives `{"data":{"ratio":null}}`. The Int fraction and the unknown enum name pass through too, but only a hand-written `GraphQLValue` can return them.
- **A subscription response always has `errors` (`errorsList`, 605 cases).** `ExecutionOutput` serializes `errors` even when it's empty (`src/types/subscriptions.rs:14-21`), and `juniper_subscriptions` builds each event's output with `ExecutionOutput::from_data` (`src/lib.rs:146`), so every error-free event is `{"data": ..., "errors": []}` (§7.1.1).
- **Subscription errors don't propagate (`dataMatches`, 11 cases).** The generated subscription field turns an event whose resolution recorded any error into an error for the whole root field (`juniper_codegen` `src/common/field/mod.rs:365-368`), and `juniper_subscriptions` then sets that field to `null`, whatever its type (`src/lib.rs:216-222`). An error in a nullable `title` gives `{"postLiked": null}` instead of `{"postLiked": {"likes": 1, "title": null}}`, and an error in the Non-Null root field `postLiked` gives `{"postLiked": null}` instead of `"data": null`.

### Parse

- **Leading zeros are accepted (10 vectors, §2.10.1):** `[01]`. `scan_number` only rejects a `0` right after a leading `0` (`src/parser/lexer.rs:540-547`).
- **A `-` after a number's first digit is read into the number (2 vectors, §2.10.1, §2.10.2):** `[1-2]` and `[0-0]` are rejected, though they are two numbers each. `scan_number` takes `-` whenever it is at the start or right after the first character (`src/parser/lexer.rs:541`), then the parser gets the token `1-2`.
- **`\"""` in a block string only escapes its first quote (10 vectors, §2.10.4, §2.1.5; 2 draft only):** `"""\""""""` is rejected and `"""\""""` accepted. In `scan_block_string`, `\` marks the next character only, and the other two quotes count toward the closing `"""` (`src/parser/lexer.rs:412-416`).
- **An empty selection set is rejected (8 vectors, draft only, §2.5):** `parse_selection_set` uses a non-empty list (`src/parser/document.rs:377`).
- **A variable's default is parsed as the variable's type (1 vector, §2.11):** `query ($a: Int = {k: [1, E, null]}) {a}` is a parse error, because the parser reads an object literal only for an input object or an unknown type (`src/parser/value.rs:24-48`). The grammar doesn't depend on types.
- **A variable in a variable definition's directive is accepted (1 vector, §2.11):** `query ($a: Int @d(x: $b)) {a}`. The directives are parsed with the non-constant `parse_directives` (`src/parser/document.rs:633`).

### Validate

- **No rule for Single Root Field (46 vectors, 23 of them draft only, §5.2.4.1), Operation Type Existence (12, draft, §5.2.1.1) or Directives Are Unique per Location (7, §5.7.3).** `visit_all_rules` has no such rules (`src/validation/rules/mod.rs:49-78`). A mutation against a schema without a mutation type passes validation and fails at execution with `GraphQLError::NotSupported` (`src/executor/validated_operation.rs:314-315`).
- **§5.8.5 follows an older algorithm (12 vectors not enforced, 4 draft only; 6 valid vectors rejected).** `VariableInAllowedPosition` makes a variable with any default Non-Null, `= null` included, and ignores the default of the argument or input field it is used for (`src/validation/rules/variables_in_allowed_position.rs:89-95`). So `($v: Int = null) { echo(list: [$v]) }` with `list: [Int!]` is accepted, and `($v: Int) { echo(opt: $v) }` with `opt: Int! = 1` is rejected.
- **Directives declared in the SDL can't exist (25 valid vectors rejected with "Unknown directive").** Juniper has only its built-in directives. `SchemaType::add_directive` takes a `DirectiveType` (`src/schema/model.rs:395`, `648`), but that type and `DirectiveLocation` are in the private `schema` module (`pub(crate) mod schema`, `src/lib.rs:52`) and aren't re-exported, so no application can make one. The kit's `@tag` and `@once` are unknown to `KnownDirectives` (`src/validation/rules/known_directives.rs:160`).

### Introspect

- **The draft's query is rejected:** "Unknown argument "includeDeprecated" on field "directives" of type "__Schema"" (`__Schema.directives` takes no argument, `src/schema/schema.rs:178`). The kit grades the October 2021 query.
- **The built-in definitions mix editions (`builtinDefinitions`, 18 of 28):** `__InputValue.isDeprecated` and `includeDeprecated` on `args` and `inputFields` come from the draft; `includeDeprecated` is `Boolean!` rather than `Boolean = false` (a Rust `bool` with a default, `src/schema/schema.rs:221`, `321`, `345`, `410`); and `@deprecated(reason:)` is `String!` (`src/schema/model.rs:688-690`).
- **String defaults aren't escaped (`defaultValue`, 3):** `s: String = "say \"hi\""` gives `"say "hi""`. `Scalar`'s `Display` writes a string between quotes as it is (`src/value/scalar.rs:711-718`).
- **No directives of the schema's own (`directives`, 4; `builtinScalars` 2; `typeByName` 1):** see validate. Without the directive, a built-in scalar only its arguments use, such as `Float` for `directive @d(f: Float)`, isn't in the schema either.
