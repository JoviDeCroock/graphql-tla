// A graphql-tla adapter for graphql-java (docs/conformance.md).
//
// Every field gets one data fetcher, which tells the kit it was called and
// returns a CompletableFuture that the kit settles. Everything runs on one
// thread, the one reading stdin: graphql-java executes data fetchers and
// CompletableFuture continuations on the thread that calls executeAsync or
// completes a future, and this adapter installs no executor. So when
// executeAsync or complete() returns, the engine is blocked on kit futures
// only, and the adapter can say `idle`.
//
// Usage: java -jar graphql-java-adapter.jar [--no-idle]
//
// --no-idle leaves out `idle`, to exercise the kit's grace-based fallback.

package graphqltla;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import graphql.ExecutionInput;
import graphql.ExecutionResult;
import graphql.GraphQL;
import graphql.GraphqlErrorBuilder;
import graphql.execution.DataFetcherResult;
import graphql.language.AstPrinter;
import graphql.language.Definition;
import graphql.language.Directive;
import graphql.language.Document;
import graphql.language.OperationDefinition;
import graphql.parser.Parser;
import graphql.schema.DataFetcher;
import graphql.schema.DataFetchingEnvironment;
import graphql.schema.GraphQLEnumType;
import graphql.schema.GraphQLList;
import graphql.schema.GraphQLNamedType;
import graphql.schema.GraphQLSchema;
import graphql.schema.GraphQLType;
import graphql.schema.GraphQLTypeUtil;
import graphql.schema.TypeResolver;
import graphql.schema.idl.FieldWiringEnvironment;
import graphql.schema.idl.InterfaceWiringEnvironment;
import graphql.schema.idl.RuntimeWiring;
import graphql.schema.idl.SchemaGenerator;
import graphql.schema.idl.SchemaParser;
import graphql.schema.idl.UnionWiringEnvironment;
import graphql.schema.idl.WiringFactory;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Flow;
import java.util.function.Consumer;

public final class Adapter {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final PrintStream OUT = new PrintStream(new java.io.FileOutputStream(java.io.FileDescriptor.out), false, StandardCharsets.UTF_8);
    private static final Object OUT_LOCK = new Object();

    private static void send(Map<String, Object> message) {
        try {
            String line = JSON.writeValueAsString(message);
            synchronized (OUT_LOCK) {
                OUT.print(line);
                OUT.print('\n');
                OUT.flush();
            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private static Map<String, Object> msg(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    // A resolver call the kit hasn't settled yet.
    private record Pending(List<String> path, GraphQLType type, Consumer<JsonNode> settle) {}

    private static final class Execution {
        final int id;
        final GraphQLSchema schema;
        final Map<Integer, Pending> calls = new HashMap<>();
        int nextCall = 1;
        // Settles applied so far; each call is stamped with it as `after`.
        int settled;
        boolean ended;

        Execution(int id, GraphQLSchema schema) {
            this.id = id;
            this.schema = schema;
        }

        int call(List<String> path, GraphQLType type, Consumer<JsonNode> settle) {
            int call = nextCall++;
            calls.put(call, new Pending(path, type, settle));
            send(msg("type", "call", "id", id, "call", call, "path", path, "returnType", GraphQLTypeUtil.simplePrint(type), "after", settled));
            return call;
        }
    }

    private static final Map<Integer, Execution> executions = new HashMap<>();

    // The value a resolver returns for each outcome (docs/conformance.md).
    static Object leafValue(GraphQLType type) {
        GraphQLNamedType named = GraphQLTypeUtil.unwrapAllAs(type);
        if (named instanceof GraphQLEnumType e) return e.getValues().get(0).getValue();
        return switch (named.getName()) {
            case "Int" -> 1;
            case "Float" -> 1.5;
            case "Boolean" -> true;
            default -> "v";
        };
    }

    // The value for a settled outcome. Without `deferred-items`, a list's
    // items come inline, and are never errors.
    static Object value(JsonNode outcome, GraphQLType type) {
        GraphQLType nullable = GraphQLTypeUtil.unwrapNonNull(type);
        switch (outcome.get("kind").asText()) {
            case "null":
                return null;
            case "leaf":
                // At a list position (a wrong shape), the number 1.
                return nullable instanceof GraphQLList ? 1 : leafValue(nullable);
            case "object": {
                Map<String, Object> object = new LinkedHashMap<>();
                object.put("__typename", outcome.get("type").asText());
                return object;
            }
            case "list": {
                GraphQLType itemType = ((GraphQLList) nullable).getWrappedType();
                List<Object> items = new ArrayList<>();
                JsonNode inline = outcome.get("items");
                int length = outcome.get("length").asInt();
                for (int i = 0; i < length; i++) items.add(value(inline.get(i), itemType));
                return items;
            }
            default:
                throw new IllegalArgumentException("unknown outcome " + outcome);
        }
    }

    static List<String> pathOf(DataFetchingEnvironment env) {
        List<String> path = new ArrayList<>();
        for (Object segment : env.getExecutionStepInfo().getPath().toList()) path.add(String.valueOf(segment));
        return path;
    }

    static RuntimeException failure(List<String> path) {
        return new RuntimeException("resolver at " + String.join(".", path) + " failed");
    }

    // The one data fetcher on every field.
    static DataFetcher<Object> fetcher(Execution execution) {
        return env -> {
            List<String> path = pathOf(env);
            GraphQLType type = env.getFieldType();
            if (env.getParentType() == execution.schema.getSubscriptionType()) {
                // Called once, to create the source stream (CreateSourceEventStream).
                return sourceStream(execution, path, type);
            }
            CompletableFuture<Object> future = new CompletableFuture<>();
            execution.call(path, type, outcome -> {
                if ("error".equals(outcome.get("kind").asText())) future.completeExceptionally(failure(path));
                else future.complete(value(outcome, type));
            });
            return future;
        };
    }

    // graphql-java uses each source stream event as the root field's value; it
    // doesn't resolve the root field again per event. So the source stream's
    // request for its one event is the root `call`, and the settled outcome is
    // the event (docs/conformance.md, capabilities). The event is a
    // DataFetcherResult (Reactive Streams forbids null events), carrying the
    // error if the outcome is one; graphql-java reports that error as a field
    // error of the root field.
    static Flow.Publisher<Object> sourceStream(Execution execution, List<String> path, GraphQLType type) {
        return subscriber -> subscriber.onSubscribe(new Flow.Subscription() {
            boolean requested;

            @Override
            public void request(long n) {
                if (requested || n <= 0) return;
                requested = true;
                execution.call(path, type, outcome -> {
                    DataFetcherResult.Builder<Object> event = DataFetcherResult.newResult();
                    if ("error".equals(outcome.get("kind").asText())) {
                        event.data(null).error(GraphqlErrorBuilder.newError()
                                .message(failure(path).getMessage())
                                .path(new ArrayList<Object>(path))
                                .build());
                    } else {
                        event.data(value(outcome, type));
                    }
                    subscriber.onNext(event.build());
                    subscriber.onComplete();
                });
            }

            @Override
            public void cancel() {}
        });
    }

    static TypeResolver typeResolver = env -> {
        Object value = env.getObject();
        if (!(value instanceof Map<?, ?> map)) return null;
        Object name = map.get("__typename");
        return name instanceof String s ? env.getSchema().getObjectType(s) : null;
    };

    static void start(JsonNode message) {
        int id = message.get("id").asInt();
        GraphQLSchema schema;
        Execution execution;
        try {
            Execution[] holder = new Execution[1];
            WiringFactory wiring = new WiringFactory() {
                @Override
                public boolean providesDataFetcher(FieldWiringEnvironment environment) {
                    return true;
                }

                @Override
                public DataFetcher<?> getDataFetcher(FieldWiringEnvironment environment) {
                    return env -> fetcher(holder[0]).get(env);
                }

                @Override
                public boolean providesTypeResolver(InterfaceWiringEnvironment environment) {
                    return true;
                }

                @Override
                public TypeResolver getTypeResolver(InterfaceWiringEnvironment environment) {
                    return typeResolver;
                }

                @Override
                public boolean providesTypeResolver(UnionWiringEnvironment environment) {
                    return true;
                }

                @Override
                public TypeResolver getTypeResolver(UnionWiringEnvironment environment) {
                    return typeResolver;
                }
            };
            schema = new SchemaGenerator().makeExecutableSchema(
                    new SchemaParser().parse(message.get("schema").asText()),
                    RuntimeWiring.newRuntimeWiring().wiringFactory(wiring).build());
            execution = new Execution(id, schema);
            holder[0] = execution;
        } catch (Exception e) {
            send(msg("type", "error", "id", id, "message", "the adapter couldn't build the schema: " + e));
            return;
        }
        executions.put(id, execution);

        String document = message.get("document").asText();
        if (message.has("errorPropagation") && !message.get("errorPropagation").asBoolean()) {
            // graphql-java's own switch: @experimental_disableErrorPropagation on
            // the operation (graphql.execution.Execution#propagateErrorsOnNonNullContractFailure).
            Document parsed = Parser.parse(document);
            List<Definition> definitions = new ArrayList<>();
            for (Definition<?> d : parsed.getDefinitions()) {
                if (d instanceof OperationDefinition op) {
                    definitions.add(op.transform(b -> {
                        List<Directive> directives = new ArrayList<>(op.getDirectives());
                        directives.add(Directive.newDirective().name("experimental_disableErrorPropagation").build());
                        b.directives(directives);
                    }));
                } else {
                    definitions.add(d);
                }
            }
            document = AstPrinter.printAst(parsed.transform(b -> b.definitions(definitions)));
        }

        Map<String, Object> variables = JSON.convertValue(message.get("variables"), Map.class);
        ExecutionInput input = ExecutionInput.newExecutionInput()
                .query(document)
                .variables(variables == null ? Map.of() : variables)
                .build();
        GraphQL graphql = GraphQL.newGraphQL(schema).build();
        CompletableFuture<ExecutionResult> result;
        try {
            result = graphql.executeAsync(input);
        } catch (Exception e) {
            send(msg("type", "error", "id", id, "message", String.valueOf(e)));
            return;
        }
        if ("subscription".equals(message.get("operationType").asText())) {
            result = result.thenCompose(Adapter::firstEvent);
        }
        result.whenComplete((response, error) -> {
            if (error != null) {
                send(msg("type", "error", "id", id, "message", String.valueOf(error)));
            } else if (!execution.ended) {
                if (response instanceof StreamError e) {
                    send(msg("type", "stream-error", "id", id, "message", e.message));
                } else {
                    send(msg("type", "response", "id", id, "response", response.toSpecification()));
                }
            }
        });
    }

    // The response for a subscription's one event: the first ExecutionResult the
    // response stream publishes. A result without a stream (an error creating
    // the source stream) is the response itself.
    @SuppressWarnings("unchecked")
    static CompletableFuture<ExecutionResult> firstEvent(ExecutionResult result) {
        if (!(result.getData() instanceof org.reactivestreams.Publisher<?> stream)) return CompletableFuture.completedFuture(result);
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

            // graphql-java ends the response stream with an error, instead of
            // publishing a result, when the event's data is nulled (a Non-Null
            // root field that is null). A client gets no execution result then,
            // only the stream error, so the adapter reports it as a
            // `stream-error`, which the kit counts against eventYieldsResult,
            // rather than stopping the run. A known graphql-java deviation
            // (README.md).
            @Override
            public void onError(Throwable t) {
                Throwable cause = t instanceof java.util.concurrent.CompletionException && t.getCause() != null ? t.getCause() : t;
                first.complete(new StreamError("response stream error: " + cause.getMessage()));
            }

            @Override
            public void onComplete() {
                if (!first.isDone()) first.completeExceptionally(new IllegalStateException("the response stream ended without an event"));
            }
        });
        return first;
    }

    // What a subscriber sees when the response stream errors: no execution
    // result, only the error.
    static final class StreamError implements ExecutionResult {
        final String message;

        StreamError(String message) {
            this.message = message;
        }

        @Override
        public List<graphql.GraphQLError> getErrors() {
            return List.of();
        }

        @Override
        public <T> T getData() {
            return null;
        }

        @Override
        public boolean isDataPresent() {
            return false;
        }

        @Override
        public Map<Object, Object> getExtensions() {
            return null;
        }

        @Override
        public Map<String, Object> toSpecification() {
            return msg("errors", List.of(msg("message", message)));
        }
    }

    static void settle(JsonNode message) {
        int id = message.get("id").asInt();
        Execution execution = executions.get(id);
        Pending pending = execution == null ? null : execution.calls.remove(message.get("call").asInt());
        if (pending == null) {
            send(msg("type", "error", "id", id, "message", "no pending call " + message.get("call")));
            return;
        }
        execution.settled++;
        pending.settle().accept(message.get("outcome"));
    }

    public static void main(String[] args) throws Exception {
        List<String> argv = List.of(args);
        boolean idle = !argv.contains("--no-idle");
        List<String> capabilities = new ArrayList<>();
        if (idle) capabilities.add("idle");
        capabilities.add("invalid-results");
        capabilities.add("mutation");
        capabilities.add("subscription");
        capabilities.add("error-propagation-off");
        send(msg("type", "hello", "protocol", 1, "name", "graphql-java " + graphqlJavaVersion(), "capabilities", capabilities));

        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        for (String line; (line = in.readLine()) != null; ) {
            if (line.isBlank()) continue;
            JsonNode message = JSON.readTree(line);
            String type = message.get("type").asText();
            int id = message.get("id").asInt();
            try {
                switch (type) {
                    case "execute" -> start(message);
                    case "settle" -> settle(message);
                    case "end" -> {
                        Execution execution = executions.remove(id);
                        if (execution != null) execution.ended = true;
                        continue;
                    }
                    default -> {
                        send(msg("type", "error", "id", id, "message", "unknown message type " + type));
                        continue;
                    }
                }
            } catch (Exception e) {
                send(msg("type", "error", "id", id, "message", String.valueOf(e)));
            }
            // Single-threaded: graphql-java has run every continuation the
            // message made ready, so it is blocked on kit futures.
            if (idle) send(msg("type", "idle", "id", id));
        }
    }

    static String graphqlJavaVersion() {
        try (var in = Adapter.class.getResourceAsStream("graphql-java.properties")) {
            java.util.Properties p = new java.util.Properties();
            if (in != null) p.load(in);
            return p.getProperty("version", "unknown");
        } catch (Exception e) {
            return "unknown";
        }
    }
}
