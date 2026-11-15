// The conformance sheet's verdicts on synthetic format 2 reports: the kit
// grades September 2026, a failing check keeps its level's symbol whatever
// release its failing cases' rules come from, and those cases are counted
// by the release that introduced them.
//
// Run with: node --test scripts/test/*.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FORMAT, GRADED, areaChecks, areaOrder, cell, editionName, failsFrom, findingLabels, findingSinceText, fixtureCell, levelText, missingCapabilities, profileText,
  reportSinceText, sectionVerdict, sinceText,
} from "../conformance-sheet.mjs";

const check = (id, level, status, extra = {}) => ({ id, level, status, cases: 10, failing: status === "fail" ? 4 : 0, spec: [], ...extra });
// Every failing case relies on September 2025's rules, or September 2026's.
const since2025 = (id, level) => check(id, level, "fail", { failingSince: { September2025: 4 } });
const new2026 = (id, level) => check(id, level, "fail", { failingSince: { September2026: 4 } });
// Some failing cases rely on newer rules, and some fail under October 2021's too.
const partly = (id, level) => check(id, level, "fail", { failingSince: { September2025: 1 } });
// Every failing case relies on newer rules, from both releases.
const both = (id, level) => check(id, level, "fail", { failingSince: { September2025: 3, September2026: 1 } });

test("editions are named as releases, and the graded one is September 2026", () => {
  assert.equal(FORMAT, 2);
  assert.equal(GRADED, "September2026");
  assert.equal(editionName("September2026"), "September 2026");
  assert.equal(editionName("October2021"), "October 2021");
  assert.equal(sinceText({ September2025: 3, September2026: 1 }, 4), "3 since September 2025, 1 new in September 2026");
  assert.equal(sinceText({ September2026: 4 }, 4), "all new in September 2026");
  assert.equal(sinceText({ September2025: 2, September2026: 0 }, 4), "2 since September 2025");
});

test("a check's cell keeps its level and counts its failing cases by release", () => {
  assert.equal(cell(check("m", "MUST", "fail")), "✗ 4/10");
  assert.equal(cell(since2025("m", "MUST")), "✗ 4/10 (all since September 2025)");
  assert.equal(cell(new2026("m", "MUST")), "✗ 4/10 (all new in September 2026)");
  assert.equal(cell(partly("m", "MUST")), "✗ 4/10 (1 since September 2025)");
  assert.equal(cell(both("m", "MUST")), "✗ 4/10 (3 since September 2025, 1 new in September 2026)");
  assert.equal(cell(since2025("s", "SHOULD")), "! 4/10 (all since September 2025)");
  assert.equal(cell(new2026("i", "INFO")), "i 4/10 (all new in September 2026)");
  assert.equal(cell(check("m", "MUST", "fail", { failingSince: {} })), "✗ 4/10");
  assert.equal(cell(check("a", "ADAPTER", "fail")), "✗ 4/10");
  assert.equal(cell(check("p", "MUST", "pass")), "✓ 10");
  assert.equal(cell(check("u", "MUST", "untested", { cases: 0 })), "–");
  assert.equal(cell(undefined), "n/a");
});

test("a check fails from the earliest release all its failing cases need", () => {
  assert.equal(failsFrom({ September2025: 4 }, 4), "September2025");
  assert.equal(failsFrom({ September2026: 4 }, 4), "September2026");
  assert.equal(failsFrom({ September2025: 3, September2026: 1 }, 4), "September2025");
  assert.equal(failsFrom({ September2025: 1 }, 4), null);
  assert.equal(failsFrom(undefined, 4), null);
  assert.equal(failsFrom({}, 0), null);
});

test("a check's level is September 2026's, with the releases that differ", () => {
  assert.equal(levelText({ level: "MUST" }), "MUST");
  assert.equal(levelText({ level: "MUST", levels: { October2021: "SHOULD" } }), "MUST (SHOULD in October 2021)");
  assert.equal(levelText({ level: "MUST", levels: { September2025: "SHOULD", October2021: "SHOULD" } }), "MUST (SHOULD in September 2025 and October 2021)");
  assert.equal(levelText({ level: "MUST", since: "September2025" }), "MUST (since September 2025)");
  assert.equal(levelText({ level: "MUST", since: "September2026", levels: { September2025: "SHOULD" } }), "MUST (new in September 2026; SHOULD in September 2025)");
  assert.equal(levelText({ level: "SHOULD", levels: { September2025: "MAY", October2021: "MUST" } }), "SHOULD (MAY in September 2025; MUST in October 2021)");
});

test("a section whose only failure is a SHOULD since September 2025 is a should, not a MUST failure", () => {
  assert.equal(sectionVerdict([check("p", "MUST", "pass"), since2025("s", "SHOULD")]), "! (since September 2025) `s`");
});

test("a MUST new in September 2026 and an outright SHOULD keep their own levels", () => {
  assert.equal(sectionVerdict([new2026("m", "MUST"), check("s", "SHOULD", "fail")]), "✗ (new in September 2026) `m`; ! `s`");
});

test("a release label applies only when every failure of the check needs that release or a later one", () => {
  assert.equal(sectionVerdict([since2025("m1", "MUST"), since2025("m2", "MUST")]), "✗ (since September 2025) `m1` `m2`");
  assert.equal(sectionVerdict([check("m1", "MUST", "fail"), since2025("m2", "MUST"), new2026("m3", "MUST")]), "✗ `m1`; ✗ (since September 2025) `m2`; ✗ (new in September 2026) `m3`");
  // Failing cases from both releases fail from September 2025 on.
  assert.equal(sectionVerdict([both("m", "MUST")]), "✗ (since September 2025) `m`");
  // A check with only some failing cases on newer rules fails outright.
  assert.equal(sectionVerdict([partly("m", "MUST")]), "✗ `m`");
  assert.equal(sectionVerdict([check("m", "MUST", "fail"), check("s", "SHOULD", "fail"), new2026("s2", "SHOULD")]), "✗ `m`; ! `s`; ! (new in September 2026) `s2`");
});

test("informational checks never make a section fail", () => {
  assert.equal(sectionVerdict([check("p", "MUST", "pass"), check("i", "INFO", "fail")]), "✓; i `i`");
  assert.equal(sectionVerdict([check("i", "INFO", "fail")]), "i `i`");
  assert.equal(sectionVerdict([check("s", "SHOULD", "fail"), since2025("i", "INFO")]), "! `s`; i (since September 2025) `i`");
});

test("a section with nothing failing is passed, inconclusive or unexercised", () => {
  assert.equal(sectionVerdict([]), null);
  assert.equal(sectionVerdict([check("p", "MUST", "pass"), check("u", "MUST", "untested")]), "✓");
  assert.equal(sectionVerdict([check("n", "MUST", "inconclusive")]), "~");
  assert.equal(sectionVerdict([check("u", "MUST", "untested"), check("x", "SHOULD", "subsumed")]), "–");
});

test("a fixture's verdict takes the worst level of the findings that hold its cases", () => {
  const report = (levels) => ({
    checks: levels.map((level, i) => check(`c${i}`, level, "fail")),
    findings: levels.map((_, i) => ({ checks: [`c${i}`], cases: 1, fixtures: { f: 1 } })),
  });
  const fixture = { id: "f", status: "fail", cases: 10, failing: 3 };
  assert.equal(fixtureCell(fixture, report(["SHOULD"])), "! 3/10");
  assert.equal(fixtureCell(fixture, report(["SHOULD", "MUST"])), "✗ 3/10");
  assert.equal(fixtureCell(fixture, report(["ADAPTER"])), "✗ 3/10");
  assert.equal(fixtureCell(fixture, { checks: [], findings: [] }), "✗ 3/10");
  assert.equal(fixtureCell({ id: "f", status: "pass", cases: 10, informational: 2 }, report([])), "i 2/10");
  assert.equal(fixtureCell({ id: "f", status: "skipped", cases: 0 }, report([])), "–");
});

test("a finding is labelled with its level and the first release all its cases need", () => {
  const checks = [check("m", "MUST", "fail"), check("s", "SHOULD", "fail"), check("i", "INFO", "fail")];
  assert.deepEqual(findingLabels({ checks: ["m", "s"], cases: 2 }, checks), []);
  assert.deepEqual(findingLabels({ checks: ["s"], cases: 2, since: { September2025: 2 } }, checks), ["(SHOULD)", "(since September 2025)"]);
  assert.deepEqual(findingLabels({ checks: ["m"], cases: 2, since: { September2026: 2 } }, checks), ["(new in September 2026)"]);
  assert.deepEqual(findingLabels({ checks: ["m"], cases: 3, since: { September2025: 1, September2026: 2 } }, checks), ["(since September 2025)"]);
  assert.deepEqual(findingLabels({ checks: ["i"], cases: 2, since: { September2025: 1 } }, checks), ["(informational)"]);
  assert.deepEqual(findingLabels({ checks: [], cases: 1 }, checks), []);
  assert.equal(findingSinceText({ cases: 2 }), "");
  assert.equal(findingSinceText({ cases: 2, since: { September2026: 2 } }), "All rely on grammar or rules introduced in September 2026, not in October 2021.");
  assert.equal(
    findingSinceText({ cases: 5, since: { September2025: 3, September2026: 1 } }),
    "3 of them rely on grammar or rules introduced in September 2025 and 1 on ones introduced in September 2026, not in October 2021.",
  );
});

test("a report's profile and its vectors on newer rules are worded by release", () => {
  assert.equal(profileText({}), null);
  assert.equal(profileText({ profile: "September2026" }), "the September 2026 edition's introspection types (latest release)");
  assert.equal(profileText({ profile: "September2025", profileNote: "It has no isDeprecated on __Directive" }), "the September 2025 edition's introspection types. It has no isDeprecated on __Directive");
  assert.equal(profileText({ profile: "October2021" }), "the October 2021 edition's introspection types");
  assert.equal(reportSinceText({}), null);
  assert.equal(
    reportSinceText({ since: { September2025: { vectors: 120, failing: 3 }, September2026: { vectors: 10, failing: 0 } } }),
    "since September 2025, 3 of 120 vectors failing; new in September 2026, 0 of 10 vectors failing",
  );
  assert.equal(reportSinceText({ since: { September2026: { vectors: 1, failing: 1 } } }), "new in September 2026, 1 of 1 vector failing");
});

// The whole sheet, built from synthetic reports in a directory of its own.
const script = resolve(fileURLToPath(import.meta.url), "../../conformance-sheet.mjs");
const section = (number, title) => ({ number, title, url: `https://spec.graphql.org/September2026/#sec-${title.replace(/ /g, "-")}` });
const report = (key, area, extra = {}) => ({
  format: 2,
  area,
  implementation: `Impl ${key}`,
  capabilities: [area],
  provenance: { kit: "0123456789ab", date: "2026-11-15", strict: true, vectors: 20, graded: 20 },
  checkerSelfTest: "passed (2 negative controls)",
  cases: { submitted: 20, distinct: 20, malformed: 0 },
  adapterProblems: 0,
  checks: [],
  findings: [],
  fixtures: [],
  ok: false,
  ...extra,
});
const sheetDir = (reports) => {
  const dir = mkdtempSync(join(tmpdir(), "graphql-tla-sheet-"));
  mkdirSync(join(dir, "reports"));
  const keys = [...new Set(reports.map(([name]) => name.split(".")[0]))];
  writeFileSync(join(dir, "implementations.json"), JSON.stringify({ implementations: keys.map((key) => ({ key })) }));
  for (const [name, r] of reports) writeFileSync(join(dir, "reports", name), JSON.stringify(r));
  return dir;
};
const build = (dir) => spawnSync("node", [script, "--dir", dir], { encoding: "utf8" });

test("the sheet and a page say which edition is graded and count newer rules by release", () => {
  const dir = sheetDir([
    [
      "a.parse.json",
      report("a", "parse", {
        since: { September2025: { vectors: 12, failing: 3 }, September2026: { vectors: 2, failing: 1 } },
        checks: [
          { ...both("stringValue", "MUST"), spec: [section("2.10.4", "String Value")] },
          { ...check("selectionSets", "MUST", "pass"), spec: [section("2.5", "Selection Sets")] },
        ],
        findings: [
          { checks: ["stringValue"], summary: "rejects escapes", cases: 4, since: { September2025: 3, September2026: 1 }, fixtures: { escapes: 4 }, fixture: "escapes", example: { input: '[since September 2025] "\\u{41}"', response: { ok: false }, expected: "ok" } },
        ],
      }),
    ],
    [
      "a.json",
      report("a", "execution", {
        checks: [{ ...check("errorPathsUnique", "MUST", "fail", { levels: { September2025: "SHOULD", October2021: "SHOULD" } }), spec: [section("6.4.4", "Handling Execution Errors")] }],
        findings: [{ checks: ["errorPathsUnique"], cases: 4, fixtures: { lists: 4 }, fixture: "lists", example: { trace: "t", response: {} } }],
      }),
    ],
    [
      "a.introspect.json",
      report("a", "introspect", {
        profile: "September2025",
        checks: [{ ...new2026("deprecation", "MUST"), since: "September2025", spec: [section("4.2", "Schema Introspection")] }],
        findings: [{ checks: ["deprecation"], cases: 4, since: { September2026: 4 }, fixtures: { directiveDeprecation: 4 }, fixture: "directiveDeprecation", example: { input: "x", response: {} } }],
      }),
    ],
  ]);
  try {
    const run = build(dir);
    assert.equal(run.status, 0, run.stderr);
    const sheet = readFileSync(join(dir, "README.md"), "utf8");
    const page = readFileSync(join(dir, "a.md"), "utf8");
    assert.match(sheet, /\[GraphQL spec\]\(https:\/\/spec\.graphql\.org\/September2026\/\), September 2026 \(latest release\)/);
    assert.match(sheet, /\| ✗ 4\/10 \(3 since September 2025, 1 new in September 2026\) \|/);
    assert.match(sheet, /\| MUST \(SHOULD in September 2025 and October 2021\) \|/);
    assert.match(sheet, /\| MUST \(since September 2025\) \|/);
    assert.match(sheet, /✗ \(since September 2025\) `stringValue`/);
    assert.match(sheet, /✗ \(new in September 2026\) `deprecation`/);
    assert.match(sheet, /- \(new in September 2026\) \[`deprecation`\]/);
    // Only the section numbering's source names the working draft.
    assert.doesNotMatch(sheet, /draft[ -]only|the draft|\(draft/i);
    assert.match(page, /- \*\*Profile:\*\* the September 2025 edition's introspection types/);
    assert.match(page, /- \*\*Vectors relying on rules after October 2021:\*\* since September 2025, 3 of 12 vectors failing; new in September 2026, 1 of 2 vectors failing/);
    assert.match(page, /4 cases, in `escapes` \(4\)\. 3 of them rely on grammar or rules introduced in September 2025 and 1 on ones introduced in September 2026, not in October 2021\./);
    assert.match(page, /4 cases, in `directiveDeprecation` \(4\)\. All rely on grammar or rules introduced in September 2026, not in October 2021\./);
    assert.match(page, /input: {4}\[since September 2025\]/);
    assert.doesNotMatch(page, /draft/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the sheet refuses to build from a format 1 report", () => {
  const dir = sheetDir([["a.parse.json", report("a", "parse", { format: 1, draftOnly: { vectors: 1, failing: 0 } })]]);
  try {
    const run = build(dir);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /a\.parse\.json: format 1/);
    assert.match(run.stderr, /npm run conformance/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an untested check names the capabilities it needs that the adapter lacks", () => {
  const gated = check("streams", "MUST", "untested", { cases: 0, requires: ["subscription-stream"] });
  assert.equal(cell(gated, { capabilities: ["subscription"] }), "– needs `subscription-stream`");
  assert.equal(cell(gated, { capabilities: ["subscription-stream"] }), "–");
  assert.equal(cell(gated), "–");
  assert.equal(cell(check("p", "MUST", "pass", { requires: ["x"] }), { capabilities: [] }), "✓ 10");
  assert.deepEqual(missingCapabilities(gated, { capabilities: [] }), ["subscription-stream"]);
  assert.deepEqual(missingCapabilities({ ...gated, status: "pass" }, { capabilities: [] }), []);
});

test("an area's checks are every report's, so a check only a newer report has isn't dropped", () => {
  const older = { checks: [check("a", "MUST", "pass"), check("b", "MUST", "pass")] };
  const newer = { checks: [check("a", "MUST", "pass"), check("c", "SHOULD", "untested")] };
  assert.deepEqual(areaChecks([older, newer]).map((c) => c.id), ["a", "b", "c"]);
  assert.deepEqual(areaChecks([]), []);
});

test("areas follow kit/areas.mjs, and an area it doesn't list comes last", () => {
  assert.ok(areaOrder("execution") < areaOrder("parse"));
  assert.ok(areaOrder("introspect") < areaOrder("coordinate"));
  assert.equal(areaOrder("not-an-area"), areaOrder("also-not-an-area"));
  assert.ok(areaOrder("coordinate") < areaOrder("not-an-area"));
});

// A coordinate report written by the kit's own run, with an adapter that
// gives the reference's answers, or none for coordinates it can't resolve.
const coordinateReport = async (answer) => {
  const { run, loadVectors } = await import("../../kit/coordinate/run.mjs");
  const { schemas, vectors } = loadVectors();
  const byRequest = new Map(vectors.map((v) => [`${schemas[v.schema]}\u0000${v.coordinate}`, v]));
  let pending;
  const adapter = {
    name: "Fake coordinates",
    capabilities: new Set(["coordinate"]),
    send: (m) => (pending = { type: "result", id: m.id, ...answer(byRequest.get(`${m.sdl}\u0000${m.coordinate}`)) }),
    next: async () => pending,
  };
  return run({ adapter, strict: true, log: () => {} });
};
const reference = (v) => (!v.expected.ok ? { ok: false } : v.expected.error ? { ok: true, error: "raised" } : { ok: true, resolved: v.expected.resolved ?? null });

test("a new area flows from the kit's report into the sheet, and an implementation without it shows n/a", async () => {
  const right = await coordinateReport(reference);
  assert.equal(right.ok, true);
  assert.equal(right.report.area, "coordinate");
  assert.ok(right.report.checks.every((c) => c.status === "pass" && c.since === "September2025"));
  // An implementation that never raises: missingContainers fails, and the
  // informational containerKind passes with "no element".
  const lenient = await coordinateReport((v) => (v.expected.error ? { ok: true, resolved: null } : reference(v)));
  assert.equal(lenient.ok, false);
  const failing = lenient.report.checks.find((c) => c.id === "missingContainers");
  assert.equal(failing.status, "fail");
  assert.deepEqual(failing.failingSince, { September2025: failing.failing });
  assert.equal(lenient.report.checks.find((c) => c.id === "containerKind").status, "pass");
  const dir = sheetDir([
    ["a.coordinate.json", { ...lenient.report, ok: lenient.ok }],
    ["a.parse.json", report("a", "parse", { checks: [{ ...check("names", "MUST", "pass"), spec: [section("2.1.8", "Names")] }] })],
    ["b.parse.json", report("b", "parse", { checks: [{ ...check("names", "MUST", "pass"), spec: [section("2.1.8", "Names")] }] })],
  ]);
  try {
    const built = build(dir);
    assert.equal(built.status, 0, built.stderr);
    const sheet = readFileSync(join(dir, "README.md"), "utf8");
    const page = readFileSync(join(dir, "a.md"), "utf8");
    assert.ok(sheet.indexOf("## Parse: each check") < sheet.indexOf("## Coordinate: each check"));
    assert.match(sheet, /\| A coordinate whose type, field or directive isn't in the schema raises an error \(`missingContainers`\) \| MUST \(since September 2025\) \| \[§2\.14\]\([^)]+\) \| ✗ \d+\/\d+ \(all since September 2025\) \| n\/a \|/);
    assert.match(sheet, /✗ \(since September 2025\) `missingContainers`/);
    assert.match(page, /## Coordinate/);
    assert.match(page, /input: {4}\[since September 2025\] /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
