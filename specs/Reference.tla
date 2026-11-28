---- MODULE Reference ----
(***************************************************************************)
(* GraphQL query execution, written by hand from the spec's algorithms     *)
(* (https://spec.graphql.org/September2026/, §6.3 and §6.4).                *)
(*                                                                         *)
(* Field collection also follows the fragment arguments proposal,          *)
(* graphql-spec#1081 at dfd847524d25: a fragment may define variables and  *)
(* a fragment spread may give them values. No release has that syntax, and *)
(* for a query without it CollectFields here is September 2026's: with no  *)
(* fragment variables, every variable is the operation's.                  *)
(*                                                                         *)
(* Everything here is a pure operator over plain data:                     *)
(*                                                                         *)
(*   fx  a fixture: a schema, one query, its fragments and variables, as   *)
(*       written by scripts/generate-fixtures.mjs into Fixtures.tla        *)
(*   O   an oracle: a function from response paths to what the resolver   *)
(*       at that path produced. Its domain is the paths resolved so far.   *)
(*                                                                         *)
(* The operational executor in execution.ts and the real graphql-js are    *)
(* both checked against Valid below. It shares no code with either.        *)
(*                                                                         *)
(* Data shapes (every value of a kind has the same fields, since TLC can't *)
(* compare records of different shapes):                                   *)
(*   type ref    [name, wrappers]          [Post!]! = <<"nonNull","list",  *)
(*                                         "nonNull">> around "Post"       *)
(*   selection   [kind, name, alias, typeCondition, skip, include,         *)
(*                arguments, selectionSet]; arguments are a fragment       *)
(*                spread's, each [name, kind, value, variable]             *)
(*   fragment    [typeCondition, variableDefinitions, selectionSet];       *)
(*                a variable definition is [name, nonNull, hasDefault,     *)
(*                default]                                                 *)
(*   field detail  [field, fragmentVariables]: a field selection and the   *)
(*                variables in scope where it was selected                 *)
(*   outcome     [kind, type, length]   kind \in {"object", "leaf",        *)
(*                                      "list", "null", "error"}           *)
(*   json        [kind, value, entries, items]  kind \in {"null", "leaf",  *)
(*                                      "object", "list"}; entries is a    *)
(*                                      sequence of [key, value]; a leaf's *)
(*                                      value is "" except for __typename  *)
(*   path        a sequence of strings; list indices are "0", "1", ...     *)
(***************************************************************************)
EXTENDS Integers, Sequences, FiniteSets, TLC

-----------------------------------------------------------------------------
(* Types (§3.4.1 Wrapping Types) *)

IsNonNull(type) == type.wrappers # <<>> /\ Head(type.wrappers) = "nonNull"
IsList(type) == type.wrappers # <<>> /\ Head(type.wrappers) = "list"
OfType(type) == [type EXCEPT !.wrappers = Tail(@)]
Nullable(type) == IF IsNonNull(type) THEN OfType(type) ELSE type

TypeDef(fx, name) == fx.schema.types[name]
FieldType(fx, objectType, fieldName) == TypeDef(fx, objectType).fields[fieldName]

\* §6.2: the root type for the operation's type.
RootType(fx) ==
  CASE fx.operationType = "query" -> fx.schema.query
    [] fx.operationType = "mutation" -> fx.schema.mutation
    [] OTHER -> fx.schema.subscription

\* Whether execution errors propagate (§6.4.4). graphql-js 17's
\* @experimental_disableErrorPropagation turns this off: an error nulls the
\* position where it happened, Non-Null or not. That mode is outside the
\* spec: no release has execution without propagation. The kit grades
\* it under an informational check, never against §6.4.4.
Propagates(fx, type) == fx.errorPropagation /\ IsNonNull(type)

-----------------------------------------------------------------------------
(* §6.3.2 Field Collection *)

\* Variable values. A fixture's operation variables are Booleans, and its
\* fragment variables are Boolean or Boolean!, so a value is "true", "false"
\* or "null", and a map of values is a function on the names that have one.
OperationVariableValues(fx) ==
  [name \in DOMAIN fx.variables |-> IF fx.variables[name] THEN "true" ELSE "false"]

\* The proposal: "The fragment variable values of a fragment spread
\* represent the variables in scope within the referenced fragment as a
\* result of that fragment spread", with its variableDefinitions (here the
\* names they define) and "an unordered map of the coerced values for those
\* variables, as provided by the arguments of the fragment spread or by
\* default values". NoFragmentVariables is its "fragmentVariables is not
\* provided", for "a selection set which is not within a fragment
\* definition".
FragmentVariables(defined, values) == [defined |-> defined, values |-> values]
NoFragmentVariables == FragmentVariables({}, <<>>)

\* GetScopedVariableValues(variableName, variableValues, fragmentVariables):
\* "If variableDefinitions defines a variable named variableName, return
\* values. Return variableValues." So "A fragment variable shadows an
\* operation variable of the same name even when no value was provided for
\* it".
GetScopedVariableValues(variableName, variableValues, fragmentVariables) ==
  IF variableName \in fragmentVariables.defined THEN fragmentVariables.values ELSE variableValues

ScopedValues(fx, variableName, fragmentVariables) ==
  GetScopedVariableValues(variableName, OperationVariableValues(fx), fragmentVariables)

\* Whether the `if` argument of @skip or @include is true: "If skipIf is a
\* Variable: ... If scopedVariableValues provides the value true for the
\* name variableName" and "Otherwise if skipIf is true". A variable with no
\* value, or with null, doesn't provide true.
IfIsTrue(fx, condition, fragmentVariables) ==
  IF condition.kind = "literal" THEN condition.value
  ELSE LET scoped == ScopedValues(fx, condition.variable, fragmentVariables)
       IN condition.variable \in DOMAIN scoped /\ scoped[condition.variable] = "true"

\* CollectFields skips a selection whose @skip `if` is true, and one whose
\* @include `if` isn't: "If scopedVariableValues does not provide the value
\* true for the name variableName, continue with the next selection" and
\* "Otherwise if includeIf is not true".
IsIncluded(fx, selection, fragmentVariables) ==
  /\ ~(selection.skip.kind # "absent" /\ IfIsTrue(fx, selection.skip, fragmentVariables))
  /\ ~(selection.include.kind # "absent" /\ ~IfIsTrue(fx, selection.include, fragmentVariables))

\* §6.4.1 CoerceArgumentValues(argumentDefinitions, argumentValues,
\* variableValues, fragmentVariables) for the arguments of a fragment spread:
\* "each variable definition is used as the argument definition of the same
\* name, providing its expected type and default value." The result is
\* [ok, values]; ok is FALSE where the algorithm says "raise an execution
\* error". The variables in the arguments are those of the scope the spread
\* is in, not of the fragment it refers to. A Boolean literal or an already
\* coerced variable value needs no coercion of its own.
NoArgument == [name |-> "", kind |-> "literal", value |-> "", variable |-> ""]
ArgumentNamed(arguments, name) ==
  IF \E i \in DOMAIN arguments : arguments[i].name = name
  THEN arguments[CHOOSE i \in DOMAIN arguments : arguments[i].name = name]
  ELSE NoArgument

RECURSIVE CoerceSpreadArgumentsFrom(_, _, _, _, _, _)
CoerceSpreadArgumentsFrom(fx, definitions, arguments, fragmentVariables, i, values) ==
  IF i > Len(definitions) THEN [ok |-> TRUE, values |-> values]
  ELSE
    LET definition == definitions[i]
        argumentName == definition.name
        argumentValue == ArgumentNamed(arguments, argumentName)
        provided == argumentValue # NoArgument
        isVariable == provided /\ argumentValue.kind = "variable"
        scoped == ScopedValues(fx, argumentValue.variable, fragmentVariables)
        \* "If argumentValue is a Variable: ... If scopedVariableValues
        \* provides a value for the name variableName: Let hasValue be
        \* true. ... Otherwise if argumentValues provides a value for the
        \* name argumentName. Let hasValue be true."
        hasValue == IF isVariable THEN argumentValue.variable \in DOMAIN scoped ELSE provided
        value == IF ~hasValue THEN "null"
                 ELSE IF isVariable THEN scoped[argumentValue.variable]
                 ELSE argumentValue.value
        continue(next) == CoerceSpreadArgumentsFrom(fx, definitions, arguments, fragmentVariables, i + 1, next)
    IN IF ~hasValue /\ definition.hasDefault
       \* "If hasValue is not true and defaultValue exists (including
       \* null)": the default is the value.
       THEN continue((argumentName :> definition.default) @@ values)
       \* "Otherwise if argumentType is a Non-Nullable type, and either
       \* hasValue is not true or value is null, raise an execution error."
       ELSE IF definition.nonNull /\ (~hasValue \/ value = "null") THEN [ok |-> FALSE, values |-> values]
       \* "Otherwise if hasValue is true": null stays null, and a variable's
       \* value is added as it is.
       ELSE IF hasValue THEN continue((argumentName :> value) @@ values)
       \* No entry: the fragment variable has no value.
       ELSE continue(values)

CoerceSpreadArguments(fx, fragment, spread, fragmentVariables) ==
  CoerceSpreadArgumentsFrom(fx, fragment.variableDefinitions, spread.arguments, fragmentVariables, 1, <<>>)

\* DoesFragmentTypeApply(objectType, fragmentType)
DoesFragmentTypeApply(fx, objectType, fragmentType) ==
  LET fragment == TypeDef(fx, fragmentType) IN
  IF fragment.kind = "object"
  THEN objectType = fragmentType
  ELSE objectType \in fragment.possibleTypes

ResponseKey(field) == IF field.alias = "" THEN field.name ELSE field.alias

\* The proposal's field detail: "used to correlate a field in a selection
\* set with the variables in scope where that field was selected."
FieldDetail(field, fragmentVariables) == [field |-> field, fragmentVariables |-> fragmentVariables]

\* The collected fields map is a sequence of [key, fields], ordered by when
\* each response key first appears; fields is the field set, a sequence of
\* field details ("Add fieldDetails to the fieldsForResponseName").
AppendField(grouped, key, field) ==
  IF \E i \in DOMAIN grouped : grouped[i].key = key
  THEN [i \in DOMAIN grouped |->
          IF grouped[i].key = key
          THEN [grouped[i] EXCEPT !.fields = Append(@, field)]
          ELSE grouped[i]]
  ELSE Append(grouped, [key |-> key, fields |-> <<field>>])

\* CollectFields(objectType, selectionSet, variableValues,
\* fragmentVariables, visitedFragments) over selections[i..], threading
\* [grouped, visited, failed] through the walk as the spec's algorithm
\* threads the collected fields and visitedFragments: "If
\* fragmentSpreadName is in visitedFragments, continue with the next
\* selection". failed says that coercing a spread's arguments raised an
\* execution error, which ends the collection.
\*
\* A fragment spread is collected in this order: @skip and @include, in the
\* scope the spread is in; visitedFragments; the fragment's type condition;
\* and only then CoerceArgumentValues. So a spread that is skipped, already
\* visited, or of a type that doesn't apply raises nothing, and one that is
\* collected raises whether or not its fragment then uses the variable.
\* The fragment's selections are collected with the new fragment variable
\* values; an inline fragment's with the ones it is in.
RECURSIVE CollectFrom(_, _, _, _, _, _)
CollectFrom(fx, objectType, selections, fragmentVariables, i, acc) ==
  IF i > Len(selections) \/ acc.failed THEN acc
  ELSE
    LET selection == selections[i]
        next ==
          IF ~IsIncluded(fx, selection, fragmentVariables) THEN acc
          ELSE CASE selection.kind = "field" ->
                      [acc EXCEPT !.grouped =
                         AppendField(@, ResponseKey(selection), FieldDetail(selection, fragmentVariables))]
                 [] selection.kind = "fragmentSpread" ->
                      IF selection.name \in acc.visited THEN acc
                      ELSE
                        LET visited == [acc EXCEPT !.visited = @ \cup {selection.name}]
                        IN \* "If no such fragment exists, continue with the next
                           \* selection in selectionSet." Only a document that
                           \* breaks §5.5.2.1 (Fragment Spread Target Defined)
                           \* gets here, and every fixture is valid.
                           IF selection.name \notin DOMAIN fx.fragments THEN visited
                           ELSE
                             LET fragment == fx.fragments[selection.name] IN
                             IF ~DoesFragmentTypeApply(fx, objectType, fragment.typeCondition)
                             THEN visited
                             ELSE
                               LET coerced == CoerceSpreadArguments(fx, fragment, selection, fragmentVariables)
                                   defined == {fragment.variableDefinitions[d].name
                                               : d \in DOMAIN fragment.variableDefinitions}
                               IN IF ~coerced.ok THEN [visited EXCEPT !.failed = TRUE]
                                  ELSE CollectFrom(fx, objectType, fragment.selectionSet,
                                                   FragmentVariables(defined, coerced.values), 1, visited)
                 [] OTHER ->
                      IF /\ selection.typeCondition # ""
                         /\ ~DoesFragmentTypeApply(fx, objectType, selection.typeCondition)
                      THEN acc
                      ELSE CollectFrom(fx, objectType, selection.selectionSet, fragmentVariables, 1, acc)
    IN CollectFrom(fx, objectType, selections, fragmentVariables, i + 1, next)

\* The result is [grouped, failed]: the collected fields map, or failed.
Collected(acc) == [grouped |-> acc.grouped, failed |-> acc.failed]

CollectFields(fx, objectType, selectionSet, fragmentVariables) ==
  Collected(CollectFrom(fx, objectType, selectionSet, fragmentVariables, 1,
                        [grouped |-> <<>>, visited |-> {}, failed |-> FALSE]))

\* CollectSubfields(objectType, fieldDetailsList, variableValues): each
\* field's selection set is collected with its own visitedFragments, and
\* with the fragment variables of its own field detail ("Let field and
\* fragmentVariables be the corresponding entries on fieldDetails"), into
\* one collected fields map.
RECURSIVE CollectSubfieldsFrom(_, _, _, _, _)
CollectSubfieldsFrom(fx, objectType, fields, i, collected) ==
  IF i > Len(fields) \/ collected.failed THEN collected
  ELSE CollectSubfieldsFrom(fx, objectType, fields, i + 1,
         Collected(CollectFrom(fx, objectType, fields[i].field.selectionSet, fields[i].fragmentVariables, 1,
                               [grouped |-> collected.grouped, visited |-> {}, failed |-> FALSE])))

CollectSubfields(fx, objectType, fields) ==
  CollectSubfieldsFrom(fx, objectType, fields, 1, [grouped |-> <<>>, failed |-> FALSE])

\* ExecuteCollectedFields (§6.3.3) executes an entry, and gives it a place in
\* the result map, only "If fieldType is defined": if objectType has a field
\* named like the entry's first field. __typename is defined on every
\* object type (§4.1). An undefined field only gets here in a document that
\* breaks §5.3.1 (Field Selections), and every fixture is valid. (Fixtures
\* don't select __schema or __type; the introspect area covers those.)
IsTypename(group) == group.fields[1].field.name = "__typename"
IsDefined(fx, objectType, group) ==
  IsTypename(group) \/ group.fields[1].field.name \in DOMAIN TypeDef(fx, objectType).fields

\* The entries of a collected fields map that ExecuteCollectedFields
\* executes, in order.
Executed(fx, objectType, grouped) == SelectSeq(grouped, LAMBDA g : IsDefined(fx, objectType, g))

-----------------------------------------------------------------------------
(* §6.4 Executing Fields, over an oracle *)

NullJson == [kind |-> "null", value |-> "", entries |-> <<>>, items |-> <<>>]
LeafJson == [kind |-> "leaf", value |-> "", entries |-> <<>>, items |-> <<>>]

\* The result of completing one response position:
\*   kind    "value"    completed to a non-null value
\*           "null"     a nullable position whose resolver returned null
\*           "nulled"   a nullable position nulled by an execution error at
\*                      or below it (§6.4.4: "handled as though the response
\*                      position at which the error occurred resolved to null")
\*           "error"    an execution error that propagates to the parent
\*                      ("Since Non-Null response positions cannot be null,
\*                      execution errors are propagated")
\*           "pending"  some resolver it depends on hasn't settled yet
\*   json    its value in the response
\*   raised  every path in its subtree where a field error was raised
\*   cause   the raised paths whose propagation made it "nulled" or "error"
\*   nulls   [path, cause] for each "nulled" position that is visible in
\*           the response: not inside a position that is itself null. While
\*           execution is pending, the positions nulled so far.
Result(kind, json, raised, cause, nulls) ==
  [kind |-> kind, json |-> json, raised |-> raised, cause |-> cause, nulls |-> nulls]

Pending == Result("pending", NullJson, {}, {}, {})

\* The kind of value a nullable type completes from, by §6.4.3
\* CompleteValue: a list for a list type ("If result is not a collection of
\* values, raise an execution error"), a leaf for a scalar or enum (an
\* object is one CoerceResult can't represent), an object otherwise.
\* Anything else for a list, scalar or enum type is an execution error.
\* An Object type has no such step: see ObjectTypeOf.
Expected(fx, type) ==
  IF IsList(type) THEN "list"
  ELSE IF TypeDef(fx, type.name).kind = "scalar" THEN "leaf"
  ELSE "object"

\* The objectType CompleteValue executes the sub-selection of an Object,
\* Interface or Union type on, or NoObjectType where an execution error is
\* raised instead. For an Object type it is the type itself, whatever the
\* resolver produced: "If fieldType is an Object type. Let objectType be
\* fieldType." So a leaf, a list, or an object outcome of another type is
\* completed with the sub-selection like any object. For an Interface or
\* Union type it is ResolveAbstractType's answer, the outcome's runtime
\* type. A runtime type that isn't one of the possible types, or a value
\* that isn't an object, is an execution error here, as in graphql-js: no
\* sentence in any release says what happens when ResolveAbstractType
\* returns one, so the kit never sends that outcome (kit/execution/drive.mjs).
NoObjectType == ""
ObjectTypeOf(fx, type, outcome) ==
  IF TypeDef(fx, type.name).kind = "object" THEN type.name
  ELSE IF outcome.kind = "object" /\ outcome.type \in TypeDef(fx, type.name).possibleTypes THEN outcome.type
  ELSE NoObjectType

UnionOf(results) == UNION {results[i].raised : i \in DOMAIN results}

\* Combines the results of an object's fields or a list's items. One child
\* in "error" settles the parent at once, even while siblings are pending:
\* §6.3.3 lets "any sibling response positions which have not yet executed
\* or have not yet yielded a value" be cancelled.
Combine(path, results, json) ==
  LET raised == UnionOf(results)
      errors == {i \in DOMAIN results : results[i].kind = "error"}
  IN IF errors # {}
     THEN Result("error", NullJson, raised,
                 UNION {results[i].cause : i \in errors}, {})
     ELSE IF \E i \in DOMAIN results : results[i].kind = "pending"
     THEN Result("pending", NullJson, raised, {},
                 UNION {results[i].nulls : i \in DOMAIN results})
     ELSE Result("value", json, raised, {},
                 UNION {results[i].nulls : i \in DOMAIN results})

RECURSIVE CompletePosition(_, _, _, _, _), CompleteNullable(_, _, _, _, _), CompleteFields(_, _, _, _, _)

\* The fields an object completes, in order: __typename is answered from
\* the runtime type without a resolver (§4.1); every other field is
\* executed.
CompleteFields(fx, O, path, objectType, grouped) ==
  [i \in DOMAIN grouped |->
     IF IsTypename(grouped[i])
     THEN Result("value", [LeafJson EXCEPT !.value = objectType], {}, {}, {})
     ELSE CompletePosition(fx, O, Append(path, grouped[i].key),
                           FieldType(fx, objectType, grouped[i].fields[1].field.name),
                           grouped[i].fields)]

ObjectJson(grouped, results) ==
  [kind |-> "object", value |-> "", items |-> <<>>,
   entries |-> [i \in DOMAIN grouped |-> [key |-> grouped[i].key, value |-> results[i].json]]]

\* ExecuteField and CompleteValue for the position at `path` of declared
\* type `type`, selected by `fields`. Non-Null handling (§6.4.3 step 1 and
\* §6.4.4) happens here; CompleteNullable completes the inner type.
CompletePosition(fx, O, path, type, fields) ==
  LET inner == CompleteNullable(fx, O, path, Nullable(type), fields) IN
  \* "If completedResult is null, raise an execution error": for a
  \* Non-Null type, the error is raised here when the inner result is a
  \* plain null.
  LET cause == IF inner.kind = "null" THEN {path} ELSE inner.cause IN
  CASE inner.kind \in {"value", "pending"} -> inner
    [] Propagates(fx, type) ->
         Result("error", NullJson, inner.raised \cup cause, cause, {})
    [] IsNonNull(type) ->
         \* Without propagation the error nulls this position.
         Result("nulled", NullJson, inner.raised \cup cause, cause,
                {[path |-> path, cause |-> cause]})
    [] inner.kind = "null" -> inner
    [] OTHER ->
         Result("nulled", NullJson, inner.raised, inner.cause,
                {[path |-> path, cause |-> inner.cause]})

CompleteNullable(fx, O, path, type, fields) ==
  IF path \notin DOMAIN O THEN Pending
  ELSE
    LET outcome == O[path] IN
    CASE outcome.kind = "error" ->
           \* The resolver raised an execution error.
           Result("error", NullJson, {path}, {path}, {})
      [] outcome.kind = "null" -> Result("null", NullJson, {}, {}, {})
      [] Expected(fx, type) # "object" /\ outcome.kind # Expected(fx, type) ->
           Result("error", NullJson, {path}, {path}, {})
      [] Expected(fx, type) = "leaf" -> Result("value", LeafJson, {}, {}, {})
      [] Expected(fx, type) = "list" ->
           \* CompleteValue for a list: complete each item with the
           \* item type, in parallel.
           LET items == [i \in 1..outcome.length |->
                          CompletePosition(fx, O, Append(path, ToString(i - 1)),
                                           OfType(type), fields)]
           IN Combine(path, items,
                      [kind |-> "list", value |-> "", entries |-> <<>>,
                       items |-> [i \in DOMAIN items |-> items[i].json]])
      [] ObjectTypeOf(fx, type, outcome) = NoObjectType ->
           Result("error", NullJson, {path}, {path}, {})
      [] OTHER ->
           \* CompleteValue for an object: collect the subfields for
           \* objectType and execute them (ExecuteCollectedFields).
           LET objectType == ObjectTypeOf(fx, type, outcome)
               collected == CollectSubfields(fx, objectType, fields)
               grouped == Executed(fx, objectType, collected.grouped)
               children == CompleteFields(fx, O, path, objectType, grouped)
           IN IF collected.failed
              \* CollectSubfields raised an execution error: the arguments
              \* of a fragment spread couldn't be coerced. CompleteValue
              \* was completing this position, so it is the response
              \* position of the error (§6.4.4: "an error raised during
              \* field execution, value resolution or coercion, at a
              \* specific response position"), and none of its fields is
              \* executed. The proposal doesn't say so in as many words:
              \* a fragment spread has no response position of its own.
              THEN Result("error", NullJson, {path}, {path}, {})
              ELSE Combine(path, children, ObjectJson(grouped, children))

\* §6.2 ExecuteQuery, ExecuteMutation, and ExecuteSubscriptionEvent for one
\* event, then §6.3.1 ExecuteRootSelectionSet and §6.4.4: "If every
\* response position from the root of the request to the source of the
\* execution error has a Non-Null type", data is null. The root is a
\* "nulled" position at path <<>> for the purposes of `nulls`. Serial and
\* normal execution complete to the same value; SeriallyExecuted below is
\* what tells them apart.
\*
\* ExecuteRootSelectionSet collects the root selection set "not within a
\* fragment definition", so with no fragment variables. If that collection
\* raises (a fragment spread's arguments), no root field is executed, and
\* the proposal doesn't say what the response is: there is no response
\* position for §6.4.4 to null. This takes the reading with the least
\* invented: operation execution has begun, so it is an execution error and
\* not a request error (§7.1.5), and "If every response position from the
\* root of the request to the source of the execution error has a Non-Null
\* type" holds of none, so data is null, with the error at the root, <<>>.
\* No fixture gets here (scripts/generate-fixtures.mjs refuses one), so the
\* kit never grades it. Coercion.tla states the same reading for a request
\* with variables (its "spreadError" outcome at depth 0).
RootCollected(fx) == CollectFields(fx, RootType(fx), fx.operation, NoFragmentVariables)
RootGroups(fx) ==
  IF RootCollected(fx).failed THEN <<>> ELSE Executed(fx, RootType(fx), RootCollected(fx).grouped)

ExecuteQuery(fx, O) ==
  LET grouped == RootGroups(fx)
      fields == CompleteFields(fx, O, <<>>, RootType(fx), grouped)
      data == Combine(<<>>, fields, ObjectJson(grouped, fields))
  IN IF RootCollected(fx).failed
     THEN Result("nulled", NullJson, {<<>>}, {<<>>}, {[path |-> <<>>, cause |-> {<<>>}]})
     ELSE IF data.kind = "error"
     THEN Result("nulled", NullJson, data.raised, data.cause,
                 {[path |-> <<>>, cause |-> data.cause]})
     ELSE data

-----------------------------------------------------------------------------
(* §7.1 Response: what a valid response to fx, given O, is *)

IsPrefix(prefix, path) ==
  Len(prefix) <= Len(path) /\ SubSeq(path, 1, Len(prefix)) = prefix

\* Whether an execution error had already nulled a position above `path`,
\* given O: data itself, or a nullable position on the way to `path`.
IsNulledAbove(fx, O, path) ==
  LET result == ExecuteQuery(fx, O) IN
  \/ result.kind = "nulled"
  \/ \E null \in result.nulls : null.path # path /\ IsPrefix(null.path, path)

\* O restricted to the root fields before the ith, in collected order.
RootsBefore(fx, O, i) ==
  LET keys == {RootGroups(fx)[k].key : k \in 1..(i - 1)} IN
  [path \in {p \in DOMAIN O : p[1] \in keys} |-> O[path]]

\* §6.4.4: an execution error "must be added to the errors list". For a
\* query that only bites through nullsExplained. Of several errors that
\* could have nulled a position, the one the engine completed first must be
\* reported, and the rest were raised inside a null and may be dropped. But
\* the engine completes sibling fields in whatever order it chooses
\* (§6.3.4), even after their resolvers have all returned, so any of them
\* may have come first. A mutation has no such freedom: §6.3.4 completes
\* each root field before the next one starts, so by the time root field i
\* runs, every error raised under earlier root fields has been raised and
\* can't be cancelled. Each must be reported unless an earlier error had already
\* nulled its position (graphql-spec#1184), even if root field i then
\* nulls data. That exemption can't swallow every cause of a null: each
\* null the earlier root fields produced still needs an error from its
\* cause, so the error that nulled `first` stays even once `second` nulls
\* data.
SerialErrorsKept(fx, O, errors) ==
  fx.operationType # "mutation" \/
    \A i \in 2..Len(RootGroups(fx)) :
      LET before == RootsBefore(fx, O, i)
          prefix == ExecuteQuery(fx, before)
          started == \E p \in DOMAIN O : p[1] = RootGroups(fx)[i].key
      IN started =>
           /\ \A p \in prefix.raised :
                IsNulledAbove(fx, before, p) \/ \E e \in DOMAIN errors : errors[e] = p
           /\ \A null \in prefix.nulls :
                \E e \in DOMAIN errors : errors[e] \in null.cause

\* Two JSON values are the same up to the order of object keys.
RECURSIVE SameJson(_, _)
SameJson(a, b) ==
  /\ a.kind = b.kind
  /\ a.value = b.value
  /\ Len(a.items) = Len(b.items)
  /\ \A i \in DOMAIN a.items : SameJson(a.items[i], b.items[i])
  /\ Len(a.entries) = Len(b.entries)
  /\ \A i \in DOMAIN a.entries :
       \E j \in DOMAIN b.entries :
         a.entries[i].key = b.entries[j].key /\ SameJson(a.entries[i].value, b.entries[j].value)

\* data and errors (a sequence of error paths) are a valid response once
\* the resolvers in O have settled. Each clause is named, so a checker can
\* say which one a response breaks:
\*
\*   complete           execution is complete.
\*   dataMatches        data is the completed value, up to key order.
\*   keyOrder           data's keys are in collected field order. §7.2.2
\*                      says a serialization format that supports ordered
\*                      maps "should" keep it, so this one is a SHOULD.
\*   errorsWereRaised   every error is an execution error that was raised,
\*                      at the path where it was raised (§7.1.6).
\*   errorPathsUnique   no two errors share a path (§6.4.4: "each error
\*                      added to the errors list during execution must have
\*                      a unique response path").
\*   errorsInsideNulls  every error is inside a null in data. An error
\*                      never accompanies a value it didn't null.
\*   nullsExplained     every null that an error caused is reported: at
\*                      least one error from the raised paths whose
\*                      propagation reached it is in errors. Not
\*                      necessarily the one that nulled it: which cause
\*                      the engine handled first depends on the order it
\*                      completed sibling fields in, which the outcomes
\*                      don't record (docs/conformance.md, "How strict
\*                      nullsExplained is").
\*   serialErrorsKept   a mutation reports every error its earlier root
\*                      fields raised (SerialErrorsKept above).
\*
\* Errors raised inside a subtree that was already nulled may or may not be
\* reported. §6.3.3 lets an executor cancel those resolvers outright, and
\* graphql-js 16.13 and later, and 17, drop their errors (graphql-js#4458,
\* implementing graphql-spec#1184).
Clauses(fx, O, data, errors) ==
  LET result == ExecuteQuery(fx, O) IN
  [complete |-> result.kind # "pending",
   dataMatches |-> SameJson(data, result.json),
   keyOrder |-> ~SameJson(data, result.json) \/ data = result.json,
   errorsWereRaised |-> \A i \in DOMAIN errors : errors[i] \in result.raised,
   errorPathsUnique |-> \A i, j \in DOMAIN errors : i # j => errors[i] # errors[j],
   errorsInsideNulls |->
     \A i \in DOMAIN errors : \E null \in result.nulls : IsPrefix(null.path, errors[i]),
   nullsExplained |->
     \A null \in result.nulls : \E i \in DOMAIN errors : errors[i] \in null.cause,
   serialErrorsKept |-> SerialErrorsKept(fx, O, errors)]

\* The names of the clauses a response breaks.
FailedClauses(fx, O, data, errors) ==
  LET clauses == Clauses(fx, O, data, errors) IN
  {name \in DOMAIN clauses : ~clauses[name]}

Valid(fx, O, data, errors) == FailedClauses(fx, O, data, errors) = {}

\* Whether a response can be sent yet.
IsComplete(fx, O) == ExecuteQuery(fx, O).kind # "pending"

\* §6.3.4 Normal and Serial Execution: a mutation's root fields execute
\* serially, in the order of the collected fields map, each one completed
\* before the next is executed. EarlierRootsComplete says every root field
\* before the one with response key `key` has completed, given O.
EarlierRootsComplete(fx, O, key) ==
  LET grouped == RootGroups(fx)
      fields == CompleteFields(fx, O, <<>>, RootType(fx), grouped)
  IN \A j \in DOMAIN grouped :
       grouped[j].key = key => \A k \in 1..(j - 1) : fields[k].kind # "pending"

\* No resolver under a root field settles before every earlier root field
\* has completed.
SeriallyExecuted(fx, O) ==
  fx.operationType # "mutation" \/
    \A path \in DOMAIN O : EarlierRootsComplete(fx, O, path[1])

\* The same, over a trace of what an implementation did: a sequence of
\* [kind, path, outcome], where kind is "call" (a resolver was called) or
\* "settle" (it produced outcome). No root field's resolver is called before
\* every earlier root field has completed, given what had settled by then.
\* Calls are what an engine controls; settles, a test driver may choose.
SettledBy(trace, n) ==
  LET settles == {i \in 1..n : trace[i].kind = "settle"} IN
  [path \in {trace[i].path : i \in settles} |->
     trace[CHOOSE i \in settles : trace[i].path = path].outcome]

CalledSerially(fx, trace) ==
  fx.operationType # "mutation" \/
    \A n \in DOMAIN trace :
      (trace[n].kind = "call" /\ Len(trace[n].path) = 1) =>
        EarlierRootsComplete(fx, SettledBy(trace, n - 1), trace[n].path[1])

====
