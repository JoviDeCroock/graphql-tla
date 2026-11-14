/*
 * GraphQL incremental delivery: @defer.
 *
 * Models the incremental delivery RFC (graphql/graphql-spec#1110, the format
 * graphql-js 17 ships) for one fixed operation:
 *
 *   type Query   { me: User   stats: Int }
 *   type User    { id: ID!   profile: Profile! }
 *   type Profile { bio: String   avatar: String! }
 *
 *   query {
 *     me {
 *       id
 *       ... @defer(label: "Profile") {
 *         profile {
 *           bio
 *           ... @defer(label: "Avatar") { avatar }
 *         }
 *       }
 *     }
 *     ... @defer(label: "Stats") { stats }
 *   }
 *
 * The server sends an initial payload `{ data, pending, hasNext }` and then
 * subsequent payloads `{ incremental, completed, pending, hasNext }`. Deferred
 * fragments execute concurrently with the initial result and with each other,
 * and every resolver may succeed or raise an error.
 *
 * Two rules make this hard:
 *
 * - Data the client has seen can't be retracted. When a field error inside a
 *   deferred fragment would null a field that was already delivered, null
 *   propagation stops at the fragment: the server sends
 *   `completed: [{ id, errors }]` and none of the fragment's data.
 * - A fragment is announced in `pending` only once its parent object is in the
 *   client's data, so a fragment under a nulled parent is never announced and
 *   the stream doesn't wait for it.
 *
 * The client side is the merged result a client like urql or Relay would hold.
 */

type Field = "me" | "id" | "profile" | "bio" | "avatar" | "stats";
type Fragment = "Profile" | "Avatar" | "Stats";
type Outcome = "value" | "null" | "error";
type Slot = "unset" | "value" | "null";

const FIELDS = new Set<Field>(["me", "id", "profile", "bio", "avatar", "stats"]);
const FRAGMENTS = new Set<Fragment>(["Profile", "Avatar", "Stats"]);

const nonNull: Record<Field, boolean> = {
  me: false,
  id: true,
  profile: true,
  bio: false,
  avatar: true,
  stats: false,
};

// The object a fragment's fields are merged into ("root" is `data` itself).
const fragmentParent: Record<Fragment, Field | "root"> = {
  Profile: "me",
  Avatar: "profile",
  Stats: "root",
};

// The deferred fragment that delivers each field, or "initial".
const deliveredBy: Record<Field, Fragment | "initial"> = {
  me: "initial",
  id: "initial",
  profile: "Profile",
  bio: "Profile",
  avatar: "Avatar",
  stats: "Stats",
};

// ---------------------------------------------------------------------------
// Server state
// ---------------------------------------------------------------------------

// What each resolver produced. "none" until it ran.
let outcome: Record<Field, Outcome | "none"> = {
  me: "none",
  id: "none",
  profile: "none",
  bio: "none",
  avatar: "none",
  stats: "none",
};

// Whether a fragment's execution finished, and whether a field error inside it
// propagated past the fragment's boundary.
let result: Record<Fragment, "running" | "ok" | "failed"> = {
  Profile: "running",
  Avatar: "running",
  Stats: "running",
};

// ---------------------------------------------------------------------------
// The stream, as the client has received it
// ---------------------------------------------------------------------------

let initialSent = false;
let hasNext = false;
let announced = new Set<Fragment>();
let completed = new Set<Fragment>();
let completedWithErrors = new Set<Fragment>();

// The client's merged `data`, and the paths in the errors it has received.
let data: Record<Field, Slot> = {
  me: "unset",
  id: "unset",
  profile: "unset",
  bio: "unset",
  avatar: "unset",
  stats: "unset",
};
let errors = new Set<Field>();

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/** @fair */
export const executeInitial = (me: Outcome, id: "value" | "error") => {
  if (outcome.me !== "none") return;
  outcome.me = me;
  if (me === "value") outcome.id = id;
};

// A deferred fragment starts as soon as its parent object resolved, before the
// initial payload is sent and even if its parent is later nulled.
/** @fair */
export const executeProfile = (profile: "value" | "error", bio: "value" | "error") => {
  if (outcome.me !== "value" || result.Profile !== "running") return;
  outcome.profile = profile;
  if (profile === "value") outcome.bio = bio;
  // profile is Profile!, so its error propagates to `me`, outside the fragment.
  result.Profile = profile === "error" ? "failed" : "ok";
};

/** @fair */
export const executeAvatar = (avatar: "value" | "error") => {
  if (outcome.profile !== "value" || result.Avatar !== "running") return;
  outcome.avatar = avatar;
  // avatar is String! and profile is Profile!, so the error reaches `me`.
  result.Avatar = avatar === "error" ? "failed" : "ok";
};

/** @fair */
export const executeStats = (stats: "value" | "error") => {
  if (result.Stats !== "running") return;
  outcome.stats = stats;
  result.Stats = "ok";
};

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

const hasOutstanding = () => !announced.isSubsetOf(completed);

/** @fair */
export const sendInitial = () => {
  if (initialSent || outcome.me === "none") return;
  initialSent = true;
  if (outcome.me === "value" && outcome.id === "value") {
    data.me = "value";
    data.id = "value";
  } else {
    // A null `me`, a raised error, or an error in Non-Null `id` nulls `me`.
    data.me = "null";
    if (outcome.me === "error") errors.add("me");
    if (outcome.id === "error") errors.add("id");
  }
  announced.add("Stats");
  if (data.me === "value") announced.add("Profile");
  hasNext = hasOutstanding();
};

/** @fair */
export const sendSubsequent = (fragment: Fragment) => {
  if (!initialSent || !hasNext) return;
  if (!announced.has(fragment) || completed.has(fragment)) return;
  if (result[fragment] === "running") return;
  completed.add(fragment);
  if (result[fragment] === "failed") {
    // completed: [{ id, errors }], and no incremental data.
    completedWithErrors.add(fragment);
    if (fragment === "Profile") errors.add("profile");
    if (fragment === "Avatar") errors.add("avatar");
  } else {
    switch (fragment) {
      case "Profile":
        data.profile = "value";
        data.bio = outcome.bio === "value" ? "value" : "null";
        if (outcome.bio === "error") errors.add("bio");
        // The nested fragment's parent now exists, so announce it.
        announced.add("Avatar");
        break;
      case "Avatar":
        data.avatar = "value";
        break;
      case "Stats":
        data.stats = outcome.stats === "value" ? "value" : "null";
        if (outcome.stats === "error") errors.add("stats");
        break;
    }
  }
  hasNext = hasOutstanding();
};

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

const isClosed = () => initialSent && !hasNext;

/** @terminating */
export const streamClosed = () => isClosed();

// Every stream ends, with every announced fragment completed.
/** @eventually */
export const streamEventuallyCloses = () => isClosed();

// `hasNext: false` is only sent once nothing announced is outstanding.
export const hasNextIsHonest = () => !initialSent || hasNext === hasOutstanding();

// `completed` only names fragments announced in `pending`.
export const completedWereAnnounced = () => completed.isSubsetOf(announced);

// No fragment is dropped: when the stream closes, every fragment whose parent
// object reached the client has been completed.
export const noFragmentLeftBehind = () =>
  !isClosed() ||
  FRAGMENTS.values().every(
    (f) =>
      completed.has(f) ||
      (fragmentParent[f] !== "root" && data[fragmentParent[f] as Field] !== "value"),
  );

// A fragment is only announced under an object the client has.
export const announcedUnderLiveParent = () =>
  announced.values().every(
    (f) => fragmentParent[f] === "root" || data[fragmentParent[f] as Field] === "value",
  );

// Deferred fields only arrive with their own fragment, never in the initial
// payload, and never when their fragment failed.
export const fieldsArriveWithTheirFragment = () =>
  FIELDS.values().every(
    (f) =>
      data[f] === "unset" ||
      deliveredBy[f] === "initial" ||
      (completed.has(deliveredBy[f] as Fragment) &&
        !completedWithErrors.has(deliveredBy[f] as Fragment)),
  );

// The client never holds null in a Non-Null position.
export const nonNullNeverNull = () =>
  FIELDS.values().every((f) => !nonNull[f] || data[f] !== "null");

// Every null the client holds in a nullable position comes with an error,
// except a `me` resolver that returned null.
export const nullsAreExplained = () =>
  FIELDS.values().every(
    (f) => data[f] !== "null" || errors.size > 0 || (f === "me" && outcome.me === "null"),
  );

// Nothing the client has seen ever changes: no payload retracts data.
/** @always */
export const dataIsNeverRetracted = (before: { data: Record<Field, Slot> }) =>
  FIELDS.values().every((f) => before.data[f] === "unset" || data[f] === before.data[f]);

// Nothing is sent after `hasNext: false`.
/** @always */
export const nothingAfterClose = (before: {
  initialSent: boolean;
  hasNext: boolean;
  completed: Set<Fragment>;
}) => !(before.initialSent && !before.hasNext) || completed === before.completed;
