// A graphql-tla adapter for graphql-go, github.com/graphql-go/graphql
// (docs/conformance.md).
//
// Every field gets one resolver, which tells the kit it was called and
// returns a thunk, func() (interface{}, error). graphql-go collects the
// thunks of a selection set and calls them later, one at a time, so many
// resolvers are pending at once. A thunk blocks until the kit settles its
// call.
//
// Usage: adapter [--sync]
//
// --sync makes the resolver block until its call settles and return the
// value instead of a thunk, so one resolver is pending at a time and list
// items come inline. That is graphql-go without its concurrency.
//
// With parent-values, the root value, the subscription's events and every
// object a resolver returns carry the kit's token, and each field's call
// reports the token of the value it was called on. With subscription-stream,
// the source stream is a channel the kit's `source` messages feed (stream.go).
//
// graphql-go passes a non-finite Float through to its result, which
// encoding/json then can't serialize, so the client gets no response. The
// adapter says so with `no-response` (see README.md).
package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"runtime/debug"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/graphql-go/graphql"
)

type outcome struct {
	Kind   string          `json:"kind"`
	Type   string          `json:"type"`
	Length int             `json:"length"`
	Items  []outcome       `json:"items"`
	Token  *string         `json:"token"`
	Value  json.RawMessage `json:"value"`
}

type message struct {
	Type          string `json:"type"`
	ID            int    `json:"id"`
	Schema        string `json:"schema"`
	Document      string `json:"document"`
	OperationType string `json:"operationType"`
	// An object for execute, JSON text for coerce.
	Variables        json.RawMessage `json:"variables"`
	ErrorPropagation *bool           `json:"errorPropagation"`
	Call             int             `json:"call"`
	Outcome          outcome         `json:"outcome"`
	InitialValue     *string         `json:"initialValue"`
	Event            *string         `json:"event"`
	Stream           bool            `json:"stream"`
	Action           string          `json:"action"`
	Token            *string         `json:"token"`
	Message          string          `json:"message"`
	// The areas beyond execution (areas.go).
	Source        json.RawMessage `json:"source"`
	Grammar       string          `json:"grammar"`
	SDL           string          `json:"sdl"`
	Query         string          `json:"query"`
	OperationName *string         `json:"operationName"`
	Subscribe     *string         `json:"subscribe"`
	Extensions    *string         `json:"extensions"`
}

var (
	outMu    sync.Mutex
	out      = bufio.NewWriter(os.Stdout)
	syncMode = false
)

func send(m map[string]any) {
	line, err := json.Marshal(m)
	if err != nil {
		// For a response, graphql-go's result has a value encoding/json
		// can't write, so the client gets no response at all.
		if m["type"] == "response" {
			line, _ = json.Marshal(map[string]any{"type": "no-response", "id": m["id"], "message": "can't serialize the result: " + err.Error()})
		} else {
			line, _ = json.Marshal(map[string]any{"type": "error", "id": m["id"], "message": "can't serialize the " + fmt.Sprint(m["type"]) + ": " + err.Error()})
		}
	}
	outMu.Lock()
	defer outMu.Unlock()
	out.Write(line)
	out.WriteByte('\n')
	out.Flush()
}

type pending struct {
	path []string
	typ  graphql.Type
	done chan outcome
}

type execution struct {
	id      int
	schema  *built
	mu      sync.Mutex
	calls   map[int]*pending
	next    int
	applied atomic.Int64
	ended   chan struct{}
	// parent-values: the calls report their parent's token.
	parentValues bool
	// The token of a one-event subscription's event (parent-values).
	event *string
	// subscription-stream: the source stream the kit drives.
	stream *kitStream
}

var errAbandoned = errors.New("the kit ended the execution")

// control reports a call to the kit and returns the thunk that waits for
// its settle and turns the outcome into the resolver's result.
func (e *execution) control(path []string, typ graphql.Type, parent ...any) func() (any, error) {
	p := &pending{path: path, typ: typ, done: make(chan outcome, 1)}
	e.mu.Lock()
	e.next++
	call := e.next
	e.calls[call] = p
	e.mu.Unlock()
	// `after`: how many settles this execution had applied when the resolver
	// was called, so the kit knows what the engine had seen.
	m := map[string]any{"type": "call", "id": e.id, "call": call, "path": path, "returnType": typ.String(), "after": e.applied.Load()}
	// `parent`: the token of the value the resolver was called on, left
	// out for a list item, which has no resolver of its own.
	if len(parent) > 0 {
		m["parent"] = parent[0]
	}
	send(m)
	return func() (any, error) {
		select {
		case o := <-p.done:
			return e.value(path, typ, o)
		case <-e.ended:
			return nil, errAbandoned
		}
	}
}

// value is what the resolver returns for an outcome (docs/conformance.md,
// Outcomes).
func (e *execution) value(path []string, typ graphql.Type, o outcome) (any, error) {
	if nn, ok := typ.(*graphql.NonNull); ok {
		typ = nn.OfType
	}
	list, isList := typ.(*graphql.List)
	switch o.Kind {
	case "error":
		return nil, fmt.Errorf("resolver at %s failed", strings.Join(path, "."))
	case "null":
		return nil, nil
	case "leaf":
		// scalar-results: the internal value the kit names, as it is: the
		// integer 4 for an ID, 2147483648 for an Int.
		if len(o.Value) > 0 {
			return internalValue(o.Value)
		}
		// A leaf at a list position is the number 1, which isn't a slice.
		if isList {
			return 1, nil
		}
		return e.leaf(typ), nil
	case "uncoercible":
		// A value the leaf type can't represent: a fraction for an Int, a
		// non-finite number for a Float, a name that isn't an enum value.
		if _, ok := typ.(*graphql.Enum); ok {
			return "NOT_A_VALUE", nil
		}
		if typ.Name() == "Int" {
			return 1.2, nil
		}
		return math.Inf(1), nil
	case "object":
		// With parent-values the object carries the kit's token, which its
		// fields' resolvers report as their parent.
		if o.Token != nil {
			return map[string]any{"__typename": o.Type, "token": *o.Token}, nil
		}
		return map[string]any{"__typename": o.Type}, nil
	case "list":
		items := make([]any, o.Length)
		for i := range items {
			itemPath := append(append([]string{}, path...), fmt.Sprint(i))
			if o.Items != nil {
				// Inline items (--sync): values, never errors.
				items[i], _ = e.value(itemPath, list.OfType, o.Items[i])
			} else {
				// graphql-go completes a func() (interface{}, error) list
				// item as a thunk, like a field's.
				items[i] = e.control(itemPath, list.OfType)
			}
		}
		return items, nil
	}
	return nil, fmt.Errorf("unknown outcome %q", o.Kind)
}

// internalValue decodes a leaf outcome's value, with JSON integers as Go
// ints, the type a Go resolver returns for an integer.
func internalValue(raw json.RawMessage) (any, error) {
	d := json.NewDecoder(bytes.NewReader(raw))
	d.UseNumber()
	var v any
	if err := d.Decode(&v); err != nil {
		return nil, err
	}
	if n, ok := v.(json.Number); ok {
		if i, err := n.Int64(); err == nil {
			return int(i), nil
		}
		return n.Float64()
	}
	return v, nil
}

func (e *execution) leaf(typ graphql.Type) any {
	switch t := typ.(type) {
	case *graphql.Enum:
		return e.schema.firstEnumValue[t.Name()]
	case *graphql.Scalar:
		switch t.Name() {
		case "Int":
			return 1
		case "Float":
			return 1.5
		case "Boolean":
			return true
		}
	}
	return "v"
}

type contextKey struct{}

func resolve(p graphql.ResolveParams) (any, error) {
	e := p.Context.Value(contextKey{}).(*execution)
	var path []string
	for _, k := range p.Info.Path.AsArray() {
		path = append(path, fmt.Sprint(k))
	}
	var thunk func() (any, error)
	if e.parentValues {
		// The root value, an event or an object an earlier resolver
		// returned; null if the value carries no token.
		var parent any
		if m, ok := p.Source.(map[string]any); ok {
			parent = m["token"]
		}
		thunk = e.control(path, p.Info.ReturnType, parent)
	} else {
		thunk = e.control(path, p.Info.ReturnType)
	}
	if syncMode {
		return thunk()
	}
	return thunk, nil
}

// A subscription's source stream yields one event, and the root field's
// resolver runs on it, as in graphql-js. With subscription-stream, it is the
// stream the kit drives.
func subscribe(p graphql.ResolveParams) (any, error) {
	e := p.Context.Value(contextKey{}).(*execution)
	if e.stream != nil {
		return e.stream.source(p.Context), nil
	}
	event := map[string]any{}
	if e.event != nil {
		event["token"] = *e.event
	}
	events := make(chan any, 1)
	events <- event
	close(events)
	return events, nil
}

var (
	schemas    = map[string]*built{}
	executions = map[int]*execution{}
)

// buildExecutionSchema builds a fixture's schema with the adapter's
// resolvers. A panic in graphql-go while building is the adapter's error
// here: execution has no crash outcome for it.
func buildExecutionSchema(sdl string) (b *built, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("%v", r)
		}
	}()
	return buildSchema(sdl, buildOptions{resolve: resolve, subscribe: subscribe, keepDirectives: true})
}

func start(m message) {
	b, ok := schemas[m.Schema]
	if !ok {
		var err error
		if b, err = buildExecutionSchema(m.Schema); err != nil {
			send(map[string]any{"type": "error", "id": m.ID, "message": "the adapter couldn't build the schema: " + err.Error()})
			return
		}
		schemas[m.Schema] = b
	}
	if m.ErrorPropagation != nil && !*m.ErrorPropagation {
		send(map[string]any{"type": "error", "id": m.ID, "message": "graphql-go can't execute without error propagation"})
		return
	}
	e := &execution{id: m.ID, schema: b, calls: map[int]*pending{}, ended: make(chan struct{}), parentValues: m.InitialValue != nil, event: m.Event}
	executions[m.ID] = e
	var variables map[string]any
	if len(m.Variables) > 0 {
		if err := json.Unmarshal(m.Variables, &variables); err != nil {
			send(map[string]any{"type": "error", "id": m.ID, "message": "bad variables: " + err.Error()})
			return
		}
	}
	params := graphql.Params{
		Schema:         b.schema,
		RequestString:  m.Document,
		VariableValues: variables,
		Context:        context.WithValue(context.Background(), contextKey{}, e),
	}
	if m.InitialValue != nil {
		params.RootObject = map[string]any{"token": *m.InitialValue}
	}
	if m.OperationType == "subscription" && m.Stream {
		startStream(e, params)
		return
	}
	go func() {
		var result *graphql.Result
		if m.OperationType == "subscription" {
			results := graphql.Subscribe(params)
			result = <-results
			go func() {
				for range results {
				}
			}()
		} else {
			result = graphql.Do(params)
		}
		select {
		case <-e.ended:
			return
		default:
		}
		if result == nil {
			// The response stream closed without a result.
			send(map[string]any{"type": "stream-error", "id": e.id, "message": "the subscription's result channel closed without a result"})
			return
		}
		send(map[string]any{"type": "response", "id": e.id, "response": result})
	}()
}

func settle(m message) {
	e := executions[m.ID]
	if e == nil {
		send(map[string]any{"type": "error", "id": m.ID, "message": fmt.Sprintf("no execution %d", m.ID)})
		return
	}
	e.mu.Lock()
	p := e.calls[m.Call]
	delete(e.calls, m.Call)
	e.mu.Unlock()
	if p == nil {
		send(map[string]any{"type": "error", "id": m.ID, "message": fmt.Sprintf("no pending call %d", m.Call)})
		return
	}
	e.applied.Add(1)
	p.done <- m.Outcome
}

func version() string {
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, d := range info.Deps {
			if d.Path == "github.com/graphql-go/graphql" {
				return strings.TrimPrefix(d.Version, "v")
			}
		}
	}
	return "unknown"
}

func main() {
	for _, a := range os.Args[1:] {
		switch a {
		case "--sync":
			syncMode = true
		case "--area-worker":
			runWorker()
			return
		}
	}
	capabilities := []string{"invalid-results", "uncoercible-results", "scalar-results", "mutation", "subscription", "subscription-stream", "parent-values"}
	if !syncMode {
		capabilities = append([]string{"deferred-items"}, capabilities...)
	}
	capabilities = append(capabilities, areaCapabilities...)
	send(map[string]any{"type": "hello", "protocol": 1, "name": "graphql-go/graphql " + version(), "capabilities": capabilities})

	in := bufio.NewReader(os.Stdin)
	for {
		line, err := in.ReadBytes('\n')
		if len(strings.TrimSpace(string(line))) > 0 {
			var m message
			if jerr := json.Unmarshal(line, &m); jerr != nil {
				send(map[string]any{"type": "error", "message": "bad message: " + jerr.Error()})
			} else if areaTypes[m.Type] {
				forwardArea(line, m.ID)
			} else {
				switch m.Type {
				case "execute":
					start(m)
				case "settle":
					settle(m)
				case "source":
					source(m)
				case "cancel":
					cancel(m)
				case "end":
					if e := executions[m.ID]; e != nil {
						close(e.ended)
						if e.stream != nil {
							e.stream.close()
						}
						delete(executions, m.ID)
					}
				}
			}
		}
		if err == io.EOF {
			return
		}
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}
}
