// The kit's areas beyond execution (docs/kit-areas.md, docs/kit/*.md):
// parse, validate, coerce, schema and introspect. Each answers a request
// with graphql-java's own APIs, the way an application would use them.

package graphqltla;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import graphql.ExecutionInput;
import graphql.ExecutionResult;
import graphql.GraphQL;
import graphql.GraphQLException;
import graphql.ParseAndValidate;
import graphql.ParseAndValidateResult;
import graphql.execution.preparsed.PreparsedDocumentEntry;
import graphql.execution.preparsed.PreparsedDocumentProvider;
import graphql.introspection.GoodFaithIntrospection;
import graphql.language.Definition;
import graphql.language.Document;
import graphql.language.FragmentDefinition;
import graphql.language.OperationDefinition;
import graphql.language.SourceLocation;
import graphql.parser.Parser;
import graphql.schema.DataFetcher;
import graphql.schema.GraphQLSchema;
import graphql.schema.idl.FieldWiringEnvironment;
import graphql.schema.idl.RuntimeWiring;
import graphql.schema.idl.SchemaGenerator;
import graphql.schema.idl.SchemaParser;
import graphql.schema.idl.WiringFactory;
import graphql.validation.ValidationError;
import graphql.validation.Validator;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

final class Areas {
    private static final ObjectMapper JSON = new ObjectMapper();

    static final List<String> NAMES = List.of("parse", "validate", "coerce", "schema", "introspect");

    // Started with --validate, coerce runs graphql-java's whole pipeline,
    // validation included, and doesn't claim `unvalidated`.
    static boolean validating;

    static List<String> capabilities() {
        List<String> capabilities = new ArrayList<>(NAMES);
        // validate: RuntimeWiring.MOCKED_WIRING's custom scalars parse every
        // literal (MockedWiringFactory#getScalar).
        capabilities.add("custom-scalar-literals");
        // validate and introspect: SchemaGenerator builds the SDL's
        // `directive @label(...) on ...` definitions.
        capabilities.add("custom-directives");
        // coerce: graphql-java leaves an argument or input field with no value
        // out of the argument map (ValuesResolver#getArgumentValuesImpl), so
        // absent and null differ.
        capabilities.add("absent-vs-null");
        if (!validating) capabilities.add("unvalidated");
        return capabilities;
    }

    // The result's fields for a request, or throws if the adapter failed.
    static Map<String, Object> answer(String area, JsonNode request) throws Exception {
        return switch (area) {
            case "parse" -> parse(request.get("source").asText());
            case "validate" -> validate(request.get("schema").asText(), request.get("document").asText());
            case "coerce" -> coerce(request);
            case "schema" -> schema(request.get("sdl").asText());
            case "introspect" -> introspect(request.get("sdl").asText(), request.get("query").asText());
            default -> throw new IllegalArgumentException("unknown area " + area);
        };
    }

    // ---- parse ----

    // Parsed as GraphQL parses a request's document: ParseAndValidate.parse,
    // with the default operation parser options. graphql-java's parser also
    // reads the type system language, so every definition must be an
    // operation or a fragment.
    static Map<String, Object> parse(String source) {
        ParseAndValidateResult result = ParseAndValidate.parse(ExecutionInput.newExecutionInput().query(source).build());
        Map<String, Object> answer = new LinkedHashMap<>();
        if (result.isFailure()) {
            answer.put("ok", false);
            answer.put("error", result.getSyntaxException().getMessage());
            return answer;
        }
        boolean executable = true;
        for (Definition<?> d : result.getDocument().getDefinitions()) {
            if (!(d instanceof OperationDefinition || d instanceof FragmentDefinition)) executable = false;
        }
        answer.put("ok", executable);
        return answer;
    }

    // ---- validate ----

    private static final Map<String, GraphQLSchema> mockedSchemas = new HashMap<>();

    // A schema built from SDL with RuntimeWiring.MOCKED_WIRING, graphql-java's
    // wiring for a schema that is inspected, not executed: a type resolver for
    // every interface and union, and a scalar for every custom scalar.
    static GraphQLSchema mockedSchema(String sdl) {
        return mockedSchemas.computeIfAbsent(sdl, s -> new SchemaGenerator().makeExecutableSchema(new SchemaParser().parse(s), RuntimeWiring.MOCKED_WIRING));
    }

    // Validated with every rule GraphQL applies to a request: Validator with
    // no rule predicate and no complexity limits, as GraphQL#validate calls it
    // by default. The vectors' schemas are valid and their documents parse.
    // Good Faith Introspection stays on, as it is by default; it reports by
    // throwing GoodFaithIntrospectionExceeded, which GraphQL turns into an
    // error response (GraphQL#parseAndValidate), so that is a rejection too.
    // Any other exception, from building, parsing or the validator itself,
    // propagates: the caller answers with an `error`, which the kit reports
    // as a crash (docs/kit/validate.md). The validator throws on some
    // subscriptions whose root field has @skip or @include (README.md).
    static Map<String, Object> validate(String sdl, String source) {
        GraphQLSchema schema = mockedSchema(sdl);
        Document document = Parser.parse(source);
        List<Map<String, Object>> errors = new ArrayList<>();
        try {
            for (ValidationError e : new Validator().validateDocument(schema, document, Locale.ENGLISH)) {
                errors.add(error(e.getMessage(), e.getLocations()));
            }
        } catch (graphql.validation.GoodFaithIntrospectionExceeded e) {
            errors.add(error(e.toBadFaithError().getMessage(), null));
        }
        Map<String, Object> answer = new LinkedHashMap<>();
        answer.put("valid", errors.isEmpty());
        answer.put("errors", errors);
        return answer;
    }

    static Map<String, Object> error(String message, List<SourceLocation> locations) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("message", message);
        if (locations != null && !locations.isEmpty()) {
            List<Map<String, Object>> list = new ArrayList<>();
            for (SourceLocation l : locations) list.add(Map.of("line", l.getLine(), "column", l.getColumn()));
            error.put("locations", list);
        }
        return error;
    }

    // ---- coerce ----

    // The calls of the request being executed. Everything runs on the thread
    // that reads stdin, and graphql-java runs synchronous data fetchers on the
    // calling thread.
    private static List<Map<String, Object>> calls;

    private static final Map<String, GraphQL> coerceEngines = new HashMap<>();

    // Every field's data fetcher records its path and the arguments
    // graphql-java coerced, and returns "ok". graphql-java coerces arguments
    // lazily, when the data fetcher first asks for them
    // (ExecutionStrategy#fetchField). If they can't be coerced, asking throws,
    // graphql-java reports a field error, and no call is recorded: the
    // resolver never got arguments.
    private static final DataFetcher<Object> RECORDER = env -> {
        Map<String, Object> arguments = env.getArguments();
        List<Object> path = new ArrayList<>(env.getExecutionStepInfo().getPath().toList());
        Map<String, Object> call = new LinkedHashMap<>();
        call.put("path", path);
        call.put("arguments", toJson(arguments));
        calls.add(call);
        return "ok";
    };

    // Unvalidated: a PreparsedDocumentProvider, graphql-java's hook for
    // documents parsed and validated earlier, hands over the parsed document
    // without calling the parse-and-validate function, so GraphQL executes it
    // without validating.
    private static final PreparsedDocumentProvider PARSE_ONLY = (input, parseAndValidate) -> {
        ParseAndValidateResult parsed = ParseAndValidate.parse(input);
        return CompletableFuture.completedFuture(parsed.isFailure()
                ? new PreparsedDocumentEntry(parsed.getSyntaxException().toInvalidSyntaxError())
                : new PreparsedDocumentEntry(parsed.getDocument()));
    };

    static GraphQL coerceEngine(String sdl) {
        return coerceEngines.computeIfAbsent(sdl, s -> {
            WiringFactory wiring = new WiringFactory() {
                @Override
                public boolean providesDataFetcher(FieldWiringEnvironment environment) {
                    return true;
                }

                @Override
                public DataFetcher<?> getDataFetcher(FieldWiringEnvironment environment) {
                    return RECORDER;
                }
            };
            GraphQLSchema schema = new SchemaGenerator().makeExecutableSchema(
                    new SchemaParser().parse(s), RuntimeWiring.newRuntimeWiring().wiringFactory(wiring).build());
            GraphQL.Builder builder = GraphQL.newGraphQL(schema);
            if (!validating) builder.preparsedDocumentProvider(PARSE_ONLY);
            return builder.build();
        });
    }

    // The variables are read with Jackson, as a Java server would read a
    // request body: integers as Integer, Long or BigInteger (exact), other
    // numbers as Double. So 1e400 is Infinity before graphql-java sees it, and
    // the adapter doesn't claim `exact-numbers`.
    @SuppressWarnings("unchecked")
    static Map<String, Object> coerce(JsonNode request) throws Exception {
        Map<String, Object> variables = JSON.readValue(request.get("variables").asText(), Map.class);
        ExecutionInput.Builder input = ExecutionInput.newExecutionInput()
                .query(request.get("document").asText())
                .variables(variables == null ? Map.of() : variables);
        if (request.hasNonNull("operationName")) input.operationName(request.get("operationName").asText());
        calls = new ArrayList<>();
        Map<String, Object> answer = new LinkedHashMap<>();
        try {
            // If GraphQL.execute throws instead of returning a result, the
            // client gets no response, so the exception propagates and the
            // caller answers with an `error`: the kit's "no response"
            // (docs/kit/coerce.md). Unvalidated, a document with no operation
            // and no operationName does that (README.md).
            ExecutionResult result = coerceEngine(request.get("schema").asText()).execute(input.build());
            answer.put("response", result.toSpecification());
            answer.put("calls", calls);
        } finally {
            calls = null;
        }
        return answer;
    }

    // Arguments as JSON (docs/kit/coerce.md): JSON can't hold a non-finite
    // number, so that becomes a string. Enum values are their names, which is
    // what an SDL enum without wiring has as values.
    static Object toJson(Object value) {
        if (value instanceof Double d && !Double.isFinite(d)) return String.valueOf(d);
        if (value instanceof Float f && !Float.isFinite(f)) return String.valueOf(f);
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Map.Entry<?, ?> e : map.entrySet()) out.put(String.valueOf(e.getKey()), toJson(e.getValue()));
            return out;
        }
        if (value instanceof List<?> list) {
            List<Object> out = new ArrayList<>();
            for (Object item : list) out.add(toJson(item));
            return out;
        }
        return value;
    }

    // ---- schema ----

    // Built as an application builds a schema from SDL: SchemaParser, then
    // SchemaGenerator, which runs the SDL checks (SchemaTypeChecker) and
    // builds the GraphQLSchema, whose builder runs SchemaValidator. Each
    // reports an invalid schema with a GraphQLException: InvalidSyntaxException,
    // SchemaProblem, InvalidSchemaException, or AssertException (for example
    // a name that isn't valid). Those are `valid: false`. Anything else, such
    // as a NullPointerException or a StackOverflowError, is a crash: the
    // caller answers with an `error` (docs/kit/schema.md).
    static Map<String, Object> schema(String sdl) {
        Map<String, Object> answer = new LinkedHashMap<>();
        try {
            new SchemaGenerator().makeExecutableSchema(new SchemaParser().parse(sdl), RuntimeWiring.MOCKED_WIRING);
            answer.put("valid", true);
        } catch (GraphQLException e) {
            answer.put("valid", false);
            answer.put("errors", List.of(e.getClass().getSimpleName() + ": " + e.getMessage()));
        }
        return answer;
    }

    // ---- introspect ----

    // The kit's query, executed with GraphQL against the schema built from
    // the SDL. Good Faith Introspection is turned off for the request with
    // its documented per-request switch: by default it allows one __schema
    // and one __type per operation, and each __Type list field once, and the
    // kit's queries ask for more (README.md).
    static boolean goodFaith;

    static Map<String, Object> introspect(String sdl, String query) {
        Map<String, Object> answer = new LinkedHashMap<>();
        GraphQLSchema schema;
        try {
            schema = new SchemaGenerator().makeExecutableSchema(new SchemaParser().parse(sdl), RuntimeWiring.MOCKED_WIRING);
        } catch (GraphQLException e) {
            answer.put("response", Map.of("errors", List.of(Map.of("message", "SchemaGenerator: " + e.getMessage()))));
            return answer;
        }
        ExecutionInput.Builder input = ExecutionInput.newExecutionInput().query(query);
        if (!goodFaith) input.graphQLContext(Map.of(GoodFaithIntrospection.GOOD_FAITH_INTROSPECTION_DISABLED, true));
        ExecutionResult result = GraphQL.newGraphQL(schema).build().execute(input.build());
        answer.put("response", result.toSpecification());
        return answer;
    }
}
