# The validate area

`graphql-tla run validate` checks validation (§5): whether an implementation accepts exactly the documents the spec calls valid against a schema. The reference is [`specs/Validation.tla`](../../specs/Validation.tla). Each of its rules returns the set of things in a document that break it, so the kit can pick documents that break exactly one rule and get a verdict per rule. It never has to ask the implementation which rule it applied. It covers every rule of §5:

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

- **`schema`:** SDL for a valid schema. The vectors use four schemas (see [Vectors](#vectors)).
- **`document`:** a GraphQL document. Every document parses (§2). A few hold type system definitions, which §5.1.1 rejects. An implementation whose parser refuses those outright should answer `"valid": false` for them, since the document is still rejected.

Build the schema, parse the document and validate it with every rule the implementation applies to requests. A schema that doesn't build or a document that doesn't parse is the adapter's failure. Answer `{"type":"error"}` for those.

## Result

```json
{"type":"result","id":12,"valid":false,"errors":[{"message":"Cannot query field \"nickname\" on type \"Pet\".","locations":[{"line":1,"column":9}]}]}
```

- **`valid`:** `true` if the implementation would go on to execute the document, `false` if it rejects it with validation errors.
- **`errors`** (optional): the validation errors, each with an optional `message` and `locations`. They aren't checked, but the report quotes the first message in a finding, which helps tell what the implementation objected to.

An answer whose `valid` isn't a boolean counts as malformed. Malformed answers are counted under `adapterProblems` and fail the run.

The graphql-js adapter ([`adapters/graphql-js/areas/validate.mjs`](../../adapters/graphql-js/areas/validate.mjs)) uses `buildSchema`, `parse` and `validate` with the default rules. graphql-js 16 can throw from inside `validate()` (a subscription with `@skip(if: $v)` at its root). The request would fail, so the adapter counts that as rejecting the document.

## Verdicts

Each vector has the reference's answer, `expected.valid`. There is one check per rule, at MUST, cited by its section:

- **not enforced:** the implementation accepts an invalid vector. The vector breaks only this rule, so no other rule could have caught it. This is conclusive.
- **over-strict:** the implementation rejects a valid vector. The vector is one edit away from a document that breaks only this rule, or it is the spec's own example of a document that is valid under it. The rejection is counted against that rule. That attribution is likely, but not proven: the kit doesn't read error messages, so the implementation may have objected for a reason of its own.

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
| | | `allVariablesUsed` | §5.8.4 |
| | | `allVariableUsagesAreAllowed` | §5.8.5 |

A check fails if any of its vectors fails, passes if some vector exercised it and none failed, and is untested otherwise. Findings group the failures by kind and rule: "§5.3.2 isn't enforced" and "§5.3.2 is over-strict" are separate findings. Each finding's example is the spec's own example where one failed, and otherwise the shortest failing document.

Every run also checks wrong answers against the same checker: every verdict flipped, every answer taken from a vector with the opposite verdict, and `valid` sent as a string. The checker must flag every vector in each, and no check may pass on the first two.

## Vectors

[`kit/validate/vectors.json`](../../kit/validate/vectors.json) holds about 3,100 vectors, and `schemas` holds the SDL they refer to by name. [`scripts/generate-vectors-validate.mjs`](../../scripts/generate-vectors-validate.mjs) writes it. tla-ts evaluates every rule of `Validation.tla` on every candidate document, and the vectors are chosen from those verdicts. `--check` regenerates the file and fails if it differs.

Each invalid vector records the rules it breaks and the subjects each rule reports (`"violations": {"FieldSelectionMerging": ["conflict"]}`), and `siblings` lists its valid siblings.

**Where the documents come from:**

| Family | Schema | What it is |
| --- | --- | --- |
| `cycles`, `spreads`, `merging`, `variables`, `values`, `leaves`, `operations`, `directives`, `names`, `executable` | `differential` | The systematic families of [`scripts/differential-validation.mjs`](../../scripts/differential-validation.mjs), and its schema. The generator copies them, so keep the two in step. |
| `random` | `differential` | The differential's seeded random documents (1,200, seed 1). Up to 15 pairs per rule come from these. |
| `extra` | `differential`, `scalars` | A few documents for rules the families rarely break alone. |
| `spec` | `examples`, `hello` | The spec's examples, from `Validation.tla`'s test vectors, over the spec's example schema. |

Each family document is also tried without any variable definitions it never uses. The `merging` family declares `$x` and `$y` on every document, so without this almost all of its documents would also break §5.8.4.

**Pairs.** An invalid vector breaks exactly one rule. Its sibling is the nearest valid document: a document of the same family at most a few tokens away, or the invalid document with one part removed (a selection, argument, directive, variable definition, object field, list item, selection set, alias, default value, type condition, or a variable type's outer `!`). Every valid document of a systematic family is also paired with its nearest invalid neighbour. That way a valid document that one rule's check might wrongly reject, such as a block string argument that equals a plain string, always becomes a vector.

**The spec's examples.** The spec writes most of its examples as a lone fragment, or uses variables it never defines. On their own, these documents would also break §5.5.1.4 or §5.8.3. Where it helps, the generator adds an operation that spreads each unused fragment, and defines each undefined variable with the type of the position it is used in. It keeps the least changed version that breaks only the example's rule, or no rule for a valid example. `completed` says what was added. About 110 examples become vectors. The 22 left out are listed under `specExamplesLeftOut`, with the reason:

- 6 select fields the example schema doesn't define (`color`, `mutateDog`, `field`);
- 7 break a second rule as written: 4 leave out a required argument, one passes `null` to a Non-Null argument, one gives a OneOf field a nullable variable, and one (added by `Validation.tla`, not the spec) is a fragment cycle;
- 3 are fragments on a type that no field reaches, so they stay unused (§5.5.1.4);
- 6 don't parse: an empty selection set `{ }`, or a body the spec elides.

**Schemas.** `examples` and `hello` are printed from the reference's own schema records. The reference records only that an argument has a default, not which, so `optionalBooleanArg` gets `false`. `scalars` has a custom scalar. `VariablesAreInputTypes` (§5.8.2) needs it: a variable of an output type is either unused (§5.8.4) or used where an input type is expected (§5.8.5). The one exception is inside an object literal given to a custom scalar, which has no expected type.

## Limits

- **Rules that can't break alone.** §5.6.1 asks for a value coercible to its type, and input coercion (§3.10.1) already rejects an unknown or missing input field. So every document that breaks §5.6.2 Input Object Field Names or §5.6.4 Input Object Required Fields also breaks §5.6.1. Their vectors break both rules. Accepting one fails both checks, and the report adds a note to the two checks. The generator fails if the reference ever reports either rule alone.
- **Error locations aren't checked.** The reference's violations name subjects, such as `User.name`, `$v` or `conflict`, not positions in the document. Locating them would mean a second implementation of each rule in JavaScript, which the kit would then have to trust. Locations are a SHOULD at most (§7.1.6), so the area leaves them out.
- **Error messages aren't read.** That is why an over-strict verdict is attributed to the sibling's rule, not proven.
- **The reference's simplifications apply.** Values of Correct Type checks literals by kind: Int and ID literals are taken to be in range, and custom scalars accept any literal except a list. Field Selection Merging recurses at most 6 levels deep, which is deeper than any vector. Fragment Spread Is Possible follows the formal text: an interface that nothing implements has no possible types. So `... on Resource` inside `Resource` is invalid, though graphql-js accepts it.
- **Undefined built-in scalars.** A schema contains only the built-in scalars it references. `$v: Int` against a schema without `Int` breaks §5.8.2. Every schema here references the scalars its documents use.
- **Some discrepancies can't be seen.** Some of the differential's documented graphql-js discrepancies need a document that breaks two rules, such as a subscription that collects no root field, or a fragment spread only by an unused fragment. Others concern which rule reports an error, not whether the document is rejected. The validate area can't show either kind.
