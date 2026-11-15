// The schema area (docs/kit/schema.md): is an SDL schema valid, per the
// type system rules of §3? The vectors are minimal pairs judged by
// TypeSystem!Verdict (scripts/generate-vectors-schema.mjs), so a wrong
// answer names the rule: an accepted invalid schema means the rule isn't
// enforced, a rejected valid sibling means it's over-strict.
//
// A crash is a third kind of failure. The kit can only see one when the
// adapter answers a vector with an `error` message instead of a result:
// an implementation that throws inside schema building, and whose adapter
// reports that as an error, crashes. An adapter that turns every exception
// into `valid: false` hides its crashes as rejections, which pass on
// invalid schemas and look over-strict on valid ones.
//
// Vectors marked `unspecified` rest on a reading the spec's formal text
// doesn't settle. They aren't sent to the adapter or graded.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AdapterError, ask } from "../areas.mjs";
import { REPORT_FORMAT, provenance, section } from "../report.mjs";
import { RULE, RULES, UNWRITABLE } from "./rules.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");

export const loadVectors = () => JSON.parse(readFileSync(join(root, "kit/schema/vectors.json"), "utf8")).vectors;

// The vectors an adapter is graded on, and how many are left out and why.
export const gradedVectors = (vectors) => {
  const graded = vectors.filter((v) => !v.unspecified);
  const skipped = vectors.length > graded.length ? { unspecified: vectors.length - graded.length } : {};
  return { graded, skipped };
};

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// An adapter's `error` answer to a vector: its message's first line, so
// that a stack trace with local paths doesn't reach the report.
export class Crash {
  constructor(message) {
    this.message = String(message).split("\n")[0].trim().slice(0, 200);
  }
}

// The adapter's answer to one vector, or a Crash. Any other failure, such
// as a silent adapter, still stops the run.
const answer = async (adapter, sdl) => {
  try {
    return await ask(adapter, "schema", { sdl });
  } catch (error) {
    if (!(error instanceof AdapterError)) throw error;
    return new Crash(error.adapterMessage);
  }
};

// What one answer says about one vector: "pass", "malformed", "crash", or
// the way it fails its rule.
export const judge = (vector, answer) => {
  if (answer instanceof Crash) return "crash";
  if (answer === null || typeof answer !== "object" || typeof answer.valid !== "boolean") return "malformed";
  if (answer.valid === vector.expected.valid) return "pass";
  return vector.expected.valid ? "over-strict" : "not enforced";
};

const SUMMARY = {
  "not enforced": (r) => `${r.rule} not enforced: accepts a schema that breaks only this rule`,
  "over-strict": (r) => `${r.rule} over-strict: rejects a valid schema one small edit away from one that breaks it`,
  "crash valid": (r) => `${r.rule}: crashes on a valid schema one small edit away from one that breaks it, instead of accepting it`,
  "crash invalid": (r) => `${r.rule}: crashes on a schema that breaks only this rule, instead of rejecting it`,
};

// The checker's self-test: deliberately wrong answers it must flag, and
// the reference's own answers, which it must pass.
const selfTest = (vectors) => {
  const problems = [];
  let controls = 0;
  if (vectors.some((v) => v.unspecified)) problems.push("an unspecified vector is graded");
  vectors.forEach((v, i) => {
    controls++;
    if (judge(v, { valid: !v.expected.valid }) === "pass") problems.push(`a flipped verdict for ${v.id} passed`);
    const other = vectors[(i + 1) % vectors.length];
    if (other.expected.valid !== v.expected.valid) {
      controls++;
      if (judge(v, other.expected) === "pass") problems.push(`${other.id}'s answer for ${v.id} passed`);
    }
    if (judge(v, v.expected) !== "pass") problems.push(`the reference's own answer for ${v.id} failed`);
  });
  controls++;
  if (judge(vectors[0], { valid: "yes" }) !== "malformed") problems.push("an answer without a boolean `valid` wasn't flagged");
  // A crash fails a valid and an invalid schema alike, whatever else the
  // answer says.
  for (const v of [vectors.find((x) => x.expected.valid), vectors.find((x) => !x.expected.valid)]) {
    controls++;
    const crash = Object.assign(new Crash("RangeError: Maximum call stack size exceeded"), { valid: v.expected.valid });
    if (judge(v, crash) !== "crash") problems.push(`a crash on ${v.id} wasn't flagged as a crash`);
  }
  return { problems, controls };
};

export const buildReport = ({ vectors, answers, strict, implementation, capabilities, selfTestText, total = vectors.length, skipped = {} }) => {
  const stats = new Map(RULES.map((r) => [r.rule, { cases: 0, failing: 0, failingDraftOnly: 0 }]));
  const findings = new Map();
  let malformed = 0;
  vectors.forEach((v, i) => {
    const verdict = judge(v, answers[i]);
    if (verdict === "malformed") {
      malformed++;
      const key = "malformed";
      const f = findings.get(key) ?? {
        checks: [],
        kind: "malformed",
        summary: "the adapter's answer has no boolean `valid`",
        cases: 0,
        fixtures: {},
        fixture: v.id,
        example: { input: v.sdl, response: answers[i], expected: "{ valid: boolean }" },
      };
      f.cases++;
      f.fixtures[v.family] = (f.fixtures[v.family] ?? 0) + 1;
      findings.set(key, f);
      return;
    }
    const s = stats.get(v.rule);
    s.cases++;
    if (verdict === "pass") return;
    s.failing++;
    if (v.edition === "draft") s.failingDraftOnly++;
    const r = RULE.get(v.rule);
    const kind = verdict === "crash" ? `crash ${v.expected.valid ? "valid" : "invalid"}` : verdict;
    const key = `${v.rule}\u0000${kind}`;
    const crash = answers[i] instanceof Crash;
    const example = {
      input: `${v.edition === "draft" ? "[draft] " : ""}${v.sdl}`,
      response: crash ? `the adapter answered with an error: ${answers[i].message}` : answers[i],
      expected: v.expected.valid ? "valid (TypeSystem!Verdict is empty)" : `invalid: breaks ${v.rule} and no other rule`,
    };
    const f = findings.get(key) ?? {
      checks: [r.id],
      kind: verdict,
      summary: SUMMARY[kind](r),
      cases: 0,
      fixtures: {},
      fixture: v.id,
      ...(crash ? { problem: answers[i].message } : {}),
      example,
      draftOnly: 0,
      length: v.sdl.length,
    };
    f.cases++;
    f.fixtures[v.family] = (f.fixtures[v.family] ?? 0) + 1;
    if (v.edition === "draft") f.draftOnly++;
    if (v.sdl.length < f.length) Object.assign(f, { fixture: v.id, example, length: v.sdl.length, ...(crash ? { problem: answers[i].message } : {}) });
    findings.set(key, f);
  });
  // How many of a finding's vectors rest on draft-only rules or syntax. A
  // finding with nothing else is tagged as draft only.
  for (const f of findings.values()) {
    delete f.length;
    if (f.draftOnly === f.cases) f.edition = "draft";
    if (f.draftOnly === 0) delete f.draftOnly;
  }
  return {
    format: REPORT_FORMAT,
    area: "schema",
    implementation,
    capabilities: [...capabilities].sort(),
    provenance: provenance({ strict, vectors: total, graded: vectors.length, skipped }),
    checkerSelfTest: selfTestText,
    cases: { submitted: vectors.length, distinct: vectors.length, malformed },
    adapterProblems: malformed,
    draftOnly: {
      vectors: vectors.filter((v) => v.edition === "draft").length,
      failing: vectors.filter((v, i) => v.edition === "draft" && !["pass", "malformed"].includes(judge(v, answers[i]))).length,
    },
    checks: RULES.map((r) => {
      const s = stats.get(r.rule);
      return {
        id: r.id,
        title: r.title,
        level: r.level,
        spec: r.spec.map(section),
        status: s.failing > 0 ? "fail" : s.cases > 0 ? "pass" : "untested",
        cases: s.cases,
        failing: s.failing,
        failingDraftOnly: s.failingDraftOnly,
        ...(r.edition ? { edition: r.edition, note: `Draft only: the October 2021 edition doesn't have ${r.draft}.` } : {}),
        ...(UNWRITABLE[r.rule] ? { note: UNWRITABLE[r.rule] } : {}),
      };
    }),
    findings: [...findings.values()].sort((a, b) => b.cases - a.cases),
    fixtures: [],
  };
};

export const run = async ({ adapter, strict, log = console.log }) => {
  const all = loadVectors();
  const { graded: vectors, skipped } = gradedVectors(all);
  const answers = [];
  for (const v of vectors) answers.push(await answer(adapter, v.sdl));

  const test = selfTest(vectors);
  for (const p of test.problems) log(`✗ self-test: ${p}`);
  const selfTestText = test.problems.length === 0 ? `passed (${test.controls} negative controls)` : "failed";
  const report = buildReport({
    vectors,
    answers,
    strict,
    implementation: adapter.name,
    capabilities: adapter.capabilities,
    selfTestText,
    total: all.length,
    skipped,
  });

  const failingChecks = report.checks.filter((c) => c.status === "fail");
  const passed = vectors.length - report.findings.reduce((n, f) => n + f.cases, 0);
  const crashes = answers.filter((a) => a instanceof Crash).length;
  const notGraded = skipped.unspecified ? `; ${skipped.unspecified} unspecified not graded` : "";
  log(`${passed === vectors.length ? "✓" : "✗"} ${passed} of ${vectors.length} schemas judged as TypeSystem.tla judges them${crashes ? ` (${crashes} crashed)` : ""}${notGraded}`);
  const draft = (f) => (f.draftOnly ? `, ${f.draftOnly === f.cases ? "all" : f.draftOnly} draft only` : "");
  for (const f of report.findings) log(`  ✗ ${f.summary} (${plural(f.cases, "schema")}${draft(f)}, e.g. ${f.fixture}: ${f.example.input})`);
  const tested = report.checks.filter((c) => c.status !== "untested").length;
  log(`  ${tested - failingChecks.length} of ${tested} rules pass; ${report.checks.length - tested} untested`);
  if (test.problems.length === 0) log(`✓ the checker catches all ${test.controls} negative controls`);
  // Every rule is a MUST.
  const ok = test.problems.length === 0 && report.adapterProblems === 0 && failingChecks.length === 0;
  return { ok, report };
};
