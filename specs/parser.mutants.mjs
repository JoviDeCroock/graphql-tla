// Bugs planted in the hand-written parser (Parser.tla), each caught by one of
// its vector properties. scripts/differential-lexer.mjs --mutants plants the
// same bugs and checks that the differential against graphql-js catches each
// one too.

const file = "Parser.tla";

export default [
  {
    name: "accepts an empty document",
    find: "ExecutableDocument(toks) == IF toks = <<>> THEN Fail(1) ELSE Definitions(toks, 1, <<>>)",
    replace: "ExecutableDocument(toks) == Definitions(toks, 1, <<>>)",
    file,
    property: "DocumentsParse",
  },
  {
    name: "allows a description on query shorthand",
    find: "  CASE IsPunctuator(toks, k, LBrace) -> ShorthandQuery(toks, k)",
    replace: "  CASE IsPunctuator(toks, keyword, LBrace) -> ShorthandQuery(toks, keyword)",
    file,
    property: "DocumentsParse",
  },
  {
    name: "requires a non-empty selection set, as before graphql-spec#1227",
    find: "  IF IsPunctuator(toks, k, RBrace) THEN Done(Items(\"SelectionSet\", items), k + 1)",
    replace: "  IF IsPunctuator(toks, k, RBrace) /\\ items # <<>> THEN Done(Items(\"SelectionSet\", items), k + 1)",
    file,
    property: "SelectionsParse",
  },
  {
    name: "allows `on` as a fragment name",
    find: "FragmentName(toks, k) == IF IsKeyword(toks, k, KwOn) THEN Fail(k) ELSE NameNode(toks, k)",
    replace: "FragmentName(toks, k) == NameNode(toks, k)",
    file,
    property: "SelectionsParse",
  },
  {
    name: "accepts empty arguments ()",
    find: "  IF IsPunctuator(toks, k, RParen) /\\ items # <<>> THEN Done(Items(\"Arguments\", items), k + 1)",
    replace: "  IF IsPunctuator(toks, k, RParen) THEN Done(Items(\"Arguments\", items), k + 1)",
    file,
    property: "SelectionsParse",
  },
  {
    name: "reads true and false as enum values",
    find: "    [] IsKeyword(toks, k, KwTrue) \\/ IsKeyword(toks, k, KwFalse) ->",
    replace: "    [] FALSE ->",
    file,
    property: "ValuesParse",
  },
  {
    name: "drops the last item of a list value",
    find: "  IF IsPunctuator(toks, k, RBracket) THEN Done(Items(\"ListValue\", items), k + 1)",
    replace:
      "  IF IsPunctuator(toks, k, RBracket) THEN Done(Items(\"ListValue\", IF items = <<>> THEN items ELSE Tail(items)), k + 1)",
    file,
    property: "ValuesParse",
  },
  {
    name: "accepts a variable in a default value",
    find: "IF IsPunctuator(toks, type.next, Equals) THEN Value(toks, type.next + 1, TRUE)",
    replace: "IF IsPunctuator(toks, type.next, Equals) THEN Value(toks, type.next + 1, FALSE)",
    file,
    property: "VariablesParse",
  },
  {
    name: "drops the Non-Null wrapper of a list type",
    find: "THEN Done(Node(\"NonNullType\", <<>>, <<nullable.node>>), nullable.next + 1)",
    replace:
      "THEN Done(IF nullable.node.kind = \"ListType\" THEN nullable.node ELSE Node(\"NonNullType\", <<>>, <<nullable.node>>), nullable.next + 1)",
    file,
    property: "VariablesParse",
  },
  {
    name: "accepts an empty variable list ()",
    find: "  IF IsPunctuator(toks, k, RParen) /\\ items # <<>> THEN Done(Items(\"VariablesDefinition\", items), k + 1)",
    replace: "  IF IsPunctuator(toks, k, RParen) THEN Done(Items(\"VariablesDefinition\", items), k + 1)",
    file,
    property: "VariablesParse",
  },
];
