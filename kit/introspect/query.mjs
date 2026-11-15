// The introspection query the kit sends: the usual full query (the one
// graphql-js's getIntrospectionQuery writes with every option on), with
// every field the draft's introspection types have, plus __typename at the
// root. QUERY selects every list with includeDeprecated: true;
// QUERY_DEFAULTS leaves the argument out, so lists take its default.
// lookupQuery asks __type(name:) for a few names, with the same FullType
// fragment.

// How many levels of ofType the TypeRef fragment selects.
export const TYPE_REF_DEPTH = 9;

const typeRef = (depth) => (depth === 0 ? "kind name" : `kind name ofType { ${typeRef(depth - 1)} }`);

const fragments = (inc) => `fragment FullType on __Type {
  kind
  name
  description
  specifiedByURL
  isOneOf
  fields${inc} {
    name
    description
    args${inc} { ...InputValue }
    type { ...TypeRef }
    isDeprecated
    deprecationReason
  }
  inputFields${inc} { ...InputValue }
  interfaces { ...TypeRef }
  enumValues${inc} {
    name
    description
    isDeprecated
    deprecationReason
  }
  possibleTypes { ...TypeRef }
}

fragment InputValue on __InputValue {
  name
  description
  type { ...TypeRef }
  defaultValue
  isDeprecated
  deprecationReason
}

fragment TypeRef on __Type {
  ${typeRef(TYPE_REF_DEPTH)}
}
`;

const text = (inc) => `query IntrospectionQuery {
  __typename
  __schema {
    description
    queryType { kind name }
    mutationType { kind name }
    subscriptionType { kind name }
    types { ...FullType }
    directives${inc} {
      name
      description
      isRepeatable
      locations
      args${inc} { ...InputValue }
      isDeprecated
      deprecationReason
    }
  }
}

${fragments(inc)}`;

const INC = "(includeDeprecated: true)";

export const QUERY = text(INC);
export const QUERY_DEFAULTS = text("");

// [{ alias, name }] → a query with one aliased __type(name:) per lookup.
export const lookupQuery = (lookups, includeDeprecated) => `query TypeLookup {
${lookups.map(({ alias, name }) => `  ${alias}: __type(name: ${JSON.stringify(name)}) { ...FullType }`).join("\n")}
}

${fragments(includeDeprecated ? INC : "")}`;
