// Writes kit/coordinate/vectors.json: schema coordinates (§2.14, new in
// September 2025, the same text in September 2026), each with a schema, and what specs/SchemaCoordinates.tla
// says of them, evaluated by tla-ts: whether the coordinate parses, and if
// it does, what it resolves to in the schema (an element, nothing, or an
// error), or that the spec gives it no defined behaviour.
//
// The coordinates are §2.14's own examples and table, the inventory of
// syntax edges (Ignored in every position, characters that start no token,
// token sequences no production matches), and, for resolution, every kind
// of schema element, found and not found, built-in ones, missing non-leaf
// nodes, the kind Asserts, meta-fields and introspection types. graphql-js
// only parses the SDL into TypeSystem.tla's schema data; every expected
// answer comes from the reference.
//
// Each vector's `check` is the one a wrong answer counts against
// (kit/coordinate/run.mjs): for a coordinate the reference rejects, the
// syntax rule it breaks (from Parse's reason); for one it accepts, the
// resolution algorithm that decides it. A coordinate whose resolution has
// no defined behaviour is `unspecified` and isn't graded.
//
// Usage: node scripts/generate-vectors-coordinate.mjs [--check]

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chunked, evaluateModule, schemaData, tla } from "../kit/schema/tla.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const out = join(root, "kit/coordinate/vectors.json");

// The schemas the coordinates are resolved in. `business` is §2.14's
// example schema, with an interface, a union, arguments with defaults, a
// deprecated field, a custom scalar with @specifiedBy, a OneOf input object
// and a directive without arguments added. It refers to Int, Float, String
// and ID, but not Boolean. `rooted` has root operation types that aren't
// named Query or Mutation, and refers to Boolean, String and no other
// built-in scalar.
// Characters the coordinates use, by code point, so that none is invisible
// in this file: a byte order mark, a no-break space (not Whitespace), a line
// separator (not a LineTerminator) and an e with an acute accent.
const [BOM, NBSP, LS, E_ACUTE] = [0xfeff, 0xa0, 0x2028, 0xe9].map((c) => String.fromCodePoint(c));

const SCHEMAS = {
  business: `type Query {
  searchBusiness(criteria: SearchCriteria!): [Business]
  node(id: ID!): Node
  result: SearchResult
  count(first: Int = 10, after: String, window: Window): Int
}

input SearchCriteria {
  name: String
  filter: SearchFilter
}

enum SearchFilter {
  OPEN_NOW
  DELIVERS_TAKEOUT
  VEGETARIAN_MENU
}

interface Node {
  id: ID!
  related(first: Int): [Node]
}

type Business implements Node {
  id: ID!
  related(first: Int): [Node]
  name: String
  email: String @private(scope: "loggedIn")
  rating(scale: Float = 5): Float
  legacyName: String @deprecated(reason: "Use name")
}

union SearchResult = Business

scalar Date @specifiedBy(url: "https://example.com/date")

input Window @oneOf {
  from: Date
  to: Date
}

directive @private(scope: String!) on FIELD_DEFINITION

directive @cached on OBJECT | FIELD_DEFINITION
`,
  rooted: `schema {
  query: Root
  mutation: Change
}

type Root {
  me: User
}

type Change {
  rename(to: String!): User
}

type User {
  name(format: Format): String
  active: Boolean
}

enum Format {
  SHORT
  LONG
}
`,
};

// [family, coordinate, schema]. The schema is `business` unless given.
const COORDINATES = [
  // §2.14's table: one coordinate for each kind of schema element.
  ...["Business", "Business.name", "SearchCriteria.filter", "SearchFilter.OPEN_NOW", "Query.searchBusiness(criteria:)", "@private", "@private(scope:)"].map((c) => [
    "spec",
    c,
  ]),
  // Names: case-sensitive, underscores, digits after the first character,
  // keywords of the executable grammar.
  ...["Business_", "_Business", "B1", "true", "null", "query", "on", "Query.searchBusiness(criteria_:)"].map((c) => ["names", c]),

  // No Ignored, anywhere ("must not contain Whitespace or other Ignored").
  ...[
    " Business",
    "Business ",
    "Business. name",
    "Business .name",
    "Query.searchBusiness (criteria:)",
    "Query.searchBusiness( criteria:)",
    "Query.searchBusiness(criteria :)",
    "Query.searchBusiness(criteria: )",
    "@ private",
    "@private (scope:)",
    "Business\t",
    "\tBusiness",
    "Business\n",
    "\nBusiness",
    "Business\r\n",
    "Business\r",
    "Business,",
    ",Business",
    "Query.searchBusiness(criteria:,)",
    "Business#c",
    "Business #c",
    "#c\nBusiness",
    `${BOM}Business`,
    `Business${BOM}`,
    `Business.${BOM}name`,
  ].map((c) => ["ignored", c]),
  // Characters no SchemaCoordinateToken starts with.
  ...[
    "$x",
    '"Business"',
    "1a",
    "Business!",
    "[Business]",
    "Business&Node",
    "Business|Node",
    "{Business}",
    "Busi-ness",
    "@private(scope:=)",
    `Business.${E_ACUTE}`,
    `Business${NBSP}`,
    `Business${LS}`,
    "Business\u0000",
    "Query.searchBusiness(criteria:\"x\")",
  ].map((c) => ["tokens", c]),
  // Token sequences no production matches.
  ...[
    "",
    "Query.searchBusiness(criteria)",
    "Query.searchBusiness(criteria:",
    "Query.searchBusiness()",
    "Query.searchBusiness(:)",
    "Query.searchBusiness(criteria::)",
    "Query.searchBusiness(criteria:filter:)",
    "Query.searchBusiness(criteria:)(x:)",
    "Query.searchBusiness(criteria:).name",
    "Query.searchBusiness((criteria:))",
    "Query(criteria:)",
    "Business.",
    "Business..name",
    ".name",
    "Business.name.first",
    "Business.name:",
    ":Business",
    "Business()",
    "(Business)",
    "Business@private",
    "@",
    "@@private",
    "@private.scope",
    "@private.scope(x:)",
    "@private(scope)",
    "@private()",
    "@private(:)",
    "@private(scope:)(x:)",
    "Query.@private",
    // ... is three SchemaCoordinatePunctuator tokens here, not one Punctuator.
    "...",
    "Business...",
  ].map((c) => ["grammar", c]),

  // TypeCoordinate: "Return the type in {schema} named {typeName} if it
  // exists", built-in scalars the schema refers to included.
  ...["Query", "Node", "SearchResult", "Date", "Window", "String", "Int", "Float", "ID"].map((c) => ["types", c]),
  ...["Unknown", "business", "BUSINESS", "Businesses", "Mutation", "Subscription", "Private"].map((c) => ["types", c]),
  // MemberCoordinate: fields of objects and interfaces, input fields, enum
  // values; then members that don't exist.
  ...[
    "Business.id",
    "Business.related",
    "Business.legacyName",
    "Node.id",
    "Node.related",
    "Query.searchBusiness",
    "Query.count",
    "SearchCriteria.name",
    "Window.from",
    "SearchFilter.DELIVERS_TAKEOUT",
    "SearchFilter.VEGETARIAN_MENU",
  ].map((c) => ["members", c]),
  ...[
    "Business.unknown",
    "Business.Name",
    "Node.name",
    "Query.id",
    "SearchCriteria.unknown",
    "SearchCriteria.criteria",
    "Window.until",
    "SearchFilter.CLOSED",
    "SearchFilter.open_now",
    "Business.__schema",
  ].map((c) => ["members", c]),
  // ArgumentCoordinate.
  ...["Query.node(id:)", "Query.count(first:)", "Query.count(window:)", "Node.related(first:)", "Business.related(first:)", "Business.rating(scale:)"].map((c) => [
    "arguments",
    c,
  ]),
  ...["Query.searchBusiness(unknown:)", "Query.searchBusiness(Criteria:)", "Business.name(x:)", "Node.related(after:)", "Query.count(scale:)", "Business.email(scope:)"].map((c) => [
    "arguments",
    c,
  ]),
  // DirectiveCoordinate and DirectiveArgumentCoordinate: directives the SDL
  // defines, and @deprecated, which it uses.
  ...["@cached", "@deprecated", "@deprecated(reason:)", "@unknown", "@Private", "@privat", "@private(unknown:)", "@private(Scope:)", "@cached(x:)", "@deprecated(why:)"].map(
    (c) => ["directives", c],
  ),
  // The other built-in directives, which the SDL doesn't define.
  ...["@skip", "@include", "@specifiedBy", "@oneOf", "@skip(if:)", "@include(if:)", "@specifiedBy(url:)", "@skip(unless:)", "@oneOf(x:)"].map((c) => [
    "builtins",
    c,
  ]),
  // A non-leaf node that can't be found: an error.
  ...[
    "Unknown.name",
    "business.name",
    "Mutation.x",
    "Unknown.x(y:)",
    "Query.unknown(x:)",
    "Business.Name(x:)",
    "Node.name(x:)",
    "@unknown(x:)",
    "@Private(scope:)",
  ].map((c) => ["containers", c]),
  // A type of a kind the coordinate can't look into.
  ...[
    "Date.x",
    "String.length",
    "Int.x",
    "SearchResult.Business",
    "SearchResult.id",
    "Date.x(y:)",
    "SearchResult.id(x:)",
    "SearchCriteria.filter(x:)",
    "SearchFilter.OPEN_NOW(x:)",
    "Window.from(x:)",
  ].map((c) => ["kinds", c]),
  // No defined behaviour: meta-fields, introspection types, and a built-in
  // scalar nothing in the schema refers to.
  ...[
    "Business.__typename",
    "Node.__typename",
    "SearchResult.__typename",
    "Query.__typename",
    "Query.__schema",
    "Query.__type",
    "Query.__type(name:)",
    "__Type",
    "__Schema",
    "__TypeKind.OBJECT",
    "__Type.fields(includeDeprecated:)",
    "Boolean",
    "Boolean.x",
  ].map((c) => ["undefined", c]),
  // Root operation types that aren't named Query or Mutation.
  ...[
    "Root",
    "Root.me",
    "Change.rename(to:)",
    "User.name(format:)",
    "Format.SHORT",
    "Boolean",
    "Query",
    "Mutation",
    "Root.Me",
    "User.__schema",
    "Query.me",
    "root.me",
    "Root.me(x:)",
    "Root.__schema",
    "Root.__type(name:)",
    "Change.__typename",
    "Int",
  ].map((c) => ["rooted", c, "rooted"]),
];

const BUILTIN_DIRECTIVES = ["skip", "include", "deprecated", "specifiedBy", "oneOf"];

// The check a wrong answer counts against, from the reference's answer.
const RESOLUTION_CHECK = {
  type: "resolvesTypes",
  member: "resolvesMembers",
  argument: "resolvesArguments",
  directive: "resolvesDirectives",
  directiveArgument: "resolvesDirectiveArguments",
};
const SYNTAX_CHECK = { ignored: "noIgnored", token: "tokens", sourceCharacter: "tokens", grammar: "grammar" };

const checkOf = (parsed, result, sdl) => {
  if (!parsed.ok) return SYNTAX_CHECK[parsed.reason];
  if (result.outcome === "error") return result.why === "kind" ? "containerKind" : "missingContainers";
  // @skip, @include, @specifiedBy and @oneOf: "GraphQL implementations
  // should provide" them (§3.13). @deprecated is a must for an
  // implementation that represents deprecated portions, as the schema does.
  const directive = parsed.kind.startsWith("directive") ? parsed.names[0] : undefined;
  if (directive && BUILTIN_DIRECTIVES.includes(directive) && directive !== "deprecated" && !new RegExp(`directive @${directive}\\b`).test(sdl)) {
    return "builtinDirectives";
  }
  return RESOLUTION_CHECK[parsed.kind];
};

const codePoints = (s) => Array.from(s, (c) => c.codePointAt(0));

const generate = async () => {
  const schemaNames = Object.keys(SCHEMAS);
  const seen = new Set();
  for (const [, c, s = "business"] of COORDINATES) {
    const key = `${s}\u0000${c}`;
    if (seen.has(key)) throw new Error(`coordinate ${JSON.stringify(c)} is listed twice for ${s}`);
    seen.add(key);
  }
  const module = `---- MODULE CoordinateVectors ----
EXTENDS SchemaCoordinates

Schemas == <<${schemaNames.map((n) => tla(schemaData(SCHEMAS[n]))).join(",\n  ")}>>

${chunked("Sources", COORDINATES.map(([, c]) => `<<${codePoints(c).join(", ")}>>`), 25)}

Which == <<${COORDINATES.map(([, , s = "business"]) => schemaNames.indexOf(s) + 1).join(", ")}>>

ASSUME \\A i \\in DOMAIN Sources :
  LET p == Parse(Sources[i]) IN
  PrintT(<<"vector", i, p, IF p.ok THEN Resolve(Schemas[Which[i]], p) ELSE Result("", NoElement, "")>>)

ASSUME PrintT(<<"done">>)
====
`;
  const extra = {
    "Lexer.tla": readFileSync(join(root, "specs/Lexer.tla"), "utf8"),
    "SchemaCoordinates.tla": readFileSync(join(root, "specs/SchemaCoordinates.tla"), "utf8"),
  };
  const values = (await evaluateModule("CoordinateVectors", module, extra)).filter((v) => v[0] === "vector");
  if (values.length !== COORDINATES.length) throw new Error(`read ${values.length} answers for ${COORDINATES.length} coordinates`);
  values.sort((a, b) => a[1] - b[1]);

  const count = new Map();
  const vectors = COORDINATES.map(([family, coordinate, schema = "business"], i) => {
    const [, , parsed, result] = values[i];
    const check = checkOf(parsed, result, SCHEMAS[schema]);
    const unspecified = parsed.ok && result.outcome === "unspecified" ? result.why : undefined;
    const key = unspecified ? "unspecified" : check;
    const n = (count.get(key) ?? 0) + 1;
    count.set(key, n);
    const expected = !parsed.ok
      ? { ok: false }
      : result.outcome === "element"
        ? { ok: true, resolved: { kind: result.element.kind, path: result.element.path } }
        : result.outcome === "error"
          ? { ok: true, error: true }
          : { ok: true, resolved: null };
    return {
      id: `${key}.${n}`,
      family,
      spec: ["2.14"],
      since: "September2025",
      schema,
      coordinate,
      // A coordinate whose resolution is unspecified is graded on its
      // syntax alone.
      check: unspecified ? "grammar" : check,
      ...(unspecified ? { unspecified: unspecifiedReason(unspecified) } : {}),
      // How the reference read the coordinate: the production, or why it
      // rejects it; and, for an error, which Assert failed.
      reference: parsed.ok ? { production: parsed.kind, ...(result.outcome === "error" ? { assert: result.why } : {}) } : { rejected: parsed.reason },
      expected: unspecified ? { ok: true } : expected,
      // The kind Asserts: the prose names no error there (see
      // docs/kit/coordinate.md), so no element at all passes too.
      ...(check === "containerKind" && !unspecified ? { alternatives: [{ ok: true, resolved: null }] } : {}),
    };
  });
  return {
    source:
      "Generated by scripts/generate-vectors-coordinate.mjs from specs/SchemaCoordinates.tla (Parse and Resolve, with Lexer.tla's names and TypeSystem.tla's schema data), evaluated by tla-ts. Don't edit.",
    schemas: SCHEMAS,
    vectors,
  };
};

const unspecifiedReason = (why) =>
  ({
    "meta-field":
      "a meta-field: \"Although it is syntactically possible to describe a meta-field or element of the introspection schema with a schema coordinate (e.g. Business.__typename or __Type.fields(includeDeprecated:)), they are not schema element and therefore resolving such coordinates does not have a defined behavior.\"",
    "introspection type":
      "an introspection type: \"Meta-fields are not defined within a schema, and thus are not schema element. By extension, an introspection type is not a schema element.\" Resolving it \"does not have a defined behavior\".",
    "unreferenced built-in scalar":
      "a built-in scalar no field, argument or input field of the schema refers to. §3.5 leaves it out of __Schema.types, but nothing says whether the schema has it; the built-in directives' arguments and the introspection types refer to String and Boolean, which leaves those two open as well.",
  })[why] ?? why;

const text = `${JSON.stringify(await generate(), null, 2)}\n`;
if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(out, "utf8");
  } catch {}
  if (current !== text) {
    console.error("✗ kit/coordinate/vectors.json is out of date: run node scripts/generate-vectors-coordinate.mjs");
    process.exit(1);
  }
  console.log("✓ kit/coordinate/vectors.json matches SchemaCoordinates.tla");
} else {
  writeFileSync(out, text);
  const { vectors } = JSON.parse(text);
  const by = new Map();
  for (const v of vectors) {
    const key = v.unspecified ? "unspecified (graded on syntax only)" : v.check;
    by.set(key, (by.get(key) ?? 0) + 1);
  }
  console.log(`wrote ${vectors.length} vectors to kit/coordinate/vectors.json: ${[...by].map(([c, n]) => `${c} ${n}`).join(", ")}`);
}
