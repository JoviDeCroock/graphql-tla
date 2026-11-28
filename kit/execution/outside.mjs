// Fixtures outside the spec: what they run is in no release, so what they
// find can't count against a spec section. Each kind has an INFO check
// (checks.mjs), and every failure of the response (its data and errors) in
// such a fixture counts under that check instead of its own. Protocol
// problems and the checks on resolver calls don't depend on what the
// fixture adds, and keep their own checks and levels (check.mjs).

import { FRAGMENT_ARGUMENTS } from "../fixtures.mjs";

// `check` is the INFO check, `when` starts a finding's summary, and `what`
// names the feature in the fixture's note.
export const OUTSIDE_SPEC = [
  {
    check: "disabledPropagation",
    applies: (fixture) => fixture?.errorPropagation === false,
    when: "with error propagation off",
    what: "graphql-js 17's @experimental_disableErrorPropagation",
  },
  {
    check: "fragmentArguments",
    applies: (fixture) => Boolean(fixture?.requires?.includes(FRAGMENT_ARGUMENTS)),
    when: "with fragment arguments",
    what: "the fragment arguments proposal, graphql-spec#1081",
  },
];

// The kind of fixture outside the spec this one is, or undefined.
export const outsideSpec = (fixture) => OUTSIDE_SPEC.find((o) => o.applies(fixture));

// Whether a check is one of the INFO checks above.
const IDS = new Set(OUTSIDE_SPEC.map((o) => o.check));
export const isOutsideCheck = (id) => IDS.has(id);
export const outsideCheck = (id) => OUTSIDE_SPEC.find((o) => o.check === id);
