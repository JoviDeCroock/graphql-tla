// Writes kit/validate/vectors.json: documents whose validity against a
// schema the reference, specs/Validation.tla, decides (docs/kit/validate.md).
//
// tla-ts evaluates every rule of the reference on every candidate document,
// and the vectors are the documents that break exactly one rule, each
// paired with a valid sibling one small edit away:
//
//   families  the documents of scripts/differential-validation.mjs (its
//             schema, systematic families and seeded random grammar, copied
//             below; keep them in step), each also without the variable
//             definitions it never uses, plus a few documents added here
//             ("extra") for rules the families exercise little
//   spec      the spec's own examples, from Validation.tla's test vectors
//             over the spec's example schema. A fragment no operation uses
//             gets an operation that spreads it, and a variable no
//             operation defines gets a definition, where that leaves the
//             example breaking only its rule (or none, for a valid one).
//
// A sibling is the valid document nearest to the invalid one: a document
// of the same family a few tokens away, or the invalid document with one
// selection, argument, directive, variable or value removed. Every valid
// document of a systematic family is also paired with its nearest invalid
// neighbour. All pairs from the systematic families are kept, and a few per
// rule from the random documents.
//
// Some vectors carry notes on what their verdict rests on:
//
//   requires     ["custom-scalar-literals"]: the document gives a literal to
//                a custom scalar, which the service defines (§3.5.6)
//   unspecified  the spec doesn't settle the verdict: Fragment Spread Is
//                Possible and All Variable Usages Are Allowed (OneOf) where
//                the formal text and the prose disagree, and Field Selection
//                Merging where readings of "identical sets of arguments"
//                disagree; not graded
//   edition      "draft": the vector relies on a rule only the draft has,
//                or on its nested-list coercion, or its schema needs a OneOf
//                Input Object
//
// The differential and examples schemas declare a OneOf Input Object, which
// an implementation of October 2021 can't build. The vectors file has each
// both without it (the name) and with it (<name>OneOf); only vectors tagged
// draft use the second.
//
// graphql-js is used only to parse and print documents, to turn an SDL
// schema into TLA+ data, to check that the generated SDL builds a valid
// schema, and to find where a document puts values (for the notes above).
// Whether a document is valid is the reference's answer alone.
//
// Usage: node scripts/generate-vectors-validate.mjs [--check]
//   --check  regenerate and fail if kit/validate/vectors.json differs

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as graphql16 from "graphql16";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const cli = join(root, "node_modules/tla-ts/dist/cli.js");
const OUT = join(root, "kit/validate/vectors.json");
const CHECK = process.argv.includes("--check");
const VERSIONS = [graphql16];
const RANDOM_DOCUMENTS = 1200;
const SEED = 1;
// tla-ts processes at once, each with one worker.
const LANES = 2;
const SHARD_SIZE = 250;

// ===========================================================================
// Copied from scripts/differential-validation.mjs: the schema, the document
// families, the random grammar and the conversion to TLA+ data.
// ===========================================================================

// ---------------------------------------------------------------------------
// The schema

const SDL = `
schema { query: Query subscription: Subscription }

directive @tag(name: String) repeatable on QUERY | SUBSCRIPTION | FIELD | FRAGMENT_DEFINITION | FRAGMENT_SPREAD | INLINE_FRAGMENT
directive @once on QUERY | FIELD | VARIABLE_DEFINITION

type Query {
  node(id: ID!): Node
  user(id: ID): User
  post: Post
  resource: Resource
  search(term: String = "", filter: Filter): [Result!]
  matrix(rows: [[Int]]): [[Int!]]
  echo(int: Int, float: Float, opt: Int! = 1, list: [Int!], nums: [Int!] = [1], filter: Filter, pick: Pick, role: Role): String
}

type Subscription {
  postAdded: Post
  userJoined(room: ID!): User
}

interface Node { id: ID! }
interface Resource implements Node { id: ID! url: String }

type User implements Node {
  id: ID!
  name: String
  score: Int
  role: Role
  avatar(size: Int!): String
  friends(first: Int = 10): [User]
  posts: [Post!]!
}

type Post implements Node {
  id: ID!
  name: String!
  score: Float
  author: User
  tags: [[String!]]
}

union Result = User | Post
enum Role { ADMIN GUEST }
input Filter { role: Role limit: Int! offset: Int! = 0 tags: [String!] }
input Pick @oneOf { id: ID name: String }
`;

const schemas = new Map(VERSIONS.map((g) => [g.version, g.buildSchema(SDL)]));

// ---------------------------------------------------------------------------
// Documents: systematic families

const product = (...lists) => lists.reduce((acc, list) => acc.flatMap((a) => list.map((b) => [...a, b])), [[]]);

// Fragment cycles: three fragments on User, each spreading nothing or one
// fragment directly, under a field, or in an inline fragment.
const cycles = () =>
  product(["", "A", "B", "C"], ["", "A", "B", "C"], ["", "A", "B"], ["direct", "nested", "inline"], ["A", "B"]).map(
    ([a, b, c, how, entry]) => {
      const spread = (t) =>
        !t ? "" : how === "direct" ? `...${t}` : how === "nested" ? `friends { ...${t} }` : `... on User { ...${t} }`;
      return `{ user { ...${entry} } }
fragment A on User { id ${spread(a)} }
fragment B on User { id ${spread(b)} }
fragment C on User { name ${spread(c)} }`;
    },
  );

// Spreads: every scope against every type condition, inline and named.
const SCOPES = { user: "user", post: "post", node: 'node(id: "1")', resource: "resource", search: "search" };
const CONDITIONS = ["User", "Post", "Node", "Resource", "Result", "Role", "Unknown"];
const spreads = () => [
  ...product(Object.values(SCOPES), CONDITIONS, ["inline", "named"]).map(([scope, condition, form]) =>
    form === "inline"
      ? `{ ${scope} { ... on ${condition} { __typename } } }`
      : `{ ${scope} { ...F } } fragment F on ${condition} { __typename }`,
  ),
  ...Object.values(SCOPES).map((scope) => `{ ${scope} { ... @include(if: true) { __typename } } }`),
  `{ node(id: "1") { ...R } } fragment R on Resource { ... on Node { id } }`,
  `{ search { ...N } } fragment N on Node { ... on Result { __typename } }`,
];

// Field merging: two selections of response name "a" in a Node scope, each
// directly, in an inline fragment, or in a fragment.
const MERGE_FIELDS = {
  Node: ["a: id", "a: __typename"],
  User: [
    "a: id",
    "a: name",
    "a: score",
    "a: role",
    "a: avatar(size: 1)",
    "a: avatar(size: 2)",
    "a: avatar(size: $x)",
    "a: avatar(size: $y)",
    "a: friends { id }",
    "a: friends { b: id }",
    "a: friends { b: name }",
    "a: friends(first: 1) { id }",
    "a: posts { id }",
    "a: __typename",
  ],
  Post: ["a: id", "a: name", "a: score", "a: author { id }", "a: author { b: name }", "a: tags", "a: __typename"],
};
const merging = () => {
  const alternatives = [
    ...MERGE_FIELDS.Node.map((f) => ({ text: f, fragment: "" })),
    ...MERGE_FIELDS.Node.map((f) => ({ text: `... on Node { ${f} }`, fragment: "" })),
    ...MERGE_FIELDS.User.map((f) => ({ text: `... on User { ${f} }`, fragment: "" })),
    ...MERGE_FIELDS.Post.map((f) => ({ text: `... on Post { ${f} }`, fragment: "" })),
    ...["a: name", "a: score", "a: friends { b: id }"].map((f, i) => ({ text: `...U${i}`, fragment: `fragment U${i} on User { ${f} }` })),
    ...["a: name", "a: author { b: name }"].map((f, i) => ({ text: `...P${i}`, fragment: `fragment P${i} on Post { ${f} }` })),
  ];
  const docs = [];
  alternatives.forEach((x, i) =>
    alternatives.slice(i).forEach((y) => {
      const fragments = [...new Set([x.fragment, y.fragment].filter(Boolean))].join("\n");
      docs.push(`query ($x: Int! = 1, $y: Int! = 2) { node(id: "1") { ${x.text} ${y.text} } }\n${fragments}`);
    }),
  );
  // Two fields of one response name, each with its own selection set.
  const subselections = ["id", "name", "b: id", "b: name", "friends { id }", "friends { b: id }", "friends { b: name }"];
  for (const [s1, s2] of product(subselections, subselections)) {
    docs.push(`{ user { ${s1} } user { ${s2} } }`);
    docs.push(`{ user(id: "1") { ${s1} } user(id: "2") { ${s2} } }`);
    docs.push(`{ a: user { ${s1} } a: post { ${s2.replace("friends", "author")} } }`);
    docs.push(`{ search { ... on User { a: friends { ${s1} } } ... on Post { a: author { ${s2} } } } }`);
  }
  // Argument values: the same value written differently, and object
  // fields in another order.
  docs.push(
    `{ a: search(term: "x") { __typename } a: search(term: """x""") { __typename } }`,
    `{ a: search(term: "x") { __typename } a: search(term: "\\u0078") { __typename } }`,
    `{ a: search(term: "x") { __typename } a: search(term: "y") { __typename } }`,
    `{ a: echo(int: 1, float: 2) a: echo(float: 2, int: 1) }`,
    `{ a: echo(filter: {limit: 1, offset: 2}) a: echo(filter: {offset: 2, limit: 1}) }`,
    `{ a: echo(filter: {limit: 1, offset: 2}) a: echo(filter: {limit: 1, offset: 3}) }`,
    `{ a: echo(list: [1]) a: echo(list: 1) }`,
    `{ a: echo(list: [1, 2]) a: echo(list: [2, 1]) }`,
    `{ a: echo(int: 1) a: echo(int: 1, opt: 1) }`,
    `{ a: echo(opt: 1) a: echo }`,
    `{ a: echo(float: 1) a: echo(float: 1.0) }`,
  );
  // Two fragments, spread side by side, in exclusive inline fragments, or
  // under two fields of one response name.
  const X = [["Node", "a: id"], ["User", "a: name"], ["User", "a: score"], ["User", "a: friends { b: id }"]];
  const Y = [["Node", "a: __typename"], ["Post", "a: name"], ["Post", "a: score"], ["Post", "a: author { b: name }"], ["User", "a: friends { b: name }"]];
  const contexts = [
    'node(id: "1") { ...X ...Y }',
    'node(id: "1") { ... on User { ...X } ... on Post { ...Y } }',
    'node(id: "1") { ... on User { ...X ...Y } }',
    'n: node(id: "1") { ...X } n: node(id: "1") { ... on Post { ...Y } }',
    'n: node(id: "1") { ...X } n: node(id: "2") { ...Y }',
    "a: user { ...X } a: post { ...Y }",
  ];
  for (const [[tx, x], [ty, y], context] of product(X, Y, contexts)) {
    docs.push(`{ ${context} }\nfragment X on ${tx} { ${x} }\nfragment Y on ${ty} { ${y} }`);
  }
  return docs;
};

// Variables: every variable type, with no default, a null default and a
// non-null default, in every kind of position.
const VARIABLE_TYPES = [
  ["Int", "1"],
  ["Int!", "1"],
  ["[Int]", "[1]"],
  ["[Int!]", "[1]"],
  ["[Int]!", "[1]"],
  ["[[Int]]", "[[1]]"],
  ["ID", '"1"'],
  ["ID!", '"1"'],
  ["Boolean", "true"],
  ["Boolean!", "true"],
  ["Filter", "{limit: 1}"],
  ["Pick", '{id: "1"}'],
  ["String", '"s"'],
];
const LOCATIONS = [
  "echo(int: $v)",
  "echo(opt: $v)",
  "user { avatar(size: $v) }",
  "echo(list: $v)",
  "echo(list: [$v])",
  "echo(list: [1, $v])",
  "echo(nums: $v)",
  "echo(nums: [$v])",
  "matrix(rows: $v)",
  "matrix(rows: [$v])",
  "matrix(rows: [[$v]])",
  "echo(filter: {limit: $v})",
  "echo(filter: {limit: 1, offset: $v})",
  "echo(filter: {limit: 1, tags: [$v]})",
  "echo(pick: {id: $v})",
  'node(id: $v) { id }',
  "user(id: $v) { id }",
  "user @skip(if: $v) { id }",
  "echo(filter: $v)",
  "echo(pick: $v)",
];
const variables = () => [
  ...product(VARIABLE_TYPES, ["none", "null", "value"], LOCATIONS).map(([[type, literal], fallback, location]) => {
    const defaultValue = fallback === "none" ? "" : fallback === "null" ? " = null" : ` = ${literal}`;
    return `query Q($v: ${type}${defaultValue}) { ${location} }`;
  }),
  // Through fragments, and across operations.
  `query Q($v: Int) { user { ...A } } fragment A on User { ...B } fragment B on User { avatar(size: $v) }`,
  `query Q($v: Int!) { user { ...A } } fragment A on User { ...B } fragment B on User { avatar(size: $v) }`,
  `query Q { user { ...A } } fragment A on User { ...B } fragment B on User { avatar(size: $v) }`,
  `query Q($v: Int!, $w: Int) { user { ...A } } fragment A on User { ...B } fragment B on User { avatar(size: $v) }`,
  `query Q($v: Int!) { user { ...A } } query R { user { ...A } } fragment A on User { avatar(size: $v) }`,
  `query Q($v: Int!) { user { ...A } } query R($v: Int) { user { ...A } } fragment A on User { avatar(size: $v) }`,
  `query Q($v: Boolean!) { user { ...A @skip(if: $v) } } fragment A on User { id }`,
  `query Q($v: Boolean!) @tag(name: "x") { user { id } }`,
  `query Q($v: Int, $v: Int) { echo(int: $v) }`,
  `query Q($v: User) { echo(int: $v) }`,
  `query Q($v: [Result]) { echo(int: 1) }`,
  `query Q($v: Role = ADMIN) { echo(role: $v) }`,
  `query Q($v: Role = "ADMIN") { echo(role: $v) }`,
  `query Q($v: Float) { echo(float: $v) }`,
  `query Q($v: Int) { echo(float: $v) }`,
];

// Literals against every argument type.
const LITERALS = [
  "1", "1.5", '"s"', "true", "null", "ADMIN", "BOGUS", "[1]", "[1, null]", "[[1]]", '["s"]',
  "{limit: 1}", "{}", "{limit: null}", "{limit: 1, limit: 2}", "{limit: 1, bogus: 1}", "{limit: 1, role: ADMIN}",
  '{limit: 1, role: "ADMIN"}', '{limit: 1, tags: "a"}', '{limit: 1, tags: ["a", null]}', "{offset: 1}",
  '{id: "1"}', '{id: "1", name: "x"}', "{id: null}", '{name: "x"}', "{id: 1}",
];
const ARGUMENTS = [
  "echo(int: X)", "echo(float: X)", "echo(opt: X)", "echo(list: X)", "echo(filter: X)", "echo(pick: X)",
  "echo(role: X)", "matrix(rows: X)", "node(id: X) { id }", "user(id: X) { id }", "user { avatar(size: X) }",
  "search(filter: X) { __typename }",
];
const values = () => [
  ...product(LITERALS, ARGUMENTS).map(([literal, argument]) => `{ ${argument.replace("X", literal)} }`),
  `{ node { id } }`,
  `{ node(id: "1", id: "2") { id } }`,
  `{ node(id: "1", bogus: 1) { id } }`,
  `{ user { avatar } }`,
  `{ user { avatar(size: 1, size: 2) } }`,
  `{ echo }`,
  `{ user { id @skip } }`,
  `{ user { id @skip(if: null) } }`,
  `{ user { id @skip(if: true, if: false) } }`,
  `{ user { id @tag } }`,
  `{ user { id @tag(name: null) } }`,
  `{ user { id @tag(nom: "x") } }`,
  `{ user { id @nope(if: true) } }`,
  `{ user { name(x: 1) } }`,
  `{ bogus(x: 1) }`,
  `subscription { userJoined { id } }`,
  `subscription { userJoined(room: "1") { id } }`,
];

// Leaf selections: every field with and without a selection set.
const leaves = () => {
  const docs = [];
  const fields = {
    Query: ['node(id: "1")', "user", "post", "resource", "search", "matrix", "echo"],
    User: ["id", "name", "score", "role", "avatar(size: 1)", "friends", "posts"],
    Post: ["id", "name", "score", "author", "tags"],
  };
  const wrap = { Query: (s) => `{ ${s} }`, User: (s) => `{ user { ${s} } }`, Post: (s) => `{ post { ${s} } }` };
  for (const [type, list] of Object.entries(fields)) {
    for (const field of list) {
      docs.push(wrap[type](field), wrap[type](`${field} { __typename }`));
    }
  }
  docs.push(`{ user { name { x } } }`, `{ search { name } }`, `{ node(id: "1") { name } }`, `{ resource { url id __typename } }`);
  return docs;
};

// Operations: one, two or three from a pool.
const OPERATIONS = [
  [`{ user { id } }`],
  [`query A { user { id } }`],
  [`query B { post { id } }`],
  [`query A { post { id } }`],
  [`mutation M { user { id } }`],
  [`subscription S { postAdded { id } }`],
  [`subscription { postAdded { id } }`],
  [`subscription S2 { postAdded { id } userJoined(room: "1") { id } }`],
  [`subscription S3 { ...SF }`, `fragment SF on Subscription { postAdded { id } }`],
  [`subscription S4 { __typename }`],
  [`subscription S5 { postAdded @skip(if: true) { id } }`],
  [`subscription S6 { ... on Subscription { postAdded { id } } }`],
  [`subscription S7 { a: postAdded { id } a: postAdded { name } }`],
  [`subscription S8 { ... on Query { __typename } }`],
  [`subscription S9 { ...SG }`, `fragment SG on Subscription { postAdded { id } userJoined(room: "1") { id } }`],
  [`subscription S10($v: Boolean!) { postAdded @include(if: $v) { id } }`],
  [`subscription S11 { ...SF ...SF }`, `fragment SF on Subscription { postAdded { id } }`],
  [`subscription S12 { postAdded { id } ...SH }`, `fragment SH on Subscription { postAdded { name } }`],
];
const operations = () => {
  const docs = [];
  const add = (picks) => {
    const ops = picks.map((p) => p[0]);
    const fragments = [...new Set(picks.flatMap((p) => p.slice(1)))];
    docs.push([...ops, ...fragments].join("\n"));
  };
  OPERATIONS.forEach((a, i) => {
    add([a]);
    OPERATIONS.slice(i + 1).forEach((b) => add([a, b]));
  });
  for (let i = 0; i + 2 < OPERATIONS.length; i += 2) add([OPERATIONS[i], OPERATIONS[i + 1], OPERATIONS[i + 2]]);
  return docs;
};

// Directives in every location, once and twice.
const DIRECTIVES = ["@skip(if: true)", "@include(if: false)", '@tag(name: "x")', "@once", "@nope", "@deprecated", "@oneOf"];
const DIRECTIVE_LOCATIONS = [
  (d) => `query Q ${d} { user { id } }`,
  (d) => `subscription S ${d} { postAdded { id } }`,
  (d) => `{ user ${d} { id } }`,
  (d) => `{ user { ...F ${d} } } fragment F on User { id }`,
  (d) => `{ user { ... on User ${d} { id } } }`,
  (d) => `{ user { ...F } } fragment F on User ${d} { id }`,
  (d) => `query Q($v: Int ${d}) { echo(int: $v) }`,
];
const directives = () => [
  ...product(DIRECTIVES, DIRECTIVE_LOCATIONS, [1, 2]).map(([d, location, n]) => location(Array(n).fill(d).join(" "))),
  `{ user @skip(if: true) @skip(if: false) { id } }`,
  `{ user @skip(if: true) @include(if: true) { id } }`,
  `{ user @tag(name: "a") @tag(name: "b") { id } }`,
  `{ user @once { id @once } }`,
];

// Names: operations, fragments, arguments and variables defined twice or
// not at all.
const names = () => {
  const docs = [
    `query A { user { id } } query A { post { id } }`,
    `query A { user { id } } mutation A { user { id } }`,
    `query A { user { id } } subscription A { postAdded { id } }`,
    `query A { user { ...A } } fragment A on User { id }`,
    `query A { user { id } } query B { user { id } } query A { user { id } }`,
    `{ node(id: "1", id: "1") { id } }`,
    `{ user { avatar(size: 1, size: 1, bogus: 2) } }`,
    `{ user(bogus: 1) { id } }`,
    `{ echo(int: 1, int2: 2, int: 3) }`,
    `{ user @tag(name: "a", name: "b") { id } }`,
    `{ user @skip(if: true, if: true) { id } }`,
    `{ user @include(unless: true) { id } }`,
    `{ user @tag(name: "a", label: "b") { id } }`,
    `query ($a: Int, $a: Int!) { echo(int: $a) }`,
    `query ($a: Int, $b: Int, $a: Int) { echo(int: $a, opt: $b) }`,
    `query Q($a: User, $b: Result, $c: Role, $d: Filter, $e: [Node], $f: Resource!) { echo(role: $c, filter: $d) }`,
    `query Q($a: [[Post!]]) { echo(int: 1) }`,
  ];
  const bodies = ["id", "name", "friends { id }"];
  for (const [b1, b2, t2, use] of product(bodies, bodies, ["User", "Post"], ["{ user { ...F } }", "{ user { id } }", "{ node(id: \"1\") { ...F ...G } }"])) {
    docs.push(`${use}\nfragment F on User { ${b1} }\nfragment F on ${t2} { ${b2} }\nfragment G on User { ...F }`);
  }
  return docs;
};

const executable = () => [
  `type Foo { a: Int } { user { id } }`,
  `extend type Query { x: Int } { user { id } }`,
  `schema { query: Query } { user { id } }`,
  `directive @x on FIELD { user { id } }`,
  `scalar Date`,
  `{ user { id } }`,
];

// ---------------------------------------------------------------------------
// Documents: a bounded, typed random grammar

const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const randomDocuments = (count, seed) => {
  const next = mulberry32(seed);
  const chance = (p) => next() < p;
  const pick = (list) => list[Math.floor(next() * list.length)];
  const schema = schemas.get(graphql16.version);
  const { getNamedType, isCompositeType, isLeafType, isAbstractType, isNonNullType, isListType, isEnumType, isInputObjectType } =
    graphql16;
  const FRAGMENTS = ["F0", "F1", "F2"];
  const VARIABLES = ["v0", "v1", "v2"];

  // A literal for an input type, sometimes the wrong kind or a variable.
  const literal = (type, usages, depth = 0) => {
    if (chance(0.25)) {
      const name = pick(VARIABLES);
      usages.push({ name, type });
      return `$${name}`;
    }
    if (chance(0.08)) return pick(["null", "1", '"s"', "ADMIN", "[1]", "{limit: 1}"]);
    const nullable = isNonNullType(type) ? type.ofType : type;
    if (isListType(nullable)) {
      if (depth > 2 || chance(0.3)) return literal(nullable.ofType, usages, depth + 1);
      return `[${literal(nullable.ofType, usages, depth + 1)}]`;
    }
    if (isEnumType(nullable)) return pick(["ADMIN", "GUEST"]);
    if (isInputObjectType(nullable)) {
      const fields = Object.values(nullable.getFields()).filter((f) => isNonNullType(f.type) || chance(0.4));
      return `{${fields.map((f) => `${f.name}: ${depth > 2 ? "1" : literal(f.type, usages, depth + 1)}`).join(", ")}}`;
    }
    return { Int: "1", Float: "1.5", String: '"s"', Boolean: "true", ID: '"1"' }[nullable.name] ?? "1";
  };

  const directivesFor = (usages) => {
    if (!chance(0.12)) return "";
    const d = pick(["skip", "include", "tag", "once", "nope"]);
    if (d === "skip" || d === "include") return ` @${d}(if: ${literal(graphql16.GraphQLBoolean, usages)})`;
    return ` @${d}`;
  };

  const selectionSet = (type, depth, ctx) => {
    const named = getNamedType(type);
    const count = 1 + Math.floor(next() * 3);
    const selections = [];
    for (let i = 0; i < count; i++) {
      const roll = next();
      if (roll < 0.15 && depth < 3) {
        const condition = chance(0.85)
          ? pick(isAbstractType(named) ? [...schema.getPossibleTypes(named).map((t) => t.name), "Node", "Result"] : [named.name, "Node", "Post", "User"])
          : pick(["Resource", "Role", "Bogus", ""]);
        selections.push(
          `...${condition ? ` on ${condition}` : ""}${directivesFor(ctx.usages)} { ${selectionSet(schema.getType(condition) ?? named, depth + 1, ctx)} }`,
        );
      } else if (roll < 0.28) {
        const name = pick(FRAGMENTS);
        ctx.spread.add(name);
        selections.push(`...${name}${directivesFor(ctx.usages)}`);
      } else {
        const fields = "getFields" in named ? Object.values(named.getFields()) : [];
        const field = fields.length > 0 && chance(0.93) ? pick(fields) : undefined;
        const alias = chance(0.3) ? `${pick(["a", "b"])}: ` : "";
        if (!field) {
          selections.push(`${alias}${chance(0.6) ? "__typename" : "bogus"}`);
          continue;
        }
        const args = field.args.filter((a) => isNonNullType(a.type) ? chance(0.9) : chance(0.35));
        const argText = args.length ? `(${args.map((a) => `${a.name}: ${literal(a.type, ctx.usages)}`).join(", ")})` : "";
        const fieldType = getNamedType(field.type);
        const sub = isCompositeType(fieldType)
          ? depth < 3 && chance(0.95) ? ` { ${selectionSet(fieldType, depth + 1, ctx)} }` : ""
          : chance(0.04) ? " { id }" : "";
        selections.push(`${alias}${field.name}${argText}${directivesFor(ctx.usages)}${sub}`);
      }
    }
    return selections.join(" ");
  };

  const typeText = (type) => String(type);
  const docs = [];
  for (let n = 0; n < count; n++) {
    const ctx = { usages: [], spread: new Set() };
    const operationCount = chance(0.8) ? 1 : 2;
    const ops = [];
    for (let o = 0; o < operationCount; o++) {
      const start = ctx.usages.length;
      const kind = chance(0.85) ? "query" : "subscription";
      const rootType = kind === "query" ? schema.getQueryType() : schema.getSubscriptionType();
      const body = selectionSet(rootType, 0, ctx);
      const used = ctx.usages.slice(start);
      // Declare most used variables, usually with the type they're used at.
      const declared = new Map();
      for (const u of used) {
        if (declared.has(u.name) || chance(0.1)) continue;
        const type = chance(0.6) ? typeText(u.type) : pick(VARIABLE_TYPES)[0];
        const fallback = chance(0.25) ? pick([" = null", " = 1", ' = "1"', " = true", " = [1]"]) : "";
        declared.set(u.name, `$${u.name}: ${type}${fallback}`);
      }
      if (chance(0.1)) declared.set("unused", "$unused: Int");
      const vars = declared.size ? `(${[...declared.values()].join(", ")})` : "";
      const name = operationCount === 1 && chance(0.4) && !vars ? "" : `${kind === "query" ? "Q" : "S"}${o}`;
      ops.push(name || vars ? `${kind} ${name}${vars} { ${body} }` : `{ ${body} }`);
    }
    // Define the fragments that were spread, and sometimes one that wasn't.
    const fragments = [];
    const defined = new Set();
    const queue = [...ctx.spread, ...(chance(0.15) ? ["F2"] : [])];
    while (queue.length > 0) {
      const name = queue.shift();
      if (defined.has(name) || chance(0.05)) continue;
      defined.add(name);
      const condition = chance(0.95) ? pick(["User", "Post", "Node", "Result", "Query"]) : pick(["Role", "Bogus"]);
      const fragmentCtx = { usages: ctx.usages, spread: new Set() };
      const body = selectionSet(schema.getType(condition) ?? schema.getType("User"), 1, fragmentCtx);
      for (const s of fragmentCtx.spread) queue.push(s);
      fragments.push(`fragment ${name} on ${condition} { ${body} }`);
    }
    docs.push([...ops, ...fragments].join("\n"));
  }
  return docs;
};

// ---------------------------------------------------------------------------
// Turning documents and the schema into TLA+ data

const str = (s) => JSON.stringify(String(s));
const seq = (items) => `<<${items.join(", ")}>>`;
const setOf = (items) => `{${[...items].map(str).join(", ")}}`;
const fn = (entries) => (entries.length === 0 ? "<<>>" : entries.map(([k, v]) => `(${str(k)} :> ${v})`).join(" @@ "));
const bool = (b) => (b ? "TRUE" : "FALSE");

const NO_VALUE = `[kind |-> "none", value |-> "", items |-> <<>>, fields |-> <<>>]`;

const schemaToTla = (g, schema) => {
  const ref = (t) => {
    const wrappers = [];
    while (g.isWrappingType(t)) {
      wrappers.push(g.isNonNullType(t) ? "nonNull" : "list");
      t = t.ofType;
    }
    return `[name |-> ${str(t.name)}, wrappers |-> ${seq(wrappers.map(str))}]`;
  };
  const input = (a) => `[type |-> ${ref(a.type)}, hasDefault |-> ${bool(a.defaultValue !== undefined)}]`;
  const types = Object.values(schema.getTypeMap())
    .filter((t) => !t.name.startsWith("__"))
    .map((t) => {
      const kind = g.isScalarType(t) ? "scalar" : g.isEnumType(t) ? "enum" : g.isObjectType(t) ? "object"
        : g.isInterfaceType(t) ? "interface" : g.isUnionType(t) ? "union" : "input";
      const fields = g.isObjectType(t) || g.isInterfaceType(t)
        ? fn(Object.values(t.getFields()).map((f) => [f.name, `[type |-> ${ref(f.type)}, args |-> ${fn(f.args.map((a) => [a.name, input(a)]))}]`]))
        : "<<>>";
      const possible = g.isAbstractType(t) ? schema.getPossibleTypes(t).map((p) => p.name) : [];
      const inputFields = g.isInputObjectType(t) ? fn(Object.values(t.getFields()).map((f) => [f.name, input(f)])) : "<<>>";
      const enumValues = g.isEnumType(t) ? t.getValues().map((v) => v.name) : [];
      return [t.name, `[kind |-> ${str(kind)}, fields |-> ${fields}, possibleTypes |-> ${setOf(possible)}, inputFields |-> ${inputFields}, enumValues |-> ${setOf(enumValues)}, oneOf |-> ${bool(g.isInputObjectType(t) && t.isOneOf)}]`];
    });
  const directives = schema.getDirectives().map((d) => [
    d.name,
    `[locations |-> ${setOf(d.locations)}, args |-> ${fn(d.args.map((a) => [a.name, input(a)]))}, repeatable |-> ${bool(d.isRepeatable)}]`,
  ]);
  const root = (t) => str(t?.name ?? "");
  return `[types |-> ${fn(types)},
  directives |-> ${fn(directives)},
  roots |-> [query |-> ${root(schema.getQueryType())}, mutation |-> ${root(schema.getMutationType())}, subscription |-> ${root(schema.getSubscriptionType())}]]`;
};

const typeRefToTla = (node) => {
  const wrappers = [];
  while (node.kind !== "NamedType") {
    wrappers.push(node.kind === "NonNullType" ? "nonNull" : "list");
    node = node.type;
  }
  return `[name |-> ${str(node.name.value)}, wrappers |-> ${seq(wrappers.map(str))}]`;
};

const valueToTla = (v) => {
  const base = (kind, value, items = "<<>>", fields = "<<>>") =>
    `[kind |-> ${str(kind)}, value |-> ${str(value)}, items |-> ${items}, fields |-> ${fields}]`;
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
      return base("object", "", "<<>>", seq(v.fields.map((f) => `[name |-> ${str(f.name.value)}, value |-> ${valueToTla(f.value)}]`)));
    default: throw new Error(`unexpected value ${v.kind}`);
  }
};

const argumentsToTla = (args = []) => seq(args.map((a) => `[name |-> ${str(a.name.value)}, value |-> ${valueToTla(a.value)}]`));
const directivesToTla = (directives = []) =>
  seq(directives.map((d) => `[name |-> ${str(d.name.value)}, arguments |-> ${argumentsToTla(d.arguments)}]`));

const selectionToTla = (s) => {
  const kind = { Field: "field", FragmentSpread: "fragmentSpread", InlineFragment: "inlineFragment" }[s.kind];
  return `[kind |-> ${str(kind)}, name |-> ${str(s.name?.value ?? "")}, alias |-> ${str(s.alias?.value ?? "")}, arguments |-> ${argumentsToTla(s.arguments)}, directives |-> ${directivesToTla(s.directives)}, typeCondition |-> ${str(s.typeCondition?.name.value ?? "")}, hasSelectionSet |-> ${bool(Boolean(s.selectionSet))}, selectionSet |-> ${selectionSetToTla(s.selectionSet)}]`;
};
const selectionSetToTla = (set) => seq((set?.selections ?? []).map(selectionToTla));

const definitionToTla = (d) => {
  const def = (kind, operation, name, variables, typeCondition, directives, selectionSet) =>
    `[kind |-> ${str(kind)}, operation |-> ${str(operation)}, name |-> ${str(name)}, variables |-> ${variables}, typeCondition |-> ${str(typeCondition)}, directives |-> ${directives}, selectionSet |-> ${selectionSet}]`;
  if (d.kind === "OperationDefinition") {
    const variables = seq((d.variableDefinitions ?? []).map((v) =>
      `[name |-> ${str(v.variable.name.value)}, type |-> ${typeRefToTla(v.type)}, hasDefault |-> ${bool(Boolean(v.defaultValue))}, default |-> ${v.defaultValue ? valueToTla(v.defaultValue) : NO_VALUE}, directives |-> ${directivesToTla(v.directives)}]`));
    return def("operation", d.operation, d.name?.value ?? "", variables, "", directivesToTla(d.directives), selectionSetToTla(d.selectionSet));
  }
  if (d.kind === "FragmentDefinition") {
    return def("fragment", "", d.name.value, "<<>>", d.typeCondition.name.value, directivesToTla(d.directives), selectionSetToTla(d.selectionSet));
  }
  return def("typeSystem", "", "", "<<>>", "", "<<>>", "<<>>");
};

const documentToTla = (doc) => seq(doc.definitions.map(definitionToTla));

// ===========================================================================
// End of the copied part.
// ===========================================================================

const { parse, print, buildSchema, validateSchema } = graphql16;

// ---------------------------------------------------------------------------
// Running tla-ts

const runTla = (dir, name) =>
  new Promise((done) => {
    const child = spawn(process.execPath, [cli, "-workers", "1", "-config", `${name}.cfg`, `${name}.tla`], { cwd: dir });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("close", (status) => done({ status, output }));
  });

const pool = async (items, lanes, worker) => {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(lanes, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index], index);
      }
    }),
  );
  return results;
};

// Runs modules that extend Validation, LANES at a time, and returns each
// one's output with line breaks collapsed (tla-ts wraps long values; it
// never breaks a string).
const runModules = async (modules) => {
  const dir = mkdtempSync(join(tmpdir(), "validate-vectors-"));
  try {
    writeFileSync(join(dir, "Validation.tla"), readFileSync(join(root, "specs/Validation.tla"), "utf8"));
    return await pool(modules, LANES, async (body, k) => {
      const name = `Vectors${k}`;
      writeFileSync(join(dir, `${name}.tla`), `---- MODULE ${name} ----\nEXTENDS Validation\n\n${body}\n====\n`);
      writeFileSync(join(dir, `${name}.cfg`), "INIT Init\nNEXT Next\n");
      const { status, output } = await runTla(dir, name);
      const flat = output.replace(/\s*\n\s*/g, " ");
      if (status !== 0 || !/<<\s*"done"/.test(flat)) {
        const lines = output.split("\n").filter((l) => /Error|error|Exception/.test(l)).slice(0, 10);
        throw new Error(`tla-ts failed:\n${lines.join("\n") || output.slice(-2000)}`);
      }
      return flat;
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// Reads one value tla-ts printed, starting at `start`: sequences and sets
// become arrays, records (and functions over strings) objects. Returns the
// value and where it ends.
const readTla = (text, start) => {
  let i = start;
  const skip = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };
  const expect = (s) => {
    skip();
    if (!text.startsWith(s, i)) throw new Error(`can't read tla-ts output: expected ${s} at "${text.slice(i, i + 60)}"`);
    i += s.length;
  };
  const items = (close) => {
    const out = [];
    skip();
    if (text.startsWith(close, i)) {
      i += close.length;
      return out;
    }
    for (;;) {
      out.push(value());
      skip();
      if (text[i] === ",") {
        i++;
        continue;
      }
      expect(close);
      return out;
    }
  };
  const KEY = /\s*([A-Za-z_][A-Za-z0-9_]*)\s*\|->/y;
  const STRING = /"((?:[^"\\]|\\.)*)"/y;
  const NUMBER = /-?\d+/y;
  const value = () => {
    skip();
    if (text.startsWith("<<", i)) {
      i += 2;
      return items(">>");
    }
    if (text[i] === "{") {
      i++;
      return items("}");
    }
    if (text[i] === "[") {
      i++;
      const record = {};
      for (;;) {
        KEY.lastIndex = i;
        const m = KEY.exec(text);
        if (!m) throw new Error(`can't read tla-ts output: expected a record key at "${text.slice(i, i + 60)}"`);
        i = KEY.lastIndex;
        record[m[1]] = value();
        skip();
        if (text[i] === ",") {
          i++;
          continue;
        }
        expect("]");
        return record;
      }
    }
    if (text[i] === '"') {
      STRING.lastIndex = i;
      const m = STRING.exec(text);
      i = STRING.lastIndex;
      return JSON.parse(`"${m[1]}"`);
    }
    if (text.startsWith("TRUE", i)) {
      i += 4;
      return true;
    }
    if (text.startsWith("FALSE", i)) {
      i += 5;
      return false;
    }
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(text);
    if (!m) throw new Error(`can't read tla-ts output at "${text.slice(i, i + 60)}"`);
    i = NUMBER.lastIndex;
    return Number(m[0]);
  };
  const v = value();
  return { value: v, end: i };
};

// The values after the tag of every `<<"tag", ...>>` tla-ts printed.
const printed = (flat, tag) => {
  const out = [];
  const re = new RegExp(`<<\\s*"${tag}",`, "g");
  for (const m of flat.matchAll(re)) out.push(readTla(flat, m.index).value.slice(1));
  return out;
};

// An empty function prints as <<>>.
const obj = (f) => (Array.isArray(f) || f === undefined ? {} : f);

// ---------------------------------------------------------------------------
// The reference's verdicts: for each document, the rules it breaks and the
// subjects each reports.

// Every rule's violations, as a function from the rules a document breaks.
const ALL_RULES = `LET Full == WithIntrospection(Schema)
      violations == [r \\in Rules |-> CheckRule(r, Full, Docs[i])]
  IN [r \\in {x \\in Rules : violations[x] # {}} |-> violations[r]]`;
const asViolations = (violations) =>
  Object.fromEntries(Object.entries(obj(violations)).map(([rule, subjects]) => [rule, [...subjects].sort()]));

// Evaluates `expression` (by default every rule) on each document; it may
// use Schema and Docs[i].
const evaluate = async (groups, expression = ALL_RULES, read = asViolations) => {
  const shards = [];
  for (const group of groups) {
    for (let i = 0; i < group.docs.length; i += SHARD_SIZE) {
      shards.push({ group, start: i, docs: group.docs.slice(i, i + SHARD_SIZE) });
    }
  }
  const outputs = await runModules(
    shards.map(
      (shard) => `Schema == ${shard.group.schemaTla}

Docs == ${seq(shard.docs)}

ASSUME \\A i \\in DOMAIN Docs :
  PrintT(<<"doc", i, ${expression}>>)
ASSUME PrintT(<<"done", Len(Docs)>>)`,
    ),
  );
  const results = groups.map((g) => new Array(g.docs.length));
  shards.forEach((shard, k) => {
    const lines = printed(outputs[k], "doc");
    if (lines.length !== shard.docs.length) throw new Error(`read ${lines.length} verdicts from a shard of ${shard.docs.length} documents`);
    for (const [index, value] of lines) {
      results[groups.indexOf(shard.group)][shard.start + index - 1] = read(value);
    }
  });
  for (const r of results) if (r.some((x) => x === undefined)) throw new Error("a document has no verdict");
  return results;
};

// ---------------------------------------------------------------------------
// Validation.tla's test vectors: the spec's examples, as GraphQL text.

const extractSpec = async () => {
  const [flat] = await runModules([
    `ASSUME PrintT(<<"sections", Sections>>)
ASSUME PrintT(<<"schemas", [examples |-> Examples, hello |-> Hello]>>)
ASSUME PrintT(<<"examples", [g \\in DOMAIN Vectors |-> [n \\in DOMAIN Vectors[g] |->
  [rule |-> Vectors[g][n].rule, hello |-> Vectors[g][n].schema = Hello,
   doc |-> Vectors[g][n].doc, valid |-> Vectors[g][n].valid]]]>>)
ASSUME PrintT(<<"done">>)`,
  ]);
  const [[sections]] = printed(flat, "sections");
  const [[schemasTla]] = printed(flat, "schemas");
  const [[groups]] = printed(flat, "examples");
  const GROUPS = ["documents", "operations", "fields", "arguments", "fragments", "values", "directives", "variables"];
  if (Object.keys(groups).sort().join() !== [...GROUPS].sort().join()) throw new Error(`unexpected vector groups: ${Object.keys(groups)}`);
  return { sections, schemas: schemasTla, vectors: GROUPS.flatMap((g) => groups[g]) };
};

const BUILT_IN_SCALARS = new Set(["Int", "Float", "String", "Boolean", "ID"]);
const BUILT_IN_DIRECTIVES = new Set(["skip", "include", "deprecated", "specifiedBy", "oneOf"]);

const refText = (t) => {
  const wrap = (ws) => (ws.length === 0 ? t.name : ws[0] === "nonNull" ? `${wrap(ws.slice(1))}!` : `[${wrap(ws.slice(1))}]`);
  return wrap(t.wrappers);
};
const sorted = (entries) => [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

// The reference records only that an argument or input field has a
// default, not which; any value of the type will do.
const defaultFor = (S, t) => {
  const inner = t.wrappers[0] === "nonNull" ? t.wrappers.slice(1) : t.wrappers;
  if (inner[0] === "list") return "[]";
  if (t.name === "Boolean") return "false";
  if (t.name === "Int" || t.name === "Float") return "0";
  if (t.name === "String" || t.name === "ID") return '""';
  if (S.types[t.name]?.kind === "enum") return [...S.types[t.name].enumValues].sort()[0];
  throw new Error(`no default value for ${refText(t)}`);
};

// A schema record of the reference as SDL.
const schemaSdl = (S) => {
  const implementsOf = new Map();
  for (const [name, t] of sorted(Object.entries(S.types))) {
    if (t.kind === "interface") for (const p of t.possibleTypes) implementsOf.set(p, [...(implementsOf.get(p) ?? []), name]);
  }
  const inputs = (defs) => sorted(Object.entries(obj(defs))).map(([n, a]) => `${n}: ${refText(a.type)}${a.hasDefault ? ` = ${defaultFor(S, a.type)}` : ""}`);
  const args = (defs) => (inputs(defs).length ? `(${inputs(defs).join(", ")})` : "");
  const fields = (f) => `{\n${sorted(Object.entries(obj(f))).map(([n, d]) => `  ${n}${args(d.args)}: ${refText(d.type)}`).join("\n")}\n}`;
  const roots = ["query", "mutation", "subscription"].filter((r) => S.roots[r]).map((r) => `${r}: ${S.roots[r]}`);
  const out = [`schema { ${roots.join(" ")} }`];
  for (const [name, d] of sorted(Object.entries(obj(S.directives)))) {
    if (BUILT_IN_DIRECTIVES.has(name)) continue;
    out.push(`directive @${name}${args(d.args)}${d.repeatable ? " repeatable" : ""} on ${[...d.locations].sort().join(" | ")}`);
  }
  for (const [name, t] of sorted(Object.entries(S.types))) {
    if (BUILT_IN_SCALARS.has(name)) continue;
    if (t.kind === "scalar") out.push(`scalar ${name}`);
    else if (t.kind === "enum") out.push(`enum ${name} { ${[...t.enumValues].sort().join(" ")} }`);
    else if (t.kind === "object") {
      const impl = implementsOf.has(name) ? ` implements ${implementsOf.get(name).join(" & ")}` : "";
      out.push(`type ${name}${impl} ${fields(t.fields)}`);
    } else if (t.kind === "interface") out.push(`interface ${name} ${fields(t.fields)}`);
    else if (t.kind === "union") out.push(`union ${name} = ${[...t.possibleTypes].sort().join(" | ")}`);
    else if (t.kind === "input") out.push(`input ${name}${t.oneOf ? " @oneOf" : ""} {\n${inputs(t.inputFields).map((l) => `  ${l}`).join("\n")}\n}`);
    else throw new Error(`unknown kind ${t.kind}`);
  }
  return `${out.join("\n\n")}\n`;
};

// A document of the reference as GraphQL text.
const valueText = (v) =>
  v.kind === "string" ? JSON.stringify(v.value)
    : v.kind === "null" ? "null"
    : v.kind === "variable" ? `$${v.value}`
    : v.kind === "list" ? `[${v.items.map(valueText).join(", ")}]`
    : v.kind === "object" ? `{${v.fields.map((f) => `${f.name}: ${valueText(f.value)}`).join(", ")}}`
    : v.value;
const argsText = (args) => (args.length ? `(${args.map((a) => `${a.name}: ${valueText(a.value)}`).join(", ")})` : "");
const dirsText = (dirs) => dirs.map((d) => ` @${d.name}${argsText(d.arguments)}`).join("");
const setText = (set) => `{ ${set.map(selectionText).join(" ")} }`;
const selectionText = (s) =>
  s.kind === "field"
    ? `${s.alias ? `${s.alias}: ` : ""}${s.name}${argsText(s.arguments)}${dirsText(s.directives)}${s.hasSelectionSet ? ` ${setText(s.selectionSet)}` : ""}`
    : s.kind === "fragmentSpread"
      ? `...${s.name}${dirsText(s.directives)}`
      : `...${s.typeCondition ? ` on ${s.typeCondition}` : ""}${dirsText(s.directives)} ${setText(s.selectionSet)}`;
const definitionText = (d) => {
  if (d.kind === "fragment") return `fragment ${d.name} on ${d.typeCondition}${dirsText(d.directives)} ${setText(d.selectionSet)}`;
  // The reference records only that a definition isn't executable; this is
  // the spec's example of one.
  if (d.kind === "typeSystem") return `extend type ${d.name} { color: String }`;
  const vars = d.variables.map((v) => `$${v.name}: ${refText(v.type)}${v.hasDefault ? ` = ${valueText(v.default)}` : ""}${dirsText(v.directives)}`);
  if (d.operation === "query" && !d.name && !vars.length && !d.directives.length) return setText(d.selectionSet);
  return `${d.operation}${d.name ? ` ${d.name}` : ""}${vars.length ? `(${vars.join(", ")})` : ""}${dirsText(d.directives)} ${setText(d.selectionSet)}`;
};
const documentText = (D) => D.map(definitionText).join("\n");

// ---------------------------------------------------------------------------
// Making a spec example a whole document. The spec shows most examples as
// a lone fragment, or uses variables it doesn't define; on their own those
// break §5.5.1.4 or §5.8.3 as well as the rule they illustrate.

const NO_VALUE_DATA = { kind: "none", value: "", items: [], fields: [] };
const isListRef = (t) => t.wrappers[0] === "list";
const nullableRef = (t) => (t.wrappers[0] === "nonNull" ? { ...t, wrappers: t.wrappers.slice(1) } : t);
const ofTypeRef = (t) => ({ ...t, wrappers: t.wrappers.slice(1) });
const fieldOf = (S, typeName, fieldName) =>
  fieldName === "__typename" ? { type: { name: "String", wrappers: ["nonNull"] }, args: {} } : obj(S.types[typeName]?.fields)[fieldName];
const possibleOf = (S, name) => {
  const t = S.types[name];
  return t?.kind === "object" ? [name] : t?.kind === "interface" || t?.kind === "union" ? t.possibleTypes : [];
};

// The variables an operation uses, directly or through fragments, with the
// type of the position each is used in (undefined when unknown).
const usagesOf = (S, D, op) => {
  const out = [];
  const fragments = new Map(D.filter((d) => d.kind === "fragment").map((d) => [d.name, d]));
  const visited = new Set();
  const inValue = (v, type) => {
    if (v.kind === "variable") out.push({ name: v.value, type });
    else if (v.kind === "list") {
      const item = type && isListRef(nullableRef(type)) ? ofTypeRef(nullableRef(type)) : undefined;
      for (const x of v.items) inValue(x, item);
    } else if (v.kind === "object") {
      const t = type && S.types[type.name];
      const defs = t?.kind === "input" ? obj(t.inputFields) : {};
      for (const f of v.fields) inValue(f.value, defs[f.name]?.type);
    }
  };
  const inArgs = (args, defs) => args.forEach((a) => inValue(a.value, obj(defs)[a.name]?.type));
  const inDirs = (dirs) => dirs.forEach((d) => inArgs(d.arguments, obj(S.directives)[d.name]?.args));
  const inSet = (set, parent) =>
    set.forEach((s) => {
      inDirs(s.directives);
      if (s.kind === "field") {
        const f = fieldOf(S, parent, s.name);
        inArgs(s.arguments, f?.args);
        inSet(s.selectionSet, f ? f.type.name : "");
      } else if (s.kind === "inlineFragment") inSet(s.selectionSet, s.typeCondition || parent);
      else if (!visited.has(s.name) && fragments.has(s.name)) {
        visited.add(s.name);
        const fragment = fragments.get(s.name);
        inDirs(fragment.directives);
        inSet(fragment.selectionSet, fragment.typeCondition);
      }
    });
  inDirs(op.directives);
  inSet(op.selectionSet, S.roots[op.operation]);
  return out;
};

// Defines every variable an operation uses but doesn't define, with the
// type of its first usage.
const defineVariables = (S, D) =>
  D.map((d) => {
    if (d.kind !== "operation") return d;
    const defined = new Set(d.variables.map((v) => v.name));
    const added = [];
    for (const u of usagesOf(S, D, d)) {
      if (defined.has(u.name) || !u.type) continue;
      defined.add(u.name);
      added.push({ name: u.name, type: u.type, hasDefault: false, default: NO_VALUE_DATA, directives: [] });
    }
    return added.length ? { ...d, variables: [...d.variables, ...added] } : d;
  });

const spreadNamesIn = (set) => set.flatMap((s) => [...(s.kind === "fragmentSpread" ? [s.name] : []), ...spreadNamesIn(s.selectionSet)]);
const selection = (kind, name, set) => ({
  kind, name, alias: "", arguments: [], directives: [], typeCondition: "", hasSelectionSet: kind === "field", selectionSet: set,
});

// Adds an operation that spreads every fragment nothing spreads: at the
// root for a fragment on a root type, else under the first root field
// (by name, without required arguments) whose type the fragment can apply
// to. Null when there is no such fragment, or no such field.
const useFragments = (S, D) => {
  const spread = new Set(D.flatMap((d) => (d.kind === "typeSystem" ? [] : spreadNamesIn(d.selectionSet))));
  const unused = [...new Set(D.filter((d) => d.kind === "fragment" && !spread.has(d.name)).map((d) => d.name))];
  if (unused.length === 0) return null;
  const queryFields = sorted(Object.entries(obj(S.types[S.roots.query]?.fields))).filter(
    ([, f]) => !Object.values(obj(f.args)).some((a) => a.type.wrappers[0] === "nonNull" && !a.hasDefault),
  );
  const ops = { query: new Map(), subscription: new Map() };
  for (const name of unused) {
    const condition = D.find((d) => d.kind === "fragment" && d.name === name).typeCondition;
    if (condition === S.roots.query || condition === S.roots.subscription) {
      const op = condition === S.roots.query ? "query" : "subscription";
      ops[op].set("", [...(ops[op].get("") ?? []), name]);
      continue;
    }
    const field =
      queryFields.find(([, f]) => f.type.name === condition) ??
      queryFields.find(([, f]) => possibleOf(S, f.type.name).some((t) => possibleOf(S, condition).includes(t)));
    if (!field) return null;
    ops.query.set(field[0], [...(ops.query.get(field[0]) ?? []), name]);
  }
  const kinds = Object.keys(ops).filter((k) => ops[k].size > 0);
  const anonymous = kinds.length === 1 && !D.some((d) => d.kind === "operation");
  const added = kinds.map((operation) => ({
    kind: "operation",
    operation,
    name: anonymous ? "" : `${operation === "query" ? "Query" : "Subscription"}Example`,
    variables: [],
    typeCondition: "",
    directives: [],
    selectionSet: [...ops[operation]].flatMap(([field, names]) => {
      const spreads = names.map((n) => selection("fragmentSpread", n, []));
      return field === "" ? spreads : [selection("field", field, spreads)];
    }),
  }));
  return [...added, ...D];
};

// The ways to present one example, least changed first.
const completions = (S, D) => {
  const withFragments = useFragments(S, D);
  const out = [
    { completed: [], doc: D },
    { completed: ["variables defined"], doc: defineVariables(S, D) },
    ...(withFragments
      ? [
          { completed: ["fragments used"], doc: withFragments },
          { completed: ["fragments used", "variables defined"], doc: defineVariables(S, withFragments) },
        ]
      : []),
  ];
  const seen = new Set();
  return out.filter((c) => {
    const text = documentText(c.doc);
    if (seen.has(text)) return false;
    seen.add(text);
    c.text = text;
    return true;
  });
};

// The name an example goes by: its first named definition's.
const exampleName = (D) => D.find((d) => d.name && d.kind !== "typeSystem")?.name ?? "";

// ---------------------------------------------------------------------------
// Siblings: the nearest valid document

const TOKEN = /"""[\s\S]*?"""|"(?:[^"\\]|\\.)*"|\.\.\.|[$@]?[A-Za-z_][A-Za-z0-9_]*|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[^\s,]/g;
const tokensOf = (text) => text.match(TOKEN) ?? [];

// Token edit distance, or Infinity when it is more than `max`.
const distance = (a, b, max) => {
  if (Math.abs(a.length - b.length) > max) return Infinity;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (row[j] < best) best = row[j];
    }
    if (best > max) return Infinity;
    prev = row;
  }
  return prev[b.length] <= max ? prev[b.length] : Infinity;
};

// What an edit changes, as the tokens it removes and adds.
const editOf = (from, to) => {
  const count = (tokens) => tokens.reduce((m, t) => m.set(t, (m.get(t) ?? 0) + 1), new Map());
  const a = count(from);
  const b = count(to);
  const minus = [...a].flatMap(([t, n]) => Array(Math.max(0, n - (b.get(t) ?? 0))).fill(t));
  const plus = [...b].flatMap(([t, n]) => Array(Math.max(0, n - (a.get(t) ?? 0))).fill(t));
  return `-${minus.join(" ")} +${plus.join(" ")}`;
};

// The document with one part removed: a definition, selection, argument,
// directive, variable definition, object field or list item, a field's
// selection set, an alias, a default value, an inline fragment's type
// condition, or a variable type's outer Non-Null.
const LISTS = new Set(["definitions", "selections", "arguments", "directives", "variableDefinitions", "fields", "values"]);
const removals = (ast) => {
  const edits = [];
  const visit = (node, path) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((n, i) => visit(n, [...path, i]));
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc") continue;
      if (Array.isArray(value) && LISTS.has(key)) {
        for (let i = 0; i < value.length; i++) {
          if ((key === "selections" || key === "definitions") && value.length === 1) continue;
          edits.push([[...path, key], (list) => list.filter((_, j) => j !== i)]);
        }
      }
      if (value && path.length > 0) {
        if (key === "selectionSet" && node.kind === "Field") edits.push([path, (n) => ({ ...n, selectionSet: undefined })]);
        if (key === "alias") edits.push([path, (n) => ({ ...n, alias: undefined })]);
        if (key === "defaultValue") edits.push([path, (n) => ({ ...n, defaultValue: undefined })]);
        if (key === "typeCondition" && node.kind === "InlineFragment") edits.push([path, (n) => ({ ...n, typeCondition: undefined })]);
        if (key === "type" && node.kind === "VariableDefinition" && value.kind === "NonNullType") edits.push([path, (n) => ({ ...n, type: n.type.type })]);
      }
      visit(value, [...path, key]);
    }
  };
  visit(ast, []);
  return edits.map(([path, f]) => {
    const copy = structuredClone(ast);
    let parent = copy;
    for (const k of path.slice(0, -1)) parent = parent[k];
    parent[path.at(-1)] = f(parent[path.at(-1)]);
    return print(copy);
  });
};

// ---------------------------------------------------------------------------

const started = Date.now();
const log = (s) => console.log(s);

// The rules and their sections. Sections are numbered as in
// kit/spec-sections.json, matched by title, since the draft renumbers.
const spec = await extractSpec();
const kitSections = JSON.parse(readFileSync(join(root, "kit/spec-sections.json"), "utf8")).sections.filter((s) => s.number.startsWith("5."));
const letters = (s) => s.replace(/[^A-Za-z]/g, "").toLowerCase();
const RULES = Object.keys(spec.sections).sort((a, b) => {
  const n = (r) => spec.sections[r].split(".").map(Number);
  const [x, y] = [n(a), n(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? -1) !== (y[i] ?? -1)) return (x[i] ?? -1) - (y[i] ?? -1);
  return 0;
});
const SECTION = {};
for (const rule of RULES) {
  const s = kitSections.find((x) => letters(x.title) === letters(rule));
  if (!s) throw new Error(`no section in kit/spec-sections.json titled like ${rule}`);
  SECTION[rule] = s.number;
  if (s.number !== spec.sections[rule]) log(`  note: Validation.tla numbers ${rule} §${spec.sections[rule]}; the draft numbers it §${s.number}`);
}
const ORDER = [...RULES].sort((a, b) => {
  const [x, y] = [SECTION[a], SECTION[b]].map((s) => s.split(".").map(Number));
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? -1) !== (y[i] ?? -1)) return (x[i] ?? -1) - (y[i] ?? -1);
  return 0;
});

// A schema with a custom scalar, for the extra documents below. It uses
// every built-in scalar, since a schema holds only the ones it references.
const SCALARS_SDL = `type Query {
  json(value: Json): String
  dog: Dog
}

scalar Json

type Dog {
  id: ID
  name: String
  age: Int
  weight: Float
  good: Boolean
}

input DogInput {
  name: String
}
`;

// Documents added here, for rules the families exercise little.
// VariablesAreInputTypes needs the custom scalar: a variable of an output
// type is either unused (§5.8.4) or used where an input type is expected
// (§5.8.5), except inside an object literal for a custom scalar, which no
// input type describes.
const EXTRA = {
  differential: [
    `query A { post { id } } query B { post { id } } query B { user { id } }`,
    `query A { user { id } } query A { user { name } }`,
    `{ user { id ...Missing } }`,
    `{ user { id ... on User { ...Missing } } }`,
    `{ node(id: "1") { id ...Missing @skip(if: true) } }`,
    `{ user { id @skip(if: true, unless: false) } }`,
    `{ search(term: "x", bogus: 1) { __typename } }`,
    `{ echo(intt: 1) }`,
    `{ echo(filter: {limit: 1, offset: 2, offset: 3}) }`,
    `{ search(filter: {limit: 1, tags: ["a"], tags: ["b"]}) { __typename } }`,
    `query Q($f: Filter = {limit: 1, limit: 2}) { echo(filter: $f) }`,
    `query Q($f: Filter = {limit: 1}) { echo(filter: $f) }`,
    `query Q($a: Boolean!, $a: Boolean!) { user @skip(if: $a) { id } }`,
    `query Q($a: Int, $b: Int, $a: Int) { echo(int: $a, opt: $b) }`,
    `query Q { echo(int: $v) }`,
    `query Q($w: Int) { echo(int: $v, opt: $w) }`,
    `query Q { user @include(if: $v) { id } }`,
    `query Q { echo(filter: {limit: $v}) }`,
    `query Q { echo(list: [$v]) }`,
    // Introspection: __schema and __type are defined on the query root only
    // (§4.2). The fields selected under them are in both editions.
    `{ __schema { queryType { name } types { name kind } directives { name locations args { name type { kind name ofType { name } } } } } __type(name: "Post") { name fields { name type { kind name } } } }`,
    `{ __schema { queryType { name } types { name kind } directives { name locations args { name type { kind name ofType { name } } } } } __type { name fields { name type { kind name } } } }`,
    `{ __schema { queryType { name } } }`,
    `{ post { __schema { queryType { name } } } }`,
    `{ __type(name: "Post") { name } }`,
    `subscription { __type(name: "Post") { name } }`,
    `subscription { __schema { queryType { name } } }`,
  ],
  scalars: [
    `query Q($v: Dog) { json(value: {a: $v}) }`,
    `query Q($v: DogInput) { json(value: {a: $v}) }`,
    `query Q($v: Int) { json(value: {a: $v}) }`,
    `query Q($v: Dog!) { json(value: {a: {b: $v}}) }`,
    `query Q($v: DogInput!) { json(value: {a: {b: $v}}) }`,
    `query Q($v: [Dog]) { json(value: {a: $v}) }`,
    `query Q($v: [String]) { json(value: {a: $v}) }`,
    `query Q($v: Dog) { ...F } fragment F on Query { json(value: {a: $v}) }`,
    `query Q($v: String) { ...F } fragment F on Query { json(value: {a: $v}) }`,
  ],
};

// The schemas the reference evaluates every document against.
const SCHEMAS = {
  differential: `${SDL.trim()}\n`,
  scalars: SCALARS_SDL,
  examples: schemaSdl(spec.schemas.examples),
  hello: schemaSdl(spec.schemas.hello),
};

// OneOf Input Objects are new in the draft, so an implementation of the
// October 2021 edition can't build a schema that declares one. The
// differential and examples schemas are also written without theirs, and a
// vector is asked against that version unless the reference's verdict
// changes there. The version with the OneOf Input Object (`<name>OneOf`) is
// left to vectors tagged draft.
const replaceOnce = (text, from, to) => {
  if (text.split(from).length !== 2) throw new Error(`expected "${from}" once in the schema`);
  return text.replace(from, to);
};
const withoutOneOfRecord = (S) => {
  const removed = new Set(Object.entries(S.types).filter(([, t]) => t.kind === "input" && t.oneOf).map(([n]) => n));
  const types = {};
  for (const [name, t] of Object.entries(S.types)) {
    if (removed.has(name)) continue;
    if (Object.values(obj(t.inputFields)).some((f) => removed.has(f.type.name))) throw new Error(`${name} has a OneOf input field`);
    // A field loses an optional argument of a removed type, and is
    // removed with a required one.
    const fields = {};
    for (const [f, d] of Object.entries(obj(t.fields))) {
      const args = Object.entries(obj(d.args));
      if (args.some(([, a]) => removed.has(a.type.name) && a.type.wrappers[0] === "nonNull" && !a.hasDefault)) continue;
      fields[f] = { ...d, args: Object.fromEntries(args.filter(([, a]) => !removed.has(a.type.name))) };
    }
    if ((t.kind === "object" || t.kind === "interface") && Object.keys(fields).length === 0) continue;
    types[name] = { ...t, fields };
  }
  const roots = Object.fromEntries(Object.entries(S.roots).map(([r, n]) => [r, n && types[n] ? n : ""]));
  return { ...S, types, roots };
};
const ONE_OF = { differential: "differentialOneOf", examples: "examplesOneOf" };
const WITHOUT_ONE_OF = {
  differential: replaceOnce(replaceOnce(SCHEMAS.differential, ", pick: Pick", ""), "input Pick @oneOf { id: ID name: String }\n", ""),
  examples: schemaSdl(withoutOneOfRecord(spec.schemas.examples)),
};
for (const [name, sdl] of Object.entries(WITHOUT_ONE_OF)) {
  if (/@oneOf/.test(sdl)) throw new Error(`the ${name} schema still has a OneOf Input Object`);
}
// What the vectors file names each schema: the evaluated schema, or for a
// vector asked against the version without OneOf, that version.
const OUTPUT_SCHEMAS = {
  differential: WITHOUT_ONE_OF.differential,
  differentialOneOf: SCHEMAS.differential,
  scalars: SCHEMAS.scalars,
  examples: WITHOUT_ONE_OF.examples,
  examplesOneOf: SCHEMAS.examples,
  hello: SCHEMAS.hello,
};
const buildAll = (sdls) => {
  const out = {};
  for (const [name, sdl] of Object.entries(sdls)) {
    out[name] = buildSchema(sdl);
    const errors = validateSchema(out[name]);
    if (errors.length) throw new Error(`schema ${name} isn't valid: ${errors.map((e) => e.message).join("; ")}`);
  }
  return out;
};
const built = buildAll(SCHEMAS);
const schemaTla = Object.fromEntries(Object.entries(built).map(([name, s]) => [name, schemaToTla(graphql16, s)]));
const builtWithoutOneOf = buildAll(WITHOUT_ONE_OF);
const schemaTlaWithoutOneOf = Object.fromEntries(Object.entries(builtWithoutOneOf).map(([name, s]) => [name, schemaToTla(graphql16, s)]));

// Every candidate document, once per schema.
const docs = [];
const byKey = new Map();
const addDoc = (family, schema, text) => {
  let ast;
  try {
    ast = parse(text, { noLocation: true });
  } catch {
    return undefined;
  }
  const printedText = print(ast);
  const key = `${schema}\u0000${printedText}`;
  if (byKey.has(key)) return byKey.get(key);
  const index = docs.length;
  docs.push({ family, schema, text: printedText, ast, tla: documentToTla(ast), tokens: tokensOf(printedText) });
  byKey.set(key, index);
  return index;
};

const FAMILIES = {
  cycles: cycles(),
  spreads: spreads(),
  merging: merging(),
  variables: variables(),
  values: values(),
  leaves: leaves(),
  operations: operations(),
  directives: directives(),
  names: names(),
  executable: executable(),
  random: randomDocuments(RANDOM_DOCUMENTS, SEED),
};
for (const [family, texts] of Object.entries(FAMILIES)) for (const text of texts) addDoc(family, "differential", text);
for (const [schema, texts] of Object.entries(EXTRA)) for (const text of texts) addDoc("extra", schema, text);

// Each document also without the variable definitions it never uses: the
// merging family declares $x and $y on every document for the few that
// use them, which would make the rest break §5.8.4 as well.
const withoutUnusedVariables = (ast) => {
  const used = new Set();
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node.kind === "VariableDefinition") return walk([node.defaultValue, node.directives]);
    if (node.kind === "Variable") used.add(node.name.value);
    for (const [key, value] of Object.entries(node)) if (key !== "loc") walk(value);
  };
  walk(ast);
  let changed = false;
  const definitions = ast.definitions.map((d) => {
    const kept = (d.variableDefinitions ?? []).filter((v) => used.has(v.variable.name.value));
    if (kept.length === (d.variableDefinitions ?? []).length) return d;
    changed = true;
    return { ...d, variableDefinitions: kept };
  });
  return changed ? print({ ...ast, definitions }) : undefined;
};
for (let i = 0, n = docs.length; i < n; i++) {
  const text = withoutUnusedVariables(docs[i].ast);
  if (text) addDoc(docs[i].family, docs[i].schema, text);
}
const familyCount = docs.length;

// The spec's examples, each in every way it can be presented.
const examples = spec.vectors.map((v) => {
  const schema = v.hello ? "hello" : "examples";
  const S = v.hello ? spec.schemas.hello : spec.schemas.examples;
  return {
    ...v,
    schema,
    name: exampleName(v.doc) || "(anonymous)",
    candidates: completions(S, v.doc).map((c) => ({ ...c, index: addDoc("spec", schema, c.text) })),
  };
});

const evaluateDocs = async (indices) => {
  const groups = Object.keys(SCHEMAS)
    .map((schema) => ({ schema, indices: indices.filter((i) => docs[i].schema === schema) }))
    .filter((g) => g.indices.length);
  const results = await evaluate(groups.map((g) => ({ schemaTla: schemaTla[g.schema], docs: g.indices.map((i) => docs[i].tla) })));
  groups.forEach((g, k) => g.indices.forEach((i, j) => (docs[i].violations = results[k][j])));
};

await evaluateDocs(docs.map((_, i) => i));
const broken = (i) => Object.keys(docs[i].violations).sort();
log(`  ${familyCount} family documents and ${docs.length - familyCount} presentations of ${examples.length} spec examples evaluated`);

// The reference must give each example the spec's verdict, as written.
for (const e of examples) {
  const original = e.candidates.find((c) => c.completed.length === 0);
  if (original?.index === undefined) continue;
  if (broken(original.index).includes(e.rule) === e.valid) {
    throw new Error(`the reference disagrees with the spec on ${e.name} (${e.rule}): is the conversion to GraphQL text wrong?`);
  }
}

// Rules whose every violation another rule also reports. §5.6.1 asks for a
// value coercible to its type, and input coercion (§3.10.1) already rejects
// an unknown or missing input field, so no document breaks §5.6.2 or
// §5.6.4 alone. Their vectors break §5.6.1 too.
const ALSO = { InputObjectFieldNames: ["ValuesOfCorrectType"], InputObjectRequiredFields: ["ValuesOfCorrectType"] };
// Single Root Field forbids an introspection field at a subscription's
// root. __schema and __type are defined only on the query root, and the
// root types must all be different (§3.3.1), so a subscription that selects
// one breaks Field Selections too. Such a document is filed under Single
// Root Field, and counts against both.
const metaFieldAtSubscriptionRoot = (i) => {
  const v = docs[i].violations;
  const b = broken(i);
  if (b.length !== 2 || !v.SingleRootField || !v.FieldSelections) return false;
  const root = built[docs[i].schema].getSubscriptionType()?.name;
  return v.FieldSelections.every((s) => s === `${root}.__schema` || s === `${root}.__type`);
};
const ruleOf = (i) => {
  const b = broken(i);
  if (b.length === 1) return b[0];
  if (metaFieldAtSubscriptionRoot(i)) return "SingleRootField";
  return b.find((r) => ALSO[r] && b.length === 1 + ALSO[r].length && ALSO[r].every((x) => b.includes(x)));
};

// Siblings. A family's documents are products over a few alternatives, so
// most invalid documents have a valid neighbour a few tokens away; the
// rest get one by removing a part, which tla-ts evaluates in a second pass.
const NEAR = 3;
const FAR = 6;
const inFamilies = (i) => docs[i].family !== "spec";
const invalid = docs.map((_, i) => i).filter((i) => inFamilies(i) && ruleOf(i));
const byFamily = (list) => {
  const m = new Map();
  for (const i of list) m.set(`${docs[i].family}\u0000${docs[i].schema}`, [...(m.get(`${docs[i].family}\u0000${docs[i].schema}`) ?? []), i]);
  return m;
};
const familyOf = (i) => `${docs[i].family}\u0000${docs[i].schema}`;
const nearest = (i, pool, max) => {
  let best;
  for (const j of pool) {
    const dist = distance(docs[i].tokens, docs[j].tokens, best ? Math.min(best.dist, max) : max);
    if (dist === Infinity) continue;
    const shorter = best && (docs[j].text.length < docs[best.j].text.length || (docs[j].text.length === docs[best.j].text.length && docs[j].text < docs[best.j].text));
    if (!best || dist < best.dist || (dist === best.dist && shorter)) best = { j, dist };
  }
  return best;
};
const validInFamilies = byFamily(docs.map((_, i) => i).filter((i) => inFamilies(i) && broken(i).length === 0));
const invalidInFamilies = byFamily(invalid);
const siblingOf = new Map();
const needRemovals = [];
for (const i of invalid) {
  const best = nearest(i, validInFamilies.get(familyOf(i)) ?? [], FAR);
  if (best) siblingOf.set(i, best);
  if (!best || best.dist > NEAR) needRemovals.push(i);
}
const fresh = [];
const removalsOf = new Map();
for (const i of needRemovals) {
  const indices = removals(docs[i].ast).map((text) => {
    const before = docs.length;
    const index = addDoc(docs[i].family, docs[i].schema, text);
    if (index !== undefined && index >= before) fresh.push(index);
    return index;
  });
  removalsOf.set(i, indices.filter((x) => x !== undefined && x !== i));
}
await evaluateDocs(fresh);
for (const i of needRemovals) {
  const best = nearest(i, removalsOf.get(i).filter((j) => broken(j).length === 0), Infinity);
  const current = siblingOf.get(i);
  if (best && (!current || best.dist < current.dist)) siblingOf.set(i, best);
}
log(`  ${fresh.length} documents with one part removed evaluated, for ${needRemovals.length} invalid documents without a near neighbour`);

// The rules ALSO names must still be subsumed: fail if the reference
// ever reports one alone.
for (let i = 0; i < docs.length; i++) {
  for (const [r, also] of Object.entries(ALSO)) {
    if (broken(i).includes(r) && !also.every((x) => broken(i).includes(x))) {
      throw new Error(`a document breaks ${r} but not ${also.join(", ")}, so ALSO is wrong: ${docs[i].text}`);
    }
  }
}

// The pairs: each invalid document with its sibling, and each valid
// document of a systematic family with its nearest invalid neighbour, so a
// valid document that sits next to an invalid one is never left out.
const pairs = new Map();
const addPair = (i, j, dist) => {
  const key = `${i} ${j}`;
  if (!pairs.has(key)) pairs.set(key, { i, j, dist, rule: ruleOf(i) });
};
for (const i of invalid) if (siblingOf.has(i)) addPair(i, siblingOf.get(i).j, siblingOf.get(i).dist);
for (const [family, list] of validInFamilies) {
  if (family.startsWith("random\u0000")) continue;
  for (const j of list) {
    const best = nearest(j, invalidInFamilies.get(family) ?? [], NEAR);
    if (best) addPair(best.j, j, best.dist);
  }
}

// ---------------------------------------------------------------------------
// Choosing the vectors: every pair from the systematic families, and up to
// RANDOM_CAP per rule from the random documents, preferring edits not yet
// taken, then shorter documents.

const RANDOM_CAP = 15;
const FAMILY_ORDER = [...Object.keys(FAMILIES), "extra"];
const vectors = [];
const idOf = new Map();
const vectorOf = new Map();
const left = [];
const coverage = {};
const counter = new Map();
const nextId = (prefix) => {
  counter.set(prefix, (counter.get(prefix) ?? 0) + 1);
  return `${prefix}${counter.get(prefix)}`;
};
for (const rule of ORDER) {
  const mine = [...pairs.values()]
    .filter((p) => p.rule === rule)
    .map((p) => ({ ...p, edit: `${editOf(docs[p.i].tokens, docs[p.j].tokens)} ${JSON.stringify(docs[p.i].violations[rule])}` }))
    .sort(
      (a, b) =>
        FAMILY_ORDER.indexOf(docs[a.i].family) - FAMILY_ORDER.indexOf(docs[b.i].family) ||
        a.dist - b.dist ||
        docs[a.i].text.length - docs[b.i].text.length ||
        (docs[a.i].text < docs[b.i].text ? -1 : docs[a.i].text > docs[b.i].text ? 1 : 0) ||
        (docs[a.j].text < docs[b.j].text ? -1 : docs[a.j].text > docs[b.j].text ? 1 : 0),
    );
  const random = mine.filter((p) => docs[p.i].family === "random");
  const seen = new Set();
  const fresh = random.filter((p) => !seen.has(p.edit) && seen.add(p.edit));
  const randomChosen = [...fresh, ...random.filter((p) => !fresh.includes(p))].slice(0, RANDOM_CAP);
  const chosen = mine.filter((p) => docs[p.i].family !== "random" || randomChosen.includes(p));
  const emit = (index, fields) => {
    if (idOf.has(index)) return vectorOf.get(index);
    const vector = {
      id: nextId(fields.expected.valid ? `${rule}-valid-` : `${rule}-`),
      spec: [SECTION[rule]],
      family: docs[index].family,
      rule,
      schema: docs[index].schema,
      document: docs[index].text,
      ...fields,
    };
    idOf.set(index, vector.id);
    vectorOf.set(index, vector);
    vectors.push(vector);
    return vector;
  };
  for (const p of chosen) {
    const x = emit(p.i, { expected: { valid: false }, violations: docs[p.i].violations, siblings: [] });
    const v = emit(p.j, { expected: { valid: true } });
    if (!x.siblings.includes(v.id)) x.siblings.push(v.id);
  }
  // The spec's examples of this rule, each in the least changed way that
  // breaks only this rule, or no rule for a valid one.
  let k = 0;
  for (const e of examples.filter((x) => x.rule === rule)) {
    const fit = e.candidates.find((c) => (c.index === undefined ? false : e.valid ? broken(c.index).length === 0 : ruleOf(c.index) === rule));
    if (!fit) {
      const last = e.candidates.filter((c) => c.index !== undefined).at(-1);
      const others = last ? broken(last.index).filter((r) => r !== rule || e.valid) : [];
      left.push({
        rule,
        example: e.name,
        valid: e.valid,
        reason: !last ? "doesn't parse" : others.length ? `also breaks ${others.join(", ")}` : `doesn't break ${rule}`,
        document: last ? docs[last.index].text : e.candidates.at(-1).text,
      });
      continue;
    }
    const d = docs[fit.index];
    k++;
    vectors.push({
      id: nextId(`${rule}-spec-`),
      spec: [SECTION[rule]],
      family: "spec",
      rule,
      schema: d.schema,
      document: d.text,
      expected: { valid: e.valid },
      ...(e.valid ? {} : { violations: d.violations }),
      example: e.name,
      ...(fit.completed.length ? { completed: fit.completed } : {}),
    });
  }
  coverage[rule] = { pairs: chosen.length, invalid: new Set(chosen.map((p) => p.i)).size, spec: k };
}

// ---------------------------------------------------------------------------
// What each vector's verdict rests on, beyond the rules of the spec.

const {
  TypeInfo, visit, visitWithTypeInfo, getNamedType, getNullableType, isListType, isScalarType, isSpecifiedScalarType,
  isInputObjectType, isInterfaceType, isAbstractType, valueFromAST,
} = graphql16;
const LITERAL_KINDS = new Set(["IntValue", "FloatValue", "StringValue", "BooleanValue", "EnumValue", "ListValue", "ObjectValue"]);

// Whether a document puts a OneOf Input Object anywhere a value goes, and
// whether it gives a literal to a custom scalar. TypeInfo has already
// stepped into a list's item type when it visits the list, so a list's own
// position is its parent's.
const inspect = (vector) => {
  const schema = built[vector.schema];
  const typeInfo = new TypeInfo(schema);
  const found = { oneOf: false, scalarLiteral: false, listForScalar: false };
  visit(
    parse(vector.document, { noLocation: true }),
    visitWithTypeInfo(typeInfo, {
      enter(node) {
        const type = node.kind === "ListValue" ? typeInfo.getParentInputType() : typeInfo.getInputType();
        if (!type) return;
        const named = getNamedType(type);
        if (isInputObjectType(named) && named.isOneOf) found.oneOf = true;
        if (LITERAL_KINDS.has(node.kind) && isScalarType(named) && !isSpecifiedScalarType(named)) {
          found.scalarLiteral = true;
          if (node.kind === "ListValue" && !isListType(getNullableType(type))) found.listForScalar = true;
        }
      },
    }),
  );
  return found;
};

// Whether a subscription's root selections, as CollectSubscriptionFields
// visits them, carry @skip or @include: the draft forbids that (§5.2.4.1),
// the October 2021 edition applies them.
const skipAtSubscriptionRoot = (vector) => {
  const schema = built[vector.schema];
  const root = schema.getSubscriptionType();
  if (!root) return false;
  const ast = parse(vector.document, { noLocation: true });
  const fragments = new Map(ast.definitions.filter((d) => d.kind === "FragmentDefinition").map((d) => [d.name.value, d]));
  const applies = (condition) => {
    if (!condition) return true;
    const t = schema.getType(condition.name.value);
    return t === root || (t !== undefined && isAbstractType(t) && schema.isSubType(t, root));
  };
  const walk = (set, seen) =>
    set.selections.some((s) => {
      if ((s.directives ?? []).some((d) => d.name.value === "skip" || d.name.value === "include")) return true;
      if (s.kind === "InlineFragment") return applies(s.typeCondition) && walk(s.selectionSet, seen);
      if (s.kind !== "FragmentSpread" || seen.has(s.name.value)) return false;
      seen.add(s.name.value);
      const f = fragments.get(s.name.value);
      return f !== undefined && applies(f.typeCondition) && walk(f.selectionSet, seen);
    });
  return ast.definitions.some((d) => d.kind === "OperationDefinition" && d.operation === "subscription" && walk(d.selectionSet, new Set()));
};

// Custom scalars. How a custom scalar coerces a literal is up to the
// service (§3.5.6), so a vector that gives one a literal is graded only for
// adapters whose custom scalars accept every literal. The reference's
// Coercible rejects a list literal for a non-list custom scalar, which no
// such scalar would, so no vector may do that.
const SCALAR_LITERALS = "custom-scalar-literals";
const inspected = new Map(vectors.map((v) => [v, inspect(v)]));
for (const v of vectors) {
  const found = inspected.get(v);
  if (found.listForScalar) throw new Error(`${v.id} gives a list literal to a custom scalar, which the reference rejects: ${v.document}`);
  if (found.scalarLiteral) v.requires = [SCALAR_LITERALS];
}

// Fragment Spread Is Possible where the formal text and the prose disagree.
// The formal text intersects possible types, so an interface nothing
// implements fits nowhere. The prose says an interface fragment "can always
// be spread into an interface scope which it implements", and doesn't say
// whether an interface may be spread into its own scope. A vector whose
// every violation is such a spread isn't graded.
const proseAllows = (schemaName, subject) => {
  const schema = built[schemaName];
  const [parent, fragment] = subject.split(">").map((n) => schema.getType(n));
  if (!isInterfaceType(parent) || !isInterfaceType(fragment)) return false;
  return parent === fragment || fragment.getInterfaces().includes(parent);
};
for (const v of vectors) {
  const subjects = v.violations?.FragmentSpreadIsPossible;
  if (!subjects || Object.keys(v.violations).length !== 1) continue;
  if (subjects.every((s) => proseAllows(v.schema, s))) {
    v.unspecified =
      "the formal text rejects this spread because no object type implements the interface; the prose allows an interface fragment in the scope of an interface it implements, and doesn't settle an interface in its own scope";
  }
}

const unspecify = (v, why) => {
  v.unspecified = v.unspecified ? `${v.unspecified}; ${why}` : why;
};
const astOf = (v) => parse(v.document, { noLocation: true });
// Evaluates `expression` on each vector's document (or docOf's rewrite of
// it), against its schema as tlaOf gives it. A Map from vector to result.
const evaluateVectors = async (list, { docOf = astOf, expression, read, tlaOf = (s) => schemaTla[s] }) => {
  const groups = Object.keys(SCHEMAS)
    .map((schema) => ({ schema, list: list.filter((v) => v.schema === schema) }))
    .filter((g) => g.list.length);
  const results = await evaluate(
    groups.map((g) => ({ schemaTla: tlaOf(g.schema), docs: g.list.map((v) => documentToTla(docOf(v))) })),
    expression,
    read,
  );
  const out = new Map();
  groups.forEach((g, k) => g.list.forEach((v, n) => out.set(v, results[k][n])));
  return out;
};
const asList = (s) => [...s];
// A vector's verdict is unsettled when another reading of the spec would
// change the set of rules it breaks: a valid vector would become invalid,
// an invalid one valid, or an invalid one would break a second rule.

// All Variable Usages Are Allowed where the formal text and the prose
// disagree: the prose says "Variables used for OneOf Input Object fields
// must be non-nullable", and the formal text allows a nullable variable
// with a non-null default value there. Validation.tla's OneOfProseOnly
// gives the usages only the prose rejects.
const oneOfProse = await evaluateVectors(vectors.filter((v) => inspected.get(v).oneOf), {
  expression: "OneOfProseOnly(WithIntrospection(Schema), Docs[i])",
  read: asList,
});
for (const [v, variables] of oneOfProse) {
  if (variables.length > 0 && !v.violations?.AllVariableUsagesAreAllowed) {
    unspecify(
      v,
      "§5.8.5's formal text lets a nullable variable with a non-null default value into a OneOf Input Object field; its prose says such variables must be non-nullable",
    );
  }
}

// Field Selection Merging asks for "identical sets of arguments" (§5.3.2)
// without defining identical. The reference compares literal values. Two
// other readings are evaluated here, by rewriting each field's arguments
// into strings that compare the way the reading does, and evaluating the
// rule again:
//   text     each argument's literal as written (a block string differs
//            from a quoted one; input object fields in another order
//            differ)
//   coerced  the coerced argument values, defaults included (1 and 1.0
//            are the same Float; an omitted argument equals its default)
// Arguments always compare as a set, and a variable is equal only to
// itself. Only documents with two fields of one response name, one of
// them with arguments or argument defaults, can tell the readings apart.
const VARIABLE_VALUES = new Proxy({}, { get: (_, name) => (typeof name === "string" ? { $variable: name } : undefined) });
const stable = (value) =>
  JSON.stringify(value, (_, x) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x);
const stringArgument = (name, text) => ({ kind: "Argument", name: { kind: "Name", value: name }, value: { kind: "StringValue", value: text } });
const argumentsAs = (reading, node, def) => {
  const given = node.arguments ?? [];
  if (reading === "text" || !def) return given.map((a) => stringArgument(a.name.value, `?${print(a.value)}`));
  const out = [];
  for (const d of def.args) {
    const a = given.find((x) => x.name.value === d.name);
    if (a) {
      const value = valueFromAST(a.value, d.type, VARIABLE_VALUES);
      out.push(stringArgument(d.name, value === undefined ? `?${print(a.value)}` : `=${stable(value)}`));
    } else if (d.defaultValue !== undefined) out.push(stringArgument(d.name, `=${stable(d.defaultValue)}`));
  }
  for (const a of given) if (!def.args.some((d) => d.name === a.name.value)) out.push(stringArgument(a.name.value, `?${print(a.value)}`));
  return out;
};
const rewriteArguments = (v, reading) => {
  const info = new TypeInfo(built[v.schema]);
  return visit(
    astOf(v),
    visitWithTypeInfo(info, { Field: { leave: (node) => ({ ...node, arguments: argumentsAs(reading, node, info.getFieldDef()) }) } }),
  );
};
const mayDependOnArgumentIdentity = (v) => {
  const info = new TypeInfo(built[v.schema]);
  const keys = new Map();
  visit(
    astOf(v),
    visitWithTypeInfo(info, {
      Field(node) {
        const key = node.alias?.value ?? node.name.value;
        const withArguments = (node.arguments?.length ?? 0) > 0 || (info.getFieldDef()?.args ?? []).some((a) => a.defaultValue !== undefined);
        const k = keys.get(key) ?? { count: 0, withArguments: false };
        keys.set(key, { count: k.count + 1, withArguments: k.withArguments || withArguments });
      },
    }),
  );
  return [...keys.values()].some((k) => k.count > 1 && k.withArguments);
};
const identityCandidates = vectors.filter(mayDependOnArgumentIdentity);
const READINGS = { text: "their text", coerced: "their coerced values" };
const mergingUnder = {};
for (const reading of Object.keys(READINGS)) {
  mergingUnder[reading] = await evaluateVectors(identityCandidates, {
    docOf: (v) => rewriteArguments(v, reading),
    expression: 'Check("FieldSelectionMerging", Schema, Docs[i])',
    read: asList,
  });
}
for (const v of identityCandidates) {
  const breaks = Boolean(v.violations?.FieldSelectionMerging);
  const others = Object.keys(READINGS).filter((r) => mergingUnder[r].get(v).length > 0 !== breaks);
  if (others.length === 0) continue;
  unspecify(
    v,
    `§5.3.2 doesn't define "identical sets of arguments": compared by literal value, as the reference does, the arguments of two fields here ${breaks ? "differ" : "are identical"}, but compared by ${others.map((r) => READINGS[r]).join(" or by ")} they ${breaks ? "are identical" : "differ"}`,
  );
}

// Vectors that rely on the draft: an invalid vector that breaks Operation
// Type Existence (new in the draft), that breaks Single Root Field with
// @skip or @include at the root, or that breaks a rule only because an
// input object is OneOf, and a valid vector that gives a value to a OneOf
// Input Object. Whether a OneOf input object decides a verdict is the
// reference's answer again, with every input object's oneOf turned off.
const oneOfCandidates = vectors.filter((v) => !v.expected.valid && inspected.get(v).oneOf);
const withoutOneOf = Object.fromEntries(Object.entries(schemaTla).map(([name, tla]) => [name, tla.replaceAll("oneOf |-> TRUE", "oneOf |-> FALSE")]));
const oneOfGroups = Object.keys(SCHEMAS)
  .map((schema) => ({ schema, list: oneOfCandidates.filter((v) => v.schema === schema) }))
  .filter((g) => g.list.length);
const oneOfVerdicts = await evaluate(
  oneOfGroups.map((g) => ({ schemaTla: withoutOneOf[g.schema], docs: g.list.map((v) => documentToTla(parse(v.document, { noLocation: true }))) })),
);
const restsOnOneOf = new Set();
oneOfGroups.forEach((g, k) =>
  g.list.forEach((v, n) => {
    if (Object.keys(v.violations).some((r) => !(r in oneOfVerdicts[k][n]))) restsOnOneOf.add(v);
  }),
);

// Nested lists. The draft coerces a list item that isn't a list, where the
// item type is a list, as a list of one: `[1]` for `[[Int]]` is `[[1]]`.
// October 2021's table says "Error: Incorrect item value" for `[1, 2, 3]`
// (§3.11), so there such a literal breaks §5.6.1. A valid vector with one
// relies on the draft, and so does an invalid one that doesn't already
// break §5.6.1, since it breaks a second rule under October 2021.
const nestedListItem = (v) => {
  const info = new TypeInfo(built[v.schema]);
  let found = false;
  visit(
    astOf(v),
    visitWithTypeInfo(info, {
      ListValue(node) {
        const list = info.getParentInputType() && getNullableType(info.getParentInputType());
        if (!list || !isListType(list) || !isListType(getNullableType(list.ofType))) return;
        if (node.values.some((x) => !["ListValue", "NullValue", "Variable"].includes(x.kind))) found = true;
      },
    }),
  );
  return found;
};

// The vectors whose verdict changes against the schema without its OneOf
// Input Object. They keep the schema that has it, and rely on the draft.
const splitCandidates = vectors.filter((v) => ONE_OF[v.schema]);
const withoutOneOfVerdicts = await evaluateVectors(splitCandidates, { tlaOf: (s) => schemaTlaWithoutOneOf[s] });
const sameViolations = (a, b) => stable(a) === stable(b);
const needsOneOfSchema = new Set(splitCandidates.filter((v) => !sameViolations(withoutOneOfVerdicts.get(v), v.violations ?? {})));

for (const v of vectors) {
  const why = [];
  if (v.violations?.OperationTypeExistence) why.push("Operation Type Existence is new in the draft");
  if (v.violations?.SingleRootField && skipAtSubscriptionRoot(v)) why.push("only the draft forbids @skip and @include at a subscription's root");
  if (restsOnOneOf.has(v)) why.push("OneOf Input Objects are new in the draft");
  if (v.expected.valid && inspected.get(v).oneOf) why.push("it uses a OneOf Input Object, new in the draft");
  if (needsOneOfSchema.has(v) && why.every((w) => !w.includes("OneOf"))) why.push("its schema needs a OneOf Input Object, new in the draft");
  if (nestedListItem(v) && (v.expected.valid || !v.violations.ValuesOfCorrectType)) {
    why.push("only the draft coerces a list item that isn't a list as a list of one where the item type is a list (October 2021 rejects it under §5.6.1)");
  }
  if (why.length) {
    v.edition = "draft";
    v.editionNote = why.join("; ");
  }
}
for (const v of vectors) {
  if (needsOneOfSchema.has(v)) v.schema = ONE_OF[v.schema];
  if (v.schema.endsWith("OneOf") && v.edition !== "draft") throw new Error(`${v.id} uses a schema with a OneOf Input Object but isn't tagged draft`);
}

const output = {
  source: "specs/Validation.tla, evaluated with tla-ts by scripts/generate-vectors-validate.mjs",
  schemas: OUTPUT_SCHEMAS,
  rules: Object.fromEntries(ORDER.map((r) => [r, SECTION[r]])),
  specExamplesLeftOut: left,
  vectors,
};

for (const rule of ORDER) {
  const c = coverage[rule];
  log(`  ${rule} §${SECTION[rule]}: ${c.invalid} invalid documents in ${c.pairs} pairs, ${c.spec} spec examples`);
}
log(`  ${vectors.length} vectors (${vectors.filter((v) => !v.expected.valid).length} invalid, ${vectors.filter((v) => v.expected.valid).length} valid); ${left.length} spec examples left out`);
log(
  `  ${vectors.filter((v) => v.unspecified).length} unspecified, ${vectors.filter((v) => v.requires).length} need ${SCALAR_LITERALS}, ${vectors.filter((v) => v.edition === "draft").length} rely on the draft, ${vectors.filter((v) => Object.keys(v.violations ?? {}).length > 1).length} break two rules, ${vectors.filter((v) => v.schema.endsWith("OneOf")).length} use a schema with a OneOf Input Object`,
);

const text = `${JSON.stringify(output, null, 1)}\n`;
if (CHECK) {
  let current = "";
  try {
    current = readFileSync(OUT, "utf8");
  } catch {}
  if (current !== text) {
    log("✗ kit/validate/vectors.json is out of date: run node scripts/generate-vectors-validate.mjs");
    process.exit(1);
  }
  log(`✓ kit/validate/vectors.json is up to date (${((Date.now() - started) / 1000).toFixed(1)}s)`);
} else {
  mkdirSync(join(root, "kit/validate"), { recursive: true });
  writeFileSync(OUT, text);
  log(`✓ wrote kit/validate/vectors.json (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}
