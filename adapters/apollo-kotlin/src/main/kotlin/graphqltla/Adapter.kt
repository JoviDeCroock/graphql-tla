// A graphql-tla adapter for Apollo Kotlin's execution library,
// com.apollographql.apollo:apollo-execution (docs/conformance.md).
//
// Every field gets one Resolver, which tells the kit it was called and
// suspends on a CompletableDeferred that the kit's `settle` completes.
// apollo-execution runs on coroutines; the adapter runs them on a dispatcher
// of its own that queues every resumption and runs the queue on the thread
// that reads stdin. apollo-execution starts every field with
// CoroutineStart.UNDISPATCHED and uses no dispatcher of its own, so once the
// queue is empty after a kit message, every coroutine is suspended on a kit
// deferred (or the kit's source stream), and the adapter can say `idle`.
//
// Usage: java -jar apollo-kotlin-adapter.jar [--no-idle]
//
// --no-idle leaves out `idle`, to exercise the kit's grace-based fallback.
//
// The other areas (parse, validate, coerce, schema, introspect, coordinate)
// are in Areas.kt.

package graphqltla

import com.apollographql.apollo.api.Error
import com.apollographql.apollo.api.OnError
import com.apollographql.apollo.ast.GQLEnumTypeDefinition
import com.apollographql.apollo.ast.GQLListType
import com.apollographql.apollo.ast.GQLNamedType
import com.apollographql.apollo.ast.GQLNonNullType
import com.apollographql.apollo.ast.GQLScalarTypeDefinition
import com.apollographql.apollo.ast.GQLType
import com.apollographql.apollo.ast.GQLValue
import com.apollographql.apollo.ast.Schema
import com.apollographql.apollo.ast.pretty
import com.apollographql.apollo.ast.rawType
import com.apollographql.apollo.ast.responseName
import com.apollographql.apollo.ast.toGQLDocument
import com.apollographql.apollo.execution.Coercing
import com.apollographql.apollo.execution.ExecutableSchema
import com.apollographql.apollo.execution.GraphQLRequest
import com.apollographql.apollo.execution.GraphQLResponse
import com.apollographql.apollo.execution.JsonCoercing
import com.apollographql.apollo.execution.ResolveInfo
import com.apollographql.apollo.execution.Resolver
import com.apollographql.apollo.execution.SubscriptionError
import com.apollographql.apollo.execution.SubscriptionResponse
import com.apollographql.apollo.execution.TypeResolver
import com.apollographql.apollo.execution.parseAsGraphQLRequest
import com.fasterxml.jackson.core.json.JsonWriteFeature
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.json.JsonMapper
import java.io.BufferedReader
import java.io.FileDescriptor
import java.io.FileOutputStream
import java.io.InputStreamReader
import java.io.PrintStream
import java.nio.charset.StandardCharsets
import kotlin.coroutines.CoroutineContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.Runnable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.launch
import okio.Buffer

// ---- the NDJSON channel ----

// Non-ASCII is escaped, so a lone surrogate goes out as \ud800, and U+2028
// and U+2029 as escapes (docs/conformance.md).
val JSON: ObjectMapper = JsonMapper.builder().enable(JsonWriteFeature.ESCAPE_NON_ASCII).build()
private val OUT = PrintStream(FileOutputStream(FileDescriptor.out), false, StandardCharsets.UTF_8)

fun writeLine(line: String) {
  synchronized(OUT) {
    OUT.print(line)
    OUT.print('\n')
    OUT.flush()
  }
}

fun send(message: Map<String, Any?>) = writeLine(JSON.writeValueAsString(message))

// A message with a `response` entry holding JSON text as Apollo wrote it, so
// that the kit reads the response as the implementation serialized it
// (`uniqueKeys` reads the line). U+2028 and U+2029 can only occur inside JSON
// strings there, so escaping them doesn't change the value.
fun sendWithResponse(message: Map<String, Any?>, responseJson: String) {
  val head = JSON.writeValueAsString(message)
  writeLine(head.substring(0, head.length - 1) + ",\"response\":" + escapeSeparators(responseJson) + "}")
}

fun escapeSeparators(json: String): String = json.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")

fun msg(vararg pairs: Pair<String, Any?>): MutableMap<String, Any?> = linkedMapOf(*pairs)

// The response as apollo-execution serializes it (GraphQLResponse#serialize,
// Apollo's own JSON writer). Throws if the writer refuses a value, as it does
// a non-finite Double.
fun GraphQLResponse.toJsonText(): String {
  val buffer = Buffer()
  serialize(buffer)
  return buffer.readUtf8()
}

// A request as a server reads one: the JSON body, parsed by apollo-execution's
// own parseAsGraphQLRequest (Apollo's JSON reader). `variables` and
// `extensions` are JSON text.
fun graphQLRequest(document: String, variablesJson: String?, operationName: String?, extensionsJson: String?): GraphQLRequest {
  val body = StringBuilder("{\"query\":").append(JSON.writeValueAsString(document))
  if (variablesJson != null) body.append(",\"variables\":").append(variablesJson)
  if (operationName != null) body.append(",\"operationName\":").append(JSON.writeValueAsString(operationName))
  if (extensionsJson != null) body.append(",\"extensions\":").append(extensionsJson)
  body.append("}")
  return Buffer().writeUtf8(body.toString()).parseAsGraphQLRequest().getOrThrow()
}

// ---- the event loop ----

// Every coroutine runs here: dispatch() queues, drain() runs the queue on
// the thread that reads stdin. When drain() returns, every coroutine is
// suspended on something only a kit message can resume.
object Loop : CoroutineDispatcher() {
  private val queue = ArrayDeque<Runnable>()

  override fun dispatch(context: CoroutineContext, block: Runnable) {
    queue.addLast(block)
  }

  fun drain() {
    while (true) {
      val next = queue.removeFirstOrNull() ?: return
      next.run()
    }
  }
}

val loopScope = CoroutineScope(Loop + SupervisorJob())

// ---- execution ----

private val NO_PARENT = Any()

// What a custom scalar's result coercion rejects (custom-scalar-results).
object Unrepresentable {
  override fun toString() = "an unrepresentable value"
}

// apollo-execution needs a Coercing for every custom scalar it serializes
// ("Cannot get coercing for ..." otherwise). The adapter gives each custom
// scalar Apollo's own JsonCoercing, which passes values through, except that
// its serialize raises on one marker value, the kit's `uncoercible`, as a
// scalar's serializer raises on a value it can't represent (§3.5).
class KitScalarCoercing(private val name: String) : Coercing<Any?> {
  override fun serialize(internalValue: Any?): Any? {
    if (internalValue === Unrepresentable) throw IllegalStateException("$name cannot represent this value")
    return JsonCoercing.serialize(internalValue)
  }

  override fun deserialize(value: Any?): Any? = JsonCoercing.deserialize(value)

  override fun parseLiteral(value: GQLValue): Any? = JsonCoercing.parseLiteral(value)
}

fun customScalars(sdl: String): List<String> =
  sdl.toGQLDocument().definitions.filterIsInstance<GQLScalarTypeDefinition>().map { it.name }

private class Pending(val settle: (JsonNode) -> Unit)

class Execution(val id: Int, val parentValues: Boolean) {
  private val calls = HashMap<Int, Pending>()
  private var nextCall = 1

  // Settles applied so far; each call is stamped with it as `after`.
  var settled = 0
  var ended = false
  var job: Job? = null

  // parent-values: the token of a subscription's one event (`event`).
  var eventToken: String? = null

  // subscription-stream: the kit's source stream, and whether the client has
  // seen the response stream end (`done` or `stream-error`).
  var source: KitSource? = null
  var completed = false

  // Tells the kit about a resolver call and suspends until the kit settles
  // it. `parent` is the token of the value the resolver was called on, or
  // NO_PARENT without parent-values.
  suspend fun call(path: List<Any>, type: GQLType, parent: Any?): JsonNode {
    val n = nextCall++
    val outcome = CompletableDeferred<JsonNode>()
    calls[n] = Pending { outcome.complete(it) }
    val m = msg("type" to "call", "id" to id, "call" to n, "path" to path.map { it.toString() }, "returnType" to type.pretty(), "after" to settled)
    if (parent !== NO_PARENT) m["parent"] = parent
    send(m)
    return outcome.await()
  }

  fun settle(call: Int, outcome: JsonNode): Boolean {
    val pending = calls.remove(call) ?: return false
    settled++
    pending.settle(outcome)
    return true
  }
}

private val executions = HashMap<Int, Execution>()

class ResolverFailure(message: String) : RuntimeException(message)

fun failure(path: List<Any>) = ResolverFailure("resolver at ${path.joinToString(".")} failed")

// The canonical value for a leaf type (docs/conformance.md, Outcomes).
fun leafValue(schema: Schema, named: String): Any? {
  val definition = schema.typeDefinitions[named]
  if (definition is GQLEnumTypeDefinition) return definition.enumValues.first().name
  return when (named) {
    "Int" -> 1
    "Float" -> 1.5
    "Boolean" -> true
    else -> "v"
  }
}

fun nullable(type: GQLType): GQLType = if (type is GQLNonNullType) type.type else type

// The value a resolver returns for a settled outcome. Without
// `deferred-items`, a list's items come inline, and are never errors.
fun value(schema: Schema, outcome: JsonNode, type: GQLType): Any? {
  val bare = nullable(type)
  return when (outcome.get("kind").asText()) {
    "null" -> null
    "leaf" -> when {
      // scalar-results: the internal value the kit names, as it is (an Int 4
      // for an ID, a Long 2147483648 for an Int).
      outcome.has("value") -> JSON.convertValue(outcome.get("value"), Any::class.java)
      // At a list position (a wrong shape), the number 1.
      bare is GQLListType -> 1
      else -> leafValue(schema, (bare as GQLNamedType).name)
    }
    // A value the type can't represent: a fraction for an Int, a non-finite
    // number for a Float, a name that isn't one of an enum's values, and for
    // a custom scalar a value its result coercion raises on.
    "uncoercible" -> {
      val named = bare.rawType().name
      val definition = schema.typeDefinitions[named]
      when {
        definition is GQLEnumTypeDefinition -> "NOT_A_VALUE"
        named == "Int" -> 1.2
        named == "Float" -> Double.POSITIVE_INFINITY
        else -> Unrepresentable
      }
    }
    // parent-values: the object carries the kit's token.
    "object" -> {
      val obj = linkedMapOf<String, Any?>("__typename" to outcome.get("type").asText())
      if (outcome.has("token")) obj["token"] = outcome.get("token").asText()
      obj
    }
    "list" -> {
      val itemType = (bare as GQLListType).type
      val items = outcome.get("items")
      List(outcome.get("length").asInt()) { value(schema, items.get(it), itemType) }
    }
    else -> throw IllegalArgumentException("unknown outcome $outcome")
  }
}

// The token of the value a resolver was called on (parent-values): the
// root value's, or the object's its parent position completed with, or null
// if it has none.
fun tokenOf(parent: Any?): Any? = (parent as? Map<*, *>)?.get("token") as? String

// apollo-execution uses each source stream item as the subscription root
// field's value: it completes the item (OperationContext#executeSubscriptionEvent)
// and calls no resolver on it. So the source stream's request for an event is
// the root `call`, and the settled outcome is the event (docs/conformance.md,
// capabilities). An `error` outcome is an event that is an apollo Error at
// the root field's response path: completeValue returns an Error value as the
// field's error ("fast path if the resolver failed"), as it does for a
// resolver that threw.
fun eventValue(schema: Schema, outcome: JsonNode, responseName: String, type: GQLType): Any? {
  if (outcome.get("kind").asText() == "error") {
    return Error.Builder(failure(listOf(responseName)).message!!).path(listOf(responseName)).build()
  }
  return value(schema, outcome, type)
}

// subscription-stream: a source stream the kit drives. Each `source` message
// is queued on a channel and handled in order: an emit is the root `call`
// (see eventValue), whose settled outcome is emitted; complete ends the flow;
// fail throws. apollo-execution cancelling the flow's collection (when the
// client cancels the response stream) is reported as `source-cancelled`, if
// the source hadn't completed or failed.
class KitSource(private val execution: Execution) {
  val actions = Channel<JsonNode>(Channel.UNLIMITED)
  private var over = false

  fun flow(schema: Schema, responseName: String, type: GQLType): Flow<Any?> = flow {
    try {
      for (action in actions) {
        when (val kind = action.get("action").asText()) {
          "emit" -> {
            val parent = if (execution.parentValues) action.get("token")?.asText() else NO_PARENT
            val outcome = execution.call(listOf(responseName), type, parent)
            emit(eventValue(schema, outcome, responseName, type))
          }
          "complete" -> {
            over = true
            return@flow
          }
          "fail" -> {
            over = true
            throw SourceFailure(action.get("message")?.asText() ?: "the source stream failed")
          }
          else -> throw IllegalArgumentException("unknown source action $kind")
        }
      }
    } catch (e: CancellationException) {
      if (!over && !execution.ended) send(msg("type" to "source-cancelled", "id" to execution.id))
      over = true
      throw e
    }
  }
}

class SourceFailure(message: String) : RuntimeException(message)

// The one resolver on every field.
fun resolver(execution: Execution): Resolver = Resolver { info: ResolveInfo ->
  val type = info.fieldDefinition().type
  val schema = info.schema
  if (info.parentType == schema.subscriptionTypeDefinition?.name) {
    // Called once, to create the source stream (CreateSourceEventStream).
    // apollo-execution passes an empty path here; the event's path is the
    // root field's response name.
    val responseName = info.field.responseName()
    val source = execution.source
    if (source != null) return@Resolver source.flow(schema, responseName, type)
    return@Resolver flow {
      val parent = if (execution.parentValues) execution.eventToken else NO_PARENT
      val outcome = execution.call(listOf(responseName), type, parent)
      emit(eventValue(schema, outcome, responseName, type))
    }
  }
  val parent = if (execution.parentValues) tokenOf(info.parentObject) else NO_PARENT
  val outcome = execution.call(info.path, type, parent)
  if (outcome.get("kind").asText() == "error") throw failure(info.path)
  value(schema, outcome, type)
}

// Abstract types: the object type named by the value's __typename.
val typeResolver = TypeResolver { obj, _ ->
  ((obj as? Map<*, *>)?.get("__typename") as? String) ?: error("no __typename on $obj")
}

fun start(message: JsonNode) {
  val id = message.get("id").asInt()
  val parentValues = message.has("initialValue")
  val stream = message.get("stream")?.asBoolean() == true
  val execution = Execution(id, parentValues)
  message.get("event")?.let { execution.eventToken = it.asText() }
  if (stream) execution.source = KitSource(execution)

  val schema: ExecutableSchema
  val request: GraphQLRequest
  try {
    val sdl = message.get("schema").asText()
    // parent-values: the initial value carries the kit's token. Root
    // resolvers are apollo-execution's way to give the operation a root value.
    val root: Any? = if (parentValues) linkedMapOf("token" to message.get("initialValue").asText()) else null
    val builder = ExecutableSchema.Builder()
      .schema(sdl)
      .resolver(resolver(execution))
      .typeResolver(typeResolver)
      .queryRoot { root }
      .mutationRoot { root }
      .subscriptionRoot { root }
    for (scalar in customScalars(sdl)) builder.addCoercing(scalar, KitScalarCoercing(scalar))
    // error-propagation-off: apollo-execution's own switch, OnError.NULL (the
    // service's default error behavior).
    if (message.get("errorPropagation")?.asBoolean() == false) builder.onError(OnError.NULL)
    schema = builder.build()
    request = graphQLRequest(message.get("document").asText(), JSON.writeValueAsString(message.get("variables")), null, null)
  } catch (e: Exception) {
    send(msg("type" to "error", "id" to id, "message" to "the adapter couldn't build the schema or request: $e"))
    return
  }
  executions[id] = execution

  val operationType = message.get("operationType").asText()
  execution.job = loopScope.launch {
    when {
      stream -> consume(execution, schema, request)
      operationType == "subscription" -> firstEvent(execution, schema, request)
      else -> {
        val response = try {
          schema.execute(request)
        } catch (e: CancellationException) {
          throw e
        } catch (e: Exception) {
          // Execution raised out to the caller: the client gets nothing.
          if (!execution.ended) send(msg("type" to "no-response", "id" to id, "message" to "execute threw: $e"))
          return@launch
        }
        respond(execution, response)
      }
    }
  }
}

// Sends a response, or `no-response` if Apollo's JSON writer refuses it (a
// non-finite Float).
fun respond(execution: Execution, response: GraphQLResponse) {
  if (execution.ended) return
  val text = try {
    response.toJsonText()
  } catch (e: Exception) {
    send(msg("type" to "no-response", "id" to execution.id, "message" to "serializing the response failed: $e"))
    return
  }
  sendWithResponse(msg("type" to "response", "id" to execution.id), text)
}

fun subscriptionErrorMessage(event: SubscriptionError) = event.errors.joinToString("; ") { it.message }

// A subscription's one event: the first item of apollo-execution's response
// flow (ExecutableSchema#subscribe), after which the flow is cancelled.
// SubscriptionError is apollo-execution's terminal "this subscription failed"
// event, which isn't an execution result: the client gets no result, only
// the stream's failure, so it is a `stream-error`.
suspend fun firstEvent(execution: Execution, schema: ExecutableSchema, request: GraphQLRequest) {
  val event = try {
    schema.subscribe(request).first()
  } catch (e: CancellationException) {
    throw e
  } catch (e: Exception) {
    if (!execution.ended) send(msg("type" to "stream-error", "id" to execution.id, "message" to "the response stream failed: $e"))
    return
  }
  when (event) {
    is SubscriptionResponse -> respond(execution, event.response)
    is SubscriptionError -> if (!execution.ended) send(msg("type" to "stream-error", "id" to execution.id, "message" to subscriptionErrorMessage(event)))
  }
}

// subscription-stream: collect apollo-execution's response flow as a client
// would, and report each result and how the stream ends. A SubscriptionError
// ends the stream with an error (see firstEvent); the flow then completes,
// which the client doesn't see as a second ending.
suspend fun consume(execution: Execution, schema: ExecutableSchema, request: GraphQLRequest) {
  val id = execution.id
  try {
    schema.subscribe(request).collect { event ->
      when (event) {
        is SubscriptionResponse -> respond(execution, event.response)
        is SubscriptionError -> {
          if (!execution.completed && !execution.ended) send(msg("type" to "stream-error", "id" to id, "message" to subscriptionErrorMessage(event)))
          execution.completed = true
        }
      }
    }
  } catch (e: CancellationException) {
    throw e
  } catch (e: Exception) {
    if (!execution.completed && !execution.ended) send(msg("type" to "stream-error", "id" to id, "message" to "the response stream failed: $e"))
    execution.completed = true
    return
  }
  if (!execution.completed && !execution.ended) send(msg("type" to "done", "id" to id))
  execution.completed = true
}

fun source(message: JsonNode) {
  val id = message.get("id").asInt()
  val source = executions[id]?.source
  if (source == null) {
    send(msg("type" to "error", "id" to id, "message" to "no streamed subscription to drive"))
    return
  }
  source.actions.trySend(message)
}

// The client cancels the response stream: it cancels the coroutine that
// collects the flow. Once that coroutine has finished, the stream is over
// for the client, which is `done`.
fun cancel(message: JsonNode) {
  val id = message.get("id").asInt()
  val execution = executions[id]
  val job = execution?.job
  if (job == null) {
    send(msg("type" to "error", "id" to id, "message" to "no response stream to cancel"))
    return
  }
  job.invokeOnCompletion {
    if (!execution.completed && !execution.ended) send(msg("type" to "done", "id" to id))
    execution.completed = true
  }
  job.cancel()
}

fun settle(message: JsonNode) {
  val id = message.get("id").asInt()
  val execution = executions[id]
  if (execution == null || !execution.settle(message.get("call").asInt(), message.get("outcome"))) {
    send(msg("type" to "error", "id" to id, "message" to "no pending call ${message.get("call")}"))
  }
}

// The kit is done with an execution: anything still running is cancelled
// without being reported.
fun end(id: Int) {
  val execution = executions.remove(id) ?: return
  execution.ended = true
  execution.job?.cancel()
}

fun apolloVersion(): String =
  Execution::class.java.getResourceAsStream("apollo-kotlin.properties")?.use { input ->
    java.util.Properties().apply { load(input) }.getProperty("version")
  } ?: "unknown"

fun main(args: Array<String>) {
  val idle = "--no-idle" !in args
  val capabilities = mutableListOf<String>()
  if (idle) capabilities += "idle"
  capabilities += listOf(
    "invalid-results",
    "uncoercible-results",
    "custom-scalar-results",
    "scalar-results",
    "mutation",
    "subscription",
    "subscription-stream",
    "parent-values",
    "error-propagation-off",
  )
  capabilities += Areas.capabilities()
  send(msg("type" to "hello", "protocol" to 1, "name" to "apollo-kotlin apollo-execution ${apolloVersion()}", "capabilities" to capabilities))

  val input = BufferedReader(InputStreamReader(System.`in`, StandardCharsets.UTF_8))
  while (true) {
    val line = input.readLine() ?: break
    if (line.isBlank()) continue
    val message = JSON.readTree(line)
    val type = message.get("type").asText()
    val id = message.get("id").asInt()
    if (type in Areas.NAMES) {
      // The other areas: one request, one result, no idle. A Throwable is
      // answered with an `error`, which the kit reports as a crash of the
      // implementation's (docs/kit-areas.md, "Protocol"), or in coerce as no
      // response. Only the message's first line reaches the report; the
      // stack trace goes to stderr.
      try {
        Areas.answer(type, id, message)
      } catch (e: Throwable) {
        e.printStackTrace()
        send(msg("type" to "error", "id" to id, "message" to "${e.javaClass.name}: ${e.message}"))
      }
      continue
    }
    try {
      when (type) {
        "execute" -> start(message)
        "settle" -> settle(message)
        "source" -> source(message)
        "cancel" -> cancel(message)
        "end" -> {
          end(id)
          Loop.drain()
          continue
        }
        else -> {
          send(msg("type" to "error", "id" to id, "message" to "unknown message type $type"))
          continue
        }
      }
      Loop.drain()
    } catch (e: Exception) {
      e.printStackTrace()
      send(msg("type" to "error", "id" to id, "message" to e.toString()))
    }
    // Every coroutine is suspended on the kit: apollo-execution is blocked.
    if (idle) send(msg("type" to "idle", "id" to id))
  }
}
