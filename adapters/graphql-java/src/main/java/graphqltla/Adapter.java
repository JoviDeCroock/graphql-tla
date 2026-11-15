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
// It also claims subscription-stream (the kit drives the source stream,
// a Flow.Publisher, and the adapter consumes graphql-java's response
// Publisher as a client would), parent-values (objects carry the kit's
// tokens), custom-scalar-results and scalar-results.
//
// Usage: java -jar graphql-java-adapter.jar [--no-idle] [--validate] [--good-faith]
//
// --no-idle leaves out `idle`, to exercise the kit's grace-based fallback.
// --validate makes coerce validate before executing (no `unvalidated`).
// --good-faith keeps Good Faith Introspection on in the introspect area.
//
// The other areas (parse, validate, coerce, schema, introspect) are in
// Areas.java.

package graphqltla;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.core.json.JsonWriteFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
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
import graphql.language.SourceLocation;
import graphql.parser.Parser;
import graphql.schema.DataFetcher;
import graphql.schema.DataFetchingEnvironment;
import graphql.schema.GraphQLEnumType;
import graphql.schema.Coercing;
import graphql.schema.CoercingSerializeException;
import graphql.schema.GraphQLList;
import graphql.schema.GraphQLNamedType;
import graphql.schema.GraphQLScalarType;
import graphql.schema.GraphQLSchema;
import graphql.schema.GraphQLType;
import graphql.schema.GraphQLTypeUtil;
import graphql.schema.TypeResolver;
import graphql.schema.idl.FieldWiringEnvironment;
import graphql.schema.idl.InterfaceWiringEnvironment;
import graphql.schema.idl.RuntimeWiring;
import graphql.schema.idl.ScalarInfo;
import graphql.schema.idl.ScalarWiringEnvironment;
import graphql.schema.idl.SchemaGenerator;
import graphql.schema.idl.SchemaParser;
import graphql.schema.idl.UnionWiringEnvironment;
import graphql.schema.idl.WiringFactory;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Flow;
import java.util.function.Consumer;

public final class Adapter {
    // Non-ASCII is escaped, so a lone surrogate (which the coerce and parse
    // vectors hold) goes out as \ud800, not as the "?" a UTF-8 encoder writes.
    private static final ObjectMapper JSON = JsonMapper.builder().enable(JsonWriteFeature.ESCAPE_NON_ASCII).build();
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
        // parent-values: the token of a subscription's one event (`event`).
        String eventToken;
        // subscription-stream: the kit's source stream, the client's
        // subscription to graphql-java's response stream, and whether the
        // client has seen the response stream end (`done` or `stream-error`).
        KitSource source;
        org.reactivestreams.Subscription responseSubscription;
        boolean completed;

        Execution(int id, GraphQLSchema schema) {
            this.id = id;
            this.schema = schema;
        }

        // `parent` is the token of the value the resolver was called on, or
        // NO_PARENT without parent-values.
        int call(List<String> path, GraphQLType type, Object parent, Consumer<JsonNode> settle) {
            int call = nextCall++;
            calls.put(call, new Pending(path, type, settle));
            Map<String, Object> m = msg("type", "call", "id", id, "call", call, "path", path, "returnType", GraphQLTypeUtil.simplePrint(type), "after", settled);
            if (parent != NO_PARENT) m.put("parent", parent);
            send(m);
            return call;
        }
    }

    private static final Object NO_PARENT = new Object();

    private static final Map<Integer, Execution> executions = new HashMap<>();

    // What a custom scalar's result coercion rejects (custom-scalar-results).
    static final Object UNREPRESENTABLE = new Object() {
        @Override
        public String toString() {
            return "an unrepresentable value";
        }
    };

    // Custom scalars in the SDL need an implementation in graphql-java
    // (SchemaGenerator refuses a scalar without one). This one passes every
    // value through, and its result coercion raises on UNREPRESENTABLE, as a
    // scalar's serializer raises on a value it can't represent (§3.5).
    static GraphQLScalarType customScalar(String name) {
        return GraphQLScalarType.newScalar().name(name).coercing(new Coercing<Object, Object>() {
            @Override
            public Object serialize(Object value) {
                if (value == UNREPRESENTABLE) throw new CoercingSerializeException(name + " cannot represent this value");
                return value;
            }

            @Override
            public Object parseValue(Object input) {
                return input;
            }

            @Override
            public Object parseLiteral(Object input) {
                return input;
            }
        }).build();
    }

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
                // scalar-results: the internal value the kit names, as it is
                // (an Integer 4 for an ID, a Long 2147483648 for an Int).
                if (outcome.has("value")) return JSON.convertValue(outcome.get("value"), Object.class);
                // At a list position (a wrong shape), the number 1.
                return nullable instanceof GraphQLList ? 1 : leafValue(nullable);
            case "uncoercible": {
                // A value the type can't represent: a fraction for an Int, a
                // non-finite number for a Float, a name that isn't one of an
                // enum's values, and for a custom scalar a value its result
                // coercion raises on.
                GraphQLNamedType named = GraphQLTypeUtil.unwrapAllAs(nullable);
                if (named instanceof GraphQLEnumType) return "NOT_A_VALUE";
                if (named instanceof GraphQLScalarType s && !ScalarInfo.isGraphqlSpecifiedScalar(s)) return UNREPRESENTABLE;
                return "Int".equals(named.getName()) ? (Object) 1.2 : (Object) Double.POSITIVE_INFINITY;
            }
            case "object": {
                // parent-values: the object carries the kit's token.
                Map<String, Object> object = new LinkedHashMap<>();
                object.put("__typename", outcome.get("type").asText());
                if (outcome.has("token")) object.put("token", outcome.get("token").asText());
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

    // The token of the value a resolver was called on (parent-values): the
    // root value's, or the object's its parent position completed with, or
    // null if it has none.
    static Object tokenOf(Object source) {
        return source instanceof Map<?, ?> map && map.get("token") instanceof String s ? s : null;
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
    static DataFetcher<Object> fetcher(Execution execution, boolean parentValues) {
        return env -> {
            List<String> path = pathOf(env);
            GraphQLType type = env.getFieldType();
            if (env.getParentType() == execution.schema.getSubscriptionType()) {
                // Called once, to create the source stream (CreateSourceEventStream).
                SourceLocation location = env.getField().getSourceLocation();
                if (execution.source != null) {
                    execution.source.path = path;
                    execution.source.type = type;
                    execution.source.location = location;
                    return execution.source;
                }
                return sourceStream(execution, path, type, location, parentValues ? execution.eventToken : NO_PARENT);
            }
            CompletableFuture<Object> future = new CompletableFuture<>();
            execution.call(path, type, parentValues ? tokenOf(env.getSource()) : NO_PARENT, outcome -> {
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
    // error if the outcome is one, built as a data fetcher builds one for its
    // field (GraphqlErrorBuilder with the field's path and location);
    // graphql-java reports that error as a field error of the root field. With parent-values, the call reports the
    // event's token: graphql-java executes the event with the event as the
    // root value (SubscriptionExecutionStrategy#executeSubscriptionEvent).
    static Object event(JsonNode outcome, List<String> path, GraphQLType type, SourceLocation location) {
        DataFetcherResult.Builder<Object> event = DataFetcherResult.newResult();
        if ("error".equals(outcome.get("kind").asText())) {
            List<Object> errorPath = new ArrayList<>();
            for (String segment : path) errorPath.add(segment);
            event.data(null).error(GraphqlErrorBuilder.newError()
                    .message(failure(path).getMessage())
                    .path(errorPath)
                    .location(location)
                    .build());
        } else {
            event.data(value(outcome, type));
        }
        return event.build();
    }

    static Flow.Publisher<Object> sourceStream(Execution execution, List<String> path, GraphQLType type, SourceLocation location, Object parent) {
        return subscriber -> subscriber.onSubscribe(new Flow.Subscription() {
            boolean requested;

            @Override
            public void request(long n) {
                if (requested || n <= 0) return;
                requested = true;
                execution.call(path, type, parent, outcome -> {
                    subscriber.onNext(event(outcome, path, type, location));
                    subscriber.onComplete();
                });
            }

            @Override
            public void cancel() {}
        });
    }

    // subscription-stream: a source stream the kit drives. `source` messages
    // queue an emit, a completion or a failure; they are signalled in order,
    // an emit only while graphql-java has demand. As above, an emitted event
    // is the root `call`, and the event goes to graphql-java once the kit
    // settles it. graphql-java cancelling the subscription is reported as
    // `source-cancelled`, if the source hadn't completed or failed. After
    // that, the source signals nothing more (Reactive Streams 1.8), so an
    // event whose root call is still pending when the client cancels is
    // never delivered.
    static final class KitSource implements Flow.Publisher<Object> {
        final Execution execution;
        final boolean parentValues;
        List<String> path;
        GraphQLType type;
        SourceLocation location;
        Flow.Subscriber<? super Object> subscriber;
        final Deque<JsonNode> queue = new ArrayDeque<>();
        long demand;
        boolean awaiting;
        boolean over;
        boolean cancelled;

        KitSource(Execution execution, boolean parentValues) {
            this.execution = execution;
            this.parentValues = parentValues;
        }

        @Override
        public void subscribe(Flow.Subscriber<? super Object> s) {
            subscriber = s;
            s.onSubscribe(new Flow.Subscription() {
                @Override
                public void request(long n) {
                    if (n <= 0 || cancelled) return;
                    demand = demand + n < 0 ? Long.MAX_VALUE : demand + n;
                    pump();
                }

                @Override
                public void cancel() {
                    if (cancelled) return;
                    cancelled = true;
                    queue.clear();
                    if (!over && !execution.ended) send(msg("type", "source-cancelled", "id", execution.id));
                }
            });
            pump();
        }

        void push(JsonNode message) {
            if (over || cancelled) return;
            queue.add(message);
            pump();
        }

        void pump() {
            while (subscriber != null && !cancelled && !over && !awaiting && !queue.isEmpty()) {
                JsonNode next = queue.peek();
                String action = next.get("action").asText();
                if ("emit".equals(action)) {
                    if (demand <= 0) return;
                    queue.poll();
                    if (demand != Long.MAX_VALUE) demand--;
                    awaiting = true;
                    Object parent = parentValues ? (next.has("token") ? next.get("token").asText() : null) : NO_PARENT;
                    List<String> p = path;
                    GraphQLType t = type;
                    SourceLocation l = location;
                    execution.call(p, t, parent, outcome -> {
                        awaiting = false;
                        if (cancelled) return;
                        subscriber.onNext(event(outcome, p, t, l));
                        pump();
                    });
                } else if ("complete".equals(action)) {
                    queue.poll();
                    over = true;
                    subscriber.onComplete();
                } else if ("fail".equals(action)) {
                    queue.poll();
                    over = true;
                    subscriber.onError(new RuntimeException(next.has("message") ? next.get("message").asText() : "the source stream failed"));
                } else {
                    throw new IllegalArgumentException("unknown source action " + action);
                }
            }
        }
    }

    static TypeResolver typeResolver = env -> {
        Object value = env.getObject();
        if (!(value instanceof Map<?, ?> map)) return null;
        Object name = map.get("__typename");
        return name instanceof String s ? env.getSchema().getObjectType(s) : null;
    };

    static void start(JsonNode message) {
        int id = message.get("id").asInt();
        boolean parentValues = message.has("initialValue");
        boolean stream = message.has("stream") && message.get("stream").asBoolean();
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
                    return env -> fetcher(holder[0], parentValues).get(env);
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

                @Override
                public boolean providesScalar(ScalarWiringEnvironment environment) {
                    return !ScalarInfo.isGraphqlSpecifiedScalar(environment.getScalarTypeDefinition().getName());
                }

                @Override
                public GraphQLScalarType getScalar(ScalarWiringEnvironment environment) {
                    return customScalar(environment.getScalarTypeDefinition().getName());
                }
            };
            schema = new SchemaGenerator().makeExecutableSchema(
                    new SchemaParser().parse(message.get("schema").asText()),
                    RuntimeWiring.newRuntimeWiring().wiringFactory(wiring).build());
            execution = new Execution(id, schema);
            if (message.has("event")) execution.eventToken = message.get("event").asText();
            if (stream) execution.source = new KitSource(execution, parentValues);
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
        ExecutionInput.Builder input = ExecutionInput.newExecutionInput()
                .query(document)
                .variables(variables == null ? Map.of() : variables);
        // parent-values: the initial value carries the kit's token.
        if (parentValues) input.root(new LinkedHashMap<>(Map.of("token", message.get("initialValue").asText())));
        GraphQL graphql = GraphQL.newGraphQL(schema).build();
        CompletableFuture<ExecutionResult> result;
        try {
            result = graphql.executeAsync(input.build());
        } catch (Exception e) {
            send(msg("type", "error", "id", id, "message", String.valueOf(e)));
            return;
        }
        if (stream) {
            result.whenComplete((response, error) -> {
                if (error != null) send(msg("type", "error", "id", id, "message", String.valueOf(error)));
                else consume(execution, response);
            });
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

    // subscription-stream: consume graphql-java's response stream as a client
    // would, and report each result and how the stream ends. A result without
    // a stream (an error creating the source stream) is the response itself.
    @SuppressWarnings("unchecked")
    static void consume(Execution execution, ExecutionResult result) {
        int id = execution.id;
        if (!(result.getData() instanceof org.reactivestreams.Publisher<?> stream)) {
            if (!execution.ended) send(msg("type", "response", "id", id, "response", result.toSpecification()));
            return;
        }
        ((org.reactivestreams.Publisher<ExecutionResult>) stream).subscribe(new org.reactivestreams.Subscriber<>() {
            @Override
            public void onSubscribe(org.reactivestreams.Subscription s) {
                execution.responseSubscription = s;
                s.request(Long.MAX_VALUE);
            }

            @Override
            public void onNext(ExecutionResult event) {
                if (!execution.ended) send(msg("type", "response", "id", id, "response", event.toSpecification()));
            }

            @Override
            public void onError(Throwable t) {
                if (execution.ended || execution.completed) return;
                execution.completed = true;
                Throwable cause = t instanceof java.util.concurrent.CompletionException && t.getCause() != null ? t.getCause() : t;
                send(msg("type", "stream-error", "id", id, "message", String.valueOf(cause.getMessage())));
            }

            @Override
            public void onComplete() {
                if (execution.ended || execution.completed) return;
                execution.completed = true;
                send(msg("type", "done", "id", id));
            }
        });
    }

    // The kit's source stream emits, completes or fails.
    static void source(JsonNode message) {
        int id = message.get("id").asInt();
        Execution execution = executions.get(id);
        if (execution == null || execution.source == null) {
            send(msg("type", "error", "id", id, "message", "no streamed subscription to drive"));
            return;
        }
        execution.source.push(message);
    }

    // The client cancels the response stream. Reactive Streams has no signal
    // after Subscription#cancel: once it returns, the stream is over for the
    // client, so that is `done`.
    static void cancel(JsonNode message) {
        int id = message.get("id").asInt();
        Execution execution = executions.get(id);
        if (execution == null || execution.responseSubscription == null) {
            send(msg("type", "error", "id", id, "message", "no response stream to cancel"));
            return;
        }
        execution.responseSubscription.cancel();
        if (!execution.completed && !execution.ended) send(msg("type", "done", "id", id));
        execution.completed = true;
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

    // The kit is done with an execution. A streamed subscription's response
    // stream that is still open is closed without reporting it.
    static void end(int id) {
        Execution execution = executions.remove(id);
        if (execution == null) return;
        execution.ended = true;
        if (execution.responseSubscription != null && !execution.completed) execution.responseSubscription.cancel();
    }

    public static void main(String[] args) throws Exception {
        List<String> argv = List.of(args);
        boolean idle = !argv.contains("--no-idle");
        List<String> capabilities = new ArrayList<>();
        if (idle) capabilities.add("idle");
        capabilities.add("invalid-results");
        capabilities.add("uncoercible-results");
        capabilities.add("mutation");
        capabilities.add("subscription");
        capabilities.add("subscription-stream");
        capabilities.add("parent-values");
        capabilities.add("custom-scalar-results");
        capabilities.add("scalar-results");
        capabilities.add("error-propagation-off");
        Areas.validating = argv.contains("--validate");
        Areas.goodFaith = argv.contains("--good-faith");
        capabilities.addAll(Areas.capabilities());
        send(msg("type", "hello", "protocol", 1, "name", "graphql-java " + graphqlJavaVersion(), "capabilities", capabilities));

        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        for (String line; (line = in.readLine()) != null; ) {
            if (line.isBlank()) continue;
            JsonNode message = JSON.readTree(line);
            String type = message.get("type").asText();
            int id = message.get("id").asInt();
            if (Areas.NAMES.contains(type)) {
                // The other areas: one request, one result, no idle. A
                // Throwable is answered with an `error`. In parse, validate,
                // coerce and schema the kit reports that as a crash of
                // graphql-java's (docs/kit-areas.md, "Protocol"); in
                // introspect, the adapter failed. Only the message's first
                // line reaches the report; the stack trace goes to stderr.
                try {
                    Map<String, Object> result = msg("type", "result", "id", id);
                    result.putAll(Areas.answer(type, message));
                    send(result);
                } catch (Throwable e) {
                    e.printStackTrace();
                    send(msg("type", "error", "id", id, "message", e.getClass().getName() + ": " + e.getMessage()));
                }
                continue;
            }
            try {
                switch (type) {
                    case "execute" -> start(message);
                    case "settle" -> settle(message);
                    case "source" -> source(message);
                    case "cancel" -> cancel(message);
                    case "end" -> {
                        end(id);
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
