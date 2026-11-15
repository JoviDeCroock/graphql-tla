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
using HotChocolate.Execution;
using HotChocolate.Language;
using HotChocolate.Resolvers;
using HotChocolate.Types;
using HotChocolate.Validation;
using Microsoft.Extensions.DependencyInjection;

namespace GraphQLTla.HotChocolate;

public static class Areas
{
    public static readonly string[] Names = ["parse", "validate", "coerce", "schema", "introspect"];

    // validate: a custom scalar is Hot Chocolate's JsonType (AreaSchemas),
    // whose IsInstanceOfType accepts every literal.
    // validate and introspect: custom-directives, since Hot Chocolate builds
    // the `directive @label(...) on ...` definitions of the SDL.
    // coerce: exact-numbers, but not absent-vs-null or unvalidated (see Coerce).
    public static readonly string[] Capabilities = ["custom-scalar-literals", "custom-directives", "exact-numbers"];

    // The parser options a request executor parses requests with
    // (DocumentParserMiddleware takes them from the application's services).
    private static readonly ParserOptions RequestParserOptions =
        new ServiceCollection().AddGraphQL().Services.BuildServiceProvider().GetRequiredService<ParserOptions>();

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
    private static JsonObject Parse(JsonElement request)
    {
        var source = request.GetProperty("source");
        if (source.ValueKind != JsonValueKind.String) throw new InvalidOperationException("source isn't a string");
        var raw = source.GetRawText();
        if (raw == "\"\"")
        {
            // An empty query. A server's request parser has a document
            // cache, and with one ParseQuery leaves an empty query
            // unparsed, so the request has no document and no id: a
            // SyntaxException, NoIdAndNoQuery (Utf8GraphQLRequestParser.cs,
            // ParseQuery and ParseMutableRequest). The adapter's parser has
            // no cache, so it answers that here.
            return new JsonObject { ["ok"] = false, ["error"] = "Utf8GraphQLRequestParser: no id and no query" };
        }
        var body = Encoding.UTF8.GetBytes("{\"query\":" + raw + "}");
        try
        {
            var document = Utf8GraphQLRequestParser.Parse(body, RequestParserOptions)[0].Query
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
    // The variables are read with Utf8GraphQLRequestParser.ParseVariables,
    // the routine the request parser uses for a request's "variables" entry.
    // A syntax error there is a request error, as a server answers it. The
    // parser turns each JSON value into a GraphQL literal and keeps a
    // number's text as it is (Utf8GraphQLRequestParser.Syntax.cs,
    // ParseScalarSyntax), so every number is read exactly: `exact-numbers`.
    // That also makes JSON 1.0 a Float literal (see README.md).
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
        var executor = Executor(request.GetProperty("schema").GetString()!).Executor;
        var calls = new Calls();

        IReadOnlyDictionary<string, object?>? variables = null;
        if (request.TryGetProperty("variables", out var raw) && raw.ValueKind == JsonValueKind.String)
        {
            try
            {
                var parsed = Utf8GraphQLRequestParser.ParseVariables(Encoding.UTF8.GetBytes(raw.GetString()!), RequestParserOptions);
                variables = parsed is { Count: > 0 } ? parsed[0] : null;
            }
            catch (SyntaxException error)
            {
                return new JsonObject
                {
                    ["response"] = new JsonObject
                    {
                        ["errors"] = new JsonArray(new JsonObject { ["message"] = $"variables: {error.Message}" }),
                    },
                    ["calls"] = new JsonArray(),
                };
            }
        }

        var builder = OperationRequestBuilder.New()
            .SetDocument(request.GetProperty("document").GetString()!)
            .SetGlobalState(Calls.Key, calls);
        if (variables is not null) builder.SetVariableValues(variables);
        if (request.TryGetProperty("operationName", out var name) && name.ValueKind == JsonValueKind.String)
        {
            builder.SetOperationName(name.GetString());
        }

        var result = executor.ExecuteAsync(builder.Build()).GetAwaiter().GetResult();
        var json = result.ToJson(false);
        result.DisposeAsync().AsTask().GetAwaiter().GetResult();
        return new JsonObject { ["response"] = JsonNode.Parse(json), ["calls"] = calls.ToJson() };
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
}

// The resolver calls of one coerce request.
public sealed class Calls
{
    public const string Key = "graphql-tla.calls";

    private readonly List<JsonObject> _calls = [];

    public void Add(IResolverContext context)
    {
        // Every argument the field declares, coerced by Hot Chocolate, read
        // the way a resolver method's parameters are (ArgumentValue). An
        // argument that fails to coerce throws here, before the call is
        // recorded, as it would before a resolver method's body ran.
        var arguments = new JsonObject();
        foreach (var argument in context.Selection.Field.Arguments)
        {
            arguments[argument.Name] = ToJson(context.ArgumentValue<object?>(argument.Name));
        }
        var path = new JsonArray();
        foreach (var segment in context.Path.ToList())
        {
            path.Add(segment is int i ? JsonValue.Create(i) : JsonValue.Create(segment.ToString()));
        }
        lock (_calls) _calls.Add(new JsonObject { ["path"] = path, ["arguments"] = arguments });
    }

    public JsonArray ToJson()
    {
        lock (_calls) return new JsonArray(_calls.Select(c => (JsonNode)c.DeepClone()).ToArray());
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

public sealed record Built(IRequestExecutor Executor, IDocumentValidator Validator);

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
    // and returns "ok".
    public static async Task<Built> BuildAsync(string sdl, bool strict = true)
    {
        var services = new ServiceCollection();
        var builder = services
            .AddGraphQL()
            .AddDocumentFromString(sdl)
            .UseField(_ => context =>
            {
                if (context.ContextData.TryGetValue(Calls.Key, out var calls) && calls is Calls recorder)
                {
                    recorder.Add(context);
                }
                context.Result = "ok";
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
        return new Built(executor, validator);
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
