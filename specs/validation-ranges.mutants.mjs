// Bugs planted in Validation.tla's numeric ranges (IntInputRange and
// ValuesOfCorrectTypeWithRanges, which KitCheckRule grades), each caught by
// RangeExamplesHold. They live apart from validation.mutants.mjs because
// scripts/differential-validation.mjs runs those against graphql-js rule by
// rule, and these operators aren't among Rules.

const file = "Validation.tla";

export default [
  {
    name: "Int's upper bound is inclusive",
    find: 'limit == IF LiteralChar(text, 1) = "-" THEN "2147483648" ELSE "2147483647"',
    replace: 'limit == "2147483648"',
    file,
    property: "RangeExamplesHold",
  },
  {
    name: "Int's lower bound is the upper bound negated",
    find: 'limit == IF LiteralChar(text, 1) = "-" THEN "2147483648" ELSE "2147483647"',
    replace: 'limit == "2147483647"',
    file,
    property: "RangeExamplesHold",
  },
  {
    name: "an Int literal's length alone decides its range",
    find: "Len(digits) < 10 \\/ (Len(digits) = 10 /\\ ~DecimalLess(limit, digits, 1))",
    replace: "Len(digits) <= 10",
    file,
    property: "RangeExamplesHold",
  },
  {
    name: "a Float literal's exponent is ignored",
    find: "place == Len(intPart) - k + exp",
    replace: "place == Len(intPart) - k",
    file,
    property: "RangeExamplesHold",
  },
  {
    name: "a Float literal's leading zeros count toward its size",
    find: "place == Len(intPart) - k + exp",
    replace: "place == Len(intPart) - 1 + exp",
    file,
    property: "RangeExamplesHold",
  },
  {
    name: "every Float literal of 10^308 or more overflows",
    find: "\\/ place = 308 /\\ DecimalLess(SubSeq(digits, k, Len(digits)), OverflowDigits, 1)",
    replace: "\\/ FALSE",
    file,
    property: "RangeExamplesHold",
  },
  {
    name: "Int literals given to Float aren't checked",
    find: "LiteralPositions(S, D, {\"int\", \"float\"}) :",
    replace: "LiteralPositions(S, D, {\"float\"}) :",
    file,
    property: "RangeExamplesHold",
  },
  {
    name: "Float's integer literals are bounded like Int's",
    find: 'q.type.name = "Int" /\\ ~IntLiteralFits(q.value.value)}}',
    replace: 'q.type.name \\in {"Int", "Float"} /\\ ~IntLiteralFits(q.value.value)}}',
    file,
    property: "RangeExamplesHold",
  },
];
