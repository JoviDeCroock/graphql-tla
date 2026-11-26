// Checking execution cases against the reference.
//
// A case is what one execution did (docs/conformance.md): the fixture, the
// trace of resolver calls and settles up to the response, and the response.
// The kit normalizes each case, turns it into TLA+, and has tla-ts evaluate
// Cases!Failures (Reference!Clauses plus Reference!CalledSerially) for it,
// in shards that run in parallel. A shipped corpus of negative controls
// (controls.json) is evaluated alongside, and each must fail the clause it
// targets, so the check can't pass vacuously. check() also returns a report:
// the facts a conformance sheet is built from.

import { runChecker } from "../checker.mjs";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as graphql from "graphql17";
import { REPORT_FORMAT, provenance, section } from "../report.mjs";
import { CHECKS } from "./checks.mjs";
import { REPORT_CONTROLS } from "./controls.mjs";
import { protocolControls } from "./protocol-controls.mjs";
import { positions, startOf } from "./positions.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");

export const CASE_FORMAT = 1;
const SHARD_SIZE = 300;

// Checks that are SHOULDs in the spec: reported, but only fail with --strict.
export const SHOULD = new Set(CHECKS.filter((c) => c.level === "SHOULD").map((c) => c.id));
const LEVEL = new Map(CHECKS.map((c) => [c.id, c.level]));

// Whether breaking a check fails the run. INFO checks never do.
const isFatal = (id, strict) => LEVEL.get(id) === "MUST" || LEVEL.get(id) === "ADAPTER" || (strict && LEVEL.get(id) === "SHOULD");

// A fixture that turns error propagation off runs graphql-js 17's
// @experimental_disableErrorPropagation, which is outside the spec. What it
// changes is the response, so each failure of the response (its data and
// errors) counts under this INFO check instead of its own. Protocol
// problems and the checks on resolver calls don't depend on propagation,
// and keep their own checks and levels.
export const OUTSIDE_SPEC = "disabledPropagation";
const KEEP_OUTSIDE_SPEC = new Set(["protocol", "callsOnce", "callsSelected", "callsReachable", "mutationFieldsOnce", "calledSerially", "parentValue"]);
const outsideSpec = (fixture) => fixture?.errorPropagation === false;
const gradedAs = (fixture, id) => (outsideSpec(fixture) && !KEEP_OUTSIDE_SPEC.has(id) ? OUTSIDE_SPEC : id);

// ---------------------------------------------------------------------------
// Canonical leaf values (docs/conformance.md)

export const leafValue = (type) => {
  const named = graphql.getNamedType(type);
  if (graphql.isEnumType(named)) return named.getValues()[0].name;
  return named.name === "Int" ? 1 : named.name === "Float" ? 1.5 : named.name === "Boolean" ? true : "v";
};

// ---------------------------------------------------------------------------
// Normalizing a case

const pathKey = (path) => path.join("\u0000");
const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const nullable = (type) => (graphql.isNonNullType(type) ? type.ofType : type);

// Whether an outcome raises an execution error at a position of this type:
// the resolver raised, returned null for a Non-Null type, a value of the
// wrong shape or runtime type, or a value the leaf type can't represent.
// The reference decides this for itself; the kit uses it only to recognize
// an error reported at the wrong form of its path: under a field name
// instead of its alias, without its list indices, or cut short where it
// propagated to. (The kit doesn't send runtime types that aren't possible
// types; see drive.mjs.)
const raises = (schema, type, outcome) => {
  // A built-in scalar's internal value of another type or range
  // (scalar-results) may raise, and must for an Int outside 32 bits.
  if (outcome.kind === "error" || outcome.kind === "uncoercible" || (outcome.kind === "leaf" && "value" in outcome)) return true;
  if (outcome.kind === "null") return graphql.isNonNullType(type);
  const named = graphql.getNamedType(type);
  const expected = graphql.isListType(nullable(type)) ? "list" : graphql.isLeafType(named) ? "leaf" : "object";
  // An Object type completes whatever its resolver produced with its
  // sub-selection (§6.4.3: "Let objectType be fieldType"), as
  // Reference!ObjectTypeOf has it.
  if (expected === "object" && graphql.isObjectType(named)) return false;
  if (outcome.kind !== expected) return true;
  if (expected !== "object") return false;
  const runtime = schema.getType(outcome.type ?? "");
  return !(runtime === named || (graphql.isAbstractType(named) && graphql.isObjectType(runtime) && schema.isSubType(named, runtime)));
};

// The check a value its leaf type can't represent breaks: a fraction for an
// Int is intFraction, a non-finite Float or an unknown enum value
// resultCoercion.
const coercionCheck = (at, path) => (graphql.getNamedType(at(path)?.type ?? graphql.GraphQLString).name === "Int" ? "intFraction" : "resultCoercion");

// Whether a call or settle at `path` is a mutation's root field: the one
// place an extra call is perceived (mutationFieldsOnce). Elsewhere it is
// callsOnce or callsSelected, which are INFO.
const mutationRoot = (fixture, path) => fixture.operationType === "mutation" && path.length === 1;

// The trace's own consistency: each position's resolver is called once and
// settles at most once, after its call. A field called twice is settled
// twice by the kit, so both count against callsOnce (mutationFieldsOnce at
// a mutation's root). Returns whether the trace still says what each
// position produced: false if a position settled twice with different
// outcomes, since the response can't say which one the implementation used.
const traceProblems = (fixture, trace, add) => {
  const called = new Set();
  const settled = new Map();
  let consistent = true;
  for (const event of trace) {
    const path = event.call ?? event.settle;
    if (!Array.isArray(path)) {
      add("protocol", `a trace event without a path: ${JSON.stringify(event)}`);
      consistent = false;
      continue;
    }
    const k = pathKey(path.map(String));
    const once = mutationRoot(fixture, path) ? "mutationFieldsOnce" : "callsOnce";
    if (event.call) {
      if (called.has(k)) add(once, `the resolver at ${path.join(".")} was called twice (§6.3.2 executes each field once)`);
      called.add(k);
    } else {
      if (!called.has(k)) add("protocol", `${path.join(".")} settled without being called`);
      if (settled.has(k)) {
        add(once, `${path.join(".")} settled twice`);
        if (JSON.stringify(settled.get(k)) !== JSON.stringify(event.outcome)) consistent = false;
      }
      settled.set(k, event.outcome);
    }
  }
  return consistent;
};

// Calls: each at a position the operation selects, with the type the
// fixture gives it.
const callProblems = (fixture, trace, at, add) => {
  for (const event of trace) {
    if (!Array.isArray(event.call)) continue;
    const position = at(event.call);
    if (!position) {
      add(
        mutationRoot(fixture, event.call) ? "mutationFieldsOnce" : "callsSelected",
        `a resolver was called at ${event.call.join(".")}, which the operation doesn't select`,
      );
    } else if (event.type !== undefined && String(position.type) !== event.type) {
      add("protocol", `the call at ${event.call.join(".")} reports type ${event.type}; the fixture says ${position.type}`);
    }
  }
};

// Causality: a resolver below the root is called only once its parent
// position has settled to a value that contains it (an object, any value
// but null or an error at an Object-typed position, which §6.4.3 completes
// with its sub-selection whatever it is, or a list long enough for the
// index), and an `after` stamp is a count of settles the adapter had been
// sent by then. Inline item events (a list settled with its items, for
// adapters without deferred-items) come with their list and aren't counted
// as settles the adapter was sent.
const causalProblems = (trace, at, add) => {
  const settled = new Map();
  let sent = 0;
  for (const event of trace) {
    if (event.settle) {
      if (Array.isArray(event.settle)) settled.set(pathKey(event.settle.map(String)), event.outcome);
      if (!event.inline) sent++;
      continue;
    }
    if (!Array.isArray(event.call)) continue;
    const path = event.call.map(String);
    if ("after" in event && !event.inline && !(Number.isInteger(event.after) && event.after >= 0 && event.after <= sent)) {
      add("protocol", `the call at ${path.join(".")} has the stamp ${JSON.stringify(event.after)}, but ${sent} settles had been sent`);
    }
    if (path.length < 2) continue;
    const parent = settled.get(pathKey(path.slice(0, -1)));
    const last = path[path.length - 1];
    const index = /^(0|[1-9]\d*)$/.test(last) ? Number(last) : null;
    const parentType = at(path.slice(0, -1))?.type;
    const objectTyped =
      index === null && parentType && !graphql.isListType(nullable(parentType)) && graphql.isObjectType(graphql.getNamedType(parentType));
    const reachable =
      parent?.kind === "object" ||
      (objectTyped && parent !== undefined && parent.kind !== "null" && parent.kind !== "error") ||
      (parent?.kind === "list" && index !== null && index < Number(parent.length ?? 0));
    if (!reachable) {
      add(
        "callsReachable",
        `a resolver was called at ${path.join(".")}, but its parent ${
          !parent ? "hadn't settled" : parent.kind === "list" ? `settled as a list of ${parent.length}` : `settled as ${parent.kind === "error" ? "an error" : parent.kind}`
        }`,
      );
    }
  }
};

// With parent-values (the case has the `initialValue` the kit gave): each
// field's resolver reports the token of the value it was called on, which
// must be its parent position's object (§6.3.3, §6.4.2, §6.4.3), the
// initial value at the root (§6.2.1), or for a subscription the event's
// value (§6.2.3.2). A list item has no resolver of its own, and a call
// whose parent hadn't settled to an object is callsReachable's.
const isIndex = (segment) => /^(0|[1-9]\d*)$/.test(segment ?? "");
const parentProblems = (fixture, c, add) => {
  if (c.initialValue === undefined) return;
  const subscription = fixture.operationType === "subscription";
  const settled = new Map();
  for (const event of c.trace) {
    if (Array.isArray(event.settle)) {
      settled.set(pathKey(event.settle.map(String)), event.outcome);
      continue;
    }
    if (!Array.isArray(event.call)) continue;
    const path = event.call.map(String);
    if (isIndex(path.at(-1))) continue;
    const root = path.length === 1;
    const expected = root ? (subscription ? c.event : c.initialValue) : settled.get(pathKey(path.slice(0, -1)))?.token;
    if (expected === undefined) continue;
    const whose = root ? (subscription ? "the event's value" : "the initial value") : `the value of ${path.slice(0, -1).join(".")}`;
    if (!("parent" in event)) add("parentValue", `the call at ${path.join(".")} doesn't say which value its resolver was given`);
    else if (event.parent !== expected) {
      add("parentValue", `the resolver at ${path.join(".")} was given ${JSON.stringify(event.parent)}, not ${JSON.stringify(expected)}, ${whose}`);
    }
  }
};

// A subscription run as a stream (drive.mjs runStream): its lifecycle
// case's log, of what the kit's source did ({kit: "emit" | "complete" |
// "fail" | "cancel"}) and what the adapter reported ({adapter: "response" |
// "no-response" | "done" | "stream-error" | "source-cancelled"}), in order.
// Each event's result is a case of its own. Every problem here is a
// lifecycle check's (streamOnly in checks.mjs); SHOULDs fail only with
// --strict, as everywhere.
const streamProblems = (c) => {
  const problems = [];
  const ids = [];
  const once = new Set();
  const add = (id, text) => {
    if (once.has(id)) return;
    once.add(id);
    ids.push(id);
    problems.push(text);
  };
  const log = c.stream?.log;
  if (!Array.isArray(log)) return { problems: ["a stream case without a log"], ids: ["protocol"] };
  // The first of complete, fail and cancel the kit sent; how and when the
  // response stream completed; the events still waiting for a result.
  let cause = null;
  let completion = null;
  let sourceCancelled = false;
  // A result with errors that arrived once the source had failed, before
  // the stream completed: an implementation whose streams can't end with an
  // error (a stream of results, as in Rust) ends it with such an item, then
  // completes normally. The spec doesn't say how "complete with that error"
  // looks to a client, so that passes failsWithSource (checks.mjs), and a
  // result after the source failed never counts against eventPerSourceEvent:
  // it answers the failure, not an event.
  let errorAfterFail = false;
  const unanswered = [];
  for (const entry of log) {
    if (entry?.kit === "emit") {
      unanswered.push(entry.event);
    } else if (entry?.kit) {
      cause ??= entry.kit;
    } else if (entry?.adapter === "response") {
      if (cause === "cancel") add("nothingAfterCancel", "a result arrived after the client cancelled the response stream");
      else if (cause === "fail" && !completion && !unanswered.includes(entry.event)) errorAfterFail ||= entry.errors === true;
      else if (completion) add("eventPerSourceEvent", "a result arrived after the response stream completed");
      else if (!unanswered.includes(entry.event)) add("eventPerSourceEvent", "a result arrived for no source event");
      else unanswered.splice(unanswered.indexOf(entry.event), 1);
    } else if (entry?.adapter === "done" || entry?.adapter === "stream-error") {
      if (completion) {
        add("protocol", "the response stream completed twice");
        continue;
      }
      const how = entry.adapter === "done" ? "normally" : "with an error";
      completion = { how: entry.adapter, early: cause === null };
      if (cause !== null) continue;
      if (unanswered.length > 0) add("eventPerSourceEvent", `the response stream completed ${how} instead of yielding the result of event ${unanswered[0]}`);
      else add("streamEndsOnlyForCause", `the response stream completed ${how} though its source hadn't completed or failed and the client hadn't cancelled it`);
    } else if (entry?.adapter === "source-cancelled") {
      sourceCancelled = true;
    } else if (entry?.adapter !== "no-response") {
      add("protocol", `an entry the kit doesn't know in a stream's log: ${JSON.stringify(entry)}`);
    }
  }
  if (!completion?.early) {
    // An event still executing when the client cancelled needn't yield one.
    if (cause !== "cancel" && unanswered.length > 0) add("eventPerSourceEvent", `event ${unanswered[0]} yielded no result before the response stream completed`);
    const ended = completion ? `completed ${completion.how === "done" ? "normally" : "with an error"}` : "never completed";
    if (cause === "complete" && completion?.how !== "done") add("completesWithSource", `the source completed, and the response stream ${ended}`);
    if (cause === "fail" && completion?.how !== "stream-error" && !(completion?.how === "done" && errorAfterFail)) {
      add("failsWithSource", `the source failed, and the response stream ${ended}${completion?.how === "done" ? " with no result carrying an error before it" : ""}`);
    }
    if (cause === "cancel") {
      if (completion?.how !== "done") add("cancelCompletes", `the client cancelled the response stream, which then ${ended}`);
      if (!sourceCancelled) add("cancelCancelsSource", "the client cancelled the response stream, and the source stream wasn't cancelled");
    }
  }
  return problems.length > 0 ? { problems, ids } : { lifecycle: true, warnings: [], warningIds: [] };
};

// The checks on the trace itself. When the adapter broke the protocol, only
// these count (countedProblems). A case that breaks only the checks on
// calls still goes to the reference: an extra call doesn't change what the
// resolvers produced, unless a position settled twice with different
// outcomes, or the adapter broke the protocol.
const TRACE_CHECKS = new Set(["protocol", "callsOnce", "callsSelected", "callsReachable", "mutationFieldsOnce", "parentValue"]);
// The checks that make a response's error paths unusable, as does an error
// that isn't a map or has no list for a path. The reference still sees such
// a case, but only its clauses on data and calls count.
const ERROR_PATH_CHECKS = new Set(["errorPath", "responsePosition", "errorPathFull"]);
// The clauses that don't read error paths.
export const DATA_CLAUSES = new Set(["complete", "dataMatches", "keyOrder", "calledSerially"]);

// The case in the shape the TLA+ side reads. `outcomes` replaces the
// outcome of a settle, by path key.
const referenceCase = (c, data, errorPaths, outcomes = new Map(), typenames = new Set()) => ({
  fixture: c.fixture,
  typenames,
  trace: c.trace.map((e) =>
    e.call
      ? { call: e.call.map(String), type: e.type, ...(Number.isInteger(e.after) ? { after: e.after } : {}), ...(e.inline ? { inline: true } : {}) }
      : {
          settle: e.settle.map(String),
          outcome: outcomes.get(pathKey(e.settle.map(String))) ?? e.outcome,
          ...(e.inline ? { inline: true } : {}),
        },
  ),
  data,
  errors: errorPaths.map((p) => p.map(String)),
});

// Checks what the reference can't see, and puts the case in the shape the
// TLA+ side reads. Returns { problems, ids } for a malformed case, where
// ids[i] is the check (kit/execution/checks.mjs) problems[i] breaks, and
// { case, warnings, warningIds } otherwise; warnings break a SHOULD.
//
// A malformed case can still be checked against the reference when its
// problems leave the trace and data usable: then it also has `case`, and
// `clauses` is "all", or "data" when its error paths are unusable and only
// DATA_CLAUSES count. So one problem doesn't hide a failure of the
// reference: an Int fraction truncated to 1 doesn't hide a dropped error
// elsewhere in the case, and errors without a path don't hide data nulled
// past a nullable position. A position whose resolver returned a value its
// type can't represent is given to the reference as the implementation
// completed it: as a leaf if it holds a value, as null if it is null
// without an error. That fault is graded once, by intFraction or
// resultCoercion.
export const normalize = (fixture, c) => {
  const problems = [];
  const ids = [];
  const warnings = [];
  const warningIds = [];
  const add = (id, text) => {
    ids.push(id);
    problems.push(text);
  };
  const warn = (id, text) => {
    warningIds.push(id);
    warnings.push(text);
  };
  if (c.stream !== undefined) return streamProblems(c);
  if (!Array.isArray(c.trace)) return { problems: ["the case has no trace"], ids: ["protocol"] };
  const at = positions(fixture, c.trace);
  const uncoercible = c.trace.filter((e) => Array.isArray(e.settle) && e.outcome?.kind === "uncoercible");
  // scalar-results: a built-in scalar's resolver returned an internal value
  // of another type or range.
  const valued = c.trace.filter((e) => Array.isArray(e.settle) && e.outcome?.kind === "leaf" && "value" in e.outcome);
  // The trace comes first, whatever the response: a call the fixture
  // doesn't select, or with the wrong type, is the root cause of whatever
  // follows from it, so it must not be blamed on the response.
  const consistent = traceProblems(fixture, c.trace, add);
  causalProblems(c.trace, at, add);
  callProblems(fixture, c.trace, at, add);
  parentProblems(fixture, c, add);
  // A subscription whose response stream failed instead of yielding the
  // event's execution result (§6.2.3.2 ExecuteSubscriptionEvent always
  // produces one). The envelope checks don't apply: there is no response.
  if ("streamError" in c) {
    if (fixture.operationType === "subscription") {
      add("eventYieldsResult", `the response stream failed instead of yielding the event's result: ${JSON.stringify(c.streamError)}`);
    } else add("protocol", `a stream error for a ${fixture.operationType}`);
    return { problems, ids };
  }
  // The implementation produced no response at all. Where a resolver
  // returned a value its type can't represent, that's the root cause: it
  // must have raised an execution error (graphql-go passes Infinity
  // through, and then can't serialize it).
  if ("noResponse" in c) {
    const message = JSON.stringify(c.noResponse);
    const checks = new Set(uncoercible.map((e) => coercionCheck(at, e.settle)));
    if (checks.size > 0) {
      add(
        checks.has("resultCoercion") ? "resultCoercion" : "intFraction",
        `the implementation produced no response, after a resolver returned a value its type can't represent: ${message}`,
      );
    } else {
      add(fixture.operationType === "subscription" ? "eventYieldsResult" : "responds", `the implementation produced no response: ${message}`);
    }
    return { problems, ids };
  }
  const response = c.response;
  if (!isMap(response)) {
    add("resultMap", "the response isn't a map (§7.1.1)");
    return { problems, ids };
  }

  // Appendix B: each entry of a map has a unique key. JSON.parse keeps the
  // last of a repeated key, so the kit reads the adapter's raw line for it
  // (drive.mjs records `duplicateKeys`).
  if (Array.isArray(c.duplicateKeys) && c.duplicateKeys.length > 0) {
    const [first] = c.duplicateKeys;
    add("uniqueKeys", `the response repeats the key ${JSON.stringify(String(first.at(-1)))} in one map${first.length > 1 ? ` at ${first.slice(0, -1).join(".")}` : ""}`);
  }

  // §7.1: the response is a map of data, errors and extensions only.
  for (const k of Object.keys(response)) {
    if (!["data", "errors", "extensions"].includes(k)) {
      add("additionalEntries", `the response has an entry ${JSON.stringify(k)} (§7.1.8: only data, errors and extensions)`);
    }
  }
  if ("extensions" in response && !isMap(response.extensions)) add("extensions", "extensions isn't a map (§7.1.7)");
  if (!("data" in response)) add("dataPresent", "the response has no data entry (§7.1.1: execution started, so data must be present)");
  const errors = response.errors ?? [];
  if (!Array.isArray(errors)) {
    add("errorsList", "errors isn't a list");
    return { problems, ids };
  }
  if ("errors" in response && errors.length === 0) add("errorsList", "errors is present but empty (§7.1.1)");

  // Where the kit's outcomes raised an execution error, with each path's
  // field names and segment kinds.
  const raised = new Map();
  for (const event of c.trace) {
    if (!Array.isArray(event.settle) || !event.outcome) continue;
    const position = at(event.settle);
    if (position && raises(fixture.schema, position.type, event.outcome)) {
      raised.set(pathKey(event.settle.map(String)), { path: event.settle.map(String), names: position.names, kinds: position.kinds });
    }
  }
  // Whether an error raised at `r` propagated up to its ancestor at depth
  // n: every position below that ancestor, down to r, is Non-Null (§6.4.4).
  const propagatedTo = (r, n) => {
    for (let k = n + 1; k <= r.path.length; k++) {
      if (!graphql.isNonNullType(at(r.path.slice(0, k))?.type)) return false;
    }
    return true;
  };
  const withoutIndices = (r, segments) => segments.filter((_, i) => r.kinds[i] !== "index");
  for (const error of errors) {
    if (!isMap(error)) {
      add("errorFormat", `an error that isn't a map: ${JSON.stringify(error)}`);
      continue;
    }
    if (typeof error.message !== "string") add("errorFormat", `an error without a message: ${JSON.stringify(error)}`);
    if ("extensions" in error && !isMap(error.extensions)) add("errorFormat", `an error whose extensions isn't a map: ${JSON.stringify(error)}`);
    // §7.1.6: the whole sentence about locations, shape included, is a
    // should.
    if (
      "locations" in error &&
      !(
        Array.isArray(error.locations) &&
        error.locations.every((l) => isMap(l) && Number.isInteger(l.line) && l.line >= 1 && Number.isInteger(l.column) && l.column >= 1)
      )
    ) {
      warn("errorLocations", "errors have locations that aren't a list of maps with positive integer line and column (§7.1.6: should)");
    }
    const extra = Object.keys(error).filter((k) => !["message", "locations", "path", "extensions"].includes(k));
    if (extra.length > 0) warn("errorEntries", `errors have entries ${extra.join(", ")} (§7.1.6: services should not add entries)`);
    if (error.path === undefined || error.path === null) {
      add("errorPath", `an execution error without a path: ${JSON.stringify(error)}`);
      continue;
    }
    // §7.1.4: a list of response names and integer list indices. These are
    // musts since September 2025, shoulds in October 2021, so they belong to
    // responsePosition rather than errorPath.
    if (!Array.isArray(error.path)) {
      add("responsePosition", `error path ${JSON.stringify(error.path)} isn't a list of path segments (§7.1.4)`);
      continue;
    }
    const reported = pathKey(error.path.map(String));
    const others = raised.has(reported) ? [] : [...raised.values()];
    const aliased = others.find((r) => pathKey(r.names) === reported && pathKey(r.path) !== reported);
    if (aliased) {
      add(
        "responsePosition",
        `error path ${JSON.stringify(error.path)} uses field names where §7.1.4 wants the response names of ${JSON.stringify(aliased.path)}, where the error was raised`,
      );
      continue;
    }
    // A path cut short at a position the error propagated to (§7.1.6: the
    // path "should include the full path to the result field where the
    // error was raised"), or a raised path with its list indices left out
    // (§7.1.4). Either is the right error in the wrong form, so it counts
    // there, not against the clauses that read error paths.
    const n = error.path.length;
    const truncated = others.find((r) => r.path.length > n && pathKey(r.path.slice(0, n)) === reported && propagatedTo(r, n));
    if (truncated) {
      add(
        "errorPathFull",
        `error path ${JSON.stringify(error.path)} stops where the error raised at ${JSON.stringify(truncated.path)} propagated to (§7.1.6: should include the full path)`,
      );
      continue;
    }
    const unindexed = others.find(
      (r) => r.kinds.includes("index") && (pathKey(withoutIndices(r, r.path)) === reported || pathKey(withoutIndices(r, r.names)) === reported),
    );
    if (unindexed) {
      add(
        "responsePosition",
        `error path ${JSON.stringify(error.path)} leaves out the list indices of ${JSON.stringify(unindexed.path)}, where the error was raised (§7.1.4)`,
      );
      continue;
    }
    // §7.1.4: field names are strings, list indices zero-based integers.
    const position = at(error.path);
    if (!position) {
      add("errorPath", `an error at ${JSON.stringify(error.path)}, which isn't a position the operation selects`);
      continue;
    }
    error.path.forEach((segment, i) => {
      const ok =
        position.kinds[i] === "index" ? Number.isInteger(segment) && segment >= 0 : typeof segment === "string";
      if (!ok) {
        add(
          "responsePosition",
          `error path ${JSON.stringify(error.path)} has ${JSON.stringify(segment)} where §7.1.4 wants ${position.kinds[i] === "index" ? "an integer index" : "a field name"}`,
        );
      }
    });
  }

  // §7.1.6: an error associated with a point in the document should have
  // locations, at the beginning of an associated syntax element. Every
  // error the kit's resolvers cause is raised at a field, or a list item of
  // one, whose selection is that element: any of its field nodes (several
  // when selections merge), or its name after an alias. Accuracy is only
  // judged for an error at the very path where an outcome raised it, with
  // well-formed locations (errorLocations judges their shape).
  for (const error of errors) {
    if (!isMap(error)) continue;
    if (!Array.isArray(error.locations) || error.locations.length === 0) {
      warn("errorLocationsPresent", "execution errors raised at a field have no locations (§7.1.6: should)");
      continue;
    }
    if (!Array.isArray(error.path) || !raised.has(pathKey(error.path.map(String)))) continue;
    if (!error.locations.every((l) => isMap(l) && Number.isInteger(l.line) && Number.isInteger(l.column))) continue;
    const nodes = at(error.path)?.nodes ?? [];
    const starts = new Set(
      nodes.flatMap((n) => [n, ...(n.alias ? [n.name] : [])]).map((n) => startOf(n)).map((l) => `${l.line}:${l.column}`),
    );
    if (nodes.length > 0 && error.locations.some((l) => !starts.has(`${l.line}:${l.column}`))) {
      warn("errorLocationsAccurate", "execution errors have locations that aren't where the field they were raised at begins (§7.1.6: should)");
    }
  }

  // §3.5.1, §3.5.2, §3.9: a leaf value the type can't represent must raise
  // an execution error, so the position can't hold a value (intFraction for
  // an Int, resultCoercion otherwise), and if it is null, an error must say
  // why. A silent null there is coercionErrorReported's failure, not
  // nullsExplained's: the reference sees the position as null, the
  // implementation's own coercion.
  const valueAt = (path) => path.reduce((v, k) => (v === null || typeof v !== "object" ? undefined : v[k]), response.data ?? null);
  const errorAt = new Set(errors.filter((e) => isMap(e) && Array.isArray(e.path)).map((e) => pathKey(e.path.map(String))));
  const coerced = new Map();
  for (const event of uncoercible) {
    const value = valueAt(event.settle.map((k) => (/^\d+$/.test(k) ? Number(k) : k)));
    const check = coercionCheck(at, event.settle);
    const k = pathKey(event.settle.map(String));
    if (value !== undefined && value !== null) {
      coerced.set(k, { kind: "leaf" });
      add(check, `${event.settle.join(".")} is ${JSON.stringify(value)}, though its resolver returned a value its type can't represent, which must raise an execution error`);
    } else if (value === null && !errorAt.has(k)) {
      coerced.set(k, { kind: "null" });
      add("coercionErrorReported", `${event.settle.join(".")} is null without an error, though its resolver returned a value its type can't represent, which must raise an execution error`);
    }
  }

  // §3.5.1: an Int outside 32 bits "should" raise an execution error, and
  // §3.5.5: an ID, "while it is often numeric, it must always serialize as
  // a String" (an ID service may also raise, if it can't coerce it). Either
  // way the position must not be null without an error. The reference is
  // given the position as the implementation completed it: a leaf if it
  // holds a value, an error if an error is at its path, null otherwise.
  for (const event of valued) {
    const k = pathKey(event.settle.map(String));
    const value = valueAt(event.settle.map((s) => (/^\d+$/.test(s) ? Number(s) : s)));
    const named = graphql.getNamedType(at(event.settle)?.type ?? graphql.GraphQLString).name;
    if (errorAt.has(k)) {
      coerced.set(k, { kind: "error" });
    } else if (value === null) {
      coerced.set(k, { kind: "null" });
      add("coercionErrorReported", `${event.settle.join(".")} is null without an error, though its resolver returned ${JSON.stringify(event.outcome.value)}, which must be coerced to a valid value or raise an execution error`);
    } else if (value !== undefined) {
      coerced.set(k, { kind: "leaf" });
      if (named === "Int") {
        add("intRange", `${event.settle.join(".")} is ${JSON.stringify(value)}, though its resolver returned ${event.outcome.value}, outside 32 bits (§3.5.1: should raise an execution error)`);
      } else if (named === "ID" && value !== String(event.outcome.value)) {
        add(
          value === event.outcome.value ? "idAsString" : "leafValues",
          `${event.settle.join(".")} is ${JSON.stringify(value)}, though its resolver returned the integer ${event.outcome.value}, which an ID serializes as ${JSON.stringify(String(event.outcome.value))}`,
        );
      }
    }
  }

  // Leaf values: the reference abstracts them away, so check them here
  // against the canonical value for the position's type in the fixture.
  // A position whose resolver returned an uncoercible value is graded above
  // only, by intFraction, resultCoercion or coercionErrorReported.
  const skipLeaf = new Set([...uncoercible, ...valued].map((e) => pathKey(e.settle.map(String))));
  // The positions that are __typename, aliased or not: the reference
  // compares their values (jsonToTla).
  const typenames = new Set();
  const walk = (value, path) => {
    if (value === null) return;
    if (Array.isArray(value)) return value.forEach((v, i) => walk(v, [...path, i]));
    if (isMap(value)) return Object.entries(value).forEach(([k, v]) => walk(v, [...path, k]));
    const position = at(path);
    if (!position) return add("dataShape", `data has a value at ${path.join(".")}, which the operation doesn't select`);
    if (path.length > 0 && position.names.at(-1) === "__typename") return void typenames.add(pathKey(path.map(String)));
    if (skipLeaf.has(pathKey(path.map(String)))) return;
    const canonical = leafValue(position.type);
    if (value === canonical) return;
    // The right value as the wrong JSON type, such as "1" for Int 1: §7.2.1
    // says which JSON values "should be used".
    if (typeof value !== typeof canonical && String(value) === String(canonical)) {
      const named = graphql.getNamedType(position.type).name;
      return warn("leafEncoding", `${named} values are written as JSON ${typeof value}s (§7.2.1: should be ${typeof canonical}s)`);
    }
    add("leafValues", `${path.join(".")} is ${JSON.stringify(value)}, not the canonical ${JSON.stringify(canonical)}`);
  };
  walk(response.data ?? null, []);

  if (problems.length === 0) return { warnings, warningIds, case: referenceCase(c, response.data, errors.map((e) => e.path), coerced, typenames) };
  // What the reference can still check of a malformed case: nothing if the
  // adapter broke the protocol, a position settled twice with different
  // outcomes, there is no data, or data holds a position the operation
  // doesn't select; only the clauses on data and calls if error paths are
  // unusable; everything otherwise. Extra calls (callsOnce, callsSelected,
  // callsReachable, mutationFieldsOnce) leave the trace usable: the outcome
  // at each position is still the one the response was built from.
  if (!consistent || ids.some((id) => id === "protocol" || id === "dataPresent" || id === "dataShape")) return { problems, ids };
  const usable = errors.every((e) => isMap(e) && Array.isArray(e.path)) && !ids.some((id) => ERROR_PATH_CHECKS.has(id));
  const clauses = usable ? "all" : "data";
  const paths = clauses === "all" ? errors.map((e) => e.path) : [];
  return { problems, ids, clauses, case: referenceCase(c, response.data, paths, coerced, typenames) };
};

// ---------------------------------------------------------------------------
// TLA+

const str = (s) => JSON.stringify(String(s));
const seq = (items) => `<<${items.join(", ")}>>`;
const NO_OUTCOME = { kind: "", type: "", length: 0 };
const outcomeToTla = (o) =>
  `[kind |-> ${str(o.kind)}, type |-> ${str(o.type ?? "")}, length |-> ${Number(o.length ?? 0)}]`;

// `typenames` holds the path keys of the positions that are __typename,
// aliased or not (normalize); without it, the key "__typename" says so.
const jsonToTla = (value, typenames, path = []) => {
  if (value === null) return `[kind |-> "null", value |-> "", entries |-> <<>>, items |-> <<>>]`;
  if (Array.isArray(value)) {
    return `[kind |-> "list", value |-> "", entries |-> <<>>, items |-> ${seq(value.map((v, i) => jsonToTla(v, typenames, [...path, String(i)])))}]`;
  }
  if (typeof value === "object") {
    return `[kind |-> "object", value |-> "", items |-> <<>>, entries |-> ${seq(
      Object.entries(value).map(([k, v]) => `[key |-> ${str(k)}, value |-> ${jsonToTla(v, typenames, [...path, k])}]`),
    )}]`;
  }
  // Leaf values are abstracted away, except __typename's.
  const typename = typenames ? typenames.has(pathKey(path)) : path.at(-1) === "__typename";
  return `[kind |-> "leaf", value |-> ${typename ? str(value) : '""'}, entries |-> <<>>, items |-> <<>>]`;
};

// Whether every call in a trace carries the adapter's `after` stamp.
export const isStamped = (trace) => trace.every((e) => !e.call || e.inline || Number.isInteger(e.after));

// A mutation's trace in the order the engine saw things: each call right
// after the settles the adapter had applied when the resolver was called
// (its `after` stamp). A stamp can be late but never early, so a call is
// never placed before something it waited for. Without stamps, the order
// messages arrived in.
const engineOrder = (trace) => {
  if (!isStamped(trace)) return trace;
  // Each settle the adapter was sent, with the inline item events that
  // came with it.
  const blocks = [];
  for (const e of trace) {
    if (e.inline) blocks.at(-1)?.push(e);
    else if (e.settle) blocks.push([e]);
  }
  const calls = trace.filter((e) => e.call && !e.inline);
  return [
    ...calls.filter((e) => e.after === 0),
    ...blocks.flatMap((block, i) => [...block, ...calls.filter((e) => e.after === i + 1)]),
  ];
};

// The reference reads a trace only for CalledSerially, which needs a
// mutation's calls and settles. Other cases drop it, so more cases are the
// same case.
export const caseToTla = (fixture, c) => {
  const settles = c.trace.filter((e) => e.settle);
  const outcomes =
    settles.length === 0
      ? "<<>>"
      : settles.map((e) => `(${seq(e.settle.map(str))} :> ${outcomeToTla(e.outcome)})`).join(" @@ ");
  const kept = fixture.operationType === "mutation" ? engineOrder(c.trace) : [];
  const trace = seq(
    kept.map((e) =>
      e.call
        ? `[kind |-> "call", path |-> ${seq(e.call.map(str))}, outcome |-> ${outcomeToTla(NO_OUTCOME)}]`
        : `[kind |-> "settle", path |-> ${seq(e.settle.map(str))}, outcome |-> ${outcomeToTla(e.outcome)}]`,
    ),
  );
  return `[fixture |-> ${str(c.fixture)}, outcomes |-> ${outcomes}, trace |-> ${trace}, data |-> ${jsonToTla(
    c.data,
    c.typenames,
  )}, errors |-> ${seq(c.errors.map((p) => seq(p.map(str))))}]`;
};

const shardModule = (tla) => `---- MODULE Shard ----
EXTENDS Cases

Checked == ${seq(tla)}

\\* One verdict line per case, and the expected data for each failing one.
\\* The checker counts verdicts, so a line it can't read fails the run
\\* instead of passing a case.
ASSUME \\A i \\in DOMAIN Checked :
  LET failures == Failures(Checked[i]) IN
  /\\ PrintT(<<"verdict", i, failures>>)
  /\\ (failures = {} \\/ PrintT(<<"expected", i, ExpectedText(Checked[i])>>))
ASSUME PrintT(<<"checked", Len(Checked)>>)

VARIABLE done
Init == done = FALSE
Next == UNCHANGED done
====
`;

const runTla = (dir) => runChecker(["-workers", "1", "Shard.tla"], { cwd: dir });

const unescape = (s) => JSON.parse(`"${s}"`);

// Evaluates Failures for each TLA+ case. Returns, per case, the set of
// failed clauses and the expected data.
export const evaluate = async (tlaCases) => {
  if (tlaCases.length === 0) return [];
  const shards = [];
  for (let i = 0; i < tlaCases.length; i += SHARD_SIZE) shards.push(tlaCases.slice(i, i + SHARD_SIZE));
  const results = new Array(tlaCases.length).fill(null).map(() => ({ failures: [], expected: "" }));
  const base = mkdtempSync(join(tmpdir(), "graphql-tla-"));
  try {
    let next = 0;
    const worker = async () => {
      while (next < shards.length) {
        const index = next++;
        const dir = join(base, String(index));
        cpSync(join(root, "specs/Reference.tla"), join(dir, "Reference.tla"));
        cpSync(join(root, "specs/Fixtures.tla"), join(dir, "Fixtures.tla"));
        cpSync(join(root, "kit/execution/Cases.tla"), join(dir, "Cases.tla"));
        writeFileSync(join(dir, "Shard.tla"), shardModule(shards[index]));
        writeFileSync(join(dir, "Shard.cfg"), "INIT Init\nNEXT Next\n");
        const { status, output } = await runTla(dir);
        // tla-ts wraps long values across lines, so read the output with
        // line breaks collapsed. Strings are never broken.
        const flat = output.replace(/\s*\n\s*/g, " ");
        if (status !== 0 || !new RegExp(`<<\\s*"checked",\\s*${shards[index].length}\\s*>>`).test(flat)) {
          const lines = output.split("\n").filter((l) => /Error|error|Exception/.test(l)).slice(0, 10);
          throw new Error(`tla-ts failed on shard ${index}:\n${lines.map((l) => l.slice(0, 300)).join("\n")}`);
        }
        const verdicts = [...flat.matchAll(/<<\s*"verdict",\s*(\d+),\s*\{([^}]*)\}\s*>>/g)];
        const seen = new Set(verdicts.map((m) => m[1]));
        if (verdicts.length !== shards[index].length || seen.size !== shards[index].length) {
          throw new Error(`read ${seen.size} verdicts from shard ${index}, which has ${shards[index].length} cases`);
        }
        for (const match of verdicts) {
          const i = index * SHARD_SIZE + Number(match[1]) - 1;
          results[i].failures = match[2].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
        }
        for (const match of flat.matchAll(/<<\s*"expected",\s*(\d+),\s*"((?:[^"\\]|\\.)*)"\s*>>/g)) {
          results[index * SHARD_SIZE + Number(match[1]) - 1].expected = unescape(match[2]);
        }
        for (const [i, r] of results.slice(index * SHARD_SIZE, (index + 1) * SHARD_SIZE).entries()) {
          if (r.failures.length > 0 && r.expected === "") {
            throw new Error(`no expected data read for failing case ${i + 1} of shard ${index}`);
          }
        }
      }
    };
    // TLA_WORKERS caps the tla-ts processes; by default, half the cores.
    const limit = Number(process.env.TLA_WORKERS) || Math.floor(availableParallelism() / 2) || 1;
    const workers = Math.max(1, Math.min(shards.length, limit));
    await Promise.all(Array.from({ length: workers }, worker));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  return results;
};

// ---------------------------------------------------------------------------
// Reporting

const describeOutcome = (o) =>
  o.kind === "object" ? `object(${o.type})` : o.kind === "list" ? `list(${o.length})` : o.kind;
export const describeTrace = (trace) =>
  trace
    .map((e) => (e.call ? `call ${e.call.join(".")}` : `settle ${e.settle.join(".")} = ${describeOutcome(e.outcome)}`))
    .join("; ");

// The shipped control corpus (scripts/generate-controls.mjs).
export const loadCorpus = () => JSON.parse(readFileSync(join(root, "kit/execution/controls.json"), "utf8"));

// Whether a control was caught the way it says: as a malformed case that
// breaks its check, as a well-formed case that breaks its SHOULD check
// ("warning"), or by the reference clause it names.
export const controlCaught = (control, prepared, result) =>
  control.clause === "malformed"
    ? Boolean(prepared.problems) && (!control.check || prepared.ids.includes(control.check))
    : control.clause === "warning"
      ? !prepared.problems && prepared.warningIds.includes(control.check)
      : !prepared.problems && result.failures.includes(control.clause);

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The kind of a problem, without its details, for grouping.
const problemKind = (problem) =>
  problem
    .replace(/: [{[].*$/, "")
    .replace(/ \(§[^)]*\)$/, "")
    .replace(/^[\w.]+ is .*, not the canonical .*/, "a leaf isn't the canonical value")
    .replace(/\[.*?\]|\S+\.\S+|"[^"]*"/g, "…");
// A streamed subscription's log, one step after another.
export const describeLog = (stream) =>
  `${stream?.scenario ?? "a stream"}: ` +
  (stream?.log ?? [])
    .map((e) =>
      e.kit === "emit"
        ? `kit emits event ${e.event}`
        : e.kit
          ? `kit ${e.kit === "cancel" ? "cancels the response stream" : `${e.kit === "fail" ? "fails" : "completes"} the source`}`
          : e.adapter === "response"
            ? `result${e.event ? ` for event ${e.event}` : ""}`
            : e.adapter === "stream-error"
              ? "the response stream completes with an error"
              : e.adapter === "done"
                ? "the response stream completes"
                : e.adapter === "source-cancelled"
                  ? "the source is cancelled"
                  : String(e.adapter),
    )
    .join("; ");
const responseText = (raw) =>
  "stream" in raw
    ? describeLog(raw.stream)
    : "streamError" in raw
      ? `the response stream failed: ${JSON.stringify(raw.streamError)}`
      : "noResponse" in raw
        ? `no response: ${JSON.stringify(raw.noResponse)}`
        : JSON.stringify(raw.response);
const answered = (raw) => !("streamError" in raw) && !("noResponse" in raw) && !("stream" in raw);

// Sorts cases for checking and reporting: the malformed ones with their
// problems; the warnings, one per case for each check and text, graded by
// the case's own fixture; the distinct well-formed cases, each with its
// shortest submitted case; and the distinct malformed cases the reference
// can still check (`partials`), each with its shortest submitted case and
// the clauses that count. `tla` lists what to evaluate: the cases, then the
// partials.
const collect = (byId, rawCases, prepare) => {
  const malformed = [];
  const warnings = [];
  const distinct = new Map();
  const partials = new Map();
  const tlaOf = new Map();
  for (const raw of rawCases) {
    const prepared = prepare(raw);
    if (prepared.problems) {
      let partial;
      if (prepared.tla) {
        const key = `${prepared.clauses}\u0000${prepared.tla}`;
        partial = partials.get(key);
        if (!partial) partials.set(key, (partial = { tla: prepared.tla, clauses: prepared.clauses, case: prepared.case, raw }));
        else if (prepared.case.trace.length < partial.case.trace.length) Object.assign(partial, { case: prepared.case, raw });
      }
      malformed.push({ raw, problems: prepared.problems, ids: prepared.ids, partial });
      continue;
    }
    // A stream's lifecycle with nothing wrong: nothing for the reference.
    if (prepared.lifecycle) continue;
    tlaOf.set(raw, prepared.tla);
    const seen = new Set();
    prepared.warnings.forEach((text, i) => {
      const check = prepared.warningIds[i];
      const id = gradedAs(byId.get(raw.fixture), check);
      if (seen.has(`${id}\u0000${text}`)) return;
      seen.add(`${id}\u0000${text}`);
      warnings.push({ raw, id, check, text });
    });
    const shortest = distinct.get(prepared.tla);
    if (!shortest || prepared.case.trace.length < shortest.case.trace.length) distinct.set(prepared.tla, { ...prepared, raw });
  }
  const cases = [...distinct.values()];
  const partialList = [...partials.values()];
  return { rawCases, malformed, warnings, cases, partials: partialList, tlaOf, tla: [...cases.map((c) => c.tla), ...partialList.map((p) => p.tla)] };
};

// Splits the verdicts on collected.tla into results (for the cases) and
// partialResults (for the partials), keeping only the clauses that count
// for each partial.
const split = (collected, verdicts) => ({
  results: verdicts.slice(0, collected.cases.length),
  partialResults: collected.partials.map((p, i) => {
    const r = verdicts[collected.cases.length + i];
    return { ...r, failures: r.failures.filter((f) => p.clauses === "all" || DATA_CLAUSES.has(f)) };
  }),
});

// What's wrong with a report whatever the cases: a check failing on more
// cases than it applies to.
const overcounted = (report) =>
  report.checks
    .filter((c) => c.failing > c.cases)
    .map((c) => `${c.id} fails on ${c.failing} of ${c.cases} cases`)
    .join("; ");

// Normalizes a case and turns it into TLA+.
const preparer = (byId) => (raw) => {
  const fixture = byId.get(raw.fixture);
  if (!fixture) return { problems: [`unknown fixture ${raw.fixture}`], ids: ["protocol"] };
  const result = normalize(fixture, raw);
  return result.case ? { ...result, tla: caseToTla(fixture, result.case) } : result;
};

// What's wrong with a report control's report (controls.mjs), or "".
const reportControlProblem = (byId, control, collected, verdicts) => {
  const report = buildReport({ byId, ...collected, ...split(collected, verdicts), strict: control.strict, selfTest: true, controls: 0, implementation: "report control", capabilities: [], skipped: [], provenance: {} });
  return control.expect(report, collected.rawCases) || overcounted(report);
};

// The same, for scripts/generate-controls.mjs.
export const judgeReportControl = async (fixtures, control, rawCases) => {
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  const collected = collect(byId, rawCases, preparer(byId));
  return reportControlProblem(byId, control, collected, await evaluate(collected.tla));
};

// Checks cases against the reference, alongside the control corpus.
// `fixtures` must be every fixture the cases and the corpus use. Returns
// { ok, report }: ok if every case passes and the checker passes its
// self-test.
export const check = async (fixtures, rawCases, { strict = false, log = console.log, implementation, capabilities = [], skipped = [], run = {} } = {}) => {
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  const prepare = preparer(byId);

  const collected = collect(byId, rawCases, prepare);
  const { malformed, warnings: warned, cases } = collected;

  // The corpus: bases must pass, controls must be caught, and each report
  // control's report must show what it says. The protocol controls
  // (protocol-controls.mjs) are made here, from the corpus's bases and by
  // hand, for the checks that need a capability the recorded cases don't
  // have: parent values, streams, custom scalars, locations, repeated keys.
  const corpus = loadCorpus();
  const extra = protocolControls(corpus, fixtures);
  const prepareExtra = preparer(new Map([...byId, ...extra.fixtures.map((f) => [f.id, f])]));
  const bases = [...corpus.bases.map(prepare), ...extra.bases.map(({ case: c }) => prepareExtra(c))];
  const baseCases = [...corpus.bases, ...extra.bases.map((b) => b.case)];
  const quiet = [...corpus.bases.map(() => []), ...extra.bases.map((b) => b.quiet ?? [])];
  const controls = [
    ...corpus.controls.map((control) => ({ ...control, prepared: prepare(control.case) })),
    ...extra.controls.map((control) => ({ ...control, prepared: prepareExtra(control.case) })),
  ];
  const reportControls = (corpus.reportControls ?? []).map((stored) => ({
    ...stored,
    control: REPORT_CONTROLS.find((c) => c.name === stored.name),
    collected: collect(byId, stored.cases, prepare),
  }));
  const evaluated = [...bases, ...controls.map((c) => c.prepared)].filter((p) => !p.problems && p.tla);
  const all = await evaluate([
    ...collected.tla,
    ...evaluated.map((p) => p.tla),
    ...reportControls.flatMap((r) => r.collected.tla),
  ]);
  const { results, partialResults } = split(collected, all.slice(0, collected.tla.length));
  const resultOf = new Map(evaluated.map((p, i) => [p, all[collected.tla.length + i]]));
  let offset = collected.tla.length + evaluated.length;
  for (const r of reportControls) {
    r.verdicts = all.slice(offset, offset + r.collected.tla.length);
    offset += r.collected.tla.length;
  }

  let ok = true;
  const streams = rawCases.filter((c) => "stream" in c).length;
  log(`  ${plural(rawCases.length, "case")}, ${cases.length} distinct${streams ? `, ${plural(streams, "subscription stream")}` : ""}`);
  if (rawCases.length === 0) {
    ok = false;
    log("✗ no cases to check");
  }

  // Why a failure doesn't fail the run, if it doesn't.
  const leniency = (id) =>
    isFatal(id, strict)
      ? ""
      : id === OUTSIDE_SPEC
        ? `: outside the spec, informational (${OUTSIDE_SPEC})`
        : LEVEL.get(id) === "INFO"
          ? `: informational, no spec sentence requires it (${id})`
          : ": a SHOULD, fails with --strict";

  // Malformed cases, grouped by problem.
  const problems = new Map();
  for (const { raw, problems: list, ids } of malformed) {
    list.forEach((problem, i) => {
      const id = gradedAs(byId.get(raw.fixture), ids[i]);
      const key = `${raw.fixture}: ${problemKind(problem)}`;
      const group = problems.get(`${id}\u0000${key}`) ?? { key, count: 0, raw, problem, id };
      group.count++;
      problems.set(`${id}\u0000${key}`, group);
    });
  }
  let informational = 0;
  for (const { key, count, raw, problem, id } of problems.values()) {
    const fatal = isFatal(id, strict);
    if (fatal) ok = false;
    log(`${fatal ? "✗" : "!"} malformed: ${key} (${plural(count, "case")})${leniency(id)}`);
    log(`    e.g.:     ${problem}`);
    log(`    trace:    ${describeTrace(raw.trace ?? [])}`);
    log(`    response: ${responseText(raw)}`);
  }
  // Warnings, grouped by text and by how they're graded, each case once.
  const warningGroups = new Map();
  for (const { id, text } of warned) {
    const group = warningGroups.get(`${id}\u0000${text}`) ?? { id, text, count: 0 };
    group.count++;
    warningGroups.set(`${id}\u0000${text}`, group);
  }
  for (const { id, text, count } of warningGroups.values()) {
    const fatal = isFatal(id, strict);
    if (fatal) ok = false;
    log(`${fatal ? "✗" : "!"} ${text} (${plural(count, "case")})${leniency(id)}`);
  }

  // Failures, grouped by fixture and failed clauses, each shown by its
  // shortest case.
  const groups = new Map();
  cases.forEach((c, i) => {
    const { failures, expected } = results[i];
    if (failures.length === 0) return;
    const key = `${c.case.fixture}: ${failures.sort().join(", ")}`;
    const group = groups.get(key) ?? { count: 0, example: null, failures };
    group.count++;
    if (!group.example || c.case.trace.length < group.example.case.trace.length) group.example = { ...c, expected };
    groups.set(key, group);
  });
  // Malformed cases the reference could still check, grouped the same way.
  const partialGroups = new Map();
  collected.partials.forEach((p, i) => {
    const { failures, expected } = partialResults[i];
    if (failures.length === 0) return;
    const key = `${p.case.fixture}: ${failures.sort().join(", ")}${p.clauses === "data" ? " (of the clauses on data and calls)" : ""}`;
    const group = partialGroups.get(key) ?? { count: 0, example: null, failures };
    group.count++;
    if (!group.example || p.case.trace.length < group.example.case.trace.length) group.example = { ...p, expected };
    partialGroups.set(key, group);
  });
  for (const [key, { count, example, failures }] of partialGroups) {
    const ids = [...new Set(failures.map((f) => gradedAs(byId.get(example.case.fixture), f)))];
    const fatal = ids.some((id) => isFatal(id, strict));
    if (fatal) ok = false;
    log(`${fatal ? "✗" : "!"} malformed, and also: ${key} (${plural(count, "distinct case")})${fatal ? "" : leniency(ids.includes(OUTSIDE_SPEC) ? OUTSIDE_SPEC : ids[0])}`);
    log(`    trace:    ${describeTrace(example.case.trace)}`);
    log(`    response: ${responseText(example.raw)}`);
    log(`    expected: data ${example.expected}`);
  }
  let warnings = 0;
  let failing = 0;
  for (const [key, { count, example, failures }] of groups) {
    const ids = [...new Set(failures.map((f) => gradedAs(byId.get(example.case.fixture), f)))];
    const fatal = ids.some((id) => isFatal(id, strict));
    if (fatal) {
      ok = false;
      failing += count;
    } else if (ids.includes(OUTSIDE_SPEC)) informational += count;
    else warnings += count;
    log(`${fatal ? "✗" : "!"} ${key} (${plural(count, "case")})${fatal ? "" : leniency(ids.includes(OUTSIDE_SPEC) ? OUTSIDE_SPEC : ids[0])}`);
    log(`    trace:    ${describeTrace(example.case.trace)}`);
    log(`    response: ${responseText(example.raw)}`);
    log(`    expected: data ${example.expected}`);
  }

  // The checker's self-test.
  let selfTest = true;
  bases.forEach((base, i) => {
    // A base must pass, and have none of the SHOULD warnings its own
    // controls are caught by (`quiet`), or they'd prove nothing.
    const failures = base.problems ?? [...(resultOf.get(base)?.failures ?? []), ...base.warningIds.filter((id) => quiet[i].includes(id))];
    if (failures.length > 0) {
      selfTest = false;
      log(`✗ control base ${i} (${baseCases[i].fixture}) doesn't pass: ${failures.join("; ")}`);
    }
  });
  for (const control of controls) {
    const caught = controlCaught(control, control.prepared, resultOf.get(control.prepared));
    if (!caught) {
      selfTest = false;
      const got = control.prepared.problems ?? [...control.prepared.warningIds, ...(resultOf.get(control.prepared)?.failures ?? [])];
      log(`✗ control "${control.name}" wasn't caught by ${control.check ?? control.clause} (got: ${got.join("; ") || "nothing"})`);
    }
  }
  for (const control of REPORT_CONTROLS) {
    if (!reportControls.some((r) => r.name === control.name)) {
      selfTest = false;
      log(`✗ report control "${control.name}" isn't in kit/execution/controls.json (run node scripts/generate-controls.mjs)`);
    }
  }
  for (const r of reportControls) {
    const problem = r.control ? reportControlProblem(byId, r.control, r.collected, r.verdicts) : "it isn't in kit/execution/controls.mjs";
    if (problem) {
      selfTest = false;
      log(`✗ report control "${r.name}": ${problem}`);
    }
  }
  const controlCount = controls.length + reportControls.length;

  // The summary, always: what passed, alongside what didn't.
  const passed = cases.length - failing - warnings - informational;
  const partialFailing = partialResults.filter((r) => r.failures.length > 0).length;
  const should = warnings ? `, ${warnings} more break only a SHOULD` : "";
  const info = informational ? `, ${informational} more fail only outside the spec (${OUTSIDE_SPEC})` : "";
  log(
    `${failing === 0 && cases.length > 0 ? "✓" : "✗"} ${passed} of ${cases.length} distinct well-formed cases satisfy the reference${should}${info}` +
      (malformed.length ? `; ${plural(malformed.length, "case")} malformed` : "") +
      (partialFailing ? ` (${partialFailing} distinct ones also break the reference)` : ""),
  );
  const unstamped = cases.filter((c) => byId.get(c.case.fixture).operationType === "mutation" && !isStamped(c.case.trace));
  if (unstamped.length > 0) {
    log(`! ${plural(unstamped.length, "mutation case")} without \`after\` stamps: calledSerially used the order messages arrived in, so it can catch a non-serial engine but can't prove a serial one`);
  }

  const report = buildReport({
    byId,
    ...collected,
    results,
    partialResults,
    strict,
    selfTest,
    controls: controlCount,
    implementation: implementation ?? rawCases[0]?.implementation ?? "unknown",
    capabilities,
    skipped,
    provenance: provenance({ strict, ...run }),
  });
  const over = overcounted(report);
  if (over) {
    selfTest = false;
    report.checkerSelfTest = "failed";
    log(`✗ the report counts more failing cases than cases: ${over}`);
  }
  if (selfTest) log(`✓ the checker catches all ${controlCount} negative controls`);
  else ok = false;
  return { ok, report };
};

// ---------------------------------------------------------------------------
// The report: the facts behind a conformance sheet (docs/conformance.md).

// Which cases each check applies to. Checks of the response's errors apply
// to cases with errors, and so on; the rest apply to every case.
const hasErrors = (r) => Array.isArray(r?.errors) && r.errors.length > 0;
const APPLIES = {
  dataShape: (raw) => raw.response?.data != null,
  leafValues: (raw) => raw.response?.data != null,
  leafEncoding: (raw) => raw.response?.data != null,
  errorFormat: (raw) => hasErrors(raw.response),
  errorLocations: (raw) => hasErrors(raw.response) && raw.response.errors.some((e) => isMap(e) && "locations" in e),
  errorLocationsPresent: (raw) => hasErrors(raw.response),
  errorLocationsAccurate: (raw) => hasErrors(raw.response) && raw.response.errors.some((e) => isMap(e) && Array.isArray(e.locations) && e.locations.length > 0),
  uniqueKeys: answered,
  parentValue: (raw) => raw.initialValue !== undefined,
  // A stream's lifecycle checks apply to the scenarios that exercise them.
  completesWithSource: (raw) => streamDid(raw, "complete"),
  failsWithSource: (raw) => streamDid(raw, "fail"),
  cancelCompletes: (raw) => streamDid(raw, "cancel"),
  cancelCancelsSource: (raw) => streamDid(raw, "cancel"),
  nothingAfterCancel: (raw) => streamDid(raw, "cancel"),
  errorPath: (raw) => hasErrors(raw.response),
  errorEntries: (raw) => hasErrors(raw.response),
  responsePosition: (raw) => hasErrors(raw.response),
  errorPathFull: (raw) => hasErrors(raw.response),
  resultMap: answered,
  dataPresent: (raw) => answered(raw) && isMap(raw.response),
  // Only cases where a resolver returned a value its type can't represent:
  // a fraction at an Int position for intFraction, anything else for
  // resultCoercion, either for coercionErrorReported.
  resultCoercion: (raw, fixture) => uncoercibleChecks(raw, fixture).has("resultCoercion"),
  intFraction: (raw, fixture) => uncoercibleChecks(raw, fixture).has("intFraction"),
  coercionErrorReported: (raw, fixture) => answered(raw) && (uncoercibleChecks(raw, fixture).size > 0 || valuedLeaves(raw).length > 0),
  intRange: (raw, fixture) => answered(raw) && valuedLeaves(raw, fixture, "Int").length > 0,
  idAsString: (raw, fixture) => answered(raw) && valuedLeaves(raw, fixture, "ID").length > 0,
  additionalEntries: (raw) => answered(raw) && isMap(raw.response),
  errorsList: (raw) => answered(raw) && isMap(raw.response),
  extensions: (raw) => isMap(raw.response) && "extensions" in raw.response,
};
// The settles where a built-in scalar's resolver returned an internal value
// of another type or range (scalar-results), of the named type if given.
const valuedLeaves = (raw, fixture, named) => {
  const settles = (raw.trace ?? []).filter((e) => Array.isArray(e.settle) && e.outcome?.kind === "leaf" && "value" in e.outcome);
  if (!named || settles.length === 0) return settles;
  const at = positions(fixture, raw.trace);
  return settles.filter((e) => graphql.getNamedType(at(e.settle)?.type ?? graphql.GraphQLString).name === named);
};
const streamDid = (raw, action) => (raw.stream?.log ?? []).some((e) => e?.kit === action);
const uncoercibleChecks = (raw, fixture) => {
  const settles = (raw.trace ?? []).filter((e) => Array.isArray(e.settle) && e.outcome?.kind === "uncoercible");
  if (!fixture || settles.length === 0) return new Set();
  const at = positions(fixture, raw.trace);
  return new Set(settles.map((e) => coercionCheck(at, e.settle)));
};

// The problems a malformed case counts against, by index: the first problem
// of each check it breaks, so one problem never hides another check's
// failure. If the adapter broke the protocol, only the problems of the
// trace count: the response came from a run the adapter misreported, so
// what it says about the implementation can't be relied on.
const countedProblems = (fixture, ids) => {
  const adapterBroke = ids.includes("protocol");
  const kept = new Map();
  ids.forEach((id, i) => {
    if (adapterBroke && !TRACE_CHECKS.has(id)) return;
    const graded = gradedAs(fixture, id);
    if (!kept.has(graded)) kept.set(graded, i);
  });
  return [...kept.values()];
};

const buildReport = ({ byId, rawCases, malformed, warnings, cases, partials = [], tlaOf, results, partialResults = [], strict, selfTest, controls, implementation, capabilities, skipped, provenance }) => {
  // Each check's failing cases are a set, so a case counts once per check
  // however many times it breaks it.
  const stats = new Map(CHECKS.map((c) => [c.id, { cases: 0, failing: new Set() }]));
  const findings = new Map();
  // A finding is one kind of failure across fixtures: the clauses a case
  // breaks, or a malformed case's problem, without its details. `member` is
  // the submitted case, each counted once.
  const found = (key, member, finding) => {
    const f = findings.get(key) ?? { ...finding, cases: 0, fixtures: {}, members: new Set() };
    if (f.members.has(member)) return;
    f.members.add(member);
    f.cases++;
    f.fixtures[member.fixture] = (f.fixtures[member.fixture] ?? 0) + 1;
    if (finding.example.trace.length < f.example.trace.length) Object.assign(f, { example: finding.example, problem: finding.problem, fixture: finding.fixture });
    findings.set(key, f);
  };
  const example = (raw, extra = {}) => ({
    trace: raw.trace ?? [],
    ...("stream" in raw
      ? { stream: describeLog(raw.stream) }
      : "streamError" in raw
        ? { streamError: raw.streamError }
        : "noResponse" in raw
          ? { noResponse: raw.noResponse }
          : { response: raw.response }),
    ...extra,
  });

  const malformedOf = new Map(malformed.map((m) => [m.raw, m]));
  const warningsOf = new Map();
  for (const w of warnings) warningsOf.set(w.raw, [...(warningsOf.get(w.raw) ?? []), w]);
  const failuresByTla = new Map(cases.map((c, i) => [c.tla, results[i].failures]));
  // Whether a case in a fixture outside the spec broke something that
  // counts under OUTSIDE_SPEC.
  const brokeOutside = (raw, fixture) => {
    const m = malformedOf.get(raw);
    if (m) return m.ids.some((id) => gradedAs(fixture, id) === OUTSIDE_SPEC);
    return (
      (warningsOf.get(raw) ?? []).some((w) => w.id === OUTSIDE_SPEC) ||
      (failuresByTla.get(tlaOf.get(raw)) ?? []).some((f) => gradedAs(fixture, f) === OUTSIDE_SPEC)
    );
  };

  // Checks made before the reference, over every case submitted. In a
  // fixture outside the spec, the checks graded as OUTSIDE_SPEC apply only
  // through it.
  for (const raw of rawCases) {
    const fixture = byId.get(raw.fixture);
    for (const check of CHECKS) {
      if (check.reference || check.id === OUTSIDE_SPEC) continue;
      if (gradedAs(fixture, check.id) !== check.id) continue;
      if (check.subscriptionOnly && fixture?.operationType !== "subscription") continue;
      // A stream's lifecycle case has only the lifecycle checks; every other
      // case has none of them.
      if (Boolean(check.streamOnly) !== ("stream" in raw)) continue;
      if (check.mutationOnly && fixture?.operationType !== "mutation") continue;
      if (APPLIES[check.id] && !APPLIES[check.id](raw, fixture)) continue;
      stats.get(check.id).cases++;
    }
    if (outsideSpec(fixture)) {
      stats.get(OUTSIDE_SPEC).cases++;
      if (brokeOutside(raw, fixture)) stats.get(OUTSIDE_SPEC).failing.add(raw);
    }
    const m = malformedOf.get(raw);
    if (!m) continue;
    for (const i of countedProblems(fixture, m.ids)) {
      const id = gradedAs(fixture, m.ids[i]);
      const kind = problemKind(m.problems[i]);
      if (id !== OUTSIDE_SPEC) stats.get(id).failing.add(raw);
      found(`${id}\u0000${kind}`, raw, {
        checks: [id],
        summary: id === OUTSIDE_SPEC ? `with error propagation off, ${m.ids[i]}: ${kind}` : kind,
        fixture: raw.fixture,
        problem: m.problems[i],
        example: example(raw),
      });
    }
  }
  for (const { raw, id, check, text } of warnings) {
    if (id !== OUTSIDE_SPEC) stats.get(id).failing.add(raw);
    found(`${id}\u0000${problemKind(text)}`, raw, {
      checks: [id],
      summary: id === OUTSIDE_SPEC ? `with error propagation off, ${check}: ${problemKind(text)}` : problemKind(text),
      fixture: raw.fixture,
      problem: text,
      example: example(raw),
    });
  }

  // The reference's clauses, over the distinct well-formed cases, and the
  // distinct malformed cases it could still check (only the clauses that
  // count for each). Every clause a case breaks counts against that clause;
  // the finding is the set of clauses it breaks. In a fixture outside the
  // spec, the clauses graded as OUTSIDE_SPEC make a finding of their own.
  const graded = (c, failures, expectedData, inScope) => {
    const fixture = byId.get(c.case.fixture);
    const mutation = fixture.operationType === "mutation";
    for (const check of CHECKS) {
      if (!check.reference || (check.mutationOnly && !mutation) || !inScope(check.id)) continue;
      if (gradedAs(fixture, check.id) !== check.id) continue;
      // Graded only on serial runs (Cases!Failures).
      if (check.id === "serialErrorsKept" && failures.includes("calledSerially")) continue;
      stats.get(check.id).cases++;
      if (failures.includes(check.id)) stats.get(check.id).failing.add(c);
    }
    const own = failures.filter((f) => gradedAs(fixture, f) === f).sort();
    const outside = failures.filter((f) => gradedAs(fixture, f) === OUTSIDE_SPEC).sort();
    const expected = { expected: `data ${expectedData}` };
    if (outside.length > 0) {
      found(`${OUTSIDE_SPEC},${outside.join(",")}`, c.raw, {
        checks: [OUTSIDE_SPEC],
        summary: `with error propagation off, breaks ${outside.join(", ")}`,
        fixture: c.case.fixture,
        example: example(c.raw, expected),
      });
    }
    if (own.length > 0) found(own.join(","), c.raw, { checks: own, fixture: c.case.fixture, example: example(c.raw, expected) });
  };
  cases.forEach((c, i) => graded(c, results[i].failures, results[i].expected, () => true));
  partials.forEach((p, i) =>
    graded(p, partialResults[i].failures, partialResults[i].expected, (id) => p.clauses === "all" || DATA_CLAUSES.has(id)),
  );

  const ran = new Set(rawCases.map((c) => c.fixture));
  const unstamped = cases.some((c) => byId.get(c.case.fixture).operationType === "mutation" && !isStamped(c.case.trace));
  // The cases of a fixture in the findings `keep` selects, each once.
  const membersIn = (fixture, keep) => {
    const members = new Set();
    for (const f of findings.values()) if (keep(f)) for (const m of f.members) if (m.fixture === fixture) members.add(m);
    return members.size;
  };
  return {
    format: REPORT_FORMAT,
    area: "execution",
    implementation,
    capabilities: [...capabilities].sort(),
    provenance,
    checkerSelfTest: selfTest ? `passed (${controls} negative controls)` : "failed",
    cases: { submitted: rawCases.length, distinct: cases.length, malformed: malformed.length },
    adapterProblems: stats.get("protocol").failing.size,
    checks: CHECKS.map((check) => {
      const s = stats.get(check.id);
      const note =
        check.id === "calledSerially" && unstamped
          ? "without `after` stamps: can catch a non-serial engine, can't prove a serial one"
          : check.id === "extensions" && s.cases === 0
            ? "no response had an extensions entry, so there was nothing to grade (§7.1.7: the entry is a may)"
            : undefined;
      return {
        id: check.id,
        title: check.title,
        level: check.level,
        ...(check.levels ? { levels: check.levels } : {}),
        ...(check.since ? { since: check.since } : {}),
        ...(check.requires ? { requires: check.requires } : {}),
        spec: check.spec.map(section),
        ...(check.basis ? { basis: check.basis } : {}),
        status: s.failing.size > 0 ? "fail" : s.cases > 0 ? (note && check.id === "calledSerially" ? "inconclusive" : "pass") : "untested",
        cases: s.cases,
        failing: s.failing.size,
        ...(note ? { note } : {}),
      };
    }),
    findings: [...findings.values()]
      .sort((a, b) => b.cases - a.cases)
      .map(({ members: _, ...f }) => ({ ...f, example: { ...f.example, trace: describeTrace(f.example.trace) } })),
    fixtures: [...byId.values()]
      .filter((f) => ran.has(f.id) || skipped.some((x) => x.fixture === f.id))
      .map((f) => {
        const skip = skipped.find((x) => x.fixture === f.id);
        const failing = membersIn(f.id, (x) => x.checks.some((id) => isFatal(id, strict)));
        const informational = membersIn(f.id, (x) => x.checks.includes(OUTSIDE_SPEC));
        return {
          id: f.id,
          spec: f.spec.map(section),
          status: skip ? "skipped" : failing > 0 ? "fail" : "pass",
          ...(skip ? { reason: `needs ${skip.needs.join(", ")}` } : {}),
          cases: rawCases.filter((c) => c.fixture === f.id).length,
          failing,
          ...(outsideSpec(f) ? { informational, note: `outside the spec (graphql-js 17's @experimental_disableErrorPropagation): its failures are informational, under ${OUTSIDE_SPEC}, except protocol problems and the checks on resolver calls` } : {}),
          ...(f.invalidResults && !capabilities.includes("invalid-results") ? { note: "without results of the wrong shape (no invalid-results capability)" } : {}),
        };
      }),
  };
};
