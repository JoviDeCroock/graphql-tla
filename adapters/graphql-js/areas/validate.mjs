// The validate area (docs/kit/validate.md): whether a document is valid
// against a schema, by graphql-js's validate() with its default rules.
//
// Every vector's schema builds and every document parses, so a failure
// there is the adapter's, and throws. graphql-js 16 can throw from inside
// validate() itself (a subscription with @skip(if: $v) at its root); the
// request would fail, so that counts as rejecting the document.
//
// A custom scalar that buildSchema makes from SDL has no parser of its own
// and accepts every literal: the custom-scalar-literals capability.

export const capabilities = ["custom-scalar-literals"];

// Built schemas, by graphql-js module and SDL text: the vectors share a few.
const built = new WeakMap();

const schemaFor = (graphql, sdl) => {
  let cache = built.get(graphql);
  if (!cache) built.set(graphql, (cache = new Map()));
  if (!cache.has(sdl)) {
    const schema = graphql.buildSchema(sdl);
    graphql.assertValidSchema(schema);
    cache.set(sdl, schema);
  }
  return cache.get(sdl);
};

export default (graphql, request) => {
  const schema = schemaFor(graphql, request.schema);
  const document = graphql.parse(request.document);
  let errors;
  try {
    errors = graphql.validate(schema, document);
  } catch (error) {
    return { valid: false, errors: [{ message: `validate() threw: ${error?.message ?? error}` }] };
  }
  return {
    valid: errors.length === 0,
    errors: errors.map((e) => ({ message: e.message, ...(e.locations ? { locations: e.locations } : {}) })),
  };
};
