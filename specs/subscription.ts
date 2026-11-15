/*
 * GraphQL subscription execution: a source stream mapped to a response stream.
 *
 * Models GraphQL spec §6.2.3 (Subscription): CreateSourceEventStream,
 * MapSourceToResponseEvent, ExecuteSubscriptionEvent and Unsubscribe, the way
 * graphql-js 17 implements them (`subscribe`, `mapSourceToResponseEvent`,
 * `mapAsyncIterable` and `withConcurrentAbruptClose`) for one operation:
 *
 *   type Subscription { postLiked: Post! }
 *   type Post { likes: Int!   title: String }
 *
 *   subscription { postLiked { likes title } }
 *
 * The subscribe resolver either returns a source stream or raises an error,
 * which is a request error: `{ errors }` with no `data` and no stream.
 *
 * The source produces up to three events, buffered until the executor pulls
 * them, and then may end or throw. The client consumes the response stream
 * with `for await`, and may unsubscribe (call `return()`) at any time. The
 * source and the client are not fair: either may go quiet forever.
 *
 * mapAsyncIterable is an async generator (`for await (const e of source)
 * yield await execute(e)`), so it pulls the next source event only after the
 * previous event's response was yielded: event executions never overlap.
 * Each event runs ExecuteSubscriptionEvent, where a field error nulls `title`,
 * or, through Non-Null `likes` and `postLiked`, `data` itself. Either way the
 * response is delivered and the stream continues.
 *
 * When the source throws, the error is rethrown to the client and the
 * response stream ends. When the client unsubscribes, withConcurrentAbruptClose
 * calls the source's return() at once, even if the generator is parked on
 * source.next(). The generator's own return() is queued behind an in-flight
 * event, so that event's response is still delivered, before return()
 * resolves. Nothing is delivered after that.
 */

type Event = 1 | 2 | 3;
type Outcome = "value" | "error";

const EVENTS = new Set<Event>([1, 2, 3]);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// What subscribe() returned: a response stream, or an ExecutionResult with
// errors and no `data`, or (only in a mutant) `{ data: null, errors }`.
let subscribeResult: "pending" | "stream" | "requestError" | "dataNull" = "pending";

// Whether the subscribe resolver raised instead of returning a source stream.
let resolverRaised = false;

// The source stream: how many events it produced, whether it ended or threw
// after them, and whether its return() was called.
let arrived = 0;
let source: "open" | "ended" | "threw" = "open";
let sourceReturned = false;

// The executor: how many events it pulled from the source, and the ones it is
// executing.
let pulled = 0;
let executing = new Set<number>();

// What each event's resolvers did: `postLiked` (Post!), `likes` (Int!) and
// `title` (String). "none" for a field that never ran.
let outcome: Record<
  Event,
  { postLiked: Outcome | "none"; likes: Outcome | "none"; title: Outcome | "none" }
> = {
  1: { postLiked: "none", likes: "none", title: "none" },
  2: { postLiked: "none", likes: "none", title: "none" },
  3: { postLiked: "none", likes: "none", title: "none" },
};

// The response each event produced.
let response: Record<Event, "none" | "object" | "titleNull" | "dataNull"> = {
  1: "none",
  2: "none",
  3: "none",
};

// What the client received, in order: the event behind each response, whether
// its next() rejected with the source's error, and whether the stream closed.
let delivered: number[] = [];
let rethrown = false;
let closed: "open" | "done" | "error" = "open";

// Whether the client called return(), and how many events had been pulled then.
let returnRequested = false;
let pulledAtUnsubscribe = 0;

// ---------------------------------------------------------------------------
// CreateSourceEventStream
// ---------------------------------------------------------------------------

/** @fair */
export const createSourceEventStream = (raises: boolean) => {
  if (subscribeResult !== "pending") return;
  if (raises) {
    resolverRaised = true;
    subscribeResult = "requestError";
  } else {
    subscribeResult = "stream";
  }
};

// ---------------------------------------------------------------------------
// The source stream (not fair: it may stop producing at any point)
// ---------------------------------------------------------------------------

export const sourceEmits = () => {
  if (subscribeResult !== "stream" || source !== "open" || sourceReturned) return;
  if (arrived >= 3) return;
  arrived += 1;
};

export const sourceFinishes = (how: "ended" | "threw") => {
  if (subscribeResult !== "stream" || source !== "open" || sourceReturned) return;
  source = how;
};

// ---------------------------------------------------------------------------
// MapSourceToResponseEvent (mapAsyncIterable)
// ---------------------------------------------------------------------------

// `for await (const event of source)` takes the next buffered event.
/** @fair */
export const pullEvent = () => {
  if (closed !== "open" || returnRequested) return;
  // `yield await result`: the previous response must have been yielded.
  if (executing.size > 0) return;
  if (pulled >= arrived) return;
  pulled += 1;
  executing.add(pulled);
};

// ExecuteSubscriptionEvent: run the selection set with the event as root
// value, and yield the response. The client's pending next() resolves with it.
/** @fair */
export const executeEvent = (k: Event, postLiked: Outcome, likes: Outcome, title: Outcome) => {
  if (!executing.has(k)) return;
  // `likes` and `title` never run when `postLiked` raised.
  if (postLiked === "error" && (likes !== "value" || title !== "value")) return;
  executing.delete(k);
  if (postLiked === "error") {
    outcome[k] = { postLiked: "error", likes: "none", title: "none" };
  } else {
    outcome[k] = { postLiked: "value", likes: likes, title: title };
  }
  // A field error in Non-Null `likes` or `postLiked` propagates to `data`.
  if (postLiked === "error" || likes === "error") {
    response[k] = "dataNull";
  } else if (title === "error") {
    response[k] = "titleNull";
  } else {
    response[k] = "object";
  }
  delivered.push(k);
};

// The source has nothing more: its next() resolved `done` or rejected. The
// generator returns, or rethrows the source's error to the client.
/** @fair */
export const reachEndOfSource = () => {
  if (closed !== "open" || rethrown || returnRequested) return;
  if (source === "open") return;
  if (pulled < arrived) return; // events still buffered
  if (executing.size > 0) return;
  if (source === "threw") {
    rethrown = true;
    closed = "error";
  } else {
    closed = "done";
  }
};

// ---------------------------------------------------------------------------
// Unsubscribe
// ---------------------------------------------------------------------------

// The client calls return() on the response stream (not fair).
export const unsubscribe = () => {
  if (subscribeResult !== "stream" || closed !== "open" || returnRequested) return;
  returnRequested = true;
  pulledAtUnsubscribe = pulled;
};

// withConcurrentAbruptClose calls the source's return() right away.
/** @fair */
export const returnSource = () => {
  if (!returnRequested || sourceReturned) return;
  sourceReturned = true;
};

// The generator's return() is queued behind the in-flight next(), so return()
// resolves `done` only after the in-flight event's response was yielded.
/** @fair */
export const finishReturn = () => {
  if (!returnRequested || !sourceReturned || closed !== "open") return;
  if (executing.size > 0) return; // generator.return() waits for the in-flight next()
  closed = "done";
};

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

/** @terminating */
export const isOver = () =>
  subscribeResult === "requestError" || (closed !== "open" && (sourceReturned || !returnRequested));

// §6.2.3.1: a subscribe resolver that raises is a request error: `{ errors }`
// with no `data`, and no event is ever executed.
export const creationFailureIsRequestError = () =>
  !resolverRaised || (subscribeResult === "requestError" && delivered.length === 0);

// Each response is the one ExecuteSubscriptionEvent defines for the event's
// resolver outcomes: `data` is null exactly when Non-Null `postLiked` or
// `likes` failed, and otherwise a `title` error nulls only `title`.
export const responseMatchesOutcome = () =>
  EVENTS.values().every(
    (k) =>
      response[k] === "none" ||
      (response[k] === "dataNull") ===
        (outcome[k].postLiked === "error" || outcome[k].likes === "error") &&
        (response[k] !== "titleNull" || outcome[k].title === "error"),
  );

// Responses come out in source-event order: the i-th response is for the i-th
// event, with none skipped or repeated.
export const responsesInSourceOrder = () => delivered.every((k, i) => k === i + 1);

// The stream closes only because the source ended or threw, or the client
// unsubscribed: field errors, including `data: null`, never end it.
export const closesOnlyForCause = () =>
  closed === "open" || source !== "open" || returnRequested;

// A source error reaches the client: the stream ends with an error, not a
// clean `done`, unless the client unsubscribed first.
export const sourceErrorIsRethrown = () =>
  closed !== "done" || source !== "threw" || returnRequested;

// After the client unsubscribes, the only response it can still receive is
// for the event that was already in flight.
export const nothingNewAfterUnsubscribe = () =>
  !returnRequested || delivered.every((k) => k <= pulledAtUnsubscribe);

// Nothing reaches the client after the stream closed.
/** @always */
export const nothingAfterClose = (previous: {
  closed: "open" | "done" | "error";
  delivered: number[];
  rethrown: boolean;
}) => previous.closed === "open" || (delivered === previous.delivered && rethrown === previous.rethrown);

// Liveness: every event the source produced eventually yields a response,
// unless the client unsubscribed before the executor pulled it.
const isAnswered = (k: Event) =>
  delivered.includes(k) || (returnRequested && pulledAtUnsubscribe < k);

/** @leadsTo isAnswered */
export const everyEventIsAnswered = (k: Event) => arrived >= k;

// Liveness: once the source ends or throws, the response stream completes.
const isClosed = () => closed !== "open";

/** @leadsTo isClosed */
export const completesOnceSourceEnds = () => source !== "open";

// Liveness: after the client unsubscribes, the source's return() is called,
// even if no further source event ever arrives.
const isSourceReturned = () => sourceReturned;

/** @leadsTo isSourceReturned */
export const sourceIsCleanedUp = () => returnRequested;
