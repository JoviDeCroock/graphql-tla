// graphql-tla run validate: asks the adapter whether each graded vector's
// document is valid against its schema, then checks the answers
// (check.mjs). Vectors that need a capability the adapter lacks aren't
// asked. Vectors the spec doesn't settle aren't graded; those with
// `readings` are asked, and the reading each answer follows is recorded.
// An `error` answer is a crash on that vector. docs/kit/validate.md
// describes the request, the result and the verdicts.

import { answerOrCrash } from "../areas.mjs";
import { check, gradedVectors, loadVectors } from "./check.mjs";

export const run = async ({ adapter, strict, log = console.log }) => {
  const data = loadVectors();
  const capabilities = [...adapter.capabilities];
  const { graded, informational, skipped } = gradedVectors(data, capabilities);
  const started = Date.now();
  const ask = (vector) => answerOrCrash(adapter, "validate", { schema: data.schemas[vector.schema], document: vector.document });
  const answers = [];
  for (const vector of graded) answers.push(await ask(vector));
  // Unspecified vectors with readings: asked, and only recorded.
  const recorded = [];
  for (const vector of informational) recorded.push({ vector, answer: await ask(vector) });
  log(`  asked ${answers.length + recorded.length} questions in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return check(data, graded, answers, { strict, log, implementation: adapter.name, capabilities, skipped, informational: recorded });
};
