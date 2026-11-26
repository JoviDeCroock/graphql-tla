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
//                      (`alternatives`). Under October 2021's rule for
//                      default values (used as they are): where that
//                      answer differs, the vector relies on a rule new in
//                      September 2025 (`since`), and the answer is an
//                      `oct2021` alternative. Under October 2021's §3.11 table of
//                      examples (no list of one made for an item whose
//                      type is a list), which its own prose contradicts:
//                      an `oct2021Example` alternative, not an edition's
//                      answer. With the variables read as a binary64
//                      JSON parser reads them, the `binary64` answer, where
//                      it differs. With a lone surrogate in a JSON string
//                      kept as sent, or replaced with U+FFFD, the
//                      `loneSurrogate` answers, where they differ;
//                      ExecuteSource wraps it for a document that doesn't
//                      parse or holds a type system definition (a request
//                      error), and for a subscription whose source stream
//                      resolver raises (`subscribe`); SourceCalled says
//                      whether that resolver runs;
//   Coercion!GetOperation    which field the selected operation runs, at
//                      the root or below it; Positions and DataOf, its
//                      response positions and the data with and without
//                      its error (`at`);
//   Lexer!StringValueAt      every string literal's Unicode text (§2.10.4),
//                      which the coercion cases hold;
//   Parser!ParseExecutable   which documents don't parse (`unparsable`),
//                      checked against graphql-js, and Lexer's tokens for
//                      the lexing family, checked the same way;
//   Validation!IsValid whether the document is valid. A document that is
//                      invalid by Validation.tla is `valid: false`. One that
//                      is only invalid because an Int or Float literal
//                      doesn't coerce (§5.6.1 asks for "coercible", which
//                      Validation.tla checks by literal kind only) is also
//                      `valid: false`, and `literalOnly`: a service may
//                      refuse it at validation or at coercion, so the kit
//                      takes a request error or a field error for it.
//
// graphql-js only parses the SDL and the documents here, and finds string
// literals in them. It never decides an answer. The generator also names,
// for each vector, the vectors that hold its list items or input object
// fields on their own (`restsOn`), and files it under a check; neither
// decides an answer.
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
import * as graphql17 from "graphql17";
import { CHECK_IDS, CHECKS } from "../kit/coerce/checks.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const cli = join(root, "node_modules/tla-ts/dist/cli.js");
const OUT = join(root, "kit/coerce/vectors.json");
const WORKERS = 2;
const SHARD_SIZE = 250;

// ---------------------------------------------------------------------------
// The schema: differential-coercion.mjs's, plus the spec's
// ExampleInputObject (§3.10) and a field that takes it, and Settings, whose
// fields are all nullable with no default: §3.10 says that when such a
// field is left out "no entry is added to the coerced unordered map", so an
// implementation that fills in 0 or false fails.

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

input Settings {
  count: Int
  ratio: Float
  enabled: Boolean
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
  settings(v: Settings): String
}
`;

// The schema of the OneOf vectors: the same, plus §3.10.1's
// ExampleOneOfInputObject and a field that takes it. It is a schema of its
// own, since @oneOf is new in September 2025: an implementation that can't
// build it fails only these vectors.
const SDL_ONEOF = SDL.replace(
  "type Mutation {",
  "input ExampleOneOfInputObject @oneOf {\n  a: String\n  b: Int\n}\n\ntype Mutation {",
).replace("  example(arg: ExampleInputObject): String\n", "  example(arg: ExampleInputObject): String\n  oneOfExample(arg: ExampleOneOfInputObject): String\n");

// The schema of the vectors below the root (capability nested-fields): the
// same, plus an object type Nested whose fields take the root fields'
// arguments, and root fields that return it, as an object, a Non-Null
// object, a list and a list of Non-Null items. The resolver of a list field
// returns two objects (docs/kit/coerce.md), so a field below it has two
// response positions. Nested's int and intNN take the same arguments as
// the root fields of those names; strict returns a Non-Null String.
const NESTED_TYPE = `type Nested {
  int(v: Int): String
  intNN(v: Int!): String
  strict(v: Int!): String!
  child: Nested
}

`;
const NESTED_FIELDS = "  nested: Nested\n  nestedNN: Nested!\n  items: [Nested]\n  itemsNN: [Nested!]\n";
const withNested = (sdl) => sdl.replace("type Mutation {", `${NESTED_TYPE}type Mutation {`).replace("type Query {\n", `type Query {\n${NESTED_FIELDS}`);
const SDL_NESTED = withNested(SDL);

// The schema of the subscription vectors (capability subscription-source): the
// same, plus a subscription root type. Its field names are unique across
// the root types, as every root field's is.
const SUBSCRIPTION_TYPE = `
type Subscription {
  event(v: Int): String
  eventNN(v: Int!): String
}
`;
const SDL_SUBSCRIPTION = SDL + SUBSCRIPTION_TYPE;

// Every schema at once, for the references: a vector's document only names
// what its own schema has, so its answer and its validity are the same.
const SDL_ALL = withNested(SDL_ONEOF) + SUBSCRIPTION_TYPE;

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

// §3.10.1's table of examples (since September 2025), as `oneOfExample(arg:
// <literal>)`, plus a few more. Where the literal uses $var, the operation
// declares `$var: ExampleOneOfInputObject`; $a and $b are String and Int.
const ONEOF_EXAMPLES = [
  ['{ oneOfExample(arg: { a: "abc" }) }', "{}"],
  ["{ oneOfExample(arg: { b: 123 }) }", "{}"],
  ["query($var: ExampleOneOfInputObject) { oneOfExample(arg: $var) }", '{"var": {"a": "abc"}}'],
  ["{ oneOfExample(arg: { a: null }) }", "{}"],
  ["query($var: ExampleOneOfInputObject) { oneOfExample(arg: $var) }", '{"var": {"a": null}}'],
  ["query($a: String) { oneOfExample(arg: { a: $a }) }", "{}"],
  ['{ oneOfExample(arg: { a: "abc", b: 123 }) }', "{}"],
  ['{ oneOfExample(arg: { a: 456, b: "xyz" }) }', "{}"],
  ["query($var: ExampleOneOfInputObject) { oneOfExample(arg: $var) }", '{"var": {"a": "abc", "b": 123}}'],
  ['{ oneOfExample(arg: { a: "abc", b: null }) }', "{}"],
  ['query($b: Int) { oneOfExample(arg: { a: "abc", b: $b }) }', "{}"],
  ["query($a: String, $b: Int) { oneOfExample(arg: { a: $a, b: $b }) }", '{"a": "abc"}'],
  ["{ oneOfExample(arg: {}) }", "{}"],
  ["query($var: ExampleOneOfInputObject) { oneOfExample(arg: $var) }", '{"var": {}}'],
  ["query($a: String!) { oneOfExample(arg: { a: $a }) }", '{"a": "abc"}'],
  ["query($a: String) { oneOfExample(arg: { a: $a }) }", '{"a": null}'],
  ["query($var: ExampleOneOfInputObject) { oneOfExample(arg: $var) }", '{"var": {"b": 7}}'],
  ["query($var: ExampleOneOfInputObject) { oneOfExample(arg: $var) }", '{"var": {"c": 1}}'],
  ["query($var: ExampleOneOfInputObject) { oneOfExample(arg: $var) }", '{"var": "abc"}'],
  ['{ oneOfExample(arg: { c: "abc" }) }', "{}"],
];

// String literals whose Unicode text (§2.10.4) is the same in every edition:
// escapes, and block strings with indentation, blank lines and an escaped
// triple quote. Each is `{ string(v: <literal>) }`. Lexer.tla gives every
// string literal's text, here and in every other vector.
const STRING_LITERALS = [
  String.raw`"\u0041\u00E9"`,
  String.raw`"a\u000Ab"`,
  String.raw`"\"\\\/\b\f\n\r\t"`,
  '"\u00e9\u{1F600}"',
  '"""simple"""',
  '""""""',
  '"""\n  first\n    second\n      third\n  """',
  '"""  first line\n    indented\n  next"""',
  '"""\n\n  x\n\n"""',
  String.raw`"""a \"""b"""`,
  String.raw`"""a\nb\u0041"""`,
  '"""\ta\r\n\t\tb\r  c"""',
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

// Settings' nullable fields with no default, left out (§3.10: "Otherwise,
// if the field is not required, then no entry is added to the coerced
// unordered map"), by a literal, a variable's map, and a variable with no
// runtime value ("If the variable definition does not provide a default
// value, the input object field definition's default value should be
// used", and there is none). Added last, so the other vectors keep their
// ids.
const OMITTED_FIELDS = [
  ["{ settings(v: {}) }", ["{}"]],
  ["{ settings(v: { count: 1 }) }", ["{}"]],
  ["{ settings(v: { ratio: 1.5 }) }", ["{}"]],
  ["{ settings(v: { enabled: true }) }", ["{}"]],
  ["query($x: Settings) { settings(v: $x) }", ['{"x": {}}', '{"x": {"count": 2}}', '{"x": {"ratio": 0.5, "enabled": false}}']],
  ["query($c: Int) { settings(v: { count: $c }) }", ["{}", '{"c": 3}']],
  ["query($e: Boolean) { settings(v: { enabled: $e, ratio: 2.5 }) }", ["{}"]],
];

// ---------------------------------------------------------------------------
// The schema, from its SDL (as differential-coercion.mjs reads it).

const sdl = graphql.parse(SDL_ALL);
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
    const oneOf = def.directives.some((d) => d.name.value === "oneOf");
    model.types.set(def.name.value, { kind: "inputObject", fields: def.fields.map(inputValue), oneOf });
  } else if (def.kind === "ObjectTypeDefinition") {
    for (const field of def.fields) {
      const args = field.arguments.map(inputValue);
      // Fields of one name take the same arguments, wherever they are.
      const known = model.fields.get(field.name.value);
      if (known && JSON.stringify(known.map((a) => a.typeText)) !== JSON.stringify(args.map((a) => a.typeText))) {
        throw new Error(`two fields named ${field.name.value} take different arguments`);
      }
      model.fields.set(field.name.value, args);
    }
  }
}
// Each object type's fields' return types, to find the way down to a field
// below the root.
const outputs = new Map(
  sdl.definitions
    .filter((d) => d.kind === "ObjectTypeDefinition")
    .map((d) => [d.name.value, new Map(d.fields.map((f) => [f.name.value, typeRef(f.type)]))]),
);
// A document's syntax tree, for finding its parts: from graphql-js 16, or
// 17 for one that 16 can't read (descriptions on operations and variables,
// new in September 2025), or null where neither parses it. Whether a
// document parses is Parser.tla's to say: for the families that rely on it,
// the generator checks that Parser.tla agrees (see parsed below).
const docs = new Map();
const docOf = (text) => {
  if (!docs.has(text)) {
    let doc = null;
    for (const g of [graphql, graphql17]) {
      try {
        doc = g.parse(text);
        break;
      } catch {}
    }
    docs.set(text, doc);
  }
  return docs.get(text);
};

// The main schema's root fields, which the families below go through one by
// one.
const MAIN_FIELDS = new Set(
  graphql.parse(SDL).definitions.filter((d) => d.kind === "ObjectTypeDefinition").flatMap((d) => d.fields.map((f) => f.name.value)),
);

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

// ---------------------------------------------------------------------------
// What a vector rests on first. A list item or an input object field that
// is a literal or a JSON value is also, on its own, the argument of a
// `literal` or `variable` vector: `[1.0]` as [Int] holds `1.0` as Int, and
// `{ x: 1, z: 1 }` as [Point!] is `{ x: 1, z: 1 }` as Point!. Where the
// implementation fails both the same way, the kit counts the outer vector's
// failure where the inner one's counts (docs/kit/coerce.md, "Attribution"),
// so that one rule broken inside a list or an input object isn't a second
// finding under §3.11 or §3.10. This only names vectors. It never decides
// an answer.

const typeText = (t) => t.wrappers.reduceRight((inner, w) => (w === "list" ? `[${inner}]` : `${inner}!`), t.name);
// A JSON value (parseExact's) written as the generator writes JSON_VALUES.
const jsonText = (v) => {
  if (v === null || typeof v === "boolean") return String(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(jsonText).join(", ")}]`;
  if (NUMBER in v) return v[NUMBER];
  return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${jsonText(x)}`).join(", ")}}`;
};
const valueText = (kind, v) => (kind === "literal" ? graphql.print(v) : jsonText(v));
const isNullOf = (kind, v) => (kind === "literal" ? v.kind === "NullValue" : v === null);
// The positions directly inside a value of a type: [type, value] pairs. A
// variable inside a literal has no vector of its own, so it is skipped.
const childrenOf = (kind, type, value) => {
  if (isNullOf(kind, value) || (kind === "literal" && value.kind === "Variable")) return [];
  if (type.wrappers[0] === "nonNull") return childrenOf(kind, { ...type, wrappers: type.wrappers.slice(1) }, value);
  const itemType = { ...type, wrappers: type.wrappers.slice(1) };
  if (type.wrappers[0] === "list") {
    const items = kind === "literal" ? (value.kind === "ListValue" ? value.values : null) : Array.isArray(value) ? value : null;
    return (items ?? [value]).filter((v) => kind !== "literal" || v.kind !== "Variable").map((v) => [itemType, v]);
  }
  const def = model.types.get(type.name);
  if (def.kind !== "inputObject") return [];
  const entries =
    kind === "literal"
      ? value.kind === "ObjectValue" ? value.fields.map((f) => [f.name.value, f.value]) : []
      : value !== null && typeof value === "object" && !Array.isArray(value) && !(NUMBER in value) ? Object.entries(value) : [];
  return entries.flatMap(([name, v]) => {
    const field = def.fields.find((f) => f.name === name);
    return field && (kind !== "literal" || v.kind !== "Variable") ? [[field.type, v]] : [];
  });
};
// The argument a vector's root field gets: its type, and the literal or
// the JSON value the request gives it, or undefined.
const argumentOf = (o) => {
  const operation = graphql.parse(o.document).definitions[0];
  const field = operation.selectionSet?.selections[0];
  const args = field?.arguments ?? [];
  if (operation.kind !== "OperationDefinition" || args.length !== 1) return undefined;
  const [argument] = args;
  const declared = model.fields.get(field.name.value).find((a) => a.name === argument.name.value);
  if (argument.value.kind !== "Variable") return { kind: "literal", type: declared.type, value: argument.value };
  const name = argument.value.name.value;
  const variables = parseExact(o.variables);
  if (!Object.hasOwn(variables, name)) return undefined;
  const definition = operation.variableDefinitions.find((v) => v.variable.name.value === name);
  return definition && { kind: "json", type: typeRef(definition.type), value: variables[name] };
};

// Where §3.12 is one of the rules an error rests on: the selected
// operation's root field gets a null, or a variable with no runtime value,
// at a Non-Null argument, input object field or list item, or an input
// object leaves out a Non-Null field that has no default, or a Non-Null
// argument with no default is left out. A variable at a Non-Null position
// counts when the request gives it null or no value and it has no default
// ("provided with a variable that was either not provided a value at
// runtime, or was provided the value null"). This only names a section. It
// never decides an answer.
// The root field the request's operation selects, as GetOperation picks
// it, and a lookup of a variable's runtime value: the request's (JSON),
// else its default (a literal), else undefined.
const selection = (o) => {
  const ops = graphql.parse(o.document).definitions.filter((d) => d.kind === "OperationDefinition");
  const operation = o.operationName === null ? (ops.length === 1 ? ops[0] : undefined) : ops.find((d) => d.name?.value === o.operationName);
  const field = operation?.selectionSet.selections[0];
  if (!field) return undefined;
  const variables = parseExact(o.variables);
  const definitions = new Map((operation.variableDefinitions ?? []).map((v) => [v.variable.name.value, v]));
  const runtime = (name) => {
    if (Object.hasOwn(variables, name)) return { kind: "json", value: variables[name] };
    const def = definitions.get(name)?.defaultValue;
    return def ? { kind: "literal", value: def } : undefined;
  };
  return { field, runtime };
};
const isNull = (kind, v) => (kind === "literal" ? v.kind === "NullValue" : v === null);

const nonNullGap = (o) => {
  const selected = selection(o);
  if (!selected) return false;
  const { field, runtime } = selected;
  const gap = (kind, type, v) => {
    if (kind === "literal" && v.kind === "Variable") {
      const r = runtime(v.name.value);
      if (type.wrappers[0] === "nonNull" && (!r || isNull(r.kind, r.value))) return true;
      return false;
    }
    if (type.wrappers[0] === "nonNull") return isNull(kind, v) || gap(kind, { ...type, wrappers: type.wrappers.slice(1) }, v);
    if (isNull(kind, v)) return false;
    const inner = { ...type, wrappers: type.wrappers.slice(1) };
    if (type.wrappers[0] === "list") {
      const items = kind === "literal" ? (v.kind === "ListValue" ? v.values : [v]) : Array.isArray(v) ? v : [v];
      return items.some((item) => gap(kind, inner, item));
    }
    const def = model.types.get(type.name);
    if (def.kind !== "inputObject") return false;
    const entries =
      kind === "literal"
        ? v.kind === "ObjectValue" ? new Map(v.fields.map((f) => [f.name.value, f.value])) : undefined
        : v !== null && typeof v === "object" && !Array.isArray(v) && !(NUMBER in v) ? new Map(Object.entries(v)) : undefined;
    if (!entries) return false;
    return def.fields.some((f) =>
      entries.has(f.name)
        ? gap(kind, f.type, entries.get(f.name))
        : f.type.wrappers[0] === "nonNull" && f.default === undefined,
    );
  };
  const args = new Map((field.arguments ?? []).map((a) => [a.name.value, a.value]));
  // A variable given as a whole argument: its JSON value, walked as the
  // argument's type.
  const walk = (type, v) => {
    if (v.kind !== "Variable") return gap("literal", type, v);
    const r = runtime(v.name.value);
    if (!r || isNull(r.kind, r.value)) return type.wrappers[0] === "nonNull";
    return gap(r.kind, type, r.value);
  };
  return (model.fields.get(field.name.value) ?? []).some((a) =>
    args.has(a.name) ? walk(a.type, args.get(a.name)) : a.type.wrappers[0] === "nonNull" && a.default === undefined,
  );
};

// Where §3.10 or §3.10.1 itself says "an execution error must be raised",
// so that a request error instead breaks that MUST rather than only
// CoerceArgumentValues' "should be treated instead as an execution error":
// a variable in an input object literal whose runtime value is null, at a
// Non-Null field (§3.10: "If the runtime value is {null} and the field type
// is non-null, an _execution error_ must be raised"), or a OneOf literal
// whose one entry is a variable with a null or no runtime value, so that
// the coerced map has no entry or a null one (§3.10.1). This only names a
// level. It never decides an answer.
const executionErrorRequired = (o) => {
  const selected = selection(o);
  if (!selected) return false;
  const { field, runtime } = selected;
  const walk = (type, v) => {
    if (v.kind === "Variable" || v.kind === "NullValue") return false;
    const inner = { ...type, wrappers: type.wrappers.slice(1) };
    if (type.wrappers[0] === "nonNull") return walk(inner, v);
    if (type.wrappers[0] === "list") return (v.kind === "ListValue" ? v.values : [v]).some((item) => walk(inner, item));
    const def = model.types.get(type.name);
    if (def.kind !== "inputObject" || v.kind !== "ObjectValue") return false;
    if (def.oneOf && v.fields.length === 1 && v.fields[0].value.kind === "Variable") {
      const r = runtime(v.fields[0].value.name.value);
      if (!r || isNull(r.kind, r.value)) return true;
    }
    return v.fields.some((f) => {
      const declared = def.fields.find((d) => d.name === f.name.value);
      if (!declared) return false;
      if (f.value.kind !== "Variable") return walk(declared.type, f.value);
      const r = runtime(f.value.name.value);
      return declared.type.wrappers[0] === "nonNull" && r !== undefined && isNull(r.kind, r.value);
    });
  };
  const declared = model.fields.get(field.name.value) ?? [];
  return (field.arguments ?? []).some((a) => {
    const d = declared.find((x) => x.name === a.name.value);
    return d !== undefined && walk(d.type, a.value);
  });
};

// Whether a document holds a code point outside October 2021's
// SourceCharacter (U+0009, U+000A, U+000D, U+0020–U+FFFF), read literally,
// as the parse area reads it: then only September 2025 and later, whose
// SourceCharacter is any Unicode scalar value, can read the document.
const outsideOctoberSource = (text) =>
  Array.from(text).some((c) => {
    const n = c.codePointAt(0);
    return !(n === 0x9 || n === 0xa || n === 0xd || (n >= 0x20 && n <= 0xffff));
  });
const SOURCE_REASON = "since September 2025, SourceCharacter is any Unicode scalar value; October 2021's is U+0009, U+000A, U+000D and U+0020–U+FFFF, which, read literally as the parse area reads it, leaves out the document's code point above U+FFFF";

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
const add = (family, check, document, variables, operationName = null, schema = undefined) =>
  operations.push({ family, check, document, variables, operationName, schema });
for (const [field, args] of model.fields) {
  if (!MAIN_FIELDS.has(field)) continue;
  if (field === "pair" || field === "example" || field === "mutate" || field === "oneOfExample" || field === "settings") continue;
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
    // The default is used, or null overrides it: §6.1.2's. A value
    // overrides it too, and is then coerced as in the variable family, so
    // that vector is filed by the value's type, as there.
    add("variable-default", "variables", withDefault, "{}");
    add("variable-default", "variables", withDefault, '{"x": null}');
    add("variable-default", checkFor(arg.type, parseExact(jsonValue)), withDefault, `{"x": ${jsonValue}}`);
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
for (const [document, variables] of ONEOF_EXAMPLES) add("oneOf", "oneOf", document, variables, null, "oneOf");
for (const literal of STRING_LITERALS) add("string-value", "stringValue", `{ string(v: ${literal}) }`, "{}");
for (const [document, names, variableSets] of OPERATIONS) {
  for (const name of names) for (const variables of variableSets) add("operation", "getOperation", document, variables, name);
}
for (const [document, variableSets] of OMITTED_FIELDS) {
  for (const variables of variableSets) add("omitted-field", "inputObject", document, variables);
}

// ---------------------------------------------------------------------------
// The families added for September 2026's statements on the request as a
// whole. They come last, so the other vectors keep their ids. Each names its
// check and sections itself (`spec`), and, where it is the twin of another
// request that must get the same answer, that request (`twin`): the vector
// rests on it (restsOn), and the generator checks that Coercion.tla gives
// both the same answer.
const fresh = (family, check, document, variables, extra = {}) =>
  operations.push({ ...extra, family, check, document, variables, operationName: extra.operationName ?? null, schema: extra.schema, fresh: true });
// A twin that isn't a vector yet is added first, in the same family.
const twinned = (family, check, document, variables, twin, extra = {}) => {
  const operationName = twin.operationName ?? extra.operationName ?? null;
  const t = { document: twin.document, variables: twin.variables ?? variables, operationName };
  if (!operations.some((o) => o.document === t.document && o.variables === t.variables && o.operationName === t.operationName && o.schema === extra.schema)) {
    fresh(family, twin.check, t.document, t.variables, { operationName, schema: extra.schema, spec: twin.spec ?? [] });
  }
  fresh(family, check, document, variables, { ...extra, twin: t });
};

// §2.10.4: block strings whose text only BlockStringValue's details give,
// and escapes and raw characters every edition reads the same way.
const MORE_STRING_LITERALS = [
  '"""\n    a\n  \n    b\n"""',
  '"""\n  a  \n  b"""',
  '"""   \n  a\n  b"""',
  '"""\n\t  a\n \t b"""',
  '"""\n"""',
  '"""a\n\n    b\n    c"""',
  String.raw`"a\u0000b"`,
  '"a\tb"',
  String.raw`"\u005C\u0022"`,
];
for (const literal of MORE_STRING_LITERALS) fresh("string-value", "stringValue", `{ string(v: ${literal}) }`, "{}");

// §2.1 lexing that only a value shows: commas and white space between
// list items and object fields (§2.1.4: "commas are optional throughout"),
// and where one number token ends (§2.10.1's lookahead). Each has a twin
// written the plain way, except the Float literals (§2.10.2), whose value
// the reference gives. Lexer.tla's tokens for these documents must be
// graphql-js's, which the generator checks.
const LEXING = [
  ["list", "{ ints(v: [1 2 3]) }", "{ ints(v: [1, 2, 3]) }", ["2.1.4"]],
  ["list", "{ ints(v: [1,,2,]) }", "{ ints(v: [1, 2]) }", ["2.1.4"]],
  ["list", "{ ints(v:[1,2,3,]) }", "{ ints(v: [1, 2, 3]) }", ["2.1.4"]],
  ["list", "{ ints(v: [1-2]) }", "{ ints(v: [1, -2]) }", ["2.10.1"]],
  ["list", "{ ints(v: [-0]) }", "{ ints(v: [0]) }", ["2.10.1"]],
  ["list", "{ matrix(v: [[1 2][3]]) }", "{ matrix(v: [[1, 2], [3]]) }", ["2.1.4"]],
  ["inputObject", "{ point(v: {x:1 y:2}) }", "{ point(v: { x: 1, y: 2 }) }", ["2.1.4"]],
  ["inputObject", "{ point(v: { x: 1,, y: 2, }) }", "{ point(v: { x: 1, y: 2 }) }", ["2.1.4"]],
  ["int", "{ int(v:-1) }", "{ int(v: -1) }", ["2.10.1"]],
  ["string", '{ string(v:"abc"#c\n) }', '{ string(v: "abc") }', ["2.1.3"]],
  ["boolean", "{ boolean(v:true,) }", "{ boolean(v: true) }", ["2.1.4"]],
];
for (const [check, document, twin, spec] of LEXING) {
  twinned("lexing", check, document, "{}", { document: twin, check }, { spec });
}
for (const literal of ["1E3", "1.5e+2", "2e-1", "0.0", "-0.0", "1.5e-3", "0e0", "123.456E-2", "-1.25E1"]) {
  fresh("lexing", "float", `{ float(v: ${literal}) }`, "{}", { spec: ["2.10.2"] });
}

// §2.7 and §2.10.8: "Arguments may be provided in any syntactic order and
// maintain identical semantic meaning", and the same for input object
// fields; JSON map keys too.
const ORDER = [
  ["{ pair(b: 2, a: 1) }", "{}", "{ pair(a: 1, b: 2) }", "arguments", ["2.7"]],
  ["{ pair(b: null, a: 1) }", "{}", "{ pair(a: 1, b: null) }", "arguments", ["2.7"]],
  ["query($a: Int, $b: Int!) { pair(b: $b, a: $a) }", '{"b": 3, "a": 1}', "query($a: Int, $b: Int!) { pair(a: $a, b: $b) }", "arguments", ["2.7"]],
  ["{ point(v: { y: 2, x: 1 }) }", "{}", "{ point(v: { x: 1, y: 2 }) }", "inputObject", ["2.10.8"]],
  ['{ point(v: { label: "p", x: 1 }) }', "{}", '{ point(v: { x: 1, label: "p" }) }', "inputObject", ["2.10.8"]],
  ["{ shape(v: { color: BLUE, origin: { y: 1, x: 2 } }) }", "{}", "{ shape(v: { origin: { x: 2, y: 1 }, color: BLUE }) }", "inputObject", ["2.10.8"]],
  ['{ example(arg: { b: 123, a: "abc" }) }', "{}", '{ example(arg: { a: "abc", b: 123 }) }', "inputObject", ["2.10.8"]],
];
for (const [document, variables, twin, check, spec] of ORDER) {
  twinned("order", "syntacticOrder", document, variables, { document: twin, check }, { spec });
}
twinned("order", "syntacticOrder", "query($x: Point) { point(v: $x) }", '{"x": {"y": 2, "x": 1}}', { document: "query($x: Point) { point(v: $x) }", variables: '{"x": {"x": 1, "y": 2}}', check: "inputObject" }, { spec: ["3.10"] });

// §2.2: "Descriptions in GraphQL executable documents ... MUST NOT affect the
// execution, validation, or response of a GraphQL document. It is safe to
// remove all descriptions and comments from executable documents without
// changing their behavior or results." Descriptions on executable
// definitions are new in September 2025 (`since`); comments are in every
// edition. Each twin is the document without them.
const DESCRIBED = [
  ['"d" query Q { int(v: 1) }', "{}", "query Q { int(v: 1) }", "int"],
  ['"""\n  block\n  text\n"""\nquery($x: Int) { int(v: $x) }', '{"x": 1}', "query($x: Int) { int(v: $x) }", "int"],
  ['query("d" $x: Int) { int(v: $x) }', '{"x": 1}', "query($x: Int) { int(v: $x) }", "int"],
  ['query("""multi\n  line""" $x: Int = 4) { int(v: $x) }', "{}", "query($x: Int = 4) { int(v: $x) }", "variables"],
  ['query("d" $x: Int!) { intNN(v: $x) }', "{}", "query($x: Int!) { intNN(v: $x) }", "variables"],
  ['"query { string } $x # { not a comment" query Q { string(v: "s") }', "{}", 'query Q { string(v: "s") }', "string"],
  ['"d" mutation { mutate(v: 1) }', "{}", "mutation { mutate(v: 1) }", "getOperation"],
  ['query Q("a" $a: Int, "b" $b: Int!) { pair(a: $a, b: $b) }', '{"a": 1, "b": 2}', "query Q($a: Int, $b: Int!) { pair(a: $a, b: $b) }", "arguments"],
];
for (const [document, variables, twin, check] of DESCRIBED) {
  twinned("descriptions", "descriptionsInert", document, variables, { document: twin, check }, { spec: ["2.2"], since: "September2025" });
}
twinned("descriptions", "descriptionsInert", '"first" query A { int(v: 1) } "second" query B { string(v: "b") }', "{}",
  { document: 'query A { int(v: 1) } query B { string(v: "b") }', check: "getOperation" }, { spec: ["2.2"], since: "September2025", operationName: "B" });
const COMMENTED = [
  ["query # c\n($x: Int # c2\n) { int(v: $x) # c3\n}", '{"x": 1}', "query($x: Int) { int(v: $x) }", "int"],
  ["{ int(v: # c\n 5) }", "{}", "{ int(v: 5) }", "int"],
  ['# leading "quote\n{ string(v: "s") } # trailing', "{}", '{ string(v: "s") }', "string"],
  ["{ int(v: 1) }#", "{}", "{ int(v: 1) }", "int"],
  ["query($x: Int!) { intNN(v: $x) } # $x: Int = 1", "{}", "query($x: Int!) { intNN(v: $x) }", "variables"],
];
for (const [document, variables, twin, check] of COMMENTED) {
  twinned("descriptions", "descriptionsInert", document, variables, { document: twin, check }, { spec: ["2.2", "2.1.3"] });
}
twinned("descriptions", "descriptionsInert", 'query A { int(v: 1) }\n# query B { string(v: "b") }', "{}",
  { document: "query A { int(v: 1) }", check: "getOperation" }, { spec: ["2.2", "2.1.3"] });

// §2.1.8: "Names in GraphQL are case-sensitive ... Underscores are
// significant": operation names that differ only so.
const NAMED = [
  ['query A { int(v: 1) } query a { string(v: "b") }', ["a", "A"]],
  ["query A { int(v: 1) }", ["a"]],
  ['query getValue { int(v: 1) } query getvalue { string(v: "b") }', ["getvalue", "getValue"]],
  ['query a_b { int(v: 1) } query ab { string(v: "b") }', ["ab", "a_b"]],
];
for (const [document, names] of NAMED) for (const name of names) fresh("operation", "getOperation", document, "{}", { operationName: name, spec: ["2.1.8"] });

// §2.3: "A Document which contains TypeSystemDefinitionOrExtension must not
// be executed", and §6: a request's document "must contain GraphQL
// OperationDefinition".
const NOT_EXECUTABLE = [
  ["type T { a: Int }", null],
  ["type T { a: Int } query { int(v: 1) }", null],
  ["query { int(v: 1) } extend type Query { more: Int }", null],
  ['scalar S\nquery Q { string(v: "s") }', "Q"],
  ["query Q { int(v: 1) } directive @d on FIELD", "Q"],
  ["schema { query: Query } query Q { int(v: 1) }", "Q"],
];
for (const [document, operationName] of NOT_EXECUTABLE) fresh("not-executable", "notExecutable", document, "{}", { operationName, spec: ["6.1"] });

// §6: the executor "must have a parsed Document"; a source that doesn't
// parse is a request error (§7.1.6: "a request error may occur due to a
// parse grammar or validation error in the Document"). Parser.tla says
// which sources don't parse.
const UNPARSABLE = [
  ["{ int(v: 1) ", "{}"],
  ["", "{}"],
  ['{ int(v: "unterminated) }', "{}"],
  ["{ int(v: 01) }", "{}"],
  ["{ int(v: 1.) }", "{}"],
  ["{ int(v: 1e) }", "{}"],
  ["{ int(v: $) }", "{}"],
  ["query($x: Int) { int(v: $x)", '{"x": 1}'],
  ["query($x: Int) { int(v: $x)", '{"x": "a"}'],
  ["{ int(v: 1) } }", "{}"],
  ["{ int(v: 1) } garbage", "{}"],
  ['"d" { int(v: 1) }', "{}"],
  ["{ int(v: 1)) }", "{}"],
  ["query Q($x: Int = $y) { int(v: $x) }", "{}"],
  ["{ int(v: 1x) }", "{}"],
  ["{ string(v: \"\\x\") }", "{}"],
];
for (const [document, variables] of UNPARSABLE) fresh("unparsable", "syntaxError", document, variables, { spec: ["6.1"], unparsable: true });

// Selections only an invalid document has at the root (for adapters with
// `unvalidated`; others get them as invalid documents): §6.3.2 CollectFields
// "If no such fragment exists, continue", and §6.3.3 "If fieldType is
// defined".
const UNVALIDATED = [
  ["{ int(v: 1) ...Missing }", "{}", ["6.3.2"]],
  ["{ int(v: 1) nope }", "{}", ["6.3.3"]],
  ["{ int(v: 1) nope(x: 1) { a } }", "{}", ["6.3.3"]],
  ["{ intNN(v: null) nope ...Missing }", "{}", ["6.3.2", "6.3.3"]],
];
for (const [document, variables, spec] of UNVALIDATED) fresh("unvalidated", "unvalidatedBranches", document, variables, { spec });

// §6.2.3.1 CreateSourceEventStream (capability subscription-source). `subscribe`
// says what the subscription field's source stream resolver does:
// "stream", return a source stream with one event; "raise", raise an error.
// Errors raised there are raised before operation execution begins, so the
// response "must be a request error result" (§7.1.5), new in September
// 2026 (`since`), and so is an argument of the root field that doesn't
// coerce (sourceStreamArguments). `typeCheck`: the check a value counts
// against there.
const SUBSCRIPTIONS = [
  ["sourceStream", "subscription { event(v: 1) }", "{}", "stream", {}],
  ["sourceStream", "subscription { alias: event(v: 2) }", "{}", "stream", {}],
  ["sourceStream", "subscription($x: Int) { event(v: $x) }", '{"x": 3}', "stream", {}],
  ["sourceStream", "subscription S { event }", "{}", "stream", { operationName: "S" }],
  ["sourceStream", "query Q { int(v: 1) } subscription S { event(v: 1) }", "{}", "raise", { operationName: "Q" }],
  ["sourceStreamArguments", "subscription { eventNN(v: null) }", "{}", "stream", { typeCheck: "nonNull" }],
  ["sourceStreamArguments", "subscription { eventNN }", "{}", "stream", { typeCheck: "nonNull" }],
  ["sourceStreamArguments", "subscription($x: Int) { eventNN(v: $x) }", '{"x": null}', "stream", { typeCheck: "nonNull" }],
  ["sourceStreamArguments", 'subscription { event(v: "a") }', "{}", "stream", { typeCheck: "int" }],
  ["sourceStreamArguments", "subscription($x: Int = 1) { eventNN(v: $x) }", '{"x": null}', "stream", { typeCheck: "nonNull" }],
  ["variables", "subscription($x: Int) { event(v: $x) }", '{"x": "a"}', "stream", {}],
  ["sourceStreamError", "subscription { event(v: 1) }", "{}", "raise", {}],
  ["sourceStreamError", "subscription($x: Int) { event(v: $x) }", '{"x": 1}', "raise", {}],
  ["sourceStreamError", "subscription { a: event(v: 1) }", "{}", "raise", {}],
  ["sourceStreamError", "query Q { int(v: 1) } subscription S { event(v: 1) }", "{}", "raise", { operationName: "S" }],
  ["unvalidatedBranches", "subscription { event(v: 1) eventNN(v: 1) }", "{}", "stream", {}],
  ["unvalidatedBranches", "subscription { event(v: 1) nope }", "{}", "stream", {}],
  ["unvalidatedBranches", "subscription { event(v: 1) ...Missing }", "{}", "stream", {}],
];
const SUBSCRIPTION_SPEC = {
  sourceStream: ["6.2.3.1"],
  sourceStreamArguments: ["6.2.3.1", "6.4.1", "7.1.5"],
  variables: ["6.2.3.1"],
  sourceStreamError: ["7.1.6", "6.2.3.1"],
  unvalidatedBranches: ["6.2.3.1"],
};
for (const [check, document, variables, subscribe, extra] of SUBSCRIPTIONS) {
  const since = check === "sourceStreamError" || check === "sourceStreamArguments" ? "September2026" : undefined;
  fresh("subscription", check, document, variables, { ...extra, schema: "subscription", subscribe, spec: SUBSCRIPTION_SPEC[check], since });
}

// §6.4.1 and §6.4.4 below the root (capability nested-fields): an argument
// error on a field inside an object, a list, a Non-Null object or list,
// with aliases. The execution error nulls the field's response position,
// at its path, and propagates to the nearest nullable parent.
const NESTED = [
  ["argumentsBelowRoot", "{ nested { int(v: 1) } }", "{}"],
  ["argumentsBelowRoot", "{ nested { intNN(v: null) } }", "{}"],
  ["argumentsBelowRoot", "{ nested { strict(v: null) } }", "{}"],
  ["argumentsBelowRoot", "{ nestedNN { strict(v: null) } }", "{}"],
  ["argumentsBelowRoot", "{ items { intNN(v: null) } }", "{}"],
  ["argumentsBelowRoot", "{ items { strict(v: null) } }", "{}"],
  ["argumentsBelowRoot", "{ itemsNN { intNN(v: null) } }", "{}"],
  ["argumentsBelowRoot", "{ items { int(v: 2) } }", "{}"],
  ["argumentsBelowRoot", "{ a: nested { b: intNN(v: null) } }", "{}"],
  ["argumentsBelowRoot", "{ a: items { b: strict(v: null) } }", "{}"],
  ["argumentsBelowRoot", "{ nested { child { strict(v: null) } } }", "{}"],
  ["argumentsBelowRoot", "{ nested { child { int(v: 3) } } }", "{}"],
  ["argumentsBelowRoot", '{ nested { int(v: "a") } }', "{}"],
  ["argumentsBelowRoot", "query($x: Int) { nested { intNN(v: $x) } }", '{"x": null}'],
  ["argumentsBelowRoot", "query($x: Int) { items { strict(v: $x) } }", "{}"],
  // Valid documents (a nullable variable with a default may be used where a
  // Non-Null type is expected, §5.8.5), whose runtime null still fails.
  ["argumentsBelowRoot", "query($x: Int = 1) { nested { intNN(v: $x) } }", '{"x": null}'],
  ["argumentsBelowRoot", "query($x: Int = 1) { items { strict(v: $x) } }", '{"x": null}'],
  ["variables", 'query($x: Int) { nested { int(v: $x) } }', '{"x": "a"}'],
  ["variables", "query($x: Int!) { nested { int(v: $x) } }", "{}"],
];
for (const [check, document, variables] of NESTED) {
  fresh("nested", check, document, variables, { schema: "nested", spec: check === "variables" ? ["6.4.4"] : [] });
}

// §6: a request's "extensions (optional): A map reserved for
// implementation-specific additional information. ... If present,
// extensions must be a map, but there are no additional restrictions on its
// contents" (capability request-extensions). Each twin is the request
// without them.
const EXTENDED = [
  ["query($x: Int) { int(v: $x) }", '{"x": 1}', '{"graphql-tla": {"probe": [1, null, {"a": "b"}]}}', "int"],
  ["{ intNN(v: null) }", "{}", "{}", "nonNull"],
  ["query($x: Int) { int(v: $x) }", '{"x": "a"}', '{"graphql-tla": true}', "int"],
  ['query A { int(v: 1) } query B { string(v: "b") }', "{}", '{"graphql-tla-operationName": "B"}', "getOperation", "A"],
  ['{ string(v: "s") }', "{}", '{"graphql-tla": {"variables": {"x": 1}, "query": "{ int }"}}', "string"],
];
for (const [document, variables, extensions, check, operationName] of EXTENDED) {
  twinned("extensions", "requestExtensions", document, variables, { document, check }, { spec: [], extensions, operationName });
}

// §3.5.2: a Float literal "not representable by finite IEEE 754" is an
// error. A decimal is representable when it rounds to a finite double, that
// is when it is below 2^1024 - 2^970 (Coercion!DoubleOverflow), not below
// the largest double's shortest decimal, 1.7976931348623157e308: the first
// two round to the largest double, the third to Infinity. Literal vectors
// like LITERALS', added last so the other vectors keep their ids.
for (const literal of ["1.7976931348623158e308", "-1.7976931348623158e308", "1.7976931348623159e308"]) {
  add("literal", "float", `{ float(v: ${literal}) }`, "{}");
}

// §6.1 GetOperation precedes §6.1.2 CoerceVariableValues: ambiguous or unknown
// operationName fails with a request error even when variables are missing or
// invalid for one of the operations.
const OPERATION_PRECEDENCE = [
  ["query A($x: Int) { int(v: $x) } query B($y: Int!) { intNN(v: $y) }", [null, "C"], ["{}", '{"x": "bad", "y": "bad"}']],
  ["query A($x: Int!) { intNN(v: $x) }", ["Missing"], ["{}", '{"x": "bad"}']],
];
for (const [document, names, variableSets] of OPERATION_PRECEDENCE) {
  for (const operationName of names) {
    for (const variables of variableSets) {
      fresh("operation", "getOperation", document, variables, { operationName, spec: ["6.1"] });
    }
  }
}

// ---------------------------------------------------------------------------
// TLA+ encodings for Coercion.tla (as in differential-coercion.mjs)

// A string as a TLA+ string. A code unit that isn't printable ASCII, or is
// a quote or a backslash, is written as the JSON escape \uXXXX, in the
// TLA+ string as six characters: JsonOf below writes it out as it is, and
// JSON.parse reads it back. Coercion.tla only compares strings with names
// and digits, which are plain ASCII.
const str = (s) => {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    out += code >= 0x20 && code < 0x7f && code !== 0x22 && code !== 0x5c ? s[i] : `\\\\u${code.toString(16).padStart(4, "0")}`;
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
const strV = (s, wellFormed = s.isWellFormed()) => `StrW(${str(s)}, ${bool(wellFormed)})`;
const entry = (key, value) => `Entry(${str(key)}, ${value})`;
const typeTla = (t) => `[name |-> ${str(t.name)}, wrappers |-> ${seq(t.wrappers.map(str))}]`;

const literal = (node) => {
  switch (node.kind) {
    case "NullValue": return "NullV";
    case "IntValue": return num("int", node.value);
    case "FloatValue": return num("float", node.value);
    case "StringValue": return strV(stringText(node));
    case "BooleanValue": return `Bool(${bool(node.value)})`;
    case "EnumValue": return `EnumV(${str(node.value)})`;
    case "Variable": return `VarV(${str(node.name.value)})`;
    case "ListValue": return `ListV(${seq(node.values.map(literal))})`;
    case "ObjectValue": return `ObjV(${set(node.fields.map((f) => entry(f.name.value, literal(f.value))))})`;
    default: throw new Error(`unexpected literal ${node.kind}`);
  }
};
// A string literal's Unicode text, as Lexer.tla gives it (StringValueAt):
// graphql-js only finds the literal in the source.
const stringTexts = new Map();
const stringSource = (node) => node.loc.source.body.slice(node.loc.start, node.loc.end);
const stringText = (node) => {
  const text = stringTexts.get(stringSource(node));
  if (text === undefined) throw new Error(`no text from Lexer.tla for ${stringSource(node)}`);
  return text;
};
// strings: how a JSON string with a lone surrogate reaches coercion: "as
// read" (not a valid Unicode string), "kept" (taken as a string anyway) or
// "replaced" (each lone surrogate replaced with U+FFFD).
const json = (value, strings = "as read") => {
  if (value === null) return "NullV";
  if (typeof value === "string") {
    return strings === "kept" ? strV(value, true) : strV(strings === "replaced" ? value.toWellFormed() : value);
  }
  if (typeof value === "boolean") return `Bool(${bool(value)})`;
  if (Array.isArray(value)) return `ListV(${seq(value.map((v) => json(v, strings)))})`;
  if (NUMBER in value) return num("number", value[NUMBER]);
  return `ObjV(${set(Object.entries(value).map(([k, v]) => entry(k, json(v, strings))))})`;
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
    return `(${str(name)} :> [kind |-> "inputObject", values |-> {}, fields |-> ${seq(def.fields.map(defTla))}${def.oneOf ? ", oneOf |-> TRUE" : ""}])`;
  });
  const fields = [...model.fields].map(([name, args]) => `(${str(name)} :> ${seq(args.map(defTla))})`);
  return `[types |-> ${types.join(" @@ ")},\n  fields |-> ${fields.join(" @@ ")}]`;
};
// A document as Coercion.tla's sequence of operations.
const ROOT_TYPES = { query: "Query", mutation: "Mutation", subscription: "Subscription" };
const responseKey = (field) => field.alias?.value ?? field.name.value;
// An operation as Coercion.tla's OpAt: the way down from the root to the
// first field with no selection set, one Step per field on the way (each
// with a single selection), that field, and the root selection set's other
// selections, which only the invalid documents of the unvalidated family
// have: a spread of a fragment the document doesn't define, a field the
// root type doesn't define, or a subscription's second root field.
const operationTla = (operation, fragments) => {
  const rootType = ROOT_TYPES[operation.operation];
  const [first, ...rest] = operation.selectionSet.selections;
  const parents = [];
  let field = first;
  let typeName = rootType;
  while (field.selectionSet) {
    const type = outputs.get(typeName).get(field.name.value);
    const nonNull = type.wrappers[0] === "nonNull";
    const wrappers = nonNull ? type.wrappers.slice(1) : type.wrappers;
    if (field.selectionSet.selections.length !== 1 || (field.arguments ?? []).length) throw new Error(`can't encode ${graphql.print(operation)}`);
    parents.push(`Step(${str(responseKey(field))}, ${bool(nonNull)}, ${bool(wrappers[0] === "list")}, ${bool(wrappers[0] === "list" && wrappers[1] === "nonNull")})`);
    typeName = type.name;
    field = field.selectionSet.selections[0];
  }
  const returnType = outputs.get(typeName)?.get(field.name.value);
  const others = rest.map((s) => {
    if (s.kind === "FragmentSpread" && !fragments.has(s.name.value)) return `[kind |-> "spread", name |-> ${str(s.name.value)}]`;
    if (s.kind === "Field" && (operation.operation === "subscription" || !outputs.get(rootType).has(s.name.value))) {
      return `[kind |-> "field", name |-> ${str(s.name.value)}]`;
    }
    throw new Error(`Coercion.tla has no model of a second root selection that runs: ${graphql.print(operation)}`);
  });
  const variables = (operation.variableDefinitions ?? []).map((v) =>
    defTla({ name: v.variable.name.value, type: typeRef(v.type), default: v.defaultValue }),
  );
  const args = (field.arguments ?? []).map((a) => entry(a.name.value, literal(a.value)));
  return `OpAt(${str(operation.operation)}, ${str(operation.name?.value ?? "")}, ${seq(variables)}, ${seq(parents)}, ${str(responseKey(field))}, ${str(field.name.value)}, ${bool(returnType?.wrappers[0] === "nonNull")}, ${set(args)}, ${seq(others)})`;
};
const EXECUTABLE = new Set(["OperationDefinition", "FragmentDefinition"]);
// A request's source text as Coercion.tla's Given: whether it parses (null:
// it doesn't), whether it holds a type system definition or extension, and
// its operations.
const givenTla = (document) => {
  if (document === null) return "Given(FALSE, FALSE, <<>>)";
  const fragments = new Set(document.definitions.filter((d) => d.kind === "FragmentDefinition").map((d) => d.name.value));
  const operationsTla = document.definitions.filter((d) => d.kind === "OperationDefinition").map((d) => operationTla(d, fragments));
  return `Given(TRUE, ${bool(document.definitions.some((d) => !EXECUTABLE.has(d.kind)))}, ${seq(operationsTla)})`;
};

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
    // Validation.tla only needs the kind: a character TLA+ strings can't
    // hold plainly is written as its code, which keeps distinct strings
    // distinct.
    case "StringValue": return base("string", [...v.value].map((c) => (/[\x20-\x7e]/.test(c) && c !== "\\" && c !== "\"" ? c : `<${c.codePointAt(0)}>`)).join(""));
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
// A source that doesn't parse has no document to validate: the empty one
// stands in, and the vector is invalid whatever Validation.tla says.
const documentToTla = (doc) =>
  seq(
    (doc?.definitions ?? []).map((d) => {
      if (!EXECUTABLE.has(d.kind)) {
        return `[kind |-> "typeSystem", operation |-> "", name |-> ${vstr(d.name?.value ?? "")}, variables |-> <<>>, typeCondition |-> "", directives |-> <<>>, selectionSet |-> <<>>]`;
      }
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
// outcome and coerced arguments as JSON text under each policy, under
// October 2021's rules, with the variables as a binary64 parser reads them,
// and with a lone surrogate kept or replaced; and whether every Int and
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
    [] v.kind \\in {"int", "float"} /\\ t.name \\in {"Int", "Float"} -> CoerceScalar(Schema, t.name, v).ok
    [] OTHER -> TRUE
LiteralsInRange(op) ==
  LET args == Schema.fields[op.field] IN
  /\\ \\A e \\in op.arguments : \\A i \\in DOMAIN args : args[i].name = e.key => InRange(args[i].type, e.value)
  /\\ \\A i \\in DOMAIN op.variables : op.variables[i].hasDefault => InRange(op.variables[i].type, op.variables[i].default)

\\* A response path as JSON text: names are strings, indices numbers.
PathText(p) == "[" \\o Join([i \\in DOMAIN p |-> ToString(p[i])]) \\o "]"

Policy(enumFromString, inputFieldDefaults) == [enumFromString |-> enumFromString, inputFieldDefaults |-> inputFieldDefaults]
Answer(S, c, request) ==
  LET outcome == ExecuteSource(S, c.given, c.name, request, c.source) IN
  <<outcome.kind, IF outcome.kind = "resolved" THEN JsonOf(outcome.args) ELSE "">>

ASSUME \\A i \\in DOMAIN Cases :
  LET c == Cases[i]
      selected == GetOperation(c.given.operations, c.name)
  IN PrintT(<<"vector", i, IF selected.ok THEN selected.operation.field ELSE "",
              Answer(Schema, c, c.request),
              Answer(WithPolicy(Schema, Policy(FALSE, TRUE)), c, c.request),
              Answer(WithPolicy(Schema, Policy(TRUE, FALSE)), c, c.request),
              Answer(WithPolicy(Schema, Policy(FALSE, FALSE)), c, c.request),
              Answer(WithPolicy(Schema, [DefaultPolicy EXCEPT !.missingListItem = "error"]), c, c.request),
              Answer(WithPolicy(Schema, [DefaultPolicy EXCEPT !.missingListItem = "drop"]), c, c.request),
              Answer(WithPolicy(Schema, [DefaultPolicy EXCEPT !.floatRounded = TRUE]), c, c.request),
              Answer(WithPolicy(Schema, [DefaultPolicy EXCEPT !.variableItemWrapped = TRUE]), c, c.request),
              Answer(WithPolicy(Schema, [DefaultPolicy EXCEPT !.coerceDefaults = FALSE]), c, c.request),
              Answer(WithPolicy(Schema, [DefaultPolicy EXCEPT !.nestedListItems = FALSE]), c, c.request),
              Answer(WithPolicy(Schema, [DefaultPolicy EXCEPT !.coerceDefaults = FALSE, !.nestedListItems = FALSE]), c, c.request),
              IF c.has64 THEN Answer(Schema, c, c.request64) ELSE <<"", "">>,
              IF c.hasLone THEN Answer(Schema, c, c.requestKept) ELSE <<"", "">>,
              IF c.hasLone THEN Answer(Schema, c, c.requestReplaced) ELSE <<"", "">>,
              \\A j \\in DOMAIN c.given.operations : LiteralsInRange(c.given.operations[j]),
              SourceCalled(Schema, c.given, c.name, c.request),
              IF selected.ok THEN JsonOf(DataOf(selected.operation, TRUE)) ELSE "",
              IF selected.ok THEN JsonOf(DataOf(selected.operation, FALSE)) ELSE "",
              IF selected.ok THEN "[" \\o Join(SetToSeq({PathText(p) : p \\in Positions(selected.operation)})) \\o "]" ELSE "">>)
ASSUME PrintT(<<"done", Len(Cases)>>)

OneState == section = "scalar"
====
`;

// Each string literal's Unicode text, as a sequence of code points.
const lexerModule = (name, sources) => `---- MODULE ${name} ----
EXTENDS Lexer, TLC

Sources == ${seq(sources.map((src) => seq([...src].map((c) => String(c.codePointAt(0))))))}

ASSUME \\A i \\in DOMAIN Sources :
  LET r == StringValueAt(Sources[i], 1) IN PrintT(<<"text", i, r.ok /\\ r.end = Len(Sources[i]) + 1, r.value>>)
ASSUME PrintT(<<"done", Len(Sources)>>)

OneState == vector = [group |-> "Strings", n |-> 1]
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
    cpSync(join(root, "specs/Lexer.tla"), join(dir, "Lexer.tla"));
    cpSync(join(root, "specs/Parser.tla"), join(dir, "Parser.tla"));
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
// the switches each one turns off or sets (specs/Coercion.tla, "What the
// spec leaves to the implementation"), as kit/coerce/checks.mjs's POLICIES
// name them. A MAY-only policy comes first, so an answer it explains is
// recorded as needing only the MAY. missingListItemError and
// missingListItemDropped are the other readings of a list item that is a
// variable with no runtime value, floatRounded the other reading of
// Float's "outside the available precision", and variableItemWrapped the
// other reading of a variable item whose value isn't a list at a list item
// type (only in an invalid document).
const POLICY_RUNS = [
  ["enumFromString"],
  ["inputFieldDefaults"],
  ["enumFromString", "inputFieldDefaults"],
  ["missingListItemError"],
  ["missingListItemDropped"],
  ["floatRounded"],
  ["variableItemWrapped"],
];
const TEXT = String.raw`"((?:[^"\\]|\\.)*)"`;
const ANSWER = String.raw`<<\s*"(\w*)",\s*${TEXT}\s*>>`;
// The field, then the answers: the default policy's, POLICY_RUNS', with
// each of October 2021's rules and with both, the binary64 one, and with a
// lone surrogate kept and replaced; then whether the literals coerce.
const EDITION_RUNS = ["coerceDefaults", "nestedListItems", "both"];
const ANSWERS = 1 + POLICY_RUNS.length + EDITION_RUNS.length + 3;
const VECTOR = new RegExp(
  String.raw`<<\s*"vector",\s*(\d+),\s*"(\w*)",\s*${Array(ANSWERS).fill(ANSWER).join(String.raw`,\s*`)},\s*(TRUE|FALSE),\s*(TRUE|FALSE),\s*${Array(3).fill(TEXT).join(String.raw`,\s*`)}\s*>>`,
  "g",
);
// Every rule a coerce vector relies on that October 2021 doesn't have is in
// September 2025: default value coercion (#793), OneOf Input Objects
// (#825) and SourceCharacter as any Unicode scalar value (#849).
const SINCE = "September2025";
// Why a vector of the families added for September 2026 relies on a newer
// edition.
const FRESH_REASONS = {
  September2025:
    "descriptions on operations and variable definitions are new in September 2025 (§2.2, OperationDefinition and VariableDefinition take a Description): October 2021's grammar has none, so it can't read the document",
  September2026:
    "new in September 2026: ExecuteRequest runs CreateSourceEventStream before operation execution begins (§6.1, §6.2), §7.1.5 says the response to an error raised before then must be a request error result, and §7.1.6 counts a failure to establish a source event stream among request errors. September 2025 runs CreateSourceEventStream inside Subscribe, and its §7.1.6 doesn't name it",
};
// Response paths in a fixed order.
const sortedPaths = (paths) => paths.map((p) => [JSON.stringify(p), p]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, p]) => p);
const EDITION_REASON = "since September 2025, a default value is coerced (CoerceVariableValues, CoerceArgumentValues, §3.10); October 2021 uses it as it is";
const ONEOF_REASON = "OneOf Input Objects (§3.10.1, @oneOf) are new in September 2025: under October 2021 the schema is invalid";
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
// Whether a JSON text has a string with a lone surrogate.
const hasLoneSurrogate = (text) => {
  let found = false;
  JSON.parse(text, (_key, value) => {
    if (typeof value === "string" && !value.isWellFormed()) found = true;
    return value;
  });
  return found;
};
const isIntegerInput = (v) => v?.kind === "IntValue" || (v?.[NUMBER] !== undefined && integerOf(v) !== undefined);

// Whether each document of the families added for September 2026 parses
// as an ExecutableDocument, and its tokens, from Parser.tla and Lexer.tla.
const parserModule = (name, sources) => `---- MODULE ${name} ----
EXTENDS Parser, TLC

Sources == ${seq(sources.map((src) => seq([...src].map((c) => String(c.codePointAt(0))))))}

ASSUME \\A i \\in DOMAIN Sources :
  LET lexed == Lex(Sources[i]) IN
  PrintT(<<"parsed", i, ParseExecutable(Sources[i]).ok,
           [k \\in DOMAIN lexed.tokens |-> <<lexed.tokens[k].kind, lexed.tokens[k].value>>]>>)
ASSUME PrintT(<<"done", Len(Sources)>>)

OneState == vector = [group |-> "Parsed", n |-> 1]
====
`;

// graphql-js 16's tokens for a document, as Lexer.tla names them; a
// string's value is left out, since Lexer.tla gives its text, not its raw
// source.
const PUNCTUATOR_KINDS = new Set(["!", "$", "&", "(", ")", "...", ":", "=", "@", "[", "]", "{", "|", "}"]);
const graphqlTokens = (text) => {
  const lexer = new graphql.Lexer(new graphql.Source(text));
  const tokens = [];
  for (let t = lexer.advance(); t.kind !== "<EOF>"; t = lexer.advance()) {
    if (PUNCTUATOR_KINDS.has(t.kind)) tokens.push(["Punctuator", t.kind]);
    else tokens.push([{ Name: "Name", Int: "IntValue", Float: "FloatValue", String: "StringValue", BlockString: "BlockString" }[t.kind], t.kind === "String" || t.kind === "BlockString" ? "" : t.value]);
  }
  return tokens;
};

// Parser.tla's verdict on every document of the families added for
// September 2026: the unparsable ones must not parse, and graphql-js must
// not parse them either; every other one must parse, except a document
// with type system definitions, which isn't an ExecutableDocument (a
// service that permits only those refuses it too, and the answer is a
// request error either way). For the lexing family, Lexer.tla's tokens
// must be graphql-js's, so the literals the generator reads from graphql-js
// are the reference's.
const checkParsed = async () => {
  const fresh = operations.filter((o) => o.fresh);
  const sources = [...new Set(fresh.map((o) => o.document))];
  const verdicts = new Map();
  await runJobs([
    {
      name: "Parsed",
      size: sources.length,
      module: parserModule("Parsed", sources),
      read: (flat) => {
        const token = /<<\s*"(\w+)",\s*<<([\d,\s]*)>>\s*>>/g;
        for (const m of flat.matchAll(/<<\s*"parsed",\s*(\d+),\s*(TRUE|FALSE),\s*<<((?:\s*<<\s*"\w+",\s*<<[\d,\s]*>>\s*>>\s*,?)*)\s*>>\s*>>/g)) {
          const tokens = [...m[3].matchAll(token)].map(([, kind, points]) => [
            kind,
            String.fromCodePoint(...points.split(",").map((x) => x.trim()).filter(Boolean).map(Number)),
          ]);
          verdicts.set(sources[Number(m[1]) - 1], { parses: m[2] === "TRUE", tokens });
        }
        if (verdicts.size !== sources.length) throw new Error(`read ${verdicts.size} verdicts from Parser.tla, which has ${sources.length} documents`);
      },
    },
  ]);
  for (const o of fresh) {
    const { parses, tokens } = verdicts.get(o.document);
    const doc = docOf(o.document);
    if (o.unparsable) {
      if (parses || doc !== null) throw new Error(`expected a syntax error, but ${parses ? "Parser.tla" : "graphql-js"} parses ${JSON.stringify(o.document)}`);
    } else if (!doc || (!parses && doc.definitions.every((d) => EXECUTABLE.has(d.kind)))) {
      throw new Error(`${parses ? "graphql-js" : "Parser.tla"} doesn't parse ${JSON.stringify(o.document)}`);
    }
    if (o.family === "lexing") {
      const ours = tokens.map(([kind, value]) => [kind, kind === "StringValue" || kind === "BlockString" ? "" : value]);
      if (JSON.stringify(ours) !== JSON.stringify(graphqlTokens(o.document))) {
        throw new Error(`Lexer.tla and graphql-js read different tokens in ${JSON.stringify(o.document)}: ${JSON.stringify(ours)}`);
      }
    }
  }
};

const generate = async () => {
  // Every string literal's text first, from Lexer.tla: the coercion cases
  // hold it.
  const sources = new Set();
  const collect = (doc) =>
    graphql.visit(doc, {
      StringValue: (node) => {
        sources.add(stringSource(node));
      },
    });
  collect(sdl);
  for (const o of operations) {
    const doc = docOf(o.document);
    if (doc) collect(doc);
  }
  const sourceList = [...sources];
  await runJobs([
    {
      name: "Strings",
      size: sourceList.length,
      module: lexerModule("Strings", sourceList),
      read: (flat) => {
        let n = 0;
        for (const [, i, ok, points] of flat.matchAll(/<<\s*"text",\s*(\d+),\s*(TRUE|FALSE),\s*<<([\d,\s]*)>>\s*>>/g)) {
          const source = sourceList[Number(i) - 1];
          if (ok !== "TRUE") throw new Error(`Lexer.tla doesn't read ${source} as one string literal`);
          stringTexts.set(source, String.fromCodePoint(...points.split(",").map((x) => x.trim()).filter(Boolean).map(Number)));
          n++;
        }
        if (n !== sourceList.length) throw new Error(`read ${n} string texts from Lexer.tla, which has ${sourceList.length}`);
      },
    },
  ]);

  const coercionSchemaTla = coercionSchema();
  const validationSchemaTla = validationSchema(graphql.buildSchema(SDL_ALL));
  await checkParsed();
  const cases = operations.map((o) => {
    const document = docOf(o.document);
    const has64 = needsExactNumbers(o.variables);
    const request = set(Object.entries(parseExact(o.variables)).map(([k, v]) => entry(k, json(v))));
    const request64 = has64 ? set(Object.entries(JSON.parse(o.variables)).map(([k, v]) => entry(k, json64(v)))) : request;
    const hasLone = hasLoneSurrogate(o.variables);
    const requestWith = (strings) => (hasLone ? set(Object.entries(parseExact(o.variables)).map(([k, v]) => entry(k, json(v, strings)))) : request);
    const name = o.operationName === null ? "NoName" : `Name(${str(o.operationName)})`;
    return {
      coercion: `[given |-> ${givenTla(document)}, name |-> ${name}, source |-> ${str(o.subscribe ?? "stream")}, request |-> ${request}, has64 |-> ${bool(has64)}, request64 |-> ${request64}, hasLone |-> ${bool(hasLone)}, requestKept |-> ${requestWith("kept")}, requestReplaced |-> ${requestWith("replaced")}]`,
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
          const at = (j) => (m[3 + 2 * j] ? answerOf(m[3 + 2 * j], m[4 + 2 * j], m[2]) : undefined);
          r.answers = Array.from({ length: 1 + POLICY_RUNS.length }, (_, j) => at(j));
          const editions = 1 + POLICY_RUNS.length;
          r.oct2021 = Object.fromEntries(EDITION_RUNS.map((e, j) => [e, at(editions + j)]));
          r.binary64 = at(ANSWERS - 3);
          r.kept = at(ANSWERS - 2);
          r.replaced = at(ANSWERS - 1);
          r.inRange = m[3 + 2 * ANSWERS] === "TRUE";
          // CreateSourceEventStream's resolver call, and for a field below
          // the root, the data when its arguments raise and when they
          // don't, and its response positions.
          r.sourceCalled = m[4 + 2 * ANSWERS] === "TRUE";
          const text = (j) => unescape(m[5 + 2 * ANSWERS + j]);
          if (text(0) !== "") r.at = { error: JSON.parse(text(0)), value: JSON.parse(text(1)), paths: JSON.parse(text(2)) };
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
    // October 2021's answer. Its CoerceVariableValues and
    // CoerceArgumentValues add a default value as it is, and its §3.10 uses
    // an input field's default without coercing it: where that changes the
    // answer, the vector relies on September 2025's rule.
    const oct2021 = r.oct2021.coerceDefaults;
    const newRule = answerKey(oct2021) !== answerKey(expected);
    if (newRule && !alternatives.some((x) => answerKey(x) === answerKey(oct2021))) alternatives.push({ ...oct2021, policy: ["oct2021"] });
    const editionNote = o.since
      ? FRESH_REASONS[o.since]
      : o.schema === "oneOf"
      ? ONEOF_REASON
      : outsideOctoberSource(o.document)
        ? SOURCE_REASON
        : newRule
        ? `${EDITION_REASON}. Under October 2021 the answer is ${oct2021.outcome === "value" ? `the arguments ${JSON.stringify(oct2021.arguments)}` : `a ${oct2021.outcome.replace("-", " ")}`}`
        : undefined;
    // October 2021's §3.11 table of examples says [1, 2, 3] for [[Int]] is
    // "Error: Incorrect item value". Its prose, the same as September 2026's,
    // says otherwise, and examples are non-normative, so that answer isn't
    // an edition's: it is recorded, under either edition's default rule, so
    // that a result that follows the table is named as such. A literal the
    // table refuses isn't "coercible" (§5.6.1) either, so a service whose
    // validator follows the table answers with a request error.
    for (const a of [r.oct2021.nestedListItems, r.oct2021.both]) {
      if ([expected, ...alternatives].some((x) => answerKey(x) === answerKey(a))) continue;
      alternatives.push({ ...a, policy: ["oct2021Example"] });
      if (a.outcome === "field-error" && r.valid && r.inRange && !alternatives.some((x) => x.outcome === "request-error")) {
        alternatives.push({ outcome: "request-error", policy: ["oct2021Example", "validating"] });
      }
    }
    // A JSON string with a lone surrogate: what String or ID gets is the
    // JSON parser's doing, and the spec doesn't define a valid Unicode
    // string. Where keeping it, or replacing it with U+FFFD, changes the
    // answer, the vector is informational.
    const different = (a) => a && answerKey(a) !== answerKey(expected);
    const loneSurrogate = different(r.kept) || different(r.replaced) ? { kept: r.kept, replaced: r.replaced } : undefined;
    const typeCheck = o.check === "id" ? (expected.outcome === "value" ? "idCoerced" : "id") : o.check;
    const check = loneSurrogate ? "loneSurrogates" : typeCheck;
    if (!CHECK_IDS.has(check)) throw new Error(`unknown check ${check}`);
    // Sections: the check's (for loneSurrogates, the type's), plus the
    // algorithm that raises the expected kind of error. A request error
    // before any operation was selected is GetOperation's, not
    // CoerceVariableValues'.
    const spec = [CHECKS.find((c) => c.id === typeCheck).spec[0]];
    if (o.fresh) {
      // The families added for September 2026 name their sections.
      for (const x of o.spec ?? []) if (!spec.includes(x)) spec.push(x);
    } else {
      if (expected.outcome === "request-error" && r.field !== "" && check !== "variables") spec.push("6.1.2");
      if (expected.outcome === "field-error" && check !== "arguments") spec.push("6.4.1");
      // §3.12, where a null or a missing value at a Non-Null position is one
      // of the rules the error rests on.
      if (expected.outcome !== "value" && !spec.includes("3.12") && nonNullGap(o)) spec.push("3.12");
    }
    return {
      id: `coerce-${String(i + 1).padStart(4, "0")}`,
      spec,
      check,
      family: o.family,
      schema: o.schema,
      document: o.document,
      variables: o.variables,
      operationName: o.operationName,
      // Invalid by Validation.tla, or only because a literal doesn't coerce.
      valid: r.valid && r.inRange,
      literalOnly: r.valid && !r.inRange,
      executionErrorRequired: !o.fresh && expected.outcome === "field-error" && executionErrorRequired(o),
      idFromInteger: !o.fresh && expected.outcome === "value" && isIntegerInput(idInput(o)),
      expected,
      alternatives,
      binary64,
      loneSurrogate,
      editionNote,
      since: o.since ?? (editionNote ? SINCE : undefined),
      // October 2021 can't read the document: it has no descriptions on
      // executable definitions.
      newInput: o.since === "September2025",
      unparsable: Boolean(o.unparsable),
      subscribe: o.subscribe,
      sourceCalled: o.schema === "subscription" ? r.sourceCalled : undefined,
      typeCheck: o.typeCheck,
      // Where the selected field is, for vectors whose field isn't a root
      // field the response holds under its own name.
      at: (o.schema === "nested" || o.schema === "subscription") && r.at ? { field: r.field, paths: sortedPaths(r.at.paths), value: canonical(r.at.value), error: canonical(r.at.error) } : undefined,
      extensions: o.extensions,
      fresh: o.fresh,
    };
  });

  // A twin: the request a vector must get the same answer as, which it
  // rests on. Coercion.tla must give both the same answer: descriptions,
  // comments, the order of arguments and fields, and the request's
  // extensions don't enter its model.
  operations.forEach((o, i) => {
    if (!o.twin) return;
    const j = operations.findIndex(
      (x, k) => k !== i && !x.extensions && x.document === o.twin.document && x.variables === o.twin.variables && x.operationName === o.twin.operationName && x.schema === o.schema,
    );
    if (j < 0) throw new Error(`no twin for ${o.document}`);
    if (answerKey(vectors[j].expected) !== answerKey(vectors[i].expected)) {
      throw new Error(`${o.document} and its twin ${o.twin.document} get different answers`);
    }
    vectors[i].restsOn = [vectors[j].id];
  });

  // restsOn: for each vector, the `literal` or `variable` vectors that
  // hold its list items or input object fields on their own. A position's
  // type is matched as written, or else with the other nullability for a
  // value that isn't null; the first such vector in file order is taken.
  const probes = new Map();
  const probeKey = (kind, type, value) => `${kind}\u0000${typeText(type)}\u0000${valueText(kind, value)}`;
  const argumentsOf = operations.map((o) => (o.fresh ? undefined : argumentOf(o)));
  operations.forEach((o, i) => {
    const a = argumentsOf[i];
    if (!a || (o.family !== "literal" && o.family !== "variable")) return;
    const key = probeKey(a.kind, a.type, a.value);
    if (!probes.has(key)) probes.set(key, vectors[i].id);
  });
  const probeFor = (kind, type, value) => {
    const nullable = type.wrappers[0] === "nonNull" ? { ...type, wrappers: type.wrappers.slice(1) } : { ...type, wrappers: ["nonNull", ...type.wrappers] };
    return probes.get(probeKey(kind, type, value)) ?? (isNullOf(kind, value) ? undefined : probes.get(probeKey(kind, nullable, value)));
  };
  vectors.forEach((v, i) => {
    const a = argumentsOf[i];
    if (!a) return;
    const restsOn = [...new Set(childrenOf(a.kind, a.type, a.value).map(([type, value]) => probeFor(a.kind, type, value)).filter((id) => id && id !== v.id))];
    if (restsOn.length) v.restsOn = restsOn;
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
  const keyOf = (v) => `${v.schema ?? ""} ${v.expected.field} ${JSON.stringify(dropNulls(v.expected.arguments))}`;
  const answers = new Map();
  for (const v of vectors.filter((x) => x.expected.outcome === "value")) {
    answers.set(keyOf(v), (answers.get(keyOf(v)) ?? new Set()).add(JSON.stringify(v.expected.arguments)));
  }
  const onlyNullVersusAbsent = (v) => v.expected.outcome === "value" && answers.get(keyOf(v)).size > 1;
  for (const v of vectors) {
    const requires = [];
    if (onlyNullVersusAbsent(v)) requires.push("absent-vs-null");
    // What the request needs of the adapter beyond the coerce area: fields
    // below the root, a subscription, the request's extensions.
    if (v.schema === "nested") requires.push("nested-fields");
    if (v.schema === "subscription") requires.push("subscription-source");
    if (v.extensions !== undefined) requires.push("request-extensions");
    if (requires.length) v.requires = requires;
  }

  const ordered = vectors.map((v) => ({
    id: v.id,
    spec: v.spec,
    check: v.check,
    family: v.family,
    ...(v.schema ? { schema: v.schema } : {}),
    document: v.document,
    variables: v.variables,
    ...(v.operationName !== null ? { operationName: v.operationName } : {}),
    valid: v.valid,
    ...(v.literalOnly ? { literalOnly: true } : {}),
    ...(v.executionErrorRequired ? { executionErrorRequired: true } : {}),
    ...(v.requires ? { requires: v.requires } : {}),
    ...(v.idFromInteger ? { idFromInteger: true } : {}),
    expected: v.expected,
    ...(v.alternatives.length ? { alternatives: v.alternatives } : {}),
    ...(v.restsOn ? { restsOn: v.restsOn } : {}),
    ...(v.binary64 ? { binary64: v.binary64 } : {}),
    ...(v.loneSurrogate ? { loneSurrogate: v.loneSurrogate } : {}),
    ...(v.since ? { since: v.since, editionNote: v.editionNote } : {}),
    ...(v.newInput ? { newInput: true } : {}),
    ...(v.unparsable ? { unparsable: true } : {}),
    ...(v.subscribe ? { subscribe: v.subscribe, sourceCalled: v.sourceCalled } : {}),
    ...(v.typeCheck ? { typeCheck: v.typeCheck } : {}),
    ...(v.at ? { at: v.at } : {}),
    ...(v.extensions !== undefined ? { extensions: v.extensions } : {}),
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
    `  "schemas": ${JSON.stringify({ oneOf: SDL_ONEOF, nested: SDL_NESTED, subscription: SDL_SUBSCRIPTION })},\n` +
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
