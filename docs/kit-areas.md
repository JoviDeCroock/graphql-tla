# Kit areas beyond execution

Execution (docs/conformance.md) needs a driven adapter, because the spec allows many correct responses and the kit has to control resolver timing. The other parts of the spec have one right answer per input, so their areas work from **vectors**: inputs whose expected answers come from evaluating a TLA+ reference with tla-ts, shipped as JSON. An adapter answers each vector, and the kit compares.

| Area | Reference | The adapter is asked | It answers |
| --- | --- | --- | --- |
| `parse` | `specs/Lexer.tla`, `specs/Parser.tla` | whether a source text is a syntactically valid executable document | `{"ok": bool}`, or `{"unsupported": "lone surrogate: …"}` for a source with a lone surrogate the adapter can't carry ([details](kit/parse.md#sources-an-adapter-cant-receive)) |
| `validate` | `specs/Validation.tla` | whether a document is valid against a schema | `{"valid": bool}`, optionally with error `locations` |
| `coerce` | `specs/Coercion.tla`, `specs/Lexer.tla` (string literals' text) | to execute a request (schema, document, variables, operation name), with a resolver that records its arguments | the execution result and the resolver calls; the kit classifies them. Or `{"unsupported": "lone surrogate: …"}` for variables with a lone surrogate the adapter's JSON parser can't read ([details](kit/coerce.md#result)) |
| `schema` | `specs/TypeSystem.tla` | whether an SDL schema is valid | `{"valid": bool}` |
| `introspect` | `specs/Introspection.tla` | to execute an introspection query against an SDL schema | the response |

## Protocol

The same NDJSON channel as execution. An adapter claims each area it answers in `hello`'s capabilities (`"parse"`, `"validate"`, ...). For each vector the kit sends one request and waits for its result:

```json
{"type":"parse","id":12,"source":"{ a }"}
{"type":"result","id":12,"ok":true}
```

**Crashes.** In `parse`, `validate`, `coerce`, `schema` and `introspect`, an answer `{"type":"error","id":12,"message":"…"}` means the implementation crashed on that vector: it threw, or failed some other way, instead of giving a verdict or a response. The kit records it as a crash and goes on. A crash fails the vector, counts against the check the vector would fail with a wrong answer, and counts toward a finding of its own (`"kind": "crash"`). The run's summary gives the number of crashes apart, and never counts them as agreements. In `coerce` a crash is the outcome "no response", which always fails `responds` (§7), with the vector's own check named as a hint (see [its page](kit/coerce.md)); in `introspect` it fails `executes`. Only the message's first line reaches the report, so a stack trace's paths stay out of it. So report a crash as an `error`, never as a verdict: an adapter that answers `ok: false` or `valid: false` for every exception hides its crashes, which then pass on inputs the reference rejects. In execution, an `error` answer means the adapter itself failed, and the kit stops. A silent adapter stops the run in every area.

An area may define capabilities of its own: `coerce` has `absent-vs-null` (the result can tell an argument that wasn't given from an explicit null), `unvalidated` (the adapter executes documents without validating them; without it, invalid documents are graded as requests that must fail without execution, except those invalid only because a literal doesn't coerce, where a request error and the reference's field error both pass, and if the adapter also claims `validate`, the kit asks the implementation's validator whether it rejects a document, to tell known validation errors and refusals at validation apart; see [Validation](kit/coerce.md#validation)) and `exact-numbers` (the adapter's JSON parser reads big numbers exactly). `validate` has `custom-scalar-literals`, and `validate` and `introspect` share `custom-directives`: the adapter can build a schema whose SDL declares custom directives (`directive @label(…) on …`) and the implementation knows them. The spec only says a service *may* provide custom directives (§3.13), so vectors that declare one are graded only for adapters that claim it. Vectors that need a capability are skipped, or graded differently, for adapters without it. If the adapter doesn't claim the area at all, `graphql-tla run <area>` exits with code 3. A request the implementation rejects is an answer, not an adapter error. Each area's page in [`docs/kit/`](kit) gives its request and result fields.

## Vectors

- **Where they live.** `kit/<area>/vectors.json` holds `{ "source": "...", "vectors": [...] }`. Each vector is `{ "id", "spec": ["5.5.2.3"], "family", ...request fields, "expected": ... }`. Areas whose vectors share schemas keep them once at the top level: `coerce` has one `schema`, plus a `schemas` map for the OneOf vectors, which name theirs, and `validate` has a `schemas` map that each vector names.
- **Who decides `expected`.** Only the TLA+ reference, evaluated by tla-ts, never graphql-js. `scripts/generate-vectors-<area>.mjs` writes the file, and `--check` regenerates it and fails if it differs. `npm run check:vectors` runs every `--check`.
- **Editions.** The kit grades the September 2026 edition, the latest release. A vector whose verdict comes from grammar or a rule first released after October 2021 carries `"since": "September2025"` or `"since": "September2026"`, the first release whose text gives that verdict, and an `editionNote` naming the rule; a vector that October 2021 decides the same way has no `since`. Every one is still graded (except under `introspect`'s older profiles, which skip what their edition can't ask; `introspect` also leaves ungraded a schema in newer syntax that doesn't build). Reports count failing vectors by release, so an implementation of an older edition can tell those failures apart: `failingSince` on each check, `since` on each finding and on the report, and a finding's example starts with `[since September 2025]` or `[since September 2026]`. A crash isn't counted by release because of the vector's verdict: it fails in every edition where the input is valid (each area's page says where an older edition can't take the input at all). A check's `level` is September 2026's; where September 2025's or October 2021's wording gives another level, `levels` lists those editions, for example `{ "September2025": "SHOULD", "October2021": "SHOULD" }`. In `schema` and `validate`, each check's `basis` quotes the sentences its levels rest on.
- **Unspecified inputs.** Where the spec's formal algorithm and its prose disagree, or the spec leaves a term undefined (§5.3.2's "identical sets of arguments"), the vector is marked `unspecified` and isn't graded. `validate` and `schema` have such vectors; the report's provenance counts them. Where a vector's answer depends on such a term but what an implementation does is still worth recording, it is graded under an informational check that accepts every reading instead: `coerce` does this for lone surrogates, big JSON numbers and Float's "outside the available precision" (`floatPrecision`).
- **What they're built from.** The documents and schemas come from the differential scripts' families and the spec's own examples. Documents a reference writes beside the spec's examples, which the spec doesn't contain, aren't presented as the spec's: in `validate` they are family `extra` with ids `<Rule>-added-N` and an `origin`; in `schema` an `origin` names the spec's example or the sentence a vector follows.
- **Minimal pairs.** Where a reference reports which rule or production a verdict rests on, vectors come in pairs. An invalid input breaks one rule (in `validate`, two in 21 documented cases, which count against both), and a valid sibling differs from it by one small edit. That gives a per-rule verdict without asking the adapter which rule it applied:
  - a rule is **not enforced** when an implementation accepts an input that breaks it. That is conclusive, and it is what fails the rule's check.
  - a rejected valid sibling fails a separate check, `acceptsValid` in `validate` and `schema`. The paired rule is only a hint, since the kit doesn't read error messages to tell which rule was applied; a finding calls it likely over-strict only when several independent siblings point at it. `validate` and `schema` read the first error message only to group rejections: one message on the siblings of several rules is one finding, with every rule in its hint (see [validate](kit/validate.md#verdicts) and [schema](kit/schema.md)).
  - a rule that can't be broken alone (every input that breaks it breaks a broader rule too) is reported as `subsumed`, never `pass`.

  `coerce` has no pairs: `Coercion.tla` gives an outcome, not the rule that decided it. Its findings are "accepts what §X rejects", "rejects what §X accepts" and "coerces to the wrong value". Where the spec permits more than one answer (a MAY, a SHOULD left undone, or readings of what the spec doesn't say, such as a list item that is a variable with no runtime value), a vector lists the alternatives the reference gives under other policies. A list or input object vector rests first on the vectors that hold its items or fields on their own: where both fail the same way, the failure counts under the inner vector's check, so one scalar rule broken inside lists and input objects is one finding ([details](kit/coerce.md#attribution)).

## Checks and reports

Each area exports `run({ adapter, strict, option, flag, log })` from `kit/<area>/run.mjs`, which returns `{ ok, report }`. `kit/cli.mjs` dispatches `graphql-tla run <area>` to it. The report has the same shape as execution's, so the [conformance sheet](../conformance/README.md) reads every area alike:

```js
{
  format: 2, area, implementation, capabilities,
  provenance: { kit, date, strict, vectors, graded?, skipped? },  // kit/report.mjs provenance()
  profile?, profileNote?, missingFields?,              // introspect: which edition's query was answered ("September2026", "September2025", "October2021"), and what the introspection types lack
  since?,                                              // vectors on rules after October 2021, by release: { September2025: { vectors, failing }, September2026: { vectors, failing } }
  checkerSelfTest: "passed (n negative controls)",
  cases: { submitted, distinct, malformed, crashed?, notGraded? },   // introspect: crashed, and notGraded { reason: n }
  adapterProblems: 0,
  checks: [{ id, title, level, spec: [section(...)], status, cases, failing, failingSince?, levels?, since?, basis?, note?, observed? }],   // failingSince: { September2025: n, September2026: n }, zeros left out; levels: older editions' levels where they differ; since: the release that introduced the check's rule, if after October 2021
  findings: [{ kind?, checks: [id], summary, cases, since?, fixtures: { family: n }, fixture, problem?,   // kind: "crash" for crashes; since: as failingSince
               example: { input: "<the vector, briefly>", response: <the answer>, expected: "<the reference's answer>" } }],
  fixtures: [],
  ok,                                                  // the run's verdict, matching its exit code
}
```

- **Checks.** One per rule or grammar section, at the level the spec text gives it. `status` is `"fail"` if any vector broke it, `"pass"` if some vector exercised it and none broke it, `"subsumed"` for a rule that can't be told apart from a broader one, and `"untested"` otherwise. `cases` is the number of vectors that exercised it.
- **Findings.** Group failures by root cause, such as "rule R not enforced" or "rejects valid documents". A vector counts toward one finding only. A crash's finding has `"kind": "crash"`, and its `problem` is the adapter's message.
- **Self-test.** Every run also checks deliberately wrong answers against the same checker: every verdict flipped, and answers taken from a different vector. The checker must flag each of them, so a green run can't be vacuous.
- **Exit code.** Non-zero if any MUST check fails, or a SHOULD check fails with `--strict`, or the self-test fails.

## Adapters

The graphql-js adapter answers an area through `adapters/graphql-js/areas/<area>.mjs`, whose default export maps a request to the result's fields: `(graphql, request) => ({ ok })`. It claims every area that has a module, plus the module's `capabilities` export.

## Keeping it honest

- `npm run check:vectors` regenerates every area's vectors from its reference and fails if any file differs.
- `npm run check:graphql-js` reruns graphql-js 16 and 17 in every area and requires their reports to match the committed ones in `conformance/reports/`, provenance aside. The runs are deterministic, so graphql-js's known deviations are pinned: a fix in graphql-js, or a change in the kit, shows up as a difference to review.
