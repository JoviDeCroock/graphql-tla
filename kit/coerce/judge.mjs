// Classifying an adapter's raw coerce result and comparing it with a
// vector's answers (docs/kit/coerce.md). The adapter only reports what
// happened: the execution result and the resolver calls. The kit decides
// which outcome that is.

import { section } from "../report.mjs";
import { POLICIES, checkById, sectionOf } from "./checks.mjs";

const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Why a result isn't in the result format, or undefined if it is.
export const malformed = (result) => {
  if (!isMap(result?.response)) return "a result needs a response object: the execution result";
  if ("errors" in result.response && !Array.isArray(result.response.errors)) return "response.errors must be a list";
  if (!Array.isArray(result.calls)) return "a result needs a calls list";
  for (const call of result.calls) {
    if (!isMap(call) || !Array.isArray(call.path) || !isMap(call.arguments)) return "each call needs a path list and an arguments object";
  }
  return undefined;
};

// JSON equality: numbers by value, objects regardless of key order.
export const sameJson = (a, b) => {
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  if (isMap(a)) {
    if (!isMap(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && sameJson(a[k], b[k]));
  }
  return a === b;
};

// The outcome a well-formed result shows:
//   request-error  no "data" entry, at least one error, no resolver called.
//                  With "data": null instead of no entry, it is still a
//                  request error, flagged dataNull: §7.1.3 says the entry
//                  must not be there, which requestErrorNoData grades;
//   field-error    "data" holding only the field, null, exactly one error,
//                  no resolver called. An error whose path isn't the field
//                  (missing, or an argument's, as in ["v"]) is still a
//                  field error, flagged wrongPath, which fieldErrorPath
//                  grades;
//   value          "data" holding only the field, not null, no errors, and
//                  one resolver call at that field: its arguments;
//   other          anything else.
// An adapter's `error` answer isn't classified: it is the fifth outcome,
// no-response (NO_RESPONSE).
//
// An outcome whose errors aren't all maps with a string message (§7.1.6),
// such as [null] or a field error with only a path, is flagged badErrors,
// which errorFormat grades. A value with an "errors" entry that is an
// empty list is flagged emptyErrors, which errorsList grades (§7.1.1: the
// entry, when present, is a non-empty list). A result with a top-level
// entry other than data, errors and extensions is flagged extraEntries
// (additionalEntries, §7.1.8), and one whose extensions isn't a map
// badExtensions (extensions, §7.1.7).
export const NO_RESPONSE = { outcome: "no-response" };

const wellFormedError = (e) => isMap(e) && typeof e.message === "string";

const RESULT_ENTRIES = new Set(["data", "errors", "extensions"]);

export const classify = ({ response, calls }) => {
  const errors = response.errors ?? [];
  const extra = Object.keys(response).filter((k) => !RESULT_ENTRIES.has(k));
  const shape = (outcome) => ({
    ...outcome,
    ...(extra.length ? { extraEntries: extra } : {}),
    ...(Object.hasOwn(response, "extensions") && !isMap(response.extensions) ? { badExtensions: true } : {}),
  });
  const flag = (outcome) => shape(errors.every(wellFormedError) ? outcome : { ...outcome, badErrors: true });
  if (!Object.hasOwn(response, "data") || response.data === null) {
    if (errors.length === 0 || calls.length > 0) return { outcome: "other" };
    return flag(Object.hasOwn(response, "data") ? { outcome: "request-error", dataNull: true } : { outcome: "request-error" });
  }
  const { data } = response;
  if (!isMap(data) || Object.keys(data).length !== 1) return { outcome: "other" };
  const [field] = Object.keys(data);
  if (calls.length === 0 && data[field] === null && errors.length === 1) {
    const path = isMap(errors[0]) ? errors[0].path : undefined;
    return flag(sameJson(path, [field]) ? { outcome: "field-error", field } : { outcome: "field-error", field, wrongPath: true, path: path ?? null });
  }
  if (calls.length === 1 && errors.length === 0 && data[field] !== null && sameJson(calls[0].path, [field])) {
    const value = { outcome: "value", field, arguments: calls[0].arguments };
    return shape(Object.hasOwn(response, "errors") ? { ...value, emptyErrors: true } : value);
  }
  return { outcome: "other" };
};

// ---------------------------------------------------------------------------
// Comparing arguments, guided by the declarations in vectors.json's
// `inputs`: an entry that no argument or input field declares never
// matches, and without absent-vs-null, null stands for absent only at a
// declared position whose type is nullable.

const parseType = (text) => {
  const nonNull = text.endsWith("!");
  const bare = nonNull ? text.slice(0, -1) : text;
  return bare.startsWith("[") ? { nonNull, list: parseType(bare.slice(1, -1)) } : { nonNull, name: bare };
};

// Whether a string writes exactly the integer `digits` (a canonical decimal
// string): the ID format is the service's, so "1e+21" is 10^21.
const NUMBER = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;
const writesInteger = (text, digits) => {
  const m = typeof text === "string" && NUMBER.exec(text);
  if (!m) return false;
  const fraction = m[3] ?? "";
  const exp = Number(m[4] ?? 0) - fraction.length;
  if (Math.abs(exp) > 1000) return false;
  let mantissa = BigInt(`${m[2]}${fraction}`);
  if (exp < 0) {
    const scale = 10n ** BigInt(-exp);
    if (mantissa % scale !== 0n) return false;
    mantissa /= scale;
  } else mantissa *= 10n ** BigInt(exp);
  return (m[1] && mantissa !== 0n ? -mantissa : mantissa) === BigInt(digits);
};

// A variable used as a list item is passed through without being coerced
// to the item type (§6.4.1's Note: its value is already coerced), so a
// value needn't have its position's shape: [$x, [$x]] for [[Int]] can be
// [2, [2]] (in an invalid document; the variableItemWrapped reading,
// [[2], [2]], is an alternative). A list position holding a non-list is
// compared as its item.
const sameValue = (ctx, type, e, a) => {
  if (e === null || a === null) return e === a;
  if (type.list) {
    if (!Array.isArray(e)) return sameValue(ctx, type.list, e, a);
    return Array.isArray(a) && e.length === a.length && e.every((x, i) => sameValue(ctx, type.list, x, a[i]));
  }
  const fields = ctx.inputs.inputObjects[type.name];
  if (fields && isMap(e)) return sameMap(ctx, fields, e, a);
  if (type.name === "ID" && ctx.idFromInteger && typeof e === "string") return writesInteger(a, e);
  return sameJson(e, a);
};

const sameMap = (ctx, declared, e, a) => {
  if (!isMap(e) || !isMap(a)) return false;
  if (![...Object.keys(e), ...Object.keys(a)].every((k) => Object.hasOwn(declared, k))) return false;
  return Object.entries(declared).every(([name, text]) => {
    const type = parseType(text);
    let ev = Object.hasOwn(e, name) ? e[name] : undefined;
    let av = Object.hasOwn(a, name) ? a[name] : undefined;
    if (!ctx.exact && !type.nonNull) {
      ev ??= null;
      av ??= null;
    }
    if (ev === undefined || av === undefined) return ev === av;
    return sameValue(ctx, type, ev, av);
  });
};

// §3.10's SHOULD to use an input field's default applies to each field.
// `without` is the answer with every input field default left out: it
// differs from `expected` only by the entries those defaults add. These
// compare a result with `expected` as sameValue and sameMap do, except that
// an entry a default adds may also be absent. Every entry that is there
// must still have the expected value.
const sameAllowing = (ctx, type, e, d, a) => {
  if (type.list && Array.isArray(e)) {
    if (!Array.isArray(d) || d.length !== e.length) return sameValue(ctx, type, e, a);
    return Array.isArray(a) && a.length === e.length && e.every((x, i) => sameAllowing(ctx, type.list, x, d[i], a[i]));
  }
  if (type.list) return sameAllowing(ctx, type.list, e, d, a);
  const fields = ctx.inputs.inputObjects[type.name];
  if (fields && isMap(e) && isMap(d)) return sameMapAllowing(ctx, fields, e, d, a);
  return sameValue(ctx, type, e, a);
};

const sameMapAllowing = (ctx, declared, e, d, a) => {
  if (!isMap(a)) return false;
  if (![...Object.keys(e), ...Object.keys(a)].every((k) => Object.hasOwn(declared, k))) return false;
  return Object.entries(declared).every(([name, text]) => {
    const type = parseType(text);
    const added = Object.hasOwn(e, name) && !Object.hasOwn(d, name);
    let ev = Object.hasOwn(e, name) ? e[name] : undefined;
    let av = Object.hasOwn(a, name) ? a[name] : undefined;
    if (added && (av === undefined || (av === null && !ctx.exact && !type.nonNull))) return true;
    if (!ctx.exact && !type.nonNull) {
      ev ??= null;
      av ??= null;
    }
    if (ev === undefined || av === undefined) return ev === av;
    return added ? sameValue(ctx, type, ev, av) : sameAllowing(ctx, type, ev, d[name], av);
  });
};

// Whether `got` is `expected` with some or all of its input field defaults
// left out (`without` leaves out all of them).
export const sameWithoutSomeDefaults = (ctx, expected, without, got) => {
  if (got.outcome !== "value" || got.field !== expected.field) return false;
  const declared = ctx.inputs.fields[expected.field];
  return Boolean(declared) && sameMapAllowing(ctx, declared, expected.arguments, without.arguments, got.arguments);
};

// ctx: { inputs, exact, idFromInteger }
export const sameAnswer = (ctx, expected, got) => {
  if (expected.outcome !== got.outcome) return false;
  if (expected.outcome === "request-error") return true;
  if (expected.field !== got.field) return false;
  if (expected.outcome === "field-error") return true;
  const declared = ctx.inputs.fields[expected.field];
  return Boolean(declared) && sameMap(ctx, declared, expected.arguments, got.arguments);
};

// ---------------------------------------------------------------------------
// How a vector is graded for an adapter's capabilities, or undefined if it
// is skipped. accept: answers that pass, the first being the reference's;
// labels: for an informational check, what each accepted answer means;
// deviations: answers that leave a SHOULD undone, and the check they fail;
// withoutDefaults: the answer with every input field default left out, to
// tell a result that leaves out only some of them; editions: October
// 2021's answer to a vector whose rule is new since then (`since`), which
// fails the vector's check but is reported apart; examples: the answer
// October 2021's non-normative §3.11 table gives, which fails the vector's
// check in every edition, and
// is reported apart; exercises: the checks the vector counts toward. A
// vector that accepts a request error also exercises requestErrorNoData.
//
// A vector that accepts a field error also exercises fieldErrorPath, and,
// where it doesn't accept a request error, argumentErrorKind unless
// §3.10 or §3.10.1 itself requires the execution error. Every vector
// exercises responds, errorFormat, errorsList, additionalEntries and
// extensions.
//
// known: for an invalid vector, whether the implementation's own validator
// rejects the document (true), accepts it (false), or the kit can't tell
// (undefined, the adapter doesn't claim validate). Only known errors make
// executing the document a MUST failure (invalidNotExecuted); otherwise it
// is onlyValidExecuted's SHOULD. validator: whether the kit can ask the
// implementation's validator about a valid document refused with a request
// error, so that acceptsValid is exercised.
export const planFor = (vector, capabilities, { known, validator = false } = {}) => {
  const plan = basePlan(vector, capabilities, known);
  if (!plan) return plan;
  if (plan.accept.some((a) => a.outcome === "request-error")) plan.exercises.push("requestErrorNoData");
  if (plan.accept.some((a) => a.outcome === "field-error")) {
    plan.exercises.push("fieldErrorPath");
    if (!plan.accept.some((a) => a.outcome === "request-error")) plan.exercises.push(fieldErrorKindCheck(vector, plan));
  }
  if (validator && vector.valid !== false && !capabilities.has("unvalidated")) plan.exercises.push("acceptsValid");
  plan.exercises.push("responds", "errorFormat", "errorsList", "additionalEntries", "extensions");
  plan.exercises = [...new Set(plan.exercises)];
  return plan;
};

// A result with no response counts against responds (§7), whatever the
// vector: it says nothing about the rule the vector is about, which the
// finding keeps as a hint.
export const noResponseCheck = () => "responds";

// The check a request error counts against where the reference gives a
// field error: argumentErrorKind's SHOULD ("Any request error raised as a
// result of input coercion during CoerceArgumentValues() should be treated
// instead as an execution error"), unless §3.10 or §3.10.1 itself says "an
// execution error must be raised" for the vector (executionErrorRequired),
// where it is the vector's own check.
export const fieldErrorKindCheck = (vector, plan) => (vector.executionErrorRequired ? plan.check : "argumentErrorKind");

// The check a float or other input value accepted by a type that must
// reject it counts against: ID's MUST, not idCoerced's SHOULD.
export const rejectingCheck = (vector) => (vector.check === "idCoerced" ? "id" : vector.check);

const basePlan = (vector, capabilities, known) => {
  const plan = gradedPlan(vector, capabilities, known);
  // A document invalid only because a literal doesn't coerce (literalOnly):
  // §5.6.1 asks for literals to be "coercible", so a service that validates
  // may refuse it at validation (a request error) as well as at coercion
  // (the reference's answer). A resolved value is graded under the vector's
  // own check, as for an adapter that doesn't validate. Which kind of error
  // isn't graded, so arguments and argumentErrorKind aren't exercised.
  if (plan && vector.literalOnly && !capabilities.has("unvalidated")) {
    if (!plan.accept.some((a) => a.outcome === "request-error")) plan.accept.push({ outcome: "request-error" });
    if (plan.labels) plan.labels.push("refused at validation");
    plan.exercises = plan.exercises.filter((c) => c !== "arguments");
  }
  return plan;
};

// How the reference's floatPrecision answers are labelled: the default
// reading refuses, floatRounded rounds to the nearest double.
const floatPrecisionLabel = (answer) =>
  answer.policy?.includes("floatRounded") ? "rounded to the nearest double" : answer.outcome === "value" ? "as the reference" : "refused";

const gradedPlan = (vector, capabilities, known) => {
  const only = (check, accept, labels) => ({ check, accept, labels, deviations: [], editions: [], examples: [], exercises: [check] });
  if (!capabilities.has("unvalidated")) {
    if (vector.requires?.includes("unvalidated")) return undefined;
    if (vector.valid === false && !vector.literalOnly) return only(known ? "invalidNotExecuted" : "onlyValidExecuted", [{ outcome: "request-error" }]);
  }
  if (vector.requires?.some((c) => c !== "unvalidated" && !capabilities.has(c))) return undefined;
  if (vector.binary64 && !capabilities.has("exact-numbers")) {
    const plan = only("jsonNumbers", [vector.expected, vector.binary64, { outcome: "request-error" }]);
    // A binary64 read the type must reject, such as 1e400 read as Infinity
    // for ID: a value is then the type's failure, not the JSON parser's.
    if (vector.binary64.outcome === "request-error") plan.exercises.push(rejectingCheck(vector));
    return plan;
  }
  if (vector.loneSurrogate) {
    return only(
      "loneSurrogates",
      [vector.expected, vector.loneSurrogate.kept, vector.loneSurrogate.replaced],
      [
        vector.expected.outcome === "request-error" ? "refused" : "as the reference",
        "kept as sent",
        "replaced with U+FFFD",
      ],
    );
  }
  const alternatives = vector.alternatives ?? [];
  const edition = (a) => a.policy.some((p) => POLICIES[p].level === "edition");
  const example = (a) => a.policy.some((p) => POLICIES[p].level === "example");
  // An answer passes if it needs only MAYs and readings of what the spec
  // doesn't say; one that needs a SHOULD left undone fails that SHOULD.
  const permitted = (a) => a.policy.every((p) => POLICIES[p].level === "MAY" || POLICIES[p].level === "unspecified");
  const deviations = alternatives
    .filter((a) => !permitted(a) && !edition(a) && !example(a))
    .map((a) => ({ answer: a, check: POLICIES[a.policy.find((p) => POLICIES[p].check)].check }));
  const withoutDefaults = alternatives.find(
    (a) =>
      a.policy.length === 1 &&
      a.policy[0] === "inputFieldDefaults" &&
      a.outcome === "value" &&
      vector.expected.outcome === "value" &&
      a.field === vector.expected.field,
  );
  const accept = [vector.expected, ...alternatives.filter(permitted)];
  return {
    check: vector.check,
    accept,
    // floatPrecision is informational: which reading the result follows.
    labels: vector.check === "floatPrecision" ? accept.map(floatPrecisionLabel) : undefined,
    deviations,
    withoutDefaults,
    editions: alternatives.filter(edition),
    // The validating form of the table's answer only for adapters that
    // validate.
    examples: alternatives.filter((a) => example(a) && !(a.policy.includes("validating") && capabilities.has("unvalidated"))),
    exercises: [
      ...new Set([
        vector.check,
        ...(vector.spec.includes("6.1.2") ? ["variables"] : []),
        ...(vector.spec.includes("6.4.1") ? ["arguments"] : []),
        ...deviations.map((d) => d.check),
      ]),
    ],
  };
};

// rejectedByValidator: for a valid vector answered with a request error,
// whether the implementation's own validator rejects its document (asked
// through the validate area), or undefined if the kit didn't ask.
export const contextFor = (vector, inputs, capabilities, rejectedByValidator) => ({
  inputs,
  exact: capabilities.has("absent-vs-null"),
  idFromInteger: Boolean(vector.idFromInteger),
  rejectedByValidator,
});

// How a classified result fails a vector: undefined if it doesn't, or the
// kind of failure and the check it counts against.
export const judge = (vector, plan, got, ctx) => {
  // No response: responds, with the vector's own check as the hint.
  if (got.outcome === "no-response") return { kind: "no-response", check: noResponseCheck(plan), hint: plan.check };
  // The answer October 2021's §3.11 table gives: named as such, before the
  // validator is blamed for refusing what the table refuses.
  if (plan.examples.some((a) => sameAnswer(ctx, a, got))) return { kind: "example-table", check: plan.check };
  // A valid document refused at validation never reached coercion: the
  // validator's failure, whatever answer the vector expects.
  if (vector.valid !== false && got.outcome === "request-error" && ctx.rejectedByValidator) {
    return { kind: "rejected-at-validation", check: "acceptsValid" };
  }
  if (plan.accept.some((a) => sameAnswer(ctx, a, got))) {
    if (got.badErrors) return { kind: "error-format", check: "errorFormat" };
    if (got.emptyErrors) return { kind: "empty-errors", check: "errorsList" };
    if (got.dataNull) return { kind: "data-with-request-error", check: "requestErrorNoData" };
    if (got.extraEntries) return { kind: "additional-entries", check: "additionalEntries" };
    if (got.badExtensions) return { kind: "extensions-not-map", check: "extensions" };
    if (got.wrongPath) return { kind: "field-error-path", check: "fieldErrorPath" };
    return undefined;
  }
  const deviation = plan.deviations.find((d) => sameAnswer(ctx, d.answer, got));
  if (deviation) return { kind: "deviates", check: deviation.check };
  if (plan.withoutDefaults && sameWithoutSomeDefaults(ctx, plan.accept[0], plan.withoutDefaults, got)) {
    return { kind: "deviates", check: "inputFieldDefaults" };
  }
  const { check } = plan;
  if (plan.editions.some((a) => sameAnswer(ctx, a, got))) return { kind: "edition", check, since: vector.since };
  if (check === "invalidNotExecuted" || check === "onlyValidExecuted") return { kind: "executes-invalid", check };
  if (check === "jsonNumbers") {
    if (got.outcome === "value" && vector.binary64.outcome === "request-error") return { kind: "accepts", check: rejectingCheck(vector) };
    return { kind: "json-number", check };
  }
  if (check === "loneSurrogates") return { kind: "lone-surrogate", check };
  const want = plan.accept[0].outcome;
  if (got.outcome === "other") return { kind: "other", check };
  if (want === got.outcome) return { kind: want !== "request-error" && got.field !== plan.accept[0].field ? "wrong-field" : "wrong-value", check };
  if (want === "value") return { kind: "rejects", check };
  if (got.outcome === "value") return { kind: "accepts", check };
  if (want === "request-error") return { kind: "field-error-for-request-error", check: vector.spec.includes("6.1.2") ? "variables" : check };
  return { kind: "request-error-for-field-error", check: fieldErrorKindCheck(vector, plan) };
};

// "September2025" as the kit writes a release in prose: "September 2025".
export const releaseName = (since) => since.replace(/^([A-Za-z]+)(\d+)$/, "$1 $2");

export const summary = ({ kind, check, hint, since }) => {
  const s = sectionOf(check);
  const at = s ? `§${s} (${section(s).title})` : "";
  const h = hint && sectionOf(hint);
  switch (kind) {
    case "accepts": return `accepts what ${at} rejects`;
    case "rejects": return `rejects what ${at} accepts`;
    case "wrong-value": return `coerces to the wrong value under ${at}`;
    case "wrong-field": return `runs a different operation than ${at} selects`;
    case "field-error-for-request-error": return `raises a field error where ${at} requires a request error`;
    case "request-error-for-field-error":
      return check === "argumentErrorKind"
        ? `raises a request error where ${at} says a coercion failure should be treated as a field error`
        : `raises a request error where ${at} requires a field error`;
    case "deviates": return `${checkById(check).title.replace(/^./, (c) => c.toLowerCase())}: not done, though ${at} says it should be`;
    case "executes-invalid":
      return check === "invalidNotExecuted"
        ? `executes a document its own validator rejects, which ${at} says must fail without execution`
        : `executes an invalid document its validator doesn't reject, though ${at} says only valid documents should be executed (the rule it misses is the validate area's)`;
    case "edition": return `gives October 2021's answer where ${since ? releaseName(since) : "a later edition"} changed it, under ${at}`;
    case "example-table": return `follows October 2021's §3.11 table of examples, which is non-normative and which §3.11's prose, the same in every edition, contradicts`;
    case "rejected-at-validation": return `rejects a valid document at validation, so it never reaches coercion (${at})`;
    case "empty-errors": return `answers a value with an empty "errors" list, which ${at} says must not be present when no error was raised`;
    case "error-format": return `answers with an error that isn't a map with a string message, which ${at} requires of every error`;
    case "no-response": return `produces no response, though ${at} says every request gets one${h ? ` (on vectors of §${h} (${section(h).title}))` : ""}`;
    case "additional-entries": return `answers with a top-level entry other than data, errors and extensions, which ${at} says must not be there`;
    case "extensions-not-map": return `answers with a top-level extensions entry that isn't a map, which ${at} requires`;
    case "field-error-path": return `raises the field error with a path other than the field's response path, which ${at} requires`;
    case "data-with-request-error": return `answers a request error with a "data" entry, which ${at} says it must not have`;
    case "lone-surrogate": return "treats a JSON string with a lone surrogate in a way that neither keeping it, replacing it with U+FFFD, nor a refusal explains";
    case "json-number": return "reads a JSON number a double can't hold in a way that neither exact nor binary64 parsing, nor a refusal, explains";
    default: return `answers with none of the three outcomes, under ${at}`;
  }
};

export const describeAnswer = (answer) =>
  answer.outcome === "request-error"
    ? "a request error"
    : answer.outcome === "field-error"
      ? `a field error at ${answer.field}`
      : answer.outcome === "value"
        ? `${answer.field} resolved with ${JSON.stringify(answer.arguments)}`
        : answer.outcome === "no-response"
          ? "no response"
          : "none of the three outcomes";

export const describeAccepted = (plan) => plan.accept.map(describeAnswer).join(", or ");
