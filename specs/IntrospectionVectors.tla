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
  \* §3.13: @skip and @include are SHOULDs, and @specifiedBy and @oneOf
  \* SHOULDs for a schema with a custom scalar or a OneOf input object.
  /\ RecommendedDirectiveNames(S) = {"skip", "include", "specifiedBy", "oneOf"}
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
\* A service's result e, without one of the built-in directives.
Leaving(e, name) ==
  [Actual(e) EXCEPT !.directives = Without(@, {name}, 1, <<>>),
                    !.builtinDirectiveNames = @ \ {name}]
JudgeWithout(name) == Mismatches(S, B, FALSE, TRUE, Leaving(Result(FALSE), name))

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
  \* Built-in descriptions are unspecified, and so is the description of a
  \* definition the document doesn't describe. One the document gives must
  \* be returned as it is.
  /\ Judge(EditType(Result(FALSE), "__Type", LAMBDA t : [t EXCEPT !.description = <<"x">>])) = {}
  /\ Judge(EditType(Result(FALSE), "Query", LAMBDA t : [t EXCEPT !.description = <<"x">>])) = {}
  /\ Judge(EditType(Result(FALSE), "Query", LAMBDA t : [t EXCEPT !.description = <<"">>])) = {}
  /\ Judge([Result(FALSE) EXCEPT !.description = <<"x">>]) = {"description"}
  /\ Judge([Result(FALSE) EXCEPT !.description = None]) = {"description"}
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
  /\ JudgeWithout("deprecated") = {"required directives"}

-----------------------------------------------------------------------------
(* §3.13: "all provided directives, including any built-in directive, must *)
(* be included in the set of returned directives"                         *)

NoURL(e) == EditType(e, "Date", LAMBDA t : [t EXCEPT !.specifiedByURL = None])
NotOneOf(e) == EditType(e, "In", LAMBDA t : [t EXCEPT !.isOneOf = Some(FALSE)])

ProvidedDirectivesAreRequired == ~done =>
  \* Date's specifiedByURL shows @specifiedBy is provided, and In's isOneOf
  \* that @oneOf is.
  /\ RequiredDirectiveNames(S, Actual(Result(FALSE))) = {"deprecated", "specifiedBy", "oneOf"}
  /\ RequiredDirectiveNames(S, Actual(NoURL(NotOneOf(Result(FALSE))))) = {"deprecated"}
  /\ RequiredDirectiveNames(Plain, Actual(SchemaResult(Plain, B, FALSE))) = {}
  \* So leaving either out of directives breaks a MUST, and only that: the
  \* URL and isOneOf the result shows are still compared with the
  \* document's.
  /\ JudgeWithout("specifiedBy") = {"required directives"}
  /\ JudgeWithout("oneOf") = {"required directives"}
  /\ Mismatches(S, B, FALSE, TRUE,
       Leaving(EditType(Result(FALSE), "Date", LAMBDA t : [t EXCEPT !.specifiedByURL = Some("v")]), "specifiedBy"))
     = {"required directives", "type Date"}
  \* A service that provides neither needn't: Date has no URL, and In isn't
  \* OneOf. That leaves only §3.13's SHOULDs.
  /\ Mismatches(S, B, FALSE, TRUE, Leaving(NoURL(Result(FALSE)), "specifiedBy")) = {}
  /\ Mismatches(S, B, FALSE, TRUE, Leaving(NotOneOf(Result(FALSE)), "oneOf")) = {}
  \* One that provides them must represent them.
  /\ Judge(NoURL(Result(FALSE))) = {"type Date"}
  /\ Judge(NotOneOf(Result(FALSE))) = {"type In"}

-----------------------------------------------------------------------------
(* §4.2.2 List and Non-Null: "All other fields must return null."         *)

NullWrapper(kind) ==
  [kind |-> kind, name |-> None, description |-> None, specifiedByURL |-> None,
   isOneOf |-> None, fields |-> None, interfaces |-> None, possibleTypes |-> None,
   enumValues |-> None, inputFields |-> None]

WrappersHaveOnlyKindAndOfType == ~done =>
  /\ WrapperMatches(NullWrapper("LIST"))
  /\ WrapperMatches(NullWrapper("NON_NULL"))
  /\ ~WrapperMatches(NullWrapper("OBJECT"))
  /\ ~WrapperMatches([NullWrapper("LIST") EXCEPT !.name = Some("Int")])
  /\ ~WrapperMatches([NullWrapper("NON_NULL") EXCEPT !.description = Some("x")])
  /\ ~WrapperMatches([NullWrapper("LIST") EXCEPT !.specifiedByURL = Some("u")])
  /\ ~WrapperMatches([NullWrapper("LIST") EXCEPT !.isOneOf = Some(FALSE)])
  /\ ~WrapperMatches([NullWrapper("NON_NULL") EXCEPT !.fields = Some(<<>>)])
  /\ ~WrapperMatches([NullWrapper("LIST") EXCEPT !.interfaces = Some(<<>>)])
  /\ ~WrapperMatches([NullWrapper("LIST") EXCEPT !.possibleTypes = Some(<<>>)])
  /\ ~WrapperMatches([NullWrapper("LIST") EXCEPT !.enumValues = Some(<<>>)])
  /\ ~WrapperMatches([NullWrapper("LIST") EXCEPT !.inputFields = Some(<<>>)])

\* The answer the wrapper types are read from: __type(name: "__Schema")'s
\* fields, each with its type as a ref.
SchemaFieldsOf(B0) ==
  LET fs == TypeNamed(B0, "__Schema").fields IN
  [i \in DOMAIN fs |-> [name |-> fs[i].name, type |-> RefResult(B0, fs[i].type)]]

SchemaFieldsAreAnswered == ~done =>
  /\ SchemaFieldsMatch(B, SchemaFieldsOf(B))
  /\ SchemaFieldsMatch(Oct2021Builtins, SchemaFieldsOf(Oct2021Builtins))
  /\ SchemaFieldsMatch(B, Reverse(SchemaFieldsOf(B)))
  \* A field of the service's own is allowed.
  /\ SchemaFieldsMatch(B, Append(SchemaFieldsOf(B), [name |-> "extra", type |-> NamedChain("SCALAR", "Int")]))
  \* An empty or partial answer, a duplicate, or a lost wrapper is not.
  /\ ~SchemaFieldsMatch(B, <<>>)
  /\ ~SchemaFieldsMatch(B, Tail(SchemaFieldsOf(B)))
  /\ ~SchemaFieldsMatch(B, Append(SchemaFieldsOf(B), SchemaFieldsOf(B)[2]))
  /\ ~SchemaFieldsMatch(B, [SchemaFieldsOf(B) EXCEPT ![2].type = NamedChain("OBJECT", "__Type")])

-----------------------------------------------------------------------------
(* The October 2021 edition *)

B21 == Oct2021Builtins
\* S without what October 2021 can't express: the deprecated argument y,
\* input field q and directive argument s, and In's @oneOf.
S21 == [S EXCEPT !.types[1].fields[3].args[2].deprecated = <<>>,
                 !.types[9].inputFields[2].deprecated = <<>>,
                 !.types[9].oneOf = FALSE,
                 !.directives[1].args[2].deprecated = <<>>]
R21(inc) == SchemaResult(S21, B21, inc)
TypeOf21(name) == ByName(R21(FALSE).types, Some(name))
Actual21(e) ==
  [description |-> e.description, queryType |-> e.queryType,
   mutationType |-> e.mutationType, subscriptionType |-> e.subscriptionType,
   types |-> e.types, directives |-> e.directives,
   builtinTypeNames |-> {n \in TypeNames(S21, B21) : IsBuiltinTypeName(n)},
   builtinDirectiveNames |-> BuiltinDirectiveNames(B21)]
InputValuesOf(t) ==
  (IF t.inputFields = None THEN {} ELSE Range(t.inputFields[1]))
  \cup (IF t.fields = None THEN {} ELSE UNION {Range(f.args) : f \in Range(t.fields[1])})

\* October 2021's §4.2 and §3.13.
Oct2021BuiltinsFollowTheEdition == ~done =>
  /\ Names(R21(FALSE).directives) = <<"d", "skip", "include", "deprecated", "specifiedBy">>
  /\ LET dep == ByName(R21(FALSE).directives, "deprecated") IN
     /\ Range(dep.locations) = {"FIELD_DEFINITION", "ENUM_VALUE"}
     /\ dep.args[1].type = <<Ref1("SCALAR", "String")>>
     /\ dep.args[1].defaultValue = Some(Value("string", "No longer supported", <<>>, <<>>))
  /\ Len(TypeOf21("__DirectiveLocation").enumValues[1]) = 19
  /\ "DIRECTIVE_DEFINITION" \notin Range(Names(TypeOf21("__DirectiveLocation").enumValues[1]))
  /\ Names(TypeOf21("__Type").fields[1])
       = <<"kind", "name", "description", "fields", "interfaces", "possibleTypes",
           "enumValues", "inputFields", "ofType", "specifiedByURL">>
  /\ Names(TypeOf21("__InputValue").fields[1]) = <<"name", "description", "type", "defaultValue">>
  /\ Names(TypeOf21("__Directive").fields[1]) = <<"name", "description", "locations", "args", "isRepeatable">>
  \* "includeDeprecated: Boolean = false" on __Type.fields and enumValues,
  \* and no argument anywhere else.
  /\ \A t \in {"__Type", "__Field", "__Directive", "__Schema"} :
       \A f \in Range(TypeOf21(t).fields[1]) :
         IF t = "__Type" /\ f.name \in {"fields", "enumValues"}
         THEN /\ Names(f.args) = <<"includeDeprecated">>
              /\ f.args[1].type = <<Ref1("SCALAR", "Boolean")>>
         ELSE f.args = <<>>

\* What the kit's October 2021 profile relies on.
Oct2021ProfileIsSound == ~done =>
  /\ IsValidSchema(S21)
  /\ IsOct2021Schema(S21)
  \* Each draft-only feature on its own puts a schema out of reach.
  /\ ~IsOct2021Schema([S21 EXCEPT !.types[9].oneOf = TRUE])
  /\ ~IsOct2021Schema([S21 EXCEPT !.types[9].inputFields[2].deprecated = <<"x">>])
  /\ ~IsOct2021Schema([S21 EXCEPT !.types[1].fields[3].args[2].deprecated = <<"x">>])
  /\ ~IsOct2021Schema([S21 EXCEPT !.directives[1].args[2].deprecated = <<"x">>])
  /\ ~IsOct2021Schema([S21 EXCEPT !.directives[1].deprecated = <<"x">>])
  \* For such a schema the fields only the draft has are fixed, so a query
  \* that doesn't select them loses nothing.
  /\ \A inc \in BOOLEAN :
       LET r == SchemaResult(S21, B21, inc) IN
       /\ \A t \in Range(r.types) : t.isOneOf = IF t.kind = "INPUT_OBJECT" THEN Some(FALSE) ELSE None
       /\ \A t \in Range(r.types) : \A v \in InputValuesOf(t) : ~v.isDeprecated /\ v.deprecationReason = None
       /\ \A d \in Range(r.directives) :
            /\ ~d.isDeprecated /\ d.deprecationReason = None
            /\ \A j \in DOMAIN d.args : ~d.args[j].isDeprecated /\ d.args[j].deprecationReason = None
  \* An October 2021 result matches October 2021's definitions, and not the
  \* draft's.
  /\ Mismatches(S21, B21, FALSE, TRUE, Actual21(R21(FALSE))) = {}
  /\ Mismatches(S21, B21, TRUE, TRUE, Actual21(R21(TRUE))) = {}
  /\ Mismatches(S21, B, FALSE, TRUE, Actual21(R21(FALSE))) # {}
====
