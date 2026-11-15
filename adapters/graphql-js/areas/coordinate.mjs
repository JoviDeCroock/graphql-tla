// The coordinate area (docs/kit/coordinate.md): parse a schema coordinate
// with parseSchemaCoordinate, then resolve it in the schema the SDL builds
// with resolveASTSchemaCoordinate. graphql-js 17 has both, and so does 16
// from 16.15 on; a version without them doesn't claim the area
// (`available`).
//
// A syntax error from the parser is `ok: false`. The plain Error the
// resolver throws for a missing type, field or directive (or a type of the
// wrong kind) is `error`. Any other exception propagates: the adapter
// answers with an `error` message, which the kit reports as a crash. The
// element's kind and names come from the object graphql-js resolved to,
// not from the coordinate.

export const available = (graphql) => typeof graphql.resolveASTSchemaCoordinate === "function";

const KIND = {
  NamedType: "type",
  Field: "field",
  InputField: "inputField",
  EnumValue: "enumValue",
  FieldArgument: "argument",
  Directive: "directive",
  DirectiveArgument: "directiveArgument",
};

const pathOf = (r) => {
  switch (r.kind) {
    case "NamedType":
      return [r.type.name];
    case "Field":
      return [r.type.name, r.field.name];
    case "InputField":
      return [r.type.name, r.inputField.name];
    case "EnumValue":
      return [r.type.name, r.enumValue.name];
    case "FieldArgument":
      return [r.type.name, r.field.name, r.fieldArgument.name];
    case "Directive":
      return [r.directive.name];
    case "DirectiveArgument":
      return [r.directive.name, r.directiveArgument.name];
  }
  throw new Error(`unexpected resolved kind ${r.kind}`);
};

export default (graphql, { sdl, coordinate }) => {
  const schema = graphql.buildSchema(sdl);
  let ast;
  try {
    ast = graphql.parseSchemaCoordinate(coordinate);
  } catch (error) {
    if (error instanceof graphql.GraphQLError) return { ok: false };
    throw error;
  }
  let resolved;
  try {
    resolved = graphql.resolveASTSchemaCoordinate(schema, ast);
  } catch (error) {
    if (Object.getPrototypeOf(error) === Error.prototype) return { ok: true, error: error.message };
    throw error;
  }
  return { ok: true, resolved: resolved ? { kind: KIND[resolved.kind], path: pathOf(resolved) } : null };
};
