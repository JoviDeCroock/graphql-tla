// Checking an implementation's validation answers against the vectors
// (docs/kit/validate.md). The expected answers come from Validation.tla,
// evaluated once by scripts/generate-vectors-validate.mjs, so checking is
// a comparison per vector:
//
//   - accepting an invalid vector means the rules it breaks aren't
//     enforced: none of them caught it. This is conclusive, and it is the
//     only thing a rule's check rests on. A vector that breaks two rules
//     counts against both.
//   - rejecting a valid vector fails one check, acceptsValid. The kit doesn't
//     know which rule the implementation applied, so the rule the vector is
//     a sibling of is only a hint in the finding. Rejections that carry an
//     error message are grouped by the message's wording (names and numbers
//     left out), which is the implementation's own account of the rule it
//     applied; the hints of the group are a secondary detail.
//
//   - a crash, an `error` answer from the adapter (docs/kit-areas.md,
//     "Protocol"), gives no verdict. On an invalid vector it fails the rules
//     the vector breaks, as accepting it would; on a valid one it fails
//     acceptsValid. Crashes have their own findings, and never count as an
//     agreement. A crash fails in every release that can take the vector's
//     input, so it counts toward a release (`failingSince`) only when the
//     schema has a OneOf Input Object (since September 2025) or the
//     document has grammar new in September 2026 (`syntax`), whatever
//     release the vector's verdict rests on.
//
// The verdicts and levels are September 2026's. A vector whose verdict
// differs under October 2021 carries `since`: the first release whose text
// gives its verdict.
//
// A rule whose every vector also breaks another rule can't earn a pass: a
// rejection may be the other rule's doing. Its check is "subsumed" instead.
//
// Some vectors aren't graded: those the spec doesn't settle ("unspecified")
// and those that need a capability the adapter lacks ("requires").
//
// The same comparison runs on deliberately wrong answers (the self-test),
// which it must reject, so a passing run can't be vacuous.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Crash, crashResponse } from "../areas.mjs";
import { REPORT_FORMAT, provenance, section } from "../report.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");

export const loadVectors = () => JSON.parse(readFileSync(join(root, "kit/validate/vectors.json"), "utf8"));

// A check per rule: "FieldSelectionMerging" is checked as
// "fieldSelectionMerging", titled and cited by its section.
export const checkId = (rule) => rule[0].toLowerCase() + rule.slice(1);

// The check for valid vectors. §5's introduction: a document is valid when
// it satisfies every rule, and only invalid ones are kept from execution;
// §6.1 executes a request, and §6.1.1 fails only one with validation errors.
// kit/spec-sections.json has no entry for §5 itself, so it is cited here.
export const ACCEPTS_VALID = "acceptsValid";
const VALIDATION = { number: "5", title: "Validation", url: "https://spec.graphql.org/September2026/#sec-Validation" };

// The sentences each rule's check rests on: the rule's Formal Specification
// in September 2026, whose "must" makes every check a MUST. Every older
// release that has the rule says it with "must" too, so no check has
// `levels`; where a release changed the rule, the basis says how. `since`
// names the release that introduced a rule after October 2021.
const FORMAL = (text) => `Formal Specification: "${text}"`;
export const BASIS = {
  ExecutableDefinitions: { basis: FORMAL("For each definition definition in the document: definition must be ExecutableDefinition (it must not be TypeSystemDefinitionOrExtension).") },
  OperationTypeExistence: {
    basis:
      FORMAL("For each operation definition operation in the document: Let rootOperationType be the root operation type in schema corresponding to the kind of operation. rootOperationType must exist.") +
      " The rule is new in September 2025 (§5.2.1.1); October 2021 has no such rule, so its vectors have since September 2025.",
    since: "September2025",
  },
  OperationNameUniqueness: { basis: FORMAL("If operationName exists: Let operations be all operation definitions in the document named operationName. operations must be a set of one.") },
  LoneAnonymousOperation: { basis: FORMAL("If operations is a set of more than 1: anonymous must be empty.") },
  SingleRootField: {
    basis:
      FORMAL("Let collectedFieldsMap be the result of CollectSubscriptionFields(subscriptionType, selectionSet). collectedFieldsMap must have exactly one entry, which must not be an introspection field.") +
      ' CollectSubscriptionFields: "selection must not provide the @skip directive. selection must not provide the @include directive." September 2025 has the same text. October 2021 (its §5.2.3.1) collects the root fields with CollectFields and "Let variableValues be the empty set", so it applies @skip and @include instead of forbidding them: a selection with @include(if: $v) is dropped, one with @skip(if: $v) kept. A vector that only September 2025 and later reject has since September 2025.',
  },
  FieldSelections: { basis: FORMAL("For each selection in the document: Let fieldName be the target field of selection. fieldName must be defined on type in scope.") },
  FieldSelectionMerging: {
    basis: FORMAL("Let set be any selection set defined in the GraphQL document. FieldsInSetCanMerge(set) must be true.") + ' FieldsInSetCanMerge: "SameResponseShape(fieldA, fieldB) must be true", and, for the same parent type or a parent that isn\'t an Object type, "fieldA and fieldB must have identical field names. fieldA and fieldB must have identical sets of arguments."',
  },
  LeafFieldSelections: {
    basis:
      FORMAL("If selectionType is a scalar or enum: The subselection set of that selection must not be present. If selectionType is an interface, union, or object: The subselection set of that selection must be present.") +
      ' September 2025 says "must be empty" and "must not be empty", October 2021 "must be empty" and "must NOT BE empty": a MUST in every release. September 2026 reworded the rule when it added empty selection sets (§2.5 SelectionSet : { Selection* }, where the older releases have Selection+): "An empty selection is a selection", so `barkVolume {}` is invalid, and `human {}` is valid. The vectors with an empty selection set have since September 2026.',
  },
  ArgumentNames: { basis: FORMAL("For each argument in the document: ... Let argumentDefinition be the argument definition provided by the parent field or definition named argumentName. argumentDefinition must exist.") },
  ArgumentUniqueness: { basis: FORMAL("Let arguments be all Arguments named argumentName in the Argument Set which contains argument. arguments must be the set containing only argument.") },
  RequiredArguments: { basis: FORMAL("If type is Non-Null and defaultValue does not exist: ... argument must exist. Let value be the value of argument. value must not be the null literal.") },
  FragmentNameUniqueness: { basis: FORMAL("Let fragments be all fragment definitions in the document named fragmentName. fragments must be a set of one.") },
  FragmentSpreadTypeExistence: { basis: FORMAL("For each named spread namedSpread in the document: Let fragment be the target of namedSpread. The target type of fragment must be defined in the schema.") },
  FragmentsOnObjectInterfaceOrUnionTypes: { basis: FORMAL("For each fragment defined in the document: The target type of fragment must have kind UNION, INTERFACE, or OBJECT.") },
  FragmentsMustBeUsed: { basis: FORMAL("For each fragment defined in the document: fragment must be the target of at least one spread in the document.") },
  FragmentSpreadTargetDefined: { basis: FORMAL("For every namedSpread in the document: Let fragment be the target of namedSpread. fragment must be defined in the document.") },
  FragmentSpreadsMustNotFormCycles: { basis: FORMAL("For each fragmentDefinition in the document: ... DetectFragmentCycles(fragmentDefinition, visited).") + ' DetectFragmentCycles: "visited must not contain spread."' },
  FragmentSpreadIsPossible: { basis: FORMAL("Let applicableTypes be the intersection of GetPossibleTypes(fragmentType) and GetPossibleTypes(parentType). applicableTypes must not be empty.") },
  ValuesOfCorrectType: { basis: FORMAL("For each literal Input Value value in the document: Let type be the type expected in the position value is found. value must be coercible to type") },
  InputObjectFieldNames: { basis: FORMAL("For each Input Object Field inputField in the document: ... inputFieldDefinition must exist.") },
  InputObjectFieldUniqueness: { basis: FORMAL("For every inputField in inputObject: ... Let fields be all Input Object Fields named name in inputObject. fields must be the set containing only inputField.") },
  InputObjectRequiredFields: { basis: FORMAL("If type is Non-Null and defaultValue does not exist: ... field must exist. Let value be the value of field. value must not be the null literal.") },
  DirectivesAreDefined: { basis: FORMAL("For every directive in a document: Let directiveName be the name of directive. Let directiveDefinition be the directive named directiveName. directiveDefinition must exist.") },
  DirectivesAreInValidLocations: { basis: FORMAL("Let locations be the valid locations for directiveDefinition. Let adjacent be the AST node the directive affects. adjacent must be represented by an item within locations.") },
  DirectivesAreUniquePerLocation: { basis: FORMAL("Let directives be the set of Directives which apply to location and are not repeatable. ... namedDirectives must be a set of one.") },
  VariableUniqueness: { basis: FORMAL("For every variable defined on operation: ... Let variables be the set of all variables named variableName on operation. variables must be a set of one.") },
  VariablesAreInputTypes: { basis: FORMAL("For every variable on each operation: Let variableType be the type of variable. IsInputType(variableType) must be true.") },
  AllVariableUsesDefined: { basis: FORMAL("For each variableUsage in scope, variable must be in operation's variable list.") + " The same for every fragment the operation references transitively." },
  AllVariablesUsed: { basis: FORMAL("Each variable in variables must be used at least once in either the operation scope itself or any fragment transitively referenced by that operation.") },
  AllVariableUsagesAreAllowed: {
    basis:
      FORMAL("For each variableUsage in variableUsages: ... IsVariableUsageAllowed(variableDefinition, variableUsage) must be true.") +
      " IsNonNullPosition, and with it OneOf Input Objects, are new in September 2025: October 2021's IsVariableUsageAllowed has neither, so a variable in a OneOf Input Object's field isn't a Non-Null position there. The vectors that rest on it have since September 2025.",
  },
};

// A finding names a rule as likely over-strict only when at least this many
// of its valid siblings, each paired with a different invalid vector, are
// rejected, and a valid vector of the same family and rule is accepted.
export const SEVERAL = 3;

const brokenRules = (vector) => Object.keys(vector.violations ?? {}).sort();

// The releases a vector's `since` can name, oldest first, and how a report
// writes one.
export const RELEASES = ["September2025", "September2026"];
const releaseName = (release) => release.replace(/(\d{4})$/, " $1");
const count = (counts, release) => void (counts[release] = (counts[release] ?? 0) + 1);

// The first release that can take a vector's input: September 2026 for a
// document with an empty selection set (`syntax`), September 2025 for a
// schema with a OneOf Input Object, none for any other.
const inputSince = (data, vector) =>
  vector.syntax !== undefined ? "September2026" : /@oneOf\b/.test(data.schemas[vector.schema]) ? "September2025" : undefined;
// The release a failure counts toward, if any. A wrong verdict counts toward
// the release the vector's verdict rests on. A crash is a failure in every
// release that can take the input, so it counts toward the first of them.
const failureSince = (data, j) => (j.status === "crash" ? inputSince(data, j.vector) : j.vector.since);

// The wording of an error message, for grouping rejections: its first
// line, with quoted text, bracketed paths and numbers left out, so
// "Variable '$v0' of type '[Int]' …" and "Variable '$v1' of type '[ID]' …"
// read the same.
export const messagePattern = (message) =>
  String(message)
    .split("\n")[0]
    .replace(/"(?:[^"\\]|\\.)*"|'[^']*'|`[^`]*`|\u201c[^\u201d]*\u201d/g, "…")
    .replace(/\[[^\]]*\]/g, "[…]")
    .replace(/\d+/g, "N")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
const firstMessage = (answer) => {
  const m = answer?.errors?.[0]?.message;
  return typeof m === "string" && m.trim() !== "" ? m : undefined;
};

// The vectors an adapter is graded on, and how many are left out and why.
export const gradedVectors = (data, capabilities = []) => {
  const has = new Set(capabilities);
  const graded = [];
  const skipped = {};
  for (const vector of data.vectors) {
    const missing = (vector.requires ?? []).filter((c) => !has.has(c));
    const reasons = [...(vector.unspecified ? ["unspecified"] : []), ...missing];
    if (reasons.length === 0) graded.push(vector);
    for (const r of reasons) skipped[r] = (skipped[r] ?? 0) + 1;
  }
  return { graded, skipped };
};

// For each valid vector, the invalid vectors it is a sibling of, and the
// rules they break: the hint for a rejection. A spec example that is valid
// has no sibling; its hint is its own rule.
const pairing = new WeakMap();
const pairsOf = (data) => {
  if (pairing.has(data)) return pairing.get(data);
  const partners = new Map();
  for (const v of data.vectors) {
    for (const s of v.siblings ?? []) partners.set(s, [...(partners.get(s) ?? []), v]);
  }
  const hints = new Map();
  for (const v of data.vectors) {
    if (!v.expected.valid) continue;
    const mine = partners.get(v.id) ?? [];
    hints.set(v.id, mine.length ? [...new Set(mine.flatMap(brokenRules))].sort() : [v.rule]);
  }
  const result = { partners, hints };
  pairing.set(data, result);
  return result;
};

// The verdict on one answer: "pass", "malformed", "crash", "not-enforced"
// or "rejected-valid", and the rules it bears on (for a valid vector, the
// hint).
export const verdict = (data, vector, answer) => {
  if (answer instanceof Crash) {
    return { status: "crash", rules: vector.expected.valid ? pairsOf(data).hints.get(vector.id) : brokenRules(vector) };
  }
  if (answer === null || typeof answer !== "object" || typeof answer.valid !== "boolean") {
    return { status: "malformed", rules: [] };
  }
  const rules = vector.expected.valid ? pairsOf(data).hints.get(vector.id) : brokenRules(vector);
  if (answer.valid === vector.expected.valid) return { status: "pass", rules };
  return { status: vector.expected.valid ? "rejected-valid" : "not-enforced", rules };
};

export const judge = (data, vectors, answers) =>
  vectors.map((vector, i) => ({ vector, answer: answers[i], ...verdict(data, vector, answers[i]) }));

const oneLine = (text) => text.replace(/\s+/g, " ").trim();
const cite = (rule, rules) => `§${rules[rule]} ${section(rules[rule]).title}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The report: the facts behind a conformance sheet (docs/kit-areas.md).
export const buildReport = ({ data, judged, strict, selfTest, controls, implementation, capabilities, skipped = {} }) => {
  const { rules } = data;
  const { partners } = pairsOf(data);

  // Per rule: the invalid vectors that exercised it, how many of them break
  // it alone, and how many were accepted.
  const stats = new Map(Object.keys(rules).map((r) => [r, { cases: 0, alone: 0, failing: 0, failingSince: {} }]));
  const accepts = { cases: 0, failing: 0, failingSince: {} };
  for (const j of judged) {
    if (j.status === "malformed") continue;
    if (j.vector.expected.valid) {
      accepts.cases++;
      if (j.status !== "pass") {
        accepts.failing++;
        const since = failureSince(data, j);
        if (since) count(accepts.failingSince, since);
      }
      continue;
    }
    for (const r of j.rules) {
      const s = stats.get(r);
      s.cases++;
      if (j.rules.length === 1) s.alone++;
      if (j.status !== "pass") {
        s.failing++;
        const since = failureSince(data, j);
        if (since) count(s.failingSince, since);
      }
    }
  }

  // A finding per kind of failure and set of rules (for a rejected valid
  // vector, its hint), except that rejected valid vectors whose answer has
  // an error message are grouped by its wording: one cause in the
  // implementation shows up as one finding, whatever the vectors' hints.
  // Its example is the spec's own where there is one, else the shortest
  // document.
  const findings = new Map();
  for (const j of judged) {
    if (j.status === "pass" || j.status === "malformed") continue;
    const message = j.status === "rejected-valid" ? firstMessage(j.answer) : undefined;
    const key =
      message !== undefined
        ? `${j.status}\u0000message\u0000${messagePattern(message)}`
        : `${j.status}\u0000${j.vector.expected.valid}\u0000${j.rules.join(",")}`;
    const f = findings.get(key) ?? {
      kind: j.status, valid: j.vector.expected.valid, rules: j.rules, byMessage: message !== undefined,
      hints: new Map(), cases: 0, since: {}, fixtures: {}, members: [], best: j,
    };
    f.cases++;
    for (const r of j.rules) f.hints.set(r, (f.hints.get(r) ?? 0) + 1);
    const since = failureSince(data, j);
    if (since) count(f.since, since);
    f.members.push(j);
    f.fixtures[j.vector.family] = (f.fixtures[j.vector.family] ?? 0) + 1;
    const rank = (x) => [x.vector.family === "spec" ? 0 : 1, x.vector.document.length];
    const [a, b] = [rank(j), rank(f.best)];
    if (a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])) f.best = j;
    findings.set(key, f);
  }
  // A group by message names every hint of its members, the most common
  // first. Several hints mean the vectors aren't near one rule.
  for (const f of findings.values()) {
    if (!f.byMessage) continue;
    f.rules = [...f.hints.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([r]) => r);
    f.oneHint = f.members.every((j) => j.rules.join(",") === f.members[0].rules.join(","));
  }

  // Whether a group of rejected valid vectors points at its rule: several
  // of them, siblings of different invalid vectors, while a valid vector of
  // the same family and hint is accepted. A group by message whose members
  // have different hints doesn't: the same error near several rules says
  // the cause isn't any one of them.
  const evidence = (f) => {
    if (f.byMessage && !f.oneHint) return { likely: false, partners: 0, accepted: 0 };
    const hint = f.byMessage ? f.members[0].rules : f.rules;
    const invalidPartners = new Set(f.members.flatMap((j) => (partners.get(j.vector.id) ?? [j.vector]).map((v) => v.id)));
    const families = new Set(f.members.map((j) => j.vector.family));
    const accepted = judged.filter(
      (j) => j.vector.expected.valid && j.status === "pass" && j.rules.join(",") === hint.join(",") && families.has(j.vector.family),
    ).length;
    return { likely: f.cases >= SEVERAL && invalidPartners.size >= SEVERAL && accepted > 0, partners: invalidPartners.size, accepted };
  };

  const summary = (f) => {
    const names = f.rules.map((r) => cite(r, rules));
    const releases = Object.entries(f.since).map(([release, n]) => `${n === f.cases ? "all" : `${n} of ${f.cases}`} rely on rules since ${releaseName(release)}`);
    const byRelease = releases.length ? `; ${releases.join(", ")}` : "";
    if (f.kind === "crash") {
      return f.valid
        ? `crashes on valid documents instead of accepting them; hint: ${names.join(" or ")}, the rules their invalid siblings break${byRelease}`
        : `crashes on documents that break ${names.length === 1 ? `only ${names[0]}` : `only ${names.join(" and ")}`}, instead of rejecting them${byRelease}`;
    }
    if (f.kind === "rejected-valid") {
      const e = evidence(f);
      if (f.byMessage && !f.oneHint) {
        const counted = f.rules.slice(0, 4).map((r) => `${cite(r, rules)} (${f.hints.get(r)})`);
        const more = f.rules.length > 4 ? ` and ${plural(f.rules.length - 4, "other rule")}` : "";
        return `rejects valid documents, all with the same error message; their invalid siblings break ${counted.join(", ")}${more}, so the hints point at no one rule: the message says what the implementation objected to${byRelease}`;
      }
      if (e.likely) {
        return `rejects valid documents: ${names.join(" or ")} is likely over-strict (${f.cases} valid siblings of ${e.partners} different invalid vectors rejected, ${e.accepted} of the same family accepted)${byRelease}`;
      }
      const spec = f.members.filter((j) => j.vector.family === "spec").length;
      const near =
        spec === f.cases
          ? `the spec's own examples of documents valid under ${names.join(" and ")}`
          : `each one edit from a document that breaks ${names.length === 1 ? `only ${names[0]}` : `${names.join(" and ")}`}${spec ? ", or the spec's example of a document valid under it" : ""}`;
      return `rejects valid documents, ${near}; the rule it applied is a guess, since the kit doesn't interpret error messages${byRelease}`;
    }
    return f.rules.length === 1
      ? `${names[0]} isn't enforced: accepts documents that break only this rule${byRelease}`
      : `${names.join(" and ")} aren't enforced: accepts documents that break only these rules, so neither caught them${byRelease}`;
  };
  const expected = (vector) =>
    vector.expected.valid
      ? "valid"
      : `invalid: ${brokenRules(vector).map((r) => `${r} ${JSON.stringify(vector.violations[r])}`).join(", ")}`;

  // Rules no vector breaks alone.
  const notes = {};
  for (const rule of Object.keys(rules)) {
    const mine = data.vectors.filter((v) => !v.expected.valid && brokenRules(v).includes(rule));
    if (mine.length > 0 && mine.every((v) => brokenRules(v).length > 1)) {
      const others = [...new Set(mine.flatMap((v) => brokenRules(v)).filter((r) => r !== rule))];
      notes[rule] = `every document that breaks this rule also breaks ${others.map((r) => cite(r, rules)).join(", ")}, which subsumes it, so a rejection can't be credited to this rule; accepting one fails both`;
    }
  }

  const status = (s) => (s.failing > 0 ? "fail" : s.alone > 0 ? "pass" : s.cases > 0 ? "subsumed" : "untested");
  const malformed = judged.filter((j) => j.status === "malformed").length;
  const failing = judged.filter((j) => j.status !== "pass" && j.status !== "malformed");
  return {
    format: REPORT_FORMAT,
    area: "validate",
    implementation,
    capabilities: [...capabilities].sort(),
    provenance: provenance({ strict, vectors: data.vectors.length, graded: judged.length, skipped }),
    checkerSelfTest: selfTest ? `passed (${controls} negative controls)` : "failed",
    cases: { submitted: judged.length, distinct: judged.length, malformed },
    adapterProblems: malformed,
    since: Object.fromEntries(
      RELEASES.map((release) => [
        release,
        { vectors: judged.filter((j) => j.vector.since === release).length, failing: failing.filter((j) => failureSince(data, j) === release).length },
      ]).filter(([, s]) => s.vectors > 0 || s.failing > 0),
    ),
    checks: [
      ...Object.keys(rules).map((rule) => {
        const s = stats.get(rule);
        return {
          id: checkId(rule),
          title: section(rules[rule]).title,
          level: "MUST",
          spec: [section(rules[rule])],
          status: status(s),
          cases: s.cases,
          failing: s.failing,
          ...(Object.keys(s.failingSince).length ? { failingSince: s.failingSince } : {}),
          ...(notes[rule] ? { note: notes[rule] } : {}),
          ...BASIS[rule],
        };
      }),
      {
        id: ACCEPTS_VALID,
        title: "Valid documents are accepted",
        level: "MUST",
        spec: [VALIDATION, section("6.1"), section("6.1.1")],
        status: accepts.failing > 0 ? "fail" : accepts.cases > 0 ? "pass" : "untested",
        cases: accepts.cases,
        failing: accepts.failing,
        ...(Object.keys(accepts.failingSince).length ? { failingSince: accepts.failingSince } : {}),
        basis:
          '§5 has no sentence that requires accepting; it only says "operation execution should only occur for valid requests". The requirement to go on comes from §6.1, which executes a request ("The result of the request is determined by the result of executing this operation"), and §6.1.1, which fails it only for validation errors: "If validation errors are known, they should be reported in the list of "errors" in the response and the request must fail without operation execution." A document that satisfies every rule of §5 has none, so rejecting it applies a rule the spec doesn\'t have.',
      },
    ],
    findings: [...findings.values()]
      .sort((a, b) => b.cases - a.cases)
      .map((f) => {
        const likely = f.kind === "rejected-valid" && evidence(f).likely;
        const crash = f.best.answer instanceof Crash;
        return {
          ...(crash ? { kind: "crash" } : {}),
          checks: f.valid ? [ACCEPTS_VALID] : f.rules.map(checkId),
          ...(f.kind === "rejected-valid" ? { hint: f.rules.map(checkId), likelyOverStrict: likely } : {}),
          ...(crash && f.valid ? { hint: f.rules.map(checkId) } : {}),
          summary: summary(f),
          cases: f.cases,
          ...(Object.keys(f.since).length ? { since: f.since } : {}),
          fixtures: f.fixtures,
          fixture: f.best.vector.family,
          ...(crash ? { problem: f.best.answer.message } : f.best.answer?.errors?.[0]?.message ? { problem: String(f.best.answer.errors[0].message) } : {}),
          example: {
            input: `${failureSince(data, f.best) ? `[since ${releaseName(failureSince(data, f.best))}] ` : ""}${f.best.vector.id}: ${oneLine(f.best.vector.document)}`,
            response: crash ? crashResponse(f.best.answer) : f.best.answer,
            expected: expected(f.best.vector),
          },
        };
      }),
    fixtures: [],
  };
};

// The self-test: answers that are wrong on purpose, each of which the
// checker must catch, plus the reference's own answers, which it must not.
export const selfTest = (data, vectors = gradedVectors(data).graded) => {
  const failures = [];
  const { partners } = pairsOf(data);
  const report = (answers) =>
    buildReport({ data, judged: judge(data, vectors, answers), strict: false, selfTest: true, controls: 0, implementation: "self-test", capabilities: [] });
  const statusOf = (r, id) => r.checks.find((c) => c.id === id).status;
  const subsumed = Object.keys(data.rules).filter((rule) => {
    const mine = vectors.filter((v) => !v.expected.valid && brokenRules(v).includes(rule));
    return mine.length > 0 && mine.every((v) => brokenRules(v).length > 1);
  });
  const right = vectors.map((v) => ({ valid: v.expected.valid }));
  if (vectors.some((v) => v.unspecified)) failures.push("an unspecified vector is graded");

  // A vector of the opposite verdict: a sibling, the vector a valid one is
  // the sibling of, or another vector of the same rule.
  const graded = new Set(vectors.map((v) => v.id));
  const byId = new Map(vectors.map((v) => [v.id, v]));
  const partner = (v) => {
    const near = [...(v.siblings ?? []), ...(partners.get(v.id) ?? []).map((w) => w.id)].find((id) => graded.has(id));
    if (near) return byId.get(near);
    return vectors.find((w) => w.rule === v.rule && w.expected.valid !== v.expected.valid) ?? vectors.find((w) => w.expected.valid !== v.expected.valid);
  };

  // Valid siblings of one rule, each of a different invalid vector, in one
  // family that has one more: SEVERAL of them, or null.
  const chosen = (() => {
    const groups = new Map();
    for (const v of vectors) {
      if (!v.expected.valid || !partners.has(v.id)) continue;
      const key = `${pairsOf(data).hints.get(v.id).join(",")}\u0000${v.family}`;
      groups.set(key, [...(groups.get(key) ?? []), v]);
    }
    const pick = (list) => {
      const used = new Set();
      const out = [];
      for (const v of list) {
        const ids = partners.get(v.id).map((w) => w.id);
        if (ids.some((id) => used.has(id))) continue;
        ids.forEach((id) => used.add(id));
        out.push(v);
        if (out.length === SEVERAL) break;
      }
      return out.length === SEVERAL && list.length > SEVERAL ? out : null;
    };
    return [...groups.values()].map(pick).find(Boolean) ?? null;
  })();

  // Each control: its answers, which vectors the checker must flag, and
  // what the report must then say.
  const caught = (answers, which, name) => {
    const judged = judge(data, vectors, answers);
    const missed = judged.filter((j, i) => which(vectors[i]) && (j.status === "pass" || j.status === "malformed"));
    if (missed.length > 0) failures.push(`${name}: ${missed.length} vectors not caught, e.g. ${missed[0].vector.id}`);
  };
  const controls = [
    () => {
      const name = "every verdict flipped";
      const answers = vectors.map((v) => ({ valid: !v.expected.valid }));
      caught(answers, () => true, name);
      const r = report(answers);
      const credited = r.checks.filter((c) => c.status === "pass" || c.status === "subsumed");
      if (credited.length > 0) failures.push(`${name}: the report still credits ${credited.map((c) => c.id).join(", ")}`);
    },
    () => {
      const name = "answers taken from a different vector";
      const answers = vectors.map((v) => ({ ...partner(v).expected }));
      caught(answers, () => true, name);
      const r = report(answers);
      const credited = r.checks.filter((c) => c.status === "pass" || c.status === "subsumed");
      if (credited.length > 0) failures.push(`${name}: the report still credits ${credited.map((c) => c.id).join(", ")}`);
    },
    // A crash fails its vector even with the right verdict attached, and
    // never passes a check.
    () => {
      const name = "every vector crashed";
      const answers = vectors.map((v) => Object.assign(new Crash("NullPointerException"), { valid: v.expected.valid }));
      const judged = judge(data, vectors, answers);
      const missed = judged.filter((j) => j.status !== "crash");
      if (missed.length > 0) failures.push(`${name}: ${missed.length} vectors not counted as crashes, e.g. ${missed[0].vector.id}`);
      const r = report(answers);
      const credited = r.checks.filter((c) => c.status === "pass" || c.status === "subsumed");
      if (credited.length > 0) failures.push(`${name}: the report still credits ${credited.map((c) => c.id).join(", ")}`);
      if (r.findings.some((f) => f.kind !== "crash")) failures.push(`${name}: a crash counts toward a finding that isn't a crash`);
    },
    // A crash counts toward a release only where October 2021 can't take
    // the input: on a document with an empty selection set it counts
    // toward September 2026, on a schema with a OneOf Input Object toward
    // September 2025, and on a vector with `since` whose input October 2021
    // takes, toward none. A wrong verdict counts toward the vector's own
    // `since`.
    () => {
      const name = "crashes and wrong verdicts by release";
      const syntax = vectors.find((v) => v.syntax !== undefined);
      const oneOf = vectors.find((v) => v.syntax === undefined && inputSince(data, v) === "September2025");
      const plain = vectors.find((v) => v.since && !inputSince(data, v));
      const failingIn = (r) => Object.entries(r.since).filter(([, s]) => s.failing > 0).map(([release, s]) => `${release}:${s.failing}`).join(",");
      for (const [v, crash, want] of [
        [syntax, true, "September2026:1"],
        [oneOf, true, "September2025:1"],
        [plain, true, ""],
        [plain, false, `${plain?.since}:1`],
        [syntax, false, `${syntax?.since}:1`],
      ]) {
        if (!v) {
          failures.push(`${name}: no vector to try`);
          continue;
        }
        const answers = vectors.map((w, i) => (w !== v ? right[i] : crash ? new Crash("SyntaxError") : { valid: !w.expected.valid }));
        const r = report(answers);
        // The same release in the report, in every check the vector
        // fails, and in its finding.
        const inChecks = [...new Set(r.checks.filter((c) => c.failing > 0).map((c) => Object.entries(c.failingSince ?? {}).map(([release, n]) => `${release}:${n}`).join(",")))];
        const inFindings = r.findings.map((f) => Object.entries(f.since ?? {}).map(([release, n]) => `${release}:${n}`).join(","));
        const got = [failingIn(r), ...inChecks, ...inFindings];
        if (got.some((g) => g !== want)) {
          failures.push(`${name}: a ${crash ? "crash" : "wrong verdict"} on ${v.id} counts as ${got.map((g) => g || "no release").join(" / ")} (report / checks / findings), not ${want || "no release"}`);
        }
      }
    },
    () => {
      const name = "valid as a string";
      const judged = judge(data, vectors, vectors.map((v) => ({ valid: String(v.expected.valid) })));
      const missed = judged.filter((j) => j.status !== "malformed");
      if (missed.length > 0) failures.push(`${name}: ${missed.length} vectors not caught, e.g. ${missed[0].vector.id}`);
    },
    // Rejecting everything fails acceptsValid and no rule: over-strictness
    // is never blamed on a rule, and a subsumed rule earns no pass.
    () => {
      const name = "every document rejected";
      const answers = vectors.map(() => ({ valid: false }));
      caught(answers, (v) => v.expected.valid, name);
      const r = report(answers);
      if (statusOf(r, ACCEPTS_VALID) !== "fail") failures.push(`${name}: ${ACCEPTS_VALID} doesn't fail`);
      const blamed = r.checks.filter((c) => c.id !== ACCEPTS_VALID && c.status === "fail");
      if (blamed.length > 0) failures.push(`${name}: rule checks fail: ${blamed.map((c) => c.id).join(", ")}`);
      const credited = subsumed.filter((rule) => statusOf(r, checkId(rule)) !== "subsumed");
      if (credited.length > 0) failures.push(`${name}: ${credited.map(checkId).join(", ")} not reported as subsumed`);
    },
    // Accepting everything fails every rule that has a vector, the subsumed
    // ones included.
    () => {
      const name = "every document accepted";
      const answers = vectors.map(() => ({ valid: true }));
      caught(answers, (v) => !v.expected.valid, name);
      const r = report(answers);
      const spared = r.checks.filter((c) => c.id !== ACCEPTS_VALID && c.cases > 0 && c.status !== "fail");
      if (spared.length > 0) failures.push(`${name}: rule checks don't fail: ${spared.map((c) => c.id).join(", ")}`);
    },
    // One rejected valid vector is no evidence against its rule.
    () => {
      const name = "one valid vector rejected";
      const target = vectors.find((v) => v.expected.valid);
      const answers = vectors.map((v, i) => (v === target ? { valid: false } : right[i]));
      caught(answers, (v) => v === target, name);
      const r = report(answers);
      if (statusOf(r, ACCEPTS_VALID) !== "fail") failures.push(`${name}: ${ACCEPTS_VALID} doesn't fail`);
      if (r.findings.some((f) => f.likelyOverStrict)) failures.push(`${name}: a finding names a rule as likely over-strict`);
    },
    // Several siblings of one rule rejected, with others of the same family
    // accepted, is, with or without an error message.
    () => {
      const name = "several valid siblings of one rule rejected";
      if (!chosen) return failures.push(`${name}: no rule has ${SEVERAL + 1} valid siblings in one family`);
      for (const errors of [undefined, [{ message: "Variable '$v0' is not allowed here." }]]) {
        const answers = vectors.map((v, i) => (chosen.includes(v) ? { valid: false, ...(errors ? { errors } : {}) } : right[i]));
        caught(answers, (v) => chosen.includes(v), name);
        const r = report(answers);
        if (!r.findings.some((f) => f.likelyOverStrict)) {
          failures.push(`${name}${errors ? ", with one message" : ""}: no finding names the rule as likely over-strict`);
        }
      }
    },
    // The same rejections, plus one near another rule, all with one message
    // that differs only in names: one finding, which blames no rule.
    () => {
      const name = "valid vectors near several rules rejected with one message";
      if (!chosen) return failures.push(`${name}: no rule has ${SEVERAL + 1} valid siblings in one family`);
      const hintOf = (v) => pairsOf(data).hints.get(v.id).join(",");
      const other = vectors.find((v) => v.expected.valid && partners.has(v.id) && hintOf(v) !== hintOf(chosen[0]));
      const rejected = [...chosen, other];
      const answers = vectors.map((v, i) =>
        rejected.includes(v) ? { valid: false, errors: [{ message: `Variable '$${v.id}' is not allowed here.` }] } : right[i]);
      caught(answers, (v) => rejected.includes(v), name);
      const r = report(answers);
      const found = r.findings.filter((f) => f.checks.includes(ACCEPTS_VALID));
      if (found.length !== 1 || found[0].cases !== rejected.length) {
        failures.push(`${name}: ${found.length} findings instead of one with ${rejected.length} cases`);
      }
      if (r.findings.some((f) => f.likelyOverStrict)) failures.push(`${name}: a finding names a rule as likely over-strict`);
    },
  ];
  for (const control of controls) control();

  // The reference's own answers: nothing flagged, and subsumed rules
  // reported as such.
  const own = report(right);
  if (own.findings.length > 0 || own.checks.some((c) => c.status === "fail")) failures.push("the reference's own answers are flagged");
  const credited = subsumed.filter((rule) => statusOf(own, checkId(rule)) !== "subsumed");
  if (credited.length > 0) failures.push(`the reference's own answers: ${credited.map(checkId).join(", ")} not reported as subsumed`);

  return { ok: failures.length === 0, failures, controls: controls.length };
};

// Compares the answers to the graded vectors with the reference, and
// reports.
export const check = (data, vectors, answers, { strict = false, log = console.log, implementation = "unknown", capabilities = [], skipped = {} } = {}) => {
  const judged = judge(data, vectors, answers);
  const test = selfTest(data, vectors);
  const report = buildReport({ data, judged, strict, selfTest: test.ok, controls: test.controls, implementation, capabilities, skipped });

  const invalid = judged.filter((j) => !j.vector.expected.valid).length;
  const skippedText = Object.entries(skipped).map(([r, n]) => (r === "unspecified" ? `${n} unspecified` : `${n} need ${r}`)).join(", ");
  log(`  ${judged.length} vectors graded (${invalid} invalid, ${judged.length - invalid} valid) over ${Object.keys(data.rules).length} rules${skippedText ? `; not graded: ${skippedText}` : ""}`);
  for (const f of report.findings) {
    log(`✗ ${f.summary} (${plural(f.cases, "vector")})`);
    log(`    document: ${f.example.input}`);
    log(`    answer:   ${JSON.stringify(f.example.response)}`);
    log(`    expected: ${f.example.expected}`);
  }
  const malformed = report.cases.malformed;
  if (malformed > 0) {
    const first = judged.find((j) => j.status === "malformed");
    log(`✗ ${malformed} answers aren't {"valid": true|false}, e.g. ${JSON.stringify(first.answer)} for ${first.vector.id}`);
  }
  const passed = judged.filter((j) => j.status === "pass").length;
  const crashed = judged.filter((j) => j.status === "crash").length;
  log(`${passed === judged.length ? "✓" : "✗"} ${passed} of ${judged.length} answers agree with the reference${crashed ? `; ${crashed} crashed` : ""}`);
  if (passed < judged.length - malformed) {
    for (const [release, s] of Object.entries(report.since)) {
      log(`  ${s.failing} of the ${judged.length - malformed - passed} failing vectors rely on rules since ${releaseName(release)} (of ${s.vectors} such vectors graded)`);
    }
  }
  const subsumed = report.checks.filter((c) => c.status === "subsumed");
  if (subsumed.length > 0) log(`~ subsumed, can't pass alone: ${subsumed.map((c) => c.id).join(", ")}`);
  const untested = report.checks.filter((c) => c.status === "untested");
  if (untested.length > 0) log(`! untested: ${untested.map((c) => c.id).join(", ")}`);
  if (test.ok) log(`✓ the checker catches all ${test.controls} negative controls`);
  else for (const f of test.failures) log(`✗ self-test: ${f}`);

  // Every check is a MUST, so --strict changes nothing yet.
  const ok = test.ok && malformed === 0 && report.checks.every((c) => c.status !== "fail");
  return { ok, report };
};
