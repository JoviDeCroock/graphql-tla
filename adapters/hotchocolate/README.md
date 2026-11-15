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

Capabilities: `invalid-results`, `mutation`, `subscription`. Not claimed:

- `deferred-items`: Hot Chocolate completes a list from an `IEnumerable` and doesn't await its items, so items come inline.
- `error-propagation-off`: Hot Chocolate 15 has no switch that disables null propagation for a request. `EnableSemanticNonNull` rewrites the schema instead, and skips `id` fields, mutation fields and the `Node` interface.
- `idle`: resolvers run on the thread pool, so by default the kit waits `--grace` ms (50 ms is plenty: after warm-up the next call arrives within about 1 ms of a settle, worst seen about 20 ms).

`run.sh --idle` claims `idle` anyway, based on thread-pool quiescence (no queued work, no busy worker, no work completed over several samples). That depends on how the .NET runtime schedules Hot Chocolate's work, not on anything Hot Chocolate promises, so it is opt-in. A `call` or `response` sent after `idle` is reported on stderr (none were in a full run, and the kit's determinism replay passed).

Every `call` carries `after`, the number of settles the execution had applied, so `calledSerially` is conclusive for mutations in both modes.
