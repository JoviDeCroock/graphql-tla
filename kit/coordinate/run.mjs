// The coordinate area (docs/kit/coordinate.md): §2.14 Schema Coordinates,
// new in September 2025 (September 2026 has the same text). For each vector in vectors.json the kit sends a
// schema (SDL) and a schema coordinate, and the adapter answers whether the
// implementation parses the coordinate and, if it does, what it resolves
// to in that schema. scripts/generate-vectors-coordinate.mjs took every
// expected answer from specs/SchemaCoordinates.tla.
//
// Answers:
//   { ok: false }                                  the coordinate doesn't parse
//   { ok: true, resolved: null }                   it resolves to no element
//   { ok: true, resolved: { kind, path } }         it resolves to an element
//   { ok: true, error: "message" }                 resolving it raised an error
//
// Each vector names the check a wrong answer counts against (`check`): for
// a coordinate the reference rejects, the syntax rule it breaks; for one it
// accepts, the algorithm that resolves it. A coordinate the implementation
// rejects although the reference accepts it fails `grammar`, whatever its
// resolution would have been, so one root cause counts once. A vector
// marked `unspecified` resolves to something the spec gives no defined
// behaviour (a meta-field, an introspection type, an unreferenced built-in
// scalar): only its syntax is graded, and a crash on it isn't graded.
//
// Schema coordinates are new in September 2025, so every vector, every
// failure and every crash relies on that release: October 2021 can't
// express a coordinate request.

import { readFileSync } from "node:fs";
import { Crash, answerOrCrash, crashResponse } from "../areas.mjs";
import { REPORT_FORMAT, provenance, section } from "../report.mjs";

const RELEASE = "September2025";

export const CHECKS = [
  {
    id: "grammar",
    title: "A schema coordinate is one of the five productions, and nothing else",
    level: "MUST",
    basis:
      "\"SchemaCoordinate :: TypeCoordinate | MemberCoordinate | ArgumentCoordinate | DirectiveCoordinate | DirectiveArgumentCoordinate\", with \"TypeCoordinate :: Name\", \"MemberCoordinate :: Name . Name\", \"ArgumentCoordinate :: Name . Name ( Name : )\", \"DirectiveCoordinate :: @ Name\" and \"DirectiveArgumentCoordinate :: @ Name ( Name : )\". A grammar production is a requirement on what parses (Appendix A: \"descriptive assertions\"). A coordinate the reference accepts and the implementation rejects fails here, whatever it resolves to.",
  },
  {
    id: "tokens",
    title: "Only Names and the punctuators ( ) . : @ are tokens",
    level: "MUST",
    basis:
      "\"SchemaCoordinateToken :: SchemaCoordinatePunctuator | Name\", \"SchemaCoordinatePunctuator :: one of ( ) . : @\", and \"A {SchemaCoordinate} is a self-contained grammar with its own set of lexical tokens, it is not contained within a {Document}. The source text of a SchemaCoordinate must be a sequence of {SourceCharacter}.\" So `$`, `!`, a string, a number and `...` as one token are not schema coordinate tokens.",
  },
  {
    id: "noIgnored",
    title: "No whitespace, line terminator, comma, comment or byte order mark anywhere",
    level: "MUST",
    basis:
      "\"Unlike other GraphQL documents, {SchemaCoordinate} must not contain {Whitespace} or other {Ignored} grammars within the character sequence. This ensures that every schema coordinates has a single unambiguous and unique lexical form.\" Ignored is UnicodeBOM, Whitespace, LineTerminator, Comment and Comma (§2.1.7), at the start and the end as well as between tokens.",
  },
  {
    id: "resolvesTypes",
    title: "A type coordinate resolves to the named type, built-in scalars included, or to nothing",
    level: "MUST",
    basis:
      "TypeCoordinate: \"Return the type in {schema} named {typeName} if it exists.\" \"A schema coordinate may refer to either a defined or built-in schema element. For example, `String` ...\"; \"If the schema element cannot be found, the resolve function will not yield a value (without raising an error).\" Algorithm steps have the level of their algorithm (Appendix A). A built-in scalar no field, argument or input field refers to is unspecified (docs/kit/coordinate.md).",
  },
  {
    id: "resolvesMembers",
    title: "A member coordinate resolves to the field, input field or enum value, or to nothing",
    level: "MUST",
    basis:
      "MemberCoordinate: \"If {type} is an Enum type: ... Return the enum value of {type} named {enumValueName} if it exists. Otherwise, if {type} is an Input Object type: ... Return the input field of {type} named {inputFieldName} if it exists. Otherwise: ... Return the field of {type} named {fieldName} if it exists.\"",
  },
  {
    id: "resolvesArguments",
    title: "An argument coordinate resolves to the field's argument, or to nothing",
    level: "MUST",
    basis: "ArgumentCoordinate: \"Return the argument of {field} named {fieldArgumentName} if it exists.\"",
  },
  {
    id: "resolvesDirectives",
    title: "A directive coordinate resolves to the directive, @deprecated included, or to nothing",
    level: "MUST",
    basis:
      "DirectiveCoordinate: \"Return the directive in {schema} named {directiveName} if it exists.\" The schema applies @deprecated, and \"GraphQL implementations that support the type system definition language must provide the `@deprecated` directive if representing deprecated portions of the schema\" (§3.13).",
  },
  {
    id: "resolvesDirectiveArguments",
    title: "A directive argument coordinate resolves to the directive's argument, or to nothing",
    level: "MUST",
    basis:
      "DirectiveArgumentCoordinate: \"Return the argument of {directive} named {directiveArgumentName} if it exists.\" §2.14's own example of a built-in element is `@deprecated(reason:)`.",
  },
  {
    id: "missingContainers",
    title: "A coordinate whose type, field or directive isn't in the schema raises an error",
    level: "MUST",
    basis:
      "\"However, an error will be raised if any non-leaf nodes within a schema coordinate cannot be found in the schema.\" The algorithms: \"Assert: {type} must exist\", \"Assert: {field} must exist.\", \"Assert: {directive} must exist.\"",
  },
  {
    id: "containerKind",
    title: "A member or argument coordinate on a type of the wrong kind raises an error, as the Asserts say",
    level: "INFO",
    basis:
      "MemberCoordinate: \"Assert: {type} must exist, and must be an Enum, Input Object, Object or Interface type.\" ArgumentCoordinate: \"Assert: {type} must exist, and be an Object or Interface type.\" The prose names only one error, \"if any non-leaf nodes within a schema coordinate cannot be found\", and says that if the element \"cannot be found, the resolve function will not yield a value (without raising an error)\". For `Date.x` on a scalar, or `SearchCriteria.filter(x:)` on an input field, every non-leaf node is found, so the prose gives no element and no error, where the Asserts give an error. Both pass; the report records which one the implementation gives. An element, or a rejected coordinate, fails.",
  },
  {
    id: "builtinDirectives",
    title: "@skip, @include, @specifiedBy and @oneOf resolve, with their arguments, though the schema doesn't define them",
    level: "SHOULD",
    basis:
      "\"A schema element can be ... a directive, or a directive argument defined within a schema (including built-in types and directives).\" Whether a schema has them is §3.13's: \"GraphQL implementations should provide the `@skip` and `@include` directives\", and \"should provide the `@specifiedBy` directive if representing custom scalar definitions\" and \"the `@oneOf` directive if representing OneOf Input Objects\", which the schema does.",
  },
].map((c) => ({ ...c, spec: ["2.14"], since: RELEASE }));

const byId = new Map(CHECKS.map((c) => [c.id, c]));
export const KINDS = ["type", "field", "inputField", "enumValue", "argument", "directive", "directiveArgument"];

export const loadVectors = () => {
  const { schemas, vectors } = JSON.parse(readFileSync(new URL("./vectors.json", import.meta.url), "utf8"));
  const ids = new Set();
  for (const v of vectors) {
    if (ids.has(v.id)) throw new Error(`vectors.json: vector ${v.id} appears twice`);
    ids.add(v.id);
    if (typeof v.coordinate !== "string" || typeof schemas[v.schema] !== "string" || typeof v.expected?.ok !== "boolean") {
      throw new Error(`vectors.json: vector ${v.id} is malformed`);
    }
    if (!byId.has(v.check)) throw new Error(`vectors.json: vector ${v.id} names no check`);
  }
  return { schemas, vectors };
};

// What's wrong with an answer's shape, or undefined.
export const malformed = (answer) => {
  if (typeof answer?.ok !== "boolean") return "the result has no boolean `ok`";
  if (!answer.ok) return undefined;
  const hasError = "error" in answer;
  const hasResolved = "resolved" in answer;
  if (hasError === hasResolved) return "a result with ok: true needs exactly one of `resolved` and `error`";
  if (hasError) return typeof answer.error === "string" ? undefined : "`error` isn't a string";
  const r = answer.resolved;
  if (r === null) return undefined;
  if (!KINDS.includes(r?.kind)) return `\`resolved.kind\` isn't one of ${KINDS.join(", ")}`;
  if (!Array.isArray(r.path) || r.path.length === 0 || r.path.some((n) => typeof n !== "string")) return "`resolved.path` isn't a list of names";
  return undefined;
};

// An answer's resolution, in words.
const outcome = (a) => (!a.ok ? "rejected" : "error" in a ? "error" : a.resolved === null ? "none" : "element");
const WORDS = { element: "an element", none: "no element", error: "an error", rejected: "a rejection" };
const sameElement = (a, b) => a.kind === b.kind && a.path.length === b.path.length && a.path.every((n, i) => n === b.path[i]);
// Whether a well-formed answer agrees with an expected one (ok, and the
// resolution: the same element, none, or an error with any message).
const agrees = (answer, expected) => {
  if (answer.ok !== expected.ok) return false;
  if (!expected.ok) return true;
  if (expected.error) return "error" in answer;
  if (expected.resolved === null) return !("error" in answer) && answer.resolved === null;
  return !("error" in answer) && answer.resolved !== null && sameElement(answer.resolved, expected.resolved);
};
const describe = (expected) =>
  !expected.ok
    ? "rejected"
    : expected.error
      ? "an error"
      : expected.resolved === undefined
        ? "accepted (resolution unspecified)"
        : expected.resolved === null
          ? "no element"
          : `${expected.resolved.kind} ${JSON.stringify(expected.resolved.path)}`;
const OBSERVED = { error: "an error, as the Asserts say", none: "no element, as the prose says" };

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const quote = (s) => JSON.stringify(s);

// Compares answers with the vectors. answers[i] is the adapter's result for
// vectors[i], or a Crash.
export const judge = (vectors, answers) => {
  const stats = new Map(CHECKS.map((c) => [c.id, { cases: 0, failing: 0, observed: {} }]));
  const findings = new Map();
  const failed = [];
  const crashed = [];
  const malformedAt = [];
  const ungraded = [];
  const found = (key, vector, finding) => {
    const f = findings.get(key) ?? { ...finding, cases: 0, fixtures: {}, since: {} };
    f.cases++;
    f.fixtures[vector.family] = (f.fixtures[vector.family] ?? 0) + 1;
    if (key !== "malformed") f.since[RELEASE] = (f.since[RELEASE] ?? 0) + 1;
    const input = `[since September 2025] ${quote(vector.coordinate)} in schema ${vector.schema}`;
    if (!f.example || vector.coordinate.length < f.shortest) {
      f.shortest = vector.coordinate.length;
      f.fixture = vector.family;
      if (finding.kind === "crash") f.problem = finding.problem;
      f.example = { vector: vector.id, input, response: finding.response, expected: describe(vector.expected) };
    }
    findings.set(key, f);
  };
  vectors.forEach((v, i) => {
    const answer = answers[i];
    const graded = byId.get(v.check);
    if (answer instanceof Crash) {
      // Undefined behaviour may be anything, a crash included.
      if (v.unspecified) return void ungraded.push(i);
      crashed.push(i);
      stats.get(graded.id).cases++;
      stats.get(graded.id).failing++;
      found(`crash\u0000${graded.id}`, v, {
        kind: "crash",
        checks: [graded.id],
        summary: `crashes on a coordinate: ${graded.title.charAt(0).toLowerCase()}${graded.title.slice(1)}`,
        response: crashResponse(answer),
        problem: answer.message,
      });
      return;
    }
    const problem = malformed(answer);
    if (problem) {
      malformedAt.push(i);
      found("malformed", v, { checks: [], summary: "results not in the coordinate result format", problem: `${problem}: ${JSON.stringify(answer)}`, response: answer });
      return;
    }
    // A coordinate the reference accepts and the implementation rejects is
    // a grammar failure, whatever check its resolution would have counted
    // against.
    const check = v.expected.ok && !answer.ok ? byId.get("grammar") : graded;
    stats.get(check.id).cases++;
    if (v.unspecified && answer.ok) return;
    const accepted = [v.expected, ...(v.alternatives ?? [])];
    const match = accepted.findIndex((e) => agrees(answer, e));
    if (match !== -1) {
      if (v.alternatives) {
        const label = OBSERVED[outcome(answer)];
        stats.get(check.id).observed[label] = (stats.get(check.id).observed[label] ?? 0) + 1;
      }
      return;
    }
    failed.push(i);
    stats.get(check.id).failing++;
    const got = outcome(answer);
    const want = v.expected.ok ? (v.expected.error ? "error" : v.expected.resolved === null ? "none" : v.expected.resolved ? "element" : "accepted") : "rejected";
    const summary = !v.expected.ok
      ? `accepts what §2.14 rejects: ${check.title.charAt(0).toLowerCase()}${check.title.slice(1)}`
      : !answer.ok
        ? "rejects schema coordinates §2.14's grammar accepts"
        : got === "element" && want === "element"
          ? `resolves to another element than §2.14's algorithm (${check.id})`
          : `gives ${WORDS[got]} where §2.14's algorithm gives ${WORDS[want]} (${check.id})`;
    found(`${check.id}\u0000${want}\u0000${got}`, v, { checks: [check.id], summary, response: answer });
  });
  return {
    failed,
    crashed,
    malformed: malformedAt,
    ungraded,
    stats,
    findings: [...findings.values()].sort((a, b) => b.cases - a.cases).map(({ shortest: _, response: __, ...f }) => {
      if (Object.keys(f.since).length === 0) delete f.since;
      return f;
    }),
  };
};

// The checks of a report, from judge's stats.
const checksOf = (result, unspecified) =>
  CHECKS.map((c) => {
    const s = result.stats.get(c.id);
    const observed = Object.entries(s.observed);
    const notes = c.id === "grammar" && unspecified ? [`${plural(unspecified, "vector")} whose resolution the spec leaves undefined are graded on their syntax only`] : [];
    return {
      id: c.id,
      title: c.title,
      level: c.level,
      spec: c.spec.map(section),
      since: c.since,
      basis: c.basis,
      status: s.failing > 0 ? "fail" : s.cases > 0 ? "pass" : "untested",
      cases: s.cases,
      failing: s.failing,
      ...(s.failing ? { failingSince: { [RELEASE]: s.failing } } : {}),
      ...(observed.length ? { observed: s.observed } : {}),
      ...(notes.length ? { note: notes.join("; ") } : {}),
    };
  });

const fatal = (check, strict) => check.status === "fail" && (check.level === "MUST" || (strict && check.level === "SHOULD"));

// The reference's own answer to a vector.
const rightAnswer = (v) => (!v.expected.ok ? { ok: false } : v.expected.error ? { ok: true, error: "raised" } : { ok: true, resolved: v.expected.resolved ?? null });

// The self-test: deliberately wrong answers, which the checker must flag,
// and the reference's own answers, which it must not.
export const selfTest = (vectors) => {
  const problems = [];
  const graded = vectors.filter((v) => !v.unspecified);
  const n = vectors.length;
  const right = judge(vectors, vectors.map(rightAnswer));
  if (right.failed.length || right.malformed.length) problems.push(`flags ${right.failed.length + right.malformed.length} of the reference's own answers`);
  // Every verdict flipped: an accepted coordinate rejected, a rejected one
  // accepted (as resolving to nothing).
  const flipped = judge(vectors, vectors.map((v) => (v.expected.ok ? { ok: false } : { ok: true, resolved: null })));
  if (flipped.failed.length !== n) problems.push(`flags ${flipped.failed.length} of ${n} flipped verdicts`);
  // Each resolution answered with the next graded vector's: every one that
  // differs fails, unless the vector accepts it as an alternative.
  const resolvable = graded.filter((v) => v.expected.ok);
  const next = (i) => rightAnswer(resolvable[(i + 1) % resolvable.length]);
  const differ = resolvable.filter((v, i) => ![v.expected, ...(v.alternatives ?? [])].some((e) => agrees(next(i), e))).length;
  const shifted = judge(resolvable, resolvable.map((_, i) => next(i)));
  if (differ === 0 || shifted.failed.length !== differ) problems.push(`flags ${shifted.failed.length} of ${differ} resolutions taken from the next vector`);
  // An implementation that finds every element and never raises: it echoes
  // the coordinate's names as the path, with the kind of a field.
  const echo = (v) => ({ ok: true, resolved: { kind: "field", path: v.coordinate.replace(/[@():]/g, " ").split(/[.\s]+/).filter(Boolean) } });
  const echoed = judge(resolvable, resolvable.map(echo));
  const wrongEcho = resolvable.filter((v) => !v.expected.resolved || v.expected.resolved.kind !== "field").length;
  if (echoed.failed.length < wrongEcho) problems.push(`flags ${echoed.failed.length} of ${wrongEcho} answers that echo the coordinate as a field`);
  // An element of the right path but another kind.
  const elements = resolvable.filter((v) => v.expected.resolved);
  const rekinded = judge(elements, elements.map((v) => ({ ok: true, resolved: { ...v.expected.resolved, kind: KINDS[(KINDS.indexOf(v.expected.resolved.kind) + 1) % KINDS.length] } })));
  if (elements.length === 0 || rekinded.failed.length !== elements.length) problems.push(`flags ${rekinded.failed.length} of ${elements.length} elements of the wrong kind`);
  // Errors where the reference finds nothing, and nothing where it raises:
  // the second fails missingContainers, and passes containerKind, which
  // accepts both readings.
  const errors = judge(resolvable, resolvable.map(() => ({ ok: true, error: "no" })));
  const notErrors = resolvable.filter((v) => !v.expected.error).length;
  if (errors.failed.length !== notErrors) problems.push(`flags ${errors.failed.length} of ${notErrors} errors where the reference raises none`);
  const nones = judge(resolvable, resolvable.map(() => ({ ok: true, resolved: null })));
  const kindErrors = nones.stats.get("containerKind");
  if (nones.stats.get("missingContainers").failing === 0 || kindErrors.failing !== 0 || !kindErrors.observed[OBSERVED.none]) {
    problems.push("with no element for every coordinate, missingContainers doesn't fail, or containerKind does");
  }
  const empty = judge(vectors, vectors.map(() => ({})));
  if (empty.malformed.length !== n) problems.push(`counts ${empty.malformed.length} of ${n} results without \`ok\` as malformed`);
  const both = judge(resolvable, resolvable.map(() => ({ ok: true, resolved: null, error: "x" })));
  if (both.malformed.length !== resolvable.length) problems.push(`counts ${both.malformed.length} of ${resolvable.length} results with both resolved and error as malformed`);
  // Every vector crashed: every graded one is a crash, none agrees, every
  // check with a vector fails, each crash counted as since September 2025.
  const crash = judge(vectors, vectors.map(() => new Crash("NullPointerException")));
  if (crash.crashed.length !== graded.length || crash.failed.length || crash.ungraded.length !== n - graded.length) problems.push(`counts ${crash.crashed.length} of ${graded.length} crashes as crashes`);
  const spared = [...new Set(graded.map((v) => v.check))].filter((id) => crash.stats.get(id).failing === 0);
  if (spared.length) problems.push(`with every vector crashed, ${spared.join(", ")} still pass`);
  if (crash.findings.some((f) => f.kind !== "crash" || f.since?.[RELEASE] !== f.cases)) problems.push("a crash isn't counted as a crash since September 2025");
  // A run whose MUST checks all fail isn't ok; the reference's own answers are.
  if (checksOf(flipped, 0).every((c) => !fatal(c, false))) problems.push("with every verdict flipped, no MUST check fails");
  if (checksOf(right, 0).some((c) => fatal(c, true))) problems.push("the reference's own answers fail a check");
  return { problems, controls: 12 };
};

export const run = async ({ adapter, strict, log }) => {
  const { schemas, vectors } = loadVectors();
  const started = Date.now();
  const answers = [];
  for (const v of vectors) answers.push(await answerOrCrash(adapter, "coordinate", { sdl: schemas[v.schema], coordinate: v.coordinate }));
  const result = judge(vectors, answers);
  const unspecified = vectors.filter((v) => v.unspecified).length;
  const checks = checksOf(result, unspecified);
  const test = selfTest(vectors);

  for (const f of result.findings) {
    const lv = byId.get(f.checks[0])?.level ?? "MUST";
    const symbol = lv === "MUST" ? "✗" : "!";
    const note = lv === "SHOULD" ? ": a SHOULD, fails with --strict" : lv === "INFO" ? ": informational" : "";
    log(`${symbol} ${f.summary}: ${plural(f.cases, "vector")}${note}, such as ${f.example.input} (answered ${JSON.stringify(f.example.response)}, expected ${f.example.expected})`);
  }
  const wrong = result.failed.length + result.crashed.length + result.malformed.length;
  const graded = vectors.length - result.ungraded.length;
  const crashes = result.crashed.length ? `; ${result.crashed.length} crashed` : "";
  log(`${wrong === 0 ? "✓" : "✗"} ${graded - wrong} of ${graded} vectors agree with the reference${crashes} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  for (const c of checks.filter((c) => c.observed)) log(`  ${c.id}: ${Object.entries(c.observed).map(([label, n]) => `${label}: ${n}`).join("; ")}`);
  for (const p of test.problems) log(`✗ checker self-test: ${p}`);
  if (test.problems.length === 0) log(`✓ the checker catches all ${test.controls} negative controls`);

  const report = {
    format: REPORT_FORMAT,
    area: "coordinate",
    implementation: adapter.name,
    capabilities: [...adapter.capabilities].sort(),
    provenance: provenance({
      strict,
      vectors: vectors.length,
      graded,
      ...(result.ungraded.length ? { skipped: { "crashed where the resolution is unspecified": result.ungraded.length } } : {}),
    }),
    checkerSelfTest: test.problems.length === 0 ? `passed (${test.controls} negative controls)` : "failed",
    cases: {
      submitted: vectors.length,
      distinct: new Set(vectors.map((v) => `${v.schema}\u0000${v.coordinate}`)).size,
      malformed: result.malformed.length,
      ...(result.crashed.length ? { crashed: result.crashed.length } : {}),
    },
    adapterProblems: result.malformed.length,
    // Every vector relies on September 2025, crashes included.
    since: { [RELEASE]: { vectors: vectors.length, failing: result.failed.length + result.crashed.length } },
    checks,
    findings: result.findings,
    fixtures: [],
  };
  const ok = graded > 0 && result.malformed.length === 0 && !checks.some((c) => fatal(c, strict)) && test.problems.length === 0;
  return { ok, report };
};
