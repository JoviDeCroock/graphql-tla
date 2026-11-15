// Everything the execution check reports on, with the spec sections it
// rests on (numbers from kit/spec-sections.json). A conformance sheet is
// built from these.

export const CHECKS = [
  // Reference!Clauses and Cases!Failures.
  { id: "complete", level: "MUST", spec: ["6.3.3", "7.1.1"], title: "The response is sent only once execution is complete" },
  { id: "dataMatches", level: "MUST", spec: ["6.3.2", "6.4.3", "6.4.4"], title: "data is the completed value: field collection, value completion and null propagation" },
  { id: "keyOrder", level: "SHOULD", spec: ["7.2.2"], title: "Response keys are in collected field order" },
  { id: "errorsWereRaised", level: "MUST", spec: ["6.4.4", "7.1.6"], title: "Every error was raised, at the path where it was raised" },
  { id: "errorPathsUnique", level: "MUST", spec: ["6.4.4"], title: "No two errors share a response path" },
  { id: "errorsInsideNulls", level: "MUST", spec: ["6.4.4"], title: "Every error is inside a null in data" },
  { id: "nullsExplained", level: "MUST", spec: ["6.4.4", "7.1.1"], title: "Every null an error caused comes with an error from its cause" },
  { id: "serialErrorsKept", level: "MUST", spec: ["6.3.4", "6.4.4"], title: "A mutation reports every error its earlier root fields raised", mutationOnly: true },
  { id: "calledSerially", level: "MUST", spec: ["6.2.2", "6.3.4"], title: "A mutation's root fields execute one after another", mutationOnly: true },
  // Checked in JS before the reference sees a case.
  { id: "callsOnce", level: "MUST", spec: ["6.3.2", "6.3.3"], title: "Each field is executed once, merged selections included" },
  { id: "callsSelected", level: "MUST", spec: ["6.3.2"], title: "Only fields the operation selects are executed" },
  { id: "dataShape", level: "MUST", spec: ["7.1.5"], title: "data holds only positions the operation selects" },
  { id: "leafValues", level: "MUST", spec: ["3.5", "6.4.3"], title: "Leaf values are the resolver's value, result-coerced" },
  { id: "dataPresent", level: "MUST", spec: ["7.1.1"], title: "An execution result has a data entry" },
  { id: "errorsList", level: "MUST", spec: ["7.1.1"], title: "errors, when present, is a non-empty list" },
  { id: "additionalEntries", level: "MUST", spec: ["7.1.8"], title: "The response has no entries besides data, errors and extensions" },
  { id: "extensions", level: "MUST", spec: ["7.1.7"], title: "extensions is a map" },
  { id: "errorFormat", level: "MUST", spec: ["7.1.6"], title: "Errors are maps with a message, and well-formed locations and extensions" },
  { id: "errorPath", level: "MUST", spec: ["7.1.6"], title: "Execution errors have a path to a position the operation selects" },
  { id: "responsePosition", level: "MUST", spec: ["7.1.4"], title: "Paths use field names and integer list indices" },
  { id: "errorEntries", level: "SHOULD", spec: ["7.1.6"], title: "Errors have no entries besides message, locations, path and extensions" },
  { id: "protocol", level: "ADAPTER", spec: [], title: "The adapter follows the kit's protocol (call types, settles)" },
];

// The check a normalization problem or warning belongs to.
export const problemId = (text) =>
  // A field called twice is then settled twice by the kit.
  /called twice|settled twice/.test(text)
    ? "callsOnce"
    : /which the operation doesn't select/.test(text) && /^a resolver was called/.test(text)
      ? "callsSelected"
      : /^data has a value at/.test(text)
        ? "dataShape"
        : /not the canonical/.test(text)
          ? "leafValues"
          : /no data entry/.test(text)
            ? "dataPresent"
            : /^errors (isn't a list|is present but empty)/.test(text)
              ? "errorsList"
              : /^the response has an entry/.test(text)
                ? "additionalEntries"
                : /^extensions isn't a map/.test(text)
                  ? "extensions"
                  : /^errors have entries/.test(text)
                    ? "errorEntries"
                    : /without a path|isn't a position the operation selects/.test(text)
                      ? "errorPath"
                      : /^error path .* where §7\.1\.4/.test(text)
                        ? "responsePosition"
                        : /^an error|^the response isn't a map/.test(text)
                          ? "errorFormat"
                          : "protocol";
