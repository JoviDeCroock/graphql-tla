# graphql-tla

[GraphQL's specification](https://spec.graphql.org/September2026/) as executable TLA+, and a kit that checks any GraphQL implementation against it.

- **References** for each part of the spec, written by hand from its algorithms and model checked with [tla-ts](https://github.com/aidenybai/tla-ts):
  - the language (§2), for executable and type system documents, and schema coordinates (§2.14);
  - the type system (§3), with type system extensions;
  - introspection (§4);
  - validation (§5);
  - input coercion and execution (§6), with subscriptions;
  - the response format (§7).
- **A conformance kit**, [`kit/`](kit), that drives a GraphQL implementation through a small adapter and checks every answer against the references: execution responses, and in the other areas parsing, validation, coercion, schema validity, introspection and schema coordinates. Ten adapters cover eleven implementations (graphql-js 16 and 17 share one), and the [conformance sheet](conformance/README.md) records what each one passes and breaks.
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

Fixtures are plain GraphQL. Each [`fixtures/*.graphql`](fixtures) file holds a schema, one operation and its fragments, plus optional headers: `# variables:` (the variable values), `# variants:` (several sets of variable values, each its own fixture, named `<file>_<variant>`), `# maxListLength:`, `# invalidResults:` (resolvers may return values of the wrong shape) and `# spec:` (the sections it exercises). The 23 files make 27 fixtures:

- `nullPropagation`: Non-Null chains and `data: null`.
- `lists`: `[Post!]` and `[String]!`, with items completing in parallel.
- `listPartialNull`: a list item whose Non-Null child fails, next to an item that completes.
- `nestedLists`: `[[Int!]]` with two rows, where a failed item nulls only its own row.
- `nonNullListItems`: `[Item!]!`, where an item's error crosses the list and stops at the nullable object above it.
- `deepLists`: three levels of lists, and an error path with an index at each.
- `fragments`: an interface, inline fragments and fragment spreads, `@skip`/`@include`, aliases, and merged response keys.
- `abstract`: union and interface type conditions inside interface- and union-typed fields, both outcomes of each, and `__typename` on an abstract field.
- `abstractList`: an interface list holding both concrete types, in either order, with one type's Non-Null field failing.
- `merging`: §6.3.2's own example of merged sub-selections.
- `aliases`: aliases that swap root fields and leaves, in `data` and in error paths, and a deprecated field still executed.
- `ordering`: response keys in the order CollectFields first meets them, with §3.6's examples.
- `directives`: `@skip` and `@include` with variables on fields, inline fragments and spreads, one fixture per row of their truth table (`directives_kept`, `_skipped`, `_excluded`, `_dropped`).
- `conditionalMerge`: one Non-Null field selected three times under `@include` and `@skip`, so its error locations name only the collected selections (`conditionalMerge_on`, `_off`).
- `unions`: a union, `__typename`, a nested list, and results of the wrong shape.
- `leaves`: leaf result coercion: a fraction for an Int, a non-finite Float, an unknown enum value.
- `booleanResult`: an object for a Boolean.
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

The kit is on npm as `@0no-co/graphql-tla` (Node 22 or later); its command is `graphql-tla`:

```shell
npm install --save-dev @0no-co/graphql-tla
npx graphql-tla run execution --adapter "<command that starts your adapter>"
npx graphql-tla run validate --adapter "<command that starts your adapter>"
```

The package holds the kit, the TLA+ references and fixtures it checks against, these docs, and the graphql-js adapter as a worked example (`node node_modules/@0no-co/graphql-tla/adapters/graphql-js/adapter.mjs` runs graphql-js 17, a dependency of the package). The adapter protocol is also a JSON Schema, [`kit/protocol.schema.json`](kit/protocol.schema.json), importable as `@0no-co/graphql-tla/protocol.schema.json`, so an adapter's test suite can validate the lines it writes.

**The model checker.** Every reference is evaluated by [tla-ts](https://github.com/aidenybai/tla-ts), which the package depends on. Another checker can stand in if it takes the same arguments (`-workers N`, `-config F.cfg`, `F.tla`) and prints what tla-ts prints: set `TLA_CHECKER` to its command, or pass `--checker "<command>"` to the kit or to any script in `scripts/`. A command naming a `.js` or `.mjs` file runs with the current Node; anything else runs as an executable, with the checker's arguments after it. [`kit/checker.mjs`](kit/checker.mjs) is the one place either is read, and every run goes through it.

The kit has seven areas. Each checks one part of the spec against its TLA+ reference:

| Area | Spec | Reference | How | Checks |
| --- | --- | --- | --- | --- |
| [`execution`](docs/conformance.md) | §6, §7, and §3's result coercion | `Reference.tla` | drives your resolvers through 27 fixtures, every outcome and schedule, and checks each response against every response the spec allows; with capabilities, also subscription streams (§6.2.3), the value each resolver was called on, and custom scalar and ID results | 47 |
| [`parse`](docs/kit/parse.md) | §2, and §3's type system grammar | `Lexer.tla`, `Parser.tla` | accept or reject 2,847 source texts, mostly in minimal pairs; 713 of them type system documents (capability `parse-sdl`), and 20 crash probes | 51 |
| [`validate`](docs/kit/validate.md) | §5, §2.2 | `Validation.tla` | 3,370 documents, each breaking one rule (two in 27 documented cases) or none, so each rule gets its own verdict, plus copies with descriptions and comments that must get the same verdict | 36 |
| [`coerce`](docs/kit/coerce.md) | §2.10.4, §3.5, §3.9–§3.12, §6.1, §6.2.3.1, §6.4.1, §7.1 | `Coercion.tla` | 2,244 requests with variables and literals: a request error, a field error, or the coerced arguments; also operation selection, a subscription's source stream, and the shape of every response | 42 |
| [`schema`](docs/kit/schema.md) | §3 | `TypeSystem.tla` | 505 SDL schemas in 255 minimal pairs, one or more per type-system rule; 135 with type system extensions (capability `schema-extensions`) | 64 |
| [`introspect`](docs/kit/introspect.md) | §4 | `Introspection.tla` | 71 introspection queries over 21 schemas, with the variation the spec allows, answered under the September 2026, September 2025 or October 2021 profile | 31 |
| [`coordinate`](docs/kit/coordinate.md) | §2.14 | `SchemaCoordinates.tla` | 210 schema coordinates over two schemas: whether each parses, and what it resolves to | 11 |

Outside execution, every expected answer comes from evaluating the reference with tla-ts, never from graphql-js. [`docs/kit-areas.md`](docs/kit-areas.md) describes how those areas work.

An adapter is a small program that speaks newline-delimited JSON. It builds the schema the kit sends and installs one resolver on every field, which reports each call and returns whatever the kit says. [`docs/conformance.md`](docs/conformance.md) has the protocol, the outcomes, the clauses and the case format. The adapters in [`adapters/`](adapters) are examples:

| Adapter | Implementation | Notes |
| --- | --- | --- |
| [`graphql-js`](adapters/graphql-js) | graphql-js 16.15 and 17.1 | The reference adapter: about 350 lines for execution, and a short module per other area. In execution it fails only `nothingAfterCancel`, a SHOULD, so only under `--strict`: both versions still deliver the result of an event that was executing when the client cancelled. |
| [`graphql-java`](adapters/graphql-java) | graphql-java 26.2 | In execution, when a subscription event's Non-Null root field is null, the response stream fails instead of sending `{ data: null, errors }` (§6.2.3.2, 1338 cases and 11 streams); two errors can share a path in a subscription event (§6.4.4, MUST since September 2026, 6 cases); and errors raised while completing a value have no `locations` (§7.1.6, a SHOULD, 7428 cases). The parser has no descriptions on executable definitions (§2.2, 85 vectors, since September 2025) and none of September 2026's new syntax (30 vectors), and the validator crashes on both (63 documents). Validation misses `__typename` merge conflicts (§5.3.2, 22) and crashes on `@skip` or `@include` at a subscription's root (§5.2.4.1, 22). ID input accepts any value (§3.5.5, 31), and a subscription whose source stream can't be created is answered with `"data": null` (§7.1.3, 5, new in September 2026). The schema builder crashes on 4 schemas, rejects 14 valid ones (12 new in September 2026) and doesn't check 13 rules, such as a type named `__T` (§3.3). September 2026's introspection query is rejected, so introspect is graded against September 2025, where only SHOULDs fail. No `coordinate`. |
| [`hotchocolate`](adapters/hotchocolate) | Hot Chocolate 15.1.21 (.NET) | In execution, a null item at a Non-Null list position nulls the list but no error is reported (§6.4.4, 153 cases), and a fraction returned for an Int is rounded instead of raising an error (§3.5.1, 317 cases). A field whose first occurrence is skipped keeps that occurrence's key position and error location (§7.2.2, §7.1.6, SHOULDs), and a result arrives after the client cancels (§6.2.3.2, a SHOULD). In the other areas: a byte order mark after the first character is rejected, though §2.1.6 makes it ignored (352 vectors); block strings decode escapes, and malformed escapes crash the parser (§2.10.4, 16 crashes); variable defaults are checked without their wrappers and null literals always pass (§5.6.1, 28); `@skip` and `@include` at a subscription's root are allowed (§5.2.4.1, 27); JSON `1.0` is refused for an Int variable (§3.5.1, 11); an omitted nullable input field of a value type gets a value (§3.10, 10); 32 of 64 schema checks fail, most for a rule that isn't checked; introspection names `__Type.isOneOf` `oneOf`, so it is graded against September 2025 without it (§4.2, 37 results); and schema coordinates accept Ignored tokens (§2.14, 23, since September 2025). |
| [`graphql-dotnet`](adapters/graphql-dotnet) | graphql-dotnet 8.8.5 (.NET) | In execution, a non-finite Float leaves the client without a response (§3.5.2, 365 cases); a subscription that selects its root field twice under one response name is refused at validation (§5.2.4.1), so the `subscriptionAlias` fixture fails throughout (1502 cases, 18 streams); and errors at merged fields have no `locations` (§7.1.6, a SHOULD, 2690 cases). Validation treats every Non-Null type as equal to every other in §5.8.5 (72 vectors), misses `__typename` conflicts (§5.3.2, 22) and has no rule for §5.1.1 (15) or §5.2.1.1 (11, since September 2025). The parser has no descriptions on executable definitions (§2.2, 85, since September 2025) and none of September 2026's new syntax (31). The schema builder applies only object type extensions, merges duplicate definitions, has no cycle checks (§3.10, §3.13) and crashes on 8 schemas; 33 of 64 schema checks fail. Introspection has no `specifiedByURL`, `isRepeatable` or input-value deprecation (§4.2, 37 results), and leaves the schema's directives with type system locations out of `__schema.directives` (§4.2.1, 6). No `coerce` or `coordinate`. |
| [`graphql-core`](adapters/graphql-core) | graphql-core 3.2.14 (Python) | Calls every mutation root field's resolver at once, and only awaits them in order (§6.3.4, a SHOULD, 1394 cases). Resolvers that return a future or task run early; `async def` resolvers aren't affected, and graphql-core 3.3 fixes this. Like graphql-js 16, it delivers a result after the client cancels (§6.2.3.2, a SHOULD). In parse, validate, schema and coordinate it fails the same checks on the same number of vectors as graphql-js 16. In coerce and introspect it differs only in that a request error carries `"data": null` (§7.1.3, 829 vectors), which also fails `executes` on two introspection queries (§4.2). |
| [`graphql-ruby`](adapters/graphql-ruby) | graphql-ruby 2.6.15 | In execution, a fraction returned for an Int is truncated instead of raising an error (§3.5.1, 318 cases). The sheet runs it with the documented `type_error` and `rescue_from` hooks; out of the box, results of the wrong shape raise out of `execute` and the client gets no response. Its default `allow_legacy_*` validation settings only log a warning for merge conflicts (§5.3.2, 241 vectors) and variable usages (§5.8.5, 38); `@skip` and `@include` at a subscription's root are allowed (§5.2.4.1, 27); and 26 valid documents are rejected, most because types nothing references are hidden. The parser has no descriptions on executable definitions (§2.2, 85, since September 2025) and takes no keyword as a type name (§2.12, 23). JSON `1.0` is refused for an Int variable (§3.5.1, 12), and an error setting up a subscription is a field error (§7.1.6, 4, new in September 2026), as is an argument of its root field that can't be coerced (§7.1.5, 1, new in September 2026). 44 of 64 schema checks fail, most for a rule that isn't checked, and 18 schemas crash. Introspect is graded against September 2025, where `isOneOf` is `false` instead of null for every type but an input object (§4.2.2, 58 results). No `coordinate`. |
| [`graphql-go`](adapters/graphql-go) | graphql-go/graphql 0.8.1 | With thunks, the default, a Non-Null error inside a thunk nulls all of `data` and drops the other errors (§6.4.4), and mutation root fields aren't serial (§6.3.4, a SHOULD, 1180 cases). Uncoercible leaves become null with no error (§3.5, §3.9, 431 cases), a fraction for an Int is truncated (§3.5.1, 197), a non-finite Float leaves the client without a response (§3.5.2, 322), keys come out sorted (§7.2.2, a SHOULD, 2224), and a failing source stream ends the response stream normally (§6.2.3.2, 8 streams, since September 2025). In coerce, a request error has `"data": null` (§7.1.3, 1448 vectors), variables of the wrong type are converted (§3.5.1 to §3.5.5, such as `0` for a String), and 39 requests get no response. The parser has no `null` literal (§2.10.5), rejects a byte order mark between tokens (§2.1.6, 133) and reads no type system extension but `extend type`. Introspection lacks fields October 2021 already has, such as `__Schema.description`, `specifiedByURL` and `isRepeatable`, so it is graded against September 2025 without them, and 23 of its schemas can't be built (§4.2). No `validate`, `schema` or `coordinate`. |
| [`juniper`](adapters/juniper) | Juniper 0.18.0 (Rust) | Doesn't collect fields: a field selected twice resolves twice (§6.3.2), so a mutation root field runs twice (§6.3.4, 2750 cases), a failing field reports two errors at one path (§6.4.4, MUST since September 2026, 268), and a field nulled in one selection keeps the other's object. Error paths have no list indices (§7.1.4, 1347 cases; §7.1.6, a SHOULD, 1258). A non-finite Float becomes null with no error (§3.5.2, 415). An error in a subscription event nulls the root field, whatever its type. Validation lacks the Single Root Field (§5.2.4.1, 51 vectors), Operation Type Existence (§5.2.1.1, 10, since September 2025) and Directives Are Unique per Location (§5.7.3, 10) rules. The parser doesn't check what follows a number, so `[01]` and `[0x123]` parse (§2.10.1, 10), and introspection prints string defaults unescaped (§4.2.4, 6). Rust types keep out wrong-shaped results, fractions for an Int and null list items, so those aren't tested. No `coerce`, `schema`, `coordinate` or type system grammar. |
| [`async-graphql`](adapters/async-graphql) | async-graphql 7.0.17, dynamic schemas | Execution only. Resolver errors have no `path` (§7.1.6, 13819 cases). Errors don't stop at the nearest nullable field, so any error nulls all of `data` (§6.4.4, 1275 cases). Fields aren't merged, so a field selected twice resolves twice, a mutation root field included (§6.3.4, 411). A null object or list item is completed as an object (§6.4.3), an integer ID is returned as a number (§3.5.5, 173), and an Int outside 32 bits is passed through (§3.5.1, a SHOULD, 135). The response stream ends after any event whose result has an error (§6.2.3.2, a SHOULD, 23 streams). |
| [`apollo-kotlin`](adapters/apollo-kotlin) | Apollo Kotlin apollo-execution 5.2.0 (JVM) | Takes part in all seven areas. In execution, an unknown enum value is passed through and a non-finite Float leaves the client without a response (§3.5, `resultCoercion`, 701 cases); a propagating Non-Null error drops the errors of earlier mutation root fields (`serialErrorsKept`, 60); execution errors have no `locations` (a SHOULD). Every request error carries `"data": null` (§7.1.3, 1621 coerce vectors), and an argument's default literal reaches the resolver uncoerced. Validation has no Single Root Field rule (§5.2.4.1, 62) and drops Lone Anonymous Operation and All Variables Used to warnings; the schema builder leaves most §3 type validation rules unchecked; `__type(name:)` raises for an unknown type (§4.2.1); coordinates are lexed with the document lexer, so ignored tokens are accepted inside them (§2.14, 25). |

The kit checks the checker too. Every execution run evaluates 88 negative controls: 50 broken variants of cases recorded from graphql-js ([`kit/execution/controls.json`](kit/execution/controls.json)), 27 made at check time for checks the recordings can't reach (parent values, streams, locations, repeated keys, custom scalars), and 11 report controls. Each must be caught by the clause or check it names. The other areas run a self-test of their own on every run: 10 controls in `parse`, 15 in `validate`, 12 in `coordinate`, 353 in `introspect`, 1015 in `schema` and 38,540 generated ones in `coerce`.

**[The conformance sheet](conformance/README.md)** shows what each implementation was checked against and what it breaks, by spec section and by check, with the shortest failing case for each failure. Every cell is a count from a kit report (`--report`); `npm run conformance` regenerates it.

## What is checked

### Execution

Across the 27 fixtures, the executor's three variants (errors under a nulled position reported, dropped, or dropped with their resolvers cancelled), every schedule and every combination of resolver outcomes, `ExecutionConformance.tla` checks six properties:

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

The kit's findings for graphql-js 16.15.0 and 17.1.0, from their sheets ([16](conformance/graphql-js-16.md), [17](conformance/graphql-js-17.md)), by area. Levels are September 2026's. "Since September 2025" and "new in September 2026" mark findings whose cases all rely on a rule that release introduced.

- **Execution:** both versions deliver the result of an event that was executing when the client cancelled the response stream (`nothingAfterCancel`, SHOULD, §6.2.3.2, 4 stream cases; October 2021 makes it a MUST). Every other check passes.
- **Parse:**
  - both reject a variable-width escape with more than 8 hex digits, `"\u{000000041}"` (`stringValue`, MUST, since September 2025, §2.10.4, 2 vectors);
  - 16 rejects September 2026's new syntax: empty selection sets (`selectionSets`, §2.5, 11), directives on directive definitions (`directiveDefinition`, §3.13, 5) and directive extensions (`directiveExtension`, §3.13.6, 14), all MUST, new in September 2026.
- **Validate:**
  - both accept a `__typename` merge conflict (`fieldSelectionMerging`, MUST, §5.3.2, 22 documents), a Float literal beyond a double such as `1e400` (`valuesOfCorrectType`, MUST, §5.6.1, 6), and a nullable variable for a OneOf input field when the OneOf type is wrapped in Non-Null or a list, such as `pet: PetInput!` (`allVariableUsagesAreAllowed`, MUST, since September 2025, §5.8.5, 2);
  - 16 has no Operation Type Existence rule (`operationTypeExistence`, MUST, since September 2025, §5.2.1.1, 15);
  - 16's Single Root Field doesn't forbid `@skip` and `@include` at a subscription's root: it accepts 17 documents that break the rule, 6 of them since September 2025, and crashes on 11 whose condition is a variable (`singleRootField`, MUST, §5.2.4.1);
  - 16 crashes on documents with September 2026 syntax it can't parse (`executableDefinitions`, §5.1.1, 2; `leafFieldSelections`, §5.3.3, 2; and one valid document, `acceptsValid`), all MUST, new in September 2026.
- **Coerce** (run without validation, as the adapter does):
  - both execute an operation in a document that also holds type system definitions (`notExecutable`, MUST, §2.3, 5 vectors), pass the Float literal `1e400` to the resolver as `Infinity` (`float`, MUST, §3.5.2, 2), and for a subscription with a second root field, create the source stream from the first and execute them all on the event (`unvalidatedBranches`, MUST, §6.3.2, 2);
  - 16 drops unknown fields from an input object literal (`inputObject`, MUST, §3.10, 5), and counts a OneOf entry whose variable has no value as absent (`oneOf`, MUST, since September 2025, §3.10.1, 2).
- **Schema:**
  - both accept a type named like a built-in type, such as `enum Boolean { YES NO }` (`typeNameNotBuiltin`, MUST, §3.3, 3 schemas), a directive that uses itself (`directiveUsesItself`, MUST, §3.13; 2 in 16, 3 in 17) or reaches itself through others (`directiveReferencesItselfIndirectly`, MUST, §3.13; 4 in 16, 5 in 17), a default value that doesn't coerce (`argDefaultCompatible`, MUST, since September 2025, §3.6; 14 in 16, and in 17 only `Float = 1e400`), and `extend input In @oneOf` (`extensionOneOf`, MUST, since September 2025, §3.10.2, 2). Neither checks an applied directive's arguments against its definition (`appliedDirectiveArguments`, informational, since §3 states no such rule; 3 in 16, 2 in 17);
  - 16 also accepts the same type for two root operations (`rootTypesDifferent`, MUST, §3.3.1, 4), a deprecated field implementing one that isn't (`implDeprecation`, MUST, since September 2025, §3.6, 2) and a cycle through OneOf input objects (`inputObjectUnbreakableCycle`, MUST, new in September 2026, §3.10, 3). A default value cycle in an input object overflows its stack, on 4 invalid schemas (`inputObjectDefaultValueCycle`, MUST, §3.10) and 3 valid ones (`acceptsValid`, MUST). It rejects 11 valid schemas with September 2026's directive syntax (`acceptsValid`, MUST, new in September 2026);
  - 17 doesn't check three of the directive extension rules (`directiveExtensionReferencesPrevious`, 4; `directiveExtensionDefined`, 1; `directiveExtensionUsesPrevious`, 1; all MUST, new in September 2026, §3.13.6).
- **Introspect:**
  - 16's `@deprecated(reason:)` and `includeDeprecated` arguments have September 2026's types without their Non-Null wrapping (`builtinNullability`, SHOULD, since September 2025, §4.2, 38 results). 7 results aren't graded, since their schema or query uses September 2026 syntax 16 can't parse;
  - 17's `__DirectiveLocation` has `FRAGMENT_VARIABLE_DEFINITION`, which September 2026 doesn't define (`builtinAdditions`, informational, §4.2, 42 results).
- **Coordinate:** both pass every check.

Outside the kit's fixtures, reading and running graphql-js 16.15.0 and 17.1.0 while writing these specs turned up the following:

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

[docs/spec-comparison.md](docs/spec-comparison.md) compares the references with the spec chapter by chapter: what each covers, the readings they take where the spec is ambiguous, and what they don't model. [docs/spec-gaps.md](docs/spec-gaps.md) lists the places where the spec text itself is ambiguous, contradicts itself or leaves a rule out, with quotes and how the kit grades each.

## Writing specs

See [docs/writing-specs.md](docs/writing-specs.md) for the layout, the mutant format, and the tla-ts pitfalls this repo ran into.

## Results website

The deployable Preact frontend lives in [`website/`](website/README.md). Run
`npm run website:dev` locally or `npm run website:build` to generate static assets
for Cloudflare Pages or Workers. It shows the latest checked-in conformance reports.

## License

MIT. See [LICENSE](LICENSE).
