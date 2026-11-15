// Driving an implementation's resolvers through an adapter.
//
// For one execution the kit sends `execute`, then repeatedly picks a
// resolver call that hasn't settled yet and an outcome for it, and sends
// `settle`, until the adapter reports the response. What happened becomes a
// case: the trace of calls and settles up to the response, and the response.

import * as graphql from "graphql17";

const NULL = { kind: "null" };
const ERROR = { kind: "error" };
const LEAF = { kind: "leaf" };
const UNCOERCIBLE = { kind: "uncoercible" };
// Stands in for the response when the adapter reports a stream error.
const STREAM_FAILED = Symbol("stream failed");

// The type named in a call, against the fixture's schema.
const typeOf = (fixture, name) => {
  const type = graphql.typeFromAST(fixture.schema, graphql.parseType(name));
  if (!type) throw new Error(`${fixture.id}: the adapter reported a call of unknown type ${name}`);
  return type;
};

const nullable = (type) => (graphql.isNonNullType(type) ? type.ofType : type);

// What a resolver for a value of this type may produce. With
// `invalidResults` (the fixture asks for it and the adapter can), also
// results of the wrong shape: an object for a scalar, a leaf for a list, and
// a runtime type that isn't one of an abstract type's possible types.
// With `uncoercible` (the fixture asks for invalid results and the adapter
// has `uncoercible-results`), also a value the leaf type can't represent:
// a fraction for an Int, a non-finite number for a Float, a name that isn't
// one of an enum's values (§3.5.1, §3.5.2, §3.9).
export const choicesFor = (fixture, type, invalidResults, uncoercible = false) => {
  const inner = nullable(type);
  const objects = (names) => names.map((name) => ({ kind: "object", type: name }));
  if (graphql.isListType(inner)) {
    return [
      NULL,
      ERROR,
      ...Array.from({ length: fixture.maxListLength + 1 }, (_, length) => ({ kind: "list", length })),
      ...(invalidResults ? [LEAF] : []),
    ];
  }
  // An object where a scalar is expected only at Int, Float and Boolean:
  // §3.5 lets a String or ID be coerced from other values "where
  // reasonable", which is the implementation's call.
  const coercible = graphql.isScalarType(inner) && ["Int", "Float", "Boolean"].includes(inner.name);
  const representable = graphql.isEnumType(inner) || (graphql.isScalarType(inner) && ["Int", "Float"].includes(inner.name));
  if (graphql.isLeafType(inner)) {
    return [
      NULL,
      ERROR,
      LEAF,
      ...(invalidResults && coercible ? objects([""]) : []),
      ...(uncoercible && representable ? [UNCOERCIBLE] : []),
    ];
  }
  if (!graphql.isAbstractType(inner)) return [NULL, ERROR, ...objects([inner.name])];
  const possible = fixture.schema.getPossibleTypes(inner).map((t) => t.name);
  const others = Object.values(fixture.schema.getTypeMap())
    .filter((t) => graphql.isObjectType(t) && !t.name.startsWith("__") && !possible.includes(t.name))
    .map((t) => t.name);
  return [NULL, ERROR, ...objects(possible.sort()), ...(invalidResults ? objects(others.sort()) : [])];
};

// For an adapter without `deferred-items`, a list's items come with the
// list: each item's outcome is chosen at once, and can't be an error.
const inlineItems = (fixture, itemType, length, invalidResults, uncoercible, choose) =>
  Array.from({ length }, () => {
    const choices = choicesFor(fixture, itemType, invalidResults, uncoercible).filter((c) => c.kind !== "error");
    const outcome = choices[choose(choices.length, "outcome")];
    return outcome.kind === "list"
      ? { ...outcome, items: inlineItems(fixture, nullable(itemType).ofType, outcome.length, invalidResults, uncoercible, choose) }
      : outcome;
  });

// The settles an inline list implies, item by item, in order.
const inlineSettles = (path, type, outcome) =>
  outcome.kind !== "list" || !outcome.items
    ? []
    : outcome.items.flatMap((item, i) => {
        const itemType = String(nullable(type).ofType);
        const itemPath = [...path, String(i)];
        const { items, ...plain } = item;
        return [
          { call: itemPath, type: itemType, inline: true },
          { settle: itemPath, outcome: plain, inline: true },
          ...inlineSettles(itemPath, nullable(type).ofType, item),
        ];
      });

export class Driver {
  constructor(adapter, { grace = 50, timeout = 10000 } = {}) {
    this.adapter = adapter;
    this.grace = grace;
    this.timeout = timeout;
    this.nextId = 1;
    this.idle = adapter.capabilities.has("idle");
    this.finished = new Set();
    this.deferredItems = adapter.capabilities.has("deferred-items");
  }

  // Reads the adapter's messages for execution `id` until it is idle: an
  // `idle` message if it has the capability, otherwise `grace` ms of silence.
  // With nothing pending and no response yet, waits up to `timeout`.
  async drain(id, run) {
    for (;;) {
      const quiet = run.response === undefined && run.pending.length === 0 ? this.timeout : this.grace;
      const message = await this.adapter.next(this.idle ? this.timeout : quiet);
      if (message === null) {
        if (!this.idle && (run.response !== undefined || run.pending.length > 0)) return;
        throw new Error(`${run.fixture.id}: no response and no pending resolver after ${this.timeout} ms`);
      }
      if (message.id !== id) {
        // A late message from an earlier execution: the engine may still
        // call abandoned resolvers, but it must not respond twice.
        if (this.finished.has(message.id) && (message.type === "response" || message.type === "stream-error")) {
          throw new Error(`a second response for execution ${message.id}: ${JSON.stringify(message.response)}`);
        }
        continue;
      }
      if (message.type === "idle") return;
      if (message.type === "error") throw new Error(`${run.fixture.id}: the adapter failed: ${message.message}`);
      if (message.type === "call") {
        if (!Array.isArray(message.path) || typeof message.returnType !== "string") {
          throw new Error(`${run.fixture.id}: malformed call ${JSON.stringify(message)}`);
        }
        if (run.calls.has(message.call)) throw new Error(`${run.fixture.id}: call id ${message.call} reported twice`);
        run.calls.add(message.call);
        const path = message.path.map(String);
        run.pending.push({ call: message.call, path, type: typeOf(run.fixture, message.returnType) });
        if (run.response === undefined) {
          run.trace.push({ call: path, type: message.returnType, ...(Number.isInteger(message.after) ? { after: message.after } : {}) });
        }
      } else if (message.type === "response" || message.type === "stream-error") {
        if (run.response !== undefined) {
          throw new Error(`${run.fixture.id}: a second response for one execution: ${JSON.stringify(message)}`);
        }
        // A subscription's response stream that failed instead of yielding
        // the event's result: the client got no execution result.
        if (message.type === "stream-error") run.streamError = String(message.message ?? "");
        run.response = message.type === "response" ? message.response : STREAM_FAILED;
      } else {
        throw new Error(`${run.fixture.id}: unexpected message ${JSON.stringify(message)}`);
      }
    }
  }

  // After the last execution: wait a moment for stray messages, and fail on
  // a second response to an execution that already had one.
  async settleDown(wait = Math.max(this.grace, 200)) {
    for (;;) {
      const message = await this.adapter.next(wait);
      if (message === null) return;
      if ((message.type === "response" || message.type === "stream-error") && this.finished.has(message.id)) {
        throw new Error(`a second response for execution ${message.id}: ${JSON.stringify(message.response)}`);
      }
    }
  }

  // One execution. `choose(n, kind)` picks one of n options; kind is
  // "which" (the next resolver to settle) or "outcome".
  async run(fixture, choose) {
    const id = this.nextId++;
    const invalidResults = fixture.invalidResults && this.adapter.capabilities.has("invalid-results");
    const uncoercible = fixture.invalidResults && this.adapter.capabilities.has("uncoercible-results");
    const run = { fixture, pending: [], trace: [], response: undefined, calls: new Set() };
    this.adapter.send({
      type: "execute",
      id,
      fixture: fixture.id,
      schema: fixture.sdl,
      document: fixture.document,
      operationType: fixture.operationType,
      variables: fixture.variables,
      errorPropagation: fixture.errorPropagation,
    });
    await this.drain(id, run);
    let steps = 0;
    while (run.response === undefined) {
      if (run.pending.length === 0) throw new Error(`${fixture.id}: no response and no pending resolver`);
      if (++steps > 1000) throw new Error(`${fixture.id}: runaway execution`);
      const [next] = run.pending.splice(choose(run.pending.length, "which"), 1);
      const choices = choicesFor(fixture, next.type, invalidResults, uncoercible);
      let outcome = choices[choose(choices.length, "outcome")];
      if (outcome.kind === "list" && graphql.isListType(nullable(next.type)) && !this.deferredItems) {
        outcome = { ...outcome, items: inlineItems(fixture, nullable(next.type).ofType, outcome.length, invalidResults, uncoercible, choose) };
      }
      const { items, ...plain } = outcome;
      run.trace.push({ settle: next.path, outcome: plain }, ...inlineSettles(next.path, next.type, outcome));
      this.adapter.send({ type: "settle", id, call: next.call, outcome });
      await this.drain(id, run);
    }
    this.adapter.send({ type: "end", id });
    this.finished.add(id);
    return {
      fixture: fixture.id,
      implementation: this.adapter.name,
      trace: run.trace,
      ...(run.response === STREAM_FAILED ? { streamError: run.streamError } : { response: run.response }),
    };
  }
}

// Every combination of outcomes, settling the oldest pending resolver first
// ("fifo") or the newest ("lifo"). Needs a deterministic adapter (`idle`).
export const exhaustive = async (driver, fixture, order, limit = 20000) => {
  const runs = [];
  let prefix = [];
  for (;;) {
    const taken = [];
    runs.push(
      await driver.run(fixture, (n, kind) => {
        if (kind === "which") return order === "fifo" ? 0 : n - 1;
        const pick = taken.length < prefix.length ? prefix[taken.length] : 0;
        taken.push({ pick, n });
        return pick;
      }),
    );
    if (runs.length >= limit) return runs;
    let i = taken.length - 1;
    while (i >= 0 && taken[i].pick === taken[i].n - 1) i--;
    if (i < 0) return runs;
    prefix = [...taken.slice(0, i).map((t) => t.pick), taken[i].pick + 1];
  }
};

const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Seeded random outcomes and settling order.
export const random = async (driver, fixture, count, seed) => {
  const next = mulberry32(seed);
  const runs = [];
  for (let i = 0; i < count; i++) runs.push(await driver.run(fixture, (n) => Math.floor(next() * n)));
  return runs;
};
