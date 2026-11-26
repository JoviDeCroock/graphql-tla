// Checks graphql-js's validation rules against the hand-written TLA+
// reference, specs/Validation.tla, rule by rule.
//
// Over one fixed schema (an interface implemented by two object types, an
// interface nobody implements, a union, nested lists, a field with a
// required argument, an input object with required and defaulted fields, a
// OneOf input object and a few scalars), the script builds a few thousand
// small documents:
//
//   families  systematic products over the edge cases each rule is about:
//             fragment cycles, spreads between every pair of scopes and type
//             conditions, overlapping response names with different fields,
//             arguments and types, every variable type against every
//             argument, list and object position, with and without defaults,
//             literals against every argument type, directives in every
//             location, and combinations of operations
//   random    documents from a bounded, typed grammar, biased toward reusing
//             a few response names, fragments and variables
//
// For each document and each rule, graphql-js 16 and 17 run that rule alone
// (validate(schema, document, [rule])), and their errors become a set of
// subjects ("User.name", "$v", "F", ...). tla-ts then checks every case
// against the reference: Invalid is the set of cases where the reference's
// violations differ from graphql-js's. Each disagreement must be explained
// by a documented discrepancy below, and each documented discrepancy must
// still be witnessed by some case.
//
// Negative controls (a case with its violations dropped, or with another
// document's violations) must be rejected, so the check can't pass
// vacuously. With --mutants, realistic bugs are planted in temporary copies
// of Validation.tla and the differential must fail on each.
//
// Usage: node scripts/differential-validation.mjs [--random N] [--seed S] [--mutants] [--verbose]

import { runChecker } from "../kit/checker.mjs";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as graphql16 from "graphql16";
import * as graphql17 from "graphql17";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : Number(process.argv[index + 1]);
};
const RANDOM_DOCUMENTS = arg("--random", 1200);
const SEED = arg("--seed", 1);
const MUTANTS = process.argv.includes("--mutants");
const VERBOSE = process.argv.includes("--verbose");
const VERSIONS = [graphql16, graphql17];

// ---------------------------------------------------------------------------
// The schema

const SDL = `
schema { query: Query subscription: Subscription }

directive @label(name: String) repeatable on QUERY | SUBSCRIPTION | FIELD | FRAGMENT_DEFINITION | FRAGMENT_SPREAD | INLINE_FRAGMENT
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
// The rules: the reference operator, the graphql-js rule, and how a
// graphql-js error message names its subject. A message a rule doesn't match
// (`filter`) belongs to another reference rule; any other unmatched message
// becomes its own subject, so it shows up as a disagreement.

const match = (re, f) => (message) => {
  const m = message.match(re);
  return m ? f(m) : undefined;
};
const first = (...fs) => (message) => fs.map((f) => f(message)).find((s) => s !== undefined);

const RULES = [
  { id: "ExecutableDefinitions", js: "ExecutableDefinitionsRule", subject: () => "document" },
  { id: "OperationTypeExistence", js: "KnownOperationTypesRule", subject: match(/^The (\w+) operation/, (m) => m[1]) },
  { id: "OperationNameUniqueness", js: "UniqueOperationNamesRule", subject: match(/operation named "(\w+)"/, (m) => m[1]) },
  { id: "LoneAnonymousOperation", js: "LoneAnonymousOperationRule", subject: () => "anonymous" },
  {
    id: "SingleRootField",
    js: "SingleFieldSubscriptionsRule",
    subject: first(match(/^Subscription "(\w+)"/, (m) => m[1]), match(/^Anonymous Subscription/, () => "")),
  },
  { id: "FieldSelections", js: "FieldsOnCorrectTypeRule", subject: match(/field "(\w+)" on type "(\w+)"/, (m) => `${m[2]}.${m[1]}`) },
  { id: "FieldSelectionMerging", js: "OverlappingFieldsCanBeMergedRule", subject: () => "conflict" },
  { id: "LeafFieldSelections", js: "ScalarLeafsRule", subject: match(/^Field "(\w+)"/, (m) => m[1]) },
  {
    id: "ArgumentNames",
    js: "KnownArgumentNamesRule",
    subject: match(/Unknown argument "(\w+)" on (?:field|directive) "([^"]+)"/, (m) => `${m[2]}(${m[1]})`),
  },
  { id: "ArgumentUniqueness", js: "UniqueArgumentNamesRule", subject: match(/argument named "(\w+)"/, (m) => m[1]) },
  {
    id: "RequiredArguments",
    js: "ProvidedRequiredArgumentsRule",
    subject: first(
      match(/^Field "(\w+)" argument "(\w+)"/, (m) => `${m[1]}(${m[2]})`),
      match(/^Directive "@(\w+)" argument "(\w+)"/, (m) => `@${m[1]}(${m[2]})`),
      match(/^Argument "(?:\w+\.)?(@?\w+)\((\w+):\)"/, (m) => `${m[1]}(${m[2]})`),
    ),
  },
  { id: "FragmentNameUniqueness", js: "UniqueFragmentNamesRule", subject: match(/fragment named "(\w+)"/, (m) => m[1]) },
  { id: "FragmentSpreadTypeExistence", js: "KnownTypeNamesRule", subject: match(/^Unknown type "(\w+)"/, (m) => m[1]) },
  {
    id: "FragmentsOnObjectInterfaceOrUnionTypes",
    js: "FragmentsOnCompositeTypesRule",
    subject: match(/non composite type "(\w+)"/, (m) => m[1]),
  },
  { id: "FragmentsMustBeUsed", js: "NoUnusedFragmentsRule", subject: match(/^Fragment "(\w+)" is never used/, (m) => m[1]) },
  { id: "FragmentSpreadTargetDefined", js: "KnownFragmentNamesRule", subject: match(/^Unknown fragment "(\w+)"/, (m) => m[1]) },
  { id: "FragmentSpreadsMustNotFormCycles", js: "NoFragmentCyclesRule", subject: () => "cycle" },
  {
    id: "FragmentSpreadIsPossible",
    js: "PossibleFragmentSpreadsRule",
    subject: match(/objects of type "(\w+)" can never be of type "(\w+)"/, (m) => `${m[1]}>${m[2]}`),
  },
  { id: "ValuesOfCorrectType", js: "ValuesOfCorrectTypeRule", subject: () => "value" },
  {
    id: "InputObjectFieldNames",
    js: "ValuesOfCorrectTypeRule",
    filter: true,
    subject: first(
      match(/^Field "(\w+)" is not defined by type "(\w+)"/, (m) => `${m[2]}.${m[1]}`),
      match(/^Expected value of type "(\w+)" not to include unknown field "(\w+)"/, (m) => `${m[1]}.${m[2]}`),
    ),
  },
  { id: "InputObjectFieldUniqueness", js: "UniqueInputFieldNamesRule", subject: match(/input field named "(\w+)"/, (m) => m[1]) },
  {
    id: "InputObjectRequiredFields",
    js: "ValuesOfCorrectTypeRule",
    filter: true,
    subject: first(
      match(/^Field "(\w+)\.(\w+)" of required type/, (m) => `${m[1]}.${m[2]}`),
      match(/^Expected value of type "(\w+)" to include required field "(\w+)"/, (m) => `${m[1]}.${m[2]}`),
    ),
  },
  { id: "DirectivesAreDefined", js: "KnownDirectivesRule", filter: true, subject: match(/^Unknown directive "@(\w+)"/, (m) => m[1]) },
  {
    id: "DirectivesAreInValidLocations",
    js: "KnownDirectivesRule",
    filter: true,
    subject: match(/^Directive "@(\w+)" may not be used on (\w+)/, (m) => `${m[1]}@${m[2]}`),
  },
  {
    id: "DirectivesAreUniquePerLocation",
    js: "UniqueDirectivesPerLocationRule",
    subject: match(/directive "@(\w+)" can only be used once/, (m) => m[1]),
  },
  { id: "VariableUniqueness", js: "UniqueVariableNamesRule", subject: match(/variable named "\$(\w+)"/, (m) => m[1]) },
  { id: "VariablesAreInputTypes", js: "VariablesAreInputTypesRule", subject: match(/^Variable "\$(\w+)" cannot be non-input/, (m) => m[1]) },
  {
    id: "AllVariableUsesDefined",
    js: "NoUndefinedVariablesRule",
    subject: match(/^Variable "\$(\w+)" is not defined(?: by operation "(\w+)")?/, (m) => `${m[2] ?? ""}$${m[1]}`),
  },
  {
    id: "AllVariablesUsed",
    js: "NoUnusedVariablesRule",
    subject: match(/^Variable "\$(\w+)" is never used(?: in operation "(\w+)")?/, (m) => `${m[2] ?? ""}$${m[1]}`),
  },
  { id: "AllVariableUsagesAreAllowed", js: "VariablesInAllowedPositionRule", subject: match(/^Variable "\$(\w+)"/, (m) => m[1]) },
];

// The subjects graphql-js reports for one rule, or ["!throws"] when
// validate() throws.
const jsSubjects = (graphql, rule, document) => {
  const jsRule = graphql[rule.js];
  if (!jsRule) return { subjects: [], missing: true };
  let errors;
  try {
    errors = graphql.validate(schemas.get(graphql.version), document, [jsRule]);
  } catch (error) {
    return { subjects: ["!throws"], thrown: error.message };
  }
  const subjects = new Set();
  for (const { message } of errors) {
    const subject = rule.subject(message);
    if (subject !== undefined) subjects.add(subject);
    else if (!rule.filter) subjects.add(`?${message}`);
  }
  return { subjects: [...subjects].sort() };
};

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
  `query Q($v: Boolean!) @label(name: "x") { user { id } }`,
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
  `{ user { id @label } }`,
  `{ user { id @label(name: null) } }`,
  `{ user { id @label(nom: "x") } }`,
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
const DIRECTIVES = ["@skip(if: true)", "@include(if: false)", '@label(name: "x")', "@once", "@nope", "@deprecated", "@oneOf"];
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
  `{ user @label(name: "a") @label(name: "b") { id } }`,
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
    `{ user @label(name: "a", name: "b") { id } }`,
    `{ user @skip(if: true, if: true) { id } }`,
    `{ user @include(unless: true) { id } }`,
    `{ user @label(name: "a", label: "b") { id } }`,
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
    const d = pick(["skip", "include", "label", "once", "nope"]);
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

// ---------------------------------------------------------------------------
// Documented discrepancies. Each explains a disagreement between the
// reference and one graphql-js version on one rule. A disagreement no entry
// explains fails the check, and so does an entry no case witnesses.

const walk = (node, visit) => {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (typeof node.kind === "string") visit(node);
  for (const [key, value] of Object.entries(node)) if (key !== "loc") walk(value, visit);
};
const some = (doc, predicate) => {
  let found = false;
  walk(doc, (n) => (found ||= predicate(n)));
  return found;
};
const fragmentsOf = (doc) => new Map(doc.definitions.filter((d) => d.kind === "FragmentDefinition").map((d) => [d.name.value, d]));

// The selections CollectSubscriptionFields visits at a subscription's root.
const rootSelections = (doc, op) => {
  const fragments = fragmentsOf(doc);
  const out = [];
  const seen = new Set();
  const visit = (set) => {
    for (const s of set.selections) {
      out.push(s);
      if (s.kind === "InlineFragment") visit(s.selectionSet);
      if (s.kind === "FragmentSpread" && !seen.has(s.name.value) && fragments.has(s.name.value)) {
        seen.add(s.name.value);
        visit(fragments.get(s.name.value).selectionSet);
      }
    }
  };
  visit(op.selectionSet);
  return out;
};
const subscriptions = (doc) => doc.definitions.filter((d) => d.kind === "OperationDefinition" && d.operation === "subscription");
const skipsAtSubscriptionRoot = (doc) =>
  subscriptions(doc).some((op) =>
    rootSelections(doc, op).some((s) => (s.directives ?? []).some((d) => d.name.value === "skip" || d.name.value === "include")));

// The fragments reachable from the document's operations.
const reachableFragments = (doc) => {
  const fragments = fragmentsOf(doc);
  const reached = new Set();
  const queue = [];
  const spreadsIn = (node) => {
    const out = [];
    walk(node, (n) => n.kind === "FragmentSpread" && out.push(n.name.value));
    return out;
  };
  for (const d of doc.definitions) if (d.kind === "OperationDefinition") queue.push(...spreadsIn(d));
  while (queue.length > 0) {
    const name = queue.shift();
    if (reached.has(name) || !fragments.has(name)) continue;
    reached.add(name);
    queue.push(...spreadsIn(fragments.get(name)));
  }
  return reached;
};
const spreadNames = (doc) => {
  const out = new Set();
  walk(doc, (n) => n.kind === "FragmentSpread" && out.add(n.name.value));
  return out;
};

// The response keys CollectSubscriptionFields collects at a subscription's
// root, ignoring @skip and @include.
const subscriptionRootKeys = (doc, op) => {
  const schema = schemas.get("16.15.0");
  const root = schema.getSubscriptionType();
  const applies = (condition) => {
    const type = schema.getType(condition);
    if (!type) return false;
    return graphql16.isObjectType(type) ? type === root : graphql16.isAbstractType(type) && schema.isSubType(type, root);
  };
  const fragments = fragmentsOf(doc);
  const keys = new Set();
  const visited = new Set();
  const visit = (set) => {
    for (const s of set.selections) {
      if (s.kind === "Field") keys.add(s.alias?.value ?? s.name.value);
      else if (s.kind === "InlineFragment") {
        if (!s.typeCondition || applies(s.typeCondition.name.value)) visit(s.selectionSet);
      } else if (!visited.has(s.name.value)) {
        visited.add(s.name.value);
        const f = fragments.get(s.name.value);
        if (f && applies(f.typeCondition.name.value)) visit(f.selectionSet);
      }
    }
  };
  visit(op.selectionSet);
  return keys;
};

// Response keys selected both as __typename and as another field, in the
// same selection set or through fragments and inline fragments.
const typenameCollides = (doc) => {
  const fragments = fragmentsOf(doc);
  const fieldsIn = (set, seen = new Set()) =>
    set.selections.flatMap((s) =>
      s.kind === "Field" ? [s]
        : s.kind === "InlineFragment" ? fieldsIn(s.selectionSet, seen)
        : fragments.has(s.name.value) && !seen.has(s.name.value) ? fieldsIn(fragments.get(s.name.value).selectionSet, new Set([...seen, s.name.value]))
        : []);
  let found = false;
  walk(doc, (n) => {
    if (!n.selectionSet) return;
    const byKey = new Map();
    for (const f of fieldsIn(n.selectionSet)) {
      const key = f.alias?.value ?? f.name.value;
      byKey.set(key, [...(byKey.get(key) ?? []), f.name.value]);
    }
    for (const names of byKey.values()) if (names.includes("__typename") && names.some((x) => x !== "__typename")) found = true;
  });
  return found;
};

const DISCREPANCIES = [
  {
    id: "no-operation-type-existence",
    versions: ["16.15.0"],
    rule: "OperationTypeExistence",
    text: "graphql-js 16 has no rule for §5.2.1.1 Operation Type Existence (17 adds KnownOperationTypesRule), so an operation whose root type doesn't exist passes validation.",
    applies: (c) => c.missing.length === 0 && c.extra.every((s) => s === "mutation"),
  },
  {
    id: "subscription-skip-throws",
    versions: ["16.15.0"],
    rule: "SingleRootField",
    text: "graphql-js 16's SingleFieldSubscriptionsRule runs CollectFields with no variable values, so `@skip(if: $v)` or `@include(if: $v)` with a Non-Null variable at a subscription's root makes validate() throw.",
    applies: (c) => c.js.includes("!throws") && skipsAtSubscriptionRoot(c.doc),
  },
  {
    id: "subscription-skip-allowed",
    versions: ["16.15.0"],
    rule: "SingleRootField",
    text: "graphql-js 16 allows `@skip` and `@include` at a subscription's root, which §5.2.4.1 forbids (17 rejects them); with a literal `if` it counts the fields left after skipping.",
    applies: (c) => c.missing.length === 0 && skipsAtSubscriptionRoot(c.doc) && !c.js.includes("!throws"),
  },
  {
    id: "subscription-no-fields",
    versions: ["16.15.0"],
    rule: "SingleRootField",
    text: "graphql-js 16 only rejects more than one root field, so a subscription whose root collects no field passes, though §5.2.4.1 requires exactly one entry (17 rejects it).",
    applies: (c) =>
      c.missing.length === 0 &&
      c.extra.every((name) => subscriptions(c.doc).some((op) => (op.name?.value ?? "") === name && subscriptionRootKeys(c.doc, op).size === 0)),
  },
  {
    id: "unused-fragment-reachability",
    rule: "FragmentsMustBeUsed",
    text: "§5.5.1.4 only requires a fragment to be \"the target of at least one spread in the document\"; graphql-js reports every fragment no operation reaches, including one spread only by an unused fragment or by itself.",
    applies: (c) =>
      c.extra.length === 0 && c.missing.every((f) => spreadNames(c.doc).has(f) && !reachableFragments(c.doc).has(f)),
  },
  {
    id: "oneof-variable-default",
    rule: "AllVariableUsagesAreAllowed",
    text: "IsVariableUsageAllowed lets a nullable variable with a non-null default fill a OneOf field (IsNonNullPosition is true, then hasNonNullVariableDefaultValue); graphql-js requires a Non-Null variable type whatever the default.",
    applies: (c) => c.extra.length === 0 && c.missing.every((v) => oneOfDefaultedVariables(c.doc).has(v)),
  },
  {
    id: "required-argument-null",
    rule: "RequiredArguments",
    text: "§5.4.3 also forbids the null literal for a required argument; graphql-js reports that under ValuesOfCorrectTypeRule instead of ProvidedRequiredArgumentsRule. The document is invalid either way.",
    applies: (c) =>
      c.missing.length === 0 &&
      c.extra.every((s) => {
        const name = s.match(/\((\w+)\)$/)[1];
        return some(c.doc, (n) => n.kind === "Argument" && n.name.value === name && n.value.kind === "NullValue");
      }),
  },
  {
    id: "required-field-null",
    rule: "InputObjectRequiredFields",
    text: "§5.6.4 also forbids the null literal for a required input field; graphql-js reports it as a type mismatch, not a missing field. The document is invalid either way.",
    applies: (c) =>
      c.missing.length === 0 &&
      c.extra.every((s) => {
        const name = s.split(".")[1];
        return some(c.doc, (n) => n.kind === "ObjectField" && n.name.value === name && n.value.kind === "NullValue");
      }),
  },
  {
    id: "implementerless-interface-scope",
    rule: "FragmentSpreadIsPossible",
    text: "No object type implements Resource, so GetPossibleTypes(Resource) is empty and the formal rule rejects every spread in a Resource scope, even `... on Resource` or `... { }` inside Resource; graphql-js accepts a type spread into itself. (Both reject `...on Resource` in Node, which the spec's own example calls valid.)",
    applies: (c) => c.missing.length === 0 && c.extra.every((s) => s === "Resource>Resource"),
  },
  {
    id: "block-string-arguments",
    rule: "FieldSelectionMerging",
    text: "graphql-js compares arguments by their printed syntax, so `\"x\"` and `\"\"\"x\"\"\"` are different arguments, though they are the same value (it does treat `\"\\u0078\"` as `\"x\"`, and sorts object fields).",
    applies: (c) => c.extra.length === 0 && some(c.doc, (n) => n.kind === "StringValue" && n.block),
  },
  {
    id: "typename-response-shape",
    rule: "FieldSelectionMerging",
    text: "graphql-js only finds field definitions through getFields(), which has no __typename, so it never compares __typename's type (String!) in SameResponseShape: `a: __typename` merges with `a: score` (Int) on another object type.",
    applies: (c) => c.missing.length === 0 && typenameCollides(c.doc),
  },
];

const oneOfDefaultedVariables = (doc) => {
  const out = new Set();
  for (const d of doc.definitions) {
    for (const v of d.variableDefinitions ?? []) {
      if (v.type.kind === "NonNullType" || !v.defaultValue || v.defaultValue.kind === "NullValue") continue;
      if (some(d, (n) => n.kind === "ObjectField" && n.value.kind === "Variable" && n.value.name.value === v.variable.name.value && oneOfField(doc, n))) {
        out.add(v.variable.name.value);
      }
    }
  }
  return out;
};

const oneOfField = (doc, objectField) => {
  // Every Pick literal in the generated documents is a `pick:` argument.
  let found = false;
  walk(doc, (n) => {
    if (n.kind === "Argument" && n.name.value === "pick" && n.value.kind === "ObjectValue" && n.value.fields.includes(objectField)) found = true;
  });
  return found;
};

const explain = (c) =>
  DISCREPANCIES.find((d) => d.rule === c.rule && (!d.versions || d.versions.includes(c.version)) && d.applies(c));

// ---------------------------------------------------------------------------
// Running tla-ts

const run = (args, cwd) => runChecker(args, { cwd });

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

// One shard: its documents, its cases and its controls. Prints, for each
// case and control the reference disagrees with, the reference's violations.
const shardModule = (name, schemaTla, docs, cases, controls) => `---- MODULE ${name} ----
EXTENDS Validation

Schema == ${schemaTla}

Docs == ${seq(docs.map((d) => d.tla))}

\\* [doc, rule, js16, js17]: the violations graphql-js 16 and 17 reported.
Cases == ${seq(cases.map((c) => `[doc |-> ${c.doc}, rule |-> ${str(c.rule)}, js16 |-> ${setOf(c.js16)}, js17 |-> ${setOf(c.js17)}]`))}

\\* [doc, rule, expected]: violations that are wrong for the document.
Controls == ${seq(controls.map((c) => `[doc |-> ${c.doc}, rule |-> ${str(c.rule)}, expected |-> ${setOf(c.expected)}]`))}

Ref(c) == Check(c.rule, Schema, Docs[c.doc])

Invalid == {i \\in DOMAIN Cases : Ref(Cases[i]) # Cases[i].js16 \\/ Ref(Cases[i]) # Cases[i].js17}
Accepted == {i \\in DOMAIN Controls : Ref(Controls[i]) = Controls[i].expected}

ASSUME \\A i \\in Invalid : PrintT(<<"ref", i, Ref(Cases[i])>>)
ASSUME PrintT(<<"accepted controls", Accepted>>)
ASSUME PrintT(<<"done", Len(Cases)>>)
====
`;

const runShards = async (validationSource, schemaTla, docs, cases, controls, shards) => {
  const dir = mkdtempSync(join(tmpdir(), "validation-"));
  try {
    writeFileSync(join(dir, "Validation.tla"), validationSource);
    // Shard by document, so each module holds only its documents.
    const byDoc = new Map();
    cases.forEach((c, i) => byDoc.set(c.doc, [...(byDoc.get(c.doc) ?? []), i]));
    const controlsByDoc = new Map();
    controls.forEach((c, i) => controlsByDoc.set(c.doc, [...(controlsByDoc.get(c.doc) ?? []), i]));
    const docIds = [...byDoc.keys()];
    const chunks = Array.from({ length: shards }, (_, k) => docIds.filter((_, i) => i % shards === k)).filter((c) => c.length);
    const results = await pool(chunks, shards, async (chunk, k) => {
      const local = new Map(chunk.map((d, i) => [d, i + 1]));
      const caseIndices = chunk.flatMap((d) => byDoc.get(d));
      const controlIndices = chunk.flatMap((d) => controlsByDoc.get(d) ?? []);
      const name = `Shard${k}`;
      writeFileSync(
        join(dir, `${name}.tla`),
        shardModule(
          name,
          schemaTla,
          chunk.map((d) => docs[d]),
          caseIndices.map((i) => ({ ...cases[i], doc: local.get(cases[i].doc) })),
          controlIndices.map((i) => ({ ...controls[i], doc: local.get(controls[i].doc) })),
        ),
      );
      writeFileSync(join(dir, `${name}.cfg`), "INIT Init\nNEXT Next\n");
      const { output } = await run(["-workers", "1", "-config", `${name}.cfg`, `${name}.tla`], dir);
      const done = /<<\s*"done",\s*(\d+)\s*>>/.test(output);
      const refs = new Map();
      for (const m of output.matchAll(/<<\s*"ref",\s*(\d+),\s*\{([^}]*)\}\s*>>/g)) {
        refs.set(caseIndices[Number(m[1]) - 1], [...m[2].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((s) => JSON.parse(`"${s[1]}"`)).sort());
      }
      const accepted = (output.match(/<<\s*"accepted controls",\s*\{([^}]*)\}\s*>>/)?.[1] ?? "")
        .split(",").map((s) => Number(s.trim())).filter(Boolean).map((i) => controlIndices[i - 1]);
      const error = done ? undefined : output.split("\n").filter((l) => /Error|error/.test(l)).slice(0, 8).join("\n") || output.slice(-2000);
      return { refs, accepted, error };
    });
    const refs = new Map();
    const accepted = [];
    const errors = [];
    for (const r of results) {
      for (const [k, v] of r.refs) refs.set(k, v);
      accepted.push(...r.accepted);
      if (r.error) errors.push(r.error);
    }
    return { refs, accepted, errors };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// Compares one run's disagreements with the documented discrepancies.
const analyse = (docs, cases, refs, rules) => {
  const unexplained = [];
  const witnessed = new Map();
  for (const [i, ref] of refs) {
    const c = cases[i];
    for (const graphql of VERSIONS) {
      const js = graphql.version === "16.15.0" ? c.js16 : c.js17;
      if (JSON.stringify(js) === JSON.stringify(ref)) continue;
      const d = {
        rule: c.rule,
        version: graphql.version,
        js,
        ref,
        extra: ref.filter((s) => !js.includes(s)),
        missing: js.filter((s) => !ref.includes(s)),
        doc: docs[c.doc].ast,
        text: docs[c.doc].text,
      };
      const discrepancy = explain(d);
      if (discrepancy) {
        const list = witnessed.get(discrepancy.id) ?? [];
        list.push(d);
        witnessed.set(discrepancy.id, list);
      } else unexplained.push(d);
    }
  }
  const missing = DISCREPANCIES.filter((d) => rules.has(d.rule) && !witnessed.has(d.id));
  return { unexplained, witnessed, missing };
};

// ---------------------------------------------------------------------------
// Mutants: realistic bugs in the reference, each of which the differential
// must catch. specs/validation.mutants.mjs holds the bugs the spec's examples
// also catch (npm run check:specs checks those); these need the schema
// here. `rules` limits each run to the cases of the rules it touches.

const { default: SHARED_MUTANTS } = await import(new URL("../specs/validation.mutants.mjs", import.meta.url));
const MUTANTS_LIST = [
  ...SHARED_MUTANTS,
  {
    name: "enums are not leaf types",
    find: 'IsLeaf(S, name) == Kind(S, name) \\in {"scalar", "enum"}',
    replace: 'IsLeaf(S, name) == Kind(S, name) \\in {"scalar"}',
    rules: ["LeafFieldSelections"],
  },
  {
    name: "a list entry's expected type is the list type",
    find: "LET item == IF type # NoType /\\ IsList(Nullable(type)) THEN OfType(Nullable(type)) ELSE NoType",
    replace: "LET item == type",
    rules: ["AllVariableUsagesAreAllowed"],
  },
  {
    name: "a subscription's directives are checked as a query's",
    find: 'subscription |-> "SUBSCRIPTION"]',
    replace: 'subscription |-> "QUERY"]',
    rules: ["DirectivesAreInValidLocations"],
  },
  {
    name: "an input field with a default is required",
    find: "/\\ IsNonNull(defs[g].type)\n                     /\\ ~defs[g].hasDefault",
    replace: "/\\ IsNonNull(defs[g].type)",
    rules: ["InputObjectRequiredFields"],
  },
  {
    name: "repeatable directives must be unique too",
    find: "/\\ ~S.directives[l.directives[j].name].repeatable",
    replace: "/\\ TRUE",
    rules: ["DirectivesAreUniquePerLocation"],
  },
];

// ---------------------------------------------------------------------------

const started = Date.now();
const families = {
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

const docs = [];
const seen = new Set();
const familyCounts = {};
let unparsable = 0;
for (const [family, texts] of Object.entries(families)) {
  let count = 0;
  for (const text of texts) {
    let parsed;
    try {
      parsed = Object.fromEntries(VERSIONS.map((g) => [g.version, g.parse(text, { noLocation: true })]));
    } catch {
      unparsable++;
      continue;
    }
    const key = graphql16.print(parsed["16.15.0"]);
    if (seen.has(key)) continue;
    seen.add(key);
    docs.push({ family, text: key, ast: parsed["16.15.0"], parsed, tla: documentToTla(parsed["16.15.0"]) });
    count++;
  }
  familyCounts[family] = count;
}

const cases = [];
for (const [d, doc] of docs.entries()) {
  for (const rule of RULES) {
    const r16 = jsSubjects(graphql16, rule, doc.parsed["16.15.0"]);
    const r17 = jsSubjects(graphql17, rule, doc.parsed["17.1.0"]);
    cases.push({ doc: d + 1, rule: rule.id, js16: r16.subjects, js17: r17.subjects });
  }
}
const docsByIndex = [undefined, ...docs];

// Negative controls: for each rule, a case whose violations are dropped, and
// a case given the violations graphql-js reported for another document.
const controls = [];
for (const rule of RULES) {
  const forRule = cases.filter((c) => c.rule === rule.id && JSON.stringify(c.js16) === JSON.stringify(c.js17));
  const flagged = forRule.filter((c) => c.js16.length > 0 && !c.js16.some((s) => s.startsWith("!") || s.startsWith("?")));
  const clean = forRule.filter((c) => c.js16.length === 0);
  if (flagged.length > 0) {
    const a = flagged[Math.floor(flagged.length / 3)];
    controls.push({ name: `${rule.id}: drops every violation`, doc: a.doc, rule: rule.id, expected: [] });
    const other = flagged.find((c) => JSON.stringify(c.js16) !== JSON.stringify(a.js16));
    if (other) controls.push({ name: `${rule.id}: another document's violations`, doc: a.doc, rule: rule.id, expected: other.js16 });
    if (clean.length > 0) {
      controls.push({ name: `${rule.id}: violations on a valid document`, doc: clean[Math.floor(clean.length / 2)].doc, rule: rule.id, expected: a.js16 });
    }
  }
}

const shards = Math.max(1, Math.min(8, availableParallelism() - 1));
const validationSource = readFileSync(join(root, "specs/Validation.tla"), "utf8");
const schemaTla = schemaToTla(graphql16, schemas.get("16.15.0"));
const allRules = new Set(RULES.map((r) => r.id));

console.log(`  ${docs.length} documents (${Object.entries(familyCounts).map(([f, n]) => `${f} ${n}`).join(", ")}), ${unparsable} unparsable skipped`);
console.log(`  ${cases.length} cases (${RULES.length} rules × ${docs.length} documents) on graphql-js ${VERSIONS.map((g) => g.version).join(" and ")}, ${controls.length} negative controls`);

// How often each rule fires, so a rule that never fires stands out.
const firing = RULES.map((r) => {
  const n = cases.filter((c) => c.rule === r.id && (c.js16.length > 0 || c.js17.length > 0)).length;
  return `${r.id} ${n}`;
});
console.log(`  documents graphql-js rejects, per rule: ${firing.join(", ")}`);

const baseline = await runShards(validationSource, schemaTla, docsByIndex, cases, controls, shards);
let failed = false;
if (baseline.errors.length > 0) {
  console.log(`✗ tla-ts failed:\n${baseline.errors.join("\n")}`);
  process.exit(1);
}

const { unexplained, witnessed, missing } = analyse(docsByIndex, cases, baseline.refs, allRules);
const disagreements = [...witnessed.values()].reduce((n, l) => n + l.length, 0) + unexplained.length;
const smallest = (list) => list.reduce((a, b) => (b.text.length < a.text.length ? b : a));

for (const d of DISCREPANCIES.filter((d) => witnessed.has(d.id))) {
  const list = witnessed.get(d.id);
  const example = smallest(list);
  const versions = [...new Set(list.map((c) => c.version))].join(", ");
  console.log(`! ${d.rule} on graphql-js ${versions} (${list.length} cases): ${d.text}`);
  console.log(`    e.g. ${example.text.replace(/\s+/g, " ")}`);
  console.log(`    reference ${JSON.stringify(example.ref)}, graphql-js ${example.version} ${JSON.stringify(example.js)}`);
}
const byRule = new Map();
for (const u of unexplained) byRule.set(`${u.rule} ${u.version}`, [...(byRule.get(`${u.rule} ${u.version}`) ?? []), u]);
for (const [key, list] of byRule) {
  const shown = VERBOSE ? list : [smallest(list)];
  console.log(`✗ ${key}: ${list.length} unexplained disagreements`);
  for (const u of shown) {
    console.log(`    ${u.text.replace(/\s+/g, " ")}`);
    console.log(`    reference ${JSON.stringify(u.ref)}, graphql-js ${JSON.stringify(u.js)}`);
  }
  failed = true;
}
for (const d of missing) {
  console.log(`✗ documented discrepancy no longer witnessed: ${d.id}`);
  failed = true;
}
// A control built on a case the reference disagrees with proves nothing.
const caseIndex = new Map(cases.map((c, i) => [`${c.doc} ${c.rule}`, i]));
const realControls = controls.filter((c) => !baseline.refs.has(caseIndex.get(`${c.doc} ${c.rule}`)));
const acceptedControls = baseline.accepted.filter((i) => realControls.includes(controls[i]));
for (const i of acceptedControls) {
  console.log(`✗ the reference accepts a negative control: ${controls[i].name}`);
  failed = true;
}
if (!failed) {
  console.log(`✓ every case agrees with the reference, or is one of ${witnessed.size} documented discrepancies (${disagreements} disagreements)`);
  console.log(`✓ every negative control is rejected (${realControls.length} controls over ${new Set(realControls.map((c) => c.rule)).size} rules)`);
}

if (MUTANTS && !failed) {
  console.log("\nMutants");
  const results = await pool(MUTANTS_LIST, Math.max(1, Math.floor(shards / 2)), async (mutant) => {
    if (!validationSource.includes(mutant.find)) return { ok: false, detail: `can't find: ${mutant.find}` };
    const source = validationSource.replace(mutant.find, mutant.replace);
    const rules = new Set(mutant.rules);
    const mutantCases = cases.filter((c) => rules.has(c.rule));
    const result = await runShards(source, schemaTla, docsByIndex, mutantCases, [], 2);
    if (result.errors.length > 0) return { ok: false, detail: `tla-ts failed: ${result.errors[0].split("\n")[0]}` };
    const outcome = analyse(docsByIndex, mutantCases, result.refs, rules);
    const caught = outcome.unexplained.length + outcome.missing.length;
    return {
      ok: caught > 0,
      detail: caught > 0
        ? `${outcome.unexplained.length} unexplained disagreements, ${outcome.missing.length} discrepancies no longer witnessed`
        : "the differential still passes",
    };
  });
  MUTANTS_LIST.forEach((mutant, i) => {
    const { ok, detail } = results[i];
    console.log(`${ok ? "✓" : "✗"} ${mutant.name} (${mutant.rules.join(", ")}): ${detail}`);
    if (!ok) failed = true;
  });
}

console.log(`  ${((Date.now() - started) / 1000).toFixed(1)}s`);
process.exit(failed ? 1 : 0);
