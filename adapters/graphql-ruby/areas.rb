# The kit's areas beyond execution (docs/kit-areas.md) for graphql-ruby:
# parse, validate, coerce, schema and introspect. adapter.rb sends each
# request here and writes the result.
#
# Every area uses graphql-ruby as an application would: GraphQL.parse,
# GraphQL::Schema.from_definition, Schema.validate and Schema.execute, on a
# plain GraphQL::Schema. None of execution's options (--lazy,
# --invalid-results) apply here.
#
# A rejection is an answer. Anything else graphql-ruby raises is a crash,
# and propagates: adapter.rb answers it with an `error`, which the kit
# records as a crash. introspect is the exception (see below).

module Areas
  # coerce runs Schema.execute as it comes, which validates first. With
  # --unvalidated it passes `validate: false` and claims `unvalidated`.
  # graphql-ruby documents that option for documents validated earlier:
  # "execution of an invalid document is undefined" (lib/graphql/query.rb:31-32).
  UNVALIDATED = ARGV.include?("--unvalidated")

  CAPABILITIES = [
    "parse", "validate", "coerce", "schema", "introspect",
    "absent-vs-null",
    *(UNVALIDATED ? ["unvalidated"] : []),
  ].freeze

  # The schemas' superclass. Its only setting is the logger: by default
  # graphql-ruby logs to $stdout, the kit's channel (Schema.default_logger,
  # lib/graphql/schema.rb:1387). Validation logs a warning for each legacy
  # conflict it lets through (see README.md), hundreds in a run, so only
  # errors go to stderr.
  class AreaSchema < GraphQL::Schema
    default_logger(Logger.new($stderr, level: Logger::ERROR))
  end

  EXECUTABLE = [GraphQL::Language::Nodes::OperationDefinition, GraphQL::Language::Nodes::FragmentDefinition].freeze

  module_function

  # parse (docs/kit/parse.md): GraphQL.parse, as Schema.execute parses a
  # request's document. The parser also reads the type system language, so
  # every definition must be an operation or a fragment. A ParseError is
  # `ok: false`; any other exception is a crash.
  def parse(request)
    document =
      begin
        GraphQL.parse(request["source"])
      rescue GraphQL::ParseError
        return { ok: false }
      end
    { ok: document.definitions.all? { |d| EXECUTABLE.include?(d.class) } }
  end

  # validate (docs/kit/validate.md): Schema.validate, which runs
  # GraphQL::StaticValidation::ALL_RULES, the rules Schema.execute applies to
  # a request, with the schema's default settings.
  #
  # `custom-scalar-literals` isn't claimed. A custom scalar from SDL accepts
  # every constant literal, but graphql-ruby refuses a literal with a
  # variable inside ("Variables aren't supported inside scalar literals",
  # lib/graphql/execution/input_values.rb:310-313), and the vectors that need
  # the capability all have one.
  def validate(request)
    schema = cached(:validate, request["schema"]) { AreaSchema.from_definition(request["schema"]) }
    errors = schema.validate(request["document"])
    { valid: errors.empty?, errors: errors.map { |e| e.to_h.slice("message", "locations") } }
  end

  # coerce (docs/kit/coerce.md): Schema.execute with one resolver on every
  # field, which records the field's path and the arguments graphql-ruby
  # gave it, and returns "ok". Variables are read with Ruby's JSON.parse, as
  # Rack and Rails read a request body: integers exactly, other numbers as
  # Floats, so `1e400` is Infinity and `exact-numbers` isn't claimed. The
  # response is Query::Result#to_json, read back: a result that can't be
  # serialized raises there, and is a crash.
  def coerce(request)
    schema = cached(:coerce, request["schema"]) { AreaSchema.from_definition(request["schema"], default_resolve: EchoResolver.new) }
    variables =
      begin
        JSON.parse(request["variables"])
      rescue JSON::ParserError => e
        # A server can't read the request: a request error.
        return { response: { errors: [{ message: "variables: #{e.message}" }] }, calls: [] }
      end
    calls = []
    result = schema.execute(
      request["document"],
      variables: variables,
      operation_name: request["operationName"],
      validate: !UNVALIDATED,
      context: { calls: calls },
    )
    { response: JSON.parse(result.to_json), calls: calls }
  end

  # The coerce resolver. graphql-ruby passes the arguments as keyword
  # arguments, keyed by each argument's `keyword`, and leaves out an argument
  # that has no value (absent-vs-null).
  class EchoResolver
    def call(_type, field, _object, args, context)
      context[:calls] << { path: context.current_path.map(&:to_s), arguments: Areas.arguments_json(field.arguments(context), args, context) }
      "ok"
    end
  end

  # The arguments as JSON, by their GraphQL names, walking the definitions.
  def arguments_json(definitions, values, context)
    definitions.each_value.with_object({}) do |definition, json|
      next unless values.key?(definition.keyword)

      json[definition.graphql_name] = value_json(definition.type, values[definition.keyword], context)
    end
  end

  def value_json(type, value, context)
    return nil if value.nil?

    type = type.of_type if type.non_null?
    if type.list? && value.is_a?(Array)
      value.map { |item| value_json(type.of_type, item, context) }
    elsif type.list?
      # Not a list, though the type is one: sent as it is, unwrapped.
      value_json(type.of_type, value, context)
    elsif type.kind.input_object? && value.respond_to?(:key?)
      arguments_json(type.arguments(context), value, context)
    elsif value.is_a?(Float) && !value.finite?
      value.to_s
    elsif value.is_a?(Symbol)
      value.to_s
    else
      # Int, Float, String, ID and Boolean as they are; an enum value is its
      # name, which from_definition makes its Ruby value.
      value
    end
  end

  # schema (docs/kit/schema.md): from_definition, then the introspection
  # query. graphql-ruby has no step that validates a schema as a whole.
  # from_definition checks some rules as it builds. Others only hold when a
  # query first loads the types: duplicate field names, for one, raise
  # DuplicateNamesError then. An application only serves a schema by
  # executing queries against it, so the adapter executes graphql-ruby's own
  # INTROSPECTION_QUERY, which reaches every type, and counts what it raises
  # as a rejection too.
  def schema(request)
    schema = AreaSchema.from_definition(request["sdl"], default_resolve: IntrospectionResolver.new)
    begin
      result = schema.execute(GraphQL::Introspection::INTROSPECTION_QUERY).to_h
    rescue RootTypeResolved
      # A query root that is an interface or a union: graphql-ruby built the
      # schema, and asks the application which object type the root value is.
      return { valid: true, note: "graphql-ruby asked resolve_type for the root value" }
    end
    if result["errors"]
      { valid: false, errors: result["errors"].map { |e| e["message"] } }
    else
      { valid: true }
    end
  rescue StandardError => e
    raise unless schema_rejection?(e)

    { valid: false, errors: ["#{e.class}: #{e.message.lines.first&.strip}"] }
  end

  # graphql-ruby reports a schema mistake with one of its own errors, or with
  # a plain `raise "…"` (RuntimeError) or `raise ArgumentError, "…"` in its
  # schema definition methods. Anything else, such as a NoMethodError or a
  # SystemStackError, is a crash. So is a RuntimeError or ArgumentError that
  # no `raise` in graphql-ruby wrote, such as Ruby's own "cyclic include
  # detected", and an "Invariant:" error, which graphql-ruby raises for a
  # state it doesn't expect.
  def schema_rejection?(error)
    return true if error.is_a?(GraphQL::Error)
    return false unless error.instance_of?(RuntimeError) || error.instance_of?(ArgumentError)

    raised_by_graphql?(error) && !error.message.start_with?("Invariant")
  end

  GRAPHQL_LIB = File.join(Gem.loaded_specs["graphql"].full_gem_path, "lib", "graphql")

  # Whether the error comes from a `raise` statement in graphql-ruby's code.
  def raised_by_graphql?(error)
    location = error.backtrace_locations&.first
    path = location&.absolute_path
    return false unless path&.start_with?(GRAPHQL_LIB)

    File.readlines(path)[location.lineno - 1]&.include?("raise") || false
  end

  class RootTypeResolved < StandardError; end

  # Interfaces and unions need resolve_type before graphql-ruby executes a
  # query against a schema from SDL. Introspection resolves no value's type,
  # except the root value's when the query root isn't an object type.
  class IntrospectionResolver
    def call(*) = nil
    def resolve_type(*) = raise(RootTypeResolved)
  end

  # introspect (docs/kit/introspect.md): from_definition, then the kit's
  # query through Schema.execute, and Query::Result#to_json, read back. A
  # schema that doesn't build is answered as a request error.
  #
  # In this area an `error` answer stops the kit's run (docs/kit-areas.md),
  # so a crash, an exception out of from_definition or Schema.execute that
  # isn't a rejection, is answered as the request error a server's error
  # handler would send, with the exception in `crash` and on stderr. The kit
  # grades it as a failure of `executes`.
  def introspect(request)
    step = "from_definition"
    schema = AreaSchema.from_definition(request["sdl"], default_resolve: IntrospectionResolver.new)
    step = "Schema.execute"
    { response: JSON.parse(schema.execute(request["query"]).to_json) }
  rescue StandardError, SystemStackError => e
    message = "#{step}: #{e.class}: #{e.message.lines.first&.strip}"
    return { response: { errors: [{ message: message }] } } if step == "from_definition" && schema_rejection?(e)

    warn "graphql-ruby crashed on introspect request #{request["id"]}: #{message}\n  #{e.backtrace.first(3).join("\n  ")}"
    { response: { errors: [{ message: message }] }, crash: message }
  end

  # Built schemas, by area and SDL: the validate and coerce vectors share a
  # few.
  SCHEMAS = {}

  def cached(area, sdl)
    SCHEMAS[[area, sdl]] ||= yield
  end
end
