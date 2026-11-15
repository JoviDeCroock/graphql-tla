---- MODULE IntrospectChecks ----
(***************************************************************************)
(* The introspect area's checks (docs/kit/introspect.md). Introspection!   *)
(* Matches says whether a service's __schema result is right; Problems     *)
(* says which part is wrong, as <<aspect, where>> pairs, so that the kit   *)
(* can report one check per §4 aspect. Problems compares with the same     *)
(* operators Matches does (DescriptionMatches, DefaultMatches, SameRefSet, *)
(* SchemaResult), item by item and by name, and sets order apart: "Stable  *)
(* Ordering" is a SHOULD.                                                  *)
(*                                                                         *)
(* Where the spec lets a service differ from the reference's assumptions:  *)
(*   - Built-in directives: Introspection!Mismatches compares the result   *)
(*     with SchemaResult for the built-in directives the service returned, *)
(*     and requires only RequiredDirectiveNames (@deprecated, for a schema *)
(*     that deprecates something, and @specifiedBy or @oneOf when the      *)
(*     result shows them in use). A missing directive of                   *)
(*     RecommendedDirectiveNames is a builtinDirectives problem, a SHOULD, *)
(*     which Matches doesn't see.                                          *)
(*   - The profile (c.profile) picks the built-ins: SpecBuiltins for the   *)
(*     draft, Oct2021Builtins for October 2021. A draft answer with        *)
(*     problems is also compared with Oct2021Builtins, so that the kit can *)
(*     tell which problems with built-ins match October 2021.              *)
(*   - Wrapper types (actual.wrappers) must pass WrapperMatches: a         *)
(*     "wrapper" problem otherwise.                                        *)
(*   - B also has any other directive the service provides ("GraphQL       *)
(*     services and client tooling may provide any additional custom       *)
(*     directive"), as the service describes it, and the types its         *)
(*     arguments reach that the document doesn't define (extraTypes), so   *)
(*     that they count as the schema's types. They must be input types: a  *)
(*     serviceTypes problem otherwise, which Matches doesn't see either.   *)
(*   - Built-in types and directives have no source order, so their lists  *)
(*     have no order problems.                                             *)
(*   - __typename isn't in Matches: the root's __typename must name the    *)
(*     query root type, and no fields list may contain __typename (§4.1).  *)
(*   - __type(name:) results (lookup cases) are judged by                  *)
(*     Introspection!TypeByNameMatches, item by item as for types.         *)
(***************************************************************************)
EXTENDS Introspection

P(aspect, where) == <<aspect, where>>

NameSet(seq) == Range(NamesOf(seq))
Common(e, a) == NameSet(e) \cap NameSet(a)
IsNull(x) == x = None

\* The names of the deprecated items of a definition's list.
DeprecatedNames(seq) == {seq[k].name : k \in {j \in DOMAIN seq : IsDeprecated(seq[j])}}

\* The service returned the same items as expected, by name, each once.
\* When they differ only by deprecated items, includeDeprecated wasn't
\* honoured.
MembershipProblems(aspect, where, e, a, dep) ==
  LET en == NameSet(e)
      an == NameSet(a)
      diff == (en \ an) \cup (an \ en)
  IN IF Len(a) # Cardinality(an) THEN {P(aspect, where)}
     ELSE IF diff = {} THEN {}
     ELSE IF diff \subseteq dep THEN {P("deprecation", where)}
     ELSE {P(aspect, where)}

OrderProblems(where, e, a) == IF NamesOf(e) = NamesOf(a) THEN {} ELSE {P("order", where)}

\* `ordered`: whether the list has a source order.
ListProblems(aspect, where, e, a, dep, ordered) ==
  LET m == MembershipProblems(aspect, where, e, a, dep) IN
  IF m # {} \/ ~ordered THEN m ELSE OrderProblems(where, e, a)

DescriptionProblems(where, e, a) ==
  IF DescriptionMatches(e.description, a.description) THEN {} ELSE {P("description", where)}

DeprecationProblems(where, e, a) ==
  IF e.isDeprecated = a.isDeprecated /\ e.deprecationReason = a.deprecationReason
  THEN {} ELSE {P("deprecation", where)}

\* One argument or input field. e has the declared type in `ref`.
InputValueProblems(FS, aspect, where, e, a) ==
  (IF e.type = a.type THEN {} ELSE {P(aspect, where)})
  \cup DescriptionProblems(where, e, a)
  \cup (IF DefaultMatches(FS, e.ref, e.defaultValue, a.defaultValue) THEN {} ELSE {P("defaultValue", where)})
  \cup DeprecationProblems(where, e, a)

\* A list of arguments (open "(", close ":)") or input fields (".", "").
InputValuesProblems(FS, ordered, aspect, where, open, close, defs, e, a) ==
  ListProblems(aspect, where, e, a, DeprecatedNames(defs), ordered)
  \cup UNION {InputValueProblems(FS, aspect, where \o open \o n \o close, ByName(e, n), ByName(a, n)) :
                n \in Common(e, a)}

FieldProblems(FS, ordered, where, def, e, a) ==
  (IF e.type = a.type THEN {} ELSE {P("fields", where)})
  \cup DescriptionProblems(where, e, a)
  \cup DeprecationProblems(where, e, a)
  \cup InputValuesProblems(FS, ordered, "arguments", where, "(", ":)", def.args, e.args, a.args)

\* interfaces and possibleTypes: refs, in order when there is a source order.
RefsProblems(aspect, where, e, a, ordered) ==
  IF e = a THEN {}
  ELSE IF SameRefSet(e, a) THEN (IF ordered THEN {P("order", where)} ELSE {})
  ELSE {P(aspect, where)}

\* §4.2.2: which of __Type's fields are null depends on the kind.
KindMismatch(e, a) ==
  \/ e.kind # a.kind
  \/ IsNull(e.fields) # IsNull(a.fields)
  \/ IsNull(e.inputFields) # IsNull(a.inputFields)
  \/ IsNull(e.interfaces) # IsNull(a.interfaces)
  \/ IsNull(e.possibleTypes) # IsNull(a.possibleTypes)
  \/ IsNull(e.enumValues) # IsNull(a.enumValues)
  \/ IsNull(e.isOneOf) # IsNull(a.isOneOf)
  \/ e.kind # "SCALAR" /\ ~IsNull(a.specifiedByURL)

TypeProblems(FS, T, e, a) ==
  LET n == T.name
      ordered == ~IsBuiltinTypeName(n)
  IN
  IF KindMismatch(e, a) THEN {P("kind", n)}
  ELSE
    DescriptionProblems(n, e, a)
    \cup (IF e.specifiedByURL = a.specifiedByURL THEN {} ELSE {P("specifiedByURL", n)})
    \cup (IF e.isOneOf = a.isOneOf THEN {} ELSE {P("isOneOf", n)})
    \cup (IF IsNull(e.fields) THEN {}
          ELSE LET ef == e.fields[1]
                   af == Without(a.fields[1], {"__typename"}, 1, <<>>)
               IN (IF Len(af) = Len(a.fields[1]) THEN {} ELSE {P("typename", n)})
                  \cup ListProblems("fields", n, ef, af, DeprecatedNames(T.fields), ordered)
                  \cup UNION {FieldProblems(FS, ordered, n \o "." \o f, FieldNamed(T, f), ByName(ef, f), ByName(af, f)) :
                                f \in Common(ef, af)})
    \cup (IF IsNull(e.inputFields) THEN {}
          ELSE InputValuesProblems(FS, ordered, "inputFields", n, ".", "", T.inputFields, e.inputFields[1], a.inputFields[1]))
    \cup (IF IsNull(e.enumValues) THEN {}
          ELSE LET ev == e.enumValues[1]
                   av == a.enumValues[1]
               IN ListProblems("enumValues", n, ev, av, DeprecatedNames(T.values), ordered)
                  \cup UNION {DescriptionProblems(n \o "." \o v, ByName(ev, v), ByName(av, v))
                              \cup DeprecationProblems(n \o "." \o v, ByName(ev, v), ByName(av, v)) :
                                v \in Common(ev, av)})
    \cup (IF IsNull(e.interfaces) THEN {}
          ELSE RefsProblems("interfaces", n, e.interfaces[1], a.interfaces[1], ordered))
    \cup (IF IsNull(e.possibleTypes) THEN {}
          ELSE RefsProblems("interfaces", n, e.possibleTypes[1], a.possibleTypes[1], T.kind = "UNION"))

DirectiveProblems(FS, D, e, a) ==
  LET w == "@" \o D.name IN
  DescriptionProblems(w, e, a)
  \cup (IF e.isRepeatable = a.isRepeatable
           /\ Len(e.locations) = Len(a.locations) /\ Range(e.locations) = Range(a.locations)
        THEN {} ELSE {P("directives", w)})
  \cup InputValuesProblems(FS, ~IsBuiltinDirectiveName(D.name), "arguments", w, "(", ":)", D.args, e.args, a.args)
  \cup DeprecationProblems(w, e, a)

\* The built-ins a service may provide: the edition's introspection types
\* and built-in directives (E), its own directives (`extras`), and the
\* types their arguments reach that the document doesn't define
\* (`extraTypes`).
\* Introspection!Providing keeps the built-in directives it returned.
ServiceBuiltins(E, extras, extraTypes) ==
  [types |-> E.types \o extraTypes,
   directives |-> E.directives \o extras]

InputKinds == {"SCALAR", "ENUM", "INPUT_OBJECT"}

\* What is wrong with `actual`, a full __schema result (built-ins included)
\* plus `typename`, the root's __typename. extraTypes are the service's
\* types that B also has.
Problems(S0, B, extraTypes, inc, actual) ==
  LET S == AsProvided(S0, actual.builtinDirectiveNames)
      P0 == Providing(B, actual.builtinDirectiveNames)
      FS == Full(S, P0)
      expected == SchemaResult(S, P0, inc)
      en == TypeNames(S, P0)
      an == {u.name[1] : u \in {t \in Range(actual.types) : Len(t.name) = 1}}
      diff == (en \ an) \cup (an \ en)
      ed == expected.directives
      ad == actual.directives
      builtinNames == BuiltinDirectiveNames(B)
      membership == MembershipProblems("directives", "", ed, ad, DeprecatedNames(FS.directives))
      returned == NameSet(ad)
      required == RequiredDirectiveNames(S, actual)
      badTypes == {T.name : T \in {U \in Range(extraTypes) : U.kind \notin InputKinds}}
  IN
  (IF DescriptionMatches(expected.description, actual.description) THEN {} ELSE {P("description", "schema")})
  \cup (IF /\ expected.queryType = actual.queryType
           /\ expected.mutationType = actual.mutationType
           /\ expected.subscriptionType = actual.subscriptionType
        THEN {} ELSE {P("roots", "schema")})
  \cup (IF actual.typename = RootTypeName(S, "query") THEN {} ELSE {P("typename", "")})
  \cup (IF (\A i \in DOMAIN actual.types : Len(actual.types[i].name) = 1) /\ Len(actual.types) = Cardinality(an)
        THEN {} ELSE {P("types", "")})
  \cup {P(IF x \in BuiltinScalarNames THEN "builtinScalars" ELSE "types", x) : x \in diff}
  \cup UNION {TypeProblems(FS, TypeNamed(FS, x), ByName(expected.types, <<x>>), ByName(actual.types, <<x>>)) :
                x \in (en \cap an) \ badTypes}
  \cup {P("serviceTypes", x) : x \in badTypes}
  \cup membership
  \cup (IF membership # {} THEN {}
        ELSE OrderProblems("directives", Without(ed, builtinNames, 1, <<>>), Without(ad, builtinNames, 1, <<>>)))
  \cup {P("requiredDirective", "@" \o d) : d \in required \ returned}
  \cup {P("builtinDirectives", "@" \o d) : d \in RecommendedDirectiveNames(S0) \ (returned \cup required)}
  \cup UNION {DirectiveProblems(FS, DirectiveNamed(FS, d), ByName(ed, d), ByName(ad, d)) : d \in Common(ed, ad)}
  \cup {P("wrapper", w.where) : w \in {x \in Range(actual.wrappers) : ~WrapperMatches(x)}}

\* What is wrong with a sequence of __type(name:) results, each
\* [name, result] with result an optional __Type. `provided` names the
\* built-in directives the service returned for the same schema's
\* __schema, which lookups don't show.
LookupProblems(S0, B, inc, lookups, provided) ==
  LET S == AsProvided(S0, provided)
      FS == Full(S, B)
  IN
  UNION {LET l == lookups[i]
             e == TypeByName(S, B, inc, l.name)
         IN IF e = None /\ l.result = None THEN {}
            ELSE IF e = None \/ l.result = None \/ l.result[1].name # Some(l.name)
            THEN {P("typeByName", l.name)}
            ELSE TypeProblems(FS, TypeNamed(FS, l.name), e[1], l.result[1]) :
         i \in DOMAIN lookups}

EditionBuiltins(profile) == IF profile = "oct2021" THEN Oct2021Builtins ELSE SpecBuiltins

\* The problems with a case for the edition's built-ins E.
CaseProblems(S, c, E) ==
  IF c.kind = "lookup"
  THEN LookupProblems(S, E, c.inc, c.actual, c.provided)
  ELSE Problems(S, ServiceBuiltins(E, c.extras, c.extraTypes), c.extraTypes, c.inc, c.actual)

\* The reference's verdict on a case, the problems behind it, and for a
\* draft answer with problems, its problems against October 2021's
\* built-ins.
CaseResult(S, c) ==
  LET E == EditionBuiltins(c.profile)
      problems == CaseProblems(S, c, E)
      matches ==
        IF c.kind = "lookup"
        THEN \A i \in DOMAIN c.actual :
               TypeByNameMatches(AsProvided(S, c.provided), E, c.inc, c.actual[i].name, c.actual[i].result)
        ELSE /\ Matches(S, ServiceBuiltins(E, c.extras, c.extraTypes), c.inc, TRUE, c.actual)
             /\ \A i \in DOMAIN c.actual.wrappers : WrapperMatches(c.actual.wrappers[i])
  IN <<problems, matches,
       IF c.profile = "draft" /\ problems # {} THEN CaseProblems(S, c, Oct2021Builtins) ELSE {}>>
====
