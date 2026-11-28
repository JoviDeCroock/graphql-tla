// Writes kit/execution/controls.json, the negative-control corpus every
// `graphql-tla check` evaluates.
//
// Base cases are recorded from graphql-js 17 through its adapter and must
// pass the reference. For each control in kit/execution/controls.mjs, the
// script tries the base cases, shortest first, until breaking one is caught
// the way the control says. Each report control in the same file gets the
// shortest passing cases its predicates pick, and the cases it makes from
// them are stored after checking that their report is right. The corpus is
// committed, so the controls don't depend on the implementation under
// test. The corpus also keeps the bases kit/execution/protocol-controls.mjs
// derives its controls from (KEPT_BASES). Fixtures outside the spec (error
// propagation off, fragment arguments: kit/execution/outside.mjs) give no
// bases for controls, since their failures are only informational, but
// report controls use them.
//
// Usage: node scripts/generate-controls.mjs

import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Adapter } from "../kit/adapter.mjs";
import { CASE_FORMAT, caseToTla, controlCaught, evaluate, judgeReportControl, normalize } from "../kit/execution/check.mjs";
import { CONTROLS, REPORT_CONTROLS } from "../kit/execution/controls.mjs";
import { Driver, exhaustive, random } from "../kit/execution/drive.mjs";
import { outsideSpec } from "../kit/execution/outside.mjs";
import { loadFixtures } from "../kit/fixtures.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const fixtures = loadFixtures(join(root, "fixtures"));
const byId = new Map(fixtures.map((f) => [f.id, f]));

const adapter = new Adapter("node adapters/graphql-js/adapter.mjs --graphql 17");
await adapter.hello();
const driver = new Driver(adapter);
const recorded = [];
for (const fixture of fixtures) {
  recorded.push(
    ...(await exhaustive(driver, fixture, "fifo")),
    ...(await exhaustive(driver, fixture, "lifo")),
    ...(await random(driver, fixture, 300, 7)),
  );
}
adapter.close();

// Well-formed, passing, distinct cases, shortest first.
const prepare = (raw) => {
  const result = normalize(byId.get(raw.fixture), raw);
  return result.problems || !result.case ? result : { ...result, tla: caseToTla(byId.get(raw.fixture), result.case) };
};
const seen = new Set();
const candidates = recorded
  .map((r) => ({ v: CASE_FORMAT, ...r, implementation: undefined }))
  .map((raw) => ({ raw, prepared: prepare(raw) }))
  // A subscription stream's lifecycle case has no response for the
  // reference, so it is no base.
  .filter(({ prepared }) => !prepared.problems && prepared.tla && !seen.has(prepared.tla) && seen.add(prepared.tla))
  .sort((a, b) => a.raw.trace.length - b.raw.trace.length);
const verdicts = await evaluate(candidates.map((c) => c.prepared.tla));
const passingAll = candidates.filter((_, i) => verdicts[i].failures.length === 0).map((c) => c.raw);
const passing = passingAll.filter((raw) => !outsideSpec(byId.get(raw.fixture)));
console.log(`${recorded.length} runs, ${passingAll.length} distinct passing cases, ${passing.length} in fixtures inside the spec`);

const bases = [];
const controls = [];
for (const control of CONTROLS) {
  const tries = passing
    .flatMap((base) => control.make(base, byId.get(base.fixture)).map((variant) => ({ base, broken: { ...base, ...variant } })))
    .slice(0, 40);
  const prepared = tries.map((t) => prepare(t.broken));
  const evaluated = prepared.filter((p) => !p.problems && p.tla);
  const results = await evaluate(evaluated.map((p) => p.tla));
  const resultOf = new Map(evaluated.map((p, i) => [p, results[i]]));
  const index = prepared.findIndex((p) => controlCaught(control, p, resultOf.get(p)));
  if (index === -1) {
    console.log(`✗ no base case can be broken into "${control.name}"`);
    process.exitCode = 1;
    continue;
  }
  const { base, broken } = tries[index];
  if (!bases.includes(base)) bases.push(base);
  controls.push({
    name: control.name,
    clause: control.clause,
    ...(control.check ? { check: control.check } : {}),
    base: bases.indexOf(base),
    case: broken,
  });
  console.log(`✓ ${control.name} (${control.clause}), from a ${base.fixture} case`);
}

// kit/execution/protocol-controls.mjs derives its controls from the
// corpus's bases, so the corpus keeps a base of each kind it needs, the
// shortest passing one, if no control's base already is one.
const isIndex = (segment) => /^(0|[1-9]\d*)$/.test(String(segment));
const KEPT_BASES = [
  ["a base whose errors all have locations", (raw) => raw.response.errors?.length > 0 && raw.response.errors.every((e) => e.locations?.length > 0)],
  [
    "a query base with a field below the root",
    (raw, fixture) => fixture.operationType === "query" && raw.trace.some((e) => e.call?.length > 1 && !isIndex(e.call.at(-1))),
  ],
  ["a subscription base", (raw, fixture) => fixture.operationType === "subscription" && raw.trace.some((e) => e.call?.length === 1)],
];
for (const [name, predicate] of KEPT_BASES) {
  if (bases.some((raw) => predicate(raw, byId.get(raw.fixture)))) continue;
  const base = passing.find((raw) => raw.response && predicate(raw, byId.get(raw.fixture)));
  if (!base) {
    console.log(`✗ no passing case for ${name} (kit/execution/protocol-controls.mjs)`);
    process.exitCode = 1;
    continue;
  }
  bases.push(base);
  console.log(`✓ kept ${name}, from a ${base.fixture} case`);
}

const reportControls = [];
for (const control of REPORT_CONTROLS) {
  const picked = [];
  for (const predicate of control.bases) {
    const base = passingAll.find((raw) => !picked.includes(raw) && predicate(raw, byId.get(raw.fixture)));
    if (base) picked.push(base);
  }
  if (picked.length < control.bases.length) {
    console.log(`✗ no passing cases for the report control "${control.name}"`);
    process.exitCode = 1;
    continue;
  }
  const cases = control.make(picked);
  const problem = await judgeReportControl(fixtures, control, cases);
  if (problem) {
    console.log(`✗ report control "${control.name}": ${problem}`);
    process.exitCode = 1;
    continue;
  }
  reportControls.push({ name: control.name, cases });
  console.log(`✓ report control: ${control.name}`);
}

writeFileSync(
  join(root, "kit/execution/controls.json"),
  `${JSON.stringify({ generatedFrom: "graphql-js 17.1.0", bases, controls, reportControls }, null, 1)}\n`,
);
console.log(`wrote kit/execution/controls.json: ${bases.length} bases, ${controls.length} controls, ${reportControls.length} report controls`);
