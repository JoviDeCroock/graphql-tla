// Bugs planted in the hand-written lexer (Lexer.tla), each caught by one of
// its vector properties. scripts/differential-lexer.mjs --mutants plants the
// same bugs and checks that the differential against graphql-js catches each
// one too.

const file = "Lexer.tla";

export default [
  {
    name: "accepts a leading zero (00)",
    find: "ELSE IF s[sign + 1] = Zero THEN sign + 1",
    replace: "ELSE IF FALSE THEN sign + 1",
    file,
    property: "NumbersLex",
  },
  {
    name: "accepts a decimal point without fraction digits (1.)",
    find: "IF Ch(s, k) = Dot /\\ DigitRun(s, k + 1) > 0 THEN 1 + DigitRun(s, k + 1) ELSE 0",
    replace: "IF Ch(s, k) = Dot THEN 1 + DigitRun(s, k + 1) ELSE 0",
    file,
    property: "NumbersLex",
  },
  {
    name: "lets a number be followed by a NameStart (0x123 lexes as 0, x123)",
    find: "IsNumberLookahead(c) == IsDigit(c) \\/ c = Dot \\/ IsNameStart(c)",
    replace: "IsNumberLookahead(c) == IsDigit(c) \\/ c = Dot",
    file,
    property: "NumbersLex",
  },
  {
    name: "lexes a single . as a punctuator",
    find: "SinglePunctuators == {33, 36, 38,",
    replace: "SinglePunctuators == {46, 33, 36, 38,",
    file,
    property: "PunctuatorsAndNamesLex",
  },
  {
    name: "does not ignore the byte order mark",
    find: "CASE Ch(src, i) = BOM -> 1",
    replace: "CASE Ch(src, i) = BOM -> 0",
    file,
    property: "IgnoredTokensLex",
  },
  {
    name: "a lone carriage return is not a LineTerminator",
    find: "    [] Ch(src, i) = CR -> 1\n",
    replace: "    [] Ch(src, i) = CR -> 0\n",
    file,
    property: "IgnoredTokensLex",
  },
  {
    name: "a comment runs on past a carriage return",
    find: "IsCommentChar(c) == IsSourceCharacter(c) /\\ c # LF /\\ c # CR",
    replace: "IsCommentChar(c) == IsSourceCharacter(c) /\\ c # LF",
    file,
    property: "IgnoredTokensLex",
  },
  {
    name: "accepts an unpaired leading surrogate escape (\\uD83D)",
    find: "THEN Matched(k + 12, <<(leading - 55296) * 1024 + (trailing - 56320) + 65536>>)\n              ELSE Failed(k)",
    replace:
      "THEN Matched(k + 12, <<(leading - 55296) * 1024 + (trailing - 56320) + 65536>>)\n              ELSE Matched(k + 6, <<leading>>)",
    file,
    property: "StringsLex",
  },
  {
    name: "accepts a surrogate in a variable-width escape (\\u{D800})",
    find: "Ch(src, k + 3 + digits) = RBrace /\\ IsSourceCharacter(value)",
    replace: "Ch(src, k + 3 + digits) = RBrace /\\ value <= 1114111",
    file,
    property: "StringsLex",
  },
  {
    name: "decodes \\b as a b",
    find: "CASE c = 98 -> 8 []",
    replace: "CASE c = 98 -> 98 []",
    file,
    property: "StringsLex",
  },
  {
    name: 'reads """""" as three empty strings',
    find: "  CASE Ch(src, i + 1) = Quote /\\ Ch(src, i + 2) = Quote -> BlockStringCharacters(src, i + 3, <<>>)\n    [] Ch(src, i + 1) = Quote -> Matched(i + 2, <<>>)",
    replace: "  CASE Ch(src, i + 1) = Quote -> Matched(i + 2, <<>>)\n    [] Ch(src, i + 1) = Quote /\\ Ch(src, i + 2) = Quote -> BlockStringCharacters(src, i + 3, <<>>)",
    file,
    property: "StringsLex",
  },
  {
    name: "dedent counts a tab as two characters of indentation",
    find: "IF k <= Len(line) /\\ IsWhitespace(line[k]) THEN 1 + LeadingWhitespace(line, k + 1) ELSE 0",
    replace:
      "IF k <= Len(line) /\\ IsWhitespace(line[k]) THEN (IF line[k] = Tab THEN 2 ELSE 1) + LeadingWhitespace(line, k + 1) ELSE 0",
    file,
    property: "BlockStringsLex",
  },
  {
    name: "splits \\r\\n into two lines in a block string",
    find: "SplitLines(raw, k + LineTerminatorLength(raw, k), <<>>, Append(lines, line))",
    replace: "SplitLines(raw, k + 1, <<>>, Append(lines, line))",
    file,
    property: "BlockStringsLex",
  },
  {
    name: "includes the first line in the common indent",
    find: "n \\in {n \\in 2..Len(lines) : Indent(lines[n]) < Len(lines[n])}",
    replace: "n \\in {n \\in 1..Len(lines) : Indent(lines[n]) < Len(lines[n])}",
    file,
    property: "BlockStringsLex",
  },
  {
    name: "counts whitespace-only lines in the common indent",
    find: "n \\in {n \\in 2..Len(lines) : Indent(lines[n]) < Len(lines[n])}",
    replace: "n \\in {n \\in 2..Len(lines) : Indent(lines[n]) <= Len(lines[n])}",
    file,
    property: "BlockStringsLex",
  },
  {
    name: "keeps trailing blank lines",
    find: "trimmed == DropTrailingBlankLines(DropLeadingBlankLines(dedented))",
    replace: "trimmed == DropLeadingBlankLines(dedented)",
    file,
    property: "BlockStringsLex",
  },
  {
    name: 'leaves the backslash in an escaped \\"""',
    find: "BlockStringCharacters(src, k + 4, raw \\o <<Quote, Quote, Quote>>)",
    replace: "BlockStringCharacters(src, k + 4, raw \\o <<Backslash, Quote, Quote, Quote>>)",
    file,
    property: "BlockStringsLex",
  },
  {
    name: "a printer may leave C1 controls (U+007F to U+009F) unescaped",
    find: "IsNonPrintableControl(c) == (0 <= c /\\ c <= 31) \\/ (127 <= c /\\ c <= 159)",
    replace: "IsNonPrintableControl(c) == (0 <= c /\\ c <= 31)",
    file,
    property: "StringsPrintWell",
  },
  {
    name: "a printer may escape a supplementary character as a surrogate pair",
    find: "  /\\ (~IsBlockStringAt(src, i) => ~PairEscapeFrom(src, i + 1))",
    replace: "  /\\ TRUE",
    file,
    property: "StringsPrintWell",
  },
];
