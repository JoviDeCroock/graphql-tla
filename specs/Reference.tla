---- MODULE Reference ----
(***************************************************************************)
(* GraphQL query execution, written by hand from the spec's algorithms     *)
(* (https://spec.graphql.org/draft/, §6.3 and §6.4).                        *)
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
(*                selectionSet]                                            *)
(*   outcome     [kind, type, length]   kind \in {"object", "leaf",        *)
(*                                      "list", "null", "error"}           *)
(*   json        [kind, entries, items] kind \in {"null", "leaf",          *)
(*                                      "object", "list"}; entries is a    *)
(*                                      sequence of [key, value]           *)
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

-----------------------------------------------------------------------------
(* §6.3.2 Field Collection *)

\* The `if` argument of @skip or @include.
IfValue(fx, condition) ==
  IF condition.kind = "literal" THEN condition.value ELSE fx.variables[condition.variable]

\* CollectFields skips a selection when "skipDirective's if argument is true
\* or is a variable in variableValues with the value true", and when
\* "includeDirective's if argument is not true and is not a variable in
\* variableValues with the value true".
IsIncluded(fx, selection) ==
  /\ ~(selection.skip.kind # "absent" /\ IfValue(fx, selection.skip))
  /\ ~(selection.include.kind # "absent" /\ ~IfValue(fx, selection.include))

\* DoesFragmentTypeApply(objectType, fragmentType)
DoesFragmentTypeApply(fx, objectType, fragmentType) ==
  LET fragment == TypeDef(fx, fragmentType) IN
  IF fragment.kind = "object"
  THEN objectType = fragmentType
  ELSE objectType \in fragment.possibleTypes

ResponseKey(field) == IF field.alias = "" THEN field.name ELSE field.alias

\* The collected fields map is a sequence of [key, fields], ordered by when
\* each response key first appears ("Add selection to the
\* fieldsForResponseName").
AppendField(grouped, key, field) ==
  IF \E i \in DOMAIN grouped : grouped[i].key = key
  THEN [i \in DOMAIN grouped |->
          IF grouped[i].key = key
          THEN [grouped[i] EXCEPT !.fields = Append(@, field)]
          ELSE grouped[i]]
  ELSE Append(grouped, [key |-> key, fields |-> <<field>>])

\* CollectFields over selections[i..], threading the collected fields and
\* visitedFragments through the walk as the spec's algorithm does: "If
\* fragmentSpreadName is in visitedFragments, continue with the next
\* selection".
RECURSIVE CollectFrom(_, _, _, _, _)
CollectFrom(fx, objectType, selections, i, acc) ==
  IF i > Len(selections) THEN acc
  ELSE
    LET selection == selections[i]
        next ==
          IF ~IsIncluded(fx, selection) THEN acc
          ELSE CASE selection.kind = "field" ->
                      [acc EXCEPT !.grouped =
                         AppendField(@, ResponseKey(selection), selection)]
                 [] selection.kind = "fragmentSpread" ->
                      IF selection.name \in acc.visited THEN acc
                      ELSE
                        LET visited == [acc EXCEPT !.visited = @ \cup {selection.name}]
                            fragment == fx.fragments[selection.name]
                        IN IF ~DoesFragmentTypeApply(fx, objectType, fragment.typeCondition)
                           THEN visited
                           ELSE CollectFrom(fx, objectType, fragment.selectionSet, 1, visited)
                 [] OTHER ->
                      IF /\ selection.typeCondition # ""
                         /\ ~DoesFragmentTypeApply(fx, objectType, selection.typeCondition)
                      THEN acc
                      ELSE CollectFrom(fx, objectType, selection.selectionSet, 1, acc)
    IN CollectFrom(fx, objectType, selections, i + 1, next)

CollectFields(fx, objectType, selectionSet) ==
  CollectFrom(fx, objectType, selectionSet, 1, [grouped |-> <<>>, visited |-> {}]).grouped

\* CollectSubfields(objectType, fields): each field's selection set is
\* collected with its own visitedFragments, into one grouped field set.
RECURSIVE CollectSubfieldsFrom(_, _, _, _, _)
CollectSubfieldsFrom(fx, objectType, fields, i, grouped) ==
  IF i > Len(fields) THEN grouped
  ELSE CollectSubfieldsFrom(fx, objectType, fields, i + 1,
         CollectFrom(fx, objectType, fields[i].selectionSet, 1,
                     [grouped |-> grouped, visited |-> {}]).grouped)

CollectSubfields(fx, objectType, fields) ==
  CollectSubfieldsFrom(fx, objectType, fields, 1, <<>>)

-----------------------------------------------------------------------------
(* §6.4 Executing Fields, over an oracle *)

NullJson == [kind |-> "null", entries |-> <<>>, items |-> <<>>]
LeafJson == [kind |-> "leaf", entries |-> <<>>, items |-> <<>>]

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
\*           the response: not inside a position that is itself null
Result(kind, json, raised, cause, nulls) ==
  [kind |-> kind, json |-> json, raised |-> raised, cause |-> cause, nulls |-> nulls]

Pending == Result("pending", NullJson, {}, {}, {})

\* The outcome a resolver must produce for a nullable type: a list for a
\* list type, a leaf for a scalar, an object otherwise. Anything else, such
\* as an object for a list type, is a field error, as is a runtime type
\* that isn't one of the possible types (§6.4.3 ResolveAbstractType).
Expected(fx, type) ==
  IF IsList(type) THEN "list"
  ELSE IF TypeDef(fx, type.name).kind = "scalar" THEN "leaf"
  ELSE "object"

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
     THEN Result("pending", NullJson, raised, {}, {})
     ELSE Result("value", json, raised, {},
                 UNION {results[i].nulls : i \in DOMAIN results})

RECURSIVE CompletePosition(_, _, _, _, _), CompleteNullable(_, _, _, _, _)

\* ExecuteField and CompleteValue for the position at `path` of declared
\* type `type`, selected by `fields`. Non-Null handling (§6.4.3 step 1 and
\* §6.4.4) happens here; CompleteNullable completes the inner type.
CompletePosition(fx, O, path, type, fields) ==
  LET inner == CompleteNullable(fx, O, path, Nullable(type), fields) IN
  CASE inner.kind \in {"value", "pending"} -> inner
    [] IsNonNull(type) ->
         \* "If completedResult is null, raise an execution error": the
         \* error is raised here when the inner result is a plain null.
         LET cause == IF inner.kind = "null" THEN {path} ELSE inner.cause IN
         Result("error", NullJson, inner.raised \cup cause, cause, {})
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
      [] outcome.kind # Expected(fx, type) ->
           Result("error", NullJson, {path}, {path}, {})
      [] outcome.kind = "leaf" -> Result("value", LeafJson, {}, {}, {})
      [] outcome.kind = "list" ->
           \* CompleteValue for a list: complete each item with the
           \* item type, in parallel.
           LET items == [i \in 1..outcome.length |->
                          CompletePosition(fx, O, Append(path, ToString(i - 1)),
                                           OfType(type), fields)]
           IN Combine(path, items,
                      [kind |-> "list", entries |-> <<>>,
                       items |-> [i \in DOMAIN items |-> items[i].json]])
      [] ~(outcome.type \in TypeDef(fx, type.name).possibleTypes) ->
           Result("error", NullJson, {path}, {path}, {})
      [] OTHER ->
           \* CompleteValue for an object: collect the subfields for the
           \* runtime type and execute them (ExecuteCollectedFields).
           LET grouped == CollectSubfields(fx, outcome.type, fields)
               children == [i \in DOMAIN grouped |->
                             CompletePosition(fx, O, Append(path, grouped[i].key),
                                              FieldType(fx, outcome.type, grouped[i].fields[1].name),
                                              grouped[i].fields)]
           IN Combine(path, children,
                      [kind |-> "object", items |-> <<>>,
                       entries |-> [i \in DOMAIN grouped |->
                                     [key |-> grouped[i].key, value |-> children[i].json]]])

\* §6.2.1 ExecuteQuery and §6.3.1 ExecuteRootSelectionSet, then §6.4.4: "If
\* every response position from the root of the request to the source of
\* the execution error has a Non-Null type", data is null. The root is a
\* "nulled" position at path <<>> for the purposes of `nulls`.
ExecuteQuery(fx, O) ==
  LET rootType == fx.schema.query
      grouped == CollectFields(fx, rootType, fx.operation)
      fields == [i \in DOMAIN grouped |->
                  CompletePosition(fx, O, <<grouped[i].key>>,
                                   FieldType(fx, rootType, grouped[i].fields[1].name),
                                   grouped[i].fields)]
      data == Combine(<<>>, fields,
                      [kind |-> "object", items |-> <<>>,
                       entries |-> [i \in DOMAIN grouped |->
                                     [key |-> grouped[i].key, value |-> fields[i].json]]])
  IN IF data.kind = "error"
     THEN Result("nulled", NullJson, data.raised, data.cause,
                 {[path |-> <<>>, cause |-> data.cause]})
     ELSE data

-----------------------------------------------------------------------------
(* §7.1 Response: what a valid response to fx, given O, is *)

IsPrefix(prefix, path) ==
  Len(prefix) <= Len(path) /\ SubSeq(path, 1, Len(prefix)) = prefix

\* data and errors (a sequence of error paths) are a valid response once
\* the resolvers in O have settled:
\*
\* 1. Execution is complete, and data is exactly the completed value.
\* 2. Every error is an execution error that was raised, at the path
\*    where it was raised (§7.1.6).
\* 3. No two errors share a path (§6.4.4: "each error added to the errors
\*    list during execution must have a unique response path").
\* 4. Every error is inside a null in data. An error never accompanies a
\*    value it didn't null.
\* 5. Every null that an error caused is reported: at least one error from
\*    the raised paths whose propagation reached it is in errors.
\*
\* Errors raised inside a subtree that was already nulled may or may not be
\* reported. §6.3.3 lets an executor cancel those resolvers outright, and
\* graphql-js 16.13 and later, and 17, drop their errors (graphql-js#4458,
\* implementing graphql-spec#1184).
Valid(fx, O, data, errors) ==
  LET result == ExecuteQuery(fx, O) IN
  /\ result.kind # "pending"
  /\ data = result.json
  /\ \A i \in DOMAIN errors : errors[i] \in result.raised
  /\ \A i, j \in DOMAIN errors : i # j => errors[i] # errors[j]
  /\ \A i \in DOMAIN errors : \E null \in result.nulls : IsPrefix(null.path, errors[i])
  /\ \A null \in result.nulls : \E i \in DOMAIN errors : errors[i] \in null.cause

\* Whether a response can be sent yet.
IsComplete(fx, O) == ExecuteQuery(fx, O).kind # "pending"
====
