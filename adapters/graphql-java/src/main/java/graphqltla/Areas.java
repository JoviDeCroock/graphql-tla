// The kit's areas beyond execution (docs/kit-areas.md, docs/kit/*.md):
// parse, validate, coerce, schema and introspect. Each answers a request
// with graphql-java's own APIs, the way an application would use them.
// coordinate isn't claimed: graphql-java has no schema coordinate parser or
// resolver (FieldCoordinates is a type and field name pair, not §2.14).

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
import graphql.language.SDLDefinition;
import graphql.language.SDLExtensionDefinition;
import graphql.language.SourceLocation;
import graphql.parser.InvalidSyntaxException;
import graphql.parser.exceptions.ParseCancelledException;
import graphql.parser.exceptions.ParseCancelledTooDeepException;
import graphql.parser.exceptions.ParseCancelledTooManyCharsException;
import graphql.parser.exceptions.ParseCancelledTooManyNumericLiteralCharactersException;
import graphql.parser.Parser;
import graphql.parser.ParserEnvironment;
import graphql.parser.ParserOptions;
import graphql.schema.DataFetcher;
import graphql.schema.GraphQLList;
import graphql.schema.GraphQLObjectType;
import graphql.schema.GraphQLSchema;
import graphql.schema.GraphQLType;
import graphql.schema.GraphQLTypeUtil;
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
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;

final class Areas {
    private static final ObjectMapper JSON = new ObjectMapper();

    static final List<String> NAMES = List.of("parse", "validate", "coerce", "schema", "introspect");

    // Started with --validate, coerce runs graphql-java's whole pipeline,
    // validation included, and doesn't claim `unvalidated`.
    static boolean validating;

    static List<String> capabilities() {
        List<String> capabilities = new ArrayList<>(NAMES);
        // parse: the type system grammars, with the parser SchemaParser uses.
        capabilities.add("parse-sdl");
        // schema: SchemaParser and SchemaGenerator take a document with type
        // system extensions, and apply them to the definitions they extend.
        capabilities.add("schema-extensions");
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
        // coerce: objects for object fields, a subscription through
        // GraphQL.execute's subscription strategy, and the request's
        // extensions in ExecutionInput.
        capabilities.add("nested-fields");
        capabilities.add("subscription-source");
        capabilities.add("request-extensions");
        return capabilities;
    }

    // The result's fields for a request, or throws if the adapter failed.
    static Map<String, Object> answer(String area, JsonNode request) throws Exception {
        return switch (area) {
            case "parse" -> parse(request.get("source").asText(), request.hasNonNull("grammar") ? request.get("grammar").asText() : "executable");
            case "validate" -> validate(request.get("schema").asText(), request.get("document").asText());
            case "coerce" -> coerce(request);
            case "schema" -> schema(request.get("sdl").asText());
            case "introspect" -> introspect(request.get("sdl").asText(), request.get("query").asText());
            default -> throw new IllegalArgumentException("unknown area " + area);
        };
    }

    // ---- parse ----

    // An executable document is parsed as GraphQL parses a request's
    // document: ParseAndValidate.parse, with the default operation parser
    // options. graphql-java's parser reads the whole Document grammar, so
    // every definition must be an operation or a fragment. A type system
    // grammar (parse-sdl) is parsed as SchemaParser parses SDL: Parser.parse
    // with the default SDL parser options, without building a registry. Then
    // every definition must be of a kind the grammar allows. graphql-java's
    // limits (ParserOptions: tokens, characters, rule depth, numeric literal
    // length) throw ParseCancelledException, an InvalidSyntaxException: a
    // refusal, `ok: false`.
    static Map<String, Object> parse(String source, String grammar) {
        if (!"executable".equals(grammar)) return parseSdl(source, grammar);
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

    static Map<String, Object> parseSdl(String source, String grammar) {
        Map<String, Object> answer = new LinkedHashMap<>();
        Document document;
        try {
            document = Parser.parse(ParserEnvironment.newParserEnvironment()
                    .document(source)
                    .parserOptions(ParserOptions.getDefaultSdlParserOptions())
                    .build());
        } catch (InvalidSyntaxException e) {
            answer.put("ok", false);
            answer.put("error", e.getMessage());
            return answer;
        }
        boolean ok = true;
        for (Definition<?> d : document.getDefinitions()) {
            ok &= switch (grammar) {
                case "typeSystem" -> d instanceof SDLDefinition && !(d instanceof SDLExtensionDefinition);
                case "typeSystemExtension" -> d instanceof SDLDefinition;
                case "document" -> true;
                default -> throw new IllegalArgumentException("unknown grammar " + grammar);
            };
        }
        answer.put("ok", ok);
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
    //
    // The document is parsed as GraphQL parses a request's: ParseAndValidate.parse,
    // with the default operation parser options. A document over one of their
    // documented limits (ParserOptions; the ParseCancelled* exceptions, such
    // as a numeric literal longer than 100 characters) is refused, and GraphQL answers it with an
    // error response: a rejection. Any other syntax error is a crash, since
    // every vector parses.
    static Map<String, Object> validate(String sdl, String source) {
        GraphQLSchema schema = mockedSchema(sdl);
        List<Map<String, Object>> errors = new ArrayList<>();
        ParseAndValidateResult parsed = ParseAndValidate.parse(ExecutionInput.newExecutionInput().query(source).build());
        if (parsed.isFailure()) {
            InvalidSyntaxException syntax = parsed.getSyntaxException();
            if (!(syntax instanceof ParseCancelledException
                    || syntax instanceof ParseCancelledTooDeepException
                    || syntax instanceof ParseCancelledTooManyCharsException
                    || syntax instanceof ParseCancelledTooManyNumericLiteralCharactersException)) throw syntax;
            errors.add(error(syntax.getMessage(), null));
            return Map.of("valid", false, "errors", errors);
        }
        Document document = parsed.getDocument();
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

    // The calls of the request being executed, the source stream resolver's
    // calls (subscription-source), and what that resolver does ("stream" or
    // "raise"). Everything runs on the thread that reads stdin, and
    // graphql-java runs synchronous data fetchers on the calling thread.
    private static List<Map<String, Object>> calls;
    private static List<Map<String, Object>> sourceCalls;
    private static String subscribe;

    private static final Map<String, GraphQL> coerceEngines = new HashMap<>();

    // What a field's data fetcher returns, by its type (nested-fields): "ok"
    // for a leaf, an object for an object type, two of them for a list of
    // objects.
    static Object valueFor(GraphQLType type) {
        GraphQLType bare = GraphQLTypeUtil.unwrapNonNull(type);
        if (bare instanceof GraphQLList list) {
            Object item = valueFor(list.getWrappedType());
            return item instanceof Map ? List.of(new LinkedHashMap<>(), new LinkedHashMap<>()) : List.of(item);
        }
        return bare instanceof GraphQLObjectType ? new LinkedHashMap<>() : "ok";
    }

    static Map<String, Object> call(List<Object> path, Map<String, Object> arguments) {
        Map<String, Object> call = new LinkedHashMap<>();
        call.put("path", path);
        call.put("arguments", toJson(arguments));
        return call;
    }

    // Every field's data fetcher records its path and the arguments
    // graphql-java coerced, and returns what the field's type needs.
    // graphql-java coerces arguments lazily, when the data fetcher first asks
    // for them (ExecutionStrategy#fetchField). If they can't be coerced,
    // asking throws, graphql-java reports a field error, and no call is
    // recorded: the resolver never got arguments.
    //
    // A subscription root field's data fetcher is its source stream resolver
    // (SubscriptionExecutionStrategy#createSourceEventStream): it records a
    // source call, then raises or returns a stream of one event. graphql-java
    // uses each event as the root field's value; it doesn't resolve the root
    // field again on the event. So, as in execution (README.md), the event
    // stands for the root field's resolution: when the stream emits it, the
    // adapter records the root call, with the arguments the source stream
    // resolver got.
    private static final DataFetcher<Object> RECORDER = env -> {
        Map<String, Object> arguments = env.getArguments();
        List<Object> path = new ArrayList<>(env.getExecutionStepInfo().getPath().toList());
        if (env.getParentType() == env.getGraphQLSchema().getSubscriptionType()) {
            Map<String, Object> source = new LinkedHashMap<>();
            source.put("field", env.getField().getName());
            source.put("arguments", toJson(arguments));
            sourceCalls.add(source);
            if ("raise".equals(subscribe)) throw new RuntimeException("the source stream can't be established");
            Object event = valueFor(env.getFieldType());
            List<Map<String, Object>> recorded = calls;
            Flow.Publisher<Object> stream = subscriber -> subscriber.onSubscribe(new Flow.Subscription() {
                boolean sent;

                @Override
                public void request(long n) {
                    if (sent || n <= 0) return;
                    sent = true;
                    recorded.add(call(path, arguments));
                    subscriber.onNext(event);
                    subscriber.onComplete();
                }

                @Override
                public void cancel() {}
            });
            return stream;
        }
        calls.add(call(path, arguments));
        return valueFor(env.getFieldType());
    };

    // Unvalidated: a PreparsedDocumentProvider, graphql-java's hook for
    // documents parsed and validated earlier, hands over the parsed document
    // without calling the parse-and-validate function, so GraphQL executes it
    // without validating. A syntax error is GraphQL's own request error.
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

    // The variables, and the request's extensions (request-extensions), are
    // read with Jackson, as a Java server would read a request body:
    // integers as Integer, Long or BigInteger (exact), other numbers as
    // Double. So 1e400 is Infinity before graphql-java sees it, and the
    // adapter doesn't claim `exact-numbers`. The extensions go to
    // ExecutionInput#extensions, where a server puts them.
    @SuppressWarnings("unchecked")
    static Map<String, Object> coerce(JsonNode request) throws Exception {
        Map<String, Object> variables = JSON.readValue(request.get("variables").asText(), Map.class);
        ExecutionInput.Builder input = ExecutionInput.newExecutionInput()
                .query(request.get("document").asText())
                .variables(variables == null ? Map.of() : variables);
        if (request.hasNonNull("operationName")) input.operationName(request.get("operationName").asText());
        if (request.hasNonNull("extensions")) {
            Map<String, Object> extensions = JSON.readValue(request.get("extensions").asText(), Map.class);
            if (extensions != null) input.extensions(extensions);
        }
        calls = new ArrayList<>();
        sourceCalls = new ArrayList<>();
        subscribe = request.hasNonNull("subscribe") ? request.get("subscribe").asText() : null;
        Map<String, Object> answer = new LinkedHashMap<>();
        try {
            // If GraphQL.execute throws instead of returning a result, the
            // client gets no response, so the exception propagates and the
            // caller answers with an `error`: the kit's "no response"
            // (docs/kit/coerce.md). Unvalidated, a document with no operation
            // and no operationName does that (README.md).
            ExecutionResult result = coerceEngine(request.get("schema").asText()).execute(input.build());
            // A subscription: the response is the first result of the
            // response stream, which is then closed. A result without a
            // stream (the source stream couldn't be created) is the response.
            if (result.getData() instanceof org.reactivestreams.Publisher<?> stream) result = firstResult(stream);
            answer.put("response", result.toSpecification());
            answer.put("calls", calls);
            if (subscribe != null) answer.put("sourceCalls", sourceCalls);
        } finally {
            calls = null;
            sourceCalls = null;
            subscribe = null;
        }
        return answer;
    }

    // The first result a subscription's response stream publishes. Every
    // data fetcher is synchronous, so it arrives while request(1) runs; if it
    // doesn't, or the stream ends without one, the client got no response.
    @SuppressWarnings("unchecked")
    static ExecutionResult firstResult(org.reactivestreams.Publisher<?> stream) throws Exception {
        CompletableFuture<ExecutionResult> first = new CompletableFuture<>();
        ((org.reactivestreams.Publisher<ExecutionResult>) stream).subscribe(new org.reactivestreams.Subscriber<>() {
            org.reactivestreams.Subscription subscription;

            @Override
            public void onSubscribe(org.reactivestreams.Subscription s) {
                subscription = s;
                s.request(1);
            }

            @Override
            public void onNext(ExecutionResult event) {
                first.complete(event);
                subscription.cancel();
            }

            @Override
            public void onError(Throwable t) {
                first.completeExceptionally(t);
            }

            @Override
            public void onComplete() {
                if (!first.isDone()) first.completeExceptionally(new IllegalStateException("the response stream ended without a result"));
            }
        });
        return first.get(10, TimeUnit.SECONDS);
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
