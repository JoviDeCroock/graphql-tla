/*
 * GraphQL mutation execution: root fields run serially.
 *
 * Models GraphQL spec §6.2.2 (Mutation), §6.3.4 (Normal and Serial Execution)
 * and §6.4.4 (Handling Execution Errors). A mutation's root fields have side
 * effects, so the executor must finish each root field, including its
 * sub-selection, before it starts the next one, in document order:
 *
 *   type Mutation { likePost: LikePayload }    (nullable or Non-Null, see below)
 *   type LikePayload { likes: Int! }
 *
 *   mutation {
 *     first: likePost { likes }
 *     second: likePost { likes }
 *     third: likePost { likes }
 *   }
 *
 * Each `likePost` reads the like counter and writes it back plus one, or
 * raises an error and writes nothing. Then its sub-selection resolves `likes`,
 * which may also fail. A failure in Non-Null `likes` nulls the root field.
 *
 * The nullability of each root field is chosen nondeterministically, so the
 * checker covers every schema from all-nullable to all-Non-Null. When a
 * Non-Null root field fails, null propagates to `data` itself. Root fields not
 * yet executed MAY then be skipped: the spec allows it and does not require
 * it. graphql-js 16 and 17 skip them (executeFieldsSerially chains the root
 * fields with promiseReduce, and a rejected field skips the rest of the
 * chain). `stopsAfterNullRoot` chooses either behavior.
 *
 * The steps of different root fields may interleave freely, so the checker
 * finds any schedule where one mutation observes another's partial work. Set
 * SERIAL to false to run the root fields in parallel, as a query would.
 */

type RootField = "first" | "second" | "third";

const SERIAL = true;

const ROOT_FIELDS = new Set<RootField>(["first", "second", "third"]);

// Document order: the root fields that come before each one.
const before: Record<RootField, Set<RootField>> = {
  first: new Set<RootField>(),
  second: new Set<RootField>(["first"]),
  third: new Set<RootField>(["first", "second"]),
};

// The root fields that come after each one in document order.
const after: Record<RootField, Set<RootField>> = {
  first: new Set<RootField>(["second", "third"]),
  second: new Set<RootField>(["third"]),
  third: new Set<RootField>(),
};

// ---------------------------------------------------------------------------
// Schema and executor choices, fixed for a whole behavior
// ---------------------------------------------------------------------------

// Whether each root field's type is LikePayload! rather than LikePayload.
let nonNull!: Record<RootField, boolean>;

// Whether the executor skips the remaining root fields once `data` is null.
let stopsAfterNullRoot!: boolean;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// The server-side state that the mutations change.
let likeCount = 0;

// A root field is "read" after its resolver read the counter, "written" after
// it wrote, and "done" once its sub-selection completed or it failed.
let phase: Record<RootField, "idle" | "read" | "written" | "done"> = {
  first: "idle",
  second: "idle",
  third: "idle",
};

// The counter value each resolver read.
let observed: Record<RootField, number> = { first: 0, second: 0, third: 0 };

// The root fields whose side effect (the write) happened.
let effected = new Set<RootField>();

// The root fields whose response position is a field error: the resolver
// raised, or `likes` failed and nulled the field.
let failed = new Set<RootField>();

// The `likes` each root field returns in the response, and `{ "data": null }`.
let likes: Record<RootField, number> = { first: 0, second: 0, third: 0 };
let dataIsNull = false;

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

// A field error at a root field nulls the field, or `data` if it's Non-Null.
const failRootField = (field: RootField) => {
  failed.add(field);
  if (nonNull[field]) dataIsNull = true;
};

// The serial executor starts a root field once every earlier one is done. If
// it stops after a null `data`, it skips the rest of the chain once an earlier
// Non-Null root field failed.
export const beginResolver = (field: RootField) => {
  if (phase[field] !== "idle") return;
  if (SERIAL && !before[field].values().every((f) => phase[f] === "done")) return;
  if (stopsAfterNullRoot && before[field].values().some((f) => nonNull[f] && failed.has(f))) return;
  observed[field] = likeCount;
  phase[field] = "read";
};

export const writeEffect = (field: RootField, raises: boolean) => {
  if (phase[field] !== "read") return;
  if (raises) {
    failRootField(field);
    phase[field] = "done";
  } else {
    likeCount = observed[field] + 1;
    effected.add(field);
    phase[field] = "written";
  }
};

// The sub-selection { likes } resolves against the state after the effect.
// `likes` is Int!, so its failure nulls the root field.
export const completeSelection = (field: RootField, likesFails: boolean) => {
  if (phase[field] !== "written") return;
  if (likesFails) {
    failRootField(field);
  } else {
    likes[field] = likeCount;
  }
  phase[field] = "done";
};

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

const nonNullRootFailed = () => ROOT_FIELDS.values().some((f) => nonNull[f] && failed.has(f));

// A root field never runs because the executor stopped after `data` was nulled.
const isSkipped = (field: RootField) =>
  phase[field] === "idle" &&
  stopsAfterNullRoot &&
  before[field].values().some((f) => nonNull[f] && failed.has(f));

/** @terminating */
export const isFinished = () =>
  ROOT_FIELDS.values().every((f) => phase[f] === "done" || isSkipped(f));

// No like is lost: the counter equals the number of mutations whose side
// effect happened, whichever ran.
export const noLostUpdates = () => likeCount === effected.size;

// Each payload reflects exactly the effects of the root fields before it in
// document order, plus its own: the response reads like the mutations ran one
// after another.
export const responseIsSerial = () =>
  ROOT_FIELDS.values().every(
    (f) =>
      phase[f] !== "done" ||
      failed.has(f) ||
      likes[f] === before[f].intersection(effected).size + 1,
  );

// Side effects happen in document order: no root field writes after a root
// field later in the document has written.
/** @always */
export const effectsInDocumentOrder = (previous: { effected: Set<RootField> }) =>
  effected
    .difference(previous.effected)
    .values()
    .every((f) => after[f].isDisjointFrom(previous.effected));

// §6.4.4: `data` is null exactly when a Non-Null root field failed.
export const dataNullIffNonNullRootFailed = () => dataIsNull === nonNullRootFailed();

// When the executor stops after a null `data`, no root field begins once
// `data` was nulled.
/** @always */
export const nothingBeginsAfterDataNulled = (previous: {
  dataIsNull: boolean;
  phase: Record<RootField, "idle" | "read" | "written" | "done">;
}) =>
  !stopsAfterNullRoot ||
  !previous.dataIsNull ||
  ROOT_FIELDS.values().every((f) => previous.phase[f] !== "idle" || phase[f] === "idle");
