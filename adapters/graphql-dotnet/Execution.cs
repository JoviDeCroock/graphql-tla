using System.Text.Json;
using System.Text.Json.Nodes;
using GraphQL;
using GraphQL.DataLoader;
using GraphQL.Resolvers;
using GraphQL.SystemTextJson;
using GraphQL.Types;

namespace GraphQLTla.GraphQLDotnet;

// A value that carries one of the kit's tokens (parent-values): an object
// whose runtime type the kit chose, the initial value, or a subscription
// event.
public interface ITokenCarrier
{
    string? Token { get; }
}

// An object whose runtime type the kit chose, and its token, if any.
public sealed record TlaObject(string TypeName, string? Token = null) : ITokenCarrier;

// The operation's initial value, or a subscription's event.
public sealed record TlaValue(string? Token) : ITokenCarrier;

// What the adapter's custom scalars can't represent (custom-scalar-results):
// their serializer raises on it (KitScalar).
public sealed class Unrepresentable
{
    public static readonly Unrepresentable Instance = new();

    private Unrepresentable() { }

    public override string ToString() => "an unrepresentable value";
}

// One execution: the resolver calls it has reported and not yet settled.
// For a subscription run as a stream (subscription-stream), also the kit's
// source stream and the client's subscription to the response stream.
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

    // parent-values: the tokens of the initial value and of the one event.
    private bool _parentValues;
    private string? _event;

    // subscription-stream: the source the kit drives, and the client's
    // subscription to the response stream.
    private KitSource? _source;
    private IDisposable? _subscription;
    private bool _completed;

    public bool ParentValues => _parentValues;

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
        // parent-values: the initial value is the operation's root value
        // (ExecutionOptions.Root), which root fields' resolvers get as their
        // source; a subscription's event carries the event's token.
        _parentValues = message.TryGetProperty("initialValue", out var initial);
        if (message.TryGetProperty("event", out var e) && e.ValueKind == JsonValueKind.String) _event = e.GetString();
        // subscription-stream: the kit drives the source stream.
        if (message.TryGetProperty("stream", out var stream) && stream.ValueKind == JsonValueKind.True) _source = new KitSource(this);
        var options = new ExecutionOptions
        {
            Schema = schema,
            Query = message.GetProperty("document").GetString(),
            Variables = variables,
            Root = _parentValues ? new TlaValue(initial.ValueKind == JsonValueKind.String ? initial.GetString() : initial.GetRawText()) : null,
            UserContext = new Dictionary<string, object?> { [Key] = this },
        };
        _ = RunAsync(options);
    }

    // The source stream for a subscription root field: the kit's, or one
    // that yields one event.
    public IObservable<object?> SourceStream() => _source ?? (IObservable<object?>)new OneEventStream(new TlaValue(_event));

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
            if (_source is not null)
            {
                // subscription-stream: every result the response stream
                // yields is reported, then how it ended.
                _subscription = streams.Values.First().Subscribe(new StreamResults(this));
                return;
            }
            // A subscription: the source stream yields one event, and the
            // response is the result graphql-dotnet produces for it.
            streams.Values.First().Subscribe(new FirstResult(this));
            return;
        }
        Respond(result, "no-response");
    }

    // The kit's source stream emits, completes or fails.
    public void Source(JsonElement message)
    {
        if (_source is null)
        {
            Channel.Send(new JsonObject { ["type"] = "error", ["id"] = id, ["message"] = "no streamed subscription to drive" });
            return;
        }
        // The request ended with one result instead of a response stream
        // (a request error, such as a validation error): the client has no
        // stream, and nothing subscribed to the source, so there is nothing
        // to report.
        if (_subscription is null && _responded) return;
        switch (message.GetProperty("action").GetString())
        {
            case "emit":
                _source.Emit(new TlaValue(message.TryGetProperty("token", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() : null));
                break;
            case "complete":
                _source.Complete();
                break;
            case "fail":
                _source.Fail(new Exception(message.TryGetProperty("message", out var m) ? m.GetString() : "the source stream failed"));
                break;
            default:
                Channel.Send(new JsonObject { ["type"] = "error", ["id"] = id, ["message"] = $"unknown source action {message.GetProperty("action")}" });
                break;
        }
    }

    // The client cancels the response stream: it disposes its subscription,
    // the IObservable way of unsubscribing. Once Dispose returns, the client
    // is done with the stream.
    public void Cancel()
    {
        // As in Source: no response stream to cancel.
        if (_subscription is null && _responded) return;
        if (_subscription is null)
        {
            Channel.Send(new JsonObject { ["type"] = "error", ["id"] = id, ["message"] = "no response stream to cancel" });
            return;
        }
        _subscription.Dispose();
        if (!_completed && !_ended) Channel.Send(new JsonObject { ["type"] = "done", ["id"] = id });
        _completed = true;
    }

    // The source stream was disposed by graphql-dotnet before it completed
    // or failed.
    internal void SourceCancelled()
    {
        if (!_ended) Channel.Send(new JsonObject { ["type"] = "source-cancelled", ["id"] = id });
    }

    private sealed class StreamResults(Execution execution) : IObserver<ExecutionResult>
    {
        public void OnNext(ExecutionResult value)
        {
            if (execution._ended || execution._completed) return;
            execution.Send(value, "no-response");
        }

        public void OnError(Exception error)
        {
            if (execution._ended || execution._completed) return;
            execution._completed = true;
            Channel.Send(new JsonObject { ["type"] = "stream-error", ["id"] = execution.Id, ["message"] = error.Message });
        }

        public void OnCompleted()
        {
            if (execution._ended || execution._completed) return;
            execution._completed = true;
            Channel.Send(new JsonObject { ["type"] = "done", ["id"] = execution.Id });
        }
    }

    // Sends the response, serialized by graphql-dotnet's serializer. If the
    // serializer throws, a client gets no response: `failure` says how the
    // kit is told (`no-response`, or `stream-error` for a subscription).
    private void Respond(ExecutionResult result, string failure)
    {
        if (_ended || _responded) return;
        _responded = Send(result, failure);
    }

    // Serializes one result and sends it, or `failure` if the serializer
    // throws. Returns whether the kit was told anything.
    private bool Send(ExecutionResult result, string failure)
    {
        string json;
        try
        {
            json = Serializer.Serialize(result);
        }
        catch (Exception error)
        {
            Channel.Send(new JsonObject { ["type"] = failure, ["id"] = id, ["message"] = $"GraphQLSerializer.Serialize threw {error.GetType().Name}: {error.Message}" });
            return true;
        }
        Channel.SendLine("response", $"{{\"type\":\"response\",\"id\":{id},\"response\":{json}}}");
        return true;
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
    // With parent-values, `parent` is the token of the value the resolver
    // was given (`hasParent` is false for a list item, which has no
    // resolver of its own).
    public Task<object?> Call(IEnumerable<object> path, IGraphType type, bool hasParent = false, string? parent = null)
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
        var message = new JsonObject
        {
            ["type"] = "call",
            ["id"] = id,
            ["call"] = call,
            ["path"] = jsonPath,
            ["returnType"] = Print(type),
            // How many settles this execution had applied when the resolver
            // was called. Everything runs on one thread, so it is exact.
            ["after"] = _applied,
        };
        if (_parentValues && hasParent) message["parent"] = parent;
        Channel.Send(message);
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
        // A response stream still open is closed quietly.
        _subscription?.Dispose();
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
                // scalar-results: the internal value the kit names, as it is
                // (the integer 4 for an ID, 2147483648 for an Int).
                if (outcome.TryGetProperty("value", out var value)) return Internal(value);
                // At a list position (a wrong shape), the number 1.
                return nullable is ListGraphType ? 1 : Leaf(nullable);
            case "uncoercible":
                // A value the type can't represent: a fraction for an Int, a
                // non-finite number for a Float, a name that isn't one of an
                // enum's values, and for a custom scalar a value its
                // serializer raises on (custom-scalar-results).
                return nullable switch
                {
                    EnumerationGraphType => "NOT_A_VALUE",
                    KitScalar => Unrepresentable.Instance,
                    _ when nullable.Name == "Int" => 1.2,
                    _ => double.PositiveInfinity,
                };
            case "object":
                return new TlaObject(outcome.GetProperty("type").GetString()!,
                    outcome.TryGetProperty("token", out var token) && token.ValueKind == JsonValueKind.String ? token.GetString() : null);
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

    // A JSON value as the CLR value a resolver would return: an integer as
    // an int, or a long where it doesn't fit.
    private static object? Internal(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Number when value.TryGetInt32(out var i) => i,
        JsonValueKind.Number when value.TryGetInt64(out var l) => l,
        JsonValueKind.Number => value.GetDouble(),
        JsonValueKind.String => value.GetString(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Null => null,
        _ => throw new InvalidOperationException($"an internal value the adapter can't return: {value}"),
    };

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
        // parent-values: the token of the value the resolver was given.
        var parent = context.Source is ITokenCarrier carrier ? carrier.Token : null;
        return new ValueTask<object?>(execution.Call(context.ResponsePath, context.FieldDefinition.ResolvedType!, true, parent));
    }
}

// A subscription field's source stream. graphql-dotnet runs the field's
// resolver on each event (SubscriptionExecutionStrategy.ProcessDataAsync),
// so the kit's resolver is the root call, as in graphql-js. The stream is
// the execution's: one event, or the kit's (subscription-stream).
public sealed class KitStreamResolver : ISourceStreamResolver
{
    public static readonly KitStreamResolver Instance = new();

    public ValueTask<IObservable<object?>> ResolveAsync(IResolveFieldContext context) =>
        new(((Execution)context.UserContext[Execution.Key]!).SourceStream());
}

// A source stream that yields one event.
public sealed class OneEventStream(object? value) : IObservable<object?>, IDisposable
{
    public IDisposable Subscribe(IObserver<object?> observer)
    {
        observer.OnNext(value);
        return this;
    }

    public void Dispose() { }
}

// The source stream the kit drives (subscription-stream). Its events and
// its end are passed to the subscriber as the kit sends them; disposing the
// subscription before it ended is graphql-dotnet cancelling it.
public sealed class KitSource(Execution execution) : IObservable<object?>, IDisposable
{
    private IObserver<object?>? _observer;
    private readonly Queue<Action<IObserver<object?>>> _early = new();
    private bool _over;
    private bool _disposed;

    public IDisposable Subscribe(IObserver<object?> observer)
    {
        _observer = observer;
        while (_early.Count > 0) _early.Dequeue()(observer);
        return this;
    }

    private void Push(Action<IObserver<object?>> step)
    {
        if (_over || _disposed) return;
        if (_observer is null) _early.Enqueue(step);
        else step(_observer);
    }

    public void Emit(object? value) => Push(o => o.OnNext(value));

    public void Complete()
    {
        Push(o => o.OnCompleted());
        _over = true;
    }

    public void Fail(Exception error)
    {
        Push(o => o.OnError(error));
        _over = true;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        if (!_over) execution.SourceCancelled();
        _over = true;
    }
}

// The adapter's custom scalars: graphql-dotnet's ComplexScalarGraphType,
// whose result coercion raises on a value it can't represent
// (custom-scalar-results), with graphql-dotnet's own serialization error.
public sealed class KitScalar : ComplexScalarGraphType
{
    public override object? Serialize(object? value) =>
        value is Unrepresentable ? ThrowSerializationError(value) : base.Serialize(value);
}
