// The parse area (docs/kit/parse.md): asks the adapter whether each source
// text in vectors.json is a syntactically valid executable document, and
// compares its answers with the reference's, which
// scripts/generate-vectors-parse.mjs took from specs/Parser.tla.
//
// Each vector's first spec section is the rule its verdict rests on: for a
// minimal pair, the section of the one edit between the two sources. A
// wrong answer counts against that section's check, and toward one finding:
// "accepts what §X rejects" or "rejects what §X accepts".
//
// A vector whose verdict differs under the October 2021 edition carries
// `edition: "draft"`. Findings count their draft-only vectors, and so does
// the report.
//
// A crash is a third kind of failure: the adapter answered a vector with an
// `error` (docs/kit-areas.md, "Protocol"). It fails the vector's check,
// whatever the vector's verdict, since the implementation gave none, and
// counts toward its own finding: "crashes on a source §X accepts" or
// "rejects". It is never counted as an agreement. Nor is it ever draft
// only: every source is an input the parser must answer, in either edition,
// so a crash fails in both, even on a vector whose verdict is draft only.
//
// An adapter whose transport can't carry a lone surrogate (a JSON parser
// that refuses one) answers { unsupported: "why" } for a source that holds
// one. The vector is then not graded. An `unsupported` answer for any other
// source is a crash: the adapter could have asked the implementation. A run
// that grades no vector at all isn't ok.

import { readFileSync } from "node:fs";
import { Crash, answerOrCrash, crashResponse } from "../areas.mjs";
import { REPORT_FORMAT, provenance, section } from "../report.mjs";

// One check per section of the grammar of executable documents. Every one
// is a MUST: "The lexical token sequence, omitting Ignored, must be
// described by a single Document syntactic grammar."
export const CHECKS = [
  ["2.1", "sourceText", "Source text is a sequence of SourceCharacter"],
  ["2.1.1", "whiteSpace", "White space is tab and space only"],
  ["2.1.2", "lineTerminators", "Line terminators are LF, CR and CR LF only"],
  ["2.1.3", "comments", "A comment runs to the end of its line"],
  ["2.1.4", "insignificantCommas", "Commas are insignificant"],
  ["2.1.5", "lexicalTokens", "Every character outside ignored tokens is part of a token"],
  ["2.1.6", "ignoredTokens", "Ignored tokens may appear before and after every token"],
  ["2.1.7", "punctuators", "Punctuators, and `...` only as a whole"],
  ["2.1.8", "names", "Names"],
  ["2.2", "descriptions", "Descriptions on operations, fragments and variables, not on the query shorthand"],
  ["2.3", "document", "A document is one or more executable definitions"],
  ["2.4", "operations", "Operation definitions and the query shorthand"],
  ["2.5", "selectionSets", "Selection sets, including empty ones"],
  ["2.6", "fields", "Fields"],
  ["2.7", "arguments", "Arguments"],
  ["2.8", "fieldAlias", "Field aliases"],
  ["2.9", "fragments", "Fragment definitions and fragment spreads"],
  ["2.9.1", "typeConditions", "Type conditions"],
  ["2.9.2", "inlineFragments", "Inline fragments"],
  ["2.10", "inputValues", "Input values, and no variables in constant values"],
  ["2.10.1", "intValue", "Int values"],
  ["2.10.2", "floatValue", "Float values"],
  ["2.10.3", "booleanValue", "Boolean values"],
  ["2.10.4", "stringValue", "String values and block strings"],
  ["2.10.5", "nullValue", "Null value"],
  ["2.10.6", "enumValue", "Enum values"],
  ["2.10.7", "listValue", "List values"],
  ["2.10.8", "inputObjectValues", "Input object values"],
  ["2.11", "variables", "Variables and variable definitions"],
  ["2.12", "typeReferences", "Type references"],
  ["2.13", "directives", "Directives"],
].map(([number, id, title]) => ({ number, id, title, level: "MUST" }));

const byNumber = new Map(CHECKS.map((c) => [c.number, c]));

export const loadVectors = () => {
  const { vectors } = JSON.parse(readFileSync(new URL("./vectors.json", import.meta.url), "utf8"));
  const ids = new Set();
  for (const v of vectors) {
    if (ids.has(v.id)) throw new Error(`vectors.json: vector ${v.id} appears twice`);
    ids.add(v.id);
    if (typeof v.source !== "string" || typeof v.expected?.ok !== "boolean") throw new Error(`vectors.json: vector ${v.id} is malformed`);
    const unknown = v.spec.filter((s) => !byNumber.has(s));
    if (v.spec.length === 0 || unknown.length > 0) throw new Error(`vectors.json: vector ${v.id} cites no check for ${unknown.join(", ") || "any section"}`);
  }
  return vectors;
};

// Whether a source holds a surrogate code unit that isn't half of a pair.
export const hasLoneSurrogate = (source) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(source);

// Sorts the adapter's raw answers: an `unsupported` answer leaves its vector
// ungraded if the source holds a lone surrogate, and is a crash otherwise.
export const sortAnswers = (all, raw) => {
  const vectors = [];
  const answers = [];
  const unsupported = [];
  all.forEach((v, i) => {
    const answer = raw[i];
    if (!(answer instanceof Crash) && typeof answer?.unsupported === "string") {
      if (hasLoneSurrogate(v.source)) {
        unsupported.push({ id: v.id, reason: answer.unsupported });
        return;
      }
      vectors.push(v);
      answers.push(new Crash(`answered unsupported for a source without a lone surrogate: ${answer.unsupported}`));
      return;
    }
    vectors.push(v);
    answers.push(answer);
  });
  return { vectors, answers, unsupported };
};

const quote = (source) => JSON.stringify(source);
const shorter = (a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

// Compares answers with the vectors. answers[i] is the adapter's result
// for vectors[i]: { ok } and anything else it sent, or a Crash.
export const judge = (vectors, answers) => {
  const byId = new Map(vectors.map((v) => [v.id, v]));
  const stats = new Map(CHECKS.map((c) => [c.number, { cases: 0, failing: 0, failingDraftOnly: 0 }]));
  const findings = new Map();
  const failed = [];
  const crashed = [];
  const malformed = [];
  const found = (key, vector, finding) => {
    const f = findings.get(key) ?? { ...finding, cases: 0, fixtures: {}, draftOnly: 0 };
    f.cases++;
    f.fixtures[vector.family] = (f.fixtures[vector.family] ?? 0) + 1;
    // A crash fails in every edition (see the top of this file).
    const draftOnly = vector.edition === "draft" && key !== "malformed" && finding.kind !== "crash";
    if (draftOnly) f.draftOnly++;
    if (!f.shortest || shorter(vector.source, f.shortest) < 0) {
      const sibling = byId.get(vector.sibling);
      f.shortest = vector.source;
      f.fixture = vector.family;
      if (finding.kind === "crash") f.problem = finding.problem;
      f.example = {
        input: `${draftOnly ? "[draft] " : ""}${quote(vector.source)}`,
        response: finding.response,
        expected: JSON.stringify(vector.expected),
        ...(sibling ? { sibling: `${quote(sibling.source)}, which the reference ${sibling.expected.ok ? "accepts" : "rejects"}` } : {}),
      };
    }
    findings.set(key, f);
  };
  vectors.forEach((v, i) => {
    const answer = answers[i];
    for (const s of v.spec) stats.get(s).cases++;
    if (answer instanceof Crash) {
      crashed.push(i);
      const check = byNumber.get(v.spec[0]);
      stats.get(check.number).failing++;
      const s = section(check.number);
      found(`crash\u0000${check.number}\u0000${v.expected.ok}`, v, {
        checks: [check.id],
        kind: "crash",
        summary: v.expected.ok
          ? `crashes on a source §${s.number} ${s.title} accepts, instead of accepting it`
          : `crashes on a source §${s.number} ${s.title} rejects, instead of rejecting it`,
        response: crashResponse(answer),
        problem: answer.message,
      });
      return;
    }
    if (typeof answer?.ok !== "boolean") {
      malformed.push(i);
      found("malformed", v, {
        checks: [],
        summary: "results without a boolean ok",
        problem: `the result has no boolean \`ok\`: ${JSON.stringify(answer)}`,
        response: answer,
      });
      return;
    }
    if (answer.ok === v.expected.ok) return;
    failed.push(i);
    const check = byNumber.get(v.spec[0]);
    stats.get(check.number).failing++;
    if (v.edition === "draft") stats.get(check.number).failingDraftOnly++;
    const s = section(check.number);
    found(`${check.number}\u0000${v.expected.ok}`, v, {
      checks: [check.id],
      summary: v.expected.ok ? `rejects what §${s.number} ${s.title} accepts` : `accepts what §${s.number} ${s.title} rejects`,
      response: answer,
    });
  });
  // A finding whose vectors are all draft only is tagged as such.
  for (const f of findings.values()) {
    if (f.draftOnly === f.cases) f.edition = "draft";
    if (f.draftOnly === 0) delete f.draftOnly;
  }
  return {
    failed,
    crashed,
    malformed,
    stats,
    findings: [...findings.values()].sort((a, b) => b.cases - a.cases).map(({ shortest: _, response: __, ...f }) => f),
  };
};

// Grades the raw answers to every vector: the judged result, the checks, and
// whether the run is ok. A run that graded nothing is never ok.
export const grade = (all, raw) => {
  const { vectors, answers, unsupported } = sortAnswers(all, raw);
  const result = judge(vectors, answers);
  const checks = CHECKS.map((c) => {
    const s = result.stats.get(c.number);
    return {
      id: c.id,
      title: c.title,
      level: c.level,
      spec: [section(c.number)],
      status: s.failing > 0 ? "fail" : s.cases > 0 ? "pass" : "untested",
      cases: s.cases,
      failing: s.failing,
      failingDraftOnly: s.failingDraftOnly,
    };
  });
  // Every check is a MUST, so --strict changes nothing here.
  const ok = vectors.length > 0 && checks.every((c) => c.status !== "fail") && result.malformed.length === 0;
  return { vectors, unsupported, result, checks, ok };
};

// The self-test: deliberately wrong answers, which the checker must flag,
// and the reference's own answers, which it must not.
export const selfTest = (vectors) => {
  const problems = [];
  const n = vectors.length;
  const right = judge(vectors, vectors.map((v) => ({ ok: v.expected.ok })));
  if (right.failed.length || right.malformed.length) problems.push(`flags ${right.failed.length + right.malformed.length} of the reference's own answers`);
  const flipped = judge(vectors, vectors.map((v) => ({ ok: !v.expected.ok })));
  if (flipped.failed.length !== n) problems.push(`flags ${flipped.failed.length} of ${n} flipped verdicts`);
  const primaries = new Set(vectors.map((v) => v.spec[0]));
  const quiet = [...primaries].filter((s) => flipped.stats.get(s).failing === 0);
  if (quiet.length) problems.push(`with every verdict flipped, ${quiet.map((s) => `§${s}`).join(", ")} still pass`);
  // Each vector answered with the next one's verdict.
  const differ = vectors.filter((v, i) => v.expected.ok !== vectors[(i + 1) % n].expected.ok).length;
  const shifted = judge(vectors, vectors.map((_, i) => ({ ok: vectors[(i + 1) % n].expected.ok })));
  if (differ === 0 || shifted.failed.length !== differ) problems.push(`flags ${shifted.failed.length} of ${differ} answers taken from the next vector`);
  const empty = judge(vectors, vectors.map(() => ({})));
  if (empty.malformed.length !== n) problems.push(`counts ${empty.malformed.length} of ${n} results without \`ok\` as malformed`);
  // Every vector crashed, though each crash carries the right verdict: all
  // are crashes, none agrees, and every section a verdict rests on fails.
  const crash = judge(vectors, vectors.map((v) => Object.assign(new Crash("NullPointerException"), { ok: v.expected.ok })));
  if (crash.crashed.length !== n || crash.failed.length || crash.malformed.length) problems.push(`counts ${crash.crashed.length} of ${n} crashes as crashes`);
  const spared = [...primaries].filter((s) => crash.stats.get(s).failing === 0);
  if (spared.length) problems.push(`with every vector crashed, ${spared.map((s) => `§${s}`).join(", ")} still pass`);
  if (crash.findings.some((f) => f.kind !== "crash")) problems.push("a crash counts toward a finding that isn't a crash");
  // ... and none of those crashes is draft only, though some vectors are.
  const draftCrashes = [...crash.stats.values()].reduce((n, s) => n + s.failingDraftOnly, 0);
  if (!vectors.some((v) => v.edition === "draft") || draftCrashes > 0 || crash.findings.some((f) => f.draftOnly || f.edition === "draft" || f.example.input.startsWith("[draft]"))) {
    problems.push(`with every vector crashed, ${draftCrashes} crashes count as draft only`);
  }
  // Every vector answered `unsupported`: only those whose source holds a
  // lone surrogate go ungraded, every other one is a crash, and the run
  // fails. With nothing but those vectors, nothing is graded, and the run
  // fails too.
  const lone = vectors.filter((v) => hasLoneSurrogate(v.source));
  const refused = grade(vectors, vectors.map(() => ({ unsupported: "lone surrogate: control" })));
  if (lone.length === 0 || refused.unsupported.length !== lone.length || refused.result.crashed.length !== n - lone.length || refused.ok) {
    problems.push(`with every vector answered unsupported, ${refused.unsupported.length} of ${lone.length} sources with a lone surrogate go ungraded and ${refused.result.crashed.length} of ${n - lone.length} others crash`);
  }
  if (grade(lone, lone.map(() => ({ unsupported: "lone surrogate: control" }))).ok) problems.push("a run that grades no vector passes");
  return { problems, controls: 7 };
};

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const run = async ({ adapter, strict, log }) => {
  const all = loadVectors();
  const started = Date.now();
  const raw = [];
  for (const v of all) raw.push(await answerOrCrash(adapter, "parse", { source: v.source }));
  const { vectors, unsupported, result, checks, ok: passed } = grade(all, raw);
  if (unsupported.length) log(`- ${plural(unsupported.length, "vector")} not graded: the source holds a lone surrogate, which the adapter couldn't receive (${unsupported[0].reason})`);
  if (vectors.length === 0) log("✗ no vector was graded");
  const test = selfTest(all);

  const draft = (f) => (f.draftOnly ? ` (${f.draftOnly === f.cases ? "all" : f.draftOnly} draft only)` : "");
  for (const f of result.findings) {
    log(`✗ ${f.summary}: ${plural(f.cases, "vector")}${draft(f)}, such as ${f.example.input} (answered ${JSON.stringify(f.example.response)})`);
  }
  const agree = vectors.length - result.failed.length - result.crashed.length - result.malformed.length;
  const crashes = result.crashed.length ? `; ${result.crashed.length} crashed` : "";
  log(`${agree === vectors.length ? "✓" : "✗"} ${agree} of ${vectors.length} vectors agree with the reference${crashes} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  for (const p of test.problems) log(`✗ checker self-test: ${p}`);
  if (test.problems.length === 0) log(`✓ the checker catches all ${test.controls} negative controls`);

  const report = {
    format: REPORT_FORMAT,
    area: "parse",
    implementation: adapter.name,
    capabilities: [...adapter.capabilities].sort(),
    provenance: provenance({
      strict,
      vectors: all.length,
      ...(unsupported.length ? { graded: vectors.length, skipped: { "unsupported by the adapter": unsupported.length } } : {}),
    }),
    checkerSelfTest: test.problems.length === 0 ? `passed (${test.controls} negative controls)` : "failed",
    cases: { submitted: vectors.length, distinct: new Set(vectors.map((v) => v.source)).size, malformed: result.malformed.length },
    adapterProblems: result.malformed.length,
    draftOnly: {
      vectors: vectors.filter((v) => v.edition === "draft").length,
      // Crashes fail in every edition, so they never count here.
      failing: result.failed.filter((i) => vectors[i].edition === "draft").length,
    },
    checks,
    findings: result.findings,
    fixtures: [],
  };
  const ok = passed && test.problems.length === 0;
  return { ok, report };
};
