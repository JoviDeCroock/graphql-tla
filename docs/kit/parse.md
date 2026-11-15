# The parse area

`graphql-tla run parse` checks the language: whether an implementation accepts a source text exactly when it is a syntactically valid executable document. The reference is `ParseExecutable` in [`specs/Parser.tla`](../../specs/Parser.tla), a recursive-descent reading of ExecutableDocument over the tokens that `Lex` in [`specs/Lexer.tla`](../../specs/Lexer.tla) produces. Together they cover §2.1 Source Text, with its lexical tokens and ignored tokens, through §2.13 Directives.

```shell
npx graphql-tla run parse --adapter "node adapters/graphql-js/adapter.mjs --graphql 17" --strict --report parse.json
```

The area follows [the contract for areas beyond execution](../kit-areas.md).

## Executable documents only

The reference covers executable documents: operations and fragments. It doesn't cover the type system language. A document with a type definition, an extension or a schema definition isn't an ExecutableDocument, so the reference rejects it, and the vectors never ask whether SDL is well formed. §2.14 Schema Coordinates isn't covered either.

## Request

```json
{"type":"parse","id":12,"source":"query ($a: [Int!] = [1]) { f(x: $a) }"}
```

- **`source`:** the source text, as a JSON string.

Parse it with your implementation's default options, the way it parses a request's document.

## Result

```json
{"type":"result","id":12,"ok":true}
```

- **`ok`:** whether the source is a syntactically valid executable document. A parse error is `false`; it is an answer, not an adapter error.

Two cases need care:

- **Type system definitions.** If your parser also reads the type system language, answer `false` when the document holds anything other than operations and fragments. The graphql-js adapter parses, then checks that every definition is executable.
- **Lone surrogates.** A few sources hold an unpaired surrogate, such as `"\ud800"` in the JSON. It hasn't been a SourceCharacter since September 2025, so the reference always rejects these. October 2021 counts a surrogate as a SourceCharacter, so the vectors with one inside a string have `since` September 2025 (see Editions). If your adapter's JSON parser or strings can't carry one to the implementation, answer `unsupported` (see [the last section](#sources-an-adapter-cant-receive)), never `ok: false`: a rejection the implementation never made would pass on every one of these vectors.

Any other fields in the result are ignored.

**Crashes.** If the parser crashes on a source, say with an index out of range or a null dereference, rather than accepting or rejecting it, answer `{"type":"error","id":12,"message":"…"}`. The kit reports the vector as a crash and goes on ([the protocol](../kit-areas.md#protocol)). Only the message's first line reaches the report. Answer `ok: false` only for the parser's own syntax errors: an adapter that turns every exception into `ok: false` hides its crashes, which then pass on every source the reference rejects.

## What is checked

One check per section of the grammar, 31 in all, each at MUST level: §2.1 and its subsections from White Space to Names, §2.2 Descriptions, and §2.3 Document to §2.13 Directives, including each kind of input value in §2.10.1 to §2.10.8.

Each vector cites the sections it exercises. The first is the one its verdict rests on. A wrong answer counts against that section's check only, and toward one finding:

- **accepts what §X rejects:** the implementation accepted a source that, by the reference, breaks a rule of §X;
- **rejects what §X accepts:** it rejected a source that §X allows;
- **crashes on a source §X accepts**, or **rejects:** the adapter answered with an `error`, or with `unsupported` for a source that holds no lone surrogate. A crash fails the check like a wrong answer, whatever the vector's verdict, since the implementation gave none. It is never counted by release: every source is an input the parser must answer in every release, so a crash fails under October 2021 too, even on a vector with `since`. Its finding has `"kind": "crash"`, and its `problem` is the adapter's message. The run's summary counts crashes apart from agreements.

A check is `pass` when some vector cites its section and none of the vectors resting on it got a wrong answer. Findings count their vectors with `since` per release (`since`, such as `{"September2025": 21}`) and mark their example `[since September 2025]` or `[since September 2026]`; a finding whose `since` counts add up to its `cases` fails only under that release and later ones. Each check gives `failingSince`, how many of its failing vectors rest on rules from each release (zeros left out), so a check whose failures all rest on newer rules can be told apart. The report's `since` gives, per release, how many vectors have that `since` (`vectors`) and how many of those got a wrong answer (`failing`). Crashes count in none of these. A run that grades no vector at all isn't ok. Every run also checks the checker: it must flag every verdict flipped, flag exactly the vectors whose answer differs when each one gets the next vector's answer, count results without `ok` as malformed, count every vector as a crash when each answer is a crash, even one carrying the right `ok`, with every section a verdict rests on failing and no crash counted toward a release, count every flipped verdict on a vector with `since` toward that release, in its check and in its finding, flag none of the reference's own answers, and, when every answer is `unsupported`, leave ungraded only the vectors with a lone surrogate, count every other one as a crash, and fail a run that grades nothing.

## The vectors

[`kit/parse/vectors.json`](../../kit/parse/vectors.json) holds 2007 vectors: 909 accepted and 1098 rejected. [`scripts/generate-vectors-parse.mjs`](../../scripts/generate-vectors-parse.mjs) writes it, taking every answer from `ParseExecutable`, evaluated by tla-ts. `--check` regenerates it and fails if it differs.

The sources come from the families of the lexer and parser differential ([`scripts/differential-lexer.mjs`](../../scripts/differential-lexer.mjs)):

- the hand-written vectors of `Lexer.tla` and `Parser.tla`, with the spec's own examples;
- every sequence of up to two to five atoms over each of the lexer's alphabets, placed where the grammar allows that token: inside `"…"` and `"""…"""` as an argument value, numbers in a list, ignored tokens between two fields, names, dots, and characters that start no token;
- every sequence of up to three tokens over the parser's alphabets, in the differential's contexts: values, variable definitions, what follows a field, fragment definitions;
- seeded random documents over the executable grammar, and one-token mutations of them;
- three Int Values beyond 32 and 64 bits, such as `{a(x: [2147483648])}`. §2.10.1 puts no bound on an IntValue: the range of Int is a matter of input coercion (§3.5.1), so these must parse.

About 32,000 candidates are evaluated, and a few thousand are kept. Most of those kept come in **minimal pairs**: a rejected source next to an accepted sibling one edit away, where one atom or token is deleted, replaced or inserted. The pair rests on the section of that edit:

- for a lexical rejection, the token where `Lex` fails: a string, a number, a lone `.`, a character that starts no token, or a code point that isn't a SourceCharacter. In the string and block-string families, a character that starts no token right after the string means the string ended where the edit made it end, so the pair rests on §2.10.4 String Value: `{a(x: """"\"""""")}` is a block string holding `"\"""`, and an implementation that ends it at the first `"""` fails §2.10.4, not §2.1.5 Lexical Tokens;
- otherwise, the production the edited token belongs to. Each alphabet says which section each of its tokens is about, and the random documents record the production each token came from. A string inserted before a definition, after a description or at the end is a description (§2.2), as in `"d" {a}`: the query shorthand takes none. Deleting a whole description is an edit of the definition it described, since a description is optional.

The reference only says accepted or rejected, so the sections are the generator's attribution of one edit. Most read naturally: `{a(x: [00])}` next to `{a(x: [0])}` rests on §2.10.1, and `query ($a: Int = $b) {a}` on §2.11. A few are judgement calls. An accepted sibling in the numbers family rests first on the kind of value it holds: `{a(x: [0-0])}`, the two Int Values `0` and `-0`, rests on §2.10.1, though its sibling `{a(x: [0-.])}` fails at a Float Value. A control character inside a comment is a CommentChar, so an accepted source with one, such as `{a#\f\rb}`, rests on §2.1 Source Text, where the releases differ, and not on §2.1.1 White Space. `{a @d()}` breaks `Arguments : ( Argument+ )`, so it rests on §2.7, like `{a()}`.

Some accepted documents use grammar that an implementation can lack whatever edit the vector was chosen for. Such a document rests first on that grammar's section, so one missing rule makes one finding instead of spreading over the sections of every edit near it:

- an empty selection set (§2.5, new in September 2026) or a description on an operation, fragment or variable (§2.2, new in September 2025);
- a keyword, such as `on` or `query`, as a variable's type (§2.12): `NamedType : Name`, with no names excluded, unlike `FragmentName` and `EnumValue`;
- a Byte Order Mark between tokens (§2.1.6): "a _Byte Order Mark_ may appear before or after any lexical token and is {Ignored}".

A document with more than one of these rests on the first in that order. To keep that rare, a random document with a description, an empty selection set or a keyword type separates its tokens with spaces instead of a Byte Order Mark, and so does its sibling. No accepted vector has both a Byte Order Mark and one of the others. 6 accepted vectors have both a description and a keyword type, and rest on §2.2.

**Editions.** The verdicts are the September 2026 edition's. A vector whose verdict is different under the October 2021 edition carries `since`, the first release whose text gives its verdict (`"September2025"` or `"September2026"`), with the reason in `editionNote`. It is graded like any other, but an implementation of an older release can fail it and still follow its release. October 2021's grammar of executable documents differs in four ways, three changed in September 2025 and one in September 2026:

- `SelectionSet : { Selection+ }`, so no empty selection sets (8 accepted vectors). September 2025 still has `Selection+`; September 2026 has `SelectionSet : { Selection* }` (graphql-spec#1227), so these 8 have `since` September 2026;
- no `Description` on an operation, fragment or variable definition (84 accepted vectors). September 2025 added them: `OperationDefinition : Description? OperationType Name? …`, `FragmentDefinition : Description? fragment …`, `VariableDefinition : Description? Variable : …`;
- `EscapedUnicode :: /[0-9A-Fa-f]{4}/`, so no `\u{…}` escapes (6 accepted vectors). Its value is "the code point {value}", with no rule about surrogates, so a fixed-width escape of a lone surrogate is valid there. Since September 2025 "The hexadecimal number encoded by a Unicode escape sequence must describe a _Unicode scalar value_, otherwise must result in a parse error" (9 rejected vectors, such as `{a(x: "\uD83D")}`);
- `SourceCharacter` is U+0009, U+000A, U+000D and U+0020–U+FFFF. That leaves out the other control characters, such as a vertical tab in a comment (4 accepted vectors), and code points above U+FFFF (2 accepted vectors with a raw U+1F600 in a string). It lets in surrogates, so a raw lone surrogate in a string is valid there (3 rejected vectors). Since September 2025 `SourceCharacter` is "Any Unicode scalar value", and "an unpaired _surrogate code point_ is not a valid source character". Read as UTF-16 code units, "U+0020–U+FFFF" would allow U+1F600 as a surrogate pair. The kit takes the literal reading, which only adds 2 vectors to the September 2025 count.

September 2025 is September 2026 without empty selection sets, so its grammar is a subset of September 2026's: a source September 2026 rejects, September 2025 rejects too. The generator finds the differences from the reference: it rewrites each source into one that October 2021 reads the same way under September 2026's rules (a surrogate escape becomes `\u0041`, a raw surrogate in a string or comment becomes `a`), evaluates that with `ParseExecutable`, and then applies the newer grammar above. An accepted vector needs every newer rule it uses, so its `since` is the latest of their releases; a rejected one has `since` September 2025. In all, 116 vectors have `since`: 108 September 2025 (96 accepted, 12 rejected) and 8 September 2026 (all accepted).

The vectors catch every bug in `specs/lexer.mutants.mjs` and `specs/parser.mutants.mjs` that changes whether a source is accepted.

## Limits

- **Accepted or rejected, nothing more.** The area doesn't compare parse trees, token values or error positions. An implementation that decodes `\b` wrongly, dedents a block string wrongly, drops a list item or reads `true` as an enum value passes here. String values are graded elsewhere: the coerce area's `stringValue` check (§2.10.4, [coerce](coerce.md)) passes string literals with escapes and block strings as arguments and compares the text the resolver gets with `Lexer.tla`'s, so wrong escape decoding or block string dedenting fails there. The rest the differential checks for graphql-js only.
- **Thin sections.** §2.10.3 Boolean Value, §2.10.5 Null Value, §2.10.6 Enum Value and §2.1.4 Insignificant Commas have only a few vectors resting on them. A parser can hardly reject these by mistake without also failing other vectors, so they are tested by accepted sources only. §2.1.6 Ignored Tokens has many, nearly all of them accepted documents with a Byte Order Mark between tokens.
- **Short sources.** The alphabets stop at a few atoms and the random documents at 24 tokens. Limits on length or nesting depth aren't tested.
- **Descriptions don't change behaviour.** §2.2 says descriptions in executable documents "MUST NOT affect the execution, validation, or response of a GraphQL document." The area only checks that they parse, and no other area compares a document with descriptions against the same document without them: the `validate` vectors have no description on an operation, fragment or variable.
- **Printing strings.** §2.10.4 says that "When producing a {StringValue}, implementations should use escape sequences to represent non-printable control characters", and that a supplementary character, if escaped, "should only use a variable-width unicode escape sequence". The area never asks an implementation to print a document, so these SHOULDs aren't checked.

## graphql-js

graphql-js 17 fails one check and graphql-js 16 two. The differential reports both as known discrepancies. Every vector they fail has `since`:

- graphql-js 16 and 17 reject a variable-width escape with more than eight hex digits, such as `"\u{000000041}"`. EscapedUnicode :: `{` HexDigit+ `}` has no limit, so this is "rejects what §2.10.4 String Value accepts", since September 2025.
- graphql-js 16 also rejects an empty selection set, such as `{}`, which September 2026 allows (graphql-spec#1227): "rejects what §2.5 Selection Sets accepts", since September 2026.

## Sources an adapter can't receive

15 vectors hold a raw lone surrogate, which some JSON parsers refuse, so the adapter never sees the source. Such an adapter answers `{"type":"result","id":n,"unsupported":"lone surrogate: why"}`. The vector isn't graded, and the report's provenance counts it under `skipped`, rather than crediting the implementation with an answer it never gave.

The kit honours `unsupported` only for a source that really holds a lone surrogate. For any other source it is a crash: the adapter could have asked the implementation. A run in which no vector was graded isn't ok.
