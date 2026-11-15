// Bugs planted in the executor (execution.ts), each caught by the
// conformance module's properties (ExecutionConformance.tla).

const module = "ExecutionConformance.tla";

export default [
  {
    name: "nulls a failing Non-Null field itself instead of propagating",
    find: 'outcomes.get(path)!.kind === "error"\n      ? isNonNull(positionOf(path).type) ? "error" : "nulled"',
    replace: 'outcomes.get(path)!.kind === "error"\n      ? "nulled"',
    module,
    property: "ResponseIsValid",
  },
  {
    name: "accepts null from a Non-Null field's resolver",
    find: 'outcomes.get(path)!.kind === "null"\n        ? isNonNull(positionOf(path).type) ? "error" : "null"',
    replace: 'outcomes.get(path)!.kind === "null"\n        ? "null"',
    module,
    property: "ResponseIsValid",
  },
  {
    name: "responds once the root resolvers settle, without waiting for nested ones",
    find: 'if (!started || sent || rootStatus() === "pending") return;',
    replace: 'if (!started || sent || rootGroups().some((g) => !outcomes.has([g.key]))) return;',
    module,
    property: "ResponseIsValid",
  },
  {
    name: "builds data in the reverse of the collected field order",
    find: "entries: rootGroups().map((g) => ({ key: g.key, value: jsonOf([g.key]) }))",
    replace: "entries: rootGroups().toReversed().map((g) => ({ key: g.key, value: jsonOf([g.key]) }))",
    module,
    property: "ResponseIsValid",
  },
  {
    name: "drops list indices from error paths",
    find: "if (reported) errors.push(path);",
    replace: 'if (reported) errors.push(path.filter((s) => s !== "0" && s !== "1"));',
    module,
    property: "ResponseIsValid",
  },
  {
    name: "ignores @include",
    find: "!(selection.include.kind !== \"absent\" && !ifValue(selection.include))",
    replace: "true",
    module,
    property: "ResponseIsValid",
  },
  {
    name: "ignores @skip",
    find: "!(selection.skip.kind !== \"absent\" && ifValue(selection.skip)) &&",
    replace: "",
    module,
    property: "ResponseIsValid",
  },
  {
    name: "matches a type condition on an interface by name only",
    find: "fx().schema.types.get(condition)!.kind === \"object\"\n    ? objectType === condition",
    replace: "true\n    ? objectType === condition",
    module,
    property: "ResponseIsValid",
  },
  {
    name: "gives a repeated response key a second entry instead of merging",
    find: "groups.some((g) => g.key === key)\n    ?",
    replace: "false\n    ?",
    module,
    property: "ResponseIsValid",
  },
  {
    name: "reports one error per parent object, dropping the one that nulled it",
    find: '(variant === "reportAll" || !isInNulledSubtree(path));',
    replace:
      '(variant === "reportAll" || !isInNulledSubtree(path)) &&\n    !errors.some((e) => e.length === path.length && e.slice(0, -1).every((s, i) => s === path[i]));',
    module,
    property: "ResponseIsValid",
  },
  {
    name: "returns the live errors list, which abandoned resolvers keep appending to",
    find: "if (reported) errors.push(path);",
    replace: "if (reported) errors.push(path);\n  if (reported && sent) sentErrors.push(path);",
    module,
    property: "ResponseIsFinal",
  },
  {
    name: "only responds when asked (no fairness for respond)",
    find: "/** @fair */\nexport const respond",
    replace: "export const respond",
    module,
    property: "EventuallyResponds",
  },
  {
    name: "responds once the root resolvers settle, without waiting for nested ones",
    find: 'if (!started || sent || rootStatus() === "pending") return;',
    replace: 'if (!started || sent || rootGroups().some((g) => !outcomes.has([g.key]))) return;',
    module,
    property: "Refines",
  },
  {
    name: "returns the live errors list, which abandoned resolvers keep appending to",
    find: "if (reported) errors.push(path);",
    replace: "if (reported) errors.push(path);\n  if (reported && sent) sentErrors.push(path);",
    module,
    property: "Refines",
  },
  {
    name: "only responds when asked (no fairness for respond)",
    find: "/** @fair */\nexport const respond",
    replace: "export const respond",
    module,
    property: "Refines",
  },
];
