# The introspect area

`graphql-tla run introspect` checks schema introspection: what an implementation answers to the standard introspection query, and to `__type(name:)`, for an SDL schema. The reference is [`specs/Introspection.tla`](../../specs/Introspection.tla). `SchemaResult` is the `__schema` a service must return, and `Matches` says whether a service's result is one the spec allows. `TypeByName` is the answer to `__type(name:)`, and `TypeByNameMatches` judges one. It covers:

- §4.1 `__typename`;
- §4.2 Schema Introspection: `__schema` and `__type(name:)`, and `__Schema`, `__Type` for each kind (List and Non-Null included), `__Field`, `__InputValue`, `__EnumValue` and `__Directive`, as in the draft, including `isOneOf`, `specifiedByURL` and deprecated arguments, input fields and directives;
- the same for an implementation whose introspection types lack some of the draft's fields or arguments, and, failing that, against the October 2021 edition (see [Profiles](#profiles));
- §3.5's rule on which built-in scalars appear, and when §3.13 says a service must or should provide each built-in directive;
- the response envelope of §7.1.1, §7.1.7 and §7.1.8.

```shell
npx graphql-tla run introspect --adapter "node adapters/graphql-js/adapter.mjs --graphql 17" --strict --report introspect.json
```

The area follows [the contract for areas beyond execution](../kit-areas.md).

## Request

```json
{"type":"introspect","id":12,"sdl":"type Query { a: Int }","query":"query IntrospectionQuery { __typename __schema { … } } …"}
```

- **`sdl`:** a valid type system document, with no extensions.
- **`query`:** one of the kit's queries, in [`kit/introspect/query.mjs`](../../kit/introspect/query.mjs). The introspection query is the usual full query (graphql-js's `getIntrospectionQuery` with every option on), with every field of the profile's introspection types, plus `__typename` at the root. Each schema is asked the query twice: once with `includeDeprecated: true` on every list that takes it, once without the argument. A lookup query asks `__type(name:)` for a few names, each under an alias (`t0: __type(name: "Query") { ...FullType }`), with the same `FullType` fragment. One more request, the `wrappers` vector, asks `wrappers: __type(name: "__Schema") { fields { name type { … } } }`, with every `__Type` field selected three levels down, so that the List and Non-Null types of `__Schema`'s fields show their other fields. It is sent on its own, so that a service that rejects it (Hot Chocolate does, without a raised list depth limit) still has everything else graded.

Build the schema from the SDL, with no resolvers needed, and execute the query against it.

## Result

```json
{"type":"result","id":12,"response":{"data":{"__typename":"Query","__schema":{…}}}}
```

- **`response`:** the execution result, as JSON, exactly as the implementation would send it. If the schema doesn't build or the query is rejected, answer with a request error: `errors` and no `data` entry. That is an answer, and fails the `executes` check (or `builtinDirectives`, for a schema in `needs`, and nothing, for a schema in draft-only syntax: see below). `{"data": null, "errors": [...]}` is an execution failure, not a request error (§7.1.7: a request error "must not contain an entry with key `data`"), and always fails `executes`. For the probe that picks the profile, though, either one counts as the query being rejected.

If the implementation crashes (it throws on building the schema, or while executing, instead of answering), answer `{"type":"error","id":12,"message":"…"}`, as in the other areas: the kit records a crash for that vector, which fails `executes`, and goes on ([crashes](../kit-areas.md)). Don't turn a crash into a request error: that hides it.

**`custom-directives`.** Schemas that declare a directive of their own (`directive @label(...) on ...`: `rich`, `builtinScalars` and `directiveDeprecation`) carry `"requires": ["custom-directives"]`. An adapter claims the capability when it builds such a schema from SDL and the implementation knows the directive. Without it, those vectors aren't asked, and the report's `provenance.skipped` counts them.

The area needs SDL input. A code-first framework that can't build a schema from SDL can't take part. It just doesn't claim the `introspect` capability.

## Profiles

The draft's introspection types have fields and arguments the October 2021 edition doesn't: `__Type.isOneOf`, `__InputValue.isDeprecated` and `deprecationReason`, `__Directive.isDeprecated` and `deprecationReason`, and `includeDeprecated` on `args`, `inputFields` and `directives`. A service without one of them rejects a query that asks for it. So the kit picks, per run, a profile (`"draft"` or `"oct2021"`), and the fields and arguments to leave out:

1. It sends the first vector (`minimal.inc`, `type Query { a: Int }`) with the draft's query. Anything but a rejection keeps the **draft profile**. A rejection is a request error (`errors` and no `data` entry), or errors with `"data": null`, which some services answer for a query they don't validate.
2. Otherwise it asks which fields the introspection types have, and their arguments: `__type(name: "__Schema") { fields { name args { name } } }`, and the same for `__Type`, `__Field`, `__InputValue`, `__EnumValue` and `__Directive`, in one query. If every field and argument the draft's query needs but the service lacks is one the kit can do without (below), it sends the draft's query without them. Answered, that is the draft profile without them.
3. Otherwise it sends October 2021's query. Answered, that is the **October 2021 profile**.
4. Otherwise, October 2021's query without what the service lacks, if the kit can do without it.
5. Otherwise the run stays with the draft's profile, and every vector fails `executes`.

No capability is involved, and an implementation can't choose. One that answers the draft's query, or the draft's query without what it lacks, is graded against the draft. The report records the choice in `profile`, the fields and arguments left out in `missingFields`, and `profileNote` says why, quoting the first error of each rejected query.

**Missing fields and arguments.** The kit can do without these:

| Field or argument | What the kit can't see without it |
| --- | --- |
| `__Schema.description`, and `description` on `__Type`, `__Field`, `__InputValue`, `__EnumValue` and `__Directive` | those descriptions |
| `__Type.specifiedByURL` | URLs |
| `__Type.isOneOf` | whether an input object is OneOf, and where `isOneOf` is null |
| `isDeprecated` and `deprecationReason` on `__Field`, `__InputValue`, `__EnumValue` and `__Directive` | which of those are deprecated |
| `__InputValue.defaultValue` | default values |
| `__Directive.isRepeatable` | which directives are repeatable |
| `includeDeprecated` on `__Schema.directives`, `__Type.fields`, `enumValues` and `inputFields`, `__Field.args` and `__Directive.args` | whether that list returns deprecated items as `includeDeprecated: true` asks (the query leaves the argument out, so the list takes the service's default) |

Each vector is asked its profile's query without them. Before the comparison, a missing field's values are filled in with `null`, or `false` for `isDeprecated` and `isRepeatable`, and the missing definitions are put back into the introspection types the service returned (in `types`, in lookups and in `wrappers`), as the profile's built-ins define them. What the service lacks then counts **once per run**: one case of `builtinDefinitions` (MUST, §4.2 and §3.13: the introspection types "are fully defined" there), with one finding naming every missing field and argument, which is draft only when October 2021 defines none of them. In each result, the problems the kit can't see without a missing field or argument (the right-hand column) aren't counted, and everything else is graded as usual. Without any other field, such as `__Type.kind`, `__Field.type` or `ofType`, nothing can be graded.

Under the October 2021 profile:

- Each vector is asked its `query2021`, the October 2021 query.
- The built-in definitions are October 2021's (`Introspection!Oct2021Builtins`): its introspection types, `directive @deprecated(reason: String = "No longer supported") on FIELD_DEFINITION | ENUM_VALUE`, no `DIRECTIVE_DEFINITION` location, and no `@oneOf`. An answer that matches them passes `builtinDefinitions`. A `@oneOf` it returns counts as a directive of its own.
- Vectors marked `"edition": "draft"` aren't sent: their schemas use what October 2021 can't express (a OneOf input object, or a deprecated argument, input field or directive). `provenance.skipped` counts them.
- `isOneOf` and `order` are `untested`, with a note: October 2021 has no OneOf input objects and no Stable Ordering. `deprecation` is graded for fields and enum values only.
- The fields the October 2021 query doesn't select are filled in before the comparison, with the only values a schema October 2021 can express allows: `isOneOf` false for an input object and null otherwise, and no input value or directive deprecated. `IntrospectionVectors.tla`'s `Oct2021ProfileIsSound` checks that `SchemaResult` gives exactly those values for such a schema.

**Editions of the built-ins.** Every answer with problems is also compared with the other edition's built-ins.

- Under the draft profile, a problem with a built-in definition counts as draft only, and says so, where the answer follows October 2021 instead ("isn't as the draft defines it, but is as October 2021 does"), or where October 2021 doesn't define the field or argument at all ("isn't as the draft defines it; October 2021 doesn't define it": under October 2021 the item would be an addition, which is informational). "Follows October 2021" means that the October 2021 comparison finds no problem at the same place, and none with the built-in list it belongs to, left out or added.
- Under the October 2021 profile, a problem with a built-in definition, or an addition to one, where the answer follows the draft instead (by the same test) counts under `builtinEdition`, which is informational, and not under `builtinDefinitions` or `builtinAdditions`: the kit grades against the draft, and the October 2021 profile is only a fallback.

A definition that matches neither edition, such as a `@deprecated` with four of the draft's five locations, stays a `builtinDefinitions` failure in both.

## What is checked

First the kit checks the response's shape, in JS ([`kit/introspect/data.mjs`](../../kit/introspect/data.mjs)):

- **The envelope** (§7.1.1, §7.1.7, §7.1.8): the response is a map with `data`, or with `errors` and no data. `errors`, when present, is a non-empty list of maps with a `message`: `errors: []` and `errors: "not a list"` fail `envelope`. `extensions`, when present, is a map. No other entries. A bad envelope fails `envelope` only: the data is still graded.
- **The selected fields:** the data has exactly the fields the query selects, at every level, with an explicit `null` where a value is null. A missing field, such as an `ofType` the `TypeRef` fragment selects, or one the query doesn't select, fails `executes`, and nothing else is graded.

Then tla-ts evaluates `Introspection!Matches` (`TypeByNameMatches` for a lookup, `WrapperMatches` and `SchemaFieldsMatch` for `wrappers`) and [`kit/introspect/IntrospectChecks.tla`](../../kit/introspect/IntrospectChecks.tla)'s `Problems`. `Problems` compares with the reference's own operators, item by item, and names the aspect of each difference. `Matches` stays the verdict: the kit stops with an error if `Problems` finds a difference `Matches` doesn't, and counts a mismatch `Problems` can't name against `other`.

The comparison allows what the spec allows:

- **`types`** is a set: any order.
- **`possibleTypes`** of an interface and a directive's **`locations`** have no source order: any order.
- **Built-in lists** have no source order either. The fields of `__Type`, the values of `__TypeKind`, and every other list of a built-in type or directive are compared by name, each once. The appendix's order isn't normative. Order is graded only where the document gives one.
- **`defaultValue`** is re-parsed, and two encodings match when they coerce to the same value for the input value's type: `1` and `[1]` for `[Int]`, `1` and `1.0` for `Float`.
- **Descriptions.** §3.2 says documentation is "made available via introspection", with no key word, and §4.2 says each `description` field "may return a String or null". So `descriptions` is a SHOULD: a description the document gives, the schema's included, should come back as it is. A definition the document doesn't describe may have any description: `null`, `""` or one of the service's own. Built-ins may have any description: the spec gives none.
- **Built-in directives** (§3.13): `Matches` compares the result with `SchemaResult` for the built-in directives the service provides: the ones it returns in `directives`, and the ones the result shows it provides (below). Each one must be as §3.13 defines it. Which ones it should provide depends on the schema, since every schema here comes from SDL:
  - `@deprecated` is a MUST "if representing deprecated portions of the schema": a schema that deprecates a field, argument, input field, enum value or directive. A missing `@deprecated` there fails `deprecation`. Elsewhere it may be left out.
  - `@skip` and `@include` are a SHOULD, for every schema.
  - `@specifiedBy` is a SHOULD "if representing custom scalar definitions": a schema with a custom scalar.
  - `@oneOf` is a SHOULD "if representing OneOf Input Objects": a schema with one. It is draft only: the October 2021 edition has no OneOf input objects. A finding about it says "(draft only)".

  A missing SHOULD fails `builtinDirectives`. But "all provided directives, including any built-in directive, must be included in the set of returned directives" (§3.13), and `directives` "must return the set of all directives available within this schema including all built-in directives" (§4.2.1). So a directive the result shows the service provides is a MUST: a non-null `specifiedByURL` shows `@specifiedBy`, and a true `isOneOf` shows `@oneOf`. Leaving it out of `directives` fails `directives`, and only `directives`: the URL or the `isOneOf` is then graded against the document, as for a service that returns the directive. A wrong URL still fails `specifiedByURL`. For `__type(name:)`, the kit takes the built-in directives from the same schema's `__schema` answer, and adds those the lookup's own answer shows.

  A service that doesn't provide `@specifiedBy` or `@oneOf` can't represent them: every `specifiedByURL` is null, and every `isOneOf` false. Such a result breaks only the SHOULD. A vector whose schema applies `@specifiedBy` or `@oneOf` lists it in `needs`. If such a schema gets a request error while the profile's query is answered for other schemas (the first vector), the service doesn't provide the directive. That fails `builtinDirectives`, not `executes`.

  The reference states these conditions as `RequiredDirectiveNames`, `RecommendedDirectiveNames`, `ShownDirectiveNames` and `AsProvided`.
- **Other directives:** "GraphQL services and client tooling may provide any additional custom directive". A directive the service returns that is neither in the document nor one of §3.13's is accepted as the service describes it. So are the types its arguments reach, through input fields too, that the document doesn't define: they count as the schema's types, and as referencing the built-in scalars they use, for §3.5's rule. They must be input types, or the result fails `directives`. A type nothing in the schema reaches still fails `types`.
- **Default values** (§4.2.4): "defaultValue may return a String encoding (using the GraphQL language) of the default value used by this input value in the condition a value is not provided at runtime. If this input value has no default value, returns null." By Appendix A a lowercase "may" keeps its RFC 2119 meaning. So `null` for an input value that has a default, `n: Int = null` included, fails `defaultValueOmitted`, a SHOULD. A string that doesn't encode the default, or a string for an input value without one, fails `defaultValue`, a MUST.
- **Non-Null on built-in fields:** the types of the introspection fields come only from the definitions §4.2 introduces with "Below are the full set of type system definitions … which are fully defined in the sections below", which has no key word, and the sections below say what each field returns ("isRepeatable must return a Boolean"). A built-in field whose type differs from the spec's only in Non-Null (`isRepeatable: Boolean` for `Boolean!`) fails `builtinNullability`, a SHOULD. A field of the document's that differs only in Non-Null still fails `fields`, and a built-in argument whose type differs in Non-Null still fails `builtinDefinitions`.
- **Order** ("Stable Ordering", §4) is a SHOULD, and draft only. A list with the right items in another order fails `order` only.

What the spec doesn't allow:

- **Built-in scalars:** "all referenced built-in scalars must be included", and an unreferenced one "must not be included". The introspection types reference `String` and `Boolean`, so those two always appear.
- **Introspection types:** `types` includes the eight introspection types, since "any named type which can be found through a field of any introspection type must be included". Each field, argument and enum value §4.2 defines must be there, as it defines it.
- **`__type(name:)`:** the named type's entry in `types`, as `SchemaResult` has it, and `null` for a name the schema doesn't have: an unknown name, or a built-in scalar nothing references.
- **`isOneOf`** (§4.2.2, draft): true for a OneOf input object, false for another input object, null for every other kind. A wrong value for an input object fails `isOneOf`. A non-null `isOneOf` on a type of another kind fails `typeKinds`. Both are draft only.
- **Wrapper types** (§4.2.2): for List and Non-Null, "All other fields must return {null}". The `wrappers` vector must return each of `__Schema`'s fields once, with its type: `[__Type!]!` for `types`, and so on (`Introspection!SchemaFieldsMatch`). A field of the service's own is allowed. An empty list, `null`, a field left out or a lost wrapper fails `typeKinds`, so that an empty answer can't pass. Each wrapper among those field types must have a null `name`, `description`, `specifiedByURL`, `fields`, `interfaces`, `possibleTypes`, `enumValues` and `inputFields` (`Introspection!WrapperMatches`). Anything else fails `typeKinds`. A non-null `isOneOf` on a wrapper fails `typeKinds` too, as draft only.
- **Extending the introspection types:** no sentence of §4 forbids it. The nearest is "Below are the full set of type system definitions providing schema introspection, which are fully defined in the sections below", which has no key word, and Appendix A says "A conforming implementation of GraphQL may provide additional functionality, but must not do so where explicitly disallowed". So a field, argument or enum value an introspection type has beyond the spec's, or an introspection type of the service's own, fails `builtinAdditions`, which is informational. A definition left out or changed still fails `builtinDefinitions`, a MUST. An argument added to a built-in directive is §3.13's, and stays with `builtinDefinitions`.

| Check | Section | Level | What it covers |
| --- | --- | --- | --- |
| `envelope` | §7.1.1, §7.1.7, §7.1.8 | MUST | `data`, `errors` only as a non-empty list, `extensions` a map, no other entries |
| `executes` | §4.2 | MUST | The query executes without errors or a crash, and the result has exactly the fields it selects, nulls included |
| `roots` | §4.2.1, §3.3.1 | MUST | `queryType`, `mutationType` and `subscriptionType` |
| `types` | §4.2.1 | MUST | `types` is the set of all named types, each once |
| `builtinScalars` | §3.5, §4.2.1 | MUST | The built-in scalars the schema references, and no others |
| `typeByName` | §4.2 | MUST | `__type(name:)` returns the named type, and `null` for a name the schema doesn't have |
| `typeKinds` | §4.2.2 | MUST | Each type's kind, and which `__Type` fields are null for that kind, List and Non-Null included; `wrappers` has each of `__Schema`'s fields with its type |
| `fields` | §4.2.2, §4.2.3 | MUST | Fields of objects and interfaces, with their types |
| `arguments` | §4.2.3, §4.2.4, §4.2.6 | MUST | Arguments of fields and directives, with their types |
| `defaultValue` | §4.2.4 | MUST | Null without a default; otherwise null or an encoding of the default |
| `defaultValueOmitted` | §4.2.4 | SHOULD | An input value with a default has it encoded, not null |
| `inputFields` | §4.2.2, §4.2.4 | MUST | Input fields, with their types |
| `enumValues` | §4.2.2, §4.2.5 | MUST | Enum values |
| `interfaces` | §4.2.2 | MUST | `interfaces`, and `possibleTypes` of unions and interfaces |
| `deprecation` | §4.2.3 to §4.2.6, §3.13, §3.13.3 | MUST (Oct 2021: fields and enum values only) | `isDeprecated`, `deprecationReason`, `includeDeprecated` on every list, and `@deprecated` when the schema deprecates something |
| `specifiedByURL` | §4.2.2, §3.13.4 | MUST | A custom scalar's `@specifiedBy` URL, otherwise null |
| `isOneOf` | §4.2.2, §3.10.1 | MUST (draft only) | True for OneOf input objects, false for other input objects |
| `descriptions` | §3.2, §4.2 | SHOULD | Descriptions the document gives, the schema's included |
| `directives` | §4.2.1, §4.2.6, §3.13 | MUST | The document's directives: names, locations, `isRepeatable`; `@specifiedBy` and `@oneOf` when the result shows them provided; the service's own take input types |
| `builtinDirectives` | §3.13, §3.13.1, §3.13.2, §3.13.4, §3.13.5 | SHOULD | `@skip` and `@include`; `@specifiedBy` with a custom scalar; `@oneOf` with a OneOf input object; a schema that applies `@specifiedBy` or `@oneOf` builds |
| `builtinDefinitions` | §4.2, §3.13 | MUST | The introspection types and built-in directives are as the spec defines them, with nothing left out or changed |
| `builtinNullability` | §4.2 | SHOULD | The fields of the introspection types have the spec's Non-Null wrapping |
| `builtinAdditions` | §4.2 | INFO | The introspection types have no field, argument, enum value or type the spec doesn't define |
| `builtinEdition` | §4.2, §3.13 | INFO | Under the October 2021 profile, a built-in that differs from October 2021's is as the draft defines it |
| `typename` | §4.1 | MUST | The root's `__typename` names the query root type, and no `fields` list includes `__typename` |
| `order` | §4.2 | SHOULD (draft only) | Fields, arguments, input fields, enum values, the document's directives, union members and interfaces in source order, where the document gives one |
| `other` | §4.2 | MUST | A mismatch `Problems` can't name |

Every response exercises `envelope` and `executes`. A `__schema` result that has the selected fields exercises every other check but `typeByName`. A lookup result exercises `typeByName` and the checks about a single type, but not `roots`, `types`, `builtinScalars`, `directives` or `builtinDirectives`. The `wrappers` result exercises `typeKinds` only. A schema rejected for a directive in `needs` exercises only `builtinDirectives`. Under the October 2021 profile, nothing exercises `isOneOf` or `order`, and only it exercises `builtinEdition`.

A crash fails `executes`. A vector with `syntax` (the `directiveDeprecation` schema applies `@deprecated` to a directive definition, which only the draft's grammar has) that gets a request error, while the probe's query was answered, isn't graded: the implementation follows October 2021's grammar. `cases.notGraded` counts those, and `cases.crashed` the crashes.

A result counts toward one finding: the set of problems it has. Problems with the document's types are grouped by aspect, problems with built-ins by the exact field or argument. A finding's `draftOnly` counts its results from `"edition": "draft"` vectors, and those whose every problem rests on what only the draft has: `@oneOf`, `isOneOf` (including a non-null `isOneOf` outside input objects), order, or a built-in definition, addition or Non-Null wrapping where the answer follows October 2021, or that October 2021 doesn't define. It carries `"edition": "draft"` when all of them do. Each check's `failingDraftOnly` counts the same way, for that check alone. A crash is draft only exactly when its vector is: the draft-only vectors' schemas aren't valid October 2021 input. The run fails on any failing MUST check, a failing SHOULD check with `--strict`, an answer without `response`, or a failed self-test. An informational check never fails the run.

**Self-test** ([`kit/introspect/controls.mjs`](../../kit/introspect/controls.mjs)). Every run also evaluates responses built from the reference's expected ones, under both profiles, whichever one the run uses, and the profile choice on scripted answers. 176 of them must fail:

- each vector's expected response, which must pass (39 under the draft profile, 29 under October 2021);
- the next vector's expected response, where it differs, which must fail (31 and 22);
- 100 draft responses broken on purpose, each of which must fail the check it targets, most of them that check alone, and where it matters, must or mustn't be draft only. They cover each check: errors, `data: null`, a crash on a vector valid in both editions and on a draft-only one, a deleted `ofType`, a deleted null and an extra field (`executes`); `errors: []` and `errors: "not a list"` (`envelope`); changed and dropped document descriptions (`descriptions`); a changed default (`defaultValue`) and a null one (`defaultValueOmitted`); `__Directive.isRepeatable: Boolean` (`builtinNullability`), and `__InputValue.isDeprecated: Boolean`, which is draft only; a missing `@specifiedBy` or `@oneOf` in `directives` though the result shows it (`directives` alone); a value added to `__DirectiveLocation`, a field added to `__Type` and an introspection type of the service's own (`builtinAdditions` alone); October 2021's `includeDeprecated: Boolean` on `__Type.fields`, which is draft only, and a location on `@skip` neither edition has, which isn't (`builtinDefinitions`); `isOneOf: false` on a scalar and on a wrapper (`typeKinds`, draft only); `wrappers` with no fields, `null`, or a lost wrapper (`typeKinds` alone); `data: null` for the `directiveDeprecation` schema (`executes`: only a request error means the schema didn't build); and the rest of the checks;
- 14 October 2021 responses broken on purpose: among them, `@deprecated` and `includeDeprecated` as the draft defines them (`builtinEdition` alone), a location neither edition has (`builtinDefinitions`) and an addition neither edition has (`builtinAdditions`);
- 8 profile choices: the draft's query answered; `data: null` and a request error for it, with October 2021's answered; a service like Hot Chocolate (draft without `__Type.isOneOf`), one like Juniper, one like graphql-dotnet (draft without the fields and arguments it lacks); the draft's query without what the service lacks rejected, so October 2021; and `__Type.kind` missing, which keeps the draft profile;
- one check that a missing field counts once, under `builtinDefinitions`, in a report;
- 24 changes the spec allows, which must pass: among them `minimal` without `@deprecated`, `@specifiedBy` and `@oneOf`; `""` or the service's own description for an undescribed scalar; directives of the service's own; other encodings of default values; types, possible types, `__TypeKind`'s values and `__Type`'s fields in another order; a request error for the `directiveDeprecation` schema; a service without `__Type.isOneOf`, `__Directive.isRepeatable` or `__Schema.directives(includeDeprecated:)`; and under October 2021, a `@oneOf` of the service's own and fields out of source order.

## Vectors

[`kit/introspect/vectors.json`](../../kit/introspect/vectors.json) holds 39 vectors for 12 schemas: 24 `__schema` vectors, each schema with and without `includeDeprecated: true`, 14 lookup vectors, one per schema with `includeDeprecated: true` and one more each for `deprecation` and `inputDeprecation` without it, and the `wrappers` vector. 10 of them, for `inputDeprecation`, `directiveDeprecation` and `oneOf`, carry `"edition": "draft"` (`Introspection!IsOct2021Schema` is false). The other 29 also have `query2021`. The `scalars` vectors have `"needs": ["specifiedBy"]` and the `oneOf` vectors `"needs": ["oneOf"]` (`Introspection!OptionalDirectivesUsed`). The 9 vectors for `rich`, `builtinScalars` and `directiveDeprecation`, whose schemas declare a directive, have `"requires": ["custom-directives"]`. The 3 `directiveDeprecation` vectors also have `syntax`, which says why a request error there isn't graded. [`scripts/generate-vectors-introspect.mjs`](../../scripts/generate-vectors-introspect.mjs) writes the file. It checks each schema valid by `TypeSystem!Verdict`, with every default value coercible, then evaluates `Introspection!SchemaResult` with the spec's built-ins, the query root's name and `Introspection!TypeByName` for each lookup with tla-ts. It does the same with `Oct2021Builtins`, and checks that for a schema October 2021 can express, the result is the draft's without the draft-only fields. `--check` regenerates the file and fails if it differs. graphql-js only parses the SDL.

Each `__schema` vector's `expected.response` is the response the reference expects, without the built-ins, which every schema shares and the file holds once per profile in `builtins.draft` and `builtins.oct2021`, each in its profile's shape. Under the October 2021 profile, a vector's expected response is its `expected` without the draft-only fields. The `wrappers` vector's expected answer follows from the built-ins. A lookup vector has `lookups` (`[{ "alias", "name" }]`), and its `expected.response` has the reference's `__Type`, or `null`, under each alias. Each asks for a few of the schema's types, among them a built-in scalar or introspection type, and for `Unknown`. `minimal`, `roots` and `builtinScalars` also ask for a built-in scalar they don't reference, whose answer is `null`. Descriptions the spec leaves open are null. The kit doesn't compare responses with them directly: it evaluates `Matches` or `TypeByNameMatches`, as above. The expected responses are what the self-test starts from and what findings show.

| Family | What it exercises |
| --- | --- |
| `minimal` | `type Query { a: Int }` |
| `rich` | a schema description, a mutation root, a union, a deprecated field and enum value, input objects with defaults, a custom scalar without `@specifiedBy`, a repeatable directive `@label` with a description |
| `interfaces` | interfaces implementing interfaces, `possibleTypes`, deep wrapping types |
| `defaults` | default values for lists, floats, IDs, input objects, strings with escapes, null and enums |
| `deprecation` | deprecated fields and enum values, with and without reasons, and an object whose only field is deprecated |
| `inputDeprecation` | deprecated arguments and input fields: draft only |
| `directiveDeprecation` | a deprecated directive: draft only, draft-only syntax |
| `roots` | a schema definition with a subscription root, and a type named `Mutation` that isn't a root |
| `builtinScalars` | `Float` referenced by a directive argument only, `ID` by an input field only |
| `scalars` | custom scalars with and without `@specifiedBy`: needs `@specifiedBy` |
| `oneOf` | OneOf and plain input objects: draft only, needs `@oneOf` |
| `order` | fields, arguments, enum values, union members and interfaces out of alphabetical order |
| `wrappers` | the List and Non-Null types of `__Schema`'s fields, with every `__Type` field selected |

## graphql-js

[`adapters/graphql-js/areas/introspect.mjs`](../../adapters/graphql-js/areas/introspect.mjs) runs `buildSchema`, then `graphqlSync` with the query. Both 16 and 17 answer the draft's query, so both are graded under the draft profile. Every `__schema` result differs from the spec's built-ins, on the deviations `differential-type-system.mjs` documents in `INTROSPECTION_DEVIATIONS`. They aren't encoded as expected answers. Every lookup that builds passes, and every other check passes, wrapper types included.

- **17:** `__DirectiveLocation` has `FRAGMENT_VARIABLE_DEFINITION`, for fragment arguments, which neither edition has. That is an addition, so it fails only `builtinAdditions`, which is informational, and the run passes.
- **16** has the draft's fields (`isOneOf`, input value and directive deprecation, `DIRECTIVE_DEFINITION`, `@oneOf`), with some October 2021 definitions, which fail `builtinDefinitions`, all of them draft only:
  - `@deprecated(reason: String = …)`, and `includeDeprecated: Boolean = false` on `__Type.fields` and `enumValues`: the draft has `String!` and `Boolean!`, and October 2021 has what 16 has. The finding says so for each;
  - `includeDeprecated: Boolean = false` on `__Type.inputFields`, `__Field.args` and `__Directive.args`: the draft has `Boolean!`, and October 2021 has no argument there;
  - 16 can't parse `directive @old @deprecated on FIELD`, which only the draft's grammar allows, so the three `directiveDeprecation` vectors aren't graded.

## Limits

- **`__type(name:)` for a few names:** each lookup vector asks for four to six names. The kit doesn't ask for every type, nor for the service's own types.
- **Built-ins compared by name:** the comparison assumes the spec's introspection types, in any order. A field, argument or enum value a service adds fails only `builtinAdditions`, as graphql-js 17's does, and the kit doesn't select it.
- **Missing fields hide what they would show:** a service without, say, `__Type.isOneOf` counts that once, and its `isOneOf` values aren't graded at all. Without a field the kit can't do without (`__Type.kind`, `__Field.type`, `ofType`), only `executes` is graded.
- **One profile per run, from one vector:** the profile is chosen by the answer for `minimal`. An implementation that answers the draft's query for some schemas but not others is graded against the draft.
- **Wrapper types of `__Schema`'s fields only:** the kit selects every field of a List or Non-Null type only in the `wrappers` vector (`[__Type!]!`, `__Type!`, `[__Directive!]!`). Elsewhere `TypeRef` selects `kind`, `name` and `ofType`.
- **`@skip` and `@include` aren't probed:** the kit never executes a query that uses them. A service that supports them but leaves them out of `directives` breaks a MUST, and fails only the SHOULD `builtinDirectives`.
- **`needs` and `syntax` are guesses about the cause:** a request error for a schema in `needs` counts as not providing the directive, and one for a schema with `syntax` as not having the draft's grammar, provided the same query is answered for `minimal`. The kit doesn't read error messages. A service that drops `@specifiedBy` or `@oneOf` from `directives` and also from its types can't be told apart from one that doesn't provide them: both break only a SHOULD.
- **No extensions:** the schemas have no `extend` definitions, since `TypeSystem.tla`'s data comes from definitions.
