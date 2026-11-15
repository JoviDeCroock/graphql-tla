// A graphql-tla adapter for graphql-js (docs/conformance.md).
//
// Every field gets one resolver, which tells the kit it was called and
// returns a promise the kit settles. After each message from the kit, the
// adapter lets graphql-js run until it has nothing left to do, then says
// `idle`, which makes runs deterministic.
//
// Usage: node adapters/graphql-js/adapter.mjs --graphql 16|17 [--no-idle]
//
// --no-idle leaves out `idle`, as an adapter for a threaded runtime would,
// to exercise the kit's timing-based fallback. --fault NAME breaks every
// response on purpose, to see what the kit reports for a broken
// implementation: drop-errors, reverse-keys or wrong-leaf.

import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { stringifyLine } from "../../kit/ndjson.mjs";

const version = process.argv[process.argv.indexOf("--graphql") + 1];
const graphql = version === "16" ? await import("graphql16") : await import("graphql17");

// The kit's other areas (docs/kit-areas.md): each one this adapter answers
// is a module in areas/, whose default export maps a request to the
// result's fields, and whose `capabilities` export lists any capabilities
// the area adds (such as absent-vs-null for coerce).
const AREAS = ["parse", "validate", "coerce", "schema", "introspect"];
const areas = new Map();
const areaCapabilities = [];
for (const area of AREAS) {
  const file = new URL(`./areas/${area}.mjs`, import.meta.url);
  if (!existsSync(file)) continue;
  const module = await import(file.href);
  areas.set(area, module.default);
  areaCapabilities.push(area, ...(module.capabilities ?? []));
}

const idle = !process.argv.includes("--no-idle");
const fault = process.argv.includes("--fault") ? process.argv[process.argv.indexOf("--fault") + 1] : "";
const reverse = (v) =>
  v === null || typeof v !== "object"
    ? v
    : Array.isArray(v)
      ? v.map(reverse)
      : Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverse(x)]));
const breakResponse = (r) =>
  fault === "drop-errors"
    ? { data: r.data }
    : fault === "reverse-keys"
      ? { ...r, data: reverse(r.data) }
      : fault === "wrong-leaf"
        ? JSON.parse(JSON.stringify(r).replace(/"v"/, '"w"'))
        : r;
const send = (message) => process.stdout.write(stringifyLine(message));
const flush = () => new Promise((done) => setImmediate(done));

send({
  type: "hello",
  protocol: 1,
  name: `graphql-js ${graphql.version}`,
  capabilities: [
    ...(idle ? ["idle"] : []),
    "deferred-items",
    "invalid-results",
    "uncoercible-results",
    "mutation",
    "subscription",
    // @experimental_disableErrorPropagation is new in graphql-js 17.
    ...(version === "16" ? [] : ["error-propagation-off"]),
    ...areaCapabilities,
  ],
});

// A value the leaf type can't represent: a fraction for an Int, a
// non-finite number for a Float, a name that isn't one of an enum's values.
const uncoercibleValue = (type) => {
  const named = graphql.getNamedType(type);
  if (graphql.isEnumType(named)) return "NOT_A_VALUE";
  return named.name === "Int" ? 1.2 : Infinity;
};

// The value a resolver returns for each outcome.
const leafValue = (type) => {
  const named = graphql.getNamedType(type);
  if (graphql.isEnumType(named)) return named.getValues()[0].value;
  return named.name === "Int" ? 1 : named.name === "Float" ? 1.5 : named.name === "Boolean" ? true : "v";
};

const executions = new Map();

const start = (message) => {
  const { id } = message;
  const schema = graphql.buildSchema(message.schema);
  let document = graphql.parse(message.document);
  if (!message.errorPropagation) {
    const directive = { kind: graphql.Kind.DIRECTIVE, name: { kind: graphql.Kind.NAME, value: "experimental_disableErrorPropagation" }, arguments: [] };
    document = {
      ...document,
      definitions: document.definitions.map((d) =>
        d.kind === graphql.Kind.OPERATION_DEFINITION ? { ...d, directives: [...(d.directives ?? []), directive] } : d,
      ),
    };
  }
  const calls = new Map();
  let nextCall = 1;
  const control = (path, type) => {
    const call = nextCall++;
    const promise = new Promise((resolve, reject) => calls.set(call, { path, type, resolve, reject }));
    // graphql-js may never await it, for example an item of a list that was
    // already nulled, so a rejection mustn't count as unhandled.
    promise.catch(() => {});
    // `after`: how many settles this execution had applied when the
    // resolver was called, so the kit knows what the engine had seen.
    send({ type: "call", id, call, path, returnType: String(type), after: execution.applied });
    return promise;
  };
  const args = {
    schema,
    document,
    variableValues: message.variables,
    fieldResolver: (_source, _args, _context, info) =>
      control(graphql.responsePathAsArray(info.path).map(String), info.returnType),
    typeResolver: (value) => value.__typename,
  };
  const execution = { calls, control, ended: false, applied: 0 };
  executions.set(id, execution);
  // A subscription's source stream yields one event; the response is the
  // result of executing the selection set for it.
  const result =
    message.operationType === "subscription"
      ? Promise.resolve(
          graphql.subscribe({
            ...args,
            subscribeFieldResolver: async function* () {
              yield {};
            },
          }),
        ).then(async (stream) => {
          if (!stream[Symbol.asyncIterator]) return stream;
          const { value } = await stream.next();
          await stream.return?.();
          return value;
        })
      : Promise.resolve(graphql.execute(args));
  result.then(
    (response) => !execution.ended && send({ type: "response", id, response: breakResponse(JSON.parse(JSON.stringify(response))) }),
    (error) => send({ type: "error", id, message: String(error?.stack ?? error) }),
  );
};

const settle = ({ id, call, outcome }) => {
  const execution = executions.get(id);
  const pending = execution?.calls.get(call);
  if (!pending) return send({ type: "error", id, message: `no pending call ${call}` });
  execution.calls.delete(call);
  execution.applied++;
  const { path, type, resolve, reject } = pending;
  const nullable = graphql.isNonNullType(type) ? type.ofType : type;
  if (outcome.kind === "error") reject(new Error(`resolver at ${path.join(".")} failed`));
  else if (outcome.kind === "null") resolve(null);
  // A leaf at a list position is the number 1, which no language iterates.
  else if (outcome.kind === "leaf") resolve(graphql.isListType(nullable) ? 1 : leafValue(nullable));
  else if (outcome.kind === "uncoercible") resolve(uncoercibleValue(nullable));
  else if (outcome.kind === "object") resolve({ __typename: outcome.type });
  else resolve(Array.from({ length: outcome.length }, (_, i) => execution.control([...path, String(i)], nullable.ofType)));
};

for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  const message = JSON.parse(line);
  if (areas.has(message.type)) {
    try {
      send({ type: "result", id: message.id, ...(await areas.get(message.type)(graphql, message)) });
    } catch (error) {
      send({ type: "error", id: message.id, message: String(error?.stack ?? error) });
    }
    continue;
  }
  if (message.type === "execute") start(message);
  else if (message.type === "settle") settle(message);
  else if (message.type === "end") {
    const execution = executions.get(message.id);
    if (execution) execution.ended = true;
    executions.delete(message.id);
    continue;
  }
  await flush();
  if (idle) send({ type: "idle", id: message.id });
}
