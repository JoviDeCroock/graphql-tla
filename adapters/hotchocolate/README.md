# Hot Chocolate adapter

A [graphql-tla adapter](../../docs/conformance.md) for [Hot Chocolate](https://github.com/ChilliCream/graphql-platform) 15.1 (.NET 8).

For each `execute` it builds a request executor from the SDL (cached by SDL) with `AddGraphQL().AddDocumentFromString(sdl)`, and installs:

- one global field middleware (`UseField`) on every non-introspection field, which sends `call` and awaits the kit's `settle`;
- a type interceptor that sets `IsOfType` on every object type, so abstract types resolve to the type the kit named, and gives each subscription field a source stream that yields one event.

The response is the executor's result serialized with Hot Chocolate's JSON result formatter (`ToJson`).

## Build

Needs the .NET 8 SDK.

```shell
cd adapters/hotchocolate
dotnet build -c Release
```

## Run

```shell
node kit/cli.mjs run execution --adapter "adapters/hotchocolate/run.sh"
node kit/cli.mjs run execution --adapter "adapters/hotchocolate/run.sh" --strict
```

`run.sh` uses `$DOTNET_ROOT/dotnet` if `DOTNET_ROOT` is set, otherwise `dotnet` from `PATH`.

Capabilities: `invalid-results`, `uncoercible-results`, `mutation`, `subscription`. Not claimed:

- `deferred-items`: Hot Chocolate completes a list from an `IEnumerable` and doesn't await its items, so items come inline.
- `error-propagation-off`: Hot Chocolate 15 has no switch that disables null propagation for a request. `EnableSemanticNonNull` rewrites the schema instead, and skips `id` fields, mutation fields and the `Node` interface.
- `idle`: resolvers run on the thread pool, so by default the kit waits `--grace` ms (50 ms is plenty: after warm-up the next call arrives within about 1 ms of a settle, worst seen about 20 ms).

`run.sh --idle` claims `idle` anyway, based on thread-pool quiescence (no queued work, no busy worker, no work completed over several samples). That depends on how the .NET runtime schedules Hot Chocolate's work, not on anything Hot Chocolate promises, so it is opt-in. A `call` or `response` sent after `idle` is reported on stderr (none were in a full run, and the kit's determinism replay passed).

Every `call` carries `after`, the number of settles the execution had applied, so `calledSerially` is conclusive for mutations in both modes.

## Known Hot Chocolate deviations

### A null at a Non-Null list item nulls the list without an error

When a list's item type is Non-Null and an item resolves to null, Hot Chocolate nulls the list (or the nearest nullable position) but adds no error. §6.4.3 completes each item with the item type, and a null at a Non-Null position must raise an execution error (§6.4.4), which graphql-js reports at the item's path, such as `["posts", 0]`. The kit reports it as `nullsExplained`:

```
call posts; call tags; settle posts = list(1); call posts.0; settle posts.0 = null; settle tags = list(0)
response: {"data":{"posts":null,"tags":[]}}
```

In Hot Chocolate 15.1.21:
- `Execution/Processing/ValueCompletion.cs` returns null for a null result without reporting anything.
- `ValueCompletion.List.cs` `TryCompleteElement` then returns `list.IsNullable`, so the list is nulled silently.
- The "Cannot return null for non-nullable field" error is only recorded for fields, in `Tasks/ResolverTask.CompleteValue.cs` (`AddNonNullViolation`).

### A fraction returned for an Int is truncated

A resolver that returns `1.2` for an `Int` field gives `1`, not an execution error. §3.5.1 allows coercing a non-integer value only "without losing information", otherwise an execution error must be raised. The kit reports it as `resultCoercion`. A plain Hot Chocolate 15.1.21 server shows the same: with `type Query { count: Int ratio: Float }` and resolvers returning `1.2` and `double.PositiveInfinity`, `{ count ratio }` gives `{"data":{"count":1,"ratio":null}}`, with an error only for `ratio`. A non-finite Float is rejected, as §3.5.2 requires.

