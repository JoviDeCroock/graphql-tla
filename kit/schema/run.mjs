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
// crash is never tagged by release: whatever a schema's verdict in an
// older release, a crash isn't it. An adapter that turns every exception
// into `valid: false` hides its crashes as rejections.
//
// The expected answers are September 2026's. A vector tagged `since` a
// release relies on rules or syntax that release introduced; a failure on
// it that is a verdict is counted under that release, so an
// implementation of an older one can tell those apart.
//
// Vectors marked `unspecified` rest on a reading the spec's formal text
// doesn't settle. They aren't sent to the adapter or graded. Vectors whose
// SDL has type system extensions `require` the schema-extensions
// capability, and are asked only of adapters that claim it.
//
// Every check is a MUST but two INFO ones (kit/schema/rules.mjs), which
// record what an implementation does where §3 states no rule and never
// fail the run.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Crash, answerOrCrash, crashResponse } from "../areas.mjs";
import { REPORT_FORMAT, provenance, section } from "../report.mjs";
import { RELEASES, RULE, RULES, UNGRADED, UNWRITABLE, releaseName } from "./rules.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");

export const loadVectors = () => JSON.parse(readFileSync(join(root, "kit/schema/vectors.json"), "utf8")).vectors;

// The vectors an adapter is graded on, and how many are left out and why:
// `unspecified`, or a capability the adapter doesn't claim. A vector left
// out for several reasons counts under each.
export const gradedVectors = (vectors, capabilities = []) => {
  const has = new Set(capabilities);
  const graded = [];
  const skipped = {};
  for (const v of vectors) {
    const reasons = [...(v.unspecified ? ["unspecified"] : []), ...(v.requires ?? []).filter((c) => !has.has(c))];
    if (reasons.length === 0) graded.push(v);
    for (const r of reasons) skipped[r] = (skipped[r] ?? 0) + 1;
  }
  return { graded, skipped };
};

// The capabilities every vector of a rule needs: a check whose vectors all
// need one is untested for that reason, not unreached, for an adapter
// without it (docs/kit-areas.md, "requires").
export const ruleRequires = (vectors) => {
  const out = new Map();
  for (const v of vectors) {
    const needs = v.requires ?? [];
    out.set(v.rule, out.has(v.rule) ? out.get(v.rule).filter((c) => needs.includes(c)) : needs);
  }
  return out;
};

// Whether a failing check fails the run: a MUST, or a SHOULD with --strict.
// INFO checks never do.
export const fatal = (level, strict) => level === "MUST" || (strict && level === "SHOULD");

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

// The release a failing vector relies on, if any: an implementation of
// the release before it could give that answer and still follow its
// edition. A crash never relies on one (docs/kit/schema.md, "Editions").
export const failingSince = (vector, verdict) =>
  vector.since !== undefined && verdict !== "crash" && verdict !== "pass" && verdict !== "malformed" ? vector.since : undefined;

// Counts by release, without zeros, in release order.
const countsByRelease = (counts) => Object.fromEntries(RELEASES.filter((r) => counts[r] > 0).map((r) => [r, counts[r]]));
const bump = (counts, release) => {
  if (release !== undefined) counts[release] = (counts[release] ?? 0) + 1;
};
const sum = (counts) => Object.values(counts).reduce((n, k) => n + k, 0);
// "2 since September 2025, 1 since September 2026"
const sinceText = (counts) =>
  RELEASES.filter((r) => counts[r] > 0)
    .map((r) => `${counts[r]} since ${releaseName(r)}`)
    .join(", ");

// The check for valid schemas. kit/spec-sections.json has no entry for §3
// itself, so it is cited here.
export const ACCEPTS_VALID = "acceptsValid";
const TYPE_SYSTEM = { number: "3", title: "Type System", url: "https://spec.graphql.org/September2026/#sec-Type-System" };

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
  "not enforced": (r) =>
    `${r.rule} not enforced: accepts a schema that breaks only this rule${r.level === "INFO" ? " (informational: §3 states no such rule)" : ""}`,
  "crash invalid": (r) => `${r.rule}: crashes on a schema that breaks only this rule, instead of rejecting it`,
};

const list = (names) => (names.length <= 2 ? names.join(" or ") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`);

// A finding of valid schemas rejected, or crashed on, with one message.
// The rules their invalid siblings break are only a hint. One rule, with
// several of its pairs rejected the same way while another of its valid
// siblings is accepted, is likely over-strict; a message shared by the
// siblings of different rules points at one cause, not at any of them.
const validSummary = (f) => {
  const tagged = sum(f.since);
  const releases = Object.keys(f.since);
  const since = !tagged
    ? ""
    : tagged === f.cases && releases.length === 1
      ? `; all rely on ${releaseName(releases[0])}`
      : `; of ${f.cases}, ${sinceText(f.since)}`;
  const n = f.cases === 1 ? "a valid schema" : `${f.cases} valid schemas`;
  if (f.kind === "crash") return `crashes on ${n} instead of accepting ${f.cases === 1 ? "it" : "them"}; hint: ${list(f.hint)}, the rule${f.hint.length === 1 ? "" : "s"} their invalid siblings break`;
  if (f.hint.length > 1) {
    return `rejects ${n} with the same error, one edit from schemas that break ${list(f.hint)}: one cause, which the pairs don't pin on any one rule; the message says what the implementation checked${since}`;
  }
  if (f.likelyOverStrict) return `rejects ${n} with the same error, each one edit from a schema that breaks only ${f.hint[0]}, while another valid sibling of it is accepted: ${f.hint[0]} is likely over-strict${since}`;
  return `rejects ${n}, one edit from ${f.cases === 1 ? "a schema" : "schemas"} that break${f.cases === 1 ? "s" : ""} only ${f.hint[0]}; which rule it applied is a guess: the message says what the implementation checked${since}`;
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
  // A crash on an invalid schema tagged with a release is a failure under
  // older releases too; accepting it is counted under its release.
  for (const release of RELEASES) {
    const tagged = vectors.find((v) => v.since === release && !v.expected.valid);
    if (!tagged) continue;
    const answers = right();
    answers[vectors.indexOf(tagged)] = crash(tagged);
    let r = report(answers);
    const failing = (r) => Object.values(r.since).some((s) => s.failing !== 0) || check(r, RULE.get(tagged.rule).id).failingSince !== undefined;
    control(failing(r), `a crash on ${tagged.id} counted as relying on ${releaseName(release)}`);
    control(r.findings.some((f) => f.since), `the finding for a crash on ${tagged.id} is tagged by release`);
    answers[vectors.indexOf(tagged)] = { valid: true };
    r = report(answers);
    control(r.since[release]?.failing !== 1 || check(r, RULE.get(tagged.rule).id).failingSince?.[release] !== 1, `accepting ${tagged.id} wasn't counted as relying on ${releaseName(release)}`);
    control(!r.findings.some((f) => f.since?.[release] === 1), `the finding for accepting ${tagged.id} has no since count`);
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
  // A failing informational check doesn't fail the run; a failing MUST does.
  const info = vectors.find((v) => !v.expected.valid && RULE.get(v.rule).level === "INFO");
  if (info) {
    const answers = right();
    answers[vectors.indexOf(info)] = { valid: true };
    const c = check(report(answers), RULE.get(info.rule).id);
    control(c.status !== "fail" || fatal(c.level, true), `accepting ${info.id} failed the run`);
  }
  const must = vectors.find((v) => !v.expected.valid && RULE.get(v.rule).level === "MUST");
  control(!fatal(RULE.get(must.rule).level, false), `accepting ${must.id} didn't fail the run`);
  // A vector that needs a capability isn't asked of an adapter without it.
  control(gradedVectors(vectors, []).graded.some((v) => (v.requires ?? []).length > 0), "a vector that needs a capability was graded without it");
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

export const buildReport = ({ vectors, answers, strict, implementation, capabilities, selfTestText, total = vectors.length, skipped = {}, requires = new Map() }) => {
  const stats = new Map(RULES.map((r) => [r.rule, { cases: 0, failing: 0, failingSince: {} }]));
  const accepts = { cases: 0, failing: 0, failingSince: {} };
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
    const since = failingSince(v, verdict);
    bump(s.failingSince, since);
    const r = RULE.get(v.rule);
    const crash = answer instanceof Crash;
    const message = messageOf(answer);
    // Invalid schemas: one finding per rule and kind (and crash message).
    // Valid ones: one per kind and message shape, whatever the rule.
    const key = v.expected.valid
      ? `valid\u0000${verdict}\u0000${message === undefined ? `rule ${v.rule}` : `message ${messageShape(message, v.sdl)}`}`
      : `${v.rule}\u0000${verdict}${crash ? `\u0000${messageShape(message, v.sdl)}` : ""}`;
    const example = {
      input: `${since ? `[since ${releaseName(since)}] ` : ""}${v.sdl}`,
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
      since: {},
    };
    f.cases++;
    f.members.push(v);
    f.rules.add(r.id);
    f.fixtures[v.family] = (f.fixtures[v.family] ?? 0) + 1;
    bump(f.since, since);
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
      ...(sum(f.since) ? { since: countsByRelease(f.since) } : {}),
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
    since: Object.fromEntries(
      RELEASES.map((release) => [
        release,
        {
          vectors: vectors.filter((v) => v.since === release).length,
          failing: judged.filter((j) => failingSince(j.vector, j.verdict) === release).length,
        },
      ]).filter(([, c]) => c.vectors > 0),
    ),
    checks: [
      ...RULES.map((r) => {
        const s = stats.get(r.rule);
        // A new rule's failures that aren't counted under its release:
        // crashes, which older releases don't allow either.
        const crashes = s.failing - sum(s.failingSince);
        const notes = [
          ...(r.since
            ? [`New in ${releaseName(r.since)}: October 2021 doesn't have ${r.feature}${crashes > 0 ? `. ${plural(crashes, "failing case")} ${crashes === 1 ? "is a crash, which fails" : "are crashes, which fail"} under October 2021 too` : ""}`]
            : []),
          ...(UNWRITABLE[r.rule] ? [UNWRITABLE[r.rule]] : []),
          ...(UNGRADED[r.rule] ? [`Never graded: ${UNGRADED[r.rule]}`] : []),
        ];
        return {
          id: r.id,
          title: r.title,
          level: r.level,
          spec: r.spec.map(section),
          status: s.failing > 0 ? "fail" : s.cases > 0 ? "pass" : "untested",
          cases: s.cases,
          failing: s.failing,
          ...(sum(s.failingSince) ? { failingSince: countsByRelease(s.failingSince) } : {}),
          ...(r.since ? { since: r.since } : {}),
          ...(notes.length ? { note: notes.join(". ") } : {}),
          basis: r.basis,
          ...(requires.get(r.rule)?.length ? { requires: requires.get(r.rule) } : {}),
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
        ...(sum(accepts.failingSince) ? { failingSince: countsByRelease(accepts.failingSince) } : {}),
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
  const { graded: vectors, skipped } = gradedVectors(all, adapter.capabilities);
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
    requires: ruleRequires(all),
  });

  const failingChecks = report.checks.filter((c) => c.status === "fail");
  const passed = vectors.length - report.findings.reduce((n, f) => n + f.cases, 0);
  const crashes = answers.filter((a) => a instanceof Crash).length;
  const notGraded = Object.entries(skipped)
    .map(([why, n]) => `; ${n} ${why === "unspecified" ? "unspecified" : `need ${why}, which the adapter doesn't claim,`} not graded`)
    .join("");
  log(`${passed === vectors.length ? "✓" : "✗"} ${passed} of ${vectors.length} schemas judged as TypeSystem.tla judges them${crashes ? ` (${crashes} crashed)` : ""}${notGraded}`);
  const since = (f) => (f.since ? `, ${sinceText(f.since)}` : "");
  for (const f of report.findings) log(`  ✗ ${f.summary} (${plural(f.cases, "schema")}${since(f)}, e.g. ${f.fixture}: ${f.example.input})`);
  const tested = report.checks.filter((c) => c.status !== "untested").length;
  const informational = failingChecks.filter((c) => !fatal(c.level, strict)).length;
  log(`  ${tested - failingChecks.length} of ${tested} checks pass${informational ? ` (${informational} failing ${informational === 1 ? "check is" : "checks are"} informational)` : ""}; ${report.checks.length - tested} untested`);
  if (test.problems.length === 0) log(`✓ the checker catches all ${test.controls} negative controls`);
  const ok = test.problems.length === 0 && report.adapterProblems === 0 && failingChecks.every((c) => !fatal(c.level, strict));
  return { ok, report };
};
