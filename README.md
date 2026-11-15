# graphql-tla

[GraphQL's specification](https://spec.graphql.org/September2026/) as executable TLA+, and a kit that checks any GraphQL implementation against it.

- **References** for each part of the spec, written by hand from its algorithms and model checked with [tla-ts](https://github.com/aidenybai/tla-ts):
  - the language (§2), for executable and type system documents, and schema coordinates (§2.14);
  - the type system (§3), with type system extensions;
  - introspection (§4);
  - validation (§5);
  - input coercion and execution (§6), with subscriptions;
  - the response format (§7).
- **A conformance kit**, [`kit/`](kit), that drives a GraphQL implementation through a small adapter and checks every answer against the references: execution responses, and in the other areas parsing, validation, coercion, schema validity, introspection and schema coordinates. Nine adapters cover ten implementations (graphql-js 16 and 17 share one), and the [conformance sheet](conformance/README.md) records what each one passes and breaks.
- **Models of behaviour over time:** mutations, subscriptions, `@defer` and `@stream`.

**Editions.** The kit grades the [September 2026 edition](https://spec.graphql.org/September2026/), the latest release. Some of its rules are newer than the October 2021 edition: every one of them first appeared in September 2025 or September 2026, and the kit labels the vectors, checks and findings that rely on one with that release ("since September 2025", "new in September 2026"). Where September 2025 or October 2021 gives a rule another level (a SHOULD where September 2026 has a MUST, for example), the check says so, and `introspect` can also grade an implementation's October 2021 or September 2025 introspection types. That way an implementation of an older edition can tell which of its failures that edition shares. Section numbers and links ([`kit/spec-sections.json`](kit/spec-sections.json)) are September 2026's. The references were written from the working draft at graphql/graphql-spec@bfcc722b32f4, which differs from September 2026 only editorially and numbers its sections the same.

Execution is where an executable reference earns its keep. One query, given what each resolver did, has many correct responses: resolvers settle in any order, siblings may be cancelled, errors under an already-nulled position may be dropped. `Reference.tla` accepts exactly that set, so no golden file has to pick one.

## How it fits together

```
fixtures/*.graphql ──generate──▶ specs/lib/fixtures.ts ──▶ specs/execution.ts ──tla-ts──▶ Execution.tla
                           └───▶ specs/Fixtures.tla ──┐                                      │
                                                     ▼                                       ▼
                       specs/Reference.tla ◀── specs/GraphQLResponse.tla ◀── refines ── ExecutionConformance.tla
                              ▲
                              └── every response from an implementation, through kit/ and an adapter
```

| Part | Files | What it is |
| --- | --- | --- |
| Execution reference | [`Reference.tla`](specs/Reference.tla) | Field collection, `CompleteValue` with lists and abstract types, error propagation, serial mutations, `__typename`, execution without error propagation. `Clauses` says which rule a response breaks. |
| Contract | [`GraphQLResponse.tla`](specs/GraphQLResponse.tla) | What an observer sees: resolvers settle, one response is sent, and it is valid, final and eventually sent. |
| Executor | [`execution.ts`](specs/execution.ts) | A step-by-step executor for any fixture. Each resolver settles on its own, in any order, to any outcome its type allows, including results of the wrong shape. |
| Refinement | [`ExecutionConformance.tla`](specs/ExecutionConformance.tla) | Proves that the executor refines the contract on every fixture, in every variant, under every schedule. |
| Conformance kit | [`kit/`](kit), [`docs/conformance.md`](docs/conformance.md) | Drives an implementation through an adapter and checks every response against `Reference.tla`. |
| Language | [`Lexer.tla`](specs/Lexer.tla), [`Parser.tla`](specs/Parser.tla) | §2: tokens, escapes, block strings, and the four document grammars (ExecutableDocument, TypeSystemDocument, TypeSystemExtensionDocument and Document), which cover executable documents and §3's type system language. |
| Schema coordinates | [`SchemaCoordinates.tla`](specs/SchemaCoordinates.tla) | §2.14: the coordinate grammar, and the five resolution algorithms over a schema. |
| Type system | [`TypeSystem.tla`](specs/TypeSystem.tla) | §3: the type validation rules, rule by rule, and type system extensions applied in document order, with their own rules. |
| Introspection | [`Introspection.tla`](specs/Introspection.tla) | §4: the `__schema` a service must return. |
| Validation | [`Validation.tla`](specs/Validation.tla) | §5: every rule, each returning its violations. |
| Coercion | [`Coercion.tla`](specs/Coercion.tla) | §3.5 and §3.9–§3.12 input coercion, `GetOperation`, `CoerceVariableValues`, `CoerceArgumentValues`, a subscription's source stream (`CreateSourceEventStream`), and request errors (§7.1). |
| Scenarios | [`mutation.ts`](specs/mutation.ts), [`subscription.ts`](specs/subscription.ts), [`defer.ts`](specs/defer.ts), [`stream.ts`](specs/stream.ts) | Step-by-step models of behaviour over time. |

Fixtures are plain GraphQL. Each [`fixtures/*.graphql`](fixtures) file holds a schema, one operation and its fragments, plus optional headers: `# variables:` (the variable values), `# variants:` (several sets of variable values, each its own fixture, named `<file>_<variant>`), `# maxListLength:`, `# invalidResults:` (resolvers may return values of the wrong shape) and `# spec:` (the sections it exercises). The 16 files make 19 fixtures:

- `nullPropagation`: Non-Null chains and `data: null`.
- `lists`: `[Post!]` and `[String]!`, with items completing in parallel.
- `fragments`: an interface, inline fragments and fragment spreads, `@skip`/`@include`, aliases, and merged response keys.
- `abstract`: union and interface type conditions inside interface- and union-typed fields, both outcomes of each, and `__typename` on an abstract field.
- `merging`: §6.3.2's own example of merged sub-selections.
- `aliases`: aliases that swap root fields and leaves, in `data` and in error paths, and a deprecated field still executed.
- `ordering`: response keys in the order CollectFields first meets them, with §3.6's examples.
- `directives`: `@skip` and `@include` with variables on fields, inline fragments and spreads, one fixture per row of their truth table (`directives_kept`, `_skipped`, `_excluded`, `_dropped`).
- `unions`: a union, `__typename`, a nested list, and results of the wrong shape.
- `leaves`: leaf result coercion: a fraction for an Int, a non-finite Float, an unknown enum value.
- `scalars`: a value a custom scalar's result coercion rejects, and an integer for an ID.
- `mutation`: serial root fields, nullable and Non-Null.
- `mutationRoot`: one root field under two response names, a list at the root, `__typename` and skipped root fields.
- `subscription`: one subscription event.
- `subscriptionAlias`: an aliased root field selected twice, once through a fragment.
- `noPropagation`: execution without error propagation (graphql-js 17's `@experimental_disableErrorPropagation`).

## Running

```shell
npm install
npm run check                # everything below
npm run check:specs          # specs, modules, mutants and coverage
npm run check:specs defer    # only names containing "defer"
npm run check:graphql-js     # the conformance kit on graphql-js 16 and 17
npm run check:differentials  # the language, validation, coercion and type-system references against graphql-js
npm run check:mutants        # each differential must catch every bug planted in its reference
npm run fixtures             # regenerate fixture data after editing fixtures/
```

## Checking your implementation

```shell
npx graphql-tla run execution --adapter "<command that starts your adapter>"
npx graphql-tla run validate --adapter "<command that starts your adapter>"
```

The kit has seven areas. Each checks one part of the spec against its TLA+ reference:

| Area | Spec | Reference | How | Checks |
| --- | --- | --- | --- | --- |
| [`execution`](docs/conformance.md) | §6, §7, and §3's result coercion | `Reference.tla` | drives your resolvers through 19 fixtures, every outcome and schedule, and checks each response against every response the spec allows; with capabilities, also subscription streams (§6.2.3), the value each resolver was called on, and custom scalar and ID results | 47 |
| [`parse`](docs/kit/parse.md) | §2, and §3's type system grammar | `Lexer.tla`, `Parser.tla` | accept or reject 2,847 source texts, mostly in minimal pairs; 713 of them type system documents (capability `parse-sdl`), and 20 crash probes | 51 |
| [`validate`](docs/kit/validate.md) | §5, §2.2 | `Validation.tla` | 3,367 documents, each breaking one rule (two in 27 documented cases) or none, so each rule gets its own verdict, plus copies with descriptions and comments that must get the same verdict | 36 |
| [`coerce`](docs/kit/coerce.md) | §2.10.4, §3.5, §3.9–§3.12, §6.1, §6.2.3.1, §6.4.1, §7.1 | `Coercion.tla` | 2,219 requests with variables and literals: a request error, a field error, or the coerced arguments; also operation selection, a subscription's source stream, and the shape of every response | 42 |
| [`schema`](docs/kit/schema.md) | §3 | `TypeSystem.tla` | 495 SDL schemas in 250 minimal pairs, one or more per type-system rule; 127 with type system extensions (capability `schema-extensions`) | 64 |
| [`introspect`](docs/kit/introspect.md) | §4 | `Introspection.tla` | 71 introspection queries over 21 schemas, with the variation the spec allows, answered under the September 2026, September 2025 or October 2021 profile | 31 |
| [`coordinate`](docs/kit/coordinate.md) | §2.14 | `SchemaCoordinates.tla` | 203 schema coordinates over two schemas: whether each parses, and what it resolves to | 11 |

Outside execution, every expected answer comes from evaluating the reference with tla-ts, never from graphql-js. [`docs/kit-areas.md`](docs/kit-areas.md) describes how those areas work.

An adapter is a small program that speaks newline-delimited JSON. It builds the schema the kit sends and installs one resolver on every field, which reports each call and returns whatever the kit says. [`docs/conformance.md`](docs/conformance.md) has the protocol, the outcomes, the clauses and the case format. The adapters in [`adapters/`](adapters) are examples:

| Adapter | Implementation | Notes |
| --- | --- | --- |
| [`graphql-js`](adapters/graphql-js) | graphql-js 16.15 and 17.1 | The reference adapter: about 350 lines for execution, and a short module per other area. In execution it fails only `nothingAfterCancel`, a SHOULD, so only under `--strict`: both versions still deliver the result of an event that was executing when the client cancelled. |
| [`graphql-java`](adapters/graphql-java) | graphql-java 26.2 | Execution passes except one subscription case: when an event's Non-Null root field is null, the response stream errors out instead of sending `{ data: null, errors }`. In the other areas: `__typename` merge conflicts aren't caught (§5.3.2), ID input accepts any value (§3.5.5), a non-finite Float literal is accepted (§3.5.2), and the schema builder crashes on some schemas and accepts some invalid ones. |
| [`hotchocolate`](adapters/hotchocolate) | Hot Chocolate 15.1.21 (.NET) | In execution, when a list item at a Non-Null position is null, the list is nulled but no error is reported (§6.4.3, §6.4.4), and a fraction returned for an Int is truncated (§3.5.1, a SHOULD). In the other areas: a U+FEFF after the first character is rejected, though §2.1.6 makes it ignored, block strings decode escapes (§2.10.6), variable defaults are checked without their wrappers (§5.6.1), JSON `1.0` is refused for an Int variable, and several type-system rules aren't checked. |
| [`graphql-dotnet`](adapters/graphql-dotnet) | graphql-dotnet 8.8.5 (.NET) | Execution passes except a non-finite Float, after which the client gets no response (§3.5.2). Validation treats every Non-Null type as equal to every other in §5.8.5, misses `__typename` conflicts (§5.3.2) and has no rule for §5.1.1. The schema builder merges duplicate definitions and has no cycle checks. Introspection has no `specifiedByURL`, and `isRepeatable` and input-value deprecation are behind experimental flags that are off by default. |
| [`graphql-core`](adapters/graphql-core) | graphql-core 3.2.14 (Python) | Calls every mutation root field's resolver at once, and only awaits them in order. Resolvers that return a future or task run early (§6.3.4); `async def` resolvers aren't affected, and graphql-core 3.3 fixes this. In the other areas it matches graphql-js 16, except that a request error carries `"data": null` (§7.1.3). |
| [`graphql-ruby`](adapters/graphql-ruby) | graphql-ruby 2.6.15 | Truncates a fraction returned for an Int (§3.5.1, a SHOULD). Out of the box, results of the wrong shape raise out of `execute` instead of becoming field errors; the documented `type_error` and `rescue_from` hooks fix that. In the other areas: most type-system rules aren't checked, JSON `1.0` is refused for an Int variable, and its default `allow_legacy_*` validation settings only log a warning for several §5 rules. |
| [`graphql-go`](adapters/graphql-go) | graphql-go/graphql 0.8.1 | With thunks, a Non-Null error inside a thunk nulls all of `data` and drops the other errors (§6.4.4), and mutation root fields aren't serial (§6.3.4). In any mode, uncoercible leaves become null with no error, or truncate (§3.5.1); a non-finite Float leaves the client without a response; and keys come out sorted (§7.2.2, a SHOULD). |
| [`juniper`](adapters/juniper) | Juniper 0.18.0 (Rust) | Doesn't collect fields: a field selected twice resolves twice (§6.3.2). Error paths have no list indices (§7.1.4). A nested list's items are checked against the outer item type. A null item at a Non-Null position nulls the list without an error. Leaves aren't coerced, so a non-finite Float becomes null with no error. Validation lacks the Single Root Field and Unique Directives rules. |
| [`async-graphql`](adapters/async-graphql) | async-graphql 7.0.17, dynamic schemas | Its dynamic schema API breaks four rules: resolver errors have no `path`; errors don't stop at the nearest nullable field; an explicit null isn't treated as null; merged fields run their resolver twice. |

The kit checks the checker too. Every execution run evaluates 87 negative controls: 50 broken variants of cases recorded from graphql-js ([`kit/execution/controls.json`](kit/execution/controls.json)), 27 made at check time for checks the recordings can't reach (parent values, streams, locations, repeated keys, custom scalars), and 10 report controls. Each must be caught by the clause or check it names. The other areas run a self-test of their own on every run: 10 controls in `parse`, 15 in `validate`, 12 in `coordinate`, 353 in `introspect`, 992 in `schema` and 38,095 generated ones in `coerce`.

**[The conformance sheet](conformance/README.md)** shows what each implementation was checked against and what it breaks, by spec section and by check, with the shortest failing case for each failure. Every cell is a count from a kit report (`--report`); `npm run conformance` regenerates it.

## What is checked

### Execution

Across the 19 fixtures, the executor's three variants (errors under a nulled position reported, dropped, or dropped with their resolvers cancelled), every schedule and every combination of resolver outcomes, `ExecutionConformance.tla` checks six properties:

- **`ResponseIsValid`:** the response sent satisfies `Reference!Valid` for the resolvers settled at that moment.
- **`ResponseStaysValid`:** it stays valid as abandoned resolvers keep settling.
- **`ResponseIsFinal`:** nothing changes it after it is sent.
- **`EventuallyResponds`:** a response is always sent.
- **`RootFieldsAreSerial`:** a mutation's root fields execute one after another.
- **`Refines`:** all of the above, as refinement of `GraphQLResponse.tla`.

`Reference!Valid` requires all of the following:

- `data` is the completed value, in collected field order;
- every error was raised, at the path where it was raised;
- no two errors share a path;
- every error is inside a `null`;
- every `null` caused by an error comes with an error from its cause;
- a mutation reports every error its earlier root fields raised.

Errors inside a subtree that was already nulled may or may not be reported. §6.3.3 lets an executor cancel those resolvers, and graphql-js 16.13 and later, and 17, drop their errors.

The kit adds checks the reference doesn't state: the response's shape and its errors' entries (§7.1), error `locations` (SHOULDs, §7.1.6), a key repeated in a map (`uniqueKeys`, Appendix B), and leaf result coercion (§3.5). With capabilities, it also checks the value each resolver was called on (`parentValue`, §6.4.2), results a custom scalar or an ID must refuse or convert (§3.5, §3.5.5), and subscription streams the kit drives: one result per event, and how the stream ends when its source completes or fails, or the client cancels (§6.2.3). [`docs/conformance.md`](docs/conformance.md) lists every check.

### The kit on graphql-js

For each fixture, the kit tries every combination of resolver outcomes in two settling orders, plus 1,500 seeded random runs. That is about 31,200 runs and 5,900 distinct responses on graphql-js 17, plus 36 subscription streams. Every response satisfies the reference under `--strict`. The one failure is a stream's: in the scenario that cancels a subscription while an event executes, graphql-js still delivers that event's result (`nothingAfterCancel`, a SHOULD).

### Language

`Lexer.tla` and `Parser.tla` are hand-written references for §2. They cover the lexical grammar with its static semantics: escapes, surrogate pairs and `BlockStringValue()`. They also cover the grammar of executable documents, following September 2026's `SelectionSet : { Selection* }`, and the type system language: every type system definition and extension, including September 2026's directives on directive definitions and `extend directive`. Each has hand-written vectors and mutants.

`scripts/differential-lexer.mjs` lexes about 51,000 strings, parses about 43,000 executable documents and 9,600 type system sources with graphql-js 16 and 17. tla-ts checks that every token sequence and parse tree matches the reference. Error positions aren't compared, only success versus failure. There are three known discrepancies:

- **Long escapes:** graphql-js rejects a variable-width escape with more than 8 hex digits (`"\u{000000041}"`), which `EscapedUnicode :: { HexDigit+ }` allows.
- **Empty selection sets:** graphql-js 16 rejects `{}`, which September 2026 allows (graphql-spec#1227). graphql-js 17 accepts it.
- **Directives on directive definitions:** graphql-js 16 rejects `directive @d @x on FIELD` and `extend directive @d @x`, new in September 2026. graphql-js 17 accepts them.

### Schema coordinates

`SchemaCoordinates.tla` states §2.14: `Parse` reads a coordinate with §2.14's own lexical grammar, which has no Ignored tokens, and `Resolve` follows its five resolution algorithms over `TypeSystem.tla`'s schema data. Its properties check, on §2.14's example schema, that every schema element's coordinate resolves back to it and no two share one. Where §2.14's prose and its Asserts disagree (a member of a scalar or union type, an argument of an input field), the reference follows the Asserts, and the kit's `coordinate` area grades the case informationally, passing either reading. graphql-js 16.15 and 17 have a schema coordinate API (`parseSchemaCoordinate`, `resolveASTSchemaCoordinate`), and the kit grades them on it.

### Type system and introspection

`TypeSystem.tla` states the §3 type validation rules, including those of type system extensions (§3.1 and each kind's Extension section, with September 2026's directive extensions), and `Introspection.tla` the `__schema` result §4 requires. `scripts/differential-type-system.mjs` builds 955 schemas (55 written by hand, 900 generated). It checks that graphql-js's verdicts agree with `TypeSystem!Verdict` rule by rule, and that its introspection results satisfy `Introspection!Matches`. The differences it reports are documented ones. Among them:

- neither version rejects a type named like a built-in scalar (`scalar String`), or a directive that uses itself, directly or through an argument's type;
- graphql-js 17 validates default values in more places than September 2026 requires;
- graphql-js 16's introspection arguments are `Boolean = false` where September 2025 and later have `Boolean!`;
- graphql-js 17 has `FRAGMENT_VARIABLE_DEFINITION`.

No schema in the differential breaks an extension rule (or a few others, such as at most one `schema` definition); the kit's `schema` area grades most of them with pairs of its own, with the reference's verdicts (extensions for adapters with `schema-extensions`).

### Validation

`Validation.tla` states every §5 rule as an operator over a schema and a document. Each operator is named after the rule, quotes its formal text, and returns its violations. `scripts/differential-validation.mjs` builds about 3,800 documents and runs each rule alone in graphql-js 16 and 17: about 115,000 cases. Every disagreement must match a documented discrepancy, and each documented discrepancy must still occur. Among them:

- graphql-js 16 throws on `@skip(if: $v)` at a subscription root, and has no Operation Type Existence rule;
- both versions skip `__typename` in SameResponseShape, compare arguments by syntax, require fragments to be reachable from an operation, and reject a nullable OneOf variable even when it has a default.

### Input coercion and request errors

`Coercion.tla` covers input coercion, `GetOperation`, `CoerceVariableValues` and `CoerceArgumentValues`, a subscription's source stream (`CreateSourceEventStream`: its arguments, and the request error an error there is since September 2026), and tells a request error from an execution error. It stores numbers as decimal digits, so it can state the Int range and a double's range and precision exactly. `scripts/differential-coercion.mjs` runs about 2,000 operations per graphql-js version and checks each response, and the arguments each resolver received. Known discrepancies:

- both versions accept the Float literal `1e400` as `Infinity`, and silently round `99999999999999999999`;
- both accept a lone surrogate in a JSON String or ID;
- graphql-js 16 ignores unknown fields in an input object literal.

### Mutations (scenario)

Three `likePost { likes }` root fields, each nullable or Non-Null, chosen nondeterministically per run. Each one reads a counter, writes the counter plus one or raises, then resolves `likes: Int!`. Once a Non-Null root field fails and `data` is null, the executor may skip the remaining fields, as graphql-js 16 and 17 do, or keep going. Both behaviours are checked.

- `noLostUpdates`: the counter equals the number of side effects that happened.
- `responseIsSerial`: each payload reflects the effects before it in document order, plus its own.
- `effectsInDocumentOrder` (`@always`): side effects happen in document order.
- `dataNullIffNonNullRootFailed`: `data` is `null` exactly when a Non-Null root field failed.
- `nothingBeginsAfterDataNulled` (`@always`): when the executor stops, no root field begins after `data` was nulled.

### Subscriptions

`subscription { postLiked { likes title } }` runs over a source of up to three events, which may then end or throw. The response stream is consumed with `for await`, as graphql-js 17's `mapAsyncIterable` does. Neither the source nor the client is fair, and the client may unsubscribe at any point, even while an event is being executed. The model follows §6.2.3.2 as September 2026 states it, where graphql-js 17 differs (see [What graphql-js does](#what-graphql-js-does)).

- `creationFailureIsRequestError`: a failing subscribe resolver gives `{ errors }`, with no `data` and no stream.
- `responseMatchesOutcome`: each event's response nulls `title` or `data` as null propagation requires.
- `responsesInSourceOrder`: responses come out in source order, one per event.
- `closesOnlyForCause` and `sourceErrorIsRethrown`: `data: null` never ends the stream, and a source error reaches the client.
- `nothingNewAfterUnsubscribe` and `cancelCompletesNormally`: after unsubscribing, no response arrives, not even for an event that was executing, and the stream completes normally, never with an error.
- `nothingAfterClose` (`@always`): nothing arrives after the stream closed.
- `everyEventIsAnswered`, `completesOnceSourceEnds`, `sourceIsCleanedUp` and `completesOnceCancelled` (`@leadsTo`): every event gets a response, the stream ends when the source does, the source's `return()` is called after unsubscribe, and the stream completes after it.

The kit's subscription stream checks (`subscription-stream`, [docs/conformance.md](docs/conformance.md#subscription-streams)) grade implementations on these properties.

### `@defer`

A step-by-step model of incremental delivery, following RFC graphql-spec#1110 and graphql-js 17.1.0, for one operation. The operation has:

- a deferred fragment (`Profile`), with a fragment nested inside it (`Avatar`);
- a deferred root fragment (`Stats`);
- a Non-Null root field;
- a field selected both inside and outside a deferred fragment.

Every resolver settles in its own step. Each `@defer` may be honored or inlined, and `earlyExecution` controls whether deferred work may start before it is announced.

- `dataIsNeverRetracted`, `fieldsOnlyUnderLiveParents` and `nonNullNeverNull`: an error that reaches a fragment's boundary fails the fragment (`completed[].errors`) instead of nulling data the client already has. Fields only appear under live objects.
- `fieldsArriveWithTheirFragment`, `fieldsArriveOnce`, `deliveredResultsAreComplete` and `announcedFragmentsArriveLater`: each field arrives exactly once, inline or with its successfully completed fragment. Inlined fragments are never announced.
- `nullDataAnnouncesNothing` and `noOrphanedWork`: work under a nulled object or a failed fragment is cancelled and never announced, even if it already started.
- `errorsAreReal`, `errorsAtMostOncePerPath`, `nullsAreExplained` and `failuresAreExplained`: errors are tracked per path and per payload kind, and every null is explained by an error whose propagation reaches it.
- `lateExecutionWaitsForPending`: without early execution, deferred work starts only after it is announced.
- `completedWereAnnounced`, `completedAtMostOnce`, `nothingChangesAfterClose`, `streamEventuallyCloses` and `hasNextLeadsToAnotherPayload`: the `pending`, `completed` and `hasNext` protocol is honest, and every stream ends. Only announced work is fair, so liveness holds because the server filters or cancels work, not because everything runs.

### `@stream`

`feed { title items @stream(initialCount: 1) { id name } }` streams an async iterator of up to three items. Each `next()` call may yield an item, end, throw or hang, and each item's `name` may fail. Items are `[Item]` or `[Item!]`, chosen per run. The RFC doesn't specify `@stream` execution yet, so execution follows graphql-js 17.1.0.

- `clientHoldsSourcePrefix`: the client's list is a prefix of the source's items, in order, with no gaps or duplicates. Only nullable items that failed are `null`.
- `nothingIsRetracted` (`@always`): a failed `[Item!]` item ends the stream with `completed: [{ id, errors }]`. It never nulls the delivered list.
- `errorsAreReal`, `oneErrorPerPath` and `nullsAreExplained`: errors are real, there is one per path, and every null comes with an error, even when items are batched.
- `announcedUnderLiveParent`, `completedWereAnnounced` and `hasNextIsHonest`: the `pending`, `completed` and `hasNext` bookkeeping stays consistent. A stream under a nulled `feed` is never announced.
- `nothingAfterTheEnd` (`@always`): no payload follows a client cancel or `hasNext: false`.
- `announcedStreamCompletes` (`@leadsTo`): every announced stream completes, unless the client cancels or the source hangs.
- `abandonedIteratorIsClosed` (`@leadsTo`): when the stream stops early, the source's `return()` is eventually called. Sources answer `next()` fairly but may hang forever, which shows that `return()` doesn't wait for a pending `next()`. The one case graphql-js 17.1.0 misses, described under "What graphql-js does", is left out of this property.

## Mutants

A property that no bug can break proves nothing. Each `specs/*.mutants.mjs` lists realistic bugs, 302 in all over 130 properties. For example:

- nulling a failing Non-Null field instead of its parent;
- filtering errors against the final null set, which drops a mutation's earlier errors;
- ignoring `@skip`;
- running mutation root fields in parallel;
- accepting `00` as an Int;
- missing a fragment cycle through a nested spread;
- dropping an argument's default;
- merging a failed fragment's partial data.

Each mutant names the one property that must catch it, and `npm run check:specs` checks the mutant with only that property enabled. The check fails if any property of any spec has no mutant that breaks it. The differentials plant their references' mutants too (`npm run check:mutants`), and each must make graphql-js disagree.

## What graphql-js does

Reading and running graphql-js 16.15.0 and 17.1.0 while writing these specs turned up the following:

- **Errors under nulled positions:** since 16.13.0, and in 17, graphql-js drops errors raised under a position that error propagation has already nulled (`_hasNulledPosition`, graphql-js#4458). This implements graphql-spec#1184, which is still open. It is an intended behaviour change: errors raised before the nulling are still reported.
- **Mutations:** both versions stop running root fields once a Non-Null root field fails (`promiseReduce`). The spec allows that, but doesn't require it.
- **Subscriptions:**
  - 17's `mapAsyncIterable` never overlaps event executions, and it still delivers an in-flight event after `return()`. §6.2.3.2 completes the response stream when it is cancelled, but doesn't say what becomes of an event already executing, so the kit grades this as a SHOULD (`nothingAfterCancel`), and the subscription model has it as a mutant that `nothingNewAfterUnsubscribe` catches.
  - 16's `mapAsyncIterator` overlaps executions when a client calls `next()` concurrently, so responses can settle out of order.
- **Async iterable lists** ([graphql-js#5003](https://github.com/graphql/graphql-js/issues/5003)): in 17.1.0, if a list's parent is nulled while the first `next()` on the list's async iterator is pending, `return()` is only called once that `next()` settles, so a `next()` that never settles means `return()` is never called. This happens for plain lists and for the initial items of `@stream`. The resolver's abort signal (`info.getAbortSignal()`) does fire, so resolvers can clean up. Past `initialCount` with early execution on, the stream path calls `return()` straight away, even while a `next()` is pending. To reproduce, run [`scripts/repro/stream-return.mjs`](scripts/repro/stream-return.mjs).

- **`@defer` with a null `data`:** when nothing is left pending, for example because `data` is null, 17.1.0 sends a plain `{ data, errors }` result instead of an incremental one.
- **`@defer` failures:** a deferred fragment that fails reports only the error that reached its boundary. Errors it had already collected at nullable fields inside it are discarded, along with the fragment's data.
- **Abandoned siblings:** graphql-js doesn't cancel sibling resolvers under a nulled position. It discards their results.

## Limits

- **Bounded fixtures:** model checking explores small fixtures exhaustively, with lists of at most two items. It proves nothing about all schemas.
- **Adapters:** every adapter answers execution, but only some answer the other areas (see the sheet). The references themselves were checked differentially against graphql-js only, so a bug they share with graphql-js shows up as a pass everywhere.
- **Scenario specs:** the `@defer`, `@stream`, mutation and subscription specs each model one fixed operation.

[docs/spec-comparison.md](docs/spec-comparison.md) compares the references with the spec chapter by chapter: what each covers, the readings they take where the spec is ambiguous, and what they don't model.

## Writing specs

See [docs/writing-specs.md](docs/writing-specs.md) for the layout, the mutant format, and the tla-ts pitfalls this repo ran into.

## Results website

The deployable Preact frontend lives in [`website/`](website/README.md). Run
`npm run website:dev` locally or `npm run website:build` to generate static assets
for Cloudflare Pages or Workers. It shows the latest checked-in conformance reports.
