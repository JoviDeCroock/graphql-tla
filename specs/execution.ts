/*
 * GraphQL query execution as a small-step state machine, generic over the
 * schema and query in specs/lib/fixtures.ts (generated from fixtures/*.graphql).
 *
 * This is the executor's view: every response position is a resolver that
 * starts as soon as its parent produced an object or a list and settles
 * whenever the scheduler likes, to any outcome its type allows (a value, a
 * list of up to maxListLength items, an object of any possible runtime type,
 * null, or an error). A field error nulls the nearest nullable position, at
 * once, while siblings may still be running. The response is sent as soon
 * as the root completes, and work in abandoned subtrees may carry on after.
 *
 * Three variants cover what the spec allows for errors in subtrees that a
 * field error already nulled:
 *
 *   reportAll     report them anyway (graphql-js 16.12 and earlier)
 *   filterNulled  drop them (graphql-js 16.13 and later, and 17:
 *                 _hasNulledPosition, graphql-js#4458)
 *   cancelNulled  drop them and cancel those resolvers (§6.3.3: siblings
 *                 "which have not yet executed or have not yet yielded a
 *                 value" may be cancelled)
 *
 * The executor shares no code with specs/Reference.tla. It does its own
 * field collection and completion. specs/ExecutionConformance.tla checks
 * that every behavior of every variant, on every fixture, refines
 * specs/GraphQLResponse.tla: one response, sent once, valid by
 * Reference!Valid at the moment it's sent.
 */

import { FIXTURES, type FixtureId } from "./lib/fixtures";
import type { Condition, Fixture, Json, Outcome, Path, Selection, TypeRef } from "./lib/graphql";

type Variant = "reportAll" | "filterNulled" | "cancelNulled";

// A grouped field set entry: a response key and the fields selected under it.
type Group = { key: string; fields: Selection[] };
type Collected = { groups: Group[]; visited: Set<string> };

// A response position: its declared type and the fields that select it.
type Position = { type: TypeRef; fields: Selection[] };

// The status of a position: settled to a value, a resolver null, nulled by a
// field error at or below it, a field error that propagates to its parent,
// or still pending.
type Status = "value" | "null" | "nulled" | "error" | "pending";

const NULL: Json = { kind: "null", entries: [], items: [] };
const LEAF: Json = { kind: "leaf", entries: [], items: [] };

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let fixture!: FixtureId;
let variant!: Variant;
let started = false;

// Positions whose resolver is running.
let running = new Set<Path>();
// What each settled resolver produced.
let outcomes = new Map<Path, Outcome>();
// The executor's error list, in the order errors were added.
let errors: Path[] = [];

// The response, once sent.
let sent = false;
let sentData: Json = NULL;
let sentErrors: Path[] = [];

// ---------------------------------------------------------------------------
// Field collection
// ---------------------------------------------------------------------------

const fx = (): Fixture => FIXTURES[fixture];

const isNonNull = (type: TypeRef) => type.wrappers.length > 0 && type.wrappers[0] === "nonNull";
const nullable = (type: TypeRef): TypeRef =>
  isNonNull(type) ? { name: type.name, wrappers: type.wrappers.slice(1) } : type;
const isList = (type: TypeRef) => type.wrappers.length > 0 && type.wrappers[0] === "list";
const itemType = (listType: TypeRef): TypeRef => ({
  name: listType.name,
  wrappers: listType.wrappers.slice(1),
});

const ifValue = (condition: Condition) =>
  condition.kind === "literal" ? condition.value : fx().variables.get(condition.variable)!;

const isIncluded = (selection: Selection) =>
  !(selection.skip.kind !== "absent" && ifValue(selection.skip)) &&
  !(selection.include.kind !== "absent" && !ifValue(selection.include));

const applies = (objectType: string, condition: string) =>
  fx().schema.types.get(condition)!.kind === "object"
    ? objectType === condition
    : fx().schema.types.get(condition)!.possibleTypes.has(objectType);

const addField = (groups: Group[], key: string, field: Selection): Group[] =>
  groups.some((g) => g.key === key)
    ? groups.map((g) => (g.key === key ? { key: g.key, fields: [...g.fields, field] } : g))
    : [...groups, { key, fields: [field] }];

const collect = (objectType: string, selections: Selection[], i: number, acc: Collected): Collected =>
  i >= selections.length
    ? acc
    : collect(objectType, selections, i + 1, collectOne(objectType, selections[i], acc));

const collectOne = (objectType: string, selection: Selection, acc: Collected): Collected =>
  !isIncluded(selection)
    ? acc
    : selection.kind === "field"
      ? {
          groups: addField(acc.groups, selection.alias === "" ? selection.name : selection.alias, selection),
          visited: acc.visited,
        }
      : selection.kind === "inlineFragment"
        ? selection.typeCondition !== "" && !applies(objectType, selection.typeCondition)
          ? acc
          : collect(objectType, selection.selectionSet, 0, acc)
        : acc.visited.has(selection.name)
          ? acc
          : applies(objectType, fx().fragments.get(selection.name)!.typeCondition)
            ? collect(objectType, fx().fragments.get(selection.name)!.selectionSet, 0, {
                groups: acc.groups,
                visited: acc.visited.union(new Set([selection.name])),
              })
            : { groups: acc.groups, visited: acc.visited.union(new Set([selection.name])) };

// Each field's sub-selection is collected with its own visited fragments.
const collectSubfields = (objectType: string, fields: Selection[], i: number, groups: Group[]): Group[] =>
  i >= fields.length
    ? groups
    : collectSubfields(
        objectType,
        fields,
        i + 1,
        collect(objectType, fields[i].selectionSet, 0, { groups, visited: new Set<string>() }).groups,
      );

const rootGroups = () =>
  collect(fx().schema.query, fx().operation, 0, { groups: [], visited: new Set<string>() }).groups;

const fieldType = (objectType: string, group: Group) =>
  fx().schema.types.get(objectType)!.fields.get(group.fields[0].name)!;

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

// The groups under a settled object position.
const groupsOf = (path: Path, position: Position) =>
  collectSubfields(outcomes.get(path)!.type, position.fields, 0, []);

const positionOf = (path: Path): Position =>
  path.length === 1
    ? {
        type: fieldType(fx().schema.query, rootGroups().find((g) => g.key === path[0])!),
        fields: rootGroups().find((g) => g.key === path[0])!.fields,
      }
    : childPosition(path.slice(0, -1), positionOf(path.slice(0, -1)), path[path.length - 1]);

const childPosition = (parent: Path, position: Position, key: string): Position =>
  isList(nullable(position.type))
    ? { type: itemType(nullable(position.type)), fields: position.fields }
    : {
        type: fieldType(outcomes.get(parent)!.type, groupsOf(parent, position).find((g) => g.key === key)!),
        fields: groupsOf(parent, position).find((g) => g.key === key)!.fields,
      };

// The child positions an object or list outcome creates, in order.
const childPaths = (path: Path, position: Position, outcome: Outcome): Path[] =>
  outcome.kind === "list"
    ? Array.from({ length: outcome.length }, (_, i) => [...path, `${i}`])
    : outcome.kind === "object"
      ? collectSubfields(outcome.type, position.fields, 0, []).map((g) => [...path, g.key])
      : [];

// The child positions of a settled position.
const childrenOf = (path: Path, position: Position): Path[] =>
  childPaths(path, position, outcomes.get(path)!);

// What a resolver at this position may produce.
const choicesFor = (position: Position): Set<Outcome> =>
  new Set<Outcome>([
    { kind: "null", type: "", length: 0 },
    { kind: "error", type: "", length: 0 },
  ]).union(
    isList(nullable(position.type))
      ? new Set(
          Array.from({ length: fx().maxListLength + 1 }, (_, n) => ({ kind: "list", type: "", length: n }) as Outcome),
        )
      : fx().schema.types.get(position.type.name)!.kind === "scalar"
        ? new Set<Outcome>([{ kind: "leaf", type: "", length: 0 }])
        : new Set(
            fx()
              .schema.types.get(position.type.name)!
              .possibleTypes.values()
              .map((t) => ({ kind: "object", type: t, length: 0 }) as Outcome),
          ),
  );

// ---------------------------------------------------------------------------
// Completion, as the executor tracks it
// ---------------------------------------------------------------------------

const statusOf = (path: Path): Status =>
  !outcomes.has(path)
    ? "pending"
    : outcomes.get(path)!.kind === "error"
      ? isNonNull(positionOf(path).type) ? "error" : "nulled"
      : outcomes.get(path)!.kind === "null"
        ? isNonNull(positionOf(path).type) ? "error" : "null"
        : outcomes.get(path)!.kind === "leaf"
          ? "value"
          : childrenOf(path, positionOf(path)).some((c) => statusOf(c) === "error")
            ? isNonNull(positionOf(path).type) ? "error" : "nulled"
            : childrenOf(path, positionOf(path)).some((c) => statusOf(c) === "pending")
              ? "pending"
              : "value";

const rootStatus = (): Status =>
  rootGroups().some((g) => statusOf([g.key]) === "error")
    ? "nulled"
    : rootGroups().some((g) => statusOf([g.key]) === "pending")
      ? "pending"
      : "value";

// Whether a field error already nulled this position or one above it.
const isInNulledSubtree = (path: Path): boolean =>
  rootStatus() === "nulled" ||
  Array.from({ length: path.length - 1 }, (_, i) => path.slice(0, i + 1)).some(
    (p) => statusOf(p) === "nulled" || statusOf(p) === "error",
  );

// A resolver result that is a field error: an error, or null where the
// type is Non-Null.
const raisesError = (path: Path, outcome: Outcome) =>
  outcome.kind === "error" || (outcome.kind === "null" && isNonNull(positionOf(path).type));

const jsonOf = (path: Path): Json =>
  statusOf(path) !== "value"
    ? NULL
    : outcomes.get(path)!.kind === "leaf"
      ? LEAF
      : outcomes.get(path)!.kind === "list"
        ? { kind: "list", entries: [], items: childrenOf(path, positionOf(path)).map((c) => jsonOf(c)) }
        : {
            kind: "object",
            items: [],
            entries: childrenOf(path, positionOf(path)).map((c) => ({ key: c[c.length - 1], value: jsonOf(c) })),
          };

const responseData = (): Json =>
  rootStatus() !== "value"
    ? NULL
    : { kind: "object", items: [], entries: rootGroups().map((g) => ({ key: g.key, value: jsonOf([g.key]) })) };

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

// Actions compute everything they need before they change any state. A read
// after an assignment makes tla-ts inline helpers to see the new state, and
// the recursive helpers here can't be inlined.

// ExecuteQuery: collect the root fields and start their resolvers.
/** @fair */
export const start = () => {
  if (started) return;
  const roots = new Set(rootGroups().map((g) => [g.key]));
  started = true;
  running = roots;
};

// A resolver settles. An object or a list starts its children's resolvers
// in the same step, as graphql-js does when it completes the value.
/** @fair */
export const settle = (path: Path, outcome: Outcome) => {
  if (!running.has(path)) return;
  if (!choicesFor(positionOf(path)).has(outcome)) return;
  const reported =
    raisesError(path, outcome) && (variant === "reportAll" || !isInNulledSubtree(path));
  const children = new Set(childPaths(path, positionOf(path), outcome));
  running = running.difference(new Set([path])).union(children);
  outcomes.set(path, outcome);
  if (reported) errors.push(path);
};

// §6.3.3: positions inside a nulled subtree may be cancelled.
export const cancel = (path: Path) => {
  if (!running.has(path)) return;
  if (variant !== "cancelNulled" || !isInNulledSubtree(path)) return;
  running.delete(path);
};

// The response is sent as soon as the root completes.
/** @fair */
export const respond = () => {
  if (!started || sent || rootStatus() === "pending") return;
  const data = responseData();
  sent = true;
  sentData = data;
  sentErrors = errors;
};

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

/** @terminating */
export const isFinished = () => sent && running.size === 0;
