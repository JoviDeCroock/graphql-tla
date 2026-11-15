package main

// graphql-go has no buildSchema: a schema is a graph of Go values built with
// graphql.NewObject and friends. This file turns SDL, parsed with
// graphql-go's own parser, into that graph, one SDL element to one graphql-go
// config value:
//
//   - every type with its description: scalars, objects (with their
//     interfaces), interfaces, unions, enums and input objects;
//   - every field, argument, input field and enum value, with its type,
//     description and default value;
//   - `@deprecated` on a field or an enum value, as its DeprecationReason;
//   - with keepDirectives, every directive definition, with its
//     description, arguments and locations, beside graphql-go's
//     SpecifiedDirectives;
//   - the root types of a `schema` definition, or Query, Mutation and
//     Subscription by name when there is none.
//
// What graphql-go can't hold is refused (the schema isn't built) rather than
// dropped, so no verdict comes from a schema other than the SDL's:
//
//   - `@deprecated` on an argument, an input field or a directive, or with
//     the reason "" (graphql-go reads an empty DeprecationReason as "not
//     deprecated");
//   - `@specifiedBy` and `@oneOf`, which graphql-go doesn't know;
//   - a directive location graphql-go has no constant for
//     (VARIABLE_DEFINITION, DIRECTIVE_DEFINITION);
//   - type system extensions (graphql-go has no API to apply them).
//
// What graphql-go's own parser can't read (interfaces implementing
// interfaces, `repeatable`, a schema description, the literal `null`, other
// extensions) never gets this far: parser.Parse fails.
//
// Applied directives other than these have no representation in graphql-go
// (it keeps none on its types), as in graphql-js's buildSchema, which keeps
// none either, so they are left out.
//
// A default value is a literal in SDL and an internal value in graphql-go:
// it is converted with valueFromAST below, graphql-go's own literal
// coercion (values.go:351-413), which is unexported.

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

type buildOptions struct {
	resolve   graphql.FieldResolveFn // on every field; nil for graphql-go's default
	subscribe graphql.FieldResolveFn // on every root subscription field
	// keepDirectives declares the SDL's directive definitions
	// (custom-directives).
	keepDirectives bool
	// serialize is custom scalars' result coercion; identity when nil.
	serialize graphql.SerializeFn
}

// errUnsupported: the SDL holds something graphql-go can't express.
type errUnsupported struct{ what string }

func (e errUnsupported) Error() string { return "graphql-go can't express " + e.what }

// buildFailure carries an error out of the thunks graphql-go calls in
// NewSchema. Any other panic there is graphql-go's own, and goes on up: a
// crash, not a schema that doesn't build.
type buildFailure struct{ err error }

func fail(err error) { panic(buildFailure{err}) }

// The directive locations graphql-go has constants for (directives.go:5-24).
var goLocations = map[string]bool{
	graphql.DirectiveLocationQuery: true, graphql.DirectiveLocationMutation: true,
	graphql.DirectiveLocationSubscription: true, graphql.DirectiveLocationField: true,
	graphql.DirectiveLocationFragmentDefinition: true, graphql.DirectiveLocationFragmentSpread: true,
	graphql.DirectiveLocationInlineFragment: true, graphql.DirectiveLocationSchema: true,
	graphql.DirectiveLocationScalar: true, graphql.DirectiveLocationObject: true,
	graphql.DirectiveLocationFieldDefinition: true, graphql.DirectiveLocationArgumentDefinition: true,
	graphql.DirectiveLocationInterface: true, graphql.DirectiveLocationUnion: true,
	graphql.DirectiveLocationEnum: true, graphql.DirectiveLocationEnumValue: true,
	graphql.DirectiveLocationInputObject: true, graphql.DirectiveLocationInputFieldDefinition: true,
}

var builtinScalars = map[string]bool{"Int": true, "Float": true, "String": true, "Boolean": true, "ID": true}

func description(s *ast.StringValue) string {
	if s == nil {
		return ""
	}
	return s.Value
}

// checkDirectives refuses the applied directives graphql-go can't hold at
// this position, and returns the deprecation reason, if `deprecatable` and
// the element is deprecated.
func checkDirectives(where string, directives []*ast.Directive, deprecatable bool) (string, error) {
	reason := ""
	for _, d := range directives {
		switch d.Name.Value {
		case "deprecated":
			if !deprecatable {
				return "", errUnsupported{"@deprecated on " + where}
			}
			reason = graphql.DefaultDeprecationReason
			for _, a := range d.Arguments {
				if a.Name.Value == "reason" {
					s, ok := a.Value.(*ast.StringValue)
					if !ok {
						return "", errUnsupported{"a deprecation reason that isn't a string, on " + where}
					}
					if s.Value == "" {
						return "", errUnsupported{"an empty deprecation reason, on " + where}
					}
					reason = s.Value
				}
			}
		case "specifiedBy", "oneOf":
			return "", errUnsupported{"@" + d.Name.Value + " on " + where}
		}
	}
	return reason, nil
}

func buildSchema(sdl string, o buildOptions) (b *built, err error) {
	// The adapter's thunks report a problem by panicking with buildFailure.
	defer func() {
		if r := recover(); r != nil {
			f, ok := r.(buildFailure)
			if !ok {
				panic(r)
			}
			b, err = nil, f.err
		}
	}()
	doc, err := parser.Parse(parser.ParseParams{Source: sdl})
	if err != nil {
		return nil, err
	}
	serialize := o.serialize
	if serialize == nil {
		serialize = func(v any) any { return v }
	}
	b = &built{firstEnumValue: map[string]string{}}
	named := map[string]graphql.Type{
		"Int": graphql.Int, "Float": graphql.Float, "String": graphql.String,
		"Boolean": graphql.Boolean, "ID": graphql.ID,
	}
	objects := map[string]*graphql.Object{}
	interfaces := map[string]*graphql.Interface{}
	var roots map[string]string

	var typeOf func(t ast.Type) graphql.Type
	typeOf = func(t ast.Type) graphql.Type {
		switch t := t.(type) {
		case *ast.Named:
			if n, ok := named[t.Name.Value]; ok {
				return n
			}
			fail(fmt.Errorf("unknown type %s", t.Name.Value))
		case *ast.List:
			return graphql.NewList(typeOf(t.Type))
		case *ast.NonNull:
			return graphql.NewNonNull(typeOf(t.Type))
		}
		fail(fmt.Errorf("unsupported type reference %T", t))
		return nil
	}
	defaultOf := func(where string, d *ast.InputValueDefinition, typ graphql.Type) any {
		if d.DefaultValue == nil {
			return nil
		}
		v := valueFromAST(d.DefaultValue, typ.(graphql.Input))
		if v == nil {
			fail(fmt.Errorf("graphql-go can't coerce the default value of %s", where))
		}
		return v
	}
	// Field and argument types are looked up lazily, from thunks graphql-go
	// calls once every named type exists. An error there panics, and the
	// recover above turns it back into an error.
	args := func(owner string, defs []*ast.InputValueDefinition) graphql.FieldConfigArgument {
		r := graphql.FieldConfigArgument{}
		for _, d := range defs {
			where := owner + "(" + d.Name.Value + ":)"
			if _, err := checkDirectives("the argument "+where, d.Directives, false); err != nil {
				fail(err)
			}
			typ := typeOf(d.Type)
			r[d.Name.Value] = &graphql.ArgumentConfig{Type: typ.(graphql.Input), DefaultValue: defaultOf(where, d, typ), Description: description(d.Description)}
		}
		return r
	}
	fields := func(owner string, defs []*ast.FieldDefinition, sub bool) graphql.FieldsThunk {
		return func() graphql.Fields {
			r := graphql.Fields{}
			for _, d := range defs {
				where := owner + "." + d.Name.Value
				reason, err := checkDirectives("the field "+where, d.Directives, true)
				if err != nil {
					fail(err)
				}
				f := &graphql.Field{
					Type:              typeOf(d.Type).(graphql.Output),
					Args:              args(where, d.Arguments),
					Resolve:           o.resolve,
					Description:       description(d.Description),
					DeprecationReason: reason,
				}
				if sub {
					f.Subscribe = o.subscribe
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
	// list objects directly, then directives, whose arguments need every
	// input type.
	var objectDefs []*ast.ObjectDefinition
	var unionDefs []*ast.UnionDefinition
	var directiveDefs []*ast.DirectiveDefinition
	for _, def := range doc.Definitions {
		switch d := def.(type) {
		case *ast.SchemaDefinition:
			if _, err := checkDirectives("the schema", d.Directives, false); err != nil {
				return nil, err
			}
			roots = map[string]string{}
			for _, op := range d.OperationTypes {
				roots[op.Operation] = op.Type.Name.Value
			}
		case *ast.ScalarDefinition:
			if _, err := checkDirectives("the scalar "+d.Name.Value, d.Directives, false); err != nil {
				return nil, err
			}
			named[d.Name.Value] = graphql.NewScalar(graphql.ScalarConfig{
				Name:         d.Name.Value,
				Description:  description(d.Description),
				Serialize:    serialize,
				ParseValue:   func(v any) any { return v },
				ParseLiteral: func(v ast.Value) any { return literal(v) },
			})
		case *ast.EnumDefinition:
			if _, err := checkDirectives("the enum "+d.Name.Value, d.Directives, false); err != nil {
				return nil, err
			}
			values := graphql.EnumValueConfigMap{}
			for i, v := range d.Values {
				reason, err := checkDirectives("the enum value "+d.Name.Value+"."+v.Name.Value, v.Directives, true)
				if err != nil {
					return nil, err
				}
				values[v.Name.Value] = &graphql.EnumValueConfig{Value: v.Name.Value, Description: description(v.Description), DeprecationReason: reason}
				if i == 0 {
					b.firstEnumValue[d.Name.Value] = v.Name.Value
				}
			}
			named[d.Name.Value] = graphql.NewEnum(graphql.EnumConfig{Name: d.Name.Value, Values: values, Description: description(d.Description)})
		case *ast.InputObjectDefinition:
			if _, err := checkDirectives("the input object "+d.Name.Value, d.Directives, false); err != nil {
				return nil, err
			}
			name, defs := d.Name.Value, d.Fields
			named[d.Name.Value] = graphql.NewInputObject(graphql.InputObjectConfig{
				Name:        name,
				Description: description(d.Description),
				Fields: graphql.InputObjectConfigFieldMapThunk(func() graphql.InputObjectConfigFieldMap {
					r := graphql.InputObjectConfigFieldMap{}
					for _, f := range defs {
						where := name + "." + f.Name.Value
						if _, err := checkDirectives("the input field "+where, f.Directives, false); err != nil {
							fail(err)
						}
						typ := typeOf(f.Type)
						r[f.Name.Value] = &graphql.InputObjectFieldConfig{Type: typ.(graphql.Input), DefaultValue: defaultOf(where, f, typ), Description: description(f.Description)}
					}
					return r
				}),
			})
		case *ast.InterfaceDefinition:
			if _, err := checkDirectives("the interface "+d.Name.Value, d.Directives, false); err != nil {
				return nil, err
			}
			i := graphql.NewInterface(graphql.InterfaceConfig{
				Name:        d.Name.Value,
				Description: description(d.Description),
				Fields:      fields(d.Name.Value, d.Fields, false),
				ResolveType: resolveType,
			})
			interfaces[d.Name.Value] = i
			named[d.Name.Value] = i
		case *ast.ObjectDefinition:
			if _, err := checkDirectives("the type "+d.Name.Value, d.Directives, false); err != nil {
				return nil, err
			}
			objectDefs = append(objectDefs, d)
		case *ast.UnionDefinition:
			if _, err := checkDirectives("the union "+d.Name.Value, d.Directives, false); err != nil {
				return nil, err
			}
			unionDefs = append(unionDefs, d)
		case *ast.DirectiveDefinition:
			directiveDefs = append(directiveDefs, d)
		case *ast.TypeExtensionDefinition:
			return nil, errUnsupported{"a type extension"}
		default:
			return nil, fmt.Errorf("not a type system definition: %s", def.GetKind())
		}
	}
	if roots == nil {
		roots = map[string]string{"query": "Query", "mutation": "Mutation", "subscription": "Subscription"}
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
			Name:        d.Name.Value,
			Description: description(d.Description),
			Interfaces:  impl,
			Fields:      fields(d.Name.Value, d.Fields, d.Name.Value == roots["subscription"]),
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
		named[d.Name.Value] = graphql.NewUnion(graphql.UnionConfig{Name: d.Name.Value, Description: description(d.Description), Types: members, ResolveType: resolveType})
	}

	config := graphql.SchemaConfig{Query: objects[roots["query"]]}
	if config.Query == nil {
		return nil, fmt.Errorf("no query type %s", roots["query"])
	}
	if name, ok := roots["mutation"]; ok && objects[name] != nil {
		config.Mutation = objects[name]
	}
	if name, ok := roots["subscription"]; ok && objects[name] != nil {
		config.Subscription = objects[name]
	}
	// The SDL's own types only: a built-in scalar is in the schema when
	// something references it, as graphql-go decides (schema.go:81-100).
	for name, t := range named {
		if !builtinScalars[name] {
			config.Types = append(config.Types, t)
		}
	}
	if o.keepDirectives && len(directiveDefs) > 0 {
		config.Directives = append([]*graphql.Directive{}, graphql.SpecifiedDirectives...)
		for _, d := range directiveDefs {
			where := "@" + d.Name.Value
			var locations []string
			for _, l := range d.Locations {
				if !goLocations[l.Value] {
					return nil, errUnsupported{"the directive location " + l.Value + ", on " + where}
				}
				locations = append(locations, l.Value)
			}
			directive := graphql.NewDirective(graphql.DirectiveConfig{
				Name:        d.Name.Value,
				Description: description(d.Description),
				Locations:   locations,
				Args:        args(where, d.Arguments),
			})
			config.Directives = append(config.Directives, directive)
		}
	}
	b.schema, err = graphql.NewSchema(config)
	if err != nil {
		return nil, err
	}
	return b, nil
}

// valueFromAST is graphql-go's own literal coercion, valueFromAST
// (values.go:351-413, unexported), without variables: it turns a default
// value's literal into the internal value graphql-go keeps as DefaultValue,
// as a Go program building the same schema would write it.
func valueFromAST(valueAST ast.Value, ttype graphql.Input) any {
	if valueAST == nil {
		return nil
	}
	if _, ok := valueAST.(*ast.Variable); ok {
		return nil
	}
	switch ttype := ttype.(type) {
	case *graphql.NonNull:
		return valueFromAST(valueAST, ttype.OfType)
	case *graphql.List:
		values := []any{}
		if valueAST, ok := valueAST.(*ast.ListValue); ok {
			for _, itemAST := range valueAST.Values {
				values = append(values, valueFromAST(itemAST, ttype.OfType))
			}
			return values
		}
		return append(values, valueFromAST(valueAST, ttype.OfType))
	case *graphql.InputObject:
		ov, ok := valueAST.(*ast.ObjectValue)
		if !ok {
			return nil
		}
		fieldASTs := map[string]*ast.ObjectField{}
		for _, of := range ov.Fields {
			if of == nil || of.Name == nil {
				continue
			}
			fieldASTs[of.Name.Value] = of
		}
		obj := map[string]any{}
		for name, field := range ttype.Fields() {
			var value any
			if of, ok := fieldASTs[name]; ok {
				value = valueFromAST(of.Value, field.Type)
			} else {
				value = field.DefaultValue
			}
			if value != nil {
				obj[name] = value
			}
		}
		return obj
	case *graphql.Scalar:
		return ttype.ParseLiteral(valueAST)
	case *graphql.Enum:
		return ttype.ParseLiteral(valueAST)
	}
	return nil
}

// literal is the Go value of a literal, for custom scalars, which accept
// every literal (custom-scalar-literals).
func literal(v ast.Value) any {
	switch v := v.(type) {
	case nil:
		return nil
	case *ast.IntValue:
		if n, err := strconv.ParseInt(v.Value, 10, 64); err == nil {
			return int(n)
		}
		f, _ := strconv.ParseFloat(v.Value, 64)
		return f
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
