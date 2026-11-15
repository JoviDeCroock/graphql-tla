// graphql-tla run coerce: asks the adapter to execute every vector in
// kit/coerce/vectors.json, classifies each raw result, and compares it with
// the answers Coercion.tla gave (docs/kit/coerce.md). An `error` answer
// means the implementation produced no response: it is graded as that
// outcome, never as an adapter failure.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Crash, answerOrCrash, crashResponse } from "../areas.mjs";
import { REPORT_FORMAT, provenance, section } from "../report.mjs";
import { CHECKS } from "./checks.mjs";
import { NO_RESPONSE, classify, contextFor, describeAccepted, judge, malformed, noResponseCheck, planFor, sameAnswer, summary } from "./judge.mjs";

// Whether a JSON text holds a string with a lone surrogate: the one input an
// adapter may answer `unsupported` for (docs/kit-areas.md).
export const hasLoneSurrogate = (text) => {
  let found = false;
  try {
    JSON.parse(text, (_key, value) => {
      if (typeof value === "string" && !value.isWellFormed()) found = true;
      return value;
    });
  } catch {
    return false;
  }
  return found;
};

// An adapter's answer to a vector, with `unsupported` resolved: undefined
// (not graded) where the variables hold a lone surrogate, which the
// adapter's transport may be unable to carry, else a crash.
export const unsupportedResolved = (vector, result) => {
  if (result instanceof Crash || typeof result?.unsupported !== "string") return result;
  if (hasLoneSurrogate(vector.variables)) return undefined;
  return new Crash(`unsupported, though the variables hold no lone surrogate: ${result.unsupported}`);
};

// A vector's failure, counted where the vector it rests on first counts its
// own (docs/kit/coerce.md, "Attribution"). Only a failure of the vector's
// own type check moves, and only to an inner vector that failed its own
// type check the same way: then the inner rule is the one broken. Else the
// failure is unchanged. A failure that moves names the inner vector it
// went through (restsOn).
const NOT_TYPE_CHECKS = new Set(["invalidNotExecuted", "onlyValidExecuted", "jsonNumbers", "loneSurrogates"]);
const sameWay = (a, b) => a === b || (a.startsWith("no-response") && b.startsWith("no-response"));
export const attribute = (outcomes) => {
  const byId = new Map(outcomes.map((o) => [o.vector.id, o]));
  const memo = new Map();
  const ownFailure = (o) => o.failure && o.failure.check === o.plan.check && !NOT_TYPE_CHECKS.has(o.plan.check);
  const resolve = (o) => {
    if (!memo.has(o)) {
      let failure = o.failure;
      if (ownFailure(o)) {
        for (const id of o.vector.restsOn ?? []) {
          const inner = byId.get(id);
          if (!inner || !ownFailure(inner) || !sameWay(o.failure.kind, inner.failure.kind)) continue;
          const moved = resolve(inner);
          if (moved.check !== failure.check) failure = { ...failure, check: moved.check, restsOn: id };
          break;
        }
      }
      memo.set(o, failure);
    }
    return memo.get(o);
  };
  const resolved = outcomes.map((o) => (o.failure ? resolve(o) : undefined));
  outcomes.forEach((o, i) => {
    if (o.failure) o.failure = resolved[i];
  });
};

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
// A vector whose answer only the draft gives: October 2021 doesn't coerce
// default values, and has no OneOf input objects.
const isDraft = (vector) => vector.edition === "draft";
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

// The paths to the entries that input field defaults add: in `expected`
// but not in `without`, the answer with every such default left out.
const addedPaths = (e, d, path = []) => {
  if (Array.isArray(e)) return Array.isArray(d) && d.length === e.length ? e.flatMap((x, i) => addedPaths(x, d[i], [...path, i])) : [];
  if (!isMap(e) || !isMap(d)) return [];
  return Object.keys(e).flatMap((k) => (Object.hasOwn(d, k) ? addedPaths(e[k], d[k], [...path, k]) : [[...path, k]]));
};
// A copy of `v` with the entry at `path` removed, or set to `value`.
const editAt = (v, path, value, remove = false) => {
  const out = structuredClone(v);
  const parent = path.slice(0, -1).reduce((x, k) => x[k], out);
  if (remove) delete parent[path.at(-1)];
  else parent[path.at(-1)] = value;
  return out;
};

// Correct answers must pass; deliberately wrong ones must each be caught.
// Returns the number of wrong answers, or a list of problems.
export const selfTest = (graded, inputs, capabilities) => {
  const problems = [];
  let controls = 0;
  const run = ({ vector, plan }, raw, rejectedByValidator) => {
    if (raw instanceof Crash) return judge(vector, plan, NO_RESPONSE, contextFor(vector, inputs, capabilities));
    const problem = malformed(raw);
    if (problem) return { kind: "malformed" };
    return judge(vector, plan, classify(raw), contextFor(vector, inputs, capabilities, rejectedByValidator));
  };
  // `check` is the check the failure must count against; `not`, one it
  // must not.
  const caught = (g, raw, name, check, not, rejectedByValidator) => {
    controls++;
    const failure = run(g, raw, rejectedByValidator);
    if (!failure) problems.push(`${name} wasn't caught for ${g.vector.id}`);
    else if (check && failure.check !== check) problems.push(`${name} counted against ${failure.check}, not ${check}, for ${g.vector.id}`);
    else if (not && failure.check === not) problems.push(`${name} counted against ${not} for ${g.vector.id}`);
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
    // Leaving out one input field default, but not another, still counts
    // against inputFieldDefaults; a wrong value in the one kept doesn't.
    if (plan.withoutDefaults) {
      const paths = addedPaths(want.arguments, plan.withoutDefaults.arguments);
      if (paths.length >= 2) {
        const partial = editAt(want.arguments, paths[0], undefined, true);
        caught(g, rawFor({ ...want, arguments: partial }), "an answer that leaves out some input field defaults", "inputFieldDefaults");
        caught(g, rawFor({ ...want, arguments: editAt(partial, paths[1], "wrong") }), "some defaults left out and a wrong value", plan.check);
      }
    }
    // October 2021's answer to a draft-only vector fails the vector's check,
    // and so does the answer of October 2021's §3.11 table of examples.
    for (const a of plan.editions) caught(g, rawFor(a, field), "October 2021's answer to a draft-only vector", plan.check);
    for (const a of plan.examples) caught(g, rawFor(a, field), "the answer of October 2021's §3.11 table", plan.check);
    // A valid document refused by the implementation's own validator fails
    // acceptsValid, even where the reference's answer is a request error;
    // a request error the validator doesn't explain is graded as usual.
    if (vector.valid !== false && !capabilities.has("unvalidated") && !plan.examples.some((a) => a.outcome === "request-error")) {
      caught(g, rawFor({ outcome: "request-error" }, field), "a valid document rejected at validation", "acceptsValid", undefined, true);
      if (want.outcome === "request-error" && run(g, rawFor(want, field), false)) problems.push(`a request error the validator doesn't explain fails ${vector.id}`);
    }
    // Undeclared null entries, as an argument and inside an input object.
    if (want.outcome === "value") {
      caught(g, rawFor({ ...want, arguments: withUndeclaredNull(want.arguments, false) }), "an undeclared null argument");
      const nested = withUndeclaredNull(want.arguments, true);
      if (nested) caught(g, rawFor({ ...want, arguments: nested }), "an undeclared null input field");
    }
    // No response at all, even with a response attached: the vector's
    // check where the reference expects a request error, else responds.
    caught(g, Object.assign(new Crash("NullPointerException"), rawFor(want, field)), "no response", noResponseCheck(plan));
    // Responses the classification must not accept.
    const raw = rawFor(want, field);
    // Errors that aren't maps with a string message: errorFormat, wherever
    // the outcome would otherwise pass.
    if (want.outcome !== "value") {
      const bad = (errors) => ({ ...raw, response: { ...raw.response, errors } });
      const path = want.outcome === "field-error" ? { path: [field] } : {};
      caught(g, bad([null]), "an error that is null", "errorFormat");
      caught(g, bad([{ ...path }]), "an error without a message", "errorFormat");
      caught(g, bad([{ message: 1, ...path }]), "an error whose message isn't a string", "errorFormat");
    }
    if (want.outcome === "request-error") {
      caught(g, { ...raw, response: { ...raw.response, data: null } }, "a request error with data: null", "requestErrorNoData");
      caught(g, { ...raw, calls: [{ path: [field], arguments: {} }] }, "a request error after a resolver ran");
    } else if (want.outcome === "field-error") {
      caught(g, { ...raw, response: { ...raw.response, errors: [{ message: "field error" }] } }, "a field error without a path", "fieldErrorPath");
      caught(g, { ...raw, response: { ...raw.response, errors: [{ message: "field error", path: ["v"] }] } }, "a field error at the argument's path", "fieldErrorPath");
      caught(g, { ...raw, response: { ...raw.response, errors: [{ message: "field error", path: [field, "v"] }] } }, "a field error at a path inside the field", "fieldErrorPath");
      caught(g, { ...raw, calls: [{ path: [field], arguments: {} }] }, "a field error after the resolver ran");
    } else {
      caught(g, { ...raw, response: { ...raw.response, errors: [{ message: "extra", path: [field] }] } }, "a value with an error");
      caught(g, { ...raw, calls: [...raw.calls, ...raw.calls] }, "a value from two resolver calls");
      caught(g, { ...raw, calls: [{ ...raw.calls[0], path: ["elsewhere"] }] }, "a value from a call at another field");
      caught(g, { ...raw, response: { ...raw.response, errors: [] } }, "a value with an empty errors list", "errorsList");
    }
    // A field error at the argument's path, where the vector doesn't accept
    // a field error, fails as a field error would: not fieldErrorPath.
    const fieldError = { response: { data: { [field]: null }, errors: [{ message: "field error", path: ["v"] }] }, calls: [] };
    if (!accepted(g, { outcome: "field-error", field })) caught(g, fieldError, "an unexpected field error at the argument's path", undefined, "fieldErrorPath");
  });
  // `unsupported` leaves a vector ungraded only where its variables hold a
  // lone surrogate; anywhere else it is a crash.
  for (const g of graded) {
    const lone = hasLoneSurrogate(g.vector.variables);
    const resolved = unsupportedResolved(g.vector, { unsupported: "lone surrogate: test" });
    controls++;
    if (lone ? resolved !== undefined : !(resolved instanceof Crash)) problems.push(`an unsupported answer isn't ${lone ? "left ungraded" : "a crash"} for ${g.vector.id}`);
  }

  // Attribution: a list or input object vector that fails as the vector it
  // rests on fails counts where that one does; it stays when the inner one
  // passes, or fails another way.
  const byId = new Map(graded.map((g) => [g.vector.id, g]));
  const typed = (g) => !NOT_TYPE_CHECKS.has(g.plan.check);
  for (const outer of graded) {
    const inner = typed(outer) && outer.vector.restsOn?.map((id) => byId.get(id)).find((g) => g && typed(g) && g.plan.check !== outer.plan.check);
    if (!inner) continue;
    const fails = (g, kind = "rejects") => ({ ...g, failure: { kind, check: g.plan.check } });
    const cases = [
      [[fails(outer), fails(inner)], inner.plan.check, "a failure the inner vector shares"],
      [[fails(outer), { ...inner, failure: undefined }], outer.plan.check, "a failure the inner vector doesn't have"],
      [[fails(outer), fails(inner, "accepts")], outer.plan.check, "a failure the inner vector has another way"],
    ];
    for (const [outcomes, check, name] of cases) {
      controls++;
      attribute(outcomes);
      if (outcomes[0].failure.check !== check) problems.push(`${name} counted against ${outcomes[0].failure.check}, not ${check}, for ${outer.vector.id}`);
    }
    break;
  }
  return problems.length ? problems : controls;
};

// ---------------------------------------------------------------------------

export const run = async ({ adapter, strict, log = console.log }) => {
  const started = Date.now();
  const { schema: mainSchema, schemas = {}, inputs, vectors } = loadVectors();
  // A vector's schema: the main one, or one the vector names (the OneOf
  // vectors').
  const schemaOf = (vector) => (vector.schema ? schemas[vector.schema] : mainSchema);
  const capabilities = new Set(adapter.capabilities);

  // An adapter that validates and claims validate: the kit asks the
  // implementation's own validator, through the validate area, whether it
  // rejects a document, so that executing an invalid document is graded
  // by whether its errors were known (§6.1.1), and a valid document
  // refused at validation counts against acceptsValid, not against the
  // coercion rule it was meant to test.
  const validator = capabilities.has("validate") && !capabilities.has("unvalidated");
  const verdicts = new Map();
  const rejects = async (vector) => {
    const key = `${vector.schema ?? ""}\u0000${vector.document}`;
    if (!verdicts.has(key)) {
      const answer = await answerOrCrash(adapter, "validate", { schema: schemaOf(vector), document: vector.document });
      verdicts.set(key, answer instanceof Crash || typeof answer?.valid !== "boolean" ? undefined : !answer.valid);
    }
    return verdicts.get(key);
  };

  const graded = [];
  let skipped = 0;
  for (const vector of vectors) {
    if (!planFor(vector, capabilities)) {
      skipped++;
      continue;
    }
    const known = validator && vector.valid === false ? await rejects(vector) : undefined;
    graded.push({ vector, plan: planFor(vector, capabilities, { known, validator }) });
  }
  const modes = [
    capabilities.has("unvalidated")
      ? "unvalidated"
      : `validating: invalid documents graded under ${validator ? "invalidNotExecuted where the validator rejects them, else onlyValidExecuted" : "onlyValidExecuted (no validate area to tell known errors)"}`,
    capabilities.has("absent-vs-null") ? "absent-vs-null" : "null and absent alike at optional positions",
    capabilities.has("exact-numbers") ? "exact-numbers" : "big JSON numbers graded under jsonNumbers",
  ];
  log(`  ${plural(vectors.length, "vector")}, ${graded.length} run${skipped ? ` (${skipped} skipped for missing capabilities)` : ""}`);
  log(`  ${modes.join("; ")}`);

  // Ask, classify, and judge each result. An `unsupported` answer leaves
  // the vector ungraded only where its variables hold a lone surrogate,
  // which the adapter's transport may be unable to carry; anywhere else it
  // is a crash.
  const outcomes = [];
  const unsupported = [];
  for (const g of graded) {
    const { vector } = g;
    let result = await answerOrCrash(adapter, "coerce", {
      schema: schemaOf(vector),
      document: vector.document,
      variables: vector.variables,
      ...(vector.operationName !== undefined ? { operationName: vector.operationName } : {}),
    });
    const reason = result?.unsupported;
    result = unsupportedResolved(vector, result);
    if (result === undefined) {
      unsupported.push({ id: vector.id, reason });
      continue;
    }
    const crash = result instanceof Crash;
    const problem = crash ? undefined : malformed(result);
    const got = crash ? NO_RESPONSE : problem ? undefined : classify(result);
    const rejected = validator && !problem && vector.valid !== false && got.outcome === "request-error" ? await rejects(vector) : undefined;
    const failure = problem ? undefined : judge(vector, g.plan, got, contextFor(vector, inputs, capabilities, rejected));
    outcomes.push({ ...g, result, problem, got, failure });
  }
  attribute(outcomes);
  if (unsupported.length) log(`- ${plural(unsupported.length, "vector")} not graded: the adapter couldn't receive the variables (${unsupported[0].reason})`);
  const gradedIds = new Set(outcomes.map((o) => o.vector.id));

  const stats = new Map(CHECKS.map((c) => [c.id, { cases: 0, failing: 0, failingDraftOnly: 0, observed: {} }]));
  const findings = new Map();
  const malformedResults = outcomes.filter((o) => o.problem);
  for (const { vector, plan, result, got, failure } of outcomes.filter((o) => !o.problem)) {
    // A failure counted where an inner vector's counts exercises that check.
    for (const id of new Set([...plan.exercises, ...(failure ? [failure.check] : [])])) stats.get(id).cases++;
    // For an informational check, which of the accepted answers it was.
    if (!failure && plan.labels) {
      const ctx = contextFor(vector, inputs, capabilities);
      const label = plan.labels[plan.accept.findIndex((a) => sameAnswer(ctx, a, got))];
      const { observed } = stats.get(plan.check);
      observed[label] = (observed[label] ?? 0) + 1;
    }
    if (!failure) continue;
    stats.get(failure.check).failing++;
    if (isDraft(vector)) stats.get(failure.check).failingDraftOnly++;
    const key = `${failure.kind}\u0000${failure.check}`;
    const input = `${vector.document}  variables: ${vector.variables}${vector.operationName !== undefined ? `  operationName: ${vector.operationName}` : ""}`;
    const crash = result instanceof Crash;
    const f = findings.get(key) ?? { ...(crash ? { kind: "crash" } : {}), checks: [failure.check], summary: summary(failure), cases: 0, draftOnly: 0, fixtures: {} };
    f.cases++;
    // How many of them are lists or input objects that fail through an item
    // or field that fails on its own (restsOn).
    if (failure.restsOn) f.throughInner = (f.throughInner ?? 0) + 1;
    if (isDraft(vector)) f.draftOnly++;
    f.fixtures[vector.family] = (f.fixtures[vector.family] ?? 0) + 1;
    if (!f.example || input.length < f.example.input.length) {
      f.fixture = vector.family;
      if (crash) f.problem = result.message;
      f.example = { vector: vector.id, input: `${isDraft(vector) ? "[draft] " : ""}${input}`, response: crash ? crashResponse(result) : result, outcome: got, expected: describeAccepted(plan) };
    }
    findings.set(key, f);
  }
  const level = new Map(CHECKS.map((c) => [c.id, c.level]));
  const fatal = (f) => f.checks.some((id) => level.get(id) === "MUST" || (strict && level.get(id) === "SHOULD"));
  const sorted = [...findings.values()].sort((a, b) => b.cases - a.cases);

  // A run where nothing was graded proves nothing.
  let ok = outcomes.length > 0;
  for (const { vector, problem } of malformedResults.slice(0, 5)) log(`✗ malformed result for ${vector.id}: ${problem}`);
  if (malformedResults.length > 0) {
    ok = false;
    log(`✗ ${plural(malformedResults.length, "result")} not in the coerce result format`);
  }
  for (const f of sorted) {
    if (fatal(f)) ok = false;
    const lv = level.get(f.checks[0]);
    const note = fatal(f) ? "" : lv === "SHOULD" ? ": a SHOULD, fails with --strict" : ": informational";
    const draft = f.draftOnly > 0 ? `; ${f.draftOnly === f.cases ? "all" : `${f.draftOnly} of ${f.cases}`} rely on the draft` : "";
    const inner = f.throughInner ? `; ${f.throughInner} through an item or field that fails on its own` : "";
    log(`${fatal(f) ? "✗" : "!"} ${f.summary} [${f.checks[0]}] (${plural(f.cases, "vector")}${draft}${inner})${note}`);
    log(`    e.g.:     ${f.example.input}`);
    log(`    got:      ${JSON.stringify(f.example.outcome)}`);
    log(`    expected: ${f.example.expected.length > 160 ? `${f.example.expected.slice(0, 160)}…` : f.example.expected}`);
  }
  const failing = sorted.reduce((n, f) => n + f.cases, 0);
  const wellFormed = outcomes.length - malformedResults.length;
  const crashed = outcomes.filter((o) => o.result instanceof Crash).length;
  log(`${failing === 0 && ok ? "✓" : "✗"} ${wellFormed - failing} of ${wellFormed} results match the reference${crashed ? `; ${crashed} produced no response` : ""}`);
  const draftOnly = {
    vectors: outcomes.filter((o) => isDraft(o.vector)).length,
    failing: outcomes.filter((o) => !o.problem && o.failure && isDraft(o.vector)).length,
  };
  if (failing > 0) log(`  ${draftOnly.failing} of the ${failing} failing vectors rely on the draft (of ${draftOnly.vectors} draft-only vectors run)`);
  for (const check of CHECKS) {
    const { observed } = stats.get(check.id);
    if (Object.keys(observed).length > 0) log(`  ${check.id}: ${Object.entries(observed).map(([label, n]) => `${label} ${n}`).join(", ")}`);
  }

  const test = selfTest(graded.filter((g) => gradedIds.has(g.vector.id)), inputs, capabilities);
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
    provenance: provenance({
      strict,
      vectors: vectors.length,
      run: outcomes.length,
      // As parse reports it, where the adapter answered `unsupported`.
      ...(unsupported.length
        ? { graded: outcomes.length, skipped: { ...(skipped ? { "for missing capabilities": skipped } : {}), "unsupported by the adapter": unsupported.length } }
        : { skipped }),
      modes,
    }),
    checkerSelfTest: Array.isArray(test) ? "failed" : `passed (${test} negative controls)`,
    cases: { submitted: outcomes.length, distinct: outcomes.length, malformed: malformedResults.length },
    adapterProblems: malformedResults.length,
    draftOnly,
    checks: CHECKS.map((check) => {
      const s = stats.get(check.id);
      const observed = Object.entries(s.observed);
      return {
        id: check.id,
        title: check.title,
        level: check.level,
        ...(check.oct2021 ? { oct2021: check.oct2021 } : {}),
        spec: check.spec.map(section),
        ...(check.basis ? { basis: check.basis } : {}),
        status: s.failing > 0 ? "fail" : s.cases > 0 ? "pass" : "untested",
        cases: s.cases,
        failing: s.failing,
        // How many of the failing vectors rely on the draft.
        failingDraftOnly: s.failingDraftOnly,
        ...(check.untested ? { note: check.untested } : {}),
        ...(observed.length ? { observed: s.observed, note: observed.map(([label, n]) => `${label}: ${n}`).join("; ") } : {}),
      };
    }),
    findings: sorted,
    fixtures: [],
  };
  return { ok, report };
};
