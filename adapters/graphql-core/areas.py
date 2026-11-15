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

import json
import linecache
import math
import os
import sys

from graphql import (
    GraphQLError,
    assert_valid_schema,
    build_schema,
    execute,
    graphql_sync,
    is_executable_definition_node,
    parse,
    validate,
    validate_schema,
)

# coerce: with --validate, validate the document first, as a server does, and
# don't claim `unvalidated`.
VALIDATING = "--validate" in sys.argv[1:]

CAPABILITIES = {
    "parse": [],
    # build_schema gives a custom scalar graphql-core's default parse_literal,
    # value_from_ast_untyped, which accepts every literal.
    "validate": ["custom-scalar-literals"],
    # get_argument_values leaves an argument with no value and no default out
    # of the resolver's keyword arguments, and coerce_input_value leaves such
    # an input field out of the dict. Python's json reads integers exactly,
    # but floats as doubles (1e400 is inf), so not `exact-numbers`.
    "coerce": ["absent-vs-null", *([] if VALIDATING else ["unvalidated"])],
    "schema": [],
    "introspect": [],
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


def parse_area(request):
    """Is the source a syntactically valid executable document? graphql-core's
    parse also reads the type system language, so every definition must be an
    operation or a fragment."""
    try:
        document = parse(request["source"])
    except GraphQLError:
        return {"ok": False}
    return {"ok": all(is_executable_definition_node(d) for d in document.definitions)}


def error_json(error):
    return {
        "message": error.message,
        **({"locations": [loc._asdict() for loc in error.locations]} if error.locations else {}),
    }


def validate_area(request):
    """validate() with graphql-core's default rules. The schema builds and the
    document parses for every vector, so a failure there is the adapter's,
    and raises. A GraphQLError raised from inside validate() would fail the
    request, so it rejects the document, as in the graphql-js adapter."""
    schema = cached_schema(request["schema"], check=True)
    document = parse(request["document"])
    try:
        errors = validate(schema, document)
    except GraphQLError as error:
        return {"valid": False, "errors": [{"message": f"validate() raised: {error.message}"}]}
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


def coerce_area(request):
    """Executes the document with a resolver on every field that records its
    path and keyword arguments. By default `execute` runs without validation
    (`unvalidated`). With --validate, `graphql_sync` parses, validates and
    executes, as a server would."""
    schema = cached_schema(request["schema"])
    calls = []

    def resolver(_source, info, **args):
        calls.append({"path": info.path.as_list(), "arguments": to_json(args)})
        return "ok"

    variables = json.loads(request["variables"])
    operation_name = request.get("operationName")
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
            parse(request["document"]),
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


AREAS = {
    "parse": parse_area,
    "validate": validate_area,
    "coerce": coerce_area,
    "schema": schema_area,
    "introspect": introspect_area,
}
