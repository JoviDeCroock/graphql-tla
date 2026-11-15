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
// Each vector has `queries`, one per profile (kit/introspect/query.mjs)
// whose release can express its schema. A schema September 2025 can't
// express (Introspection!IsSep2025Schema is false: a directive applied to
// a directive definition, such as a deprecated directive) carries
// "since": "September2026", and has only September 2026's query. One
// October 2021 can't express (Introspection!IsOct2021Schema is false: a
// OneOf input object, or a deprecated argument or input field) carries
// "since": "September2025", and has September 2026's and September 2025's.
// For each older release's query, the script checks that the expected
// response is September 2026's without the fields that query doesn't
// select, with that release's built-ins (Introspection!Sep2025Builtins,
// Oct2021Builtins). A schema that applies @specifiedBy or @oneOf, which a
// service needn't provide, lists them in `needs`
// (Introspection!OptionalDirectivesUsed).
//
// Each schema also has a lookup vector, which asks __type(name:) for a few
// of its types (LOOKUPS) and for UNKNOWN, a name no schema has. Its
// expected response is Introspection!TypeByName for each name: the type's
// entry in SchemaResult's types, or null for a name the schema doesn't
// have, such as a built-in scalar nothing references.
//
// A schema that declares a directive of its own needs the adapter's
// custom-directives capability (`requires`). One that applies a directive
// to a directive definition uses syntax only September 2026's grammar has
// (`syntax`, the reason the kit gives for not grading a schema that
// doesn't build).
//
// The last vector, `wrappers`, asks __type(name: "__Schema")'s fields with
// every field of their types (query.mjs's wrappersQuery), for the minimal
// schema. Its expected answer follows from the built-ins.
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
import { PRIMARY, PROFILES, lookupQuery, schemaQuery, wrappersQuery } from "../kit/introspect/query.mjs";
import { directiveFor, fullResponse, responseOf, typeFor, typeJson } from "../kit/introspect/data.mjs";
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
input In { a: Int = 1, b: Int, e: E = Y, old: String }
input Pick { id: ID, name: String }
scalar Date
"Labels a field" directive @label(v: String, w: Int = 2) repeatable on FIELD_DEFINITION | QUERY`,
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
    ["4.2.3", "4.2.5", "3.13.3"],
    `type Query { a: Int @deprecated, b(y: Int): Int @deprecated(reason: "Use c"), c: E, old: Old }
type Old { x: Int @deprecated(reason: "All of it") }
enum E { A B @deprecated(reason: "Gone") }`,
  ],
  [
    "inputDeprecation",
    ["4.2.3", "4.2.4", "3.13.3"],
    `type Query { b(x: Int @deprecated(reason: "Use y"), y: Int): Int, d(i: In): Int }
input In { p: Int @deprecated, q: Int }`,
  ],
  [
    "directiveDeprecation",
    ["4.2.6", "3.13.3"],
    `directive @old @deprecated(reason: "Use @new") on FIELD
directive @new(x: Int) on FIELD
type Query { a: Int }`,
  ],
  // Q references Mutation, so that the vector tests only that a type named
  // Mutation isn't a root when a schema definition names the roots.
  [
    "roots",
    ["4.2.1", "3.3.1", "4.1"],
    `schema { query: Q subscription: S } type Q { a: Int, m: Mutation } type S { s: Int } type Mutation { m: Int }`,
  ],
  // A type nothing references: whether it is "contained within this schema"
  // (§4.2.1) the text doesn't settle, so the kit grades its absence as a
  // SHOULD (unreferencedTypes), apart from the rest of types.
  ["unreferenced", ["4.2.1"], `type Query { a: Int } type Orphan { b: Int }`],
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

// The names each schema's lookup vector asks __type(name:) for, besides
// UNKNOWN. Float in `minimal` and `roots`, and Int in `builtinScalars`, are
// built-in scalars those schemas don't reference, so the answer is null.
const LOOKUPS = {
  minimal: ["Query", "Int", "Float", "__TypeKind"],
  rich: ["Q", "E", "In", "Pick", "Date", "U"],
  interfaces: ["Node", "Resource", "Image"],
  defaults: ["Query", "I"],
  deprecation: ["Query", "Old", "E"],
  inputDeprecation: ["Query", "In"],
  directiveDeprecation: ["Query", "__Directive"],
  roots: ["Q", "S", "Mutation", "Float"],
  unreferenced: ["Query", "Orphan"],
  builtinScalars: ["In", "ID", "Float", "Int"],
  scalars: ["Date", "Plain", "String"],
  oneOf: ["Pick", "Plain"],
  order: ["Query", "O", "U", "E"],
};
const UNKNOWN = "Unknown";

// Lookup vectors select every list with includeDeprecated: true, and the
// deprecation schemas' also with the default.
const LOOKUP_DEFAULTS = new Set(["deprecation", "inputDeprecation"]);

const lookupsOf = (family) => [...LOOKUPS[family], UNKNOWN].map((name, i) => ({ alias: `t${i}`, name }));

// The adapter capability a schema with directives of its own needs.
const CUSTOM_DIRECTIVES = "custom-directives";
// Why a schema that applies a directive to a directive definition may not
// build: September 2025's and October 2021's DirectiveDefinition have no
// Directives.
const DIRECTIVE_DEFINITION_DIRECTIVES =
  "the schema applies a directive to a directive definition, which only September 2026's grammar has (§3.13 DirectiveDefinition)";

// Each profile's built-ins in Introspection.tla.
const EDITION_BUILTINS = { September2026: "SpecBuiltins", September2025: "Sep2025Builtins", October2021: "Oct2021Builtins" };

const generate = async () => {
  const data = SCHEMAS.map(([, , sdl]) => schemaData(sdl));
  const results = await pool(
    data.map((d, i) => [d, i]),
    async ([d, i]) => {
      const module = `---- MODULE IntrospectVectors ----
EXTENDS Introspection

S == ${tla(d)}

ASSUME PrintT(<<"valid", Verdict(S), OtherDefaultsAreCompatible(S)>>)
ASSUME PrintT(<<"edition", IsSep2025Schema(S), IsOct2021Schema(S), OptionalDirectivesUsed(S)>>)
ASSUME PrintT(<<"typename", RootTypeName(S, "query")>>)
Names == ${tla(lookupsOf(SCHEMAS[i][0]).map((l) => l.name))}
${PROFILES.map((p) => EDITION_BUILTINS[p])
  .map(
    (B) => `ASSUME PrintT(<<"result", SchemaResult(S, ${B}, TRUE)>>)
ASSUME PrintT(<<"result", SchemaResult(S, ${B}, FALSE)>>)
ASSUME PrintT(<<"lookup", [k \\in DOMAIN Names |-> TypeByName(S, ${B}, TRUE, Names[k])]>>)
ASSUME PrintT(<<"lookup", [k \\in DOMAIN Names |-> TypeByName(S, ${B}, FALSE, Names[k])]>>)`,
  )
  .join("\n")}
${moduleFooter}`;
      const values = await evaluateModule("IntrospectVectors", module);
      const [valid, edition, typename, ...rest] = values.filter((v) => v[0] !== "done");
      if (valid[1].length > 0 || valid[2] !== true) {
        throw new Error(`${SCHEMAS[i][0]}: the reference says the schema is invalid (${JSON.stringify(valid[1])}, defaults coerce: ${valid[2]})`);
      }
      const results = (k) => ({ inc: rest[k][1], defaults: rest[k + 1][1], lookupInc: rest[k + 2][1], lookupDefaults: rest[k + 3][1] });
      // The profiles whose release can express the schema, and the first
      // release that can.
      const profiles = PROFILES.filter((p) => p === PRIMARY || (p === "September2025" ? edition[1] : edition[2]));
      const since = profiles.includes("October2021") ? undefined : profiles.at(-1);
      return { profiles, since, needs: [...edition[3]].sort(), typename: typename[1][0], ...Object.fromEntries(PROFILES.map((p, k) => [p, results(4 * k)])) };
    },
  );

  // The built-ins are the same for every schema; they're written once per
  // profile, in that profile's shape. A profile's built-ins come from a
  // schema its release can express.
  const builtins = {};
  const keep = (profile, b, family) => {
    const shaped = { types: b.types.map((t) => typeFor(profile, t)), directives: b.directives.map((d) => directiveFor(profile, d)) };
    if (builtins[profile] === undefined) builtins[profile] = shaped;
    else if (JSON.stringify(builtins[profile]) !== JSON.stringify(shaped)) throw new Error(`${family}: the ${profile} built-ins differ from the first schema's`);
  };
  const same = (family, profile, what, a, b) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${family}: ${what} under ${profile} isn't September 2026's without the fields its query doesn't select`);
  };
  const meta = (r, i) => ({
    ...(r.since ? { since: r.since } : {}),
    ...(r.needs.length ? { needs: r.needs } : {}),
    ...(data[i].directives.length ? { requires: [CUSTOM_DIRECTIVES] } : {}),
    ...(data[i].directives.some((d) => d.directives.size > 0) ? { syntax: DIRECTIVE_DEFINITION_DIRECTIVES } : {}),
  });
  const vectors = [];
  SCHEMAS.forEach(([family, spec, sdl], i) => {
    const r = results[i];
    for (const [variant, includeDeprecated] of [
      ["inc", true],
      ["defaults", false],
    ]) {
      const { response, builtins: b } = responseOf(r[PRIMARY][variant], r.typename);
      keep(PRIMARY, b, family);
      for (const profile of r.profiles.filter((p) => p !== PRIMARY)) {
        const old = responseOf(r[profile][variant], r.typename);
        keep(profile, old.builtins, family);
        const s = response.data.__schema;
        const t = old.response.data.__schema;
        same(family, profile, "the document's types", s.types.map((x) => typeFor(profile, x)), t.types.map((x) => typeFor(profile, x)));
        same(family, profile, "the document's directives", s.directives.map((x) => directiveFor(profile, x)), t.directives.map((x) => directiveFor(profile, x)));
        same(family, profile, "the rest of __schema", { ...s, types: 0, directives: 0 }, { ...t, types: 0, directives: 0 });
      }
      vectors.push({
        id: `${family}.${variant}`,
        spec,
        family,
        ...meta(r, i),
        includeDeprecated,
        sdl,
        queries: Object.fromEntries(r.profiles.map((p) => [p, schemaQuery(p, includeDeprecated)])),
        expected: { response },
      });
    }
  });
  SCHEMAS.forEach(([family, , sdl], i) => {
    const r = results[i];
    const lookups = lookupsOf(family);
    const variants = [["lookup", true, "lookupInc"]];
    if (LOOKUP_DEFAULTS.has(family)) variants.push(["lookup.defaults", false, "lookupDefaults"]);
    for (const [variant, includeDeprecated, key] of variants) {
      const typesOf = (found) => Object.fromEntries(lookups.map((l, k) => [l.alias, found[k].length ? typeJson(found[k][0]) : null]));
      const data = typesOf(r[PRIMARY][key]);
      if (data[lookups.at(-1).alias] !== null) throw new Error(`${family}: the reference finds a type named ${UNKNOWN}`);
      for (const profile of r.profiles.filter((p) => p !== PRIMARY)) {
        const old = typesOf(r[profile][key]);
        same(family, profile, "a lookup", Object.values(data).map((t) => typeFor(profile, t)), Object.values(old).map((t) => typeFor(profile, t)));
      }
      vectors.push({
        id: `${family}.${variant}`,
        spec: ["4.2"],
        family,
        ...meta(r, i),
        includeDeprecated,
        sdl,
        queries: Object.fromEntries(r.profiles.map((p) => [p, lookupQuery(p, lookups, includeDeprecated)])),
        lookups,
        expected: { response: { data } },
      });
    }
  });
  vectors.push({
    id: "wrappers",
    spec: ["4.2.2"],
    family: "wrappers",
    includeDeprecated: false,
    sdl: SCHEMAS[0][2],
    queries: Object.fromEntries(PROFILES.map((p) => [p, wrappersQuery(p)])),
    wrappers: true,
    expected: { response: fullResponse({ wrappers: true }, builtins, PRIMARY) },
  });
  return {
    source:
      "Generated by scripts/generate-vectors-introspect.mjs from specs/Introspection.tla: each expected response is Introspection!SchemaResult with September 2026's built-ins, or for a lookup vector Introspection!TypeByName for each name, evaluated by tla-ts. `builtins` holds the introspection types and built-in directives every __schema response also has, for September 2026, September 2025 (Introspection!Sep2025Builtins) and October 2021 (Introspection!Oct2021Builtins), each in its profile's shape; built-in descriptions the spec leaves open are null. `queries` has each profile's query, for the releases that can express the vector's schema; `since` names the first release that can, when it is newer than October 2021. Under an older release's profile, a vector's expected response is its `expected` without the fields that profile's query doesn't select. Don't edit.",
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
  const all = JSON.parse(text).vectors;
  const lookups = all.filter((v) => v.lookups).length;
  const since = (release) => all.filter((v) => v.since === release).length;
  const custom = all.filter((v) => v.requires).length;
  console.log(
    `wrote ${all.length} vectors (${SCHEMAS.length} schemas: ${all.length - lookups - 1} __schema, ${lookups} __type lookups, 1 wrappers; ${since("September2025")} since September 2025, ${since("September2026")} new in September 2026, ${custom} need ${CUSTOM_DIRECTIVES}) to kit/introspect/vectors.json`,
  );
}
