// Writes kit/introspect/vectors.json: SDL schemas, each with the
// introspection response specs/Introspection.tla says a service must give,
// evaluated by tla-ts (Introspection!SchemaResult with the spec's
// built-ins, and the query root's name for __typename).
//
// Each schema is checked valid first (TypeSystem!Verdict is empty, and
// every default value coerces, since a service can't print one that
// doesn't), and asked twice: with includeDeprecated: true on every list,
// and with every list's default. graphql-js only parses the SDL.
//
// The expected responses are what the self-test and findings show. The
// kit doesn't compare responses with them directly: it evaluates
// Introspection!Matches on each response (kit/introspect/run.mjs), which
// allows what the spec allows, such as types in any order.
//
// Usage: node scripts/generate-vectors-introspect.mjs [--check]

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { QUERY, QUERY_DEFAULTS } from "../kit/introspect/query.mjs";
import { responseOf } from "../kit/introspect/data.mjs";
import { chunked, evaluateModule, moduleFooter, pool, schemaData, tla } from "../kit/schema/tla.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const out = join(root, "kit/introspect/vectors.json");

// [family, spec sections, SDL]. Several come from
// scripts/differential-type-system.mjs's hand-written cases.
const SCHEMAS = [
  ["minimal", ["4.2.1", "4.2.2", "3.5"], "type Query { a: Int }"],
  [
    "rich",
    ["4.2.1", "4.2.2", "4.2.3", "4.2.4", "4.2.5", "4.2.6", "3.2"],
    `"""The schema""" schema { query: Q mutation: M }
"The root" type Q { a("An argument" x: Int = 3, y: [Int] = 1, z: In = {b: 2}): U, old: String @deprecated(reason: "gone"), d: Date }
type M { m(p: Pick!): Boolean }
type A { a: Int } type B { b: Int } union U = B | A
enum E { X "Why" Y @deprecated }
input In { a: Int = 1, b: Int, e: E = Y, old: String @deprecated }
input Pick @oneOf { id: ID, name: String }
scalar Date @specifiedBy(url: "https://example.com/date")
"Tags a field" directive @tag(v: String @deprecated, w: Int = 2) repeatable on FIELD_DEFINITION | QUERY`,
  ],
  [
    "interfaces",
    ["4.2.2", "3.7"],
    `interface Node { id: ID! }
interface Resource implements Node { id: ID! url: [[String!]]! }
type Image implements Resource & Node { id: ID! url: [[String!]]! }
type User implements Node { id: ID! friends: [User!] }
type Query { node(id: ID!): Node, resource: Resource }`,
  ],
  [
    "defaults",
    ["4.2.4"],
    `enum E { X Y }
input I { a: Int = 1, b: Int, c: [Int] = 1, e: E = Y, f: Float = 2 }
type Query { f(x: [Int] = 1, y: Float = 1, z: ID = 7, w: [[Int]] = [1, 2], i: I = {b: 2}, s: String = "say \\"hi\\"", n: Int = null, l: [E!] = [X, Y]): Int }`,
  ],
  [
    "deprecation",
    ["4.2.3", "4.2.4", "4.2.5", "3.13.3"],
    `type Query { a: Int @deprecated, b(x: Int @deprecated(reason: "Use y"), y: Int): Int, c: E, d(i: In): Int, old: Old }
type Old { x: Int @deprecated(reason: "All of it") }
enum E { A B @deprecated(reason: "Gone") }
input In { p: Int @deprecated, q: Int }`,
  ],
  [
    "directiveDeprecation",
    ["4.2.6", "3.13.3"],
    `directive @old @deprecated(reason: "Use @new") on FIELD
directive @new(x: Int) on FIELD
type Query { a: Int }`,
  ],
  [
    "roots",
    ["4.2.1", "3.3.1", "4.1"],
    `schema { query: Q subscription: S } type Q { a: Int } type S { s: Int } type Mutation { m: Int }`,
  ],
  [
    "builtinScalars",
    ["3.5", "4.2.1"],
    `directive @d(f: Float) on FIELD input In { id: ID } type Query { a(i: In): String }`,
  ],
  [
    "scalars",
    ["4.2.2", "3.13.4"],
    `"A date" scalar Date @specifiedBy(url: "https://example.com/date") scalar Plain type Query { d: Date, p: Plain }`,
  ],
  [
    "oneOf",
    ["4.2.2", "3.10.1"],
    `input Pick @oneOf { id: ID, name: String } input Plain { x: Int! } type Query { a(p: Pick, q: Plain): Int }`,
  ],
  [
    "order",
    ["4.2"],
    `type Query { z: Int, a: Int, m(c: Int, b: Int, a: Int): O, u: U, e: E }
interface I1 { x: Int } interface I2 { x: Int }
type O implements I2 & I1 { x: Int }
type A2 { a: Int } type B2 { b: Int } union U = B2 | A2
enum E { Z A M }`,
  ],
];

const generate = async () => {
  const data = SCHEMAS.map(([, , sdl]) => schemaData(sdl));
  const results = await pool(
    data.map((d, i) => [d, i]),
    async ([d, i]) => {
      const module = `---- MODULE IntrospectVectors ----
EXTENDS Introspection

S == ${tla(d)}

ASSUME PrintT(<<"valid", Verdict(S), OtherDefaultsAreCompatible(S)>>)
ASSUME PrintT(<<"typename", RootTypeName(S, "query")>>)
ASSUME PrintT(<<"result", SchemaResult(S, SpecBuiltins, TRUE)>>)
ASSUME PrintT(<<"result", SchemaResult(S, SpecBuiltins, FALSE)>>)
${moduleFooter}`;
      const values = await evaluateModule("IntrospectVectors", module);
      const [valid, typename, ...results] = values.filter((v) => v[0] !== "done");
      if (valid[1].length > 0 || valid[2] !== true) {
        throw new Error(`${SCHEMAS[i][0]}: the reference says the schema is invalid (${JSON.stringify(valid[1])}, defaults coerce: ${valid[2]})`);
      }
      return { typename: typename[1][0], inc: results[0][1], defaults: results[1][1] };
    },
  );

  let builtins;
  const vectors = [];
  SCHEMAS.forEach(([family, spec, sdl], i) => {
    for (const [variant, includeDeprecated, query] of [
      ["inc", true, QUERY],
      ["defaults", false, QUERY_DEFAULTS],
    ]) {
      const { response, builtins: b } = responseOf(results[i][variant], results[i].typename);
      // The built-ins are the same for every schema; they're written once.
      if (builtins === undefined) builtins = b;
      else if (JSON.stringify(builtins) !== JSON.stringify(b)) throw new Error(`${family}: the built-ins differ from the first schema's`);
      vectors.push({ id: `${family}.${variant}`, spec, family, includeDeprecated, sdl, query, expected: { response } });
    }
  });
  return {
    source:
      "Generated by scripts/generate-vectors-introspect.mjs from specs/Introspection.tla: each expected response is Introspection!SchemaResult with the spec's built-ins, evaluated by tla-ts. `builtins` holds the introspection types and built-in directives every expected response also has; built-in descriptions the spec leaves open are null. Don't edit.",
    builtins,
    vectors,
  };
};

const text = `${JSON.stringify(await generate(), null, 2)}\n`;
if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(out, "utf8");
  } catch {}
  if (current !== text) {
    console.error("✗ kit/introspect/vectors.json is out of date: run node scripts/generate-vectors-introspect.mjs");
    process.exit(1);
  }
  console.log("✓ kit/introspect/vectors.json matches Introspection.tla");
} else {
  writeFileSync(out, text);
  console.log(`wrote ${JSON.parse(text).vectors.length} vectors (${SCHEMAS.length} schemas) to kit/introspect/vectors.json`);
}
