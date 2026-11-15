---- MODULE TypeSystemVectors ----
(***************************************************************************)
(* Hand-written vectors for TypeSystem.tla: small schemas and the exact    *)
(* rules each one breaks, most taken from the spec's own examples and      *)
(* counter-examples. scripts/check.mjs checks this module, and the mutants *)
(* in typesystem.mutants.mjs each break one of its properties.             *)
(*                                                                         *)
(* The properties are state-level (~done => ...) only so that tla-ts       *)
(* reports a failing one as a violated invariant.                          *)
(***************************************************************************)
EXTENDS TypeSystem

-----------------------------------------------------------------------------
(* Building schema data *)

R(name) == Ref(name, <<>>)
NN(type) == [type EXCEPT !.wrappers = <<"nonNull">> \o @]
L(type) == [type EXCEPT !.wrappers = <<"list">> \o @]

V(kind, text) == Value(kind, text, <<>>, <<>>)
I(text) == V("int", text)
LV(items) == Value("list", "", items, <<>>)
OV(fields) == Value("object", "", <<>>, fields)
E(name, value) == [name |-> name, value |-> value]

Arg(name, type) ==
  [name |-> name, description |-> <<>>, type |-> type, default |-> <<>>, deprecated |-> <<>>]
ArgD(name, type, default) == [Arg(name, type) EXCEPT !.default = <<default>>]
Dep(x) == [x EXCEPT !.deprecated = <<"No longer supported">>]
F(name, type) ==
  [name |-> name, description |-> <<>>, args |-> <<>>, type |-> type, deprecated |-> <<>>]
FA(name, args, type) == [F(name, type) EXCEPT !.args = args]

Obj(name, interfaces, fields) ==
  TypeDef("OBJECT", name, <<>>, fields, interfaces, <<>>, <<>>, <<>>, FALSE, <<>>, {})
Iface(name, interfaces, fields) == [Obj(name, interfaces, fields) EXCEPT !.kind = "INTERFACE"]
Union(name, members) ==
  TypeDef("UNION", name, <<>>, <<>>, <<>>, members, <<>>, <<>>, FALSE, <<>>, {})
Enum(name, values) ==
  TypeDef("ENUM", name, <<>>, <<>>, <<>>, <<>>,
          [k \in DOMAIN values |-> [name |-> values[k], description |-> <<>>, deprecated |-> <<>>]],
          <<>>, FALSE, <<>>, {})
Input(name, fields) ==
  TypeDef("INPUT_OBJECT", name, <<>>, <<>>, <<>>, <<>>, <<>>, fields, FALSE, <<>>, {})
OneOf(name, fields) == [Input(name, fields) EXCEPT !.oneOf = TRUE]
Scalar(name) == TypeDef("SCALAR", name, <<>>, <<>>, <<>>, <<>>, <<>>, <<>>, FALSE, <<>>, {})
Using(T, directives) == [T EXCEPT !.directives = directives]
Dir(name, args, uses) ==
  [name |-> name, description |-> <<>>, args |-> args, repeatable |-> FALSE,
   locations |-> <<"FIELD">>, deprecated |-> <<>>, directives |-> uses]

Schema(types) ==
  [description |-> <<>>, types |-> types, directives |-> <<>>, schemaDef |-> FALSE,
   operations |-> <<>>]
WithDirectives(S, directives) == [S EXCEPT !.directives = directives]
WithRoots(S, operations) == [S EXCEPT !.schemaDef = TRUE, !.operations = operations]
Op(operation, type) == [operation |-> operation, type |-> type]
\* Schema data with the two optional fields: n schema definitions, and the
\* directives the document applies, each Use(name, location).
Full(S, n, uses) ==
  [description |-> S.description, types |-> S.types, directives |-> S.directives,
   schemaDef |-> S.schemaDef, operations |-> S.operations,
   schemaDefinitions |-> n, uses |-> uses]
Uses(S, uses) == Full(S, IF S.schemaDef THEN 1 ELSE 0, uses)
Use(name, location) == [name |-> name, location |-> location]
At(D, locations) == [D EXCEPT !.locations = locations]

QueryA == Obj("Query", <<>>, <<F("a", R("Int"))>>)
\* Query { a: Int }, plus types.
With(types) == Schema(<<QueryA>> \o types)
\* Query with one field `f` taking args.
WithArgs(args) == Schema(<<Obj("Query", <<>>, <<FA("f", args, R("Int"))>>)>>)

Is(S, verdict) == Verdict(S) = verdict
IsSeptember2025(S, verdict) == VerdictSeptember2025(S) = verdict

VARIABLE done
Init == done = FALSE
Next == UNCHANGED done

-----------------------------------------------------------------------------
(* §3.6 Objects *)

ObjectRulesHold == ~done =>
  /\ Is(With(<<>>), {})
  /\ Is(Schema(<<Obj("Query", <<>>, <<>>)>>), {"FIELDS_DEFINED"})
  /\ Is(Schema(<<Obj("Query", <<>>, <<F("a", R("Int")), F("a", R("Int"))>>)>>), {"FIELD_NAMES_UNIQUE"})
  /\ Is(Schema(<<Obj("Query", <<>>, <<F("__a", R("Int"))>>)>>), {"FIELD_NAME_RESERVED"})
  \* "Objects are never valid inputs", and input objects never outputs.
  /\ Is(With(<<Obj("O", <<>>, <<F("in", L(R("In")))>>), Input("In", <<Arg("x", R("Int"))>>)>>),
        {"FIELD_OUTPUT_TYPE"})

ArgumentRulesHold == ~done =>
  /\ Is(WithArgs(<<Arg("__x", R("Int"))>>), {"ARG_NAME_RESERVED"})
  /\ Is(WithArgs(<<Arg("x", R("Int")), Arg("x", R("Int"))>>), {"ARG_NAMES_UNIQUE"})
  /\ Is(WithArgs(<<Arg("x", NN(R("Query")))>>), {"ARG_INPUT_TYPE"})
  \* §3.13.3's counter-example: oldArg: String! @deprecated
  /\ Is(WithArgs(<<Dep(Arg("x", NN(R("String"))))>>), {"REQUIRED_ARG_NOT_DEPRECATED"})
  \* "To deprecate a required argument ... it must first be made optional by
  \* either changing the type to nullable or adding a default value."
  /\ Is(WithArgs(<<Dep(Arg("x", R("String")))>>), {})
  /\ Is(WithArgs(<<Dep(ArgD("x", NN(R("String")), V("string", "s")))>>), {})
  \* The @deprecated rule applies to interface and directive arguments too.
  /\ Is(With(<<Iface("I", <<>>, <<FA("f", <<Dep(Arg("x", NN(R("Int"))))>>, R("Int"))>>)>>),
        {"REQUIRED_ARG_NOT_DEPRECATED"})
  /\ Is(WithDirectives(With(<<>>), <<Dir("d", <<Dep(Arg("x", NN(R("Int"))))>>, {})>>),
        {"REQUIRED_ARG_NOT_DEPRECATED"})
  /\ Is(WithDirectives(With(<<>>), <<Dir("d", <<Arg("x", R("Query"))>>, {})>>), {"ARG_INPUT_TYPE"})

-----------------------------------------------------------------------------
(* Default values and literal coercion *)

Colors == Enum("Color", <<"RED", "BLUE">>)
Point == Input("Point", <<Arg("x", NN(R("Int"))), Arg("y", R("Int"))>>)
Pick == OneOf("Pick", <<Arg("a", R("Int")), Arg("b", R("String"))>>)
Filled == Input("Filled", <<ArgD("a", R("Int"), I("1")), Arg("b", R("Int"))>>)
Types == <<Colors, Point, Pick, Filled>>
Coerce(type, v) == CoerceLiteral(With(Types), type, v, TRUE, Fuel)
WithDefault(type, v) == Schema(<<Obj("Query", <<>>, <<FA("f", <<ArgD("x", type, v)>>, R("Int"))>>)>> \o Types)

\* n lists around a type, n one-item lists around a value, and an input
\* object value nested n deep: input Deep { d: Deep v: Int }.
RECURSIVE Lists(_, _), Nested(_, _), DeepValue(_)
Lists(n, type) == IF n = 0 THEN type ELSE L(Lists(n - 1, type))
Nested(n, v) == IF n = 0 THEN v ELSE LV(<<Nested(n - 1, v)>>)
DeepValue(n) == IF n = 0 THEN OV(<<E("v", I("1"))>>) ELSE OV(<<E("d", DeepValue(n - 1))>>)
Deep == Input("Deep", <<Arg("d", R("Deep")), Arg("v", R("Int"))>>)
WithDeepDefault(v) ==
  Schema(<<Obj("Query", <<>>, <<FA("f", <<ArgD("x", R("Deep"), v)>>, R("Int"))>>), Deep>>)

DefaultValuesCoerce == ~done =>
  /\ Is(WithDefault(R("Int"), I("1")), {})
  /\ Is(WithDefault(R("Int"), V("string", "1")), {"ARG_DEFAULT_COMPATIBLE"})
  /\ Is(WithDefault(R("Int"), V("float", "1.5")), {"ARG_DEFAULT_COMPATIBLE"})
  /\ Is(WithDefault(R("Float"), I("1")), {})
  \* "not representable by finite IEEE 754": 1e400 and -1e400 arrive as
  \* "Infinity" and "-Infinity".
  /\ Is(WithDefault(R("Float"), V("float", "1.5")), {})
  /\ Is(WithDefault(R("Float"), V("float", "Infinity")), {"ARG_DEFAULT_COMPATIBLE"})
  /\ Is(WithDefault(R("Float"), V("float", "-Infinity")), {"ARG_DEFAULT_COMPATIBLE"})
  /\ Is(WithDefault(R("Float"), I("Infinity")), {"ARG_DEFAULT_COMPATIBLE"})
  /\ Is(WithDefault(R("ID"), I("4")), {})
  /\ Is(WithDefault(NN(R("Int")), V("null", "")), {"ARG_DEFAULT_COMPATIBLE"})
  \* "[Int] ... 1 ... [1]": a single value is coerced to a list of one.
  /\ Is(WithDefault(L(R("Int")), I("1")), {})
  /\ Coerce(L(R("Int")), I("1")).value = LV(<<V("int", "1")>>)
  \* "[[Int]] ... [1, 2, 3] ... [[1], [2], [3]]"
  /\ Coerce(L(L(R("Int"))), LV(<<I("1"), I("2")>>)).value
       = LV(<<LV(<<V("int", "1")>>), LV(<<V("int", "2")>>)>>)
  /\ Is(WithDefault(L(NN(R("Int"))), LV(<<I("1"), V("null", "")>>)), {"ARG_DEFAULT_COMPATIBLE"})
  \* "this may apply recursively for nested lists", to any depth.
  /\ Is(WithDefault(Lists(12, R("Int")), I("1")), {})
  /\ Is(WithDefault(Lists(12, R("Int")), Nested(12, I("1"))), {})
  /\ Is(WithDefault(Lists(12, R("Int")), Nested(12, V("string", "s"))), {"ARG_DEFAULT_COMPATIBLE"})
  /\ Coerce(Lists(12, R("Int")), I("1")).value = Nested(12, V("int", "1"))
  /\ Is(WithDeepDefault(DeepValue(12)), {})
  /\ Is(WithDeepDefault(OV(<<E("d", DeepValue(12)), E("x", I("1"))>>)), {"ARG_DEFAULT_COMPATIBLE"})
  \* "GraphQL string literals must not be accepted as an enum input"
  /\ Is(WithDefault(R("Color"), V("enum", "RED")), {})
  /\ Is(WithDefault(R("Color"), V("string", "RED")), {"ARG_DEFAULT_COMPATIBLE"})
  /\ Is(WithDefault(R("Color"), V("enum", "GREEN")), {"ARG_DEFAULT_COMPATIBLE"})
  \* §3.10's table: { a: "abc" } is "Error: Missing required field {b}", and
  \* { b: 123, c: "xyz" } is "Error: Unexpected field {c}".
  /\ Is(WithDefault(R("Point"), OV(<<E("x", I("1"))>>)), {})
  /\ Is(WithDefault(R("Point"), OV(<<E("y", I("1"))>>)), {"ARG_DEFAULT_COMPATIBLE"})
  /\ Is(WithDefault(R("Point"), OV(<<E("x", I("1")), E("z", I("1"))>>)), {"ARG_DEFAULT_COMPATIBLE"})
  \* §3.10.1's table: { a: "abc", b: 123 } is "Error: Exactly one key must
  \* be specified", { a: null } is "Error: Value for member field {a} must be
  \* non-null".
  /\ Is(WithDefault(R("Pick"), OV(<<E("a", I("1"))>>)), {})
  /\ Is(WithDefault(R("Pick"), OV(<<E("a", I("1")), E("b", V("string", "s"))>>)), {"ARG_DEFAULT_COMPATIBLE"})
  /\ Is(WithDefault(R("Pick"), OV(<<E("a", V("null", ""))>>)), {"ARG_DEFAULT_COMPATIBLE"})
  /\ Is(WithDefault(R("Pick"), OV(<<>>)), {"ARG_DEFAULT_COMPATIBLE"})
  \* A missing field with a default takes the default.
  /\ Coerce(R("Filled"), OV(<<E("b", I("2"))>>)).value = OV(<<E("a", V("int", "1")), E("b", V("int", "2"))>>)
  \* September 2026 states the rule for object field arguments only.
  /\ LET S == With(<<Iface("I", <<>>, <<FA("f", <<ArgD("x", R("Int"), V("string", "s"))>>, R("Int"))>>)>>)
     IN Is(S, {}) /\ ~OtherDefaultsAreCompatible(S)

-----------------------------------------------------------------------------
(* IsValidImplementation and IsValidImplementationFieldType *)

\* interface Node { f: <iface> }, type Obj implements Node { f: <impl> },
\* with Obj2, a union of both, and Sub, an interface implementing Node.
Impl(ifaceType, implType) ==
  With(<<Iface("Node", <<>>, <<F("f", ifaceType)>>),
         Obj("Obj", <<"Node">>, <<F("f", implType)>>),
         Obj("Obj2", <<>>, <<F("x", R("Int"))>>),
         Union("U", <<"Obj", "Obj2">>),
         Iface("Sub", <<"Node">>, <<F("f", ifaceType)>>)>>)
ImplArgs(ifaceArgs, implArgs) ==
  With(<<Iface("Node", <<>>, <<FA("f", ifaceArgs, R("Int"))>>),
         Obj("Obj", <<"Node">>, <<FA("f", implArgs, R("Int"))>>)>>)

ImplementationsAreChecked == ~done =>
  \* Covariance through Non-Null and lists
  /\ Is(Impl(R("Int"), R("Int")), {})
  /\ Is(Impl(R("Int"), NN(R("Int"))), {})
  /\ Is(Impl(NN(R("Int")), R("Int")), {"IMPL_FIELD_COVARIANT"})
  /\ Is(Impl(L(R("Int")), NN(L(NN(R("Int"))))), {})
  /\ Is(Impl(NN(L(R("Int"))), L(R("Int"))), {"IMPL_FIELD_COVARIANT"})
  /\ Is(Impl(L(R("Int")), R("Int")), {"IMPL_FIELD_COVARIANT"})
  /\ Is(Impl(L(L(R("Int"))), L(R("Int"))), {"IMPL_FIELD_COVARIANT"})
  /\ Is(Impl(R("Int"), R("String")), {"IMPL_FIELD_COVARIANT"})
  \* IsSubType: an object implementing the interface, a union member, an
  \* interface implementing the interface
  /\ Is(Impl(R("Node"), R("Obj")), {})
  /\ Is(Impl(L(R("Node")), L(NN(R("Obj")))), {})
  /\ Is(Impl(R("U"), R("Obj")), {})
  /\ Is(Impl(R("Node"), R("Sub")), {})
  /\ Is(Impl(R("Node"), R("Obj2")), {"IMPL_FIELD_COVARIANT"})
  /\ Is(Impl(R("Obj"), R("Node")), {"IMPL_FIELD_COVARIANT"})
  \* Arguments: provided, invariant, additional ones optional
  /\ Is(ImplArgs(<<Arg("a", R("Int"))>>, <<Arg("a", R("Int"))>>), {})
  /\ Is(ImplArgs(<<Arg("a", R("Int"))>>, <<>>), {"IMPL_ARG_PROVIDED"})
  /\ Is(ImplArgs(<<Arg("a", R("Int"))>>, <<Arg("a", NN(R("Int")))>>), {"IMPL_ARG_INVARIANT"})
  /\ Is(ImplArgs(<<Arg("a", NN(R("Int")))>>, <<Arg("a", R("Int"))>>), {"IMPL_ARG_INVARIANT"})
  /\ Is(ImplArgs(<<>>, <<Arg("b", R("Int"))>>), {})
  /\ Is(ImplArgs(<<>>, <<Arg("b", NN(R("Int")))>>), {"IMPL_EXTRA_ARG_OPTIONAL"})
  /\ Is(ImplArgs(<<>>, <<ArgD("b", NN(R("Int")), I("1"))>>), {})
  \* Fields provided; deprecation
  /\ Is(With(<<Iface("Node", <<>>, <<F("f", R("Int"))>>), Obj("Obj", <<"Node">>, <<F("g", R("Int"))>>)>>),
        {"IMPL_FIELD_PROVIDED"})
  /\ Is(With(<<Iface("Node", <<>>, <<F("f", R("Int"))>>), Obj("Obj", <<"Node">>, <<Dep(F("f", R("Int")))>>)>>),
        {"IMPL_DEPRECATION"})
  /\ Is(With(<<Iface("Node", <<>>, <<Dep(F("f", R("Int")))>>), Obj("Obj", <<"Node">>, <<F("f", R("Int"))>>)>>), {})
  \* Transitive interfaces (§3.7's Resource/Node/Image example)
  /\ LET node == Iface("Node", <<>>, <<F("id", R("ID"))>>)
         resource == Iface("Resource", <<"Node">>, <<F("id", R("ID")), F("url", R("String"))>>)
     IN /\ Is(With(<<node, resource, Obj("Image", <<"Resource", "Node">>, <<F("id", R("ID")), F("url", R("String"))>>)>>), {})
        /\ Is(With(<<node, resource, Obj("Image", <<"Resource">>, <<F("id", R("ID")), F("url", R("String"))>>)>>),
              {"IMPL_TRANSITIVE"})

-----------------------------------------------------------------------------
(* §3.7 Interfaces *)

NodeNamedCycle ==
  \* §3.7's counter-example: Node and Named implement themselves and each
  \* other.
  With(<<Iface("Node", <<"Named", "Node">>, <<F("id", R("ID")), F("name", R("String"))>>),
         Iface("Named", <<"Node", "Named">>, <<F("id", R("ID")), F("name", R("String"))>>)>>)
PairCycle ==
  With(<<Iface("A", <<"B">>, <<F("x", R("Int"))>>), Iface("B", <<"A">>, <<F("x", R("Int"))>>)>>)

InterfacesHaveNoCycles == ~done =>
  /\ Is(NodeNamedCycle, {"IMPLEMENTS_ITSELF"})
  /\ Is(PairCycle, {"IMPL_TRANSITIVE"})
  /\ Is(With(<<Iface("A", <<"A">>, <<F("x", R("Int"))>>)>>), {"IMPLEMENTS_ITSELF"})
  \* every cycle is rejected
  /\ \A S \in {NodeNamedCycle, PairCycle} : HasInterfaceCycle(S) /\ ~IsValidSchema(S)
  /\ ~HasInterfaceCycle(Impl(R("Node"), R("Sub")))
  /\ Is(With(<<Iface("A", <<>>, <<F("x", R("Int"))>>), Obj("O", <<"A", "A">>, <<F("x", R("Int"))>>)>>),
        {"IMPLEMENTS_UNIQUE"})
  /\ Is(With(<<Obj("O", <<"Query">>, <<F("a", R("Int"))>>)>>), {"IMPLEMENTS_INTERFACES"})

-----------------------------------------------------------------------------
(* §3.8 Unions and §3.9 Enums *)

UnionAndEnumRulesHold == ~done =>
  /\ Is(With(<<Union("U", <<"Query">>)>>), {})
  /\ Is(With(<<Union("U", <<>>)>>), {"UNION_MEMBERS_DEFINED"})
  /\ Is(With(<<Union("U", <<"Query", "Query">>)>>), {"UNION_MEMBERS_UNIQUE"})
  /\ Is(With(<<Union("U", <<"Int">>)>>), {"UNION_MEMBERS_OBJECTS"})
  /\ Is(With(<<Union("U", <<"I">>), Iface("I", <<>>, <<F("x", R("Int"))>>)>>), {"UNION_MEMBERS_OBJECTS"})
  /\ Is(With(<<Union("U", <<"Query", "V">>), Union("V", <<"Query">>)>>), {"UNION_MEMBERS_OBJECTS"})
  /\ Is(With(<<Enum("E", <<"A", "B">>)>>), {})
  /\ Is(With(<<Enum("E", <<>>)>>), {"ENUM_VALUES_DEFINED"})
  /\ Is(With(<<Enum("E", <<"A", "A">>)>>), {"ENUM_VALUES_UNIQUE"})
  /\ Is(With(<<Enum("E", <<"__A">>)>>), {"ENUM_VALUE_NAME_RESERVED"})
  /\ Is(With(<<Enum("E", <<"_A">>)>>), {})

-----------------------------------------------------------------------------
(* §3.10 Input Objects *)

InputObjectRulesHold == ~done =>
  /\ Is(With(<<Input("In", <<Arg("x", R("Int"))>>)>>), {})
  /\ Is(With(<<Input("In", <<>>)>>), {"INPUT_FIELDS_DEFINED"})
  /\ Is(With(<<Input("In", <<Arg("x", R("Int")), Arg("x", R("Int"))>>)>>), {"INPUT_FIELD_NAMES_UNIQUE"})
  /\ Is(With(<<Input("In", <<Arg("__x", R("Int"))>>)>>), {"INPUT_FIELD_NAME_RESERVED"})
  /\ Is(With(<<Input("In", <<Arg("x", R("Query"))>>)>>), {"INPUT_FIELD_INPUT_TYPE"})
  /\ Is(With(<<Input("In", <<Dep(Arg("x", NN(R("Int"))))>>)>>), {"REQUIRED_INPUT_FIELD_NOT_DEPRECATED"})
  /\ Is(With(<<Input("In", <<Dep(ArgD("x", NN(R("Int")), I("1")))>>)>>), {})
  \* OneOf: "The type of the input field must be nullable." "The input field
  \* must not have a default value."
  /\ Is(With(<<OneOf("In", <<Arg("a", R("Int")), Arg("b", R("String"))>>)>>), {})
  /\ Is(With(<<OneOf("In", <<Arg("a", NN(R("Int")))>>)>>), {"ONEOF_FIELD_NULLABLE"})
  /\ Is(With(<<OneOf("In", <<ArgD("a", R("Int"), I("1"))>>)>>), {"ONEOF_FIELD_NO_DEFAULT"})

\* §3.10's examples and counter-examples of circular references.
UnbreakableCyclesAreFound == ~done =>
  /\ Is(With(<<Input("Example", <<Arg("self", R("Example")), Arg("value", R("String"))>>)>>), {})
  /\ Is(With(<<Input("Example", <<Arg("self", NN(L(NN(R("Example"))))), Arg("value", R("String"))>>)>>), {})
  /\ Is(With(<<Input("Example", <<Arg("self", NN(R("Example"))), Arg("value", R("String"))>>)>>),
        {"INPUT_OBJECT_UNBREAKABLE_CYCLE"})
  /\ Is(With(<<Input("First", <<Arg("second", NN(R("Second"))), Arg("value", R("String"))>>),
               Input("Second", <<Arg("first", NN(R("First"))), Arg("value", R("String"))>>)>>),
        {"INPUT_OBJECT_UNBREAKABLE_CYCLE"})
  \* "This example is invalid because providing a value for First requires a
  \* non-null Second, and constructing a Second requires a non-null First"
  /\ Is(With(<<OneOf("First", <<Arg("second", R("Second"))>>),
               Input("Second", <<Arg("first", NN(R("First")))>>)>>),
        {"INPUT_OBJECT_UNBREAKABLE_CYCLE"})
  \* A OneOf input object breaks the cycle with any field that does.
  /\ Is(With(<<OneOf("First", <<Arg("second", R("Second")), Arg("value", R("String"))>>),
               Input("Second", <<Arg("first", NN(R("First")))>>)>>), {})
  /\ Is(With(<<OneOf("A", <<Arg("b", R("B"))>>), OneOf("B", <<Arg("a", R("A"))>>)>>),
        {"INPUT_OBJECT_UNBREAKABLE_CYCLE"})
  /\ Is(With(<<OneOf("A", <<Arg("b", L(R("A")))>>)>>), {})
  \* A type that only reaches a cycle is itself uninhabitable.
  /\ ~HasNoUnbreakableCycle(With(<<Input("A", <<Arg("c", NN(R("C")))>>), Input("C", <<Arg("c", NN(R("C")))>>)>>),
                             Input("A", <<Arg("c", NN(R("C")))>>))
  \* September 2025's rule, "at least one of the fields in the chain of
  \* references must be either a nullable or a List type", agrees on plain
  \* input objects, and finds no cycle through a OneOf input object's
  \* nullable fields (graphql-spec #1211 changed that in September 2026).
  /\ IsSeptember2025(With(<<Input("Example", <<Arg("self", R("Example")), Arg("value", R("String"))>>)>>), {})
  /\ IsSeptember2025(With(<<Input("Example", <<Arg("self", NN(L(NN(R("Example"))))), Arg("value", R("String"))>>)>>), {})
  /\ IsSeptember2025(With(<<Input("Example", <<Arg("self", NN(R("Example"))), Arg("value", R("String"))>>)>>),
                     {"INPUT_OBJECT_UNBREAKABLE_CYCLE"})
  /\ IsSeptember2025(With(<<Input("First", <<Arg("second", NN(R("Second"))), Arg("value", R("String"))>>),
                            Input("Second", <<Arg("first", NN(R("First"))), Arg("value", R("String"))>>)>>),
                     {"INPUT_OBJECT_UNBREAKABLE_CYCLE"})
  /\ IsSeptember2025(With(<<Input("First", <<Arg("second", NN(R("Second"))), Arg("value", R("String"))>>),
                            Input("Second", <<Arg("first", R("First")), Arg("value", R("String"))>>)>>), {})
  /\ IsSeptember2025(With(<<OneOf("First", <<Arg("second", R("Second"))>>),
                            Input("Second", <<Arg("first", NN(R("First")))>>)>>), {})
  /\ IsSeptember2025(With(<<OneOf("A", <<Arg("b", R("B"))>>), OneOf("B", <<Arg("a", R("A"))>>)>>), {})
  \* A chain through a third type, and one that only reaches a cycle.
  /\ IsSeptember2025(With(<<Input("A", <<Arg("b", NN(R("B")))>>), Input("B", <<Arg("c", NN(R("C")))>>),
                            Input("C", <<Arg("a", NN(R("A")))>>)>>), {"INPUT_OBJECT_UNBREAKABLE_CYCLE"})
  /\ ~HasNoUnbrokenNonNullChain(With(<<Input("A", <<Arg("c", NN(R("C")))>>), Input("C", <<Arg("c", NN(R("C")))>>)>>),
                                 Input("C", <<Arg("c", NN(R("C")))>>))
  /\ HasNoUnbrokenNonNullChain(With(<<Input("A", <<Arg("c", NN(R("C")))>>), Input("C", <<Arg("c", NN(R("C")))>>)>>),
                                Input("A", <<Arg("c", NN(R("C")))>>))
  \* Every other rule is September 2026's.
  /\ IsSeptember2025(With(<<OneOf("In", <<Arg("a", NN(R("Int")))>>)>>), {"ONEOF_FIELD_NULLABLE"})

DefaultValueCyclesAreFound == ~done =>
  \* input I { i: I = {} }
  /\ Is(With(<<Input("I", <<ArgD("i", R("I"), OV(<<>>))>>)>>), {"INPUT_OBJECT_DEFAULT_VALUE_CYCLE"})
  /\ Is(With(<<Input("I", <<ArgD("i", R("I"), OV(<<E("i", V("null", ""))>>))>>)>>), {})
  \* input I { i: I = {i: {}} }: the cycle runs through a provided value.
  /\ Is(With(<<Input("I", <<ArgD("i", R("I"), OV(<<E("i", OV(<<>>))>>))>>)>>),
        {"INPUT_OBJECT_DEFAULT_VALUE_CYCLE"})
  \* input I { i: [I] = [{}] }
  /\ Is(With(<<Input("I", <<ArgD("i", L(R("I")), LV(<<OV(<<>>)>>))>>)>>),
        {"INPUT_OBJECT_DEFAULT_VALUE_CYCLE"})
  \* input A { b: B = {} } input B { a: A = {} }
  /\ Is(With(<<Input("A", <<ArgD("b", R("B"), OV(<<>>))>>), Input("B", <<ArgD("a", R("A"), OV(<<>>))>>)>>),
        {"INPUT_OBJECT_DEFAULT_VALUE_CYCLE"})
  \* input A { b: B = {a: null} } input B { a: A = {b: null} }
  /\ Is(With(<<Input("A", <<ArgD("b", R("B"), OV(<<E("a", V("null", ""))>>))>>),
               Input("B", <<ArgD("a", R("A"), OV(<<E("b", V("null", ""))>>))>>)>>), {})

-----------------------------------------------------------------------------
(* §3.13 Directives *)

DirectiveRulesHold == ~done =>
  /\ Is(WithDirectives(With(<<>>), <<Dir("d", <<Arg("x", R("Int"))>>, {})>>), {})
  /\ Is(WithDirectives(With(<<>>), <<Dir("__d", <<>>, {})>>), {"DIRECTIVE_NAME_RESERVED"})
  /\ Is(WithDirectives(With(<<>>), <<Dir("d", <<>>, {}), Dir("d", <<>>, {})>>), {"DIRECTIVE_NAMES_UNIQUE"})
  /\ Is(WithDirectives(With(<<>>), <<[Dir("d", <<>>, {}) EXCEPT !.locations = <<>>]>>),
        {"DIRECTIVE_LOCATIONS_DEFINED"})
  \* §3.13's counter-example:
  \* directive @invalidExample(arg: String @invalidExample) on ARGUMENT_DEFINITION
  /\ Is(WithDirectives(With(<<>>), <<Dir("invalidExample", <<Arg("arg", R("String"))>>, {"invalidExample"})>>),
        {"DIRECTIVE_USES_ITSELF"})
  \* Through an input object: directive @d(a: In), input In { f: Int @d }.
  \* This follows the prose; the formal rule doesn't settle it (see
  \* DoesNotReferenceItselfIndirectly).
  /\ Is(WithDirectives(With(<<Using(Input("In", <<Arg("f", R("Int"))>>), {"d"})>>),
                       <<Dir("d", <<Arg("a", R("In"))>>, {})>>),
        {"DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY"})
  \* Through another directive: @d(a: Int @e), @e(b: Int @d)
  /\ Is(WithDirectives(With(<<>>), <<Dir("d", <<Arg("a", R("Int"))>>, {"e"}), Dir("e", <<Arg("b", R("Int"))>>, {"d"})>>),
        {"DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY"})
  \* Using a directive that doesn't lead back is fine.
  /\ Is(WithDirectives(With(<<Using(Input("In", <<Arg("f", R("Int"))>>), {"e"})>>),
                       <<Dir("d", <<Arg("a", R("In"))>>, {}), Dir("e", <<>>, {})>>), {})

\* "Directives must only be used in the locations they are declared to belong
\* in."
DirectiveUsesAreChecked == ~done =>
  \* §3.13's example: directive @example on FIELD_DEFINITION | ARGUMENT_DEFINITION,
  \* type SomeType { field(arg: Int @example): String @example }
  /\ Is(Uses(WithDirectives(With(<<>>), <<At(Dir("example", <<>>, {}), <<"FIELD_DEFINITION", "ARGUMENT_DEFINITION">>)>>),
             <<Use("example", "ARGUMENT_DEFINITION"), Use("example", "FIELD_DEFINITION")>>), {})
  \* directive @d on FIELD, applied to a field definition
  /\ Is(Uses(WithDirectives(With(<<>>), <<Dir("d", <<>>, {})>>), <<Use("d", "FIELD_DEFINITION")>>),
        {"DIRECTIVE_LOCATIONS_VALID"})
  \* Built-in directives need no definition, and have their own locations.
  /\ Is(Uses(With(<<>>), <<Use("deprecated", "FIELD_DEFINITION"), Use("deprecated", "ARGUMENT_DEFINITION"),
                          Use("specifiedBy", "SCALAR"), Use("oneOf", "INPUT_OBJECT")>>), {})
  /\ Is(Uses(With(<<>>), <<Use("deprecated", "OBJECT")>>), {"DIRECTIVE_LOCATIONS_VALID"})
  /\ Is(Uses(With(<<>>), <<Use("skip", "FIELD_DEFINITION")>>), {"DIRECTIVE_LOCATIONS_VALID"})
  \* A directive that is neither defined nor built in.
  /\ Is(Uses(With(<<>>), <<Use("notDefined", "OBJECT")>>), {"DIRECTIVES_DEFINED"})
  /\ Is(Uses(WithDirectives(With(<<>>), <<At(Dir("notDefined", <<>>, {}), <<"OBJECT">>)>>), <<Use("notDefined", "OBJECT")>>), {})
  \* Without the optional field, no use is checked.
  /\ Is(With(<<>>), {})

-----------------------------------------------------------------------------
(* §3.3 Schema and §3.3.1 Root Operation Types *)

RootTypesAreChecked == ~done =>
  /\ Is(Schema(<<Obj("Q", <<>>, <<F("a", R("Int"))>>)>>), {"QUERY_ROOT_PROVIDED"})
  /\ Is(WithRoots(Schema(<<Obj("Q", <<>>, <<F("a", R("Int"))>>)>>), <<Op("query", "Q")>>), {})
  /\ Is(WithRoots(Schema(<<Obj("M", <<>>, <<F("a", R("Int"))>>)>>), <<Op("mutation", "M")>>), {"QUERY_ROOT_PROVIDED"})
  /\ Is(Schema(<<Iface("Query", <<>>, <<F("a", R("Int"))>>)>>), {"ROOT_TYPES_ARE_OBJECTS"})
  \* "This example describes a valid GraphQL schema without a mutation root
  \* operation type, even though it contains a type named "Mutation"."
  /\ Is(WithRoots(With(<<Iface("Mutation", <<>>, <<F("a", R("Int"))>>)>>), <<Op("query", "Query")>>), {})
  /\ Is(With(<<Iface("Mutation", <<>>, <<F("a", R("Int"))>>)>>), {"ROOT_TYPES_ARE_OBJECTS"})
  /\ Is(WithRoots(With(<<>>), <<Op("query", "Query"), Op("mutation", "Query")>>), {"ROOT_TYPES_DIFFERENT"})
  /\ RootTypeName(With(<<Obj("Subscription", <<>>, <<F("a", R("Int"))>>)>>), "subscription") = <<"Subscription">>
  \* "a document must include at most one schema definition"
  /\ Is(Full(WithRoots(With(<<>>), <<Op("query", "Query")>>), 2, <<>>), {"SCHEMA_DEFINITION_UNIQUE"})
  /\ Is(Full(WithRoots(With(<<>>), <<Op("query", "Query")>>), 1, <<>>), {})
  /\ SchemaDefinitionCount(WithRoots(With(<<>>), <<Op("query", "Query")>>)) = 1
  /\ SchemaDefinitionCount(With(<<>>)) = 0

\* A name the document doesn't define is no type: no output or input type,
\* no Object or Interface type.
UndefinedTypesAreChecked == ~done =>
  /\ Is(Schema(<<Obj("Query", <<>>, <<F("a", R("Missing"))>>)>>), {"FIELD_OUTPUT_TYPE"})
  /\ Is(WithArgs(<<Arg("x", L(R("Missing")))>>), {"ARG_INPUT_TYPE"})
  /\ Is(With(<<Input("In", <<Arg("x", R("Missing"))>>)>>), {"INPUT_FIELD_INPUT_TYPE"})
  /\ Is(With(<<Union("U", <<"Missing">>)>>), {"UNION_MEMBERS_OBJECTS"})
  /\ Is(Schema(<<Obj("Query", <<"Missing">>, <<F("a", R("Int"))>>)>>), {"IMPLEMENTS_INTERFACES"})
  /\ Is(WithRoots(With(<<>>), <<Op("query", "Missing")>>), {"ROOT_TYPES_ARE_OBJECTS"})

NamesAreChecked == ~done =>
  /\ Is(With(<<Obj("__T", <<>>, <<F("a", R("Int"))>>)>>), {"TYPE_NAME_RESERVED"})
  /\ Is(With(<<Obj("_T", <<>>, <<F("a", R("Int"))>>)>>), {})
  /\ Is(With(<<Scalar("Date")>>), {})
  /\ Is(With(<<Scalar("String")>>), {"TYPE_NAME_NOT_BUILTIN"})
  /\ Is(With(<<Scalar("A"), Scalar("A")>>), {"TYPE_NAMES_UNIQUE"})
====
