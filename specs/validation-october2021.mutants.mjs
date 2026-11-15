// Bugs planted in Validation.tla's October 2021 Single root field
// (SingleRootFieldOctober2021), each caught by October2021ExamplesHold.
// They live apart from validation.mutants.mjs because
// scripts/differential-validation.mjs runs those against graphql-js, which
// checks only the draft's rules.

const file = "Validation.tla";

export default [
  {
    name: "October 2021's @include(if: $v) keeps the selection with no variable values",
    find: 'selection.directives[j].name = "include" /\\ ~IfIsTrue(selection.directives[j])',
    replace: 'selection.directives[j].name = "include" /\\ selection.directives[j].arguments[1].value.value = "false"',
    file,
    property: "October2021ExamplesHold",
  },
  {
    name: "October 2021's @skip(if: $v) drops the selection with no variable values",
    find: 'selection.directives[j].name = "skip" /\\ IfIsTrue(selection.directives[j])',
    replace: 'selection.directives[j].name = "skip" /\\ selection.directives[j].arguments[1].value.value # "false"',
    file,
    property: "October2021ExamplesHold",
  },
  {
    name: "October 2021's CollectFields marks a skipped fragment spread as visited",
    find: "IF SkippedWithoutVariables(selection) THEN acc",
    replace:
      'IF SkippedWithoutVariables(selection) THEN (IF selection.kind = "fragmentSpread" THEN [acc EXCEPT !.visited = @ \\cup {selection.name}] ELSE acc)',
    file,
    property: "October2021ExamplesHold",
  },
];
