// The kit areas beyond execution (docs/kit-areas.md and docs/kit/*.md),
// answered with Hot Chocolate's own APIs, the way an application uses them.
//
// Every area but parse builds the schema the same way (AreaSchemas.BuildAsync):
// a request executor from AddGraphQL().AddDocumentFromString(sdl), with Hot
// Chocolate's default options. Execution (Schemas.BuildAsync) changes some
// options to keep the schema exactly as written; the areas don't, since they
// ask what Hot Chocolate itself does with the SDL.

using System.Collections;
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using HotChocolate;
using HotChocolate.Configuration;
using HotChocolate.Execution;
using HotChocolate.Language;
using HotChocolate.Resolvers;
using HotChocolate.Types;
using HotChocolate.Types.Descriptors.Definitions;
using HotChocolate.Validation;
using Microsoft.Extensions.DependencyInjection;

namespace GraphQLTla.HotChocolate;

public static class Areas
{
    public static readonly string[] Names = ["parse", "validate", "coerce", "schema", "introspect", "coordinate"];

    // parse: parse-sdl, since Utf8GraphQLParser reads the type system
    // language too (see Parse).
    // validate: a custom scalar is Hot Chocolate's JsonType (AreaSchemas),
    // whose IsInstanceOfType accepts every literal.
    // validate and introspect: custom-directives, since Hot Chocolate builds
    // the `directive @label(...) on ...` definitions of the SDL.
    // coerce: exact-numbers, nested-fields, subscription-source and
    // request-extensions, but not absent-vs-null or unvalidated (see Coerce).
    // schema: schema-extensions, since AddDocumentFromString applies the
    // SDL's object, interface, union, enum and input object extensions (see
    // README.md for the kinds it drops).
    public static readonly string[] Capabilities =
    [
        "parse-sdl",
        "custom-scalar-literals",
        "custom-directives",
        "exact-numbers",
        "nested-fields",
        "subscription-source",
        "request-extensions",
        "schema-extensions",
    ];

    // What a server's request parser is made with, from the application's
    // services: the parser options (which DocumentParserMiddleware uses
    // too), the document cache and the hash provider.
    private static readonly IServiceProvider RequestServices =
        new ServiceCollection().AddGraphQL().Services.BuildServiceProvider();
    private static readonly ParserOptions RequestParserOptions = RequestServices.GetRequiredService<ParserOptions>();

    private static readonly Dictionary<string, Built> Executors = [];
    private static readonly Dictionary<string, Built> ValidationExecutors = [];

    public static JsonObject Answer(string area, int id, JsonElement request)
    {
        JsonObject result;
        try
        {
            result = area switch
            {
                "parse" => Parse(request),
                "validate" => Validate(request),
                "coerce" => Coerce(request),
                "schema" => SchemaValid(request),
                "introspect" => Introspect(request),
                "coordinate" => Coordinate(request),
                _ => throw new InvalidOperationException($"unknown area {area}"),
            };
        }
        catch (Exception error)
        {
            // The kit reports this as a crash of Hot Chocolate's on that
            // vector, in every area (docs/kit-areas.md, "Protocol"). The
            // stack trace goes to stderr.
            Console.Error.WriteLine(error);
            return new JsonObject { ["type"] = "error", ["id"] = id, ["message"] = $"{error.GetType().Name}: {error.Message}" };
        }
        result["type"] = "result";
        result["id"] = id;
        return result;
    }

    private static Built Executor(string sdl)
    {
        if (!Executors.TryGetValue(sdl, out var executor))
        {
            executor = AreaSchemas.BuildAsync(sdl).GetAwaiter().GetResult();
            Executors[sdl] = executor;
        }
        return executor;
    }

    // Is the source a syntactically valid executable document? Read the way
    // a Hot Chocolate server reads a request: the request body
    // {"query": <source>} goes through Utf8GraphQLRequestParser, which
    // unescapes the JSON string (Utf8Helper.Unescape) and parses the result
    // with Utf8GraphQLParser, with the request executor's parser options.
    // The source's JSON string is passed on exactly as the kit wrote it, so
    // a source holding a lone surrogate (escaped as \uD800 in the request)
    // reaches Hot Chocolate as it would on a server. The parser also reads
    // the type system language, so every definition must be an operation or
    // a fragment.
    //
    // With parse-sdl, a request may name a type system grammar
    // (docs/kit/parse.md, "Grammars"). That source is read the way
    // AddDocumentFromString reads a schema's SDL: Utf8GraphQLParser.Parse
    // with the default options. The parser reads every kind of definition
    // into one DocumentNode, so the answer is whether every definition is of
    // a kind the grammar allows.
    private static JsonObject Parse(JsonElement request)
    {
        var source = request.GetProperty("source");
        if (source.ValueKind != JsonValueKind.String) throw new InvalidOperationException("source isn't a string");
        var grammar = request.TryGetProperty("grammar", out var g) && g.ValueKind == JsonValueKind.String ? g.GetString()! : "executable";
        if (grammar != "executable") return ParseTypeSystem(source.GetString()!, grammar);
        var body = Encoding.UTF8.GetBytes("{\"query\":" + source.GetRawText() + "}");
        try
        {
            // An empty query is left unparsed by a parser with a document
            // cache, so the request has no document and no id: a
            // SyntaxException (NoIdAndNoQuery, Utf8GraphQLRequestParser.cs,
            // ParseQuery and ParseMutableRequest).
            var parser = new Utf8GraphQLRequestParser(
                body,
                RequestParserOptions,
                RequestServices.GetRequiredService<IDocumentCache>(),
                RequestServices.GetRequiredService<IDocumentHashProvider>());
            var document = parser.Parse()[0].Query
                ?? throw new InvalidOperationException("Utf8GraphQLRequestParser returned no document");
            var executable = document.Definitions.All(d => d is OperationDefinitionNode or FragmentDefinitionNode);
            return new JsonObject { ["ok"] = executable };
        }
        catch (SyntaxException error)
        {
            return new JsonObject { ["ok"] = false, ["error"] = error.Message };
        }
        // Any other exception is a crash (see README.md): the parser throws
        // something other than a SyntaxException on some sources, and
        // DocumentParserMiddleware only catches SyntaxException. Answer
        // turns it into an `error`, which the kit reports as a crash.
    }

    private static JsonObject ParseTypeSystem(string source, string grammar)
    {
        Func<IDefinitionNode, bool> allowed = grammar switch
        {
            "typeSystem" => d => d is ITypeSystemDefinitionNode,
            "typeSystemExtension" => d => d is ITypeSystemDefinitionNode or ITypeSystemExtensionNode,
            "document" => _ => true,
            _ => throw new InvalidOperationException($"unknown grammar {grammar}"),
        };
        try
        {
            var document = Utf8GraphQLParser.Parse(source);
            return new JsonObject { ["ok"] = document.Definitions.All(allowed) };
        }
        catch (SyntaxException error)
        {
            return new JsonObject { ["ok"] = false, ["error"] = error.Message };
        }
    }

    // The executor validate uses. Every vector's schema is valid, but Hot
    // Chocolate refuses one of them: the differential schema's interface
    // `Resource`, which no object type implements, breaks its
    // InterfaceHasAtLeastOneImplementationRule (see README.md). That rule,
    // like every schema validation rule, only runs with StrictValidation,
    // which nothing in document validation or execution reads. So when the
    // default build throws a SchemaException whose every error is that
    // rule's ("There is no object type implementing interface `Resource`.",
    // code SCHEMA_INTERFACE_NO_IMPL), the schema is built again with
    // StrictValidation off. Any other SchemaException propagates, and is a
    // crash on the vector.
    private const string InterfaceNoImplementation = "SCHEMA_INTERFACE_NO_IMPL";

    private static Built ValidationExecutor(string sdl)
    {
        if (!ValidationExecutors.TryGetValue(sdl, out var executor))
        {
            try
            {
                executor = Executor(sdl);
            }
            catch (SchemaException error) when (error.Errors.Count > 0 && error.Errors.All(e => e.Code == InterfaceNoImplementation))
            {
                Console.Error.WriteLine($"hotchocolate adapter: validate: the schema is built without StrictValidation: {string.Join("; ", error.Errors.Select(e => e.Message))}");
                executor = AreaSchemas.BuildAsync(sdl, strict: false).GetAwaiter().GetResult();
            }
            ValidationExecutors[sdl] = executor;
        }
        return executor;
    }

    // Is the document valid against the schema? The executor's own
    // IDocumentValidator, called as DocumentValidationMiddleware calls it.
    // Every vector's schema builds (above) and every document parses, so a
    // failure there is the adapter's and throws.
    private static JsonObject Validate(JsonElement request)
    {
        var built = ValidationExecutor(request.GetProperty("schema").GetString()!);
        var source = request.GetProperty("document").GetString()!;
        var document = Utf8GraphQLParser.Parse(source, RequestParserOptions);
        var result = built.Validator.ValidateAsync(
            built.Executor.Schema,
            document,
            new OperationDocumentId(Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(source)))),
            new Dictionary<string, object?>(),
            onlyNonCacheable: false).AsTask().GetAwaiter().GetResult();
        var errors = new JsonArray();
        foreach (var error in result.Errors)
        {
            var entry = new JsonObject { ["message"] = error.Message };
            if (error.Locations is { Count: > 0 } locations)
            {
                entry["locations"] = new JsonArray(locations
                    .Select(l => (JsonNode)new JsonObject { ["line"] = l.Line, ["column"] = l.Column }).ToArray());
            }
            errors.Add(entry);
        }
        return new JsonObject { ["valid"] = !result.HasErrors, ["errors"] = errors };
    }

    // Executes the request with a field middleware on every field that
    // records the field's path and the arguments Hot Chocolate coerced, and
    // returns "ok".
    //
    // The request is read the way a Hot Chocolate server reads a POST body
    // (AspNetCore's DefaultHttpRequestParser): the JSON body
    // {"query", "operationName", "variables", "extensions"} goes through
    // Utf8GraphQLRequestParser, with the application's ParserOptions,
    // IDocumentCache and IDocumentHashProvider. It parses the document, the
    // variables and the extensions. A SyntaxException there is the server's
    // request error: DefaultHttpRequestParser turns it into one error with
    // the exception's message and location and the code HC0011, and the
    // middleware answers OperationResultBuilder.CreateError with it. That is
    // also how an empty document fails (NoIdAndNoQuery). The executor then
    // gets OperationRequestBuilder.From(request), as the server's middleware
    // does.
    //
    // The parser turns each JSON value of the variables into a GraphQL
    // literal and keeps a number's text as it is
    // (Utf8GraphQLRequestParser.Syntax.cs, ParseScalarSyntax), so every
    // number is read exactly: `exact-numbers`. That also makes JSON 1.0 a
    // Float literal (see README.md).
    //
    // `nested-fields`: the middleware returns an object for a field of an
    // object type and two for a list of objects (AreaSchemas).
    //
    // `subscription-source`: a subscription operation runs through the
    // executor's subscription pipeline, whose subscribe resolver
    // (AreaSchemas) records its call in sourceCalls and then returns a
    // source stream of one event, or raises, as the request's `subscribe`
    // says. The response is the response stream's first result, or the
    // result the executor gives instead of a stream.
    //
    // `request-extensions`: the request's extensions are part of the body,
    // and reach the executor as the request's extensions.
    //
    // `unvalidated` isn't claimed: OperationResolverMiddleware compiles an
    // operation only when the request context holds a passing validation
    // result, so a request always runs through validation.
    //
    // `absent-vs-null` isn't claimed: Hot Chocolate gives a resolver every
    // declared argument, and a variable with no value becomes the literal
    // null (VariableRewriter.Rewrite). Input objects become dictionaries
    // with every field, null where the literal has none. So a resolver can't
    // tell a variable with no value from one set to null.
    private static JsonObject Coerce(JsonElement request)
    {
        var built = Executor(request.GetProperty("schema").GetString()!);
        var subscribe = request.TryGetProperty("subscribe", out var s) && s.ValueKind == JsonValueKind.String ? s.GetString() : null;
        var calls = new Calls(subscribe);

        // The body as a client sends it. The document's JSON string goes in
        // as the kit wrote it; the variables and extensions are JSON text.
        var body = new StringBuilder("{\"query\":").Append(request.GetProperty("document").GetRawText());
        if (request.TryGetProperty("operationName", out var name) && name.ValueKind == JsonValueKind.String)
        {
            body.Append(",\"operationName\":").Append(name.GetRawText());
        }
        if (request.TryGetProperty("variables", out var variables) && variables.ValueKind == JsonValueKind.String)
        {
            body.Append(",\"variables\":").Append(variables.GetString());
        }
        if (request.TryGetProperty("extensions", out var extensions) && extensions.ValueKind == JsonValueKind.String)
        {
            body.Append(",\"extensions\":").Append(extensions.GetString());
        }
        body.Append('}');

        GraphQLRequest parsed;
        try
        {
            parsed = new Utf8GraphQLRequestParser(Encoding.UTF8.GetBytes(body.ToString()), built.ParserOptions, built.DocumentCache, built.HashProvider)
                .Parse()[0];
        }
        catch (SyntaxException error)
        {
            // DefaultHttpRequestParser_SyntaxError, answered by the HTTP
            // middleware with OperationResultBuilder.CreateError.
            var requestError = OperationResultBuilder.CreateError(ErrorBuilder.New()
                .SetMessage(error.Message)
                .AddLocation(error.Line, error.Column)
                .SetCode(ErrorCodes.Server.SyntaxError)
                .Build());
            return new JsonObject { ["response"] = JsonNode.Parse(requestError.ToJson(false)), ["calls"] = new JsonArray() };
        }

        var builder = OperationRequestBuilder.From(parsed).SetGlobalState(Calls.Key, calls);
        var result = built.Executor.ExecuteAsync(builder.Build()).GetAwaiter().GetResult();
        string json;
        if (result is IResponseStream stream)
        {
            // A subscription: the response is the first result of the
            // response stream, which is then closed.
            json = FirstResult(stream).GetAwaiter().GetResult();
        }
        else
        {
            json = result.ToJson(false);
            result.DisposeAsync().AsTask().GetAwaiter().GetResult();
        }
        var answer = new JsonObject { ["response"] = JsonNode.Parse(json), ["calls"] = calls.ToJson() };
        if (subscribe is not null) answer["sourceCalls"] = calls.SourceCallsToJson();
        return answer;
    }

    private static async Task<string> FirstResult(IResponseStream stream)
    {
        try
        {
            await foreach (var r in stream.ReadResultsAsync())
            {
                var json = r.ToJson(false);
                await r.DisposeAsync();
                return json;
            }
            throw new InvalidOperationException("the response stream completed without a result");
        }
        finally
        {
            await stream.DisposeAsync();
        }
    }

    // Is the SDL schema valid? The request executor is built, which builds
    // and validates the schema. Hot Chocolate rejects a schema by throwing
    // SchemaException, and an SDL syntax error is a SyntaxException. Those
    // are `valid: false`. Any other exception is a crash, answered with
    // `error` (docs/kit/schema.md).
    private static JsonObject SchemaValid(JsonElement request)
    {
        try
        {
            AreaSchemas.BuildAsync(request.GetProperty("sdl").GetString()!).GetAwaiter().GetResult();
            return new JsonObject { ["valid"] = true };
        }
        catch (SchemaException error)
        {
            return new JsonObject
            {
                ["valid"] = false,
                ["errors"] = new JsonArray(error.Errors.Select(e => (JsonNode)JsonValue.Create(e.Message)!).ToArray()),
            };
        }
        catch (SyntaxException error)
        {
            return new JsonObject { ["valid"] = false, ["errors"] = new JsonArray(error.Message) };
        }
    }

    // The response to the kit's introspection query against the SDL schema,
    // executed and serialized as an application would.
    private static JsonObject Introspect(JsonElement request)
    {
        IRequestExecutor executor;
        try
        {
            executor = Executor(request.GetProperty("sdl").GetString()!).Executor;
        }
        catch (Exception error) when (error is SchemaException or SyntaxException)
        {
            return new JsonObject
            {
                ["response"] = new JsonObject
                {
                    ["errors"] = new JsonArray(new JsonObject { ["message"] = $"schema: {error.Message}" }),
                },
            };
        }
        var result = executor.ExecuteAsync(request.GetProperty("query").GetString()!).GetAwaiter().GetResult();
        var json = result.ToJson(false);
        result.DisposeAsync().AsTask().GetAwaiter().GetResult();
        return new JsonObject { ["response"] = JsonNode.Parse(json) };
    }
    // Parses the schema coordinate with Hot Chocolate's parser
    // (SchemaCoordinate.Parse, which reads it with Utf8GraphQLParser's
    // ParseSchemaCoordinate) and resolves it in the schema the SDL builds
    // with ISchema.TryGetMember. A SyntaxException is `ok: false`.
    //
    // Hot Chocolate has two resolvers: TryGetMember, which returns false
    // whenever no element is found, and GetMember, which throws
    // InvalidSchemaCoordinateException whenever no element is found. Neither
    // tells a missing element from a missing container, as §2.14 does (no
    // element, or an error). The adapter uses TryGetMember, so it never
    // answers `error` (see README.md).
    //
    // `kind` and `path` come from the element TryGetMember returns: its
    // class, its name, and the names of the type, field or directive that
    // declares it.
    private static JsonObject Coordinate(JsonElement request)
    {
        var schema = Executor(request.GetProperty("sdl").GetString()!).Executor.Schema;
        SchemaCoordinate coordinate;
        try
        {
            coordinate = SchemaCoordinate.Parse(request.GetProperty("coordinate").GetString()!);
        }
        catch (SyntaxException error)
        {
            return new JsonObject { ["ok"] = false, ["error"] = error.Message };
        }
        if (!schema.TryGetMember(coordinate, out var member))
        {
            return new JsonObject { ["ok"] = true, ["resolved"] = null };
        }
        var (kind, path) = member switch
        {
            INamedType type => ("type", new[] { type.Name }),
            DirectiveType directive => ("directive", new[] { directive.Name }),
            DirectiveArgument argument => ("directiveArgument", new[] { ((DirectiveType)argument.DeclaringType).Name, argument.Name }),
            Argument argument => ("argument", new[] { argument.Coordinate.Name, argument.Coordinate.MemberName!, argument.Name }),
            InputField field => ("inputField", new[] { ((INamedType)field.DeclaringType).Name, field.Name }),
            IOutputField field => ("field", new[] { field.DeclaringType.Name, field.Name }),
            IEnumValue value => ("enumValue", new[] { EnumTypeOf(schema, value).Name, value.Name }),
            _ => throw new InvalidOperationException($"TryGetMember returned a {member.GetType().Name}"),
        };
        return new JsonObject
        {
            ["ok"] = true,
            ["resolved"] = new JsonObject
            {
                ["kind"] = kind,
                ["path"] = new JsonArray(path.Select(p => (JsonNode)JsonValue.Create(p)!).ToArray()),
            },
        };
    }

    // An enum value doesn't name its type: the schema's enum type that holds it.
    private static EnumType EnumTypeOf(ISchema schema, IEnumValue value) =>
        schema.Types.OfType<EnumType>().Single(t => t.Values.Any(v => ReferenceEquals(v, value)));
}

// The resolver calls of one coerce request.
public sealed class Calls(string? subscribe = null)
{
    public const string Key = "graphql-tla.calls";

    private readonly List<JsonObject> _calls = [];
    private readonly List<JsonObject> _sourceCalls = [];

    // What the subscribe resolver does (subscription-source): "stream" or
    // "raise", or null when the request has no `subscribe`.
    public string? Subscribe => subscribe;

    public void Add(IResolverContext context)
    {
        var arguments = Arguments(context);
        var path = new JsonArray();
        foreach (var segment in context.Path.ToList())
        {
            path.Add(segment is int i ? JsonValue.Create(i) : JsonValue.Create(segment.ToString()));
        }
        lock (_calls) _calls.Add(new JsonObject { ["path"] = path, ["arguments"] = arguments });
    }

    // A call of the subscribe resolver: the field's name and its coerced
    // arguments.
    public void AddSource(IResolverContext context)
    {
        var arguments = Arguments(context);
        lock (_sourceCalls) _sourceCalls.Add(new JsonObject { ["field"] = context.Selection.Field.Name, ["arguments"] = arguments });
    }

    // Every argument the field declares, coerced by Hot Chocolate, read the
    // way a resolver method's parameters are (ArgumentValue). An argument
    // that fails to coerce throws here, before the call is recorded, as it
    // would before a resolver method's body ran.
    private static JsonObject Arguments(IResolverContext context)
    {
        var arguments = new JsonObject();
        foreach (var argument in context.Selection.Field.Arguments)
        {
            arguments[argument.Name] = ToJson(context.ArgumentValue<object?>(argument.Name));
        }
        return arguments;
    }

    public JsonArray ToJson()
    {
        lock (_calls) return new JsonArray(_calls.Select(c => (JsonNode)c.DeepClone()).ToArray());
    }

    public JsonArray SourceCallsToJson()
    {
        lock (_sourceCalls) return new JsonArray(_sourceCalls.Select(c => (JsonNode)c.DeepClone()).ToArray());
    }

    // A coerced runtime value as JSON (docs/kit/coerce.md). Hot Chocolate's
    // runtime values for an SDL schema: int, double, string and bool for the
    // built-in scalars, the value's name for an enum, List<object?> for a
    // list and Dictionary<string, object?> for an input object.
    private static JsonNode? ToJson(object? value) => value switch
    {
        null => null,
        string s => JsonValue.Create(s),
        bool b => JsonValue.Create(b),
        int i => JsonValue.Create(i),
        long l => JsonValue.Create(l),
        decimal m => JsonValue.Create(m),
        double d => double.IsFinite(d) ? JsonValue.Create(d) : JsonValue.Create(d.ToString(CultureInfo.InvariantCulture)),
        float f => float.IsFinite(f) ? JsonValue.Create(f) : JsonValue.Create(f.ToString(CultureInfo.InvariantCulture)),
        IDictionary<string, object?> map => new JsonObject(map.Select(p => KeyValuePair.Create(p.Key, ToJson(p.Value)))),
        IEnumerable list => new JsonArray(list.Cast<object?>().Select(ToJson).ToArray()),
        _ => throw new InvalidOperationException($"an argument value of type {value.GetType()}"),
    };
}

// A request executor, with what the application's services give the
// request pipeline and a server's request parser.
public sealed record Built(
    IRequestExecutor Executor,
    IDocumentValidator Validator,
    ParserOptions ParserOptions,
    IDocumentCache DocumentCache,
    IDocumentHashProvider HashProvider);

public static class AreaSchemas
{
    // run.sh --introspection-list-depth N: Hot Chocolate's
    // IntrospectionDepthVisitor lets a path through an introspection query
    // select __Type.fields (and inputFields, interfaces, possibleTypes) at
    // most once by default (ValidationOptions.MaxAllowedListRecursiveDepth
    // = 1), which rejects the kit's query. With the flag, the executor is
    // configured with SetIntrospectionAllowedDepth(16, N), Hot Chocolate's
    // own setting for it (16 is the default for ofType).
    public static ushort? IntrospectionListDepth { get; set; }

    // A request executor for the SDL, with Hot Chocolate's default options.
    //
    // Hot Chocolate skips `scalar` definitions in SDL (SchemaSyntaxVisitor
    // only keeps their directives) and resolves a scalar by name: a built-in
    // one, or one of its own (Date, JSON, Long, ...). Any other name has to
    // be registered by the application, or the build fails with "Unable to
    // resolve type reference". The adapter registers Hot Chocolate's
    // JsonType under each such name, the scalar it provides for arbitrary
    // values. Its IsInstanceOfType accepts every literal.
    //
    // Hot Chocolate refuses to build a schema with a field that has no
    // resolver ("The field `Query.a` has no resolver"). So every field gets
    // the same field middleware, in every area, though it only runs in
    // coerce: it records the call when the request carries a Calls recorder,
    // and returns "ok" for a leaf, an object for a field of an object type,
    // and two objects for a list of objects (nested-fields).
    //
    // A subscription root field needs a subscribe resolver to run
    // (SubscriptionExecutor throws without one), so every subscription root
    // field gets one (SubscribeInterceptor), though it only runs in coerce.
    public static async Task<Built> BuildAsync(string sdl, bool strict = true)
    {
        var services = new ServiceCollection();
        var builder = services
            .AddGraphQL()
            .AddDocumentFromString(sdl)
            .TryAddTypeInterceptor<SubscribeInterceptor>()
            .UseField(_ => context =>
            {
                if (context.ContextData.TryGetValue(Calls.Key, out var calls) && calls is Calls recorder)
                {
                    recorder.Add(context);
                }
                context.Result = ValueFor(context.Selection.Field.Type);
                return ValueTask.CompletedTask;
            });
        foreach (var name in CustomScalars(sdl)) builder.AddType(new JsonType(name));
        if (!strict) builder.ModifyOptions(options => options.StrictValidation = false);
        if (IntrospectionListDepth is { } depth) builder.SetIntrospectionAllowedDepth(16, depth);
        // What BuildRequestExecutorAsync does, keeping the application's
        // services: DocumentValidationMiddleware gets its validator from
        // their IDocumentValidatorFactory.
        var provider = services.BuildServiceProvider();
        var executor = await provider.GetRequiredService<IRequestExecutorResolver>().GetRequestExecutorAsync();
        var validator = provider.GetRequiredService<IDocumentValidatorFactory>().CreateValidator(executor.Schema.Name);
        return new Built(
            executor,
            validator,
            provider.GetRequiredService<ParserOptions>(),
            provider.GetRequiredService<IDocumentCache>(),
            provider.GetRequiredService<IDocumentHashProvider>());
    }

    // What a field's resolver returns, by its type.
    private static object ValueFor(IType type)
    {
        var nullable = type.IsNonNullType() ? type.InnerType() : type;
        if (nullable.IsListType())
        {
            var item = ValueFor(nullable.ListType().ElementType);
            return item is string ? new List<object> { item } : new List<object> { item, new object() };
        }
        return nullable.IsObjectType() ? new object() : "ok";
    }

    // The scalars the SDL defines that Hot Chocolate can't resolve by name.
    private static IEnumerable<string> CustomScalars(string sdl)
    {
        DocumentNode document;
        try
        {
            document = Utf8GraphQLParser.Parse(sdl);
        }
        catch (SyntaxException)
        {
            // The build reports it.
            return [];
        }
        return document.Definitions
            .OfType<ScalarTypeDefinitionNode>()
            .Select(d => d.Name.Value)
            .Where(n => !Scalars.IsBuiltIn(n))
            .Distinct();
    }
}

// Gives every subscription root field a subscribe resolver. In coerce, it
// records its call and returns a source stream of one event, or raises, as
// the request's `subscribe` says.
internal sealed class SubscribeInterceptor : TypeInterceptor
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
        if (definition != _subscription || definition is not ObjectTypeDefinition objectType) return;
        foreach (var field in objectType.Fields)
        {
            if (field.IsIntrospectionField) continue;
            field.SubscribeResolver = context =>
            {
                var calls = context.ContextData.TryGetValue(Calls.Key, out var c) ? c as Calls : null;
                calls?.AddSource(context);
                if (calls?.Subscribe == "raise")
                {
                    throw new GraphQLException(ErrorBuilder.New().SetMessage("the source stream can't be established").Build());
                }
                return new ValueTask<ISourceStream>(new OneEvent());
            };
        }
    }

    private sealed class OneEvent : ISourceStream
    {
        public async IAsyncEnumerable<object?> ReadEventsAsync()
        {
            await Task.Yield();
            yield return new object();
        }

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}
