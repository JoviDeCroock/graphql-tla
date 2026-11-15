---- MODULE IntrospectionVectors ----
(***************************************************************************)
(* Hand-written vectors for Introspection.tla: the __schema result of one  *)
(* schema, checked field by field against §4.2, and how Mismatches judges  *)
(* a service's result. scripts/check.mjs checks this module, and the       *)
(* mutants in introspection.mutants.mjs each break one of its properties.  *)
(*                                                                         *)
(* The schema, in SDL:                                                     *)
(*                                                                         *)
(*   """The schema"""                                                      *)
(*   schema { query: Query mutation: M }                                   *)
(*   type Query {                                                          *)
(*     a: Int                                                              *)
(*     old: String @deprecated(reason: "gone")                             *)
(*     f(x: [Int!]!, y: Int @deprecated): Node                             *)
(*     g(r: Float = 1): Int                                                *)
(*   }                                                                     *)
(*   type M { a: Int }                                                     *)
(*   interface Node { id: ID! }                                            *)
(*   interface Sub implements Node { id: ID! }                             *)
(*   type A implements Node { id: ID! }                                    *)
(*   type B implements Sub & Node { id: ID! }                              *)
(*   union U = B | A                                                       *)
(*   enum E { X Y @deprecated }                                            *)
(*   input In @oneOf { p: Int q: String @deprecated }                      *)
(*   scalar Date @specifiedBy(url: "u")                                    *)
(*   directive @d(r: Int = 1, s: Int @deprecated) repeatable on FIELD | QUERY *)
(***************************************************************************)
EXTENDS Introspection

-----------------------------------------------------------------------------
(* Building schema data *)

T(name, wrappers) == Ref(name, wrappers)
IntV(text) == Value("int", text, <<>>, <<>>)

IV(name, type) ==
  [name |-> name, description |-> <<>>, type |-> type, default |-> <<>>, deprecated |-> <<>>]
IVD(name, type, default) == [IV(name, type) EXCEPT !.default = <<default>>]
Deprecated(x, reason) == [x EXCEPT !.deprecated = <<reason>>]
Fd(name, args, type) ==
  [name |-> name, description |-> <<>>, args |-> args, type |-> type, deprecated |-> <<>>]
Ty(kind, name, fields, interfaces) ==
  TypeDef(kind, name, <<>>, fields, interfaces, <<>>, <<>>, <<>>, FALSE, <<>>, {})
Id == <<Fd("id", <<>>, T("ID", <<"nonNull">>))>>

Doc == <<
  Ty("OBJECT", "Query", <<
    Fd("a", <<>>, T("Int", <<>>)),
    Deprecated(Fd("old", <<>>, T("String", <<>>)), "gone"),
    Fd("f", <<IV("x", T("Int", <<"nonNull", "list", "nonNull">>)),
              Deprecated(IV("y", T("Int", <<>>)), "No longer supported")>>,
        T("Node", <<>>)),
    Fd("g", <<IVD("r", T("Float", <<>>), IntV("1"))>>, T("Int", <<>>))>>, <<>>),
  Ty("OBJECT", "M", <<Fd("a", <<>>, T("Int", <<>>))>>, <<>>),
  Ty("INTERFACE", "Node", Id, <<>>),
  Ty("INTERFACE", "Sub", Id, <<"Node">>),
  Ty("OBJECT", "A", Id, <<"Node">>),
  Ty("OBJECT", "B", Id, <<"Sub", "Node">>),
  [Ty("UNION", "U", <<>>, <<>>) EXCEPT !.members = <<"B", "A">>],
  [Ty("ENUM", "E", <<>>, <<>>) EXCEPT !.values =
     <<[name |-> "X", description |-> <<>>, deprecated |-> <<>>],
       [name |-> "Y", description |-> <<>>, deprecated |-> <<"No longer supported">>]>>],
  [Ty("INPUT_OBJECT", "In", <<>>, <<>>) EXCEPT
     !.inputFields = <<IV("p", T("Int", <<>>)),
                       Deprecated(IV("q", T("String", <<>>)), "No longer supported")>>,
     !.oneOf = TRUE],
  [Ty("SCALAR", "Date", <<>>, <<>>) EXCEPT !.specifiedBy = <<"u">>]
>>

S == [description |-> <<"The schema">>, types |-> Doc,
      directives |-> <<[name |-> "d", description |-> <<>>,
                        args |-> <<IVD("r", T("Int", <<>>), IntV("1")),
                                   Deprecated(IV("s", T("Int", <<>>)), "No longer supported")>>,
                        repeatable |-> TRUE, locations |-> <<"FIELD", "QUERY">>,
                        deprecated |-> <<>>, directives |-> {}]>>,
      schemaDef |-> TRUE,
      operations |-> <<[operation |-> "query", type |-> "Query"],
                       [operation |-> "mutation", type |-> "M"]>>]

B == SpecBuiltins
\* A schema with nothing to deprecate, no custom scalar and no OneOf input.
Plain == [S EXCEPT !.types = <<Ty("OBJECT", "Query", <<Fd("a", <<>>, T("Int", <<>>))>>, <<>>)>>,
                   !.directives = <<>>]
FS == Full(S, B)

Result(inc) == SchemaResult(S, B, inc)
TypeOf(inc, name) == ByName(Result(inc).types, Some(name))
FieldOf(inc, type, name) == ByName(TypeOf(inc, type).fields[1], name)
Names(seq) == [i \in DOMAIN seq |-> seq[i].name]
Ref1(kind, name) == [kind |-> kind, name |-> Some(name)]
NonNull == [kind |-> "NON_NULL", name |-> None]
List == [kind |-> "LIST", name |-> None]
\* A named type as an ofType chain of one.
NamedChain(kind, name) == <<Ref1(kind, name)>>

VARIABLE done
Init == done = FALSE
Next == UNCHANGED done

-----------------------------------------------------------------------------
(* __Schema *)

\* "types must return the set of all named types contained within this
\* schema", with "all referenced built-in scalars" and no others.
TypesAreTheNamedTypes == ~done =>
  /\ IsValidSchema(S)
  /\ TypeNames(S, B) = Range(NamesOf(Doc)) \cup IntrospectionTypeNames
                       \cup {"Int", "Float", "String", "ID", "Boolean"}
  \* Without g, nothing refers to Float.
  /\ LET S2 == [S EXCEPT !.types[1].fields = SubSeq(@, 1, 3)] IN
     "Float" \notin TypeNames(S2, B) /\ "Boolean" \in TypeNames(S2, B)
  /\ Len(Result(FALSE).types) = Cardinality(TypeNames(S, B))

RootsAreReported == ~done =>
  /\ Result(FALSE).queryType = Some(NamedChain("OBJECT", "Query"))
  /\ Result(FALSE).mutationType = Some(NamedChain("OBJECT", "M"))
  /\ Result(FALSE).subscriptionType = None
  /\ Result(FALSE).description = <<"The schema">>
  \* Without a schema definition, M isn't a root: the default names apply.
  /\ SchemaResult([S EXCEPT !.schemaDef = FALSE], B, FALSE).mutationType = None

-----------------------------------------------------------------------------
(* __Type *)

\* "ofType ... Type modifiers are used to modify the type presented in the
\* field ofType": [Int!]! is NON_NULL of LIST of NON_NULL of Int.
TypeRefsAreOfTypeChains == ~done =>
  /\ ByName(FieldOf(FALSE, "Query", "f").args, "x").type
       = <<NonNull, List, NonNull, Ref1("SCALAR", "Int")>>
  /\ FieldOf(FALSE, "Query", "f").type = <<Ref1("INTERFACE", "Node")>>
  /\ ByName(TypeOf(FALSE, "__Type").fields[1], "fields").type
       = <<List, NonNull, Ref1("OBJECT", "__Field")>>

\* Each kind has its own fields; "All other fields must return null."
FieldsFollowTheKind == ~done =>
  /\ LET q == TypeOf(FALSE, "Query") IN
     /\ q.kind = "OBJECT" /\ q.interfaces = Some(<<>>)
     /\ q.possibleTypes = None /\ q.enumValues = None /\ q.inputFields = None
     /\ q.isOneOf = None /\ q.specifiedByURL = None
  /\ TypeOf(FALSE, "B").interfaces = Some(<<NamedChain("INTERFACE", "Sub"), NamedChain("INTERFACE", "Node")>>)
  /\ TypeOf(FALSE, "Sub").interfaces = Some(<<NamedChain("INTERFACE", "Node")>>)
  \* An interface's possibleTypes are the objects that implement it, not
  \* the interfaces.
  /\ Range(TypeOf(FALSE, "Node").possibleTypes[1]) = {NamedChain("OBJECT", "A"), NamedChain("OBJECT", "B")}
  /\ Range(TypeOf(FALSE, "Sub").possibleTypes[1]) = {NamedChain("OBJECT", "B")}
  /\ TypeOf(FALSE, "U").possibleTypes = Some(<<NamedChain("OBJECT", "B"), NamedChain("OBJECT", "A")>>)
  /\ TypeOf(FALSE, "U").fields = None /\ TypeOf(FALSE, "U").interfaces = None
  /\ TypeOf(FALSE, "In").isOneOf = Some(TRUE)
  /\ TypeOf(FALSE, "In").fields = None
  /\ TypeOf(FALSE, "Date").specifiedByURL = Some("u")
  /\ TypeOf(FALSE, "Int").specifiedByURL = None
  /\ TypeOf(FALSE, "Date").isOneOf = None
  /\ TypeOf(FALSE, "E").enumValues # None /\ TypeOf(FALSE, "E").possibleTypes = None

\* fields, args, enumValues and inputFields accept includeDeprecated, which
\* "defaults to false. If true, deprecated ... are also returned."
DeprecatedAreFiltered == ~done =>
  /\ Names(TypeOf(FALSE, "Query").fields[1]) = <<"a", "f", "g">>
  /\ Names(TypeOf(TRUE, "Query").fields[1]) = <<"a", "old", "f", "g">>
  /\ FieldOf(TRUE, "Query", "old").isDeprecated
  /\ FieldOf(TRUE, "Query", "old").deprecationReason = <<"gone">>
  /\ ~FieldOf(TRUE, "Query", "a").isDeprecated
  /\ FieldOf(TRUE, "Query", "a").deprecationReason = None
  /\ Names(FieldOf(FALSE, "Query", "f").args) = <<"x">>
  /\ Names(FieldOf(TRUE, "Query", "f").args) = <<"x", "y">>
  /\ Names(TypeOf(FALSE, "E").enumValues[1]) = <<"X">>
  /\ Names(TypeOf(TRUE, "E").enumValues[1]) = <<"X", "Y">>
  /\ Names(TypeOf(FALSE, "In").inputFields[1]) = <<"p">>
  /\ Names(TypeOf(TRUE, "In").inputFields[1]) = <<"p", "q">>
  /\ Names(ByName(Result(FALSE).directives, "d").args) = <<"r">>
  /\ Names(ByName(Result(TRUE).directives, "d").args) = <<"r", "s">>

\* §4.2's __type(name:): the named type's entry in types, or null for a name
\* no type in the schema has.
TypeLookupFindsTheNamedType == ~done =>
  /\ \A inc \in BOOLEAN : \A n \in {"Query", "E", "In", "Node", "Float", "__TypeKind"} :
       TypeByName(S, B, inc, n) = Some(ByName(Result(inc).types, Some(n)))
  /\ TypeByName(S, B, FALSE, "Nope") = None
  \* Without g, nothing refers to Float, so the schema has no Float.
  /\ TypeByName([S EXCEPT !.types[1].fields = SubSeq(@, 1, 3)], B, FALSE, "Float") = None
  /\ TypeByNameMatches(S, B, TRUE, "E", TypeByName(S, B, TRUE, "E"))
  /\ ~TypeByNameMatches(S, B, TRUE, "E", TypeByName(S, B, FALSE, "E"))
  /\ ~TypeByNameMatches(S, B, TRUE, "Nope", TypeByName(S, B, TRUE, "E"))
  /\ ~TypeByNameMatches(S, B, TRUE, "E", None)

-----------------------------------------------------------------------------
(* §4.2's introspection schema and §3.13's built-in directives *)

BuiltinsFollowTheSpec == ~done =>
  /\ Names(Result(FALSE).directives) = <<"d", "skip", "include", "deprecated", "specifiedBy", "oneOf">>
  /\ LET d == ByName(Result(FALSE).directives, "d") IN
     d.isRepeatable /\ d.locations = <<"FIELD", "QUERY">>
  /\ LET reason == ByName(Result(FALSE).directives, "deprecated").args[1] IN
     /\ reason.type = <<NonNull, Ref1("SCALAR", "String")>>
     /\ reason.defaultValue = Some(Value("string", "No longer supported", <<>>, <<>>))
  \* "includeDeprecated: Boolean! = false" on every list that filters.
  /\ \A t \in {"__Type", "__Field", "__Directive", "__Schema"} :
       \A f \in Range(TypeOf(FALSE, t).fields[1]) :
         f.name \in {"fields", "enumValues", "inputFields", "args", "directives"} =>
           /\ Names(f.args) = <<"includeDeprecated">>
           /\ f.args[1].type = <<NonNull, Ref1("SCALAR", "Boolean")>>
  /\ "DIRECTIVE_DEFINITION" \in Range(Names(TypeOf(FALSE, "__DirectiveLocation").enumValues[1]))
  /\ Len(TypeOf(FALSE, "__DirectiveLocation").enumValues[1]) = 20
  /\ Names(TypeOf(FALSE, "__Type").fields[1])
       = <<"kind", "name", "description", "specifiedByURL", "fields", "interfaces",
           "possibleTypes", "enumValues", "inputFields", "ofType", "isOneOf">>
  \* __typename is a meta-field, not a field of any type.
  /\ \A t \in Range(Result(TRUE).types) :
       t.fields # None => "__typename" \notin Range(Names(t.fields[1]))
  \* §3.13: @deprecated is a MUST for a schema that deprecates something.
  \* @skip and @include are SHOULDs, and @specifiedBy and @oneOf SHOULDs for
  \* a schema with a custom scalar or a OneOf input object.
  /\ RequiredDirectiveNames(S) = {"deprecated"}
  /\ RecommendedDirectiveNames(S) = {"skip", "include", "specifiedBy", "oneOf"}
  /\ RequiredDirectiveNames(Plain) = {}
  /\ RecommendedDirectiveNames(Plain) = {"skip", "include"}

-----------------------------------------------------------------------------
(* Comparing a service's result *)

\* A service's result: the expected one, edited.
Actual(e) ==
  [description |-> e.description, queryType |-> e.queryType,
   mutationType |-> e.mutationType, subscriptionType |-> e.subscriptionType,
   types |-> e.types, directives |-> e.directives,
   builtinTypeNames |-> {n \in TypeNames(S, B) : IsBuiltinTypeName(n)},
   builtinDirectiveNames |-> BuiltinDirectiveNames(B)]
EditType(e, name, Edit(_)) ==
  [e EXCEPT !.types = [i \in DOMAIN @ |-> IF @[i].name = Some(name) THEN Edit(@[i]) ELSE @[i]]]
Reverse(seq) == [i \in DOMAIN seq |-> seq[Len(seq) + 1 - i]]
\* g is the third field when deprecated ones are excluded.
WithG(e, default) ==
  EditType(e, "Query", LAMBDA t :
    [t EXCEPT !.fields[1][3].args[1].defaultValue = <<default>>])
Judge(e) == Mismatches(S, B, FALSE, TRUE, Actual(e))
\* A service's result without one of the built-in directives.
JudgeWithout(name) ==
  Mismatches(S, B, FALSE, TRUE,
             [Actual(Result(FALSE)) EXCEPT !.directives = Without(@, {name}, 1, <<>>),
                                           !.builtinDirectiveNames = @ \ {name}])

ResultsAreJudged == ~done =>
  /\ Judge(Result(FALSE)) = {}
  /\ Mismatches(S, B, TRUE, TRUE, Actual(Result(TRUE))) = {}
  \* The wrong includeDeprecated
  /\ Mismatches(S, B, FALSE, TRUE, Actual(Result(TRUE))) # {}
  \* Fields are in source order; an interface's possibleTypes in any.
  /\ Judge(EditType(Result(FALSE), "Query", LAMBDA t : [t EXCEPT !.fields[1] = Reverse(@)]))
       = {"type Query"}
  /\ Judge(EditType(Result(FALSE), "Node", LAMBDA t : [t EXCEPT !.possibleTypes[1] = Reverse(@)])) = {}
  /\ Judge(EditType(Result(FALSE), "U", LAMBDA t : [t EXCEPT !.possibleTypes[1] = Reverse(@)]))
       = {"type U"}
  \* Default values match when they coerce to the same value: 1 and 1.0
  \* for a Float, but not "1".
  /\ Judge(WithG(Result(FALSE), Value("float", "1", <<>>, <<>>))) = {}
  /\ Judge(WithG(Result(FALSE), Value("string", "1", <<>>, <<>>))) = {"type Query"}
  \* Built-in descriptions are unspecified.
  /\ Judge(EditType(Result(FALSE), "__Type", LAMBDA t : [t EXCEPT !.description = <<"x">>])) = {}
  /\ Judge(EditType(Result(FALSE), "Query", LAMBDA t : [t EXCEPT !.description = <<"x">>])) = {"type Query"}
  \* Directive locations are a set.
  /\ Judge([Result(FALSE) EXCEPT !.directives[1].locations = Reverse(@)]) = {}
  /\ Judge([Result(FALSE) EXCEPT !.directives[1].isRepeatable = FALSE]) = {"directive d"}
  /\ Judge([Result(FALSE) EXCEPT !.mutationType = None]) = {"mutationType"}
  /\ "type names" \in Judge([Result(FALSE) EXCEPT !.types = Tail(@)])
  \* A built-in type's lists have no source order.
  /\ Judge(EditType(Result(FALSE), "__TypeKind", LAMBDA t : [t EXCEPT !.enumValues[1] = Reverse(@)])) = {}
  /\ Judge(EditType(Result(FALSE), "__Type", LAMBDA t : [t EXCEPT !.fields[1] = Reverse(@)])) = {}
  /\ Judge(EditType(Result(FALSE), "__TypeKind", LAMBDA t : [t EXCEPT !.enumValues[1] = Tail(@)])) = {"type __TypeKind"}
  \* A service may leave out a built-in directive, but not @deprecated when
  \* the schema deprecates something.
  /\ JudgeWithout("skip") = {}
  /\ JudgeWithout("oneOf") = {}
  /\ JudgeWithout("deprecated") = {"required directives"}
====
