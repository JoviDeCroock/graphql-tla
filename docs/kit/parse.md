# The parse area

`graphql-tla run parse` checks the language: whether an implementation accepts a source text exactly when it is a syntactically valid executable document and, for an adapter that claims `parse-sdl`, a valid type system document. The reference is [`specs/Parser.tla`](../../specs/Parser.tla): `ParseExecutable`, a recursive-descent reading of ExecutableDocument, and `ParseDocument`, which reads a source as any of the four document grammars, both over the tokens that `Lex` in [`specs/Lexer.tla`](../../specs/Lexer.tla) produces. Together they cover §2.1 Source Text, with its lexical tokens and ignored tokens, through §2.13 Directives, and the type system language of §3 (TypeSystemDocument and TypeSystemExtensionDocument, every type system definition and extension).

```shell
npx graphql-tla run parse --adapter "node adapters/graphql-js/adapter.mjs --graphql 17" --strict --report parse.json
```

The area follows [the contract for areas beyond execution](../kit-areas.md).

## Grammars

Each vector reads its source as one document grammar:

| `grammar` | Production | Definitions it allows |
| --- | --- | --- |
| absent | ExecutableDocument : ExecutableDefinition+ (§2.3) | operations and fragments |
| `"typeSystem"` | TypeSystemDocument : TypeSystemDefinition+ (§3) | schema, type and directive definitions |
| `"typeSystemExtension"` | TypeSystemExtensionDocument : TypeSystemDefinitionOrExtension+ (§3.1) | those, and schema, type and directive extensions |
| `"document"` | Document : Definition+ (§2.3) | all of the above |

Vectors without `grammar` are asked of every adapter. Vectors with one are asked only of an adapter that claims the `parse-sdl` capability; for any other they are skipped, and the report's provenance counts them under `skipped` as `"needs capability parse-sdl"`. Claim it if your implementation can parse the type system language at all: an implementation that parses only executable documents has nothing to answer these with.

§2.14 Schema Coordinates isn't covered here: the `coordinate` area grades it.

## Request

```json
{"type":"parse","id":12,"source":"query ($a: [Int!] = [1]) { f(x: $a) }"}
```

- **`source`:** the source text, as a JSON string.
- **`grammar`:** only for adapters that claim `parse-sdl`, and only when the vector names one: `"typeSystem"`, `"typeSystemExtension"` or `"document"` (see [Grammars](#grammars)). When it is absent, the grammar is ExecutableDocument, as before. The kit never sends `"executable"`, but an adapter may accept it as the same thing.

```json
{"type":"parse","id":13,"source":"extend type T @d","grammar":"typeSystemExtension"}
```

Parse it with your implementation's default options, the way it parses a request's document, or, for a type system grammar, the way it parses a schema's SDL. Don't turn on options that relax the grammar, such as graphql-js's old `allowLegacySDLEmptyFields`.

## Result

```json
{"type":"result","id":12,"ok":true}
```

- **`ok`:** whether the source is a syntactically valid document of the grammar: an executable document when the request has no `grammar`. A parse error is `false`; it is an answer, not an adapter error.

Two cases need care:

- **Definitions the grammar doesn't allow.** Most parsers read one Document that holds every kind of definition. Answer `false` when the source holds a definition the grammar doesn't allow (see the table above): a type definition when there is no `grammar`, an operation or an extension for `"typeSystem"`, an operation for `"typeSystemExtension"`. Only syntax counts: `"typeSystem"` accepts `type T` and `type T` twice, and `extend type T @d` in a `"typeSystemExtension"` document needs no `type T` to extend. Building a schema is the `schema` area's work, not this one's. The graphql-js adapter parses, then checks the kind of every definition ([`adapters/graphql-js/areas/parse.mjs`](../../adapters/graphql-js/areas/parse.mjs)).
- **Lone surrogates.** A few sources hold an unpaired surrogate, such as `"\ud800"` in the JSON. It hasn't been a SourceCharacter since September 2025, so the reference always rejects these. October 2021 counts a surrogate as a SourceCharacter, so the vectors with one inside a string have `since` September 2025 (see Editions). If your adapter's JSON parser or strings can't carry one to the implementation, answer `unsupported` (see [the last section](#sources-an-adapter-cant-receive)), never `ok: false`: a rejection the implementation never made would pass on every one of these vectors.

Any other fields in the result are ignored.

**Crashes.** If the parser crashes on a source, say with an index out of range or a null dereference, rather than accepting or rejecting it, answer `{"type":"error","id":12,"message":"…"}`. The kit reports the vector as a crash and goes on ([the protocol](../kit-areas.md#protocol)). Only the message's first line reaches the report. Answer `ok: false` only for the parser's own syntax errors: an adapter that turns every exception into `ok: false` hides its crashes, which then pass on every source the reference rejects.

## What is checked

One check per section of the grammar, 51 in all, each at MUST level, with the productions it grades as its `basis` in [`kit/parse/run.mjs`](../../kit/parse/run.mjs). The level comes from §2: "The lexical token sequence, omitting {Ignored}, must be described by a single {Document} syntactic grammar." 31 are for §2: §2.1 and its subsections from White Space to Names, §2.2 Descriptions, and §2.3 Document to §2.13 Directives, including each kind of input value in §2.10.1 to §2.10.8. 20 are for §3, graded only with `parse-sdl` (an adapter without it reports them `untested`):

- §3.1 Type System Extensions (`typeSystemDocuments`): which definitions each type system document holds. Vectors about TypeSystemDocument itself rest here too, since kit/spec-sections.json has no entry for §3;
- §3.2 Descriptions (`typeSystemDescriptions`): a description before each definition, field, argument, input field and enum value, and never before an extension;
- §3.3 Schema (`schemaDefinition`) and §3.3.2 Schema Extension (`schemaExtension`);
- §3.4.3 Type Extensions (`typeExtensions`): `extend` followed by something other than a type system keyword;
- each kind of type and its extension: §3.5 and §3.5.6 for scalars, §3.6 and §3.6.3 for objects, with §3.6.1 Field Arguments (`argumentsDefinition`), §3.7 and §3.7.1 for interfaces, §3.8 and §3.8.1 for unions, §3.9 and §3.9.1 for enums, §3.10 and §3.10.2 for input objects;
- §3.13 Directives (`directiveDefinition`) and §3.13.6 Directive Extensions (`directiveExtension`, `since: "September2026"`).

A vector for a type system grammar can still rest on a §2 section: `enum E { true }` rests on §2.10.6 Enum Value (`EnumValue : Name but not true, false or null`), and `type T { f: Int = $v }` on §2.10 Input Values (`[Const]`).

Each vector cites the sections it exercises. The first is the one its verdict rests on. A wrong answer counts against that section's check only, and toward one finding:

- **accepts what §X rejects:** the implementation accepted a source that, by the reference, breaks a rule of §X;
- **rejects what §X accepts:** it rejected a source that §X allows;
- **crashes on a source §X accepts**, or **rejects:** the adapter answered with an `error`, or with `unsupported` for a source that holds no lone surrogate. A crash fails the check like a wrong answer, whatever the vector's verdict, since the implementation gave none. It is never counted by release: every source is an input the parser must answer in every release, so a crash fails under October 2021 too, even on a vector with `since`. Its finding has `"kind": "crash"`, and its `problem` is the adapter's message. The run's summary counts crashes apart from agreements.

**Crash probes.** 20 vectors have `"probe": true`: sources much deeper or longer than the others, to see whether the parser survives them. They hold 1000 nested selection sets, inline fragments, lists, input objects or list types (in a variable's type, and in a field definition's), 2000 fields, 2000 operations, 2000 field definitions or 2000 union members, a 4000-character name, string, block string, comment or run of escapes, a 1001-digit Int, and a Float with a 1000-digit fraction and a 1000-digit exponent. The three in type definitions need `parse-sdl`. The spec sets no limit an implementation must reach, and an implementation may reject a document that is too deep or too long for it, so a probe is graded for crashes only: a probe answered with an `error` (a stack overflow, say) fails its check and makes a crash finding, and any `ok` passes, whatever the reference's verdict. Three are rejected by the reference: 1000 selection sets and 1000 lists left open, and a 4000-character string with no closing quote. A parser that recurses or scans to the end before it fails can crash on those too. An implementation with a documented depth limit should answer `ok: false` when it hits it: that is a refusal, not a crash.

A check is `pass` when some vector cites its section and none of the vectors resting on it got a wrong answer. Findings count their vectors with `since` per release (`since`, such as `{"September2025": 21}`) and mark their example `[since September 2025]` or `[since September 2026]`; a finding whose `since` counts add up to its `cases` fails only under that release and later ones. Each check gives `failingSince`, how many of its failing vectors rest on rules from each release (zeros left out), so a check whose failures all rest on newer rules can be told apart. The report's `since` gives, per release, how many vectors have that `since` (`vectors`) and how many of those got a wrong answer (`failing`). Crashes count in none of these. A run that grades no vector at all isn't ok. Every run also checks the checker: it must flag every verdict flipped, flag exactly the vectors whose answer differs when each one gets the next vector's answer, count results without `ok` as malformed, count every vector as a crash when each answer is a crash, even one carrying the right `ok`, with every section a verdict rests on failing and no crash counted toward a release, count every flipped verdict on a vector with `since` toward that release, in its check and in its finding, flag none of the reference's own answers, and, when every answer is `unsupported`, leave ungraded only the vectors with a lone surrogate, count every other one as a crash, and fail a run that grades nothing. It must also flag no flipped verdict on a crash probe, and ask an adapter without `parse-sdl` every vector without a grammar, never with one, and an adapter with it every vector (10 controls).

## The vectors

[`kit/parse/vectors.json`](../../kit/parse/vectors.json) holds 2847 vectors: 1295 accepted and 1552 rejected. 2134 have no `grammar`; 380 read their source as `"typeSystem"` (141 accepted), 181 as `"typeSystemExtension"` (80 accepted) and 152 as `"document"` (79 accepted). 20 are crash probes. [`scripts/generate-vectors-parse.mjs`](../../scripts/generate-vectors-parse.mjs) writes it, taking every answer from `ParseDocument` (which is `ParseExecutable` for an executable document), evaluated by tla-ts. `--check` regenerates it and fails if it differs. Vectors 1 to 2007 are the executable vectors from before the type system grammar was added, unchanged; the rest come after them.

The sources come from the families of the lexer and parser differential ([`scripts/differential-lexer.mjs`](../../scripts/differential-lexer.mjs)):

- the hand-written vectors of `Lexer.tla` and `Parser.tla`, with the spec's own examples;
- every sequence of up to two to five atoms over each of the lexer's alphabets, placed where the grammar allows that token: inside `"…"` and `"""…"""` as an argument value, numbers in a list, ignored tokens between two fields, names, dots, and characters that start no token;
- every sequence of up to three tokens over the parser's alphabets, in the differential's contexts: values, variable definitions, what follows a field, fragment definitions;
- seeded random documents over the executable grammar, and one-token mutations of them;
- three Int Values beyond 32 and 64 bits, such as `{a(x: [2147483648])}`. §2.10.1 puts no bound on an IntValue: the range of Int is a matter of input coercion (§3.5.1), so these must parse;
- edge cases written by hand: comments at the very end (`{a} # end`, `{a}#`), commas where an item is required (`{a(,)}`, `query (,) {a}`, rejected, since commas are ignored and `Arguments` needs one Argument) and where they are only noise (`{,a,,b,}`), keywords as variable names (`$on`, `$true`, `$null`, `$query`), two booleans, nulls or enum values where one value goes (`{a(x: true false)}`, rejected, next to `{a(x: [true false])}`), and each kind of type system definition and extension as an executable document (rejected, §2.3);
- a Byte Order Mark at the start of a document, before a comment, twice, at the end, alone (rejected: no definition) and before a type definition;
- raw characters (`raw-characters`): each of U+0000, U+0001, U+0008, U+000B, U+000C, U+001F, U+007F, U+0080, U+0085, U+009F, U+00AD, U+2028, U+2029, U+E000, U+FDD0, U+FEFF, U+FFFE, U+FFFF and U+10FFFF, raw inside `"…"`, inside `"""…"""` and in a comment (all accepted: each is a SourceCharacter and none is a LineTerminator, and noncharacters such as U+FFFE are scalar values like any other), and outside any token (rejected, §2.1.5), except U+FEFF, which is ignored there;
- the hand-written vectors of `Parser.tla`'s type system section (`grammar-examples`), for every definition and extension, the four grammars, descriptions, `[Const]` values and directives, and the lookaheads;
- every sequence of up to three or four atoms over small alphabets for union members, implemented interfaces, directive definitions (`directive @d … FIELD`), extensions (`extend …`) and enum values;
- seeded random type system documents over the type system grammar, each read as one of the three grammars, and one-token mutations of them (`type-system-documents`);
- the crash probes.

About 42,000 candidates are evaluated, and a few thousand are kept. Most of those kept come in **minimal pairs**: a rejected source next to an accepted sibling one edit away, where one atom or token is deleted, replaced or inserted. The pair rests on the section of that edit:

- for a lexical rejection, the token where `Lex` fails: a string, a number, a lone `.`, a character that starts no token, or a code point that isn't a SourceCharacter. In the string and block-string families, a character that starts no token right after the string means the string ended where the edit made it end, so the pair rests on §2.10.4 String Value: `{a(x: """"\"""""")}` is a block string holding `"\"""`, and an implementation that ends it at the first `"""` fails §2.10.4, not §2.1.5 Lexical Tokens;
- otherwise, the production the edited token belongs to. Each alphabet says which section each of its tokens is about, and the random documents record the production each token came from. A string inserted before a definition, after a description or at the end is a description (§2.2), as in `"d" {a}`: the query shorthand takes none. Deleting a whole description is an edit of the definition it described, since a description is optional. In a type system document a string is a description before a definition, a field, an argument, an input field or an enum value (§3.2), and an edit at the start or the end of the document, or between definitions, rests on the document's grammar: §3.1 for `"typeSystem"` and `"typeSystemExtension"`, §2.3 for `"document"`.

The reference only says accepted or rejected, so the sections are the generator's attribution of one edit. Most read naturally: `{a(x: [00])}` next to `{a(x: [0])}` rests on §2.10.1, and `query ($a: Int = $b) {a}` on §2.11. A few are judgement calls. An accepted sibling in the numbers family rests first on the kind of value it holds: `{a(x: [0-0])}`, the two Int Values `0` and `-0`, rests on §2.10.1, though its sibling `{a(x: [0-.])}` fails at a Float Value. A control character inside a comment is a CommentChar, so an accepted source with one, such as `{a#\f\rb}`, rests on §2.1 Source Text, where the releases differ, and not on §2.1.1 White Space. `{a @d()}` breaks `Arguments : ( Argument+ )`, so it rests on §2.7, like `{a()}`.

Some accepted documents use grammar that an implementation can lack whatever edit the vector was chosen for. Such a document rests first on that grammar's section, so one missing rule makes one finding instead of spreading over the sections of every edit near it:

- an empty selection set (§2.5, new in September 2026) or a description on an operation, fragment or variable (§2.2, new in September 2025);
- a keyword, such as `on` or `query`, as a variable's type (§2.12): `NamedType : Name`, with no names excluded, unlike `FragmentName` and `EnumValue`;
- a Byte Order Mark between tokens (§2.1.6): "a _Byte Order Mark_ may appear before or after any lexical token and is {Ignored}".

A document with more than one of these rests on the first in that order. To keep that rare, a random document with a description, an empty selection set or a keyword type separates its tokens with spaces instead of a Byte Order Mark, and so does its sibling. No accepted vector has both a Byte Order Mark and one of the others. 6 accepted vectors have both a description and a keyword type, and rest on §2.2.

**Editions.** The verdicts are the September 2026 edition's. A vector whose verdict is different under the October 2021 edition carries `since`, the first release whose text gives its verdict (`"September2025"` or `"September2026"`), with the reason in `editionNote`. It is graded like any other, but an implementation of an older release can fail it and still follow its release. Crash probes never have `since`. October 2021's grammar of executable documents differs in four ways, three changed in September 2025 and one in September 2026:

- `SelectionSet : { Selection+ }`, so no empty selection sets (11 accepted vectors). September 2025 still has `Selection+`; September 2026 has `SelectionSet : { Selection* }` (graphql-spec#1227), so these 11 have `since` September 2026;
- no `Description` on an operation, fragment or variable definition (85 accepted vectors). September 2025 added them: `OperationDefinition : Description? OperationType Name? …`, `FragmentDefinition : Description? fragment …`, `VariableDefinition : Description? Variable : …`;
- `EscapedUnicode :: /[0-9A-Fa-f]{4}/`, so no `\u{…}` escapes (6 accepted vectors). Its value is "the code point {value}", with no rule about surrogates, so a fixed-width escape of a lone surrogate is valid there. Since September 2025 "The hexadecimal number encoded by a Unicode escape sequence must describe a _Unicode scalar value_, otherwise must result in a parse error" (9 rejected vectors, such as `{a(x: "\uD83D")}`);
- `SourceCharacter` is U+0009, U+000A, U+000D and U+0020–U+FFFF. That leaves out the other control characters, such as a vertical tab in a comment, and code points above U+FFFF, such as a raw U+1F600 in a string (27 accepted vectors in all). It lets in surrogates, so a raw lone surrogate in a string is valid there (3 rejected vectors). Since September 2025 `SourceCharacter` is "Any Unicode scalar value", and "an unpaired _surrogate code point_ is not a valid source character". Read as UTF-16 code units, "U+0020–U+FFFF" would allow U+1F600 as a surrogate pair. The kit takes the literal reading, which only adds 2 vectors to the September 2025 count.

September 2025 is September 2026 without empty selection sets, so its grammar is a subset of September 2026's: a source September 2026 rejects, September 2025 rejects too. The generator finds the differences from the reference: it rewrites each source into one that October 2021 reads the same way under September 2026's rules (a surrogate escape becomes `\u0041`, a raw surrogate in a string or comment becomes `a`), evaluates that with `ParseExecutable`, and then applies the newer grammar above. An accepted vector needs every newer rule it uses, so its `since` is the latest of their releases; a rejected one has `since` September 2025.

The type system grammar is the same in October 2021 and September 2025. September 2026 adds two things:

- `Directives[Const]?` on DirectiveDefinition, between its arguments and `repeatable`, and the location `DIRECTIVE_DEFINITION` (6 accepted vectors, such as `directive @d @x on FIELD`);
- DirectiveExtension : `extend directive @ Name Directives[Const]` (§3.13.6; 14 accepted vectors, such as `extend directive @d @x`).

A source that uses either is rejected by the older editions, so these have `since` September 2026. In all, 161 vectors have `since`: 130 September 2025 (118 accepted, 12 rejected) and 31 September 2026 (all accepted).

The vectors catch every bug in `specs/lexer.mutants.mjs` and `specs/parser.mutants.mjs` that changes whether a source is accepted, the type system ones included. The others change a token's value, a tree or what counts as a well printed string, which the area doesn't grade.

## Limits

- **Accepted or rejected, nothing more.** The area doesn't compare parse trees, token values or error positions, for either kind of document. An implementation that decodes `\b` wrongly, dedents a block string wrongly, drops a list item or reads `true` as an enum value passes here. String values are graded elsewhere: the coerce area's `stringValue` check (§2.10.4, [coerce](coerce.md)) passes string literals with escapes and block strings as arguments and compares the text the resolver gets with `Lexer.tla`'s, so wrong escape decoding or block string dedenting fails there. The rest the differential checks for graphql-js only.
- **Thin sections.** §2.10.3 Boolean Value (6 vectors), §2.10.5 Null Value (4) and §2.1.4 Insignificant Commas (13) have few vectors resting on them, though each now has rejected ones: two values where one goes, and commas where an item is required. §2.1.6 Ignored Tokens has many, nearly all of them accepted documents with a Byte Order Mark between tokens.
- **Short sources, and probes graded for crashes only.** The alphabets stop at a few atoms and the random documents at 24 tokens (30 for type system documents). The crash probes go deeper and longer, but only a crash on them fails: the spec sets no limit on length or nesting depth, so none is graded.
- **Syntax only.** A type system document that parses can still describe no valid schema: `type T` twice, or `extend scalar S @d` with no `S`. The area only asks whether it parses. Building and validating schemas is the [`schema`](schema.md) area's.
- **The lookahead after a definition without a body.** §3.3.2 has a Note: "Schema extensions without additional operation type definitions must not be followed by a {`{`} (such as a query shorthand) to avoid parsing ambiguities. The same limitation applies to the type definitions and extensions below." But the grammar puts `[lookahead != {]` only on the productions whose body is in braces: schema extensions, objects, interfaces, enums, input objects and their extensions. ScalarTypeDefinition, UnionTypeDefinition, DirectiveDefinition, their extensions and DirectiveExtension have none, and none could take a `{`. So in a Document, `scalar S {a}` is a scalar definition and then a query shorthand, and the reference accepts it, as graphql-js does. "Notes in this document are non-normative" (Appendix A), so the vectors grade the grammar: 6 accepted `"document"` vectors rest on this reading, such as `scalar S {a}`, `union U = A {a}` and `extend directive @d @x {a}`.
- **Descriptions don't change behaviour.** §2.2 says descriptions in executable documents "MUST NOT affect the execution, validation, or response of a GraphQL document." The area only checks that they parse, and no other area compares a document with descriptions against the same document without them: the `validate` vectors have no description on an operation, fragment or variable.
- **Printing strings.** §2.10.4 says that "When producing a {StringValue}, implementations should use escape sequences to represent non-printable control characters (U+0000 to U+001F and U+007F to U+009F)", and that a supplementary character, if escaped, "should only use a variable-width unicode escape sequence". The area never asks an implementation to print a document, so these SHOULDs aren't graded here. `Lexer.tla` states them: `IsWellPrintedString(text, printed)` holds when `printed` is exactly one StringValue whose value is `text`, with no non-printable control character between its quotes and, outside a block string, no surrogate-pair escape; `StringsWellPrinted(src)` holds when every StringValue in a lexable `src` is well printed. The differential checks graphql-js's printer against them.

## graphql-js

graphql-js 17 fails one check and graphql-js 16 four. The graphql-js adapter claims `parse-sdl` in both. The differential reports every failure as a known discrepancy, and every vector they fail has `since`. Neither crashes on a probe:

- graphql-js 16 and 17 reject a variable-width escape with more than eight hex digits, such as `"\u{000000041}"`. EscapedUnicode :: `{` HexDigit+ `}` has no limit, so this is "rejects what §2.10.4 String Value accepts", since September 2025.
- graphql-js 16 also rejects an empty selection set, such as `{}`, which September 2026 allows (graphql-spec#1227): "rejects what §2.5 Selection Sets accepts", since September 2026 (11 vectors);
- graphql-js 16 rejects directives on a directive definition, such as `directive @d @x on FIELD` ("rejects what §3.13 Directives accepts", 5 vectors), and every directive extension, such as `extend directive @d @x` ("rejects what §3.13.6 Directive Extensions accepts", 14 vectors), both since September 2026. It does accept the `DIRECTIVE_DEFINITION` location.

The differential ([`scripts/differential-lexer.mjs`](../../scripts/differential-lexer.mjs)) also compares graphql-js's type system parse trees with `ParseDocument`'s for all four grammars, and judges the strings that graphql-js's `print` produces with `IsWellPrintedString`. graphql-js 16 and 17 print `"…"` strings that follow both SHOULDs.

## Sources an adapter can't receive

15 vectors hold a raw lone surrogate, which some JSON parsers refuse, so the adapter never sees the source. Such an adapter answers `{"type":"result","id":n,"unsupported":"lone surrogate: why"}`. The vector isn't graded, and the report's provenance counts it under `skipped`, rather than crediting the implementation with an answer it never gave.

The kit honours `unsupported` only for a source that really holds a lone surrogate. For any other source it is a crash: the adapter could have asked the implementation. A run in which no vector was graded isn't ok.
