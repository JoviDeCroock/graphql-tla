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
//
// A document that doesn't parse is answered with graphql-js's syntax error
// as a request error, as a server does. Resolvers return what the field's
// type needs (nested-fields): an object for an object field, two for a
// list of objects, "ok" for a leaf. A subscription operation goes through
// `subscribe`, whose source stream resolver records its call in
// sourceCalls and returns a stream of one event, or raises where the
// request says `subscribe: "raise"` (subscription-source); the response is
// the first event's result, or the request error `subscribe` returns.
// graphql-js has no request extensions: it is given none, and claims
// request-extensions because the kit's extensions can't reach it.

const validating = process.argv.includes("--validate");

export const capabilities = [
  "absent-vs-null",
  "nested-fields",
  "subscription-source",
  "request-extensions",
  ...(validating ? [] : ["unvalidated"]),
];

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

// What a field's resolver returns, by its type: "ok" for a leaf, an
// object for an object type, two of them for a list of objects.
const valueFor = (graphql, type) => {
  const bare = graphql.isNonNullType(type) ? type.ofType : type;
  if (graphql.isListType(bare)) {
    const item = valueFor(graphql, bare.ofType);
    return typeof item === "object" ? [item, { ...item }] : [item];
  }
  return graphql.isObjectType(bare) ? {} : "ok";
};

export default async (graphql, request) => {
  let schema = schemas.get(request.schema);
  if (!schema) {
    schema = graphql.buildSchema(request.schema);
    schemas.set(request.schema, schema);
  }
  let document;
  try {
    document = graphql.parse(request.document);
  } catch (e) {
    if (!(e instanceof graphql.GraphQLError)) throw e;
    return { response: { errors: [e.toJSON()] }, calls: [] };
  }
  if (validating) {
    const errors = graphql.validate(schema, document);
    if (errors.length > 0) return { response: { errors: errors.map((e) => e.toJSON()) }, calls: [] };
  }
  // The request's extensions are JSON the kit sends for the service to
  // leave alone: graphql-js's execute takes none.
  if (request.extensions !== undefined) JSON.parse(request.extensions);
  const calls = [];
  const sourceCalls = [];
  const args = {
    schema,
    document,
    operationName: request.operationName,
    variableValues: JSON.parse(request.variables),
    fieldResolver: (_source, args, _context, info) => {
      calls.push({ path: graphql.responsePathAsArray(info.path), arguments: toJson(args) });
      return valueFor(graphql, info.returnType);
    },
  };
  const operation = graphql.getOperationAST(document, request.operationName);
  if (operation?.operation === "subscription" && request.subscribe !== undefined) {
    const result = await graphql.subscribe({
      ...args,
      subscribeFieldResolver: (_source, args, _context, info) => {
        sourceCalls.push({ field: info.fieldName, arguments: toJson(args) });
        if (request.subscribe === "raise") throw new Error("the source stream can't be established");
        return (async function* () {
          yield {};
        })();
      },
    });
    if (typeof result?.[Symbol.asyncIterator] !== "function") return { response: JSON.parse(JSON.stringify(result)), calls, sourceCalls };
    const first = await result.next();
    await result.return?.();
    return { response: JSON.parse(JSON.stringify(first.value)), calls, sourceCalls };
  }
  const response = await graphql.execute(args);
  return { response: JSON.parse(JSON.stringify(response)), calls, ...(request.subscribe !== undefined ? { sourceCalls } : {}) };
};
