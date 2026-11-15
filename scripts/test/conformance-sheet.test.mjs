// The conformance sheet's verdicts on synthetic reports: a failing check
// keeps its level's symbol whatever edition its failing cases rely on.
//
// Run with: node --test scripts/test/*.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { cell, fixtureCell, findingLabels, sectionVerdict } from "../conformance-sheet.mjs";

const check = (id, level, status, extra = {}) => ({ id, level, status, cases: 10, failing: status === "fail" ? 4 : 0, spec: [], ...extra });
const draftOnly = (id, level) => check(id, level, "fail", { failingDraftOnly: 4 });
const partlyDraft = (id, level) => check(id, level, "fail", { failingDraftOnly: 1 });

test("a check's cell keeps its level and says how many failing cases are draft only", () => {
  assert.equal(cell(check("m", "MUST", "fail")), "✗ 4/10");
  assert.equal(cell(draftOnly("m", "MUST")), "✗ 4/10 (all draft only)");
  assert.equal(cell(partlyDraft("m", "MUST")), "✗ 4/10 (1 draft only)");
  assert.equal(cell(draftOnly("s", "SHOULD")), "! 4/10 (all draft only)");
  assert.equal(cell(draftOnly("i", "INFO")), "i 4/10 (all draft only)");
  assert.equal(cell(check("a", "ADAPTER", "fail")), "✗ 4/10");
  assert.equal(cell(check("p", "MUST", "pass")), "✓ 10");
  assert.equal(cell(check("u", "MUST", "untested", { cases: 0 })), "–");
  assert.equal(cell(undefined), "n/a");
});

test("a section whose only failure is a draft-only SHOULD is a should, not a MUST failure", () => {
  assert.equal(sectionVerdict([check("p", "MUST", "pass"), draftOnly("s", "SHOULD")]), "! (draft only) `s`");
});

test("a draft-only MUST and an outright SHOULD keep their own levels", () => {
  assert.equal(sectionVerdict([draftOnly("m", "MUST"), check("s", "SHOULD", "fail")]), "✗ (draft only) `m`; ! `s`");
});

test("(draft only) applies only when every failure at that level is draft only", () => {
  assert.equal(sectionVerdict([draftOnly("m1", "MUST"), draftOnly("m2", "MUST")]), "✗ (draft only) `m1` `m2`");
  assert.equal(sectionVerdict([check("m1", "MUST", "fail"), draftOnly("m2", "MUST")]), "✗ `m1`; ✗ (draft only) `m2`");
  // A check with only some draft-only failing cases fails outright.
  assert.equal(sectionVerdict([partlyDraft("m", "MUST")]), "✗ `m`");
  assert.equal(sectionVerdict([check("m", "MUST", "fail"), check("s", "SHOULD", "fail"), draftOnly("s2", "SHOULD")]), "✗ `m`; ! `s`; ! (draft only) `s2`");
});

test("informational checks never make a section fail", () => {
  assert.equal(sectionVerdict([check("p", "MUST", "pass"), check("i", "INFO", "fail")]), "✓; i `i`");
  assert.equal(sectionVerdict([check("i", "INFO", "fail")]), "i `i`");
  assert.equal(sectionVerdict([check("s", "SHOULD", "fail"), draftOnly("i", "INFO")]), "! `s`; i (draft only) `i`");
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

test("a finding is labelled with its level and whether all its cases are draft only", () => {
  const checks = [check("m", "MUST", "fail"), check("s", "SHOULD", "fail"), check("i", "INFO", "fail")];
  assert.deepEqual(findingLabels({ checks: ["m", "s"], cases: 2 }, checks), []);
  assert.deepEqual(findingLabels({ checks: ["s"], cases: 2, draftOnly: 2 }, checks), ["(SHOULD)", "(draft only)"]);
  assert.deepEqual(findingLabels({ checks: ["i"], cases: 2, draftOnly: 1 }, checks), ["(informational)"]);
  assert.deepEqual(findingLabels({ checks: [], cases: 1 }, checks), []);
});
