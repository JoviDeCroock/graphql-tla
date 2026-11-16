---- MODULE SchemaCoordinates ----
(***************************************************************************)
(* §2.14 Schema Coordinates, written by hand from the September 2026      *)
(* edition (https://spec.graphql.org/September2026/). September 2025 is   *)
(* the first release that has them, with the same text.                   *)
(*                                                                         *)
(* Parse(src) is "Parsing a Schema Coordinate": src is a sequence of code  *)
(* points, read with the self-contained grammar                            *)
(*   SchemaCoordinateToken :: SchemaCoordinatePunctuator | Name            *)
(*   SchemaCoordinatePunctuator :: one of ( ) . : @                        *)
(* with no Ignored anywhere, then matched against the five productions:    *)
(*   TypeCoordinate :: Name                                                *)
(*   MemberCoordinate :: Name . Name                                       *)
(*   ArgumentCoordinate :: Name . Name ( Name : )                          *)
(*   DirectiveCoordinate :: @ Name                                         *)
(*   DirectiveArgumentCoordinate :: @ Name ( Name : )                      *)
(*                                                                         *)
(* Resolve(S, parsed) is "Resolving a Schema Coordinate", the five         *)
(* algorithms step by step, once the coordinates the spec gives no defined *)
(* behaviour (below) are set aside, over TypeSystem.tla's schema data S. A *)
(* step "Return X if it exists" gives no element when X doesn't exist; an  *)
(* "Assert" that fails raises an error, which the prose says of a missing  *)
(* non-leaf node ("an error will be raised if any non-leaf nodes within a  *)
(* schema coordinate cannot be found in the schema").                      *)
(*                                                                         *)
(* Where the spec gives no defined behaviour, Resolve says so              *)
(* ("unspecified"): a meta-field or an introspection type ("they are not   *)
(* schema element and therefore resolving such coordinates does not have a *)
(* defined behavior"), a built-in scalar no field, argument or input      *)
(* field of the schema refers to, which §3.5 leaves out of the schema's    *)
(* types in introspection but nothing says is absent from the schema, and *)
(* @deprecated, @specifiedBy or @oneOf in a schema that has nothing       *)
(* deprecated, no custom scalar or no OneOf input object, where §3.13      *)
(* doesn't ask for the directive (DirectiveExists).                        *)
(*                                                                         *)
(* Data shapes:                                                            *)
(*   parsed   [ok, kind, names, reason]  kind \in {"type", "member",       *)
(*            "argument", "directive", "directiveArgument"}; names the     *)
(*            Names' values as strings; reason, for a rejected source, is  *)
(*            "sourceCharacter", "ignored" (the first character no token   *)
(*            starts at begins an Ignored), "token" (some other character  *)
(*            starts no token) or "grammar" (the tokens match no           *)
(*            production)                                                  *)
(*   element  [kind, path]  kind \in {"type", "field", "inputField",       *)
(*            "enumValue", "argument", "directive", "directiveArgument"};  *)
(*            path the names from the outermost element in                 *)
(*   result   [outcome, element, why]  outcome \in {"element", "none",     *)
(*            "error", "unspecified"}; why, for an error, is the Assert    *)
(*            that failed: "type", "field" or "directive" (it doesn't     *)
(*            exist) or "kind" (the type isn't of a kind the coordinate   *)
(*            can look into); for "unspecified", the reason                *)
(*                                                                         *)
(* SchemaCoordinates.cfg checks the uniqueness property on a small schema  *)
(* (every schema element has exactly one coordinate, which resolves back  *)
(* to it), the two prose sentences on missing elements, and hand-written   *)
(* vectors. scripts/generate-vectors-coordinate.mjs evaluates Parse and    *)
(* Resolve for the kit's coordinate area.                                  *)
(***************************************************************************)
EXTENDS Integers, Sequences, FiniteSets, TLC

\* Lexer.tla's state variable, which INSTANCE substitutes by name. Here it
\* is the index of the hand-written vector being checked (0: the properties
\* over every element of Example).
VARIABLE vector

L == INSTANCE Lexer
TS == INSTANCE TypeSystem

-----------------------------------------------------------------------------
(* Parsing a Schema Coordinate *)

\* SchemaCoordinatePunctuator :: one of ( ) . : @
CoordinatePunctuators == {40, 41, 46, 58, 64}

\* A sequence of printable ASCII code points as a string. Names hold only
\* letters, digits and _, and the punctuators are printable.
RECURSIVE AsString(_)
AsString(cps) ==
  IF cps = <<>> THEN ""
  ELSE SubSeq(L!Printable, Head(cps) - 31, Head(cps) - 31) \o AsString(Tail(cps))

CToken(kind, text) == [kind |-> kind, text |-> text]

\* SchemaCoordinateToken at index i: a punctuator, or a Name (Lexer.tla's
\* NameAt: "the longest possible valid sequence"). Returns [ok, end, token].
CoordinateTokenAt(src, i) ==
  LET c == src[i] IN
  IF c \in CoordinatePunctuators
  THEN [ok |-> TRUE, end |-> i + 1, token |-> CToken("Punctuator", AsString(<<c>>))]
  ELSE IF L!IsNameStart(c)
  THEN LET scan == L!NameAt(src, i) IN
       [ok |-> TRUE, end |-> scan.end, token |-> CToken("Name", AsString(scan.value))]
  ELSE [ok |-> FALSE, end |-> i, token |-> CToken("", "")]

\* "{SchemaCoordinate} must not contain {Whitespace} or other {Ignored}
\* grammars within the character sequence": unlike Lexer.tla's LexFrom,
\* nothing is skipped. Returns [ok, tokens, pos]; pos is where it failed.
RECURSIVE CoordinateTokens(_, _, _)
CoordinateTokens(src, i, tokens) ==
  IF i > Len(src) THEN [ok |-> TRUE, tokens |-> tokens, pos |-> i]
  ELSE LET next == CoordinateTokenAt(src, i) IN
       IF next.ok THEN CoordinateTokens(src, next.end, Append(tokens, next.token))
       ELSE [ok |-> FALSE, tokens |-> <<>>, pos |-> i]

\* The token sequence with every Name written "N".
Shape(tokens) == [k \in DOMAIN tokens |-> IF tokens[k].kind = "Name" THEN "N" ELSE tokens[k].text]

Kinds == <<"type", "member", "argument", "directive", "directiveArgument">>

Production(kind) ==
  CASE kind = "type" -> <<"N">>
    [] kind = "member" -> <<"N", ".", "N">>
    [] kind = "argument" -> <<"N", ".", "N", "(", "N", ":", ")">>
    [] kind = "directive" -> <<"@", "N">>
    [] OTHER -> <<"@", "N", "(", "N", ":", ")">>

RECURSIVE NamesIn(_)
NamesIn(tokens) ==
  IF tokens = <<>> THEN <<>>
  ELSE (IF Head(tokens).kind = "Name" THEN <<Head(tokens).text>> ELSE <<>>) \o NamesIn(Tail(tokens))

Parsed(ok, kind, names, reason) == [ok |-> ok, kind |-> kind, names |-> names, reason |-> reason]

\* "The source text of a SchemaCoordinate must be a sequence of
\* {SourceCharacter}", described by one of the five productions.
Parse(src) ==
  IF \E k \in DOMAIN src : ~L!IsSourceCharacter(src[k])
  THEN Parsed(FALSE, "", <<>>, "sourceCharacter")
  ELSE LET lexed == CoordinateTokens(src, 1, <<>>) IN
       IF ~lexed.ok
       THEN Parsed(FALSE, "", <<>>, IF L!IgnoredLength(src, lexed.pos) > 0 THEN "ignored" ELSE "token")
       ELSE LET matching == {k \in DOMAIN Kinds : Production(Kinds[k]) = Shape(lexed.tokens)} IN
            IF matching = {} THEN Parsed(FALSE, "", <<>>, "grammar")
            ELSE Parsed(TRUE, Kinds[CHOOSE k \in matching : TRUE], NamesIn(lexed.tokens), "")

-----------------------------------------------------------------------------
(* The schema's elements *)

\* The built-in directives (§3.13.1 to §3.13.5) and their arguments.
BuiltinDirectiveArgs ==
  ("skip" :> <<"if">>) @@ ("include" :> <<"if">>) @@ ("deprecated" :> <<"reason">>)
  @@ ("specifiedBy" :> <<"url">>) @@ ("oneOf" :> <<>>)

ArgTypeNames(args) == {args[k].type.name : k \in DOMAIN args}

\* The names of the types a field, argument or input field of the schema
\* refers to (§3.5: a built-in scalar is "referenced" if there is a "field,
\* argument, or input field of that type"). Built-in directives' arguments
\* aren't counted: whether they make String and Boolean referenced is one
\* of the questions that leave an unreferenced built-in scalar unspecified.
ReferencedTypeNames(S) ==
  UNION {UNION {{T.fields[k].type.name} \cup ArgTypeNames(T.fields[k].args) : k \in DOMAIN T.fields}
           \cup ArgTypeNames(T.inputFields) : T \in TS!Range(S.types)}
  \cup UNION {ArgTypeNames(S.directives[k].args) : k \in DOMAIN S.directives}

DefinesType(S, name) == \E i \in DOMAIN S.types : S.types[i].name = name

\* "the type in {schema} named {typeName}": a type the schema defines, or a
\* built-in scalar it refers to.
TypeExists(S, name) ==
  DefinesType(S, name) \/ (name \in TS!BuiltinScalarNames /\ name \in ReferencedTypeNames(S))

\* Why resolving a coordinate rooted at this type name has no defined
\* behaviour, or "" if it has one.
UndefinedType(S, name) ==
  IF name \in TS!IntrospectionTypeNames THEN "introspection type"
  ELSE IF name \in TS!BuiltinScalarNames /\ ~TypeExists(S, name) THEN "unreferenced built-in scalar"
  ELSE ""

\* "Meta-fields are not defined within a schema, and thus are not schema
\* element": __typename on every Object, Interface and Union type (§4.1),
\* __schema and __type on the query root operation type (§4.2).
IsMetaField(S, T, name) ==
  \/ name = "__typename" /\ T.kind \in {"OBJECT", "INTERFACE", "UNION"}
  \/ name \in {"__schema", "__type"} /\ TS!RootTypeName(S, "query") = <<T.name>>

\* Which built-in directives a schema has that its SDL doesn't define. §3.13
\* doesn't put them in every schema ("When representing a GraphQL schema
\* using the type system definition language any built-in directive may be
\* omitted for brevity" is about writing SDL); it says which ones an
\* implementation provides:
\*   "GraphQL implementations should provide the @skip and @include
\*   directives."
\*   "GraphQL implementations that support the type system definition
\*   language must provide the @deprecated directive if representing
\*   deprecated portions of the schema."
\*   "... should provide the @specifiedBy directive if representing custom
\*   scalar definitions."
\*   "... should provide the @oneOf directive if representing OneOf Input
\*   Objects."
\* So @skip and @include are in every schema, and the other three in a
\* schema that has what they describe: something deprecated, a custom
\* scalar, a OneOf input object (the kit grades the "should"s as SHOULDs).
\* Where that condition doesn't hold the spec doesn't say whether the schema
\* has the directive, and resolving its coordinates has no defined
\* behaviour here.
IsDeprecated(x) == x.deprecated # <<>>
HasDeprecatedArg(args) == \E k \in DOMAIN args : IsDeprecated(args[k])
RepresentsDeprecation(S) ==
  \/ \E T \in TS!Range(S.types) :
       \/ \E k \in DOMAIN T.fields : IsDeprecated(T.fields[k]) \/ HasDeprecatedArg(T.fields[k].args)
       \/ HasDeprecatedArg(T.inputFields)
       \/ \E k \in DOMAIN T.values : IsDeprecated(T.values[k])
  \/ \E i \in DOMAIN S.directives : IsDeprecated(S.directives[i]) \/ HasDeprecatedArg(S.directives[i].args)
RepresentsCustomScalars(S) ==
  \E T \in TS!Range(S.types) : T.kind = "SCALAR" /\ T.name \notin TS!BuiltinScalarNames
RepresentsOneOf(S) == \E T \in TS!Range(S.types) : T.kind = "INPUT_OBJECT" /\ T.oneOf
BuiltinDirectiveProvided(S, name) ==
  CASE name \in {"skip", "include"} -> TRUE
    [] name = "deprecated" -> RepresentsDeprecation(S)
    [] name = "specifiedBy" -> RepresentsCustomScalars(S)
    [] OTHER -> RepresentsOneOf(S)

DirectiveExists(S, name) ==
  \/ TS!DefinesDirective(S, name)
  \/ name \in DOMAIN BuiltinDirectiveArgs /\ BuiltinDirectiveProvided(S, name)

\* Why resolving a coordinate rooted at this directive name has no defined
\* behaviour, or "" if it has one.
UndefinedDirective(S, name) ==
  IF name \in DOMAIN BuiltinDirectiveArgs /\ ~DirectiveExists(S, name)
  THEN "built-in directive not provided" ELSE ""

DirectiveArgNames(S, name) ==
  IF TS!DefinesDirective(S, name) THEN TS!Range(TS!NamesOf(TS!DirectiveNamed(S, name).args))
  ELSE TS!Range(BuiltinDirectiveArgs[name])

-----------------------------------------------------------------------------
(* Resolving a Schema Coordinate *)

Element(kind, path) == [kind |-> kind, path |-> path]
NoElement == Element("", <<>>)
Result(outcome, element, why) == [outcome |-> outcome, element |-> element, why |-> why]
Found(kind, path) == Result("element", Element(kind, path), "")
\* "the resolve function will not yield a value (without raising an error)"
Nothing == Result("none", NoElement, "")
Raise(why) == Result("error", NoElement, why)
Undefined(why) == Result("unspecified", NoElement, why)

\* TypeCoordinate :: Name
\*   2. Return the type in {schema} named {typeName} if it exists.
ResolveType(S, typeName) ==
  IF UndefinedType(S, typeName) # "" THEN Undefined(UndefinedType(S, typeName))
  ELSE IF TypeExists(S, typeName) THEN Found("type", <<typeName>>)
  ELSE Nothing

\* MemberCoordinate :: Name . Name
\*   3. Assert: {type} must exist, and must be an Enum, Input Object, Object
\*      or Interface type.
\*   4.-6. the enum value, input field or field named by the second Name,
\*      "if it exists".
ResolveMember(S, typeName, memberName) ==
  IF UndefinedType(S, typeName) # "" THEN Undefined(UndefinedType(S, typeName))
  ELSE IF ~TypeExists(S, typeName) THEN Raise("type")
  ELSE LET T == TS!TypeNamed(S, typeName) IN
  IF IsMetaField(S, T, memberName) THEN Undefined("meta-field")
  ELSE IF T.kind \notin {"ENUM", "INPUT_OBJECT", "OBJECT", "INTERFACE"} THEN Raise("kind")
  ELSE IF T.kind = "ENUM"
  THEN IF memberName \in TS!Range(TS!NamesOf(T.values)) THEN Found("enumValue", <<typeName, memberName>>) ELSE Nothing
  ELSE IF T.kind = "INPUT_OBJECT"
  THEN IF memberName \in TS!Range(TS!NamesOf(T.inputFields)) THEN Found("inputField", <<typeName, memberName>>) ELSE Nothing
  ELSE IF TS!HasField(T, memberName) THEN Found("field", <<typeName, memberName>>) ELSE Nothing

\* ArgumentCoordinate :: Name . Name ( Name : )
\*   3. Assert: {type} must exist, and be an Object or Interface type.
\*   6. Assert: {field} must exist.
\*   8. Return the argument of {field} named {fieldArgumentName} if it
\*      exists.
ResolveArgument(S, typeName, fieldName, argumentName) ==
  IF UndefinedType(S, typeName) # "" THEN Undefined(UndefinedType(S, typeName))
  ELSE IF ~TypeExists(S, typeName) THEN Raise("type")
  ELSE LET T == TS!TypeNamed(S, typeName) IN
  IF IsMetaField(S, T, fieldName) THEN Undefined("meta-field")
  ELSE IF T.kind \notin {"OBJECT", "INTERFACE"} THEN Raise("kind")
  ELSE IF ~TS!HasField(T, fieldName) THEN Raise("field")
  ELSE IF TS!HasArg(TS!FieldNamed(T, fieldName).args, argumentName)
  THEN Found("argument", <<typeName, fieldName, argumentName>>)
  ELSE Nothing

\* DirectiveCoordinate :: @ Name
\*   2. Return the directive in {schema} named {directiveName} if it exists.
ResolveDirective(S, directiveName) ==
  IF UndefinedDirective(S, directiveName) # "" THEN Undefined(UndefinedDirective(S, directiveName))
  ELSE IF DirectiveExists(S, directiveName) THEN Found("directive", <<directiveName>>) ELSE Nothing

\* DirectiveArgumentCoordinate :: @ Name ( Name : )
\*   3. Assert: {directive} must exist.
\*   5. Return the argument of {directive} named {directiveArgumentName} if
\*      it exists.
ResolveDirectiveArgument(S, directiveName, argumentName) ==
  IF UndefinedDirective(S, directiveName) # "" THEN Undefined(UndefinedDirective(S, directiveName))
  ELSE IF ~DirectiveExists(S, directiveName) THEN Raise("directive")
  ELSE IF argumentName \in DirectiveArgNames(S, directiveName)
  THEN Found("directiveArgument", <<directiveName, argumentName>>)
  ELSE Nothing

\* "a schema coordinate must be interpreted in the context of a GraphQL
\* {schema}". parsed must be ok.
Resolve(S, parsed) ==
  LET n == parsed.names IN
  CASE parsed.kind = "type" -> ResolveType(S, n[1])
    [] parsed.kind = "member" -> ResolveMember(S, n[1], n[2])
    [] parsed.kind = "argument" -> ResolveArgument(S, n[1], n[2], n[3])
    [] parsed.kind = "directive" -> ResolveDirective(S, n[1])
    [] OTHER -> ResolveDirectiveArgument(S, n[1], n[2])

-----------------------------------------------------------------------------
(* Every schema element, and its coordinate *)

ObjectLike(S) == {T \in TS!Range(S.types) : T.kind \in {"OBJECT", "INTERFACE"}}
DirectiveNames(S) == {n \in TS!Range(TS!NamesOf(S.directives)) \cup DOMAIN BuiltinDirectiveArgs : DirectiveExists(S, n)}

\* "A schema element can be a named type, a field, an input field, an enum
\* value, a field argument, a directive, or a directive argument defined
\* within a schema (including built-in types and directives)." Meta-fields
\* and introspection types aren't.
Elements(S) ==
  {Element("type", <<S.types[i].name>>) : i \in DOMAIN S.types}
  \cup {Element("type", <<n>>) : n \in TS!BuiltinScalarNames \cap ReferencedTypeNames(S)}
  \cup UNION {{Element("field", <<T.name, T.fields[k].name>>) : k \in DOMAIN T.fields} : T \in ObjectLike(S)}
  \cup UNION {UNION {{Element("argument", <<T.name, T.fields[k].name, T.fields[k].args[j].name>>) : j \in DOMAIN T.fields[k].args}
                     : k \in DOMAIN T.fields} : T \in ObjectLike(S)}
  \cup UNION {{Element("inputField", <<T.name, T.inputFields[k].name>>) : k \in DOMAIN T.inputFields} : T \in TS!Range(S.types)}
  \cup UNION {{Element("enumValue", <<T.name, T.values[k].name>>) : k \in DOMAIN T.values} : T \in TS!Range(S.types)}
  \cup {Element("directive", <<n>>) : n \in DirectiveNames(S)}
  \cup UNION {{Element("directiveArgument", <<n, a>>) : a \in DirectiveArgNames(S, n)} : n \in DirectiveNames(S)}

\* The schema coordinate of an element, as text.
CoordinateText(e) ==
  CASE e.kind = "type" -> e.path[1]
    [] e.kind \in {"field", "inputField", "enumValue"} -> e.path[1] \o "." \o e.path[2]
    [] e.kind = "argument" -> e.path[1] \o "." \o e.path[2] \o "(" \o e.path[3] \o ":)"
    [] e.kind = "directive" -> "@" \o e.path[1]
    [] OTHER -> "@" \o e.path[1] \o "(" \o e.path[2] \o ":)"

CoordinateOf(e) == L!Text(CoordinateText(e))

-----------------------------------------------------------------------------
(* A schema to check the properties on: §2.14's example schema, with an    *)
(* interface, a union, a custom scalar and the use of @deprecated added.   *)
(*                                                                         *)
(*   type Query {                                                          *)
(*     searchBusiness(criteria: SearchCriteria!): [Business]               *)
(*     node(id: ID!): Node                                                 *)
(*   }                                                                     *)
(*   input SearchCriteria { name: String filter: SearchFilter }            *)
(*   enum SearchFilter { OPEN_NOW DELIVERS_TAKEOUT VEGETARIAN_MENU }       *)
(*   interface Node { id: ID! }                                            *)
(*   type Business implements Node {                                       *)
(*     id: ID! name: String                                                *)
(*     email: String @private(scope: "loggedIn")                           *)
(*     old: String @deprecated                                             *)
(*   }                                                                     *)
(*   union Result = Business                                               *)
(*   scalar Date                                                           *)
(*   directive @private(scope: String!) on FIELD_DEFINITION                *)
(***************************************************************************)

Ty(kind, name) == TS!TypeDef(kind, name, <<>>, <<>>, <<>>, <<>>, <<>>, <<>>, FALSE, <<>>, {})
In(name, type, wrappers) ==
  [name |-> name, description |-> <<>>, type |-> TS!Ref(type, wrappers), default |-> <<>>, deprecated |-> <<>>]
Fd(name, args, type, wrappers) ==
  [name |-> name, description |-> <<>>, args |-> args, type |-> TS!Ref(type, wrappers), deprecated |-> <<>>]
Ev(name) == [name |-> name, description |-> <<>>, deprecated |-> <<>>]

Example == [
  description |-> <<>>,
  types |-> <<
    [Ty("OBJECT", "Query") EXCEPT !.fields = <<
       Fd("searchBusiness", <<In("criteria", "SearchCriteria", <<"nonNull">>)>>, "Business", <<"list">>),
       Fd("node", <<In("id", "ID", <<"nonNull">>)>>, "Node", <<>>)>>],
    [Ty("INPUT_OBJECT", "SearchCriteria") EXCEPT !.inputFields = <<
       In("name", "String", <<>>), In("filter", "SearchFilter", <<>>)>>],
    [Ty("ENUM", "SearchFilter") EXCEPT !.values = <<Ev("OPEN_NOW"), Ev("DELIVERS_TAKEOUT"), Ev("VEGETARIAN_MENU")>>],
    [Ty("INTERFACE", "Node") EXCEPT !.fields = <<Fd("id", <<>>, "ID", <<"nonNull">>)>>],
    [Ty("OBJECT", "Business") EXCEPT
       !.fields = <<Fd("id", <<>>, "ID", <<"nonNull">>), Fd("name", <<>>, "String", <<>>),
                    Fd("email", <<>>, "String", <<>>),
                    [Fd("old", <<>>, "String", <<>>) EXCEPT !.deprecated = <<"No longer supported">>]>>,
       !.interfaces = <<"Node">>, !.directives = {"private", "deprecated"}],
    [Ty("UNION", "Result") EXCEPT !.members = <<"Business">>],
    Ty("SCALAR", "Date")
  >>,
  directives |-> <<[name |-> "private", description |-> <<>>, args |-> <<In("scope", "String", <<"nonNull">>)>>,
                    repeatable |-> FALSE, locations |-> <<"FIELD_DEFINITION">>, deprecated |-> <<>>, directives |-> {}]>>,
  schemaDef |-> FALSE,
  operations |-> <<>>
]

ParseText(s) == Parse(L!Text(s))
ResolveText(s) == Resolve(Example, ParseText(s))

\* The same path with its k-th name replaced by one Example doesn't use.
Missing == "missing"
WithName(e, k) == [e EXCEPT !.path[k] = Missing]

-----------------------------------------------------------------------------
(* Properties over every element of Example *)

\* "A schema coordinate is always unique. Each schema element can be
\* referenced by exactly one possible schema coordinate": every element's
\* coordinate parses, and resolves to that element ...
EveryElementResolvesFromItsCoordinate ==
  vector = 0 =>
    \A e \in Elements(Example) :
      LET p == Parse(CoordinateOf(e)) IN p.ok /\ Resolve(Example, p) = Found(e.kind, e.path)

\* ... no two elements share one ...
CoordinatesAreUnique ==
  vector = 0 => \A e, f \in Elements(Example) : e # f => CoordinateOf(e) # CoordinateOf(f)

\* ... and "This ensures that every schema coordinates has a single
\* unambiguous and unique lexical form": the coordinate with any Ignored
\* inserted anywhere doesn't parse.
IgnoredSamples == <<<<L!Space>>, <<L!Tab>>, <<L!LF>>, <<L!Comma>>, <<L!BOM>>, <<L!Hash>>>>
Insert(s, k, x) == SubSeq(s, 1, k - 1) \o x \o SubSeq(s, k, Len(s))
CoordinatesHaveOneLexicalForm ==
  vector = 0 =>
    \A e \in Elements(Example) :
      LET c == CoordinateOf(e) IN
      \A k \in 1..(Len(c) + 1), x \in TS!Range(IgnoredSamples) : ~Parse(Insert(c, k, x)).ok

\* "If the schema element cannot be found, the resolve function will not
\* yield a value (without raising an error)": an element's coordinate with
\* its last name replaced by one the schema doesn't have resolves to none.
MissingLeavesYieldNothing ==
  vector = 0 =>
    \A e \in Elements(Example) :
      Resolve(Example, Parse(CoordinateOf(WithName(e, Len(e.path))))) = Nothing

\* "However, an error will be raised if any non-leaf nodes within a schema
\* coordinate cannot be found in the schema": with any other name
\* replaced, it raises an error.
MissingContainersRaise ==
  vector = 0 =>
    \A e \in Elements(Example) :
      \A k \in 1..(Len(e.path) - 1) :
        Resolve(Example, Parse(CoordinateOf(WithName(e, k)))).outcome = "error"

-----------------------------------------------------------------------------
(* Hand-written vectors: §2.14's table, and the edges around it *)

Accepts(s, kind, names) == [source |-> L!Text(s), expected |-> Parsed(TRUE, kind, names, "")]
Rejects(src, reason) == [source |-> src, expected |-> Parsed(FALSE, "", <<>>, reason)]
RejectsText(s, reason) == Rejects(L!Text(s), reason)

SyntaxVectors == <<
  \* §2.14's examples
  Accepts("Business", "type", <<"Business">>),
  Accepts("Business.name", "member", <<"Business", "name">>),
  Accepts("SearchCriteria.filter", "member", <<"SearchCriteria", "filter">>),
  Accepts("Query.searchBusiness(criteria:)", "argument", <<"Query", "searchBusiness", "criteria">>),
  Accepts("@private", "directive", <<"private">>),
  Accepts("@private(scope:)", "directiveArgument", <<"private", "scope">>),
  \* Names are Lexer.tla's: keywords, underscores and digits after the first.
  Accepts("true", "type", <<"true">>),
  Accepts("_a1.__b(c_:)", "argument", <<"_a1", "__b", "c_">>),
  \* No Ignored anywhere: whitespace, line terminators, commas, comments, BOM.
  RejectsText(" Business", "ignored"),
  RejectsText("Business ", "ignored"),
  RejectsText("Business. name", "ignored"),
  RejectsText("Query.f(x: )", "ignored"),
  RejectsText("@ private", "ignored"),
  RejectsText("Business\n", "ignored"),
  RejectsText("Business,", "ignored"),
  RejectsText("Business#c", "ignored"),
  Rejects(<<L!BOM>> \o L!Text("Business"), "ignored"),
  \* Characters no token starts with.
  RejectsText("$x", "token"),
  RejectsText("\"Business\"", "token"),
  RejectsText("1a", "token"),
  RejectsText("Business!", "token"),
  Rejects(L!Text("a") \o <<233>>, "token"),
  Rejects(<<55296>>, "sourceCharacter"),
  \* Tokens that match no production.
  RejectsText("", "grammar"),
  RejectsText("Query.f(x)", "grammar"),
  RejectsText("Query.f(x:", "grammar"),
  RejectsText("Query.f()", "grammar"),
  RejectsText("Query.f(x:y:)", "grammar"),
  RejectsText("@private.scope", "grammar"),
  RejectsText("Query.f.g", "grammar"),
  RejectsText(".name", "grammar"),
  RejectsText("@", "grammar"),
  RejectsText("Query(x:)", "grammar"),
  RejectsText("@a.b(c:)", "grammar"),
  RejectsText("a..b", "grammar"),
  RejectsText("@@a", "grammar")
>>

RIn(S, s, result) == [schema |-> S, coordinate |-> s, expected |-> result]
R(s, result) == RIn(Example, s, result)

\* type Query { a: Int }: nothing deprecated, no custom scalar, no OneOf
\* input object. With a OneOf input object: OneOfSchema.
Plain == [Example EXCEPT !.types = <<[Ty("OBJECT", "Query") EXCEPT !.fields = <<Fd("a", <<>>, "Int", <<>>)>>]>>,
                         !.directives = <<>>]
OneOfSchema ==
  [Plain EXCEPT !.types = @ \o <<[Ty("INPUT_OBJECT", "W") EXCEPT !.inputFields = <<In("a", "Int", <<>>)>>, !.oneOf = TRUE]>>]
NotProvided == Undefined("built-in directive not provided")

ResolutionVectors == <<
  R("Business", Found("type", <<"Business">>)),
  R("Business.name", Found("field", <<"Business", "name">>)),
  R("SearchCriteria.filter", Found("inputField", <<"SearchCriteria", "filter">>)),
  R("SearchFilter.OPEN_NOW", Found("enumValue", <<"SearchFilter", "OPEN_NOW">>)),
  R("Query.searchBusiness(criteria:)", Found("argument", <<"Query", "searchBusiness", "criteria">>)),
  R("@private", Found("directive", <<"private">>)),
  R("@private(scope:)", Found("directiveArgument", <<"private", "scope">>)),
  R("Node.id", Found("field", <<"Node", "id">>)),
  \* "may refer to either a defined or built-in schema element"
  R("String", Found("type", <<"String">>)),
  R("@deprecated(reason:)", Found("directiveArgument", <<"deprecated", "reason">>)),
  R("@include(if:)", Found("directiveArgument", <<"include", "if">>)),
  R("@skip", Found("directive", <<"skip">>)),
  \* Example deprecates a field and has the custom scalar Date, so §3.13 asks
  \* for @deprecated and @specifiedBy; it has no OneOf input object.
  R("@specifiedBy(url:)", Found("directiveArgument", <<"specifiedBy", "url">>)),
  R("@oneOf", NotProvided),
  R("@oneOf(x:)", NotProvided),
  RIn(Plain, "@deprecated", NotProvided),
  RIn(Plain, "@deprecated(reason:)", NotProvided),
  RIn(Plain, "@specifiedBy", NotProvided),
  RIn(Plain, "@oneOf", NotProvided),
  RIn(Plain, "@skip(if:)", Found("directiveArgument", <<"skip", "if">>)),
  RIn(Plain, "@include", Found("directive", <<"include">>)),
  RIn(OneOfSchema, "@oneOf", Found("directive", <<"oneOf">>)),
  RIn(OneOfSchema, "@oneOf(x:)", Nothing),
  RIn(OneOfSchema, "@deprecated", NotProvided),
  \* Not found: no value, no error.
  R("Unknown", Nothing),
  R("business", Nothing),
  R("Business.unknown", Nothing),
  R("SearchFilter.open_now", Nothing),
  R("Query.searchBusiness(unknown:)", Nothing),
  R("@unknown", Nothing),
  R("@private(unknown:)", Nothing),
  R("@deprecated(why:)", Nothing),
  \* A non-leaf node not found: an error.
  R("Unknown.x", Raise("type")),
  R("Unknown.x(y:)", Raise("type")),
  R("Query.unknown(x:)", Raise("field")),
  R("@unknown(x:)", Raise("directive")),
  \* The Asserts on the type's kind.
  R("Date.x", Raise("kind")),
  R("String.x", Raise("kind")),
  R("Result.Business", Raise("kind")),
  R("SearchCriteria.filter(x:)", Raise("kind")),
  R("SearchFilter.OPEN_NOW(x:)", Raise("kind")),
  R("Date.x(y:)", Raise("kind")),
  \* No defined behaviour.
  R("Business.__typename", Undefined("meta-field")),
  R("Result.__typename", Undefined("meta-field")),
  R("Query.__type(name:)", Undefined("meta-field")),
  R("__Type.fields(includeDeprecated:)", Undefined("introspection type")),
  R("__Schema", Undefined("introspection type")),
  R("Int", Undefined("unreferenced built-in scalar")),
  R("Boolean.x", Undefined("unreferenced built-in scalar"))
>>

\* Each initial state is one vector, so a counterexample names it: 0 for
\* the properties over every element, then the syntax vectors, then the
\* resolution vectors.
Init == vector \in 0..(Len(SyntaxVectors) + Len(ResolutionVectors))
Next == UNCHANGED vector

SyntaxVectorsPass ==
  vector \in 1..Len(SyntaxVectors) =>
    LET v == SyntaxVectors[vector] IN Parse(v.source) = v.expected

ResolutionVectorsPass ==
  vector > Len(SyntaxVectors) =>
    LET v == ResolutionVectors[vector - Len(SyntaxVectors)] IN Resolve(v.schema, ParseText(v.coordinate)) = v.expected
====
