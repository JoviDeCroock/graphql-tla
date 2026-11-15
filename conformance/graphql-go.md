# graphql-go 0.8.1

Generated from the conformance kit's reports. Back to the [sheet](README.md).

**Notes** (hand-written, from outside the kit):

- graphql-go doesn't make runs deterministic (it resolves fields in Go map order), so the adapter doesn't claim `idle` and the kit waits 10 ms after each settle instead; the sheet's cases are random runs only.
- The resolver returns a thunk, graphql-go's way to keep several resolvers pending. The Non-Null propagation and mutation ordering findings come from thunks; with `--sync` only the key order, leaf coercion and mutation error findings remain. See the [adapter's README](../adapters/graphql-go/README.md#known-graphql-go-deviations).

## Execution

- **Capabilities:** deferred-items, invalid-results, mutation, subscription, uncoercible-results
- **Cases:** 10500 submitted, 1837 distinct, 551 malformed
- **Adapter problems:** none
- **Checker self-test:** passed (30 negative controls)
- **Run:** kit e67bcb49db84, 2026-11-15, strict, 1500 random runs per fixture (seed 1), exhaustive runs off

### Findings

<a id="execution-finding-1"></a>

#### 1. `dataMatches`

426 cases, in `fragments` (152), `nullPropagation` (125), `lists` (112), `unions` (37).

- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))

The shortest case, from `fragments`:

```
trace:    call node; settle node = object(Bot); call node.nodeId; call node.id; settle node.nodeId = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Bot.id.","locations":[{"line":12,"column":7}],"path":["node","nodeId"]}]}
expected: data {"node": null}
```

<a id="execution-finding-2"></a>

#### 2. `resultCoercion`: the implementation produced no response, after a resolver returned a value its type can't represent: …

318 cases, in `leaves` (318).

- A non-finite Float or an unknown enum value raises an execution error (MUST, [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion))

The shortest case, from `leaves`:

```
problem:  the implementation produced no response, after a resolver returned a value its type can't represent: "can't serialize the result: json: unsupported value: +Inf"
trace:    call count; call ratio; call color; settle ratio = uncoercible; settle count = uncoercible; settle color = error
response: none: can't serialize the result: json: unsupported value: +Inf
```

<a id="execution-finding-3"></a>

#### 3. `keyOrder`

241 cases, in `leaves` (157), `unions` (73), `nullPropagation` (11).

- Response keys are in collected field order (SHOULD, [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering))

The shortest case, from `nullPropagation`:

```
trace:    call version; call user; settle user = null; settle version = leaf
response: {"data":{"user":null,"version":"v"}}
expected: data {"version": <leaf>, "user": null}
```

<a id="execution-finding-4"></a>

#### 4. `calledSerially`

236 cases, in `mutation` (236).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle second = error
response: {"data":null,"errors":[{"message":"resolver at second failed","locations":[{"line":5,"column":3}],"path":["second"]}]}
expected: data null
```

<a id="execution-finding-5"></a>

#### 5. `intFraction`: count is 1, though its resolver returned a value its type can't represent, which must raise an execution error

226 cases, in `leaves` (226).

- A fraction returned for an Int (1.2) raises an execution error instead of being truncated (MUST, [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion))

The shortest case, from `leaves`:

```
problem:  count is 1, though its resolver returned a value its type can't represent, which must raise an execution error
trace:    call count; call ratio; call color; settle ratio = object(); settle count = uncoercible; settle color = error
response: {"data":{"color":null,"count":1,"ratio":null},"errors":[{"message":"resolver at color failed","locations":[{"line":4,"column":3}],"path":["color"]}]}
```

<a id="execution-finding-6"></a>

#### 6. `keyOrder`, `nullsExplained`

212 cases, in `leaves` (212).

- Response keys are in collected field order (SHOULD, [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `leaves`:

```
trace:    call count; call ratio; call color; settle ratio = null; settle color = uncoercible; settle count = error
response: {"data":{"color":null,"count":null,"ratio":null},"errors":[{"message":"resolver at count failed","locations":[{"line":2,"column":3}],"path":["count"]}]}
expected: data {"count": null, "ratio": null, "color": null}
```

<a id="execution-finding-7"></a>

#### 7. `calledSerially`, `serialErrorsKept`

85 cases, in `mutation` (85).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- A mutation reports every error its earlier root fields raised (MUST, [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle second = error; settle first = error
response: {"data":null,"errors":[{"message":"resolver at second failed","locations":[{"line":5,"column":3}],"path":["second"]}]}
expected: data null
```

<a id="execution-finding-8"></a>

#### 8. `calledSerially`, `nullsExplained`, `serialErrorsKept`

83 cases, in `mutation` (83).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))
- A mutation reports every error its earlier root fields raised (MUST, [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle second = null; settle third = object(Payload); call third.likes; settle third.likes = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Payload.likes.","locations":[{"line":9,"column":5}],"path":["third","likes"]}]}
expected: data null
```

<a id="execution-finding-9"></a>

#### 9. `complete`

77 cases, in `lists` (65), `unions` (12).

- The response is sent only once execution is complete (MUST, [§6.3.1](https://spec.graphql.org/draft/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/draft/#sec-Data))

The shortest case, from `lists`:

```
trace:    call posts; call tags; settle posts = list(1); call posts.0; settle tags = list(1); call tags.0; settle posts.0 = error
response: {"data":null,"errors":[{"message":"resolver at posts.0 failed","locations":[{"line":2,"column":3}],"path":["posts",0]}]}
expected: data (incomplete)
```

<a id="execution-finding-10"></a>

#### 10. `dataMatches`, `nullsExplained`

61 cases, in `lists` (42), `unions` (19).

- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `lists`:

```
trace:    call tags; call posts; settle tags = list(1); call tags.0; settle posts = list(1); call posts.0; settle tags.0 = error; settle posts.0 = error
response: {"data":null,"errors":[{"message":"resolver at posts.0 failed","locations":[{"line":2,"column":3}],"path":["posts",0]}]}
expected: data {"posts": null, "tags": [null]}
```

<a id="execution-finding-11"></a>

#### 11. `calledSerially`, `complete`

52 cases, in `mutation` (52).

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

15 cases, in `mutation` (15).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- The response is sent only once execution is complete (MUST, [§6.3.1](https://spec.graphql.org/draft/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/draft/#sec-Data))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle first = object(Payload); call first.likes; settle third = error; settle first.likes = error
response: {"data":null,"errors":[{"message":"resolver at first.likes failed","locations":[{"line":3,"column":5}],"path":["first","likes"]}]}
expected: data (incomplete)
```

<a id="execution-finding-13"></a>

#### 13. `calledSerially`, `dataMatches`

11 cases, in `mutation` (11).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle second = object(Payload); settle first = null; call second.likes; settle third = object(Payload); settle second.likes = leaf; call third.likes; settle third.likes = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Payload.likes.","locations":[{"line":9,"column":5}],"path":["third","likes"]}]}
expected: data {"first": null, "second": {"likes": <leaf>}, "third": null}
```

<a id="execution-finding-14"></a>

#### 14. `calledSerially`, `nullsExplained`

8 cases, in `mutation` (8).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle second = null; settle first = object(Payload); call first.likes; settle first.likes = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Payload.likes.","locations":[{"line":3,"column":5}],"path":["first","likes"]}]}
expected: data null
```

<a id="execution-finding-15"></a>

#### 15. `calledSerially`, `dataMatches`, `nullsExplained`, `serialErrorsKept`

8 cases, in `mutation` (8).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))
- A mutation reports every error its earlier root fields raised (MUST, [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle first = error; settle second = object(Payload); call second.likes; settle second.likes = leaf; settle third = object(Payload); call third.likes; settle third.likes = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Payload.likes.","locations":[{"line":9,"column":5}],"path":["third","likes"]}]}
expected: data {"first": null, "second": {"likes": <leaf>}, "third": null}
```

<a id="execution-finding-16"></a>

#### 16. `intFraction`: … is 1, though its resolver returned a value its type can't represent, which must raise an execution error

7 cases, in `unions` (7).

- A fraction returned for an Int (1.2) raises an execution error instead of being truncated (MUST, [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion))

The shortest case, from `unions`:

```
problem:  matrix.0.0 is 1, though its resolver returned a value its type can't represent, which must raise an execution error
trace:    call search; call matrix; settle search = list(0); settle matrix = list(1); call matrix.0; settle matrix.0 = list(1); call matrix.0.0; settle matrix.0.0 = uncoercible
response: {"data":{"matrix":[[1]],"search":[]}}
```

<a id="execution-finding-17"></a>

#### 17. `calledSerially`, `complete`, `nullsExplained`, `serialErrorsKept`

7 cases, in `mutation` (7).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- The response is sent only once execution is complete (MUST, [§6.3.1](https://spec.graphql.org/draft/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/draft/#sec-Data))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))
- A mutation reports every error its earlier root fields raised (MUST, [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle first = error; settle third = object(Payload); call third.likes; settle third.likes = error
response: {"data":null,"errors":[{"message":"resolver at third.likes failed","locations":[{"line":9,"column":5}],"path":["third","likes"]}]}
expected: data (incomplete)
```

<a id="execution-finding-18"></a>

#### 18. `complete`, `nullsExplained`

5 cases, in `lists` (5).

- The response is sent only once execution is complete (MUST, [§6.3.1](https://spec.graphql.org/draft/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/draft/#sec-Data))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `lists`:

```
trace:    call posts; call tags; settle tags = list(2); settle posts = list(1); call posts.0; call tags.0; call tags.1; settle tags.0 = error; settle posts.0 = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Query.posts.","locations":[{"line":2,"column":3}],"path":["posts",0]}]}
expected: data (incomplete)
```

<a id="execution-finding-19"></a>

#### 19. `calledSerially`, `dataMatches`, `nullsExplained`

1 case, in `mutation` (1).

- A mutation's root fields execute one after another (MUST, [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution))
- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle third = error; settle second = object(Payload); call second.likes; settle second.likes = leaf; settle first = object(Payload); call first.likes; settle first.likes = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Payload.likes.","locations":[{"line":3,"column":5}],"path":["first","likes"]}]}
expected: data {"first": null, "second": {"likes": <leaf>}, "third": null}
```

### Every check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it.
- **n/a:** the adapter doesn't take part in this area.

| Check | Level | Spec | Result |
| --- | :---: | :---: | :---: |
| The response is sent only once execution is complete (`complete`) | MUST | [§6.3.1](https://spec.graphql.org/draft/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✗ 156/1837 |
| data is the completed value: field collection, value completion and null propagation (`dataMatches`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✗ 507/1837 |
| Response keys are in collected field order (`keyOrder`) | SHOULD | [§7.2.2](https://spec.graphql.org/draft/#sec-Serialized-Map-Ordering) | ! 453/1837 |
| Every error was raised, at the path where it was raised (`errorsWereRaised`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 1837 |
| No two errors share a response path (`errorPathsUnique`) | MUST (Oct 2021: SHOULD) | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 1837 |
| Every error is inside a null in data (`errorsInsideNulls`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✓ 1837 |
| Every null an error caused comes with an error from one of its causes (`nullsExplained`) | MUST | [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✗ 400/1837 |
| A mutation reports every error its earlier root fields raised (`serialErrorsKept`) | MUST | [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/draft/#sec-Handling-Execution-Errors) | ✗ 183/506 |
| A mutation's root fields execute one after another (`calledSerially`) | MUST | [§6.2.2](https://spec.graphql.org/draft/#sec-Mutation) [§6.3.4](https://spec.graphql.org/draft/#sec-Normal-and-Serial-Execution) | ✗ 506/506 |
| Each field is executed once, merged selections included (`callsOnce`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) | ✓ 10500 |
| Only fields the operation selects are executed (`callsSelected`) | MUST | [§6.3.2](https://spec.graphql.org/draft/#sec-Field-Collection) | ✓ 10500 |
| A field executes only once its parent has a value that contains it (`callsReachable`) | MUST | [§6.3.3](https://spec.graphql.org/draft/#sec-Executing-Collected-Fields) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 10500 |
| A request gets a response (`responds`) | MUST | [§7.1](https://spec.graphql.org/draft/#sec-Response-Format) | ✓ 10500 |
| A subscription event yields an execution result, even when its data is null (`eventYieldsResult`) | MUST | [§6.2.3.2](https://spec.graphql.org/draft/#sec-Response-Stream) | ✓ 1500 |
| data holds only positions the operation selects (`dataShape`) | MUST | [§7.1.5](https://spec.graphql.org/draft/#sec-Data) | ✓ 3663 |
| A non-finite Float or an unknown enum value raises an execution error (`resultCoercion`) | MUST | [§3.5.2](https://spec.graphql.org/draft/#sec-Float) [§3.9](https://spec.graphql.org/draft/#sec-Enums) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✗ 318/622 |
| A fraction returned for an Int (1.2) raises an execution error instead of being truncated (`intFraction`) | MUST | [§3.5.1](https://spec.graphql.org/draft/#sec-Int) [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✗ 233/301 |
| Leaf values are the resolver's canonical value (Int 1, Float 1.5, Boolean true, an enum's first value, "v") (`leafValues`) | MUST | [§6.4.3](https://spec.graphql.org/draft/#sec-Value-Completion) | ✓ 3663 |
| Leaf values use the JSON type §7.2.1 gives their GraphQL type (a number for Int 1, not "1") (`leafEncoding`) | SHOULD | [§7.2.1](https://spec.graphql.org/draft/#sec-JSON-Serialization) | ✓ 3663 |
| An execution result has a data entry (`dataPresent`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 10182 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/draft/#sec-Execution-Result) | ✓ 10182 |
| The response has no entries besides data, errors and extensions (`additionalEntries`) | MUST | [§7.1.8](https://spec.graphql.org/draft/#sec-Additional-Entries) | ✓ 10182 |
| extensions is a map (`extensions`) | MUST | [§7.1.7](https://spec.graphql.org/draft/#sec-Extensions) | – |
| Errors are maps with a message, and extensions, if present, is a map (`errorFormat`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 8446 |
| An error's locations, if present, is a list of maps with line and column, both positive integers (`errorLocations`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 8446 |
| Execution errors have a path to a position the operation selects (`errorPath`) | MUST | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 8446 |
| Paths are lists of response names (aliases, not field names) and integer list indices (`responsePosition`) | MUST (Oct 2021: SHOULD) | [§7.1.4](https://spec.graphql.org/draft/#sec-Response-Position) | ✓ 8446 |
| Errors have no entries besides message, locations, path and extensions (`errorEntries`) | SHOULD | [§7.1.6](https://spec.graphql.org/draft/#sec-Errors) | ✓ 8446 |
| The adapter follows the kit's protocol (call types, settles) (`protocol`) | ADAPTER | — | ✓ 10500 |
| With error propagation off, an error nulls the position where it happened (graphql-js 17's @experimental_disableErrorPropagation) (`disabledPropagation`) | INFO | — | – |

- **Basis for `complete`:** No sentence says to respond only once execution is complete; the algorithms do. ExecuteRootSelectionSet (§6.3.1) returns {data} once ExecuteCollectedFields has run, and §6.3.3 says "Execution will recursively resolve and complete the value of every entry in the collected fields map". The draft's §7.1.5 adds: "The response data is the result of accumulating the resolved result of all response positions during execution." Positions §6.3.3 lets an implementation cancel don't hold the response back.
- **Basis for `dataMatches`:** When an error propagates to the root, §6.4.4 and §7.1.5 say data "should be null", in both editions. The kit still requires null, because no other value conforms: the execution result must have a data entry (§7.1.1), {} or a partial map leaves out an entry ExecuteCollectedFields must produce (§6.3.3), and a map with null at the failed root field breaks that field's Non-Null type.
- **Basis for `errorPathsUnique`:** The draft's §6.4.4: "each error added to the errors list during execution must have a unique response path." October 2021's: "only one error should be added to the errors list per field." Both editions say the errors list "must not be further affected" when a position is null because of an error already added.
- **Basis for `serialErrorsKept`:** §6.4.4: an execution error "must be added to the errors list". §6.3.3 lets an implementation cancel fields that have not yet executed or yielded a value, but §6.3.4 completes each mutation root field before the next starts, so an earlier root field's errors can't have been cancelled.
- **Basis for `intFraction`:** §3.5.1 states the rule: services "may coerce non-integer internal values to integers when reasonable without losing information, otherwise they must raise an execution error". Its example applies it to this case: "a floating-point number 1.2 should raise an execution error instead of being truncated to 1". Truncating 1.2 loses information, so the rule's must applies. October 2021 has the same sentences, with "field error".
- **Basis for `responsePosition`:** The draft's §7.1.4: "The value for a response path must be a list of path segments", with list indices "0-indexed integers", and an aliased field "must use the aliased name". October 2021's §7.1.6 says each of these with should: "This field should be a list of path segments", "If the error happens in an aliased field, the path to the error should use the aliased name".
- **Basis for `disabledPropagation`:** Not a GraphQL rule: neither edition has execution without error propagation. §6.4.4 says: "Since Non-Null response positions cannot be null, execution errors are propagated to be handled by the parent response position." Every failure in the noPropagation fixture counts here, never against a spec section, and never fails the run. Adapter protocol problems still count as protocol.

### Fixtures

| Fixture | Result | Note |
| --- | :---: | :---: |
| [`fragments`](../fixtures/fragments.graphql) | ✗ 152/1500 |  |
| [`leaves`](../fixtures/leaves.graphql) | ✗ 913/1500 |  |
| [`lists`](../fixtures/lists.graphql) | ✗ 224/1500 |  |
| [`mutation`](../fixtures/mutation.graphql) | ✗ 506/1500 |  |
| [`noPropagation`](../fixtures/noPropagation.graphql) | – | needs error-propagation-off |
| [`nullPropagation`](../fixtures/nullPropagation.graphql) | ✗ 136/1500 |  |
| [`subscription`](../fixtures/subscription.graphql) | ✓ 1500 |  |
| [`unions`](../fixtures/unions.graphql) | ✗ 148/1500 |  |
