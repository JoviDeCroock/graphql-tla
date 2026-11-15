// The introspect area (docs/kit/introspect.md): the adapter executes a
// fixed introspection query against an SDL schema, or __type(name:)
// lookups, and the kit checks the response against
// specs/Introspection.tla. For each response, tla-ts evaluates
// Introspection!Matches (or TypeByNameMatches) and IntrospectChecks!Problems,
// which names the §4 aspect each difference falls under. The response's
// shape and envelope are checked in JS first (data.mjs).
//
// Profiles: the kit asks the first vector with the draft's query. If the
// answer is a request error and the October 2021 query is answered, the
// run uses the October 2021 profile: every vector October 2021 can express
// is asked its October 2021 query and graded against October 2021's
// built-in definitions, and draft-only vectors are skipped.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ask } from "../areas.mjs";
import { REPORT_FORMAT, provenance, section } from "../report.mjs";
import { chunked, evaluateModule, moduleFooter, pool, schemaData, tla } from "../schema/tla.mjs";
import { BUILTIN_DIRECTIVES, Malformed, caseOf, envelopeProblems, fullResponse, isBuiltinType, isRequestError, lookupCaseOf } from "./data.mjs";
import { CONTROLS } from "./controls.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const checksModule = readFileSync(join(root, "kit/introspect/IntrospectChecks.tla"), "utf8");

export const loadVectors = () => JSON.parse(readFileSync(join(root, "kit/introspect/vectors.json"), "utf8"));

// [id, title, level, sections, edition notes]. `edition: "draft"` marks a
// check only the draft has; `oct2021` says how October 2021 differs.
export const CHECKS = [
  ["envelope", "The response is a well-formed execution result: data, errors only as a non-empty list, extensions a map, nothing else", "MUST", ["7.1.1", "7.1.7", "7.1.8"]],
  ["executes", "The query executes, and its result has exactly the fields it selects, nulls included", "MUST", ["4.2"]],
  ["roots", "queryType, mutationType and subscriptionType are the root operation types", "MUST", ["4.2.1", "3.3.1"]],
  ["types", "types is the set of all named types", "MUST", ["4.2.1"]],
  ["builtinScalars", "types has the built-in scalars the schema references, and no others", "MUST", ["3.5", "4.2.1"]],
  ["typeByName", "__type(name:) returns the named type, and null for a name the schema doesn't have", "MUST", ["4.2"]],
  ["typeKinds", "Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included", "MUST", ["4.2.2"]],
  ["fields", "An object's or interface's fields, with their types", "MUST", ["4.2.2", "4.2.3"]],
  ["arguments", "Field and directive arguments, with their types", "MUST", ["4.2.3", "4.2.4", "4.2.6"]],
  ["defaultValue", "defaultValue encodes the default value, and is null without one", "MUST", ["4.2.4"]],
  ["inputFields", "An input object's inputFields, with their types", "MUST", ["4.2.2", "4.2.4"]],
  ["enumValues", "An enum's enumValues", "MUST", ["4.2.2", "4.2.5"]],
  ["interfaces", "interfaces, and possibleTypes for unions and interfaces", "MUST", ["4.2.2"]],
  [
    "deprecation",
    "isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something",
    "MUST",
    ["4.2.3", "4.2.4", "4.2.5", "4.2.6", "3.13", "3.13.3"],
    { oct2021: "fields and enum values only" },
  ],
  [
    "specifiedByURL",
    "specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null; @specifiedBy is returned when a scalar has a URL",
    "MUST",
    ["4.2.2", "3.13", "3.13.4"],
  ],
  [
    "isOneOf",
    "isOneOf is true exactly for OneOf input objects; @oneOf is returned when one is",
    "MUST",
    ["4.2.2", "3.10.1", "3.13"],
    { edition: "draft", draft: "OneOf input objects" },
  ],
  ["descriptions", "Descriptions are the schema's", "MUST", ["3.2", "4.2"]],
  [
    "directives",
    "directives describes the schema's own directives (name, locations, isRepeatable), and any of the service's own takes input types",
    "MUST",
    ["4.2.1", "4.2.6", "3.13"],
  ],
  [
    "builtinDirectives",
    "@skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object",
    "SHOULD",
    ["3.13", "3.13.1", "3.13.2", "3.13.4", "3.13.5"],
  ],
  ["builtinDefinitions", "The introspection types and built-in directives are as the spec defines them", "MUST", ["4.2", "3.13"]],
  ["typename", "__typename names the root type, and no fields list includes it", "MUST", ["4.1"]],
  [
    "order",
    "Fields, arguments, enum values, directives, members and interfaces come in source order",
    "SHOULD",
    ["4.2"],
    { edition: "draft", draft: "Stable Ordering" },
  ],
  ["other", "Anything else Introspection!Matches requires", "MUST", ["4.2"]],
].map(([id, title, level, spec, edition = {}]) => ({ id, title, level, spec, ...edition }));

// Checks a lookup vector doesn't exercise: it asks __type(name:) only.
const SCHEMA_ONLY = new Set(["roots", "types", "builtinScalars", "directives", "builtinDirectives"]);
// Checks only lookup vectors exercise.
const LOOKUP_ONLY = new Set(["typeByName"]);
// Checks the October 2021 profile doesn't grade: its query doesn't select
// isOneOf, and October 2021 has no Stable Ordering.
const NOT_OCT2021 = new Set(["isOneOf", "order"]);
const exercises = (vector, id, profile) =>
  !(profile === "oct2021" && NOT_OCT2021.has(id)) && (vector.lookups ? !SCHEMA_ONLY.has(id) : !LOOKUP_ONLY.has(id));

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

// The check a required built-in directive counts against.
const REQUIRED = { "@deprecated": "deprecation", "@specifiedBy": "specifiedByURL", "@oneOf": "isOneOf" };

// The check a problem counts against. A built-in directive the service
// must return and doesn't (requiredDirective) is a MUST, under the check
// for what requires it. A schema rejected because it applies a directive
// the service needn't provide (unsupportedDirective) is a SHOULD.
export const checkOf = ([aspect, where]) => {
  if (aspect === "builtinScalars" || aspect === "builtinDirectives" || aspect === "typeByName") return aspect;
  if (aspect === "requiredDirective") return REQUIRED[where];
  if (aspect === "unsupportedDirective") return "builtinDirectives";
  if (aspect === "serviceTypes") return "directives";
  if (aspect === "wrapper") return "typeKinds";
  if (aspect === "order" || aspect === "typename") return aspect;
  if (ownerOf(where).builtin) return "builtinDefinitions";
  const check = ASPECT[aspect];
  if (!check) throw new Error(`no check for the aspect ${aspect}`);
  return check;
};

// ---------------------------------------------------------------------------
// Evaluating cases with tla-ts

const SHARD = 12;

// The parent of a problem's `where`: "__Field.args" for
// "__Field.args(includeDeprecated:)", "__Type" for "__Type.fields".
const parentOf = (where) => (where.endsWith(":)") ? where.slice(0, where.lastIndexOf("(")) : where.includes(".") ? where.slice(0, where.lastIndexOf(".")) : "");
const key = ([aspect, where]) => `${aspect}\u0000${where}`;

// Whether a problem with a built-in definition, in a draft answer, is
// where the answer follows October 2021 instead: comparing with October
// 2021's built-ins (problems2021) finds no problem there, and none with the
// list it belongs to.
const followsOct2021 = (problem, problems2021) =>
  checkOf(problem) === "builtinDefinitions" && !problems2021.has(key(problem)) && !problems2021.has(key([problem[0], parentOf(problem[1])]));

// Each case: { schema (index into schemas), profile, inc, response,
// directives and types (the document's names), lookups and provided (for
// a lookup vector), needs and queryAccepted }. Returns, per case,
// { envelope, malformed } or { envelope, problems, matches, oct2021 }, or
// for a schema rejected for a directive it needn't support,
// { envelope, problems, rejected }. oct2021 holds the problems of a draft
// answer where it follows October 2021 instead (followsOct2021).
const evaluate = async (schemas, cases) => {
  const results = new Array(cases.length);
  const prepared = [];
  cases.forEach((c, i) => {
    const envelope = envelopeProblems(c.response);
    // A request error for a schema that applies @specifiedBy or @oneOf,
    // from an implementation that answers the query for other schemas:
    // it doesn't provide the directive, which §3.13 allows.
    if (c.needs?.length && c.queryAccepted && isRequestError(c.response)) {
      results[i] = { envelope, problems: c.needs.map((n) => ["unsupportedDirective", `@${n}`]), rejected: true, oct2021: new Set() };
      return;
    }
    try {
      const data = c.lookups
        ? { kind: "lookup", extras: [], extraTypes: [], provided: c.provided, ...lookupCaseOf(c.response, c.lookups, c.profile) }
        : { kind: "schema", ...caseOf(c.response, c.directives, c.types, c.profile) };
      results[i] = { envelope };
      prepared.push({ i, tla: tla({ schema: c.schema + 1, profile: c.profile, inc: c.inc, ...data }) });
    } catch (error) {
      if (!(error instanceof Malformed)) throw error;
      results[i] = { envelope, malformed: error.message };
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
    for (const [, n, [problems, matches, problems2021]] of verdicts) {
      const { i } = shard[n - 1];
      const p2021 = new Set(problems2021.map(key));
      const own = problems.map(([aspect, where]) => [aspect, where]);
      const oct2021 = cases[i].profile === "draft" ? own.filter((p) => followsOct2021(p, p2021)).map(key) : [];
      Object.assign(results[i], { problems: own, matches, oct2021: new Set(oct2021) });
    }
  });
  // Problems must explain the reference's verdict: none when Matches
  // holds, apart from the checks Matches doesn't make, and some when it
  // doesn't. Under the October 2021 profile, order isn't graded.
  results.forEach((r, i) => {
    if (r.malformed || r.rejected) return;
    const graded = r.problems.filter(([aspect]) => !["typename", "builtinDirectives", "serviceTypes"].includes(aspect));
    if (r.matches && graded.length > 0) throw new Error(`kit bug: Introspection!Matches holds, but IntrospectChecks found ${JSON.stringify(graded)}`);
    if (!r.matches && r.problems.length === 0) r.problems.push(["other", ""]);
    if (cases[i].profile === "oct2021") r.problems = r.problems.filter(([aspect]) => aspect !== "order");
  });
  return results;
};

// ---------------------------------------------------------------------------
// Reporting

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The check ids a result fails.
const failedChecks = (r) =>
  [...new Set([...(r.envelope.length ? ["envelope"] : []), ...(r.malformed ? ["executes"] : r.problems.map(checkOf))])].sort();

// Whether a problem rests on what only the draft has: OneOf input objects,
// Stable Ordering, or a built-in definition where the answer follows
// October 2021 instead.
const draftOnly = (problem, r) => {
  const [aspect, where] = problem;
  if (where === "@oneOf" || aspect === "isOneOf" || aspect === "order") return true;
  return r.oct2021.has(key(problem));
};

// One problem in words, without the schema-specific part unless it is a
// built-in, so that the same fault groups across schemas.
const describe = (problem, vector, r, profile) => {
  const [aspect, where] = problem;
  const check = checkOf(problem);
  const draft = where === "@oneOf" ? " (draft only)" : "";
  if (check === "builtinScalars") {
    const expected = vector.expected.response.data.__schema.types.some((t) => t.name === where);
    return expected ? `leaves out ${where}, a built-in scalar the schema references` : `includes ${where}, a built-in scalar nothing references`;
  }
  if (aspect === "builtinDirectives") return `doesn't provide ${where}${draft}`;
  if (aspect === "unsupportedDirective") return `rejects a schema that applies ${where}, so doesn't provide it${draft}`;
  if (aspect === "requiredDirective") {
    if (where === "@deprecated") return "doesn't return @deprecated, though the schema deprecates something";
    if (where === "@specifiedBy") return "doesn't return @specifiedBy, though a scalar's specifiedByURL shows it is provided";
    return "doesn't return @oneOf, though an input object's isOneOf shows it is provided (draft only)";
  }
  if (aspect === "serviceTypes") return "a directive of the service's own takes an argument of a type that isn't an input type";
  if (aspect === "wrapper") return "a List or Non-Null type has a non-null field other than kind and ofType";
  if (aspect === "typeByName") {
    const expected = Object.values(vector.expected.response.data).some((t) => t?.name === where);
    return expected ? "__type(name:) doesn't return a type the schema has" : "__type(name:) returns a type for a name the schema doesn't have";
  }
  if (check === "builtinDefinitions") {
    if (profile === "oct2021") return `the built-in ${where} isn't as October 2021 defines it (${aspect})`;
    return r.oct2021.has(key(problem))
      ? `the built-in ${where} isn't as the draft defines it, but is as October 2021 does (${aspect})`
      : `the built-in ${where} isn't as the spec defines it (${aspect})`;
  }
  if (check === "typename") return where === "" ? "the root's __typename isn't the query root type's name" : "lists __typename among a type's fields";
  return `${CHECKS.find((c) => c.id === check).title.replace(/^./, (x) => x.toLowerCase())}: differs from Introspection.tla`;
};

// The part of a response a problem is about: the type or directive, the
// wrapper types of one of __Schema's fields, or the schema's root fields.
const partOf = (response, [aspect, where], vector) => {
  if (aspect === "wrapper") {
    const name = where.split(".")[1];
    return response?.data?.wrappers?.fields?.find((f) => f?.name === name) ?? response;
  }
  if (vector.lookups) {
    const name = ownerOf(where).name;
    const alias = vector.lookups.find((l) => l.name === name)?.alias;
    return alias === undefined || !response?.data ? response : { [`__type(name: ${JSON.stringify(name)})`]: response.data[alias] ?? null };
  }
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

// A check's notes for the profile the run used.
const notesOf = (c, profile) => {
  if (profile === "oct2021" && NOT_OCT2021.has(c.id)) {
    return { note: `Not graded: the implementation answered the October 2021 query, and October 2021 has no ${c.draft}.` };
  }
  if (profile === "oct2021" && c.oct2021) return { note: `Graded for ${c.oct2021}: the implementation answered the October 2021 query.` };
  if (c.edition === "draft") return { note: `Draft only: October 2021 has no ${c.draft}.` };
  return {};
};

export const buildReport = ({ vectors, builtins, answers, results, strict, implementation, capabilities, selfTestText, adapterProblems, profile, skipped, profileNote }) => {
  const stats = new Map(CHECKS.map((c) => [c.id, { cases: 0, failing: 0 }]));
  const findings = new Map();
  vectors.forEach((v, i) => {
    const r = results[i];
    for (const c of CHECKS) {
      const exercised = c.id === "executes" || c.id === "envelope" || (!r.malformed && (r.rejected ? c.id === "builtinDirectives" : exercises(v, c.id, profile)));
      if (exercised) stats.get(c.id).cases++;
    }
    const failed = failedChecks(r);
    for (const id of failed) stats.get(id).failing++;
    if (failed.length === 0) return;
    const descriptions = [
      ...r.envelope.map((e) => `the response envelope: ${e}`),
      ...(r.malformed ? ["the schema didn't build, the query failed, or the result doesn't have the fields the query selects"] : [...new Set(r.problems.map((p) => describe(p, v, r, profile)))].sort()),
    ];
    const key = descriptions.join("\u0000");
    const first = r.malformed ? null : (r.problems.find((p) => checkOf(p) !== "order") ?? r.problems[0]);
    const expected = fullResponse(v, builtins, profile);
    const what = v.lookups ? `__type(name:) for ${v.lookups.map((l) => l.name).join(", ")}` : "the introspection query";
    const example = {
      input: `${v.edition === "draft" ? "[draft] " : ""}${v.sdl.replace(/\s+/g, " ")}  (${what}${profile === "oct2021" ? ", October 2021 profile" : ""}; includeDeprecated: ${v.includeDeprecated ? "true" : "the default"})`,
      response: r.malformed || !first ? answers[i] : partOf(answers[i].response, first, v),
      expected: r.malformed || !first ? "a well-formed execution result with exactly the fields the query selects, and no errors" : partOf(expected, first, v),
    };
    const f = findings.get(key) ?? {
      checks: failed,
      summary: descriptions.join("; "),
      cases: 0,
      fixtures: {},
      fixture: v.id,
      problem: [...r.envelope, ...(r.malformed ? [r.malformed] : r.problems.map(([aspect, where]) => `${aspect} at ${where || "the root"}`).sort())].join(", "),
      draftOnly: 0,
      example,
    };
    if (v.edition === "draft" || (!r.malformed && r.envelope.length === 0 && r.problems.every((p) => draftOnly(p, r)))) f.draftOnly++;
    f.cases++;
    f.fixtures[v.family] = (f.fixtures[v.family] ?? 0) + 1;
    findings.set(key, f);
  });
  for (const f of findings.values()) {
    if (f.draftOnly === f.cases) f.edition = "draft";
    if (f.draftOnly === 0) delete f.draftOnly;
  }
  return {
    format: REPORT_FORMAT,
    area: "introspect",
    implementation,
    capabilities: [...capabilities].sort(),
    provenance: provenance({ strict, vectors: vectors.length }),
    profile,
    ...(profileNote ? { profileNote } : {}),
    checkerSelfTest: selfTestText,
    cases: { submitted: vectors.length, distinct: vectors.length, malformed: results.filter((r) => r.malformed).length, ...(skipped ? { skipped } : {}) },
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
        ...(c.edition ? { edition: c.edition } : {}),
        ...(c.oct2021 ? { oct2021: c.oct2021 } : {}),
        ...notesOf(c, profile),
      };
    }),
    findings: [...findings.values()].sort((a, b) => b.cases - a.cases),
    fixtures: [],
  };
};

// ---------------------------------------------------------------------------

const firstError = (response) => String(response?.errors?.[0]?.message ?? "no message").slice(0, 200);

export const run = async ({ adapter, strict, log = console.log }) => {
  const { vectors, builtins } = loadVectors();
  const sdls = [...new Set(vectors.map((v) => v.sdl))];
  const data = sdls.map(schemaData);
  const docOf = (v) => data[sdls.indexOf(v.sdl)];
  const editionDirectives = (profile) => new Set(builtins[profile].directives.map((d) => d.name));
  // The built-in directives the service returned for a schema's __schema,
  // which its lookups can't show; all of the edition's if unknown.
  const providedIn = (v, response, profile) => {
    const S = docOf(v);
    try {
      const names = caseOf(response, S.directives.map((d) => d.name), S.types.map((t) => t.name), profile).actual.builtinDirectiveNames;
      return new Set([...names].filter((n) => BUILTIN_DIRECTIVES.includes(n)));
    } catch (error) {
      if (!(error instanceof Malformed)) throw error;
      return editionDirectives(profile);
    }
  };
  const caseFor = (v, response, { profile, queryAccepted, provided }) => {
    const S = docOf(v);
    return {
      schema: sdls.indexOf(v.sdl),
      profile,
      inc: v.includeDeprecated,
      response,
      directives: S.directives.map((d) => d.name),
      types: S.types.map((t) => t.name),
      lookups: v.lookups,
      provided: provided ?? editionDirectives(profile),
      needs: v.needs,
      queryAccepted,
    };
  };

  // The profile: the draft's, unless the first vector's draft query is a
  // request error and its October 2021 query isn't.
  let adapterProblems = 0;
  const answered = (answer) => {
    const ok = answer && typeof answer === "object" && "response" in answer;
    if (!ok) adapterProblems++;
    return ok;
  };
  const probe = vectors[0];
  let first = await ask(adapter, "introspect", { sdl: probe.sdl, query: probe.query });
  let profile = "draft";
  let profileNote;
  if (answered(first) && isRequestError(first.response) && probe.query2021) {
    const old = await ask(adapter, "introspect", { sdl: probe.sdl, query: probe.query2021 });
    if (answered(old) && !isRequestError(old.response)) {
      profile = "oct2021";
      profileNote = `The draft's introspection query was rejected ("${firstError(first.response)}") and October 2021's was answered, so this run grades against October 2021.`;
      first = old;
    } else if (answered(old)) {
      profileNote = `The draft's introspection query was rejected ("${firstError(first.response)}"), and so was October 2021's ("${firstError(old.response)}"), so this run grades against the draft.`;
    }
  }
  const queryAccepted = !isRequestError(first?.response);
  const graded = profile === "oct2021" ? vectors.filter((v) => v.query2021) : vectors;
  const skipped = vectors.length - graded.length;

  const answers = [first];
  for (const v of graded.slice(1)) {
    const answer = await ask(adapter, "introspect", { sdl: v.sdl, query: profile === "oct2021" ? v.query2021 : v.query });
    answered(answer);
    answers.push(answer);
  }
  const responseOfFamily = (family) => answers[graded.findIndex((v) => v.id === `${family}.inc`)]?.response;

  // The self-test's cases (kit/introspect/controls.mjs), for both profiles:
  // each vector's expected response, which must pass; another vector's,
  // which must fail; and responses broken on purpose, each of which must
  // fail its check.
  const controls = CONTROLS(vectors, builtins);
  const cases = [
    ...answers.map((a, i) => {
      const v = graded[i];
      const provided = v.lookups ? providedIn(v, responseOfFamily(v.family), profile) : undefined;
      return caseFor(v, a?.response, { profile, queryAccepted, provided });
    }),
    ...controls.map((c) => caseFor(c.vector, c.response, { profile: c.profile, queryAccepted: true, provided: c.provided })),
  ];
  const results = await evaluate(data, cases);
  const own = results.slice(0, graded.length);

  const problems = [];
  controls.forEach((c, k) => {
    const r = results[graded.length + k];
    const failed = failedChecks(r);
    const wrong =
      c.check === "pass" ? failed.length > 0 : c.check === "any" ? failed.length === 0 : c.only ? failed.join() !== c.check : !failed.includes(c.check);
    if (wrong) {
      problems.push(`${c.name} (${c.vector.id}, ${c.profile}): expected ${c.check === "pass" ? "no failure" : c.check}, got ${failed.join(", ") || "no failure"}`);
    }
  });
  for (const p of problems) log(`✗ self-test: ${p}`);
  const negative = controls.filter((c) => c.check !== "pass").length;
  const selfTestText = problems.length === 0 ? `passed (${negative} negative controls)` : "failed";

  const report = buildReport({
    vectors: graded,
    builtins,
    answers,
    results: own,
    strict,
    implementation: adapter.name,
    capabilities: adapter.capabilities,
    selfTestText,
    adapterProblems,
    profile,
    skipped,
    profileNote,
  });
  if (profileNote) log(`  ${profileNote}${skipped ? ` ${plural(skipped, "draft-only vector")} skipped.` : ""}`);
  const passing = own.filter((r) => failedChecks(r).length === 0).length;
  const shouldOnly = own.filter((r) => {
    const f = failedChecks(r);
    return f.length > 0 && f.every((id) => SHOULD.has(id));
  }).length;
  const should = shouldOnly ? `, ${shouldOnly} more break only a SHOULD` : "";
  log(`${passing === graded.length ? "✓" : "✗"} ${passing} of ${graded.length} introspection results satisfy Introspection.tla${should}`);
  const draft = (f) => (f.draftOnly ? `, ${f.draftOnly === f.cases ? "all" : f.draftOnly} draft only` : "");
  for (const f of report.findings) log(`  ✗ ${f.summary} (${plural(f.cases, "result")}${draft(f)}, e.g. ${f.fixture})`);
  if (problems.length === 0) log(`✓ the checker catches all ${negative} negative controls`);
  const failing = report.checks.filter((c) => c.status === "fail" && (strict || c.level === "MUST"));
  const ok = problems.length === 0 && adapterProblems === 0 && failing.length === 0;
  return { ok, report };
};
