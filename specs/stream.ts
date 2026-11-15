/*
 * GraphQL incremental delivery: @stream.
 *
 * Models `@stream` as graphql-js 17.1.0 implements it, in the response format
 * of the incremental delivery RFC (graphql/graphql-spec#1110). The RFC's
 * execution section doesn't specify `@stream` yet, so graphql-js is the
 * reference for execution. The schema and operation are fixed:
 *
 *   type Query { feed: Feed }
 *   type Feed  { title: String!   items: [Item] }   # or [Item!], per run
 *   type Item  { id: ID!   name: String! }
 *
 *   query {
 *     feed {
 *       title
 *       items @stream(initialCount: 1) { id name }
 *     }
 *   }
 *
 * `items` resolves to an async iterator. Each `next()` call yields an item,
 * ends the list, throws, or never settles, and the source yields at most
 * MAX_ITEMS items. Each item's `name` resolves asynchronously and may raise an
 * error, so items complete concurrently and out of order. graphql-js runs
 * with `enableEarlyExecution`, so the stream may pull and complete items
 * before the initial payload is sent.
 *
 * The client receives the initial payload `{ data, pending, hasNext }` holding
 * item 0, then `{ incremental: [{ id, items, errors }], completed, hasNext }`.
 * One payload may batch several items, and may also carry `completed`.
 *
 * Rules that make this hard:
 *
 * - An error in a nullable item `[Item]` nulls that item and the stream goes
 *   on. An error in a Non-Null item `[Item!]` would null the list, but the
 *   list was already delivered, so the stream ends with
 *   `completed: [{ id, errors }]` and nothing is retracted.
 * - Items complete in any order but must be delivered in source order.
 * - When an error nulls `feed` (a failed `title`) or the list itself (a failed
 *   Non-Null item 0), the stream is filtered: it's never announced and its
 *   iterator is closed with `return()`.
 * - The client may cancel by calling `return()` on the response stream. After
 *   that no payload is sent and the source's `return()` is called, even while
 *   a `next()` is still pending.
 */

type Idx = 0 | 1 | 2;
type ItemState = "none" | "running" | "ok" | "error";
type ErrorPath = "title" | "items" | "name0" | "name1" | "name2";
// One list entry the client holds: which source item it is, and its value.
type Entry = { item: number; value: "data" | "null" };

// The source yields at most this many items before it must end, throw or hang.
// `initialCount: 1`, so item 0 is in the initial payload and items 1 and 2
// are streamed.
const MAX_ITEMS = 3;

const ERROR_PATHS = new Set<ErrorPath>(["title", "items", "name0", "name1", "name2"]);
// The error path of `feed.items[i].name`.
const NAME_ERRORS: ErrorPath[] = ["name0", "name1", "name2"];

// ---------------------------------------------------------------------------
// Server state
// ---------------------------------------------------------------------------

// Whether the list's items are `Item!` rather than `Item`. Fixed per run.
let nonNullItems!: boolean;

let title: "running" | "value" | "error" = "running";

// The source iterator as the executor sees it: no call outstanding, a `next()`
// outstanding, a `next()` that will never settle, or finished.
let source: "idle" | "pulling" | "hung" | "done" | "threw" = "idle";
let yielded = 0;
// Whether the executor called `return()` on the source iterator.
let returned = false;

// The completion of each yielded item's sub-selection.
let item: Record<Idx, ItemState> = { 0: "none", 1: "none", 2: "none" };

// The stream record graphql-js creates once `initialCount` items were pulled
// (`handleStream`). It stops when it completes, fails, is filtered under a
// nulled parent, or is cancelled.
let stream: "none" | "running" | "stopped" = "none";

// ---------------------------------------------------------------------------
// What the client has received
// ---------------------------------------------------------------------------

let initialSent = false;
let hasNext = false;
let announced = false;
let completed: "none" | "ok" | "errors" = "none";
let cancelled = false;
let payloads = 0;

let feedData: "unset" | "object" | "null" = "unset";
let itemsData: "unset" | "list" | "null" = "unset";
let held: Entry[] = [];
// The path of every error the client received, in `errors`, in an
// incremental entry, or in `completed`. A list, so duplicates show.
let errors: ErrorPath[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const parentNulled = () => initialSent && (feedData === "null" || itemsData === "null");

// The executor has given up on the list: the client cancelled, the stream
// stopped, or the list's position was nulled.
const abandoned = () => cancelled || stream === "stopped" || parentNulled();

// Item `i` can be delivered: it completed, or it failed and is nullable.
const ready = (i: number) =>
  i < yielded && (item[i as Idx] === "ok" || (item[i as Idx] === "error" && !nonNullItems));

// The stream can be completed once the client holds `n` items: the source
// ended or threw and every yielded item was delivered, or item `n` is a
// Non-Null item that failed.
const canFinishAt = (n: number) =>
  (n === yielded && (source === "done" || source === "threw")) ||
  (n < yielded && nonNullItems && item[n as Idx] === "error");

const entryFor = (i: number): Entry => ({
  item: i,
  value: item[i as Idx] === "ok" ? "data" : "null",
});

// Item 0 completed, or the source ended or threw before yielding it.
const initialItemSettled = () =>
  yielded >= 1 ? item[0] !== "running" : source === "done" || source === "threw";

const received = (path: ErrorPath) => errors.some((e) => e === path);

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/** @fair */
export const resolveTitle = (outcome: "value" | "error") => {
  if (title !== "running") return;
  title = outcome;
};

// The executor calls `next()`: for the first `initialCount` items while
// building the initial payload, then from the stream record.
/** @fair */
export const pullNext = () => {
  if (source !== "idle" || returned || abandoned()) return;
  source = "pulling";
};

// The source settles an outstanding `next()`. It may answer "hang", which
// means it never settles. Fairness only says a pending `next()` doesn't stay
// unanswered without the source choosing to hang.
/** @fair */
export const sourceRespond = (outcome: "item" | "done" | "throw" | "hang") => {
  if (source !== "pulling" || returned) return;
  if (outcome === "item" && yielded >= MAX_ITEMS) return;
  if (outcome === "hang") {
    source = "hung";
  } else if (outcome === "done") {
    source = "done";
  } else if (outcome === "throw") {
    source = "threw";
  } else if (abandoned()) {
    // The executor checks whether it was stopped and drops the value.
    source = "idle";
  } else {
    source = "idle";
    item[yielded as Idx] = "running";
    yielded = yielded + 1;
    // At index === initialCount, graphql-js hands the iterator to a stream.
    if (stream === "none") stream = "running";
  }
};

// An item's `name` resolves or raises an error. Items abandoned by the
// executor are aborted and never complete.
/** @fair */
export const completeItem = (i: Idx, outcome: "ok" | "error") => {
  if (item[i] !== "running" || abandoned()) return;
  item[i] = outcome;
};

// The executor calls `return()` on an iterator it gave up on. graphql-js
// calls it concurrently with a pending `next()` once a stream exists, but
// while it still awaits the first `next()` it only notices the abort when
// that call settles. It also calls `return()` after the source threw.
/** @fair */
export const closeSource = () => {
  if (returned || !abandoned() || source === "done") return;
  if (stream === "none" && (source === "pulling" || source === "hung")) return;
  returned = true;
};

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

// The initial payload waits for `title` and the first item. A failed `title`
// nulls `feed` at once.
/** @fair */
export const sendInitial = () => {
  if (initialSent || title === "running") return;
  if (title === "value" && !initialItemSettled()) return;
  initialSent = true;
  payloads = payloads + 1;
  if (title === "error") {
    feedData = "null";
    errors.push("title");
  } else {
    feedData = "object";
    if (yielded === 0 && source === "threw") {
      // The iterator threw before the first item: the list is null.
      itemsData = "null";
      errors.push("items");
    } else if (yielded === 0) {
      itemsData = "list";
    } else if (item[0] === "error" && nonNullItems) {
      // A Non-Null item failed inside initialCount: the list is null.
      itemsData = "null";
      errors.push("name0");
    } else {
      itemsData = "list";
      held = [entryFor(0)];
      if (item[0] === "error") errors.push("name0");
    }
  }
  const live = feedData === "object" && itemsData === "list";
  // pending: [{ id: "0", path: ["feed", "items"] }], unless filtered.
  if (stream === "running" && live) announced = true;
  if (stream === "running" && !live) stream = "stopped";
  hasNext = stream === "running";
};

// One subsequent payload: `count` items starting at source index `first`,
// with `completed` if `finish`.
/** @fair */
export const sendSubsequent = (first: 0 | 1 | 2 | 3, count: 0 | 1 | 2, finish: boolean) => {
  if (!initialSent || stream !== "running") return;
  if (count === 0 && !finish) return;
  if (first !== held.length) return;
  if (count >= 1 && !ready(first)) return;
  if (count === 2 && !ready(first + 1)) return;
  if (finish && !canFinishAt(first + count)) return;
  payloads = payloads + 1;
  // incremental: [{ id: "0", items, errors }], errors of every item in it.
  if (count >= 1) {
    held = [...held, entryFor(first)];
    if (item[first as Idx] === "error") errors.push(NAME_ERRORS[first]);
  }
  if (count === 2) {
    held = [...held, entryFor(first + 1)];
    if (item[(first + 1) as Idx] === "error") errors.push(NAME_ERRORS[first + 1]);
  }
  if (finish) {
    stream = "stopped";
    if (first + count < yielded) {
      // completed: [{ id: "0", errors }] for the failed Non-Null item.
      completed = "errors";
      errors.push(NAME_ERRORS[first + count]);
    } else if (source === "threw") {
      // completed: [{ id: "0", errors }] for the iterator's error.
      completed = "errors";
      errors.push("items");
    } else {
      completed = "ok";
    }
  }
  hasNext = stream === "running";
};

// The client calls `return()` on the response stream.
export const cancel = () => {
  if (!initialSent || !hasNext || cancelled) return;
  cancelled = true;
  stream = "stopped";
};

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

// The client expects nothing more, or the source hung before the first item
// so the initial payload never comes. Cleanup may still be pending here; the
// liveness properties, not deadlock checking, say it happens.
/** @terminating */
export const responseOver = () =>
  (initialSent && (!hasNext || cancelled)) || (stream === "none" && source === "hung");

// The list the client holds is a prefix of the source's items, in source
// order, with no gaps and no duplicates. An entry is null exactly when that
// item's completion failed and items are nullable.
export const clientHoldsSourcePrefix = () =>
  held.every(
    (h, pos) =>
      h.item === pos &&
      pos < yielded &&
      (h.value === "null"
        ? item[pos as Idx] === "error" && !nonNullItems
        : item[pos as Idx] === "ok"),
  );

// Every error the client received is for something that failed.
export const errorsAreReal = () =>
  errors.every(
    (e) =>
      (e === "title" && title === "error") ||
      (e === "items" && source === "threw") ||
      (e === "name0" && item[0] === "error") ||
      (e === "name1" && item[1] === "error") ||
      (e === "name2" && item[2] === "error"),
  );

// No path has more than one error.
export const oneErrorPerPath = () =>
  ERROR_PATHS.values().every((p) => errors.filter((e) => e === p).length <= 1);

// Every null the client holds comes with an error that explains it.
export const nullsAreExplained = () =>
  (feedData !== "null" || received("title")) &&
  (itemsData !== "null" || received("items") || received("name0")) &&
  held.every((h, pos) => h.value !== "null" || received(NAME_ERRORS[pos]));

// The stream is announced in `pending` only under a list the client has.
export const announcedUnderLiveParent = () =>
  !announced || (feedData === "object" && itemsData === "list");

// `completed` only names an announced stream.
export const completedWereAnnounced = () => completed === "none" || announced;

// `hasNext` is true exactly while an announced stream is incomplete, unless
// the client cancelled.
export const hasNextIsHonest = () =>
  !initialSent || cancelled || hasNext === (announced && completed === "none");

// Nothing the client has seen changes: list entries are only appended.
/** @always */
export const nothingIsRetracted = (before: {
  held: Entry[];
  feedData: "unset" | "object" | "null";
  itemsData: "unset" | "list" | "null";
}) =>
  before.held.length <= held.length &&
  before.held.every((h, pos) => held[pos] === h) &&
  (before.feedData === "unset" || feedData === before.feedData) &&
  (before.itemsData === "unset" || itemsData === before.itemsData);

// No payload is sent after the client cancels or after `hasNext: false`.
/** @always */
export const nothingAfterTheEnd = (before: {
  initialSent: boolean;
  hasNext: boolean;
  cancelled: boolean;
  payloads: number;
}) => !(before.cancelled || (before.initialSent && !before.hasNext)) || payloads === before.payloads;

// The stream ends with `completed`, the client cancelled, or the source hung.
const streamSettled = () => completed !== "none" || cancelled || source === "hung";

// Every announced stream is eventually completed, unless the client cancels
// or the source never settles a `next()`.
/** @leadsTo streamSettled */
export const announcedStreamCompletes = () => announced;

// The source iterator finished on its own or was closed with `return()`.
const iteratorReleased = () => returned || source === "done" || source === "threw";

// Resource safety: an iterator the executor gives up on is eventually closed.
// Excluded: while graphql-js still awaits the first `next()`, it doesn't call
// `return()` until that call settles, and never if it hangs.
/** @leadsTo iteratorReleased */
export const abandonedIteratorIsClosed = () =>
  abandoned() && !(stream === "none" && (source === "pulling" || source === "hung"));
