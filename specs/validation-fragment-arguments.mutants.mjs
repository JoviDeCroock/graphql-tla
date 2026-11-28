// Bugs planted in Validation.tla's reading of the fragment arguments
// proposal (graphql-spec#1081), each caught by FragmentArgumentExamplesHold.
// They live apart from validation.mutants.mjs because
// scripts/differential-validation.mjs runs those against graphql-js's
// September 2026 documents, and none of them has a fragment variable.

const file = "Validation.tla";
const property = "FragmentArgumentExamplesHold";

export default [
  {
    name: "two spreads of one fragment in a selection set may have different arguments",
    find: "  /\\ \\A a, b \\in SpreadsOf(members) : (a # b /\\ a.key = b.key) => SameArguments(D, a, b)",
    replace: "  /\\ TRUE",
  },
  {
    name: "spreads are compared within a selection set, but not in the merged set of two fields",
    find: "/\\ fuel > 0 => MembersCanMerge(S, D, SubmembersOf(S, D, a) \\cup SubmembersOf(S, D, b), fuel - 1)",
    replace: "/\\ fuel > 0 => MembersCanMerge(S, D, FieldsOf(SubmembersOf(S, D, a) \\cup SubmembersOf(S, D, b)), fuel - 1)",
  },
  {
    name: "arguments written alike are the same arguments, whichever spread provides the fragment variable",
    find: "  /\\ (ReferencesFragmentVariable(D, a) \\/ ReferencesFragmentVariable(D, b)) => SameVariableScope(D, a, b)",
    replace: "  /\\ TRUE",
  },
  {
    name: "a selection visited via no spread shares the variable scope of one visited via a spread",
    find: "    [] a.via = <<>> \\/ b.via = <<>> -> FALSE",
    replace: "    [] a.via = <<>> \\/ b.via = <<>> -> TRUE",
  },
  {
    name: "spreads of two fragments give the same variable scope when their arguments are identical",
    find: "    [] SpreadOf(a).selection.name # SpreadOf(b).selection.name -> FALSE\n",
    replace: "",
  },
  {
    name: "a field's sub-selections forget the spread the field was visited via",
    find: "            FieldType(S, field.parent, field.selection.name).name, {}, field.via, field.home)",
    replace: "            FieldType(S, field.parent, field.selection.name).name, {}, <<>>, field.home)",
  },
  {
    name: "a variable is looked up in the fragment that holds the selection set, not the one it was visited into",
    find: "UsedIn(m) == IF m.via = <<>> THEN m.home ELSE m.via[Len(m.via)].name",
    replace: "UsedIn(m) == m.home",
  },
  {
    name: "a fragment variable's default doesn't make its argument optional",
    find: "[type |-> VariableDefinition(fragment, n).type, hasDefault |-> VariableDefinition(fragment, n).hasDefault]]",
    replace: "[type |-> VariableDefinition(fragment, n).type, hasDefault |-> FALSE]]",
  },
  {
    name: "a spread's arguments have no expected type",
    find: "        IF name \\notin DOMAIN defs THEN NoType\n",
    replace: '        IF name \\notin DOMAIN defs \\/ argumentSet.of = "spread" THEN NoType\n',
  },
  {
    name: "a spread's arguments aren't checked against its fragment's variables",
    find: "           known |-> HasFragment(D, s.selection.name),",
    replace: "           known |-> FALSE,",
  },
  {
    name: "a fragment variable's default isn't its spread argument's default (graphql-js 17.1)",
    find: "                        args[i].name \\in DOMAIN defs /\\ defs[args[i].name].hasDefault,",
    replace: '                        args[i].name \\in DOMAIN defs /\\ defs[args[i].name].hasDefault /\\ argumentSet.of # "spread",',
  },
  {
    name: "a fragment variable's directives are at FRAGMENT_VARIABLE_DEFINITION (graphql-js 17.1)",
    find: '    \\cup {[directives |-> definition.variables[i].directives, location |-> "VARIABLE_DEFINITION"]',
    replace:
      '    \\cup {[directives |-> definition.variables[i].directives,\n           location |-> IF definition.kind = "fragment" THEN "FRAGMENT_VARIABLE_DEFINITION" ELSE "VARIABLE_DEFINITION"]',
  },
  {
    name: "only an operation's variables must be unique",
    find: "k # j /\\ vars[k].name = vars[j].name}}\n         : o \\in ExecutableIndices(D)}",
    replace: "k # j /\\ vars[k].name = vars[j].name}}\n         : o \\in OperationIndices(D)}",
  },
  {
    name: "only an operation's variables must be input types",
    find: "~IsInputType(S, vars[j].type)}}\n         : o \\in ExecutableIndices(D)}",
    replace: "~IsInputType(S, vars[j].type)}}\n         : o \\in OperationIndices(D)}",
  },
  {
    name: "an operation must define the variables its fragments define",
    find: "          : u \\in {x \\in OperationVariableUsages(S, D, op) : x.value.value \\notin VariableNames(op)}}",
    replace: "          : u \\in {x \\in {y.usage : y \\in OperationUsages(S, D, op)} : x.value.value \\notin VariableNames(op)}}",
  },
  {
    name: "a use inside a fragment that defines the name counts as a use of the operation's variable",
    find: "  {u.usage : u \\in {x \\in OperationUsages(S, D, operation) : ~IsFragmentVariableUsage(D, x)}}",
    replace: "  {u.usage : u \\in OperationUsages(S, D, operation)}",
  },
  {
    name: "a fragment's variables needn't be used",
    find: "                IN {VariableSubject(fragment, n) : n \\in VariableNames(fragment) \\ used}",
    replace: "                IN {}",
  },
  {
    name: "a use in a directive on the fragment definition counts as a use in its selection set (graphql-js 17.1)",
    find: "                    used == {u.value.value : u \\in SelectionSetUsages(S, D, fragment)}",
    replace: "                    used == {u.value.value : u \\in DefinitionUsages(S, D, fragment)}",
  },
  {
    name: "the operation's definition of a variable is used where a fragment defines one too",
    find: "  IF IsFragmentVariableUsage(D, u) THEN VariableDefinition(Fragment(D, u.within), u.usage.value.value)\n  ELSE VariableDefinition(op, u.usage.value.value)",
    replace:
      "  IF u.usage.value.value \\in VariableNames(op) THEN VariableDefinition(op, u.usage.value.value)\n  ELSE VariableDefinition(Fragment(D, u.within), u.usage.value.value)",
  },
].map((mutant) => ({ ...mutant, file, property }));
