# Fragment arguments (graphql-spec#1081)

Fragment arguments are a proposal, not part of any release: [graphql-spec#1081](https://github.com/graphql/graphql-spec/pull/1081). A fragment definition may define variables, and a fragment spread may give them values:

```graphql
query ($flag: Boolean!) {
  user { ...Card(email: true, flag: $flag) }
}

fragment Card($email: Boolean! = false, $flag: Boolean! = true) on User {
  name @skip(if: $flag)
  email @include(if: $email)
}
```

This repository states the proposal as its text stood at commit [`dfd8475`](https://github.com/graphql/graphql-spec/pull/1081/commits/dfd847524d25b27c210186e10c58a08977f856eb) (2026-11-28), next to September 2026. The edition the kit grades is still September 2026, and nothing here changes a September 2026 verdict:

- the parser reads the new syntax only when asked to;
- for a document without fragment variables and spread arguments, validation, coercion and execution are the operators they were;
- the kit runs the proposal's fixtures only for an adapter that claims `fragment-arguments`, and reports what they find under an informational check.

When the proposal's text changes, the modules below change with it. Each quotes the sentence it follows.

## What is stated, and where

| Part of the proposal | Module | How it is checked |
| --- | --- | --- |
| §2 grammar: `FragmentSpread : ... FragmentName Arguments? Directives?` and `FragmentDefinition : Description? fragment FragmentName VariablesDefinition? TypeCondition Directives? SelectionSet` | `Parser.tla`: `ParseExecutableWith(source, {FragmentArguments})`, `ParseDocumentWith(source, grammar, {FragmentArguments})`. `ParseExecutable` and `ParseDocument` are September 2026 and reject both | 33 vectors and three properties (`FragmentArgumentsParse`, `FragmentArgumentsAreNew`, `FragmentArgumentsOnlyAdd`), four mutants, and a differential against graphql-js 17's `experimentalFragmentArguments` parser over 45,882 inputs (`scripts/differential-lexer.mjs`) |
| §5 validation: `SameArguments` and `SameVariableScope` in Field Selection Merging, the spread pair check, Argument Names, Argument Uniqueness and Required Arguments for spreads, Variable Uniqueness and Variables Are Input Types for fragments, All Variable Uses Defined, All Variables Used and All Variable Usages Are Allowed with fragment variables | `Validation.tla` | 56 vectors, the proposal's own examples among them (`FragmentArgumentExamplesHold`), and 19 mutants (`validation-fragment-arguments.mutants.mjs`) |
| §6 coercion: fragment variable values, `GetScopedVariableValues`, `CoerceFieldArgumentValues`, a spread's `CoerceArgumentValues`, and what the response is when it raises | `Coercion.tla`, "Fragment arguments" | 48 cases (`FragmentArgumentExamples`) and 12 mutants |
| §6 execution: `CollectFields` with fragment variables, field details, `CollectSubfields` | `Reference.tla`, and the executor `specs/execution.ts`, which `ExecutionConformance.tla` checks against it | The fixtures `fragmentArguments` (two variants), `fragmentArgumentsDetails` and `fragmentArgumentsNull`, and eight mutants |
| An implementation | The kit's execution area: capability `fragment-arguments`, INFO check `fragmentArguments` ([conformance.md](conformance.md#fragment-arguments)) | graphql-js 17.1.0 passes all 6,312 cases of the four fixtures (7,638 distinct cases in the run, all passing) |

Not done, and so not claimed:

- The kit's `parse`, `validate` and `coerce` areas have no vectors for the proposal. Their vectors are September 2026's, and an implementation's parser or validator for the proposal is not graded. Only graphql-js 17's parser is compared, by the differential.
- `scripts/differential-validation.mjs` and `scripts/differential-coercion.mjs` don't run graphql-js 17's experimental validation and coercion against the proposal's operators. The differences from graphql-js listed below were found by hand, not by a differential.
- Execution fixtures model `@skip` and `@include` only, so their fragment variables are Boolean. Field arguments that read fragment variables are stated in `Coercion.tla` and not run through the kit.
- An execution error's `locations` for a spread whose arguments can't be coerced. The proposal doesn't say which syntax element the error is associated with.
- A spread argument that fails at the root selection set (gap 1 below). `Reference.tla` and `Coercion.tla` take a reading; `specs/execution.ts` doesn't model it, and `scripts/generate-fixtures.mjs` refuses a fixture that could get there.

## Readings

Where the text needs reading, this is what the modules take. Two other models reviewed each one, in two rounds (see [Review](#review)); none is left with an objection that changes a verdict.

**Grammar.** Exactly the proposal's. A spread's arguments come before its directives, a fragment's variables before its type condition. `...F()` and `fragment F() on T` are syntax errors (`Arguments : ( Argument+ )`, `VariablesDefinition : ( VariableDefinition+ )`). A spread's arguments may hold variables; a fragment variable's default and directives are constant, as an operation's are. Nothing is ambiguous: `... on (` starts neither a spread (`FragmentName : Name but not on`) nor an inline fragment.

**"Visited via" (Field Selection Merging).** The proposal makes a selection reached through several spreads "a distinct member … for each". A member here is a selection together with the path of spreads it was reached through, each with its name and arguments, and the fragment definition the set being validated is written in, if any. Two visits through spreads with the same name and arguments are one member: every comparison either visit takes part in has the same answer, so the verdict doesn't depend on keeping them apart.

**`SameArguments`: "identical sets of arguments".** September 2026 doesn't define "identical" ([spec-gaps.md](spec-gaps.md), item 21), and the proposal uses the phrase for spreads too. Here it is equality of the values as written: `...F` and `...F(x: 5)` differ though `$x` defaults to 5, and `1` differs from `1.0`. Two variables are identical when they have the same name and `SameVariableScope` holds.

**`SameVariableScope`.** Two usages of an operation variable are in the same scope. Two usages of a fragment's variable are in the same scope when they were reached through spreads of that fragment with `SameArguments`, compared in the scopes those spreads are in, recursively.

**The spread pair check.** "Given each pair of members … that are both FragmentSpread" with the same name must have `SameArguments`. It applies in every set `FieldsInSetCanMerge` is called on, the `mergedSet` of two fields' sub-selections included, and whatever the parent types are. That is what the text says; see gap 2.

**All Variables Used.** A fragment's variable must be used in the fragment's selection set. A use in a spread's arguments there counts. A use only in a directive on the fragment definition itself does not: the text says "within the fragment's selection set" by way of `variableUsages` of the selection set.

**Which definition a usage refers to.** A usage inside a fragment definition refers to the fragment's variable if the fragment defines that name, and to the operation's otherwise. This is lexical. The rules that depend on the operation (defined, used, usages allowed) are evaluated for each operation that reaches the fragment.

**Directives on a fragment variable definition** are at `VARIABLE_DEFINITION`. The proposal adds no directive location.

**All Variable Usages Are Allowed, in a spread's arguments.** A variable given directly as an argument's value is checked against the fragment variable's type, and the fragment variable's default counts as the location's default value, as an argument definition's default does for a field. So `query ($v: Int) { ...F(x: $v) }` is valid with `fragment F($x: Int! = 5)`. A variable inside a list or an input object in the argument gets no such default, as in §5.8.5.

**When a spread's arguments are coerced.** In `CollectFields`, after the spread's `@skip` and `@include`, after the visited check, and after `DoesFragmentTypeApply`. So a spread that is skipped, already visited, or doesn't apply never raises. All of a fragment's variables are coerced when the spread is collected, used or not.

**`GetScopedVariableValues`.** Inside a fragment, the fragment's variable hides the operation's variable of the same name, even when the fragment's has no value. No value and null stay distinct: a variable with no value leaves a field argument out, where null provides null.

**Field details.** A collected field keeps the fragment variables it was selected under. `ExecuteField` coerces a field's arguments with the first detail's. `CollectSubfields` collects each detail's selection set with that detail's fragment variables, and with visited fragments of its own.

**`@skip` and `@include` with a variable that is null or has no value** are "not true", so the selection is not skipped and not included. This is September 2026's open question ([spec-gaps.md](spec-gaps.md), item 30), which the proposal makes reachable from a literal: `...F(b: null)` with `fragment F($b: Boolean = false)`. The kit doesn't grade it.

**A spread whose arguments can't be coerced.** `CoerceArgumentValues` "raise[s] an execution error". Where the selection set being collected is a field's, the error is that field's: `CompleteValue` was completing its position, so the position is null with an error at its path (a list item's path for an item), none of its fields is executed, and the error propagates from there as any other. For a subscription's root selection set it is a request error: `CreateSourceEventStream` collects the root fields before operation execution begins (§7.1.5). For a query's or mutation's root selection set, see gap 1.

## Gaps in the proposal's text

These are places where the text at `dfd8475` leaves a choice or says less than it seems to. Each could be settled with a sentence.

1. **A spread at the root whose arguments can't be coerced.** `ExecuteRootSelectionSet` calls `CollectFields`, which now can raise, before any field is executed. No response position exists for §6.4.4 to null, and §7.1.6 wants an execution error to have a path. The reading here: operation execution has begun (§6.2), so the result is an execution result and not a request error; no root resolver is called; `data` is null (a should, as for an error that propagates to the root: every position between the root and the error is Non-Null, of which there are none); there is at least one error; its `path` is not graded. graphql-js 17.1.0 does this, with an error that has no path. A sentence for `ExecuteRootSelectionSet`: "If collecting the root selection set raises an execution error, return an execution result with null data and that error without a response path, before executing any root field."
2. **The spread pair check is stricter than the proposal's own execution needs.** `{ a { ...I(b: true) } a { ...I(b: $b) } }` is invalid: the two spreads meet in `mergedSet`. Under the proposal's `CollectSubfields`, each `a` is collected with fresh visited fragments and its own fragment variables, so both spreads would be collected, each with its own value, and the fields they select are compared by the field pair rule anyway. The check is needed by an implementation that shares one set of visited fragments across a field's details, as graphql-js does: there the second spread is dropped, and the result would depend on order. A Note would say which the text intends: "The check of spreads within {mergedSet} permits sharing {visitedFragments} across the entries of {fieldDetailsList} in {CollectSubfields()}."
3. **"Identical sets of arguments"** is now also the test for spreads, and still undefined (item 21 of [spec-gaps.md](spec-gaps.md)). With defaults in play the question has a new case: is `...F` identical to `...F(x: 5)` when 5 is the default?
4. **A variable used only in a directive on the fragment definition** (`fragment F($x: Boolean) on T @d(if: $x)`) is not a use within the fragment's selection set, so All Variables Used rejects it. If that is meant to be allowed, the rule needs to say so.
5. **The location of a directive on a fragment's variable definition.** The text adds none, so it is `VARIABLE_DEFINITION`. graphql-js has `FRAGMENT_VARIABLE_DEFINITION`.
6. **A spread's argument and the fragment variable's default.** All Variable Usages Are Allowed speaks of the location's default value for arguments and input fields. That a fragment variable's default plays that part for a spread's argument follows from "the argument definitions of a fragment are its variable definitions", but no sentence says it, and graphql-js decides the other way.
7. **`@skip(if: $b)` with `$b` null** was reachable only through a nullable operation variable with a null value. `...F(b: null)` makes it a matter of two literals.
8. **Executable directives on merged fields** other than `@skip` and `@include` are taken from the first field and never compared. This predates the proposal; fragment variables make it easier to write two merged fields whose directive arguments differ.

Neither reviewer found a document that the merging rule accepts and that executes ambiguously: every field set at runtime comes from the root selection set by collection and merging, the root call of `FieldsInSetCanMerge` follows that chain pair by pair with full spread paths, and a pair that passes `SameArguments` has equal values wherever its arguments read fragment variables. The rule rejects some documents that would execute unambiguously (`fragment H($x: Int) on Query { a { f(arg: $x) } ...K(x: $x) }` with a `K` that selects the same field), which is conservative, not unsound. Listing every pair of spread paths can take exponential time in the depth of nested spreads; the proposal's rule shares that with September 2026's.

## Where graphql-js 17.1.0 differs

With `parse(document, { experimentalFragmentArguments: true })`:

| | The proposal's text, as read here | graphql-js 17.1.0 |
| --- | --- | --- |
| `query ($v: Int) { ...F(x: $v) }` with `fragment F($x: Int! = 5)` | Valid: the fragment variable's default is the location's default | `Variable "$v" of type "Int" used in position expecting type "Int!"` |
| `fragment F($x: Boolean) on T @d(if: $x) { f }` | `$x` is never used | Valid |
| `fragment F($x: Int @d) on T`, with `@d on VARIABLE_DEFINITION` | Valid | `Directive "@d" may not be used on FRAGMENT_VARIABLE_DEFINITION` |
| `...F(b: null)`, `fragment F($b: Boolean = false) { f @include(if: $b) }` | `f` is not included (not graded) | An execution error: `@include(if:)` is Non-Null |

It agrees on everything the fixtures run: shadowing, defaults, forwarding, field details, and a Non-Null fragment variable given null, which nulls the field whose sub-selection was being collected with an error at its path.

## Review

The semantics above were put to two other models, GPT-6.2 Sol and Claude Opus 5.5, in two rounds: first the open questions with the proposal's text and graphql-js's behaviour, then each one's answers to the other together with the decisions taken. What changed because of it:

- The root failure (gap 1) went from "unspecified, grade nothing" to the reading above. Both argued independently that the text fixes the result's shape, from §6.2 and §7.1.5, and that only `path` and `locations` are open.
- A spread argument's location default (All Variable Usages Are Allowed) was limited to a variable given directly as the argument's value, not one inside a list or object.
- The spread pair check stays as the text has it, with gap 2 recorded. One reviewer showed that dropping it would make graphql-js's shared visited set observable.
- Coercion counts across field details are not graded: an implementation may coerce a spread's arguments once for a field set or once per detail.
- One objection was not taken: keeping two visits through identical spreads as separate members. The text does make them distinct members; the modules merge them because no comparison can tell them apart, so the verdict is the same.
