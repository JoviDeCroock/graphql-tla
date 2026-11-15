// Everything the execution check reports on, with the spec sections it
// rests on (numbers from kit/spec-sections.json). A conformance sheet is
// built from these.

// `reference: true` checks are clauses of Cases!Failures; the rest are made
// in JS before the reference sees a case. `oct2021` gives the level in the
// October 2021 edition where it differs from the draft's. `basis` explains
// a check the spec implies rather than states, or why its level isn't the
// one a single sentence suggests. An INFO check grades behaviour outside
// the spec: it is reported, cites no section and never fails a run.
export const CHECKS = [
  // Reference!Clauses and Cases!Failures.
  {
    id: "complete",
    reference: true,
    level: "MUST",
    spec: ["6.3.1", "6.3.3", "7.1.5"],
    title: "The response is sent only once execution is complete",
    basis:
      "No sentence says to respond only once execution is complete; the algorithms do. ExecuteRootSelectionSet (§6.3.1) returns {data} once ExecuteCollectedFields has run, and §6.3.3 says \"Execution will recursively resolve and complete the value of every entry in the collected fields map\". The draft's §7.1.5 adds: \"The response data is the result of accumulating the resolved result of all response positions during execution.\" Positions §6.3.3 lets an implementation cancel don't hold the response back.",
  },
  {
    id: "dataMatches",
    reference: true,
    level: "MUST",
    spec: ["6.3.2", "6.4.3", "6.4.4"],
    title: "data is the completed value: field collection, value completion and null propagation",
    basis:
      "When an error propagates to the root, §6.4.4 and §7.1.5 say data \"should be null\", in both editions. The kit still requires null, because no other value conforms: the execution result must have a data entry (§7.1.1), {} or a partial map leaves out an entry ExecuteCollectedFields must produce (§6.3.3), and a map with null at the failed root field breaks that field's Non-Null type.",
  },
  { id: "keyOrder", reference: true, level: "SHOULD", spec: ["7.2.2"], title: "Response keys are in collected field order" },
  { id: "errorsWereRaised", reference: true, level: "MUST", spec: ["6.4.4", "7.1.6"], title: "Every error was raised, at the path where it was raised" },
  {
    id: "errorPathsUnique",
    reference: true,
    level: "MUST",
    oct2021: "SHOULD",
    spec: ["6.4.4"],
    title: "No two errors share a response path",
    basis:
      "The draft's §6.4.4: \"each error added to the errors list during execution must have a unique response path.\" October 2021's: \"only one error should be added to the errors list per field.\" Both editions say the errors list \"must not be further affected\" when a position is null because of an error already added.",
  },
  { id: "errorsInsideNulls", reference: true, level: "MUST", spec: ["6.4.4"], title: "Every error is inside a null in data" },
  {
    id: "nullsExplained",
    reference: true,
    level: "MUST",
    spec: ["6.4.4", "7.1.1"],
    title: "Every null an error caused comes with an error from one of its causes",
  },
  {
    id: "serialErrorsKept",
    reference: true,
    level: "MUST",
    spec: ["6.3.4", "6.4.4"],
    title: "A mutation reports every error its earlier root fields raised",
    mutationOnly: true,
    basis:
      "§6.4.4: an execution error \"must be added to the errors list\". §6.3.3 lets an implementation cancel fields that have not yet executed or yielded a value, but §6.3.4 completes each mutation root field before the next starts, so an earlier root field's errors can't have been cancelled.",
  },
  { id: "calledSerially", reference: true, level: "MUST", spec: ["6.2.2", "6.3.4"], title: "A mutation's root fields execute one after another", mutationOnly: true },
  // Checked in JS before the reference sees a case.
  { id: "callsOnce", level: "MUST", spec: ["6.3.2", "6.3.3"], title: "Each field is executed once, merged selections included" },
  { id: "callsSelected", level: "MUST", spec: ["6.3.2"], title: "Only fields the operation selects are executed" },
  { id: "callsReachable", level: "MUST", spec: ["6.3.3", "6.4.3"], title: "A field executes only once its parent has a value that contains it" },
  { id: "responds", level: "MUST", spec: ["7.1"], title: "A request gets a response" },
  { id: "eventYieldsResult", level: "MUST", spec: ["6.2.3.2"], title: "A subscription event yields an execution result, even when its data is null", subscriptionOnly: true },
  { id: "dataShape", level: "MUST", spec: ["7.1.5"], title: "data holds only positions the operation selects" },
  { id: "resultCoercion", level: "MUST", spec: ["3.5.2", "3.9", "6.4.3"], title: "A non-finite Float or an unknown enum value raises an execution error" },
  {
    id: "intFraction",
    level: "MUST",
    spec: ["3.5.1", "6.4.3"],
    title: "A fraction returned for an Int (1.2) raises an execution error instead of being truncated",
    basis:
      "§3.5.1 states the rule: services \"may coerce non-integer internal values to integers when reasonable without losing information, otherwise they must raise an execution error\". Its example applies it to this case: \"a floating-point number 1.2 should raise an execution error instead of being truncated to 1\". Truncating 1.2 loses information, so the rule's must applies. October 2021 has the same sentences, with \"field error\".",
  },
  { id: "leafValues", level: "MUST", spec: ["6.4.3"], title: "Leaf values are the resolver's canonical value (Int 1, Float 1.5, Boolean true, an enum's first value, \"v\")" },
  { id: "leafEncoding", level: "SHOULD", spec: ["7.2.1"], title: "Leaf values use the JSON type §7.2.1 gives their GraphQL type (a number for Int 1, not \"1\")" },
  { id: "dataPresent", level: "MUST", spec: ["7.1.1"], title: "An execution result has a data entry" },
  { id: "errorsList", level: "MUST", spec: ["7.1.1"], title: "errors, when present, is a non-empty list" },
  { id: "additionalEntries", level: "MUST", spec: ["7.1.8"], title: "The response has no entries besides data, errors and extensions" },
  { id: "extensions", level: "MUST", spec: ["7.1.7"], title: "extensions is a map" },
  { id: "errorFormat", level: "MUST", spec: ["7.1.6"], title: "Errors are maps with a message, and extensions, if present, is a map" },
  { id: "errorLocations", level: "SHOULD", spec: ["7.1.6"], title: "An error's locations, if present, is a list of maps with line and column, both positive integers" },
  { id: "errorPath", level: "MUST", spec: ["7.1.6"], title: "Execution errors have a path to a position the operation selects" },
  {
    id: "responsePosition",
    level: "MUST",
    oct2021: "SHOULD",
    spec: ["7.1.4"],
    title: "Paths are lists of response names (aliases, not field names) and integer list indices",
    basis:
      "The draft's §7.1.4: \"The value for a response path must be a list of path segments\", with list indices \"0-indexed integers\", and an aliased field \"must use the aliased name\". October 2021's §7.1.6 says each of these with should: \"This field should be a list of path segments\", \"If the error happens in an aliased field, the path to the error should use the aliased name\".",
  },
  { id: "errorEntries", level: "SHOULD", spec: ["7.1.6"], title: "Errors have no entries besides message, locations, path and extensions" },
  { id: "protocol", level: "ADAPTER", spec: [], title: "The adapter follows the kit's protocol (call types, settles)" },
  // Outside the spec: every failure in a fixture that turns error
  // propagation off counts here instead of against its own check.
  {
    id: "disabledPropagation",
    level: "INFO",
    spec: [],
    title: "With error propagation off, an error nulls the position where it happened (graphql-js 17's @experimental_disableErrorPropagation)",
    basis:
      "Not a GraphQL rule: neither edition has execution without error propagation. §6.4.4 says: \"Since Non-Null response positions cannot be null, execution errors are propagated to be handled by the parent response position.\" Every failure in the noPropagation fixture counts here, never against a spec section, and never fails the run. Adapter protocol problems still count as protocol.",
  },
];
