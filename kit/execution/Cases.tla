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

\* The clauses of Reference!Clauses a case breaks, plus "calledSerially" if
\* a mutation's root field was called before an earlier one completed.
Failures(c) ==
  LET fx == Fixtures[c.fixture] IN
  FailedClauses(fx, c.outcomes, c.data, c.errors)
    \cup (IF CalledSerially(fx, c.trace) THEN {} ELSE {"calledSerially"})

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
