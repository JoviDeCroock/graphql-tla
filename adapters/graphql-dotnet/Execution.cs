using System.Text.Json;
using System.Text.Json.Nodes;
using GraphQL;
using GraphQL.DataLoader;
using GraphQL.Resolvers;
using GraphQL.SystemTextJson;
using GraphQL.Types;

namespace GraphQLTla.GraphQLDotnet;

// An object whose runtime type the kit chose.
public sealed record TlaObject(string TypeName);

// One execution: the resolver calls it has reported and not yet settled.
public sealed class Execution(int id, bool deferredItems)
{
    public const string Key = "graphql-tla.execution";

    // graphql-dotnet's default executer and serializer, as an application
    // would use them.
    public static readonly DocumentExecuter Executer = new();
    public static readonly GraphQLSerializer Serializer = new();

    private sealed record Pending(IGraphType Type, List<object> Path, TaskCompletionSource<object?> Result);

    public int Id => id;

    private readonly Dictionary<int, Pending> _calls = [];
    private int _nextCall;
    private int _applied;
    private bool _ended;
    private bool _responded;

    public void Start(JsonElement message)
    {
        if (message.TryGetProperty("errorPropagation", out var ep) && ep.ValueKind == JsonValueKind.False)
        {
            Channel.Send(new JsonObject { ["type"] = "error", ["id"] = id, ["message"] = "graphql-dotnet can't execute without error propagation" });
            return;
        }
        Schema schema;
        try
        {
            schema = Schemas.ForExecution(message.GetProperty("schema").GetString()!);
        }
        catch (Exception error)
        {
            Channel.Send(new JsonObject { ["type"] = "error", ["id"] = id, ["message"] = $"the adapter couldn't build the schema: {error.GetType().Name}: {error.Message}" });
            return;
        }
        var variables = message.TryGetProperty("variables", out var v) && v.ValueKind == JsonValueKind.Object
            ? Serializer.Deserialize<Inputs>(v.GetRawText())
            : null;
        var options = new ExecutionOptions
        {
            Schema = schema,
            Query = message.GetProperty("document").GetString(),
            Variables = variables,
            UserContext = new Dictionary<string, object?> { [Key] = this },
        };
        _ = RunAsync(options);
    }

    private async Task RunAsync(ExecutionOptions options)
    {
        ExecutionResult result;
        try
        {
            result = await Executer.ExecuteAsync(options);
        }
        catch (Exception error)
        {
            // Execution raised out to the caller: the client gets nothing.
            Fail("no-response", $"DocumentExecuter.ExecuteAsync threw {error.GetType().Name}: {error.Message}");
            return;
        }
        if (result.Streams is { Count: > 0 } streams)
        {
            // A subscription: the source stream yields one event, and the
            // response is the result graphql-dotnet produces for it.
            streams.Values.First().Subscribe(new FirstResult(this));
            return;
        }
        Respond(result, "no-response");
    }

    // Sends the response, serialized by graphql-dotnet's serializer. If the
    // serializer throws, a client gets no response: `failure` says how the
    // kit is told (`no-response`, or `stream-error` for a subscription).
    private void Respond(ExecutionResult result, string failure)
    {
        if (_ended || _responded) return;
        string json;
        try
        {
            json = Serializer.Serialize(result);
        }
        catch (Exception error)
        {
            Fail(failure, $"GraphQLSerializer.Serialize threw {error.GetType().Name}: {error.Message}");
            return;
        }
        _responded = true;
        Channel.SendLine("response", $"{{\"type\":\"response\",\"id\":{id},\"response\":{json}}}");
    }

    private void Fail(string type, string message)
    {
        if (_ended || _responded) return;
        _responded = true;
        Channel.Send(new JsonObject { ["type"] = type, ["id"] = id, ["message"] = message });
    }

    private sealed class FirstResult(Execution execution) : IObserver<ExecutionResult>
    {
        public void OnNext(ExecutionResult value) => execution.Respond(value, "stream-error");

        public void OnError(Exception error) => execution.Fail("stream-error", error.Message);

        public void OnCompleted() { }
    }

    // The kit's resolver was called at `path`, for a position of `type`.
    public Task<object?> Call(IEnumerable<object> path, IGraphType type)
    {
        // After `end`, nothing more is reported, and nothing will complete.
        if (_ended) return new TaskCompletionSource<object?>().Task;
        var call = ++_nextCall;
        // No RunContinuationsAsynchronously: graphql-dotnet's continuations
        // run inline when the stdin thread completes the task.
        var result = new TaskCompletionSource<object?>();
        var segments = path.ToList();
        _calls[call] = new Pending(type, segments, result);
        var jsonPath = new JsonArray();
        foreach (var segment in segments) jsonPath.Add(segment is int i ? JsonValue.Create(i) : JsonValue.Create(segment.ToString()));
        Channel.Send(new JsonObject
        {
            ["type"] = "call",
            ["id"] = id,
            ["call"] = call,
            ["path"] = jsonPath,
            ["returnType"] = Print(type),
            // How many settles this execution had applied when the resolver
            // was called. Everything runs on one thread, so it is exact.
            ["after"] = _applied,
        });
        return result.Task;
    }

    public bool Settle(int call, JsonElement outcome)
    {
        if (!_calls.Remove(call, out var pending)) return false;
        _applied++;
        if (outcome.GetProperty("kind").GetString() == "error")
        {
            pending.Result.SetException(new ExecutionError($"resolver call {call} failed"));
        }
        else
        {
            pending.Result.SetResult(FromOutcome(outcome, pending.Type, pending.Path));
        }
        return true;
    }

    public void End()
    {
        _ended = true;
        _calls.Clear();
    }

    // The value a resolver returns for an outcome (docs/conformance.md).
    private object? FromOutcome(JsonElement outcome, IGraphType type, List<object> path)
    {
        var nullable = type is NonNullGraphType nonNull ? nonNull.ResolvedType! : type;
        switch (outcome.GetProperty("kind").GetString())
        {
            case "null":
                return null;
            case "leaf":
                // At a list position (a wrong shape), the number 1.
                return nullable is ListGraphType ? 1 : Leaf(nullable);
            case "uncoercible":
                // A value the type can't represent: a fraction for an Int, a
                // non-finite number for a Float, a name that isn't one of an
                // enum's values.
                return nullable switch
                {
                    EnumerationGraphType => "NOT_A_VALUE",
                    _ when nullable.Name == "Int" => 1.2,
                    _ => double.PositiveInfinity,
                };
            case "object":
                return new TlaObject(outcome.GetProperty("type").GetString()!);
            case "list":
                var length = outcome.GetProperty("length").GetInt32();
                var itemType = nullable is ListGraphType list ? list.ResolvedType! : nullable;
                var items = new List<object?>(length);
                if (outcome.TryGetProperty("items", out var inline))
                {
                    // Without deferred-items: each item's outcome comes inline.
                    var index = 0;
                    foreach (var item in inline.EnumerateArray()) items.Add(FromOutcome(item, itemType, [.. path, index++]));
                }
                else if (deferredItems)
                {
                    // graphql-dotnet only waits for a list item that is an
                    // IDataLoaderResult (ExecutionStrategy.SetArrayItemNodesAsync),
                    // so each item is one, and asks the kit when graphql-dotnet
                    // asks for its value.
                    for (var i = 0; i < length; i++) items.Add(new DeferredItem(this, [.. path, i], itemType));
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
    private static object Leaf(IGraphType named) => named switch
    {
        EnumerationGraphType e => e.Values.First().Value!,
        _ when named.Name == "Int" => 1,
        _ when named.Name == "Float" => 1.5,
        _ when named.Name == "Boolean" => true,
        _ => "v",
    };

    private sealed class DeferredItem(Execution execution, List<object> path, IGraphType type) : IDataLoaderResult
    {
        public Task<object?> GetResultAsync(CancellationToken cancellationToken = default) => execution.Call(path, type);
    }

    // A type in SDL syntax.
    public static string Print(IGraphType type) => type switch
    {
        NonNullGraphType n => Print(n.ResolvedType!) + "!",
        ListGraphType l => "[" + Print(l.ResolvedType!) + "]",
        _ => type.Name,
    };
}

// The one resolver installed on every field.
public sealed class KitResolver : IFieldResolver
{
    public static readonly KitResolver Instance = new();

    public ValueTask<object?> ResolveAsync(IResolveFieldContext context)
    {
        var execution = (Execution)context.UserContext[Execution.Key]!;
        return new ValueTask<object?>(execution.Call(context.ResponsePath, context.FieldDefinition.ResolvedType!));
    }
}

// A subscription field's source stream: one event. graphql-dotnet runs the
// field's resolver on the event (SubscriptionExecutionStrategy.ProcessDataAsync),
// so the kit's resolver is the root call, as in graphql-js.
public sealed class OneEventStream : ISourceStreamResolver, IObservable<object?>, IDisposable
{
    public static readonly OneEventStream Instance = new();

    public ValueTask<IObservable<object?>> ResolveAsync(IResolveFieldContext context) => new(this);

    public IDisposable Subscribe(IObserver<object?> observer)
    {
        observer.OnNext(new Dictionary<string, object?>());
        return this;
    }

    public void Dispose() { }
}
