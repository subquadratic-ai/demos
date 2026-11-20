"""Local page for the live context-curation demo.

  python curate.py --fetch     # once: clone true-myth at the pinned commit
  python server.py             # http://localhost:8090  (SUBQ_API_KEY in live/.env)

GET  /             the page
GET  /api/repo     the files, their line counts, the task
POST /api/pass1    whole repo + task -> one probability per file (one Snap request)
POST /api/pass2    {"paths": [...]} -> one probability per top-level block, and the packet
Every number the page shows comes from these responses. Standard library only.
"""
import json
import mimetypes
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import curate

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(os.path.dirname(HERE), "fonts")
FILES = curate.files()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path in ("/", "/index.html") or self.path.startswith("/?"):
            return self.send(200, open(os.path.join(HERE, "index.html"), "rb").read(), "text/html; charset=utf-8")
        if self.path.startswith("/fonts/"):
            p = os.path.join(FONTS, os.path.basename(self.path))
            if os.path.exists(p):
                return self.send(200, open(p, "rb").read(), mimetypes.guess_type(p)[0] or "font/ttf")
        if self.path == "/api/repo":
            return self.send(200, {"task": curate.TASK, "commit": curate.REPO_COMMIT, "repo": "true-myth/true-myth",
                                   "files": [{"path": f["path"], "lines": f["lines"]} for f in FILES],
                                   "lines": sum(f["lines"] for f in FILES)})
        self.send(404, {"error": "not found"})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        try:
            if self.path == "/api/pass1":
                p1 = curate.pass1(FILES)
                return self.send(200, {**p1, "keep": curate.KEEP})
            if self.path == "/api/pass2":
                kept = [f for f in FILES if f["path"] in set(body.get("paths", []))]
                p2 = curate.pass2(kept)
                return self.send(200, {**p2, "packet": curate.packet(kept, p2)})
        except Exception as e:  # surface API errors on the page
            return self.send(502, {"error": str(e)})
        self.send(404, {"error": "not found"})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
    print(f"http://localhost:{port}  ({len(FILES)} files)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
