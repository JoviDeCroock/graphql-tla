// Checking an implementation's validation answers against the vectors
// (docs/kit/validate.md). The expected answers come from Validation.tla,
// evaluated once by scripts/generate-vectors-validate.mjs, so checking is
// a comparison per vector:
//
//   - accepting an invalid vector means the rules it breaks (one, or one
//     with the rule that subsumes it) aren't enforced;
//   - rejecting a valid vector means its rule is over-strict: the vector is
//     one edit away from a document that breaks only that rule, or is the
//     spec's own example of a document valid under it.
//
// The same comparison runs on deliberately wrong answers (the self-test),
// which it must reject, so a passing run can't be vacuous.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPORT_FORMAT, provenance, section } from "../report.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");

export const loadVectors = () => JSON.parse(readFileSync(join(root, "kit/validate/vectors.json"), "utf8"));

// A check per rule: "FieldSelectionMerging" is checked as
// "fieldSelectionMerging", titled and cited by its section.
export const checkId = (rule) => rule[0].toLowerCase() + rule.slice(1);

const brokenRules = (vector) => Object.keys(vector.violations ?? {}).sort();

// The verdict on one answer: "pass", "malformed", "not-enforced" or
// "over-strict", and the rules it bears on.
export const verdict = (vector, answer) => {
  if (answer === null || typeof answer !== "object" || typeof answer.valid !== "boolean") {
    return { status: "malformed", rules: [] };
  }
  const rules = vector.expected.valid ? [vector.rule] : brokenRules(vector);
  if (answer.valid === vector.expected.valid) return { status: "pass", rules };
  return { status: vector.expected.valid ? "over-strict" : "not-enforced", rules };
};

export const judge = (vectors, answers) => vectors.map((vector, i) => ({ vector, answer: answers[i], ...verdict(vector, answers[i]) }));

const oneLine = (text) => text.replace(/\s+/g, " ").trim();
const cite = (rule, rules) => `§${rules[rule]} ${section(rules[rule]).title}`;

// The report: the facts behind a conformance sheet (docs/kit-areas.md).
export const buildReport = ({ data, judged, strict, selfTest, controls, implementation, capabilities }) => {
  const { rules } = data;
  const stats = new Map(Object.keys(rules).map((r) => [r, { cases: 0, failing: 0 }]));
  for (const j of judged) {
    if (j.status === "malformed") continue;
    for (const r of j.rules) {
      stats.get(r).cases++;
      if (j.status !== "pass") stats.get(r).failing++;
    }
  }

  // A finding per kind of failure and set of rules. Its example is the
  // spec's own where there is one, else the shortest document.
  const findings = new Map();
  for (const j of judged) {
    if (j.status === "pass" || j.status === "malformed") continue;
    const key = `${j.status}\u0000${j.rules.join(",")}`;
    const f = findings.get(key) ?? { kind: j.status, rules: j.rules, cases: 0, fixtures: {}, best: j };
    f.cases++;
    f.fixtures[j.vector.family] = (f.fixtures[j.vector.family] ?? 0) + 1;
    const rank = (x) => [x.vector.family === "spec" ? 0 : 1, x.vector.document.length];
    const [a, b] = [rank(j), rank(f.best)];
    if (a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])) f.best = j;
    findings.set(key, f);
  }
  const summary = (f) => {
    const names = f.rules.map((r) => cite(r, rules)).join(" and ");
    if (f.kind === "over-strict") {
      return `${names} is over-strict: rejects valid documents one edit away from a document that breaks only this rule`;
    }
    return f.rules.length === 1
      ? `${names} isn't enforced: accepts documents that break only this rule`
      : `${names} aren't enforced: accepts documents that break only these rules`;
  };
  const expected = (vector) =>
    vector.expected.valid
      ? "valid"
      : `invalid: ${brokenRules(vector).map((r) => `${r} ${JSON.stringify(vector.violations[r])}`).join(", ")}`;

  const notes = {};
  for (const rule of Object.keys(rules)) {
    const mine = data.vectors.filter((v) => !v.expected.valid && v.rule === rule);
    if (mine.length > 0 && mine.every((v) => brokenRules(v).length > 1)) {
      const others = [...new Set(mine.flatMap((v) => brokenRules(v)).filter((r) => r !== rule))];
      notes[rule] = `every document that breaks this rule also breaks ${others.map((r) => cite(r, rules)).join(", ")}, which subsumes it`;
    }
  }

  const malformed = judged.filter((j) => j.status === "malformed").length;
  return {
    format: REPORT_FORMAT,
    area: "validate",
    implementation,
    capabilities: [...capabilities].sort(),
    provenance: provenance({ strict, vectors: data.vectors.length }),
    checkerSelfTest: selfTest ? `passed (${controls} negative controls)` : "failed",
    cases: { submitted: judged.length, distinct: judged.length, malformed },
    adapterProblems: malformed,
    checks: Object.keys(rules).map((rule) => {
      const s = stats.get(rule);
      return {
        id: checkId(rule),
        title: section(rules[rule]).title,
        level: "MUST",
        spec: [section(rules[rule])],
        status: s.failing > 0 ? "fail" : s.cases > 0 ? "pass" : "untested",
        cases: s.cases,
        failing: s.failing,
        ...(notes[rule] ? { note: notes[rule] } : {}),
      };
    }),
    findings: [...findings.values()]
      .sort((a, b) => b.cases - a.cases)
      .map((f) => ({
        checks: f.rules.map(checkId),
        summary: summary(f),
        cases: f.cases,
        fixtures: f.fixtures,
        fixture: f.best.vector.family,
        ...(f.best.answer?.errors?.[0]?.message ? { problem: String(f.best.answer.errors[0].message) } : {}),
        example: {
          input: `${f.best.vector.id}: ${oneLine(f.best.vector.document)}`,
          response: f.best.answer,
          expected: expected(f.best.vector),
        },
      })),
    fixtures: [],
  };
};

// The self-test: answers that are wrong on purpose, each of which the
// checker must catch on every vector.
export const selfTest = (data) => {
  const { vectors } = data;
  const byId = new Map(vectors.map((v) => [v.id, v]));
  // A vector of the opposite verdict: a sibling, the vector a valid one is
  // the sibling of, or another vector of the same rule.
  const pairedWith = new Map();
  for (const v of vectors) for (const s of v.siblings ?? []) if (!pairedWith.has(s)) pairedWith.set(s, v.id);
  const partner = (v) => {
    const id = v.siblings?.[0] ?? pairedWith.get(v.id);
    if (id) return byId.get(id);
    return vectors.find((w) => w.rule === v.rule && w.expected.valid !== v.expected.valid) ?? vectors.find((w) => w.expected.valid !== v.expected.valid);
  };
  const controls = [
    { name: "every verdict flipped", answers: vectors.map((v) => ({ valid: !v.expected.valid })), expect: "wrong" },
    { name: "answers taken from a different vector", answers: vectors.map((v) => ({ ...partner(v).expected })), expect: "wrong" },
    { name: "valid as a string", answers: vectors.map((v) => ({ valid: String(v.expected.valid) })), expect: "malformed" },
  ];
  const failures = [];
  for (const control of controls) {
    const judged = judge(vectors, control.answers);
    const missed = judged.filter((j) => (control.expect === "malformed" ? j.status !== "malformed" : j.status === "pass" || j.status === "malformed"));
    if (missed.length > 0) failures.push(`${control.name}: ${missed.length} vectors not caught, e.g. ${missed[0].vector.id}`);
    if (control.expect === "wrong") {
      const report = buildReport({ data, judged, strict: false, selfTest: true, controls: 0, implementation: "self-test", capabilities: [] });
      const passing = report.checks.filter((c) => c.status === "pass");
      if (passing.length > 0) failures.push(`${control.name}: the report still passes ${passing.map((c) => c.id).join(", ")}`);
    }
  }
  return { ok: failures.length === 0, failures, controls: controls.length };
};

// Compares the answers with the vectors, and reports.
export const check = (data, answers, { strict = false, log = console.log, implementation = "unknown", capabilities = [] } = {}) => {
  const judged = judge(data.vectors, answers);
  const test = selfTest(data);
  const report = buildReport({ data, judged, strict, selfTest: test.ok, controls: test.controls, implementation, capabilities });

  const invalid = judged.filter((j) => !j.vector.expected.valid).length;
  log(`  ${judged.length} vectors (${invalid} invalid, ${judged.length - invalid} valid) over ${Object.keys(data.rules).length} rules`);
  for (const f of report.findings) {
    log(`✗ ${f.summary} (${f.cases} vector${f.cases === 1 ? "" : "s"})`);
    log(`    document: ${f.example.input}`);
    log(`    answer:   ${JSON.stringify(f.example.response)}`);
    log(`    expected: ${f.example.expected}`);
  }
  const malformed = report.cases.malformed;
  if (malformed > 0) {
    const first = judged.find((j) => j.status === "malformed");
    log(`✗ ${malformed} answers aren't {"valid": true|false}, e.g. ${JSON.stringify(first.answer)} for ${first.vector.id}`);
  }
  const passed = judged.filter((j) => j.status === "pass").length;
  log(`${passed === judged.length ? "✓" : "✗"} ${passed} of ${judged.length} answers agree with the reference`);
  const untested = report.checks.filter((c) => c.status === "untested");
  if (untested.length > 0) log(`! untested: ${untested.map((c) => c.id).join(", ")}`);
  if (test.ok) log(`✓ the checker catches all ${test.controls} negative controls`);
  else for (const f of test.failures) log(`✗ self-test: ${f}`);

  // Every check is a MUST, so --strict changes nothing yet.
  const ok = test.ok && malformed === 0 && report.checks.every((c) => c.status !== "fail");
  return { ok, report };
};
