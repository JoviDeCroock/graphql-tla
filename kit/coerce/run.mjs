// graphql-tla run coerce: asks the adapter to execute every vector in
// kit/coerce/vectors.json and compares each result with the answer
// Coercion.tla gave (docs/kit/coerce.md).

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ask } from "../areas.mjs";
import { REPORT_FORMAT, provenance, section } from "../report.mjs";
import { CHECKS, checksOf } from "./checks.mjs";
import { describeExpected, judge, malformed, sameAnswer, summary } from "./judge.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const loadVectors = () => JSON.parse(readFileSync(join(root, "kit/coerce/vectors.json"), "utf8"));

// The capabilities that decide which vectors run and how results compare.
// TODO: adapters/graphql-js/adapter.mjs doesn't advertise `absent-vs-null`
// or `unvalidated` yet, though its coerce module supports both. Drop this
// once it does.
const capabilitiesOf = (adapter) => new Set(adapter.capabilities);

// The checker's self-test: correct answers must pass, and deliberately wrong
// ones must each be caught. Returns the number of wrong answers, or a list of
// problems.
export const selfTest = (vectors, exact) => {
  const problems = [];
  let controls = 0;
  const caught = (vector, result, name) => {
    controls++;
    if (!judge(vector, result, exact)) problems.push(`${name} wasn't caught for ${vector.id}`);
  };
  vectors.forEach((vector, i) => {
    if (judge(vector, vector.expected, exact)) problems.push(`the expected answer fails ${vector.id}`);
    // Every verdict flipped: a value for an error, an error for a value, and
    // the other kind of error.
    const { outcome } = vector.expected;
    if (outcome === "value") caught(vector, { outcome: "request-error" }, "a request error for a value");
    else {
      caught(vector, { outcome: "value", arguments: {} }, "a value for an error");
      caught(vector, { outcome: outcome === "request-error" ? "field-error" : "request-error" }, "the other kind of error");
    }
    // The answer to the nearest vector whose answer differs.
    for (let k = 1; k < vectors.length; k++) {
      const other = vectors[(i + k) % vectors.length];
      if (!sameAnswer(vector.expected, other.expected, exact)) {
        caught(vector, other.expected, "another vector's answer");
        break;
      }
    }
  });
  return problems.length ? problems : controls;
};

export const run = async ({ adapter, strict, log = console.log }) => {
  const started = Date.now();
  const { schema, vectors } = loadVectors();
  const capabilities = capabilitiesOf(adapter);
  const exact = capabilities.has("absent-vs-null");

  const runnable = [];
  const skipped = {};
  for (const vector of vectors) {
    const missing = (vector.requires ?? []).filter((c) => !capabilities.has(c));
    if (missing.length === 0) runnable.push(vector);
    for (const c of missing) skipped[c] = (skipped[c] ?? 0) + 1;
  }
  const skippedText = Object.entries(skipped).map(([c, n]) => `${n} need ${c}`).join(", ");
  log(`  ${plural(vectors.length, "vector")}, ${runnable.length} run${skippedText ? ` (${skippedText})` : ""}`);
  if (!exact) log("  without absent-vs-null: null and absent entries compare alike");

  // Ask, and judge each result.
  const outcomes = [];
  for (const vector of runnable) {
    const result = await ask(adapter, "coerce", { schema, document: vector.document, variables: vector.variables });
    const problem = malformed(result);
    outcomes.push({ vector, result, problem, failure: problem ? undefined : judge(vector, result, exact) });
  }

  // Checks: a vector exercises its own check and the algorithm deciding the
  // kind of error it expects; a failure counts against one of them.
  const stats = new Map(CHECKS.map((c) => [c.id, { cases: 0, failing: 0 }]));
  const findings = new Map();
  const malformedResults = outcomes.filter((o) => o.problem);
  for (const { vector, result, failure } of outcomes.filter((o) => !o.problem)) {
    for (const id of checksOf(vector)) stats.get(id).cases++;
    if (!failure) continue;
    stats.get(failure.check).failing++;
    const key = `${failure.kind}\u0000${failure.check}\u0000${Boolean(vector.exactNumbers)}`;
    const input = `${vector.document}  variables: ${vector.variables}`;
    const f = findings.get(key) ?? {
      checks: [failure.check],
      summary:
        summary(failure) +
        (vector.exactNumbers ? "; the variables hold a number a double can't hold, so the JSON parser decides this" : ""),
      cases: 0,
      fixtures: {},
    };
    f.cases++;
    f.fixtures[vector.family] = (f.fixtures[vector.family] ?? 0) + 1;
    if (!f.example || input.length < f.example.input.length) {
      f.fixture = vector.family;
      f.example = { vector: vector.id, input, response: result, expected: describeExpected(vector.expected) };
    }
    findings.set(key, f);
  }
  const level = new Map(CHECKS.map((c) => [c.id, c.level]));
  const fatal = (f) => strict || f.checks.some((id) => level.get(id) === "MUST");
  const sorted = [...findings.values()].sort((a, b) => b.cases - a.cases);

  let ok = runnable.length > 0;
  for (const { vector, problem } of malformedResults.slice(0, 5)) log(`✗ malformed result for ${vector.id}: ${problem}`);
  if (malformedResults.length > 0) {
    ok = false;
    log(`✗ ${plural(malformedResults.length, "result")} not in the coerce result format`);
  }
  for (const f of sorted) {
    if (fatal(f)) ok = false;
    const should = fatal(f) ? "" : ": a SHOULD, fails with --strict";
    log(`${fatal(f) ? "✗" : "!"} ${f.summary} (${plural(f.cases, "vector")})${should}`);
    log(`    e.g.:     ${f.example.input}`);
    log(`    got:      ${JSON.stringify(f.example.response)}`);
    log(`    expected: ${f.example.expected.length > 160 ? `${f.example.expected.slice(0, 160)}…` : f.example.expected}`);
  }
  const failing = sorted.reduce((n, f) => n + f.cases, 0);
  const wellFormed = outcomes.length - malformedResults.length;
  log(`${failing === 0 && ok ? "✓" : "✗"} ${wellFormed - failing} of ${wellFormed} results match the reference`);

  const test = selfTest(runnable, exact);
  if (Array.isArray(test)) {
    ok = false;
    for (const p of test.slice(0, 5)) log(`✗ self-test: ${p}`);
  } else log(`✓ the checker catches all ${test} negative controls`);
  log(`  (${((Date.now() - started) / 1000).toFixed(1)}s)`);

  const report = {
    format: REPORT_FORMAT,
    area: "coerce",
    implementation: adapter.name,
    capabilities: [...adapter.capabilities].sort(),
    provenance: provenance({
      strict,
      vectors: vectors.length,
      run: runnable.length,
      skipped,
      comparison: exact ? "exact" : "null and absent entries alike",
    }),
    checkerSelfTest: Array.isArray(test) ? "failed" : `passed (${test} negative controls)`,
    cases: { submitted: runnable.length, distinct: runnable.length, malformed: malformedResults.length },
    adapterProblems: malformedResults.length,
    checks: CHECKS.map((check) => {
      const s = stats.get(check.id);
      return {
        id: check.id,
        title: check.title,
        level: check.level,
        spec: check.spec.map(section),
        ...(check.basis ? { basis: check.basis } : {}),
        status: s.failing > 0 ? "fail" : s.cases > 0 ? "pass" : "untested",
        cases: s.cases,
        failing: s.failing,
        ...(check.untested ? { note: check.untested } : {}),
      };
    }),
    findings: sorted,
    fixtures: [],
  };
  return { ok, report };
};
