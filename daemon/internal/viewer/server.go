package viewer

import (
	"io/fs"
	"net"
	"net/http"
	"strings"
	"time"
)

// Options configures the loopback viewer server.
type Options struct {
	// Addr is the listen address. Empty means 127.0.0.1 with an
	// OS-assigned port (loopback only, never a new external surface).
	Addr string
	// Now is injectable for tests.
	Now func() time.Time
}

// Server serves the embedded viewer shell and the offline /s decode route
// on the daemon's loopback channel. The URL fragment (#p=... and, after
// F14, the fragment key) never reaches this server: HTTP clients strip
// fragments before the request leaves the browser. The ?p= path accepts
// self-contained payloads only.
type Server struct {
	static http.Handler
	now    func() time.Time
}

// NewServer builds the loopback server over the embedded dist tree.
func NewServer() (*Server, error) {
	sub, err := FS()
	if err != nil {
		return nil, err
	}
	return &Server{
		static: http.FileServerFS(sub),
		now:    time.Now,
	}, nil
}

// Listen binds the loopback listener. Non-loopback addresses are refused:
// the viewer is served locally only and the daemon must never open an
// external listen surface (fail closed).
func (s *Server) Listen(opts Options) (net.Listener, error) {
	if opts.Now != nil {
		s.now = opts.Now
	}
	addr := strings.TrimSpace(opts.Addr)
	if addr == "" || addr == "localhost" || addr == ":0" {
		addr = "127.0.0.1:0"
	}
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	if host != "127.0.0.1" && host != "localhost" && host != "" {
		return nil, errNotLoopback
	}
	if host == "localhost" || host == "" {
		host = "127.0.0.1"
	}
	return net.Listen("tcp", net.JoinHostPort(host, port))
}

// Handler returns the root handler: the /s decode route plus the static
// shell. HTML shell responses carry Cache-Control: no-store so a rebuilt
// daemon never serves a stale shell to the extension (W1).
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/s", http.HandlerFunc(s.handleShare))
	mux.Handle("/", s.noStore(s.static))
	return mux
}

// noStore wraps a static-file handler with the no-store shell header.
func (s *Server) noStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

// serveShell writes the embedded index.html (SPA fallthrough for /s
// without a payload, matching functions/s.ts's context.next()).
func (s *Server) serveShell(w http.ResponseWriter, r *http.Request) {
	sub, err := FS()
	if err != nil {
		writeErrorPage(w, http.StatusNotFound,
			"The viewer shell is not embedded in this daemon build. Rebuild the viewer and the daemon.")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	f, err := sub.Open("index.html")
	if err != nil {
		writeErrorPage(w, http.StatusNotFound,
			"The viewer shell is not embedded in this daemon build. Rebuild the viewer and the daemon.")
		return
	}
	defer f.Close()
	if rs, ok := f.(readSeeker); ok {
		http.ServeContent(w, r, "index.html", time.Time{}, rs)
		return
	}
	// fs.File without Seek: stream manually.
	st, _ := f.Stat()
	http.ServeContent(w, r, "index.html", st.ModTime(), readSeekerFrom(f))
}

type readSeeker interface {
	Read(p []byte) (int, error)
	Seek(offset int64, whence int) (int64, error)
}

func readSeekerFrom(f fs.File) readSeeker {
	if rs, ok := f.(readSeeker); ok {
		return rs
	}
	return &sliceSeeker{}
}

// sliceSeeker adapts a non-seekable fs.File; embed.FS files are always
// seekable so this path is defensive only.
type sliceSeeker struct{ off int64 }

func (s *sliceSeeker) Read(p []byte) (int, error)         { return 0, fs.ErrNotExist }
func (s *sliceSeeker) Seek(o int64, w int) (int64, error) { s.off = o; return o, nil }
