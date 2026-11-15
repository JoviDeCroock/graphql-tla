// graphql-js 17.1.0: an async-iterable list field whose parent is nulled
// while the first next() on its iterator is still pending. The iterator's
// return() isn't called until that next() settles, so a next() that never
// settles means return() is never called. Items past `initialCount` of a
// @stream with enableEarlyExecution are handled differently: their iterator
// is returned at once. Found by specs/stream.ts. Run:
//
//   node scripts/repro/stream-return.mjs

import * as g from "graphql17";

const schema = g.buildSchema(`
  directive @stream(initialCount: Int! = 0, label: String, if: Boolean! = true) on FIELD
  type Query { feed: Feed }
  type Feed { title: String! items: [Item] }
  type Item { id: ID! }
`);

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async (label, query, { settleLater = false, early = false } = {}) => {
  let returned = false;
  let settleNext;
  let rejectTitle;
  const iterator = {
    [Symbol.asyncIterator]() {
      return this;
    },
    next: () =>
      new Promise((resolve) => {
        settleNext = () => resolve({ value: { id: "1" }, done: false });
      }),
    return: () => {
      returned = true;
      return Promise.resolve({ done: true });
    },
  };
  const rootValue = {
    feed: {
      title: () => new Promise((_, reject) => (rejectTitle = reject)),
      items: () => iterator,
    },
  };
  const result = g.experimentalExecuteIncrementally({
    schema,
    rootValue,
    document: g.parse(query),
    enableEarlyExecution: early,
  });
  await tick(10);
  rejectTitle(new Error("title failed")); // nulls feed while next() is pending
  const response = await result;
  await tick(50);
  const before = returned;
  if (settleLater) {
    settleNext();
    await tick(50);
  }
  const data = JSON.stringify((response.initialResult ?? response).data);
  console.log(
    `${label}\n  data: ${data}\n  return() called while next() pending: ${before}` +
      (settleLater ? `\n  return() called after next() settles: ${returned}` : ""),
  );
};

await run("plain list", "{ feed { title items { id } } }");
await run("plain list, next() settles later", "{ feed { title items { id } } }", { settleLater: true });
await run("@stream(initialCount: 1)", "{ feed { title items @stream(initialCount: 1) { id } } }");
await run("@stream(initialCount: 1), early execution", "{ feed { title items @stream(initialCount: 1) { id } } }", { early: true });
await run("@stream(initialCount: 0), early execution", "{ feed { title items @stream(initialCount: 0) { id } } }", { early: true });
