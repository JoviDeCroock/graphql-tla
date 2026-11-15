// The introspect area (docs/kit/introspect.md): builds the schema from SDL
// and executes the kit's introspection query against it. A schema
// graphql-js can't build, or a query it rejects, is answered with a
// response that has errors.

export default (graphql, { sdl, query }) => {
  let schema;
  try {
    schema = graphql.buildSchema(sdl);
  } catch (error) {
    return { response: { errors: [{ message: `buildSchema: ${error?.message ?? error}` }] } };
  }
  const result = graphql.graphqlSync({ schema, source: query });
  return { response: JSON.parse(JSON.stringify(result)) };
};
