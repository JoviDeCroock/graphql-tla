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
//   --report FILE   write the facts behind a conformance sheet as JSON
//                   (also for check); scripts/conformance-sheet.mjs reads it
//
// For every command:
//   --checker CMD   the TLA+ model checker to evaluate the references with,
//                   instead of the bundled tla-ts (also TLA_CHECKER); see
//                   kit/checker.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Adapter } from "./adapter.mjs";
import "./checker.mjs";
import { AREAS } from "./areas.mjs";

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
  console.error("       any command also takes --checker \"<command>\" (or TLA_CHECKER) to use another TLA+ model checker");
  console.error(`       graphql-tla run <${AREAS.filter((a) => a !== "execution").join("|")}> --adapter "<command>" [--strict] [--report FILE]`);
  process.exit(2);
};
if (!AREAS.includes(area) || !["run", "check"].includes(command) || (command === "check" && area !== "execution")) usage();

// The execution modules load only for execution, so that another area runs
// without them.
const { CASE_FORMAT, check } = area === "execution" ? await import("./execution/check.mjs") : {};
const { Driver, exhaustive, random } = area === "execution" ? await import("./execution/drive.mjs") : {};
const { loadFixtures } = area === "execution" ? await import("./fixtures.mjs") : {};

const only = option("--fixtures", "")?.split(",").filter(Boolean);
const allFixtures = area === "execution" ? loadFixtures(join(root, "fixtures")) : [];
const fixtures = allFixtures.filter((f) => !only?.length || only.includes(f.id));
const strict = flag("--strict");
// The report records the run's verdict, so a reader (and
// scripts/check-conformance.mjs) can tell a passing run from a failing one.
const writeReport = (report, ok) => {
  const path = option("--report");
  if (path) writeFileSync(path, JSON.stringify({ ...report, ok }, null, 2) + "\n");
};

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
  const { ok, report } = await check(allFixtures, cases, { strict });
  writeReport(report, ok);
  process.exit(ok ? 0 : 1);
}

const adapterCommand = option("--adapter");
if (!adapterCommand) usage();
const adapter = new Adapter(adapterCommand);
let ok = false;

// Areas other than execution: kit/<area>/run.mjs exports
// run({ adapter, strict, option, flag, log }), which returns { ok, report }.
if (area !== "execution") {
  try {
    await adapter.hello();
    console.log(`${adapter.name} (capabilities: ${[...adapter.capabilities].sort().join(", ")})`);
    if (!adapter.capabilities.has(area)) {
      // Exit code 3: not an answer, the adapter just doesn't take part.
      console.error(`- the adapter doesn't claim the ${area} capability`);
      adapter.close();
      process.exit(3);
    }
    const { run } = await import(`./${area}/run.mjs`);
    const result = await run({ adapter, strict, option, flag, log: console.log });
    ok = result.ok;
    writeReport(result.report, ok);
  } catch (error) {
    console.error(`✗ ${error.message}`);
  }
  adapter.close();
  process.exit(ok ? 0 : 1);
}

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
      // What scheduling decides: the trace, data and error paths. Error
      // messages, order and extensions may legitimately differ.
      const strip = (runs) =>
        JSON.stringify(
          runs.map((r) => [
            r.trace,
            r.streamError !== undefined,
            r.noResponse !== undefined,
            r.response?.data,
            (Array.isArray(r.response?.errors) ? r.response.errors.map((e) => JSON.stringify(e?.path ?? null)) : []).sort(),
          ]),
        );
      if (strip(a) !== strip(b)) {
        throw new Error(`the adapter reports idle, but replaying ${fixture.id} with the same choices gave different results`);
      }
    }
  }
  // Count only what the graded runs left out.
  driver.withheld = new Map();
  const cases = [];
  const skipped = [];
  for (const fixture of fixtures) {
    const missing = fixture.requires.filter((c) => !adapter.capabilities.has(c));
    if (missing.length > 0) {
      console.log(`  ${fixture.id}: skipped, needs ${missing.join(", ")}`);
      skipped.push({ fixture: fixture.id, needs: missing });
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
  for (const [reason, n] of driver.withheld) console.log(`- not sent: ${reason}, at ${n} settles`);
  const result = await check(allFixtures, cases, {
    strict,
    implementation: adapter.name,
    capabilities: [...adapter.capabilities],
    skipped,
    // Outcomes the adapter said it can't return, and how many times each
    // was left out of a settle's choices: what the run didn't grade.
    run: { random: count, seed, exhaustive: Boolean(runExhaustive), ...(driver.withheld.size ? { skipped: Object.fromEntries(driver.withheld) } : {}) },
  });
  ok = result.ok && cases.length > 0;
  writeReport(result.report, ok);
} catch (error) {
  console.error(`✗ ${error.message}`);
  adapter.close();
}
process.exit(ok ? 0 : 1);
