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
(*   - B, the built-ins, keeps only the built-in directives the service    *)
(*     returned: the spec says a service "should provide" @skip, @include, *)
(*     @specifiedBy and @oneOf, and "must provide" @deprecated when it     *)
(*     represents deprecation. A missing one is a builtinDirectives        *)
(*     problem, which Matches doesn't see.                                 *)
(*   - B also has any other directive the service provides ("GraphQL       *)
(*     services and tools may also provide any additional custom           *)
(*     directive"), as the service describes it, so that the types its     *)
(*     arguments reference count as referenced.                            *)
(*   - __typename isn't in Matches: the root's __typename must name the    *)
(*     query root type, and no fields list may contain __typename (§4.1).  *)
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

ListProblems(aspect, where, e, a, dep) ==
  LET m == MembershipProblems(aspect, where, e, a, dep) IN
  IF m # {} THEN m ELSE OrderProblems(where, e, a)

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
InputValuesProblems(FS, aspect, where, open, close, defs, e, a) ==
  ListProblems(aspect, where, e, a, DeprecatedNames(defs))
  \cup UNION {InputValueProblems(FS, aspect, where \o open \o n \o close, ByName(e, n), ByName(a, n)) :
                n \in Common(e, a)}

FieldProblems(FS, where, def, e, a) ==
  (IF e.type = a.type THEN {} ELSE {P("fields", where)})
  \cup DescriptionProblems(where, e, a)
  \cup DeprecationProblems(where, e, a)
  \cup InputValuesProblems(FS, "arguments", where, "(", ":)", def.args, e.args, a.args)

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
  LET n == T.name IN
  IF KindMismatch(e, a) THEN {P("kind", n)}
  ELSE
    DescriptionProblems(n, e, a)
    \cup (IF e.specifiedByURL = a.specifiedByURL THEN {} ELSE {P("specifiedByURL", n)})
    \cup (IF e.isOneOf = a.isOneOf THEN {} ELSE {P("isOneOf", n)})
    \cup (IF IsNull(e.fields) THEN {}
          ELSE LET ef == e.fields[1]
                   af == Without(a.fields[1], {"__typename"}, 1, <<>>)
               IN (IF Len(af) = Len(a.fields[1]) THEN {} ELSE {P("typename", n)})
                  \cup ListProblems("fields", n, ef, af, DeprecatedNames(T.fields))
                  \cup UNION {FieldProblems(FS, n \o "." \o f, FieldNamed(T, f), ByName(ef, f), ByName(af, f)) :
                                f \in Common(ef, af)})
    \cup (IF IsNull(e.inputFields) THEN {}
          ELSE InputValuesProblems(FS, "inputFields", n, ".", "", T.inputFields, e.inputFields[1], a.inputFields[1]))
    \cup (IF IsNull(e.enumValues) THEN {}
          ELSE LET ev == e.enumValues[1]
                   av == a.enumValues[1]
               IN ListProblems("enumValues", n, ev, av, DeprecatedNames(T.values))
                  \cup UNION {DescriptionProblems(n \o "." \o v, ByName(ev, v), ByName(av, v))
                              \cup DeprecationProblems(n \o "." \o v, ByName(ev, v), ByName(av, v)) :
                                v \in Common(ev, av)})
    \cup (IF IsNull(e.interfaces) THEN {}
          ELSE RefsProblems("interfaces", n, e.interfaces[1], a.interfaces[1], TRUE))
    \cup (IF IsNull(e.possibleTypes) THEN {}
          ELSE RefsProblems("interfaces", n, e.possibleTypes[1], a.possibleTypes[1], T.kind = "UNION"))

DirectiveProblems(FS, D, e, a) ==
  LET w == "@" \o D.name IN
  DescriptionProblems(w, e, a)
  \cup (IF e.isRepeatable = a.isRepeatable
           /\ Len(e.locations) = Len(a.locations) /\ Range(e.locations) = Range(a.locations)
        THEN {} ELSE {P("directives", w)})
  \cup InputValuesProblems(FS, "arguments", w, "(", ":)", D.args, e.args, a.args)
  \cup DeprecationProblems(w, e, a)

\* The built-ins a service provides: the spec's introspection types, the
\* spec's built-in directives it returned (`provided`), and its own
\* directives (`extras`).
ServiceBuiltins(provided, extras) ==
  [types |-> IntrospectionTypes,
   directives |-> Without(BuiltinDirectives, BuiltinDirectiveNames(SpecBuiltins) \ provided, 1, <<>>) \o extras]

\* What is wrong with `actual`, a full __schema result (built-ins included)
\* plus `typename`, the root's __typename.
Problems(S, B, inc, actual) ==
  LET FS == Full(S, B)
      expected == SchemaResult(S, B, inc)
      en == TypeNames(S, B)
      an == {u.name[1] : u \in {t \in Range(actual.types) : Len(t.name) = 1}}
      diff == (en \ an) \cup (an \ en)
      ed == expected.directives
      ad == actual.directives
      builtinNames == BuiltinDirectiveNames(B)
      membership == MembershipProblems("directives", "", ed, ad, DeprecatedNames(FS.directives))
      missing == {d.name : d \in Range(VisibleOf(inc, BuiltinDirectives))} \ NameSet(ad)
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
                x \in en \cap an}
  \cup membership
  \cup (IF membership # {} THEN {}
        ELSE OrderProblems("directives", Without(ed, builtinNames, 1, <<>>), Without(ad, builtinNames, 1, <<>>)))
  \cup {P("builtinDirectives", "@" \o d) : d \in missing}
  \cup UNION {DirectiveProblems(FS, DirectiveNamed(FS, d), ByName(ed, d), ByName(ad, d)) : d \in Common(ed, ad)}

\* The reference's verdict on a case, and the problems behind it.
CaseResult(S, c) ==
  LET B == ServiceBuiltins(c.provided, c.extras) IN
  <<Problems(S, B, c.inc, c.actual), Matches(S, B, c.inc, TRUE, c.actual)>>
====
