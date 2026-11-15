// The coerce area's checks (docs/kit/coerce.md): one per section of the
// spec's input coercion rules, split where a section mixes MUST and SHOULD,
// so that each check has the level of the sentence it grades. Where the
// level is in doubt, the check takes the weaker one.
//
// Each vector names its primary check. A vector whose expected request
// error comes from CoerceVariableValues also exercises `variables`, and one
// whose expected answer is a field error also exercises `arguments` (the
// vector's `spec` lists §6.1.2 or §6.4.1). A vector that holds a list item
// or an input object field with a vector of its own rests on that vector
// first (its `restsOn`): where both fail, the failure counts where the inner
// vector's does (kit/coerce/run.mjs, attribute).

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
      "The sentence says a request error \"must be raised\" for \"a value outside the available precision\", but which values that covers is Coercion.tla's reading (an integral value must be exactly representable). A fraction such as 0.1 has no exact double either, and is accepted, so the text doesn't settle it, and the check takes the weaker level.",
  },
  {
    id: "string",
    title: "String accepts only string input values",
    level: "MUST",
    spec: ["3.5.3"],
    basis: "A JSON string with a lone surrogate is graded under loneSurrogates, not here.",
  },
  {
    id: "stringValue",
    title: "A string literal's escapes and block string indentation decode to its Unicode text",
    level: "MUST",
    spec: ["2.10.4"],
    basis:
      "§2.10.4's Static Semantics give a StringValue's Unicode text: each escape sequence's value, and for a block string BlockStringValue(), which removes the common indentation and the leading and trailing blank lines. They have no key word, but they define the value §3.5.3 then accepts, and the draft says \"Errors encountered during this evaluation ... must result in a parsing error\". The vectors use only escapes and block strings whose text is the same in both editions (no braced or surrogate pair escapes). Expected texts come from Lexer.tla.",
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
    basis:
      "§3.10.1 (the draft only): the value \"must contain exactly one entry and that entry must not be null or the null literal, otherwise a request error must be raised\", and \"The resulting coerced map must contain exactly one entry and the value for that entry must not be null, otherwise an execution error must be raised.\" The vectors are §3.10.1's table of examples and a few more, on a schema of their own (the vectors' `schema: \"oneOf\"`), all draft-only.",
  },
  {
    id: "list",
    title: "Lists: each item coerced, a single value wrapped in a list",
    level: "MUST",
    spec: ["3.11"],
    basis:
      "An item that isn't a list, where the item type is a list, is coerced as a list of one: \"list values are accepted only when each item in the list can be accepted by the list's item type\", and a value that is \"not a list\" is accepted by a list type as \"a list of size one\". That prose is the same in both editions. October 2021's table of examples says \"Error: Incorrect item value\" for [1, 2, 3] as [[Int]], but examples are non-normative (\"Examples in this document are non-normative\"), and the draft's table gives [[1], [2], [3]]. So these vectors aren't draft-only, and the table's answer fails this check under a finding of its own.",
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
    title: "A document with known validation errors fails as a request error, without executing",
    level: "MUST",
    spec: ["6.1.1"],
    basis:
      "\"If validation errors are known, they should be reported in the list of \\\"errors\\\" in the response and the request must fail without operation execution.\" The MUST holds only where the errors are known: graded for adapters without `unvalidated` that claim `validate`, on vectors Validation.tla rejects and the implementation's own validator (asked through the validate area) rejects too. A request error, no data, no resolver called. October 2021 says the same.",
  },
  {
    id: "onlyValidExecuted",
    title: "Only valid documents are executed",
    level: "SHOULD",
    spec: ["6.1.1", "5"],
    basis:
      "\"only operations from documents which pass all validation rules should be executed\" (§6.1.1), and \"execution should only occur for valid requests\" (§5). Graded for adapters without `unvalidated`, on vectors Validation.tla rejects whose errors the implementation's validator doesn't report (it accepts the document in the validate area, or the adapter doesn't claim validate, so the kit can't tell). Such a document is a validation rule the implementation misses, which the validate area grades at MUST; executing it is only this SHOULD. October 2021 says the same.",
  },
  {
    id: "acceptsValid",
    title: "A valid document isn't rejected at validation",
    level: "MUST",
    spec: ["5"],
    basis:
      "As the validate area's check of the same name: a document that breaks no validation rule is valid, and must not be refused as invalid. Graded for adapters without `unvalidated` that claim `validate`: a valid vector answered with a request error whose document the implementation's own validator rejects (asked through the validate area) fails here, not under the coercion rule the vector is about, whether or not the reference's answer is also a request error.",
  },
  {
    id: "requestErrorNoData",
    title: "A request error result has no data entry",
    level: "MUST",
    spec: ["7.1.3"],
    basis:
      "The draft: \"The request error result map must not contain an entry with key {\"data\"}.\" October 2021, §7.1: \"If the request failed before execution, due to a syntax error, missing information, or validation error, this entry must not be present.\" and §7.1.2: \"If a request error is raised, execution does not begin and the data entry in the response must not be present.\" Its §7.1.1 also says \"should not be present\", but the two MUST sentences are the ones about request errors, so the check is a MUST in both editions. A request error with \"data\": null is still a request error for the vector's own check, and fails this one.",
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
    id: "errorFormat",
    title: "Every error is a map with a string message",
    level: "MUST",
    spec: ["7.1.6"],
    basis:
      "\"Every error must contain an entry with the key {\"message\"} with a string description of the error\", and each error \"must be a map\" (§7.1.1, §7.1.3). October 2021 says the same (\"each error is a map\", \"Every error must contain an entry with the key message\"). A result whose errors aren't all maps with a string message, such as [null], or a field error with only a path, fails this check wherever its outcome would otherwise match. Every vector exercises it.",
  },
  {
    id: "errorsList",
    title: "errors, when present, is a non-empty list",
    level: "MUST",
    spec: ["7.1.1"],
    basis:
      "The same check as execution's. The draft, §7.1.1: \"If any errors are raised during operation execution, the execution result must contain an entry with key {\"errors\"}. The value of this entry must be a non-empty list ... If the request completed without raising any errors, this entry must not be present.\" October 2021, §7.1: \"If the request raised any errors, the response map must contain an entry with key errors. ... If the request completed without raising any errors, this entry must not be present.\" Its §7.1.2 also says \"should not be present\", but the §7.1 MUST is the sentence about the entry, so the check is a MUST in both editions, as in execution. A value with \"errors\": [] is still a value for the vector's own check, and fails this one. Every vector exercises it.",
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
  // coerceDefaults switch): recognised, but it fails the vector's check,
  // since draft-only vectors are graded like any other.
  oct2021: { level: "edition" },
  // The answer October 2021's §3.11 table of examples gives for an item
  // that isn't a list where the item type is a list (Coercion.tla's
  // nestedListItems switch). The table is non-normative, and §3.11's prose,
  // the same in both editions, gives the other answer: recognised, but it
  // fails the vector's check in both editions. With `validating`, the
  // answer of a service whose validator follows the table too (§5.6.1 asks
  // for literals to be coercible): a request error, graded only for
  // adapters without `unvalidated`.
  oct2021Example: { level: "example" },
  validating: { level: "example" },
};

export const CHECK_IDS = new Set(CHECKS.map((c) => c.id));
export const checkById = (id) => CHECKS.find((c) => c.id === id);
export const sectionOf = (id) => checkById(id).spec[0];
