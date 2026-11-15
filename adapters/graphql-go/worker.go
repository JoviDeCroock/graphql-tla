package main

// Area requests run in a worker process: the adapter itself, started with
// --area-worker. A Go stack overflow is a fatal error that no recover
// catches, and graphql-go's validator overflows its stack on some documents
// (rules_overlapping_fields_can_be_merged.go). When the worker dies, the
// adapter answers the request with an `error` that quotes Go's fatal error
// and the first graphql-go frame, which the kit records as a crash, and
// starts a new worker for the next request.

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"sync"
)

type areaWorker struct {
	cmd    *exec.Cmd
	in     io.WriteCloser
	out    *bufio.Reader
	stderr *lockedBuffer
}

type lockedBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (l *lockedBuffer) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.Write(p)
}

func (l *lockedBuffer) String() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.String()
}

var worker *areaWorker

func startWorker() (*areaWorker, error) {
	self, err := os.Executable()
	if err != nil {
		return nil, err
	}
	cmd := exec.Command(self, "--area-worker")
	in, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	out, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	w := &areaWorker{cmd: cmd, in: in, out: bufio.NewReaderSize(out, 1<<20), stderr: &lockedBuffer{}}
	cmd.Stderr = w.stderr
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	return w, nil
}

var graphqlFrame = regexp.MustCompile(`graphql-go/graphql@[^/]+/([^\s]+:\d+)`)

// forwardArea sends one area request to the worker and passes its answer
// on, or reports the worker's death as a crash.
func forwardArea(line []byte, id int) {
	if worker == nil {
		w, err := startWorker()
		if err != nil {
			send(map[string]any{"type": "error", "id": id, "message": "can't start the area worker: " + err.Error()})
			return
		}
		worker = w
	}
	w := worker
	if _, err := w.in.Write(append(bytes.TrimRight(line, "\n"), '\n')); err == nil {
		if answer, err := w.out.ReadBytes('\n'); err == nil {
			outMu.Lock()
			out.Write(answer)
			out.Flush()
			outMu.Unlock()
			return
		}
	}
	// The worker died on this request.
	w.in.Close()
	w.cmd.Wait()
	worker = nil
	stderr := w.stderr.String()
	reason := "the area worker exited"
	for _, l := range strings.Split(stderr, "\n") {
		if strings.HasPrefix(l, "fatal error: ") || strings.HasPrefix(l, "panic: ") {
			reason = "graphql-go: " + l
			break
		}
	}
	if m := graphqlFrame.FindStringSubmatch(stderr); m != nil {
		reason += " at " + m[1]
	}
	send(map[string]any{"type": "error", "id": id, "message": reason})
}

// runWorker answers area requests from stdin, one per line, until EOF.
func runWorker() {
	in := bufio.NewReaderSize(os.Stdin, 1<<20)
	for {
		line, err := in.ReadBytes('\n')
		if len(bytes.TrimSpace(line)) > 0 {
			var m message
			if jerr := jsonUnmarshal(line, &m); jerr != nil {
				send(map[string]any{"type": "error", "message": "bad message: " + jerr.Error()})
			} else if !area(m) {
				send(map[string]any{"type": "error", "id": m.ID, "message": fmt.Sprintf("not an area request: %s", m.Type)})
			}
		}
		if err != nil {
			return
		}
	}
}
