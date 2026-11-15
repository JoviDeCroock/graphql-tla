// The schema area (docs/kit/schema.md): whether an SDL schema is valid.
// buildSchema runs the SDL rules (unique names, known types and
// directives), then validateSchema the type system rules. A schema that
// fails to build, even with an unexpected exception, is rejected.

export default (graphql, { sdl }) => {
  let errors;
  try {
    errors = graphql.validateSchema(graphql.buildSchema(sdl));
  } catch (error) {
    errors = [error];
  }
  return { valid: errors.length === 0, ...(errors.length ? { errors: errors.map((e) => String(e?.message ?? e)) } : {}) };
};
