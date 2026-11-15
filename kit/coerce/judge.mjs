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
//   request-error  no "data" entry, at least one error, no resolver called;
//   field-error    "data" holding only the field, null, exactly one error
//                  whose path is that field, no resolver called;
//   value          "data" holding only the field, not null, no errors, and
//                  one resolver call at that field: its arguments;
//   other          anything else.
export const classify = ({ response, calls }) => {
  const errors = response.errors ?? [];
  if (!Object.hasOwn(response, "data")) return errors.length > 0 && calls.length === 0 ? { outcome: "request-error" } : { outcome: "other" };
  const { data } = response;
  if (!isMap(data) || Object.keys(data).length !== 1) return { outcome: "other" };
  const [field] = Object.keys(data);
  if (calls.length === 0 && data[field] === null && errors.length === 1 && sameJson(errors[0]?.path, [field])) {
    return { outcome: "field-error", field };
  }
  if (calls.length === 1 && errors.length === 0 && data[field] !== null && sameJson(calls[0].path, [field])) {
    return { outcome: "value", field, arguments: calls[0].arguments };
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
// [2, [2]]. A list position holding a non-list is compared as its item.
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
// deviations: answers that leave a SHOULD undone, and the check they fail;
// exercises: the checks the vector counts toward.
export const planFor = (vector, capabilities) => {
  if (!capabilities.has("unvalidated")) {
    if (vector.requires?.includes("unvalidated")) return undefined;
    if (vector.valid === false) {
      return { check: "invalidNotExecuted", accept: [{ outcome: "request-error" }], deviations: [], exercises: ["invalidNotExecuted"] };
    }
  }
  if (vector.requires?.some((c) => c !== "unvalidated" && !capabilities.has(c))) return undefined;
  if (vector.binary64 && !capabilities.has("exact-numbers")) {
    return {
      check: "jsonNumbers",
      accept: [vector.expected, vector.binary64, { outcome: "request-error" }],
      deviations: [],
      exercises: ["jsonNumbers"],
    };
  }
  const alternatives = vector.alternatives ?? [];
  // An answer passes unless it needs a SHOULD left undone.
  const permitted = (a) => a.policy.every((p) => !POLICIES[p].check);
  const deviations = alternatives
    .filter((a) => !permitted(a))
    .map((a) => ({ answer: a, check: POLICIES[a.policy.find((p) => POLICIES[p].check)].check }));
  return {
    check: vector.check,
    accept: [vector.expected, ...alternatives.filter(permitted)],
    deviations,
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

export const contextFor = (vector, inputs, capabilities) => ({
  inputs,
  exact: capabilities.has("absent-vs-null"),
  idFromInteger: Boolean(vector.idFromInteger),
});

// How a classified result fails a vector: undefined if it doesn't, or the
// kind of failure and the check it counts against.
export const judge = (vector, plan, got, ctx) => {
  if (plan.accept.some((a) => sameAnswer(ctx, a, got))) return undefined;
  const deviation = plan.deviations.find((d) => sameAnswer(ctx, d.answer, got));
  if (deviation) return { kind: "deviates", check: deviation.check };
  const { check } = plan;
  if (check === "invalidNotExecuted") return { kind: "executes-invalid", check };
  if (check === "jsonNumbers") return { kind: "json-number", check };
  const want = plan.accept[0].outcome;
  if (got.outcome === "other") return { kind: "other", check };
  if (want === got.outcome) return { kind: want !== "request-error" && got.field !== plan.accept[0].field ? "wrong-field" : "wrong-value", check };
  if (want === "value") return { kind: "rejects", check };
  if (got.outcome === "value") return { kind: "accepts", check };
  if (want === "request-error") return { kind: "field-error-for-request-error", check: vector.spec.includes("6.1.2") ? "variables" : check };
  return { kind: "request-error-for-field-error", check: "arguments" };
};

export const summary = ({ kind, check }) => {
  const s = sectionOf(check);
  const at = s ? `§${s} (${section(s).title})` : "";
  switch (kind) {
    case "accepts": return `accepts what ${at} rejects`;
    case "rejects": return `rejects what ${at} accepts`;
    case "wrong-value": return `coerces to the wrong value under ${at}`;
    case "wrong-field": return `runs a different operation than ${at} selects`;
    case "field-error-for-request-error": return `raises a field error where ${at} requires a request error`;
    case "request-error-for-field-error": return `raises a request error where ${at} requires a field error`;
    case "deviates": return `${checkById(check).title.replace(/^./, (c) => c.toLowerCase())}: not done, though ${at} says it should be`;
    case "executes-invalid": return `doesn't fail an invalid document without executing it, as ${at} requires`;
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
        : "none of the three outcomes";

export const describeAccepted = (plan) => plan.accept.map(describeAnswer).join(", or ");
