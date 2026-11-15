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
// Profiles (chooseProfile): the kit grades September 2026, the latest
// release. It asks the first vector with September 2026's query, then
// September 2025's. If both are rejected, it asks which fields and
// arguments the introspection types have, and asks September 2026's or
// September 2025's query without the ones the service lacks, if the kit
// can do without them; then October 2021's query, and October 2021's
// without what the service lacks. What the service lacks counts once per
// run, under builtinDefinitions. Failing cases that rest on rules a release
// after October 2021 introduced are counted by that release (`since`).

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Crash, answerOrCrash, crashResponse } from "../areas.mjs";
import { REPORT_FORMAT, provenance, section } from "../report.mjs";
import * as graphql from "graphql17";
import { chunked, evaluateModule, moduleFooter, parseDefault, pool, schemaData, tla } from "../schema/tla.mjs";
import {
  BUILTIN_DIRECTIVES,
  BUILTIN_SCALARS,
  Malformed,
  caseOf,
  envelopeProblems,
  exactProblem,
  fillDefinitions,
  fromTla,
  fullResponse,
  isBuiltinType,
  isRequestError,
  lookupCaseOf,
  probeCaseOf,
  toTla,
  wrappersCaseOf,
} from "./data.mjs";
import { CONTROLS, PROFILE_CONTROLS } from "./controls.mjs";
import { DISCOVERY_ALIASES, DISCOVERY_QUERY, INCLUDE_DEPRECATED, PRIMARY, PROFILES, isArgument, lookupQuery, neededArgs, neededFields, schemaQuery, wrappersQuery } from "./query.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const checksModule = readFileSync(join(root, "kit/introspect/IntrospectChecks.tla"), "utf8");
// IntrospectChecks reads printed default values with the reference's lexer.
const lexerModule = readFileSync(join(root, "specs/Lexer.tla"), "utf8");

export const loadVectors = () => JSON.parse(readFileSync(join(root, "kit/introspect/vectors.json"), "utf8"));

// The editions, oldest first. A failing case that rests on rules a release
// after October 2021 introduced is counted by that release (`since`).
export const EDITIONS = [...PROFILES].reverse();
export const RELEASES = EDITIONS.slice(1);
// "September2026" as prose: "September 2026".
export const editionName = (edition) => edition.replace(/(\d{4})$/, " $1");
const editionIndex = (edition) => EDITIONS.indexOf(edition);
// The release after `edition`.
const nextEdition = (edition) => EDITIONS[editionIndex(edition) + 1];
// The later and the earliest of releases; undefined is October 2021 (no
// `since`).
const later = (a, b) => (a === undefined ? b : b === undefined ? a : editionIndex(a) > editionIndex(b) ? a : b);
const earliest = (labels) => (labels.length === 0 || labels.some((l) => l === undefined) ? undefined : labels.reduce((a, b) => (editionIndex(a) < editionIndex(b) ? a : b)));

// [id, title, level, sections, notes]. Every check has a `basis`, quoting
// the sentences it rests on (September 2026's text). `since` marks a check
// whose rule a release after October 2021 introduced, and `feature` names
// it. `profileNotes` says how a check is graded under an older release's
// profile.
const DESCRIPTIVE = 'Appendix A: "Conformance requirements are described in this document via both descriptive assertions and key words with clearly defined meanings."';
export const CHECKS = [
  [
    "envelope",
    "The response is a well-formed execution result: data, errors only as a non-empty list, extensions a map, nothing else",
    "MUST",
    ["7.1.1", "7.1.7", "7.1.8"],
    {
      basis:
        '§7.1: "An execution result must be a map." "If any errors are raised during operation execution, the execution result must contain an entry with key errors. The value of this entry must be a non-empty list". "The extensions entry in an execution result or request error result, if set, must have a map as its value." "the execution result and request error result maps must not contain any entries other than those described above."',
    },
  ],
  [
    "executes",
    "The query executes, and its result has exactly the fields it selects, nulls included",
    "MUST",
    ["4.2"],
    {
      basis:
        '§4.2: "The schema introspection system is accessible from the meta-fields __schema and __type which are accessible from the type of the root of a query operation", with "__schema: __Schema!". Each field the kit selects is one §4.2 defines, so a request error, an execution error, a crash, or a result without a selected field fails to return what those definitions say each field returns.',
    },
  ],
  [
    "roots",
    "queryType, mutationType and subscriptionType are the root operation types",
    "MUST",
    ["4.2.1", "3.3.1"],
    {
      basis: `§4.2.1: "queryType is the root type of a query operation." "mutationType is the root type of a mutation operation, if supported. Otherwise null." The same for subscriptionType. ${DESCRIPTIVE}`,
    },
  ],
  [
    "types",
    "types is the set of all named types",
    "MUST",
    ["4.2.1"],
    {
      basis:
        '§4.2.1: "types must return the set of all named types contained within this schema. Any named type which can be found through a field of any introspection type must be included in this set." A type a field, argument, interface, union or root reaches, left out, or a type the schema doesn\'t have, fails this check. A type the document defines but nothing reaches is unreferencedTypes.',
    },
  ],
  [
    "unreferencedTypes",
    "types includes, and __type(name:) finds, a type the document defines that nothing references",
    "SHOULD",
    ["4.2.1"],
    {
      basis:
        '§4.2.1: "types must return the set of all named types contained within this schema. Any named type which can be found through a field of any introspection type must be included in this set." The second sentence is about types found through fields; whether a type the document defines that no root, field, argument, interface, union or directive argument reaches is "contained within this schema" isn\'t settled by the text, which doesn\'t define the phrase. The plain reading is that a schema built from a document contains every type the document defines, so leaving one out is graded at the weaker level, a SHOULD.',
    },
  ],
  [
    "builtinScalars",
    "types has the built-in scalars the schema references, and no others",
    "MUST",
    ["3.5", "4.2.1"],
    {
      basis:
        '§3.5: "When returning the set of types from the __Schema introspection type, all referenced built-in scalars must be included. If a built-in scalar type is not referenced anywhere in a schema (there is no field, argument, or input field of that type) then it must not be included."',
    },
  ],
  [
    "typeByName",
    "__type(name:) returns the named type, and null for a name the schema doesn't have",
    "MUST",
    ["4.2"],
    {
      basis:
        '§4.2: "The schema introspection system is accessible from the meta-fields __schema and __type which are accessible from the type of the root of a query operation", with "__type(name: String!): __Type". The spec gives no more prose for __type, so the kit takes its answer to be the named type\'s entry in types (§4.2.1: "types must return the set of all named types contained within this schema"), and null, which its nullable type allows, for a name no type has. A type the document defines that nothing references is unreferencedTypes.',
    },
  ],
  [
    "typeKinds",
    "Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included",
    "MUST",
    ["4.2.2"],
    {
      basis:
        '§4.2.2, for each kind: "kind must return __TypeKind.OBJECT" (and so on) and "All other fields must return {null}." For List and Non-Null: "ofType must return a type of any kind." isOneOf, new in September 2025, is part of "all other fields" since then.',
    },
  ],
  [
    "fields",
    "An object's or interface's fields, with their types",
    "MUST",
    ["4.2.2", "4.2.3"],
    {
      basis:
        '§4.2.2: "fields must return the set of fields that can be selected for this type." §4.2.3: "type must return a __Type that represents the type of value returned by this field."',
    },
  ],
  [
    "arguments",
    "Field and directive arguments, with their types",
    "MUST",
    ["4.2.3", "4.2.4", "4.2.6"],
    {
      basis: `§4.2.3: "args returns a List of __InputValue representing the arguments this field accepts." §4.2.6: "args returns a List of __InputValue representing the arguments this directive accepts." §4.2.4: "type must return a __Type that represents the type this input value expects." ${DESCRIPTIVE}`,
    },
  ],
  [
    "defaultValue",
    "defaultValue is null for an input value without a default, and otherwise null or an encoding of the default",
    "MUST",
    ["4.2.4"],
    {
      basis: `§4.2.4: "defaultValue may return a String encoding (using the GraphQL language) of the default value used by this input value in the condition a value is not provided at runtime. If this input value has no default value, returns null." A string that encodes another value, or one for an input value without a default, contradicts that. ${DESCRIPTIVE}`,
    },
  ],
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
  [
    "defaultValuePrinting",
    "A default value's strings are printed with control characters escaped, and supplementary characters, if escaped, as \\u{…}",
    "SHOULD",
    ["2.10.4", "4.2.4"],
    {
      since: "September2025",
      feature: "rule on producing a StringValue",
      basis:
        '§2.10.4: "When producing a StringValue, implementations should use escape sequences to represent non-printable control characters (U+0000 to U+001F and U+007F to U+009F)." "If an implementation chooses to escape a supplementary character, it should only use a variable-width unicode escape sequence." §4.2.4: "defaultValue may return a String encoding (using the GraphQL language) of the default value". So a string in the encoding that has a control character unescaped, or a surrogate pair of fixed-width escapes, fails this check. A block string can\'t escape anything, so one that holds a control character (a line feed included) fails it too. September 2025 introduced both sentences; the value the encoding stands for is graded by defaultValue.',
    },
  ],
  [
    "inputFields",
    "An input object's inputFields, with their types",
    "MUST",
    ["4.2.2", "4.2.4"],
    { basis: '§4.2.2: "inputFields must return the set of input fields as a list of __InputValue." §4.2.4: "type must return a __Type that represents the type this input value expects."' },
  ],
  [
    "enumValues",
    "An enum's enumValues",
    "MUST",
    ["4.2.2", "4.2.5"],
    { basis: '§4.2.2: "enumValues must return the set of enum values as a list of __EnumValue."' },
  ],
  [
    "interfaces",
    "interfaces, and possibleTypes for unions and interfaces",
    "MUST",
    ["4.2.2"],
    {
      basis: `§4.2.2: "interfaces must return the set of interfaces that an object implements (if none, interfaces must return the empty set)." For a union, "possibleTypes returns the list of types that can be represented within this union", and for an interface, "possibleTypes returns the list of types that implement this interface". ${DESCRIPTIVE}`,
    },
  ],
  [
    "deprecation",
    "isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something",
    "MUST",
    ["4.2.3", "4.2.4", "4.2.5", "4.2.6", "3.13", "3.13.3"],
    {
      profileNotes: {
        September2025: "September 2025 deprecates fields, arguments, input fields and enum values, but not directives, so this check covers no directive.",
        October2021:
          'October 2021 deprecates only fields and enum values, so this check covers those, and a null deprecationReason for a deprecated one fails deprecationReasonOmitted, a SHOULD, since October 2021 says "deprecationReason optionally provides a reason".',
      },
      basis: `§4.2.3: "isDeprecated returns true if this field should no longer be used, otherwise false." "deprecationReason returns the reason why this field is deprecated, or null if this field is not deprecated." (likewise §4.2.4 to §4.2.6), and each list "Accepts the argument includeDeprecated which defaults to false. If true, deprecated fields are also returned." ${DESCRIPTIVE} §3.13: "GraphQL implementations that support the type system definition language must provide the @deprecated directive if representing deprecated portions of the schema." The reason of an item deprecated without one is the default of the service's own @deprecated(reason:); a default that differs from §3.13.3's fails builtinDefinitions only. September 2025 has the same sentences for fields, arguments, input fields and enum values (its §4.2.6 has no isDeprecated on __Directive, which is new in September 2026). October 2021 has them for fields and enum values only, and says "deprecationReason optionally provides a reason why this field is deprecated", so under the October 2021 profile a null reason is deprecationReasonOmitted.`,
    },
  ],
  [
    "deprecationReasonOmitted",
    "Under the October 2021 profile, a deprecated field or enum value has its reason, rather than null",
    "SHOULD",
    ["4.2.3", "4.2.5"],
    {
      basis:
        'October 2021 §4.2.3 and §4.2.5: "deprecationReason optionally provides a reason why this field is deprecated." That makes the reason optional, where September 2025 and September 2026 say "returns the reason why this field is deprecated" (a MUST, under deprecation). The intent is plainly that the reason the schema gives is returned, which makes null a SHOULD here; another string still fails deprecation.',
    },
  ],
  [
    "specifiedByURL",
    "specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null",
    "MUST",
    ["4.2.2", "3.13.4"],
    {
      basis:
        '§4.2.2: "specifiedByURL may return a String (in the form of a URL) for custom scalars, otherwise must be null." A URL other than the one @specifiedBy gives, or a URL on a built-in scalar, fails this check. Null for a scalar the document gives a URL is specifiedByURLOmitted.',
    },
  ],
  [
    "specifiedByURLOmitted",
    "specifiedByURL returns the URL @specifiedBy gives a custom scalar, rather than null, when the service provides @specifiedBy",
    "SHOULD",
    ["4.2.2", "3.13.4"],
    {
      basis:
        '§4.2.2: "specifiedByURL may return a String (in the form of a URL) for custom scalars, otherwise must be null." By Appendix A, a lowercase "may" keeps its RFC 2119 meaning, so returning the URL is optional; the intent is plainly that the URL @specifiedBy gives is returned, which makes null a SHOULD, as for defaultValueOmitted. A service that doesn\'t provide @specifiedBy at all fails builtinDirectives instead.',
    },
  ],
  [
    "isOneOf",
    "isOneOf is true exactly for OneOf input objects",
    "MUST",
    ["4.2.2", "3.10.1"],
    {
      since: "September2025",
      feature: "OneOf input objects",
      basis: '§4.2.2: "isOneOf must return true when representing a OneOf Input Object, otherwise false." September 2025 introduced OneOf Input Objects (§3.10.1) and isOneOf with this sentence.',
    },
  ],
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
    {
      basis:
        '§4.2.1: "directives must return the set of all directives available within this schema including all built-in directives." §3.13: "When introspecting a GraphQL service all provided directives, including any built-in directive, must be included in the set of returned directives." §4.2.6: "locations returns a List of __DirectiveLocation representing the valid locations this directive may be placed", and "isRepeatable must return a Boolean that indicates if the directive may be used repeatedly at a single location." A directive\'s argument "must accept a type where IsInputType(argumentType) returns true" (§3.13, Type Validation).',
    },
  ],
  [
    "builtinDirectives",
    "@skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object",
    "SHOULD",
    ["3.13", "3.13.1", "3.13.2", "3.13.4", "3.13.5"],
    {
      basis:
        '§3.13: "GraphQL implementations should provide the @skip and @include directives." "GraphQL implementations that support the type system definition language should provide the @specifiedBy directive if representing custom scalar definitions." "... should provide the @oneOf directive if representing OneOf Input Objects." @oneOf is new in September 2025.',
    },
  ],
  [
    "builtinDefinitions",
    "The introspection types and built-in directives are as the spec defines them, with nothing left out or changed",
    "MUST",
    ["4.2", "3.13"],
    {
      basis: `§4.2 gives the introspection types with "Below are the full set of type system definitions providing schema introspection, which are fully defined in the sections below", and the sections below say what each field returns ("kind must return __TypeKind.OBJECT", "isRepeatable must return a Boolean", "args returns a List of __InputValue"). A field, argument or enum value left out, or with another type, can't return what they say. §3.13: "A built-in directive is any directive defined within this specification", each with its definition (§3.13.1 to §3.13.5). ${DESCRIPTIVE} Where only the Non-Null wrapping differs, and the result accepts or returns everything the spec's would, the difference is builtinNullability; an addition is builtinAdditions.`,
    },
  ],
  [
    "builtinNullability",
    "The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them",
    "SHOULD",
    ["4.2", "3.13"],
    {
      basis:
        'The Non-Null wrapping of the introspection fields and arguments, and of the built-in directives\' arguments, is given only by the definitions (§4.2 introduces them with "Below are the full set of type system definitions providing schema introspection, which are fully defined in the sections below", and §3.13.3 has "directive @deprecated(reason: String! = \\"No longer supported\\")"), which have no key word. The prose says what each field returns ("isRepeatable must return a Boolean") and, of each includeDeprecated, only "Accepts the argument includeDeprecated which defaults to false". A field whose type differs only in Non-Null can still return exactly that, and an argument that is nullable where the spec has Non-Null, with the same default, accepts every value the spec\'s does. So these are graded at the weaker level. An argument that is Non-Null where the spec\'s is nullable rejects requests the spec accepts, and stays under builtinDefinitions.',
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
    "Under an older release's profile, a built-in definition that differs from that release's is as a later release defines it",
    "INFO",
    ["4.2", "3.13"],
    {
      basis:
        "The kit grades September 2026, the latest release; the September 2025 and October 2021 profiles are for a service whose introspection types September 2026's query can't ask. A built-in definition (or an addition) that is exactly as a later release defines it breaks nothing that release requires, so it is reported here, labelled with that release, and not under builtinDefinitions or builtinAdditions.",
    },
  ],
  [
    "typename",
    "__typename names the root type, and no fields list includes it",
    "MUST",
    ["4.1"],
    {
      basis:
        '§4.1: "Type name introspection is accomplished via the meta-field __typename: String! on any Object, Interface, or Union. It returns the name of the concrete Object type at that point during operation execution." "As a meta-field, __typename is implicit and does not appear in the fields list in any defined type."',
    },
  ],
  [
    "order",
    "Fields, arguments, enum values, directives, members and interfaces come in source order",
    "SHOULD",
    ["4.2"],
    {
      since: "September2025",
      feature: "Stable Ordering",
      basis:
        '§4 "Stable Ordering": "When a schema is produced from a TypeSystemDocument, introspection should return items in the same source order for each element list: object fields, input object fields, arguments, enum values, directives, union member types, and implemented interfaces." September 2025 introduced this paragraph.',
    },
  ],
  [
    "other",
    "Anything else Introspection!Matches requires",
    "MUST",
    ["4.2"],
    { basis: "A difference Introspection!Matches finds that IntrospectChecks can't name. Matches compares with the result §4.2 defines, so a difference there is one from what §4.2's sentences require." },
  ],
].map(([id, title, level, spec, notes = {}]) => ({ id, title, level, spec, ...notes }));

// Checks a lookup vector doesn't exercise: it asks __type(name:) only.
const SCHEMA_ONLY = new Set(["roots", "types", "builtinScalars", "directives", "builtinDirectives"]);
// Checks only lookup vectors exercise.
const LOOKUP_ONLY = new Set(["typeByName"]);
// Checks the October 2021 profile doesn't grade: its query doesn't select
// isOneOf, and October 2021 has no Stable Ordering.
const NOT_OCT2021 = new Set(["isOneOf", "order", "defaultValuePrinting"]);
// Checks only the October 2021 profile grades: under the later releases'
// profiles, a null deprecationReason is a deprecation problem.
const ONLY_OCT2021 = new Set(["deprecationReasonOmitted"]);
const exercises = (vector, id, profile) => {
  if (profile === "October2021" ? NOT_OCT2021.has(id) : ONLY_OCT2021.has(id)) return false;
  // Only an older release's profile can find a built-in as a later
  // release defines it.
  if (id === "builtinEdition" && profile === PRIMARY) return false;
  if (vector.wrappers) return id === "typeKinds";
  // A probe (a request that uses @skip or @include) is about directives
  // only; an exact vector only about executing.
  if (vector.probe) return id === "directives" || id === "builtinDirectives";
  if (vector.exact) return false;
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
  if (field === "isDeprecated" || field === "deprecationReason") return (aspect === "deprecation" || aspect === "deprecationReasonOmitted") && of;
  if (field === "specifiedByURL") return aspect === field || aspect === "specifiedByURLOmitted";
  if (field === "isOneOf") return aspect === "isOneOf" || aspect === "isOneOfNull" || aspect === "wrapperIsOneOf";
  if (field === "defaultValue") return ["defaultValue", "defaultValueOmitted", "printedControl", "printedPair"].includes(aspect);
  if (field === "isRepeatable") return aspect === "isRepeatable";
  return false;
};

const ASPECT = {
  kind: "typeKinds",
  fields: "fields",
  arguments: "arguments",
  defaultValue: "defaultValue",
  defaultValueOmitted: "defaultValueOmitted",
  printedControl: "defaultValuePrinting",
  printedPair: "defaultValuePrinting",
  inputFields: "inputFields",
  enumValues: "enumValues",
  interfaces: "interfaces",
  deprecation: "deprecation",
  includeDeprecated: "deprecation",
  deprecationReasonOmitted: "deprecationReasonOmitted",
  specifiedByURL: "specifiedByURL",
  specifiedByURLOmitted: "specifiedByURLOmitted",
  isOneOf: "isOneOf",
  description: "descriptions",
  directives: "directives",
  locations: "directives",
  isRepeatable: "directives",
  roots: "roots",
  types: "types",
  unreferencedTypes: "unreferencedTypes",
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
// is a SHOULD. A problem with a built-in where the answer follows a later
// release, under an older release's profile ("edition:<release>:"), is
// informational.
export const checkOf = ([aspect, where]) => {
  if (aspect.startsWith("edition:")) return "builtinEdition";
  // An item added to an introspection type's list, or an introspection type
  // of the service's own. Added arguments of a built-in directive are
  // §3.13's, and stay with builtinDefinitions.
  if (aspect.startsWith("added:")) {
    const owner = ownerOf(where);
    return owner.builtin && !owner.directive ? "builtinAdditions" : checkOf([aspect.slice("added:".length), where]);
  }
  if (aspect === "nullability") return ownerOf(where).builtin ? "builtinNullability" : "fields";
  // An argument or input field that is nullable where the spec's is
  // Non-Null: a SHOULD for a built-in, a wrong type for the document's.
  if (aspect === "inputNullability") return ownerOf(where).builtin ? "builtinNullability" : isArgumentPlace(where) ? "arguments" : "inputFields";
  if (aspect === "wrapperFields" || aspect === "wrapperIsOneOf" || aspect === "isOneOfNull") return "typeKinds";
  if (aspect === "builtinScalars" || aspect === "builtinDirectives" || aspect === "typeByName") return aspect;
  if (aspect === "requiredDirective") return where === "@deprecated" ? "deprecation" : "directives";
  if (aspect === "unsupportedDirective") return "builtinDirectives";
  if (aspect === "serviceTypes") return "directives";
  if (aspect === "wrapper") return "typeKinds";
  if (aspect === "order" || aspect === "typename") return aspect;
  // How a default is printed, a built-in's included.
  if (aspect === "printedControl" || aspect === "printedPair") return "defaultValuePrinting";
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

// Whether a problem with a built-in definition (or an addition to one) is
// where the answer follows another edition: comparing with that edition's
// built-ins (other, its problems' keys) finds no problem there, and none
// with the built-in list it belongs to, left out or added. A built-in
// directive's list is `directives`, which holds the document's directives
// too, so it isn't consulted.
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
// - { envelope, unbuilt }: a schema rejected that uses syntax only a later
//   release's grammar has (syntax), which isn't graded;
// - { envelope, problems, matches, labels }: labels maps each problem with
//   a built-in that rests on a rule a release introduced to { since, edition,
//   follows }: the answer follows the older `edition` there (follows), or
//   that edition doesn't define it, so the rule it breaks is new in `since`,
//   the release after `edition` (builtinLabel). A problem with a built-in
//   where the answer follows a later release than the profile's instead
//   has its aspect prefixed with "edition:<that release>:", and counts
//   under builtinEdition.
const evaluate = async (schemas, cases) => {
  const results = new Array(cases.length);
  const prepared = [];
  cases.forEach((c, i) => {
    if (c.response instanceof Crash) {
      results[i] = { envelope: [], crash: c.response.message, labels: new Map() };
      return;
    }
    const envelope = envelopeProblems(c.response);
    // A request error for a schema that applies @specifiedBy or @oneOf,
    // from an implementation that answers the query for other schemas:
    // it doesn't provide the directive, which §3.13 allows.
    if (c.needs?.length && c.queryAccepted && isRequestError(c.response)) {
      results[i] = { envelope, problems: c.needs.map((n) => ["unsupportedDirective", `@${n}`]), rejected: true, labels: new Map() };
      return;
    }
    // A request error for a schema written with syntax only a later
    // release's grammar has: the schema didn't build, which says nothing
    // about introspection.
    if (c.syntax && c.queryAccepted && isRequestError(c.response)) {
      results[i] = { envelope, unbuilt: c.syntax, labels: new Map() };
      return;
    }
    try {
      // The reference gives the whole answer: judged here, as executes.
      if (c.exact) {
        const problem = exactProblem(c.response, c.expected);
        results[i] = problem ? { envelope, malformed: problem } : { envelope, problems: [], matches: true, other: {}, labels: new Map() };
        return;
      }
      const response = fillDefinitions(c.response, c.missing, c.builtins[c.profile], c.profile);
      let data;
      if (c.wrappers) {
        const type = c.wrapperType ?? "__Schema";
        data = { kind: "wrappers", wrapperType: type, ...wrappersCaseOf(response, c.profile, c.missing, type, c.wrapperDepth) };
      } else if (c.probe) data = { kind: "probe", ...probeCaseOf(c.response, c.probe) };
      else if (c.lookups) {
        const lookup = lookupCaseOf(response, c.lookups, c.profile, c.missing);
        data = { kind: "lookup", extras: [], extraTypes: [], provided: new Set([...c.provided, ...shownIn(lookup.actual)]), ...lookup };
      } else data = { kind: "schema", ...caseOf(response, c.directives, c.types, c.profile, c.missing) };
      results[i] = { envelope };
      prepared.push({ i, tla: tla(toTla({ schema: c.schema + 1, profile: c.profile, inc: c.inc, ...data })) });
    } catch (error) {
      if (!(error instanceof Malformed)) throw error;
      results[i] = { envelope, malformed: error.message };
    }
  });
  const shards = [];
  for (let k = 0; k < prepared.length; k += SHARD) shards.push(prepared.slice(k, k + SHARD));
  const schemaText = chunked("Schemas", schemas.map((s) => tla(toTla(s))));
  await pool(shards, async (shard, k) => {
    const module = `---- MODULE Shard ----
EXTENDS IntrospectChecks

${schemaText}

${chunked("Checked", shard.map((p) => p.tla), 1)}

ASSUME \\A i \\in DOMAIN Checked : PrintT(<<"verdict", i, CaseResult(Schemas[Checked[i].schema], Checked[i])>>)
${moduleFooter}`;
    const values = await evaluateModule("Shard", module, { "IntrospectChecks.tla": checksModule, "Lexer.tla": lexerModule });
    const verdicts = values.filter((v) => v[0] === "verdict");
    if (verdicts.length !== shard.length || new Set(verdicts.map((v) => v[1])).size !== shard.length) {
      throw new Error(`read ${verdicts.length} verdicts from shard ${k}, which has ${shard.length} cases`);
    }
    for (const [, n, [problems, matches, others]] of fromTla(verdicts)) {
      const { i } = shard[n - 1];
      const other = Object.fromEntries(others.map(([edition, found]) => [edition, new Set(found.map(key))]));
      Object.assign(results[i], { problems: problems.map(([aspect, where]) => [aspect, where]), matches, other });
    }
  });
  // Problems must explain the reference's verdict: none when Matches
  // holds, apart from the checks Matches doesn't make, and some when it
  // doesn't. Then the problems a missing field or argument hides are left
  // out, and problems with built-ins are labelled by release.
  results.forEach((r, i) => {
    if (r.malformed || r.rejected || r.crash || r.unbuilt) return;
    const c = cases[i];
    const graded = r.problems.filter(([aspect]) => !["typename", "builtinDirectives", "serviceTypes", "printedControl", "printedPair"].includes(aspect));
    if (r.matches && graded.length > 0) throw new Error(`kit bug: Introspection!Matches holds, but IntrospectChecks found ${JSON.stringify(graded)}`);
    const visible = r.problems.filter((p) => !c.missing.some((m) => hides(m, p, c.kindOf)));
    if (!r.matches && r.problems.length === 0) visible.push(["other", ""]);
    // October 2021 has no Stable Ordering and no rule on producing a
    // StringValue. Since September 2025, deprecationReason "returns the
    // reason": a null one is a deprecation problem. Only October 2021's
    // "optionally provides a reason" makes it deprecationReasonOmitted.
    r.problems =
      c.profile === "October2021"
        ? visible.filter(([aspect]) => !["order", "printedControl", "printedPair"].includes(aspect))
        : visible.map(([aspect, where]) => [aspect === "deprecationReasonOmitted" ? "deprecation" : aspect, where]);
    // Every check about built-in definitions is labelled the same way:
    // definitions, additions and Non-Null wrapping. A problem where the
    // answer follows a later release than the profile's is that release's
    // (builtinEdition); otherwise, one where it follows an older release,
    // or that release doesn't define the item, rests on a rule the next
    // release introduced.
    const builtinProblem = (p) => ["builtinDefinitions", "builtinAdditions", "builtinNullability"].includes(checkOf(p));
    const newer = EDITIONS.slice(editionIndex(c.profile) + 1);
    const older = EDITIONS.slice(0, editionIndex(c.profile)).reverse();
    r.labels = new Map();
    r.problems = r.problems.map((p) => {
      if (!builtinProblem(p)) return p;
      const follows = newer.find((e) => followsOther(p, r.other[e]));
      if (follows) return [`edition:${follows}:${p[0]}`, p[1]];
      const label = builtinLabel(p, older, r.other, c.builtins);
      if (label) r.labels.set(key(p), label);
      return p;
    });
  });
  return results;
};

// The label of a problem with a built-in under a profile, from the older
// editions (newest first): the first that doesn't define the item (an
// addition is never defined), or that the answer follows there, and the
// release after it, which introduced the rule the answer breaks.
const builtinLabel = (problem, older, other, builtins) => {
  const added = problem[0].startsWith("added:");
  for (const edition of older) {
    const since = nextEdition(edition);
    if (!added && !defines(builtins[edition], problem[1])) return { since, edition, follows: false };
    if (followsOther(problem, other[edition])) return { since, edition, follows: true };
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// Reporting

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const listed = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

// The check ids a result fails. A crash fails executes; a schema that
// didn't build for syntax only a later release has fails nothing but its
// envelope.
const failedChecks = (r) =>
  [...new Set([...(r.envelope.length ? ["envelope"] : []), ...(r.crash || r.malformed ? ["executes"] : r.unbuilt ? [] : r.problems.map(checkOf))])].sort();

// The release a problem rests on, or undefined if October 2021 has the
// rule it breaks too: OneOf input objects and Stable Ordering are new in
// September 2025, a built-in definition labelled by evaluate (labels) is
// new in its `since`, and one under builtinEdition is as that release
// defines it.
const problemSince = (problem, r) => {
  const [aspect, where] = problem;
  if (aspect.startsWith("edition:")) return aspect.split(":")[1];
  if (where === "@oneOf" || ["isOneOf", "isOneOfNull", "wrapperIsOneOf", "order", "printedControl", "printedPair"].includes(aspect)) return "September2025";
  return r.labels.get(key(problem))?.since;
};

// The release a set of problems on a vector rests on: the first release
// in which all of them are failures (the earliest of theirs, none if any
// has none), and no earlier than the first release whose grammar and rules
// can express the vector's schema (v.since).
const sinceOfProblems = (v, problems, r) => later(v.since, earliest(problems.map((p) => problemSince(p, r))));

// The release a result's failure of check id rests on. A crash rests on
// none (it fails in every release, whatever the vector's verdict); an
// answer that isn't the query's result, and a bad envelope, rest on the
// vector's.
const sinceFor = (v, r, id) => {
  if (r.crash) return undefined;
  if (r.malformed || id === "envelope") return v.since;
  return sinceOfProblems(v, r.problems.filter((p) => checkOf(p) === id), r);
};

// The release a whole result's failure rests on, for its finding.
const resultSince = (v, r) => {
  if (r.crash) return undefined;
  if (r.malformed || r.unbuilt || r.envelope.length > 0) return v.since;
  return sinceOfProblems(v, r.problems, r);
};

const count = (counts, release) => void (counts[release] = (counts[release] ?? 0) + 1);
const sinceWords = (release) => `${release === PRIMARY ? "new in" : "since"} ${editionName(release)}`;

// One problem in words, without the schema-specific part unless it is a
// built-in, so that the same fault groups across schemas.
const describe = (problem, vector, r, profile) => {
  const [aspect, where] = problem;
  const check = checkOf(problem);
  const graded = editionName(profile);
  const oneOf = where === "@oneOf" ? " (since September 2025)" : "";
  if (check === "builtinEdition") {
    const [, release, ...rest] = aspect.split(":");
    const base = rest.join(":");
    if (base.startsWith("added:")) {
      const noun = { "added:fields": "a field", "added:enumValues": "an enum value", "added:arguments": "an argument", "added:types": "an introspection type", "added:locations": "a location" }[base] ?? "an item";
      return `the built-in ${where} has ${noun} ${graded} doesn't define, as ${editionName(release)} does`;
    }
    return `the built-in ${where} isn't as ${graded} defines it, but is as ${editionName(release)} does (${base})`;
  }
  if (check === "builtinScalars") {
    const expected = vector.expected.response.data.__schema.types.some((t) => t.name === where);
    return expected ? `leaves out ${where}, a built-in scalar the schema references` : `includes ${where}, a built-in scalar nothing references`;
  }
  if (aspect === "builtinDirectives") {
    return vector.probe ? `answers a request that uses ${where} with errors, so doesn't provide it` : `doesn't provide ${where}${oneOf}`;
  }
  if (aspect === "unsupportedDirective") return `rejects a schema that applies ${where}, so doesn't provide it${oneOf}`;
  if (aspect === "requiredDirective") {
    if (vector.probe) return `honours ${where} in a request, but doesn't return it in directives`;
    if (where === "@deprecated") return "doesn't return @deprecated, though the schema deprecates something";
    if (where === "@specifiedBy") return "doesn't return @specifiedBy in directives, though a scalar's specifiedByURL shows it is provided";
    return "doesn't return @oneOf in directives, though an input object's isOneOf shows it is provided (since September 2025)";
  }
  if (aspect === "serviceTypes") return "a directive of the service's own takes an argument of a type that isn't an input type";
  if (aspect === "wrapper") return "a List or Non-Null type has a non-null field other than kind and ofType";
  if (aspect === "wrapperIsOneOf") return "a List or Non-Null type has a non-null isOneOf (since September 2025)";
  if (aspect === "isOneOfNull") return `${ownerOf(where).builtin ? `the built-in ${where}'s` : "a type's"} isOneOf is null for an input object, or not null for another kind (since September 2025)`;
  if (aspect === "wrapperFields") return '__type(name: "__Schema") doesn\'t return each of __Schema\'s fields once, with its type, so their wrapper types can\'t all be checked';
  if (check === "builtinAdditions") {
    const base = aspect.slice("added:".length);
    if (base === "types") return `has the introspection type ${where}, which ${graded} doesn't define`;
    const noun = { fields: "a field", enumValues: "an enum value", arguments: "an argument" }[base] ?? `an item (${base})`;
    return `the built-in ${where} has ${noun} ${graded} doesn't define`;
  }
  if (aspect === "typeByName") {
    const expected = Object.values(vector.expected.response.data).some((t) => t?.name === where);
    return expected ? "__type(name:) doesn't return a type the schema has" : "__type(name:) returns a type for a name the schema doesn't have";
  }
  const label = r.labels.get(key(problem));
  if (check === "builtinNullability") {
    const base = `the built-in ${where} has ${graded}'s type, but not its Non-Null wrapping`;
    if (!label) return base;
    return label.follows ? `${base}; it is as ${editionName(label.edition)} defines it` : `${base}; ${editionName(label.edition)} doesn't define it`;
  }
  if (check === "builtinDefinitions") {
    if (!label) return `the built-in ${where} isn't as ${graded} defines it (${aspect})`;
    if (aspect === "locations") return `the built-in ${where} lacks only locations ${editionName(label.edition)} doesn't define (${aspect})`;
    return label.follows
      ? `the built-in ${where} isn't as ${graded} defines it, but is as ${editionName(label.edition)} does (${aspect})`
      : `the built-in ${where} isn't as ${graded} defines it; ${editionName(label.edition)} doesn't define it (${aspect})`;
  }
  if (check === "typename") return where === "" ? "the root's __typename isn't the query root type's name" : "lists __typename among a type's fields";
  if (aspect === "defaultValueOmitted") return "defaultValue is null for an input value that has a default";
  if (aspect === "printedControl") return "a printed default value has a control character in a string, unescaped";
  if (aspect === "printedPair") return "a printed default value escapes a supplementary character as a surrogate pair, not as \\u{…}";
  if (aspect === "specifiedByURLOmitted") return "specifiedByURL is null for a custom scalar that has a URL, though @specifiedBy is provided";
  if (aspect === "deprecationReasonOmitted") return "deprecationReason is null for a deprecated field or enum value that has a reason";
  if (aspect === "unreferencedTypes") return vector.lookups ? "__type(name:) returns null for a type the document defines that nothing references" : "leaves out a type the document defines that nothing references";
  if (aspect === "includeDeprecated") return "a list's deprecated items don't follow includeDeprecated";
  return `${CHECKS.find((c) => c.id === check).title.replace(/^./, (x) => x.toLowerCase())}: differs from Introspection.tla`;
};

// The part of a response a problem is about: the type or directive, the
// wrapper types of one of __Schema's fields, or the schema's root fields.
const partOf = (response, [aspect, where], vector) => {
  if (vector.probe || vector.exact) return response;
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
  if (profile === "October2021" && NOT_OCT2021.has(c.id)) {
    return { note: `Not graded: the implementation answered the October 2021 query, and October 2021 has no ${c.feature}.` };
  }
  if (profile !== "October2021" && ONLY_OCT2021.has(c.id)) return { note: "Graded only under the October 2021 profile." };
  if (profile === PRIMARY && c.id === "builtinEdition") return { note: "Graded only under an older release's profile." };
  if (c.profileNotes?.[profile]) return { note: `The implementation answered the ${editionName(profile)} query, so this check is graded as ${editionName(profile)} has it: ${c.profileNotes[profile]}` };
  if (c.since) return { note: `${sinceWords(c.since).replace(/^./, (x) => x.toUpperCase())}: October 2021 has no ${c.feature}.` };
  return {};
};

// The run-level finding for the fields and arguments the introspection
// types lack: one case, under builtinDefinitions. It rests on the release
// after the newest older edition that defines none of them.
const missingFinding = (missingFields, builtins, discovery, profile) => {
  const older = EDITIONS.slice(0, editionIndex(profile)).reverse();
  const edition = older.find((e) => missingFields.every((m) => !defines(builtins[e], m)));
  const since = edition && nextEdition(edition);
  return {
    finding: {
      checks: ["builtinDefinitions"],
      summary: `the introspection types lack ${listed(missingFields)}, so the kit leaves them out of every query, and grades what it can see without them`,
      cases: 1,
      fixtures: { discovery: 1 },
      fixture: "discovery",
      problem: missingFields.join(", "),
      ...(since ? { since: { [since]: 1 } } : {}),
      example: {
        input: "the fields of each introspection type, with their arguments (the kit's IntrospectionFields query)",
        response: discovery ?? "not asked",
        expected: `the fields and arguments ${editionName(profile)} defines, including ${listed(missingFields)}`,
      },
    },
    since,
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
  const stats = new Map(CHECKS.map((c) => [c.id, { cases: 0, failing: 0, failingSince: {} }]));
  const findings = new Map();
  const notGraded = {};
  vectors.forEach((v, i) => {
    const r = results[i];
    for (const c of CHECKS) {
      const exercised =
        c.id === "envelope" ||
        (!r.unbuilt && (c.id === "executes" || (!r.malformed && !r.crash && (r.rejected ? c.id === "builtinDirectives" : exercises(v, c.id, profile)))));
      if (exercised) stats.get(c.id).cases++;
    }
    if (r.unbuilt) notGraded[r.unbuilt] = (notGraded[r.unbuilt] ?? 0) + 1;
    const failed = failedChecks(r);
    for (const id of failed) {
      const s = stats.get(id);
      s.failing++;
      const since = sinceFor(v, r, id);
      if (since) count(s.failingSince, since);
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
    const what = v.wrappers
      ? `__type(name: ${JSON.stringify(v.wrapperType ?? "__Schema")})'s fields and their types`
      : v.probe
        ? `a request that uses @${v.probe}`
        : v.exact
          ? `the query ${v.queries[PRIMARY].replace(/\s+/g, " ").trim()}`
          : v.lookups
            ? `__type(name:) for ${v.lookups.map((l) => l.name).join(", ")}${v.fragmentsOn ? `, inside fragments on ${v.fragmentsOn}` : ""}`
            : "the introspection query";
    const example = {
      input: `${v.since ? `[since ${editionName(v.since)}] ` : ""}${v.sdl.replace(/\s+/g, " ")}  (${what}${profile === PRIMARY ? "" : `, ${editionName(profile)} profile`}; includeDeprecated: ${v.includeDeprecated ? "true" : "the default"})`,
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
      since: {},
      example,
    };
    const since = resultSince(v, r);
    if (since) count(f.since, since);
    f.cases++;
    f.fixtures[v.family] = (f.fixtures[v.family] ?? 0) + 1;
    findings.set(findingKey, f);
  });
  for (const f of findings.values()) if (Object.keys(f.since).length === 0) delete f.since;
  const extra = [];
  if (missingFields.length) {
    const m = missingFinding(missingFields, builtins, discovery, profile);
    const s = stats.get("builtinDefinitions");
    s.cases++;
    s.failing++;
    if (m.since) count(s.failingSince, m.since);
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
    // The graded vectors whose schemas need a release after October 2021,
    // and how many of them fail (a crash never counts here).
    since: Object.fromEntries(
      RELEASES.map((release) => {
        const tagged = vectors.map((v, i) => [v, results[i]]).filter(([v]) => v.since === release);
        return [release, { vectors: tagged.length, failing: tagged.filter(([, r]) => !r.crash && failedChecks(r).length > 0).length }];
      }).filter(([, s]) => s.vectors > 0),
    ),
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
        ...(Object.keys(s.failingSince).length ? { failingSince: s.failingSince } : {}),
        ...(c.since ? { since: c.since } : {}),
        ...(c.levels ? { levels: c.levels } : {}),
        ...(c.basis ? { basis: c.basis } : {}),
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

// §3.13.3's default reason, and the default a service's own
// @deprecated(reason:) has, from a __schema response, where that is another
// string. The reason of an item deprecated without one is that default:
// the service's answer then agrees with the directive it describes, and
// the different default counts once, under builtinDefinitions, not again
// at every such item under deprecation.
const SPEC_REASON = "No longer supported";
const reasonDefaultOf = (response) => {
  const directives = response?.data?.__schema?.directives;
  if (!Array.isArray(directives)) return undefined;
  const args = directives.find((d) => d?.name === "deprecated")?.args;
  const reason = Array.isArray(args) ? args.find((a) => a?.name === "reason") : undefined;
  if (typeof reason?.defaultValue !== "string") return undefined;
  const value = parseDefault(reason.defaultValue);
  return value.kind === "string" && value.text !== SPEC_REASON ? value.text : undefined;
};
// The SDL with the reason written out on every @deprecated that has none,
// or null if it has no such @deprecated.
const withReason = (sdl, reason) => {
  let changed = false;
  const doc = graphql.visit(graphql.parse(sdl), {
    Directive(node) {
      if (node.name.value !== "deprecated" || (node.arguments ?? []).some((a) => a.name.value === "reason")) return undefined;
      changed = true;
      const arg = { kind: graphql.Kind.ARGUMENT, name: { kind: graphql.Kind.NAME, value: "reason" }, value: { kind: graphql.Kind.STRING, value: reason } };
      return { ...node, arguments: [...(node.arguments ?? []), arg] };
    },
  });
  return changed ? graphql.print(doc) : null;
};

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
// 1. September 2026's query. Anything but a rejection (a request error, or
//    errors with "data": null) keeps the September 2026 profile.
// 2. September 2025's query: answered, the September 2025 profile.
// 3. DISCOVERY_QUERY asks for the fields of each introspection type, and
//    their arguments. For September 2026 and September 2025, if all the
//    fields and arguments the release's query needs but the service lacks
//    are FILLABLE, the kit asks that query without them, the release whose
//    query lacks fewer first (September 2026 on a tie). Answered, that is
//    the release's profile without them.
// 4. October 2021's query: answered, the October 2021 profile.
// 5. October 2021's query without what the service lacks, if FILLABLE.
// 6. Otherwise the September 2026 profile stays, and every vector fails
//    executes.
export const chooseProfile = async (probe, askQuery) => {
  const queryOf = (profile) => probe.queries[profile];
  const first = await askQuery(queryOf(PRIMARY));
  const primary = { profile: PRIMARY, missing: [], first };
  if (!rejected(first)) return primary;
  const tried = [`${editionName(PRIMARY)}'s introspection query was rejected ("${firstError(first.response)}")`];
  const exact = async (profile) => {
    const answer = await askQuery(queryOf(profile));
    if (answered(answer)) {
      return { profile, missing: [], first: answer, note: `${tried.join("; ")}. ${editionName(profile)}'s was answered, so this run grades against ${editionName(profile)}.` };
    }
    tried.push(`so was ${editionName(profile)}'s${hasResponse(answer) ? ` ("${firstError(answer.response)}")` : ""}`);
    return null;
  };
  const sep2025 = await exact("September2025");
  if (sep2025) return sep2025;
  const fields = await askQuery(DISCOVERY_QUERY);
  const discovery = hasResponse(fields) ? fields.response : undefined;
  const present = discovery === undefined ? null : presentFields(discovery);
  const without = async (profile, missing) => {
    const edition = editionName(profile);
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
    // With nothing missing, a release's query is one that was rejected.
    const candidates = ["September2026", "September2025"]
      .map((profile) => ({ profile, missing: lacking(present, profile) }))
      .filter((c) => c.missing.length > 0)
      .sort((x, y) => x.missing.length - y.missing.length);
    for (const c of candidates) {
      const got = await without(c.profile, c.missing);
      if (got) return got;
    }
  } else tried.push("the fields of the introspection types couldn't be read");
  if (queryOf("October2021")) {
    const old = await exact("October2021");
    if (old) return { ...old, discovery };
    if (present) {
      const missing = lacking(present, "October2021");
      if (missing.length > 0) {
        const got = await without("October2021", missing);
        if (got) return got;
      }
    }
  }
  return { ...primary, note: `${tried.join("; ")}. So this run grades against ${editionName(PRIMARY)}.`, discovery };
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
    const kinds = new Map(PROFILES.flatMap((p) => builtins[p].types).map((t) => [t.name, t.kind]));
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
  // A case whose service gives @deprecated(reason:) another default
  // (reasonDefault) is judged against its schema with that reason written
  // out wherever the document leaves it to the default (withReason).
  const schemas = [...data];
  const reasoned = new Map();
  const schemaFor = (v, reasonDefault) => {
    const i = sdls.indexOf(v.sdl);
    if (reasonDefault === undefined) return i;
    const k = `${i}\u0000${reasonDefault}`;
    if (!reasoned.has(k)) {
      const sdl = withReason(v.sdl, reasonDefault);
      reasoned.set(k, sdl === null ? i : schemas.push(schemaData(sdl)) - 1);
    }
    return reasoned.get(k);
  };
  const caseFor = (v, response, { profile, queryAccepted, provided, missing = [], reasonDefault }) => {
    const S = docOf(v);
    return {
      schema: schemaFor(v, reasonDefault),
      profile,
      inc: v.includeDeprecated,
      response,
      directives: S.directives.map((d) => d.name),
      types: S.types.map((t) => t.name),
      lookups: v.lookups,
      wrappers: v.wrappers,
      wrapperType: v.wrapperType,
      wrapperDepth: v.wrapperDepth,
      probe: v.probe,
      exact: v.exact,
      expected: v.expected.response,
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
  // Under an older release's profile, a vector whose schema that release
  // can't express isn't asked.
  const graded = vectors.filter((v) => v.queries[profile]);
  for (const v of vectors.filter((x) => !x.queries[profile])) {
    const why = `${sinceWords(v.since)} (${editionName(profile)} profile)`;
    skipped[why] = (skipped[why] ?? 0) + 1;
  }

  // The vector's query for the profile, without what the service lacks.
  const queryOf = (v) => {
    if (missing.length && !v.probe && !v.exact) {
      if (v.wrappers) return wrappersQuery(profile, missing, v.wrapperType, v.wrapperDepth);
      return v.lookups ? lookupQuery(profile, v.lookups, v.includeDeprecated, missing, v.fragmentsOn) : schemaQuery(profile, v.includeDeprecated, missing);
    }
    return v.queries[profile];
  };
  const answers = [first];
  for (const v of graded.slice(1)) answers.push(await ask(v.sdl, queryOf(v)));
  const responseOfFamily = (family) => {
    const a = answers[graded.findIndex((v) => v.id === `${family}.inc`)];
    return hasResponse(a) ? a.response : undefined;
  };
  const responseOf = (a) => (a instanceof Crash ? a : a?.response);

  // The self-test's cases (kit/introspect/controls.mjs), for every profile:
  // each vector's expected response, which must pass; another vector's,
  // which must fail; and responses broken on purpose, each of which must
  // fail its check.
  const controls = CONTROLS(all, builtins);
  const cases = [
    ...answers.map((a, i) => {
      const v = graded[i];
      const provided = v.lookups ? providedIn(v, responseOfFamily(v.family), profile, missing) : undefined;
      const reasonDefault = reasonDefaultOf(v.lookups ? responseOfFamily(v.family) : responseOf(a));
      return caseFor(v, responseOf(a), { profile, queryAccepted, provided, missing, reasonDefault });
    }),
    ...controls.map((c) =>
      caseFor(c.vector, c.response, {
        profile: c.profile,
        queryAccepted: true,
        provided: c.provided,
        missing: c.missing,
        reasonDefault: c.vector.lookups ? undefined : reasonDefaultOf(c.response),
      }),
    ),
  ];
  const results = await evaluate(schemas, cases);
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
    // since: the release each failing check rests on (null: none).
    if (c.since !== undefined && !wrong) {
      for (const id of failed) {
        const got = sinceFor(c.vector, r, id) ?? null;
        if (got !== c.since) problems.push(`${c.name} (${c.vector.id}, ${c.profile}): ${id} should rest on ${c.since ?? "no release after October 2021"}, not ${got ?? "none"}`);
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
  // A field the service lacks counts once per run, under builtinDefinitions,
  // labelled by the release after the newest older one that lacks it too.
  const missingCases = [
    [PRIMARY, ["__Type.specifiedByURL"], undefined],
    [PRIMARY, ["__Directive.isDeprecated", "__Schema.directives(includeDeprecated:)"], "September2026"],
    [PRIMARY, ["__Type.isOneOf", "__Directive.isDeprecated"], "September2025"],
    ["September2025", ["__Type.isOneOf"], "September2025"],
  ];
  for (const [p, missingFields, since] of missingCases) {
    const counted = buildReport({ vectors: [], builtins, answers: [], results: [], strict, implementation: "", capabilities: [], selfTestText: "", adapterProblems: 0, profile: p, missingFields });
    const once = counted.checks.find((x) => x.id === "builtinDefinitions");
    const label = Object.keys(once.failingSince ?? {});
    if (once.failing !== 1 || counted.findings.length !== 1 || label.join() !== (since ?? "")) {
      problems.push(`missing ${missingFields.join(", ")} under ${p} isn't counted once, under builtinDefinitions, ${since ? `as ${sinceWords(since)}` : "in every release"}`);
    }
  }
  for (const p of problems) log(`✗ self-test: ${p}`);
  const negative = controls.filter((c) => c.check !== "pass").length + profileControls.length + missingCases.length;
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
    `${passing === gradedCount ? "✓" : "✗"} ${passing} of ${gradedCount} introspection results satisfy Introspection.tla (${editionName(profile)} profile)${should}${crashed ? `; ${crashed} crashed` : ""}${unbuilt ? `; ${unbuilt} not graded (the schema didn't build: syntax only a later release has)` : ""}`,
  );
  const since = (f) =>
    f.since
      ? `, ${Object.entries(f.since)
          .map(([release, n]) => `${n === f.cases ? "all" : n} ${sinceWords(release)}`)
          .join(", ")}`
      : "";
  for (const f of report.findings) log(`  ✗ ${f.summary} (${plural(f.cases, f.fixture === "discovery" ? "run" : "result")}${since(f)}, e.g. ${f.fixture})`);
  if (problems.length === 0) log(`✓ the checker catches all ${negative} negative controls`);
  const failing = report.checks.filter((c) => c.status === "fail" && (c.level === "MUST" || (strict && c.level === "SHOULD")));
  const ok = problems.length === 0 && adapterProblems === 0 && failing.length === 0 && gradedCount > 0;
  return { ok, report };
};
