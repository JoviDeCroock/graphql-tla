// The introspection queries the kit sends, for three profiles, one per
// release (docs/kit/introspect.md, Profiles):
//
// - "September2026", the edition the kit grades: the usual full query (the
//   one graphql-js's getIntrospectionQuery writes with every option on),
//   with every field September 2026's introspection types have.
// - "September2025": the same, without what September 2025 doesn't have:
//   __Directive.isDeprecated and deprecationReason, and includeDeprecated
//   on __Schema.directives.
// - "October2021": without what October 2021 doesn't have either:
//   __Type.isOneOf, __InputValue.isDeprecated and deprecationReason, and
//   includeDeprecated on args and inputFields.
//
// schemaQuery selects __typename at the root and __schema, every list
// with includeDeprecated: true, or without the argument, so that lists
// take its default. lookupQuery asks __type(name:) for a few names, with
// the same FullType fragment. wrappersQuery asks `wrappers`: __type(name:
// "__Schema")'s fields with every field of their types, so that the List
// and Non-Null wrappers among them show their other fields, which must be
// null (§4.2.2). It is a request of its own, so that a service that
// rejects it (a limit on nesting, say) still has its __schema graded.
//
// `missing` names fields of the introspection types a service lacks
// ("__Directive.isRepeatable"), and arguments
// ("__Schema.directives(includeDeprecated:)"), found by DISCOVERY_QUERY
// when it rejects the profiles' queries. The queries then leave them out
// (selection, argsOf).

// Newest first: the order the kit tries them in.
export const PROFILES = ["September2026", "September2025", "October2021"];
// The edition the kit grades.
export const PRIMARY = PROFILES[0];

// How many levels of ofType the TypeRef fragment selects.
export const TYPE_REF_DEPTH = 9;
// How many levels of ofType the Wrapper fragment selects with every field.
// __Schema's deepest field type, [__Type!]!, has three wrappers.
export const WRAPPER_DEPTH = 3;

// The fields each profile selects, per introspection type. `wrapper` is a
// __Type in the Wrapper fragment, whose list fields select only `name`.
export const SELECTED = {
  September2026: {
    data: ["__typename", "__schema"],
    schema: ["description", "queryType", "mutationType", "subscriptionType", "types", "directives"],
    type: ["kind", "name", "description", "specifiedByURL", "isOneOf", "fields", "inputFields", "interfaces", "enumValues", "possibleTypes"],
    field: ["name", "description", "args", "type", "isDeprecated", "deprecationReason"],
    inputValue: ["name", "description", "type", "defaultValue", "isDeprecated", "deprecationReason"],
    enumValue: ["name", "description", "isDeprecated", "deprecationReason"],
    directive: ["name", "description", "isRepeatable", "locations", "args", "isDeprecated", "deprecationReason"],
    wrapper: ["kind", "name", "description", "specifiedByURL", "isOneOf", "fields", "interfaces", "possibleTypes", "enumValues", "inputFields", "ofType"],
  },
  September2025: {
    data: ["__typename", "__schema"],
    schema: ["description", "queryType", "mutationType", "subscriptionType", "types", "directives"],
    type: ["kind", "name", "description", "specifiedByURL", "isOneOf", "fields", "inputFields", "interfaces", "enumValues", "possibleTypes"],
    field: ["name", "description", "args", "type", "isDeprecated", "deprecationReason"],
    inputValue: ["name", "description", "type", "defaultValue", "isDeprecated", "deprecationReason"],
    enumValue: ["name", "description", "isDeprecated", "deprecationReason"],
    directive: ["name", "description", "isRepeatable", "locations", "args"],
    wrapper: ["kind", "name", "description", "specifiedByURL", "isOneOf", "fields", "interfaces", "possibleTypes", "enumValues", "inputFields", "ofType"],
  },
  October2021: {
    data: ["__typename", "__schema"],
    schema: ["description", "queryType", "mutationType", "subscriptionType", "types", "directives"],
    type: ["kind", "name", "description", "specifiedByURL", "fields", "inputFields", "interfaces", "enumValues", "possibleTypes"],
    field: ["name", "description", "args", "type", "isDeprecated", "deprecationReason"],
    inputValue: ["name", "description", "type", "defaultValue"],
    enumValue: ["name", "description", "isDeprecated", "deprecationReason"],
    directive: ["name", "description", "isRepeatable", "locations", "args"],
    wrapper: ["kind", "name", "description", "specifiedByURL", "fields", "interfaces", "possibleTypes", "enumValues", "inputFields", "ofType"],
  },
};

// Which of SELECTED's lists hold each introspection type's fields.
export const LISTS_OF = {
  __Schema: ["schema"],
  __Type: ["type", "wrapper"],
  __Field: ["field"],
  __InputValue: ["inputValue"],
  __EnumValue: ["enumValue"],
  __Directive: ["directive"],
};

// A missing argument is named "Owner.field(argument:)".
export const isArgument = (m) => m.endsWith(":)");

// A profile's selection without the `missing` fields.
export const selection = (profile, missing = []) => {
  const out = { ...SELECTED[profile] };
  for (const m of missing.filter((x) => !isArgument(x))) {
    const [owner, field] = m.split(".");
    for (const list of LISTS_OF[owner]) out[list] = out[list].filter((f) => f !== field);
  }
  return out;
};

// The lists that take includeDeprecated, each as the argument's name in
// `missing`, and the profiles whose queries pass it.
export const INCLUDE_DEPRECATED = {
  fields: { arg: "__Type.fields(includeDeprecated:)", profiles: PROFILES },
  enumValues: { arg: "__Type.enumValues(includeDeprecated:)", profiles: PROFILES },
  inputFields: { arg: "__Type.inputFields(includeDeprecated:)", profiles: ["September2026", "September2025"] },
  fieldArgs: { arg: "__Field.args(includeDeprecated:)", profiles: ["September2026", "September2025"] },
  directiveArgs: { arg: "__Directive.args(includeDeprecated:)", profiles: ["September2026", "September2025"] },
  directives: { arg: "__Schema.directives(includeDeprecated:)", profiles: ["September2026"] },
};

// The arguments each field of the introspection types must take for a
// profile's queries: { "__Type.fields": ["includeDeprecated"], ... }.
export const neededArgs = (profile) => {
  const out = {};
  for (const { arg, profiles } of Object.values(INCLUDE_DEPRECATED)) {
    if (!profiles.includes(profile)) continue;
    const [, owner, field, name] = arg.match(/^(\w+)\.(\w+)\((\w+):\)$/);
    (out[`${owner}.${field}`] ??= []).push(name);
  }
  return out;
};

// The fields each introspection type must have for a profile's query: what
// it selects, and ofType, which the TypeRef and Wrapper fragments select.
export const neededFields = (profile) => {
  const S = SELECTED[profile];
  return Object.fromEntries(Object.entries(LISTS_OF).map(([owner, lists]) => [owner, [...new Set([...lists.flatMap((l) => S[l]), ...(owner === "__Type" ? ["ofType"] : [])])]]));
};

// The fields of each introspection type, and their arguments, under an
// alias per type (a, b, ... in LISTS_OF's order).
export const DISCOVERY_ALIASES = Object.keys(LISTS_OF).map((owner, i) => [String.fromCharCode(97 + i), owner]);
export const DISCOVERY_QUERY = `query IntrospectionFields {
${DISCOVERY_ALIASES.map(([alias, owner]) => `  ${alias}: __type(name: "${owner}") { fields { name args { name } } }`).join("\n")}
}
`;

const INC = "(includeDeprecated: true)";

const typeRef = (depth) => (depth === 0 ? "kind name" : `kind name ofType { ${typeRef(depth - 1)} }`);

const LIST_FIELDS = new Set(["fields", "interfaces", "possibleTypes", "enumValues", "inputFields"]);
const wrapper = (S, depth) =>
  depth === 0
    ? "kind name"
    : S.wrapper.map((f) => (f === "ofType" ? `ofType { ${wrapper(S, depth - 1)} }` : LIST_FIELDS.has(f) ? `${f} { name }` : f)).join(" ");

// The arguments each list takes in a profile: includeDeprecated: true where
// the profile's __Schema, __Type, __Field and __Directive accept it, when
// inc is set, and the service has the argument.
const argsOf = (profile, inc, missing = []) =>
  Object.fromEntries(
    Object.entries(INCLUDE_DEPRECATED).map(([list, { arg, profiles }]) => [list, inc && profiles.includes(profile) && !missing.includes(arg) ? INC : ""]),
  );

const lines = (fields) => fields.map((f) => `  ${f}`).join("\n");

const fragments = (profile, inc, s, missing) => {
  const a = argsOf(profile, inc, missing);
  const sub = {
    fields: `fields${a.fields} {\n${lines(s.field.map((f) => (f === "args" ? `  args${a.fieldArgs} { ...InputValue }` : f === "type" ? "  type { ...TypeRef }" : `  ${f}`)))}\n  }`,
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
export const schemaQuery = (profile, inc, missing = []) => {
  const a = argsOf(profile, inc, missing);
  const S = selection(profile, missing);
  const directive = S.directive.map((f) => (f === "args" ? `args${a.directiveArgs} { ...InputValue }` : f));
  return `query IntrospectionQuery {
  __typename
  __schema {
${S.schema.includes("description") ? "    description\n" : ""}    queryType { kind name }
    mutationType { kind name }
    subscriptionType { kind name }
    types { ...FullType }
    directives${a.directives} {
${directive.map((f) => `      ${f}`).join("\n")}
    }
  }
}

${fragments(profile, inc, S, missing)}`;
};

// __type(name: "__Schema")'s fields, each with its type as the Wrapper
// selection has it.
export const wrappersQuery = (profile, missing = []) => `query IntrospectionWrappers {
  wrappers: __type(name: "__Schema") {
    fields {
      name
      type { ${wrapper(selection(profile, missing), WRAPPER_DEPTH)} }
    }
  }
}
`;

// [{ alias, name }] → a query with one aliased __type(name:) per lookup.
export const lookupQuery = (profile, lookups, inc, missing = []) => `query TypeLookup {
${lookups.map(({ alias, name }) => `  ${alias}: __type(name: ${JSON.stringify(name)}) { ...FullType }`).join("\n")}
}

${fragments(profile, inc, selection(profile, missing), missing)}`;
