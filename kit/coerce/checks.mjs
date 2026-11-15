// The coerce area's checks (docs/kit/coerce.md): one per section of the
// spec's input coercion rules, split where a section mixes MUST and SHOULD
// and the vector alone tells which sentence applies.
//
// Each vector names its primary check. A vector whose expected answer is a
// request error also exercises `variables` (§6.1.2 makes it a request
// error), and one whose expected answer is a field error also exercises
// `arguments` (§6.4.1 makes it an execution error).

export const CHECKS = [
  { id: "int", title: "Int accepts only integer input values", level: "MUST", spec: ["3.5.1"] },
  {
    id: "intRange",
    title: "Int rejects integers outside the signed 32-bit range",
    level: "SHOULD",
    spec: ["3.5.1"],
    basis: "\"If the integer input value represents a value less than -2^31 or greater than or equal to 2^31, a request error should be raised.\"",
  },
  {
    id: "float",
    title: "Float accepts integer and float input values a finite double holds",
    level: "MUST",
    spec: ["3.5.2"],
    basis:
      "Coercion.tla reads \"outside the available precision\" as: an integral value must be exactly representable. A fractional value is kept as its decimal, which the vectors only use with at most 15 significant digits.",
  },
  { id: "string", title: "String accepts only valid Unicode string input values", level: "MUST", spec: ["3.5.3"] },
  { id: "boolean", title: "Boolean accepts only boolean input values", level: "MUST", spec: ["3.5.4"] },
  {
    id: "idCoerced",
    title: "String and integer input values are coerced to ID strings",
    level: "SHOULD",
    spec: ["3.5.5"],
    basis: "\"any string (such as \\\"4\\\") or integer (such as 4 or -4) input value should be coerced to ID\"; an integer becomes its decimal string.",
  },
  { id: "id", title: "ID rejects input values other than strings and integers", level: "MUST", spec: ["3.5.5"] },
  {
    id: "enum",
    title: "Enums accept their own values: enum literals, and strings in variables",
    level: "MUST",
    spec: ["3.9"],
    basis: "String literals must be rejected. For JSON variables, \"strings may be interpreted as the enum input value with the same name\", which Coercion.tla does.",
  },
  {
    id: "inputObject",
    title: "Input objects: an object with only defined fields, field defaults, required fields",
    level: "MUST",
    spec: ["3.10"],
    basis:
      "The section mixes \"must\" (the value's shape, unknown fields) with \"should\" (field defaults, missing required fields). Coercion.tla doesn't report which sentence decided a verdict, so the check takes the stronger level.",
  },
  {
    id: "oneOf",
    title: "OneOf input objects take exactly one non-null field",
    level: "MUST",
    spec: ["3.10.1"],
    untested: "Coercion.tla doesn't model OneOf input objects, so there are no vectors for them.",
  },
  { id: "list", title: "Lists: each item coerced, a single value wrapped in a list", level: "MUST", spec: ["3.11"] },
  { id: "nonNull", title: "Non-Null rejects null", level: "MUST", spec: ["3.12"] },
  {
    id: "variables",
    title: "CoerceVariableValues: defaults, missing and null values, and failures as request errors",
    level: "MUST",
    spec: ["6.1.2"],
  },
  {
    id: "arguments",
    title: "CoerceArgumentValues: defaults, missing variables, and failures as field errors",
    level: "MUST",
    spec: ["6.4.1"],
  },
];

export const CHECK_IDS = new Set(CHECKS.map((c) => c.id));
export const sectionOf = (id) => CHECKS.find((c) => c.id === id).spec[0];

// The checks a vector exercises: its own, plus the algorithm that decides
// the kind of error the reference expects.
export const checksOf = (vector) => [
  vector.check,
  ...(vector.expected.outcome === "request-error" && vector.check !== "variables" ? ["variables"] : []),
  ...(vector.expected.outcome === "field-error" && vector.check !== "arguments" ? ["arguments"] : []),
];
