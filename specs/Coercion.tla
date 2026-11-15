---- MODULE Coercion ----
(***************************************************************************)
(* GraphQL input coercion and request errors, written by hand from the     *)
(* spec's algorithms (https://spec.graphql.org/draft/):                    *)
(*                                                                         *)
(*   §3.5   scalar input coercion (Int, Float, String, Boolean, ID)        *)
(*   §3.9   enum input coercion                                            *)
(*   §3.10  input object input coercion                                    *)
(*   §3.11  list input coercion                                            *)
(*   §3.12  non-null input coercion                                        *)
(*   §6.1.2 CoerceVariableValues                                           *)
(*   §6.4.1 CoerceArgumentValues                                           *)
(*   §7.1.3 request error result, as opposed to an execution error         *)
(*                                                                         *)
(* Everything here is a pure operator over plain data. The test vectors at *)
(* the end (Coercion.cfg) check it against the spec's own examples, and    *)
(* scripts/differential-coercion.mjs checks graphql-js 16 and 17 against   *)
(* Valid below. It shares no code with graphql-js.                         *)
(*                                                                         *)
(* Data shapes (every value of a kind has the same fields, since TLC can't *)
(* compare values of different shapes):                                    *)
(*                                                                         *)
(*   type ref   [name, wrappers]    [Int!]! = <<"nonNull", "list",         *)
(*                                  "nonNull">> around "Int"               *)
(*   value      [kind, neg, digits, exp, str, wellFormed, items, entries]  *)
(*              One shape for JSON variable values, AST literals and       *)
(*              coerced values. kind is one of                             *)
(*                "null"                                                   *)
(*                "number"    a JSON number, or a coerced Int or Float     *)
(*                "int"       an IntValue literal                          *)
(*                "float"     a FloatValue literal                         *)
(*                "string"    str; wellFormed is FALSE for a string with   *)
(*                            a lone surrogate, which JSON can carry       *)
(*                "boolean"   str is "true" or "false"                     *)
(*                "enum"      an EnumValue literal or a coerced enum, str  *)
(*                "list"      items, a sequence of values                  *)
(*                "object"    entries, a set of [key, value]: an object    *)
(*                            literal, a JSON object or a coerced map      *)
(*                "variable"  a Variable in a literal, named str           *)
(*                "nonFinite" a non-finite float (only graphql-js output)  *)
(*              A number is (-1 if neg) * digits * 10^exp, where digits    *)
(*              is a sequence of decimal digits with no leading or         *)
(*              trailing zeros, and zero is <<>> with exp 0. TLC's         *)
(*              integers are 32-bit, too small to state the Int range.     *)
(*   input value definition  [name, type, hasDefault, default]: an         *)
(*              argument, input field or variable definition; default is a *)
(*              literal                                                    *)
(*   schema     [types, fields]: types[name] is [kind, values, fields] for *)
(*              kind "scalar", "enum" (values) or "inputObject" (fields);  *)
(*              fields[fieldName] is the root field's argument definitions *)
(*   operation  [variables, field, arguments]: the variable definitions,   *)
(*              and one root field with its arguments as entries           *)
(*   result     [ok, value]: a coerced value, or a failure                 *)
(***************************************************************************)
EXTENDS Integers, Sequences, FiniteSets, TLC

-----------------------------------------------------------------------------
(* Types (§3.4.1 Wrapping Types) *)

IsNonNull(type) == type.wrappers # <<>> /\ Head(type.wrappers) = "nonNull"
IsList(type) == type.wrappers # <<>> /\ Head(type.wrappers) = "list"
OfType(type) == [type EXCEPT !.wrappers = Tail(@)]
Named(name) == [name |-> name, wrappers |-> <<>>]
NonNull(type) == [type EXCEPT !.wrappers = <<"nonNull">> \o @]
ListOf(type) == [type EXCEPT !.wrappers = <<"list">> \o @]

-----------------------------------------------------------------------------
(* Values *)

V(kind, neg, digits, exp, str, wellFormed, items, entries) ==
  [kind |-> kind, neg |-> neg, digits |-> digits, exp |-> exp, str |-> str,
   wellFormed |-> wellFormed, items |-> items, entries |-> entries]

NullV == V("null", FALSE, <<>>, 0, "", TRUE, <<>>, {})
Num(kind, neg, digits, exp) == V(kind, neg, digits, exp, "", TRUE, <<>>, {})
StrW(s, wellFormed) == V("string", FALSE, <<>>, 0, s, wellFormed, <<>>, {})
Str(s) == StrW(s, TRUE)
Bool(b) == V("boolean", FALSE, <<>>, 0, IF b THEN "true" ELSE "false", TRUE, <<>>, {})
EnumV(name) == V("enum", FALSE, <<>>, 0, name, TRUE, <<>>, {})
ListV(items) == V("list", FALSE, <<>>, 0, "", TRUE, items, {})
ObjV(entries) == V("object", FALSE, <<>>, 0, "", TRUE, <<>>, entries)
VarV(name) == V("variable", FALSE, <<>>, 0, name, TRUE, <<>>, {})
NonFinite(neg) == V("nonFinite", neg, <<>>, 0, "", TRUE, <<>>, {})

Entry(key, value) == [key |-> key, value |-> value]
Keys(entries) == {e.key : e \in entries}
HasKey(entries, key) == \E e \in entries : e.key = key
Get(entries, key) == (CHOOSE e \in entries : e.key = key).value

\* Numbers from TLA+ integers, for the test vectors below.
RECURSIVE DigitsOf(_), Normalized(_, _)
DigitsOf(n) == IF n < 10 THEN <<n>> ELSE Append(DigitsOf(n \div 10), n % 10)
Normalized(digits, exp) ==
  IF digits = <<>> THEN [digits |-> <<>>, exp |-> 0]
  ELSE IF digits[Len(digits)] = 0
  THEN Normalized(SubSeq(digits, 1, Len(digits) - 1), exp + 1)
  ELSE [digits |-> digits, exp |-> exp]
FromInt(kind, n) ==
  LET m == Normalized(IF n = 0 THEN <<>> ELSE DigitsOf(IF n < 0 THEN -n ELSE n), 0)
  IN Num(kind, n < 0, m.digits, m.exp)

-----------------------------------------------------------------------------
(* Numbers *)

\* The number of digits before the decimal point.
Order(n) == Len(n.digits) + n.exp
DigitAt(n, i) == IF i <= Len(n.digits) THEN n.digits[i] ELSE 0
RECURSIVE DigitsLess(_, _, _, _)
DigitsLess(a, b, i, len) ==
  IF i > len THEN FALSE
  ELSE IF DigitAt(a, i) # DigitAt(b, i) THEN DigitAt(a, i) < DigitAt(b, i)
  ELSE DigitsLess(a, b, i + 1, len)

\* |a| < |b|
AbsLess(a, b) ==
  CASE a.digits = <<>> -> b.digits # <<>>
    [] b.digits = <<>> -> FALSE
    [] Order(a) # Order(b) -> Order(a) < Order(b)
    [] OTHER -> DigitsLess(a, b, 1, IF Len(a.digits) > Len(b.digits) THEN Len(a.digits) ELSE Len(b.digits))

IsIntegral(n) == n.exp >= 0

TwoTo31 == Num("number", FALSE, <<2, 1, 4, 7, 4, 8, 3, 6, 4, 8>>, 0)
\* The largest finite IEEE 754 double, 1.7976931348623157e308.
MaxDouble == Num("number", FALSE, <<1, 7, 9, 7, 6, 9, 3, 1, 3, 4, 8, 6, 2, 3, 1, 5, 7>>, 292)

\* "If the integer input value represents a value less than -2^31 or greater
\* than or equal to 2^31, a request error should be raised."
InIntRange(n) == AbsLess(n, TwoTo31) \/ (n.neg /\ n.digits = TwoTo31.digits /\ n.exp = 0)

\* "If the input value otherwise represents a value not representable by
\* finite IEEE 754 (e.g. NaN, Infinity, ...), a request error must be raised."
IsFiniteDouble(n) == ~AbsLess(MaxDouble, n)

\* Arithmetic on natural numbers given as digit sequences, most significant
\* first, with no leading zeros.
RECURSIVE StripLeading(_), HalfFrom(_, _, _, _), OddPart(_), Times5From(_, _, _, _), TimesPow5(_, _)
StripLeading(ds) == IF ds # <<>> /\ ds[1] = 0 THEN StripLeading(Tail(ds)) ELSE ds
HalfFrom(ds, i, carry, acc) ==
  IF i > Len(ds) THEN StripLeading(acc)
  ELSE HalfFrom(ds, i + 1, (carry * 10 + ds[i]) % 2, Append(acc, (carry * 10 + ds[i]) \div 2))
OddPart(ds) == IF ds # <<>> /\ ds[Len(ds)] % 2 = 0 THEN OddPart(HalfFrom(ds, 1, 0, <<>>)) ELSE ds
Times5From(ds, i, carry, acc) ==
  IF i = 0 THEN (IF carry = 0 THEN acc ELSE <<carry>> \o acc)
  ELSE Times5From(ds, i - 1, (ds[i] * 5 + carry) \div 10, <<(ds[i] * 5 + carry) % 10>> \o acc)
TimesPow5(ds, e) == IF e = 0 THEN ds ELSE TimesPow5(Times5From(ds, Len(ds), 0, <<>>), e - 1)

TwoTo53 == Num("number", FALSE, <<9, 0, 0, 7, 1, 9, 9, 2, 5, 4, 7, 4, 0, 9, 9, 2>>, 0)

\* An integral number is a double exactly when its odd part is below 2^53.
\* digits * 10^exp has odd part OddPart(digits) * 5^exp, and 5^23 > 2^53.
\* The odd part has no trailing zeros, so it is in normal form.
IsExactDouble(n) ==
  \/ n.digits = <<>>
  \/ /\ n.exp <= 22
     /\ AbsLess(Num("number", FALSE, TimesPow5(OddPart(n.digits), n.exp), 0), TwoTo53)

\* The decimal string of an integral number, for ID.
RECURSIVE DigitString(_, _), Zeros(_)
DigitString(digits, i) == IF i > Len(digits) THEN "" ELSE ToString(digits[i]) \o DigitString(digits, i + 1)
Zeros(k) == IF k <= 0 THEN "" ELSE "0" \o Zeros(k - 1)
IntegerString(n) ==
  IF n.digits = <<>> THEN "0"
  ELSE (IF n.neg THEN "-" ELSE "") \o DigitString(n.digits, 1) \o Zeros(n.exp)

AsNumber(n) == [n EXCEPT !.kind = "number"]

-----------------------------------------------------------------------------
(* Results *)

Ok(value) == [ok |-> TRUE, value |-> value]
Fail == [ok |-> FALSE, value |-> NullV]
\* Adds key: result.value to the coerced map acc, or fails.
AddTo(acc, key, result) == IF result.ok THEN Ok(ObjV(acc \cup {Entry(key, result.value)})) ELSE Fail

-----------------------------------------------------------------------------
(* §3.5 Scalars *)

\* §3.5: "Since some common serializations (e.g. JSON) do not discriminate
\* between integer and floating-point values, they are interpreted as an
\* integer input value if they have an empty fractional part (e.g. 1.0) and
\* otherwise as floating-point input value."
IsIntegerInput(v) == v.kind = "int" \/ (v.kind = "number" /\ IsIntegral(v))
IsFloatInput(v) == v.kind = "float" \/ (v.kind = "number" /\ ~IsIntegral(v))
\* §3.5.3: "only valid Unicode string input values are accepted"
IsStringInput(v) == v.kind = "string" /\ v.wellFormed

CoerceScalar(name, v) ==
  CASE name = "Int" ->
         \* §3.5.1: "only integer input values are accepted. All other
         \* input values, including strings with numeric content, must
         \* raise a request error indicating an incorrect type."
         IF IsIntegerInput(v) /\ InIntRange(v) THEN Ok(AsNumber(v)) ELSE Fail
    [] name = "Float" ->
         \* §3.5.2: "both integer and float input values are accepted.
         \* Integer input values are coerced to Float by adding an empty
         \* fractional part, for example 1.0 for the integer input value 1."
         \* and "If the input value otherwise represents a value not
         \* representable by finite IEEE 754 (e.g. NaN, Infinity, or a value
         \* outside the available precision), a request error must be
         \* raised."
         \*
         \* "Outside the available precision" can't mean every decimal that
         \* has no exact double (0.1 has none), so this reads it as: an
         \* integral value must be exactly representable. A fractional value
         \* is rounded to the nearest double, which this module doesn't
         \* compute: it keeps the decimal. That is exact for decimals of at
         \* most 15 significant digits, whose nearest double prints back as
         \* the same decimal, and the differential only uses those.
         IF /\ IsIntegerInput(v) \/ IsFloatInput(v)
            /\ IsFiniteDouble(v)
            /\ IsIntegral(v) => IsExactDouble(v)
         THEN Ok(AsNumber(v)) ELSE Fail
    [] name = "String" -> IF IsStringInput(v) THEN Ok(v) ELSE Fail
    [] name = "Boolean" ->
         \* §3.5.4: "only boolean input values are accepted"
         IF v.kind = "boolean" THEN Ok(v) ELSE Fail
    [] name = "ID" ->
         \* §3.5.5: "any string (such as "4") or integer (such as 4 or -4)
         \* input value should be coerced to ID ... Any other input value,
         \* including float input values (such as 4.0), must raise a
         \* request error"
         IF IsStringInput(v) THEN Ok(v)
         ELSE IF IsIntegerInput(v) THEN Ok(Str(IntegerString(v)))
         ELSE Fail
    [] OTHER -> Fail

-----------------------------------------------------------------------------
(* §3.9 Enums *)

\* "GraphQL string literals must not be accepted as an enum input and
\* instead raise a request error." For variables, "for most transport
\* serializations ... strings may be interpreted as the enum input value
\* with the same name."
CoerceEnum(def, v, source) ==
  IF \/ source = "literal" /\ v.kind = "enum" /\ v.str \in def.values
     \/ source = "variables" /\ IsStringInput(v) /\ v.str \in def.values
  THEN Ok(EnumV(v.str)) ELSE Fail

-----------------------------------------------------------------------------
(* Input coercion of a value to a type (§3.10, §3.11, §3.12).              *)
(*                                                                         *)
(* source is "literal" for an AST literal, whose variables are looked up   *)
(* in vars (the coerced variable values, as entries), or "variables" for a *)
(* JSON value from the request's variables.                                *)

\* A Variable in a literal "that was ... not provided a value at runtime".
IsMissingVariable(v, vars) == v.kind = "variable" /\ ~HasKey(vars, v.str)

RECURSIVE CoerceInput(_, _, _, _, _), CoerceItems(_, _, _, _, _, _, _), CoerceFields(_, _, _, _, _, _, _)

CoerceInput(S, type, v, source, vars) ==
  IF v.kind = "variable" THEN
    \* A variable nested in a literal: a list item or an input object
    \* field. §3.10: "If a variable is provided for an input object field,
    \* the runtime value of that variable must be used. If the runtime
    \* value is null and the field type is non-null, an execution error
    \* must be raised." Variable values are already coerced (§6.4.1 Note).
    IF ~HasKey(vars, v.str) THEN Fail
    ELSE IF IsNonNull(type) /\ Get(vars, v.str).kind = "null" THEN Fail
    ELSE Ok(Get(vars, v.str))
  ELSE IF IsNonNull(type) THEN
    \* §3.12: "If an argument or input-object field of a Non-Null type ...
    \* is provided with the literal value null ... then a request error must
    \* be raised." Otherwise "it is coerced using the input coercion for the
    \* wrapped type."
    IF v.kind = "null" THEN Fail ELSE CoerceInput(S, OfType(type), v, source, vars)
  ELSE IF v.kind = "null" THEN
    \* §3.5: "For all types below, with the exception of Non-Null, if the
    \* explicit value null is provided, then the result of input coercion
    \* is null."
    Ok(NullV)
  ELSE IF IsList(type) THEN
    IF v.kind = "list"
    THEN
      \* §3.11: "list values are accepted only when each item in the list
      \* can be accepted by the list's item type."
      CoerceItems(S, OfType(type), v.items, 1, source, vars, <<>>)
    ELSE
      \* "If the value passed as an input to a list type is not a list and
      \* not the null value, then the result of input coercion is a list of
      \* size one, where the single item value is the result of input
      \* coercion for the list's item type on the provided value (note this
      \* may apply recursively for nested lists)."
      LET item == CoerceInput(S, OfType(type), v, source, vars) IN
      IF item.ok THEN Ok(ListV(<<item.value>>)) ELSE Fail
  ELSE
    LET def == S.types[type.name] IN
    CASE def.kind = "scalar" -> CoerceScalar(type.name, v)
      [] def.kind = "enum" -> CoerceEnum(def, v, source)
      [] OTHER ->
           \* §3.10: "The value for an input object should be an input
           \* object literal or an unordered map supplied by a variable,
           \* otherwise a request error must be raised. In either case, the
           \* input object literal or unordered map must not contain any
           \* entries with names not defined by a field of this input object
           \* type, otherwise a request error must be raised."
           IF /\ v.kind = "object"
              /\ Keys(v.entries) \subseteq {def.fields[i].name : i \in DOMAIN def.fields}
           THEN CoerceFields(S, def.fields, v.entries, 1, source, vars, {})
           ELSE Fail

CoerceItems(S, itemType, items, i, source, vars, acc) ==
  IF i > Len(items) THEN Ok(ListV(acc))
  ELSE
    LET item ==
          IF IsMissingVariable(items[i], vars)
          THEN
            \* The spec doesn't say what a list item that is a variable with
            \* no runtime value coerces to. A list has no notion of an
            \* omitted item, so this treats it like null: an error for a
            \* Non-Null item type (§3.12), otherwise null. graphql-js 16 and
            \* 17 do the same.
            IF IsNonNull(itemType) THEN Fail ELSE Ok(NullV)
          ELSE CoerceInput(S, itemType, items[i], source, vars)
    IN IF item.ok
       THEN CoerceItems(S, itemType, items, i + 1, source, vars, Append(acc, item.value))
       ELSE Fail

\* §3.10: "The result of coercion is an unordered map with an entry for each
\* field both defined by the input object type and for which a value
\* exists."
CoerceFields(S, fields, entries, i, source, vars, acc) ==
  IF i > Len(fields) THEN Ok(ObjV(acc))
  ELSE
    LET field == fields[i]
        \* "If a variable is provided for an input object field ... If no
        \* runtime value is provided, the variable definition's default
        \* value should be used [CoerceVariableValues already did]. If the
        \* variable definition does not provide a default value, the input
        \* object field definition's default value should be used."
        provided == HasKey(entries, field.name) /\ ~IsMissingVariable(Get(entries, field.name), vars)
        next ==
          IF ~provided
          THEN
            \* "If no value is provided for a defined input object field and
            \* that field definition provides a default value, the result of
            \* coercing the default value according to the coercion rules of
            \* the input field type should be used. If no default value is
            \* provided and the input object field's type is non-null, an
            \* error should be raised. Otherwise, if the field is not
            \* required, then no entry is added to the coerced unordered
            \* map."
            IF field.hasDefault
            THEN AddTo(acc, field.name, CoerceInput(S, field.type, field.default, "literal", {}))
            ELSE IF IsNonNull(field.type) THEN Fail
            ELSE Ok(ObjV(acc))
          ELSE
            \* "If the value null was provided for an input object field, and
            \* the field's type is not a non-null type, an entry in the
            \* coerced unordered map is given the value null." and "If a
            \* literal value is provided for an input object field, an entry
            \* in the coerced unordered map is given the result of coercing
            \* that value"
            AddTo(acc, field.name, CoerceInput(S, field.type, Get(entries, field.name), source, vars))
    IN IF next.ok
       THEN CoerceFields(S, fields, entries, i + 1, source, vars, next.value.entries)
       ELSE Fail

-----------------------------------------------------------------------------
(* §6.1.2 CoerceVariableValues(schema, operation, variableValues)           *)
(*                                                                         *)
(* request is the request's variableValues, as entries of JSON values.     *)
(* The result's value is the coerced map, an object; a failure is a        *)
(* request error.                                                          *)

RECURSIVE CoerceVariablesFrom(_, _, _, _, _)
CoerceVariablesFrom(S, definitions, request, i, acc) ==
  IF i > Len(definitions) THEN Ok(ObjV(acc))
  ELSE
    LET definition == definitions[i]
        variableName == definition.name
        variableType == definition.type
        \* "Let hasValue be true if variableValues provides a value for the
        \* name variableName."
        hasValue == HasKey(request, variableName)
        value == IF hasValue THEN Get(request, variableName) ELSE NullV
        next ==
          IF ~hasValue /\ definition.hasDefault
          THEN
            \* "If hasValue is not true and defaultValue exists (including
            \* null): Let coercedDefaultValue be the result of coercing
            \* defaultValue according to the input coercion rules of
            \* variableType."
            AddTo(acc, variableName, CoerceInput(S, variableType, definition.default, "literal", {}))
          ELSE IF IsNonNull(variableType) /\ (~hasValue \/ value.kind = "null")
          THEN
            \* "Otherwise if variableType is a Non-Nullable type, and either
            \* hasValue is not true or value is null, raise a request error."
            Fail
          ELSE IF hasValue
          THEN
            IF value.kind = "null"
            THEN Ok(ObjV(acc \cup {Entry(variableName, NullV)}))
            ELSE
              \* "If value cannot be coerced according to the input coercion
              \* rules of variableType, raise a request error."
              AddTo(acc, variableName, CoerceInput(S, variableType, value, "variables", {}))
          ELSE Ok(ObjV(acc))
    IN IF next.ok THEN CoerceVariablesFrom(S, definitions, request, i + 1, next.value.entries) ELSE Fail

CoerceVariableValues(S, operation, request) ==
  CoerceVariablesFrom(S, operation.variables, request, 1, {})

-----------------------------------------------------------------------------
(* §6.4.1 CoerceArgumentValues(objectType, field, variableValues)           *)
(*                                                                         *)
(* A failure is an execution error: "Any request error raised as a result  *)
(* of input coercion during CoerceArgumentValues() should be treated       *)
(* instead as an execution error."                                         *)

RECURSIVE CoerceArgumentsFrom(_, _, _, _, _, _)
CoerceArgumentsFrom(S, definitions, argumentValues, vars, i, acc) ==
  IF i > Len(definitions) THEN Ok(ObjV(acc))
  ELSE
    LET definition == definitions[i]
        argumentName == definition.name
        argumentType == definition.type
        provided == HasKey(argumentValues, argumentName)
        argumentValue == IF provided THEN Get(argumentValues, argumentName) ELSE NullV
        isVariable == provided /\ argumentValue.kind = "variable"
        \* "If argumentValue is a Variable: ... If variableValues provides a
        \* value for the name variableName: Let hasValue be true. ...
        \* Otherwise if argumentValues provides a value for the name
        \* argumentName. Let hasValue be true."
        hasValue == IF isVariable THEN HasKey(vars, argumentValue.str) ELSE provided
        value ==
          IF ~hasValue THEN NullV
          ELSE IF isVariable THEN Get(vars, argumentValue.str)
          ELSE argumentValue
        next ==
          IF ~hasValue /\ definition.hasDefault
          THEN
            \* "If hasValue is not true and defaultValue exists (including
            \* null): Let coercedDefaultValue be the result of coercing
            \* defaultValue according to the input coercion rules of
            \* argumentType."
            AddTo(acc, argumentName, CoerceInput(S, argumentType, definition.default, "literal", {}))
          ELSE IF IsNonNull(argumentType) /\ (~hasValue \/ value.kind = "null")
          THEN
            \* "Otherwise if argumentType is a Non-Nullable type, and either
            \* hasValue is not true or value is null, raise an execution
            \* error."
            Fail
          ELSE IF hasValue
          THEN
            IF value.kind = "null" THEN Ok(ObjV(acc \cup {Entry(argumentName, NullV)}))
            ELSE IF isVariable
            THEN
              \* "Otherwise, if argumentValue is a Variable: Add an entry to
              \* coercedValues named argumentName with the value value."
              Ok(ObjV(acc \cup {Entry(argumentName, value)}))
            ELSE
              \* "If value cannot be coerced according to the input coercion
              \* rules of argumentType, raise an execution error."
              AddTo(acc, argumentName, CoerceInput(S, argumentType, value, "literal", vars))
          ELSE Ok(ObjV(acc))
    IN IF next.ok THEN CoerceArgumentsFrom(S, definitions, argumentValues, vars, i + 1, next.value.entries) ELSE Fail

CoerceArgumentValues(S, fieldName, argumentValues, vars) ==
  CoerceArgumentsFrom(S, S.fields[fieldName], argumentValues, vars, 1, {})

-----------------------------------------------------------------------------
(* §6.1 ExecuteRequest, up to the root field's resolver                    *)
(*                                                                         *)
(* An outcome is [kind, args]: "requestError", "fieldError", or "resolved" *)
(* with args the coerced argument map the resolver receives.               *)

Outcome(kind, args) == [kind |-> kind, args |-> args]

\* §6.1.2: "If a request error is encountered during input coercion of
\* variable values, then the request fails without operation execution."
\* Otherwise the root field executes, and ExecuteField calls
\* CoerceArgumentValues before the resolver.
Respond(S, operation, request) ==
  LET coercedVariableValues == CoerceVariableValues(S, operation, request) IN
  IF ~coercedVariableValues.ok THEN Outcome("requestError", NullV)
  ELSE
    LET args == CoerceArgumentValues(S, operation.field, operation.arguments,
                                     coercedVariableValues.value.entries)
    IN IF args.ok THEN Outcome("resolved", args.value) ELSE Outcome("fieldError", NullV)

-----------------------------------------------------------------------------
(* §7.1 Response                                                           *)
(*                                                                         *)
(* An observed response is [hasData, fieldIsNull, errors, called, args]:   *)
(* whether it has a "data" entry, whether the root field is null in it,    *)
(* the path of each error (<<>> for an error without a path), whether the  *)
(* resolver ran and the arguments it got. The root field's resolver        *)
(* returns a non-null value, and its type is nullable.                     *)

Valid(S, operation, request, response) ==
  LET outcome == Respond(S, operation, request) IN
  CASE outcome.kind = "requestError" ->
         \* §7.1.3: "The request error result map must not contain an entry
         \* with key "data"." The "errors" entry "must be a non-empty list";
         \* a request error has no response position, so no path.
         /\ ~response.hasData
         /\ Len(response.errors) > 0
         /\ \A i \in DOMAIN response.errors : response.errors[i] = <<>>
         /\ ~response.called
    [] outcome.kind = "fieldError" ->
         \* §6.4.4: the execution error nulls the nullable root field, and
         \* is reported at its path.
         /\ response.hasData
         /\ response.fieldIsNull
         /\ response.errors = <<<<operation.field>>>>
         /\ ~response.called
    [] OTHER ->
         /\ response.hasData
         /\ ~response.fieldIsNull
         /\ response.errors = <<>>
         /\ response.called
         /\ response.args = outcome.args

-----------------------------------------------------------------------------
(* Test vectors, from the spec's examples where it has them. *)

Scalar == [kind |-> "scalar", values |-> {}, fields |-> <<>>]
Def(name, type, hasDefault, default) ==
  [name |-> name, type |-> type, hasDefault |-> hasDefault, default |-> default]
Arg(name, type) == Def(name, type, FALSE, NullV)

IntT == Named("Int")
ExampleType == Named("ExampleInputObject")

\* The spec's ExampleInputObject (§3.10), a Color enum, and one root field per
\* argument type.
ExampleSchema ==
  [types |->
     ("Int" :> Scalar) @@ ("Float" :> Scalar) @@ ("String" :> Scalar) @@
     ("Boolean" :> Scalar) @@ ("ID" :> Scalar) @@
     ("Color" :> [kind |-> "enum", values |-> {"RED", "GREEN"}, fields |-> <<>>]) @@
     ("ExampleInputObject" :>
        [kind |-> "inputObject", values |-> {},
         fields |-> <<Arg("a", Named("String")), Arg("b", NonNull(IntT))>>]),
   fields |->
     ("example" :> <<Arg("arg", ExampleType)>>) @@
     ("int" :> <<Arg("v", IntT)>>) @@
     ("intNN" :> <<Arg("v", NonNull(IntT))>>) @@
     ("intDefault" :> <<Def("v", IntT, TRUE, FromInt("int", 7))>>) @@
     ("ints" :> <<Arg("v", ListOf(IntT))>>)]

I(n) == FromInt("int", n)        \* an IntValue literal
J(n) == FromInt("number", n)     \* a JSON number
N(n) == FromInt("number", n)     \* a coerced Int or Float
Lit(type, v) == CoerceInput(ExampleSchema, type, v, "literal", {})
Json(type, v) == CoerceInput(ExampleSchema, type, v, "variables", {})
Op(variables, field, arguments) == [variables |-> variables, field |-> field, arguments |-> arguments]
Resolved(entries) == Outcome("resolved", ObjV(entries))
RequestError == Outcome("requestError", NullV)
FieldError == Outcome("fieldError", NullV)
Case(actual, expected) == [actual |-> actual, expected |-> expected]
Failing(cases) == {i \in DOMAIN cases : cases[i].actual # cases[i].expected}

TwoTo31Int == Num("int", FALSE, TwoTo31.digits, 0)
MinIntJson == Num("number", TRUE, TwoTo31.digits, 0)

\* §3.5
ScalarCases == <<
  Case(Lit(IntT, I(1)), Ok(N(1))),
  Case(Lit(IntT, I(-2147483647)), Ok(N(-2147483647))),
  Case(Json(IntT, MinIntJson), Ok(AsNumber(MinIntJson))),
  Case(Lit(IntT, TwoTo31Int), Fail),
  Case(Lit(IntT, Num("float", FALSE, <<1>>, 0)), Fail),          \* 1.0 is a float input value
  Case(Json(IntT, J(1)), Ok(N(1))),                              \* JSON 1.0 is an integer input value
  Case(Json(IntT, Num("number", FALSE, <<1, 5>>, -1)), Fail),    \* 1.5
  Case(Json(IntT, Str("1")), Fail),
  Case(Lit(Named("Float"), I(1)), Ok(N(1))),
  Case(Lit(Named("Float"), Num("float", FALSE, <<1, 5>>, -1)), Ok(Num("number", FALSE, <<1, 5>>, -1))),
  Case(Lit(Named("Float"), Num("float", FALSE, <<1>>, 400)), Fail),  \* 1e400
  Case(Lit(Named("Float"), Num("int", FALSE, TwoTo53.digits, 0)), Ok(TwoTo53)),
  Case(Lit(Named("Float"), Num("int", FALSE, <<9, 0, 0, 7, 1, 9, 9, 2, 5, 4, 7, 4, 0, 9, 9, 3>>, 0)), Fail),  \* 2^53 + 1
  Case(Lit(Named("Float"), Num("float", FALSE, <<1>>, 22)), Ok(Num("number", FALSE, <<1>>, 22))),  \* 1e22 is exact
  Case(Lit(Named("Float"), Num("float", FALSE, <<1>>, 23)), Fail),   \* 1e23 is not
  Case(Json(Named("Float"), Str("1.5")), Fail),
  Case(Json(Named("String"), Str("abc")), Ok(Str("abc"))),
  Case(Json(Named("String"), StrW("\\ud800", FALSE)), Fail),
  Case(Json(Named("String"), J(1)), Fail),
  Case(Json(Named("Boolean"), Bool(TRUE)), Ok(Bool(TRUE))),
  Case(Json(Named("Boolean"), J(1)), Fail),
  Case(Lit(Named("ID"), I(4)), Ok(Str("4"))),
  Case(Json(Named("ID"), J(-40)), Ok(Str("-40"))),
  Case(Json(Named("ID"), Str("4")), Ok(Str("4"))),
  Case(Lit(Named("ID"), Num("float", FALSE, <<4>>, 0)), Fail),   \* 4.0
  Case(Lit(Named("Int"), NullV), Ok(NullV)),
  Case(Lit(NonNull(IntT), NullV), Fail)
>>

\* §3.9
EnumCases == <<
  Case(Lit(Named("Color"), EnumV("RED")), Ok(EnumV("RED"))),
  Case(Lit(Named("Color"), Str("RED")), Fail),
  Case(Json(Named("Color"), Str("RED")), Ok(EnumV("RED"))),
  Case(Json(Named("Color"), Str("BLUE")), Fail),
  Case(Lit(Named("Color"), EnumV("BLUE")), Fail)
>>

\* §3.11's table of examples
ListCases == <<
  Case(Lit(ListOf(IntT), ListV(<<I(1), I(2), I(3)>>)), Ok(ListV(<<N(1), N(2), N(3)>>))),
  Case(Lit(ListOf(IntT), ListV(<<I(1), Str("b"), Bool(TRUE)>>)), Fail),
  Case(Lit(ListOf(IntT), I(1)), Ok(ListV(<<N(1)>>))),
  Case(Lit(ListOf(IntT), NullV), Ok(NullV)),
  Case(Lit(ListOf(ListOf(IntT)), ListV(<<ListV(<<I(1)>>), ListV(<<I(2), I(3)>>)>>)),
       Ok(ListV(<<ListV(<<N(1)>>), ListV(<<N(2), N(3)>>)>>))),
  Case(Lit(ListOf(ListOf(IntT)), ListV(<<I(1), I(2), I(3)>>)),
       Ok(ListV(<<ListV(<<N(1)>>), ListV(<<N(2)>>), ListV(<<N(3)>>)>>))),
  Case(Lit(ListOf(ListOf(IntT)), ListV(<<I(1), NullV, I(3)>>)),
       Ok(ListV(<<ListV(<<N(1)>>), NullV, ListV(<<N(3)>>)>>))),
  Case(Lit(ListOf(ListOf(IntT)), ListV(<<ListV(<<I(1)>>), ListV(<<Str("b")>>)>>)), Fail),
  Case(Lit(ListOf(ListOf(IntT)), I(1)), Ok(ListV(<<ListV(<<N(1)>>)>>))),
  Case(Lit(ListOf(ListOf(IntT)), NullV), Ok(NullV)),
  Case(Lit(ListOf(NonNull(IntT)), ListV(<<I(1), NullV>>)), Fail)
>>

\* §3.10's table of examples, run as `example(arg: <literal>)` with the
\* variables given. Where the literal is $var, the operation declares
\* `$var: ExampleInputObject`; where it is used for a or b, `$var: String` or
\* `$var: Int`. A failure while coercing the literal is an execution error
\* (§6.4.1); a failure while coercing $var itself is a request error.
VarDef(type) == <<Arg("var", type)>>
Example(variables, literal, request) ==
  Respond(ExampleSchema, Op(variables, "example", {Entry("arg", literal)}), request)
AB(a, b) == {Entry("a", a), Entry("b", b)}
InputObjectCases == <<
  Case(Example(<<>>, ObjV(AB(Str("abc"), I(123))), {}), Resolved({Entry("arg", ObjV(AB(Str("abc"), N(123))))})),
  Case(Example(<<>>, ObjV(AB(NullV, I(123))), {}), Resolved({Entry("arg", ObjV(AB(NullV, N(123))))})),
  Case(Example(<<>>, ObjV({Entry("b", I(123))}), {}), Resolved({Entry("arg", ObjV({Entry("b", N(123))}))})),
  Case(Example(VarDef(Named("String")), ObjV(AB(VarV("var"), I(123))), {Entry("var", NullV)}),
       Resolved({Entry("arg", ObjV(AB(NullV, N(123))))})),
  Case(Example(VarDef(Named("String")), ObjV(AB(VarV("var"), I(123))), {}),
       Resolved({Entry("arg", ObjV({Entry("b", N(123))}))})),
  Case(Example(VarDef(IntT), ObjV({Entry("b", VarV("var"))}), {Entry("var", J(123))}),
       Resolved({Entry("arg", ObjV({Entry("b", N(123))}))})),
  Case(Example(VarDef(ExampleType), VarV("var"), {Entry("var", ObjV({Entry("b", J(123))}))}),
       Resolved({Entry("arg", ObjV({Entry("b", N(123))}))})),
  Case(Example(<<>>, Str("abc123"), {}), FieldError),
  Case(Example(VarDef(ExampleType), VarV("var"), {Entry("var", Str("abc123"))}), RequestError),
  Case(Example(<<>>, ObjV(AB(Str("abc"), Str("123"))), {}), FieldError),
  Case(Example(<<>>, ObjV({Entry("a", Str("abc"))}), {}), FieldError),
  Case(Example(VarDef(IntT), ObjV({Entry("b", VarV("var"))}), {}), FieldError),
  Case(Example(VarDef(ExampleType), VarV("var"), {Entry("var", ObjV({Entry("a", Str("abc"))}))}), RequestError),
  Case(Example(<<>>, ObjV(AB(Str("abc"), NullV)), {}), FieldError),
  Case(Example(VarDef(IntT), ObjV({Entry("b", VarV("var"))}), {Entry("var", NullV)}), FieldError),
  Case(Example(<<>>, ObjV({Entry("b", I(123)), Entry("c", Str("xyz"))}), {}), FieldError)
>>

\* §6.1.2: `query($x: T [= default]) { field(v: $x) }`
X(type, hasDefault, default) == <<Def("x", type, hasDefault, default)>>
UseX(variables, field, request) == Respond(ExampleSchema, Op(variables, field, {Entry("v", VarV("x"))}), request)
VariableCases == <<
  \* A default is coerced: [Int] = 1 gives [1].
  Case(UseX(X(ListOf(IntT), TRUE, I(1)), "ints", {}), Resolved({Entry("v", ListV(<<N(1)>>))})),
  \* "defaultValue exists (including null)": the variable is null, so the
  \* argument's own default isn't used.
  Case(UseX(X(IntT, TRUE, NullV), "intDefault", {}), Resolved({Entry("v", NullV)})),
  \* A Non-Null variable with a default may be omitted, but not null.
  Case(UseX(X(NonNull(IntT), TRUE, I(3)), "int", {}), Resolved({Entry("v", N(3))})),
  Case(UseX(X(NonNull(IntT), TRUE, I(3)), "int", {Entry("x", NullV)}), RequestError),
  Case(UseX(X(NonNull(IntT), FALSE, NullV), "int", {}), RequestError),
  \* A provided value overrides the default; null is a provided value.
  Case(UseX(X(IntT, TRUE, I(3)), "int", {Entry("x", NullV)}), Resolved({Entry("v", NullV)})),
  Case(UseX(X(IntT, TRUE, I(3)), "int", {Entry("x", J(5))}), Resolved({Entry("v", N(5))})),
  \* A value that can't be coerced is a request error, not a field error.
  Case(UseX(X(IntT, FALSE, NullV), "int", {Entry("x", Str("5"))}), RequestError),
  \* Even for a variable no field uses.
  Case(Respond(ExampleSchema, Op(<<Arg("unused", IntT)>>, "int", {}), {Entry("unused", Bool(TRUE))}), RequestError)
>>

\* §6.4.1
ArgumentCases == <<
  \* A missing variable falls back to the argument's default.
  Case(UseX(X(IntT, FALSE, NullV), "intDefault", {}), Resolved({Entry("v", N(7))})),
  \* A missing variable for an argument with no default: no entry.
  Case(UseX(X(IntT, FALSE, NullV), "int", {}), Resolved({})),
  \* "a variable with a value of null provided to a Non-Null argument" is an
  \* execution error. Validation allows `$x: Int = 3` for an Int! argument.
  Case(UseX(X(IntT, TRUE, I(3)), "intNN", {Entry("x", NullV)}), FieldError),
  Case(UseX(X(IntT, TRUE, I(3)), "intNN", {}), Resolved({Entry("v", N(3))})),
  \* Omitted and null literal Non-Null arguments.
  Case(Respond(ExampleSchema, Op(<<>>, "intNN", {}), {}), FieldError),
  Case(Respond(ExampleSchema, Op(<<>>, "intNN", {Entry("v", NullV)}), {}), FieldError),
  \* An explicit null is not omission: the default doesn't apply.
  Case(Respond(ExampleSchema, Op(<<>>, "intDefault", {Entry("v", NullV)}), {}), Resolved({Entry("v", NullV)})),
  Case(Respond(ExampleSchema, Op(<<>>, "intDefault", {}), {}), Resolved({Entry("v", N(7))})),
  \* Variables inside a list literal.
  Case(Respond(ExampleSchema, Op(X(IntT, FALSE, NullV), "ints", {Entry("v", ListV(<<I(1), VarV("x")>>))}), {Entry("x", J(2))}),
       Resolved({Entry("v", ListV(<<N(1), N(2)>>))})),
  \* A literal that can't be coerced is an execution error.
  Case(Respond(ExampleSchema, Op(<<>>, "int", {Entry("v", Str("1"))}), {}), FieldError)
>>

\* §7.1.3: what responses Valid accepts.
Response(hasData, fieldIsNull, errors, called, args) ==
  [hasData |-> hasData, fieldIsNull |-> fieldIsNull, errors |-> errors, called |-> called, args |-> args]
BadVariable == Op(X(IntT, FALSE, NullV), "int", {Entry("v", VarV("x"))})
BadLiteral == Op(<<>>, "int", {Entry("v", Str("1"))})
Fine == Op(<<>>, "int", {Entry("v", I(1))})
ResponseCases == <<
  Case(Valid(ExampleSchema, BadVariable, {Entry("x", Str("1"))}, Response(FALSE, FALSE, <<<<>>>>, FALSE, NullV)), TRUE),
  \* A request error reported as an execution error.
  Case(Valid(ExampleSchema, BadVariable, {Entry("x", Str("1"))}, Response(TRUE, TRUE, <<<<"int">>>>, FALSE, NullV)), FALSE),
  \* A request error with "data": null.
  Case(Valid(ExampleSchema, BadVariable, {Entry("x", Str("1"))}, Response(TRUE, TRUE, <<<<>>>>, FALSE, NullV)), FALSE),
  Case(Valid(ExampleSchema, BadLiteral, {}, Response(TRUE, TRUE, <<<<"int">>>>, FALSE, NullV)), TRUE),
  \* An execution error reported as a request error.
  Case(Valid(ExampleSchema, BadLiteral, {}, Response(FALSE, FALSE, <<<<>>>>, FALSE, NullV)), FALSE),
  Case(Valid(ExampleSchema, Fine, {}, Response(TRUE, FALSE, <<>>, TRUE, ObjV({Entry("v", N(1))}))), TRUE),
  Case(Valid(ExampleSchema, Fine, {}, Response(TRUE, FALSE, <<>>, TRUE, ObjV({Entry("v", N(2))}))), FALSE)
>>

\* Each initial state checks one section of examples.
VARIABLE section
Sections == {"scalar", "enum", "list", "inputObject", "variables", "arguments", "response"}
Init == section \in Sections
Next == UNCHANGED section

ScalarExamples == section = "scalar" => Failing(ScalarCases) = {}
EnumExamples == section = "enum" => Failing(EnumCases) = {}
ListExamples == section = "list" => Failing(ListCases) = {}
InputObjectExamples == section = "inputObject" => Failing(InputObjectCases) = {}
VariableExamples == section = "variables" => Failing(VariableCases) = {}
ArgumentExamples == section = "arguments" => Failing(ArgumentCases) = {}
ResponseExamples == section = "response" => Failing(ResponseCases) = {}
====
