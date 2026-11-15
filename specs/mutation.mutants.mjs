export default [
  {
    name: "executes mutation root fields in parallel, like a query",
    find: "const SERIAL = true;",
    replace: "const SERIAL = false;",
    property: "noLostUpdates",
  },
  {
    name: "starts the next root field once the resolver returns, before its sub-selection completes",
    find: 'if (SERIAL && !before[field].values().every((f) => phase[f] === "done")) return;',
    replace:
      'if (SERIAL && !before[field].values().every((f) => phase[f] === "done" || phase[f] === "written")) return;',
    property: "responseIsSerial",
  },
  {
    name: "runs root fields serially but in the wrong order (third before second)",
    find: 'second: new Set<RootField>(["first"]),\n  third: new Set<RootField>(["first", "second"]),',
    replace: 'second: new Set<RootField>(["first", "third"]),\n  third: new Set<RootField>(["first"]),',
    property: "effectsInDocumentOrder",
  },
  {
    name: "a sub-selection error stops at a Non-Null root field instead of nulling data",
    find: "if (likesFails) {\n    failRootField(field);",
    replace: "if (likesFails) {\n    failed.add(field);",
    property: "dataNullIffNonNullRootFailed",
  },
  {
    name: "stops after a Non-Null root resolver raises, but not after its sub-selection fails",
    find: "if (stopsAfterNullRoot && before[field].values().some((f) => nonNull[f] && failed.has(f))) return;",
    replace:
      "if (stopsAfterNullRoot && before[field].values().some((f) => nonNull[f] && failed.has(f) && !effected.has(f))) return;",
    property: "nothingBeginsAfterDataNulled",
  },
];
