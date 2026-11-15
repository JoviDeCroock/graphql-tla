"""A graphql-tla adapter for graphql-core (docs/conformance.md).

Every field gets one resolver, which tells the kit it was called and returns
an asyncio future the kit settles. The adapter drives its own event loop:
after each message from the kit it runs the loop until no callback is ready,
then says `idle`, which makes runs deterministic. Nothing else can wake the
loop, because stdin is read outside it and graphql-core sets no timers.

It also answers the kit's other areas (docs/kit-areas.md): parse, validate,
coerce, schema and introspect, in areas.py.

Usage: python adapter.py [--no-idle] [--coroutine-resolvers] [--validate]

--no-idle leaves out `idle`, so the kit falls back to `--grace`.
--coroutine-resolvers makes the resolver an `async def` that sends `call`
only once graphql-core first awaits it, instead of when it is invoked. See
README.md for why that changes the mutation result.
--validate makes the coerce area validate before it executes, and not claim
`unvalidated`.
"""

import asyncio
import inspect
import json
import sys
import traceback
import warnings

import graphql
from graphql import (
    ExecutionResult,
    build_schema,
    execute,
    get_named_type,
    is_enum_type,
    is_list_type,
    is_non_null_type,
    parse,
    subscribe,
)

from areas import AREAS, CAPABILITIES

IDLE = "--no-idle" not in sys.argv[1:]
COROUTINE_RESOLVERS = "--coroutine-resolvers" in sys.argv[1:]


def send(message):
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()


send(
    {
        "type": "hello",
        "protocol": 1,
        "name": f"graphql-core {graphql.__version__}",
        "capabilities": [
            *(["idle"] if IDLE else []),
            "deferred-items",
            "invalid-results",
            "uncoercible-results",
            "mutation",
            "subscription",
            *(c for area, capabilities in CAPABILITIES.items() for c in (area, *capabilities)),
        ],
    }
)


def uncoercible_value(type_):
    """A value the leaf type can't represent: a fraction for an Int, a
    non-finite number for a Float, a name that isn't one of an enum's values."""
    named = get_named_type(type_)
    if is_enum_type(named):
        return "NOT_A_VALUE"
    return 1.2 if named.name == "Int" else float("inf")


def leaf_value(type_):
    """The canonical value a resolver returns for a leaf of this type."""
    named = get_named_type(type_)
    if is_enum_type(named):
        return next(iter(named.values.values())).value
    return {"Int": 1, "Float": 1.5, "Boolean": True}.get(named.name, "v")


def nullable(type_):
    return type_.of_type if is_non_null_type(type_) else type_


loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)
# Abandoned resolvers are never awaited, and gather leaves its other children
# running when one fails, so asyncio would log "exception was never
# retrieved" and "task was destroyed" for futures nobody needs any more.
loop.set_exception_handler(lambda _loop, _context: None)
# graphql-core 3.2 calls every mutation root field's resolver at once and
# chains only the awaiting (see README.md), so once `data` is nulled the later
# fields' completion coroutines are never awaited.
warnings.filterwarnings("ignore", "coroutine .* was never awaited", RuntimeWarning)
# When the garbage collector finalizes one of those coroutines inside a
# namedtuple constructor (graphql-core's `Path`), which runs with empty
# builtins, the warning itself fails with KeyError: '__import__'. Drop that too.
default_unraisablehook = sys.unraisablehook
sys.unraisablehook = lambda unraisable: (
    None if inspect.iscoroutine(unraisable.object) else default_unraisablehook(unraisable)
)

executions = {}


class StreamError(Exception):
    pass


class Execution:
    def __init__(self, id_):
        self.id = id_
        self.calls = {}
        self.next_call = 1
        # `after`: how many settles this execution had applied when a
        # resolver was called, so the kit knows what the engine had seen.
        self.applied = 0
        self.ended = False

    def control(self, path, type_):
        call = self.next_call
        self.next_call += 1
        future = loop.create_future()
        self.calls[call] = (path, type_, future)
        send(
            {
                "type": "call",
                "id": self.id,
                "call": call,
                "path": path,
                "returnType": str(type_),
                "after": self.applied,
            }
        )
        return future

    def resolve(self, _source, info, **_args):
        path = [str(key) for key in info.path.as_list()]
        if COROUTINE_RESOLVERS:

            async def body():
                return await self.control(path, info.return_type)

            return body()
        return self.control(path, info.return_type)


def start(message):
    id_ = message["id"]
    execution = Execution(id_)
    executions[id_] = execution
    if not message.get("errorPropagation", True):
        send({"type": "error", "id": id_, "message": "graphql-core 3.2 can't execute without error propagation"})
        return
    schema = build_schema(message["schema"])
    document = parse(message["document"])
    variables = message.get("variables") or {}

    async def source(_root, _info, **_args):
        # A subscription's source stream yields one event; the root field's
        # resolver then runs on it, as in graphql-js.
        yield {}

    async def run():
        if message["operationType"] != "subscription":
            # Abstract types fall back to graphql-core's default type
            # resolver, which reads `__typename` from a dict. That is also
            # what the subscription's event execution uses, since `subscribe`
            # doesn't pass a type resolver on.
            result = execute(schema, document, variable_values=variables, field_resolver=execution.resolve)
            return await result if inspect.isawaitable(result) else result
        stream = await subscribe(
            schema,
            document,
            variable_values=variables,
            field_resolver=execution.resolve,
            subscribe_field_resolver=source,
        )
        if isinstance(stream, ExecutionResult):
            return stream
        try:
            return await stream.__anext__()
        except Exception as error:
            # The response stream failed instead of yielding the event's
            # result, so the client gets no response.
            raise StreamError(f"{type(error).__name__}: {error}") from error
        finally:
            await stream.aclose()

    async def respond():
        try:
            result = await run()
        except StreamError as error:
            if not execution.ended:
                send({"type": "stream-error", "id": id_, "message": str(error)})
            return
        except Exception:
            send({"type": "error", "id": id_, "message": traceback.format_exc()})
            return
        if not execution.ended:
            send({"type": "response", "id": id_, "response": result.formatted})

    loop.create_task(respond())


def settle(message):
    id_, call, outcome = message["id"], message["call"], message["outcome"]
    execution = executions.get(id_)
    pending = execution.calls.pop(call, None) if execution else None
    if pending is None:
        send({"type": "error", "id": id_, "message": f"no pending call {call}"})
        return
    execution.applied += 1
    path, type_, future = pending
    inner = nullable(type_)
    kind = outcome["kind"]
    if kind == "error":
        future.set_exception(Exception(f"resolver at {'.'.join(path)} failed"))
    elif kind == "null":
        future.set_result(None)
    elif kind == "leaf":
        # A leaf at a list position is the number 1, which isn't iterable.
        future.set_result(1 if is_list_type(inner) else leaf_value(inner))
    elif kind == "uncoercible":
        future.set_result(uncoercible_value(inner))
    elif kind == "object":
        future.set_result({"__typename": outcome["type"]})
    else:
        future.set_result(
            [execution.control([*path, str(i)], inner.of_type) for i in range(outcome["length"])]
        )


async def flush():
    # Run the loop until no callback is ready. While this coroutine runs, the
    # loop's ready queue holds whatever else this iteration still has to run
    # plus everything scheduled since, so an empty queue means graphql-core is
    # blocked on futures only the kit settles. `_ready` is CPython's
    # BaseEventLoop queue; there is no public way to ask.
    running = asyncio.get_running_loop()
    while running._ready:
        await asyncio.sleep(0)


def crash_message(error):
    """The kit reports only the first line, so it names the innermost cause:
    graphql-core wraps an exception from resolving a type's fields in a
    TypeError ("I fields cannot be resolved. ..."). The traceback follows."""
    cause = error
    while cause.__cause__ is not None:
        cause = cause.__cause__
    first = f"{type(cause).__name__}: {cause}".splitlines()[0]
    if cause is not error:
        first += f" (raised as {type(error).__name__})"
    return f"{first}\n{traceback.format_exc()}"


def main():
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        if not line.strip():
            continue
        message = json.loads(line)
        kind = message.get("type")
        if kind in AREAS:
            # One request, one result; `idle` is only for execution. An
            # exception here is a crash, or the adapter's own failure.
            try:
                send({"type": "result", "id": message["id"], **AREAS[kind](message)})
            except Exception as error:
                send({"type": "error", "id": message["id"], "message": crash_message(error)})
            continue
        if kind == "execute":
            try:
                start(message)
            except Exception:
                send({"type": "error", "id": message["id"], "message": traceback.format_exc()})
        elif kind == "settle":
            settle(message)
        elif kind == "end":
            execution = executions.pop(message["id"], None)
            if execution:
                execution.ended = True
            continue
        loop.run_until_complete(flush())
        if IDLE:
            send({"type": "idle", "id": message["id"]})


main()
