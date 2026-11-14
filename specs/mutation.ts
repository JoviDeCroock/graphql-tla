/*
 * GraphQL mutation execution: root fields run serially.
 *
 * Models GraphQL spec §6.2.2 (Mutation) and §6.3.1 (Normal and Serial
 * Execution). A mutation's root fields have side effects, so the executor must
 * finish each root field, including its sub-selection, before it starts the
 * next one, in document order:
 *
 *   type Mutation { likePost: LikePayload }
 *   type LikePayload { likes: Int! }
 *
 *   mutation {
 *     first: likePost { likes }
 *     second: likePost { likes }
 *     third: likePost { likes }
 *   }
 *
 * Each `likePost` reads the like counter, writes it back plus one (or raises
 * an error and writes nothing), and then its sub-selection reads `likes`. The
 * steps interleave freely, so the checker finds any schedule where one
 * mutation observes another's partial work. Set SERIAL to false to run the
 * root fields in parallel, as a query would, and watch the invariants break.
 */

type RootField = "first" | "second" | "third";

const SERIAL = true;

const ROOT_FIELDS = new Set<RootField>(["first", "second", "third"]);

// Document order: the root fields that must finish before each one starts.
const before: Record<RootField, Set<RootField>> = {
  first: new Set<RootField>(),
  second: new Set<RootField>(["first"]),
  third: new Set<RootField>(["first", "second"]),
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// The server-side state that the mutations change.
let likeCount = 0;

let phase: Record<RootField, "idle" | "read" | "written" | "done"> = {
  first: "idle",
  second: "idle",
  third: "idle",
};

// The counter value each resolver read, and whether it raised an error.
let observed: Record<RootField, number> = { first: 0, second: 0, third: 0 };
let failed = new Set<RootField>();

// The `likes` each root field returns in the response.
let likes: Record<RootField, number> = { first: 0, second: 0, third: 0 };

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

export const beginResolver = (field: RootField) => {
  if (phase[field] !== "idle") return;
  if (SERIAL && !before[field].values().every((f) => phase[f] === "done")) return;
  observed[field] = likeCount;
  phase[field] = "read";
};

export const writeEffect = (field: RootField, raises: boolean) => {
  if (phase[field] !== "read") return;
  if (raises) {
    failed.add(field);
  } else {
    likeCount = observed[field] + 1;
  }
  phase[field] = "written";
};

// The sub-selection { likes } resolves against the state after the effect.
export const completeSelection = (field: RootField) => {
  if (phase[field] !== "written") return;
  if (!failed.has(field)) likes[field] = likeCount;
  phase[field] = "done";
};

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

const succeededBefore = (field: RootField) =>
  before[field].difference(failed).size;

/** @terminating */
export const isFinished = () => ROOT_FIELDS.values().every((f) => phase[f] === "done");

// At most one root field is between its first read and its completion.
export const oneAtATime = () =>
  ROOT_FIELDS.values().every((a) =>
    ROOT_FIELDS.values().every(
      (b) => a === b || phase[a] === "idle" || phase[a] === "done" || phase[b] === "idle" || phase[b] === "done",
    ),
  );

// No like is lost: the counter equals the number of mutations that succeeded.
export const noLostUpdates = () =>
  !isFinished() || likeCount === ROOT_FIELDS.difference(failed).size;

// Each payload reflects exactly the mutations before it in document order,
// plus itself: the response reads like the mutations ran one after another.
export const responseIsSerial = () =>
  !isFinished() ||
  ROOT_FIELDS.values().every((f) => failed.has(f) || likes[f] === succeededBefore(f) + 1);
