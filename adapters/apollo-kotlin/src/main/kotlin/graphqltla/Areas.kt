// The kit's areas beyond execution (docs/kit-areas.md, docs/kit/*.md):
// parse, validate, coerce, schema, introspect and coordinate. Each answers a
// request with Apollo Kotlin's own public APIs, the way a server built on
// apollo-execution uses them: ExecutableSchema for schemas, validation and
// execution, and apollo-ast's parser and schema coordinate API.

package graphqltla

import com.apollographql.apollo.api.json.JsonNumber
import com.apollographql.apollo.ast.GQLArgumentCoordinate
import com.apollographql.apollo.ast.GQLDirectiveArgumentCoordinate
import com.apollographql.apollo.ast.GQLDirectiveCoordinate
import com.apollographql.apollo.ast.GQLDirectiveDefinition
import com.apollographql.apollo.ast.GQLExecutableDefinition
import com.apollographql.apollo.ast.GQLInterfaceTypeDefinition
import com.apollographql.apollo.ast.GQLListType
import com.apollographql.apollo.ast.GQLMemberCoordinate
import com.apollographql.apollo.ast.GQLNamedType
import com.apollographql.apollo.ast.GQLNonNullType
import com.apollographql.apollo.ast.GQLObjectTypeDefinition
import com.apollographql.apollo.ast.GQLSchemaCoordinate
import com.apollographql.apollo.ast.GQLSchemaDefinition
import com.apollographql.apollo.ast.GQLType
import com.apollographql.apollo.ast.GQLTypeCoordinate
import com.apollographql.apollo.ast.GQLTypeDefinition
import com.apollographql.apollo.ast.GQLTypeSystemExtension
import com.apollographql.apollo.ast.GQLUnionTypeDefinition
import com.apollographql.apollo.ast.GQLValue
import com.apollographql.apollo.ast.toUtf8
import com.apollographql.apollo.ast.ParserOptions
import com.apollographql.apollo.ast.ParsingError
import com.apollographql.apollo.ast.ResolvedDirective
import com.apollographql.apollo.ast.ResolvedDirectiveArgument
import com.apollographql.apollo.ast.ResolvedEnumValue
import com.apollographql.apollo.ast.ResolvedField
import com.apollographql.apollo.ast.ResolvedFieldArgument
import com.apollographql.apollo.ast.ResolvedInputField
import com.apollographql.apollo.ast.ResolvedType
import com.apollographql.apollo.ast.Schema
import com.apollographql.apollo.ast.SourceAwareException
import com.apollographql.apollo.ast.parseAsGQLDocument
import com.apollographql.apollo.ast.parseAsGQLSchemaCoordinate
import com.apollographql.apollo.ast.resolveSchemaCoordinate
import com.apollographql.apollo.ast.responseName
import com.apollographql.apollo.ast.toGQLDocument
import com.apollographql.apollo.ast.toSchema
import com.apollographql.apollo.execution.ErrorPersistedDocument
import com.apollographql.apollo.execution.ExecutableSchema
import com.apollographql.apollo.execution.GraphQLRequest
import com.apollographql.apollo.execution.PersistedDocument
import com.apollographql.apollo.execution.PersistedDocumentCache
import com.apollographql.apollo.execution.Resolver
import com.apollographql.apollo.execution.SubscriptionError
import com.apollographql.apollo.execution.SubscriptionResponse
import com.apollographql.apollo.execution.ValidPersistedDocument
import com.fasterxml.jackson.databind.JsonNode
import java.math.BigDecimal
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.runBlocking

object Areas {
  val NAMES = listOf("parse", "validate", "coerce", "schema", "introspect", "coordinate")

  fun capabilities(): List<String> = NAMES + listOf(
    // parse: the type system grammars, with the parser
    // ExecutableSchema.Builder#schema uses on SDL.
    "parse-sdl",
    // schema: validateAsSchema, which ExecutableSchema.Builder#build runs,
    // merges a document's type system extensions into its definitions.
    "schema-extensions",
    // validate: apollo-ast's validator accepts any literal for a custom scalar.
    "custom-scalar-literals",
    // validate and introspect: the SDL's `directive @label(...) on ...`
    // definitions are part of the schema.
    "custom-directives",
    // coerce: ResolveInfo#getArgument tells an absent argument
    // (Optional.Absent) from a null one, and an input object without a
    // field has no entry for it.
    "absent-vs-null",
    // coerce: objects for object fields, a subscription through
    // ExecutableSchema#subscribe, and the request's extensions in the
    // request body.
    "nested-fields",
    "subscription-source",
    "request-extensions",
  )

  // Answers a request with a `result`, or throws if the implementation (or
  // the adapter) failed: the caller then answers with an `error`.
  fun answer(area: String, id: Int, request: JsonNode) {
    val result = msg("type" to "result", "id" to id)
    when (area) {
      "parse" -> result.putAll(parse(request.get("source").asText(), request.get("grammar")?.takeIf { !it.isNull }?.asText() ?: "executable"))
      "validate" -> result.putAll(validate(request.get("schema").asText(), request.get("document").asText()))
      "coerce" -> {
        val (fields, response) = coerce(request)
        sendWithResponse(result.apply { putAll(fields) }, response)
        return
      }
      "schema" -> result.putAll(schema(request.get("sdl").asText()))
      "introspect" -> {
        sendWithResponse(result, introspect(request.get("sdl").asText(), request.get("query").asText()))
        return
      }
      "coordinate" -> result.putAll(coordinate(request.get("sdl").asText(), request.get("coordinate").asText()))
      else -> throw IllegalArgumentException("unknown area $area")
    }
    send(result)
  }

  // ---- parse ----

  // Parsed with parseAsGQLDocument and ParserOptions.Default, as
  // apollo-execution parses a request's document (ExecutableSchema's
  // default parserOptions) and as ExecutableSchema.Builder#schema parses
  // SDL. Apollo's parser reads one Document grammar, so every definition
  // must then be of a kind the requested grammar allows. A ParsingError is
  // `ok: false`; any exception is a crash.
  fun parse(source: String, grammar: String): Map<String, Any?> {
    val result = source.parseAsGQLDocument(ParserOptions.Default)
    val document = result.value
    if (document == null) return mapOf("ok" to false, "error" to result.issues.firstOrNull()?.message)
    val ok = document.definitions.all {
      when (grammar) {
        "executable" -> it is GQLExecutableDefinition
        "typeSystem" -> it is GQLSchemaDefinition || it is GQLTypeDefinition || it is GQLDirectiveDefinition
        "typeSystemExtension" -> it is GQLSchemaDefinition || it is GQLTypeDefinition || it is GQLDirectiveDefinition || it is GQLTypeSystemExtension
        "document" -> true
        else -> throw IllegalArgumentException("unknown grammar $grammar")
      }
    }
    return mapOf("ok" to ok)
  }

  // ---- validate ----

  // apollo-execution validates a request's document in ExecutableSchema#execute
  // (parse with the schema's ParserOptions, validateAsExecutable, and only
  // GraphQLIssues count). It has no public validate function, but it hands
  // the verdict to a PersistedDocumentCache when a request carries a
  // persisted query the cache doesn't have yet: ValidPersistedDocument, or
  // ErrorPersistedDocument with the issues. The adapter's cache records that
  // verdict and stops the request there, so nothing runs after validation.
  private class Verdict(val document: PersistedDocument) : RuntimeException(null, null, false, false)

  private object RecordingCache : PersistedDocumentCache {
    override fun get(id: String): PersistedDocument? = null
    override fun put(id: String, persistedDocument: PersistedDocument) = throw Verdict(persistedDocument)
  }

  private val validators = HashMap<String, ExecutableSchema>()

  // A document Apollo's parser refuses is a crash: every vector parses
  // (docs/kit/validate.md). Apollo's parser has no documented limits.
  fun validate(sdl: String, source: String): Map<String, Any?> {
    val schema = validators.getOrPut(sdl) {
      ExecutableSchema.Builder().schema(sdl).persistedDocumentCache(RecordingCache).build()
    }
    val request = GraphQLRequest.Builder()
      .document(source)
      .extensions(mapOf("persistedQuery" to mapOf("sha256Hash" to "graphql-tla")))
      .build()
    val verdict = try {
      runBlocking { schema.execute(request) }
      throw IllegalStateException("apollo-execution executed the request without recording a validation verdict")
    } catch (e: Verdict) {
      e.document
    }
    return when (verdict) {
      is ValidPersistedDocument -> mapOf("valid" to true)
      is ErrorPersistedDocument -> {
        val parseError = verdict.issues.firstOrNull { it is ParsingError }
        if (parseError != null) throw IllegalStateException("Apollo's parser refused the document: ${parseError.message}")
        mapOf("valid" to false, "errors" to verdict.issues.map { issue ->
          val error = linkedMapOf<String, Any?>("message" to issue.message)
          issue.sourceLocation?.let { error["locations"] = listOf(mapOf("line" to it.line, "column" to it.column)) }
          error
        })
      }
    }
  }

  // ---- coerce ----

  // The calls of the request being executed, the source stream resolver's
  // calls (subscription-source), and what that resolver does ("stream" or
  // "raise"). Everything runs on the thread that reads stdin.
  private var calls = mutableListOf<Map<String, Any?>>()
  private var sourceCalls = mutableListOf<Map<String, Any?>>()
  private var subscribe: String? = null

  private val coerceSchemas = HashMap<String, ExecutableSchema>()

  // What a field's resolver returns, by its type (nested-fields): "ok" for a
  // leaf, an object for an object type, two of them for a list of objects.
  private fun valueFor(schema: Schema, type: GQLType): Any? = when (type) {
    is GQLNonNullType -> valueFor(schema, type.type)
    is GQLListType -> valueFor(schema, type.type).let { if (it is Map<*, *>) listOf(linkedMapOf<String, Any?>(), linkedMapOf<String, Any?>()) else listOf(it) }
    is GQLNamedType -> if (schema.typeDefinitions[type.name] is GQLObjectTypeDefinition) linkedMapOf<String, Any?>() else "ok"
  }

  // Arguments as JSON (docs/kit/coerce.md): JSON can't hold a non-finite
  // number, so that becomes a string. Enum values are their names, which is
  // what apollo-execution gives a resolver. A resolver can also get an
  // uncoerced AST literal (a variable's default value: README.md); JSON has
  // no form for that, so it is written as its class and GraphQL text, such
  // as "GQLIntValue: 7", which matches no coerced value.
  fun toJson(value: Any?): Any? = when (value) {
    is Double -> if (value.isFinite()) value else value.toString()
    is Float -> if (value.isFinite()) value else value.toString()
    is JsonNumber -> runCatching { BigDecimal(value.value) }.getOrElse { value.value }
    is Map<*, *> -> value.entries.associate { it.key.toString() to toJson(it.value) }
    is List<*> -> value.map { toJson(it) }
    is GQLValue -> "${value.javaClass.simpleName}: ${value.toUtf8()}"
    null, is String, is Boolean, is Number -> value
    else -> "${value.javaClass.name}: $value"
  }

  // The arguments the resolver got: ResolveInfo#getArgument for each
  // argument the field defines; Optional.Absent is left out.
  private fun arguments(info: com.apollographql.apollo.execution.ResolveInfo): Map<String, Any?> {
    val arguments = linkedMapOf<String, Any?>()
    for (definition in info.fieldDefinition().arguments) {
      val argument = info.getArgument<Any?>(definition.name)
      if (argument is com.apollographql.apollo.api.Optional.Present<*>) arguments[definition.name] = toJson(argument.value)
    }
    return arguments
  }

  // Every field's resolver records its path and coerced arguments, and
  // returns what the field's type needs. apollo-execution coerces arguments
  // while collecting fields; if they can't be coerced, the field gets an
  // error and its resolver isn't called.
  //
  // A subscription root field's resolver is its source stream resolver: it
  // records a source call, then raises or returns a flow of one event.
  // apollo-execution uses each event as the root field's value; it doesn't
  // resolve the root field again on the event. So, as in execution, the event
  // stands for the root field's resolution: when the flow emits it, the
  // adapter records the root call, with the arguments the source stream
  // resolver got.
  private val recorder = Resolver { info ->
    val arguments = arguments(info)
    val type = info.fieldDefinition().type
    if (info.parentType == info.schema.subscriptionTypeDefinition?.name) {
      sourceCalls.add(mapOf("field" to info.fieldName, "arguments" to arguments))
      if (subscribe == "raise") throw RuntimeException("the source stream can't be established")
      val responseName = info.field.responseName()
      val recorded = calls
      return@Resolver flow {
        recorded.add(mapOf("path" to listOf(responseName), "arguments" to arguments))
        emit(valueFor(info.schema, type))
      }
    }
    calls.add(mapOf("path" to info.path, "arguments" to arguments))
    valueFor(info.schema, type)
  }

  private fun coerceSchema(sdl: String): ExecutableSchema = coerceSchemas.getOrPut(sdl) {
    val builder = ExecutableSchema.Builder().schema(sdl).resolver(recorder)
    for (scalar in customScalars(sdl)) builder.addCoercing(scalar, KitScalarCoercing(scalar))
    builder.build()
  }

  // The request goes to ExecutableSchema#execute, or #subscribe for a
  // subscription, as a request body parsed with apollo-execution's
  // parseAsGraphQLRequest: the variables and extensions are read by Apollo's
  // JSON reader (Int, Long, Double, or a JsonNumber for what a Double can't
  // hold), as a server would. That reader rounds integers beyond a Long, so
  // `exact-numbers` isn't claimed. apollo-execution always validates first;
  // it has no way to execute an unvalidated document, so `unvalidated` isn't
  // claimed. If execute throws instead of returning a response, the client
  // gets none, and the caller answers with an `error`: the kit's "no
  // response". The response is GraphQLResponse#serialize's JSON.
  fun coerce(request: JsonNode): Pair<Map<String, Any?>, String> {
    val schema = coerceSchema(request.get("schema").asText())
    val graphQLRequest = graphQLRequest(
      request.get("document").asText(),
      request.get("variables").asText(),
      request.get("operationName")?.takeIf { !it.isNull }?.asText(),
      request.get("extensions")?.takeIf { !it.isNull }?.asText(),
    )
    calls = mutableListOf()
    sourceCalls = mutableListOf()
    subscribe = request.get("subscribe")?.takeIf { !it.isNull }?.asText()
    try {
      val response = runBlocking {
        // A subscription goes through subscribe; the response is the first
        // event of the response flow, which is then cancelled.
        if (isSubscription(request)) {
          when (val event = schema.subscribe(graphQLRequest).first()) {
            is SubscriptionResponse -> event.response
            is SubscriptionError -> throw IllegalStateException("the subscription failed with no result: ${event.errors.joinToString("; ") { it.message }}")
          }
        } else {
          schema.execute(graphQLRequest)
        }
      }
      val fields = linkedMapOf<String, Any?>("calls" to calls)
      if (subscribe != null) fields["sourceCalls"] = sourceCalls
      return fields to response.toJsonText()
    } finally {
      subscribe = null
    }
  }

  // Whether the operation the request selects is a subscription. Only the
  // subscription vectors carry `subscribe`, and a server routes a request to
  // subscribe by its transport (a WebSocket's subscribe message); those
  // documents hold one operation, a subscription when it is one.
  private fun isSubscription(request: JsonNode): Boolean {
    if (!request.hasNonNull("subscribe")) return false
    val document = request.get("document").asText().parseAsGQLDocument().value ?: return false
    val operations = document.definitions.filterIsInstance<com.apollographql.apollo.ast.GQLOperationDefinition>()
    val name = request.get("operationName")?.takeIf { !it.isNull }?.asText()
    val operation = if (name == null) operations.singleOrNull() else operations.firstOrNull { it.name == name }
    return operation?.operationType == "subscription"
  }

  // ---- schema ----

  // Built as a server builds one: ExecutableSchema.Builder#schema parses the
  // SDL, and #build adds Apollo's built-in definitions and runs
  // validateAsSchema (GQLDocument#toSchema), which merges extensions and
  // validates. It reports an invalid schema with a SourceAwareException
  // (parse errors and GraphQL issues), or refuses a definition of one of its
  // own built-in names ("Source schema cannot contain definition ..."). Those
  // are `valid: false`. Any other exception is a crash.
  fun schema(sdl: String): Map<String, Any?> = try {
    ExecutableSchema.Builder().schema(sdl).build()
    mapOf("valid" to true)
  } catch (e: SourceAwareException) {
    mapOf("valid" to false, "errors" to listOf(e.message))
  } catch (e: IllegalStateException) {
    if (e.message?.startsWith("Source schema cannot contain definition") != true) throw e
    mapOf("valid" to false, "errors" to listOf(e.message))
  }

  // ---- introspect ----

  // The kit's query, executed with ExecutableSchema#execute against the
  // schema built from the SDL; introspection needs no resolver. A schema
  // apollo-execution refuses (as above) is answered as a request error.
  fun introspect(sdl: String, query: String): String {
    val schema = try {
      ExecutableSchema.Builder().schema(sdl).build()
    } catch (e: SourceAwareException) {
      return JSON.writeValueAsString(mapOf("errors" to listOf(mapOf("message" to "ExecutableSchema.Builder: ${e.message}"))))
    }
    val response = runBlocking { schema.execute(graphQLRequest(query, null, null, null)) }
    return response.toJsonText()
  }

  // ---- coordinate ----

  private val coordinateSchemas = HashMap<String, Schema>()

  // apollo-ast's schema coordinate API: parseAsGQLSchemaCoordinate, then
  // resolveSchemaCoordinate against the schema GQLDocument#toSchema builds
  // from the SDL. A parse issue is `ok: false`. resolveSchemaCoordinate
  // throws IllegalArgumentException when an element that contains the
  // coordinate's isn't in the schema (§2.14's error): `error`. Anything else
  // is a crash. The resolved element's kind is its class, and its own name
  // is the last segment of `path`; ResolvedSchemaElement doesn't carry its
  // container, so the containers are the names Apollo parsed.
  fun coordinate(sdl: String, coordinate: String): Map<String, Any?> {
    val parsed = coordinate.parseAsGQLSchemaCoordinate(ParserOptions.Default)
    val value: GQLSchemaCoordinate = parsed.value ?: return mapOf("ok" to false, "error" to parsed.issues.firstOrNull()?.message)
    val schema = coordinateSchemas.getOrPut(sdl) { sdl.toGQLDocument().toSchema() }
    val resolved = try {
      resolveSchemaCoordinate(schema, value)
    } catch (e: IllegalArgumentException) {
      return mapOf("ok" to true, "error" to e.message)
    }
    val element: Map<String, Any?>? = when (resolved) {
      null -> null
      is ResolvedType -> mapOf("kind" to "type", "path" to listOf(resolved.typeDefinition.name))
      is ResolvedField -> mapOf("kind" to "field", "path" to listOf(container(value), resolved.fieldDefinition.name))
      is ResolvedInputField -> mapOf("kind" to "inputField", "path" to listOf(container(value), resolved.inputField.name))
      is ResolvedEnumValue -> mapOf("kind" to "enumValue", "path" to listOf(container(value), resolved.enumValue.name))
      is ResolvedFieldArgument -> {
        val c = value as GQLArgumentCoordinate
        mapOf("kind" to "argument", "path" to listOf(c.type, c.field, resolved.argument.name))
      }
      is ResolvedDirective -> mapOf("kind" to "directive", "path" to listOf(resolved.directiveDefinition.name))
      is ResolvedDirectiveArgument -> mapOf("kind" to "directiveArgument", "path" to listOf((value as GQLDirectiveArgumentCoordinate).name, resolved.argument.name))
    }
    return mapOf("ok" to true, "resolved" to element)
  }

  private fun container(coordinate: GQLSchemaCoordinate): String = when (coordinate) {
    is GQLMemberCoordinate -> coordinate.type
    is GQLArgumentCoordinate -> coordinate.type
    is GQLTypeCoordinate -> coordinate.name
    is GQLDirectiveCoordinate -> coordinate.name
    is GQLDirectiveArgumentCoordinate -> coordinate.name
  }
}
