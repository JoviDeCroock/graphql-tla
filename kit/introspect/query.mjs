// The introspection query the kit sends: the usual full query (the one
// graphql-js's getIntrospectionQuery writes with every option on), with
// every field the draft's introspection types have, plus __typename at the
// root. QUERY selects every list with includeDeprecated: true;
// QUERY_DEFAULTS leaves the argument out, so lists take its default.

const typeRef = (depth) => (depth === 0 ? "kind name" : `kind name ofType { ${typeRef(depth - 1)} }`);

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

fragment FullType on __Type {
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
  ${typeRef(9)}
}
`;

export const QUERY = text("(includeDeprecated: true)");
export const QUERY_DEFAULTS = text("");
