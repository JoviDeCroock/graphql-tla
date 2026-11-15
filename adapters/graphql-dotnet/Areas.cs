using System.Text.Json;
using System.Text.Json.Nodes;
using GraphQL;
using GraphQL.Execution;
using GraphQL.Types;
using GraphQL.Validation;
using GraphQLParser.AST;
using GraphQLParser.Exceptions;

namespace GraphQLTla.GraphQLDotnet;

// The kit areas beyond execution (docs/kit-areas.md and docs/kit/*.md).
public static class Areas
{
    public static readonly string[] Names = ["parse", "validate", "schema", "introspect"];

    // validate: a custom scalar is graphql-dotnet's ComplexScalarGraphType
    // (Schemas.Build), whose CanParseLiteral accepts every literal.
    public static readonly string[] Capabilities = ["custom-scalar-literals"];

    // The document builder DocumentExecuter uses by default.
    private static readonly GraphQLDocumentBuilder DocumentBuilder = new();
    private static readonly DocumentValidator Validator = new();
    private static readonly Dictionary<string, Schema> ValidationSchemas = [];

    public static JsonObject Answer(string area, int id, JsonElement request)
    {
        JsonObject result;
        try
        {
            result = area switch
            {
                "parse" => Parse(request),
                "validate" => Validate(request),
                "schema" => SchemaValid(request),
                "introspect" => Introspect(request),
                _ => throw new InvalidOperationException($"unknown area {area}"),
            };
        }
        catch (Exception error)
        {
            // In the schema area this is a crash (docs/kit/schema.md); in the
            // others, the adapter failed. The stack trace goes to stderr.
            Console.Error.WriteLine(error);
            return new JsonObject { ["type"] = "error", ["id"] = id, ["message"] = $"{error.GetType().Name}: {error.Message}" };
        }
        result["type"] = "result";
        result["id"] = id;
        return result;
    }

    // Is the source a syntactically valid executable document? Parsed the
    // way DocumentExecuter parses a request's query. GraphQLParser also
    // reads the type system language, so every definition must be an
    // operation or a fragment.
    private static JsonObject Parse(JsonElement request)
    {
        string source;
        try
        {
            source = request.GetProperty("source").GetString()!;
        }
        catch (InvalidOperationException)
        {
            // A lone surrogate: System.Text.Json refuses to read it into a
            // string, so a request holding one never reaches graphql-dotnet.
            return new JsonObject { ["ok"] = false, ["error"] = "System.Text.Json can't read the source into a string" };
        }
        try
        {
            var document = DocumentBuilder.Build(source);
            var executable = document.Definitions.All(d => d is GraphQLOperationDefinition or GraphQLFragmentDefinition);
            return new JsonObject { ["ok"] = executable };
        }
        catch (SyntaxError error)
        {
            return new JsonObject { ["ok"] = false, ["error"] = error.Message };
        }
    }

    // Is the document valid against the schema? DocumentValidator with
    // graphql-dotnet's core rules, as DocumentExecuter runs it. Besides the
    // rules, which visit the whole document, DocumentExecuter passes the
    // operation it selected, and the validator then coerces that
    // operation's variables and parses its arguments, which reports some
    // invalid literals (DocumentValidator.ValidateAsyncCoreAsync). So each
    // operation is validated in turn, as if it were the one selected. The
    // vectors come without variable values, so an InvalidVariableError (a
    // Non-Null variable with no value) isn't counted. It ends validation
    // before arguments are parsed, so for an operation with a required
    // variable, argument literals are only checked by the rules.
    private static JsonObject Validate(JsonElement request)
    {
        var sdl = request.GetProperty("schema").GetString()!;
        if (!ValidationSchemas.TryGetValue(sdl, out var schema))
        {
            schema = Schemas.Build(sdl);
            ValidationSchemas[sdl] = schema;
        }
        var document = DocumentBuilder.Build(request.GetProperty("document").GetString()!);
        var operations = document.Definitions.OfType<GraphQLOperationDefinition>().ToList<GraphQLOperationDefinition?>();
        if (operations.Count == 0) operations.Add(null);
        var errors = new JsonArray();
        var seen = new HashSet<string>();
        foreach (var operation in operations)
        {
            var result = Validator.ValidateAsync(new ValidationOptions
            {
                Schema = schema,
                Document = document,
                Operation = operation!,
                Rules = DocumentValidator.CoreRules,
                Variables = Inputs.Empty,
                Extensions = Inputs.Empty,
            }).GetAwaiter().GetResult();
            foreach (var error in result.Errors)
            {
                if (error is InvalidVariableError) continue;
                var entry = new JsonObject { ["message"] = error.Message };
                if (error.Locations is { Count: > 0 } locations)
                {
                    entry["locations"] = new JsonArray(locations
                        .Select(l => (JsonNode)new JsonObject { ["line"] = l.Line, ["column"] = l.Column }).ToArray());
                }
                // The rules report the same errors for every operation.
                if (seen.Add(entry.ToJsonString())) errors.Add(entry);
            }
        }
        return new JsonObject { ["valid"] = errors.Count == 0, ["errors"] = errors };
    }

    // Is the SDL schema valid? Schema.For, then Initialize, which validates
    // the schema. graphql-dotnet reports an invalid schema by throwing
    // ArgumentException (SchemaBuilder's duplicate names, NameValidator) or
    // InvalidOperationException (SchemaTypes, SchemaValidationVisitor), and
    // the parser throws GraphQLSyntaxErrorException. Those are rejections.
    // Any other exception is a crash, answered with `error`
    // (docs/kit/schema.md).
    private static JsonObject SchemaValid(JsonElement request)
    {
        try
        {
            Schemas.Build(request.GetProperty("sdl").GetString()!);
            return new JsonObject { ["valid"] = true };
        }
        catch (Exception error) when (error is ArgumentException or InvalidOperationException or AggregateException or GraphQLSyntaxErrorException)
        {
            return new JsonObject { ["valid"] = false, ["errors"] = new JsonArray(error.Message) };
        }
    }

    // The response to the kit's introspection query against the SDL schema,
    // executed and serialized as an application would.
    private static JsonObject Introspect(JsonElement request)
    {
        Schema schema;
        try
        {
            schema = Schemas.Build(request.GetProperty("sdl").GetString()!);
        }
        catch (Exception error)
        {
            return new JsonObject
            {
                ["response"] = new JsonObject { ["errors"] = new JsonArray(new JsonObject { ["message"] = $"Schema.For: {error.Message}" }) },
            };
        }
        var result = Execution.Executer.ExecuteAsync(new ExecutionOptions
        {
            Schema = schema,
            Query = request.GetProperty("query").GetString(),
        }).GetAwaiter().GetResult();
        return new JsonObject { ["response"] = JsonNode.Parse(Execution.Serializer.Serialize(result)) };
    }
}
