// Realistic bugs in TypeSystem.tla. scripts/check.mjs checks each against
// TypeSystemVectors.tla with only `property` enabled, and
// `node scripts/differential-type-system.mjs --mutants` checks that the
// differential against graphql-js catches each one too, except those marked
// `differential: false`, for rules graphql-js doesn't check.
const file = "TypeSystem.tla";
const module = "TypeSystemVectors.tla";

const mutants = [
  {
    name: "covariance unwraps a Non-Null implemented type on its own, so a nullable field implements a Non-Null one",
    find: "  ELSE IF IsList(fieldType) /\\ IsList(implementedFieldType)",
    replace:
      "  ELSE IF IsNonNull(implementedFieldType)\n  THEN IsValidImplementationFieldType(S, fieldType, OfType(implementedFieldType))\n  ELSE IF IsList(fieldType) /\\ IsList(implementedFieldType)",
    property: "ImplementationsAreChecked",
  },
  {
    name: "covariance compares named types, so [Int] implements Int",
    find: "  ELSE IsSubType(S, fieldType, implementedFieldType)",
    replace: "  ELSE IsSubType(S, Unwrapped(fieldType), Unwrapped(implementedFieldType))",
    property: "ImplementationsAreChecked",
  },
  {
    name: "IsSubType forgets that an interface can implement an interface",
    find: 'subDef.kind \\in {"OBJECT", "INTERFACE"} /\\ superDef.kind = "INTERFACE"',
    replace: 'subDef.kind = "OBJECT" /\\ superDef.kind = "INTERFACE"',
    property: "ImplementationsAreChecked",
  },
  {
    name: "argument invariance compares named types, so Int! implements Int",
    find: "ArgNamed(p.field.args, p.implemented.args[k].name).type = p.implemented.args[k].type",
    replace: "ArgNamed(p.field.args, p.implemented.args[k].name).type.name = p.implemented.args[k].type.name",
    property: "ImplementationsAreChecked",
  },
  {
    name: "an additional argument with a default counts as required when it is Non-Null",
    find: "~HasArg(p.implemented.args, p.field.args[k].name) => ~IsRequired(p.field.args[k])",
    replace: "~HasArg(p.implemented.args, p.field.args[k].name) => ~IsNonNull(p.field.args[k].type)",
    property: "ImplementationsAreChecked",
  },
  {
    name: "the transitive step only checks that the inherited interfaces exist",
    find: "\\A k \\in DOMAIN I.interfaces : I.interfaces[k] \\in Range(T.interfaces)",
    replace: '\\A k \\in DOMAIN I.interfaces : TypeNamed(S, I.interfaces[k]).kind = "INTERFACE"',
    property: "InterfacesHaveNoCycles",
  },
  {
    name: "a OneOf input object is uninhabitable when any field, rather than every field, leads into a cycle",
    find: "            \\A k \\in DOMAIN fields :\n              InputFieldTypeHasUnbreakableCycle",
    replace: "            \\E k \\in DOMAIN fields :\n              InputFieldTypeHasUnbreakableCycle",
    property: "UnbreakableCyclesAreFound",
  },
  {
    name: "a list doesn't break an input object cycle",
    find: "  IF IsList(type) THEN FALSE",
    replace: "  IF IsList(type) THEN InputFieldTypeHasUnbreakableCycle(S, OfType(type), visited)",
    property: "UnbreakableCyclesAreFound",
  },
  {
    name: "September 2025's verdict uses September 2026's OneOf inhabitability rule",
    find: '  (Verdict(S) \\ {"INPUT_OBJECT_UNBREAKABLE_CYCLE"}) \\cup CycleRuleSeptember2025(S)',
    replace: "  Verdict(S)",
    property: "UnbreakableCyclesAreFound",
    differential: false,
    why: "the differential compares graphql-js with Verdict, which doesn't use September 2025's cycle rule",
  },
  {
    name: "under September 2025 a list doesn't break a chain of Non-Null fields",
    find: "              /\\ ~IsList(OfType(T.inputFields[k].type))\n",
    replace: "",
    property: "UnbreakableCyclesAreFound",
    differential: false,
    why: "the differential compares graphql-js with Verdict, which doesn't use September 2025's cycle rule",
  },
  {
    name: "under September 2025 only an input object that references itself directly is in a chain",
    find: "       NonNullChainReach(S, next, seen \\cup next)",
    replace: "       seen",
    property: "UnbreakableCyclesAreFound",
    differential: false,
    why: "the differential compares graphql-js with Verdict, which doesn't use September 2025's cycle rule",
  },
  {
    name: "the default value cycle check stops at a value provided for a field",
    find: "  THEN InputObjectDefaultValueHasCycle(S, named.name, Entry(defaultValue, field.name).value, visitedFields)",
    replace: "  THEN FALSE",
    property: "DefaultValueCyclesAreFound",
  },
  {
    name: "a Non-Null input field with a default can't be deprecated",
    find: "    IsRequired(T.inputFields[k]) => ~IsDeprecated(T.inputFields[k])",
    replace: "    IsNonNull(T.inputFields[k].type) => ~IsDeprecated(T.inputFields[k])",
    property: "InputObjectRulesHold",
  },
  {
    name: "only object fields' arguments are checked, not interface fields'",
    find: 'ObjectLike(S) == {k \\in DOMAIN S.types : S.types[k].kind \\in {"OBJECT", "INTERFACE"}}',
    replace: 'ObjectLike(S) == {k \\in DOMAIN S.types : S.types[k].kind = "OBJECT"}',
    property: "ArgumentRulesHold",
  },
  {
    name: "only __typename is a reserved field name",
    find: "  \\A i \\in DOMAIN T.fields : ~StartsWithTwoUnderscores(T.fields[i].name)",
    replace: '  \\A i \\in DOMAIN T.fields : T.fields[i].name # "__typename"',
    property: "ObjectRulesHold",
  },
  {
    name: "an Int literal isn't coerced to Float",
    find: 'IF v.kind \\in {"int", "float"} /\\ IsFiniteNumber(v)',
    replace: 'IF v.kind = "float" /\\ IsFiniteNumber(v)',
    property: "DefaultValuesCoerce",
  },
  {
    name: "a Float literal too large for a double is accepted",
    find: 'IF v.kind \\in {"int", "float"} /\\ IsFiniteNumber(v)',
    replace: 'IF v.kind \\in {"int", "float"}',
    property: "DefaultValuesCoerce",
    differential: false,
    why: "graphql-js accepts `= 1e400` for a Float, and the differential's schemas don't write one",
  },
  {
    name: "every level of list nesting spends fuel, so a deeply nested default doesn't coerce",
    find: "       THEN CoerceItems(S, OfType(type), v.items, 1, <<>>, fill, fuel)",
    replace: "       THEN IF fuel = 0 THEN Fail ELSE CoerceItems(S, OfType(type), v.items, 1, <<>>, fill, fuel - 1)",
    property: "DefaultValuesCoerce",
    differential: false,
    why: "the differential's default values are never nested deeper than a few levels",
  },
  {
    name: "an enum accepts a string literal of one of its values",
    find: 'IF v.kind = "enum" /\\ v.text \\in Range(NamesOf(def.values))',
    replace: 'IF v.kind \\in {"enum", "string"} /\\ v.text \\in Range(NamesOf(def.values))',
    property: "DefaultValuesCoerce",
  },
  {
    name: "a union may have interface members",
    find: '\\A k \\in DOMAIN T.members : TypeNamed(S, T.members[k]).kind = "OBJECT"',
    replace: '\\A k \\in DOMAIN T.members : TypeNamed(S, T.members[k]).kind \\in {"OBJECT", "INTERFACE"}',
    property: "UnionAndEnumRulesHold",
  },
  {
    name: "the default root names apply even with a schema definition",
    find: "       IF is = {} THEN <<>>",
    replace:
      "       IF is = {} THEN (IF DefaultRootTypeName(operation) \\in Range(AllNames(S))\n                        THEN <<DefaultRootTypeName(operation)>> ELSE <<>>)",
    property: "RootTypesAreChecked",
  },
  {
    name: "a single leading underscore counts as reserved",
    find: '  Len(name) >= 2 /\\ SubSeq(name, 1, 2) = "__"',
    replace: '  Len(name) >= 1 /\\ SubSeq(name, 1, 1) = "_"',
    property: "NamesAreChecked",
  },
  {
    name: "a type may be named like a built-in scalar",
    find: "    S.types[i].name \\notin BuiltinScalarNames \\cup IntrospectionTypeNames",
    replace: "    S.types[i].name \\notin IntrospectionTypeNames",
    property: "NamesAreChecked",
    differential: false,
    why: "graphql-js accepts `scalar String`, so the differential doesn't check TYPE_NAME_NOT_BUILTIN",
  },
  {
    name: "a directive's indirect references don't go through its argument types",
    find: '{<<"directive", d>> : d \\in D.directives} \\cup {<<"type", t>> : t \\in ArgTypeNames(D.args)}',
    replace: '{<<"directive", d>> : d \\in D.directives}',
    property: "DirectiveRulesHold",
    differential: false,
    why: "graphql-js doesn't check that a directive references itself",
  },
  {
    name: "a document may have any number of schema definitions",
    find: "HasAtMostOneSchemaDefinition(S) == SchemaDefinitionCount(S) <= 1",
    replace: "HasAtMostOneSchemaDefinition(S) == TRUE",
    property: "RootTypesAreChecked",
    differential: false,
    why: "the differential's schema data has no count of schema definitions, and its documents have one at most",
  },
  {
    name: "IsOutputType accepts any type that isn't an input object, one the document doesn't define included",
    find: '  KindOf(S, Unwrapped(type)) \\in {"SCALAR", "OBJECT", "INTERFACE", "UNION", "ENUM"}',
    replace: '  KindOf(S, Unwrapped(type)) # "INPUT_OBJECT"',
    property: "UndefinedTypesAreChecked",
    differential: false,
    why: "the differential's schemas only refer to types they define",
  },
  {
    name: "built-in directives count as undefined unless the document defines them",
    find: "  DefinesDirective(S, name) \\/ name \\in DOMAIN BuiltinDirectiveLocations",
    replace: "  DefinesDirective(S, name)",
    property: "DirectiveUsesAreChecked",
    differential: false,
    why: "the differential's schema data doesn't record where directives are applied",
  },
  {
    name: "a defined directive may be applied anywhere",
    find: "    IsKnownDirective(S, use.name) => use.location \\in DeclaredLocations(S, use.name)",
    replace: "    TRUE",
    property: "DirectiveUsesAreChecked",
    differential: false,
    why: "the differential's schema data doesn't record where directives are applied",
  },
];

export default mutants.map((m) => ({ file, module, ...m }));
