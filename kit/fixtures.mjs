// The execution fixtures, as the kit sends them to an adapter.
//
// Each fixtures/<id>.graphql holds a schema, one operation and its
// fragments. The kit splits it into SDL and an executable document, and
// turns graphql-js 17's @experimental_disableErrorPropagation into the
// `errorPropagation` flag, so an adapter for another implementation never
// sees a directive it doesn't know.

import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { Kind, buildASTSchema, parse, print } from "graphql17";

export const DISABLE_PROPAGATION = "experimental_disableErrorPropagation";

export const loadFixtures = (dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".graphql"))
    .sort()
    .map((file) => {
      const text = readFileSync(join(dir, file), "utf8");
      const parsed = parse(text);
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
      const header = (key) => text.match(new RegExp(`^# ${key}: (.*)$`, "m"))?.[1];
      const sdl = print({ kind: Kind.DOCUMENT, definitions: typeDefinitions });
      const operationType = operation.operation;
      const invalidResults = header("invalidResults") === "true";
      return {
        id: basename(file, ".graphql"),
        sdl,
        document: print({ kind: Kind.DOCUMENT, definitions: executable }),
        schema: buildASTSchema({ kind: Kind.DOCUMENT, definitions: typeDefinitions }),
        operationType,
        variables: JSON.parse(header("variables") ?? "{}"),
        maxListLength: Number(header("maxListLength") ?? 2),
        errorPropagation,
        invalidResults,
        // Capabilities an adapter must have to run the fixture at all.
        // invalidResults isn't one: without the capability, the kit just
        // never asks for a result of the wrong shape.
        requires: [
          ...(operationType === "query" ? [] : [operationType]),
          ...(errorPropagation ? [] : ["error-propagation-off"]),
        ],
      };
    });
