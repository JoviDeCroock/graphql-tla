import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Adapter, rawLine } from "./adapter.mjs";
import { duplicateKeys, stringifyLine } from "./ndjson.mjs";

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

test("duplicateKeys finds keys a JSON text repeats within one object, and only those", () => {
  assert.deepEqual(duplicateKeys('{"a":1,"b":2}'), []);
  assert.deepEqual(duplicateKeys('{"a":1,"a":2}'), [["a"]]);
  assert.deepEqual(duplicateKeys('{"response":{"data":{"x":{"y":1,"y":null}},"errors":[{"path":["x"],"path":["y"]}]}}'), [
    ["response", "data", "x", "y"],
    ["response", "errors", 0, "path"],
  ]);
  // The same key in sibling objects, in a list, or inside strings is no repeat.
  assert.deepEqual(duplicateKeys('[{"a":1},{"a":2}]'), []);
  assert.deepEqual(duplicateKeys('{"a":"\\"a\\":1,","b":["a","a"],"c":{}}'), []);
  // Escapes in keys are compared by value.
  assert.deepEqual(duplicateKeys('{"\\u0061":1,"a":2}'), [["a"]]);
  assert.deepEqual(duplicateKeys(' { "a" : [ 1 , { } , [ ] ] , "a" : true } '), [["a"]]);
});

test("Adapter keeps each message's raw line, for checks that read the text", async (t) => {
  // An adapter that writes one response repeating a key in data.
  const dir = mkdtempSync(join(tmpdir(), "graphql-tla-"));
  const script = join(dir, "repeat.cjs");
  writeFileSync(script, `process.stdout.write(${JSON.stringify('{"type":"response","id":1,"response":{"data":{"a":1,"a":2}}}\n')});\n`);
  const adapter = new Adapter(`node ${JSON.stringify(script)}`);
  t.after(() => {
    adapter.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const message = await adapter.next(5000);
  assert.deepEqual(message.response, { data: { a: 2 } });
  assert.deepEqual(duplicateKeys(rawLine(message)), [["response", "data", "a"]]);
});
