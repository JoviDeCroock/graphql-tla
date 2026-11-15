package main

// The areas beyond execution (docs/kit-areas.md): parse, introspect and
// coerce. Each answers one request with graphql-go's own parser, validator
// and executor, over a schema built from the request's SDL
// (schema.go).

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"sync"

	"github.com/graphql-go/graphql"
	"github.com/graphql-go/graphql/gqlerrors"
	"github.com/graphql-go/graphql/language/ast"
	"github.com/graphql-go/graphql/language/parser"
)

// areaCapabilities: the areas, and their own capabilities.
var areaCapabilities = []string{
	"parse", "parse-sdl",
	"introspect", "custom-directives",
	"coerce", "nested-fields", "subscription-source", "request-extensions",
}

// A schema for the areas, by SDL. graphql-go's default resolver everywhere
// (introspect needs none).
var areaSchemas = map[string]*builtOrError{}

type builtOrError struct {
	b   *built
	err error
}

func areaSchema(sdl string) (*built, error) {
	if s, ok := areaSchemas[sdl]; ok {
		return s.b, s.err
	}
	b, err := buildSchema(sdl, buildOptions{keepDirectives: true})
	areaSchemas[sdl] = &builtOrError{b, err}
	return b, err
}

// hasLoneSurrogate: does a JSON string, as written, hold an escape of an
// unpaired surrogate? encoding/json replaces one with U+FFFD, so the source
// graphql-go would get isn't the one the kit sent.
func hasLoneSurrogate(raw []byte) bool {
	hex := func(i int) (int, bool) {
		if i+6 > len(raw) || raw[i] != '\\' || raw[i+1] != 'u' {
			return 0, false
		}
		n, err := strconv.ParseUint(string(raw[i+2:i+6]), 16, 16)
		return int(n), err == nil
	}
	for i := 0; i < len(raw); i++ {
		if raw[i] != '\\' || i+1 >= len(raw) {
			continue
		}
		if raw[i+1] != 'u' {
			i++
			continue
		}
		c, ok := hex(i)
		if !ok {
			i++
			continue
		}
		switch {
		case c >= 0xD800 && c <= 0xDBFF:
			if low, ok := hex(i + 6); ok && low >= 0xDC00 && low <= 0xDFFF {
				i += 11
				continue
			}
			return true
		case c >= 0xDC00 && c <= 0xDFFF:
			return true
		}
		i += 5
	}
	return false
}

// parse (docs/kit/parse.md): graphql-go's parser reads every kind of
// definition, so the adapter parses, then checks the kinds the grammar
// allows.
func parseArea(m message) (map[string]any, error) {
	if hasLoneSurrogate(m.Source) {
		return map[string]any{"unsupported": "lone surrogate: Go's encoding/json replaces it with U+FFFD, so graphql-go would parse another source"}, nil
	}
	var source string
	if err := json.Unmarshal(m.Source, &source); err != nil {
		return nil, err
	}
	doc, err := parser.Parse(parser.ParseParams{Source: source})
	if err != nil {
		var syntax *gqlerrors.Error
		if errors.As(err, &syntax) {
			return map[string]any{"ok": false}, nil
		}
		return nil, err
	}
	executable := func(d ast.Node) bool {
		switch d.(type) {
		case *ast.OperationDefinition, *ast.FragmentDefinition:
			return true
		}
		return false
	}
	typeSystem := func(d ast.Node) bool {
		switch d.(type) {
		case *ast.SchemaDefinition, *ast.ScalarDefinition, *ast.ObjectDefinition, *ast.InterfaceDefinition,
			*ast.UnionDefinition, *ast.EnumDefinition, *ast.InputObjectDefinition, *ast.DirectiveDefinition:
			return true
		}
		return false
	}
	allowed := map[string]func(ast.Node) bool{
		"":           executable,
		"executable": executable,
		"typeSystem": typeSystem,
		"typeSystemExtension": func(d ast.Node) bool {
			_, extension := d.(*ast.TypeExtensionDefinition)
			return typeSystem(d) || extension
		},
		"document": func(ast.Node) bool { return true },
	}[m.Grammar]
	if allowed == nil {
		return nil, fmt.Errorf("unknown grammar %q", m.Grammar)
	}
	ok := true
	for _, d := range doc.Definitions {
		ok = ok && allowed(d)
	}
	return map[string]any{"ok": ok}, nil
}

// introspect (docs/kit/introspect.md): the query through graphql.Do, and
// its Result as encoding/json writes it. A schema graphql-go can't build
// is a request error.
func introspectArea(m message) (map[string]any, error) {
	b, err := areaSchema(m.SDL)
	if err != nil {
		return map[string]any{"response": map[string]any{"errors": []any{map[string]any{"message": "graphql-go can't build the schema: " + err.Error()}}}}, nil
	}
	result := graphql.Do(graphql.Params{Schema: b.schema, RequestString: m.Query})
	return map[string]any{"response": result}, nil
}

// coerce (docs/kit/coerce.md): the request through graphql.Do, which
// parses, validates and executes, with a resolver on every field that
// records its path and arguments. A subscription operation goes through
// graphql.Subscribe.

type coerceRequest struct {
	mu          sync.Mutex
	calls       []any
	sourceCalls []any
	subscribe   string
}

type coerceKey struct{}

var coerceSchemas = map[string]*builtOrError{}

func coerceSchema(sdl string) (*built, error) {
	if s, ok := coerceSchemas[sdl]; ok {
		return s.b, s.err
	}
	b, err := buildSchema(sdl, buildOptions{resolve: coerceResolve, subscribe: coerceSubscribe, keepDirectives: true})
	coerceSchemas[sdl] = &builtOrError{b, err}
	return b, err
}

// toJSON: arguments as JSON. Enum values are their names (the internal
// value schema.go gives each), and a non-finite float a string.
func toJSON(v any) any {
	switch v := v.(type) {
	case float64:
		if math.IsInf(v, 0) || math.IsNaN(v) {
			return fmt.Sprint(v)
		}
	case float32:
		return toJSON(float64(v))
	case map[string]any:
		r := map[string]any{}
		for k, x := range v {
			r[k] = toJSON(x)
		}
		return r
	case []any:
		r := make([]any, len(v))
		for i, x := range v {
			r[i] = toJSON(x)
		}
		return r
	}
	return v
}

// valueFor: what a resolver returns for its type: "ok" for a leaf, an
// object for an object type, two of them for a list of objects.
func valueFor(t graphql.Type) any {
	if nn, ok := t.(*graphql.NonNull); ok {
		t = nn.OfType
	}
	if l, ok := t.(*graphql.List); ok {
		item := valueFor(l.OfType)
		if _, ok := item.(map[string]any); ok {
			return []any{item, map[string]any{}}
		}
		return []any{item}
	}
	if _, ok := t.(*graphql.Object); ok {
		return map[string]any{}
	}
	return "ok"
}

func coerceResolve(p graphql.ResolveParams) (any, error) {
	r := p.Context.Value(coerceKey{}).(*coerceRequest)
	r.mu.Lock()
	r.calls = append(r.calls, map[string]any{"path": p.Info.Path.AsArray(), "arguments": toJSON(p.Args)})
	r.mu.Unlock()
	return valueFor(p.Info.ReturnType), nil
}

// The source stream resolver (subscription-source): records its call, then
// raises or returns a stream of one event.
func coerceSubscribe(p graphql.ResolveParams) (any, error) {
	r := p.Context.Value(coerceKey{}).(*coerceRequest)
	r.mu.Lock()
	r.sourceCalls = append(r.sourceCalls, map[string]any{"field": p.Info.FieldName, "arguments": toJSON(p.Args)})
	r.mu.Unlock()
	if r.subscribe == "raise" {
		return nil, errors.New("the source stream can't be established")
	}
	events := make(chan any, 1)
	events <- map[string]any{}
	close(events)
	return events, nil
}

// selectedOperation is the operation graphql-go would run, only to route a
// subscription to graphql.Subscribe; graphql-go selects it again itself.
func selectedOperation(document string, name *string) string {
	doc, err := parser.Parse(parser.ParseParams{Source: document})
	if err != nil {
		return ""
	}
	var ops []*ast.OperationDefinition
	for _, d := range doc.Definitions {
		if op, ok := d.(*ast.OperationDefinition); ok {
			if name == nil || (op.Name != nil && op.Name.Value == *name) {
				ops = append(ops, op)
			}
		}
	}
	if len(ops) != 1 {
		return ""
	}
	return ops[0].Operation
}

func coerceArea(m message) (map[string]any, error) {
	b, err := coerceSchema(m.Schema)
	if err != nil {
		return nil, fmt.Errorf("graphql-go can't build the schema: %w", err)
	}
	// The variables, as raw JSON text, read by encoding/json as a Go server
	// would (graphql-go/handler does): numbers become float64.
	var text string
	if err := json.Unmarshal(m.Variables, &text); err != nil {
		return nil, fmt.Errorf("variables aren't JSON text: %w", err)
	}
	var variables map[string]any
	if err := json.Unmarshal([]byte(text), &variables); err != nil {
		return nil, fmt.Errorf("can't read the variables: %w", err)
	}
	// graphql-go has no request extensions: read them, and drop them.
	if m.Extensions != nil {
		var extensions any
		if err := json.Unmarshal([]byte(*m.Extensions), &extensions); err != nil {
			return nil, fmt.Errorf("can't read the extensions: %w", err)
		}
	}
	r := &coerceRequest{calls: []any{}, sourceCalls: []any{}}
	ctx, cancel := context.WithCancel(context.WithValue(context.Background(), coerceKey{}, r))
	defer cancel()
	params := graphql.Params{Schema: b.schema, RequestString: m.Document, VariableValues: variables, Context: ctx}
	if m.OperationName != nil {
		params.OperationName = *m.OperationName
	}
	var result *graphql.Result
	if m.Subscribe != nil && selectedOperation(m.Document, m.OperationName) == ast.OperationTypeSubscription {
		r.subscribe = *m.Subscribe
		results := graphql.Subscribe(params)
		result = <-results
		cancel()
		go func() {
			for range results {
			}
		}()
		if result == nil {
			return nil, errors.New("graphql.Subscribe's result channel closed without a result")
		}
	} else {
		result = graphql.Do(params)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	answer := map[string]any{"response": result, "calls": r.calls}
	if m.Subscribe != nil {
		answer["sourceCalls"] = r.sourceCalls
	}
	return answer, nil
}

var areaTypes = map[string]bool{"parse": true, "introspect": true, "coerce": true}

func jsonUnmarshal(b []byte, v any) error { return json.Unmarshal(b, v) }

// area answers a request of an area, or says it isn't one. A panic is a
// crash: an `error`, never a verdict.
func area(m message) (handled bool) {
	handlers := map[string]func(message) (map[string]any, error){
		"parse": parseArea, "introspect": introspectArea, "coerce": coerceArea,
	}
	h, ok := handlers[m.Type]
	if !ok {
		return false
	}
	result, err := func() (r map[string]any, err error) {
		defer func() {
			if p := recover(); p != nil {
				err = fmt.Errorf("panic: %v", p)
			}
		}()
		return h(m)
	}()
	if err != nil {
		send(map[string]any{"type": "error", "id": m.ID, "message": err.Error()})
		return true
	}
	result["type"] = "result"
	result["id"] = m.ID
	send(result)
	return true
}
