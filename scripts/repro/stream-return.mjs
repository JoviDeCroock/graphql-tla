// graphql-js 17.1.0: when a streamed list's parent is nulled while the first
// next() on the list's async iterator is still pending, return() is never
// called on that iterator. Found by specs/stream.ts. Run:
//
//   node scripts/repro/stream-return.mjs
//
// Expected: return() called: true. Actual on 17.1.0: return() called: false.

const g = await import("graphql17");
const schema = g.buildSchema(`
  directive @stream(initialCount: Int! = 0, label: String, if: Boolean! = true) on FIELD
  type Query { feed: Feed }
  type Feed { title: String! items: [Item] }
  type Item { id: ID! }
`);
const run = async (label, titleDelay) => {
  let returned = false;
  let rejectTitle;
  const iterator = {
    [Symbol.asyncIterator]() { return this; },
    next: () => new Promise(() => {}),            // first next() never settles
    return: () => { returned = true; return Promise.resolve({ done: true }); },
  };
  const rootValue = {
    feed: {
      title: () => new Promise((_, reject) => { rejectTitle = reject; }),
      items: () => iterator,
    },
  };
  const result = g.experimentalExecuteIncrementally({
    schema, rootValue,
    document: g.parse(`{ feed { title items @stream(initialCount: 1) { id } } }`),
  });
  await new Promise((r) => setTimeout(r, 10));
  rejectTitle(new Error("title failed"));       // nulls feed while next() is pending
  const r = await Promise.race([result, new Promise((r) => setTimeout(() => r("pending"), 100))]);
  await new Promise((r) => setTimeout(r, 100));
  console.log(label, JSON.stringify(r === "pending" ? r : (r.initialResult ?? r)), "return() called:", returned);
};
await run("parent nulled while first next() pending:");
