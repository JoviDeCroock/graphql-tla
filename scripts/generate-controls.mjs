// Writes kit/execution/controls.json, the negative-control corpus every
// `graphql-tla check` evaluates.
//
// Base cases are recorded from graphql-js 17 through its adapter and must
// pass the reference. For each control in kit/execution/controls.mjs, the
// script tries the base cases, shortest first, until breaking one is caught
// the way the control says. The corpus is committed, so the controls don't
// depend on the implementation under test.
//
// Usage: node scripts/generate-controls.mjs

import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Adapter } from "../kit/adapter.mjs";
import { CASE_FORMAT, caseToTla, evaluate, normalize } from "../kit/execution/check.mjs";
import { CONTROLS } from "../kit/execution/controls.mjs";
import { Driver, exhaustive, random } from "../kit/execution/drive.mjs";
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
  return result.problems ? result : { ...result, tla: caseToTla(byId.get(raw.fixture), result.case) };
};
const seen = new Set();
const candidates = recorded
  .map((r) => ({ v: CASE_FORMAT, ...r, implementation: undefined }))
  .map((raw) => ({ raw, prepared: prepare(raw) }))
  .filter(({ prepared }) => !prepared.problems && !seen.has(prepared.tla) && seen.add(prepared.tla))
  .sort((a, b) => a.raw.trace.length - b.raw.trace.length);
const verdicts = await evaluate(candidates.map((c) => c.prepared.tla));
const passing = candidates.filter((_, i) => verdicts[i].failures.length === 0).map((c) => c.raw);
console.log(`${recorded.length} runs, ${passing.length} distinct passing cases`);

const bases = [];
const controls = [];
for (const control of CONTROLS) {
  const tries = passing
    .flatMap((base) => control.make(base, byId.get(base.fixture)).map((variant) => ({ base, broken: { ...base, ...variant } })))
    .slice(0, 40);
  const prepared = tries.map((t) => prepare(t.broken));
  const evaluated = prepared.filter((p) => !p.problems);
  const results = await evaluate(evaluated.map((p) => p.tla));
  const resultOf = new Map(evaluated.map((p, i) => [p, results[i]]));
  const index = prepared.findIndex((p) =>
    control.clause === "malformed" ? Boolean(p.problems) : !p.problems && resultOf.get(p).failures.includes(control.clause),
  );
  if (index === -1) {
    console.log(`✗ no base case can be broken into "${control.name}"`);
    process.exitCode = 1;
    continue;
  }
  const { base, broken } = tries[index];
  if (!bases.includes(base)) bases.push(base);
  controls.push({ name: control.name, clause: control.clause, base: bases.indexOf(base), case: broken });
  console.log(`✓ ${control.name} (${control.clause}), from a ${base.fixture} case`);
}

writeFileSync(
  join(root, "kit/execution/controls.json"),
  `${JSON.stringify({ generatedFrom: "graphql-js 17.1.0", bases, controls }, null, 1)}\n`,
);
console.log(`wrote kit/execution/controls.json: ${bases.length} bases, ${controls.length} controls`);
