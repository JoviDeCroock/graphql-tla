// What the fixture says about a response position, without trusting the
// adapter: the field's declared type, found by walking the operation along
// a path, and whether each segment is a field or a list index. Runtime types
// for abstract positions come from the kit's own object outcomes.
//
// A fixture may use fragment arguments (graphql-spec#1081, a proposal and
// not part of any release). Then the variables a selection reads depend on
// where it is: inside a fragment definition, the fragment's own variables
// come first, with the values the spread gave them. So every field node is
// kept with its scope, as the proposal's field details are.

import * as graphql from "graphql17";
import { PARSE_OPTIONS } from "../fixtures.mjs";

const nullable = (type) => (graphql.isNonNullType(type) ? type.ofType : type);
const key = (path) => path.join("\u0000");

export const positions = (fixture, trace) => {
  const { schema } = fixture;
  const document = graphql.parse(fixture.document, PARSE_OPTIONS);
  const operation = document.definitions.find((d) => d.kind === graphql.Kind.OPERATION_DEFINITION);
  const fragments = new Map(
    document.definitions
      .filter((d) => d.kind === graphql.Kind.FRAGMENT_DEFINITION)
      .map((d) => [d.name.value, d]),
  );
  const runtime = new Map();
  for (const event of trace) {
    if (Array.isArray(event.settle) && event.outcome?.kind === "object") runtime.set(key(event.settle.map(String)), event.outcome.type);
  }
  const rootType =
    fixture.operationType === "query"
      ? schema.getQueryType()
      : fixture.operationType === "mutation"
        ? schema.getMutationType()
        : schema.getSubscriptionType();

  // The operation's variable values: the fixture's, or their defaults.
  const operationValues = {
    ...Object.fromEntries(
      (operation.variableDefinitions ?? [])
        .filter((v) => v.defaultValue)
        .map((v) => [v.variable.name.value, graphql.valueFromASTUntyped(v.defaultValue)]),
    ),
    ...fixture.variables,
  };

  // The variables in scope for a selection: the names the enclosing
  // fragment definition defines, and the values its spread gave them. A
  // defined variable may have no value. The operation's own selections, and
  // a fragment without variables, define none.
  const OPERATION = { defined: new Set(), values: new Map() };
  // The proposal's GetScopedVariableValues: a fragment's variable hides the
  // operation's variable of the same name, even when it has no value.
  const lookup = (scope, name) =>
    scope.defined.has(name)
      ? { has: scope.values.has(name), value: scope.values.get(name) }
      : { has: name in operationValues, value: operationValues[name] };
  const scopedValues = (scope) => {
    const values = { ...operationValues };
    for (const name of scope.defined) {
      delete values[name];
      if (scope.values.has(name)) values[name] = scope.values.get(name);
    }
    return values;
  };

  // §6.3.2 CollectFields skips a selection whose @skip(if:) is true or whose
  // @include(if:) is false, with the variables in scope.
  const argument = (directive, scope) => {
    const value = directive.arguments?.find((a) => a.name.value === "if")?.value;
    if (!value) return undefined;
    if (value.kind === graphql.Kind.VARIABLE) return lookup(scope, value.name.value).value;
    return graphql.valueFromASTUntyped(value);
  };
  const included = (node, scope) =>
    (node.directives ?? []).every((d) =>
      d.name.value === "skip" ? argument(d, scope) !== true : d.name.value === "include" ? argument(d, scope) === true : true,
    );

  const applies = (objectType, condition) => {
    if (!condition) return true;
    const type = schema.getType(condition.name.value);
    return type === objectType || (graphql.isAbstractType(type) && schema.isSubType(type, objectType));
  };

  // The scope inside `fragment` when `spread`, itself in `scope`, spreads
  // it: §6.4.1 CoerceArgumentValues over the fragment's variable definitions,
  // as the proposal's CollectFields does. null if a Non-Null variable gets
  // null or no value, which raises an execution error. A fixture is a valid
  // document, so a literal is of its variable's type and nothing else can
  // fail.
  const bind = (fragment, spread, scope) => {
    const definitions = fragment.variableDefinitions ?? [];
    const values = new Map();
    for (const definition of definitions) {
      const name = definition.variable.name.value;
      const given = (spread.arguments ?? []).find((a) => a.name.value === name)?.value;
      const { has, value } = !given
        ? { has: false, value: undefined }
        : given.kind === graphql.Kind.VARIABLE
          ? lookup(scope, given.name.value)
          : { has: true, value: graphql.valueFromASTUntyped(given, scopedValues(scope)) };
      if (!has && definition.defaultValue) values.set(name, graphql.valueFromASTUntyped(definition.defaultValue));
      else if (definition.type.kind === graphql.Kind.NON_NULL_TYPE && (!has || value === null)) return null;
      else if (has) values.set(name, value);
    }
    return { defined: new Set(definitions.map((d) => d.variable.name.value)), values };
  };

  // §6.3.2 CollectFields for one selection set of an object of type
  // objectType: adds { node, scope } to `groups` under each response key.
  // false if a spread's arguments can't be coerced. A spread's arguments are
  // coerced after its directives, the visited check and its type condition.
  const collectInto = (groups, objectType, selectionSet, scope, visited) => {
    for (const s of selectionSet.selections) {
      if (!included(s, scope)) continue;
      if (s.kind === graphql.Kind.FIELD) {
        const responseKey = (s.alias ?? s.name).value;
        groups.set(responseKey, [...(groups.get(responseKey) ?? []), { node: s, scope }]);
      } else if (s.kind === graphql.Kind.INLINE_FRAGMENT) {
        if (applies(objectType, s.typeCondition) && !collectInto(groups, objectType, s.selectionSet, scope, visited)) return false;
      } else {
        if (visited.has(s.name.value)) continue;
        visited.add(s.name.value);
        const fragment = fragments.get(s.name.value);
        if (!fragment || !applies(objectType, fragment.typeCondition)) continue;
        const inner = bind(fragment, s, scope);
        if (!inner || !collectInto(groups, objectType, fragment.selectionSet, inner, visited)) return false;
      }
    }
    return true;
  };

  // The fields of an object of type objectType, from these selection sets,
  // each with its scope: the root selection set, or the selection sets of a
  // field's nodes (§6.3.2 CollectSubfields, each collected with visited
  // fragments of its own). null if collecting them raises: then the object
  // has no fields, and the error is at its own position.
  const collect = (objectType, sources) => {
    const groups = new Map();
    for (const { selectionSet, scope } of sources) {
      if (!collectInto(groups, objectType, selectionSet, scope, new Set())) return null;
    }
    return groups;
  };

  // { type, kinds, names, nodes } for a path, or null if the operation
  // doesn't select it. kinds[i] is "field" or "index"; names[i] is the
  // field's name where the segment is a response name (an alias, say), and
  // the segment itself otherwise. nodes are the field nodes of the path's
  // last field segment (several when selections merge), whose `loc` is in
  // the fixture's document as the kit sends it. __typename has type String!.
  return (path) => {
    let objectType = rootType;
    let sources = [{ selectionSet: operation.selectionSet, scope: OPERATION }];
    let type = null;
    let fieldNodes = [];
    const kinds = [];
    const names = [];
    for (let i = 0; i < path.length; i++) {
      if (type && graphql.isListType(nullable(type))) {
        kinds.push("index");
        names.push(String(path[i]));
        type = nullable(type).ofType;
        continue;
      }
      if (type) {
        const named = graphql.getNamedType(type);
        if (graphql.isLeafType(named)) return null;
        objectType = graphql.isAbstractType(named) ? schema.getType(runtime.get(key(path.slice(0, i).map(String))) ?? "") : named;
        if (!graphql.isObjectType(objectType)) return null;
      }
      const details = collect(objectType, sources)?.get(String(path[i])) ?? [];
      if (details.length === 0) return null;
      const nodes = details.map((d) => d.node);
      const name = nodes[0].name.value;
      fieldNodes = nodes;
      kinds.push("field");
      names.push(name);
      if (name === "__typename") {
        type = new graphql.GraphQLNonNull(graphql.GraphQLString);
        sources = [];
        continue;
      }
      const field = objectType.getFields()[name];
      if (!field) return null;
      type = field.type;
      sources = details.filter((d) => d.node.selectionSet).map((d) => ({ selectionSet: d.node.selectionSet, scope: d.scope }));
    }
    return { type, kinds, names, nodes: fieldNodes };
  };
};

// Where a node starts in the document it was parsed from, as §7.1.6
// locations give it: { line, column }, both from 1.
export const startOf = (node) => {
  const { line, column } = graphql.getLocation(node.loc.source, node.loc.start);
  return { line, column };
};
