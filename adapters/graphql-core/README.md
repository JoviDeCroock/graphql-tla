# graphql-core adapter

A [graphql-tla conformance adapter](../../docs/conformance.md) for
[graphql-core](https://github.com/graphql-python/graphql-core) 3.2.14, the
Python port of graphql-js.

## Setup

Needs Python 3.10 or later. `requirements.txt` pins graphql-core, which is the
only dependency. The virtualenv lives in the adapter directory and is
gitignored.

```shell
cd adapters/graphql-core
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Run

```shell
node kit/cli.mjs run execution --adapter "adapters/graphql-core/run.sh"
node kit/cli.mjs run execution --adapter "adapters/graphql-core/run.sh" --strict
```

`run.sh` runs `adapter.py` with `.venv/bin/python`.

`--no-idle` leaves out `idle`, so the kit falls back to `--grace`.
`--coroutine-resolvers` is described under the
[deviation](#known-graphql-core-deviation).

## How it works

The adapter mirrors the [graphql-js adapter](../graphql-js/adapter.mjs). The
schema is built with `build_schema`, and `execute` gets one `field_resolver`
for every field. The resolver sends `call`, stamped with `after` (the settles
applied so far), and returns an asyncio future that the kit's `settle`
completes. An object is a dict with `__typename`, which graphql-core's
`default_type_resolver` reads for abstract types.

The adapter owns its event loop and reads stdin outside it, with a blocking
`readline`. After each message it runs the loop until the loop's ready queue
is empty, then sends `idle`. Nothing else can wake the loop: there is no I/O
on it and graphql-core sets no timers.

Capabilities:

- `idle`: as above. The check reads `loop._ready`, CPython's queue of ready
  callbacks, since asyncio has no public way to ask whether anything is
  runnable. The kit's determinism replay passed, and a `--no-idle` run found
  the same failure.
- `deferred-items`: a list of futures works. `complete_list_value` awaits each
  item that `is_awaitable` (`execute.py`, line 886).
- `invalid-results`: wrong-shape values become field errors. `1` for a list
  isn't iterable, `Int`, `Float` and `Boolean` don't serialize a dict, and a
  `__typename` that isn't a possible type fails runtime type checking.
- `mutation`: graphql-core's `execute_fields_serially`. It fails
  `calledSerially`, see below.
- `subscription`: `subscribe` with a `subscribe_field_resolver` that is an
  async generator yielding one event (`{}`). As in graphql-js, the root
  field's resolver then runs on the event and is the root `call`.
  `subscribe` passes no type resolver to the event's execution, which is one
  reason the adapter relies on the default type resolver everywhere.
- `error-propagation-off` isn't claimed. graphql-core 3.2 has no switch for
  it and doesn't know `@experimental_disableErrorPropagation`.

## Known graphql-core deviation

graphql-core 3.2 calls the resolver of every mutation root field before the
previous root field has completed, which §6.3.4 forbids. The kit reports it
as `calledSerially` on every mutation case. The shortest:

```
trace:    call first; call second; call third; settle first = null; settle second = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Mutation.second.", ...,"path":["second"]}]}
```

All three calls carry `after: 0`: graphql-core had seen no settle when it
called `second` and `third`.

`ExecutionContext.execute_fields_serially`
([`src/graphql/execution/execute.py`](https://github.com/graphql-python/graphql-core/blob/v3.2.14/src/graphql/execution/execute.py#L518-L572),
line 536) calls `self.execute_field` for each root field inside a plain `for`
loop. `execute_field` invokes the resolver straight away. Only awaiting the
results is chained (`await_and_set_result`, line 548). graphql-js's
`executeFieldsSerially` instead calls `executeField` from a `promiseReduce`
callback, which runs only after the previous field's promise has resolved
(`src/execution/execute.ts` in 16, `src/execution/Executor.ts` in 17).
graphql-core 3.3 does the same
with `async_reduce`
([`src/graphql/execution/executor.py`](https://github.com/graphql-python/graphql-core/blob/v3.3.2/src/graphql/execution/executor.py#L813-L861)).

Whether a user sees this depends on what the resolver does when it is called:

- An `async def` resolver only creates a coroutine, which doesn't run until
  graphql-core awaits it, and that happens in order. So its body runs
  serially. `run.sh --coroutine-resolvers` makes the adapter's resolver an
  `async def` that sends `call` once it first runs, and with it every case
  passes, mutations included.
- A resolver that does work before it returns runs early: one that returns a
  future or a task (for example a DataLoader's `load`, `asyncio.create_task`
  or `run_in_executor`), or a synchronous resolver, whose side effects happen
  while an earlier root field's sub-selection is still pending. When a later
  root field nulls `data`, the resolvers after it have still been called,
  though their results are never awaited.
