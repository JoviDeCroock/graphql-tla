// What the fixture says about a response position, without trusting the
// adapter: the field's declared type, found by walking the operation along
// a path, and whether each segment is a field or a list index. Runtime types
// for abstract positions come from the kit's own object outcomes.

import * as graphql from "graphql17";

const nullable = (type) => (graphql.isNonNullType(type) ? type.ofType : type);
const key = (path) => path.join("\u0000");

export const positions = (fixture, trace) => {
  const { schema } = fixture;
  const document = graphql.parse(fixture.document);
  const operation = document.definitions.find((d) => d.kind === graphql.Kind.OPERATION_DEFINITION);
  const fragments = new Map(
    document.definitions
      .filter((d) => d.kind === graphql.Kind.FRAGMENT_DEFINITION)
      .map((d) => [d.name.value, d]),
  );
  const runtime = new Map();
  for (const event of trace) {
    if (event.settle && event.outcome?.kind === "object") runtime.set(key(event.settle.map(String)), event.outcome.type);
  }
  const rootType =
    fixture.operationType === "query"
      ? schema.getQueryType()
      : fixture.operationType === "mutation"
        ? schema.getMutationType()
        : schema.getSubscriptionType();

  // §6.3.2 CollectFields skips a selection whose @skip(if:) is true or whose
  // @include(if:) is false, with variables from the fixture or their defaults.
  const defaults = Object.fromEntries(
    (operation.variableDefinitions ?? [])
      .filter((v) => v.defaultValue)
      .map((v) => [v.variable.name.value, graphql.valueFromASTUntyped(v.defaultValue)]),
  );
  const argument = (directive) => {
    const value = directive.arguments?.find((a) => a.name.value === "if")?.value;
    if (!value) return undefined;
    if (value.kind === graphql.Kind.VARIABLE) return { ...defaults, ...fixture.variables }[value.name.value];
    return graphql.valueFromASTUntyped(value);
  };
  const included = (node) =>
    (node.directives ?? []).every((d) =>
      d.name.value === "skip" ? argument(d) !== true : d.name.value === "include" ? argument(d) === true : true,
    );

  const applies = (objectType, condition) => {
    if (!condition) return true;
    const type = schema.getType(condition.name.value);
    return type === objectType || (graphql.isAbstractType(type) && schema.isSubType(type, objectType));
  };

  // The field nodes with response key `responseKey` in these selection sets,
  // for an object of type objectType.
  const fieldsFor = (objectType, selectionSets, responseKey, seen = new Set()) =>
    selectionSets.flatMap((set) =>
      set.selections.flatMap((s) => {
        if (!included(s)) return [];
        if (s.kind === graphql.Kind.FIELD) return (s.alias ?? s.name).value === responseKey ? [s] : [];
        if (s.kind === graphql.Kind.INLINE_FRAGMENT) {
          return applies(objectType, s.typeCondition) ? fieldsFor(objectType, [s.selectionSet], responseKey, seen) : [];
        }
        const fragment = fragments.get(s.name.value);
        if (!fragment || seen.has(s.name.value) || !applies(objectType, fragment.typeCondition)) return [];
        return fieldsFor(objectType, [fragment.selectionSet], responseKey, new Set([...seen, s.name.value]));
      }),
    );

  // { type, kinds } for a path, or null if the operation doesn't select it.
  // kinds[i] is "field" or "index"; __typename has type String!.
  return (path) => {
    let objectType = rootType;
    let sets = [operation.selectionSet];
    let type = null;
    const kinds = [];
    for (let i = 0; i < path.length; i++) {
      if (type && graphql.isListType(nullable(type))) {
        kinds.push("index");
        type = nullable(type).ofType;
        continue;
      }
      if (type) {
        const named = graphql.getNamedType(type);
        if (graphql.isLeafType(named)) return null;
        objectType = graphql.isAbstractType(named) ? schema.getType(runtime.get(key(path.slice(0, i).map(String))) ?? "") : named;
        if (!graphql.isObjectType(objectType)) return null;
      }
      const nodes = fieldsFor(objectType, sets, String(path[i]));
      if (nodes.length === 0) return null;
      const name = nodes[0].name.value;
      kinds.push("field");
      if (name === "__typename") {
        type = new graphql.GraphQLNonNull(graphql.GraphQLString);
        sets = [];
        continue;
      }
      const field = objectType.getFields()[name];
      if (!field) return null;
      type = field.type;
      sets = nodes.map((n) => n.selectionSet).filter(Boolean);
    }
    return { type, kinds };
  };
};
