// The schema area (docs/kit/schema.md): whether an SDL schema is valid.
// buildSchema runs the SDL rules (unique names, known types and
// directives), then validateSchema the type system rules.
//
// A rejection is a GraphQLError, or the plain Error buildSchema throws with
// the SDL rules' messages: the answer is `valid: false`. Any other
// exception, such as graphql-js 16's RangeError (stack overflow) on some
// input object defaults, is a crash: it propagates, and the adapter answers
// the vector with an `error` message, which the kit reports as a crash.

export default (graphql, { sdl }) => {
  let errors;
  try {
    errors = graphql.validateSchema(graphql.buildSchema(sdl));
  } catch (error) {
    const rejected = error instanceof graphql.GraphQLError || Object.getPrototypeOf(error) === Error.prototype;
    if (!rejected) throw error;
    errors = [error];
  }
  return { valid: errors.length === 0, ...(errors.length ? { errors: errors.map((e) => String(e?.message ?? e)) } : {}) };
};
