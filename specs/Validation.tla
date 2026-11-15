---- MODULE Validation ----
(***************************************************************************)
(* GraphQL validation, written by hand from the spec's formal              *)
(* specifications (the September 2026 edition,                             *)
(* https://spec.graphql.org/September2026/, §5).                            *)
(*                                                                         *)
(* Every rule is a pure operator over plain data, named after the rule it  *)
(* states, and returns the set of its violations: {} means the document    *)
(* satisfies the rule. Each violation is a string naming its subject (a    *)
(* fragment, a variable, Type.field, ...), so a differential test can match *)
(* it against the errors graphql-js reports for the same rule.              *)
(*                                                                         *)
(*   S  a schema                                                           *)
(*   D  an executable document: a sequence of definitions                  *)
(*                                                                         *)
(* scripts/differential-validation.mjs checks graphql-js 16 and 17         *)
(* against these operators. The test vectors at the end are the spec's own *)
(* examples, checked by Validation.cfg.                                    *)
(*                                                                         *)
(* Data shapes (every value of a kind has the same fields, since TLC can't *)
(* compare records of different shapes):                                   *)
(*   type ref   [name, wrappers]   [Int!]! = <<"nonNull","list","nonNull">> *)
(*                                 around "Int"; NoType when unknown       *)
(*   schema     [types, directives, roots]                                 *)
(*     types[n]       [kind, fields, possibleTypes, inputFields,           *)
(*                     enumValues, oneOf]; kind \in {"scalar", "enum",     *)
(*                     "object", "interface", "union", "input"};           *)
(*                     possibleTypes are object types                      *)
(*     fields[f]      [type, args]                                         *)
(*     args[a], inputFields[f]   [type, hasDefault]                        *)
(*     directives[d]  [locations, args, repeatable]                        *)
(*     roots          [query, mutation, subscription], "" when absent      *)
(*   definition [kind, operation, name, variables, typeCondition,          *)
(*               directives, selectionSet]                                 *)
(*              kind \in {"operation", "fragment", "typeSystem"}; an       *)
(*              anonymous operation has name ""                            *)
(*   variable   [name, type, hasDefault, default, directives]              *)
(*   selection  [kind, name, alias, arguments, directives, typeCondition,  *)
(*               hasSelectionSet, selectionSet]                            *)
(*              kind \in {"field", "fragmentSpread", "inlineFragment"};    *)
(*              alias and typeCondition are "" when absent                 *)
(*   argument   [name, value]      directive  [name, arguments]            *)
(*   value      [kind, value, items, fields]                               *)
(*              kind \in {"int", "float", "string", "boolean", "null",     *)
(*              "enum", "variable", "list", "object", "none"}; value is    *)
(*              the literal's text or the variable's name; fields is a     *)
(*              sequence of [name, value]                                  *)
(***************************************************************************)
EXTENDS Integers, Sequences, FiniteSets, TLC

-----------------------------------------------------------------------------
(* Types and the schema *)

NoType == [name |-> "", wrappers |-> <<>>]
NoValue == [kind |-> "none", value |-> "", items |-> <<>>, fields |-> <<>>]

IsNonNull(type) == type.wrappers # <<>> /\ Head(type.wrappers) = "nonNull"
IsList(type) == type.wrappers # <<>> /\ Head(type.wrappers) = "list"
OfType(type) == [type EXCEPT !.wrappers = Tail(@)]
Nullable(type) == IF IsNonNull(type) THEN OfType(type) ELSE type

Kind(S, name) == IF name \in DOMAIN S.types THEN S.types[name].kind ELSE "undefined"
IsDefined(S, name) == name \in DOMAIN S.types
\* "Object, Interface, and Union types"; "composite" in earlier editions.
IsComposite(S, name) == Kind(S, name) \in {"object", "interface", "union"}
IsLeaf(S, name) == Kind(S, name) \in {"scalar", "enum"}
\* IsInputType(type): a scalar, enum or input object, under any wrappers.
IsInputType(S, type) == Kind(S, type.name) \in {"scalar", "enum", "input"}

\* The meta-field __typename is "implicitly defined" on every Object,
\* Interface and Union type (§4.1); __schema and __type on the query root:
\* "accessible from the type of the root of a query operation" (§4.2).
IntrospectionFields == {"__typename", "__schema", "__type"}
MetaRef(name, wrappers) == [name |-> name, wrappers |-> wrappers]
TypenameDefinition == [type |-> MetaRef("String", <<"nonNull">>), args |-> <<>>]
\* "__schema: __Schema!" and "__type(name: String!): __Type".
SchemaMetaFields ==
  ("__schema" :> [type |-> MetaRef("__Schema", <<"nonNull">>), args |-> <<>>])
    @@ ("__type" :> [type |-> MetaRef("__Type", <<>>),
                     args |-> "name" :> [type |-> MetaRef("String", <<"nonNull">>), hasDefault |-> FALSE]])
IsSchemaMetaField(S, typeName, fieldName) ==
  fieldName \in DOMAIN SchemaMetaFields /\ typeName = S.roots.query /\ typeName # ""

\* The types those meta-fields return: September 2026's "Schema Introspection
\* Schema" (§4.2), which "is itself represented as a GraphQL schema". Like
\* the meta-fields, they are implicit: a schema record lists only its own
\* types, and Check adds these, with the String and Boolean scalars they
\* use. (A schema's own types can't start with "__", §3.3.)
MetaArgs(names) == [n \in names |-> [type |-> MetaRef("Boolean", <<"nonNull">>), hasDefault |-> TRUE]]
MetaOut(name, wrappers) == [type |-> MetaRef(name, wrappers), args |-> <<>>]
\* "(includeDeprecated: Boolean! = false)"
MetaOutDeprecated(name, wrappers) == [type |-> MetaRef(name, wrappers), args |-> MetaArgs({"includeDeprecated"})]
MetaDef(kind, fields, values) ==
  [kind |-> kind, fields |-> fields, possibleTypes |-> {}, inputFields |-> <<>>, enumValues |-> values, oneOf |-> FALSE]
NNListNN == <<"nonNull", "list", "nonNull">>
MetaTypes ==
  ("__Schema" :> MetaDef("object",
     ("description" :> MetaOut("String", <<>>))
       @@ ("types" :> MetaOut("__Type", NNListNN))
       @@ ("queryType" :> MetaOut("__Type", <<"nonNull">>))
       @@ ("mutationType" :> MetaOut("__Type", <<>>))
       @@ ("subscriptionType" :> MetaOut("__Type", <<>>))
       @@ ("directives" :> MetaOutDeprecated("__Directive", NNListNN)), {}))
  @@ ("__Type" :> MetaDef("object",
     ("kind" :> MetaOut("__TypeKind", <<"nonNull">>))
       @@ ("name" :> MetaOut("String", <<>>))
       @@ ("description" :> MetaOut("String", <<>>))
       @@ ("specifiedByURL" :> MetaOut("String", <<>>))
       @@ ("fields" :> MetaOutDeprecated("__Field", <<"list", "nonNull">>))
       @@ ("interfaces" :> MetaOut("__Type", <<"list", "nonNull">>))
       @@ ("possibleTypes" :> MetaOut("__Type", <<"list", "nonNull">>))
       @@ ("enumValues" :> MetaOutDeprecated("__EnumValue", <<"list", "nonNull">>))
       @@ ("inputFields" :> MetaOutDeprecated("__InputValue", <<"list", "nonNull">>))
       @@ ("ofType" :> MetaOut("__Type", <<>>))
       @@ ("isOneOf" :> MetaOut("Boolean", <<>>)), {}))
  @@ ("__TypeKind" :> MetaDef("enum", <<>>,
     {"SCALAR", "OBJECT", "INTERFACE", "UNION", "ENUM", "INPUT_OBJECT", "LIST", "NON_NULL"}))
  @@ ("__Field" :> MetaDef("object",
     ("name" :> MetaOut("String", <<"nonNull">>))
       @@ ("description" :> MetaOut("String", <<>>))
       @@ ("args" :> MetaOutDeprecated("__InputValue", NNListNN))
       @@ ("type" :> MetaOut("__Type", <<"nonNull">>))
       @@ ("isDeprecated" :> MetaOut("Boolean", <<"nonNull">>))
       @@ ("deprecationReason" :> MetaOut("String", <<>>)), {}))
  @@ ("__InputValue" :> MetaDef("object",
     ("name" :> MetaOut("String", <<"nonNull">>))
       @@ ("description" :> MetaOut("String", <<>>))
       @@ ("type" :> MetaOut("__Type", <<"nonNull">>))
       @@ ("defaultValue" :> MetaOut("String", <<>>))
       @@ ("isDeprecated" :> MetaOut("Boolean", <<"nonNull">>))
       @@ ("deprecationReason" :> MetaOut("String", <<>>)), {}))
  @@ ("__EnumValue" :> MetaDef("object",
     ("name" :> MetaOut("String", <<"nonNull">>))
       @@ ("description" :> MetaOut("String", <<>>))
       @@ ("isDeprecated" :> MetaOut("Boolean", <<"nonNull">>))
       @@ ("deprecationReason" :> MetaOut("String", <<>>)), {}))
  @@ ("__Directive" :> MetaDef("object",
     ("name" :> MetaOut("String", <<"nonNull">>))
       @@ ("description" :> MetaOut("String", <<>>))
       @@ ("isRepeatable" :> MetaOut("Boolean", <<"nonNull">>))
       @@ ("locations" :> MetaOut("__DirectiveLocation", NNListNN))
       @@ ("args" :> MetaOutDeprecated("__InputValue", NNListNN))
       @@ ("isDeprecated" :> MetaOut("Boolean", <<"nonNull">>))
       @@ ("deprecationReason" :> MetaOut("String", <<>>)), {}))
  @@ ("__DirectiveLocation" :> MetaDef("enum", <<>>,
     {"QUERY", "MUTATION", "SUBSCRIPTION", "FIELD", "FRAGMENT_DEFINITION", "FRAGMENT_SPREAD",
      "INLINE_FRAGMENT", "VARIABLE_DEFINITION", "SCHEMA", "SCALAR", "OBJECT", "FIELD_DEFINITION",
      "ARGUMENT_DEFINITION", "INTERFACE", "UNION", "ENUM", "ENUM_VALUE", "INPUT_OBJECT",
      "INPUT_FIELD_DEFINITION", "DIRECTIVE_DEFINITION"}))
  @@ ("String" :> MetaDef("scalar", <<>>, {}))
  @@ ("Boolean" :> MetaDef("scalar", <<>>, {}))

\* The schema with the introspection types added; its own types come first
\* (f @@ g takes f's value where both are defined).
WithIntrospection(S) == [types |-> S.types @@ MetaTypes, directives |-> S.directives, roots |-> S.roots]

HasField(S, typeName, fieldName) ==
  \/ fieldName = "__typename" /\ IsComposite(S, typeName)
  \/ IsSchemaMetaField(S, typeName, fieldName)
  \/ IsDefined(S, typeName) /\ fieldName \in DOMAIN S.types[typeName].fields
FieldDefinition(S, typeName, fieldName) ==
  IF fieldName = "__typename" THEN TypenameDefinition
  ELSE IF IsSchemaMetaField(S, typeName, fieldName) THEN SchemaMetaFields[fieldName]
  ELSE S.types[typeName].fields[fieldName]
\* The return type of a field selection, NoType when the field isn't defined.
FieldType(S, typeName, fieldName) ==
  IF HasField(S, typeName, fieldName) THEN FieldDefinition(S, typeName, fieldName).type ELSE NoType

\* GetPossibleTypes(type), §5.5.2.3. Interfaces list the object types that
\* implement them.
GetPossibleTypes(S, type) ==
  CASE Kind(S, type) = "object" -> {type}
    [] Kind(S, type) \in {"interface", "union"} -> S.types[type].possibleTypes
    [] OTHER -> {}

\* DoesFragmentTypeApply(objectType, fragmentType), §6.3.2.
DoesFragmentTypeApply(S, objectType, fragmentType) ==
  CASE Kind(S, fragmentType) = "object" -> objectType = fragmentType
    [] Kind(S, fragmentType) \in {"interface", "union"} ->
         objectType \in S.types[fragmentType].possibleTypes
    [] OTHER -> FALSE

-----------------------------------------------------------------------------
(* The document *)

Range(s) == {s[i] : i \in DOMAIN s}
ResponseKey(selection) == IF selection.alias = "" THEN selection.name ELSE selection.alias

OperationIndices(D) == {i \in DOMAIN D : D[i].kind = "operation"}
FragmentIndices(D) == {i \in DOMAIN D : D[i].kind = "fragment"}
ExecutableIndices(D) == OperationIndices(D) \cup FragmentIndices(D)
FragmentNames(D) == {D[i].name : i \in FragmentIndices(D)}
HasFragment(D, name) == name \in FragmentNames(D)
\* "the target of spread". When names collide (§5.5.1.1 rejects that) the
\* spec doesn't say which is the target; the last one is, as in graphql-js.
Fragment(D, name) ==
  D[CHOOSE i \in FragmentIndices(D) :
      D[i].name = name /\ \A j \in FragmentIndices(D) : D[j].name = name => j <= i]

RootType(S, operation) == S.roots[operation.operation]
\* The type of a definition's top level selection set: the root operation
\* type, or the fragment's type condition. "" when there is none.
ScopeOf(S, definition) ==
  IF definition.kind = "operation" THEN RootType(S, definition) ELSE definition.typeCondition

\* The type in scope for the selection set of `selection`, in a selection
\* set whose type is `parent`.
InnerScope(S, selection, parent) ==
  IF selection.kind = "field" THEN FieldType(S, parent, selection.name).name
  ELSE IF selection.kind = "inlineFragment" /\ selection.typeCondition # "" THEN selection.typeCondition
  ELSE parent

\* Every selection in `set` and below it, with the type in scope ("parent").
\* Fragment spreads aren't followed: a fragment's selections are visited
\* where the fragment is defined.
RECURSIVE SelectionsIn(_, _, _)
SelectionsIn(S, set, parent) ==
  UNION {{[selection |-> set[i], parent |-> parent]}
           \cup SelectionsIn(S, set[i].selectionSet, InnerScope(S, set[i], parent))
         : i \in DOMAIN set}

\* Every selection set in `set` and below it, with its type.
RECURSIVE SelectionSetsIn(_, _, _)
SelectionSetsIn(S, set, parent) ==
  {[set |-> set, parent |-> parent]}
    \cup UNION {SelectionSetsIn(S, set[i].selectionSet, InnerScope(S, set[i], parent)) : i \in DOMAIN set}

DefinitionSelections(S, definition) == SelectionsIn(S, definition.selectionSet, ScopeOf(S, definition))
AllSelections(S, D) == UNION {DefinitionSelections(S, D[i]) : i \in ExecutableIndices(D)}
AllFields(S, D) == {s \in AllSelections(S, D) : s.selection.kind = "field"}

\* "all fragment spread descendants": the names spread anywhere in `set`.
RECURSIVE SpreadsIn(_)
SpreadsIn(set) ==
  UNION {(IF set[i].kind = "fragmentSpread" THEN {set[i].name} ELSE {}) \cup SpreadsIn(set[i].selectionSet)
         : i \in DOMAIN set}

\* The fragments reachable from `frontier`, adding to `seen`.
RECURSIVE Reachable(_, _, _)
Reachable(D, frontier, seen) ==
  IF frontier \subseteq seen THEN seen
  ELSE LET new == frontier \ seen IN
       Reachable(D, UNION {SpreadsIn(Fragment(D, n).selectionSet) : n \in new \cap FragmentNames(D)},
                 seen \cup new)

\* "every fragment referenced by that operation transitively"
FragmentsReferencedBy(D, operation) ==
  Reachable(D, SpreadsIn(operation.selectionSet), {}) \cap FragmentNames(D)

-----------------------------------------------------------------------------
(* Directives, arguments and values *)

OperationLocation == [query |-> "QUERY", mutation |-> "MUTATION", subscription |-> "SUBSCRIPTION"]
SelectionLocation ==
  [field |-> "FIELD", fragmentSpread |-> "FRAGMENT_SPREAD", inlineFragment |-> "INLINE_FRAGMENT"]

\* Every list of directives in a definition, with the location it applies to.
DefinitionDirectiveLists(S, definition) ==
  {[directives |-> definition.directives,
    location |-> IF definition.kind = "operation" THEN OperationLocation[definition.operation]
                 ELSE "FRAGMENT_DEFINITION"]}
    \cup {[directives |-> definition.variables[i].directives, location |-> "VARIABLE_DEFINITION"]
          : i \in DOMAIN definition.variables}
    \cup {[directives |-> s.selection.directives, location |-> SelectionLocation[s.selection.kind]]
          : s \in DefinitionSelections(S, definition)}

AllDirectiveLists(S, D) == UNION {DefinitionDirectiveLists(S, D[i]) : i \in ExecutableIndices(D)}
AllDirectives(S, D) ==
  UNION {{[directive |-> l.directives[j], location |-> l.location] : j \in DOMAIN l.directives}
         : l \in AllDirectiveLists(S, D)}

IsDirectiveDefined(S, name) == name \in DOMAIN S.directives
DirectiveArgs(S, name) == IF IsDirectiveDefined(S, name) THEN S.directives[name].args ELSE <<>>

\* Every argument set in a definition: a field's or a directive's arguments,
\* with the argument definitions of that field or directive. `known` is
\* FALSE when the field or directive itself isn't defined. `subject` names
\* the field or directive as graphql-js does: "Type.field" or "@name".
DefinitionArgumentSets(S, definition) ==
  {[arguments |-> s.selection.arguments,
    known |-> HasField(S, s.parent, s.selection.name),
    definitions |-> IF HasField(S, s.parent, s.selection.name)
                    THEN FieldDefinition(S, s.parent, s.selection.name).args ELSE <<>>,
    field |-> TRUE, name |-> s.selection.name, subject |-> s.parent \o "." \o s.selection.name]
   : s \in {x \in DefinitionSelections(S, definition) : x.selection.kind = "field"}}
    \cup UNION {{[arguments |-> l.directives[j].arguments,
                  known |-> IsDirectiveDefined(S, l.directives[j].name),
                  definitions |-> DirectiveArgs(S, l.directives[j].name),
                  field |-> FALSE, name |-> l.directives[j].name, subject |-> "@" \o l.directives[j].name]
                 : j \in DOMAIN l.directives}
                : l \in DefinitionDirectiveLists(S, definition)}

AllArgumentSets(S, D) == UNION {DefinitionArgumentSets(S, D[i]) : i \in ExecutableIndices(D)}

\* The value at a position whose expected type is `type` (NoType when
\* unknown), and every value nested in it with its own expected type:
\* "the type expected in the position value is found".
\*   hasDefault  "a default value exists for the Argument or ObjectField"
\*   oneOf       the value is an ObjectField of a OneOf Input Object
\*   top         the value is an argument's or a default value's own value
\* A list entry's expected type is the list's item type; a ListValue in a
\* position that isn't a list has no expected type for its entries. An
\* ObjectValue's fields take their types from the named input type, since
\* a non-list value in a list position is coerced as a list of one.
RECURSIVE PositionsIn(_, _, _, _, _, _)
PositionsIn(S, value, type, hasDefault, oneOf, top) ==
  {[value |-> value, type |-> type, hasDefault |-> hasDefault, oneOf |-> oneOf, top |-> top]}
    \cup
    IF value.kind = "list" THEN
      LET item == IF type # NoType /\ IsList(Nullable(type)) THEN OfType(Nullable(type)) ELSE NoType
      IN UNION {PositionsIn(S, value.items[i], item, FALSE, FALSE, FALSE) : i \in DOMAIN value.items}
    ELSE IF value.kind = "object" THEN
      LET input == IF Kind(S, type.name) = "input" THEN type.name ELSE ""
          defs == IF input # "" THEN S.types[input].inputFields ELSE <<>>
      IN UNION {PositionsIn(S, value.fields[i].value,
                            IF value.fields[i].name \in DOMAIN defs THEN defs[value.fields[i].name].type ELSE NoType,
                            value.fields[i].name \in DOMAIN defs /\ defs[value.fields[i].name].hasDefault,
                            input # "" /\ S.types[input].oneOf,
                            FALSE)
                : i \in DOMAIN value.fields}
    ELSE {}

ArgumentPositions(S, argumentSet) ==
  LET args == argumentSet.arguments
      defs == argumentSet.definitions
  IN UNION {PositionsIn(S, args[i].value,
                        IF args[i].name \in DOMAIN defs THEN defs[args[i].name].type ELSE NoType,
                        args[i].name \in DOMAIN defs /\ defs[args[i].name].hasDefault,
                        FALSE, TRUE)
            : i \in DOMAIN args}

DefaultPositions(S, definition) ==
  UNION {PositionsIn(S, definition.variables[i].default,
                     IF IsInputType(S, definition.variables[i].type) THEN definition.variables[i].type ELSE NoType,
                     FALSE, FALSE, TRUE)
         : i \in {j \in DOMAIN definition.variables : definition.variables[j].hasDefault}}

DefinitionPositions(S, definition) ==
  UNION {ArgumentPositions(S, a) : a \in DefinitionArgumentSets(S, definition)}
    \cup DefaultPositions(S, definition)

AllPositions(S, D) == UNION {DefinitionPositions(S, D[i]) : i \in ExecutableIndices(D)}

\* The variable usages in a definition, and those "transitively included" in
\* an operation through the fragments it references.
DefinitionUsages(S, definition) == {p \in DefinitionPositions(S, definition) : p.value.kind = "variable"}
OperationUsages(S, D, operation) ==
  DefinitionUsages(S, operation)
    \cup UNION {DefinitionUsages(S, Fragment(D, n)) : n \in FragmentsReferencedBy(D, operation)}

VariableNames(operation) == {operation.variables[i].name : i \in DOMAIN operation.variables}
\* The VariableDefinition named `name` (the last, when names collide).
VariableDefinition(operation, name) ==
  operation.variables[CHOOSE i \in DOMAIN operation.variables :
    operation.variables[i].name = name
      /\ \A j \in DOMAIN operation.variables : operation.variables[j].name = name => j <= i]

\* Subjects for variables, as graphql-js names them: "Op$v", or "$v" in an
\* anonymous operation.
VariableSubject(operation, name) == operation.name \o "$" \o name

-----------------------------------------------------------------------------
(* §5.1.1 Executable Definitions *)

\* "For each definition definition in the document: definition must be
\* ExecutableDefinition (it must not be TypeSystemDefinitionOrExtension)."
ExecutableDefinitions(S, D) ==
  IF \E i \in DOMAIN D : D[i].kind \notin {"operation", "fragment"} THEN {"document"} ELSE {}

-----------------------------------------------------------------------------
(* §5.2 Operations *)

\* §5.2.1.1 Operation Type Existence: "Let rootOperationType be the root
\* operation type in schema corresponding to the kind of operation.
\* rootOperationType must exist."
OperationTypeExistence(S, D) ==
  {D[i].operation : i \in {j \in OperationIndices(D) : RootType(S, D[j]) = ""}}

\* §5.2.2.1 Operation Name Uniqueness: "If operationName exists: Let
\* operations be all operation definitions in the document named
\* operationName. operations must be a set of one."
OperationNameUniqueness(S, D) ==
  {D[i].name : i \in {j \in OperationIndices(D) :
                        D[j].name # ""
                          /\ Cardinality({k \in OperationIndices(D) : D[k].name = D[j].name}) # 1}}

\* §5.2.3.1 Lone Anonymous Operation: "If operations is a set of more than
\* 1: anonymous must be empty."
LoneAnonymousOperation(S, D) ==
  IF Cardinality(OperationIndices(D)) > 1 /\ \E i \in OperationIndices(D) : D[i].name = ""
  THEN {"anonymous"} ELSE {}

\* CollectSubscriptionFields(objectType, selectionSet, visitedFragments),
\* over selectionSet[i..], threading [fields, visited, forbidden] through
\* the walk. fields holds [key, name] for each field collected; forbidden is
\* whether some visited selection provides @skip or @include ("selection
\* must not provide the @skip directive").
RECURSIVE CollectSubscriptionFrom(_, _, _, _, _, _)
CollectSubscriptionFrom(S, D, objectType, set, i, acc) ==
  IF i > Len(set) THEN acc
  ELSE
    LET selection == set[i]
        checked == [acc EXCEPT !.forbidden =
                      @ \/ \E j \in DOMAIN selection.directives :
                             selection.directives[j].name \in {"skip", "include"}]
        next ==
          IF selection.kind = "field" THEN
            [checked EXCEPT !.fields = @ \cup {[key |-> ResponseKey(selection), name |-> selection.name]}]
          ELSE IF selection.kind = "fragmentSpread" THEN
            IF selection.name \in checked.visited THEN checked
            ELSE
              LET visited == [checked EXCEPT !.visited = @ \cup {selection.name}] IN
              IF ~HasFragment(D, selection.name) THEN visited
              ELSE IF ~DoesFragmentTypeApply(S, objectType, Fragment(D, selection.name).typeCondition)
              THEN visited
              ELSE CollectSubscriptionFrom(S, D, objectType, Fragment(D, selection.name).selectionSet, 1, visited)
          ELSE IF selection.typeCondition # ""
                  /\ ~DoesFragmentTypeApply(S, objectType, selection.typeCondition)
          THEN checked
          ELSE CollectSubscriptionFrom(S, D, objectType, selection.selectionSet, 1, checked)
    IN CollectSubscriptionFrom(S, D, objectType, set, i + 1, next)

\* §5.2.4.1 Single Root Field: "Let collectedFieldsMap be the result of
\* CollectSubscriptionFields(subscriptionType, selectionSet).
\* collectedFieldsMap must have exactly one entry, which must not be an
\* introspection field."
SingleRootField(S, D) ==
  LET holds(operation) ==
        LET collected == CollectSubscriptionFrom(S, D, S.roots.subscription, operation.selectionSet, 1,
                                                 [fields |-> {}, visited |-> {}, forbidden |-> FALSE])
        IN /\ ~collected.forbidden
           /\ Cardinality({f.key : f \in collected.fields}) = 1
           /\ \A f \in collected.fields : f.name \notin IntrospectionFields
  IN IF S.roots.subscription = "" THEN {}
     ELSE {D[i].name : i \in {j \in OperationIndices(D) : D[j].operation = "subscription" /\ ~holds(D[j])}}

\* The October 2021 edition's rule, which isn't one of Rules: since
\* September 2025 the spec forbids @skip and @include at a subscription's
\* root, where October 2021 applies them. Its §5.2.3.1 Single root field: "Let {variableValues} be
\* the empty set. Let {groupedFieldSet} be the result of
\* {CollectFields(subscriptionType, selectionSet, variableValues)}.
\* {groupedFieldSet} must have exactly one entry, which must not be an
\* introspection field." Its CollectFields skips a selection when
\* "{skipDirective}'s {if} argument is {true} or is a variable in
\* {variableValues} with the value {true}", and when "{includeDirective}'s
\* {if} argument is not {true} and is not a variable in {variableValues}
\* with the value {true}". With no variable values only the literal {true}
\* counts: @skip(if: true) drops a selection, and so does any @include
\* whose if isn't the literal true. scripts/generate-vectors-validate.mjs
\* uses it to tell which Single Root Field vectors only September 2025 and
\* later reject (`since` September 2025).
IfIsTrue(directive) ==
  \E j \in DOMAIN directive.arguments :
    /\ directive.arguments[j].name = "if"
    /\ directive.arguments[j].value.kind = "boolean"
    /\ directive.arguments[j].value.value = "true"
SkippedWithoutVariables(selection) ==
  \/ \E j \in DOMAIN selection.directives :
       selection.directives[j].name = "skip" /\ IfIsTrue(selection.directives[j])
  \/ \E j \in DOMAIN selection.directives :
       selection.directives[j].name = "include" /\ ~IfIsTrue(selection.directives[j])

\* October 2021's CollectFields(objectType, selectionSet, variableValues,
\* visitedFragments) with no variable values, over selectionSet[i..],
\* threading [fields, visited] through the walk as CollectSubscriptionFrom
\* does. A skipped fragment spread isn't visited.
RECURSIVE CollectFieldsOctober2021From(_, _, _, _, _, _)
CollectFieldsOctober2021From(S, D, objectType, set, i, acc) ==
  IF i > Len(set) THEN acc
  ELSE
    LET selection == set[i]
        next ==
          IF SkippedWithoutVariables(selection) THEN acc
          ELSE IF selection.kind = "field" THEN
            [acc EXCEPT !.fields = @ \cup {[key |-> ResponseKey(selection), name |-> selection.name]}]
          ELSE IF selection.kind = "fragmentSpread" THEN
            IF selection.name \in acc.visited THEN acc
            ELSE
              LET visited == [acc EXCEPT !.visited = @ \cup {selection.name}] IN
              IF ~HasFragment(D, selection.name) THEN visited
              ELSE IF ~DoesFragmentTypeApply(S, objectType, Fragment(D, selection.name).typeCondition)
              THEN visited
              ELSE CollectFieldsOctober2021From(S, D, objectType, Fragment(D, selection.name).selectionSet, 1, visited)
          ELSE IF selection.typeCondition # ""
                  /\ ~DoesFragmentTypeApply(S, objectType, selection.typeCondition)
          THEN acc
          ELSE CollectFieldsOctober2021From(S, D, objectType, selection.selectionSet, 1, acc)
    IN CollectFieldsOctober2021From(S, D, objectType, set, i + 1, next)

SingleRootFieldOctober2021(S, D) ==
  LET holds(operation) ==
        LET collected == CollectFieldsOctober2021From(S, D, S.roots.subscription, operation.selectionSet, 1,
                                                      [fields |-> {}, visited |-> {}])
        IN /\ Cardinality({f.key : f \in collected.fields}) = 1
           /\ \A f \in collected.fields : f.name \notin IntrospectionFields
  IN IF S.roots.subscription = "" THEN {}
     ELSE {D[i].name : i \in {j \in OperationIndices(D) : D[j].operation = "subscription" /\ ~holds(D[j])}}

-----------------------------------------------------------------------------
(* §5.3 Fields *)

\* §5.3.1 Field Selections: "Let fieldName be the target field of
\* selection. fieldName must be defined on type in scope." Only Object,
\* Interface and Union types have fields in scope; a selection set on any
\* other type, or under an unknown field or type, is another rule's error.
FieldSelections(S, D) ==
  {s.parent \o "." \o s.selection.name
   : s \in {x \in AllFields(S, D) : IsComposite(S, x.parent) /\ ~HasField(S, x.parent, x.selection.name)}}

\* "the set of selections with a given response name in set including
\* visiting fragments and inline fragments": every field reachable from
\* `set` without entering a field's selection set, as [key, field, parent]
\* where parent is the type the field is selected on (a fragment's type
\* condition, inside a fragment). `visited` stops fragment cycles, as
\* CollectFields' visitedFragments does.
RECURSIVE FieldsIn(_, _, _, _, _)
FieldsIn(S, D, set, parent, visited) ==
  UNION {LET selection == set[i] IN
           IF selection.kind = "field"
           THEN {[key |-> ResponseKey(selection), field |-> selection, parent |-> parent]}
           ELSE IF selection.kind = "inlineFragment"
           THEN FieldsIn(S, D, selection.selectionSet, InnerScope(S, selection, parent), visited)
           ELSE IF selection.name \in visited \/ ~HasFragment(D, selection.name) THEN {}
           ELSE FieldsIn(S, D, Fragment(D, selection.name).selectionSet,
                         Fragment(D, selection.name).typeCondition, visited \cup {selection.name})
         : i \in DOMAIN set}

\* The fields of a collected field's selection set, collected in turn.
SubfieldsOf(S, D, entry) ==
  FieldsIn(S, D, entry.field.selectionSet, FieldType(S, entry.parent, entry.field.name).name, {})

\* The shape comparison of SameResponseShape's steps 3 to 5, on two types:
\* "conflict" (return false), "same" (return true), or "composite" (go on).
RECURSIVE CompareShapes(_, _, _)
CompareShapes(S, typeA, typeB) ==
  IF IsNonNull(typeA) \/ IsNonNull(typeB) THEN
    \* "If typeA or typeB is nullable, return false."
    IF ~(IsNonNull(typeA) /\ IsNonNull(typeB)) THEN "conflict"
    ELSE CompareShapes(S, OfType(typeA), OfType(typeB))
  ELSE IF IsList(typeA) \/ IsList(typeB) THEN
    \* "If typeA or typeB is not List, return false. ... Repeat from step 3."
    IF ~(IsList(typeA) /\ IsList(typeB)) THEN "conflict"
    ELSE CompareShapes(S, OfType(typeA), OfType(typeB))
  ELSE IF IsLeaf(S, typeA.name) \/ IsLeaf(S, typeB.name) THEN
    \* "If typeA and typeB are the same type return true, otherwise false."
    IF typeA.name = typeB.name THEN "same" ELSE "conflict"
  ELSE "composite"

\* The recursion depth for field merging. The spec's algorithm recurses
\* into ever deeper merged selection sets, which never ends when fragments
\* spread themselves under a field; a branch that runs out of fuel is taken
\* to merge. It is deeper than any document the checks generate.
MergeFuel == 6

\* An argument's value as "identical sets of arguments" compares it: the
\* value, not its syntax, and with an input object's fields as a set, since
\* "Input object literal values are unordered lists of keyed input values"
\* (§2.10.8). The spec doesn't define "identical", so this is one reading of
\* three: the literal's text, its value (this one: a block string equals the
\* quoted string, but 1 differs from 1.0), or the coerced argument values
\* (where 1 equals 1.0 for a Float, and an omitted argument equals its
\* default). scripts/generate-vectors-validate.mjs leaves the vectors where
\* the readings disagree ungraded.
RECURSIVE ValueOf(_)
ValueOf(value) ==
  [kind |-> value.kind, value |-> value.value,
   items |-> [i \in DOMAIN value.items |-> ValueOf(value.items[i])],
   fields |-> {[name |-> value.fields[i].name, value |-> ValueOf(value.fields[i].value)] : i \in DOMAIN value.fields}]
ArgumentsOf(field) == {[name |-> a.name, value |-> ValueOf(a.value)] : a \in Range(field.arguments)}

RECURSIVE FieldsCanMerge(_, _, _, _), SameResponseShape(_, _, _, _, _)

\* FieldsInSetCanMerge(set), on the fields collected from set:
\* "Given each pair of distinct members fieldA and fieldB in fieldsForName:
\*   - SameResponseShape(fieldA, fieldB) must be true.
\*   - If the parent types of fieldA and fieldB are equal or if either is
\*     not an Object Type:
\*     - fieldA and fieldB must have identical field names.
\*     - fieldA and fieldB must have identical sets of arguments.
\*     - Let mergedSet be the result of adding the selection set of fieldA
\*       and the selection set of fieldB.
\*     - FieldsInSetCanMerge(mergedSet) must be true."
FieldsCanMerge(S, D, fields, fuel) ==
  \A a, b \in fields :
    (a # b /\ a.key = b.key) =>
      /\ SameResponseShape(S, D, a, b, fuel)
      /\ (a.parent = b.parent \/ Kind(S, a.parent) # "object" \/ Kind(S, b.parent) # "object") =>
           /\ a.field.name = b.field.name
           /\ ArgumentsOf(a.field) = ArgumentsOf(b.field)
           /\ fuel > 0 => FieldsCanMerge(S, D, SubfieldsOf(S, D, a) \cup SubfieldsOf(S, D, b), fuel - 1)

\* SameResponseShape(fieldA, fieldB). A field that isn't defined has no
\* return type to compare (§5.3.1 rejects it), so it has any shape.
SameResponseShape(S, D, a, b, fuel) ==
  LET typeA == FieldType(S, a.parent, a.field.name)
      typeB == FieldType(S, b.parent, b.field.name)
      shape == IF typeA = NoType \/ typeB = NoType THEN "same" ELSE CompareShapes(S, typeA, typeB)
  IN CASE shape = "conflict" -> FALSE
       [] shape = "same" -> TRUE
       [] OTHER ->
            \* "Let mergedSet be the result of adding the selection set of
            \* fieldA and the selection set of fieldB. ... Given each pair
            \* of distinct members subfieldA and subfieldB in
            \* fieldsForName: If SameResponseShape(subfieldA, subfieldB)
            \* is false, return false."
            \/ fuel = 0
            \/ LET merged == SubfieldsOf(S, D, a) \cup SubfieldsOf(S, D, b) IN
               \A x, y \in merged : (x # y /\ x.key = y.key) => SameResponseShape(S, D, x, y, fuel - 1)

\* §5.3.2 Field Selection Merging: "Let set be any selection set defined in
\* the GraphQL document. FieldsInSetCanMerge(set) must be true."
FieldSelectionMerging(S, D) ==
  LET sets == UNION {SelectionSetsIn(S, D[i].selectionSet, ScopeOf(S, D[i])) : i \in ExecutableIndices(D)}
  IN IF \A s \in sets : FieldsCanMerge(S, D, FieldsIn(S, D, s.set, s.parent, {}), MergeFuel)
     THEN {} ELSE {"conflict"}

\* §5.3.3 Leaf Field Selections: "Let selectionType be the unwrapped result
\* type of selection. If selectionType is a scalar or enum: The subselection
\* set of that selection must not be present. If selectionType is an
\* interface, union, or object: The subselection set of that selection
\* must be present."
LeafFieldSelections(S, D) ==
  {s.selection.name
   : s \in {x \in AllFields(S, D) :
              LET type == FieldType(S, x.parent, x.selection.name).name IN
              \/ IsLeaf(S, type) /\ x.selection.hasSelectionSet
              \/ IsComposite(S, type) /\ ~x.selection.hasSelectionSet}}

-----------------------------------------------------------------------------
(* §5.4 Arguments *)

\* §5.4.1 Argument Names: "Let argumentDefinition be the argument definition
\* provided by the parent field or definition named argumentName.
\* argumentDefinition must exist." Arguments of a field or directive that
\* isn't defined are left to §5.3.1 and §5.7.1.
ArgumentNames(S, D) ==
  UNION {{a.subject \o "(" \o a.arguments[i].name \o ")"
          : i \in {j \in DOMAIN a.arguments : a.arguments[j].name \notin DOMAIN a.definitions}}
         : a \in {x \in AllArgumentSets(S, D) : x.known}}

\* §5.4.2 Argument Uniqueness: "Let arguments be all Arguments named
\* argumentName in the Argument Set which contains argument. arguments must
\* be the set containing only argument."
ArgumentUniqueness(S, D) ==
  UNION {{a.arguments[i].name
          : i \in {j \in DOMAIN a.arguments :
                     \E k \in DOMAIN a.arguments : k # j /\ a.arguments[k].name = a.arguments[j].name}}
         : a \in AllArgumentSets(S, D)}

\* §5.4.3 Required Arguments: "If type is Non-Null and defaultValue does
\* not exist: ... Let argument be the argument in arguments named
\* argumentName. argument must exist. Let value be the value of argument.
\* value must not be the null literal." Subjects are "field(arg)" or
\* "@directive(arg)", as graphql-js names them.
RequiredArguments(S, D) ==
  UNION {{(IF a.field THEN a.name ELSE "@" \o a.name) \o "(" \o n \o ")"
          : n \in {m \in DOMAIN a.definitions :
                     /\ IsNonNull(a.definitions[m].type)
                     /\ ~a.definitions[m].hasDefault
                     /\ \/ ~\E i \in DOMAIN a.arguments : a.arguments[i].name = m
                        \/ \E i \in DOMAIN a.arguments :
                             a.arguments[i].name = m /\ a.arguments[i].value.kind = "null"}}
         : a \in {x \in AllArgumentSets(S, D) : x.known}}

-----------------------------------------------------------------------------
(* §5.5 Fragments *)

\* §5.5.1.1 Fragment Name Uniqueness: "Let fragments be all fragment
\* definitions in the document named fragmentName. fragments must be a set
\* of one."
FragmentNameUniqueness(S, D) ==
  {D[i].name : i \in {j \in FragmentIndices(D) :
                        Cardinality({k \in FragmentIndices(D) : D[k].name = D[j].name}) # 1}}

\* §5.5.1.2 Fragment Spread Type Existence: "For each named spread
\* namedSpread in the document: Let fragment be the target of namedSpread.
\* The target type of fragment must be defined in the schema." The text
\* adds "This applies for both named and inline fragments", and its
\* counter-example `notOnExistingType` is a fragment no spread targets, so
\* every fragment definition is checked, as well as every inline fragment
\* with a type condition.
FragmentSpreadTypeExistence(S, D) ==
  {D[i].typeCondition : i \in {j \in FragmentIndices(D) : ~IsDefined(S, D[j].typeCondition)}}
    \cup {s.selection.typeCondition
          : s \in {x \in AllSelections(S, D) :
                     /\ x.selection.kind = "inlineFragment"
                     /\ x.selection.typeCondition # ""
                     /\ ~IsDefined(S, x.selection.typeCondition)}}

\* §5.5.1.3 Fragments on Object, Interface or Union Types: "The target type
\* of fragment must have kind UNION, INTERFACE, or OBJECT." This "applies to
\* both inline and named fragments". A type that isn't defined is left to
\* §5.5.1.2.
FragmentsOnObjectInterfaceOrUnionTypes(S, D) ==
  LET conditions ==
        {D[i].typeCondition : i \in FragmentIndices(D)}
          \cup {s.selection.typeCondition
                : s \in {x \in AllSelections(S, D) :
                           x.selection.kind = "inlineFragment" /\ x.selection.typeCondition # ""}}
  IN {t \in conditions : IsDefined(S, t) /\ ~IsComposite(S, t)}

\* §5.5.1.4 Fragments Must Be Used: "fragment must be the target of at least
\* one spread in the document."
FragmentsMustBeUsed(S, D) ==
  LET spread == {s.selection.name : s \in {x \in AllSelections(S, D) : x.selection.kind = "fragmentSpread"}}
  IN FragmentNames(D) \ spread

\* §5.5.2.1 Fragment Spread Target Defined: "Let fragment be the target of
\* namedSpread. fragment must be defined in the document."
FragmentSpreadTargetDefined(S, D) ==
  {s.selection.name
   : s \in {x \in AllSelections(S, D) :
              x.selection.kind = "fragmentSpread" /\ ~HasFragment(D, x.selection.name)}}

\* DetectFragmentCycles(fragmentDefinition, visited), TRUE when it finds
\* nothing:
\* "Let spreads be all fragment spread descendants of fragmentDefinition.
\* For each spread in spreads:
\*   - visited must not contain spread.
\*   - Let nextVisited be the set including spread and members of visited.
\*   - Let nextFragmentDefinition be the target of spread.
\*   - DetectFragmentCycles(nextFragmentDefinition, nextVisited)."
\* A spread whose target isn't defined has nothing to follow (§5.5.2.1).
RECURSIVE DetectFragmentCycles(_, _, _)
DetectFragmentCycles(D, fragmentDefinition, visited) ==
  \A spread \in SpreadsIn(fragmentDefinition.selectionSet) :
    /\ spread \notin visited
    /\ HasFragment(D, spread) => DetectFragmentCycles(D, Fragment(D, spread), visited \cup {spread})

\* §5.5.2.2 Fragment Spreads Must Not Form Cycles: "For each
\* fragmentDefinition in the document: Let visited be the empty set.
\* DetectFragmentCycles(fragmentDefinition, visited)."
FragmentSpreadsMustNotFormCycles(S, D) ==
  IF \A i \in FragmentIndices(D) : DetectFragmentCycles(D, D[i], {}) THEN {} ELSE {"cycle"}

\* §5.5.2.3 Fragment Spread Is Possible: "Let applicableTypes be the
\* intersection of GetPossibleTypes(fragmentType) and
\* GetPossibleTypes(parentType). applicableTypes must not be empty."
\* Subjects are "Parent>Fragment". A spread whose target, type condition or
\* parent type isn't defined, or isn't a composite type, is another rule's
\* error. An inline fragment without a type condition has the parent type
\* as its type condition.
FragmentSpreadIsPossible(S, D) ==
  LET spreads == {s \in AllSelections(S, D) : s.selection.kind # "field"}
      fragmentType(s) ==
        CASE s.selection.kind = "fragmentSpread" /\ HasFragment(D, s.selection.name) ->
               Fragment(D, s.selection.name).typeCondition
          [] s.selection.kind = "fragmentSpread" -> ""
          [] s.selection.typeCondition = "" -> s.parent
          [] OTHER -> s.selection.typeCondition
  IN {s.parent \o ">" \o fragmentType(s)
      : s \in {x \in spreads :
                 /\ IsComposite(S, fragmentType(x))
                 /\ IsComposite(S, x.parent)
                 /\ GetPossibleTypes(S, fragmentType(x)) \cap GetPossibleTypes(S, x.parent) = {}}}

-----------------------------------------------------------------------------
(* §5.6 Values *)

ScalarLiterals ==
  ("Int" :> {"int"}) @@ ("Float" :> {"int", "float"}) @@ ("String" :> {"string"})
    @@ ("Boolean" :> {"boolean"}) @@ ("ID" :> {"string", "int"})

\* Whether a literal is coercible to `type` (§3.5, §3.9, §3.10, §3.11),
\* "with the assumption that any variableUsage nested within value will
\* represent a runtime value valid for usage in its position". A simple
\* check by literal kind: Int and ID literals are taken to be in range, and
\* custom scalars accept any literal.
RECURSIVE Coercible(_, _, _), InputObjectCoercible(_, _, _)
Coercible(S, value, type) ==
  IF value.kind = "variable" THEN TRUE
  ELSE IF IsNonNull(type) THEN value.kind # "null" /\ Coercible(S, value, OfType(type))
  ELSE IF value.kind = "null" THEN TRUE
  ELSE IF IsList(type) THEN
    \* "If the value passed as an input to a list type is not a list and not
    \* the null value, then the result of input coercion is a list of size
    \* one."
    IF value.kind = "list" THEN \A i \in DOMAIN value.items : Coercible(S, value.items[i], OfType(type))
    ELSE Coercible(S, value, OfType(type))
  ELSE IF value.kind = "list" THEN FALSE
  ELSE CASE Kind(S, type.name) = "scalar" ->
              type.name \notin DOMAIN ScalarLiterals \/ value.kind \in ScalarLiterals[type.name]
         [] Kind(S, type.name) = "enum" ->
              value.kind = "enum" /\ value.value \in S.types[type.name].enumValues
         [] Kind(S, type.name) = "input" ->
              value.kind = "object" /\ InputObjectCoercible(S, value, type.name)
         [] OTHER -> FALSE

\* §3.10.1 Input Coercion for an ObjectValue: every field is defined and
\* coercible, every required field is provided, and a OneOf Input Object
\* has "exactly one entry, and the value of that entry must not be null".
InputObjectCoercible(S, value, name) ==
  LET defs == S.types[name].inputFields IN
  /\ \A i \in DOMAIN value.fields :
       value.fields[i].name \in DOMAIN defs
         /\ Coercible(S, value.fields[i].value, defs[value.fields[i].name].type)
  /\ \A f \in DOMAIN defs :
       (IsNonNull(defs[f].type) /\ ~defs[f].hasDefault) =>
         \E i \in DOMAIN value.fields : value.fields[i].name = f
  /\ S.types[name].oneOf => Len(value.fields) = 1 /\ value.fields[1].value.kind # "null"

\* §5.6.1 Values of Correct Type: "Let type be the type expected in the
\* position value is found. value must be coercible to type".
ValuesOfCorrectType(S, D) ==
  IF \A p \in AllPositions(S, D) : (p.top /\ p.type # NoType) => Coercible(S, p.value, p.type)
  THEN {} ELSE {"value"}

ObjectPositions(S, D) ==
  {p \in AllPositions(S, D) : p.value.kind = "object" /\ Kind(S, p.type.name) = "input"}

\* §5.6.2 Input Object Field Names: "Let inputFieldDefinition be the input
\* field definition provided by the parent input object type named
\* inputFieldName. inputFieldDefinition must exist."
InputObjectFieldNames(S, D) ==
  UNION {{p.type.name \o "." \o p.value.fields[i].name
          : i \in {j \in DOMAIN p.value.fields :
                     p.value.fields[j].name \notin DOMAIN S.types[p.type.name].inputFields}}
         : p \in ObjectPositions(S, D)}

\* §5.6.3 Input Object Field Uniqueness: "Let fields be all Input Object
\* Fields named name in inputObject. fields must be the set containing only
\* inputField."
InputObjectFieldUniqueness(S, D) ==
  UNION {{p.value.fields[i].name
          : i \in {j \in DOMAIN p.value.fields :
                     \E k \in DOMAIN p.value.fields : k # j /\ p.value.fields[k].name = p.value.fields[j].name}}
         : p \in {q \in AllPositions(S, D) : q.value.kind = "object"}}

\* §5.6.4 Input Object Required Fields: "If type is Non-Null and
\* defaultValue does not exist: ... field must exist. Let value be the value
\* of field. value must not be the null literal."
InputObjectRequiredFields(S, D) ==
  UNION {LET defs == S.types[p.type.name].inputFields IN
         {p.type.name \o "." \o f
          : f \in {g \in DOMAIN defs :
                     /\ IsNonNull(defs[g].type)
                     /\ ~defs[g].hasDefault
                     /\ \/ ~\E i \in DOMAIN p.value.fields : p.value.fields[i].name = g
                        \/ \E i \in DOMAIN p.value.fields :
                             p.value.fields[i].name = g /\ p.value.fields[i].value.kind = "null"}}
         : p \in ObjectPositions(S, D)}

-----------------------------------------------------------------------------
(* §5.7 Directives *)

\* §5.7.1 Directives Are Defined: "Let directiveDefinition be the directive
\* named directiveName. directiveDefinition must exist."
DirectivesAreDefined(S, D) ==
  {u.directive.name : u \in {x \in AllDirectives(S, D) : ~IsDirectiveDefined(S, x.directive.name)}}

\* §5.7.2 Directives Are in Valid Locations: "Let adjacent be the AST node
\* the directive affects. adjacent must be represented by an item within
\* locations." Subjects are "name@LOCATION".
DirectivesAreInValidLocations(S, D) ==
  {u.directive.name \o "@" \o u.location
   : u \in {x \in AllDirectives(S, D) :
              IsDirectiveDefined(S, x.directive.name)
                /\ x.location \notin S.directives[x.directive.name].locations}}

\* §5.7.3 Directives Are Unique per Location: "Let directives be the set of
\* Directives which apply to location and are not repeatable. ... Let
\* namedDirectives be the set of all Directives named directiveName in
\* directives. namedDirectives must be a set of one." A directive that
\* isn't defined is neither repeatable nor not (§5.7.1).
DirectivesAreUniquePerLocation(S, D) ==
  UNION {{l.directives[i].name
          : i \in {j \in DOMAIN l.directives :
                     /\ IsDirectiveDefined(S, l.directives[j].name)
                     /\ ~S.directives[l.directives[j].name].repeatable
                     /\ \E k \in DOMAIN l.directives : k # j /\ l.directives[k].name = l.directives[j].name}}
         : l \in AllDirectiveLists(S, D)}

-----------------------------------------------------------------------------
(* §5.8 Variables *)

\* §5.8.1 Variable Uniqueness: "Let variables be the set of all variables
\* named variableName on operation. variables must be a set of one."
VariableUniqueness(S, D) ==
  UNION {LET vars == D[o].variables IN
         {vars[i].name : i \in {j \in DOMAIN vars : \E k \in DOMAIN vars : k # j /\ vars[k].name = vars[j].name}}
         : o \in OperationIndices(D)}

\* §5.8.2 Variables Are Input Types: "IsInputType(variableType) must be
\* true."
VariablesAreInputTypes(S, D) ==
  UNION {LET vars == D[o].variables IN
         {vars[i].name : i \in {j \in DOMAIN vars : ~IsInputType(S, vars[j].type)}}
         : o \in OperationIndices(D)}

\* §5.8.3 All Variable Uses Defined: "For each variableUsage in scope,
\* variable must be in operation's variable list. Let fragments be every
\* fragment referenced by that operation transitively. For each fragment in
\* fragments: For each variableUsage in scope of fragment, variable must be
\* in operation's variable list."
AllVariableUsesDefined(S, D) ==
  UNION {LET op == D[o] IN
         {VariableSubject(op, u.value.value)
          : u \in {x \in OperationUsages(S, D, op) : x.value.value \notin VariableNames(op)}}
         : o \in OperationIndices(D)}

\* §5.8.4 All Variables Used: "Each variable in variables must be used at
\* least once in either the operation scope itself or any fragment
\* transitively referenced by that operation."
AllVariablesUsed(S, D) ==
  UNION {LET op == D[o]
             used == {u.value.value : u \in OperationUsages(S, D, op)}
         IN {VariableSubject(op, n) : n \in VariableNames(op) \ used}
         : o \in OperationIndices(D)}

\* AreTypesCompatible(variableType, locationType)
RECURSIVE AreTypesCompatible(_, _)
AreTypesCompatible(variableType, locationType) ==
  IF IsNonNull(locationType) THEN
    \* "If variableType is NOT a non-null type, return false."
    IsNonNull(variableType) /\ AreTypesCompatible(OfType(variableType), OfType(locationType))
  ELSE IF IsNonNull(variableType) THEN
    AreTypesCompatible(OfType(variableType), locationType)
  ELSE IF IsList(locationType) THEN
    \* "If variableType is NOT a list type, return false."
    IsList(variableType) /\ AreTypesCompatible(OfType(variableType), OfType(locationType))
  ELSE IF IsList(variableType) THEN FALSE
  \* "Return true if variableType and locationType are identical"
  ELSE variableType.name = locationType.name

\* IsNonNullPosition(locationType, variableUsage): "If locationType is a
\* non-null type, return true. If the location of variableUsage is an
\* ObjectField: ... If parentLocationType is a OneOf Input Object type,
\* return true."
IsNonNullPosition(usage) == IsNonNull(usage.type) \/ usage.oneOf

\* IsVariableUsageAllowed(variableDefinition, variableUsage)
IsVariableUsageAllowed(variableDefinition, usage) ==
  LET variableType == variableDefinition.type
      locationType == usage.type
  IN IF IsNonNullPosition(usage) /\ ~IsNonNull(variableType)
     THEN LET hasNonNullVariableDefaultValue ==
                variableDefinition.hasDefault /\ variableDefinition.default.kind # "null"
              hasLocationDefaultValue == usage.hasDefault
          IN /\ hasNonNullVariableDefaultValue \/ hasLocationDefaultValue
             \* "Let nullableLocationType be the unwrapped nullable type of
             \* locationType."
             /\ AreTypesCompatible(variableType, Nullable(locationType))
     ELSE AreTypesCompatible(variableType, locationType)

\* §5.8.5 All Variable Usages Are Allowed: "For each variableUsage in
\* variableUsages: ... Let variableDefinition be the VariableDefinition
\* named variableName defined within operation.
\* IsVariableUsageAllowed(variableDefinition, variableUsage) must be true."
\* A usage of a variable that isn't defined (§5.8.3), or in a position with
\* no expected type, has nothing to compare.
AllVariableUsagesAreAllowed(S, D) ==
  UNION {LET op == D[o] IN
         {u.value.value
          : u \in {x \in OperationUsages(S, D, op) :
                     /\ x.value.value \in VariableNames(op)
                     /\ x.type # NoType
                     /\ ~IsVariableUsageAllowed(VariableDefinition(op, x.value.value), x)}}
         : o \in OperationIndices(D)}

\* Where §5.8.5's prose and its formal text disagree. The prose says
\* "Variables used for OneOf Input Object fields must be non-nullable." The
\* formal text lets a nullable variable into a OneOf field when "a default
\* value exists for variableDefinition and is not the value null". These are
\* the variables of usages only the prose rejects. The rule above follows
\* the formal text; scripts/generate-vectors-validate.mjs leaves the vectors
\* this decides ungraded.
OneOfProseOnly(S, D) ==
  UNION {LET op == D[o] IN
         {u.value.value
          : u \in {x \in OperationUsages(S, D, op) :
                     /\ x.oneOf
                     /\ x.value.value \in VariableNames(op)
                     /\ ~IsNonNull(VariableDefinition(op, x.value.value).type)
                     /\ IsVariableUsageAllowed(VariableDefinition(op, x.value.value), x)}}
         : o \in OperationIndices(D)}

-----------------------------------------------------------------------------
(* Every rule, by name *)

Sections ==
  ("ExecutableDefinitions" :> "5.1.1")
    @@ ("OperationTypeExistence" :> "5.2.1.1")
    @@ ("OperationNameUniqueness" :> "5.2.2.1")
    @@ ("LoneAnonymousOperation" :> "5.2.3.1")
    @@ ("SingleRootField" :> "5.2.4.1")
    @@ ("FieldSelections" :> "5.3.1")
    @@ ("FieldSelectionMerging" :> "5.3.2")
    @@ ("LeafFieldSelections" :> "5.3.3")
    @@ ("ArgumentNames" :> "5.4.1")
    @@ ("ArgumentUniqueness" :> "5.4.2")
    @@ ("RequiredArguments" :> "5.4.3")
    @@ ("FragmentNameUniqueness" :> "5.5.1.1")
    @@ ("FragmentSpreadTypeExistence" :> "5.5.1.2")
    @@ ("FragmentsOnObjectInterfaceOrUnionTypes" :> "5.5.1.3")
    @@ ("FragmentsMustBeUsed" :> "5.5.1.4")
    @@ ("FragmentSpreadTargetDefined" :> "5.5.2.1")
    @@ ("FragmentSpreadsMustNotFormCycles" :> "5.5.2.2")
    @@ ("FragmentSpreadIsPossible" :> "5.5.2.3")
    @@ ("ValuesOfCorrectType" :> "5.6.1")
    @@ ("InputObjectFieldNames" :> "5.6.2")
    @@ ("InputObjectFieldUniqueness" :> "5.6.3")
    @@ ("InputObjectRequiredFields" :> "5.6.4")
    @@ ("DirectivesAreDefined" :> "5.7.1")
    @@ ("DirectivesAreInValidLocations" :> "5.7.2")
    @@ ("DirectivesAreUniquePerLocation" :> "5.7.3")
    @@ ("VariableUniqueness" :> "5.8.1")
    @@ ("VariablesAreInputTypes" :> "5.8.2")
    @@ ("AllVariableUsesDefined" :> "5.8.3")
    @@ ("AllVariablesUsed" :> "5.8.4")
    @@ ("AllVariableUsagesAreAllowed" :> "5.8.5")

Rules == DOMAIN Sections

CheckRule(rule, S, D) ==
  CASE rule = "ExecutableDefinitions" -> ExecutableDefinitions(S, D)
    [] rule = "OperationTypeExistence" -> OperationTypeExistence(S, D)
    [] rule = "OperationNameUniqueness" -> OperationNameUniqueness(S, D)
    [] rule = "LoneAnonymousOperation" -> LoneAnonymousOperation(S, D)
    [] rule = "SingleRootField" -> SingleRootField(S, D)
    [] rule = "FieldSelections" -> FieldSelections(S, D)
    [] rule = "FieldSelectionMerging" -> FieldSelectionMerging(S, D)
    [] rule = "LeafFieldSelections" -> LeafFieldSelections(S, D)
    [] rule = "ArgumentNames" -> ArgumentNames(S, D)
    [] rule = "ArgumentUniqueness" -> ArgumentUniqueness(S, D)
    [] rule = "RequiredArguments" -> RequiredArguments(S, D)
    [] rule = "FragmentNameUniqueness" -> FragmentNameUniqueness(S, D)
    [] rule = "FragmentSpreadTypeExistence" -> FragmentSpreadTypeExistence(S, D)
    [] rule = "FragmentsOnObjectInterfaceOrUnionTypes" -> FragmentsOnObjectInterfaceOrUnionTypes(S, D)
    [] rule = "FragmentsMustBeUsed" -> FragmentsMustBeUsed(S, D)
    [] rule = "FragmentSpreadTargetDefined" -> FragmentSpreadTargetDefined(S, D)
    [] rule = "FragmentSpreadsMustNotFormCycles" -> FragmentSpreadsMustNotFormCycles(S, D)
    [] rule = "FragmentSpreadIsPossible" -> FragmentSpreadIsPossible(S, D)
    [] rule = "ValuesOfCorrectType" -> ValuesOfCorrectType(S, D)
    [] rule = "InputObjectFieldNames" -> InputObjectFieldNames(S, D)
    [] rule = "InputObjectFieldUniqueness" -> InputObjectFieldUniqueness(S, D)
    [] rule = "InputObjectRequiredFields" -> InputObjectRequiredFields(S, D)
    [] rule = "DirectivesAreDefined" -> DirectivesAreDefined(S, D)
    [] rule = "DirectivesAreInValidLocations" -> DirectivesAreInValidLocations(S, D)
    [] rule = "DirectivesAreUniquePerLocation" -> DirectivesAreUniquePerLocation(S, D)
    [] rule = "VariableUniqueness" -> VariableUniqueness(S, D)
    [] rule = "VariablesAreInputTypes" -> VariablesAreInputTypes(S, D)
    [] rule = "AllVariableUsesDefined" -> AllVariableUsesDefined(S, D)
    [] rule = "AllVariablesUsed" -> AllVariablesUsed(S, D)
    [] rule = "AllVariableUsagesAreAllowed" -> AllVariableUsagesAreAllowed(S, D)

\* The rule's violations against the schema with its implicit introspection
\* types.
Check(rule, S, D) == CheckRule(rule, WithIntrospection(S), D)

\* A document is valid when it violates no rule.
IsValid(S, D) == LET Full == WithIntrospection(S) IN \A rule \in Rules : CheckRule(rule, Full, D) = {}

-----------------------------------------------------------------------------
(* Test vectors: the spec's examples *)

(* Constructors for writing schemas and documents by hand. *)
T(name) == [name |-> name, wrappers |-> <<>>]
NN(type) == [type EXCEPT !.wrappers = <<"nonNull">> \o @]
L(type) == [type EXCEPT !.wrappers = <<"list">> \o @]

In(type) == [type |-> type, hasDefault |-> FALSE]
InDefault(type) == [type |-> type, hasDefault |-> TRUE]
Out(type) == [type |-> type, args |-> <<>>]
OutArgs(type, args) == [type |-> type, args |-> args]

TypeDef(kind, fields, possible, inputFields, values, oneOf) ==
  [kind |-> kind, fields |-> fields, possibleTypes |-> possible, inputFields |-> inputFields,
   enumValues |-> values, oneOf |-> oneOf]
ScalarDef == TypeDef("scalar", <<>>, {}, <<>>, {}, FALSE)
ObjectDef(fields) == TypeDef("object", fields, {}, <<>>, {}, FALSE)
InterfaceDef(fields, possible) == TypeDef("interface", fields, possible, <<>>, {}, FALSE)
UnionDef(possible) == TypeDef("union", <<>>, possible, <<>>, {}, FALSE)
EnumDef(values) == TypeDef("enum", <<>>, {}, <<>>, values, FALSE)
InputDef(fields, oneOf) == TypeDef("input", <<>>, {}, fields, {}, oneOf)

Lit(kind, text) == [kind |-> kind, value |-> text, items |-> <<>>, fields |-> <<>>]
IntV(text) == Lit("int", text)
StrV(text) == Lit("string", text)
BoolV(text) == Lit("boolean", text)
Enum(text) == Lit("enum", text)
Null == Lit("null", "")
Var(name) == Lit("variable", name)
ListOf(items) == [kind |-> "list", value |-> "", items |-> items, fields |-> <<>>]
ObjectOf(fields) == [kind |-> "object", value |-> "", items |-> <<>>, fields |-> fields]
A(name, value) == [name |-> name, value |-> value]
Dir(name, args) == [name |-> name, arguments |-> args]

Selection(kind, name, cond, has, set) ==
  [kind |-> kind, name |-> name, alias |-> "", arguments |-> <<>>, directives |-> <<>>,
   typeCondition |-> cond, hasSelectionSet |-> has, selectionSet |-> set]
F(name) == Selection("field", name, "", FALSE, <<>>)
FS(name, set) == Selection("field", name, "", TRUE, set)
FA(name, args) == [F(name) EXCEPT !.arguments = args]
As(alias, selection) == [selection EXCEPT !.alias = alias]
WithDirs(selection, dirs) == [selection EXCEPT !.directives = dirs]
WithArgs(selection, args) == [selection EXCEPT !.arguments = args]
Spread(name) == Selection("fragmentSpread", name, "", FALSE, <<>>)
On(cond, set) == Selection("inlineFragment", "", cond, TRUE, set)

Definition(kind, operation, name, vars, cond, set) ==
  [kind |-> kind, operation |-> operation, name |-> name, variables |-> vars,
   typeCondition |-> cond, directives |-> <<>>, selectionSet |-> set]
Op(operation, name, vars, set) == Definition("operation", operation, name, vars, "", set)
Q(name, vars, set) == Op("query", name, vars, set)
Frag(name, cond, set) == Definition("fragment", "", name, <<>>, cond, set)
TypeExtension == Definition("typeSystem", "", "Dog", <<>>, "", <<>>)
VarDef(name, type) == [name |-> name, type |-> type, hasDefault |-> FALSE, default |-> NoValue, directives |-> <<>>]
VarDefault(name, type, value) == [VarDef(name, type) EXCEPT !.hasDefault = TRUE, !.default = value]

StringT == T("String")
BooleanT == T("Boolean")

\* The schema of §5's examples.
Examples ==
  [types |->
     ("Int" :> ScalarDef) @@ ("Float" :> ScalarDef) @@ ("String" :> ScalarDef)
       @@ ("Boolean" :> ScalarDef) @@ ("ID" :> ScalarDef)
       @@ ("Query" :> ObjectDef(
             ("dog" :> Out(T("Dog")))
               @@ ("findDog" :> OutArgs(T("Dog"), "searchBy" :> In(T("FindDogInput"))))
               @@ ("human" :> Out(T("Human"))) @@ ("pet" :> Out(T("Pet")))
               @@ ("catOrDog" :> Out(T("CatOrDog"))) @@ ("arguments" :> Out(T("Arguments")))
               @@ ("booleanList" :> OutArgs(BooleanT, "booleanListArg" :> In(L(NN(BooleanT)))))))
       @@ ("Mutation" :> ObjectDef(
             ("addPet" :> OutArgs(T("Pet"), "pet" :> In(NN(T("PetInput")))))
               @@ ("addPets" :> OutArgs(L(T("Pet")), "pets" :> In(NN(L(NN(T("PetInput")))))))))
       @@ ("Subscription" :> ObjectDef(
             ("newMessage" :> Out(T("Message"))) @@ ("disallowedSecondRootField" :> Out(BooleanT))))
       @@ ("Message" :> ObjectDef(("body" :> Out(StringT)) @@ ("sender" :> Out(StringT))))
       @@ ("DogCommand" :> EnumDef({"SIT", "DOWN", "HEEL"}))
       @@ ("CatCommand" :> EnumDef({"JUMP"}))
       @@ ("Dog" :> ObjectDef(
             ("name" :> Out(NN(StringT))) @@ ("nickname" :> Out(StringT)) @@ ("barkVolume" :> Out(T("Int")))
               @@ ("doesKnowCommand" :> OutArgs(NN(BooleanT), "dogCommand" :> In(NN(T("DogCommand")))))
               @@ ("isHouseTrained" :> OutArgs(NN(BooleanT), "atOtherHomes" :> In(BooleanT)))
               @@ ("owner" :> Out(T("Human")))))
       @@ ("Sentient" :> InterfaceDef("name" :> Out(NN(StringT)), {"Alien", "Human"}))
       @@ ("Pet" :> InterfaceDef("name" :> Out(NN(StringT)), {"Dog", "Cat"}))
       @@ ("Alien" :> ObjectDef(("name" :> Out(NN(StringT))) @@ ("homePlanet" :> Out(StringT))))
       @@ ("Human" :> ObjectDef(("name" :> Out(NN(StringT))) @@ ("pets" :> Out(L(NN(T("Pet")))))))
       @@ ("Cat" :> ObjectDef(
             ("name" :> Out(NN(StringT))) @@ ("nickname" :> Out(StringT))
               @@ ("doesKnowCommand" :> OutArgs(NN(BooleanT), "catCommand" :> In(NN(T("CatCommand")))))
               @@ ("meowVolume" :> Out(T("Int")))))
       @@ ("CatOrDog" :> UnionDef({"Cat", "Dog"}))
       @@ ("DogOrHuman" :> UnionDef({"Dog", "Human"}))
       @@ ("HumanOrAlien" :> UnionDef({"Human", "Alien"}))
       @@ ("FindDogInput" :> InputDef(("name" :> In(StringT)) @@ ("owner" :> In(StringT)), FALSE))
       @@ ("CatInput" :> InputDef(
             ("name" :> In(NN(StringT))) @@ ("nickname" :> In(StringT)) @@ ("meowVolume" :> In(T("Int"))), FALSE))
       @@ ("DogInput" :> InputDef(
             ("name" :> In(NN(StringT))) @@ ("nickname" :> In(StringT)) @@ ("barkVolume" :> In(T("Int"))), FALSE))
       @@ ("PetInput" :> InputDef(("cat" :> In(T("CatInput"))) @@ ("dog" :> In(T("DogInput"))), TRUE))
       @@ ("Arguments" :> ObjectDef(
             ("multipleRequirements" :> OutArgs(NN(T("Int")), ("x" :> In(NN(T("Int")))) @@ ("y" :> In(NN(T("Int"))))))
               @@ ("booleanArgField" :> OutArgs(BooleanT, "booleanArg" :> In(BooleanT)))
               @@ ("floatArgField" :> OutArgs(T("Float"), "floatArg" :> In(T("Float"))))
               @@ ("intArgField" :> OutArgs(T("Int"), "intArg" :> In(T("Int"))))
               @@ ("nonNullBooleanArgField" :> OutArgs(NN(BooleanT), "nonNullBooleanArg" :> In(NN(BooleanT))))
               @@ ("booleanListArgField" :> OutArgs(L(BooleanT), "booleanListArg" :> In(NN(L(BooleanT)))))
               @@ ("optionalNonNullBooleanArgField"
                     :> OutArgs(NN(BooleanT), "optionalBooleanArg" :> InDefault(NN(BooleanT))))))
       \* The example of "Interface Spreads in Implemented Interface Scope".
       @@ ("Node" :> InterfaceDef("id" :> Out(NN(T("ID"))), {}))
       @@ ("Resource" :> InterfaceDef(("id" :> Out(NN(T("ID")))) @@ ("url" :> Out(StringT)), {})),
   directives |->
     ("skip" :> [locations |-> {"FIELD", "FRAGMENT_SPREAD", "INLINE_FRAGMENT"},
                 args |-> "if" :> In(NN(BooleanT)), repeatable |-> FALSE])
       @@ ("include" :> [locations |-> {"FIELD", "FRAGMENT_SPREAD", "INLINE_FRAGMENT"},
                         args |-> "if" :> In(NN(BooleanT)), repeatable |-> FALSE]),
   roots |-> [query |-> "Query", mutation |-> "Mutation", subscription |-> "Subscription"]]

\* "type Query { hello: StringT }", for Operation Type Existence.
Hello ==
  [types |-> ("String" :> ScalarDef) @@ ("Query" :> ObjectDef("hello" :> Out(StringT))),
   directives |-> Examples.directives,
   roots |-> [query |-> "Query", mutation |-> "", subscription |-> ""]]

\* A vector: the rule, the schema, the document, and whether the spec says it
\* is valid under that rule. V is one of the spec's own examples; Added is a
\* document this module adds beside them, which the spec doesn't contain (the
\* kit publishes those apart from the spec's examples).
V(rule, schema, doc, valid) ==
  [rule |-> rule, schema |-> schema, doc |-> doc, valid |-> valid, added |-> FALSE]
Added(rule, schema, doc, valid) == [V(rule, schema, doc, valid) EXCEPT !.added = TRUE]

Dog(set) == <<Q("", <<>>, <<FS("dog", set)>>)>>
DogFragment(name, set) == <<Frag(name, "Dog", set)>>
HouseTrained(var) == FA("isHouseTrained", <<A("atOtherHomes", Var(var))>>)
HouseTrainedFragment == Frag("isHouseTrainedFragment", "Dog", <<HouseTrained("atOtherHomes")>>)
AtOtherHomes == <<VarDef("atOtherHomes", BooleanT)>>
OnArguments(name, vars, set) == <<Q(name, vars, <<FS("arguments", set)>>)>>
Sub(name, set) == Op("subscription", name, <<>>, set)
NewMessage == FS("newMessage", <<F("body"), F("sender")>>)
AddPet(name, vars, pet) == <<Op("mutation", name, vars, <<WithArgs(FS("addPet", <<F("name")>>), <<A("pet", pet)>>)>>)>>

DocumentVectors == <<
  V("ExecutableDefinitions", Examples,
    <<Q("getDogName", <<>>, <<FS("dog", <<F("name"), F("color")>>)>>), TypeExtension>>, FALSE),
  V("ExecutableDefinitions", Examples, Dog(<<F("name")>>), TRUE)
>>

OperationVectors == <<
  V("OperationTypeExistence", Hello, <<Q("helloQuery", <<>>, <<F("hello")>>)>>, TRUE),
  V("OperationTypeExistence", Hello, <<Op("mutation", "goodbyeMutation", <<>>, <<F("goodbye")>>)>>, FALSE),
  V("OperationNameUniqueness", Examples,
    <<Q("getDogName", <<>>, <<FS("dog", <<F("name")>>)>>),
      Q("getOwnerName", <<>>, <<FS("dog", <<FS("owner", <<F("name")>>)>>)>>)>>, TRUE),
  V("OperationNameUniqueness", Examples,
    <<Q("getName", <<>>, <<FS("dog", <<F("name")>>)>>),
      Q("getName", <<>>, <<FS("dog", <<FS("owner", <<F("name")>>)>>)>>)>>, FALSE),
  V("OperationNameUniqueness", Examples,
    <<Q("dogOperation", <<>>, <<FS("dog", <<F("name")>>)>>),
      Op("mutation", "dogOperation", <<>>, <<FS("mutateDog", <<F("id")>>)>>)>>, FALSE),
  V("LoneAnonymousOperation", Examples, Dog(<<F("name")>>), TRUE),
  V("LoneAnonymousOperation", Examples,
    Dog(<<F("name")>>) \o <<Q("getName", <<>>, <<FS("dog", <<FS("owner", <<F("name")>>)>>)>>)>>, FALSE),
  V("SingleRootField", Examples, <<Sub("sub", <<NewMessage>>)>>, TRUE),
  V("SingleRootField", Examples,
    <<Sub("sub", <<Spread("newMessageFields")>>), Frag("newMessageFields", "Subscription", <<NewMessage>>)>>, TRUE),
  V("SingleRootField", Examples, <<Sub("sub", <<NewMessage, F("disallowedSecondRootField")>>)>>, FALSE),
  V("SingleRootField", Examples,
    <<Sub("sub", <<Spread("multipleSubscriptions")>>),
      Frag("multipleSubscriptions", "Subscription", <<NewMessage, F("disallowedSecondRootField")>>)>>, FALSE),
  V("SingleRootField", Examples,
    <<Op("subscription", "requiredRuntimeValidation", <<VarDef("bool", NN(BooleanT))>>,
         <<WithDirs(NewMessage, <<Dir("include", <<A("if", Var("bool"))>>)>>),
           WithDirs(F("disallowedSecondRootField"), <<Dir("skip", <<A("if", Var("bool"))>>)>>)>>)>>, FALSE),
  V("SingleRootField", Examples, <<Sub("sub", <<F("__typename")>>)>>, FALSE),
  \* Not one of the spec's examples: @include alone still isn't allowed.
  Added("SingleRootField", Examples,
    <<Op("subscription", "sub", <<VarDef("bool", NN(BooleanT))>>,
         <<WithDirs(NewMessage, <<Dir("include", <<A("if", Var("bool"))>>)>>)>>)>>, FALSE)
>>

FieldVectors == <<
  V("FieldSelections", Examples,
    <<Frag("fieldNotDefined", "Dog", <<F("meowVolume")>>)>>, FALSE),
  V("FieldSelections", Examples,
    <<Frag("aliasedLyingFieldTargetNotDefined", "Dog", <<As("barkVolume", F("kawVolume"))>>)>>, FALSE),
  V("FieldSelections", Examples, <<Frag("interfaceFieldSelection", "Pet", <<F("name")>>)>>, TRUE),
  V("FieldSelections", Examples,
    <<Frag("definedOnImplementersButNotInterface", "Pet", <<F("nickname")>>)>>, FALSE),
  V("FieldSelections", Examples,
    <<Frag("inDirectFieldSelectionOnUnion", "CatOrDog",
           <<F("__typename"), On("Pet", <<F("name")>>), On("Dog", <<F("barkVolume")>>)>>)>>, TRUE),
  V("FieldSelections", Examples,
    <<Frag("directFieldSelectionOnUnion", "CatOrDog", <<F("name"), F("barkVolume")>>)>>, FALSE),
  V("FieldSelectionMerging", Examples, DogFragment("mergeIdenticalFields", <<F("name"), F("name")>>), TRUE),
  V("FieldSelectionMerging", Examples,
    DogFragment("mergeIdenticalAliasesAndFields", <<As("otherName", F("name")), As("otherName", F("name"))>>), TRUE),
  V("FieldSelectionMerging", Examples,
    DogFragment("conflictingBecauseAlias", <<As("name", F("nickname")), F("name")>>), FALSE),
  V("FieldSelectionMerging", Examples,
    DogFragment("mergeIdenticalFieldsWithIdenticalArgs",
                <<FA("doesKnowCommand", <<A("dogCommand", Enum("SIT"))>>),
                  FA("doesKnowCommand", <<A("dogCommand", Enum("SIT"))>>)>>), TRUE),
  V("FieldSelectionMerging", Examples,
    DogFragment("mergeIdenticalFieldsWithIdenticalValues",
                <<FA("doesKnowCommand", <<A("dogCommand", Var("dogCommand"))>>),
                  FA("doesKnowCommand", <<A("dogCommand", Var("dogCommand"))>>)>>), TRUE),
  V("FieldSelectionMerging", Examples,
    DogFragment("conflictingArgsOnValues",
                <<FA("doesKnowCommand", <<A("dogCommand", Enum("SIT"))>>),
                  FA("doesKnowCommand", <<A("dogCommand", Enum("HEEL"))>>)>>), FALSE),
  V("FieldSelectionMerging", Examples,
    DogFragment("conflictingArgsValueAndVar",
                <<FA("doesKnowCommand", <<A("dogCommand", Enum("SIT"))>>),
                  FA("doesKnowCommand", <<A("dogCommand", Var("dogCommand"))>>)>>), FALSE),
  V("FieldSelectionMerging", Examples,
    DogFragment("conflictingArgsWithVars",
                <<FA("doesKnowCommand", <<A("dogCommand", Var("varOne"))>>),
                  FA("doesKnowCommand", <<A("dogCommand", Var("varTwo"))>>)>>), FALSE),
  V("FieldSelectionMerging", Examples,
    DogFragment("differingArgs",
                <<FA("doesKnowCommand", <<A("dogCommand", Enum("SIT"))>>), F("doesKnowCommand")>>), FALSE),
  V("FieldSelectionMerging", Examples,
    <<Frag("safeDifferingFields", "Pet",
           <<On("Dog", <<As("volume", F("barkVolume"))>>), On("Cat", <<As("volume", F("meowVolume"))>>)>>)>>, TRUE),
  V("FieldSelectionMerging", Examples,
    <<Frag("safeDifferingArgs", "Pet",
           <<On("Dog", <<FA("doesKnowCommand", <<A("dogCommand", Enum("SIT"))>>)>>),
             On("Cat", <<FA("doesKnowCommand", <<A("catCommand", Enum("JUMP"))>>)>>)>>)>>, TRUE),
  V("FieldSelectionMerging", Examples,
    <<Frag("conflictingDifferingResponses", "Pet",
           <<On("Dog", <<As("someValue", F("nickname"))>>), On("Cat", <<As("someValue", F("meowVolume"))>>)>>)>>, FALSE),
  V("LeafFieldSelections", Examples, DogFragment("scalarSelection", <<F("barkVolume")>>), TRUE),
  V("LeafFieldSelections", Examples,
    DogFragment("scalarSelectionsNotAllowedOnInt", <<FS("barkVolume", <<F("sinceWhen")>>)>>), FALSE),
  V("LeafFieldSelections", Examples,
    DogFragment("scalarEmptySelectionsNotAllowedOnInt", <<FS("barkVolume", <<>>)>>), FALSE),
  V("LeafFieldSelections", Examples, <<Q("directQueryOnObjectWithoutSubFields", <<>>, <<F("human")>>)>>, FALSE),
  V("LeafFieldSelections", Examples, <<Q("directQueryOnInterfaceWithoutSubFields", <<>>, <<F("pet")>>)>>, FALSE),
  V("LeafFieldSelections", Examples, <<Q("directQueryOnUnionWithoutSubFields", <<>>, <<F("catOrDog")>>)>>, FALSE),
  V("LeafFieldSelections", Examples,
    <<Q("directQueryOnObjectWithSubFields", <<>>, <<FS("human", <<F("name")>>)>>)>>, TRUE),
  V("LeafFieldSelections", Examples,
    <<Q("directQueryOnObjectWithEmptySelection", <<>>, <<FS("human", <<>>)>>)>>, TRUE),
  \* Not the spec's examples: String! and String on exclusive types, and two
  \* fields whose merged selection sets conflict.
  Added("FieldSelectionMerging", Examples,
    <<Frag("conflictingNullability", "Pet",
           <<On("Dog", <<As("x", F("name"))>>), On("Cat", <<As("x", F("nickname"))>>)>>)>>, FALSE),
  Added("FieldSelectionMerging", Examples,
    <<Q("conflictingSubfields", <<>>, <<FS("dog", <<As("x", F("name"))>>), FS("dog", <<As("x", F("__typename"))>>)>>)>>, FALSE)
>>

ArgumentVectors == <<
  V("ArgumentNames", Examples,
    DogFragment("argOnRequiredArg", <<FA("doesKnowCommand", <<A("dogCommand", Enum("SIT"))>>)>>), TRUE),
  V("ArgumentNames", Examples,
    DogFragment("argOnOptional", <<WithDirs(FA("isHouseTrained", <<A("atOtherHomes", BoolV("true"))>>),
                                            <<Dir("include", <<A("if", BoolV("true"))>>)>>)>>), TRUE),
  V("ArgumentNames", Examples,
    DogFragment("invalidArgName", <<FA("doesKnowCommand", <<A("command", Enum("CLEAN_UP_HOUSE"))>>)>>), FALSE),
  V("ArgumentNames", Examples,
    DogFragment("invalidArgName", <<WithDirs(FA("isHouseTrained", <<A("atOtherHomes", BoolV("true"))>>),
                                             <<Dir("include", <<A("unless", BoolV("false"))>>)>>)>>), FALSE),
  V("ArgumentNames", Examples,
    <<Frag("multipleArgs", "Arguments", <<FA("multipleRequirements", <<A("x", IntV("1")), A("y", IntV("2"))>>)>>)>>, TRUE),
  V("ArgumentNames", Examples,
    <<Frag("multipleArgsReverseOrder", "Arguments",
           <<FA("multipleRequirements", <<A("y", IntV("2")), A("x", IntV("1"))>>)>>)>>, TRUE),
  V("ArgumentUniqueness", Examples,
    <<Frag("multipleArgs", "Arguments", <<FA("multipleRequirements", <<A("x", IntV("1")), A("y", IntV("2"))>>)>>)>>, TRUE),
  V("ArgumentUniqueness", Examples,
    <<Frag("duplicateArgs", "Arguments", <<FA("multipleRequirements", <<A("x", IntV("1")), A("x", IntV("2"))>>)>>)>>, FALSE),
  V("RequiredArguments", Examples,
    <<Frag("goodBooleanArg", "Arguments", <<FA("booleanArgField", <<A("booleanArg", BoolV("true"))>>)>>)>>, TRUE),
  V("RequiredArguments", Examples,
    <<Frag("goodNonNullArg", "Arguments", <<FA("nonNullBooleanArgField", <<A("nonNullBooleanArg", BoolV("true"))>>)>>)>>, TRUE),
  V("RequiredArguments", Examples, <<Frag("goodBooleanArgDefault", "Arguments", <<F("booleanArgField")>>)>>, TRUE),
  V("RequiredArguments", Examples, <<Frag("missingRequiredArg", "Arguments", <<F("nonNullBooleanArgField")>>)>>, FALSE),
  V("RequiredArguments", Examples,
    <<Frag("missingRequiredArg", "Arguments", <<FA("nonNullBooleanArgField", <<A("nonNullBooleanArg", Null)>>)>>)>>, FALSE),
  \* Not the spec's example: "An argument is required if the argument type is
  \* non-null and does not have a default value."
  Added("RequiredArguments", Examples,
    <<Frag("optionalNonNullArg", "Arguments", <<F("optionalNonNullBooleanArgField")>>)>>, TRUE)
>>

FragmentVectors == <<
  V("FragmentNameUniqueness", Examples,
    Dog(<<Spread("fragmentOne"), Spread("fragmentTwo")>>)
      \o <<Frag("fragmentOne", "Dog", <<F("name")>>), Frag("fragmentTwo", "Dog", <<FS("owner", <<F("name")>>)>>)>>, TRUE),
  V("FragmentNameUniqueness", Examples,
    Dog(<<Spread("fragmentOne")>>)
      \o <<Frag("fragmentOne", "Dog", <<F("name")>>), Frag("fragmentOne", "Dog", <<FS("owner", <<F("name")>>)>>)>>, FALSE),
  V("FragmentSpreadTypeExistence", Examples,
    <<Frag("correctType", "Dog", <<F("name")>>), Frag("inlineFragment", "Dog", <<On("Dog", <<F("name")>>)>>),
      Frag("inlineFragment2", "Dog", <<WithDirs(On("", <<F("name")>>), <<Dir("include", <<A("if", BoolV("true"))>>)>>)>>)>>,
    TRUE),
  V("FragmentSpreadTypeExistence", Examples, <<Frag("notOnExistingType", "NotInSchema", <<F("name")>>)>>, FALSE),
  V("FragmentSpreadTypeExistence", Examples,
    <<Frag("inlineNotExistingType", "Dog", <<On("NotInSchema", <<F("name")>>)>>)>>, FALSE),
  V("FragmentsOnObjectInterfaceOrUnionTypes", Examples,
    <<Frag("fragOnObject", "Dog", <<F("name")>>), Frag("fragOnInterface", "Pet", <<F("name")>>),
      Frag("fragOnUnion", "CatOrDog", <<On("Dog", <<F("name")>>)>>)>>, TRUE),
  V("FragmentsOnObjectInterfaceOrUnionTypes", Examples, <<Frag("fragOnScalar", "Int", <<F("something")>>)>>, FALSE),
  V("FragmentsOnObjectInterfaceOrUnionTypes", Examples,
    <<Frag("inlineFragOnScalar", "Dog", <<On("Boolean", <<F("somethingElse")>>)>>)>>, FALSE),
  V("FragmentsMustBeUsed", Examples, <<Frag("nameFragment", "Dog", <<F("name")>>)>> \o Dog(<<F("name")>>), FALSE),
  V("FragmentsMustBeUsed", Examples, Dog(<<Spread("nameFragment")>>) \o <<Frag("nameFragment", "Dog", <<F("name")>>)>>, TRUE),
  \* Not the spec's example. Each is "the target of at least one spread",
  \* though no operation reaches them; graphql-js reports both.
  Added("FragmentsMustBeUsed", Examples,
    Dog(<<F("name")>>) \o <<Frag("a", "Dog", <<Spread("b")>>), Frag("b", "Dog", <<Spread("a")>>)>>, TRUE),
  V("FragmentSpreadTargetDefined", Examples, Dog(<<Spread("undefinedFragment")>>), FALSE),
  V("FragmentSpreadTargetDefined", Examples, Dog(<<Spread("nameFragment")>>) \o <<Frag("nameFragment", "Dog", <<F("name")>>)>>, TRUE),
  V("FragmentSpreadsMustNotFormCycles", Examples,
    Dog(<<Spread("nameFragment")>>)
      \o <<Frag("nameFragment", "Dog", <<F("name"), Spread("barkVolumeFragment")>>),
           Frag("barkVolumeFragment", "Dog", <<F("barkVolume"), Spread("nameFragment")>>)>>, FALSE),
  V("FragmentSpreadsMustNotFormCycles", Examples,
    Dog(<<Spread("dogFragment")>>)
      \o <<Frag("dogFragment", "Dog", <<F("name"), FS("owner", <<Spread("ownerFragment")>>)>>),
           Frag("ownerFragment", "Human", <<F("name"), FS("pets", <<Spread("dogFragment")>>)>>)>>, FALSE),
  V("FragmentSpreadsMustNotFormCycles", Examples,
    Dog(<<Spread("nameFragment"), Spread("barkVolumeFragment")>>)
      \o <<Frag("nameFragment", "Dog", <<F("name"), Spread("barkVolumeFragment")>>),
           Frag("barkVolumeFragment", "Dog", <<F("barkVolume")>>)>>, TRUE),
  V("FragmentSpreadIsPossible", Examples, <<Frag("dogFragment", "Dog", <<On("Dog", <<F("barkVolume")>>)>>)>>, TRUE),
  V("FragmentSpreadIsPossible", Examples,
    <<Frag("catInDogFragmentInvalid", "Dog", <<On("Cat", <<F("meowVolume")>>)>>)>>, FALSE),
  V("FragmentSpreadIsPossible", Examples,
    <<Frag("petNameFragment", "Pet", <<F("name")>>),
      Frag("interfaceWithinObjectFragment", "Dog", <<Spread("petNameFragment")>>)>>, TRUE),
  V("FragmentSpreadIsPossible", Examples,
    <<Frag("catOrDogNameFragment", "CatOrDog", <<On("Cat", <<F("meowVolume")>>)>>),
      Frag("unionWithObjectFragment", "Dog", <<Spread("catOrDogNameFragment")>>)>>, TRUE),
  V("FragmentSpreadIsPossible", Examples,
    <<Frag("petFragment", "Pet", <<F("name"), On("Dog", <<F("barkVolume")>>)>>),
      Frag("catOrDogFragment", "CatOrDog", <<On("Cat", <<F("meowVolume")>>)>>)>>, TRUE),
  V("FragmentSpreadIsPossible", Examples,
    <<Frag("sentientFragment", "Sentient", <<On("Dog", <<F("barkVolume")>>)>>)>>, FALSE),
  V("FragmentSpreadIsPossible", Examples,
    <<Frag("humanOrAlienFragment", "HumanOrAlien", <<On("Cat", <<F("meowVolume")>>)>>)>>, FALSE),
  V("FragmentSpreadIsPossible", Examples,
    <<Frag("unionWithInterface", "Pet", <<Spread("dogOrHumanFragment")>>),
      Frag("dogOrHumanFragment", "DogOrHuman", <<On("Dog", <<F("barkVolume")>>)>>)>>, TRUE),
  V("FragmentSpreadIsPossible", Examples,
    <<Frag("nonIntersectingInterfaces", "Pet", <<Spread("sentientFragment")>>),
      Frag("sentientFragment", "Sentient", <<F("name")>>)>>, FALSE),
  \* The spec calls this valid ("an interface type fragment can always be
  \* spread into an interface scope which it implements"), but no object
  \* type implements Resource, so its formal GetPossibleTypes intersection
  \* is empty. The reference follows the formal text, as graphql-js does.
  V("FragmentSpreadIsPossible", Examples,
    <<Frag("interfaceWithInterface", "Node", <<Spread("resourceFragment")>>),
      Frag("resourceFragment", "Resource", <<F("url")>>)>>, FALSE)
>>

ValueVectors == <<
  V("ValuesOfCorrectType", Examples,
    <<Frag("goodBooleanArg", "Arguments", <<FA("booleanArgField", <<A("booleanArg", BoolV("true"))>>)>>),
      Frag("coercedIntIntoFloatArg", "Arguments", <<FA("floatArgField", <<A("floatArg", IntV("123"))>>)>>)>>, TRUE),
  V("ValuesOfCorrectType", Examples,
    <<Q("goodComplexDefaultValue", <<VarDefault("search", T("FindDogInput"), ObjectOf(<<A("name", StrV("Fido"))>>))>>,
        <<WithArgs(FS("findDog", <<F("name")>>), <<A("searchBy", Var("search"))>>)>>)>>, TRUE),
  V("ValuesOfCorrectType", Examples,
    AddPet("addPet", <<VarDefault("pet", NN(T("PetInput")), ObjectOf(<<A("cat", ObjectOf(<<A("name", StrV("Brontie"))>>))>>))>>,
           Var("pet")), TRUE),
  V("ValuesOfCorrectType", Examples,
    <<Frag("stringIntoInt", "Arguments", <<FA("intArgField", <<A("intArg", StrV("123"))>>)>>)>>, FALSE),
  V("ValuesOfCorrectType", Examples,
    <<Q("badComplexValue", <<>>,
        <<WithArgs(FS("findDog", <<F("name")>>), <<A("searchBy", ObjectOf(<<A("name", IntV("123"))>>))>>)>>)>>, FALSE),
  V("ValuesOfCorrectType", Examples, AddPet("oneOfWithNoFields", <<>>, ObjectOf(<<>>)), FALSE),
  V("ValuesOfCorrectType", Examples,
    AddPet("oneOfWithTwoFields", <<VarDef("dog", T("DogInput"))>>,
           ObjectOf(<<A("cat", ObjectOf(<<A("name", StrV("Brontie"))>>)), A("dog", Var("dog"))>>)), FALSE),
  V("InputObjectFieldNames", Examples,
    <<Q("", <<>>, <<WithArgs(FS("findDog", <<F("name")>>), <<A("searchBy", ObjectOf(<<A("name", StrV("Fido"))>>))>>)>>)>>, TRUE),
  V("InputObjectFieldNames", Examples,
    <<Q("", <<>>, <<WithArgs(FS("findDog", <<F("name")>>),
                             <<A("searchBy", ObjectOf(<<A("favoriteCookieFlavor", StrV("Bacon"))>>))>>)>>)>>, FALSE),
  \* Not the spec's examples: its counter-example, `field(arg: { field: true,
  \* field: false })`, is on a field the example schema doesn't have. The same
  \* on findDog, and a valid sibling.
  Added("InputObjectFieldUniqueness", Examples,
    <<Q("", <<>>, <<WithArgs(FS("findDog", <<F("name")>>),
                             <<A("searchBy", ObjectOf(<<A("name", StrV("a")), A("name", StrV("b"))>>))>>)>>)>>, FALSE),
  Added("InputObjectFieldUniqueness", Examples,
    <<Q("", <<>>, <<WithArgs(FS("findDog", <<F("name")>>),
                             <<A("searchBy", ObjectOf(<<A("name", StrV("a")), A("owner", StrV("b"))>>))>>)>>)>>, TRUE),
  \* Not the spec's examples (§5.6.4 has none): addPet with literal input
  \* objects, named after §5.8.5's addCat.
  Added("InputObjectRequiredFields", Examples,
    AddPet("addCat", <<>>, ObjectOf(<<A("cat", ObjectOf(<<A("name", StrV("Brontie"))>>))>>)), TRUE),
  Added("InputObjectRequiredFields", Examples,
    AddPet("addCat", <<>>, ObjectOf(<<A("cat", ObjectOf(<<A("nickname", StrV("B"))>>))>>)), FALSE),
  Added("InputObjectRequiredFields", Examples,
    AddPet("addCat", <<>>, ObjectOf(<<A("cat", ObjectOf(<<A("name", Null)>>))>>)), FALSE)
>>

DirectiveVectors == <<
  V("DirectivesAreInValidLocations", Examples,
    <<[Q("", <<>>, <<F("field")>>) EXCEPT !.directives = <<Dir("skip", <<A("if", Var("foo"))>>)>>]>>, FALSE),
  V("DirectivesAreInValidLocations", Examples,
    <<Q("", <<>>, <<WithDirs(F("field"), <<Dir("skip", <<A("if", Var("foo"))>>)>>)>>)>>, TRUE),
  V("DirectivesAreUniquePerLocation", Examples,
    <<Q("", <<VarDefault("foo", BooleanT, BoolV("true")), VarDefault("bar", BooleanT, BoolV("false"))>>,
        <<WithDirs(F("field"), <<Dir("skip", <<A("if", Var("foo"))>>), Dir("skip", <<A("if", Var("bar"))>>)>>)>>)>>, FALSE),
  V("DirectivesAreUniquePerLocation", Examples,
    <<Q("", <<VarDefault("foo", BooleanT, BoolV("true")), VarDefault("bar", BooleanT, BoolV("false"))>>,
        <<WithDirs(FS("field", <<F("subfieldA")>>), <<Dir("skip", <<A("if", Var("foo"))>>)>>),
          WithDirs(FS("field", <<F("subfieldB")>>), <<Dir("skip", <<A("if", Var("bar"))>>)>>)>>)>>, TRUE),
  \* Not the spec's examples: §5.7.1 has none.
  Added("DirectivesAreDefined", Examples, Dog(<<WithDirs(F("name"), <<Dir("unknown", <<>>)>>)>>), FALSE),
  Added("DirectivesAreDefined", Examples, Dog(<<WithDirs(F("name"), <<Dir("include", <<A("if", BoolV("true"))>>)>>)>>), TRUE)
>>

VariableVectors == <<
  V("VariableUniqueness", Examples,
    <<Q("houseTrainedQuery", <<VarDef("atOtherHomes", BooleanT), VarDef("atOtherHomes", BooleanT)>>,
        <<FS("dog", <<HouseTrained("atOtherHomes")>>)>>)>>, FALSE),
  V("VariableUniqueness", Examples,
    <<Q("A", AtOtherHomes, <<Spread("HouseTrainedFragment")>>), Q("B", AtOtherHomes, <<Spread("HouseTrainedFragment")>>),
      Frag("HouseTrainedFragment", "Query", <<FS("dog", <<HouseTrained("atOtherHomes")>>)>>)>>, TRUE),
  V("VariablesAreInputTypes", Examples,
    <<Q("takesBoolean", AtOtherHomes, <<FS("dog", <<HouseTrained("atOtherHomes")>>)>>),
      Q("takesComplexInput", <<VarDef("search", T("FindDogInput"))>>,
        <<WithArgs(FS("findDog", <<F("name")>>), <<A("searchBy", Var("search"))>>)>>),
      Q("TakesListOfBooleanBang", <<VarDef("booleans", L(NN(BooleanT)))>>,
        <<FA("booleanList", <<A("booleanListArg", Var("booleans"))>>)>>)>>, TRUE),
  V("VariablesAreInputTypes", Examples, <<Q("takesCat", <<VarDef("cat", T("Cat"))>>, <<>>)>>, FALSE),
  V("VariablesAreInputTypes", Examples, <<Q("takesDogBang", <<VarDef("dog", NN(T("Dog")))>>, <<>>)>>, FALSE),
  V("VariablesAreInputTypes", Examples, <<Q("takesListOfPet", <<VarDef("pets", L(T("Pet")))>>, <<>>)>>, FALSE),
  V("VariablesAreInputTypes", Examples, <<Q("takesCatOrDog", <<VarDef("catOrDog", T("CatOrDog"))>>, <<>>)>>, FALSE),
  V("AllVariableUsesDefined", Examples,
    <<Q("variableIsDefined", AtOtherHomes, <<FS("dog", <<HouseTrained("atOtherHomes")>>)>>)>>, TRUE),
  V("AllVariableUsesDefined", Examples,
    <<Q("variableIsNotDefined", <<>>, <<FS("dog", <<HouseTrained("atOtherHomes")>>)>>)>>, FALSE),
  V("AllVariableUsesDefined", Examples,
    <<Q("variableIsDefinedUsedInSingleFragment", AtOtherHomes, <<FS("dog", <<Spread("isHouseTrainedFragment")>>)>>),
      HouseTrainedFragment>>, TRUE),
  V("AllVariableUsesDefined", Examples,
    <<Q("variableIsNotDefinedUsedInSingleFragment", <<>>, <<FS("dog", <<Spread("isHouseTrainedFragment")>>)>>),
      HouseTrainedFragment>>, FALSE),
  V("AllVariableUsesDefined", Examples,
    <<Q("variableIsNotDefinedUsedInNestedFragment", <<>>, <<FS("dog", <<Spread("outerHouseTrainedFragment")>>)>>),
      Frag("outerHouseTrainedFragment", "Dog", <<Spread("isHouseTrainedFragment")>>), HouseTrainedFragment>>, FALSE),
  V("AllVariableUsesDefined", Examples,
    <<Q("houseTrainedQueryOne", AtOtherHomes, <<FS("dog", <<Spread("isHouseTrainedFragment")>>)>>),
      Q("houseTrainedQueryTwo", AtOtherHomes, <<FS("dog", <<Spread("isHouseTrainedFragment")>>)>>),
      HouseTrainedFragment>>, TRUE),
  V("AllVariableUsesDefined", Examples,
    <<Q("houseTrainedQueryOne", AtOtherHomes, <<FS("dog", <<Spread("isHouseTrainedFragment")>>)>>),
      Q("houseTrainedQueryTwoNotDefined", <<>>, <<FS("dog", <<Spread("isHouseTrainedFragment")>>)>>),
      HouseTrainedFragment>>, FALSE),
  V("AllVariablesUsed", Examples,
    <<Q("variableUnused", AtOtherHomes, <<FS("dog", <<F("isHouseTrained")>>)>>)>>, FALSE),
  V("AllVariablesUsed", Examples,
    <<Q("variableUsedInFragment", AtOtherHomes, <<FS("dog", <<Spread("isHouseTrainedFragment")>>)>>),
      HouseTrainedFragment>>, TRUE),
  V("AllVariablesUsed", Examples,
    <<Q("variableNotUsedWithinFragment", AtOtherHomes,
        <<FS("dog", <<Spread("isHouseTrainedWithoutVariableFragment")>>)>>),
      Frag("isHouseTrainedWithoutVariableFragment", "Dog", <<F("isHouseTrained")>>)>>, FALSE),
  V("AllVariablesUsed", Examples,
    <<Q("queryWithUsedVar", AtOtherHomes, <<FS("dog", <<Spread("isHouseTrainedFragment")>>)>>),
      Q("queryWithExtraVar", AtOtherHomes \o <<VarDef("extra", T("Int"))>>,
        <<FS("dog", <<Spread("isHouseTrainedFragment")>>)>>),
      HouseTrainedFragment>>, FALSE),
  V("AllVariableUsagesAreAllowed", Examples,
    OnArguments("intCannotGoIntoBoolean", <<VarDef("intArg", T("Int"))>>,
                <<FA("booleanArgField", <<A("booleanArg", Var("intArg"))>>)>>), FALSE),
  V("AllVariableUsagesAreAllowed", Examples,
    OnArguments("booleanListCannotGoIntoBoolean", <<VarDef("booleanListArg", L(BooleanT))>>,
                <<FA("booleanArgField", <<A("booleanArg", Var("booleanListArg"))>>)>>), FALSE),
  V("AllVariableUsagesAreAllowed", Examples,
    OnArguments("booleanArgQuery", <<VarDef("booleanArg", BooleanT)>>,
                <<FA("nonNullBooleanArgField", <<A("nonNullBooleanArg", Var("booleanArg"))>>)>>), FALSE),
  V("AllVariableUsagesAreAllowed", Examples,
    OnArguments("nonNullListToList", <<VarDef("nonNullBooleanList", NN(L(BooleanT)))>>,
                <<FA("booleanListArgField", <<A("booleanListArg", Var("nonNullBooleanList"))>>)>>), TRUE),
  V("AllVariableUsagesAreAllowed", Examples,
    OnArguments("listToNonNullList", <<VarDef("booleanList", L(BooleanT))>>,
                <<FA("booleanListArgField", <<A("booleanListArg", Var("booleanList"))>>)>>), FALSE),
  V("AllVariableUsagesAreAllowed", Examples,
    AddPet("addCat", <<VarDef("cat", NN(T("CatInput")))>>, ObjectOf(<<A("cat", Var("cat"))>>)), TRUE),
  V("AllVariableUsagesAreAllowed", Examples,
    AddPet("addCatWithDefault", <<VarDefault("cat", NN(T("CatInput")), ObjectOf(<<A("name", StrV("Brontie"))>>))>>,
           ObjectOf(<<A("cat", Var("cat"))>>)), TRUE),
  V("AllVariableUsagesAreAllowed", Examples,
    AddPet("addNullableCat", <<VarDef("cat", T("CatInput"))>>, ObjectOf(<<A("cat", Var("cat"))>>)), FALSE),
  V("AllVariableUsagesAreAllowed", Examples,
    <<Op("mutation", "listOfOneOfWithNullableVariable", <<VarDef("dog", T("DogInput"))>>,
         <<WithArgs(FS("addPets", <<F("name")>>), <<A("pets", ListOf(<<ObjectOf(<<A("dog", Var("dog"))>>)>>))>>)>>)>>, FALSE),
  V("AllVariableUsagesAreAllowed", Examples,
    OnArguments("booleanArgQueryWithDefault", <<VarDef("booleanArg", BooleanT)>>,
                <<FA("optionalNonNullBooleanArgField", <<A("optionalBooleanArg", Var("booleanArg"))>>)>>), TRUE),
  V("AllVariableUsagesAreAllowed", Examples,
    OnArguments("booleanArgQueryWithDefault", <<VarDefault("booleanArg", BooleanT, BoolV("true"))>>,
                <<FA("nonNullBooleanArgField", <<A("nonNullBooleanArg", Var("booleanArg"))>>)>>), TRUE)
>>

Vectors ==
  ("documents" :> DocumentVectors) @@ ("operations" :> OperationVectors) @@ ("fields" :> FieldVectors)
    @@ ("arguments" :> ArgumentVectors) @@ ("fragments" :> FragmentVectors) @@ ("values" :> ValueVectors)
    @@ ("directives" :> DirectiveVectors) @@ ("variables" :> VariableVectors)

\* October 2021's Single root field (SingleRootFieldOctober2021): its own
\* examples, and @skip and @include at the root, which September 2025 and
\* September 2026 forbid and October 2021 applies with no variable values.
\* Kept out of Vectors, which holds September 2026's examples.
SkipIf(value) == <<Dir("skip", <<A("if", value)>>)>>
IncludeIf(value) == <<Dir("include", <<A("if", value)>>)>>
BoolVar == <<VarDef("bool", NN(BooleanT))>>
October2021Vectors == <<
  V("SingleRootFieldOctober2021", Examples, <<Sub("sub", <<NewMessage>>)>>, TRUE),
  V("SingleRootFieldOctober2021", Examples,
    <<Sub("sub", <<Spread("newMessageFields")>>), Frag("newMessageFields", "Subscription", <<NewMessage>>)>>, TRUE),
  V("SingleRootFieldOctober2021", Examples, <<Sub("sub", <<NewMessage, F("disallowedSecondRootField")>>)>>, FALSE),
  V("SingleRootFieldOctober2021", Examples,
    <<Sub("sub", <<Spread("multipleSubscriptions")>>),
      Frag("multipleSubscriptions", "Subscription", <<NewMessage, F("disallowedSecondRootField")>>)>>, FALSE),
  V("SingleRootFieldOctober2021", Examples, <<Sub("sub", <<F("__typename")>>)>>, FALSE),
  \* September 2026's requiredRuntimeValidation: only the second field is collected.
  V("SingleRootFieldOctober2021", Examples,
    <<Op("subscription", "requiredRuntimeValidation", BoolVar,
         <<WithDirs(NewMessage, IncludeIf(Var("bool"))),
           WithDirs(F("disallowedSecondRootField"), SkipIf(Var("bool")))>>)>>, TRUE),
  V("SingleRootFieldOctober2021", Examples, <<Sub("sub", <<WithDirs(NewMessage, SkipIf(BoolV("true")))>>)>>, FALSE),
  V("SingleRootFieldOctober2021", Examples, <<Sub("sub", <<WithDirs(NewMessage, SkipIf(BoolV("false")))>>)>>, TRUE),
  V("SingleRootFieldOctober2021", Examples, <<Sub("sub", <<WithDirs(NewMessage, IncludeIf(BoolV("true")))>>)>>, TRUE),
  V("SingleRootFieldOctober2021", Examples, <<Sub("sub", <<WithDirs(NewMessage, IncludeIf(BoolV("false")))>>)>>, FALSE),
  V("SingleRootFieldOctober2021", Examples,
    <<Op("subscription", "sub", BoolVar, <<WithDirs(NewMessage, IncludeIf(Var("bool")))>>)>>, FALSE),
  V("SingleRootFieldOctober2021", Examples,
    <<Op("subscription", "sub", BoolVar, <<WithDirs(NewMessage, SkipIf(Var("bool")))>>)>>, TRUE),
  \* A skipped spread isn't visited, so the same fragment spread again counts.
  V("SingleRootFieldOctober2021", Examples,
    <<Sub("sub", <<WithDirs(Spread("newMessageFields"), SkipIf(BoolV("true"))), Spread("newMessageFields")>>),
      Frag("newMessageFields", "Subscription", <<NewMessage>>)>>, TRUE),
  V("SingleRootFieldOctober2021", Examples,
    <<Sub("sub", <<NewMessage, WithDirs(On("", <<F("disallowedSecondRootField")>>), IncludeIf(BoolV("false")))>>)>>, TRUE)
>>

\* Each initial state is one vector, so a violation's trace names it.
VARIABLE vector
Init ==
  vector \in UNION {{[group |-> g, n |-> n] : n \in DOMAIN Vectors[g]} : g \in DOMAIN Vectors}
               \cup {[group |-> "october2021", n |-> n] : n \in DOMAIN October2021Vectors}
Next == UNCHANGED vector

VectorHolds(group) ==
  vector.group = group =>
    LET v == Vectors[group][vector.n] IN (Check(v.rule, v.schema, v.doc) = {}) = v.valid

DocumentExamplesHold == VectorHolds("documents")
OperationExamplesHold == VectorHolds("operations")
FieldExamplesHold == VectorHolds("fields")
ArgumentExamplesHold == VectorHolds("arguments")
FragmentExamplesHold == VectorHolds("fragments")
ValueExamplesHold == VectorHolds("values")
DirectiveExamplesHold == VectorHolds("directives")
VariableExamplesHold == VectorHolds("variables")
October2021ExamplesHold ==
  vector.group = "october2021" =>
    LET v == October2021Vectors[vector.n] IN (SingleRootFieldOctober2021(WithIntrospection(v.schema), v.doc) = {}) = v.valid
====
