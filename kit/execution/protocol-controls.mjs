// Negative controls for the checks the recorded corpus (controls.json)
// can't exercise: those that need a capability its graphql-js recordings
// don't use (parent-values, subscription-stream, custom-scalar-results,
// scalar-results), or a fault graphql-js can't be made to commit (an error
// without locations, a repeated key, an ID written as a number). check()
// runs them with the corpus: each base must pass, and
// have none of the SHOULD warnings in its `quiet`; each control must be
// caught by the check it names, as a malformed case ("malformed") or as a
// SHOULD warning on a well-formed one ("warning").
//
// Some are made from the corpus's bases, so they follow the fixtures; the
// stream logs are written out by hand, since a stream's lifecycle case has
// no trace or response of its own. The scalar controls run on a fixture of
// their own (SCALAR_FIXTURE), which only these controls see: they're
// malformed cases, which never reach the reference.

import { Kind, buildASTSchema, parse, print } from "graphql17";

const isIndex = (segment) => /^(0|[1-9]\d*)$/.test(segment ?? "");
const errorsOf = (c) => (Array.isArray(c.response?.errors) ? c.response.errors : []);

// A case as an adapter with parent-values would have reported it: each
// object outcome named by its path, each field's call naming its parent's.
const withParents = (c, fixture) => {
  const event = fixture.operationType === "subscription" ? "event-1" : undefined;
  const settled = new Map();
  const trace = c.trace.map((e) => {
    if (e.settle) {
      const outcome = e.outcome.kind === "object" ? { ...e.outcome, token: `o:${e.settle.join(".")}` } : e.outcome;
      settled.set(e.settle.join("."), outcome);
      return { ...e, outcome };
    }
    const path = e.call.map(String);
    if (isIndex(path.at(-1))) return e;
    const parent = path.length === 1 ? (event ?? "root") : (settled.get(path.slice(0, -1).join("."))?.token ?? null);
    return { ...e, parent };
  });
  return { ...c, trace, initialValue: "root", ...(event ? { event } : {}) };
};

// The trace with the parent of the first call `pick` selects replaced by
// `parent` (or removed, if undefined).
const reparent = (c, pick, parent) => {
  const i = c.trace.findIndex((e) => e.call && "parent" in e && pick(e.call));
  if (i === -1) return null;
  const { parent: _, ...call } = c.trace[i];
  const trace = [...c.trace];
  trace[i] = parent === undefined ? call : { ...call, parent };
  return { ...c, trace };
};

// A fixture with a custom scalar, an Int and an ID, for the
// custom-scalar-results and scalar-results controls.
const SCALAR_SOURCE = `
type Query { price: Money count: Int id: ID }
scalar Money
query { price count id }
`;
export const SCALAR_FIXTURE = (() => {
  const parsed = parse(SCALAR_SOURCE);
  const types = parsed.definitions.filter((d) => d.kind !== Kind.OPERATION_DEFINITION);
  const operations = parsed.definitions.filter((d) => d.kind === Kind.OPERATION_DEFINITION);
  return {
    id: "scalarControl",
    sdl: print({ kind: Kind.DOCUMENT, definitions: types }),
    document: print({ kind: Kind.DOCUMENT, definitions: operations }),
    schema: buildASTSchema({ kind: Kind.DOCUMENT, definitions: types }),
    operationType: "query",
    variables: {},
    maxListLength: 2,
    errorPropagation: true,
    invalidResults: false,
    spec: [],
    requires: [],
  };
})();

// Stream logs: what a conforming implementation reports for each kind of
// scenario, and ways to get it wrong.
const emit = (event) => ({ kit: "emit", event });
const result = (event) => ({ adapter: "response", ...(event ? { event } : {}) });
const COMPLETE = { kit: "complete" };
const FAIL = { kit: "fail", message: "the source stream failed" };
const CANCEL = { kit: "cancel" };
const DONE = { adapter: "done" };
const STREAM_ERROR = { adapter: "stream-error", message: "the source stream failed" };
const SOURCE_CANCELLED = { adapter: "source-cancelled" };

const STREAM_BASES = [
  ["the source completes before any event", [COMPLETE, DONE]],
  ["one event, then the source completes", [emit(1), result(1), COMPLETE, DONE]],
  ["two events, then the source fails", [emit(1), result(1), emit(2), result(2), FAIL, STREAM_ERROR]],
  ["the source fails, and a stream of results ends with an error item", [emit(1), result(1), FAIL, { adapter: "response", errors: true }, DONE]],
  ["an event whose root field raises, another event, then the source completes", [emit(1), result(1), emit(2), result(2), COMPLETE, DONE]],
  ["cancelled after an event", [emit(1), result(1), CANCEL, SOURCE_CANCELLED, DONE]],
  ["cancelled while an event executes", [emit(1), result(1), emit(2), CANCEL, SOURCE_CANCELLED, DONE]],
];

const STREAM_CONTROLS = [
  ["drops an event's result", "eventPerSourceEvent", [emit(1), result(1), emit(2), COMPLETE, DONE]],
  ["yields a result for no source event", "eventPerSourceEvent", [emit(1), result(1), result(), COMPLETE, DONE]],
  ["completes with an error instead of yielding an event's result", "eventPerSourceEvent", [emit(1), STREAM_ERROR]],
  ["yields a result after the response stream completed", "eventPerSourceEvent", [emit(1), result(1), COMPLETE, DONE, result()]],
  ["completes after an event whose data is null, though the source goes on", "streamEndsOnlyForCause", [emit(1), result(1), DONE]],
  ["completes with an error when the source completes", "completesWithSource", [COMPLETE, STREAM_ERROR]],
  ["never completes after the source completes", "completesWithSource", [emit(1), result(1), COMPLETE]],
  ["completes normally when the source fails", "failsWithSource", [emit(1), result(1), FAIL, DONE]],
  ["never completes after the source fails", "failsWithSource", [FAIL]],
  ["yields a result without errors after the source failed, then completes normally", "failsWithSource", [emit(1), result(1), FAIL, result(), DONE]],
  ["completes with an error when cancelled", "cancelCompletes", [CANCEL, SOURCE_CANCELLED, STREAM_ERROR]],
  ["never completes when cancelled", "cancelCompletes", [emit(1), result(1), CANCEL, SOURCE_CANCELLED]],
  ["doesn't cancel the source when cancelled", "cancelCancelsSource", [CANCEL, DONE]],
  ["yields an event's result after the client cancelled", "nothingAfterCancel", [emit(1), result(1), emit(2), CANCEL, SOURCE_CANCELLED, result(2), DONE]],
];

// { fixtures, bases: [{ case, quiet? }], controls: [{ name, clause, check, case }] }
export const protocolControls = (corpus, fixtures) => {
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  const bases = [];
  const controls = [];
  const malformed = (name, check, c) => c && controls.push({ name, clause: "malformed", check, case: c });
  const warning = (name, check, c) => c && controls.push({ name, clause: "warning", check, case: c });
  const recorded = corpus.bases.filter((b) => byId.has(b.fixture) && b.response);

  // Locations (§7.1.6): a base whose every error has locations.
  const located = recorded.find((b) => errorsOf(b).length > 0 && errorsOf(b).every((e) => Array.isArray(e.locations) && e.locations.length > 0));
  if (located) {
    bases.push({ case: located, quiet: ["errorLocationsPresent", "errorLocationsAccurate"] });
    const errors = (f) => ({ ...located, response: { ...located.response, errors: errorsOf(located).map(f) } });
    warning("leaves locations out of execution errors", "errorLocationsPresent", errors(({ locations: _, ...e }) => e));
    warning("writes an empty list of locations", "errorLocationsPresent", errors((e) => ({ ...e, locations: [] })));
    warning(
      "points a location at a line the field isn't on",
      "errorLocationsAccurate",
      errors((e) => ({ ...e, locations: e.locations.map((l) => ({ ...l, line: l.line + 40 })) })),
    );
  }

  // A repeated key (Appendix B, §7.1.1): what the kit records when the
  // adapter's line repeats a key in one map.
  const keyed = recorded.find((b) => b.response.data && Object.keys(b.response.data).length > 0);
  if (keyed) malformed("repeats a key in data", "uniqueKeys", { ...keyed, duplicateKeys: [["data", Object.keys(keyed.response.data)[0]]] });

  // Parent values (§6.4.2): bases as an adapter with parent-values reports
  // them, one whose operation has a field below the root, and a
  // subscription's.
  const nested = recorded.find(
    (b) => byId.get(b.fixture).operationType !== "subscription" && b.trace.some((e) => e.call && e.call.length > 1 && !isIndex(String(e.call.at(-1)))),
  );
  if (nested) {
    const base = withParents(nested, byId.get(nested.fixture));
    bases.push({ case: base });
    malformed(
      "gives a field the initial value instead of its parent's",
      "parentValue",
      reparent(base, (p) => p.length > 1 && !isIndex(String(p.at(-1))), "root"),
    );
    malformed("doesn't say which value a root field's resolver was given", "parentValue", reparent(base, (p) => p.length === 1));
    malformed("gives a root field an object instead of the initial value", "parentValue", reparent(base, (p) => p.length === 1, "o:x"));
  }
  const subscription = recorded.find((b) => byId.get(b.fixture).operationType === "subscription" && b.trace.some((e) => e.call?.length === 1));
  if (subscription) {
    const base = withParents(subscription, byId.get(subscription.fixture));
    bases.push({ case: base });
    malformed("gives a subscription's root field the initial value instead of the event's", "parentValue", reparent(base, (p) => p.length === 1, "root"));
  }

  // Streams (§6.2.3): lifecycle logs on a subscription fixture.
  const streamFixture = fixtures.find((f) => f.operationType === "subscription");
  if (streamFixture) {
    const stream = (scenario, log) => ({ v: 1, fixture: streamFixture.id, trace: [], stream: { scenario, log } });
    for (const [scenario, log] of STREAM_BASES) bases.push({ case: stream(scenario, log) });
    for (const [name, check, log] of STREAM_CONTROLS) malformed(name, check, stream(name, log));
  }

  // Custom scalars (§3.5): a value the scalar's result coercion rejects.
  // Built-in scalars (§3.5.1, §3.5.5): an Int outside 32 bits, an integer
  // for an ID.
  const leaf = (field, type, outcome, data) => ({
    v: 1,
    fixture: SCALAR_FIXTURE.id,
    trace: [
      { call: [field], type },
      { settle: [field], outcome },
    ],
    response: { data: { [field]: data } },
  });
  const price = (data) => leaf("price", "Money", { kind: "uncoercible" }, data);
  malformed("passes through a value a custom scalar's result coercion rejects", "resultCoercion", price("v"));
  malformed("returns null without an error for a value a custom scalar rejects", "coercionErrorReported", price(null));
  malformed("passes an Int outside 32 bits through", "intRange", leaf("count", "Int", { kind: "leaf", value: 2147483648 }, 2147483648));
  malformed("writes an integer ID as a JSON number", "idAsString", leaf("id", "ID", { kind: "leaf", value: 4 }, 4));
  malformed("returns null without an error for an integer ID", "coercionErrorReported", leaf("id", "ID", { kind: "leaf", value: 4 }, null));

  return { fixtures: [SCALAR_FIXTURE], bases, controls };
};
