using System.Globalization;
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

    // validate and introspect: custom-directives, since Schema.For builds
    // the SDL's `directive @label(...) on ...` definitions.
    //
    // Not custom-scalar-literals: a custom scalar is graphql-dotnet's
    // ComplexScalarGraphType (Schemas.Build), which accepts every literal
    // except one that holds a variable. graphql-dotnet hands a scalar the
    // raw literal, with variables not substituted (ExecutionHelper), and
    // ComplexScalarGraphType's ParseAnyLiteral has no case for a variable,
    // so `json(value: {a: $v})` is refused whatever $v is.
    public static readonly string[] Capabilities = ["custom-directives"];

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
            // The kit reports this as a crash of graphql-dotnet's on that
            // vector, in every area (docs/kit-areas.md, "Protocol"). The
            // stack trace goes to stderr.
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
        catch (InvalidOperationException) when (HasLoneSurrogate(request.GetProperty("source").GetRawText()))
        {
            // A lone surrogate: System.Text.Json refuses to read it into a
            // string. A graphql-dotnet server reads requests with
            // System.Text.Json too (GraphQL.SystemTextJson), so a request
            // holding one never reaches graphql-dotnet. That is the
            // transport, not a verdict of GraphQL-Parser, so the kit doesn't
            // grade the vector (docs/kit/parse.md).
            return new JsonObject { ["unsupported"] = "lone surrogate: System.Text.Json can't read the source into a string" };
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

    // Whether a JSON string literal, as written in the request, escapes a
    // UTF-16 surrogate that isn't half of a pair.
    private static bool HasLoneSurrogate(string json)
    {
        var units = new List<char>();
        for (var i = 0; i < json.Length; i++)
        {
            if (json[i] != '\\' || i + 1 >= json.Length)
            {
                units.Add(json[i]);
            }
            else if (json[i + 1] == 'u' && i + 5 < json.Length
                && ushort.TryParse(json.AsSpan(i + 2, 4), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out var unit))
            {
                units.Add((char)unit);
                i += 5;
            }
            else
            {
                units.Add(json[i + 1]);
                i++;
            }
        }
        for (var i = 0; i < units.Count; i++)
        {
            if (char.IsHighSurrogate(units[i]) && i + 1 < units.Count && char.IsLowSurrogate(units[i + 1])) i++;
            else if (char.IsSurrogate(units[i])) return true;
        }
        return false;
    }

    // Is the document valid against the schema? DocumentValidator, as
    // DocumentExecuter runs it. That runs graphql-dotnet's core rules over
    // the whole document, and then, for the operation the request selected,
    // coerces its variables with the request's values and parses its
    // arguments with them (DocumentValidator.ValidateAsyncCoreAsync). Only
    // the rules' verdict is the same for every request; the rest depends on
    // the variable values, which a validate vector doesn't have. So:
    // - The rules run once, with no operation selected, which makes
    //   GetVariablesValuesAsync and ParseArgumentVisitor do nothing.
    // - If they pass, each operation is selected in turn, with no rules and
    //   no variable values, so that argument parsing reports the literals
    //   graphql-dotnet refuses (such as `{}` for a OneOf input object).
    //   Errors that depend on the variable values aren't counted: an
    //   InvalidVariableError (a Non-Null variable with no value, which also
    //   ends validation before arguments are parsed), and an argument error
    //   whose value holds a variable, which is parsed with the variable's
    //   default or with null here, not with a value a request would give.
    //   So for an operation with a required variable, argument literals are
    //   only checked by the rules.
    private static JsonObject Validate(JsonElement request)
    {
        var sdl = request.GetProperty("schema").GetString()!;
        if (!ValidationSchemas.TryGetValue(sdl, out var schema))
        {
            schema = Schemas.Build(sdl);
            ValidationSchemas[sdl] = schema;
        }
        var document = DocumentBuilder.Build(request.GetProperty("document").GetString()!);
        var errors = new JsonArray();
        var seen = new HashSet<string>();
        void Add(ExecutionError error)
        {
            var entry = new JsonObject { ["message"] = error.Message };
            if (error.Locations is { Count: > 0 } locations)
            {
                entry["locations"] = new JsonArray(locations
                    .Select(l => (JsonNode)new JsonObject { ["line"] = l.Line, ["column"] = l.Column }).ToArray());
            }
            if (seen.Add(entry.ToJsonString())) errors.Add(entry);
        }
        ValidationOptions Options(GraphQLOperationDefinition? operation, IEnumerable<IValidationRule> rules) => new()
        {
            Schema = schema,
            Document = document,
            Operation = operation!,
            Rules = rules,
            Variables = Inputs.Empty,
            Extensions = Inputs.Empty,
        };

        var byRules = Validator.ValidateAsync(Options(null, DocumentValidator.CoreRules)).GetAwaiter().GetResult();
        foreach (var error in byRules.Errors) Add(error);
        if (errors.Count == 0)
        {
            foreach (var operation in document.Definitions.OfType<GraphQLOperationDefinition>())
            {
                var parsed = Validator.ValidateAsync(Options(operation, [])).GetAwaiter().GetResult();
                foreach (var error in parsed.Errors)
                {
                    if (error is InvalidVariableError || (error is ValidationError v && v.Nodes.Any(HoldsVariable))) continue;
                    Add(error);
                }
            }
        }
        return new JsonObject { ["valid"] = errors.Count == 0, ["errors"] = errors };
    }

    private static bool HoldsVariable(ASTNode node) => node switch
    {
        GraphQLVariable => true,
        GraphQLListValue list => list.Values?.Any(HoldsVariable) ?? false,
        GraphQLObjectValue obj => obj.Fields?.Any(f => HoldsVariable(f.Value)) ?? false,
        GraphQLObjectField field => HoldsVariable(field.Value),
        GraphQLArgument argument => HoldsVariable(argument.Value),
        _ => false,
    };

    // Is the SDL schema valid? Schema.For, then Initialize, which validates
    // the schema. graphql-dotnet reports an invalid schema by throwing
    // ArgumentException (SchemaBuilder's duplicate names, NameValidator) or
    // InvalidOperationException (SchemaTypes, SchemaValidationVisitor), and
    // the parser throws GraphQLSyntaxErrorException. Those are rejections.
    // ArgumentNullException is an ArgumentException too, but graphql-dotnet
    // throws it from its own null checks (such as PossibleTypes.Add, given
    // the null that SchemaBuilder's `as IObjectGraphType` makes of a union
    // member that isn't an object type): a crash, not a rejection. Any other
    // exception is a crash, answered with `error` (docs/kit/schema.md).
    private static JsonObject SchemaValid(JsonElement request)
    {
        try
        {
            Schemas.Build(request.GetProperty("sdl").GetString()!);
            return new JsonObject { ["valid"] = true };
        }
        catch (Exception error) when (error is (ArgumentException and not ArgumentNullException) or InvalidOperationException or AggregateException or GraphQLSyntaxErrorException)
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
