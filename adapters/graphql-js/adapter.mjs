// A graphql-tla adapter for graphql-js (docs/conformance.md).
//
// Every field gets one resolver, which tells the kit it was called and
// returns a promise the kit settles. After each message from the kit, the
// adapter lets graphql-js run until it has nothing left to do, then says
// `idle`, which makes runs deterministic. It also claims the execution
// capabilities subscription-stream (the kit drives a subscription's source
// stream), parent-values (objects carry the kit's tokens, and each call
// reports its parent's), custom-scalar-results and scalar-results, in both
// graphql-js 16 and 17.
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
// the area adds (such as absent-vs-null for coerce). An `available` export,
// if false for this graphql-js version, leaves the area unclaimed (schema
// coordinates came in graphql-js 16.15).
const AREAS = ["parse", "validate", "coerce", "schema", "introspect", "coordinate"];
const areas = new Map();
const areaCapabilities = [];
for (const area of AREAS) {
  const file = new URL(`./areas/${area}.mjs`, import.meta.url);
  if (!existsSync(file)) continue;
  const module = await import(file.href);
  if (module.available?.(graphql) === false) continue;
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
    "subscription-stream",
    "parent-values",
    "custom-scalar-results",
    "scalar-results",
    "custom-directives",
    // @experimental_disableErrorPropagation is new in graphql-js 17.
    ...(version === "16" ? [] : ["error-propagation-off"]),
    ...areaCapabilities,
  ],
});

// What a custom scalar's result coercion rejects (custom-scalar-results).
const UNREPRESENTABLE = Object.freeze({ unrepresentable: true });

// A value the leaf type can't represent: a fraction for an Int, a
// non-finite number for a Float, a name that isn't one of an enum's values,
// and for a custom scalar a value its result coercion raises on.
const uncoercibleValue = (type) => {
  const named = graphql.getNamedType(type);
  if (graphql.isEnumType(named)) return "NOT_A_VALUE";
  if (!graphql.isSpecifiedScalarType(named)) return UNREPRESENTABLE;
  return named.name === "Int" ? 1.2 : Infinity;
};

// Custom scalars built from SDL pass every value through. Give each a
// result coercion that raises on UNREPRESENTABLE, as a custom scalar's
// serializer would on a value it can't represent (§3.5). graphql-js 16
// calls serialize, 17 coerceOutputValue.
const coerceCustomScalars = (schema) => {
  for (const type of Object.values(schema.getTypeMap())) {
    if (!graphql.isScalarType(type) || graphql.isSpecifiedScalarType(type) || type.name.startsWith("__")) continue;
    const coerce = (value) => {
      if (value === UNREPRESENTABLE) throw new TypeError(`${type.name} cannot represent this value`);
      return value;
    };
    type.serialize = coerce;
    if ("coerceOutputValue" in type) type.coerceOutputValue = coerce;
  }
};

// A source stream the kit drives (subscription-stream): next() waits for
// the kit's `source` messages, and return(), the implementation cancelling
// it, is reported as `source-cancelled`.
const kitSource = (id, execution) => {
  const queue = [];
  let waiting = null;
  let over = false;
  const answer = (item, { resolve, reject }) => {
    if (item.error) {
      over = true;
      reject(item.error);
    } else if (item.done) {
      over = true;
      resolve({ value: undefined, done: true });
    } else resolve({ value: item.value, done: false });
  };
  return {
    push(item) {
      if (over) return;
      if (waiting) {
        const w = waiting;
        waiting = null;
        answer(item, w);
      } else queue.push(item);
    },
    iterator: {
      next() {
        if (queue.length > 0) return new Promise((resolve, reject) => answer(queue.shift(), { resolve, reject }));
        if (over) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve, reject) => (waiting = { resolve, reject }));
      },
      return() {
        if (!over && !execution.ended) send({ type: "source-cancelled", id });
        over = true;
        queue.length = 0;
        waiting?.resolve({ value: undefined, done: true });
        waiting = null;
        return Promise.resolve({ value: undefined, done: true });
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    },
  };
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
  coerceCustomScalars(schema);
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
  // With parent-values (message.initialValue), every object the resolvers
  // return carries the kit's token, and each field's call reports the
  // token of the object it was called on.
  const parentValues = message.initialValue !== undefined;
  const control = (path, type, parent) => {
    const call = nextCall++;
    const promise = new Promise((resolve, reject) => calls.set(call, { path, type, resolve, reject }));
    // graphql-js may never await it, for example an item of a list that was
    // already nulled, so a rejection mustn't count as unhandled.
    promise.catch(() => {});
    // `after`: how many settles this execution had applied when the
    // resolver was called, so the kit knows what the engine had seen.
    send({ type: "call", id, call, path, returnType: String(type), after: execution.applied, ...(parent !== undefined ? { parent } : {}) });
    return promise;
  };
  const args = {
    schema,
    document,
    variableValues: message.variables,
    ...(parentValues ? { rootValue: { token: message.initialValue } } : {}),
    fieldResolver: (source, _args, _context, info) =>
      control(
        graphql.responsePathAsArray(info.path).map(String),
        info.returnType,
        parentValues ? (source?.token ?? null) : undefined,
      ),
    typeResolver: (value) => value.__typename,
  };
  const execution = { calls, control, ended: false, applied: 0 };
  executions.set(id, execution);
  const respond = (response) => send({ type: "response", id, response: breakResponse(JSON.parse(JSON.stringify(response))) });
  const fail = (error) => send({ type: "error", id, message: String(error?.stack ?? error) });
  if (message.operationType === "subscription" && message.stream) {
    // subscription-stream: the source stream is the kit's, and every
    // result the response stream yields is reported, then how it ended.
    const source = kitSource(id, execution);
    execution.source = source;
    Promise.resolve(graphql.subscribe({ ...args, subscribeFieldResolver: () => source.iterator })).then(async (stream) => {
      if (!stream[Symbol.asyncIterator]) return respond(stream);
      execution.stream = stream;
      for (;;) {
        let step;
        try {
          step = await stream.next();
        } catch (error) {
          if (!execution.ended && !execution.completed) send({ type: "stream-error", id, message: String(error?.message ?? error) });
          execution.completed = true;
          return;
        }
        if (execution.ended) return;
        if (step.done) {
          if (!execution.completed) send({ type: "done", id });
          execution.completed = true;
          return;
        }
        respond(step.value);
      }
    }, fail);
    return;
  }
  // A subscription's source stream yields one event; the response is the
  // result of executing the selection set for it.
  const result =
    message.operationType === "subscription"
      ? Promise.resolve(
          graphql.subscribe({
            ...args,
            subscribeFieldResolver: async function* () {
              yield parentValues ? { token: message.event } : {};
            },
          }),
        ).then(async (stream) => {
          if (!stream[Symbol.asyncIterator]) return stream;
          const { value } = await stream.next();
          await stream.return?.();
          return value;
        })
      : Promise.resolve(graphql.execute(args));
  result.then((response) => !execution.ended && respond(response), fail);
};

// The kit's source stream emits, completes or fails.
const source = ({ id, action, token, message }) => {
  const execution = executions.get(id);
  if (!execution?.source) return send({ type: "error", id, message: "no streamed subscription to drive" });
  if (action === "emit") execution.source.push({ value: token !== undefined ? { token } : {} });
  else if (action === "complete") execution.source.push({ done: true });
  else if (action === "fail") execution.source.push({ error: new Error(message) });
  else send({ type: "error", id, message: `unknown source action ${action}` });
};

// The client cancels the response stream. Once return() resolves, the
// client sees the stream complete.
const cancel = ({ id }) => {
  const execution = executions.get(id);
  if (!execution?.stream) return send({ type: "error", id, message: "no response stream to cancel" });
  Promise.resolve(execution.stream.return?.()).then(
    () => {
      if (!execution.completed && !execution.ended) send({ type: "done", id });
      execution.completed = true;
    },
    (error) => {
      if (!execution.completed && !execution.ended) send({ type: "stream-error", id, message: String(error?.message ?? error) });
      execution.completed = true;
    },
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
  // scalar-results: the internal value the kit names, as it is.
  else if (outcome.kind === "leaf" && "value" in outcome) resolve(outcome.value);
  else if (outcome.kind === "leaf") resolve(graphql.isListType(nullable) ? 1 : leafValue(nullable));
  else if (outcome.kind === "uncoercible") resolve(uncoercibleValue(nullable));
  else if (outcome.kind === "object") resolve({ __typename: outcome.type, ...(outcome.token !== undefined ? { token: outcome.token } : {}) });
  else resolve(Array.from({ length: outcome.length }, (_, i) => execution.control([...path, String(i)], nullable.ofType)));
};

// The streamed subscription's response stream, which may still be open when
// the kit is done with it: closed quietly.
const close = (execution) => {
  if (execution.stream && !execution.completed) execution.stream.return?.()?.catch?.(() => {});
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
  else if (message.type === "source") source(message);
  else if (message.type === "cancel") cancel(message);
  else if (message.type === "end") {
    const execution = executions.get(message.id);
    if (execution) {
      execution.ended = true;
      close(execution);
    }
    executions.delete(message.id);
    continue;
  }
  await flush();
  if (idle) send({ type: "idle", id: message.id });
}
