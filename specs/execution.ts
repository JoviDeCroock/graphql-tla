/*
 * GraphQL query execution: parallel field resolution and null propagation.
 *
 * Models GraphQL spec §6.3 (Executing Selection Sets) and §6.4.4 (Handling
 * Field Errors) for one fixed operation against one fixed schema:
 *
 *   type Query { version: String!   user: User }
 *   type User  { id: ID!   name: String   bestFriend: User! }
 *
 *   query {
 *     version
 *     user {
 *       id
 *       name
 *       bestFriend { id }
 *     }
 *   }
 *
 * Every resolver may return a value, return null, or raise an error, and
 * resolvers of a query run in parallel, so they finish in any order. The
 * executor builds the response incrementally the way graphql-js does: as each
 * resolver settles it writes its slot, and an error (or a null in a Non-Null
 * position) nulls the nearest nullable ancestor, or `data` itself.
 *
 * The invariants compare that operational executor with a declarative reading
 * of the spec's CompleteValue, so model checking proves that every schedule of
 * every combination of resolver outcomes produces the response the spec
 * defines.
 */

// A response position, named by its path in the query above.
type Field = "version" | "user" | "userId" | "userName" | "friend" | "friendId";
type Parent = Field | "root";
type Outcome = "value" | "null" | "error";
type Slot = "unset" | "value" | "null";

const FIELDS = new Set<Field>(["version", "user", "userId", "userName", "friend", "friendId"]);

const parentOf: Record<Field, Parent> = {
  version: "root",
  user: "root",
  userId: "user",
  userName: "user",
  friend: "user",
  friendId: "friend",
};

// Non-Null wrapping of each field's type in the schema.
const nonNull: Record<Field, boolean> = {
  version: true,
  user: false,
  userId: true,
  userName: false,
  friend: true,
  friendId: true,
};

// Leaf (scalar) fields have no sub-selection.
const isLeaf: Record<Field, boolean> = {
  version: true,
  user: false,
  userId: true,
  userName: true,
  friend: false,
  friendId: true,
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// Resolver lifecycle of each field.
let status: Record<Field, "idle" | "running" | "done"> = {
  version: "idle",
  user: "idle",
  userId: "idle",
  userName: "idle",
  friend: "idle",
  friendId: "idle",
};

// What each resolver produced. "none" until it settles.
let outcome: Record<Field, Outcome | "none"> = {
  version: "none",
  user: "none",
  userId: "none",
  userName: "none",
  friend: "none",
  friendId: "none",
};

// The response under construction. `dataIsNull` is `{ "data": null }`.
let slot: Record<Field, Slot> = {
  version: "unset",
  user: "unset",
  userId: "unset",
  userName: "unset",
  friend: "unset",
  friendId: "unset",
};
let dataIsNull = false;

// Paths in the response's "errors" list.
let errors = new Set<Field>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const childrenOf: Record<Parent, Set<Field>> = {
  root: new Set<Field>(["version", "user"]),
  version: new Set<Field>(),
  user: new Set<Field>(["userId", "userName", "friend"]),
  userId: new Set<Field>(),
  userName: new Set<Field>(),
  friend: new Set<Field>(["friendId"]),
  friendId: new Set<Field>(),
};

const ancestorsOf = (field: Field): Set<Field> =>
  parentOf[field] === "root"
    ? new Set<Field>()
    : ancestorsOf(parentOf[field] as Field).union(new Set<Field>([parentOf[field] as Field]));

// §6.4.4: "the null result will propagate to the next nullable field".
const nearestNullable = (field: Parent): Parent =>
  field === "root" ? "root" : !nonNull[field] ? field : nearestNullable(parentOf[field]);

// A field error is a raised error, or null in a Non-Null position.
const isFieldError = (field: Field, result: Outcome) =>
  result === "error" || (result === "null" && nonNull[field]);

// ---------------------------------------------------------------------------
// Executor (operational)
// ---------------------------------------------------------------------------

// A root field may start at once. A sub-field starts once its parent's
// resolver returned an object, even if a sibling later nulls that parent:
// graphql-js does not cancel work, it discards the result.
export const startResolver = (field: Field) => {
  if (status[field] !== "idle") return;
  if (parentOf[field] !== "root" && outcome[parentOf[field] as Field] !== "value") return;
  status[field] = "running";
};

export const settleResolver = (field: Field, result: Outcome) => {
  if (status[field] !== "running") return;
  status[field] = "done";
  outcome[field] = result;
  if (isFieldError(field, result)) {
    errors.add(field);
    const target = nearestNullable(field);
    if (target === "root") {
      dataIsNull = true;
    } else {
      slot[target as Field] = "null";
    }
  } else {
    slot[field] = result === "value" ? "value" : "null";
  }
};

// ---------------------------------------------------------------------------
// The spec's response (declarative)
// ---------------------------------------------------------------------------

// CompleteValue: what a field contributes to its parent once every resolver
// beneath it has settled.
const completed = (field: Field): "value" | "null" =>
  outcome[field] !== "value"
    ? "null"
    : isLeaf[field]
      ? "value"
      : childrenOf[field].values().some((c) => nonNull[c] && completed(c) === "null")
        ? "null"
        : "value";

const expectedDataIsNull = () =>
  childrenOf.root.values().some((f) => nonNull[f] && completed(f) === "null");

// A field appears in the response when `data` and all its ancestors are objects.
const isVisible = (field: Field) =>
  !dataIsNull && ancestorsOf(field).values().every((a) => slot[a] === "value");

// A field is settled when its resolver finished, or when it will never run
// because its parent settled to something other than an object.
const isSettled = (field: Field): boolean =>
  status[field] === "done" ||
  (parentOf[field] !== "root" &&
    isSettled(parentOf[field] as Field) &&
    outcome[parentOf[field] as Field] !== "value");

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

/** @terminating */
export const isFinished = () => FIELDS.values().every(isSettled);

// No Non-Null position in the response ever holds null.
export const nonNullNeverNull = () =>
  FIELDS.values().every((f) => !nonNull[f] || !isVisible(f) || slot[f] !== "null");

// Every path in "errors" belongs to a resolver that really failed, and a field
// that failed is reported exactly once (errors is a set keyed by path).
export const errorsAreReal = () =>
  errors.values().every((f) => outcome[f] !== "none" && isFieldError(f, outcome[f] as Outcome));

export const failuresAreReported = () =>
  FIELDS.values().every((f) => outcome[f] === "none" || !isFieldError(f, outcome[f] as Outcome) || errors.has(f));

// `data` is null only when a Non-Null root field failed (§6.4.4).
export const dataNullOnlyFromRootBubbling = () =>
  !dataIsNull || errors.values().some((f) => nearestNullable(f) === "root");

// Once every resolver has settled, the response the executor built is the
// response the spec defines, whatever order the resolvers finished in.
export const matchesSpec = () =>
  !isFinished() ||
  (dataIsNull === expectedDataIsNull() &&
    (dataIsNull ||
      FIELDS.values().every((f) => !isVisible(f) || slot[f] === completed(f))));
