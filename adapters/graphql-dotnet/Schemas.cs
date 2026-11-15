using GraphQL.Types;
using GraphQLParser.AST;

namespace GraphQLTla.GraphQLDotnet;

public static class Schemas
{
    private static readonly Dictionary<string, Schema> ForExecutions = [];
    private static readonly string[] SpecScalars = ["Int", "Float", "String", "Boolean", "ID"];

    // A schema for an execution. Cached by SDL.
    public static Schema ForExecution(string sdl)
    {
        if (ForExecutions.TryGetValue(sdl, out var cached)) return cached;
        var schema = Build(sdl);
        ForExecutions[sdl] = schema;
        return schema;
    }

    // A schema for the kit's SDL, built with graphql-dotnet's schema-first
    // support (Schema.For), plus what an application has to supply for any
    // SDL:
    // - resolvers: the kit's resolver on every field, and a one-event source
    //   stream on every field (graphql-dotnet only uses it on the
    //   subscription root). Schema validation rejects a subscription root
    //   field without a StreamResolver (SchemaValidationVisitor), so the
    //   validate, schema and introspect areas get them too, though they
    //   never run there.
    // - type resolution for interfaces and unions. Schema initialization
    //   rejects a union or interface with neither ResolveType nor IsTypeOf
    //   on its possible types (SchemaTypes.AddType). It picks the object
    //   type the kit named.
    // - a scalar type for each `scalar X`. SchemaBuilder skips scalar
    //   definitions, so a reference to X fails to resolve unless the
    //   application registers a ScalarGraphType named X. This registers
    //   graphql-dotnet's ComplexScalarGraphType, which accepts any value.
    public static Schema Build(string sdl)
    {
        var definitions = GraphQLParser.Parser.Parse(sdl).Definitions;
        Schema? schema = null;
        schema = Schema.For(sdl, builder =>
        {
            builder.Types.ForAll(type => type.ResolveType = value =>
                value is TlaObject o ? (schema!.AllTypes[o.TypeName] as IObjectGraphType)! : null!);
            foreach (var definition in definitions.OfType<GraphQLObjectTypeDefinition>())
            {
                var type = builder.Types.For(definition.Name.StringValue);
                foreach (var field in definition.Fields?.Items ?? [])
                {
                    var config = type.FieldFor(field.Name.StringValue);
                    config.Resolver = KitResolver.Instance;
                    config.StreamResolver = OneEventStream.Instance;
                }
            }
        });
        foreach (var scalar in definitions.OfType<GraphQLScalarTypeDefinition>())
        {
            var name = scalar.Name.StringValue;
            if (!SpecScalars.Contains(name)) schema.RegisterType(new ComplexScalarGraphType { Name = name });
        }
        schema.Initialize();
        return schema;
    }
}
