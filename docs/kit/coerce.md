# The coerce area

`graphql-tla run coerce` checks input coercion: how an implementation turns variable values and argument literals into the arguments a resolver gets, and when it refuses them. It also checks which operation a request runs. The reference is [`specs/Coercion.tla`](../../specs/Coercion.tla). It covers:

- §2.10.4, the Unicode text of string literals (escapes and block strings), from [`specs/Lexer.tla`](../../specs/Lexer.tla);
- §3.5.1 to §3.5.5, the built-in scalars;
- §3.9 enums, §3.10 input objects, §3.10.1 OneOf input objects (the draft only), §3.11 lists and §3.12 Non-Null;
- §6.1 GetOperation, §6.1.1 validating requests, §6.1.2 CoerceVariableValues and §6.4.1 CoerceArgumentValues;
- §7.1.3 and §7.1.6, the shape of request errors and of every error.

```shell
npx graphql-tla run coerce --adapter "node adapters/graphql-js/adapter.mjs --graphql 17" --strict --report coerce.json
```

The area follows [the contract for areas beyond execution](../kit-areas.md).

## Request

```json
{"type":"coerce","id":12,"schema":"enum Color { RED GREEN BLUE } … type Query { … }","document":"query($x: Int) { int(v: $x) }","variables":"{\"x\": 2147483648}"}
```

- **`schema`:** SDL. Every vector uses the same schema, which has one root field per argument type, and one mutation field, except the 20 OneOf vectors, whose schema adds §3.10.1's `ExampleOneOfInputObject @oneOf` and a field `oneOfExample` that takes it. Each root field returns a nullable `String`.
- **`document`:** one or more operations, each selecting one root field, or no operation at all.
- **`variables`:** the request's variables as **raw JSON text**. Parse them with your implementation's own JSON parser, as a server would. Some vectors depend on that parser (see [Big numbers](#big-numbers)).
- **`operationName`:** the operation to run. Absent when the request doesn't name one.

Build the schema with a resolver on every field that records its path and the arguments it got, and returns a non-null value. Then execute the document, as your implementation would execute a request.

## Result

The adapter sends back what happened, and the kit decides what it means:

```json
{"type":"result","id":12,"response":{"data":{"int":"ok"}},"calls":[{"path":["int"],"arguments":{"v":2}}]}
```

- **`response`:** the execution result, as your implementation would serialize it: `data` and `errors` as they are.
- **`calls`:** one entry per resolver call, in order. `path` is the field's response path, and `arguments` is the argument map the resolver got, as JSON:
  - Int and Float as numbers, String and ID as strings, Boolean as booleans;
  - enum values as their names;
  - lists as arrays, input objects as objects;
  - an argument or input object field that has no value is left out;
  - a value that JSON can't represent, such as a non-finite float, as a string (`"Infinity"`).

Any other fields are ignored, but appear in the report's examples.

**Variables the transport can't carry.** If the adapter's JSON parser can't read the variables at all because a string holds a lone surrogate (as Ruby's `JSON.parse` refuses `"\ud800"` written as an escape), answer `{"type":"result","id":12,"unsupported":"lone surrogate: why"}`. The kit doesn't grade the vector, and the report's provenance counts it under `skipped` ("unsupported by the adapter"), rather than crediting the implementation with an answer it never gave. The kit honours `unsupported` only where the vector's variables really hold a lone surrogate (19 vectors). Anywhere else it is graded as a crash. A run where nothing was graded fails.

**No response.** If the implementation produces no response at all, say because executing the request throws instead of returning a result, answer `{"type":"error","id":12,"message":"…"}`. The kit records the outcome "no response" and goes on ([the protocol](../kit-areas.md#protocol)). Only the message's first line reaches the report. Don't make up a response for it: an empty `response`, or a request error the implementation never produced, would be graded as something the implementation didn't do. Execution has a message of its own for this, `no-response`; the coerce area uses `error`, as parse, validate and schema do for a crash, so a `noResponse` field in a result is ignored like any other.

The kit classifies each result as one of five outcomes:

| Outcome | The result shows |
| --- | --- |
| request error (§7.1.3) | no `data` entry, at least one error, and no resolver call. A result with `"data": null` instead of no entry is also a request error, but fails `requestErrorNoData` |
| field error | `data` holding only the field, which is null, exactly one error, and no resolver call. The error's path should be the field's response path, `["int"]`. Another path, such as the argument's `["v"]`, or none, still makes a field error, but fails `fieldErrorPath` |
| value | `data` holding only the field, which isn't null, no errors, and exactly one resolver call, at that field. Its `arguments` are the coerced arguments |
| no response | the adapter answered with an `error`. It never matches an answer, not even a request error, since a request error is a response |
| other | anything else, for example a request error after a resolver ran. It never matches an answer |

A request error or field error whose errors aren't all maps with a string `message` (`[null]`, `{}`, `{"message": 1}`, or a field error with only a `path`) is still classified, but fails `errorFormat` wherever its outcome would otherwise pass (§7.1.6: "Every error must contain an entry with the key {"message"} with a string description"). A value whose response has `"errors": []` is still a value, but fails `errorsList`.

## Capabilities

| Capability | Meaning |
| --- | --- |
| `coerce` | The adapter answers `coerce` requests. |
| `absent-vs-null` | `arguments` tells an absent entry from a null one. Without it, null and absent count as the same at a declared argument or input field whose type is nullable, and the vectors that only that distinction can tell apart are skipped. An entry that no argument or input field declares never matches, null or not. |
| `unvalidated` | The adapter executes a document without validating it. Without it, the kit takes the adapter to validate first, and grades the invalid documents under `invalidNotExecuted` or `onlyValidExecuted` (see [Validation](#validation)). |
| `exact-numbers` | The adapter's JSON parser reads every number exactly. Without it, the vectors whose answer depends on how a parser reads big numbers are graded under the informational `jsonNumbers` check, not under Float or ID. |

## What is checked

Each vector's `expected` answer is `Coercion!ExecuteRequest` for the request. Where the spec permits more than one answer, or doesn't say which, the vector also lists the others. A result passes when its outcome, field and arguments match an answer that passes. Numbers are compared as numbers and keys in any order.

Each vector belongs to one check, by the outermost type its value meets. That is how the spec's own tables file their examples: §3.11 lists `[1, "b", true]` under List, and §3.10 lists `{ a: "abc", b: "123" }` under Input Objects. A variable with a default is filed under `variables` when the request leaves it out or sends null (the default is used, or null overrides it), and by its value's type when the request gives a value, as in the `variable` family. A vector whose expected request error comes from CoerceVariableValues also exercises `variables`, and one that expects a field error also exercises `arguments`. Getting the kind of error wrong counts against those two. A list or input object vector rests first on the vectors that hold its items or fields on their own (see [Attribution](#attribution)).

### Attribution

One rule broken inside a list or an input object would otherwise fail every check whose type holds it: JSON `1.0` refused for Int fails `int` for `query($x: Int)`, but also `list` for `[Int]` and `inputObject` for `{"x": 1.0}` as a `Point`. So each list and input object vector names the `literal` or `variable` vectors that hold its items, its single value (which §3.11 wraps), or its fields, on their own (`restsOn`): `{"x": 1.0}` as `[Int]` rests on `{"x": 1.0}` as `Int`, and `{ points(v: { x: 1, z: 1 }) }` on `{ pointNN(v: { x: 1, z: 1 }) }`. If a vector fails its own check, and a vector it rests on fails its own check the same way (both reject, both accept, both produce no response, and so on), the failure counts where the inner vector's does, transitively. The finding says how many of its vectors came that way ("through an item or field that fails on its own"). If the inner vector passes, or fails another way, the failure stays with the list or input object rule: the implementation broke that rule itself. A failure of a cross-cutting check (`requestErrorNoData`, `fieldErrorPath`, `errorFormat`, `responds` and the validation checks) never moves.

A vector whose answer depends on how the JSON parser reads a big number is `jsonNumbers`' for adapters without `exact-numbers` (see [Big numbers](#big-numbers)), except where a binary64 read gives a value the type must reject: `1e400` read as Infinity for ID. A value there is ID's failure (§3.5.5: "Any other input value, including float input values (such as `4.0`), must raise a request error"), so it counts against `id`, not `jsonNumbers`.

### Validation

For an adapter without `unvalidated`, the kit can't see from a response whether a request error came from the validator or from coercion, or whether the implementation's validator knew an invalid document was invalid. If the adapter also claims `validate`, the kit asks: it sends the vector's schema and document as a `validate` request ([validate](validate.md)), once per document, and takes the answer as the implementation's own validator's verdict.

- **An invalid document** (Validation.tla rejects it) that the implementation executes: §6.1.1 says "If validation errors are known, they should be reported in the list of "errors" in the response and the request must fail without operation execution". If the implementation's validator rejects the document, the errors are known, and executing it fails `invalidNotExecuted` (MUST). If the validator accepts it, the errors aren't known: the rule the validator misses is the validate area's to grade (at MUST), and executing the document fails only `onlyValidExecuted`, the SHOULD of "only operations from documents which pass all validation rules should be executed" (§6.1.1) and "execution should only occur for valid requests" (§5). Without `validate`, the kit can't tell, and grades the weaker `onlyValidExecuted`. October 2021 says the same.
- **A valid document** answered with a request error that the implementation's validator rejects: the request never reached coercion, so the failure isn't the coercion rule's. It fails `acceptsValid` (§5, MUST, as in the validate area), whatever the vector expects, even a request error. A request error the validator doesn't explain is graded as usual.

Each check has the level of the sentence it grades. Where a section mixes MUST and SHOULD, the check is split. Where the level is in doubt, the check takes the weaker one. Where October 2021 gives a weaker level, the report's `oct2021` says so.

| Check | Section | Level | What it covers |
| --- | --- | --- | --- |
| `stringValue` | §2.10.4 | MUST | A string literal's Unicode text: escape sequences, and a block string's common indentation, blank first and last lines and `\"""`. The static semantics have no key word, but they define the value §3.5.3 accepts. Only escapes and block strings that read the same in both editions are used. Expected texts come from `Lexer.tla`. |
| `int` | §3.5.1 | MUST | Int accepts only integer input values: not floats, strings or booleans. JSON `1.0` is an integer. |
| `intRange` | §3.5.1 | SHOULD | Int rejects integers outside the signed 32-bit range |
| `float` | §3.5.2 | MUST | Float accepts integer and float input values, and rejects non-finite values and other kinds |
| `floatPrecision` | §3.5.2 | SHOULD | Float rejects an integer a double can't hold exactly. The sentence is a MUST, but what "outside the available precision" covers is the reference's reading: a fraction such as `0.1` has no exact double either, and is accepted. So the check takes the weaker level. |
| `string` | §3.5.3 | MUST | String accepts only strings. A JSON string with a lone surrogate is `loneSurrogates`'s. |
| `boolean` | §3.5.4 | MUST | Boolean accepts only booleans |
| `idCoerced` | §3.5.5 | SHOULD | Strings and integers are coerced to ID. An ID made from an integer may use any format that writes the integer's exact value: `"1e+21"` and `"1000000000000000000000"` both pass for 10^21. |
| `id` | §3.5.5 | MUST | ID rejects everything else, including floats |
| `enum` | §3.9 | MUST | Enum literals of the enum's own values; not string literals, and not unknown values. Taking a JSON string as an enum value is a MAY, so a value and a request error both pass. |
| `inputObject` | §3.10 | MUST | An object with only defined fields, required fields (a MUST by §3.12), and variables in fields |
| `inputFieldDefaults` | §3.10 | SHOULD | An omitted input field gets its default value. The SHOULD applies to each field: a result that is right except for leaving out some or all of such defaults fails this check, not `inputObject`. Every entry the result does have must still be right. |
| `oneOf` | §3.10.1 | MUST | The draft only. "exactly one entry and that entry must not be null or the null literal, otherwise a request error must be raised", and the coerced map "must contain exactly one entry and the value for that entry must not be null, otherwise an execution error must be raised": §3.10.1's table of examples and six more, all draft-only, on the OneOf schema |
| `list` | §3.11 | MUST | Each item coerced, a single value wrapped in a list (recursively), variables as items. An item that isn't a list, where the item type is a list, becomes a list of one, in both editions (see [Editions](#editions)). For an item that is a variable with no runtime value, the spec doesn't say what happens, so null, a field error and the item left out all pass (see [Readings](#readings)). |
| `nonNull` | §3.12 | MUST | The literal null for a Non-Null argument |
| `variables` | §6.1.2 | MUST | Variable defaults (including null), missing and null values, a Non-Null variable, and a value that can't be coerced as a request error, even for an unused variable |
| `arguments` | §6.4.1 | MUST | Argument defaults, a missing variable falling back to the default, an explicit null not replaced by the default, a null variable for a Non-Null argument, and a literal that can't be coerced as a field error |
| `getOperation` | §6.1 | MUST | The operation `operationName` names, or the only operation when there is no name; otherwise a request error. A mutation runs its mutation field, and only the selected operation's variables are coerced. |
| `invalidNotExecuted` | §6.1.1 | MUST | For adapters without `unvalidated` that claim `validate`: a document that Validation.tla rejects, and the implementation's own validator rejects too, fails as a request error, with no resolver called (see [Validation](#validation)). |
| `onlyValidExecuted` | §6.1.1, §5 | SHOULD | For adapters without `unvalidated`: a document that Validation.tla rejects, but whose errors the implementation's validator doesn't report (or the kit can't ask), isn't executed. "only operations from documents which pass all validation rules should be executed" |
| `acceptsValid` | §5 | MUST | For adapters without `unvalidated` that claim `validate`: a valid document isn't refused at validation. A request error on a valid vector whose document the implementation's validator rejects fails here, not under the vector's own check |
| `requestErrorNoData` | §7.1.3 | MUST | A request error has no `data` entry. The draft: "The _request error result_ map must not contain an entry with key {"data"}." October 2021, §7.1: "If the request failed before execution, due to a syntax error, missing information, or validation error, this entry must not be present", and §7.1.2: "If a request error is raised, execution does not begin and the `data` entry in the response must not be present." Its §7.1.1 also has a "should not be present", but the two MUST sentences are the ones about request errors, so the check is a MUST in both editions. Every vector that accepts a request error exercises it. A vector that fails its own check doesn't also count here. |
| `responds` | §7 | MUST | A request gets a response, as in execution: "When a GraphQL service receives a _request_, it must return a well-formed response." No response fails it, except on a vector whose reference answer is a request error under a MUST check: there it fails the vector's own check, as "produces no response where §X requires a request error". Every other vector exercises it. |
| `fieldErrorPath` | §7.1.6, §7.1.4 | MUST | A field error's path is the field's response path. §7.1.6: an error associated with a field "must contain an entry with the key {"path"} with a _response path_ which describes the _response position_ which raised the error", and a response path names response positions (§7.1.4), not arguments. Every vector that accepts a field error exercises it. A field error the vector expects, but at another path, fails only this check. A field error the vector doesn't expect fails the vector's check, whatever its path. |
| `errorFormat` | §7.1.6 | MUST | Every error is a map with a string `message`, in both editions. Every vector exercises it |
| `errorsList` | §7.1.1 | MUST | `errors`, when present, is a non-empty list: execution's check of the same name. The draft: "If the request completed without raising any errors, this entry must not be present." October 2021, §7.1, says the same with "must"; its §7.1.2 also has a "should not be present", but the §7.1 MUST is the sentence about the entry, so the check is a MUST in both editions, as in execution. A value with `"errors": []` fails it. Every vector exercises it |
| `loneSurrogates` | none | INFO | A JSON string with a lone surrogate, for String or ID: kept as sent, replaced with U+FFFD, or refused with a request error. All three pass, and the report records which happened. It never fails the run (see [Lone surrogates](#lone-surrogates)). |
| `jsonNumbers` | none | INFO | For adapters without `exact-numbers`: a big JSON number may be read exactly, read as the nearest double, or refused with a request error (RFC 8259 §6). It never fails the run. |

Findings group failures by kind and check:
- accepts what §X rejects;
- rejects what §X accepts;
- coerces to the wrong value under §X;
- runs a different operation than §6.1 selects;
- raises a field error where §6.1.2 requires a request error, or a request error where §6.4.1 requires a field error;
- leaves a SHOULD undone (`inputFieldDefaults`);
- gives October 2021's answer where the draft changed it (a draft-only vector, counted against its check);
- follows October 2021's §3.11 table of examples, which its prose contradicts (counted against `list`, in both editions);
- rejects a valid document at validation (`acceptsValid`);
- answers with an error that isn't a map with a string message (`errorFormat`);
- answers a value with an empty `errors` list (`errorsList`);
- answers a request error with a `data` entry (`requestErrorNoData`);
- produces no response, though §7 says every request gets one (`responds`), or produces no response where §X requires a request error. Both have `"kind": "crash"` and the adapter's message as `problem`, and the summary counts them apart;
- raises the field error with a path other than the field's response path (`fieldErrorPath`);
- treats a lone surrogate in a way nothing explains (`loneSurrogates`);
- executes a document its own validator rejects (`invalidNotExecuted`), or an invalid document its validator doesn't reject (`onlyValidExecuted`);
- reads a big JSON number in a way nothing explains (`jsonNumbers`);
- answers with none of the three outcomes: a request error, a field error or a value.

The run fails on any failing MUST check, a failing SHOULD check with `--strict`, a result not in the format above, or a failed self-test.

**Self-test.** Every run also judges results built on purpose, in the same capabilities, through the same classification and comparison. Every answer a vector accepts must pass, and so must the expected answer with its null entries dropped, without `absent-vs-null`. Each of these wrong results must be caught:
- every verdict flipped (a value, a field error, a request error), where the spec doesn't permit the flipped answer;
- the answer to the nearest vector whose answer isn't accepted;
- an answer that leaves a SHOULD undone, which must count against that SHOULD's check;
- an answer that leaves out one input field default but keeps another, which must count against `inputFieldDefaults`, and the same answer with the kept default wrong, which must count against the vector's check;
- October 2021's answer to a draft-only vector, and the answer of October 2021's §3.11 table, which must each count against the vector's check;
- a request error on a valid vector whose document the validator rejects, which must count against `acceptsValid` (for adapters that validate), while the reference's own request error, which the validator doesn't explain, must pass;
- an undeclared null argument, and an undeclared null input field;
- a request error with `"data": null`, which must count against `requestErrorNoData`, or a request error after a resolver ran;
- a request error or field error whose error is `null`, has no `message`, or a `message` that isn't a string, each of which must count against `errorFormat`;
- a value with `"errors": []`, which must count against `errorsList`;
- no response, which must count against the vector's check where the reference expects a request error under a MUST, and against `responds` otherwise;
- a field error without a path, at the argument's path `["v"]`, or at a path inside the field, each of which must count against `fieldErrorPath`, or a field error after the resolver ran;
- a field error at the argument's path where the vector doesn't accept a field error, which must not count against `fieldErrorPath`;
- a value with an error, from two resolver calls, or from a call at another field;
- a list or input object vector failing the way a vector it rests on fails, which must count where the inner one does, and the same vector failing while the inner one passes, or fails another way, which must stay with its own check.

## Vectors

[`kit/coerce/vectors.json`](../../kit/coerce/vectors.json) holds the schema, the OneOf vectors' schema (`schemas.oneOf`), the declarations of every argument and input field (`inputs`), and 2068 vectors. [`scripts/generate-vectors-coerce.mjs`](../../scripts/generate-vectors-coerce.mjs) writes it. `--check` regenerates it and fails if it differs. graphql-js only parses the SDL and documents there, and finds the string literals in them. Every answer comes from the references:

- **`expected`:** `Coercion!ExecuteRequest` under the reference's default policy, which follows every SHOULD and takes JSON strings as enum values. `field` is the root field `Coercion!GetOperation` selected. A string literal's text, wherever one appears, is `Lexer!StringValueAt`'s.
- **`alternatives`:** the other answers the spec permits, from `ExecuteRequest` under the other policies. `policy` names the switches each needs: `enumFromString` (a MAY, so the answer passes), `inputFieldDefaults` (a SHOULD, so the answer fails `inputFieldDefaults`, as does one that leaves out only some of those defaults), or `missingListItemError` and `missingListItemDropped` (readings of what the spec doesn't say, so the answer passes; see [Readings](#readings)). `oct2021` is October 2021's answer to a draft-only vector: it fails the vector's check, but under its own finding. `oct2021Example` is the answer October 2021's §3.11 table of examples gives (see [Editions](#editions)), and with `validating` the request error a service whose validator follows the table too gives (only graded for adapters without `unvalidated`): they fail the vector's check, under their own finding.
- **`edition`** and **`editionNote`:** `"draft"` where October 2021's text gives another answer, or has no OneOf input objects, why, and that answer (see [Editions](#editions)).
- **`schema`:** `"oneOf"` for the OneOf vectors, whose schema is `schemas.oneOf`.
- **`restsOn`:** the vectors that hold this one's list items or input object fields on their own (see [Attribution](#attribution)). 546 vectors have one or more.
- **`binary64`:** the answer when the variables are read as a binary64 JSON parser reads them, where that differs from `expected`.
- **`loneSurrogate`:** `kept` and `replaced`, the answers when a JSON string's lone surrogate is kept as sent or replaced with U+FFFD, where they differ from `expected`. Such a vector's check is `loneSurrogates`.
- **`valid`:** `Validation!IsValid` for the document, and Coercion's scalar coercion for every Int and Float literal. §5.6.1 asks for literals to be "coercible", but `Validation.tla` checks literals by kind only.
- **`requires`:** `unvalidated` for the 26 documents that are invalid only because a literal doesn't coerce, such as `{ int(v: 2147483648) }`: whether a validator must catch them rests on Int's SHOULD and the reference's reading of Float's precision, so they aren't graded under `invalidNotExecuted`. `absent-vs-null` for vectors on the same field whose arguments differ only in a null entry versus an absent one, such as `{ int }` versus `{ int(v: null) }`.
- **`idFromInteger`:** the ID argument comes from an integer, so its format is the service's.
- **`check`, `spec`:** the check and sections the vector belongs to.
- **`operationName`:** the request's operation name, where it has one.

The operations are the same as [`scripts/differential-coercion.mjs`](../../scripts/differential-coercion.mjs) uses, plus the spec's own examples and operation selection. The families are:

| Family | Vectors | What it is |
| --- | --- | --- |
| `literal` | 893 | `{ field(v: <literal>) }` for 47 literals and every field |
| `variable` | 931 | `query($x: <argument type>) { field(v: $x) }`, with `$x` missing and set to each of 48 JSON values |
| `variable-default` | 88 | a variable with a default, missing, null and set, and `= null` defaults |
| `nullable-variable` | 12 | a nullable variable for a Non-Null argument |
| `omitted` | 19 | the argument left out |
| `nested-variable` | 42 | variables inside list and input object literals |
| `arguments` | 10 | a field with two arguments, one Non-Null with a default |
| `unused-variable` | 3 | variables no field uses |
| `spec-example` | 16 | §3.10's table of examples, with its `ExampleInputObject` |
| `oneOf` | 20 | §3.10.1's table of examples, with its `ExampleOneOfInputObject`, and six more: a Non-Null variable and a null variable for a member field, a JSON map with one field, with an unknown field and a string, and a literal with an unknown field |
| `string-value` | 12 | `{ string(v: <literal>) }` for escapes and block strings |
| `operation` | 22 | documents with no operation, one, or several (named, anonymous plus named, a query and a mutation), with `operationName` absent, matching or naming no operation, and variables only the unselected operation declares |

1257 vectors are valid. 785 are invalid by `Validation.tla`, and 26 more only by a literal. 82 need `absent-vs-null`. 84 have alternatives: 7 a MAY-only one, 59 one without input field defaults, 4 the other readings of a variable item with no runtime value, 16 October 2021's answer, and 11 the answer of October 2021's §3.11 table (5 of them also its validating form). 3 have a `binary64` answer and 2 a `loneSurrogate` one. 45 are draft-only: 25 for default values and the 20 OneOf vectors. Expected outcomes: 470 values, 801 field errors, 797 request errors.

### Readings

A list item can be a variable: `query($x: Int) { ints(v: [1, $x]) }`. When the request gives `$x` no value and it has no default, §3.11 and §6.4.1 don't say what the item coerces to. §3.10 does say what happens for an input object field in the same spot: no runtime value and no default means no entry. A list has no entries to leave out. `Coercion.tla` reads the item as null by default, as graphql-js does, which is also what §5.8.5 implies by letting a nullable variable into a nullable item position. Its `missingListItem` switch gives the other two readings: the item can't be coerced (a field error), or the item is left out, by analogy with §3.10. All three are defensible from the text, so all three pass. Four vectors have such an item:

| Vector | Request | Expected | Also passes |
| --- | --- | --- | --- |
| `coerce-1940` | `query($x: Int) { ints(v: [1, $x]) }` with `{}` | `[1, null]` | a field error; `[1]` |
| `coerce-1943` | `query($x: Int) { intsNN(v: [1, $x]) }` with `{}` (invalid by §5.8.5) | a field error | `[1]` |
| `coerce-1951` | `query($x: Int) { matrix(v: [$x, [$x]]) }` with `{}` | `[null, [null]]` | a field error; `[[]]` |
| `coerce-1973` | `query($p: Point) { points(v: [$p]) }` with `{}` (invalid by §5.8.5) | a field error | `[]` |

### Editions

The draft coerces default values. Its CoerceVariableValues and CoerceArgumentValues say "Let {coercedDefaultValue} be the result of coercing {defaultValue} according to the input coercion rules", and its §3.10 uses "the result of coercing the default value" of an input field. October 2021 says "Add an entry to {coercedValues} named {variableName} with the value {defaultValue}" (and the same for arguments), and that an input field's "default value should be used". So under October 2021 `[Int] = 1` gives `1`, not `[1]`, and `ID = 9` gives `9`, not `"9"`. An implementation that coerces defaults anyway gets the draft's answer.

Both editions' §3.11 also coerce a list item that isn't a list, where the item type is a list, as a list of one: "list values are accepted only when each item in the list can be accepted by the list's item type", and a value that is "_not_ a list and not the {null} value" is accepted as "a list of size one ... (note this may apply recursively for nested lists)". That prose is the same in both editions. Only their tables of examples disagree on `[1, 2, 3]` for `[[Int]]`: the draft's gives `[[1], [2], [3]]`, October 2021's "Error: Incorrect item value". Examples are non-normative in both ("Examples in this document are non-normative", October 2021's conformance section), so the 11 vectors with such an item aren't draft-only. October 2021's table answer is recorded as an `oct2021Example` alternative, so that a result following it is named: it fails `list`, under its own finding, "follows October 2021's §3.11 table of examples". For the 5 literal vectors (`{ matrix(v: [1]) }` and the like), a service that follows the table in its validator too refuses the document as not "coercible" (§5.6.1), a request error. That answer is recorded as well (`validating`), and graded only for adapters without `unvalidated`. An implementation whose validator accepts the document and whose executor follows the table gives a field error, which also counts as following the table.

`Coercion.tla` follows the draft. Its `coerceDefaults` switch gives October 2021's answer for defaults, which uses each default as written, and its `nestedListItems` switch gives the answer of October 2021's table. The generator evaluates every vector under the draft, under each switch, and under both. The 25 vectors whose answers differ under `coerceDefaults` are tagged `"edition": "draft"`. `editionNote` says why and gives October 2021's answer, which is also an `oct2021` alternative unless another alternative already gives it. They are `[Int] = 1`, `[[Int]] = 1`, `ID = 9`, `Point` defaults that leave out `y` (which has its own default, 0), and `Shape`'s `tags: [String!] = "shape"`. Enum and `Float = 2` defaults give the same answer either way. The 20 OneOf vectors are draft-only too: October 2021 has no `@oneOf`, so their schema isn't valid there. The validate area still tags the nested list item documents draft-only; that is its own page's business.

Draft-only vectors are graded like any other. A result that gives October 2021's answer fails the vector's check under its own finding, "gives October 2021's answer where the draft changed it". Where October 2021's answer is also an answer without input field defaults (a `Point` default under October 2021 has no `y`), it fails `inputFieldDefaults` instead. Findings count draft-only vectors (`draftOnly`) and mark their example `[draft]`. The report's `draftOnly` gives how many were run and how many failed, and each check's `failingDraftOnly` gives how many of its failing vectors are draft-only, so a sheet can show a check whose failures are all draft-only.

### Lone surrogates

JSON can escape a lone surrogate: `{"x": "\ud800"}`. Two vectors send one, to String (`coerce-0584`) and to ID (`coerce-0786`). §3.5.3 accepts "only valid Unicode string input values" but never defines one, and calls a String "a sequence of Unicode code points", which a lone surrogate is. §3.5.5 says nothing about Unicode. What a JSON parser does with the escape varies, and RFC 8259 §8.2 calls it unpredictable: it may keep it, replace it with U+FFFD, or refuse the text. `Coercion.tla` refuses it, as a request error.

So the kit doesn't grade these two vectors under `string` or `id`. They count toward the informational `loneSurrogates` check, which passes a request error, the value kept as sent, and the value with U+FFFD, all three from `Coercion.tla`. The check's `observed` in the report counts which happened, and its `note` says it in words. The kit marks them informational, not unspecified, because what an implementation does is still worth recording. An adapter whose JSON parser refuses the variables outright answers `unsupported` instead of making up a request error (see [Result](#result)): then neither these two nor the 17 other vectors with a lone surrogate in their variables are graded, since the implementation never saw them.

### Big numbers

The JSON values include `9007199254740993` (2^53 + 1) and `1e400`. The reference reads JSON numbers exactly:
- a Float variable of 2^53 + 1 is a request error, since a double can't hold it;
- an ID variable of 2^53 + 1 is the string `"9007199254740993"`;
- an ID variable of 1e400 is a 401-digit string.

JSON lets a parser limit range and precision (RFC 8259 §6). `JSON.parse` rounds 2^53 + 1 to 2^53, and turns 1e400 into Infinity, before coercion starts. Accepting the Float 2^53 is then correct coercion. So for an adapter without `exact-numbers`, these 3 vectors count only toward `jsonNumbers`, which passes on the exact answer, the `binary64` answer, or a request error. With `exact-numbers`, they count toward `floatPrecision` and `idCoerced` against the exact answer.

## graphql-js

[`adapters/graphql-js/areas/coerce.mjs`](../../adapters/graphql-js/areas/coerce.mjs) sends the result of `execute` and its resolver calls, and supports `absent-vs-null`. It runs two ways:

- **By default**, it runs `execute` without `validate`, and claims `unvalidated`.
- **With `--validate`** (`node adapters/graphql-js/adapter.mjs --graphql 17 --validate`), it validates first and doesn't claim `unvalidated`, so the kit grades the invalid documents under `invalidNotExecuted`, asking graphql-js's validator through the validate area. Both versions pass all 785, and nothing else fails.

Unvalidated, both versions fail these checks:

- **§3.5.2 Float (MUST):** the literal `1e400` is accepted as Infinity.
- **§3.5.2 `floatPrecision` (SHOULD):** the literal `99999999999999999999` is rounded to 1e20.
- **§3.10 Input Objects (MUST), 16 only:** an unknown field in an input object literal is ignored. That happens in 5 vectors, one of them `{ points(v: { x: 1, z: 1 }) }`, which rests on `{ pointNN(v: { x: 1, z: 1 }) }` and so counts under §3.10, not §3.11. 17 rejects it.
- **§3.10.1 OneOf (MUST, draft only), 16 only:** a OneOf literal with a variable entry that has no runtime value, `{ a: "abc", b: $b }` with `$b` missing, counts as one entry (2 vectors). 17 refuses it. Both documents are invalid, so only `execute` without `validate` sees them.

Both keep a lone surrogate as sent, which `loneSurrogates` records. The big JSON numbers pass `jsonNumbers`, and the ID `1e21` passes as `"1e+21"`, though `differential-coercion.mjs` still lists these three in `KNOWN`, next to the disagreements above, since it compares with the reference's exact answer.

## Limits

- **OneOf:** only §3.10.1's input coercion, on one OneOf input object with two scalar members. An implementation that can't build a schema with `@oneOf` crashes on the 20 OneOf vectors, which are draft-only.
- **String values:** only escapes and block strings that read the same in both editions. Braced escapes (`\u{...}`) and surrogate pair escapes are left out, as is any JSON string decoding, which is the JSON parser's.
- **Editions:** only default values and list items are compared with October 2021 (see [Editions](#editions)). The schema uses no draft-only feature.
- **Fractional floats:** the reference keeps a fractional Float as its decimal rather than rounding it to a double. That is exact for decimals of at most 15 significant digits, and the vectors only use those.
- **Fixed schema:** one schema (and its OneOf variant), root fields only, no custom scalars, and no directives other than `@oneOf`. Root field names are unique across Query and Mutation, so the field a resolver ran at says which root type ran.
- **What isn't compared:** error messages and locations, how many errors a request error has, and whether a request error's errors carry a path.
- **Validity:** a vector's `valid` flag comes from `Validation.tla`, and Validation's own limits apply. For an adapter that validates and claims `validate`, a validator stricter than `Validation.tla` shows up under `acceptsValid`. Without `validate`, it shows up as a failure of the vector's own check. The kit takes the validate area's verdict to be the one the implementation's request pipeline uses.
- **Lone surrogates:** only recorded, never graded (see [Lone surrogates](#lone-surrogates)).
