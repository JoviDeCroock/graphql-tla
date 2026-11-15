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
const samePath = (a, b) => JSON.stringify(a.map(String)) === JSON.stringify(b.map(String));
// The type the trace's call at a path reports.
const callType = (c, path) => c.trace.find((e) => e.call && samePath(e.call, path))?.type;
const withError = (response, error, broken) => ({ ...response, errors: response.errors.map((e) => (e === error ? broken : e)) });

// Each control: a name, what must catch it (a clause; "malformed" with the
// check in kit/execution/checks.mjs it must break; or "warning" with the
// SHOULD check a well-formed case must break), and `make(case, fixture)`,
// which returns broken variants of a case (any of which may be used) or []
// if the case doesn't fit.
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
    name: "nulls data while no pending root field can null it",
    clause: "dataMatches",
    make: (c, fixture) => {
      // Every root field nullable, so none can null data; then drop the
      // last settle, so execution is still pending.
      if (fixture.operationType !== "query") return [];
      const fields = Object.values(fixture.schema.getQueryType().getFields());
      if (fields.some((f) => String(f.type).endsWith("!"))) return [];
      const last = c.trace.findLastIndex((e) => e.settle);
      return last === -1 ? [] : [{ trace: c.trace.filter((_, i) => i !== last), response: { data: null } }];
    },
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
      return [{ response: withError(c.response, error, { ...error, path: error.path.map(String) }) }];
    },
  },
  {
    name: "leaves the list indices out of an error path",
    clause: "malformed",
    check: "responsePosition",
    make: (c) =>
      (c.response.errors ?? [])
        .filter((e) => e.path.some((s) => typeof s === "number"))
        .map((error) => ({ response: withError(c.response, error, { ...error, path: error.path.filter((s) => typeof s !== "number") }) })),
  },
  {
    name: "reports an error at the nullable position it propagated to",
    clause: "malformed",
    check: "errorPathFull",
    make: (c) =>
      (c.response.errors ?? []).flatMap((error) => {
        // The deepest proper prefix of the path that is null in data, if
        // the error's own position isn't in data: it propagated there. A
        // field, not data itself.
        const valueAt = (path) => path.reduce((v, k) => (v === null || typeof v !== "object" ? undefined : v[k]), c.response.data ?? null);
        if (valueAt(error.path) !== undefined) return [];
        for (let n = error.path.length - 1; n >= 1; n--) {
          if (valueAt(error.path.slice(0, n)) === null) return [{ response: withError(c.response, error, { ...error, path: error.path.slice(0, n) }) }];
        }
        return [];
      }),
  },
  {
    name: "writes an error path as a string instead of a list",
    clause: "malformed",
    check: "responsePosition",
    make: (c) => (c.response.errors?.length ? [{ response: withError(c.response, c.response.errors[0], { ...c.response.errors[0], path: c.response.errors[0].path.join(".") }) }] : []),
  },
  {
    name: "reports an error under the field name instead of its alias",
    clause: "malformed",
    check: "responsePosition",
    make: (c) => {
      const error = c.fixture === "fragments" && c.response.errors?.find((e) => e.path.at(-1) === "nodeId");
      return error ? [{ response: withError(c.response, error, { ...error, path: [...error.path.slice(0, -1), "id"] }) }] : [];
    },
  },
  {
    name: "writes a location with line 0",
    clause: "warning",
    check: "errorLocations",
    make: (c) => (c.response.errors?.length ? [{ response: withError(c.response, c.response.errors[0], { ...c.response.errors[0], locations: [{ line: 0, column: 1 }] }) }] : []),
  },
  {
    name: "writes an Int as a string",
    clause: "warning",
    check: "leafEncoding",
    make: (c) => {
      const text = JSON.stringify(c.response);
      return /"count":1\b/.test(text) ? [{ response: JSON.parse(text.replace(/"count":1\b/, '"count":"1"')) }] : [];
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
    name: "calls a mutation root field twice",
    clause: "malformed",
    check: "mutationFieldsOnce",
    make: (c, fixture) => {
      if (fixture.operationType !== "mutation") return [];
      const [[call] = []] = rootCalls(c);
      return call ? [{ trace: [...c.trace, call] }] : [];
    },
  },
  {
    name: "truncates a fraction returned for an Int instead of raising an error",
    clause: "malformed",
    check: "intFraction",
    make: (c) => {
      const settle = c.trace.find((e) => e.settle?.length === 1 && e.settle[0] === "count" && e.outcome.kind === "uncoercible");
      if (!settle || c.response.data?.count !== null) return [];
      const errors = (c.response.errors ?? []).filter((e) => JSON.stringify(e.path) !== JSON.stringify(["count"]));
      const { errors: _, ...rest } = c.response;
      return [{ response: { ...rest, data: { ...c.response.data, count: 1 }, ...(errors.length ? { errors } : {}) } }];
    },
  },
  {
    name: "returns a name that isn't one of the enum's values instead of raising an error",
    clause: "malformed",
    check: "resultCoercion",
    make: (c) => {
      const settle = c.trace.find((e) => e.settle?.length === 1 && e.settle[0] === "color" && e.outcome.kind === "uncoercible");
      if (!settle || c.response.data?.color !== null) return [];
      const errors = (c.response.errors ?? []).filter((e) => JSON.stringify(e.path) !== JSON.stringify(["color"]));
      const { errors: _, ...rest } = c.response;
      return [{ response: { ...rest, data: { ...c.response.data, color: "BLUE" }, ...(errors.length ? { errors } : {}) } }];
    },
  },
  {
    name: "returns null without an error for a non-finite Float",
    clause: "malformed",
    check: "coercionErrorReported",
    make: (c) => {
      const settle = c.trace.find((e) => e.settle?.length === 1 && e.settle[0] === "ratio" && e.outcome.kind === "uncoercible");
      if (!settle || c.response.data?.ratio !== null) return [];
      return [{ response: withoutErrors(c.response, (e) => !samePath(e.path, ["ratio"])) }];
    },
  },
  {
    name: "produces no response after a resolver returned a non-finite Float or an unknown enum value",
    clause: "malformed",
    check: "resultCoercion",
    make: (c) => {
      if (!c.trace.some((e) => e.settle && e.outcome.kind === "uncoercible" && !/^Int!?$/.test(callType(c, e.settle) ?? ""))) return [];
      // response: undefined drops the base's response when the variant is
      // merged into it, and when it's written to controls.json.
      return [{ response: undefined, noResponse: "can't serialize Infinity" }];
    },
  },
  {
    name: "reports a Float for an Int call, then produces no response after an uncoercible value",
    clause: "malformed",
    check: "protocol",
    make: (c) => {
      const settle = c.trace.find((e) => e.settle && e.outcome.kind === "uncoercible" && /^Int!?$/.test(callType(c, e.settle) ?? ""));
      if (!settle) return [];
      const trace = c.trace.map((e) => (e.call && samePath(e.call, settle.settle) ? { ...e, type: "Float" } : e));
      return [{ trace, response: undefined, noResponse: "can't serialize the value" }];
    },
  },
  {
    name: "produces no response",
    clause: "malformed",
    check: "responds",
    make: (c) => {
      if (c.trace.some((e) => e.settle && e.outcome.kind === "uncoercible")) return [];
      return [{ response: undefined, noResponse: "the server failed" }];
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

// A response with every error's locations at line 0, which breaks the
// errorLocations SHOULD.
const lineZero = (c) => ({ ...c, response: { ...c.response, errors: c.response.errors.map((e) => ({ ...e, locations: [{ line: 0, column: 1 }] })) } });
const check = (report, id) => report.checks.find((c) => c.id === id);
const fixtureOf = (report, id) => report.fixtures.find((f) => f.id === id);
const outsideSpec = (fixture) => fixture.errorPropagation === false;
const hasErrors = (c) => c.response?.errors?.length > 0;

// Report controls: what a single case can't show, how the report counts
// and grades failures across cases. Each needs passing base cases, one for
// each predicate in `bases` ((case, fixture) => boolean), makes the cases
// to check from them with `make(bases)`, and says what's wrong with their
// report (run with `strict`) with `expect(report, cases)`, or "" if
// nothing is. scripts/generate-controls.mjs picks the bases and stores the
// cases in controls.json.
export const REPORT_CONTROLS = [
  {
    name: "a SHOULD warning in a normal fixture, after the same warning outside the spec",
    strict: true,
    bases: [(c, fixture) => outsideSpec(fixture) && hasErrors(c), (c, fixture) => !outsideSpec(fixture) && hasErrors(c)],
    make: (bases) => bases.map(lineZero),
    expect: (report, [, normal]) => {
      const problems = [];
      if (check(report, "errorLocations").failing !== 1) problems.push(`errorLocations fails on ${check(report, "errorLocations").failing} cases, not 1`);
      if (fixtureOf(report, normal.fixture).status !== "fail") problems.push(`${normal.fixture} passes with --strict`);
      return problems.join("; ");
    },
  },
  {
    name: "one case breaks the same SHOULD twice",
    strict: false,
    bases: [(c, fixture) => !outsideSpec(fixture) && c.response?.errors?.length > 1],
    make: (bases) => bases.map(lineZero),
    expect: (report) => {
      const { cases, failing } = check(report, "errorLocations");
      const finding = report.findings.find((f) => f.checks.includes("errorLocations"));
      return cases === 1 && failing === 1 && finding?.cases === 1 ? "" : `errorLocations fails on ${failing} of ${cases} cases, in a finding of ${finding?.cases} cases`;
    },
  },
  {
    name: "a call with the wrong type, then no response after an uncoercible Int",
    strict: false,
    bases: [(c, fixture) => !outsideSpec(fixture) && c.trace.some((e) => e.settle?.length === 1 && e.settle[0] === "count" && e.outcome.kind === "uncoercible")],
    make: ([c]) => [
      {
        ...c,
        trace: c.trace.map((e) => (e.call?.length === 1 && e.call[0] === "count" ? { ...e, type: "Float" } : e)),
        response: undefined,
        noResponse: "can't serialize the value",
      },
    ],
    expect: (report) =>
      report.adapterProblems === 1 && check(report, "intFraction").failing === 0
        ? ""
        : `adapterProblems is ${report.adapterProblems} and intFraction fails on ${check(report, "intFraction").failing} cases, not 1 and 0`,
  },
  {
    name: "an Int fraction passed through counts under intFraction only",
    strict: false,
    bases: [(c, fixture) => !outsideSpec(fixture) && c.trace.some((e) => e.settle?.length === 1 && e.settle[0] === "count" && e.outcome.kind === "uncoercible") && c.response?.data?.count === null],
    make: ([c]) => [{ ...c, response: { ...withoutErrors(c.response, (e) => !samePath(e.path, ["count"])), data: { ...c.response.data, count: 1.2 } } }],
    expect: (report) => {
      const problems = [];
      if (check(report, "intFraction").failing !== 1) problems.push(`intFraction fails on ${check(report, "intFraction").failing} cases, not 1`);
      if (check(report, "leafValues").failing !== 0) problems.push(`leafValues fails on ${check(report, "leafValues").failing} cases, not 0`);
      return problems.join("; ");
    },
  },
  {
    name: "a truncated Int fraction doesn't hide an error dropped elsewhere in the case",
    strict: false,
    bases: [
      (c, fixture) =>
        !outsideSpec(fixture) &&
        c.fixture === "unions" &&
        c.trace.some((e) => samePath(e.settle ?? [], ["matrix"]) && e.outcome.kind === "list" && e.outcome.length === 1) &&
        c.trace.some((e) => samePath(e.settle ?? [], ["matrix", "0"]) && e.outcome.kind === "list" && e.outcome.length === 1) &&
        c.trace.some((e) => samePath(e.settle ?? [], ["matrix", "0", "0"]) && e.outcome.kind === "uncoercible") &&
        c.response?.data?.search === null &&
        c.response.errors?.some((e) => e.path[0] === "search"),
    ],
    // matrix.0.0 truncated to 1 without its error, and the errors that
    // explain the null search dropped.
    make: ([c]) => [{ ...c, response: { ...withoutErrors(c.response, (e) => e.path[0] !== "search" && e.path[0] !== "matrix"), data: { ...c.response.data, matrix: [[1]] } } }],
    expect: (report) => {
      const problems = [];
      if (check(report, "intFraction").failing !== 1) problems.push(`intFraction fails on ${check(report, "intFraction").failing} cases, not 1`);
      if (check(report, "nullsExplained").failing !== 1) problems.push(`nullsExplained fails on ${check(report, "nullsExplained").failing} cases, not 1`);
      return problems.join("; ");
    },
  },
  {
    name: "errors without a path don't hide data nulled past a nullable position",
    strict: false,
    bases: [(c, fixture) => !outsideSpec(fixture) && fixture.operationType === "query" && c.response?.data !== null && c.response?.errors?.length > 0],
    make: ([c]) => [{ ...c, response: { data: null, errors: c.response.errors.map(({ path: _, ...e }) => e) } }],
    expect: (report) => {
      const problems = [];
      if (check(report, "errorPath").failing !== 1) problems.push(`errorPath fails on ${check(report, "errorPath").failing} cases, not 1`);
      if (check(report, "dataMatches").failing !== 1) problems.push(`dataMatches fails on ${check(report, "dataMatches").failing} cases, not 1`);
      if (check(report, "nullsExplained").cases !== 0) problems.push("nullsExplained was graded on a case without error paths");
      return problems.join("; ");
    },
  },
  {
    name: "a case that breaks two checks counts against both",
    strict: false,
    bases: [(c, fixture) => !outsideSpec(fixture) && c.response?.data != null && !hasErrors(c)],
    make: ([c]) => [{ ...c, response: { ...c.response, errors: [], status: "ok" } }],
    expect: (report) =>
      check(report, "errorsList").failing === 1 && check(report, "additionalEntries").failing === 1
        ? ""
        : `errorsList fails on ${check(report, "errorsList").failing} cases and additionalEntries on ${check(report, "additionalEntries").failing}, not 1 and 1`,
  },
  {
    name: "a field called twice, with the same outcome both times, still has its response graded",
    strict: false,
    bases: [
      (c, fixture) =>
        !outsideSpec(fixture) &&
        fixture.operationType === "query" &&
        c.response?.errors?.length === 1 &&
        c.trace.some((e) => e.call?.length > 1 && samePath(e.call, c.response.errors[0].path)),
    ],
    // The failing field's resolver called and settled a second time, and
    // its error dropped.
    make: ([c]) => {
      const path = c.response.errors[0].path;
      const call = c.trace.find((e) => e.call && samePath(e.call, path));
      const settle = c.trace.find((e) => e.settle && samePath(e.settle, path));
      return [{ ...c, trace: [...c.trace, call, settle], response: withoutErrors(c.response, () => false) }];
    },
    expect: (report, [c]) => {
      const problems = [];
      if (check(report, "callsOnce").failing !== 1) problems.push(`callsOnce fails on ${check(report, "callsOnce").failing} cases, not 1`);
      if (check(report, "nullsExplained").failing !== 1) problems.push(`nullsExplained fails on ${check(report, "nullsExplained").failing} cases, not 1`);
      if (fixtureOf(report, c.fixture).status !== "fail") problems.push(`${c.fixture} passes`);
      return problems.join("; ");
    },
  },
  {
    name: "a mutation that didn't run serially isn't graded on serialErrorsKept",
    strict: false,
    bases: [(c, fixture) => !outsideSpec(fixture) && fixture.operationType === "mutation" && c.response?.data === null && c.response.errors?.length > 1 && rootCalls(c).length > 1],
    // The second root field called right after the first, and the first
    // root field's errors dropped.
    make: ([c]) => {
      const [[firstCall, first], [second, at]] = rootCalls(c);
      const trace = c.trace.filter((_, i) => i !== at);
      trace.splice(first + 1, 0, "after" in second ? { ...second, after: firstCall.after } : second);
      return [{ ...c, trace, response: withoutErrors(c.response, (e) => e.path[0] !== firstCall.call[0]) }];
    },
    expect: (report) => {
      const problems = [];
      if (check(report, "calledSerially").failing !== 1) problems.push(`calledSerially fails on ${check(report, "calledSerially").failing} cases, not 1`);
      if (check(report, "serialErrorsKept").cases !== 0) problems.push(`serialErrorsKept was graded on ${check(report, "serialErrorsKept").cases} cases, not 0`);
      return problems.join("; ");
    },
  },
  {
    name: "a root field called twice with different types, outside the spec",
    strict: false,
    bases: [(c, fixture) => outsideSpec(fixture) && c.trace.some((e) => e.call?.length === 1)],
    make: ([c]) => {
      const call = c.trace.find((e) => e.call?.length === 1);
      return [{ ...c, trace: [...c.trace, { ...call, type: call.type === "ID!" ? "String!" : "ID!" }] }];
    },
    expect: (report, [c]) => {
      const problems = [];
      if (report.adapterProblems !== 1) problems.push(`adapterProblems is ${report.adapterProblems}, not 1`);
      if (check(report, "callsOnce").failing !== 1) problems.push(`callsOnce fails on ${check(report, "callsOnce").failing} cases, not 1`);
      if (fixtureOf(report, c.fixture).status !== "fail") problems.push(`${c.fixture} passes`);
      return problems.join("; ");
    },
  },
];
