# The coerce area

`graphql-tla run coerce` checks input coercion: how an implementation turns variable values and argument literals into the arguments a resolver gets, and when it refuses them. The reference is [`specs/Coercion.tla`](../../specs/Coercion.tla). It covers:

- §3.5.1 to §3.5.5, the built-in scalars;
- §3.9 enums, §3.10 input objects, §3.11 lists and §3.12 Non-Null;
- §6.1.2 CoerceVariableValues and §6.4.1 CoerceArgumentValues.

```shell
npx graphql-tla run coerce --adapter "node adapters/graphql-js/adapter.mjs --graphql 17" --strict --report coerce.json
```

The area follows [the contract for areas beyond execution](../kit-areas.md).

## Request

```json
{"type":"coerce","id":12,"schema":"enum Color { RED GREEN BLUE } … type Query { … }","document":"query($x: Int) { int(v: $x) }","variables":"{\"x\": 2147483648}"}
```

- **`schema`:** SDL. Every vector uses the same schema, which has one root field per argument type. Each root field returns a nullable `String`.
- **`document`:** one operation that selects one root field.
- **`variables`:** the request's variables as **raw JSON text**. Parse them with your implementation's own JSON parser, as a server would. Some vectors depend on that parser (see [Big numbers](#big-numbers)).

Build the schema with a resolver on every field that records the arguments it got and returns a non-null value, then execute the document.

## Result

The adapter answers with one of three outcomes:

```json
{"type":"result","id":12,"outcome":"request-error"}
{"type":"result","id":12,"outcome":"field-error"}
{"type":"result","id":12,"outcome":"value","arguments":{"v":[1,2]}}
```

| `outcome` | The response was |
| --- | --- |
| `request-error` | a request error (§7.1.3): no `data` entry, at least one error, and the resolver wasn't called |
| `field-error` | an execution error at the field: `data` with the field null, one error whose path is the field, and the resolver wasn't called |
| `value` | the resolver ran once, the field has its value, and there are no errors. `arguments` is what the resolver got |
| `other` | none of the above, for example `"data": null` with a request error. It always counts as a failure |

`arguments` is a JSON object:
- one entry per argument the resolver got;
- Int and Float as numbers, String and ID as strings, Boolean as booleans;
- enum values as their names;
- lists as arrays, input objects as objects.

An argument or input object field that has no value is left out. Send a value that JSON can't represent, such as a non-finite float, as a string (`"Infinity"`).

Any other fields in the result, such as `message` or `response`, are ignored, but they appear in the report's examples.

## Capabilities

| Capability | Meaning |
| --- | --- |
| `coerce` | The adapter answers `coerce` requests. |
| `absent-vs-null` | `arguments` tells an absent entry from a null one: an argument or input field with no value is left out, and one given null is `null`. Without it, every object's null entries are dropped on both sides before comparing, and the vectors that only that distinction can tell apart are skipped. |
| `unvalidated` | The adapter executes a document without validating it. Without it, vectors whose document is invalid are skipped, since an implementation that validates rightly answers them with a request error. |

## What is checked

Each vector has one expected answer, which tla-ts got by evaluating `Coercion!Respond`. A result passes when it has the same outcome, and for `value`, the same arguments. Numbers are compared as numbers and keys in any order.

Each vector belongs to one check, by the outermost type its value meets. That is how the spec's own tables file their examples: §3.11 lists `[1, "b", true]` under List, and §3.10 lists `{ a: "abc", b: "123" }` under Input Objects.

A vector that expects a request error also exercises `variables`, and one that expects a field error also exercises `arguments`. Getting the kind of error wrong counts against those two checks. Any other failure counts against the vector's own check.

| Check | Section | Level | What it covers |
| --- | --- | --- | --- |
| `int` | §3.5.1 | MUST | Int accepts only integer input values: not floats, strings or booleans. JSON `1.0` is an integer. |
| `intRange` | §3.5.1 | SHOULD | Int rejects integers outside the signed 32-bit range |
| `float` | §3.5.2 | MUST | Float accepts integer and float input values. It rejects non-finite values, and integers a double can't hold exactly. |
| `string` | §3.5.3 | MUST | String accepts only valid Unicode strings: not a JSON string with a lone surrogate |
| `boolean` | §3.5.4 | MUST | Boolean accepts only booleans |
| `idCoerced` | §3.5.5 | SHOULD | Strings and integers are coerced to ID. An integer becomes its decimal string. |
| `id` | §3.5.5 | MUST | ID rejects everything else, including floats |
| `enum` | §3.9 | MUST | Enum literals of the enum's own values, and strings in JSON variables. Not string literals, and not unknown values. |
| `inputObject` | §3.10 | MUST | An object with only defined fields, field defaults, required fields, and variables in fields. The section mixes MUST and SHOULD, and the reference doesn't say which sentence decided a verdict, so the check takes the stronger level. |
| `oneOf` | §3.10.1 | MUST | Always untested: `Coercion.tla` doesn't model OneOf input objects |
| `list` | §3.11 | MUST | Each item coerced, a single value wrapped in a list (recursively), variables as items |
| `nonNull` | §3.12 | MUST | The literal null for a Non-Null argument |
| `variables` | §6.1.2 | MUST | Variable defaults (including null), missing and null values, a Non-Null variable, and a value that can't be coerced as a request error, even for an unused variable |
| `arguments` | §6.4.1 | MUST | Argument defaults, a missing variable falling back to the default, an explicit null not replaced by the default, a null variable for a Non-Null argument, and a literal that can't be coerced as a field error |

Findings group failures by kind and section:
- accepts what §X rejects;
- rejects what §X accepts;
- coerces to the wrong value under §X;
- raises a field error where §6.1.2 requires a request error;
- raises a request error where §6.4.1 requires a field error;
- answers with none of the three outcomes.

The run fails on any failing MUST check, a failing SHOULD check with `--strict`, a result not in the format above, or a failed self-test.

**Self-test.** Every run also judges deliberately wrong results against the same vectors, in the same comparison mode, and requires each to be caught:
- for each vector, its verdict flipped: an error for a value, a value for an error, and the other kind of error;
- the answer to the nearest vector whose answer differs.

The expected answers themselves must all pass.

## Vectors

[`kit/coerce/vectors.json`](../../kit/coerce/vectors.json) holds the schema and 2014 vectors. [`scripts/generate-vectors-coerce.mjs`](../../scripts/generate-vectors-coerce.mjs) writes it. `--check` regenerates it and fails if it differs. graphql-js only parses the SDL and documents there. Every answer comes from the references:

- **`expected`:** `Coercion!Respond` for the operation and variables.
- **`valid`:** `Validation!IsValid` for the document, and Coercion's scalar coercion for every Int and Float literal. §5.6.1 asks for literals to be "coercible", but `Validation.tla` checks literals by kind only. An invalid document needs `unvalidated`.
- **`requires`:** `absent-vs-null` for vectors on the same field whose arguments differ only in a null entry versus an absent one. Examples are `{ int }` versus `{ int(v: null) }`, or `$l` missing versus `$l: null` in `point(v: { x: 1, label: $l })`.
- **`check`, `spec`:** the check and sections the vector belongs to.
- **`exactNumbers`:** set on vectors whose variables hold a number that a double can't hold.

The operations are the same as [`scripts/differential-coercion.mjs`](../../scripts/differential-coercion.mjs) uses, plus the spec's own examples. The families are:

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

1217 vectors have a valid document. 797 need `unvalidated`, and 78 need `absent-vs-null`. Expected outcomes: 441 values, 791 field errors, 782 request errors.

### Big numbers

The JSON values include `9007199254740993` (2^53 + 1) and `1e400`. The reference reads JSON numbers exactly:
- a Float variable of 2^53 + 1 is a request error, since a double can't hold it;
- an ID variable of 2^53 + 1 is the string `"9007199254740993"`;
- an ID variable of 1e400 is a 401-digit string.

A JSON parser that reads numbers as doubles changes these inputs before coercion starts. `JSON.parse` rounds 2^53 + 1 to 2^53 and turns 1e400 into Infinity, so graphql-js fails these vectors. That comes from its JSON parser, not from its coercion. The vectors stay, marked `exactNumbers`, and their findings say that the JSON parser decides them. A server that parses big integers exactly passes them.

## graphql-js

[`adapters/graphql-js/areas/coerce.mjs`](../../adapters/graphql-js/areas/coerce.mjs) runs `execute` without `validate`, and supports `absent-vs-null` and `unvalidated`. Both versions fail the MUST checks for Float, String and ID, and the SHOULD check for ID coercion (`idCoerced`):

- **§3.5.2 Float:**
  - the literal `1e400` is accepted as Infinity;
  - the literal `99999999999999999999` is rounded to 1e20;
  - a variable of 2^53 + 1 is accepted, rounded (`exactNumbers`).
- **§3.5.3 String, §3.5.5 ID:** a JSON string with a lone surrogate is accepted.
- **§3.5.5 ID:**
  - the variable `1e21` becomes `"1e+21"`, not `"1000000000000000000000"`;
  - 2^53 + 1 becomes `"9007199254740992"`, and 1e400 is rejected (`exactNumbers`).
- **§3.10 Input Objects, §3.11 List, 16 only:** an unknown field in an input object literal is ignored. That happens in 4 vectors, and 17 rejects it.

These are the disagreements that `differential-coercion.mjs` lists in `KNOWN`.

## Limits

- **OneOf:** `Coercion.tla` doesn't model OneOf input objects (§3.10.1), so the `oneOf` check is always untested.
- **Fractional floats:** the reference keeps a fractional Float as its decimal rather than rounding it to a double. That is exact for decimals of at most 15 significant digits, and the vectors only use those.
- **Fixed schema:** one schema, root fields only, no custom scalars, and no directives.
- **What isn't compared:** error messages and locations aren't compared. Neither is how many errors a request error has.
- **The adapter classifies:** the adapter, not the kit, sorts the response into one of the outcomes. Its classification follows the table above.
- **Validity:** a vector's `valid` flag comes from `Validation.tla`, and Validation's own limits apply.
