# Kit areas beyond execution

Execution (docs/conformance.md) needs a driven adapter, because the spec allows many correct responses and the kit has to control resolver timing. The other parts of the spec have one right answer per input, so their areas work from **vectors**: inputs whose expected answers come from evaluating a TLA+ reference with tla-ts, shipped as JSON. An adapter answers each vector, and the kit compares.

| Area | Reference | The adapter is asked | It answers |
| --- | --- | --- | --- |
| `parse` | `specs/Lexer.tla`, `specs/Parser.tla` | whether a source text is a syntactically valid executable document | `{"ok": bool}` |
| `validate` | `specs/Validation.tla` | whether a document is valid against a schema | `{"valid": bool}`, optionally with error `locations` |
| `coerce` | `specs/Coercion.tla` | to execute a document with variables, with a resolver that echoes its arguments | a request error, a field error, or the coerced arguments |
| `schema` | `specs/TypeSystem.tla` | whether an SDL schema is valid | `{"valid": bool}` |
| `introspect` | `specs/Introspection.tla` | to execute an introspection query against an SDL schema | the response |

## Protocol

The same NDJSON channel as execution. An adapter claims each area it answers in `hello`'s capabilities (`"parse"`, `"validate"`, ...). For each vector the kit sends one request and waits for its result:

```json
{"type":"parse","id":12,"source":"{ a }"}
{"type":"result","id":12,"ok":true}
```

If the adapter itself fails, it answers `{"type":"error","id":12,"message":"…"}`, and the kit stops. An area may define capabilities of its own: `coerce` has `absent-vs-null` (the result can tell an argument that wasn't given from an explicit null) and `unvalidated` (the adapter executes documents without validating them). Vectors that need one are skipped for adapters without it. If the adapter doesn't claim the area at all, `graphql-tla run <area>` exits with code 3. A request the implementation rejects is an answer, not an adapter error. Each area's page in [`docs/kit/`](kit) gives its request and result fields.

## Vectors

- **Where they live.** `kit/<area>/vectors.json` holds `{ "source": "...", "vectors": [...] }`. Each vector is `{ "id", "spec": ["5.5.2.3"], "family", ...request fields, "expected": ... }`. Areas whose vectors share schemas keep them once at the top level: `coerce` has one `schema`, and `validate` has a `schemas` map that each vector names.
- **Who decides `expected`.** Only the TLA+ reference, evaluated by tla-ts, never graphql-js. `scripts/generate-vectors-<area>.mjs` writes the file, and `--check` regenerates it and fails if it differs. `npm run check:vectors` runs every `--check`.
- **What they're built from.** The documents and schemas come from the differential scripts' families and the spec's own examples.
- **Minimal pairs.** Where a reference reports which rule or production a verdict rests on, vectors come in pairs. An invalid input breaks exactly one rule, and a valid sibling differs from it by one small edit. That gives a per-rule verdict without asking the adapter which rule it applied:
  - a rule is **not enforced** when an implementation accepts an input that breaks only that rule;
  - it is **over-strict** when it rejects that input's valid sibling.

  `coerce` has no pairs: `Coercion.tla` gives an outcome, not the rule that decided it. Its findings are "accepts what §X rejects", "rejects what §X accepts" and "coerces to the wrong value".

## Checks and reports

Each area exports `run({ adapter, strict, option, flag, log })` from `kit/<area>/run.mjs`, which returns `{ ok, report }`. `kit/cli.mjs` dispatches `graphql-tla run <area>` to it. The report has the same shape as execution's, so the [conformance sheet](../conformance/README.md) reads every area alike:

```js
{
  format: 1, area, implementation, capabilities,
  provenance: { kit, date, strict, vectors },        // kit/report.mjs provenance()
  checkerSelfTest: "passed (n negative controls)",
  cases: { submitted, distinct, malformed },
  adapterProblems: 0,
  checks: [{ id, title, level, spec: [section(...)], status, cases, failing, oct2021?, basis?, note? }],
  findings: [{ checks: [id], summary, cases, fixtures: { family: n }, fixture, problem?,
               example: { input: "<the vector, briefly>", response: <the answer>, expected: "<the reference's answer>" } }],
  fixtures: [],
}
```

- **Checks.** One per rule or grammar section, at the level the spec text gives it. `status` is `"fail"` if any vector broke it, `"pass"` if some vector exercised it and none broke it, and `"untested"` otherwise. `cases` is the number of vectors that exercised it.
- **Findings.** Group failures by root cause, such as "rule R not enforced" or "rule R over-strict". A vector counts toward one finding only.
- **Self-test.** Every run also checks deliberately wrong answers against the same checker: every verdict flipped, and answers taken from a different vector. The checker must flag each of them, so a green run can't be vacuous.
- **Exit code.** Non-zero if any MUST check fails, or a SHOULD check fails with `--strict`, or the self-test fails.

## Adapters

The graphql-js adapter answers an area through `adapters/graphql-js/areas/<area>.mjs`, whose default export maps a request to the result's fields: `(graphql, request) => ({ ok })`. It claims every area that has a module, plus the module's `capabilities` export.

## Keeping it honest

- `npm run check:vectors` regenerates every area's vectors from its reference and fails if any file differs.
- `npm run check:graphql-js` reruns graphql-js 16 and 17 in every area and requires their reports to match the committed ones in `conformance/reports/`, provenance aside. The runs are deterministic, so graphql-js's known deviations are pinned: a fix in graphql-js, or a change in the kit, shows up as a difference to review.
