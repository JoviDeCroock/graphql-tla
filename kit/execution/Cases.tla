---- MODULE Cases ----
(***************************************************************************)
(* What the kit checks of each execution case (kit/execution/check.mjs).   *)
(* A generated module EXTENDS this one and defines Cases, a sequence of    *)
(* [fixture, outcomes, trace, data, errors]:                               *)
(*                                                                         *)
(*   outcomes  what each resolver produced, settled before the response    *)
(*   trace     [kind, path, outcome] for each call and settle of a         *)
(*             mutation, in order; empty for other operations              *)
(*   data      the response's data, as Reference's json                    *)
(*   errors    the response's error paths, in order                        *)
(***************************************************************************)
EXTENDS Reference, Fixtures

\* Whether the position at `path` of declared type `type`, selected by
\* `fields`, may still raise an execution error that propagates to its
\* parent, whatever the resolvers that haven't settled produce. Only a
\* Non-Null position propagates (§6.4.4), and only if its resolver hasn't
\* settled, or a Non-Null position under it may still raise. A position
\* that has completed can't raise any more.
RECURSIVE MayRaise(_, _, _, _, _)
MayRaise(fx, O, path, type, fields) ==
  IF ~Propagates(fx, type) THEN FALSE
  ELSE IF path \notin DOMAIN O THEN TRUE
  ELSE
    LET outcome == O[path]
        inner == Nullable(type)
    IN CASE outcome.kind = "list" /\ IsList(inner) ->
              \E i \in 1..outcome.length :
                MayRaise(fx, O, Append(path, ToString(i - 1)), OfType(inner), fields)
         [] outcome.kind = "object" /\ Expected(fx, inner) = "object" ->
              IF ~(outcome.type \in TypeDef(fx, inner.name).possibleTypes) THEN FALSE
              ELSE
                LET grouped == CollectSubfields(fx, outcome.type, fields) IN
                \E j \in DOMAIN grouped :
                  IF grouped[j].fields[1].name = "__typename" THEN FALSE
                  ELSE MayRaise(fx, O, Append(path, grouped[j].key),
                                FieldType(fx, outcome.type, grouped[j].fields[1].name),
                                grouped[j].fields)
         [] OTHER -> FALSE

\* Whether data is null in a response sent while execution is pending,
\* though no root field can null it any more. Reference!Clauses compares
\* data with the pending result, whose json is null, so data null passes
\* dataMatches there. But §6.4.4 nulls data only when an execution error
\* propagates to the root through Non-Null positions. If no root field may
\* still raise one (MayRaise), no outcome of the pending resolvers makes
\* data null, so data null isn't the completed value. If one may, the
\* response is only early (complete).
DataNulledEarly(fx, O, data) ==
  LET grouped == RootGroups(fx) IN
  /\ data.kind = "null"
  /\ ExecuteQuery(fx, O).kind = "pending"
  /\ \A i \in DOMAIN grouped :
       IF grouped[i].fields[1].name = "__typename" THEN TRUE
       ELSE ~MayRaise(fx, O, <<grouped[i].key>>,
                      FieldType(fx, RootType(fx), grouped[i].fields[1].name),
                      grouped[i].fields)

\* The clauses of Reference!Clauses a case breaks, plus "calledSerially" if
\* a mutation's root field was called before an earlier one completed, and
\* "dataMatches" if data is null though no root field can null it
\* (DataNulledEarly). serialErrorsKept rests on serial execution, which
\* §6.2.2 only says "should" happen: a mutation that didn't run its root
\* fields serially may have completed a later one first, so it is graded
\* only when CalledSerially holds.
Failures(c) ==
  LET fx == Fixtures[c.fixture]
      failed == FailedClauses(fx, c.outcomes, c.data, c.errors)
  IN (IF CalledSerially(fx, c.trace) THEN failed
      ELSE (failed \ {"serialErrorsKept"}) \cup {"calledSerially"})
       \cup (IF DataNulledEarly(fx, c.outcomes, c.data) THEN {"dataMatches"} ELSE {})

\* A readable rendering of json, for reports. Leaf values are abstracted
\* away, so a leaf other than __typename's prints as <leaf>.
RECURSIVE JsonText(_), ItemsText(_, _), EntriesText(_, _)
JsonText(j) ==
  CASE j.kind = "null" -> "null"
    [] j.kind = "leaf" -> IF j.value = "" THEN "<leaf>" ELSE "\"" \o j.value \o "\""
    [] j.kind = "list" -> "[" \o ItemsText(j.items, 1) \o "]"
    [] OTHER -> "{" \o EntriesText(j.entries, 1) \o "}"
ItemsText(items, i) ==
  IF i > Len(items) THEN ""
  ELSE (IF i > 1 THEN ", " ELSE "") \o JsonText(items[i]) \o ItemsText(items, i + 1)
EntriesText(entries, i) ==
  IF i > Len(entries) THEN ""
  ELSE (IF i > 1 THEN ", " ELSE "") \o "\"" \o entries[i].key \o "\": "
         \o JsonText(entries[i].value) \o EntriesText(entries, i + 1)

ExpectedText(c) ==
  LET result == ExecuteQuery(Fixtures[c.fixture], c.outcomes) IN
  IF result.kind = "pending" THEN "(incomplete)" ELSE JsonText(result.json)
====
