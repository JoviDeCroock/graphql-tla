"""A graphql-tla adapter for graphql-core (docs/conformance.md).

Every field gets one resolver, which tells the kit it was called and returns
an asyncio future the kit settles. The adapter drives its own event loop:
after each message from the kit it runs the loop until no callback is ready,
then says `idle`, which makes runs deterministic. Nothing else can wake the
loop, because stdin is read outside it and graphql-core sets no timers.

It also claims the execution capabilities subscription-stream (the kit drives
a subscription's source stream), parent-values (objects carry the kit's
tokens, and each call reports its parent's), custom-scalar-results and
scalar-results.

It also answers the kit's other areas (docs/kit-areas.md): parse, validate,
coerce, schema, introspect and coordinate, in areas.py.

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
    GraphQLError,
    get_named_type,
    is_enum_type,
    is_list_type,
    is_non_null_type,
    is_scalar_type,
    is_specified_scalar_type,
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
            "subscription-stream",
            "parent-values",
            "custom-scalar-results",
            "scalar-results",
            *(c for area, capabilities in CAPABILITIES.items() for c in (area, *capabilities)),
        ],
    }
)


# What a custom scalar's result coercion rejects (custom-scalar-results).
UNREPRESENTABLE = object()


def uncoercible_value(type_):
    """A value the leaf type can't represent: a fraction for an Int, a
    non-finite number for a Float, a name that isn't one of an enum's values,
    and for a custom scalar a value its result coercion raises on."""
    named = get_named_type(type_)
    if is_enum_type(named):
        return "NOT_A_VALUE"
    if not is_specified_scalar_type(named):
        return UNREPRESENTABLE
    return 1.2 if named.name == "Int" else float("inf")


def coerce_custom_scalars(schema):
    """Custom scalars built from SDL pass every value through. Give each a
    result coercion (`serialize`) that raises on UNREPRESENTABLE, as a custom
    scalar's serializer would on a value it can't represent (§3.5), the way
    graphql-core's own scalars raise a GraphQLError."""
    for type_ in schema.type_map.values():
        if not is_scalar_type(type_) or is_specified_scalar_type(type_) or type_.name.startswith("__"):
            continue

        def serialize(value, name=type_.name):
            if value is UNREPRESENTABLE:
                raise GraphQLError(f"{name} cannot represent this value")
            return value

        type_.serialize = serialize


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


class KitSource:
    """A source stream the kit drives (subscription-stream). `__anext__`
    waits for the kit's `source` messages; `aclose`, graphql-core cancelling
    the stream, is reported as `source-cancelled`."""

    def __init__(self, execution):
        self.execution = execution
        self.queue = []
        self.waiter = None
        self.over = False

    def push(self, item):
        if self.over:
            return
        if self.waiter is not None and not self.waiter.done():
            self.waiter.set_result(item)
            self.waiter = None
        else:
            self.queue.append(item)

    def answer(self, item):
        if "error" in item:
            self.over = True
            raise item["error"]
        if item.get("done"):
            self.over = True
            raise StopAsyncIteration
        return item["value"]

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self.queue:
            return self.answer(self.queue.pop(0))
        if self.over:
            raise StopAsyncIteration
        self.waiter = loop.create_future()
        return self.answer(await self.waiter)

    async def aclose(self):
        if not self.over and not self.execution.ended:
            send({"type": "source-cancelled", "id": self.execution.id})
        self.over = True
        self.queue.clear()
        if self.waiter is not None and not self.waiter.done():
            self.waiter.set_result({"done": True})
        self.waiter = None


class Execution:
    def __init__(self, id_, parent_values):
        self.id = id_
        self.calls = {}
        self.next_call = 1
        # `after`: how many settles this execution had applied when a
        # resolver was called, so the kit knows what the engine had seen.
        self.applied = 0
        self.ended = False
        # parent-values: each call reports the token of the object its
        # resolver was given.
        self.parent_values = parent_values
        # subscription-stream: the kit's source, graphql-core's response
        # stream, and whether that stream has completed.
        self.source = None
        self.stream = None
        self.completed = False

    def control(self, path, type_, parent=None):
        """Tells the kit a resolver was called, and returns the future its
        `settle` completes. `parent` is the token of the resolver's object,
        given only with parent-values, and never for a list item."""
        call = self.next_call
        self.next_call += 1
        future = loop.create_future()
        self.calls[call] = (path, type_, future)
        message = {
            "type": "call",
            "id": self.id,
            "call": call,
            "path": path,
            "returnType": str(type_),
            "after": self.applied,
        }
        if parent is not None:
            message["parent"] = parent[0]
        send(message)
        return future

    def resolve(self, source, info, **_args):
        path = [str(key) for key in info.path.as_list()]
        # parent-values: the token of the object graphql-core gave the
        # resolver (null if it got something without one).
        parent = ((source.get("token") if isinstance(source, dict) else None),) if self.parent_values else None
        if COROUTINE_RESOLVERS:

            async def body():
                return await self.control(path, info.return_type, parent)

            return body()
        return self.control(path, info.return_type, parent)


def start(message):
    id_ = message["id"]
    parent_values = "initialValue" in message
    execution = Execution(id_, parent_values)
    executions[id_] = execution
    if not message.get("errorPropagation", True):
        send({"type": "error", "id": id_, "message": "graphql-core 3.2 can't execute without error propagation"})
        return
    schema = build_schema(message["schema"])
    coerce_custom_scalars(schema)
    document = parse(message["document"])
    variables = message.get("variables") or {}
    # parent-values: the root value carries the kit's initial value token.
    root_value = {"token": message["initialValue"]} if parent_values else None

    def respond(result):
        send({"type": "response", "id": id_, "response": result.formatted})

    if message["operationType"] == "subscription" and message.get("stream"):
        # subscription-stream: the source stream is the kit's. Every result
        # the response stream yields is reported, then how it ended.
        execution.source = KitSource(execution)

        async def consume():
            try:
                stream = await subscribe(
                    schema,
                    document,
                    root_value=root_value,
                    variable_values=variables,
                    field_resolver=execution.resolve,
                    subscribe_field_resolver=lambda _root, _info, **_args: execution.source,
                )
            except Exception:
                send({"type": "error", "id": id_, "message": traceback.format_exc()})
                return
            if isinstance(stream, ExecutionResult):
                if not execution.ended:
                    respond(stream)
                return
            execution.stream = stream
            while True:
                try:
                    result = await stream.__anext__()
                except StopAsyncIteration:
                    if not execution.completed and not execution.ended:
                        send({"type": "done", "id": id_})
                    execution.completed = True
                    return
                except Exception as error:
                    if not execution.completed and not execution.ended:
                        send({"type": "stream-error", "id": id_, "message": f"{type(error).__name__}: {error}"})
                    execution.completed = True
                    return
                if execution.ended:
                    return
                respond(result)

        loop.create_task(consume())
        return

    async def source(_root, _info, **_args):
        # A subscription's source stream yields one event; the root field's
        # resolver then runs on it, as in graphql-js.
        yield {"token": message.get("event")} if parent_values else {}

    async def run():
        if message["operationType"] != "subscription":
            # Abstract types fall back to graphql-core's default type
            # resolver, which reads `__typename` from a dict. That is also
            # what the subscription's event execution uses, since `subscribe`
            # doesn't pass a type resolver on.
            result = execute(
                schema, document, root_value=root_value, variable_values=variables, field_resolver=execution.resolve
            )
            return await result if inspect.isawaitable(result) else result
        stream = await subscribe(
            schema,
            document,
            root_value=root_value,
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

    async def answer():
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
            respond(result)

    loop.create_task(answer())


def source_message(message):
    """The kit's source stream emits, completes or fails."""
    execution = executions.get(message["id"])
    if execution is None or execution.source is None:
        send({"type": "error", "id": message["id"], "message": "no streamed subscription to drive"})
        return
    action = message.get("action")
    if action == "emit":
        execution.source.push({"value": {"token": message["token"]} if "token" in message else {}})
    elif action == "complete":
        execution.source.push({"done": True})
    elif action == "fail":
        execution.source.push({"error": Exception(message.get("message", "the source stream failed"))})
    else:
        send({"type": "error", "id": message["id"], "message": f"unknown source action {action}"})


def cancel(message):
    """The client cancels the response stream: `aclose()`. Once it returns,
    the client sees the stream complete."""
    execution = executions.get(message["id"])
    if execution is None or execution.stream is None:
        send({"type": "error", "id": message["id"], "message": "no response stream to cancel"})
        return

    async def close():
        try:
            await execution.stream.aclose()
        except Exception as error:
            if not execution.completed and not execution.ended:
                send({"type": "stream-error", "id": execution.id, "message": f"{type(error).__name__}: {error}"})
            execution.completed = True
            return
        if not execution.completed and not execution.ended:
            send({"type": "done", "id": execution.id})
        execution.completed = True

    loop.create_task(close())


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
    elif kind == "leaf" and "value" in outcome:
        # scalar-results: the internal value the kit names, as it is.
        future.set_result(outcome["value"])
    elif kind == "leaf":
        # A leaf at a list position is the number 1, which isn't iterable.
        future.set_result(1 if is_list_type(inner) else leaf_value(inner))
    elif kind == "uncoercible":
        future.set_result(uncoercible_value(inner))
    elif kind == "object":
        value = {"__typename": outcome["type"]}
        if "token" in outcome:
            value["token"] = outcome["token"]
        future.set_result(value)
    else:
        future.set_result(
            [execution.control([*path, str(i)], inner.of_type) for i in range(outcome["length"])]
        )


def close(execution):
    """The streamed subscription's response stream, which may still be open
    when the kit is done with it: closed quietly."""
    if execution.stream is not None and not execution.completed:

        async def quietly():
            try:
                await execution.stream.aclose()
            except Exception:
                pass

        loop.create_task(quietly())


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
        elif kind == "source":
            source_message(message)
        elif kind == "cancel":
            cancel(message)
        elif kind == "end":
            execution = executions.pop(message["id"], None)
            if execution:
                execution.ended = True
                close(execution)
                loop.run_until_complete(flush())
            continue
        loop.run_until_complete(flush())
        if IDLE:
            send({"type": "idle", "id": message["id"]})


main()
