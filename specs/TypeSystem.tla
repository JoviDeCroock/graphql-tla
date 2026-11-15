---- MODULE TypeSystem ----
(***************************************************************************)
(* The type system's validity rules, written by hand from the Type         *)
(* Validation sub-sections of the September 2026 edition                   *)
(* (https://spec.graphql.org/September2026/, §3), plus the                 *)
(* literal input coercion that "If the argument has a default value it     *)
(* must be compatible with argumentType" depends on.                       *)
(*                                                                         *)
(* Everything is a pure operator over schema data S, the type system       *)
(* definitions of one SDL document as written by                           *)
(* scripts/differential-type-system.mjs. S is taken from the document, not *)
(* from a built schema, so it keeps what a built schema loses: duplicate   *)
(* names, source order, and the directives applied inside a definition.   *)
(*                                                                         *)
(* Data shapes (every value of a kind has the same fields, since TLC can't *)
(* compare records of different shapes; an optional value is a sequence   *)
(* of length 0 or 1, so <<>> is "absent"):                                 *)
(*   schema     [description, types, directives, schemaDef, operations]    *)
(*              operations is a sequence of [operation, type]               *)
(*   type ref   [name, wrappers]          [Post!]! = <<"nonNull","list",   *)
(*                                        "nonNull">> around "Post"        *)
(*   type       [kind, name, description, fields, interfaces, members,     *)
(*               values, inputFields, oneOf, specifiedBy, directives]      *)
(*              kind is a __TypeKind name; directives is the set of names  *)
(*              of directives applied anywhere inside the definition       *)
(*   field      [name, description, args, type, deprecated]                *)
(*   input value [name, description, type, default, deprecated]           *)
(*   enum value [name, description, deprecated]                            *)
(*   directive  [name, description, args, repeatable, locations,           *)
(*               deprecated, directives]                                   *)
(*   value      [kind, text, items, fields]   a constant literal; kind \in *)
(*              {"null", "int", "float", "string", "boolean", "enum",      *)
(*              "list", "object"}; fields is a sequence of [name, value]   *)
(*   deprecated <<>>, or <<reason>> when @deprecated is applied            *)
(*                                                                         *)
(* Two optional fields of schema, read through DOMAIN so that schema data  *)
(* without them is still valid (the differential's, and                    *)
(* IntrospectionVectors.tla's):                                            *)
(*   schemaDefinitions  how many schema definitions the document has;      *)
(*                      absent: one if schemaDef, else none                *)
(*   uses       a sequence of [name, location]: every directive the        *)
(*              document applies, with the DirectiveLocation of the place  *)
(*              it is applied (OBJECT, FIELD_DEFINITION, ...); absent: no   *)
(*              use is checked                                             *)
(***************************************************************************)
EXTENDS Integers, Sequences, FiniteSets, TLC

-----------------------------------------------------------------------------
(* Helpers *)

Range(f) == {f[i] : i \in DOMAIN f}
NamesOf(seq) == [i \in DOMAIN seq |-> seq[i].name]
IsUnique(names) == \A i, j \in DOMAIN names : i # j => names[i] # names[j]
StartsWithTwoUnderscores(name) ==
  Len(name) >= 2 /\ SubSeq(name, 1, 2) = "__"

Ref(name, wrappers) == [name |-> name, wrappers |-> wrappers]

-----------------------------------------------------------------------------
(* §3.4.1 Wrapping Types *)

IsNonNull(type) == type.wrappers # <<>> /\ Head(type.wrappers) = "nonNull"
IsList(type) == type.wrappers # <<>> /\ Head(type.wrappers) = "list"
IsWrapping(type) == type.wrappers # <<>>
\* "the unwrapped nullable type" and "the unwrapped item type"
OfType(type) == [type EXCEPT !.wrappers = Tail(@)]
\* "The unwrapped type of a type is its underlying named type."
Unwrapped(type) == [type EXCEPT !.wrappers = <<>>]

-----------------------------------------------------------------------------
(* §3.5 Scalars: "GraphQL specifies a basic set of well-defined Scalar     *)
(* types: Int, Float, String, Boolean, and ID."                            *)

BuiltinScalarNames == {"Int", "Float", "String", "Boolean", "ID"}

\* §4.2: the introspection types are built in too.
IntrospectionTypeNames ==
  {"__Schema", "__Type", "__TypeKind", "__Field", "__InputValue",
   "__EnumValue", "__Directive", "__DirectiveLocation"}

NoDescription == <<>>

TypeDef(kind, name, description, fields, interfaces, members, values,
        inputFields, oneOf, specifiedBy, directives) ==
  [kind |-> kind, name |-> name, description |-> description,
   fields |-> fields, interfaces |-> interfaces, members |-> members,
   values |-> values, inputFields |-> inputFields, oneOf |-> oneOf,
   specifiedBy |-> specifiedBy, directives |-> directives]

BuiltinScalar(name) ==
  TypeDef("SCALAR", name, NoDescription, <<>>, <<>>, <<>>, <<>>, <<>>,
          FALSE, <<>>, {})

\* A name that names nothing. Its kind is none of §3.4.2's, so IsInputType
\* and IsOutputType are false for it, and it is no Object or Interface type:
\* a field, argument, input field, root operation type, union member or
\* implemented interface that names it breaks that place's rule. The
\* differential's generator only writes names it defines; the kit's schema
\* vectors refer to undefined names on purpose.
UnknownType(name) ==
  TypeDef("UNKNOWN", name, NoDescription, <<>>, <<>>, <<>>, <<>>, <<>>,
          FALSE, <<>>, {})

\* The type a name refers to: the first definition with that name, else a
\* built-in scalar.
\*
\* A name of an introspection type, such as __Schema, refers to nothing
\* here, so `type Query { s: __Schema }` breaks FIELD_OUTPUT_TYPE. The spec
\* doesn't settle whether user SDL may refer to one. §3.3 counts them as
\* built-in types and §3.4.2 makes every Object and Enum type an output
\* type, which suggests it may. §4's Reserved Names says "any Name within a
\* GraphQL type system must not start with two underscores", which, read
\* literally, forbids the reference. No vector refers to one
\* (docs/kit/schema.md, Limits).
TypeNamed(S, name) ==
  LET defs == {i \in DOMAIN S.types : S.types[i].name = name} IN
  IF defs # {} THEN S.types[CHOOSE i \in defs : \A j \in defs : i <= j]
  ELSE IF name \in BuiltinScalarNames THEN BuiltinScalar(name)
  ELSE UnknownType(name)

KindOf(S, type) == TypeNamed(S, type.name).kind

-----------------------------------------------------------------------------
(* §3.4.2 Input and Output Types *)

\* IsInputType(type): "If type is a List type or Non-Null type: Let
\* unwrappedType be the unwrapped type of type. Return
\* IsInputType(unwrappedType). If type is a Scalar, Enum, or Input Object
\* type: Return true. Return false."
IsInputType(S, type) ==
  KindOf(S, Unwrapped(type)) \in {"SCALAR", "ENUM", "INPUT_OBJECT"}

\* IsOutputType(type): "If type is a Scalar, Object, Interface, Union, or
\* Enum type: Return true. Return false."
IsOutputType(S, type) ==
  KindOf(S, Unwrapped(type)) \in {"SCALAR", "OBJECT", "INTERFACE", "UNION", "ENUM"}

\* "required (non-null without a default)" (§3.13.3 @deprecated)
IsRequired(inputValue) == IsNonNull(inputValue.type) /\ inputValue.default = <<>>
IsDeprecated(element) == element.deprecated # <<>>

-----------------------------------------------------------------------------
(* Input coercion of constant literals: §3.5 (Int, Float, String,          *)
(* Boolean, ID), §3.9 Enums, §3.10 Input Objects, §3.10.1 OneOf Input      *)
(* Objects, §3.11 List and §3.12 Non-Null, each "Input Coercion".          *)
(*                                                                         *)
(* Returns [ok, value]: whether the literal coerces, and the coerced       *)
(* value. Numbers arrive canonicalised (String(Number(text))), so 1.0 and  *)
(* 1 have the same text. When fill is TRUE, an input object field that has *)
(* no value takes its default ("the result of coercing the default value   *)
(* ... should be used"); when FALSE, such a field counts as satisfied and  *)
(* its own default isn't coerced, so that a bad input field default is     *)
(* charged to the input field and not to every value that omits it. fuel  *)
(* bounds how many input field defaults are expanded one inside another,   *)
(* because a default value cycle never ends. Everything else recurses on   *)
(* the literal or the type, which are finite, so no depth of nesting runs  *)
(* out of fuel, and with fill FALSE fuel is never spent.                   *)
(***************************************************************************)

Value(kind, text, items, fields) ==
  [kind |-> kind, text |-> text, items |-> items, fields |-> fields]
NullValue == Value("null", "", <<>>, <<>>)

Ok(v) == [ok |-> TRUE, value |-> v]
Fail == [ok |-> FALSE, value |-> NullValue]

Fuel == 8

HasEntry(v, name) == \E i \in DOMAIN v.fields : v.fields[i].name = name
Entry(v, name) ==
  v.fields[CHOOSE i \in DOMAIN v.fields : v.fields[i].name = name]

\* A number literal too large for a double is canonicalised to "Infinity"
\* (kit/schema/tla.mjs).
IsFiniteNumber(v) == v.text \notin {"Infinity", "-Infinity", "NaN"}

CoerceScalar(name, v) ==
  CASE name = "Int" ->
         \* "Int input value ... must raise a request error for float input"
         IF v.kind = "int" THEN Ok(Value("int", v.text, <<>>, <<>>)) ELSE Fail
    [] name = "Float" ->
         \* "Integer input values are coerced to Float". "If the input value
         \* otherwise represents a value not representable by finite IEEE 754
         \* (e.g. NaN, Infinity, ...), a request error must be raised."
         IF v.kind \in {"int", "float"} /\ IsFiniteNumber(v)
         THEN Ok(Value("float", v.text, <<>>, <<>>)) ELSE Fail
    [] name = "String" -> IF v.kind = "string" THEN Ok(v) ELSE Fail
    [] name = "Boolean" -> IF v.kind = "boolean" THEN Ok(v) ELSE Fail
    [] name = "ID" ->
         \* "When expected as an input type, any string (such as "4") or
         \* integer (such as 4 or -4) input value should be coerced to ID"
         IF v.kind \in {"string", "int"} THEN Ok(Value("id", v.text, <<>>, <<>>)) ELSE Fail
    [] OTHER ->
         \* A custom scalar's coercion is up to the service; this reference
         \* accepts any non-null literal unchanged.
         Ok(v)

RECURSIVE CoerceLiteral(_, _, _, _, _), CoerceItems(_, _, _, _, _, _, _),
          CoerceFields(_, _, _, _, _, _, _, _)

CoerceLiteral(S, type, v, fill, fuel) ==
  IF v.kind = "null"
  THEN IF IsNonNull(type) THEN Fail ELSE Ok(NullValue)
  ELSE IF IsNonNull(type) THEN CoerceLiteral(S, OfType(type), v, fill, fuel)
  ELSE IF IsList(type)
  THEN IF v.kind = "list"
       THEN CoerceItems(S, OfType(type), v.items, 1, <<>>, fill, fuel)
       ELSE \* "If the value passed as an input to a list type is not a list
            \* and not the null value, then the result of input coercion is a
            \* list of size one"
            LET item == CoerceLiteral(S, OfType(type), v, fill, fuel) IN
            IF item.ok THEN Ok(Value("list", "", <<item.value>>, <<>>)) ELSE Fail
  ELSE
    LET def == TypeNamed(S, type.name) IN
    CASE def.kind = "SCALAR" -> CoerceScalar(type.name, v)
      [] def.kind = "ENUM" ->
           \* "GraphQL string literals must not be accepted as an enum input"
           IF v.kind = "enum" /\ v.text \in Range(NamesOf(def.values))
           THEN Ok(v) ELSE Fail
      [] def.kind = "INPUT_OBJECT" ->
           IF v.kind # "object" THEN Fail
           \* "must not contain any entries with names not defined by a field
           \* of this input object type"
           ELSE IF \E i \in DOMAIN v.fields :
                     v.fields[i].name \notin Range(NamesOf(def.inputFields))
           THEN Fail
           \* OneOf: "the value to be coerced must contain exactly one entry
           \* and that entry must not be null"
           ELSE IF def.oneOf /\ (Len(v.fields) # 1 \/ v.fields[1].value.kind = "null")
           THEN Fail
           ELSE CoerceFields(S, def, v, 1, <<>>, fill, fuel, {})
      [] OTHER -> Fail

CoerceItems(S, itemType, items, i, acc, fill, fuel) ==
  IF i > Len(items) THEN Ok(Value("list", "", acc, <<>>))
  ELSE LET item == CoerceLiteral(S, itemType, items[i], fill, fuel) IN
       IF item.ok THEN CoerceItems(S, itemType, items, i + 1, Append(acc, item.value), fill, fuel)
       ELSE Fail

\* The coerced map, in input field definition order. seen skips a second
\* definition of the same input field name.
CoerceFields(S, def, v, i, acc, fill, fuel, seen) ==
  IF i > Len(def.inputFields) THEN Ok(Value("object", "", <<>>, acc))
  ELSE
    LET field == def.inputFields[i]
        next(entry) == CoerceFields(S, def, v, i + 1, entry, fill, fuel,
                                    seen \cup {field.name})
    IN IF field.name \in seen THEN next(acc)
       ELSE IF HasEntry(v, field.name)
       THEN LET c == CoerceLiteral(S, field.type, Entry(v, field.name).value, fill, fuel) IN
            IF c.ok THEN next(Append(acc, [name |-> field.name, value |-> c.value])) ELSE Fail
       ELSE IF field.default # <<>>
       THEN IF ~fill THEN next(acc)
            ELSE IF fuel = 0 THEN Fail
            ELSE LET c == CoerceLiteral(S, field.type, field.default[1], fill, fuel - 1) IN
                 IF c.ok THEN next(Append(acc, [name |-> field.name, value |-> c.value])) ELSE Fail
       \* §3.12 Input Coercion: "If an argument or input-object field of a
       \* Non-Null type is not provided, is provided with the literal value
       \* null, ... then a request error must be raised." (§3.10's own
       \* sentence for this case, "If no default value is provided and the
       \* input object field's type is non-null, an error should be raised",
       \* says only "should"; the MUST is §3.12's.)
       ELSE IF IsNonNull(field.type) THEN Fail
       ELSE next(acc)

\* "If the argument has a default value it must be compatible with
\* argumentType as per the coercion rules for that type."
\*
\* fill is FALSE: an input field the default leaves out isn't given its own
\* default. §3.10 says that default "should be used", a SHOULD, so with
\* `input I { x: Int = "a" }` the default `{}` of an argument of type I is
\* compatible here, though following the SHOULD makes it incompatible.
DefaultValueIsCompatible(S, inputValue) ==
  inputValue.default = <<>>
  \/ CoerceLiteral(S, inputValue.type, inputValue.default[1], FALSE, Fuel).ok

-----------------------------------------------------------------------------
(* §3.3 Schema *)

AllNames(S) == NamesOf(S.types)

\* "All types within a GraphQL schema must have unique names. No two
\* provided types may have the same name."
TypesHaveUniqueNames(S) == IsUnique(AllNames(S))

\* "No provided type may have a name which conflicts with any built in types
\* (including Scalar and Introspection types)."
NoTypeIsNamedLikeABuiltin(S) ==
  \A i \in DOMAIN S.types :
    S.types[i].name \notin BuiltinScalarNames \cup IntrospectionTypeNames

\* "All directives within a GraphQL schema must have unique names."
DirectivesHaveUniqueNames(S) == IsUnique(NamesOf(S.directives))

\* "When using the type system definition language, a document must include
\* at most one schema definition."
SchemaDefinitionCount(S) ==
  IF "schemaDefinitions" \in DOMAIN S THEN S.schemaDefinitions
  ELSE IF S.schemaDef THEN 1 ELSE 0
HasAtMostOneSchemaDefinition(S) == SchemaDefinitionCount(S) <= 1

\* "All types and directives defined within a schema must not have a name
\* which begins with "__" (two underscores)"
NoTypeNameIsReserved(S) ==
  \A i \in DOMAIN S.types : ~StartsWithTwoUnderscores(S.types[i].name)
NoDirectiveNameIsReserved(S) ==
  \A i \in DOMAIN S.directives : ~StartsWithTwoUnderscores(S.directives[i].name)

-----------------------------------------------------------------------------
(* §3.3.1 Root Operation Types *)

Operations == <<"query", "mutation", "subscription">>

\* "The default root type name for each query, mutation, and subscription
\* root operation type are "Query", "Mutation", and "Subscription"
\* respectively." Without a schema definition, a type with that name is
\* "presumed to be" the root operation type. That reading comes from the
\* spec's examples, not a rule. For a type named Mutation that isn't an
\* object type, it makes the schema invalid (the root isn't an object),
\* where reading it as no mutation root would make it valid, so the kit
\* marks that vector `unspecified` (docs/kit/schema.md).
DefaultRootTypeName(operation) ==
  CASE operation = "query" -> "Query"
    [] operation = "mutation" -> "Mutation"
    [] OTHER -> "Subscription"

\* The root operation type name for an operation, or <<>> if none.
RootTypeName(S, operation) ==
  IF S.schemaDef
  THEN LET is == {i \in DOMAIN S.operations : S.operations[i].operation = operation} IN
       IF is = {} THEN <<>>
       ELSE <<S.operations[CHOOSE i \in is : \A j \in is : i <= j].type>>
  ELSE IF DefaultRootTypeName(operation) \in Range(AllNames(S))
  THEN <<DefaultRootTypeName(operation)>>
  ELSE <<>>

\* "The query root operation type must be provided"
QueryRootIsProvided(S) == RootTypeName(S, "query") # <<>>

\* "... and must be an Object type." "If it is provided, it must be an
\* Object type." (mutation, and "Similarly" subscription)
RootTypesAreObjects(S) ==
  \A k \in DOMAIN Operations :
    LET name == RootTypeName(S, Operations[k]) IN
    name # <<>> => TypeNamed(S, name[1]).kind = "OBJECT"

\* "The query, mutation, and subscription root types must all be different
\* types if provided."
RootTypesAreDifferent(S) ==
  \A k, l \in DOMAIN Operations :
    LET a == RootTypeName(S, Operations[k])
        b == RootTypeName(S, Operations[l])
    IN (k # l /\ a # <<>> /\ b # <<>>) => a # b

-----------------------------------------------------------------------------
(* Arguments: the rules §3.6 Objects, §3.7 Interfaces and §3.13 Directives *)
(* each state for "each argument"                                          *)

\* "The argument must not have a name which begins with the characters
\* "__" (two underscores)."
ArgNamesAreNotReserved(args) == \A i \in DOMAIN args : ~StartsWithTwoUnderscores(args[i].name)

\* "The argument must have a unique name within that field; no two arguments
\* may share the same name."
ArgNamesAreUnique(args) == IsUnique(NamesOf(args))

\* "The argument must accept a type where IsInputType(argumentType) returns
\* true."
ArgsAcceptInputTypes(S, args) == \A i \in DOMAIN args : IsInputType(S, args[i].type)

\* "If argument type is Non-Null and a default value is not defined: The
\* @deprecated directive must not be applied to this argument." §3.13.3
\* states it for every argument: "The @deprecated directive must not appear
\* on required (non-null without a default) arguments".
RequiredArgsAreNotDeprecated(args) ==
  \A i \in DOMAIN args : IsRequired(args[i]) => ~IsDeprecated(args[i])

\* Every argument list in the schema: field arguments of objects and
\* interfaces, and directive arguments.
ObjectLike(S) == {k \in DOMAIN S.types : S.types[k].kind \in {"OBJECT", "INTERFACE"}}

AllArgLists(S) ==
  UNION {{S.types[i].fields[j].args : j \in DOMAIN S.types[i].fields} : i \in ObjectLike(S)}
  \cup {S.directives[i].args : i \in DOMAIN S.directives}

-----------------------------------------------------------------------------
(* §3.6 Objects and §3.7 Interfaces: Type Validation *)

\* "An Object type must define one or more fields." "An Interface type must
\* define one or more fields."
DefinesFields(T) == T.fields # <<>>

\* "The field must have a unique name within that Object type; no two fields
\* may share the same name."
FieldNamesAreUnique(T) == IsUnique(NamesOf(T.fields))

\* "The field must not have a name which begins with the characters "__"
\* (two underscores)."
FieldNamesAreNotReserved(T) ==
  \A i \in DOMAIN T.fields : ~StartsWithTwoUnderscores(T.fields[i].name)

\* "The field must return a type where IsOutputType(fieldType) returns true."
FieldsReturnOutputTypes(S, T) ==
  \A i \in DOMAIN T.fields : IsOutputType(S, T.fields[i].type)

\* Object types only (§3.6 rule 2.4.5): "If the argument has a default
\* value it must be compatible with argumentType as per the coercion rules
\* for that type." §3.7 doesn't list this rule for interface fields.
ObjectArgDefaultsAreCompatible(S, T) ==
  T.kind = "OBJECT" =>
    \A i \in DOMAIN T.fields : \A j \in DOMAIN T.fields[i].args :
      DefaultValueIsCompatible(S, T.fields[i].args[j])

\* "An object type may declare that it implements one or more unique
\* interfaces." "An interface type may declare that it implements one or
\* more unique interfaces, but may not implement itself."
ImplementsUniqueInterfaces(T) == IsUnique(T.interfaces)
ImplementsOnlyInterfaces(S, T) ==
  \A i \in DOMAIN T.interfaces : TypeNamed(S, T.interfaces[i]).kind = "INTERFACE"
DoesNotImplementItself(T) == T.kind = "INTERFACE" => T.name \notin Range(T.interfaces)

\* The interfaces IsValidImplementation is applied to: "For each interface
\* declared implemented as interfaceType". An interface that implements
\* itself, a type that isn't an interface, and a repeat are already invalid
\* by the rules above, and aren't checked again.
CheckedInterfaces(S, T) ==
  {name \in Range(T.interfaces) :
     TypeNamed(S, name).kind = "INTERFACE" /\ name # T.name}

FieldNamed(T, name) ==
  T.fields[CHOOSE i \in DOMAIN T.fields :
             T.fields[i].name = name /\ \A j \in DOMAIN T.fields : T.fields[j].name = name => i <= j]
HasField(T, name) == name \in Range(NamesOf(T.fields))
ArgNamed(args, name) ==
  args[CHOOSE i \in DOMAIN args :
         args[i].name = name /\ \A j \in DOMAIN args : args[j].name = name => i <= j]
HasArg(args, name) == name \in Range(NamesOf(args))

\* IsSubType(possibleSubType, superType)
IsSubType(S, sub, super) ==
  \/ sub = super
  \/ /\ ~IsWrapping(sub) /\ ~IsWrapping(super)
     /\ LET subDef == TypeNamed(S, sub.name)
            superDef == TypeNamed(S, super.name)
        IN \/ \* "If possibleSubType is an Object type and superType is a Union
              \* type and possibleSubType is a possible type of superType"
              /\ subDef.kind = "OBJECT" /\ superDef.kind = "UNION"
              /\ sub.name \in Range(superDef.members)
           \/ \* "If possibleSubType is an Object or Interface type and
              \* superType is an Interface type and possibleSubType declares
              \* it implements superType"
              /\ subDef.kind \in {"OBJECT", "INTERFACE"} /\ superDef.kind = "INTERFACE"
              /\ super.name \in Range(subDef.interfaces)

\* IsValidImplementationFieldType(fieldType, implementedFieldType)
RECURSIVE IsValidImplementationFieldType(_, _, _)
IsValidImplementationFieldType(S, fieldType, implementedFieldType) ==
  IF IsNonNull(fieldType)
  THEN \* "Let nullableType be the unwrapped nullable type of fieldType. Let
       \* implementedNullableType be the unwrapped nullable type of
       \* implementedFieldType if it is a Non-Null type, otherwise let it be
       \* implementedFieldType directly."
       IsValidImplementationFieldType(S, OfType(fieldType),
         IF IsNonNull(implementedFieldType) THEN OfType(implementedFieldType)
         ELSE implementedFieldType)
  ELSE IF IsList(fieldType) /\ IsList(implementedFieldType)
  THEN IsValidImplementationFieldType(S, OfType(fieldType), OfType(implementedFieldType))
  ELSE IsSubType(S, fieldType, implementedFieldType)

\* IsValidImplementation(type, implementedType), one operator per step so
\* that a verdict can say which step failed.

\* 1. "If implementedType declares it implements any interfaces, type must
\* also declare it implements those interfaces."
ImplementsTransitively(S, T, I) ==
  \A k \in DOMAIN I.interfaces : I.interfaces[k] \in Range(T.interfaces)

\* 2. "type must include a field of the same name for every field defined
\* in implementedType."
ProvidesEveryField(T, I) == \A k \in DOMAIN I.fields : HasField(T, I.fields[k].name)

\* The pairs (field, implementedField) the remaining steps are about.
FieldPairs(T, I) ==
  {[field |-> FieldNamed(T, I.fields[k].name), implemented |-> I.fields[k]] :
     k \in {j \in DOMAIN I.fields : HasField(T, I.fields[j].name)}}

\* 2.3. "field must include an argument of the same name for every argument
\* defined in implementedField."
ProvidesEveryArg(T, I) ==
  \A p \in FieldPairs(T, I) :
    \A k \in DOMAIN p.implemented.args : HasArg(p.field.args, p.implemented.args[k].name)

\* 2.3.1. "That named argument on field must accept the same type
\* (invariant) as that named argument on implementedField."
ArgTypesAreInvariant(T, I) ==
  \A p \in FieldPairs(T, I) :
    \A k \in DOMAIN p.implemented.args :
      HasArg(p.field.args, p.implemented.args[k].name) =>
        ArgNamed(p.field.args, p.implemented.args[k].name).type = p.implemented.args[k].type

\* 2.4. "field may include additional arguments not defined in
\* implementedField, but any additional argument must not be required, e.g.
\* must not be of a non-nullable type."
AdditionalArgsAreOptional(T, I) ==
  \A p \in FieldPairs(T, I) :
    \A k \in DOMAIN p.field.args :
      ~HasArg(p.implemented.args, p.field.args[k].name) => ~IsRequired(p.field.args[k])

\* 2.5. "field must return a type which is equal to or a sub-type of
\* (covariant) the return type of implementedField field's return type"
FieldTypesAreCovariant(S, T, I) ==
  \A p \in FieldPairs(T, I) :
    IsValidImplementationFieldType(S, p.field.type, p.implemented.type)

\* 2.6. "If field is deprecated then implementedField must also be
\* deprecated."
DeprecationIsImplemented(T, I) ==
  \A p \in FieldPairs(T, I) : IsDeprecated(p.field) => IsDeprecated(p.implemented)

IsValidImplementation(S, T, I) ==
  /\ ImplementsTransitively(S, T, I)
  /\ ProvidesEveryField(T, I)
  /\ ProvidesEveryArg(T, I)
  /\ ArgTypesAreInvariant(T, I)
  /\ AdditionalArgsAreOptional(T, I)
  /\ FieldTypesAreCovariant(S, T, I)
  /\ DeprecationIsImplemented(T, I)

\* "Interface definitions must not contain cyclic references nor implement
\* themselves." A cycle fails IsValidImplementation step 1 on its own: if
\* A implements B and B implements A, A must also declare A, which it may
\* not. This operator isn't a separate rule; the vectors use it to check
\* that every cycle is rejected.
RECURSIVE ReachesInterface(_, _, _, _)
ReachesInterface(S, from, target, seen) ==
  LET T == TypeNamed(S, from) IN
  \E k \in DOMAIN T.interfaces :
    \/ T.interfaces[k] = target
    \/ /\ T.interfaces[k] \notin seen
       /\ ReachesInterface(S, T.interfaces[k], target, seen \cup {T.interfaces[k]})
HasInterfaceCycle(S) ==
  \E i \in DOMAIN S.types :
    S.types[i].kind = "INTERFACE" /\ ReachesInterface(S, S.types[i].name, S.types[i].name, {})

-----------------------------------------------------------------------------
(* §3.8 Unions: Type Validation *)

\* "A Union type must include one or more unique member types."
HasMembers(T) == T.members # <<>>
MembersAreUnique(T) == IsUnique(T.members)

\* "The member types of a Union type must all be Object base types; Scalar,
\* Interface and Union types must not be member types of a Union."
MembersAreObjects(S, T) ==
  \A k \in DOMAIN T.members : TypeNamed(S, T.members[k]).kind = "OBJECT"

-----------------------------------------------------------------------------
(* §3.9 Enums: Type Validation *)

\* "An Enum type must define one or more unique enum values."
HasValues(T) == T.values # <<>>
ValuesAreUnique(T) == IsUnique(NamesOf(T.values))

\* §3.9 says nothing about "__", but §4 Reserved Names does: "Otherwise, any
\* Name within a GraphQL type system must not start with two underscores".
ValueNamesAreNotReserved(T) ==
  \A k \in DOMAIN T.values : ~StartsWithTwoUnderscores(T.values[k].name)

-----------------------------------------------------------------------------
(* §3.10 Input Objects: Type Validation *)

\* "An Input Object type must define one or more input fields."
HasInputFields(T) == T.inputFields # <<>>

\* "The input field must have a unique name within that Input Object type"
InputFieldNamesAreUnique(T) == IsUnique(NamesOf(T.inputFields))

\* "The input field must not have a name which begins with the characters
\* "__" (two underscores)."
InputFieldNamesAreNotReserved(T) ==
  \A k \in DOMAIN T.inputFields : ~StartsWithTwoUnderscores(T.inputFields[k].name)

\* "The input field must accept a type where IsInputType(inputFieldType)
\* returns true."
InputFieldsAcceptInputTypes(S, T) ==
  \A k \in DOMAIN T.inputFields : IsInputType(S, T.inputFields[k].type)

\* "If input field type is Non-Null and a default value is not defined: The
\* @deprecated directive must not be applied to this input field."
RequiredInputFieldsAreNotDeprecated(T) ==
  \A k \in DOMAIN T.inputFields :
    IsRequired(T.inputFields[k]) => ~IsDeprecated(T.inputFields[k])

\* "If the Input Object is a OneOf Input Object then: The type of the input
\* field must be nullable. The input field must not have a default value."
OneOfFieldsAreNullable(T) ==
  T.oneOf => \A k \in DOMAIN T.inputFields : ~IsNonNull(T.inputFields[k].type)
OneOfFieldsHaveNoDefault(T) ==
  T.oneOf => \A k \in DOMAIN T.inputFields : T.inputFields[k].default = <<>>

\* InputObjectHasUnbreakableCycle(inputObject, visited) and
\* InputFieldTypeHasUnbreakableCycle(fieldType, visited)
RECURSIVE InputObjectHasUnbreakableCycle(_, _, _), InputFieldTypeHasUnbreakableCycle(_, _, _)
InputObjectHasUnbreakableCycle(S, name, visited) ==
  IF name \in visited THEN TRUE
  ELSE
    LET nextVisited == visited \cup {name}
        fields == TypeNamed(S, name).inputFields
    IN IF TypeNamed(S, name).oneOf
       THEN \* "For each field field of inputObject: ... If not
            \* InputFieldTypeHasUnbreakableCycle(fieldType, nextVisited):
            \* Return false. Return true."
            \A k \in DOMAIN fields :
              InputFieldTypeHasUnbreakableCycle(S, fields[k].type, nextVisited)
       ELSE \* "If fieldType is Non-Null: ... If
            \* InputFieldTypeHasUnbreakableCycle(nullableType, nextVisited):
            \* Return true. Return false."
            \E k \in DOMAIN fields :
              /\ IsNonNull(fields[k].type)
              /\ InputFieldTypeHasUnbreakableCycle(S, OfType(fields[k].type), nextVisited)

InputFieldTypeHasUnbreakableCycle(S, type, visited) ==
  IF IsList(type) THEN FALSE
  ELSE IF IsNonNull(type) THEN InputFieldTypeHasUnbreakableCycle(S, OfType(type), visited)
  \* "If fieldType is a Scalar or Enum type: Return false. Assert: fieldType
  \* is an Input Object type." A type that isn't an input type is already
  \* invalid, and counts as no cycle.
  ELSE IF KindOf(S, type) # "INPUT_OBJECT" THEN FALSE
  ELSE InputObjectHasUnbreakableCycle(S, type.name, visited)

\* "InputObjectHasUnbreakableCycle(inputObject) must be false."
HasNoUnbreakableCycle(S, T) == ~InputObjectHasUnbreakableCycle(S, T.name, {})

\* September 2025's rule 3, which September 2026 replaced with the one above
\* (graphql-spec #1211), and which October 2021 has word for word: "If an
\* Input Object references itself either directly or through referenced
\* Input Objects, at least one of the fields in the chain of references must
\* be either a nullable or a List type." A chain is broken by any field that
\* isn't Non-Null of an input object, whatever the input object: the rule
\* has no case for OneOf input objects, whose fields are nullable anyway. So
\* `input A @oneOf { b: B } input B @oneOf { a: A }` is valid under it,
\* though no finite value inhabits A. Verdict doesn't use this; the kit
\* uses VerdictSeptember2025 to tell which release gives a schema its
\* verdict.
NonNullInputObjectRefs(S, T) ==
  {OfType(T.inputFields[k].type).name :
     k \in {k \in DOMAIN T.inputFields :
              /\ IsNonNull(T.inputFields[k].type)
              /\ ~IsList(OfType(T.inputFields[k].type))
              /\ KindOf(S, OfType(T.inputFields[k].type)) = "INPUT_OBJECT"}}
RECURSIVE NonNullChainReach(_, _, _)
NonNullChainReach(S, frontier, seen) ==
  IF frontier = {} THEN seen
  ELSE LET next == UNION {NonNullInputObjectRefs(S, TypeNamed(S, n)) : n \in frontier} \ seen IN
       NonNullChainReach(S, next, seen \cup next)
HasNoUnbrokenNonNullChain(S, T) ==
  T.name \notin NonNullChainReach(S, NonNullInputObjectRefs(S, T), NonNullInputObjectRefs(S, T))

\* InputObjectDefaultValueHasCycle(inputObject, defaultValue, visitedFields)
\* and InputFieldDefaultValueHasCycle(field, defaultValue, visitedFields). A
\* field is identified by <<input object name, field name>>.
RECURSIVE InputObjectDefaultValueHasCycle(_, _, _, _), InputFieldDefaultValueHasCycle(_, _, _, _, _)
InputObjectDefaultValueHasCycle(S, name, defaultValue, visitedFields) ==
  IF defaultValue.kind = "list"
  THEN \E k \in DOMAIN defaultValue.items :
         InputObjectDefaultValueHasCycle(S, name, defaultValue.items[k], visitedFields)
  ELSE IF defaultValue.kind = "object"
  THEN LET fields == TypeNamed(S, name).inputFields IN
       \E k \in DOMAIN fields :
         InputFieldDefaultValueHasCycle(S, name, fields[k], defaultValue, visitedFields)
  ELSE FALSE

InputFieldDefaultValueHasCycle(S, name, field, defaultValue, visitedFields) ==
  LET named == Unwrapped(field.type) IN
  \* "If namedFieldType is not an input object type: Return false."
  IF KindOf(S, named) # "INPUT_OBJECT" THEN FALSE
  \* "If fieldDefaultValue exists: Return
  \* InputObjectDefaultValueHasCycle(namedFieldType, fieldDefaultValue,
  \* visitedFields)."
  ELSE IF HasEntry(defaultValue, field.name)
  THEN InputObjectDefaultValueHasCycle(S, named.name, Entry(defaultValue, field.name).value, visitedFields)
  ELSE IF field.default = <<>> THEN FALSE
  ELSE IF <<name, field.name>> \in visitedFields THEN TRUE
  ELSE InputObjectDefaultValueHasCycle(S, named.name, field.default[1],
                                       visitedFields \cup {<<name, field.name>>})

EmptyMap == Value("object", "", <<>>, <<>>)

\* "InputObjectDefaultValueHasCycle(inputObject) must be false." ("If
\* defaultValue is not provided, initialize it to an empty unordered map.")
HasNoDefaultValueCycle(S, T) == ~InputObjectDefaultValueHasCycle(S, T.name, EmptyMap, {})

-----------------------------------------------------------------------------
(* §3.13 Directives: Type Validation *)

\* "A Directive definition must include at least one DirectiveLocation."
HasLocations(D) == D.locations # <<>>

\* What a definition references: the directives used inside it and the
\* types it names. A type's fields, arguments, input fields, interfaces and
\* members name types; a directive's arguments do.
ArgTypeNames(args) == {args[k].type.name : k \in DOMAIN args}
TypeReferences(T) ==
  T.directives
  \cup {T.fields[k].type.name : k \in DOMAIN T.fields}
  \cup UNION {ArgTypeNames(T.fields[k].args) : k \in DOMAIN T.fields}
  \cup ArgTypeNames(T.inputFields)
  \cup Range(T.interfaces) \cup Range(T.members)

\* Nodes are <<"type", name>> or <<"directive", name>>.
DirectiveNamed(S, name) ==
  S.directives[CHOOSE i \in DOMAIN S.directives : S.directives[i].name = name]
References(S, node) ==
  IF node[1] = "directive"
  THEN IF \E i \in DOMAIN S.directives : S.directives[i].name = node[2]
       THEN LET D == DirectiveNamed(S, node[2]) IN
            {<<"directive", d>> : d \in D.directives} \cup {<<"type", t>> : t \in ArgTypeNames(D.args)}
       ELSE {}
  ELSE LET T == TypeNamed(S, node[2]) IN
       {<<"directive", d>> : d \in T.directives}
       \cup {<<"type", t>> : t \in TypeReferences(T) \ T.directives}

\* The built-in directives (§3.13.1 to §3.13.5) and their locations, which a
\* document may use without defining: "any built-in directive may be
\* omitted for brevity". These are September 2026's. @deprecated goes on
\* arguments and input fields since September 2025, and on directive
\* definitions since September 2026; the kit tags a schema that puts it
\* there with that release.
BuiltinDirectiveLocations ==
  ("skip" :> {"FIELD", "FRAGMENT_SPREAD", "INLINE_FRAGMENT"})
  @@ ("include" :> {"FIELD", "FRAGMENT_SPREAD", "INLINE_FRAGMENT"})
  @@ ("deprecated" :> {"FIELD_DEFINITION", "ARGUMENT_DEFINITION",
                       "INPUT_FIELD_DEFINITION", "ENUM_VALUE", "DIRECTIVE_DEFINITION"})
  @@ ("specifiedBy" :> {"SCALAR"})
  @@ ("oneOf" :> {"INPUT_OBJECT"})

DirectiveUses(S) == IF "uses" \in DOMAIN S THEN S.uses ELSE <<>>
DefinesDirective(S, name) == \E i \in DOMAIN S.directives : S.directives[i].name = name
IsKnownDirective(S, name) ==
  DefinesDirective(S, name) \/ name \in DOMAIN BuiltinDirectiveLocations
\* A directive the document defines, else the built-in of that name.
DeclaredLocations(S, name) ==
  IF DefinesDirective(S, name) THEN Range(DirectiveNamed(S, name).locations)
  ELSE BuiltinDirectiveLocations[name]

\* "Directives must only be used in the locations they are declared to
\* belong in." A directive that is neither defined nor built in isn't
\* declared to belong anywhere (DIRECTIVES_DEFINED); one that is must be
\* used at one of its locations (DIRECTIVE_LOCATIONS_VALID).
DirectivesAreDefined(S) ==
  \A k \in DOMAIN DirectiveUses(S) : IsKnownDirective(S, DirectiveUses(S)[k].name)
DirectivesAreInDeclaredLocations(S) ==
  \A k \in DOMAIN DirectiveUses(S) :
    LET use == DirectiveUses(S)[k] IN
    IsKnownDirective(S, use.name) => use.location \in DeclaredLocations(S, use.name)

RECURSIVE Reachable(_, _, _)
Reachable(S, frontier, seen) ==
  IF frontier = {} THEN seen
  ELSE LET next == UNION {References(S, n) : n \in frontier} \ seen IN
       Reachable(S, next, seen \cup next)

\* "A Directive definition must not contain the use of a Directive which
\* references itself directly."
DoesNotUseItself(D) == D.name \notin D.directives

\* "A Directive definition must not contain the use of a Directive which
\* references itself indirectly by referencing a Type or Directive which
\* transitively includes a reference to this Directive."
\*
\* The search starts from the directive's argument types as well as the
\* directives used inside it. That follows the prose, "While defining a
\* directive, it must not reference itself directly or indirectly". The
\* formal rule only speaks of the directives the definition uses, so it
\* doesn't forbid `directive @d(a: In)` with `input In { f: Int @d }`, which
\* uses no directive. The kit marks the vectors that depend on this reading
\* `unspecified` (docs/kit/schema.md).
DoesNotReferenceItselfIndirectly(S, D) ==
  LET direct == References(S, <<"directive", D.name>>) \ {<<"directive", D.name>>} IN
  <<"directive", D.name>> \notin Reachable(S, direct, direct)

-----------------------------------------------------------------------------
(* Verdicts: the rules a schema breaks *)

Rules ==
  { "TYPE_NAMES_UNIQUE", "TYPE_NAME_NOT_BUILTIN", "TYPE_NAME_RESERVED",
    "DIRECTIVE_NAMES_UNIQUE", "DIRECTIVE_NAME_RESERVED", "SCHEMA_DEFINITION_UNIQUE",
    "QUERY_ROOT_PROVIDED", "ROOT_TYPES_ARE_OBJECTS", "ROOT_TYPES_DIFFERENT",
    "FIELDS_DEFINED", "FIELD_NAMES_UNIQUE", "FIELD_NAME_RESERVED",
    "FIELD_OUTPUT_TYPE",
    "ARG_NAME_RESERVED", "ARG_NAMES_UNIQUE", "ARG_INPUT_TYPE",
    "REQUIRED_ARG_NOT_DEPRECATED", "ARG_DEFAULT_COMPATIBLE",
    "IMPLEMENTS_UNIQUE", "IMPLEMENTS_INTERFACES", "IMPLEMENTS_ITSELF",
    "IMPL_TRANSITIVE", "IMPL_FIELD_PROVIDED", "IMPL_ARG_PROVIDED",
    "IMPL_ARG_INVARIANT", "IMPL_EXTRA_ARG_OPTIONAL", "IMPL_FIELD_COVARIANT",
    "IMPL_DEPRECATION",
    "UNION_MEMBERS_DEFINED", "UNION_MEMBERS_UNIQUE", "UNION_MEMBERS_OBJECTS",
    "ENUM_VALUES_DEFINED", "ENUM_VALUES_UNIQUE", "ENUM_VALUE_NAME_RESERVED",
    "INPUT_FIELDS_DEFINED", "INPUT_FIELD_NAMES_UNIQUE", "INPUT_FIELD_NAME_RESERVED",
    "INPUT_FIELD_INPUT_TYPE", "REQUIRED_INPUT_FIELD_NOT_DEPRECATED",
    "ONEOF_FIELD_NULLABLE", "ONEOF_FIELD_NO_DEFAULT",
    "INPUT_OBJECT_UNBREAKABLE_CYCLE", "INPUT_OBJECT_DEFAULT_VALUE_CYCLE",
    "DIRECTIVE_LOCATIONS_DEFINED", "DIRECTIVE_USES_ITSELF",
    "DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY",
    "DIRECTIVES_DEFINED", "DIRECTIVE_LOCATIONS_VALID" }

TypesOfKind(S, kinds) == {S.types[i] : i \in {k \in DOMAIN S.types : S.types[k].kind \in kinds}}
Objects(S) == TypesOfKind(S, {"OBJECT"})
ObjectsAndInterfaces(S) == TypesOfKind(S, {"OBJECT", "INTERFACE"})
Unions(S) == TypesOfKind(S, {"UNION"})
Enums(S) == TypesOfKind(S, {"ENUM"})
InputObjects(S) == TypesOfKind(S, {"INPUT_OBJECT"})

\* Some (type, implemented interface) pair fails a step.
SomeImplementation(S, step(_, _)) ==
  \E T \in ObjectsAndInterfaces(S) : \E name \in CheckedInterfaces(S, T) :
    ~step(T, TypeNamed(S, name))

Violated(S, rule) ==
  CASE rule = "TYPE_NAMES_UNIQUE" -> ~TypesHaveUniqueNames(S)
    [] rule = "TYPE_NAME_NOT_BUILTIN" -> ~NoTypeIsNamedLikeABuiltin(S)
    [] rule = "TYPE_NAME_RESERVED" -> ~NoTypeNameIsReserved(S)
    [] rule = "DIRECTIVE_NAMES_UNIQUE" -> ~DirectivesHaveUniqueNames(S)
    [] rule = "DIRECTIVE_NAME_RESERVED" -> ~NoDirectiveNameIsReserved(S)
    [] rule = "SCHEMA_DEFINITION_UNIQUE" -> ~HasAtMostOneSchemaDefinition(S)
    [] rule = "QUERY_ROOT_PROVIDED" -> ~QueryRootIsProvided(S)
    [] rule = "ROOT_TYPES_ARE_OBJECTS" -> ~RootTypesAreObjects(S)
    [] rule = "ROOT_TYPES_DIFFERENT" -> ~RootTypesAreDifferent(S)
    [] rule = "FIELDS_DEFINED" -> \E T \in ObjectsAndInterfaces(S) : ~DefinesFields(T)
    [] rule = "FIELD_NAMES_UNIQUE" -> \E T \in ObjectsAndInterfaces(S) : ~FieldNamesAreUnique(T)
    [] rule = "FIELD_NAME_RESERVED" -> \E T \in ObjectsAndInterfaces(S) : ~FieldNamesAreNotReserved(T)
    [] rule = "FIELD_OUTPUT_TYPE" -> \E T \in ObjectsAndInterfaces(S) : ~FieldsReturnOutputTypes(S, T)
    [] rule = "ARG_NAME_RESERVED" -> \E args \in AllArgLists(S) : ~ArgNamesAreNotReserved(args)
    [] rule = "ARG_NAMES_UNIQUE" -> \E args \in AllArgLists(S) : ~ArgNamesAreUnique(args)
    [] rule = "ARG_INPUT_TYPE" -> \E args \in AllArgLists(S) : ~ArgsAcceptInputTypes(S, args)
    [] rule = "REQUIRED_ARG_NOT_DEPRECATED" -> \E args \in AllArgLists(S) : ~RequiredArgsAreNotDeprecated(args)
    [] rule = "ARG_DEFAULT_COMPATIBLE" -> \E T \in Objects(S) : ~ObjectArgDefaultsAreCompatible(S, T)
    [] rule = "IMPLEMENTS_UNIQUE" -> \E T \in ObjectsAndInterfaces(S) : ~ImplementsUniqueInterfaces(T)
    [] rule = "IMPLEMENTS_INTERFACES" -> \E T \in ObjectsAndInterfaces(S) : ~ImplementsOnlyInterfaces(S, T)
    [] rule = "IMPLEMENTS_ITSELF" -> \E T \in ObjectsAndInterfaces(S) : ~DoesNotImplementItself(T)
    [] rule = "IMPL_TRANSITIVE" -> SomeImplementation(S, LAMBDA T, I : ImplementsTransitively(S, T, I))
    [] rule = "IMPL_FIELD_PROVIDED" -> SomeImplementation(S, LAMBDA T, I : ProvidesEveryField(T, I))
    [] rule = "IMPL_ARG_PROVIDED" -> SomeImplementation(S, LAMBDA T, I : ProvidesEveryArg(T, I))
    [] rule = "IMPL_ARG_INVARIANT" -> SomeImplementation(S, LAMBDA T, I : ArgTypesAreInvariant(T, I))
    [] rule = "IMPL_EXTRA_ARG_OPTIONAL" -> SomeImplementation(S, LAMBDA T, I : AdditionalArgsAreOptional(T, I))
    [] rule = "IMPL_FIELD_COVARIANT" -> SomeImplementation(S, LAMBDA T, I : FieldTypesAreCovariant(S, T, I))
    [] rule = "IMPL_DEPRECATION" -> SomeImplementation(S, LAMBDA T, I : DeprecationIsImplemented(T, I))
    [] rule = "UNION_MEMBERS_DEFINED" -> \E T \in Unions(S) : ~HasMembers(T)
    [] rule = "UNION_MEMBERS_UNIQUE" -> \E T \in Unions(S) : ~MembersAreUnique(T)
    [] rule = "UNION_MEMBERS_OBJECTS" -> \E T \in Unions(S) : ~MembersAreObjects(S, T)
    [] rule = "ENUM_VALUES_DEFINED" -> \E T \in Enums(S) : ~HasValues(T)
    [] rule = "ENUM_VALUES_UNIQUE" -> \E T \in Enums(S) : ~ValuesAreUnique(T)
    [] rule = "ENUM_VALUE_NAME_RESERVED" -> \E T \in Enums(S) : ~ValueNamesAreNotReserved(T)
    [] rule = "INPUT_FIELDS_DEFINED" -> \E T \in InputObjects(S) : ~HasInputFields(T)
    [] rule = "INPUT_FIELD_NAMES_UNIQUE" -> \E T \in InputObjects(S) : ~InputFieldNamesAreUnique(T)
    [] rule = "INPUT_FIELD_NAME_RESERVED" -> \E T \in InputObjects(S) : ~InputFieldNamesAreNotReserved(T)
    [] rule = "INPUT_FIELD_INPUT_TYPE" -> \E T \in InputObjects(S) : ~InputFieldsAcceptInputTypes(S, T)
    [] rule = "REQUIRED_INPUT_FIELD_NOT_DEPRECATED" -> \E T \in InputObjects(S) : ~RequiredInputFieldsAreNotDeprecated(T)
    [] rule = "ONEOF_FIELD_NULLABLE" -> \E T \in InputObjects(S) : ~OneOfFieldsAreNullable(T)
    [] rule = "ONEOF_FIELD_NO_DEFAULT" -> \E T \in InputObjects(S) : ~OneOfFieldsHaveNoDefault(T)
    [] rule = "INPUT_OBJECT_UNBREAKABLE_CYCLE" -> \E T \in InputObjects(S) : ~HasNoUnbreakableCycle(S, T)
    [] rule = "INPUT_OBJECT_DEFAULT_VALUE_CYCLE" -> \E T \in InputObjects(S) : ~HasNoDefaultValueCycle(S, T)
    [] rule = "DIRECTIVE_LOCATIONS_DEFINED" -> \E i \in DOMAIN S.directives : ~HasLocations(S.directives[i])
    [] rule = "DIRECTIVE_USES_ITSELF" -> \E i \in DOMAIN S.directives : ~DoesNotUseItself(S.directives[i])
    [] rule = "DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY" ->
         \E i \in DOMAIN S.directives : ~DoesNotReferenceItselfIndirectly(S, S.directives[i])
    [] rule = "DIRECTIVES_DEFINED" -> ~DirectivesAreDefined(S)
    [] rule = "DIRECTIVE_LOCATIONS_VALID" -> ~DirectivesAreInDeclaredLocations(S)
    [] OTHER -> FALSE

\* The rules S breaks. S is a valid schema when this is empty.
Verdict(S) == {rule \in Rules : Violated(S, rule)}
IsValidSchema(S) == Verdict(S) = {}

\* The rules S breaks under September 2025, for a document in its grammar
\* (no directives on directive definitions, so no @deprecated there). Every
\* rule is September 2026's but the input object cycle, which is
\* HasNoUnbrokenNonNullChain's. The kit tags a schema whose verdict this
\* changes `since: "September2026"`.
CycleRuleSeptember2025(S) ==
  IF \E T \in InputObjects(S) : ~HasNoUnbrokenNonNullChain(S, T)
  THEN {"INPUT_OBJECT_UNBREAKABLE_CYCLE"} ELSE {}
VerdictSeptember2025(S) ==
  (Verdict(S) \ {"INPUT_OBJECT_UNBREAKABLE_CYCLE"}) \cup CycleRuleSeptember2025(S)

-----------------------------------------------------------------------------
(* Not in the spec. graphql-js 17 also checks the default values of        *)
(* interface field arguments, input fields and directive arguments.        *)
(* September 2026 states the rule only for object field arguments (§3.6    *)
(* rule 2.4.5); §3.7, §3.10 and §3.13 don't list it. It is here, under    *)
(* its own name, so the differential can say exactly where graphql-js goes *)
(* further than the spec.                                                  *)

OtherDefaultsAreCompatible(S) ==
  /\ \A T \in TypesOfKind(S, {"INTERFACE"}) :
       \A i \in DOMAIN T.fields : \A j \in DOMAIN T.fields[i].args :
         DefaultValueIsCompatible(S, T.fields[i].args[j])
  /\ \A T \in InputObjects(S) :
       \A k \in DOMAIN T.inputFields : DefaultValueIsCompatible(S, T.inputFields[k])
  /\ \A i \in DOMAIN S.directives : \A j \in DOMAIN S.directives[i].args :
       DefaultValueIsCompatible(S, S.directives[i].args[j])
====
