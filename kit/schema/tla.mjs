// What the schema and introspect areas share: SDL documents as the schema
// data TypeSystem.tla reads, values as TLA+ text, running tla-ts on a
// module, and reading back the values it prints.

import { runChecker } from "../checker.mjs";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as graphql from "graphql17";

const root = resolve(fileURLToPath(import.meta.url), "../../..");

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

// A constant literal as TypeSystem's value. An integer keeps its exact
// digits, so that 9007199254740993 and 9007199254740992 stay two IDs (§3.5.5
// accepts any integer for an ID) and two values of a custom scalar. A float
// is canonicalised as the double it reads as, so that 1.0 and 1 are the
// same value, and an integral double is written as its digits, so that an
// integer coerced to Float (TypeSystem keeps its text) matches the same
// double written as a float, such as 1e21 for 1000000000000000000000. An
// integer a double can't hold exactly, such as 9007199254740993, matches
// no float: Coercion.tla refuses it as a Float input value by default
// (docs/kit/coerce.md, floatPrecision). A number too large for a double,
// such as 1e400, becomes "Infinity", which TypeSystem's Float coercion
// rejects.
const floatText = (n) => (Number.isInteger(n) ? BigInt(n).toString() : String(n));
export const valueOf = (node) => {
  const v = (kind, text = "", items = [], fields = []) => ({ kind, text, items, fields });
  switch (node.kind) {
    case "NullValue":
      return v("null");
    case "IntValue":
      return v("int", BigInt(node.value).toString());
    case "FloatValue":
      return v("float", floatText(Number(node.value)));
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
  return [reason?.value.kind === "StringValue" ? reason.value.value : "No longer supported"];
};

const appliedIn = (node, out = new Set()) => {
  for (const d of node.directives ?? []) out.add(d.name.value);
  for (const child of [...(node.fields ?? []), ...(node.arguments ?? []), ...(node.values ?? [])]) {
    if (child.kind) appliedIn(child, out);
  }
  return out;
};

// The kind of each type extension (§3.4.3), as its type's kind.
const EXTENSION_KIND = {
  ScalarTypeExtension: "SCALAR",
  ObjectTypeExtension: "OBJECT",
  InterfaceTypeExtension: "INTERFACE",
  UnionTypeExtension: "UNION",
  EnumTypeExtension: "ENUM",
  InputObjectTypeExtension: "INPUT_OBJECT",
};

const inputValueOf = (node) => ({
  name: node.name.value,
  description: opt(node.description?.value),
  type: typeRefOf(node.type),
  default: node.defaultValue ? [valueOf(node.defaultValue)] : [],
  deprecated: deprecatedOf(node.directives),
});

const fieldOf = (f) => ({
  name: f.name.value,
  description: opt(f.description?.value),
  args: (f.arguments ?? []).map(inputValueOf),
  type: typeRefOf(f.type),
  deprecated: deprecatedOf(f.directives),
});

const enumValueOf = (v) => ({
  name: v.name.value,
  description: opt(v.description?.value),
  deprecated: deprecatedOf(v.directives),
});

// What a type definition and a type extension both have: fields, interfaces,
// member types, values and input fields.
const itemsOf = (def, kind) => ({
  fields: kind === "INPUT_OBJECT" ? [] : (def.fields ?? []).map(fieldOf),
  interfaces: (def.interfaces ?? []).map((i) => i.name.value),
  members: (def.types ?? []).map((t) => t.name.value),
  values: (def.values ?? []).map(enumValueOf),
  inputFields: kind === "INPUT_OBJECT" ? (def.fields ?? []).map(inputValueOf) : [],
});

const appliesOneOf = (def) => (def.directives ?? []).some((d) => d.name.value === "oneOf");

const isExtension = (def) => def.kind === "SchemaExtension" || def.kind === "DirectiveExtension" || def.kind in EXTENSION_KIND;

// A type system extension (§3.1) as TypeSystem.tla's extension record.
const extensionOf = (def) => {
  const none = { fields: [], interfaces: [], members: [], values: [], inputFields: [] };
  const common = { operations: [], oneOf: appliesOneOf(def), directives: appliedIn(def) };
  if (def.kind === "SchemaExtension") {
    const operations = (def.operationTypes ?? []).map((o) => ({ operation: o.operation, type: o.type.name.value }));
    return { kind: "SCHEMA", name: "", ...none, ...common, operations };
  }
  if (def.kind === "DirectiveExtension") return { kind: "DIRECTIVE", name: def.name.value, ...none, ...common };
  const kind = EXTENSION_KIND[def.kind];
  return { kind, name: def.name.value, ...itemsOf(def, kind), ...common };
};

// The definitions of a parsed document as schema data. A document with more
// than one schema definition keeps the last one: schemaVerdictData counts
// them for "a document must include at most one schema definition" (§3.3).
// Extensions are skipped when `extensions` is set (schemaVerdictData reads
// them), and are an error otherwise.
const definitionsOf = (doc, extensions = false) => {
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
        args: (def.arguments ?? []).map(inputValueOf),
        repeatable: def.repeatable,
        locations: def.locations.map((l) => l.value),
        deprecated: deprecatedOf(def.directives),
        directives: appliedIn(def),
      });
      continue;
    }
    if (extensions && isExtension(def)) continue;
    const kind = KIND[def.kind];
    if (!kind) throw new Error(`the kit's schemas don't use ${def.kind}`);
    const url = def.directives?.find((d) => d.name.value === "specifiedBy")?.arguments?.find((a) => a.name.value === "url");
    types.push({
      kind,
      name: def.name.value,
      description: opt(def.description?.value),
      ...itemsOf(def, kind),
      oneOf: appliesOneOf(def),
      specifiedBy: url?.value.kind === "StringValue" ? [url.value.value] : [],
      directives: appliedIn(def),
    });
  }
  return { description, types, directives, schemaDef, operations };
};

// An SDL document's type system definitions as TypeSystem.tla's schema
// data. It may not contain extensions.
export const schemaData = (sdl) => definitionsOf(graphql.parse(sdl));

// The DirectiveLocation of each kind of definition or extension a directive
// can be applied to in SDL (§3.13 TypeSystemDirectiveLocation).
const LOCATION = {
  SchemaDefinition: "SCHEMA",
  SchemaExtension: "SCHEMA",
  ScalarTypeDefinition: "SCALAR",
  ScalarTypeExtension: "SCALAR",
  ObjectTypeDefinition: "OBJECT",
  ObjectTypeExtension: "OBJECT",
  FieldDefinition: "FIELD_DEFINITION",
  InputValueDefinition: "ARGUMENT_DEFINITION",
  InterfaceTypeDefinition: "INTERFACE",
  InterfaceTypeExtension: "INTERFACE",
  UnionTypeDefinition: "UNION",
  UnionTypeExtension: "UNION",
  EnumTypeDefinition: "ENUM",
  EnumTypeExtension: "ENUM",
  EnumValueDefinition: "ENUM_VALUE",
  InputObjectTypeDefinition: "INPUT_OBJECT",
  InputObjectTypeExtension: "INPUT_OBJECT",
  DirectiveDefinition: "DIRECTIVE_DEFINITION",
  DirectiveExtension: "DIRECTIVE_DEFINITION",
};

// The element a top-level definition or extension applies its directives
// to, as TypeSystem.tla's site: a definition and its extensions share one.
const siteOf = (def) => {
  if (def.kind === "SchemaDefinition" || def.kind === "SchemaExtension") return ["SCHEMA", ""];
  if (def.kind === "DirectiveDefinition" || def.kind === "DirectiveExtension") return ["DIRECTIVE", def.name.value];
  return [KIND[def.kind] ?? EXTENSION_KIND[def.kind], def.name.value];
};

// Every directive the document applies, as [name, location, site,
// extension, args], in document order. An input value is an argument,
// except an input object's field. Every field, argument, enum value and
// input field is a site of its own. `extension` is k for a use applied to
// the k-th extension itself, else 0.
const usesOf = (doc) => {
  const uses = [];
  let element = 0;
  const visit = (node, site, extension, inputObject = false) => {
    const location = node.kind === "InputValueDefinition" && inputObject ? "INPUT_FIELD_DEFINITION" : LOCATION[node.kind];
    for (const d of node.directives ?? []) {
      const args = (d.arguments ?? []).map((a) => ({ name: a.name.value, value: valueOf(a.value) }));
      uses.push({ name: d.name.value, location, site, extension, args });
    }
    const own = node.kind === "InputObjectTypeDefinition" || node.kind === "InputObjectTypeExtension";
    const inner = (child, isInputField = false) => visit(child, ["ELEMENT", String(++element)], 0, isInputField);
    for (const f of node.fields ?? []) inner(f, own);
    for (const a of node.arguments ?? []) if (a.kind === "InputValueDefinition") inner(a);
    for (const v of node.values ?? []) inner(v);
  };
  let extensions = 0;
  for (const def of doc.definitions) visit(def, siteOf(def), isExtension(def) ? ++extensions : 0);
  return uses;
};

// schemaData with TypeSystem.tla's optional fields, for the schema area's
// verdicts: how many schema definitions the document has (§3.3, "at most
// one"), where and how it applies each directive (§3.13, "Directives must
// only be used in the locations they are declared to belong in"), and its
// type system extensions (§3.1), in document order. The introspect area
// keeps to schemaData, so its schemas aren't judged by these rules.
export const schemaVerdictData = (sdl) => {
  const doc = graphql.parse(sdl);
  return {
    ...definitionsOf(doc, true),
    schemaDefinitions: doc.definitions.filter((d) => d.kind === "SchemaDefinition").length,
    uses: usesOf(doc),
    extensions: doc.definitions.filter(isExtension).map(extensionOf),
  };
};

// Whether an SDL document has type system extensions: the schema area asks
// such a schema only of adapters that claim `schema-extensions`.
export const hasExtensions = (sdl) => graphql.parse(sdl).definitions.some(isExtension);

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
    const { status, output } = await runChecker(["-workers", "1", `${name}.tla`], { cwd: dir, stack: "large" });
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
