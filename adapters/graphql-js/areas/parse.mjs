// The parse area (docs/kit/parse.md): is the source a syntactically valid
// document of the grammar the request names? Without `grammar`, that is an
// ExecutableDocument.
//
// graphql-js's parse reads the whole Document grammar, executable and type
// system definitions alike, so the adapter parses the source and then asks
// whether every definition is of a kind the grammar allows.
export const capabilities = ["parse-sdl"];

const allowed = {
  executable: (graphql, d) => graphql.isExecutableDefinitionNode(d),
  typeSystem: (graphql, d) => graphql.isTypeSystemDefinitionNode(d),
  typeSystemExtension: (graphql, d) => graphql.isTypeSystemDefinitionNode(d) || graphql.isTypeSystemExtensionNode(d),
  document: () => true,
};

export default (graphql, { source, grammar = "executable" }) => {
  const kind = allowed[grammar];
  if (!kind) throw new Error(`unknown grammar ${JSON.stringify(grammar)}`);
  let document;
  try {
    document = graphql.parse(source);
  } catch (error) {
    if (error instanceof graphql.GraphQLError) return { ok: false };
    throw error;
  }
  return { ok: document.definitions.every((d) => kind(graphql, d)) };
};
