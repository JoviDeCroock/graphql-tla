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
import * as graphql from "graphql17";
import { PRIMARY, PROFILES, lookupQuery, probeQuery, schemaQuery, wrappersQuery } from "../kit/introspect/query.mjs";
import { PROBE_KEPT, codePoints, directiveFor, fromTla, fullResponse, responseOf, toTla, typeFor, typeJson, wrappersJson } from "../kit/introspect/data.mjs";
import { evaluateModule, moduleFooter, pool, schemaData, tla } from "../kit/schema/tla.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const out = join(root, "kit/introspect/vectors.json");
const lexer = readFileSync(join(root, "specs/Lexer.tla"), "utf8");

// [family, spec sections, SDL, options]. Several come from
// scripts/differential-type-system.mjs's hand-written cases. options.since
// and options.syntax are for lexical forms TypeSystem.tla's data doesn't
// show: the first release whose grammar has them, and why a schema that
// doesn't build isn't graded.
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
  // `big` is an ID beyond 2^53, which only its digits encode; `huge` is a
  // Float default written as an integer, which a service may print as 1e21;
  // `bell` has a control character, escaped, which October 2021's grammar
  // has too (printing's other strings are September 2025's).
  [
    "defaults",
    ["4.2.4"],
    `enum E { X Y }
input I { a: Int = 1, b: Int, c: [Int] = 1, e: E = Y, f: Float = 2 }
type Query { f(x: [Int] = 1, y: Float = 1, z: ID = 7, w: [[Int]] = [1, 2], i: I = {b: 2}, s: String = "say \\"hi\\"", n: Int = null, l: [E!] = [X, Y], big: ID = 9007199254740993, huge: Float = 1000000000000000000000, bell: String = "\\u0007"): Int }`,
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
directive @gone(y: Int @deprecated) @deprecated on QUERY | MUTATION
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
    `"A date" scalar Date @specifiedBy(url: "https://example.com/date") scalar Plain
scalar Odd @specifiedBy(url: "https://example.com/a?b=c&d=%20#x")
type Query { d: Date, p: Plain, o: Odd }`,
  ],
  [
    "oneOf",
    ["4.2.2", "3.10.1"],
    `input Pick @oneOf { id: ID, name: String } input Plain { x: Int! } type Query { a(p: Pick, q: Plain): Int }`,
  ],
  [
    "order",
    ["4.2"],
    `type Query { z: Int, a: Int, m(c: Int, b: Int, a: Int): O, u: U, e: E, n(v: In): Int }
interface I1 { x: Int } interface I2 { x: Int }
type O implements I2 & I1 { x: Int }
type A2 { a: Int } type B2 { b: Int } union U = B2 | A2
enum E { Z A M }
input In { z: Int, a: Int, m: Int }`,
  ],
  // A deprecated field on an interface, an interface and an enum whose
  // every field or value is deprecated (an empty list without
  // includeDeprecated), and an object that deprecates a field its
  // interface deprecates too ("If field is deprecated then implementedField
  // must also be deprecated", §3.6).
  [
    "interfaceDeprecation",
    ["4.2.2", "4.2.3", "4.2.5", "3.13.3"],
    `interface Named { id: ID, name: String @deprecated(reason: "Use id") }
interface Gone { old: Int @deprecated }
type Thing implements Named & Gone { id: ID, name: String, old: Int @deprecated(reason: "Also gone") }
enum Mood { HAPPY @deprecated, SAD @deprecated(reason: "Cheer up") }
type Query { thing: Thing, named: Named, gone: Gone, mood: Mood }`,
  ],
  // Arguments and input fields whose every item is deprecated, a deprecated
  // argument of an interface field and of the field implementing it, and a
  // deprecated input field with a default.
  [
    "inputDeprecationAll",
    ["4.2.2", "4.2.3", "4.2.4", "3.13.3"],
    `interface Node { f(a: Int @deprecated(reason: "Use b"), b: Int): Int }
type Impl implements Node { f(a: Int @deprecated(reason: "Use b"), b: Int): Int }
input AllOld { p: Int @deprecated, q: String = "x" @deprecated(reason: "Use r") }
type Query { node: Node, impl: Impl, all(x: Int @deprecated, y: AllOld @deprecated(reason: "Gone")): Int }`,
  ],
  // Deprecated directive arguments (§4.2.6 args(includeDeprecated:)), one
  // directive's only argument among them.
  [
    "directiveArgDeprecation",
    ["4.2.6", "4.2.4", "3.13.3"],
    `directive @d(a: Int @deprecated(reason: "Use b"), b: Int) on FIELD
directive @e(x: Int @deprecated) repeatable on QUERY | FIELD
type Query { a: Int }`,
  ],
  // Every location September 2025 has, on one directive, and the
  // directives and their arguments out of alphabetical order (Stable
  // Ordering: "directives" and "arguments").
  [
    "locations",
    ["4.2.6", "4.2.1", "4.2"],
    `"""
Every location
  but one.
"""
directive @z(z: Int, a: Int, m: Int) repeatable on QUERY | MUTATION | SUBSCRIPTION | FIELD | FRAGMENT_DEFINITION | FRAGMENT_SPREAD | INLINE_FRAGMENT | VARIABLE_DEFINITION | SCHEMA | SCALAR | OBJECT | FIELD_DEFINITION | ARGUMENT_DEFINITION | INTERFACE | UNION | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION
directive @a on SCHEMA
directive @m(b: String, a: String) on VARIABLE_DEFINITION | FRAGMENT_DEFINITION
type Query { a: Int }`,
  ],
  // DIRECTIVE_DEFINITION as a location of the document's own directives,
  // and one applied to a directive definition: new in September 2026.
  [
    "directiveDefinitionLocation",
    ["4.2.6", "3.13"],
    `directive @meta(note: String) on DIRECTIVE_DEFINITION
directive @every on QUERY | MUTATION | SUBSCRIPTION | FIELD | FRAGMENT_DEFINITION | FRAGMENT_SPREAD | INLINE_FRAGMENT | VARIABLE_DEFINITION | SCHEMA | SCALAR | OBJECT | FIELD_DEFINITION | ARGUMENT_DEFINITION | INTERFACE | UNION | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION | DIRECTIVE_DEFINITION
directive @tagged @meta(note: "x") on FIELD
type Query { a: Int }`,
  ],
  // Descriptions on every kind of definition, single-line and block
  // strings, with indentation, blank lines, CRLF, escapes and \""" in a
  // block string: their text is BlockStringValue's (§2.10.4), which the
  // script checks against Lexer.tla.
  [
    "descriptions",
    ["3.2", "2.2", "2.10.4", "4.2.1", "4.2.2", "4.2.3", "4.2.4", "4.2.5"],
    `"""
  The schema,
    described.
"""
schema { query: Query }

"""
A query root.

  Indented second paragraph.
"""
type Query {
  """
      A field with
    a block description
  """
  f(
    """The argument"""
    x: In
    "Another, with \\"quotes\\" and a \\\\ backslash"
    y: Int
  ): Int
  u: U
  e: E
  i: I
  s: S
}
"An input object"
input In {
  """Input field"""
  a: Int
}
"""An interface\r\n  over x\r\n"""
interface I {
  "Interface field"
  x: Int
}
type O implements I { x: Int }
"""A union
    of one
  type"""
union U = O
"""
An enum
"""
enum E {
  "A value"
  A
  """
    Another value
  """
  B
}
"""A scalar with \\""" in it"""
scalar S`,
  ],
  // Strings whose text needs September 2025's lexical grammar: braced
  // escapes, a surrogate pair, and raw control characters (§2.1
  // SourceCharacter, §2.10.4), and ignored characters that are text inside
  // a string. A schema that doesn't build isn't graded (syntax).
  [
    "descriptionText",
    ["2.10.4", "2.1", "3.2"],
    `"Braced \\u{1F600} and \\u{e9}, a pair \\uD83D\\uDE00, fixed \\u00e9, raw \u{1F600}"
type Query {
  "Raw controls: \u0001\u007F\u0085, and a noncharacter \uFFFE"
  a: Int
  "Ignored characters stay: , # \uFEFF and\ttab"
  b: Int
  """Block: \\u{1F600} and \\n as written"""
  c: Int
}`,
    { since: "September2025", syntax: "the schema's strings use forms only September 2025's lexical grammar has: variable-width escapes \\u{…} and raw control characters (§2.1 SourceCharacter, §2.10.4)" },
  ],
  // Default values whose strings have control characters and supplementary
  // characters, to see how a service prints them (defaultValuePrinting).
  // The raw U+1F600 is outside October 2021's SourceCharacter (U+0020 to
  // U+FFFF), so the schema is September 2025's, like descriptionText.
  [
    "printing",
    ["4.2.4", "2.10.4"],
    `input In { s: String = "\\u0003", t: [String] = ["\u{1F600}"] }
type Query { f(c: String = "\\u0000\\u0001\\t\\n\\u001F\\u007F\\u0080\\u0085\\u009F", e: String = "\u{1F600} \u00e9", l: [String] = ["\\u0002", "\u{1F600}"], i: In = {s: "\\u0004", t: ["\\u0005\u{1F600}"]}): Int }`,
    { since: "September2025", syntax: "the schema's strings have a raw supplementary character, which only September 2025's lexical grammar has (§2.1 SourceCharacter)" },
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
  scalars: ["Date", "Plain", "Odd", "String"],
  oneOf: ["Pick", "Plain"],
  order: ["Query", "O", "U", "E", "In"],
  interfaceDeprecation: ["Named", "Gone", "Thing", "Mood"],
  inputDeprecationAll: ["Node", "Impl", "AllOld", "Query"],
  descriptions: ["Query", "In", "I", "U", "E", "S"],
  descriptionText: ["Query"],
  printing: ["Query", "In"],
};
// Families with no lookup vector: their schemas are about directives,
// which __type(name:) doesn't show.
const UNKNOWN = "Unknown";

// The type of the document's whose fields' wrapper types wrappers.user
// asks, and how many levels of ofType: its deepest field type has four
// wrappers.
const USER_WRAPPERS = { family: "interfaces", type: "Resource", depth: 4 };
// The query root type roots.lookup.fragments makes its lookups in
// fragments on.
const ROOT_FRAGMENTS_ON = "Q";

// Lookup vectors select every list with includeDeprecated: true, and the
// deprecation schemas' also with the default.
const LOOKUP_DEFAULTS = new Set(["deprecation", "inputDeprecation", "interfaceDeprecation", "inputDeprecationAll"]);

const lookupsOf = (family) => [...(LOOKUPS[family] ?? []), UNKNOWN].map((name, i) => ({ alias: `t${i}`, name }));

// The adapter capability a schema with directives of its own needs.
const CUSTOM_DIRECTIVES = "custom-directives";
// Why a schema that applies a directive to a directive definition may not
// build: September 2025's and October 2021's DirectiveDefinition have no
// Directives.
const DIRECTIVE_DEFINITION_DIRECTIVES =
  "the schema applies a directive to a directive definition, which only September 2026's grammar has (§3.13 DirectiveDefinition)";
// Why a schema whose directive names the location DIRECTIVE_DEFINITION may
// not build: the older releases' TypeSystemDirectiveLocation lacks it.
const DIRECTIVE_DEFINITION_LOCATION =
  "a directive definition names the location DIRECTIVE_DEFINITION, which only September 2026's grammar has (§3.13 TypeSystemDirectiveLocation)";
// Why a request with an empty selection set may be rejected.
const EMPTY_SELECTION_SET = "the query has an empty selection set, which only September 2026's grammar allows (§2.5 SelectionSet)";

// Every string literal and description of an SDL, in source order, as
// graphql-js parses it: the raw token and its value. The script checks
// each value against Lexer.tla's StringValueAt, so that the descriptions
// and strings the expected responses hold are the reference's.
const stringsOf = (sdl) => {
  const out = [];
  graphql.visit(graphql.parse(sdl), {
    StringValue(node) {
      out.push({ raw: sdl.slice(node.loc.start, node.loc.end), value: node.value });
    },
  });
  return out;
};

// Each profile's built-ins in Introspection.tla.
const EDITION_BUILTINS = { September2026: "SpecBuiltins", September2025: "Sep2025Builtins", October2021: "Oct2021Builtins" };

const generate = async () => {
  const data = SCHEMAS.map(([, , sdl]) => schemaData(sdl));
  const results = await pool(
    data.map((d, i) => [d, i]),
    async ([d, i]) => {
      const strings = stringsOf(SCHEMAS[i][2]);
      const module = `---- MODULE IntrospectVectors ----
EXTENDS Introspection

L == INSTANCE Lexer WITH vector <- 0

S == ${tla(toTla(d))}
Raw == ${tla(strings.map((x) => codePoints(x.raw)))}
ASSUME PrintT(<<"strings", [k \\in DOMAIN Raw |-> L!StringValueAt(Raw[k], 1)]>>)

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
      const values = await evaluateModule("IntrospectVectors", module, { "Lexer.tla": lexer });
      const [lexed, valid, edition, typename, ...rest] = fromTla(values.filter((v) => v[0] !== "done"));
      lexed[1].forEach((scan, k) => {
        const { raw, value } = strings[k];
        const text = JSON.stringify(scan.value) === JSON.stringify(codePoints(value));
        if (!scan.ok || scan.end !== codePoints(raw).length + 1 || !text) {
          throw new Error(`${SCHEMAS[i][0]}: Lexer.tla reads the string ${JSON.stringify(raw)} differently from graphql-js (${JSON.stringify(scan)})`);
        }
      });
      if (valid[1].length > 0 || valid[2] !== true) {
        throw new Error(`${SCHEMAS[i][0]}: the reference says the schema is invalid (${JSON.stringify(valid[1])}, defaults coerce: ${valid[2]})`);
      }
      const results = (k) => ({ inc: rest[k][1], defaults: rest[k + 1][1], lookupInc: rest[k + 2][1], lookupDefaults: rest[k + 3][1] });
      // The profiles whose release can express the schema, and the first
      // release that can, no earlier than options.since.
      const manual = SCHEMAS[i][3]?.since;
      const profiles = PROFILES.filter(
        (p) => (p === PRIMARY || (p === "September2025" ? edition[1] : edition[2])) && (!manual || PROFILES.indexOf(p) <= PROFILES.indexOf(manual)),
      );
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
  // Why a schema that doesn't build isn't graded: each form only a later
  // release's grammar has. Only directives on a directive definition itself
  // are new in September 2026: the schema data's `directives` also holds
  // those on its arguments, which October 2021's InputValueDefinition
  // already allows, so the parsed document is asked.
  const appliesToDirectiveDefinition = (sdl) =>
    graphql.parse(sdl).definitions.some((def) => def.kind === "DirectiveDefinition" && (def.directives ?? []).length > 0);
  const syntaxOf = (i) => {
    const reasons = [
      ...(appliesToDirectiveDefinition(SCHEMAS[i][2]) ? [DIRECTIVE_DEFINITION_DIRECTIVES] : []),
      ...(data[i].directives.some((d) => d.locations.includes("DIRECTIVE_DEFINITION")) ? [DIRECTIVE_DEFINITION_LOCATION] : []),
      ...(SCHEMAS[i][3]?.syntax ? [SCHEMAS[i][3].syntax] : []),
    ];
    return reasons.length ? { syntax: reasons.join("; ") } : {};
  };
  const meta = (r, i) => ({
    ...(r.since ? { since: r.since } : {}),
    ...(r.needs.length ? { needs: r.needs } : {}),
    ...(data[i].directives.length ? { requires: [CUSTOM_DIRECTIVES] } : {}),
    ...syntaxOf(i),
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
    if (!LOOKUPS[family]) return;
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
  const indexOf = (family) => SCHEMAS.findIndex(([f]) => f === family);
  // The same for a type of the document's: Resource, whose url is
  // [[String!]]!, four wrappers deep.
  {
    const i = indexOf(USER_WRAPPERS.family);
    const r = results[i];
    const { response } = responseOf(r[PRIMARY].defaults, r.typename);
    const types = [...builtins[PRIMARY].types, ...response.data.__schema.types];
    vectors.push({
      id: "wrappers.user",
      spec: ["4.2.2"],
      family: "wrappers",
      ...meta(r, i),
      includeDeprecated: false,
      sdl: SCHEMAS[i][2],
      queries: Object.fromEntries(r.profiles.map((p) => [p, wrappersQuery(p, [], USER_WRAPPERS.type, USER_WRAPPERS.depth)])),
      wrappers: true,
      wrapperType: USER_WRAPPERS.type,
      wrapperDepth: USER_WRAPPERS.depth,
      expected: { response: { data: { wrappers: wrappersJson({ types }, PRIMARY, USER_WRAPPERS.type, USER_WRAPPERS.depth) } } },
    });
  }
  // __type(name:) inside fragments on the query root type (Q).
  {
    const i = indexOf("roots");
    const base = vectors.find((v) => v.id === "roots.lookup");
    vectors.push({
      ...base,
      id: "roots.lookup.fragments",
      spec: ["4.2", "2.8"],
      queries: Object.fromEntries(Object.keys(base.queries).map((p) => [p, lookupQuery(p, base.lookups, true, [], ROOT_FRAGMENTS_ON)])),
      fragmentsOn: ROOT_FRAGMENTS_ON,
    });
    if (results[i].typename !== ROOT_FRAGMENTS_ON) throw new Error(`roots: the query root is ${results[i].typename}, not ${ROOT_FRAGMENTS_ON}`);
  }
  // Requests that use @skip or @include: a service that honours one
  // provides it, so must return it in directives (§3.13).
  {
    const r = results[0];
    for (const directive of ["skip", "include"]) {
      vectors.push({
        id: `probe.${directive}`,
        spec: ["3.13", directive === "skip" ? "3.13.1" : "3.13.2", "4.2.1"],
        family: "probe",
        includeDeprecated: false,
        sdl: SCHEMAS[0][2],
        queries: Object.fromEntries(PROFILES.map((p) => [p, probeQuery(directive)])),
        probe: directive,
        expected: { response: { data: { __typename: r.typename, [PROBE_KEPT]: r.typename, __schema: { directives: [] } } } },
      });
    }
  }
  // Empty selection sets (§2.5, new in September 2026), on the root and on
  // the meta-fields. The answers follow from TypeByName: an empty map for
  // a type the schema has, null for one it doesn't.
  {
    const r = results[0];
    const found = r[PRIMARY].lookupInc;
    const names = lookupsOf(SCHEMAS[0][0]).map((l) => l.name);
    const lookup = (name) => {
      const k = names.indexOf(name);
      if (k === -1) throw new Error(`minimal's lookups don't ask for ${name}`);
      return found[k].length ? {} : null;
    };
    const exact = (id, query, data) => ({
      id: `emptySelection.${id}`,
      spec: ["2.5", "4.2"],
      family: "emptySelection",
      since: "September2026",
      syntax: EMPTY_SELECTION_SET,
      includeDeprecated: false,
      sdl: SCHEMAS[0][2],
      queries: { [PRIMARY]: query },
      exact: true,
      expected: { response: { data } },
    });
    vectors.push(exact("root", "{}\n", {}));
    vectors.push(
      exact("meta", `{\n  __typename\n  __schema {}\n  t0: __type(name: "Query") {}\n  t1: __type(name: ${JSON.stringify(UNKNOWN)}) {}\n}\n`, {
        __typename: r.typename,
        __schema: {},
        t0: lookup("Query"),
        t1: lookup(UNKNOWN),
      }),
    );
  }
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
  const n = (f) => all.filter(f).length;
  const since = (release) => n((v) => v.since === release);
  console.log(
    `wrote ${all.length} vectors (${SCHEMAS.length} schemas: ${n((v) => !v.lookups && !v.wrappers && !v.probe && !v.exact)} __schema, ${n((v) => v.lookups)} __type lookups, ${n((v) => v.wrappers)} wrappers, ${n((v) => v.probe)} probes, ${n((v) => v.exact)} exact; ${since("September2025")} since September 2025, ${since("September2026")} new in September 2026, ${n((v) => v.requires)} need ${CUSTOM_DIRECTIVES}) to kit/introspect/vectors.json`,
  );
}
