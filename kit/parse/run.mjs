// The parse area (docs/kit/parse.md): asks the adapter whether each source
// text in vectors.json is a syntactically valid executable document, or a
// valid document of the type system grammar the vector names, and compares
// its answers with the reference's, which scripts/generate-vectors-parse.mjs
// took from specs/Parser.tla.
//
// Each vector's first spec section is the rule its verdict rests on: for a
// minimal pair, the section of the one edit between the two sources. A
// wrong answer counts against that section's check, and toward one finding:
// "accepts what §X rejects" or "rejects what §X accepts".
//
// The verdicts are September 2026's. A vector whose verdict differs under an
// older release carries `since`, the first release whose text gives its
// verdict ("September2025" or "September2026"). Checks count their failing
// vectors per release (`failingSince`), findings theirs (`since`), and so
// does the report.
//
// A crash is a third kind of failure: the adapter answered a vector with an
// `error` (docs/kit-areas.md, "Protocol"). It fails the vector's check,
// whatever the vector's verdict, since the implementation gave none, and
// counts toward its own finding: "crashes on a source §X accepts" or
// "rejects". It is never counted as an agreement. Nor is it ever counted
// by release: every source is an input the parser must answer, in every
// release, so a crash fails in all of them, even on a vector with `since`.
//
// An adapter whose transport can't carry a lone surrogate (a JSON parser
// that refuses one) answers { unsupported: "why" } for a source that holds
// one. The vector is then not graded. An `unsupported` answer for any other
// source is a crash: the adapter could have asked the implementation. A run
// that grades no vector at all isn't ok.
//
// A vector with `grammar` asks whether the source is a valid document of
// that grammar: "typeSystem" (TypeSystemDocument), "typeSystemExtension"
// (TypeSystemExtensionDocument) or "document" (Document). Only an adapter
// that claims `parse-sdl` is asked these; for any other they are skipped,
// and counted as such in the report's provenance.
//
// A vector with `probe` is a crash probe: a source deeper or longer than
// the others, such as a thousand nested lists. Its verdict is the
// reference's, but the spec sets no limit an implementation must reach, so
// only a crash on it fails; rejecting what it accepts doesn't.

import { readFileSync } from "node:fs";
import { Crash, answerOrCrash, crashResponse } from "../areas.mjs";
import { REPORT_FORMAT, provenance, section } from "../report.mjs";

// One check per section of the grammar, each with the productions it
// grades as its basis. Every one is a MUST: "The lexical token sequence,
// omitting Ignored, must be described by a single Document syntactic
// grammar" (§2). The checks of §3 are graded only for adapters that claim
// `parse-sdl`, which read a source as a type system document; the others
// grade those vectors too where they rest on them, such as `enum E { true }`
// on §2.10.6.
export const CHECKS = [
  ["2.1", "sourceText", "Source text is a sequence of SourceCharacter", 'SourceCharacter :: "Any Unicode scalar value"; "The source text of a GraphQL document must be a sequence of {SourceCharacter}."'],
  ["2.1.1", "whiteSpace", "White space is tab and space only", 'Whitespace :: "Horizontal Tab (U+0009)" | "Space (U+0020)"'],
  ["2.1.2", "lineTerminators", "Line terminators are LF, CR and CR LF only", 'LineTerminator :: "New Line (U+000A)" | "Carriage Return (U+000D)" [lookahead != "New Line (U+000A)"] | "Carriage Return (U+000D)" "New Line (U+000A)"'],
  ["2.1.3", "comments", "A comment runs to the end of its line", "Comment :: `#` CommentChar* [lookahead != CommentChar]; CommentChar :: SourceCharacter but not LineTerminator"],
  ["2.1.4", "insignificantCommas", "Commas are insignificant", 'Comma :: ,; commas "are used to improve the legibility of source text and separate lexical tokens but are otherwise syntactically and semantically insignificant within GraphQL documents."'],
  ["2.1.5", "lexicalTokens", "Every character outside ignored tokens is part of a token", 'Token :: Punctuator | Name | IntValue | FloatValue | StringValue; "The character sequence must be described by a sequence of {Token} and {Ignored} lexical grammars."'],
  ["2.1.6", "ignoredTokens", "Ignored tokens may appear before and after every token", 'Ignored :: UnicodeBOM | Whitespace | LineTerminator | Comment | Comma; "Any amount of {Ignored} may appear before and after every lexical token."'],
  ["2.1.7", "punctuators", "Punctuators, and `...` only as a whole", "Punctuator :: one of ! $ & ( ) ... : = @ [ ] { | }"],
  ["2.1.8", "names", "Names", "Name :: NameStart NameContinue* [lookahead != NameContinue]; NameStart :: Letter | `_`; NameContinue :: Letter | Digit | `_`"],
  ["2.2", "descriptions", "Descriptions on operations, fragments and variables, not on the query shorthand", "Description : StringValue; OperationDefinition : Description? OperationType Name? VariablesDefinition? Directives? SelectionSet | SelectionSet; FragmentDefinition : Description? fragment …; VariableDefinition : Description? Variable : …"],
  ["2.3", "document", "A document is one or more definitions of the kinds its grammar allows", "Document : Definition+; Definition : ExecutableDefinition | TypeSystemDefinitionOrExtension; ExecutableDocument : ExecutableDefinition+; ExecutableDefinition : OperationDefinition | FragmentDefinition"],
  ["2.4", "operations", "Operation definitions and the query shorthand", "OperationDefinition : Description? OperationType Name? VariablesDefinition? Directives? SelectionSet | SelectionSet; OperationType : one of `query` `mutation` `subscription`"],
  ["2.5", "selectionSets", "Selection sets, including empty ones", "SelectionSet : { Selection* }; Selection : Field | FragmentSpread | InlineFragment"],
  ["2.6", "fields", "Fields", "Field : Alias? Name Arguments? Directives? SelectionSet?"],
  ["2.7", "arguments", "Arguments", "Arguments[Const] : ( Argument[?Const]+ ); Argument[Const] : Name : Value[?Const]"],
  ["2.8", "fieldAlias", "Field aliases", "Alias : Name :"],
  ["2.9", "fragments", "Fragment definitions and fragment spreads", "FragmentSpread : ... FragmentName Directives?; FragmentDefinition : Description? fragment FragmentName TypeCondition Directives? SelectionSet; FragmentName : Name but not `on`"],
  ["2.9.1", "typeConditions", "Type conditions", "TypeCondition : on NamedType"],
  ["2.9.2", "inlineFragments", "Inline fragments", "InlineFragment : ... TypeCondition? Directives? SelectionSet"],
  ["2.10", "inputValues", "Input values, and no variables in constant values", "Value[Const] : [~Const] Variable | IntValue | FloatValue | StringValue | BooleanValue | NullValue | EnumValue | ListValue[?Const] | ObjectValue[?Const]"],
  ["2.10.1", "intValue", "Int values", 'IntValue :: IntegerPart [lookahead != {Digit, `.`, NameStart}]; IntegerPart :: NegativeSign? 0 | NegativeSign? NonZeroDigit Digit*; "It must not have any leading {0}."'],
  ["2.10.2", "floatValue", "Float values", "FloatValue :: IntegerPart FractionalPart ExponentPart | IntegerPart FractionalPart | IntegerPart ExponentPart, each [lookahead != {Digit, `.`, NameStart}]"],
  ["2.10.3", "booleanValue", "Boolean values", "BooleanValue : one of `true` `false`"],
  ["2.10.4", "stringValue", "String values and block strings", 'StringValue :: `""` [lookahead != `"`] | `"` StringCharacter+ `"` | BlockString; "The hexadecimal number encoded by a Unicode escape sequence must describe a _Unicode scalar value_, otherwise must result in a parse error."'],
  ["2.10.5", "nullValue", "Null value", "NullValue : `null`"],
  ["2.10.6", "enumValue", "Enum values", "EnumValue : Name but not `true`, `false` or `null`"],
  ["2.10.7", "listValue", "List values", "ListValue[Const] : [ ] | [ Value[?Const]+ ]"],
  ["2.10.8", "inputObjectValues", "Input object values", "ObjectValue[Const] : { } | { ObjectField[?Const]+ }; ObjectField[Const] : Name : Value[?Const]"],
  ["2.11", "variables", "Variables and variable definitions", "Variable : $ Name; VariablesDefinition : ( VariableDefinition+ ); VariableDefinition : Description? Variable : Type DefaultValue? Directives[Const]?; DefaultValue : = Value[Const]"],
  ["2.12", "typeReferences", "Type references", "Type : NamedType | ListType | NonNullType; NamedType : Name; ListType : [ Type ]; NonNullType : NamedType ! | ListType !"],
  ["2.13", "directives", "Directives", "Directives[Const] : Directive[?Const]+; Directive[Const] : @ Name Arguments[?Const]?"],
  ["3.1", "typeSystemDocuments", "Type system documents hold type system definitions, and extension documents extensions too", "TypeSystemDocument : TypeSystemDefinition+ (§3); TypeSystemExtensionDocument : TypeSystemDefinitionOrExtension+; TypeSystemDefinitionOrExtension : TypeSystemDefinition | TypeSystemExtension (§3.1)"],
  ["3.2", "typeSystemDescriptions", "Descriptions on type system definitions and their parts, not on extensions", "Description : StringValue, where a production allows one: every type system definition, FieldDefinition, InputValueDefinition and EnumValueDefinition starts with Description?, and no extension does"],
  ["3.3", "schemaDefinition", "Schema definitions", "SchemaDefinition : Description? schema Directives[Const]? { RootOperationTypeDefinition+ }; RootOperationTypeDefinition : OperationType : NamedType"],
  ["3.3.2", "schemaExtension", "Schema extensions add directives or root operation types", "SchemaExtension : extend schema Directives[Const]? { RootOperationTypeDefinition+ } | extend schema Directives[Const] [lookahead != `{`]"],
  ["3.4.3", "typeExtensions", "A type extension names a kind of type", "TypeExtension : ScalarTypeExtension | ObjectTypeExtension | InterfaceTypeExtension | UnionTypeExtension | EnumTypeExtension | InputObjectTypeExtension"],
  ["3.5", "scalarDefinition", "Scalar definitions", "ScalarTypeDefinition : Description? scalar Name Directives[Const]?"],
  ["3.5.6", "scalarExtension", "Scalar extensions add directives", "ScalarTypeExtension : extend scalar Name Directives[Const]"],
  ["3.6", "objectDefinition", "Object definitions, implemented interfaces and field definitions", "ObjectTypeDefinition : Description? type Name ImplementsInterfaces? Directives[Const]? FieldsDefinition | Description? type Name ImplementsInterfaces? Directives[Const]? [lookahead != `{`]; ImplementsInterfaces : ImplementsInterfaces & NamedType | implements `&`? NamedType; FieldsDefinition : { FieldDefinition+ }; FieldDefinition : Description? Name ArgumentsDefinition? : Type Directives[Const]?"],
  ["3.6.1", "argumentsDefinition", "Argument definitions", "ArgumentsDefinition : ( InputValueDefinition+ ); InputValueDefinition : Description? Name : Type DefaultValue? Directives[Const]?"],
  ["3.6.3", "objectExtension", "Object extensions add interfaces, directives or fields", "ObjectTypeExtension : extend type Name ImplementsInterfaces? Directives[Const]? FieldsDefinition | extend type Name ImplementsInterfaces? Directives[Const] [lookahead != `{`] | extend type Name ImplementsInterfaces [lookahead != `{`]"],
  ["3.7", "interfaceDefinition", "Interface definitions", "InterfaceTypeDefinition : Description? interface Name ImplementsInterfaces? Directives[Const]? FieldsDefinition | Description? interface Name ImplementsInterfaces? Directives[Const]? [lookahead != `{`]"],
  ["3.7.1", "interfaceExtension", "Interface extensions add interfaces, directives or fields", "InterfaceTypeExtension : extend interface Name ImplementsInterfaces? Directives[Const]? FieldsDefinition | extend interface Name ImplementsInterfaces? Directives[Const] [lookahead != `{`] | extend interface Name ImplementsInterfaces [lookahead != `{`]"],
  ["3.8", "unionDefinition", "Union definitions and their member types", "UnionTypeDefinition : Description? union Name Directives[Const]? UnionMemberTypes?; UnionMemberTypes : UnionMemberTypes | NamedType | = `|`? NamedType"],
  ["3.8.1", "unionExtension", "Union extensions add directives or member types", "UnionTypeExtension : extend union Name Directives[Const]? UnionMemberTypes | extend union Name Directives[Const]"],
  ["3.9", "enumDefinition", "Enum definitions and their values", "EnumTypeDefinition : Description? enum Name Directives[Const]? EnumValuesDefinition | Description? enum Name Directives[Const]? [lookahead != `{`]; EnumValuesDefinition : { EnumValueDefinition+ }; EnumValueDefinition : Description? EnumValue Directives[Const]?"],
  ["3.9.1", "enumExtension", "Enum extensions add directives or values", "EnumTypeExtension : extend enum Name Directives[Const]? EnumValuesDefinition | extend enum Name Directives[Const] [lookahead != `{`]"],
  ["3.10", "inputObjectDefinition", "Input object definitions and their fields", "InputObjectTypeDefinition : Description? input Name Directives[Const]? InputFieldsDefinition | Description? input Name Directives[Const]? [lookahead != `{`]; InputFieldsDefinition : { InputValueDefinition+ }"],
  ["3.10.2", "inputObjectExtension", "Input object extensions add directives or fields", "InputObjectTypeExtension : extend input Name Directives[Const]? InputFieldsDefinition | extend input Name Directives[Const] [lookahead != `{`]"],
  ["3.13", "directiveDefinition", "Directive definitions and their locations", "DirectiveDefinition : Description? directive @ Name ArgumentsDefinition? Directives[Const]? `repeatable`? on DirectiveLocations; DirectiveLocations : DirectiveLocations | DirectiveLocation | `|`? DirectiveLocation; DirectiveLocation : ExecutableDirectiveLocation | TypeSystemDirectiveLocation, each one of a list of names"],
  ["3.13.6", "directiveExtension", "Directive extensions add directives", "DirectiveExtension : extend directive @ Name Directives[Const]", "September2026"],
].map(([number, id, title, basis, since]) => ({ number, id, title, level: "MUST", basis, ...(since ? { since } : {}) }));

// What an adapter claims to read type system documents with, and the
// grammars a vector can name. A vector without `grammar` is read as an
// ExecutableDocument, and is sent without one.
export const PARSE_SDL = "parse-sdl";
export const GRAMMARS = ["typeSystem", "typeSystemExtension", "document"];

const byNumber = new Map(CHECKS.map((c) => [c.number, c]));

export const loadVectors = () => {
  const { vectors } = JSON.parse(readFileSync(new URL("./vectors.json", import.meta.url), "utf8"));
  const ids = new Set();
  for (const v of vectors) {
    if (ids.has(v.id)) throw new Error(`vectors.json: vector ${v.id} appears twice`);
    ids.add(v.id);
    if (typeof v.source !== "string" || typeof v.expected?.ok !== "boolean") throw new Error(`vectors.json: vector ${v.id} is malformed`);
    if (v.grammar !== undefined && !GRAMMARS.includes(v.grammar)) throw new Error(`vectors.json: vector ${v.id} names no grammar the kit knows: ${v.grammar}`);
    if (v.probe !== undefined && v.probe !== true) throw new Error(`vectors.json: vector ${v.id} has a malformed probe`);
    const unknown = v.spec.filter((s) => !byNumber.has(s));
    if (v.spec.length === 0 || unknown.length > 0) throw new Error(`vectors.json: vector ${v.id} cites no check for ${unknown.join(", ") || "any section"}`);
  }
  return vectors;
};

// Whether a source holds a surrogate code unit that isn't half of a pair.
export const hasLoneSurrogate = (source) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(source);

// Sorts the adapter's raw answers: an `unsupported` answer leaves its vector
// ungraded if the source holds a lone surrogate, and is a crash otherwise.
export const sortAnswers = (all, raw) => {
  const vectors = [];
  const answers = [];
  const unsupported = [];
  all.forEach((v, i) => {
    const answer = raw[i];
    if (!(answer instanceof Crash) && typeof answer?.unsupported === "string") {
      if (hasLoneSurrogate(v.source)) {
        unsupported.push({ id: v.id, reason: answer.unsupported });
        return;
      }
      vectors.push(v);
      answers.push(new Crash(`answered unsupported for a source without a lone surrogate: ${answer.unsupported}`));
      return;
    }
    vectors.push(v);
    answers.push(answer);
  });
  return { vectors, answers, unsupported };
};

const quote = (source) => JSON.stringify(source);

// The releases a vector's `since` can name, oldest first, and how a report
// writes one.
export const RELEASES = ["September2025", "September2026"];
const releaseName = (release) => release.replace(/(\d{4})$/, " $1");
const count = (counts, release) => void (counts[release] = (counts[release] ?? 0) + 1);
const shorter = (a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

// The vectors an adapter with these capabilities is asked, and how many
// of the others are skipped for which reason.
export const applicable = (all, capabilities) => {
  const asked = all.filter((v) => v.grammar === undefined || capabilities.has(PARSE_SDL));
  const skipped = all.length - asked.length;
  return { asked, skipped: skipped ? { [`needs capability ${PARSE_SDL}`]: skipped } : {} };
};

// What the adapter is sent for a vector.
export const request = (v) => (v.grammar === undefined ? { source: v.source } : { source: v.source, grammar: v.grammar });

// Compares answers with the vectors. answers[i] is the adapter's result
// for vectors[i]: { ok } and anything else it sent, or a Crash.
export const judge = (vectors, answers) => {
  const byId = new Map(vectors.map((v) => [v.id, v]));
  const stats = new Map(CHECKS.map((c) => [c.number, { cases: 0, failing: 0, failingSince: {} }]));
  const findings = new Map();
  const failed = [];
  const crashed = [];
  const malformed = [];
  const found = (key, vector, finding) => {
    const f = findings.get(key) ?? { ...finding, cases: 0, fixtures: {}, since: {} };
    f.cases++;
    f.fixtures[vector.family] = (f.fixtures[vector.family] ?? 0) + 1;
    // A crash fails in every release (see the top of this file).
    const since = key !== "malformed" && finding.kind !== "crash" ? vector.since : undefined;
    if (since) count(f.since, since);
    if (!f.shortest || shorter(vector.source, f.shortest) < 0) {
      const sibling = byId.get(vector.sibling);
      f.shortest = vector.source;
      f.fixture = vector.family;
      if (finding.kind === "crash") f.problem = finding.problem;
      f.example = {
        input: `${since ? `[since ${releaseName(since)}] ` : ""}${quote(vector.source)}`,
        response: finding.response,
        expected: JSON.stringify(vector.expected),
        ...(sibling ? { sibling: `${quote(sibling.source)}, which the reference ${sibling.expected.ok ? "accepts" : "rejects"}` } : {}),
      };
    }
    findings.set(key, f);
  };
  vectors.forEach((v, i) => {
    const answer = answers[i];
    for (const s of v.spec) stats.get(s).cases++;
    if (answer instanceof Crash) {
      crashed.push(i);
      const check = byNumber.get(v.spec[0]);
      stats.get(check.number).failing++;
      const s = section(check.number);
      found(`crash\u0000${check.number}\u0000${v.expected.ok}`, v, {
        checks: [check.id],
        kind: "crash",
        summary: v.expected.ok
          ? `crashes on a source §${s.number} ${s.title} accepts, instead of accepting it`
          : `crashes on a source §${s.number} ${s.title} rejects, instead of rejecting it`,
        response: crashResponse(answer),
        problem: answer.message,
      });
      return;
    }
    if (typeof answer?.ok !== "boolean") {
      malformed.push(i);
      found("malformed", v, {
        checks: [],
        summary: "results without a boolean ok",
        problem: `the result has no boolean \`ok\`: ${JSON.stringify(answer)}`,
        response: answer,
      });
      return;
    }
    if (answer.ok === v.expected.ok || v.probe) return;
    failed.push(i);
    const check = byNumber.get(v.spec[0]);
    stats.get(check.number).failing++;
    if (v.since) count(stats.get(check.number).failingSince, v.since);
    const s = section(check.number);
    found(`${check.number}\u0000${v.expected.ok}`, v, {
      checks: [check.id],
      summary: v.expected.ok ? `rejects what §${s.number} ${s.title} accepts` : `accepts what §${s.number} ${s.title} rejects`,
      response: answer,
    });
  });
  for (const f of findings.values()) {
    if (Object.keys(f.since).length === 0) delete f.since;
  }
  return {
    failed,
    crashed,
    malformed,
    stats,
    findings: [...findings.values()].sort((a, b) => b.cases - a.cases).map(({ shortest: _, response: __, ...f }) => f),
  };
};

// Grades the raw answers to every vector: the judged result, the checks, and
// whether the run is ok. A run that graded nothing is never ok.
export const grade = (all, raw) => {
  const { vectors, answers, unsupported } = sortAnswers(all, raw);
  const result = judge(vectors, answers);
  const checks = CHECKS.map((c) => {
    const s = result.stats.get(c.number);
    return {
      id: c.id,
      title: c.title,
      level: c.level,
      spec: [section(c.number)],
      basis: c.basis,
      ...(c.since ? { since: c.since } : {}),
      status: s.failing > 0 ? "fail" : s.cases > 0 ? "pass" : "untested",
      cases: s.cases,
      failing: s.failing,
      ...(Object.keys(s.failingSince).length ? { failingSince: s.failingSince } : {}),
    };
  });
  // Every check is a MUST, so --strict changes nothing here.
  const ok = vectors.length > 0 && checks.every((c) => c.status !== "fail") && result.malformed.length === 0;
  return { vectors, unsupported, result, checks, ok };
};

// The self-test: deliberately wrong answers, which the checker must flag,
// and the reference's own answers, which it must not.
export const selfTest = (vectors) => {
  const problems = [];
  const n = vectors.length;
  const right = judge(vectors, vectors.map((v) => ({ ok: v.expected.ok })));
  if (right.failed.length || right.malformed.length) problems.push(`flags ${right.failed.length + right.malformed.length} of the reference's own answers`);
  // Probes are graded for crashes only, so a flipped verdict on one is
  // never flagged.
  const probes = vectors.filter((v) => v.probe).length;
  const flipped = judge(vectors, vectors.map((v) => ({ ok: !v.expected.ok })));
  if (flipped.failed.length !== n - probes) problems.push(`flags ${flipped.failed.length} of ${n - probes} flipped verdicts`);
  if (probes === 0 || flipped.failed.some((i) => vectors[i].probe)) problems.push("flags a flipped verdict on a crash probe, or has no probe");
  const primaries = new Set(vectors.filter((v) => !v.probe).map((v) => v.spec[0]));
  const quiet = [...primaries].filter((s) => flipped.stats.get(s).failing === 0);
  if (quiet.length) problems.push(`with every verdict flipped, ${quiet.map((s) => `§${s}`).join(", ")} still pass`);
  // Each vector answered with the next one's verdict.
  const differ = vectors.filter((v, i) => !v.probe && v.expected.ok !== vectors[(i + 1) % n].expected.ok).length;
  const shifted = judge(vectors, vectors.map((_, i) => ({ ok: vectors[(i + 1) % n].expected.ok })));
  if (differ === 0 || shifted.failed.length !== differ) problems.push(`flags ${shifted.failed.length} of ${differ} answers taken from the next vector`);
  const empty = judge(vectors, vectors.map(() => ({})));
  if (empty.malformed.length !== n) problems.push(`counts ${empty.malformed.length} of ${n} results without \`ok\` as malformed`);
  // Every vector crashed, though each crash carries the right verdict: all
  // are crashes, none agrees, and every section a verdict rests on fails.
  const crash = judge(vectors, vectors.map((v) => Object.assign(new Crash("NullPointerException"), { ok: v.expected.ok })));
  if (crash.crashed.length !== n || crash.failed.length || crash.malformed.length) problems.push(`counts ${crash.crashed.length} of ${n} crashes as crashes`);
  const spared = [...new Set(vectors.map((v) => v.spec[0]))].filter((s) => crash.stats.get(s).failing === 0);
  if (spared.length) problems.push(`with every vector crashed, ${spared.map((s) => `§${s}`).join(", ")} still pass`);
  if (crash.findings.some((f) => f.kind !== "crash")) problems.push("a crash counts toward a finding that isn't a crash");
  // ... and none of those crashes is counted by release, though some
  // vectors have `since`.
  const releaseCrashes = [...crash.stats.values()].reduce((n, s) => n + Object.values(s.failingSince).reduce((a, b) => a + b, 0), 0);
  if (!vectors.some((v) => v.since) || releaseCrashes > 0 || crash.findings.some((f) => f.since || f.example.input.startsWith("[since"))) {
    problems.push(`with every vector crashed, ${releaseCrashes} crashes count as failing only since a release`);
  }
  // Flipped verdicts on vectors with `since` count toward that release,
  // in the check, the finding and the example.
  const tagged = vectors.filter((v) => v.since);
  const flippedSince = [...flipped.stats.values()].reduce((n, s) => n + Object.values(s.failingSince).reduce((a, b) => a + b, 0), 0);
  const findingSince = flipped.findings.reduce((n, f) => n + Object.values(f.since ?? {}).reduce((a, b) => a + b, 0), 0);
  if (flippedSince !== tagged.length || findingSince !== tagged.length) {
    problems.push(`with every verdict flipped, ${flippedSince} of ${tagged.length} failures with \`since\` count toward their release (${findingSince} in findings)`);
  }
  // Every vector answered `unsupported`: only those whose source holds a
  // lone surrogate go ungraded, every other one is a crash, and the run
  // fails. With nothing but those vectors, nothing is graded, and the run
  // fails too.
  const lone = vectors.filter((v) => hasLoneSurrogate(v.source));
  const refused = grade(vectors, vectors.map(() => ({ unsupported: "lone surrogate: control" })));
  if (lone.length === 0 || refused.unsupported.length !== lone.length || refused.result.crashed.length !== n - lone.length || refused.ok) {
    problems.push(`with every vector answered unsupported, ${refused.unsupported.length} of ${lone.length} sources with a lone surrogate go ungraded and ${refused.result.crashed.length} of ${n - lone.length} others crash`);
  }
  if (grade(lone, lone.map(() => ({ unsupported: "lone surrogate: control" }))).ok) problems.push("a run that grades no vector passes");
  // An adapter without parse-sdl is asked no vector with a grammar, and
  // is sent no grammar; one with it is asked every vector.
  const sdl = vectors.filter((v) => v.grammar !== undefined).length;
  const without = applicable(vectors, new Set());
  const withSdl = applicable(vectors, new Set([PARSE_SDL]));
  if (sdl === 0 || without.asked.length !== n - sdl || without.asked.some((v) => "grammar" in request(v)) || withSdl.asked.length !== n || Object.keys(withSdl.skipped).length) {
    problems.push(`asks ${without.asked.length} of ${n - sdl} vectors without a grammar when parse-sdl isn't claimed, and ${withSdl.asked.length} of ${n} when it is`);
  }
  return { problems, controls: 10 };
};

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const run = async ({ adapter, strict, log }) => {
  const every = loadVectors();
  const { asked: all, skipped } = applicable(every, adapter.capabilities);
  if (all.length < every.length) log(`- ${plural(every.length - all.length, "vector")} not asked: they read a source as a type system document, and the adapter doesn't claim ${PARSE_SDL}`);
  const started = Date.now();
  const raw = [];
  for (const v of all) raw.push(await answerOrCrash(adapter, "parse", request(v)));
  const { vectors, unsupported, result, checks, ok: passed } = grade(all, raw);
  if (unsupported.length) log(`- ${plural(unsupported.length, "vector")} not graded: the source holds a lone surrogate, which the adapter couldn't receive (${unsupported[0].reason})`);
  if (vectors.length === 0) log("✗ no vector was graded");
  const test = selfTest(every);

  const since = (f) =>
    f.since
      ? ` (${Object.entries(f.since)
          .map(([release, n]) => `${n === f.cases ? "all" : n} since ${releaseName(release)}`)
          .join(", ")})`
      : "";
  for (const f of result.findings) {
    log(`✗ ${f.summary}: ${plural(f.cases, "vector")}${since(f)}, such as ${f.example.input} (answered ${JSON.stringify(f.example.response)})`);
  }
  const agree = vectors.length - result.failed.length - result.crashed.length - result.malformed.length;
  const crashes = result.crashed.length ? `; ${result.crashed.length} crashed` : "";
  log(`${agree === vectors.length ? "✓" : "✗"} ${agree} of ${vectors.length} vectors agree with the reference${crashes} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  for (const p of test.problems) log(`✗ checker self-test: ${p}`);
  if (test.problems.length === 0) log(`✓ the checker catches all ${test.controls} negative controls`);

  const report = {
    format: REPORT_FORMAT,
    area: "parse",
    implementation: adapter.name,
    capabilities: [...adapter.capabilities].sort(),
    provenance: provenance({
      strict,
      vectors: every.length,
      ...(unsupported.length || all.length < every.length
        ? { graded: vectors.length, skipped: { ...skipped, ...(unsupported.length ? { "unsupported by the adapter": unsupported.length } : {}) } }
        : {}),
    }),
    checkerSelfTest: test.problems.length === 0 ? `passed (${test.controls} negative controls)` : "failed",
    cases: { submitted: vectors.length, distinct: new Set(vectors.map((v) => v.source)).size, malformed: result.malformed.length },
    adapterProblems: result.malformed.length,
    // Crashes fail in every release, so they never count here.
    since: Object.fromEntries(
      RELEASES.map((release) => [
        release,
        { vectors: vectors.filter((v) => v.since === release).length, failing: result.failed.filter((i) => vectors[i].since === release).length },
      ]).filter(([, s]) => s.vectors > 0),
    ),
    checks,
    findings: result.findings,
    fixtures: [],
  };
  const ok = passed && test.problems.length === 0;
  return { ok, report };
};
