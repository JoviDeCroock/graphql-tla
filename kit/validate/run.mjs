// graphql-tla run validate: asks the adapter whether each vector's document
// is valid against its schema, then checks the answers (check.mjs).
// docs/kit/validate.md describes the request, the result and the verdicts.

import { ask } from "../areas.mjs";
import { check, loadVectors } from "./check.mjs";

export const run = async ({ adapter, strict, log = console.log }) => {
  const data = loadVectors();
  const started = Date.now();
  const answers = [];
  for (const vector of data.vectors) {
    answers.push(await ask(adapter, "validate", { schema: data.schemas[vector.schema], document: vector.document }));
  }
  log(`  asked ${answers.length} questions in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return check(data, answers, { strict, log, implementation: adapter.name, capabilities: [...adapter.capabilities] });
};
