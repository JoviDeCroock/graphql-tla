# graphql-go/graphql 0.8.1

Generated from the conformance kit's reports. Back to the [sheet](README.md).

**Notes** (hand-written, from outside the kit):

- graphql-go doesn't make runs deterministic (it resolves fields in Go map order), so the adapter doesn't claim `idle` and the kit waits 10 ms after each settle instead; the sheet's cases are random runs only.
- The resolver returns a thunk, graphql-go's way to keep several resolvers pending. The Non-Null propagation and mutation ordering findings come from thunks; with `--sync` only the key order, leaf coercion and mutation error findings remain. See the [adapter's README](../adapters/graphql-go/README.md#known-graphql-go-deviations).

## Execution

- **Capabilities:** deferred-items, invalid-results, mutation, subscription, uncoercible-results
- **Cases:** 10500 submitted, 1856 distinct, 562 malformed
- **Adapter problems:** none
- **Checker self-test:** passed (35 negative controls)
- **Run:** kit 0bbe05428474, 2026-11-15, strict, 1500 random runs per fixture (seed 1), exhaustive runs off

### Findings

<a id="execution-finding-1"></a>

#### 1. `dataMatches`

406 cases, in `fragments` (148), `nullPropagation` (114), `lists` (111), `unions` (33).

- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))

The shortest case, from `fragments`:

```
trace:    call node; settle node = object(Bot); call node.id; call node.nodeId; settle node.nodeId = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Bot.id.","locations":[{"line":12,"column":7}],"path":["node","nodeId"]}]}
expected: data {"node": null}
```

<a id="execution-finding-2"></a>

#### 2. `resultCoercion`: the implementation produced no response, after a resolver returned a value its type can't represent: …

299 cases, in `leaves` (299).

- A non-finite Float or an unknown enum value raises an execution error (MUST, [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion))

The shortest case, from `leaves`:

```
problem:  the implementation produced no response, after a resolver returned a value its type can't represent: "can't serialize the result: json: unsupported value: +Inf"
trace:    call count; call ratio; call color; settle ratio = uncoercible; settle count = uncoercible; settle color = error
response: none: can't serialize the result: json: unsupported value: +Inf
```

<a id="execution-finding-3"></a>

#### 3. `intFraction`: count is 1, though its resolver returned a value its type can't represent, which should raise an execution error

256 cases, in `leaves` (256).

- A fraction returned for an Int (1.2) raises an execution error instead of being truncated (SHOULD, [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion))

The shortest case, from `leaves`:

```
problem:  count is 1, though its resolver returned a value its type can't represent, which should raise an execution error
trace:    call count; call ratio; call color; settle ratio = object(); settle count = uncoercible; settle color = error
response: {"data":{"color":null,"count":1,"ratio":null},"errors":[{"message":"resolver at color failed","locations":[{"line":4,"column":3}],"path":["color"]}]}
```

<a id="execution-finding-4"></a>

#### 4. `keyOrder`

245 cases, in `leaves` (165), `unions` (71), `nullPropagation` (9).

- Response keys are in collected field order (SHOULD, [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering))

The shortest case, from `nullPropagation`:

```
trace:    call version; call user; settle user = null; settle version = leaf
response: {"data":{"user":null,"version":"v"}}
expected: data {"version": <leaf>, "user": null}
```

<a id="execution-finding-5"></a>

#### 5. `calledSerially`

242 cases, in `mutation` (242).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle second = error
response: {"data":null,"errors":[{"message":"resolver at second failed","locations":[{"line":5,"column":3}],"path":["second"]}]}
expected: data null
```

<a id="execution-finding-6"></a>

#### 6. `keyOrder`, `nullsExplained`

208 cases, in `leaves` (208).

- Response keys are in collected field order (SHOULD, [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `leaves`:

```
trace:    call count; call ratio; call color; settle ratio = null; settle color = uncoercible; settle count = error
response: {"data":{"color":null,"count":null,"ratio":null},"errors":[{"message":"resolver at count failed","locations":[{"line":2,"column":3}],"path":["count"]}]}
expected: data {"count": null, "ratio": null, "color": null}
```

<a id="execution-finding-7"></a>

#### 7. `dataMatches`, `nullsExplained`

86 cases, in `lists` (61), `unions` (25).

- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `lists`:

```
trace:    call posts; call tags; settle tags = list(1); settle posts = list(1); call posts.0; call tags.0; settle tags.0 = error; settle posts.0 = error
response: {"data":null,"errors":[{"message":"resolver at posts.0 failed","locations":[{"line":2,"column":3}],"path":["posts",0]}]}
expected: data {"posts": null, "tags": [null]}
```

<a id="execution-finding-8"></a>

#### 8. `calledSerially`, `serialErrorsKept`

85 cases, in `mutation` (85).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- A mutation reports every error its earlier root fields raised (MUST, [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle second = error; settle first = error
response: {"data":null,"errors":[{"message":"resolver at second failed","locations":[{"line":5,"column":3}],"path":["second"]}]}
expected: data null
```

<a id="execution-finding-9"></a>

#### 9. `calledSerially`, `nullsExplained`, `serialErrorsKept`

79 cases, in `mutation` (79).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))
- A mutation reports every error its earlier root fields raised (MUST, [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle second = error; settle first = null; settle third = object(Payload); call third.likes; settle third.likes = error
response: {"data":null,"errors":[{"message":"resolver at third.likes failed","locations":[{"line":9,"column":5}],"path":["third","likes"]}]}
expected: data null
```

<a id="execution-finding-10"></a>

#### 10. `complete`

72 cases, in `lists` (59), `unions` (13).

- The response is sent only once execution is complete (MUST, [§6.3.1](https://spec.graphql.org/draft/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/draft/#sec-Data))

The shortest case, from `lists`:

```
trace:    call posts; call tags; settle posts = list(1); call posts.0; settle tags = list(1); call tags.0; settle posts.0 = error
response: {"data":null,"errors":[{"message":"resolver at posts.0 failed","locations":[{"line":2,"column":3}],"path":["posts",0]}]}
expected: data (incomplete)
```

<a id="execution-finding-11"></a>

#### 11. `calledSerially`, `complete`

54 cases, in `mutation` (54).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- The response is sent only once execution is complete (MUST, [§6.3.1](https://spec.graphql.org/draft/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/draft/#sec-Data))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle first = object(Payload); call first.likes; settle first.likes = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Payload.likes.","locations":[{"line":3,"column":5}],"path":["first","likes"]}]}
expected: data (incomplete)
```

<a id="execution-finding-12"></a>

#### 12. `calledSerially`, `complete`, `nullsExplained`

14 cases, in `mutation` (14).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- The response is sent only once execution is complete (MUST, [§6.3.1](https://spec.graphql.org/draft/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/draft/#sec-Data))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle first = object(Payload); call first.likes; settle third = error; settle first.likes = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Payload.likes.","locations":[{"line":3,"column":5}],"path":["first","likes"]}]}
expected: data (incomplete)
```

<a id="execution-finding-13"></a>

#### 13. `calledSerially`, `dataMatches`, `nullsExplained`, `serialErrorsKept`

10 cases, in `mutation` (10).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))
- A mutation reports every error its earlier root fields raised (MUST, [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle second = object(Payload); settle first = error; call second.likes; settle third = object(Payload); settle second.likes = leaf; call third.likes; settle third.likes = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Payload.likes.","locations":[{"line":9,"column":5}],"path":["third","likes"]}]}
expected: data {"first": null, "second": {"likes": <leaf>}, "third": null}
```

<a id="execution-finding-14"></a>

#### 14. `calledSerially`, `dataMatches`

9 cases, in `mutation` (9).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle second = object(Payload); settle first = null; call second.likes; settle third = object(Payload); settle second.likes = leaf; call third.likes; settle third.likes = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Payload.likes.","locations":[{"line":9,"column":5}],"path":["third","likes"]}]}
expected: data {"first": null, "second": {"likes": <leaf>}, "third": null}
```

<a id="execution-finding-15"></a>

#### 15. `calledSerially`, `nullsExplained`

8 cases, in `mutation` (8).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle second = null; settle first = object(Payload); call first.likes; settle first.likes = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Payload.likes.","locations":[{"line":3,"column":5}],"path":["first","likes"]}]}
expected: data null
```

<a id="execution-finding-16"></a>

#### 16. `intFraction`: … is 1, though its resolver returned a value its type can't represent, which should raise an execution error

7 cases, in `unions` (7).

- A fraction returned for an Int (1.2) raises an execution error instead of being truncated (SHOULD, [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion))

The shortest case, from `unions`:

```
problem:  matrix.0.0 is 1, though its resolver returned a value its type can't represent, which should raise an execution error
trace:    call search; call matrix; settle matrix = list(1); settle search = leaf; call matrix.0; settle matrix.0 = list(1); call matrix.0.0; settle matrix.0.0 = uncoercible
response: {"data":{"matrix":[[1]],"search":null},"errors":[{"message":"User Error: expected iterable, but did not find one for field Query.search.","locations":[{"line":2,"column":3}],"path":["search"]}]}
```

<a id="execution-finding-17"></a>

#### 17. `complete`, `nullsExplained`

5 cases, in `lists` (5).

- The response is sent only once execution is complete (MUST, [§6.3.1](https://spec.graphql.org/draft/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/draft/#sec-Data))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `lists`:

```
trace:    call posts; call tags; settle tags = list(2); settle posts = list(2); call posts.0; call posts.1; call tags.0; call tags.1; settle tags.1 = error; settle posts.0 = error
response: {"data":null,"errors":[{"message":"resolver at posts.0 failed","locations":[{"line":2,"column":3}],"path":["posts",0]}]}
expected: data (incomplete)
```

<a id="execution-finding-18"></a>

#### 18. `calledSerially`, `complete`, `nullsExplained`, `serialErrorsKept`

3 cases, in `mutation` (3).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- The response is sent only once execution is complete (MUST, [§6.3.1](https://spec.graphql.org/draft/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/draft/#sec-Data))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))
- A mutation reports every error its earlier root fields raised (MUST, [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle third = object(Payload); call third.likes; settle first = error; settle third.likes = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Payload.likes.","locations":[{"line":9,"column":5}],"path":["third","likes"]}]}
expected: data (incomplete)
```

<a id="execution-finding-19"></a>

#### 19. `calledSerially`, `dataMatches`, `nullsExplained`

2 cases, in `mutation` (2).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle third = error; settle first = object(Payload); settle second = object(Payload); call second.likes; settle second.likes = leaf; call first.likes; settle first.likes = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Payload.likes.","locations":[{"line":3,"column":5}],"path":["first","likes"]}]}
expected: data {"first": null, "second": {"likes": <leaf>}, "third": null}
```

### Every check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **(draft only):** the failing cases rely on grammar or rules that are only in the draft, not in the October 2021 edition.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | Result |
| --- | :---: | :---: | :---: |
| The response is sent only once execution is complete (`complete`) | MUST | [§6.3.1](https://spec.graphql.org/draft/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✗ 148/1856 |
| data is the completed value: field collection, value completion and null propagation (`dataMatches`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✗ 513/1856 |
| Response keys are in collected field order (`keyOrder`) | SHOULD | [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering) | ! 453/1856 |
| Every error was raised, at the path where it was raised (`errorsWereRaised`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 1856 |
| No two errors share a response path (`errorPathsUnique`) | MUST (Oct 2021: SHOULD) | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 1856 |
| Every error is inside a null in data (`errorsInsideNulls`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 1856 |
| Every null an error caused comes with an error from one of its causes (`nullsExplained`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✗ 415/1856 |
| A mutation reports every error its earlier root fields raised (`serialErrorsKept`) | MUST | [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✗ 177/506 |
| A mutation's root fields execute one after another (`calledSerially`) | MUST | [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) | ✗ 506/506 |
| Each field is executed once, merged selections included (`callsOnce`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) | ✓ 10500 |
| Only fields the operation selects are executed (`callsSelected`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) | ✓ 10500 |
| A field executes only once its parent has a value that contains it (`callsReachable`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 10500 |
| A request gets a response (`responds`) | MUST | [§7.1](https://spec.graphql.org/draft/#sec-Response-Format) | ✓ 10500 |
| A subscription event yields an execution result, even when its data is null (`eventYieldsResult`) | MUST | [§6.2.3.2](https://spec.graphql.org/draft/#sec-Response-Stream) | ✓ 1500 |
| data holds only positions the operation selects (`dataShape`) | MUST | [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ 3718 |
| A non-finite Float or an unknown enum value raises an execution error (`resultCoercion`) | MUST | [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✗ 299/588 |
| A fraction returned for an Int (1.2) raises an execution error instead of being truncated (`intFraction`) | SHOULD | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ! 263/334 |
| Leaf values are the resolver's canonical value (Int 1, Float 1.5, Boolean true, an enum's first value, "v") (`leafValues`) | MUST | [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 3718 |
| Leaf values use the JSON type §7.2.1 gives their GraphQL type (a number for Int 1, not "1") (`leafEncoding`) | SHOULD | [§7.2.1](https://spec.graphql.org/draft/#sec-JSON-Serialization) | ✓ 3718 |
| An execution result has a data entry (`dataPresent`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 10201 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 10201 |
| The response has no entries besides data, errors and extensions (`additionalEntries`) | MUST | [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ 10201 |
| extensions is a map (`extensions`) | MUST | [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) | – |
| Errors are maps with a message, and extensions, if present, is a map (`errorFormat`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 8424 |
| An error's locations, if present, is a list of maps with line and column, both positive integers (`errorLocations`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 8424 |
| Execution errors have a path to a position the operation selects (`errorPath`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 8424 |
| Paths are lists of response names (aliases, not field names) and integer list indices (`responsePosition`) | MUST (Oct 2021: SHOULD) | [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) | ✓ 8424 |
| Errors have no entries besides message, locations, path and extensions (`errorEntries`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 8424 |
| The adapter follows the kit's protocol (call types, settles) (`protocol`) | ADAPTER | — | ✓ 10500 |
| With error propagation off, an error nulls the position where it happened (graphql-js 17's @experimental_disableErrorPropagation) (`disabledPropagation`) | INFO | — | – |

- **Basis for `complete`:** No sentence says to respond only once execution is complete; the algorithms do. ExecuteRootSelectionSet (§6.3.1) returns {data} once ExecuteCollectedFields has run, and §6.3.3 says "Execution will recursively resolve and complete the value of every entry in the collected fields map". The draft's §7.1.5 adds: "The response data is the result of accumulating the resolved result of all response positions during execution." Positions §6.3.3 lets an implementation cancel don't hold the response back.
- **Basis for `dataMatches`:** When an error propagates to the root, §6.4.4 and §7.1.5 say data "should be null", in both editions. The kit still requires null, because no other value conforms: the execution result must have a data entry (§7.1.1), {} or a partial map leaves out an entry ExecuteCollectedFields must produce (§6.3.3), and a map with null at the failed root field breaks that field's Non-Null type.
- **Basis for `errorPathsUnique`:** The draft's §6.4.4: "each error added to the errors list during execution must have a unique response path." October 2021's: "only one error should be added to the errors list per field." Both editions say the errors list "must not be further affected" when a position is null because of an error already added.
- **Basis for `serialErrorsKept`:** §6.4.4: an execution error "must be added to the errors list". §6.3.3 lets an implementation cancel fields that have not yet executed or yielded a value, but §6.3.4 completes each mutation root field before the next starts, so an earlier root field's errors can't have been cancelled.
- **Basis for `intFraction`:** The level is contested. §3.5.1 states a rule with must: services "may coerce non-integer internal values to integers when reasonable without losing information, otherwise they must raise an execution error". Truncating 1.2 loses information, so on that reading the must applies. But the example that applies the rule to this very case says should: "a floating-point number 1.2 should raise an execution error instead of being truncated to 1". Where the level is in doubt, the kit takes the weaker one, so this is a SHOULD. October 2021 has the same sentences, with "field error".
- **Basis for `responsePosition`:** The draft's §7.1.4: "The value for a response path must be a list of path segments", with list indices "0-indexed integers", and an aliased field "must use the aliased name". October 2021's §7.1.6 says each of these with should: "This field should be a list of path segments", "If the error happens in an aliased field, the path to the error should use the aliased name".
- **Basis for `disabledPropagation`:** Not a GraphQL rule: neither edition has execution without error propagation. §6.4.4 says: "Since Non-Null response positions cannot be null, execution errors are propagated to be handled by the parent response position." Every failure of the noPropagation fixture's response (its data and errors) counts here, never against a spec section, and never fails the run. Turning propagation off doesn't change which resolvers run, so protocol problems and the checks on calls (callsOnce, callsSelected, callsReachable, calledSerially) keep their own checks.

### Fixtures

| Fixture | Result | Note |
| --- | :---: | :---: |
| [`fragments`](../fixtures/fragments.graphql) | ✗ 148/1500 |  |
| [`leaves`](../fixtures/leaves.graphql) | ✗ 928/1500 |  |
| [`lists`](../fixtures/lists.graphql) | ✗ 236/1500 |  |
| [`mutation`](../fixtures/mutation.graphql) | ✗ 506/1500 |  |
| [`noPropagation`](../fixtures/noPropagation.graphql) | – | needs error-propagation-off |
| [`nullPropagation`](../fixtures/nullPropagation.graphql) | ✗ 123/1500 |  |
| [`subscription`](../fixtures/subscription.graphql) | ✓ 1500 |  |
| [`unions`](../fixtures/unions.graphql) | ✗ 149/1500 |  |
