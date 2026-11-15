// Checking execution cases against the reference.
//
// A case is what one execution did (docs/conformance.md): the fixture, the
// trace of resolver calls and settles up to the response, and the response.
// The kit normalizes each case, turns it into TLA+, and has tla-ts evaluate
// Cases!Failures (Reference!Clauses plus Reference!CalledSerially) for it,
// in shards that run in parallel. Negative controls, made by breaking the
// implementation's own cases, must each fail the clause they target, so the
// check can't pass vacuously.

import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as graphql from "graphql17";
import { positions } from "./positions.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const cli = join(root, "node_modules/tla-ts/dist/cli.js");

export const CASE_FORMAT = 1;
const SHARD_SIZE = 300;

// Clauses that are SHOULDs in the spec: reported, but only fail with --strict.
export const SHOULD = new Set(["keyOrder"]);

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

// The trace's own consistency: each position's resolver is called once and
// settles at most once, after its call.
const traceProblems = (trace) => {
  const problems = [];
  const called = new Set();
  const settled = new Set();
  for (const event of trace) {
    const path = event.call ?? event.settle;
    if (!Array.isArray(path)) {
      problems.push(`a trace event without a path: ${JSON.stringify(event)}`);
      continue;
    }
    const k = pathKey(path.map(String));
    if (event.call) {
      if (called.has(k)) problems.push(`the resolver at ${path.join(".")} was called twice (§6.3.3 executes each field once)`);
      called.add(k);
    } else {
      if (!called.has(k)) problems.push(`${path.join(".")} settled without being called`);
      if (settled.has(k)) problems.push(`${path.join(".")} settled twice`);
      settled.add(k);
    }
  }
  return problems;
};

// Checks what the reference can't see, and puts the case in the shape the
// TLA+ side reads. Returns { problems } for a malformed case, and
// { case, warnings } otherwise; warnings break a SHOULD.
export const normalize = (fixture, c) => {
  const problems = [];
  const warnings = [];
  const response = c.response;
  if (!Array.isArray(c.trace)) return { problems: ["the case has no trace"] };
  if (!isMap(response)) return { problems: ["the response isn't a map"] };
  problems.push(...traceProblems(c.trace));

  // §7.1: the response is a map of data, errors and extensions only.
  for (const k of Object.keys(response)) {
    if (!["data", "errors", "extensions"].includes(k)) {
      problems.push(`the response has an entry ${JSON.stringify(k)} (§7.1: only data, errors and extensions)`);
    }
  }
  if ("extensions" in response && !isMap(response.extensions)) problems.push("extensions isn't a map (§7.1.7)");
  if (!("data" in response)) problems.push("the response has no data entry (§7.1.4: execution started, so data must be present)");
  const errors = response.errors ?? [];
  if (!Array.isArray(errors)) return { problems: [...problems, "errors isn't a list"] };
  if ("errors" in response && errors.length === 0) problems.push("errors is present but empty (§7.1.3)");

  const at = positions(fixture, c.trace);
  for (const error of errors) {
    if (!isMap(error)) {
      problems.push(`an error that isn't a map: ${JSON.stringify(error)}`);
      continue;
    }
    if (typeof error.message !== "string") problems.push(`an error without a message: ${JSON.stringify(error)}`);
    if ("extensions" in error && !isMap(error.extensions)) problems.push(`an error whose extensions isn't a map: ${JSON.stringify(error)}`);
    if (
      "locations" in error &&
      !(
        Array.isArray(error.locations) &&
        error.locations.every((l) => isMap(l) && Number.isInteger(l.line) && l.line >= 1 && Number.isInteger(l.column) && l.column >= 1)
      )
    ) {
      problems.push(`an error with malformed locations: ${JSON.stringify(error)}`);
    }
    const extra = Object.keys(error).filter((k) => !["message", "locations", "path", "extensions"].includes(k));
    if (extra.length > 0) warnings.push(`errors have entries ${extra.join(", ")} (§7.1.2: services should not add entries)`);
    if (!Array.isArray(error.path)) {
      problems.push(`an execution error without a path: ${JSON.stringify(error)}`);
      continue;
    }
    // §7.1.4: field names are strings, list indices zero-based integers.
    const position = at(error.path);
    if (!position) {
      problems.push(`an error at ${JSON.stringify(error.path)}, which isn't a position the operation selects`);
      continue;
    }
    error.path.forEach((segment, i) => {
      const ok =
        position.kinds[i] === "index" ? Number.isInteger(segment) && segment >= 0 : typeof segment === "string";
      if (!ok) {
        problems.push(
          `error path ${JSON.stringify(error.path)} has ${JSON.stringify(segment)} where §7.1.4 wants ${position.kinds[i] === "index" ? "an integer index" : "a field name"}`,
        );
      }
    });
  }

  // Calls: each at a position the operation selects, with the type the
  // fixture gives it.
  for (const event of c.trace) {
    if (!event.call) continue;
    const position = at(event.call);
    if (!position) problems.push(`a resolver was called at ${event.call.join(".")}, which the operation doesn't select`);
    else if (event.type !== undefined && String(position.type) !== event.type) {
      problems.push(`the call at ${event.call.join(".")} reports type ${event.type}; the fixture says ${position.type}`);
    }
  }

  // Leaf values: the reference abstracts them away, so check them here
  // against the canonical value for the position's type in the fixture.
  const walk = (value, path) => {
    if (value === null) return;
    if (Array.isArray(value)) return value.forEach((v, i) => walk(v, [...path, i]));
    if (isMap(value)) return Object.entries(value).forEach(([k, v]) => walk(v, [...path, k]));
    const position = at(path);
    if (!position) return problems.push(`data has a value at ${path.join(".")}, which the operation doesn't select`);
    if (path.length > 0 && path[path.length - 1] === "__typename") return;
    if (value !== leafValue(position.type)) {
      problems.push(`${path.join(".")} is ${JSON.stringify(value)}, not the canonical ${JSON.stringify(leafValue(position.type))}`);
    }
  };
  walk(response.data ?? null, []);

  return problems.length > 0
    ? { problems }
    : {
        warnings,
        case: {
          fixture: c.fixture,
          trace: c.trace.map((e) =>
            e.call
              ? { call: e.call.map(String), type: e.type, ...(Number.isInteger(e.after) ? { after: e.after } : {}) }
              : { settle: e.settle.map(String), outcome: e.outcome },
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
export const isStamped = (trace) => trace.every((e) => !e.call || Number.isInteger(e.after));

// A mutation's trace in the order the engine saw things: each call right
// after the settles the adapter had applied when the resolver was called
// (its `after` stamp). A stamp can be late but never early, so a call is
// never placed before something it waited for. Without stamps, the order
// messages arrived in.
const engineOrder = (trace) => {
  if (!isStamped(trace)) return trace;
  const settles = trace.filter((e) => e.settle);
  const calls = trace.filter((e) => e.call);
  return [
    ...calls.filter((e) => e.after === 0),
    ...settles.flatMap((settle, i) => [settle, ...calls.filter((e) => e.after === i + 1)]),
    ...calls.filter((e) => e.after > settles.length),
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
        if (status !== 0 || !flat.includes(`<<"checked", ${shards[index].length}>>`)) {
          const lines = output.split("\n").filter((l) => /Error|error|Exception/.test(l)).slice(0, 10);
          throw new Error(`tla-ts failed on shard ${index}:\n${lines.map((l) => l.slice(0, 300)).join("\n")}`);
        }
        const verdicts = [...flat.matchAll(/<<"verdict", (\d+), \{([^}]*)\}>>/g)];
        const seen = new Set(verdicts.map((m) => m[1]));
        if (verdicts.length !== shards[index].length || seen.size !== shards[index].length) {
          throw new Error(`read ${seen.size} verdicts from shard ${index}, which has ${shards[index].length} cases`);
        }
        for (const match of verdicts) {
          const i = index * SHARD_SIZE + Number(match[1]) - 1;
          results[i].failures = match[2].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
        }
        for (const match of flat.matchAll(/<<"expected", (\d+), "((?:[^"\\]|\\.)*)">>/g)) {
          results[index * SHARD_SIZE + Number(match[1]) - 1].expected = unescape(match[2]);
        }
        for (const [i, r] of results.slice(index * SHARD_SIZE, (index + 1) * SHARD_SIZE).entries()) {
          if (r.failures.length > 0 && r.expected === "") {
            throw new Error(`no expected data read for failing case ${i + 1} of shard ${index}`);
          }
        }
      }
    };
    const workers = Math.max(1, Math.min(shards.length, Math.floor(availableParallelism() / 2) || 1));
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

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Checks cases against the reference, alongside the control corpus.
// `fixtures` must be every fixture the cases and the corpus use. Returns
// true if every case passes and the checker catches every control.
export const check = async (fixtures, rawCases, { strict = false, log = console.log } = {}) => {
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  const prepare = (raw) => {
    const fixture = byId.get(raw.fixture);
    if (!fixture) return { problems: [`unknown fixture ${raw.fixture}`] };
    const result = normalize(fixture, raw);
    return result.problems ? result : { ...result, tla: caseToTla(fixture, result.case) };
  };

  const malformed = [];
  const distinct = new Map();
  const warned = new Map();
  for (const raw of rawCases) {
    const prepared = prepare(raw);
    if (prepared.problems) {
      malformed.push({ raw, problems: prepared.problems });
      continue;
    }
    for (const warning of prepared.warnings) warned.set(warning, (warned.get(warning) ?? 0) + 1);
    const seen = distinct.get(prepared.tla);
    if (!seen || prepared.case.trace.length < seen.case.trace.length) distinct.set(prepared.tla, { ...prepared, raw });
  }
  const cases = [...distinct.values()];

  // The corpus: bases must pass, controls must be caught.
  const corpus = loadCorpus();
  const bases = corpus.bases.map(prepare);
  const controls = corpus.controls.map((control) => ({ ...control, prepared: prepare(control.case) }));
  const evaluated = [...bases, ...controls.map((c) => c.prepared)].filter((p) => !p.problems);
  const results = await evaluate([...cases.map((c) => c.tla), ...evaluated.map((p) => p.tla)]);
  const resultOf = new Map(evaluated.map((p, i) => [p, results[cases.length + i]]));

  let ok = true;
  log(`  ${plural(rawCases.length, "case")}, ${cases.length} distinct`);
  if (rawCases.length === 0) {
    ok = false;
    log("✗ no cases to check");
  }

  // Malformed cases, grouped by problem.
  const problems = new Map();
  for (const { raw, problems: list } of malformed) {
    for (const problem of list) {
      // Group by the kind of problem, not its details.
      const kind = problem
        .replace(/: [{[].*$/, "")
        .replace(/^[\w.]+ is .*, not the canonical .*/, "a leaf isn't the canonical value")
        .replace(/\[.*?\]|\S+\.\S+|"[^"]*"/g, "…");
      const key = `${raw.fixture}: ${kind}`;
      const group = problems.get(key) ?? { count: 0, raw, problem };
      group.count++;
      problems.set(key, group);
    }
  }
  for (const [key, { count, raw, problem }] of problems) {
    ok = false;
    log(`✗ malformed: ${key} (${plural(count, "case")})`);
    log(`    e.g.:     ${problem}`);
    log(`    trace:    ${describeTrace(raw.trace ?? [])}`);
    log(`    response: ${JSON.stringify(raw.response)}`);
  }
  for (const [warning, count] of warned) log(`! ${warning} (${plural(count, "case")}): a SHOULD`);

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
    const fatal = failures.some((f) => strict || !SHOULD.has(f));
    if (fatal) {
      ok = false;
      failing += count;
    } else warnings += count;
    log(`${fatal ? "✗" : "!"} ${key} (${plural(count, "case")})${fatal ? "" : ": a SHOULD, fails with --strict"}`);
    log(`    trace:    ${describeTrace(example.case.trace)}`);
    log(`    response: ${JSON.stringify(example.raw.response)}`);
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
    const caught =
      control.clause === "malformed"
        ? Boolean(control.prepared.problems)
        : !control.prepared.problems && resultOf.get(control.prepared).failures.includes(control.clause);
    if (!caught) {
      selfTest = false;
      const got = control.prepared.problems ?? resultOf.get(control.prepared).failures;
      log(`✗ control "${control.name}" wasn't caught by ${control.clause} (got: ${got.join("; ") || "nothing"})`);
    }
  }
  if (!selfTest) ok = false;

  // The summary, always: what passed, alongside what didn't.
  const passed = cases.length - failing - warnings;
  const should = warnings ? `, ${warnings} more break only a SHOULD` : "";
  log(
    `${failing === 0 && cases.length > 0 ? "✓" : "✗"} ${passed} of ${cases.length} distinct well-formed cases satisfy the reference${should}` +
      (malformed.length ? `; ${plural(malformed.length, "case")} malformed` : ""),
  );
  const unstamped = cases.filter((c) => byId.get(c.case.fixture).operationType === "mutation" && !isStamped(c.case.trace));
  if (unstamped.length > 0) {
    log(`! ${plural(unstamped.length, "mutation case")} without \`after\` stamps: calledSerially used the order messages arrived in, so it can catch a non-serial engine but can't prove a serial one`);
  }
  if (selfTest) log(`✓ the checker catches all ${controls.length} negative controls`);
  return ok;
};
