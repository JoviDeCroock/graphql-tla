// The parse area (docs/kit/parse.md): is the source a syntactically valid
// executable document?
//
// graphql-js's parse also reads the type system language, so a document it
// parses is an ExecutableDocument only if every definition is an operation
// or a fragment.
export default (graphql, { source }) => {
  let document;
  try {
    document = graphql.parse(source);
  } catch (error) {
    if (error instanceof graphql.GraphQLError) return { ok: false };
    throw error;
  }
  return { ok: document.definitions.every((d) => graphql.isExecutableDefinitionNode(d)) };
};
