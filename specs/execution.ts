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
 *
 * Fragments may take arguments (graphql-spec#1081, a proposal no release
 * has): a fragment defines variables, a spread gives them values, and a
 * selection inside the fragment reads them before the operation's. The
 * executor keeps, with every collected field, the scope it was selected in.
 */

import { FIXTURES, type FixtureId } from "./lib/fixtures";
import type {
  Condition,
  Fixture,
  FragmentVariable,
  Json,
  Outcome,
  Path,
  Selection,
  SpreadArgument,
  TypeRef,
} from "./lib/graphql";

type Variant = "reportAll" | "filterNulled" | "cancelNulled";

// The variables a selection sees besides the operation's: the fragment it
// is in ("" outside any fragment) and the values that fragment's variables
// got from the spread. A variable the fragment defines may have none.
type Binding = { name: string; value: string };
type Scope = { fragment: string; values: Binding[] };

// A collected field: the selection, and the scope it was selected in.
type Selected = { field: Selection; scope: Scope };

// A grouped field set entry: a response key and the fields selected under it.
type Group = { key: string; fields: Selected[] };
// failed: a fragment spread's arguments couldn't be coerced.
type Collected = { groups: Group[]; visited: Set<string>; failed: boolean };

// The values a spread gives its fragment's variables, unless one is refused.
type Bound = { ok: boolean; values: Binding[] };

// A response position: its declared type and the fields that select it.
type Position = { type: TypeRef; fields: Selected[] };

// The status of a position: settled to a value, a resolver null, nulled by a
// field error at or below it, a field error that propagates to its parent,
// or still pending.
type Status = "value" | "null" | "nulled" | "error" | "pending";

const NULL: Json = { kind: "null", value: "", entries: [], items: [] };
const LEAF: Json = { kind: "leaf", value: "", entries: [], items: [] };

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let fixture!: FixtureId;
let variant!: Variant;
let started = false;
// How many root fields have started, and whether a mutation stopped
// executing root fields after data was nulled.
let startedRoots = 0;
let stopped = false;

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

// The scope of the operation's own selections.
const OPERATION: Scope = { fragment: "", values: [] };

// Whether the scope's fragment defines this variable. If it does, the
// operation's variable of that name is out of sight, value or no value.
const isLocal = (scope: Scope, name: string) =>
  scope.fragment !== "" && fx().fragments.get(scope.fragment)!.variableDefinitions.some((d) => d.name === name);

const hasValue = (scope: Scope, name: string) =>
  isLocal(scope, name) ? scope.values.some((b) => b.name === name) : fx().variables.has(name);

// "true", "false" or "null". Only for a variable that has a value.
const valueOf = (scope: Scope, name: string): string =>
  isLocal(scope, name)
    ? scope.values.find((b) => b.name === name)!.value
    : fx().variables.get(name)!
      ? "true"
      : "false";

// A variable with no value, or with null, isn't true.
const ifValue = (condition: Condition, scope: Scope) =>
  condition.kind === "literal"
    ? condition.value
    : hasValue(scope, condition.variable) && valueOf(scope, condition.variable) === "true";

const isIncluded = (selection: Selection, scope: Scope) =>
  !(selection.skip.kind !== "absent" && ifValue(selection.skip, scope)) &&
  !(selection.include.kind !== "absent" && !ifValue(selection.include, scope));

// Whether a spread gives a variable a value: a literal, or a variable of
// the spread's own scope that has one.
const isGiven = (args: SpreadArgument[], name: string, scope: Scope) =>
  args.some((a) => a.name === name && (a.kind === "literal" || hasValue(scope, a.variable)));

const givenValue = (args: SpreadArgument[], name: string, scope: Scope): string =>
  args.find((a) => a.name === name)!.kind === "literal"
    ? args.find((a) => a.name === name)!.value
    : valueOf(scope, args.find((a) => a.name === name)!.variable);

// One fragment variable: the value the spread gives it, else its default,
// else nothing. A Non-Null variable takes neither null nor nothing.
const bindOne = (definition: FragmentVariable, args: SpreadArgument[], scope: Scope, bound: Bound): Bound =>
  isGiven(args, definition.name, scope)
    ? definition.nonNull && givenValue(args, definition.name, scope) === "null"
      ? { ok: false, values: bound.values }
      : { ok: true, values: [...bound.values, { name: definition.name, value: givenValue(args, definition.name, scope) }] }
    : definition.hasDefault
      ? { ok: true, values: [...bound.values, { name: definition.name, value: definition.default }] }
      : { ok: !definition.nonNull, values: bound.values };

const bind = (definitions: FragmentVariable[], args: SpreadArgument[], scope: Scope, i: number, bound: Bound): Bound =>
  i >= definitions.length || !bound.ok
    ? bound
    : bind(definitions, args, scope, i + 1, bindOne(definitions[i], args, scope, bound));

const applies = (objectType: string, condition: string) =>
  fx().schema.types.get(condition)!.kind === "object"
    ? objectType === condition
    : fx().schema.types.get(condition)!.possibleTypes.has(objectType);

const addField = (groups: Group[], key: string, field: Selected): Group[] =>
  groups.some((g) => g.key === key)
    ? groups.map((g) => (g.key === key ? { key: g.key, fields: [...g.fields, field] } : g))
    : [...groups, { key, fields: [field] }];

// Once a spread's arguments are refused, nothing more is collected.
const collect = (objectType: string, selections: Selection[], scope: Scope, i: number, acc: Collected): Collected =>
  i >= selections.length || acc.failed
    ? acc
    : collect(objectType, selections, scope, i + 1, collectOne(objectType, selections[i], scope, acc));

const collectOne = (objectType: string, selection: Selection, scope: Scope, acc: Collected): Collected =>
  !isIncluded(selection, scope)
    ? acc
    : selection.kind === "field"
      ? {
          groups: addField(acc.groups, selection.alias === "" ? selection.name : selection.alias, { field: selection, scope }),
          visited: acc.visited,
          failed: false,
        }
      : selection.kind === "inlineFragment"
        ? selection.typeCondition !== "" && !applies(objectType, selection.typeCondition)
          ? acc
          : collect(objectType, selection.selectionSet, scope, 0, acc)
        : acc.visited.has(selection.name)
          ? acc
          : applies(objectType, fx().fragments.get(selection.name)!.typeCondition)
            ? collectFragment(
                objectType,
                selection,
                bind(fx().fragments.get(selection.name)!.variableDefinitions, selection.arguments, scope, 0, {
                  ok: true,
                  values: [],
                }),
                acc,
              )
            : { groups: acc.groups, visited: acc.visited.union(new Set([selection.name])), failed: false };

// A spread whose arguments were coerced: its fragment's selections, in the
// fragment's own scope.
const collectFragment = (objectType: string, selection: Selection, bound: Bound, acc: Collected): Collected =>
  bound.ok
    ? collect(
        objectType,
        fx().fragments.get(selection.name)!.selectionSet,
        { fragment: selection.name, values: bound.values },
        0,
        { groups: acc.groups, visited: acc.visited.union(new Set([selection.name])), failed: false },
      )
    : { groups: acc.groups, visited: acc.visited, failed: true };

// Each field's sub-selection is collected with its own visited fragments,
// in the scope that field was selected in.
const collectSubfields = (objectType: string, fields: Selected[], i: number, acc: Collected): Collected =>
  i >= fields.length || acc.failed
    ? acc
    : collectSubfields(
        objectType,
        fields,
        i + 1,
        collect(objectType, fields[i].field.selectionSet, fields[i].scope, 0, {
          groups: acc.groups,
          visited: new Set<string>(),
          failed: false,
        }),
      );

const subfields = (objectType: string, fields: Selected[]): Collected =>
  collectSubfields(objectType, fields, 0, { groups: [], visited: new Set<string>(), failed: false });

// §6.2: the root type for the operation's type.
const rootType = () =>
  fx().operationType === "query"
    ? fx().schema.query
    : fx().operationType === "mutation"
      ? fx().schema.mutation
      : fx().schema.subscription;

// The root selection set of a fixture always collects: no fixture has a
// spread there whose arguments are refused (scripts/generate-fixtures.mjs).
const rootGroups = () =>
  collect(rootType(), fx().operation, OPERATION, 0, { groups: [], visited: new Set<string>(), failed: false }).groups;

// __typename is answered from the runtime type, without a resolver.
const isTypename = (group: Group) => group.fields[0].field.name === "__typename";

const fieldType = (objectType: string, group: Group) =>
  fx().schema.types.get(objectType)!.fields.get(group.fields[0].field.name)!;

// Whether an execution error at a position of this type propagates to its
// parent. Off for every position under @experimental_disableErrorPropagation.
const propagates = (type: TypeRef) => isNonNull(type) && fx().errorPropagation;

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

// The groups under a settled object position.
const groupsOf = (path: Path, position: Position) => subfields(outcomes.get(path)!.type, position.fields).groups;

const positionOf = (path: Path): Position =>
  path.length === 1
    ? {
        type: fieldType(rootType(), rootGroups().find((g) => g.key === path[0])!),
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

// The outcome kind a value of this type needs.
const expectedKind = (position: Position) =>
  isList(nullable(position.type))
    ? "list"
    : fx().schema.types.get(position.type.name)!.kind === "scalar"
      ? "leaf"
      : "object";

// A result of the wrong shape: an object for a scalar (result coercion
// fails), anything but a list for a list type (§6.4.3: "If result is not a
// collection of values, raise an execution error"), or, for an interface
// or union, an object whose runtime type isn't a possible type
// (Reference.tla's reading, as graphql-js). An Object type has no wrong
// shape: §6.4.3 completes whatever its resolver produced with its
// sub-selection. choicesFor never gives an Object-typed position anything
// but an object of that type, so this test never sees one there.
const isWrongShape = (position: Position, outcome: Outcome) =>
  outcome.kind !== "null" &&
  outcome.kind !== "error" &&
  (outcome.kind !== expectedKind(position) ||
    (outcome.kind === "object" &&
      !fx().schema.types.get(position.type.name)!.possibleTypes.has(outcome.type)));

// An object whose sub-selection can't be collected: a fragment spread in
// it, of a fragment that applies to the object's type, has arguments that
// are refused. The object's own position is where that error is.
const cannotCollect = (position: Position, outcome: Outcome) =>
  outcome.kind === "object" && !isWrongShape(position, outcome) && subfields(outcome.type, position.fields).failed;

// The child positions an object or list outcome creates, in order. A result
// of the wrong shape has none, nor has an object whose sub-selection can't
// be collected.
const childPaths = (path: Path, position: Position, outcome: Outcome): Path[] =>
  isWrongShape(position, outcome) || cannotCollect(position, outcome)
    ? []
    : outcome.kind === "list"
      ? Array.from({ length: outcome.length }, (_, i) => [...path, `${i}`])
      : outcome.kind === "object"
        ? subfields(outcome.type, position.fields)
            .groups.filter((g) => !isTypename(g))
            .map((g) => [...path, g.key])
        : [];

// The child positions of a settled position.
const childrenOf = (path: Path, position: Position): Path[] =>
  childPaths(path, position, outcomes.get(path)!);

// Wrong-shape results a fixture with invalidResults may also produce. An
// Object type has none: any value is completed as an object of that type.
const wrongShapes = (position: Position): Set<Outcome> =>
  !fx().invalidResults
    ? new Set<Outcome>()
    : expectedKind(position) === "leaf"
      ? new Set<Outcome>([{ kind: "object", type: "", length: 0 }])
      : expectedKind(position) === "list"
        ? new Set<Outcome>([{ kind: "leaf", type: "", length: 0 }])
        : fx().schema.types.get(position.type.name)!.kind === "object"
          ? new Set<Outcome>()
          : new Set(
            fx()
              .schema.types.keys()
              .filter(
                (t) =>
                  fx().schema.types.get(t)!.kind === "object" &&
                  !fx().schema.types.get(position.type.name)!.possibleTypes.has(t),
              )
              .map((t) => ({ kind: "object", type: t, length: 0 }) as Outcome),
          );

// What a resolver at this position may produce.
const choicesFor = (position: Position): Set<Outcome> =>
  new Set<Outcome>([
    { kind: "null", type: "", length: 0 },
    { kind: "error", type: "", length: 0 },
  ])
    .union(
      expectedKind(position) === "list"
        ? new Set(
            Array.from({ length: fx().maxListLength + 1 }, (_, n) => ({ kind: "list", type: "", length: n }) as Outcome),
          )
        : expectedKind(position) === "leaf"
          ? new Set<Outcome>([{ kind: "leaf", type: "", length: 0 }])
          : new Set(
              fx()
                .schema.types.get(position.type.name)!
                .possibleTypes.values()
                .map((t) => ({ kind: "object", type: t, length: 0 }) as Outcome),
            ),
    )
    .union(wrongShapes(position));

// ---------------------------------------------------------------------------
// Completion, as the executor tracks it
// ---------------------------------------------------------------------------

// An execution error raised at this position: an error, a result of the
// wrong shape, null where the type is Non-Null, or an object whose
// sub-selection can't be collected.
const raisesError = (path: Path, outcome: Outcome) =>
  outcome.kind === "error" ||
  isWrongShape(positionOf(path), outcome) ||
  cannotCollect(positionOf(path), outcome) ||
  (outcome.kind === "null" && isNonNull(positionOf(path).type));

// What an execution error at or below this position makes it.
const failed = (path: Path): Status => (propagates(positionOf(path).type) ? "error" : "nulled");

const statusOf = (path: Path): Status =>
  !outcomes.has(path)
    ? "pending"
    : raisesError(path, outcomes.get(path)!)
      ? failed(path)
      : outcomes.get(path)!.kind === "null"
        ? "null"
        : outcomes.get(path)!.kind === "leaf"
          ? "value"
          : childrenOf(path, positionOf(path)).some((c) => statusOf(c) === "error")
            ? failed(path)
            : childrenOf(path, positionOf(path)).some((c) => statusOf(c) === "pending")
              ? "pending"
              : "value";

// The root fields that have started.
const rootPaths = (count: number): Path[] => rootGroups().filter((g) => !isTypename(g)).slice(0, count).map((g) => [g.key]);

const rootStatus = (): Status =>
  rootGroups().some((g) => !isTypename(g) && statusOf([g.key]) === "error")
    ? "nulled"
    : rootGroups().some((g) => !isTypename(g) && statusOf([g.key]) === "pending")
      ? "pending"
      : "value";

// Whether an execution error already nulled this position or one above it.
const isInNulledSubtree = (path: Path): boolean =>
  rootStatus() === "nulled" ||
  Array.from({ length: path.length - 1 }, (_, i) => path.slice(0, i + 1)).some(
    (p) => statusOf(p) === "nulled" || statusOf(p) === "error",
  );

const typenameJson = (type: string): Json => ({ kind: "leaf", value: type, entries: [], items: [] });

const jsonOf = (path: Path): Json =>
  statusOf(path) !== "value"
    ? NULL
    : outcomes.get(path)!.kind === "leaf"
      ? LEAF
      : outcomes.get(path)!.kind === "list"
        ? { kind: "list", value: "", entries: [], items: childrenOf(path, positionOf(path)).map((c) => jsonOf(c)) }
        : {
            kind: "object",
            value: "",
            items: [],
            entries: groupsOf(path, positionOf(path)).map((g) => ({
              key: g.key,
              value: isTypename(g) ? typenameJson(outcomes.get(path)!.type) : jsonOf([...path, g.key]),
            })),
          };

const responseData = (): Json =>
  rootStatus() !== "value"
    ? NULL
    : {
        kind: "object",
        value: "",
        items: [],
        entries: rootGroups().map((g) => ({
          key: g.key,
          value: isTypename(g) ? typenameJson(rootType()) : jsonOf([g.key]),
        })),
      };

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

// Actions compute everything they need before they change any state. A read
// after an assignment makes tla-ts inline helpers to see the new state, and
// the recursive helpers here can't be inlined.

// ExecuteRootSelectionSet: start the root fields' resolvers, all at once for
// a query or a subscription event, only the first for a mutation.
/** @fair */
export const start = () => {
  if (started) return;
  const count = fx().operationType === "mutation" ? 1 : rootGroups().length;
  const roots = new Set(rootPaths(count));
  started = true;
  startedRoots = count;
  running = roots;
};

// Serial execution (§6.3.4): a mutation's next root field starts once the
// previous one has completed, sub-selection included.
/** @fair */
export const startNextRootField = () => {
  if (!started || stopped || fx().operationType !== "mutation") return;
  if (startedRoots >= rootPaths(rootGroups().length).length) return;
  if (statusOf(rootPaths(startedRoots)[startedRoots - 1]) === "pending") return;
  const next = new Set(rootPaths(startedRoots + 1)).difference(new Set(rootPaths(startedRoots)));
  startedRoots = startedRoots + 1;
  running = running.union(next);
};

// Once data is null, the executor may skip the remaining root fields
// (graphql-js does), or carry on (§6.3.3 allows both).
export const skipRemainingRootFields = () => {
  if (stopped || rootStatus() !== "nulled") return;
  stopped = true;
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
export const isFinished = () =>
  sent &&
  running.size === 0 &&
  (stopped || fx().operationType !== "mutation" || startedRoots === rootPaths(rootGroups().length).length);
