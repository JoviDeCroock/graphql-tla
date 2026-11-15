// Writes kit/schema/vectors.json: minimal pairs of SDL schemas, each
// judged by TypeSystem!Verdict (specs/TypeSystem.tla) with tla-ts.
//
// Every pair below is an invalid schema that should break exactly one
// rule and a valid sibling one small edit away. The script keeps a pair
// only if the reference agrees: the invalid schema's verdict is exactly
// that rule, and the sibling's is empty. Otherwise it fails, so a pair
// can't silently test something else. graphql-js only parses the SDL.
// Two pairs may share their invalid schema; it becomes one vector, with
// both valid siblings in `siblings`, so it isn't graded twice.
//
// The schemas come from scripts/differential-type-system.mjs (its
// hand-written cases and scenario families), from the spec's own
// examples, which specs/TypeSystemVectors.tla also checks, and a few
// written here for what the differential doesn't generate: types the
// document doesn't define, two schema definitions, and directives applied
// where they aren't declared (TypeSystem.tla's optional schemaDefinitions
// and uses, from kit/schema/tla.mjs's schemaVerdictData).
//
// The expected answers are September 2026's. A vector whose verdict or
// SDL syntax October 2021 doesn't have gets `since`, the first release
// whose text gives its verdict, with the features in `editionNote`:
//   - syntax: @oneOf, and @deprecated on an argument or input field, are
//     September 2025's; directives on a directive definition are September
//     2026's;
//   - an invalid schema that breaks a rule October 2021 doesn't have
//     (kit/schema/rules.mjs SINCE) is valid there, so it relies on the
//     release that brought the rule. Its valid sibling doesn't, unless it
//     uses new syntax: dropping a rule can't make a valid schema invalid;
//   - a schema whose validity under September 2025 differs
//     (TypeSystem!VerdictSeptember2025: only the input object cycle rule
//     changed, graphql-spec #1211) relies on September 2026. October 2021
//     has September 2025's cycle rule word for word.
//
// A vector whose verdict rests on a reading of the spec that its formal
// text doesn't settle gets `unspecified`, with the reason (unspecifiedOf
// below). The kit doesn't grade it.
//
// Usage: node scripts/generate-vectors-schema.mjs [--check]

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as graphql from "graphql17";
import { RELEASES, RULE, RULES, UNWRITABLE, releaseName } from "../kit/schema/rules.mjs";
import { chunked, evaluateModule, moduleFooter, pool, schemaVerdictData, tla } from "../kit/schema/tla.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const out = join(root, "kit/schema/vectors.json");

// [family, rule, invalid, valid, origin]. Families are the differential's
// scenarios: names, root, typeUse, defaults, implementation, union, enum,
// input, directive. `origin` marks the spec's own examples.
const PAIRS = [
  // §3.3 Schema
  ["names", "TYPE_NAMES_UNIQUE", "scalar A scalar A type Query { a: A }", "scalar A scalar B type Query { a: A }"],
  ["names", "TYPE_NAME_NOT_BUILTIN", "scalar String type Query { a: Int }", "scalar Str type Query { a: Int }"],
  ["names", "TYPE_NAME_NOT_BUILTIN", "type Int { a: String } type Query { a: String }", "type Int2 { a: String } type Query { a: String }"],
  ["names", "TYPE_NAME_RESERVED", "type __T { a: Int } type Query { t: __T }", "type _T { a: Int } type Query { t: _T }"],
  ["names", "DIRECTIVE_NAMES_UNIQUE", "directive @d on FIELD directive @d on FIELD type Query { a: Int }", "directive @d on FIELD directive @e on FIELD type Query { a: Int }"],
  ["names", "DIRECTIVE_NAME_RESERVED", "directive @__d on FIELD type Query { a: Int }", "directive @_d on FIELD type Query { a: Int }"],
  // Both definitions name the same root, so the roots are the same however
  // a reader takes two definitions.
  ["root", "SCHEMA_DEFINITION_UNIQUE", "schema { query: Query } schema { query: Query } type Query { a: Int }", "schema { query: Query } type Query { a: Int }"],
  // §3.3.1 Root Operation Types
  ["root", "QUERY_ROOT_PROVIDED", "type Q { a: Int }", "type Query { a: Int }"],
  ["root", "QUERY_ROOT_PROVIDED", "schema { mutation: M } type M { a: Int }", "schema { query: M } type M { a: Int }"],
  ["root", "ROOT_TYPES_ARE_OBJECTS", "interface Query { a: Int }", "type Query { a: Int }"],
  [
    "root",
    "ROOT_TYPES_ARE_OBJECTS",
    "type Query { a: Int } interface Mutation { a: Int }",
    "schema { query: Query } type Query { a: Int } interface Mutation { a: Int }",
    "§3.3.1: a valid schema without a mutation root operation type, even though it contains a type named Mutation",
  ],
  ["root", "ROOT_TYPES_ARE_OBJECTS", "schema { query: Q mutation: In } type Q { a: Int } input In { a: Int }", "schema { query: Q } type Q { a: Int } input In { a: Int }"],
  // Types the document doesn't define (TypeSystem!UnknownType): no Object
  // type, no output or input type, no interface.
  ["root", "ROOT_TYPES_ARE_OBJECTS", "schema { query: Missing } type Q { a: Int }", "schema { query: Q } type Q { a: Int }"],
  [
    "root",
    "ROOT_TYPES_DIFFERENT",
    "schema { query: Query mutation: Query } type Query { a: Int } type M { a: Int }",
    "schema { query: Query mutation: M } type Query { a: Int } type M { a: Int }",
  ],
  [
    "root",
    "ROOT_TYPES_DIFFERENT",
    "schema { query: Q subscription: Q } type Q { a: Int } type S { a: Int }",
    "schema { query: Q subscription: S } type Q { a: Int } type S { a: Int }",
  ],
  // §3.6 Objects and §3.7 Interfaces
  ["typeUse", "FIELDS_DEFINED", "type Query { a: Int } type Empty", "type Query { a: Int } type Empty { e: Int }"],
  ["typeUse", "FIELDS_DEFINED", "type Query { a: Int } interface I", "type Query { a: Int } interface I { a: Int }"],
  ["names", "FIELD_NAMES_UNIQUE", "type Query { a: Int a: Int }", "type Query { a: Int b: Int }"],
  ["names", "FIELD_NAMES_UNIQUE", "type Query { a: I } interface I { x: Int x: String }", "type Query { a: I } interface I { x: Int y: String }"],
  // The same with an object type that implements I, so an implementation
  // that rejects an interface nothing implements (Hot Chocolate does) can't
  // pass the invalid schema for that reason.
  [
    "names",
    "FIELD_NAMES_UNIQUE",
    "type Query implements I { a: I x: Int y: Int } interface I { x: Int x: Int }",
    "type Query implements I { a: I x: Int y: Int } interface I { x: Int y: Int }",
  ],
  ["names", "FIELD_NAME_RESERVED", "type Query { __a: Int }", "type Query { _a: Int }"],
  ["typeUse", "FIELD_OUTPUT_TYPE", "input In { x: Int } type O { x: Int } type Query { a: In }", "input In { x: Int } type O { x: Int } type Query { a: O }"],
  [
    "typeUse",
    "FIELD_OUTPUT_TYPE",
    "type Query { a: Int } type O { in: [In] } input In { x: Int }",
    "type Query { a: Int } type O { in(x: [In]): Int } input In { x: Int }",
    "§3.10: input objects are never valid outputs",
  ],
  ["typeUse", "FIELD_OUTPUT_TYPE", "type O { x: Int } type Query { a: Missing }", "type O { x: Int } type Query { a: O }"],
  ["names", "ARG_NAME_RESERVED", "type Query { f(__x: Int): Int }", "type Query { f(_x: Int): Int }"],
  ["names", "ARG_NAME_RESERVED", "directive @d(__x: Int) on FIELD type Query { a: Int }", "directive @d(_x: Int) on FIELD type Query { a: Int }"],
  ["names", "ARG_NAMES_UNIQUE", "type Query { f(x: Int, x: Int): Int }", "type Query { f(x: Int, y: Int): Int }"],
  ["names", "ARG_NAMES_UNIQUE", "directive @d(x: Int, x: Int) on FIELD type Query { a: Int }", "directive @d(x: Int, y: Int) on FIELD type Query { a: Int }"],
  ["typeUse", "ARG_INPUT_TYPE", "type Query { f(x: Query): Int }", "type Query { f(x: Int): Int }"],
  ["typeUse", "ARG_INPUT_TYPE", "union U = Query type Query { f(x: [U!]): Int }", "enum U { A } type Query { f(x: [U!]): Int }"],
  ["typeUse", "ARG_INPUT_TYPE", "directive @d(x: Query) on FIELD type Query { a: Int }", "directive @d(x: Int) on FIELD type Query { a: Int }"],
  ["typeUse", "ARG_INPUT_TYPE", "input In { x: Int } type Query { f(x: [Missing]): Int }", "input In { x: Int } type Query { f(x: [In]): Int }"],
  [
    "typeUse",
    "REQUIRED_ARG_NOT_DEPRECATED",
    "type Query { f(oldArg: String! @deprecated): Int }",
    "type Query { f(oldArg: String @deprecated): Int }",
    "§3.13.3: a required argument must first be made optional, by making its type nullable",
  ],
  [
    "typeUse",
    "REQUIRED_ARG_NOT_DEPRECATED",
    "type Query { f(oldArg: String! @deprecated): Int }",
    'type Query { f(oldArg: String! = "s" @deprecated): Int }',
    "§3.13.3: a required argument must first be made optional, by adding a default value",
  ],
  ["typeUse", "REQUIRED_ARG_NOT_DEPRECATED", "type Query { a: I } interface I { f(x: Int! @deprecated): Int }", "type Query { a: I } interface I { f(x: Int @deprecated): Int }"],
  ["typeUse", "REQUIRED_ARG_NOT_DEPRECATED", "directive @d(x: Int! @deprecated) on FIELD type Query { a: Int }", "directive @d(x: Int @deprecated) on FIELD type Query { a: Int }"],
  // The interface pair again, with an object type that implements I (see
  // FIELD_NAMES_UNIQUE above). The object's own argument isn't deprecated.
  [
    "typeUse",
    "REQUIRED_ARG_NOT_DEPRECATED",
    "type Query implements I { a: I f(x: Int!): Int } interface I { f(x: Int! @deprecated): Int }",
    "type Query implements I { a: I f(x: Int!): Int } interface I { f(x: Int! = 1 @deprecated): Int }",
  ],
  // Default values (§3.6 rule 2.4.5) and literal coercion
  ["defaults", "ARG_DEFAULT_COMPATIBLE", 'type Query { f(x: Int = "1"): Int }', "type Query { f(x: Int = 1): Int }"],
  ["defaults", "ARG_DEFAULT_COMPATIBLE", "type Query { f(x: Int = 1.5): Int }", "type Query { f(x: Float = 1.5): Int }"],
  ["defaults", "ARG_DEFAULT_COMPATIBLE", "type Query { f(x: Int! = null): Int }", "type Query { f(x: Int = null): Int }"],
  ["defaults", "ARG_DEFAULT_COMPATIBLE", "type Query { f(x: [Int!] = [1, null]): Int }", "type Query { f(x: [Int!] = [1, 2]): Int }"],
  [
    "defaults",
    "ARG_DEFAULT_COMPATIBLE",
    'enum Color { RED BLUE } type Query { f(c: Color = "RED"): Int }',
    "enum Color { RED BLUE } type Query { f(c: Color = RED): Int }",
    "§3.9: string literals must not be accepted as an enum input",
  ],
  [
    "defaults",
    "ARG_DEFAULT_COMPATIBLE",
    "input Point { x: Int! y: Int } type Query { f(p: Point = {y: 1}): Int }",
    "input Point { x: Int! y: Int } type Query { f(p: Point = {x: 1}): Int }",
    "§3.12: a required input field the default leaves out (\"If an argument or input-object field of a Non-Null type is not provided ... a request error must be raised\"); §3.10's coercion table shows the same case",
  ],
  [
    "defaults",
    "ARG_DEFAULT_COMPATIBLE",
    "input Point { x: Int! y: Int } type Query { f(p: Point = {x: 1, z: 1}): Int }",
    "input Point { x: Int! y: Int } type Query { f(p: Point = {x: 1, y: 1}): Int }",
    "§3.10's coercion table: an unexpected field",
  ],
  [
    "defaults",
    "ARG_DEFAULT_COMPATIBLE",
    'input Pick @oneOf { a: Int b: String } type Query { f(p: Pick = {a: 1, b: "s"}): Int }',
    "input Pick @oneOf { a: Int b: String } type Query { f(p: Pick = {a: 1}): Int }",
    "§3.10.1's coercion table: exactly one key must be specified",
  ],
  [
    "defaults",
    "ARG_DEFAULT_COMPATIBLE",
    "input Pick @oneOf { a: Int b: String } type Query { f(p: Pick = {a: null}): Int }",
    "input Pick @oneOf { a: Int b: String } type Query { f(p: Pick = {a: 2}): Int }",
    "§3.10.1's coercion table: the member field must be non-null",
  ],
  [
    "defaults",
    "ARG_DEFAULT_COMPATIBLE",
    "type Query { f(x: Float = 1e400): Int }",
    "type Query { f(x: Float = 1.5): Int }",
    "§3.5.2: a value not representable by finite IEEE 754 must raise a request error",
  ],
  // IsValidImplementation
  ["implementation", "IMPLEMENTS_UNIQUE", "interface I { a: Int } type Query implements I & I { a: Int }", "interface I { a: Int } type Query implements I { a: Int }"],
  ["implementation", "IMPLEMENTS_INTERFACES", "type O { a: Int } type Query implements O { a: Int }", "interface O { a: Int } type Query implements O { a: Int }"],
  ["implementation", "IMPLEMENTS_INTERFACES", "interface O { a: Int } type Query implements Missing { a: Int }", "interface O { a: Int } type Query implements O { a: Int }"],
  ["implementation", "IMPLEMENTS_ITSELF", "interface A implements A { x: Int } type Query { a: A }", "interface A { x: Int } type Query { a: A }"],
  // The same with an object type that implements A, so an implementation
  // that rejects an interface nothing implements (Hot Chocolate does) can't
  // pass the invalid schema for that reason.
  [
    "implementation",
    "IMPLEMENTS_ITSELF",
    "interface A implements A { x: Int } type Query implements A { x: Int a: A }",
    "interface A { x: Int } type Query implements A { x: Int a: A }",
  ],
  [
    "implementation",
    "IMPL_TRANSITIVE",
    "interface Node { id: ID } interface Resource implements Node { id: ID url: String } type Image implements Resource { id: ID url: String } type Query { i: Image }",
    "interface Node { id: ID } interface Resource implements Node { id: ID url: String } type Image implements Resource & Node { id: ID url: String } type Query { i: Image }",
    "§3.7: Image must also declare that it implements Node",
  ],
  [
    "implementation",
    "IMPL_TRANSITIVE",
    "interface A implements B { x: Int } interface B implements A { x: Int } type Query { a: A }",
    "interface A implements B { x: Int } interface B { x: Int } type Query { a: A }",
  ],
  // The same cycle with an object type that implements both interfaces (see
  // FIELD_NAMES_UNIQUE above): §3.7's "Interface definitions must not contain
  // cyclic references nor implement themselves".
  [
    "implementation",
    "IMPL_TRANSITIVE",
    "interface A implements B { x: Int } interface B implements A { x: Int } type Query implements A & B { x: Int a: A }",
    "interface A implements B { x: Int } interface B { x: Int } type Query implements A & B { x: Int a: A }",
  ],
  ["implementation", "IMPL_FIELD_PROVIDED", "interface I { f: Int } type Query implements I { g: Int }", "interface I { f: Int } type Query implements I { f: Int }"],
  ["implementation", "IMPL_ARG_PROVIDED", "interface I { f(a: Int): Int } type Query implements I { f: Int }", "interface I { f(a: Int): Int } type Query implements I { f(a: Int): Int }"],
  ["implementation", "IMPL_ARG_INVARIANT", "interface I { f(a: Int): Int } type Query implements I { f(a: Int!): Int }", "interface I { f(a: Int): Int } type Query implements I { f(a: Int): Int }"],
  ["implementation", "IMPL_ARG_INVARIANT", "interface I { f(a: [Int!]): Int } type Query implements I { f(a: [Int]): Int }", "interface I { f(a: [Int!]): Int } type Query implements I { f(a: [Int!]): Int }"],
  ["implementation", "IMPL_EXTRA_ARG_OPTIONAL", "interface I { f: Int } type Query implements I { f(b: Int!): Int }", "interface I { f: Int } type Query implements I { f(b: Int): Int }"],
  ["implementation", "IMPL_FIELD_COVARIANT", "interface I { f: [Int] } type Query implements I { f: Int }", "interface I { f: [Int] } type Query implements I { f: [Int!]! }"],
  ["implementation", "IMPL_FIELD_COVARIANT", "interface I { f: Int! } type Query implements I { f: Int }", "interface I { f: Int } type Query implements I { f: Int! }"],
  [
    "implementation",
    "IMPL_FIELD_COVARIANT",
    "interface Node { f: Node } type Other { x: Int } type Query implements Node { f: Other }",
    "interface Node { f: Node } type Other { x: Int } type Query implements Node { f: Query }",
  ],
  [
    "implementation",
    "IMPL_FIELD_COVARIANT",
    "interface I { f: U } union U = A type A { x: Int } type B { x: Int } type Query implements I { f: B }",
    "interface I { f: U } union U = A type A { x: Int } type B { x: Int } type Query implements I { f: A }",
  ],
  ["implementation", "IMPL_DEPRECATION", "interface I { f: Int } type Query implements I { f: Int @deprecated }", "interface I { f: Int @deprecated } type Query implements I { f: Int @deprecated }"],
  // §3.8 Unions
  ["union", "UNION_MEMBERS_DEFINED", "union U type Query { u: U }", "union U = Query type Query { u: U }"],
  ["union", "UNION_MEMBERS_UNIQUE", "union U = Query | Query type Query { u: U }", "union U = Query type Query { u: U }"],
  ["union", "UNION_MEMBERS_OBJECTS", "union U = Int type Query { u: U }", "union U = Query type Query { u: U }"],
  ["union", "UNION_MEMBERS_OBJECTS", "interface I { x: Int } union U = I type Query { u: U }", "type I { x: Int } union U = I type Query { u: U }"],
  ["union", "UNION_MEMBERS_OBJECTS", "union U = Query | V union V = Query type Query { u: U }", "union U = Query union V = Query type Query { u: U }"],
  ["union", "UNION_MEMBERS_OBJECTS", "union U = Query | Missing type Query { u: U }", "union U = Query type Query { u: U }"],
  // §3.9 Enums
  ["enum", "ENUM_VALUES_DEFINED", "enum E type Query { e: E }", "enum E { A } type Query { e: E }"],
  ["enum", "ENUM_VALUES_UNIQUE", "enum E { A A } type Query { e: E }", "enum E { A B } type Query { e: E }"],
  ["enum", "ENUM_VALUE_NAME_RESERVED", "enum E { __A } type Query { e: E }", "enum E { _A } type Query { e: E }"],
  // §3.10 Input Objects
  ["input", "INPUT_FIELDS_DEFINED", "input In type Query { f(i: In): Int }", "input In { x: Int } type Query { f(i: In): Int }"],
  ["input", "INPUT_FIELD_NAMES_UNIQUE", "input In { x: Int x: Int } type Query { f(i: In): Int }", "input In { x: Int y: Int } type Query { f(i: In): Int }"],
  ["input", "INPUT_FIELD_NAME_RESERVED", "input In { __x: Int } type Query { f(i: In): Int }", "input In { _x: Int } type Query { f(i: In): Int }"],
  ["input", "INPUT_FIELD_INPUT_TYPE", "input In { x: Query } type Query { f(i: In): Int }", "input In { x: Int } type Query { f(i: In): Int }"],
  ["input", "INPUT_FIELD_INPUT_TYPE", "input In { x: Missing } type Query { f(i: In): Int }", "input In { x: Int } type Query { f(i: In): Int }"],
  ["input", "REQUIRED_INPUT_FIELD_NOT_DEPRECATED", "input In { x: Int! @deprecated } type Query { f(i: In): Int }", "input In { x: Int! = 1 @deprecated } type Query { f(i: In): Int }"],
  ["input", "ONEOF_FIELD_NULLABLE", "input In @oneOf { a: Int! } type Query { f(i: In): Int }", "input In @oneOf { a: Int } type Query { f(i: In): Int }"],
  ["input", "ONEOF_FIELD_NO_DEFAULT", 'input In @oneOf { a: Int = 1 b: String } type Query { f(i: In): Int }', "input In @oneOf { a: Int b: String } type Query { f(i: In): Int }"],
  [
    "input",
    "INPUT_OBJECT_UNBREAKABLE_CYCLE",
    "input Example { self: Example! value: String } type Query { f(e: Example): Int }",
    "input Example { self: Example value: String } type Query { f(e: Example): Int }",
    "§3.10: a nullable self-reference is valid, a non-null one is not",
  ],
  [
    "input",
    "INPUT_OBJECT_UNBREAKABLE_CYCLE",
    "input Example { self: Example! value: String } type Query { f(e: Example): Int }",
    "input Example { self: [Example!]! value: String } type Query { f(e: Example): Int }",
    "§3.10: a list breaks the cycle",
  ],
  [
    "input",
    "INPUT_OBJECT_UNBREAKABLE_CYCLE",
    "input First { second: Second! value: String } input Second { first: First! value: String } type Query { f(e: First): Int }",
    "input First { second: Second! value: String } input Second { first: First value: String } type Query { f(e: First): Int }",
    "§3.10: First and Second each require the other",
  ],
  [
    "input",
    "INPUT_OBJECT_UNBREAKABLE_CYCLE",
    "input First @oneOf { second: Second } input Second { first: First! } type Query { f(e: First): Int }",
    "input First @oneOf { second: Second value: String } input Second { first: First! } type Query { f(e: First): Int }",
    "§3.10: a OneOf input object breaks the cycle only with a field that does",
  ],
  ["input", "INPUT_OBJECT_UNBREAKABLE_CYCLE", "input A @oneOf { b: B } input B @oneOf { a: A } type Query { f(a: A): Int }", "input A @oneOf { b: B } input B @oneOf { a: [A] } type Query { f(a: A): Int }"],
  ["input", "INPUT_OBJECT_DEFAULT_VALUE_CYCLE", "input I { i: I = {} } type Query { f(i: I): Int }", "input I { i: I = {i: null} } type Query { f(i: I): Int }"],
  ["input", "INPUT_OBJECT_DEFAULT_VALUE_CYCLE", "input I { i: I = {i: {}} } type Query { f(i: I): Int }", "input I { i: I = {i: {i: null}} } type Query { f(i: I): Int }"],
  ["input", "INPUT_OBJECT_DEFAULT_VALUE_CYCLE", "input I { i: [I] = [{}] } type Query { f(i: I): Int }", "input I { i: [I] = [] } type Query { f(i: I): Int }"],
  [
    "input",
    "INPUT_OBJECT_DEFAULT_VALUE_CYCLE",
    "input A { b: B = {} } input B { a: A = {} } type Query { f(a: A): Int }",
    "input A { b: B = {} } input B { a: A = {b: null} } type Query { f(a: A): Int }",
  ],
  // §3.13 Directives
  [
    "directive",
    "DIRECTIVE_USES_ITSELF",
    "directive @invalidExample(arg: String @invalidExample) on ARGUMENT_DEFINITION type Query { a: Int }",
    "directive @invalidExample(arg: String) on ARGUMENT_DEFINITION type Query { a: Int }",
    "§3.13: @invalidExample references itself directly",
  ],
  // The same uses, with directives also allowed on input fields, so an
  // implementation that takes a directive's arguments for input fields
  // (graphql-ruby does) can't reject them for the location.
  [
    "directive",
    "DIRECTIVE_USES_ITSELF",
    "directive @d(arg: String @d) on ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION type Query { a: Int }",
    "directive @d(arg: String) on ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION type Query { a: Int }",
  ],
  [
    "directive",
    "DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY",
    "directive @d(a: In) on INPUT_FIELD_DEFINITION input In { f: Int @d } type Query { a(x: In): Int }",
    "directive @d(a: In) on INPUT_FIELD_DEFINITION input In { f: Int } type Query { a(x: In): Int }",
  ],
  [
    "directive",
    "DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY",
    "directive @d(a: Int @e) on ARGUMENT_DEFINITION directive @e(b: Int @d) on ARGUMENT_DEFINITION type Query { a: Int }",
    "directive @d(a: Int @e) on ARGUMENT_DEFINITION directive @e(b: Int) on ARGUMENT_DEFINITION type Query { a: Int }",
  ],
  [
    "directive",
    "DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY",
    "directive @d(c: Color) on ENUM_VALUE enum Color { RED @d BLUE } type Query { a: Color }",
    "directive @d(c: Color) on ENUM_VALUE enum Color { RED BLUE } type Query { a: Color }",
  ],
  [
    "directive",
    "DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY",
    "directive @d(a: Int @e) on ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION directive @e(b: Int @d) on ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION type Query { a: Int }",
    "directive @d(a: Int @e) on ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION directive @e(b: Int) on ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION type Query { a: Int }",
  ],
  // §3.13: "Directives must only be used in the locations they are declared
  // to belong in." A directive no definition declares, and no service is
  // likely to provide, belongs nowhere.
  [
    "directive",
    "DIRECTIVES_DEFINED",
    "type Query @undefinedInThisSchema { a: Int }",
    "directive @undefinedInThisSchema on OBJECT type Query @undefinedInThisSchema { a: Int }",
  ],
  ["directive", "DIRECTIVES_DEFINED", "type Query { a: Int @undefinedInThisSchema }", "type Query { a: Int @deprecated }"],
  ["directive", "DIRECTIVE_LOCATIONS_VALID", "directive @d on FIELD type Query { a: Int @d }", "directive @d on FIELD_DEFINITION type Query { a: Int @d }"],
  ["directive", "DIRECTIVE_LOCATIONS_VALID", "directive @d on FIELD_DEFINITION type Query @d { a: Int }", "directive @d on OBJECT type Query @d { a: Int }"],
  ["directive", "DIRECTIVE_LOCATIONS_VALID", "type Query @deprecated { a: Int }", "type Query { a: Int @deprecated }"],
];

// Invalid schemas whose verdict depends on a reading the spec's formal
// text doesn't settle, and why. Their valid siblings are valid under every
// reading, and are still graded.
//
// `scalar String` and the like: §3.3 says "No provided type may have a
// name which conflicts with any built in types", and §3.5 says "When
// representing a GraphQL schema using the type system definition language,
// all built-in scalars must be omitted for brevity". The second sentence
// binds whoever prints SDL. Whether a schema that declares a built-in
// scalar anyway provides a conflicting type, or just names the built-in,
// the spec doesn't say. `type Int { … }` is a different kind of type with
// a built-in's name, and stays graded.
const BUILTIN_SCALARS = new Set(["Int", "Float", "String", "Boolean", "ID"]);
const BUILTIN_SCALAR_DECLARED =
  "§3.5 says built-in scalars \"must be omitted for brevity\" from SDL, which binds whoever prints it. Whether a schema that declares one anyway, as `scalar String`, provides a type that conflicts with the built-in (§3.3), and must be rejected, or just names the built-in, the spec doesn't say. TypeSystem.tla reads it as a conflict.";
const declaresBuiltinScalar = (sdl) =>
  graphql.parse(sdl).definitions.some((d) => d.kind === "ScalarTypeDefinition" && BUILTIN_SCALARS.has(d.name.value));
const SELF_REFERENCE_THROUGH_ARGUMENT =
  "§3.13 rule 3 forbids a directive definition to contain the use of a directive that leads back to it. This definition uses no directive: it reaches itself only through its own argument's type. The prose, \"While defining a directive, it must not reference itself directly or indirectly\", forbids it, and TypeSystem.tla follows the prose, but the formal rule doesn't.";
// `type Query { a: Int } interface Mutation { a: Int }`: no normative
// sentence makes a type named Mutation the mutation root of a schema that
// omits its schema definition. §3.3.1 says the definition "can omit the
// schema definition when each root operation type uses its respective
// default root type name, no other type uses any default root type name,
// and the schema does not have a description", a condition on writing the
// SDL. Only an example says a type named Mutation "would be incorrectly
// presumed to be the mutation root operation type", and October 2021 has
// neither that clause nor that example.
const PRESUMED_ROOT =
  "No normative sentence says what the mutation root is when the schema definition is omitted and a type named Mutation isn't an object type. §3.3.1 only says the definition \"can omit the schema definition when each root operation type uses its respective default root type name, no other type uses any default root type name, and the schema does not have a description\", a condition on writing SDL. The reading that Mutation is the mutation root, an interface, and so the schema is invalid, rests on an example's \"would be incorrectly presumed to be the mutation root operation type\". October 2021 has neither the \"no other type\" clause nor that example, and its text allows reading the schema as one with no mutation root, which is valid. TypeSystem.tla follows the example.";
const UNSPECIFIED = {
  "type Query { a: Int } interface Mutation { a: Int }": PRESUMED_ROOT,
  "directive @d(a: In) on INPUT_FIELD_DEFINITION input In { f: Int @d } type Query { a(x: In): Int }": SELF_REFERENCE_THROUGH_ARGUMENT,
  "directive @d(c: Color) on ENUM_VALUE enum Color { RED @d BLUE } type Query { a: Color }": SELF_REFERENCE_THROUGH_ARGUMENT,
};
const unspecifiedOf = (rule, sdl) =>
  UNSPECIFIED[sdl] ?? (rule === "TYPE_NAME_NOT_BUILTIN" && declaresBuiltinScalar(sdl) ? BUILTIN_SCALAR_DECLARED : undefined);

const SHARD = 60;

// The syntax an SDL document uses that October 2021 doesn't have, as
// [release, feature] pairs.
const newSyntax = (sdl) => {
  const out = [];
  const deprecated = (node) => (node.directives ?? []).some((d) => d.name.value === "deprecated");
  for (const def of graphql.parse(sdl).definitions) {
    if ((def.directives ?? []).some((d) => d.name.value === "oneOf")) out.push(["September2025", "OneOf input objects"]);
    if (def.kind === "DirectiveDefinition" && (def.directives ?? []).length > 0) out.push(["September2026", "directives on directive definitions"]);
    const args = def.kind === "DirectiveDefinition" ? (def.arguments ?? []) : (def.fields ?? []).flatMap((f) => f.arguments ?? []);
    if (args.some(deprecated)) out.push(["September2025", "deprecated arguments"]);
    if (def.kind === "InputObjectTypeDefinition" && (def.fields ?? []).some(deprecated)) out.push(["September2025", "deprecated input fields"]);
  }
  return out;
};

const ONEOF_INHABITABILITY =
  "OneOf inhabitability, InputObjectHasUnbreakableCycle (September 2025's rule, \"at least one of the fields in the chain of references must be either a nullable or a List type\", accepts this schema)";

// `since` and `editionNote` for a vector, if October 2021 doesn't give
// its verdict. `verdict2025` is TypeSystem!VerdictSeptember2025.
const sinceOf = (rule, sdl, valid, verdict2025) => {
  const features = newSyntax(sdl);
  if (rule.since && !valid) features.push([rule.since, rule.feature]);
  if ((verdict2025.length === 0) !== valid) features.push(["September2026", rule.rule === "INPUT_OBJECT_UNBREAKABLE_CYCLE" ? ONEOF_INHABITABILITY : `September 2026's ${rule.rule}`]);
  if (features.length === 0) return {};
  const since = RELEASES.filter((r) => features.some(([f]) => f === r)).at(-1);
  const note = RELEASES.map((r) => [r, [...new Set(features.filter(([f]) => f === r).map(([, what]) => what))].sort()])
    .filter(([, what]) => what.length > 0)
    .map(([r, what]) => `new in ${releaseName(r)}: ${what.join(", ")}`)
    .join("; ");
  return { since, editionNote: note };
};

const generate = async () => {
  const sdls = PAIRS.flatMap(([, , invalid, valid]) => [invalid, valid]);
  const data = sdls.map(schemaVerdictData);
  const shards = [];
  for (let i = 0; i < data.length; i += SHARD) shards.push(data.slice(i, i + SHARD));
  const results = await pool(shards, async (shard, k) => {
    const module = `---- MODULE SchemaVerdicts ----
EXTENDS TypeSystem

${chunked("Schemas", shard.map(tla))}

ASSUME \\A i \\in DOMAIN Schemas : PrintT(<<"verdict", i, Verdict(Schemas[i]), VerdictSeptember2025(Schemas[i])>>)
${moduleFooter}`;
    const values = await evaluateModule("SchemaVerdicts", module);
    const verdicts = values.filter((v) => v[0] === "verdict");
    if (verdicts.length !== shard.length) throw new Error(`read ${verdicts.length} verdicts from shard ${k}, which has ${shard.length} schemas`);
    return verdicts.sort((a, b) => a[1] - b[1]).map((v) => [v[2].sort(), v[3].sort()]);
  });
  const verdicts = results.flat().map(([v]) => v);
  const verdicts2025 = results.flat().map(([, v]) => v);

  const problems = [];
  const vectors = [];
  const count = new Map();
  // An invalid schema listed in more than one pair, with different valid
  // siblings, is one vector: its first pair's. The later siblings name it
  // as their pair, and it lists them all in `siblings`.
  const invalidVector = new Map();
  PAIRS.forEach(([family, rule, invalid, valid, origin], p) => {
    const r = RULE.get(rule);
    if (!r) throw new Error(`unknown rule ${rule}`);
    const [bad, good] = [verdicts[2 * p], verdicts[2 * p + 1]];
    const [bad2025, good2025] = [verdicts2025[2 * p], verdicts2025[2 * p + 1]];
    if (bad.length !== 1 || bad[0] !== rule) problems.push(`${rule}: expected the invalid schema to break only ${rule}, the reference says ${JSON.stringify(bad)}:\n  ${invalid}`);
    if (good.length !== 0) problems.push(`${rule}: expected the sibling to be valid, the reference says ${JSON.stringify(good)}:\n  ${valid}`);
    const n = (count.get(rule) ?? 0) + 1;
    count.set(rule, n);
    const base = `${r.id}.${n}`;
    const common = { spec: r.spec, family, rule, ...(origin ? { origin } : {}) };
    const why = unspecifiedOf(rule, invalid);
    const unspecified = why ? { unspecified: why } : {};
    const seen = invalidVector.get(`${rule}\u0000${invalid}`);
    if (seen) {
      seen.siblings = [...(seen.siblings ?? [seen.pair]), `${base}.valid`];
      vectors.push({ id: `${base}.valid`, ...common, ...sinceOf(r, valid, true, good2025), pair: seen.id, sdl: valid, verdict: good, expected: { valid: true } });
      return;
    }
    const vector = { id: `${base}.invalid`, ...common, ...sinceOf(r, invalid, false, bad2025), ...unspecified, pair: `${base}.valid`, sdl: invalid, verdict: bad, expected: { valid: false } };
    invalidVector.set(`${rule}\u0000${invalid}`, vector);
    vectors.push(vector, { id: `${base}.valid`, ...common, ...sinceOf(r, valid, true, good2025), pair: `${base}.invalid`, sdl: valid, verdict: good, expected: { valid: true } });
  });
  const unused = Object.keys(UNSPECIFIED).filter((sdl) => !PAIRS.some(([, , invalid]) => invalid === sdl));
  for (const sdl of unused) problems.push(`UNSPECIFIED names a schema no pair has:\n  ${sdl}`);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  const untested = RULES.filter((r) => !count.has(r.rule) && !UNWRITABLE[r.rule]).map((r) => r.rule);
  if (untested.length > 0) throw new Error(`no pair breaks ${untested.join(", ")}`);
  return {
    source:
      "Generated by scripts/generate-vectors-schema.mjs from specs/TypeSystem.tla: each expected answer is TypeSystem!Verdict, evaluated by tla-ts. Don't edit.",
    vectors,
  };
};

const text = `${JSON.stringify(await generate(), null, 2)}\n`;
if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(out, "utf8");
  } catch {}
  if (current !== text) {
    console.error("✗ kit/schema/vectors.json is out of date: run node scripts/generate-vectors-schema.mjs");
    process.exit(1);
  }
  console.log("✓ kit/schema/vectors.json matches TypeSystem.tla");
} else {
  writeFileSync(out, text);
  const { vectors } = JSON.parse(text);
  const n = vectors.length;
  const unspecified = vectors.filter((v) => v.unspecified).length;
  const since = RELEASES.map((r) => `${vectors.filter((v) => v.since === r).length} since ${releaseName(r)}`).join(", ");
  const pairs = vectors.filter((v) => v.expected.valid).length;
  console.log(`wrote ${n} vectors (${pairs} minimal pairs, ${n - pairs} invalid schemas) to kit/schema/vectors.json: ${unspecified} unspecified, ${since}`);
}
