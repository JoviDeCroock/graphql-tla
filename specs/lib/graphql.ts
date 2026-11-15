/*
 * Plain data for a GraphQL schema and query, as read by specs/execution.ts.
 * scripts/generate-fixtures.mjs writes values of these types from
 * fixtures/*.graphql into specs/lib/fixtures.ts. specs/Fixtures.tla holds
 * the same data for the hand-written reference.
 *
 * Every value of a union has the same fields, because TLC can't compare
 * values of different shapes.
 */

// A type reference: the named type, and its wrappers from the outside in.
// [Post!]! is { name: "Post", wrappers: ["nonNull", "list", "nonNull"] }.
export type TypeRef = { name: string; wrappers: string[] };

export type TypeDef = {
  kind: "object" | "interface" | "union" | "scalar";
  fields: Map<string, TypeRef>;
  // The object types a value of this type may have at runtime.
  possibleTypes: Set<string>;
};

// The `if` argument of @skip or @include.
export type Condition = {
  kind: "absent" | "literal" | "variable";
  value: boolean;
  variable: string;
};

export type Selection = {
  kind: "field" | "inlineFragment" | "fragmentSpread";
  // The field or fragment name. "" for an inline fragment.
  name: string;
  alias: string;
  // "" when an inline fragment has no type condition.
  typeCondition: string;
  skip: Condition;
  include: Condition;
  selectionSet: Selection[];
};

export type Fragment = { typeCondition: string; selectionSet: Selection[] };

export type Fixture = {
  // Root operation type names; "" when the schema has no such root.
  schema: { query: string; mutation: string; subscription: string; types: Map<string, TypeDef> };
  operationType: "query" | "mutation" | "subscription";
  operation: Selection[];
  fragments: Map<string, Fragment>;
  variables: Map<string, boolean>;
  maxListLength: number;
  // false when the operation carries @experimental_disableErrorPropagation
  // (graphql-js 17): an execution error nulls its own position, Non-Null or
  // not, instead of propagating to the parent.
  errorPropagation: boolean;
  // Whether resolvers may also produce results of the wrong shape: an object
  // for a leaf (a result coercion error), a non-list for a list, or a runtime
  // type that isn't a possible type.
  invalidResults: boolean;
};

// A response path. List indices are strings, "0" not 0, so that every
// segment has the same type.
export type Path = string[];

// What a resolver produced for a response position: an object of a
// runtime type, a leaf value, a list of `length` items, null, or an error.
export type Outcome = {
  kind: "object" | "leaf" | "list" | "null" | "error";
  type: string;
  length: number;
};

// A response value. Objects keep their keys in order. Leaf values are
// abstracted to "" except for __typename, whose value is the type name.
export type Json = {
  kind: "null" | "leaf" | "object" | "list";
  value: string;
  entries: Entry[];
  items: Json[];
};
export type Entry = { key: string; value: Json };
