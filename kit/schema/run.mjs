// The schema area (docs/kit/schema.md): is an SDL schema valid, per the
// type system rules of §3? The vectors are minimal pairs judged by
// TypeSystem!Verdict (scripts/generate-vectors-schema.mjs):
//
//   - accepting an invalid schema means its rule isn't enforced. That is
//     conclusive, and it is the only thing a rule's check rests on.
//   - rejecting a valid sibling fails one check, acceptsValid. The kit
//     doesn't know which rule the implementation applied, so the rule the
//     sibling's pair breaks is only a hint. Rejections are grouped by the
//     shape of the implementation's first error message, so that one rule
//     the spec doesn't have, rejecting siblings of several rules, is one
//     finding, not one per rule.
//
// A crash is a third kind of failure. The kit can only see one when the
// adapter answers a vector with an `error` message instead of a result:
// an implementation that throws inside schema building, and whose adapter
// reports that as an error, crashes. On an invalid schema a crash fails the
// rule, as accepting it would; on a valid one it fails acceptsValid. A
// crash is never draft only: whatever a schema's verdict in October 2021,
// a crash isn't it. An adapter that turns every exception into
// `valid: false` hides its crashes as rejections.
//
// Vectors marked `unspecified` rest on a reading the spec's formal text
// doesn't settle. They aren't sent to the adapter or graded.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Crash, answerOrCrash, crashResponse } from "../areas.mjs";
import { REPORT_FORMAT, provenance, section } from "../report.mjs";
import { RULE, RULES, UNWRITABLE } from "./rules.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");

export const loadVectors = () => JSON.parse(readFileSync(join(root, "kit/schema/vectors.json"), "utf8")).vectors;

// The vectors an adapter is graded on, and how many are left out and why.
export const gradedVectors = (vectors) => {
  const graded = vectors.filter((v) => !v.unspecified);
  const skipped = vectors.length > graded.length ? { unspecified: vectors.length - graded.length } : {};
  return { graded, skipped };
};

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export { Crash };

// The adapter's answer to one vector, or a Crash.
const answer = (adapter, sdl) => answerOrCrash(adapter, "schema", { sdl });

// What one answer says about one vector: "pass", "malformed", "crash", or
// the way it fails: "not enforced" for an accepted invalid schema,
// "over-strict" for a rejected valid one.
export const judge = (vector, answer) => {
  if (answer instanceof Crash) return "crash";
  if (answer === null || typeof answer !== "object" || typeof answer.valid !== "boolean") return "malformed";
  if (answer.valid === vector.expected.valid) return "pass";
  return vector.expected.valid ? "over-strict" : "not enforced";
};

// Whether a failing vector is draft only: an implementation of October
// 2021 could give that answer and still follow its edition. A crash never
// is (docs/kit/schema.md, "Editions").
export const draftOnly = (vector, verdict) => vector.edition === "draft" && verdict !== "crash" && verdict !== "pass" && verdict !== "malformed";

// The check for valid schemas. kit/spec-sections.json has no entry for §3
// itself, so it is cited here.
export const ACCEPTS_VALID = "acceptsValid";
const TYPE_SYSTEM = { number: "3", title: "Type System", url: "https://spec.graphql.org/draft/#sec-Type-System" };

// The implementation's message for a rejection or a crash: the first
// error's first line.
const messageOf = (answer) => {
  if (answer instanceof Crash) return answer.message;
  const first = Array.isArray(answer?.errors) ? answer.errors[0] : undefined;
  if (first === undefined || first === null) return undefined;
  const text = typeof first === "object" ? (first.message ?? JSON.stringify(first)) : first;
  return String(text).split("\n")[0].trim().slice(0, 200) || undefined;
};

// A message with the schema's own names taken out, so that the same error
// on two schemas has the same shape: quoted text, names the SDL defines
// that start with a capital letter or @, the dotted paths they begin, and
// numbers. Lower-case names stay, since they are also English words.
const KEEP = new Set(["Int", "Float", "String", "Boolean", "ID", "@deprecated", "@oneOf", "@specifiedBy", "@include", "@skip"]);
const LOCATION = /^[A-Z][A-Z_]*_[A-Z_]*$|^(QUERY|MUTATION|SUBSCRIPTION|FIELD|FRAGMENT_SPREAD|SCHEMA|SCALAR|OBJECT|INTERFACE|UNION|ENUM)$/;
export const messageShape = (message, sdl) => {
  const names = new Set((sdl.match(/@?[_A-Za-z][_0-9A-Za-z]*/g) ?? []).filter((w) => /^@|^[_A-Z]/.test(w) && !KEEP.has(w) && !LOCATION.test(w)));
  return message
    .replace(/`[^`]*`|"[^"]*"|\u201c[^\u201d]*\u201d/g, "\u2026")
    .replace(/@?[_A-Za-z][_0-9A-Za-z]*/g, (w) => (names.has(w) ? "\u2026" : w))
    .replace(/\u2026(?:\.@?[_A-Za-z0-9\u2026]+)+/g, "\u2026")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim();
};

const SUMMARY = {
  "not enforced": (r) => `${r.rule} not enforced: accepts a schema that breaks only this rule`,
  "crash invalid": (r) => `${r.rule}: crashes on a schema that breaks only this rule, instead of rejecting it`,
};

const list = (names) => (names.length <= 2 ? names.join(" or ") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`);

// A finding of valid schemas rejected, or crashed on, with one message.
// The rules their invalid siblings break are only a hint. One rule, with
// several of its pairs rejected the same way while another of its valid
// siblings is accepted, is likely over-strict; a message shared by the
// siblings of different rules points at one cause, not at any of them.
const validSummary = (f) => {
  const draft = f.draftOnly ? `; ${f.draftOnly === f.cases ? "all" : `${f.draftOnly} of ${f.cases}`} rely on the draft` : "";
  const n = f.cases === 1 ? "a valid schema" : `${f.cases} valid schemas`;
  if (f.kind === "crash") return `crashes on ${n} instead of accepting ${f.cases === 1 ? "it" : "them"}; hint: ${list(f.hint)}, the rule${f.hint.length === 1 ? "" : "s"} their invalid siblings break`;
  if (f.hint.length > 1) {
    return `rejects ${n} with the same error, one edit from schemas that break ${list(f.hint)}: one cause, which the pairs don't pin on any one rule; the message says what the implementation checked${draft}`;
  }
  if (f.likelyOverStrict) return `rejects ${n} with the same error, each one edit from a schema that breaks only ${f.hint[0]}, while another valid sibling of it is accepted: ${f.hint[0]} is likely over-strict${draft}`;
  return `rejects ${n}, one edit from ${f.cases === 1 ? "a schema" : "schemas"} that break${f.cases === 1 ? "s" : ""} only ${f.hint[0]}; which rule it applied is a guess: the message says what the implementation checked${draft}`;
};

// The checker's self-test: deliberately wrong answers it must flag, and
// the reference's own answers, which it must pass.
const selfTest = (vectors) => {
  const problems = [];
  let controls = 0;
  const control = (bad, problem) => {
    controls++;
    if (bad) problems.push(problem);
  };
  if (vectors.some((v) => v.unspecified)) problems.push("an unspecified vector is graded");
  vectors.forEach((v, i) => {
    control(judge(v, { valid: !v.expected.valid }) === "pass", `a flipped verdict for ${v.id} passed`);
    const other = vectors[(i + 1) % vectors.length];
    if (other.expected.valid !== v.expected.valid) control(judge(v, other.expected) === "pass", `${other.id}'s answer for ${v.id} passed`);
    if (judge(v, v.expected) !== "pass") problems.push(`the reference's own answer for ${v.id} failed`);
  });
  control(judge(vectors[0], { valid: "yes" }) !== "malformed", "an answer without a boolean `valid` wasn't flagged");
  // A crash fails a valid and an invalid schema alike, whatever else the
  // answer says.
  const crash = (v) => Object.assign(new Crash("RangeError: Maximum call stack size exceeded"), { valid: v.expected.valid });
  for (const v of [vectors.find((x) => x.expected.valid), vectors.find((x) => !x.expected.valid)]) {
    control(judge(v, crash(v)) !== "crash", `a crash on ${v.id} wasn't flagged as a crash`);
  }
  // Reports built from answers that are right but for a few.
  const right = () => vectors.map((v) => ({ valid: v.expected.valid }));
  const report = (answers) => buildReport({ vectors, answers, strict: false, implementation: "self-test", capabilities: [], selfTestText: "" });
  const check = (r, id) => r.checks.find((c) => c.id === id);
  // A crash on a draft-only invalid schema is a failure under October 2021
  // too.
  const draftInvalid = vectors.find((v) => v.edition === "draft" && !v.expected.valid);
  if (draftInvalid) {
    const answers = right();
    answers[vectors.indexOf(draftInvalid)] = crash(draftInvalid);
    const r = report(answers);
    control(r.draftOnly.failing !== 0 || check(r, RULE.get(draftInvalid.rule).id).failingDraftOnly !== 0, `a crash on ${draftInvalid.id} counted as draft only`);
    control(r.findings.some((f) => f.edition === "draft" || f.draftOnly), `the finding for a crash on ${draftInvalid.id} is marked draft only`);
  }
  // A rejected valid schema fails acceptsValid, not its pair's rule; a
  // crash on one does too.
  const valid = vectors.find((v) => v.expected.valid);
  for (const answer of [{ valid: false }, crash(valid)]) {
    const answers = right();
    answers[vectors.indexOf(valid)] = answer;
    const r = report(answers);
    const what = answer instanceof Crash ? "a crash on" : "rejecting";
    control(check(r, RULE.get(valid.rule).id).status === "fail", `${what} ${valid.id} failed its pair's rule`);
    control(check(r, ACCEPTS_VALID).status !== "fail", `${what} ${valid.id} didn't fail ${ACCEPTS_VALID}`);
    control(r.findings.some((f) => f.likelyOverStrict), `${what} the single ${valid.id} called a rule likely over-strict`);
  }
  // One error message on valid siblings of different rules is one finding,
  // and names no rule as likely over-strict.
  const two = [];
  for (const v of vectors) if (v.expected.valid && !two.some((w) => w.rule === v.rule) && two.length < 2) two.push(v);
  {
    const answers = right();
    for (const v of two) answers[vectors.indexOf(v)] = { valid: false, errors: ["There is no object type implementing interface `X`."] };
    const r = report(answers);
    control(r.findings.length !== 1, `one message on ${two.map((v) => v.id).join(" and ")} gave ${r.findings.length} findings`);
    control(r.findings.some((f) => f.likelyOverStrict), `one message on siblings of two rules called a rule likely over-strict`);
  }
  return { problems, controls };
};

export const buildReport = ({ vectors, answers, strict, implementation, capabilities, selfTestText, total = vectors.length, skipped = {} }) => {
  const stats = new Map(RULES.map((r) => [r.rule, { cases: 0, failing: 0, failingDraftOnly: 0 }]));
  const accepts = { cases: 0, failing: 0, failingDraftOnly: 0 };
  const findings = new Map();
  const judged = vectors.map((v, i) => ({ vector: v, answer: answers[i], verdict: judge(v, answers[i]) }));
  let malformed = 0;
  for (const { vector: v, answer, verdict } of judged) {
    if (verdict === "malformed") {
      malformed++;
      const f = findings.get("malformed") ?? {
        checks: [],
        kind: "malformed",
        summary: "the adapter's answer has no boolean `valid`",
        cases: 0,
        fixtures: {},
        fixture: v.id,
        example: { input: v.sdl, response: answer, expected: "{ valid: boolean }" },
      };
      f.cases++;
      f.fixtures[v.family] = (f.fixtures[v.family] ?? 0) + 1;
      findings.set("malformed", f);
      continue;
    }
    const s = v.expected.valid ? accepts : stats.get(v.rule);
    s.cases++;
    if (verdict === "pass") continue;
    s.failing++;
    const draft = draftOnly(v, verdict);
    if (draft) s.failingDraftOnly++;
    const r = RULE.get(v.rule);
    const crash = answer instanceof Crash;
    const message = messageOf(answer);
    // Invalid schemas: one finding per rule and kind (and crash message).
    // Valid ones: one per kind and message shape, whatever the rule.
    const key = v.expected.valid
      ? `valid\u0000${verdict}\u0000${message === undefined ? `rule ${v.rule}` : `message ${messageShape(message, v.sdl)}`}`
      : `${v.rule}\u0000${verdict}${crash ? `\u0000${messageShape(message, v.sdl)}` : ""}`;
    const example = {
      input: `${draft ? "[draft] " : ""}${v.sdl}`,
      response: crash ? crashResponse(answer) : answer,
      expected: v.expected.valid ? "valid (TypeSystem!Verdict is empty)" : `invalid: breaks ${v.rule} and no other rule`,
    };
    const f = findings.get(key) ?? {
      ...(crash ? { kind: "crash" } : { kind: verdict }),
      checks: [v.expected.valid ? ACCEPTS_VALID : r.id],
      valid: v.expected.valid,
      rule: r,
      rules: new Set(),
      members: [],
      cases: 0,
      fixtures: {},
      draftOnly: 0,
    };
    f.cases++;
    f.members.push(v);
    f.rules.add(r.id);
    f.fixtures[v.family] = (f.fixtures[v.family] ?? 0) + 1;
    if (draft) f.draftOnly++;
    if (f.length === undefined || v.sdl.length < f.length) Object.assign(f, { fixture: v.id, example, length: v.sdl.length, problem: message });
    findings.set(key, f);
  }

  // Whether rejected valid siblings of one rule point at it: siblings of at
  // least two of its pairs rejected with the same message, while one of its
  // valid siblings is accepted.
  const likely = (f) => {
    if (f.kind !== "over-strict" || f.rules.size !== 1 || f.problem === undefined) return false;
    const pairs = new Set(f.members.map((v) => v.pair));
    const accepted = judged.some((j) => j.vector.expected.valid && j.vector.rule === f.rule.rule && j.verdict === "pass");
    return pairs.size >= 2 && accepted;
  };

  const out = [...findings.values()].map((f) => {
    if (f.kind === "malformed") return f;
    const hint = [...f.rules].sort();
    const base = { kind: f.kind, checks: f.checks };
    let summary;
    if (f.valid) {
      Object.assign(base, { hint, ...(f.kind === "over-strict" ? { likelyOverStrict: likely(f) } : {}) });
      summary = validSummary({ ...f, hint, likelyOverStrict: base.likelyOverStrict });
    } else summary = SUMMARY[f.kind === "crash" ? "crash invalid" : f.kind](f.rule);
    return {
      ...base,
      summary,
      cases: f.cases,
      fixtures: f.fixtures,
      fixture: f.fixture,
      ...(f.problem !== undefined ? { problem: f.problem } : {}),
      example: f.example,
      ...(f.draftOnly ? { draftOnly: f.draftOnly } : {}),
      // A finding whose every vector is draft only.
      ...(f.draftOnly && f.draftOnly === f.cases ? { edition: "draft" } : {}),
    };
  });

  return {
    format: REPORT_FORMAT,
    area: "schema",
    implementation,
    capabilities: [...capabilities].sort(),
    provenance: provenance({ strict, vectors: total, graded: vectors.length, skipped }),
    checkerSelfTest: selfTestText,
    cases: { submitted: vectors.length, distinct: vectors.length, malformed },
    adapterProblems: malformed,
    draftOnly: {
      vectors: vectors.filter((v) => v.edition === "draft").length,
      failing: judged.filter((j) => draftOnly(j.vector, j.verdict)).length,
    },
    checks: [
      ...RULES.map((r) => {
        const s = stats.get(r.rule);
        // A draft-only rule's failures that aren't draft only: crashes,
        // which October 2021 doesn't allow either.
        const crashes = s.failing - s.failingDraftOnly;
        return {
          id: r.id,
          title: r.title,
          level: r.level,
          spec: r.spec.map(section),
          status: s.failing > 0 ? "fail" : s.cases > 0 ? "pass" : "untested",
          cases: s.cases,
          failing: s.failing,
          failingDraftOnly: s.failingDraftOnly,
          ...(r.edition
            ? {
                edition: r.edition,
                note: `Draft only: the October 2021 edition doesn't have ${r.draft}${crashes > 0 ? `. ${plural(crashes, "failing case")} ${crashes === 1 ? "is a crash, which fails" : "are crashes, which fail"} under October 2021 too` : ""}`,
              }
            : {}),
          ...(UNWRITABLE[r.rule] ? { note: UNWRITABLE[r.rule] } : {}),
        };
      }),
      {
        id: ACCEPTS_VALID,
        title: "Valid schemas are accepted",
        level: "MUST",
        spec: [TYPE_SYSTEM],
        status: accepts.failing > 0 ? "fail" : accepts.cases > 0 ? "pass" : "untested",
        cases: accepts.cases,
        failing: accepts.failing,
        failingDraftOnly: accepts.failingDraftOnly,
        basis:
          "a schema is invalid only when it breaks a Type Validation rule of §3 or §4's Reserved Names; rejecting, or crashing on, a schema that breaks none applies a rule the spec doesn't have",
      },
    ],
    findings: out.sort((a, b) => b.cases - a.cases),
    fixtures: [],
  };
};

export const run = async ({ adapter, strict, log = console.log }) => {
  const all = loadVectors();
  const { graded: vectors, skipped } = gradedVectors(all);
  const answers = [];
  for (const v of vectors) answers.push(await answer(adapter, v.sdl));

  const test = selfTest(vectors);
  for (const p of test.problems) log(`✗ self-test: ${p}`);
  const selfTestText = test.problems.length === 0 ? `passed (${test.controls} negative controls)` : "failed";
  const report = buildReport({
    vectors,
    answers,
    strict,
    implementation: adapter.name,
    capabilities: adapter.capabilities,
    selfTestText,
    total: all.length,
    skipped,
  });

  const failingChecks = report.checks.filter((c) => c.status === "fail");
  const passed = vectors.length - report.findings.reduce((n, f) => n + f.cases, 0);
  const crashes = answers.filter((a) => a instanceof Crash).length;
  const notGraded = skipped.unspecified ? `; ${skipped.unspecified} unspecified not graded` : "";
  log(`${passed === vectors.length ? "✓" : "✗"} ${passed} of ${vectors.length} schemas judged as TypeSystem.tla judges them${crashes ? ` (${crashes} crashed)` : ""}${notGraded}`);
  const draft = (f) => (f.draftOnly ? `, ${f.draftOnly === f.cases ? "all" : f.draftOnly} draft only` : "");
  for (const f of report.findings) log(`  ✗ ${f.summary} (${plural(f.cases, "schema")}${draft(f)}, e.g. ${f.fixture}: ${f.example.input})`);
  const tested = report.checks.filter((c) => c.status !== "untested").length;
  log(`  ${tested - failingChecks.length} of ${tested} checks pass; ${report.checks.length - tested} untested`);
  if (test.problems.length === 0) log(`✓ the checker catches all ${test.controls} negative controls`);
  // Every check is a MUST.
  const ok = test.problems.length === 0 && report.adapterProblems === 0 && failingChecks.length === 0;
  return { ok, report };
};
