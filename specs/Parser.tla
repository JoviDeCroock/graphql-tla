---- MODULE Parser ----
(***************************************************************************)
(* The syntactic grammar of executable documents, written by hand from the *)
(* spec (https://spec.graphql.org/draft/, §2.3 to §2.13): a recursive-     *)
(* descent reading of ExecutableDocument over the tokens of Lexer.tla.      *)
(*                                                                         *)
(* "The lexical token sequence, omitting Ignored, must be described by a   *)
(* single Document syntactic grammar." Documents with type system          *)
(* definitions are out of scope: they are not an ExecutableDocument, and   *)
(* ParseExecutable rejects them.                                           *)
(*                                                                         *)
(* Data shapes (uniform, since TLC can't compare records of different      *)
(* shapes):                                                                *)
(*   node    [kind, text, children]  kind is the production, text its      *)
(*           name or value as code points (<<>> if it has none), and       *)
(*           children its parts in a fixed order, with NoNode for an       *)
(*           optional part that is absent:                                 *)
(*     Document             definitions                                    *)
(*     OperationDefinition  text: query, mutation or subscription;         *)
(*                          <<Description, Name, VariablesDefinition,      *)
(*                            Directives, SelectionSet>>                   *)
(*     FragmentDefinition   text: the name; <<Description, NamedType,      *)
(*                            Directives, SelectionSet>>                   *)
(*     SelectionSet         selections                                     *)
(*     Field                text: the name; <<alias Name, Arguments,       *)
(*                            Directives, SelectionSet>>                   *)
(*     FragmentSpread       text: the name; <<Directives>>                 *)
(*     InlineFragment       <<NamedType, Directives, SelectionSet>>        *)
(*     VariableDefinition   <<Description, Variable, Type, default value,  *)
(*                            Directives>>                                 *)
(*     Arguments, Directives, VariablesDefinition, ListValue, ObjectValue  *)
(*                          their items, possibly none                     *)
(*     Argument, ObjectField, Directive   text: the name; <<value>> or     *)
(*                          <<Arguments>>                                  *)
(*     ListType, NonNullType  <<inner type>>                               *)
(*     NamedType, Name, Variable, IntValue, FloatValue, StringValue,       *)
(*     BlockString, BooleanValue, EnumValue, NullValue   text only         *)
(*   parsed  [ok, node, next]  next is the index of the token after the    *)
(*           production, or of the token where the syntax error is.        *)
(***************************************************************************)
EXTENDS Lexer

Node(kind, text, children) == [kind |-> kind, text |-> text, children |-> children]
NoNode == Node("None", <<>>, <<>>)
Items(kind, items) == Node(kind, <<>>, items)

Parsed(ok, node, next) == [ok |-> ok, node |-> node, next |-> next]
Done(node, next) == Parsed(TRUE, node, next)
Fail(at) == Parsed(FALSE, NoNode, at)

EndOfTokens == [kind |-> "EOF", value |-> <<>>]
Tk(toks, k) == IF k >= 1 /\ k <= Len(toks) THEN toks[k] ELSE EndOfTokens

IsPunctuator(toks, k, p) == Tk(toks, k).kind = "Punctuator" /\ Tk(toks, k).value = <<p>>
IsSpread(toks, k) == Tk(toks, k).kind = "Punctuator" /\ Tk(toks, k).value = Spread
IsName(toks, k) == Tk(toks, k).kind = "Name"
IsKeyword(toks, k, word) == IsName(toks, k) /\ Tk(toks, k).value = word
IsString(toks, k) == Tk(toks, k).kind \in {"StringValue", "BlockString"}

Bang == 33
Dollar == 36
LParen == 40
RParen == 41
Colon == 58
Equals == 61
At == 64
LBracket == 91
RBracket == 93

KwQuery == <<113, 117, 101, 114, 121>>
KwMutation == <<109, 117, 116, 97, 116, 105, 111, 110>>
KwSubscription == <<115, 117, 98, 115, 99, 114, 105, 112, 116, 105, 111, 110>>
KwFragment == <<102, 114, 97, 103, 109, 101, 110, 116>>
KwOn == <<111, 110>>
KwTrue == <<116, 114, 117, 101>>
KwFalse == <<102, 97, 108, 115, 101>>
KwNull == <<110, 117, 108, 108>>

\* OperationType : one of `query` `mutation` `subscription`
OperationTypes == {KwQuery, KwMutation, KwSubscription}

NameNode(toks, k) ==
  IF IsName(toks, k) THEN Done(Node("Name", Tk(toks, k).value, <<>>), k + 1) ELSE Fail(k)

\* Description : StringValue  (always optional where it appears)
OptionalDescription(toks, k) ==
  IF IsString(toks, k)
  THEN Done(Node(Tk(toks, k).kind, Tk(toks, k).value, <<>>), k + 1)
  ELSE Done(NoNode, k)

-----------------------------------------------------------------------------
(* §2.10 Input Values and §2.11 Variables *)

\* Variable : $ Name
VariableAt(toks, k) ==
  IF IsPunctuator(toks, k, Dollar) /\ IsName(toks, k + 1)
  THEN Done(Node("Variable", Tk(toks, k + 1).value, <<>>), k + 2)
  ELSE Fail(IF IsPunctuator(toks, k, Dollar) THEN k + 1 ELSE k)

RECURSIVE Value(_, _, _), ListValues(_, _, _, _), ObjectFields(_, _, _, _)

\* Value[Const] :
\*   [~Const] Variable
\*   IntValue | FloatValue | StringValue | BooleanValue | NullValue | EnumValue
\*   ListValue[?Const] | ObjectValue[?Const]
\* BooleanValue : one of `true` `false`;  NullValue : `null`
\* EnumValue : Name but not `true`, `false` or `null`
Value(toks, k, const) ==
  LET t == Tk(toks, k) IN
  CASE IsPunctuator(toks, k, Dollar) -> IF const THEN Fail(k) ELSE VariableAt(toks, k)
    [] t.kind \in {"IntValue", "FloatValue", "StringValue", "BlockString"} ->
         Done(Node(t.kind, t.value, <<>>), k + 1)
    [] IsKeyword(toks, k, KwTrue) \/ IsKeyword(toks, k, KwFalse) ->
         Done(Node("BooleanValue", t.value, <<>>), k + 1)
    [] IsKeyword(toks, k, KwNull) -> Done(Node("NullValue", <<>>, <<>>), k + 1)
    [] IsName(toks, k) -> Done(Node("EnumValue", t.value, <<>>), k + 1)
    [] IsPunctuator(toks, k, LBracket) -> ListValues(toks, k + 1, const, <<>>)
    [] IsPunctuator(toks, k, LBrace) -> ObjectFields(toks, k + 1, const, <<>>)
    [] OTHER -> Fail(k)

\* ListValue[Const] : [ ] | [ Value[?Const]+ ]
ListValues(toks, k, const, items) ==
  IF IsPunctuator(toks, k, RBracket) THEN Done(Items("ListValue", items), k + 1)
  ELSE LET item == Value(toks, k, const) IN
       IF item.ok THEN ListValues(toks, item.next, const, Append(items, item.node)) ELSE item

\* ObjectValue[Const] : { } | { ObjectField[?Const]+ }
\* ObjectField[Const] : Name : Value[?Const]
ObjectFields(toks, k, const, items) ==
  IF IsPunctuator(toks, k, RBrace) THEN Done(Items("ObjectValue", items), k + 1)
  ELSE IF ~(IsName(toks, k) /\ IsPunctuator(toks, k + 1, Colon))
  THEN Fail(IF IsName(toks, k) THEN k + 1 ELSE k)
  ELSE LET value == Value(toks, k + 2, const) IN
       IF value.ok
       THEN ObjectFields(toks, value.next, const,
                         Append(items, Node("ObjectField", Tk(toks, k).value, <<value.node>>)))
       ELSE value

-----------------------------------------------------------------------------
(* §2.7 Arguments and §2.13 Directives *)

\* Argument[Const] : Name : Value[?Const]
ArgumentAt(toks, k, const) ==
  IF ~(IsName(toks, k) /\ IsPunctuator(toks, k + 1, Colon))
  THEN Fail(IF IsName(toks, k) THEN k + 1 ELSE k)
  ELSE LET value == Value(toks, k + 2, const) IN
       IF value.ok THEN Done(Node("Argument", Tk(toks, k).value, <<value.node>>), value.next)
       ELSE value

RECURSIVE ArgumentList(_, _, _, _)
ArgumentList(toks, k, const, items) ==
  IF IsPunctuator(toks, k, RParen) /\ items # <<>> THEN Done(Items("Arguments", items), k + 1)
  ELSE LET argument == ArgumentAt(toks, k, const) IN
       IF argument.ok THEN ArgumentList(toks, argument.next, const, Append(items, argument.node))
       ELSE argument

\* Arguments[Const] : ( Argument[?Const]+ ), where it is optional.
OptionalArguments(toks, k, const) ==
  IF IsPunctuator(toks, k, LParen) THEN ArgumentList(toks, k + 1, const, <<>>)
  ELSE Done(Items("Arguments", <<>>), k)

\* Directives[Const] : Directive[?Const]+, where it is optional.
\* Directive[Const] : @ Name Arguments[?Const]?
RECURSIVE DirectiveList(_, _, _, _)
DirectiveList(toks, k, const, items) ==
  IF ~IsPunctuator(toks, k, At) THEN Done(Items("Directives", items), k)
  ELSE IF ~IsName(toks, k + 1) THEN Fail(k + 1)
  ELSE LET arguments == OptionalArguments(toks, k + 2, const) IN
       IF arguments.ok
       THEN DirectiveList(toks, arguments.next, const,
                          Append(items, Node("Directive", Tk(toks, k + 1).value, <<arguments.node>>)))
       ELSE arguments

OptionalDirectives(toks, k, const) == DirectiveList(toks, k, const, <<>>)

-----------------------------------------------------------------------------
(* §2.12 Type References *)

\* NamedType : Name
NamedType(toks, k) ==
  IF IsName(toks, k) THEN Done(Node("NamedType", Tk(toks, k).value, <<>>), k + 1) ELSE Fail(k)

\* Type : NamedType | ListType | NonNullType
\* ListType : [ Type ]
\* NonNullType : NamedType ! | ListType !
RECURSIVE Type(_, _)
Type(toks, k) ==
  LET nullable ==
        IF IsPunctuator(toks, k, LBracket)
        THEN LET item == Type(toks, k + 1) IN
             CASE ~item.ok -> item
               [] IsPunctuator(toks, item.next, RBracket) ->
                    Done(Node("ListType", <<>>, <<item.node>>), item.next + 1)
               [] OTHER -> Fail(item.next)
        ELSE NamedType(toks, k)
  IN IF nullable.ok /\ IsPunctuator(toks, nullable.next, Bang)
     THEN Done(Node("NonNullType", <<>>, <<nullable.node>>), nullable.next + 1)
     ELSE nullable

\* VariableDefinition : Description? Variable : Type DefaultValue? Directives[Const]?
\* DefaultValue : = Value[Const]
VariableDefinition(toks, k) ==
  LET description == OptionalDescription(toks, k)
      variable == VariableAt(toks, description.next)
      type == IF IsPunctuator(toks, variable.next, Colon) THEN Type(toks, variable.next + 1)
              ELSE Fail(variable.next)
      default == IF IsPunctuator(toks, type.next, Equals) THEN Value(toks, type.next + 1, TRUE)
                 ELSE Done(NoNode, type.next)
      directives == OptionalDirectives(toks, default.next, TRUE)
  IN CASE ~variable.ok -> variable
       [] ~type.ok -> type
       [] ~default.ok -> default
       [] ~directives.ok -> directives
       [] OTHER ->
            Done(Node("VariableDefinition", <<>>,
                      <<description.node, variable.node, type.node, default.node, directives.node>>),
                 directives.next)

RECURSIVE VariableDefinitions(_, _, _)
VariableDefinitions(toks, k, items) ==
  IF IsPunctuator(toks, k, RParen) /\ items # <<>> THEN Done(Items("VariablesDefinition", items), k + 1)
  ELSE LET definition == VariableDefinition(toks, k) IN
       IF definition.ok THEN VariableDefinitions(toks, definition.next, Append(items, definition.node))
       ELSE definition

\* VariablesDefinition : ( VariableDefinition+ ), where it is optional.
OptionalVariablesDefinition(toks, k) ==
  IF IsPunctuator(toks, k, LParen) THEN VariableDefinitions(toks, k + 1, <<>>)
  ELSE Done(Items("VariablesDefinition", <<>>), k)

-----------------------------------------------------------------------------
(* §2.5 Selection Sets, §2.6 Fields, §2.9 Fragments *)

\* FragmentName : Name but not `on`
FragmentName(toks, k) == IF IsKeyword(toks, k, KwOn) THEN Fail(k) ELSE NameNode(toks, k)

\* TypeCondition : on NamedType
TypeCondition(toks, k) == IF IsKeyword(toks, k, KwOn) THEN NamedType(toks, k + 1) ELSE Fail(k)

RECURSIVE SelectionSet(_, _), Selections(_, _, _), Selection(_, _), Field(_, _),
          FragmentSpread(_, _), InlineFragment(_, _)

\* SelectionSet : { Selection* }
\* The draft allows an empty selection set (graphql-spec#1227).
SelectionSet(toks, k) ==
  IF IsPunctuator(toks, k, LBrace) THEN Selections(toks, k + 1, <<>>) ELSE Fail(k)

Selections(toks, k, items) ==
  IF IsPunctuator(toks, k, RBrace) THEN Done(Items("SelectionSet", items), k + 1)
  ELSE LET selection == Selection(toks, k) IN
       IF selection.ok THEN Selections(toks, selection.next, Append(items, selection.node))
       ELSE selection

\* Selection : Field | FragmentSpread | InlineFragment
\* After `...`, a Name other than `on` can only start a FragmentSpread, since
\* FragmentName is "Name but not `on`"; anything else is an InlineFragment.
Selection(toks, k) ==
  CASE ~IsSpread(toks, k) -> Field(toks, k)
    [] IsName(toks, k + 1) /\ ~IsKeyword(toks, k + 1, KwOn) -> FragmentSpread(toks, k)
    [] OTHER -> InlineFragment(toks, k)

\* Field : Alias? Name Arguments? Directives? SelectionSet?
\* Alias : Name :
Field(toks, k) ==
  LET aliased == IsName(toks, k) /\ IsPunctuator(toks, k + 1, Colon)
      alias == IF aliased THEN NameNode(toks, k) ELSE Done(NoNode, k)
      name == NameNode(toks, alias.next + (IF aliased THEN 1 ELSE 0))
      arguments == OptionalArguments(toks, name.next, FALSE)
      directives == OptionalDirectives(toks, arguments.next, FALSE)
      set == IF IsPunctuator(toks, directives.next, LBrace) THEN SelectionSet(toks, directives.next)
             ELSE Done(NoNode, directives.next)
  IN CASE ~name.ok -> name
       [] ~arguments.ok -> arguments
       [] ~directives.ok -> directives
       [] ~set.ok -> set
       [] OTHER ->
            Done(Node("Field", name.node.text, <<alias.node, arguments.node, directives.node, set.node>>),
                 set.next)

\* FragmentSpread : ... FragmentName Directives?
FragmentSpread(toks, k) ==
  LET name == FragmentName(toks, k + 1)
      directives == OptionalDirectives(toks, name.next, FALSE)
  IN CASE ~name.ok -> name
       [] ~directives.ok -> directives
       [] OTHER -> Done(Node("FragmentSpread", name.node.text, <<directives.node>>), directives.next)

\* InlineFragment : ... TypeCondition? Directives? SelectionSet
InlineFragment(toks, k) ==
  LET condition == IF IsKeyword(toks, k + 1, KwOn) THEN TypeCondition(toks, k + 1)
                   ELSE Done(NoNode, k + 1)
      directives == OptionalDirectives(toks, condition.next, FALSE)
      set == SelectionSet(toks, directives.next)
  IN CASE ~condition.ok -> condition
       [] ~directives.ok -> directives
       [] ~set.ok -> set
       [] OTHER ->
            Done(Node("InlineFragment", <<>>, <<condition.node, directives.node, set.node>>), set.next)

-----------------------------------------------------------------------------
(* §2.3 Document, §2.4 Operations, §2.9 Fragments *)

\* OperationDefinition : SelectionSet   (query shorthand)
ShorthandQuery(toks, k) ==
  LET set == SelectionSet(toks, k) IN
  IF ~set.ok THEN set
  ELSE Done(Node("OperationDefinition", KwQuery,
                 <<NoNode, NoNode, Items("VariablesDefinition", <<>>), Items("Directives", <<>>), set.node>>),
            set.next)

\* OperationDefinition :
\*   Description? OperationType Name? VariablesDefinition? Directives? SelectionSet
OperationDefinition(toks, k) ==
  LET description == OptionalDescription(toks, k)
      type == description.next
      name == IF IsName(toks, type + 1) THEN NameNode(toks, type + 1) ELSE Done(NoNode, type + 1)
      variables == OptionalVariablesDefinition(toks, name.next)
      directives == OptionalDirectives(toks, variables.next, FALSE)
      set == SelectionSet(toks, directives.next)
  IN CASE ~variables.ok -> variables
       [] ~directives.ok -> directives
       [] ~set.ok -> set
       [] OTHER ->
            Done(Node("OperationDefinition", Tk(toks, type).value,
                      <<description.node, name.node, variables.node, directives.node, set.node>>),
                 set.next)

\* FragmentDefinition :
\*   Description? fragment FragmentName TypeCondition Directives? SelectionSet
FragmentDefinition(toks, k) ==
  LET description == OptionalDescription(toks, k)
      name == FragmentName(toks, description.next + 1)
      condition == TypeCondition(toks, name.next)
      directives == OptionalDirectives(toks, condition.next, FALSE)
      set == SelectionSet(toks, directives.next)
  IN CASE ~name.ok -> name
       [] ~condition.ok -> condition
       [] ~directives.ok -> directives
       [] ~set.ok -> set
       [] OTHER ->
            Done(Node("FragmentDefinition", name.node.text,
                      <<description.node, condition.node, directives.node, set.node>>),
                 set.next)

\* ExecutableDefinition : OperationDefinition | FragmentDefinition
\* A Description is followed by the definition's keyword. "Descriptions are
\* not permitted on query shorthand."
ExecutableDefinition(toks, k) ==
  LET keyword == IF IsString(toks, k) THEN k + 1 ELSE k IN
  CASE IsPunctuator(toks, k, LBrace) -> ShorthandQuery(toks, k)
    [] IsName(toks, keyword) /\ Tk(toks, keyword).value \in OperationTypes -> OperationDefinition(toks, k)
    [] IsKeyword(toks, keyword, KwFragment) -> FragmentDefinition(toks, k)
    [] OTHER -> Fail(keyword)

RECURSIVE Definitions(_, _, _)
Definitions(toks, k, items) ==
  IF k > Len(toks) THEN Done(Items("Document", items), k)
  ELSE LET definition == ExecutableDefinition(toks, k) IN
       IF definition.ok THEN Definitions(toks, definition.next, Append(items, definition.node))
       ELSE definition

\* ExecutableDocument : ExecutableDefinition+
ExecutableDocument(toks) == IF toks = <<>> THEN Fail(1) ELSE Definitions(toks, 1, <<>>)

\* The parse tree of a source text, or [ok |-> FALSE, node |-> NoNode] for a
\* lexical or syntax error.
ParseExecutable(src) ==
  LET lexed == Lex(src) IN
  IF ~lexed.ok THEN [ok |-> FALSE, node |-> NoNode]
  ELSE LET parsed == ExecutableDocument(lexed.tokens) IN
       [ok |-> parsed.ok, node |-> parsed.node]

-----------------------------------------------------------------------------
(* Hand-written vectors, checked by Parser.cfg *)

Doc(definitions) == Items("Document", definitions)
Sel(selections) == Items("SelectionSet", selections)
NoArguments == Items("Arguments", <<>>)
NoDirectives == Items("Directives", <<>>)
NoVariables == Items("VariablesDefinition", <<>>)
Leaf(name) == Node("Field", Text(name), <<NoNode, NoArguments, NoDirectives, NoNode>>)
Query(selections) == Node("OperationDefinition", KwQuery, <<NoNode, NoNode, NoVariables, NoDirectives, Sel(selections)>>)
Named(name) == Node("NamedType", Text(name), <<>>)

\* A vector that parses. When tree is NoNode, only success is compared.
Parses(source, tree) == [source |-> Text(source), ok |-> TRUE, tree |-> tree]
Rejects(source) == [source |-> Text(source), ok |-> FALSE, tree |-> NoNode]

ParserPasses(v) ==
  LET parsed == ParseExecutable(v.source) IN
  parsed.ok = v.ok /\ (v.tree # NoNode => parsed.node = v.tree)

DocumentVectors == <<
  Rejects(""),
  Rejects("  # only a comment"),
  Parses("{a}", Doc(<<Query(<<Leaf("a")>>)>>)),
  Parses("query {a}", Doc(<<Query(<<Leaf("a")>>)>>)),
  Parses("query Q {a} mutation M {b} subscription S {c}", NoNode),
  Parses("{a} {b}", NoNode),
  Parses("query on {a} query query {a} fragment fragment on query {a}", NoNode),
  Parses("\"d\" query {a}",
         Doc(<<Node("OperationDefinition", KwQuery,
                    <<Node("StringValue", Text("d"), <<>>), NoNode, NoVariables, NoDirectives,
                      Sel(<<Leaf("a")>>)>>)>>)),
  Parses("\"\"\"\n  d\n\"\"\" fragment F on T {a}",
         Doc(<<Node("FragmentDefinition", Text("F"),
                    <<Node("BlockString", Text("d"), <<>>), Named("T"), NoDirectives,
                      Sel(<<Leaf("a")>>)>>)>>)),
  \* "Descriptions are not permitted on query shorthand."
  Rejects("\"d\" {a}"),
  Rejects("\"d\""),
  Rejects("\"d\" \"e\" query {a}"),
  Rejects("query"),
  Rejects("query Q"),
  Rejects("Query {a}"),
  Rejects("{a} query"),
  \* Type system definitions are not an ExecutableDefinition.
  Rejects("type T { a: Int }"),
  Rejects("extend type T { a: Int }"),
  Rejects("\"d\" type T { a: Int }"),
  Rejects("{a} 1")
>>

SelectionVectors == <<
  \* SelectionSet : { Selection* }  (graphql-spec#1227)
  Parses("{}", Doc(<<Query(<<>>)>>)),
  Parses("{a {}}", NoNode),
  Parses("query Q {}", NoNode),
  Parses("{b: a}", Doc(<<Query(<<Node("Field", Text("a"),
                                       <<Node("Name", Text("b"), <<>>), NoArguments, NoDirectives, NoNode>>)>>)>>)),
  Rejects("{a: b: c}"),
  Rejects("{a:}"),
  Parses("{a(x: 1) @d @e(y: 2) {b}}", NoNode),
  Rejects("{a()}"),
  Rejects("{a(x)}"),
  Rejects("{a(x:)}"),
  Rejects("{a @}"),
  Rejects("{a @d()}"),
  Parses("{...F @d}", Doc(<<Query(<<Node("FragmentSpread", Text("F"),
                                         <<Items("Directives", <<Node("Directive", Text("d"), <<NoArguments>>)>>)>>)>>)>>)),
  Parses("{... on T {a}}", Doc(<<Query(<<Node("InlineFragment", <<>>,
                                              <<Named("T"), NoDirectives, Sel(<<Leaf("a")>>)>>)>>)>>)),
  Parses("{... @d {a}}", NoNode),
  Parses("{... {a}}", Doc(<<Query(<<Node("InlineFragment", <<>>, <<NoNode, NoDirectives, Sel(<<Leaf("a")>>)>>)>>)>>)),
  \* FragmentName : Name but not `on`, so `... on` starts a TypeCondition.
  Parses("{... on on {a}}", NoNode),
  Rejects("{...on}"),
  Rejects("{... on {a}}"),
  Rejects("{... on @d {a}}"),
  Rejects("{...F {a}}"),
  Parses("fragment F on T @d {a}", NoNode),
  Parses("fragment F on on {a}", NoNode),
  Rejects("fragment on on T {a}"),
  Rejects("fragment F T {a}"),
  Rejects("fragment F on T"),
  Rejects("fragment F on T @d"),
  Rejects("fragment F($a: Int) on T {a}"),
  Rejects("{a"),
  Rejects("{a}}"),
  Rejects("{(a)}"),
  Parses("{__typename a {b {c}}}", NoNode)
>>

ValueVectors == <<
  Parses("{a(x: true, y: null, z: TRUE, w: false)}",
         Doc(<<Query(<<Node("Field", Text("a"),
                           <<NoNode,
                             Items("Arguments",
                                   <<Node("Argument", Text("x"), <<Node("BooleanValue", Text("true"), <<>>)>>),
                                     Node("Argument", Text("y"), <<Node("NullValue", <<>>, <<>>)>>),
                                     Node("Argument", Text("z"), <<Node("EnumValue", Text("TRUE"), <<>>)>>),
                                     Node("Argument", Text("w"), <<Node("BooleanValue", Text("false"), <<>>)>>)>>),
                             NoDirectives, NoNode>>)>>)>>)),
  Parses("{a(x: [1, -2.5e3, \"s\", \"\"\"b\"\"\", E, [], {}, {k: $v, l: [$w]}])}", NoNode),
  Parses("{a(x: [1 [2]], y: {k: {l: 1}})}",
         Doc(<<Query(<<Node("Field", Text("a"),
                           <<NoNode,
                             Items("Arguments",
                                   <<Node("Argument", Text("x"),
                                          <<Items("ListValue", <<Node("IntValue", Text("1"), <<>>),
                                                                 Items("ListValue", <<Node("IntValue", Text("2"), <<>>)>>)>>)>>),
                                     Node("Argument", Text("y"),
                                          <<Items("ObjectValue",
                                                  <<Node("ObjectField", Text("k"),
                                                         <<Items("ObjectValue",
                                                                 <<Node("ObjectField", Text("l"),
                                                                        <<Node("IntValue", Text("1"), <<>>)>>)>>)>>)>>)>>)>>),
                             NoDirectives, NoNode>>)>>)>>)),
  Parses("{a(x: 1 y: 2) b(x: [1,,2,])}", NoNode),
  Parses("{a(x: {k: 1, k: 2}, x: 3)}", NoNode),
  Parses("query @d(x: $v) {a}", NoNode),
  Rejects("{a(x: [)}"),
  Rejects("{a(x: [1)}"),
  Rejects("{a(x: {k})}"),
  Rejects("{a(x: {k: })}"),
  Rejects("{a(x: {1: 2})}"),
  Rejects("{a(x: $)}"),
  Rejects("{a(x: $1)}"),
  Rejects("{a(x: -)}"),
  Rejects("{a(x: ...)}")
>>

VariableVectors == <<
  Parses("query ($a: Int, $b: [Int!]! = [1]) {a}",
         Doc(<<Node("OperationDefinition", KwQuery,
                    <<NoNode, NoNode,
                      Items("VariablesDefinition",
                            <<Node("VariableDefinition", <<>>,
                                   <<NoNode, Node("Variable", Text("a"), <<>>), Named("Int"), NoNode, NoDirectives>>),
                              Node("VariableDefinition", <<>>,
                                   <<NoNode, Node("Variable", Text("b"), <<>>),
                                     Node("NonNullType", <<>>,
                                          <<Node("ListType", <<>>, <<Node("NonNullType", <<>>, <<Named("Int")>>)>>)>>),
                                     Items("ListValue", <<Node("IntValue", Text("1"), <<>>)>>),
                                     NoDirectives>>)>>),
                      NoDirectives, Sel(<<Leaf("a")>>)>>)>>)),
  Parses("query Q($a: Int = 1 @d(x: 2) $b: String) @e {a}", NoNode),
  Parses("query (\"d\" $a: Int \"\"\"e\"\"\" $b: Int) {a}", NoNode),
  Parses("query ($a: Int = {k: [1, E, null]}) {a}", NoNode),
  Parses("query ($ a: [[T]]) {a}", NoNode),
  \* DefaultValue : = Value[Const], and Directives[Const]
  Rejects("query ($a: Int = $b) {a}"),
  Rejects("query ($a: [Int] = [$b]) {a}"),
  Rejects("query ($a: Int = {k: $b}) {a}"),
  Rejects("query ($a: Int @d(x: $b)) {a}"),
  Rejects("query () {a}"),
  Rejects("query ($a) {a}"),
  Rejects("query ($a: ) {a}"),
  Rejects("query ($a: Int!!) {a}"),
  Rejects("query ($a: [Int) {a}"),
  Rejects("query ($a: []) {a}"),
  Rejects("query ($a: Int =) {a}"),
  Rejects("query (a: Int) {a}"),
  Rejects("{($a: Int) a}"),
  Rejects("query ($a: Int) @d")
>>

ParserVectors == [Documents |-> DocumentVectors, Selections |-> SelectionVectors,
                  Values |-> ValueVectors, Variables |-> VariableVectors]

\* Each initial state is one vector, as in Lexer.tla.
ParserInit ==
  vector \in UNION {{[group |-> g, n |-> n] : n \in DOMAIN ParserVectors[g]} : g \in DOMAIN ParserVectors}

ParserVectorPasses(group) == vector.group = group => ParserPasses(ParserVectors[group][vector.n])

DocumentsParse == ParserVectorPasses("Documents")
SelectionsParse == ParserVectorPasses("Selections")
ValuesParse == ParserVectorPasses("Values")
VariablesParse == ParserVectorPasses("Variables")

=============================================================================
