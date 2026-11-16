# The schema area

`graphql-tla run schema` checks schema validation: whether an implementation accepts an SDL schema exactly when the type system rules of §3, and §4's Reserved Names, allow it. The reference is [`specs/TypeSystem.tla`](../../specs/TypeSystem.tla), whose `Verdict(S)` is the set of rules a schema breaks. It covers the Type Validation rules of:

- §3.3 Schema, with "a document must include at most one `schema` definition", and §3.3.1 Root Operation Types;
- §3.6 Objects, including IsValidImplementation, and §3.7 Interfaces;
- §3.8 Unions, §3.9 Enums, §3.10 Input Objects (with OneOf, and both kinds of cycle);
- §3.13 Directives, with "Directives must only be used in the locations they are declared to belong in" for the directives a document applies, §3.13.3's rule that a required argument or input field can't be deprecated, and §3.13.4's rule that `@specifiedBy` isn't applied to a built-in scalar;
- §4's Reserved Names, for enum values: "any Name within a GraphQL type system must not start with two underscores". §3.9 says nothing about `__`;
- type system extensions, for adapters that claim `schema-extensions`: §3.3.2 Schema Extension, §3.5.6, §3.6.3, §3.7.1, §3.8.1, §3.9.1 and §3.10.2 for the six kinds of type, and §3.13.6 Directive Extensions (new in September 2026).

```shell
npx graphql-tla run schema --adapter "node adapters/graphql-js/adapter.mjs --graphql 17" --strict --report schema.json
```

The area follows [the contract for areas beyond execution](../kit-areas.md).

## Request

```json
{"type":"schema","id":12,"sdl":"interface I { f: Int } type Query implements I { f(b: Int!): Int }"}
```

- **`sdl`:** a type system document with type, directive and schema definitions. Built-in scalars and directives aren't defined in it. For an adapter that claims the `schema-extensions` capability, it may also hold type system extensions (`extend schema`, `extend scalar`, `extend type`, `extend interface`, `extend union`, `extend enum`, `extend input`, `extend directive`). Without the capability, no request has an extension.

Build a schema from it and validate it, the way your implementation does before it would serve the schema. With extensions, build the schema the document's definitions make, apply its extensions in document order, and validate the result: a schema whose extensions are invalid is `valid: false`, like one whose definitions are. graphql-js does this with `buildSchema`, which takes a document with extensions.

**`schema-extensions`.** Claim it if your implementation builds a schema from a document that has both definitions and extensions of them, and checks the extensions' Type Validation rules. A vector whose SDL has an extension carries `"requires": ["schema-extensions"]` and isn't sent to an adapter without the capability; the report's provenance counts those vectors under `skipped`, and the checks only they exercise carry `"requires": ["schema-extensions"]`, so the sheet shows them as needing the capability. An implementation that applies extensions some other way, such as extending a schema it has already built, applies the document's extensions to the definitions in the same document.

## Result

```json
{"type":"result","id":12,"valid":false}
```

- **`valid`:** whether the implementation accepts the schema. A schema the implementation rejects, with its validation errors or by failing to build it, is `valid: false`. Rejecting is an answer, not an adapter error.

Any other fields, such as `errors` with the implementation's messages, are ignored, but they appear in the report's examples.

**Crashes.** If the implementation crashes on a schema, say with a stack overflow or a null dereference, rather than rejecting it, answer `{"type":"error","id":12,"message":"…"}`. The run goes on: the kit reports the vector as a crash, as it does in parse, validate and coerce ([the protocol](../kit-areas.md#protocol)). Only the message's first line reaches the report, so a stack trace's paths stay out of it.

The kit can only tell a crash from a rejection by this. A `valid: false` is a rejection, whatever made it, so an adapter that turns every exception into `valid: false` hides its crashes: they pass on invalid schemas and count as rejections of valid ones. Report as a crash any failure that isn't the implementation saying the schema is invalid. A silent adapter still stops the run.

The area needs SDL input. A code-first framework that can't build a schema from SDL can't take part. It just doesn't claim the `schema` capability.

## What is checked

The vectors come in minimal pairs. Each pair is an invalid schema that breaks exactly one rule, by the reference, and a valid sibling one small edit away:

```graphql
interface I { f: Int } type Query implements I { f(b: Int!): Int }      # breaks IMPL_EXTRA_ARG_OPTIONAL
interface I { f: Int } type Query implements I { f(b: Int): Int }       # valid
```

That gives a verdict per rule without asking which rule the implementation applied:

- the rule is **not enforced** when the implementation accepts an invalid schema. That is conclusive, and it is the only thing a rule's check rests on.
- rejecting a valid sibling fails a separate check, `acceptsValid`. The kit doesn't know which rule the implementation applied, so the rule the sibling's pair breaks is only a **hint**.
- the implementation **crashes** on a schema when the adapter answers it with an `error`. On an invalid schema a crash fails the rule, as accepting it would; on a valid one it fails `acceptsValid`.

There is one check per rule in `TypeSystem!Rules`, at the sections that state it, and `acceptsValid` (§3: a schema is invalid only when it breaks a rule). Every check is a MUST except two INFO checks (below), and each has a `basis` that quotes the sentences it rests on, which the sheet prints. [`kit/schema/rules.mjs`](../../kit/schema/rules.mjs) lists the rules:

| Section | Checks |
| --- | --- |
| §3.3 | `typeNamesUnique`, `typeNameNotBuiltin`, `typeNameReserved`, `directiveNamesUnique`, `directiveNameReserved`, `schemaDefinitionUnique` |
| §3.3.1 | `queryRootProvided`, `rootTypesAreObjects`, `rootTypesDifferent` |
| §3.6, §3.7 | `fieldsDefined`, `fieldNamesUnique`, `fieldNameReserved`, `fieldOutputType`, `argNameReserved`, `argNamesUnique`, `argInputType`, `requiredArgNotDeprecated`, `argDefaultCompatible`, `implementsUnique`, `implementsInterfaces`, `implementsItself` |
| §3.6 IsValidImplementation (and §3.7, which applies it) | `implTransitive`, `implFieldProvided`, `implArgProvided`, `implArgInvariant`, `implExtraArgOptional`, `implFieldCovariant`, `implDeprecation` |
| §3.8 | `unionMembersDefined`, `unionMembersUnique`, `unionMembersObjects` |
| §3.9 | `enumValuesDefined`, `enumValuesUnique` |
| §4 | `enumValueNameReserved` |
| §3.10, §3.10.1 | `inputFieldsDefined`, `inputFieldNamesUnique`, `inputFieldNameReserved`, `inputFieldInputType`, `requiredInputFieldNotDeprecated`, `oneOfFieldNullable`, `oneOfFieldNoDefault`, `inputObjectUnbreakableCycle`, `inputObjectDefaultValueCycle` |
| §3.13 | `directiveLocationsDefined`, `directiveUsesItself`, `directiveReferencesItselfIndirectly`, `directivesDefined`, `directiveLocationsValid` |
| §3.13.4, §3.5 | `specifiedByNotBuiltin` |
| §3.5.6, §3.6.3, §3.7.1, §3.8.1, §3.9.1, §3.10.2 | `extensionTargetDefined`, `extensionTargetKind`, `extensionItemsUnique`, `extensionItemsNew` |
| §3.6.3 | `extensionInterfacesNew` |
| §3.3.2 and each type extension section | `extensionDirectivesNotReapplied` |
| §3.10.2 | `extensionOneOf` |
| §3.3.2 | `schemaExtensionDefined` (never graded, below) |
| §3.13.6 | `directiveExtensionDefined`, `directiveExtensionNotReapplied`, `directiveExtensionUsesPrevious`, `directiveExtensionReferencesPrevious` |
| §3.13, §5.7.3 (INFO) | `directiveNotRepeated` |
| §3.13, §2.13, §5.4 (INFO) | `appliedDirectiveArguments` |
| §3 | `acceptsValid`: the valid schemas are accepted |

A check cites every section its vectors rest on, not just the first. `fieldOutputType` and `argInputType` also cite §3.7 and §3.4.2 (and `argInputType` §3.13, for directive arguments); `implementsUnique` also cites §3.7.1, for an interface type extension that adds an interface the type already implements; `implTransitive` also cites §3.7, whose "Interface definitions must not contain cyclic references nor implement themselves" a cycle of interfaces breaks. `argDefaultCompatible` cites the coercion rules a default is checked by: §3.5, §3.9, §3.10, §3.10.1, §3.11 and §3.12. A required input field that a default leaves out (`argDefaultCompatible.6`) is incompatible by §3.12, "If an argument or input-object field of a Non-Null type is not provided … then a request error must be raised"; §3.10's own sentence for that case says only "an error should be raised".

`directiveLocationsDefined` is always untested: SDL requires `on` and at least one location, so no document breaks it. `schemaExtensionDefined` is too: its only invalid vector is `unspecified` (below).

**References to undefined types.** A name the document doesn't define is no type. `TypeSystem.tla` gives it no kind, so §3.4.2's IsOutputType and IsInputType return false for it ("Return false"), and it isn't an Object or Interface type. So `type Query { a: Missing }` breaks `fieldOutputType`, an argument or input field of an undefined type `argInputType` or `inputFieldInputType`, `schema { query: Missing }` `rootTypesAreObjects`, `union U = Query | Missing` `unionMembersObjects`, and `implements Missing` `implementsInterfaces`. Each of these has a pair.

**Directives applied in SDL.** §3.13: "Directives must only be used in the locations they are declared to belong in." The same sentence is in October 2021. The kit reads where a document applies each directive (`kit/schema/tla.mjs`, `schemaVerdictData`) and `TypeSystem.tla` checks it against the directive's definition in the document, or the built-in directive of that name: `@skip` and `@include` on executable locations, `@deprecated` on field, argument, input field and enum value definitions and on directive definitions, `@specifiedBy` on scalars and `@oneOf` on input objects (§3.13.1 to §3.13.5). `directiveLocationsValid` fails for `directive @d on FIELD` applied to a field definition, and for `type Query @deprecated`. Its pairs cover every TypeSystemDirectiveLocation: the schema, each kind of type, fields, arguments of fields and of directives, enum values, input fields, directive definitions (`DIRECTIVE_DEFINITION`, since September 2026) and extensions (an `extend type Query @d` takes `OBJECT`), each built-in directive at a location it isn't declared for, and a location list with a leading `|`. A directive that is neither defined nor built in isn't declared to belong anywhere, so applying it fails `directivesDefined`. A service "may provide any additional custom directive", so the vectors use a name no service is likely to provide, `@undefinedInThisSchema`.

**What §3 doesn't state for applied directives (INFO).** Two checks are informational. They record what an implementation does where §3 states no rule, and never fail a run, even with `--strict`; the run's summary counts them apart ("1 failing check is informational"):

- `directiveNotRepeated`: a non-repeatable directive applied twice to one element by one definition or one extension, as `type Query @d @d`. §3 states the rule only for extensions, against the previous type ("must not already apply"), and §5.7.3 only for executable documents.
- `appliedDirectiveArguments`: an applied directive's arguments don't fit its definition: an argument it doesn't define, one given twice, a required one missing, or a value that doesn't coerce to the argument's type (`@deprecated(reason: 1)`, `@specifiedBy` without `url`, `@d(x: "a")` for `x: Int`). These are §5.4's rules, which apply to executable documents. The reference coerces a value as it does a default value (`CoerceLiteral`). `@deprecated(reason: null)` is tagged since September 2025, where `reason` became `String!`.

Every other vector applies directives with fitting arguments, once per element, so these two don't decide any MUST verdict.

**Type system extensions.** The reference reads the document's extensions in order. Each kind's rules are stated against "the previous" type, schema or directive: its definition as extended by the extensions before this one. `TypeSystem!Extended(S)` is the schema the whole document makes, each extension's fields, values, member types, input fields, interfaces and directives merged into its type, and the schema extensions' root operation types into the schema. Rules about definitions (§3.3 to §3.13) are checked on that schema; rules about extensions and about applied directives on the document as written. An item an extension's own rule already rejects (a field the type has, a second field of one name in the extension) isn't merged, so that one fault breaks one rule. So:

- "The named type must already be defined and must be a(n) … type" is two checks: `extensionTargetDefined` (`extend type Story` with no `Story`; §3.6.3's own example) and `extensionTargetKind` (`extend type S` where `S` is a scalar). A built-in scalar is defined.
- "must have unique names", "must be unique" within one extension is `extensionItemsUnique`; "must not be already defined on the previous … type" is `extensionItemsNew`, for fields, enum values, member types and input fields, including an item an earlier extension added.
- §3.6.3's "Any interfaces provided must not be already implemented by the previous Object type" is `extensionInterfacesNew`. §3.7.1 has no such rule for interface extensions, so the extended interface type keeps every interface an extension adds, and one the type already implements is there twice. That breaks §3.7's "An interface type may declare that it implements one or more unique interfaces", `implementsUnique` (`implementsUnique.3`, `extend interface I implements A` where `I` already implements `A`, and `.4`, where an earlier extension added it).
- "Any non-repeatable directives provided must not already apply to the previous …", for the schema and all six kinds, is `extensionDirectivesNotReapplied`; for directives, §3.13.6's is `directiveExtensionNotReapplied`. §3.13's `@delegateField` example, applied once more by an extension, is the repeatable valid sibling.
- §3.10.2's "The @oneOf directive must not be provided by an Input Object type extension" is `extensionOneOf` (since September 2025). The extended type isn't OneOf.
- The rest of each kind's list is checked on the extended schema, by the checks that already state it. §3.6.3's "The resulting extended object type must be a super-set of all interfaces it implements" and §3.7.1's "Any Object or Interface type which implemented the previous Interface type must also be a super-set of the fields of the Interface type extension" are `implFieldProvided` (both cite §3.6.3 and §3.7.1, and §3.7.1's `NamedEntity` example is a pair); the fields an extension adds are checked by §3.6's field rules (`fieldNameReserved.3`, `extend type Query { __b: Int }`); §3.8.1's member types by `unionMembersObjects`; §3.10.2's OneOf rules for the fields an extension adds to a OneOf input object by `oneOfFieldNullable` and `oneOfFieldNoDefault` (which cite §3.10.2).
- §3.13.6 (new in September 2026): "The previous directive must already be defined" is `directiveExtensionDefined`; "must not contain the use of a Directive which references the previous directive directly" is `directiveExtensionUsesPrevious` (`extend directive @d @d`); "… indirectly" is `directiveExtensionReferencesPrevious`, following the extended schema, through another directive's definition or an argument's input type. All four are since September 2026. The search follows the directives as extended, so a cycle that runs through other directive extensions counts too (`extend directive @d @e` then `extend directive @e @d`). A directive extension's own directives aren't merged into the directive's definition for §3.13's rules, so a cycle it makes isn't counted again under `directiveUsesItself` or `directiveReferencesItselfIndirectly`.
- §3.13.4's "It must not appear on built-in scalar types" is `specifiedByNotBuiltin`: `extend scalar Int @specifiedBy(url: "…")` is the only way a document can do it without declaring the scalar.

October 2021 says "the original" type where September 2025 and later say "the previous". A vector whose fault is against an item only an earlier extension added (`extend type Query { b: Int } extend type Query { b: Int }`) is tagged since September 2025.

**One schema definition.** §3.3: "When using the type system definition language, a document must include at most one `schema` definition." `schemaDefinitionUnique` has one pair. Its invalid schema has two definitions that name the same root, so its roots are the same however a reader takes the two.

A failing vector counts toward one finding. Each finding has a `kind`: `not enforced`, `over-strict` (a rejected valid schema), `crash` or `malformed`.

- Accepted invalid schemas: one finding per rule, "RULE not enforced".
- Crashes on invalid schemas: one finding per rule and crash message, "RULE: crashes on a schema that breaks only this rule".
- Rejected valid schemas, and crashes on valid schemas: one finding per kind and **error message**, whatever the rule, under `acceptsValid`. The message is the first error in the answer's `errors` (or the crash's message), with the schema's own names, quoted text and numbers taken out, so that one error on two schemas groups. The finding's `hint` lists the rules the vectors' invalid siblings break, and `problem` gives the message. So a rule the spec doesn't have, such as "an interface needs an implementation", is one finding with every rule it touches in its hint, not one "over-strict" finding per rule. A finding calls its rule `likelyOverStrict` only when it has one rule in its hint, its vectors come from at least two of that rule's pairs, and another valid sibling of the rule is accepted. Otherwise which rule the implementation applied is a guess, and the message says. A rejection with no `errors` is grouped by its hint.

The run fails on any failing check, an answer without a boolean `valid`, or a failed self-test.

**Editions.** The kit grades September 2026, the latest release: every expected answer is `TypeSystem!Verdict`, and every `basis` quotes September 2026. October 2021 lacks some of its rules and syntax, and each of those first appeared in September 2025 or September 2026:

- rules new in September 2025, with the same wording as in September 2026: `argNamesUnique` (October 2021's Type Validation lists for objects, interfaces and directives have no argument uniqueness rule), `requiredArgNotDeprecated` and `requiredInputFieldNotDeprecated` (deprecated arguments and input fields), `argDefaultCompatible` and `inputObjectDefaultValueCycle` (default value validation), `implDeprecation`, `oneOfFieldNullable` and `oneOfFieldNoDefault`, `directiveLocationsDefined` (October 2021's list for directives starts at "must not contain the use of a directive which references itself directly"), and `extensionOneOf`. Their checks carry `"since": "September2025"`;
- rules new in September 2026: §3.13.6's `directiveExtensionDefined`, `directiveExtensionNotReapplied`, `directiveExtensionUsesPrevious` and `directiveExtensionReferencesPrevious`. Their checks carry `"since": "September2026"`;
- a rule reworded in September 2025: the extension rules' "the original" type became "the previous" one (above);
- a sentence new in September 2025: §3.3.1's "can omit the schema definition when ... no other type uses any _default root type name_", without which a document with no schema definition and a type named `Mutation` that isn't an object type reads as a valid schema with no mutation root (`rootTypesAreObjects.2.invalid`, below);
- syntax new in September 2025: `@oneOf`, `@deprecated` on an argument or input field, and so `@deprecated` on a field of an input object extension. New in September 2026: directives on a directive definition (`DIRECTIVE_DEFINITION`, graphql-spec #1206), and `extend directive`;
- a rule that changed in September 2026: `inputObjectUnbreakableCycle`. September 2025 and October 2021 say "If an Input Object references itself either directly or through referenced Input Objects, at least one of the fields in the chain of references must be either a nullable or a List type." September 2026 replaced that with "InputObjectHasUnbreakableCycle(inputObject) must be false" (graphql-spec #1211), which also finds OneOf input objects that no finite value inhabits. The two agree on plain input objects. A OneOf input object's fields are nullable, so the older rule never finds a chain through one. `TypeSystem.tla` states the older rule too (`HasNoUnbrokenNonNullChain`, used only by `VerdictSeptember2025`), and the generator compares the two verdicts on every schema. Three invalid schemas differ: `inputObjectUnbreakableCycle.4.invalid` (`input First @oneOf { second: Second } input Second { first: First! }`), `.5.invalid` (`input A @oneOf { b: B } input B @oneOf { a: A }`) and `.6.invalid`, which makes `.4`'s cycle with an extension. September 2025 accepts all three. Their valid siblings are valid in both releases.

A vector carries `since`, the first release whose text gives its verdict, with the features in `editionNote`, when October 2021 doesn't give that verdict. That is an invalid schema that breaks a rule new in September 2025 (October 2021 would accept it), any schema that uses new syntax, or a schema whose validity differs under September 2025's rules (since September 2026). A valid sibling of a new rule is not tagged unless it uses new syntax itself, because dropping a rule can't make a valid schema invalid. `type Query { f(x: Int, y: Int): Int }`, the sibling of an `argNamesUnique` pair, is valid in every release, so rejecting it is a failure under any of them.

A failing vector **relies on** its `since` release when the answer is a verdict: accepting a tagged invalid schema, or rejecting a tagged valid one. An implementation of an older release can give that answer and still follow its edition. A **crash is never tagged by release**. Under older releases every tagged schema still has a verdict, valid (`input I { i: I = {} }` breaks no October 2021 rule) or invalid (it uses a directive or location October 2021 doesn't define), and a crash is neither, so it fails in every release. Findings count the vectors that rely on each release (`since`, such as `{ "September2025": 3 }`), and mark their example `[since September 2025]` or `[since September 2026]`. A check with such failures gives `failingSince`, how many of its failing vectors rely on each release (zeros left out). A new rule's check whose failures include crashes says so in its note. The report's `since` gives, for each release, how many graded vectors are tagged with it and how many failed relying on it.

**Self-test.** Every run also judges deliberately wrong answers, and requires each to be caught: every vector's verdict flipped, the next vector's answer where it differs, an answer without `valid`, and a crash on a valid and on an invalid schema, which must count as crashes even with the right `valid`. It also builds reports from answers that are right but for a few, and requires, for each release, that a crash on an invalid schema tagged with it isn't counted under it while accepting the schema is, that rejecting (or crashing on) one valid schema fails `acceptsValid` and not its pair's rule and names no rule as likely over-strict, and that one message on valid siblings of two rules is one finding. It requires that a failing INFO check doesn't fail the run and a failing MUST check does, and that a vector needing a capability isn't graded without it. That makes 1004 negative controls for an adapter that claims `schema-extensions`, and 742 for one that doesn't. The expected answers themselves must all pass. The checker also fails if an `unspecified` vector is graded.

## Vectors

[`kit/schema/vectors.json`](../../kit/schema/vectors.json) holds 505 vectors: 255 pairs, in which five invalid schemas have two valid siblings each, so 250 invalid and 255 valid schemas. 501 are graded; 4 are `unspecified`. 135 have extensions and need `schema-extensions`, so an adapter without it is asked 367. [`scripts/generate-vectors-schema.mjs`](../../scripts/generate-vectors-schema.mjs) writes it from the pairs it lists, after evaluating `TypeSystem!Verdict` on each schema with tla-ts. It fails unless every invalid schema breaks exactly its rule and every sibling breaks none, so a pair can't quietly test something else. `--check` regenerates the file and fails if it differs. graphql-js only parses the SDL; the generator reads it with `schemaVerdictData`, which adds the number of schema definitions, the document's extensions, and the directives the document applies (each with its name, location, the element it is on, which extension applies it, and its arguments) to the schema data the introspect area also uses.

Each vector has:
- **`rule`:** the rule its pair is about;
- **`verdict`:** the reference's `Verdict`, `[rule]` or `[]`;
- **`expected`:** `{ "valid": verdict = [] }`;
- **`pair`:** its sibling's id. A valid sibling names its invalid schema;
- **`siblings`:** on an invalid schema with more than one valid sibling, all of them. `inputObjectUnbreakableCycle.1.invalid` (§3.10's `self: Example!`) has a nullable and a list sibling, and `requiredArgNotDeprecated.1.invalid` a nullable one and one with a default. The generator keeps an invalid schema listed in two pairs once, so it isn't graded twice;
- **`since`** and **`editionNote`:** the first release whose text gives the vector's verdict, `"September2025"` or `"September2026"`, and the features it relies on, for a vector whose verdict or syntax October 2021 doesn't have (98 vectors: 67 since September 2025, 44 invalid and 23 valid; 31 since September 2026, 17 invalid and 14 valid);
- **`requires`:** `["schema-extensions"]` on a vector whose SDL has an extension (135 vectors);
- **`unspecified`:** why the spec doesn't settle the vector's verdict. These vectors aren't sent to the adapter or graded (4 vectors, below);
- **`origin`:** for the 31 pairs taken from the spec's own examples, counter-examples and coercion rules, or a sentence that settles the vector, where they come from. They include the ones `specs/TypeSystemVectors.tla` also checks, such as §3.10's circular input objects, §3.7's `Image` that must also implement `Node`, §3.13's `@invalidExample`, §3.6.3's `Story` extension and §3.7.1's `NamedEntity` extension.

The schemas come from [`scripts/differential-type-system.mjs`](../../scripts/differential-type-system.mjs): its hand-written cases and its scenario families, which are the vectors' `family`. The generator adds what the differential doesn't generate: undefined types, two schema definitions, directives applied where they don't belong or with arguments that don't fit, more steps of IsValidImplementation (on interfaces too), and extensions.

| Family | Vectors | What it is |
| --- | --- | --- |
| `names` | 54 | duplicate names (across kinds too), names starting with `__` on every kind of type, field, argument and directive, types named like built-ins |
| `root` | 26 | root operation types, with and without a schema definition, an undefined root, a scalar or union root, two schema definitions |
| `typeUse` | 33 | output and input types in the wrong place, undefined types, empty types, deprecated required arguments |
| `defaults` | 28 | default values that don't coerce, including §3.10's and §3.10.1's coercion tables, nested lists, enums, OneOf in a list, and a Float out of a double's range |
| `implementation` | 65 | IsValidImplementation, step by step, for object and interface types, an undefined interface, a cycle of interfaces |
| `union` | 18 | union members, an undefined one included |
| `enum` | 6 | enum values |
| `input` | 44 | input fields, OneOf, cycles of Non-Null fields and of default values |
| `directive` | 96 | directives that reference themselves (through `DIRECTIVE_DEFINITION` too), undefined directives, the location matrix, `@specifiedBy` on a built-in scalar, repeated directives and applied arguments (INFO) |
| `extension` | 131 | type, schema and directive extensions, each with `requires: ["schema-extensions"]` |

Some rules have a second pair that only steers around a restriction an implementation adds, so that the invalid schema can't be rejected for that other reason. Hot Chocolate rejects a referenced interface that no object type implements, a rule the spec doesn't have, so it would reject an interface-only invalid schema whatever it does about the rule under test. `implementsItself.2`, `fieldNamesUnique.3`, `requiredArgNotDeprecated.5` and `implTransitive.3` give the interface an implementing object type. `implTransitive.3` is the cycle `interface A implements B`, `interface B implements A`, with `type Query implements A & B`: §3.7's "Interface definitions must not contain cyclic references nor implement themselves". `directiveUsesItself.2` and `directiveReferencesItselfIndirectly.4` allow their directives on `INPUT_FIELD_DEFINITION` too (graphql-ruby checks a directive's arguments as input fields). The first pairs stay as they are.

**Where the formal rule and the prose disagree.** §3.13 rule 3 says "A Directive definition must not contain the use of a Directive which references itself indirectly by referencing a Type or Directive which transitively includes a reference to this Directive." It speaks only of the directives a definition uses. The prose above it is broader: "While defining a directive, it must not reference itself directly or indirectly". `TypeSystem.tla` follows the prose, and also follows the directive's own argument types. Two invalid schemas depend on that reading, since their directive definition uses no directive at all and reaches itself only through its argument's type. They are `unspecified` and aren't graded:

| Vector | Schema |
| --- | --- |
| `directiveReferencesItselfIndirectly.1.invalid` | `directive @d(a: In) on INPUT_FIELD_DEFINITION input In { f: Int @d } type Query { a(x: In): Int }` |
| `directiveReferencesItselfIndirectly.3.invalid` | `directive @d(c: Color) on ENUM_VALUE enum Color { RED @d BLUE } type Query { a: Color }` |

Their valid siblings are valid under either reading, and are graded. So is `directiveReferencesItselfIndirectly.2.invalid`, where `@d` uses `@e` and `@e` uses `@d`, which breaks the formal rule too, and `.7.invalid`, where `@d` uses `@e`, whose argument's type `X` names the type `Y`, which uses `@d`; `X` also uses a directive `@Y`, and the reference keeps type names and directive names apart, so the type `Y` is still followed.

**A type named Mutation that isn't an object type.** `rootTypesAreObjects.2.invalid` is `type Query { a: Int } interface Mutation { a: Int }`, with no schema definition. `TypeSystem.tla` takes `Mutation` as the mutation root, an interface, so the schema breaks "If it is provided, it must be an Object type" (§3.3.1), and the vector is graded under `rootTypesAreObjects`. That `Mutation` is the root is said only by an example ("The schema definition must be included, otherwise the {"Mutation"} type would be incorrectly presumed to be the {`mutation`} _root operation type_ of the schema"), but every reading consistent with §3.3.1's normative sentence rejects the document: "The type system definition language can omit the schema definition when each _root operation type_ uses its respective _default root type name_, no other type uses any _default root type name_, and the schema does not have a description." If `Mutation` isn't the mutation root, it is another type that uses a default root type name, so the document can't omit the schema definition. Only the reason differs. The "no other type" clause is new in September 2025, and October 2021 says only that SDL "can omit the schema definition when the {`query`}, {`mutation`}, and {`subscription`} root types are named {"Query"}, {"Mutation"}, and {"Subscription"} respectively", which allows reading the document as a valid schema with no mutation root. So the vector has `since` September 2025. Its valid sibling has `schema { query: Query }`; `rootTypesAreObjects.1.invalid` (`interface Query { a: Int }`) and `.3.invalid` (`schema { query: Q mutation: In }`) are invalid in every release.

**Declaring a built-in scalar.** §3.3 says "No provided type may have a name which conflicts with any built in types (including Scalar and Introspection types)." §3.5 adds: "When representing a GraphQL schema using the type system definition language, all built-in scalars must be omitted for brevity." That second sentence binds whoever prints SDL. The spec doesn't say whether a schema that declares a built-in scalar anyway, as `scalar String`, provides a type that conflicts with the built-in, which a consumer must reject, or just names the built-in. `TypeSystem.tla` reads it as a conflict. The generator marks any `typeNameNotBuiltin` vector that declares `scalar Int`, `Float`, `String`, `Boolean` or `ID` as `unspecified`:

| Vector | Schema |
| --- | --- |
| `typeNameNotBuiltin.1.invalid` | `scalar String type Query { a: Int }` |

Its valid sibling, `scalar Str`, is graded. So is `typeNameNotBuiltin.2.invalid`, `type Int { a: String } type Query { a: String }`: an object type is not a built-in scalar, so it conflicts under any reading.

**A schema extension without a schema definition.** §3.3.2: "The Schema must already be defined." A document with no `schema` definition still has a schema, with the default root names (§3.3.1). Whether that schema is "already defined" for an `extend schema` in the same document, the spec doesn't say. `TypeSystem.tla` reads the rule as "the document has a schema definition", and the extension adds no root operation types otherwise. The one vector that depends on it is `unspecified`, so `schemaExtensionDefined` is never graded:

| Vector | Schema |
| --- | --- |
| `schemaExtensionDefined.1.invalid` | `directive @d on SCHEMA type Query { a: Int } extend schema @d` |

Its valid sibling, which has `schema { query: Query }`, is graded.

## graphql-js

[`adapters/graphql-js/areas/schema.mjs`](../../adapters/graphql-js/areas/schema.mjs) runs `buildSchema`, which applies the SDL rules and the document's extensions, then `validateSchema`. It claims `schema-extensions`. A `GraphQLError`, or the plain `Error` `buildSchema` throws with the SDL rules' messages, is a rejection. Any other exception propagates, and the adapter answers with an `error`: a crash. The findings below aren't encoded as expected answers. Those on definitions are the deviations `differential-type-system.mjs` documents in `VALIDATION_DEVIATIONS`; the differential has no extensions.

Both versions:
- **`typeNameNotBuiltin`:** accept `type Int { … }` and `enum Boolean { … }` (3 schemas). They also accept `scalar String`, which is `unspecified` and isn't graded;
- **`directiveUsesItself`:** accept §3.13's `@invalidExample`, and the same use on a directive also allowed on input fields (2 schemas);
- **`directiveReferencesItselfIndirectly`:** accept a directive that reaches itself through another directive (4 schemas, one of them through a type named like a directive it uses). They also accept the two `unspecified` schemas above, which aren't graded;
- **`extensionOneOf`:** accept `extend input In @oneOf` (2 schemas, since September 2025);
- **`appliedDirectiveArguments`** (INFO): accept `@d(x: "a")` for `x: Int`, and `@d(x: {})` where the input object has a required field. They check the arguments of built-in directives.

17 also:
- **`argDefaultCompatible`:** accepts `type Query { f(x: Float = 1e400): Int }`, a Float default that no finite double represents (§3.5.2; since September 2025);
- **`directiveUsesItself`**, **`directiveReferencesItselfIndirectly`:** accepts `directive @d @d on DIRECTIVE_DEFINITION`, and two directives that apply each other in their definitions (since September 2026);
- **`directiveExtensionDefined`**, **`directiveExtensionUsesPrevious`**, **`directiveExtensionReferencesPrevious`:** parses `extend directive`, but checks none of §3.13.6's rules: it accepts an extension of an undefined directive, `extend directive @d @d`, and an extension of `@d` that applies a directive whose definition, or extension, reaches `@d` (6 schemas, since September 2026). It does reject a non-repeatable directive the extension applies again.

16 also:
- **`argDefaultCompatible`:** doesn't validate default values (14 schemas, all since September 2025);
- **`rootTypesDifferent`:** accepts the same type for two root operations (4 schemas);
- **`implDeprecation`:** accepts a deprecated field implementing one that isn't (2 schemas, since September 2025);
- **`inputObjectUnbreakableCycle`:** ignores OneOf input objects, so it accepts `inputObjectUnbreakableCycle.4.invalid`, `.5.invalid` and `.6.invalid`, such as `input A @oneOf { b: B } input B @oneOf { a: A }` (`.6` makes the cycle with an extension). All three are since September 2026: September 2025's rule accepts them too;
- **crashes:** overflows the stack (`RangeError: Maximum call stack size exceeded`) on an input field whose default is an object literal of an input type still being built, with a default value cycle or without. That fails `inputObjectDefaultValueCycle` on its 4 invalid schemas, such as `input I { i: I = {} }`, and `acceptsValid` on 3 valid ones, such as `input I { i: I = {i: null} }`, which break no rule in any release. The crashes aren't tagged by release: October 2021 has no default value rule, so it calls all 7 schemas valid, and a crash is no verdict;
- **directive definitions with directives, and `extend directive`:** both are syntax errors in 16, so it rejects 13 valid schemas (`acceptsValid`, all since September 2026), such as `directive @d @deprecated on FIELD`, and its answers on the invalid ones say nothing about §3.13.6;
- **`appliedDirectiveArguments`** (INFO): also accepts `@deprecated(reason: null)` (since September 2025).

17 judges 479 of the 501 graded schemas as the reference does, 16 judges 444 (and crashes on 7). Of the 62 checks with vectors, 17 passes 53 and 16 passes 51; each has one failing INFO check, which doesn't fail the run. `directiveLocationsDefined` and `schemaExtensionDefined` are untested. Both enforce every other extension rule: undefined and wrong-kind targets, repeated and existing items, interfaces, reapplied directives, and `@specifiedBy` on a built-in scalar.

## Limits

- **Pairs, not coverage:** each rule is exercised by a handful of hand-picked pairs. The differential runs hundreds of generated schemas against graphql-js; the kit doesn't, so an implementation can pass here and still get a rarer schema wrong.
- **The reference's rules only:** undefined types, directive locations and undefined directives are checked (see [What is checked](#what-is-checked)). The arguments of a directive applied in SDL, and a non-repeatable directive applied twice by one definition, are graded as INFO only, since §3 doesn't state them. Every valid sibling avoids them.
- **Extensions, one document:** the kit sends definitions and extensions in one document. It doesn't ask an implementation to extend a schema it has already built, which some implementations do differently.
- **Extension order:** the reference finds an extension's previous type wherever its definition is in the document. The spec doesn't say whether a definition after its extension is "already defined", and no vector puts an extension first.
- **Not vectored:** an extension of a built-in scalar other than to apply `@specifiedBy`, or of a built-in directive; redefining a built-in directive (`directive @include(…) on FIELD`, which §3.3's "unique names" and §3.13's "any built-in directive may be omitted" leave open); an `extend schema` that names a root operation type the schema already has (the reference keeps the first, and §3.3.2 has no rule); and an implementation's extra argument `b: Int! = 1` (§3.6's "must not be required, e.g. must not be of a non-nullable type" reads stricter than "required", which §3.6 defines with a default).
- **Default values:** September 2026 states default value compatibility for object field arguments only (§3.6). An implementation that also checks interface field arguments, input fields and directive arguments, as graphql-js 17 does, isn't marked over-strict, because no valid sibling has a bad default there.
- **Input field defaults inside a default:** when the reference checks an argument's default value, an input field the value leaves out isn't given its own default. §3.10 says the coerced default "should be used", a SHOULD. With `input I { x: Int = "a" }`, the reference finds `f(a: I = {}): Int` compatible, though following the SHOULD makes it incompatible. No vector depends on this: none has an argument default that leaves out an input field with a default.
- **Float defaults:** a Float default must be a finite double, so `1e400` is rejected. "A value outside the available precision" isn't checked.
- **Two schema definitions:** `schemaDefinitionUnique` checks that a document has at most one. Which roots a document with two definitions has isn't defined (the kit's SDL reader keeps the last), so its only invalid vector has two that name the same root.
- **Int defaults of any size coerce:** §3.5.1 says an Int input value outside 32 bits should raise a request error, a SHOULD, so the reference doesn't reject one, the weaker reading. No vector has one.
- **Introspection types:** the spec doesn't settle whether user SDL may refer to an introspection type, as in `type Query { s: __Schema }`. §3.3 counts them as built-in types and §3.4.2 makes every Object and Enum type an output type. §4's Reserved Names says "any Name within a GraphQL type system must not start with two underscores", which, read literally, forbids the reference. `TypeSystem.tla` treats such a name as an unknown type, and no vector uses one. graphql-js accepts them.

## Spec observations

Points the spec text leaves open, found while writing these checks. None is filed upstream.

- §3.6 Type Validation 2.4.5 (an argument's default value is compatible with its type) is stated only for object field arguments. §3.7 (interface field arguments), §3.10 (input field defaults) and §3.13 (directive arguments) don't have it. `TypeSystem.tla` follows the text: `OtherDefaultsAreCompatible` is outside `Verdict`.
- §3 has no rule against a non-repeatable directive applied twice to one *definition*. The text exists only for extensions ("must not already apply to the previous …") and, for executable documents, §5.7.3. `directiveNotRepeated` is INFO.
- §3 has no rule that a directive applied in SDL has fitting arguments. §5.4 states them for executable documents. `appliedDirectiveArguments` is INFO.
- §3.3.2 has no rule against an `extend schema` that names a root operation type the schema already has.
- §3.3.2's "The Schema must already be defined" doesn't say whether a document without a `schema` definition has one (`schemaExtensionDefined.1.invalid` is `unspecified`).
- "already defined" in §3.3.2, §3.5.6 to §3.10.2 and §3.13.6 doesn't say whether a definition later in the same document counts.
- §3.13.6 doesn't say whether a built-in directive can be the "previous directive" of `extend directive`; §3.5.6 likewise for built-in scalars. §3.5's and §3.13.4's MUST against `@specifiedBy` on a built-in scalar implies that `extend scalar Int` is at least parseable.
- §3.6.3 has "Any interfaces provided must not be already implemented by the previous Object type"; §3.7.1 has no such rule for interface type extensions. §3.7's "one or more unique interfaces" still rejects the resulting type, so the kit grades an interface extension that re-adds an interface under `implementsUnique`.
- October 2021 states the extension rules against "the original" type, September 2025 and later against "the previous" one. The two differ for a document with two extensions of one type.
- §3.5's "a service must not include a type called Int and use it to represent 64-bit numbers" is a MUST, while §3.5.1's range checks (input and result) are SHOULD; the kit grades the SHOULD.
- §3.13.2's "must" on combining `@skip` and `@include` sits in a Note, which Appendix A makes non-normative; the behaviour is normative through CollectFields (§6.3.2).
