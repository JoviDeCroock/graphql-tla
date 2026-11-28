---- MODULE Parser ----
(***************************************************************************)
(* The syntactic grammar of documents, written by hand from the           *)
(* September 2026 edition of the spec                                      *)
(* (https://spec.graphql.org/September2026/, §2.3 to §2.13, and the type  *)
(* system definition language of §3): a recursive-descent reading over    *)
(* the tokens of Lexer.tla.                                                *)
(*                                                                         *)
(* "The lexical token sequence, omitting Ignored, must be described by a   *)
(* single Document syntactic grammar." ParseExecutable reads a source as   *)
(* an ExecutableDocument, and rejects type system definitions.             *)
(* ParseDocument(src, grammar), further down, reads it as any of the four  *)
(* document grammars: ExecutableDocument, TypeSystemDocument,              *)
(* TypeSystemExtensionDocument or Document.                                *)
(*                                                                         *)
(* Both read the September 2026 grammar. ParseExecutableWith and           *)
(* ParseDocumentWith also take a set of proposals, grammar that no release *)
(* has yet (see Proposals below): fragment arguments, graphql-spec#1081.   *)
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
(*     FragmentDefinition   text: the name; <<Description,                 *)
(*                            VariablesDefinition, NamedType, Directives,  *)
(*                            SelectionSet>>                               *)
(*     SelectionSet         selections                                     *)
(*     Field                text: the name; <<alias Name, Arguments,       *)
(*                            Directives, SelectionSet>>                   *)
(*     FragmentSpread       text: the name; <<Arguments, Directives>>      *)
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
(* Proposals *)

\* Grammar that isn't in the September 2026 edition, which the productions
\* below read only when its name is in `proposals`. With none, they read
\* September 2026 exactly.
\*
\*   "fragmentArguments"  graphql-spec#1081 (at dfd847524d25), §2.9:
\*       FragmentSpread : ... FragmentName Arguments? Directives?
\*       FragmentDefinition : Description? fragment FragmentName
\*         VariablesDefinition? TypeCondition Directives? SelectionSet
\*     where September 2026 has neither Arguments? nor
\*     VariablesDefinition?. Both lists are in the tree either way, and
\*     empty without the proposal.
FragmentArguments == "fragmentArguments"
Proposals == {FragmentArguments}
September2026 == {}

-----------------------------------------------------------------------------
(* §2.5 Selection Sets, §2.6 Fields, §2.9 Fragments *)

\* FragmentName : Name but not `on`
FragmentName(toks, k) == IF IsKeyword(toks, k, KwOn) THEN Fail(k) ELSE NameNode(toks, k)

\* TypeCondition : on NamedType
TypeCondition(toks, k) == IF IsKeyword(toks, k, KwOn) THEN NamedType(toks, k + 1) ELSE Fail(k)

RECURSIVE SelectionSet(_, _, _), Selections(_, _, _, _), Selection(_, _, _), Field(_, _, _),
          FragmentSpread(_, _, _), InlineFragment(_, _, _)

\* SelectionSet : { Selection* }
\* An empty selection set is new in September 2026 (graphql-spec#1227);
\* October 2021 and September 2025 have { Selection+ }.
SelectionSet(toks, k, proposals) ==
  IF IsPunctuator(toks, k, LBrace) THEN Selections(toks, k + 1, proposals, <<>>) ELSE Fail(k)

Selections(toks, k, proposals, items) ==
  IF IsPunctuator(toks, k, RBrace) THEN Done(Items("SelectionSet", items), k + 1)
  ELSE LET selection == Selection(toks, k, proposals) IN
       IF selection.ok THEN Selections(toks, selection.next, proposals, Append(items, selection.node))
       ELSE selection

\* Selection : Field | FragmentSpread | InlineFragment
\* After `...`, a Name other than `on` can only start a FragmentSpread, since
\* FragmentName is "Name but not `on`"; anything else is an InlineFragment.
Selection(toks, k, proposals) ==
  CASE ~IsSpread(toks, k) -> Field(toks, k, proposals)
    [] IsName(toks, k + 1) /\ ~IsKeyword(toks, k + 1, KwOn) -> FragmentSpread(toks, k, proposals)
    [] OTHER -> InlineFragment(toks, k, proposals)

\* Field : Alias? Name Arguments? Directives? SelectionSet?
\* Alias : Name :
Field(toks, k, proposals) ==
  LET aliased == IsName(toks, k) /\ IsPunctuator(toks, k + 1, Colon)
      alias == IF aliased THEN NameNode(toks, k) ELSE Done(NoNode, k)
      name == NameNode(toks, alias.next + (IF aliased THEN 1 ELSE 0))
      arguments == OptionalArguments(toks, name.next, FALSE)
      directives == OptionalDirectives(toks, arguments.next, FALSE)
      set == IF IsPunctuator(toks, directives.next, LBrace) THEN SelectionSet(toks, directives.next, proposals)
             ELSE Done(NoNode, directives.next)
  IN CASE ~name.ok -> name
       [] ~arguments.ok -> arguments
       [] ~directives.ok -> directives
       [] ~set.ok -> set
       [] OTHER ->
            Done(Node("Field", name.node.text, <<alias.node, arguments.node, directives.node, set.node>>),
                 set.next)

\* FragmentSpread : ... FragmentName Directives?
\* With fragment arguments: ... FragmentName Arguments? Directives?
\* The arguments aren't [Const]: a spread's argument may be a variable.
\* Without the proposal, a ( after the name is left where it is, and no
\* production takes it.
FragmentSpread(toks, k, proposals) ==
  LET name == FragmentName(toks, k + 1)
      arguments == IF FragmentArguments \in proposals THEN OptionalArguments(toks, name.next, FALSE)
                   ELSE Done(Items("Arguments", <<>>), name.next)
      directives == OptionalDirectives(toks, arguments.next, FALSE)
  IN CASE ~name.ok -> name
       [] ~arguments.ok -> arguments
       [] ~directives.ok -> directives
       [] OTHER ->
            Done(Node("FragmentSpread", name.node.text, <<arguments.node, directives.node>>), directives.next)

\* InlineFragment : ... TypeCondition? Directives? SelectionSet
InlineFragment(toks, k, proposals) ==
  LET condition == IF IsKeyword(toks, k + 1, KwOn) THEN TypeCondition(toks, k + 1)
                   ELSE Done(NoNode, k + 1)
      directives == OptionalDirectives(toks, condition.next, FALSE)
      set == SelectionSet(toks, directives.next, proposals)
  IN CASE ~condition.ok -> condition
       [] ~directives.ok -> directives
       [] ~set.ok -> set
       [] OTHER ->
            Done(Node("InlineFragment", <<>>, <<condition.node, directives.node, set.node>>), set.next)

-----------------------------------------------------------------------------
(* §2.3 Document, §2.4 Operations, §2.9 Fragments *)

\* OperationDefinition : SelectionSet   (query shorthand)
ShorthandQuery(toks, k, proposals) ==
  LET set == SelectionSet(toks, k, proposals) IN
  IF ~set.ok THEN set
  ELSE Done(Node("OperationDefinition", KwQuery,
                 <<NoNode, NoNode, Items("VariablesDefinition", <<>>), Items("Directives", <<>>), set.node>>),
            set.next)

\* OperationDefinition :
\*   Description? OperationType Name? VariablesDefinition? Directives? SelectionSet
OperationDefinition(toks, k, proposals) ==
  LET description == OptionalDescription(toks, k)
      type == description.next
      name == IF IsName(toks, type + 1) THEN NameNode(toks, type + 1) ELSE Done(NoNode, type + 1)
      variables == OptionalVariablesDefinition(toks, name.next)
      directives == OptionalDirectives(toks, variables.next, FALSE)
      set == SelectionSet(toks, directives.next, proposals)
  IN CASE ~variables.ok -> variables
       [] ~directives.ok -> directives
       [] ~set.ok -> set
       [] OTHER ->
            Done(Node("OperationDefinition", Tk(toks, type).value,
                      <<description.node, name.node, variables.node, directives.node, set.node>>),
                 set.next)

\* FragmentDefinition :
\*   Description? fragment FragmentName TypeCondition Directives? SelectionSet
\* With fragment arguments:
\*   Description? fragment FragmentName VariablesDefinition? TypeCondition
\*     Directives? SelectionSet
\* Without the proposal, a ( after the name isn't `on`, so TypeCondition
\* fails there.
FragmentDefinition(toks, k, proposals) ==
  LET description == OptionalDescription(toks, k)
      name == FragmentName(toks, description.next + 1)
      variables == IF FragmentArguments \in proposals THEN OptionalVariablesDefinition(toks, name.next)
                   ELSE Done(Items("VariablesDefinition", <<>>), name.next)
      condition == TypeCondition(toks, variables.next)
      directives == OptionalDirectives(toks, condition.next, FALSE)
      set == SelectionSet(toks, directives.next, proposals)
  IN CASE ~name.ok -> name
       [] ~variables.ok -> variables
       [] ~condition.ok -> condition
       [] ~directives.ok -> directives
       [] ~set.ok -> set
       [] OTHER ->
            Done(Node("FragmentDefinition", name.node.text,
                      <<description.node, variables.node, condition.node, directives.node, set.node>>),
                 set.next)

\* ExecutableDefinition : OperationDefinition | FragmentDefinition
\* A Description is followed by the definition's keyword. "Descriptions are
\* not permitted on query shorthand."
ExecutableDefinition(toks, k, proposals) ==
  LET keyword == IF IsString(toks, k) THEN k + 1 ELSE k IN
  CASE IsPunctuator(toks, k, LBrace) -> ShorthandQuery(toks, k, proposals)
    [] IsName(toks, keyword) /\ Tk(toks, keyword).value \in OperationTypes -> OperationDefinition(toks, k, proposals)
    [] IsKeyword(toks, keyword, KwFragment) -> FragmentDefinition(toks, k, proposals)
    [] OTHER -> Fail(keyword)

RECURSIVE Definitions(_, _, _, _)
Definitions(toks, k, proposals, items) ==
  IF k > Len(toks) THEN Done(Items("Document", items), k)
  ELSE LET definition == ExecutableDefinition(toks, k, proposals) IN
       IF definition.ok THEN Definitions(toks, definition.next, proposals, Append(items, definition.node))
       ELSE definition

\* ExecutableDocument : ExecutableDefinition+
ExecutableDocument(toks, proposals) == IF toks = <<>> THEN Fail(1) ELSE Definitions(toks, 1, proposals, <<>>)

\* The parse tree of a source text read with the given proposals, or
\* [ok |-> FALSE, node |-> NoNode] for a lexical or syntax error.
ParseExecutableWith(src, proposals) ==
  LET lexed == Lex(src) IN
  IF ~lexed.ok THEN [ok |-> FALSE, node |-> NoNode]
  ELSE LET parsed == ExecutableDocument(lexed.tokens, proposals) IN
       [ok |-> parsed.ok, node |-> parsed.node]

\* The same for the September 2026 edition, with no proposal.
ParseExecutable(src) == ParseExecutableWith(src, September2026)

-----------------------------------------------------------------------------
(* §3 Type System: the type system definition language, written by hand   *)
(* from Section 3 of the September 2026 edition (its productions match     *)
(* Appendix C). Every Directives and Value in it is [Const].               *)
(*                                                                         *)
(* Nodes, in the same shape as above. A list that is absent is its kind    *)
(* with no items: where the grammar has one, it is never empty.            *)
(*   SchemaDefinition, SchemaExtension   <<Description, Directives,        *)
(*                          RootOperationTypes>>                           *)
(*   RootOperationTypeDefinition  text: the operation type; <<NamedType>>  *)
(*   ScalarTypeDefinition, ScalarTypeExtension  text: the name;            *)
(*                          <<Description, Directives>>                    *)
(*   ObjectTypeDefinition, InterfaceTypeDefinition and their extensions    *)
(*                          text: the name; <<Description,                 *)
(*                          ImplementsInterfaces, Directives,              *)
(*                          FieldsDefinition>>                             *)
(*   FieldDefinition        text: the name; <<Description,                 *)
(*                          ArgumentsDefinition, Type, Directives>>        *)
(*   InputValueDefinition   text: the name; <<Description, Type, default   *)
(*                          value, Directives>>                            *)
(*   UnionTypeDefinition, UnionTypeExtension  text: the name;              *)
(*                          <<Description, Directives, UnionMemberTypes>>  *)
(*   EnumTypeDefinition, EnumTypeExtension  text: the name; <<Description, *)
(*                          Directives, EnumValuesDefinition>>             *)
(*   EnumValueDefinition    text: the value; <<Description, Directives>>   *)
(*   InputObjectTypeDefinition, InputObjectTypeExtension  text: the name;  *)
(*                          <<Description, Directives,                     *)
(*                          InputFieldsDefinition>>                        *)
(*   DirectiveDefinition    text: the name; <<Description,                 *)
(*                          ArgumentsDefinition, Directives, Repeatable,   *)
(*                          DirectiveLocations>>; Repeatable's text is     *)
(*                          `repeatable` or <<>>                           *)
(*   DirectiveExtension     text: the name; <<Description, Directives>>    *)
(*   DirectiveLocations     its locations, as Name nodes                   *)
(* An extension's Description is always NoNode: extensions take none.      *)
(***************************************************************************)

Amp == 38
Pipe == 124

KwSchema == <<115, 99, 104, 101, 109, 97>>
KwScalar == <<115, 99, 97, 108, 97, 114>>
KwType == <<116, 121, 112, 101>>
KwInterface == <<105, 110, 116, 101, 114, 102, 97, 99, 101>>
KwUnion == <<117, 110, 105, 111, 110>>
KwEnum == <<101, 110, 117, 109>>
KwInput == <<105, 110, 112, 117, 116>>
KwDirective == <<100, 105, 114, 101, 99, 116, 105, 118, 101>>
KwExtend == <<101, 120, 116, 101, 110, 100>>
KwImplements == <<105, 109, 112, 108, 101, 109, 101, 110, 116, 115>>
KwRepeatable == <<114, 101, 112, 101, 97, 116, 97, 98, 108, 101>>

\* DirectiveLocation : ExecutableDirectiveLocation | TypeSystemDirectiveLocation
\* ExecutableDirectiveLocation : one of QUERY MUTATION SUBSCRIPTION FIELD
\*   FRAGMENT_DEFINITION FRAGMENT_SPREAD INLINE_FRAGMENT VARIABLE_DEFINITION
\* TypeSystemDirectiveLocation : one of SCHEMA SCALAR OBJECT FIELD_DEFINITION
\*   ARGUMENT_DEFINITION INTERFACE UNION ENUM ENUM_VALUE INPUT_OBJECT
\*   INPUT_FIELD_DEFINITION DIRECTIVE_DEFINITION
\* DIRECTIVE_DEFINITION is new in September 2026.
ExecutableDirectiveLocations ==
  {Text("QUERY"), Text("MUTATION"), Text("SUBSCRIPTION"), Text("FIELD"), Text("FRAGMENT_DEFINITION"),
   Text("FRAGMENT_SPREAD"), Text("INLINE_FRAGMENT"), Text("VARIABLE_DEFINITION")}
TypeSystemDirectiveLocations ==
  {Text("SCHEMA"), Text("SCALAR"), Text("OBJECT"), Text("FIELD_DEFINITION"), Text("ARGUMENT_DEFINITION"),
   Text("INTERFACE"), Text("UNION"), Text("ENUM"), Text("ENUM_VALUE"), Text("INPUT_OBJECT"),
   Text("INPUT_FIELD_DEFINITION"), Text("DIRECTIVE_DEFINITION")}
DirectiveLocationNames == ExecutableDirectiveLocations \cup TypeSystemDirectiveLocations

NoItems(kind) == Items(kind, <<>>)

\* RootOperationTypeDefinition : OperationType : NamedType
RootOperationTypeDefinition(toks, k) ==
  IF ~(IsName(toks, k) /\ Tk(toks, k).value \in OperationTypes) THEN Fail(k)
  ELSE IF ~IsPunctuator(toks, k + 1, Colon) THEN Fail(k + 1)
  ELSE LET type == NamedType(toks, k + 2) IN
       IF type.ok THEN Done(Node("RootOperationTypeDefinition", Tk(toks, k).value, <<type.node>>), type.next)
       ELSE type

\* { RootOperationTypeDefinition+ }, from the token after the {.
RECURSIVE RootOperationTypes(_, _, _)
RootOperationTypes(toks, k, items) ==
  IF IsPunctuator(toks, k, RBrace) /\ items # <<>> THEN Done(Items("RootOperationTypes", items), k + 1)
  ELSE LET root == RootOperationTypeDefinition(toks, k) IN
       IF root.ok THEN RootOperationTypes(toks, root.next, Append(items, root.node)) ELSE root

\* InputValueDefinition : Description? Name : Type DefaultValue? Directives[Const]?
InputValueDefinition(toks, k) ==
  LET description == OptionalDescription(toks, k)
      name == NameNode(toks, description.next)
      type == IF IsPunctuator(toks, name.next, Colon) THEN Type(toks, name.next + 1) ELSE Fail(name.next)
      default == IF IsPunctuator(toks, type.next, Equals) THEN Value(toks, type.next + 1, TRUE)
                 ELSE Done(NoNode, type.next)
      directives == OptionalDirectives(toks, default.next, TRUE)
  IN CASE ~name.ok -> name
       [] ~type.ok -> type
       [] ~default.ok -> default
       [] ~directives.ok -> directives
       [] OTHER ->
            Done(Node("InputValueDefinition", name.node.text,
                      <<description.node, type.node, default.node, directives.node>>),
                 directives.next)

\* ArgumentsDefinition : ( InputValueDefinition+ )
\* InputFieldsDefinition : { InputValueDefinition+ }
\* From the token after the opening punctuator; close is the closing one.
RECURSIVE InputValueDefinitions(_, _, _, _, _)
InputValueDefinitions(toks, k, kind, close, items) ==
  IF IsPunctuator(toks, k, close) /\ items # <<>> THEN Done(Items(kind, items), k + 1)
  ELSE LET definition == InputValueDefinition(toks, k) IN
       IF definition.ok
       THEN InputValueDefinitions(toks, definition.next, kind, close, Append(items, definition.node))
       ELSE definition

OptionalArgumentsDefinition(toks, k) ==
  IF IsPunctuator(toks, k, LParen) THEN InputValueDefinitions(toks, k + 1, "ArgumentsDefinition", RParen, <<>>)
  ELSE Done(NoItems("ArgumentsDefinition"), k)

\* FieldDefinition : Description? Name ArgumentsDefinition? : Type Directives[Const]?
FieldDefinition(toks, k) ==
  LET description == OptionalDescription(toks, k)
      name == NameNode(toks, description.next)
      arguments == OptionalArgumentsDefinition(toks, name.next)
      type == IF IsPunctuator(toks, arguments.next, Colon) THEN Type(toks, arguments.next + 1)
              ELSE Fail(arguments.next)
      directives == OptionalDirectives(toks, type.next, TRUE)
  IN CASE ~name.ok -> name
       [] ~arguments.ok -> arguments
       [] ~type.ok -> type
       [] ~directives.ok -> directives
       [] OTHER ->
            Done(Node("FieldDefinition", name.node.text,
                      <<description.node, arguments.node, type.node, directives.node>>),
                 directives.next)

\* FieldsDefinition : { FieldDefinition+ }, from the token after the {.
RECURSIVE FieldDefinitions(_, _, _)
FieldDefinitions(toks, k, items) ==
  IF IsPunctuator(toks, k, RBrace) /\ items # <<>> THEN Done(Items("FieldsDefinition", items), k + 1)
  ELSE LET field == FieldDefinition(toks, k) IN
       IF field.ok THEN FieldDefinitions(toks, field.next, Append(items, field.node)) ELSE field

\* EnumValueDefinition : Description? EnumValue Directives[Const]?
\* EnumValue : Name but not `true`, `false` or `null`
EnumValueDefinition(toks, k) ==
  LET description == OptionalDescription(toks, k)
      at == description.next
      directives == OptionalDirectives(toks, at + 1, TRUE)
  IN CASE ~IsName(toks, at) \/ Tk(toks, at).value \in {KwTrue, KwFalse, KwNull} -> Fail(at)
       [] ~directives.ok -> directives
       [] OTHER ->
            Done(Node("EnumValueDefinition", Tk(toks, at).value, <<description.node, directives.node>>),
                 directives.next)

\* EnumValuesDefinition : { EnumValueDefinition+ }, from the token after the {.
RECURSIVE EnumValueDefinitions(_, _, _)
EnumValueDefinitions(toks, k, items) ==
  IF IsPunctuator(toks, k, RBrace) /\ items # <<>> THEN Done(Items("EnumValuesDefinition", items), k + 1)
  ELSE LET value == EnumValueDefinition(toks, k) IN
       IF value.ok THEN EnumValueDefinitions(toks, value.next, Append(items, value.node)) ELSE value

\* The rest of a list of NamedType after its first, each after the
\* punctuator sep: & in ImplementsInterfaces, | in UnionMemberTypes.
RECURSIVE NamedTypeList(_, _, _, _, _)
NamedTypeList(toks, k, kind, sep, items) ==
  IF ~IsPunctuator(toks, k, sep) THEN Done(Items(kind, items), k)
  ELSE LET type == NamedType(toks, k + 1) IN
       IF type.ok THEN NamedTypeList(toks, type.next, kind, sep, Append(items, type.node)) ELSE type

\* ImplementsInterfaces :
\*   ImplementsInterfaces & NamedType
\*   implements `&`? NamedType
OptionalImplementsInterfaces(toks, k) ==
  IF ~IsKeyword(toks, k, KwImplements) THEN Done(NoItems("ImplementsInterfaces"), k)
  ELSE LET first == IF IsPunctuator(toks, k + 1, Amp) THEN k + 2 ELSE k + 1
           type == NamedType(toks, first)
       IN IF type.ok THEN NamedTypeList(toks, type.next, "ImplementsInterfaces", Amp, <<type.node>>) ELSE type

\* UnionMemberTypes :
\*   UnionMemberTypes | NamedType
\*   = `|`? NamedType
OptionalUnionMemberTypes(toks, k) ==
  IF ~IsPunctuator(toks, k, Equals) THEN Done(NoItems("UnionMemberTypes"), k)
  ELSE LET first == IF IsPunctuator(toks, k + 1, Pipe) THEN k + 2 ELSE k + 1
           type == NamedType(toks, first)
       IN IF type.ok THEN NamedTypeList(toks, type.next, "UnionMemberTypes", Pipe, <<type.node>>) ELSE type

\* DirectiveLocations :
\*   DirectiveLocations | DirectiveLocation
\*   `|`? DirectiveLocation
RECURSIVE LocationList(_, _, _)
LocationList(toks, k, items) ==
  IF IsName(toks, k) /\ Tk(toks, k).value \in DirectiveLocationNames
  THEN LET located == Append(items, Node("Name", Tk(toks, k).value, <<>>)) IN
       IF IsPunctuator(toks, k + 1, Pipe) THEN LocationList(toks, k + 2, located)
       ELSE Done(Items("DirectiveLocations", located), k + 1)
  ELSE Fail(k)

DirectiveLocations(toks, k) == LocationList(toks, IF IsPunctuator(toks, k, Pipe) THEN k + 1 ELSE k, <<>>)

\* A body in braces where the production allows one: if a { follows, it is
\* the body, since the alternatives without one have [lookahead != {].
\* Otherwise the body is absent: its kind with no items.
OptionalFields(toks, k) ==
  IF IsPunctuator(toks, k, LBrace) THEN FieldDefinitions(toks, k + 1, <<>>)
  ELSE Done(NoItems("FieldsDefinition"), k)
OptionalEnumValues(toks, k) ==
  IF IsPunctuator(toks, k, LBrace) THEN EnumValueDefinitions(toks, k + 1, <<>>)
  ELSE Done(NoItems("EnumValuesDefinition"), k)
OptionalInputFields(toks, k) ==
  IF IsPunctuator(toks, k, LBrace) THEN InputValueDefinitions(toks, k + 1, "InputFieldsDefinition", RBrace, <<>>)
  ELSE Done(NoItems("InputFieldsDefinition"), k)

\* The bodies below start at the token after their keyword (schema,
\* scalar, ...), and take the node to build, the Description before the
\* keyword, and whether it is an extension.

\* SchemaDefinition : Description? schema Directives[Const]? { RootOperationTypeDefinition+ }
\* SchemaExtension :
\*   extend schema Directives[Const]? { RootOperationTypeDefinition+ }
\*   extend schema Directives[Const] [lookahead != {]
SchemaBody(toks, k, kind, description, extension) ==
  LET directives == OptionalDirectives(toks, k, TRUE)
      roots == IF IsPunctuator(toks, directives.next, LBrace) THEN RootOperationTypes(toks, directives.next + 1, <<>>)
               ELSE IF extension /\ directives.node.children # <<>>
               THEN Done(NoItems("RootOperationTypes"), directives.next)
               ELSE Fail(directives.next)
  IN CASE ~directives.ok -> directives
       [] ~roots.ok -> roots
       [] OTHER -> Done(Node(kind, <<>>, <<description, directives.node, roots.node>>), roots.next)

\* ScalarTypeDefinition : Description? scalar Name Directives[Const]?
\* ScalarTypeExtension : extend scalar Name Directives[Const]
ScalarBody(toks, k, kind, description, extension) ==
  LET name == NameNode(toks, k)
      directives == OptionalDirectives(toks, name.next, TRUE)
  IN CASE ~name.ok -> name
       [] ~directives.ok -> directives
       [] extension /\ directives.node.children = <<>> -> Fail(directives.next)
       [] OTHER -> Done(Node(kind, name.node.text, <<description, directives.node>>), directives.next)

\* ObjectTypeDefinition :
\*   Description? type Name ImplementsInterfaces? Directives[Const]? FieldsDefinition
\*   Description? type Name ImplementsInterfaces? Directives[Const]? [lookahead != {]
\* ObjectTypeExtension :
\*   extend type Name ImplementsInterfaces? Directives[Const]? FieldsDefinition
\*   extend type Name ImplementsInterfaces? Directives[Const] [lookahead != {]
\*   extend type Name ImplementsInterfaces [lookahead != {]
\* InterfaceTypeDefinition and InterfaceTypeExtension: the same, with
\* interface. So an extension adds interfaces, directives or fields.
FieldsBody(toks, k, kind, description, extension) ==
  LET name == NameNode(toks, k)
      interfaces == OptionalImplementsInterfaces(toks, name.next)
      directives == OptionalDirectives(toks, interfaces.next, TRUE)
      fields == OptionalFields(toks, directives.next)
  IN CASE ~name.ok -> name
       [] ~interfaces.ok -> interfaces
       [] ~directives.ok -> directives
       [] ~fields.ok -> fields
       [] extension /\ interfaces.node.children = <<>> /\ directives.node.children = <<>>
                    /\ fields.node.children = <<>> -> Fail(fields.next)
       [] OTHER ->
            Done(Node(kind, name.node.text, <<description, interfaces.node, directives.node, fields.node>>),
                 fields.next)

\* UnionTypeDefinition : Description? union Name Directives[Const]? UnionMemberTypes?
\* UnionTypeExtension :
\*   extend union Name Directives[Const]? UnionMemberTypes
\*   extend union Name Directives[Const]
UnionBody(toks, k, kind, description, extension) ==
  LET name == NameNode(toks, k)
      directives == OptionalDirectives(toks, name.next, TRUE)
      members == OptionalUnionMemberTypes(toks, directives.next)
  IN CASE ~name.ok -> name
       [] ~directives.ok -> directives
       [] ~members.ok -> members
       [] extension /\ directives.node.children = <<>> /\ members.node.children = <<>> -> Fail(members.next)
       [] OTHER -> Done(Node(kind, name.node.text, <<description, directives.node, members.node>>), members.next)

\* EnumTypeDefinition :
\*   Description? enum Name Directives[Const]? EnumValuesDefinition
\*   Description? enum Name Directives[Const]? [lookahead != {]
\* EnumTypeExtension :
\*   extend enum Name Directives[Const]? EnumValuesDefinition
\*   extend enum Name Directives[Const] [lookahead != {]
\* InputObjectTypeDefinition and InputObjectTypeExtension: the same, with
\* input and InputFieldsDefinition.
ValuesBody(toks, k, kind, description, extension) ==
  LET name == NameNode(toks, k)
      directives == OptionalDirectives(toks, name.next, TRUE)
      values == IF kind \in {"EnumTypeDefinition", "EnumTypeExtension"} THEN OptionalEnumValues(toks, directives.next)
                ELSE OptionalInputFields(toks, directives.next)
  IN CASE ~name.ok -> name
       [] ~directives.ok -> directives
       [] ~values.ok -> values
       [] extension /\ directives.node.children = <<>> /\ values.node.children = <<>> -> Fail(values.next)
       [] OTHER -> Done(Node(kind, name.node.text, <<description, directives.node, values.node>>), values.next)

\* DirectiveDefinition :
\*   Description? directive @ Name ArgumentsDefinition? Directives[Const]? `repeatable`? on DirectiveLocations
\* Directives on a directive definition are new in September 2026.
DirectiveDefinition(toks, k, description) ==
  LET name == IF IsPunctuator(toks, k, At) THEN NameNode(toks, k + 1) ELSE Fail(k)
      arguments == OptionalArgumentsDefinition(toks, name.next)
      directives == OptionalDirectives(toks, arguments.next, TRUE)
      repeatable == IsKeyword(toks, directives.next, KwRepeatable)
      on == directives.next + (IF repeatable THEN 1 ELSE 0)
      locations == IF IsKeyword(toks, on, KwOn) THEN DirectiveLocations(toks, on + 1) ELSE Fail(on)
  IN CASE ~name.ok -> name
       [] ~arguments.ok -> arguments
       [] ~directives.ok -> directives
       [] ~locations.ok -> locations
       [] OTHER ->
            Done(Node("DirectiveDefinition", name.node.text,
                      <<description, arguments.node, directives.node,
                        Node("Repeatable", IF repeatable THEN KwRepeatable ELSE <<>>, <<>>), locations.node>>),
                 locations.next)

\* DirectiveExtension : extend directive @ Name Directives[Const]
\* New in September 2026.
DirectiveExtension(toks, k) ==
  LET name == IF IsPunctuator(toks, k, At) THEN NameNode(toks, k + 1) ELSE Fail(k)
      directives == OptionalDirectives(toks, name.next, TRUE)
  IN CASE ~name.ok -> name
       [] ~directives.ok -> directives
       [] directives.node.children = <<>> -> Fail(directives.next)
       [] OTHER -> Done(Node("DirectiveExtension", name.node.text, <<NoNode, directives.node>>), directives.next)

\* TypeSystemDefinition : SchemaDefinition | TypeDefinition | DirectiveDefinition
\* TypeDefinition : ScalarTypeDefinition | ObjectTypeDefinition |
\*   InterfaceTypeDefinition | UnionTypeDefinition | EnumTypeDefinition |
\*   InputObjectTypeDefinition
\* Each starts with an optional Description, then its keyword.
TypeSystemDefinition(toks, k) ==
  LET description == OptionalDescription(toks, k)
      key == description.next
      d == description.node
  IN CASE IsKeyword(toks, key, KwSchema) -> SchemaBody(toks, key + 1, "SchemaDefinition", d, FALSE)
       [] IsKeyword(toks, key, KwScalar) -> ScalarBody(toks, key + 1, "ScalarTypeDefinition", d, FALSE)
       [] IsKeyword(toks, key, KwType) -> FieldsBody(toks, key + 1, "ObjectTypeDefinition", d, FALSE)
       [] IsKeyword(toks, key, KwInterface) -> FieldsBody(toks, key + 1, "InterfaceTypeDefinition", d, FALSE)
       [] IsKeyword(toks, key, KwUnion) -> UnionBody(toks, key + 1, "UnionTypeDefinition", d, FALSE)
       [] IsKeyword(toks, key, KwEnum) -> ValuesBody(toks, key + 1, "EnumTypeDefinition", d, FALSE)
       [] IsKeyword(toks, key, KwInput) -> ValuesBody(toks, key + 1, "InputObjectTypeDefinition", d, FALSE)
       [] IsKeyword(toks, key, KwDirective) -> DirectiveDefinition(toks, key + 1, d)
       [] OTHER -> Fail(key)

\* TypeSystemExtension : SchemaExtension | TypeExtension | DirectiveExtension
\* TypeExtension : ScalarTypeExtension | ObjectTypeExtension |
\*   InterfaceTypeExtension | UnionTypeExtension | EnumTypeExtension |
\*   InputObjectTypeExtension
\* None takes a Description. k is the index of `extend`.
TypeSystemExtension(toks, k) ==
  LET key == k + 1 IN
  CASE IsKeyword(toks, key, KwSchema) -> SchemaBody(toks, key + 1, "SchemaExtension", NoNode, TRUE)
    [] IsKeyword(toks, key, KwScalar) -> ScalarBody(toks, key + 1, "ScalarTypeExtension", NoNode, TRUE)
    [] IsKeyword(toks, key, KwType) -> FieldsBody(toks, key + 1, "ObjectTypeExtension", NoNode, TRUE)
    [] IsKeyword(toks, key, KwInterface) -> FieldsBody(toks, key + 1, "InterfaceTypeExtension", NoNode, TRUE)
    [] IsKeyword(toks, key, KwUnion) -> UnionBody(toks, key + 1, "UnionTypeExtension", NoNode, TRUE)
    [] IsKeyword(toks, key, KwEnum) -> ValuesBody(toks, key + 1, "EnumTypeExtension", NoNode, TRUE)
    [] IsKeyword(toks, key, KwInput) -> ValuesBody(toks, key + 1, "InputObjectTypeExtension", NoNode, TRUE)
    [] IsKeyword(toks, key, KwDirective) -> DirectiveExtension(toks, key + 1)
    [] OTHER -> Fail(key)

\* The four document grammars a source can be read as:
\*   "executable"           ExecutableDocument : ExecutableDefinition+  (§2.3)
\*   "typeSystem"           TypeSystemDocument : TypeSystemDefinition+  (§3)
\*   "typeSystemExtension"  TypeSystemExtensionDocument :
\*                            TypeSystemDefinitionOrExtension+  (§3.1)
\*   "document"             Document : Definition+  (§2.3)
\*     Definition : ExecutableDefinition | TypeSystemDefinitionOrExtension
\*     TypeSystemDefinitionOrExtension : TypeSystemDefinition | TypeSystemExtension
Grammars == {"executable", "typeSystem", "typeSystemExtension", "document"}

\* One definition at k, of a kind the grammar allows. The kinds start with
\* disjoint tokens, after an optional Description: {, an operation type or
\* `fragment` for an executable definition; `extend`, with no Description,
\* for an extension; a type system keyword otherwise.
DefinitionOf(toks, k, grammar, proposals) ==
  LET keyword == IF IsString(toks, k) THEN k + 1 ELSE k
      executable == \/ IsPunctuator(toks, k, LBrace)
                    \/ IsName(toks, keyword) /\ Tk(toks, keyword).value \in OperationTypes \cup {KwFragment}
  IN CASE executable ->
            IF grammar \in {"executable", "document"} THEN ExecutableDefinition(toks, k, proposals) ELSE Fail(keyword)
       [] IsKeyword(toks, k, KwExtend) ->
            IF grammar \in {"typeSystemExtension", "document"} THEN TypeSystemExtension(toks, k) ELSE Fail(k)
       [] OTHER -> IF grammar = "executable" THEN Fail(keyword) ELSE TypeSystemDefinition(toks, k)

RECURSIVE DefinitionsOf(_, _, _, _, _)
DefinitionsOf(toks, k, grammar, proposals, items) ==
  IF k > Len(toks) THEN Done(Items("Document", items), k)
  ELSE LET definition == DefinitionOf(toks, k, grammar, proposals) IN
       IF definition.ok
       THEN DefinitionsOf(toks, definition.next, grammar, proposals, Append(items, definition.node))
       ELSE definition

\* Each grammar's document is one or more definitions.
DocumentOf(toks, grammar, proposals) ==
  IF toks = <<>> THEN Fail(1) ELSE DefinitionsOf(toks, 1, grammar, proposals, <<>>)

\* The parse tree of a source text read as grammar (one of Grammars) with
\* the given proposals, or [ok |-> FALSE, node |-> NoNode] for a lexical or
\* syntax error. The proposals only change executable definitions.
ParseDocumentWith(src, grammar, proposals) ==
  LET lexed == Lex(src) IN
  IF ~lexed.ok THEN [ok |-> FALSE, node |-> NoNode]
  ELSE LET parsed == DocumentOf(lexed.tokens, grammar, proposals) IN
       [ok |-> parsed.ok, node |-> parsed.node]

\* The same for the September 2026 edition, with no proposal.
\* ParseDocument(src, "executable") is ParseExecutable(src).
ParseDocument(src, grammar) == ParseDocumentWith(src, grammar, September2026)

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
                    <<Node("BlockString", Text("d"), <<>>), NoVariables, Named("T"), NoDirectives,
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
                                         <<NoArguments,
                                           Items("Directives", <<Node("Directive", Text("d"), <<NoArguments>>)>>)>>)>>)>>)),
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
  \* September 2026 has no fragment arguments (see Proposals).
  Rejects("fragment F($a: Int) on T {a}"),
  Rejects("{...F(a: 1)}"),
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

EdgeVectors == <<
  \* A comment may end the source.
  Parses("{a} # end", NoNode),
  Parses("{a}#", NoNode),
  Parses("# c\n{a}\n# d", NoNode),
  \* Commas are insignificant: they make no argument, variable definition
  \* or value.
  Rejects("{a(,)}"),
  Rejects("{a @d(,)}"),
  Rejects("query (,) {a}"),
  Parses("{a(x: [,], y: {,})}", NoNode),
  Parses("{,a,,b,}", NoNode),
  Parses("query (,$a: Int,) {a(,x: $a,)}", NoNode),
  \* Variable : $ Name, and any Name, keywords included.
  Parses("query ($on: Int, $true: Boolean, $null: Int, $query: Int, $fragment: Int) {a(x: $on, y: $true, z: $null)}", NoNode),
  \* BooleanValue, NullValue and EnumValue are one token each.
  Parses("{a(x: [true false], y: [null null])}", NoNode),
  Rejects("{a(x: true false)}"),
  Rejects("query ($a: Boolean = true false) {a}"),
  Rejects("{a(x: null null)}"),
  Parses("query ($a: Int = null, $b: Boolean = false) {a}", NoNode),
  Parses("{a(x: nul, y: True, z: NULL, w: falsey)}", NoNode),
  Rejects("{a(x: RED BLUE)}"),
  Parses("{a(x: {true: false, null: null, on: on})}", NoNode),
  \* No type system definition is an ExecutableDefinition.
  Rejects("scalar S"),
  Rejects("enum E { A }"),
  Rejects("input I { a: Int }"),
  Rejects("union U = A"),
  Rejects("interface I"),
  Rejects("schema { query: Q }"),
  Rejects("directive @d on FIELD"),
  Rejects("extend schema @d"),
  Rejects("extend directive @d @x"),
  Rejects("{a} scalar S")
>>

\* Type system documents (§3), extension documents (§3.1) and Documents
\* (§2.3): each vector names the grammar its source is read as.
Accepts(grammar, source, tree) == [grammar |-> grammar, source |-> Text(source), ok |-> TRUE, tree |-> tree]
Refuses(grammar, source) == [grammar |-> grammar, source |-> Text(source), ok |-> FALSE, tree |-> NoNode]

GrammarPasses(v) ==
  LET parsed == ParseDocument(v.source, v.grammar) IN
  parsed.ok = v.ok /\ (v.tree # NoNode => parsed.node = v.tree)

NoFields == NoItems("FieldsDefinition")
NoInterfaces == NoItems("ImplementsInterfaces")
NoArgumentsDefinition == NoItems("ArgumentsDefinition")
Directive(name) == Node("Directive", Text(name), <<NoArguments>>)
Directed(names) == Items("Directives", [n \in DOMAIN names |-> Directive(names[n])])
FieldDef(name, type) == Node("FieldDefinition", Text(name), <<NoNode, NoArgumentsDefinition, type, NoDirectives>>)
NotRepeatable == Node("Repeatable", <<>>, <<>>)
Locations(names) == Items("DirectiveLocations", [n \in DOMAIN names |-> Node("Name", Text(names[n]), <<>>)])

TypeSystemVectors == <<
  Accepts("typeSystem", "type T", Doc(<<Node("ObjectTypeDefinition", Text("T"), <<NoNode, NoInterfaces, NoDirectives, NoFields>>)>>)),
  Accepts("typeSystem", "type T { f: Int }",
          Doc(<<Node("ObjectTypeDefinition", Text("T"),
                     <<NoNode, NoInterfaces, NoDirectives, Items("FieldsDefinition", <<FieldDef("f", Named("Int"))>>)>>)>>)),
  \* ImplementsInterfaces : ImplementsInterfaces & NamedType | implements &? NamedType
  Accepts("typeSystem", "type T implements & I & J { f: Int }",
          Doc(<<Node("ObjectTypeDefinition", Text("T"),
                     <<NoNode, Items("ImplementsInterfaces", <<Named("I"), Named("J")>>), NoDirectives,
                       Items("FieldsDefinition", <<FieldDef("f", Named("Int"))>>)>>)>>)),
  Accepts("typeSystem", "type T implements I & J @d { f: Int }", NoNode),
  Refuses("typeSystem", "type T implements & & I { f: Int }"),
  Refuses("typeSystem", "type T implements I & & J { f: Int }"),
  Refuses("typeSystem", "type T implements I & { f: Int }"),
  Refuses("typeSystem", "type T implements { f: Int }"),
  Refuses("typeSystem", "type T implements I, J { f: Int }"),
  Refuses("typeSystem", "type T implements I J { f: Int }"),
  Refuses("typeSystem", "type T @d implements I { f: Int }"),
  \* FieldsDefinition : { FieldDefinition+ }, and [lookahead != {] without one
  Refuses("typeSystem", "type T {}"),
  Refuses("typeSystem", "type T { f }"),
  Refuses("typeSystem", "type T { f: }"),
  Refuses("typeSystem", "type T { f Int }"),
  Refuses("typeSystem", "type T { : Int }"),
  Refuses("typeSystem", "type T { f: Int!! }"),
  Refuses("typeSystem", "type T { f: [Int }"),
  Refuses("typeSystem", "type T { f: Int = 1 }"),
  Accepts("typeSystem", "type T { f(a: Int = 1 @x, b: [String!]! = [\"s\"]): Int @y }", NoNode),
  Accepts("typeSystem", "type T { f(a: Boolean = true, b: Int = null, c: E = RED, d: I = {k: [1]}): Int }", NoNode),
  \* ArgumentsDefinition : ( InputValueDefinition+ )
  Refuses("typeSystem", "type T { f(): Int }"),
  Refuses("typeSystem", "type T { f(a): Int }"),
  Refuses("typeSystem", "type T { f(a: Int =): Int }"),
  \* Default values and directives in the type system are [Const].
  Refuses("typeSystem", "type T { f(a: Int = $v): Int }"),
  Refuses("typeSystem", "type T { f(a: [Int] = [$v]): Int }"),
  Refuses("typeSystem", "type T { f: Int @d(a: $v) }"),
  Refuses("typeSystem", "type T @d(a: {k: $v})"),
  Refuses("typeSystem", "input I { a: Int = $v }"),
  Refuses("typeSystem", "directive @d(a: Int = $v) on FIELD"),
  Refuses("typeSystem", "scalar S @d(a: $v)"),
  Accepts("typeSystem", "interface I", NoNode),
  Accepts("typeSystem", "interface I implements & A & B @d { f: Int }", NoNode),
  Refuses("typeSystem", "interface I {}"),
  Refuses("typeSystem", "interface I implements"),
  \* UnionMemberTypes : UnionMemberTypes | NamedType | = |? NamedType
  Accepts("typeSystem", "union U = | A | B",
          Doc(<<Node("UnionTypeDefinition", Text("U"),
                     <<NoNode, NoDirectives, Items("UnionMemberTypes", <<Named("A"), Named("B")>>)>>)>>)),
  Accepts("typeSystem", "union U", NoNode),
  Accepts("typeSystem", "union U @d = A", NoNode),
  Refuses("typeSystem", "union U ="),
  Refuses("typeSystem", "union U = |"),
  Refuses("typeSystem", "union U = A |"),
  Refuses("typeSystem", "union U = | | A"),
  Refuses("typeSystem", "union U = A | | B"),
  Refuses("typeSystem", "union U = A, B"),
  Refuses("typeSystem", "union U = A @d"),
  Refuses("typeSystem", "union U | A"),
  \* EnumValue : Name but not true, false or null
  Accepts("typeSystem", "enum E { A \"d\" B @x }",
          Doc(<<Node("EnumTypeDefinition", Text("E"),
                     <<NoNode, NoDirectives,
                       Items("EnumValuesDefinition",
                             <<Node("EnumValueDefinition", Text("A"), <<NoNode, NoDirectives>>),
                               Node("EnumValueDefinition", Text("B"),
                                    <<Node("StringValue", Text("d"), <<>>), Directed(<<"x">>)>>)>>)>>)>>)),
  Accepts("typeSystem", "enum E", NoNode),
  Accepts("typeSystem", "enum E { TRUE }", NoNode),
  Accepts("typeSystem", "enum E { True Null FALSE }", NoNode),
  Accepts("typeSystem", "enum E { on extend type query }", NoNode),
  Refuses("typeSystem", "enum E { true }"),
  Refuses("typeSystem", "enum E { false }"),
  Refuses("typeSystem", "enum E { null }"),
  Refuses("typeSystem", "enum E { A null }"),
  Refuses("typeSystem", "enum E {}"),
  Refuses("typeSystem", "enum E { A: Int }"),
  Refuses("typeSystem", "enum E { A(b: Int) }"),
  Refuses("typeSystem", "enum E { 1 }"),
  Refuses("typeSystem", "enum E { \"A\" }"),
  \* InputFieldsDefinition : { InputValueDefinition+ }
  Accepts("typeSystem", "input I", NoNode),
  Accepts("typeSystem", "input I @d { \"d\" a: Int = 1 @x b: [I!] }", NoNode),
  Refuses("typeSystem", "input I {}"),
  Refuses("typeSystem", "input I { a }"),
  Refuses("typeSystem", "input I { a(b: Int): Int }"),
  Refuses("typeSystem", "input I implements J { a: Int }"),
  \* ScalarTypeDefinition : Description? scalar Name Directives[Const]?
  Accepts("typeSystem", "scalar S", NoNode),
  Accepts("typeSystem", "\"d\" scalar S @specifiedBy(url: \"u\")", NoNode),
  Refuses("typeSystem", "scalar S { f: Int }"),
  Refuses("typeSystem", "scalar"),
  Refuses("typeSystem", "scalar S = A"),
  \* SchemaDefinition : Description? schema Directives[Const]? { RootOperationTypeDefinition+ }
  Accepts("typeSystem", "schema { query: Q }",
          Doc(<<Node("SchemaDefinition", <<>>,
                     <<NoNode, NoDirectives,
                       Items("RootOperationTypes", <<Node("RootOperationTypeDefinition", KwQuery, <<Named("Q")>>)>>)>>)>>)),
  Accepts("typeSystem", "\"\"\"d\"\"\" schema @d { query: Q mutation: M subscription: S }", NoNode),
  Accepts("typeSystem", "schema { query: Q query: R }", NoNode),
  Refuses("typeSystem", "schema {}"),
  Refuses("typeSystem", "schema @d"),
  Refuses("typeSystem", "schema"),
  Refuses("typeSystem", "schema { Query: Q }"),
  Refuses("typeSystem", "schema { query Q }"),
  Refuses("typeSystem", "schema { query: [Q] }"),
  Refuses("typeSystem", "schema { query: Q! }"),
  Refuses("typeSystem", "schema S { query: Q }"),
  \* DirectiveDefinition : Description? directive @ Name ArgumentsDefinition?
  \*   Directives[Const]? repeatable? on DirectiveLocations
  Accepts("typeSystem", "directive @d on FIELD",
          Doc(<<Node("DirectiveDefinition", Text("d"),
                     <<NoNode, NoArgumentsDefinition, NoDirectives, NotRepeatable, Locations(<<"FIELD">>)>>)>>)),
  Accepts("typeSystem", "directive @d on | FIELD | QUERY", NoNode),
  Accepts("typeSystem", "directive @ d on FIELD", NoNode),
  Accepts("typeSystem", "\"d\" directive @d(a: Int = 1) repeatable on FIELD",
          Doc(<<Node("DirectiveDefinition", Text("d"),
                     <<Node("StringValue", Text("d"), <<>>),
                       Items("ArgumentsDefinition",
                             <<Node("InputValueDefinition", Text("a"),
                                    <<NoNode, Named("Int"), Node("IntValue", Text("1"), <<>>), NoDirectives>>)>>),
                       NoDirectives, Node("Repeatable", KwRepeatable, <<>>), Locations(<<"FIELD">>)>>)>>)),
  Accepts("typeSystem", "directive @d on QUERY | MUTATION | SUBSCRIPTION | FIELD | FRAGMENT_DEFINITION | FRAGMENT_SPREAD | INLINE_FRAGMENT | VARIABLE_DEFINITION", NoNode),
  Accepts("typeSystem", "directive @d on SCHEMA | SCALAR | OBJECT | FIELD_DEFINITION | ARGUMENT_DEFINITION | INTERFACE | UNION | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION", NoNode),
  \* New in September 2026: directives on a directive definition, and the
  \* DIRECTIVE_DEFINITION location.
  Accepts("typeSystem", "directive @d on DIRECTIVE_DEFINITION", NoNode),
  Accepts("typeSystem", "directive @d @x on FIELD",
          Doc(<<Node("DirectiveDefinition", Text("d"),
                     <<NoNode, NoArgumentsDefinition, Directed(<<"x">>), NotRepeatable, Locations(<<"FIELD">>)>>)>>)),
  Accepts("typeSystem", "directive @d(a: Int) @x(b: 1) @y repeatable on FIELD", NoNode),
  Refuses("typeSystem", "directive @d repeatable @x on FIELD"),
  Refuses("typeSystem", "directive @d on FIELD @x"),
  Refuses("typeSystem", "directive @d @x(b: $v) on FIELD"),
  Refuses("typeSystem", "directive @d on FOO"),
  Refuses("typeSystem", "directive @d on field"),
  Refuses("typeSystem", "directive @d on"),
  Refuses("typeSystem", "directive @d on | | FIELD"),
  Refuses("typeSystem", "directive @d on FIELD |"),
  Refuses("typeSystem", "directive @d on FIELD | | QUERY"),
  Refuses("typeSystem", "directive @d on FIELD & QUERY"),
  Refuses("typeSystem", "directive @d FIELD"),
  Refuses("typeSystem", "directive @d on FIELD repeatable"),
  Refuses("typeSystem", "directive @d repeatable repeatable on FIELD"),
  Refuses("typeSystem", "directive @d repeatable"),
  Refuses("typeSystem", "directive d on FIELD"),
  Refuses("typeSystem", "directive @d() on FIELD"),
  Refuses("typeSystem", "directive @d(a) on FIELD"),
  \* Names, keywords among them, are not reserved.
  Accepts("typeSystem", "type type { type(type: type): type }", NoNode),
  Accepts("typeSystem", "type implements implements implements { f: Int }", NoNode),
  Accepts("typeSystem", "union union = union | union", NoNode),
  Accepts("typeSystem", "input extend { extend: extend = extend }", NoNode),
  Accepts("typeSystem", "scalar scalar @scalar", NoNode),
  Accepts("typeSystem", "directive @repeatable(on: on) repeatable on FIELD", NoNode),
  Accepts("typeSystem", "directive @on on FIELD", NoNode),
  Accepts("typeSystem", "schema { query: query mutation: schema }", NoNode),
  \* Description : StringValue, before what it describes, and only on
  \* definitions.
  Accepts("typeSystem", "\"d\" type T { \"e\" f(\"g\" a: Int): Int }", NoNode),
  Accepts("typeSystem", "\"\"\"d\"\"\" interface I \"e\" union U \"f\" enum E \"g\" input In", NoNode),
  Refuses("typeSystem", "\"d\" \"e\" scalar S"),
  Refuses("typeSystem", "\"d\""),
  Refuses("typeSystem", "scalar S \"d\""),
  Refuses("typeSystem", "type T { f: Int \"d\" }"),
  Refuses("typeSystem", "type T \"d\" { f: Int }"),
  Refuses("typeSystem", "enum E { A \"d\" }"),
  \* TypeSystemDocument : TypeSystemDefinition+, so no extensions and no
  \* executable definitions.
  Accepts("typeSystem", "scalar S type T { f: S } schema { query: T } directive @d on FIELD", NoNode),
  Refuses("typeSystem", ""),
  Refuses("typeSystem", "# only a comment"),
  Refuses("typeSystem", "extend type T @d"),
  Refuses("typeSystem", "type T extend type T @d"),
  Refuses("typeSystem", "extend scalar S @d"),
  Refuses("typeSystem", "{a}"),
  Refuses("typeSystem", "query {a}"),
  Refuses("typeSystem", "type T query {a}"),
  Refuses("typeSystem", "fragment F on T {a}"),
  Refuses("typeSystem", "Type T"),
  Refuses("typeSystem", "object T { f: Int }")
>>

ExtensionVectors == <<
  \* SchemaExtension : extend schema Directives[Const]? { RootOperationTypeDefinition+ }
  \*                 | extend schema Directives[Const] [lookahead != {]
  Accepts("typeSystemExtension", "extend schema @d",
          Doc(<<Node("SchemaExtension", <<>>, <<NoNode, Directed(<<"d">>), NoItems("RootOperationTypes")>>)>>)),
  Accepts("typeSystemExtension", "extend schema { mutation: M }", NoNode),
  Accepts("typeSystemExtension", "extend schema @d { subscription: S }", NoNode),
  Refuses("typeSystemExtension", "extend schema"),
  Refuses("typeSystemExtension", "extend schema {}"),
  Refuses("typeSystemExtension", "extend schema @d {}"),
  \* ScalarTypeExtension : extend scalar Name Directives[Const]
  Accepts("typeSystemExtension", "extend scalar S @d", NoNode),
  Refuses("typeSystemExtension", "extend scalar S"),
  Refuses("typeSystemExtension", "extend scalar S { f: Int }"),
  \* ObjectTypeExtension (and InterfaceTypeExtension): interfaces,
  \* directives or fields
  Accepts("typeSystemExtension", "extend type T implements I",
          Doc(<<Node("ObjectTypeExtension", Text("T"),
                     <<NoNode, Items("ImplementsInterfaces", <<Named("I")>>), NoDirectives, NoFields>>)>>)),
  Accepts("typeSystemExtension", "extend type T @d", NoNode),
  Accepts("typeSystemExtension", "extend type T { f: Int }", NoNode),
  Accepts("typeSystemExtension", "extend type T implements & I @d { f: Int }", NoNode),
  Refuses("typeSystemExtension", "extend type T"),
  Refuses("typeSystemExtension", "extend type T {}"),
  Refuses("typeSystemExtension", "extend type T @d {}"),
  Refuses("typeSystemExtension", "extend type T implements"),
  Refuses("typeSystemExtension", "extend type T implements I {}"),
  Accepts("typeSystemExtension", "extend interface I implements J", NoNode),
  Accepts("typeSystemExtension", "extend interface I @d", NoNode),
  Accepts("typeSystemExtension", "extend interface I { f: Int }", NoNode),
  Refuses("typeSystemExtension", "extend interface I"),
  Refuses("typeSystemExtension", "extend interface I {}"),
  \* UnionTypeExtension : extend union Name Directives[Const]? UnionMemberTypes
  \*                    | extend union Name Directives[Const]
  Accepts("typeSystemExtension", "extend union U @d", NoNode),
  Accepts("typeSystemExtension", "extend union U = | A | B", NoNode),
  Accepts("typeSystemExtension", "extend union U @d = A", NoNode),
  Refuses("typeSystemExtension", "extend union U"),
  Refuses("typeSystemExtension", "extend union U ="),
  \* EnumTypeExtension and InputObjectTypeExtension
  Accepts("typeSystemExtension", "extend enum E @d", NoNode),
  Accepts("typeSystemExtension", "extend enum E { B }", NoNode),
  Refuses("typeSystemExtension", "extend enum E"),
  Refuses("typeSystemExtension", "extend enum E {}"),
  Refuses("typeSystemExtension", "extend enum E { true }"),
  Accepts("typeSystemExtension", "extend input I @d", NoNode),
  Accepts("typeSystemExtension", "extend input I { b: Int = 1 }", NoNode),
  Refuses("typeSystemExtension", "extend input I"),
  Refuses("typeSystemExtension", "extend input I {}"),
  Refuses("typeSystemExtension", "extend input I { b: Int = $v }"),
  \* DirectiveExtension : extend directive @ Name Directives[Const]
  \* (new in September 2026)
  Accepts("typeSystemExtension", "extend directive @d @x",
          Doc(<<Node("DirectiveExtension", Text("d"), <<NoNode, Directed(<<"x">>)>>)>>)),
  Accepts("typeSystemExtension", "extend directive @d @x(a: 1) @y", NoNode),
  Refuses("typeSystemExtension", "extend directive @d"),
  Refuses("typeSystemExtension", "extend directive d @x"),
  Refuses("typeSystemExtension", "extend directive @d @x on FIELD"),
  Refuses("typeSystemExtension", "extend directive @d(a: Int) @x"),
  Refuses("typeSystemExtension", "extend directive @d repeatable"),
  Refuses("typeSystemExtension", "extend directive @d @x(a: $v)"),
  \* No extension takes a Description.
  Refuses("typeSystemExtension", "\"d\" extend type T @d"),
  Refuses("typeSystemExtension", "\"d\" extend schema @d"),
  Refuses("typeSystemExtension", "\"\"\"d\"\"\" extend directive @d @x"),
  \* TypeExtension starts with a type keyword.
  Refuses("typeSystemExtension", "extend T @d"),
  Refuses("typeSystemExtension", "extend object T @d"),
  Refuses("typeSystemExtension", "extend"),
  Refuses("typeSystemExtension", "extend query {a}"),
  \* TypeSystemExtensionDocument : TypeSystemDefinitionOrExtension+
  Accepts("typeSystemExtension", "type T { f: Int } extend type T @d scalar S extend scalar S @d", NoNode),
  Accepts("typeSystemExtension", "\"d\" directive @d on FIELD extend directive @d @x", NoNode),
  Refuses("typeSystemExtension", ""),
  Refuses("typeSystemExtension", "{a}"),
  Refuses("typeSystemExtension", "extend type T @d query {a}"),
  Refuses("typeSystemExtension", "fragment F on T {a}")
>>

DocumentGrammarVectors == <<
  \* Document : Definition+; Definition : ExecutableDefinition |
  \* TypeSystemDefinitionOrExtension
  Accepts("document", "type T { f: Int } query {a}", NoNode),
  Accepts("document", "{a} type T", NoNode),
  Accepts("document", "extend type T @d fragment F on T {a} schema { query: T }", NoNode),
  Accepts("document", "\"d\" query {a} \"e\" type T", NoNode),
  Refuses("document", ""),
  Refuses("document", "\"d\" extend type T @d"),
  Refuses("executable", "type T { f: Int } query {a}"),
  \* [lookahead != {]: a definition without its body can't be followed by
  \* a query shorthand. ScalarTypeDefinition, UnionTypeDefinition,
  \* DirectiveDefinition and their extensions have no lookahead
  \* restriction.
  Refuses("document", "type T {}"),
  Accepts("document", "type T query {}", NoNode),
  Refuses("document", "type T {a}"),
  Refuses("document", "interface I @d {a}"),
  Refuses("document", "enum E {}"),
  Refuses("document", "input I {}"),
  Refuses("document", "extend type T @d {}"),
  Refuses("document", "extend schema @d {a}"),
  Refuses("document", "extend enum E @d {}"),
  Accepts("document", "enum E {a}", NoNode),
  Accepts("document", "scalar S {a}", NoNode),
  Accepts("document", "scalar S { f: Int }", NoNode),
  Accepts("document", "union U = A {a}", NoNode),
  Accepts("document", "directive @d on FIELD {a}", NoNode),
  Accepts("document", "extend directive @d @x {a}", NoNode),
  Accepts("document", "extend scalar S @d {a}", NoNode)
>>

\* Fragment arguments (graphql-spec#1081): each source is read with the
\* proposal, as an ExecutableDocument unless the vector names a grammar.
\* None of these sources is a September 2026 document: FragmentArgumentsAreNew
\* checks that the ones accepted here are rejected without the proposal.
Proposed(grammar, source, tree) == [grammar |-> grammar, source |-> Text(source), ok |-> TRUE, tree |-> tree]
NotProposed(grammar, source) == [grammar |-> grammar, source |-> Text(source), ok |-> FALSE, tree |-> NoNode]
Arg(name, value) == Node("Argument", Text(name), <<value>>)
IntNode(text) == Node("IntValue", Text(text), <<>>)
VarNode(name) == Node("Variable", Text(name), <<>>)
VarDefNode(name, type, default) ==
  Node("VariableDefinition", <<>>, <<NoNode, VarNode(name), type, default, NoDirectives>>)
SpreadWith(name, arguments) == Node("FragmentSpread", Text(name), <<Items("Arguments", arguments), NoDirectives>>)

FragmentArgumentVectors == <<
  \* FragmentDefinition : Description? fragment FragmentName
  \*   VariablesDefinition? TypeCondition Directives? SelectionSet
  Proposed("executable", "fragment F($a: Int) on T {a}",
           Doc(<<Node("FragmentDefinition", Text("F"),
                      <<NoNode, Items("VariablesDefinition", <<VarDefNode("a", Named("Int"), NoNode)>>),
                        Named("T"), NoDirectives, Sel(<<Leaf("a")>>)>>)>>)),
  Proposed("executable", "fragment F($a: Int! = 50, $b: [T]) on T @d {a}",
           Doc(<<Node("FragmentDefinition", Text("F"),
                      <<NoNode,
                        Items("VariablesDefinition",
                              <<VarDefNode("a", Node("NonNullType", <<>>, <<Named("Int")>>), IntNode("50")),
                                VarDefNode("b", Node("ListType", <<>>, <<Named("T")>>), NoNode)>>),
                        Named("T"), Items("Directives", <<Node("Directive", Text("d"), <<NoArguments>>)>>),
                        Sel(<<Leaf("a")>>)>>)>>)),
  \* A VariableDefinition is the operation's: Description? Variable : Type
  \* DefaultValue? Directives[Const]?
  Proposed("executable", "\"d\" fragment F(\"e\" $a: Int = 1 @x(y: 2)) on T {a}", NoNode),
  Proposed("executable", "fragment F ( $on: Int , $fragment: Int ) on on {a}", NoNode),
  NotProposed("executable", "fragment F() on T {a}"),
  NotProposed("executable", "fragment F($a) on T {a}"),
  NotProposed("executable", "fragment F($a: Int = $b) on T {a}"),
  NotProposed("executable", "fragment F($a: Int @x(y: $b)) on T {a}"),
  NotProposed("executable", "fragment F(a: Int) on T {a}"),
  \* The variables come before the type condition, and once.
  NotProposed("executable", "fragment F on T ($a: Int) {a}"),
  NotProposed("executable", "fragment F($a: Int)($b: Int) on T {a}"),
  NotProposed("executable", "fragment F($a: Int) {a}"),
  NotProposed("executable", "fragment F($a: Int) on T"),
  \* FragmentName : Name but not `on`, with or without variables.
  NotProposed("executable", "fragment ($a: Int) on T {a}"),
  NotProposed("executable", "fragment on($a: Int) on T {a}"),
  \* FragmentSpread : ... FragmentName Arguments? Directives?
  Proposed("executable", "{...F(a: 1)}", Doc(<<Query(<<SpreadWith("F", <<Arg("a", IntNode("1"))>>)>>)>>)),
  \* Arguments, not Arguments[Const]: a spread's argument may be a variable,
  \* at any depth.
  Proposed("executable", "{...F(a: $v, b: [$w])}",
           Doc(<<Query(<<SpreadWith("F", <<Arg("a", VarNode("v")),
                                           Arg("b", Items("ListValue", <<VarNode("w")>>))>>)>>)>>)),
  Proposed("executable", "{...F(a: {k: $v}) @d(x: $v)}", NoNode),
  Proposed("executable", "{...F (a: 1 a: 2)}", NoNode),
  NotProposed("executable", "{...F()}"),
  NotProposed("executable", "{...F(a)}"),
  NotProposed("executable", "{...F(a:)}"),
  NotProposed("executable", "{...F($a: 1)}"),
  NotProposed("executable", "{...F(a: 1)(b: 2)}"),
  \* The arguments come before the directives: after @d(x: 1), a ( starts
  \* no selection.
  NotProposed("executable", "{...F @d(x: 1) (a: 1)}"),
  \* A spread has no selection set, and an inline fragment no arguments.
  NotProposed("executable", "{...F(a: 1) {b}}"),
  NotProposed("executable", "{... on T(a: 1) {a}}"),
  NotProposed("executable", "{...(a: 1) {a}}"),
  NotProposed("executable", "{...on(a: 1)}"),
  \* A spread forwards its fragment's variables to another spread.
  Proposed("executable",
           "query Q($a: Int) {...F(a: $a)} fragment F($a: Int) on Q {f(x: $a) ...G(b: $a)} fragment G($b: Int) on Q {g(y: $b)}",
           NoNode),
  \* Only executable definitions change.
  Proposed("document", "type T { a: Int } fragment F($a: Int) on T {a} {...F(a: 1)}", NoNode),
  NotProposed("typeSystem", "fragment F($a: Int) on T {a}"),
  NotProposed("typeSystemExtension", "extend type T @d fragment F($a: Int) on T {a}")
>>

ParserVectors == [Documents |-> DocumentVectors, Selections |-> SelectionVectors,
                  Values |-> ValueVectors, Variables |-> VariableVectors, Edges |-> EdgeVectors]

\* Each initial state is one vector, as in Lexer.tla.
ParserInit ==
  vector \in UNION {{[group |-> g, n |-> n] : n \in DOMAIN ParserVectors[g]} : g \in DOMAIN ParserVectors}

ParserVectorPasses(group) == vector.group = group => ParserPasses(ParserVectors[group][vector.n])

DocumentsParse == ParserVectorPasses("Documents")
SelectionsParse == ParserVectorPasses("Selections")
ValuesParse == ParserVectorPasses("Values")
VariablesParse == ParserVectorPasses("Variables")
EdgesParse == ParserVectorPasses("Edges")

GrammarVectors == [TypeSystem |-> TypeSystemVectors, Extensions |-> ExtensionVectors,
                   DocumentGrammars |-> DocumentGrammarVectors]

\* The vectors of every kind, each initial state one vector.
AllVectorsInit ==
  \/ ParserInit
  \/ vector \in UNION {{[group |-> g, n |-> n] : n \in DOMAIN GrammarVectors[g]} : g \in DOMAIN GrammarVectors}
  \/ vector \in {[group |-> "FragmentArguments", n |-> n] : n \in DOMAIN FragmentArgumentVectors}

GrammarVectorPasses(group) == vector.group = group => GrammarPasses(GrammarVectors[group][vector.n])

TypeSystemParses == GrammarVectorPasses("TypeSystem")
ExtensionsParse == GrammarVectorPasses("Extensions")
DocumentGrammarsParse == GrammarVectorPasses("DocumentGrammars")

\* Read as an ExecutableDocument through ParseDocument, every executable
\* vector parses as ParseExecutable parses it.
ExecutableGrammarAgrees ==
  vector.group \in DOMAIN ParserVectors =>
    LET source == ParserVectors[vector.group][vector.n].source IN
    ParseDocument(source, "executable") = ParseExecutable(source)

\* Fragment arguments. FragmentArgumentsParse: each of the proposal's
\* vectors reads as it says, with the proposal.
WithFragmentArguments == {FragmentArguments}
FragmentArgumentsParse ==
  vector.group = "FragmentArguments" =>
    LET v == FragmentArgumentVectors[vector.n]
        parsed == ParseDocumentWith(v.source, v.grammar, WithFragmentArguments)
    IN parsed.ok = v.ok /\ (v.tree # NoNode => parsed.node = v.tree)

\* FragmentArgumentsAreNew: none of those vectors is a September 2026
\* document, whatever the proposal makes of it.
FragmentArgumentsAreNew ==
  vector.group = "FragmentArguments" =>
    LET v == FragmentArgumentVectors[vector.n] IN ~ParseDocument(v.source, v.grammar).ok

\* FragmentArgumentsOnlyAdd: the proposal's grammar contains September
\* 2026's. Every vector of this module that September 2026 accepts reads
\* as the same tree with the proposal.
FragmentArgumentsOnlyAdd ==
  LET agrees(source, grammar) ==
        LET released == ParseDocument(source, grammar) IN
        released.ok => ParseDocumentWith(source, grammar, WithFragmentArguments) = released
  IN CASE vector.group \in DOMAIN ParserVectors ->
            agrees(ParserVectors[vector.group][vector.n].source, "executable")
       [] vector.group \in DOMAIN GrammarVectors ->
            LET v == GrammarVectors[vector.group][vector.n] IN agrees(v.source, v.grammar)
       [] OTHER -> TRUE

=============================================================================
