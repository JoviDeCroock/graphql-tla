// The execution fixtures, as the kit sends them to an adapter.
//
// Each fixtures/<id>.graphql holds a schema, one operation and its
// fragments. The kit splits it into SDL and an executable document, and
// turns graphql-js 17's @experimental_disableErrorPropagation into the
// `errorPropagation` flag, so an adapter for another implementation never
// sees a directive it doesn't know.
//
// A fixture may use fragment arguments (graphql-spec#1081: variables on a
// fragment definition, arguments on a fragment spread), which no release
// has. The files are parsed with graphql-js 17's experimental support for
// that syntax, and such a fixture requires the `fragment-arguments`
// capability, so an adapter whose implementation can't parse it never sees
// it.
//
// A file with a `# variants:` header is several fixtures: one per variant,
// with the same schema and document and its own variable values. An
// adapter sees each as an ordinary fixture with its own id.

import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { Kind, buildASTSchema, parse, print, visit } from "graphql17";

export const DISABLE_PROPAGATION = "experimental_disableErrorPropagation";

// How every fixture file, and every fixture's document, is parsed.
export const PARSE_OPTIONS = { experimentalFragmentArguments: true };

// The capability a fixture that uses fragment arguments requires.
export const FRAGMENT_ARGUMENTS = "fragment-arguments";

// Whether an executable definition uses the fragment arguments proposal.
const usesFragmentArguments = (definition) => {
  let found = false;
  visit(definition, {
    FragmentDefinition: (node) => void (found ||= (node.variableDefinitions ?? []).length > 0),
    FragmentSpread: (node) => void (found ||= (node.arguments ?? []).length > 0),
  });
  return found;
};

const headerOf = (text) => (key) => text.match(new RegExp(`^# ${key}: (.*)$`, "m"))?.[1];

// The fixtures one file stands for: [{ id, variables }]. Without a
// `# variants:` header, the file itself, with its `# variables:`. With
// `# variants: { "on": { "x": true }, "off": { "x": false } }`, one fixture
// per entry, named <file>_<variant>, whose variables are the entry's values
// over `# variables:`. Variant names are letters and digits, so every id is
// a TLA+ record field (specs/Fixtures.tla) and a TypeScript property.
export const fixtureVariants = (base, text) => {
  const header = headerOf(text);
  const variables = JSON.parse(header("variables") ?? "{}");
  const variants = header("variants");
  if (variants === undefined) return [{ id: base, variables }];
  const entries = Object.entries(JSON.parse(variants));
  if (entries.length === 0) throw new Error(`${base}: # variants: is empty`);
  return entries.map(([name, values]) => {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) throw new Error(`${base}: variant name ${JSON.stringify(name)} isn't letters and digits`);
    return { id: `${base}_${name}`, variables: { ...variables, ...values } };
  });
};

export const loadFixtures = (dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".graphql"))
    .sort()
    .flatMap((file) => {
      const text = readFileSync(join(dir, file), "utf8");
      const parsed = parse(text, PARSE_OPTIONS);
      const isExecutable = (d) =>
        d.kind === Kind.OPERATION_DEFINITION || d.kind === Kind.FRAGMENT_DEFINITION;
      const typeDefinitions = parsed.definitions.filter((d) => !isExecutable(d));
      const operation = parsed.definitions.find((d) => d.kind === Kind.OPERATION_DEFINITION);
      const errorPropagation = !operation.directives?.some((d) => d.name.value === DISABLE_PROPAGATION);
      const executable = parsed.definitions.filter(isExecutable).map((d) =>
        d.kind === Kind.OPERATION_DEFINITION
          ? { ...d, directives: (d.directives ?? []).filter((x) => x.name.value !== DISABLE_PROPAGATION) }
          : d,
      );
      const header = headerOf(text);
      const sdl = print({ kind: Kind.DOCUMENT, definitions: typeDefinitions });
      const operationType = operation.operation;
      const invalidResults = header("invalidResults") === "true";
      const fragmentArguments = executable.some(usesFragmentArguments);
      return fixtureVariants(basename(file, ".graphql"), text).map(({ id, variables }) => ({
        id,
        sdl,
        document: print({ kind: Kind.DOCUMENT, definitions: executable }),
        schema: buildASTSchema({ kind: Kind.DOCUMENT, definitions: typeDefinitions }),
        operationType,
        variables,
        maxListLength: Number(header("maxListLength") ?? 2),
        errorPropagation,
        invalidResults,
        // The spec sections the fixture exercises, for the conformance sheet.
        spec: (header("spec") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        // Capabilities an adapter must have to run the fixture at all.
        // invalidResults isn't one: without the capability, the kit just
        // never asks for a result of the wrong shape.
        requires: [
          ...(operationType === "query" ? [] : [operationType]),
          ...(errorPropagation ? [] : ["error-propagation-off"]),
          ...(fragmentArguments ? [FRAGMENT_ARGUMENTS] : []),
        ],
      }));
    });
