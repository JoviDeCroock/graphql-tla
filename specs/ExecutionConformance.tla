---- MODULE ExecutionConformance ----
(***************************************************************************)
(* The executor in execution.ts implements the contract in                 *)
(* GraphQLResponse.tla: on every fixture, in every variant, under every    *)
(* schedule and every combination of resolver outcomes.                    *)
(*                                                                         *)
(* Refines is the refinement itself. The other properties state its       *)
(* parts separately, so a failure says which part broke.                   *)
(***************************************************************************)
EXTENDS Execution, Fixtures

NoData == [kind |-> "null", value |-> "", entries |-> <<>>, items |-> <<>>]

Contract == INSTANCE GraphQLResponse WITH
  fx <- Fixtures[fixture],
  outcomes <- outcomes,
  sent <- sent,
  data <- IF sent THEN sentData ELSE NoData,
  errors <- IF sent THEN sentErrors ELSE <<>>

Refines == Contract!Spec

\* The response is valid for the resolvers settled when it is sent.
ResponseIsValid ==
  [][~sent /\ sent' => Contract!Valid(Fixtures[fixture], outcomes', sentData', sentErrors')]_vars

\* The response stays valid as abandoned resolvers keep settling. So a
\* checker that records a settle the executor never saw before it responded
\* (kit/execution/drive.mjs without `idle`) can't wrongly fail a response.
ResponseStaysValid ==
  [][sent /\ sent' => Contract!Valid(Fixtures[fixture], outcomes', sentData', sentErrors')]_vars

\* Nothing changes the response once it is sent.
ResponseIsFinal == [][sent => UNCHANGED <<sentData, sentErrors>>]_vars

\* A response is always sent.
EventuallyResponds == <>sent

\* A mutation's root fields execute one after another.
RootFieldsAreSerial == [][Contract!SeriallyExecuted(Fixtures[fixture], outcomes')]_vars
====
