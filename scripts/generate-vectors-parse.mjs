// Builds kit/parse/vectors.json: source texts, each with whether it is a
// syntactically valid executable document. The answer comes from
// ParseExecutable in specs/Parser.tla (over Lex in specs/Lexer.tla),
// evaluated by tla-ts, never from graphql-js.
//
// The sources come from the differential's families
// (scripts/differential-lexer.mjs), copied here because that script runs
// when it is imported:
//
//   - the hand-written vectors in Lexer.tla and Parser.tla, the spec's own
//     examples among them;
//   - short sequences over the lexer's alphabets (inside "…", inside """…""",
//     numbers, ignored tokens), exhaustively up to a small length, each
//     placed where the grammar allows that token, such as {a(x: …)};
//   - short token sequences over the parser's alphabets in the same
//     contexts as the differential;
//   - seeded random documents over the executable grammar, and one-token
//     mutations of them.
//
// Every candidate is evaluated, then a few thousand are kept, mostly as
// minimal pairs: a rejected source next to an accepted one that differs by
// one edit (one atom or token deleted, replaced or inserted). The pair is
// tagged with the spec section that edit is about, so a failure says which
// rule an implementation got wrong without asking it why:
//
//   - for a lexical rejection, the section of the token where Lex fails
//     (a string, a number, a lone `.`, a character that starts no token,
//     or a code point that is not a SourceCharacter);
//   - otherwise, the section the edited atom or token belongs to: each
//     family's alphabet says which, and the random documents record the
//     production each token came from.
//
// The tags are this script's attribution of one edit. The reference only
// says accepted or rejected.
//
// Usage: node scripts/generate-vectors-parse.mjs [--check]
//   --check  regenerates the vectors and fails if kit/parse/vectors.json
//            differs.

import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { section } from "../kit/report.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const cli = join(root, "node_modules/tla-ts/dist/cli.js");
const OUT = join(root, "kit/parse/vectors.json");
const CHECK = process.argv.includes("--check");
// tla-ts processes at once, each with one worker, and sources per process.
const LANES = 2;
const CHUNK = 2500;

const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const random = (seed) => {
  const rnd = mulberry32(seed);
  const int = (n) => Math.floor(rnd() * n);
  return { int, pick: (items) => items[int(items.length)], chance: (p) => rnd() < p };
};
const range = (n) => Array.from({ length: n }, (_, i) => i);

// Every sequence of up to maxLength atoms, as arrays.
const words = (atoms, maxLength) => {
  const out = [[]];
  let frontier = [[]];
  for (let n = 1; n <= maxLength; n++) {
    frontier = frontier.flatMap((w) => atoms.map((a) => [...w, a]));
    out.push(...frontier);
  }
  return out;
};

const byNumber = (a, b) => {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? -1) !== (y[i] ?? -1)) return (x[i] ?? -1) - (y[i] ?? -1);
  }
  return 0;
};
const bySize = (a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

// ---------------------------------------------------------------------------
// Alphabets, from the differential

const LONE_LEADING = "\uD800";
const LONE_TRAILING = "\uDC00";
const ASTRAL = "\u{1F600}";
const BOM = "\uFEFF";

// Inside "…": every kind of escape, valid and not, and the characters a
// string must not contain.
const IN_STRING = [
  "a", " ", "\"", "\\", "\n", "\r", ASTRAL, LONE_TRAILING, "\\u0041", "\\u{1F600}",
  "\\u{110000}", "\\uD83D", "\\uDE00", "\\u{D800}", "\\u{}", "\\u{000000041}", "\\x",
  "\\/", "\\b", "u{", "}", "\\u00", "\\\"",
];
// Inside """…""": indentation, line terminators and the `\"""` escape.
const IN_BLOCK = [" ", "\t", "\n", "\r", "\r\n", "a", "\"", "\\\"\"\"", "\\", "\"\""];
// Numbers and their lookahead.
const IN_NUMBER = ["0", "1", ".", "e", "E", "-", "+", "x", "_"];
// Ignored tokens, and look-alikes that are not: no-break space, vertical
// tab and form feed are not White Space; U+2028 and NEL are not
// LineTerminators; a lone surrogate is not a SourceCharacter, even in a
// comment.
const IGNORED = [" ", "\t", "\n", "\r", ",", BOM, "#", "x", "\u00A0", "\u000B", "\u000C", "\u2028", "\u0085", LONE_LEADING];
const IGNORED_SECTION = {
  " ": ["2.1.1"], "\t": ["2.1.1"], "\u00A0": ["2.1.1"], "\u000B": ["2.1.1"], "\u000C": ["2.1.1"],
  "\n": ["2.1.2"], "\r": ["2.1.2"], "\u2028": ["2.1.2"], "\u0085": ["2.1.2"],
  "#": ["2.1.3"], x: ["2.1.3"], ",": ["2.1.4"], [BOM]: ["2.1.6", "2.1"], [LONE_LEADING]: ["2.1"],
};
// In {a…b}, ignored tokens can only be rejected by Lex, at a character that
// is not one, or by a comment that runs over b}: a comment ends at a
// LineTerminator, and not at a look-alike.
const ignoredSection = (source, verdict) => {
  if (!verdict.lexOk) return IGNORED_SECTION[String.fromCodePoint(codePoints(source)[verdict.lexPos - 1])] ?? ["2.1.5"];
  return /#[^\n\r]*[\u2028\u0085]/.test(source) ? ["2.1.2"] : ["2.1.3"];
};

const inValue = (w) => `{a(x: ${w})}`;
// Numbers go in a list, where a number split in two, such as 0x1 read as
// 0 and x1, would still be a valid document.
const inList = (w) => `{a(x: [${w}])}`;

// ---------------------------------------------------------------------------
// Families. Each candidate is { units, source }; pairs are looked for among
// a family's candidates, one unit apart.
//
//   lexical   a rejection must come from Lex; its section is the token Lex
//             fails on. Other rejections are dropped.
//   classify  the section comes from the rejected source and its verdict.
//   tags      the section is the edited unit's, else fallback.
//   also      sections every vector of the family exercises besides.
//   positives how many accepted candidates to keep for each unit.
//   keep      which sequences to use, if not all.

const NUMBER_RUN = /^[-+.eE0-9]*/;
const numberSection = (text) => (/[.eE]/.test(text.match(NUMBER_RUN)[0]) ? "2.10.2" : "2.10.1");

const wordFamily = (name, atoms, maxLength, render, options) => ({
  name,
  atoms,
  candidates: [...words(atoms, maxLength), ...(options.extra ?? [])]
    .filter((units) => !options.keep || options.keep(units))
    .map((units) => ({ units, source: render(units.join(options.joiner ?? "")) })),
  ...options,
});

const extraWords = (atoms, count, seed, lengths) => {
  const { int, pick } = random(seed);
  return range(count).map(() => range(lengths[0] + int(lengths[1] - lengths[0] + 1)).map(() => pick(atoms)));
};

const wordFamilies = () => [
  wordFamily("strings", IN_STRING, 2, (w) => inValue(`"${w}"`), {
    lexical: true,
    extra: extraWords(IN_STRING, 400, 11, [3, 4]),
    positives: 2,
    positive: () => ["2.10.4"],
    pairs: 130,
    perKey: 2,
  }),
  wordFamily("block-strings", IN_BLOCK, 3, (w) => inValue(`"""${w}"""`), {
    lexical: true,
    positives: 2,
    positive: () => ["2.10.4"],
    pairs: 50,
    perKey: 2,
  }),
  wordFamily("numbers", IN_NUMBER, 3, inList, {
    lexical: true,
    positives: 2,
    // An accepted value here is a number, or an enum value such as `e`.
    positive: (units) => {
      const text = units.join("");
      return [/^-?(0|[1-9][0-9]*)$/.test(text) ? "2.10.1" : /^-?[0-9]/.test(text) ? "2.10.2" : "2.10.6"];
    },
    pairs: 100,
    perKey: 2,
  }),
  // `...` and the dots that are not a punctuator.
  wordFamily("punctuators", [".", " ", "F"], 5, (w) => `{a ${w}}`, {
    lexical: true,
    positives: 2,
    positive: () => ["2.1.7"],
    pairs: 30,
    perKey: 3,
  }),
  // Characters that start no token.
  wordFamily("tokens", ["?", "'", ";", "%", "\\", "`", "~", "*", "^", "<", "\u00E9", "b", " "], 2, (w) => `{a ${w}}`, {
    lexical: true,
    positives: 1,
    positive: () => ["2.1.5"],
    pairs: 25,
    perKey: 1,
  }),
  wordFamily("ignored", IGNORED, 3, (w) => `{a${w}b}`, {
    classify: ignoredSection,
    also: ["2.1.6"],
    positives: 4,
    positive: (units, unit) => IGNORED_SECTION[unit],
    pairs: 110,
    perKey: 3,
  }),
  // Names, and what is not one.
  wordFamily("names", ["a", "_", "1", "Z", "\u00E9", "-"], 3, (w) => `{${w} x}`, {
    fallback: "2.1.8",
    positives: 1,
    positive: () => ["2.1.8"],
    pairs: 45,
    perKey: 2,
  }),
  // The differential's token sequences, in the same contexts.
  wordFamily("values", ["[", "]", "{", "}", "k", ":", "$", "1", "null", "true", '"s"'], 3, (w) => `{a(x: ${w})}`, {
    joiner: " ",
    tags: (unit) => ({ "[": ["2.10.7"], "]": ["2.10.7"], "{": ["2.10.8"], "}": ["2.10.8"], ":": ["2.10.8"], $: ["2.11"] })[unit],
    fallback: "2.10",
    positives: 3,
    // Not after a $: `$ true` is a variable named true.
    positive: (units, unit) =>
      units.includes("$") ? undefined : ({ "[": ["2.10.7"], "{": ["2.10.8"], null: ["2.10.5"], true: ["2.10.3"], '"s"': ["2.10.4"], 1: ["2.10.1"], k: ["2.10.6"] })[unit],
    pairs: 110,
    perKey: 3,
  }),
  // The differential's variable definitions, query (…) {a}, take four tokens
  // to be valid, so here they are split in two contexts of up to three.
  wordFamily("variable-definitions", ["$", "a", ":", ",", "1", '"d"'], 3, (w) => `query (${w} : Int) {a}`, {
    joiner: " ",
    tags: (unit) => ({ '"d"': ["2.2"] })[unit],
    fallback: "2.11",
    positives: 1,
    positive: (units, unit) => ({ $: ["2.11"], '"d"': ["2.2"] })[unit],
    pairs: 40,
    perKey: 3,
  }),
  wordFamily("variable-types", ["Int", "[", "]", "!", "=", "1", "@", "d", "$", "b"], 3, (w) => `query ($a: ${w}) {a}`, {
    joiner: " ",
    tags: (unit) => ({ Int: ["2.12"], "[": ["2.12"], "]": ["2.12"], "!": ["2.12"], "@": ["2.13"], d: ["2.13"] })[unit],
    fallback: "2.11",
    positives: 1,
    positive: (units, unit) => ({ Int: ["2.12"], "[": ["2.12"], "!": ["2.12"], "@": ["2.13"], "=": ["2.11"] })[unit],
    pairs: 90,
    perKey: 3,
  }),
  wordFamily("field-suffixes", ["(", ")", "x", ":", "1", "@", "d", "{", "}", "...", "on", "$"], 3, (w) => `{a ${w}}`, {
    joiner: " ",
    // Not those that close the field's selection set early: what follows
    // is not a suffix of a.
    keep: (units) => units.every((_, i) => units.slice(0, i + 1).filter((u) => u === "{").length >= units.slice(0, i + 1).filter((u) => u === "}").length),
    tags: (unit) => ({ "@": ["2.13"], d: ["2.13"], "{": ["2.5"], "}": ["2.5"], "...": ["2.9"], on: ["2.9.1"], $: ["2.11"] })[unit],
    fallback: "2.7",
    positives: 1,
    positive: (units, unit) => ({ "(": ["2.7"], "@": ["2.13"], "{": ["2.5"], "...": ["2.9"], on: ["2.9.1"] })[unit],
    pairs: 110,
    perKey: 3,
  }),
  wordFamily("fragment-definitions", ["on", "F", "T", "@", "d", "(", ")", "$", "{", "}"], 3, (w) => `fragment ${w} {a}`, {
    joiner: " ",
    tags: (unit) => ({ on: ["2.9.1"], T: ["2.9.1"], "@": ["2.13"], d: ["2.13"], "{": ["2.5"], "}": ["2.5"] })[unit],
    fallback: "2.9",
    positives: 1,
    positive: (units, unit) => ({ on: ["2.9.1"], "@": ["2.13"], F: ["2.9"] })[unit],
    pairs: 70,
    perKey: 3,
  }),
];

// ---------------------------------------------------------------------------
// Random documents, from the differential's generator, with each token
// tagged with the productions it came from.

const NAMES = ["a", "b", "on", "query", "fragment", "true", "null", "Foo", "_x", "mutation", "false", "x1"];
const NOT_ON = NAMES.filter((n) => n !== "on");
const STRINGS = ['"s"', '""', '"\\u00e9\\n"', '"""\n  block\n"""', '""""""'];
const TOKEN_POOL = ["{", "}", "(", ")", "[", "]", ":", "$", "@", "!", "=", "...", "a", "on", "query", "fragment", "1", '"s"', "null"];
const SEPARATORS = [" ", " ", " ", ",", "\n", "\t", " #c\n", "\r\n", BOM];

// A document is { tokens: [{ text, path, sep }], nodes }. path holds the
// ids of the productions a token is part of, outermost first. A node is
// { section, size, keep }: size is its number of tokens, and keep marks the
// Value, Type and Description positions, which count even when they hold
// one token.
const randomDocument = ({ int, pick, chance }) => {
  const nodes = [];
  const node = (sectionNumber, keep, parts) => {
    const id = nodes.push({ section: sectionNumber, keep, size: 0 }) - 1;
    const tokens = parts.flatMap((p) => (typeof p === "string" ? [{ text: p, path: [] }] : p));
    for (const t of tokens) t.path.unshift(id);
    nodes[id].size = tokens.length;
    return tokens;
  };
  const T = (s, ...parts) => node(s, false, parts);
  const K = (s, ...parts) => node(s, true, parts);
  const name = () => pick(NAMES);
  const value = (depth, isConst) => {
    const kinds = ["int", "float", "string", "bool", "null", "enum"];
    if (depth < 2) kinds.push("list", "object");
    if (!isConst) kinds.push("var");
    const inner = (() => {
      switch (pick(kinds)) {
        case "int": return T("2.10.1", pick(["0", "-1", "42"]));
        case "float": return T("2.10.2", pick(["1.5", "-0.0", "1e3", "6.02E+23"]));
        case "string": return T("2.10.4", pick(STRINGS));
        case "bool": return T("2.10.3", pick(["true", "false"]));
        case "null": return T("2.10.5", "null");
        case "enum": return T("2.10.6", pick(["RED", "on", "query", "Null"]));
        case "var": return T("2.11", "$", name());
        case "list": return T("2.10.7", "[", ...range(int(3)).map(() => value(depth + 1, isConst)), "]");
        default: return T("2.10.8", "{", ...range(int(3)).map(() => T("2.10.8", name(), ":", value(depth + 1, isConst))), "}");
      }
    })();
    return K("2.10", inner);
  };
  const args = (isConst) =>
    chance(0.3) ? T("2.7", "(", ...range(1 + int(2)).map(() => T("2.7", name(), ":", value(0, isConst))), ")") : [];
  const directives = (isConst) => range(chance(0.3) ? 1 + int(2) : 0).flatMap(() => T("2.13", "@", name(), args(isConst)));
  const type = (depth) => {
    const base = depth < 2 && chance(0.3) ? T("2.12", "[", type(depth + 1), "]") : T("2.12", pick(["Int", "T", "on"]));
    return chance(0.4) ? T("2.12", base, "!") : base;
  };
  const description = () => (chance(0.2) ? K("2.2", pick(STRINGS)) : []);
  // Never empty: an empty selection set is the edit of its own pairs, so
  // that an implementation which rejects one is told about §2.5 only.
  const selectionSet = (depth) => T("2.5", "{", ...range(1 + int(depth > 1 ? 1 : 3)).map(() => selection(depth)), "}");
  const selection = (depth) => {
    const k = int(10);
    if (k < 6) {
      return T(
        "2.6",
        chance(0.2) ? T("2.8", name(), ":") : [],
        name(),
        args(false),
        directives(false),
        depth < 3 && chance(0.4) ? selectionSet(depth + 1) : [],
      );
    }
    if (k < 8) return T("2.9", "...", pick(NOT_ON), directives(false));
    return T("2.9.2", "...", chance(0.6) ? T("2.9.1", "on", pick(["T", "on"])) : [], directives(false), selectionSet(depth + 1));
  };
  const variables = () =>
    chance(0.4)
      ? T(
          "2.11",
          "(",
          ...range(1 + int(2)).map(() =>
            T("2.11", description(), "$", name(), ":", K("2.12", type(0)), chance(0.3) ? T("2.11", "=", value(0, true)) : [], directives(true)),
          ),
          ")",
        )
      : [];
  const definition = () => {
    const k = int(10);
    if (k < 3) return T("2.4", selectionSet(0));
    if (k < 7) {
      return T("2.4", description(), pick(["query", "mutation", "subscription"]), chance(0.6) ? name() : [], variables(), directives(false), selectionSet(0));
    }
    return T("2.9", description(), "fragment", pick(NOT_ON), T("2.9.1", "on", pick(["T", "on"])), directives(false), selectionSet(0));
  };
  const tokens = T("2.3", ...range(1 + int(2)).map(() => definition()));
  tokens.forEach((t, i) => (t.sep = i === 0 ? "" : pick(SEPARATORS)));
  return { tokens, nodes };
};

const render = (tokens) => tokens.map((t, i) => (i === 0 ? "" : t.sep || " ") + t.text).join("");

// The production an edit of one token is about: the innermost one with more
// than one token, or a Value, Type or Description position. Deleting or
// replacing a whole one-token production is an edit of its parent.
const ownerOf = (doc, path) => {
  for (let i = path.length - 1; i >= 0; i--) {
    const n = doc.nodes[path[i]];
    if (n.keep || n.size > 1) return n.section;
  }
  return "2.3";
};
// The innermost production holding both tokens.
const commonOf = (doc, a, b) => {
  let i = 0;
  while (i < a.path.length && i < b.path.length && a.path[i] === b.path[i]) i++;
  return ownerOf(doc, a.path.slice(0, i));
};

// The differential's one-token mutations, with the section each is about.
const mutate = ({ int, pick }, doc) => {
  const tokens = doc.tokens.map((t) => ({ ...t }));
  const i = int(tokens.length);
  const insert = (at, text) => {
    tokens.splice(at, 0, { text, path: [], sep: at === 0 ? "" : " " });
    if (at === 0) tokens[1].sep = " ";
  };
  // The section of a token inserted before token j.
  const between = (j) => (j === 0 || j === doc.tokens.length ? "2.3" : commonOf(doc, doc.tokens[j - 1], doc.tokens[j]));
  switch (int(5)) {
    case 0: {
      const [gone] = tokens.splice(i, 1);
      if (tokens.length === 0) return null;
      if (i === 0) tokens[0].sep = "";
      return { tokens, section: ownerOf(doc, gone.path), kind: "delete", unit: gone.text };
    }
    case 1:
      insert(i + 1, tokens[i].text);
      return { tokens, section: between(i + 1), kind: "duplicate", unit: doc.tokens[i].text };
    case 2: {
      if (i + 1 >= tokens.length || tokens[i].text === tokens[i + 1].text) return null;
      [tokens[i].text, tokens[i + 1].text] = [tokens[i + 1].text, tokens[i].text];
      return { tokens, section: commonOf(doc, doc.tokens[i], doc.tokens[i + 1]), kind: "swap", unit: `${doc.tokens[i].text} ${doc.tokens[i + 1].text}` };
    }
    case 3: {
      const text = pick(TOKEN_POOL);
      insert(i, text);
      return { tokens, section: between(i), kind: "insert", unit: text };
    }
    default: {
      const text = pick(TOKEN_POOL);
      if (text === tokens[i].text) return null;
      const unit = `${tokens[i].text} -> ${text}`;
      tokens[i].text = text;
      return { tokens, section: ownerOf(doc, doc.tokens[i].path), kind: "replace", unit };
    }
  }
};

const DOCUMENTS = 3000;
const MUTATIONS = 3;
// Longer documents make pairs that are hard to read.
const MAX_TOKENS = 24;

const randomDocuments = () => {
  const rng = random(1);
  const out = [];
  while (out.length < DOCUMENTS) {
    const doc = randomDocument(rng);
    if (doc.tokens.length > MAX_TOKENS) continue;
    const base = render(doc.tokens);
    const mutants = new Map();
    for (let n = 0; n < MUTATIONS; n++) {
      const m = mutate(rng, doc);
      if (m) mutants.set(render(m.tokens), m);
    }
    mutants.delete(base);
    out.push({ base, mutants: [...mutants].map(([source, m]) => ({ source, ...m })) });
  }
  return out;
};

// ---------------------------------------------------------------------------
// The hand-written vectors in Lexer.tla and Parser.tla

// The sources in a block of a module: the TLA+ string literals matching
// pattern, with TLA+ escapes undone.
const block = (module, name) => {
  const text = readFileSync(join(root, "specs", module), "utf8");
  const match = text.match(new RegExp(`^${name} == <<\\n([\\s\\S]*?)\\n>>`, "m"));
  if (!match) throw new Error(`no ${name} in ${module}`);
  return match[1];
};
const literals = (text, pattern) =>
  [...text.matchAll(pattern)].map((m) => m[1].replace(/\\(.)/g, (_, c) => ({ n: "\n", t: "\t", r: "\r", f: "\f" })[c] ?? c));

// Lexer vectors of value tokens, placed as an argument value.
// Those that fail as a document for another reason are dropped below.
const lexerExamples = () =>
  [
    ["NumberVectors", "number"],
    ["StringVectors", "2.10.4"],
    ["BlockStringVectors", "2.10.4"],
  ].flatMap(([name, kind]) =>
    literals(block("Lexer.tla", name), /V\(Text\("((?:[^"\\]|\\.)*)"\),/g).map((text) => ({
      source: kind === "number" ? inList(text) : inValue(text),
      section: kind === "number" ? numberSection(text) : kind,
    })),
  );

// Parser vectors, with the section each is about: its group's, unless
// listed here.
const PARSER_GROUPS = { DocumentVectors: "2.3", SelectionVectors: "2.5", ValueVectors: "2.10", VariableVectors: "2.11" };
const PARSER_SECTIONS = {
  "{a}": "2.4", "query {a}": "2.4", "query Q {a} mutation M {b} subscription S {c}": "2.4",
  "query on {a} query query {a} fragment fragment on query {a}": "2.4",
  '"d" query {a}': "2.2", '"""\n  d\n""" fragment F on T {a}': "2.2", '"d" {a}': "2.2", '"d"': "2.2", '"d" "e" query {a}': "2.2",
  query: "2.4", "query Q": "2.4", "Query {a}": "2.4", "{a} query": "2.4",
  "{b: a}": "2.8", "{a: b: c}": "2.8", "{a:}": "2.8",
  "{a(x: 1) @d @e(y: 2) {b}}": "2.6", "{__typename a {b {c}}}": "2.6",
  "{a()}": "2.7", "{a(x)}": "2.7", "{a(x:)}": "2.7",
  "{a @}": "2.13", "{a @d()}": "2.13", "query @d(x: $v) {a}": "2.13",
  "{...F @d}": "2.9", "{...on}": "2.9", "{...F {a}}": "2.9", "fragment F on T @d {a}": "2.9", "fragment on on T {a}": "2.9",
  "fragment F on T": "2.9", "fragment F on T @d": "2.9", "fragment F($a: Int) on T {a}": "2.9",
  "{... on T {a}}": "2.9.2", "{... @d {a}}": "2.9.2", "{... {a}}": "2.9.2",
  "{... on on {a}}": "2.9.1", "{... on {a}}": "2.9.1", "{... on @d {a}}": "2.9.1", "fragment F on on {a}": "2.9.1", "fragment F T {a}": "2.9.1",
  "{a(x: true, y: null, z: TRUE, w: false)}": "2.10.3",
  '{a(x: [1, -2.5e3, "s", """b""", E, [], {}, {k: $v, l: [$w]}])}': "2.10.7", "{a(x: [)}": "2.10.7", "{a(x: [1)}": "2.10.7",
  "{a(x: [1 [2]], y: {k: {l: 1}})}": "2.10.8", "{a(x: {k: 1, k: 2}, x: 3)}": "2.10.8",
  "{a(x: {k})}": "2.10.8", "{a(x: {k: })}": "2.10.8", "{a(x: {1: 2})}": "2.10.8",
  "{a(x: 1 y: 2) b(x: [1,,2,])}": "2.1.4",
  "{a(x: $)}": "2.11", "{a(x: $1)}": "2.11", "{a(x: -)}": "2.10.1",
  "query ($a: Int, $b: [Int!]! = [1]) {a}": "2.12", "query ($a: Int!!) {a}": "2.12", "query ($a: [Int) {a}": "2.12",
  "query ($a: []) {a}": "2.12", "query ($ a: [[T]]) {a}": "2.12",
  'query ("d" $a: Int """e""" $b: Int) {a}': "2.2",
  "query ($a: Int) @d": "2.4", "{a": "2.5", "{a}}": "2.5", "{(a)}": "2.5",
};
const parserExamples = () =>
  Object.entries(PARSER_GROUPS).flatMap(([name, fallback]) =>
    literals(block("Parser.tla", name), /(?:Parses|Rejects)\("((?:[^"\\]|\\.)*)"/g).map((source) => ({
      source,
      section: PARSER_SECTIONS[source] ?? fallback,
    })),
  );

// ---------------------------------------------------------------------------
// Evaluating the reference

const codePoints = (s) => Array.from(s, (c) => c.codePointAt(0));
const text = (s) => `<<${codePoints(s).join(",")}>>`;

// For a lexical rejection, also the index where the failing token starts,
// found the way LexFrom scans. For a document, whether its tree has an
// empty selection set or a description.
const moduleFor = (sources) => `---- MODULE ParseVectors ----
EXTENDS Parser, TLC

Sources == <<${sources.map(text).join(",\n")}>>

RECURSIVE FailingToken(_, _)
FailingToken(src, i) ==
  IF i > Len(src) THEN 0
  ELSE IF IgnoredLength(src, i) > 0 THEN FailingToken(src, i + IgnoredLength(src, i))
  ELSE LET next == TokenAt(src, i) IN IF next.scan.ok THEN FailingToken(src, next.scan.end) ELSE i

RECURSIVE HasEmptySelectionSet(_)
HasEmptySelectionSet(n) ==
  \\/ n.kind = "SelectionSet" /\\ n.children = <<>>
  \\/ \\E k \\in DOMAIN n.children : HasEmptySelectionSet(n.children[k])

\\* The first child of these three is their Description.
RECURSIVE HasDescription(_)
HasDescription(n) ==
  \\/ n.kind \\in {"OperationDefinition", "FragmentDefinition", "VariableDefinition"} /\\ n.children[1] # NoNode
  \\/ \\E k \\in DOMAIN n.children : HasDescription(n.children[k])

ASSUME \\A i \\in DOMAIN Sources :
  LET lexed == Lex(Sources[i])
      parsed == ParseExecutable(Sources[i])
  IN PrintT(<<"verdict", i, parsed.ok, lexed.ok, lexed.pos,
              IF lexed.ok THEN 0 ELSE FailingToken(Sources[i], 1),
              parsed.ok /\\ HasEmptySelectionSet(parsed.node), parsed.ok /\\ HasDescription(parsed.node)>>)
ASSUME PrintT(<<"checked", Len(Sources)>>)

VectorsInit == vector = 0
====
`;

const runTla = (dir) =>
  new Promise((done) => {
    const child = spawn(process.execPath, [cli, "-workers", "1", "-config", "ParseVectors.cfg", "ParseVectors.tla"], { cwd: dir });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("close", (status) => done({ status, output }));
  });

// The reference's verdict on each source: { ok, lexOk, lexPos, failingToken }.
const evaluate = async (sources) => {
  const chunks = [];
  for (let i = 0; i < sources.length; i += CHUNK) chunks.push(sources.slice(i, i + CHUNK));
  const results = new Map();
  const base = mkdtempSync(join(tmpdir(), "parse-vectors-"));
  try {
    let next = 0;
    const lane = async () => {
      while (next < chunks.length) {
        const index = next++;
        const chunk = chunks[index];
        const dir = join(base, String(index));
        mkdirSync(dir);
        cpSync(join(root, "specs/Lexer.tla"), join(dir, "Lexer.tla"));
        cpSync(join(root, "specs/Parser.tla"), join(dir, "Parser.tla"));
        writeFileSync(join(dir, "ParseVectors.tla"), moduleFor(chunk));
        writeFileSync(join(dir, "ParseVectors.cfg"), "INIT VectorsInit\nNEXT Next\n");
        const { status, output } = await runTla(dir);
        // tla-ts wraps long values across lines.
        const flat = output.replace(/\s*\n\s*/g, " ");
        if (status !== 0 || !new RegExp(`<<\\s*"checked",\\s*${chunk.length}\\s*>>`).test(flat)) {
          const lines = output.split("\n").filter((l) => /Error|error|Exception/.test(l)).slice(0, 10);
          throw new Error(`tla-ts failed on chunk ${index}:\n${lines.map((l) => l.slice(0, 300)).join("\n")}`);
        }
        const verdicts = [
          ...flat.matchAll(/<<\s*"verdict",\s*(\d+),\s*(TRUE|FALSE),\s*(TRUE|FALSE),\s*(\d+),\s*(\d+),\s*(TRUE|FALSE),\s*(TRUE|FALSE)\s*>>/g),
        ];
        if (new Set(verdicts.map((m) => m[1])).size !== chunk.length) {
          throw new Error(`read ${verdicts.length} verdicts from chunk ${index}, which has ${chunk.length} sources`);
        }
        for (const [, i, ok, lexOk, lexPos, failing, empty, description] of verdicts) {
          results.set(chunk[Number(i) - 1], {
            ok: ok === "TRUE",
            lexOk: lexOk === "TRUE",
            lexPos: Number(lexPos),
            failingToken: Number(failing),
            newer: [...(empty === "TRUE" ? ["2.5"] : []), ...(description === "TRUE" ? ["2.2"] : [])],
          });
        }
      }
    };
    await Promise.all(range(Math.min(LANES, chunks.length)).map(lane));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  return results;
};

const isScalar = (c) => (c >= 0 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0x10ffff);
const isDigit = (c) => c >= 48 && c <= 57;

// The section of a lexical rejection, from where Lex fails: a code point
// that is not a SourceCharacter, or the token that starts at FailingToken.
const lexicalSection = (source, verdict) => {
  const cps = codePoints(source);
  if (!isScalar(cps[verdict.lexPos - 1] ?? 0)) return "2.1";
  const start = verdict.failingToken - 1;
  const c = cps[start];
  if (c === 34) return "2.10.4";
  if (isDigit(c) || c === 45) return numberSection(String.fromCodePoint(...cps.slice(start)));
  if (c === 46) return "2.1.7";
  return "2.1.5";
};

// ---------------------------------------------------------------------------
// Choosing vectors

// Picks items ({ key, section, size }) round-robin across sections, and
// within a section round-robin across keys, shortest first: at most perKey
// per key, perSection per section and cap in all.
const choose = (items, { perKey, perSection = Infinity, cap = Infinity }) => {
  const byKey = new Map();
  for (const item of [...items].sort((a, b) => bySize(a.size, b.size))) {
    if (!byKey.has(item.key)) byKey.set(item.key, []);
    byKey.get(item.key).push(item);
  }
  const bySection = new Map();
  for (const [key, list] of [...byKey].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    list.slice(0, perKey).forEach((item, rank) => {
      if (!bySection.has(item.section)) bySection.set(item.section, []);
      bySection.get(item.section).push({ ...item, rank, key });
    });
  }
  for (const list of bySection.values()) list.sort((a, b) => a.rank - b.rank || bySize(a.size, b.size));
  const sections = [...bySection.keys()].sort(byNumber);
  const out = [];
  for (let round = 0; out.length < cap; round++) {
    let any = false;
    for (const s of sections) {
      const list = bySection.get(s);
      if (round >= list.length || round >= perSection) continue;
      out.push(list[round]);
      any = true;
      if (out.length >= cap) break;
    }
    if (!any) break;
  }
  return out;
};

// One pair per rejected candidate of a word family: its accepted sibling one
// unit away, preferring a deletion, then a replacement, then an insertion.
// The edited unit is the one deleted, or the one the sibling has instead:
// the token the grammar wanted there.
const familyPairs = (family, verdicts) => {
  const key = (units) => units.join("\u0000");
  const byUnits = new Map(family.candidates.map((c) => [key(c.units), c]));
  const accepted = (units) => {
    const c = byUnits.get(key(units));
    return c && verdicts.get(c.source).ok ? c : undefined;
  };
  const pairs = [];
  for (const c of family.candidates) {
    const verdict = verdicts.get(c.source);
    if (verdict.ok || (family.lexical && verdict.lexOk)) continue;
    const u = c.units;
    let found;
    for (let i = 0; !found && i < u.length; i++) {
      const sibling = accepted([...u.slice(0, i), ...u.slice(i + 1)]);
      if (sibling) found = { sibling, kind: "delete", unit: u[i] };
    }
    for (let i = 0; !found && i < u.length; i++) {
      for (const a of family.atoms) {
        const sibling = a !== u[i] && accepted([...u.slice(0, i), a, ...u.slice(i + 1)]);
        if (sibling) {
          found = { sibling, kind: "replace", unit: a };
          break;
        }
      }
    }
    for (let i = 0; !found && i <= u.length; i++) {
      for (const a of family.atoms) {
        const sibling = accepted([...u.slice(0, i), a, ...u.slice(i)]);
        if (sibling) {
          found = { sibling, kind: "insert", unit: a };
          break;
        }
      }
    }
    if (!found) continue;
    const spec = [
      ...(family.lexical
        ? [lexicalSection(c.source, verdict)]
        : family.classify
          ? family.classify(c.source, verdict)
          : (family.tags?.(found.unit) ?? [family.fallback])),
      ...(family.also ?? []),
    ];
    pairs.push({
      rejected: c.source,
      accepted: found.sibling.source,
      spec,
      section: spec[0],
      key: `${spec[0]}|${found.kind}|${JSON.stringify(found.unit)}`,
      size: c.source,
    });
  }
  return pairs;
};

// Accepted candidates that are no one's sibling but show a unit in use:
// the shortest few for each unit.
const familyPositives = (family, verdicts) =>
  family.atoms.flatMap((unit) =>
    family.candidates
      .filter((c) => c.units.includes(unit) && verdicts.get(c.source).ok)
      .sort((a, b) => bySize(a.source, b.source))
      .map((c) => ({ source: c.source, spec: family.positive(c.units, unit) }))
      .filter((p) => p.spec)
      .slice(0, family.positives)
      .map((p) => ({ ...p, spec: [...p.spec, ...(family.also ?? [])] })),
  );

const build = async () => {
  const families = wordFamilies();
  const documents = randomDocuments();
  const lexer = lexerExamples();
  const parser = parserExamples();
  const sources = [
    ...new Set([
      ...lexer.map((e) => e.source),
      ...parser.map((e) => e.source),
      ...families.flatMap((f) => f.candidates.map((c) => c.source)),
      ...documents.flatMap((d) => [d.base, ...d.mutants.map((m) => m.source)]),
    ]),
  ];
  const started = Date.now();
  const verdicts = await evaluate(sources);
  console.log(`  evaluated ${sources.length} candidates with tla-ts in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  const vectors = new Map();
  const add = (source, family, spec) => {
    const ok = verdicts.get(source).ok;
    let v = vectors.get(source);
    if (!v) {
      v = { id: vectors.size + 1, spec: [], family, source, expected: { ok } };
      vectors.set(source, v);
    }
    for (const s of spec) if (!v.spec.includes(s)) v.spec.push(s);
    return v;
  };
  const addPair = (family, pair) => {
    const r = add(pair.rejected, family, pair.spec);
    const a = add(pair.accepted, family, pair.spec);
    if (r.expected.ok || !a.expected.ok) throw new Error(`not a pair: ${JSON.stringify(pair)}`);
    r.sibling ??= a.id;
    a.sibling ??= r.id;
  };

  // The spec's own examples first. A lexer example that the document
  // around it makes fail for another reason says nothing about its token.
  for (const e of lexer) {
    const v = verdicts.get(e.source);
    if (!v.ok && v.lexOk) continue;
    add(e.source, "lexer-examples", [e.section]);
  }
  for (const e of parser) add(e.source, "parser-examples", [e.section]);

  for (const family of families) {
    for (const pair of choose(familyPairs(family, verdicts), { perKey: family.perKey, cap: family.pairs })) addPair(family.name, pair);
    for (const p of familyPositives(family, verdicts)) add(p.source, family.name, p.spec);
  }

  const mutantPairs = [];
  const mutantPositives = [];
  for (const d of documents) {
    if (!verdicts.get(d.base).ok) continue;
    for (const m of d.mutants) {
      const item = { rejected: m.source, accepted: d.base, spec: [m.section], section: m.section, key: `${m.section}|${m.kind}|${JSON.stringify(m.unit)}`, size: m.source };
      (verdicts.get(m.source).ok ? mutantPositives : mutantPairs).push(item);
    }
  }
  for (const pair of choose(mutantPairs, { perKey: 2, perSection: 45 })) addPair("random-documents", pair);
  for (const p of choose(mutantPositives, { perKey: 1, perSection: 8 })) add(p.rejected, "random-documents", p.spec);

  // An accepted document with an empty selection set, or a description on
  // an operation, fragment or variable, uses grammar the draft added after
  // the October 2021 edition. An implementation that rejects it most likely
  // lacks that, whichever edit the vector was chosen for, so the vector
  // rests on that section first.
  const list = [...vectors.values()];
  for (const v of list) {
    const newer = verdicts.get(v.source).newer;
    if (newer.length > 0 && !newer.includes(v.spec[0])) v.spec = [...newer, ...v.spec.filter((s) => !newer.includes(s))];
    v.spec.forEach(section);
  }
  return list;
};

// ---------------------------------------------------------------------------

const serialize = (vectors) =>
  `{"source": "specs/Lexer.tla and specs/Parser.tla (ParseExecutable), evaluated by tla-ts; scripts/generate-vectors-parse.mjs",\n"vectors": [\n${vectors
    .map((v) => JSON.stringify(v))
    .join(",\n")}\n]}\n`;

const started = Date.now();
const vectors = await build();
const out = serialize(vectors);
const accepted = vectors.filter((v) => v.expected.ok).length;
const paired = vectors.filter((v) => v.sibling).length;
console.log(`  ${vectors.length} vectors: ${accepted} accepted, ${vectors.length - accepted} rejected, ${paired} in minimal pairs`);
const bySection = new Map();
for (const v of vectors) bySection.set(v.spec[0], (bySection.get(v.spec[0]) ?? 0) + 1);
console.log(`  by section: ${[...bySection].sort((a, b) => byNumber(a[0], b[0])).map(([s, n]) => `${s} ${n}`).join(", ")}`);

if (CHECK) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== out) {
    console.log(`✗ kit/parse/vectors.json is out of date: run node scripts/generate-vectors-parse.mjs`);
    process.exit(1);
  }
  console.log(`✓ kit/parse/vectors.json matches the reference (${((Date.now() - started) / 1000).toFixed(1)}s)`);
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, out);
  console.log(`  wrote kit/parse/vectors.json (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}
