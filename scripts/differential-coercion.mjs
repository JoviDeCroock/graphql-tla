// Checks graphql-js's input coercion against the hand-written TLA+ reference
// in specs/Coercion.tla.
//
// A small schema has one root field per argument type: Int, Int!, Int = 7,
// Float, String, Boolean, ID, an enum, [Int], [Int!]!, [[Int]], an input
// object with required, optional and defaulted fields, a list of them, and a
// nested input object. For every field the script tries:
//
//   - omitting the argument;
//   - every literal in LITERALS;
//   - a variable of the argument's type, missing, null, and set to every
//     JSON value in JSON_VALUES;
//   - a variable with a default, missing, null and set;
//   - for a Non-Null argument, a nullable variable, with and without a
//     default;
//
// plus hand-written cases for variables inside list and object literals,
// several arguments, and variables no field uses. Each operation runs
// through `execute` (no validation) on graphql-js 16 and 17. Each case
// records the response's shape (a "data" entry or not, the field's value,
// the error paths) and the arguments the resolver received. tla-ts then
// checks every case against Coercion!Valid.
//
// Negative controls (a dropped default, null accepted for a Non-Null
// argument, a request error reported as an execution error, ...) must each
// be rejected, so the check can't pass vacuously. Disagreements that are
// understood are listed in KNOWN with the reason, and printed on every run.
// The check fails on any other disagreement, or if a known one goes away.
//
// Usage: node scripts/differential-coercion.mjs [--mutants]
//
//   --mutants  also applies each mutant in specs/coercion.mutants.mjs to a
//              copy of Coercion.tla, and checks that the differential then
//              fails.

import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as graphql16 from "graphql16";
import * as graphql17 from "graphql17";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const cli = join(root, "node_modules/tla-ts/dist/cli.js");
const VERSIONS = [graphql16, graphql17];

const SDL = `
enum Color { RED GREEN BLUE }

input Point {
  x: Int!
  y: Int = 0
  label: String
}

input Shape {
  origin: Point!
  points: [Point!]
  color: Color = RED
  tags: [String!] = "shape"
}

type Query {
  int(v: Int): String
  intNN(v: Int!): String
  intDefault(v: Int = 7): String
  intNNDefault(v: Int! = 7): String
  float(v: Float): String
  string(v: String): String
  boolean(v: Boolean): String
  id(v: ID): String
  color(v: Color): String
  colorDefault(v: Color = GREEN): String
  ints(v: [Int]): String
  intsNN(v: [Int!]!): String
  intsDefault(v: [Int] = 1): String
  matrix(v: [[Int]]): String
  point(v: Point): String
  pointNN(v: Point!): String
  pointDefault(v: Point = { x: 1 }): String
  points(v: [Point!]): String
  shape(v: Shape): String
  pair(a: Int, b: Int! = 2): String
}
`;

// Argument literals, as GraphQL source.
const LITERALS = [
  "null", "0", "1", "-1", "2147483647", "2147483648", "-2147483648", "-2147483649",
  "99999999999999999999", "1.0", "1.5", "-0.25", "1e3", "1e400",
  '"1"', '"abc"', '"RED"', '""',
  "RED", "PURPLE", "true", "false",
  "[]", "[1]", "[1, 2]", "[1, 2, 3]", "[1, null]", "[1, null, 3]", "[null]", '[1, "b"]',
  "[[1], [2, 3]]", '[[1], ["b"]]', "[RED, GREEN]",
  "{ x: 1 }", "{ x: 1, y: 2 }", "{ x: 1, y: null }", "{ y: 2 }", "{ x: null }", "{ x: 1, z: 1 }",
  '{ x: "1" }', '{ x: 1, label: "p" }', "[{ x: 1 }, { x: 2, y: 3 }]", "[{ x: 1 }, null]",
  "{ origin: { x: 1 } }", '{ origin: { x: 1 }, points: { x: 2 }, tags: "a", color: BLUE }',
  "{ origin: { y: 1 } }", '{ origin: { x: 1 }, color: "BLUE" }',
];

// Variable values, as JSON source. Numbers keep their source text.
const JSON_VALUES = [
  "null", "0", "1", "-1", "1.0", "2147483647", "2147483648", "-2147483648", "-2147483649",
  "9007199254740993", "1e21", "1e400", "1.5", "-0.25",
  '"1"', '"abc"', '"RED"', '"PURPLE"', '""', String.raw`"\ud800"`,
  "true", "false",
  "[]", "[1]", "[1, 2]", "[1, 2, 3]", "[1, null]", "[1, null, 3]", "[null]", '[1, "b"]',
  "[[1], [2, 3]]", '[[1], ["b"]]', '["RED", "GREEN"]',
  '{"x": 1}', '{"x": 1, "y": 2}', '{"x": 1, "y": null}', '{"y": 2}', '{"x": null}', '{"x": 1, "z": 1}',
  '{"x": "1"}', '{"x": 1.0}', '{"x": 1, "label": "p"}', '[{"x": 1}, {"x": 2, "y": 3}]', '[{"x": 1}, null]',
  '{"origin": {"x": 1}}', '{"origin": {"x": 1}, "points": {"x": 2}, "tags": "a", "color": "BLUE"}',
  '{"origin": {"y": 1}}', '{"origin": {"x": 1}, "color": "RED"}',
];

// A variable default (a literal) and a provided value (JSON) for each
// single-argument field.
const DEFAULTS = {
  int: ["3", "5"], intNN: ["3", "5"], intDefault: ["3", "5"], intNNDefault: ["3", "5"],
  float: ["2", "2.5"], string: ['"d"', '"s"'], boolean: ["true", "false"], id: ["9", '"s"'],
  color: ["BLUE", '"RED"'], colorDefault: ["BLUE", '"RED"'], ints: ["1", "[2, 3]"],
  intsNN: ["[1, 2]", "3"], intsDefault: ["[4]", "5"], matrix: ["1", "[1, [2]]"],
  point: ["{ x: 5 }", '{"x": 6}'], pointNN: ["{ x: 5 }", '{"x": 6}'],
  pointDefault: ["{ x: 5 }", '{"x": 6}'], points: ["{ x: 5 }", '[{"x": 6}]'],
  shape: ["{ origin: { x: 5 } }", '{"origin": {"x": 6}}'],
};

// Hand-written cases: variables inside literals, several arguments, and
// variables no field uses.
const EXTRA = [
  ["query($x: Int) { ints(v: [1, $x]) }", ["{}", '{"x": null}', '{"x": 2}']],
  ["query($x: Int) { intsNN(v: [1, $x]) }", ["{}", '{"x": null}', '{"x": 2}']],
  ["query($x: Int = 1) { intsNN(v: [1, $x]) }", ["{}", '{"x": null}', '{"x": 2}']],
  ["query($x: Int!) { intsNN(v: [1, $x]) }", ["{}", '{"x": 2}']],
  ["query($x: Int) { matrix(v: [$x, [$x]]) }", ["{}", '{"x": null}', '{"x": 2}']],
  ["query($x: Int) { point(v: { x: $x }) }", ["{}", '{"x": null}', '{"x": 2}']],
  ["query($x: Int!) { point(v: { x: $x }) }", ["{}", '{"x": 2}']],
  ["query($y: Int) { point(v: { x: 1, y: $y }) }", ["{}", '{"y": null}', '{"y": 2}']],
  ["query($y: Int = 4) { point(v: { x: 1, y: $y }) }", ["{}", '{"y": null}']],
  ["query($l: String) { point(v: { x: 1, label: $l }) }", ["{}", '{"l": null}', '{"l": "p"}']],
  ["query($c: Color) { shape(v: { origin: { x: 1 }, color: $c }) }", ["{}", '{"c": null}', '{"c": "BLUE"}']],
  ["query($t: [String!]) { shape(v: { origin: { x: 1 }, tags: $t }) }", ["{}", '{"t": "a"}', '{"t": ["a", "b"]}']],
  ["query($p: Point) { points(v: [$p]) }", ["{}", '{"p": null}', '{"p": {"x": 3}}']],
  ["query($p: Point!) { points(v: [$p, { x: 2 }]) }", ["{}", '{"p": {"x": 3}}', '{"p": {"y": 3}}']],
  ["query($o: Point!) { shape(v: { origin: $o }) }", ["{}", '{"o": {"x": 3}}', '{"o": {"x": 3, "z": 1}}']],
  ["{ pair }", ["{}"]],
  ["{ pair(a: 1) }", ["{}"]],
  ["{ pair(b: null) }", ["{}"]],
  ["query($a: Int, $b: Int!) { pair(a: $a, b: $b) }", ["{}", '{"b": 3}', '{"a": null, "b": 3}', '{"a": 1, "b": null}']],
  ["query($a: Int, $b: Int) { pair(a: $a, b: $b) }", ["{}", '{"b": null}', '{"a": 1, "b": 4}']],
  ["query($x: Int, $unused: Int) { int(v: $x) }", ['{"x": 1, "unused": "bad"}', '{"unused": 2}']],
  ["query($x: Int, $unused: Int!) { int(v: $x) }", ['{"x": 1}']],
  ["query($x: Int = null) { intDefault(v: $x) }", ["{}"]],
  ["query($x: [Int] = 1) { ints(v: $x) }", ["{}"]],
  ["query($x: Point = { x: 1 }) { point(v: $x) }", ["{}"]],
  ["query($x: Shape = { origin: { x: 1 } }) { shape(v: $x) }", ["{}"]],
];

// Disagreements between graphql-js and the reference that are understood.
// Each one is reported on every run, and the check fails if it goes away.
const BOTH = ["16.15.0", "17.1.0"];
const KNOWN = [
  {
    name: "Float accepts a literal too large for a double, as Infinity",
    versions: BOTH,
    match: (c) => c.query === "{ float(v: 1e400) }",
    why:
      "§3.5.2: a value not representable by finite IEEE 754 must raise a request error. Float's parseLiteral (16) " +
      "and coerceInputLiteral (17) return parseFloat(value) with no finiteness check, and validation uses the same " +
      "function, so graphql({ source: '{ float(v: 1e400) }' }) also passes Infinity to the resolver. Variables are " +
      "checked (Number.isFinite).",
  },
  {
    name: "Float rounds an integer literal a double can't hold",
    versions: BOTH,
    match: (c) => c.query === "{ float(v: 99999999999999999999) }",
    why:
      "§3.5.2: an integer is coerced to Float 'by adding an empty fractional part', and 'a value outside the " +
      "available precision' must raise a request error. parseFloat gives 1e20. graphql-js 17 does raise 'value " +
      "would lose precision' for a BigInt variable, just not for a literal. Validation accepts the literal.",
  },
  {
    name: "JSON.parse rounds big integers before graphql-js sees them",
    versions: BOTH,
    match: (c) => /^query\(\$x: (Float|ID)\)/.test(c.query) && /9007199254740993|1e400/.test(c.variables),
    why:
      "Not graphql-js's coercion: JSON.parse turns 9007199254740993 into 9007199254740992 and 1e400 into Infinity. " +
      "So a Float variable of 2^53 + 1 is accepted, rounded, where the spec requires a request error, an ID of " +
      "9007199254740993 silently becomes \"9007199254740992\", and an ID of 1e400 is rejected. graphql-js 17 " +
      "accepts BigInt variable values, so a server that parses big JSON integers as BigInt avoids this.",
  },
  {
    name: "String and ID accept a JSON string with a lone surrogate",
    versions: BOTH,
    match: (c) => c.variables.includes(String.raw`\ud800`),
    why:
      "§3.5.3: 'only valid Unicode string input values are accepted'. JSON can escape an unpaired surrogate, and " +
      "String's parseValue/coerceInputValue (and ID's) only check typeof === 'string'. graphql-js's lexer rejects " +
      "the same escape in a string literal ('Invalid Unicode escape sequence').",
  },
  {
    name: "ID from a large integer variable is in exponent notation",
    versions: BOTH,
    match: (c) => c.query === "query($x: ID) { id(v: $x) }" && c.variables === '{"x": 1e21}',
    why:
      "§3.5.5 leaves the ID format to the service, so this may be allowed, but \"1e+21\" (String(1e21)) is not the " +
      "integer's decimal form, which the literal 1000000000000000000000 would give.",
  },
  {
    name: "graphql-js 16 ignores unknown fields in an input object literal",
    versions: ["16.15.0"],
    match: (c) => /\{ x: 1, z: 1 \}/.test(c.query),
    why:
      "§3.10: entries 'with names not defined by a field of this input object type' must raise a request error, " +
      "an execution error in CoerceArgumentValues. 16's valueFromAST never looks at extra fields. Validation " +
      "(ValuesOfCorrectTypeRule) rejects the document, so only execute without validate sees it. 17's " +
      "coerceInputLiteral checks for them.",
  },
];

// ---------------------------------------------------------------------------
// The schema, from its SDL. This reads the definitions only; it doesn't use
// graphql-js's coercion.

const sdl = graphql16.parse(SDL);
const typeRef = (node) => {
  if (node.kind === "NamedType") return { name: node.name.value, wrappers: [] };
  const inner = typeRef(node.type);
  return { name: inner.name, wrappers: [node.kind === "ListType" ? "list" : "nonNull", ...inner.wrappers] };
};
const inputValue = (node) => ({
  name: node.name.value,
  type: typeRef(node.type),
  typeText: graphql16.print(node.type),
  default: node.defaultValue,
});
const model = {
  types: new Map(["Int", "Float", "String", "Boolean", "ID"].map((name) => [name, { kind: "scalar" }])),
  fields: new Map(),
};
for (const def of sdl.definitions) {
  if (def.kind === "EnumTypeDefinition") {
    model.types.set(def.name.value, { kind: "enum", values: def.values.map((v) => v.name.value) });
  } else if (def.kind === "InputObjectTypeDefinition") {
    model.types.set(def.name.value, { kind: "inputObject", fields: def.fields.map(inputValue) });
  } else if (def.kind === "ObjectTypeDefinition") {
    for (const field of def.fields) model.fields.set(field.name.value, field.arguments.map(inputValue));
  }
}

// ---------------------------------------------------------------------------
// TLA+ encodings of the shapes in Coercion.tla

const str = (s) => {
  if (s.includes("\\")) throw new Error(`backslash in ${s}`);
  let out = "";
  for (const unit of s) {
    const code = unit.codePointAt(0);
    out += code >= 0x20 && code < 0x7f && unit !== '"' ? unit : `\\\\u${code.toString(16).padStart(4, "0")}`;
  }
  return `"${out}"`;
};
const seq = (items) => `<<${items.join(", ")}>>`;
const set = (items) => `{${items.join(", ")}}`;
const bool = (b) => (b ? "TRUE" : "FALSE");

// A number's decimal text as (-1 if neg) * digits * 10^exp, normalized.
const num = (kind, text) => {
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!m) throw new Error(`not a number: ${text}`);
  let digits = `${m[2]}${m[3] ?? ""}`.replace(/^0+/, "");
  let exp = Number(m[4] ?? 0) - (m[3]?.length ?? 0);
  if (digits === "") return `Num(${str(kind)}, FALSE, <<>>, 0)`;
  while (digits.endsWith("0")) {
    digits = digits.slice(0, -1);
    exp++;
  }
  return `Num(${str(kind)}, ${bool(m[1] === "-")}, ${seq([...digits])}, ${exp})`;
};
const strV = (s) => `StrW(${str(s)}, ${bool(s.isWellFormed())})`;
const entry = (key, value) => `Entry(${str(key)}, ${value})`;
const typeTla = (t) => `[name |-> ${str(t.name)}, wrappers |-> ${seq(t.wrappers.map(str))}]`;

const literal = (node) => {
  switch (node.kind) {
    case "NullValue": return "NullV";
    case "IntValue": return num("int", node.value);
    case "FloatValue": return num("float", node.value);
    case "StringValue": return strV(node.value);
    case "BooleanValue": return `Bool(${bool(node.value)})`;
    case "EnumValue": return `EnumV(${str(node.value)})`;
    case "Variable": return `VarV(${str(node.name.value)})`;
    case "ListValue": return `ListV(${seq(node.values.map(literal))})`;
    case "ObjectValue": return `ObjV(${set(node.fields.map((f) => entry(f.name.value, literal(f.value))))})`;
    default: throw new Error(`unexpected literal ${node.kind}`);
  }
};

// JSON source, keeping each number's source text (JSON.parse source access).
const NUMBER = Symbol("number");
const parseExact = (text) =>
  JSON.parse(text, (_key, value, context) => (typeof value === "number" ? { [NUMBER]: context.source } : value));
const json = (value) => {
  if (value === null) return "NullV";
  if (typeof value === "string") return strV(value);
  if (typeof value === "boolean") return `Bool(${bool(value)})`;
  if (Array.isArray(value)) return `ListV(${seq(value.map(json))})`;
  if (NUMBER in value) return num("number", value[NUMBER]);
  return `ObjV(${set(Object.entries(value).map(([k, v]) => entry(k, json(v))))})`;
};

// What a resolver received. graphql-js gives an enum value as its internal
// value, which buildSchema makes the value's name, so a string where the
// argument's named type is an enum is an enum value.
const itemType = (t) => {
  const inner = t?.wrappers[0] === "nonNull" ? { ...t, wrappers: t.wrappers.slice(1) } : t;
  return inner?.wrappers[0] === "list" ? { ...inner, wrappers: inner.wrappers.slice(1) } : inner;
};
const coerced = (value, type) => {
  if (value === null || value === undefined) return "NullV";
  if (Array.isArray(value)) return `ListV(${seq(value.map((v) => coerced(v, itemType(type))))})`;
  if (typeof value === "number") {
    return Number.isFinite(value) ? num("number", String(value)) : `NonFinite(${bool(value < 0)})`;
  }
  if (typeof value === "boolean") return `Bool(${bool(value)})`;
  const def = type && model.types.get(type.name);
  if (typeof value === "string") return def?.kind === "enum" ? `EnumV(${str(value)})` : strV(value);
  const fields = def?.kind === "inputObject" ? def.fields : [];
  return `ObjV(${set(Object.entries(value).map(([k, v]) => entry(k, coerced(v, fields.find((f) => f.name === k)?.type))))})`;
};

const defTla = (d) =>
  `Def(${str(d.name)}, ${typeTla(d.type)}, ${bool(d.default !== undefined)}, ${d.default ? literal(d.default) : "NullV"})`;

const schemaTla = () => {
  const types = [...model.types].map(([name, def]) => {
    if (def.kind === "scalar") return `(${str(name)} :> Scalar)`;
    if (def.kind === "enum") {
      return `(${str(name)} :> [kind |-> "enum", values |-> ${set(def.values.map(str))}, fields |-> <<>>])`;
    }
    return `(${str(name)} :> [kind |-> "inputObject", values |-> {}, fields |-> ${seq(def.fields.map(defTla))}])`;
  });
  const fields = [...model.fields].map(([name, args]) => `(${str(name)} :> ${seq(args.map(defTla))})`);
  return `[types |-> ${types.join(" @@ ")},\n  fields |-> ${fields.join(" @@ ")}]`;
};

const responseTla = (r) =>
  `Response(${bool(r.hasData)}, ${bool(r.fieldIsNull)}, ${seq(r.errors.map((p) => seq(p.map(str))))}, ${bool(r.called)}, ${r.args})`;
const caseTla = (c) => `[op |-> ${c.op}, request |-> ${c.request}, response |-> ${responseTla(c.response)}]`;

// ---------------------------------------------------------------------------
// Cases

const operations = [];
const add = (query, variables) => operations.push({ query, variables });
for (const [field, [arg]] of model.fields) {
  if (field === "pair") continue;
  const type = arg.typeText;
  add(`{ ${field} }`, "{}");
  for (const lit of LITERALS) add(`{ ${field}(v: ${lit}) }`, "{}");
  const byVariable = `query($x: ${type}) { ${field}(v: $x) }`;
  add(byVariable, "{}");
  for (const value of JSON_VALUES) add(byVariable, `{"x": ${value}}`);
  const [def, jsonValue] = DEFAULTS[field];
  for (const variableType of arg.type.wrappers[0] === "nonNull" ? [type, type.slice(0, -1)] : [type]) {
    const withDefault = `query($x: ${variableType} = ${def}) { ${field}(v: $x) }`;
    add(withDefault, "{}");
    add(withDefault, '{"x": null}');
    add(withDefault, `{"x": ${jsonValue}}`);
  }
  if (arg.type.wrappers[0] === "nonNull") {
    const nullable = `query($x: ${type.slice(0, -1)}) { ${field}(v: $x) }`;
    add(nullable, "{}");
    add(nullable, '{"x": null}');
    add(nullable, `{"x": ${jsonValue}}`);
  } else {
    add(`query($x: ${type} = null) { ${field}(v: $x) }`, "{}");
  }
}
for (const [query, variableSets] of EXTRA) for (const variables of variableSets) add(query, variables);

const operationTla = (document) => {
  const operation = document.definitions[0];
  const field = operation.selectionSet.selections[0];
  const variables = (operation.variableDefinitions ?? []).map((v) =>
    defTla({ name: v.variable.name.value, type: typeRef(v.type), default: v.defaultValue }),
  );
  const args = (field.arguments ?? []).map((a) => entry(a.name.value, literal(a.value)));
  return { field: field.name.value, tla: `Op(${seq(variables)}, ${str(field.name.value)}, ${set(args)})` };
};

const run = async (graphql, schema, operation) => {
  const document = graphql.parse(operation.query);
  const field = document.definitions[0].selectionSet.selections[0].name.value;
  const argTypes = new Map(model.fields.get(field).map((a) => [a.name, a.type]));
  const calls = [];
  const result = await graphql.execute({
    schema,
    document,
    variableValues: JSON.parse(operation.variables),
    fieldResolver: (_source, args) => {
      calls.push(`ObjV(${set(Object.entries(args).map(([k, v]) => entry(k, coerced(v, argTypes.get(k)))))})`);
      return "ok";
    },
  });
  if (calls.length > 1) throw new Error(`resolver called twice: ${operation.query}`);
  return {
    hasData: Object.hasOwn(result, "data"),
    fieldIsNull: result.data == null || result.data[field] === null,
    errors: (result.errors ?? []).map((e) => (e.path ?? []).map(String)),
    called: calls.length === 1,
    args: calls[0] ?? "NullV",
    valid: graphql.validate(schema, document).length === 0,
    messages: (result.errors ?? []).map((e) => e.message),
  };
};

const cases = new Map();
const perVersion = [];
for (const graphql of VERSIONS) {
  const schema = graphql.buildSchema(SDL);
  let invalidDocuments = 0;
  for (const operation of operations) {
    const response = await run(graphql, schema, operation);
    if (!response.valid) invalidDocuments++;
    const { tla: op } = operationTla(graphql16.parse(operation.query));
    const request = set(Object.entries(parseExact(operation.variables)).map(([k, v]) => entry(k, json(v))));
    const c = { ...operation, op, request, response };
    const key = caseTla(c);
    if (!cases.has(key)) cases.set(key, { ...c, versions: [] });
    const versions = cases.get(key).versions;
    if (!versions.includes(graphql.version)) versions.push(graphql.version);
  }
  const distinct = [...cases.values()].filter((c) => c.versions.includes(graphql.version)).length;
  perVersion.push(
    `graphql-js ${graphql.version}: ${operations.length} operations (${invalidDocuments} fail validation), ${distinct} distinct cases`,
  );
}
const all = [...cases.values()];
const differing = new Set(all.filter((c) => c.versions.length === 1).map((c) => `${c.query} ${c.variables}`));
perVersion.push(`${differing.size} operations where graphql-js 16 and 17 respond differently`);

// ---------------------------------------------------------------------------
// Negative controls: plausible ways a coercion result could be wrong.

const find = (predicate) => all.find((c) => !KNOWN.some((k) => k.match(c)) && predicate(c));
const resolved = (c, args) => ({ ...c.response, hasData: true, fieldIsNull: false, errors: [], called: true, args });
const outcome = (c) => (!c.response.hasData ? "requestError" : c.response.called ? "resolved" : "fieldError");
const fieldOf = (c) => /\{ (\w+)/.exec(c.query)[1];
const controls = [
  ["drops an argument default", find((c) => c.query === "{ intDefault }"), (c) => resolved(c, "ObjV({})")],
  ["accepts null for a Non-Null argument", find((c) => c.query === "{ intNN(v: null) }"), (c) => resolved(c, `ObjV({${entry("v", "NullV")}})`)],
  ["accepts a null variable for a Non-Null variable", find((c) => c.query.startsWith("query($x: Int!)") && c.variables === '{"x": null}'),
    (c) => resolved(c, `ObjV({${entry("v", "NullV")}})`)],
  ["reports a request error as an execution error", find((c) => outcome(c) === "requestError"),
    (c) => ({ ...c.response, hasData: true, fieldIsNull: true, errors: [[fieldOf(c)]] })],
  ["reports a request error with data: null", find((c) => outcome(c) === "requestError"),
    (c) => ({ ...c.response, hasData: true, fieldIsNull: true })],
  ["reports an execution error as a request error", find((c) => outcome(c) === "fieldError"),
    (c) => ({ ...c.response, hasData: false, errors: [[]] })],
  ["gives an omitted nullable argument the value null", find((c) => c.query === "{ int }"), (c) => resolved(c, `ObjV({${entry("v", "NullV")}})`)],
  ["passes a single value to a list argument unwrapped", find((c) => c.query === "{ ints(v: 1) }"), (c) => resolved(c, `ObjV({${entry("v", num("number", "1"))}})`)],
  ["accepts an Int of 2^31", find((c) => c.query === "query($x: Int) { int(v: $x) }" && c.variables === '{"x": 2147483648}'),
    (c) => resolved(c, `ObjV({${entry("v", num("number", "2147483648"))}})`)],
  ["keeps an ID from an Int as a number", find((c) => c.query === "{ id(v: 4) }" || c.query === "{ id(v: 1) }"),
    (c) => resolved(c, `ObjV({${entry("v", num("number", "1"))}})`)],
  ["drops an input field default", find((c) => c.query === "{ point(v: { x: 1 }) }"),
    (c) => resolved(c, `ObjV({${entry("v", `ObjV({${entry("x", num("number", "1"))}})`)}})`)],
].map(([name, c, response]) => {
  if (!c) throw new Error(`no case for control: ${name}`);
  return { ...c, name, response: response(c) };
});

// ---------------------------------------------------------------------------
// Checking with tla-ts

const tlc = (args, cwd) =>
  new Promise((done) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (status) => done({ status, output }));
  });

const moduleText = `---- MODULE CoercionJs ----
EXTENDS Coercion

Schema == ${schemaTla()}

Cases == ${seq(all.map(caseTla))}

Controls == ${seq(controls.map(caseTla))}

IsValid(c) == Valid(Schema, c.op, c.request, c.response)
Invalid == {i \\in DOMAIN Cases : ~IsValid(Cases[i])}
Accepted == {i \\in DOMAIN Controls : IsValid(Controls[i])}
Expected == {<<i, Respond(Schema, Cases[i].op, Cases[i].request).kind>> : i \\in Invalid}

ASSUME PrintT(<<"invalid", Invalid>>) /\\ PrintT(<<"accepted controls", Accepted>>) /\\ PrintT(<<"expected", Expected>>)

OneState == section = "scalar"
====
`;

// Runs the check against a copy of Coercion.tla, optionally mutated.
const check = async (mutant) => {
  const dir = mkdtempSync(join(tmpdir(), "coercion-"));
  try {
    cpSync(join(root, "specs/Coercion.tla"), join(dir, "Coercion.tla"));
    if (mutant) {
      const text = readFileSync(join(dir, "Coercion.tla"), "utf8");
      if (!text.includes(mutant.find)) return { error: `can't find: ${mutant.find}` };
      writeFileSync(join(dir, "Coercion.tla"), text.replace(mutant.find, mutant.replace));
    }
    writeFileSync(join(dir, "CoercionJs.tla"), moduleText);
    writeFileSync(join(dir, "CoercionJs.cfg"), "INIT OneState\nNEXT Next\n");
    const { status, output } = await tlc(["-workers", "1", "-nowarning", "CoercionJs.tla"], dir);
    const invalid = output.match(/<<\s*"invalid",\s*\{([^}]*)\}\s*>>/)?.[1];
    const accepted = output.match(/<<\s*"accepted controls",\s*\{([^}]*)\}\s*>>/)?.[1];
    if (status !== 0 || invalid === undefined || accepted === undefined) {
      return { error: output.split("\n").filter((l) => l.startsWith("Error") || /Tla\w*Error/.test(l)).join("\n") || output.slice(-2000) };
    }
    const indices = (text) => text.split(",").map((s) => Number(s.trim())).filter(Boolean);
    const expected = new Map([...output.matchAll(/<<(\d+),\s*"(\w+)">>/g)].map(([, i, kind]) => [Number(i), kind]));
    return { invalid: indices(invalid), accepted: indices(accepted), expected };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const describe = (c) => `${c.query}  variables: ${c.variables}`;
const observed = (c) =>
  !c.response.hasData
    ? `request error (${c.response.messages[0]})`
    : c.response.called
      ? `resolved with ${c.response.args}`
      : `field error (${c.response.messages[0]})`;

// Splits a result into known and unexpected disagreements.
const judge = (result) => {
  const failures = [];
  const knownHits = new Map(KNOWN.map((k) => [k, []]));
  for (const i of result.invalid) {
    const c = all[i - 1];
    const known = KNOWN.find((k) => k.match(c) && c.versions.every((v) => k.versions.includes(v)));
    if (known) knownHits.get(known).push(c);
    else failures.push(`graphql-js ${c.versions.join(" and ")} disagrees with the reference (${result.expected.get(i)}):\n    ${describe(c)}\n    got ${observed(c)}`);
  }
  for (const [known, hits] of knownHits) {
    for (const version of known.versions) {
      if (!hits.some((c) => c.versions.includes(version))) failures.push(`known disagreement no longer happens on ${version}: ${known.name}`);
    }
  }
  for (const i of result.accepted) failures.push(`the reference accepts a broken response: ${controls[i - 1].name}`);
  return { failures, knownHits };
};

const started = Date.now();
const result = await check();
let failed = false;
for (const line of perVersion) console.log(`  ${line}`);
console.log(`  ${all.length} distinct cases, ${controls.length} negative controls`);
if (result.error) {
  console.log(`✗ tla-ts failed:\n${result.error}`);
  process.exit(1);
}
const { failures, knownHits } = judge(result);
for (const [known, hits] of knownHits) {
  console.log(`! known disagreement (${known.versions.join(", ")}), ${hits.length} cases: ${known.name}`);
  console.log(`    ${known.why}`);
  if (hits[0]) console.log(`    e.g. ${describe(hits[0])}\n         got ${observed(hits[0])}`);
}
for (const failure of failures) console.log(`✗ ${failure}`);
if (failures.length === 0) {
  console.log(`✓ every other graphql-js case satisfies Coercion!Valid`);
  console.log(`✓ every negative control is rejected (${controls.map((c) => c.name).join(", ")})`);
} else failed = true;
console.log(`  (${((Date.now() - started) / 1000).toFixed(1)}s)`);

if (process.argv.includes("--mutants")) {
  const mutants = (await import(pathToFileURL(join(root, "specs/coercion.mutants.mjs")).href)).default;
  console.log("\nMutants of Coercion.tla");
  const results = new Array(mutants.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(mutants.length, Math.floor(availableParallelism() / 2))) }, async () => {
      while (next < mutants.length) {
        const index = next++;
        results[index] = await check(mutants[index]);
      }
    }),
  );
  mutants.forEach((mutant, index) => {
    const r = results[index];
    if (r.error) {
      console.log(`✗ ${mutant.name}: ${r.error}`);
      failed = true;
      return;
    }
    const { failures: caught } = judge(r);
    const disagreements = caught.filter((f) => f.startsWith("graphql-js")).length;
    const controlsAccepted = r.accepted.length;
    const ok = caught.length > 0;
    console.log(
      `${ok ? "✓" : "✗"} ${mutant.name}: ${disagreements} new disagreements, ${controlsAccepted} controls accepted`,
    );
    if (!ok) failed = true;
  });
}
process.exit(failed ? 1 : 0);
