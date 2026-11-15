// Introspection results in two directions: a service's response as the
// `actual` data Introspection!Matches reads, and the reference's
// SchemaResult (as tla-ts prints it) as the response a service should
// give, which the self-test and findings use. Both follow a profile
// (query.mjs): "September2026", "September2025" or "October2021".

import { parseDefault } from "../schema/tla.mjs";
import { PRIMARY, SELECTED, TYPE_REF_DEPTH, WRAPPER_DEPTH, isArgument, selection } from "./query.mjs";

export const BUILTIN_DIRECTIVES = ["skip", "include", "deprecated", "specifiedBy", "oneOf"];
// The built-in directives of each edition: October 2021 has no @oneOf, so
// a service that answers its query and returns @oneOf has a directive of
// its own.
const EDITION_DIRECTIVES = {
  September2026: BUILTIN_DIRECTIVES,
  September2025: BUILTIN_DIRECTIVES,
  October2021: BUILTIN_DIRECTIVES.filter((d) => d !== "oneOf"),
};
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

// A request error: errors, and no data entry (§7.1.7: "the response
// must not contain an entry with key data"). The schema didn't build, or
// the query was rejected. {"data": null, "errors": [...]} is an execution
// failure instead, which fails executes.
export const isRequestError = (response) => isMap(response) && Array.isArray(response.errors) && response.errors.length > 0 && !("data" in response);

// ---------------------------------------------------------------------------
// A response as `actual`
//
// The response must have exactly the fields the query selects: each one,
// with an explicit null where the value is null, and no others. Anything
// else is Malformed, and fails the executes check.
//
// Under an older release's profile, the fields only later releases have
// aren't selected. They are filled in with the only values a schema that
// release can express allows (Introspection!IsSep2025Schema and
// IsOct2021Schema, checked by IntrospectionVectors' Sep2025ProfileIsSound
// and Oct2021ProfileIsSound): isOneOf false for an input object and null
// otherwise, and no input value or directive deprecated. So they compare
// equal, and only what the profile selects is graded.
//
// A field the service lacks (`missing`, query.mjs) isn't selected either.
// It is filled in with null, or false for isDeprecated and isRepeatable, so
// that the rest can be graded. Its definition, and that of an argument the
// service lacks, is put back into the introspection types the service
// returned (fillDefinitions). The kit counts each missing field or argument
// once per run, and leaves out of each result the problems it can't see
// without it (run.mjs).

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

// A field the profile selects, or the fixed value otherwise.
const selected = (S, kind, field, obj, path, check, fixed) => (S[kind].includes(field) ? value(obj, field, path, check) : fixed);

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

const inputValueOf = (v, path, S) => {
  object(v, path, S.inputValue);
  return {
    name: value(v, "name", path, isString),
    description: opt(selected(S, "inputValue", "description", v, path, isOptString, null)),
    type: refOf(v.type, `${path}.type`),
    defaultValue: selected(S, "inputValue", "defaultValue", v, path, isOptString, null) === null ? [] : [parseDefault(v.defaultValue)],
    isDeprecated: selected(S, "inputValue", "isDeprecated", v, path, isBool, false),
    deprecationReason: opt(selected(S, "inputValue", "deprecationReason", v, path, isOptString, null)),
  };
};

const optList = (v, f) => (v === null ? [] : [v.map(f)]);

const typeOf = (t, path, S) => {
  object(t, path, S.type);
  const kind = value(t, "kind", path, isString);
  return {
    kind,
    name: opt(value(t, "name", path, isOptString)),
    description: opt(selected(S, "type", "description", t, path, isOptString, null)),
    specifiedByURL: opt(selected(S, "type", "specifiedByURL", t, path, isOptString, null)),
    isOneOf: opt(selected(S, "type", "isOneOf", t, path, isOptBool, kind === "INPUT_OBJECT" ? false : null)),
    fields: optList(value(t, "fields", path, isOptList), (f, j) => {
      const p = `${path}.fields[${j}]`;
      object(f, p, S.field);
      return {
        name: value(f, "name", p, isString),
        description: opt(selected(S, "field", "description", f, p, isOptString, null)),
        args: value(f, "args", p, isList).map((a, k) => inputValueOf(a, `${p}.args[${k}]`, S)),
        type: refOf(f.type, `${p}.type`),
        isDeprecated: selected(S, "field", "isDeprecated", f, p, isBool, false),
        deprecationReason: opt(selected(S, "field", "deprecationReason", f, p, isOptString, null)),
      };
    }),
    inputFields: optList(value(t, "inputFields", path, isOptList), (v, j) => inputValueOf(v, `${path}.inputFields[${j}]`, S)),
    interfaces: optList(value(t, "interfaces", path, isOptList), (r, j) => refOf(r, `${path}.interfaces[${j}]`)),
    enumValues: optList(value(t, "enumValues", path, isOptList), (v, j) => {
      const p = `${path}.enumValues[${j}]`;
      object(v, p, S.enumValue);
      return {
        name: value(v, "name", p, isString),
        description: opt(selected(S, "enumValue", "description", v, p, isOptString, null)),
        isDeprecated: selected(S, "enumValue", "isDeprecated", v, p, isBool, false),
        deprecationReason: opt(selected(S, "enumValue", "deprecationReason", v, p, isOptString, null)),
      };
    }),
    possibleTypes: optList(value(t, "possibleTypes", path, isOptList), (r, j) => refOf(r, `${path}.possibleTypes[${j}]`)),
  };
};

const directiveOf = (d, i, S) => {
  const path = `directives[${i}]`;
  object(d, path, S.directive);
  const locations = value(d, "locations", path, isList);
  if (!locations.every(isString)) throw new Malformed(`${path}.locations has a value that isn't a string`);
  return {
    name: value(d, "name", path, isString),
    description: opt(selected(S, "directive", "description", d, path, isOptString, null)),
    isRepeatable: selected(S, "directive", "isRepeatable", d, path, isBool, false),
    locations,
    args: value(d, "args", path, isList).map((a, k) => inputValueOf(a, `${path}.args[${k}]`, S)),
    isDeprecated: selected(S, "directive", "isDeprecated", d, path, isBool, false),
    deprecationReason: opt(selected(S, "directive", "deprecationReason", d, path, isOptString, null)),
  };
};

// __type(name: "__Schema")'s answer (wrappersQuery): its fields, each with
// its type as a ref (fields, for Introspection!SchemaFieldsMatch), and the
// List and Non-Null types among those types (levels), each as
// Introspection!WrapperMatches reads it: where it is, its kind, and its
// other fields, a list field as the names of its items. A null answer has
// no fields.
const namesOf = (v, path) => {
  if (!isOptList(v)) throw new Malformed(`${path} is ${JSON.stringify(v)?.slice(0, 80)}`);
  if (v === null) return [];
  return [
    v.map((x, k) => {
      object(x, `${path}[${k}]`, ["name"]);
      return value(x, "name", `${path}[${k}]`, isString);
    }),
  ];
};
const wrappersOf = (w, S) => {
  const levels = [];
  const fields = [];
  if (w === null) return { levels, fields };
  object(w, "wrappers", ["fields"]);
  value(w, "fields", "wrappers", isOptList);
  (w.fields ?? []).forEach((f, j) => {
    const p = `wrappers.fields[${j}]`;
    object(f, p, ["name", "type"]);
    const fieldName = value(f, "name", p, isString);
    const where = `__Schema.${fieldName}`;
    const ref = [];
    fields.push({ name: fieldName, type: ref });
    for (let node = f.type, q = `${p}.type`, d = WRAPPER_DEPTH; ; node = node.ofType, q += ".ofType", d--) {
      object(node, q, d > 0 ? S.wrapper : ["kind", "name"]);
      const kind = value(node, "kind", q, isString);
      const name = opt(value(node, "name", q, isOptString));
      ref.push({ kind, name });
      if (d === 0) break;
      const level = {
        where,
        kind,
        name,
        description: opt(selected(S, "wrapper", "description", node, q, isOptString, null)),
        specifiedByURL: opt(selected(S, "wrapper", "specifiedByURL", node, q, isOptString, null)),
        isOneOf: opt(selected(S, "wrapper", "isOneOf", node, q, isOptBool, null)),
        fields: namesOf(node.fields, `${q}.fields`),
        interfaces: namesOf(node.interfaces, `${q}.interfaces`),
        possibleTypes: namesOf(node.possibleTypes, `${q}.possibleTypes`),
        enumValues: namesOf(node.enumValues, `${q}.enumValues`),
        inputFields: namesOf(node.inputFields, `${q}.inputFields`),
      };
      if (kind === "LIST" || kind === "NON_NULL") levels.push(level);
      if (value(node, "ofType", q, (v) => v === null || isMap(v)) === null) break;
    }
  });
  return { levels, fields };
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

// The case for one __schema response under a profile: `actual` (with
// every type and directive, the root's __typename, and the wrapper types
// of __Schema's fields), the service's own directives (extras) and the
// types they reach (extraTypes). Throws Malformed if the response isn't
// the result of the profile's query, without the `missing` fields.
export const caseOf = (response, documentDirectives, documentTypes, profile = PRIMARY, missing = []) => {
  const S = selection(profile, missing);
  const data = dataOf(response);
  object(data, "data", S.data);
  const typename = value(data, "__typename", "data", isOptString);
  const s = object(data.__schema, "__schema", S.schema);
  const types = value(s, "types", "__schema", isList).map((t, i) => typeOf(t, `types[${i}]`, S));
  const directives = value(s, "directives", "__schema", isList).map((d, i) => directiveOf(d, i, S));
  const ofRoot = (key) => (s[key] === null ? [] : [refOf(s[key], key, 0)]);
  const doc = new Set(documentDirectives);
  const builtin = EDITION_DIRECTIVES[profile];
  const own = directives.filter((d) => !doc.has(d.name) && !builtin.includes(d.name));
  const extraTypes = reachedTypes(own, types, new Set(documentTypes)).map(extraType);
  return {
    extras: own.map(extraDirective),
    extraTypes,
    actual: {
      typename: opt(typename),
      description: opt(selected(S, "schema", "description", s, "__schema", isOptString, null)),
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

// The case for the answer to wrappersQuery.
export const wrappersCaseOf = (response, profile = PRIMARY, missing = []) => {
  const S = selection(profile, missing);
  const data = object(dataOf(response), "data", ["wrappers"]);
  const { levels, fields } = wrappersOf(data.wrappers, S);
  return { actual: { wrappers: levels, wrapperFields: fields } };
};

// The case for one response to __type(name:) lookups: [name, result] per
// lookup, the result an optional __Type.
export const lookupCaseOf = (response, lookups, profile = PRIMARY, missing = []) => {
  const S = selection(profile, missing);
  const data = object(dataOf(response), "data", lookups.map((l) => l.alias));
  return { actual: lookups.map(({ alias, name }) => ({ name, result: data[alias] === null ? [] : [typeOf(data[alias], alias, S)] })) };
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

// ---------------------------------------------------------------------------
// Responses under an older release's profile

const without = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));
// The fields of a list of SELECTED the profile's query doesn't select.
const unselected = (profile, list) => SELECTED[PRIMARY][list].filter((f) => !SELECTED[profile][list].includes(f));

// A September 2026 response's __Type (or null) as the profile's query
// selects it.
export const typeFor = (profile, t) => {
  if (profile === PRIMARY || t === null) return t;
  const iv = (v) => without(v, unselected(profile, "inputValue"));
  return {
    ...without(t, unselected(profile, "type")),
    fields: t.fields && t.fields.map((f) => ({ ...f, args: f.args.map(iv) })),
    inputFields: t.inputFields && t.inputFields.map(iv),
  };
};
export const directiveFor = (profile, d) =>
  profile === PRIMARY ? d : { ...without(d, unselected(profile, "directive")), args: d.args.map((v) => without(v, unselected(profile, "inputValue"))) };

// The expected `wrappers`: __Schema's fields, each with its type as the
// Wrapper fragment selects it. Wrappers have only kind and ofType; a named
// type has its fields, as names.
const wrappersJson = (builtins, profile) => {
  const named = (name) => builtins.types.find((t) => t.name === name);
  const level = (ref, depth) => {
    if (depth === 0) return { kind: ref.kind, name: ref.name };
    const t = ref.name === null ? null : (named(ref.name) ?? { kind: ref.kind, name: ref.name });
    const names = (list) => (list ? list.map((x) => ({ name: x.name })) : null);
    const out = {
      kind: ref.kind,
      name: ref.name,
      description: t?.description ?? null,
      specifiedByURL: t?.specifiedByURL ?? null,
      ...(SELECTED[profile].wrapper.includes("isOneOf") ? { isOneOf: t?.isOneOf ?? null } : {}),
      fields: names(t?.fields),
      interfaces: names(t?.interfaces),
      possibleTypes: names(t?.possibleTypes),
      enumValues: names(t?.enumValues),
      inputFields: names(t?.inputFields),
      ofType: ref.ofType === null ? null : level(ref.ofType, depth - 1),
    };
    return out;
  };
  return { fields: named("__Schema").fields.map((f) => ({ name: f.name, type: level(f.type, WRAPPER_DEPTH) })) };
};

// A vector's full expected response under a profile: its own part plus
// the built-ins (vectors.json's builtins[profile], already in the
// profile's shape), for a __schema vector, its lookups' types, or for the
// wrappers vector, __Schema's fields as the profile's built-ins have them.
export const fullResponse = (vector, builtins, profile = PRIMARY) => {
  if (vector.wrappers) return { data: { wrappers: wrappersJson(builtins[profile], profile) } };
  const d = vector.expected.response.data;
  if (vector.lookups) return { data: Object.fromEntries(Object.entries(d).map(([k, t]) => [k, typeFor(profile, t)])) };
  const s = d.__schema;
  const b = builtins[profile];
  return {
    data: {
      __typename: d.__typename,
      __schema: {
        ...s,
        types: [...s.types.map((t) => typeFor(profile, t)), ...b.types],
        directives: [...s.directives.map((x) => directiveFor(profile, x)), ...b.directives],
      },
    },
  };
};

// ---------------------------------------------------------------------------
// Fields and arguments a service lacks

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));
const clone = (x) => JSON.parse(JSON.stringify(x));

// The response with the definitions of the `missing` fields and arguments
// put back into the introspection types it returns (in __schema's types,
// in __type(name:) answers, and among __Schema's fields in `wrappers`), as
// the profile's built-ins `b` (builtins[profile]) define them, shaped as
// the query without them selects. A service that lacks a field doesn't list
// it among its type's fields either; the kit counts that once per run
// (run.mjs), not in every result. Anything that isn't shaped as expected is
// left as it is, for caseOf to judge.
export const fillDefinitions = (response, missing, b, profile) => {
  if (missing.length === 0 || !isMap(response) || !isMap(response.data)) return response;
  const S = selection(profile, missing);
  const out = clone(response);
  const inputValue = (v) => pick(v, S.inputValue);
  const field = (f) => ({ ...pick(f, S.field), ...(S.field.includes("args") ? { args: f.args.map(inputValue) } : {}) });
  const fill = (t) => {
    if (!isMap(t) || typeof t.name !== "string" || !Array.isArray(t.fields)) return;
    const def = b.types.find((x) => x.name === t.name);
    if (!def) return;
    for (const m of missing) {
      const [, owner, name, arg] = m.match(/^(\w+)\.(\w+)(?:\((\w+):\))?$/);
      if (owner !== t.name) continue;
      const expected = def.fields.find((f) => f.name === name);
      if (!expected) continue;
      if (!arg) {
        if (!t.fields.some((f) => f?.name === name)) t.fields.push(field(expected));
        continue;
      }
      const own = t.fields.find((f) => f?.name === name);
      const expectedArg = expected.args.find((a) => a.name === arg);
      if (expectedArg && isMap(own) && Array.isArray(own.args) && !own.args.some((a) => a?.name === arg)) own.args.push(inputValue(expectedArg));
    }
  };
  const types = out.data.__schema?.types;
  if (Array.isArray(types)) types.forEach(fill);
  for (const [key, t] of Object.entries(out.data)) if (key !== "__schema" && key !== "__typename" && key !== "wrappers") fill(t);
  const w = out.data.wrappers;
  if (isMap(w) && Array.isArray(w.fields)) {
    const expected = wrappersJson(b, profile).fields;
    const level = (node, depth) =>
      depth === 0 || node.ofType === undefined ? pick(node, ["kind", "name"]) : { ...pick(node, S.wrapper), ofType: node.ofType === null ? null : level(node.ofType, depth - 1) };
    for (const m of missing.filter((x) => !isArgument(x) && x.startsWith("__Schema."))) {
      const name = m.split(".")[1];
      const f = expected.find((x) => x.name === name);
      if (f && !w.fields.some((x) => x?.name === name)) w.fields.push({ name, type: level(f.type, WRAPPER_DEPTH) });
    }
  }
  return out;
};
