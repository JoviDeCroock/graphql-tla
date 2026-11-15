// Realistic bugs in Introspection.tla. scripts/check.mjs checks each against
// IntrospectionVectors.tla with only `property` enabled, and
// `node scripts/differential-type-system.mjs --mutants` checks that the
// differential against graphql-js catches each one too, except those marked
// `differential: false`.
const file = "Introspection.tla";
const module = "IntrospectionVectors.tla";

const mutants = [
  {
    name: "includeDeprecated is ignored, so deprecated elements are never returned",
    find: "Visible(includeDeprecated, element) == includeDeprecated \\/ ~IsDeprecated(element)",
    replace: "Visible(includeDeprecated, element) == ~IsDeprecated(element)",
    property: "DeprecatedAreFiltered",
  },
  {
    name: "every built-in scalar is included, referenced or not",
    find: "  \\cup (BuiltinScalarNames \\cap ReferencedNames(Full(S, B)))",
    replace: "  \\cup BuiltinScalarNames",
    property: "TypesAreTheNamedTypes",
  },
  {
    name: "a scalar only referenced by an argument doesn't count as referenced",
    find: "         \\cup UNION {ArgTypeNames(T.fields[k].args) : k \\in DOMAIN T.fields}\n",
    replace: "",
    property: "TypesAreTheNamedTypes",
  },
  {
    name: "the ofType chain lists the wrappers innermost first",
    find: '     THEN [kind |-> IF type.wrappers[i] = "nonNull" THEN "NON_NULL" ELSE "LIST",',
    replace:
      '     THEN [kind |-> IF type.wrappers[Len(type.wrappers) + 1 - i] = "nonNull" THEN "NON_NULL" ELSE "LIST",',
    property: "TypeRefsAreOfTypeChains",
  },
  {
    name: "an interface's possibleTypes include the interfaces that implement it",
    find: '{T.name : T \\in {U \\in Range(FS.types) : U.kind = "OBJECT" /\\ name \\in Range(U.interfaces)}}',
    replace:
      '{T.name : T \\in {U \\in Range(FS.types) : U.kind \\in {"OBJECT", "INTERFACE"} /\\ name \\in Range(U.interfaces)}}',
    property: "FieldsFollowTheKind",
  },
  {
    name: "interfaces is null for an interface, as before interfaces could implement interfaces",
    find: "   interfaces |-> IF hasFields",
    replace: '   interfaces |-> IF T.kind = "OBJECT"',
    property: "FieldsFollowTheKind",
  },
  {
    name: "isOneOf is false, not null, for types other than input objects",
    find: '   isOneOf |-> IF T.kind = "INPUT_OBJECT" THEN Some(T.oneOf) ELSE None,',
    replace: "   isOneOf |-> Some(T.oneOf),",
    property: "FieldsFollowTheKind",
  },
  {
    name: "mutationType and subscriptionType use the default names, ignoring the schema definition",
    find: "  LET name == RootTypeName(S, operation) IN",
    replace:
      "  LET name == IF DefaultRootTypeName(operation) \\in Range(AllNames(S))\n              THEN <<DefaultRootTypeName(operation)>> ELSE <<>> IN",
    property: "RootsAreReported",
  },
  {
    name: "@deprecated's reason is nullable",
    find: 'BuiltinInputValue("reason", NN("String"),',
    replace: 'BuiltinInputValue("reason", Named("String"),',
    property: "BuiltinsFollowTheSpec",
  },
  {
    name: "__DirectiveLocation lacks DIRECTIVE_DEFINITION",
    find: '"INPUT_OBJECT", "INPUT_FIELD_DEFINITION",\n    "DIRECTIVE_DEFINITION">>)',
    replace: '"INPUT_OBJECT", "INPUT_FIELD_DEFINITION">>)',
    property: "BuiltinsFollowTheSpec",
  },
  {
    name: "default values are compared by literal kind, so 1 and 1.0 differ for a Float",
    find: "  \\/ /\\ e # None /\\ a # None\n",
    replace: "  \\/ /\\ e # None /\\ a # None /\\ e[1].kind = a[1].kind\n",
    property: "ResultsAreJudged",
  },
  {
    name: "built-in descriptions must match exactly",
    find: "DescriptionMatches(e, a) == e = AnyDescription \\/ e = a",
    replace: "DescriptionMatches(e, a) == e = a",
    property: "ResultsAreJudged",
  },
  {
    name: "a union's possibleTypes are compared as a set",
    find: '  /\\ IF e.kind = "INTERFACE"',
    replace: '  /\\ IF e.kind \\in {"INTERFACE", "UNION"}',
    property: "ResultsAreJudged",
  },
  {
    name: "directive locations are compared in order",
    find: "  /\\ Len(e.locations) = Len(a.locations) /\\ Range(e.locations) = Range(a.locations)",
    replace: "  /\\ e.locations = a.locations",
    property: "ResultsAreJudged",
    differential: false,
    why: "graphql-js returns locations in source order, so the stricter comparison isn't observable",
  },
];

export default mutants.map((m) => ({ file, module, ...m }));
