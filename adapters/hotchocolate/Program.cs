// A graphql-tla adapter for Hot Chocolate (docs/conformance.md).
//
// Every field gets one field middleware, which tells the kit it was called
// and awaits a TaskCompletionSource that the stdin reader completes when the
// kit settles that call.
//
// Usage: run.sh [--idle] [--introspection-list-depth N]
//
// The kit's other areas are answered in Areas.cs. --introspection-list-depth
// raises Hot Chocolate's introspection depth limit (see AreaSchemas).
//
// Hot Chocolate runs resolvers on the thread pool, so by default the adapter
// doesn't claim `idle` and the kit falls back to --grace. With --idle, after
// each message from the kit the adapter waits until the thread pool is
// quiescent (no queued work items, no busy workers, no work items completed
// over several samples) and then says `idle`. That relies on all of Hot
// Chocolate's execution work running as thread-pool work items, with no
// timers; it is a runtime-level heuristic, not something Hot Chocolate
// promises. Any `call` or `response` sent after `idle` and before the kit's
// next message is reported on stderr as a broken idle.

using System.Collections.Concurrent;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using GraphQLTla.HotChocolate;
using HotChocolate;
using HotChocolate.Execution;
using HotChocolate.Language;
using HotChocolate.Types;
using Microsoft.Extensions.DependencyInjection;

var output = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
var writeLock = new object();
var idle = args.Contains("--idle");
var depthFlag = Array.IndexOf(args, "--introspection-list-depth");
if (depthFlag >= 0) AreaSchemas.IntrospectionListDepth = ushort.Parse(args[depthFlag + 1]);
var idleSent = false; // guarded by writeLock
var brokenIdles = 0;
void Send(JsonObject message)
{
    var line = message.ToJsonString();
    lock (writeLock)
    {
        if (idleSent && message["type"]?.GetValue<string>() is "call" or "response")
        {
            brokenIdles++;
            Console.Error.WriteLine($"hotchocolate adapter: broken idle ({brokenIdles}): {line}");
        }
        if (message["type"]?.GetValue<string>() == "idle") idleSent = true;
        output.Write(line + "\n");
    }
}

var executions = new ConcurrentDictionary<int, Execution>();
var executors = new ConcurrentDictionary<string, Lazy<Task<IRequestExecutor>>>();

Task<IRequestExecutor> ExecutorFor(string sdl) =>
    executors.GetOrAdd(sdl, s => new Lazy<Task<IRequestExecutor>>(() => Schemas.BuildAsync(s))).Value;

// Warm the JIT up before saying hello, so the first executions don't pause
// for much longer than the kit's grace between calls.
// Block rather than await, so the stdin loop below stays on the main thread
// and never occupies a thread-pool worker (see Quiescence).
Schemas.WarmUpAsync().GetAwaiter().GetResult();

var version = typeof(IRequestExecutor).Assembly
    .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion?.Split('+')[0] ?? "?";
Send(new JsonObject
{
    ["type"] = "hello",
    ["protocol"] = 1,
    ["name"] = $"Hot Chocolate {version}",
    ["capabilities"] = Capabilities(),
});

JsonArray Capabilities()
{
    var capabilities = new JsonArray();
    if (idle) capabilities.Add("idle");
    foreach (var c in new[] { "invalid-results", "uncoercible-results", "mutation", "subscription" }) capabilities.Add(c);
    foreach (var area in Areas.Names) capabilities.Add(area);
    foreach (var c in Areas.Capabilities) capabilities.Add(c);
    return capabilities;
}

async Task StartAsync(JsonElement message)
{
    var id = message.GetProperty("id").GetInt32();
    try
    {
        if (message.TryGetProperty("errorPropagation", out var ep) && ep.ValueKind == JsonValueKind.False)
        {
            throw new NotSupportedException("Hot Chocolate can't execute without error propagation");
        }

        var executor = await ExecutorFor(message.GetProperty("schema").GetString()!);
        var execution = new Execution(id, Send);
        executions[id] = execution;

        var variables = new Dictionary<string, object?>();
        if (message.TryGetProperty("variables", out var vars) && vars.ValueKind == JsonValueKind.Object)
        {
            foreach (var p in vars.EnumerateObject()) variables[p.Name] = Values.ToValueNode(p.Value);
        }

        var request = OperationRequestBuilder.New()
            .SetDocument(message.GetProperty("document").GetString()!)
            .SetVariableValues(variables)
            .SetGlobalState(Execution.Key, execution)
            .Build();

        var result = await executor.ExecuteAsync(request);
        string json;
        if (result is IResponseStream stream)
        {
            // A subscription: the source stream yields one event, and the
            // response is the result of executing the selection set for it.
            IOperationResult? first = null;
            await foreach (var r in stream.ReadResultsAsync())
            {
                first = r;
                break;
            }
            json = first is null ? throw new InvalidOperationException("the subscription yielded no result") : first.ToJson(false);
            await stream.DisposeAsync();
        }
        else
        {
            json = result.ToJson(false);
            await result.DisposeAsync();
        }

        if (!execution.Ended)
        {
            Send(new JsonObject { ["type"] = "response", ["id"] = id, ["response"] = JsonNode.Parse(json) });
        }
    }
    catch (Exception error)
    {
        Send(new JsonObject { ["type"] = "error", ["id"] = id, ["message"] = error.ToString() });
    }
}

string? line;
while ((line = Console.In.ReadLine()) is not null)
{
    if (string.IsNullOrWhiteSpace(line)) continue;
    lock (writeLock) idleSent = false;
    using var doc = JsonDocument.Parse(line);
    var message = doc.RootElement.Clone();
    var type = message.GetProperty("type").GetString();
    if (type == "execute")
    {
        _ = Task.Run(() => StartAsync(message));
    }
    else if (type == "settle")
    {
        var id = message.GetProperty("id").GetInt32();
        var call = message.GetProperty("call").GetInt32();
        if (!executions.TryGetValue(id, out var execution) || !execution.Settle(call, message.GetProperty("outcome")))
        {
            Send(new JsonObject { ["type"] = "error", ["id"] = id, ["message"] = $"no pending call {call}" });
        }
    }
    else if (type == "end")
    {
        var id = message.GetProperty("id").GetInt32();
        if (executions.TryRemove(id, out var execution)) execution.End();
        continue;
    }
    else if (Areas.Names.Contains(type))
    {
        // The other areas (docs/kit-areas.md): one answer per request, on
        // this thread, and no `idle`, which only execution uses.
        Send(Areas.Answer(type!, message.GetProperty("id").GetInt32(), message));
        continue;
    }
    else
    {
        Send(new JsonObject { ["type"] = "error", ["id"] = message.GetProperty("id").GetInt32(), ["message"] = $"unknown message type {type}" });
        continue;
    }
    if (idle)
    {
        Quiescence.Wait();
        Send(new JsonObject { ["type"] = "idle", ["id"] = message.GetProperty("id").GetInt32() });
    }
}

namespace GraphQLTla.HotChocolate
{
    // Waits, on the stdin thread (not a pool thread), until the thread pool
    // has had no queued work, no busy worker and no completed work item for
    // several consecutive samples.
    public static class Quiescence
    {
        public static void Wait()
        {
            ThreadPool.GetMaxThreads(out var maxWorkers, out _);
            long lastCompleted = -1;
            var stable = 0;
            var spin = new SpinWait();
            while (stable < 5)
            {
                ThreadPool.GetAvailableThreads(out var availableWorkers, out _);
                var busy = maxWorkers - availableWorkers;
                var pending = ThreadPool.PendingWorkItemCount;
                var completed = ThreadPool.CompletedWorkItemCount;
                stable = busy == 0 && pending == 0 && completed == lastCompleted ? stable + 1 : 0;
                lastCompleted = completed;
                if (stable > 0) Thread.Sleep(1); else spin.SpinOnce(sleep1Threshold: -1);
            }
        }
    }

    // An object whose runtime type the kit chose.
    public sealed record TlaObject(string TypeName);

    // One execution: the resolver calls it has sent and not yet settled.
    public sealed class Execution(int id, Action<JsonObject> send)
    {
        public const string Key = "graphql-tla.execution";

        private sealed record Pending(IType Type, TaskCompletionSource<object?> Result);

        private readonly ConcurrentDictionary<int, Pending> _calls = new();
        private int _nextCall;
        private int _applied;
        private volatile bool _ended;

        public bool Ended => _ended;

        public Task<object?> Call(IReadOnlyList<object> path, IType type)
        {
            var call = Interlocked.Increment(ref _nextCall);
            var result = new TaskCompletionSource<object?>(TaskCreationOptions.RunContinuationsAsynchronously);
            _calls[call] = new Pending(type, result);
            var jsonPath = new JsonArray();
            foreach (var segment in path) jsonPath.Add(segment is int i ? JsonValue.Create(i) : JsonValue.Create(segment.ToString()));
            send(new JsonObject
            {
                ["type"] = "call",
                ["id"] = id,
                ["call"] = call,
                ["path"] = jsonPath,
                ["returnType"] = type.Print(),
                // How many settles this execution had applied when the
                // resolver was called (late, never early, on any thread).
                ["after"] = Volatile.Read(ref _applied),
            });
            return result.Task;
        }

        public bool Settle(int call, JsonElement outcome)
        {
            if (!_calls.TryRemove(call, out var pending)) return false;
            Interlocked.Increment(ref _applied);
            if (outcome.GetProperty("kind").GetString() == "error")
            {
                pending.Result.SetException(new GraphQLException(
                    ErrorBuilder.New().SetMessage($"resolver call {call} failed").Build()));
            }
            else
            {
                pending.Result.SetResult(Values.FromOutcome(outcome, pending.Type));
            }
            return true;
        }

        // The kit is done with this execution; anything pending is abandoned.
        public void End()
        {
            _ended = true;
            foreach (var call in _calls.Keys)
            {
                if (_calls.TryRemove(call, out var pending)) pending.Result.TrySetCanceled();
            }
        }
    }

    public static class Values
    {
        // The value a resolver returns for an outcome (docs/conformance.md).
        // Without deferred-items, a list's items come inline in `items`.
        public static object? FromOutcome(JsonElement outcome, IType type)
        {
            var nullable = type.IsNonNullType() ? type.InnerType() : type;
            switch (outcome.GetProperty("kind").GetString())
            {
                case "null":
                    return null;
                case "leaf":
                    // At a list position (a wrong shape), the number 1.
                    return nullable.IsListType() ? 1 : Leaf(nullable.NamedType());
                case "uncoercible":
                    // A value the type can't represent: a fraction for an Int,
                    // a non-finite number for a Float, a name that isn't one
                    // of an enum's values.
                    return nullable.NamedType() switch
                    {
                        EnumType => "NOT_A_VALUE",
                        var named when named.Name == "Int" => 1.2,
                        _ => double.PositiveInfinity,
                    };
                case "object":
                    return new TlaObject(outcome.GetProperty("type").GetString()!);
                case "list":
                    var length = outcome.GetProperty("length").GetInt32();
                    var items = new List<object?>(length);
                    var itemType = nullable.IsListType() ? nullable.ListType().ElementType : nullable;
                    if (outcome.TryGetProperty("items", out var inline))
                    {
                        foreach (var item in inline.EnumerateArray()) items.Add(FromOutcome(item, itemType));
                    }
                    else
                    {
                        throw new InvalidOperationException("a list settle without items");
                    }
                    return items;
                default:
                    throw new InvalidOperationException($"unknown outcome {outcome}");
            }
        }

        // Int 1, Float 1.5, Boolean true, an enum's first value, anything else "v".
        private static object Leaf(INamedType named) => named switch
        {
            EnumType e => e.Values.First().Value,
            _ when named.Name == "Int" => 1,
            _ when named.Name == "Float" => 1.5,
            _ when named.Name == "Boolean" => true,
            _ => "v",
        };

        public static IValueNode ToValueNode(JsonElement e) => e.ValueKind switch
        {
            JsonValueKind.Object => new ObjectValueNode(
                e.EnumerateObject().Select(p => new ObjectFieldNode(p.Name, ToValueNode(p.Value))).ToList()),
            JsonValueKind.Array => new ListValueNode(e.EnumerateArray().Select(ToValueNode).ToList()),
            JsonValueKind.String => new StringValueNode(e.GetString()!),
            JsonValueKind.Number => e.TryGetInt64(out var l) ? new IntValueNode(l) : new FloatValueNode(e.GetDouble()),
            JsonValueKind.True => new BooleanValueNode(true),
            JsonValueKind.False => new BooleanValueNode(false),
            _ => NullValueNode.Default,
        };
    }
}
