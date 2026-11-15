/*
 * GraphQL incremental delivery: @defer.
 *
 * A small-step model of the incremental delivery RFC (graphql/graphql-spec
 * PR 1110) as graphql-js 17.1.0 implements it (execution/incremental/*), for
 * one fixed schema and operation:
 *
 *   type Query   { version: String!   me: User   stats: Int! }
 *   type User    { id: ID!   name: String   profile: Profile! }
 *   type Profile { handle: String!   bio: String   avatar: String }
 *
 *   query {
 *     version
 *     me {
 *       id
 *       name
 *       ... @defer(label: "Profile") {
 *         name
 *         profile {
 *           handle
 *           bio
 *           ... @defer(label: "Avatar") { avatar }
 *         }
 *       }
 *     }
 *     ... @defer(label: "Stats") { stats }
 *   }
 *
 * Every resolver settles on its own step, and each one may return a value,
 * return null, or raise an error (the choices are narrowed per field below to
 * keep the state space small). The executor and the client are modeled
 * separately: the server builds results per execution unit (the initial result
 * and one execution group per deferred fragment), and the client holds the
 * merged `data`, the `errors` it has received with their paths, and the
 * `pending`, `completed` and `hasNext` it has seen.
 *
 * What makes it hard:
 *
 * - A deferred fragment runs concurrently with the initial result. If a field
 *   error inside it propagates up to the fragment's parent object, which the
 *   client already has, the fragment fails: `completed: [{ id, errors }]` and
 *   none of its data. Its nested fragments are dropped (graphql-js aborts the
 *   group's executor and removeGroup removes the child groups).
 * - If the initial result nulls a fragment's parent object, perhaps after the
 *   fragment started early, the fragment is filtered: graphql-js aborts it in
 *   getIncrementalWork and prunes its group, so it is never announced. A Non-Null
 *   root field can null `data` itself, and then nothing is announced.
 * - `@defer` is a hint (RFC, "Client Handling of @defer/@stream"): the server
 *   may inline any fragment. `honored` picks, per fragment, whether it was
 *   deferred. An inlined fragment's fields run and arrive with the enclosing
 *   result and null propagation crosses it like any other selection.
 * - `name` is selected both outside and inside Profile. BuildExecutionPlan
 *   runs it once, with the initial result, and Profile never re-sends it.
 * - `earlyExecution` is graphql-js's `enableEarlyExecution`. When false (the
 *   default), a fragment's execution group starts only once the payload that
 *   announces it is sent. When true, it may start as soon as its parent
 *   object exists.
 *
 * Choices where the RFC and graphql-js leave room:
 *
 * - When nothing is left pending after filtering (for example `data: null`),
 *   graphql-js sends a plain `{ data, errors }` result. The RFC requires
 *   `pending` to be non-empty in an initial incremental result, so it agrees.
 *   The model treats that as an initial payload with `hasNext: false`.
 * - graphql-js batches events into one payload. The model sends one
 *   fragment's completion per payload, which is one valid schedule of batching.
 *   A nested fragment is therefore announced in its parent's payload and
 *   completed in a later one.
 * - A failed fragment reports only the error that reached its boundary
 *   (graphql-js `GROUP_FAILURE`). Errors the group collected at nullable
 *   positions before that are discarded with its data.
 * - Once a position is nulled, graphql-js lets sibling resolvers under it run
 *   and discards their results. The model lets them settle as "dropped" on an
 *   unfair step, so no liveness depends on abandoned work. Inside a deferred
 *   group, a failure aborts the group's executor, so its resolvers stop.
 */

type Field = "version" | "me" | "id" | "name" | "profile" | "handle" | "bio" | "avatar" | "stats";
type Fragment = "Profile" | "Avatar" | "Stats";
// An execution unit: the initial result, or one deferred fragment.
type Unit = "initial" | Fragment;
type Pos = Field | "root";
type Outcome = "value" | "null" | "error";
// "dropped": the resolver ran under a nulled position and its result was discarded.
type Settled = Outcome | "none" | "dropped";
type Slot = "unset" | "value" | "null";
type Task = "idle" | "running" | "done" | "failed" | "cancelled";
type ErrorKind = "none" | "initial" | "incremental" | "completed";
// Payloads sent while `hasNext` can still be true: initial plus at most two.
type PayloadCount = 1 | 2 | 3;

const FIELDS = new Set<Field>(["version", "me", "id", "name", "profile", "handle", "bio", "avatar", "stats"]);
const FRAGMENTS = new Set<Fragment>(["Profile", "Avatar", "Stats"]);

const parentOf: Record<Field, Pos> = {
  version: "root",
  me: "root",
  id: "me",
  name: "me",
  profile: "me",
  handle: "profile",
  bio: "profile",
  avatar: "profile",
  stats: "root",
};

const nonNull: Record<Field, boolean> = {
  version: true,
  me: false,
  id: true,
  name: false,
  profile: true,
  handle: true,
  bio: false,
  avatar: false,
  stats: true,
};

// What each resolver may do in this model.
const choices: Record<Field, Set<Outcome>> = {
  version: new Set<Outcome>(["value", "error"]),
  me: new Set<Outcome>(["value", "null"]),
  id: new Set<Outcome>(["value", "error"]),
  name: new Set<Outcome>(["value"]),
  profile: new Set<Outcome>(["value"]),
  handle: new Set<Outcome>(["value", "error"]),
  bio: new Set<Outcome>(["value", "error"]),
  avatar: new Set<Outcome>(["value", "null"]),
  stats: new Set<Outcome>(["value", "error"]),
};

// Every place a field is selected: the fragment around each selection.
const selectedIn: Record<Field, Set<Unit>> = {
  version: new Set<Unit>(["initial"]),
  me: new Set<Unit>(["initial"]),
  id: new Set<Unit>(["initial"]),
  name: new Set<Unit>(["initial", "Profile"]),
  profile: new Set<Unit>(["Profile"]),
  handle: new Set<Unit>(["Profile"]),
  bio: new Set<Unit>(["Profile"]),
  avatar: new Set<Unit>(["Avatar"]),
  stats: new Set<Unit>(["Stats"]),
};

// The fragment a field runs with, after BuildExecutionPlan: a field also
// selected outside every @defer runs with the initial result
// (GetFilteredDeferUsageSet), so `name` runs once, non-deferred.
const plannedIn: Record<Field, Unit> = {
  version: "initial",
  me: "initial",
  id: "initial",
  name: "initial",
  profile: "Profile",
  handle: "Profile",
  bio: "Profile",
  avatar: "Avatar",
  stats: "Stats",
};

// The fragment syntactically around each fragment, and its parent object.
const enclosing: Record<Fragment, Unit> = { Profile: "initial", Avatar: "Profile", Stats: "initial" };
const fragmentParent: Record<Fragment, Pos> = { Profile: "me", Avatar: "profile", Stats: "root" };

// ---------------------------------------------------------------------------
// Server state
// ---------------------------------------------------------------------------

// Whether the server honored each @defer, or inlined it. Fixed per request.
let honored!: Record<Fragment, boolean>;
// graphql-js `enableEarlyExecution`.
let earlyExecution!: boolean;

let outcome: Record<Field, Settled> = {
  version: "none",
  me: "none",
  id: "none",
  name: "none",
  profile: "none",
  handle: "none",
  bio: "none",
  avatar: "none",
  stats: "none",
};

// Each deferred fragment's execution group. "failed": an error reached the
// fragment's boundary. "cancelled": filtered or aborted.
let task: Record<Fragment, Task> = { Profile: "idle", Avatar: "idle", Stats: "idle" };

// graphql-js CollectedErrors: positions nulled by a field error, paths of
// collected errors, and whether an error reached the root (`data: null`).
let nulledAt = new Set<Field>();
let collected = new Set<Field>();
let initialFailed = false;

// The work queue's root groups: fragments released as pending whose
// completion has not been sent.
let released = new Set<Fragment>();

// ---------------------------------------------------------------------------
// The stream, as the client has received it
// ---------------------------------------------------------------------------

let initialSent = false;
let hasNext = false;
let payloads = 0;
// `pending` notices received so far, and `completed` notices per fragment.
let pending = new Set<Fragment>();
let completions: Record<Fragment, number> = { Profile: 0, Avatar: 0, Stats: 0 };
let failedFragments = new Set<Fragment>();

// The client's merged `data` (`dataNull` is `"data": null`), how many
// payloads carried each field, and which unit's payload carried it.
let dataNull = false;
let data: Record<Field, Slot> = {
  version: "unset",
  me: "unset",
  id: "unset",
  name: "unset",
  profile: "unset",
  handle: "unset",
  bio: "unset",
  avatar: "unset",
  stats: "unset",
};
let deliveries: Record<Field, number> = {
  version: 0,
  me: 0,
  id: 0,
  name: 0,
  profile: 0,
  handle: 0,
  bio: 0,
  avatar: 0,
  stats: 0,
};
let deliveredWith: Record<Field, Unit | "none"> = {
  version: "none",
  me: "none",
  id: "none",
  name: "none",
  profile: "none",
  handle: "none",
  bio: "none",
  avatar: "none",
  stats: "none",
};

// Errors received, by path: how many, and where the last one appeared
// (initial `errors`, `incremental[].errors` or `completed[].errors`).
let errorCount: Record<Field, number> = {
  version: 0,
  me: 0,
  id: 0,
  name: 0,
  profile: 0,
  handle: 0,
  bio: 0,
  avatar: 0,
  stats: 0,
};
let errorKind: Record<Field, ErrorKind> = {
  version: "none",
  me: "none",
  id: "none",
  name: "none",
  profile: "none",
  handle: "none",
  bio: "none",
  avatar: "none",
  stats: "none",
};

// ---------------------------------------------------------------------------
// Execution units and null propagation
// ---------------------------------------------------------------------------

// The unit that executes and delivers a fragment's fields: the fragment if
// honored, otherwise whatever its enclosing fragment's fields go to.
// Fragments nest at most two deep here, so two steps always reach the answer.
const enclosingUnit = (g: Fragment): Unit =>
  enclosing[g] === "initial" ? "initial" : honored[enclosing[g] as Fragment] ? enclosing[g] : "initial";

const effectiveUnit = (u: Unit): Unit =>
  u === "initial" ? "initial" : honored[u as Fragment] ? u : enclosingUnit(u as Fragment);

const unitOf = (f: Field): Unit => effectiveUnit(plannedIn[f]);

// The unit whose result holds a fragment's parent object and creates its group.
const parentUnit = (g: Fragment): Unit => effectiveUnit(enclosing[g]);

const descendsFrom = (g: Fragment, h: Fragment) =>
  parentUnit(g) === h ? true : parentUnit(g) === "initial" ? false : parentUnit(parentUnit(g) as Fragment) === h;

const sameUnit = (p: Pos, f: Field) => (p === "root" ? false : unitOf(p as Field) === unitOf(f));

// A field error is a raised error, or null in a Non-Null position.
const raisedFieldError = (g: Field, o: Settled) => o === "error" || (o === "null" && nonNull[g]);

// §6.4.4, within one unit: the error nulls the nearest nullable position. If
// it would leave the unit, it reaches the boundary: `data: null` for the
// initial result, a failed fragment for a deferred one.
const catchPoint = (f: Field): Field | "boundary" =>
  !nonNull[f] ? f : sameUnit(parentOf[f], f) ? catchPoint(parentOf[f] as Field) : "boundary";

const unitFailed = (u: Unit) => (u === "initial" ? initialFailed : task[u as Fragment] === "failed");

// A field is part of its unit's result: every ancestor inside the unit
// resolved to an object that was not nulled.
const inResult = (f: Field, out: Record<Field, Settled>, nul: Set<Field>): boolean =>
  !sameUnit(parentOf[f], f)
    ? true
    : out[parentOf[f] as Field] === "value" && !nul.has(parentOf[f] as Field) && inResult(parentOf[f] as Field, out, nul);

// The resolver was called: its parent object resolved.
const invoked = (f: Field, out: Record<Field, Settled>) =>
  parentOf[f] === "root" ? true : out[parentOf[f] as Field] === "value";

const active = (f: Field) => inResult(f, outcome, nulledAt) && !unitFailed(unitOf(f));

// A unit's result is ready: it failed at its boundary (Promise.all rejects
// at once), or every field in the result settled.
const finished = (u: Unit, out: Record<Field, Settled>, nul: Set<Field>, failed: boolean) =>
  failed || FIELDS.values().every((f) => unitOf(f) !== u || !inResult(f, out, nul) || out[f] !== "none");

// A fragment's execution group exists once its parent object resolved.
const created = (g: Fragment) =>
  fragmentParent[g] === "root" ? true : outcome[fragmentParent[g] as Field] === "value";

const isRunning = (u: Unit) => (u === "initial" ? !initialSent : task[u as Fragment] === "running");

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

const settle = (f: Field, o: Outcome) => {
  const u = unitOf(f);
  const isError = raisedFieldError(f, o);
  const lands = catchPoint(f);
  const failsNow = isError && lands === "boundary";
  const next = { ...outcome, [f]: o };
  const nextNulled = isError && lands !== "boundary" ? nulledAt.union(new Set<Field>([lands as Field])) : nulledAt;
  const doneNow = u !== "initial" && finished(u, next, nextNulled, failsNow);
  // A group that fails aborts its executor, which aborts the groups it
  // created (graphql-js executeExecutionGroup: `this.abort()`).
  const nextTask = Object.fromEntries(
    FRAGMENTS.values().map((g) => [
      g,
      g === u
        ? failsNow
          ? "failed"
          : doneNow
            ? "done"
            : task[g]
        : failsNow && u !== "initial" && honored[g] && descendsFrom(g, u as Fragment)
          ? "cancelled"
          : task[g],
    ]),
  ) as Record<Fragment, Task>;
  outcome = next;
  nulledAt = nextNulled;
  if (isError) collected = collected.union(new Set<Field>([f]));
  if (failsNow && u === "initial") initialFailed = true;
  task = nextTask;
};

// A resolver of work the client is waiting for: the initial result, or a
// fragment that has been announced.
const awaited = (f: Field) =>
  outcome[f] === "none" &&
  isRunning(unitOf(f)) &&
  active(f) &&
  (unitOf(f) === "initial" ? true : released.has(unitOf(f) as Fragment));

// A resolver of a fragment that started early and hasn't been announced.
const speculative = (f: Field) =>
  outcome[f] === "none" &&
  unitOf(f) !== "initial" &&
  isRunning(unitOf(f)) &&
  active(f) &&
  !released.has(unitOf(f) as Fragment);

// An awaited resolver returns a value. Fairness sits on this step only: while
// the resolver is pending it stays enabled, so weak fairness forces the
// resolver to settle, through this step or resolveWithFailure.
/** @fair */
export const resolve = (f: Field) => {
  if (!awaited(f)) return;
  settle(f, "value");
};

// An awaited resolver returns null or raises an error.
export const resolveWithFailure = (f: Field, o: Outcome) => {
  if (o === "value" || !choices[f].has(o) || !awaited(f)) return;
  settle(f, o);
};

// Speculative work is never fair: the stream must end without it.
export const resolveEarly = (f: Field, o: Outcome) => {
  if (!choices[f].has(o) || !speculative(f)) return;
  settle(f, o);
};

// Resolvers of the initial result that were called but whose position has
// since been nulled. graphql-js lets them run and discards their results.
const abandoned = (f: Field) =>
  outcome[f] === "none" && unitOf(f) === "initial" && invoked(f, outcome) && !active(f);

// The abandoned resolvers finish, all in one step since their order is
// invisible. Not fair: nothing may wait for them.
export const abandonedResolversFinish = () => {
  if (initialSent || !FIELDS.values().some((f) => abandoned(f))) return;
  const next = Object.fromEntries(
    FIELDS.values().map((f) => [f, abandoned(f) ? "dropped" : outcome[f]]),
  ) as Record<Field, Settled>;
  outcome = next;
};

// A released fragment's group starts (graphql-js startTask on a root group).
/** @fair */
export const startTask = (g: Fragment) => {
  if (!released.has(g) || task[g] !== "idle" || !created(g)) return;
  task[g] = "running";
};

// With early execution, a group may start as soon as it is created. Not fair.
export const startEarly = (g: Fragment) => {
  if (!earlyExecution || released.has(g)) return;
  if (!honored[g] || task[g] !== "idle" || !created(g)) return;
  task[g] = "running";
};

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

// Field f is in the result unit u sends, if that result is sent at all.
const delivers = (f: Field, u: Unit) =>
  unitOf(f) === u && outcome[f] !== "none" && inResult(f, outcome, nulledAt);

const slotOf = (f: Field): Slot => (nulledAt.has(f) ? "null" : outcome[f] === "value" ? "value" : "null");

const mergedData = (u: Unit) =>
  Object.fromEntries(FIELDS.values().map((f) => [f, delivers(f, u) ? slotOf(f) : data[f]])) as Record<Field, Slot>;

// The errors a payload for unit u carries: every error the unit collected,
// or for a failed fragment only the one that reached its boundary.
const errorsFrom = (u: Unit, onlyBoundary: boolean) =>
  new Set<Field>(
    collected.values().filter((g) => unitOf(g) === u && (!onlyBoundary || catchPoint(g) === "boundary")),
  );

const presentIn = (p: Pos, d: Record<Field, Slot>, isNull: boolean) =>
  p === "root" ? !isNull : d[p as Field] === "value";

const childrenOf = (u: Unit) => new Set<Fragment>(FRAGMENTS.values().filter((g) => honored[g] && parentUnit(g) === u));

// Groups whose parent object didn't make it into the result are aborted and
// pruned, with everything nested in them (getIncrementalWork, pruneEmptyGroups).
const cancelUnder = (dropped: Set<Fragment>) =>
  Object.fromEntries(
    FRAGMENTS.values().map((g) => [
      g,
      honored[g] && (dropped.has(g) || dropped.values().some((h) => descendsFrom(g, h))) ? "cancelled" : task[g],
    ]),
  ) as Record<Fragment, Task>;

/** @fair */
export const sendInitial = () => {
  if (initialSent || !finished("initial", outcome, nulledAt, initialFailed)) return;
  const isNull = initialFailed;
  const newData = isNull ? data : mergedData("initial");
  const errs = errorsFrom("initial", false);
  const children = childrenOf("initial");
  const newGroups = new Set<Fragment>(children.values().filter((g) => presentIn(fragmentParent[g], newData, isNull)));
  const nextTask = cancelUnder(children.difference(newGroups));
  const nextDeliveries = Object.fromEntries(
    FIELDS.values().map((f) => [f, deliveries[f] + (!isNull && delivers(f, "initial") ? 1 : 0)]),
  ) as Record<Field, number>;
  const nextDeliveredWith = Object.fromEntries(
    FIELDS.values().map((f) => [f, !isNull && delivers(f, "initial") ? "initial" : deliveredWith[f]]),
  ) as Record<Field, Unit | "none">;
  const nextErrorCount = Object.fromEntries(
    FIELDS.values().map((g) => [g, errorCount[g] + (errs.has(g) ? 1 : 0)]),
  ) as Record<Field, number>;
  const nextErrorKind = Object.fromEntries(
    FIELDS.values().map((g) => [g, errs.has(g) ? "initial" : errorKind[g]]),
  ) as Record<Field, ErrorKind>;
  initialSent = true;
  payloads = 1;
  dataNull = isNull;
  data = newData;
  deliveries = nextDeliveries;
  deliveredWith = nextDeliveredWith;
  errorCount = nextErrorCount;
  errorKind = nextErrorKind;
  task = nextTask;
  released = newGroups;
  pending = pending.union(newGroups);
  hasNext = newGroups.size > 0;
};

/** @fair */
export const sendSubsequent = (g: Fragment) => {
  if (!released.has(g)) return;
  if (task[g] !== "done" && task[g] !== "failed") return;
  const failed = task[g] === "failed";
  const newData = failed ? data : mergedData(g);
  const errs = errorsFrom(g, failed);
  const kind: ErrorKind = failed ? "completed" : "incremental";
  const children = failed ? new Set<Fragment>() : childrenOf(g);
  const newGroups = new Set<Fragment>(children.values().filter((h) => presentIn(fragmentParent[h], newData, false)));
  const nextTask = cancelUnder(children.difference(newGroups));
  const stillReleased = released.difference(new Set<Fragment>([g])).union(newGroups);
  const nextDeliveries = Object.fromEntries(
    FIELDS.values().map((f) => [f, deliveries[f] + (!failed && delivers(f, g) ? 1 : 0)]),
  ) as Record<Field, number>;
  const nextDeliveredWith = Object.fromEntries(
    FIELDS.values().map((f) => [f, !failed && delivers(f, g) ? g : deliveredWith[f]]),
  ) as Record<Field, Unit | "none">;
  const nextErrorCount = Object.fromEntries(
    FIELDS.values().map((e) => [e, errorCount[e] + (errs.has(e) ? 1 : 0)]),
  ) as Record<Field, number>;
  const nextErrorKind = Object.fromEntries(
    FIELDS.values().map((e) => [e, errs.has(e) ? kind : errorKind[e]]),
  ) as Record<Field, ErrorKind>;
  payloads = payloads + 1;
  data = newData;
  deliveries = nextDeliveries;
  deliveredWith = nextDeliveredWith;
  errorCount = nextErrorCount;
  errorKind = nextErrorKind;
  completions[g] = completions[g] + 1;
  if (failed) failedFragments = failedFragments.union(new Set<Fragment>([g]));
  task = nextTask;
  released = stillReleased;
  pending = newGroups.union(pending);
  hasNext = stillReleased.size > 0;
};

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

// No @terminating predicate: deadlock checking is off, and a stuck stream
// instead violates streamEventuallyCloses, which only fair work can satisfy.
/** @noDeadlock */
const isClosed = () => initialSent && !hasNext;

// The client has an object at p (the root is `data`).
const present = (p: Pos) => (p === "root" ? initialSent && !dataNull : data[p as Field] === "value");

// The unit's payload reached the client and wasn't a failure.
const deliveredOk = (u: Unit) =>
  u === "initial" ? initialSent && !dataNull : completions[u as Fragment] > 0 && !failedFragments.has(u as Fragment);

// The resolver really failed, read from the schema and resolver outcomes.
const resolverFailed = (f: Field) => outcome[f] === "error" || (nonNull[f] && outcome[f] === "null");

// Where a field error at f lands by §6.4.4, ignoring fragment boundaries.
const nearestNullable = (f: Field): Pos =>
  !nonNull[f] ? f : parentOf[f] === "root" ? "root" : nearestNullable(parentOf[f] as Field);

const landsOn = Object.fromEntries(FIELDS.values().map((f) => [f, nearestNullable(f)])) as Record<Field, Pos>;

// Some error the client received propagates to exactly p.
const explained = (p: Pos) => FIELDS.values().some((g) => errorCount[g] > 0 && landsOn[g] === p);

// The error's propagation leaves fragment g: it lands on g's parent object or above.
const crossesBoundary = (e: Field, g: Fragment) =>
  landsOn[e] === "root" ? true : unitOf(landsOn[e] as Field) !== g;

// A field is only ever set under an object the client has.
export const fieldsOnlyUnderLiveParents = () =>
  FIELDS.values().every((f) => data[f] === "unset" || present(parentOf[f]));

// The client never holds null in a Non-Null position.
export const nonNullNeverNull = () => FIELDS.values().every((f) => !nonNull[f] || data[f] !== "null");

// A delivered result is whole: every field of it under an object the client
// has arrived with it.
export const deliveredResultsAreComplete = () =>
  FIELDS.values().every((f) => !deliveredOk(unitOf(f)) || !present(parentOf[f]) || data[f] !== "unset");

// A field arrives inline with the payload of the nearest deferred fragment
// around it (the initial payload if none), and that fragment succeeded.
export const fieldsArriveWithTheirFragment = () =>
  FIELDS.values().every(
    (f) => data[f] === "unset" || (deliveredWith[f] === unitOf(f) && deliveredOk(unitOf(f))),
  );

// No field is sent twice, even when selected inside and outside a fragment.
export const fieldsArriveOnce = () => FIELDS.values().every((f) => deliveries[f] <= 1);

// A `pending` notice means the fragment's data comes later: none of its
// fields arrives before its completion. So a fragment whose fields were
// inlined is never announced.
export const announcedFragmentsArriveLater = () =>
  pending.values().every(
    (g) => completions[g] > 0 || FIELDS.values().every((f) => plannedIn[f] !== g || data[f] === "unset"),
  );

// `completed` only names fragments announced in `pending`.
export const completedWereAnnounced = () =>
  FRAGMENTS.values().every((g) => completions[g] === 0 || pending.has(g));

// Each fragment is completed at most once.
export const completedAtMostOnce = () => FRAGMENTS.values().every((g) => completions[g] <= 1);

// With `data: null`, nothing is pending and the stream is over.
export const nullDataAnnouncesNothing = () => !dataNull || (pending.size === 0 && !hasNext);

// Every error path the client received is a resolver that really failed.
export const errorsAreReal = () => FIELDS.values().every((f) => errorCount[f] === 0 || resolverFailed(f));

// No path is reported twice.
export const errorsAtMostOncePerPath = () => FIELDS.values().every((f) => errorCount[f] <= 1);

// Every null the client holds, and `data: null`, comes from a resolver that
// returned null there or from a received error whose propagation lands there.
export const nullsAreExplained = () =>
  (!dataNull || explained("root")) &&
  FIELDS.values().every((f) => data[f] !== "null" || outcome[f] === "null" || explained(f));

// `completed[].errors` holds exactly errors that propagated out of their
// fragment, and every failed fragment has one.
export const failuresAreExplained = () =>
  FIELDS.values().every(
    (e) =>
      errorKind[e] !== "completed" ||
      (unitOf(e) !== "initial" &&
        failedFragments.has(unitOf(e) as Fragment) &&
        crossesBoundary(e, unitOf(e) as Fragment)),
  ) &&
  failedFragments.values().every((g) =>
    FIELDS.values().some((e) => errorKind[e] === "completed" && unitOf(e) === g),
  );

// Without early execution, no resolver of a deferred fragment runs before
// the client has been told the fragment is pending.
export const lateExecutionWaitsForPending = () =>
  earlyExecution ||
  FIELDS.values().every(
    (f) => outcome[f] === "none" || unitOf(f) === "initial" || pending.has(unitOf(f) as Fragment),
  );

// No deferred work keeps running once its parent fragment failed or was
// cancelled, or once the initial payload left out its parent object.
export const noOrphanedWork = () =>
  FRAGMENTS.values().every(
    (g) =>
      task[g] !== "running" ||
      (parentUnit(g) === "initial"
        ? !initialSent || present(fragmentParent[g])
        : task[parentUnit(g) as Fragment] === "running" || task[parentUnit(g) as Fragment] === "done"),
  );

// Data the client has seen never changes.
/** @always */
export const dataIsNeverRetracted = (before: { data: Record<Field, Slot>; dataNull: boolean }) =>
  (!before.dataNull || dataNull) &&
  FIELDS.values().every((f) => before.data[f] === "unset" || data[f] === before.data[f]);

// Nothing the client sees changes after `hasNext: false`.
/** @always */
export const nothingChangesAfterClose = (before: {
  initialSent: boolean;
  hasNext: boolean;
  payloads: number;
  data: Record<Field, Slot>;
  dataNull: boolean;
  errorCount: Record<Field, number>;
  pending: Set<Fragment>;
  completions: Record<Fragment, number>;
}) =>
  !(before.initialSent && !before.hasNext) ||
  (hasNext === before.hasNext &&
    payloads === before.payloads &&
    data === before.data &&
    dataNull === before.dataNull &&
    errorCount === before.errorCount &&
    pending === before.pending &&
    completions === before.completions);

// Every stream ends, and every fragment it announced was completed.
/** @eventually */
export const streamEventuallyCloses = () => isClosed() && pending.values().every((g) => completions[g] > 0);

const sentMoreThan = (n: PayloadCount) => payloads > n;

// `hasNext: true` is always followed by another payload.
/** @leadsTo sentMoreThan */
export const hasNextLeadsToAnotherPayload = (n: PayloadCount) => initialSent && hasNext && payloads === n;
