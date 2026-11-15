// Introspection results in two directions: a service's response as the
// `actual` data Introspection!Matches reads, and the reference's
// SchemaResult (as tla-ts prints it) as the response a service should
// give, which the self-test and findings use.

import { parseDefault } from "../schema/tla.mjs";

export const BUILTIN_DIRECTIVES = ["skip", "include", "deprecated", "specifiedBy", "oneOf"];
export const BUILTIN_SCALARS = ["Int", "Float", "String", "Boolean", "ID"];
export const isBuiltinType = (name) => name.startsWith("__") || BUILTIN_SCALARS.includes(name);

// ---------------------------------------------------------------------------
// A response as `actual`

export class Malformed extends Error {}

const at = (obj, key, path, check) => {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) throw new Malformed(`${path} isn't an object`);
  if (!(key in obj)) throw new Malformed(`${path} has no ${key}`);
  const v = obj[key];
  if (check && !check(v)) throw new Malformed(`${path}.${key} is ${JSON.stringify(v)?.slice(0, 80)}`);
  return v;
};
const isString = (v) => typeof v === "string";
const isOptString = (v) => v === null || typeof v === "string";
const isBool = (v) => typeof v === "boolean";
const isOptBool = (v) => v === null || typeof v === "boolean";
const isList = (v) => Array.isArray(v);
const isOptList = (v) => v === null || Array.isArray(v);
const opt = (v) => (v === null ? [] : [v]);

const refOf = (t, path) => {
  const out = [];
  for (let node = t, p = path; node !== null && node !== undefined; node = node.ofType ?? null, p += ".ofType") {
    out.push({ kind: at(node, "kind", p, isString), name: opt(at(node, "name", p, isOptString)) });
  }
  return out;
};

const inputValueOf = (v, path) => ({
  name: at(v, "name", path, isString),
  description: opt(at(v, "description", path, isOptString)),
  type: refOf(at(v, "type", path), `${path}.type`),
  defaultValue: at(v, "defaultValue", path, isOptString) === null ? [] : [parseDefault(v.defaultValue)],
  isDeprecated: at(v, "isDeprecated", path, isBool),
  deprecationReason: opt(at(v, "deprecationReason", path, isOptString)),
});

const optList = (v, f) => (v === null ? [] : [v.map(f)]);

const typeOf = (t, i) => {
  const path = `types[${i}]`;
  return {
    kind: at(t, "kind", path, isString),
    name: opt(at(t, "name", path, isOptString)),
    description: opt(at(t, "description", path, isOptString)),
    specifiedByURL: opt(at(t, "specifiedByURL", path, isOptString)),
    isOneOf: opt(at(t, "isOneOf", path, isOptBool)),
    fields: optList(at(t, "fields", path, isOptList), (f, j) => {
      const p = `${path}.fields[${j}]`;
      return {
        name: at(f, "name", p, isString),
        description: opt(at(f, "description", p, isOptString)),
        args: at(f, "args", p, isList).map((a, k) => inputValueOf(a, `${p}.args[${k}]`)),
        type: refOf(at(f, "type", p), `${p}.type`),
        isDeprecated: at(f, "isDeprecated", p, isBool),
        deprecationReason: opt(at(f, "deprecationReason", p, isOptString)),
      };
    }),
    inputFields: optList(at(t, "inputFields", path, isOptList), (v, j) => inputValueOf(v, `${path}.inputFields[${j}]`)),
    interfaces: optList(at(t, "interfaces", path, isOptList), (r, j) => refOf(r, `${path}.interfaces[${j}]`)),
    enumValues: optList(at(t, "enumValues", path, isOptList), (v, j) => {
      const p = `${path}.enumValues[${j}]`;
      return {
        name: at(v, "name", p, isString),
        description: opt(at(v, "description", p, isOptString)),
        isDeprecated: at(v, "isDeprecated", p, isBool),
        deprecationReason: opt(at(v, "deprecationReason", p, isOptString)),
      };
    }),
    possibleTypes: optList(at(t, "possibleTypes", path, isOptList), (r, j) => refOf(r, `${path}.possibleTypes[${j}]`)),
  };
};

const directiveOf = (d, i) => {
  const path = `directives[${i}]`;
  const locations = at(d, "locations", path, isList);
  if (!locations.every(isString)) throw new Malformed(`${path}.locations has a value that isn't a string`);
  return {
    name: at(d, "name", path, isString),
    description: opt(at(d, "description", path, isOptString)),
    isRepeatable: at(d, "isRepeatable", path, isBool),
    locations,
    args: at(d, "args", path, isList).map((a, k) => inputValueOf(a, `${path}.args[${k}]`)),
    isDeprecated: at(d, "isDeprecated", path, isBool),
    deprecationReason: opt(at(d, "deprecationReason", path, isOptString)),
  };
};

// A directive the service provides beyond the spec's, as TypeSystem.tla
// directive data, so that it can be one of the built-ins B.
const typeRefOf = (ref) => ({
  name: ref.at(-1).name[0] ?? "",
  wrappers: ref.slice(0, -1).map((r) => (r.kind === "NON_NULL" ? "nonNull" : "list")),
});
const extraDirective = (d) => ({
  name: d.name,
  description: d.description,
  args: d.args.map((a) => ({
    name: a.name,
    description: a.description,
    type: typeRefOf(a.type),
    default: a.defaultValue,
    deprecated: a.isDeprecated ? [a.deprecationReason[0] ?? ""] : [],
  })),
  repeatable: d.isRepeatable,
  locations: d.locations,
  deprecated: d.isDeprecated ? [d.deprecationReason[0] ?? ""] : [],
  directives: new Set(),
});

// The case for one response: `actual` (with every type and directive, and
// the root's __typename), the spec's built-in directives it returned, and
// its own extra directives. Throws Malformed if the response isn't the
// result of the query.
export const caseOf = (response, documentDirectives) => {
  if (response === null || typeof response !== "object") throw new Malformed("the response isn't an object");
  if (Array.isArray(response.errors) && response.errors.length > 0) {
    throw new Malformed(`the response has errors: ${response.errors.map((e) => e?.message ?? JSON.stringify(e)).join("; ").slice(0, 300)}`);
  }
  const data = at(response, "data", "response");
  const typename = at(data, "__typename", "data", isOptString);
  const s = at(data, "__schema", "data");
  const types = at(s, "types", "__schema", isList).map(typeOf);
  const directives = at(s, "directives", "__schema", isList).map(directiveOf);
  const ofRoot = (key) => {
    const v = at(s, key, "__schema");
    return v === null ? [] : [refOf(v, key)];
  };
  const doc = new Set(documentDirectives);
  const provided = new Set(directives.map((d) => d.name).filter((n) => BUILTIN_DIRECTIVES.includes(n)));
  const extras = directives.filter((d) => !doc.has(d.name) && !BUILTIN_DIRECTIVES.includes(d.name)).map(extraDirective);
  return {
    provided,
    extras,
    actual: {
      typename: opt(typename),
      description: opt(at(s, "description", "__schema", isOptString)),
      queryType: ofRoot("queryType"),
      mutationType: ofRoot("mutationType"),
      subscriptionType: ofRoot("subscriptionType"),
      types,
      builtinTypeNames: new Set(types.map((t) => t.name[0]).filter((n) => n !== undefined && isBuiltinType(n))),
      directives,
      builtinDirectiveNames: new Set(directives.map((d) => d.name).filter((n) => !doc.has(n))),
    },
  };
};

// ---------------------------------------------------------------------------
// The reference's SchemaResult as a response

// A description the spec leaves to the service (AnyDescription) is null.
const description = (d) => (d.length === 1 ? d[0] : null);
const optOut = (o) => (o.length === 0 ? null : o[0]);

const printValue = (v) => {
  switch (v.kind) {
    case "null":
      return "null";
    case "string":
      return JSON.stringify(v.text);
    case "list":
      return `[${v.items.map(printValue).join(", ")}]`;
    case "object":
      return `{${v.fields.map((f) => `${f.name}: ${printValue(f.value)}`).join(", ")}}`;
    default:
      return v.text;
  }
};

export const refJson = (ref) =>
  ref.reduceRight((ofType, r) => ({ kind: r.kind, name: optOut(r.name), ...(ofType === undefined ? { ofType: null } : { ofType }) }), undefined);
const rootJson = (ref) => ({ kind: ref[0].kind, name: ref[0].name[0] });

const inputValueJson = (v) => ({
  name: v.name,
  description: description(v.description),
  type: refJson(v.type),
  defaultValue: v.defaultValue.length ? printValue(v.defaultValue[0]) : null,
  isDeprecated: v.isDeprecated,
  deprecationReason: optOut(v.deprecationReason),
});

const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

export const typeJson = (t) => ({
  kind: t.kind,
  name: t.name[0],
  description: description(t.description),
  specifiedByURL: optOut(t.specifiedByURL),
  isOneOf: optOut(t.isOneOf),
  fields: t.fields.length
    ? t.fields[0].map((f) => ({
        name: f.name,
        description: description(f.description),
        args: f.args.map(inputValueJson),
        type: refJson(f.type),
        isDeprecated: f.isDeprecated,
        deprecationReason: optOut(f.deprecationReason),
      }))
    : null,
  inputFields: t.inputFields.length ? t.inputFields[0].map(inputValueJson) : null,
  interfaces: t.interfaces.length ? t.interfaces[0].map(refJson) : null,
  enumValues: t.enumValues.length
    ? t.enumValues[0].map((v) => ({
        name: v.name,
        description: description(v.description),
        isDeprecated: v.isDeprecated,
        deprecationReason: optOut(v.deprecationReason),
      }))
    : null,
  // An interface's possibleTypes have no source order.
  possibleTypes: t.possibleTypes.length
    ? (t.kind === "INTERFACE"
        ? [...t.possibleTypes[0]].sort((a, b) => byName({ name: a.at(-1).name[0] }, { name: b.at(-1).name[0] }))
        : t.possibleTypes[0]
      ).map(refJson)
    : null,
});

export const directiveJson = (d) => ({
  name: d.name,
  description: description(d.description),
  isRepeatable: d.isRepeatable,
  locations: d.locations,
  args: d.args.map(inputValueJson),
  isDeprecated: d.isDeprecated,
  deprecationReason: optOut(d.deprecationReason),
});

// The response for a printed SchemaResult and the root type's name, split
// into the document's part and the built-in introspection types and
// directives, which every schema shares.
export const responseOf = (result, typename) => {
  const types = result.types.map(typeJson).sort(byName);
  const directives = result.directives.map(directiveJson);
  const own = (t) => !t.name.startsWith("__");
  return {
    response: {
      data: {
        __typename: typename,
        __schema: {
          description: optOut(result.description),
          queryType: result.queryType.length ? rootJson(result.queryType[0]) : null,
          mutationType: result.mutationType.length ? rootJson(result.mutationType[0]) : null,
          subscriptionType: result.subscriptionType.length ? rootJson(result.subscriptionType[0]) : null,
          types: types.filter(own),
          directives: directives.filter((d) => !BUILTIN_DIRECTIVES.includes(d.name)),
        },
      },
    },
    builtins: { types: types.filter((t) => !own(t)), directives: directives.filter((d) => BUILTIN_DIRECTIVES.includes(d.name)) },
  };
};

// A vector's full expected response: its own part plus the built-ins.
export const fullResponse = (vector, builtins) => {
  const s = vector.expected.response.data.__schema;
  return {
    data: {
      __typename: vector.expected.response.data.__typename,
      __schema: { ...s, types: [...s.types, ...builtins.types], directives: [...s.directives, ...builtins.directives] },
    },
  };
};
