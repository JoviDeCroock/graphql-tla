// The introspect area's self-test: responses built from the reference's
// expected ones, which the checker must judge as stated. Each vector's own
// expected response must pass, another vector's must fail, and each
// response broken on purpose must fail the check it targets. A few
// changes the spec allows must pass, so that the checker isn't stricter
// than the spec either.

import { fullResponse } from "./data.mjs";
import { TYPE_REF_DEPTH } from "./query.mjs";

const clone = (x) => JSON.parse(JSON.stringify(x));

const named = (name) => ({ kind: "SCALAR", name, ofType: null });

const nonNull = (ofType) => ({ kind: "NON_NULL", name: null, ofType });
const inputValue = (name, type) => ({ name, description: null, type, defaultValue: null, isDeprecated: false, deprecationReason: null });
const scalarType = (name) => ({
  kind: "SCALAR",
  name,
  description: null,
  specifiedByURL: null,
  isOneOf: null,
  fields: null,
  inputFields: null,
  interfaces: null,
  enumValues: null,
  possibleTypes: null,
});
const serviceDirective = (args) => ({ name: "extra", description: null, isRepeatable: false, locations: ["FIELD"], args, isDeprecated: false, deprecationReason: null });
const dropDirectives = (...names) => (s) => (s.directives = s.directives.filter((d) => !names.includes(d.name)));

// [vector id, name, the check it must fail ("pass": none), change]. change
// gets the response's __schema (for a __schema vector), its data, and the
// response.
const BROKEN = [
  ["rich.inc", "reorders an object's fields", "order", (s) => type(s, "Q").fields.reverse()],
  ["rich.inc", "drops an enum value", "enumValues", (s) => type(s, "E").enumValues.shift()],
  ["rich.inc", "loses an argument's Non-Null wrapper", "arguments", (s) => (field(s, "M", "m").args[0].type = { kind: "INPUT_OBJECT", name: "Pick", ofType: null })],
  ["interfaces.inc", "loses a field's Non-Null wrapper", "fields", (s) => (field(s, "Node", "id").type = named("ID"))],
  ["rich.inc", "drops a type", "types", (s) => s.types.splice(s.types.findIndex((t) => t.name === "A"), 1)],
  ["rich.inc", "reports a deprecated field as not deprecated", "deprecation", (s) => Object.assign(field(s, "Q", "old"), { isDeprecated: false, deprecationReason: null })],
  [
    "rich.defaults",
    "returns a deprecated field when includeDeprecated is false",
    "deprecation",
    (s) =>
      type(s, "Q").fields.push({
        name: "old",
        description: null,
        args: [],
        type: named("String"),
        isDeprecated: true,
        deprecationReason: "gone",
      }),
  ],
  ["rich.inc", "changes a default value", "defaultValue", (s) => (field(s, "Q", "a").args[0].defaultValue = "4")],
  ["order.inc", "reorders a type's interfaces", "order", (s) => type(s, "O").interfaces.reverse()],
  ["order.inc", "reorders a field's arguments", "order", (s) => field(s, "Query", "m").args.reverse()],
  ["rich.inc", "reorders a union's possible types", "order", (s) => type(s, "U").possibleTypes.reverse()],
  ["rich.inc", "gives an object possibleTypes", "typeKinds", (s) => (type(s, "A").possibleTypes = [])],
  [
    "rich.inc",
    "lists __typename as a field",
    "typename",
    (s) =>
      type(s, "A").fields.push({
        name: "__typename",
        description: null,
        args: [],
        type: { kind: "NON_NULL", name: null, ofType: named("String") },
        isDeprecated: false,
        deprecationReason: null,
      }),
  ],
  ["rich.inc", "drops a built-in scalar it references", "builtinScalars", (s) => s.types.splice(s.types.findIndex((t) => t.name === "Int"), 1)],
  ["rich.inc", "adds a built-in scalar nothing references", "builtinScalars", (s) => s.types.push({ ...clone(type(s, "Int")), name: "Float" })],
  ["rich.inc", "drops isOneOf", "isOneOf", (s) => (type(s, "Pick").isOneOf = false)],
  ["rich.inc", "drops specifiedByURL", "specifiedByURL", (s) => (type(s, "Date").specifiedByURL = null)],
  ["rich.inc", "changes a built-in directive's locations", "builtinDefinitions", (s) => directive(s, "skip").locations.pop()],
  ["rich.inc", "changes an introspection field's type", "builtinDefinitions", (s) => (field(s, "__Type", "fields").type = field(s, "__Type", "fields").type.ofType)],
  ["minimal.inc", "names the wrong type in the root's __typename", "typename", (s, d) => (d.__typename = "Mutation")],
  // §3.13's conditions on the built-in directives
  ["rich.inc", "doesn't provide @include", "builtinDirectives", dropDirectives("include")],
  ["minimal.inc", "doesn't provide @skip", "builtinDirectives", dropDirectives("skip")],
  ["rich.inc", "doesn't provide @deprecated, in a schema that deprecates something", "deprecation", dropDirectives("deprecated")],
  ["deprecation.defaults", "doesn't provide @deprecated, in a schema that only deprecates", "deprecation", dropDirectives("deprecated")],
  ["scalars.inc", "doesn't provide @specifiedBy, in a schema with a custom scalar", "builtinDirectives", dropDirectives("specifiedBy")],
  ["oneOf.inc", "doesn't provide @oneOf, in a schema with a OneOf input object", "builtinDirectives", dropDirectives("oneOf")],
  ["minimal.inc", "doesn't provide @deprecated, @specifiedBy or @oneOf, in a schema with no use for them", "pass", dropDirectives("deprecated", "specifiedBy", "oneOf")],
  ["deprecation.inc", "doesn't provide @specifiedBy or @oneOf, in a schema without custom scalars or OneOf inputs", "pass", dropDirectives("specifiedBy", "oneOf")],
  ["rich.inc", "leaves out the mutation root type", "roots", (s) => (s.mutationType = null)],
  ["rich.inc", "drops an input field", "inputFields", (s) => type(s, "In").inputFields.splice(1, 1)],
  ["interfaces.inc", "drops an implemented interface", "interfaces", (s) => type(s, "Image").interfaces.pop()],
  ["rich.inc", "says a repeatable directive isn't", "directives", (s) => (directive(s, "tag").isRepeatable = false)],
  ["rich.inc", "drops one of the schema's directives", "directives", (s) => s.directives.splice(s.directives.findIndex((x) => x.name === "tag"), 1)],
  ["rich.inc", "changes a description", "descriptions", (s) => (type(s, "Q").description = "Another root")],
  [
    "directiveDeprecation.defaults",
    "returns a deprecated directive when includeDeprecated is false",
    "deprecation",
    (s) =>
      s.directives.unshift({ name: "old", description: null, isRepeatable: false, locations: ["FIELD"], args: [], isDeprecated: true, deprecationReason: "Use @new" }),
  ],
  // Allowed by the spec
  [
    "rich.inc",
    "provides a directive of its own",
    "pass",
    (s) =>
      s.directives.push({
        name: "defer",
        description: null,
        isRepeatable: false,
        locations: ["FRAGMENT_SPREAD", "INLINE_FRAGMENT"],
        args: [
          { name: "if", description: null, type: { kind: "NON_NULL", name: null, ofType: named("Boolean") }, defaultValue: "true", isDeprecated: false, deprecationReason: null },
          { name: "label", description: null, type: named("String"), defaultValue: null, isDeprecated: false, deprecationReason: null },
        ],
        isDeprecated: false,
        deprecationReason: null,
      }),
  ],
  [
    "defaults.inc",
    "encodes default values differently",
    "pass",
    (s) => {
      const args = field(s, "Query", "f").args;
      args.find((a) => a.name === "x").defaultValue = "[1]";
      args.find((a) => a.name === "y").defaultValue = "1.0";
      args.find((a) => a.name === "w").defaultValue = "[[1], [2]]";
    },
  ],
  ["rich.inc", "returns types in another order", "pass", (s) => s.types.reverse()],
  ["interfaces.inc", "returns an interface's possible types in another order", "pass", (s) => type(s, "Node").possibleTypes.reverse()],
  ["rich.inc", "leaves out __schema", "executes", (s, d) => delete d.__schema],
  // The response's shape and envelope
  ["rich.inc", "leaves out a selected ofType", "executes", (s) => delete field(s, "M", "m").args[0].type.ofType],
  ["rich.inc", "leaves out a null it selects", "executes", (s) => delete type(s, "Q").specifiedByURL],
  ["rich.inc", "leaves out a selected field of a field", "executes", (s) => delete field(s, "Q", "a").description],
  ["rich.inc", "has a field the query doesn't select", "executes", (s) => (type(s, "Q").isDeprecated = false)],
  ["rich.inc", "has an ofType below the depth the query selects", "executes", (s) => (deepest(field(s, "Q", "a").type).ofType = null)],
  ["minimal.inc", "answers errors: []", "envelope", (s, d, r) => (r.errors = [])],
  ["minimal.inc", 'answers errors: "not a list"', "envelope", (s, d, r) => (r.errors = "not a list")],
  ["minimal.inc", "answers an entry the response format doesn't have", "envelope", (s, d, r) => (r.warnings = [])],
  ["minimal.inc", "answers extensions that aren't a map", "envelope", (s, d, r) => (r.extensions = "x")],
  // Built-in lists have no source order
  ["rich.inc", "reorders __TypeKind's enum values", "pass", (s) => type(s, "__TypeKind").enumValues.reverse()],
  ["rich.inc", "reorders __Type's fields", "pass", (s) => type(s, "__Type").fields.reverse()],
  ["rich.inc", "drops one of __TypeKind's enum values", "builtinDefinitions", (s) => type(s, "__TypeKind").enumValues.pop()],
  // The service's own directives, and the types they reach
  [
    "rich.inc",
    "provides a directive of its own that takes its own scalar",
    "pass",
    (s) => {
      s.directives.push(serviceDirective([inputValue("x", { kind: "SCALAR", name: "ExtraScalar", ofType: null })]));
      s.types.push(scalarType("ExtraScalar"));
    },
  ],
  [
    "minimal.inc",
    "provides a directive of its own that takes its own input object, which uses its own enum and Float",
    "pass",
    (s) => {
      s.directives.push(serviceDirective([inputValue("x", nonNull({ kind: "INPUT_OBJECT", name: "ExtraInput", ofType: null }))]));
      s.types.push(
        {
          ...scalarType("ExtraInput"),
          kind: "INPUT_OBJECT",
          isOneOf: false,
          inputFields: [inputValue("e", { kind: "ENUM", name: "ExtraEnum", ofType: null }), inputValue("f", { kind: "SCALAR", name: "Float", ofType: null })],
        },
        { ...scalarType("ExtraEnum"), kind: "ENUM", enumValues: [{ name: "ON", description: null, isDeprecated: false, deprecationReason: null }] },
        scalarType("Float"),
      );
    },
  ],
  [
    "rich.inc",
    "provides a directive of its own whose argument's type isn't in types",
    "arguments",
    (s) => s.directives.push(serviceDirective([inputValue("x", { kind: "SCALAR", name: "ExtraScalar", ofType: null })])),
  ],
  [
    "rich.inc",
    "provides a directive of its own whose argument is an object type",
    "directives",
    (s) => {
      s.directives.push(serviceDirective([inputValue("x", { kind: "OBJECT", name: "ExtraObject", ofType: null })]));
      s.types.push({ ...scalarType("ExtraObject"), kind: "OBJECT", fields: [], interfaces: [] });
    },
  ],
  ["rich.inc", "has a type nothing in the schema reaches", "types", (s) => s.types.push(scalarType("ExtraScalar"))],
  // __type(name:)
  ["minimal.lookup", "finds a type for an unknown name", "typeByName", (s, d) => (d.t4 = clone(d.t0))],
  ["minimal.lookup", "finds a built-in scalar nothing references", "typeByName", (s, d) => (d.t2 = { ...clone(d.t1), name: "Float" })],
  ["rich.lookup", "answers null for a type the schema has", "typeByName", (s, d) => (d.t1 = null)],
  ["rich.lookup", "answers another type", "typeByName", (s, d) => (d.t1 = clone(d.t2))],
  ["interfaces.lookup", "loses a field's Non-Null wrapper", "fields", (s, d) => (d.t0.fields[0].type = named("ID"))],
  ["deprecation.lookup.defaults", "returns a deprecated value when includeDeprecated is false", "deprecation", (s, d) => d.t2.enumValues.push({ name: "B", description: null, isDeprecated: true, deprecationReason: "Gone" })],
  ["order.lookup", "reorders an enum's values", "order", (s, d) => d.t3.enumValues.reverse()],
  ["minimal.lookup", "reorders __TypeKind's enum values", "pass", (s, d) => d.t3.enumValues.reverse()],
  ["rich.lookup", "leaves out a selected ofType", "executes", (s, d) => delete d.t0.fields[0].args[0].type.ofType],
  ["rich.lookup", "answers errors: []", "envelope", (s, d, r) => (r.errors = [])],
];

// The innermost type ref the query selects, at the TypeRef fragment's depth.
function deepest(ref) {
  let node = ref;
  for (let d = 0; d < TYPE_REF_DEPTH; d++) {
    if (node.ofType === null) node.ofType = { kind: "NON_NULL", name: null, ofType: null };
    node = node.ofType;
  }
  return node;
}

function type(s, name) {
  const t = s.types.find((x) => x.name === name);
  if (!t) throw new Error(`no type ${name} for a control`);
  return t;
}
function field(s, typeName, name) {
  const f = type(s, typeName).fields.find((x) => x.name === name);
  if (!f) throw new Error(`no field ${typeName}.${name} for a control`);
  return f;
}
function directive(s, name) {
  const d = s.directives.find((x) => x.name === name);
  if (!d) throw new Error(`no directive @${name} for a control`);
  return d;
}

export const CONTROLS = (vectors, builtins) => {
  const byId = new Map(vectors.map((v) => [v.id, v]));
  const controls = [];
  const expectedOf = (v) => (v.lookups ? v.expected.response : fullResponse(v, builtins));
  vectors.forEach((v, i) => {
    const own = expectedOf(v);
    controls.push({ name: "its own expected response", vector: v, response: own, check: "pass" });
    const other = expectedOf(vectors[(i + 1) % vectors.length]);
    if (JSON.stringify(other) !== JSON.stringify(own)) controls.push({ name: "another vector's expected response", vector: v, response: other, check: "any" });
  });
  for (const [id, name, check, change] of BROKEN) {
    const v = byId.get(id);
    if (!v) throw new Error(`no vector ${id} for a control`);
    const response = clone(expectedOf(v));
    change(response.data.__schema, response.data, response);
    controls.push({ name, vector: v, response, check });
  }
  controls.push({
    name: "answers with errors",
    vector: vectors[0],
    response: { errors: [{ message: "Cannot query field" }] },
    check: "executes",
  });
  return controls;
};
