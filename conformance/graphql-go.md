# graphql-go 0.8.1

Generated from the conformance kit's reports. Back to the [sheet](README.md).

**Notes** (hand-written, from outside the kit):

- graphql-go doesn't make runs deterministic (it resolves fields in Go map order), so the adapter doesn't claim `idle` and the kit waits 10 ms after each settle instead; the sheet's cases are random runs only.
- The resolver returns a thunk, graphql-go's way to keep several resolvers pending. The Non-Null propagation and mutation ordering findings come from thunks; with `--sync` only the key order, leaf coercion and mutation error findings remain. See the [adapter's README](../adapters/graphql-go/README.md#known-graphql-go-deviations).

## Execution

- **Capabilities:** deferred-items, invalid-results, mutation, subscription, uncoercible-results
- **Cases:** 10500 submitted, 1849 distinct, 563 malformed
- **Adapter problems:** none
- **Checker self-test:** passed (25 negative controls)
- **Run:** kit f0039322bf59, 2026-11-15, strict, 1500 random runs per fixture (seed 1), exhaustive runs off

### Findings

<a id="finding-1"></a>

#### 1. `dataMatches`

403 cases, in `fragments` (153), `nullPropagation` (113), `lists` (104), `unions` (33).

- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))

The shortest case, from `fragments`:

```
trace:    call node; settle node = object(Bot); call node.id; call node.nodeId; settle node.id = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Bot.id.","locations":[{"line":3,"column":5}],"path":["node","id"]}]}
expected: data {"node": null}
```

<a id="finding-2"></a>

#### 2. `resultCoercion`: the implementation produced no response, after a resolver returned a value its type can't represent: …

309 cases, in `leaves` (309).

- A leaf value its type can't represent (a fraction for an Int, a non-finite Float, an unknown enum value) raises an execution error (MUST, [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion))

The shortest case, from `leaves`:

```
problem:  the implementation produced no response, after a resolver returned a value its type can't represent: "can't serialize the result: json: unsupported value: +Inf"
trace:    call ratio; call color; call count; settle count = null; settle color = error; settle ratio = uncoercible
response: none: can't serialize the result: json: unsupported value: +Inf
```

<a id="finding-3"></a>

#### 3. `keyOrder`

250 cases, in `leaves` (165), `unions` (74), `nullPropagation` (11).

- Response keys are in collected field order (SHOULD, [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering))

The shortest case, from `nullPropagation`:

```
trace:    call version; call user; settle user = null; settle version = leaf
response: {"data":{"user":null,"version":"v"}}
expected: data {"version": <leaf>, "user": null}
```

<a id="finding-4"></a>

#### 4. `resultCoercion`: count is 1, though its resolver returned a value its type can't represent, which must raise an execution error

246 cases, in `leaves` (246).

- A leaf value its type can't represent (a fraction for an Int, a non-finite Float, an unknown enum value) raises an execution error (MUST, [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion))

The shortest case, from `leaves`:

```
problem:  count is 1, though its resolver returned a value its type can't represent, which must raise an execution error
trace:    call ratio; call color; call count; settle color = null; settle count = uncoercible; settle ratio = error
response: {"data":{"color":null,"count":1,"ratio":null},"errors":[{"message":"resolver at ratio failed","locations":[{"line":3,"column":3}],"path":["ratio"]}]}
```

<a id="finding-5"></a>

#### 5. `calledSerially`

238 cases, in `mutation` (238).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle second = error
response: {"data":null,"errors":[{"message":"resolver at second failed","locations":[{"line":5,"column":3}],"path":["second"]}]}
expected: data null
```

<a id="finding-6"></a>

#### 6. `keyOrder`, `nullsExplained`

213 cases, in `leaves` (213).

- Response keys are in collected field order (SHOULD, [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering))
- Every null an error caused comes with an error from its cause (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `leaves`:

```
trace:    call count; call ratio; call color; settle ratio = object(); settle count = null; settle color = error
response: {"data":{"color":null,"count":null,"ratio":null},"errors":[{"message":"resolver at color failed","locations":[{"line":4,"column":3}],"path":["color"]}]}
expected: data {"count": null, "ratio": null, "color": null}
```

<a id="finding-7"></a>

#### 7. `calledSerially`, `serialErrorsKept`

87 cases, in `mutation` (87).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- A mutation reports every error its earlier root fields raised (MUST, [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle first = error; settle second = error
response: {"data":null,"errors":[{"message":"resolver at second failed","locations":[{"line":5,"column":3}],"path":["second"]}]}
expected: data null
```

<a id="finding-8"></a>

#### 8. `calledSerially`, `nullsExplained`, `serialErrorsKept`

80 cases, in `mutation` (80).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- Every null an error caused comes with an error from its cause (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))
- A mutation reports every error its earlier root fields raised (MUST, [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle third = object(Payload); call third.likes; settle second = null; settle third.likes = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Payload.likes.","locations":[{"line":9,"column":5}],"path":["third","likes"]}]}
expected: data null
```

<a id="finding-9"></a>

#### 9. `dataMatches`, `nullsExplained`

76 cases, in `lists` (57), `unions` (19).

- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))
- Every null an error caused comes with an error from its cause (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `lists`:

```
trace:    call posts; call tags; settle tags = list(1); settle posts = list(1); call posts.0; call tags.0; settle tags.0 = error; settle posts.0 = error
response: {"data":null,"errors":[{"message":"resolver at posts.0 failed","locations":[{"line":2,"column":3}],"path":["posts",0]}]}
expected: data {"posts": null, "tags": [null]}
```

<a id="finding-10"></a>

#### 10. `complete`

70 cases, in `lists` (57), `unions` (13).

- The response is sent only once execution is complete (MUST, [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `lists`:

```
trace:    call posts; call tags; settle posts = list(1); call posts.0; settle tags = list(1); call tags.0; settle posts.0 = error
response: {"data":null,"errors":[{"message":"resolver at posts.0 failed","locations":[{"line":2,"column":3}],"path":["posts",0]}]}
expected: data (incomplete)
```

<a id="finding-11"></a>

#### 11. `calledSerially`, `complete`

46 cases, in `mutation` (46).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- The response is sent only once execution is complete (MUST, [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle first = object(Payload); call first.likes; settle first.likes = error
response: {"data":null,"errors":[{"message":"resolver at first.likes failed","locations":[{"line":3,"column":5}],"path":["first","likes"]}]}
expected: data (incomplete)
```

<a id="finding-12"></a>

#### 12. `calledSerially`, `complete`, `nullsExplained`

16 cases, in `mutation` (16).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- The response is sent only once execution is complete (MUST, [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))
- Every null an error caused comes with an error from its cause (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle third = error; settle first = object(Payload); call first.likes; settle first.likes = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Payload.likes.","locations":[{"line":3,"column":5}],"path":["first","likes"]}]}
expected: data (incomplete)
```

<a id="finding-13"></a>

#### 13. `calledSerially`, `dataMatches`

12 cases, in `mutation` (12).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle second = object(Payload); settle first = null; call second.likes; settle third = object(Payload); settle second.likes = leaf; call third.likes; settle third.likes = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Payload.likes.","locations":[{"line":9,"column":5}],"path":["third","likes"]}]}
expected: data {"first": null, "second": {"likes": <leaf>}, "third": null}
```

<a id="finding-14"></a>

#### 14. `calledSerially`, `dataMatches`, `nullsExplained`, `serialErrorsKept`

11 cases, in `mutation` (11).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))
- Every null an error caused comes with an error from its cause (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))
- A mutation reports every error its earlier root fields raised (MUST, [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle second = object(Payload); settle first = error; call second.likes; settle third = object(Payload); settle second.likes = leaf; call third.likes; settle third.likes = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Payload.likes.","locations":[{"line":9,"column":5}],"path":["third","likes"]}]}
expected: data {"first": null, "second": {"likes": <leaf>}, "third": null}
```

<a id="finding-15"></a>

#### 15. `complete`, `nullsExplained`

9 cases, in `lists` (9).

- The response is sent only once execution is complete (MUST, [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))
- Every null an error caused comes with an error from its cause (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `lists`:

```
trace:    call posts; call tags; settle tags = list(2); settle posts = list(1); call posts.0; call tags.0; call tags.1; settle tags.0 = error; settle posts.0 = error
response: {"data":null,"errors":[{"message":"resolver at posts.0 failed","locations":[{"line":2,"column":3}],"path":["posts",0]}]}
expected: data (incomplete)
```

<a id="finding-16"></a>

#### 16. `resultCoercion`: … is 1, though its resolver returned a value its type can't represent, which must raise an execution error

8 cases, in `unions` (8).

- A leaf value its type can't represent (a fraction for an Int, a non-finite Float, an unknown enum value) raises an execution error (MUST, [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion))

The shortest case, from `unions`:

```
problem:  matrix.0.0 is 1, though its resolver returned a value its type can't represent, which must raise an execution error
trace:    call search; call matrix; settle search = list(0); settle matrix = list(1); call matrix.0; settle matrix.0 = list(1); call matrix.0.0; settle matrix.0.0 = uncoercible
response: {"data":{"matrix":[[1]],"search":[]}}
```

<a id="finding-17"></a>

#### 17. `calledSerially`, `nullsExplained`

8 cases, in `mutation` (8).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- Every null an error caused comes with an error from its cause (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle second = error; settle first = object(Payload); call first.likes; settle first.likes = error
response: {"data":null,"errors":[{"message":"resolver at first.likes failed","locations":[{"line":3,"column":5}],"path":["first","likes"]}]}
expected: data null
```

<a id="finding-18"></a>

#### 18. `calledSerially`, `complete`, `nullsExplained`, `serialErrorsKept`

6 cases, in `mutation` (6).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- The response is sent only once execution is complete (MUST, [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))
- Every null an error caused comes with an error from its cause (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))
- A mutation reports every error its earlier root fields raised (MUST, [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle first = error; settle third = object(Payload); call third.likes; settle third.likes = error
response: {"data":null,"errors":[{"message":"resolver at third.likes failed","locations":[{"line":9,"column":5}],"path":["third","likes"]}]}
expected: data (incomplete)
```

<a id="finding-19"></a>

#### 19. `calledSerially`, `dataMatches`, `nullsExplained`

2 cases, in `mutation` (2).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))
- Every null an error caused comes with an error from its cause (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle third = error; settle first = object(Payload); settle second = object(Payload); call second.likes; settle second.likes = leaf; call first.likes; settle first.likes = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Payload.likes.","locations":[{"line":3,"column":5}],"path":["first","likes"]}]}
expected: data {"first": null, "second": {"likes": <leaf>}, "third": null}
```

### Every check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | Result |
| --- | :---: | :---: | :---: |
| The response is sent only once execution is complete (`complete`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✗ 147/1849 |
| data is the completed value: field collection, value completion and null propagation (`dataMatches`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✗ 504/1849 |
| Response keys are in collected field order (`keyOrder`) | SHOULD | [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering) | ! 463/1849 |
| Every error was raised, at the path where it was raised (`errorsWereRaised`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 1849 |
| No two errors share a response path (`errorPathsUnique`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 1849 |
| Every error is inside a null in data (`errorsInsideNulls`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 1849 |
| Every null an error caused comes with an error from its cause (`nullsExplained`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✗ 421/1849 |
| A mutation reports every error its earlier root fields raised (`serialErrorsKept`) | MUST | [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✗ 184/506 |
| A mutation's root fields execute one after another (`calledSerially`) | MUST | [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) | ✗ 506/506 |
| Each field is executed once, merged selections included (`callsOnce`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) | ✓ 10500 |
| Only fields the operation selects are executed (`callsSelected`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) | ✓ 10500 |
| A field executes only once its parent has a value that contains it (`callsReachable`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 10500 |
| A request gets a response (`responds`) | MUST | [§7.1](https://spec.graphql.org/draft/#sec-Response-Format) | ✓ 10500 |
| A subscription event yields an execution result, even when its data is null (`eventYieldsResult`) | MUST | [§6.2.3.2](https://spec.graphql.org/draft/#sec-Response-Stream) | ✓ 1500 |
| data holds only positions the operation selects (`dataShape`) | MUST | [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ 3629 |
| A leaf value its type can't represent (a fraction for an Int, a non-finite Float, an unknown enum value) raises an execution error (`resultCoercion`) | MUST | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✗ 563/792 |
| Leaf values are the resolver's canonical value (Int 1, Float 1.5, Boolean true, an enum's first value, "v") (`leafValues`) | MUST | [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 3629 |
| An execution result has a data entry (`dataPresent`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 10191 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 10191 |
| The response has no entries besides data, errors and extensions (`additionalEntries`) | MUST | [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ 10191 |
| extensions is a map (`extensions`) | MUST | [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) | – |
| Errors are maps with a message, and well-formed locations and extensions (`errorFormat`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 8435 |
| Execution errors have a path to a position the operation selects (`errorPath`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 8435 |
| Paths use field names and integer list indices (`responsePosition`) | MUST (Oct 2021: SHOULD) | [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) | ✓ 744 |
| Errors have no entries besides message, locations, path and extensions (`errorEntries`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 8435 |
| The adapter follows the kit's protocol (call types, settles) (`protocol`) | ADAPTER | — | ✓ 10500 |

- **`serialErrorsKept`** is implied rather than stated: §6.4.4: an execution error "must be added to the errors list". §6.3.3 lets an implementation cancel fields that have not yet executed or yielded a value, but §6.3.4 completes each mutation root field before the next starts, so an earlier root field's errors can't have been cancelled.

### Fixtures

| Fixture | Result | Note |
| --- | :---: | :---: |
| [`fragments`](../fixtures/fragments.graphql) | ✗ 153/1500 |  |
| [`leaves`](../fixtures/leaves.graphql) | ✗ 933/1500 |  |
| [`lists`](../fixtures/lists.graphql) | ✗ 227/1500 |  |
| [`mutation`](../fixtures/mutation.graphql) | ✗ 506/1500 |  |
| [`noPropagation`](../fixtures/noPropagation.graphql) | – | needs error-propagation-off |
| [`nullPropagation`](../fixtures/nullPropagation.graphql) | ✗ 124/1500 |  |
| [`subscription`](../fixtures/subscription.graphql) | ✓ 1500 |  |
| [`unions`](../fixtures/unions.graphql) | ✗ 147/1500 |  |
