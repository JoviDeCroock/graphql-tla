// Checks graphql-js's type system validation and introspection against the
// hand-written TLA+ references specs/TypeSystem.tla and
// specs/Introspection.tla.
//
// 1. Generate schemas: hand-written edge cases, then seeded random SDL from
//    scenarios that each aim at one area (interface implementation,
//    input object cycles, unions, enums, names, directives, root types,
//    default values), with defects planted at random.
// 2. For each graphql-js version, parse the SDL, run the SDL uniqueness
//    rules, build it with buildASTSchema(…, { assumeValidSDL: true }) and
//    run validateSchema. (Not `assumeValid: true`: that seeds the schema's
//    cached validation errors with [], so validateSchema then returns []
//    for any schema.) Each error is classified as the TypeSystem.tla rule
//    it reports.
// 3. For each schema graphql-js finds valid, run the introspection query
//    twice, with includeDeprecated: true everywhere and with every list's
//    default.
// 4. tla-ts checks that, per version, the rules graphql-js reports are
//    exactly TypeSystem!Verdict, adjusted by the documented deviations
//    below, and that every introspection result satisfies
//    Introspection!Matches. Negative controls (a dropped or added rule, a
//    perturbed introspection result) must each be rejected, and each
//    documented deviation must still be observed.
//
// Usage: node scripts/differential-type-system.mjs [--schemas N] [--seed S]
//                                                  [--mutants] [--verbose]
//
// --mutants plants each bug from specs/typesystem.mutants.mjs and
// specs/introspection.mutants.mjs in a temp copy of the references, and
// checks that the differential then fails.

import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as graphql16 from "graphql16";
import * as graphql17 from "graphql17";
import { validateSDL as validateSDL16 } from "graphql16/validation/validate.js";
import { validateSDL as validateSDL17 } from "graphql17/validation/validate";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const cli = join(root, "node_modules/tla-ts/dist/cli.js");
const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : Number(process.argv[index + 1]);
};
const SCHEMAS = arg("--schemas", 900);
const SEED = arg("--seed", 7);
const MUTANTS = process.argv.includes("--mutants");
const VERBOSE = process.argv.includes("--verbose");

const VERSIONS = [
  { key: "v16", graphql: graphql16, validateSDL: validateSDL16 },
  { key: "v17", graphql: graphql17, validateSDL: validateSDL17 },
];

// ---------------------------------------------------------------------------
// Deviations: where graphql-js is known to depart from the draft. Each one
// changes what the check expects from one version, and each must still be
// observed on some case, so that a fix in graphql-js shows up as a failure
// here rather than going unnoticed.

const VALIDATION_DEVIATIONS = [
  {
    versions: ["v16", "v17"],
    rule: "TYPE_NAME_NOT_BUILTIN",
    note: "accepts a type named like a built-in scalar, e.g. `scalar String`",
  },
  {
    versions: ["v16", "v17"],
    rule: "DIRECTIVE_USES_ITSELF",
    note: "doesn't check that a directive definition doesn't use itself",
  },
  {
    versions: ["v16", "v17"],
    rule: "DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY",
    note: "doesn't check that a directive definition doesn't reference itself through a type",
  },
  {
    versions: ["v16", "v17"],
    crash: "OutputTypedDefault(S)",
    note: "buildASTSchema throws (16: `Unexpected input type`, 17: `Expected Obj to be a GraphQL leaf type`) instead of reporting ARG_INPUT_TYPE when a default value has a value for a position of output type: `type Query { f(a: Obj = 1): Int }`",
  },
  { versions: ["v16"], rule: "ROOT_TYPES_DIFFERENT", note: "doesn't check that root types differ" },
  {
    versions: ["v17"],
    rule: "ROOT_TYPES_DIFFERENT",
    model: "~RootObjectsAreDifferent17(S)",
    note: "only checks that root types differ among those that are object types: `schema { query: Q mutation: M subscription: M }` with `interface M`",
  },
  { versions: ["v16"], rule: "ARG_DEFAULT_COMPATIBLE", note: "doesn't validate default values" },
  { versions: ["v16"], rule: "IMPL_DEPRECATION", note: "doesn't check IsValidImplementation step 2.6 (deprecation)" },
  {
    versions: ["v16"],
    rule: "INPUT_OBJECT_DEFAULT_VALUE_CYCLE",
    crash: "DefaultTypeCycle16(S)",
    note: "buildASTSchema overflows the stack (RangeError) when input object defaults mention each other's types, even without a default value cycle: `input A { b: B = {a: null} } input B { a: A = {b: null} }`",
  },
  {
    versions: ["v16"],
    transform: "CoercibleDefaults16(S)",
    note: "drops a default value that doesn't coerce (`defaultValue` is undefined), so `a: String! = 1 @deprecated` counts as a deprecated required argument, and a OneOf field's bad default goes unreported",
  },
  {
    versions: ["v16"],
    rule: "INPUT_OBJECT_UNBREAKABLE_CYCLE",
    model: "NonNullCycle16(S)",
    note: "only finds cycles of Non-Null input object fields; ignores OneOf input objects",
  },
  {
    versions: ["v17"],
    rule: "INPUT_OBJECT_UNBREAKABLE_CYCLE",
    model: "Cycle17(S)",
    note: "treats a OneOf input object with no fields (or with a Non-Null field, already invalid) as having a finite value: `input I @oneOf`",
  },
  {
    versions: ["v17"],
    rule: "DEFAULT_NOT_IN_DRAFT",
    model: "~OtherDefaultsAreCompatible(S)",
    note: "also validates default values of interface field arguments, input fields and directive arguments, which the draft doesn't require",
  },
];

// Changes to Introspection!SpecBuiltins: the built-in definitions each
// version provides, where they differ from the draft.
const INTROSPECTION_DEVIATIONS = [
  {
    versions: ["v16"],
    patch: (b) => `PatchDirectiveArg(${b}, "deprecated", "reason", Named("String"))`,
    note: "`@deprecated(reason: String = …)`: the draft has `reason: String!`",
  },
  {
    versions: ["v16"],
    patch: (b) =>
      ["fields", "enumValues", "inputFields"].reduce(
        (acc, f) => `PatchFieldArg(${acc}, "__Type", "${f}", "includeDeprecated", Named("Boolean"))`,
        b,
      ),
    note: "`__Type.fields`, `enumValues` and `inputFields` take `includeDeprecated: Boolean = false`: the draft has `Boolean!`",
  },
  {
    versions: ["v16"],
    patch: (b) =>
      ["__Field", "__Directive"].reduce(
        (acc, t) => `PatchFieldArg(${acc}, "${t}", "args", "includeDeprecated", Named("Boolean"))`,
        b,
      ),
    note: "`__Field.args` and `__Directive.args` take `includeDeprecated: Boolean = false`: the draft has `Boolean!`",
  },
  {
    versions: ["v17"],
    patch: (b) => `AddEnumValue(${b}, "__DirectiveLocation", "FRAGMENT_VARIABLE_DEFINITION", 8)`,
    note: "`__DirectiveLocation` has `FRAGMENT_VARIABLE_DEFINITION` (fragment arguments), which the draft doesn't",
  },
];

// ---------------------------------------------------------------------------
// Seeded random choices

const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

class Random {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  int(n) {
    return Math.floor(this.next() * n);
  }
  chance(p) {
    return this.next() < p;
  }
  pick(items) {
    return items[this.int(items.length)];
  }
  // Picks by weight from [[weight, value], ...].
  weighted(options) {
    let r = this.next() * options.reduce((s, [w]) => s + w, 0);
    for (const [w, v] of options) if ((r -= w) < 0) return v;
    return options.at(-1)[1];
  }
}

// ---------------------------------------------------------------------------
// A small schema model, printed as SDL. Types are written as strings such
// as "[Int!]!".

const named = (type) => type.replace(/[[\]!]/g, "");
const isNonNullType = (type) => type.endsWith("!");
const nullable = (type) => (isNonNullType(type) ? type.slice(0, -1) : type);
const isListType = (type) => nullable(type).startsWith("[");
const itemOf = (type) => nullable(type).slice(1, -1);

const printDescription = (d) => (d === undefined ? "" : d.block ? `"""${d.text}""" ` : `"${d.text}" `);
const printDeprecated = (r) =>
  r === undefined ? "" : r === true ? " @deprecated" : ` @deprecated(reason: "${r}")`;
const printApplied = (names = []) => names.map((n) => ` @${n}`).join("");
const printInputValue = (v) =>
  `${printDescription(v.description)}${v.name}: ${v.type}${v.default !== undefined ? ` = ${v.default}` : ""}${printDeprecated(
    v.deprecated,
  )}${printApplied(v.directives)}`;
const printArgs = (args = []) => (args.length ? `(${args.map(printInputValue).join(", ")})` : "");
const block = (lines) => (lines.length ? ` {\n${lines.map((l) => `  ${l}`).join("\n")}\n}` : "");

const printType = (t) => {
  const head = `${printDescription(t.description)}`;
  const applied = printApplied(t.directives);
  switch (t.kind) {
    case "scalar":
      return `${head}scalar ${t.name}${t.specifiedBy ? ` @specifiedBy(url: "${t.specifiedBy}")` : ""}${applied}`;
    case "type":
    case "interface": {
      const impl = t.interfaces?.length ? ` implements ${t.interfaces.join(" & ")}` : "";
      const fields = (t.fields ?? []).map(
        (f) =>
          `${printDescription(f.description)}${f.name}${printArgs(f.args)}: ${f.type}${printDeprecated(
            f.deprecated,
          )}${printApplied(f.directives)}`,
      );
      return `${head}${t.kind} ${t.name}${impl}${applied}${block(fields)}`;
    }
    case "union":
      return `${head}union ${t.name}${applied}${t.members?.length ? ` = ${t.members.join(" | ")}` : ""}`;
    case "enum":
      return `${head}enum ${t.name}${applied}${block(
        (t.values ?? []).map(
          (v) => `${printDescription(v.description)}${v.name}${printDeprecated(v.deprecated)}${printApplied(v.directives)}`,
        ),
      )}`;
    case "input":
      return `${head}input ${t.name}${t.oneOf ? " @oneOf" : ""}${applied}${block((t.fields ?? []).map(printInputValue))}`;
  }
  throw new Error(`unknown kind ${t.kind}`);
};

const printDirective = (d) =>
  `${printDescription(d.description)}directive @${d.name}${printArgs(d.args)}${printDeprecated(d.deprecated)}${
    d.repeatable ? " repeatable" : ""
  } on ${d.locations.join(" | ")}`;

const printSchema = (m) => {
  const parts = [];
  if (m.schemaDef) {
    const ops = Object.entries(m.schemaDef).map(([op, type]) => `  ${op}: ${type}`);
    parts.push(`${printDescription(m.description)}schema {\n${ops.join("\n")}\n}`);
  }
  for (const t of m.types) parts.push(printType(t));
  for (const d of m.directives ?? []) parts.push(printDirective(d));
  return `${parts.join("\n\n")}\n`;
};

// ---------------------------------------------------------------------------
// Scenarios. Each returns a schema model; most plant a defect with some
// probability.

const SCALARS = ["Int", "String", "Boolean", "Float", "ID"];
const WRAPS = [
  [5, (t) => t],
  [3, (t) => `${t}!`],
  [2, (t) => `[${t}]`],
  [2, (t) => `[${t}!]!`],
  [1, (t) => `[${t}]!`],
  [1, (t) => `[${t}!]`],
  [1, (t) => `[[${t}]]`],
];
const wrap = (r, name) => r.weighted(WRAPS)(name);

const query = (fields) => ({ kind: "type", name: "Query", fields });
const field = (name, type, extra = {}) => ({ name, type, ...extra });

// A literal for a type: valid, or (when bad) wrong in one plausible way.
const literal = (r, m, type, bad, depth = 3) => {
  if (isNonNullType(type)) {
    if (bad && r.chance(0.3)) return "null";
    return literal(r, m, nullable(type), bad, depth);
  }
  if (!bad && r.chance(0.1)) return "null";
  if (isListType(type)) {
    if (r.chance(0.3)) return literal(r, m, itemOf(type), bad, depth); // coerced to a list of one
    const n = r.int(3);
    const items = Array.from({ length: n }, () => literal(r, m, itemOf(type), false, depth - 1));
    if (bad) items.push(literal(r, m, itemOf(type), true, depth - 1));
    return `[${items.join(", ")}]`;
  }
  const name = named(type);
  const def = m.types.find((t) => t.name === name);
  if (!def || def.kind === "scalar") {
    const good = { Int: ["0", "7", "-3"], Float: ["1.5", "2", "1.0"], String: ['"s"', '"text"'], Boolean: ["true", "false"], ID: ['"x1"', "4"] }[name];
    const wrong = { Int: ["1.5", '"7"', "true"], Float: ['"1.5"', "true"], String: ["1", "true", "RED"], Boolean: ["1", '"true"'], ID: ["1.5", "true"] }[name];
    return r.pick(bad ? wrong : good);
  }
  if (def.kind === "enum") {
    const names = (def.values ?? []).map((v) => v.name);
    if (bad || names.length === 0) return r.pick(['"A"', "NOT_A_VALUE", "1"]);
    return r.pick(names);
  }
  if (def.kind === "input") {
    const fields = def.fields ?? [];
    if (depth <= 0) return "{}";
    if (def.oneOf) {
      if (bad) return r.pick(["{}", fields.length > 1 ? `{${fields[0].name}: ${literal(r, m, nullable(fields[0].type), false, depth - 1)}, ${fields[1].name}: ${literal(r, m, nullable(fields[1].type), false, depth - 1)}}` : `{${fields[0]?.name ?? "x"}: null}`]);
      if (fields.length === 0) return "{}";
      const f = r.pick(fields);
      const v = literal(r, m, nullable(f.type), false, depth - 1);
      return `{${f.name}: ${v === "null" ? literal(r, m, `${nullable(f.type)}!`, false, depth - 1) : v}}`;
    }
    const entries = [];
    for (const f of fields) {
      const required = isNonNullType(f.type) && f.default === undefined;
      if (required || r.chance(0.4)) {
        // Keep literals of recursive input objects small.
        if (named(f.type) === name && !required) continue;
        if (named(f.type) === name) return bad ? "{}" : "null";
        entries.push(`${f.name}: ${literal(r, m, f.type, false, depth - 1)}`);
      }
    }
    if (bad) {
      const k = r.int(2);
      if (k === 0) entries.push("unknownField: 1");
      else if (entries.length > 0) entries.shift();
      else entries.push("unknownField: 1");
    }
    return `{${entries.join(", ")}}`;
  }
  return '"?"';
};

// Gives some input values a default, valid or not. Runs once every type
// exists, since a literal depends on the types it names.
const assignDefaults = (r, m, pDefault, pBad) => {
  const values = [];
  for (const t of m.types) {
    for (const f of t.fields ?? []) {
      if (t.kind === "input") values.push(f);
      for (const a of f.args ?? []) values.push(a);
    }
  }
  for (const d of m.directives ?? []) values.push(...(d.args ?? []));
  for (const v of values) {
    if (v.default !== undefined || !r.chance(pDefault)) continue;
    const def = m.types.find((t) => t.name === named(v.type));
    if (def?.kind === "scalar") continue; // a custom scalar's coercion is up to the service
    if (def && !["enum", "input"].includes(def.kind)) continue;
    v.default = literal(r, m, v.type, r.chance(pBad));
  }
};

const maybeDescription = (r) =>
  r.chance(0.3) ? { text: r.pick(["A description.", "Use with care", "multi word text"]), block: r.chance(0.5) } : undefined;
const maybeDeprecated = (r, p) => (r.chance(p) ? r.pick([true, "old", "Use something else"]) : undefined);

// Interface implementation: covariance through lists and Non-Null, argument
// equality, transitive interfaces, cycles.
const implementationScenario = (r) => {
  const outputs = ["Int", "String", "Obj", "Node", "Named", "Union1"];
  const ifaceFields = Array.from({ length: 1 + r.int(3) }, (_, i) =>
    field(`f${i}`, wrap(r, r.pick(outputs)), {
      args: r.chance(0.5) ? [{ name: "a", type: wrap(r, r.pick(["Int", "String", "Input1"])) }] : [],
      deprecated: maybeDeprecated(r, 0.15),
      description: maybeDescription(r),
    }),
  );
  const named2 = { kind: "interface", name: "Named", fields: [field("name", "String")], interfaces: [] };
  const node = { kind: "interface", name: "Node", fields: [...ifaceFields], interfaces: [] };
  if (r.chance(0.4)) {
    node.interfaces.push("Named");
    node.fields.push(field("name", r.chance(0.85) ? "String" : "Int"));
  }
  const obj = { kind: "type", name: "Obj", interfaces: [], fields: [] };
  const sub = { kind: "interface", name: "Sub", interfaces: [], fields: [] };
  const implementer = r.chance(0.7) ? obj : sub;
  implementer.interfaces.push("Node");
  if (node.interfaces.includes("Named") && r.chance(0.85)) implementer.interfaces.push("Named");
  if (r.chance(0.05)) implementer.interfaces.push("Node"); // implements twice
  if (r.chance(0.05)) implementer.interfaces.push(r.pick(["Union1", "Obj2", "Int2"])); // not an interface

  const subtypeOf = (name) =>
    ({ Node: r.pick(implementer === obj ? ["Obj"] : ["Sub", "Obj"]), Named: r.pick(["Node", "Obj"]), Union1: "Obj" })[name] ?? name;
  const mutateType = (type) =>
    r.weighted([
      [6, () => type],
      [2, () => (isNonNullType(type) ? type : `${type}!`)],
      [1, () => (isNonNullType(type) ? nullable(type) : type)],
      [1, () => (isListType(type) ? type.replace(named(type), `${named(type)}!`).replace("!!", "!") : `[${type}]`)],
      [1, () => (isListType(type) ? named(type) : type)],
      [2, () => type.replace(named(type), subtypeOf(named(type)))],
      [1, () => type.replace(named(type), r.pick(["Int", "String", "Obj2"]))],
    ])();
  for (const f of ifaceFields) {
    if (r.chance(0.05)) continue; // missing field
    const args = [];
    for (const a of f.args) {
      const k = r.weighted([[8, "same"], [1, "drop"], [1, "retype"]]);
      if (k === "same") args.push({ ...a });
      else if (k === "retype") args.push({ ...a, type: isNonNullType(a.type) ? nullable(a.type) : `${a.type}!` });
    }
    if (r.chance(0.2)) {
      const required = r.chance(0.5);
      args.push({ name: "extra", type: required ? "Int!" : "Int", ...(required && r.chance(0.4) ? { default: "1" } : {}) });
    }
    implementer.fields.push(
      field(f.name, mutateType(f.type), {
        args,
        deprecated: f.deprecated !== undefined && r.chance(0.8) ? f.deprecated : maybeDeprecated(r, 0.1),
        description: maybeDescription(r),
      }),
    );
  }
  for (const f of node.fields.slice(ifaceFields.length)) implementer.fields.push(field(f.name, r.chance(0.9) ? f.type : "Int"));
  if (implementer === sub) obj.interfaces.push("Sub", "Node", ...(implementer.interfaces.includes("Named") ? ["Named"] : []));
  if (implementer === sub) obj.fields = sub.fields.map((f) => ({ ...f, args: (f.args ?? []).map((a) => ({ ...a })) }));
  if (implementer === obj) obj.fields.push(field("own", "Int"));

  const types = [query([field("node", "Node"), field("u", "Union1"), field("i", "Int", { args: [{ name: "in", type: "Input1" }] })]), node, named2, obj];
  if (implementer === sub || r.chance(0.2)) types.push(sub);
  if (!sub.fields.length) sub.fields.push(field("x", "Int"));
  types.push(
    { kind: "type", name: "Obj2", fields: [field("x", "Int")] },
    { kind: "union", name: "Union1", members: ["Obj", "Obj2"] },
    { kind: "input", name: "Input1", fields: [field("x", "Int")] },
    { kind: "scalar", name: "Int2" },
  );
  // Interface cycles and self-implementation.
  const cycle = r.weighted([[10, "none"], [1, "self"], [1, "pair"]]);
  if (cycle === "self") node.interfaces.push("Node");
  if (cycle === "pair") {
    named2.interfaces.push("Node");
    named2.fields.push(...node.fields.filter((f) => f.name !== "name").map((f) => ({ ...f })));
    if (!node.interfaces.includes("Named")) {
      node.interfaces.push("Named");
      node.fields.push(field("name", "String"));
    }
  }
  return { types };
};

// Input objects: Non-Null cycles, OneOf, default values and their cycles.
const inputScenario = (r) => {
  const count = 1 + r.int(3);
  const names = Array.from({ length: count }, (_, i) => `In${i + 1}`);
  const inputs = names.map((name) => ({ kind: "input", name, oneOf: r.chance(0.3), fields: [] }));
  for (const t of inputs) {
    const n = r.chance(0.05) ? 0 : 1 + r.int(3);
    for (let i = 0; i < n; i++) {
      const target = r.pick([...names, ...names, "Int", "String", "Color"]);
      let type = t.oneOf
        ? r.weighted([[8, target], [1, `${target}!`], [1, `[${target}]`]])
        : r.weighted([[3, target], [3, `${target}!`], [1, `[${target}!]!`], [1, `[${target}]`]]);
      const f = field(`f${i}`, type, { deprecated: maybeDeprecated(r, 0.1), description: maybeDescription(r) });
      if (names.includes(target) && !isListType(type) && r.chance(0.25)) f.default = "{}";
      t.fields.push(f);
    }
  }
  const m = {
    types: [
      query([field("q", "Int", { args: [{ name: "in", type: wrap(r, "In1") }] })]),
      ...inputs,
      { kind: "enum", name: "Color", values: [{ name: "RED" }, { name: "GREEN", deprecated: maybeDeprecated(r, 0.3) }] },
    ],
  };
  assignDefaults(r, m, 0.3, 0.25);
  return m;
};

// Unions whose members aren't all object types.
const unionScenario = (r) => {
  const candidates = [[6, "A"], [6, "B"], [1, "I"], [1, "Int"], [1, "Color"], [1, "In"], [1, "U2"], [1, "Date"]];
  const members = r.chance(0.07) ? [] : Array.from({ length: 1 + r.int(3) }, () => r.weighted(candidates));
  return {
    types: [
      query([field("u", "U", { description: maybeDescription(r) }), field("u2", "U2")]),
      { kind: "union", name: "U", members, description: maybeDescription(r) },
      { kind: "union", name: "U2", members: ["A"] },
      { kind: "type", name: "A", fields: [field("a", "Int")], interfaces: r.chance(0.3) ? ["I"] : [] },
      { kind: "type", name: "B", fields: [field("b", "String")] },
      { kind: "interface", name: "I", fields: [field("a", "Int")] },
      { kind: "enum", name: "Color", values: [{ name: "RED" }] },
      { kind: "input", name: "In", fields: [field("x", "Int")] },
      { kind: "scalar", name: "Date", specifiedBy: r.chance(0.5) ? "https://example.com/date" : undefined },
    ],
  };
};

// Enums: empty, repeated or reserved values, deprecation.
const enumScenario = (r) => {
  const pool = [[6, "RED"], [6, "GREEN"], [6, "BLUE"], [1, "__HIDDEN"], [1, "_x"]];
  const values = r.chance(0.07) ? [] : Array.from({ length: 1 + r.int(4) }, () => r.weighted(pool));
  const seen = new Set();
  const out = [];
  for (const name of values) {
    if (seen.has(name) && r.chance(0.7)) continue;
    seen.add(name);
    out.push({ name, deprecated: maybeDeprecated(r, 0.25), description: maybeDescription(r) });
  }
  const m = {
    types: [
      query([field("c", "Color", { args: [{ name: "c", type: wrap(r, "Color") }] })]),
      { kind: "enum", name: "Color", values: out, description: maybeDescription(r) },
    ],
  };
  assignDefaults(r, m, 0.4, 0.2);
  return m;
};

// Reserved names, and a type named like a built-in.
const nameScenario = (r) => {
  const n = (base) => (r.chance(0.15) ? `__${base}` : base);
  const obj = n("Obj");
  const m = {
    types: [
      query([field(n("f"), "Int", { args: [{ name: n("a"), type: "Int" }] }), field("o", obj)]),
      { kind: "type", name: obj, fields: [field(n("g"), "String")] },
      { kind: "input", name: n("In"), fields: [field(n("x"), "Int")] },
      { kind: "enum", name: n("E"), values: [{ name: n("V") }] },
    ],
    directives: [{ name: n("dir"), args: [{ name: n("arg"), type: "Int" }], locations: ["FIELD"] }],
  };
  m.types[0].fields.push(field("e", m.types[3].name, { args: [{ name: "i", type: m.types[2].name }] }));
  if (r.chance(0.08)) m.types.push({ kind: "scalar", name: r.pick(["String", "Int", "ID"]) });
  if (r.chance(0.08)) m.types.push({ kind: "scalar", name: "Dup" }, { kind: "scalar", name: "Dup" });
  if (r.chance(0.08)) m.types[1].fields.push(field("g2", "Int"), field("g2", "Int"));
  if (r.chance(0.08)) m.types[0].fields[0].args.push({ name: "b", type: "Int" }, { name: "b", type: "Int" });
  if (r.chance(0.08)) m.types[3].values.push({ name: "W" }, { name: "W" });
  if (r.chance(0.08)) m.types[2].fields.push(field("y", "Int"), field("y", "Int"));
  if (r.chance(0.08)) m.directives.push({ name: "dup", locations: ["FIELD"] }, { name: "dup", locations: ["FIELD"] });
  return m;
};

// Directive definitions: argument types, deprecation, self-reference.
const directiveScenario = (r) => {
  const d = {
    name: "tag",
    description: maybeDescription(r),
    repeatable: r.chance(0.3),
    locations: [r.pick(["FIELD", "QUERY"]), ...(r.chance(0.5) ? ["FIELD_DEFINITION", "ENUM_VALUE"] : []), "ARGUMENT_DEFINITION", "INPUT_FIELD_DEFINITION"],
    args: [],
  };
  const argTypes = [[4, "Int"], [3, "String!"], [2, "In"], [2, "Color"], [1, "Obj"], [1, "[In!]"]];
  for (let i = 0; i < 1 + r.int(2); i++) {
    const a = { name: `a${i}`, type: r.weighted(argTypes), deprecated: maybeDeprecated(r, 0.15), description: maybeDescription(r) };
    d.args.push(a);
  }
  const m = {
    types: [
      query([field("f", "Int", { args: [{ name: "x", type: "In" }] }), field("c", "Color"), field("o", "Obj")]),
      { kind: "input", name: "In", fields: [field("v", "Int")] },
      { kind: "enum", name: "Color", values: [{ name: "RED" }, { name: "BLUE" }] },
      { kind: "type", name: "Obj", fields: [field("x", "Int")] },
    ],
    directives: [d, { name: "other", args: [{ name: "x", type: "Int" }], locations: ["FIELD_DEFINITION"] }],
  };
  const self = r.weighted([[6, "none"], [1, "direct"], [1, "input"], [1, "enum"], [1, "via other"]]);
  if (self === "direct") d.args[0].directives = ["tag"];
  if (self === "input") m.types[1].fields[0].directives = ["tag"];
  if (self === "enum") m.types[2].values[0].directives = ["tag"];
  if (self === "via other") {
    m.directives[1].args[0].directives = ["tag"];
    d.args[0].directives = ["other"];
  }
  if (self === "input" || self === "enum") {
    if (!d.args.some((a) => named(a.type) === (self === "input" ? "In" : "Color"))) d.args.push({ name: "via", type: self === "input" ? "In" : "Color" });
  }
  // Directive deprecation is draft syntax that only graphql-js 17 parses.
  if (r.chance(0.1)) d.deprecated = r.pick([true, "gone"]);
  assignDefaults(r, m, 0.4, 0.3);
  return m;
};

// Root operation types.
const rootScenario = (r) => {
  const kinds = [[6, "type"], [1, "interface"], [1, "union"], [1, "input"], [1, "scalar"], [1, "enum"]];
  const make = (name) => {
    const kind = r.weighted(kinds);
    if (kind === "type") return { kind, name, fields: [field("x", "Int")] };
    if (kind === "interface") return { kind, name, fields: [field("x", "Int")] };
    if (kind === "union") return { kind, name, members: ["Plain"] };
    if (kind === "input") return { kind, name, fields: [field("x", "Int")] };
    if (kind === "enum") return { kind, name, values: [{ name: "A" }] };
    return { kind, name };
  };
  const types = [{ kind: "type", name: "Plain", fields: [field("p", "Int")] }];
  if (r.chance(0.5)) {
    for (const name of ["Query", "Mutation", "Subscription"]) if (r.chance(name === "Query" ? 0.92 : 0.5)) types.push(make(name));
    return { types };
  }
  const roots = ["Q", "M", "S"].map(make);
  types.push(...roots);
  const schemaDef = {};
  if (r.chance(0.93)) schemaDef.query = r.chance(0.9) ? "Q" : "Plain";
  if (r.chance(0.6)) schemaDef.mutation = r.chance(0.85) ? "M" : r.pick(["Q", "Plain"]);
  if (r.chance(0.4)) schemaDef.subscription = r.chance(0.85) ? "S" : r.pick(["Q", "M"]);
  if (Object.keys(schemaDef).length === 0) schemaDef.mutation = "M";
  return { types, schemaDef, description: maybeDescription(r) };
};

// Fields returning input types, arguments of output types, required
// arguments that are deprecated.
const typeUseScenario = (r) => {
  const outputs = [[4, "Int"], [2, "Obj"], [2, "Color"], [1, "In"], [1, "U"]];
  const inputs = [[4, "Int"], [2, "In"], [2, "Color"], [1, "Obj"], [1, "U"], [1, "I"]];
  const q = query([]);
  for (let i = 0; i < 1 + r.int(3); i++) {
    q.fields.push(
      field(`f${i}`, wrap(r, r.weighted(outputs)), {
        args: Array.from({ length: r.int(3) }, (_, j) => ({
          name: `a${j}`,
          type: wrap(r, r.weighted(inputs)),
          deprecated: maybeDeprecated(r, 0.15),
          description: maybeDescription(r),
        })),
        deprecated: maybeDeprecated(r, 0.1),
        description: maybeDescription(r),
      }),
    );
  }
  const m = {
    types: [
      q,
      { kind: "type", name: "Obj", fields: [field("x", "Int")], interfaces: ["I"] },
      { kind: "interface", name: "I", fields: [field("x", r.chance(0.1) ? "In" : "Int", { args: r.chance(0.3) ? [{ name: "z", type: "Int!", deprecated: maybeDeprecated(r, 0.5) }] : [] })] },
      { kind: "union", name: "U", members: ["Obj"] },
      { kind: "enum", name: "Color", values: [{ name: "RED" }, { name: "BLUE" }] },
      { kind: "input", name: "In", fields: [field("x", r.weighted([[6, "Int"], [1, "Obj"], [1, "Int!"]]), { deprecated: maybeDeprecated(r, 0.2) }), field("y", "[Color!]")] },
    ],
  };
  if (m.types[2].fields[0].args.length) m.types[1].fields[0].args = m.types[2].fields[0].args.map((a) => ({ ...a }));
  if (r.chance(0.1)) m.types.push({ kind: "type", name: "Empty" }, { kind: "interface", name: "EmptyI" });
  assignDefaults(r, m, 0.35, 0.3);
  return m;
};

// A larger, mostly valid schema, for introspection.
const richScenario = (r) => {
  const m = {
    description: maybeDescription(r),
    schemaDef: r.chance(0.3) ? { query: "Root", ...(r.chance(0.5) ? { mutation: "Mut" } : {}) } : undefined,
    types: [],
    directives: [],
  };
  const rootName = m.schemaDef ? "Root" : "Query";
  m.types.push(
    {
      kind: "type",
      name: rootName,
      description: maybeDescription(r),
      fields: [
        field("node", "Node", { args: [{ name: "id", type: "ID!" }] }),
        field("search", "[Result!]!", {
          args: [
            { name: "term", type: "String", description: maybeDescription(r) },
            { name: "limit", type: "Int", deprecated: maybeDeprecated(r, 0.4) },
            { name: "filter", type: "Filter" },
            { name: "order", type: "[Order!]" },
            { name: "pick", type: "Pick" },
          ],
        }),
        field("old", "String", { deprecated: maybeDeprecated(r, 0.6) }),
        field("when", "Date"),
        field("ratio", "Float"),
      ],
    },
    { kind: "interface", name: "Node", description: maybeDescription(r), fields: [field("id", "ID!")] },
    {
      kind: "type",
      name: "User",
      interfaces: ["Node"],
      fields: [field("id", "ID!"), field("name", "String", { deprecated: maybeDeprecated(r, 0.3) }), field("friends", "[User]")],
    },
    { kind: "type", name: "Post", interfaces: ["Node"], fields: [field("id", "ID!"), field("by", "User!")] },
    { kind: "union", name: "Result", members: r.chance(0.5) ? ["User", "Post"] : ["Post", "User"] },
    {
      kind: "enum",
      name: "Order",
      values: [{ name: "ASC" }, { name: "DESC", deprecated: maybeDeprecated(r, 0.5), description: maybeDescription(r) }],
    },
    {
      kind: "input",
      name: "Filter",
      description: maybeDescription(r),
      fields: [
        field("text", "String", { deprecated: maybeDeprecated(r, 0.4) }),
        field("order", "Order"),
        field("ids", "[ID!]"),
        field("max", "Int"),
        field("nested", "Filter"),
      ],
    },
    { kind: "input", name: "Pick", oneOf: true, fields: [field("id", "ID"), field("name", "String")] },
    { kind: "scalar", name: "Date", specifiedBy: r.chance(0.6) ? "https://example.com/date" : undefined, description: maybeDescription(r) },
  );
  if (m.schemaDef?.mutation) m.types.push({ kind: "type", name: "Mut", fields: [field("save", "Boolean", { args: [{ name: "f", type: "Filter!" }] })] });
  m.directives.push(
    { name: "cache", args: [{ name: "ttl", type: "Int" }, { name: "scope", type: "Order" }], locations: ["FIELD_DEFINITION", "OBJECT"], repeatable: r.chance(0.5), description: maybeDescription(r) },
    { name: "auth", args: [{ name: "role", type: "String", deprecated: maybeDeprecated(r, 0.3) }], locations: ["QUERY", "FIELD"] },
  );
  assignDefaults(r, m, 0.5, 0.05);
  return m;
};

const SCENARIOS = [
  [4, implementationScenario],
  [3, inputScenario],
  [2, unionScenario],
  [2, enumScenario],
  [2, nameScenario],
  [2, directiveScenario],
  [2, rootScenario],
  [3, typeUseScenario],
  [3, richScenario],
];

// Hand-written edge cases, including a minimal SDL for every deviation.
const FIXED = [
  "type Query { a: Int }",
  // Covariance through lists and Non-Null.
  "interface I { a: [Int] } type Query implements I { a: [Int!]! }",
  "interface I { a: [Int]! } type Query implements I { a: [Int] }",
  "interface I { a: [[Int]] } type Query implements I { a: [Int] }",
  "interface I { a: I } type Query implements I { a: Query }",
  "interface I { a: U } union U = Query type Query implements I { a: Query }",
  "interface I { a(x: Int): Int } type Query implements I { a(x: Int!): Int }",
  "interface I { a: Int } type Query implements I { a(extra: Int!): Int }",
  "interface I { a: Int } type Query implements I { a(extra: Int! = 1): Int }",
  "interface J { a: Int } interface I implements J { a: Int } type Query implements I { a: Int }",
  "interface I implements J & I { a: Int } interface J implements I & J { a: Int } type Query { a: I }",
  "interface I { a: Int @deprecated } type Query implements I { a: Int }",
  // Deviations, and the draft rules graphql-js 16 predates.
  "scalar String type Query { a: String }",
  "directive @d(a: Int @d) on ARGUMENT_DEFINITION type Query { a: Int }",
  "directive @d(a: In) on ARGUMENT_DEFINITION input In { f: Int @d } type Query { a(x: In): Int }",
  "schema { query: Query mutation: Query } type Query { a: Int }",
  "type Query { a(x: Int = \"s\"): Int }",
  "interface I { a: Int } type Query implements I { a: Int @deprecated }",
  "input I { i: I = {} } type Query { a(i: I): Int }",
  "input I @oneOf { a: J } input J @oneOf { i: I } type Query { a(i: I): Int }",
  "input I @oneOf type Query { a(i: I): Int }",
  "input I { a: J! } input J @oneOf { i: I } type Query { a(i: I): Int }",
  "input A { b: B = {a: null} } input B { a: A = {b: null} } type Query { f(a: A): Int }",
  "schema { query: Q mutation: M subscription: M } type Q { x: Int } interface M { x: Int }",
  "input I @oneOf { a: Int = \"x\", b: Int } type Query { f(i: I): Int }",
  "type Query { f(a: Int! = \"x\" @deprecated): Int }",
  "type Obj { x: Int } type Query { f(a: Obj = 1): Int }",
  "interface I { a(x: Int = \"s\"): Int } type Query implements I { a(x: Int = 1): Int }",
  // Input object cycles.
  "input I { self: I! } type Query { a(i: I): Int }",
  "input I { self: [I!]! } type Query { a(i: I): Int }",
  "input A { b: B! } input B { a: A! } type Query { a(i: A): Int }",
  "input A { b: B! } input B { c: C! } input C { c: C! } type Query { a(i: A): Int }",
  "input A @oneOf { b: B, s: String } input B { a: A! } type Query { a(i: A): Int }",
  // Default values and coercion.
  "type Query { a(x: [Int] = 1, y: Float = 1, z: ID = 7, w: [[Int]] = [1, 2]): Int }",
  "input I { a: Int = 1, b: Int } type Query { a(x: I = {b: 2}): Int }",
  "input I { a: Int! } type Query { a(x: I = {}): Int }",
  "enum E { A B } type Query { a(x: E = \"A\"): Int }",
  // Introspection: deprecation, specifiedBy, OneOf, unions, defaults.
  `"""The schema""" schema { query: Q mutation: M }
"The root" type Q { a(x: Int = 3, y: [Int] = 1, z: In = {b: 2}): U, old: String @deprecated(reason: "gone"), d: Date }
type M { m(p: Pick!): Boolean }
type A { a: Int } type B { b: Int } union U = B | A
enum E { X Y @deprecated }
input In { a: Int = 1, b: Int, e: E = Y, old: String @deprecated }
input Pick @oneOf { id: ID, name: String }
scalar Date @specifiedBy(url: "https://example.com/date")
directive @tag(v: String @deprecated, w: Int = 2) repeatable on FIELD_DEFINITION | QUERY`,
  // One per rule that random schemas break rarely.
  "type Query { a: Int a: Int }",
  "type Query { a(x: Int, x: Int): Int }",
  "directive @d on FIELD directive @d on FIELD type Query { a: Int }",
  "type Query { a(x: Int! @deprecated): Int }",
  "interface I { a: Int } type Query implements I & I { a: Int }",
  "union U = Query type Query implements U { a: Int }",
  "union U type Query { a: U }",
  "union U = Query | Query type Query { a: U }",
  "enum E type Query { a: E }",
  "input In { __x: Int } type Query { a(x: In): Int }",
  "input In { x: Query } type Query { a(x: In): Int }",
  "input In { x: Int! @deprecated } type Query { a(x: In): Int }",
  "input In @oneOf { x: Int! } type Query { a(x: In): Int }",
  // Root types.
  "schema { mutation: M } type M { a: Int }",
  "interface Query { a: Int }",
  "type Query { a: Int } interface Mutation { a: Int }",
  // §3.3.1: "a valid GraphQL schema without a mutation root operation type,
  // even though it contains a type named "Mutation"".
  "schema { query: Query } type Query { a: Int } interface Mutation { a: Int }",
];

const RICH = FIXED.findIndex((sdl) => sdl.startsWith('"""The schema"""'));

const generate = () => {
  const r = new Random(SEED);
  const sdls = [...FIXED];
  const seen = new Set(sdls);
  let attempts = 0;
  while (sdls.length < FIXED.length + SCHEMAS && attempts++ < SCHEMAS * 5) {
    const model = r.weighted(SCENARIOS)(r);
    const sdl = printSchema({ directives: [], ...model });
    if (!seen.has(sdl)) {
      seen.add(sdl);
      sdls.push(sdl);
    }
  }
  return sdls;
};

// ---------------------------------------------------------------------------
// SDL documents as TypeSystem.tla schema data

const KIND = {
  ScalarTypeDefinition: "SCALAR",
  ObjectTypeDefinition: "OBJECT",
  InterfaceTypeDefinition: "INTERFACE",
  UnionTypeDefinition: "UNION",
  EnumTypeDefinition: "ENUM",
  InputObjectTypeDefinition: "INPUT_OBJECT",
};

const opt = (v) => (v === undefined || v === null ? [] : [v]);

const typeRefOf = (node) => {
  const wrappers = [];
  while (node.kind !== "NamedType") {
    wrappers.push(node.kind === "NonNullType" ? "nonNull" : "list");
    node = node.type;
  }
  return { name: node.name.value, wrappers };
};

// Numbers are canonicalised so that 1.0 and 1 are the same value.
const valueOf = (node) => {
  const v = (kind, text = "", items = [], fields = []) => ({ kind, text, items, fields });
  switch (node.kind) {
    case "NullValue":
      return v("null");
    case "IntValue":
      return v("int", String(Number(node.value)));
    case "FloatValue":
      return v("float", String(Number(node.value)));
    case "StringValue":
      return v("string", node.value);
    case "BooleanValue":
      return v("boolean", String(node.value));
    case "EnumValue":
      return v("enum", node.value);
    case "ListValue":
      return v("list", "", node.values.map(valueOf));
    case "ObjectValue":
      return v("object", "", [], node.fields.map((f) => ({ name: f.name.value, value: valueOf(f.value) })));
  }
  throw new Error(`unexpected value ${node.kind}`);
};

const deprecatedOf = (directives = []) => {
  const d = directives.find((x) => x.name.value === "deprecated");
  if (!d) return [];
  const reason = d.arguments?.find((a) => a.name.value === "reason");
  return [reason ? reason.value.value : "No longer supported"];
};

const appliedIn = (node, out = new Set()) => {
  for (const d of node.directives ?? []) out.add(d.name.value);
  for (const child of [...(node.fields ?? []), ...(node.arguments ?? []), ...(node.values ?? [])]) {
    if (child.kind) appliedIn(child, out);
  }
  return out;
};

// Converts a parsed SDL document. `places` maps each AST node to what it
// is, so that an error's node tells which rule it reports.
const schemaDataOf = (doc) => {
  const places = new Map();
  const inputValue = (node, place, owner) => {
    places.set(node, { place, owner });
    return {
      name: node.name.value,
      description: opt(node.description?.value),
      type: typeRefOf(node.type),
      default: node.defaultValue ? [valueOf(node.defaultValue)] : [],
      deprecated: deprecatedOf(node.directives),
    };
  };
  const types = [];
  const directives = [];
  let schemaDef = false;
  let operations = [];
  let description = [];
  for (const def of doc.definitions) {
    if (def.kind === "SchemaDefinition") {
      schemaDef = true;
      description = opt(def.description?.value);
      operations = def.operationTypes.map((o) => ({ operation: o.operation, type: o.type.name.value }));
      continue;
    }
    if (def.kind === "DirectiveDefinition") {
      places.set(def, { place: "directive" });
      directives.push({
        name: def.name.value,
        description: opt(def.description?.value),
        args: (def.arguments ?? []).map((a) => inputValue(a, "arg", `@${def.name.value}`)),
        repeatable: def.repeatable,
        locations: def.locations.map((l) => l.value),
        deprecated: deprecatedOf(def.directives),
        directives: appliedIn(def),
      });
      continue;
    }
    const kind = KIND[def.kind];
    if (!kind) throw new Error(`unexpected definition ${def.kind}`);
    places.set(def, { place: "type" });
    const specifiedBy = def.directives?.find((d) => d.name.value === "specifiedBy");
    types.push({
      kind,
      name: def.name.value,
      description: opt(def.description?.value),
      fields:
        kind === "INPUT_OBJECT"
          ? []
          : (def.fields ?? []).map((f) => {
              places.set(f, { place: "field" });
              return {
                name: f.name.value,
                description: opt(f.description?.value),
                args: (f.arguments ?? []).map((a) => inputValue(a, "arg", def.name.value)),
                type: typeRefOf(f.type),
                deprecated: deprecatedOf(f.directives),
              };
            }),
      interfaces: (def.interfaces ?? []).map((i) => i.name.value),
      members: (def.types ?? []).map((t) => t.name.value),
      values: (def.values ?? []).map((v) => {
        places.set(v, { place: "enumValue" });
        return { name: v.name.value, description: opt(v.description?.value), deprecated: deprecatedOf(v.directives) };
      }),
      inputFields: kind === "INPUT_OBJECT" ? (def.fields ?? []).map((f) => inputValue(f, "inputField", def.name.value)) : [],
      oneOf: (def.directives ?? []).some((d) => d.name.value === "oneOf"),
      specifiedBy: specifiedBy ? [specifiedBy.arguments.find((a) => a.name.value === "url").value.value] : [],
      directives: appliedIn(def),
    });
  }
  return { data: { description, types, directives, schemaDef, operations }, places };
};

// ---------------------------------------------------------------------------
// graphql-js verdicts

const SDL_RULES = ["UniqueTypeNamesRule", "UniqueFieldDefinitionNamesRule", "UniqueArgumentDefinitionNamesRule", "UniqueEnumValueNamesRule", "UniqueDirectiveNamesRule"];

// Which TypeSystem.tla rule a graphql-js error reports. `kindOf(name)` is
// the kind of the type with that name in the document.
const classify = (error, places, kindOf) => {
  const m = error.message;
  const place = (error.nodes ?? []).map((n) => places.get(n)).find(Boolean);
  const table = [
    [/^There can be only one type named/, "TYPE_NAMES_UNIQUE"],
    [/^Field "(\w+)\.\w+" can only be defined once/, (x) => (kindOf(x[1]) === "INPUT_OBJECT" ? "INPUT_FIELD_NAMES_UNIQUE" : "FIELD_NAMES_UNIQUE")],
    [/^Argument ".*" can only be defined once/, "ARG_NAMES_UNIQUE"],
    [/^Enum value ".*" can only be defined once/, "ENUM_VALUES_UNIQUE"],
    [/^There can be only one directive named/, "DIRECTIVE_NAMES_UNIQUE"],
    [/^Query root type must be provided/, "QUERY_ROOT_PROVIDED"],
    [/^\w+ root type must be Object type/, "ROOT_TYPES_ARE_OBJECTS"],
    [/^All root types must be different/, "ROOT_TYPES_DIFFERENT"],
    [/^Directive @\w+ must include 1 or more locations/, "DIRECTIVE_LOCATIONS_DEFINED"],
    [
      /^Name ".*" must not begin with "__"/,
      () =>
        ({
          type: "TYPE_NAME_RESERVED",
          field: "FIELD_NAME_RESERVED",
          arg: "ARG_NAME_RESERVED",
          inputField: "INPUT_FIELD_NAME_RESERVED",
          enumValue: "ENUM_VALUE_NAME_RESERVED",
          directive: "DIRECTIVE_NAME_RESERVED",
        })[place?.place],
    ],
    [/^The type of .*\(\w+:\) must be Input Type/, "ARG_INPUT_TYPE"],
    [/^The type of .* must be Input Type/, "INPUT_FIELD_INPUT_TYPE"],
    [/^The type of .* must be Output Type/, "FIELD_OUTPUT_TYPE"],
    [/^Required argument .* cannot be deprecated/, "REQUIRED_ARG_NOT_DEPRECATED"],
    [/^Required input field .* cannot be deprecated/, "REQUIRED_INPUT_FIELD_NOT_DEPRECATED"],
    [/^(\w+)\.\w+\(\w+:\) has invalid default value/, (x) => (kindOf(x[1]) === "OBJECT" ? "ARG_DEFAULT_COMPATIBLE" : "DEFAULT_NOT_IN_DRAFT")],
    [/^(@\w+\(\w+:\)|\w+\.\w+) has invalid default value/, "DEFAULT_NOT_IN_DRAFT"],
    [/^Type \w+ must define one or more fields/, "FIELDS_DEFINED"],
    [/^Type .* must only implement Interface types/, "IMPLEMENTS_INTERFACES"],
    [/^Type \w+ cannot implement itself/, "IMPLEMENTS_ITSELF"],
    [/^Type \w+ can only implement \w+ once/, "IMPLEMENTS_UNIQUE"],
    [/^Type \w+ cannot implement \w+ because it would create a circular reference/, "IMPL_TRANSITIVE"],
    [/^Type \w+ must implement \w+ because it is implemented by/, "IMPL_TRANSITIVE"],
    [/^Interface field argument .* expected but/, "IMPL_ARG_PROVIDED"],
    [/^Interface field argument .* expects type/, "IMPL_ARG_INVARIANT"],
    [/^Interface field .* expected but/, "IMPL_FIELD_PROVIDED"],
    [/^Interface field .* expects type/, "IMPL_FIELD_COVARIANT"],
    [/^Object field .* includes required argument/, "IMPL_EXTRA_ARG_OPTIONAL"],
    [/^Argument ".*" must not be required type/, "IMPL_EXTRA_ARG_OPTIONAL"],
    [/^Interface field .* is not deprecated, so implementation field/, "IMPL_DEPRECATION"],
    [/^Union type \w+ must define one or more member types/, "UNION_MEMBERS_DEFINED"],
    [/^Union type \w+ can only include type \w+ once/, "UNION_MEMBERS_UNIQUE"],
    [/^Union type \w+ can only include Object types/, "UNION_MEMBERS_OBJECTS"],
    [/^Enum type \w+ must define one or more values/, "ENUM_VALUES_DEFINED"],
    [/^Input Object type \w+ must define one or more fields/, "INPUT_FIELDS_DEFINED"],
    [/^OneOf input field .* must be nullable/, "ONEOF_FIELD_NULLABLE"],
    [/^OneOf input field .* cannot have a default value/, "ONEOF_FIELD_NO_DEFAULT"],
    [/^Cannot reference Input Object .* within itself through a series of non-null fields/, "INPUT_OBJECT_UNBREAKABLE_CYCLE"],
    [/^Input Object \w+ cannot be provided a finite value/, "INPUT_OBJECT_UNBREAKABLE_CYCLE"],
    [/^Invalid circular reference\. The default value of Input Object field/, "INPUT_OBJECT_DEFAULT_VALUE_CYCLE"],
  ];
  for (const [pattern, rule] of table) {
    const match = m.match(pattern);
    if (match) {
      const result = typeof rule === "function" ? rule(match) : rule;
      if (result) return result;
    }
  }
  return undefined;
};

const INTROSPECTION_OPTIONS = {
  descriptions: true,
  specifiedByUrl: true,
  directiveIsRepeatable: true,
  schemaDescription: true,
  inputValueDeprecation: true,
  experimentalDirectiveDeprecation: true,
  oneOf: true,
};

const runVersion = ({ graphql, validateSDL }, sdl) => {
  let doc;
  try {
    doc = graphql.parse(sdl);
  } catch (error) {
    return { ran: false, reason: `parse: ${error.message}` };
  }
  const { data, places } = schemaDataOf(doc);
  const kindOf = (name) => data.types.find((t) => t.name === name)?.kind;
  const errors = [...validateSDL(doc, undefined, SDL_RULES.map((r) => graphql[r]))];
  let schema;
  try {
    schema = graphql.buildASTSchema(doc, { assumeValidSDL: true });
    errors.push(...graphql.validateSchema(schema));
  } catch (error) {
    return { ran: true, data, rules: ["BUILD_THREW"], messages: [error.message], unclassified: [] };
  }
  const rules = new Set();
  const unclassified = [];
  for (const error of errors) {
    const rule = classify(error, places, kindOf);
    if (rule) rules.add(rule);
    else unclassified.push(error.message);
  }
  const result = { ran: true, data, rules: [...rules].sort(), messages: errors.map((e) => e.message), unclassified };
  if (errors.length === 0) {
    const query = graphql.getIntrospectionQuery(INTROSPECTION_OPTIONS);
    result.introspection = [true, false].map((includeDeprecated) => {
      const source = includeDeprecated ? query : query.replaceAll("(includeDeprecated: true)", "");
      const response = graphql.graphqlSync({ schema, source });
      if (response.errors) throw new Error(`introspection failed: ${response.errors.map((e) => e.message).join("; ")}`);
      return { includeDeprecated, schema: response.data.__schema };
    });
  }
  return result;
};

// ---------------------------------------------------------------------------
// Introspection results as Introspection.tla data

const BUILTIN_DIRECTIVES = new Set(["skip", "include", "deprecated", "specifiedBy", "oneOf"]);
const isBuiltinType = (name) => name.startsWith("__") || ["Int", "Float", "String", "Boolean", "ID"].includes(name);

const need = (obj, key) => {
  if (!(key in obj)) throw new Error(`introspection result has no ${key}`);
  return obj[key];
};
const optList = (v, f) => (v === null ? [] : [v.map(f)]);
const refOf = (t) => {
  const out = [];
  for (let node = t; node; node = node.ofType ?? null) out.push({ kind: need(node, "kind"), name: opt(need(node, "name")) });
  return out;
};
const inputValueOf = (graphql) => (v) => ({
  name: need(v, "name"),
  description: opt(need(v, "description")),
  type: refOf(need(v, "type")),
  defaultValue: need(v, "defaultValue") === null ? [] : [valueOf(graphql.parseValue(v.defaultValue))],
  isDeprecated: need(v, "isDeprecated"),
  deprecationReason: opt(need(v, "deprecationReason")),
});
const typeOf = (graphql) => (t) => ({
  kind: need(t, "kind"),
  name: opt(need(t, "name")),
  description: opt(need(t, "description")),
  specifiedByURL: opt(need(t, "specifiedByURL")),
  isOneOf: opt(need(t, "isOneOf")),
  fields: optList(need(t, "fields"), (f) => ({
    name: need(f, "name"),
    description: opt(need(f, "description")),
    args: need(f, "args").map(inputValueOf(graphql)),
    type: refOf(need(f, "type")),
    isDeprecated: need(f, "isDeprecated"),
    deprecationReason: opt(need(f, "deprecationReason")),
  })),
  inputFields: optList(need(t, "inputFields"), inputValueOf(graphql)),
  interfaces: optList(need(t, "interfaces"), refOf),
  enumValues: optList(need(t, "enumValues"), (v) => ({
    name: need(v, "name"),
    description: opt(need(v, "description")),
    isDeprecated: need(v, "isDeprecated"),
    deprecationReason: opt(need(v, "deprecationReason")),
  })),
  possibleTypes: optList(need(t, "possibleTypes"), refOf),
});
const directiveOf = (graphql) => (d) => ({
  name: need(d, "name"),
  description: opt(need(d, "description")),
  isRepeatable: need(d, "isRepeatable"),
  locations: need(d, "locations"),
  args: need(d, "args").map(inputValueOf(graphql)),
  isDeprecated: need(d, "isDeprecated"),
  deprecationReason: opt(need(d, "deprecationReason")),
});

// `full` keeps the built-in types and directives; otherwise only their
// names are kept.
const actualOf = (graphql, s, full) => {
  const types = need(s, "types").map(typeOf(graphql));
  const directives = need(s, "directives").map(directiveOf(graphql));
  return {
    description: opt(need(s, "description")),
    queryType: opt(need(s, "queryType") && refOf(s.queryType)),
    mutationType: opt(need(s, "mutationType") && refOf(s.mutationType)),
    subscriptionType: opt(need(s, "subscriptionType") && refOf(s.subscriptionType)),
    types: full ? types : types.filter((t) => !isBuiltinType(t.name[0])),
    builtinTypeNames: new Set(types.map((t) => t.name[0]).filter(isBuiltinType)),
    directives: full ? directives : directives.filter((d) => !BUILTIN_DIRECTIVES.has(d.name)),
    builtinDirectiveNames: new Set(directives.map((d) => d.name).filter((n) => BUILTIN_DIRECTIVES.has(n))),
  };
};

// ---------------------------------------------------------------------------
// TLA+ text

const tla = (v) => {
  if (v instanceof Set) return `{${[...v].sort().map(tla).join(", ")}}`;
  if (Array.isArray(v)) return `<<${v.map(tla).join(", ")}>>`;
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object") return `[${Object.entries(v).map(([k, x]) => `${k} |-> ${tla(x)}`).join(", ")}]`;
  throw new Error(`can't write ${v}`);
};

// A long sequence as definitions of short ones, joined: tla-ts's parser
// overflows the stack on a definition with thousands of nested records.
const chunked = (name, items) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += 20) chunks.push(tla(items.slice(i, i + 20)));
  if (chunks.length === 0) return `${name} == <<>>`;
  return [
    ...chunks.map((c, i) => `${name}${i} == ${c}`),
    `${name} == ${chunks.map((_, i) => `${name}${i}`).join(" \\o ")}`,
  ].join("\n\n");
};

const builtinsFor = (version, skip) =>
  INTROSPECTION_DEVIATIONS.reduce(
    (acc, d, i) => (d.versions.includes(version) && i !== skip ? d.patch(acc) : acc),
    "SpecBuiltins",
  );

const expectedVerdictFor = (version, skip) => {
  const devs = VALIDATION_DEVIATIONS.map((d, i) => ({ ...d, i })).filter((d) => d.versions.includes(version) && d.i !== skip);
  const removed = devs.filter((d) => d.rule && d.rule !== "DEFAULT_NOT_IN_DRAFT").map((d) => d.rule);
  const added = devs.filter((d) => d.model).map((d) => `(IF ${d.model} THEN {${JSON.stringify(d.rule)}} ELSE {})`);
  const schema = devs.find((d) => d.transform)?.transform ?? "S";
  const verdict = `(Verdict(${schema}) \\ ${tla(new Set(removed))})${added.map((a) => ` \\cup ${a}`).join("")}`;
  const crashes = devs.filter((d) => d.crash).map((d) => d.crash);
  return crashes.length ? `IF ${crashes.join(" \\/ ")} THEN {"BUILD_THREW"} ELSE ${verdict}` : verdict;
};

const moduleText = (cases, intro, controls, introControls) => `---- MODULE DifferentialTypeSystem ----
EXTENDS Introspection

-----------------------------------------------------------------------------
(* What graphql-js does instead, where it departs from the draft *)

\\* Both models run the reference's InputObjectHasUnbreakableCycle on an
\\* edited schema, so that a bug in the reference shows up in them too.
EditInputObjects(S, Edit(_)) ==
  [S EXCEPT !.types = [i \\in DOMAIN @ |-> IF @[i].kind = "INPUT_OBJECT" THEN Edit(@[i]) ELSE @[i]]]
SomeUnbreakableCycle(S) == \\E T \\in InputObjects(S) : ~HasNoUnbreakableCycle(S, T)

\\* graphql-js 16: "Cannot reference Input Object within itself through a
\\* series of non-null fields". Every input object counts as a plain one,
\\* OneOf or not.
NonNullCycle16(S) == SomeUnbreakableCycle(EditInputObjects(S, LAMBDA T : [T EXCEPT !.oneOf = FALSE]))

\\* graphql-js 17: a OneOf input object with no fields, or with a Non-Null
\\* field, has a finite value: it counts as a plain input object with no
\\* fields.
FiniteOneOf17(T) == T.oneOf /\\ (T.inputFields = <<>> \\/ \\E k \\in DOMAIN T.inputFields : IsNonNull(T.inputFields[k].type))
Cycle17(S) ==
  SomeUnbreakableCycle(EditInputObjects(S, LAMBDA T :
    IF FiniteOneOf17(T) THEN [T EXCEPT !.oneOf = FALSE, !.inputFields = <<>>] ELSE T))

\\* Both versions coerce or validate every default value while building the
\\* schema, and throw when a literal has a non-null value for a position whose
\\* type is an output type.
RECURSIVE ReachesOutputType(_, _, _)
ReachesOutputType(S, type, v) ==
  IF v.kind = "null" THEN FALSE
  ELSE IF IsNonNull(type) THEN ReachesOutputType(S, OfType(type), v)
  ELSE IF IsList(type)
  THEN IF v.kind = "list"
       THEN \\E i \\in DOMAIN v.items : ReachesOutputType(S, OfType(type), v.items[i])
       ELSE ReachesOutputType(S, OfType(type), v)
  ELSE CASE KindOf(S, type) \\in {"OBJECT", "INTERFACE", "UNION"} -> TRUE
         [] KindOf(S, type) = "INPUT_OBJECT" /\\ v.kind = "object" ->
              \\E f \\in Range(TypeNamed(S, type.name).inputFields) :
                HasEntry(v, f.name) /\\ ReachesOutputType(S, f.type, Entry(v, f.name).value)
         [] OTHER -> FALSE
AllInputValues(S) ==
  UNION {Range(T.inputFields) \\cup UNION {Range(T.fields[k].args) : k \\in DOMAIN T.fields} : T \\in Range(S.types)}
  \\cup UNION {Range(S.directives[i].args) : i \\in DOMAIN S.directives}
OutputTypedDefault(S) ==
  \\E v \\in AllInputValues(S) : v.default # <<>> /\\ ReachesOutputType(S, v.type, v.default[1])

\\* graphql-js 17 adds a root type to the "different" check only once it is
\\* known to be an object type.
RootObjectsAreDifferent17(S) ==
  \\A k, l \\in DOMAIN Operations :
    LET a == RootTypeName(S, Operations[k])
        b == RootTypeName(S, Operations[l])
    IN (k # l /\\ a # <<>> /\\ b # <<>> /\\ TypeNamed(S, a[1]).kind = "OBJECT") => a # b

\\* graphql-js 16 keeps a default only as its coerced value (valueFromAST),
\\* which is undefined when the default doesn't coerce. valueFromAST differs
\\* from CoerceLiteral in two ways: it ignores fields an input object doesn't
\\* define, and it fills a missing field with that field's coerced default,
\\* so a field whose default doesn't coerce counts as having none.
RECURSIVE Coerce16(_, _, _, _), Items16(_, _, _, _, _), Fields16(_, _, _, _, _, _)
Coerce16(S, type, v, fuel) ==
  IF fuel = 0 THEN Fail
  ELSE IF v.kind = "null" THEN IF IsNonNull(type) THEN Fail ELSE Ok(NullValue)
  ELSE IF IsNonNull(type) THEN Coerce16(S, OfType(type), v, fuel)
  ELSE IF IsList(type)
  THEN IF v.kind = "list" THEN Items16(S, OfType(type), v.items, 1, fuel - 1)
       ELSE LET item == Coerce16(S, OfType(type), v, fuel - 1) IN
            IF item.ok THEN Ok(Value("list", "", <<item.value>>, <<>>)) ELSE Fail
  ELSE
    LET def == TypeNamed(S, type.name) IN
    CASE def.kind = "SCALAR" -> CoerceScalar(type.name, v)
      [] def.kind = "ENUM" ->
           IF v.kind = "enum" /\\ v.text \\in Range(NamesOf(def.values)) THEN Ok(v) ELSE Fail
      [] def.kind = "INPUT_OBJECT" ->
           IF v.kind # "object" THEN Fail
           ELSE LET r == Fields16(S, def, v, 1, <<>>, fuel - 1) IN
                IF ~r.ok THEN Fail
                ELSE IF def.oneOf /\\ (Len(r.value.fields) # 1 \\/ r.value.fields[1].value.kind = "null")
                THEN Fail
                ELSE r
      [] OTHER -> Fail
Items16(S, itemType, items, i, fuel) ==
  IF i > Len(items) THEN Ok(Value("list", "", <<>>, <<>>))
  ELSE LET item == Coerce16(S, itemType, items[i], fuel)
           rest == Items16(S, itemType, items, i + 1, fuel)
       IN IF item.ok /\\ rest.ok
          THEN Ok(Value("list", "", <<item.value>> \\o rest.value.items, <<>>)) ELSE Fail
Fields16(S, def, v, i, acc, fuel) ==
  IF i > Len(def.inputFields) THEN Ok(Value("object", "", <<>>, acc))
  ELSE
    LET f == def.inputFields[i]
        next(entries) == Fields16(S, def, v, i + 1, entries, fuel)
    IN IF HasEntry(v, f.name)
       THEN LET c == Coerce16(S, f.type, Entry(v, f.name).value, fuel) IN
            IF c.ok THEN next(Append(acc, [name |-> f.name, value |-> c.value])) ELSE Fail
       ELSE LET d == IF f.default = <<>> THEN Fail ELSE Coerce16(S, f.type, f.default[1], fuel) IN
            IF d.ok THEN next(Append(acc, [name |-> f.name, value |-> d.value]))
            ELSE IF IsNonNull(f.type) THEN Fail
            ELSE next(acc)

\\* graphql-js 16 coerces an input field's default while building the input
\\* object's fields, and that coercion (valueFromAST) builds the fields of
\\* every input object the literal has an object value for, in order, until
\\* a part of it fails to coerce. A cycle in that relation recurses without
\\* end. Touched16 is the input objects whose fields one coercion builds.
RECURSIVE Touched16(_, _, _), TouchedItems16(_, _, _, _), TouchedFields16(_, _, _, _)
Touched16(S, type, v) ==
  IF v.kind = "null" THEN {}
  ELSE IF IsNonNull(type) THEN Touched16(S, OfType(type), v)
  ELSE IF IsList(type)
  THEN IF v.kind = "list" THEN TouchedItems16(S, OfType(type), v.items, 1)
       ELSE Touched16(S, OfType(type), v)
  ELSE IF KindOf(S, type) = "INPUT_OBJECT" /\\ v.kind = "object"
  THEN {type.name} \\cup TouchedFields16(S, TypeNamed(S, type.name), v, 1)
  ELSE {}
TouchedItems16(S, itemType, items, i) ==
  IF i > Len(items) THEN {}
  ELSE Touched16(S, itemType, items[i])
       \\cup (IF Coerce16(S, itemType, items[i], Fuel).ok THEN TouchedItems16(S, itemType, items, i + 1) ELSE {})
TouchedFields16(S, def, v, i) ==
  IF i > Len(def.inputFields) THEN {}
  ELSE
    LET f == def.inputFields[i] IN
    IF HasEntry(v, f.name)
    THEN Touched16(S, f.type, Entry(v, f.name).value)
         \\cup (IF Coerce16(S, f.type, Entry(v, f.name).value, Fuel).ok
              THEN TouchedFields16(S, def, v, i + 1) ELSE {})
    ELSE IF (f.default # <<>> /\\ Coerce16(S, f.type, f.default[1], Fuel).ok) \\/ ~IsNonNull(f.type)
    THEN TouchedFields16(S, def, v, i + 1)
    ELSE {}
DefaultEdges16(S, name) ==
  UNION {Touched16(S, f.type, f.default[1]) :
           f \\in {g \\in Range(TypeNamed(S, name).inputFields) : g.default # <<>>}}
RECURSIVE DefaultReach16(_, _, _)
DefaultReach16(S, frontier, seen) ==
  IF frontier = {} THEN seen
  ELSE LET next == UNION {DefaultEdges16(S, n) : n \\in frontier} \\ seen IN
       DefaultReach16(S, next, seen \\cup next)
DefaultTypeCycle16(S) ==
  \\E T \\in InputObjects(S) :
    T.name \\in DefaultReach16(S, DefaultEdges16(S, T.name), DefaultEdges16(S, T.name))

MapDefaults16(S, F(_)) ==
  [S EXCEPT
     !.types = [i \\in DOMAIN S.types |->
                 [S.types[i] EXCEPT
                    !.fields = [j \\in DOMAIN S.types[i].fields |->
                                 [S.types[i].fields[j] EXCEPT !.args = [k \\in DOMAIN @ |-> F(@[k])]]],
                    !.inputFields = [k \\in DOMAIN @ |-> F(@[k])]]],
     !.directives = [i \\in DOMAIN S.directives |->
                      [S.directives[i] EXCEPT !.args = [k \\in DOMAIN @ |-> F(@[k])]]]]
CoercibleDefaults16(S) ==
  MapDefaults16(S, LAMBDA v :
    IF v.default # <<>> /\\ ~Coerce16(S, v.type, v.default[1], Fuel).ok
    THEN [v EXCEPT !.default = <<>>] ELSE v)

PatchArgs(args, argName, type) ==
  [j \\in DOMAIN args |-> IF args[j].name = argName THEN [args[j] EXCEPT !.type = type] ELSE args[j]]
PatchDirectiveArg(B, name, argName, type) ==
  LET ds == B.directives IN
  [B EXCEPT !.directives = [i \\in DOMAIN ds |->
     IF ds[i].name = name THEN [ds[i] EXCEPT !.args = PatchArgs(ds[i].args, argName, type)] ELSE ds[i]]]
PatchFields(fields, fieldName, argName, type) ==
  [j \\in DOMAIN fields |->
     IF fields[j].name = fieldName THEN [fields[j] EXCEPT !.args = PatchArgs(fields[j].args, argName, type)]
     ELSE fields[j]]
PatchFieldArg(B, typeName, fieldName, argName, type) ==
  LET ts == B.types IN
  [B EXCEPT !.types = [i \\in DOMAIN ts |->
     IF ts[i].name # typeName THEN ts[i]
     ELSE [ts[i] EXCEPT !.fields = PatchFields(ts[i].fields, fieldName, argName, type)]]]
AddEnumValue(B, typeName, valueName, after) ==
  LET ts == B.types IN
  [B EXCEPT !.types = [i \\in DOMAIN ts |->
     IF ts[i].name # typeName THEN ts[i]
     ELSE [ts[i] EXCEPT !.values = SubSeq(ts[i].values, 1, after)
             \\o <<[name |-> valueName, description |-> AnyDescription, deprecated |-> <<>>]>>
             \\o SubSeq(ts[i].values, after + 1, Len(ts[i].values))]]]

${VERSIONS.map(({ key }) => `Expected_${key}(S) == ${expectedVerdictFor(key)}`).join("\n")}
${VALIDATION_DEVIATIONS.map((d, i) => d.versions.map((v) => `ExpectedWithout${i}_${v}(S) == ${expectedVerdictFor(v, i)}`).join("\n")).join("\n")}

${VERSIONS.map(({ key }) => `Builtins_${key} == ${builtinsFor(key)}`).join("\n")}
${INTROSPECTION_DEVIATIONS.map((d, i) => d.versions.map((v) => `BuiltinsWithout${i}_${v} == ${builtinsFor(v, i)}`).join("\n")).join("\n")}

-----------------------------------------------------------------------------

\\* One case per schema: its data, and per version whether graphql-js could
\\* parse it and the rules its errors report.
${chunked("Cases", cases)}

\\* One case per (schema, version, includeDeprecated) graphql-js found valid.
${chunked("Intro", intro)}

Controls == ${tla(controls)}
IntroControls == ${tla(introControls)}

Verdicts == [i \\in DOMAIN Cases |-> Verdict(Cases[i].schema)]

ExpectedFor(c, v) == ${VERSIONS.map(({ key }) => `IF v = "${key}" THEN Expected_${key}(c.schema) ELSE`).join(" ")} {}
Agrees(c) == \\A v \\in {"v16", "v17"} : c[v].ran => c[v].rules = ExpectedFor(c, v)

BuiltinsFor(v) == ${VERSIONS.map(({ key }) => `IF v = "${key}" THEN Builtins_${key} ELSE`).join(" ")} SpecBuiltins
\\* Only schemas valid by the draft, whose defaults all coerce: the draft
\\* doesn't require an input field's default to be valid, but a service can't
\\* print the value of one that isn't.
IntroOk(c, B) ==
  IsValidSchema(c.schema) /\\ OtherDefaultsAreCompatible(c.schema) =>
    Matches(c.schema, B, c.includeDeprecated, c.full, c.actual)

Invalid == {i \\in DOMAIN Cases : ~Agrees(Cases[i])}
Accepted == {i \\in DOMAIN Controls : Agrees(Controls[i])}
IntroInvalid == {i \\in DOMAIN Intro : ~IntroOk(Intro[i], BuiltinsFor(Intro[i].version))}
IntroAccepted == {i \\in DOMAIN IntroControls : IntroOk(IntroControls[i], BuiltinsFor(IntroControls[i].version))}

\\* How often each documented deviation decides a case: with it left out,
\\* that many cases would fail.
Exercised == <<${[
  ...VALIDATION_DEVIATIONS.flatMap((d, i) =>
    d.versions.map(
      (v) => `Cardinality({j \\in DOMAIN Cases : Cases[j].${v}.ran /\\ Cases[j].${v}.rules # ExpectedWithout${i}_${v}(Cases[j].schema)})`,
    ),
  ),
  ...INTROSPECTION_DEVIATIONS.flatMap((d, i) =>
    d.versions.map(
      (v) => `Cardinality({j \\in DOMAIN Intro : Intro[j].version = "${v}" /\\ ~IntroOk(Intro[j], BuiltinsWithout${i}_${v})})`,
    ),
  ),
].join(",\n  ")}>>

RuleCounts == [r \\in Rules |-> Cardinality({i \\in DOMAIN Cases : r \\in Verdicts[i]})]
ValidCount == Cardinality({i \\in DOMAIN Cases : Verdicts[i] = {}})

ASSUME PrintT(<<"invalid", Invalid>>)
ASSUME PrintT(<<"expected", [i \\in Invalid |-> <<Expected_v16(Cases[i].schema), Expected_v17(Cases[i].schema), Verdicts[i]>>]>>)
ASSUME PrintT(<<"accepted controls", Accepted>>)
ASSUME PrintT(<<"introspection invalid", IntroInvalid>>)
ASSUME PrintT(<<"introspection accepted controls", IntroAccepted>>)
ASSUME PrintT(<<"mismatches", [i \\in IntroInvalid |-> Mismatches(Intro[i].schema, BuiltinsFor(Intro[i].version), Intro[i].includeDeprecated, Intro[i].full, Intro[i].actual)]>>)
ASSUME PrintT(<<"exercised", Exercised>>)
ASSUME PrintT(<<"rules", RuleCounts>>)
ASSUME PrintT(<<"valid", ValidCount>>)

VARIABLE done
Init == done = FALSE
Next == UNCHANGED done

\\* State-level, so that tla-ts evaluates the ASSUMEs above before them.
EveryVerdictAgrees == ~done => Invalid = {}
EveryControlIsRejected == ~done => Accepted = {}
EveryIntrospectionMatches == ~done => IntroInvalid = {}
EveryIntrospectionControlIsRejected == ~done => IntroAccepted = {}
====
`;

// ---------------------------------------------------------------------------
// Negative controls

const RULES_FOR_CONTROLS = ["FIELD_OUTPUT_TYPE", "IMPL_FIELD_COVARIANT", "UNION_MEMBERS_OBJECTS"];

const validationControls = (cases) => {
  const out = [];
  const withRule = cases.find((c) => c.v17.ran && c.v17.rules.size > 0);
  if (withRule) {
    const rules = [...withRule.v17.rules];
    out.push({ name: "graphql-js reports one rule fewer", c: { ...withRule, v17: { ...withRule.v17, rules: new Set(rules.slice(1)) } } });
    out.push({ name: "rules are attributed to the wrong rule", c: { ...withRule, v17: { ...withRule.v17, rules: new Set(rules.map(() => "FIELDS_DEFINED")) } } });
  }
  const valid = cases.find((c) => c.v16.ran && c.v16.rules.size === 0);
  if (valid) {
    for (const rule of RULES_FOR_CONTROLS) {
      out.push({ name: `a valid schema reported as breaking ${rule}`, c: { ...valid, v16: { ...valid.v16, rules: new Set([rule]) } } });
    }
  }
  return out;
};

const clone = (x) => (x instanceof Set ? new Set(x) : Array.isArray(x) ? x.map(clone) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, clone(v)])) : x);

const introspectionControls = (intro) => {
  const out = [];
  // Every control starts from the hand-written schema that exercises the
  // most of introspection, which is valid.
  const add = (name, find, change) => {
    const c = intro.find((x) => x.index === RICH && find(x));
    if (!c) throw new Error(`no case for control: ${name}`);
    const copy = clone(c);
    change(copy.actual);
    out.push({ name, c: copy });
  };
  const userType = (pred) => (c) => c.actual.types.some(pred);
  const withFields = (n) => (t) => t.fields.length === 1 && t.fields[0].length >= n;
  add("reorders an object's fields", userType(withFields(2)), (a) => {
    const t = a.types.find(withFields(2));
    t.fields[0].reverse();
  });
  add("drops an enum value", userType((t) => t.enumValues.length === 1 && t.enumValues[0].length >= 1), (a) => {
    a.types.find((t) => t.enumValues.length === 1 && t.enumValues[0].length >= 1).enumValues[0].pop();
  });
  add("loses a Non-Null wrapper", userType(withFields(1)), (a) => {
    const f = a.types.find(withFields(1)).fields[0][0];
    f.type = f.type[0].kind === "NON_NULL" ? f.type.slice(1) : [{ kind: "NON_NULL", name: [] }, ...f.type];
  });
  add("drops a type", (c) => c.actual.types.length > 1, (a) => a.types.pop());
  add("reports a deprecated field as not deprecated", (c) => c.includeDeprecated && c.actual.types.some((t) => t.fields[0]?.some((f) => f.isDeprecated)), (a) => {
    const f = a.types.flatMap((t) => t.fields[0] ?? []).find((f) => f.isDeprecated);
    f.isDeprecated = false;
  });
  add("returns a deprecated field when includeDeprecated is false", (c) => !c.includeDeprecated && c.actual.types.some((t) => (t.fields[0]?.length ?? 0) > 0), (a) => {
    const t = a.types.find((t) => (t.fields[0]?.length ?? 0) > 0);
    t.fields[0].push({ ...clone(t.fields[0][0]), name: "hidden", isDeprecated: true, deprecationReason: ["old"] });
  });
  add("changes a default value", (c) => c.actual.types.some((t) => t.fields[0]?.some((f) => f.args.some((x) => x.defaultValue.length && x.type.at(-1).name[0] === "Int"))), (a) => {
    const arg = a.types.flatMap((t) => t.fields[0] ?? []).flatMap((f) => f.args).find((x) => x.defaultValue.length && x.type.at(-1).name[0] === "Int");
    arg.defaultValue = [{ kind: "int", text: "12345", items: [], fields: [] }];
  });
  add("reorders a union's possible types", userType((t) => t.kind === "UNION" && t.possibleTypes[0].length >= 2), (a) => {
    a.types.find((t) => t.kind === "UNION" && t.possibleTypes[0].length >= 2).possibleTypes[0].reverse();
  });
  add("gives an object possibleTypes", userType((t) => t.kind === "OBJECT"), (a) => {
    a.types.find((t) => t.kind === "OBJECT").possibleTypes = [[]];
  });
  add("lists __typename as a field", userType((t) => t.kind === "OBJECT"), (a) => {
    a.types.find((t) => t.kind === "OBJECT").fields[0].push({ name: "__typename", description: [], args: [], type: [{ kind: "NON_NULL", name: [] }, { kind: "SCALAR", name: ["String"] }], isDeprecated: false, deprecationReason: [] });
  });
  add("drops a built-in scalar it references", (c) => c.actual.builtinTypeNames.has("Int"), (a) => a.builtinTypeNames.delete("Int"));
  add("adds a built-in scalar nothing references", (c) => !c.actual.builtinTypeNames.has("Float"), (a) => a.builtinTypeNames.add("Float"));
  add("drops isOneOf", userType((t) => t.kind === "INPUT_OBJECT" && t.isOneOf[0] === true), (a) => {
    a.types.find((t) => t.kind === "INPUT_OBJECT" && t.isOneOf[0] === true).isOneOf = [false];
  });
  add("drops specifiedByURL", userType((t) => t.specifiedByURL.length === 1), (a) => {
    a.types.find((t) => t.specifiedByURL.length === 1).specifiedByURL = [];
  });
  add("changes a built-in directive's locations", (c) => c.full, (a) => {
    a.directives.find((d) => d.name === "skip").locations.pop();
  });
  add("changes an introspection field's type", (c) => c.full, (a) => {
    const f = a.types.find((t) => t.name[0] === "__Type").fields[0].find((x) => x.name === "fields");
    f.type = f.type.slice(1);
  });
  return out;
};

// ---------------------------------------------------------------------------
// Running tla-ts, in batches of schemas: a module with thousands of schemas
// is slow to parse and overflows tla-ts's parser stack.

const BATCH = 120;

const runTla = (dir) =>
  new Promise((done) => {
    // tla-ts's parser recurses deeply on large modules.
    const child = spawn(process.execPath, ["--stack-size=3000", cli, "-workers", "1", "DifferentialTypeSystem.tla"], { cwd: dir });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (status) => done({ status, output }));
  });

const pool = async (items, worker, lanes = Math.max(1, Math.floor(availableParallelism() / 2))) => {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(lanes, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i], i);
      }
    }),
  );
  return results;
};

const indices = (output, label) => {
  const m = output.match(new RegExp(`<< ?"${label}", \\{([^}]*)\\} ?>>`));
  if (!m) return undefined;
  return m[1].split(",").map((s) => Number(s.trim())).filter(Boolean);
};

const runModule = async (moduleSource, files) => {
  const dir = mkdtempSync(join(tmpdir(), "type-system-"));
  try {
    cpSync(join(root, "specs/TypeSystem.tla"), join(dir, "TypeSystem.tla"));
    cpSync(join(root, "specs/Introspection.tla"), join(dir, "Introspection.tla"));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    writeFileSync(join(dir, "DifferentialTypeSystem.tla"), moduleSource);
    writeFileSync(
      join(dir, "DifferentialTypeSystem.cfg"),
      "INIT Init\nNEXT Next\nINVARIANTS EveryVerdictAgrees EveryControlIsRejected EveryIntrospectionMatches EveryIntrospectionControlIsRejected\n",
    );
    const run = await runTla(dir);
    if (process.env.KEEP_TLA) cpSync(dir, process.env.KEEP_TLA, { recursive: true });
    // tla-ts pretty-prints long values over several lines.
    return { status: run.status, output: run.output.replace(/\s+/g, " ") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// Checks every batch, and merges the results, with indices into `cases`
// and `introCases`.
const checkAll = async (batches, files = {}, lanes) => {
  const runs = await pool(batches, (b) => runModule(b.source, files), lanes);
  const merged = { errors: [], invalid: [], introInvalid: [], accepted: [], introAccepted: [], expected: new Map(), mismatches: new Map(), exercised: [], rules: new Map(), valid: 0 };
  runs.forEach(({ status, output }, k) => {
    const b = batches[k];
    const invalid = indices(output, "invalid");
    const introInvalid = indices(output, "introspection invalid");
    if (invalid === undefined || introInvalid === undefined) {
      merged.errors.push(output.match(/Error:.{0,400}/)?.[0] ?? output.slice(-1000));
      return;
    }
    merged.invalid.push(...invalid.map((i) => b.caseIndex[i - 1]));
    merged.introInvalid.push(...introInvalid.map((i) => b.introIndex[i - 1]));
    merged.accepted.push(...indices(output, "accepted controls"));
    merged.introAccepted.push(...indices(output, "introspection accepted controls"));
    for (const m of output.matchAll(/(\d+) :> << ?(\{[^}]*\}), (\{[^}]*\}), (\{[^}]*\}) ?>>/g)) {
      const parse = (x) => [...x.matchAll(/"(\w+)"/g)].map((y) => y[1]);
      merged.expected.set(b.caseIndex[Number(m[1]) - 1], { v16: parse(m[2]), v17: parse(m[3]), spec: parse(m[4]) });
    }
    for (const i of introInvalid) {
      merged.mismatches.set(b.introIndex[i - 1], output.match(new RegExp(`[(@] ${i} :> (\\{[^}]*\\})`))?.[1]);
    }
    const exercised = output.match(/<< ?"exercised", << ?([^>]*?) ?>> ?>>/)?.[1].split(",").map((x) => Number(x.trim())) ?? [];
    exercised.forEach((n, i) => (merged.exercised[i] = (merged.exercised[i] ?? 0) + n));
    for (const m of (output.match(/<< ?"rules", \[([^\]]*)\] ?>>/)?.[1] ?? "").matchAll(/(\w+) \|-> (\d+)/g)) {
      merged.rules.set(m[1], (merged.rules.get(m[1]) ?? 0) + Number(m[2]));
    }
    merged.valid += Number(output.match(/<< ?"valid", (\d+) ?>>/)?.[1] ?? 0);
    if (status !== 0 && invalid.length + introInvalid.length === 0) merged.errors.push(output.match(/Error:.{0,400}/)?.[0]);
  });
  return merged;
};

// ---------------------------------------------------------------------------

const started = Date.now();
const sdls = generate();
const cases = [];
const introCases = [];
const details = [];
const unclassified = [];
for (const [index, sdl] of sdls.entries()) {
  const results = {};
  for (const version of VERSIONS) {
    const result = runVersion(version, sdl);
    results[version.key] = result;
    for (const message of result.unclassified ?? []) unclassified.push({ version: version.key, sdl, message });
  }
  const data = results.v17.data ?? results.v16.data;
  if (!data) throw new Error(`no version could parse:\n${sdl}`);
  const c = { schema: data };
  for (const { key } of VERSIONS) {
    const r = results[key];
    c[key] = { ran: r.ran, rules: new Set(r.ran ? r.rules : []) };
  }
  cases.push(c);
  details.push({ sdl, results });
  for (const { key, graphql } of VERSIONS) {
    for (const { includeDeprecated, schema } of results[key].introspection ?? []) {
      // The built-ins are compared in full for two schemas known to be valid.
      const full = index === 0 || index === RICH;
      introCases.push({ schema: data, version: key, includeDeprecated, full, actual: actualOf(graphql, schema, full), index });
    }
  }
}

if (unclassified.length > 0) {
  for (const u of unclassified.slice(0, 10)) console.log(`✗ unclassified graphql-js ${u.version} error: ${u.message}\n${u.sdl}`);
  process.exit(1);
}

const controls = validationControls(cases);
const introControls = introspectionControls(introCases);
const stripIndex = ({ index, ...rest }) => rest;
const batches = [];
for (let start = 0; start < cases.length; start += BATCH) {
  const caseIndex = cases.map((_, i) => i).slice(start, start + BATCH);
  const introIndex = introCases.map((c, i) => [c, i]).filter(([c]) => c.index >= start && c.index < start + BATCH).map(([, i]) => i);
  const first = start === 0;
  batches.push({
    caseIndex,
    introIndex,
    source: moduleText(
      caseIndex.map((i) => cases[i]),
      introIndex.map((i) => stripIndex(introCases[i])),
      first ? controls.map((x) => x.c) : [],
      first ? introControls.map((x) => stripIndex(x.c)) : [],
    ),
  });
}

const describeVersions = VERSIONS.map(({ key, graphql }) => `${key.replace("v", "graphql-js ")} (${graphql.version})`).join(" and ");
console.log(`  ${sdls.length} schemas (${FIXED.length} hand-written, ${sdls.length - FIXED.length} generated, seed ${SEED}), each on ${describeVersions}`);
console.log(`  ${introCases.length} introspection results, ${controls.length + introControls.length} negative controls, ${batches.length} tla-ts runs`);

if (MUTANTS) {
  const { readFileSync } = await import("node:fs");
  const lists = [
    ...(await import(pathToFileURL(join(root, "specs/typesystem.mutants.mjs")).href)).default,
    ...(await import(pathToFileURL(join(root, "specs/introspection.mutants.mjs")).href)).default,
  ];
  // Each mutant runs the batches in order and stops at the first that
  // catches it; mutants run in parallel.
  const check = async (m) => {
    if (m.differential === false) return { line: `- ${m.file}: ${m.name} → vectors only (${m.why})`, ok: true };
    const text = readFileSync(join(root, "specs", m.file), "utf8");
    if (!text.includes(m.find)) return { line: `✗ ${m.file}: ${m.name}\n    can't find: ${m.find}`, ok: false };
    const files = { [m.file]: text.replace(m.find, m.replace) };
    let error;
    for (const [k, batch] of batches.entries()) {
      const r = await checkAll([batch], files, 1);
      error ??= r.errors[0];
      // A bug that makes the reference stricter shows up as disagreeing
      // verdicts or results; one that makes the comparison looser shows up
      // as an accepted negative control.
      const controlsAccepted = r.accepted.length + r.introAccepted.length;
      if (r.invalid.length + r.introInvalid.length + controlsAccepted > 0) {
        const what = `${r.invalid.length} verdicts, ${r.introInvalid.length} introspection results, ${controlsAccepted} controls`;
        return { line: `✓ ${m.file}: ${m.name} → caught by the differential (batch ${k + 1}: ${what})`, ok: true };
      }
    }
    return { line: `✗ ${m.file}: ${m.name} → not caught by the differential\n    ${error ?? "no case disagrees"}`, ok: false };
  };
  const results = await pool(lists, check, availableParallelism());
  for (const { line } of results) console.log(line);
  const failed = results.filter((x) => !x.ok).length;
  console.log(`  ${((Date.now() - started) / 1000).toFixed(0)}s`);
  process.exit(failed > 0 ? 1 : 0);
}

const r = await checkAll(batches);
let failed = false;
for (const e of r.errors) {
  console.log(`✗ tla-ts: ${e}`);
  failed = true;
}
for (const i of r.invalid.sort((x, y) => x - y)) {
  const d = details[i];
  const e = r.expected.get(i);
  console.log(`✗ graphql-js disagrees with TypeSystem!Verdict on:\n${d.sdl.replace(/^/gm, "      ")}`);
  console.log(`    draft:    ${JSON.stringify(e?.spec)}`);
  for (const { key } of VERSIONS) {
    const res = d.results[key];
    if (!res.ran) continue;
    console.log(`    ${key}: expected ${JSON.stringify(e?.[key])}, got ${JSON.stringify(res.rules)}`);
    if (VERBOSE) for (const m of res.messages) console.log(`        ${m}`);
  }
  failed = true;
}
for (const i of r.introInvalid.sort((x, y) => x - y)) {
  const c = introCases[i];
  console.log(`✗ graphql-js ${c.version} introspection (includeDeprecated: ${c.includeDeprecated}${c.full ? ", full" : ""}) fails Introspection!Matches, in ${r.mismatches.get(i)}, for:\n${details[c.index].sdl.replace(/^/gm, "      ")}`);
  failed = true;
}
for (const i of r.accepted) {
  console.log(`✗ a validation control is accepted: ${controls[i - 1].name}`);
  failed = true;
}
for (const i of r.introAccepted) {
  console.log(`✗ an introspection control is accepted: ${introControls[i - 1].name}`);
  failed = true;
}

const deviations = [
  ...VALIDATION_DEVIATIONS.flatMap((d) => d.versions.map((v) => ({ v, what: `${d.rule ? `${d.rule}: ` : ""}${d.note}` }))),
  ...INTROSPECTION_DEVIATIONS.flatMap((d) => d.versions.map((v) => ({ v, what: d.note }))),
];
console.log(`  deviations from the draft, each still observed:`);
deviations.forEach((d, i) => {
  const n = r.exercised[i] ?? 0;
  console.log(`  ${n > 0 ? "✓" : "✗"} ${d.v.replace("v", "graphql-js ")}: ${d.what} (${n} cases)`);
  if (n === 0) failed = true;
});

const unbroken = [...r.rules].filter(([, n]) => n === 0).map(([rule]) => rule);
console.log(`  ${r.valid} valid schemas; every rule broken by some schema${unbroken.length ? ` except ${unbroken.join(", ")}` : ""}`);
if (VERBOSE) console.log([...r.rules].map(([rule, n]) => `    ${rule}: ${n}`).join("\n"));
if (!failed) {
  console.log(`✓ every graphql-js verdict agrees with TypeSystem!Verdict, rule by rule`);
  console.log(`✓ every introspection result satisfies Introspection!Matches`);
  console.log(`✓ every negative control is rejected (${[...controls, ...introControls].map((c) => c.name).join("; ")})`);
}
console.log(`  ${((Date.now() - started) / 1000).toFixed(0)}s`);
process.exit(failed ? 1 : 0);
