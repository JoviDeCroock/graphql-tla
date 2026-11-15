---- MODULE GraphQLResponse ----
(***************************************************************************)
(* The contract of executing one query, as a state machine over what an    *)
(* observer can see: resolvers settling, and a response being sent.        *)
(*                                                                         *)
(*   fx        the fixture (schema, query, variables); never changes      *)
(*   outcomes  what each settled resolver produced; only ever grows       *)
(*   sent      whether the response was sent                              *)
(*   data      the response's data                                        *)
(*   errors    the response's error paths, in order                       *)
(*                                                                         *)
(* A response is sent exactly once, it is valid (Reference!Valid) for the  *)
(* resolvers settled when it was sent, it never changes afterwards, and    *)
(* it is eventually sent. Resolvers in abandoned subtrees may keep         *)
(* settling after the response is out. A mutation's root fields settle     *)
(* serially (Reference!SeriallyExecuted).                                  *)
(***************************************************************************)
EXTENDS Reference

VARIABLES fx, outcomes, sent, data, errors
vars == <<fx, outcomes, sent, data, errors>>

Extends(next, current) ==
  /\ DOMAIN current \subseteq DOMAIN next
  /\ \A path \in DOMAIN current : next[path] = current[path]

Init ==
  /\ outcomes = <<>>
  /\ sent = FALSE
  /\ data = NullJson
  /\ errors = <<>>

Settle ==
  /\ Extends(outcomes', outcomes)
  /\ SeriallyExecuted(fx, outcomes')
  /\ UNCHANGED <<fx, sent, data, errors>>

Respond ==
  /\ ~sent
  /\ sent'
  /\ Extends(outcomes', outcomes)
  /\ SeriallyExecuted(fx, outcomes')
  /\ Valid(fx, outcomes', data', errors')
  /\ UNCHANGED fx

Next == Settle \/ Respond

Spec == Init /\ [][Next]_vars /\ <>sent
====
