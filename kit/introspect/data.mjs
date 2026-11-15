// Introspection results in two directions: a service's response as the
// `actual` data Introspection!Matches reads, and the reference's
// SchemaResult (as tla-ts prints it) as the response a service should
// give, which the self-test and findings use.

import { parseDefault } from "../schema/tla.mjs";
import { TYPE_REF_DEPTH } from "./query.mjs";

export const BUILTIN_DIRECTIVES = ["skip", "include", "deprecated", "specifiedBy", "oneOf"];
export const BUILTIN_SCALARS = ["Int", "Float", "String", "Boolean", "ID"];
export const isBuiltinType = (name) => name.startsWith("__") || BUILTIN_SCALARS.includes(name);

// ---------------------------------------------------------------------------
// The response envelope (§7.1.1, §7.1.7, §7.1.8)

const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// What is wrong with the response as an execution result or a request
// error result, apart from its data: a list of problems in words.
export const envelopeProblems = (response) => {
  if (!isMap(response)) return ["the response isn't a map"];
  const out = [];
  for (const key of Object.keys(response)) {
    if (!["data", "errors", "extensions"].includes(key)) out.push(`it has an entry "${key}", which §7.1.8 doesn't allow`);
  }
  if ("errors" in response) {
    const errors = response.errors;
    if (!Array.isArray(errors) || errors.length === 0) out.push(`errors is ${JSON.stringify(errors)?.slice(0, 40)}: when present, it must be a non-empty list`);
    else if (!errors.every((e) => isMap(e) && typeof e.message === "string")) out.push("an error isn't a map with a message");
  }
  if ("extensions" in response && !isMap(response.extensions)) out.push("extensions isn't a map");
  if (!("data" in response) && !("errors" in response)) out.push("it has neither data nor errors");
  return out;
};

// ---------------------------------------------------------------------------
// A response as `actual`
//
// The response must have exactly the fields the query selects: each one,
// with an explicit null where the value is null, and no others. Anything
// else is Malformed, and fails the executes check.

export class Malformed extends Error {}

// An object with exactly `keys`.
const object = (obj, path, keys) => {
  if (!isMap(obj)) throw new Malformed(`${path} isn't an object`);
  for (const key of keys) if (!(key in obj)) throw new Malformed(`${path} has no ${key}`);
  for (const key of Object.keys(obj)) if (!keys.includes(key)) throw new Malformed(`${path} has ${key}, which the query doesn't select`);
  return obj;
};
const value = (obj, key, path, check) => {
  const v = obj[key];
  if (!check(v)) throw new Malformed(`${path}.${key} is ${JSON.stringify(v)?.slice(0, 80)}`);
  return v;
};
const isString = (v) => typeof v === "string";
const isOptString = (v) => v === null || typeof v === "string";
const isBool = (v) => typeof v === "boolean";
const isOptBool = (v) => v === null || typeof v === "boolean";
const isList = (v) => Array.isArray(v);
const isOptList = (v) => v === null || Array.isArray(v);
const opt = (v) => (v === null ? [] : [v]);

const SELECTED = {
  data: ["__typename", "__schema"],
  schema: ["description", "queryType", "mutationType", "subscriptionType", "types", "directives"],
  type: ["kind", "name", "description", "specifiedByURL", "isOneOf", "fields", "inputFields", "interfaces", "enumValues", "possibleTypes"],
  field: ["name", "description", "args", "type", "isDeprecated", "deprecationReason"],
  inputValue: ["name", "description", "type", "defaultValue", "isDeprecated", "deprecationReason"],
  enumValue: ["name", "description", "isDeprecated", "deprecationReason"],
  directive: ["name", "description", "isRepeatable", "locations", "args", "isDeprecated", "deprecationReason"],
};

// A type ref, `depth` levels of ofType deep as the query selects it (the
// TypeRef fragment, or { kind name } for the roots).
const refOf = (t, path, depth = TYPE_REF_DEPTH) => {
  const out = [];
  for (let node = t, p = path, d = depth; ; node = node.ofType, p += ".ofType", d--) {
    object(node, p, d > 0 ? ["kind", "name", "ofType"] : ["kind", "name"]);
    out.push({ kind: value(node, "kind", p, isString), name: opt(value(node, "name", p, isOptString)) });
    if (d === 0 || node.ofType === null) return out;
  }
};

const inputValueOf = (v, path) => {
  object(v, path, SELECTED.inputValue);
  return {
    name: value(v, "name", path, isString),
    description: opt(value(v, "description", path, isOptString)),
    type: refOf(v.type, `${path}.type`),
    defaultValue: value(v, "defaultValue", path, isOptString) === null ? [] : [parseDefault(v.defaultValue)],
    isDeprecated: value(v, "isDeprecated", path, isBool),
    deprecationReason: opt(value(v, "deprecationReason", path, isOptString)),
  };
};

const optList = (v, f) => (v === null ? [] : [v.map(f)]);

const typeOf = (t, path) => {
  object(t, path, SELECTED.type);
  return {
    kind: value(t, "kind", path, isString),
    name: opt(value(t, "name", path, isOptString)),
    description: opt(value(t, "description", path, isOptString)),
    specifiedByURL: opt(value(t, "specifiedByURL", path, isOptString)),
    isOneOf: opt(value(t, "isOneOf", path, isOptBool)),
    fields: optList(value(t, "fields", path, isOptList), (f, j) => {
      const p = `${path}.fields[${j}]`;
      object(f, p, SELECTED.field);
      return {
        name: value(f, "name", p, isString),
        description: opt(value(f, "description", p, isOptString)),
        args: value(f, "args", p, isList).map((a, k) => inputValueOf(a, `${p}.args[${k}]`)),
        type: refOf(f.type, `${p}.type`),
        isDeprecated: value(f, "isDeprecated", p, isBool),
        deprecationReason: opt(value(f, "deprecationReason", p, isOptString)),
      };
    }),
    inputFields: optList(value(t, "inputFields", path, isOptList), (v, j) => inputValueOf(v, `${path}.inputFields[${j}]`)),
    interfaces: optList(value(t, "interfaces", path, isOptList), (r, j) => refOf(r, `${path}.interfaces[${j}]`)),
    enumValues: optList(value(t, "enumValues", path, isOptList), (v, j) => {
      const p = `${path}.enumValues[${j}]`;
      object(v, p, SELECTED.enumValue);
      return {
        name: value(v, "name", p, isString),
        description: opt(value(v, "description", p, isOptString)),
        isDeprecated: value(v, "isDeprecated", p, isBool),
        deprecationReason: opt(value(v, "deprecationReason", p, isOptString)),
      };
    }),
    possibleTypes: optList(value(t, "possibleTypes", path, isOptList), (r, j) => refOf(r, `${path}.possibleTypes[${j}]`)),
  };
};

const directiveOf = (d, i) => {
  const path = `directives[${i}]`;
  object(d, path, SELECTED.directive);
  const locations = value(d, "locations", path, isList);
  if (!locations.every(isString)) throw new Malformed(`${path}.locations has a value that isn't a string`);
  return {
    name: value(d, "name", path, isString),
    description: opt(value(d, "description", path, isOptString)),
    isRepeatable: value(d, "isRepeatable", path, isBool),
    locations,
    args: value(d, "args", path, isList).map((a, k) => inputValueOf(a, `${path}.args[${k}]`)),
    isDeprecated: value(d, "isDeprecated", path, isBool),
    deprecationReason: opt(value(d, "deprecationReason", path, isOptString)),
  };
};

// The service's own directives and the types their arguments reach, as
// TypeSystem.tla data, so that they can be part of the built-ins B.
const typeRefOf = (ref) => ({
  name: ref.at(-1).name[0] ?? "",
  wrappers: ref.slice(0, -1).map((r) => (r.kind === "NON_NULL" ? "nonNull" : "list")),
});
const deprecatedOf = (x) => (x.isDeprecated ? [x.deprecationReason[0] ?? ""] : []);
const extraInputValue = (a) => ({ name: a.name, description: a.description, type: typeRefOf(a.type), default: a.defaultValue, deprecated: deprecatedOf(a) });
const extraDirective = (d) => ({
  name: d.name,
  description: d.description,
  args: d.args.map(extraInputValue),
  repeatable: d.isRepeatable,
  locations: d.locations,
  deprecated: deprecatedOf(d),
  directives: new Set(),
});
// Only input types are valid here; IntrospectChecks reports any other kind
// (serviceTypes) without comparing its fields.
const extraType = (t) => ({
  kind: t.kind,
  name: t.name[0],
  description: t.description,
  fields: [],
  interfaces: [],
  members: [],
  values: (t.enumValues[0] ?? []).map((v) => ({ name: v.name, description: v.description, deprecated: deprecatedOf(v) })),
  inputFields: (t.inputFields[0] ?? []).map(extraInputValue),
  oneOf: t.isOneOf[0] === true,
  specifiedBy: t.specifiedByURL,
  directives: new Set(),
});

// The types the service's own directives reach through their arguments and
// input fields, that neither the document nor the spec defines.
const reachedTypes = (extras, types, documentTypes) => {
  const byName = new Map(types.filter((t) => t.name.length === 1).map((t) => [t.name[0], t]));
  const known = (n) => documentTypes.has(n) || isBuiltinType(n);
  const out = new Map();
  const visit = (name) => {
    if (known(name) || out.has(name) || !byName.has(name)) return;
    const t = byName.get(name);
    out.set(name, t);
    for (const f of t.inputFields[0] ?? []) visit(typeRefOf(f.type).name);
  };
  for (const d of extras) for (const a of d.args) visit(typeRefOf(a.type).name);
  return [...out.values()];
};

// The case for one __schema response: `actual` (with every type and
// directive, and the root's __typename), the service's own directives
// (extras) and the types they reach (extraTypes). Throws Malformed if the
// response isn't the result of the query.
export const caseOf = (response, documentDirectives, documentTypes) => {
  const data = dataOf(response);
  object(data, "data", SELECTED.data);
  const typename = value(data, "__typename", "data", isOptString);
  const s = object(data.__schema, "__schema", SELECTED.schema);
  const types = value(s, "types", "__schema", isList).map((t, i) => typeOf(t, `types[${i}]`));
  const directives = value(s, "directives", "__schema", isList).map(directiveOf);
  const ofRoot = (key) => (s[key] === null ? [] : [refOf(s[key], key, 0)]);
  const doc = new Set(documentDirectives);
  const own = directives.filter((d) => !doc.has(d.name) && !BUILTIN_DIRECTIVES.includes(d.name));
  const extraTypes = reachedTypes(own, types, new Set(documentTypes)).map(extraType);
  return {
    extras: own.map(extraDirective),
    extraTypes,
    actual: {
      typename: opt(typename),
      description: opt(value(s, "description", "__schema", isOptString)),
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

// The case for one response to __type(name:) lookups: [name, result] per
// lookup, the result an optional __Type.
export const lookupCaseOf = (response, lookups) => {
  const data = object(dataOf(response), "data", lookups.map((l) => l.alias));
  return { actual: lookups.map(({ alias, name }) => ({ name, result: data[alias] === null ? [] : [typeOf(data[alias], alias)] })) };
};

// A response's data, if it has no errors.
const dataOf = (response) => {
  if (!isMap(response)) throw new Malformed("the response isn't an object");
  if (Array.isArray(response.errors) && response.errors.length > 0) {
    throw new Malformed(`the response has errors: ${response.errors.map((e) => e?.message ?? JSON.stringify(e)).join("; ").slice(0, 300)}`);
  }
  if (!("data" in response)) throw new Malformed("the response has no data");
  return response.data;
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
