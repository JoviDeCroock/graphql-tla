"""The kit's areas beyond execution (docs/kit-areas.md) for graphql-core.

Each area is a function from a request to the result's fields. It mirrors the
graphql-js adapter's modules in adapters/graphql-js/areas/, since graphql-core
is a port of graphql-js.

What graphql-core raises to reject an input is an answer, not a crash: a
GraphQLError (GraphQLSyntaxError included), or a TypeError that graphql-core
raises on purpose. `build_schema` raises the SDL rules' errors as a
TypeError, and graphql-core's type constructors raise one for a type in the
wrong place ("Argument type must be a GraphQL input type."). Any other
exception is a crash. It propagates, and adapter.py answers the request with
`{"type": "error"}`. See `rejected`.
"""

import asyncio
import json
import linecache
import math
import os
import sys

from graphql import (
    ExecutionResult,
    GraphQLError,
    OperationType,
    assert_valid_schema,
    build_schema,
    execute,
    get_operation_ast,
    graphql_sync,
    is_executable_definition_node,
    is_list_type,
    is_non_null_type,
    is_object_type,
    is_type_system_definition_node,
    is_type_system_extension_node,
    parse,
    parse_schema_coordinate,
    resolve_ast_schema_coordinate,
    subscribe,
    validate,
    validate_schema,
)

# coerce: with --validate, validate the document first, as a server does, and
# don't claim `unvalidated`.
VALIDATING = "--validate" in sys.argv[1:]

CAPABILITIES = {
    # parse reads the whole Document grammar, type system included.
    "parse": ["parse-sdl"],
    # build_schema gives a custom scalar graphql-core's default parse_literal,
    # value_from_ast_untyped, which accepts every literal.
    "validate": ["custom-scalar-literals"],
    # get_argument_values leaves an argument with no value and no default out
    # of the resolver's keyword arguments, and coerce_input_value leaves such
    # an input field out of the dict. Python's json reads integers exactly,
    # but floats as doubles (1e400 is inf), so not `exact-numbers`.
    # Resolvers return objects for object fields (nested-fields); a
    # subscription goes through `subscribe` with a source stream resolver
    # (subscription-source); graphql-core takes no request extensions, so
    # they are read and dropped (request-extensions).
    "coerce": [
        "absent-vs-null",
        "nested-fields",
        "subscription-source",
        "request-extensions",
        *([] if VALIDATING else ["unvalidated"]),
    ],
    # build_schema takes extensions in the same document and applies them.
    "schema": ["schema-extensions"],
    # build_schema keeps the SDL's `directive @label(...) on ...` definitions,
    # so validate knows them and introspection lists them.
    "introspect": ["custom-directives"],
    # parse_schema_coordinate and resolve_ast_schema_coordinate.
    "coordinate": [],
}

GRAPHQL_DIR = os.path.dirname(sys.modules["graphql"].__file__) + os.sep


def rejected(error):
    """Whether graphql-core raised the exception to reject its input.

    graphql-core wraps any exception from resolving a type's fields,
    interfaces or members in a TypeError ("Query fields cannot be resolved.
    ..."), so this looks at the innermost cause. That is a rejection if it is
    a GraphQLError, or a TypeError from a `raise` statement in graphql-core's
    own source. A TypeError Python raises for a failing expression, a
    RecursionError and the like are crashes."""
    while error.__cause__ is not None:
        error = error.__cause__
    if isinstance(error, GraphQLError):
        return True
    if type(error) is not TypeError or error.__traceback__ is None:
        return False
    tb = error.__traceback__
    while tb.tb_next is not None:
        tb = tb.tb_next
    filename = tb.tb_frame.f_code.co_filename
    line = linecache.getline(filename, tb.tb_lineno).strip()
    return filename.startswith(GRAPHQL_DIR) and line.startswith("raise ")


# Built schemas by SDL: the validate and coerce vectors share a few.
schemas = {}


def cached_schema(sdl, check=False):
    if sdl not in schemas:
        schema = build_schema(sdl)
        if check:
            assert_valid_schema(schema)
        schemas[sdl] = schema
    return schemas[sdl]


# parse: which definitions each grammar allows (docs/kit/parse.md).
# graphql-core's TypeExtensionNode subclasses TypeSystemDefinitionNode
# (language/ast.py:1106), so is_type_system_definition_node is true for a
# type extension too, unlike graphql-js's isTypeSystemDefinitionNode. The
# grammar's TypeSystemDefinition has no extensions, so they are left out.
GRAMMARS = {
    "executable": is_executable_definition_node,
    "typeSystem": lambda d: is_type_system_definition_node(d) and not is_type_system_extension_node(d),
    "typeSystemExtension": lambda d: is_type_system_definition_node(d) or is_type_system_extension_node(d),
    "document": lambda _d: True,
}


def parse_area(request):
    """Is the source a syntactically valid document of the grammar the
    request names (an executable document without `grammar`)? graphql-core's
    parse reads the whole Document grammar, so every definition must be of a
    kind the grammar allows. Default options: graphql-core's parser reads
    directives on a directive definition only with
    experimental_directives_on_directive_definitions, which stays off."""
    allowed = GRAMMARS.get(request.get("grammar", "executable"))
    if allowed is None:
        raise ValueError(f"unknown grammar {request.get('grammar')!r}")
    try:
        document = parse(request["source"])
    except GraphQLError:
        return {"ok": False}
    return {"ok": all(allowed(d) for d in document.definitions)}


def error_json(error):
    return {
        "message": error.message,
        **({"locations": [loc._asdict() for loc in error.locations]} if error.locations else {}),
    }


def validate_area(request):
    """validate() with graphql-core's default rules. The schema builds and the
    document parses for every vector, so a failure there is the adapter's,
    and raises. validate() can also raise from inside a rule (a subscription
    with @skip(if: $v) at its root). That is a crash, not a rejection:
    validate() returns the errors that reject a document, and graphql_sync
    doesn't catch this one either (graphql.py:301). So it propagates, and
    adapter.py answers `error`, as the graphql-js adapter does."""
    schema = cached_schema(request["schema"], check=True)
    document = parse(request["document"])
    errors = validate(schema, document)
    return {"valid": not errors, "errors": [error_json(e) for e in errors]}


def to_json(value):
    """Arguments as JSON. Enum values are their names, which is what
    build_schema makes their internal values. JSON has no non-finite
    numbers, so those become strings, as JavaScript's String() writes them."""
    if isinstance(value, float) and not math.isfinite(value):
        return "NaN" if math.isnan(value) else ("Infinity" if value > 0 else "-Infinity")
    if isinstance(value, (list, tuple)):
        return [to_json(v) for v in value]
    if isinstance(value, dict):
        return {k: to_json(v) for k, v in value.items()}
    return value


def value_for(type_):
    """What a field's resolver returns, by its type (nested-fields): "ok"
    for a leaf, an object for an object type, two for a list of objects."""
    if is_non_null_type(type_):
        type_ = type_.of_type
    if is_list_type(type_):
        item = value_for(type_.of_type)
        return [item, dict(item)] if isinstance(item, dict) else [item]
    return {} if is_object_type(type_) else "ok"


def run(awaitable):
    """Runs a coroutine on adapter.py's event loop, which is idle while an
    area request is answered."""
    return asyncio.get_event_loop().run_until_complete(awaitable)


def coerce_area(request):
    """Executes the document with a resolver on every field that records its
    path and keyword arguments. By default `execute` runs without validation
    (`unvalidated`). With --validate, `graphql_sync` parses, validates and
    executes, as a server would.

    A document that doesn't parse gets graphql-core's own answer to it, the
    one `graphql_sync` gives (graphql.py:293-296): ExecutionResult(data=None,
    errors=[syntax error]). A subscription operation goes through
    `subscribe`, whose source stream resolver records its call in
    sourceCalls and returns a stream of one event, or raises
    (subscription-source). The response is the first event's result, or the
    ExecutionResult `subscribe` returns instead of a stream."""
    schema = cached_schema(request["schema"])
    calls = []
    source_calls = []

    def resolver(_source, info, **args):
        calls.append({"path": info.path.as_list(), "arguments": to_json(args)})
        return value_for(info.return_type)

    variables = json.loads(request["variables"])
    operation_name = request.get("operationName")
    # The request's extensions: graphql-core's execute and graphql_sync take
    # none, so they are read and dropped, as a server would.
    if "extensions" in request:
        json.loads(request["extensions"])
    try:
        document = parse(request["document"])
    except GraphQLError as error:
        return {"response": to_json(ExecutionResult(data=None, errors=[error]).formatted), "calls": []}
    operation = get_operation_ast(document, operation_name)
    if operation is not None and operation.operation == OperationType.SUBSCRIPTION and "subscribe" in request:
        if VALIDATING:
            # As graphql_sync does before it executes (graphql.py:298-303).
            errors = validate(schema, document)
            if errors:
                return {"response": to_json(ExecutionResult(data=None, errors=errors).formatted), "calls": []}

        def source_resolver(_root, info, **args):
            source_calls.append({"field": info.field_name, "arguments": to_json(args)})
            if request["subscribe"] == "raise":
                raise RuntimeError("the source stream can't be established")

            async def events():
                yield {}

            return events()

        async def first_result():
            result = await subscribe(
                schema,
                document,
                variable_values=variables,
                operation_name=operation_name,
                field_resolver=resolver,
                subscribe_field_resolver=source_resolver,
            )
            if isinstance(result, ExecutionResult):
                return result
            try:
                return await result.__anext__()
            finally:
                await result.aclose()

        result = run(first_result())
        return {"response": to_json(result.formatted), "calls": calls, "sourceCalls": source_calls}
    if VALIDATING:
        result = graphql_sync(
            schema,
            request["document"],
            variable_values=variables,
            operation_name=operation_name,
            field_resolver=resolver,
        )
    else:
        result = execute(
            schema,
            document,
            variable_values=variables,
            operation_name=operation_name,
            field_resolver=resolver,
        )
    return {"response": to_json(result.formatted), "calls": calls}


def schema_area(request):
    """build_schema, then validate_schema. build_schema applies the SDL rules
    (unique names, known types and directives) and builds the types, whose
    constructors check some type system rules too."""
    try:
        errors = validate_schema(build_schema(request["sdl"]))
    except Exception as error:
        if not rejected(error):
            raise
        errors = [error]
    return {"valid": not errors, **({"errors": [str(e) for e in errors]} if errors else {})}


def introspect_area(request):
    """build_schema, then graphql_sync with the kit's query. A schema that
    graphql-core rejects is answered with a request error."""
    try:
        schema = build_schema(request["sdl"])
    except Exception as error:
        if not rejected(error):
            raise
        return {"response": {"errors": [{"message": f"build_schema: {error}"}]}}
    result = graphql_sync(schema, request["query"])
    return {"response": to_json(result.formatted)}


def name_in(mapping, element):
    """The name graphql-core keeps an element under. Its fields, arguments
    and enum values carry no name of their own: they are the values of their
    type's (or field's, or directive's) map, keyed by name."""
    return next(name for name, value in mapping.items() if value is element)


def resolved_json(resolved):
    kind = resolved.kind
    if kind == "NamedType":
        return {"kind": "type", "path": [resolved.type.name]}
    if kind == "Field":
        return {"kind": "field", "path": [resolved.type.name, name_in(resolved.type.fields, resolved.field)]}
    if kind == "InputField":
        return {"kind": "inputField", "path": [resolved.type.name, name_in(resolved.type.fields, resolved.input_field)]}
    if kind == "EnumValue":
        return {"kind": "enumValue", "path": [resolved.type.name, name_in(resolved.type.values, resolved.enum_value)]}
    if kind == "FieldArgument":
        field = name_in(resolved.type.fields, resolved.field)
        return {
            "kind": "argument",
            "path": [resolved.type.name, field, name_in(resolved.field.args, resolved.field_argument)],
        }
    if kind == "Directive":
        return {"kind": "directive", "path": [resolved.directive.name]}
    if kind == "DirectiveArgument":
        return {
            "kind": "directiveArgument",
            "path": [resolved.directive.name, name_in(resolved.directive.args, resolved.directive_argument)],
        }
    raise ValueError(f"unexpected resolved kind {kind}")


def coordinate_area(request):
    """parse_schema_coordinate, then resolve_ast_schema_coordinate in the
    schema build_schema makes from the SDL. A GraphQLError from the parser is
    `ok: false`. The resolver raises a TypeError for a missing type, field or
    directive, or a type of the wrong kind
    (utilities/resolve_schema_coordinate.py): that is `error`, if it comes
    from a `raise` in graphql-core (see `rejected`). Anything else is a
    crash. The element's kind and names come from what graphql-core resolved
    to, not from the coordinate."""
    schema = cached_schema(request["sdl"])
    try:
        ast = parse_schema_coordinate(request["coordinate"])
    except GraphQLError:
        return {"ok": False}
    try:
        resolved = resolve_ast_schema_coordinate(schema, ast)
    except TypeError as error:
        if not rejected(error):
            raise
        return {"ok": True, "error": str(error)}
    return {"ok": True, "resolved": resolved_json(resolved) if resolved is not None else None}


AREAS = {
    "parse": parse_area,
    "validate": validate_area,
    "coerce": coerce_area,
    "schema": schema_area,
    "introspect": introspect_area,
    "coordinate": coordinate_area,
}
