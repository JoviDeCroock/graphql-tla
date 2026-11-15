// The introspect area (docs/kit/introspect.md): the adapter executes a
// fixed introspection query against an SDL schema, and the kit checks the
// response against specs/Introspection.tla. For each response, tla-ts
// evaluates Introspection!Matches and IntrospectChecks!Problems, which
// names the §4 aspect each difference falls under.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ask } from "../areas.mjs";
import { REPORT_FORMAT, provenance, section } from "../report.mjs";
import { chunked, evaluateModule, moduleFooter, pool, schemaData, tla } from "../schema/tla.mjs";
import { BUILTIN_DIRECTIVES, Malformed, caseOf, fullResponse, isBuiltinType } from "./data.mjs";
import { CONTROLS } from "./controls.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const checksModule = readFileSync(join(root, "kit/introspect/IntrospectChecks.tla"), "utf8");

export const loadVectors = () => JSON.parse(readFileSync(join(root, "kit/introspect/vectors.json"), "utf8"));

export const CHECKS = [
  ["executes", "The introspection query executes, and its result has every field it selects", "MUST", ["4.2"]],
  ["roots", "queryType, mutationType and subscriptionType are the root operation types", "MUST", ["4.2.1", "3.3.1"]],
  ["types", "types is the set of all named types", "MUST", ["4.2.1"]],
  ["builtinScalars", "types has the built-in scalars the schema references, and no others", "MUST", ["3.5", "4.2.1"]],
  ["typeKinds", "Each __Type has its type's kind, and its fields are null exactly where that kind requires", "MUST", ["4.2.2"]],
  ["fields", "An object's or interface's fields, with their types", "MUST", ["4.2.2", "4.2.3"]],
  ["arguments", "Field and directive arguments, with their types", "MUST", ["4.2.3", "4.2.4", "4.2.6"]],
  ["defaultValue", "defaultValue encodes the default value, and is null without one", "MUST", ["4.2.4"]],
  ["inputFields", "An input object's inputFields, with their types", "MUST", ["4.2.2", "4.2.4"]],
  ["enumValues", "An enum's enumValues", "MUST", ["4.2.2", "4.2.5"]],
  ["interfaces", "interfaces, and possibleTypes for unions and interfaces", "MUST", ["4.2.2"]],
  [
    "deprecation",
    "isDeprecated, deprecationReason and includeDeprecated; @deprecated is provided",
    "MUST",
    ["4.2.3", "4.2.4", "4.2.5", "4.2.6", "3.13.3"],
  ],
  ["specifiedByURL", "specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null", "MUST", ["4.2.2", "3.13.4"]],
  ["isOneOf", "isOneOf is true exactly for OneOf input objects", "MUST", ["4.2.2", "3.10.1"]],
  ["descriptions", "Descriptions are the schema's", "MUST", ["3.2", "4.2"]],
  ["directives", "directives describes the schema's own directives: name, locations, isRepeatable", "MUST", ["4.2.1", "4.2.6"]],
  ["builtinDirectives", "@skip, @include, @specifiedBy and @oneOf are provided", "SHOULD", ["3.13.1", "3.13.2", "3.13.4", "3.13.5"]],
  ["builtinDefinitions", "The introspection types and built-in directives are as the spec defines them", "MUST", ["4.2", "3.13"]],
  ["typename", "__typename names the root type, and no fields list includes it", "MUST", ["4.1"]],
  ["order", "Fields, arguments, enum values, directives, members and interfaces come in source order", "SHOULD", ["4.2"]],
  ["other", "Anything else Introspection!Matches requires", "MUST", ["4.2"]],
].map(([id, title, level, spec]) => ({ id, title, level, spec }));

const SHOULD = new Set(CHECKS.filter((c) => c.level === "SHOULD").map((c) => c.id));

const ASPECT = {
  kind: "typeKinds",
  fields: "fields",
  arguments: "arguments",
  defaultValue: "defaultValue",
  inputFields: "inputFields",
  enumValues: "enumValues",
  interfaces: "interfaces",
  deprecation: "deprecation",
  specifiedByURL: "specifiedByURL",
  isOneOf: "isOneOf",
  description: "descriptions",
  directives: "directives",
  roots: "roots",
  types: "types",
  other: "other",
};

// What a problem is about: a type or directive name, and whether it is
// built in.
const ownerOf = (where) => {
  if (where.startsWith("@")) {
    const name = where.slice(1).split("(")[0];
    return { name, directive: true, builtin: BUILTIN_DIRECTIVES.includes(name) };
  }
  const name = where.split(/[.(]/)[0];
  return { name, directive: false, builtin: name !== "" && name !== "schema" && isBuiltinType(name) };
};

// The check a problem counts against. A service "must provide the
// @deprecated directive if representing deprecated portions of the
// schema", so a missing @deprecated is a MUST only when the schema
// deprecates something.
export const checkOf = ([aspect, where], deprecates = true) => {
  if (aspect === "builtinScalars") return "builtinScalars";
  if (aspect === "builtinDirectives") return where === "@deprecated" && deprecates ? "deprecation" : "builtinDirectives";
  if (aspect === "order" || aspect === "typename") return aspect;
  if (ownerOf(where).builtin) return "builtinDefinitions";
  const check = ASPECT[aspect];
  if (!check) throw new Error(`no check for the aspect ${aspect}`);
  return check;
};

// ---------------------------------------------------------------------------
// Evaluating cases with tla-ts

const SHARD = 12;

// Each case: { schema (index into schemas), inc, response, directives (the
// document's directive names) }. Returns, per case, { malformed } or
// { problems, matches }.
const evaluate = async (schemas, cases) => {
  const results = new Array(cases.length);
  const prepared = [];
  cases.forEach((c, i) => {
    try {
      const { actual, provided, extras } = caseOf(c.response, c.directives);
      prepared.push({ i, tla: tla({ schema: c.schema + 1, inc: c.inc, provided, extras, actual }) });
    } catch (error) {
      if (!(error instanceof Malformed)) throw error;
      results[i] = { malformed: error.message };
    }
  });
  const shards = [];
  for (let k = 0; k < prepared.length; k += SHARD) shards.push(prepared.slice(k, k + SHARD));
  const schemaText = chunked("Schemas", schemas.map((s) => tla(s)));
  await pool(shards, async (shard, k) => {
    const module = `---- MODULE Shard ----
EXTENDS IntrospectChecks

${schemaText}

${chunked("Checked", shard.map((p) => p.tla), 1)}

ASSUME \\A i \\in DOMAIN Checked : PrintT(<<"verdict", i, CaseResult(Schemas[Checked[i].schema], Checked[i])>>)
${moduleFooter}`;
    const values = await evaluateModule("Shard", module, { "IntrospectChecks.tla": checksModule });
    const verdicts = values.filter((v) => v[0] === "verdict");
    if (verdicts.length !== shard.length || new Set(verdicts.map((v) => v[1])).size !== shard.length) {
      throw new Error(`read ${verdicts.length} verdicts from shard ${k}, which has ${shard.length} cases`);
    }
    for (const [, n, [problems, matches]] of verdicts) {
      results[shard[n - 1].i] = { problems: problems.map(([aspect, where]) => [aspect, where]), matches };
    }
  });
  // Problems must explain the reference's verdict: none when Matches
  // holds, apart from the checks Matches doesn't make, and some when it
  // doesn't.
  for (const r of results) {
    if (r.malformed) continue;
    const graded = r.problems.filter(([aspect]) => !["typename", "builtinDirectives"].includes(aspect));
    if (r.matches && graded.length > 0) throw new Error(`kit bug: Introspection!Matches holds, but IntrospectChecks found ${JSON.stringify(graded)}`);
    if (!r.matches && r.problems.length === 0) r.problems.push(["other", ""]);
  }
  return results;
};

// ---------------------------------------------------------------------------
// Reporting

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Whether a schema deprecates anything.
const deprecates = (S) =>
  [
    ...S.types.flatMap((t) => [...t.fields, ...t.fields.flatMap((f) => f.args), ...t.inputFields, ...t.values]),
    ...S.directives,
    ...S.directives.flatMap((d) => d.args),
  ].some((x) => x.deprecated.length > 0);

// The check ids a result fails.
const failedChecks = (r) =>
  r.malformed ? ["executes"] : [...new Set(r.problems.map((p) => checkOf(p, r.deprecates)))].sort();

// One problem in words, without the schema-specific part unless it is a
// built-in, so that the same fault groups across schemas.
const describe = (problem, vector, r) => {
  const [aspect, where] = problem;
  const check = checkOf(problem, r.deprecates);
  if (check === "builtinScalars") {
    const expected = vector.expected.response.data.__schema.types.some((t) => t.name === where);
    return expected ? `leaves out ${where}, a built-in scalar the schema references` : `includes ${where}, a built-in scalar nothing references`;
  }
  if (aspect === "builtinDirectives") return `doesn't provide ${where}`;
  if (check === "builtinDefinitions") return `the built-in ${where} isn't as the spec defines it (${aspect})`;
  if (check === "typename") return where === "" ? "the root's __typename isn't the query root type's name" : "lists __typename among a type's fields";
  return `${CHECKS.find((c) => c.id === check).title.replace(/^./, (x) => x.toLowerCase())}: differs from Introspection.tla`;
};

// The part of a response a problem is about: the type or directive, or
// the schema's root fields.
const partOf = (response, where) => {
  const s = response?.data?.__schema;
  if (!s) return response;
  const owner = ownerOf(where);
  if (owner.name === "" || owner.name === "schema") {
    const { types, directives, ...rest } = s;
    return { __typename: response.data.__typename, ...rest, types: types?.map((t) => t?.name), directives: directives?.map((d) => d?.name) };
  }
  const list = owner.directive ? s.directives : s.types;
  return list?.find((x) => x?.name === owner.name) ?? `no ${owner.directive ? "directive" : "type"} ${owner.name}`;
};

export const buildReport = ({ vectors, builtins, answers, results, strict, implementation, capabilities, selfTestText, adapterProblems }) => {
  const stats = new Map(CHECKS.map((c) => [c.id, { cases: 0, failing: 0 }]));
  const findings = new Map();
  vectors.forEach((v, i) => {
    const r = results[i];
    for (const c of CHECKS) if (c.id === "executes" || !r.malformed) stats.get(c.id).cases++;
    const failed = failedChecks(r);
    for (const id of failed) stats.get(id).failing++;
    if (failed.length === 0) return;
    const descriptions = r.malformed ? [`the schema didn't build, the query failed, or the result is malformed`] : [...new Set(r.problems.map((p) => describe(p, v, r)))].sort();
    const key = descriptions.join("\u0000");
    const first = r.malformed ? null : (r.problems.find((p) => checkOf(p, r.deprecates) !== "order") ?? r.problems[0]);
    const expected = fullResponse(v, builtins);
    const example = {
      input: `${v.sdl.replace(/\s+/g, " ")}  (includeDeprecated: ${v.includeDeprecated ? "true" : "the default"})`,
      response: r.malformed ? answers[i] : partOf(answers[i].response, first[1]),
      expected: r.malformed ? "a result with data.__schema and no errors" : partOf(expected, first[1]),
    };
    const f = findings.get(key) ?? {
      checks: failed,
      summary: descriptions.join("; "),
      cases: 0,
      fixtures: {},
      fixture: v.id,
      problem: r.malformed ? r.malformed : r.problems.map(([aspect, where]) => `${aspect} at ${where || "the root"}`).sort().join(", "),
      example,
    };
    f.cases++;
    f.fixtures[v.family] = (f.fixtures[v.family] ?? 0) + 1;
    findings.set(key, f);
  });
  return {
    format: REPORT_FORMAT,
    area: "introspect",
    implementation,
    capabilities: [...capabilities].sort(),
    provenance: provenance({ strict, vectors: vectors.length }),
    checkerSelfTest: selfTestText,
    cases: { submitted: vectors.length, distinct: vectors.length, malformed: results.filter((r) => r.malformed).length },
    adapterProblems,
    checks: CHECKS.map((c) => {
      const s = stats.get(c.id);
      return {
        id: c.id,
        title: c.title,
        level: c.level,
        spec: c.spec.map(section),
        status: s.failing > 0 ? "fail" : s.cases > 0 ? "pass" : "untested",
        cases: s.cases,
        failing: s.failing,
      };
    }),
    findings: [...findings.values()].sort((a, b) => b.cases - a.cases),
    fixtures: [],
  };
};

// ---------------------------------------------------------------------------

export const run = async ({ adapter, strict, log = console.log }) => {
  const { vectors, builtins } = loadVectors();
  const sdls = [...new Set(vectors.map((v) => v.sdl))];
  const data = sdls.map(schemaData);
  const directivesOf = (v) => data[sdls.indexOf(v.sdl)].directives.map((d) => d.name);
  const caseFor = (v, response) => ({ schema: sdls.indexOf(v.sdl), inc: v.includeDeprecated, response, directives: directivesOf(v) });

  const answers = [];
  let adapterProblems = 0;
  for (const v of vectors) {
    const answer = await ask(adapter, "introspect", { sdl: v.sdl, query: v.query });
    if (!answer || typeof answer !== "object" || !("response" in answer)) adapterProblems++;
    answers.push(answer);
  }

  // The self-test's cases (kit/introspect/controls.mjs): each vector's
  // expected response, which must pass; another vector's, which must fail;
  // and responses broken on purpose, each of which must fail its check.
  const controls = CONTROLS(vectors, builtins);
  const cases = [...answers.map((a, i) => caseFor(vectors[i], a?.response)), ...controls.map((c) => caseFor(c.vector, c.response))];
  const results = await evaluate(data, cases);
  results.forEach((r, i) => (r.deprecates = deprecates(data[cases[i].schema])));
  const own = results.slice(0, vectors.length);

  const problems = [];
  controls.forEach((c, k) => {
    const r = results[vectors.length + k];
    const failed = failedChecks(r);
    if (c.check === "pass" ? failed.length > 0 : c.check === "any" ? failed.length === 0 : !failed.includes(c.check)) {
      problems.push(`${c.name} (${c.vector.id}): expected ${c.check === "pass" ? "no failure" : c.check}, got ${failed.join(", ") || "no failure"}`);
    }
  });
  for (const p of problems) log(`✗ self-test: ${p}`);
  const negative = controls.filter((c) => c.check !== "pass").length;
  const selfTestText = problems.length === 0 ? `passed (${negative} negative controls)` : "failed";

  const report = buildReport({
    vectors,
    builtins,
    answers,
    results: own,
    strict,
    implementation: adapter.name,
    capabilities: adapter.capabilities,
    selfTestText,
    adapterProblems,
  });
  const passing = own.filter((r) => failedChecks(r).length === 0).length;
  const shouldOnly = own.filter((r) => {
    const f = failedChecks(r);
    return f.length > 0 && f.every((id) => SHOULD.has(id));
  }).length;
  const should = shouldOnly ? `, ${shouldOnly} more break only a SHOULD` : "";
  log(`${passing === vectors.length ? "✓" : "✗"} ${passing} of ${vectors.length} introspection results satisfy Introspection.tla${should}`);
  for (const f of report.findings) log(`  ✗ ${f.summary} (${plural(f.cases, "result")}, e.g. ${f.fixture})`);
  if (problems.length === 0) log(`✓ the checker catches all ${negative} negative controls`);
  const failing = report.checks.filter((c) => c.status === "fail" && (strict || c.level === "MUST"));
  const ok = problems.length === 0 && adapterProblems === 0 && failing.length === 0;
  return { ok, report };
};
