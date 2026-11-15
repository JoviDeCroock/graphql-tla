// Asking an adapter one question in an area other than execution
// (docs/conformance.md, "Other areas"): the kit sends
// {"type": <area>, "id": n, ...} and the adapter answers
// {"type": "result", "id": n, ...}, or {"type": "error", "id": n, "message"}.

export const AREAS = ["execution", "parse", "validate", "coerce", "schema", "introspect"];

let nextId = 1;

// The adapter's result for one request: the fields of its `result` message
// other than type and id. Throws if the adapter fails or stays silent.
export const ask = async (adapter, area, request, timeout = 10000) => {
  const id = nextId++;
  adapter.send({ type: area, id, ...request });
  for (;;) {
    const message = await adapter.next(timeout);
    if (message === null) throw new Error(`no answer to ${area} request ${id} after ${timeout} ms`);
    if (message.id !== id) continue;
    if (message.type === "error") throw new Error(`the adapter failed on ${area} request ${id}: ${message.message}`);
    if (message.type !== "result") throw new Error(`expected a result for ${area} request ${id}, got ${JSON.stringify(message)}`);
    const { type: _, id: __, ...result } = message;
    return result;
  }
};
