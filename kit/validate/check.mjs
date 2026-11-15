// Checking an implementation's validation answers against the vectors
// (docs/kit/validate.md). The expected answers come from Validation.tla,
// evaluated once by scripts/generate-vectors-validate.mjs, so checking is
// a comparison per vector:
//
//   - accepting an invalid vector means the rules it breaks aren't
//     enforced: none of them caught it. This is conclusive, and it is the
//     only thing a rule's check rests on. A vector that breaks two rules
//     counts against both.
//   - rejecting a valid vector fails one check, acceptsValid. The kit doesn't
//     know which rule the implementation applied, so the rule the vector is
//     a sibling of is only a hint in the finding.
//
// A rule whose every vector also breaks another rule can't earn a pass: a
// rejection may be the other rule's doing. Its check is "subsumed" instead.
//
// Some vectors aren't graded: those the spec doesn't settle ("unspecified")
// and those that need a capability the adapter lacks ("requires").
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

// The check for valid vectors. §5's introduction: a document is valid when
// it satisfies every rule, and only invalid ones are kept from execution.
// kit/spec-sections.json has no entry for §5 itself, so it is cited here.
export const ACCEPTS_VALID = "acceptsValid";
const VALIDATION = { number: "5", title: "Validation", url: "https://spec.graphql.org/draft/#sec-Validation" };

// A finding names a rule as likely over-strict only when at least this many
// of its valid siblings, each paired with a different invalid vector, are
// rejected, and a valid vector of the same family and rule is accepted.
export const SEVERAL = 3;

const brokenRules = (vector) => Object.keys(vector.violations ?? {}).sort();
const isDraft = (vector) => vector.edition === "draft";

// The vectors an adapter is graded on, and how many are left out and why.
export const gradedVectors = (data, capabilities = []) => {
  const has = new Set(capabilities);
  const graded = [];
  const skipped = {};
  for (const vector of data.vectors) {
    const missing = (vector.requires ?? []).filter((c) => !has.has(c));
    const reasons = [...(vector.unspecified ? ["unspecified"] : []), ...missing];
    if (reasons.length === 0) graded.push(vector);
    for (const r of reasons) skipped[r] = (skipped[r] ?? 0) + 1;
  }
  return { graded, skipped };
};

// For each valid vector, the invalid vectors it is a sibling of, and the
// rules they break: the hint for a rejection. A spec example that is valid
// has no sibling; its hint is its own rule.
const pairing = new WeakMap();
const pairsOf = (data) => {
  if (pairing.has(data)) return pairing.get(data);
  const partners = new Map();
  for (const v of data.vectors) {
    for (const s of v.siblings ?? []) partners.set(s, [...(partners.get(s) ?? []), v]);
  }
  const hints = new Map();
  for (const v of data.vectors) {
    if (!v.expected.valid) continue;
    const mine = partners.get(v.id) ?? [];
    hints.set(v.id, mine.length ? [...new Set(mine.flatMap(brokenRules))].sort() : [v.rule]);
  }
  const result = { partners, hints };
  pairing.set(data, result);
  return result;
};

// The verdict on one answer: "pass", "malformed", "not-enforced" or
// "rejected-valid", and the rules it bears on (for a valid vector, the
// hint).
export const verdict = (data, vector, answer) => {
  if (answer === null || typeof answer !== "object" || typeof answer.valid !== "boolean") {
    return { status: "malformed", rules: [] };
  }
  const rules = vector.expected.valid ? pairsOf(data).hints.get(vector.id) : brokenRules(vector);
  if (answer.valid === vector.expected.valid) return { status: "pass", rules };
  return { status: vector.expected.valid ? "rejected-valid" : "not-enforced", rules };
};

export const judge = (data, vectors, answers) =>
  vectors.map((vector, i) => ({ vector, answer: answers[i], ...verdict(data, vector, answers[i]) }));

const oneLine = (text) => text.replace(/\s+/g, " ").trim();
const cite = (rule, rules) => `§${rules[rule]} ${section(rules[rule]).title}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The report: the facts behind a conformance sheet (docs/kit-areas.md).
export const buildReport = ({ data, judged, strict, selfTest, controls, implementation, capabilities, skipped = {} }) => {
  const { rules } = data;
  const { partners } = pairsOf(data);

  // Per rule: the invalid vectors that exercised it, how many of them break
  // it alone, and how many were accepted.
  const stats = new Map(Object.keys(rules).map((r) => [r, { cases: 0, alone: 0, failing: 0 }]));
  const accepts = { cases: 0, failing: 0 };
  for (const j of judged) {
    if (j.status === "malformed") continue;
    if (j.vector.expected.valid) {
      accepts.cases++;
      if (j.status !== "pass") accepts.failing++;
      continue;
    }
    for (const r of j.rules) {
      const s = stats.get(r);
      s.cases++;
      if (j.rules.length === 1) s.alone++;
      if (j.status !== "pass") s.failing++;
    }
  }

  // A finding per kind of failure and set of rules (for a rejected valid
  // vector, its hint). Its example is the spec's own where there is one,
  // else the shortest document.
  const findings = new Map();
  for (const j of judged) {
    if (j.status === "pass" || j.status === "malformed") continue;
    const key = `${j.status}\u0000${j.rules.join(",")}`;
    const f = findings.get(key) ?? { kind: j.status, rules: j.rules, cases: 0, draft: 0, fixtures: {}, members: [], best: j };
    f.cases++;
    if (isDraft(j.vector)) f.draft++;
    f.members.push(j);
    f.fixtures[j.vector.family] = (f.fixtures[j.vector.family] ?? 0) + 1;
    const rank = (x) => [x.vector.family === "spec" ? 0 : 1, x.vector.document.length];
    const [a, b] = [rank(j), rank(f.best)];
    if (a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])) f.best = j;
    findings.set(key, f);
  }

  // Whether a group of rejected valid vectors points at its rule: several
  // of them, siblings of different invalid vectors, while a valid vector of
  // the same family and hint is accepted.
  const evidence = (f) => {
    const invalidPartners = new Set(f.members.flatMap((j) => (partners.get(j.vector.id) ?? [j.vector]).map((v) => v.id)));
    const families = new Set(f.members.map((j) => j.vector.family));
    const accepted = judged.filter(
      (j) => j.vector.expected.valid && j.status === "pass" && j.rules.join(",") === f.rules.join(",") && families.has(j.vector.family),
    ).length;
    return { likely: f.cases >= SEVERAL && invalidPartners.size >= SEVERAL && accepted > 0, partners: invalidPartners.size, accepted };
  };

  const summary = (f) => {
    const names = f.rules.map((r) => cite(r, rules));
    const draft = f.draft > 0 ? `; ${f.draft === f.cases ? "all" : `${f.draft} of ${f.cases}`} rely on the draft` : "";
    if (f.kind === "rejected-valid") {
      const e = evidence(f);
      if (e.likely) {
        return `rejects valid documents: ${names.join(" or ")} is likely over-strict (${f.cases} valid siblings of ${e.partners} different invalid vectors rejected, ${e.accepted} of the same family accepted)${draft}`;
      }
      const spec = f.members.filter((j) => j.vector.family === "spec").length;
      const near =
        spec === f.cases
          ? `the spec's own examples of documents valid under ${names.join(" and ")}`
          : `each one edit from a document that breaks ${names.length === 1 ? `only ${names[0]}` : `${names.join(" and ")}`}${spec ? ", or the spec's example of a document valid under it" : ""}`;
      return `rejects valid documents, ${near}; the rule it applied is a guess, since the kit doesn't read error messages${draft}`;
    }
    return f.rules.length === 1
      ? `${names[0]} isn't enforced: accepts documents that break only this rule${draft}`
      : `${names.join(" and ")} aren't enforced: accepts documents that break only these rules, so neither caught them${draft}`;
  };
  const expected = (vector) =>
    vector.expected.valid
      ? "valid"
      : `invalid: ${brokenRules(vector).map((r) => `${r} ${JSON.stringify(vector.violations[r])}`).join(", ")}`;

  // Rules no vector breaks alone.
  const notes = {};
  for (const rule of Object.keys(rules)) {
    const mine = data.vectors.filter((v) => !v.expected.valid && brokenRules(v).includes(rule));
    if (mine.length > 0 && mine.every((v) => brokenRules(v).length > 1)) {
      const others = [...new Set(mine.flatMap((v) => brokenRules(v)).filter((r) => r !== rule))];
      notes[rule] = `every document that breaks this rule also breaks ${others.map((r) => cite(r, rules)).join(", ")}, which subsumes it, so a rejection can't be credited to this rule; accepting one fails both`;
    }
  }

  const status = (s) => (s.failing > 0 ? "fail" : s.alone > 0 ? "pass" : s.cases > 0 ? "subsumed" : "untested");
  const malformed = judged.filter((j) => j.status === "malformed").length;
  const failing = judged.filter((j) => j.status !== "pass" && j.status !== "malformed");
  return {
    format: REPORT_FORMAT,
    area: "validate",
    implementation,
    capabilities: [...capabilities].sort(),
    provenance: provenance({ strict, vectors: data.vectors.length, graded: judged.length, skipped }),
    checkerSelfTest: selfTest ? `passed (${controls} negative controls)` : "failed",
    cases: { submitted: judged.length, distinct: judged.length, malformed },
    adapterProblems: malformed,
    draftOnly: { vectors: judged.filter((j) => isDraft(j.vector)).length, failing: failing.filter((j) => isDraft(j.vector)).length },
    checks: [
      ...Object.keys(rules).map((rule) => {
        const s = stats.get(rule);
        return {
          id: checkId(rule),
          title: section(rules[rule]).title,
          level: "MUST",
          spec: [section(rules[rule])],
          status: status(s),
          cases: s.cases,
          failing: s.failing,
          ...(notes[rule] ? { note: notes[rule] } : {}),
        };
      }),
      {
        id: ACCEPTS_VALID,
        title: "Valid documents are accepted",
        level: "MUST",
        spec: [VALIDATION],
        status: accepts.failing > 0 ? "fail" : accepts.cases > 0 ? "pass" : "untested",
        cases: accepts.cases,
        failing: accepts.failing,
        basis:
          "a document is valid when it satisfies every rule of §5, and only invalid requests are kept from execution (§6.1.1); rejecting a valid document applies a rule the spec doesn't have",
      },
    ],
    findings: [...findings.values()]
      .sort((a, b) => b.cases - a.cases)
      .map((f) => {
        const likely = f.kind === "rejected-valid" && evidence(f).likely;
        return {
          checks: f.kind === "rejected-valid" ? [ACCEPTS_VALID] : f.rules.map(checkId),
          ...(f.kind === "rejected-valid" ? { hint: f.rules.map(checkId), likelyOverStrict: likely } : {}),
          summary: summary(f),
          cases: f.cases,
          draftOnly: f.draft,
          fixtures: f.fixtures,
          fixture: f.best.vector.family,
          ...(f.best.answer?.errors?.[0]?.message ? { problem: String(f.best.answer.errors[0].message) } : {}),
          example: {
            input: `${isDraft(f.best.vector) ? "[draft] " : ""}${f.best.vector.id}: ${oneLine(f.best.vector.document)}`,
            response: f.best.answer,
            expected: expected(f.best.vector),
          },
        };
      }),
    fixtures: [],
  };
};

// The self-test: answers that are wrong on purpose, each of which the
// checker must catch, plus the reference's own answers, which it must not.
export const selfTest = (data, vectors = gradedVectors(data).graded) => {
  const failures = [];
  const { partners } = pairsOf(data);
  const report = (answers) =>
    buildReport({ data, judged: judge(data, vectors, answers), strict: false, selfTest: true, controls: 0, implementation: "self-test", capabilities: [] });
  const statusOf = (r, id) => r.checks.find((c) => c.id === id).status;
  const subsumed = Object.keys(data.rules).filter((rule) => {
    const mine = vectors.filter((v) => !v.expected.valid && brokenRules(v).includes(rule));
    return mine.length > 0 && mine.every((v) => brokenRules(v).length > 1);
  });
  const right = vectors.map((v) => ({ valid: v.expected.valid }));
  if (vectors.some((v) => v.unspecified)) failures.push("an unspecified vector is graded");

  // A vector of the opposite verdict: a sibling, the vector a valid one is
  // the sibling of, or another vector of the same rule.
  const graded = new Set(vectors.map((v) => v.id));
  const byId = new Map(vectors.map((v) => [v.id, v]));
  const partner = (v) => {
    const near = [...(v.siblings ?? []), ...(partners.get(v.id) ?? []).map((w) => w.id)].find((id) => graded.has(id));
    if (near) return byId.get(near);
    return vectors.find((w) => w.rule === v.rule && w.expected.valid !== v.expected.valid) ?? vectors.find((w) => w.expected.valid !== v.expected.valid);
  };

  // Each control: its answers, which vectors the checker must flag, and
  // what the report must then say.
  const caught = (answers, which, name) => {
    const judged = judge(data, vectors, answers);
    const missed = judged.filter((j, i) => which(vectors[i]) && (j.status === "pass" || j.status === "malformed"));
    if (missed.length > 0) failures.push(`${name}: ${missed.length} vectors not caught, e.g. ${missed[0].vector.id}`);
  };
  const controls = [
    () => {
      const name = "every verdict flipped";
      const answers = vectors.map((v) => ({ valid: !v.expected.valid }));
      caught(answers, () => true, name);
      const r = report(answers);
      const credited = r.checks.filter((c) => c.status === "pass" || c.status === "subsumed");
      if (credited.length > 0) failures.push(`${name}: the report still credits ${credited.map((c) => c.id).join(", ")}`);
    },
    () => {
      const name = "answers taken from a different vector";
      const answers = vectors.map((v) => ({ ...partner(v).expected }));
      caught(answers, () => true, name);
      const r = report(answers);
      const credited = r.checks.filter((c) => c.status === "pass" || c.status === "subsumed");
      if (credited.length > 0) failures.push(`${name}: the report still credits ${credited.map((c) => c.id).join(", ")}`);
    },
    () => {
      const name = "valid as a string";
      const judged = judge(data, vectors, vectors.map((v) => ({ valid: String(v.expected.valid) })));
      const missed = judged.filter((j) => j.status !== "malformed");
      if (missed.length > 0) failures.push(`${name}: ${missed.length} vectors not caught, e.g. ${missed[0].vector.id}`);
    },
    // Rejecting everything fails acceptsValid and no rule: over-strictness
    // is never blamed on a rule, and a subsumed rule earns no pass.
    () => {
      const name = "every document rejected";
      const answers = vectors.map(() => ({ valid: false }));
      caught(answers, (v) => v.expected.valid, name);
      const r = report(answers);
      if (statusOf(r, ACCEPTS_VALID) !== "fail") failures.push(`${name}: ${ACCEPTS_VALID} doesn't fail`);
      const blamed = r.checks.filter((c) => c.id !== ACCEPTS_VALID && c.status === "fail");
      if (blamed.length > 0) failures.push(`${name}: rule checks fail: ${blamed.map((c) => c.id).join(", ")}`);
      const credited = subsumed.filter((rule) => statusOf(r, checkId(rule)) !== "subsumed");
      if (credited.length > 0) failures.push(`${name}: ${credited.map(checkId).join(", ")} not reported as subsumed`);
    },
    // Accepting everything fails every rule that has a vector, the subsumed
    // ones included.
    () => {
      const name = "every document accepted";
      const answers = vectors.map(() => ({ valid: true }));
      caught(answers, (v) => !v.expected.valid, name);
      const r = report(answers);
      const spared = r.checks.filter((c) => c.id !== ACCEPTS_VALID && c.cases > 0 && c.status !== "fail");
      if (spared.length > 0) failures.push(`${name}: rule checks don't fail: ${spared.map((c) => c.id).join(", ")}`);
    },
    // One rejected valid vector is no evidence against its rule.
    () => {
      const name = "one valid vector rejected";
      const target = vectors.find((v) => v.expected.valid);
      const answers = vectors.map((v, i) => (v === target ? { valid: false } : right[i]));
      caught(answers, (v) => v === target, name);
      const r = report(answers);
      if (statusOf(r, ACCEPTS_VALID) !== "fail") failures.push(`${name}: ${ACCEPTS_VALID} doesn't fail`);
      if (r.findings.some((f) => f.likelyOverStrict)) failures.push(`${name}: a finding names a rule as likely over-strict`);
    },
    // Several siblings of one rule rejected, with others of the same family
    // accepted, is.
    () => {
      const name = "several valid siblings of one rule rejected";
      const groups = new Map();
      for (const v of vectors) {
        if (!v.expected.valid || !partners.has(v.id)) continue;
        const key = `${pairsOf(data).hints.get(v.id).join(",")}\u0000${v.family}`;
        groups.set(key, [...(groups.get(key) ?? []), v]);
      }
      // Siblings of different invalid vectors, and one left over.
      const pick = (list) => {
        const used = new Set();
        const out = [];
        for (const v of list) {
          const ids = partners.get(v.id).map((w) => w.id);
          if (ids.some((id) => used.has(id))) continue;
          ids.forEach((id) => used.add(id));
          out.push(v);
          if (out.length === SEVERAL) break;
        }
        return out.length === SEVERAL && list.length > SEVERAL ? out : null;
      };
      const chosen = [...groups.values()].map(pick).find(Boolean);
      if (!chosen) return failures.push(`${name}: no rule has ${SEVERAL + 1} valid siblings in one family`);
      const answers = vectors.map((v, i) => (chosen.includes(v) ? { valid: false } : right[i]));
      caught(answers, (v) => chosen.includes(v), name);
      const r = report(answers);
      if (!r.findings.some((f) => f.likelyOverStrict)) failures.push(`${name}: no finding names the rule as likely over-strict`);
    },
  ];
  for (const control of controls) control();

  // The reference's own answers: nothing flagged, and subsumed rules
  // reported as such.
  const own = report(right);
  if (own.findings.length > 0 || own.checks.some((c) => c.status === "fail")) failures.push("the reference's own answers are flagged");
  const credited = subsumed.filter((rule) => statusOf(own, checkId(rule)) !== "subsumed");
  if (credited.length > 0) failures.push(`the reference's own answers: ${credited.map(checkId).join(", ")} not reported as subsumed`);

  return { ok: failures.length === 0, failures, controls: controls.length };
};

// Compares the answers to the graded vectors with the reference, and
// reports.
export const check = (data, vectors, answers, { strict = false, log = console.log, implementation = "unknown", capabilities = [], skipped = {} } = {}) => {
  const judged = judge(data, vectors, answers);
  const test = selfTest(data, vectors);
  const report = buildReport({ data, judged, strict, selfTest: test.ok, controls: test.controls, implementation, capabilities, skipped });

  const invalid = judged.filter((j) => !j.vector.expected.valid).length;
  const skippedText = Object.entries(skipped).map(([r, n]) => (r === "unspecified" ? `${n} unspecified` : `${n} need ${r}`)).join(", ");
  log(`  ${judged.length} vectors graded (${invalid} invalid, ${judged.length - invalid} valid) over ${Object.keys(data.rules).length} rules${skippedText ? `; not graded: ${skippedText}` : ""}`);
  for (const f of report.findings) {
    log(`✗ ${f.summary} (${plural(f.cases, "vector")})`);
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
  if (passed < judged.length - malformed) {
    log(`  ${report.draftOnly.failing} of the ${judged.length - malformed - passed} failing vectors rely on the draft (of ${report.draftOnly.vectors} draft-only vectors graded)`);
  }
  const subsumed = report.checks.filter((c) => c.status === "subsumed");
  if (subsumed.length > 0) log(`~ subsumed, can't pass alone: ${subsumed.map((c) => c.id).join(", ")}`);
  const untested = report.checks.filter((c) => c.status === "untested");
  if (untested.length > 0) log(`! untested: ${untested.map((c) => c.id).join(", ")}`);
  if (test.ok) log(`✓ the checker catches all ${test.controls} negative controls`);
  else for (const f of test.failures) log(`✗ self-test: ${f}`);

  // Every check is a MUST, so --strict changes nothing yet.
  const ok = test.ok && malformed === 0 && report.checks.every((c) => c.status !== "fail");
  return { ok, report };
};
