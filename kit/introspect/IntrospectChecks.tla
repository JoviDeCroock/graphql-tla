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
(*   - The profile (c.profile) picks the built-ins: SpecBuiltins for       *)
(*     September 2026, Sep2025Builtins for September 2025, Oct2021Builtins *)
(*     for October 2021. An answer with problems is also compared with     *)
(*     each other edition's built-ins, so that the kit can tell which      *)
(*     problems with built-ins match which edition.                        *)
(*   - Wrapper types (a "wrappers" case, the answer to __type(name:        *)
(*     "__Schema"), asked on its own) must pass WrapperMatches: a          *)
(*     "wrapper" problem otherwise. The answer they come from              *)
(*     (actual.wrapperFields) must pass SchemaFieldsMatch: a               *)
(*     "wrapperFields" problem per field of __Schema otherwise.            *)
(*   - Some differences get their own aspect, so that the kit can grade    *)
(*     them at the level the spec gives them: "includeDeprecated" (a list  *)
(*     whose only difference is deprecated items), "nullability" (a        *)
(*     field's type differs only in Non-Null), "inputNullability" (an      *)
(*     argument or input field is nullable where the expected type has     *)
(*     Non-Null, and nothing else differs in its type),                    *)
(*     "defaultValueOmitted" (null for an input value that has a default), *)
(*     "specifiedByURLOmitted" (null for a scalar that has a URL),         *)
(*     "deprecationReasonOmitted" (null for a deprecated item's reason),   *)
(*     "unreferencedTypes" (a type the document defines that nothing       *)
(*     references is missing), "locations" and "added:locations" (a       *)
(*     directive location left out, or added), "isRepeatable", and         *)
(*     "isOneOfNull" and "wrapperIsOneOf" (isOneOf, which October 2021     *)
(*     doesn't have, null where it shouldn't be or not null where it       *)
(*     should).                                                            *)
(*   - An item a service adds to a built-in list (a field, argument or     *)
(*     enum value), or a type it adds, is an "added:" problem, set apart   *)
(*     from one it leaves out.                                             *)
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
\* Items left out and items added are set apart: an added item is
\* "added:" \o aspect, so that the kit can tell an extension of a built-in
\* type from a change to it. When the difference is only deprecated items,
\* includeDeprecated wasn't honoured: an "includeDeprecated" problem.
MembershipProblems(aspect, where, e, a, dep) ==
  LET en == NameSet(e)
      an == NameSet(a)
      missing == en \ an
      added == an \ en
  IN IF Len(a) # Cardinality(an) THEN {P(aspect, where)}
     ELSE (IF missing = {} THEN {}
           ELSE IF missing \subseteq dep THEN {P("includeDeprecated", where)}
           ELSE {P(aspect, where)})
          \cup (IF added = {} THEN {}
                ELSE IF added \subseteq dep THEN {P("includeDeprecated", where)}
                ELSE {P("added:" \o aspect, where)})

OrderProblems(where, e, a) == IF NamesOf(e) = NamesOf(a) THEN {} ELSE {P("order", where)}

\* `ordered`: whether the list has a source order.
ListProblems(aspect, where, e, a, dep, ordered) ==
  LET m == MembershipProblems(aspect, where, e, a, dep) IN
  IF m # {} \/ ~ordered THEN m ELSE OrderProblems(where, e, a)

DescriptionProblems(where, e, a) ==
  IF DescriptionMatches(e.description, a.description) THEN {} ELSE {P("description", where)}

\* A deprecated item whose reason is null, where the expected one has a
\* reason, is "deprecationReasonOmitted": October 2021 says only that
\* deprecationReason "optionally provides a reason" (run.mjs grades it as
\* deprecation under the later editions' profiles, where it "returns the
\* reason").
DeprecationProblems(where, e, a) ==
  IF e.isDeprecated = a.isDeprecated /\ e.deprecationReason = a.deprecationReason
  THEN {}
  ELSE IF e.isDeprecated = a.isDeprecated /\ e.deprecationReason # None /\ a.deprecationReason = None
  THEN {P("deprecationReasonOmitted", where)}
  ELSE {P("deprecation", where)}

\* §4.2.4: "defaultValue may return a String encoding ... of the default
\* value". Null for an input value that has a default is
\* "defaultValueOmitted"; any other difference is "defaultValue".
DefaultProblems(FS, where, e, a) ==
  IF DefaultMatches(FS, e.ref, e.defaultValue, a.defaultValue) THEN {}
  ELSE IF e.defaultValue # None /\ a.defaultValue = None THEN {P("defaultValueOmitted", where)}
  ELSE {P("defaultValue", where)}

\* A type ref without its Non-Null wrappers.
Nullable(ref) == SelectSeq(ref, LAMBDA r : r.kind # "NON_NULL")

\* For each List or named level of a type ref, outermost first, whether
\* it is wrapped in Non-Null.
RECURSIVE NonNullFlags(_)
NonNullFlags(ref) ==
  IF ref = <<>> THEN <<>>
  ELSE IF Head(ref).kind # "NON_NULL" THEN <<FALSE>> \o NonNullFlags(Tail(ref))
  ELSE IF Len(ref) = 1 THEN <<TRUE>>
  ELSE <<TRUE>> \o NonNullFlags(Tail(Tail(ref)))

\* a is e with some of its Non-Null wrappers taken off, and nothing else
\* changed. An argument or input field of type a accepts every value one
\* of type e accepts.
Loosens(e, a) ==
  /\ Nullable(e) = Nullable(a)
  /\ Len(NonNullFlags(e)) = Len(NonNullFlags(a))
  /\ \A j \in DOMAIN NonNullFlags(a) : NonNullFlags(a)[j] => NonNullFlags(e)[j]

\* One argument or input field. e has the declared type in `ref`. A type
\* that only loosens the expected one's Non-Null is "inputNullability".
InputValueProblems(FS, aspect, where, e, a) ==
  (IF e.type = a.type THEN {}
   ELSE IF Loosens(e.type, a.type) THEN {P("inputNullability", where)}
   ELSE {P(aspect, where)})
  \cup DescriptionProblems(where, e, a)
  \cup DefaultProblems(FS, where, e, a)
  \cup DeprecationProblems(where, e, a)

\* A list of arguments (open "(", close ":)") or input fields (".", "").
InputValuesProblems(FS, ordered, aspect, where, open, close, defs, e, a) ==
  ListProblems(aspect, where, e, a, DeprecatedNames(defs), ordered)
  \cup UNION {InputValueProblems(FS, aspect, where \o open \o n \o close, ByName(e, n), ByName(a, n)) :
                n \in Common(e, a)}

\* A field whose type differs from the expected one only in Non-Null is a
\* "nullability" problem.
FieldProblems(FS, ordered, where, def, e, a) ==
  (IF e.type = a.type THEN {}
   ELSE IF Nullable(e.type) = Nullable(a.type) THEN {P("nullability", where)}
   ELSE {P("fields", where)})
  \cup DescriptionProblems(where, e, a)
  \cup DeprecationProblems(where, e, a)
  \cup InputValuesProblems(FS, ordered, "arguments", where, "(", ":)", def.args, e.args, a.args)

\* interfaces and possibleTypes: refs, in order when there is a source order.
RefsProblems(aspect, where, e, a, ordered) ==
  IF e = a THEN {}
  ELSE IF SameRefSet(e, a) THEN (IF ordered THEN {P("order", where)} ELSE {})
  ELSE {P(aspect, where)}

\* §4.2.2: which of __Type's fields are null depends on the kind. isOneOf,
\* new in September 2025, is apart: an "isOneOfNull" problem.
KindMismatch(e, a) ==
  \/ e.kind # a.kind
  \/ IsNull(e.fields) # IsNull(a.fields)
  \/ IsNull(e.inputFields) # IsNull(a.inputFields)
  \/ IsNull(e.interfaces) # IsNull(a.interfaces)
  \/ IsNull(e.possibleTypes) # IsNull(a.possibleTypes)
  \/ IsNull(e.enumValues) # IsNull(a.enumValues)
  \/ e.kind # "SCALAR" /\ ~IsNull(a.specifiedByURL)

TypeProblems(FS, T, e, a) ==
  LET n == T.name
      ordered == ~IsBuiltinTypeName(n)
  IN
  IF KindMismatch(e, a) THEN {P("kind", n)}
  ELSE
    DescriptionProblems(n, e, a)
    \* "specifiedByURL may return a String (in the form of a URL) for
    \* custom scalars": null where the document gives a URL is
    \* "specifiedByURLOmitted".
    \cup (IF e.specifiedByURL = a.specifiedByURL THEN {}
          ELSE IF e.specifiedByURL # None /\ a.specifiedByURL = None THEN {P("specifiedByURLOmitted", n)}
          ELSE {P("specifiedByURL", n)})
    \cup (IF e.isOneOf = a.isOneOf THEN {}
          ELSE IF IsNull(e.isOneOf) # IsNull(a.isOneOf) THEN {P("isOneOfNull", n)}
          ELSE {P("isOneOf", n)})
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

\* A directive's locations: one left out (or repeated) is "locations", one
\* added is "added:locations", so that the kit can tell which edition each
\* follows.
LocationProblems(w, e, a) ==
  LET el == Range(e.locations)
      al == Range(a.locations)
  IN (IF el \subseteq al /\ Len(a.locations) = Cardinality(al) THEN {} ELSE {P("locations", w)})
     \cup (IF al \subseteq el THEN {} ELSE {P("added:locations", w)})

DirectiveProblems(FS, D, e, a) ==
  LET w == "@" \o D.name IN
  DescriptionProblems(w, e, a)
  \cup (IF e.isRepeatable = a.isRepeatable THEN {} ELSE {P("isRepeatable", w)})
  \cup LocationProblems(w, e, a)
  \cup InputValuesProblems(FS, ~IsBuiltinDirectiveName(D.name), "arguments", w, "(", ":)", D.args, e.args, a.args)
  \cup DeprecationProblems(w, e, a)

\* The fields of __Schema the wrapper answer must have, each once with its
\* type (Introspection!SchemaFieldsMatch), one problem per field.
WrapperFieldsProblems(B, fields) ==
  {P("wrapperFields", "__Schema." \o f.name) :
     f \in {g \in Range(TypeNamed(B, "__Schema").fields) :
              IF Cardinality({i \in DOMAIN fields : fields[i].name = g.name}) # 1 THEN TRUE
              ELSE ByName(fields, g.name).type # RefResult(B, g.type)}}

\* The built-ins a service may provide: the edition's introspection types
\* and built-in directives (E), its own directives (`extras`), and the
\* types their arguments reach that the document doesn't define
\* (`extraTypes`).
\* Introspection!Providing keeps the built-in directives it returned.
ServiceBuiltins(E, extras, extraTypes) ==
  [types |-> E.types \o extraTypes,
   directives |-> E.directives \o extras]

InputKinds == {"SCALAR", "ENUM", "INPUT_OBJECT"}

\* The types a type refers to: those of its fields, their arguments and its
\* input fields, its interfaces and union members, and an interface's
\* implementations (its possibleTypes).
RefersTo(FS, T) ==
  {T.fields[k].type.name : k \in DOMAIN T.fields}
  \cup UNION {ArgTypeNames(T.fields[k].args) : k \in DOMAIN T.fields}
  \cup ArgTypeNames(T.inputFields)
  \cup Range(T.interfaces) \cup Range(T.members)
  \cup (IF T.kind = "INTERFACE" THEN Implementations(FS, T.name) ELSE {})

RECURSIVE ReachedFrom(_, _, _)
ReachedFrom(FS, seen, frontier) ==
  IF frontier = {} THEN seen
  ELSE LET all == seen \cup frontier IN
       ReachedFrom(FS, all, UNION {RefersTo(FS, TypeNamed(FS, n)) : n \in frontier} \ all)

\* The types a client can reach from the root operation types and the
\* directives' arguments. §4.2.1 says types "must return the set of all
\* named types contained within this schema. Any named type which can be
\* found through a field of any introspection type must be included in
\* this set." Whether a type the document defines but nothing reaches is
\* "contained within this schema" isn't settled, so leaving one out is an
\* "unreferencedTypes" problem, which the kit grades as a SHOULD.
Referenced(S, FS) ==
  ReachedFrom(FS, {},
    {RootTypeName(S, o)[1] : o \in {x \in {"query", "mutation", "subscription"} : RootTypeName(S, x) # <<>>}}
    \cup UNION {ArgTypeNames(FS.directives[i].args) : i \in DOMAIN FS.directives})

\* What is wrong with `actual`, a full __schema result (built-ins included)
\* plus `typename`, the root's __typename. extraTypes are the service's
\* types that B also has.
Problems(S0, B, extraTypes, inc, actual) ==
  LET S == AsProvided(S0, ProvidedNames(actual))
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
      referenced == Referenced(S, FS)
      unreferenced(x) == x \notin an /\ ~IsBuiltinTypeName(x) /\ x \notin referenced
  IN
  (IF DescriptionMatches(expected.description, actual.description) THEN {} ELSE {P("description", "schema")})
  \cup (IF /\ expected.queryType = actual.queryType
           /\ expected.mutationType = actual.mutationType
           /\ expected.subscriptionType = actual.subscriptionType
        THEN {} ELSE {P("roots", "schema")})
  \cup (IF actual.typename = RootTypeName(S, "query") THEN {} ELSE {P("typename", "")})
  \cup (IF (\A i \in DOMAIN actual.types : Len(actual.types[i].name) = 1) /\ Len(actual.types) = Cardinality(an)
        THEN {} ELSE {P("types", "")})
  \cup {P(CASE x \in BuiltinScalarNames -> "builtinScalars"
            [] x \in an -> "added:types"
            [] unreferenced(x) -> "unreferencedTypes"
            [] OTHER -> "types", x) : x \in diff}
  \cup UNION {TypeProblems(FS, TypeNamed(FS, x), ByName(expected.types, <<x>>), ByName(actual.types, <<x>>)) :
                x \in (en \cap an) \ badTypes}
  \cup {P("serviceTypes", x) : x \in badTypes}
  \cup membership
  \cup (IF membership # {} THEN {}
        ELSE OrderProblems("directives", Without(ed, builtinNames, 1, <<>>), Without(ad, builtinNames, 1, <<>>)))
  \cup {P("requiredDirective", "@" \o d) : d \in required \ returned}
  \cup {P("builtinDirectives", "@" \o d) : d \in RecommendedDirectiveNames(S0) \ (returned \cup required)}
  \cup UNION {DirectiveProblems(FS, DirectiveNamed(FS, d), ByName(ed, d), ByName(ad, d)) : d \in Common(ed, ad)}

\* What is wrong with the answer to __type(name: "__Schema"): the wrapper
\* types among its fields' types, and the fields themselves.
\* A wrapper whose only non-null field besides kind and ofType is isOneOf,
\* new in September 2025, is a "wrapperIsOneOf" problem.
WrappersProblems(B, actual) ==
  {P(IF WrapperMatches([w EXCEPT !.isOneOf = None]) THEN "wrapperIsOneOf" ELSE "wrapper", w.where) :
     w \in {x \in Range(actual.wrappers) : ~WrapperMatches(x)}}
  \cup WrapperFieldsProblems(B, actual.wrapperFields)

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
            ELSE IF /\ e # None /\ l.result = None /\ ~IsBuiltinTypeName(l.name)
                    /\ l.name \notin Referenced(S, FS)
            THEN {P("unreferencedTypes", l.name)}
            ELSE IF e = None \/ l.result = None \/ l.result[1].name # Some(l.name)
            THEN {P("typeByName", l.name)}
            ELSE TypeProblems(FS, TypeNamed(FS, l.name), e[1], l.result[1]) :
         i \in DOMAIN lookups}

\* The editions, oldest first, and each one's built-ins.
Editions == <<"October2021", "September2025", "September2026">>
EditionBuiltins(profile) ==
  CASE profile = "October2021" -> Oct2021Builtins
    [] profile = "September2025" -> Sep2025Builtins
    [] OTHER -> SpecBuiltins

\* The problems with a case for the edition's built-ins E.
CaseProblems(S, c, E) ==
  CASE c.kind = "lookup" -> LookupProblems(S, E, c.inc, c.actual, c.provided)
    [] c.kind = "wrappers" -> WrappersProblems(E, c.actual)
    [] OTHER -> Problems(S, ServiceBuiltins(E, c.extras, c.extraTypes), c.extraTypes, c.inc, c.actual)

\* The reference's verdict on a case, the problems behind it, and for an
\* answer with problems, its problems against each edition's built-ins
\* (Editions' order; none for the profile's own), as <<edition, problems>>
\* pairs.
CaseResult(S, c) ==
  LET E == EditionBuiltins(c.profile)
      problems == CaseProblems(S, c, E)
      matches ==
        CASE c.kind = "lookup" ->
               \A i \in DOMAIN c.actual :
                 TypeByNameMatches(AsProvided(S, c.provided), E, c.inc, c.actual[i].name, c.actual[i].result)
          [] c.kind = "wrappers" ->
               /\ \A i \in DOMAIN c.actual.wrappers : WrapperMatches(c.actual.wrappers[i])
               /\ SchemaFieldsMatch(E, c.actual.wrapperFields)
          [] OTHER -> Matches(S, ServiceBuiltins(E, c.extras, c.extraTypes), c.inc, TRUE, c.actual)
  IN <<problems, matches,
       IF problems = {} THEN <<>>
       ELSE [i \in DOMAIN Editions |->
               <<Editions[i], IF Editions[i] = c.profile THEN {} ELSE CaseProblems(S, c, EditionBuiltins(Editions[i]))>>]>>
====
