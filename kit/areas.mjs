// Asking an adapter one question in an area other than execution
// (docs/conformance.md, "Other areas"): the kit sends
// {"type": <area>, "id": n, ...} and the adapter answers
// {"type": "result", "id": n, ...}, or {"type": "error", "id": n, "message"}.
//
// In parse, validate, coerce, schema and coordinate, an `error` answer to a
// vector means the implementation crashed on it (docs/kit-areas.md,
// "Protocol"): those areas ask with answerOrCrash, which turns it into a
// Crash. Elsewhere it stops the run.
//
// AREAS is every area, in the order reports, the conformance sheet and the
// website list them. A new area needs only kit/<area>/run.mjs and a name
// here: scripts/conformance-reports.mjs runs it, scripts/check-conformance.mjs
// reproduces graphql-js's reports in it, and the sheet and the website show
// any area a report names.

export const AREAS = ["execution", "parse", "validate", "coerce", "schema", "introspect", "coordinate"];

let nextId = 1;

// Thrown when the adapter answers a request with `error`. adapterMessage is
// the adapter's own message, so an area can treat it as an answer (a
// crash) instead of stopping the run.
export class AdapterError extends Error {
  constructor(area, id, message) {
    super(`the adapter failed on ${area} request ${id}: ${message}`);
    this.adapterMessage = String(message ?? "");
  }
}

// The adapter's result for one request: the fields of its `result` message
// other than type and id. Throws if the adapter fails or stays silent.
export const ask = async (adapter, area, request, timeout = 10000) => {
  const id = nextId++;
  adapter.send({ type: area, id, ...request });
  for (;;) {
    const message = await adapter.next(timeout);
    if (message === null) throw new Error(`no answer to ${area} request ${id} after ${timeout} ms`);
    if (message.id !== id) continue;
    if (message.type === "error") throw new AdapterError(area, id, message.message);
    if (message.type !== "result") throw new Error(`expected a result for ${area} request ${id}, got ${JSON.stringify(message)}`);
    const { type: _, id: __, ...result } = message;
    return result;
  }
};

// An adapter's `error` answer to a vector: the implementation crashed. Only
// the message's first line is kept, so that a stack trace with local paths
// doesn't reach the report.
export class Crash {
  constructor(message) {
    this.message = String(message).split("\n")[0].trim().slice(0, 200);
  }
}

// The adapter's result for one request, or a Crash if it answered with an
// `error`. Any other failure, such as a silent adapter, still throws.
export const answerOrCrash = async (adapter, area, request, timeout) => {
  try {
    return await ask(adapter, area, request, timeout);
  } catch (error) {
    if (!(error instanceof AdapterError)) throw error;
    return new Crash(error.adapterMessage);
  }
};

// How a crash appears in a finding's example.
export const crashResponse = (crash) => `the adapter answered with an error: ${crash.message}`;
