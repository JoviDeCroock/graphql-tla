# graphql-tla

GraphQL execution semantics as TLA+ specifications. The specs are written in TypeScript and model checked with [tla-ts](https://github.com/aidenybai/tla-ts), which compiles each `.ts` file to a TLA+ module and config and then checks every reachable state.

The specs cover three parts of GraphQL that are hard to get right because things happen concurrently:

| Spec                                         | Models                                                              | GraphQL spec                                                  |
| -------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------- |
| [`execution.ts`](specs/execution.ts)         | Resolvers running in parallel, field errors, and null propagation   | §6.3 Executing Selection Sets, §6.4.4 Handling Field Errors   |
| [`mutation.ts`](specs/mutation.ts)           | Root mutation fields running one after another                      | §6.2.2 Mutation, §6.3.1 Normal and Serial Execution           |
| [`defer.ts`](specs/defer.ts)                 | `@defer` incremental delivery: `pending`, `completed`, and `hasNext` | [Incremental delivery RFC](https://github.com/graphql/graphql-spec/pull/1110) |

The generated TLA+ is committed next to each source file: [`Execution.tla`](specs/Execution.tla), [`Mutation.tla`](specs/Mutation.tla), and [`Defer.tla`](specs/Defer.tla). Edit the `.ts` files. tla-ts regenerates the `.tla` and `.cfg` files on every check.

## Running

```shell
npm install
npm run check            # every spec, then every mutant
npm run check:defer      # one spec, with TLC's full output and any counterexample trace
```

## How GraphQL maps to TLA+

Each spec fixes one schema and one operation. Each response position is a value of a string union, such as `"user" | "userId" | "friend"`, and tables like `parentOf` and `nonNull` describe the schema. TLC then explores every combination of resolver outcomes (a value, `null`, or an error) and every order in which resolvers finish.

- **State** is what an executor or client holds: resolver status, the response being built, the `errors` list, and the payloads sent so far.
- **Actions** are exported functions: a resolver starting or settling, a mutation's side effect, or a payload being sent. A parameter such as `(field: Field, result: Outcome)` means any value of its type.
- **Invariants** are exported functions that return a boolean. JSDoc tags add temporal properties: `@always` relates each state to the one before it, and `@eventually` together with `@fair` actions checks that every stream ends.

## What the specs prove

### Execution

The executor builds the response the way graphql-js does. As each resolver settles, it writes its own slot in the response. An error, or a `null` in a Non-Null position, nulls the nearest nullable ancestor, or `data` itself. For every schedule:

- `nonNullNeverNull`: no Non-Null position in the response is ever `null`.
- `errorsAreReal` and `failuresAreReported`: `errors` lists exactly the fields that failed, each one once.
- `dataNullOnlyFromRootBubbling`: `data` is `null` only when a Non-Null root field failed.
- `matchesSpec`: once every resolver has settled, the response equals a declarative reading of the spec's `CompleteValue`, whatever order the resolvers finished in.

### Mutation

Each `likePost` reads a counter, writes it back plus one, and then resolves `{ likes }`.

- `oneAtATime`: only one root field runs at a time.
- `noLostUpdates`: the counter equals the number of mutations that succeeded.
- `responseIsSerial`: each payload reflects the mutations before it in document order, plus itself.

Set `SERIAL` to `false` and the checker finds a schedule where two root fields overlap.

### `@defer`

The operation has a deferred fragment, a fragment nested inside it, and a deferred fragment on the root. Deferred work runs concurrently with the initial result.

- `dataIsNeverRetracted` (`@always`): no payload changes data the client has already seen. An error that would null an already-delivered field stops at the fragment boundary and is sent as `completed: [{ id, errors }]`.
- `announcedUnderLiveParent`: a fragment is announced in `pending` only under an object the client has.
- `fieldsArriveWithTheirFragment`: deferred fields never arrive in the initial payload or from a fragment that failed.
- `hasNextIsHonest`, `completedWereAnnounced`, `noFragmentLeftBehind`, and `nothingAfterClose`: the `pending`, `completed`, and `hasNext` bookkeeping stays consistent.
- `streamEventuallyCloses` (`@eventually`): every stream ends.

## Mutants

A property that never fails proves nothing, so [`scripts/check.mjs`](scripts/check.mjs) also checks mutants. A mutant is a copy of a spec with one realistic bug planted, and the check passes only if tla-ts reports a violation of one of the properties the mutant targets:

```
Mutants
✓ execution.ts: nulls the failing field instead of the nearest nullable ancestor → caught by nonNullNeverNull
✓ execution.ts: treats null in a Non-Null position as a value, not a field error → caught by nonNullNeverNull
✓ execution.ts: drops a Non-Null field's error instead of propagating it to the parent → caught by matchesSpec
✓ execution.ts: reports an error once per bubbling step instead of once per field → caught by errorsAreReal
✓ mutation.ts: executes mutation root fields in parallel, like a query → caught by oneAtATime
✓ defer.ts: propagates a deferred field error past the fragment boundary → caught by announcedUnderLiveParent
✓ defer.ts: delivers a failed fragment's Non-Null field as null → caught by fieldsArriveWithTheirFragment
✓ defer.ts: announces a fragment whose parent was nulled → caught by announcedUnderLiveParent
✓ defer.ts: forgets to announce a nested fragment → caught by noFragmentLeftBehind
✓ defer.ts: computes hasNext before announcing the nested fragment → caught by hasNextIsHonest
```

## Adding a spec

Add `specs/<name>.ts`, run `npx tla-ts specs/<name>.ts`, and commit the generated `.tla` and `.cfg` with it. tla-ts compiles a subset of TypeScript. It has no loops, so use `every`, `some`, `filter`, and recursive helpers instead. Parameters need finite types. The [tla-ts TypeScript guide](https://github.com/aidenybai/tla-ts/blob/main/docs/typescript.md) lists every construct it supports.

Write header comments as `/* … */`, not `/** … */`. tla-ts reads JSDoc tags, so a `/**` comment that mentions `@defer` fails with `Unknown tag`.
