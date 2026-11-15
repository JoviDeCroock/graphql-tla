// The coerce area's checks (docs/kit/coerce.md): one per section of the
// spec's input coercion rules, split where a section mixes MUST and SHOULD,
// so that each check has the level of the sentence it grades. Where the
// level is in doubt, the check takes the weaker one.
//
// Each vector names its primary check. A vector whose expected request
// error comes from CoerceVariableValues also exercises `variables`, and one
// whose expected answer is a field error also exercises `arguments` (the
// vector's `spec` lists §6.1.2 or §6.4.1).

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
    title: "Float accepts integer and float input values, and rejects non-finite values",
    level: "MUST",
    spec: ["3.5.2"],
    basis:
      "A fractional value is kept as its decimal, which the vectors only use with at most 15 significant digits. Integers a double can't hold exactly are floatPrecision's.",
  },
  {
    id: "floatPrecision",
    title: "Float rejects an integer a double can't hold exactly",
    level: "SHOULD",
    spec: ["3.5.2"],
    basis:
      "The sentence says a request error \"must be raised\" for \"a value outside the available precision\", but which values that covers is Coercion.tla's reading (an integral value must be exactly representable), so the check takes the weaker level.",
  },
  {
    id: "string",
    title: "String accepts only string input values",
    level: "MUST",
    spec: ["3.5.3"],
    basis: "A JSON string with a lone surrogate is graded under loneSurrogates, not here.",
  },
  { id: "boolean", title: "Boolean accepts only boolean input values", level: "MUST", spec: ["3.5.4"] },
  {
    id: "idCoerced",
    title: "String and integer input values are coerced to ID strings",
    level: "SHOULD",
    spec: ["3.5.5"],
    basis:
      "\"any string (such as \\\"4\\\") or integer (such as 4 or -4) input value should be coerced to ID\". The format of an ID made from an integer is the service's: any string that writes the integer's exact value passes, such as \"1e+21\" for 10^21.",
  },
  { id: "id", title: "ID rejects input values other than strings and integers", level: "MUST", spec: ["3.5.5"] },
  {
    id: "enum",
    title: "Enums accept their own values, and reject string literals and unknown values",
    level: "MUST",
    spec: ["3.9"],
    basis:
      "String literals must be rejected. For JSON variables, \"strings may be interpreted as the enum input value with the same name\": a MAY, so taking the string and rejecting it both pass.",
  },
  {
    id: "inputObject",
    title: "Input objects: an object of defined fields, required fields, variables in fields",
    level: "MUST",
    spec: ["3.10"],
    basis:
      "The \"must\" sentences: the value must be an object without undefined fields, a variable's runtime value must be used, and §3.12 makes a missing Non-Null field an error that must be raised. Field defaults are a \"should\", graded by inputFieldDefaults.",
  },
  {
    id: "inputFieldDefaults",
    title: "An omitted input field gets its default value",
    level: "SHOULD",
    spec: ["3.10"],
    basis:
      "\"If no value is provided for a defined input object field and that field definition provides a default value, the result of coercing the default value ... should be used.\" The SHOULD applies to each field: a result that is right except that it leaves out some or all of such defaults fails this check, not inputObject.",
  },
  {
    id: "oneOf",
    title: "OneOf input objects take exactly one non-null field",
    level: "MUST",
    spec: ["3.10.1"],
    untested: "Coercion.tla doesn't model OneOf input objects, so there are no vectors for them.",
  },
  {
    id: "list",
    title: "Lists: each item coerced, a single value wrapped in a list",
    level: "MUST",
    spec: ["3.11"],
    basis:
      "An item that isn't a list, where the item type is a list, is coerced as a list of one, as the draft's table gives [[1], [2], [3]] for [1, 2, 3] as [[Int]]. October 2021's table says \"Error: Incorrect item value\", so those vectors are draft-only.",
  },
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
  {
    id: "getOperation",
    title: "GetOperation: the operation operationName names, or the only one, else a request error",
    level: "MUST",
    spec: ["6.1"],
    basis: "Includes a mutation running on the mutation root type, and only the selected operation's variables being coerced.",
  },
  {
    id: "invalidNotExecuted",
    title: "An invalid document fails as a request error, without executing",
    level: "MUST",
    spec: ["6.1.1"],
    basis:
      "\"If validation errors are known, they should be reported in the list of \\\"errors\\\" in the response and the request must fail without operation execution.\" Graded for adapters without `unvalidated`, on vectors Validation.tla rejects: a request error, no data, no resolver called.",
  },
  {
    id: "requestErrorNoData",
    title: "A request error result has no data entry",
    level: "MUST",
    oct2021: "SHOULD",
    spec: ["7.1.3"],
    basis:
      "The draft: \"The request error result map must not contain an entry with key {\"data\"}.\" October 2021 (§7.1.1): \"If an error was raised before execution begins, the data entry should not be present in the result.\" A request error with \"data\": null is still a request error for the vector's own check, and fails this one.",
  },
  {
    id: "responds",
    title: "A request gets a response",
    level: "MUST",
    spec: ["7"],
    basis:
      "\"When a GraphQL service receives a request, it must return a well-formed response.\" October 2021 says the same. The adapter answers with an `error` when the implementation produced no response at all, for example because it threw. Execution's check of the same name grades the same sentence. A vector whose reference answer is a request error, under a MUST check, counts that against its own check instead: a request error is a response, so no response doesn't match it. Every other vector exercises this check.",
  },
  {
    id: "fieldErrorPath",
    title: "A field error's path is the field's response path",
    level: "MUST",
    spec: ["7.1.6", "7.1.4"],
    basis:
      "§7.1.6: an error that \"can be associated to a particular field in the GraphQL result ... must contain an entry with the key {\"path\"} with a response path which describes the response position which raised the error\". §7.1.4: a response path names response positions, not arguments. A result whose data holds the field as null, with one error and no resolver call, is a field error whatever its path. If that is the answer the vector expects, a path other than the field's fails this check. Every vector that accepts a field error exercises it.",
  },
  {
    id: "loneSurrogates",
    title: "JSON strings with a lone surrogate: kept as sent, replaced with U+FFFD, or refused",
    level: "INFO",
    spec: [],
    basis:
      "§3.5.3 accepts \"only valid Unicode string input values\" without defining one, and calls a String \"a sequence of Unicode code points\", which a lone surrogate is. §3.5.5 says nothing about Unicode. RFC 8259 §8.2 calls the behaviour of software that receives such a string unpredictable. Coercion.tla refuses it, but the check also passes the value kept as sent and the value with U+FFFD, and records which happened. It never fails the run.",
  },
  {
    id: "jsonNumbers",
    title: "JSON numbers a double can't hold: read exactly, read as binary64, or refused",
    level: "INFO",
    spec: [],
    basis:
      "Not a GraphQL rule: RFC 8259 §6 lets a JSON parser limit the range and precision of numbers. Vectors whose answer depends on that count here, never against Float or ID, unless the adapter claims exact-numbers.",
  },
];

// What the spec leaves to the implementation (specs/Coercion.tla's
// policy switches). An answer that needs only MAYs, or readings of what the
// spec doesn't say, passes; one that needs a SHOULD left undone fails that
// SHOULD's check.
export const POLICIES = {
  enumFromString: { level: "MAY" },
  inputFieldDefaults: { level: "SHOULD", check: "inputFieldDefaults" },
  // A list item that is a variable with no runtime value: the spec doesn't
  // say what it coerces to. The default reading is null; these are the
  // others.
  missingListItemError: { level: "unspecified" },
  missingListItemDropped: { level: "unspecified" },
  // October 2021's answer to a draft-only vector (Coercion.tla's
  // coerceDefaults and nestedListItems switches): recognised, but it fails
  // the vector's check, since draft-only vectors are graded like any other.
  oct2021: { level: "edition" },
};

export const CHECK_IDS = new Set(CHECKS.map((c) => c.id));
export const checkById = (id) => CHECKS.find((c) => c.id === id);
export const sectionOf = (id) => checkById(id).spec[0];
