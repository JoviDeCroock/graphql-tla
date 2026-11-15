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
    public static async Task<IRequestExecutor> BuildAsync(string sdl) =>
        await new ServiceCollection()
            .AddGraphQL()
            .AddDocumentFromString(sdl)
            .TryAddTypeInterceptor<TlaTypeInterceptor>()
            .UseField(_ => async context =>
            {
                var execution = (Execution)context.ContextData[Execution.Key]!;
                context.Result = await execution.Call(context.Path.ToList(), context.Selection.Field.Type)
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
            .ModifyRequestOptions(options => options.IncludeExceptionDetails = true)
            .BuildRequestExecutorAsync();

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

// Abstract types resolve to the object type the kit named, and a
// subscription field's source stream yields exactly one event.
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
            field.SubscribeResolver = _ => new ValueTask<ISourceStream>(new OneEventStream());
        }
    }
}

internal sealed class OneEventStream : ISourceStream
{
    public async IAsyncEnumerable<object?> ReadEventsAsync()
    {
        await Task.Yield();
        yield return new Dictionary<string, object?>();
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
