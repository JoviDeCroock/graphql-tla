// Everything the execution check reports on, with the spec sections it
// rests on (numbers from kit/spec-sections.json). A conformance sheet is
// built from these.

// `reference: true` checks are clauses of Cases!Failures; the rest are made
// in JS before the reference sees a case. `oct2021` gives the level in the
// October 2021 edition where it differs from the draft's. `basis` explains
// a check the spec implies rather than states.
export const CHECKS = [
  // Reference!Clauses and Cases!Failures.
  { id: "complete", reference: true, level: "MUST", spec: ["6.3.3", "7.1.1"], title: "The response is sent only once execution is complete" },
  { id: "dataMatches", reference: true, level: "MUST", spec: ["6.3.2", "6.4.3", "6.4.4"], title: "data is the completed value: field collection, value completion and null propagation" },
  { id: "keyOrder", reference: true, level: "SHOULD", spec: ["7.2.2"], title: "Response keys are in collected field order" },
  { id: "errorsWereRaised", reference: true, level: "MUST", spec: ["6.4.4", "7.1.6"], title: "Every error was raised, at the path where it was raised" },
  { id: "errorPathsUnique", reference: true, level: "MUST", spec: ["6.4.4"], title: "No two errors share a response path" },
  { id: "errorsInsideNulls", reference: true, level: "MUST", spec: ["6.4.4"], title: "Every error is inside a null in data" },
  { id: "nullsExplained", reference: true, level: "MUST", spec: ["6.4.4", "7.1.1"], title: "Every null an error caused comes with an error from its cause" },
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
  { id: "eventYieldsResult", level: "MUST", spec: ["6.2.3.2"], title: "A subscription event yields an execution result, even when its data is null", subscriptionOnly: true },
  { id: "dataShape", level: "MUST", spec: ["7.1.5"], title: "data holds only positions the operation selects" },
  { id: "resultCoercion", level: "MUST", spec: ["3.5.1", "3.5.2", "3.9", "6.4.3"], title: "A leaf value its type can't represent (a fraction for an Int, a non-finite Float, an unknown enum value) raises an execution error" },
  { id: "leafValues", level: "MUST", spec: ["6.4.3"], title: "Leaf values are the resolver's canonical value (Int 1, Float 1.5, Boolean true, an enum's first value, \"v\")" },
  { id: "dataPresent", level: "MUST", spec: ["7.1.1"], title: "An execution result has a data entry" },
  { id: "errorsList", level: "MUST", spec: ["7.1.1"], title: "errors, when present, is a non-empty list" },
  { id: "additionalEntries", level: "MUST", spec: ["7.1.8"], title: "The response has no entries besides data, errors and extensions" },
  { id: "extensions", level: "MUST", spec: ["7.1.7"], title: "extensions is a map" },
  { id: "errorFormat", level: "MUST", spec: ["7.1.6"], title: "Errors are maps with a message, and well-formed locations and extensions" },
  { id: "errorPath", level: "MUST", spec: ["7.1.6"], title: "Execution errors have a path to a position the operation selects" },
  { id: "responsePosition", level: "MUST", oct2021: "SHOULD", spec: ["7.1.4"], title: "Paths use field names and integer list indices" },
  { id: "errorEntries", level: "SHOULD", spec: ["7.1.6"], title: "Errors have no entries besides message, locations, path and extensions" },
  { id: "protocol", level: "ADAPTER", spec: [], title: "The adapter follows the kit's protocol (call types, settles)" },
];
