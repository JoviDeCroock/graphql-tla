// Checks real graphql-js against the hand-written TLA+ reference.
//
// For each fixture and each graphql-js version, the resolvers return
// promises that this script settles itself, one at a time, choosing both
// the outcome (a value, a list length, a runtime type, null or an error) and
// the order. Two kinds of runs:
//
//   exhaustive  every combination of outcomes, settling in creation order and
//               again in reverse creation order
//   random      seeded random outcomes and random settling order
//
// Each response graphql-js produces, with the outcomes settled at the moment
// it was produced, becomes a case. tla-ts then checks that every case
// satisfies Reference!Valid. Negative controls (a case with one error dropped,
// or one value replaced by null) must each fail Valid, so the check can't
// pass vacuously. The script also checks that the response object doesn't
// change after graphql-js returned it.
//
// Usage: node scripts/graphql-js.mjs [--random N] [--seed S]

import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as graphql16 from "graphql16";
import * as graphql17 from "graphql17";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const cli = join(root, "node_modules/tla-ts/dist/cli.js");
const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : Number(process.argv[index + 1]);
};
const RANDOM_RUNS = arg("--random", 1500);
const SEED = arg("--seed", 1);

const VERSIONS = [graphql16, graphql17];

// ---------------------------------------------------------------------------
// One controlled execution

const ERROR = { kind: "error", type: "", length: 0 };
const NULL = { kind: "null", type: "", length: 0 };

// What a resolver for a value of this GraphQL type may produce, matching
// choicesFor in execution.ts and Expected in Reference.tla.
const choicesFor = (graphql, type, maxListLength, schema) => {
  const nullable = graphql.isNonNullType(type) ? type.ofType : type;
  if (graphql.isListType(nullable)) {
    return [NULL, ERROR, ...Array.from({ length: maxListLength + 1 }, (_, n) => ({ kind: "list", type: "", length: n }))];
  }
  if (graphql.isLeafType(nullable)) return [NULL, ERROR, { kind: "leaf", type: "", length: 0 }];
  const runtimeTypes = graphql.isAbstractType(nullable)
    ? schema.getPossibleTypes(nullable).map((t) => t.name).sort()
    : [nullable.name];
  return [NULL, ERROR, ...runtimeTypes.map((t) => ({ kind: "object", type: t, length: 0 }))];
};

const flush = () => new Promise((done) => setImmediate(done));

// Runs one execution. `choose(n)` picks among n options; it's called first to
// pick which pending resolver settles next, then to pick its outcome.
const execute = async (graphql, fixture, choose) => {
  const pending = [];
  const outcomes = new Map();

  // A promise this script settles. graphql-js may never await it, for
  // example an item of a list that was already nulled, so a rejection must
  // not count as unhandled.
  const control = (path, type) => {
    const promise = new Promise((resolve, reject) => {
      pending.push({ path, type, resolve, reject });
    });
    promise.catch(() => {});
    return promise;
  };

  const fieldResolver = (_source, _args, _context, info) =>
    control(graphql.responsePathAsArray(info.path).map(String), info.returnType);

  let response;
  let outcomesAtResponse;
  const result = Promise.resolve(
    graphql.execute({
      schema: fixture.schema[graphql.version],
      document: fixture.document[graphql.version],
      variableValues: fixture.variables,
      fieldResolver,
      typeResolver: (value) => value.__typename,
    }),
  ).then((r) => {
    response = r;
    outcomesAtResponse = new Map(outcomes);
    return JSON.stringify(r);
  });

  await flush();
  let steps = 0;
  while (pending.length > 0) {
    if (++steps > 1000) throw new Error("runaway execution");
    const [next] = pending.splice(choose(pending.length, "which"), 1);
    const choices = choicesFor(graphql, next.type, fixture.maxListLength, fixture.schema[graphql.version]);
    const outcome = choices[choose(choices.length, "outcome")];
    outcomes.set(next.path.join("\u0000"), { path: next.path, outcome });
    if (outcome.kind === "error") next.reject(new Error(`resolver at ${next.path.join(".")} failed`));
    else if (outcome.kind === "null") next.resolve(null);
    else if (outcome.kind === "leaf") next.resolve("v");
    else if (outcome.kind === "object") next.resolve({ __typename: outcome.type });
    else {
      const nullable = graphql.isNonNullType(next.type) ? next.type.ofType : next.type;
      next.resolve(
        Array.from({ length: outcome.length }, (_, i) => control([...next.path, String(i)], nullable.ofType)),
      );
    }
    await flush();
  }
  const atResponse = await result;
  await flush();
  return {
    response: JSON.parse(atResponse),
    mutatedAfterReturn: JSON.stringify(response) !== atResponse,
    outcomes: [...outcomesAtResponse.values()],
  };
};

// ---------------------------------------------------------------------------
// Exploring runs

// Every combination of outcomes, with a fixed settling order.
const exhaustive = async (graphql, fixture, order) => {
  const runs = [];
  let prefix = [];
  for (;;) {
    const taken = [];
    const run = await execute(graphql, fixture, (n, kind) => {
      if (kind === "which") return order === "fifo" ? 0 : n - 1;
      const i = taken.length;
      const pick = i < prefix.length ? prefix[i] : 0;
      taken.push({ pick, n });
      return pick;
    });
    runs.push(run);
    let i = taken.length - 1;
    while (i >= 0 && taken[i].pick === taken[i].n - 1) i--;
    if (i < 0) return runs;
    prefix = [...taken.slice(0, i).map((t) => t.pick), taken[i].pick + 1];
  }
};

const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const random = async (graphql, fixture, count, seed) => {
  const next = mulberry32(seed);
  const runs = [];
  for (let i = 0; i < count; i++) {
    runs.push(await execute(graphql, fixture, (n) => Math.floor(next() * n)));
  }
  return runs;
};

// ---------------------------------------------------------------------------
// Turning runs into TLA+ cases

const str = (s) => JSON.stringify(String(s));
const seq = (items) => `<<${items.join(", ")}>>`;

const jsonToTla = (value) => {
  if (value === null) return `[kind |-> "null", entries |-> <<>>, items |-> <<>>]`;
  if (Array.isArray(value)) return `[kind |-> "list", entries |-> <<>>, items |-> ${seq(value.map(jsonToTla))}]`;
  if (typeof value === "object") {
    return `[kind |-> "object", items |-> <<>>, entries |-> ${seq(
      Object.entries(value).map(([k, v]) => `[key |-> ${str(k)}, value |-> ${jsonToTla(v)}]`),
    )}]`;
  }
  return `[kind |-> "leaf", entries |-> <<>>, items |-> <<>>]`;
};

const outcomesToTla = (outcomes) =>
  outcomes.length === 0
    ? "<<>>"
    : outcomes
        .map(
          ({ path, outcome }) =>
            `(${seq(path.map(str))} :> [kind |-> ${str(outcome.kind)}, type |-> ${str(outcome.type)}, length |-> ${outcome.length}])`,
        )
        .join(" @@ ");

const caseToTla = (c) =>
  `[fixture |-> ${str(c.fixture)}, outcomes |-> ${outcomesToTla(c.outcomes)}, data |-> ${jsonToTla(
    c.response.data,
  )}, errors |-> ${seq((c.response.errors ?? []).map((e) => seq(e.path.map(str))))}]`;

// Negative controls: plausible ways a response could be wrong.
const controls = (cases) => {
  const out = [];
  const withErrors = cases.find((c) => (c.response.errors ?? []).length > 0);
  if (withErrors) {
    out.push({ ...withErrors, name: "drops an error", response: { ...withErrors.response, errors: withErrors.response.errors.slice(1) } });
    out.push({
      ...withErrors,
      name: "reports an error twice",
      response: { ...withErrors.response, errors: [...withErrors.response.errors, withErrors.response.errors[0]] },
    });
  }
  const withValue = cases.find((c) => c.response.data && Object.values(c.response.data).some((v) => v !== null));
  if (withValue) {
    const [key] = Object.entries(withValue.response.data).find(([, v]) => v !== null);
    out.push({ ...withValue, name: "nulls a value without an error", response: { ...withValue.response, data: { ...withValue.response.data, [key]: null } } });
  }
  const withKeys = cases.find((c) => c.response.data && Object.keys(c.response.data).length > 1);
  if (withKeys) {
    const reordered = Object.fromEntries(Object.entries(withKeys.response.data).reverse());
    out.push({ ...withKeys, name: "reorders response keys", response: { ...withKeys.response, data: reordered } });
  }
  const withList = cases.find((c) => c.response.data && Object.values(c.response.data).some((v) => Array.isArray(v) && v.length > 1));
  if (withList) {
    const [key, list] = Object.entries(withList.response.data).find(([, v]) => Array.isArray(v) && v.length > 1);
    out.push({ ...withList, name: "drops a list item", response: { ...withList.response, data: { ...withList.response.data, [key]: list.slice(1) } } });
  }
  const nullData = cases.find((c) => c.response.data === null);
  if (nullData) {
    out.push({ ...nullData, name: "drops every error from a null data", response: { data: null } });
  }
  return out;
};

// ---------------------------------------------------------------------------

const fixtures = readdirSync(join(root, "fixtures"))
  .filter((f) => f.endsWith(".graphql"))
  .sort()
  .map((file) => {
    const text = readFileSync(join(root, "fixtures", file), "utf8");
    const schema = {};
    const document = {};
    for (const graphql of VERSIONS) {
      const parsed = graphql.parse(text);
      const isExecutable = (d) =>
        d.kind === graphql.Kind.OPERATION_DEFINITION || d.kind === graphql.Kind.FRAGMENT_DEFINITION;
      schema[graphql.version] = graphql.buildASTSchema({
        kind: graphql.Kind.DOCUMENT,
        definitions: parsed.definitions.filter((d) => !isExecutable(d)),
      });
      document[graphql.version] = { kind: graphql.Kind.DOCUMENT, definitions: parsed.definitions.filter(isExecutable) };
    }
    const header = (key) => text.match(new RegExp(`^# ${key}: (.*)$`, "m"))?.[1];
    return {
      id: basename(file, ".graphql"),
      schema,
      document,
      variables: JSON.parse(header("variables") ?? "{}"),
      maxListLength: Number(header("maxListLength") ?? 2),
    };
  });

const cases = new Map();
const mutated = [];
const summary = [];
for (const fixture of fixtures) {
  for (const graphql of VERSIONS) {
    const runs = [
      ...(await exhaustive(graphql, fixture, "fifo")),
      ...(await exhaustive(graphql, fixture, "lifo")),
      ...(await random(graphql, fixture, RANDOM_RUNS, SEED)),
    ];
    let distinct = 0;
    for (const run of runs) {
      const c = { fixture: fixture.id, version: graphql.version, ...run };
      if (run.mutatedAfterReturn) mutated.push(c);
      const key = `${graphql.version} ${caseToTla(c)}`;
      if (!cases.has(key)) {
        cases.set(key, c);
        distinct++;
      }
    }
    summary.push(`${fixture.id} on graphql-js ${graphql.version}: ${runs.length} runs, ${distinct} distinct responses`);
  }
}

const all = [...cases.values()];
const negative = controls(all);

const dir = mkdtempSync(join(tmpdir(), "graphql-js-"));
let failed = false;
try {
  cpSync(join(root, "specs/Reference.tla"), join(dir, "Reference.tla"));
  cpSync(join(root, "specs/Fixtures.tla"), join(dir, "Fixtures.tla"));
  writeFileSync(
    join(dir, "GraphQLJs.tla"),
    `---- MODULE GraphQLJs ----
EXTENDS Reference, Fixtures

Cases == ${seq([...cases.values()].map(caseToTla))}

Controls == ${seq(negative.map(caseToTla))}

IsValid(c) == Valid(Fixtures[c.fixture], c.outcomes, c.data, c.errors)

Invalid == {i \\in DOMAIN Cases : ~IsValid(Cases[i])}
Accepted == {i \\in DOMAIN Controls : IsValid(Controls[i])}

ASSUME PrintT(<<"invalid", Invalid>>) /\\ PrintT(<<"accepted controls", Accepted>>)

VARIABLE done
Init == done = FALSE
Next == UNCHANGED done

EveryResponseIsValid == Invalid = {}
EveryControlIsRejected == Accepted = {}
====
`,
  );
  writeFileSync(
    join(dir, "GraphQLJs.cfg"),
    "INIT Init\nNEXT Next\nINVARIANTS EveryResponseIsValid EveryControlIsRejected\n",
  );
  const { status, stdout, stderr } = spawnSync(process.execPath, [cli, "-workers", "1", "GraphQLJs.tla"], {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });
  const output = `${stdout}${stderr}`;
  for (const line of summary) console.log(`  ${line}`);
  console.log(`  ${all.length} distinct responses, ${negative.length} negative controls`);

  const invalid = output.match(/<<"invalid", \{([^}]*)\}>>/)?.[1];
  const accepted = output.match(/<<"accepted controls", \{([^}]*)\}>>/)?.[1];
  const indices = (text) => (text ?? "").split(",").map((s) => Number(s.trim())).filter(Boolean);
  if (status !== 0 || invalid === undefined) {
    console.log(output.split("\n").filter((l) => l.startsWith("Error") || /Tla\w*Error/.test(l)).join("\n"));
    failed = true;
  }
  for (const i of indices(invalid)) {
    const c = all[i - 1];
    console.log(`✗ graphql-js ${c.version} gave a response the reference rejects (${c.fixture})`);
    console.log(`    outcomes: ${JSON.stringify(c.outcomes.map((o) => [o.path.join("."), o.outcome.kind, o.outcome.type || o.outcome.length]))}`);
    console.log(`    response: ${JSON.stringify({ data: c.response.data, errors: c.response.errors?.map((e) => e.path) })}`);
    failed = true;
  }
  for (const i of indices(accepted)) {
    console.log(`✗ the reference accepts a broken response: ${negative[i - 1].name}`);
    failed = true;
  }
  if (!failed) {
    console.log(`✓ every graphql-js response satisfies Reference!Valid`);
    console.log(`✓ every negative control is rejected (${negative.map((c) => c.name).join(", ")})`);
  }
  if (mutated.length > 0) {
    const versions = [...new Set(mutated.map((c) => c.version))].join(", ");
    console.log(`! ${mutated.length} responses changed after graphql-js returned them (${versions})`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
