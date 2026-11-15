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
// built-in definitions, and draft-only vectors are skipped. If both are
// request errors, the kit asks which fields the introspection types have
// (chooseProfile), and leaves out the ones the service lacks.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ask } from "../areas.mjs";
import { REPORT_FORMAT, provenance, section } from "../report.mjs";
import { chunked, evaluateModule, moduleFooter, pool, schemaData, tla } from "../schema/tla.mjs";
import { BUILTIN_DIRECTIVES, Malformed, caseOf, envelopeProblems, fullResponse, isBuiltinType, isRequestError, lookupCaseOf } from "./data.mjs";
import { CONTROLS, PROFILE_CONTROLS } from "./controls.mjs";
import { DISCOVERY_ALIASES, DISCOVERY_QUERY, PROFILES, lookupQuery, neededFields, schemaQuery } from "./query.mjs";

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
  ["builtinDefinitions", "The introspection types and built-in directives are as the spec defines them, with nothing left out or changed", "MUST", ["4.2", "3.13"]],
  [
    "builtinAdditions",
    "The introspection types have no field, argument, enum value or type the spec doesn't define",
    "INFO",
    ["4.2"],
    {
      basis:
        "No sentence of §4 forbids extending the introspection types. The nearest is \"Below are the full set of type system definitions providing schema introspection, which are fully defined in the sections below\", which uses no key word, and Appendix A says \"A conforming implementation of GraphQL may provide additional functionality, but must not do so where explicitly disallowed\". Leaving out or changing a definition stays a MUST, under builtinDefinitions.",
    },
  ],
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

const MUST = new Set(CHECKS.filter((c) => c.level === "MUST").map((c) => c.id));

// The fields of the introspection types a service may lack and still be
// graded (query.mjs's selection leaves them out, and data.mjs fills them
// in), with the check each counts against. Without any other field, such
// as __Type.kind or __Field.type, nothing can be graded.
export const FILLABLE = {
  "__Schema.description": "descriptions",
  "__Type.description": "descriptions",
  "__Type.specifiedByURL": "specifiedByURL",
  "__Field.description": "descriptions",
  "__Field.isDeprecated": "deprecation",
  "__Field.deprecationReason": "deprecation",
  "__InputValue.description": "descriptions",
  "__InputValue.defaultValue": "defaultValue",
  "__EnumValue.description": "descriptions",
  "__EnumValue.isDeprecated": "deprecation",
  "__EnumValue.deprecationReason": "deprecation",
  "__Directive.description": "descriptions",
  "__Directive.isRepeatable": "directives",
};
// A lookup's query selects no field of __Schema or __Directive.
const lookupSelects = (m) => !m.startsWith("__Schema.") && !m.startsWith("__Directive.");

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
  // An item added to an introspection type's list, or an introspection type
  // of the service's own. Added arguments of a built-in directive are
  // §3.13's, and stay with builtinDefinitions.
  if (aspect.startsWith("added:")) {
    const owner = ownerOf(where);
    return owner.builtin && !owner.directive ? "builtinAdditions" : checkOf([aspect.slice("added:".length), where]);
  }
  if (aspect === "missingField") return FILLABLE[where];
  if (aspect === "wrapperFields") return "typeKinds";
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
// list it belongs to, left out or added.
const followsOct2021 = ([aspect, where], problems2021) =>
  checkOf([aspect, where]) === "builtinDefinitions" &&
  ![[aspect, where], [aspect, parentOf(where)], [`added:${aspect}`, parentOf(where)]].some((p) => problems2021.has(key(p)));

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
        ? { kind: "lookup", extras: [], extraTypes: [], provided: c.provided, ...lookupCaseOf(c.response, c.lookups, c.profile, c.missing) }
        : { kind: "schema", ...caseOf(c.response, c.directives, c.types, c.profile, c.missing) };
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
    // Each field the service lacks counts against its check, in every
    // result whose query would select it.
    for (const m of cases[i].missing ?? []) r.problems.push(["missingField", m]);
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
  if (aspect === "wrapperFields") return '__type(name: "__Schema") doesn\'t return each of __Schema\'s fields once, with its type, so their wrapper types can\'t all be checked';
  if (aspect === "missingField") return `the service has no ${where} field, so the kit leaves it out of the query`;
  if (check === "builtinAdditions") {
    const edition = profile === "oct2021" ? "October 2021" : "the spec";
    const base = aspect.slice("added:".length);
    if (base === "types") return `has the introspection type ${where}, which ${edition} doesn't define`;
    const noun = { fields: "a field", enumValues: "an enum value", arguments: "an argument" }[base] ?? `an item (${base})`;
    return `the built-in ${where} has ${noun} ${edition} doesn't define`;
  }
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
  if (aspect === "wrapperFields") return response?.data?.wrappers ?? response;
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

export const buildReport = ({ vectors, builtins, answers, results, strict, implementation, capabilities, selfTestText, adapterProblems, profile, skipped, profileNote, missingFields = [] }) => {
  const stats = new Map(CHECKS.map((c) => [c.id, { cases: 0, failing: 0, failingDraftOnly: 0 }]));
  const findings = new Map();
  vectors.forEach((v, i) => {
    const r = results[i];
    for (const c of CHECKS) {
      const exercised = c.id === "executes" || c.id === "envelope" || (!r.malformed && (r.rejected ? c.id === "builtinDirectives" : exercises(v, c.id, profile)));
      if (exercised) stats.get(c.id).cases++;
    }
    const failed = failedChecks(r);
    // A failure of a check rests on the draft when the vector is draft
    // only, or every problem behind it is (draftOnly).
    const draftFor = (id) => {
      if (v.edition === "draft") return true;
      if (r.malformed || id === "envelope") return false;
      const behind = r.problems.filter((p) => checkOf(p) === id);
      return behind.length > 0 && behind.every((p) => draftOnly(p, r));
    };
    for (const id of failed) {
      stats.get(id).failing++;
      if (draftFor(id)) stats.get(id).failingDraftOnly++;
    }
    if (failed.length === 0) return;
    const descriptions = [
      ...r.envelope.map((e) => `the response envelope: ${e}`),
      ...(r.malformed ? ["the schema didn't build, the query failed, or the result doesn't have the fields the query selects"] : [...new Set(r.problems.map((p) => describe(p, v, r, profile)))].sort()),
    ];
    const key = descriptions.join("\u0000");
    // The example shows a problem with the document's types first, then
    // one with a built-in, then a missing field or an order.
    const rank = (p) => (p[0] === "missingField" || checkOf(p) === "order" ? 2 : ["builtinDefinitions", "builtinAdditions"].includes(checkOf(p)) ? 1 : 0);
    const first = r.malformed ? null : [...r.problems].sort((a, b) => rank(a) - rank(b))[0];
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
    ...(missingFields.length ? { missingFields } : {}),
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
        failingDraftOnly: s.failingDraftOnly,
        ...(c.edition ? { edition: c.edition } : {}),
        ...(c.basis ? { basis: c.basis } : {}),
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
const hasResponse = (answer) => answer !== null && typeof answer === "object" && "response" in answer;
const isMapValue = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const listed = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

// The fields of each introspection type, from DISCOVERY_QUERY's response,
// or null if it doesn't say.
const presentFields = (response) => {
  if (!isMapValue(response) || isRequestError(response) || !isMapValue(response.data)) return null;
  const out = {};
  for (const [alias, owner] of DISCOVERY_ALIASES) {
    const fields = response.data[alias]?.fields;
    if (!Array.isArray(fields) || !fields.every((f) => typeof f?.name === "string")) return null;
    out[owner] = new Set(fields.map((f) => f.name));
  }
  return out;
};

// The profile for a run, from the answers for the probe (the first
// vector). askQuery(query) returns the adapter's answer for the probe's
// schema. Returns { profile, missing, first, note }: first is the answer
// the probe is graded on.
//
// 1. The draft's query. Anything but a request error (errors and no data
//    entry) keeps the draft profile: an execution failure fails executes.
// 2. October 2021's query: anything but a request error selects October
//    2021.
// 3. Both rejected: DISCOVERY_QUERY asks for the fields of each
//    introspection type. If all the fields a profile's query needs but
//    lacks are FILLABLE, the kit asks that query without them, the draft's
//    first, and takes the first one answered. Otherwise the draft profile
//    stays, and every vector fails executes.
export const chooseProfile = async (probe, askQuery) => {
  const first = await askQuery(probe.query);
  const draft = { profile: "draft", missing: [], first };
  if (!hasResponse(first) || !isRequestError(first.response) || !probe.query2021) return draft;
  const old = await askQuery(probe.query2021);
  if (!hasResponse(old)) return draft;
  if (!isRequestError(old.response)) {
    const note = `The draft's introspection query was rejected ("${firstError(first.response)}") and October 2021's was answered, so this run grades against October 2021.`;
    return { profile: "oct2021", missing: [], first: old, note };
  }
  const rejected = `The draft's introspection query was rejected ("${firstError(first.response)}"), and so was October 2021's ("${firstError(old.response)}")`;
  const fields = await askQuery(DISCOVERY_QUERY);
  const present = hasResponse(fields) ? presentFields(fields.response) : null;
  if (!present) return { ...draft, note: `${rejected}, and the fields of the introspection types couldn't be read, so this run grades against the draft.` };
  const lacking = (profile) =>
    Object.entries(neededFields(profile)).flatMap(([owner, names]) => names.filter((f) => !present[owner].has(f)).map((f) => `${owner}.${f}`));
  for (const profile of PROFILES) {
    const missing = lacking(profile);
    // With nothing missing, this is the query that was rejected.
    if (missing.length === 0 || !missing.every((m) => m in FILLABLE)) continue;
    const answer = await askQuery(schemaQuery(profile, probe.includeDeprecated, missing));
    if (hasResponse(answer) && !isRequestError(answer.response)) {
      const edition = profile === "draft" ? "the draft" : "October 2021";
      const note = `${rejected}. The introspection types lack ${listed(missing)}, so this run asks ${edition}'s query without them, grades against ${edition}, and counts each missing field against its check.`;
      return { profile, missing, first: answer, note };
    }
  }
  const missing = lacking("oct2021");
  const why = missing.length
    ? `The introspection types lack ${listed(missing)}${missing.every((m) => m in FILLABLE) ? ", and October 2021's query without them was rejected too" : ", which the kit can't grade without"}`
    : "The introspection types have every field October 2021's query selects";
  return { ...draft, note: `${rejected}. ${why}, so this run grades against the draft.` };
};

export const run = async ({ adapter, strict, log = console.log }) => {
  const { vectors, builtins } = loadVectors();
  const sdls = [...new Set(vectors.map((v) => v.sdl))];
  const data = sdls.map(schemaData);
  const docOf = (v) => data[sdls.indexOf(v.sdl)];
  const editionDirectives = (profile) => new Set(builtins[profile].directives.map((d) => d.name));
  // The built-in directives the service returned for a schema's __schema,
  // which its lookups can't show; all of the edition's if unknown.
  const providedIn = (v, response, profile, missing) => {
    const S = docOf(v);
    try {
      const names = caseOf(response, S.directives.map((d) => d.name), S.types.map((t) => t.name), profile, missing).actual.builtinDirectiveNames;
      return new Set([...names].filter((n) => BUILTIN_DIRECTIVES.includes(n)));
    } catch (error) {
      if (!(error instanceof Malformed)) throw error;
      return editionDirectives(profile);
    }
  };
  const caseFor = (v, response, { profile, queryAccepted, provided, missing = [] }) => {
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
      missing: v.lookups ? missing.filter(lookupSelects) : missing,
    };
  };

  let adapterProblems = 0;
  const answered = (answer) => {
    const ok = hasResponse(answer);
    if (!ok) adapterProblems++;
    return ok;
  };
  const probe = vectors[0];
  const chosen = await chooseProfile(probe, async (query) => {
    const answer = await ask(adapter, "introspect", { sdl: probe.sdl, query });
    answered(answer);
    return answer;
  });
  const { profile, missing, first } = chosen;
  const profileNote = chosen.note;
  const queryAccepted = !isRequestError(first?.response);
  const graded = profile === "oct2021" ? vectors.filter((v) => v.query2021) : vectors;
  const skipped = vectors.length - graded.length;

  // The vector's query for the profile, without the fields the service
  // lacks.
  const queryOf = (v) => {
    if (missing.length) return v.lookups ? lookupQuery(profile, v.lookups, v.includeDeprecated, missing) : schemaQuery(profile, v.includeDeprecated, missing);
    return profile === "oct2021" ? v.query2021 : v.query;
  };
  const answers = [first];
  for (const v of graded.slice(1)) {
    const answer = await ask(adapter, "introspect", { sdl: v.sdl, query: queryOf(v) });
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
      const provided = v.lookups ? providedIn(v, responseOfFamily(v.family), profile, missing) : undefined;
      return caseFor(v, a?.response, { profile, queryAccepted, provided, missing });
    }),
    ...controls.map((c) => caseFor(c.vector, c.response, { profile: c.profile, queryAccepted: true, provided: c.provided, missing: c.missing })),
  ];
  const results = await evaluate(data, cases);
  const own = results.slice(0, graded.length);

  const problems = [];
  controls.forEach((c, k) => {
    const r = results[graded.length + k];
    const failed = failedChecks(r);
    const wrong = Array.isArray(c.check)
      ? failed.join() !== [...c.check].sort().join()
      : c.check === "pass"
        ? failed.length > 0
        : c.check === "any"
          ? failed.length === 0
          : c.only
            ? failed.join() !== c.check
            : !failed.includes(c.check);
    if (wrong) {
      problems.push(`${c.name} (${c.vector.id}, ${c.profile}): expected ${c.check === "pass" ? "no failure" : [c.check].flat().join(", ")}, got ${failed.join(", ") || "no failure"}`);
    }
  });
  // The profile's choice, from scripted answers for the probe.
  const profileControls = PROFILE_CONTROLS(vectors, builtins);
  for (const c of profileControls) {
    const got = await chooseProfile(probe, async (query) => ({ response: c.answer(query) }));
    if (got.profile !== c.profile || got.missing.join() !== c.missing.join()) {
      problems.push(`${c.name}: expected the ${c.profile} profile${c.missing.length ? ` without ${c.missing.join(", ")}` : ""}, got ${got.profile}${got.missing.length ? ` without ${got.missing.join(", ")}` : ""}`);
    }
  }
  for (const p of problems) log(`✗ self-test: ${p}`);
  const negative = controls.filter((c) => c.check !== "pass").length + profileControls.length;
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
    missingFields: missing,
  });
  if (profileNote) log(`  ${profileNote}${skipped ? ` ${plural(skipped, "draft-only vector")} skipped.` : ""}`);
  const passing = own.filter((r) => failedChecks(r).length === 0).length;
  const notMust = own.filter((r) => {
    const f = failedChecks(r);
    return f.length > 0 && f.every((id) => !MUST.has(id));
  }).length;
  const should = notMust ? `, ${notMust} more fail only a SHOULD or informational check` : "";
  log(`${passing === graded.length ? "✓" : "✗"} ${passing} of ${graded.length} introspection results satisfy Introspection.tla${should}`);
  const draft = (f) => (f.draftOnly ? `, ${f.draftOnly === f.cases ? "all" : f.draftOnly} draft only` : "");
  for (const f of report.findings) log(`  ✗ ${f.summary} (${plural(f.cases, "result")}${draft(f)}, e.g. ${f.fixture})`);
  if (problems.length === 0) log(`✓ the checker catches all ${negative} negative controls`);
  const failing = report.checks.filter((c) => c.status === "fail" && (c.level === "MUST" || (strict && c.level === "SHOULD")));
  const ok = problems.length === 0 && adapterProblems === 0 && failing.length === 0;
  return { ok, report };
};
