import assert from "node:assert/strict";
import { test } from "node:test";
import { Adapter } from "./adapter.mjs";
import { stringifyLine } from "./ndjson.mjs";

test("NDJSON escapes Unicode line boundaries without changing JSON values", () => {
  const message = {
    type: "parse",
    id: 380,
    source: "{a\u2028b\u2029c}",
    nested: { ["key\u2028"]: ["é😀", "\\u2028", "\\u2029", "\r\n\t"] },
  };
  const line = stringifyLine(message);
  assert.ok(line.endsWith("\n"));
  assert.equal(line.slice(0, -1).includes("\n"), false);
  assert.doesNotMatch(line, /[\u2028\u2029]/u);
  assert.ok(line.includes("\\u2028"));
  assert.ok(line.includes("\\u2029"));
  assert.deepEqual(JSON.parse(line), message);
});

test("Adapter sends consecutive Unicode-containing requests as whole lines", async (t) => {
  // Echo the wire JSON verbatim: both the subprocess's readline and the kit's
  // reply reader must see one complete JSON object, not Unicode fragments.
  const script = `
    const { createInterface } = require("node:readline");
    createInterface({ input: process.stdin }).on("line", line => {
      JSON.parse(line);
      process.stdout.write(line + "\\n");
    });
  `;
  const adapter = new Adapter(`node -e '${script}'`);
  t.after(() => adapter.close());
  const messages = [
    { type: "parse", id: 380, source: "{a\u2028b}" },
    { type: "parse", id: 381, source: "{a\u2029b}" },
    { type: "parse", id: 382, source: '{ field(arg: "é😀") }' },
  ];
  for (const message of messages) adapter.send(message);
  for (const message of messages) assert.deepEqual(await adapter.next(5000), message);
});
