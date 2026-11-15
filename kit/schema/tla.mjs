// What the schema and introspect areas share: SDL documents as the schema
// data TypeSystem.tla reads, values as TLA+ text, running tla-ts on a
// module, and reading back the values it prints.

import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as graphql from "graphql17";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const cli = join(root, "node_modules/tla-ts/dist/cli.js");

// At most this many tla-ts processes at once.
export const WORKERS = 2;

// ---------------------------------------------------------------------------
// SDL documents as TypeSystem.tla schema data. graphql-js only parses the
// document here; every verdict comes from the reference. The data is taken
// from the document, not a built schema, so it keeps duplicate names,
// source order and the directives applied inside a definition (the same
// conversion as scripts/differential-type-system.mjs).

const KIND = {
  ScalarTypeDefinition: "SCALAR",
  ObjectTypeDefinition: "OBJECT",
  InterfaceTypeDefinition: "INTERFACE",
  UnionTypeDefinition: "UNION",
  EnumTypeDefinition: "ENUM",
  InputObjectTypeDefinition: "INPUT_OBJECT",
};

const opt = (v) => (v === undefined || v === null ? [] : [v]);

const typeRefOf = (node) => {
  const wrappers = [];
  while (node.kind !== "NamedType") {
    wrappers.push(node.kind === "NonNullType" ? "nonNull" : "list");
    node = node.type;
  }
  return { name: node.name.value, wrappers };
};

// A constant literal as TypeSystem's value. Numbers are canonicalised, so
// that 1.0 and 1 are the same value. A number too large for a double, such
// as 1e400, becomes "Infinity", which TypeSystem's Float coercion rejects.
export const valueOf = (node) => {
  const v = (kind, text = "", items = [], fields = []) => ({ kind, text, items, fields });
  switch (node.kind) {
    case "NullValue":
      return v("null");
    case "IntValue":
      return v("int", String(Number(node.value)));
    case "FloatValue":
      return v("float", String(Number(node.value)));
    case "StringValue":
      return v("string", node.value);
    case "BooleanValue":
      return v("boolean", String(node.value));
    case "EnumValue":
      return v("enum", node.value);
    case "ListValue":
      return v("list", "", node.values.map(valueOf));
    case "ObjectValue":
      return v("object", "", [], node.fields.map((f) => ({ name: f.name.value, value: valueOf(f.value) })));
  }
  throw new Error(`unexpected value ${node.kind}`);
};

// A default value as a service printed it, as TypeSystem's value. Text that
// doesn't parse as a constant literal is a value no type accepts.
export const parseDefault = (text) => {
  try {
    return valueOf(graphql.parseConstValue(text));
  } catch {
    return { kind: "unparseable", text: String(text), items: [], fields: [] };
  }
};

const deprecatedOf = (directives = []) => {
  const d = directives.find((x) => x.name.value === "deprecated");
  if (!d) return [];
  const reason = d.arguments?.find((a) => a.name.value === "reason");
  return [reason ? reason.value.value : "No longer supported"];
};

const appliedIn = (node, out = new Set()) => {
  for (const d of node.directives ?? []) out.add(d.name.value);
  for (const child of [...(node.fields ?? []), ...(node.arguments ?? []), ...(node.values ?? [])]) {
    if (child.kind) appliedIn(child, out);
  }
  return out;
};

// A document with more than one schema definition keeps the last one:
// "a document must include at most one schema definition" (§3.3) isn't
// modelled, and no vector has two.
export const schemaData = (sdl) => {
  const doc = graphql.parse(sdl);
  const inputValue = (node) => ({
    name: node.name.value,
    description: opt(node.description?.value),
    type: typeRefOf(node.type),
    default: node.defaultValue ? [valueOf(node.defaultValue)] : [],
    deprecated: deprecatedOf(node.directives),
  });
  const types = [];
  const directives = [];
  let schemaDef = false;
  let operations = [];
  let description = [];
  for (const def of doc.definitions) {
    if (def.kind === "SchemaDefinition") {
      schemaDef = true;
      description = opt(def.description?.value);
      operations = def.operationTypes.map((o) => ({ operation: o.operation, type: o.type.name.value }));
      continue;
    }
    if (def.kind === "DirectiveDefinition") {
      directives.push({
        name: def.name.value,
        description: opt(def.description?.value),
        args: (def.arguments ?? []).map(inputValue),
        repeatable: def.repeatable,
        locations: def.locations.map((l) => l.value),
        deprecated: deprecatedOf(def.directives),
        directives: appliedIn(def),
      });
      continue;
    }
    const kind = KIND[def.kind];
    if (!kind) throw new Error(`the kit's schemas don't use ${def.kind}`);
    const specifiedBy = def.directives?.find((d) => d.name.value === "specifiedBy");
    types.push({
      kind,
      name: def.name.value,
      description: opt(def.description?.value),
      fields:
        kind === "INPUT_OBJECT"
          ? []
          : (def.fields ?? []).map((f) => ({
              name: f.name.value,
              description: opt(f.description?.value),
              args: (f.arguments ?? []).map(inputValue),
              type: typeRefOf(f.type),
              deprecated: deprecatedOf(f.directives),
            })),
      interfaces: (def.interfaces ?? []).map((i) => i.name.value),
      members: (def.types ?? []).map((t) => t.name.value),
      values: (def.values ?? []).map((v) => ({
        name: v.name.value,
        description: opt(v.description?.value),
        deprecated: deprecatedOf(v.directives),
      })),
      inputFields: kind === "INPUT_OBJECT" ? (def.fields ?? []).map(inputValue) : [],
      oneOf: (def.directives ?? []).some((d) => d.name.value === "oneOf"),
      specifiedBy: specifiedBy ? [specifiedBy.arguments.find((a) => a.name.value === "url").value.value] : [],
      directives: appliedIn(def),
    });
  }
  return { description, types, directives, schemaDef, operations };
};

// ---------------------------------------------------------------------------
// TLA+ text

export const tla = (v) => {
  if (v instanceof Set) return `{${[...v].sort().map(tla).join(", ")}}`;
  if (Array.isArray(v)) return `<<${v.map(tla).join(", ")}>>`;
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object") return `[${Object.entries(v).map(([k, x]) => `${k} |-> ${tla(x)}`).join(", ")}]`;
  throw new Error(`can't write ${v} as TLA+`);
};

// A long sequence as definitions of short ones, joined: tla-ts's parser
// overflows the stack on one definition with many nested records.
export const chunked = (name, items, size = 10) => {
  if (items.length === 0) return `${name} == <<>>`;
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(`<<${items.slice(i, i + size).join(",\n  ")}>>`);
  return [...chunks.map((c, i) => `${name}${i} == ${c}`), `${name} == ${chunks.map((_, i) => `${name}${i}`).join(" \\o ")}`].join(
    "\n\n",
  );
};

// ---------------------------------------------------------------------------
// Reading values tla-ts prints: records, sequences, sets, strings, numbers
// and booleans. Records become objects, sequences arrays, and sets arrays
// too (callers know which is which).

const parseValueAt = (text, start) => {
  let i = start;
  const ws = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };
  const value = () => {
    ws();
    if (text.startsWith("<<", i)) {
      i += 2;
      const items = list(">>");
      return items;
    }
    if (text[i] === "{") {
      i++;
      return list("}");
    }
    if (text[i] === "[") {
      i++;
      const out = {};
      ws();
      if (text[i] === "]") {
        i++;
        return out;
      }
      for (;;) {
        ws();
        const m = /^[A-Za-z_]\w*/.exec(text.slice(i, i + 200));
        if (!m) throw new Error(`expected a record key at ${i}: ${text.slice(i, i + 40)}`);
        i += m[0].length;
        ws();
        if (!text.startsWith("|->", i)) throw new Error(`expected |-> at ${i}`);
        i += 3;
        out[m[0]] = value();
        ws();
        if (text[i] === ",") i++;
        else if (text[i] === "]") {
          i++;
          return out;
        } else throw new Error(`expected , or ] at ${i}: ${text.slice(i, i + 40)}`);
      }
    }
    if (text[i] === '"') {
      let j = i + 1;
      while (text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      const s = JSON.parse(text.slice(i, j + 1));
      i = j + 1;
      return s;
    }
    const m = /^(TRUE|FALSE|-?\d+)/.exec(text.slice(i, i + 30));
    if (!m) throw new Error(`can't read a value at ${i}: ${text.slice(i, i + 40)}`);
    i += m[0].length;
    return m[0] === "TRUE" ? true : m[0] === "FALSE" ? false : Number(m[0]);
  };
  const list = (close) => {
    const items = [];
    ws();
    if (text.startsWith(close, i)) {
      i += close.length;
      return items;
    }
    for (;;) {
      items.push(value());
      ws();
      if (text[i] === ",") i++;
      else if (text.startsWith(close, i)) {
        i += close.length;
        return items;
      } else throw new Error(`expected , or ${close} at ${i}: ${text.slice(i, i + 40)}`);
    }
  };
  const v = value();
  return { value: v, end: i };
};

// Every value a module printed with PrintT, in order: tla-ts starts each
// on a new line.
export const printedValues = (output) => {
  const start = output.indexOf("Starting...");
  const text = start === -1 ? output : output.slice(start);
  const values = [];
  const re = /^<</gm;
  let m;
  while ((m = re.exec(text))) {
    const { value, end } = parseValueAt(text, m.index);
    values.push(value);
    re.lastIndex = end;
  }
  return values;
};

// ---------------------------------------------------------------------------
// Running tla-ts

// Checks `module` (its text, named <name>.tla) next to the references and
// any extra files, with no state to explore beyond the first. Returns the
// values it printed. Throws if tla-ts fails or `done` isn't printed.
export const evaluateModule = async (name, module, extra = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "graphql-tla-"));
  try {
    cpSync(join(root, "specs/TypeSystem.tla"), join(dir, "TypeSystem.tla"));
    cpSync(join(root, "specs/Introspection.tla"), join(dir, "Introspection.tla"));
    for (const [file, text] of Object.entries(extra)) writeFileSync(join(dir, file), text);
    writeFileSync(join(dir, `${name}.tla`), module);
    writeFileSync(join(dir, `${name}.cfg`), "INIT Init\nNEXT Next\n");
    const { status, output } = await new Promise((done) => {
      const child = spawn(process.execPath, ["--stack-size=3000", cli, "-workers", "1", `${name}.tla`], { cwd: dir });
      let out = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (out += d));
      child.on("close", (code) => done({ status: code, output: out }));
    });
    const values = status === 0 ? printedValues(output) : [];
    if (status !== 0 || !values.some((v) => Array.isArray(v) && v[0] === "done")) {
      const lines = output.split("\n").filter((l) => /Error|error|Exception|Assumption/.test(l)).slice(0, 10);
      throw new Error(`tla-ts failed on ${name}:\n${lines.map((l) => l.slice(0, 300)).join("\n") || output.slice(-1500)}`);
    }
    return values;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// Runs worker over items, WORKERS at a time.
export const pool = async (items, worker, lanes = WORKERS) => {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(lanes, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i], i);
      }
    }),
  );
  return results;
};

export const moduleFooter = `ASSUME PrintT(<<"done">>)

VARIABLE done
Init == done = FALSE
Next == UNCHANGED done
====
`;
