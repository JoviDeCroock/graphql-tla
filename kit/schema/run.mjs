// The schema area (docs/kit/schema.md): is an SDL schema valid, per the
// type system rules of §3? The vectors are minimal pairs judged by
// TypeSystem!Verdict (scripts/generate-vectors-schema.mjs), so a wrong
// answer names the rule: an accepted invalid schema means the rule isn't
// enforced, a rejected valid sibling means it's over-strict.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ask } from "../areas.mjs";
import { REPORT_FORMAT, provenance, section } from "../report.mjs";
import { RULE, RULES, UNWRITABLE } from "./rules.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");

export const loadVectors = () => JSON.parse(readFileSync(join(root, "kit/schema/vectors.json"), "utf8")).vectors;

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// What one answer says about one vector: "pass", "malformed", or the way
// it fails its rule.
export const judge = (vector, answer) => {
  if (answer === null || typeof answer !== "object" || typeof answer.valid !== "boolean") return "malformed";
  if (answer.valid === vector.expected.valid) return "pass";
  return vector.expected.valid ? "over-strict" : "not enforced";
};

const SUMMARY = {
  "not enforced": (r) => `${r.rule} not enforced: accepts a schema that breaks only this rule`,
  "over-strict": (r) => `${r.rule} over-strict: rejects a valid schema one small edit away from one that breaks it`,
};

// The checker's self-test: deliberately wrong answers it must flag, and
// the reference's own answers, which it must pass.
const selfTest = (vectors) => {
  const problems = [];
  let controls = 0;
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
  return { problems, controls };
};

export const buildReport = ({ vectors, answers, strict, implementation, capabilities, selfTestText }) => {
  const stats = new Map(RULES.map((r) => [r.rule, { cases: 0, failing: 0 }]));
  const findings = new Map();
  let malformed = 0;
  vectors.forEach((v, i) => {
    const verdict = judge(v, answers[i]);
    if (verdict === "malformed") {
      malformed++;
      const key = "malformed";
      const f = findings.get(key) ?? {
        checks: [],
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
    const r = RULE.get(v.rule);
    const key = `${v.rule}\u0000${verdict}`;
    const example = {
      input: v.sdl,
      response: answers[i],
      expected: v.expected.valid ? "valid (TypeSystem!Verdict is empty)" : `invalid: breaks ${v.rule} and no other rule`,
    };
    const f = findings.get(key) ?? { checks: [r.id], summary: SUMMARY[verdict](r), cases: 0, fixtures: {}, fixture: v.id, example };
    f.cases++;
    f.fixtures[v.family] = (f.fixtures[v.family] ?? 0) + 1;
    if (v.sdl.length < f.example.input.length) Object.assign(f, { fixture: v.id, example });
    findings.set(key, f);
  });
  return {
    format: REPORT_FORMAT,
    area: "schema",
    implementation,
    capabilities: [...capabilities].sort(),
    provenance: provenance({ strict, vectors: vectors.length }),
    checkerSelfTest: selfTestText,
    cases: { submitted: vectors.length, distinct: vectors.length, malformed },
    adapterProblems: malformed,
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
        ...(UNWRITABLE[r.rule] ? { note: UNWRITABLE[r.rule] } : {}),
      };
    }),
    findings: [...findings.values()].sort((a, b) => b.cases - a.cases),
    fixtures: [],
  };
};

export const run = async ({ adapter, strict, log = console.log }) => {
  const vectors = loadVectors();
  const answers = [];
  for (const v of vectors) answers.push(await ask(adapter, "schema", { sdl: v.sdl }));

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
  });

  const failingChecks = report.checks.filter((c) => c.status === "fail");
  const passed = vectors.length - report.findings.reduce((n, f) => n + f.cases, 0);
  log(`${passed === vectors.length ? "✓" : "✗"} ${passed} of ${vectors.length} schemas judged as TypeSystem.tla judges them`);
  for (const f of report.findings) log(`  ✗ ${f.summary} (${plural(f.cases, "schema")}, e.g. ${f.fixture}: ${f.example.input})`);
  const tested = report.checks.filter((c) => c.status !== "untested").length;
  log(`  ${tested - failingChecks.length} of ${tested} rules pass; ${report.checks.length - tested} untested`);
  if (test.problems.length === 0) log(`✓ the checker catches all ${test.controls} negative controls`);
  // Every rule is a MUST.
  const ok = test.problems.length === 0 && report.adapterProblems === 0 && failingChecks.length === 0;
  return { ok, report };
};
