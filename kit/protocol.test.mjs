// kit/protocol.schema.json against real traffic: runs the kit against the
// graphql-js adapter in every area, through a proxy that records each line
// in both directions, and validates every line the kit wrote against
// #/$defs/kitMessage and every line the adapter wrote against
// #/$defs/adapterMessage (and each `result` against its area's result
// schema). Hand-written negative examples show the schema isn't vacuous.
//
//   node --test kit/protocol.test.mjs

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { AREAS } from "./areas.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const schema = JSON.parse(readFileSync(join(root, "kit/protocol.schema.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
ajv.addSchema(schema);
const validator = (pointer) => {
  const validate = ajv.getSchema(`${schema.$id}${pointer}`);
  assert.ok(validate, `no schema at ${pointer}`);
  return validate;
};
const kitMessage = validator("#/$defs/kitMessage");
const adapterMessage = validator("#/$defs/adapterMessage");
const anyMessage = validator("");
const areaResult = Object.fromEntries(AREAS.filter((a) => a !== "execution").map((a) => [a, validator(`#/$defs/${a}Result`)]));

const explain = (validate) => ajv.errorsText(validate.errors, { separator: "\n  " });

const dir = mkdtempSync(join(tmpdir(), "graphql-tla-protocol-"));
after(() => rmSync(dir, { recursive: true, force: true }));

// The recording proxy: runs the adapter command, passes bytes through
// unchanged in both directions, and appends them to <out>.kit and
// <out>.adapter as they pass.
const proxy = join(dir, "proxy.mjs");
writeFileSync(
  proxy,
  `import { spawn } from "node:child_process";
import { openSync, writeSync } from "node:fs";
const [out, command, ...args] = process.argv.slice(2);
const kit = openSync(out + ".kit", "a");
const adapter = openSync(out + ".adapter", "a");
const child = spawn(command, args, { stdio: ["pipe", "pipe", "inherit"] });
process.stdin.on("data", (chunk) => { writeSync(kit, chunk); child.stdin.write(chunk); });
process.stdin.on("end", () => child.stdin.end());
child.stdin.on("error", () => {});
child.stdout.on("data", (chunk) => { writeSync(adapter, chunk); process.stdout.write(chunk); });
process.stdout.on("error", () => {});
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { child.kill(signal); process.exit(1); });
`,
);

const quote = (s) => JSON.stringify(s);
const graphqlJs = (version, ...flags) => ["adapters/graphql-js/adapter.mjs", "--graphql", version, ...flags];

// Runs the kit once through the proxy. Exit 0 is a passing run and 1 a
// failing one, which is a conformance verdict, not a protocol problem: both
// are fine here. Anything else (usage, no capability) isn't.
const record = (name, area, adapterArgs, kitArgs = []) =>
  new Promise((done, fail) => {
    const out = join(dir, name);
    const adapter = [process.execPath, proxy, out, process.execPath, ...adapterArgs].map(quote).join(" ");
    const kit = spawn(process.execPath, ["kit/cli.mjs", "run", area, "--adapter", adapter, ...kitArgs], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    kit.stdout.on("data", (d) => (log += d));
    kit.stderr.on("data", (d) => (log += d));
    kit.on("error", fail);
    kit.on("exit", (code) => {
      const lines = (file) => {
        let text = "";
        try {
          text = readFileSync(`${out}.${file}`, "utf8");
        } catch {}
        return text.split("\n").filter((l) => l.trim() !== "");
      };
      done({ code, log, kit: lines("kit"), adapter: lines("adapter") });
    });
  });

// Validates every recorded line, and returns the counts by direction and
// message type.
const check = (recording, area) => {
  const counts = { kit: {}, adapter: {} };
  const areaOf = new Map();
  const failures = [];
  const parse = (line, from) => {
    try {
      return JSON.parse(line);
    } catch {
      failures.push(`${from} wrote a line that isn't JSON: ${line.slice(0, 300)}`);
    }
  };
  const fail = (from, line, validate) => failures.push(`${from} line doesn't match the schema:\n  ${line.slice(0, 600)}\n  ${explain(validate)}`);
  for (const line of recording.kit) {
    const message = parse(line, "the kit");
    if (message === undefined) continue;
    counts.kit[message.type] = (counts.kit[message.type] ?? 0) + 1;
    if (!kitMessage(message)) fail("kit", line, kitMessage);
    if (message.type !== "execute" && areaResult[message.type]) areaOf.set(message.id, message.type);
  }
  const answered = new Set();
  for (const line of recording.adapter) {
    const message = parse(line, "the adapter");
    if (message === undefined) continue;
    counts.adapter[message.type] = (counts.adapter[message.type] ?? 0) + 1;
    if (!adapterMessage(message)) fail("adapter", line, adapterMessage);
    if (message.type === "result" || (message.type === "error" && areaOf.has(message.id))) answered.add(message.id);
    if (message.type === "result") {
      const asked = areaOf.get(message.id);
      if (!asked) failures.push(`a result for no area request: ${line.slice(0, 300)}`);
      else if (!areaResult[asked](message)) fail(`adapter (${asked} result)`, line, areaResult[asked]);
    }
  }
  // Each area request got its answer: the recording is whole.
  const unanswered = [...areaOf.keys()].filter((id) => !answered.has(id));
  if (unanswered.length) failures.push(`${unanswered.length} ${area} requests have no recorded answer, e.g. id ${unanswered[0]}`);
  return { counts, failures };
};

const RUNS = [
  {
    name: "execution-17",
    area: "execution",
    adapter: graphqlJs("17"),
    // Small: every fixture, a few random runs each (a subscription fixture
    // also runs every stream scenario), no exhaustive runs.
    kit: ["--random", "4", "--no-exhaustive"],
    expect: {
      kit: ["execute", "settle", "end", "source", "cancel"],
      adapter: ["hello", "call", "response", "idle", "done", "stream-error", "source-cancelled"],
    },
  },
  {
    // Without idle, and graphql-js 16 (no error-propagation-off): the
    // kit's timing-based fallback.
    name: "execution-16-no-idle",
    area: "execution",
    adapter: graphqlJs("16", "--no-idle"),
    kit: ["--fixtures", "subscription,lists,leaves,mutation", "--random", "3", "--no-exhaustive"],
    expect: { kit: ["execute", "settle", "end", "source", "cancel"], adapter: ["hello", "call", "response", "done"] },
  },
  ...AREAS.filter((a) => a !== "execution").map((area) => ({
    name: area,
    area,
    adapter: graphqlJs("17"),
    expect: { kit: [area], adapter: ["hello", "result"] },
  })),
  {
    // A validating coerce adapter: the kit also asks it validate requests.
    name: "coerce-validating",
    area: "coerce",
    adapter: graphqlJs("17", "--validate"),
    expect: { kit: ["coerce", "validate"], adapter: ["hello", "result"] },
  },
];

describe("real traffic matches kit/protocol.schema.json", { concurrency: true }, () => {
  for (const run of RUNS) {
    test(run.name, { timeout: 600000 }, async (t) => {
      const recording = await record(run.name, run.area, run.adapter, run.kit);
      assert.ok([0, 1].includes(recording.code), `kit exited with ${recording.code}:\n${recording.log}`);
      assert.ok(recording.kit.length > 0 && recording.adapter.length > 0, `nothing recorded:\n${recording.log}`);
      const { counts, failures } = check(recording, run.area);
      const summary = `${run.name}: kit ${recording.kit.length} lines ${JSON.stringify(counts.kit)}; adapter ${recording.adapter.length} lines ${JSON.stringify(counts.adapter)}`;
      t.diagnostic(summary);
      assert.deepEqual(failures.slice(0, 5), [], `${failures.length} lines fail:\n${failures.slice(0, 5).join("\n")}`);
      for (const type of run.expect.kit) assert.ok(counts.kit[type] > 0, `the kit sent no ${type} in ${run.name}`);
      for (const type of run.expect.adapter) assert.ok(counts.adapter[type] > 0, `the adapter sent no ${type} in ${run.name}`);
    });
  }
});

// Lines that must pass and lines that must fail, written by hand: shapes the
// graphql-js adapter never produces (inline items, nullItems), and mistakes.
const valid = {
  kit: [
    { type: "settle", id: 1, call: 2, outcome: { kind: "list", length: 2, items: [{ kind: "leaf" }, { kind: "list", length: 1, items: [{ kind: "null" }] }] } },
    { type: "settle", id: 1, call: 2, outcome: { kind: "object", type: "", token: "o:a" } },
    { type: "settle", id: 1, call: 2, outcome: { kind: "leaf", value: 2147483648 } },
    { type: "source", id: 9, action: "fail", message: "the source stream failed" },
    { type: "source", id: 9, action: "emit", token: "event-1" },
    { type: "parse", id: 3, source: "type T", grammar: "typeSystem" },
    { type: "coerce", id: 3, schema: "type Query { a: Int }", document: "{ a }", variables: "{}", operationName: "Q", subscribe: "raise", extensions: "{}" },
  ],
  adapter: [
    { type: "hello", protocol: 1 },
    { type: "hello", protocol: 1, name: "juniper", capabilities: ["deferred-items"], uncoercibleTypes: ["Float"], nullItems: false, extra: "ignored" },
    { type: "call", id: 7, call: 3, path: ["search", 0], returnType: "SearchResult!", parent: null },
    { type: "stream-error", id: 7 },
    { type: "error", id: 7, message: "boom" },
  ],
  results: [
    ["parse", { type: "result", id: 1, unsupported: "lone surrogate: JSON parser" }],
    ["coerce", { type: "result", id: 1, unsupported: "lone surrogate: JSON parser" }],
    ["coerce", { type: "result", id: 1, response: "not a map" }],
    ["coerce", { type: "result", id: 1, response: { data: { a: "ok" } }, calls: [{ path: ["a"], arguments: {} }], sourceCalls: [] }],
    ["coordinate", { type: "result", id: 1, ok: false }],
    ["coordinate", { type: "result", id: 1, ok: true, resolved: null }],
    ["coordinate", { type: "result", id: 1, ok: true, error: "Unknown type" }],
    ["validate", { type: "result", id: 1, valid: false, errors: [{ message: "x", locations: [{ line: 1, column: 2 }] }] }],
  ],
};

const invalid = {
  kit: [
    ["settle without call", { type: "settle", id: 1, outcome: { kind: "null" } }],
    ["settle with an unknown outcome kind", { type: "settle", id: 1, call: 1, outcome: { kind: "promise" } }],
    ["an object outcome without type", { type: "settle", id: 1, call: 1, outcome: { kind: "object" } }],
    ["a list outcome without length", { type: "settle", id: 1, call: 1, outcome: { kind: "list" } }],
    ["an inline item that is an error", { type: "settle", id: 1, call: 1, outcome: { kind: "list", length: 1, items: [{ kind: "error" }] } }],
    ["a null outcome with a value", { type: "settle", id: 1, call: 1, outcome: { kind: "null", value: 1 } }],
    ["execute without schema", { type: "execute", id: 1, fixture: "f", document: "{ a }", operationType: "query", variables: {}, errorPropagation: true }],
    ["execute with an unknown operation type", { type: "execute", id: 1, fixture: "f", schema: "s", document: "d", operationType: "fragment", variables: {}, errorPropagation: true }],
    ["source fail without message", { type: "source", id: 1, action: "fail" }],
    ["source with an unknown action", { type: "source", id: 1, action: "pause" }],
    ["an id of 0", { type: "end", id: 0 }],
    ["a parse request with an unknown grammar", { type: "parse", id: 1, source: "{a}", grammar: "executable" }],
    ["coerce variables as an object", { type: "coerce", id: 1, schema: "s", document: "d", variables: {} }],
    ["an unknown kit message", { type: "hello", protocol: 1 }],
  ],
  adapter: [
    ["hello without protocol", { type: "hello", name: "x", capabilities: [] }],
    ["hello with protocol 2", { type: "hello", protocol: 2 }],
    ["hello with a misspelt capability", { type: "hello", protocol: 1, capabilities: ["deferred_items"] }],
    ["hello with an unknown uncoercible type", { type: "hello", protocol: 1, uncoercibleTypes: ["String"] }],
    ["hello with nullItems as a string", { type: "hello", protocol: 1, nullItems: "false" }],
    ["call without returnType", { type: "call", id: 1, call: 1, path: ["a"] }],
    ["call with a path that isn't a list", { type: "call", id: 1, call: 1, path: "a", returnType: "Int" }],
    ["call with a string call id", { type: "call", id: 1, call: "1", path: ["a"], returnType: "Int" }],
    ["response without response", { type: "response", id: 1 }],
    ["idle without id", { type: "idle" }],
    ["done with a string id", { type: "done", id: "1" }],
    ["an unknown adapter message", { type: "settle", id: 1, call: 1, outcome: { kind: "null" } }],
  ],
  results: [
    ["parse result without ok", "parse", { type: "result", id: 1 }],
    ["parse result with ok as a string", "parse", { type: "result", id: 1, ok: "true" }],
    ["validate result without valid", "validate", { type: "result", id: 1, errors: [] }],
    ["schema result with valid as a number", "schema", { type: "result", id: 1, valid: 0 }],
    ["coerce result with a map response and no calls", "coerce", { type: "result", id: 1, response: { data: null } }],
    ["coerce result whose errors isn't a list", "coerce", { type: "result", id: 1, response: { errors: {} }, calls: [] }],
    ["coerce call without arguments", "coerce", { type: "result", id: 1, response: {}, calls: [{ path: ["a"] }] }],
    ["coerce source call without field", "coerce", { type: "result", id: 1, response: {}, calls: [], sourceCalls: [{ arguments: {} }] }],
    ["introspect result without response", "introspect", { type: "result", id: 1, data: {} }],
    ["coordinate ok without resolved or error", "coordinate", { type: "result", id: 1, ok: true }],
    ["coordinate with both resolved and error", "coordinate", { type: "result", id: 1, ok: true, resolved: null, error: "x" }],
    ["coordinate with an unknown kind", "coordinate", { type: "result", id: 1, ok: true, resolved: { kind: "scalar", path: ["A"] } }],
    ["coordinate with an empty path", "coordinate", { type: "result", id: 1, ok: true, resolved: { kind: "type", path: [] } }],
  ],
};

test("hand-written lines the protocol allows pass", () => {
  for (const m of valid.kit) assert.ok(kitMessage(m), `${JSON.stringify(m)}\n  ${explain(kitMessage)}`);
  for (const m of valid.adapter) assert.ok(adapterMessage(m), `${JSON.stringify(m)}\n  ${explain(adapterMessage)}`);
  for (const [area, m] of valid.results) {
    assert.ok(adapterMessage(m), `${JSON.stringify(m)}\n  ${explain(adapterMessage)}`);
    assert.ok(areaResult[area](m), `${area}: ${JSON.stringify(m)}\n  ${explain(areaResult[area])}`);
  }
  for (const m of [...valid.kit, ...valid.adapter]) assert.ok(anyMessage(m), `top level: ${JSON.stringify(m)}`);
});

test("hand-written lines the protocol forbids are rejected", () => {
  for (const [name, m] of invalid.kit) assert.equal(kitMessage(m), false, `accepted ${name}: ${JSON.stringify(m)}`);
  for (const [name, m] of invalid.adapter) assert.equal(adapterMessage(m), false, `accepted ${name}: ${JSON.stringify(m)}`);
  for (const [name, area, m] of invalid.results) assert.equal(areaResult[area](m), false, `accepted ${name}: ${JSON.stringify(m)}`);
  assert.equal(anyMessage({ type: "unknown", id: 1 }), false);
  assert.equal(anyMessage({ id: 1 }), false);
});
