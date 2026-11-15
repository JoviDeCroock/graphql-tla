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

import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as graphql from "graphql17";
import { REPORT_FORMAT, provenance, section } from "../report.mjs";
import { CHECKS } from "./checks.mjs";
import { REPORT_CONTROLS } from "./controls.mjs";
import { positions } from "./positions.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const cli = join(root, "node_modules/tla-ts/dist/cli.js");

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
const KEEP_OUTSIDE_SPEC = new Set(["protocol", "callsOnce", "callsSelected", "callsReachable", "calledSerially"]);
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
// an error reported under a field name instead of its alias.
const raises = (schema, type, outcome) => {
  if (outcome.kind === "error" || outcome.kind === "uncoercible") return true;
  if (outcome.kind === "null") return graphql.isNonNullType(type);
  const named = graphql.getNamedType(type);
  const expected = graphql.isListType(nullable(type)) ? "list" : graphql.isLeafType(named) ? "leaf" : "object";
  if (outcome.kind !== expected) return true;
  if (expected !== "object") return false;
  const runtime = schema.getType(outcome.type ?? "");
  return !(runtime === named || (graphql.isAbstractType(named) && graphql.isObjectType(runtime) && schema.isSubType(named, runtime)));
};

// The check a value its leaf type can't represent breaks: a fraction for an
// Int is intFraction, a non-finite Float or an unknown enum value
// resultCoercion.
const coercionCheck = (at, path) => (graphql.getNamedType(at(path)?.type ?? graphql.GraphQLString).name === "Int" ? "intFraction" : "resultCoercion");

// The trace's own consistency: each position's resolver is called once and
// settles at most once, after its call. A field called twice is settled
// twice by the kit, so both count against callsOnce.
const traceProblems = (trace, add) => {
  const called = new Set();
  const settled = new Set();
  for (const event of trace) {
    const path = event.call ?? event.settle;
    if (!Array.isArray(path)) {
      add("protocol", `a trace event without a path: ${JSON.stringify(event)}`);
      continue;
    }
    const k = pathKey(path.map(String));
    if (event.call) {
      if (called.has(k)) add("callsOnce", `the resolver at ${path.join(".")} was called twice (§6.3.3 executes each field once)`);
      called.add(k);
    } else {
      if (!called.has(k)) add("protocol", `${path.join(".")} settled without being called`);
      if (settled.has(k)) add("callsOnce", `${path.join(".")} settled twice`);
      settled.add(k);
    }
  }
};

// Calls: each at a position the operation selects, with the type the
// fixture gives it.
const callProblems = (trace, at, add) => {
  for (const event of trace) {
    if (!Array.isArray(event.call)) continue;
    const position = at(event.call);
    if (!position) add("callsSelected", `a resolver was called at ${event.call.join(".")}, which the operation doesn't select`);
    else if (event.type !== undefined && String(position.type) !== event.type) {
      add("protocol", `the call at ${event.call.join(".")} reports type ${event.type}; the fixture says ${position.type}`);
    }
  }
};

// Causality: a resolver below the root is called only once its parent
// position has settled to a value that contains it (an object, or a list
// long enough for the index), and an `after` stamp is a count of settles the
// adapter had been sent by then. Inline item events (a list settled with
// its items, for adapters without deferred-items) come with their list and
// aren't counted as settles the adapter was sent.
const causalProblems = (trace, add) => {
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
    const reachable =
      parent?.kind === "object" || (parent?.kind === "list" && index !== null && index < Number(parent.length ?? 0));
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

// Checks what the reference can't see, and puts the case in the shape the
// TLA+ side reads. Returns { problems, ids } for a malformed case, where
// ids[i] is the check (kit/execution/checks.mjs) problems[i] breaks, and
// { case, warnings, warningIds } otherwise; warnings break a SHOULD.
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
  if (!Array.isArray(c.trace)) return { problems: ["the case has no trace"], ids: ["protocol"] };
  const at = positions(fixture, c.trace);
  const uncoercible = c.trace.filter((e) => Array.isArray(e.settle) && e.outcome?.kind === "uncoercible");
  // The trace comes first, whatever the response: a call the fixture
  // doesn't select, or with the wrong type, is the root cause of whatever
  // follows from it, so it must not be blamed on the response.
  traceProblems(c.trace, add);
  causalProblems(c.trace, add);
  callProblems(c.trace, at, add);
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
  // should have raised a field error (graphql-go passes Infinity through,
  // and then can't serialize it). intFraction is only a SHOULD, so after a
  // fraction for an Int, the missing response also counts as itself.
  if ("noResponse" in c) {
    const message = JSON.stringify(c.noResponse);
    const checks = new Set(uncoercible.map((e) => coercionCheck(at, e.settle)));
    if (checks.size > 0) {
      add(
        checks.has("resultCoercion") ? "resultCoercion" : "intFraction",
        `the implementation produced no response, after a resolver returned a value its type can't represent: ${message}`,
      );
    }
    if (!checks.has("resultCoercion")) {
      add(fixture.operationType === "subscription" ? "eventYieldsResult" : "responds", `the implementation produced no response: ${message}`);
    }
    return { problems, ids };
  }
  const response = c.response;
  if (!isMap(response)) {
    add("errorFormat", "the response isn't a map");
    return { problems, ids };
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
  // field names.
  const raised = new Map();
  for (const event of c.trace) {
    if (!Array.isArray(event.settle) || !event.outcome) continue;
    const position = at(event.settle);
    if (position && raises(fixture.schema, position.type, event.outcome)) {
      raised.set(pathKey(event.settle.map(String)), { path: event.settle, names: position.names });
    }
  }
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
    // musts in the draft, shoulds in October 2021, so they belong to
    // responsePosition rather than errorPath.
    if (!Array.isArray(error.path)) {
      add("responsePosition", `error path ${JSON.stringify(error.path)} isn't a list of path segments (§7.1.4)`);
      continue;
    }
    const reported = pathKey(error.path.map(String));
    const aliased = !raised.has(reported) && [...raised.values()].find((r) => pathKey(r.names) === reported && pathKey(r.path.map(String)) !== reported);
    if (aliased) {
      add(
        "responsePosition",
        `error path ${JSON.stringify(error.path)} uses field names where §7.1.4 wants the response names of ${JSON.stringify(aliased.path)}, where the error was raised`,
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

  // §3.5.1, §3.5.2, §3.9: a leaf value the type can't represent must raise
  // an execution error (a fraction for an Int only should: intFraction), so
  // the position can't hold a value.
  const valueAt = (path) => path.reduce((v, k) => (v === null || typeof v !== "object" ? undefined : v[k]), response.data ?? null);
  for (const event of uncoercible) {
    const value = valueAt(event.settle.map((k) => (/^\d+$/.test(k) ? Number(k) : k)));
    if (value !== undefined && value !== null) {
      add(
        coercionCheck(at, event.settle),
        `${event.settle.join(".")} is ${JSON.stringify(value)}, though its resolver returned a value its type can't represent, which ${coercionCheck(at, event.settle) === "intFraction" ? "should" : "must"} raise an execution error`,
      );
    }
  }

  // Leaf values: the reference abstracts them away, so check them here
  // against the canonical value for the position's type in the fixture.
  const walk = (value, path) => {
    if (value === null) return;
    if (Array.isArray(value)) return value.forEach((v, i) => walk(v, [...path, i]));
    if (isMap(value)) return Object.entries(value).forEach(([k, v]) => walk(v, [...path, k]));
    const position = at(path);
    if (!position) return add("dataShape", `data has a value at ${path.join(".")}, which the operation doesn't select`);
    if (path.length > 0 && path[path.length - 1] === "__typename") return;
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

  return problems.length > 0
    ? { problems, ids }
    : {
        warnings,
        warningIds,
        case: {
          fixture: c.fixture,
          trace: c.trace.map((e) =>
            e.call
              ? { call: e.call.map(String), type: e.type, ...(Number.isInteger(e.after) ? { after: e.after } : {}), ...(e.inline ? { inline: true } : {}) }
              : { settle: e.settle.map(String), outcome: e.outcome, ...(e.inline ? { inline: true } : {}) },
          ),
          data: response.data,
          errors: errors.map((e) => e.path.map(String)),
        },
      };
};

// ---------------------------------------------------------------------------
// TLA+

const str = (s) => JSON.stringify(String(s));
const seq = (items) => `<<${items.join(", ")}>>`;
const NO_OUTCOME = { kind: "", type: "", length: 0 };
const outcomeToTla = (o) =>
  `[kind |-> ${str(o.kind)}, type |-> ${str(o.type ?? "")}, length |-> ${Number(o.length ?? 0)}]`;

const jsonToTla = (value, key = "") => {
  if (value === null) return `[kind |-> "null", value |-> "", entries |-> <<>>, items |-> <<>>]`;
  if (Array.isArray(value)) {
    return `[kind |-> "list", value |-> "", entries |-> <<>>, items |-> ${seq(value.map((v) => jsonToTla(v)))}]`;
  }
  if (typeof value === "object") {
    return `[kind |-> "object", value |-> "", items |-> <<>>, entries |-> ${seq(
      Object.entries(value).map(([k, v]) => `[key |-> ${str(k)}, value |-> ${jsonToTla(v, k)}]`),
    )}]`;
  }
  // Leaf values are abstracted away, except __typename's. Fixtures don't
  // alias __typename, so the key identifies it.
  return `[kind |-> "leaf", value |-> ${key === "__typename" ? str(value) : '""'}, entries |-> <<>>, items |-> <<>>]`;
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

const runTla = (dir) =>
  new Promise((done) => {
    const child = spawn(process.execPath, [cli, "-workers", "1", "Shard.tla"], { cwd: dir });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("close", (status) => done({ status, output }));
  });

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
const responseText = (raw) =>
  "streamError" in raw
    ? `the response stream failed: ${JSON.stringify(raw.streamError)}`
    : "noResponse" in raw
      ? `no response: ${JSON.stringify(raw.noResponse)}`
      : JSON.stringify(raw.response);
const answered = (raw) => !("streamError" in raw) && !("noResponse" in raw);

// Sorts cases for checking and reporting: the malformed ones with their
// problems; the warnings, one per case for each check and text, graded by
// the case's own fixture; and the distinct well-formed cases, each with its
// shortest submitted case.
const collect = (byId, rawCases, prepare) => {
  const malformed = [];
  const warnings = [];
  const distinct = new Map();
  const tlaOf = new Map();
  for (const raw of rawCases) {
    const prepared = prepare(raw);
    if (prepared.problems) {
      malformed.push({ raw, problems: prepared.problems, ids: prepared.ids });
      continue;
    }
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
  return { rawCases, malformed, warnings, cases: [...distinct.values()], tlaOf };
};

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
  return result.problems ? result : { ...result, tla: caseToTla(fixture, result.case) };
};

// What's wrong with a report control's report (controls.mjs), or "".
const reportControlProblem = (byId, control, collected, results) => {
  const report = buildReport({ byId, ...collected, results, strict: control.strict, selfTest: true, controls: 0, implementation: "report control", capabilities: [], skipped: [], provenance: {} });
  return control.expect(report, collected.rawCases) || overcounted(report);
};

// The same, for scripts/generate-controls.mjs.
export const judgeReportControl = async (fixtures, control, rawCases) => {
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  const collected = collect(byId, rawCases, preparer(byId));
  return reportControlProblem(byId, control, collected, await evaluate(collected.cases.map((c) => c.tla)));
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
  // control's report must show what it says.
  const corpus = loadCorpus();
  const bases = corpus.bases.map(prepare);
  const controls = corpus.controls.map((control) => ({ ...control, prepared: prepare(control.case) }));
  const reportControls = (corpus.reportControls ?? []).map((stored) => ({
    ...stored,
    control: REPORT_CONTROLS.find((c) => c.name === stored.name),
    collected: collect(byId, stored.cases, prepare),
  }));
  const evaluated = [...bases, ...controls.map((c) => c.prepared)].filter((p) => !p.problems);
  const all = await evaluate([
    ...cases.map((c) => c.tla),
    ...evaluated.map((p) => p.tla),
    ...reportControls.flatMap((r) => r.collected.cases.map((c) => c.tla)),
  ]);
  const results = all.slice(0, cases.length);
  const resultOf = new Map(evaluated.map((p, i) => [p, all[cases.length + i]]));
  let offset = cases.length + evaluated.length;
  for (const r of reportControls) {
    r.results = all.slice(offset, offset + r.collected.cases.length);
    offset += r.collected.cases.length;
  }

  let ok = true;
  log(`  ${plural(rawCases.length, "case")}, ${cases.length} distinct`);
  if (rawCases.length === 0) {
    ok = false;
    log("✗ no cases to check");
  }

  // Why a failure doesn't fail the run, if it doesn't.
  const leniency = (id) =>
    isFatal(id, strict) ? "" : id === OUTSIDE_SPEC ? `: outside the spec, informational (${OUTSIDE_SPEC})` : ": a SHOULD, fails with --strict";

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
    const failures = base.problems ?? resultOf.get(base).failures;
    if (failures.length > 0) {
      selfTest = false;
      log(`✗ control base ${i} (${corpus.bases[i].fixture}) doesn't pass: ${failures.join("; ")}`);
    }
  });
  for (const control of controls) {
    const caught = controlCaught(control, control.prepared, resultOf.get(control.prepared));
    if (!caught) {
      selfTest = false;
      const got = control.prepared.problems ?? [...control.prepared.warningIds, ...resultOf.get(control.prepared).failures];
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
    const problem = r.control ? reportControlProblem(byId, r.control, r.collected, r.results) : "it isn't in kit/execution/controls.mjs";
    if (problem) {
      selfTest = false;
      log(`✗ report control "${r.name}": ${problem}`);
    }
  }
  const controlCount = controls.length + reportControls.length;

  // The summary, always: what passed, alongside what didn't.
  const passed = cases.length - failing - warnings - informational;
  const should = warnings ? `, ${warnings} more break only a SHOULD` : "";
  const info = informational ? `, ${informational} more fail only outside the spec (${OUTSIDE_SPEC})` : "";
  log(
    `${failing === 0 && cases.length > 0 ? "✓" : "✗"} ${passed} of ${cases.length} distinct well-formed cases satisfy the reference${should}${info}` +
      (malformed.length ? `; ${plural(malformed.length, "case")} malformed` : ""),
  );
  const unstamped = cases.filter((c) => byId.get(c.case.fixture).operationType === "mutation" && !isStamped(c.case.trace));
  if (unstamped.length > 0) {
    log(`! ${plural(unstamped.length, "mutation case")} without \`after\` stamps: calledSerially used the order messages arrived in, so it can catch a non-serial engine but can't prove a serial one`);
  }

  const report = buildReport({
    byId,
    ...collected,
    results,
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
  extensions: (raw) => raw.response != null && "extensions" in raw.response,
  leafEncoding: (raw) => raw.response?.data != null,
  // A response that isn't a map counts against errorFormat.
  errorFormat: (raw) => answered(raw) && (!isMap(raw.response) || hasErrors(raw.response)),
  errorLocations: (raw) => hasErrors(raw.response) && raw.response.errors.some((e) => isMap(e) && "locations" in e),
  errorPath: (raw) => hasErrors(raw.response),
  errorEntries: (raw) => hasErrors(raw.response),
  responsePosition: (raw) => hasErrors(raw.response),
  dataPresent: answered,
  errorsList: answered,
  // Only cases where a resolver returned a value its type can't represent:
  // a fraction at an Int position for intFraction, anything else for
  // resultCoercion.
  resultCoercion: (raw, fixture) => uncoercibleChecks(raw, fixture).has("resultCoercion"),
  intFraction: (raw, fixture) => uncoercibleChecks(raw, fixture).has("intFraction"),
  additionalEntries: answered,
};
const uncoercibleChecks = (raw, fixture) => {
  const settles = (raw.trace ?? []).filter((e) => Array.isArray(e.settle) && e.outcome?.kind === "uncoercible");
  if (!fixture || settles.length === 0) return new Set();
  const at = positions(fixture, raw.trace);
  return new Set(settles.map((e) => coercionCheck(at, e.settle)));
};

// The problems a malformed case counts against, by index: its first, which
// is the root cause when one fault shows up several ways; every protocol
// problem, so adapterProblems counts each case where the adapter broke the
// protocol; and, when the first problem can't fail a run by itself (a
// SHOULD, or informational), the first problem of each check that can, so
// a problem that fails the run is never hidden behind one that doesn't.
const countedProblems = (fixture, ids) => {
  const graded = ids.map((id) => gradedAs(fixture, id));
  const failsRun = (id) => LEVEL.get(id) === "MUST" || LEVEL.get(id) === "ADAPTER";
  const kept = new Map([[graded[0], 0]]);
  graded.forEach((id, i) => {
    if (!kept.has(id) && (id === "protocol" || (!failsRun(graded[0]) && failsRun(id)))) kept.set(id, i);
  });
  return [...kept.values()];
};

const buildReport = ({ byId, rawCases, malformed, warnings, cases, tlaOf, results, strict, selfTest, controls, implementation, capabilities, skipped, provenance }) => {
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
    ...("streamError" in raw ? { streamError: raw.streamError } : "noResponse" in raw ? { noResponse: raw.noResponse } : { response: raw.response }),
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

  // The reference's clauses, over the distinct well-formed cases. Every
  // clause a case breaks counts against that clause; the finding is the
  // set of clauses it breaks. In a fixture outside the spec, the clauses
  // graded as OUTSIDE_SPEC make a finding of their own.
  cases.forEach((c, i) => {
    const fixture = byId.get(c.case.fixture);
    const mutation = fixture.operationType === "mutation";
    const failures = results[i].failures;
    for (const check of CHECKS) {
      if (!check.reference || (check.mutationOnly && !mutation)) continue;
      if (gradedAs(fixture, check.id) !== check.id) continue;
      stats.get(check.id).cases++;
      if (failures.includes(check.id)) stats.get(check.id).failing.add(c);
    }
    const own = failures.filter((f) => gradedAs(fixture, f) === f).sort();
    const outside = failures.filter((f) => gradedAs(fixture, f) === OUTSIDE_SPEC).sort();
    const expected = { expected: `data ${results[i].expected}` };
    if (outside.length > 0) {
      found(`${OUTSIDE_SPEC},${outside.join(",")}`, c.raw, {
        checks: [OUTSIDE_SPEC],
        summary: `with error propagation off, breaks ${outside.join(", ")}`,
        fixture: c.case.fixture,
        example: example(c.raw, expected),
      });
    }
    if (own.length > 0) found(own.join(","), c.raw, { checks: own, fixture: c.case.fixture, example: example(c.raw, expected) });
  });

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
      const note = check.id === "calledSerially" && unstamped ? "without `after` stamps: can catch a non-serial engine, can't prove a serial one" : undefined;
      return {
        id: check.id,
        title: check.title,
        level: check.level,
        ...(check.oct2021 ? { oct2021: check.oct2021 } : {}),
        spec: check.spec.map(section),
        ...(check.basis ? { basis: check.basis } : {}),
        status: s.failing.size > 0 ? "fail" : s.cases > 0 ? (note ? "inconclusive" : "pass") : "untested",
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
