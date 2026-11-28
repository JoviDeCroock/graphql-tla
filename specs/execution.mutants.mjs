// Bugs planted in the executor (execution.ts), each caught by the
// conformance module's properties (ExecutionConformance.tla).

const module = "ExecutionConformance.tla";

export default [
  {
    name: "nulls a failing Non-Null field itself instead of propagating",
    find: 'const failed = (path: Path): Status => (propagates(positionOf(path).type) ? "error" : "nulled");',
    replace: 'const failed = (path: Path): Status => "nulled";',
    module,
    property: "ResponseIsValid",
  },
  {
    name: "accepts null from a Non-Null field's resolver",
    find: '(outcome.kind === "null" && isNonNull(positionOf(path).type));',
    replace: "false;",
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
    find: "entries: rootGroups().map((g) => ({",
    replace: "entries: rootGroups().toReversed().map((g) => ({",
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
    find: "!(selection.include.kind !== \"absent\" && !ifValue(selection.include, scope))",
    replace: "true",
    module,
    property: "ResponseIsValid",
  },
  {
    name: "ignores @skip",
    find: "!(selection.skip.kind !== \"absent\" && ifValue(selection.skip, scope)) &&",
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
    name: "merges only the first field's sub-selection into the collected subfields",
    find: "collect(objectType, fields[i].field.selectionSet, fields[i].scope, 0, {",
    replace: "collect(objectType, fields[0].field.selectionSet, fields[0].scope, 0, {",
    module,
    property: "ResponseIsValid",
  },
  {
    name: "applies a fragment on a union to every object type",
    find: "    : fx().schema.types.get(condition)!.possibleTypes.has(objectType);",
    replace:
      '    : fx().schema.types.get(condition)!.kind === "union" || fx().schema.types.get(condition)!.possibleTypes.has(objectType);',
    module,
    property: "ResponseIsValid",
  },
  {
    name: "reads a variable in @skip or @include as false",
    find: "    : hasValue(scope, condition.variable) && valueOf(scope, condition.variable) === \"true\";",
    replace: "    : false;",
    module,
    property: "ResponseIsValid",
  },
  {
    name: "skips an inline fragment without a type condition",
    find: "? selection.typeCondition !== \"\" && !applies(objectType, selection.typeCondition)",
    replace: "? selection.typeCondition === \"\" || !applies(objectType, selection.typeCondition)",
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
  {
    name: "propagates errors under @experimental_disableErrorPropagation",
    find: "const propagates = (type: TypeRef) => isNonNull(type) && fx().errorPropagation;",
    replace: "const propagates = (type: TypeRef) => isNonNull(type);",
    module,
    property: "ResponseIsValid",
  },
  {
    name: "answers __typename with the declared type instead of the runtime type",
    find: "isTypename(g) ? typenameJson(outcomes.get(path)!.type)",
    replace: "isTypename(g) ? typenameJson(positionOf(path).type.name)",
    module,
    property: "ResponseIsValid",
  },
  {
    name: "accepts an object for a scalar or a non-list for a list",
    find: "  (outcome.kind !== expectedKind(position) ||",
    replace: "  (false ||",
    module,
    property: "ResponseIsValid",
  },
  {
    name: "accepts a runtime type that isn't a possible type of the abstract type",
    find: "      !fx().schema.types.get(position.type.name)!.possibleTypes.has(outcome.type)));",
    replace: "      false));",
    module,
    property: "ResponseIsValid",
  },
  {
    name: "executes a mutation's root fields in parallel",
    find: 'const count = fx().operationType === "mutation" ? 1 : rootGroups().length;',
    replace: "const count = rootGroups().length;",
    module,
    property: "RootFieldsAreSerial",
  },
  {
    name: "starts the next mutation field once the previous resolver settles, before its sub-selection completes",
    find: 'if (statusOf(rootPaths(startedRoots)[startedRoots - 1]) === "pending") return;',
    replace: "if (!outcomes.has(rootPaths(startedRoots)[startedRoots - 1])) return;",
    module,
    property: "RootFieldsAreSerial",
  },
  {
    name: "responds once the root resolvers settle, without waiting for nested ones",
    find: 'if (!started || sent || rootStatus() === "pending") return;',
    replace: 'if (!started || sent || rootGroups().some((g) => !outcomes.has([g.key]))) return;',
    module,
    property: "ResponseStaysValid",
  },
  {
    name: "filters errors against the final null set, dropping a mutation's earlier root field errors",
    find: "  const data = responseData();\n  sent = true;\n  sentData = data;\n  sentErrors = errors;",
    replace:
      "  const data = responseData();\n  const kept = errors.filter((e) => !isInNulledSubtree(e));\n  sent = true;\n  sentData = data;\n  sentErrors = kept;",
    module,
    property: "ResponseIsValid",
  },
  // Fragment arguments (graphql-spec#1081): the fragmentArguments fixtures.
  ...[
    {
      name: "reads the operation's variable where the fragment defines one of that name",
      find: 'const isLocal = (scope: Scope, name: string) =>\n  scope.fragment !== "" &&',
      replace: 'const isLocal = (scope: Scope, name: string) =>\n  scope.fragment !== "" && !fx().variables.has(name) &&',
    },
    {
      name: "ignores a fragment variable's default when the spread gives no argument",
      find: "    : definition.hasDefault\n      ? { ok: true,",
      replace: "    : false\n      ? { ok: true,",
    },
    {
      name: "uses a fragment variable's default only when the spread has no argument, not when its variable has no value",
      find: "    : definition.hasDefault\n      ? { ok: true,",
      replace: "    : definition.hasDefault && !args.some((a) => a.name === definition.name)\n      ? { ok: true,",
    },
    {
      name: "gives a Non-Null fragment variable its default when the spread passes null",
      find: '    ? definition.nonNull && givenValue(args, definition.name, scope) === "null"\n      ? { ok: false, values: bound.values }',
      replace:
        '    ? definition.nonNull && givenValue(args, definition.name, scope) === "null"\n      ? { ok: true, values: [...bound.values, { name: definition.name, value: definition.default }] }',
    },
    {
      name: "reads a spread's variable argument in the scope of the fragment it spreads",
      find: "bind(fx().fragments.get(selection.name)!.variableDefinitions, selection.arguments, scope, 0, {",
      replace:
        "bind(fx().fragments.get(selection.name)!.variableDefinitions, selection.arguments, { fragment: selection.name, values: [] }, 0, {",
    },
    {
      name: "collects every field of a field set in the scope of the first",
      find: "collect(objectType, fields[i].field.selectionSet, fields[i].scope, 0, {",
      replace: "collect(objectType, fields[i].field.selectionSet, fields[0].scope, 0, {",
    },
    {
      name: "skips a spread whose arguments are refused, and collects the rest of the selection set",
      find: "    : { groups: acc.groups, visited: acc.visited, failed: true };",
      replace: "    : { groups: acc.groups, visited: acc.visited, failed: false };",
    },
    {
      name: "gives an object whose sub-selection can't be collected no fields, instead of an error",
      find: "  cannotCollect(positionOf(path), outcome) ||\n",
      replace: "",
    },
  ].map((mutant) => ({ ...mutant, module, property: "ResponseIsValid" })),
];
