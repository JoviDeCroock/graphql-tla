package main

// graphql-go has no buildSchema: a schema is a graph of Go values built with
// graphql.NewObject and friends. This file turns SDL, parsed with
// graphql-go's own parser, into that graph, and puts the adapter's resolver on
// every field.

import (
	"fmt"
	"strconv"

	"github.com/graphql-go/graphql"
	"github.com/graphql-go/graphql/language/ast"
	"github.com/graphql-go/graphql/language/parser"
)

// built is a schema plus what the resolver needs to know about it.
type built struct {
	schema graphql.Schema
	// The first value of each enum in SDL order. graphql-go keeps enum values
	// in a Go map, so Enum.Values() has no stable order.
	firstEnumValue map[string]string
}

func buildSchema(sdl string, resolve, subscribe graphql.FieldResolveFn) (*built, error) {
	doc, err := parser.Parse(parser.ParseParams{Source: sdl})
	if err != nil {
		return nil, err
	}
	b := &built{firstEnumValue: map[string]string{}}
	named := map[string]graphql.Type{
		"Int": graphql.Int, "Float": graphql.Float, "String": graphql.String,
		"Boolean": graphql.Boolean, "ID": graphql.ID,
	}
	objects := map[string]*graphql.Object{}
	interfaces := map[string]*graphql.Interface{}
	roots := map[string]string{"query": "Query", "mutation": "Mutation", "subscription": "Subscription"}

	var typeOf func(t ast.Type) (graphql.Type, error)
	typeOf = func(t ast.Type) (graphql.Type, error) {
		switch t := t.(type) {
		case *ast.Named:
			if n, ok := named[t.Name.Value]; ok {
				return n, nil
			}
			return nil, fmt.Errorf("unknown type %s", t.Name.Value)
		case *ast.List:
			inner, err := typeOf(t.Type)
			if err != nil {
				return nil, err
			}
			return graphql.NewList(inner), nil
		case *ast.NonNull:
			inner, err := typeOf(t.Type)
			if err != nil {
				return nil, err
			}
			return graphql.NewNonNull(inner), nil
		}
		return nil, fmt.Errorf("unsupported type reference %T", t)
	}
	// Field and argument types are looked up lazily, from thunks graphql-go
	// calls once every named type exists. An error there panics, and
	// buildSchema turns the panic back into an error.
	mustType := func(t ast.Type) graphql.Type {
		r, err := typeOf(t)
		if err != nil {
			panic(err)
		}
		return r
	}
	args := func(defs []*ast.InputValueDefinition) graphql.FieldConfigArgument {
		r := graphql.FieldConfigArgument{}
		for _, d := range defs {
			r[d.Name.Value] = &graphql.ArgumentConfig{Type: mustType(d.Type), DefaultValue: literal(d.DefaultValue)}
		}
		return r
	}
	fields := func(defs []*ast.FieldDefinition, sub bool) graphql.FieldsThunk {
		return func() graphql.Fields {
			r := graphql.Fields{}
			for _, d := range defs {
				f := &graphql.Field{Type: mustType(d.Type), Args: args(d.Arguments), Resolve: resolve}
				if sub {
					f.Subscribe = subscribe
				}
				r[d.Name.Value] = f
			}
			return r
		}
	}
	resolveType := func(p graphql.ResolveTypeParams) *graphql.Object {
		if m, ok := p.Value.(map[string]any); ok {
			if name, ok := m["__typename"].(string); ok {
				return objects[name]
			}
		}
		return nil
	}

	// Leaf, input and interface types first, then objects, then unions, which
	// list objects directly.
	var objectDefs []*ast.ObjectDefinition
	var unionDefs []*ast.UnionDefinition
	for _, def := range doc.Definitions {
		switch d := def.(type) {
		case *ast.SchemaDefinition:
			for _, op := range d.OperationTypes {
				roots[op.Operation] = op.Type.Name.Value
			}
		case *ast.ScalarDefinition:
			named[d.Name.Value] = graphql.NewScalar(graphql.ScalarConfig{
				Name:         d.Name.Value,
				Serialize:    func(v any) any { return v },
				ParseValue:   func(v any) any { return v },
				ParseLiteral: func(v ast.Value) any { return literal(v) },
			})
		case *ast.EnumDefinition:
			values := graphql.EnumValueConfigMap{}
			for i, v := range d.Values {
				values[v.Name.Value] = &graphql.EnumValueConfig{Value: v.Name.Value}
				if i == 0 {
					b.firstEnumValue[d.Name.Value] = v.Name.Value
				}
			}
			named[d.Name.Value] = graphql.NewEnum(graphql.EnumConfig{Name: d.Name.Value, Values: values})
		case *ast.InputObjectDefinition:
			defs := d.Fields
			named[d.Name.Value] = graphql.NewInputObject(graphql.InputObjectConfig{
				Name: d.Name.Value,
				Fields: graphql.InputObjectConfigFieldMapThunk(func() graphql.InputObjectConfigFieldMap {
					r := graphql.InputObjectConfigFieldMap{}
					for _, f := range defs {
						r[f.Name.Value] = &graphql.InputObjectFieldConfig{Type: mustType(f.Type), DefaultValue: literal(f.DefaultValue)}
					}
					return r
				}),
			})
		case *ast.InterfaceDefinition:
			i := graphql.NewInterface(graphql.InterfaceConfig{
				Name:        d.Name.Value,
				Fields:      fields(d.Fields, false),
				ResolveType: resolveType,
			})
			interfaces[d.Name.Value] = i
			named[d.Name.Value] = i
		case *ast.ObjectDefinition:
			objectDefs = append(objectDefs, d)
		case *ast.UnionDefinition:
			unionDefs = append(unionDefs, d)
		default:
			return nil, fmt.Errorf("unsupported definition %T", def)
		}
	}
	for _, d := range objectDefs {
		var impl []*graphql.Interface
		for _, n := range d.Interfaces {
			i, ok := interfaces[n.Name.Value]
			if !ok {
				return nil, fmt.Errorf("%s implements unknown interface %s", d.Name.Value, n.Name.Value)
			}
			impl = append(impl, i)
		}
		o := graphql.NewObject(graphql.ObjectConfig{
			Name:       d.Name.Value,
			Interfaces: impl,
			Fields:     fields(d.Fields, d.Name.Value == roots["subscription"]),
		})
		objects[d.Name.Value] = o
		named[d.Name.Value] = o
	}
	for _, d := range unionDefs {
		var members []*graphql.Object
		for _, n := range d.Types {
			o, ok := objects[n.Name.Value]
			if !ok {
				return nil, fmt.Errorf("union %s has unknown member %s", d.Name.Value, n.Name.Value)
			}
			members = append(members, o)
		}
		named[d.Name.Value] = graphql.NewUnion(graphql.UnionConfig{Name: d.Name.Value, Types: members, ResolveType: resolveType})
	}

	config := graphql.SchemaConfig{Query: objects[roots["query"]]}
	if o, ok := objects[roots["mutation"]]; ok {
		config.Mutation = o
	}
	if o, ok := objects[roots["subscription"]]; ok {
		config.Subscription = o
	}
	for _, t := range named {
		config.Types = append(config.Types, t)
	}
	if config.Query == nil {
		return nil, fmt.Errorf("no query type %s", roots["query"])
	}
	b.schema, err = newSchema(config)
	if err != nil {
		return nil, err
	}
	return b, nil
}

// newSchema recovers from a panic in a fields thunk (an unknown type).
func newSchema(config graphql.SchemaConfig) (s graphql.Schema, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("%v", r)
		}
	}()
	return graphql.NewSchema(config)
}

// literal is the Go value of a default value in SDL.
func literal(v ast.Value) any {
	switch v := v.(type) {
	case nil:
		return nil
	case *ast.IntValue:
		n, _ := strconv.Atoi(v.Value)
		return n
	case *ast.FloatValue:
		f, _ := strconv.ParseFloat(v.Value, 64)
		return f
	case *ast.StringValue:
		return v.Value
	case *ast.BooleanValue:
		return v.Value
	case *ast.EnumValue:
		return v.Value
	case *ast.ListValue:
		r := []any{}
		for _, item := range v.Values {
			r = append(r, literal(item))
		}
		return r
	case *ast.ObjectValue:
		r := map[string]any{}
		for _, f := range v.Fields {
			r[f.Name.Value] = literal(f.Value)
		}
		return r
	}
	return nil
}
