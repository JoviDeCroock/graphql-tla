// The introspect area's self-test: responses built from the reference's
// expected ones, which the checker must judge as stated. Each vector's own
// expected response must pass, another vector's must fail, and each
// response broken on purpose must fail the check it targets. A few
// changes the spec allows must pass, so that the checker isn't stricter
// than the spec either.

import { fullResponse } from "./data.mjs";

const clone = (x) => JSON.parse(JSON.stringify(x));

const named = (name) => ({ kind: "SCALAR", name, ofType: null });

// [vector id, name, the check it must fail ("pass": none), change]
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
  ["rich.inc", "doesn't provide @include", "builtinDirectives", (s) => s.directives.splice(s.directives.findIndex((x) => x.name === "include"), 1)],
  ["rich.inc", "doesn't provide @deprecated", "deprecation", (s) => s.directives.splice(s.directives.findIndex((x) => x.name === "deprecated"), 1)],
  ["minimal.inc", "doesn't provide @deprecated, in a schema without deprecation", "builtinDirectives", (s) => s.directives.splice(s.directives.findIndex((x) => x.name === "deprecated"), 1)],
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
];

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
  vectors.forEach((v, i) => {
    const own = fullResponse(v, builtins);
    controls.push({ name: "its own expected response", vector: v, response: own, check: "pass" });
    const other = fullResponse(vectors[(i + 1) % vectors.length], builtins);
    if (JSON.stringify(other) !== JSON.stringify(own)) controls.push({ name: "another vector's expected response", vector: v, response: other, check: "any" });
  });
  for (const [id, name, check, change] of BROKEN) {
    const v = byId.get(id);
    if (!v) throw new Error(`no vector ${id} for a control`);
    const response = clone(fullResponse(v, builtins));
    change(response.data.__schema, response.data);
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
