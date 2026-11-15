# The coerce area

`graphql-tla run coerce` checks input coercion: how an implementation turns variable values and argument literals into the arguments a resolver gets, and when it refuses them. It also checks which operation a request runs. The reference is [`specs/Coercion.tla`](../../specs/Coercion.tla). It covers:

- §3.5.1 to §3.5.5, the built-in scalars;
- §3.9 enums, §3.10 input objects, §3.11 lists and §3.12 Non-Null;
- §6.1 GetOperation, §6.1.2 CoerceVariableValues and §6.4.1 CoerceArgumentValues.

```shell
npx graphql-tla run coerce --adapter "node adapters/graphql-js/adapter.mjs --graphql 17" --strict --report coerce.json
```

The area follows [the contract for areas beyond execution](../kit-areas.md).

## Request

```json
{"type":"coerce","id":12,"schema":"enum Color { RED GREEN BLUE } … type Query { … }","document":"query($x: Int) { int(v: $x) }","variables":"{\"x\": 2147483648}"}
```

- **`schema`:** SDL. Every vector uses the same schema, which has one root field per argument type, and one mutation field. Each root field returns a nullable `String`.
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

Any other fields are ignored, but appear in the report's examples. The kit classifies each result as one of four outcomes:

| Outcome | The result shows |
| --- | --- |
| request error (§7.1.3) | no `data` entry, at least one error, and no resolver call |
| field error | `data` holding only the field, which is null, exactly one error, whose path is that field, and no resolver call |
| value | `data` holding only the field, which isn't null, no errors, and exactly one resolver call, at that field. Its `arguments` are the coerced arguments |
| other | anything else, for example `"data": null` with a request error. It never matches an answer |

## Capabilities

| Capability | Meaning |
| --- | --- |
| `coerce` | The adapter answers `coerce` requests. |
| `absent-vs-null` | `arguments` tells an absent entry from a null one. Without it, null and absent count as the same at a declared argument or input field whose type is nullable, and the vectors that only that distinction can tell apart are skipped. An entry that no argument or input field declares never matches, null or not. |
| `unvalidated` | The adapter executes a document without validating it. Without it, the kit takes the adapter to validate first, and grades the invalid documents under `invalidNotExecuted`. |
| `exact-numbers` | The adapter's JSON parser reads every number exactly. Without it, the vectors whose answer depends on how a parser reads big numbers are graded under the informational `jsonNumbers` check, not under Float or ID. |

## What is checked

Each vector's `expected` answer is `Coercion!ExecuteRequest` for the request. Where the spec permits more than one answer, the vector also lists the others. A result passes when its outcome, field and arguments match an answer that passes. Numbers are compared as numbers and keys in any order.

Each vector belongs to one check, by the outermost type its value meets. That is how the spec's own tables file their examples: §3.11 lists `[1, "b", true]` under List, and §3.10 lists `{ a: "abc", b: "123" }` under Input Objects. A vector whose expected request error comes from CoerceVariableValues also exercises `variables`, and one that expects a field error also exercises `arguments`. Getting the kind of error wrong counts against those two.

Each check has the level of the sentence it grades. Where a section mixes MUST and SHOULD, the check is split. Where the level is in doubt, the check takes the weaker one.

| Check | Section | Level | What it covers |
| --- | --- | --- | --- |
| `int` | §3.5.1 | MUST | Int accepts only integer input values: not floats, strings or booleans. JSON `1.0` is an integer. |
| `intRange` | §3.5.1 | SHOULD | Int rejects integers outside the signed 32-bit range |
| `float` | §3.5.2 | MUST | Float accepts integer and float input values, and rejects non-finite values and other kinds |
| `floatPrecision` | §3.5.2 | SHOULD | Float rejects an integer a double can't hold exactly. The sentence is a MUST, but what "outside the available precision" covers is the reference's reading, so the check takes the weaker level. |
| `string` | §3.5.3 | MUST | String accepts only valid Unicode strings: not a JSON string with a lone surrogate |
| `boolean` | §3.5.4 | MUST | Boolean accepts only booleans |
| `idCoerced` | §3.5.5 | SHOULD | Strings and integers are coerced to ID. An ID made from an integer may use any format that writes the integer's exact value: `"1e+21"` and `"1000000000000000000000"` both pass for 10^21. |
| `id` | §3.5.5 | MUST | ID rejects everything else, including floats |
| `enum` | §3.9 | MUST | Enum literals of the enum's own values; not string literals, and not unknown values. Taking a JSON string as an enum value is a MAY, so a value and a request error both pass. |
| `inputObject` | §3.10 | MUST | An object with only defined fields, required fields (a MUST by §3.12), and variables in fields |
| `inputFieldDefaults` | §3.10 | SHOULD | An omitted input field gets its default value. A result that is right except for leaving such defaults out fails this check, not `inputObject`. |
| `oneOf` | §3.10.1 | MUST | Always untested: `Coercion.tla` doesn't model OneOf input objects |
| `list` | §3.11 | MUST | Each item coerced, a single value wrapped in a list (recursively), variables as items |
| `nonNull` | §3.12 | MUST | The literal null for a Non-Null argument |
| `variables` | §6.1.2 | MUST | Variable defaults (including null), missing and null values, a Non-Null variable, and a value that can't be coerced as a request error, even for an unused variable |
| `arguments` | §6.4.1 | MUST | Argument defaults, a missing variable falling back to the default, an explicit null not replaced by the default, a null variable for a Non-Null argument, and a literal that can't be coerced as a field error |
| `getOperation` | §6.1 | MUST | The operation `operationName` names, or the only operation when there is no name; otherwise a request error. A mutation runs its mutation field, and only the selected operation's variables are coerced. |
| `invalidNotExecuted` | §6.1.1 | MUST | For adapters without `unvalidated`: a document that Validation.tla rejects fails as a request error, with no `data` and no resolver called. |
| `jsonNumbers` | none | INFO | For adapters without `exact-numbers`: a big JSON number may be read exactly, read as the nearest double, or refused with a request error (RFC 8259 §6). It never fails the run. |

Findings group failures by kind and check:
- accepts what §X rejects;
- rejects what §X accepts;
- coerces to the wrong value under §X;
- runs a different operation than §6.1 selects;
- raises a field error where §6.1.2 requires a request error, or a request error where §6.4.1 requires a field error;
- leaves a SHOULD undone (`inputFieldDefaults`);
- doesn't fail an invalid document without executing it (§6.1.1);
- reads a big JSON number in a way nothing explains (`jsonNumbers`);
- answers with none of the three outcomes.

The run fails on any failing MUST check, a failing SHOULD check with `--strict`, a result not in the format above, or a failed self-test.

**Self-test.** Every run also judges results built on purpose, in the same capabilities, through the same classification and comparison. Every answer a vector accepts must pass, and so must the expected answer with its null entries dropped, without `absent-vs-null`. Each of these wrong results must be caught:
- every verdict flipped (a value, a field error, a request error), where the spec doesn't permit the flipped answer;
- the answer to the nearest vector whose answer isn't accepted;
- an answer that leaves a SHOULD undone, which must count against that SHOULD's check;
- an undeclared null argument, and an undeclared null input field;
- a request error with `"data": null`, or after a resolver ran;
- a field error without a path, or after the resolver ran;
- a value with an error, from two resolver calls, or from a call at another field.

## Vectors

[`kit/coerce/vectors.json`](../../kit/coerce/vectors.json) holds the schema, the declarations of every argument and input field (`inputs`), and 2036 vectors. [`scripts/generate-vectors-coerce.mjs`](../../scripts/generate-vectors-coerce.mjs) writes it. `--check` regenerates it and fails if it differs. graphql-js only parses the SDL and documents there. Every answer comes from the references:

- **`expected`:** `Coercion!ExecuteRequest` under the reference's default policy, which follows every SHOULD and takes JSON strings as enum values. `field` is the root field `Coercion!GetOperation` selected.
- **`alternatives`:** the other answers the spec permits, from `ExecuteRequest` under the other policies. `policy` names the switches each needs: `enumFromString` (a MAY, so the answer passes) or `inputFieldDefaults` (a SHOULD, so the answer fails `inputFieldDefaults`).
- **`binary64`:** the answer when the variables are read as a binary64 JSON parser reads them, where that differs from `expected`.
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
| `operation` | 22 | documents with no operation, one, or several (named, anonymous plus named, a query and a mutation), with `operationName` absent, matching or naming no operation, and variables only the unselected operation declares |

1235 vectors are valid. 775 are invalid by `Validation.tla`, and 26 more only by a literal. 82 need `absent-vs-null`. 63 have alternatives: 7 a MAY-only one, and 59 one without input field defaults. 3 have a `binary64` answer. Expected outcomes: 453 values, 791 field errors, 792 request errors.

### Big numbers

The JSON values include `9007199254740993` (2^53 + 1) and `1e400`. The reference reads JSON numbers exactly:
- a Float variable of 2^53 + 1 is a request error, since a double can't hold it;
- an ID variable of 2^53 + 1 is the string `"9007199254740993"`;
- an ID variable of 1e400 is a 401-digit string.

JSON lets a parser limit range and precision (RFC 8259 §6). `JSON.parse` rounds 2^53 + 1 to 2^53, and turns 1e400 into Infinity, before coercion starts. Accepting the Float 2^53 is then correct coercion. So for an adapter without `exact-numbers`, these 3 vectors count only toward `jsonNumbers`, which passes on the exact answer, the `binary64` answer, or a request error. With `exact-numbers`, they count toward `floatPrecision` and `idCoerced` against the exact answer.

## graphql-js

[`adapters/graphql-js/areas/coerce.mjs`](../../adapters/graphql-js/areas/coerce.mjs) sends the result of `execute` and its resolver calls, and supports `absent-vs-null`. It runs two ways:

- **By default**, it runs `execute` without `validate`, and claims `unvalidated`.
- **With `--validate`** (`node adapters/graphql-js/adapter.mjs --graphql 17 --validate`), it validates first and doesn't claim `unvalidated`, so the kit grades the invalid documents under `invalidNotExecuted`. Both versions pass all 775.

Unvalidated, both versions fail these checks:

- **§3.5.2 Float (MUST):** the literal `1e400` is accepted as Infinity.
- **§3.5.2 `floatPrecision` (SHOULD):** the literal `99999999999999999999` is rounded to 1e20.
- **§3.5.3 String, §3.5.5 ID (MUST):** a JSON string with a lone surrogate is accepted.
- **§3.10 Input Objects, §3.11 List (MUST), 16 only:** an unknown field in an input object literal is ignored. That happens in 5 vectors, and 17 rejects it.

The big JSON numbers pass `jsonNumbers`, and the ID `1e21` passes as `"1e+21"`, though `differential-coercion.mjs` still lists both in `KNOWN`, next to the disagreements above, since it compares with the reference's exact answer. Validating, only the lone surrogates remain, since validation rejects the literals.

## Limits

- **OneOf:** `Coercion.tla` doesn't model OneOf input objects (§3.10.1), so the `oneOf` check is always untested.
- **Fractional floats:** the reference keeps a fractional Float as its decimal rather than rounding it to a double. That is exact for decimals of at most 15 significant digits, and the vectors only use those.
- **Fixed schema:** one schema, root fields only, no custom scalars, and no directives. Root field names are unique across Query and Mutation, so the field a resolver ran at says which root type ran.
- **What isn't compared:** error messages and locations, how many errors a request error has, and whether a request error's errors carry a path.
- **Validity:** a vector's `valid` flag comes from `Validation.tla`, and Validation's own limits apply. A valid vector is graded the same way for adapters that validate, so a validator stricter than `Validation.tla` would show up as a failure there.
- **Lone surrogates:** like big numbers, what a JSON parser does with `"\ud800"` varies (RFC 8259 §8.2). A parser that replaces it with U+FFFD hands String a valid string, which the kit counts as wrong. graphql-js keeps the lone surrogate, so its findings are coercion's.
