// The schema area's checks: one per rule in TypeSystem!Rules, by the
// sections that state it, with the sentences it rests on (`basis`, quoted
// from September 2026, the edition graded). Every rule is a MUST, in every
// release that has it, but two INFO checks for what §3 doesn't state about
// directives applied in SDL (DIRECTIVE_NOT_REPEATED,
// APPLIED_DIRECTIVE_ARGUMENTS). ENUM_VALUE_NAME_RESERVED rests on §4's
// Reserved Names paragraph, since §3.9 says nothing about "__".
//
// SINCE names the rules October 2021 doesn't have, the release that
// introduced each (graphql-spec PR in the comment), and the feature it
// comes with. Their checks carry `since`, and so do the invalid vectors
// that break them. Every one is in September 2025 with the same wording as
// in September 2026. One rule changed between those two:
// INPUT_OBJECT_UNBREAKABLE_CYCLE, whose September 2026 form also finds
// OneOf input objects no finite value inhabits (TypeSystem.tla,
// VerdictSeptember2025); the generator tags the vectors that rest on it.

export const SINCE = {
  ARG_NAMES_UNIQUE: { since: "September2025", feature: "argument name uniqueness" }, // #891
  REQUIRED_ARG_NOT_DEPRECATED: { since: "September2025", feature: "deprecated arguments" }, // #805
  ARG_DEFAULT_COMPATIBLE: { since: "September2025", feature: "default value validation" }, // #793
  IMPL_DEPRECATION: { since: "September2025", feature: "deprecation of implementing fields" }, // #1053
  REQUIRED_INPUT_FIELD_NOT_DEPRECATED: { since: "September2025", feature: "deprecated input fields" }, // #805
  ONEOF_FIELD_NULLABLE: { since: "September2025", feature: "OneOf input objects" }, // #825
  ONEOF_FIELD_NO_DEFAULT: { since: "September2025", feature: "OneOf input objects" }, // #825
  INPUT_OBJECT_DEFAULT_VALUE_CYCLE: { since: "September2025", feature: "default value validation" }, // #793
  DIRECTIVE_LOCATIONS_DEFINED: { since: "September2025", feature: "the rule that a directive definition includes a location" },
  EXTENSION_ONEOF: { since: "September2025", feature: "OneOf input objects" }, // #825
  DIRECTIVE_EXTENSION_DEFINED: { since: "September2026", feature: "directive extensions" }, // #1206
  DIRECTIVE_EXTENSION_NOT_REAPPLIED: { since: "September2026", feature: "directive extensions" },
  DIRECTIVE_EXTENSION_USES_PREVIOUS: { since: "September2026", feature: "directive extensions" },
  DIRECTIVE_EXTENSION_REFERENCES_PREVIOUS: { since: "September2026", feature: "directive extensions" },
};

// The capability an adapter claims when its implementation can build a
// schema from a document with type system extensions (§3.1), applied in
// document order to the definitions. Vectors with extensions are asked
// only of such adapters (docs/kit/schema.md, "Request").
export const SCHEMA_EXTENSIONS = "schema-extensions";

// Releases as the kit writes them, and as prose.
export const RELEASES = ["September2025", "September2026"];
export const releaseName = (release) => release.replace(/^([A-Za-z]+)(\d+)$/, "$1 $2");

// Sentences several rules share.
const OBJECT_AND_INTERFACE = (rule) => `§3.6 Type Validation (and the same item of §3.7 for interfaces): "${rule}"`;
const IMPLEMENTATION = (step) =>
  `§3.6 IsValidImplementation(type, implementedType), applied by "For each interface declared implemented as interfaceType, IsValidImplementation(objectType, interfaceType) must be true" (§3.6) and "IsValidImplementation(implementingType, implementedType) must be true" (§3.7): "${step}"`;
// The extension sections, by kind of type: [section, the type's article and
// name in the rules].
const EXTENSION_SECTIONS = ["3.5.6", "3.6.3", "3.7.1", "3.8.1", "3.9.1", "3.10.2"];
const NOT_IN_SECTION_3 =
  "§3 states no such rule for SDL: this check is informational, and never fails a run. It records whether an implementation rejects such a schema.";
const DIRECTIVE_USE =
  '§3.13: "Directives must only be used in the locations they are declared to belong in." The same sentence is in October 2021.';

// [rule, id, title, sections, basis]
export const RULES = [
  [
    "TYPE_NAMES_UNIQUE",
    "typeNamesUnique",
    "No two types have the same name",
    ["3.3"],
    '§3.3: "All types within a GraphQL schema must have unique names. No two provided types may have the same name."',
  ],
  [
    "TYPE_NAME_NOT_BUILTIN",
    "typeNameNotBuiltin",
    "No type is named like a built-in type",
    ["3.3"],
    '§3.3: "No provided type may have a name which conflicts with any built in types (including Scalar and Introspection types)."',
  ],
  [
    "TYPE_NAME_RESERVED",
    "typeNameReserved",
    "No type name begins with __",
    ["3.3"],
    '§3.3: "All types and directives defined within a schema must not have a name which begins with "__" (two underscores)"',
  ],
  [
    "DIRECTIVE_NAMES_UNIQUE",
    "directiveNamesUnique",
    "No two directives have the same name",
    ["3.3"],
    '§3.3: "All directives within a GraphQL schema must have unique names."',
  ],
  [
    "DIRECTIVE_NAME_RESERVED",
    "directiveNameReserved",
    "No directive name begins with __",
    ["3.3", "3.13"],
    '§3.3: "All types and directives defined within a schema must not have a name which begins with "__" (two underscores)", and §3.13 Type Validation: "The Directive must not have a name which begins with the characters "__" (two underscores)."',
  ],
  [
    "SCHEMA_DEFINITION_UNIQUE",
    "schemaDefinitionUnique",
    "A document has at most one schema definition",
    ["3.3"],
    '§3.3: "When using the type system definition language, a document must include at most one schema definition." The same sentence is in October 2021.',
  ],
  [
    "QUERY_ROOT_PROVIDED",
    "queryRootProvided",
    "The query root operation type is provided",
    ["3.3.1"],
    '§3.3.1: "The query root operation type must be provided and must be an Object type."',
  ],
  [
    "ROOT_TYPES_ARE_OBJECTS",
    "rootTypesAreObjects",
    "Root operation types are object types",
    ["3.3.1"],
    '§3.3.1: "The query root operation type must be provided and must be an Object type." For mutation: "If it is provided, it must be an Object type", and "Similarly" for subscription. A root operation type the document names but doesn\'t define isn\'t an Object type.',
  ],
  [
    "ROOT_TYPES_DIFFERENT",
    "rootTypesDifferent",
    "Root operation types are all different",
    ["3.3.1"],
    '§3.3.1: "The query, mutation, and subscription root types must all be different types if provided."',
  ],
  [
    "FIELDS_DEFINED",
    "fieldsDefined",
    "An object or interface type defines one or more fields",
    ["3.6", "3.7"],
    '§3.6 Type Validation: "An Object type must define one or more fields." §3.7: "An Interface type must define one or more fields."',
  ],
  [
    "FIELD_NAMES_UNIQUE",
    "fieldNamesUnique",
    "Field names are unique within a type",
    ["3.6", "3.7"],
    OBJECT_AND_INTERFACE("The field must have a unique name within that Object type; no two fields may share the same name."),
  ],
  [
    "FIELD_NAME_RESERVED",
    "fieldNameReserved",
    "No field name begins with __",
    ["3.6", "3.7"],
    OBJECT_AND_INTERFACE('The field must not have a name which begins with the characters "__" (two underscores).'),
  ],
  [
    "FIELD_OUTPUT_TYPE",
    "fieldOutputType",
    "Fields return output types",
    ["3.6", "3.7", "3.4.2"],
    `${OBJECT_AND_INTERFACE("The field must return a type where IsOutputType(fieldType) returns true.")} §3.4.2's IsOutputType returns true only for a Scalar, Object, Interface, Union or Enum type, and otherwise "Return false", so a type the document doesn't define fails it too.`,
  ],
  [
    "ARG_NAME_RESERVED",
    "argNameReserved",
    "No argument name begins with __",
    ["3.6", "3.7", "3.13"],
    '§3.6, §3.7 and §3.13 Type Validation, for each argument of a field or directive: "The argument must not have a name which begins with the characters "__" (two underscores)."',
  ],
  [
    "ARG_NAMES_UNIQUE",
    "argNamesUnique",
    "Argument names are unique within a field or directive",
    ["3.6", "3.7", "3.13"],
    '§3.6 and §3.7 Type Validation: "The argument must have a unique name within that field; no two arguments may share the same name." §3.13: "The argument must have a unique name within that Directive; no two arguments may share the same name." September 2025 has both sentences; October 2021\'s lists have neither.',
  ],
  [
    "ARG_INPUT_TYPE",
    "argInputType",
    "Arguments accept input types",
    ["3.6", "3.7", "3.13", "3.4.2"],
    '§3.6, §3.7 and §3.13 Type Validation, for each argument of a field or directive: "The argument must accept a type where IsInputType(argumentType) returns true." §3.4.2\'s IsInputType returns true only for a Scalar, Enum or Input Object type, and otherwise "Return false", so a type the document doesn\'t define fails it too.',
  ],
  [
    "REQUIRED_ARG_NOT_DEPRECATED",
    "requiredArgNotDeprecated",
    "A required argument isn't deprecated",
    ["3.6", "3.13.3"],
    '§3.6 Type Validation: "If argument type is Non-Null and a default value is not defined: The @deprecated directive must not be applied to this argument." §3.13.3 states it for every argument, interface and directive arguments included: "The @deprecated directive must not appear on required (non-null without a default) arguments or input object field definitions."',
  ],
  [
    "ARG_DEFAULT_COMPATIBLE",
    "argDefaultCompatible",
    "An object field argument's default value coerces to its type",
    ["3.6", "3.5", "3.9", "3.10", "3.10.1", "3.11", "3.12"],
    '§3.6 Type Validation: "If the argument has a default value it must be compatible with argumentType as per the coercion rules for that type." The coercion rules are each type\'s Input Coercion: §3.5 ("If an input value does not match a coercion rule, a request error must be raised"), §3.9, §3.10 ("must not contain any entries with names not defined by a field of this input object type, otherwise a request error must be raised"), §3.10.1 ("must contain exactly one entry and that entry must not be null"), §3.11 and §3.12. A required input field the default leaves out is incompatible by §3.12: "If an argument or input-object field of a Non-Null type is not provided, is provided with the literal value null, ... then a request error must be raised." (§3.10\'s own sentence for that case says only "an error should be raised".)',
  ],
  [
    "IMPLEMENTS_UNIQUE",
    "implementsUnique",
    "A type implements each interface once",
    ["3.6", "3.7"],
    '§3.6 Type Validation, a list "This set of rules must be adhered to by every Object type": "An object type may declare that it implements one or more unique interfaces." §3.7: "An interface type may declare that it implements one or more unique interfaces, but may not implement itself."',
  ],
  [
    "IMPLEMENTS_INTERFACES",
    "implementsInterfaces",
    "A type implements only interface types",
    ["3.6", "3.7"],
    '§3.6 Type Validation: "An object type may declare that it implements one or more unique interfaces" and "For each interface declared implemented as interfaceType, IsValidImplementation(objectType, interfaceType) must be true"; §3.7 says the same of interfaces. A type that isn\'t an interface, or isn\'t defined, can\'t be implemented.',
  ],
  [
    "IMPLEMENTS_ITSELF",
    "implementsItself",
    "An interface doesn't implement itself",
    ["3.7"],
    '§3.7 Type Validation: "An interface type may declare that it implements one or more unique interfaces, but may not implement itself." The prose: "Interface definitions must not contain cyclic references nor implement themselves."',
  ],
  [
    "IMPL_TRANSITIVE",
    "implTransitive",
    "A type also implements the interfaces its interfaces implement",
    ["3.6", "3.7"],
    `${IMPLEMENTATION("If implementedType declares it implements any interfaces, type must also declare it implements those interfaces.")} A cycle of interfaces breaks it, and §3.7's "Interface definitions must not contain cyclic references nor implement themselves".`,
  ],
  [
    "IMPL_FIELD_PROVIDED",
    "implFieldProvided",
    "An implementation has every field of the interface",
    ["3.6", "3.7", "3.6.3", "3.7.1"],
    `${IMPLEMENTATION("type must include a field of the same name for every field defined in implementedType.")} For extended types (tagged \`schema-extensions\`): §3.6.3, "The resulting extended object type must be a super-set of all interfaces it implements", and §3.7.1, "Any Object or Interface type which implemented the previous Interface type must also be a super-set of the fields of the Interface type extension (which may be due to Object type extension)."`,
  ],
  [
    "IMPL_ARG_PROVIDED",
    "implArgProvided",
    "An implementation's field has every argument of the interface field",
    ["3.6", "3.7"],
    IMPLEMENTATION("field must include an argument of the same name for every argument defined in implementedField."),
  ],
  [
    "IMPL_ARG_INVARIANT",
    "implArgInvariant",
    "An implementation's field arguments have the interface's argument types",
    ["3.6", "3.7"],
    IMPLEMENTATION("That named argument on field must accept the same type (invariant) as that named argument on implementedField."),
  ],
  [
    "IMPL_EXTRA_ARG_OPTIONAL",
    "implExtraArgOptional",
    "An implementation's additional arguments aren't required",
    ["3.6", "3.7"],
    IMPLEMENTATION("field may include additional arguments not defined in implementedField, but any additional argument must not be required, e.g. must not be of a non-nullable type."),
  ],
  [
    "IMPL_FIELD_COVARIANT",
    "implFieldCovariant",
    "An implementation's field returns a subtype of the interface field's type",
    ["3.6", "3.7"],
    IMPLEMENTATION("field must return a type which is equal to or a sub-type of (covariant) the return type of implementedField field's return type"),
  ],
  [
    "IMPL_DEPRECATION",
    "implDeprecation",
    "A deprecated implementation field implements a deprecated field",
    ["3.6", "3.7"],
    IMPLEMENTATION("If field is deprecated then implementedField must also be deprecated."),
  ],
  [
    "UNION_MEMBERS_DEFINED",
    "unionMembersDefined",
    "A union has one or more member types",
    ["3.8"],
    '§3.8 Type Validation: "A Union type must include one or more unique member types."',
  ],
  [
    "UNION_MEMBERS_UNIQUE",
    "unionMembersUnique",
    "A union's member types are unique",
    ["3.8"],
    '§3.8 Type Validation: "A Union type must include one or more unique member types."',
  ],
  [
    "UNION_MEMBERS_OBJECTS",
    "unionMembersObjects",
    "A union's member types are object types",
    ["3.8", "3.8.1"],
    '§3.8 Type Validation: "The member types of a Union type must all be Object base types; Scalar, Interface and Union types must not be member types of a Union." A member the document doesn\'t define isn\'t an Object type. §3.8.1 says the same of a union type extension\'s member types: "The member types of a Union type extension must all be Object base types".',
  ],
  [
    "ENUM_VALUES_DEFINED",
    "enumValuesDefined",
    "An enum has one or more values",
    ["3.9"],
    '§3.9 Type Validation: "An Enum type must define one or more unique enum values."',
  ],
  [
    "ENUM_VALUES_UNIQUE",
    "enumValuesUnique",
    "An enum's values are unique",
    ["3.9"],
    '§3.9 Type Validation: "An Enum type must define one or more unique enum values."',
  ],
  [
    "ENUM_VALUE_NAME_RESERVED",
    "enumValueNameReserved",
    "No enum value begins with __",
    ["4"],
    '§4 Reserved Names: "Otherwise, any Name within a GraphQL type system must not start with two underscores "__"." §3.9 has no rule of its own about "__".',
  ],
  [
    "INPUT_FIELDS_DEFINED",
    "inputFieldsDefined",
    "An input object has one or more fields",
    ["3.10"],
    '§3.10 Type Validation: "An Input Object type must define one or more input fields."',
  ],
  [
    "INPUT_FIELD_NAMES_UNIQUE",
    "inputFieldNamesUnique",
    "Input field names are unique within an input object",
    ["3.10"],
    '§3.10 Type Validation: "The input field must have a unique name within that Input Object type; no two input fields may share the same name."',
  ],
  [
    "INPUT_FIELD_NAME_RESERVED",
    "inputFieldNameReserved",
    "No input field name begins with __",
    ["3.10"],
    '§3.10 Type Validation: "The input field must not have a name which begins with the characters "__" (two underscores)."',
  ],
  [
    "INPUT_FIELD_INPUT_TYPE",
    "inputFieldInputType",
    "Input fields accept input types",
    ["3.10", "3.4.2"],
    '§3.10 Type Validation: "The input field must accept a type where IsInputType(inputFieldType) returns true."',
  ],
  [
    "REQUIRED_INPUT_FIELD_NOT_DEPRECATED",
    "requiredInputFieldNotDeprecated",
    "A required input field isn't deprecated",
    ["3.10", "3.13.3"],
    '§3.10 Type Validation: "If input field type is Non-Null and a default value is not defined: The @deprecated directive must not be applied to this input field." §3.13.3: "The @deprecated directive must not appear on required (non-null without a default) arguments or input object field definitions."',
  ],
  [
    "ONEOF_FIELD_NULLABLE",
    "oneOfFieldNullable",
    "A OneOf input object's fields are nullable",
    ["3.10", "3.10.1", "3.10.2"],
    '§3.10 Type Validation: "If the Input Object is a OneOf Input Object then: The type of the input field must be nullable." §3.10.2, for an extension: "If the original Input Object is a OneOf Input Object then: All fields of the Input Object type extension must be nullable."',
  ],
  [
    "ONEOF_FIELD_NO_DEFAULT",
    "oneOfFieldNoDefault",
    "A OneOf input object's fields have no default value",
    ["3.10", "3.10.1", "3.10.2"],
    '§3.10 Type Validation: "If the Input Object is a OneOf Input Object then: ... The input field must not have a default value." §3.10.2, for an extension: "If the original Input Object is a OneOf Input Object then: ... All fields of the Input Object type extension must not have default values."',
  ],
  [
    "INPUT_OBJECT_UNBREAKABLE_CYCLE",
    "inputObjectUnbreakableCycle",
    "An input object can be given a finite value",
    ["3.10"],
    '§3.10 Type Validation: "InputObjectHasUnbreakableCycle(inputObject) must be false." September 2025 and October 2021 have, as item 3: "If an Input Object references itself either directly or through referenced Input Objects, at least one of the fields in the chain of references must be either a nullable or a List type." The two agree on plain input objects. Only September 2026\'s form (graphql-spec #1211) finds a cycle through OneOf input objects, whose fields are nullable, such as `input A @oneOf { b: B } input B @oneOf { a: A }`; the vectors whose verdict rests on it are tagged since September 2026.',
  ],
  [
    "INPUT_OBJECT_DEFAULT_VALUE_CYCLE",
    "inputObjectDefaultValueCycle",
    "Input object default values don't form a cycle",
    ["3.10"],
    '§3.10 Type Validation: "InputObjectDefaultValueHasCycle(inputObject) must be false."',
  ],
  [
    "DIRECTIVE_LOCATIONS_DEFINED",
    "directiveLocationsDefined",
    "A directive has one or more locations",
    ["3.13"],
    '§3.13 Type Validation: "A Directive definition must include at least one DirectiveLocation." September 2025 has the same item; October 2021\'s list has no such item.',
  ],
  [
    "DIRECTIVE_USES_ITSELF",
    "directiveUsesItself",
    "A directive definition doesn't use itself",
    ["3.13"],
    '§3.13 Type Validation: "A Directive definition must not contain the use of a Directive which references itself directly."',
  ],
  [
    "DIRECTIVE_REFERENCES_ITSELF_INDIRECTLY",
    "directiveReferencesItselfIndirectly",
    "A directive definition doesn't reference itself through a type or directive",
    ["3.13"],
    '§3.13 Type Validation: "A Directive definition must not contain the use of a Directive which references itself indirectly by referencing a Type or Directive which transitively includes a reference to this Directive." The vectors that rest only on the prose, "While defining a directive, it must not reference itself directly or indirectly", aren\'t graded.',
  ],
  [
    "DIRECTIVES_DEFINED",
    "directivesDefined",
    "Every directive the document applies is defined, or built in",
    ["3.13"],
    `${DIRECTIVE_USE} A directive that is neither built in nor defined isn't declared to belong in any location. A service "may provide any additional custom directive", so the vectors use a name no service is likely to provide.`,
  ],
  [
    "DIRECTIVE_LOCATIONS_VALID",
    "directiveLocationsValid",
    "Every directive the document applies is at a location it is declared for",
    ["3.13"],
    `${DIRECTIVE_USE} The built-in directives' locations are September 2026's (§3.13.1 to §3.13.5). @deprecated goes on arguments and input fields since September 2025, and on directive definitions since September 2026; a vector that applies it there is tagged with that release.`,
  ],
  [
    "EXTENSION_TARGET_DEFINED",
    "extensionTargetDefined",
    "A type extension extends a type that is defined",
    EXTENSION_SECTIONS,
    'Each kind of type extension\'s Type Validation, item 1: "The named type must already be defined and must be a Scalar type" (§3.5.6), "... an Object type" (§3.6.3), "... an Interface type" (§3.7.1), "... a Union type" (§3.8.1), "... an Enum type" (§3.9.1), "... a Input Object type" (§3.10.2).',
  ],
  [
    "EXTENSION_TARGET_KIND",
    "extensionTargetKind",
    "A type extension extends a type of its own kind",
    EXTENSION_SECTIONS,
    'Each kind of type extension\'s Type Validation, item 1: "The named type must already be defined and must be a Scalar type" (§3.5.6), "... an Object type" (§3.6.3), "... an Interface type" (§3.7.1), "... a Union type" (§3.8.1), "... an Enum type" (§3.9.1), "... a Input Object type" (§3.10.2).',
  ],
  [
    "EXTENSION_ITEMS_UNIQUE",
    "extensionItemsUnique",
    "A type extension's fields, values or member types are unique",
    ["3.6.3", "3.7.1", "3.8.1", "3.9.1", "3.10.2"],
    '§3.6.3: "The fields of an Object type extension must have unique names; no two fields may share the same name." §3.7.1 says the same of an Interface type extension. §3.8.1: "All member types of a Union type extension must be unique." §3.9.1: "All values of an Enum type extension must be unique." §3.10.2: "All fields of an Input Object type extension must have unique names."',
  ],
  [
    "EXTENSION_ITEMS_NEW",
    "extensionItemsNew",
    "A type extension adds only fields, values or member types the type doesn't have",
    ["3.6.3", "3.7.1", "3.8.1", "3.9.1", "3.10.2"],
    '§3.6.3: "Any fields of an Object type extension must not be already defined on the previous Object type." §3.7.1 says the same of an Interface type extension. §3.8.1: "All member types of a Union type extension must not already be a member of the previous Union type." §3.9.1: "All values of an Enum type extension must not already be a value of the previous Enum." §3.10.2: "All fields of an Input Object type extension must not already be a field of the previous Input Object." The previous type is the type as extended so far. October 2021 says "the original" type instead of "the previous" one; a vector whose item an earlier extension adds is tagged since September 2025.',
  ],
  [
    "EXTENSION_INTERFACES_NEW",
    "extensionInterfacesNew",
    "An object type extension adds only interfaces the type doesn't implement",
    ["3.6.3"],
    '§3.6.3: "Any interfaces provided must not be already implemented by the previous Object type." §3.7.1 has no such rule for interface type extensions.',
  ],
  [
    "EXTENSION_DIRECTIVES_NOT_REAPPLIED",
    "extensionDirectivesNotReapplied",
    "An extension doesn't apply a non-repeatable directive again",
    ["3.3.2", ...EXTENSION_SECTIONS],
    'Every kind of extension\'s Type Validation: "Any non-repeatable directives provided must not already apply to the previous Schema" (§3.3.2), "... the previous Scalar type" (§3.5.6), "... the previous Object type" (§3.6.3), "... the previous Interface type" (§3.7.1), "... the previous Union type" (§3.8.1), "... the previous Enum type" (§3.9.1), "... the previous Input Object type" (§3.10.2). A directive applied by the definition or by an earlier extension already applies. October 2021 says "the original" instead of "the previous"; a vector whose directive only an earlier extension applies is tagged since September 2025.',
  ],
  [
    "EXTENSION_ONEOF",
    "extensionOneOf",
    "An input object type extension doesn't apply @oneOf",
    ["3.10.2", "3.10.1"],
    '§3.10.2: "The @oneOf directive must not be provided by an Input Object type extension."',
  ],
  [
    "SCHEMA_EXTENSION_DEFINED",
    "schemaExtensionDefined",
    "A schema extension extends a schema",
    ["3.3.2"],
    '§3.3.2 Schema Validation: "The Schema must already be defined." Whether a document with no schema definition, whose root operation types have the default names, has a schema that is "already defined", the spec doesn\'t say, so no vector is graded.',
  ],
  [
    "SPECIFIED_BY_NOT_BUILTIN",
    "specifiedByNotBuiltin",
    "@specifiedBy isn't applied to a built-in scalar",
    ["3.13.4", "3.5", "3.5.6"],
    '§3.13.4: "It must not appear on built-in scalar types." §3.5: "Built-in scalar types must not provide a scalar specification URL as they are specified by this document." A document can apply it to one only through a scalar type extension, `extend scalar Int @specifiedBy(url: "…")`. The spec doesn\'t say whether a built-in scalar may be extended at all (§3.5.6, "The named type must already be defined"); either way the schema is invalid, so an implementation that rejects every extension of a built-in scalar passes this check without checking @specifiedBy.',
  ],
  [
    "DIRECTIVE_EXTENSION_DEFINED",
    "directiveExtensionDefined",
    "A directive extension extends a defined directive",
    ["3.13.6"],
    '§3.13.6 Type Validation: "The previous directive must already be defined." New in September 2026, with directive extensions.',
  ],
  [
    "DIRECTIVE_EXTENSION_NOT_REAPPLIED",
    "directiveExtensionNotReapplied",
    "A directive extension doesn't apply a non-repeatable directive again",
    ["3.13.6"],
    '§3.13.6 Type Validation: "Any non-repeatable directives provided must not already apply to the previous directive."',
  ],
  [
    "DIRECTIVE_EXTENSION_USES_PREVIOUS",
    "directiveExtensionUsesPrevious",
    "A directive extension doesn't apply the directive it extends",
    ["3.13.6"],
    '§3.13.6 Type Validation: "Any directives provided must not contain the use of a Directive which references the previous directive directly."',
  ],
  [
    "DIRECTIVE_EXTENSION_REFERENCES_PREVIOUS",
    "directiveExtensionReferencesPrevious",
    "A directive extension doesn't reference the directive it extends through a type or directive",
    ["3.13.6"],
    '§3.13.6 Type Validation: "Any directives provided must not contain the use of a Directive which references the previous directive indirectly by referencing a Type or Directive which transitively includes a reference to the previous Directive."',
  ],
  [
    "DIRECTIVE_NOT_REPEATED",
    "directiveNotRepeated",
    "A definition doesn't apply a non-repeatable directive twice to one element",
    ["3.13", "5.7.3"],
    `§3.13: "A directive may be defined as repeatable by including the "repeatable" keyword. Repeatable directives are often useful when the same directive should be used with different arguments at a single location". §3 states the rule against applying a non-repeatable directive again only for extensions ("must not already apply to the previous ..."), and §5.7.3 Directives Are Unique per Location only for executable documents ("if a directive is not repeatable, then only one occurrence of it is allowed per location"). ${NOT_IN_SECTION_3}`,
    "INFO",
  ],
  [
    "APPLIED_DIRECTIVE_ARGUMENTS",
    "appliedDirectiveArguments",
    "A directive applied in SDL has the arguments its definition gives it",
    ["3.13", "2.13", "5.4"],
    `§3.13 defines a directive's arguments, such as \`directive @specifiedBy(url: String!) on SCALAR\` (§3.13.4), and §2.13 says "Directives have a name along with a list of arguments which may accept values of any input type". The rules that an argument is defined, given once, given when required, and of its type are §5.4's, which apply to executable documents. ${NOT_IN_SECTION_3}`,
    "INFO",
  ],
].map(([rule, id, title, spec, basis, level = "MUST"]) => ({
  rule,
  id,
  title,
  level,
  spec,
  basis,
  ...(SINCE[rule] ?? {}),
}));

export const RULE = new Map(RULES.map((r) => [r.rule, r]));

// Rules no SDL document can break: the grammar requires `on` and at least
// one location.
export const UNWRITABLE = {
  DIRECTIVE_LOCATIONS_DEFINED: "SDL can't write a directive without locations, so no vector breaks this rule",
};

// Rules whose every invalid vector is `unspecified`, so the check is never
// graded, and why.
export const UNGRADED = {
  SCHEMA_EXTENSION_DEFINED:
    "every vector that breaks it is unspecified: the spec doesn't say whether a document without a schema definition has a schema that is already defined",
};
