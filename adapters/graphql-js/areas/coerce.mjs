// The coerce area for graphql-js (docs/kit/coerce.md): executes the
// document with a resolver on every field that records its path and
// arguments, and sends back the execution result and those calls. The kit
// classifies the outcome.
//
// By default it uses `execute` without `validate`, so it answers vectors
// whose document is invalid (the `unvalidated` capability). Started with
// --validate (`node adapters/graphql-js/adapter.mjs --graphql 17
// --validate`), it validates first, as a server does, and doesn't claim
// `unvalidated`: the kit then checks that invalid documents fail without
// executing. graphql-js leaves an argument that wasn't given out of the
// args object, so absent and null differ (`absent-vs-null`). The variables
// are parsed with JSON.parse, which reads numbers as doubles, so it doesn't
// claim `exact-numbers`.

const validating = process.argv.includes("--validate");

export const capabilities = ["absent-vs-null", ...(validating ? [] : ["unvalidated"])];

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
  if (validating) {
    const errors = graphql.validate(schema, document);
    if (errors.length > 0) return { response: { errors: errors.map((e) => e.toJSON()) }, calls: [] };
  }
  const calls = [];
  const response = await graphql.execute({
    schema,
    document,
    operationName: request.operationName,
    variableValues: JSON.parse(request.variables),
    fieldResolver: (_source, args, _context, info) => {
      calls.push({ path: graphql.responsePathAsArray(info.path), arguments: toJson(args) });
      return "ok";
    },
  });
  return { response: JSON.parse(JSON.stringify(response)), calls };
};
