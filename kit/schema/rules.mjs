// The schema area's checks: one per rule in TypeSystem!Rules, by the
// section that states it. Every rule is a MUST. ENUM_VALUE_NAME_RESERVED
// rests on §4's Reserved Names paragraph, since §3.9 says nothing about
// "__".
//
// DRAFT names the rules the October 2021 edition doesn't have, and the
// feature each comes with. Their checks, vectors and findings carry
// `edition: "draft"`.

export const DRAFT = {
  REQUIRED_ARG_NOT_DEPRECATED: "deprecated arguments",
  ARG_DEFAULT_COMPATIBLE: "default value validation",
  IMPL_DEPRECATION: "deprecation of implementing fields",
  REQUIRED_INPUT_FIELD_NOT_DEPRECATED: "deprecated input fields",
  ONEOF_FIELD_NULLABLE: "OneOf input objects",
  ONEOF_FIELD_NO_DEFAULT: "OneOf input objects",
  INPUT_OBJECT_DEFAULT_VALUE_CYCLE: "default value validation",
};

export const RULES = [
  ["TYPE_NAMES_UNIQUE", "typeNamesUnique", "No two types have the same name", ["3.3"]],
  ["TYPE_NAME_NOT_BUILTIN", "typeNameNotBuiltin", "No type is named like a built-in type", ["3.3"]],
  ["TYPE_NAME_RESERVED", "typeNameReserved", "No type name begins with __", ["3.3"]],
  ["DIRECTIVE_NAMES_UNIQUE", "directiveNamesUnique", "No two directives have the same name", ["3.3"]],
  ["DIRECTIVE_NAME_RESERVED", "directiveNameReserved", "No directive name begins with __", ["3.3"]],
  ["QUERY_ROOT_PROVIDED", "queryRootProvided", "The query root operation type is provided", ["3.3.1"]],
  ["ROOT_TYPES_ARE_OBJECTS", "rootTypesAreObjects", "Root operation types are object types", ["3.3.1"]],
  ["ROOT_TYPES_DIFFERENT", "rootTypesDifferent", "Root operation types are all different", ["3.3.1"]],
  ["FIELDS_DEFINED", "fieldsDefined", "An object or interface type defines one or more fields", ["3.6", "3.7"]],
  ["FIELD_NAMES_UNIQUE", "fieldNamesUnique", "Field names are unique within a type", ["3.6", "3.7"]],
  ["FIELD_NAME_RESERVED", "fieldNameReserved", "No field name begins with __", ["3.6", "3.7"]],
  ["FIELD_OUTPUT_TYPE", "fieldOutputType", "Fields return output types", ["3.6", "3.4.2"]],
  ["ARG_NAME_RESERVED", "argNameReserved", "No argument name begins with __", ["3.6", "3.13"]],
  ["ARG_NAMES_UNIQUE", "argNamesUnique", "Argument names are unique within a field or directive", ["3.6", "3.13"]],
  ["ARG_INPUT_TYPE", "argInputType", "Arguments accept input types", ["3.6", "3.4.2"]],
  ["REQUIRED_ARG_NOT_DEPRECATED", "requiredArgNotDeprecated", "A required argument isn't deprecated", ["3.6", "3.13.3"]],
  ["ARG_DEFAULT_COMPATIBLE", "argDefaultCompatible", "An object field argument's default value coerces to its type", ["3.6"]],
  ["IMPLEMENTS_UNIQUE", "implementsUnique", "A type implements each interface once", ["3.6", "3.7"]],
  ["IMPLEMENTS_INTERFACES", "implementsInterfaces", "A type implements only interface types", ["3.6", "3.7"]],
  ["IMPLEMENTS_ITSELF", "implementsItself", "An interface doesn't implement itself", ["3.7"]],
  ["IMPL_TRANSITIVE", "implTransitive", "A type also implements the interfaces its interfaces implement", ["3.6"]],
  ["IMPL_FIELD_PROVIDED", "implFieldProvided", "An implementation has every field of the interface", ["3.6"]],
  ["IMPL_ARG_PROVIDED", "implArgProvided", "An implementation's field has every argument of the interface field", ["3.6"]],
  ["IMPL_ARG_INVARIANT", "implArgInvariant", "An implementation's field arguments have the interface's argument types", ["3.6"]],
  ["IMPL_EXTRA_ARG_OPTIONAL", "implExtraArgOptional", "An implementation's additional arguments aren't required", ["3.6"]],
  ["IMPL_FIELD_COVARIANT", "implFieldCovariant", "An implementation's field returns a subtype of the interface field's type", ["3.6"]],
  ["IMPL_DEPRECATION", "implDeprecation", "A deprecated implementation field implements a deprecated field", ["3.6"]],
  ["UNION_MEMBERS_DEFINED", "unionMembersDefined", "A union has one or more member types", ["3.8"]],
  ["UNION_MEMBERS_UNIQUE", "unionMembersUnique", "A union's member types are unique", ["3.8"]],
  ["UNION_MEMBERS_OBJECTS", "unionMembersObjects", "A union's member types are object types", ["3.8"]],
  ["ENUM_VALUES_DEFINED", "enumValuesDefined", "An enum has one or more values", ["3.9"]],
  ["ENUM_VALUES_UNIQUE", "enumValuesUnique", "An enum's values are unique", ["3.9"]],
  ["ENUM_VALUE_NAME_RESERVED", "enumValueNameReserved", "No enum value begins with __", ["4"]],
  ["INPUT_FIELDS_DEFINED", "inputFieldsDefined", "An input object has one or more fields", ["3.10"]],
  ["INPUT_FIELD_NAMES_UNIQUE", "inputFieldNamesUnique", "Input field names are unique within an input object", ["3.10"]],
  ["INPUT_FIELD_NAME_RESERVED", "inputFieldNameReserved", "No input field name begins with __", ["3.10"]],
  ["INPUT_FIELD_INPUT_TYPE", "inputFieldInputType", "Input fields accept input types", ["3.10", "3.4.2"]],
  ["REQUIRED_INPUT_FIELD_NOT_DEPRECATED", "requiredInputFieldNotDeprecated", "A required input field isn't deprecated", ["3.10", "3.13.3"]],
  ["ONEOF_FIELD_NULLABLE", "oneOfFieldNullable", "A OneOf input object's fields are nullable", ["3.10", "3.10.1"]],
  ["ONEOF_FIELD_NO_DEFAULT", "oneOfFieldNoDefault", "A OneOf input object's fields have no default value", ["3.10", "3.10.1"]],
  ["INPUT_OBJECT_UNBREAKABLE_CYCLE", "inputObjectUnbreakableCycle", "An input object can be given a finite value", ["3.10"]],
  ["INPUT_OBJECT_DEFAULT_VALUE_CYCLE", "inputObjectDefaultValueCycle", "Input object default values don't form a cycle", ["3.10"]],
  ["DIRECTIVE_LOCATIONS_DEFINED", "directiveLocationsDefined", "A directive has one or more locations", ["3.13"]],
  ["DIRECTIVE_USES_ITSELF", "directiveUsesItself", "A directive definition doesn't use itself", ["3.13"]],
  [
    "DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY",
    "directiveReferencesItselfIndirectly",
    "A directive definition doesn't reference itself through a type or directive",
    ["3.13"],
  ],
].map(([rule, id, title, spec]) => ({ rule, id, title, level: "MUST", spec, ...(DRAFT[rule] ? { edition: "draft", draft: DRAFT[rule] } : {}) }));

export const RULE = new Map(RULES.map((r) => [r.rule, r]));

// Rules no SDL document can break: the grammar requires `on` and at least
// one location.
export const UNWRITABLE = {
  DIRECTIVE_LOCATIONS_DEFINED: "SDL can't write a directive without locations, so no vector breaks this rule",
};
