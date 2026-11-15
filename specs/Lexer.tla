---- MODULE Lexer ----
(***************************************************************************)
(* The lexical grammar of GraphQL and its static semantics, written by     *)
(* hand from the September 2026 edition of the spec                        *)
(* (https://spec.graphql.org/September2026/, §2.1 Source Text, §2.10 Input *)
(* Values: IntValue, FloatValue, StringValue, BlockString).                 *)
(*                                                                         *)
(* Everything here is a pure operator over plain data:                     *)
(*                                                                         *)
(*   src    a source text, as a sequence of code points (integers). A      *)
(*          JavaScript string with a lone surrogate maps to a sequence     *)
(*          holding that surrogate, which is not a SourceCharacter.         *)
(*                                                                         *)
(* Lex(src) is the spec's "Lexical Analysis": "The source text is scanned  *)
(* from left to right, repeatedly taking the next possible sequence of     *)
(* code points allowed by the lexical grammar productions as the next      *)
(* token", omitting Ignored.                                               *)
(*                                                                         *)
(* Data shapes (every value of a kind has the same fields, since TLC can't *)
(* compare records of different shapes):                                   *)
(*   token   [kind, value]   kind \in {"Punctuator", "Name", "IntValue",   *)
(*                           "FloatValue", "StringValue", "BlockString"}.  *)
(*                           value is a sequence of code points: the       *)
(*                           punctuator, the name, the number as written,  *)
(*                           or the string's Unicode text after escapes    *)
(*                           and BlockStringValue().                       *)
(*   lexed   [ok, tokens, pos]  ok is FALSE for a syntax error at code     *)
(*                           point pos (1-based); tokens is then <<>>.     *)
(*   scan    [ok, end, value]  one production matched from some index up   *)
(*                           to end - 1, or a syntax error at end.         *)
(***************************************************************************)
EXTENDS Integers, Sequences, FiniteSets

-----------------------------------------------------------------------------
(* Code points used below *)

Tab == 9
LF == 10
CR == 13
Space == 32
Quote == 34
Hash == 35
Plus == 43
Comma == 44
Minus == 45
Dot == 46
Zero == 48
LowerE == 101
UpperE == 69
Backslash == 92
LowerU == 117
LBrace == 123
RBrace == 125
BOM == 65279

\* No character: what Ch returns past either end of the source.
None == -1

Ch(src, i) == IF i >= 1 /\ i <= Len(src) THEN src[i] ELSE None

Min(a, b) == IF a <= b THEN a ELSE b

\* src[i..j], empty when j < i, cut off at the end of src.
Slice(src, i, j) == IF j < i \/ i > Len(src) THEN <<>> ELSE SubSeq(src, i, Min(j, Len(src)))

\* s without its first n elements.
Drop(s, n) == IF n >= Len(s) THEN <<>> ELSE SubSeq(s, n + 1, Len(s))

Matched(end, value) == [ok |-> TRUE, end |-> end, value |-> value]
Failed(pos) == [ok |-> FALSE, end |-> pos, value |-> <<>>]

-----------------------------------------------------------------------------
(* §2.1 Source Text *)

\* SourceCharacter :: "Any Unicode scalar value"
\* "a Unicode scalar value which may be any Unicode code point from U+0000
\* to U+D7FF or U+E000 to U+10FFFF". An unpaired surrogate code point "is not
\* a valid source character".
IsSourceCharacter(c) == (0 <= c /\ c <= 55295) \/ (57344 <= c /\ c <= 1114111)

\* Whitespace :: "Horizontal Tab (U+0009)" | "Space (U+0020)"
IsWhitespace(c) == c = Tab \/ c = Space

\* LineTerminator ::
\*   "New Line (U+000A)"
\*   "Carriage Return (U+000D)" [lookahead != "New Line (U+000A)"]
\*   "Carriage Return (U+000D)" "New Line (U+000A)"
\* The length of the LineTerminator at i, or 0 if there is none.
LineTerminatorLength(src, i) ==
  CASE Ch(src, i) = LF -> 1
    [] Ch(src, i) = CR /\ Ch(src, i + 1) = LF -> 2
    [] Ch(src, i) = CR -> 1
    [] OTHER -> 0

\* CommentChar :: SourceCharacter but not LineTerminator
IsCommentChar(c) == IsSourceCharacter(c) /\ c # LF /\ c # CR

\* Comment :: `#` CommentChar* [lookahead != CommentChar]
\* The index just after the comment's CommentChars, from k on.
RECURSIVE CommentEnd(_, _)
CommentEnd(src, k) == IF IsCommentChar(Ch(src, k)) THEN CommentEnd(src, k + 1) ELSE k

\* Ignored :: UnicodeBOM | Whitespace | LineTerminator | Comment | Comma
\* The length of the Ignored token at i, or 0 if there is none.
IgnoredLength(src, i) ==
  CASE Ch(src, i) = BOM -> 1
    [] IsWhitespace(Ch(src, i)) -> 1
    [] LineTerminatorLength(src, i) > 0 -> LineTerminatorLength(src, i)
    [] Ch(src, i) = Hash -> CommentEnd(src, i + 1) - i
    [] Ch(src, i) = Comma -> 1
    [] OTHER -> 0

-----------------------------------------------------------------------------
(* §2.1.7 Punctuators *)

\* Punctuator :: one of ! $ & ( ) ... : = @ [ ] { | }
SinglePunctuators == {33, 36, 38, 40, 41, 58, 61, 64, 91, 93, 123, 124, 125}
Spread == <<Dot, Dot, Dot>>

PunctuatorAt(src, i) ==
  IF Ch(src, i) \in SinglePunctuators THEN Matched(i + 1, <<src[i]>>)
  ELSE IF Slice(src, i, i + 2) = Spread THEN Matched(i + 3, Spread)
  ELSE Failed(i)

-----------------------------------------------------------------------------
(* §2.1.8 Names *)

\* Letter :: one of A-Z a-z;  Digit :: one of 0-9
IsLetter(c) == (65 <= c /\ c <= 90) \/ (97 <= c /\ c <= 122)
IsDigit(c) == 48 <= c /\ c <= 57

\* NameStart :: Letter | `_`;  NameContinue :: Letter | Digit | `_`
IsNameStart(c) == IsLetter(c) \/ c = 95
IsNameContinue(c) == IsLetter(c) \/ IsDigit(c) \/ c = 95

RECURSIVE NameContinueEnd(_, _)
NameContinueEnd(src, k) == IF IsNameContinue(Ch(src, k)) THEN NameContinueEnd(src, k + 1) ELSE k

\* Name :: NameStart NameContinue* [lookahead != NameContinue]
\* "a Name token is always the longest possible valid sequence".
NameAt(src, i) ==
  LET end == NameContinueEnd(src, i + 1) IN Matched(end, Slice(src, i, end - 1))

-----------------------------------------------------------------------------
(* §2.10.1 Int Value and §2.10.2 Float Value *)

\* The number of Digits in s from index k on.
RECURSIVE DigitRun(_, _)
DigitRun(s, k) == IF IsDigit(Ch(s, k)) THEN 1 + DigitRun(s, k + 1) ELSE 0

\* IntegerPart ::
\*   NegativeSign? 0
\*   NegativeSign? NonZeroDigit Digit*
\* The length of the IntegerPart that s starts with, or 0 if there is none.
\* "It must not have any leading 0": after a 0 the IntegerPart ends.
IntegerPartLength(s) ==
  LET sign == IF Ch(s, 1) = Minus THEN 1 ELSE 0
      digits == DigitRun(s, sign + 1)
  IN IF digits = 0 THEN 0
     ELSE IF s[sign + 1] = Zero THEN sign + 1
     ELSE sign + digits

\* FractionalPart :: . Digit+   (its length at k in s, or 0)
FractionalPartLength(s, k) ==
  IF Ch(s, k) = Dot /\ DigitRun(s, k + 1) > 0 THEN 1 + DigitRun(s, k + 1) ELSE 0

\* ExponentPart :: ExponentIndicator Sign? Digit+   (its length at k, or 0)
\* ExponentIndicator :: one of `e` `E`;  Sign :: one of + -
ExponentPartLength(s, k) ==
  LET sign == IF Ch(s, k + 1) \in {Plus, Minus} THEN 1 ELSE 0
      digits == DigitRun(s, k + 1 + sign)
  IN IF Ch(s, k) \in {LowerE, UpperE} /\ digits > 0 THEN 1 + sign + digits ELSE 0

\* s is the text of an IntValue: IntegerPart.
IsIntValueText(s) == Len(s) > 0 /\ IntegerPartLength(s) = Len(s)

\* s is the text of a FloatValue:
\*   IntegerPart FractionalPart ExponentPart
\*   IntegerPart FractionalPart
\*   IntegerPart ExponentPart
\* Each part ends where the next one's first character (`.` or e/E) starts,
\* so measuring each from the end of the previous one decides membership.
IsFloatValueText(s) ==
  LET int == IntegerPartLength(s)
      frac == FractionalPartLength(s, int + 1)
      exp == ExponentPartLength(s, int + frac + 1)
  IN int > 0 /\ (frac > 0 \/ exp > 0) /\ int + frac + exp = Len(s)

\* [lookahead != {Digit, `.`, NameStart}], shared by IntValue and FloatValue.
IsNumberLookahead(c) == IsDigit(c) \/ c = Dot \/ IsNameStart(c)

\* Characters that can occur in a number's text.
IsNumberChar(c) == IsDigit(c) \/ c \in {Minus, Plus, Dot, LowerE, UpperE}

RECURSIVE NumberCharsEnd(_, _)
NumberCharsEnd(src, k) == IF IsNumberChar(Ch(src, k)) THEN NumberCharsEnd(src, k + 1) ELSE k

\* Every IntValue or FloatValue token that starts at i: "A lexical token is
\* only valid if not followed by a character in its lookahead restriction."
\* Each element is the index just after the token. The restriction leaves at
\* most one, since every shorter number is followed by a Digit, `.` or e/E:
\* "the source 00 is invalid since it can neither be interpreted as a single
\* token nor two 0 tokens", and "the sequences 0x123 and 123L have no valid
\* lexical representations".
NumberEnds(src, i) ==
  {j \in (i + 1)..NumberCharsEnd(src, i) :
     /\ IsIntValueText(Slice(src, i, j - 1)) \/ IsFloatValueText(Slice(src, i, j - 1))
     /\ ~IsNumberLookahead(Ch(src, j))}

NumberAt(src, i) ==
  LET ends == NumberEnds(src, i) IN
  IF ends = {} THEN Failed(i)
  ELSE LET end == CHOOSE j \in ends : \A k \in ends : k <= j
       IN Matched(end, Slice(src, i, end - 1))

-----------------------------------------------------------------------------
(* §2.10.4 String Value *)

\* HexDigit :: one of 0-9 A-F a-f
IsHexDigit(c) == IsDigit(c) \/ (65 <= c /\ c <= 70) \/ (97 <= c /\ c <= 102)
HexDigitValue(c) ==
  CASE IsDigit(c) -> c - 48
    [] 65 <= c /\ c <= 70 -> c - 55
    [] OTHER -> c - 87

RECURSIVE HexRun(_, _)
HexRun(src, k) == IF IsHexDigit(Ch(src, k)) THEN 1 + HexRun(src, k + 1) ELSE 0

\* "the hexadecimal value represented by the sequence of HexDigit". Values
\* past U+10FFFF all stay at 16^^110000, which keeps the integers small and
\* is just as much not a Unicode scalar value.
RECURSIVE HexFold(_, _, _)
HexFold(s, k, acc) ==
  IF k > Len(s) THEN acc
  ELSE HexFold(s, k + 1, Min(acc * 16 + HexDigitValue(s[k]), 1114112))
HexValue(s) == HexFold(s, 1, 0)

IsLeadingSurrogate(v) == 55296 <= v /\ v <= 56319
IsTrailingSurrogate(v) == 56320 <= v /\ v <= 57343

\* `\u` HexDigit HexDigit HexDigit HexDigit at k: its value, or -1.
FixedWidthAt(src, k) ==
  IF Ch(src, k) = Backslash /\ Ch(src, k + 1) = LowerU /\ HexRun(src, k + 2) >= 4
  THEN HexValue(Slice(src, k + 2, k + 5))
  ELSE -1

\* EscapedCharacter :: one of `"` `\` `/` `b` `f` `n` `r` `t`, mapped by the
\* table in Static Semantics.
EscapedCharacters == {34, 92, 47, 98, 102, 110, 114, 116}
EscapedValue(c) ==
  CASE c = 98 -> 8 [] c = 102 -> 12 [] c = 110 -> 10 [] c = 114 -> 13 [] c = 116 -> 9
    [] OTHER -> c

\* The escape sequence that starts with the `\` at k, as a scan.
\*
\* StringCharacter :: `\u` EscapedUnicode
\*   EscapedUnicode :: `{` HexDigit+ `}` | HexDigit HexDigit HexDigit HexDigit
\*   "Assert: value is a within the Unicode scalar value range".
\* StringCharacter :: `\u` HexDigit{4} `\u` HexDigit{4}
\*   "If leadingValue is >= 0xD800 and <= 0xDBFF (a Leading Surrogate):
\*    Assert: trailingValue is >= 0xDC00 and <= 0xDFFF (a Trailing Surrogate).
\*    Return (leadingValue - 0xD800) × 0x400 + (trailingValue - 0xDC00) +
\*    0x10000." Otherwise both must be scalar values, which is the same as
\*    reading them as two separate escapes (the Note after it says so).
\* A leading surrogate can only be read as the start of a pair, and a lone
\* trailing surrogate under no reading, so a string is valid exactly when
\* some reading of its escapes passes every Assert.
\* StringCharacter :: `\` EscapedCharacter
EscapeAt(src, k) ==
  IF Ch(src, k + 1) = LowerU /\ Ch(src, k + 2) = LBrace THEN
    LET digits == HexRun(src, k + 3)
        value == HexValue(Slice(src, k + 3, k + 2 + digits))
    IN IF digits > 0 /\ Ch(src, k + 3 + digits) = RBrace /\ IsSourceCharacter(value)
       THEN Matched(k + 4 + digits, <<value>>)
       ELSE Failed(k)
  ELSE IF Ch(src, k + 1) = LowerU THEN
    LET leading == FixedWidthAt(src, k)
        trailing == FixedWidthAt(src, k + 6)
    IN CASE leading = -1 -> Failed(k)
         [] IsLeadingSurrogate(leading) ->
              IF IsTrailingSurrogate(trailing)
              THEN Matched(k + 12, <<(leading - 55296) * 1024 + (trailing - 56320) + 65536>>)
              ELSE Failed(k)
         [] IsSourceCharacter(leading) -> Matched(k + 6, <<leading>>)
         [] OTHER -> Failed(k)
  ELSE IF Ch(src, k + 1) \in EscapedCharacters THEN
    Matched(k + 2, <<EscapedValue(src[k + 1])>>)
  ELSE Failed(k)

\* `"` StringCharacter+ `"`, from the StringCharacter at k on, with the
\* Unicode text so far in text.
\* StringCharacter :: SourceCharacter but not `"` or `\` or LineTerminator
RECURSIVE StringCharacters(_, _, _)
StringCharacters(src, k, text) ==
  LET c == Ch(src, k) IN
  CASE c = None -> Failed(k)
    [] c = Quote -> Matched(k + 1, text)
    [] c = LF \/ c = CR -> Failed(k)
    [] c = Backslash ->
         LET escape == EscapeAt(src, k) IN
         IF escape.ok THEN StringCharacters(src, escape.end, text \o escape.value)
         ELSE escape
    [] OTHER -> StringCharacters(src, k + 1, Append(text, c))

(* §2.10.4 Block Strings *)

RECURSIVE LeadingWhitespace(_, _)
LeadingWhitespace(line, k) ==
  IF k <= Len(line) /\ IsWhitespace(line[k]) THEN 1 + LeadingWhitespace(line, k + 1) ELSE 0

\* "the number of leading consecutive Whitespace characters in line"
Indent(line) == LeadingWhitespace(line, 1)

\* "line contains only Whitespace"
IsBlank(line) == Indent(line) = Len(line)

\* "Let lines be the result of splitting rawValue by LineTerminator."
RECURSIVE SplitLines(_, _, _, _)
SplitLines(raw, k, line, lines) ==
  CASE k > Len(raw) -> Append(lines, line)
    [] LineTerminatorLength(raw, k) > 0 ->
         SplitLines(raw, k + LineTerminatorLength(raw, k), <<>>, Append(lines, line))
    [] OTHER -> SplitLines(raw, k + 1, Append(line, raw[k]), lines)

\* "For each line in lines: If line is the first item in lines, continue to
\* the next line. ... If indent is less than length: If commonIndent is null
\* or indent is less than commonIndent: Let commonIndent be indent."
\* null is -1.
CommonIndent(lines) ==
  LET indents == {Indent(lines[n]) : n \in {n \in 2..Len(lines) : Indent(lines[n]) < Len(lines[n])}}
  IN IF indents = {} THEN -1 ELSE CHOOSE m \in indents : \A x \in indents : m <= x

RECURSIVE DropLeadingBlankLines(_)
DropLeadingBlankLines(lines) ==
  IF lines # <<>> /\ IsBlank(Head(lines)) THEN DropLeadingBlankLines(Tail(lines)) ELSE lines

RECURSIVE DropTrailingBlankLines(_)
DropTrailingBlankLines(lines) ==
  IF lines # <<>> /\ IsBlank(lines[Len(lines)])
  THEN DropTrailingBlankLines(SubSeq(lines, 1, Len(lines) - 1))
  ELSE lines

\* "For each line in lines: If line is the first item in lines: Append
\* formatted with line. Otherwise: Append formatted with a line feed
\* character (U+000A). Append formatted with line."
RECURSIVE JoinLines(_, _)
JoinLines(lines, k) ==
  IF k > Len(lines) THEN <<>>
  ELSE (IF k = 1 THEN <<>> ELSE <<LF>>) \o lines[k] \o JoinLines(lines, k + 1)

\* BlockStringValue(rawValue)
BlockStringValue(rawValue) ==
  LET lines == SplitLines(rawValue, 1, <<>>, <<>>)
      commonIndent == CommonIndent(lines)
      \* "If commonIndent is not null: For each line in lines: If line is the
      \* first item in lines, continue to the next line. Remove commonIndent
      \* characters from the beginning of line."
      dedented == [n \in DOMAIN lines |->
                     IF n = 1 \/ commonIndent = -1 THEN lines[n] ELSE Drop(lines[n], commonIndent)]
      \* "While the first item line in lines contains only Whitespace: Remove
      \* the first item from lines." Likewise for the last item.
      trimmed == DropTrailingBlankLines(DropLeadingBlankLines(dedented))
  IN JoinLines(trimmed, 1)

\* BlockString :: `"""` BlockStringCharacter* `"""`, from k on, with the raw
\* value so far in raw.
\* BlockStringCharacter ::
\*   SourceCharacter but not `"""` or `\"""`
\*   `\"""`                     "Return the character sequence `"""`."
\* Escape sequences are otherwise "simply that sequence of characters".
RECURSIVE BlockStringCharacters(_, _, _)
BlockStringCharacters(src, k, raw) ==
  CASE Ch(src, k) = None -> Failed(k)
    [] Slice(src, k, k + 3) = <<Backslash, Quote, Quote, Quote>> ->
         BlockStringCharacters(src, k + 4, raw \o <<Quote, Quote, Quote>>)
    [] Slice(src, k, k + 2) = <<Quote, Quote, Quote>> ->
         Matched(k + 3, BlockStringValue(raw))
    [] OTHER -> BlockStringCharacters(src, k + 1, Append(raw, src[k]))

\* StringValue ::
\*   `""` [lookahead != `"`]
\*   `"` StringCharacter+ `"`
\*   BlockString
\* "the source """""" can only be interpreted as a single empty block string
\* and not three empty strings."
StringValueAt(src, i) ==
  CASE Ch(src, i + 1) = Quote /\ Ch(src, i + 2) = Quote -> BlockStringCharacters(src, i + 3, <<>>)
    [] Ch(src, i + 1) = Quote -> Matched(i + 2, <<>>)
    [] OTHER -> StringCharacters(src, i + 1, <<>>)

IsBlockStringAt(src, i) == Slice(src, i, i + 2) = <<Quote, Quote, Quote>>

-----------------------------------------------------------------------------
(* §2.1.5 Lexical Tokens *)

Token(kind, value) == [kind |-> kind, value |-> value]

\* Token :: Punctuator | Name | IntValue | FloatValue | StringValue
\* The productions start with disjoint characters, so the first one picks
\* the production. A FloatValue and an IntValue are told apart by their text.
\* Returns [scan, kind].
TokenAt(src, i) ==
  LET c == Ch(src, i) IN
  CASE c = Quote ->
         [scan |-> StringValueAt(src, i),
          kind |-> IF IsBlockStringAt(src, i) THEN "BlockString" ELSE "StringValue"]
    [] IsNameStart(c) -> [scan |-> NameAt(src, i), kind |-> "Name"]
    [] IsDigit(c) \/ c = Minus ->
         LET scan == NumberAt(src, i) IN
         [scan |-> scan,
          kind |-> IF IsIntValueText(scan.value) THEN "IntValue" ELSE "FloatValue"]
    [] OTHER -> [scan |-> PunctuatorAt(src, i), kind |-> "Punctuator"]

Lexed(ok, tokens, pos) == [ok |-> ok, tokens |-> tokens, pos |-> pos]

\* The tokens from index i on, omitting Ignored.
RECURSIVE LexFrom(_, _, _)
LexFrom(src, i, tokens) ==
  IF i > Len(src) THEN Lexed(TRUE, tokens, i)
  ELSE IF IgnoredLength(src, i) > 0 THEN LexFrom(src, i + IgnoredLength(src, i), tokens)
  ELSE LET next == TokenAt(src, i) IN
       IF next.scan.ok
       THEN LexFrom(src, next.scan.end, Append(tokens, Token(next.kind, next.scan.value)))
       ELSE Lexed(FALSE, <<>>, next.scan.end)

\* "The source text of a GraphQL document must be a sequence of
\* SourceCharacter. The character sequence must be described by a sequence
\* of Token and Ignored lexical grammars."
Lex(src) ==
  LET invalid == {k \in DOMAIN src : ~IsSourceCharacter(src[k])} IN
  IF invalid # {}
  THEN Lexed(FALSE, <<>>, CHOOSE k \in invalid : \A j \in invalid : k <= j)
  ELSE LexFrom(src, 1, <<>>)

-----------------------------------------------------------------------------
(* Hand-written vectors, checked by Lexer.cfg *)

\* Text("...") is the code points of an ASCII TLA+ string, so vectors can
\* be written as text. Non-ASCII code points are appended as numbers.
Printable == " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~"
Ord(c) ==
  CASE c = "\t" -> Tab [] c = "\n" -> LF [] c = "\r" -> CR
    [] OTHER -> 31 + CHOOSE k \in 1..Len(Printable) : SubSeq(Printable, k, k) = c
Text(s) == [k \in 1..Len(s) |-> Ord(SubSeq(s, k, k))]

P(s) == Token("Punctuator", Text(s))
N(s) == Token("Name", Text(s))
I(s) == Token("IntValue", Text(s))
F(s) == Token("FloatValue", Text(s))
S(s) == Token("StringValue", Text(s))
B(s) == Token("BlockString", Text(s))

Tokens(tokens) == [ok |-> TRUE, tokens |-> tokens]
SyntaxError == [ok |-> FALSE, tokens |-> <<>>]

V(source, expected) == [source |-> source, expected |-> expected]

\* Error positions are not compared: only success or failure, and the tokens.
Passes(v) ==
  LET lexed == Lex(v.source) IN
  lexed.ok = v.expected.ok /\ lexed.tokens = v.expected.tokens

IgnoredVectors == <<
  V(<<>>, Tokens(<<>>)),
  V(Text(" \t,\n\r\n\r,,") \o <<BOM>>, Tokens(<<>>)),
  V(Text("\r"), Tokens(<<>>)),
  V(Text("a,b"), Tokens(<<N("a"), N("b")>>)),
  V(Text("# comment\nx"), Tokens(<<N("x")>>)),
  V(Text("#c\rx"), Tokens(<<N("x")>>)),
  V(Text("a#b c"), Tokens(<<N("a")>>)),
  V(Text("#") \o <<128169>> \o Text("\nx"), Tokens(<<N("x")>>)),
  V(Text("a") \o <<BOM>> \o Text("b"), Tokens(<<N("a"), N("b")>>)),
  \* "an unpaired surrogate code point is not a valid source character"
  V(<<55296>>, SyntaxError),
  V(Text("a ") \o <<57343>>, SyntaxError),
  V(Text("#") \o <<56320>>, SyntaxError),
  V(Text("\"") \o <<55296>> \o Text("\""), SyntaxError),
  \* Non-ASCII outside strings and comments, and "Zs" (U+00A0) is not
  \* Whitespace.
  V(<<233>>, SyntaxError),
  V(Text("a") \o <<160>> \o Text("b"), SyntaxError),
  V(Text("'a'"), SyntaxError)
>>

PunctuatorAndNameVectors == <<
  V(Text("!$&()...:=@[]{|}"),
    Tokens(<<P("!"), P("$"), P("&"), P("("), P(")"), P("..."), P(":"), P("="), P("@"),
             P("["), P("]"), P("{"), P("|"), P("}")>>)),
  V(Text("......"), Tokens(<<P("..."), P("...")>>)),
  V(Text("..."), Tokens(<<P("...")>>)),
  V(Text("."), SyntaxError),
  V(Text(".."), SyntaxError),
  V(Text("...."), SyntaxError),
  V(Text(". .."), SyntaxError),
  V(Text("?"), SyntaxError),
  V(Text("_a1 B_ __typename"), Tokens(<<N("_a1"), N("B_"), N("__typename")>>)),
  V(Text("a1"), Tokens(<<N("a1")>>)),
  V(Text("a.b"), SyntaxError),
  V(Text("$a"), Tokens(<<P("$"), N("a")>>))
>>

NumberVectors == <<
  V(Text("0"), Tokens(<<I("0")>>)),
  V(Text("-0"), Tokens(<<I("-0")>>)),
  V(Text("123 -123"), Tokens(<<I("123"), I("-123")>>)),
  V(Text("1.0 1e50 6.0221413e23 1E-2 1.5e+10 0.0 0e0"),
    Tokens(<<F("1.0"), F("1e50"), F("6.0221413e23"), F("1E-2"), F("1.5e+10"), F("0.0"), F("0e0")>>)),
  \* "the source 00 is invalid"
  V(Text("00"), SyntaxError),
  V(Text("01"), SyntaxError),
  V(Text("-01"), SyntaxError),
  V(Text("00.5"), SyntaxError),
  V(Text("1."), SyntaxError),
  V(Text("1.e1"), SyntaxError),
  V(Text(".5"), SyntaxError),
  V(Text("1e"), SyntaxError),
  V(Text("1e+"), SyntaxError),
  V(Text("1.5e"), SyntaxError),
  \* "the sequences 0x123 and 123L have no valid lexical representations"
  V(Text("0x123"), SyntaxError),
  V(Text("123L"), SyntaxError),
  V(Text("1_"), SyntaxError),
  \* "the sequence 1.23.4 cannot be interpreted as two tokens"
  V(Text("1.23.4"), SyntaxError),
  V(Text("1..."), SyntaxError),
  V(Text("0x1.2p3"), SyntaxError),
  V(Text("-"), SyntaxError),
  V(Text("--1"), SyntaxError),
  V(Text("+1"), SyntaxError),
  \* `-` and `"` are not in the lookahead restriction.
  V(Text("1-2"), Tokens(<<I("1"), I("-2")>>)),
  V(Text("1\"a\""), Tokens(<<I("1"), S("a")>>)),
  V(Text("1,2"), Tokens(<<I("1"), I("2")>>)),
  V(Text("1") \o <<233>>, SyntaxError)
>>

StringVectors == <<
  V(Text("\"\""), Tokens(<<S("")>>)),
  V(Text("\"abc\""), Tokens(<<S("abc")>>)),
  V(Text("\"\"x"), Tokens(<<S(""), N("x")>>)),
  V(Text("\"a\"\"b\""), Tokens(<<S("a"), S("b")>>)),
  V(Text("\"a"), SyntaxError),
  V(Text("\"a\nb\""), SyntaxError),
  V(Text("\"a\rb\""), SyntaxError),
  V(Text("\"\\\"\\\\\\/\\b\\f\\n\\r\\t\""),
    Tokens(<<Token("StringValue", <<34, 92, 47, 8, 12, 10, 13, 9>>)>>)),
  V(Text("\"\\x\""), SyntaxError),
  V(Text("\"\\\""), SyntaxError),
  V(Text("\"\\u0041\\u00e9\\u00E9\""), Tokens(<<Token("StringValue", <<65, 233, 233>>)>>)),
  V(Text("\"\\u004\""), SyntaxError),
  V(Text("\"\\U0041\""), SyntaxError),
  V(Text("\"\\u{1F4A9}\\u{0}\\u{10FFFF}\""), Tokens(<<Token("StringValue", <<128169, 0, 1114111>>)>>)),
  \* "both sources "\uDEAD" and "\u{110000}" should not be considered valid"
  V(Text("\"\\uDEAD\""), SyntaxError),
  V(Text("\"\\u{110000}\""), SyntaxError),
  V(Text("\"\\u{}\""), SyntaxError),
  V(Text("\"\\u{D800}\""), SyntaxError),
  V(Text("\"\\u{1F4A9\""), SyntaxError),
  \* EscapedUnicode :: `{` HexDigit+ `}` has no limit on the digits.
  V(Text("\"\\u{000000041}\""), Tokens(<<S("A")>>)),
  \* "the input "\uD83D\uDCA9" is a valid StringValue which represents the
  \* same Unicode text as "\u{1F4A9}""
  V(Text("\"\\uD83D\\uDCA9\""), Tokens(<<Token("StringValue", <<128169>>)>>)),
  V(Text("\"\\u0041\\uD83D\\uDCA9\""), Tokens(<<Token("StringValue", <<65, 128169>>)>>)),
  V(Text("\"\\uD83D\""), SyntaxError),
  V(Text("\"\\uD83Dx\""), SyntaxError),
  V(Text("\"\\uD83D\\u0041\""), SyntaxError),
  V(Text("\"\\uDCA9\\uD83D\""), SyntaxError),
  V(Text("\"\\uD83D\\uD83D\""), SyntaxError),
  V(Text("\"\\uD83D\\u{DCA9}\""), SyntaxError),
  V(Text("\"") \o <<128169, 233>> \o Text("\""), Tokens(<<Token("StringValue", <<128169, 233>>)>>)),
  \* "the source """""" can only be interpreted as a single empty block string"
  V(Text("\"\"\"\"\"\""), Tokens(<<B("")>>)),
  V(Text("\"\"\"\""), SyntaxError),
  V(Text("\"\"\"\"\""), SyntaxError)
>>

BlockStringVectors == <<
  \* The spec's example.
  V(Text("\"\"\"\n    Hello,\n      World!\n\n    Yours,\n      GraphQL.\n  \"\"\""),
    Tokens(<<B("Hello,\n  World!\n\nYours,\n  GraphQL.")>>)),
  V(Text("\"\"\"  a  \"\"\""), Tokens(<<B("  a  ")>>)),
  V(Text("\"\"\"\n\n  \n\"\"\""), Tokens(<<B("")>>)),
  V(Text("\"\"\"  \n  a\"\"\""), Tokens(<<B("a")>>)),
  V(Text("\"\"\"x\n   y\n  z\"\"\""), Tokens(<<B("x\n y\nz")>>)),
  V(Text("\"\"\"\n  a\n    b\n  \"\"\""), Tokens(<<B("a\n  b")>>)),
  V(Text("\"\"\"\n    a\n  \n    b\n\"\"\""), Tokens(<<B("a\n\nb")>>)),
  V(Text("\"\"\"\n  a\n\n\n\"\"\""), Tokens(<<B("a")>>)),
  \* A tab is one Whitespace character, like a space.
  V(Text("\"\"\"\ta\n\tb\"\"\""), Tokens(<<B("\ta\nb")>>)),
  V(Text("\"\"\"\n\ta\n  b\n\"\"\""), Tokens(<<B("a\n b")>>)),
  V(Text("\"\"\"\n\t\ta\n\t  b\n\"\"\""), Tokens(<<B("a\n b")>>)),
  \* "Carriage Return (U+000D)" "New Line (U+000A)" is one LineTerminator.
  V(Text("\"\"\"a\r\nb\"\"\""), Tokens(<<B("a\nb")>>)),
  V(Text("\"\"\"\r\n  a\r\n  b\r\n\"\"\""), Tokens(<<B("a\nb")>>)),
  V(Text("\"\"\"a\rb\"\"\""), Tokens(<<B("a\nb")>>)),
  V(Text("\"\"\"a\r\rb\"\"\""), Tokens(<<B("a\n\nb")>>)),
  V(Text("\"\"\"a\n\rb\"\"\""), Tokens(<<B("a\n\nb")>>)),
  \* `\"""` is the character sequence `"""`; other escapes are verbatim.
  V(Text("\"\"\"a\\\"\"\"b\"\"\""), Tokens(<<B("a\"\"\"b")>>)),
  V(Text("\"\"\"\\\"\"\"\"\"\""), Tokens(<<B("\"\"\"")>>)),
  V(Text("\"\"\"\\n\\u{1F4A9}\\\"\"\"\""), SyntaxError),
  V(Text("\"\"\"\\n\\u{1F4A9}\\\"\" \"\"\""), Tokens(<<B("\\n\\u{1F4A9}\\\"\" ")>>)),
  V(Text("\"\"\"\\\"\"\""), SyntaxError),
  V(Text("\"\"\"a\"\"\"\""), SyntaxError),
  V(Text("\"\"\"a\"\"b\"\"\""), Tokens(<<B("a\"\"b")>>)),
  V(Text("\"\"\"a"), SyntaxError),
  V(Text("\"\"\"") \o <<128169>> \o Text("\"\"\""), Tokens(<<Token("BlockString", <<128169>>)>>)),
  V(Text("\"\"\"") \o <<56320>> \o Text("\"\"\""), SyntaxError)
>>

Vectors == [Ignored |-> IgnoredVectors, PunctuatorsAndNames |-> PunctuatorAndNameVectors,
            Numbers |-> NumberVectors, Strings |-> StringVectors, BlockStrings |-> BlockStringVectors]

\* Each initial state is one vector, so a counterexample names it.
VARIABLE vector
Init == vector \in UNION {{[group |-> g, n |-> n] : n \in DOMAIN Vectors[g]} : g \in DOMAIN Vectors}
Next == UNCHANGED vector

VectorPasses(group) == vector.group = group => Passes(Vectors[group][vector.n])

IgnoredTokensLex == VectorPasses("Ignored")
PunctuatorsAndNamesLex == VectorPasses("PunctuatorsAndNames")
NumbersLex == VectorPasses("Numbers")
StringsLex == VectorPasses("Strings")
BlockStringsLex == VectorPasses("BlockStrings")

=============================================================================
