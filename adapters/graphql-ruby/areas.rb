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
# records as a crash for that vector. No area answers a crash with a
# response graphql-ruby didn't give.

module Areas
  # coerce runs Schema.execute as it comes, which validates first. With
  # --unvalidated it passes `validate: false` and claims `unvalidated`.
  # graphql-ruby documents that option for documents validated earlier:
  # "execution of an invalid document is undefined" (lib/graphql/query.rb:31-32).
  UNVALIDATED = ARGV.include?("--unvalidated")

  CAPABILITIES = [
    "parse", "validate", "coerce", "schema", "introspect",
    "absent-vs-null",
    # from_definition builds the SDL's `directive @label(...) on ...`
    # definitions, so validate knows them and introspection lists them.
    "custom-directives",
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
  #
  # Ruby's JSON parser refuses an escaped lone high surrogate ("\ud800"),
  # so such variables never reach graphql-ruby: a Ruby server would refuse
  # the request body before it ran. The adapter says so with `unsupported`
  # (docs/kit/coerce.md) instead of making up a response graphql-ruby didn't
  # give. Any other JSON the parser refuses is the adapter's failure.
  def coerce(request)
    schema = cached(:coerce, request["schema"]) { AreaSchema.from_definition(request["schema"], default_resolve: EchoResolver.new) }
    variables =
      begin
        JSON.parse(request["variables"])
      rescue JSON::ParserError => e
        raise unless lone_surrogate?(request["variables"])

        return { unsupported: "lone surrogate: Ruby's JSON parser refuses the variables (#{e.message.lines.first&.strip})" }
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

  # A rejection is a schema error graphql-ruby reports on purpose: one of its
  # own GraphQL::Error classes, or a plain `raise "…"` (RuntimeError) or
  # `raise ArgumentError, "…"` that graphql-ruby's schema definition methods
  # write for a schema mistake. Everything else is a crash, an exception
  # graphql-ruby didn't turn into a schema error:
  # - any other class, such as a NoMethodError or a SystemStackError;
  # - a RuntimeError or ArgumentError that Ruby itself raised from a core
  #   method graphql-ruby called, such as Module#include's "cyclic include
  #   detected" for `interface A implements A` (has_interfaces.rb:26 includes
  #   the interface module into itself). That error is a property of how
  #   graphql-ruby represents interfaces as Ruby modules, not a check of
  #   §3.7's rule, which graphql-ruby doesn't make;
  # - an "Invariant:" error, which graphql-ruby raises for a state it doesn't
  #   expect.
  def schema_rejection?(error)
    return true if error.is_a?(GraphQL::Error)
    return false unless error.instance_of?(RuntimeError) || error.instance_of?(ArgumentError)

    raised_by_graphql?(error) && !error.message.start_with?("Invariant")
  end

  GRAPHQL_LIB = File.join(Gem.loaded_specs["graphql"].full_gem_path, "lib", "graphql")

  # Whether the error comes from a `raise` statement in graphql-ruby's own
  # code: the innermost frame is graphql-ruby's Ruby code, not a core method
  # it called, and its line is a `raise`. A core method's frame (a C
  # function) carries its caller's path and line, so the path alone can't
  # tell them apart. From Ruby 3.4 on, its label names the method's owner
  # ("Module#append_features"); before, it doesn't, and the `raise` test
  # alone decides.
  def raised_by_graphql?(error)
    location = error.backtrace_locations&.first
    path = location&.absolute_path
    return false unless path&.start_with?(GRAPHQL_LIB)

    owner = location.label[/\A(?:block (?:\(\d+ levels\) )?in )?([A-Z][\w:]*)[#.]/, 1]
    return false if owner && !owner.start_with?("GraphQL::")

    File.readlines(path)[location.lineno - 1]&.match?(/\braise\b/) || false
  end

  # Whether JSON text holds an escaped lone surrogate: a high surrogate
  # escape not followed by a low one, or a low one not after a high one.
  LONE_SURROGATE = /\\u[dD][89abAB]\h{2}(?!\\u[dD][c-fC-F]\h{2})|(?<!\\u[dD][89abAB]\h{2})\\u[dD][c-fC-F]\h{2}/

  def lone_surrogate?(text) = LONE_SURROGATE.match?(text)

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
  # schema that doesn't build is answered as a request error: a rejection,
  # as schema_rejection? tells one, raised by from_definition or, as in
  # `schema` above, by Schema.execute when it first loads the types.
  #
  # Any other exception is a crash, not a response graphql-ruby gave, and
  # propagates: adapter.rb answers it with an `error` (docs/kit-areas.md).
  def introspect(request)
    schema = AreaSchema.from_definition(request["sdl"], default_resolve: IntrospectionResolver.new)
    { response: JSON.parse(schema.execute(request["query"]).to_json) }
  rescue StandardError => e
    raise unless schema_rejection?(e)

    { response: { errors: [{ message: "#{e.class}: #{e.message.lines.first&.strip}" }] } }
  end

  # Built schemas, by area and SDL: the validate and coerce vectors share a
  # few.
  SCHEMAS = {}

  def cached(area, sdl)
    SCHEMAS[[area, sdl]] ||= yield
  end
end
