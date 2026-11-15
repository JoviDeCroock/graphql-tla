// Comparing an adapter's coerce result with a vector's expected answer
// (docs/kit/coerce.md).

import { section } from "../report.mjs";
import { sectionOf } from "./checks.mjs";

export const OUTCOMES = ["request-error", "field-error", "value", "other"];

const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Why a result isn't in the result format, or undefined if it is.
export const malformed = (result) => {
  if (!OUTCOMES.includes(result?.outcome)) return `outcome must be one of ${OUTCOMES.join(", ")}, got ${JSON.stringify(result?.outcome)}`;
  if (result.outcome === "value" && !isMap(result.arguments)) return "a value result needs an arguments object";
  return undefined;
};

// For implementations that can't tell an absent entry from a null one: an
// object's null entries are dropped on both sides before comparing.
export const dropNulls = (v) =>
  Array.isArray(v)
    ? v.map(dropNulls)
    : isMap(v)
      ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, dropNulls(x)]))
      : v;

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

export const sameAnswer = (expected, result, exact) =>
  expected.outcome === result.outcome &&
  (expected.outcome !== "value" ||
    (exact ? sameJson(expected.arguments, result.arguments) : sameJson(dropNulls(expected.arguments), dropNulls(result.arguments))));

// How a well-formed result fails a vector: undefined if it doesn't, or the
// kind of failure and the check it counts against.
export const judge = (vector, result, exact) => {
  if (sameAnswer(vector.expected, result, exact)) return undefined;
  const want = vector.expected.outcome;
  const got = result.outcome;
  if (got === "other") return { kind: "other", check: vector.check };
  if (want === got) return { kind: "wrong-value", check: vector.check };
  if (want === "value") return { kind: "rejects", check: vector.check };
  if (got === "value") return { kind: "accepts", check: vector.check };
  return want === "request-error" ? { kind: "field-error-for-request-error", check: "variables" } : { kind: "request-error-for-field-error", check: "arguments" };
};

export const summary = ({ kind, check }) => {
  const s = sectionOf(check);
  const at = `§${s} (${section(s).title})`;
  switch (kind) {
    case "accepts": return `accepts what ${at} rejects`;
    case "rejects": return `rejects what ${at} accepts`;
    case "wrong-value": return `coerces to the wrong value under ${at}`;
    case "field-error-for-request-error": return "raises a field error where §6.1.2 (Coercing Variable Values) requires a request error";
    case "request-error-for-field-error": return "raises a request error where §6.4.1 (Coercing Field Arguments) requires a field error";
    default: return `answers with none of the three outcomes, under ${at}`;
  }
};

export const describeExpected = (expected) =>
  expected.outcome === "request-error"
    ? "a request error"
    : expected.outcome === "field-error"
      ? "a field error"
      : `the resolver gets ${JSON.stringify(expected.arguments)}`;
