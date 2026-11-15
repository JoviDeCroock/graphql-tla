// Turns each fixtures/<id>.graphql (a schema plus one query and its
// fragments) into data the specs can read:
//
//   specs/lib/fixtures.ts  for the executor in specs/execution.ts
//   specs/Fixtures.tla     for the hand-written reference in specs/Reference.tla
//
// Both are generated from the same parsed document, so the executor and the
// reference agree on their input without sharing any code.
//
// A fixture's header comments may set:
//   # variables: { "name": true }   values for the operation's variables
//   # maxListLength: 2              the longest list a resolver may return
// and the kit reads `# invalidResults: true` and `# spec: 6.3.2, 3.8` (the
// sections a fixture exercises, for the conformance sheet).
//
// Usage: node scripts/generate-fixtures.mjs [--check]

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Kind,
  buildASTSchema,
  isInterfaceType,
  isObjectType,
  isScalarType,
  isUnionType,
  parse,
} from "graphql17";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const fixturesDir = join(root, "fixtures");

// ---------------------------------------------------------------------------
// Reading a fixture into plain data

const typeRef = (node) =>
  node.kind === Kind.NON_NULL_TYPE
    ? { ...typeRef(node.type), wrappers: ["nonNull", ...typeRef(node.type).wrappers] }
    : node.kind === Kind.LIST_TYPE
      ? { ...typeRef(node.type), wrappers: ["list", ...typeRef(node.type).wrappers] }
      : { name: node.name.value, wrappers: [] };

const ABSENT = { kind: "absent", value: false, variable: "" };

const directive = (node, name) => {
  const found = node.directives?.find((d) => d.name.value === name);
  if (!found) return ABSENT;
  const arg = found.arguments.find((a) => a.name.value === "if").value;
  return arg.kind === Kind.VARIABLE
    ? { kind: "variable", value: false, variable: arg.name.value }
    : { kind: "literal", value: arg.value, variable: "" };
};

const selections = (selectionSet) =>
  (selectionSet?.selections ?? []).map((node) => ({
    kind:
      node.kind === Kind.FIELD
        ? "field"
        : node.kind === Kind.INLINE_FRAGMENT
          ? "inlineFragment"
          : "fragmentSpread",
    name: node.kind === Kind.INLINE_FRAGMENT ? "" : node.name.value,
    alias: node.alias?.value ?? "",
    typeCondition: node.typeCondition?.name.value ?? "",
    skip: directive(node, "skip"),
    include: directive(node, "include"),
    selectionSet: selections(node.selectionSet),
  }));

const readFixture = (file) => {
  const text = readFileSync(join(fixturesDir, file), "utf8");
  const document = parse(text);
  const definitions = document.definitions.filter(
    (d) => d.kind !== Kind.OPERATION_DEFINITION && d.kind !== Kind.FRAGMENT_DEFINITION,
  );
  const schema = buildASTSchema({ kind: Kind.DOCUMENT, definitions });
  const operations = document.definitions.filter((d) => d.kind === Kind.OPERATION_DEFINITION);
  if (operations.length !== 1) throw new Error(`${file}: expected exactly one operation`);
  const operation = operations[0];

  const header = (key) => text.match(new RegExp(`^# ${key}: (.*)$`, "m"))?.[1];
  const variables = { ...JSON.parse(header("variables") ?? "{}") };
  for (const definition of operation.variableDefinitions ?? []) {
    const name = definition.variable.name.value;
    if (!(name in variables) && definition.defaultValue) {
      variables[name] = definition.defaultValue.value;
    }
    if (!(name in variables)) throw new Error(`${file}: no value for $${name}`);
  }

  const types = {};
  for (const type of Object.values(schema.getTypeMap())) {
    if (type.name.startsWith("__")) continue;
    if (!isObjectType(type) && !isInterfaceType(type) && !isUnionType(type) && !isScalarType(type)) {
      throw new Error(`${file}: ${type.name} is a kind of type the specs don't model`);
    }
    const fields = {};
    if (!isScalarType(type) && !isUnionType(type)) {
      for (const field of Object.values(type.getFields())) fields[field.name] = typeRef(field.astNode.type);
    }
    types[type.name] = {
      kind: isObjectType(type)
        ? "object"
        : isInterfaceType(type)
          ? "interface"
          : isUnionType(type)
            ? "union"
            : "scalar",
      fields,
      possibleTypes: isObjectType(type)
        ? [type.name]
        : isScalarType(type)
          ? []
          : schema.getPossibleTypes(type).map((t) => t.name).sort(),
    };
  }

  const fragments = {};
  for (const definition of document.definitions) {
    if (definition.kind !== Kind.FRAGMENT_DEFINITION) continue;
    fragments[definition.name.value] = {
      typeCondition: definition.typeCondition.name.value,
      selectionSet: selections(definition.selectionSet),
    };
  }

  return {
    id: basename(file, ".graphql"),
    data: {
      schema: {
        query: schema.getQueryType()?.name ?? "",
        mutation: schema.getMutationType()?.name ?? "",
        subscription: schema.getSubscriptionType()?.name ?? "",
        types,
      },
      operationType: operation.operation,
      operation: selections(operation.selectionSet),
      fragments,
      variables,
      maxListLength: Number(header("maxListLength") ?? 2),
      errorPropagation: !(operation.directives ?? []).some(
        (d) => d.name.value === "experimental_disableErrorPropagation",
      ),
      invalidResults: header("invalidResults") === "true",
    },
  };
};

// ---------------------------------------------------------------------------
// Printing: maps are JS objects, sets are arrays under `possibleTypes`.

const MAPS = new Set(["types", "fields", "fragments", "variables"]);
const SETS = new Set(["possibleTypes"]);
const pad = (depth) => "  ".repeat(depth);
// Small records with only simple values print on one line.
const isFlat = (value) =>
  Object.entries(value).every(
    ([k, v]) =>
      !MAPS.has(k) &&
      (typeof v !== "object" || (Array.isArray(v) && v.every((x) => typeof x !== "object"))),
  );

const toTs = (value, key, depth) => {
  if (MAPS.has(key)) {
    const valueType = { types: "TypeDef", fields: "TypeRef", fragments: "Fragment", variables: "boolean" }[key];
    const entries = Object.entries(value);
    if (entries.length === 0) return `new Map<string, ${valueType}>()`;
    return `new Map<string, ${valueType}>([\n${entries
      .map(([k, v]) => `${pad(depth + 1)}[${JSON.stringify(k)}, ${toTs(v, "", depth + 1)}],`)
      .join("\n")}\n${pad(depth)}])`;
  }
  if (SETS.has(key)) return `new Set<string>(${JSON.stringify(value)})`;
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.every((v) => typeof v !== "object")) return JSON.stringify(value);
    return `[\n${value.map((v) => `${pad(depth + 1)}${toTs(v, "", depth + 1)},`).join("\n")}\n${pad(depth)}]`;
  }
  if (typeof value === "object" && isFlat(value)) {
    return `{ ${Object.entries(value).map(([k, v]) => `${k}: ${toTs(v, k, depth)}`).join(", ")} }`;
  }
  if (typeof value === "object") {
    return `{\n${Object.entries(value)
      .map(([k, v]) => `${pad(depth + 1)}${k}: ${toTs(v, k, depth + 1)},`)
      .join("\n")}\n${pad(depth)}}`;
  }
  return JSON.stringify(value);
};

const toTla = (value, key, depth) => {
  if (MAPS.has(key)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return "<<>>";
    return `(\n${entries
      .map(([k, v]) => `${pad(depth + 1)}(${JSON.stringify(k)} :> ${toTla(v, "", depth + 1)})`)
      .join(" @@\n")}\n${pad(depth)})`;
  }
  if (SETS.has(key)) return `{${value.map((v) => JSON.stringify(v)).join(", ")}}`;
  if (Array.isArray(value)) {
    if (value.length === 0) return "<<>>";
    if (value.every((v) => typeof v !== "object")) return `<<${value.map((v) => toTla(v, "", depth)).join(", ")}>>`;
    return `<<\n${value.map((v) => `${pad(depth + 1)}${toTla(v, "", depth + 1)}`).join(",\n")}\n${pad(depth)}>>`;
  }
  if (typeof value === "object" && isFlat(value)) {
    return `[${Object.entries(value).map(([k, v]) => `${k} |-> ${toTla(v, k, depth)}`).join(", ")}]`;
  }
  if (typeof value === "object") {
    return `[\n${Object.entries(value)
      .map(([k, v]) => `${pad(depth + 1)}${k} |-> ${toTla(v, k, depth + 1)}`)
      .join(",\n")}\n${pad(depth)}]`;
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return JSON.stringify(value);
};

// ---------------------------------------------------------------------------

const fixtures = readdirSync(fixturesDir)
  .filter((f) => f.endsWith(".graphql"))
  .sort()
  .map(readFixture);

const note = "Generated by scripts/generate-fixtures.mjs from fixtures/*.graphql. Don't edit.";

const ts = `// ${note}
import type { Fixture, Fragment, TypeDef, TypeRef } from "./graphql";

export type FixtureId = ${fixtures.map((f) => JSON.stringify(f.id)).join(" | ")};

export const FIXTURES: Record<FixtureId, Fixture> = {
${fixtures.map((f) => `  ${f.id}: ${toTs(f.data, "", 1)},`).join("\n")}
};
`;

const tla = `\\* ${note}
---- MODULE Fixtures ----
EXTENDS TLC

Fixtures == [
${fixtures.map((f) => `  ${f.id} |-> ${toTla(f.data, "", 1)}`).join(",\n")}
]
====
`;

const outputs = [
  [join(root, "specs/lib/fixtures.ts"), ts],
  [join(root, "specs/Fixtures.tla"), tla],
];

if (process.argv.includes("--check")) {
  const stale = outputs.filter(([path, text]) => {
    try {
      return readFileSync(path, "utf8") !== text;
    } catch {
      return true;
    }
  });
  for (const [path] of stale) console.error(`${path} is out of date: run npm run fixtures`);
  process.exit(stale.length === 0 ? 0 : 1);
}
for (const [path, text] of outputs) writeFileSync(path, text);
console.log(`Wrote ${fixtures.length} fixtures: ${fixtures.map((f) => f.id).join(", ")}`);
