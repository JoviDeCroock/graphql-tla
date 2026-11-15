// Negative controls: ways a response can be wrong, each made by breaking a
// known-good case. Every check run evaluates the shipped corpus
// (controls.json, written by scripts/generate-controls.mjs) alongside the
// implementation's cases: each base case must pass, each control must fail
// the clause it names or be rejected as malformed. That shows the checker
// can catch each kind of bug, independently of what the implementation did.

const clone = (v) => JSON.parse(JSON.stringify(v));
const rootCalls = (c) => c.trace.map((e, i) => [e, i]).filter(([e]) => e.call && e.call.length === 1);
const withoutErrors = (response, keep) => {
  const errors = (response.errors ?? []).filter(keep);
  const { errors: _, ...rest } = response;
  return errors.length > 0 ? { ...rest, errors } : rest;
};
const firstValueKey = (data) => data && Object.entries(data).find(([, v]) => v !== null)?.[0];

// Each control: a name, what must catch it (a clause, or "malformed" with
// the check in kit/execution/checks.mjs it must break), and
// `make(case, fixture)`, which returns broken variants of a case (any of
// which may be used) or [] if the case doesn't fit.
export const CONTROLS = [
  {
    name: "drops the only error",
    clause: "nullsExplained",
    make: (c) => (c.response.errors?.length === 1 ? [{ response: withoutErrors(c.response, () => false) }] : []),
  },
  {
    name: "reports an error twice",
    clause: "errorPathsUnique",
    make: (c) => (c.response.errors?.length ? [{ response: { ...c.response, errors: [...c.response.errors, c.response.errors[0]] } }] : []),
  },
  {
    name: "nulls a value without an error",
    clause: "dataMatches",
    make: (c) => {
      const key = firstValueKey(c.response.data);
      return key ? [{ response: { ...c.response, data: { ...c.response.data, [key]: null } } }] : [];
    },
  },
  {
    name: "reorders response keys",
    clause: "keyOrder",
    make: (c) =>
      c.response.data && Object.keys(c.response.data).length > 1
        ? [{ response: { ...c.response, data: Object.fromEntries(Object.entries(c.response.data).reverse()) } }]
        : [],
  },
  {
    name: "drops a list item",
    clause: "dataMatches",
    make: (c) => {
      const entry = c.response.data && Object.entries(c.response.data).find(([, v]) => Array.isArray(v) && v.length > 1);
      return entry ? [{ response: { ...c.response, data: { ...c.response.data, [entry[0]]: entry[1].slice(1) } } }] : [];
    },
  },
  {
    name: "answers __typename with the wrong type",
    clause: "dataMatches",
    make: (c) => {
      const text = JSON.stringify(c.response.data ?? null);
      return /"__typename":"\w+"/.test(text)
        ? [{ response: { ...c.response, data: JSON.parse(text.replace(/"__typename":"(\w+)"/, (_, t) => `"__typename":"${t === "Query" ? "Mutation" : "Query"}"`)) } }]
        : [];
    },
  },
  {
    name: "reports an error at a position that has a value",
    clause: "errorsInsideNulls",
    make: (c) => {
      const key = firstValueKey(c.response.data);
      return key
        ? [{ response: { ...c.response, errors: [...(c.response.errors ?? []), { message: "x", path: [key] }] } }]
        : [];
    },
  },
  {
    name: "drops every error from a null data",
    clause: "nullsExplained",
    make: (c) => (c.response.data === null ? [{ response: withoutErrors(c.response, () => false) }] : []),
  },
  {
    name: "drops an earlier root field's error once a mutation nulls data",
    clause: "serialErrorsKept",
    make: (c, fixture) =>
      fixture.operationType === "mutation" && c.response.data === null && c.response.errors?.length > 1
        ? c.response.errors.map((dropped) => ({ response: withoutErrors(c.response, (e) => e !== dropped) }))
        : [],
  },
  {
    name: "drops the error that nulled an earlier mutation root field",
    clause: "serialErrorsKept",
    make: (c, fixture) =>
      fixture.operationType === "mutation" && c.response.data === null && c.response.errors?.length > 1
        ? c.response.errors
            .filter((e) => e.path.length > 1 && e.path[0] !== c.response.errors.at(-1).path[0])
            .map((dropped) => ({ response: withoutErrors(c.response, (e) => e !== dropped) }))
        : [],
  },
  {
    name: "responds while a resolver it needs is pending",
    clause: "complete",
    make: (c) => {
      const last = c.trace.findLastIndex((e) => e.settle);
      return last === -1 ? [] : [{ trace: c.trace.filter((_, i) => i !== last) }];
    },
  },
  {
    name: "calls a mutation's root fields at once",
    clause: "calledSerially",
    make: (c, fixture) => {
      const roots = rootCalls(c);
      if (fixture.operationType !== "mutation" || roots.length < 2) return [];
      const [[firstCall, first], [second, at]] = roots;
      const trace = c.trace.filter((_, i) => i !== at);
      // Called right after the first root field, before anything settled.
      trace.splice(first + 1, 0, "after" in second ? { ...second, after: firstCall.after } : second);
      return [{ trace }];
    },
  },
  {
    name: "writes a list index in an error path as a string",
    clause: "malformed",
    check: "responsePosition",
    make: (c) => {
      const error = c.response.errors?.find((e) => e.path.some((s) => typeof s === "number"));
      if (!error) return [];
      const broken = { ...error, path: error.path.map(String) };
      return [{ response: { ...c.response, errors: c.response.errors.map((e) => (e === error ? broken : e)) } }];
    },
  },
  {
    name: "adds an entry to the response",
    clause: "malformed",
    check: "additionalEntries",
    make: (c) => [{ response: { ...c.response, status: "ok" } }],
  },
  {
    name: "leaves out data",
    clause: "malformed",
    check: "dataPresent",
    make: (c) => {
      const { data: _, ...rest } = c.response;
      return [{ response: rest }];
    },
  },
  {
    name: "returns a leaf other than the canonical value",
    clause: "malformed",
    check: "leafValues",
    make: (c) => {
      const text = JSON.stringify(c.response);
      return /"v"/.test(text) ? [{ response: JSON.parse(text.replace(/"v"/, '"w"')) }] : [];
    },
  },
  {
    name: "calls a resolver twice",
    clause: "malformed",
    check: "callsOnce",
    make: (c) => {
      const call = c.trace.find((e) => e.call);
      return call ? [{ trace: [...c.trace, call] }] : [];
    },
  },
  {
    name: "calls a field that @include(if: false) leaves out",
    clause: "malformed",
    check: "callsSelected",
    make: (c) => {
      if (c.fixture !== "fragments") return [];
      const i = c.trace.findIndex((e) => e.settle?.length === 1 && e.settle[0] === "node" && e.outcome.kind === "object");
      if (i === -1) return [];
      const trace = clone(c.trace);
      trace.splice(i + 1, 0, { call: ["node", "key"], type: "ID!" }, { settle: ["node", "key"], outcome: { kind: "leaf" } });
      return [{ trace }];
    },
  },
  {
    name: "calls a field before its parent has a value",
    clause: "malformed",
    check: "callsReachable",
    make: (c) => {
      const i = c.trace.findLastIndex((e) => e.call && e.call.length > 1);
      if (i === -1) return [];
      const trace = clone(c.trace);
      const [call] = trace.splice(i, 1);
      return [{ trace: [call, ...trace] }];
    },
  },
  {
    name: "calls a list item past the list's length",
    clause: "malformed",
    check: "callsReachable",
    make: (c) => {
      const i = c.trace.findIndex((e) => e.settle && e.outcome.kind === "list");
      if (i === -1) return [];
      const { settle, outcome } = c.trace[i];
      const trace = clone(c.trace);
      trace.splice(i + 1, 0, { call: [...settle, String(outcome.length)], type: "Int!" });
      return [{ trace }];
    },
  },
  {
    name: "stamps a call with a negative after",
    clause: "malformed",
    check: "protocol",
    make: (c) => {
      const i = c.trace.findIndex((e) => e.call && Number.isInteger(e.after));
      if (i === -1) return [];
      const trace = clone(c.trace);
      trace[i].after = -1;
      return [{ trace }];
    },
  },
  {
    name: "reports the wrong type for a call",
    clause: "malformed",
    check: "protocol",
    make: (c) => {
      const i = c.trace.findIndex((e) => e.call && e.type !== "Boolean");
      if (i === -1) return [];
      const trace = clone(c.trace);
      trace[i].type = "Boolean";
      return [{ trace }];
    },
  },
];
