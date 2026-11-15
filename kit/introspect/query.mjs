// The introspection queries the kit sends, for two profiles:
//
// - "draft": the usual full query (the one graphql-js's
//   getIntrospectionQuery writes with every option on), with every field
//   the draft's introspection types have.
// - "oct2021": the same, without what the October 2021 edition doesn't
//   have: __Type.isOneOf, __InputValue.isDeprecated and deprecationReason,
//   __Directive.isDeprecated and deprecationReason, and includeDeprecated
//   on args, inputFields and directives.
//
// Both select __typename at the root, and `wrappers`: __type(name:
// "__Schema")'s fields with every field of their types, so that the List
// and Non-Null wrappers among them show their other fields, which must be
// null (§4.2.2). schemaQuery selects every list with includeDeprecated:
// true, or leaves the argument out, so that lists take its default.
// lookupQuery asks __type(name:) for a few names, with the same FullType
// fragment.

export const PROFILES = ["draft", "oct2021"];

// How many levels of ofType the TypeRef fragment selects.
export const TYPE_REF_DEPTH = 9;
// How many levels of ofType the Wrapper fragment selects with every field.
// __Schema's deepest field type, [__Type!]!, has three wrappers.
export const WRAPPER_DEPTH = 3;

// The fields each profile selects, per introspection type. `wrapper` is a
// __Type in the Wrapper fragment, whose list fields select only `name`.
export const SELECTED = {
  draft: {
    data: ["__typename", "__schema", "wrappers"],
    schema: ["description", "queryType", "mutationType", "subscriptionType", "types", "directives"],
    type: ["kind", "name", "description", "specifiedByURL", "isOneOf", "fields", "inputFields", "interfaces", "enumValues", "possibleTypes"],
    field: ["name", "description", "args", "type", "isDeprecated", "deprecationReason"],
    inputValue: ["name", "description", "type", "defaultValue", "isDeprecated", "deprecationReason"],
    enumValue: ["name", "description", "isDeprecated", "deprecationReason"],
    directive: ["name", "description", "isRepeatable", "locations", "args", "isDeprecated", "deprecationReason"],
    wrapper: ["kind", "name", "description", "specifiedByURL", "isOneOf", "fields", "interfaces", "possibleTypes", "enumValues", "inputFields", "ofType"],
  },
  oct2021: {
    data: ["__typename", "__schema", "wrappers"],
    schema: ["description", "queryType", "mutationType", "subscriptionType", "types", "directives"],
    type: ["kind", "name", "description", "specifiedByURL", "fields", "inputFields", "interfaces", "enumValues", "possibleTypes"],
    field: ["name", "description", "args", "type", "isDeprecated", "deprecationReason"],
    inputValue: ["name", "description", "type", "defaultValue"],
    enumValue: ["name", "description", "isDeprecated", "deprecationReason"],
    directive: ["name", "description", "isRepeatable", "locations", "args"],
    wrapper: ["kind", "name", "description", "specifiedByURL", "fields", "interfaces", "possibleTypes", "enumValues", "inputFields", "ofType"],
  },
};

const INC = "(includeDeprecated: true)";

const typeRef = (depth) => (depth === 0 ? "kind name" : `kind name ofType { ${typeRef(depth - 1)} }`);

const LIST_FIELDS = new Set(["fields", "interfaces", "possibleTypes", "enumValues", "inputFields"]);
const wrapper = (profile, depth) =>
  depth === 0
    ? "kind name"
    : SELECTED[profile].wrapper
        .map((f) => (f === "ofType" ? `ofType { ${wrapper(profile, depth - 1)} }` : LIST_FIELDS.has(f) ? `${f} { name }` : f))
        .join(" ");

// The arguments each list takes in a profile: includeDeprecated: true where
// the profile's __Type, __Field and __Directive accept it, when inc is set.
const argsOf = (profile, inc) => {
  const all = inc ? INC : "";
  const draftOnly = profile === "draft" ? all : "";
  return { fields: all, enumValues: all, inputFields: draftOnly, args: draftOnly, directives: draftOnly };
};

const lines = (fields) => fields.map((f) => `  ${f}`).join("\n");

const fragments = (profile, inc) => {
  const a = argsOf(profile, inc);
  const s = SELECTED[profile];
  const sub = {
    fields: `fields${a.fields} {\n${lines(s.field.map((f) => (f === "args" ? `  args${a.args} { ...InputValue }` : f === "type" ? "  type { ...TypeRef }" : `  ${f}`)))}\n  }`,
    inputFields: `inputFields${a.inputFields} { ...InputValue }`,
    interfaces: "interfaces { ...TypeRef }",
    enumValues: `enumValues${a.enumValues} {\n${lines(s.enumValue.map((f) => `  ${f}`))}\n  }`,
    possibleTypes: "possibleTypes { ...TypeRef }",
  };
  return `fragment FullType on __Type {
${lines(s.type.map((f) => sub[f] ?? f))}
}

fragment InputValue on __InputValue {
${lines(s.inputValue.map((f) => (f === "type" ? "type { ...TypeRef }" : f)))}
}

fragment TypeRef on __Type {
  ${typeRef(TYPE_REF_DEPTH)}
}
`;
};

// The __schema query for a profile, with includeDeprecated: true on every
// list that takes it, or with every list's default.
export const schemaQuery = (profile, inc) => {
  const a = argsOf(profile, inc);
  const directive = SELECTED[profile].directive.map((f) => (f === "args" ? `args${a.args} { ...InputValue }` : f));
  return `query IntrospectionQuery {
  __typename
  __schema {
    description
    queryType { kind name }
    mutationType { kind name }
    subscriptionType { kind name }
    types { ...FullType }
    directives${a.directives} {
${directive.map((f) => `      ${f}`).join("\n")}
    }
  }
  wrappers: __type(name: "__Schema") {
    fields {
      name
      type { ${wrapper(profile, WRAPPER_DEPTH)} }
    }
  }
}

${fragments(profile, inc)}`;
};

// [{ alias, name }] → a query with one aliased __type(name:) per lookup.
export const lookupQuery = (profile, lookups, inc) => `query TypeLookup {
${lookups.map(({ alias, name }) => `  ${alias}: __type(name: ${JSON.stringify(name)}) { ...FullType }`).join("\n")}
}

${fragments(profile, inc)}`;
