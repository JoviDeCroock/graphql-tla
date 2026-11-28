// Checks graphql-js's lexer and parser against the hand-written references
// in specs/Lexer.tla and specs/Parser.tla.
//
// Lexer: short strings over an alphabet chosen to hit the lexical grammar's
// edge cases, exhaustively up to a small length (bare, inside "…" and inside
// """…"""), plus seeded random longer strings. Each one is lexed by
// graphql-js 16 and 17 (new Lexer(new Source(s)), advancing to <EOF> or
// catching the GraphQLError), and tla-ts checks that Lex gives the same
// token kinds and values, or also fails.
//
// Parser: short token sequences exhaustively, plus seeded random documents
// from a generator over the executable grammar and one-token mutations of
// them. Each is parsed by graphql-js 16 and 17 (parse, compared by shape
// without locations), and tla-ts checks ParseExecutable gives the same tree,
// or also fails. Documents graphql-js parses into type system definitions
// are skipped there: they are not an ExecutableDocument.
//
// Type system: Parser.tla's type system vectors, the kit's parse vectors
// that name a grammar, short token sequences, and seeded random type system
// documents and one-token mutations of them, each read as one or two of the
// grammars typeSystem, typeSystemExtension and document. graphql-js parses
// the source, and a definition of a kind the grammar doesn't allow makes it
// fail, as in the graphql-js adapter; tla-ts checks ParseDocument gives the
// same tree, or also fails.
//
// Printing: short texts printed by graphql-js 16 and 17 (print of a
// StringValue, as "..." and as a block string) and by three other printers
// (JSON.stringify, and ASCII-only ones with a \u{...} or a surrogate-pair
// escape for a supplementary character). Each printed string is judged here,
// from §2.10.4's "When producing a StringValue" text, and tla-ts checks that
// IsWellPrintedString in Lexer.tla judges it the same way.
//
// Fragment arguments (graphql-spec#1081, a proposal and not part of
// September 2026): Parser.tla's vectors for it, short token sequences after a
// spread's and a fragment's name, and seeded random documents and one-token
// mutations of them from the same generator with the proposal's syntax
// switched on. Each is parsed by graphql-js 17 with
// experimentalFragmentArguments (graphql-js 16 has no such parser), and
// tla-ts checks ParseExecutableWith(source, {FragmentArguments}) gives the
// same tree, or also fails. The parser cases above read the same vectors
// without the proposal, where both graphql-js versions must reject the new
// syntax, as ParseExecutable does.
//
// Error positions are not compared, only success versus failure. They
// legitimately differ: the reference counts code points from 1, graphql-js
// counts UTF-16 code units from 0, and they may report different points of
// the same failure.
//
// Known discrepancies between graphql-js and the spec are listed in KNOWN.
// Each gives graphql-js's answer to an equivalent input that avoids the
// discrepancy, and the case only counts as explained when the reference
// agrees with that answer. Anything else fails the check.
//
// Negative controls (wrong token kinds, values, trees, or success flipped)
// must each be rejected, so the check can't pass vacuously.
//
// Usage: node scripts/differential-lexer.mjs [--random N] [--seed S] [--mutants]
//   DEBUG=1    prints tla-ts output when a chunk fails to check
//   --mutants  plants each bug from specs/lexer.mutants.mjs and
//              specs/parser.mutants.mjs in a temporary copy of the specs and
//              checks that the differential catches it.

import { runChecker } from "../kit/checker.mjs";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as graphql16 from "graphql16";
import * as graphql17 from "graphql17";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : Number(process.argv[index + 1]);
};
const RANDOM = arg("--random", 3000);
const SEED = arg("--seed", 1);
const MUTANTS = process.argv.includes("--mutants");
const CHUNK = 2500;

const VERSIONS = [graphql16, graphql17];

const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// The draws a generator makes, from one random stream.
const dice = (random) => {
  const int = (n) => Math.floor(random() * n);
  return { int, pick: (items) => items[int(items.length)], chance: (p) => random() < p };
};
const rnd = mulberry32(SEED);
const { int, pick, chance } = dice(rnd);
const range = (n) => Array.from({ length: n }, (_, i) => i);

// Every sequence of up to maxLength atoms.
const words = (atoms, maxLength) => {
  const out = [""];
  let frontier = [""];
  for (let n = 1; n <= maxLength; n++) {
    frontier = frontier.flatMap((w) => atoms.map((a) => w + a));
    out.push(...frontier);
  }
  return out;
};

// ---------------------------------------------------------------------------
// Lexer inputs

const LONE_LEADING = "\uD800";
const LONE_TRAILING = "\uDC00";
const ASTRAL = "\u{1F600}";

// Outside strings: numbers and their lookahead, punctuators, ignored tokens.
const BARE = [
  "0", "1", ".", "e", "E", "-", "+", "x", "a", "_", "\"", "\\", "u", "{", "}",
  "(", "$", "#", "\n", "\r", " ", "\t", ",", "\uFEFF", ASTRAL, LONE_LEADING,
  "\u00e9", "...", "\"\"\"",
];
// Inside "…": every kind of escape, valid and not, and the characters a
// string must not contain.
const IN_STRING = [
  "a", " ", "\"", "\\", "\n", "\r", ASTRAL, LONE_TRAILING, "\\u0041", "\\u{1F600}",
  "\\u{110000}", "\\uD83D", "\\uDE00", "\\u{D800}", "\\u{}", "\\u{000000041}", "\\x",
  "\\/", "\\b", "u{", "}", "\\u00", "\\\"",
];
// Inside """…""": indentation, line terminators and the `\"""` escape.
const IN_BLOCK = [" ", "\t", "\n", "\r", "\r\n", "a", "\"", "\\\"\"\"", "\\", "\"\""];

// Pieces for random strings: all of the above but the 9-digit escape (whose
// known discrepancy is only explained inside "…"), plus longer snippets.
const SNIPPETS = [
  "1.5e+3", "-0", "00", "1.", "1e", "0x", "6.02E23", "\"\"\"\n  a\n\"\"\"", "\"\\uD83D\\uDE00\"",
  "query", "on", "__x", "\"\"", "...", "@", "!", "[", "]", ":", "=", "&", "|", "\r\n  ",
];
const RANDOM_ATOMS = [...new Set([...BARE, ...IN_STRING, ...IN_BLOCK, ...SNIPPETS])].filter(
  (a) => a !== "\\u{000000041}",
);

// The sources of the hand-written vectors in a module, so graphql-js checks
// them too: the TLA+ string literals that match pattern.
const vectorSources = (pattern, module) =>
  [...readFileSync(join(root, "specs", module), "utf8").matchAll(pattern)].map((m) =>
    m[1].replace(/\\(.)/g, (_, c) => ({ n: "\n", t: "\t", r: "\r", f: "\f" })[c] ?? c),
  );

const lexerInputs = () => {
  const inputs = new Set([
    ...vectorSources(/V\(Text\("((?:[^"\\]|\\.)*)"\),/g, "Lexer.tla"),
    ...words(BARE, 3),
    ...words(IN_STRING, 3).map((w) => `"${w}"`),
    ...words(IN_BLOCK, 4).map((w) => `"""${w}"""`),
  ]);
  for (let i = 0; i < RANDOM; i++) {
    const pieces = range(4 + int(16)).map(() => pick(RANDOM_ATOMS)).join("");
    const kind = int(3);
    inputs.add(kind === 0 ? pieces : kind === 1 ? `"${pieces}"` : `"""${pieces}"""`);
  }
  return [...inputs];
};

// ---------------------------------------------------------------------------
// Parser inputs

const NAMES = ["a", "b", "on", "query", "fragment", "true", "null", "Foo", "_x", "mutation", "false", "x1"];
const NOT_ON = NAMES.filter((n) => n !== "on");
const STRINGS = ['"s"', '""', '"\\u00e9\\n"', '"""\n  block\n"""', '""""""'];

// A random token sequence over the executable grammar, mostly valid. With
// `proposal`, a fragment may define variables and a spread may have
// arguments (graphql-spec#1081); without it, the draws are the same as they
// were before the proposal was added.
const documentFrom = ({ int, pick, chance }, proposal) => {
  const name = () => pick(NAMES);
  const value = (depth, isConst) => {
    const kinds = ["int", "float", "string", "bool", "null", "enum"];
    if (depth < 2) kinds.push("list", "object");
    if (!isConst) kinds.push("var");
    switch (pick(kinds)) {
      case "int": return [pick(["0", "-1", "42"])];
      case "float": return [pick(["1.5", "-0.0", "1e3", "6.02E+23"])];
      case "string": return [pick(STRINGS)];
      case "bool": return [pick(["true", "false"])];
      case "null": return ["null"];
      case "enum": return [pick(["RED", "on", "query", "Null"])];
      case "var": return ["$", name()];
      case "list": return ["[", ...range(int(3)).flatMap(() => value(depth + 1, isConst)), "]"];
      default: return ["{", ...range(int(3)).flatMap(() => [name(), ":", ...value(depth + 1, isConst)]), "}"];
    }
  };
  const args = (isConst) =>
    chance(0.3) ? ["(", ...range(1 + int(2)).flatMap(() => [name(), ":", ...value(0, isConst)]), ")"] : [];
  const directives = (isConst) => range(chance(0.3) ? 1 + int(2) : 0).flatMap(() => ["@", name(), ...args(isConst)]);
  const type = (depth) => {
    const base = depth < 2 && chance(0.3) ? ["[", ...type(depth + 1), "]"] : [pick(["Int", "T", "on"])];
    return chance(0.4) ? [...base, "!"] : base;
  };
  const description = () => (chance(0.2) ? [pick(STRINGS)] : []);
  const selectionSet = (depth) => [
    "{",
    ...range(chance(0.08) ? 0 : 1 + int(depth > 1 ? 1 : 3)).flatMap(() => selection(depth)),
    "}",
  ];
  const selection = (depth) => {
    const k = int(10);
    if (k < 6) {
      return [
        ...(chance(0.2) ? [name(), ":"] : []),
        name(),
        ...args(false),
        ...directives(false),
        ...(depth < 3 && chance(0.4) ? selectionSet(depth + 1) : []),
      ];
    }
    if (k < 8) return ["...", pick(NOT_ON), ...(proposal ? args(false) : []), ...directives(false)];
    return ["...", ...(chance(0.6) ? ["on", pick(["T", "on"])] : []), ...directives(false), ...selectionSet(depth + 1)];
  };
  const variables = () =>
    chance(0.4)
      ? [
          "(",
          ...range(1 + int(2)).flatMap(() => [
            ...description(), "$", name(), ":", ...type(0),
            ...(chance(0.3) ? ["=", ...value(0, true)] : []),
            ...directives(true),
          ]),
          ")",
        ]
      : [];
  const definition = () => {
    const k = int(10);
    if (k < 3) return selectionSet(0);
    if (k < 7) {
      return [
        ...description(), pick(["query", "mutation", "subscription"]), ...(chance(0.6) ? [name()] : []),
        ...variables(), ...directives(false), ...selectionSet(0),
      ];
    }
    return [
      ...description(), "fragment", chance(0.05) ? "on" : pick(NOT_ON), ...(proposal ? variables() : []),
      "on", pick(["T", "on"]), ...directives(false), ...selectionSet(0),
    ];
  };
  return range(1 + int(2)).flatMap(() => definition());
};
const document = () => documentFrom({ int, pick, chance }, false);

const TOKEN_POOL = ["{", "}", "(", ")", "[", "]", ":", "$", "@", "!", "=", "...", "a", "on", "query", "fragment", "1", '"s"', "null"];
const SEPARATORS = [" ", " ", " ", ",", "\n", "\t", " #c\n", "\r\n", "\uFEFF"];
const spacedFrom = ({ pick }) => (tokens) => tokens.map((t, i) => (i === 0 ? t : pick(SEPARATORS) + t)).join("");
const spaced = spacedFrom({ pick });

const mutateFrom = ({ int, pick }) => (tokens) => {
  const out = [...tokens];
  const i = int(out.length);
  switch (int(5)) {
    case 0: out.splice(i, 1); break;
    case 1: out.splice(i, 0, out[i]); break;
    case 2: if (i + 1 < out.length) [out[i], out[i + 1]] = [out[i + 1], out[i]]; break;
    case 3: out.splice(i, 0, pick(TOKEN_POOL)); break;
    default: out[i] = pick(TOKEN_POOL);
  }
  return out;
};
const mutate = mutateFrom({ int, pick });

// The sources of Parser.tla's fragment argument vectors that are read as an
// ExecutableDocument.
const proposalVectors = () =>
  vectorSources(/(?:Proposed|NotProposed)\("executable",\s*"((?:[^"\\]|\\.)*)"/g, "Parser.tla");

const parserInputs = () => {
  const inputs = new Set([
    ...words(["{", "}", "a", "on", "...", "(", ")", ":", "$", "@", "query", "fragment", '"d"'].map((t) => `${t} `), 4),
    ...words(["[", "]", "{", "}", "k", ":", "$", "1", "null", "true", '"s"'].map((t) => `${t} `), 3).map((w) => `{a(x: ${w})}`),
    ...words(["$", "a", ":", "Int", "[", "]", "!", "=", "1", "@", "d", '"d"'].map((t) => `${t} `), 3).map((w) => `query (${w}) {a}`),
    ...words(["(", ")", "x", ":", "1", "@", "d", "{", "}", "...", "on", "$"].map((t) => `${t} `), 3).map((w) => `{a ${w}}`),
    ...words(["on", "F", "T", "@", "d", "(", ")", "$", "{", "}"].map((t) => `${t} `), 3).map((w) => `fragment ${w}{a}`),
    ...vectorSources(/(?:Parses|Rejects)\("((?:[^"\\]|\\.)*)"/g, "Parser.tla"),
    ...proposalVectors(),
  ]);
  inputs.add("query ($a: [Int!]! = [1], $b: String @d(x: 2)) @e { a: b(x: [1, 2.5, \"s\", E, null, {k: $v}]) ...F ... on T {c} }");
  for (let i = 0; i < RANDOM; i++) {
    const tokens = document();
    inputs.add(spaced(tokens));
    inputs.add(spaced(mutate(tokens)));
  }
  return [...inputs];
};

// Fragment arguments (graphql-spec#1081), read with the proposal. These have
// their own random stream, so the inputs above are what they were without
// them.
const proposalDice = dice(mulberry32(SEED + 2000));

const proposalInputs = () => {
  const inputs = new Set([
    ...proposalVectors(),
    // September 2026's own vectors: the proposal only adds syntax.
    ...vectorSources(/(?:Parses|Rejects)\("((?:[^"\\]|\\.)*)"/g, "Parser.tla"),
    // After a spread's name, and after a fragment's name.
    ...words(["(", ")", "x", ":", "1", "$", "@", "d", "{", "}", "on"].map((t) => `${t} `), 4).map((w) => `{...F ${w}}`),
    ...words(["(", ")", "$", "x", ":", "Int", "!", "=", "1", "@", "on", "T"].map((t) => `${t} `), 4).map((w) => `fragment F ${w}{a}`),
    ...words(["on", "F", "T", "@", "d", "(", ")", "$", "{", "}"].map((t) => `${t} `), 3).map((w) => `fragment ${w}{a}`),
  ]);
  inputs.add("fragment F($a: [Int!]! = [1], \"d\" $b: String = \"s\" @d(x: 2)) on T @e { a(x: $a) ...G(a: [1, 2.5, \"s\", E, null, {k: $b}], b: $a) @d ... on T {c} }");
  const spacedHere = spacedFrom(proposalDice);
  const mutateHere = mutateFrom(proposalDice);
  for (let i = 0; i < RANDOM; i++) {
    const tokens = documentFrom(proposalDice, true);
    inputs.add(spacedHere(tokens));
    inputs.add(spacedHere(mutateHere(tokens)));
  }
  return [...inputs];
};

// ---------------------------------------------------------------------------
// Type system inputs, read as each of ParseDocument's grammars but the
// executable one, which the parser inputs above cover. Their own random
// stream, so the inputs above don't depend on these.

const sdlRnd = mulberry32(SEED + 1000);
const sdlInt = (n) => Math.floor(sdlRnd() * n);
const sdlPick = (items) => items[sdlInt(items.length)];
const sdlChance = (p) => sdlRnd() < p;

const SDL_NAMES = ["T", "a", "type", "on", "query", "extend", "implements", "repeatable", "schema", "input", "Int"];
const LOCATIONS = ["FIELD", "QUERY", "OBJECT", "FIELD_DEFINITION", "ENUM_VALUE", "SCHEMA", "INPUT_OBJECT", "DIRECTIVE_DEFINITION"];
const SDL_POOL = [
  "{", "}", "(", ")", ":", "@", "=", "|", "&", "!", "[", "]", "$", "type", "extend", "implements", "on", "repeatable",
  "FIELD", "T", '"s"', "1", "true", "null", "schema", "query", "directive", "scalar", "enum", "input", "union", "interface",
];
const SDL_GRAMMARS = ["typeSystem", "typeSystemExtension", "document"];

// A random token sequence over the type system grammar, mostly valid.
const sdlDocument = () => {
  const [int, pick, chance] = [sdlInt, sdlPick, sdlChance];
  const name = () => pick(SDL_NAMES);
  const optional = (p, make) => (chance(p) ? make() : []);
  const value = (depth) => {
    const kinds = ["int", "string", "bool", "null", "enum"];
    if (depth < 2) kinds.push("list", "object");
    switch (pick(kinds)) {
      case "int": return [pick(["0", "-1", "1.5"])];
      case "string": return [pick(STRINGS)];
      case "bool": return [pick(["true", "false"])];
      case "null": return ["null"];
      case "enum": return [pick(["RED", "on", "type"])];
      case "list": return ["[", ...range(int(3)).flatMap(() => value(depth + 1)), "]"];
      default: return ["{", ...range(int(3)).flatMap(() => [name(), ":", ...value(depth + 1)]), "}"];
    }
  };
  const args = () => optional(0.3, () => ["(", ...range(1 + int(2)).flatMap(() => [name(), ":", ...value(0)]), ")"]);
  const directive = () => ["@", name(), ...args()];
  const directives = () => range(chance(0.3) ? 1 + int(2) : 0).flatMap(directive);
  const someDirectives = () => range(1 + int(2)).flatMap(directive);
  const type = (depth) => {
    const base = depth < 2 && chance(0.3) ? ["[", ...type(depth + 1), "]"] : [pick(["Int", "T", "on"])];
    return chance(0.4) ? [...base, "!"] : base;
  };
  const description = () => optional(0.25, () => [pick(STRINGS)]);
  const inputValue = () => [...description(), name(), ":", ...type(0), ...optional(0.3, () => ["=", ...value(0)]), ...directives()];
  const argumentsDefinition = () => optional(0.3, () => ["(", ...range(1 + int(2)).flatMap(inputValue), ")"]);
  const fields = () => ["{", ...range(1 + int(2)).flatMap(() => [...description(), name(), ...argumentsDefinition(), ":", ...type(0), ...directives()]), "}"];
  const implementsInterfaces = () => ["implements", ...(chance(0.3) ? ["&"] : []), name(), ...range(int(2)).flatMap(() => ["&", name()])];
  const roots = () => ["{", ...range(1 + int(2)).flatMap(() => [pick(["query", "mutation", "subscription"]), ":", name()]), "}"];
  const members = () => ["=", ...(chance(0.3) ? ["|"] : []), name(), ...range(int(3)).flatMap(() => ["|", name()])];
  const enumValues = () => ["{", ...range(1 + int(2)).flatMap(() => [...description(), pick(["A", "on", "type", "TRUE"]), ...directives()]), "}"];
  const inputFields = () => ["{", ...range(1 + int(2)).flatMap(inputValue), "}"];
  const locations = () => [...(chance(0.3) ? ["|"] : []), pick(LOCATIONS), ...range(int(3)).flatMap(() => ["|", pick(LOCATIONS)])];
  const definition = () => {
    switch (int(8)) {
      case 0: return [...description(), "schema", ...directives(), ...roots()];
      case 1: return [...description(), "scalar", name(), ...directives()];
      case 2: return [...description(), "type", name(), ...optional(0.4, implementsInterfaces), ...directives(), ...optional(0.7, fields)];
      case 3: return [...description(), "interface", name(), ...optional(0.3, implementsInterfaces), ...directives(), ...optional(0.7, fields)];
      case 4: return [...description(), "union", name(), ...directives(), ...optional(0.8, members)];
      case 5: return [...description(), "enum", name(), ...directives(), ...optional(0.8, enumValues)];
      case 6: return [...description(), "input", name(), ...directives(), ...optional(0.8, inputFields)];
      default:
        return [...description(), "directive", "@", name(), ...argumentsDefinition(), ...optional(0.2, someDirectives), ...(chance(0.3) ? ["repeatable"] : []), "on", ...locations()];
    }
  };
  const extension = () => {
    const k = int(8);
    if (k === 0) return chance(0.5) ? ["extend", "schema", ...directives(), ...roots()] : ["extend", "schema", ...someDirectives()];
    if (k === 1) return ["extend", "scalar", name(), ...someDirectives()];
    if (k === 2 || k === 3) {
      const adds = [chance(0.4), chance(0.4), chance(0.5)];
      if (!adds.some(Boolean)) adds[int(3)] = true;
      return ["extend", k === 2 ? "type" : "interface", name(), ...(adds[0] ? implementsInterfaces() : []), ...(adds[1] ? someDirectives() : []), ...(adds[2] ? fields() : [])];
    }
    if (k === 7) return ["extend", "directive", "@", name(), ...someDirectives()];
    const [keyword, body] = [["union", members], ["enum", enumValues], ["input", inputFields]][k - 4];
    return chance(0.6) ? ["extend", keyword, name(), ...directives(), ...body()] : ["extend", keyword, name(), ...someDirectives()];
  };
  const executable = () => (chance(0.5) ? ["query", "{", name(), "}"] : ["fragment", "F", "on", "T", "{", name(), "}"]);
  return range(1 + int(3)).flatMap(() => (chance(0.15) ? executable() : chance(0.3) ? extension() : definition()));
};

const sdlSpaced = (tokens) => tokens.map((t, i) => (i === 0 ? t : sdlPick(SEPARATORS) + t)).join("");
const sdlMutate = (tokens) => {
  const out = [...tokens];
  const i = sdlInt(out.length);
  switch (sdlInt(5)) {
    case 0: out.splice(i, 1); break;
    case 1: out.splice(i, 0, out[i]); break;
    case 2: if (i + 1 < out.length) [out[i], out[i + 1]] = [out[i + 1], out[i]]; break;
    case 3: out.splice(i, 0, sdlPick(SDL_POOL)); break;
    default: out[i] = sdlPick(SDL_POOL);
  }
  return out;
};

// [source, grammar] pairs: the hand-written vectors of Parser.tla with
// their grammars, the kit's vectors that name one, short token sequences,
// and random documents and one-token mutations of them, each read as two
// of the grammars.
const sdlInputs = () => {
  const inputs = new Map();
  const add = (source, grammar) => inputs.set(`${grammar}\u0000${source}`, [source, grammar]);
  for (const m of readFileSync(join(root, "specs/Parser.tla"), "utf8").matchAll(/(?:Accepts|Refuses)\("(\w+)", "((?:[^"\\]|\\.)*)"/g)) {
    const source = m[2].replace(/\\(.)/g, (_, c) => ({ n: "\n", t: "\t", r: "\r", f: "\f" })[c] ?? c);
    add(source, m[1]);
    add(source, "document");
  }
  for (const v of JSON.parse(readFileSync(join(root, "kit/parse/vectors.json"), "utf8")).vectors) {
    if (v.grammar && !v.probe) add(v.source, v.grammar);
  }
  for (const w of words(["extend", "type", "T", "{", "}", "a", ":", "@", "d", "implements", "&"].map((t) => `${t} `), 3)) add(w, "typeSystemExtension");
  for (const w of words(["directive", "@", "d", "on", "FIELD", "|", "repeatable", "(", ")", "extend"].map((t) => `${t} `), 3)) add(w, "document");
  for (const w of words(["union", "U", "=", "|", "A", "enum", "E", "{", "}", "true"].map((t) => `${t} `), 3)) add(w, "typeSystem");
  for (let i = 0; i < RANDOM / 2; i++) {
    const tokens = sdlDocument();
    for (const source of [sdlSpaced(tokens), sdlSpaced(sdlMutate(tokens))]) {
      const [g1, g2] = [sdlPick(SDL_GRAMMARS), sdlPick(SDL_GRAMMARS)];
      add(source, g1);
      add(source, g2);
    }
  }
  return [...inputs.values()];
};

// ---------------------------------------------------------------------------
// Printing inputs: string values printed by graphql-js and by other
// plausible printers, each judged independently of Lexer.tla against §2.10.4
// "When producing a StringValue" (see IsWellPrintedString there).

const PRINT_ATOMS = ["a", " ", '"', "\\", "\n", "\t", "\r", "\u0000", "\u001F", "\u007F", "\u0085", "\u009F", " ", "é", " ", "￿", "\u{1F600}", "\u{10FFFF}", "\uD800"];

// The printers: graphql-js's print as a "..." string and as a block string,
// JSON.stringify, and two ASCII-only printers that escape every other code
// point, one with a variable-width escape for a supplementary character and
// one with a surrogate pair.
const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, "0");
const asciiOnly = (pairs) => (text) =>
  `"${Array.from(text, (c) => {
    const cp = c.codePointAt(0);
    if (c === '"' || c === "\\") return `\\${c}`;
    if (cp >= 0x20 && cp < 0x7f) return c;
    if (cp <= 0xffff) return `\\u${hex4(cp)}`;
    return pairs ? `\\u${hex4(c.charCodeAt(0))}\\u${hex4(c.charCodeAt(1))}` : `\\u{${cp.toString(16).toUpperCase()}}`;
  }).join("")}"`;
const PRINTERS = [
  ...VERSIONS.flatMap((graphql) => [
    [`graphql-js ${graphql.version} print`, (text) => graphql.print({ kind: "StringValue", value: text })],
    [`graphql-js ${graphql.version} print block`, (text) => graphql.print({ kind: "StringValue", value: text, block: true })],
  ]),
  ["JSON.stringify", (text) => JSON.stringify(text)],
  ["ASCII with \\u{…}", asciiOnly(false)],
  ["ASCII with surrogate pairs", asciiOnly(true)],
];

// The judgement, written from the spec's text: printed lexes (by
// graphql-js 17) as one string token, nothing else, whose value is text;
// no code point in it is a non-printable control character (U+0000 to
// U+001F and U+007F to U+009F), except that a block string may hold tabs
// and line breaks (Lexer.tla's BlockStringLayout: the weaker reading, as a
// block string can't escape them); and, outside a block string, no escape
// is a fixed-width one of a surrogate pair.
const isControl = (cp) => cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f);
const hasPairEscape = (printed) => {
  for (let i = 1; i < printed.length; i++) {
    if (printed[i] !== "\\") continue;
    if (printed[i + 1] === "u" && /^[dD][89abAB][0-9a-fA-F]{2}\\u[dD][c-fC-F][0-9a-fA-F]{2}/.test(printed.slice(i + 2, i + 12))) return true;
    i++;
  }
  return false;
};
const judgePrinted = (text, printed) => {
  let token;
  try {
    const lexer = new graphql17.Lexer(new graphql17.Source(printed));
    token = lexer.advance();
    if (lexer.advance().kind !== graphql17.TokenKind.EOF) return false;
  } catch (error) {
    if (error instanceof graphql17.GraphQLError) return false;
    throw error;
  }
  const block = token.kind === graphql17.TokenKind.BLOCK_STRING;
  if (!(block || token.kind === graphql17.TokenKind.STRING) || token.start !== 0 || token.end !== printed.length || token.value !== text) return false;
  const layout = (cp) => block && (cp === 0x09 || cp === 0x0a || cp === 0x0d);
  if (Array.from(printed).some((c) => isControl(c.codePointAt(0)) && !layout(c.codePointAt(0)))) return false;
  return block || !hasPairEscape(printed);
};

const printInputs = () => {
  const texts = new Set(words(PRINT_ATOMS, 2));
  for (let i = 0; i < RANDOM / 10; i++) texts.add(range(1 + sdlInt(6)).map(() => sdlPick(PRINT_ATOMS)).join(""));
  const cases = new Map();
  for (const text of texts) {
    for (const [printer, print] of PRINTERS) {
      const printed = print(text);
      const key = `${text}\u0000${printed}`;
      if (cases.has(key)) cases.get(key).versions.push(printer);
      else cases.set(key, { kind: "print", source: printed, text, well: judgePrinted(text, printed), versions: [printer] });
    }
  }
  return [...cases.values()];
};

// ---------------------------------------------------------------------------
// graphql-js

const PUNCTUATORS = new Set(["!", "$", "&", "(", ")", "...", ":", "=", "@", "[", "]", "{", "|", "}"]);
const KINDS = { Name: "Name", Int: "IntValue", Float: "FloatValue", String: "StringValue", BlockString: "BlockString" };

const lexWith = (graphql, source) => {
  try {
    const lexer = new graphql.Lexer(new graphql.Source(source));
    const tokens = [];
    for (;;) {
      const token = lexer.advance();
      if (token.kind === graphql.TokenKind.EOF) break;
      if (tokens.length > source.length) throw new Error(`runaway lexer on ${JSON.stringify(source)}`);
      tokens.push(
        PUNCTUATORS.has(token.kind)
          ? { kind: "Punctuator", value: token.kind }
          : { kind: KINDS[token.kind] ?? `graphql-js ${token.kind}`, value: token.value },
      );
    }
    return { ok: true, tokens };
  } catch (error) {
    if (error instanceof graphql.GraphQLError) return { ok: false, tokens: [], message: error.message };
    throw error;
  }
};

// The parse tree in Parser.tla's shape: [kind, text, children], NoNode for
// an absent optional part. Returns undefined for a type system definition.
const node = (kind, text = "", children = []) => ({ kind, text, children });
const NONE = node("None");
const description = (d) => (d ? node(d.block ? "BlockString" : "StringValue", d.value) : NONE);
const value = (v) => {
  switch (v.kind) {
    case "Variable": return node("Variable", v.name.value);
    case "IntValue": return node("IntValue", v.value);
    case "FloatValue": return node("FloatValue", v.value);
    case "StringValue": return description(v);
    case "BooleanValue": return node("BooleanValue", String(v.value));
    case "NullValue": return node("NullValue");
    case "EnumValue": return node("EnumValue", v.value);
    case "ListValue": return node("ListValue", "", v.values.map(value));
    case "ObjectValue": return node("ObjectValue", "", v.fields.map((f) => node("ObjectField", f.name.value, [value(f.value)])));
    default: throw new Error(`unexpected value ${v.kind}`);
  }
};
const args = (list) => node("Arguments", "", (list ?? []).map((a) => node("Argument", a.name.value, [value(a.value)])));
const directives = (list) => node("Directives", "", (list ?? []).map((d) => node("Directive", d.name.value, [args(d.arguments)])));
const type = (t) =>
  t.kind === "NamedType" ? node("NamedType", t.name.value) : node(t.kind, "", [type(t.type)]);
const selectionSet = (s) => node("SelectionSet", "", s.selections.map(selection));
const selection = (s) => {
  if (s.kind === "Field") {
    return node("Field", s.name.value, [
      s.alias ? node("Name", s.alias.value) : NONE,
      args(s.arguments),
      directives(s.directives),
      s.selectionSet ? selectionSet(s.selectionSet) : NONE,
    ]);
  }
  // A spread's arguments and a fragment's variables are graphql-spec#1081.
  // Without the proposal both are empty, as in Parser.tla.
  if (s.kind === "FragmentSpread") return node("FragmentSpread", s.name.value, [args(s.arguments), directives(s.directives)]);
  return node("InlineFragment", "", [
    s.typeCondition ? node("NamedType", s.typeCondition.name.value) : NONE,
    directives(s.directives),
    selectionSet(s.selectionSet),
  ]);
};
const variablesDefinition = (list) =>
  node("VariablesDefinition", "", (list ?? []).map((v) =>
    node("VariableDefinition", "", [
      description(v.description),
      node("Variable", v.variable.name.value),
      type(v.type),
      v.defaultValue ? value(v.defaultValue) : NONE,
      directives(v.directives),
    ]),
  ));
const definition = (d) => {
  if (d.kind === "OperationDefinition") {
    return node("OperationDefinition", d.operation, [
      description(d.description),
      d.name ? node("Name", d.name.value) : NONE,
      variablesDefinition(d.variableDefinitions),
      directives(d.directives),
      selectionSet(d.selectionSet),
    ]);
  }
  if (d.kind === "FragmentDefinition") {
    return node("FragmentDefinition", d.name.value, [
      description(d.description),
      variablesDefinition(d.variableDefinitions),
      node("NamedType", d.typeCondition.name.value),
      directives(d.directives),
      selectionSet(d.selectionSet),
    ]);
  }
  return undefined;
};

// Type system definitions and extensions, in Parser.tla's shapes (see its
// §3 section). graphql-js 17 leaves out a list that is absent.
const items = (kind, list, f) => node(kind, "", (list ?? []).map(f));
const named = (t) => node("NamedType", t.name.value);
const inputValues = (kind, list) =>
  items(kind, list, (v) =>
    node("InputValueDefinition", v.name.value, [description(v.description), type(v.type), v.defaultValue ? value(v.defaultValue) : NONE, directives(v.directives)]),
  );
const fieldsDefinition = (list) =>
  items("FieldsDefinition", list, (f) =>
    node("FieldDefinition", f.name.value, [description(f.description), inputValues("ArgumentsDefinition", f.arguments), type(f.type), directives(f.directives)]),
  );
const typeSystemDefinition = (d) => {
  const kind = d.kind;
  const desc = description(d.description);
  switch (kind) {
    case "SchemaDefinition":
    case "SchemaExtension":
      return node(kind, "", [desc, directives(d.directives), items("RootOperationTypes", d.operationTypes, (o) => node("RootOperationTypeDefinition", o.operation, [named(o.type)]))]);
    case "ScalarTypeDefinition":
    case "ScalarTypeExtension":
      return node(kind, d.name.value, [desc, directives(d.directives)]);
    case "ObjectTypeDefinition":
    case "ObjectTypeExtension":
    case "InterfaceTypeDefinition":
    case "InterfaceTypeExtension":
      return node(kind, d.name.value, [desc, items("ImplementsInterfaces", d.interfaces, named), directives(d.directives), fieldsDefinition(d.fields)]);
    case "UnionTypeDefinition":
    case "UnionTypeExtension":
      return node(kind, d.name.value, [desc, directives(d.directives), items("UnionMemberTypes", d.types, named)]);
    case "EnumTypeDefinition":
    case "EnumTypeExtension":
      return node(kind, d.name.value, [
        desc,
        directives(d.directives),
        items("EnumValuesDefinition", d.values, (v) => node("EnumValueDefinition", v.name.value, [description(v.description), directives(v.directives)])),
      ]);
    case "InputObjectTypeDefinition":
    case "InputObjectTypeExtension":
      return node(kind, d.name.value, [desc, directives(d.directives), inputValues("InputFieldsDefinition", d.fields)]);
    case "DirectiveDefinition":
      return node(kind, d.name.value, [
        desc,
        inputValues("ArgumentsDefinition", d.arguments),
        directives(d.directives),
        node("Repeatable", d.repeatable ? "repeatable" : ""),
        items("DirectiveLocations", d.locations, (l) => node("Name", l.value)),
      ]);
    case "DirectiveExtension":
      return node(kind, d.name.value, [NONE, directives(d.directives)]);
    default:
      throw new Error(`unexpected definition ${kind}`);
  }
};

// The definitions each grammar allows, as the graphql-js adapter decides
// (adapters/graphql-js/areas/parse.mjs).
const ALLOWED = {
  executable: (graphql, d) => graphql.isExecutableDefinitionNode(d),
  typeSystem: (graphql, d) => graphql.isTypeSystemDefinitionNode(d),
  typeSystemExtension: (graphql, d) => graphql.isTypeSystemDefinitionNode(d) || graphql.isTypeSystemExtensionNode(d),
  document: () => true,
};

// graphql-js's parse, read as one of ParseDocument's grammars: the tree if
// every definition is of a kind the grammar allows, and a failure otherwise.
const documentWith = (graphql, source, grammar, options = {}) => {
  let parsed;
  try {
    parsed = graphql.parse(source, { noLocation: true, ...options });
  } catch (error) {
    if (error instanceof graphql.GraphQLError) return { ok: false, tree: NONE, message: error.message };
    throw error;
  }
  if (!parsed.definitions.every((d) => ALLOWED[grammar](graphql, d))) return { ok: false, tree: NONE, message: `not a ${grammar} document`, parsed };
  const definitions = parsed.definitions.map((d) => (graphql.isExecutableDefinitionNode(d) ? definition(d) : typeSystemDefinition(d)));
  return { ok: true, tree: node("Document", "", definitions), parsed };
};

// As an ExecutableDocument. A source graphql-js parses into type system
// definitions is not one, and is skipped here: the type system inputs
// below read it as the other grammars.
const parseWith = (graphql, source, options) => {
  const result = documentWith(graphql, source, "executable", options);
  return result.parsed && !result.ok ? { skip: true } : result;
};

// As an ExecutableDocument with fragment arguments (graphql-spec#1081), which
// only graphql-js 17 reads, behind a flag.
const PROPOSAL_VERSIONS = [graphql17];
const proposalWith = (graphql, source) => parseWith(graphql, source, { experimentalFragmentArguments: true });

const hasNode = (tree, test) => test(tree) || tree.children.some((c) => hasNode(c, test));
const hasEmptySelectionSet = (tree) =>
  (tree.kind === "SelectionSet" && tree.children.length === 0) || tree.children.some(hasEmptySelectionSet);

// ---------------------------------------------------------------------------
// Known discrepancies. Each applies to a graphql-js result and gives the
// result graphql-js would produce without the discrepancy, or undefined.

const KNOWN = [
  {
    id: "longEscape",
    what:
      'graphql-js rejects a variable-width escape with more than 8 hex digits, such as "\\u{000000041}"; ' +
      "EscapedUnicode :: { HexDigit+ } has no limit. graphql-js accepts the same text with the leading zeros dropped",
    kinds: ["lex"],
    alternative: (graphql, source, result) => {
      // A \u{ that is not itself after an escaped backslash.
      const long = /(?<!\\)((?:\\\\)*)\\u\{([0-9A-Fa-f]{9,})\}/g;
      if (result.ok || !long.test(source) || !result.message.includes("Invalid Unicode escape sequence")) return undefined;
      const short = source.replace(long, (_, before, hex) => `${before}\\u{${hex.replace(/^0+(?=.)/, "")}}`);
      return lexWith(graphql, short);
    },
  },
  {
    id: "emptySelectionSet",
    what:
      "graphql-js 16 rejects an empty selection set, such as {}; the draft allows SelectionSet : { Selection* } " +
      "since graphql-spec#1227 (2026-09), as graphql-js 17 does",
    kinds: ["parse", "sdl"],
    alternative: (graphql, source, result, grammar) => {
      if (graphql !== graphql16 || result.ok || !result.message.includes('Expected Name, found "}"')) return undefined;
      const modern = grammar ? documentWith(graphql17, source, grammar) : parseWith(graphql17, source);
      return modern.ok && hasEmptySelectionSet(modern.tree) ? modern : undefined;
    },
  },
  {
    id: "directiveDirectives",
    what:
      "graphql-js 16 rejects directives on a directive definition and a directive extension, such as " +
      "`directive @d @x on FIELD` and `extend directive @d @x`, which are new in September 2026 " +
      "(DirectiveDefinition : Description? directive @ Name ArgumentsDefinition? Directives[Const]? ...; " +
      "DirectiveExtension : extend directive @ Name Directives[Const]), as graphql-js 17 reads them",
    kinds: ["sdl"],
    alternative: (graphql, source, result, grammar) => {
      if (graphql !== graphql16 || result.ok) return undefined;
      const modern = documentWith(graphql17, source, "document");
      const isNew = (t) => (t.kind === "DirectiveDefinition" && t.children[2].children.length > 0) || t.kind === "DirectiveExtension";
      return modern.ok && hasNode(modern.tree, isNew) ? documentWith(graphql17, source, grammar) : undefined;
    },
  },
];

// ---------------------------------------------------------------------------
// Cases

const codePoints = (s) => Array.from(s, (c) => c.codePointAt(0));
const seq = (items) => `<<${items.join(",")}>>`;
const text = (s) => seq(codePoints(s));
const tokensToTla = (tokens) => seq(tokens.map((t) => `T("${t.kind}",${text(t.value)})`));
const treeToTla = (t) => `Nd("${t.kind}",${text(t.text)},${seq(t.children.map(treeToTla))})`;

const expectationKey = (kind, r) =>
  kind === "lex" ? `${r.ok}${JSON.stringify(r.tokens)}` : `${r.ok}${JSON.stringify(r.tree)}`;

// One case per distinct (source, graphql-js result, alternative). An "sdl"
// input is a [source, grammar] pair.
const RUN = {
  lex: lexWith,
  parse: (graphql, source) => parseWith(graphql, source),
  proposal: proposalWith,
  sdl: (graphql, [source, grammar]) => documentWith(graphql, source, grammar),
};
const buildCases = (kind, inputs) => {
  const run = RUN[kind];
  const cases = [];
  let skipped = 0;
  for (const input of inputs) {
    const [source, grammar] = kind === "sdl" ? input : [input, undefined];
    const byKey = new Map();
    for (const graphql of kind === "proposal" ? PROPOSAL_VERSIONS : VERSIONS) {
      const result = run(graphql, input);
      if (result.skip) {
        skipped++;
        continue;
      }
      let alternative;
      let known;
      for (const k of KNOWN.filter((k) => k.kinds.includes(kind))) {
        alternative = k.alternative(graphql, source, result, grammar);
        if (alternative) {
          known = k.id;
          break;
        }
      }
      const key = `${expectationKey(kind, result)}|${known ?? ""}`;
      const existing = byKey.get(key);
      if (existing) existing.versions.push(graphql.version);
      else byKey.set(key, { kind, source, ...(grammar ? { grammar } : {}), result, alternative, known, versions: [graphql.version] });
    }
    cases.push(...byKey.values());
  }
  return { cases, skipped };
};

const caseToTla = (c) => {
  if (c.kind === "print") return `[text |-> ${text(c.text)}, printed |-> ${text(c.source)}, well |-> ${c.well ? "TRUE" : "FALSE"}]`;
  const alt = c.alternative ?? c.result;
  if (c.kind === "sdl") {
    return `[src |-> ${text(c.source)}, g |-> "${c.grammar}", ok |-> ${c.result.ok ? "TRUE" : "FALSE"}, node |-> ${treeToTla(c.result.tree)}, ` +
      `altOk |-> ${alt.ok ? "TRUE" : "FALSE"}, altNode |-> ${treeToTla(alt.tree)}]`;
  }
  return c.kind === "lex"
    ? `[src |-> ${text(c.source)}, ok |-> ${c.result.ok ? "TRUE" : "FALSE"}, tokens |-> ${tokensToTla(c.result.tokens)}, ` +
        `altOk |-> ${alt.ok ? "TRUE" : "FALSE"}, altTokens |-> ${tokensToTla(alt.tokens)}]`
    : `[src |-> ${text(c.source)}, ok |-> ${c.result.ok ? "TRUE" : "FALSE"}, node |-> ${treeToTla(c.result.tree)}, ` +
        `altOk |-> ${alt.ok ? "TRUE" : "FALSE"}, altNode |-> ${treeToTla(alt.tree)}]`;
};

const KINDS_CHECKED = ["lex", "parse", "proposal", "sdl", "print"];

// cases: { lex, parse, proposal, sdl, print }, each a list of cases of that kind.
const moduleFor = (name, cases) => `---- MODULE ${name} ----
EXTENDS Parser, TLC

T(k, v) == [kind |-> k, value |-> v]
Nd(k, t, c) == [kind |-> k, text |-> t, children |-> c]

LexCases == ${seq(cases.lex.map(caseToTla))}
ParseCases == ${seq(cases.parse.map(caseToTla))}
ProposalCases == ${seq(cases.proposal.map(caseToTla))}
SdlCases == ${seq(cases.sdl.map(caseToTla))}
PrintCases == ${seq(cases.print.map(caseToTla))}

LexMatches(c, ok, tokens) == LET lexed == Lex(c.src) IN lexed.ok = ok /\\ lexed.tokens = tokens
ParseMatches(c, ok, tree) == ParseExecutable(c.src) = [ok |-> ok, node |-> tree]
ProposalMatches(c, ok, tree) == ParseExecutableWith(c.src, {FragmentArguments}) = [ok |-> ok, node |-> tree]
SdlMatches(c, ok, tree) == ParseDocument(c.src, c.g) = [ok |-> ok, node |-> tree]

LexDiffers == {i \\in DOMAIN LexCases : ~LexMatches(LexCases[i], LexCases[i].ok, LexCases[i].tokens)}
ParseDiffers == {i \\in DOMAIN ParseCases : ~ParseMatches(ParseCases[i], ParseCases[i].ok, ParseCases[i].node)}
ProposalDiffers == {i \\in DOMAIN ProposalCases : ~ProposalMatches(ProposalCases[i], ProposalCases[i].ok, ProposalCases[i].node)}
SdlDiffers == {i \\in DOMAIN SdlCases : ~SdlMatches(SdlCases[i], SdlCases[i].ok, SdlCases[i].node)}
PrintDiffers == {i \\in DOMAIN PrintCases : IsWellPrintedString(PrintCases[i].text, PrintCases[i].printed) # PrintCases[i].well}
LexUnexplained == {i \\in LexDiffers : ~LexMatches(LexCases[i], LexCases[i].altOk, LexCases[i].altTokens)}
ParseUnexplained == {i \\in ParseDiffers : ~ParseMatches(ParseCases[i], ParseCases[i].altOk, ParseCases[i].altNode)}
ProposalUnexplained == {i \\in ProposalDiffers : ~ProposalMatches(ProposalCases[i], ProposalCases[i].altOk, ProposalCases[i].altNode)}
SdlUnexplained == {i \\in SdlDiffers : ~SdlMatches(SdlCases[i], SdlCases[i].altOk, SdlCases[i].altNode)}

ASSUME PrintT(<<"lex differs", LexDiffers>>) /\\ PrintT(<<"lex unexplained", LexUnexplained>>)
ASSUME PrintT(<<"parse differs", ParseDiffers>>) /\\ PrintT(<<"parse unexplained", ParseUnexplained>>)
ASSUME PrintT(<<"proposal differs", ProposalDiffers>>) /\\ PrintT(<<"proposal unexplained", ProposalUnexplained>>)
ASSUME PrintT(<<"sdl differs", SdlDiffers>>) /\\ PrintT(<<"sdl unexplained", SdlUnexplained>>)
ASSUME PrintT(<<"print differs", PrintDiffers>>) /\\ PrintT(<<"print unexplained", PrintDiffers>>)

DiffInit == vector = 0
====
`;

const runTla = (dir, name) => runChecker(["-workers", "1", "-config", `${name}.cfg`, `${name}.tla`], { cwd: dir });

const indices = (output, label) => {
  const match = output.match(new RegExp(`<<\\s*"${label}",\\s*\\{([^}]*)\\}\\s*>>`));
  if (!match) return undefined;
  return match[1].split(",").map((s) => Number(s.trim())).filter(Boolean);
};

// Checks one chunk of cases in dir. Returns which cases differ, and which of
// those no known discrepancy explains.
const checkChunk = async (dir, name, cases) => {
  writeFileSync(join(dir, `${name}.tla`), moduleFor(name, cases));
  writeFileSync(join(dir, `${name}.cfg`), "INIT DiffInit\nNEXT Next\n");
  const { status, output } = await runTla(dir, name);
  const result = Object.fromEntries(
    KINDS_CHECKED.flatMap((kind) => [
      [`${kind}Differs`, indices(output, `${kind} differs`)],
      [`${kind}Unexplained`, indices(output, `${kind} unexplained`)],
    ]),
  );
  if (status !== 0 || Object.values(result).includes(undefined)) {
    const error = output.split("\n").filter((l) => /Error|error/.test(l)).slice(0, 5).join("\n");
    return { error: (error || `tla-ts exited with ${status}`) + (process.env.DEBUG ? `\n${output.split("Starting...")[1]?.slice(0, 1500)}` : "") };
  }
  const pickCases = (list, ids) => ids.map((i) => list[i - 1]);
  return {
    differs: KINDS_CHECKED.flatMap((kind) => pickCases(cases[kind], result[`${kind}Differs`])),
    unexplained: KINDS_CHECKED.flatMap((kind) => pickCases(cases[kind], result[`${kind}Unexplained`])),
  };
};

const pool = async (items, worker, lanes = Math.max(1, availableParallelism() - 1)) => {
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

// Deterministic shuffle, so every chunk mixes every kind of input.
const shuffle = (items) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = int(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const chunks = (cases) => {
  const n = Math.max(1, Math.ceil(KINDS_CHECKED.reduce((total, kind) => total + cases[kind].length, 0) / CHUNK));
  return range(n).map((i) => Object.fromEntries(KINDS_CHECKED.map((kind) => [kind, cases[kind].filter((_, j) => j % n === i)])));
};
const byKind = (cases) => Object.fromEntries(KINDS_CHECKED.map((kind) => [kind, cases.filter((c) => c.kind === kind)]));

// Negative controls: plausible ways a graphql-js result could be wrong, made
// from cases where graphql-js and the reference agree.
const controls = (lexCases, parseCases, proposalCases, sdlCases, printCases) => {
  const out = [];
  const add = (name, c, result) => out.push({ ...c, name, result, alternative: undefined });
  const lexOk = lexCases.filter((c) => c.result.ok && c.result.tokens.length > 0);
  const withKind = (kind) => lexOk.find((c) => c.result.tokens.some((t) => t.kind === kind));
  const edit = (c, f) => ({ ...c.result, tokens: c.result.tokens.map((t) => ({ ...t })).map(f) });
  const intCase = withKind("IntValue");
  if (intCase) add("an IntValue reported as a FloatValue", intCase, edit(intCase, (t) => (t.kind === "IntValue" ? { ...t, kind: "FloatValue" } : t)));
  const strCase = lexOk.find((c) => c.result.tokens.some((t) => t.kind === "StringValue" && t.value.length > 0));
  if (strCase) add("a string value loses its last character", strCase, edit(strCase, (t) => (t.kind === "StringValue" ? { ...t, value: [...t.value].slice(0, -1).join("") } : t)));
  const blockCase = lexOk.find((c) => c.result.tokens.some((t) => t.kind === "BlockString" && t.value.includes("\n")));
  if (blockCase) add("a block string keeps a line's indentation", blockCase, edit(blockCase, (t) => (t.kind === "BlockString" ? { ...t, value: t.value.replace("\n", "\n ") } : t)));
  const twoTokens = lexOk.find((c) => c.result.tokens.length > 1);
  if (twoTokens) {
    add("a token is dropped", twoTokens, { ...twoTokens.result, tokens: twoTokens.result.tokens.slice(1) });
    add("tokens are reordered", twoTokens, { ...twoTokens.result, tokens: [...twoTokens.result.tokens].reverse() });
  }
  const lexError = lexCases.find((c) => !c.result.ok && /Invalid number/.test(c.result.message));
  if (lexError) add("a number error reported as no tokens", lexError, { ok: true, tokens: [] });
  if (lexOk[0]) add("a success reported as an error", lexOk[0], { ok: false, tokens: [] });

  const parseOk = parseCases.filter((c) => c.result.ok);
  const fields = (t) => (t.kind === "Field" ? [t] : []).concat(...t.children.map(fields));
  const rewrite = (t, f) => f({ ...t, children: t.children.map((c) => rewrite(c, f)) });
  const twoSelections = parseOk.find((c) => hasMany(c.result.tree, "SelectionSet"));
  if (twoSelections) {
    let done = false;
    add("a field is dropped from a selection set", twoSelections, {
      ok: true,
      tree: rewrite(twoSelections.result.tree, (t) => {
        if (!done && t.kind === "SelectionSet" && t.children.length > 1) {
          done = true;
          return { ...t, children: t.children.slice(1) };
        }
        return t;
      }),
    });
  }
  const aliased = parseOk.find((c) => fields(c.result.tree).some((f) => f.children[0].kind === "Name" && f.children[0].text !== f.text));
  if (aliased) {
    add("an alias swapped with its field name", aliased, {
      ok: true,
      tree: rewrite(aliased.result.tree, (t) =>
        t.kind === "Field" && t.children[0].kind === "Name"
          ? { ...t, text: t.children[0].text, children: [node("Name", t.text), ...t.children.slice(1)] }
          : t,
      ),
    });
  }
  const nonNull = parseOk.find((c) => JSON.stringify(c.result.tree).includes('"NonNullType"'));
  if (nonNull) {
    add("a Non-Null wrapper is dropped", nonNull, {
      ok: true,
      tree: rewrite(nonNull.result.tree, (t) => (t.kind === "NonNullType" ? t.children[0] : t)),
    });
  }
  const constVar = parseCases.find((c) => !c.result.ok && /in constant value/.test(c.result.message));
  if (constVar && parseOk[0]) add("a variable in a constant value is accepted", constVar, parseOk[0].result);
  if (parseOk[0]) add("a parsed document reported as an error", parseOk[0], { ok: false, tree: NONE });

  // Fragment arguments (graphql-spec#1081).
  const proposalOk = proposalCases.filter((c) => c.result.ok);
  const hasArguments = (t) => t.kind === "FragmentSpread" && t.children[0].children.length > 0;
  const hasVariables = (t) => t.kind === "FragmentDefinition" && t.children[1].children.length > 0;
  const withArguments = proposalOk.find((c) => hasNode(c.result.tree, hasArguments));
  if (withArguments) {
    add("a spread's arguments are dropped", withArguments, {
      ok: true,
      tree: rewrite(withArguments.result.tree, (t) => (hasArguments(t) ? { ...t, children: [node("Arguments"), t.children[1]] } : t)),
    });
    add("a document with fragment arguments reported as an error", withArguments, { ok: false, tree: NONE });
  }
  const withVariables = proposalOk.find((c) => hasNode(c.result.tree, hasVariables));
  if (withVariables) {
    add("a fragment's variables are dropped", withVariables, {
      ok: true,
      tree: rewrite(withVariables.result.tree, (t) =>
        hasVariables(t) ? { ...t, children: [t.children[0], node("VariablesDefinition"), ...t.children.slice(2)] } : t,
      ),
    });
  }
  const twoArguments = proposalOk.find((c) => hasNode(c.result.tree, (t) => t.kind === "FragmentSpread" && t.children[0].children.length > 1));
  if (twoArguments) {
    add("a spread's arguments are reordered", twoArguments, {
      ok: true,
      tree: rewrite(twoArguments.result.tree, (t) =>
        t.kind === "FragmentSpread" ? { ...t, children: [{ ...t.children[0], children: [...t.children[0].children].reverse() }, t.children[1]] } : t,
      ),
    });
  }
  const noSuchSyntax = proposalCases.find((c) => !c.result.ok && c.source === "{...F ( ) }");
  if (noSuchSyntax && withArguments) add("a spread with no arguments between its parentheses is accepted", noSuchSyntax, withArguments.result);
  // The same source without the proposal: September 2026 has no such syntax.
  const rejected = new Map(parseCases.filter((c) => !c.result.ok).map((c) => [c.source, c]));
  const alsoRead = (test) => proposalOk.find((c) => rejected.has(c.source) && hasNode(c.result.tree, test));
  const argumentsRead = alsoRead(hasArguments);
  if (argumentsRead) add("a spread's arguments are read without the proposal", rejected.get(argumentsRead.source), argumentsRead.result);
  const variablesRead = alsoRead(hasVariables);
  if (variablesRead) add("a fragment's variables are read without the proposal", rejected.get(variablesRead.source), variablesRead.result);

  const sdlOk = sdlCases.filter((c) => c.result.ok);
  const twoFields = sdlOk.find((c) => hasNode(c.result.tree, (t) => t.kind === "FieldsDefinition" && t.children.length > 1));
  if (twoFields) {
    let done = false;
    add("a field definition is dropped", twoFields, {
      ok: true,
      tree: rewrite(twoFields.result.tree, (t) => {
        if (!done && t.kind === "FieldsDefinition" && t.children.length > 1) {
          done = true;
          return { ...t, children: t.children.slice(1) };
        }
        return t;
      }),
    });
  }
  const extension = sdlOk.find((c) => hasNode(c.result.tree, (t) => t.kind === "ObjectTypeExtension"));
  if (extension) {
    add("a type extension reported as a definition", extension, {
      ok: true,
      tree: rewrite(extension.result.tree, (t) => (t.kind === "ObjectTypeExtension" ? { ...t, kind: "ObjectTypeDefinition" } : t)),
    });
  }
  const repeatable = sdlOk.find((c) => hasNode(c.result.tree, (t) => t.kind === "Repeatable" && t.text === "repeatable"));
  if (repeatable) {
    add("a repeatable directive reported as not repeatable", repeatable, {
      ok: true,
      tree: rewrite(repeatable.result.tree, (t) => (t.kind === "Repeatable" ? { ...t, text: "" } : t)),
    });
  }
  const notAllowed = sdlCases.find((c) => !c.result.ok && c.result.message === "not a typeSystem document");
  if (notAllowed) add("an extension accepted in a type system document", notAllowed, documentWith(graphql17, notAllowed.source, "document"));
  if (sdlOk[0]) add("a type system document reported as an error", sdlOk[0], { ok: false, tree: NONE });

  const flip = (name, c) => c && out.push({ ...c, name, well: !c.well });
  flip("a well printed string judged not well printed", printCases.find((c) => c.well));
  flip("a raw C1 control judged well printed", printCases.find((c) => !c.well && /[\u007F-\u009F]/.test(c.source) && !/[\u0000-\u001F]/.test(c.source)));
  flip("a surrogate pair escape judged well printed", printCases.find((c) => !c.well && hasPairEscape(c.source) && judgePrinted(c.text, c.source.replace(/\\u([dD][89abAB][0-9a-fA-F]{2})\\u([dD][c-fC-F][0-9a-fA-F]{2})/g, (_, h, l) => `\\u{${String.fromCharCode(parseInt(h, 16), parseInt(l, 16)).codePointAt(0).toString(16)}}`))));
  return out;
};
function hasMany(tree, kind) {
  return (tree.kind === kind && tree.children.length > 1) || tree.children.some((c) => hasMany(c, kind));
}

// ---------------------------------------------------------------------------

const started = Date.now();
const lex = buildCases("lex", lexerInputs());
const parse = buildCases("parse", parserInputs());
const lexCases = shuffle(lex.cases);
const parseCases = shuffle(parse.cases);
const proposal = buildCases("proposal", proposalInputs());
const proposalCases = shuffle(proposal.cases);
const sdlCases = shuffle(buildCases("sdl", sdlInputs()).cases);
const printCases = shuffle(printInputs());
const allChunks = chunks({ lex: lexCases, parse: parseCases, proposal: proposalCases, sdl: sdlCases, print: printCases });

const fresh = () => {
  const dir = mkdtempSync(join(tmpdir(), "differential-"));
  cpSync(join(root, "specs/Lexer.tla"), join(dir, "Lexer.tla"));
  cpSync(join(root, "specs/Parser.tla"), join(dir, "Parser.tla"));
  return dir;
};

const describe = (c) => {
  if (c.kind === "print") return `print ${JSON.stringify(c.text)} as ${JSON.stringify(c.source)} (${c.versions.join(", ")}): judged ${c.well ? "well" : "not well"} printed`;
  const result = (r) =>
    !r.ok ? `error (${r.message})` : c.kind === "lex" ? JSON.stringify(r.tokens.map((t) => [t.kind, t.value])) : "a tree";
  return `${c.kind}${c.grammar ? ` (${c.grammar})` : ""} ${JSON.stringify(c.source)} on graphql-js ${c.versions.join(", ")}: ${result(c.result)}`;
};

let failed = false;

if (!MUTANTS) {
  const dir = fresh();
  try {
    const results = await pool(allChunks, (chunk, i) => checkChunk(dir, `Differential${i}`, chunk));
    const errors = results.filter((r) => r.error);
    for (const r of errors) console.log(`✗ tla-ts failed: ${r.error}`);
    if (errors.length > 0) process.exit(1);
    const differs = results.flatMap((r) => r.differs);
    const unexplained = results.flatMap((r) => r.unexplained);

    const distinct = (cases) => new Set(cases.map((c) => c.source)).size;
    console.log(`  lexer: ${distinct(lexCases)} inputs, ${lexCases.length} cases (one per distinct graphql-js result)`);
    console.log(`  parser: ${distinct(parseCases)} inputs, ${parseCases.length} cases, ${parse.skipped} type system results left to the type system cases`);
    console.log(`  fragment arguments (graphql-spec#1081, graphql-js ${PROPOSAL_VERSIONS.map((g) => g.version).join(", ")} with experimentalFragmentArguments): ${distinct(proposalCases)} inputs, ${proposalCases.filter((c) => c.result.ok).length} parsed, ${proposal.skipped} type system results skipped`);
    console.log(`  type system: ${new Set(sdlCases.map((c) => `${c.grammar}\u0000${c.source}`)).size} inputs (source and grammar), ${sdlCases.length} cases`);
    console.log(`  printing: ${printCases.length} printed strings from ${PRINTERS.length} printers, ${printCases.filter((c) => c.well).length} judged well printed`);

    for (const c of unexplained) {
      console.log(`✗ the reference disagrees with ${describe(c)}`);
      failed = true;
    }
    if (unexplained.length === 0) {
      console.log(`✓ every graphql-js 16 and 17 result agrees with Lexer.tla and Parser.tla, except the known discrepancies, graphql-js 17's fragment arguments agree with ParseExecutableWith, and every printed string is judged as IsWellPrintedString judges it`);
    }
    for (const k of KNOWN) {
      const seen = differs.filter((c) => c.known === k.id && !unexplained.includes(c));
      if (seen.length === 0) {
        console.log(`✗ known discrepancy no longer seen: ${k.id}`);
        failed = true;
        continue;
      }
      const shortest = seen.reduce((a, b) => (b.source.length < a.source.length ? b : a));
      const versions = [...new Set(seen.flatMap((c) => c.versions))].join(", ");
      console.log(`! known discrepancy (${seen.length} cases, graphql-js ${versions}): ${k.what}`);
      console.log(`    shortest: ${JSON.stringify(shortest.source)}`);
    }

    const agreeing = (cases) => cases.filter((c) => !differs.includes(c));
    const negative = controls(agreeing(lexCases), agreeing(parseCases), agreeing(proposalCases), agreeing(sdlCases), agreeing(printCases));
    const check = await checkChunk(dir, "Controls", byKind(negative));
    if (check.error) {
      console.log(`✗ tla-ts failed on the controls: ${check.error}`);
      failed = true;
    } else {
      const accepted = negative.filter((c) => !check.unexplained.includes(c));
      for (const c of accepted) {
        console.log(`✗ a negative control is accepted: ${c.name}`);
        failed = true;
      }
      if (accepted.length === 0) {
        console.log(`✓ every negative control is rejected (${negative.length}: ${negative.map((c) => c.name).join(", ")})`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
} else {
  const mutants = [];
  for (const file of ["lexer.mutants.mjs", "parser.mutants.mjs"]) {
    mutants.push(...(await import(pathToFileURL(join(root, "specs", file)).href)).default);
  }
  const dirs = mutants.map((mutant) => {
    const dir = fresh();
    const path = join(dir, mutant.file);
    const original = readFileSync(path, "utf8");
    if (!original.includes(mutant.find)) return { dir, error: `can't find: ${mutant.find}` };
    writeFileSync(path, original.replace(mutant.find, mutant.replace));
    return { dir };
  });
  const caught = mutants.map(() => undefined);
  const errors = mutants.map((_, i) => dirs[i].error);
  // Round-robin, so most mutants are caught by their first chunk and skip the rest.
  const tasks = allChunks.flatMap((chunk, c) => mutants.map((_, m) => ({ m, c, chunk })));
  try {
    await pool(tasks, async ({ m, c, chunk }) => {
      if (caught[m] || errors[m]) return;
      const r = await checkChunk(dirs[m].dir, `Differential${c}`, chunk);
      if (r.error) errors[m] = r.error;
      else if (r.unexplained.length > 0 && !caught[m]) {
        caught[m] = r.unexplained.reduce((a, b) => (b.source.length < a.source.length ? b : a));
      }
    });
  } finally {
    for (const { dir } of dirs) rmSync(dir, { recursive: true, force: true });
  }
  mutants.forEach((mutant, m) => {
    if (caught[m]) console.log(`✓ ${mutant.file}: ${mutant.name}\n    caught by ${describe(caught[m])}`);
    else {
      console.log(`✗ ${mutant.file}: ${mutant.name} is not caught${errors[m] ? ` (${errors[m]})` : ""}`);
      failed = true;
    }
  });
}

console.log(`  ${((Date.now() - started) / 1000).toFixed(1)}s`);
process.exit(failed ? 1 : 0);
