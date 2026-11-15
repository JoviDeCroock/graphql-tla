using System.Text.Json.Nodes;
using HotChocolate;
using HotChocolate.Configuration;
using HotChocolate.Execution;
using HotChocolate.Language;
using HotChocolate.Resolvers;
using HotChocolate.Types;
using HotChocolate.Types.Descriptors.Definitions;
using Microsoft.Extensions.DependencyInjection;

namespace GraphQLTla.HotChocolate;

public static class Schemas
{
    // A request executor for the SDL, with the kit's resolver on every field
    // (introspection fields keep Hot Chocolate's own resolvers, as the kit
    // expects) and type resolution from the kit's chosen runtime type.
    //
    // Hot Chocolate skips `scalar` definitions in SDL and resolves a scalar
    // by name, so the application registers each custom scalar (see
    // AreaSchemas in Areas.cs). Here it is KitScalarType: Hot Chocolate's
    // AnyType, whose result coercion also rejects the value the kit's
    // `uncoercible` outcome stands for (custom-scalar-results).
    //
    // With parent-values, the resolver reports the token of the value Hot
    // Chocolate gives it to resolve on (ParentOf).
    public static async Task<IRequestExecutor> BuildAsync(string sdl)
    {
        var builder = new ServiceCollection()
            .AddGraphQL()
            .AddDocumentFromString(sdl)
            .TryAddTypeInterceptor<TlaTypeInterceptor>()
            .UseField(_ => async context =>
            {
                var execution = (Execution)context.ContextData[Execution.Key]!;
                var parent = execution.ParentValues ? new Parent(Values.TokenOf(ParentOf(context))) : null;
                context.Result = await execution.Call(context.Path.ToList(), context.Selection.Field.Type, parent)
                    .ConfigureAwait(false);
            })
            .ModifyOptions(options =>
            {
                // Keep the schema as written: no extra types or directives,
                // and no schema rewriting such as semantic non-null.
                options.RemoveUnreachableTypes = false;
                options.EnableSemanticNonNull = false;
                options.EnableOneOf = false;
            })
            .ModifyRequestOptions(options => options.IncludeExceptionDetails = true);
        foreach (var name in CustomScalars(sdl)) builder.AddType(new KitScalarType(name));
        return await builder.BuildRequestExecutorAsync();
    }

    // The value a resolver is given to resolve on (parent-values): its
    // parent (IResolverContext.Parent), except at a subscription's root.
    // There Hot Chocolate's parent is still the operation's root value, and
    // it hands the resolver the event as the event message instead
    // (WellKnownContextData.EventMessage in the scoped context data, read
    // with GetEventMessage or an [EventMessage] parameter; the resolver that
    // [SubscribeAndResolve] gives a field returns it as the field's value,
    // SubscribeAndResolveAttribute.cs). So for a subscription root field the
    // event message is reported: the event is the root field's value, as
    // docs/conformance.md describes under `parent` (see README.md).
    private static object? ParentOf(IMiddlewareContext context) =>
        context.Path.Parent.IsRoot
        && context.ObjectType == context.Schema.SubscriptionType
        && context.ScopedContextData.TryGetValue(WellKnownContextData.EventMessage, out var message)
            ? message
            : context.Parent<object?>();

    // The scalars the SDL defines that Hot Chocolate can't resolve by name.
    private static IEnumerable<string> CustomScalars(string sdl) =>
        Utf8GraphQLParser.Parse(sdl).Definitions
            .OfType<ScalarTypeDefinitionNode>()
            .Select(d => d.Name.Value)
            .Where(n => !Scalars.IsBuiltIn(n))
            .Distinct();

    public static async Task WarmUpAsync()
    {
        var executor = await BuildAsync("type Query { a: [A!] } type A { b: Int! }");
        var execution = new Execution(0, _ => { });
        var request = OperationRequestBuilder.New()
            .SetDocument("{ a { b } }")
            .SetGlobalState(Execution.Key, execution)
            .Build();
        var pending = executor.ExecuteAsync(request);
        // Resolve the root list inline with one item, then its field.
        for (var call = 1; call <= 2; call++)
        {
            var outcome = call == 1
                ? """{"kind":"list","length":1,"items":[{"kind":"object","type":"A"}]}"""
                : """{"kind":"leaf"}""";
            for (var i = 0; i < 1000 && !execution.Settle(call, System.Text.Json.JsonDocument.Parse(outcome).RootElement); i++)
            {
                await Task.Delay(1);
            }
        }
        var result = await pending;
        result.ToJson(false);
        await result.DisposeAsync();
    }
}

// A custom scalar: Hot Chocolate's AnyType, whose result coercion raises a
// SerializationException on Unrepresentable.Value, as a custom scalar's
// serializer raises on a value it can't represent (custom-scalar-results).
public sealed class KitScalarType(string name) : AnyType(name)
{
    public override bool TrySerialize(object? runtimeValue, out object? resultValue)
    {
        if (ReferenceEquals(runtimeValue, Unrepresentable.Value))
        {
            resultValue = null;
            return false;
        }
        return base.TrySerialize(runtimeValue, out resultValue);
    }
}

// The value a resolver returns for an `uncoercible` outcome at a custom scalar.
public sealed class Unrepresentable
{
    public static readonly Unrepresentable Value = new();
}

// Abstract types resolve to the object type the kit named. A subscription
// field's source stream is the kit's (subscription-stream) or yields exactly
// one event.
internal sealed class TlaTypeInterceptor : TypeInterceptor
{
    private ObjectTypeDefinition? _subscription;

    public override void OnAfterResolveRootType(
        ITypeCompletionContext completionContext,
        ObjectTypeDefinition definition,
        OperationType operationType)
    {
        if (operationType is OperationType.Subscription) _subscription = definition;
    }

    public override void OnBeforeCompleteType(ITypeCompletionContext completionContext, DefinitionBase definition)
    {
        if (completionContext.IsIntrospectionType || definition is not ObjectTypeDefinition objectType) return;
        var name = objectType.Name;
        objectType.IsOfType = (_, result) => result is TlaObject o && o.TypeName == name;
        if (objectType != _subscription) return;
        foreach (var field in objectType.Fields)
        {
            if (field.IsIntrospectionField) continue;
            field.SubscribeResolver = context =>
            {
                var execution = (Execution)context.ContextData[Execution.Key]!;
                return new ValueTask<ISourceStream>(execution.Source ?? (ISourceStream)new OneEventStream(execution.EventToken));
            };
        }
    }
}

// One event, which carries the kit's `event` token with parent-values.
internal sealed class OneEventStream(JsonNode? token) : ISourceStream
{
    public async IAsyncEnumerable<object?> ReadEventsAsync()
    {
        await Task.Yield();
        yield return new TlaEvent(token);
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
