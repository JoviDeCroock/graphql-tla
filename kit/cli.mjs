#!/usr/bin/env node
// graphql-tla: check a GraphQL implementation against the TLA+ references.
//
//   graphql-tla run execution --adapter "<command>" [options]
//       Drives the implementation through an adapter (docs/conformance.md),
//       then checks every response against Reference.tla.
//   graphql-tla check execution <cases.jsonl> [--strict]
//       Checks cases recorded earlier, or produced by your own harness.
//
// Options for run:
//   --random N      seeded random runs per fixture (default 1500)
//   --seed S        the seed (default 1)
//   --exhaustive    also every combination of outcomes in two settling
//                   orders (default when the adapter reports `idle`)
//   --no-exhaustive only random runs
//   --fixtures a,b  only these fixtures
//   --out FILE      also write the cases as JSONL
//   --grace MS      without `idle`, how long a quiet adapter counts as idle
//   --strict        fail on SHOULDs too (response key order)

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Adapter } from "./adapter.mjs";
import { CASE_FORMAT, check } from "./execution/check.mjs";
import { Driver, exhaustive, random } from "./execution/drive.mjs";
import { loadFixtures } from "./fixtures.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};
const [command, area, file] = argv;

const usage = () => {
  console.error('usage: graphql-tla run execution --adapter "<command>" [options]');
  console.error("       graphql-tla check execution <cases.jsonl> [--strict]");
  process.exit(2);
};
if (area !== "execution" || !["run", "check"].includes(command)) usage();

const only = option("--fixtures", "")?.split(",").filter(Boolean);
const allFixtures = loadFixtures(join(root, "fixtures"));
const fixtures = allFixtures.filter((f) => !only?.length || only.includes(f.id));
const strict = flag("--strict");

if (command === "check") {
  if (!file) usage();
  const cases = readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
  const wrong = cases.find((c) => c.v !== CASE_FORMAT);
  if (wrong) {
    console.error(`case format ${wrong.v} isn't supported; this kit reads format ${CASE_FORMAT}`);
    process.exit(2);
  }
  process.exit((await check(allFixtures, cases, { strict })) ? 0 : 1);
}

const adapterCommand = option("--adapter");
if (!adapterCommand) usage();
const adapter = new Adapter(adapterCommand);
let ok = false;
try {
  await adapter.hello();
  const driver = new Driver(adapter, { grace: Number(option("--grace", 50)) });
  const runExhaustive = flag("--no-exhaustive") ? false : flag("--exhaustive") || driver.idle;
  const count = Number(option("--random", 1500));
  const seed = Number(option("--seed", 1));
  console.log(`${adapter.name} (capabilities: ${[...adapter.capabilities].sort().join(", ")})`);
  // `idle` is the adapter's claim. The exhaustive runs rely on it making
  // runs deterministic, so replay a few runs and require identical results.
  if (driver.idle) {
    for (const fixture of fixtures.filter((f) => f.requires.every((c) => adapter.capabilities.has(c)))) {
      const [a, b] = [await random(driver, fixture, 5, 99), await random(driver, fixture, 5, 99)];
      const strip = (runs) => JSON.stringify(runs.map((r) => [r.trace, r.response]));
      if (strip(a) !== strip(b)) {
        throw new Error(`the adapter reports idle, but replaying ${fixture.id} with the same choices gave different results`);
      }
    }
  }
  const cases = [];
  for (const fixture of fixtures) {
    const missing = fixture.requires.filter((c) => !adapter.capabilities.has(c));
    if (missing.length > 0) {
      console.log(`  ${fixture.id}: skipped, needs ${missing.join(", ")}`);
      continue;
    }
    const runs = [
      ...(runExhaustive ? await exhaustive(driver, fixture, "fifo") : []),
      ...(runExhaustive ? await exhaustive(driver, fixture, "lifo") : []),
      ...(await random(driver, fixture, count, seed)),
    ];
    const kinds = new Set(runs.flatMap((r) => r.trace.filter((e) => e.settle).map((e) => e.outcome.kind)));
    const partial = fixture.invalidResults && !adapter.capabilities.has("invalid-results") ? ", without invalid results" : "";
    console.log(`  ${fixture.id}: ${runs.length} runs (outcomes: ${[...kinds].sort().join(", ")}${partial})`);
    cases.push(...runs.map((r) => ({ v: CASE_FORMAT, ...r })));
  }
  // A late second response for the last execution would otherwise go unseen.
  await driver.settleDown();
  adapter.close();
  const out = option("--out");
  if (out) writeFileSync(out, cases.map((c) => JSON.stringify(c)).join("\n") + "\n");
  if (cases.length === 0) console.log("✗ no fixture ran");
  ok = (await check(allFixtures, cases, { strict })) && cases.length > 0;
} catch (error) {
  console.error(`✗ ${error.message}`);
  adapter.close();
}
process.exit(ok ? 0 : 1);
