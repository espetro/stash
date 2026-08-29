// Package logging provides JSON-lines logging with size-based rotation.
package logging

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Writer writes JSON lines and rotates the file at maxSize (keeping
// maxBackups rotated files). Logs never contain stash payload contents.
type Writer struct {
	mu          sync.Mutex
	path        string
	maxSize     int64
	maxBackups  int
	file        *os.File
	size        int64
}

// New opens (creating dirs) a log writer that rotates at maxSize bytes and
// keeps maxBackups rotated files. maxSize <= 0 defaults to 10 MB.
func New(path string, maxSize int64, maxBackups int) (*Writer, error) {
	if maxSize <= 0 {
		maxSize = 10 << 20
	}
	if maxBackups <= 0 {
		maxBackups = 3
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return nil, err
	}
	st, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, err
	}
	return &Writer{path: path, maxSize: maxSize, maxBackups: maxBackups, file: f, size: st.Size()}, nil
}

// Event is one structured log record.
func (w *Writer) Event(level, msg string, fields map[string]any) {
	rec := map[string]any{"ts": time.Now().UTC().Format(time.RFC3339), "level": level, "msg": msg}
	for k, v := range fields {
		rec[k] = v
	}
	b, err := json.Marshal(rec)
	if err != nil {
		b = []byte(fmt.Sprintf(`{"level":"error","msg":"log marshal failed"}`))
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	w.file.Write(append(b, '\n'))
	w.size += int64(len(b)) + 1
	if w.size >= w.maxSize {
		w.rotate()
	}
}

// Info logs at info level.
func (w *Writer) Info(msg string, fields map[string]any) { w.Event("info", msg, fields) }

// Error logs at error level.
func (w *Writer) Error(msg string, fields map[string]any) { w.Event("error", msg, fields) }

func (w *Writer) rotate() {
	w.file.Close()
	for i := w.maxBackups - 1; i >= 1; i-- {
		os.Rename(rotateName(w.path, i), rotateName(w.path, i+1))
	}
	os.Rename(w.path, rotateName(w.path, 1))
	// prune beyond maxBackups
	os.Remove(rotateName(w.path, w.maxBackups+1))
	f, err := os.OpenFile(w.path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return
	}
	w.file = f
	w.size = 0
}

func rotateName(path string, n int) string {
	return fmt.Sprintf("%s.%d", path, n)
}

// Close flushes and closes the underlying file.
func (w *Writer) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.file != nil {
		return w.file.Close()
	}
	return nil
}
