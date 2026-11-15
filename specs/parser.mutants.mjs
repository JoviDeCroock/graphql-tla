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
  {
    name: "accepts an empty FieldsDefinition {}",
    find: '  IF IsPunctuator(toks, k, RBrace) /\\ items # <<>> THEN Done(Items("FieldsDefinition", items), k + 1)',
    replace: '  IF IsPunctuator(toks, k, RBrace) THEN Done(Items("FieldsDefinition", items), k + 1)',
    file,
    property: "TypeSystemParses",
  },
  {
    name: "allows true, false and null as enum values",
    find: "  IN CASE ~IsName(toks, at) \\/ Tk(toks, at).value \\in {KwTrue, KwFalse, KwNull} -> Fail(at)",
    replace: "  IN CASE ~IsName(toks, at) -> Fail(at)",
    file,
    property: "TypeSystemParses",
  },
  {
    name: "rejects directives on a directive definition, as before September 2026",
    find: "      directives == OptionalDirectives(toks, arguments.next, TRUE)\n      repeatable ==",
    replace: "      directives == Done(Items(\"Directives\", <<>>), arguments.next)\n      repeatable ==",
    file,
    property: "TypeSystemParses",
  },
  {
    name: "accepts a variable in a type system default value",
    find: "      default == IF IsPunctuator(toks, type.next, Equals) THEN Value(toks, type.next + 1, TRUE)\n                 ELSE Done(NoNode, type.next)\n      directives == OptionalDirectives(toks, default.next, TRUE)\n  IN CASE ~name.ok -> name",
    replace: "      default == IF IsPunctuator(toks, type.next, Equals) THEN Value(toks, type.next + 1, FALSE)\n                 ELSE Done(NoNode, type.next)\n      directives == OptionalDirectives(toks, default.next, TRUE)\n  IN CASE ~name.ok -> name",
    file,
    property: "TypeSystemParses",
  },
  {
    name: "accepts any name as a directive location",
    find: "  IF IsName(toks, k) /\\ Tk(toks, k).value \\in DirectiveLocationNames",
    replace: "  IF IsName(toks, k)",
    file,
    property: "TypeSystemParses",
  },
  {
    name: "does not allow a leading | in union members",
    find: "  ELSE LET first == IF IsPunctuator(toks, k + 1, Pipe) THEN k + 2 ELSE k + 1",
    replace: "  ELSE LET first == k + 1",
    file,
    property: "TypeSystemParses",
  },
  {
    name: "reads extensions in a type system document",
    find: '            IF grammar \\in {"typeSystemExtension", "document"} THEN TypeSystemExtension(toks, k) ELSE Fail(k)',
    replace: '            IF grammar # "executable" THEN TypeSystemExtension(toks, k) ELSE Fail(k)',
    file,
    property: "TypeSystemParses",
  },
  {
    name: "accepts an object type extension with nothing to add (extend type T)",
    find: "       [] extension /\\ interfaces.node.children = <<>> /\\ directives.node.children = <<>>\n                    /\\ fields.node.children = <<>> -> Fail(fields.next)\n",
    replace: "",
    file,
    property: "ExtensionsParse",
  },
  {
    name: "accepts a description on an extension",
    find: "       [] IsKeyword(toks, k, KwExtend) ->\n            IF grammar \\in {\"typeSystemExtension\", \"document\"} THEN TypeSystemExtension(toks, k) ELSE Fail(k)",
    replace: "       [] IsKeyword(toks, keyword, KwExtend) ->\n            IF grammar \\in {\"typeSystemExtension\", \"document\"} THEN TypeSystemExtension(toks, keyword) ELSE Fail(k)",
    file,
    property: "ExtensionsParse",
  },
  {
    name: "a directive extension takes no directives (extend directive @d)",
    find: "       [] directives.node.children = <<>> -> Fail(directives.next)\n       [] OTHER -> Done(Node(\"DirectiveExtension\"",
    replace: "       [] OTHER -> Done(Node(\"DirectiveExtension\"",
    file,
    property: "ExtensionsParse",
  },
  {
    name: "a type without fields may be followed by an empty query shorthand (no [lookahead != {])",
    find: "  IF IsPunctuator(toks, k, LBrace) THEN FieldDefinitions(toks, k + 1, <<>>)",
    replace: "  IF IsPunctuator(toks, k, LBrace) /\\ ~IsPunctuator(toks, k + 1, RBrace) THEN FieldDefinitions(toks, k + 1, <<>>)",
    file,
    property: "DocumentGrammarsParse",
  },
  {
    name: "a Document holds no query shorthand",
    find: "      executable == \\/ IsPunctuator(toks, k, LBrace)\n                    \\/ ",
    replace: "      executable == \\/ ",
    file,
    property: "ExecutableGrammarAgrees",
  },
  {
    name: "a keyword can't name a variable ($query)",
    find: "  IF IsPunctuator(toks, k, Dollar) /\\ IsName(toks, k + 1)\n",
    replace: "  IF IsPunctuator(toks, k, Dollar) /\\ IsName(toks, k + 1) /\\ Tk(toks, k + 1).value \\notin OperationTypes\n",
    file,
    property: "EdgesParse",
  },
];
