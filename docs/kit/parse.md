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
- **Lone surrogates.** A few sources hold an unpaired surrogate, such as `"\ud800"` in the JSON. It is never a SourceCharacter in the draft, so the reference always rejects these. If your runtime's strings can't hold one, answer `false` rather than fail. October 2021 counts a surrogate as a SourceCharacter, so the vectors with one inside a string are draft only (see Editions).

Any other fields in the result are ignored.

## What is checked

One check per section of the grammar, 31 in all, each at MUST level: §2.1 and its subsections from White Space to Names, §2.2 Descriptions, and §2.3 Document to §2.13 Directives, including each kind of input value in §2.10.1 to §2.10.8.

Each vector cites the sections it exercises. The first is the one its verdict rests on. A wrong answer counts against that section's check only, and toward one finding:

- **accepts what §X rejects:** the implementation accepted a source that, by the reference, breaks a rule of §X;
- **rejects what §X accepts:** it rejected a source that §X allows.

A check is `pass` when some vector cites its section and none of the vectors resting on it got a wrong answer. Findings count their draft-only vectors (`draftOnly`) and mark their example `[draft]`; a finding with nothing else carries `"edition": "draft"`. Each check gives `failingDraftOnly`, how many of its failing vectors are draft only, so a check whose failures are all draft only can be told apart. The report's `draftOnly` gives how many vectors are draft only and how many of those failed. Every run also checks the checker: it must flag every verdict flipped, flag exactly the vectors whose answer differs when each one gets the next vector's answer, count results without `ok` as malformed, and flag none of the reference's own answers.

## The vectors

[`kit/parse/vectors.json`](../../kit/parse/vectors.json) holds 1983 vectors: 897 accepted and 1086 rejected. [`scripts/generate-vectors-parse.mjs`](../../scripts/generate-vectors-parse.mjs) writes it, taking every answer from `ParseExecutable`, evaluated by tla-ts. `--check` regenerates it and fails if it differs.

The sources come from the families of the lexer and parser differential ([`scripts/differential-lexer.mjs`](../../scripts/differential-lexer.mjs)):

- the hand-written vectors of `Lexer.tla` and `Parser.tla`, with the spec's own examples;
- every sequence of up to two to five atoms over each of the lexer's alphabets, placed where the grammar allows that token: inside `"…"` and `"""…"""` as an argument value, numbers in a list, ignored tokens between two fields, names, dots, and characters that start no token;
- every sequence of up to three tokens over the parser's alphabets, in the differential's contexts: values, variable definitions, what follows a field, fragment definitions;
- seeded random documents over the executable grammar, and one-token mutations of them.

About 24,000 candidates are evaluated, and a few thousand are kept. Most of those kept come in **minimal pairs**: a rejected source next to an accepted sibling one edit away, where one atom or token is deleted, replaced or inserted. The pair rests on the section of that edit:

- for a lexical rejection, the token where `Lex` fails: a string, a number, a lone `.`, a character that starts no token, or a code point that isn't a SourceCharacter;
- otherwise, the production the edited token belongs to. Each alphabet says which section each of its tokens is about, and the random documents record the production each token came from.

The reference only says accepted or rejected, so the sections are the generator's attribution of one edit. Most read naturally: `{a(x: [00])}` next to `{a(x: [0])}` rests on §2.10.1, and `query ($a: Int = $b) {a}` on §2.11. A few are judgement calls.

An accepted document with an empty selection set, or with a description on an operation, fragment or variable, rests on §2.5 or §2.2 first, whatever edit it was chosen for. The draft added both after the October 2021 edition. An implementation that rejects such a document most likely lacks that grammar, and the finding then says so instead of blaming an unrelated section.

**Editions.** A vector whose verdict is different under the October 2021 edition carries `"edition": "draft"`, with the reason in `editionNote`. It is graded like any other, but an implementation of October 2021 can fail it and still follow its edition. October 2021's grammar of executable documents differs in four ways:

- `SelectionSet : { Selection+ }`, so no empty selection sets (8 accepted vectors);
- no `Description` on an operation, fragment or variable definition (73 accepted vectors);
- `EscapedUnicode :: /[0-9A-Fa-f]{4}/`, so no `\u{…}` escapes (6 accepted vectors). Its value is "the code point {value}", with no rule about surrogates, so a fixed-width escape of a lone surrogate is valid there. The draft rejects one (9 rejected vectors, such as `{a(x: "\uD83D")}`);
- `SourceCharacter` is U+0009, U+000A, U+000D and U+0020–U+FFFF. That leaves out the other control characters, such as a vertical tab in a comment (4 accepted vectors), and code points above U+FFFF (2 accepted vectors with a raw U+1F600 in a string). It lets in surrogates, so a raw lone surrogate in a string is valid there (3 rejected vectors). Read as UTF-16 code units, "U+0020–U+FFFF" would allow U+1F600 as a surrogate pair. The kit takes the literal reading, which only adds 2 vectors to the draft-only count.

The generator finds these from the reference: it rewrites each source into one that October 2021 reads the same way under the draft's rules (a surrogate escape becomes `\u0041`, a raw surrogate in a string or comment becomes `a`), evaluates that with `ParseExecutable`, and then applies the draft-only grammar above. In all, 105 vectors are draft only: 93 accepted and 12 rejected.

The vectors catch every bug in `specs/lexer.mutants.mjs` and `specs/parser.mutants.mjs` that changes whether a source is accepted.

## Limits

- **Accepted or rejected, nothing more.** The area doesn't compare parse trees, token values or error positions. An implementation that decodes `\b` wrongly, dedents a block string wrongly, drops a list item or reads `true` as an enum value passes. The differential checks those for graphql-js only.
- **Thin sections.** §2.10.3 Boolean Value, §2.10.5 Null Value, §2.10.6 Enum Value, §2.1.4 Insignificant Commas and §2.1.6 Ignored Tokens have only a few vectors resting on them. A parser can hardly reject these by mistake without also failing other vectors, so they are tested by accepted sources only.
- **Short sources.** The alphabets stop at a few atoms and the random documents at 24 tokens. Limits on length or nesting depth aren't tested.
- **Descriptions don't change behaviour.** §2.2 says descriptions in executable documents "MUST NOT affect the execution, validation, or response of a GraphQL document." The area only checks that they parse, and no other area compares a document with descriptions against the same document without them: the `validate` vectors have no description on an operation, fragment or variable.
- **Printing strings.** §2.10.4 says that "When producing a {StringValue}, implementations should use escape sequences to represent non-printable control characters", and that a supplementary character, if escaped, "should only use a variable-width unicode escape sequence". The area never asks an implementation to print a document, so these SHOULDs aren't checked.

## graphql-js

graphql-js 17 fails one check and graphql-js 16 two. The differential reports both as known discrepancies. Every vector they fail is draft only:

- graphql-js 16 and 17 reject a variable-width escape with more than eight hex digits, such as `"\u{000000041}"`. EscapedUnicode :: `{` HexDigit+ `}` has no limit, so this is "rejects what §2.10.4 String Value accepts".
- graphql-js 16 also rejects an empty selection set, such as `{}`, which the draft allows since graphql-spec#1227: "rejects what §2.5 Selection Sets accepts".
