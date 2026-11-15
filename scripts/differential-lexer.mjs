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
// are skipped: they are not an ExecutableDocument.
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

import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as graphql16 from "graphql16";
import * as graphql17 from "graphql17";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const cli = join(root, "node_modules/tla-ts/dist/cli.js");
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
const rnd = mulberry32(SEED);
const int = (n) => Math.floor(rnd() * n);
const pick = (items) => items[int(items.length)];
const chance = (p) => rnd() < p;
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

// A random token sequence over the executable grammar, mostly valid.
const document = () => {
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
    if (k < 8) return ["...", pick(NOT_ON), ...directives(false)];
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
    return [...description(), "fragment", chance(0.05) ? "on" : pick(NOT_ON), "on", pick(["T", "on"]), ...directives(false), ...selectionSet(0)];
  };
  return range(1 + int(2)).flatMap(() => definition());
};

const TOKEN_POOL = ["{", "}", "(", ")", "[", "]", ":", "$", "@", "!", "=", "...", "a", "on", "query", "fragment", "1", '"s"', "null"];
const SEPARATORS = [" ", " ", " ", ",", "\n", "\t", " #c\n", "\r\n", "\uFEFF"];
const spaced = (tokens) => tokens.map((t, i) => (i === 0 ? t : pick(SEPARATORS) + t)).join("");

const mutate = (tokens) => {
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

const parserInputs = () => {
  const inputs = new Set([
    ...words(["{", "}", "a", "on", "...", "(", ")", ":", "$", "@", "query", "fragment", '"d"'].map((t) => `${t} `), 4),
    ...words(["[", "]", "{", "}", "k", ":", "$", "1", "null", "true", '"s"'].map((t) => `${t} `), 3).map((w) => `{a(x: ${w})}`),
    ...words(["$", "a", ":", "Int", "[", "]", "!", "=", "1", "@", "d", '"d"'].map((t) => `${t} `), 3).map((w) => `query (${w}) {a}`),
    ...words(["(", ")", "x", ":", "1", "@", "d", "{", "}", "...", "on", "$"].map((t) => `${t} `), 3).map((w) => `{a ${w}}`),
    ...words(["on", "F", "T", "@", "d", "(", ")", "$", "{", "}"].map((t) => `${t} `), 3).map((w) => `fragment ${w}{a}`),
    ...vectorSources(/(?:Parses|Rejects)\("((?:[^"\\]|\\.)*)"/g, "Parser.tla"),
  ]);
  inputs.add("query ($a: [Int!]! = [1], $b: String @d(x: 2)) @e { a: b(x: [1, 2.5, \"s\", E, null, {k: $v}]) ...F ... on T {c} }");
  for (let i = 0; i < RANDOM; i++) {
    const tokens = document();
    inputs.add(spaced(tokens));
    inputs.add(spaced(mutate(tokens)));
  }
  return [...inputs];
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
  if (s.kind === "FragmentSpread") return node("FragmentSpread", s.name.value, [directives(s.directives)]);
  return node("InlineFragment", "", [
    s.typeCondition ? node("NamedType", s.typeCondition.name.value) : NONE,
    directives(s.directives),
    selectionSet(s.selectionSet),
  ]);
};
const definition = (d) => {
  if (d.kind === "OperationDefinition") {
    return node("OperationDefinition", d.operation, [
      description(d.description),
      d.name ? node("Name", d.name.value) : NONE,
      node("VariablesDefinition", "", (d.variableDefinitions ?? []).map((v) =>
        node("VariableDefinition", "", [
          description(v.description),
          node("Variable", v.variable.name.value),
          type(v.type),
          v.defaultValue ? value(v.defaultValue) : NONE,
          directives(v.directives),
        ]),
      )),
      directives(d.directives),
      selectionSet(d.selectionSet),
    ]);
  }
  if (d.kind === "FragmentDefinition") {
    return node("FragmentDefinition", d.name.value, [
      description(d.description),
      node("NamedType", d.typeCondition.name.value),
      directives(d.directives),
      selectionSet(d.selectionSet),
    ]);
  }
  return undefined;
};

const parseWith = (graphql, source) => {
  try {
    const definitions = graphql.parse(source, { noLocation: true }).definitions.map(definition);
    if (definitions.includes(undefined)) return { skip: true };
    return { ok: true, tree: node("Document", "", definitions) };
  } catch (error) {
    if (error instanceof graphql.GraphQLError) return { ok: false, tree: NONE, message: error.message };
    throw error;
  }
};

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
    kind: "lex",
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
    kind: "parse",
    alternative: (graphql, source, result) => {
      if (graphql !== graphql16 || result.ok || !result.message.includes('Expected Name, found "}"')) return undefined;
      const modern = parseWith(graphql17, source);
      return modern.ok && hasEmptySelectionSet(modern.tree) ? modern : undefined;
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

// One case per distinct (source, graphql-js result, alternative).
const buildCases = (kind, inputs) => {
  const run = kind === "lex" ? lexWith : parseWith;
  const cases = [];
  let skipped = 0;
  for (const source of inputs) {
    const byKey = new Map();
    for (const graphql of VERSIONS) {
      const result = run(graphql, source);
      if (result.skip) {
        skipped++;
        continue;
      }
      let alternative;
      let known;
      for (const k of KNOWN.filter((k) => k.kind === kind)) {
        alternative = k.alternative(graphql, source, result);
        if (alternative) {
          known = k.id;
          break;
        }
      }
      const key = `${expectationKey(kind, result)}|${known ?? ""}`;
      const existing = byKey.get(key);
      if (existing) existing.versions.push(graphql.version);
      else byKey.set(key, { kind, source, result, alternative, known, versions: [graphql.version] });
    }
    cases.push(...byKey.values());
  }
  return { cases, skipped };
};

const caseToTla = (c) => {
  const alt = c.alternative ?? c.result;
  return c.kind === "lex"
    ? `[src |-> ${text(c.source)}, ok |-> ${c.result.ok ? "TRUE" : "FALSE"}, tokens |-> ${tokensToTla(c.result.tokens)}, ` +
        `altOk |-> ${alt.ok ? "TRUE" : "FALSE"}, altTokens |-> ${tokensToTla(alt.tokens)}]`
    : `[src |-> ${text(c.source)}, ok |-> ${c.result.ok ? "TRUE" : "FALSE"}, node |-> ${treeToTla(c.result.tree)}, ` +
        `altOk |-> ${alt.ok ? "TRUE" : "FALSE"}, altNode |-> ${treeToTla(alt.tree)}]`;
};

const moduleFor = (name, lexCases, parseCases) => `---- MODULE ${name} ----
EXTENDS Parser, TLC

T(k, v) == [kind |-> k, value |-> v]
Nd(k, t, c) == [kind |-> k, text |-> t, children |-> c]

LexCases == ${seq(lexCases.map(caseToTla))}
ParseCases == ${seq(parseCases.map(caseToTla))}

LexMatches(c, ok, tokens) == LET lexed == Lex(c.src) IN lexed.ok = ok /\\ lexed.tokens = tokens
ParseMatches(c, ok, tree) == ParseExecutable(c.src) = [ok |-> ok, node |-> tree]

LexDiffers == {i \\in DOMAIN LexCases : ~LexMatches(LexCases[i], LexCases[i].ok, LexCases[i].tokens)}
ParseDiffers == {i \\in DOMAIN ParseCases : ~ParseMatches(ParseCases[i], ParseCases[i].ok, ParseCases[i].node)}
LexUnexplained == {i \\in LexDiffers : ~LexMatches(LexCases[i], LexCases[i].altOk, LexCases[i].altTokens)}
ParseUnexplained == {i \\in ParseDiffers : ~ParseMatches(ParseCases[i], ParseCases[i].altOk, ParseCases[i].altNode)}

ASSUME PrintT(<<"lex differs", LexDiffers>>) /\\ PrintT(<<"lex unexplained", LexUnexplained>>)
ASSUME PrintT(<<"parse differs", ParseDiffers>>) /\\ PrintT(<<"parse unexplained", ParseUnexplained>>)

DiffInit == vector = 0
====
`;

const runTla = (dir, name) =>
  new Promise((done) => {
    const child = spawn(process.execPath, [cli, "-workers", "1", "-config", `${name}.cfg`, `${name}.tla`], { cwd: dir });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (status) => done({ status, output }));
  });

const indices = (output, label) => {
  const match = output.match(new RegExp(`<<\\s*"${label}",\\s*\\{([^}]*)\\}\\s*>>`));
  if (!match) return undefined;
  return match[1].split(",").map((s) => Number(s.trim())).filter(Boolean);
};

// Checks one chunk of cases in dir. Returns which cases differ, and which of
// those no known discrepancy explains.
const checkChunk = async (dir, name, lexCases, parseCases) => {
  writeFileSync(join(dir, `${name}.tla`), moduleFor(name, lexCases, parseCases));
  writeFileSync(join(dir, `${name}.cfg`), "INIT DiffInit\nNEXT Next\n");
  const { status, output } = await runTla(dir, name);
  const result = {
    lexDiffers: indices(output, "lex differs"),
    lexUnexplained: indices(output, "lex unexplained"),
    parseDiffers: indices(output, "parse differs"),
    parseUnexplained: indices(output, "parse unexplained"),
  };
  if (status !== 0 || Object.values(result).includes(undefined)) {
    const error = output.split("\n").filter((l) => /Error|error/.test(l)).slice(0, 5).join("\n");
    return { error: (error || `tla-ts exited with ${status}`) + (process.env.DEBUG ? `\n${output.split("Starting...")[1]?.slice(0, 1500)}` : "") };
  }
  const pickCases = (list, ids) => ids.map((i) => list[i - 1]);
  return {
    differs: [...pickCases(lexCases, result.lexDiffers), ...pickCases(parseCases, result.parseDiffers)],
    unexplained: [...pickCases(lexCases, result.lexUnexplained), ...pickCases(parseCases, result.parseUnexplained)],
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

const chunks = (lexCases, parseCases) => {
  const n = Math.max(1, Math.ceil((lexCases.length + parseCases.length) / CHUNK));
  return range(n).map((i) => ({
    lex: lexCases.filter((_, j) => j % n === i),
    parse: parseCases.filter((_, j) => j % n === i),
  }));
};

// Negative controls: plausible ways a graphql-js result could be wrong, made
// from cases where graphql-js and the reference agree.
const controls = (lexCases, parseCases) => {
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
const allChunks = chunks(lexCases, parseCases);

const fresh = () => {
  const dir = mkdtempSync(join(tmpdir(), "differential-"));
  cpSync(join(root, "specs/Lexer.tla"), join(dir, "Lexer.tla"));
  cpSync(join(root, "specs/Parser.tla"), join(dir, "Parser.tla"));
  return dir;
};

const describe = (c) => {
  const result = (r) =>
    !r.ok ? `error (${r.message})` : c.kind === "lex" ? JSON.stringify(r.tokens.map((t) => [t.kind, t.value])) : "a tree";
  return `${c.kind} ${JSON.stringify(c.source)} on graphql-js ${c.versions.join(", ")}: ${result(c.result)}`;
};

let failed = false;

if (!MUTANTS) {
  const dir = fresh();
  try {
    const results = await pool(allChunks, (chunk, i) => checkChunk(dir, `Differential${i}`, chunk.lex, chunk.parse));
    const errors = results.filter((r) => r.error);
    for (const r of errors) console.log(`✗ tla-ts failed: ${r.error}`);
    if (errors.length > 0) process.exit(1);
    const differs = results.flatMap((r) => r.differs);
    const unexplained = results.flatMap((r) => r.unexplained);

    const distinct = (cases) => new Set(cases.map((c) => c.source)).size;
    console.log(`  lexer: ${distinct(lexCases)} inputs, ${lexCases.length} cases (one per distinct graphql-js result)`);
    console.log(`  parser: ${distinct(parseCases)} inputs, ${parseCases.length} cases, ${parse.skipped} type system results skipped`);

    for (const c of unexplained) {
      console.log(`✗ the reference disagrees with ${describe(c)}`);
      failed = true;
    }
    if (unexplained.length === 0) {
      console.log(`✓ every graphql-js 16 and 17 result agrees with Lexer.tla and Parser.tla, except the known discrepancies`);
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

    const negative = controls(
      lexCases.filter((c) => !differs.includes(c)),
      parseCases.filter((c) => !differs.includes(c)),
    );
    const check = await checkChunk(dir, "Controls", negative.filter((c) => c.kind === "lex"), negative.filter((c) => c.kind === "parse"));
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
      const r = await checkChunk(dirs[m].dir, `Differential${c}`, chunk.lex, chunk.parse);
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
