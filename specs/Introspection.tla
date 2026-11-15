---- MODULE Introspection ----
(***************************************************************************)
(* Schema introspection, written by hand from the spec                     *)
(* (https://spec.graphql.org/draft/, §4.2 Schema Introspection): the       *)
(* `__schema` a service must return for schema data S (see TypeSystem.tla) *)
(* and the built-in definitions B it provides.                             *)
(*                                                                         *)
(* Results use these shapes. As in TypeSystem.tla, an optional value is a  *)
(* sequence of length 0 (null) or 1:                                       *)
(*   type ref      a sequence of [kind, name] from the outside in:         *)
(*                 [Int!] = <<[kind |-> "LIST", name |-> <<>>],            *)
(*                 [kind |-> "NON_NULL", name |-> <<>>],                   *)
(*                 [kind |-> "SCALAR", name |-> <<"Int">>]>>. This is the  *)
(*                 ofType chain, flattened.                                *)
(*   __Type        [kind, name, description, specifiedByURL, isOneOf,      *)
(*                  fields, inputFields, interfaces, enumValues,           *)
(*                  possibleTypes]                                         *)
(*   __Field       [name, description, args, type, isDeprecated,           *)
(*                  deprecationReason]                                     *)
(*   __InputValue  [name, description, type, defaultValue, isDeprecated,   *)
(*                  deprecationReason, ref]; defaultValue is a parsed      *)
(*                  literal (TypeSystem's value), ref the declared type    *)
(*   __EnumValue   [name, description, isDeprecated, deprecationReason]    *)
(*   __Directive   [name, description, isRepeatable, locations, args,      *)
(*                  isDeprecated, deprecationReason]                       *)
(*   __Schema      [description, queryType, mutationType,                  *)
(*                  subscriptionType, types, directives]                   *)
(*                                                                         *)
(* How a result from a service is compared with the expected one           *)
(* (Matches, at the end):                                                  *)
(*   - `types` is "the set of all named types": compared as a set, by name. *)
(*   - "Stable Ordering": "When a schema is produced from a                *)
(*     TypeSystemDocument, introspection should return items in the same   *)
(*     source order for each element list: object fields, input object    *)
(*     fields, arguments, enum values, directives, union member types, and *)
(*     implemented interfaces." Those lists are compared in order where   *)
(*     the document gives the order. Built-in types and directives have no *)
(*     source position: their lists are compared by name, and the built-in *)
(*     directives may come anywhere among the directives.                  *)
(*   - Built-in directives: a service may leave out any but the ones       *)
(*     §3.13 says it must provide (RequiredDirectiveNames). The result is  *)
(*     compared with SchemaResult for the built-ins it did return.         *)
(*   - An interface's `possibleTypes` and a directive's `locations` have   *)
(*     no source order, and are compared as sets.                          *)
(*   - The spec gives no descriptions for built-in definitions, so their   *)
(*     description may be anything (AnyDescription).                       *)
(*   - `defaultValue` "may return a String encoding (using the GraphQL     *)
(*     language) of the default value": two encodings match when they      *)
(*     coerce to the same value for the input value's type, so `[1]` and   *)
(*     `1` match for [Int], and `1` and `1.0` for Float.                   *)
(***************************************************************************)
EXTENDS TypeSystem

None == <<>>
Some(x) == <<x>>

\* A description the spec leaves to the service. A description from a
\* service is never a sequence of length 2.
AnyDescription == <<"*", "*">>

-----------------------------------------------------------------------------
(* Built-in definitions *)

NN(name) == Ref(name, <<"nonNull">>)
Named(name) == Ref(name, <<>>)
NNListOfNN(name) == Ref(name, <<"nonNull", "list", "nonNull">>)
ListOfNN(name) == Ref(name, <<"list", "nonNull">>)

BuiltinInputValue(name, type, default) ==
  [name |-> name, description |-> AnyDescription, type |-> type,
   default |-> default, deprecated |-> <<>>]
BuiltinField(name, args, type) ==
  [name |-> name, description |-> AnyDescription, args |-> args,
   type |-> type, deprecated |-> <<>>]
BuiltinObject(name, fields) ==
  TypeDef("OBJECT", name, AnyDescription, fields, <<>>, <<>>, <<>>, <<>>, FALSE, <<>>, {})
BuiltinEnum(name, values) ==
  TypeDef("ENUM", name, AnyDescription, <<>>, <<>>, <<>>,
          [i \in DOMAIN values |-> [name |-> values[i], description |-> AnyDescription,
                                    deprecated |-> <<>>]],
          <<>>, FALSE, <<>>, {})

\* "includeDeprecated: Boolean! = false"
IncludeDeprecatedArg ==
  BuiltinInputValue("includeDeprecated", NN("Boolean"),
                    Some(Value("boolean", "false", <<>>, <<>>)))

\* The schema introspection schema (§4.2 "Schema Introspection Schema").
IntrospectionTypes == <<
  BuiltinObject("__Schema", <<
    BuiltinField("description", <<>>, Named("String")),
    BuiltinField("types", <<>>, NNListOfNN("__Type")),
    BuiltinField("queryType", <<>>, NN("__Type")),
    BuiltinField("mutationType", <<>>, Named("__Type")),
    BuiltinField("subscriptionType", <<>>, Named("__Type")),
    BuiltinField("directives", <<IncludeDeprecatedArg>>, NNListOfNN("__Directive"))>>),
  BuiltinObject("__Type", <<
    BuiltinField("kind", <<>>, NN("__TypeKind")),
    BuiltinField("name", <<>>, Named("String")),
    BuiltinField("description", <<>>, Named("String")),
    BuiltinField("specifiedByURL", <<>>, Named("String")),
    BuiltinField("fields", <<IncludeDeprecatedArg>>, ListOfNN("__Field")),
    BuiltinField("interfaces", <<>>, ListOfNN("__Type")),
    BuiltinField("possibleTypes", <<>>, ListOfNN("__Type")),
    BuiltinField("enumValues", <<IncludeDeprecatedArg>>, ListOfNN("__EnumValue")),
    BuiltinField("inputFields", <<IncludeDeprecatedArg>>, ListOfNN("__InputValue")),
    BuiltinField("ofType", <<>>, Named("__Type")),
    BuiltinField("isOneOf", <<>>, Named("Boolean"))>>),
  BuiltinEnum("__TypeKind", <<"SCALAR", "OBJECT", "INTERFACE", "UNION", "ENUM",
                              "INPUT_OBJECT", "LIST", "NON_NULL">>),
  BuiltinObject("__Field", <<
    BuiltinField("name", <<>>, NN("String")),
    BuiltinField("description", <<>>, Named("String")),
    BuiltinField("args", <<IncludeDeprecatedArg>>, NNListOfNN("__InputValue")),
    BuiltinField("type", <<>>, NN("__Type")),
    BuiltinField("isDeprecated", <<>>, NN("Boolean")),
    BuiltinField("deprecationReason", <<>>, Named("String"))>>),
  BuiltinObject("__InputValue", <<
    BuiltinField("name", <<>>, NN("String")),
    BuiltinField("description", <<>>, Named("String")),
    BuiltinField("type", <<>>, NN("__Type")),
    BuiltinField("defaultValue", <<>>, Named("String")),
    BuiltinField("isDeprecated", <<>>, NN("Boolean")),
    BuiltinField("deprecationReason", <<>>, Named("String"))>>),
  BuiltinObject("__EnumValue", <<
    BuiltinField("name", <<>>, NN("String")),
    BuiltinField("description", <<>>, Named("String")),
    BuiltinField("isDeprecated", <<>>, NN("Boolean")),
    BuiltinField("deprecationReason", <<>>, Named("String"))>>),
  BuiltinObject("__Directive", <<
    BuiltinField("name", <<>>, NN("String")),
    BuiltinField("description", <<>>, Named("String")),
    BuiltinField("isRepeatable", <<>>, NN("Boolean")),
    BuiltinField("locations", <<>>, NNListOfNN("__DirectiveLocation")),
    BuiltinField("args", <<IncludeDeprecatedArg>>, NNListOfNN("__InputValue")),
    BuiltinField("isDeprecated", <<>>, NN("Boolean")),
    BuiltinField("deprecationReason", <<>>, Named("String"))>>),
  BuiltinEnum("__DirectiveLocation", <<
    "QUERY", "MUTATION", "SUBSCRIPTION", "FIELD", "FRAGMENT_DEFINITION",
    "FRAGMENT_SPREAD", "INLINE_FRAGMENT", "VARIABLE_DEFINITION", "SCHEMA",
    "SCALAR", "OBJECT", "FIELD_DEFINITION", "ARGUMENT_DEFINITION", "INTERFACE",
    "UNION", "ENUM", "ENUM_VALUE", "INPUT_OBJECT", "INPUT_FIELD_DEFINITION",
    "DIRECTIVE_DEFINITION">>)
>>

BuiltinDirective(name, args, locations) ==
  [name |-> name, description |-> AnyDescription, args |-> args,
   repeatable |-> FALSE, locations |-> locations, deprecated |-> <<>>,
   directives |-> {}]

\* §3.13's built-in directives. A service needn't provide all five:
\* RequiredDirectiveNames and RecommendedDirectiveNames below say which it
\* must and should provide, and Mismatches allows the others to be absent.
BuiltinDirectives == <<
  BuiltinDirective("skip", <<BuiltinInputValue("if", NN("Boolean"), None)>>,
                   <<"FIELD", "FRAGMENT_SPREAD", "INLINE_FRAGMENT">>),
  BuiltinDirective("include", <<BuiltinInputValue("if", NN("Boolean"), None)>>,
                   <<"FIELD", "FRAGMENT_SPREAD", "INLINE_FRAGMENT">>),
  BuiltinDirective("deprecated",
                   <<BuiltinInputValue("reason", NN("String"),
                       Some(Value("string", "No longer supported", <<>>, <<>>)))>>,
                   <<"FIELD_DEFINITION", "ARGUMENT_DEFINITION", "INPUT_FIELD_DEFINITION",
                     "ENUM_VALUE", "DIRECTIVE_DEFINITION">>),
  BuiltinDirective("specifiedBy", <<BuiltinInputValue("url", NN("String"), None)>>,
                   <<"SCALAR">>),
  BuiltinDirective("oneOf", <<>>, <<"INPUT_OBJECT">>)
>>

\* B, the built-in definitions a service provides. A differential can pass
\* a variant of these to state where an implementation departs from them.
SpecBuiltins == [types |-> IntrospectionTypes, directives |-> BuiltinDirectives]

BuiltinDirectiveNames(B) == Range(NamesOf(B.directives))
IsBuiltinTypeName(name) == name \in BuiltinScalarNames \cup IntrospectionTypeNames
IsBuiltinDirectiveName(name) == name \in BuiltinDirectiveNames(SpecBuiltins)

\* Whether S deprecates anything: a field, an argument, an input field, an
\* enum value or a directive.
Deprecates(S) ==
  \/ \E T \in Range(S.types) :
       \/ \E k \in DOMAIN T.fields :
            \/ IsDeprecated(T.fields[k])
            \/ \E j \in DOMAIN T.fields[k].args : IsDeprecated(T.fields[k].args[j])
       \/ \E k \in DOMAIN T.inputFields : IsDeprecated(T.inputFields[k])
       \/ \E k \in DOMAIN T.values : IsDeprecated(T.values[k])
  \/ \E D \in Range(S.directives) :
       IsDeprecated(D) \/ \E j \in DOMAIN D.args : IsDeprecated(D.args[j])

\* §3.13: "GraphQL implementations that support the type system definition
\* language must provide the @deprecated directive if representing
\* deprecated portions of the schema." Every schema here comes from the
\* type system definition language. No other built-in directive is a MUST.
RequiredDirectiveNames(S) == IF Deprecates(S) THEN {"deprecated"} ELSE {}

\* The built-in directives a service should provide for S: "GraphQL
\* implementations should provide the @skip and @include directives", and
\* implementations that support the type system definition language
\* "should provide the @specifiedBy directive if representing custom scalar
\* definitions" and "should provide the @oneOf directive if representing
\* OneOf Input Objects". Matches doesn't require these: it judges MUSTs.
RecommendedDirectiveNames(S) ==
  {"skip", "include"}
  \cup (IF \E T \in Range(S.types) : T.kind = "SCALAR" THEN {"specifiedBy"} ELSE {})
  \cup (IF \E T \in Range(S.types) : T.kind = "INPUT_OBJECT" /\ T.oneOf THEN {"oneOf"} ELSE {})

-----------------------------------------------------------------------------
(* The types in the schema *)

\* The schema as introspection sees it: the document's types and
\* directives, and the built-in ones.
Full(S, B) ==
  [S EXCEPT !.types = S.types \o B.types, !.directives = S.directives \o B.directives]

\* Every type named by a field, argument or input field anywhere.
ReferencedNames(S) ==
  UNION {{T.fields[k].type.name : k \in DOMAIN T.fields}
         \cup UNION {ArgTypeNames(T.fields[k].args) : k \in DOMAIN T.fields}
         \cup ArgTypeNames(T.inputFields) : T \in Range(S.types)}
  \cup UNION {ArgTypeNames(S.directives[i].args) : i \in DOMAIN S.directives}

\* `types` "must return the set of all named types contained within this
\* schema. Any named type which can be found through a field of any
\* introspection type must be included in this set." §3.5: "all referenced
\* built-in scalars must be included. If a built-in scalar type is not
\* referenced anywhere in a schema (there is no field, argument, or input
\* field of that type) then it must not be included."
TypeNames(S, B) ==
  Range(NamesOf(S.types)) \cup Range(NamesOf(B.types))
  \cup (BuiltinScalarNames \cap ReferencedNames(Full(S, B)))

-----------------------------------------------------------------------------
(* §4.2.2 The __Type Type *)

\* A type ref as an ofType chain: "Type modifiers are used to modify the
\* type presented in the field ofType."
RefResult(FS, type) ==
  [i \in 1..(Len(type.wrappers) + 1) |->
     IF i <= Len(type.wrappers)
     THEN [kind |-> IF type.wrappers[i] = "nonNull" THEN "NON_NULL" ELSE "LIST",
           name |-> None]
     ELSE [kind |-> KindOf(FS, type), name |-> Some(type.name)]]

NamedRef(FS, name) == RefResult(FS, Named(name))

\* A set as a sequence, in no particular order.
RECURSIVE SetToSeq(_)
SetToSeq(set) ==
  IF set = {} THEN <<>>
  ELSE LET x == CHOOSE x \in set : TRUE IN <<x>> \o SetToSeq(set \ {x})

Visible(includeDeprecated, element) == includeDeprecated \/ ~IsDeprecated(element)

\* The elements of seq that are visible, in order.
RECURSIVE VisibleFrom(_, _, _, _)
VisibleFrom(includeDeprecated, seq, i, acc) ==
  IF i > Len(seq) THEN acc
  ELSE VisibleFrom(includeDeprecated, seq, i + 1,
                   IF Visible(includeDeprecated, seq[i]) THEN Append(acc, seq[i]) ELSE acc)
VisibleOf(includeDeprecated, seq) == VisibleFrom(includeDeprecated, seq, 1, <<>>)

\* §4.2.4 __InputValue. "defaultValue may return a String encoding ... of
\* the default value used by this input value in the condition a value is
\* not provided at runtime. If this input value has no default value,
\* returns null." "isDeprecated returns true if this input field or
\* argument should no longer be used".
InputValueResult(FS, v) ==
  [name |-> v.name, description |-> v.description, type |-> RefResult(FS, v.type),
   defaultValue |-> v.default, isDeprecated |-> IsDeprecated(v),
   deprecationReason |-> v.deprecated, ref |-> v.type]

\* "args ... Accepts the argument includeDeprecated which defaults to false.
\* If true, deprecated arguments are also returned."
ArgsResult(FS, args, inc) ==
  LET visible == VisibleOf(inc, args) IN
  [i \in DOMAIN visible |-> InputValueResult(FS, visible[i])]

\* §4.2.3 __Field
FieldResult(FS, f, inc) ==
  [name |-> f.name, description |-> f.description, args |-> ArgsResult(FS, f.args, inc),
   type |-> RefResult(FS, f.type), isDeprecated |-> IsDeprecated(f),
   deprecationReason |-> f.deprecated]

\* §4.2.5 __EnumValue
EnumValueResult(v) ==
  [name |-> v.name, description |-> v.description, isDeprecated |-> IsDeprecated(v),
   deprecationReason |-> v.deprecated]

\* An interface's possibleTypes: "returns the list of types that implement
\* this interface. They must be object types."
Implementations(FS, name) ==
  {T.name : T \in {U \in Range(FS.types) : U.kind = "OBJECT" /\ name \in Range(U.interfaces)}}

\* The __Type for a named type, by kind. "All other fields must return
\* null."
TypeResult(FS, T, inc) ==
  LET fields == VisibleOf(inc, T.fields)
      values == VisibleOf(inc, T.values)
      inputFields == VisibleOf(inc, T.inputFields)
      implementations == Implementations(FS, T.name)
      hasFields == T.kind \in {"OBJECT", "INTERFACE"}
  IN
  [kind |-> T.kind,
   name |-> Some(T.name),
   \* The spec gives the built-in scalars no description.
   description |-> IF T.name \in BuiltinScalarNames THEN AnyDescription ELSE T.description,
   \* "specifiedByURL may return a String (in the form of a URL) for custom
   \* scalars, otherwise must be null."
   specifiedByURL |-> IF T.kind = "SCALAR" THEN T.specifiedBy ELSE None,
   \* "isOneOf must return true when representing a OneOf Input Object,
   \* otherwise false."
   isOneOf |-> IF T.kind = "INPUT_OBJECT" THEN Some(T.oneOf) ELSE None,
   \* "fields must return the set of fields that can be selected for this
   \* type." (OBJECT, INTERFACE)
   fields |-> IF hasFields
              THEN Some([i \in DOMAIN fields |-> FieldResult(FS, fields[i], inc)])
              ELSE None,
   \* "interfaces must return the set of interfaces that an object implements
   \* (if none, interfaces must return the empty set)."
   interfaces |-> IF hasFields
                  THEN Some([i \in DOMAIN T.interfaces |-> NamedRef(FS, T.interfaces[i])])
                  ELSE None,
   \* UNION: "possibleTypes returns the list of types that can be represented
   \* within this union." INTERFACE: "the list of types that implement this
   \* interface". Without source order, an interface's are in no
   \* particular order here, and compared as a set.
   possibleTypes |->
     CASE T.kind = "UNION" -> Some([i \in DOMAIN T.members |-> NamedRef(FS, T.members[i])])
       [] T.kind = "INTERFACE" ->
            LET names == SetToSeq(implementations) IN
            Some([i \in DOMAIN names |-> NamedRef(FS, names[i])])
       [] OTHER -> None,
   \* "enumValues must return the set of enum values as a list of
   \* __EnumValue."
   enumValues |-> IF T.kind = "ENUM"
                  THEN Some([i \in DOMAIN values |-> EnumValueResult(values[i])])
                  ELSE None,
   \* "inputFields must return the set of input fields as a list of
   \* __InputValue."
   inputFields |-> IF T.kind = "INPUT_OBJECT"
                   THEN Some([i \in DOMAIN inputFields |-> InputValueResult(FS, inputFields[i])])
                   ELSE None]

\* §4.2.6 __Directive
DirectiveResult(FS, D, inc) ==
  [name |-> D.name, description |-> D.description, isRepeatable |-> D.repeatable,
   locations |-> D.locations, args |-> ArgsResult(FS, D.args, inc),
   isDeprecated |-> IsDeprecated(D), deprecationReason |-> D.deprecated]

-----------------------------------------------------------------------------
(* §4.2.1 The __Schema Type *)

RootResult(FS, S, operation) ==
  LET name == RootTypeName(S, operation) IN
  IF name = <<>> THEN None ELSE Some(NamedRef(FS, name[1]))

\* The __schema of a valid schema S, for a service that provides B. inc is
\* the includeDeprecated argument every list was selected with.
SchemaResult(S, B, inc) ==
  LET FS == Full(S, B)
      names == TypeNames(S, B)
      ordered == SetToSeq(names)
      directives == VisibleOf(inc, FS.directives)
  IN
  [description |-> S.description,
   \* "queryType is the root type of a query operation."
   queryType |-> RootResult(FS, S, "query"),
   \* "mutationType is the root type of a mutation operation, if supported.
   \* Otherwise null." Likewise subscriptionType.
   mutationType |-> RootResult(FS, S, "mutation"),
   subscriptionType |-> RootResult(FS, S, "subscription"),
   types |-> [i \in DOMAIN ordered |-> TypeResult(FS, TypeNamed(FS, ordered[i]), inc)],
   \* "directives must return the set of all directives available within
   \* this schema including all built-in directives. Accepts the argument
   \* includeDeprecated which defaults to false. If true, deprecated
   \* directives are also returned."
   directives |-> [i \in DOMAIN directives |-> DirectiveResult(FS, directives[i], inc)]]

\* §4.2: "__type(name: String!): __Type", the other meta-field of the query
\* root. Its result for a name is that type's entry in SchemaResult's types,
\* and null for a name no type in the schema has, such as a built-in scalar
\* nothing references. inc is the includeDeprecated argument the __Type's
\* lists were selected with.
TypeByName(S, B, inc, name) ==
  IF name \in TypeNames(S, B)
  THEN Some(TypeResult(Full(S, B), TypeNamed(Full(S, B), name), inc))
  ELSE None

-----------------------------------------------------------------------------
(* Comparing a service's result with the expected one *)

DescriptionMatches(e, a) == e = AnyDescription \/ e = a

\* Two encodings of a default value match when they coerce to the same
\* value for the input value's type.
DefaultMatches(FS, type, e, a) ==
  \/ e = a
  \/ /\ e # None /\ a # None
     /\ LET ce == CoerceLiteral(FS, type, e[1], TRUE, Fuel)
            ca == CoerceLiteral(FS, type, a[1], TRUE, Fuel)
        IN ce.ok /\ ca.ok /\ ce.value = ca.value

InputValueMatches(FS, e, a) ==
  /\ e.name = a.name
  /\ DescriptionMatches(e.description, a.description)
  /\ e.type = a.type
  /\ DefaultMatches(FS, e.ref, e.defaultValue, a.defaultValue)
  /\ e.isDeprecated = a.isDeprecated
  /\ e.deprecationReason = a.deprecationReason

ByName(seq, name) == seq[CHOOSE i \in DOMAIN seq : seq[i].name = name]

\* Two lists whose items match: in order when the list has a source order,
\* otherwise by name, each once. e's names are unique.
ListMatches(e, a, ordered, ItemMatches(_, _)) ==
  /\ Len(e) = Len(a)
  /\ IF ordered
     THEN \A i \in DOMAIN e : ItemMatches(e[i], a[i])
     ELSE /\ Range(NamesOf(e)) = Range(NamesOf(a))
          /\ \A i \in DOMAIN e : ItemMatches(e[i], ByName(a, e[i].name))

InputValuesMatch(FS, ordered, e, a) ==
  ListMatches(e, a, ordered, LAMBDA x, y : InputValueMatches(FS, x, y))

FieldMatches(FS, ordered, e, a) ==
  /\ e.name = a.name
  /\ DescriptionMatches(e.description, a.description)
  /\ InputValuesMatch(FS, ordered, e.args, a.args)
  /\ e.type = a.type
  /\ e.isDeprecated = a.isDeprecated
  /\ e.deprecationReason = a.deprecationReason

EnumValueMatches(e, a) ==
  /\ e.name = a.name
  /\ DescriptionMatches(e.description, a.description)
  /\ e.isDeprecated = a.isDeprecated
  /\ e.deprecationReason = a.deprecationReason

\* An optional list: both null, or both lists whose items match.
OptionalListMatches(e, a, ordered, ItemMatches(_, _)) ==
  \/ e = None /\ a = None
  \/ Len(e) = 1 /\ Len(a) = 1 /\ ListMatches(e[1], a[1], ordered, ItemMatches)

\* The same refs, in any order, each once.
SameRefSet(e, a) == Len(e) = Len(a) /\ Range(e) = Range(a)

\* A built-in type's lists have no source order.
TypeMatches(FS, e, a) ==
  LET ordered == ~IsBuiltinTypeName(e.name[1]) IN
  /\ e.kind = a.kind
  /\ e.name = a.name
  /\ DescriptionMatches(e.description, a.description)
  /\ e.specifiedByURL = a.specifiedByURL
  /\ e.isOneOf = a.isOneOf
  /\ OptionalListMatches(e.fields, a.fields, ordered, LAMBDA x, y : FieldMatches(FS, ordered, x, y))
  /\ OptionalListMatches(e.inputFields, a.inputFields, ordered, LAMBDA x, y : InputValueMatches(FS, x, y))
  /\ e.interfaces = a.interfaces
  /\ OptionalListMatches(e.enumValues, a.enumValues, ordered, LAMBDA x, y : EnumValueMatches(x, y))
  /\ IF e.kind = "INTERFACE"
     THEN Len(e.possibleTypes) = 1 /\ Len(a.possibleTypes) = 1
          /\ SameRefSet(e.possibleTypes[1], a.possibleTypes[1])
     ELSE e.possibleTypes = a.possibleTypes

DirectiveMatches(FS, e, a) ==
  /\ e.name = a.name
  /\ DescriptionMatches(e.description, a.description)
  /\ e.isRepeatable = a.isRepeatable
  /\ Len(e.locations) = Len(a.locations) /\ Range(e.locations) = Range(a.locations)
  /\ InputValuesMatch(FS, ~IsBuiltinDirectiveName(e.name), e.args, a.args)
  /\ e.isDeprecated = a.isDeprecated
  /\ e.deprecationReason = a.deprecationReason

\* Whether a service's __type(name:) result `actual` (an optional __Type)
\* is right.
TypeByNameMatches(S, B, inc, name, actual) ==
  LET e == TypeByName(S, B, inc, name) IN
  \/ e = None /\ actual = None
  \/ e # None /\ actual # None /\ TypeMatches(Full(S, B), e[1], actual[1])

RECURSIVE Without(_, _, _, _), TypesWithout(_, _, _, _)
\* The items of seq whose name isn't in names, in order.
Without(seq, names, i, acc) ==
  IF i > Len(seq) THEN acc
  ELSE Without(seq, names, i + 1, IF seq[i].name \in names THEN acc ELSE Append(acc, seq[i]))
\* The same for __Type results, whose name is optional.
TypesWithout(seq, names, i, acc) ==
  IF i > Len(seq) THEN acc
  ELSE TypesWithout(seq, names, i + 1,
                    IF seq[i].name # None /\ seq[i].name[1] \in names THEN acc ELSE Append(acc, seq[i]))

\* B without the directives a service left out: those of B not in names.
Providing(B, names) ==
  [B EXCEPT !.directives = Without(@, BuiltinDirectiveNames(B) \ names, 1, <<>>)]

\* What is wrong with a service's __schema result `actual` for S, B and
\* includeDeprecated: the names of the parts that don't match. actual has
\* the shape of SchemaResult, plus builtinTypeNames and
\* builtinDirectiveNames: the names of the built-in types and directives it
\* returned. B holds the built-in directives a service may provide; the
\* result is compared with SchemaResult for those it returned (P), and must
\* have the ones §3.13 requires. When full is FALSE, actual.types and
\* actual.directives hold only the document's own types and directives, so
\* that a differential needn't repeat the built-ins for every schema; the
\* built-ins are then compared by name only.
Mismatches(S, B, inc, full, actual) ==
  LET P == Providing(B, actual.builtinDirectiveNames)
      FS == Full(S, P)
      expected == SchemaResult(S, P, inc)
      builtinTypes == {n \in TypeNames(S, P) : IsBuiltinTypeName(n)}
      builtinDirectives == {d.name : d \in Range(VisibleOf(inc, P.directives))}
      expectedTypes == IF full THEN expected.types
                       ELSE TypesWithout(expected.types, builtinTypes, 1, <<>>)
      typeNames == {t.name[1] : t \in Range(expectedTypes)}
      actualTypeNames == {t.name[1] : t \in {u \in Range(actual.types) : Len(u.name) = 1}}
      expectedDirectives == IF full THEN expected.directives
                            ELSE Without(expected.directives, builtinDirectives, 1, <<>>)
      directiveNames == Range(NamesOf(expectedDirectives))
      Check(ok, what) == IF ok THEN {} ELSE {what}
  IN
  Check(DescriptionMatches(expected.description, actual.description), "description")
  \cup Check(expected.queryType = actual.queryType, "queryType")
  \cup Check(expected.mutationType = actual.mutationType, "mutationType")
  \cup Check(expected.subscriptionType = actual.subscriptionType, "subscriptionType")
  \* types: the same set of names, each once, and each type matches
  \cup Check(actual.builtinTypeNames = builtinTypes, "builtin type names")
  \cup Check(/\ Len(actual.types) = Len(expectedTypes)
             /\ \A i \in DOMAIN actual.types : Len(actual.types[i].name) = 1
             /\ actualTypeNames = typeNames, "type names")
  \cup {"type " \o t.name[1] :
         t \in {u \in Range(expectedTypes) :
                 u.name[1] \in actualTypeNames /\ ~TypeMatches(FS, u, ByName(actual.types, u.name))}}
  \* directives: the same set of names, each once; the document's in order
  \cup Check(actual.builtinDirectiveNames = builtinDirectives, "builtin directive names")
  \cup Check(RequiredDirectiveNames(S) \subseteq actual.builtinDirectiveNames, "required directives")
  \cup Check(/\ Len(actual.directives) = Len(expectedDirectives)
             /\ Range(NamesOf(actual.directives)) = directiveNames, "directive names")
  \cup {"directive " \o d.name :
         d \in {e \in Range(expectedDirectives) :
                 e.name \in Range(NamesOf(actual.directives))
                 /\ ~DirectiveMatches(FS, e, ByName(actual.directives, e.name))}}
  \cup Check(NamesOf(Without(actual.directives, BuiltinDirectiveNames(B), 1, <<>>))
               = NamesOf(Without(expectedDirectives, BuiltinDirectiveNames(B), 1, <<>>)),
             "directive order")

\* Whether actual is a correct __schema result.
Matches(S, B, inc, full, actual) == Mismatches(S, B, inc, full, actual) = {}
====
