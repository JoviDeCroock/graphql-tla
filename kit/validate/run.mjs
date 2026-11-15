// graphql-tla run validate: asks the adapter whether each graded vector's
// document is valid against its schema, then checks the answers
// (check.mjs). Vectors the spec doesn't settle, and those that need a
// capability the adapter lacks, aren't asked. docs/kit/validate.md
// describes the request, the result and the verdicts.

import { ask } from "../areas.mjs";
import { check, gradedVectors, loadVectors } from "./check.mjs";

export const run = async ({ adapter, strict, log = console.log }) => {
  const data = loadVectors();
  const capabilities = [...adapter.capabilities];
  const { graded, skipped } = gradedVectors(data, capabilities);
  const started = Date.now();
  const answers = [];
  for (const vector of graded) {
    answers.push(await ask(adapter, "validate", { schema: data.schemas[vector.schema], document: vector.document }));
  }
  log(`  asked ${answers.length} questions in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return check(data, graded, answers, { strict, log, implementation: adapter.name, capabilities, skipped });
};
