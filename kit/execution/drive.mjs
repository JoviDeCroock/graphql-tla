// Driving an implementation's resolvers through an adapter.
//
// For one execution the kit sends `execute`, then repeatedly picks a
// resolver call that hasn't settled yet and an outcome for it, and sends
// `settle`, until the adapter reports the response. What happened becomes a
// case: the trace of calls and settles up to the response, and the response.
//
// With `subscription-stream`, a subscription can also run as a stream the
// kit drives (runStream): the kit's source stream emits events, completes,
// fails, or the kit cancels the response stream, per a scenario. Each
// event's execution becomes a case like any other, and the stream's
// lifecycle a case of its own (`stream`).

import * as graphql from "graphql17";
import { rawLine } from "../adapter.mjs";
import { duplicateKeys } from "../ndjson.mjs";

const NULL = { kind: "null" };
const ERROR = { kind: "error" };
const LEAF = { kind: "leaf" };
const UNCOERCIBLE = { kind: "uncoercible" };
// Stands in for the response when the adapter reports a stream error.
const STREAM_FAILED = Symbol("stream failed");
const NO_RESPONSE = Symbol("no response");
const RESPONSES = new Set(["response", "stream-error", "no-response"]);

// The type named in a call, against the fixture's schema.
const typeOf = (fixture, name) => {
  const type = graphql.typeFromAST(fixture.schema, graphql.parseType(name));
  if (!type) throw new Error(`${fixture.id}: the adapter reported a call of unknown type ${name}`);
  return type;
};

const nullable = (type) => (graphql.isNonNullType(type) ? type.ofType : type);

// The internal values `scalar-results` adds, by built-in scalar: an Int
// outside 32 bits, which "should" raise an execution error (§3.5.1), and an
// integer for an ID, which "must always serialize as a String" (§3.5.5).
export const SCALAR_VALUES = { Int: 2147483648, ID: 4 };

// A scalar the spec doesn't define (§3.5 "Custom Scalars").
export const isCustomScalar = (type) => graphql.isScalarType(type) && !graphql.isSpecifiedScalarType(type);

// With `parent-values`: the token of the initial value the kit gives an
// operation, and of the objects its outcomes stand for.
export const INITIAL_VALUE = "root";
const tokenFor = (prefix, path) => `${prefix}${path.join(".")}`;
const withTokens = (prefix, path, outcome) =>
  outcome.kind === "object"
    ? { ...outcome, token: tokenFor(prefix, path) }
    : outcome.kind === "list" && outcome.items
      ? { ...outcome, items: outcome.items.map((item, i) => withTokens(prefix, [...path, String(i)], item)) }
      : outcome;

// The keys the response in an adapter's `response` message repeats within
// one object (§7.1.1, Appendix B: each entry of a map has a unique key).
const repeatedKeys = (message) => {
  const line = rawLine(message);
  if (line === undefined) return [];
  return duplicateKeys(line)
    .filter((path) => path[0] === "response")
    .map((path) => path.slice(1).map(String));
};

// What a resolver for a value of this type may produce. With
// `invalidResults` (the fixture asks for it and the adapter can), also
// results of the wrong shape: an object for a scalar and a leaf for a list.
// Not a runtime type that isn't one of an abstract type's possible types:
// ResolveAbstractType (§6.4.3) is "the internal method provided by the type
// system", and no release says what happens when it returns a type that
// isn't a member, so no response to it could be graded.
// With `uncoercible` (the fixture asks for invalid results and the adapter
// has `uncoercible-results`), also a value the leaf type can't represent:
// a fraction for an Int, a non-finite number for a Float, a name that isn't
// one of an enum's values (§3.5.1, §3.5.2, §3.9). Driver#allowed then drops
// what the adapter's hello says it can't return.
// With `customScalars` (the adapter has `custom-scalar-results`), also a
// value a custom scalar's result coercion rejects, in any fixture. With
// `scalarResults` (the fixture asks for invalid results and the adapter has
// `scalar-results`), also SCALAR_VALUES: an internal value of another type
// or range for a built-in scalar, as a leaf outcome with a `value`.
export const choicesFor = (fixture, type, invalidResults, uncoercible = false, customScalars = false, scalarResults = false) => {
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
      ...((uncoercible && representable) || (customScalars && isCustomScalar(inner)) ? [UNCOERCIBLE] : []),
      ...(scalarResults && graphql.isScalarType(inner) && inner.name in SCALAR_VALUES ? [{ kind: "leaf", value: SCALAR_VALUES[inner.name] }] : []),
    ];
  }
  if (!graphql.isAbstractType(inner)) return [NULL, ERROR, ...objects([inner.name])];
  const possible = fixture.schema.getPossibleTypes(inner).map((t) => t.name);
  return [NULL, ERROR, ...objects(possible.sort())];
};

// For an adapter without `deferred-items`, a list's items come with the
// list: each item's outcome is chosen at once, and can't be an error.
// `choicesOf(type)` is what an item of that type may produce.
const inlineItems = (itemType, length, choose, choicesOf) =>
  Array.from({ length }, () => {
    const choices = choicesOf(itemType).filter((c) => c.kind !== "error");
    const outcome = choices[choose(choices.length, "outcome")];
    return outcome.kind === "list"
      ? { ...outcome, items: inlineItems(nullable(itemType).ofType, outcome.length, choose, choicesOf) }
      : outcome;
  });

// The leaf type an `uncoercible` outcome is for, as `uncoercibleTypes`
// names it.
const leafKind = (type) => {
  const inner = nullable(type);
  return graphql.isEnumType(inner) ? "Enum" : inner.name;
};

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
    this.parentValues = adapter.capabilities.has("parent-values");
    this.customScalars = adapter.capabilities.has("custom-scalar-results");
    this.scalarResults = adapter.capabilities.has("scalar-results");
    this.streams = adapter.capabilities.has("subscription-stream");
    // Outcomes the kit leaves out because the adapter says it can't return
    // them: how many times each kind was left out of a settle's choices.
    this.withheld = new Map();
  }

  // The choices for a resolver at a position of this type, without what the
  // adapter can't return: an `uncoercible` value for a leaf type outside its
  // `uncoercibleTypes`, and, with `nullItems: false`, null for a Non-Null
  // list item or subscription event. A typed implementation's item type
  // there has no null, so only a hand-written value could produce one.
  allowed(fixture, type, isItem, choices) {
    const withhold = (reason) => this.withheld.set(reason, (this.withheld.get(reason) ?? 0) + 1);
    const types = this.adapter.uncoercibleTypes;
    return choices.filter((c) => {
      // A custom scalar's uncoercible value comes with custom-scalar-results,
      // whatever uncoercibleTypes says.
      if (c.kind === "uncoercible" && types && !isCustomScalar(nullable(type)) && !types.has(leafKind(type))) {
        withhold(`uncoercible ${leafKind(type)} results (uncoercibleTypes: ${[...types].join(", ") || "none"})`);
        return false;
      }
      if (c.kind === "null" && this.adapter.nullItems === false && graphql.isNonNullType(type) && isItem) {
        withhold("null for a Non-Null list item or subscription event (nullItems: false)");
        return false;
      }
      return true;
    });
  }

  // What the resolver at a position of this type may produce in this
  // fixture, without what the adapter can't return. Outcomes the fixture
  // asks for but the adapter's capabilities rule out are counted too, so
  // the report's provenance says what the run didn't grade (§6.4.3: a list
  // result that isn't a collection, a value a leaf type can't represent).
  choices(fixture, type, isItem) {
    const invalidResults = fixture.invalidResults && this.adapter.capabilities.has("invalid-results");
    const uncoercible = fixture.invalidResults && this.adapter.capabilities.has("uncoercible-results");
    const scalarResults = fixture.invalidResults && this.scalarResults;
    const offered = choicesFor(fixture, type, invalidResults, uncoercible, this.customScalars, scalarResults);
    if (fixture.invalidResults && (!invalidResults || !uncoercible || !scalarResults)) {
      const all = choicesFor(fixture, type, true, true, this.customScalars, true);
      const key = (c) => JSON.stringify(c);
      const kept = new Set(offered.map(key));
      for (const c of all) {
        if (kept.has(key(c))) continue;
        const reason =
          c.kind === "uncoercible"
            ? "values a leaf type can't represent (no uncoercible-results capability)"
            : "value" in c
              ? "an Int outside 32 bits or an integer ID (no scalar-results capability)"
              : "results of the wrong shape (no invalid-results capability)";
        this.withheld.set(reason, (this.withheld.get(reason) ?? 0) + 1);
      }
    }
    return this.allowed(fixture, type, isItem, offered);
  }

  // The outcome to settle a call with, items included for an adapter
  // without deferred-items, and object tokens with parent-values.
  outcomeFor(fixture, next, choose, prefix, forced) {
    const isItem = /^(0|[1-9]\d*)$/.test(next.path.at(-1) ?? "") || (fixture.operationType === "subscription" && next.path.length === 1);
    const choices = this.choices(fixture, next.type, isItem);
    let outcome = forced ?? choices[choose(choices.length, "outcome")];
    if (outcome.kind === "list" && graphql.isListType(nullable(next.type)) && !this.deferredItems) {
      outcome = { ...outcome, items: inlineItems(nullable(next.type).ofType, outcome.length, choose, (type) => this.choices(fixture, type, true)) };
    }
    return this.parentValues ? withTokens(prefix, next.path, outcome) : outcome;
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
        if (this.finished.has(message.id) && RESPONSES.has(message.type)) {
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
        if (run.response === undefined) run.trace.push(callEvent(message, path, 0));
      } else if (RESPONSES.has(message.type)) {
        if (run.response !== undefined) {
          throw new Error(`${run.fixture.id}: a second response for one execution: ${JSON.stringify(message)}`);
        }
        // A subscription's response stream that failed instead of yielding
        // the event's result: the client got no execution result.
        // A query or mutation for which the implementation produced no
        // response at all, for example because serializing it failed.
        if (message.type === "stream-error") run.streamError = String(message.message ?? "");
        if (message.type === "no-response") run.noResponse = String(message.message ?? "");
        run.response = { response: message.response, "stream-error": STREAM_FAILED, "no-response": NO_RESPONSE }[message.type];
        if (message.type === "response") run.duplicateKeys = repeatedKeys(message);
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
      if (RESPONSES.has(message.type) && this.finished.has(message.id)) {
        throw new Error(`a second response for execution ${message.id}: ${JSON.stringify(message.response)}`);
      }
    }
  }

  // The `execute` message for a fixture.
  executeMessage(id, fixture, extra = {}) {
    return {
      type: "execute",
      id,
      fixture: fixture.id,
      schema: fixture.sdl,
      document: fixture.document,
      operationType: fixture.operationType,
      variables: fixture.variables,
      errorPropagation: fixture.errorPropagation,
      ...(this.parentValues ? { initialValue: INITIAL_VALUE } : {}),
      ...extra,
    };
  }

  // One execution. `choose(n, kind)` picks one of n options; kind is
  // "which" (the next resolver to settle) or "outcome".
  async run(fixture, choose) {
    const id = this.nextId++;
    const run = { fixture, pending: [], trace: [], response: undefined, calls: new Set() };
    // A subscription's one source event, with parent-values: the token of
    // its value, which its root fields must report as their parent.
    const event = this.parentValues && fixture.operationType === "subscription" ? { event: "event-1" } : {};
    this.adapter.send(this.executeMessage(id, fixture, event));
    await this.drain(id, run);
    let steps = 0;
    while (run.response === undefined) {
      if (run.pending.length === 0) throw new Error(`${fixture.id}: no response and no pending resolver`);
      if (++steps > 1000) throw new Error(`${fixture.id}: runaway execution`);
      const [next] = run.pending.splice(choose(run.pending.length, "which"), 1);
      const outcome = this.outcomeFor(fixture, next, choose, "o:");
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
      ...(this.parentValues ? { initialValue: INITIAL_VALUE, ...event } : {}),
      ...(run.response === STREAM_FAILED
        ? { streamError: run.streamError }
        : run.response === NO_RESPONSE
          ? { noResponse: run.noResponse }
          : { response: run.response, ...(run.duplicateKeys?.length ? { duplicateKeys: run.duplicateKeys } : {}) }),
    };
  }

  // Reads a streamed subscription's messages until the adapter is idle: an
  // `idle` message if it has the capability, otherwise `grace` ms of
  // silence, or `timeout` while the kit waits for something: a call or
  // result for an event it emitted, or the stream's completion and the
  // source's cancellation after it completed, failed or cancelled.
  async drainStream(s) {
    for (;;) {
      const event = s.current;
      // Waiting for the stream to complete only once no resolver is
      // pending: an implementation may finish an event cancelled in flight
      // first, which needs the kit to settle its resolvers.
      const waiting =
        (event && event.response === undefined && event.pending.length === 0 && !s.completed) ||
        (s.cause && !(event?.pending.length > 0) && (!s.completed || (s.cause === "cancel" && !s.sourceCancelled)));
      const message = await this.adapter.next(this.idle || waiting ? this.timeout : this.grace);
      if (message === null) {
        if (this.idle) throw new Error(`${s.fixture.id}: the adapter didn't say idle within ${this.timeout} ms`);
        return;
      }
      if (message.id !== s.id) {
        if (this.finished.has(message.id) && RESPONSES.has(message.type)) {
          throw new Error(`a second response for execution ${message.id}: ${JSON.stringify(message.response)}`);
        }
        continue;
      }
      if (message.type === "idle") return;
      if (message.type === "error") throw new Error(`${s.fixture.id}: the adapter failed: ${message.message}`);
      if (message.type === "call") {
        if (!Array.isArray(message.path) || typeof message.returnType !== "string") {
          throw new Error(`${s.fixture.id}: malformed call ${JSON.stringify(message)}`);
        }
        if (s.calls.has(message.call)) throw new Error(`${s.fixture.id}: call id ${message.call} reported twice`);
        if (!event) throw new Error(`${s.fixture.id}: a resolver was called before the source emitted an event`);
        s.calls.add(message.call);
        const path = message.path.map(String);
        event.pending.push({ call: message.call, path, type: typeOf(s.fixture, message.returnType) });
        if (event.response === undefined) event.trace.push(callEvent(message, path, event.settlesBefore));
      } else if (message.type === "response") {
        if (event && event.response === undefined && !event.noResponse) {
          event.response = message.response;
          event.duplicateKeys = repeatedKeys(message);
          s.log.push({ adapter: "response", event: event.number });
        } else s.log.push({ adapter: "response" });
      } else if (message.type === "no-response") {
        // The implementation produced nothing for the event, though the
        // stream goes on: the event yielded no result.
        if (event && event.response === undefined) event.noResponse = String(message.message ?? "");
        s.log.push({ adapter: "no-response", message: String(message.message ?? "") });
      } else if (message.type === "done" || message.type === "stream-error") {
        s.completed = true;
        s.log.push(message.type === "done" ? { adapter: "done" } : { adapter: "stream-error", message: String(message.message ?? "") });
      } else if (message.type === "source-cancelled") {
        s.sourceCancelled = true;
        s.log.push({ adapter: "source-cancelled" });
      } else {
        throw new Error(`${s.fixture.id}: unexpected message ${JSON.stringify(message)}`);
      }
    }
  }

  // Settles an event's pending resolvers until it has its result, or, with
  // `all`, until none is pending (an event cancelled in flight). With
  // `rootError`, its root field raises.
  async settleEvent(s, event, choose, { rootError = false, all = false } = {}) {
    let steps = 0;
    while ((all || (event.response === undefined && !event.noResponse)) && event.pending.length > 0) {
      if (++steps > 1000) throw new Error(`${s.fixture.id}: runaway execution`);
      const [next] = event.pending.splice(choose(event.pending.length, "which"), 1);
      const outcome = this.outcomeFor(s.fixture, next, choose, `e${event.number}:`, rootError && next.path.length === 1 ? ERROR : undefined);
      const { items, ...plain } = outcome;
      if (event.response === undefined) event.trace.push({ settle: next.path, outcome: plain }, ...inlineSettles(next.path, next.type, outcome));
      s.settles++;
      this.adapter.send({ type: "settle", id: s.id, call: next.call, outcome });
      await this.drainStream(s);
    }
  }

  // A subscription as a stream the kit drives through `scenario`
  // (STREAM_SCENARIOS). Returns a case for each event that yielded a
  // result, and the lifecycle case: the scenario and the log of what the
  // kit did and the adapter reported, in order.
  async runStream(fixture, scenario, choose) {
    const id = this.nextId++;
    const s = { id, fixture, log: [], events: [], current: null, completed: false, sourceCancelled: false, cause: null, calls: new Set(), settles: 0 };
    this.adapter.send(this.executeMessage(id, fixture, { stream: true }));
    await this.drainStream(s);
    for (const step of scenario.steps) {
      const [action, how] = step.split(":");
      if (action === "emit") {
        const number = s.events.length + 1;
        const event = { number, pending: [], trace: [], response: undefined, token: `event-${number}`, settlesBefore: s.settles };
        s.events.push(event);
        s.current = event;
        s.log.push({ kit: "emit", event: number });
        this.adapter.send({ type: "source", id, action: "emit", ...(this.parentValues ? { token: event.token } : {}) });
        await this.drainStream(s);
        if (how !== "inFlight") await this.settleEvent(s, event, choose, { rootError: how === "rootError" });
        continue;
      }
      if (!s.cause) s.cause = action;
      s.log.push({ kit: action, ...(action === "fail" ? { message: SOURCE_FAILURE } : {}) });
      this.adapter.send(
        action === "cancel" ? { type: "cancel", id } : { type: "source", id, action, ...(action === "fail" ? { message: SOURCE_FAILURE } : {}) },
      );
      await this.drainStream(s);
      // An event cancelled while it executed: settle its other resolvers,
      // so the implementation can finish whatever it does with it.
      if (s.current?.pending.length > 0) await this.settleEvent(s, s.current, choose, { all: true });
    }
    this.adapter.send({ type: "end", id });
    this.finished.add(id);
    const base = { fixture: fixture.id, implementation: this.adapter.name };
    return [
      ...s.events
        .filter((e) => e.response !== undefined)
        .map((e) => ({
          ...base,
          trace: e.trace,
          ...(this.parentValues ? { initialValue: INITIAL_VALUE, event: e.token } : {}),
          response: e.response,
          ...(e.duplicateKeys.length ? { duplicateKeys: e.duplicateKeys } : {}),
        })),
      { ...base, trace: [], stream: { scenario: scenario.name, log: s.log } },
    ];
  }
}

// The message the kit's source stream fails with.
export const SOURCE_FAILURE = "the source stream failed";

// What the kit's source stream does in each streamed run of a subscription
// (`subscription-stream`), step by step: `emit` an event and settle its
// resolvers until it yields a result (`emit:rootError`: its root field
// raises; `emit:inFlight`: leave its resolvers pending), `complete` or
// `fail` the source, or `cancel` the response stream. Each runs twice per
// subscription fixture, with seeded outcomes.
export const STREAM_SCENARIOS = [
  { name: "the source completes before any event", steps: ["complete"] },
  { name: "one event, then the source completes", steps: ["emit", "complete"] },
  { name: "three events, then the source completes", steps: ["emit", "emit", "emit", "complete"] },
  { name: "the source fails before any event", steps: ["fail"] },
  { name: "two events, then the source fails", steps: ["emit", "emit", "fail"] },
  { name: "an event whose root field raises, another event, then the source completes", steps: ["emit:rootError", "emit", "complete"] },
  { name: "cancelled before any event", steps: ["cancel"] },
  { name: "cancelled after an event", steps: ["emit", "cancel"] },
  { name: "cancelled while an event executes", steps: ["emit", "emit:inFlight", "cancel"] },
];

// A trace's call event for a `call` message, with its `after` stamp less
// `base` (the settles of earlier events, for a stream) and the parent it
// reports (parent-values).
const callEvent = (message, path, base) => ({
  call: path,
  type: message.returnType,
  ...(Number.isInteger(message.after) ? { after: message.after - base } : {}),
  ...("parent" in message ? { parent: message.parent } : {}),
});

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

// Seeded random outcomes and settling order. For a subscription, with
// `subscription-stream`, also each of STREAM_SCENARIOS twice.
export const random = async (driver, fixture, count, seed) => {
  const next = mulberry32(seed);
  const runs = [];
  for (let i = 0; i < count; i++) runs.push(await driver.run(fixture, (n) => Math.floor(next() * n)));
  if (driver.streams && fixture.operationType === "subscription") {
    for (const scenario of STREAM_SCENARIOS) {
      for (let k = 0; k < 2; k++) runs.push(...(await driver.runStream(fixture, scenario, (n) => Math.floor(next() * n))));
    }
  }
  return runs;
};
