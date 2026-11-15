# A graphql-tla adapter for graphql-ruby (docs/conformance.md).
#
# The schema is built from the kit's SDL with GraphQL::Schema.from_definition
# and one default resolver on every field. The resolver tells the kit it was
# called, then waits for the kit's `settle` through GraphQL::Dataloader: it
# loads its call from a Dataloader source, which pauses the resolver's fiber
# while graphql-ruby runs the other fields. Once every fiber is paused,
# graphql-ruby runs the source, whose `fetch` reads the kit's messages until
# its calls are settled. So several resolvers are pending at once, and
# graphql-ruby only continues when it has their values.
#
# graphql-ruby runs on the thread that reads stdin and only waits for the
# kit in Execution#await, so whenever it waits there it is blocked on the
# kit, and the adapter says `idle`.
#
# It also claims parent-values (objects carry the kit's tokens, and each
# call reports the token of the object its resolver was given),
# custom-scalar-results (a custom scalar's coerce_result raises
# GraphQL::ExecutionError on a value it can't represent) and scalar-results.
# Not subscription-stream: graphql-ruby's subscriptions have no source
# stream to drive (see README.md).
#
# The other areas (parse, validate, coerce, schema, introspect) are in
# areas.rb.
#
# Usage: ruby adapter.rb [--lazy] [--invalid-results] [--no-idle] [--unvalidated]
#
# --lazy waits through lazy_resolve instead, the way GraphQL::Batch and
# other promise libraries do: a resolver returns a lazy value, which
# graphql-ruby syncs once it has run everything it can. A list's items can
# then be lazy too, so this mode claims `deferred-items`.
#
# Out of the box, graphql-ruby raises out of Schema.execute when a resolver
# returns a value of the wrong shape or one its leaf type can't represent
# (see README.md). A client then gets no response at all, so the adapter
# answers `no-response`, and the kit grades it (`responds`,
# `resultCoercion`). --invalid-results instead turns those values into field
# errors with graphql-ruby's documented hooks. Either way the adapter claims
# `invalid-results` and `uncoercible-results`.
#
# --no-idle leaves out `idle`, so the kit falls back to `--grace`.
#
# --unvalidated makes coerce execute without validating (see areas.rb).

require "bundler/setup"
require "graphql"
require "json"
require_relative "areas"

LAZY = ARGV.include?("--lazy")
IDLE = !ARGV.include?("--no-idle")
INVALID_RESULTS = ARGV.include?("--invalid-results")

$stdout.sync = true

# The adapter's own failures: a protocol mix-up with the kit. Answered with
# `error`, never `no-response`, even when raised inside Schema.execute.
class AdapterError < StandardError; end

def send_message(message)
  $stdout.write("#{JSON.generate(message)}\n")
end

def read_message
  while (line = $stdin.gets)
    next if line.strip.empty?

    begin
      return JSON.parse(line)
    rescue JSON::ParserError => e
      # Ruby's JSON parser refuses an escaped lone high surrogate, which some
      # parse vectors hold. A Ruby server couldn't read such a request either.
      return {
        "type" => "unreadable", "id" => line[/"id":(\d+)/, 1]&.to_i, "area" => line[/"type":"(\w+)"/, 1],
        "message" => e.message.lines.first&.strip, "lone_surrogate" => Areas.lone_surrogate?(line)
      }
    end
  end
  exit 0
end

# The value of an `object` outcome. resolve_type picks the type it names.
# With parent-values it carries the kit's token.
KitObject = Struct.new(:typename, :token)

# What a custom scalar's result coercion rejects (custom-scalar-results).
UNREPRESENTABLE = Object.new.freeze

# parent-values: the token of the object a resolver was given. The root value
# and a subscription's event are hashes; objects are KitObjects.
def token_of(object)
  case object
  when KitObject then object.token
  when Hash then object[:token]
  end
end

# The value of an `error` outcome. The resolver raises it as a field error.
KitFailure = Struct.new(:path)

# One `execute`: the calls graphql-ruby made and the outcomes the kit sent.
class Execution
  attr_reader :id

  # parent-values: each field's call reports its parent's token.
  attr_reader :parent_values

  def initialize(id, parent_values: false)
    @id = id
    @parent_values = parent_values
    @next_call = 1
    @calls = {}
    @outcomes = {}
    @applied = 0
  end

  # Tells the kit a resolver was called. `after` is the number of settles
  # this execution had applied, so the kit knows what graphql-ruby had seen.
  # `parent` (an array holding the token) is given only with parent-values,
  # and never for a list item.
  def call(path, type, parent = nil)
    call = @next_call
    @next_call += 1
    @calls[call] = { path: path.map(&:to_s), type: type }
    message = { type: "call", id: @id, call: call, path: path.map(&:to_s), returnType: type.to_type_signature, after: @applied }
    message[:parent] = parent.first if parent
    send_message(message)
    call
  end

  # graphql-ruby needs the value of `call`. Until the kit has settled it,
  # graphql-ruby is blocked on the kit: say so, and handle the kit's next
  # message.
  def await(call)
    until @outcomes.key?(call)
      send_message(type: "idle", id: @id) if IDLE
      message = read_message
      unless message["type"] == "settle" && message["id"] == @id
        raise AdapterError, "the kit sent #{message["type"]} for execution #{message["id"]} while execution #{@id} waited for call #{call}"
      end
      settle(message)
    end
    @outcomes.delete(call)
  end

  def settle(message)
    pending = @calls.delete(message["call"])
    raise AdapterError, "no pending call #{message["call"]}" unless pending

    @applied += 1
    @outcomes[message["call"]] = value_for(message["outcome"], pending[:path], pending[:type])
  end

  private

  # The value a resolver returns for each outcome.
  def value_for(outcome, path, type)
    nullable = type.non_null? ? type.of_type : type
    case outcome["kind"]
    when "error" then KitFailure.new(path)
    when "null" then nil
    # A leaf at a list position is the number 1, which Ruby doesn't iterate.
    # scalar-results: the internal value the kit names, as it is.
    when "leaf" then outcome.key?("value") ? outcome["value"] : (nullable.list? ? 1 : leaf_value(nullable))
    when "uncoercible" then uncoercible_value(nullable)
    when "object" then KitObject.new(outcome["type"], outcome["token"])
    when "list"
      item_type = nullable.of_type
      Array.new(outcome["length"]) do |i|
        item_path = [*path, i.to_s]
        if outcome["items"]
          # Without `deferred-items`, the items come with the list.
          value_for(outcome["items"][i], item_path, item_type)
        else
          KitLazy.new(self, call(item_path, item_type), item_path)
        end
      end
    else raise AdapterError, "unknown outcome #{outcome.inspect}"
    end
  end

  # A value the leaf type can't represent: a fraction for an Int, a
  # non-finite number for a Float, a name that isn't one of an enum's values,
  # and for a custom scalar a value its coerce_result raises on.
  def uncoercible_value(type)
    return "NOT_A_VALUE" if type.kind.enum?
    return UNREPRESENTABLE unless type.default_scalar?

    type.graphql_name == "Int" ? 1.2 : Float::INFINITY
  end

  def leaf_value(type)
    return type.enum_values.first.value if type.kind.enum?

    case type.graphql_name
    when "Int" then 1
    when "Float" then 1.5
    when "Boolean" then true
    else "v"
    end
  end
end

def unwrap(value)
  raise GraphQL::ExecutionError, "resolver at #{value.path.join(".")} failed" if value.is_a?(KitFailure)

  value
end

# --lazy: what a resolver returns. graphql-ruby calls `value` when it syncs
# lazies, breadth-first.
class KitLazy
  def initialize(execution, call, path)
    @execution = execution
    @call = call
    @path = path
  end

  def value
    unwrap(@execution.await(@call))
  end
end

# The Dataloader source a resolver loads its call from. graphql-ruby runs
# `fetch` once every fiber is paused, with the calls loaded since the last
# fetch.
class KitSource < GraphQL::Dataloader::Source
  def initialize(execution)
    @execution = execution
  end

  def fetch(calls)
    calls.map { |call| @execution.await(call) }
  end
end

# The one resolver every field gets, and the type resolution for abstract
# types.
class KitResolver
  def call(_type, field, object, _args, context)
    query = context.query
    # The subscribe step of a subscription: graphql-ruby records the event
    # the subscription listens to. The kit's root call is the root field's
    # resolver running on the event, below.
    return context.skip if query.subscription? && !query.subscription_update?

    execution = context[:kit]
    path = context.current_path
    call = execution.call(path, field.type, execution.parent_values ? [token_of(object)] : nil)
    if LAZY
      KitLazy.new(execution, call, path.map(&:to_s))
    else
      unwrap(context.dataloader.with(KitSource, execution).load(call))
    end
  end

  def resolve_type(_abstract_type, value, context)
    context.types.type(value.typename)
  end

  # from_definition gives every custom scalar these two (build_from_definition.rb:585-589).
  # Input passes through, as a custom scalar's default coerce_input does.
  def coerce_input(_type, value, _context)
    value
  end

  # custom-scalar-results: the result coercion raises on a value it can't
  # represent. graphql-ruby turns a GraphQL::ExecutionError from
  # coerce_result into a field error (execution/interpreter/runtime.rb:708-711).
  def coerce_result(type, value, _context)
    raise GraphQL::ExecutionError, "#{type.graphql_name} cannot represent this value" if value.equal?(UNREPRESENTABLE)

    value
  end
end

# Subscriptions kept in memory. The adapter stands in for the transport: it
# triggers the subscription's event and takes what graphql-ruby delivers.
class KitSubscriptions < GraphQL::Subscriptions
  attr_reader :subscriptions, :delivered

  def initialize(**options)
    super
    @subscriptions = {}
    @delivered = nil
  end

  def write_subscription(query, events)
    @subscriptions[build_id] = {
      query_string: query.query_string,
      variables: query.provided_variables,
      context: { kit: query.context[:kit] },
      operation_name: query.operation_name,
      events: events,
    }
  end

  def read_subscription(id)
    @subscriptions[id]
  end

  def delete_subscription(id)
    @subscriptions.delete(id)
  end

  def deliver(_id, result)
    @delivered = result
  end

  def reset
    @subscriptions.clear
    @delivered = nil
  end
end

# --invalid-results: by default graphql-ruby raises out of `execute` when a
# resolver returns a value of the wrong shape (see README.md). This base
# schema uses the two documented hooks to turn those into field errors
# instead: `type_error` for the errors graphql-ruby reports there, and
# `rescue_from` for the exceptions coercion and list completion raise.
#
# The adapter's own AdapterError passes through `rescue_from`: it isn't a
# result graphql-ruby coerced.
class InvalidResultsSchema < GraphQL::Schema
  rescue_from(StandardError) do |error|
    raise error if error.is_a?(AdapterError)

    raise GraphQL::ExecutionError, error.message
  end

  # The encoding errors come from a scalar's coerce_result, inside
  # graphql-ruby's `rescue GraphQL::ExecutionError` (runtime.rb:708-711), so
  # raising one there makes a field error with the field's path and
  # location, as graphql-ruby does for any execution error (runtime.rb:604-609).
  # An unresolved type is reported outside that rescue (runtime.rb:746),
  # so it is added to the errors; the kit never sends one.
  def self.type_error(error, context)
    return super if error.is_a?(GraphQL::InvalidNullError)
    raise GraphQL::ExecutionError, error.message unless error.is_a?(GraphQL::UnresolvedTypeError)

    field_error = GraphQL::ExecutionError.new(error.message)
    field_error.path = context[:current_path]
    context.errors << field_error
    # What type_error returns becomes the field's value, so null.
    nil
  end
end

RESOLVER = KitResolver.new
SCHEMAS = {}

def schema_for(sdl)
  SCHEMAS[sdl] ||= begin
    plugins = { KitSubscriptions => {} }
    plugins[GraphQL::Dataloader] = nil unless LAZY
    base = INVALID_RESULTS ? InvalidResultsSchema : GraphQL::Schema
    schema = base.from_definition(sdl, default_resolve: RESOLVER, using: plugins)
    schema.lazy_resolve(KitLazy, :value) if LAZY
    schema
  end
end

def execute(message)
  parent_values = message.key?("initialValue")
  execution = Execution.new(message["id"], parent_values: parent_values)
  schema = schema_for(message["schema"])
  options = { variables: message["variables"] || {}, context: { kit: execution } }
  # parent-values: the root value carries the kit's initial value token.
  options[:root_value] = { token: message["initialValue"] } if parent_values
  result =
    if message["operationType"] == "subscription"
      # Subscribe, then deliver one event to the subscription, as an
      # execute_all implementation does when the event is triggered.
      subscriptions = schema.subscriptions
      subscriptions.reset
      schema.execute(message["document"], **options)
      id, subscription = subscriptions.subscriptions.first
      raise AdapterError, "graphql-ruby recorded no subscription" unless id

      subscriptions.execute(id, subscription[:events].first, parent_values ? { token: message["event"] } : {})
      subscriptions.delivered or raise AdapterError, "graphql-ruby delivered no result for the event"
    else
      schema.execute(message["document"], **options)
    end
  send_message(type: "response", id: execution.id, response: result.to_h)
rescue AdapterError => e
  send_message(type: "error", id: message["id"], message: "#{e.class}: #{e.message}\n#{e.backtrace.first(8).join("\n")}")
rescue StandardError => e
  # graphql-ruby raised out of Schema.execute: an application's caller gets
  # an exception, and its client no response (docs/conformance.md).
  send_message(type: "no-response", id: message["id"], message: "#{e.class}: #{e.message.lines.first&.strip}")
end

# A request in one of the other areas. An exception out of graphql-ruby that
# isn't a rejection is a crash, answered with `error` (docs/kit-areas.md).
def answer_area(message)
  result = Areas.public_send(message["type"], message)
  send_message(type: "result", id: message["id"], **result)
rescue StandardError, SystemStackError => e
  send_message(type: "error", id: message["id"], message: "#{e.class}: #{e.message.lines.first&.strip}\n#{e.backtrace.first(8).join("\n")}")
end

AREAS = %w[parse validate coerce schema introspect].freeze

send_message(
  type: "hello",
  protocol: 1,
  name: "graphql-ruby #{GraphQL::VERSION}",
  capabilities: [
    *(IDLE ? ["idle"] : []),
    *(LAZY ? ["deferred-items"] : []),
    # Out of the box both raise out of `execute` (no-response); with
    # --invalid-results they become field errors.
    "invalid-results",
    "uncoercible-results",
    "mutation",
    "subscription",
    "parent-values",
    "custom-scalar-results",
    "scalar-results",
    *Areas::CAPABILITIES,
  ],
)

loop do
  message = read_message
  case message["type"]
  when "execute"
    execute(message)
  when "end"
    next
  when *AREAS
    # Only execution uses `idle`.
    answer_area(message)
    next
  when "unreadable"
    if message["area"] == "parse" && message["lone_surrogate"]
      # A source with a lone surrogate never reaches graphql-ruby, so the kit
      # doesn't grade it (docs/kit/parse.md).
      send_message(type: "result", id: message["id"], unsupported: "lone surrogate: Ruby's JSON parser refuses the request (#{message["message"]})")
    else
      send_message(type: "error", id: message["id"], message: "unreadable request: #{message["message"]}")
    end
    next
  else
    send_message(type: "error", id: message["id"], message: "unexpected #{message["type"]} with no execution running")
  end
  send_message(type: "idle", id: message["id"]) if IDLE
end
