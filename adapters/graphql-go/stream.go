package main

// subscription-stream: the kit drives a subscription's source stream
// (docs/conformance.md, "Subscription streams").
//
// graphql-go's source stream is a `chan interface{}` that the root field's
// Subscribe function returns. ExecuteSubscription (subscription.go) executes
// the selection set for each value it receives, sends the result on the
// response channel graphql.Subscribe returned, and closes that channel when
// the source channel closes or the request's context is done. A client
// cancels by cancelling the context it passed in graphql.Params.
//
// So here:
//   - `emit` sends an event on the source channel;
//   - `complete` closes it. A channel can't carry an error, so `fail`
//     closes it too: graphql-go has no way to receive a failing source;
//   - `cancel` cancels the request's context;
//   - every result on the response channel is a `response`, and its
//     closing is `done` (graphql-go never ends it with an error);
//   - graphql-go hands the request's context to the Subscribe function, and
//     a source stops when that context is done (as the sources in
//     graphql-go's subscription_test.go do): that is `source-cancelled`.

import (
	"context"
	"sync"

	"github.com/graphql-go/graphql"
)

type kitStream struct {
	e        *execution
	mu       sync.Mutex
	events   chan any
	over     bool          // the source completed or failed
	overCh   chan struct{} // closed once over
	cancelFn context.CancelFunc
}

func (e *execution) isEnded() bool {
	select {
	case <-e.ended:
		return true
	default:
		return false
	}
}

func startStream(e *execution, params graphql.Params) {
	ctx, cancelFn := context.WithCancel(params.Context)
	params.Context = ctx
	// The kit waits for each event's result before its next step, except
	// when it cancels while an event executes, so a few slots are enough
	// for emit never to block the message loop.
	s := &kitStream{e: e, events: make(chan any, 64), overCh: make(chan struct{}), cancelFn: cancelFn}
	e.stream = s
	go func() {
		// Read the response channel to its end, as a client does after
		// cancelling, so graphql-go isn't left blocked on it.
		for result := range graphql.Subscribe(params) {
			if !e.isEnded() {
				send(map[string]any{"type": "response", "id": e.id, "response": result})
			}
		}
		if !e.isEnded() {
			send(map[string]any{"type": "done", "id": e.id})
		}
	}()
}

// source is what the root field's Subscribe function returns. ctx is the
// context graphql-go gave it.
func (s *kitStream) source(ctx context.Context) chan any {
	go func() {
		select {
		case <-ctx.Done():
			s.mu.Lock()
			over := s.over
			s.mu.Unlock()
			if !over && !s.e.isEnded() {
				send(map[string]any{"type": "source-cancelled", "id": s.e.id})
			}
		case <-s.overCh:
		}
	}()
	return s.events
}

func (s *kitStream) emit(token *string) {
	event := map[string]any{}
	if token != nil {
		event["token"] = *token
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.over {
		s.events <- event
	}
}

func (s *kitStream) finish() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.over {
		s.over = true
		close(s.events)
		close(s.overCh)
	}
}

// close: the kit is done with the stream. Cancel the context so graphql-go
// stops, without reporting anything (the execution has ended).
func (s *kitStream) close() {
	s.cancelFn()
}

func source(m message) {
	e := executions[m.ID]
	if e == nil || e.stream == nil {
		send(map[string]any{"type": "error", "id": m.ID, "message": "no streamed subscription to drive"})
		return
	}
	switch m.Action {
	case "emit":
		e.stream.emit(m.Token)
	case "complete", "fail":
		e.stream.finish()
	default:
		send(map[string]any{"type": "error", "id": m.ID, "message": "unknown source action " + m.Action})
	}
}

// cancel: the client cancels the response stream, by cancelling the context
// it gave graphql.Subscribe.
func cancel(m message) {
	e := executions[m.ID]
	if e == nil || e.stream == nil {
		send(map[string]any{"type": "error", "id": m.ID, "message": "no response stream to cancel"})
		return
	}
	e.stream.cancelFn()
}
