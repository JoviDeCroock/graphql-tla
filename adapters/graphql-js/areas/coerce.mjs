// The coerce area for graphql-js (docs/kit/coerce.md): executes the
// document with a resolver on every field that echoes its arguments, and
// says which of the three outcomes the response is.
//
// It uses `execute` without `validate`, so it answers vectors whose document
// is invalid (the `unvalidated` capability). graphql-js leaves an argument
// that wasn't given out of the args object, so absent and null differ
// (`absent-vs-null`). The variables are parsed with JSON.parse, which reads
// numbers as doubles.

export const capabilities = ["absent-vs-null", "unvalidated"];

const schemas = new Map();

// Arguments as JSON. Enum values are their names, which is what buildSchema
// makes their internal values. JSON has no non-finite numbers, so those
// become strings.
const toJson = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return String(value);
  if (Array.isArray(value)) return value.map(toJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJson(v)]));
  }
  return value;
};

export default async (graphql, request) => {
  let schema = schemas.get(request.schema);
  if (!schema) {
    schema = graphql.buildSchema(request.schema);
    schemas.set(request.schema, schema);
  }
  const document = graphql.parse(request.document);
  const field = document.definitions[0].selectionSet.selections[0].name.value;
  const calls = [];
  const response = await graphql.execute({
    schema,
    document,
    variableValues: JSON.parse(request.variables),
    fieldResolver: (_source, args) => {
      calls.push(toJson(args));
      return "ok";
    },
  });
  const errors = response.errors ?? [];
  const message = errors[0]?.message;
  if (!("data" in response) && errors.length > 0 && calls.length === 0) return { outcome: "request-error", message };
  const fieldValue = response.data?.[field];
  if (calls.length === 0 && fieldValue === null && errors.length === 1 && JSON.stringify(errors[0].path) === JSON.stringify([field])) {
    return { outcome: "field-error", message };
  }
  if (calls.length === 1 && errors.length === 0 && fieldValue === "ok") return { outcome: "value", arguments: calls[0] };
  return { outcome: "other", response: JSON.parse(JSON.stringify(response)), calls };
};
