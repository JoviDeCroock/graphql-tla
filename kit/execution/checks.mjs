// Everything the execution check reports on, with the spec sections it
// rests on (numbers from kit/spec-sections.json). A conformance sheet is
// built from these.

// `reference: true` checks are clauses of Cases!Failures; the rest are made
// in JS before the reference sees a case. `level` is the level in September
// 2026, the edition the kit grades. `levels` gives the level in an older
// release whose wording gives a different one ("September2025",
// "October2021"); a release it leaves out has `level`. `since` names the
// first release whose text has the rule, if after October 2021.
// `requires` names the capabilities without which nothing exercises a check
// (docs/kit-areas.md, "Reports"): the sheet shows it untested for that
// reason. `basis` quotes the
// sentences a check rests on, in each release where they differ, and says
// why its level is the one it is. A level comes only from normative prose:
// examples ("for example", example blocks) are non-normative (Appendix A),
// and where the text's level is in doubt the kit takes the weaker one. An
// INFO check grades behaviour no spec sentence requires: it is reported,
// cites no section and never fails a run.
export const CHECKS = [
  // Reference!Clauses and Cases!Failures.
  {
    id: "complete",
    reference: true,
    level: "MUST",
    spec: ["6.3.1", "6.3.3", "7.1.5"],
    title: "The response is sent only once execution is complete",
    basis:
      "No sentence says to respond only once execution is complete; the algorithms do. ExecuteRootSelectionSet (§6.3.1) returns {data} once ExecuteCollectedFields has run, and §6.3.3 says \"Execution will recursively resolve and complete the value of every entry in the collected fields map\". §7.1.5 adds: \"The response data is the result of accumulating the resolved result of all response positions during execution.\" Positions §6.3.3 lets an implementation cancel don't hold the response back. September 2025 has the same algorithms and sentences, and October 2021's algorithms are the same.",
  },
  {
    id: "dataMatches",
    reference: true,
    level: "MUST",
    spec: ["6.3.2", "6.4.3", "6.4.4"],
    title: "data is the completed value: field collection, value completion and null propagation",
    basis:
      "When an error propagates to the root, §6.4.4 and §7.1.5 say data \"should be null\", in every release (October 2021: §6.4.4 and §7.1.1). The kit still requires null, because no other value conforms: the execution result must have a data entry (§7.1.1), {} or a partial map leaves out an entry ExecuteCollectedFields must produce (§6.3.3), and a map with null at the failed root field breaks that field's Non-Null type.",
  },
  {
    id: "keyOrder",
    reference: true,
    level: "SHOULD",
    spec: ["7.2.2"],
    title: "Response keys are in collected field order",
    basis:
      "§7.2.2: \"Serialization formats which only represent unordered maps but where order is still implicit in the serialization's textual order (such as JSON) should preserve the order of requested fields textually.\" September 2025 and October 2021 say the same.",
  },
  {
    id: "errorsWereRaised",
    reference: true,
    level: "MUST",
    spec: ["7.1.4", "7.1.6"],
    title: "Every error was raised, at the path where it was raised",
    basis:
      "§7.1.6: an error that \"can be associated to a particular field in the GraphQL result ... must contain an entry with the key {\"path\"} with a response path which describes the response position which raised the error\"; §7.1.4: \"When a response path is present on an error result, it identifies the response position which raised the error.\" September 2025 has both sentences. October 2021's §7.1.2: it \"must contain an entry with the key path that details the path of the response field which experienced the error\". A path that leaves out list indices counts against responsePosition instead, and one cut short at the nullable position the error propagated to against errorPathFull: both are paths to the raised error in the wrong form, not errors that weren't raised.",
  },
  {
    id: "errorPathsUnique",
    reference: true,
    level: "MUST",
    levels: { September2025: "SHOULD", October2021: "SHOULD" },
    spec: ["6.4.4"],
    title: "No two errors share a response path",
    basis:
      "September 2026's §6.4.4: \"That is, each error added to the errors list during execution must have a unique response path.\" September 2025's: \"That is, only one error should be added to the errors list per response position.\" October 2021's: \"That is, only one error should be added to the errors list per field.\" The must is new in September 2026 (graphql-spec#1183). All three say the errors list \"must not be further affected\" when a position is null because of an error already added. A response with two errors at one path doesn't say whether the second was added for a position the first had already nulled (which breaks that must) or raised on its own, so in September 2025 and October 2021 the kit takes the weaker reading, the should.",
  },
  {
    id: "errorsInsideNulls",
    reference: true,
    level: "MUST",
    spec: ["6.4.4", "7.1.6"],
    title: "Every error is inside a null in data",
    basis:
      "§7.1.6: \"When an execution error is raised at a given response position, then that response position must not be present within the response {\"data\"} entry (except {null})\", and §6.4.4 propagates it to the nearest nullable parent. September 2025 has the same sentences. October 2021, §6.4.4: a field error \"is handled as though the field returned {null}\", and §6.3 (Errors and Non-Null Fields): the error \"must propagate to this entire selection set, either resolving to {null} if allowed or further propagated to a parent field.\" An error whose position holds a value breaks these in every release.",
  },
  {
    id: "nullsExplained",
    reference: true,
    level: "MUST",
    levels: { October2021: "SHOULD" },
    spec: ["6.4.4", "7.1.1"],
    title: "Every null an error caused comes with an error from one of its causes",
    basis:
      "September 2026's §6.4.4: \"While these errors must be reported in the response\", and twice \"the error must be added to the {\"errors\"} list in the execution result\"; §7.1.1: the errors entry \"must be a non-empty list of execution error raised during operation execution\"; §7.1.6: \"the {\"errors\"} entry must include the error\". September 2025 has the same musts (its §7.1.1: \"must be a non-empty list of execution error raised during execution\"). October 2021 has both words. Its §6.4.4 says twice that \"the error must be added to the {\"errors\"} list in the response\", but opens with \"While these errors should be reported in the response\", and its §7.1.2 says \"If field errors were raised during execution, it should contain those errors\" and \"The errors entry should include all raised field errors.\" September 2025 made each of these a must. With the October 2021 level in doubt, the kit takes the weaker one there. (October 2021's §7.1 still says the response \"must contain an entry with key errors\" if any errors were raised, so a response with no errors entry at all breaks a must in every release; the check doesn't count that case apart.)",
  },
  {
    id: "serialErrorsKept",
    reference: true,
    level: "MUST",
    levels: { October2021: "SHOULD" },
    spec: ["6.3.4", "6.4.4"],
    title: "A mutation that ran its root fields serially reports every error its earlier root fields raised",
    mutationOnly: true,
    basis:
      "§6.4.4: an execution error \"must be added to the errors list\". §6.3.3 lets an implementation cancel fields that have not yet executed or yielded a value, but serial execution (§6.3.4) completes each mutation root field before the next starts, so an earlier root field's errors can't have been cancelled. That argument needs serial execution, which is only a SHOULD (calledSerially), so this check is graded only on cases whose trace passes calledSerially. September 2025 has the same sentences. October 2021: the level is in doubt as for nullsExplained (\"must be added\", but \"should be reported\", \"should include all raised field errors\"), so it is a SHOULD there.",
  },
  {
    id: "calledSerially",
    reference: true,
    level: "SHOULD",
    spec: ["6.2.2", "6.3.4"],
    title: "A mutation's root fields execute one after another",
    mutationOnly: true,
    basis:
      "The one sentence that says whether a mutation's root selection set is executed serially is §6.2.2's, in every release: \"This selection set should be executed serially.\" §6.3.4 adds, with no key word: \"When executing a mutation, the selections in the top most selection set will be executed in serial order, starting with the first appearing field textually.\" Its musts (\"When executing a collected fields map serially, the executor must consider each entry ... It must determine the corresponding entry in the result map for each item to completion before it continues on to the next entry\") say what serial execution is, once a selection set is executed serially. The sentence that the root selection set \"must be executed serially\" is introduced by \"For example\", which Appendix A makes non-normative. ExecuteMutation passes \"serial\" unconditionally, but the prose about the same step says should, so the level is in doubt and the kit takes the weaker one. September 2025 and October 2021 (§6.2.2, §6.3.1) say the same.",
  },
  {
    id: "mutationFieldsOnce",
    level: "MUST",
    spec: ["6.2.2", "6.3.2", "6.3.4"],
    title: "Each mutation root field the operation selects executes once, and no other mutation root field executes",
    mutationOnly: true,
    basis:
      "§6.3.2 collects the root fields before execution: \"This ensures that multiple references to fields with the same response name will only be executed once\", and CollectFields leaves out fields @skip and @include exclude. Appendix A lets an implementation fulfil an algorithm \"in any way as long as the perceived result is equivalent\", and §6.3.4 says \"the resolution of fields other than top-level mutation fields must always be side effect-free and idempotent\", so for every other field an extra call isn't perceived (callsOnce, callsSelected and callsReachable are INFO). Top-level mutation fields are the exception: §6.2.2 expects them to \"perform side-effects on the underlying data system\", so running one twice, or one the operation doesn't select, is perceived. September 2025 and October 2021 (§6.2.2, §6.3.1, §6.3.2: \"executed at the same time\") say the same.",
  },
  // Checked in JS before the reference sees a case.
  {
    id: "callsOnce",
    level: "INFO",
    spec: [],
    title: "Each field is executed once, merged selections included (mutation root fields: mutationFieldsOnce)",
    basis:
      "§6.3.2: collecting fields \"ensures that multiple references to fields with the same response name will only be executed once\". That describes what the algorithm does, and Appendix A lets an implementation fulfil it \"in any way as long as the perceived result is equivalent\". §6.3.4: \"the resolution of fields other than top-level mutation fields must always be side effect-free and idempotent\", so calling such a field's resolver twice isn't perceived in the response, which the reference still grades whenever both calls settled to the same outcome. Recorded, never a failure. A mutation root field called twice is mutationFieldsOnce, a MUST.",
  },
  {
    id: "callsSelected",
    level: "INFO",
    spec: [],
    title: "Only fields the operation selects are executed (mutation root fields: mutationFieldsOnce)",
    basis:
      "CollectFields (§6.3.2) leaves out fields that @skip, @include or a fragment's type condition exclude, so the algorithm never executes them. As for callsOnce, Appendix A's \"perceived result is equivalent\" and §6.3.4's side-effect-free fields mean an extra call below the mutation root isn't perceived; the reference still grades the response. A mutation root field the operation doesn't select is mutationFieldsOnce, a MUST.",
  },
  {
    id: "callsReachable",
    level: "INFO",
    spec: [],
    title: "A field executes only once its parent has a value that contains it",
    basis:
      "CompleteValue (§6.4.3) executes subfields only for an object value, and list items only for the items of a list. The example in §6.3.4 that says \"of course `birthday` must be resolved before `month`\" is non-normative (Appendix A). A call under a parent that settled null, or past a list's length, isn't perceived in the response for side-effect-free fields (§6.3.4, Appendix A), and the reference still grades the response.",
  },
  {
    id: "responds",
    level: "MUST",
    spec: ["7"],
    title: "A request gets a response",
    basis: "§7: \"When a GraphQL service receives a request, it must return a well-formed response.\" September 2025 and October 2021 say the same.",
  },
  {
    id: "eventYieldsResult",
    level: "MUST",
    spec: ["6.2.3.2", "7.1.2"],
    title: "A subscription event yields an execution result, even when its data is null",
    subscriptionOnly: true,
    basis:
      "§7.1.2: \"A response stream must be a stream of execution result\", and §7.1.1: \"for each event in a subscription's source stream, the response stream will emit an execution result.\" MapSourceToResponseEvent (§6.2.3.2) completes the response stream with an error only if \"internal {error} was raised\", and its Note says the only such errors \"are internal exceptional errors not described by this specification\": execution errors are handled by ExecuteSubscriptionEvent. September 2025 has the same sentences and Note. October 2021's MapSourceToResponseEvent yields an event containing the result for each source event, and §7 requires \"a well-formed response\".",
  },
  // A subscription run as a stream the kit drives (subscription-stream):
  // checked on its lifecycle case, the log of what the kit's source stream
  // did and what the response stream yielded. Each event's result is a case
  // of its own, checked like any other.
  {
    id: "eventPerSourceEvent",
    level: "MUST",
    spec: ["6.2.3.2", "7.1.2"],
    title: "Each source event yields one execution result on the response stream, before it completes",
    streamOnly: true,
    requires: ["subscription-stream"],
    basis:
      "MapSourceToResponseEvent (§6.2.3.2): \"When {sourceStream} emits {sourceValue}: Let {executionResult} be the result of running {ExecuteSubscriptionEvent(...)} ... Otherwise emit {executionResult} on {responseStream}\", and the response stream completes only after that, when the source completes, fails or the stream is cancelled. §7.1.2: \"A response stream must be a stream of execution result\", and §6.2.3: \"each event in the event stream is the result of executing the operation's root selection set for each new event on an underlying source stream\". Algorithm steps have the algorithm's level (Appendix A). The only other way out is an internal error, which the Note after the algorithm says is \"not described by this specification\": the kit's resolvers raise execution errors, which ExecuteSubscriptionEvent handles. So an event emitted while the stream is open that yields no result before the stream completes, a result for no event, or a result after the stream completed, fails here. An event still executing when the kit cancels the stream isn't counted (nothingAfterCancel), nor is a result that arrives after the source failed, before the stream completed: it answers the failure, and failsWithSource grades it. September 2025 says the same; October 2021's MapSourceToResponseEvent says \"For each {event} on {sourceStream}: ... Yield an event containing {response}\".",
  },
  {
    id: "streamEndsOnlyForCause",
    level: "SHOULD",
    spec: ["6.2.3", "6.2.3.2"],
    title: "The response stream completes only when its source completes or fails, or it is cancelled",
    streamOnly: true,
    requires: ["subscription-stream"],
    basis:
      "MapSourceToResponseEvent (§6.2.3.2) completes {responseStream} when the source completes normally or with an error, when it is cancelled, and on an internal error, which its Note says is \"not described by this specification\". But §6.2.3 says of event streams in general, which a response stream is: \"An event stream may complete at any point, often because no further events will occur\", and \"Internal user code also may cancel an event stream for any reason, which would be observed as that event stream completing.\" With the level in doubt the kit takes the weaker one. A stream that completes instead of yielding an event's result fails eventPerSourceEvent, a MUST, instead. September 2025 says the same; October 2021: \"Event streams may produce an infinite sequence of events or may complete at any point.\"",
  },
  {
    id: "completesWithSource",
    level: "MUST",
    levels: { October2021: "SHOULD" },
    spec: ["6.2.3.2"],
    title: "When the source stream completes, the response stream completes normally",
    streamOnly: true,
    requires: ["subscription-stream"],
    basis:
      "MapSourceToResponseEvent (§6.2.3.2): \"When {sourceStream} completes normally: Complete {responseStream} normally.\" Algorithm steps have the algorithm's level (Appendix A). A response stream that completes with an error, or doesn't complete once every event has its result, fails. September 2025 says the same. October 2021's step reads \"When {responseStream} completes: complete this event stream\", which names the response stream where the source is meant; with its level in doubt the kit takes the weaker one there.",
  },
  {
    id: "failsWithSource",
    level: "MUST",
    since: "September2025",
    spec: ["6.2.3", "6.2.3.2"],
    title: "When the source stream fails, the response stream completes with an error",
    streamOnly: true,
    requires: ["subscription-stream"],
    basis:
      "§6.2.3 (Event Streams): \"If an event stream encounters an error, it must complete with that error.\" MapSourceToResponseEvent (§6.2.3.2): \"When {sourceStream} completes with {error}: Complete {responseStream} with {error}.\" A response stream that completes normally, or doesn't complete, fails. The kit doesn't compare error messages: an implementation may wrap the source's error. A stream whose last item after the source failed is a result with errors, followed by normal completion, passes: that is how an implementation whose streams can't end with an error (a stream of results, as in Rust) ends one with an error. The text doesn't say how \"complete with that error\" appears to a client: §6.2.3 says \"GraphQL specifies algorithms for ... the closing of that stream\", but leaves \"serialization format or transport mechanism\" to the service (Delivery Agnostic). §7.1.2's \"A response stream must be a stream of execution result\" argues against an error-only item, but with the text in doubt the kit takes the weaker reading. A result without errors there, then normal completion, fails. New in September 2025; October 2021 says only \"Event streams may complete in response to an error\".",
  },
  {
    id: "cancelCompletes",
    level: "MUST",
    since: "September2025",
    spec: ["6.2.3", "6.2.3.2", "6.2.3.3"],
    title: "A cancelled response stream completes normally",
    streamOnly: true,
    requires: ["subscription-stream"],
    basis:
      "§6.2.3 (Event Streams): \"When an event stream is cancelled, it must complete.\" MapSourceToResponseEvent (§6.2.3.2): \"When {responseStream} is cancelled: Cancel {sourceStream}. Complete {responseStream} normally.\" Unsubscribe (§6.2.3.3): \"Cancel {responseStream}.\" A response stream that completes with an error after the client cancelled it, or doesn't complete, fails. New in September 2025; October 2021 says only that after cancelling, an observer \"must receive no more events from that event stream\" (nothingAfterCancel).",
  },
  {
    id: "cancelCancelsSource",
    level: "MUST",
    since: "September2025",
    spec: ["6.2.3.2", "6.2.3.3"],
    title: "Cancelling the response stream cancels the source stream",
    streamOnly: true,
    requires: ["subscription-stream"],
    basis:
      "MapSourceToResponseEvent (§6.2.3.2): \"When {responseStream} is cancelled: Cancel {sourceStream}.\" §6.2.3.3: \"Unsubscribe cancels the response stream when a client no longer wishes to receive payloads for a subscription. This in turn also cancels the Source Stream\". Algorithm steps have the algorithm's level (Appendix A). The adapter reports the source being cancelled (`source-cancelled`); a cancelled stream whose source never is fails. September 2025 says the same. October 2021: \"This may in turn also cancel the Source Stream\", a may.",
  },
  {
    id: "nothingAfterCancel",
    level: "SHOULD",
    levels: { October2021: "MUST" },
    spec: ["6.2.3", "6.2.3.2"],
    title: "No result arrives after the client cancels the response stream",
    streamOnly: true,
    requires: ["subscription-stream"],
    basis:
      "MapSourceToResponseEvent (§6.2.3.2): \"When {responseStream} is cancelled: Cancel {sourceStream}. Complete {responseStream} normally\", and a completed stream emits nothing more. But the algorithm doesn't say what happens to an event whose ExecuteSubscriptionEvent was already running when the stream was cancelled, whose step \"emit {executionResult} on {responseStream}\" comes after, and §6.2.3's \"When an event stream is cancelled, it must complete\" doesn't say how soon. With the level in doubt the kit takes the weaker one. The kit's scenario cancels the stream while an event's resolvers are pending, then settles them; a result for that event after the cancel fails here (graphql-js 17 delivers it, then completes). September 2025 says the same. October 2021's §6.2.3: after cancelling, an observer \"must receive no more events from that event stream\", a must.",
  },
  {
    id: "dataShape",
    level: "MUST",
    spec: ["6.3.3", "7.1.5"],
    title: "data holds only positions the operation selects",
    basis:
      "ExecuteCollectedFields (§6.3.3) sets an entry in the result map only for each entry of the collected fields map, and §7.1.5 says \"The response data is the result of accumulating the resolved result of all response positions during execution.\" A value at a position the operation doesn't select isn't the completed value, as for dataMatches. September 2025 has the same algorithm and sentence, and October 2021's algorithms are the same.",
  },
  {
    id: "resultCoercion",
    level: "MUST",
    spec: ["3.5", "3.5.2", "3.9", "6.4.3"],
    title: "A non-finite Float, an unknown enum value or a value a custom scalar rejects raises an execution error instead of being passed through",
    basis:
      "§3.5.2: \"Non-finite floating-point internal values ({NaN} and {Infinity}) cannot be coerced to {Float} and must raise an execution error.\" §3.5, for every scalar, custom ones included: a service \"must uphold the contract the scalar type describes, either by coercing the value or producing an execution error if a value cannot be coerced\" (custom scalars with custom-scalar-results, whose resolver returns a value the scalar's result coercion rejects). §3.9: \"GraphQL services must return one of the defined set of possible values. If a reasonable coercion is not possible they must raise an execution error.\" CoerceResult (§6.4.3): the internal method \"must return a valid value for the type and not {null}. Otherwise raise an execution error.\" September 2025 says the same, and October 2021 too, with \"field error\". A value passed through fails here, as does no response at all after such a value, whose root cause it is. A null without an error is coercionErrorReported.",
  },
  {
    id: "intFraction",
    level: "MUST",
    spec: ["3.5.1", "6.4.3"],
    title: "A fraction returned for an Int (1.2) raises an execution error instead of being truncated",
    basis:
      "§3.5.1: \"GraphQL services may coerce non-integer internal values to integers when reasonable without losing information, otherwise they must raise an execution error.\" Truncating 1.2 to 1 loses information, so the must applies. The sentence after it, \"For example, a floating-point number 1.2 should raise an execution error instead of being truncated to 1\", is an example, which Appendix A makes non-normative, so its should doesn't set the level. September 2025 has the same sentences, and October 2021 too, with \"field error\". A value passed through fails here, as does no response at all after such a value. A null without an error is coercionErrorReported.",
  },
  {
    id: "coercionErrorReported",
    level: "MUST",
    levels: { October2021: "SHOULD" },
    spec: ["3.5", "3.5.1", "3.5.2", "3.9", "6.4.3", "6.4.4"],
    title: "A position whose resolver returned a value its type can't represent isn't null without an error",
    basis:
      "Such a value \"must raise an execution error\" (§3.5.1, §3.5.2, §3.9), CoerceResult's internal method \"must return a valid value for the type and not {null}\" (§6.4.3), and §6.4.4 says the error \"must be added to the {\"errors\"} list\" and opens \"While these errors must be reported in the response\". A null without an error at its path breaks one of these, in September 2026 and September 2025 alike, whichever the service did: coerced the value to null, or raised the error and left it out. October 2021 keeps the musts on raising, but says raised field errors \"should be reported\" and \"should include all raised field errors\" (see nullsExplained). The response can't tell the two apart, so the kit takes the weaker reading there: a SHOULD.",
  },
  {
    id: "intRange",
    level: "SHOULD",
    spec: ["3.5.1"],
    requires: ["scalar-results"],
    title: "An Int outside 32 bits returned by a resolver (2147483648) raises an execution error instead of being passed through",
    basis:
      "§3.5.1: \"If the integer internal value represents a value less than -2^31 or greater than or equal to 2^31, an execution error should be raised.\" September 2025 says the same, and October 2021 too, with \"a field error\". Graded only for adapters with scalar-results, in fixtures with invalid results. A null without an error is coercionErrorReported.",
  },
  {
    id: "idAsString",
    level: "MUST",
    levels: { October2021: "SHOULD" },
    spec: ["3.5.5"],
    requires: ["scalar-results"],
    title: "An ID whose resolver returned an integer (4) is serialized as a String (\"4\")",
    basis:
      "§3.5.5: \"The ID type is serialized in the same way as a String; however, it is not intended to be human-readable. While it is often numeric, it must always serialize as a String.\" Its Result Coercion lets a service raise an execution error when \"coercion is not possible\", which also passes. September 2025 says the same. October 2021: \"it should always serialize as a String\". Graded only for adapters with scalar-results, in fixtures with invalid results.",
  },
  {
    id: "leafValues",
    level: "MUST",
    spec: ["6.4.3"],
    title: "Leaf values are the resolver's canonical value (Int 1, Float 1.5, Boolean true, an enum's first value, \"v\")",
    basis:
      "CompleteValue returns {CoerceResult(fieldType, result)} for a leaf (§6.4.3), and the kit's resolvers return a value that is already valid for the type. §3.5 lets a service coerce internal values only \"when reasonable without losing information\", so a valid value coerces to itself. September 2025 and October 2021 say the same.",
  },
  {
    id: "leafEncoding",
    level: "SHOULD",
    spec: ["7.2.1"],
    title: "Leaf values use the JSON type §7.2.1 gives their GraphQL type (a number for Int 1, not \"1\")",
    basis:
      "§7.2.1: \"When using JSON as a serialization of GraphQL responses, the following JSON values should be used to encode the related GraphQL values\". §7.2 lets \"a string or simpler primitive ... be used as a substitute\" when a format lacks one. September 2025 and October 2021 say the same.",
  },
  {
    id: "resultMap",
    level: "MUST",
    spec: ["7.1.1"],
    title: "The execution result is a map",
    basis: "§7.1.1: \"An execution result must be a map.\" September 2025 says the same. October 2021's §7.1: \"A response to a GraphQL request must be a map.\"",
  },
  {
    id: "dataPresent",
    level: "MUST",
    spec: ["7.1.1"],
    title: "An execution result has a data entry",
    basis:
      "§7.1.1: \"The execution result must contain an entry with key {\"data\"}.\" September 2025 says the same. October 2021's §7.1: \"If the request included execution, the response map must contain an entry with key data\", and §7.1.2: \"The data entry in the response must be present.\"",
  },
  {
    id: "errorsList",
    level: "MUST",
    spec: ["7.1.1"],
    title: "errors, when present, is a non-empty list",
    basis:
      "September 2026's §7.1.1: \"If any errors are raised during operation execution, the execution result must contain an entry with key {\"errors\"}. The value of this entry must be a non-empty list ... If the request completed without raising any errors, this entry must not be present.\" September 2025's opens \"If execution raised any errors\" and has the same musts. October 2021's §7.1: \"If the request raised any errors, the response map must contain an entry with key errors. ... If the request completed without raising any errors, this entry must not be present.\" Its §7.1.2 also says \"should not be present\", but the §7.1 must is the sentence about the entry, so the check is a MUST in every release, as in coerce.",
  },
  {
    id: "additionalEntries",
    level: "MUST",
    spec: ["7.1.8"],
    title: "The response has no entries besides data, errors and extensions",
    basis:
      "§7.1.8: \"the execution result and request error result maps must not contain any entries other than those described above.\" September 2025 says the same. October 2021's §7.1: \"the top level response map must not contain any entries other than the three described above.\"",
  },
  {
    id: "extensions",
    level: "MUST",
    spec: ["7.1.7"],
    title: "extensions is a map",
    basis:
      "§7.1.7: \"The {\"extensions\"} entry in an execution result or request error result, if set, must have a map as its value.\" September 2025 says the same. October 2021's §7.1: \"This entry, if set, must have a map as its value.\"",
  },
  {
    id: "errorFormat",
    level: "MUST",
    spec: ["7.1.1", "7.1.6"],
    title: "Errors are maps with a message, and extensions, if present, is a map",
    basis:
      "§7.1.1: \"Each error must be a map\"; §7.1.6: \"Every error must contain an entry with the key {\"message\"} with a string description of the error\", and an error's extensions entry, \"if set, must have a map as its value.\" September 2025 says the same. October 2021's §7.1.2 says each error \"is a map\", and has the same musts on message and extensions.",
  },
  {
    id: "errorLocations",
    level: "SHOULD",
    spec: ["7.1.6"],
    title: "An error's locations, if present, is a list of maps with line and column, both positive integers",
    basis:
      "§7.1.6: \"it should contain an entry with the key {\"locations\"} with a list of locations, where each location is a map with the keys {\"line\"} and {\"column\"}, both positive numbers starting from `1`\". The whole sentence, shape included, is a should. September 2025 and October 2021 (§7.1.2) say the same.",
  },
  {
    id: "errorLocationsPresent",
    level: "SHOULD",
    spec: ["7.1.6"],
    title: "An execution error raised at a field has locations",
    basis:
      "§7.1.6: \"If an error can be associated to a particular point in the requested GraphQL document, it should contain an entry with the key {\"locations\"} with a list of locations\". Every error the kit's resolvers cause is raised at a field, or a list item of a field, of the document the kit sent. An error without locations, or with an empty list, fails. September 2025 and October 2021 (§7.1.2) say the same.",
  },
  {
    id: "errorLocationsAccurate",
    level: "SHOULD",
    spec: ["7.1.6"],
    title: "An execution error's locations point at the field it was raised at",
    basis:
      "§7.1.6: each location is a map with the keys line and column, \"both positive numbers starting from `1` which describe the beginning of an associated syntax element\". For an error raised at a field, or at an item of a list field, the associated element is that field's selection in the document the kit sent: the kit accepts the start of any of its field nodes (several when selections merge), or the start of the field's name after an alias. A location elsewhere fails. Locations are only compared for errors whose path is where the kit's outcome raised the error. The whole sentence is a should. September 2025 and October 2021 (§7.1.2) say the same.",
  },
  {
    id: "errorPath",
    level: "MUST",
    spec: ["7.1.6"],
    title: "Execution errors have a path to a position the operation selects",
    basis:
      "§7.1.6: an error that \"can be associated to a particular field in the GraphQL result ... must contain an entry with the key {\"path\"} with a response path which describes the response position which raised the error\". Every error the kit's resolvers cause is raised at a field or list item. A path to a position the operation doesn't select describes no response position. September 2025 has the same sentence, and October 2021's §7.1.2 the same must (\"must contain an entry with the key path that details the path of the response field which experienced the error\").",
  },
  {
    id: "responsePosition",
    level: "MUST",
    levels: { October2021: "SHOULD" },
    spec: ["7.1.4"],
    title: "Paths are lists of response names (aliases, not field names) and integer list indices, none left out",
    basis:
      "§7.1.4: \"The value for a response path must be a list of path segments\", \"path segments that represent list indices must be 0-indexed integers\", and an aliased field \"must use the aliased name\". A path that is a raised error's path with its list indices left out (`[\"tags\"]` for an error at `tags.0`) breaks the first two. September 2025's §7.1.4 has the same musts; they came with its new Response Position section (graphql-spec#1073). October 2021 has no such section: its §7.1.2 says each of these with should: \"This field should be a list of path segments starting at the root of the response and ending with the field associated with the error\", list indices \"should be 0-indexed integers\", \"the path to the error should use the aliased name\".",
  },
  {
    id: "errorPathFull",
    level: "SHOULD",
    spec: ["7.1.6"],
    title: "An error that propagated to a nullable parent keeps the full path to where it was raised",
    basis:
      "§7.1.6, in every release (October 2021: §7.1.2): \"If the field which experienced an error was declared as `Non-Null`, the `null` result will bubble up to the next nullable field. In that case, the `path` for the error should include the full path to the result field where the error was raised, even if that field is not present in the response.\" The general sentence before it says the path \"must\" describe the position which raised the error, but the sentence about this very case says should, so the level is in doubt and the kit takes the weaker one. A path that stops at a position the error propagated to, above where it was raised, fails here.",
  },
  {
    id: "errorEntries",
    level: "SHOULD",
    spec: ["7.1.6"],
    title: "Errors have no entries besides message, locations, path and extensions",
    basis:
      "§7.1.6: \"GraphQL services should not provide any additional entries to the error format\", and its Note: \"While non-specified entries are not violations, they are still discouraged.\" September 2025 and October 2021 (§7.1.2) say the same.",
  },
  {
    id: "uniqueKeys",
    level: "MUST",
    spec: ["7.1.1", "7.2.1", "B"],
    title: "No map in the serialized response repeats a key",
    basis:
      "§7.1.1: \"An execution result must be a map\", and Appendix B defines a map: \"Each entry has a unique key\". Data is built of maps too (ExecuteCollectedFields, §6.3.3, sets one entry per response name), as is each error. §7.2.1 serializes a map as a JSON object; a JSON object that repeats a name, which JSON.parse silently reduces to the last one, describes no map with unique keys. The kit reads the adapter's raw line for this. September 2025 says the same; October 2021's §7.1 says \"A response to a GraphQL request must be a map\", and its Appendix A defines no map, so the rule rests there on JSON objects meaning maps.",
  },
  {
    id: "parentValue",
    level: "MUST",
    spec: ["6.2.1", "6.2.3.2", "6.3.3", "6.4.2", "6.4.3"],
    requires: ["parent-values"],
    title: "Each field's resolver is given its parent's value: the initial value at the root, a subscription event's value at its root",
    basis:
      "ResolveFieldValue (§6.4.2): \"Return the result of calling {resolver}, providing {objectValue} and {argumentValues}\". ExecuteCollectedFields (§6.3.3) passes its {objectValue} to ExecuteField for every field; CompleteValue (§6.4.3) runs an object's subfields with {result}, the resolved value, as theirs; ExecuteRootSelectionSet passes the {initialValue} (§6.2.1: \"An initial value may be provided when executing a query operation\"), and §6.2.3.2: \"Each event from the underlying source stream triggers execution of the subscription selection set using that event's value as the {initialValue}\". Algorithm steps have the algorithm's level (Appendix A). Graded only for adapters with parent-values: the kit names each object its outcomes stand for, and each call reports the one its resolver got. September 2025 and October 2021 have the same algorithms.",
  },
  {
    id: "protocol",
    level: "ADAPTER",
    spec: [],
    title: "The adapter follows the kit's protocol (call types, settles)",
    basis: "Not a spec rule: the kit's protocol with the adapter (docs/conformance.md). A case where the adapter broke it says nothing reliable about the implementation.",
  },
  // Outside the spec: every failure of the response in a fixture that turns
  // error propagation off counts here instead of against its own check.
  {
    id: "disabledPropagation",
    level: "INFO",
    spec: [],
    title: "With error propagation off, an error nulls the position where it happened (graphql-js 17's @experimental_disableErrorPropagation)",
    basis:
      "Not a GraphQL rule: no release (October 2021, September 2025, September 2026) has execution without error propagation. §6.4.4 says: \"Since Non-Null response positions cannot be null, execution errors are propagated to be handled by the parent response position.\" Every failure of the noPropagation fixture's response (its data and errors) counts here, never against a spec section, and never fails the run. Turning propagation off doesn't change which resolvers run, so protocol problems and the checks on calls (callsOnce, callsSelected, callsReachable, mutationFieldsOnce, calledSerially) keep their own checks.",
  },
];
