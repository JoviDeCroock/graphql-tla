// graphql-tla run coerce: asks the adapter to execute every vector in
// kit/coerce/vectors.json, classifies each raw result, and compares it with
// the answers Coercion.tla gave (docs/kit/coerce.md).

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ask } from "../areas.mjs";
import { REPORT_FORMAT, provenance, section } from "../report.mjs";
import { CHECKS } from "./checks.mjs";
import { classify, contextFor, describeAccepted, judge, malformed, planFor, sameAnswer, summary } from "./judge.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export const loadVectors = () => JSON.parse(readFileSync(join(root, "kit/coerce/vectors.json"), "utf8"));

// ---------------------------------------------------------------------------
// The checker's self-test. Raw results are built for chosen answers, and
// go through the same classification and comparison as an adapter's.

// A raw result that shows `answer` the way a correct implementation would.
const rawFor = (answer, fallbackField) => {
  const field = answer.field ?? fallbackField;
  if (answer.outcome === "request-error") return { response: { errors: [{ message: "request error" }] }, calls: [] };
  if (answer.outcome === "field-error") {
    return { response: { data: { [field]: null }, errors: [{ message: "field error", path: [field] }] }, calls: [] };
  }
  return { response: { data: { [field]: "ok" } }, calls: [{ path: [field], arguments: answer.arguments }] };
};

// The arguments with an undeclared null entry added: at the top, or in the
// first input object found.
const withUndeclaredNull = (args, nested) => {
  if (!nested) return { ...args, unexpected: null };
  let done = false;
  const visit = (v) => {
    if (done || v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(visit);
    done = true;
    return { ...v, unexpected: null };
  };
  const out = Object.fromEntries(Object.entries(args).map(([k, v]) => [k, visit(v)]));
  return done ? out : undefined;
};

// Every object's null entries dropped, as an implementation without
// absent-vs-null may report them.
const dropNulls = (v) =>
  Array.isArray(v)
    ? v.map(dropNulls)
    : isMap(v)
      ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, dropNulls(x)]))
      : v;

// Correct answers must pass; deliberately wrong ones must each be caught.
// Returns the number of wrong answers, or a list of problems.
export const selfTest = (graded, inputs, capabilities) => {
  const problems = [];
  let controls = 0;
  const run = ({ vector, plan }, raw) => {
    const problem = malformed(raw);
    if (problem) return { kind: "malformed" };
    return judge(vector, plan, classify(raw), contextFor(vector, inputs, capabilities));
  };
  const caught = (g, raw, name, check) => {
    controls++;
    const failure = run(g, raw);
    if (!failure) problems.push(`${name} wasn't caught for ${g.vector.id}`);
    else if (check && failure.check !== check) problems.push(`${name} counted against ${failure.check}, not ${check}, for ${g.vector.id}`);
  };
  const accepted = (g, answer) => g.plan.accept.some((a) => sameAnswer(contextFor(g.vector, inputs, capabilities), a, answer));
  graded.forEach((g, i) => {
    const { vector, plan } = g;
    const field = plan.accept.find((a) => a.field)?.field ?? /\{ (\w+)/.exec(vector.document)?.[1] ?? "int";
    // Every answer the plan accepts passes.
    for (const a of plan.accept) if (run(g, rawFor(a, field))) problems.push(`an accepted answer fails ${vector.id}`);
    const [want] = plan.accept;
    // Without absent-vs-null, null entries may be left out.
    if (!capabilities.has("absent-vs-null") && want.outcome === "value" && run(g, rawFor({ ...want, arguments: dropNulls(want.arguments) }))) {
      problems.push(`the expected answer without its null entries fails ${vector.id}`);
    }
    // Verdicts flipped, where the plan doesn't accept the flipped answer.
    const flips = [
      [{ outcome: "request-error" }, "a request error"],
      [{ outcome: "field-error", field }, "a field error"],
      [{ outcome: "value", field, arguments: want.outcome === "value" ? { ...want.arguments, v: "wrong" } : {} }, "a value"],
    ];
    for (const [answer, name] of flips) if (!accepted(g, answer)) caught(g, rawFor(answer, field), name);
    // The answer to the nearest vector whose answer this plan doesn't accept.
    for (let k = 1; k < graded.length; k++) {
      const other = graded[(i + k) % graded.length].plan.accept[0];
      if (!accepted(g, other)) {
        caught(g, rawFor(other, field), "another vector's answer");
        break;
      }
    }
    // Answers that leave a SHOULD undone count against that SHOULD's check.
    for (const d of plan.deviations) caught(g, rawFor(d.answer, field), "an answer that leaves a SHOULD undone", d.check);
    // Undeclared null entries, as an argument and inside an input object.
    if (want.outcome === "value") {
      caught(g, rawFor({ ...want, arguments: withUndeclaredNull(want.arguments, false) }), "an undeclared null argument");
      const nested = withUndeclaredNull(want.arguments, true);
      if (nested) caught(g, rawFor({ ...want, arguments: nested }), "an undeclared null input field");
    }
    // Responses the classification must not accept.
    const raw = rawFor(want, field);
    if (want.outcome === "request-error") {
      caught(g, { ...raw, response: { ...raw.response, data: null } }, "a request error with data: null");
      caught(g, { ...raw, calls: [{ path: [field], arguments: {} }] }, "a request error after a resolver ran");
    } else if (want.outcome === "field-error") {
      caught(g, { ...raw, response: { ...raw.response, errors: [{ message: "field error" }] } }, "a field error without a path");
      caught(g, { ...raw, calls: [{ path: [field], arguments: {} }] }, "a field error after the resolver ran");
    } else {
      caught(g, { ...raw, response: { ...raw.response, errors: [{ message: "extra", path: [field] }] } }, "a value with an error");
      caught(g, { ...raw, calls: [...raw.calls, ...raw.calls] }, "a value from two resolver calls");
      caught(g, { ...raw, calls: [{ ...raw.calls[0], path: ["elsewhere"] }] }, "a value from a call at another field");
    }
  });
  return problems.length ? problems : controls;
};

// ---------------------------------------------------------------------------

export const run = async ({ adapter, strict, log = console.log }) => {
  const started = Date.now();
  const { schema, inputs, vectors } = loadVectors();
  const capabilities = new Set(adapter.capabilities);

  const graded = [];
  let skipped = 0;
  for (const vector of vectors) {
    const plan = planFor(vector, capabilities);
    if (plan) graded.push({ vector, plan });
    else skipped++;
  }
  const modes = [
    capabilities.has("unvalidated") ? "unvalidated" : "validating: invalid documents graded under invalidNotExecuted",
    capabilities.has("absent-vs-null") ? "absent-vs-null" : "null and absent alike at optional positions",
    capabilities.has("exact-numbers") ? "exact-numbers" : "big JSON numbers graded under jsonNumbers",
  ];
  log(`  ${plural(vectors.length, "vector")}, ${graded.length} run${skipped ? ` (${skipped} skipped for missing capabilities)` : ""}`);
  log(`  ${modes.join("; ")}`);

  // Ask, classify, and judge each result.
  const outcomes = [];
  for (const g of graded) {
    const { vector } = g;
    const result = await ask(adapter, "coerce", {
      schema,
      document: vector.document,
      variables: vector.variables,
      ...(vector.operationName !== undefined ? { operationName: vector.operationName } : {}),
    });
    const problem = malformed(result);
    const got = problem ? undefined : classify(result);
    const failure = problem ? undefined : judge(vector, g.plan, got, contextFor(vector, inputs, capabilities));
    outcomes.push({ ...g, result, problem, got, failure });
  }

  const stats = new Map(CHECKS.map((c) => [c.id, { cases: 0, failing: 0 }]));
  const findings = new Map();
  const malformedResults = outcomes.filter((o) => o.problem);
  for (const { vector, plan, result, got, failure } of outcomes.filter((o) => !o.problem)) {
    for (const id of plan.exercises) stats.get(id).cases++;
    if (!failure) continue;
    stats.get(failure.check).failing++;
    const key = `${failure.kind}\u0000${failure.check}`;
    const input = `${vector.document}  variables: ${vector.variables}${vector.operationName !== undefined ? `  operationName: ${vector.operationName}` : ""}`;
    const f = findings.get(key) ?? { checks: [failure.check], summary: summary(failure), cases: 0, fixtures: {} };
    f.cases++;
    f.fixtures[vector.family] = (f.fixtures[vector.family] ?? 0) + 1;
    if (!f.example || input.length < f.example.input.length) {
      f.fixture = vector.family;
      f.example = { vector: vector.id, input, response: result, outcome: got, expected: describeAccepted(plan) };
    }
    findings.set(key, f);
  }
  const level = new Map(CHECKS.map((c) => [c.id, c.level]));
  const fatal = (f) => f.checks.some((id) => level.get(id) === "MUST" || (strict && level.get(id) === "SHOULD"));
  const sorted = [...findings.values()].sort((a, b) => b.cases - a.cases);

  let ok = graded.length > 0;
  for (const { vector, problem } of malformedResults.slice(0, 5)) log(`✗ malformed result for ${vector.id}: ${problem}`);
  if (malformedResults.length > 0) {
    ok = false;
    log(`✗ ${plural(malformedResults.length, "result")} not in the coerce result format`);
  }
  for (const f of sorted) {
    if (fatal(f)) ok = false;
    const lv = level.get(f.checks[0]);
    const note = fatal(f) ? "" : lv === "SHOULD" ? ": a SHOULD, fails with --strict" : ": informational";
    log(`${fatal(f) ? "✗" : "!"} ${f.summary} [${f.checks[0]}] (${plural(f.cases, "vector")})${note}`);
    log(`    e.g.:     ${f.example.input}`);
    log(`    got:      ${JSON.stringify(f.example.outcome)}`);
    log(`    expected: ${f.example.expected.length > 160 ? `${f.example.expected.slice(0, 160)}…` : f.example.expected}`);
  }
  const failing = sorted.reduce((n, f) => n + f.cases, 0);
  const wellFormed = outcomes.length - malformedResults.length;
  log(`${failing === 0 && ok ? "✓" : "✗"} ${wellFormed - failing} of ${wellFormed} results match the reference`);

  const test = selfTest(graded, inputs, capabilities);
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
    provenance: provenance({ strict, vectors: vectors.length, run: graded.length, skipped, modes }),
    checkerSelfTest: Array.isArray(test) ? "failed" : `passed (${test} negative controls)`,
    cases: { submitted: graded.length, distinct: graded.length, malformed: malformedResults.length },
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
