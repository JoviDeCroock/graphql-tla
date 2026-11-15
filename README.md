# graphql-tla

GraphQL execution semantics as TLA+ specifications, model checked with [tla-ts](https://github.com/aidenybai/tla-ts) and checked against [graphql-js](https://github.com/graphql/graphql-js) 16.15.0 and 17.1.0.

It covers how a GraphQL request executes: field collection, value completion, error propagation, mutations, subscriptions, `@defer` and `@stream`. It doesn't cover the language (§2), introspection (§4), validation (§5) or input coercion. Those are pure functions with no concurrency for a model checker to explore, and tests against graphql-js serve them better.

## How it fits together

```
fixtures/*.graphql ──generate──▶ specs/lib/fixtures.ts ──▶ specs/execution.ts ──tla-ts──▶ Execution.tla
                           └───▶ specs/Fixtures.tla ──┐                                      │
                                                     ▼                                       ▼
                       specs/Reference.tla ◀── specs/GraphQLResponse.tla ◀── refines ── ExecutionConformance.tla
                              ▲
                              └── every response from graphql-js 16 and 17 (scripts/graphql-js.mjs)
```

| Layer | File | What it is |
| --- | --- | --- |
| Reference | [`Reference.tla`](specs/Reference.tla) | Hand-written TLA+ that follows the spec's algorithms: `CollectFields`, `DoesFragmentTypeApply`, `CollectSubfields`, `CompleteValue` with lists and abstract types, and error propagation. `Valid(fixture, outcomes, data, errors)` states when a response is correct for the resolver outcomes it was built from. |
| Contract | [`GraphQLResponse.tla`](specs/GraphQLResponse.tla) | What an observer sees: resolvers settle, one response is sent, and it is valid, final, and eventually sent. |
| Executor | [`execution.ts`](specs/execution.ts) | A step-by-step executor that works for any schema and query. Each resolver settles on its own, in any order, to any outcome its type allows, and the response is sent as soon as the root completes. It has three variants: `reportAll`, `filterNulled` (graphql-js 16.15 and 17), and `cancelNulled`. It shares no code with the reference. |
| Refinement | [`ExecutionConformance.tla`](specs/ExecutionConformance.tla) | Proves that the executor refines the contract on every fixture, in every variant, under every schedule. |
| graphql-js | [`scripts/graphql-js.mjs`](scripts/graphql-js.mjs) | Runs the real graphql-js with resolvers whose promises the script settles itself. It checks every response against `Reference!Valid` with tla-ts. |
| Scenarios | [`mutation.ts`](specs/mutation.ts), [`subscription.ts`](specs/subscription.ts), [`defer.ts`](specs/defer.ts), [`stream.ts`](specs/stream.ts) | Step-by-step models of the behaviour that happens over time. Each one uses a fixed operation. |

Fixtures are plain GraphQL. Each [`fixtures/*.graphql`](fixtures) file holds a schema, one query and its fragments, plus optional `# variables:` and `# maxListLength:` headers. [`scripts/generate-fixtures.mjs`](scripts/generate-fixtures.mjs) turns each one into data for both the executor and the reference. The current fixtures are:

- `nullPropagation`: Non-Null chains and `data: null`
- `lists`: `[Post!]` and `[String]!`, with items completing in parallel
- `fragments`: an interface, inline fragments and fragment spreads, `@skip`/`@include`, aliases, and merged response keys

## Running

```shell
npm install
npm run check              # everything below
npm run check:specs        # specs, modules, mutants and coverage
npm run check:specs defer  # only names containing "defer"
npm run check:graphql-js   # graphql-js against the reference
npm run fixtures           # regenerate fixture data after editing fixtures/
```

## What is checked

### Execution

Across the three fixtures, the three variants, every schedule and every combination of resolver outcomes, `ExecutionConformance.tla` checks four properties:

- `ResponseIsValid`: the response sent satisfies `Reference!Valid` for the resolvers settled at that moment:
  - `data` is exactly the completed value, in collected field order;
  - every error was really raised, at the path where it was raised;
  - no two errors share a path (§6.4.4);
  - every error is inside a `null`;
  - every `null` caused by an error comes with an error from its cause.
- `ResponseIsFinal`: nothing changes the response after it is sent, even while abandoned resolvers keep settling.
- `EventuallyResponds`: a response is always sent.
- `Refines`: all of the above, as refinement of `GraphQLResponse.tla`.

Errors inside a subtree that was already nulled may or may not be reported. §6.3.3 lets an executor cancel those resolvers, and graphql-js 16.15 and 17 drop their errors. All three variants satisfy the reference.

### graphql-js

For each fixture and each graphql-js version, `scripts/graphql-js.mjs` tries every combination of resolver outcomes in two settling orders, plus 1,500 seeded random runs. That comes to about 9,400 runs and 2,500 distinct responses. tla-ts checks each response against `Reference!Valid`, using the outcomes that had settled when graphql-js returned. Six negative controls must each be rejected:

- an error is dropped;
- an error is reported twice;
- a value is nulled without an error;
- response keys are reordered;
- a list item is dropped;
- a null `data` loses its errors.

Without them, the check could pass vacuously.

### Mutations

Three `likePost { likes }` root fields, each nullable or Non-Null, chosen nondeterministically per run. Each one reads a counter, writes the counter plus one or raises, then resolves `likes: Int!`. Once a Non-Null root field fails and `data` is null, the executor may skip the remaining fields, as graphql-js 16 and 17 do, or keep going. Both behaviours are checked.

- `noLostUpdates`: the counter equals the number of side effects that happened.
- `responseIsSerial`: each payload reflects the effects before it in document order, plus its own.
- `effectsInDocumentOrder` (`@always`): side effects happen in document order.
- `dataNullIffNonNullRootFailed`: `data` is `null` exactly when a Non-Null root field failed.
- `nothingBeginsAfterDataNulled` (`@always`): when the executor stops, no root field begins after `data` was nulled.

### Subscriptions

`subscription { postLiked { likes title } }` runs over a source of up to three events, which may then end or throw. The response stream is consumed with `for await`, as graphql-js 17's `mapAsyncIterable` does. Neither the source nor the client is fair, and the client may unsubscribe at any point, even while an event is being executed.

- `creationFailureIsRequestError`: a failing subscribe resolver gives `{ errors }`, with no `data` and no stream.
- `responseMatchesOutcome`: each event's response nulls `title` or `data` as null propagation requires.
- `responsesInSourceOrder`: responses come out in source order, one per event.
- `closesOnlyForCause` and `sourceErrorIsRethrown`: `data: null` never ends the stream, and a source error reaches the client.
- `nothingNewAfterUnsubscribe` and `nothingAfterClose` (`@always`): after unsubscribing, only the in-flight event is answered, and nothing arrives after close.
- `everyEventIsAnswered`, `completesOnceSourceEnds` and `sourceIsCleanedUp` (`@leadsTo`): every event gets a response, the stream ends when the source does, and the source's `return()` is called after unsubscribe.

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

A property that no bug can break proves nothing. Each `specs/*.mutants.mjs` lists realistic bugs, for example:

- nulling a failing Non-Null field instead of its parent;
- ignoring `@skip`;
- returning the live errors list;
- running mutation root fields in the wrong order;
- merging a failed fragment's partial data;
- re-sending a field a deferred fragment shares with the initial result;
- delivering streamed items in completion order;
- graphql-js 16's subscription `return()` resolving before the in-flight response.

Each mutant names the one property that must catch it, and `npm run check:specs` checks the mutant with only that property enabled. The check fails if any invariant or temporal property of any spec has no mutant that breaks it. There are currently 64 mutants covering 49 properties.

## What graphql-js does

Reading and running graphql-js 16.15.0 and 17.1.0 while writing these specs turned up the following:

- **Errors under nulled positions:** 16.15 and 17 both drop errors from positions under one already nulled by error propagation (`_hasNulledPosition`). 16.15 got this as a backport, so "16 reports everything" is no longer true.
- **Mutations:** both versions stop running root fields once a Non-Null root field fails (`promiseReduce`). The spec allows that, but doesn't require it.
- **Subscriptions:**
  - 17's `mapAsyncIterable` never overlaps event executions, and it still delivers an in-flight event after `return()`.
  - 16's `mapAsyncIterator` overlaps executions when a client calls `next()` concurrently, so responses can settle out of order.
- **`@stream`:** in 17.1.0, if a stream's parent is nulled while the first `next()` call on its iterator is still pending, `return()` is never called on the iterator. To reproduce, run [`scripts/repro/stream-return.mjs`](scripts/repro/stream-return.mjs).

- **`@defer` with a null `data`:** when nothing is left pending, for example because `data` is null, 17.1.0 sends a plain `{ data, errors }` result instead of an incremental one.
- **`@defer` failures:** a deferred fragment that fails reports only the error that reached its boundary. Errors it had already collected at nullable fields inside it are discarded, along with the fragment's data.
- **Abandoned siblings:** graphql-js doesn't cancel sibling resolvers under a nulled position. It discards their results.

## Limits

- **Bounded fixtures:** model checking explores small fixtures exhaustively, with lists of at most two items. It proves nothing about all schemas.
- **Scenario specs:** the `@defer`, `@stream`, mutation and subscription specs each model one fixed operation. They aren't generic over fixtures like `execution.ts`.
- **Query operations only:** the generic executor and the reference cover queries. Mutations are modelled in `mutation.ts` only.

## Writing specs

See [docs/writing-specs.md](docs/writing-specs.md) for the layout, the mutant format, and the tla-ts pitfalls this repo ran into.
