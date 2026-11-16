# graphql-go/graphql 0.8.1

Generated from the conformance kit's reports. Back to the [sheet](README.md).

**Notes** (hand-written, from outside the kit):

- graphql-go doesn't make runs deterministic (it resolves fields in Go map order), so the adapter doesn't claim `idle` and the kit waits 10 ms after each settle instead; the sheet's cases are random runs only.
- The resolver returns a thunk, graphql-go's way to keep several resolvers pending. The Non-Null propagation and mutation ordering findings come from thunks; with `--sync` only the key order, leaf coercion, mutation error and subscription stream findings remain. Under `--strict`, key order (a SHOULD) fails most `leaves` and `ordering` cases by itself, since graphql-go writes keys sorted. See the [adapter's README](../adapters/graphql-go/README.md#known-graphql-go-deviations).
- Subscription streams: graphql-go's source stream is a `chan interface{}`, which can't carry an error, so a failing source ends the response stream normally (`failsWithSource`); a client cancels through the request's context, and an event still executing then yields a `context canceled` error without a path (`nothingAfterCancel`, `errorPath`). The adapter doesn't claim `custom-scalar-results` (a graphql-go `SerializeFn` has no error result).
- graphql-go has no SDL builder, so for introspect and coerce the adapter builds a `graphql.Schema` from graphql-go's own parse of the SDL, one to one, and refuses what graphql-go can't express (interfaces implementing interfaces, `repeatable`, schema descriptions, deprecated arguments and input fields, `@specifiedBy`, `@oneOf`, extensions other than `extend type`); the kit grades those as crashes. graphql-go's parser follows October 2016 (no `null` literal, no descriptions on executable definitions, no empty selection sets); its introspection is October 2021's, so the kit grades September 2025's query without newer fields; a request error is written with `"data": null` (`requestErrorNoData`); and 19 coerce vectors with `1e400` get no response because Go's `encoding/json` refuses the number before graphql-go sees it. The adapter doesn't claim `validate`: the kit's validation schemas use interfaces implementing interfaces and `repeatable`, both in October 2021, which graphql-go 0.8.1 can't express, so 3215 of 3354 vectors would grade its schema model rather than its rules (rule gaps seen on the rest are in the README). Nor `schema` or `coordinate` (no SDL builder, no schema coordinate API).

## Execution

- **Capabilities:** coerce, custom-directives, deferred-items, introspect, invalid-results, mutation, nested-fields, parent-values, parse, parse-sdl, request-extensions, scalar-results, subscription, subscription-source, subscription-stream, uncoercible-results
- **Cases:** 27080 submitted, 5376 distinct, 917 malformed
- **Adapter problems:** none
- **Checker self-test:** passed (87 negative controls)
- **Run:** kit 0625b35d64dd, 2026-11-16, strict, 1500 random runs per fixture (seed 1), exhaustive runs off

### Findings

<a id="execution-finding-1"></a>

#### 1. `keyOrder`

1786 cases, in `ordering` (1111), `leaves` (276), `aliases` (257), `unions` (78), `abstract` (27), `scalars` (20), `nullPropagation` (11), `subscriptionAlias` (6).

- Response keys are in collected field order (SHOULD, [§7.2.2](https://spec.graphql.org/September2026/#sec-Serialized-Map-Ordering))

The shortest case, from `aliases`:

```
trace:    call second; call first; settle second = null; settle first = error
response: {"data":{"first":null,"second":null},"errors":[{"message":"resolver at first failed","locations":[{"line":7,"column":3}],"path":["first"]}]}
expected: data {"second": null, "first": null}
```

<a id="execution-finding-2"></a>

#### 2. `dataMatches`

550 cases, in `fragments` (145), `nullPropagation` (110), `lists` (103), `merging` (78), `abstract` (47), `unions` (29), `aliases` (24), `subscriptionAlias` (14).

- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/September2026/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors))

The shortest case, from `fragments`:

```
trace:    call node; settle node = object(Bot); call node.nodeId; call node.id; settle node.nodeId = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Bot.id.","locations":[{"line":12,"column":7}],"path":["node","nodeId"]}]}
expected: data {"node": null}
```

<a id="execution-finding-3"></a>

#### 3. `calledSerially`

319 cases, in `mutation` (319).

- A mutation's root fields execute one after another (SHOULD, [§6.2.2](https://spec.graphql.org/September2026/#sec-Mutation) [§6.3.4](https://spec.graphql.org/September2026/#sec-Normal-and-Serial-Execution))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle second = error
response: {"data":null,"errors":[{"message":"resolver at second failed","locations":[{"line":5,"column":3}],"path":["second"]}]}
expected: data null
```

<a id="execution-finding-4"></a>

#### 4. `resultCoercion`: the implementation produced no response, after a resolver returned a value its type can't represent: …

311 cases, in `leaves` (311).

- A non-finite Float, an unknown enum value or a value a custom scalar rejects raises an execution error instead of being passed through (MUST, [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) [§3.5.2](https://spec.graphql.org/September2026/#sec-Float) [§3.9](https://spec.graphql.org/September2026/#sec-Enums) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion))

The shortest case, from `leaves`:

```
problem:  the implementation produced no response, after a resolver returned a value its type can't represent: "can't serialize the result: json: unsupported value: +Inf"
trace:    call count; call ratio; call color; settle ratio = uncoercible; settle count = leaf; settle color = error
response: none: can't serialize the result: json: unsupported value: +Inf
```

<a id="execution-finding-5"></a>

#### 5. `coercionErrorReported`: color is null without an error, though its resolver returned a value its type can't represent, which must raise an execution error

293 cases, in `leaves` (293).

- A position whose resolver returned a value its type can't represent isn't null without an error (MUST, [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) [§3.5.1](https://spec.graphql.org/September2026/#sec-Int) [§3.5.2](https://spec.graphql.org/September2026/#sec-Float) [§3.9](https://spec.graphql.org/September2026/#sec-Enums) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors))

The shortest case, from `leaves`:

```
problem:  color is null without an error, though its resolver returned a value its type can't represent, which must raise an execution error
trace:    call count; call ratio; call color; settle ratio = null; settle color = uncoercible; settle count = error
response: {"data":{"color":null,"count":null,"ratio":null},"errors":[{"message":"resolver at count failed","locations":[{"line":2,"column":3}],"path":["count"]}]}
```

<a id="execution-finding-6"></a>

#### 6. `calledSerially`, `keyOrder`

250 cases, in `mutationRoot` (250).

- A mutation's root fields execute one after another (SHOULD, [§6.2.2](https://spec.graphql.org/September2026/#sec-Mutation) [§6.3.4](https://spec.graphql.org/September2026/#sec-Normal-and-Serial-Execution))
- Response keys are in collected field order (SHOULD, [§7.2.2](https://spec.graphql.org/September2026/#sec-Serialized-Map-Ordering))

The shortest case, from `mutationRoot`:

```
trace:    call a; call b; call likeAll; settle a = null; settle b = null; settle likeAll = list(0)
response: {"data":{"__typename":"Mutation","a":null,"b":null,"likeAll":[],"root":"Mutation"}}
expected: data {"a": null, "b": null, "__typename": "Mutation", "root": "Mutation", "likeAll": []}
```

<a id="execution-finding-7"></a>

#### 7. `dataMatches`, `nullsExplained`

199 cases, in `lists` (51), `abstract` (46), `merging` (46), `aliases` (36), `unions` (20).

- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/September2026/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result))

The shortest case, from `merging`:

```
trace:    call a; call b; settle a = object(A); call a.subfield1; call a.subfield2; settle b = error; settle a.subfield2 = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field A.subfield2.","locations":[{"line":10,"column":5}],"path":["a","subfield2"]}]}
expected: data {"a": null, "b": null}
```

<a id="execution-finding-8"></a>

#### 8. `intFraction`: count is 1, though its resolver returned a value its type can't represent, which must raise an execution error

176 cases, in `leaves` (176).

- A fraction returned for an Int (1.2) raises an execution error instead of being truncated (MUST, [§3.5.1](https://spec.graphql.org/September2026/#sec-Int) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion))

The shortest case, from `leaves`:

```
problem:  count is 1, though its resolver returned a value its type can't represent, which must raise an execution error
trace:    call count; call ratio; call color; settle count = uncoercible; settle ratio = error; settle color = null
response: {"data":{"color":null,"count":1,"ratio":null},"errors":[{"message":"resolver at ratio failed","locations":[{"line":3,"column":3}],"path":["ratio"]}]}
```

<a id="execution-finding-9"></a>

#### 9. `calledSerially`, `dataMatches`, `nullsExplained`

174 cases, in `mutationRoot` (165), `mutation` (9).

- A mutation's root fields execute one after another (SHOULD, [§6.2.2](https://spec.graphql.org/September2026/#sec-Mutation) [§6.3.4](https://spec.graphql.org/September2026/#sec-Normal-and-Serial-Execution))
- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/September2026/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result))

The shortest case, from `mutationRoot`:

```
trace:    call a; call b; call likeAll; settle a = error; settle likeAll = list(1); settle b = null; call likeAll.0; settle likeAll.0 = error
response: {"data":null,"errors":[{"message":"resolver at likeAll.0 failed","locations":[{"line":21,"column":3}],"path":["likeAll",0]}]}
expected: data {"a": null, "b": null, "__typename": "Mutation", "root": "Mutation", "likeAll": null}
```

<a id="execution-finding-10"></a>

#### 10. `keyOrder`, `nullsExplained`

169 cases, in `leaves` (169).

- Response keys are in collected field order (SHOULD, [§7.2.2](https://spec.graphql.org/September2026/#sec-Serialized-Map-Ordering))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result))

The shortest case, from `leaves`:

```
trace:    call count; call ratio; call color; settle ratio = object(); settle count = error; settle color = leaf
response: {"data":{"color":"RED","count":null,"ratio":null},"errors":[{"message":"resolver at count failed","locations":[{"line":2,"column":3}],"path":["count"]}]}
expected: data {"count": null, "ratio": null, "color": <leaf>}
```

<a id="execution-finding-11"></a>

#### 11. `coercionErrorReported`: count is null without an error, though its resolver returned 2147483648, which must be coerced to a valid value or raise an execution error

155 cases, in `leaves` (155).

- A position whose resolver returned a value its type can't represent isn't null without an error (MUST, [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) [§3.5.1](https://spec.graphql.org/September2026/#sec-Int) [§3.5.2](https://spec.graphql.org/September2026/#sec-Float) [§3.9](https://spec.graphql.org/September2026/#sec-Enums) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors))

The shortest case, from `leaves`:

```
problem:  count is null without an error, though its resolver returned 2147483648, which must be coerced to a valid value or raise an execution error
trace:    call count; call ratio; call color; settle ratio = object(); settle count = leaf; settle color = error
response: {"data":{"color":null,"count":null,"ratio":null},"errors":[{"message":"resolver at color failed","locations":[{"line":4,"column":3}],"path":["color"]}]}
```

<a id="execution-finding-12"></a>

#### 12. `calledSerially`, `complete`, `dataMatches`

120 cases, in `mutationRoot` (119), `mutation` (1).

- A mutation's root fields execute one after another (SHOULD, [§6.2.2](https://spec.graphql.org/September2026/#sec-Mutation) [§6.3.4](https://spec.graphql.org/September2026/#sec-Normal-and-Serial-Execution))
- The response is sent only once execution is complete (MUST, [§6.3.1](https://spec.graphql.org/September2026/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/September2026/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/September2026/#sec-Data))
- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/September2026/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors))

The shortest case, from `mutationRoot`:

```
trace:    call a; call b; call likeAll; settle a = object(Payload); call a.likes; settle a.likes = error
response: {"data":null,"errors":[{"message":"resolver at a.likes failed","locations":[{"line":3,"column":5},{"line":19,"column":5}],"path":["a","likes"]}]}
expected: data (incomplete)
```

<a id="execution-finding-13"></a>

#### 13. `calledSerially`, `dataMatches`

102 cases, in `mutationRoot` (92), `mutation` (10).

- A mutation's root fields execute one after another (SHOULD, [§6.2.2](https://spec.graphql.org/September2026/#sec-Mutation) [§6.3.4](https://spec.graphql.org/September2026/#sec-Normal-and-Serial-Execution))
- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/September2026/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors))

The shortest case, from `mutationRoot`:

```
trace:    call a; call b; call likeAll; settle a = null; settle b = null; settle likeAll = list(1); call likeAll.0; settle likeAll.0 = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Mutation.likeAll.","locations":[{"line":21,"column":3}],"path":["likeAll",0]}]}
expected: data {"a": null, "b": null, "__typename": "Mutation", "root": "Mutation", "likeAll": null}
```

<a id="execution-finding-14"></a>

#### 14. `complete`, `dataMatches`

95 cases, in `lists` (58), `abstract` (26), `unions` (10), `subscriptionAlias` (1).

- The response is sent only once execution is complete (MUST, [§6.3.1](https://spec.graphql.org/September2026/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/September2026/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/September2026/#sec-Data))
- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/September2026/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors))

The shortest case, from `subscriptionAlias`:

```
trace:    call liked
response: {"data":null,"errors":[{"message":"context canceled","locations":[]}]}
expected: data (incomplete)
```

<a id="execution-finding-15"></a>

#### 15. `calledSerially`, `nullsExplained`

82 cases, in `mutation` (82).

- A mutation's root fields execute one after another (SHOULD, [§6.2.2](https://spec.graphql.org/September2026/#sec-Mutation) [§6.3.4](https://spec.graphql.org/September2026/#sec-Normal-and-Serial-Execution))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle second = null; settle first = object(Payload); call first.likes; settle first.likes = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Payload.likes.","locations":[{"line":3,"column":5}],"path":["first","likes"]}]}
expected: data null
```

<a id="execution-finding-16"></a>

#### 16. `calledSerially`, `complete`, `dataMatches`, `nullsExplained`

72 cases, in `mutationRoot` (72).

- A mutation's root fields execute one after another (SHOULD, [§6.2.2](https://spec.graphql.org/September2026/#sec-Mutation) [§6.3.4](https://spec.graphql.org/September2026/#sec-Normal-and-Serial-Execution))
- The response is sent only once execution is complete (MUST, [§6.3.1](https://spec.graphql.org/September2026/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/September2026/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/September2026/#sec-Data))
- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/September2026/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result))

The shortest case, from `mutationRoot`:

```
trace:    call a; call b; call likeAll; settle b = error; settle a = object(Payload); call a.likes; settle a.likes = error
response: {"data":null,"errors":[{"message":"resolver at a.likes failed","locations":[{"line":3,"column":5},{"line":19,"column":5}],"path":["a","likes"]}]}
expected: data (incomplete)
```

<a id="execution-finding-17"></a>

#### 17. `calledSerially`, `complete`

47 cases, in `mutation` (47).

- A mutation's root fields execute one after another (SHOULD, [§6.2.2](https://spec.graphql.org/September2026/#sec-Mutation) [§6.3.4](https://spec.graphql.org/September2026/#sec-Normal-and-Serial-Execution))
- The response is sent only once execution is complete (MUST, [§6.3.1](https://spec.graphql.org/September2026/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/September2026/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/September2026/#sec-Data))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle first = object(Payload); call first.likes; settle first.likes = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Payload.likes.","locations":[{"line":3,"column":5}],"path":["first","likes"]}]}
expected: data (incomplete)
```

<a id="execution-finding-18"></a>

#### 18. `calledSerially`, `complete`, `nullsExplained`

22 cases, in `mutation` (22).

- A mutation's root fields execute one after another (SHOULD, [§6.2.2](https://spec.graphql.org/September2026/#sec-Mutation) [§6.3.4](https://spec.graphql.org/September2026/#sec-Normal-and-Serial-Execution))
- The response is sent only once execution is complete (MUST, [§6.3.1](https://spec.graphql.org/September2026/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/September2026/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/September2026/#sec-Data))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result))

The shortest case, from `mutation`:

```
trace:    call first; call second; call third; settle third = error; settle first = object(Payload); call first.likes; settle first.likes = error
response: {"data":null,"errors":[{"message":"resolver at first.likes failed","locations":[{"line":3,"column":5}],"path":["first","likes"]}]}
expected: data (incomplete)
```

<a id="execution-finding-19"></a>

#### 19. `complete`, `dataMatches`, `nullsExplained`

11 cases, in `lists` (11).

- The response is sent only once execution is complete (MUST, [§6.3.1](https://spec.graphql.org/September2026/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/September2026/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/September2026/#sec-Data))
- data is the completed value: field collection, value completion and null propagation (MUST, [§6.3.2](https://spec.graphql.org/September2026/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors))
- Every null an error caused comes with an error from one of its causes (MUST, [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result))

The shortest case, from `lists`:

```
trace:    call posts; call tags; settle tags = list(2); settle posts = list(1); call posts.0; call tags.0; call tags.1; settle tags.0 = error; settle posts.0 = null
response: {"data":null,"errors":[{"message":"Cannot return null for non-nullable field Query.posts.","locations":[{"line":2,"column":3}],"path":["posts",0]}]}
expected: data (incomplete)
```

<a id="execution-finding-20"></a>

#### 20. `failsWithSource`: the source failed, and the response stream completed normally with no result carrying an error before it

8 cases, in `subscription` (4), `subscriptionAlias` (4).

- When the source stream fails, the response stream completes with an error (MUST, [§6.2.3](https://spec.graphql.org/September2026/#sec-Subscription) [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream))

The shortest case, from `subscription`:

```
problem:  the source failed, and the response stream completed normally with no result carrying an error before it
stream:   the source fails before any event: kit fails the source; the response stream completes
```

<a id="execution-finding-21"></a>

#### 21. `intFraction`: … is 1, though its resolver returned a value its type can't represent, which must raise an execution error

5 cases, in `unions` (5).

- A fraction returned for an Int (1.2) raises an execution error instead of being truncated (MUST, [§3.5.1](https://spec.graphql.org/September2026/#sec-Int) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion))

The shortest case, from `unions`:

```
problem:  matrix.0.0 is 1, though its resolver returned a value its type can't represent, which must raise an execution error
trace:    call search; call matrix; settle search = error; settle matrix = list(1); call matrix.0; settle matrix.0 = list(1); call matrix.0.0; settle matrix.0.0 = uncoercible
response: {"data":{"matrix":[[1]],"search":null},"errors":[{"message":"resolver at search failed","locations":[{"line":2,"column":3}],"path":["search"]}]}
```

<a id="execution-finding-22"></a>

#### 22. `errorPath`: an execution error without a path

4 cases, in `subscription` (2), `subscriptionAlias` (2).

- Execution errors have a path to a position the operation selects (MUST, [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors))

The shortest case, from `subscription`:

```
problem:  an execution error without a path: {"message":"context canceled","locations":[]}
trace:    call postLiked
response: {"data":null,"errors":[{"message":"context canceled","locations":[]}]}
```

<a id="execution-finding-23"></a>

#### 23. `nothingAfterCancel`: a result arrived after the client cancelled the response stream

4 cases, in `subscription` (2), `subscriptionAlias` (2).

- No result arrives after the client cancels the response stream (MUST, [§6.2.3](https://spec.graphql.org/September2026/#sec-Subscription) [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream))

The shortest case, from `subscription`:

```
problem:  a result arrived after the client cancelled the response stream
stream:   cancelled while an event executes: kit emits event 1; result for event 1; kit emits event 2; kit cancels the response stream; result for event 2; the response stream completes; the source is cancelled
```

<a id="execution-finding-24"></a>

#### 24. `complete`

1 case, in `subscription` (1).

- The response is sent only once execution is complete (MUST, [§6.3.1](https://spec.graphql.org/September2026/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/September2026/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/September2026/#sec-Data))

The shortest case, from `subscription`:

```
trace:    call postLiked
response: {"data":null,"errors":[{"message":"context canceled","locations":[]}]}
expected: data (incomplete)
```

### Every check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **(k since September 2025, j new in September 2026), (all …):** k of the n failing cases rely on grammar or rules introduced in September 2025, and j on ones introduced in September 2026; none of them is in the October 2021 edition. The symbol still gives the check's level.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it. **– needs `x`:** the adapter doesn't claim capability `x`, which the check needs.
- **n/a:** the adapter doesn't take part in this area, or its report predates the check.

| Check | Level | Spec | Result |
| --- | :---: | :---: | :---: |
| The response is sent only once execution is complete (`complete`) | MUST | [§6.3.1](https://spec.graphql.org/September2026/#sec-Executing-the-Root-Selection-Set) [§6.3.3](https://spec.graphql.org/September2026/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/September2026/#sec-Data) | ✗ 368/5561 |
| data is the completed value: field collection, value completion and null propagation (`dataMatches`) | MUST | [§6.3.2](https://spec.graphql.org/September2026/#sec-Field-Collection) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) | ✗ 1323/5561 |
| Response keys are in collected field order (`keyOrder`) | SHOULD | [§7.2.2](https://spec.graphql.org/September2026/#sec-Serialized-Map-Ordering) | ! 2205/5561 |
| Every error was raised, at the path where it was raised (`errorsWereRaised`) | MUST | [§7.1.4](https://spec.graphql.org/September2026/#sec-Response-Position) [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 5559 |
| No two errors share a response path (`errorPathsUnique`) | MUST (SHOULD in September 2025 and October 2021) | [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) | ✓ 5559 |
| Every error is inside a null in data (`errorsInsideNulls`) | MUST | [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 5559 |
| Every null an error caused comes with an error from one of its causes (`nullsExplained`) | MUST (SHOULD in October 2021) | [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) | ✗ 729/5559 |
| A mutation that ran its root fields serially reports every error its earlier root fields raised (`serialErrorsKept`) | MUST (SHOULD in October 2021) | [§6.3.4](https://spec.graphql.org/September2026/#sec-Normal-and-Serial-Execution) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) | – |
| A mutation's root fields execute one after another (`calledSerially`) | SHOULD | [§6.2.2](https://spec.graphql.org/September2026/#sec-Mutation) [§6.3.4](https://spec.graphql.org/September2026/#sec-Normal-and-Serial-Execution) | ! 1188/1188 |
| Each mutation root field the operation selects executes once, and no other mutation root field executes (`mutationFieldsOnce`) | MUST | [§6.2.2](https://spec.graphql.org/September2026/#sec-Mutation) [§6.3.2](https://spec.graphql.org/September2026/#sec-Field-Collection) [§6.3.4](https://spec.graphql.org/September2026/#sec-Normal-and-Serial-Execution) | ✓ 3000 |
| Each field is executed once, merged selections included (mutation root fields: mutationFieldsOnce) (`callsOnce`) | INFO | — | ✓ 27044 |
| Only fields the operation selects are executed (mutation root fields: mutationFieldsOnce) (`callsSelected`) | INFO | — | ✓ 27044 |
| A field executes only once its parent has a value that contains it (`callsReachable`) | INFO | — | ✓ 27044 |
| A request gets a response (`responds`) | MUST | [§7](https://spec.graphql.org/September2026/#sec-Response) | ✓ 27044 |
| A subscription event yields an execution result, even when its data is null (`eventYieldsResult`) | MUST | [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) [§7.1.2](https://spec.graphql.org/September2026/#sec-Response-Format.Response-Stream) | ✓ 3044 |
| Each source event yields one execution result on the response stream, before it completes (`eventPerSourceEvent`) | MUST | [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) [§7.1.2](https://spec.graphql.org/September2026/#sec-Response-Format.Response-Stream) | ✓ 36 |
| The response stream completes only when its source completes or fails, or it is cancelled (`streamEndsOnlyForCause`) | SHOULD | [§6.2.3](https://spec.graphql.org/September2026/#sec-Subscription) [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) | ✓ 36 |
| When the source stream completes, the response stream completes normally (`completesWithSource`) | MUST (SHOULD in October 2021) | [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) | ✓ 16 |
| When the source stream fails, the response stream completes with an error (`failsWithSource`) | MUST (since September 2025) | [§6.2.3](https://spec.graphql.org/September2026/#sec-Subscription) [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) | ✗ 8/8 |
| A cancelled response stream completes normally (`cancelCompletes`) | MUST (since September 2025) | [§6.2.3](https://spec.graphql.org/September2026/#sec-Subscription) [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) [§6.2.3.3](https://spec.graphql.org/September2026/#sec-Unsubscribe) | ✓ 12 |
| Cancelling the response stream cancels the source stream (`cancelCancelsSource`) | MUST (since September 2025) | [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) [§6.2.3.3](https://spec.graphql.org/September2026/#sec-Unsubscribe) | ✓ 12 |
| No result arrives after the client cancels the response stream (`nothingAfterCancel`) | MUST | [§6.2.3](https://spec.graphql.org/September2026/#sec-Subscription) [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) | ✗ 4/12 |
| data holds only positions the operation selects (`dataShape`) | MUST | [§6.3.3](https://spec.graphql.org/September2026/#sec-Executing-Collected-Fields) [§7.1.5](https://spec.graphql.org/September2026/#sec-Data) | ✓ 18457 |
| A non-finite Float, an unknown enum value or a value a custom scalar rejects raises an execution error instead of being passed through (`resultCoercion`) | MUST | [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) [§3.5.2](https://spec.graphql.org/September2026/#sec-Float) [§3.9](https://spec.graphql.org/September2026/#sec-Enums) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) | ✗ 311/604 |
| A fraction returned for an Int (1.2) raises an execution error instead of being truncated (`intFraction`) | MUST | [§3.5.1](https://spec.graphql.org/September2026/#sec-Int) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) | ✗ 181/234 |
| A position whose resolver returned a value its type can't represent isn't null without an error (`coercionErrorReported`) | MUST (SHOULD in October 2021) | [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) [§3.5.1](https://spec.graphql.org/September2026/#sec-Int) [§3.5.2](https://spec.graphql.org/September2026/#sec-Float) [§3.9](https://spec.graphql.org/September2026/#sec-Enums) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) | ✗ 448/982 |
| An Int outside 32 bits returned by a resolver (2147483648) raises an execution error instead of being passed through (`intRange`) | SHOULD | [§3.5.1](https://spec.graphql.org/September2026/#sec-Int) | ✓ 218 |
| An ID whose resolver returned an integer (4) is serialized as a String ("4") (`idAsString`) | MUST (SHOULD in October 2021) | [§3.5.5](https://spec.graphql.org/September2026/#sec-ID) | ✓ 383 |
| Leaf values are the resolver's canonical value (Int 1, Float 1.5, Boolean true, an enum's first value, "v") (`leafValues`) | MUST | [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) | ✓ 18457 |
| Leaf values use the JSON type §7.2.1 gives their GraphQL type (a number for Int 1, not "1") (`leafEncoding`) | SHOULD | [§7.2.1](https://spec.graphql.org/September2026/#sec-JSON-Serialization) | ✓ 18457 |
| The execution result is a map (`resultMap`) | MUST | [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) | ✓ 26733 |
| An execution result has a data entry (`dataPresent`) | MUST | [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) | ✓ 26733 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) | ✓ 26733 |
| The response has no entries besides data, errors and extensions (`additionalEntries`) | MUST | [§7.1.8](https://spec.graphql.org/September2026/#sec-Additional-Entries) | ✓ 26733 |
| extensions is a map (`extensions`). no response had an extensions entry, so there was nothing to grade (§7.1.7: the entry is a may) | MUST | [§7.1.7](https://spec.graphql.org/September2026/#sec-Extensions) | – |
| Errors are maps with a message, and extensions, if present, is a map (`errorFormat`) | MUST | [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 17736 |
| An error's locations, if present, is a list of maps with line and column, both positive integers (`errorLocations`) | SHOULD | [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 17736 |
| An execution error raised at a field has locations (`errorLocationsPresent`) | SHOULD | [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 17736 |
| An execution error's locations point at the field it was raised at (`errorLocationsAccurate`) | SHOULD | [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 17732 |
| Execution errors have a path to a position the operation selects (`errorPath`) | MUST | [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✗ 4/17736 |
| Paths are lists of response names (aliases, not field names) and integer list indices, none left out (`responsePosition`) | MUST (SHOULD in October 2021) | [§7.1.4](https://spec.graphql.org/September2026/#sec-Response-Position) | ✓ 17736 |
| An error that propagated to a nullable parent keeps the full path to where it was raised (`errorPathFull`) | SHOULD | [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 17736 |
| Errors have no entries besides message, locations, path and extensions (`errorEntries`) | SHOULD | [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 17736 |
| No map in the serialized response repeats a key (`uniqueKeys`) | MUST | [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) [§7.2.1](https://spec.graphql.org/September2026/#sec-JSON-Serialization) [Appendix B](https://spec.graphql.org/September2026/#sec-Appendix-Notation-Conventions) | ✓ 26733 |
| Each field's resolver is given its parent's value: the initial value at the root, a subscription event's value at its root (`parentValue`) | MUST | [§6.2.1](https://spec.graphql.org/September2026/#sec-Query) [§6.2.3.2](https://spec.graphql.org/September2026/#sec-Subscription.Response-Stream) [§6.3.3](https://spec.graphql.org/September2026/#sec-Executing-Collected-Fields) [§6.4.2](https://spec.graphql.org/September2026/#sec-Value-Resolution) [§6.4.3](https://spec.graphql.org/September2026/#sec-Value-Completion) | ✓ 27044 |
| The adapter follows the kit's protocol (call types, settles) (`protocol`) | ADAPTER | — | ✓ 27044 |
| With error propagation off, an error nulls the position where it happened (graphql-js 17's @experimental_disableErrorPropagation) (`disabledPropagation`) | INFO | — | – |

- **Basis for `complete`:** No sentence says to respond only once execution is complete; the algorithms do. ExecuteRootSelectionSet (§6.3.1) returns {data} once ExecuteCollectedFields has run, and §6.3.3 says "Execution will recursively resolve and complete the value of every entry in the collected fields map". §7.1.5 adds: "The response data is the result of accumulating the resolved result of all response positions during execution." Positions §6.3.3 lets an implementation cancel don't hold the response back. September 2025 has the same algorithms and sentences, and October 2021's algorithms are the same.
- **Basis for `dataMatches`:** When an error propagates to the root, §6.4.4 and §7.1.5 say data "should be null", in every release (October 2021: §6.4.4 and §7.1.1). The kit still requires null, because no other value conforms: the execution result must have a data entry (§7.1.1), {} or a partial map leaves out an entry ExecuteCollectedFields must produce (§6.3.3), and a map with null at the failed root field breaks that field's Non-Null type.
- **Basis for `keyOrder`:** §7.2.2: "Serialization formats which only represent unordered maps but where order is still implicit in the serialization's textual order (such as JSON) should preserve the order of requested fields textually." September 2025 and October 2021 say the same.
- **Basis for `errorsWereRaised`:** §7.1.6: an error that "can be associated to a particular field in the GraphQL result ... must contain an entry with the key {"path"} with a response path which describes the response position which raised the error"; §7.1.4: "When a response path is present on an error result, it identifies the response position which raised the error." September 2025 has both sentences. October 2021's §7.1.2: it "must contain an entry with the key path that details the path of the response field which experienced the error". A path that leaves out list indices counts against responsePosition instead, and one cut short at the nullable position the error propagated to against errorPathFull: both are paths to the raised error in the wrong form, not errors that weren't raised.
- **Basis for `errorPathsUnique`:** September 2026's §6.4.4: "That is, each error added to the errors list during execution must have a unique response path." September 2025's: "That is, only one error should be added to the errors list per response position." October 2021's: "That is, only one error should be added to the errors list per field." The must is new in September 2026 (graphql-spec#1183). All three say the errors list "must not be further affected" when a position is null because of an error already added. A response with two errors at one path doesn't say whether the second was added for a position the first had already nulled (which breaks that must) or raised on its own, so in September 2025 and October 2021 the kit takes the weaker reading, the should.
- **Basis for `errorsInsideNulls`:** §7.1.6: "When an execution error is raised at a given response position, then that response position must not be present within the response {"data"} entry (except {null})", and §6.4.4 propagates it to the nearest nullable parent. September 2025 has the same sentences. October 2021, §6.4.4: a field error "is handled as though the field returned {null}", and §6.3 (Errors and Non-Null Fields): the error "must propagate to this entire selection set, either resolving to {null} if allowed or further propagated to a parent field." An error whose position holds a value breaks these in every release.
- **Basis for `nullsExplained`:** September 2026's §6.4.4: "While these errors must be reported in the response", and twice "the error must be added to the {"errors"} list in the execution result"; §7.1.1: the errors entry "must be a non-empty list of execution error raised during operation execution"; §7.1.6: "the {"errors"} entry must include the error". September 2025 has the same musts (its §7.1.1: "must be a non-empty list of execution error raised during execution"). October 2021 has both words. Its §6.4.4 says twice that "the error must be added to the {"errors"} list in the response", but opens with "While these errors should be reported in the response", and its §7.1.2 says "If field errors were raised during execution, it should contain those errors" and "The errors entry should include all raised field errors." September 2025 made each of these a must. With the October 2021 level in doubt, the kit takes the weaker one there. (October 2021's §7.1 still says the response "must contain an entry with key errors" if any errors were raised, so a response with no errors entry at all breaks a must in every release; the check doesn't count that case apart.)
- **Basis for `serialErrorsKept`:** §6.4.4: an execution error "must be added to the errors list". §6.3.3 lets an implementation cancel fields that have not yet executed or yielded a value, but serial execution (§6.3.4) completes each mutation root field before the next starts, so an earlier root field's errors can't have been cancelled. That argument needs serial execution, which is only a SHOULD (calledSerially), so this check is graded only on cases whose trace passes calledSerially. September 2025 has the same sentences. October 2021: the level is in doubt as for nullsExplained ("must be added", but "should be reported", "should include all raised field errors"), so it is a SHOULD there.
- **Basis for `calledSerially`:** The one sentence that says whether a mutation's root selection set is executed serially is §6.2.2's, in every release: "This selection set should be executed serially." §6.3.4 adds, with no key word: "When executing a mutation, the selections in the top most selection set will be executed in serial order, starting with the first appearing field textually." Its musts ("When executing a collected fields map serially, the executor must consider each entry ... It must determine the corresponding entry in the result map for each item to completion before it continues on to the next entry") say what serial execution is, once a selection set is executed serially. The sentence that the root selection set "must be executed serially" is introduced by "For example", which Appendix A makes non-normative. ExecuteMutation passes "serial" unconditionally, but the prose about the same step says should, so the level is in doubt and the kit takes the weaker one. September 2025 and October 2021 (§6.2.2, §6.3.1) say the same.
- **Basis for `mutationFieldsOnce`:** §6.3.2 collects the root fields before execution: "This ensures that multiple references to fields with the same response name will only be executed once", and CollectFields leaves out fields @skip and @include exclude. Appendix A lets an implementation fulfil an algorithm "in any way as long as the perceived result is equivalent", and §6.3.4 says "the resolution of fields other than top-level mutation fields must always be side effect-free and idempotent", so for every other field an extra call isn't perceived (callsOnce, callsSelected and callsReachable are INFO). Top-level mutation fields are the exception: §6.2.2 expects them to "perform side-effects on the underlying data system", so running one twice, or one the operation doesn't select, is perceived. September 2025 and October 2021 (§6.2.2, §6.3.1, §6.3.2: "executed at the same time") say the same.
- **Basis for `callsOnce`:** §6.3.2: collecting fields "ensures that multiple references to fields with the same response name will only be executed once". That describes what the algorithm does, and Appendix A lets an implementation fulfil it "in any way as long as the perceived result is equivalent". §6.3.4: "the resolution of fields other than top-level mutation fields must always be side effect-free and idempotent", so calling such a field's resolver twice isn't perceived in the response, which the reference still grades whenever both calls settled to the same outcome. Recorded, never a failure. A mutation root field called twice is mutationFieldsOnce, a MUST.
- **Basis for `callsSelected`:** CollectFields (§6.3.2) leaves out fields that @skip, @include or a fragment's type condition exclude, so the algorithm never executes them. As for callsOnce, Appendix A's "perceived result is equivalent" and §6.3.4's side-effect-free fields mean an extra call below the mutation root isn't perceived; the reference still grades the response. A mutation root field the operation doesn't select is mutationFieldsOnce, a MUST.
- **Basis for `callsReachable`:** CompleteValue (§6.4.3) executes subfields only for an object value, and list items only for the items of a list. The example in §6.3.4 that says "of course `birthday` must be resolved before `month`" is non-normative (Appendix A). A call under a parent that settled null, or past a list's length, isn't perceived in the response for side-effect-free fields (§6.3.4, Appendix A), and the reference still grades the response.
- **Basis for `responds`:** §7: "When a GraphQL service receives a request, it must return a well-formed response." September 2025 and October 2021 say the same.
- **Basis for `eventYieldsResult`:** §7.1.2: "A response stream must be a stream of execution result", and §7.1.1: "for each event in a subscription's source stream, the response stream will emit an execution result." MapSourceToResponseEvent (§6.2.3.2) completes the response stream with an error only if "internal {error} was raised", and its Note says the only such errors "are internal exceptional errors not described by this specification": execution errors are handled by ExecuteSubscriptionEvent. September 2025 has the same sentences and Note. October 2021's MapSourceToResponseEvent yields an event containing the result for each source event, and §7 requires "a well-formed response".
- **Basis for `eventPerSourceEvent`:** MapSourceToResponseEvent (§6.2.3.2): "When {sourceStream} emits {sourceValue}: Let {executionResult} be the result of running {ExecuteSubscriptionEvent(...)} ... Otherwise emit {executionResult} on {responseStream}", and the response stream completes only after that, when the source completes, fails or the stream is cancelled. §7.1.2: "A response stream must be a stream of execution result", and §6.2.3: "each event in the event stream is the result of executing the operation's root selection set for each new event on an underlying source stream". Algorithm steps have the algorithm's level (Appendix A). The only other way out is an internal error, which the Note after the algorithm says is "not described by this specification": the kit's resolvers raise execution errors, which ExecuteSubscriptionEvent handles. So an event emitted while the stream is open that yields no result before the stream completes, a result for no event, or a result after the stream completed, fails here. An event still executing when the kit cancels the stream isn't counted (nothingAfterCancel), nor is a result that arrives after the source failed, before the stream completed: it answers the failure, and failsWithSource grades it. September 2025 says the same; October 2021's MapSourceToResponseEvent says "For each {event} on {sourceStream}: ... Yield an event containing {response}".
- **Basis for `streamEndsOnlyForCause`:** MapSourceToResponseEvent (§6.2.3.2) completes {responseStream} when the source completes normally or with an error, when it is cancelled, and on an internal error, which its Note says is "not described by this specification". But §6.2.3 says of event streams in general, which a response stream is: "An event stream may complete at any point, often because no further events will occur", and "Internal user code also may cancel an event stream for any reason, which would be observed as that event stream completing." With the level in doubt the kit takes the weaker one. A stream that completes instead of yielding an event's result fails eventPerSourceEvent, a MUST, instead. September 2025 says the same; October 2021: "Event streams may produce an infinite sequence of events or may complete at any point."
- **Basis for `completesWithSource`:** MapSourceToResponseEvent (§6.2.3.2): "When {sourceStream} completes normally: Complete {responseStream} normally." Algorithm steps have the algorithm's level (Appendix A). A response stream that completes with an error, or doesn't complete once every event has its result, fails. September 2025 says the same. October 2021's step reads "When {responseStream} completes: complete this event stream", which names the response stream where the source is meant; with its level in doubt the kit takes the weaker one there.
- **Basis for `failsWithSource`:** §6.2.3 (Event Streams): "If an event stream encounters an error, it must complete with that error." MapSourceToResponseEvent (§6.2.3.2): "When {sourceStream} completes with {error}: Complete {responseStream} with {error}." A response stream that completes normally, or doesn't complete, fails. The kit doesn't compare error messages: an implementation may wrap the source's error. A stream whose last item after the source failed is a result with errors, followed by normal completion, passes: that is how an implementation whose streams can't end with an error (a stream of results, as in Rust) ends one with an error. The text doesn't say how "complete with that error" appears to a client: §6.2.3 says "GraphQL specifies algorithms for ... the closing of that stream", but leaves "serialization format or transport mechanism" to the service (Delivery Agnostic). §7.1.2's "A response stream must be a stream of execution result" argues against an error-only item, but with the text in doubt the kit takes the weaker reading. A result without errors there, then normal completion, fails. New in September 2025; October 2021 says only "Event streams may complete in response to an error".
- **Basis for `cancelCompletes`:** §6.2.3 (Event Streams): "When an event stream is cancelled, it must complete." MapSourceToResponseEvent (§6.2.3.2): "When {responseStream} is cancelled: Cancel {sourceStream}. Complete {responseStream} normally." Unsubscribe (§6.2.3.3): "Cancel {responseStream}." A response stream that completes with an error after the client cancelled it, or doesn't complete, fails. New in September 2025; October 2021 says only that after cancelling, an observer "must receive no more events from that event stream" (nothingAfterCancel).
- **Basis for `cancelCancelsSource`:** MapSourceToResponseEvent (§6.2.3.2): "When {responseStream} is cancelled: Cancel {sourceStream}." §6.2.3.3: "Unsubscribe cancels the response stream when a client no longer wishes to receive payloads for a subscription. This in turn also cancels the Source Stream". Algorithm steps have the algorithm's level (Appendix A). The adapter reports the source being cancelled (`source-cancelled`); a cancelled stream whose source never is fails. September 2025 says the same. October 2021: "This may in turn also cancel the Source Stream", a may.
- **Basis for `nothingAfterCancel`:** §6.2.3 (Event Streams): "An observer may at any point decide to stop observing an event stream by cancelling it. When an event stream is cancelled, it must complete." MapSourceToResponseEvent (§6.2.3.2): "When {responseStream} is cancelled: Cancel {sourceStream}. Complete {responseStream} normally." A completed stream emits nothing more, so a result for an event whose ExecuteSubscriptionEvent was still running when the client cancelled must not be emitted: the algorithm's step "emit {executionResult} on {responseStream}" comes after the stream completed. October 2021's §6.2.3 said so outright: "An observer may at any point decide to stop observing an event stream by cancelling it, after which it must receive no more events from that event stream." September 2025 dropped that sentence in graphql/graphql-spec#1099, "Editorial changes for Event Streams", which its description calls a rewrite of the Event Streams definition "to be more clear", so the kit reads the requirement as unchanged: a MUST in every release. The kit's scenario cancels the stream while an event's resolvers are pending, then settles them; a result for that event after the cancel fails here (graphql-js 16 and 17 deliver it, then complete).
- **Basis for `dataShape`:** ExecuteCollectedFields (§6.3.3) sets an entry in the result map only for each entry of the collected fields map, and §7.1.5 says "The response data is the result of accumulating the resolved result of all response positions during execution." A value at a position the operation doesn't select isn't the completed value, as for dataMatches. September 2025 has the same algorithm and sentence, and October 2021's algorithms are the same.
- **Basis for `resultCoercion`:** §3.5.2: "Non-finite floating-point internal values ({NaN} and {Infinity}) cannot be coerced to {Float} and must raise an execution error." §3.5, for every scalar, custom ones included: a service "must uphold the contract the scalar type describes, either by coercing the value or producing an execution error if a value cannot be coerced" (custom scalars with custom-scalar-results, whose resolver returns a value the scalar's result coercion rejects). §3.9: "GraphQL services must return one of the defined set of possible values. If a reasonable coercion is not possible they must raise an execution error." CoerceResult (§6.4.3): the internal method "must return a valid value for the type and not {null}. Otherwise raise an execution error." September 2025 says the same, and October 2021 too, with "field error". A value passed through fails here, as does no response at all after such a value, whose root cause it is. A null without an error is coercionErrorReported.
- **Basis for `intFraction`:** §3.5.1: "GraphQL services may coerce non-integer internal values to integers when reasonable without losing information, otherwise they must raise an execution error." Truncating 1.2 to 1 loses information, so the must applies. The sentence after it, "For example, a floating-point number 1.2 should raise an execution error instead of being truncated to 1", is an example, which Appendix A makes non-normative, so its should doesn't set the level. September 2025 has the same sentences, and October 2021 too, with "field error". A value passed through fails here, as does no response at all after such a value. A null without an error is coercionErrorReported.
- **Basis for `coercionErrorReported`:** Such a value "must raise an execution error" (§3.5.1, §3.5.2, §3.9), CoerceResult's internal method "must return a valid value for the type and not {null}" (§6.4.3), and §6.4.4 says the error "must be added to the {"errors"} list" and opens "While these errors must be reported in the response". A null without an error at its path breaks one of these, in September 2026 and September 2025 alike, whichever the service did: coerced the value to null, or raised the error and left it out. October 2021 keeps the musts on raising, but says raised field errors "should be reported" and "should include all raised field errors" (see nullsExplained). The response can't tell the two apart, so the kit takes the weaker reading there: a SHOULD.
- **Basis for `intRange`:** §3.5.1: "If the integer internal value represents a value less than -2^31 or greater than or equal to 2^31, an execution error should be raised." September 2025 says the same, and October 2021 too, with "a field error". Graded only for adapters with scalar-results, in fixtures with invalid results. A null without an error is coercionErrorReported.
- **Basis for `idAsString`:** §3.5.5: "The ID type is serialized in the same way as a String; however, it is not intended to be human-readable. While it is often numeric, it must always serialize as a String." Its Result Coercion lets a service raise an execution error when "coercion is not possible", which also passes. September 2025 says the same. October 2021: "it should always serialize as a String". Graded only for adapters with scalar-results, in fixtures with invalid results.
- **Basis for `leafValues`:** CompleteValue returns {CoerceResult(fieldType, result)} for a leaf (§6.4.3), and the kit's resolvers return a value that is already valid for the type. §3.5 lets a service coerce internal values only "when reasonable without losing information", so a valid value coerces to itself. September 2025 and October 2021 say the same.
- **Basis for `leafEncoding`:** §7.2.1: "When using JSON as a serialization of GraphQL responses, the following JSON values should be used to encode the related GraphQL values". §7.2 lets "a string or simpler primitive ... be used as a substitute" when a format lacks one. September 2025 and October 2021 say the same.
- **Basis for `resultMap`:** §7.1.1: "An execution result must be a map." September 2025 says the same. October 2021's §7.1: "A response to a GraphQL request must be a map."
- **Basis for `dataPresent`:** §7.1.1: "The execution result must contain an entry with key {"data"}." September 2025 says the same. October 2021's §7.1: "If the request included execution, the response map must contain an entry with key data", and §7.1.2: "The data entry in the response must be present."
- **Basis for `errorsList`:** September 2026's §7.1.1: "If any errors are raised during operation execution, the execution result must contain an entry with key {"errors"}. The value of this entry must be a non-empty list ... If the request completed without raising any errors, this entry must not be present." September 2025's opens "If execution raised any errors" and has the same musts. October 2021's §7.1: "If the request raised any errors, the response map must contain an entry with key errors. ... If the request completed without raising any errors, this entry must not be present." Its §7.1.2 also says "should not be present", but the §7.1 must is the sentence about the entry, so the check is a MUST in every release, as in coerce.
- **Basis for `additionalEntries`:** §7.1.8: "the execution result and request error result maps must not contain any entries other than those described above." September 2025 says the same. October 2021's §7.1: "the top level response map must not contain any entries other than the three described above."
- **Basis for `extensions`:** §7.1.7: "The {"extensions"} entry in an execution result or request error result, if set, must have a map as its value." September 2025 says the same. October 2021's §7.1: "This entry, if set, must have a map as its value."
- **Basis for `errorFormat`:** §7.1.1: "Each error must be a map"; §7.1.6: "Every error must contain an entry with the key {"message"} with a string description of the error", and an error's extensions entry, "if set, must have a map as its value." September 2025 says the same. October 2021's §7.1.2 says each error "is a map", and has the same musts on message and extensions.
- **Basis for `errorLocations`:** §7.1.6: "it should contain an entry with the key {"locations"} with a list of locations, where each location is a map with the keys {"line"} and {"column"}, both positive numbers starting from `1`". The whole sentence, shape included, is a should. September 2025 and October 2021 (§7.1.2) say the same.
- **Basis for `errorLocationsPresent`:** §7.1.6: "If an error can be associated to a particular point in the requested GraphQL document, it should contain an entry with the key {"locations"} with a list of locations". Every error the kit's resolvers cause is raised at a field, or a list item of a field, of the document the kit sent. An error without locations, or with an empty list, fails. September 2025 and October 2021 (§7.1.2) say the same.
- **Basis for `errorLocationsAccurate`:** §7.1.6: each location is a map with the keys line and column, "both positive numbers starting from `1` which describe the beginning of an associated syntax element". For an error raised at a field, or at an item of a list field, the associated element is that field's selection in the document the kit sent: the kit accepts the start of any of its field nodes (several when selections merge), or the start of the field's name after an alias. A location elsewhere fails. Locations are only compared for errors whose path is where the kit's outcome raised the error. The whole sentence is a should. September 2025 and October 2021 (§7.1.2) say the same.
- **Basis for `errorPath`:** §7.1.6: an error that "can be associated to a particular field in the GraphQL result ... must contain an entry with the key {"path"} with a response path which describes the response position which raised the error". Every error the kit's resolvers cause is raised at a field or list item. A path to a position the operation doesn't select describes no response position. September 2025 has the same sentence, and October 2021's §7.1.2 the same must ("must contain an entry with the key path that details the path of the response field which experienced the error").
- **Basis for `responsePosition`:** §7.1.4: "The value for a response path must be a list of path segments", "path segments that represent list indices must be 0-indexed integers", and an aliased field "must use the aliased name". A path that is a raised error's path with its list indices left out (`["tags"]` for an error at `tags.0`) breaks the first two. September 2025's §7.1.4 has the same musts; they came with its new Response Position section (graphql-spec#1073). October 2021 has no such section: its §7.1.2 says each of these with should: "This field should be a list of path segments starting at the root of the response and ending with the field associated with the error", list indices "should be 0-indexed integers", "the path to the error should use the aliased name".
- **Basis for `errorPathFull`:** §7.1.6, in every release (October 2021: §7.1.2): "If the field which experienced an error was declared as `Non-Null`, the `null` result will bubble up to the next nullable field. In that case, the `path` for the error should include the full path to the result field where the error was raised, even if that field is not present in the response." The general sentence before it says the path "must" describe the position which raised the error, but the sentence about this very case says should, so the level is in doubt and the kit takes the weaker one. A path that stops at a position the error propagated to, above where it was raised, fails here.
- **Basis for `errorEntries`:** §7.1.6: "GraphQL services should not provide any additional entries to the error format", and its Note: "While non-specified entries are not violations, they are still discouraged." September 2025 and October 2021 (§7.1.2) say the same.
- **Basis for `uniqueKeys`:** §7.1.1: "An execution result must be a map", and Appendix B defines a map: "Each entry has a unique key". Data is built of maps too (ExecuteCollectedFields, §6.3.3, sets one entry per response name), as is each error. §7.2.1 serializes a map as a JSON object; a JSON object that repeats a name, which JSON.parse silently reduces to the last one, describes no map with unique keys. The kit reads the adapter's raw line for this. September 2025 says the same; October 2021's §7.1 says "A response to a GraphQL request must be a map", and its Appendix A defines no map, so the rule rests there on JSON objects meaning maps.
- **Basis for `parentValue`:** ResolveFieldValue (§6.4.2): "Return the result of calling {resolver}, providing {objectValue} and {argumentValues}". ExecuteCollectedFields (§6.3.3) passes its {objectValue} to ExecuteField for every field; CompleteValue (§6.4.3) runs an object's subfields with {result}, the resolved value, as theirs; ExecuteRootSelectionSet passes the {initialValue} (§6.2.1: "An initial value may be provided when executing a query operation"), and §6.2.3.2: "Each event from the underlying source stream triggers execution of the subscription selection set using that event's value as the {initialValue}". Algorithm steps have the algorithm's level (Appendix A). Graded only for adapters with parent-values: the kit names each object its outcomes stand for, and each call reports the one its resolver got. September 2025 and October 2021 have the same algorithms.
- **Basis for `protocol`:** Not a spec rule: the kit's protocol with the adapter (docs/conformance.md). A case where the adapter broke it says nothing reliable about the implementation.
- **Basis for `disabledPropagation`:** Not a GraphQL rule: no release (October 2021, September 2025, September 2026) has execution without error propagation. §6.4.4 says: "Since Non-Null response positions cannot be null, execution errors are propagated to be handled by the parent response position." Every failure of the noPropagation fixture's response (its data and errors) counts here, never against a spec section, and never fails the run. Turning propagation off doesn't change which resolvers run, so protocol problems and the checks on calls (callsOnce, callsSelected, callsReachable, mutationFieldsOnce, calledSerially) keep their own checks.

### Fixtures

| Fixture | Result | Note |
| --- | :---: | :---: |
| [`abstract`](../fixtures/abstract.graphql) | ✗ 146/1500 |  |
| [`aliases`](../fixtures/aliases.graphql) | ✗ 317/1500 |  |
| [`directives_kept`](../fixtures/directives_kept.graphql) | ✓ 1500 |  |
| [`directives_skipped`](../fixtures/directives_skipped.graphql) | ✓ 1500 |  |
| [`directives_excluded`](../fixtures/directives_excluded.graphql) | ✓ 1500 |  |
| [`directives_dropped`](../fixtures/directives_dropped.graphql) | ✓ 1500 |  |
| [`fragments`](../fixtures/fragments.graphql) | ✗ 145/1500 |  |
| [`leaves`](../fixtures/leaves.graphql) | ✗ 1163/1500 |  |
| [`lists`](../fixtures/lists.graphql) | ✗ 223/1500 |  |
| [`merging`](../fixtures/merging.graphql) | ✗ 124/1500 |  |
| [`mutation`](../fixtures/mutation.graphql) | ✗ 490/1500 |  |
| [`mutationRoot`](../fixtures/mutationRoot.graphql) | ✗ 698/1500 |  |
| [`noPropagation`](../fixtures/noPropagation.graphql) | – | needs error-propagation-off |
| [`nullPropagation`](../fixtures/nullPropagation.graphql) | ✗ 121/1500 |  |
| [`ordering`](../fixtures/ordering.graphql) | ! 1111/1500 |  |
| [`scalars`](../fixtures/scalars.graphql) | ! 20/1500 |  |
| [`subscription`](../fixtures/subscription.graphql) | ✗ 8/1540 |  |
| [`subscriptionAlias`](../fixtures/subscriptionAlias.graphql) | ✗ 28/1540 |  |
| [`unions`](../fixtures/unions.graphql) | ✗ 137/1500 |  |

## Parse

- **Capabilities:** coerce, custom-directives, deferred-items, introspect, invalid-results, mutation, nested-fields, parent-values, parse, parse-sdl, request-extensions, scalar-results, subscription, subscription-source, subscription-stream, uncoercible-results
- **Cases:** 2832 submitted, 2804 distinct, 0 malformed
- **Vectors:** 2832 of 2847 graded (not graded: 15 unsupported by the adapter)
- **Vectors relying on rules after October 2021:** since September 2025, 122 of 127 vectors failing; new in September 2026, 30 of 31 vectors failing
- **Adapter problems:** none
- **Checker self-test:** passed (10 negative controls)
- **Run:** kit 0625b35d64dd, 2026-11-16, strict

### Findings

<a id="parse-finding-1"></a>

#### 1. `ignoredTokens`: rejects what §2.1.6 Ignored Tokens accepts

133 cases, in `random-documents` (128), `ignored` (4), `byte-order-marks` (1).

- Ignored tokens may appear before and after every token (MUST, [§2.1.6](https://spec.graphql.org/September2026/#sec-Language.Source-Text.Ignored-Tokens))

The shortest case, from `ignored`:

```
input:    "{a﻿b}"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-2"></a>

#### 2. `descriptions`: rejects what §2.2 Descriptions accepts

85 cases, in `random-documents` (80), `parser-examples` (3), `variable-definitions` (1), `grammar-examples` (1). All rely on grammar or rules introduced in September 2025, not in October 2021.

- Descriptions on operations, fragments and variables, not on the query shorthand (MUST, [§2.2](https://spec.graphql.org/September2026/#sec-Descriptions))

The shortest case, from `parser-examples`:

```
input:    [since September 2025] "\"d\" query {a}"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-3"></a>

#### 3. `sourceText`: rejects what §2.1 Source Text accepts

22 cases, in `raw-characters` (18), `ignored` (4). All rely on grammar or rules introduced in September 2025, not in October 2021.

- Source text is a sequence of SourceCharacter (MUST, [§2.1](https://spec.graphql.org/September2026/#sec-Language.Source-Text))

The shortest case, from `raw-characters`:

```
input:    [since September 2025] "{a #\u0000\n}"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-4"></a>

#### 4. `directiveExtension`: rejects what §3.13.6 Directive Extensions accepts

16 cases, in `type-system-documents` (10), `grammar-examples` (4), `extensions` (2). 14 of them rely on grammar or rules introduced in September 2026, not in October 2021.

- Directive extensions add directives (MUST, [§3.13.6](https://spec.graphql.org/September2026/#sec-Directive-Extensions))

The shortest case, from `extensions`:

```
input:    [since September 2026] "extend directive @d @d"
sibling:  "extend directive @d T", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-5"></a>

#### 5. `enumValue`: accepts what §2.10.6 Enum Value rejects

13 cases, in `enum-values` (9), `grammar-examples` (4).

- Enum values (MUST, [§2.10.6](https://spec.graphql.org/September2026/#sec-Enum-Value))

The shortest case, from `grammar-examples`:

```
input:    "enum E { null }"
sibling:  "enum E { A }", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-6"></a>

#### 6. `selectionSets`: rejects what §2.5 Selection Sets accepts

11 cases, in `random-documents` (4), `parser-examples` (3), `type-system-documents` (2), `field-suffixes` (1), `grammar-examples` (1). All rely on grammar or rules introduced in September 2026, not in October 2021.

- Selection sets, including empty ones (MUST, [§2.5](https://spec.graphql.org/September2026/#sec-Selection-Sets))

The shortest case, from `parser-examples`:

```
input:    [since September 2026] "{}"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-7"></a>

#### 7. `directiveDefinition`: rejects what §3.13 Directives accepts

11 cases, in `directive-definitions` (5), `grammar-examples` (4), `type-system-documents` (2). 5 of them rely on grammar or rules introduced in September 2026, not in October 2021.

- Directive definitions and their locations (MUST, [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))

The shortest case, from `directive-definitions`:

```
input:    "directive @d on | FIELD"
sibling:  "directive @d on | | FIELD", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-8"></a>

#### 8. `unionExtension`: rejects what §3.8.1 Union Extensions accepts

11 cases, in `type-system-documents` (5), `grammar-examples` (3), `extensions` (3).

- Union extensions add directives or member types (MUST, [§3.8.1](https://spec.graphql.org/September2026/#sec-Union-Extensions))

The shortest case, from `extensions`:

```
input:    "extend union T @d"
sibling:  "extend union T", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-9"></a>

#### 9. `schemaExtension`: rejects what §3.3.2 Schema Extension accepts

10 cases, in `type-system-documents` (7), `grammar-examples` (3).

- Schema extensions add directives or root operation types (MUST, [§3.3.2](https://spec.graphql.org/September2026/#sec-Schema-Extension))

The shortest case, from `grammar-examples`:

```
input:    "extend schema @d"
sibling:  "extend schema", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-10"></a>

#### 10. `interfaceExtension`: rejects what §3.7.1 Interface Extensions accepts

10 cases, in `type-system-documents` (7), `grammar-examples` (3).

- Interface extensions add interfaces, directives or fields (MUST, [§3.7.1](https://spec.graphql.org/September2026/#sec-Interface-Extensions))

The shortest case, from `grammar-examples`:

```
input:    "extend interface I @d"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-11"></a>

#### 11. `stringValue`: accepts what §2.10.4 String Value rejects

9 cases, in `lexer-examples` (6), `strings` (3). All rely on grammar or rules introduced in September 2025, not in October 2021.

- String values and block strings (MUST, [§2.10.4](https://spec.graphql.org/September2026/#sec-String-Value))

The shortest case, from `lexer-examples`:

```
input:    [since September 2025] "{a(x: \"\\uD83D\")}"
sibling:  "{a(x: \"\")}", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-12"></a>

#### 12. `inputValues`: rejects what §2.10 Input Values accepts

9 cases, in `type-system-documents` (6), `random-documents` (3).

- Input values, and no variables in constant values (MUST, [§2.10](https://spec.graphql.org/September2026/#sec-Input-Values))

The shortest case, from `random-documents`:

```
input:    "{ b,(\ntrue #c\n: #c\nnull )\t}"
sibling:  "{ b,(\ntrue #c\n: #c\n... )\t}", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-13"></a>

#### 13. `objectExtension`: rejects what §3.6.3 Object Extensions accepts

9 cases, in `type-system-documents` (5), `grammar-examples` (2), `extensions` (2).

- Object extensions add interfaces, directives or fields (MUST, [§3.6.3](https://spec.graphql.org/September2026/#sec-Object-Extensions))

The shortest case, from `grammar-examples`:

```
input:    "extend type T @d"
sibling:  "extend type T", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-14"></a>

#### 14. `intValue`: accepts what §2.10.1 Int Value rejects

8 cases, in `numbers` (5), `lexer-examples` (3).

- Int values (MUST, [§2.10.1](https://spec.graphql.org/September2026/#sec-Int-Value))

The shortest case, from `lexer-examples`:

```
input:    "{a(x: [1_])}"
sibling:  "{a(x: [_])}", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-15"></a>

#### 15. `interfaceDefinition`: rejects what §3.7 Interfaces accepts

8 cases, in `type-system-documents` (6), `grammar-examples` (2).

- Interface definitions (MUST, [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces))

The shortest case, from `type-system-documents`:

```
input:    "interface\ta"
sibling:  "interface", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-16"></a>

#### 16. `unionDefinition`: rejects what §3.8 Unions accepts

8 cases, in `type-system-documents` (5), `grammar-examples` (2), `union-members` (1).

- Union definitions and their member types (MUST, [§3.8](https://spec.graphql.org/September2026/#sec-Unions))

The shortest case, from `grammar-examples`:

```
input:    "union U"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-17"></a>

#### 17. `inputObjectDefinition`: rejects what §3.10 Input Objects accepts

8 cases, in `type-system-documents` (7), `grammar-examples` (1).

- Input object definitions and their fields (MUST, [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects))

The shortest case, from `type-system-documents`:

```
input:    "input\tT"
sibling:  "T\tinput", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-18"></a>

#### 18. `inputObjectExtension`: rejects what §3.10.2 Input Object Extensions accepts

8 cases, in `type-system-documents` (6), `grammar-examples` (2).

- Input object extensions add directives or fields (MUST, [§3.10.2](https://spec.graphql.org/September2026/#sec-Input-Object-Extensions))

The shortest case, from `grammar-examples`:

```
input:    "extend input I @d"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-19"></a>

#### 19. `directives`: rejects what §2.13 Directives accepts

7 cases, in `type-system-documents` (4), `union-members` (2), `variable-types` (1).

- Directives (MUST, [§2.13](https://spec.graphql.org/September2026/#sec-Language.Directives))

The shortest case, from `union-members`:

```
input:    "union U "
sibling:  "union U @", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-20"></a>

#### 20. `objectDefinition`: rejects what §3.6 Objects accepts

7 cases, in `type-system-documents` (6), `grammar-examples` (1).

- Object definitions, implemented interfaces and field definitions (MUST, [§3.6](https://spec.graphql.org/September2026/#sec-Objects))

The shortest case, from `grammar-examples`:

```
input:    "type T"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-21"></a>

#### 21. `scalarExtension`: rejects what §3.5.6 Scalar Extensions accepts

7 cases, in `type-system-documents` (5), `grammar-examples` (2).

- Scalar extensions add directives (MUST, [§3.5.6](https://spec.graphql.org/September2026/#sec-Scalar-Extensions))

The shortest case, from `grammar-examples`:

```
input:    "extend scalar S @d"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-22"></a>

#### 22. `enumExtension`: rejects what §3.9.1 Enum Extensions accepts

7 cases, in `type-system-documents` (5), `grammar-examples` (2).

- Enum extensions add directives or values (MUST, [§3.9.1](https://spec.graphql.org/September2026/#sec-Enum-Extensions))

The shortest case, from `grammar-examples`:

```
input:    "extend enum E @d"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-23"></a>

#### 23. `stringValue`: rejects what §2.10.4 String Value accepts

6 cases, in `strings` (4), `lexer-examples` (2). All rely on grammar or rules introduced in September 2025, not in October 2021.

- String values and block strings (MUST, [§2.10.4](https://spec.graphql.org/September2026/#sec-String-Value))

The shortest case, from `strings`:

```
input:    [since September 2025] "{a(x: \"\\u{1F600}\")}"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-24"></a>

#### 24. `typeReferences`: accepts what §2.12 Type References rejects

6 cases, in `variable-types` (5), `type-system-documents` (1).

- Type references (MUST, [§2.12](https://spec.graphql.org/September2026/#sec-Type-References))

The shortest case, from `variable-types`:

```
input:    "query ($a: !) {a}"
sibling:  "query ($a: Int) {a}", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-25"></a>

#### 25. `typeReferences`: rejects what §2.12 Type References accepts

6 cases, in `random-documents` (6).

- Type references (MUST, [§2.12](https://spec.graphql.org/September2026/#sec-Type-References))

The shortest case, from `random-documents`:

```
input:    "subscription a\r\n( $\nquery : on\t@\nb ) @ Foo\r\n@ on {\ntrue }"
sibling:  "subscription a\r\n( $\nquery : : on\t@\nb ) @ Foo\r\n@ on {\ntrue }", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-26"></a>

#### 26. `typeSystemDocuments`: rejects what §3.1 Type System Extensions accepts

6 cases, in `grammar-examples` (3), `type-system-documents` (3).

- Type system documents hold type system definitions, and extension documents extensions too (MUST, [§3.1](https://spec.graphql.org/September2026/#sec-Type-System-Extensions))

The shortest case, from `type-system-documents`:

```
input:    "enum,T"
sibling:  "enum,T T", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-27"></a>

#### 27. `arguments`: rejects what §2.7 Arguments accepts

6 cases, in `type-system-documents` (6).

- Arguments (MUST, [§2.7](https://spec.graphql.org/September2026/#sec-Language.Arguments))

The shortest case, from `type-system-documents`:

```
input:    "extend scalar Int\n@ T,(\nextend : true\t)"
sibling:  "extend scalar Int\n@ T,(\nextend : true )\t)", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-28"></a>

#### 28. `directiveDefinition`: accepts what §3.13 Directives rejects

5 cases, in `directive-definitions` (3), `grammar-examples` (2).

- Directive definitions and their locations (MUST, [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))

The shortest case, from `grammar-examples`:

```
input:    "directive @d on FOO"
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-29"></a>

#### 29. `listValue`: rejects what §2.10.7 List Value accepts

5 cases, in `type-system-documents` (5).

- List values (MUST, [§2.10.7](https://spec.graphql.org/September2026/#sec-List-Value))

The shortest case, from `type-system-documents`:

```
input:    "interface\ntype #c\nunion\r\na\r\n@ query\r\n(\nextend\r\n: [,{ },[ on\n],]\t) = on\n| T"
sibling:  "interface\ntype #c\nunion\r\na\r\n@ query\r\n(\nextend\r\n: [,{ },[ on\nT,]\t) = on\n| T", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-30"></a>

#### 30. `document`: accepts what §2.3 Document rejects

4 cases, in `parser-examples` (2), `byte-order-marks` (1), `grammar-examples` (1).

- A document is one or more definitions of the kinds its grammar allows (MUST, [§2.3](https://spec.graphql.org/September2026/#sec-Document))

The shortest case, from `grammar-examples`:

```
input:    ""
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-31"></a>

#### 31. `enumDefinition`: accepts what §3.9 Enums rejects

4 cases, in `grammar-examples` (2), `enum-values` (1), `type-system-documents` (1).

- Enum definitions and their values (MUST, [§3.9](https://spec.graphql.org/September2026/#sec-Enums))

The shortest case, from `grammar-examples`:

```
input:    "enum E {}"
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-32"></a>

#### 32. `typeSystemDescriptions`: rejects what §3.2 Type System Descriptions accepts

4 cases, in `type-system-documents` (3), `grammar-examples` (1).

- Descriptions on type system definitions and their parts, not on extensions (MUST, [§3.2](https://spec.graphql.org/September2026/#sec-Type-System-Descriptions))

The shortest case, from `type-system-documents`:

```
input:    "\"\" input\r\nT"
sibling:  "! input\r\nT", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-33"></a>

#### 33. `objectExtension`: accepts what §3.6.3 Object Extensions rejects

4 cases, in `grammar-examples` (4).

- Object extensions add interfaces, directives or fields (MUST, [§3.6.3](https://spec.graphql.org/September2026/#sec-Object-Extensions))

The shortest case, from `grammar-examples`:

```
input:    "extend type T {}"
sibling:  "extend type T @d", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-34"></a>

#### 34. `document`: rejects what §2.3 Document accepts

4 cases, in `grammar-examples` (2), `type-system-documents` (2).

- A document is one or more definitions of the kinds its grammar allows (MUST, [§2.3](https://spec.graphql.org/September2026/#sec-Document))

The shortest case, from `grammar-examples`:

```
input:    "{a} type T"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-35"></a>

#### 35. `variables`: accepts what §2.11 Variables rejects

3 cases, in `variable-types` (2), `parser-examples` (1).

- Variables and variable definitions (MUST, [§2.11](https://spec.graphql.org/September2026/#sec-Language.Variables))

The shortest case, from `parser-examples`:

```
input:    "query ($a: ) {a}"
sibling:  "query ($a: Int) {a}", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-36"></a>

#### 36. `nullValue`: rejects what §2.10.5 Null Value accepts

3 cases, in `values` (2), `parser-examples` (1).

- Null value (MUST, [§2.10.5](https://spec.graphql.org/September2026/#sec-Null-Value))

The shortest case, from `values`:

```
input:    "{a(x: null)}"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-37"></a>

#### 37. `inputObjectValues`: rejects what §2.10.8 Input Object Values accepts

3 cases, in `type-system-documents` (2), `parser-examples` (1).

- Input object values (MUST, [§2.10.8](https://spec.graphql.org/September2026/#sec-Input-Object-Values))

The shortest case, from `parser-examples`:

```
input:    "{a(x: {true: false, null: null, on: on})}"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-38"></a>

#### 38. `objectDefinition`: accepts what §3.6 Objects rejects

3 cases, in `grammar-examples` (3).

- Object definitions, implemented interfaces and field definitions (MUST, [§3.6](https://spec.graphql.org/September2026/#sec-Objects))

The shortest case, from `grammar-examples`:

```
input:    "type T {}"
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-39"></a>

#### 39. `argumentsDefinition`: rejects what §3.6.1 Field Arguments accepts

3 cases, in `type-system-documents` (2), `grammar-examples` (1).

- Argument definitions (MUST, [§3.6.1](https://spec.graphql.org/September2026/#sec-Field-Arguments))

The shortest case, from `grammar-examples`:

```
input:    "type T { f(a: Boolean = true, b: Int = null, c: E = RED, d: I = {k: [1]}): Int }"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-40"></a>

#### 40. `enumDefinition`: rejects what §3.9 Enums accepts

3 cases, in `type-system-documents` (2), `grammar-examples` (1).

- Enum definitions and their values (MUST, [§3.9](https://spec.graphql.org/September2026/#sec-Enums))

The shortest case, from `grammar-examples`:

```
input:    "enum E"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-41"></a>

#### 41. `typeSystemDocuments`: accepts what §3.1 Type System Extensions rejects

3 cases, in `grammar-examples` (3).

- Type system documents hold type system definitions, and extension documents extensions too (MUST, [§3.1](https://spec.graphql.org/September2026/#sec-Type-System-Extensions))

The shortest case, from `grammar-examples`:

```
input:    ""
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-42"></a>

#### 42. `booleanValue`: rejects what §2.10.3 Boolean Value accepts

2 cases, in `parser-examples` (2).

- Boolean values (MUST, [§2.10.3](https://spec.graphql.org/September2026/#sec-Boolean-Value))

The shortest case, from `parser-examples`:

```
input:    "{a(x: [true false], y: [null null])}"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-43"></a>

#### 43. `variables`: rejects what §2.11 Variables accepts

2 cases, in `parser-examples` (2).

- Variables and variable definitions (MUST, [§2.11](https://spec.graphql.org/September2026/#sec-Language.Variables))

The shortest case, from `parser-examples`:

```
input:    "query ($a: Int = {k: [1, E, null]}) {a}"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-44"></a>

#### 44. `inputValues`: accepts what §2.10 Input Values rejects

2 cases, in `grammar-examples` (2).

- Input values, and no variables in constant values (MUST, [§2.10](https://spec.graphql.org/September2026/#sec-Input-Values))

The shortest case, from `grammar-examples`:

```
input:    "scalar S @d(a: $v)"
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-45"></a>

#### 45. `inputObjectDefinition`: accepts what §3.10 Input Objects rejects

2 cases, in `grammar-examples` (2).

- Input object definitions and their fields (MUST, [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects))

The shortest case, from `grammar-examples`:

```
input:    "input I {}"
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-46"></a>

#### 46. `operations`: rejects what §2.4 Operations accepts

2 cases, in `type-system-documents` (2).

- Operation definitions and the query shorthand (MUST, [§2.4](https://spec.graphql.org/September2026/#sec-Language.Operations))

The shortest case, from `type-system-documents`:

```
input:    "query\t{,Int\n} extend,scalar type @\tT\n@ #c\nimplements"
sibling:  "&\t{,Int\n} extend,scalar type @\tT\n@ #c\nimplements", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-47"></a>

#### 47. `scalarDefinition`: rejects what §3.5 Scalars accepts

2 cases, in `type-system-documents` (2).

- Scalar definitions (MUST, [§3.5](https://spec.graphql.org/September2026/#sec-Scalars))

The shortest case, from `type-system-documents`:

```
input:    "enum type"
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-48"></a>

#### 48. `fieldAlias`: accepts what §2.8 Field Alias rejects

1 case, in `random-documents` (1).

- Field aliases (MUST, [§2.8](https://spec.graphql.org/September2026/#sec-Field-Alias))

The shortest case, from `random-documents`:

```
input:    "{\t_x,...﻿x1 (\t_x\t: #c\nfalse\t) }"
sibling:  "{\t_x,:﻿x1 (\t_x\t: #c\nfalse\t) }", which the reference accepts
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-49"></a>

#### 49. `comments`: accepts what §2.1.3 Comments rejects

1 case, in `byte-order-marks` (1).

- A comment runs to the end of its line (MUST, [§2.1.3](https://spec.graphql.org/September2026/#sec-Comments))

The shortest case, from `byte-order-marks`:

```
input:    "﻿#{a}"
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-50"></a>

#### 50. `interfaceDefinition`: accepts what §3.7 Interfaces rejects

1 case, in `grammar-examples` (1).

- Interface definitions (MUST, [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces))

The shortest case, from `grammar-examples`:

```
input:    "interface I {}"
response: {"ok":true}
expected: {"ok":false}
```

<a id="parse-finding-51"></a>

#### 51. `typeExtensions`: rejects what §3.4.3 Type Extensions accepts

1 case, in `extensions` (1).

- A type extension names a kind of type (MUST, [§3.4.3](https://spec.graphql.org/September2026/#sec-Type-Extensions))

The shortest case, from `extensions`:

```
input:    "extend union T = A"
sibling:  "extend T = A", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-52"></a>

#### 52. `schemaDefinition`: rejects what §3.3 Schema accepts

1 case, in `type-system-documents` (1).

- Schema definitions (MUST, [§3.3](https://spec.graphql.org/September2026/#sec-Schema))

The shortest case, from `type-system-documents`:

```
input:    "\"\" #c\nschema\n{ query : Int }"
sibling:  "\"\" #c\nschema\n{ query : Int", which the reference rejects
response: {"ok":false}
expected: {"ok":true}
```

<a id="parse-finding-53"></a>

#### 53. `typeConditions`: rejects what §2.9.1 Type Conditions accepts

1 case, in `type-system-documents` (1).

- Type conditions (MUST, [§2.9.1](https://spec.graphql.org/September2026/#sec-Type-Conditions))

The shortest case, from `type-system-documents`:

```
input:    "scalar\tquery,fragment,type\r\non,schema { type } \"\"\"\n  block\n\"\"\"\r\nunion #c\na #c\n@,repeatable\t( on #c\n:,true\r\nInt :\n\"\"\"\"\"\" ) #c\n@ implements"
response: {"ok":false}
expected: {"ok":true}
```

### Every check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **(k since September 2025, j new in September 2026), (all …):** k of the n failing cases rely on grammar or rules introduced in September 2025, and j on ones introduced in September 2026; none of them is in the October 2021 edition. The symbol still gives the check's level.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it. **– needs `x`:** the adapter doesn't claim capability `x`, which the check needs.
- **n/a:** the adapter doesn't take part in this area, or its report predates the check.

| Check | Level | Spec | Result |
| --- | :---: | :---: | :---: |
| Source text is a sequence of SourceCharacter (`sourceText`) | MUST | [§2.1](https://spec.graphql.org/September2026/#sec-Language.Source-Text) | ✗ 22/76 (all since September 2025) |
| White space is tab and space only (`whiteSpace`) | MUST | [§2.1.1](https://spec.graphql.org/September2026/#sec-White-Space) | ✓ 27 |
| Line terminators are LF, CR and CR LF only (`lineTerminators`) | MUST | [§2.1.2](https://spec.graphql.org/September2026/#sec-Line-Terminators) | ✓ 31 |
| A comment runs to the end of its line (`comments`) | MUST | [§2.1.3](https://spec.graphql.org/September2026/#sec-Comments) | ✗ 1/46 |
| Commas are insignificant (`insignificantCommas`) | MUST | [§2.1.4](https://spec.graphql.org/September2026/#sec-Insignificant-Commas) | ✓ 14 |
| Every character outside ignored tokens is part of a token (`lexicalTokens`) | MUST | [§2.1.5](https://spec.graphql.org/September2026/#sec-Language.Source-Text.Lexical-Tokens) | ✓ 61 |
| Ignored tokens may appear before and after every token (`ignoredTokens`) | MUST | [§2.1.6](https://spec.graphql.org/September2026/#sec-Language.Source-Text.Ignored-Tokens) | ✗ 133/425 |
| Punctuators, and `...` only as a whole (`punctuators`) | MUST | [§2.1.7](https://spec.graphql.org/September2026/#sec-Punctuators) | ✓ 40 |
| Names (`names`) | MUST | [§2.1.8](https://spec.graphql.org/September2026/#sec-Names) | ✓ 15 |
| Descriptions on operations, fragments and variables, not on the query shorthand (`descriptions`) | MUST | [§2.2](https://spec.graphql.org/September2026/#sec-Descriptions) | ✗ 85/122 (all since September 2025) |
| A document is one or more definitions of the kinds its grammar allows (`document`) | MUST | [§2.3](https://spec.graphql.org/September2026/#sec-Document) | ✗ 8/127 |
| Operation definitions and the query shorthand (`operations`) | MUST | [§2.4](https://spec.graphql.org/September2026/#sec-Language.Operations) | ✗ 2/114 |
| Selection sets, including empty ones (`selectionSets`) | MUST | [§2.5](https://spec.graphql.org/September2026/#sec-Selection-Sets) | ✗ 11/109 (all new in September 2026) |
| Fields (`fields`) | MUST | [§2.6](https://spec.graphql.org/September2026/#sec-Language.Fields) | ✓ 97 |
| Arguments (`arguments`) | MUST | [§2.7](https://spec.graphql.org/September2026/#sec-Language.Arguments) | ✗ 6/123 |
| Field aliases (`fieldAlias`) | MUST | [§2.8](https://spec.graphql.org/September2026/#sec-Field-Alias) | ✗ 1/94 |
| Fragment definitions and fragment spreads (`fragments`) | MUST | [§2.9](https://spec.graphql.org/September2026/#sec-Language.Fragments) | ✓ 129 |
| Type conditions (`typeConditions`) | MUST | [§2.9.1](https://spec.graphql.org/September2026/#sec-Type-Conditions) | ✗ 1/123 |
| Inline fragments (`inlineFragments`) | MUST | [§2.9.2](https://spec.graphql.org/September2026/#sec-Inline-Fragments) | ✓ 101 |
| Input values, and no variables in constant values (`inputValues`) | MUST | [§2.10](https://spec.graphql.org/September2026/#sec-Input-Values) | ✗ 11/144 |
| Int values (`intValue`) | MUST | [§2.10.1](https://spec.graphql.org/September2026/#sec-Int-Value) | ✗ 8/47 |
| Float values (`floatValue`) | MUST | [§2.10.2](https://spec.graphql.org/September2026/#sec-Float-Value) | ✓ 36 |
| Boolean values (`booleanValue`) | MUST | [§2.10.3](https://spec.graphql.org/September2026/#sec-Boolean-Value) | ✗ 2/6 |
| String values and block strings (`stringValue`) | MUST | [§2.10.4](https://spec.graphql.org/September2026/#sec-String-Value) | ✗ 15/195 (all since September 2025) |
| Null value (`nullValue`) | MUST | [§2.10.5](https://spec.graphql.org/September2026/#sec-Null-Value) | ✗ 3/4 |
| Enum values (`enumValue`) | MUST | [§2.10.6](https://spec.graphql.org/September2026/#sec-Enum-Value) | ✗ 13/39 |
| List values (`listValue`) | MUST | [§2.10.7](https://spec.graphql.org/September2026/#sec-List-Value) | ✗ 5/115 |
| Input object values (`inputObjectValues`) | MUST | [§2.10.8](https://spec.graphql.org/September2026/#sec-Input-Object-Values) | ✗ 3/120 |
| Variables and variable definitions (`variables`) | MUST | [§2.11](https://spec.graphql.org/September2026/#sec-Language.Variables) | ✗ 5/159 |
| Type references (`typeReferences`) | MUST | [§2.12](https://spec.graphql.org/September2026/#sec-Type-References) | ✗ 12/128 |
| Directives (`directives`) | MUST | [§2.13](https://spec.graphql.org/September2026/#sec-Language.Directives) | ✗ 7/150 |
| Type system documents hold type system definitions, and extension documents extensions too (`typeSystemDocuments`) | MUST | [§3.1](https://spec.graphql.org/September2026/#sec-Type-System-Extensions) | ✗ 9/33 |
| Descriptions on type system definitions and their parts, not on extensions (`typeSystemDescriptions`) | MUST | [§3.2](https://spec.graphql.org/September2026/#sec-Type-System-Descriptions) | ✗ 4/25 |
| Schema definitions (`schemaDefinition`) | MUST | [§3.3](https://spec.graphql.org/September2026/#sec-Schema) | ✗ 1/23 |
| Schema extensions add directives or root operation types (`schemaExtension`) | MUST | [§3.3.2](https://spec.graphql.org/September2026/#sec-Schema-Extension) | ✗ 10/26 |
| A type extension names a kind of type (`typeExtensions`) | MUST | [§3.4.3](https://spec.graphql.org/September2026/#sec-Type-Extensions) | ✗ 1/15 |
| Scalar definitions (`scalarDefinition`) | MUST | [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) | ✗ 2/17 |
| Scalar extensions add directives (`scalarExtension`) | MUST | [§3.5.6](https://spec.graphql.org/September2026/#sec-Scalar-Extensions) | ✗ 7/15 |
| Object definitions, implemented interfaces and field definitions (`objectDefinition`) | MUST | [§3.6](https://spec.graphql.org/September2026/#sec-Objects) | ✗ 10/55 |
| Argument definitions (`argumentsDefinition`) | MUST | [§3.6.1](https://spec.graphql.org/September2026/#sec-Field-Arguments) | ✗ 3/16 |
| Object extensions add interfaces, directives or fields (`objectExtension`) | MUST | [§3.6.3](https://spec.graphql.org/September2026/#sec-Object-Extensions) | ✗ 13/32 |
| Interface definitions (`interfaceDefinition`) | MUST | [§3.7](https://spec.graphql.org/September2026/#sec-Interfaces) | ✗ 9/16 |
| Interface extensions add interfaces, directives or fields (`interfaceExtension`) | MUST | [§3.7.1](https://spec.graphql.org/September2026/#sec-Interface-Extensions) | ✗ 10/17 |
| Union definitions and their member types (`unionDefinition`) | MUST | [§3.8](https://spec.graphql.org/September2026/#sec-Unions) | ✗ 8/44 |
| Union extensions add directives or member types (`unionExtension`) | MUST | [§3.8.1](https://spec.graphql.org/September2026/#sec-Union-Extensions) | ✗ 11/30 |
| Enum definitions and their values (`enumDefinition`) | MUST | [§3.9](https://spec.graphql.org/September2026/#sec-Enums) | ✗ 7/34 |
| Enum extensions add directives or values (`enumExtension`) | MUST | [§3.9.1](https://spec.graphql.org/September2026/#sec-Enum-Extensions) | ✗ 7/15 |
| Input object definitions and their fields (`inputObjectDefinition`) | MUST | [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects) | ✗ 10/20 |
| Input object extensions add directives or fields (`inputObjectExtension`) | MUST | [§3.10.2](https://spec.graphql.org/September2026/#sec-Input-Object-Extensions) | ✗ 8/15 |
| Directive definitions and their locations (`directiveDefinition`) | MUST | [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | ✗ 16/72 (5 new in September 2026) |
| Directive extensions add directives (`directiveExtension`) | MUST (new in September 2026) | [§3.13.6](https://spec.graphql.org/September2026/#sec-Directive-Extensions) | ✗ 16/37 (14 new in September 2026) |

- **Basis for `sourceText`:** SourceCharacter :: "Any Unicode scalar value"; "The source text of a GraphQL document must be a sequence of {SourceCharacter}."
- **Basis for `whiteSpace`:** Whitespace :: "Horizontal Tab (U+0009)" | "Space (U+0020)"
- **Basis for `lineTerminators`:** LineTerminator :: "New Line (U+000A)" | "Carriage Return (U+000D)" [lookahead != "New Line (U+000A)"] | "Carriage Return (U+000D)" "New Line (U+000A)"
- **Basis for `comments`:** Comment :: `#` CommentChar* [lookahead != CommentChar]; CommentChar :: SourceCharacter but not LineTerminator
- **Basis for `insignificantCommas`:** Comma :: ,; commas "are used to improve the legibility of source text and separate lexical tokens but are otherwise syntactically and semantically insignificant within GraphQL documents."
- **Basis for `lexicalTokens`:** Token :: Punctuator | Name | IntValue | FloatValue | StringValue; "The character sequence must be described by a sequence of {Token} and {Ignored} lexical grammars."
- **Basis for `ignoredTokens`:** Ignored :: UnicodeBOM | Whitespace | LineTerminator | Comment | Comma; "Any amount of {Ignored} may appear before and after every lexical token."
- **Basis for `punctuators`:** Punctuator :: one of ! $ & ( ) ... : = @ [ ] { | }
- **Basis for `names`:** Name :: NameStart NameContinue* [lookahead != NameContinue]; NameStart :: Letter | `_`; NameContinue :: Letter | Digit | `_`
- **Basis for `descriptions`:** Description : StringValue; OperationDefinition : Description? OperationType Name? VariablesDefinition? Directives? SelectionSet | SelectionSet; FragmentDefinition : Description? fragment …; VariableDefinition : Description? Variable : …
- **Basis for `document`:** Document : Definition+; Definition : ExecutableDefinition | TypeSystemDefinitionOrExtension; ExecutableDocument : ExecutableDefinition+; ExecutableDefinition : OperationDefinition | FragmentDefinition
- **Basis for `operations`:** OperationDefinition : Description? OperationType Name? VariablesDefinition? Directives? SelectionSet | SelectionSet; OperationType : one of `query` `mutation` `subscription`
- **Basis for `selectionSets`:** SelectionSet : { Selection* }; Selection : Field | FragmentSpread | InlineFragment
- **Basis for `fields`:** Field : Alias? Name Arguments? Directives? SelectionSet?
- **Basis for `arguments`:** Arguments[Const] : ( Argument[?Const]+ ); Argument[Const] : Name : Value[?Const]
- **Basis for `fieldAlias`:** Alias : Name :
- **Basis for `fragments`:** FragmentSpread : ... FragmentName Directives?; FragmentDefinition : Description? fragment FragmentName TypeCondition Directives? SelectionSet; FragmentName : Name but not `on`
- **Basis for `typeConditions`:** TypeCondition : on NamedType
- **Basis for `inlineFragments`:** InlineFragment : ... TypeCondition? Directives? SelectionSet
- **Basis for `inputValues`:** Value[Const] : [~Const] Variable | IntValue | FloatValue | StringValue | BooleanValue | NullValue | EnumValue | ListValue[?Const] | ObjectValue[?Const]
- **Basis for `intValue`:** IntValue :: IntegerPart [lookahead != {Digit, `.`, NameStart}]; IntegerPart :: NegativeSign? 0 | NegativeSign? NonZeroDigit Digit*; "It must not have any leading {0}."
- **Basis for `floatValue`:** FloatValue :: IntegerPart FractionalPart ExponentPart | IntegerPart FractionalPart | IntegerPart ExponentPart, each [lookahead != {Digit, `.`, NameStart}]
- **Basis for `booleanValue`:** BooleanValue : one of `true` `false`
- **Basis for `stringValue`:** StringValue :: `""` [lookahead != `"`] | `"` StringCharacter+ `"` | BlockString; "The hexadecimal number encoded by a Unicode escape sequence must describe a _Unicode scalar value_, otherwise must result in a parse error."
- **Basis for `nullValue`:** NullValue : `null`
- **Basis for `enumValue`:** EnumValue : Name but not `true`, `false` or `null`
- **Basis for `listValue`:** ListValue[Const] : [ ] | [ Value[?Const]+ ]
- **Basis for `inputObjectValues`:** ObjectValue[Const] : { } | { ObjectField[?Const]+ }; ObjectField[Const] : Name : Value[?Const]
- **Basis for `variables`:** Variable : $ Name; VariablesDefinition : ( VariableDefinition+ ); VariableDefinition : Description? Variable : Type DefaultValue? Directives[Const]?; DefaultValue : = Value[Const]
- **Basis for `typeReferences`:** Type : NamedType | ListType | NonNullType; NamedType : Name; ListType : [ Type ]; NonNullType : NamedType ! | ListType !
- **Basis for `directives`:** Directives[Const] : Directive[?Const]+; Directive[Const] : @ Name Arguments[?Const]?
- **Basis for `typeSystemDocuments`:** TypeSystemDocument : TypeSystemDefinition+ (§3); TypeSystemExtensionDocument : TypeSystemDefinitionOrExtension+; TypeSystemDefinitionOrExtension : TypeSystemDefinition | TypeSystemExtension (§3.1)
- **Basis for `typeSystemDescriptions`:** Description : StringValue, where a production allows one: every type system definition, FieldDefinition, InputValueDefinition and EnumValueDefinition starts with Description?, and no extension does
- **Basis for `schemaDefinition`:** SchemaDefinition : Description? schema Directives[Const]? { RootOperationTypeDefinition+ }; RootOperationTypeDefinition : OperationType : NamedType
- **Basis for `schemaExtension`:** SchemaExtension : extend schema Directives[Const]? { RootOperationTypeDefinition+ } | extend schema Directives[Const] [lookahead != `{`]
- **Basis for `typeExtensions`:** TypeExtension : ScalarTypeExtension | ObjectTypeExtension | InterfaceTypeExtension | UnionTypeExtension | EnumTypeExtension | InputObjectTypeExtension
- **Basis for `scalarDefinition`:** ScalarTypeDefinition : Description? scalar Name Directives[Const]?
- **Basis for `scalarExtension`:** ScalarTypeExtension : extend scalar Name Directives[Const]
- **Basis for `objectDefinition`:** ObjectTypeDefinition : Description? type Name ImplementsInterfaces? Directives[Const]? FieldsDefinition | Description? type Name ImplementsInterfaces? Directives[Const]? [lookahead != `{`]; ImplementsInterfaces : ImplementsInterfaces & NamedType | implements `&`? NamedType; FieldsDefinition : { FieldDefinition+ }; FieldDefinition : Description? Name ArgumentsDefinition? : Type Directives[Const]?
- **Basis for `argumentsDefinition`:** ArgumentsDefinition : ( InputValueDefinition+ ); InputValueDefinition : Description? Name : Type DefaultValue? Directives[Const]?
- **Basis for `objectExtension`:** ObjectTypeExtension : extend type Name ImplementsInterfaces? Directives[Const]? FieldsDefinition | extend type Name ImplementsInterfaces? Directives[Const] [lookahead != `{`] | extend type Name ImplementsInterfaces [lookahead != `{`]
- **Basis for `interfaceDefinition`:** InterfaceTypeDefinition : Description? interface Name ImplementsInterfaces? Directives[Const]? FieldsDefinition | Description? interface Name ImplementsInterfaces? Directives[Const]? [lookahead != `{`]
- **Basis for `interfaceExtension`:** InterfaceTypeExtension : extend interface Name ImplementsInterfaces? Directives[Const]? FieldsDefinition | extend interface Name ImplementsInterfaces? Directives[Const] [lookahead != `{`] | extend interface Name ImplementsInterfaces [lookahead != `{`]
- **Basis for `unionDefinition`:** UnionTypeDefinition : Description? union Name Directives[Const]? UnionMemberTypes?; UnionMemberTypes : UnionMemberTypes | NamedType | = `|`? NamedType
- **Basis for `unionExtension`:** UnionTypeExtension : extend union Name Directives[Const]? UnionMemberTypes | extend union Name Directives[Const]
- **Basis for `enumDefinition`:** EnumTypeDefinition : Description? enum Name Directives[Const]? EnumValuesDefinition | Description? enum Name Directives[Const]? [lookahead != `{`]; EnumValuesDefinition : { EnumValueDefinition+ }; EnumValueDefinition : Description? EnumValue Directives[Const]?
- **Basis for `enumExtension`:** EnumTypeExtension : extend enum Name Directives[Const]? EnumValuesDefinition | extend enum Name Directives[Const] [lookahead != `{`]
- **Basis for `inputObjectDefinition`:** InputObjectTypeDefinition : Description? input Name Directives[Const]? InputFieldsDefinition | Description? input Name Directives[Const]? [lookahead != `{`]; InputFieldsDefinition : { InputValueDefinition+ }
- **Basis for `inputObjectExtension`:** InputObjectTypeExtension : extend input Name Directives[Const]? InputFieldsDefinition | extend input Name Directives[Const] [lookahead != `{`]
- **Basis for `directiveDefinition`:** DirectiveDefinition : Description? directive @ Name ArgumentsDefinition? Directives[Const]? `repeatable`? on DirectiveLocations; DirectiveLocations : DirectiveLocations | DirectiveLocation | `|`? DirectiveLocation; DirectiveLocation : ExecutableDirectiveLocation | TypeSystemDirectiveLocation, each one of a list of names
- **Basis for `directiveExtension`:** DirectiveExtension : extend directive @ Name Directives[Const]

## Coerce

- **Capabilities:** coerce, custom-directives, deferred-items, introspect, invalid-results, mutation, nested-fields, parent-values, parse, parse-sdl, request-extensions, scalar-results, subscription, subscription-source, subscription-stream, uncoercible-results
- **Cases:** 2142 submitted, 2142 distinct, 0 malformed
- **Vectors relying on rules after October 2021:** since September 2025, 32 of 56 vectors failing; new in September 2026, 9 of 9 vectors failing
- **Adapter problems:** none
- **Checker self-test:** passed (36380 negative controls)
- **Run:** kit 0625b35d64dd, 2026-11-16, strict

### Findings

<a id="coerce-finding-1"></a>

#### 1. `requestErrorNoData`: answers a request error with a "data" entry, which §7.1.3 (Request Error Result) says it must not have

1449 cases, in `literal` (745), `variable` (584), `nested-variable` (18), `unparsable` (16), `nested` (14), `operation` (12), `subscription` (11), `spec-example` (10), `nullable-variable` (9), `not-executable` (6), `variable-default` (4), `unvalidated` (4), `omitted` (3), `arguments` (3), `unused-variable` (3), `extensions` (3), `order` (2), `descriptions` (2). 1 of them rely on grammar or rules introduced in September 2025 and 8 on ones introduced in September 2026, not in October 2021.

- A request error result has no data entry (MUST, [§7.1.3](https://spec.graphql.org/September2026/#sec-Request-Error-Result))

The shortest case, from `unparsable`:

```
input:      variables: {}
response: {"calls":[],"response":{"data":null,"errors":[{"message":"Must provide an operation.","locations":[]}]}}
expected: a request error
```

<a id="coerce-finding-2"></a>

#### 2. `int`: accepts what §3.5.1 (Int) rejects

44 cases, in `variable` (44).

- Int accepts only integer input values (MUST, [§3.5.1](https://spec.graphql.org/September2026/#sec-Int))

The shortest case, from `variable`:

```
input:    query($x: Int) { int(v: $x) }  variables: {"x": 1.5}
response: {"calls":[{"arguments":{"v":1},"path":["int"]}],"response":{"data":{"int":"ok"}}}
expected: a request error
```

<a id="coerce-finding-3"></a>

#### 3. `boolean`: accepts what §3.5.4 (Boolean) rejects

44 cases, in `variable` (44).

- Boolean accepts only boolean input values (MUST, [§3.5.4](https://spec.graphql.org/September2026/#sec-Boolean))

The shortest case, from `variable`:

```
input:    query($x: Boolean) { boolean(v: $x) }  variables: {"x": 0}
response: {"calls":[{"arguments":{"v":false},"path":["boolean"]}],"response":{"data":{"boolean":"ok"}}}
expected: a request error
```

<a id="coerce-finding-4"></a>

#### 4. `string`: accepts what §3.5.3 (String) rejects

40 cases, in `variable` (40).

- String accepts only string input values (MUST, [§3.5.3](https://spec.graphql.org/September2026/#sec-String))

The shortest case, from `variable`:

```
input:    query($x: String) { string(v: $x) }  variables: {"x": 0}
response: {"calls":[{"arguments":{"v":"0"},"path":["string"]}],"response":{"data":{"string":"ok"}}}
expected: a request error
```

<a id="coerce-finding-5"></a>

#### 5. `id`: accepts what §3.5.5 (ID) rejects

30 cases, in `variable` (30).

- ID rejects input values other than strings and integers (MUST, [§3.5.5](https://spec.graphql.org/September2026/#sec-ID))

The shortest case, from `variable`:

```
input:    query($x: ID) { id(v: $x) }  variables: {"x": []}
response: {"calls":[{"arguments":{"v":"[]"},"path":["id"]}],"response":{"data":{"id":"ok"}}}
expected: a request error
```

<a id="coerce-finding-6"></a>

#### 6. `intRange`: accepts what §3.5.1 (Int) rejects

16 cases, in `literal` (16).

- Int rejects integers outside the signed 32-bit range (SHOULD, [§3.5.1](https://spec.graphql.org/September2026/#sec-Int))

The shortest case, from `literal`:

```
input:    { int(v: 2147483648) }  variables: {}
response: {"calls":[{"arguments":{"v":2147483648},"path":["int"]}],"response":{"data":{"int":"ok"}}}
expected: a field error at int, or a request error
```

<a id="coerce-finding-7"></a>

#### 7. `responds`: produces no response, though §7 (Response) says every request gets one (on vectors of §3.10.1 (OneOf Input Objects))

10 cases, in `oneOf` (10). All rely on grammar or rules introduced in September 2025, not in October 2021.

- A request gets a response (MUST, [§7](https://spec.graphql.org/September2026/#sec-Response))

The shortest case, from `oneOf`:

```
problem:  graphql-go can't build the schema: graphql-go can't express @oneOf on the input object ExampleOneOfInputObject
input:    [since September 2025] { oneOfExample(arg: { b: 123 }) }  variables: {}
response: "the adapter answered with an error: graphql-go can't build the schema: graphql-go can't express @oneOf on the input object ExampleOneOfInputObject"
expected: oneOfExample resolved with {"arg":{"b":123}}
```

<a id="coerce-finding-8"></a>

#### 8. `responds`: produces no response, though §7 (Response) says every request gets one (on vectors of §6.1.1 (Validating Requests))

10 cases, in `oneOf` (10). All rely on grammar or rules introduced in September 2025, not in October 2021.

- A request gets a response (MUST, [§7](https://spec.graphql.org/September2026/#sec-Response))

The shortest case, from `oneOf`:

```
problem:  graphql-go can't build the schema: graphql-go can't express @oneOf on the input object ExampleOneOfInputObject
input:    [since September 2025] { oneOfExample(arg: {}) }  variables: {}
response: "the adapter answered with an error: graphql-go can't build the schema: graphql-go can't express @oneOf on the input object ExampleOneOfInputObject"
expected: a request error
```

<a id="coerce-finding-9"></a>

#### 9. `variables`: rejects what §6.1.2 (Coercing Variable Values) accepts

9 cases, in `variable-default` (9). 1 of them rely on grammar or rules introduced in September 2025, not in October 2021.

- CoerceVariableValues: defaults, missing and null values, and failures as request errors (MUST, [§6.1.2](https://spec.graphql.org/September2026/#sec-Coercing-Variable-Values))

The shortest case, from `variable-default`:

```
input:    query($x: Int! = 3) { intNN(v: $x) }  variables: {}
response: {"calls":[],"response":{"data":null,"errors":[{"message":"Variable \"$x\" of type \"Int!\" is required and will not use the default value. Perhaps you meant to use type \"Int\".","locations":[{"line":1,"column":18}]}]}}
expected: intNN resolved with {"v":3}
```

<a id="coerce-finding-10"></a>

#### 10. `list`: rejects what §3.11 (List) accepts

9 cases, in `literal` (8), `variable-default` (1).

- Lists: each item coerced, a single value wrapped in a list (MUST, [§3.11](https://spec.graphql.org/September2026/#sec-List))

The shortest case, from `literal`:

```
input:    { ints(v: [null]) }  variables: {}
response: {"calls":[],"response":{"data":null,"errors":[{"message":"Syntax Error GraphQL request (1:12) Unexpected Name \"null\"\n\n1: { ints(v: [null]) }\n              ^\n","locations":[{"line":1,"column":12}]}]}}
expected: ints resolved with {"v":[null]}
```

<a id="coerce-finding-11"></a>

#### 11. `variables`: coerces to the wrong value under §6.1.2 (Coercing Variable Values)

8 cases, in `variable` (4), `variable-default` (4).

- CoerceVariableValues: defaults, missing and null values, and failures as request errors (MUST, [§6.1.2](https://spec.graphql.org/September2026/#sec-Coercing-Variable-Values))

The shortest case, from `variable`:

```
input:    query($x: Int) { intDefault(v: $x) }  variables: {"x": null}
response: {"calls":[{"arguments":{"v":7},"path":["intDefault"]}],"response":{"data":{"intDefault":"ok"}}}
expected: intDefault resolved with {"v":null}
```

<a id="coerce-finding-12"></a>

#### 12. `descriptionsInert`: rejects what §2.2 (Descriptions) accepts

8 cases, in `descriptions` (8). All rely on grammar or rules introduced in September 2025, not in October 2021.

- Descriptions and comments in an executable document don't change the response (MUST, [§2.2](https://spec.graphql.org/September2026/#sec-Descriptions))

The shortest case, from `descriptions`:

```
input:    [since September 2025] "d" query Q { int(v: 1) }  variables: {}
response: {"calls":[],"response":{"data":null,"errors":[{"message":"Syntax Error GraphQL request (1:1) Expected Name, found String \"d\"\n\n1: \"d\" query Q { int(v: 1) }\n   ^\n","locations":[{"line":1,"column":1}]}]}}
expected: int resolved with {"v":1}
```

<a id="coerce-finding-13"></a>

#### 13. `arguments`: rejects what §6.4.1 (Coercing Field Arguments) accepts

7 cases, in `arguments` (4), `nullable-variable` (2), `omitted` (1).

- CoerceArgumentValues: defaults, missing variables, and null for Non-Null arguments (MUST, [§6.4.1](https://spec.graphql.org/September2026/#sec-Coercing-Field-Arguments))

The shortest case, from `arguments`:

```
input:    { pair }  variables: {}
response: {"calls":[],"response":{"data":null,"errors":[{"message":"Field \"pair\" argument \"b\" of type \"Int!\" is required but not provided.","locations":[{"line":1,"column":3}]}]}}
expected: pair resolved with {"b":2}
```

<a id="coerce-finding-14"></a>

#### 14. `inputObject`: rejects what §3.10 (Input Objects) accepts

6 cases, in `literal` (5), `variable-default` (1).

- Input objects: an object of defined fields, required fields, variables in fields (MUST, [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects) [§3.12](https://spec.graphql.org/September2026/#sec-Non-Null))

The shortest case, from `literal`:

```
input:    { pointDefault(v: null) }  variables: {}
response: {"calls":[],"response":{"data":null,"errors":[{"message":"Syntax Error GraphQL request (1:19) Unexpected Name \"null\"\n\n1: { pointDefault(v: null) }\n                     ^\n","locations":[{"line":1,"column":19}]}]}}
expected: pointDefault resolved with {"v":null}
```

<a id="coerce-finding-15"></a>

#### 15. `responds`: produces no response, though §7 (Response) says every request gets one (on vectors of §3.11 (List))

5 cases, in `variable` (5).

- A request gets a response (MUST, [§7](https://spec.graphql.org/September2026/#sec-Response))

The shortest case, from `variable`:

```
problem:  can't read the variables: json: cannot unmarshal number 1e400 into Go value of type float64
input:    query($x: [Int]) { ints(v: $x) }  variables: {"x": 1e400}
response: "the adapter answered with an error: can't read the variables: json: cannot unmarshal number 1e400 into Go value of type float64"
expected: a request error
```

<a id="coerce-finding-16"></a>

#### 16. `inputObject`: coerces to the wrong value under §3.10 (Input Objects)

5 cases, in `variable` (4), `nested-variable` (1).

- Input objects: an object of defined fields, required fields, variables in fields (MUST, [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects) [§3.12](https://spec.graphql.org/September2026/#sec-Non-Null))

The shortest case, from `variable`:

```
input:    query($x: Point) { point(v: $x) }  variables: {"x": {"x": 1, "y": null}}
response: {"calls":[{"arguments":{"v":{"x":1,"y":0}},"path":["point"]}],"response":{"data":{"point":"ok"}}}
expected: point resolved with {"v":{"x":1,"y":null}}
```

<a id="coerce-finding-17"></a>

#### 17. `responds`: produces no response, though §7 (Response) says every request gets one (on vectors of §3.5.1 (Int))

4 cases, in `variable` (4).

- A request gets a response (MUST, [§7](https://spec.graphql.org/September2026/#sec-Response))

The shortest case, from `variable`:

```
problem:  can't read the variables: json: cannot unmarshal number 1e400 into Go value of type float64
input:    query($x: Int) { int(v: $x) }  variables: {"x": 1e400}
response: "the adapter answered with an error: can't read the variables: json: cannot unmarshal number 1e400 into Go value of type float64"
expected: a request error
```

<a id="coerce-finding-18"></a>

#### 18. `variables`: accepts what §6.1.2 (Coercing Variable Values) rejects

4 cases, in `variable-default` (4).

- CoerceVariableValues: defaults, missing and null values, and failures as request errors (MUST, [§6.1.2](https://spec.graphql.org/September2026/#sec-Coercing-Variable-Values))

The shortest case, from `variable-default`:

```
input:    query($x: Int = 3) { intNN(v: $x) }  variables: {"x": null}
response: {"calls":[{"arguments":{"v":3},"path":["intNN"]}],"response":{"data":{"intNN":"ok"}}}
expected: a field error at intNN
```

<a id="coerce-finding-19"></a>

#### 19. `responds`: produces no response, though §7 (Response) says every request gets one (on vectors of §3.10 (Input Objects))

4 cases, in `variable` (4).

- A request gets a response (MUST, [§7](https://spec.graphql.org/September2026/#sec-Response))

The shortest case, from `variable`:

```
problem:  can't read the variables: json: cannot unmarshal number 1e400 into Go value of type float64
input:    query($x: Point) { point(v: $x) }  variables: {"x": 1e400}
response: "the adapter answered with an error: can't read the variables: json: cannot unmarshal number 1e400 into Go value of type float64"
expected: a request error
```

<a id="coerce-finding-20"></a>

#### 20. `int`: rejects what §3.5.1 (Int) accepts

3 cases, in `variable-default` (2), `literal` (1).

- Int accepts only integer input values (MUST, [§3.5.1](https://spec.graphql.org/September2026/#sec-Int))

The shortest case, from `literal`:

```
input:    { intDefault(v: null) }  variables: {}
response: {"calls":[],"response":{"data":null,"errors":[{"message":"Syntax Error GraphQL request (1:17) Unexpected Name \"null\"\n\n1: { intDefault(v: null) }\n                   ^\n","locations":[{"line":1,"column":17}]}]}}
expected: intDefault resolved with {"v":null}
```

<a id="coerce-finding-21"></a>

#### 21. `float`: accepts what §3.5.2 (Float) rejects

3 cases, in `variable` (3).

- Float accepts integer and float input values, and rejects non-finite values (MUST, [§3.5.2](https://spec.graphql.org/September2026/#sec-Float))

The shortest case, from `variable`:

```
input:    query($x: Float) { float(v: $x) }  variables: {"x": "1"}
response: {"calls":[{"arguments":{"v":1},"path":["float"]}],"response":{"data":{"float":"ok"}}}
expected: a request error
```

<a id="coerce-finding-22"></a>

#### 22. `stringValue`: coerces to the wrong value under §2.10.4 (String Value)

3 cases, in `string-value` (3).

- A string literal's escapes and block string indentation decode to its Unicode text (MUST, [§2.10.4](https://spec.graphql.org/September2026/#sec-String-Value))

The shortest case, from `string-value`:

```
input:    { string(v: """	a
		b  c""") }  variables: {}
response: {"calls":[{"arguments":{"v":"b\nc"},"path":["string"]}],"response":{"data":{"string":"ok"}}}
expected: string resolved with {"v":"\ta\nb\nc"}
```

<a id="coerce-finding-23"></a>

#### 23. `argumentErrorKind`: raises a request error where §6.4.1 (Coercing Field Arguments) says a coercion failure should be treated as a field error

2 cases, in `nullable-variable` (1), `arguments` (1).

- A value CoerceArgumentValues can't coerce is a field error, not a request error (SHOULD, [§6.4.1](https://spec.graphql.org/September2026/#sec-Coercing-Field-Arguments))

The shortest case, from `nullable-variable`:

```
input:    query($x: Int) { intNNDefault(v: $x) }  variables: {"x": null}
response: {"calls":[],"response":{"data":null,"errors":[{"message":"Variable \"$x\" of type \"Int\" used in position expecting type \"Int!\".","locations":[{"line":1,"column":7},{"line":1,"column":34}]}]}}
expected: a field error at intNNDefault
```

<a id="coerce-finding-24"></a>

#### 24. `responds`: produces no response, though §7 (Response) says every request gets one (on vectors of §3.9 (Enums))

2 cases, in `variable` (2).

- A request gets a response (MUST, [§7](https://spec.graphql.org/September2026/#sec-Response))

The shortest case, from `variable`:

```
problem:  can't read the variables: json: cannot unmarshal number 1e400 into Go value of type float64
input:    query($x: Color) { color(v: $x) }  variables: {"x": 1e400}
response: "the adapter answered with an error: can't read the variables: json: cannot unmarshal number 1e400 into Go value of type float64"
expected: a request error
```

<a id="coerce-finding-25"></a>

#### 25. `list`: follows October 2021's §3.11 table of examples, which is non-normative and which §3.11's prose, the same in every edition, contradicts

2 cases, in `literal` (2).

- Lists: each item coerced, a single value wrapped in a list (MUST, [§3.11](https://spec.graphql.org/September2026/#sec-List))

The shortest case, from `literal`:

```
input:    { matrix(v: [1, null]) }  variables: {}
response: {"calls":[],"response":{"data":null,"errors":[{"message":"Syntax Error GraphQL request (1:17) Unexpected Name \"null\"\n\n1: { matrix(v: [1, null]) }\n                   ^\n","locations":[{"line":1,"column":17}]}]}}
expected: matrix resolved with {"v":[[1],null]}
```

<a id="coerce-finding-26"></a>

#### 26. `inputFieldDefaults`: an omitted input field gets its default value: not done, though §3.10 (Input Objects) says it should be

2 cases, in `nested-variable` (2). All rely on grammar or rules introduced in September 2025, not in October 2021.

- An omitted input field gets its default value (SHOULD, [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects))

The shortest case, from `nested-variable`:

```
input:    [since September 2025] query($c: Color) { shape(v: { origin: { x: 1 }, color: $c }) }  variables: {}
response: {"calls":[{"arguments":{"v":{"origin":{"x":1,"y":0},"tags":["shape"]}},"path":["shape"]}],"response":{"data":{"shape":"ok"}}}
expected: shape resolved with {"v":{"color":"RED","origin":{"x":1,"y":0},"tags":["shape"]}}
```

<a id="coerce-finding-27"></a>

#### 27. `argumentsBelowRoot`: accepts what §6.4.4 (Handling Execution Errors) rejects

2 cases, in `nested` (2).

- An argument error below the root nulls the field's position and propagates (MUST, [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) [§6.4.1](https://spec.graphql.org/September2026/#sec-Coercing-Field-Arguments) [§7.1.4](https://spec.graphql.org/September2026/#sec-Response-Position))

The shortest case, from `nested`:

```
input:    query($x: Int = 1) { nested { intNN(v: $x) } }  variables: {"x": null}
response: {"calls":[{"arguments":{},"path":["nested"]},{"arguments":{"v":1},"path":["nested","intNN"]}],"response":{"data":{"nested":{"intNN":"ok"}}}}
expected: a field error at intNN
```

<a id="coerce-finding-28"></a>

#### 28. `responds`: produces no response, though §7 (Response) says every request gets one (on vectors of §3.5.2 (Float))

1 case, in `variable` (1).

- A request gets a response (MUST, [§7](https://spec.graphql.org/September2026/#sec-Response))

The shortest case, from `variable`:

```
problem:  can't read the variables: json: cannot unmarshal number 1e400 into Go value of type float64
input:    query($x: Float) { float(v: $x) }  variables: {"x": 1e400}
response: "the adapter answered with an error: can't read the variables: json: cannot unmarshal number 1e400 into Go value of type float64"
expected: a request error
```

<a id="coerce-finding-29"></a>

#### 29. `responds`: produces no response, though §7 (Response) says every request gets one (on vectors of §3.5.3 (String))

1 case, in `variable` (1).

- A request gets a response (MUST, [§7](https://spec.graphql.org/September2026/#sec-Response))

The shortest case, from `variable`:

```
problem:  can't read the variables: json: cannot unmarshal number 1e400 into Go value of type float64
input:    query($x: String) { string(v: $x) }  variables: {"x": 1e400}
response: "the adapter answered with an error: can't read the variables: json: cannot unmarshal number 1e400 into Go value of type float64"
expected: a request error
```

<a id="coerce-finding-30"></a>

#### 30. `responds`: produces no response, though §7 (Response) says every request gets one (on vectors of §3.5.4 (Boolean))

1 case, in `variable` (1).

- A request gets a response (MUST, [§7](https://spec.graphql.org/September2026/#sec-Response))

The shortest case, from `variable`:

```
problem:  can't read the variables: json: cannot unmarshal number 1e400 into Go value of type float64
input:    query($x: Boolean) { boolean(v: $x) }  variables: {"x": 1e400}
response: "the adapter answered with an error: can't read the variables: json: cannot unmarshal number 1e400 into Go value of type float64"
expected: a request error
```

<a id="coerce-finding-31"></a>

#### 31. `responds`: produces no response, though §7 (Response) says every request gets one

1 case, in `variable` (1).

- A request gets a response (MUST, [§7](https://spec.graphql.org/September2026/#sec-Response))

The shortest case, from `variable`:

```
problem:  can't read the variables: json: cannot unmarshal number 1e400 into Go value of type float64
input:    query($x: ID) { id(v: $x) }  variables: {"x": 1e400}
response: "the adapter answered with an error: can't read the variables: json: cannot unmarshal number 1e400 into Go value of type float64"
expected: id resolved with {"v":"10000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"}, or a request error, or a request error
```

<a id="coerce-finding-32"></a>

#### 32. `enum`: rejects what §3.9 (Enums) accepts

1 case, in `literal` (1).

- Enums accept their own values, and reject string literals and unknown values (MUST, [§3.9](https://spec.graphql.org/September2026/#sec-Enums))

The shortest case, from `literal`:

```
input:    { colorDefault(v: null) }  variables: {}
response: {"calls":[],"response":{"data":null,"errors":[{"message":"Syntax Error GraphQL request (1:19) Unexpected Name \"null\"\n\n1: { colorDefault(v: null) }\n                     ^\n","locations":[{"line":1,"column":19}]}]}}
expected: colorDefault resolved with {"v":null}
```

<a id="coerce-finding-33"></a>

#### 33. `list`: accepts what §3.11 (List) rejects

1 case, in `nested-variable` (1).

- Lists: each item coerced, a single value wrapped in a list (MUST, [§3.11](https://spec.graphql.org/September2026/#sec-List))

The shortest case, from `nested-variable`:

```
input:    query($x: Int = 1) { intsNN(v: [1, $x]) }  variables: {"x": null}
response: {"calls":[{"arguments":{"v":[1,1]},"path":["intsNN"]}],"response":{"data":{"intsNN":"ok"}}}
expected: a field error at intsNN
```

<a id="coerce-finding-34"></a>

#### 34. `nonNull`: accepts what §3.12 (Non-Null) rejects

1 case, in `subscription` (1). All rely on grammar or rules introduced in September 2026, not in October 2021.

- Non-Null rejects null (MUST, [§3.12](https://spec.graphql.org/September2026/#sec-Non-Null))

The shortest case, from `subscription`:

```
input:    [since September 2026] subscription($x: Int = 1) { eventNN(v: $x) }  variables: {"x": null}  subscribe: stream
response: {"calls":[{"arguments":{"v":1},"path":["eventNN"]}],"response":{"data":{"eventNN":"ok"}},"sourceCalls":[{"arguments":{"v":1},"field":"eventNN"}]}
expected: a request error
```

<a id="coerce-finding-35"></a>

#### 35. `onlyValidExecuted`: executes an invalid document its validator doesn't reject, though §6.1.1 (Validating Requests) says only valid documents should be executed (the rule it misses is the validate area's)

1 case, in `subscription` (1).

- Only valid documents are executed (SHOULD, [§6.1.1](https://spec.graphql.org/September2026/#sec-Validating-Requests) [§5](https://spec.graphql.org/September2026/#sec-Validation))

The shortest case, from `subscription`:

```
input:    subscription { event(v: 1) eventNN(v: 1) }  variables: {}  subscribe: stream
response: {"calls":[{"arguments":{"v":1},"path":["event"]},{"arguments":{"v":1},"path":["eventNN"]}],"response":{"data":{"event":"ok","eventNN":"ok"}},"sourceCalls":[{"arguments":{"v":1},"field":"event"}]}
expected: a request error
```

### Every check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **(k since September 2025, j new in September 2026), (all …):** k of the n failing cases rely on grammar or rules introduced in September 2025, and j on ones introduced in September 2026; none of them is in the October 2021 edition. The symbol still gives the check's level.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it. **– needs `x`:** the adapter doesn't claim capability `x`, which the check needs.
- **n/a:** the adapter doesn't take part in this area, or its report predates the check.

| Check | Level | Spec | Result |
| --- | :---: | :---: | :---: |
| Int accepts only integer input values (`int`) | MUST | [§3.5.1](https://spec.graphql.org/September2026/#sec-Int) | ✗ 47/223 |
| Int rejects integers outside the signed 32-bit range (`intRange`) | SHOULD | [§3.5.1](https://spec.graphql.org/September2026/#sec-Int) | ! 16/40 |
| Float accepts integer and float input values, and rejects non-finite values (`float`) | MUST | [§3.5.2](https://spec.graphql.org/September2026/#sec-Float) | ✗ 3/71 |
| Float and an integer a double can't hold exactly: refused, or rounded to the nearest double (`floatPrecision`). rounded to the nearest double: 1. Observed: rounded to the nearest double 1 | INFO | [§3.5.2](https://spec.graphql.org/September2026/#sec-Float) | ✓ 1 |
| String accepts only string input values (`string`) | MUST | [§3.5.3](https://spec.graphql.org/September2026/#sec-String) | ✗ 40/54 |
| A string literal's escapes and block string indentation decode to its Unicode text (`stringValue`) | MUST | [§2.10.4](https://spec.graphql.org/September2026/#sec-String-Value) | ✗ 3/21 |
| Descriptions and comments in an executable document don't change the response (`descriptionsInert`) | MUST | [§2.2](https://spec.graphql.org/September2026/#sec-Descriptions) | ✗ 8/15 (all since September 2025) |
| Arguments and input object fields in another order mean the same (`syntacticOrder`) | MUST | [§2.7](https://spec.graphql.org/September2026/#sec-Language.Arguments) [§2.10.8](https://spec.graphql.org/September2026/#sec-Input-Object-Values) | ✓ 7 |
| Boolean accepts only boolean input values (`boolean`) | MUST | [§3.5.4](https://spec.graphql.org/September2026/#sec-Boolean) | ✗ 44/51 |
| String and integer input values are coerced to ID strings (`idCoerced`) | SHOULD | [§3.5.5](https://spec.graphql.org/September2026/#sec-ID) | ✓ 27 |
| ID rejects input values other than strings and integers (`id`) | MUST | [§3.5.5](https://spec.graphql.org/September2026/#sec-ID) | ✗ 30/31 |
| Enums accept their own values, and reject string literals and unknown values (`enum`) | MUST | [§3.9](https://spec.graphql.org/September2026/#sec-Enums) | ✗ 1/99 |
| Input objects: an object of defined fields, required fields, variables in fields (`inputObject`) | MUST | [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects) [§3.12](https://spec.graphql.org/September2026/#sec-Non-Null) | ✗ 11/239 |
| An omitted input field gets its default value (`inputFieldDefaults`) | SHOULD | [§3.10](https://spec.graphql.org/September2026/#sec-Input-Objects) | ! 2/52 (all since September 2025) |
| OneOf input objects take exactly one non-null field (`oneOf`) | MUST | [§3.10.1](https://spec.graphql.org/September2026/#sec-OneOf-Input-Objects) | ✓ 10 |
| Lists: each item coerced, a single value wrapped in a list (`list`) | MUST | [§3.11](https://spec.graphql.org/September2026/#sec-List) | ✗ 12/326 |
| Non-Null rejects null (`nonNull`) | MUST | [§3.12](https://spec.graphql.org/September2026/#sec-Non-Null) | ✗ 1/1 (all new in September 2026) |
| CoerceVariableValues: defaults, missing and null values, and failures as request errors (`variables`) | MUST | [§6.1.2](https://spec.graphql.org/September2026/#sec-Coercing-Variable-Values) | ✗ 21/834 (1 since September 2025) |
| CoerceArgumentValues: defaults, missing variables, and null for Non-Null arguments (`arguments`) | MUST | [§6.4.1](https://spec.graphql.org/September2026/#sec-Coercing-Field-Arguments) | ✗ 7/24 |
| A value CoerceArgumentValues can't coerce is a field error, not a request error (`argumentErrorKind`) | SHOULD | [§6.4.1](https://spec.graphql.org/September2026/#sec-Coercing-Field-Arguments) | ! 2/10 |
| An argument error below the root nulls the field's position and propagates (`argumentsBelowRoot`) | MUST | [§6.4.4](https://spec.graphql.org/September2026/#sec-Handling-Execution-Errors) [§6.4.1](https://spec.graphql.org/September2026/#sec-Coercing-Field-Arguments) [§7.1.4](https://spec.graphql.org/September2026/#sec-Response-Position) | ✗ 2/5 |
| CreateSourceEventStream: the source stream's resolver gets the field's coerced arguments (`sourceStream`) | MUST | [§6.2.3.1](https://spec.graphql.org/September2026/#sec-Source-Stream) | ✓ 5 |
| An error while establishing a subscription's source stream is a request error (`sourceStreamError`) | MUST | [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) [§6.2.3.1](https://spec.graphql.org/September2026/#sec-Source-Stream) | ✓ 4 |
| A subscription root field's argument that can't be coerced is a request error (`sourceStreamArguments`) | MUST | [§6.2.3.1](https://spec.graphql.org/September2026/#sec-Source-Stream) [§6.4.1](https://spec.graphql.org/September2026/#sec-Coercing-Field-Arguments) [§7.1.5](https://spec.graphql.org/September2026/#sec-Data) | ✓ 1 |
| Selections only an invalid document has: a missing fragment and an undefined field are skipped, a second subscription root field is a request error (`unvalidatedBranches`) | MUST | [§6.3.2](https://spec.graphql.org/September2026/#sec-Field-Collection) [§6.3.3](https://spec.graphql.org/September2026/#sec-Executing-Collected-Fields) [§6.2.3.1](https://spec.graphql.org/September2026/#sec-Source-Stream) | – needs `unvalidated` |
| GetOperation: the operation operationName names, or the only one, else a request error (`getOperation`) | MUST | [§6.1](https://spec.graphql.org/September2026/#sec-Executing-Requests) | ✓ 25 |
| A document with a type system definition isn't executed (`notExecutable`) | MUST | [§2.3](https://spec.graphql.org/September2026/#sec-Document) | ✓ 6 |
| A document that doesn't parse is a request error (`syntaxError`) | MUST | [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) [§6.1](https://spec.graphql.org/September2026/#sec-Executing-Requests) | ✓ 16 |
| A document with known validation errors fails as a request error, without executing (`invalidNotExecuted`) | MUST | [§6.1.1](https://spec.graphql.org/September2026/#sec-Validating-Requests) | – |
| Only valid documents are executed (`onlyValidExecuted`) | SHOULD | [§6.1.1](https://spec.graphql.org/September2026/#sec-Validating-Requests) [§5](https://spec.graphql.org/September2026/#sec-Validation) | ! 1/811 |
| A valid document isn't rejected at validation (`acceptsValid`) | MUST | [§5](https://spec.graphql.org/September2026/#sec-Validation) | – |
| A request error result has no data entry (`requestErrorNoData`) | MUST | [§7.1.3](https://spec.graphql.org/September2026/#sec-Request-Error-Result) | ✗ 1449/1674 (1 since September 2025, 8 new in September 2026) |
| A request gets a response (`responds`) | MUST | [§7](https://spec.graphql.org/September2026/#sec-Response) | ✗ 39/2142 (20 since September 2025) |
| A field error's path is the field's response path (`fieldErrorPath`) | MUST | [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) [§7.1.4](https://spec.graphql.org/September2026/#sec-Response-Position) | ✓ 37 |
| Every error is a map with a string message (`errorFormat`) | MUST | [§7.1.6](https://spec.graphql.org/September2026/#sec-Errors) | ✓ 2142 |
| errors, when present, is a non-empty list (`errorsList`) | MUST | [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) | ✓ 2142 |
| The response is a map (`resultMap`) | MUST | [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) [§7.1.3](https://spec.graphql.org/September2026/#sec-Request-Error-Result) | ✓ 2142 |
| The result has no entries besides data, errors and extensions (`additionalEntries`) | MUST | [§7.1.8](https://spec.graphql.org/September2026/#sec-Additional-Entries) | ✓ 2142 |
| extensions, when present, is a map (`extensions`) | MUST | [§7.1.7](https://spec.graphql.org/September2026/#sec-Extensions) | ✓ 2142 |
| JSON strings with a lone surrogate: kept as sent, replaced with U+FFFD, or refused (`loneSurrogates`). replaced with U+FFFD: 2. Observed: replaced with U+FFFD 2 | INFO | — | ✓ 2 |
| JSON numbers a double can't hold: read exactly, read as binary64, or refused (`jsonNumbers`) | INFO | — | ✓ 3 |
| A request's extensions with keys of no meaning to the service leave the response as it is (`requestExtensions`). the same answer as without extensions: 3. Observed: the same answer as without extensions 3 | INFO | [§6](https://spec.graphql.org/September2026/#sec-Execution) | ✓ 4 |

- **Basis for `int`:** "When expected as an input type, only integer input values are accepted. All other input values, including strings with numeric content, must raise a request error indicating an incorrect type." What an integer input value is, for JSON, is §3.5's descriptive assertion: numbers "are interpreted as an integer input value if they have an empty fractional part (e.g. 1.0) and otherwise as floating-point input value", which Appendix A counts as a conformance requirement ("descriptive assertions and key words"); the "e.g." is the example, the sentence is not. Accepting an integer input value is CoerceVariableValues' and CoerceArgumentValues' ("If value cannot be coerced ..., raise a request error", otherwise coerce it), algorithm steps Appendix A gives the algorithm's level. October 2021 says the same.
- **Basis for `intRange`:** "If the integer input value represents a value less than -2^31 or greater than or equal to 2^31, a request error should be raised." October 2021 says the same. A literal out of range is also not "coercible" (§5.6.1), so an adapter that validates may refuse it at validation: a request error passes there as well as the reference's field error, and only a resolved value fails.
- **Basis for `float`:** "When expected as an input type, both integer and float input values are accepted. ... All other input values, including strings with numeric content, must raise a request error indicating an incorrect type. If the input value otherwise represents a value not representable by finite IEEE 754 (e.g. NaN, Infinity, or a value outside the available precision), a request error must be raised." October 2021 says the same. A non-finite value such as the literal 1e400 is a MUST failure here; an adapter that validates may refuse that literal at validation (it isn't "coercible", §5.6.1) or at coercion, and only a resolved value fails. A fractional value is kept as its decimal, which the vectors only use with at most 15 significant digits. What "outside the available precision" covers is floatPrecision's.
- **Basis for `floatPrecision`:** The sentence says a request error "must be raised" for "a value outside the available precision", a term the spec doesn't define. A fraction such as 0.1 has no exact double either, and every implementation rounds it, so the term can't mean every value without an exact double. Coercion.tla's default reading refuses an integer input value a double can't hold exactly (99999999999999999999, 2^53 + 1); its floatRounded switch rounds it to the nearest double, as 0.1 is. Both readings pass, and the report records which happened. It never fails the run. October 2021 says the same.
- **Basis for `string`:** "When expected as an input type, only valid Unicode string input values are accepted. All other input values must raise a request error indicating an incorrect type." October 2021 says the same. A JSON string with a lone surrogate is graded under loneSurrogates, not here, since the spec doesn't define a valid Unicode string.
- **Basis for `stringValue`:** §2.10.4's Static Semantics give a StringValue's Unicode text: each escape sequence's value, and for a block string BlockStringValue(), which removes the common indentation and the leading and trailing blank lines. They have no key word, but they are written as algorithm steps ("Return the Unicode text by ..."), which Appendix A gives the level of the algorithm, they define the value §3.5.3 then accepts, and September 2025 and September 2026 say "Errors encountered during this evaluation ... must result in a parsing error". The vectors use only escapes and block strings whose text is the same in every edition (no braced or surrogate pair escapes). One holds a raw U+1F600, which October 2021's SourceCharacter (U+0009, U+000A, U+000D, U+0020–U+FFFF), read literally as the parse area reads it, leaves out: that vector relies on September 2025's SourceCharacter, any Unicode scalar value (`since`). Expected texts come from Lexer.tla.
- **Basis for `descriptionsInert`:** §2.2: "Descriptions in GraphQL executable documents are purely for documentation purposes. They MUST NOT affect the execution, validation, or response of a GraphQL document. It is safe to remove all descriptions and comments from executable documents without changing their behavior or results." §6 repeats it in a Note. Each vector is the twin of the same request without the descriptions and comments, and must get the same answer; it rests on that twin (restsOn), so where both fail the same way the failure counts where the twin's does. Descriptions on operations and variable definitions are new in September 2025 (`since`): October 2021's grammar has no Description there, so it can't read those documents. Comments (§2.1.3) are in every edition.
- **Basis for `syntacticOrder`:** §2.7: "Arguments may be provided in any syntactic order and maintain identical semantic meaning." §2.10.8: "Input object fields may be provided in any syntactic order and maintain identical semantic meaning." Descriptive assertions, which Appendix A counts as requirements. A JSON variable's map is an unordered map (§3.10), so the order of its keys doesn't matter either. Each vector is the twin of the same request in the written order, and rests on it (restsOn). October 2021 says the same.
- **Basis for `boolean`:** "When expected as an input type, only boolean input values are accepted. All other input values must raise a request error indicating an incorrect type." October 2021 says the same.
- **Basis for `idCoerced`:** "any string (such as \"4\") or integer (such as 4 or -4) input value should be coerced to ID". The format of an ID made from an integer is the service's: any string that writes the integer's exact value passes, such as "1e+21" for 10^21.
- **Basis for `id`:** "Any other input value, including float input values (such as 4.0), must raise a request error indicating an incorrect type." October 2021 says the same.
- **Basis for `enum`:** "GraphQL string literals must not be accepted as an enum input and instead raise a request error." For JSON variables, "strings may be interpreted as the enum input value with the same name": a MAY, so taking the string and rejecting it both pass. An unknown value or another kind of input value can't be coerced, so CoerceVariableValues and CoerceArgumentValues raise an error (the vectors also cite §6.1.2 or §6.4.1). October 2021 says the same.
- **Basis for `inputObject`:** §3.10: "The value for an input object should be an input object literal or an unordered map supplied by a variable, otherwise a request error must be raised. In either case, the input object literal or unordered map must not contain any entries with names not defined by a field of this input object type, otherwise a request error must be raised." and "If a variable is provided for an input object field, the runtime value of that variable must be used. If the runtime value is null and the field type is non-null, an execution error must be raised." A missing Non-Null field: §3.10 says "If no default value is provided and the input object field's type is non-null, an error should be raised", but §3.12 says "If an argument or input-object field of a Non-Null type is not provided, is provided with the literal value null, or is provided with a variable that was either not provided a value at runtime, or was provided the value null, then a request error must be raised." Both are normative prose about the same case; §3.12's is the stronger and more specific requirement, and accepting such a value would break it, so the check is a MUST and those vectors cite §3.12. Field defaults are a "should", graded by inputFieldDefaults. October 2021 says the same ("a field error must be raised" for the null variable).
- **Basis for `inputFieldDefaults`:** "If no value is provided for a defined input object field and that field definition provides a default value, the result of coercing the default value ... should be used." The SHOULD applies to each field: a result that is right except that it leaves out some or all of such defaults fails this check, not inputObject.
- **Basis for `oneOf`:** §3.10.1, new in September 2025 (October 2021 has no OneOf Input Objects): the value "must contain exactly one entry and that entry must not be null or the null literal, otherwise a request error must be raised", and "The resulting coerced map must contain exactly one entry and the value for that entry must not be null, otherwise an execution error must be raised." The vectors are §3.10.1's table of examples and a few more, on a schema of their own (the vectors' `schema: "oneOf"`), all `since` September 2025. September 2026 says the same.
- **Basis for `list`:** An item that isn't a list, where the item type is a list, is coerced as a list of one: "list values are accepted only when each item in the list can be accepted by the list's item type", and a value that is "not a list" is accepted by a list type as "a list of size one". That prose is the same in every edition. October 2021's table of examples says "Error: Incorrect item value" for [1, 2, 3] as [[Int]], but examples are non-normative ("Examples in this document are non-normative"), and the tables of September 2025 and September 2026 give [[1], [2], [3]]. So these vectors carry no `since`, and the table's answer fails this check under a finding of its own. A list item that is a variable whose runtime value isn't a list, where the item type is a list ([$x, [$x]] for [[Int]] with $x: Int), is only in an invalid document (§5.8.5), and the spec doesn't say whether the value is used as it is (§6.4.1's Note: variable values are already coerced) or wrapped as "a list of size one": both pass, for adapters that execute invalid documents.
- **Basis for `nonNull`:** "If an argument or input-object field of a Non-Null type is not provided, is provided with the literal value null, or is provided with a variable that was either not provided a value at runtime, or was provided the value null, then a request error must be raised." October 2021 says the same.
- **Basis for `variables`:** The algorithm's steps: a missing variable with a default gets "the result of coercing defaultValue"; "Otherwise if variableType is a Non-Nullable type, and either hasValue is not true or value is null, raise a request error"; a null value is kept; "If value cannot be coerced according to the input coercion rules of variableType, raise a request error." Algorithm steps have the algorithm's level (Appendix A). September 2025 says the same. October 2021 adds the default as it is (see the vectors `since` September 2025) and otherwise says the same.
- **Basis for `arguments`:** The algorithm's steps: an argument with no value, or whose variable has no runtime value, gets "the result of coercing defaultValue" if it has one; an explicit null is kept; a variable's value is used as it is; a literal is coerced; "Otherwise if argumentType is a Non-Nullable type, and either hasValue is not true or value is null, raise an execution error." Algorithm steps have the algorithm's level (Appendix A). Whether a failure is an execution error or a request error is argumentErrorKind's. September 2025 says the same. October 2021 adds the default as it is (see the vectors `since` September 2025) and otherwise says the same.
- **Basis for `argumentErrorKind`:** The input coercion rules call the failure a request error (§3.5: "If an input value does not match a coercion rule, a request error must be raised"; §3.12: "... then a request error must be raised"). CoerceArgumentValues says "raise an execution error", and September 2026 settles the conflict with a SHOULD (September 2025 has the same sentence): "Any request error raised as a result of input coercion during CoerceArgumentValues() should be treated instead as an execution error." So a request error where the reference gives a field error fails only this SHOULD. Except where §3.10 or §3.10.1 itself says "an execution error must be raised" (a variable in an input object literal whose runtime value is null at a Non-Null field; a OneOf literal whose one entry is a variable with a null or no runtime value): those vectors (`executionErrorRequired`) fail their own check. October 2021's CoerceArgumentValues says "raise a field error" and has no such sentence, while its §3.5 and §3.12 still say a request error must be raised; the kit takes the weaker reading there too, the same SHOULD.
- **Basis for `argumentsBelowRoot`:** For the vectors with fields below the root (capability nested-fields). CoerceArgumentValues raises an execution error, and §6.4.4: "If an execution error is raised while resolving a field (either directly or nested inside any lists), it is handled as though the response position at which the error occurred resolved to null, and the error must be added to the errors list"; "Since Non-Null response positions cannot be null, execution errors are propagated to be handled by the parent response position"; "If a List type wraps a Non-Null type, and one of the response position elements of that list resolves to null, then the entire list response position must resolve to null." So the data must show null at the field's position, or at its nearest nullable parent's, one error per position (each item of a list is one), and no call of the field's resolver. Where every position up to the root is Non-Null, "the data entry in the execution result should be null": the reference gives null there, and no other data can be right. The error's path is fieldErrorPath's (§7.1.6), including list indices and aliases (§7.1.4: "If a path segment is associated with an aliased field it must use the aliased name"). A value below the root is graded the same way: one call at each position, with the coerced arguments. October 2021 says the same with "field error".
- **Basis for `sourceStream`:** For the subscription vectors (capability subscription-source). CreateSourceEventStream: "Let fieldName be the name of the first entry in fields. Note: This value is unaffected if an alias is used.", "Let argumentValues be the result of CoerceArgumentValues(subscriptionType, field, variableValues)", and ResolveFieldEventStream: "Return the result of calling resolver, providing rootValue and argumentValues." Then each event executes the root selection set (§6.2.3.2), so the response stream's first result holds the field under its response name, and the field's resolver gets the same coerced arguments. Algorithm steps have the algorithm's level (Appendix A). October 2021 says the same.
- **Basis for `sourceStreamError`:** New in September 2026. §6.2: "Operation execution begins when the execution algorithm for the operation type is invoked: ExecuteQuery() for query operations, ExecuteMutation() for mutation operations, and Subscribe() for subscription operations." ExecuteRequest runs CreateSourceEventStream before Subscribe, and §7.1.5: "If an error was raised before operation execution begins, the response must be a request error result which will result in no response data." §7.1.6 lists among request errors a "failure to establish a source event stream for a subscription operation", and §6.2.3.1's Note says "an error raised here will be a request error". The vectors have the source stream's resolver raise (`subscribe: "raise"`). September 2025 runs CreateSourceEventStream inside Subscribe and doesn't list it, so these vectors have `since` September 2026.
- **Basis for `sourceStreamArguments`:** §6.2: "Operation execution begins when the execution algorithm for the operation type is invoked: ExecuteQuery() for query operations, ExecuteMutation() for mutation operations, and Subscribe() for subscription operations." ExecuteRequest runs CreateSourceEventStream before Subscribe, and CreateSourceEventStream: "Let argumentValues be the result of CoerceArgumentValues(subscriptionType, field, variableValues)." §7.1.5: "If an error was raised before operation execution begins, the response must be a request error result which will result in no response data." So an argument of the subscription root field that can't be coerced must give a request error result. CoerceArgumentValues calls the error it raises an execution error, and §6.4.1 says "Any request error raised as a result of input coercion during CoerceArgumentValues() should be treated instead as an execution error"; those name the error, while §7.1.5 says what the response must be when it is raised before operation execution, and §6.2.3.1's Note agrees: "The call to CreateSourceEventStream() occurs before operation execution begins, and thus an error raised here will be a request error." An execution error (a result with data) fails here, and accepting the value fails the type's own check (`nonNull`, `int`). September 2025 runs CreateSourceEventStream inside Subscribe, after operation execution begins, so these vectors have `since` September 2026.
- **Basis for `unvalidatedBranches`:** For adapters with `unvalidated` (others get these as invalid documents, under invalidNotExecuted or onlyValidExecuted). CollectFields: "If no such fragment exists, continue with the next selection in selectionSet." ExecuteCollectedFields: "Let fieldType be the return type defined for the field fieldName of objectType. If fieldType is defined: ...", so a field the type doesn't define has no entry in the result. CreateSourceEventStream: "If collectedFieldsMap does not have exactly one entry, raise a request error." CollectFields collects every field selection, defined or not. Algorithm steps have the algorithm's level (Appendix A). October 2021 has the same steps.
- **Basis for `getOperation`:** GetOperation: "If operationName is null: If document contains exactly one operation. Return the Operation contained in the document. Otherwise raise a request error requiring operationName." and "Let operation be the Operation named operationName in document. If operation was not found, raise a request error." Includes a mutation running on the mutation root type, and only the selected operation's variables being coerced. Algorithm steps have the algorithm's level (Appendix A). October 2021 says the same.
- **Basis for `notExecutable`:** §2.3: "Documents are only executable by a GraphQL service if they are ExecutableDocument and contain at least one OperationDefinition. A Document which contains TypeSystemDefinitionOrExtension must not be executed; GraphQL execution services which receive a Document containing these should return a descriptive error." and "GraphQL services which only seek to execute GraphQL requests and not construct a new GraphQL schema may choose to only permit ExecutableDocument." So the answer is a request error, whether the service refuses the document at parsing, at validation (§5.1.1 Executable Definitions) or before executing it, and even where it also holds an operation that would run. Graded under this check for every adapter, validating or not: the sentence doesn't depend on validation. October 2021 says the same.
- **Basis for `syntaxError`:** §6.1: "To execute a request, the executor must have a parsed Document". §7.1.6: "Typically raised before operation execution begins, a request error may occur due to a parse grammar or validation error in the Document", and "If a request error is raised, the response must be a request error result. The data entry in this map must not be present, the errors entry must include the error, and request execution should be halted." Parser.tla says which documents don't parse. Graded for every adapter, validating or not: no answer but a request error passes. October 2021 says the same (§7.1.2: a request error "is raised before execution begins", and the data entry "must not be present").
- **Basis for `invalidNotExecuted`:** "If validation errors are known, they should be reported in the list of \"errors\" in the response and the request must fail without operation execution." The MUST holds only where the errors are known: graded for adapters without `unvalidated` that claim `validate`, on vectors Validation.tla rejects and the implementation's own validator (asked through the validate area) rejects too. A request error, no data, no resolver called. October 2021 says the same.
- **Basis for `onlyValidExecuted`:** "only operations from documents which pass all validation rules should be executed" (§6.1.1), and "execution should only occur for valid requests" (§5). Graded for adapters without `unvalidated`, on vectors Validation.tla rejects whose errors the implementation's validator doesn't report (it accepts the document in the validate area, or the adapter doesn't claim validate, so the kit can't tell). Such a document is a validation rule the implementation misses, which the validate area grades at MUST; executing it is only this SHOULD. October 2021 says the same.
- **Basis for `acceptsValid`:** As the validate area's check of the same name: a document that breaks no validation rule is valid, and must not be refused as invalid. Graded for adapters without `unvalidated` that claim `validate`: a valid vector answered with a request error whose document the implementation's own validator rejects (asked through the validate area) fails here, not under the coercion rule the vector is about, whether or not the reference's answer is also a request error.
- **Basis for `requestErrorNoData`:** September 2026 and September 2025, §7.1.3: "The request error result map must not contain an entry with key {"data"}." October 2021, §7.1: "If the request failed before execution, due to a syntax error, missing information, or validation error, this entry must not be present." and §7.1.2: "If a request error is raised, execution does not begin and the data entry in the response must not be present." Its §7.1.1 also says "should not be present", but the two MUST sentences are the ones about request errors, so the check is a MUST in every edition. A request error with "data": null is still a request error for the vector's own check, and fails this one.
- **Basis for `responds`:** "When a GraphQL service receives a request, it must return a well-formed response." October 2021 says the same. The adapter answers with an `error` when the implementation produced no response at all, for example because it threw. Execution's check of the same name grades the same sentence. No response says nothing about the coercion rule the vector is about, so it always counts here, whatever the reference's answer; the finding names that rule as a hint. Every vector exercises this check.
- **Basis for `fieldErrorPath`:** §7.1.6: an error that "can be associated to a particular field in the GraphQL result ... must contain an entry with the key {"path"} with a response path which describes the response position which raised the error". §7.1.4: a response path names response positions, not arguments. A result whose data holds the field as null, with one error and no resolver call, is a field error whatever its path. If that is the answer the vector expects, a path other than the field's fails this check. Every vector that accepts a field error exercises it. October 2021's §7.1.2 keeps the must: the error "must contain an entry with the key path that details the path of the response field which experienced the error". Its shoulds there are about the path's form ("should be a list of path segments", indices "should be 0-indexed integers"), not about which field it names, so a path to the argument (`["v"]`) fails a MUST in every edition. September 2025 and September 2026 have the same §7.1.6 sentence.
- **Basis for `errorFormat`:** "Every error must contain an entry with the key {"message"} with a string description of the error", and each error "must be a map" (§7.1.1, §7.1.3). October 2021 says the same ("each error is a map", "Every error must contain an entry with the key message"). A result whose errors aren't all maps with a string message, such as [null], or a field error with only a path, fails this check wherever its outcome would otherwise match. Every vector exercises it.
- **Basis for `errorsList`:** The same check as execution's. September 2026, §7.1.1: "If any errors are raised during operation execution, the execution result must contain an entry with key {"errors"}. The value of this entry must be a non-empty list ... If the request completed without raising any errors, this entry must not be present." October 2021, §7.1: "If the request raised any errors, the response map must contain an entry with key errors. ... If the request completed without raising any errors, this entry must not be present." Its §7.1.2 also says "should not be present", but the §7.1 MUST is the sentence about the entry, so the check is a MUST in every edition, as in execution. September 2025 says the same ("If execution raised any errors ..."). A value with "errors": [] is still a value for the vector's own check, and fails this one. Every vector exercises it.
- **Basis for `resultMap`:** §7.1.1: "An execution result must be a map." §7.1.3: "A request error result must be a map." A result whose `response` is a list, a string, a number, a boolean or null fails here, rather than being taken as an adapter that doesn't follow the result format. Execution's check of the same name. October 2021, §7.1: "A response to a GraphQL request must be a map." Every vector exercises it.
- **Basis for `additionalEntries`:** "To ensure future changes to the protocol do not break existing services and clients, the execution result and request error result maps must not contain any entries other than those described above." October 2021, §7.1: "the top level response map must not contain any entries other than the three described above". The same check as execution's, applied to every result here, request errors included. A result with another top-level entry is still classified, and fails this check wherever its outcome would otherwise pass. Every vector exercises it.
- **Basis for `extensions`:** "The \"extensions\" entry in an execution result or request error result, if set, must have a map as its value." October 2021, §7.1: "This entry, if set, must have a map as its value." The same check as execution's. A result whose top-level extensions isn't a map is still classified, and fails this check wherever its outcome would otherwise pass. Every vector exercises it.
- **Basis for `loneSurrogates`:** §3.5.3 accepts "only valid Unicode string input values" without defining one, and calls a String "a sequence of Unicode code points", which a lone surrogate is. §3.5.5 says nothing about Unicode. RFC 8259 §8.2 calls the behaviour of software that receives such a string unpredictable. Coercion.tla refuses it, but the check also passes the value kept as sent and the value with U+FFFD, and records which happened. It never fails the run.
- **Basis for `jsonNumbers`:** Not a GraphQL rule: RFC 8259 §6 lets a JSON parser limit the range and precision of numbers. Vectors whose answer depends on that count here, never against Float or ID, unless the adapter claims exact-numbers.
- **Basis for `requestExtensions`:** §6: a request's "extensions (optional): A map reserved for implementation-specific additional information." and "If present, extensions must be a map, but there are no additional restrictions on its contents." The spec gives the entries no meaning and lets an implementation give them one, so it doesn't require a service to ignore them. The vectors (capability request-extensions) send keys under a prefix no service uses, each the twin of the same request without extensions, and record whether the answer stays the same. It never fails the run. October 2021 has no request extensions.

## Introspect

- **Capabilities:** coerce, custom-directives, deferred-items, introspect, invalid-results, mutation, nested-fields, parent-values, parse, parse-sdl, request-extensions, scalar-results, subscription, subscription-source, subscription-stream, uncoercible-results
- **Cases:** 64 submitted, 64 distinct, 25 malformed
- **Vectors:** 64 of 71 graded (not graded: 7 new in September 2026 (September 2025 profile))
- **Profile:** the September 2025 edition's introspection types. September 2026's introspection query was rejected ("Cannot query field "description" on type "__Schema". Did you mean "subscriptionType"?"); so was September 2025's ("Cannot query field "description" on type "__Schema". Did you mean "subscriptionType"?"). The introspection types lack __Schema.description, __Type.specifiedByURL, __Type.isOneOf, __InputValue.isDeprecated, __InputValue.deprecationReason, __Directive.isRepeatable, __Type.inputFields(includeDeprecated:), __Field.args(includeDeprecated:) and __Directive.args(includeDeprecated:), so this run asks September 2025's query without them, grades against September 2025, and counts what they lack once, under builtinDefinitions.
- **Vectors relying on rules after October 2021:** since September 2025, 16 of 19 vectors failing
- **Adapter problems:** none
- **Checker self-test:** passed (353 negative controls)
- **Run:** kit 0625b35d64dd, 2026-11-16, strict

### Findings

<a id="introspect-finding-1"></a>

#### 1. `executes`: the schema didn't build, the query failed, or the result doesn't have the fields the query selects

25 cases, in `inputDeprecation` (4), `inputDeprecationAll` (4), `rich` (3), `interfaces` (3), `defaults` (3), `descriptions` (3), `directiveArgDeprecation` (2), `locations` (2), `wrappers` (1). 10 of them rely on grammar or rules introduced in September 2025, not in October 2021.

- The query executes, and its result has exactly the fields it selects, nulls included (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))

The shortest case, from `rich.inc`:

```
problem:  the response has errors: graphql-go can't build the schema: Syntax Error GraphQL (1:1) Expected "schema", found BlockString "The schema"

1: """The schema""" schema { query: Q mutation: M }
   ^
2: "The root" type Q { a("An argument" x: Int = 3, y: [Int] = 1, z: In = {b: 2}): U, old: String @deprecated(reason: "gone"), d: D
input:    """The schema""" schema { query: Q mutation: M } "The root" type Q { a("An argument" x: Int = 3, y: [Int] = 1, z: In = {b: 2}): U, old: String @deprecated(reason: "gone"), d: Date } type M { m(p: Pick!): Boolean } type A { a: Int } type B { b: Int } union U = B | A enum E { X "Why" Y @deprecated } input In { a: Int = 1, b: Int, e: E = Y, old: String } input Pick { id: ID, name: String } scalar Date "Labels a field" directive @label(v: String, w: Int = 2) repeatable on FIELD_DEFINITION | QUERY  (the introspection query, September 2025 profile; includeDeprecated: true)
response: {"response":{"errors":[{"message":"graphql-go can't build the schema: Syntax Error GraphQL (1:1) Expected \"schema\", found BlockString \"The schema\"\n\n1: \"\"\"The schema\"\"\" schema { query: Q mutation: M }\n   ^\n2: \"The root\" type Q { a(\"An argument\" x: Int = 3, y: [Int] = 1, z: In = {b: 2}): U, old: String @deprecated(reason: \"gone\"), d: Date }\n"}]}}
expected: a well-formed execution result with exactly the fields the query selects, and no errors
```

<a id="introspect-finding-2"></a>

#### 2. `builtinDefinitions`, `builtinNullability`: the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __DirectiveLocation isn't as September 2025 defines it (enumValues); the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

4 cases, in `minimal` (1), `deprecation` (1), `roots` (1), `unreferenced` (1).

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))

The shortest case, from `minimal.defaults`:

```
problem:  enumValues at __DirectiveLocation, inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), locations at @deprecated
input:    type Query { a: Int }  (the introspection query, September 2025 profile; includeDeprecated: the default)
response: {"args":[{"defaultValue":"\"No longer supported\"","description":"Explains why this element was deprecated, usually also including a suggestion for how to access supported similar data. Formattedin [Markdown](https://daringfireball.net/projects/markdown/).","name":"reason","type":{"kind":"SCALAR","name":"String","ofType":null}}],"description":"Marks an element of a GraphQL schema as no longer supported.","locations":["FIELD_DEFINITION","ENUM_VALUE"],"name":"deprecated"}
expected: {"name":"deprecated","description":null,"isRepeatable":false,"locations":["FIELD_DEFINITION","ARGUMENT_DEFINITION","INPUT_FIELD_DEFINITION","ENUM_VALUE"],"args":[{"name":"reason","description":null,"type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"SCALAR","name":"String","ofType":null}},"defaultValue":"\"No longer supported\"","isDeprecated":false,"deprecationReason":null}]}
```

<a id="introspect-finding-3"></a>

#### 3. `builtinAdditions`, `builtinDefinitions`, `builtinNullability`: the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Directive has a field September 2025 doesn't define; the built-in __DirectiveLocation isn't as September 2025 defines it (enumValues); the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

3 cases, in `minimal` (1), `roots` (1), `unreferenced` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))

The shortest case, from `minimal.inc`:

```
problem:  added:fields at __Directive, enumValues at __DirectiveLocation, inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), locations at @deprecated
input:    type Query { a: Int }  (the introspection query, September 2025 profile; includeDeprecated: true)
response: {"args":[{"defaultValue":"\"No longer supported\"","description":"Explains why this element was deprecated, usually also including a suggestion for how to access supported similar data. Formattedin [Markdown](https://daringfireball.net/projects/markdown/).","name":"reason","type":{"kind":"SCALAR","name":"String","ofType":null}}],"description":"Marks an element of a GraphQL schema as no longer supported.","locations":["FIELD_DEFINITION","ENUM_VALUE"],"name":"deprecated"}
expected: {"name":"deprecated","description":null,"isRepeatable":false,"locations":["FIELD_DEFINITION","ARGUMENT_DEFINITION","INPUT_FIELD_DEFINITION","ENUM_VALUE"],"args":[{"name":"reason","description":null,"type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"SCALAR","name":"String","ofType":null}},"defaultValue":"\"No longer supported\"","isDeprecated":false,"deprecationReason":null}]}
```

<a id="introspect-finding-4"></a>

#### 4. `builtinDirectives`: rejects a schema that applies @specifiedBy, so doesn't provide it

3 cases, in `scalars` (3).

- @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (SHOULD, [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) [§3.13.1](https://spec.graphql.org/September2026/#sec--skip) [§3.13.2](https://spec.graphql.org/September2026/#sec--include) [§3.13.4](https://spec.graphql.org/September2026/#sec--specifiedBy) [§3.13.5](https://spec.graphql.org/September2026/#sec--oneOf))

The shortest case, from `scalars.inc`:

```
problem:  unsupportedDirective at @specifiedBy
input:    "A date" scalar Date @specifiedBy(url: "https://example.com/date") scalar Plain scalar Odd @specifiedBy(url: "https://example.com/a?b=c&d=%20#x") type Query { d: Date, p: Plain, o: Odd }  (the introspection query, September 2025 profile; includeDeprecated: true)
response: {"errors":[{"message":"graphql-go can't build the schema: graphql-go can't express @specifiedBy on the scalar Date"}]}
expected: {"name":"specifiedBy","description":null,"isRepeatable":false,"locations":["SCALAR"],"args":[{"name":"url","description":null,"type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"SCALAR","name":"String","ofType":null}},"defaultValue":null,"isDeprecated":false,"deprecationReason":null}]}
```

<a id="introspect-finding-5"></a>

#### 5. `builtinDirectives`: rejects a schema that applies @oneOf, so doesn't provide it (since September 2025)

3 cases, in `oneOf` (3). All rely on grammar or rules introduced in September 2025, not in October 2021.

- @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (SHOULD, [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) [§3.13.1](https://spec.graphql.org/September2026/#sec--skip) [§3.13.2](https://spec.graphql.org/September2026/#sec--include) [§3.13.4](https://spec.graphql.org/September2026/#sec--specifiedBy) [§3.13.5](https://spec.graphql.org/September2026/#sec--oneOf))

The shortest case, from `oneOf.inc`:

```
problem:  unsupportedDirective at @oneOf
input:    [since September 2025] input Pick @oneOf { id: ID, name: String } input Plain { x: Int! } type Query { a(p: Pick, q: Plain): Int }  (the introspection query, September 2025 profile; includeDeprecated: true)
response: {"errors":[{"message":"graphql-go can't build the schema: graphql-go can't express @oneOf on the input object Pick"}]}
expected: {"name":"oneOf","description":null,"isRepeatable":false,"locations":["INPUT_OBJECT"],"args":[]}
```

<a id="introspect-finding-6"></a>

#### 6. `builtinAdditions`, `builtinDefinitions`, `builtinNullability`, `order`, `typeKinds`: each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included: differs from Introspection.tla; fields, arguments, enum values, directives, members and interfaces come in source order: differs from Introspection.tla; the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Directive has a field September 2025 doesn't define; the built-in __DirectiveLocation isn't as September 2025 defines it (enumValues); the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

2 cases, in `order` (1), `interfaceDeprecation` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- Fields, arguments, enum values, directives, members and interfaces come in source order (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))
- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type))

The shortest case, from `order.inc`:

```
problem:  added:fields at __Directive, enumValues at __DirectiveLocation, inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), kind at I1, kind at I2, locations at @deprecated, order at Query
input:    type Query { z: Int, a: Int, m(c: Int, b: Int, a: Int): O, u: U, e: E, n(v: In): Int } interface I1 { x: Int } interface I2 { x: Int } type O implements I2 & I1 { x: Int } type A2 { a: Int } type B2 { b: Int } union U = B2 | A2 enum E { Z A M } input In { z: Int, a: Int, m: Int }  (the introspection query, September 2025 profile; includeDeprecated: true)
response: {"description":"","enumValues":null,"fields":[{"args":[],"deprecationReason":null,"description":"","isDeprecated":false,"name":"x","type":{"kind":"SCALAR","name":"Int","ofType":null}}],"inputFields":null,"interfaces":null,"kind":"INTERFACE","name":"I1","possibleTypes":[{"kind":"OBJECT","name":"O","ofType":null}]}
expected: {"kind":"INTERFACE","name":"I1","description":null,"specifiedByURL":null,"isOneOf":null,"fields":[{"name":"x","description":null,"args":[],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":[{"kind":"OBJECT","name":"O","ofType":null}]}
```

<a id="introspect-finding-7"></a>

#### 7. `builtinDefinitions`, `builtinNullability`, `order`, `typeKinds`: each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included: differs from Introspection.tla; fields, arguments, enum values, directives, members and interfaces come in source order: differs from Introspection.tla; the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __DirectiveLocation isn't as September 2025 defines it (enumValues); the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

2 cases, in `order` (1), `interfaceDeprecation` (1).

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- Fields, arguments, enum values, directives, members and interfaces come in source order (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))
- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type))

The shortest case, from `order.defaults`:

```
problem:  enumValues at __DirectiveLocation, inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), kind at I1, kind at I2, locations at @deprecated, order at In, order at Query
input:    type Query { z: Int, a: Int, m(c: Int, b: Int, a: Int): O, u: U, e: E, n(v: In): Int } interface I1 { x: Int } interface I2 { x: Int } type O implements I2 & I1 { x: Int } type A2 { a: Int } type B2 { b: Int } union U = B2 | A2 enum E { Z A M } input In { z: Int, a: Int, m: Int }  (the introspection query, September 2025 profile; includeDeprecated: the default)
response: {"description":"","enumValues":null,"fields":[{"args":[],"deprecationReason":null,"description":"","isDeprecated":false,"name":"x","type":{"kind":"SCALAR","name":"Int","ofType":null}}],"inputFields":null,"interfaces":null,"kind":"INTERFACE","name":"I1","possibleTypes":[{"kind":"OBJECT","name":"O","ofType":null}]}
expected: {"kind":"INTERFACE","name":"I1","description":null,"specifiedByURL":null,"isOneOf":null,"fields":[{"name":"x","description":null,"args":[],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":[{"kind":"OBJECT","name":"O","ofType":null}]}
```

<a id="introspect-finding-8"></a>

#### 8. `order`: fields, arguments, enum values, directives, members and interfaces come in source order: differs from Introspection.tla

2 cases, in `deprecation` (1), `order` (1). All rely on grammar or rules introduced in September 2025, not in October 2021.

- Fields, arguments, enum values, directives, members and interfaces come in source order (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))

The shortest case, from `deprecation.lookup`:

```
problem:  order at E
input:    type Query { a: Int @deprecated, b(y: Int): Int @deprecated(reason: "Use c"), c: E, old: Old } type Old { x: Int @deprecated(reason: "All of it") } enum E { A B @deprecated(reason: "Gone") }  (__type(name:) for Query, Old, E, Unknown, September 2025 profile; includeDeprecated: true)
response: {"__type(name: \"E\")":{"description":"","enumValues":[{"deprecationReason":"Gone","description":"","isDeprecated":true,"name":"B"},{"deprecationReason":null,"description":"","isDeprecated":false,"name":"A"}],"fields":null,"inputFields":null,"interfaces":null,"kind":"ENUM","name":"E","possibleTypes":null}}
expected: {"__type(name: \"E\")":{"kind":"ENUM","name":"E","description":null,"specifiedByURL":null,"isOneOf":null,"fields":null,"inputFields":null,"interfaces":null,"enumValues":[{"name":"A","description":null,"isDeprecated":false,"deprecationReason":null},{"name":"B","description":null,"isDeprecated":true,"deprecationReason":"Gone"}],"possibleTypes":null}}
```

<a id="introspect-finding-9"></a>

#### 9. `typeKinds`: each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included: differs from Introspection.tla

2 cases, in `interfaceDeprecation` (2).

- Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (MUST, [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type))

The shortest case, from `interfaceDeprecation.lookup`:

```
problem:  kind at Gone, kind at Named
input:    interface Named { id: ID, name: String @deprecated(reason: "Use id") } interface Gone { old: Int @deprecated } type Thing implements Named & Gone { id: ID, name: String, old: Int @deprecated(reason: "Also gone") } enum Mood { HAPPY @deprecated, SAD @deprecated(reason: "Cheer up") } type Query { thing: Thing, named: Named, gone: Gone, mood: Mood }  (__type(name:) for Named, Gone, Thing, Mood, Unknown, September 2025 profile; includeDeprecated: true)
response: {"__type(name: \"Named\")":{"description":"","enumValues":null,"fields":[{"args":[],"deprecationReason":null,"description":"","isDeprecated":false,"name":"id","type":{"kind":"SCALAR","name":"ID","ofType":null}},{"args":[],"deprecationReason":"Use id","description":"","isDeprecated":true,"name":"name","type":{"kind":"SCALAR","name":"String","ofType":null}}],"inputFields":null,"interfaces":null,"kind":"INTERFACE","name":"Named","possibleTypes":[{"kind":"OBJECT","name":"Thing","ofType":null}]}}
expected: {"__type(name: \"Named\")":{"kind":"INTERFACE","name":"Named","description":null,"specifiedByURL":null,"isOneOf":null,"fields":[{"name":"id","description":null,"args":[],"type":{"kind":"SCALAR","name":"ID","ofType":null},"isDeprecated":false,"deprecationReason":null},{"name":"name","description":null,"args":[],"type":{"kind":"SCALAR","name":"String","ofType":null},"isDeprecated":true,"deprecationReason":"Use id"}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":[{"kind":"OBJECT","name":"Thing","ofType":null}]}}
```

<a id="introspect-finding-10"></a>

#### 10. `builtinDefinitions`: the introspection types lack __Schema.description, __Type.specifiedByURL, __Type.isOneOf, __InputValue.isDeprecated, __InputValue.deprecationReason, __Directive.isRepeatable, __Type.inputFields(includeDeprecated:), __Field.args(includeDeprecated:) and __Directive.args(includeDeprecated:), so the kit leaves them out of every query, and grades what it can see without them

1 case, in `discovery` (1).

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))

The shortest case, from `discovery`:

```
problem:  __Schema.description, __Type.specifiedByURL, __Type.isOneOf, __InputValue.isDeprecated, __InputValue.deprecationReason, __Directive.isRepeatable, __Type.inputFields(includeDeprecated:), __Field.args(includeDeprecated:), __Directive.args(includeDeprecated:)
input:    the fields of each introspection type, with their arguments (the kit's IntrospectionFields query)
response: {"data":{"a":{"fields":[{"args":[],"name":"directives"},{"args":[],"name":"mutationType"},{"args":[],"name":"queryType"},{"args":[],"name":"subscriptionType"},{"args":[],"name":"types"}]},"b":{"fields":[{"args":[],"name":"description"},{"args":[{"name":"includeDeprecated"}],"name":"enumValues"},{"args":[{"name":"includeDeprecated"}],"name":"fields"},{"args":[],"name":"inputFields"},{"args":[],"name":"interfaces"},{"args":[],"name":"kind"},{"args":[],"name":"name"},{"args":[],"name":"ofType"},{"args":[],"name":"possibleTypes"}]},"c":{"fields":[{"args":[],"name":"args"},{"args":[],"name":"deprecationReason"},{"args":[],"name":"description"},{"args":[],"name":"isDeprecated"},{"args":[],"name":"name"},{"args":[],"name":"type"}]},"d":{"fields":[{"args":[],"name":"defaultValue"},{"args":[],"name":"description"},{"args":[],"name":"name"},{"args":[],"name":"type"}]},"e":{"fields":[{"args":[],"name":"deprecationReason"},{"args":[],"name":"description"},{"args":[],"name":"isDeprecated"},{"args":[],"name":"name"}]},"f":{"fields":[{"args":[],"name":"args"},{"args":[],"name":"description"},{"args":[],"name":"locations"},{"args":[],"name":"name"}]}}}
expected: the fields and arguments September 2025 defines, including __Schema.description, __Type.specifiedByURL, __Type.isOneOf, __InputValue.isDeprecated, __InputValue.deprecationReason, __Directive.isRepeatable, __Type.inputFields(includeDeprecated:), __Field.args(includeDeprecated:) and __Directive.args(includeDeprecated:)
```

<a id="introspect-finding-11"></a>

#### 11. `builtinAdditions`, `builtinDefinitions`, `builtinNullability`, `order`: fields, arguments, enum values, directives, members and interfaces come in source order: differs from Introspection.tla; the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Directive has a field September 2025 doesn't define; the built-in __DirectiveLocation isn't as September 2025 defines it (enumValues); the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

1 case, in `deprecation` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- Fields, arguments, enum values, directives, members and interfaces come in source order (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))

The shortest case, from `deprecation.inc`:

```
problem:  added:fields at __Directive, enumValues at __DirectiveLocation, inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), locations at @deprecated, order at E
input:    type Query { a: Int @deprecated, b(y: Int): Int @deprecated(reason: "Use c"), c: E, old: Old } type Old { x: Int @deprecated(reason: "All of it") } enum E { A B @deprecated(reason: "Gone") }  (the introspection query, September 2025 profile; includeDeprecated: true)
response: {"args":[{"defaultValue":"\"No longer supported\"","description":"Explains why this element was deprecated, usually also including a suggestion for how to access supported similar data. Formattedin [Markdown](https://daringfireball.net/projects/markdown/).","name":"reason","type":{"kind":"SCALAR","name":"String","ofType":null}}],"description":"Marks an element of a GraphQL schema as no longer supported.","locations":["FIELD_DEFINITION","ENUM_VALUE"],"name":"deprecated"}
expected: {"name":"deprecated","description":null,"isRepeatable":false,"locations":["FIELD_DEFINITION","ARGUMENT_DEFINITION","INPUT_FIELD_DEFINITION","ENUM_VALUE"],"args":[{"name":"reason","description":null,"type":{"kind":"NON_NULL","name":null,"ofType":{"kind":"SCALAR","name":"String","ofType":null}},"defaultValue":"\"No longer supported\"","isDeprecated":false,"deprecationReason":null}]}
```

<a id="introspect-finding-12"></a>

#### 12. `builtinAdditions`, `builtinDefinitions`, `builtinNullability`, `builtinScalars`: leaves out Float, a built-in scalar the schema references; the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Directive has a field September 2025 doesn't define; the built-in __DirectiveLocation isn't as September 2025 defines it (enumValues); the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

1 case, in `builtinScalars` (1).

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- types has the built-in scalars the schema references, and no others (MUST, [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type))

The shortest case, from `builtinScalars.inc`:

```
problem:  added:fields at __Directive, builtinScalars at Float, enumValues at __DirectiveLocation, inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), locations at @deprecated
input:    directive @d(f: Float) on FIELD input In { id: ID } type Query { a(i: In): String }  (the introspection query, September 2025 profile; includeDeprecated: true)
response: "no type Float"
expected: {"kind":"SCALAR","name":"Float","description":null,"specifiedByURL":null,"isOneOf":null,"fields":null,"inputFields":null,"interfaces":null,"enumValues":null,"possibleTypes":null}
```

<a id="introspect-finding-13"></a>

#### 13. `builtinDefinitions`, `builtinNullability`, `builtinScalars`: leaves out Float, a built-in scalar the schema references; the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __DirectiveLocation isn't as September 2025 defines it (enumValues); the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

1 case, in `builtinScalars` (1).

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- types has the built-in scalars the schema references, and no others (MUST, [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type))

The shortest case, from `builtinScalars.defaults`:

```
problem:  builtinScalars at Float, enumValues at __DirectiveLocation, inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), locations at @deprecated
input:    directive @d(f: Float) on FIELD input In { id: ID } type Query { a(i: In): String }  (the introspection query, September 2025 profile; includeDeprecated: the default)
response: "no type Float"
expected: {"kind":"SCALAR","name":"Float","description":null,"specifiedByURL":null,"isOneOf":null,"fields":null,"inputFields":null,"interfaces":null,"enumValues":null,"possibleTypes":null}
```

<a id="introspect-finding-14"></a>

#### 14. `builtinAdditions`, `builtinDefinitions`, `builtinNullability`, `defaultValue`, `order`: defaultValue is null for an input value without a default, and otherwise null or an encoding of the default: differs from Introspection.tla; fields, arguments, enum values, directives, members and interfaces come in source order: differs from Introspection.tla; the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Directive has a field September 2025 doesn't define; the built-in __DirectiveLocation isn't as September 2025 defines it (enumValues); the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

1 case, in `printing` (1). All rely on grammar or rules introduced in September 2025, not in October 2021.

- The introspection types have no field, argument, enum value or type the spec doesn't define (INFO, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))
- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- defaultValue is null for an input value without a default, and otherwise null or an encoding of the default (MUST, [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type))
- Fields, arguments, enum values, directives, members and interfaces come in source order (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))

The shortest case, from `printing.inc`:

```
problem:  added:fields at __Directive, defaultValue at In.s, defaultValue at In.t, defaultValue at Query.f(c:), defaultValue at Query.f(i:), defaultValue at Query.f(l:), enumValues at __DirectiveLocation, inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), locations at @deprecated, order at In, order at Query.f
input:    [since September 2025] input In { s: String = "\u0003", t: [String] = ["😀"] } type Query { f(c: String = "\u0000\u0001\t\n\u001F\u007F\u0080\u0085\u009F", e: String = "😀 é", l: [String] = ["\u0002", "😀"], i: In = {s: "\u0004", t: ["\u0005😀"]}): Int }  (the introspection query, September 2025 profile; includeDeprecated: true)
response: {"description":"","enumValues":null,"fields":[{"args":[{"defaultValue":"\"[\\x02 😀]\"","description":"","name":"l","type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"String","ofType":null}}},{"defaultValue":"\"map[s:\\x04 t:[\\x05😀]]\"","description":"","name":"i","type":{"kind":"INPUT_OBJECT","name":"In","ofType":null}},{"defaultValue":"\"\\x00\\x01\\t\\n\\x1f\\x7f\\u0080\\u0085\\u009f\"","description":"","name":"c","type":{"kind":"SCALAR","name":"String","ofType":null}},{"defaultValue":"\"😀 é\"","description":"","name":"e","type":{"kind":"SCALAR","name":"String","ofType":null}}],"deprecationReason":null,"description":"","isDeprecated":false,"name":"f","type":{"kind":"SCALAR","name":"Int","ofType":null}}],"inputFields":null,"interfaces":[],"kind":"OBJECT","name":"Query","possibleTypes":null}
expected: {"kind":"OBJECT","name":"Query","description":null,"specifiedByURL":null,"isOneOf":null,"fields":[{"name":"f","description":null,"args":[{"name":"c","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"\\u0000\\u0001\\t\\n\\u001f\\u007F\\u0080\\u0085\\u009F\"","isDeprecated":false,"deprecationReason":null},{"name":"e","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"😀 é\"","isDeprecated":false,"deprecationReason":null},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"String","ofType":null}},"defaultValue":"[\"\\u0002\", \"😀\"]","isDeprecated":false,"deprecationReason":null},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"In","ofType":null},"defaultValue":"{s: \"\\u0004\", t: [\"\\u0005😀\"]}","isDeprecated":false,"deprecationReason":null}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}
```

<a id="introspect-finding-15"></a>

#### 15. `builtinDefinitions`, `builtinNullability`, `defaultValue`, `order`: defaultValue is null for an input value without a default, and otherwise null or an encoding of the default: differs from Introspection.tla; fields, arguments, enum values, directives, members and interfaces come in source order: differs from Introspection.tla; the built-in @deprecated lacks only locations October 2021 doesn't define (locations); the built-in @deprecated(reason:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __DirectiveLocation isn't as September 2025 defines it (enumValues); the built-in __Type.enumValues(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it; the built-in __Type.fields(includeDeprecated:) has September 2025's type, but not its Non-Null wrapping; it is as October 2021 defines it

1 case, in `printing` (1). All rely on grammar or rules introduced in September 2025, not in October 2021.

- The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives))
- defaultValue is null for an input value without a default, and otherwise null or an encoding of the default (MUST, [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type))
- Fields, arguments, enum values, directives, members and interfaces come in source order (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))

The shortest case, from `printing.defaults`:

```
problem:  defaultValue at In.s, defaultValue at In.t, defaultValue at Query.f(c:), defaultValue at Query.f(i:), defaultValue at Query.f(l:), enumValues at __DirectiveLocation, inputNullability at @deprecated(reason:), inputNullability at __Type.enumValues(includeDeprecated:), inputNullability at __Type.fields(includeDeprecated:), locations at @deprecated, order at Query.f
input:    [since September 2025] input In { s: String = "\u0003", t: [String] = ["😀"] } type Query { f(c: String = "\u0000\u0001\t\n\u001F\u007F\u0080\u0085\u009F", e: String = "😀 é", l: [String] = ["\u0002", "😀"], i: In = {s: "\u0004", t: ["\u0005😀"]}): Int }  (the introspection query, September 2025 profile; includeDeprecated: the default)
response: {"description":"","enumValues":null,"fields":[{"args":[{"defaultValue":"\"[\\x02 😀]\"","description":"","name":"l","type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"String","ofType":null}}},{"defaultValue":"\"map[s:\\x04 t:[\\x05😀]]\"","description":"","name":"i","type":{"kind":"INPUT_OBJECT","name":"In","ofType":null}},{"defaultValue":"\"\\x00\\x01\\t\\n\\x1f\\x7f\\u0080\\u0085\\u009f\"","description":"","name":"c","type":{"kind":"SCALAR","name":"String","ofType":null}},{"defaultValue":"\"😀 é\"","description":"","name":"e","type":{"kind":"SCALAR","name":"String","ofType":null}}],"deprecationReason":null,"description":"","isDeprecated":false,"name":"f","type":{"kind":"SCALAR","name":"Int","ofType":null}}],"inputFields":null,"interfaces":[],"kind":"OBJECT","name":"Query","possibleTypes":null}
expected: {"kind":"OBJECT","name":"Query","description":null,"specifiedByURL":null,"isOneOf":null,"fields":[{"name":"f","description":null,"args":[{"name":"c","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"\\u0000\\u0001\\t\\n\\u001f\\u007F\\u0080\\u0085\\u009F\"","isDeprecated":false,"deprecationReason":null},{"name":"e","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"😀 é\"","isDeprecated":false,"deprecationReason":null},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"String","ofType":null}},"defaultValue":"[\"\\u0002\", \"😀\"]","isDeprecated":false,"deprecationReason":null},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"In","ofType":null},"defaultValue":"{s: \"\\u0004\", t: [\"\\u0005😀\"]}","isDeprecated":false,"deprecationReason":null}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}
```

<a id="introspect-finding-16"></a>

#### 16. `typeByName`: __type(name:) doesn't return a type the schema has

1 case, in `builtinScalars` (1).

- __type(name:) returns the named type, and null for a name the schema doesn't have (MUST, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))

The shortest case, from `builtinScalars.lookup`:

```
problem:  typeByName at Float
input:    directive @d(f: Float) on FIELD input In { id: ID } type Query { a(i: In): String }  (__type(name:) for In, ID, Float, Int, Unknown, September 2025 profile; includeDeprecated: true)
response: {"__type(name: \"Float\")":null}
expected: {"__type(name: \"Float\")":{"kind":"SCALAR","name":"Float","description":null,"specifiedByURL":null,"isOneOf":null,"fields":null,"inputFields":null,"interfaces":null,"enumValues":null,"possibleTypes":null}}
```

<a id="introspect-finding-17"></a>

#### 17. `defaultValue`, `order`: defaultValue is null for an input value without a default, and otherwise null or an encoding of the default: differs from Introspection.tla; fields, arguments, enum values, directives, members and interfaces come in source order: differs from Introspection.tla

1 case, in `printing` (1). All rely on grammar or rules introduced in September 2025, not in October 2021.

- defaultValue is null for an input value without a default, and otherwise null or an encoding of the default (MUST, [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type))
- Fields, arguments, enum values, directives, members and interfaces come in source order (SHOULD, [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection))

The shortest case, from `printing.lookup`:

```
problem:  defaultValue at In.s, defaultValue at In.t, defaultValue at Query.f(c:), defaultValue at Query.f(i:), defaultValue at Query.f(l:), order at Query.f
input:    [since September 2025] input In { s: String = "\u0003", t: [String] = ["😀"] } type Query { f(c: String = "\u0000\u0001\t\n\u001F\u007F\u0080\u0085\u009F", e: String = "😀 é", l: [String] = ["\u0002", "😀"], i: In = {s: "\u0004", t: ["\u0005😀"]}): Int }  (__type(name:) for Query, In, Unknown, September 2025 profile; includeDeprecated: true)
response: {"__type(name: \"Query\")":{"description":"","enumValues":null,"fields":[{"args":[{"defaultValue":"\"[\\x02 😀]\"","description":"","name":"l","type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"String","ofType":null}}},{"defaultValue":"\"map[s:\\x04 t:[\\x05😀]]\"","description":"","name":"i","type":{"kind":"INPUT_OBJECT","name":"In","ofType":null}},{"defaultValue":"\"\\x00\\x01\\t\\n\\x1f\\x7f\\u0080\\u0085\\u009f\"","description":"","name":"c","type":{"kind":"SCALAR","name":"String","ofType":null}},{"defaultValue":"\"😀 é\"","description":"","name":"e","type":{"kind":"SCALAR","name":"String","ofType":null}}],"deprecationReason":null,"description":"","isDeprecated":false,"name":"f","type":{"kind":"SCALAR","name":"Int","ofType":null}}],"inputFields":null,"interfaces":[],"kind":"OBJECT","name":"Query","possibleTypes":null}}
expected: {"__type(name: \"Query\")":{"kind":"OBJECT","name":"Query","description":null,"specifiedByURL":null,"isOneOf":null,"fields":[{"name":"f","description":null,"args":[{"name":"c","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"\\u0000\\u0001\\t\\n\\u001f\\u007F\\u0080\\u0085\\u009F\"","isDeprecated":false,"deprecationReason":null},{"name":"e","description":null,"type":{"kind":"SCALAR","name":"String","ofType":null},"defaultValue":"\"😀 é\"","isDeprecated":false,"deprecationReason":null},{"name":"l","description":null,"type":{"kind":"LIST","name":null,"ofType":{"kind":"SCALAR","name":"String","ofType":null}},"defaultValue":"[\"\\u0002\", \"😀\"]","isDeprecated":false,"deprecationReason":null},{"name":"i","description":null,"type":{"kind":"INPUT_OBJECT","name":"In","ofType":null},"defaultValue":"{s: \"\\u0004\", t: [\"\\u0005😀\"]}","isDeprecated":false,"deprecationReason":null}],"type":{"kind":"SCALAR","name":"Int","ofType":null},"isDeprecated":false,"deprecationReason":null}],"inputFields":null,"interfaces":[],"enumValues":null,"possibleTypes":null}}
```

### Every check

- **✓ N:** every one of the N cases it applied to satisfied it.
- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.
- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.
- **(k since September 2025, j new in September 2026), (all …):** k of the n failing cases rely on grammar or rules introduced in September 2025, and j on ones introduced in September 2026; none of them is in the October 2021 edition. The symbol still gives the check's level.
- **~:** inconclusive (see the implementation's page).
- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).
- **–:** never exercised: the adapter lacks the capability, or no case reached it. **– needs `x`:** the adapter doesn't claim capability `x`, which the check needs.
- **n/a:** the adapter doesn't take part in this area, or its report predates the check.

| Check | Level | Spec | Result |
| --- | :---: | :---: | :---: |
| The response is a well-formed execution result: data, errors only as a non-empty list, extensions a map, nothing else (`envelope`) | MUST | [§7.1.1](https://spec.graphql.org/September2026/#sec-Execution-Result) [§7.1.7](https://spec.graphql.org/September2026/#sec-Extensions) [§7.1.8](https://spec.graphql.org/September2026/#sec-Additional-Entries) | ✓ 64 |
| The query executes, and its result has exactly the fields it selects, nulls included (`executes`) | MUST | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) | ✗ 25/61 (10 since September 2025) |
| queryType, mutationType and subscriptionType are the root operation types (`roots`) | MUST | [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type) [§3.3.1](https://spec.graphql.org/September2026/#sec-Root-Operation-Types) | ✓ 16 |
| types is the set of all named types (`types`) | MUST | [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type) | ✓ 16 |
| types includes, and __type(name:) finds, a type the document defines that nothing references (`unreferencedTypes`) | SHOULD | [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type) | ✓ 27 |
| types has the built-in scalars the schema references, and no others (`builtinScalars`) | MUST | [§3.5](https://spec.graphql.org/September2026/#sec-Scalars) [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type) | ✗ 2/16 |
| __type(name:) returns the named type, and null for a name the schema doesn't have (`typeByName`) | MUST | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) | ✗ 1/11 |
| Each __Type has its type's kind, and its fields are null exactly where that kind requires, List and Non-Null included (`typeKinds`) | MUST | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) | ✗ 6/28 |
| An object's or interface's fields, with their types (`fields`) | MUST | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) [§4.2.3](https://spec.graphql.org/September2026/#sec-The-__Field-Type) | ✓ 27 |
| Field and directive arguments, with their types (`arguments`) | MUST | [§4.2.3](https://spec.graphql.org/September2026/#sec-The-__Field-Type) [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type) [§4.2.6](https://spec.graphql.org/September2026/#sec-The-__Directive-Type) | ✓ 27 |
| defaultValue is null for an input value without a default, and otherwise null or an encoding of the default (`defaultValue`) | MUST | [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type) | ✗ 3/27 (all since September 2025) |
| defaultValue encodes the default value of an input value that has one, rather than returning null (`defaultValueOmitted`) | SHOULD | [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type) | ✓ 27 |
| A default value's strings are printed with control characters escaped, and supplementary characters, if escaped, as \u{…} (`defaultValuePrinting`). Since September 2025: October 2021 has no rule on producing a StringValue. | SHOULD (since September 2025) | [§2.10.4](https://spec.graphql.org/September2026/#sec-String-Value) [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type) | ✓ 27 |
| An input object's inputFields, with their types (`inputFields`) | MUST | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type) | ✓ 27 |
| An enum's enumValues (`enumValues`) | MUST | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) [§4.2.5](https://spec.graphql.org/September2026/#sec-The-__EnumValue-Type) | ✓ 27 |
| interfaces, and possibleTypes for unions and interfaces (`interfaces`) | MUST | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) | ✓ 27 |
| isDeprecated, deprecationReason and includeDeprecated; @deprecated is returned when the schema deprecates something (`deprecation`). The implementation answered the September 2025 query, so this check is graded as September 2025 has it: September 2025 deprecates fields, arguments, input fields and enum values, but not directives, so this check covers no directive. | MUST | [§4.2.3](https://spec.graphql.org/September2026/#sec-The-__Field-Type) [§4.2.4](https://spec.graphql.org/September2026/#sec-The-__InputValue-Type) [§4.2.5](https://spec.graphql.org/September2026/#sec-The-__EnumValue-Type) [§4.2.6](https://spec.graphql.org/September2026/#sec-The-__Directive-Type) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) [§3.13.3](https://spec.graphql.org/September2026/#sec--deprecated) | ✓ 27 |
| Under the October 2021 profile, a deprecated field or enum value has its reason, rather than null (`deprecationReasonOmitted`). Graded only under the October 2021 profile. | SHOULD | [§4.2.3](https://spec.graphql.org/September2026/#sec-The-__Field-Type) [§4.2.5](https://spec.graphql.org/September2026/#sec-The-__EnumValue-Type) | – |
| specifiedByURL is a custom scalar's @specifiedBy URL, otherwise null (`specifiedByURL`) | MUST | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) [§3.13.4](https://spec.graphql.org/September2026/#sec--specifiedBy) | ✓ 27 |
| specifiedByURL returns the URL @specifiedBy gives a custom scalar, rather than null, when the service provides @specifiedBy (`specifiedByURLOmitted`) | SHOULD | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) [§3.13.4](https://spec.graphql.org/September2026/#sec--specifiedBy) | ✓ 27 |
| isOneOf is true exactly for OneOf input objects (`isOneOf`). Since September 2025: October 2021 has no OneOf input objects. | MUST (since September 2025) | [§4.2.2](https://spec.graphql.org/September2026/#sec-The-__Type-Type) [§3.10.1](https://spec.graphql.org/September2026/#sec-OneOf-Input-Objects) | ✓ 27 |
| A description the document gives is returned as it is, the schema's included (`descriptions`) | SHOULD | [§3.2](https://spec.graphql.org/September2026/#sec-Type-System-Descriptions) [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) | ✓ 27 |
| directives describes the schema's own directives (name, locations, isRepeatable), and returns any built-in directive the result shows is provided (@specifiedBy for a specifiedByURL, @oneOf for a true isOneOf); any of the service's own takes input types (`directives`) | MUST | [§4.2.1](https://spec.graphql.org/September2026/#sec-The-__Schema-Type) [§4.2.6](https://spec.graphql.org/September2026/#sec-The-__Directive-Type) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | ✓ 18 |
| @skip and @include are provided, @specifiedBy when the schema has a custom scalar, @oneOf when it has a OneOf input object (`builtinDirectives`) | SHOULD | [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) [§3.13.1](https://spec.graphql.org/September2026/#sec--skip) [§3.13.2](https://spec.graphql.org/September2026/#sec--include) [§3.13.4](https://spec.graphql.org/September2026/#sec--specifiedBy) [§3.13.5](https://spec.graphql.org/September2026/#sec--oneOf) | ! 6/24 (3 since September 2025) |
| The introspection types and built-in directives are as the spec defines them, with nothing left out or changed (`builtinDefinitions`) | MUST | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | ✗ 17/28 (2 since September 2025) |
| The fields and arguments of the introspection types and built-in directives have the Non-Null wrapping the spec gives them (`builtinNullability`) | SHOULD | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | ! 16/27 (all since September 2025) |
| The introspection types have no field, argument, enum value or type the spec doesn't define (`builtinAdditions`) | INFO | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) | i 8/27 (1 since September 2025) |
| Under an older release's profile, a built-in definition that differs from that release's is as a later release defines it (`builtinEdition`) | INFO | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) [§3.13](https://spec.graphql.org/September2026/#sec-Type-System.Directives) | ✓ 27 |
| __typename names the root type, and no fields list includes it (`typename`) | MUST | [§4.1](https://spec.graphql.org/September2026/#sec-Type-Name-Introspection) | ✓ 27 |
| Fields, arguments, enum values, directives, members and interfaces come in source order (`order`). Since September 2025: October 2021 has no Stable Ordering. | SHOULD (since September 2025) | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) | ! 10/27 (all since September 2025) |
| Anything else Introspection!Matches requires (`other`) | MUST | [§4.2](https://spec.graphql.org/September2026/#sec-Schema-Introspection) | ✓ 27 |

- **Basis for `envelope`:** §7.1: "An execution result must be a map." "If any errors are raised during operation execution, the execution result must contain an entry with key errors. The value of this entry must be a non-empty list". "The extensions entry in an execution result or request error result, if set, must have a map as its value." "the execution result and request error result maps must not contain any entries other than those described above."
- **Basis for `executes`:** §4.2: "The schema introspection system is accessible from the meta-fields __schema and __type which are accessible from the type of the root of a query operation", with "__schema: __Schema!". Each field the kit selects is one §4.2 defines, so a request error, an execution error, a crash, or a result without a selected field fails to return what those definitions say each field returns.
- **Basis for `roots`:** §4.2.1: "queryType is the root type of a query operation." "mutationType is the root type of a mutation operation, if supported. Otherwise null." The same for subscriptionType. Appendix A: "Conformance requirements are described in this document via both descriptive assertions and key words with clearly defined meanings."
- **Basis for `types`:** §4.2.1: "types must return the set of all named types contained within this schema. Any named type which can be found through a field of any introspection type must be included in this set." A type a field, argument, interface, union or root reaches, left out, or a type the schema doesn't have, fails this check. A type the document defines but nothing reaches is unreferencedTypes.
- **Basis for `unreferencedTypes`:** §4.2.1: "types must return the set of all named types contained within this schema. Any named type which can be found through a field of any introspection type must be included in this set." The second sentence is about types found through fields; whether a type the document defines that no root, field, argument, interface, union or directive argument reaches is "contained within this schema" isn't settled by the text, which doesn't define the phrase. The plain reading is that a schema built from a document contains every type the document defines, so leaving one out is graded at the weaker level, a SHOULD.
- **Basis for `builtinScalars`:** §3.5: "When returning the set of types from the __Schema introspection type, all referenced built-in scalars must be included. If a built-in scalar type is not referenced anywhere in a schema (there is no field, argument, or input field of that type) then it must not be included."
- **Basis for `typeByName`:** §4.2: "The schema introspection system is accessible from the meta-fields __schema and __type which are accessible from the type of the root of a query operation", with "__type(name: String!): __Type". The spec gives no more prose for __type, so the kit takes its answer to be the named type's entry in types (§4.2.1: "types must return the set of all named types contained within this schema"), and null, which its nullable type allows, for a name no type has. A type the document defines that nothing references is unreferencedTypes.
- **Basis for `typeKinds`:** §4.2.2, for each kind: "kind must return __TypeKind.OBJECT" (and so on) and "All other fields must return {null}." For List and Non-Null: "ofType must return a type of any kind." isOneOf, new in September 2025, is part of "all other fields" since then.
- **Basis for `fields`:** §4.2.2: "fields must return the set of fields that can be selected for this type." §4.2.3: "type must return a __Type that represents the type of value returned by this field."
- **Basis for `arguments`:** §4.2.3: "args returns a List of __InputValue representing the arguments this field accepts." §4.2.6: "args returns a List of __InputValue representing the arguments this directive accepts." §4.2.4: "type must return a __Type that represents the type this input value expects." Appendix A: "Conformance requirements are described in this document via both descriptive assertions and key words with clearly defined meanings."
- **Basis for `defaultValue`:** §4.2.4: "defaultValue may return a String encoding (using the GraphQL language) of the default value used by this input value in the condition a value is not provided at runtime. If this input value has no default value, returns null." A string that encodes another value, or one for an input value without a default, contradicts that. Appendix A: "Conformance requirements are described in this document via both descriptive assertions and key words with clearly defined meanings."
- **Basis for `defaultValueOmitted`:** §4.2.4: "defaultValue may return a String encoding (using the GraphQL language) of the default value used by this input value in the condition a value is not provided at runtime. If this input value has no default value, returns null." By Appendix A, a lowercase "may" keeps its RFC 2119 meaning, so the encoding is optional; the intent is plainly that a default is encoded, which makes this a SHOULD. A string that isn't an encoding of the default, or one for an input value without a default, still fails defaultValue.
- **Basis for `defaultValuePrinting`:** §2.10.4: "When producing a StringValue, implementations should use escape sequences to represent non-printable control characters (U+0000 to U+001F and U+007F to U+009F)." "If an implementation chooses to escape a supplementary character, it should only use a variable-width unicode escape sequence." §4.2.4: "defaultValue may return a String encoding (using the GraphQL language) of the default value". So a string in the encoding that has a control character unescaped, or a surrogate pair of fixed-width escapes, fails this check. A block string can't escape anything, so one that holds a control character fails it too; read literally that would rule out every multi-line block string, so the kit takes the weaker reading and lets a block string hold tabs, line feeds and carriage returns. September 2025 introduced both sentences; the value the encoding stands for is graded by defaultValue.
- **Basis for `inputFields`:** §4.2.2: "inputFields must return the set of input fields as a list of __InputValue." §4.2.4: "type must return a __Type that represents the type this input value expects."
- **Basis for `enumValues`:** §4.2.2: "enumValues must return the set of enum values as a list of __EnumValue."
- **Basis for `interfaces`:** §4.2.2: "interfaces must return the set of interfaces that an object implements (if none, interfaces must return the empty set)." For a union, "possibleTypes returns the list of types that can be represented within this union", and for an interface, "possibleTypes returns the list of types that implement this interface". Appendix A: "Conformance requirements are described in this document via both descriptive assertions and key words with clearly defined meanings."
- **Basis for `deprecation`:** §4.2.3: "isDeprecated returns true if this field should no longer be used, otherwise false." "deprecationReason returns the reason why this field is deprecated, or null if this field is not deprecated." (likewise §4.2.4 to §4.2.6), and each list "Accepts the argument includeDeprecated which defaults to false. If true, deprecated fields are also returned." Appendix A: "Conformance requirements are described in this document via both descriptive assertions and key words with clearly defined meanings." §3.13: "GraphQL implementations that support the type system definition language must provide the @deprecated directive if representing deprecated portions of the schema." The reason of an item deprecated without one is the default of the service's own @deprecated(reason:); a default that differs from §3.13.3's fails builtinDefinitions only. September 2025 has the same sentences for fields, arguments, input fields and enum values (its §4.2.6 has no isDeprecated on __Directive, which is new in September 2026). October 2021 has them for fields and enum values only, and says "deprecationReason optionally provides a reason why this field is deprecated", so under the October 2021 profile a null reason is deprecationReasonOmitted.
- **Basis for `deprecationReasonOmitted`:** October 2021 §4.2.3 and §4.2.5: "deprecationReason optionally provides a reason why this field is deprecated." That makes the reason optional, where September 2025 and September 2026 say "returns the reason why this field is deprecated" (a MUST, under deprecation). The intent is plainly that the reason the schema gives is returned, which makes null a SHOULD here; another string still fails deprecation.
- **Basis for `specifiedByURL`:** §4.2.2: "specifiedByURL may return a String (in the form of a URL) for custom scalars, otherwise must be null." A URL other than the one @specifiedBy gives, or a URL on a built-in scalar, fails this check. Null for a scalar the document gives a URL is specifiedByURLOmitted.
- **Basis for `specifiedByURLOmitted`:** §4.2.2: "specifiedByURL may return a String (in the form of a URL) for custom scalars, otherwise must be null." By Appendix A, a lowercase "may" keeps its RFC 2119 meaning, so returning the URL is optional; the intent is plainly that the URL @specifiedBy gives is returned, which makes null a SHOULD, as for defaultValueOmitted. A service that doesn't provide @specifiedBy at all fails builtinDirectives instead.
- **Basis for `isOneOf`:** §4.2.2: "isOneOf must return true when representing a OneOf Input Object, otherwise false." September 2025 introduced OneOf Input Objects (§3.10.1) and isOneOf with this sentence.
- **Basis for `descriptions`:** §3.2: documentation is "written immediately alongside definitions in a TypeSystemDocument and made available via introspection", which has no key word, and §4.2 says of every description field that it "may return a String or null". So a description the document gives that is lost or replaced fails this SHOULD, and any description is accepted for a definition the document doesn't describe ("" or one of the service's own included).
- **Basis for `directives`:** §4.2.1: "directives must return the set of all directives available within this schema including all built-in directives." §3.13: "When introspecting a GraphQL service all provided directives, including any built-in directive, must be included in the set of returned directives." §4.2.6: "locations returns a List of __DirectiveLocation representing the valid locations this directive may be placed", and "isRepeatable must return a Boolean that indicates if the directive may be used repeatedly at a single location." A directive's argument "must accept a type where IsInputType(argumentType) returns true" (§3.13, Type Validation).
- **Basis for `builtinDirectives`:** §3.13: "GraphQL implementations should provide the @skip and @include directives." "GraphQL implementations that support the type system definition language should provide the @specifiedBy directive if representing custom scalar definitions." "... should provide the @oneOf directive if representing OneOf Input Objects." @oneOf is new in September 2025.
- **Basis for `builtinDefinitions`:** §4.2 gives the introspection types with "Below are the full set of type system definitions providing schema introspection, which are fully defined in the sections below", and the sections below say what each field returns ("kind must return __TypeKind.OBJECT", "isRepeatable must return a Boolean", "args returns a List of __InputValue"). A field, argument or enum value left out, or with another type, can't return what they say. §3.13: "A built-in directive is any directive defined within this specification", each with its definition (§3.13.1 to §3.13.5). Appendix A: "Conformance requirements are described in this document via both descriptive assertions and key words with clearly defined meanings." Where only the Non-Null wrapping differs, and the result accepts or returns everything the spec's would, the difference is builtinNullability; an addition is builtinAdditions.
- **Basis for `builtinNullability`:** The Non-Null wrapping of the introspection fields and arguments, and of the built-in directives' arguments, is given only by the definitions (§4.2 introduces them with "Below are the full set of type system definitions providing schema introspection, which are fully defined in the sections below", and §3.13.3 has "directive @deprecated(reason: String! = \"No longer supported\")"), which have no key word. The prose says what each field returns ("isRepeatable must return a Boolean") and, of each includeDeprecated, only "Accepts the argument includeDeprecated which defaults to false". A field whose type differs only in Non-Null can still return exactly that, and an argument that is nullable where the spec has Non-Null, with the same default, accepts every value the spec's does. So these are graded at the weaker level. An argument that is Non-Null where the spec's is nullable rejects requests the spec accepts, and stays under builtinDefinitions.
- **Basis for `builtinAdditions`:** No sentence of §4 forbids extending the introspection types. The nearest is "Below are the full set of type system definitions providing schema introspection, which are fully defined in the sections below", which uses no key word, and Appendix A says "A conforming implementation of GraphQL may provide additional functionality, but must not do so where explicitly disallowed". Leaving out or changing a definition stays a MUST, under builtinDefinitions.
- **Basis for `builtinEdition`:** The kit grades September 2026, the latest release; the September 2025 and October 2021 profiles are for a service whose introspection types September 2026's query can't ask. A built-in definition (or an addition) that is exactly as a later release defines it breaks nothing that release requires, so it is reported here, labelled with that release, and not under builtinDefinitions or builtinAdditions.
- **Basis for `typename`:** §4.1: "Type name introspection is accomplished via the meta-field __typename: String! on any Object, Interface, or Union. It returns the name of the concrete Object type at that point during operation execution." "As a meta-field, __typename is implicit and does not appear in the fields list in any defined type."
- **Basis for `order`:** §4 "Stable Ordering": "When a schema is produced from a TypeSystemDocument, introspection should return items in the same source order for each element list: object fields, input object fields, arguments, enum values, directives, union member types, and implemented interfaces." September 2025 introduced this paragraph.
- **Basis for `other`:** A difference Introspection!Matches finds that IntrospectChecks can't name. Matches compares with the result §4.2 defines, so a difference there is one from what §4.2's sentences require.
