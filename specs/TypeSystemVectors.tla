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
\* A use of a directive at a site, applied by the extension-th extension
\* (0: by a definition), with arguments args.
UseAt(name, location, site, extension, args) ==
  [name |-> name, location |-> location, site |-> site, extension |-> extension, args |-> args]
\* A use on an element of its own.
Use(name, location) == UseAt(name, location, <<"ELEMENT", location>>, 0, <<>>)
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
  \* A type and a directive may share a name, and both are references:
  \* directive @d(arg: Int @e), directive @e(arg: X), directive @Y,
  \* input X { a: Y @Y }, input Y { b: Int @d }. @d uses @e, whose
  \* argument's type X names the type Y, which uses @d.
  /\ LET X == Using(Input("X", <<Arg("a", R("Y"))>>), {"Y"})
         Y == Using(Input("Y", <<Arg("b", R("Int"))>>), {"d"})
         dirs(y) == <<Dir("d", <<Arg("arg", R("Int"))>>, {"e"}), Dir("e", <<Arg("arg", R("X"))>>, {}), Dir(y, <<>>, {})>>
     IN /\ Is(WithDirectives(With(<<X, Y>>), dirs("Y")), {"DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY"})
        \* Without the type Y's use of @d, nothing leads back.
        /\ Is(WithDirectives(With(<<X, Using(Y, {})>>), dirs("Y")), {})

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
                          UseAt("specifiedBy", "SCALAR", <<"ELEMENT", "SCALAR">>, 0, <<E("url", V("string", "x"))>>),
                          Use("oneOf", "INPUT_OBJECT")>>), {})
  /\ Is(Uses(With(<<>>), <<Use("deprecated", "OBJECT")>>), {"DIRECTIVE_LOCATIONS_VALID"})
  /\ Is(Uses(With(<<>>), <<UseAt("skip", "FIELD_DEFINITION", <<"ELEMENT", "1">>, 0, <<E("if", V("boolean", "true"))>>)>>),
        {"DIRECTIVE_LOCATIONS_VALID"})
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

-----------------------------------------------------------------------------
(* Type system extensions: §3.3.2, §3.5.6, §3.6.3, §3.7.1, §3.8.1, §3.9.1, *)
(* §3.10.2 and §3.13.6                                                     *)

Ext(kind, name) ==
  [kind |-> kind, name |-> name, fields |-> <<>>, interfaces |-> <<>>, members |-> <<>>,
   values |-> <<>>, inputFields |-> <<>>, operations |-> <<>>, oneOf |-> FALSE, directives |-> {}]
ExtFields(kind, name, fields) == [Ext(kind, name) EXCEPT !.fields = fields]
ExtImplements(name, interfaces, fields) == [ExtFields("OBJECT", name, fields) EXCEPT !.interfaces = interfaces]
EV(names) == [k \in DOMAIN names |-> [name |-> names[k], description |-> <<>>, deprecated |-> <<>>]]
\* Schema data with extensions, the directives the document applies, and
\* one schema definition if S has one.
Doc(S, exts, uses) ==
  [description |-> S.description, types |-> S.types, directives |-> S.directives,
   schemaDef |-> S.schemaDef, operations |-> S.operations,
   schemaDefinitions |-> IF S.schemaDef THEN 1 ELSE 0, uses |-> uses, extensions |-> exts]
Exts(S, exts) == Doc(S, exts, <<>>)

ExtensionsAreChecked == ~done =>
  \* §3.6.3's example: extend type Story { isHiddenLocally: Boolean }
  /\ LET S == Exts(With(<<Obj("Story", <<>>, <<F("id", R("ID"))>>)>>),
                   <<ExtFields("OBJECT", "Story", <<F("isHiddenLocally", R("Boolean"))>>)>>)
     IN Is(S, {}) /\ HasField(TypeNamed(Extended(S), "Story"), "isHiddenLocally")
  \* "The named type must already be defined and must be an Object type."
  /\ Is(Exts(With(<<>>), <<ExtFields("OBJECT", "Missing", <<F("b", R("Int"))>>)>>), {"EXTENSION_TARGET_DEFINED"})
  /\ Is(Exts(With(<<Scalar("S")>>), <<ExtFields("OBJECT", "S", <<F("b", R("Int"))>>)>>), {"EXTENSION_TARGET_KIND"})
  /\ Is(Exts(With(<<Enum("E", <<"A">>)>>), <<[Ext("UNION", "E") EXCEPT !.members = <<"Query">>]>>), {"EXTENSION_TARGET_KIND"})
  \* A built-in scalar is defined, and is a Scalar type.
  /\ Is(Exts(With(<<>>), <<Ext("SCALAR", "Int")>>), {})
  /\ Is(Exts(With(<<>>), <<ExtFields("OBJECT", "Int", <<F("b", R("Int"))>>)>>), {"EXTENSION_TARGET_KIND"})
  \* Unique within the extension, and new to the previous type, which
  \* includes the extensions before it.
  /\ Is(Exts(With(<<>>), <<ExtFields("OBJECT", "Query", <<F("b", R("Int")), F("b", R("Int"))>>)>>), {"EXTENSION_ITEMS_UNIQUE"})
  /\ Is(Exts(With(<<>>), <<ExtFields("OBJECT", "Query", <<F("a", R("Int"))>>)>>), {"EXTENSION_ITEMS_NEW"})
  /\ Is(Exts(With(<<>>), <<ExtFields("OBJECT", "Query", <<F("b", R("Int"))>>),
                          ExtFields("OBJECT", "Query", <<F("b", R("Int"))>>)>>), {"EXTENSION_ITEMS_NEW"})
  /\ Is(Exts(With(<<Enum("E", <<"A">>)>>), <<[Ext("ENUM", "E") EXCEPT !.values = EV(<<"A">>)]>>), {"EXTENSION_ITEMS_NEW"})
  /\ Is(Exts(With(<<Enum("E", <<"A">>)>>), <<[Ext("ENUM", "E") EXCEPT !.values = EV(<<"B", "B">>)]>>), {"EXTENSION_ITEMS_UNIQUE"})
  /\ Is(Exts(With(<<Union("U", <<"Query">>)>>), <<[Ext("UNION", "U") EXCEPT !.members = <<"Query">>]>>), {"EXTENSION_ITEMS_NEW"})
  /\ Is(Exts(With(<<Input("In", <<Arg("x", R("Int"))>>)>>), <<[Ext("INPUT_OBJECT", "In") EXCEPT !.inputFields = <<Arg("x", R("Int"))>>]>>),
        {"EXTENSION_ITEMS_NEW"})
  \* "Any interfaces provided must not be already implemented by the
  \* previous Object type."
  /\ LET IfaceI == Iface("I", <<>>, <<F("a", R("Int"))>>) IN
     /\ Is(Exts(Schema(<<Obj("Query", <<"I">>, <<F("a", R("Int"))>>), IfaceI>>), <<ExtImplements("Query", <<"I">>, <<>>)>>),
           {"EXTENSION_INTERFACES_NEW"})
     \* "The resulting extended object type must be a super-set of all
     \* interfaces it implements."
     /\ Is(Exts(Schema(<<Obj("Query", <<>>, <<F("b", R("Int"))>>), IfaceI>>), <<ExtImplements("Query", <<"I">>, <<>>)>>),
           {"IMPL_FIELD_PROVIDED"})
     /\ Is(Exts(Schema(<<Obj("Query", <<>>, <<F("b", R("Int"))>>), IfaceI>>), <<ExtImplements("Query", <<"I">>, <<F("a", R("Int"))>>)>>),
           {})
     \* The same interface twice in one extension is the extended type's
     \* "unique interfaces" rule's.
     /\ Is(Exts(Schema(<<Obj("Query", <<>>, <<F("a", R("Int"))>>), IfaceI>>), <<ExtImplements("Query", <<"I", "I">>, <<>>)>>),
           {"IMPLEMENTS_UNIQUE"})
  \* §3.7.1 has no rule like §3.6.3's, but an interface type extension that
  \* adds an interface the type already implements leaves the resulting type
  \* implementing it twice, against §3.7's "one or more unique interfaces".
  /\ LET IfaceA == Iface("A", <<>>, <<F("a", R("Int"))>>)
         IfaceB == Iface("B", <<>>, <<F("a", R("Int"))>>)
         IfaceIA == Iface("I", <<"A">>, <<F("a", R("Int"))>>)
         Adds(names) == [Ext("INTERFACE", "I") EXCEPT !.interfaces = names]
     IN /\ Is(Exts(With(<<IfaceA, IfaceB, IfaceIA>>), <<Adds(<<"A">>)>>), {"IMPLEMENTS_UNIQUE"})
        /\ Is(Exts(With(<<IfaceA, IfaceB, IfaceIA>>), <<Adds(<<"B">>)>>), {})
        /\ TypeNamed(Extended(Exts(With(<<IfaceA, IfaceB, IfaceIA>>), <<Adds(<<"B">>)>>)), "I").interfaces = <<"A", "B">>
        \* The same when an earlier extension added it.
        /\ Is(Exts(With(<<IfaceA, IfaceB, Iface("I", <<>>, <<F("a", R("Int"))>>)>>), <<Adds(<<"A">>), Adds(<<"A">>)>>),
              {"IMPLEMENTS_UNIQUE"})
  \* §3.7.1's example: extend interface NamedEntity { nickname: String },
  \* with its implementations extended too.
  /\ LET named == Iface("NamedEntity", <<>>, <<F("name", R("String"))>>)
         person == Obj("Person", <<"NamedEntity">>, <<F("name", R("String"))>>)
         business == Obj("Business", <<"NamedEntity">>, <<F("name", R("String"))>>)
         nickname == <<F("nickname", R("String"))>>
     IN /\ Is(Exts(With(<<named, person, business>>),
                    <<ExtFields("INTERFACE", "NamedEntity", nickname), ExtFields("OBJECT", "Person", nickname),
                      ExtFields("OBJECT", "Business", nickname)>>), {})
        \* "Any Object or Interface type which implemented the previous
        \* Interface type must also be a super-set of the fields of the
        \* Interface type extension"
        /\ Is(Exts(With(<<named, person, business>>),
                    <<ExtFields("INTERFACE", "NamedEntity", nickname), ExtFields("OBJECT", "Person", nickname)>>),
              {"IMPL_FIELD_PROVIDED"})
  \* "The member types of a Union type extension must all be Object base
  \* types": the extended union's rule.
  /\ Is(Exts(With(<<Union("U", <<"Query">>), Iface("I", <<>>, <<F("x", R("Int"))>>)>>),
             <<[Ext("UNION", "U") EXCEPT !.members = <<"I">>]>>), {"UNION_MEMBERS_OBJECTS"})
  \* OneOf: "The @oneOf directive must not be provided by an Input Object
  \* type extension." If the original is OneOf, the extension's fields are
  \* nullable and have no default: the extended type's own rules.
  /\ Is(Exts(With(<<Input("In", <<Arg("a", R("Int"))>>)>>), <<[Ext("INPUT_OBJECT", "In") EXCEPT !.oneOf = TRUE]>>),
        {"EXTENSION_ONEOF"})
  /\ Is(Exts(With(<<OneOf("In", <<Arg("a", R("Int"))>>)>>), <<[Ext("INPUT_OBJECT", "In") EXCEPT !.inputFields = <<Arg("b", NN(R("Int")))>>]>>),
        {"ONEOF_FIELD_NULLABLE"})
  /\ Is(Exts(With(<<OneOf("In", <<Arg("a", R("Int"))>>)>>), <<[Ext("INPUT_OBJECT", "In") EXCEPT !.inputFields = <<ArgD("b", R("Int"), I("1"))>>]>>),
        {"ONEOF_FIELD_NO_DEFAULT"})
  /\ Is(Exts(With(<<OneOf("In", <<Arg("a", R("Int"))>>)>>), <<[Ext("INPUT_OBJECT", "In") EXCEPT !.inputFields = <<Arg("b", R("Int"))>>]>>), {})
  \* Schema extensions: "The Schema must already be defined." The operation
  \* types they add are the schema's.
  /\ LET M == Obj("M", <<>>, <<F("a", R("Int"))>>)
         addM == [Ext("SCHEMA", "") EXCEPT !.operations = <<Op("mutation", "M")>>]
     IN /\ Is(Exts(With(<<M>>), <<addM>>), {"SCHEMA_EXTENSION_DEFINED"})
        /\ Is(Exts(WithRoots(With(<<M>>), <<Op("query", "Query")>>), <<addM>>), {})
        /\ RootTypeName(Extended(Exts(WithRoots(With(<<M>>), <<Op("query", "Query")>>), <<addM>>)), "mutation") = <<"M">>
        /\ Is(Exts(WithRoots(With(<<Input("M", <<Arg("a", R("Int"))>>)>>), <<Op("query", "Query")>>),
                    <<[Ext("SCHEMA", "") EXCEPT !.operations = <<Op("mutation", "M")>>]>>), {"ROOT_TYPES_ARE_OBJECTS"})
  \* Without extensions, the extended schema is the schema.
  /\ Extended(With(<<>>)) = With(<<>>)

\* Directives applied by extensions, and how directives are applied.
QueryAt(name, extension) == UseAt(name, "OBJECT", <<"OBJECT", "Query">>, extension, <<>>)
OnObject(name) == At(Dir(name, <<>>, {}), <<"OBJECT">>)
Repeatable(D) == [D EXCEPT !.repeatable = TRUE]

AppliedDirectivesAreChecked == ~done =>
  \* "Any non-repeatable directives provided must not already apply to the
  \* previous Object type."
  /\ Is(Doc(WithDirectives(With(<<>>), <<OnObject("d")>>), <<Ext("OBJECT", "Query")>>, <<QueryAt("d", 0), QueryAt("d", 1)>>),
        {"EXTENSION_DIRECTIVES_NOT_REAPPLIED"})
  /\ Is(Doc(WithDirectives(With(<<>>), <<OnObject("d")>>), <<Ext("OBJECT", "Query"), Ext("OBJECT", "Query")>>,
            <<QueryAt("d", 1), QueryAt("d", 2)>>), {"EXTENSION_DIRECTIVES_NOT_REAPPLIED"})
  \* §3.13's example: @delegateField is repeatable, on Book and on its
  \* extension.
  /\ Is(Doc(WithDirectives(With(<<>>), <<Repeatable(OnObject("d"))>>), <<Ext("OBJECT", "Query")>>,
            <<QueryAt("d", 0), QueryAt("d", 0), QueryAt("d", 1)>>), {})
  /\ Is(Doc(WithDirectives(With(<<>>), <<OnObject("d")>>), <<Ext("OBJECT", "Query")>>, <<QueryAt("d", 1)>>), {})
  \* Twice on one definition: not a rule of §3, graded as information.
  /\ Is(Doc(WithDirectives(With(<<>>), <<OnObject("d")>>), <<>>, <<QueryAt("d", 0), QueryAt("d", 0)>>),
        {"DIRECTIVE_NOT_REPEATED"})
  \* @specifiedBy "must not appear on built-in scalar types".
  /\ LET url == <<E("url", V("string", "x"))>> IN
     /\ Is(Doc(With(<<>>), <<Ext("SCALAR", "Int")>>, <<UseAt("specifiedBy", "SCALAR", <<"SCALAR", "Int">>, 1, url)>>),
           {"SPECIFIED_BY_NOT_BUILTIN"})
     /\ Is(Doc(With(<<Scalar("S")>>), <<Ext("SCALAR", "S")>>, <<UseAt("specifiedBy", "SCALAR", <<"SCALAR", "S">>, 1, url)>>), {})
     \* Applied arguments: a required one left out, and a value of the
     \* wrong type, are information only.
     /\ Is(Doc(With(<<Scalar("S")>>), <<>>, <<UseAt("specifiedBy", "SCALAR", <<"SCALAR", "S">>, 0, <<>>)>>),
           {"APPLIED_DIRECTIVE_ARGUMENTS"})
  /\ Is(Uses(With(<<>>), <<UseAt("deprecated", "FIELD_DEFINITION", <<"ELEMENT", "1">>, 0, <<E("reason", I("1"))>>)>>),
        {"APPLIED_DIRECTIVE_ARGUMENTS"})
  /\ Is(Uses(With(<<>>), <<UseAt("deprecated", "FIELD_DEFINITION", <<"ELEMENT", "1">>, 0, <<E("why", V("string", "x"))>>)>>),
        {"APPLIED_DIRECTIVE_ARGUMENTS"})
  /\ Is(Uses(With(<<>>), <<UseAt("deprecated", "FIELD_DEFINITION", <<"ELEMENT", "1">>, 0, <<E("reason", V("string", "x"))>>)>>), {})

\* §3.13.6 Directive Extensions, new in September 2026: extend directive @d
\* with directives allowed on directive definitions.
DirAt(name, extension) == UseAt(name, "DIRECTIVE_DEFINITION", <<"DIRECTIVE", "d">>, extension, <<>>)
OnDefinitions(D) == At(D, <<"FIELD", "DIRECTIVE_DEFINITION">>)

DirectiveExtensionsAreChecked == ~done =>
  /\ LET S(dirs) == WithDirectives(With(<<>>), dirs) IN
     /\ Is(Doc(S(<<Dir("d", <<>>, {}), OnDefinitions(Dir("e", <<>>, {}))>>), <<Ext("DIRECTIVE", "d")>>, <<DirAt("e", 1)>>), {})
     \* "The previous directive must already be defined."
     /\ Is(Doc(S(<<OnDefinitions(Dir("e", <<>>, {}))>>), <<Ext("DIRECTIVE", "d")>>, <<DirAt("e", 1)>>),
           {"DIRECTIVE_EXTENSION_DEFINED"})
     \* "Any non-repeatable directives provided must not already apply to
     \* the previous directive."
     /\ Is(Doc(S(<<Dir("d", <<>>, {"e"}), OnDefinitions(Dir("e", <<>>, {}))>>), <<Ext("DIRECTIVE", "d")>>,
               <<DirAt("e", 0), DirAt("e", 1)>>), {"DIRECTIVE_EXTENSION_NOT_REAPPLIED"})
     /\ Is(Doc(S(<<Dir("d", <<>>, {"e"}), Repeatable(OnDefinitions(Dir("e", <<>>, {})))>>), <<Ext("DIRECTIVE", "d")>>,
               <<DirAt("e", 0), DirAt("e", 1)>>), {})
     \* "... must not contain the use of a Directive which references the
     \* previous directive directly."
     /\ Is(Doc(S(<<OnDefinitions(Dir("d", <<>>, {}))>>), <<Ext("DIRECTIVE", "d")>>, <<DirAt("d", 1)>>),
           {"DIRECTIVE_EXTENSION_USES_PREVIOUS"})
     \* "... which references the previous directive indirectly by
     \* referencing a Type or Directive which transitively includes a
     \* reference to the previous Directive":
     \* @e's definition uses @d; or @e's argument's type uses @d.
     /\ Is(Doc(S(<<OnDefinitions(Dir("d", <<>>, {})), OnDefinitions(Dir("e", <<>>, {"d"}))>>), <<Ext("DIRECTIVE", "d")>>,
               <<DirAt("e", 1)>>), {"DIRECTIVE_EXTENSION_REFERENCES_PREVIOUS"})
     /\ Is(Doc(WithDirectives(With(<<Using(Input("In", <<Arg("f", R("Int"))>>), {"d"})>>),
                              <<OnDefinitions(Dir("d", <<>>, {})), OnDefinitions(Dir("e", <<Arg("x", R("In"))>>, {}))>>),
               <<Ext("DIRECTIVE", "d")>>, <<DirAt("e", 1)>>), {"DIRECTIVE_EXTENSION_REFERENCES_PREVIOUS"})
  \* The directives as extended: extend directive @d @e, then extend
  \* directive @e @d, where @d as previously extended uses @e.
  /\ LET DirExt(name, uses) == [Ext("DIRECTIVE", name) EXCEPT !.directives = uses]
         OnE(name, extension) == UseAt(name, "DIRECTIVE_DEFINITION", <<"DIRECTIVE", "e">>, extension, <<>>)
         de == <<OnDefinitions(Dir("d", <<>>, {})), OnDefinitions(Dir("e", <<>>, {}))>>
     IN /\ Is(Doc(WithDirectives(With(<<>>), de), <<DirExt("d", {"e"}), DirExt("e", {"d"})>>,
                  <<DirAt("e", 1), OnE("d", 2)>>), {"DIRECTIVE_EXTENSION_REFERENCES_PREVIOUS"})
        \* extend directive @e @f, then extend directive @d @e, where
        \* directive @f(x: In) and input In { f: Int @d }: @e as previously
        \* extended uses @f, whose argument's type uses @d.
        /\ Is(Doc(WithDirectives(With(<<Using(Input("In", <<Arg("f", R("Int"))>>), {"d"})>>),
                                 de \o <<OnDefinitions(Dir("f", <<Arg("x", R("In"))>>, {}))>>),
                  <<DirExt("e", {"f"}), DirExt("d", {"e"})>>, <<OnE("f", 1), DirAt("e", 2)>>),
              {"DIRECTIVE_EXTENSION_REFERENCES_PREVIOUS"})
        \* A chain that doesn't lead back: extend directive @d @e, then
        \* extend directive @e @f.
        /\ Is(Doc(WithDirectives(With(<<>>), de \o <<OnDefinitions(Dir("f", <<>>, {}))>>),
                  <<DirExt("d", {"e"}), DirExt("e", {"f"})>>, <<DirAt("e", 1), OnE("f", 2)>>), {})
====
