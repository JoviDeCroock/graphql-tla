// The introspect area's self-test: responses built from the reference's
// expected ones, which the checker must judge as stated, under both
// profiles. Each vector's own expected response must pass, another
// vector's must fail, and each response broken on purpose must fail the
// check it targets ("only": that check and no other). A few changes the
// spec allows must pass, so that the checker isn't stricter than the spec
// either. PROFILE_CONTROLS script the probe's answers, and the profile
// run.mjs's chooseProfile picks from them must be as stated.

import { Crash } from "../areas.mjs";
import { fullResponse } from "./data.mjs";
import { DISCOVERY_ALIASES, DISCOVERY_QUERY, PROFILES, TYPE_REF_DEPTH, neededArgs, neededFields, schemaQuery } from "./query.mjs";

const clone = (x) => JSON.parse(JSON.stringify(x));

const named = (name) => ({ kind: "SCALAR", name, ofType: null });

const nonNull = (ofType) => ({ kind: "NON_NULL", name: null, ofType });
const inputValue = (name, type) => ({ name, description: null, type, defaultValue: null, isDeprecated: false, deprecationReason: null });
const scalarType = (name) => ({
  kind: "SCALAR",
  name,
  description: null,
  specifiedByURL: null,
  isOneOf: null,
  fields: null,
  inputFields: null,
  interfaces: null,
  enumValues: null,
  possibleTypes: null,
});
const wrapperOf = (d, name) => d.wrappers.fields.find((f) => f.name === name).type;
// A change that replaces the whole response.
const replacing = (f) => Object.assign(f, { replaces: true });
const rejected = replacing(() => ({ errors: [{ message: "Unknown directive" }] }));
const executionFailure = replacing(() => ({ data: null, errors: [{ message: "executor bug", path: ["__schema"] }] }));
const crash = replacing(() => new Crash("NoMethodError: undefined method 'map' for an instance of Integer"));
// A response from a service without the field `owner`.`name`
// (__Type.specifiedByURL, __Type.isOneOf or __Directive.isRepeatable): the
// field is gone from the answers and from the introspection type's own
// fields.
const lacks = (owner, name) => (s, d) => {
  const items = owner === "__Type" ? (s ? s.types : Object.values(d).filter(Boolean)) : s.directives;
  for (const x of items) delete x[name];
  if (s) {
    const t = type(s, owner);
    t.fields = t.fields.filter((f) => f.name !== name);
  }
};
// A __schema response from a service whose __Schema.directives takes no
// includeDeprecated: the argument is gone from __Schema's definition, and
// the deprecated directives from the answer, as the default would have it.
const lacksDirectivesArgument = (s) => {
  const f = field(s, "__Schema", "directives");
  f.args = f.args.filter((a) => a.name !== "includeDeprecated");
  s.directives = s.directives.filter((d) => !d.isDeprecated);
};
const extraField = (name) => ({ name, description: null, args: [], type: named("String"), isDeprecated: false, deprecationReason: null });
const extraValue = (name) => ({ name, description: null, isDeprecated: false, deprecationReason: null });
const serviceDirective = (args) => ({ name: "extra", description: null, isRepeatable: false, locations: ["FIELD"], args, isDeprecated: false, deprecationReason: null });
const dropDirectives = (...names) => (s) => (s.directives = s.directives.filter((d) => !names.includes(d.name)));

// [vector id, name, the check it must fail ("pass": none), change,
// options]. change gets the response's __schema (for a __schema vector),
// its data, and the response; `rejected` answers with errors instead.
// Options: only (no other check may fail), profile (default "draft"), and
// provided (for a lookup: the built-in directives the service returned for
// the schema's __schema).
const BROKEN = [
  ["rich.inc", "reorders an object's fields", "order", (s) => type(s, "Q").fields.reverse()],
  ["rich.inc", "drops an enum value", "enumValues", (s) => type(s, "E").enumValues.shift()],
  ["rich.inc", "loses an argument's Non-Null wrapper", "arguments", (s) => (field(s, "M", "m").args[0].type = { kind: "INPUT_OBJECT", name: "Pick", ofType: null })],
  ["interfaces.inc", "loses a field's Non-Null wrapper", "fields", (s) => (field(s, "Node", "id").type = named("ID"))],
  ["rich.inc", "drops a type", "types", (s) => s.types.splice(s.types.findIndex((t) => t.name === "A"), 1)],
  ["rich.inc", "reports a deprecated field as not deprecated", "deprecation", (s) => Object.assign(field(s, "Q", "old"), { isDeprecated: false, deprecationReason: null })],
  [
    "rich.defaults",
    "returns a deprecated field when includeDeprecated is false",
    "deprecation",
    (s) =>
      type(s, "Q").fields.push({
        name: "old",
        description: null,
        args: [],
        type: named("String"),
        isDeprecated: true,
        deprecationReason: "gone",
      }),
  ],
  ["rich.inc", "changes a default value", "defaultValue", (s) => (field(s, "Q", "a").args[0].defaultValue = "4"), { only: true }],
  ["defaults.inc", "gives a default to an input value without one", "defaultValue", (s) => (type(s, "I").inputFields.find((x) => x.name === "b").defaultValue = "0"), { only: true }],
  // §4.2.4: "defaultValue may return a String encoding"
  ["defaults.inc", "returns null for a default of null", "defaultValueOmitted", (s) => (field(s, "Query", "f").args.find((x) => x.name === "n").defaultValue = null), { only: true }],
  ["rich.inc", "returns null for a default of 3", "defaultValueOmitted", (s) => (field(s, "Q", "a").args[0].defaultValue = null), { only: true }],
  ["order.inc", "reorders a type's interfaces", "order", (s) => type(s, "O").interfaces.reverse()],
  ["order.inc", "reorders a field's arguments", "order", (s) => field(s, "Query", "m").args.reverse()],
  ["rich.inc", "reorders a union's possible types", "order", (s) => type(s, "U").possibleTypes.reverse()],
  ["rich.inc", "gives an object possibleTypes", "typeKinds", (s) => (type(s, "A").possibleTypes = []), { draftOnly: false }],
  [
    "rich.inc",
    "lists __typename as a field",
    "typename",
    (s) =>
      type(s, "A").fields.push({
        name: "__typename",
        description: null,
        args: [],
        type: { kind: "NON_NULL", name: null, ofType: named("String") },
        isDeprecated: false,
        deprecationReason: null,
      }),
  ],
  ["rich.inc", "drops a built-in scalar it references", "builtinScalars", (s) => s.types.splice(s.types.findIndex((t) => t.name === "Int"), 1)],
  ["rich.inc", "adds a built-in scalar nothing references", "builtinScalars", (s) => s.types.push({ ...clone(type(s, "Int")), name: "Float" })],
  ["oneOf.inc", "drops isOneOf", "isOneOf", (s) => (type(s, "Pick").isOneOf = false)],
  ["scalars.inc", "drops specifiedByURL", "specifiedByURL", (s) => (type(s, "Date").specifiedByURL = null)],
  ["rich.inc", "changes a built-in directive's locations", "builtinDefinitions", (s) => directive(s, "skip").locations.pop()],
  ["rich.inc", "changes an introspection field's type", "builtinDefinitions", (s) => (field(s, "__Type", "fields").type = field(s, "__Type", "fields").type.ofType)],
  ["minimal.inc", "names the wrong type in the root's __typename", "typename", (s, d) => (d.__typename = "Mutation")],
  // §3.13's conditions on the built-in directives
  ["rich.inc", "doesn't provide @include", "builtinDirectives", dropDirectives("include")],
  ["minimal.inc", "doesn't provide @skip", "builtinDirectives", dropDirectives("skip")],
  ["rich.inc", "doesn't provide @deprecated, in a schema that deprecates something", "deprecation", dropDirectives("deprecated")],
  ["deprecation.defaults", "doesn't provide @deprecated, in a schema that only deprecates", "deprecation", dropDirectives("deprecated")],
  ["rich.inc", "doesn't provide @specifiedBy, in a schema with a custom scalar without a URL", "builtinDirectives", dropDirectives("specifiedBy"), { only: true }],
  // A directive the result shows is provided must be returned (§3.13).
  ["scalars.inc", "doesn't return @specifiedBy, though Date has a URL", "directives", dropDirectives("specifiedBy"), { only: true }],
  ["oneOf.inc", "doesn't return @oneOf, though Pick is OneOf", "directives", dropDirectives("oneOf"), { only: true, draftOnly: true }],
  ["scalars.inc", "doesn't return @specifiedBy, and gives Date another URL", ["directives", "specifiedByURL"], (s) => {
    dropDirectives("specifiedBy")(s);
    type(s, "Date").specifiedByURL = "https://example.com/other";
  }],
  // One that doesn't provide @specifiedBy or @oneOf can't represent them.
  [
    "scalars.inc",
    "doesn't provide @specifiedBy, and so reports no URL",
    "builtinDirectives",
    (s) => {
      dropDirectives("specifiedBy")(s);
      type(s, "Date").specifiedByURL = null;
    },
    { only: true },
  ],
  [
    "oneOf.inc",
    "doesn't provide @oneOf, and so reports Pick as a plain input object",
    "builtinDirectives",
    (s) => {
      dropDirectives("oneOf")(s);
      type(s, "Pick").isOneOf = false;
    },
    { only: true },
  ],
  ["scalars.lookup", "doesn't provide @specifiedBy, and so reports no URL, for __type(name:)", "pass", (s, d) => (d.t0.specifiedByURL = null), { provided: ["skip", "include", "deprecated", "oneOf"] }],
  // A lookup's URL shows @specifiedBy is provided, whatever the __schema
  // answer returned: it is graded against the document.
  ["scalars.lookup", "reports Date's URL for __type(name:), though the __schema answer has no @specifiedBy", "pass", () => {}, { provided: ["skip", "include", "deprecated", "oneOf"] }],
  ["scalars.lookup", "reports another URL for __type(name:), though the __schema answer has no @specifiedBy", "specifiedByURL", (s, d) => (d.t0.specifiedByURL = "https://example.com/other"), { only: true, provided: ["skip", "include", "deprecated", "oneOf"] }],
  ["scalars.inc", "rejects a schema that applies @specifiedBy", "builtinDirectives", rejected, { only: true }],
  ["oneOf.inc", "rejects a schema that applies @oneOf", "builtinDirectives", rejected, { only: true }],
  ["rich.inc", "rejects a schema that needs no optional directive", "executes", rejected],
  ["defaults.inc", "crashes (the adapter answers with an error)", "executes", crash, { only: true }],
  ["inputDeprecation.inc", "crashes on a draft-only schema", "executes", crash, { only: true, draftOnly: true }],
  // A schema with syntax only the draft's grammar has: a request error isn't
  // graded, data: null is.
  ["directiveDeprecation.inc", "rejects a schema that applies a directive to a directive definition", "pass", rejected, { unbuilt: true }],
  ["directiveDeprecation.inc", "fails executing a schema that applies a directive to a directive definition, with data: null", "executes", executionFailure, { only: true }],
  // data: null with errors is an execution failure, not a request error.
  ["scalars.inc", "fails executing a schema that applies @specifiedBy, with data: null", "executes", executionFailure, { only: true }],
  ["minimal.inc", "doesn't provide @deprecated, @specifiedBy or @oneOf, in a schema with no use for them", "pass", dropDirectives("deprecated", "specifiedBy", "oneOf")],
  ["deprecation.inc", "doesn't provide @specifiedBy or @oneOf, in a schema without custom scalars or OneOf inputs", "pass", dropDirectives("specifiedBy", "oneOf")],
  ["rich.inc", "leaves out the mutation root type", "roots", (s) => (s.mutationType = null)],
  ["rich.inc", "drops an input field", "inputFields", (s) => type(s, "In").inputFields.splice(1, 1)],
  ["interfaces.inc", "drops an implemented interface", "interfaces", (s) => type(s, "Image").interfaces.pop()],
  ["rich.inc", "says a repeatable directive isn't", "directives", (s) => (directive(s, "label").isRepeatable = false)],
  ["rich.inc", "drops one of the schema's directives", "directives", (s) => s.directives.splice(s.directives.findIndex((x) => x.name === "label"), 1)],
  ["rich.inc", "changes a description", "descriptions", (s) => (type(s, "Q").description = "Another root"), { only: true }],
  ["rich.inc", "drops the schema's description", "descriptions", (s) => (s.description = null), { only: true }],
  ["scalars.inc", "drops a scalar's description", "descriptions", (s) => (type(s, "Date").description = null), { only: true }],
  // §4.2: "description may return a String or null"
  ["rich.inc", 'describes an undescribed scalar as ""', "pass", (s) => (type(s, "Date").description = "")],
  ["rich.inc", "describes an undescribed type with a description of its own", "pass", (s) => (type(s, "A").description = "An A")],
  [
    "directiveDeprecation.defaults",
    "returns a deprecated directive when includeDeprecated is false",
    "deprecation",
    (s) =>
      s.directives.unshift({ name: "old", description: null, isRepeatable: false, locations: ["FIELD"], args: [], isDeprecated: true, deprecationReason: "Use @new" }),
  ],
  // Allowed by the spec
  [
    "rich.inc",
    "provides a directive of its own",
    "pass",
    (s) =>
      s.directives.push({
        name: "defer",
        description: null,
        isRepeatable: false,
        locations: ["FRAGMENT_SPREAD", "INLINE_FRAGMENT"],
        args: [
          { name: "if", description: null, type: { kind: "NON_NULL", name: null, ofType: named("Boolean") }, defaultValue: "true", isDeprecated: false, deprecationReason: null },
          { name: "label", description: null, type: named("String"), defaultValue: null, isDeprecated: false, deprecationReason: null },
        ],
        isDeprecated: false,
        deprecationReason: null,
      }),
  ],
  [
    "defaults.inc",
    "encodes default values differently",
    "pass",
    (s) => {
      const args = field(s, "Query", "f").args;
      args.find((a) => a.name === "x").defaultValue = "[1]";
      args.find((a) => a.name === "y").defaultValue = "1.0";
      args.find((a) => a.name === "w").defaultValue = "[[1], [2]]";
    },
  ],
  ["rich.inc", "returns types in another order", "pass", (s) => s.types.reverse()],
  ["interfaces.inc", "returns an interface's possible types in another order", "pass", (s) => type(s, "Node").possibleTypes.reverse()],
  ["rich.inc", "leaves out __schema", "executes", (s, d) => delete d.__schema],
  // The response's shape and envelope
  ["rich.inc", "leaves out a selected ofType", "executes", (s) => delete field(s, "M", "m").args[0].type.ofType],
  ["rich.inc", "leaves out a null it selects", "executes", (s) => delete type(s, "Q").specifiedByURL],
  ["rich.inc", "leaves out a selected field of a field", "executes", (s) => delete field(s, "Q", "a").description],
  ["rich.inc", "has a field the query doesn't select", "executes", (s) => (type(s, "Q").isDeprecated = false)],
  ["rich.inc", "has an ofType below the depth the query selects", "executes", (s) => (deepest(field(s, "Q", "a").type).ofType = null)],
  ["minimal.inc", "answers errors: []", "envelope", (s, d, r) => (r.errors = [])],
  ["minimal.inc", 'answers errors: "not a list"', "envelope", (s, d, r) => (r.errors = "not a list")],
  ["minimal.inc", "answers an entry the response format doesn't have", "envelope", (s, d, r) => (r.warnings = [])],
  ["minimal.inc", "answers extensions that aren't a map", "envelope", (s, d, r) => (r.extensions = "x")],
  // Built-in lists have no source order
  ["rich.inc", "reorders __TypeKind's enum values", "pass", (s) => type(s, "__TypeKind").enumValues.reverse()],
  ["rich.inc", "reorders __Type's fields", "pass", (s) => type(s, "__Type").fields.reverse()],
  ["rich.inc", "drops one of __TypeKind's enum values", "builtinDefinitions", (s) => type(s, "__TypeKind").enumValues.pop()],
  // Extending the introspection types is informational; changing them isn't.
  ["rich.inc", "adds a value to __DirectiveLocation", "builtinAdditions", (s) => type(s, "__DirectiveLocation").enumValues.push(extraValue("FRAGMENT_VARIABLE_DEFINITION")), { only: true }],
  ["rich.inc", "adds a field to __Type", "builtinAdditions", (s) => type(s, "__Type").fields.push(extraField("extra")), { only: true }],
  ["rich.inc", "adds an argument to __Type.fields", "builtinAdditions", (s) => field(s, "__Type", "fields").args.push(inputValue("extra", named("Int"))), { only: true }],
  ["rich.inc", "adds an introspection type", "builtinAdditions", (s) => s.types.push(scalarType("__Extra")), { only: true }],
  [
    "rich.inc",
    "adds a value to __DirectiveLocation, and drops another",
    ["builtinAdditions", "builtinDefinitions"],
    (s) => type(s, "__DirectiveLocation").enumValues.splice(0, 1, extraValue("FRAGMENT_VARIABLE_DEFINITION")),
  ],
  ["rich.inc", "changes the type of an introspection field, with the same name", "builtinDefinitions", (s) => (field(s, "__Field", "name").type = nonNull(named("Boolean"))), { only: true }],
  // A built-in field's type that differs only in Non-Null is a SHOULD.
  ["rich.inc", "makes __Directive.isRepeatable nullable", "builtinNullability", (s) => (field(s, "__Directive", "isRepeatable").type = named("Boolean")), { only: true, draftOnly: false }],
  ["rich.inc", "makes __InputValue.isDeprecated, which October 2021 doesn't have, nullable", "builtinNullability", (s) => (field(s, "__InputValue", "isDeprecated").type = named("Boolean")), { only: true, draftOnly: true }],
  ["rich.lookup", "makes a field of the document's nullable", "fields", (s, d) => (d.t0.fields[0].type = d.t0.fields[0].type.kind === "NON_NULL" ? d.t0.fields[0].type.ofType : nonNull(d.t0.fields[0].type)), { only: true }],
  // Under the draft, a built-in that is October 2021's, or that October 2021
  // doesn't define, rests on the draft alone.
  ["rich.inc", "gives __Type.fields(includeDeprecated:) October 2021's Boolean", "builtinDefinitions", (s) => (field(s, "__Type", "fields").args[0].type = named("Boolean")), { only: true, draftOnly: true }],
  ["rich.inc", "gives __Field.args(includeDeprecated:), which October 2021 doesn't have, the type Boolean", "builtinDefinitions", (s) => (field(s, "__Field", "args").args[0].type = named("Boolean")), { only: true, draftOnly: true }],
  ["rich.inc", "gives @skip a location neither edition has", "builtinDefinitions", (s) => directive(s, "skip").locations.push("QUERY"), { only: true, draftOnly: false }],
  // A service that lacks a field or argument the draft defines: the absence
  // counts once per run (run.mjs), not in each result, and what it hides
  // isn't graded. The rest still is.
  ["oneOf.inc", "has no __Type.isOneOf", "pass", lacks("__Type", "isOneOf"), { missing: ["__Type.isOneOf"] }],
  ["rich.inc", "has no __Directive.isRepeatable", "pass", lacks("__Directive", "isRepeatable"), { missing: ["__Directive.isRepeatable"] }],
  [
    "rich.inc",
    "has no __Directive.isRepeatable, and gives a directive the wrong locations",
    "directives",
    (s, d) => {
      lacks("__Directive", "isRepeatable")(s, d);
      directive(s, "label").locations.pop();
    },
    { only: true, missing: ["__Directive.isRepeatable"] },
  ],
  ["directiveDeprecation.inc", "has no __Schema.directives(includeDeprecated:)", "pass", lacksDirectivesArgument, { missing: ["__Schema.directives(includeDeprecated:)"] }],
  [
    "directiveDeprecation.inc",
    "has no __Schema.directives(includeDeprecated:), and drops a directive that isn't deprecated",
    "directives",
    (s) => {
      lacksDirectivesArgument(s);
      s.directives = s.directives.filter((d) => d.name !== "new");
    },
    { only: true, missing: ["__Schema.directives(includeDeprecated:)"] },
  ],
  // The service's own directives, and the types they reach
  [
    "rich.inc",
    "provides a directive of its own that takes its own scalar",
    "pass",
    (s) => {
      s.directives.push(serviceDirective([inputValue("x", { kind: "SCALAR", name: "ExtraScalar", ofType: null })]));
      s.types.push(scalarType("ExtraScalar"));
    },
  ],
  [
    "minimal.inc",
    "provides a directive of its own that takes its own input object, which uses its own enum and Float",
    "pass",
    (s) => {
      s.directives.push(serviceDirective([inputValue("x", nonNull({ kind: "INPUT_OBJECT", name: "ExtraInput", ofType: null }))]));
      s.types.push(
        {
          ...scalarType("ExtraInput"),
          kind: "INPUT_OBJECT",
          isOneOf: false,
          inputFields: [inputValue("e", { kind: "ENUM", name: "ExtraEnum", ofType: null }), inputValue("f", { kind: "SCALAR", name: "Float", ofType: null })],
        },
        { ...scalarType("ExtraEnum"), kind: "ENUM", enumValues: [{ name: "ON", description: null, isDeprecated: false, deprecationReason: null }] },
        scalarType("Float"),
      );
    },
  ],
  [
    "rich.inc",
    "provides a directive of its own whose argument's type isn't in types",
    "arguments",
    (s) => s.directives.push(serviceDirective([inputValue("x", { kind: "SCALAR", name: "ExtraScalar", ofType: null })])),
  ],
  [
    "rich.inc",
    "provides a directive of its own whose argument is an object type",
    "directives",
    (s) => {
      s.directives.push(serviceDirective([inputValue("x", { kind: "OBJECT", name: "ExtraObject", ofType: null })]));
      s.types.push({ ...scalarType("ExtraObject"), kind: "OBJECT", fields: [], interfaces: [] });
    },
  ],
  ["rich.inc", "has a type nothing in the schema reaches", "types", (s) => s.types.push(scalarType("ExtraScalar"))],
  // __type(name:)
  ["minimal.lookup", "finds a type for an unknown name", "typeByName", (s, d) => (d.t4 = clone(d.t0))],
  ["minimal.lookup", "finds a built-in scalar nothing references", "typeByName", (s, d) => (d.t2 = { ...clone(d.t1), name: "Float" })],
  ["rich.lookup", "answers null for a type the schema has", "typeByName", (s, d) => (d.t1 = null)],
  ["rich.lookup", "answers another type", "typeByName", (s, d) => (d.t1 = clone(d.t2))],
  ["interfaces.lookup", "loses a field's Non-Null wrapper", "fields", (s, d) => (d.t0.fields[0].type = named("ID"))],
  ["deprecation.lookup.defaults", "returns a deprecated value when includeDeprecated is false", "deprecation", (s, d) => d.t2.enumValues.push({ name: "B", description: null, isDeprecated: true, deprecationReason: "Gone" })],
  ["order.lookup", "reorders an enum's values", "order", (s, d) => d.t3.enumValues.reverse()],
  ["minimal.lookup", "reorders __TypeKind's enum values", "pass", (s, d) => d.t3.enumValues.reverse()],
  ["rich.lookup", "leaves out a selected ofType", "executes", (s, d) => delete d.t0.fields[0].args[0].type.ofType],
  ["rich.lookup", "answers errors: []", "envelope", (s, d, r) => (r.errors = [])],
  // §4.2.2: a List or Non-Null type's other fields are null
  ["wrappers", "gives a Non-Null type a description", "typeKinds", (s, d) => (wrapperOf(d, "types").description = "x"), { only: true, draftOnly: false }],
  ["wrappers", "gives a List type fields: []", "typeKinds", (s, d) => (wrapperOf(d, "types").ofType.fields = []), { only: true }],
  ["wrappers", "gives a Non-Null type isOneOf: false", "typeKinds", (s, d) => (wrapperOf(d, "queryType").isOneOf = false), { only: true, draftOnly: true }],
  // isOneOf is only the draft's: null where it shouldn't be, or the other
  // way round, rests on the draft.
  ["rich.inc", "gives a scalar isOneOf: false", "typeKinds", (s) => (type(s, "Date").isOneOf = false), { only: true, draftOnly: true }],
  ["rich.inc", "gives a built-in scalar isOneOf: false", "typeKinds", (s) => (type(s, "Int").isOneOf = false), { only: true, draftOnly: true }],
  ["rich.inc", "gives an input object isOneOf: null", "typeKinds", (s) => (type(s, "In").isOneOf = null), { only: true, draftOnly: true }],
  ["wrappers", "leaves out a wrapper's selected interfaces", "executes", (s, d) => delete wrapperOf(d, "types").interfaces],
  ["wrappers", "rejects the query", "executes", rejected, { only: true }],
  // The wrapper types must come from each of __Schema's fields.
  ["wrappers", 'answers no fields for __type(name: "__Schema")', "typeKinds", (s, d) => (d.wrappers.fields = []), { only: true }],
  ["wrappers", 'answers null for __type(name: "__Schema")', "typeKinds", (s, d) => (d.wrappers = null), { only: true }],
  ["wrappers", 'leaves out __Schema.types from __type(name: "__Schema")', "typeKinds", (s, d) => d.wrappers.fields.splice(d.wrappers.fields.findIndex((f) => f.name === "types"), 1), { only: true }],
  [
    "wrappers",
    'loses the Non-Null wrapper of __Schema.queryType in __type(name: "__Schema")',
    "typeKinds",
    (s, d) => {
      const f = d.wrappers.fields.find((x) => x.name === "queryType");
      f.type = f.type.ofType;
    },
    { only: true },
  ],
  // The October 2021 profile
  ...[
    // A built-in that is as the draft defines it is informational.
    [
      "minimal.inc",
      "gives @deprecated the draft's locations",
      "builtinEdition",
      (s) => directive(s, "deprecated").locations.push("ARGUMENT_DEFINITION", "INPUT_FIELD_DEFINITION", "DIRECTIVE_DEFINITION"),
      { only: true },
    ],
    ["minimal.inc", "gives @deprecated a location neither edition has", "builtinDefinitions", (s) => directive(s, "deprecated").locations.push("FIELD"), { only: true }],
    ["minimal.inc", "gives @deprecated(reason:) the draft's String!", "builtinEdition", (s) => (directive(s, "deprecated").args[0].type = nonNull(named("String"))), { only: true }],
    ["minimal.inc", "gives __Type.fields(includeDeprecated:) the draft's Boolean!", "builtinEdition", (s) => (field(s, "__Type", "fields").args[0].type = nonNull(named("Boolean"))), { only: true }],
    [
      "minimal.inc",
      "lists the draft's __Type.isOneOf among __Type's fields",
      "builtinEdition",
      (s) => type(s, "__Type").fields.push({ name: "isOneOf", description: null, args: [], type: named("Boolean"), isDeprecated: false, deprecationReason: null }),
      { only: true },
    ],
    ["minimal.inc", "has DIRECTIVE_DEFINITION among __DirectiveLocation's values", "builtinEdition", (s) => type(s, "__DirectiveLocation").enumValues.push(extraValue("DIRECTIVE_DEFINITION")), { only: true }],
    ["minimal.inc", "adds a field to __Type that neither edition defines", "builtinAdditions", (s) => type(s, "__Type").fields.push(extraField("extra")), { only: true }],
    // A service that lacks a field (graphql-dotnet lacks both): the absence
    // counts once per run, and the rest is graded.
    ["rich.inc", "has no __Directive.isRepeatable", "pass", lacks("__Directive", "isRepeatable"), { missing: ["__Directive.isRepeatable"] }],
    ["minimal.inc", "has no __Type.specifiedByURL", "pass", lacks("__Type", "specifiedByURL"), { missing: ["__Type.specifiedByURL"] }],
    ["minimal.lookup", "has no __Type.specifiedByURL, for __type(name:)", "pass", lacks("__Type", "specifiedByURL"), { missing: ["__Type.specifiedByURL"] }],
    ["minimal.inc", "answers isOneOf, which the October 2021 query doesn't select", "executes", (s) => (type(s, "Query").isOneOf = null)],
    ["minimal.inc", "provides @oneOf as a directive of its own", "pass", (s) => s.directives.push({ name: "oneOf", description: null, isRepeatable: false, locations: ["INPUT_OBJECT"], args: [] })],
    ["order.inc", "reorders an object's fields, which October 2021 doesn't grade", "pass", (s) => type(s, "Query").fields.reverse()],
    ["scalars.inc", "doesn't return @specifiedBy, though Date has a URL", "directives", dropDirectives("specifiedBy"), { only: true }],
    ["rich.inc", "reports a deprecated field as not deprecated", "deprecation", (s) => Object.assign(field(s, "Q", "old"), { isDeprecated: false, deprecationReason: null })],
    ["rich.inc", "drops an input field", "inputFields", (s) => type(s, "In").inputFields.splice(1, 1)],
    ["wrappers", "gives a List type a specifiedByURL", "typeKinds", (s, d) => (wrapperOf(d, "types").ofType.specifiedByURL = "u"), { only: true }],
    ["rich.lookup", "answers null for a type the schema has", "typeByName", (s, d) => (d.t1 = null)],
    ["deprecation.lookup.defaults", "returns a deprecated value when includeDeprecated is false", "deprecation", (s, d) => d.t2.enumValues.push({ name: "B", description: null, isDeprecated: true, deprecationReason: "Gone" })],
  ].map(([id, name, check, change, options = {}]) => [id, `October 2021: ${name}`, check, change, { ...options, profile: "oct2021" }]),
];

// The innermost type ref the query selects, at the TypeRef fragment's depth.
function deepest(ref) {
  let node = ref;
  for (let d = 0; d < TYPE_REF_DEPTH; d++) {
    if (node.ofType === null) node.ofType = { kind: "NON_NULL", name: null, ofType: null };
    node = node.ofType;
  }
  return node;
}

function type(s, name) {
  const t = s.types.find((x) => x.name === name);
  if (!t) throw new Error(`no type ${name} for a control`);
  return t;
}
function field(s, typeName, name) {
  const f = type(s, typeName).fields.find((x) => x.name === name);
  if (!f) throw new Error(`no field ${typeName}.${name} for a control`);
  return f;
}
function directive(s, name) {
  const d = s.directives.find((x) => x.name === name);
  if (!d) throw new Error(`no directive @${name} for a control`);
  return d;
}

export const CONTROLS = (vectors, builtins) => {
  const byId = new Map(vectors.map((v) => [v.id, v]));
  const controls = [];
  for (const profile of PROFILES) {
    const asked = profile === "draft" ? vectors : vectors.filter((v) => v.query2021);
    asked.forEach((v, i) => {
      const own = fullResponse(v, builtins, profile);
      controls.push({ name: "its own expected response", vector: v, profile, response: own, check: "pass" });
      const other = fullResponse(asked[(i + 1) % asked.length], builtins, profile);
      if (JSON.stringify(other) !== JSON.stringify(own)) controls.push({ name: "another vector's expected response", vector: v, profile, response: other, check: "any" });
    });
  }
  for (const [id, name, check, change, { only = false, profile = "draft", provided, missing = [], draftOnly, unbuilt } = {}] of BROKEN) {
    const v = byId.get(id);
    if (!v) throw new Error(`no vector ${id} for a control`);
    let response = clone(fullResponse(v, builtins, profile));
    if (change.replaces) response = change();
    else change(response.data.__schema, response.data, response);
    controls.push({ name, vector: v, profile, response, check, only, missing, draftOnly, unbuilt, ...(provided ? { provided: new Set(provided) } : {}) });
  }
  controls.push({
    name: "answers with errors",
    vector: vectors[0],
    profile: "draft",
    response: { errors: [{ message: "Cannot query field" }] },
    check: "executes",
  });
  return controls;
};

// Scripted answers for the probe (the first vector), and the profile
// chooseProfile must pick from them: [name, answer(query), profile, the
// fields and arguments left out].
export const PROFILE_CONTROLS = (vectors, builtins) => {
  const probe = vectors[0];
  const failure = { data: null, errors: [{ message: "Cannot query field", path: ["__schema"] }] };
  const requestError = { errors: [{ message: "Cannot query field" }] };
  const answered = fullResponse(probe, builtins, "oct2021");
  // DISCOVERY_QUERY's answer for a service with a profile's fields and
  // arguments, plus `extra`, without `lacking`.
  const discovered = (profile, lacking, extra = []) => {
    const fields = neededFields(profile);
    const args = neededArgs(profile);
    const data = {};
    for (const [alias, owner] of DISCOVERY_ALIASES) {
      const names = [...fields[owner], ...extra.filter((m) => m.startsWith(`${owner}.`)).map((m) => m.split(".")[1])];
      data[alias] = {
        fields: names
          .filter((n) => !lacking.includes(`${owner}.${n}`))
          .map((n) => ({ name: n, args: (args[`${owner}.${n}`] ?? []).filter((a) => !lacking.includes(`${owner}.${n}(${a}:)`)).map((a) => ({ name: a })) })),
      };
    }
    return { data };
  };
  // An answer for one query, a request error for every other.
  const only = (answers) => (q) => answers.get(q) ?? requestError;
  const dotnet = ["__Type.specifiedByURL", "__Directive.isRepeatable"];
  const draftOnly = [
    "__InputValue.isDeprecated",
    "__InputValue.deprecationReason",
    "__Directive.isDeprecated",
    "__Directive.deprecationReason",
    "__Type.inputFields(includeDeprecated:)",
    "__Field.args(includeDeprecated:)",
    "__Directive.args(includeDeprecated:)",
    "__Schema.directives(includeDeprecated:)",
  ];
  const juniper = ["__Directive.isDeprecated", "__Directive.deprecationReason", "__Schema.directives(includeDeprecated:)"];
  const draftWithout = (missing) => schemaQuery("draft", probe.includeDeprecated, missing);
  return [
    {
      name: "an answer for the draft's query keeps the draft profile",
      answer: only(new Map([[probe.query, answered]])),
      profile: "draft",
      missing: [],
    },
    {
      name: "errors with data: null for the draft's query, unreadable fields, and an answer for October 2021's, selects October 2021",
      answer: only(new Map([[probe.query, failure], [probe.query2021, answered]])),
      profile: "oct2021",
      missing: [],
    },
    {
      name: "a request error for the draft's query, and an answer for October 2021's, selects October 2021",
      answer: only(new Map([[probe.query2021, answered]])),
      profile: "oct2021",
      missing: [],
    },
    {
      name: "the draft's query rejected, and __Type lacks isOneOf, selects the draft without it",
      answer: only(new Map([[DISCOVERY_QUERY, discovered("draft", ["__Type.isOneOf"])], [draftWithout(["__Type.isOneOf"]), answered], [probe.query2021, answered]])),
      profile: "draft",
      missing: ["__Type.isOneOf"],
    },
    {
      name: "the draft's query rejected, and the introspection types lack __Schema.directives(includeDeprecated:) and __Directive's deprecation, selects the draft without them",
      answer: only(new Map([[DISCOVERY_QUERY, discovered("draft", juniper)], [draftWithout(juniper), answered]])),
      profile: "draft",
      missing: juniper,
    },
    {
      name: "the draft's query rejected, and the introspection types are October 2021's without __Type.specifiedByURL and __Directive.isRepeatable, selects the draft without them",
      answer: only(new Map([[DISCOVERY_QUERY, discovered("oct2021", dotnet, ["__Type.isOneOf"])], [draftWithout([...dotnet, ...draftOnly]), answered]])),
      profile: "draft",
      missing: [...dotnet, ...draftOnly],
    },
    {
      name: "the draft's query without what the service lacks rejected too, and October 2021's answered, selects October 2021",
      answer: only(new Map([[DISCOVERY_QUERY, discovered("draft", ["__Type.isOneOf"])], [probe.query2021, answered]])),
      profile: "oct2021",
      missing: [],
    },
    {
      name: "both rejected, and the introspection types lack __Type.kind, without which nothing can be graded, keeps the draft profile",
      answer: only(new Map([[DISCOVERY_QUERY, discovered("draft", ["__Type.kind"])]])),
      profile: "draft",
      missing: [],
    },
  ];
};
