// Mutants for defer.ts. Each plants one plausible executor or publisher bug
// and names the one property that must catch it on its own.
export default [
  {
    name: "serializes every settled resolver, including ones under an object an error nulled",
    find: 'outcome[f] !== "none" && inResult(f, outcome, nulledAt);',
    replace: 'outcome[f] !== "none" && outcome[f] !== "dropped";',
    property: "fieldsOnlyUnderLiveParents",
  },
  {
    name: "stops null propagation at the failing field inside a deferred fragment",
    find: "!nonNull[f] ? f : sameUnit(parentOf[f], f)",
    replace: '!nonNull[f] || unitOf(f) !== "initial" ? f : sameUnit(parentOf[f], f)',
    property: "nonNullNeverNull",
  },
  {
    name: "finishes a result at its first field error, even one caught at a nullable field",
    find: "failed || FIELDS.values().every(",
    replace: "failed || FIELDS.values().some((g) => unitOf(g) === u && raisedFieldError(g, out[g])) || FIELDS.values().every(",
    property: "deliveredResultsAreComplete",
  },
  {
    name: "merges a failed fragment's partial data into the result",
    find: "const newData = failed ? data : mergedData(g);",
    replace: "const newData = mergedData(g);",
    property: "fieldsArriveWithTheirFragment",
  },
  {
    name: "builds a deferred payload from the fragment's selection set, re-sending a field the initial payload had",
    find: 'unitOf(f) === u && outcome[f] !== "none"',
    replace: 'selectedIn[f].values().some((s) => effectiveUnit(s) === u) && outcome[f] !== "none"',
    property: "fieldsArriveOnce",
  },
  {
    name: "announces every nested @defer, including ones the executor inlined",
    find: "FRAGMENTS.values().filter((g) => honored[g] && parentUnit(g) === u)",
    replace: "FRAGMENTS.values().filter((g) => parentUnit(g) === u)",
    property: "announcedFragmentsArriveLater",
  },
  {
    name: "schedules a nested fragment when its parent completes but leaves it out of pending",
    find: "pending = newGroups.union(pending);",
    replace: "",
    property: "completedWereAnnounced",
  },
  {
    name: "keeps a completed fragment in the work queue",
    find: "released.difference(new Set<Fragment>([g])).union(newGroups)",
    replace: "released.union(newGroups)",
    property: "completedAtMostOnce",
  },
  {
    name: "filters deferred work under nulled objects but not under a null root",
    find: 'p === "root" ? !isNull',
    replace: 'p === "root" ? true',
    property: "nullDataAnnouncesNothing",
  },
  {
    name: "reports an error for a nullable field that returned null",
    find: 'o === "error" || (o === "null" && nonNull[g])',
    replace: 'o === "error" || o === "null"',
    property: "errorsAreReal",
  },
  {
    name: "sends the request's whole error list with every payload",
    find: "const errs = errorsFrom(g, failed);",
    replace: 'const errs = errorsFrom(g, failed).union(errorsFrom("initial", false));',
    property: "errorsAtMostOncePerPath",
  },
  {
    name: "omits incremental[].errors from a fragment that completed with nulls",
    find: "const errs = errorsFrom(g, failed);",
    replace: "const errs = failed ? errorsFrom(g, true) : new Set<Field>();",
    property: "nullsAreExplained",
  },
  {
    name: "puts every error a failed fragment collected in completed[].errors",
    find: '(!onlyBoundary || catchPoint(g) === "boundary")',
    replace: "true",
    property: "failuresAreExplained",
  },
  {
    name: "starts deferred work as soon as its parent object resolves, ignoring enableEarlyExecution",
    find: "if (!earlyExecution || released.has(g)) return;",
    replace: "if (released.has(g)) return;",
    property: "lateExecutionWaitsForPending",
  },
  {
    name: "fails a fragment without aborting the deferred work it created",
    find: 'failsNow && u !== "initial" && honored[g] && descendsFrom(g, u as Fragment)',
    replace: "false",
    property: "noOrphanedWork",
  },
  {
    name: "applies a failed fragment's null to its parent object in the client's result",
    find: "const newData = failed ? data : mergedData(g);",
    replace:
      'const newData = failed && fragmentParent[g] !== "root" ? { ...data, [fragmentParent[g] as Field]: "null" as Slot } : failed ? data : mergedData(g);',
    property: "dataIsNeverRetracted",
  },
  {
    name: "computes hasNext from the work left before adding the fragments the payload releases",
    find: "hasNext = stillReleased.size > 0;",
    replace: "hasNext = stillReleased.difference(newGroups).size > 0;",
    property: "nothingChangesAfterClose",
  },
  {
    name: "waits for every called resolver, including abandoned ones under a nulled object",
    find: '!inResult(f, out, nul) || out[f] !== "none"',
    replace: '!invoked(f, out) || out[f] !== "none"',
    property: "streamEventuallyCloses",
  },
  {
    name: "sends a failed fragment's errors without a completed entry",
    find: "completions[g] = completions[g] + 1;",
    replace: "if (!failed) completions[g] = completions[g] + 1;",
    property: "streamEventuallyCloses",
  },
  {
    name: "announces a fragment whose parent object came back null",
    find: "new Set<Fragment>(children.values().filter((g) => presentIn(fragmentParent[g], newData, isNull)))",
    replace: "children",
    property: "hasNextLeadsToAnotherPayload",
  },
];
