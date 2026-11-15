// The introspect area's self-test: responses built from the reference's
// expected ones, which the checker must judge as stated, under every
// profile. Each vector's own expected response must pass, another
// vector's must fail, and each response broken on purpose must fail the
// check it targets ("only": that check and no other). A few changes the
// spec allows must pass, so that the checker isn't stricter than the spec
// either. PROFILE_CONTROLS script the probe's answers, and the profile
// run.mjs's chooseProfile picks from them must be as stated.

import { Crash } from "../areas.mjs";
import { fullResponse } from "./data.mjs";
import { DISCOVERY_ALIASES, DISCOVERY_QUERY, PRIMARY, PROFILES, TYPE_REF_DEPTH, neededArgs, neededFields, schemaQuery } from "./query.mjs";

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
// Options: only (no other check may fail), profile (default
// "September2026"), provided (for a lookup: the built-in directives the
// service returned for the schema's __schema), and since (the release each
// failing check must rest on, or null for none).
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
  ["rich.inc", "gives an object possibleTypes", "typeKinds", (s) => (type(s, "A").possibleTypes = []), { since: null }],
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
  // §4.2.2: "specifiedByURL may return a String (in the form of a URL)"
  ["scalars.inc", "drops specifiedByURL, though it provides @specifiedBy", "specifiedByURLOmitted", (s) => (type(s, "Date").specifiedByURL = null), { only: true }],
  ["scalars.lookup", "drops specifiedByURL for __type(name:), though it provides @specifiedBy", "specifiedByURLOmitted", (s, d) => (d.t0.specifiedByURL = null), { only: true }],
  ["scalars.inc", "gives a scalar without @specifiedBy a URL", "specifiedByURL", (s) => (type(s, "Plain").specifiedByURL = "https://example.com/plain"), { only: true }],
  // A type the document defines that nothing references (§4.2.1 doesn't
  // settle whether it is "contained within this schema").
  ["unreferenced.inc", "leaves out a type nothing references", "unreferencedTypes", (s) => s.types.splice(s.types.findIndex((t) => t.name === "Orphan"), 1), { only: true }],
  ["unreferenced.lookup", "answers null for a type nothing references", "unreferencedTypes", (s, d) => (d.t1 = null), { only: true }],
  ["roots.inc", "leaves out Mutation, which the query root references", "types", (s) => s.types.splice(s.types.findIndex((t) => t.name === "Mutation"), 1)],
  ["roots.lookup", "answers null for Mutation, which the query root references", "typeByName", (s, d) => (d.t2 = null), { only: true }],
  ["interfaces.inc", "leaves out User, which only Node's possibleTypes reach", "types", (s) => s.types.splice(s.types.findIndex((t) => t.name === "User"), 1)],
  // The reason of an item deprecated without one is the default of the
  // service's own @deprecated(reason:): a different default counts once,
  // under builtinDefinitions.
  [
    "deprecation.inc",
    "gives @deprecated(reason:) another default, and reports it for a field deprecated without a reason",
    "builtinDefinitions",
    (s) => {
      directive(s, "deprecated").args[0].defaultValue = '"No longer supported."';
      field(s, "Query", "a").deprecationReason = "No longer supported.";
    },
    { only: true, since: null },
  ],
  ["deprecation.inc", "reports another reason for a field deprecated without one", "deprecation", (s) => (field(s, "Query", "a").deprecationReason = "No longer supported."), { only: true }],
  [
    "deprecation.inc",
    "gives @deprecated(reason:) another default, and reports another reason for a field deprecated with one",
    ["builtinDefinitions", "deprecation"],
    (s) => {
      directive(s, "deprecated").args[0].defaultValue = '"No longer supported."';
      field(s, "Query", "b").deprecationReason = "No longer supported.";
    },
  ],
  // Since September 2025, deprecationReason "returns the reason".
  ["deprecation.inc", "reports null for a deprecated field's reason", "deprecation", (s) => (field(s, "Query", "b").deprecationReason = null), { only: true }],
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
  ["oneOf.inc", "doesn't return @oneOf, though Pick is OneOf", "directives", dropDirectives("oneOf"), { only: true, since: "September2025" }],
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
      type(s, "Odd").specifiedByURL = null;
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
  ["scalars.lookup", "doesn't provide @specifiedBy, and so reports no URL, for __type(name:)", "pass", (s, d) => (d.t0.specifiedByURL = d.t2.specifiedByURL = null), { provided: ["skip", "include", "deprecated", "oneOf"] }],
  // A lookup's URL shows @specifiedBy is provided, whatever the __schema
  // answer returned: it is graded against the document.
  ["scalars.lookup", "reports Date's URL for __type(name:), though the __schema answer has no @specifiedBy", "pass", () => {}, { provided: ["skip", "include", "deprecated", "oneOf"] }],
  ["scalars.lookup", "reports another URL for __type(name:), though the __schema answer has no @specifiedBy", "specifiedByURL", (s, d) => (d.t0.specifiedByURL = "https://example.com/other"), { only: true, provided: ["skip", "include", "deprecated", "oneOf"] }],
  ["scalars.inc", "rejects a schema that applies @specifiedBy", "builtinDirectives", rejected, { only: true }],
  ["oneOf.inc", "rejects a schema that applies @oneOf", "builtinDirectives", rejected, { only: true }],
  ["rich.inc", "rejects a schema that needs no optional directive", "executes", rejected],
  ["defaults.inc", "crashes (the adapter answers with an error)", "executes", crash, { only: true }],
  // A crash fails in every release, even on a vector only a later release
  // can express.
  ["inputDeprecation.inc", "crashes on a schema new in September 2025", "executes", crash, { only: true, since: null }],
  // A schema with syntax only September 2026's grammar has: a request error
  // isn't graded, data: null is.
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
  ["rich.inc", "makes __Directive.isRepeatable nullable", "builtinNullability", (s) => (field(s, "__Directive", "isRepeatable").type = named("Boolean")), { only: true, since: null }],
  ["rich.inc", "makes __InputValue.isDeprecated, which October 2021 doesn't have, nullable", "builtinNullability", (s) => (field(s, "__InputValue", "isDeprecated").type = named("Boolean")), { only: true, since: "September2025" }],
  ["rich.inc", "makes __Directive.isDeprecated, which September 2025 doesn't have, nullable", "builtinNullability", (s) => (field(s, "__Directive", "isDeprecated").type = named("Boolean")), { only: true, since: "September2026" }],
  ["rich.lookup", "makes a field of the document's nullable", "fields", (s, d) => (d.t0.fields[0].type = d.t0.fields[0].type.kind === "NON_NULL" ? d.t0.fields[0].type.ofType : nonNull(d.t0.fields[0].type)), { only: true }],
  // A built-in that is as an older release defines it, or that it doesn't
  // define, rests on the release after it.
  // A built-in argument that is nullable where the spec's is Non-Null, with
  // the same default, accepts everything the spec's does: a SHOULD, as for
  // fields.
  ["rich.inc", "gives __Type.fields(includeDeprecated:) October 2021's Boolean", "builtinNullability", (s) => (field(s, "__Type", "fields").args[0].type = named("Boolean")), { only: true, since: "September2025" }],
  ["rich.inc", "gives __Field.args(includeDeprecated:), which October 2021 doesn't have, the type Boolean", "builtinNullability", (s) => (field(s, "__Field", "args").args[0].type = named("Boolean")), { only: true, since: "September2025" }],
  ["rich.inc", "gives __Schema.directives(includeDeprecated:), which September 2025 doesn't have, the type Boolean", "builtinNullability", (s) => (field(s, "__Schema", "directives").args[0].type = named("Boolean")), { only: true, since: "September2026" }],
  ["rich.inc", "gives @deprecated(reason:) October 2021's String", "builtinNullability", (s) => (directive(s, "deprecated").args[0].type = named("String")), { only: true, since: "September2025" }],
  ["rich.inc", "gives @skip(if:) the type Boolean", "builtinNullability", (s) => (directive(s, "skip").args[0].type = named("Boolean")), { only: true, since: null }],
  ["rich.inc", "gives @skip(if:) the type String!", "builtinDefinitions", (s) => (directive(s, "skip").args[0].type = nonNull(named("String"))), { only: true, since: null }],
  ["oneOf.inc", "makes an input field of the document's nullable", "inputFields", (s) => (type(s, "Plain").inputFields[0].type = named("Int")), { only: true }],
  ["rich.inc", "gives @skip a location no edition has", "builtinDefinitions", (s) => directive(s, "skip").locations.push("QUERY"), { only: true, since: null }],
  // A location left out of a built-in directive rests on the release after
  // the newest one whose definition doesn't have it either; one added that
  // no edition has rests on none.
  [
    "minimal.inc",
    "gives @deprecated September 2025's four locations (no DIRECTIVE_DEFINITION)",
    "builtinDefinitions",
    (s) => (directive(s, "deprecated").locations = directive(s, "deprecated").locations.filter((l) => l !== "DIRECTIVE_DEFINITION")),
    { only: true, since: "September2026" },
  ],
  ["minimal.inc", "gives @deprecated October 2021's two locations", "builtinDefinitions", (s) => (directive(s, "deprecated").locations = ["FIELD_DEFINITION", "ENUM_VALUE"]), { only: true, since: "September2025" }],
  ["minimal.inc", "gives @deprecated September 2026's locations without ENUM_VALUE", "builtinDefinitions", (s) => (directive(s, "deprecated").locations = directive(s, "deprecated").locations.filter((l) => l !== "ENUM_VALUE")), { only: true, since: null }],
  ["minimal.inc", "gives @deprecated a location no edition has", "builtinDefinitions", (s) => directive(s, "deprecated").locations.push("FIELD"), { only: true, since: null }],
  [
    "minimal.inc",
    "gives @deprecated September 2025's four locations, and one no edition has",
    "builtinDefinitions",
    (s) => (directive(s, "deprecated").locations = [...directive(s, "deprecated").locations.filter((l) => l !== "DIRECTIVE_DEFINITION"), "FIELD"]),
    { only: true, since: null },
  ],
  // A service whose built-in directives and introspection types are
  // exactly September 2025's fails only what September 2026 introduced.
  [
    "inputDeprecation.inc",
    "answers September 2025's @deprecated and __DirectiveLocation, with the missing September 2026 fields filled in",
    "builtinDefinitions",
    (s) => {
      directive(s, "deprecated").locations = directive(s, "deprecated").locations.filter((l) => l !== "DIRECTIVE_DEFINITION");
      type(s, "__DirectiveLocation").enumValues = type(s, "__DirectiveLocation").enumValues.filter((v) => v.name !== "DIRECTIVE_DEFINITION");
    },
    { only: true, since: "September2026" },
  ],
  // A service that lacks a field or argument September 2026 defines: the absence
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
  ["wrappers", "gives a Non-Null type a description", "typeKinds", (s, d) => (wrapperOf(d, "types").description = "x"), { only: true, since: null }],
  ["wrappers", "gives a List type fields: []", "typeKinds", (s, d) => (wrapperOf(d, "types").ofType.fields = []), { only: true }],
  ["wrappers", "gives a Non-Null type isOneOf: false", "typeKinds", (s, d) => (wrapperOf(d, "queryType").isOneOf = false), { only: true, since: "September2025" }],
  // isOneOf is new in September 2025: null where it shouldn't be, or the
  // other way round, rests on it.
  ["rich.inc", "gives a scalar isOneOf: false", "typeKinds", (s) => (type(s, "Date").isOneOf = false), { only: true, since: "September2025" }],
  ["rich.inc", "gives a built-in scalar isOneOf: false", "typeKinds", (s) => (type(s, "Int").isOneOf = false), { only: true, since: "September2025" }],
  ["rich.inc", "gives an input object isOneOf: null", "typeKinds", (s) => (type(s, "In").isOneOf = null), { only: true, since: "September2025" }],
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
  // The wrapper types of a field of the document's own (__type(name:
  // "Resource")).
  ["wrappers.user", 'answers no fields for __type(name: "Resource")', "typeKinds", (s, d) => (d.wrappers.fields = []), { only: true }],
  ["wrappers.user", "leaves out Resource.url", "typeKinds", (s, d) => d.wrappers.fields.splice(d.wrappers.fields.findIndex((f) => f.name === "url"), 1), { only: true }],
  [
    "wrappers.user",
    "loses the Non-Null wrapper of Resource.id",
    "typeKinds",
    (s, d) => {
      const f = d.wrappers.fields.find((x) => x.name === "id");
      f.type = f.type.ofType;
    },
    { only: true },
  ],
  // A request that uses @skip or @include (§3.13): whether the service
  // honours it, and returns the directive it honours.
  ["probe.skip", "honours @skip but doesn't return it from __schema.directives", "directives", (s) => (s.directives = s.directives.filter((x) => x.name !== "skip")), { only: true }],
  ["probe.include", "honours @include but doesn't return it from __schema.directives", "directives", (s) => (s.directives = s.directives.filter((x) => x.name !== "include")), { only: true }],
  ["probe.skip", "rejects a request that uses @skip", "builtinDirectives", rejected, { only: true }],
  ["probe.include", "rejects a request that uses @include", "builtinDirectives", rejected, { only: true }],
  ["probe.skip", "doesn't skip the field @skip(if: true) is on", "executes", (s, d) => (d.dropped = "Query"), { only: true }],
  ["probe.include", "skips the field @include(if: true) is on", "executes", (s, d) => delete d.kept, { only: true }],
  ["probe.skip", "returns a directive of its own besides the built-in ones", "pass", (s) => s.directives.push({ name: "extra" })],
  // Deprecation of interface fields and of every argument, input field or
  // enum value of an item.
  ["interfaceDeprecation.inc", "reports an interface's deprecated field as not deprecated", "deprecation", (s) => Object.assign(field(s, "Named", "name"), { isDeprecated: false, deprecationReason: null }), { only: true }],
  [
    "interfaceDeprecation.defaults",
    "returns an interface's deprecated field when includeDeprecated is false",
    "deprecation",
    (s) => type(s, "Gone").fields.push({ name: "old", description: null, args: [], type: named("Int"), isDeprecated: true, deprecationReason: "No longer supported" }),
  ],
  ["interfaceDeprecation.lookup", "reports another reason for an interface's deprecated field", "deprecation", (s, d) => (d.t0.fields.find((f) => f.name === "name").deprecationReason = "Use name"), { only: true, since: null }],
  ["inputDeprecationAll.inc", "reports an interface field's deprecated argument as not deprecated", "deprecation", (s) => Object.assign(field(s, "Node", "f").args[0], { isDeprecated: false, deprecationReason: null }), { only: true, since: "September2025" }],
  ["inputDeprecationAll.defaults", "returns a deprecated input field when includeDeprecated is false", "deprecation", (s) => type(s, "AllOld").inputFields.push({ ...inputValue("p", named("Int")), isDeprecated: true, deprecationReason: "No longer supported" }), { since: "September2025" }],
  ["directiveArgDeprecation.inc", "reports a directive's deprecated argument as not deprecated", "deprecation", (s) => Object.assign(directive(s, "d").args[0], { isDeprecated: false, deprecationReason: null }), { only: true, since: "September2025" }],
  ["directiveArgDeprecation.defaults", "returns a directive's deprecated argument when includeDeprecated is false", "deprecation", (s) => directive(s, "e").args.push({ ...inputValue("x", named("Int")), isDeprecated: true, deprecationReason: "No longer supported" }), { since: "September2025" }],
  // Source order of input fields, directives and directive arguments.
  ["order.inc", "reorders an input object's fields", "order", (s) => type(s, "In").inputFields.reverse(), { only: true, since: "September2025" }],
  ["locations.inc", "reorders a directive's arguments", "order", (s) => directive(s, "m").args.reverse(), { only: true, since: "September2025" }],
  [
    "locations.inc",
    "returns the document's directives out of order",
    "order",
    (s) => {
      const z = s.directives.findIndex((x) => x.name === "z");
      s.directives.push(...s.directives.splice(z, 1));
    },
    { only: true, since: "September2025" },
  ],
  ["locations.inc", "reorders a directive's locations, which have no source order to keep", "pass", (s) => directive(s, "z").locations.reverse()],
  // Directive locations
  ["locations.inc", "leaves a location out of a directive of its own", "directives", (s) => directive(s, "z").locations.splice(9, 1), { only: true }],
  ["locations.inc", "makes a directive of its own repeatable", "directives", (s) => (directive(s, "a").isRepeatable = true), { only: true }],
  ["directiveDefinitionLocation.inc", "leaves DIRECTIVE_DEFINITION out of a directive's locations", "directives", (s) => directive(s, "every").locations.pop(), { only: true }],
  // Descriptions: a block string's text is BlockStringValue's.
  ["descriptions.inc", "doesn't remove a block description's common indentation", "descriptions", (s) => (field(s, "Query", "f").description = "    A field with\n  a block description"), { only: true }],
  ["descriptions.inc", "keeps a block description's leading blank line", "descriptions", (s) => (type(s, "Query").description = "\nA query root.\n\n  Indented second paragraph."), { only: true }],
  ["descriptions.inc", "doesn't normalise CRLF in a block description", "descriptions", (s) => (type(s, "I").description = "An interface\r\nover x"), { only: true }],
  ["descriptions.lookup", "leaves \\\"\"\" escaped in a block description", "descriptions", (s, d) => (d.t5.description = 'A scalar with \\""" in it'), { only: true }],
  ["descriptions.inc", "drops the schema's description", "descriptions", (s) => (s.description = null), { only: true }],
  ["descriptionText.inc", "decodes a surrogate pair escape into two characters", "descriptions", (s) => (type(s, "Query").description = type(s, "Query").description.replace("a pair \u{1F600}", "a pair \uFFFD\uFFFD")), { only: true, since: "September2025" }],
  ["descriptionText.lookup", "drops a raw control character", "descriptions", (s, d) => (d.t0.fields[0].description = d.t0.fields[0].description.replace("\u0001", "")), { only: true, since: "September2025" }],
  // How a default value's strings are printed (§2.10.4, a SHOULD since
  // September 2025).
  ["printing.inc", "prints a control character unescaped", "defaultValuePrinting", (s) => (field(s, "Query", "f").args[0].defaultValue = field(s, "Query", "f").args[0].defaultValue.replace("\\u0001", "\u0001")), { only: true, since: "September2025" }],
  ["printing.inc", "prints a control character in a block string, which can't escape it", "defaultValuePrinting", (s) => (type(s, "In").inputFields[0].defaultValue = '"""\u0003"""'), { only: true, since: "September2025" }],
  ["printing.inc", "escapes a supplementary character as a surrogate pair", "defaultValuePrinting", (s) => (field(s, "Query", "f").args[1].defaultValue = '"\\uD83D\\uDE00 é"'), { only: true, since: "September2025" }],
  ["printing.lookup", "prints a control character in an input field's default unescaped", "defaultValuePrinting", (s, d) => (d.t1.inputFields[0].defaultValue = '"\u0003"'), { only: true, since: "September2025" }],
  ["printing.inc", "escapes a supplementary character as \\u{…} and é as \\u00E9", "pass", (s) => (field(s, "Query", "f").args[1].defaultValue = '"\\u{1F600} \\u00E9"')],
  ["printing.inc", "prints a string list item as a block string", "pass", (s) => (type(s, "In").inputFields[1].defaultValue = '["""\u{1F600}"""]')],
  ["printing.inc", "escapes control characters in another form with the same value", "pass", (s) => (field(s, "Query", "f").args[0].defaultValue = '"\\u0000\\u0001\\u0009\\u000A\\u001F\\u007f\\u0080\\u0085\\u009f"')],
  ["printing.inc", "prints another value, without a printing problem", "defaultValue", (s) => (field(s, "Query", "f").args[1].defaultValue = '"x"'), { only: true }],
  // Meta-fields in fragments on the query root (§4.2).
  ["roots.lookup.fragments", "answers null for __type(name:) in a fragment", "typeByName", (s, d) => (d.t2 = null), { only: true }],
  // An empty selection set on the root and on the meta-fields (§2.5, new
  // in September 2026).
  ["emptySelection.root", "answers data: null", "executes", (s, d, r) => (r.data = null), { only: true }],
  ["emptySelection.meta", "selects __schema's fields anyway", "executes", (s, d) => (d.__schema = { queryType: { name: "Query" } }), { only: true }],
  ["emptySelection.meta", "answers an object for an unknown type", "executes", (s, d) => (d.t1 = {}), { only: true }],
  // The September 2025 profile
  ...[
    // A built-in that is as September 2026 defines it is informational.
    [
      "minimal.inc",
      "gives @deprecated September 2026's five locations",
      "builtinEdition",
      (s) => directive(s, "deprecated").locations.push("DIRECTIVE_DEFINITION"),
      { only: true, since: "September2026" },
    ],
    [
      "minimal.inc",
      "lists September 2026's __Directive.isDeprecated among __Directive's fields",
      "builtinEdition",
      (s) => type(s, "__Directive").fields.push({ ...extraField("isDeprecated"), type: nonNull(named("Boolean")) }),
      { only: true, since: "September2026" },
    ],
    ["minimal.inc", "has DIRECTIVE_DEFINITION among __DirectiveLocation's values", "builtinEdition", (s) => type(s, "__DirectiveLocation").enumValues.push(extraValue("DIRECTIVE_DEFINITION")), { only: true, since: "September2026" }],
    // One that is October 2021's rests on September 2025.
    ["minimal.inc", "gives @deprecated October 2021's two locations", "builtinDefinitions", (s) => (directive(s, "deprecated").locations = ["FIELD_DEFINITION", "ENUM_VALUE"]), { only: true, since: "September2025" }],
    ["minimal.inc", "gives @deprecated(reason:) October 2021's String", "builtinNullability", (s) => (directive(s, "deprecated").args[0].type = named("String")), { only: true, since: "September2025" }],
    ["minimal.inc", "gives __Type.fields(includeDeprecated:) October 2021's Boolean", "builtinNullability", (s) => (field(s, "__Type", "fields").args[0].type = named("Boolean")), { only: true, since: "September2025" }],
    ["minimal.inc", "gives @deprecated a location no edition has", "builtinDefinitions", (s) => directive(s, "deprecated").locations.push("FIELD"), { only: true, since: null }],
    ["minimal.inc", "adds a field to __Type that no edition defines", "builtinAdditions", (s) => type(s, "__Type").fields.push(extraField("extra")), { only: true, since: null }],
    // September 2025: deprecationReason "returns the reason".
    ["deprecation.inc", "reports null for a deprecated field's reason", "deprecation", (s) => (field(s, "Query", "b").deprecationReason = null), { only: true, since: null }],
    ["inputDeprecation.inc", "reports a deprecated argument as not deprecated", "deprecation", (s) => Object.assign(field(s, "Query", "b").args[0], { isDeprecated: false, deprecationReason: null }), { only: true, since: "September2025" }],
    ["oneOf.inc", "drops isOneOf", "isOneOf", (s) => (type(s, "Pick").isOneOf = false), { only: true, since: "September2025" }],
    ["order.inc", "reorders an object's fields", "order", (s) => type(s, "Query").fields.reverse(), { only: true, since: "September2025" }],
    ["minimal.inc", "answers __Directive.isDeprecated, which the September 2025 query doesn't select", "executes", (s) => (directive(s, "skip").isDeprecated = false)],
    ["oneOf.inc", "has no __Type.isOneOf", "pass", lacks("__Type", "isOneOf"), { missing: ["__Type.isOneOf"] }],
    ["wrappers", "gives a List type fields: []", "typeKinds", (s, d) => (wrapperOf(d, "types").ofType.fields = []), { only: true }],
  ].map(([id, name, check, change, options = {}]) => [id, `September 2025: ${name}`, check, change, { ...options, profile: "September2025" }]),
  // The October 2021 profile
  ...[
    // A built-in that is as a later release defines it is informational,
    // and rests on the first release that defines it so.
    [
      "minimal.inc",
      "gives @deprecated September 2026's locations",
      "builtinEdition",
      (s) => directive(s, "deprecated").locations.push("ARGUMENT_DEFINITION", "INPUT_FIELD_DEFINITION", "DIRECTIVE_DEFINITION"),
      { only: true, since: "September2026" },
    ],
    ["minimal.inc", "gives @deprecated a location no edition has", "builtinDefinitions", (s) => directive(s, "deprecated").locations.push("FIELD"), { only: true, since: null }],
    ["minimal.inc", "gives @deprecated September 2025's four locations", "builtinEdition", (s) => directive(s, "deprecated").locations.push("ARGUMENT_DEFINITION", "INPUT_FIELD_DEFINITION"), { only: true, since: "September2025" }],
    ["minimal.inc", "leaves ENUM_VALUE out of @deprecated", "builtinDefinitions", (s) => directive(s, "deprecated").locations.pop(), { only: true, since: null }],
    ["minimal.inc", "gives @skip(if:) the type Boolean", "builtinNullability", (s) => (directive(s, "skip").args[0].type = named("Boolean")), { only: true }],
    // October 2021: deprecationReason "optionally provides a reason".
    ["deprecation.inc", "reports null for a deprecated field's reason", "deprecationReasonOmitted", (s) => (field(s, "Query", "b").deprecationReason = null), { only: true }],
    ["deprecation.lookup", "reports null for a deprecated enum value's reason, for __type(name:)", "deprecationReasonOmitted", (s, d) => (d.t2.enumValues.find((v) => v.name === "B").deprecationReason = null), { only: true }],
    ["deprecation.inc", "reports another reason for a deprecated field", "deprecation", (s) => (field(s, "Query", "b").deprecationReason = "Use d"), { only: true }],
    ["minimal.inc", "gives @deprecated(reason:) the String! of September 2025 and 2026", "builtinEdition", (s) => (directive(s, "deprecated").args[0].type = nonNull(named("String"))), { only: true, since: "September2025" }],
    ["minimal.inc", "gives __Type.fields(includeDeprecated:) the Boolean! of September 2025 and 2026", "builtinEdition", (s) => (field(s, "__Type", "fields").args[0].type = nonNull(named("Boolean"))), { only: true, since: "September2025" }],
    [
      "minimal.inc",
      "lists __Type.isOneOf, new in September 2025, among __Type's fields",
      "builtinEdition",
      (s) => type(s, "__Type").fields.push({ name: "isOneOf", description: null, args: [], type: named("Boolean"), isDeprecated: false, deprecationReason: null }),
      { only: true, since: "September2025" },
    ],
    ["minimal.inc", "has DIRECTIVE_DEFINITION, new in September 2026, among __DirectiveLocation's values", "builtinEdition", (s) => type(s, "__DirectiveLocation").enumValues.push(extraValue("DIRECTIVE_DEFINITION")), { only: true, since: "September2026" }],
    ["minimal.inc", "adds a field to __Type that no edition defines", "builtinAdditions", (s) => type(s, "__Type").fields.push(extraField("extra")), { only: true, since: null }],
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
    // October 2021 has no rule on producing a StringValue.
    ["printing.inc", "prints a control character unescaped, which October 2021 doesn't grade", "pass", (s) => (field(s, "Query", "f").args[0].defaultValue = field(s, "Query", "f").args[0].defaultValue.replace("\\u0001", "\u0001"))],
    ["printing.inc", "escapes a supplementary character as a surrogate pair, which October 2021 doesn't grade", "pass", (s) => (field(s, "Query", "f").args[1].defaultValue = '"\\uD83D\\uDE00 \u00e9"')],
    ["probe.skip", "rejects a request that uses @skip", "builtinDirectives", rejected, { only: true }],
    ["probe.include", "honours @include but doesn't return it", "directives", (s) => (s.directives = s.directives.filter((x) => x.name !== "include")), { only: true }],
    ["interfaceDeprecation.inc", "reports an interface's deprecated field as not deprecated", "deprecation", (s) => Object.assign(field(s, "Named", "name"), { isDeprecated: false, deprecationReason: null })],
    ["locations.inc", "reorders a directive's arguments, which October 2021 doesn't grade", "pass", (s) => directive(s, "m").args.reverse()],
  ].map(([id, name, check, change, options = {}]) => [id, `October 2021: ${name}`, check, change, { ...options, profile: "October2021" }]),
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
    const asked = vectors.filter((v) => v.queries[profile]);
    asked.forEach((v, i) => {
      const own = fullResponse(v, builtins, profile);
      controls.push({ name: "its own expected response", vector: v, profile, response: own, check: "pass" });
      const other = fullResponse(asked[(i + 1) % asked.length], builtins, profile);
      if (JSON.stringify(other) !== JSON.stringify(own)) controls.push({ name: "another vector's expected response", vector: v, profile, response: other, check: "any" });
    });
  }
  for (const [id, name, check, change, { only = false, profile = PRIMARY, provided, missing = [], since, unbuilt } = {}] of BROKEN) {
    const v = byId.get(id);
    if (!v) throw new Error(`no vector ${id} for a control`);
    if (!v.queries[profile]) throw new Error(`the vector ${id} has no ${profile} query, for a control`);
    let response = clone(fullResponse(v, builtins, profile));
    if (change.replaces) response = change();
    else change(response.data.__schema, response.data, response);
    controls.push({ name, vector: v, profile, response, check, only, missing, since, unbuilt, ...(provided ? { provided: new Set(provided) } : {}) });
  }
  controls.push({
    name: "answers with errors",
    vector: vectors[0],
    profile: PRIMARY,
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
  const answered = fullResponse(probe, builtins, "October2021");
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
  const q = probe.queries;
  const dotnet = ["__Type.specifiedByURL", "__Directive.isRepeatable"];
  // What September 2025's query needs that October 2021's types don't have.
  const since2025 = ["__InputValue.isDeprecated", "__InputValue.deprecationReason", "__Type.inputFields(includeDeprecated:)", "__Field.args(includeDeprecated:)", "__Directive.args(includeDeprecated:)"];
  // What September 2026's query needs that September 2025's types don't have.
  const since2026 = ["__Directive.isDeprecated", "__Directive.deprecationReason", "__Schema.directives(includeDeprecated:)"];
  const without = (profile, missing) => schemaQuery(profile, probe.includeDeprecated, missing);
  return [
    {
      name: "an answer for September 2026's query keeps the September 2026 profile",
      answer: only(new Map([[q.September2026, answered]])),
      profile: "September2026",
      missing: [],
    },
    {
      name: "September 2026's query rejected, and September 2025's answered, selects September 2025",
      answer: only(new Map([[q.September2025, answered], [q.October2021, answered]])),
      profile: "September2025",
      missing: [],
    },
    {
      name: "errors with data: null for September 2026's and September 2025's queries, unreadable fields, and an answer for October 2021's, selects October 2021",
      answer: only(new Map([[q.September2026, failure], [q.September2025, failure], [q.October2021, answered]])),
      profile: "October2021",
      missing: [],
    },
    {
      name: "a request error for the later releases' queries, and an answer for October 2021's, selects October 2021",
      answer: only(new Map([[q.October2021, answered]])),
      profile: "October2021",
      missing: [],
    },
    {
      name: "both later releases' queries rejected, and __Type lacks isOneOf, selects September 2026 without it",
      answer: only(new Map([[DISCOVERY_QUERY, discovered("September2026", ["__Type.isOneOf"])], [without("September2026", ["__Type.isOneOf"]), answered], [without("September2025", ["__Type.isOneOf"]), answered], [q.October2021, answered]])),
      profile: "September2026",
      missing: ["__Type.isOneOf"],
    },
    {
      name: "both later releases' queries rejected, and the introspection types are September 2025's without __Type.isOneOf, selects September 2025 without it",
      answer: only(
        new Map([
          [DISCOVERY_QUERY, discovered("September2025", ["__Type.isOneOf"])],
          [without("September2026", ["__Type.isOneOf", ...since2026]), answered],
          [without("September2025", ["__Type.isOneOf"]), answered],
        ]),
      ),
      profile: "September2025",
      missing: ["__Type.isOneOf"],
    },
    {
      name: "both later releases' queries rejected, and the introspection types are October 2021's with __Type.isOneOf and without __Type.specifiedByURL and __Directive.isRepeatable, selects September 2025 without what they lack",
      answer: only(new Map([[DISCOVERY_QUERY, discovered("October2021", dotnet, ["__Type.isOneOf"])], [without("September2025", [...dotnet, ...since2025]), answered]])),
      profile: "September2025",
      missing: [...dotnet, ...since2025],
    },
    {
      name: "the later releases' queries without what the service lacks rejected too, and October 2021's answered, selects October 2021",
      answer: only(new Map([[DISCOVERY_QUERY, discovered("September2025", ["__Type.isOneOf"])], [q.October2021, answered]])),
      profile: "October2021",
      missing: [],
    },
    {
      name: "every query rejected, and the introspection types lack __Type.kind, without which nothing can be graded, keeps the September 2026 profile",
      answer: only(new Map([[DISCOVERY_QUERY, discovered("September2026", ["__Type.kind"])]])),
      profile: "September2026",
      missing: [],
    },
  ];
};
