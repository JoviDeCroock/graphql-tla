# The validate area

`graphql-tla run validate` checks validation (§5): whether an implementation accepts exactly the documents the spec calls valid against a schema. The reference is [`specs/Validation.tla`](../../specs/Validation.tla). Each of its rules returns the set of things in a document that break it. That lets the kit pick documents that break one rule, or in 21 cases two rules (see [Rules that can't break alone](#limits)), and get a verdict per rule. It never has to ask the implementation which rule it applied. It covers every rule of §5:

- §5.1.1 Executable Definitions;
- §5.2 operations, §5.3 fields, §5.4 arguments and §5.5 fragments;
- §5.6 values, §5.7 directives and §5.8 variables.

```shell
npx graphql-tla run validate --adapter "node adapters/graphql-js/adapter.mjs --graphql 17" --strict --report validate.json
```

The area follows [the contract for areas beyond execution](../kit-areas.md).

## Request

```json
{"type":"validate","id":12,"schema":"type Query { … }","document":"{ user { name } }"}
```

- **`schema`:** SDL for a valid schema. The vectors use six schemas (see [Vectors](#vectors)). Two of them declare a OneOf Input Object, and only vectors tagged draft use those.
- **`document`:** a GraphQL document. Every document parses (§2). A few hold type system definitions, which §5.1.1 rejects. An implementation whose parser refuses those outright should answer `"valid": false` for them, since the document is still rejected.

Build the schema, parse the document and validate it with every rule the implementation applies to requests. Every schema is valid and every document parses, so if building or parsing fails, or the validator itself crashes, answer `{"type":"error","id":12,"message":"…"}`. The kit reports the vector as a crash (see [Result](#result)).

## Capabilities

| Capability | Meaning |
| --- | --- |
| `custom-scalar-literals` | A custom scalar declared in the request's SDL (`scalar Json`) accepts every literal: numbers, strings, booleans, enum values, lists and input objects. That is what graphql-js's `buildSchema` gives a scalar with no parser of its own. |

How a custom scalar coerces a literal is up to the service (§3.5.6), and the spec never says what `Json` must accept. So the vectors that give a literal to a custom scalar are graded only for adapters with `custom-scalar-literals`. There are 9 of them, all for §5.8.2 (see [Schemas](#vectors)). Without the capability §5.8.2 is untested.

## Result

```json
{"type":"result","id":12,"valid":false,"errors":[{"message":"Cannot query field \"nickname\" on type \"Pet\".","locations":[{"line":1,"column":9}]}]}
```

- **`valid`:** `true` if the implementation would go on to execute the document, `false` if it rejects it with validation errors.
- **`errors`** (optional): the validation errors, each with an optional `message` and `locations`. They aren't checked, but the report quotes the first message in a finding, which helps tell what the implementation objected to.

An answer whose `valid` isn't a boolean counts as malformed. Malformed answers are counted under `adapterProblems` and fail the run.

**Crashes.** If the implementation crashes on a vector, say the validator throws a null dereference, answer with an `error` rather than a verdict. The kit reports the vector as a crash and goes on ([the protocol](../kit-areas.md#protocol)). Only the message's first line reaches the report. Answer `valid: false` only when the implementation reports validation errors: an adapter that turns every exception into `valid: false` hides its crashes, which then pass on invalid documents.

The graphql-js adapter ([`adapters/graphql-js/areas/validate.mjs`](../../adapters/graphql-js/areas/validate.mjs)) uses `buildSchema`, `parse` and `validate` with the default rules, and claims `custom-scalar-literals`. graphql-js 16 can throw from inside `validate()` (a subscription with `@skip(if: $v)` at its root). The adapter still counts that as rejecting the document, so the throw isn't reported as a crash.

## Verdicts

Each vector has the reference's answer, `expected.valid`. There are three kinds of failure. Only the first bears on a rule by itself:

- **Not enforced:** the implementation accepts an invalid vector. None of the rules the vector breaks caught it, so each of them fails. This is conclusive. Most invalid vectors break one rule. The 21 that break two fail both checks, never just one.
- **A valid document rejected:** the implementation rejects a valid vector. This fails `acceptsValid`, not a rule's check. The kit doesn't read error messages, so it can't tell which rule the implementation applied. The finding names the rules the vector's invalid siblings break as a hint. A spec example that is valid has no sibling, so its hint is the example's own rule.

  A finding says a rule is *likely* over-strict only when the evidence points at it. At least 3 rejected valid vectors must share that hint, and they must be siblings of at least 3 different invalid vectors. A valid vector of the same family and hint must also be accepted. Otherwise the finding gives the hint and says it is a guess.
- **A crash:** the adapter answered with an `error`. The implementation gave no verdict, so a crash counts where a wrong answer would. On an invalid vector it fails each rule the vector breaks; on a valid one, `acceptsValid`, with the hint. Crashes have their own findings, with `"kind": "crash"` and the adapter's message as `problem`. The summary counts them apart from agreements.

There is one check per rule, at MUST, cited by its section, and `acceptsValid`, at MUST, cited by §5 itself:

| Check | Section | Check | Section |
| --- | --- | --- | --- |
| `executableDefinitions` | §5.1.1 | `fragmentsMustBeUsed` | §5.5.1.4 |
| `operationTypeExistence` | §5.2.1.1 | `fragmentSpreadTargetDefined` | §5.5.2.1 |
| `operationNameUniqueness` | §5.2.2.1 | `fragmentSpreadsMustNotFormCycles` | §5.5.2.2 |
| `loneAnonymousOperation` | §5.2.3.1 | `fragmentSpreadIsPossible` | §5.5.2.3 |
| `singleRootField` | §5.2.4.1 | `valuesOfCorrectType` | §5.6.1 |
| `fieldSelections` | §5.3.1 | `inputObjectFieldNames` | §5.6.2 |
| `fieldSelectionMerging` | §5.3.2 | `inputObjectFieldUniqueness` | §5.6.3 |
| `leafFieldSelections` | §5.3.3 | `inputObjectRequiredFields` | §5.6.4 |
| `argumentNames` | §5.4.1 | `directivesAreDefined` | §5.7.1 |
| `argumentUniqueness` | §5.4.2 | `directivesAreInValidLocations` | §5.7.2 |
| `requiredArguments` | §5.4.3 | `directivesAreUniquePerLocation` | §5.7.3 |
| `fragmentNameUniqueness` | §5.5.1.1 | `variableUniqueness` | §5.8.1 |
| `fragmentSpreadTypeExistence` | §5.5.1.2 | `variablesAreInputTypes` | §5.8.2 |
| `fragmentsOnObjectInterfaceOrUnionTypes` | §5.5.1.3 | `allVariableUsesDefined` | §5.8.3 |
| `acceptsValid` | §5 | `allVariablesUsed` | §5.8.4 |
| | | `allVariableUsagesAreAllowed` | §5.8.5 |

A rule's check has one of four statuses:

- **`fail`:** some invalid vector that breaks the rule was accepted.
- **`pass`:** none was accepted, and at least one of them breaks only this rule.
- **`subsumed`:** none was accepted, but every vector that breaks the rule also breaks another rule. A rejection may be the other rule's doing, so the check can't pass. This is the status of §5.6.2 and §5.6.4.
- **`untested`:** no graded vector breaks the rule.

`acceptsValid` fails if any valid vector was rejected, and passes otherwise. Findings group failures by kind and rules: "§5.3.2 isn't enforced" and "valid documents rejected, hint §5.3.2" are separate findings. Each finding's example is the spec's own example where one failed, and otherwise the shortest failing document.

**Draft-only vectors.** A vector tagged `"edition": "draft"` relies on something only the draft has, and `editionNote` says what. Findings count them (`draftOnly`) and mark their example `[draft]`. Each check gives `failingDraftOnly`, how many of its failing vectors are draft-only, so a check whose failures are all draft-only can be told apart. The report's `draftOnly` gives how many graded vectors are draft-only and how many of those failed. They are graded like any other vector. 207 vectors carry the tag, one of them `unspecified` as well:

- 12 break §5.2.1.1 Operation Type Existence, which is new in the draft;
- 23 break §5.2.4.1 Single Root Field with `@skip` or `@include` at a subscription's root, which only the draft forbids. The October 2021 edition applies those directives instead, so it may give these a different answer;
- 8 break §5.6.1 or §5.8.5 only because an input object is OneOf. The generator finds them by evaluating the reference again with every input object's `oneOf` turned off;
- 16 are valid documents that give a value to a OneOf Input Object;
- 141 need a schema with a OneOf Input Object for another reason: they name its type or the argument that takes it, so their verdict changes without it (see [Schemas](#vectors));
- 7 rely on the draft's coercion of nested lists. The draft coerces `[1]` for `[[Int]]` to `[[1]]` (§3.11's table: `[1, 2, 3]` gives `[[1], [2], [3]]`). October 2021's table gives "Error: Incorrect item value" for the same input, so there the literal breaks §5.6.1. That makes the 4 valid vectors invalid, and the 3 invalid ones (`FieldSelectionMerging-668`, `FragmentsMustBeUsed-73`, `DirectivesAreDefined-21`) break a second rule. The generator tags every vector with a list item that isn't a list, null or a variable where the item type is a list, unless it already breaks §5.6.1. October 2021's prose ("this may apply recursively for nested lists") contradicts its own table, so that edition doesn't settle it.

No vector uses draft-only grammar. Every document parses with graphql-js 16, so none has a description on an operation.

**Self-test.** Every run also checks answers against the same checker on purpose:

- every verdict flipped, and every answer taken from a vector with the opposite verdict: every vector must be flagged, and no check may pass or be `subsumed`;
- `valid` sent as a string: every answer must be malformed;
- every vector crashed, each crash carrying the right `valid`: every vector must count as a crash, every finding must be a crash, and no check may pass or be `subsumed`;
- every document rejected: `acceptsValid` must fail, no rule's check may fail, and §5.6.2 and §5.6.4 must be `subsumed`;
- every document accepted: every rule's check with a vector must fail;
- one valid vector rejected: `acceptsValid` must fail, and no finding may name a rule as likely over-strict;
- 3 valid siblings of one rule rejected, with the rest of their family accepted: a finding must name the rule as likely over-strict.

The reference's own answers must also come out clean, with §5.6.2 and §5.6.4 `subsumed`.

## Vectors

[`kit/validate/vectors.json`](../../kit/validate/vectors.json) holds 3,100 vectors, 2,114 invalid and 986 valid. `schemas` holds the SDL they refer to by name. [`scripts/generate-vectors-validate.mjs`](../../scripts/generate-vectors-validate.mjs) writes it. tla-ts evaluates every rule of `Validation.tla` on every candidate document, and the vectors are chosen from those verdicts. `--check` regenerates the file and fails if it differs.

Each invalid vector records the rules it breaks and the subjects each rule reports (`"violations": {"FieldSelectionMerging": ["conflict"]}`), and `siblings` lists its valid siblings. A vector may also carry:

- **`requires`:** `["custom-scalar-literals"]` when the document gives a literal to a custom scalar;
- **`unspecified`:** why the spec doesn't settle the vector. These vectors aren't sent to the adapter or graded;
- **`edition`** and **`editionNote`:** `"draft"` and the reason, as above.

12 vectors are `unspecified`. An adapter with every capability is graded on 3,088 vectors, 206 of them draft-only. One without `custom-scalar-literals` is graded on 3,079.

**Where the documents come from:**

| Family | Schema | What it is |
| --- | --- | --- |
| `cycles`, `spreads`, `merging`, `variables`, `values`, `leaves`, `operations`, `directives`, `names`, `executable` | `differential` | The systematic families of [`scripts/differential-validation.mjs`](../../scripts/differential-validation.mjs), and its schema. The generator copies them, so keep the two in step. |
| `random` | `differential` | The differential's seeded random documents (1,200, seed 1). Up to 15 pairs per rule come from these. |
| `extra` | `differential`, `scalars` | A few documents for rules the families rarely break alone, and introspection queries: `__schema` and `__type` on the query root, under another type, and at a subscription's root. |
| `spec` | `examples`, `hello` | The spec's examples, from `Validation.tla`'s test vectors, over the spec's example schema. |

The tables name the schema each document is evaluated against. A vector that needs the OneOf Input Object names `differentialOneOf` or `examplesOneOf` instead (see Schemas below).

Each family document is also tried without any variable definitions it never uses. The `merging` family declares `$x` and `$y` on every document, so without this almost all of its documents would also break §5.8.4.

**Pairs.** An invalid vector breaks exactly one rule, except for the 19 that break §5.6.2 or §5.6.4 together with §5.6.1, and the 2 that select `__schema` or `__type` at a subscription's root (see [Limits](#limits)). Its sibling is the nearest valid document: a document of the same family at most a few tokens away, or the invalid document with one part removed (a selection, argument, directive, variable definition, object field, list item, selection set, alias, default value, type condition, or a variable type's outer `!`). Every valid document of a systematic family is also paired with its nearest invalid neighbour. That way a valid document that one rule's check might wrongly reject, such as a block string argument that equals a plain string, always becomes a vector.

**The spec's examples.** The spec writes most of its examples as a lone fragment, or uses variables it never defines. On their own, these documents would also break §5.5.1.4 or §5.8.3. Where it helps, the generator adds an operation that spreads each unused fragment, and defines each undefined variable with the type of the position it is used in. It keeps the least changed version that breaks only the example's rule, or no rule for a valid example. `completed` says what was added. About 110 examples become vectors. The 22 left out are listed under `specExamplesLeftOut`, with the reason:

- 6 select fields the example schema doesn't define (`color`, `mutateDog`, `field`);
- 7 break a second rule as written: 4 leave out a required argument, one passes `null` to a Non-Null argument, one gives a OneOf field a nullable variable, and one (added by `Validation.tla`, not the spec) is a fragment cycle;
- 3 are fragments on a type that no field reaches, so they stay unused (§5.5.1.4). One of them is `interfaceWithInterface`, which `Validation.tla` records as invalid though the spec's prose calls it valid (see below);
- 6 don't parse: an empty selection set `{ }`, or a body the spec elides.

**Schemas.** `examples` and `hello` are printed from the reference's own schema records. The reference records only that an argument has a default, not which, so `optionalBooleanArg` gets `false`. `scalars` has a custom scalar, `Json`. §5.8.2 Variables Are Input Types needs it. A variable of an output type is either unused (§5.8.4) or used where an input type is expected (§5.8.5). The one exception is inside an object literal given to a custom scalar, which has no expected type. Those 9 vectors (4 invalid, 5 valid) need `custom-scalar-literals`. Without it, a scalar that rejects object literals would make the valid ones invalid under §5.6.1. It would also let an implementation reject the invalid ones under §5.6.1 and get credit for §5.8.2.

**Schemas and OneOf.** The differential schema declares `input Pick @oneOf`, and the example schema `input PetInput @oneOf`. OneOf Input Objects are new in the draft, so an implementation of October 2021 can't build either schema. The generator evaluates every document against the schemas as written. It then evaluates each vector again against the same schema without its OneOf Input Object: `differential` drops `Pick` and the `pick` argument, and `examples` drops `PetInput` with the mutation fields that require it, and so the `Mutation` root. A vector whose violations are the same there is asked against that version, under the plain name. The 165 whose verdict changes keep the schema with the OneOf Input Object (`differentialOneOf`, `examplesOneOf`), and all of them are tagged draft. Vector ids don't depend on the schema a vector is asked against.

**Where the formal text and the prose disagree.** §5.5.2.3's formal text intersects the possible types of the fragment's type and the parent type. An interface that no object type implements has no possible types, so the formal text rejects every spread involving it. The differential schema's `Resource` is such an interface. The prose says "an interface type fragment can always be spread into an interface scope which it implements", and doesn't say whether an interface may be spread into its own scope. graphql-js accepts the second case and rejects the first. These 6 vectors are `unspecified` and aren't graded:

| Vector | Spread | Document |
| --- | --- | --- |
| `FragmentSpreadIsPossible-19` | `Resource` in `Node` | `{ node(id: "1") { ... on Resource { __typename } } }` |
| `FragmentSpreadIsPossible-21` | `Resource` in `Node` | `{ node(id: "1") { ...F } } fragment F on Resource { __typename }` |
| `FragmentSpreadIsPossible-20` | `Resource` in `Resource` | `{ resource { ... @include(if: true) { __typename } } }` |
| `FragmentSpreadIsPossible-22` | `Resource` in `Resource` | `{ resource { ... on Resource { __typename } } }` |
| `FragmentSpreadIsPossible-23` | `Resource` in `Resource` | `{ resource { ...F } } fragment F on Resource { __typename }` |
| `FragmentSpreadIsPossible-36` | `Resource` in `Resource` | a random document with `... on Resource` inside `resource` |

The generator marks every vector whose only violations are spreads of an interface into an interface that it is or implements. A spread of `Node` into `Resource` stays graded: the prose's rule for abstract types in abstract scope also asks for a shared possible type, so the two texts agree.

§5.8.5 disagrees with itself on OneOf too. Its formal text lets a nullable variable into a OneOf field when "a default value exists for {variableDefinition} and is not the value {null}". Its prose says "Variables used for OneOf Input Object fields must be non-nullable." `Validation.tla` follows the formal text, and its `OneOfProseOnly` gives the usages only the prose rejects. The generator evaluates it on every vector that uses a OneOf Input Object, and marks a vector `unspecified` when the prose would change the rules it breaks. One vector qualifies, and graphql-js 16 and 17 follow the prose on it:

| Vector | Document |
| --- | --- |
| `AllVariableUsagesAreAllowed-valid-30` | `query Q($v: ID = "1") { echo(pick: {id: $v}) }` |

**Where "identical" isn't defined.** §5.3.2 says two fields of one response name "must have identical sets of arguments", and doesn't say what identical means. `Validation.tla` compares literal values: a block string equals a quoted string with the same value, `1` differs from `1.0`, and input object fields compare as a set. Two other readings are as defensible: the literals' text, or the coerced argument values. The explanatory text says "the field and arguments to execute and the resulting value should be unambiguous", which fits coerced values best. The generator evaluates both other readings. It rewrites each field's arguments into strings that compare as the reading does, coerced values including argument defaults, and evaluates §5.3.2 again on every vector with two fields of one response name where one of them has arguments or argument defaults. A vector whose verdict differs under either reading is `unspecified`:

| Vector | Document | Reference | Other reading |
| --- | --- | --- | --- |
| `FieldSelectionMerging-valid-11` | `{ a: search(term: "x") { __typename } a: search(term: """x""") { __typename } }` | valid | text: invalid |
| `FieldSelectionMerging-107` | `{ a: echo(opt: 1) a: echo }` | invalid | coerced (`opt` defaults to 1): valid |
| `FieldSelectionMerging-108` | `{ a: echo(list: [1]) a: echo(list: 1) }` | invalid | coerced: valid |
| `FieldSelectionMerging-109` | `{ a: echo(float: 1) a: echo(float: 1.0) }` | invalid | coerced: valid |
| `FieldSelectionMerging-110` | `{ a: echo(int: 1) a: echo(int: 1, opt: 1) }` | invalid | coerced: valid |

Under every reading the arguments are a set, so their order never matters, and a variable equals only itself, as the spec's examples `conflictingArgsValueAndVar` and `conflictingArgsWithVars` show. The coerced reading uses graphql-js's `valueFromAST` to coerce, which only decides whether a vector is marked; every verdict is still the reference's.

## Limits

- **Rules that can't break alone.** §5.6.1 asks for a value coercible to its type, and input coercion (§3.10.1) already rejects an unknown or missing input field. So every document that breaks §5.6.2 Input Object Field Names or §5.6.4 Input Object Required Fields also breaks §5.6.1. Their 19 vectors break both rules. Accepting one fails both checks. Rejecting them all leaves §5.6.2 and §5.6.4 `subsumed`, since §5.6.1 alone may have rejected them. The generator fails if the reference ever reports either rule alone.
- **Introspection fields at a subscription's root.** §5.2.4.1 forbids an introspection field as a subscription's root field. `__typename` breaks only that rule, but `__schema` and `__type` exist only on the query root (§4.2), and the root types must all be different (§3.3.1). So `subscription { __type(name: "Post") { name } }` also breaks §5.3.1. Its 2 vectors (`SingleRootField-53` and `-54`) count against both rules, like the 19 above.
- **Error locations aren't checked.** The reference's violations name subjects, such as `User.name`, `$v` or `conflict`, not positions in the document. Locating them would mean a second implementation of each rule in JavaScript, which the kit would then have to trust. Locations are a SHOULD at most (§7.1.6), so the area leaves them out.
- **Error messages aren't read.** That is why a rejected valid document fails `acceptsValid` rather than a rule.
- **Introspection.** `Validation.tla` adds the draft's introspection types (§4.2) to every schema, with `__schema` and `__type(name: String!)` on the query root. The draft's introspection schema has fields October 2021 lacks, such as `__Type.isOneOf`; the vectors select only fields both editions have. String and Boolean, which the introspection types use, are therefore in every schema.
- **Descriptions aren't tested.** The draft says descriptions in executable documents "MUST NOT affect the execution, validation, or response of a GraphQL document" (§2.2). Pairs of documents that differ only by a description would test it, but descriptions on operations, fragments and variable definitions are draft-only grammar: graphql-js 16, which the generator parses with, rejects them, and an October 2021 parser would fail the request, which stops the run as an adapter error. So no vector has one.
- **The reference's simplifications apply.** Values of Correct Type checks literals by kind: Int, Float and ID literals are taken to be in range. Custom scalars accept any literal except a list, which `Coercible` rejects before it reaches the scalar case. No graded vector gives a list literal to a custom scalar, and the generator fails if one ever does. Field Selection Merging recurses at most 6 levels deep, which is deeper than any vector. Fragment Spread Is Possible follows the formal text; the vectors where the prose says otherwise aren't graded (see above).
- **Undefined built-in scalars.** A schema contains only the built-in scalars it references, and String and Boolean (see Introspection). `$v: Int` against a schema without `Int` breaks §5.8.2. Every schema here references the scalars its documents use.
- **Some discrepancies can't be seen.** Some of the differential's documented graphql-js discrepancies need a document that breaks two rules, such as a subscription that collects no root field, or a fragment spread only by an unused fragment. Others concern which rule reports an error, not whether the document is rejected. The validate area can't show either kind.
