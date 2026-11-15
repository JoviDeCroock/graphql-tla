// Writes kit/coerce/vectors.json: the coerce area's vectors
// (docs/kit/coerce.md), with every expected answer from the TLA+ reference.
//
// The schema and the operations are scripts/differential-coercion.mjs's,
// copied here, plus the spec's own §3.10 examples and documents for
// operation selection. For each request, tla-ts evaluates:
//
//   Coercion!ExecuteRequest  a request error, a field error, or the coerced
//                      arguments the resolver gets, under the default
//                      policy (every SHOULD followed, JSON strings taken as
//                      enum values): the expected answer. Under the other
//                      policies, the answers the spec also permits
//                      (`alternatives`). With the variables read as a
//                      binary64 JSON parser reads them, the `binary64`
//                      answer, where it differs;
//   Coercion!GetOperation    which root field the selected operation runs;
//   Validation!IsValid whether the document is valid. A document that is
//                      invalid by Validation.tla is `valid: false`. One that
//                      is only invalid because an Int or Float literal
//                      doesn't coerce (§5.6.1 asks for "coercible", which
//                      Validation.tla checks by literal kind only) is also
//                      `valid: false`, and needs `unvalidated`: whether a
//                      validator must catch it rests on Int's SHOULD and on
//                      the reference's reading of Float's precision.
//
// graphql-js only parses the SDL and the documents here. It never decides
// an answer.
//
// Usage: node scripts/generate-vectors-coerce.mjs [--check]
//
//   --check  regenerates the vectors and fails if kit/coerce/vectors.json
//            differs.

import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as graphql from "graphql16";
import { CHECK_IDS, CHECKS } from "../kit/coerce/checks.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const cli = join(root, "node_modules/tla-ts/dist/cli.js");
const OUT = join(root, "kit/coerce/vectors.json");
const WORKERS = 2;
const SHARD_SIZE = 250;

// ---------------------------------------------------------------------------
// The schema: differential-coercion.mjs's, plus the spec's
// ExampleInputObject (§3.10) and a field that takes it.

const SDL = `enum Color { RED GREEN BLUE }

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

input ExampleInputObject {
  a: String
  b: Int!
}

type Mutation {
  mutate(v: Int): String
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
  example(arg: ExampleInputObject): String
}
`;

// Copied from differential-coercion.mjs: argument literals as GraphQL
// source, variable values as JSON source, and a variable default and value
// for each single-argument field.
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

const DEFAULTS = {
  int: ["3", "5"], intNN: ["3", "5"], intDefault: ["3", "5"], intNNDefault: ["3", "5"],
  float: ["2", "2.5"], string: ['"d"', '"s"'], boolean: ["true", "false"], id: ["9", '"s"'],
  color: ["BLUE", '"RED"'], colorDefault: ["BLUE", '"RED"'], ints: ["1", "[2, 3]"],
  intsNN: ["[1, 2]", "3"], intsDefault: ["[4]", "5"], matrix: ["1", "[1, [2]]"],
  point: ["{ x: 5 }", '{"x": 6}'], pointNN: ["{ x: 5 }", '{"x": 6}'],
  pointDefault: ["{ x: 5 }", '{"x": 6}'], points: ["{ x: 5 }", '[{"x": 6}]'],
  shape: ["{ origin: { x: 5 } }", '{"origin": {"x": 6}}'],
};

// differential-coercion.mjs's hand-written cases, each with its family and
// the check it belongs to.
const EXTRA = [
  ["nested-variable", "list", "query($x: Int) { ints(v: [1, $x]) }", ["{}", '{"x": null}', '{"x": 2}']],
  ["nested-variable", "list", "query($x: Int) { intsNN(v: [1, $x]) }", ["{}", '{"x": null}', '{"x": 2}']],
  ["nested-variable", "list", "query($x: Int = 1) { intsNN(v: [1, $x]) }", ["{}", '{"x": null}', '{"x": 2}']],
  ["nested-variable", "list", "query($x: Int!) { intsNN(v: [1, $x]) }", ["{}", '{"x": 2}']],
  ["nested-variable", "list", "query($x: Int) { matrix(v: [$x, [$x]]) }", ["{}", '{"x": null}', '{"x": 2}']],
  ["nested-variable", "inputObject", "query($x: Int) { point(v: { x: $x }) }", ["{}", '{"x": null}', '{"x": 2}']],
  ["nested-variable", "inputObject", "query($x: Int!) { point(v: { x: $x }) }", ["{}", '{"x": 2}']],
  ["nested-variable", "inputObject", "query($y: Int) { point(v: { x: 1, y: $y }) }", ["{}", '{"y": null}', '{"y": 2}']],
  ["nested-variable", "inputObject", "query($y: Int = 4) { point(v: { x: 1, y: $y }) }", ["{}", '{"y": null}']],
  ["nested-variable", "inputObject", "query($l: String) { point(v: { x: 1, label: $l }) }", ["{}", '{"l": null}', '{"l": "p"}']],
  ["nested-variable", "inputObject", "query($c: Color) { shape(v: { origin: { x: 1 }, color: $c }) }", ["{}", '{"c": null}', '{"c": "BLUE"}']],
  ["nested-variable", "inputObject", "query($t: [String!]) { shape(v: { origin: { x: 1 }, tags: $t }) }", ["{}", '{"t": "a"}', '{"t": ["a", "b"]}']],
  ["nested-variable", "list", "query($p: Point) { points(v: [$p]) }", ["{}", '{"p": null}', '{"p": {"x": 3}}']],
  ["nested-variable", "list", "query($p: Point!) { points(v: [$p, { x: 2 }]) }", ["{}", '{"p": {"x": 3}}', '{"p": {"y": 3}}']],
  ["nested-variable", "inputObject", "query($o: Point!) { shape(v: { origin: $o }) }", ["{}", '{"o": {"x": 3}}', '{"o": {"x": 3, "z": 1}}']],
  ["arguments", "arguments", "{ pair }", ["{}"]],
  ["arguments", "arguments", "{ pair(a: 1) }", ["{}"]],
  ["arguments", "arguments", "{ pair(b: null) }", ["{}"]],
  ["arguments", "arguments", "query($a: Int, $b: Int!) { pair(a: $a, b: $b) }", ["{}", '{"b": 3}', '{"a": null, "b": 3}', '{"a": 1, "b": null}']],
  ["arguments", "arguments", "query($a: Int, $b: Int) { pair(a: $a, b: $b) }", ["{}", '{"b": null}', '{"a": 1, "b": 4}']],
  ["unused-variable", "variables", "query($x: Int, $unused: Int) { int(v: $x) }", ['{"x": 1, "unused": "bad"}', '{"unused": 2}']],
  ["unused-variable", "variables", "query($x: Int, $unused: Int!) { int(v: $x) }", ['{"x": 1}']],
  ["variable-default", "variables", "query($x: Int = null) { intDefault(v: $x) }", ["{}"]],
  ["variable-default", "variables", "query($x: [Int] = 1) { ints(v: $x) }", ["{}"]],
  ["variable-default", "variables", "query($x: Point = { x: 1 }) { point(v: $x) }", ["{}"]],
  ["variable-default", "variables", "query($x: Shape = { origin: { x: 1 } }) { shape(v: $x) }", ["{}"]],
];

// §3.10's table of examples, as `example(arg: <literal>)`. Where the
// literal uses $var, the operation declares it as the table says.
const SPEC_EXAMPLES = [
  ['{ example(arg: { a: "abc", b: 123 }) }', "{}"],
  ["{ example(arg: { a: null, b: 123 }) }", "{}"],
  ["{ example(arg: { b: 123 }) }", "{}"],
  ["query($var: String) { example(arg: { a: $var, b: 123 }) }", '{"var": null}'],
  ["query($var: String) { example(arg: { a: $var, b: 123 }) }", "{}"],
  ["query($var: Int) { example(arg: { b: $var }) }", '{"var": 123}'],
  ["query($var: ExampleInputObject) { example(arg: $var) }", '{"var": {"b": 123}}'],
  ['{ example(arg: "abc123") }', "{}"],
  ["query($var: ExampleInputObject) { example(arg: $var) }", '{"var": "abc123"}'],
  ['{ example(arg: { a: "abc", b: "123" }) }', "{}"],
  ['{ example(arg: { a: "abc" }) }', "{}"],
  ["query($var: Int) { example(arg: { b: $var }) }", "{}"],
  ["query($var: ExampleInputObject) { example(arg: $var) }", '{"var": {"a": "abc"}}'],
  ['{ example(arg: { a: "abc", b: null }) }', "{}"],
  ["query($var: Int) { example(arg: { b: $var }) }", '{"var": null}'],
  ['{ example(arg: { b: 123, c: "xyz" }) }', "{}"],
];

// Operation selection (§6.1 GetOperation): a document with its operation
// names to try, and variable sets. null leaves operationName out.
const OPERATIONS = [
  ["query A { int(v: 1) }", [null, "A", "B"], ["{}"]],
  ["{ int(v: 1) }", ["A"], ["{}"]],
  ['query A { int(v: 1) } query B { string(v: "b") }', [null, "A", "B", "C"], ["{}"]],
  ['{ int(v: 1) } query B { string(v: "b") }', [null, "B"], ["{}"]],
  ["fragment F on Query { int(v: 1) }", [null, "F"], ["{}"]],
  ["mutation { mutate(v: 1) }", [null], ["{}"]],
  ["query Q { int(v: 1) } mutation M { mutate(v: 2) }", [null, "Q", "M"], ["{}"]],
  ["query A($x: Int) { int(v: $x) } query B($y: Int!) { intNN(v: $y) }", ["A", "B"], ['{"x": 1}', '{"x": 1, "y": 2}', '{"x": 1, "y": "bad"}']],
];

// ---------------------------------------------------------------------------
// The schema, from its SDL (as differential-coercion.mjs reads it).

const sdl = graphql.parse(SDL);
const typeRef = (node) => {
  if (node.kind === "NamedType") return { name: node.name.value, wrappers: [] };
  const inner = typeRef(node.type);
  return { name: inner.name, wrappers: [node.kind === "ListType" ? "list" : "nonNull", ...inner.wrappers] };
};
const inputValue = (node) => ({
  name: node.name.value,
  type: typeRef(node.type),
  typeText: graphql.print(node.type),
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
// Which check a vector belongs to. This only files the vector under a
// section, by the outermost type its value meets, as the spec's own tables
// do (§3.11 lists [1, "b", true] under List). It never decides an answer.

const NUMBER = Symbol("number");
const parseExact = (text) =>
  JSON.parse(text, (_key, value, context) => (typeof value === "number" ? { [NUMBER]: context.source } : value));

const isNullValue = (v) => v === null || v?.kind === "NullValue";
// The integer a literal or JSON number denotes, or undefined if it isn't
// integral.
const integerOf = (v) => {
  const text = v?.kind === "IntValue" ? v.value : v?.[NUMBER];
  if (text === undefined) return undefined;
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
  let digits = `${m[2]}${m[3] ?? ""}`.replace(/^0+/, "") || "0";
  let exp = Number(m[4] ?? 0) - (m[3]?.length ?? 0);
  while (exp < 0 && digits.endsWith("0")) {
    digits = digits.slice(0, -1) || "0";
    exp++;
  }
  if (exp < 0) return digits === "0" ? 0n : undefined;
  if (exp > 400) return undefined;
  return (m[1] ? -1n : 1n) * BigInt(digits) * 10n ** BigInt(exp);
};

const checkFor = (type, value) => {
  if (type.wrappers[0] === "nonNull") {
    return isNullValue(value) ? "nonNull" : checkFor({ ...type, wrappers: type.wrappers.slice(1) }, value);
  }
  if (type.wrappers[0] === "list") return "list";
  const def = model.types.get(type.name);
  if (def.kind === "enum") return "enum";
  if (def.kind === "inputObject") return "inputObject";
  if (type.name === "Int") {
    const n = integerOf(value);
    return n !== undefined && (n < -(2n ** 31n) || n >= 2n ** 31n) ? "intRange" : "int";
  }
  if (type.name === "Float") {
    // An integer a finite double can't hold exactly: "outside the available
    // precision" as Coercion.tla reads it.
    const n = integerOf(value);
    return n !== undefined && Number.isFinite(Number(n)) && BigInt(Number(n)) !== n ? "floatPrecision" : "float";
  }
  return { String: "string", Boolean: "boolean", ID: "id" }[type.name];
};

// A JSON number in the variables that a double can't hold, so the answer
// depends on how the implementation's JSON parser reads numbers.
const needsExactNumbers = (text) => {
  let found = false;
  JSON.parse(text, (_key, value, context) => {
    if (typeof value === "number") {
      const n = integerOf({ [NUMBER]: context.source });
      if (!Number.isFinite(value) || (n !== undefined && BigInt(value) !== n)) found = true;
    }
    return value;
  });
  return found;
};

// ---------------------------------------------------------------------------
// The operations

const operations = [];
const add = (family, check, document, variables, operationName = null) =>
  operations.push({ family, check, document, variables, operationName });
for (const [field, args] of model.fields) {
  if (field === "pair" || field === "example" || field === "mutate") continue;
  const [arg] = args;
  const type = arg.typeText;
  add("omitted", "arguments", `{ ${field} }`, "{}");
  for (const lit of LITERALS) add("literal", checkFor(arg.type, graphql.parseValue(lit)), `{ ${field}(v: ${lit}) }`, "{}");
  const byVariable = `query($x: ${type}) { ${field}(v: $x) }`;
  add("variable", "variables", byVariable, "{}");
  for (const value of JSON_VALUES) {
    add("variable", value === "null" ? "variables" : checkFor(arg.type, parseExact(value)), byVariable, `{"x": ${value}}`);
  }
  const [def, jsonValue] = DEFAULTS[field];
  for (const variableType of arg.type.wrappers[0] === "nonNull" ? [type, type.slice(0, -1)] : [type]) {
    const withDefault = `query($x: ${variableType} = ${def}) { ${field}(v: $x) }`;
    add("variable-default", "variables", withDefault, "{}");
    add("variable-default", "variables", withDefault, '{"x": null}');
    add("variable-default", "variables", withDefault, `{"x": ${jsonValue}}`);
  }
  if (arg.type.wrappers[0] === "nonNull") {
    const nullable = `query($x: ${type.slice(0, -1)}) { ${field}(v: $x) }`;
    add("nullable-variable", "arguments", nullable, "{}");
    add("nullable-variable", "arguments", nullable, '{"x": null}');
    add("nullable-variable", "arguments", nullable, `{"x": ${jsonValue}}`);
  } else {
    add("variable-default", "variables", `query($x: ${type} = null) { ${field}(v: $x) }`, "{}");
  }
}
for (const [family, check, document, variableSets] of EXTRA) {
  for (const variables of variableSets) add(family, check, document, variables);
}
for (const [document, variables] of SPEC_EXAMPLES) add("spec-example", "inputObject", document, variables);
for (const [document, names, variableSets] of OPERATIONS) {
  for (const name of names) for (const variables of variableSets) add("operation", "getOperation", document, variables, name);
}

// ---------------------------------------------------------------------------
// TLA+ encodings for Coercion.tla (as in differential-coercion.mjs)

const str = (s) => {
  if (s.includes("\\") || s.includes('"')) throw new Error(`can't encode ${s}`);
  let out = "";
  for (const unit of s) {
    const code = unit.codePointAt(0);
    out += code >= 0x20 && code < 0x7f ? unit : `\\\\u${code.toString(16).padStart(4, "0")}`;
  }
  return `"${out}"`;
};
const seq = (items) => `<<${items.join(", ")}>>`;
const set = (items) => `{${items.join(", ")}}`;
const bool = (b) => (b ? "TRUE" : "FALSE");

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
const json = (value) => {
  if (value === null) return "NullV";
  if (typeof value === "string") return strV(value);
  if (typeof value === "boolean") return `Bool(${bool(value)})`;
  if (Array.isArray(value)) return `ListV(${seq(value.map(json))})`;
  if (NUMBER in value) return num("number", value[NUMBER]);
  return `ObjV(${set(Object.entries(value).map(([k, v]) => entry(k, json(v))))})`;
};
// A JSON value as a binary64 parser (JSON.parse) delivers it: a number is
// the nearest double, written out exactly, or non-finite.
const json64 = (value) => {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return `NonFinite(${bool(value < 0)})`;
    return num("number", Number.isInteger(value) ? BigInt(value).toString() : String(value));
  }
  if (value === null) return "NullV";
  if (typeof value === "string") return strV(value);
  if (typeof value === "boolean") return `Bool(${bool(value)})`;
  if (Array.isArray(value)) return `ListV(${seq(value.map(json64))})`;
  return `ObjV(${set(Object.entries(value).map(([k, v]) => entry(k, json64(v))))})`;
};
const defTla = (d) =>
  `Def(${str(d.name)}, ${typeTla(d.type)}, ${bool(d.default !== undefined)}, ${d.default ? literal(d.default) : "NullV"})`;
const coercionSchema = () => {
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
// A document as Coercion.tla's sequence of operations.
const documentOps = (document) =>
  seq(
    document.definitions
      .filter((d) => d.kind === "OperationDefinition")
      .map((operation) => {
        const field = operation.selectionSet.selections[0];
        const variables = (operation.variableDefinitions ?? []).map((v) =>
          defTla({ name: v.variable.name.value, type: typeRef(v.type), default: v.defaultValue }),
        );
        const args = (field.arguments ?? []).map((a) => entry(a.name.value, literal(a.value)));
        return `NamedOp(${str(operation.operation)}, ${str(operation.name?.value ?? "")}, ${seq(variables)}, ${str(field.name.value)}, ${set(args)})`;
      }),
  );

// ---------------------------------------------------------------------------
// TLA+ encodings for Validation.tla (as in differential-validation.mjs)

const vstr = (s) => JSON.stringify(String(s));
const setOf = (items) => `{${[...items].map(vstr).join(", ")}}`;
const fn = (entries) => (entries.length === 0 ? "<<>>" : entries.map(([k, v]) => `(${vstr(k)} :> ${v})`).join(" @@ "));
const NO_VALUE = `[kind |-> "none", value |-> "", items |-> <<>>, fields |-> <<>>]`;

const validationSchema = (schema) => {
  const ref = (t) => {
    const wrappers = [];
    while (graphql.isWrappingType(t)) {
      wrappers.push(graphql.isNonNullType(t) ? "nonNull" : "list");
      t = t.ofType;
    }
    return `[name |-> ${vstr(t.name)}, wrappers |-> ${seq(wrappers.map(vstr))}]`;
  };
  const input = (a) => `[type |-> ${ref(a.type)}, hasDefault |-> ${bool(a.defaultValue !== undefined)}]`;
  const types = Object.values(schema.getTypeMap())
    .filter((t) => !t.name.startsWith("__"))
    .map((t) => {
      const kind = graphql.isScalarType(t) ? "scalar" : graphql.isEnumType(t) ? "enum" : graphql.isObjectType(t) ? "object"
        : graphql.isInterfaceType(t) ? "interface" : graphql.isUnionType(t) ? "union" : "input";
      const fields = graphql.isObjectType(t) || graphql.isInterfaceType(t)
        ? fn(Object.values(t.getFields()).map((f) => [f.name, `[type |-> ${ref(f.type)}, args |-> ${fn(f.args.map((a) => [a.name, input(a)]))}]`]))
        : "<<>>";
      const possible = graphql.isAbstractType(t) ? schema.getPossibleTypes(t).map((p) => p.name) : [];
      const inputFields = graphql.isInputObjectType(t) ? fn(Object.values(t.getFields()).map((f) => [f.name, input(f)])) : "<<>>";
      const enumValues = graphql.isEnumType(t) ? t.getValues().map((v) => v.name) : [];
      return [t.name, `[kind |-> ${vstr(kind)}, fields |-> ${fields}, possibleTypes |-> ${setOf(possible)}, inputFields |-> ${inputFields}, enumValues |-> ${setOf(enumValues)}, oneOf |-> ${bool(graphql.isInputObjectType(t) && Boolean(t.isOneOf))}]`];
    });
  const directives = schema.getDirectives().map((d) => [
    d.name,
    `[locations |-> ${setOf(d.locations)}, args |-> ${fn(d.args.map((a) => [a.name, input(a)]))}, repeatable |-> ${bool(d.isRepeatable)}]`,
  ]);
  const rootName = (t) => vstr(t?.name ?? "");
  return `[types |-> ${fn(types)},
  directives |-> ${fn(directives)},
  roots |-> [query |-> ${rootName(schema.getQueryType())}, mutation |-> ${rootName(schema.getMutationType())}, subscription |-> ${rootName(schema.getSubscriptionType())}]]`;
};
const typeRefToTla = (node) => {
  const wrappers = [];
  while (node.kind !== "NamedType") {
    wrappers.push(node.kind === "NonNullType" ? "nonNull" : "list");
    node = node.type;
  }
  return `[name |-> ${vstr(node.name.value)}, wrappers |-> ${seq(wrappers.map(vstr))}]`;
};
const valueToTla = (v) => {
  const base = (kind, value, items = "<<>>", fields = "<<>>") =>
    `[kind |-> ${vstr(kind)}, value |-> ${vstr(value)}, items |-> ${items}, fields |-> ${fields}]`;
  switch (v.kind) {
    case "IntValue": return base("int", v.value);
    case "FloatValue": return base("float", v.value);
    case "StringValue": return base("string", v.value);
    case "BooleanValue": return base("boolean", v.value);
    case "NullValue": return base("null", "");
    case "EnumValue": return base("enum", v.value);
    case "Variable": return base("variable", v.name.value);
    case "ListValue": return base("list", "", seq(v.values.map(valueToTla)));
    case "ObjectValue":
      return base("object", "", "<<>>", seq(v.fields.map((f) => `[name |-> ${vstr(f.name.value)}, value |-> ${valueToTla(f.value)}]`)));
    default: throw new Error(`unexpected value ${v.kind}`);
  }
};
const argumentsToTla = (args = []) => seq(args.map((a) => `[name |-> ${vstr(a.name.value)}, value |-> ${valueToTla(a.value)}]`));
const directivesToTla = (directives = []) =>
  seq(directives.map((d) => `[name |-> ${vstr(d.name.value)}, arguments |-> ${argumentsToTla(d.arguments)}]`));
const selectionToTla = (s) => {
  const kind = { Field: "field", FragmentSpread: "fragmentSpread", InlineFragment: "inlineFragment" }[s.kind];
  return `[kind |-> ${vstr(kind)}, name |-> ${vstr(s.name?.value ?? "")}, alias |-> ${vstr(s.alias?.value ?? "")}, arguments |-> ${argumentsToTla(s.arguments)}, directives |-> ${directivesToTla(s.directives)}, typeCondition |-> ${vstr(s.typeCondition?.name.value ?? "")}, hasSelectionSet |-> ${bool(Boolean(s.selectionSet))}, selectionSet |-> ${selectionSetToTla(s.selectionSet)}]`;
};
const selectionSetToTla = (selectionSet) => seq((selectionSet?.selections ?? []).map(selectionToTla));
const documentToTla = (doc) =>
  seq(
    doc.definitions.map((d) => {
      if (d.kind === "FragmentDefinition") {
        return `[kind |-> "fragment", operation |-> "", name |-> ${vstr(d.name.value)}, variables |-> <<>>, typeCondition |-> ${vstr(d.typeCondition.name.value)}, directives |-> ${directivesToTla(d.directives)}, selectionSet |-> ${selectionSetToTla(d.selectionSet)}]`;
      }
      const variables = seq((d.variableDefinitions ?? []).map((v) =>
        `[name |-> ${vstr(v.variable.name.value)}, type |-> ${typeRefToTla(v.type)}, hasDefault |-> ${bool(Boolean(v.defaultValue))}, default |-> ${v.defaultValue ? valueToTla(v.defaultValue) : NO_VALUE}, directives |-> ${directivesToTla(v.directives)}]`));
      return `[kind |-> "operation", operation |-> ${vstr(d.operation)}, name |-> ${vstr(d.name?.value ?? "")}, variables |-> ${variables}, typeCondition |-> "", directives |-> ${directivesToTla(d.directives)}, selectionSet |-> ${selectionSetToTla(d.selectionSet)}]`;
    }),
  );

// ---------------------------------------------------------------------------
// The modules tla-ts evaluates

// For each request: the field GetOperation selects; ExecuteRequest's
// outcome and coerced arguments as JSON text under each policy, and with
// the variables as a binary64 parser reads them; and whether every Int and
// Float literal coerces (§5.6.1's "coercible").
const coercionModule = (name, schemaTla, cases) => `---- MODULE ${name} ----
EXTENDS Coercion

Schema == ${schemaTla}

Cases == ${seq(cases)}

\\* A coerced value as JSON text. An object's entries come in CHOOSE order;
\\* the generator sorts keys after parsing.
RECURSIVE SetToSeq(_), Join(_), JsonOf(_)
SetToSeq(s) == IF s = {} THEN <<>> ELSE LET x == CHOOSE x \\in s : TRUE IN <<x>> \\o SetToSeq(s \\ {x})
Join(strings) ==
  IF strings = <<>> THEN ""
  ELSE IF Len(strings) = 1 THEN Head(strings)
  ELSE Head(strings) \\o "," \\o Join(Tail(strings))
NumberText(v) ==
  IF v.digits = <<>> THEN "0"
  ELSE (IF v.neg THEN "-" ELSE "") \\o DigitString(v.digits, 1) \\o (IF v.exp = 0 THEN "" ELSE "e" \\o ToString(v.exp))
JsonOf(v) ==
  CASE v.kind = "null" -> "null"
    [] v.kind = "number" -> NumberText(v)
    [] v.kind \\in {"string", "enum"} -> "\\"" \\o v.str \\o "\\""
    [] v.kind = "boolean" -> v.str
    [] v.kind = "list" -> "[" \\o Join([i \\in DOMAIN v.items |-> JsonOf(v.items[i])]) \\o "]"
    [] v.kind = "object" -> "{" \\o Join(SetToSeq({"\\"" \\o e.key \\o "\\":" \\o JsonOf(e.value) : e \\in v.entries})) \\o "}"
    [] OTHER -> "?"

\\* Whether each Int and Float literal in a position of that type coerces.
\\* Kinds that don't match are Validation's ValuesOfCorrectType's business.
Bare(t) == IF IsNonNull(t) THEN OfType(t) ELSE t
RECURSIVE InRange(_, _)
InRange(type, v) ==
  LET t == Bare(type) IN
  CASE v.kind = "list" -> IF IsList(t) THEN \\A i \\in DOMAIN v.items : InRange(OfType(t), v.items[i]) ELSE TRUE
    [] IsList(t) -> InRange(OfType(t), v)
    [] v.kind = "object" ->
         IF Schema.types[t.name].kind = "inputObject"
         THEN LET fields == Schema.types[t.name].fields IN
              \\A i \\in DOMAIN fields : HasKey(v.entries, fields[i].name) => InRange(fields[i].type, Get(v.entries, fields[i].name))
         ELSE TRUE
    [] v.kind \\in {"int", "float"} /\\ t.name \\in {"Int", "Float"} -> CoerceScalar(t.name, v).ok
    [] OTHER -> TRUE
LiteralsInRange(op) ==
  LET args == Schema.fields[op.field] IN
  /\\ \\A e \\in op.arguments : \\A i \\in DOMAIN args : args[i].name = e.key => InRange(args[i].type, e.value)
  /\\ \\A i \\in DOMAIN op.variables : op.variables[i].hasDefault => InRange(op.variables[i].type, op.variables[i].default)

Policy(enumFromString, inputFieldDefaults) == [enumFromString |-> enumFromString, inputFieldDefaults |-> inputFieldDefaults]
Answer(S, c, request) ==
  LET outcome == ExecuteRequest(S, c.doc, c.name, request) IN
  <<outcome.kind, IF outcome.kind = "resolved" THEN JsonOf(outcome.args) ELSE "">>

ASSUME \\A i \\in DOMAIN Cases :
  LET c == Cases[i]
      selected == GetOperation(c.doc, c.name)
  IN PrintT(<<"vector", i, IF selected.ok THEN selected.operation.field ELSE "",
              Answer(Schema, c, c.request),
              Answer(WithPolicy(Schema, Policy(FALSE, TRUE)), c, c.request),
              Answer(WithPolicy(Schema, Policy(TRUE, FALSE)), c, c.request),
              Answer(WithPolicy(Schema, Policy(FALSE, FALSE)), c, c.request),
              IF c.has64 THEN Answer(Schema, c, c.request64) ELSE <<"", "">>,
              \\A j \\in DOMAIN c.doc : LiteralsInRange(c.doc[j])>>)
ASSUME PrintT(<<"done", Len(Cases)>>)

OneState == section = "scalar"
====
`;

const validationModule = (name, schemaTla, docs) => `---- MODULE ${name} ----
EXTENDS Validation

Schema == ${schemaTla}

Docs == ${seq(docs)}

ASSUME \\A i \\in DOMAIN Docs : PrintT(<<"valid", i, IsValid(Schema, Docs[i])>>)
ASSUME PrintT(<<"done", Len(Docs)>>)

OneState == vector = [group |-> "documents", n |-> 1]
====
`;

const tlc = (args, cwd) =>
  new Promise((done) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (status) => done({ status, output }));
  });

const unescape = (s) => JSON.parse(`"${s}"`);

// Runs every shard on at most WORKERS tla-ts processes. Each job is
// { name, module, size, read(flatOutput) }.
const runJobs = async (jobs) => {
  const dir = mkdtempSync(join(tmpdir(), "coerce-vectors-"));
  try {
    cpSync(join(root, "specs/Coercion.tla"), join(dir, "Coercion.tla"));
    cpSync(join(root, "specs/Validation.tla"), join(dir, "Validation.tla"));
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        writeFileSync(join(dir, `${job.name}.tla`), job.module);
        writeFileSync(join(dir, `${job.name}.cfg`), "INIT OneState\nNEXT Next\n");
        const { status, output } = await tlc(["-workers", "1", "-nowarning", "-config", `${job.name}.cfg`, `${job.name}.tla`], dir);
        // tla-ts wraps long values across lines; strings are never broken.
        const flat = output.replace(/\s*\n\s*/g, " ");
        if (status !== 0 || !new RegExp(`<<\\s*"done",\\s*${job.size}\\s*>>`).test(flat)) {
          const lines = output.split("\n").filter((l) => /Error|error|Exception/.test(l)).slice(0, 10);
          throw new Error(`tla-ts failed on ${job.name}:\n${lines.map((l) => l.slice(0, 300)).join("\n") || output.slice(-2000)}`);
        }
        job.read(flat);
      }
    };
    await Promise.all(Array.from({ length: Math.min(WORKERS, jobs.length) }, worker));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// Sorts object keys, so the file doesn't depend on CHOOSE order.
const canonical = (v) =>
  v === null || typeof v !== "object"
    ? v
    : Array.isArray(v)
      ? v.map(canonical)
      : Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]));

// The policies Coercion.tla is also evaluated under, after the default:
// the switches each one turns off (specs/Coercion.tla, "What the spec
// leaves to the implementation"). A MAY-only policy comes first, so an
// answer it explains is recorded as needing only the MAY.
const POLICY_RUNS = [["enumFromString"], ["inputFieldDefaults"], ["enumFromString", "inputFieldDefaults"]];
const ANSWER = String.raw`<<\s*"(\w*)",\s*"((?:[^"\\]|\\.)*)"\s*>>`;
const VECTOR = new RegExp(
  String.raw`<<\s*"vector",\s*(\d+),\s*"(\w*)",\s*${ANSWER},\s*${ANSWER},\s*${ANSWER},\s*${ANSWER},\s*${ANSWER},\s*(TRUE|FALSE)\s*>>`,
  "g",
);
const OUTCOMES = { requestError: "request-error", fieldError: "field-error", resolved: "value" };
const answerOf = (kind, text, field) => {
  const outcome = OUTCOMES[kind];
  if (!outcome) throw new Error(`unknown outcome ${kind}`);
  if (outcome === "request-error") return { outcome };
  if (outcome === "field-error") return { outcome, field };
  return { outcome, field, arguments: canonical(JSON.parse(unescape(text))) };
};
const answerKey = (a) => JSON.stringify([a.outcome, a.field ?? null, a.arguments ?? null]);

// For a vector on the `id` field: the input value the argument gets (a
// literal, a JSON value or a variable's default), to tell an ID coerced
// from an integer, whose format the service picks, from one given as a
// string.
const idInput = (o) => {
  const operation = graphql.parse(o.document).definitions[0];
  const field = operation.selectionSet?.selections[0];
  const argument = field?.name.value === "id" ? field.arguments?.[0] : undefined;
  if (!argument) return undefined;
  if (argument.value.kind !== "Variable") return argument.value;
  const name = argument.value.name.value;
  const variables = parseExact(o.variables);
  if (Object.hasOwn(variables, name)) return variables[name];
  return operation.variableDefinitions.find((v) => v.variable.name.value === name)?.defaultValue;
};
const isIntegerInput = (v) => v?.kind === "IntValue" || (v?.[NUMBER] !== undefined && integerOf(v) !== undefined);

const generate = async () => {
  const coercionSchemaTla = coercionSchema();
  const validationSchemaTla = validationSchema(graphql.buildSchema(SDL));
  const cases = operations.map((o) => {
    const document = graphql.parse(o.document);
    const has64 = needsExactNumbers(o.variables);
    const request = set(Object.entries(parseExact(o.variables)).map(([k, v]) => entry(k, json(v))));
    const request64 = has64 ? set(Object.entries(JSON.parse(o.variables)).map(([k, v]) => entry(k, json64(v)))) : request;
    const name = o.operationName === null ? "NoName" : `Name(${str(o.operationName)})`;
    return {
      coercion: `[doc |-> ${documentOps(document)}, name |-> ${name}, request |-> ${request}, has64 |-> ${bool(has64)}, request64 |-> ${request64}]`,
      validation: documentToTla(document),
    };
  });

  const results = operations.map(() => ({}));
  const jobs = [];
  for (let start = 0; start < cases.length; start += SHARD_SIZE) {
    const chunk = cases.slice(start, start + SHARD_SIZE);
    const k = start / SHARD_SIZE;
    jobs.push({
      name: `Coerce${k}`,
      size: chunk.length,
      module: coercionModule(`Coerce${k}`, coercionSchemaTla, chunk.map((c) => c.coercion)),
      read: (flat) => {
        let n = 0;
        for (const m of flat.matchAll(VECTOR)) {
          const r = results[start + Number(m[1]) - 1];
          r.field = m[2];
          r.answers = [0, 1, 2, 3].map((j) => answerOf(m[3 + 2 * j], m[4 + 2 * j], m[2]));
          r.binary64 = m[11] ? answerOf(m[11], m[12], m[2]) : undefined;
          r.inRange = m[13] === "TRUE";
          n++;
        }
        if (n !== chunk.length) throw new Error(`read ${n} outcomes from Coerce${k}, which has ${chunk.length} cases`);
      },
    });
    jobs.push({
      name: `Valid${k}`,
      size: chunk.length,
      module: validationModule(`Valid${k}`, validationSchemaTla, chunk.map((c) => c.validation)),
      read: (flat) => {
        let n = 0;
        for (const [, i, valid] of flat.matchAll(/<<\s*"valid",\s*(\d+),\s*(TRUE|FALSE)\s*>>/g)) {
          results[start + Number(i) - 1].valid = valid === "TRUE";
          n++;
        }
        if (n !== chunk.length) throw new Error(`read ${n} verdicts from Valid${k}, which has ${chunk.length} documents`);
      },
    });
  }
  await runJobs(jobs);

  const vectors = operations.map((o, i) => {
    const r = results[i];
    if (!r.answers || r.valid === undefined) throw new Error(`no answer for ${o.document} ${o.variables}`);
    const [expected] = r.answers;
    // The other answers the spec permits, each with the policy switches
    // that give it.
    const alternatives = [];
    POLICY_RUNS.forEach((policy, k) => {
      const a = r.answers[k + 1];
      if (answerKey(a) === answerKey(expected) || alternatives.some((x) => answerKey(x) === answerKey(a))) return;
      alternatives.push({ ...a, policy });
    });
    const binary64 = r.binary64 && answerKey(r.binary64) !== answerKey(expected) ? r.binary64 : undefined;
    const check = o.check === "id" ? (expected.outcome === "value" ? "idCoerced" : "id") : o.check;
    if (!CHECK_IDS.has(check)) throw new Error(`unknown check ${check}`);
    // Sections: the check's, plus the algorithm that raises the expected
    // kind of error. A request error before any operation was selected is
    // GetOperation's, not CoerceVariableValues'.
    const spec = [CHECKS.find((c) => c.id === check).spec[0]];
    if (expected.outcome === "request-error" && r.field !== "" && check !== "variables") spec.push("6.1.2");
    if (expected.outcome === "field-error" && check !== "arguments") spec.push("6.4.1");
    return {
      id: `coerce-${String(i + 1).padStart(4, "0")}`,
      spec,
      check,
      family: o.family,
      document: o.document,
      variables: o.variables,
      operationName: o.operationName,
      // Invalid by Validation.tla, or only because a literal doesn't coerce.
      valid: r.valid && r.inRange,
      literalOnly: r.valid && !r.inRange,
      idFromInteger: expected.outcome === "value" && isIntegerInput(idInput(o)),
      expected,
      alternatives,
      binary64,
    };
  });

  // absent-vs-null: two vectors on the same field whose arguments differ
  // only in null versus absent entries. An implementation that can't tell
  // the two apart can't show that it gets either one right, so both need
  // the capability.
  const dropNulls = (v) =>
    v === null || typeof v !== "object"
      ? v
      : Array.isArray(v)
        ? v.map(dropNulls)
        : Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, dropNulls(x)]));
  const keyOf = (v) => `${v.expected.field} ${JSON.stringify(dropNulls(v.expected.arguments))}`;
  const answers = new Map();
  for (const v of vectors.filter((x) => x.expected.outcome === "value")) {
    answers.set(keyOf(v), (answers.get(keyOf(v)) ?? new Set()).add(JSON.stringify(v.expected.arguments)));
  }
  const onlyNullVersusAbsent = (v) => v.expected.outcome === "value" && answers.get(keyOf(v)).size > 1;
  for (const v of vectors) {
    const requires = [];
    if (v.literalOnly) requires.push("unvalidated");
    if (onlyNullVersusAbsent(v)) requires.push("absent-vs-null");
    if (requires.length) v.requires = requires;
  }

  const ordered = vectors.map((v) => ({
    id: v.id,
    spec: v.spec,
    check: v.check,
    family: v.family,
    document: v.document,
    variables: v.variables,
    ...(v.operationName !== null ? { operationName: v.operationName } : {}),
    valid: v.valid,
    ...(v.requires ? { requires: v.requires } : {}),
    ...(v.idFromInteger ? { idFromInteger: true } : {}),
    expected: v.expected,
    ...(v.alternatives.length ? { alternatives: v.alternatives } : {}),
    ...(v.binary64 ? { binary64: v.binary64 } : {}),
  }));

  // The argument and input field declarations, as type text, so the kit
  // can tell a declared optional entry from one that doesn't exist.
  const declared = (defs) => Object.fromEntries(defs.map((d) => [d.name, d.typeText]));
  const inputs = {
    fields: Object.fromEntries([...model.fields].map(([name, args]) => [name, declared(args)])),
    inputObjects: Object.fromEntries([...model.types].filter(([, t]) => t.kind === "inputObject").map(([name, t]) => [name, declared(t.fields)])),
  };
  return (
    "{\n" +
    `  "source": "Expected answers from specs/Coercion.tla (ExecuteRequest, GetOperation) and document validity from specs/Validation.tla (IsValid), evaluated by tla-ts. Regenerate with node scripts/generate-vectors-coerce.mjs.",\n` +
    `  "schema": ${JSON.stringify(SDL)},\n` +
    `  "inputs": ${JSON.stringify(inputs)},\n` +
    `  "vectors": [\n${ordered.map((v) => `    ${JSON.stringify(v)}`).join(",\n")}\n  ]\n}\n`
  );
};

const started = Date.now();
const text = await generate();
const count = JSON.parse(text).vectors.length;
const seconds = ((Date.now() - started) / 1000).toFixed(1);
if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(OUT, "utf8");
  } catch {}
  if (current !== text) {
    console.log(`✗ kit/coerce/vectors.json is out of date; run node scripts/generate-vectors-coerce.mjs (${seconds}s)`);
    process.exit(1);
  }
  console.log(`✓ kit/coerce/vectors.json is up to date: ${count} vectors (${seconds}s)`);
} else {
  writeFileSync(OUT, text);
  console.log(`wrote kit/coerce/vectors.json: ${count} vectors (${seconds}s)`);
}
