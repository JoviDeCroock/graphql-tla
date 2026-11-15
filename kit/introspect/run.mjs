// The introspect area (docs/kit/introspect.md): the adapter executes a
// fixed introspection query against an SDL schema, __type(name:) lookups,
// or __type(name: "__Schema")'s wrapper types, and the kit checks the
// response against specs/Introspection.tla. For each response, tla-ts
// evaluates Introspection!Matches (or TypeByNameMatches, or
// WrapperMatches) and IntrospectChecks!Problems, which names the §4 aspect
// each difference falls under. The response's shape and envelope are
// checked in JS first (data.mjs). An adapter `error` is a crash, which
// fails executes.
//
// Profiles (chooseProfile): the kit asks the first vector with the draft's
// query. If that is rejected, it asks which fields and arguments the
// introspection types have, and asks the draft's query without the ones
// the service lacks, if the kit can do without them; then October 2021's
// query, and October 2021's without what the service lacks. What the
// service lacks counts once per run, under builtinDefinitions.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Crash, answerOrCrash, crashResponse } from "../areas.mjs";
import { REPORT_FORMAT, provenance, section } from "../report.mjs";
import { chunked, evaluateModule, moduleFooter, pool, schemaData, tla } from "../schema/tla.mjs";
import {
  BUILTIN_DIRECTIVES,
  BUILTIN_SCALARS,
  Malformed,
  caseOf,
  envelopeProblems,
  fillDefinitions,
  fullResponse,
  isBuiltinType,
  isRequestError,
  lookupCaseOf,
  wrappersCaseOf,
} from "./data.mjs";
import { CONTROLS, PROFILE_CONTROLS } from "./controls.mjs";
import { DISCOVERY_ALIASES, DISCOVERY_QUERY, INCLUDE_DEPRECATED, isArgument, lookupQuery, neededArgs, neededFields, schemaQuery, wrappersQuery } from "./query.mjs";

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
  ["defaultValue", "defaultValue is null for an input value without a default, and otherwise null or an encoding of the default", "MUST", ["4.2.4"]],
  [
    "defaultValueOmitted",
    "defaultValue encodes the default value of an input value that has one, rather than returning null",
    "SHOULD",
    ["4.2.4"],
    {
      basis:
        '§4.2.4: "defaultValue may return a String encoding (using the GraphQL language) of the default value used by this input value in the condition a value is not provided at runtime. If this input value has no default value, returns null." By Appendix A, a lowercase "may" keeps its RFC 2119 meaning, so the encoding is optional; the intent is plainly that a default is encoded, which makes this a SHOULD. A string that isn\'t an encoding of the default, or one for an input value without a default, still fails defaultValue.',
    },
  ],
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
  ["specifiedByURL", "specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null", "MUST", ["4.2.2", "3.13.4"]],
  ["isOneOf", "isOneOf is true exactly for OneOf input objects", "MUST", ["4.2.2", "3.10.1"], { edition: "draft", draft: "OneOf input objects" }],
  [
    "descriptions",
    "A description the document gives is returned as it is, the schema's included",
    "SHOULD",
    ["3.2", "4.2"],
    {
      basis:
        '§3.2: documentation is "written immediately alongside definitions in a TypeSystemDocument and made available via introspection", which has no key word, and §4.2 says of every description field that it "may return a String or null". So a description the document gives that is lost or replaced fails this SHOULD, and any description is accepted for a definition the document doesn\'t describe ("" or one of the service\'s own included).',
    },
  ],
  [
    "directives",
    "directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types",
    "MUST",
    ["4.2.1", "4.2.6", "3.13"],
  ],
  [
    "builtinDirectives",
    "@skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object",
    "SHOULD",
    ["3.13", "3.13.1", "3.13.2", "3.13.4", "3.13.5"],
  ],
  [
    "builtinDefinitions",
    "The introspection types and built-in directives are as the spec defines them, with nothing left out or changed",
    "MUST",
    ["4.2", "3.13"],
  ],
  [
    "builtinNullability",
    "The fields of the introspection types have the Non-Null wrapping the spec gives them",
    "SHOULD",
    ["4.2"],
    {
      basis:
        'The types of the introspection fields are given only by the definitions §4.2 introduces with "Below are the full set of type system definitions providing schema introspection, which are fully defined in the sections below", which has no key word. The sections below say what each field returns ("isRepeatable must return a Boolean"), and a field whose type differs only in Non-Null can still return exactly that. Any other change of type stays under builtinDefinitions, a MUST.',
    },
  ],
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
  [
    "builtinEdition",
    "Under the October 2021 profile, a built-in definition that differs from October 2021's is as the draft defines it",
    "INFO",
    ["4.2", "3.13"],
    {
      basis:
        "The kit grades against the draft; the October 2021 profile is a fallback for a service whose introspection types the draft's query can't ask. A built-in definition (or an addition) that is exactly the draft's breaks nothing the draft requires, so it is reported here, not under builtinDefinitions or builtinAdditions.",
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
// Checks only the October 2021 profile grades.
const ONLY_OCT2021 = new Set(["builtinEdition"]);
const exercises = (vector, id, profile) => {
  if (profile === "oct2021" ? NOT_OCT2021.has(id) : ONLY_OCT2021.has(id)) return false;
  if (vector.wrappers) return id === "typeKinds";
  return vector.lookups ? !SCHEMA_ONLY.has(id) : !LOOKUP_ONLY.has(id);
};

const MUST = new Set(CHECKS.filter((c) => c.level === "MUST").map((c) => c.id));

// The fields and arguments of the introspection types a service may lack
// and still be graded: query.mjs's selection leaves them out, data.mjs
// fills in their values, and fillDefinitions their definitions. Without any
// other, such as __Type.kind or __Field.type, nothing can be graded. Each
// one the service lacks counts once per run, under builtinDefinitions, and
// a result's problems it hides (hides, below) aren't counted.
export const FILLABLE = new Set([
  "__Schema.description",
  "__Type.description",
  "__Type.specifiedByURL",
  "__Type.isOneOf",
  "__Field.description",
  "__Field.isDeprecated",
  "__Field.deprecationReason",
  "__InputValue.description",
  "__InputValue.defaultValue",
  "__InputValue.isDeprecated",
  "__InputValue.deprecationReason",
  "__EnumValue.description",
  "__EnumValue.isDeprecated",
  "__EnumValue.deprecationReason",
  "__Directive.description",
  "__Directive.isRepeatable",
  "__Directive.isDeprecated",
  "__Directive.deprecationReason",
  ...Object.values(INCLUDE_DEPRECATED).map((x) => x.arg),
]);
// Where a problem is: the schema, a type ("Q"), a member ("Q.a": a field,
// input field or enum value), an argument ("Q.a(x:)", "@d(x:)"), a
// directive ("@d"), or the directives list ("").
const isTypePlace = (w) => /^\w+$/.test(w) && w !== "schema";
const isMemberPlace = (w) => /^\w+\.\w+$/.test(w);
const isArgumentPlace = (w) => /\(\w+:\)$/.test(w);
const isDirectivePlace = (w) => /^@\w+$/.test(w);

// Whether the missing field or argument m hides the problem: the kit can't
// see what the problem is about without it. kindOf names a type's kind.
const hides = (m, [aspect, where], kindOf) => {
  const owner = kindOf(where.split(/[.(]/)[0]);
  const withFields = owner === "OBJECT" || owner === "INTERFACE";
  const isField = isMemberPlace(where) && withFields;
  const isInputValue = isArgumentPlace(where) || (isMemberPlace(where) && owner === "INPUT_OBJECT");
  const isEnumValue = isMemberPlace(where) && owner === "ENUM";
  const [, type, field] = m.match(/^(\w+)\.(\w+)/);
  const of = { __Schema: where === "schema" || where === "", __Type: isTypePlace(where), __Field: isField, __InputValue: isInputValue, __EnumValue: isEnumValue, __Directive: isDirectivePlace(where) }[type];
  if (isArgument(m)) {
    if (aspect !== "includeDeprecated") return false;
    if (m.startsWith("__Schema.directives(")) return where === "";
    if (m.startsWith("__Field.args(")) return isMemberPlace(where);
    if (m.startsWith("__Directive.args(")) return isDirectivePlace(where);
    const kind = { fields: withFields, enumValues: owner === "ENUM", inputFields: owner === "INPUT_OBJECT" }[field];
    return isTypePlace(where) && kind;
  }
  if (field === "description") return aspect === "description" && of;
  if (field === "isDeprecated" || field === "deprecationReason") return aspect === "deprecation" && of;
  if (field === "specifiedByURL") return aspect === field;
  if (field === "isOneOf") return aspect === "isOneOf" || aspect === "isOneOfNull" || aspect === "wrapperIsOneOf";
  if (field === "defaultValue") return aspect === "defaultValue" || aspect === "defaultValueOmitted";
  if (field === "isRepeatable") return aspect === "isRepeatable";
  return false;
};

const ASPECT = {
  kind: "typeKinds",
  fields: "fields",
  arguments: "arguments",
  defaultValue: "defaultValue",
  defaultValueOmitted: "defaultValueOmitted",
  inputFields: "inputFields",
  enumValues: "enumValues",
  interfaces: "interfaces",
  deprecation: "deprecation",
  includeDeprecated: "deprecation",
  specifiedByURL: "specifiedByURL",
  isOneOf: "isOneOf",
  description: "descriptions",
  directives: "directives",
  isRepeatable: "directives",
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

// The check a problem counts against. A built-in directive the service
// must return and doesn't (requiredDirective) is a MUST: @deprecated under
// deprecation (§3.13: "must provide the @deprecated directive if
// representing deprecated portions of the schema"), and @specifiedBy and
// @oneOf, which the result shows are provided, under directives ("all
// provided directives, including any built-in directive, must be included
// in the set of returned directives"). A schema rejected because it
// applies a directive the service needn't provide (unsupportedDirective)
// is a SHOULD. A problem with a built-in where the answer follows the
// draft, under the October 2021 profile ("draft:"), is informational.
export const checkOf = ([aspect, where]) => {
  if (aspect.startsWith("draft:")) return "builtinEdition";
  // An item added to an introspection type's list, or an introspection type
  // of the service's own. Added arguments of a built-in directive are
  // §3.13's, and stay with builtinDefinitions.
  if (aspect.startsWith("added:")) {
    const owner = ownerOf(where);
    return owner.builtin && !owner.directive ? "builtinAdditions" : checkOf([aspect.slice("added:".length), where]);
  }
  if (aspect === "nullability") return ownerOf(where).builtin ? "builtinNullability" : "fields";
  if (aspect === "wrapperFields" || aspect === "wrapperIsOneOf" || aspect === "isOneOfNull") return "typeKinds";
  if (aspect === "builtinScalars" || aspect === "builtinDirectives" || aspect === "typeByName") return aspect;
  if (aspect === "requiredDirective") return where === "@deprecated" ? "deprecation" : "directives";
  if (aspect === "unsupportedDirective") return "builtinDirectives";
  if (aspect === "serviceTypes") return "directives";
  if (aspect === "wrapper") return "typeKinds";
  if (aspect === "order" || aspect === "typename") return aspect;
  if (ownerOf(where).builtin) return "builtinDefinitions";
  const check = ASPECT[aspect];
  if (!check) throw new Error(`no check for the aspect ${aspect}`);
  return check;
};

// Whether builtins b (vectors.json's builtins[profile]) define what a place
// names: a type, a field, an input field or enum value, an argument, or a
// directive. A missing field or argument is named the same way.
export const defines = (b, where) => {
  const m = where.match(/^(@?)(\w+)(?:\.(\w+))?(?:\((\w+):\))?$/);
  if (!m) return false;
  const [, at, name, member, arg] = m;
  // Both editions have the five built-in scalars, which `b` doesn't list.
  if (!at && !member && BUILTIN_SCALARS.includes(name)) return true;
  if (at) {
    const d = b.directives.find((x) => x.name === name);
    return Boolean(d) && (!arg || d.args.some((a) => a.name === arg));
  }
  const t = b.types.find((x) => x.name === name);
  if (!t || !member) return Boolean(t);
  const items = [...(t.fields ?? []), ...(t.inputFields ?? []), ...(t.enumValues ?? [])];
  const item = items.find((x) => x.name === member);
  return Boolean(item) && (!arg || (item.args ?? []).some((a) => a.name === arg));
};

// ---------------------------------------------------------------------------
// Evaluating cases with tla-ts

const SHARD = 12;

// The parent of a problem's `where`: "__Field.args" for
// "__Field.args(includeDeprecated:)", "__Type" for "__Type.fields".
const parentOf = (where) => (where.endsWith(":)") ? where.slice(0, where.lastIndexOf("(")) : where.includes(".") ? where.slice(0, where.lastIndexOf(".")) : "");
const key = ([aspect, where]) => `${aspect}\u0000${where}`;

// Whether a problem with a built-in definition (or, under the October 2021
// profile, an addition to one) is where the answer follows the other
// edition: comparing with that edition's built-ins (other) finds no
// problem there, and none with the built-in list it belongs to, left out
// or added. A built-in directive's list is `directives`, which holds the
// document's directives too, so it isn't consulted.
const followsOther = ([aspect, where], other) => {
  const parent = parentOf(where);
  const base = aspect.replace(/^added:/, "");
  const places = [[aspect, where], ...(parent === "" ? [] : [[base, parent], [`added:${base}`, parent]])];
  return !places.some((p) => other.has(key(p)));
};

// The built-in directives a lookup's answer shows the service provides: a
// specifiedByURL shows @specifiedBy, and a true isOneOf @oneOf
// (Introspection!ShownDirectiveNames).
const shownIn = (actual) => {
  const types = actual.flatMap((l) => l.result);
  return [...(types.some((t) => t.specifiedByURL.length > 0) ? ["specifiedBy"] : []), ...(types.some((t) => t.isOneOf[0] === true) ? ["oneOf"] : [])];
};

// Each case: { schema (index into schemas), profile, inc, response (or a
// Crash), directives and types (the document's names), lookups and provided
// (for a lookup vector), wrappers (for the wrappers vector), needs, syntax,
// queryAccepted, missing, builtins (vectors.json's) and kindOf }. Returns,
// per case, one of:
// - { envelope, crash }: the adapter answered with an error;
// - { envelope, malformed }: not the result of the query;
// - { envelope, problems, rejected }: a schema rejected for a directive it
//   needn't support (needs);
// - { envelope, unbuilt }: a schema rejected that uses syntax only the
//   draft has (syntax), which isn't graded;
// - { envelope, problems, matches, oct2021 }: oct2021 holds the problems of
//   a draft answer where it follows October 2021 instead (followsOther, and
//   anything October 2021 doesn't define). Under the October 2021 profile,
//   a problem where the answer follows the draft has its aspect prefixed
//   with "draft:".
const evaluate = async (schemas, cases) => {
  const results = new Array(cases.length);
  const prepared = [];
  cases.forEach((c, i) => {
    if (c.response instanceof Crash) {
      results[i] = { envelope: [], crash: c.response.message, oct2021: new Set() };
      return;
    }
    const envelope = envelopeProblems(c.response);
    // A request error for a schema that applies @specifiedBy or @oneOf,
    // from an implementation that answers the query for other schemas:
    // it doesn't provide the directive, which §3.13 allows.
    if (c.needs?.length && c.queryAccepted && isRequestError(c.response)) {
      results[i] = { envelope, problems: c.needs.map((n) => ["unsupportedDirective", `@${n}`]), rejected: true, oct2021: new Set() };
      return;
    }
    // A request error for a schema written with syntax only the draft's
    // grammar has: the schema didn't build, which says nothing about
    // introspection.
    if (c.syntax && c.queryAccepted && isRequestError(c.response)) {
      results[i] = { envelope, unbuilt: c.syntax, oct2021: new Set() };
      return;
    }
    try {
      const response = fillDefinitions(c.response, c.missing, c.builtins[c.profile], c.profile);
      let data;
      if (c.wrappers) data = { kind: "wrappers", ...wrappersCaseOf(response, c.profile, c.missing) };
      else if (c.lookups) {
        const lookup = lookupCaseOf(response, c.lookups, c.profile, c.missing);
        data = { kind: "lookup", extras: [], extraTypes: [], provided: new Set([...c.provided, ...shownIn(lookup.actual)]), ...lookup };
      } else data = { kind: "schema", ...caseOf(response, c.directives, c.types, c.profile, c.missing) };
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
    for (const [, n, [problems, matches, otherProblems]] of verdicts) {
      const { i } = shard[n - 1];
      Object.assign(results[i], { problems: problems.map(([aspect, where]) => [aspect, where]), matches, other: new Set(otherProblems.map(key)) });
    }
  });
  // Problems must explain the reference's verdict: none when Matches
  // holds, apart from the checks Matches doesn't make, and some when it
  // doesn't. Then the problems a missing field or argument hides are left
  // out, and problems with built-ins are labelled by edition.
  results.forEach((r, i) => {
    if (r.malformed || r.rejected || r.crash || r.unbuilt) return;
    const c = cases[i];
    const graded = r.problems.filter(([aspect]) => !["typename", "builtinDirectives", "serviceTypes"].includes(aspect));
    if (r.matches && graded.length > 0) throw new Error(`kit bug: Introspection!Matches holds, but IntrospectChecks found ${JSON.stringify(graded)}`);
    const visible = r.problems.filter((p) => !c.missing.some((m) => hides(m, p, c.kindOf)));
    if (!r.matches && r.problems.length === 0) visible.push(["other", ""]);
    r.problems = c.profile === "oct2021" ? visible.filter(([aspect]) => aspect !== "order") : visible;
    // Every check about built-in definitions is labelled the same way:
    // definitions, additions and Non-Null wrapping.
    const builtinProblem = (p) => ["builtinDefinitions", "builtinAdditions", "builtinNullability"].includes(checkOf(p));
    if (c.profile === "draft") {
      const oct = c.builtins.oct2021;
      r.oct2021 = new Set(r.problems.filter((p) => builtinProblem(p) && (followsOther(p, r.other) || !defines(oct, p[1]))).map(key));
    } else {
      r.oct2021 = new Set();
      r.problems = r.problems.map((p) => (builtinProblem(p) && followsOther(p, r.other) ? [`draft:${p[0]}`, p[1]] : p));
    }
  });
  return results;
};

// ---------------------------------------------------------------------------
// Reporting

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const listed = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

// The check ids a result fails. A crash fails executes; a schema that
// didn't build for draft-only syntax fails nothing but its envelope.
const failedChecks = (r) =>
  [...new Set([...(r.envelope.length ? ["envelope"] : []), ...(r.crash || r.malformed ? ["executes"] : r.unbuilt ? [] : r.problems.map(checkOf))])].sort();

// Whether a problem rests on what only the draft has: OneOf input objects,
// Stable Ordering, or a built-in definition where the answer follows
// October 2021 instead, or that October 2021 doesn't define.
const draftOnly = (problem, r) => {
  const [aspect, where] = problem;
  if (where === "@oneOf" || ["isOneOf", "isOneOfNull", "wrapperIsOneOf", "order"].includes(aspect)) return true;
  return r.oct2021.has(key(problem));
};

// Whether a result's failure of check id rests on the draft: the vector is
// draft only, or every problem behind the failure is (draftOnly). A crash
// on a draft-only vector is draft only because the vector's schema isn't
// valid October 2021 input (its SDL needs the draft's grammar or rules).
const draftFor = (v, r, id) => {
  if (v.edition === "draft") return true;
  if (r.malformed || r.crash || id === "envelope") return false;
  const behind = r.problems.filter((p) => checkOf(p) === id);
  return behind.length > 0 && behind.every((p) => draftOnly(p, r));
};

// One problem in words, without the schema-specific part unless it is a
// built-in, so that the same fault groups across schemas.
const describe = (problem, vector, r, profile) => {
  const [aspect, where] = problem;
  const check = checkOf(problem);
  const draft = where === "@oneOf" ? " (draft only)" : "";
  if (check === "builtinEdition") {
    const base = aspect.slice("draft:".length);
    if (base.startsWith("added:")) return `the built-in ${where} has ${{ "added:fields": "a field", "added:enumValues": "an enum value", "added:arguments": "an argument", "added:types": "an introspection type" }[base] ?? "an item"} October 2021 doesn't define, as the draft does`;
    return `the built-in ${where} isn't as October 2021 defines it, but is as the draft does (${base})`;
  }
  if (check === "builtinScalars") {
    const expected = vector.expected.response.data.__schema.types.some((t) => t.name === where);
    return expected ? `leaves out ${where}, a built-in scalar the schema references` : `includes ${where}, a built-in scalar nothing references`;
  }
  if (aspect === "builtinDirectives") return `doesn't provide ${where}${draft}`;
  if (aspect === "unsupportedDirective") return `rejects a schema that applies ${where}, so doesn't provide it${draft}`;
  if (aspect === "requiredDirective") {
    if (where === "@deprecated") return "doesn't return @deprecated, though the schema deprecates something";
    if (where === "@specifiedBy") return "doesn't return @specifiedBy in directives, though a scalar's specifiedByURL shows it is provided";
    return "doesn't return @oneOf in directives, though an input object's isOneOf shows it is provided (draft only)";
  }
  if (aspect === "serviceTypes") return "a directive of the service's own takes an argument of a type that isn't an input type";
  if (aspect === "wrapper") return "a List or Non-Null type has a non-null field other than kind and ofType";
  if (aspect === "wrapperIsOneOf") return "a List or Non-Null type has a non-null isOneOf (draft only)";
  if (aspect === "isOneOfNull") return `${ownerOf(where).builtin ? `the built-in ${where}'s` : "a type's"} isOneOf is null for an input object, or not null for another kind (draft only)`;
  if (aspect === "wrapperFields") return '__type(name: "__Schema") doesn\'t return each of __Schema\'s fields once, with its type, so their wrapper types can\'t all be checked';
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
  if (check === "builtinNullability") {
    const base = `the built-in ${where} has the spec's type, but not its Non-Null wrapping`;
    if (profile === "oct2021" || !r.oct2021.has(key(problem))) return base;
    return defines(r.builtinsOct2021, where) ? `${base}; it is as October 2021 defines it` : `${base}; October 2021 doesn't define it`;
  }
  if (check === "builtinDefinitions") {
    if (profile === "oct2021") return `the built-in ${where} isn't as October 2021 defines it (${aspect})`;
    if (!r.oct2021.has(key(problem))) return `the built-in ${where} isn't as the spec defines it (${aspect})`;
    return defines(r.builtinsOct2021, where)
      ? `the built-in ${where} isn't as the draft defines it, but is as October 2021 does (${aspect})`
      : `the built-in ${where} isn't as the draft defines it; October 2021 doesn't define it (${aspect})`;
  }
  if (check === "typename") return where === "" ? "the root's __typename isn't the query root type's name" : "lists __typename among a type's fields";
  if (aspect === "defaultValueOmitted") return "defaultValue is null for an input value that has a default";
  if (aspect === "includeDeprecated") return "a list's deprecated items don't follow includeDeprecated";
  return `${CHECKS.find((c) => c.id === check).title.replace(/^./, (x) => x.toLowerCase())}: differs from Introspection.tla`;
};

// The part of a response a problem is about: the type or directive, the
// wrapper types of one of __Schema's fields, or the schema's root fields.
const partOf = (response, [aspect, where], vector) => {
  if (aspect === "wrapperFields") return response?.data?.wrappers ?? response;
  if (aspect === "wrapper" || aspect === "wrapperIsOneOf") {
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
  if (profile !== "oct2021" && ONLY_OCT2021.has(c.id)) return { note: "Graded only under the October 2021 profile." };
  if (profile === "oct2021" && c.oct2021) return { note: `Graded for ${c.oct2021}: the implementation answered the October 2021 query.` };
  if (c.edition === "draft") return { note: `Draft only: October 2021 has no ${c.draft}.` };
  return {};
};

// The run-level finding for the fields and arguments the introspection
// types lack: one case, under builtinDefinitions. It is draft only when
// October 2021 defines none of them.
const missingFinding = (missingFields, builtins, discovery) => {
  const draftOnlyMissing = missingFields.every((m) => !defines(builtins.oct2021, m));
  return {
    finding: {
      checks: ["builtinDefinitions"],
      summary: `the introspection types lack ${listed(missingFields)}, so the kit leaves them out of every query, and grades what it can see without them`,
      cases: 1,
      fixtures: { discovery: 1 },
      fixture: "discovery",
      problem: missingFields.join(", "),
      ...(draftOnlyMissing ? { draftOnly: 1, edition: "draft" } : {}),
      example: {
        input: "the fields of each introspection type, with their arguments (the kit's IntrospectionFields query)",
        response: discovery ?? "not asked",
        expected: `the fields and arguments the spec defines, including ${listed(missingFields)}`,
      },
    },
    draftOnly: draftOnlyMissing,
  };
};

export const buildReport = ({
  vectors,
  builtins,
  answers,
  results,
  strict,
  implementation,
  capabilities,
  selfTestText,
  adapterProblems,
  profile,
  total = vectors.length,
  skipped = {},
  profileNote,
  missingFields = [],
  discovery,
}) => {
  const stats = new Map(CHECKS.map((c) => [c.id, { cases: 0, failing: 0, failingDraftOnly: 0 }]));
  const findings = new Map();
  const notGraded = {};
  vectors.forEach((v, i) => {
    const r = results[i];
    r.builtinsOct2021 = builtins.oct2021;
    for (const c of CHECKS) {
      const exercised =
        c.id === "envelope" ||
        (!r.unbuilt && (c.id === "executes" || (!r.malformed && !r.crash && (r.rejected ? c.id === "builtinDirectives" : exercises(v, c.id, profile)))));
      if (exercised) stats.get(c.id).cases++;
    }
    if (r.unbuilt) notGraded[r.unbuilt] = (notGraded[r.unbuilt] ?? 0) + 1;
    const failed = failedChecks(r);
    for (const id of failed) {
      stats.get(id).failing++;
      if (draftFor(v, r, id)) stats.get(id).failingDraftOnly++;
    }
    if (failed.length === 0) return;
    const descriptions = [
      ...r.envelope.map((e) => `the response envelope: ${e}`),
      ...(r.crash
        ? ["crashes: the adapter answered with an error"]
        : r.malformed
          ? ["the schema didn't build, the query failed, or the result doesn't have the fields the query selects"]
          : r.unbuilt
            ? []
            : [...new Set(r.problems.map((p) => describe(p, v, r, profile)))].sort()),
    ];
    const findingKey = descriptions.join("\u0000");
    // The example shows a problem with the document's types first, then
    // one with a built-in, then an order.
    const rank = (p) => (checkOf(p) === "order" ? 2 : ["builtinDefinitions", "builtinAdditions", "builtinNullability", "builtinEdition"].includes(checkOf(p)) ? 1 : 0);
    const whole = r.malformed || r.crash || r.unbuilt;
    const first = whole ? null : [...r.problems].sort((a, b) => rank(a) - rank(b))[0];
    const expected = fullResponse(v, builtins, profile);
    const what = v.wrappers ? '__type(name: "__Schema")\'s fields and their types' : v.lookups ? `__type(name:) for ${v.lookups.map((l) => l.name).join(", ")}` : "the introspection query";
    const example = {
      input: `${v.edition === "draft" ? "[draft] " : ""}${v.sdl.replace(/\s+/g, " ")}  (${what}${profile === "oct2021" ? ", October 2021 profile" : ""}; includeDeprecated: ${v.includeDeprecated ? "true" : "the default"})`,
      response: r.crash ? crashResponse(answers[i]) : whole || !first ? answers[i] : partOf(answers[i].response, first, v),
      expected: whole || !first ? "a well-formed execution result with exactly the fields the query selects, and no errors" : partOf(expected, first, v),
    };
    const f = findings.get(findingKey) ?? {
      checks: failed,
      ...(r.crash ? { kind: "crash" } : {}),
      summary: descriptions.join("; "),
      cases: 0,
      fixtures: {},
      fixture: v.id,
      problem: [...r.envelope, ...(r.crash ? [r.crash] : r.malformed ? [r.malformed] : r.unbuilt ? [] : r.problems.map(([aspect, where]) => `${aspect} at ${where || "the root"}`).sort())].join(", "),
      draftOnly: 0,
      example,
    };
    if (v.edition === "draft" || (!whole && r.envelope.length === 0 && r.problems.every((p) => draftOnly(p, r)))) f.draftOnly++;
    f.cases++;
    f.fixtures[v.family] = (f.fixtures[v.family] ?? 0) + 1;
    findings.set(findingKey, f);
  });
  for (const f of findings.values()) {
    if (f.draftOnly === f.cases) f.edition = "draft";
    if (f.draftOnly === 0) delete f.draftOnly;
  }
  const extra = [];
  if (missingFields.length) {
    const m = missingFinding(missingFields, builtins, discovery);
    const s = stats.get("builtinDefinitions");
    s.cases++;
    s.failing++;
    if (m.draftOnly) s.failingDraftOnly++;
    extra.push(m.finding);
  }
  const crashes = results.filter((r) => r.crash).length;
  return {
    format: REPORT_FORMAT,
    area: "introspect",
    implementation,
    capabilities: [...capabilities].sort(),
    provenance: provenance({ strict, vectors: total, graded: vectors.length, skipped }),
    profile,
    ...(profileNote ? { profileNote } : {}),
    ...(missingFields.length ? { missingFields } : {}),
    checkerSelfTest: selfTestText,
    cases: {
      submitted: vectors.length,
      distinct: vectors.length,
      malformed: results.filter((r) => r.malformed).length,
      ...(crashes ? { crashed: crashes } : {}),
      ...(Object.keys(notGraded).length ? { notGraded } : {}),
    },
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
    findings: [...extra, ...findings.values()].sort((a, b) => b.cases - a.cases),
    fixtures: [],
  };
};

// ---------------------------------------------------------------------------

const firstError = (response) => String(response?.errors?.[0]?.message ?? "no message").slice(0, 200);
const hasResponse = (answer) => answer !== null && typeof answer === "object" && !(answer instanceof Crash) && "response" in answer;
const isMapValue = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
// A query the service didn't answer: a request error, or errors with
// "data": null (some services answer a validation error that way). Either
// sends the profile choice on to the next query.
const isRejection = (response) => isRequestError(response) || (isMapValue(response) && response.data === null && Array.isArray(response.errors) && response.errors.length > 0);
const rejected = (answer) => hasResponse(answer) && isRejection(answer.response);
const answered = (answer) => hasResponse(answer) && !isRejection(answer.response);

// The fields of each introspection type, each with its arguments' names,
// from DISCOVERY_QUERY's response, or null if it doesn't say.
const presentFields = (response) => {
  if (!isMapValue(response) || isRequestError(response) || !isMapValue(response.data)) return null;
  const out = {};
  for (const [alias, owner] of DISCOVERY_ALIASES) {
    const fields = response.data[alias]?.fields;
    if (!Array.isArray(fields) || !fields.every((f) => typeof f?.name === "string" && Array.isArray(f.args) && f.args.every((a) => typeof a?.name === "string"))) return null;
    out[owner] = new Map(fields.map((f) => [f.name, new Set(f.args.map((a) => a.name))]));
  }
  return out;
};

// What a profile's queries need and the service lacks, as `missing` names:
// fields ("__Type.isOneOf"), then arguments of the fields it has
// ("__Schema.directives(includeDeprecated:)").
const lacking = (present, profile) => {
  const fields = Object.entries(neededFields(profile)).flatMap(([owner, names]) => names.filter((f) => !present[owner].has(f)).map((f) => `${owner}.${f}`));
  const args = Object.entries(neededArgs(profile)).flatMap(([at, names]) => {
    const [owner, field] = at.split(".");
    const has = present[owner].get(field);
    return has ? names.filter((a) => !has.has(a)).map((a) => `${at}(${a}:)`) : [];
  });
  return [...fields, ...args];
};

// The profile for a run, from the answers for the probe (the first
// vector). askQuery(query) returns the adapter's answer for the probe's
// schema. Returns { profile, missing, first, note, discovery }: first is
// the answer the probe is graded on, discovery DISCOVERY_QUERY's answer.
//
// 1. The draft's query. Anything but a rejection (a request error, or
//    errors with "data": null) keeps the draft profile.
// 2. DISCOVERY_QUERY asks for the fields of each introspection type, and
//    their arguments. If all the fields and arguments the draft's query
//    needs but the service lacks are FILLABLE, the kit asks the draft's
//    query without them. Answered, that is the draft profile without them.
// 3. October 2021's query: answered, the October 2021 profile.
// 4. October 2021's query without what the service lacks, if FILLABLE.
// 5. Otherwise the draft profile stays, and every vector fails executes.
export const chooseProfile = async (probe, askQuery) => {
  const first = await askQuery(probe.query);
  const draft = { profile: "draft", missing: [], first };
  if (!rejected(first)) return draft;
  const tried = [`The draft's introspection query was rejected ("${firstError(first.response)}")`];
  const fields = await askQuery(DISCOVERY_QUERY);
  const discovery = hasResponse(fields) ? fields.response : undefined;
  const present = discovery === undefined ? null : presentFields(discovery);
  const without = async (profile) => {
    const missing = lacking(present, profile);
    const edition = profile === "draft" ? "the draft" : "October 2021";
    // With nothing missing, this is the query that was rejected.
    if (missing.length === 0) return null;
    if (!missing.every((m) => FILLABLE.has(m))) {
      tried.push(`the introspection types lack ${listed(missing.filter((m) => !FILLABLE.has(m)))}, without which ${edition}'s query can't be graded`);
      return null;
    }
    const answer = await askQuery(schemaQuery(profile, probe.includeDeprecated, missing));
    if (answered(answer)) {
      const note = `${tried.join("; ")}. The introspection types lack ${listed(missing)}, so this run asks ${edition}'s query without them, grades against ${edition}, and counts what they lack once, under builtinDefinitions.`;
      return { profile, missing, first: answer, note, discovery };
    }
    tried.push(`${edition}'s query without ${listed(missing)} was rejected too${hasResponse(answer) ? ` ("${firstError(answer.response)}")` : ""}`);
    return null;
  };
  if (present) {
    const got = await without("draft");
    if (got) return got;
  } else tried.push("the fields of the introspection types couldn't be read");
  if (probe.query2021) {
    const old = await askQuery(probe.query2021);
    if (answered(old)) {
      const note = `${tried.join("; ")}. October 2021's was answered, so this run grades against October 2021.`;
      return { profile: "oct2021", missing: [], first: old, note, discovery };
    }
    tried.push(`so was October 2021's${hasResponse(old) ? ` ("${firstError(old.response)}")` : ""}`);
    if (present) {
      const got = await without("oct2021");
      if (got) return got;
    }
  }
  return { ...draft, note: `${tried.join("; ")}. So this run grades against the draft.`, discovery };
};

export const run = async ({ adapter, strict, log = console.log }) => {
  const { vectors: all, builtins } = loadVectors();
  // Vectors that need a capability the adapter doesn't claim aren't asked.
  const has = adapter.capabilities;
  const skipped = {};
  const vectors = all.filter((v) => {
    const lacks = (v.requires ?? []).filter((c) => !has.has(c));
    for (const c of lacks) skipped[c] = (skipped[c] ?? 0) + 1;
    return lacks.length === 0;
  });
  const sdls = [...new Set(all.map((v) => v.sdl))];
  const data = sdls.map(schemaData);
  const docOf = (v) => data[sdls.indexOf(v.sdl)];
  const editionDirectives = (profile) => new Set(builtins[profile].directives.map((d) => d.name));
  // A type's kind, in the document or among the built-ins.
  const kindsOf = (v) => {
    const kinds = new Map([...builtins.draft.types, ...builtins.oct2021.types].map((t) => [t.name, t.kind]));
    for (const t of docOf(v).types) kinds.set(t.name, t.kind);
    return (name) => kinds.get(name);
  };
  // The built-in directives the service returned for a schema's __schema,
  // which its lookups can't show; all of the edition's if unknown.
  const providedIn = (v, response, profile, missing) => {
    const S = docOf(v);
    try {
      const filled = fillDefinitions(response, missing, builtins[profile], profile);
      const names = caseOf(filled, S.directives.map((d) => d.name), S.types.map((t) => t.name), profile, missing).actual.builtinDirectiveNames;
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
      wrappers: v.wrappers,
      provided: provided ?? editionDirectives(profile),
      needs: v.needs,
      syntax: v.syntax,
      queryAccepted,
      missing,
      builtins,
      kindOf: kindsOf(v),
    };
  };

  let adapterProblems = 0;
  // The adapter's answer, or a Crash. Anything else it sends (an answer
  // without `response`) is an adapter problem.
  const ask = async (sdl, query) => {
    const answer = await answerOrCrash(adapter, "introspect", { sdl, query });
    if (!(answer instanceof Crash) && !hasResponse(answer)) adapterProblems++;
    return answer;
  };
  const probe = vectors[0];
  const chosen = await chooseProfile(probe, (query) => ask(probe.sdl, query));
  const { profile, missing, first, discovery } = chosen;
  const profileNote = chosen.note;
  const queryAccepted = answered(first);
  const graded = profile === "oct2021" ? vectors.filter((v) => v.query2021) : vectors;
  if (profile === "oct2021" && graded.length < vectors.length) skipped["draft only (October 2021 profile)"] = vectors.length - graded.length;

  // The vector's query for the profile, without what the service lacks.
  const queryOf = (v) => {
    if (missing.length) {
      if (v.wrappers) return wrappersQuery(profile, missing);
      return v.lookups ? lookupQuery(profile, v.lookups, v.includeDeprecated, missing) : schemaQuery(profile, v.includeDeprecated, missing);
    }
    return profile === "oct2021" ? v.query2021 : v.query;
  };
  const answers = [first];
  for (const v of graded.slice(1)) answers.push(await ask(v.sdl, queryOf(v)));
  const responseOfFamily = (family) => {
    const a = answers[graded.findIndex((v) => v.id === `${family}.inc`)];
    return hasResponse(a) ? a.response : undefined;
  };
  const responseOf = (a) => (a instanceof Crash ? a : a?.response);

  // The self-test's cases (kit/introspect/controls.mjs), for both profiles:
  // each vector's expected response, which must pass; another vector's,
  // which must fail; and responses broken on purpose, each of which must
  // fail its check.
  const controls = CONTROLS(all, builtins);
  const cases = [
    ...answers.map((a, i) => {
      const v = graded[i];
      const provided = v.lookups ? providedIn(v, responseOfFamily(v.family), profile, missing) : undefined;
      return caseFor(v, responseOf(a), { profile, queryAccepted, provided, missing });
    }),
    ...controls.map((c) => caseFor(c.vector, c.response, { profile: c.profile, queryAccepted: true, provided: c.provided, missing: c.missing })),
  ];
  const results = await evaluate(data, cases);
  const own = results.slice(0, graded.length);

  const problems = [];
  controls.forEach((c, k) => {
    const r = results[graded.length + k];
    r.builtinsOct2021 = builtins.oct2021;
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
    // draftOnly: whether each failing check rests on the draft alone.
    if (c.draftOnly !== undefined && !wrong) {
      for (const id of failed) {
        if (draftFor(c.vector, r, id) !== c.draftOnly) problems.push(`${c.name} (${c.vector.id}, ${c.profile}): ${id} should${c.draftOnly ? "" : "n't"} be draft only`);
      }
    }
    if (c.unbuilt && !r.unbuilt) problems.push(`${c.name} (${c.vector.id}, ${c.profile}): should not be graded`);
  });
  // The profile's choice, from scripted answers for the probe.
  const profileControls = PROFILE_CONTROLS(all, builtins);
  for (const c of profileControls) {
    const got = await chooseProfile(all[0], async (query) => ({ response: c.answer(query) }));
    const same = got.profile === c.profile && [...got.missing].sort().join() === [...c.missing].sort().join();
    if (!same) {
      problems.push(`${c.name}: expected the ${c.profile} profile${c.missing.length ? ` without ${c.missing.join(", ")}` : ""}, got ${got.profile}${got.missing.length ? ` without ${got.missing.join(", ")}` : ""}`);
    }
  }
  // A field the service lacks counts once per run, under builtinDefinitions.
  const counted = buildReport({ vectors: [], builtins, answers: [], results: [], strict, implementation: "", capabilities: [], selfTestText: "", adapterProblems: 0, profile: "draft", missingFields: ["__Type.specifiedByURL"] });
  const once = counted.checks.find((x) => x.id === "builtinDefinitions");
  if (once.failing !== 1 || once.failingDraftOnly !== 0 || counted.findings.length !== 1) problems.push("a missing __Type.specifiedByURL isn't counted once, under builtinDefinitions, in both editions");
  for (const p of problems) log(`✗ self-test: ${p}`);
  const negative = controls.filter((c) => c.check !== "pass").length + profileControls.length + 1;
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
    total: all.length,
    skipped,
    profileNote,
    missingFields: missing,
    discovery,
  });
  if (profileNote) log(`  ${profileNote}`);
  const notAsked = Object.entries(skipped).map(([why, n]) => `${n} ${why === "custom-directives" ? `need ${why}` : why}`);
  if (notAsked.length) log(`  not asked: ${notAsked.join(", ")}`);
  const passing = own.filter((r) => !r.unbuilt && failedChecks(r).length === 0).length;
  const gradedCount = own.filter((r) => !r.unbuilt).length;
  const notMust = own.filter((r) => {
    const f = failedChecks(r);
    return f.length > 0 && f.every((id) => !MUST.has(id));
  }).length;
  const should = notMust ? `, ${notMust} more fail only a SHOULD or informational check` : "";
  const crashed = own.filter((r) => r.crash).length;
  const unbuilt = own.length - gradedCount;
  log(
    `${passing === gradedCount ? "✓" : "✗"} ${passing} of ${gradedCount} introspection results satisfy Introspection.tla${should}${crashed ? `; ${crashed} crashed` : ""}${unbuilt ? `; ${unbuilt} not graded (the schema didn't build: draft-only syntax)` : ""}`,
  );
  const draft = (f) => (f.draftOnly ? `, ${f.draftOnly === f.cases ? "all" : f.draftOnly} draft only` : "");
  for (const f of report.findings) log(`  ✗ ${f.summary} (${plural(f.cases, f.fixture === "discovery" ? "run" : "result")}${draft(f)}, e.g. ${f.fixture})`);
  if (problems.length === 0) log(`✓ the checker catches all ${negative} negative controls`);
  const failing = report.checks.filter((c) => c.status === "fail" && (c.level === "MUST" || (strict && c.level === "SHOULD")));
  const ok = problems.length === 0 && adapterProblems === 0 && failing.length === 0 && gradedCount > 0;
  return { ok, report };
};
