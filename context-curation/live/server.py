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
FONTS = os.path.join(os.path.dirname(os.path.dirname(HERE)), "brand", "fonts")
if not os.path.isdir(curate.REPO):
    sys.exit("No true-myth checkout in live/repo. Run `python curate.py --fetch` first.")
FILES = curate.files()
PATHS = {f["path"] for f in FILES}
MAX_BODY = 64 * 1024


def static(folder, url_path):
    """A file directly inside folder, by the last segment of the URL path, or None. No dot-files, no
    subfolders, so `..` and friends cannot leave the folder."""
    name = url_path.split("?", 1)[0].rsplit("/", 1)[-1]
    p = os.path.join(folder, name)
    return p if name and not name.startswith(".") and os.path.isfile(p) else None


def read_json(handler):
    """The request body as a JSON object, {} when empty, or None when too large or not an object."""
    try:
        n = int(handler.headers.get("Content-Length") or 0)
    except ValueError:
        return None
    if n < 0 or n > MAX_BODY:
        return None
    try:
        body = json.loads(handler.rfile.read(n) or b"{}")
    except ValueError:
        return None
    return body if isinstance(body, dict) else None


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
            p = static(FONTS, self.path)
            if p:
                return self.send(200, open(p, "rb").read(), mimetypes.guess_type(p)[0] or "font/ttf")
        if self.path == "/api/repo":
            return self.send(200, {"task": curate.TASK, "commit": curate.REPO_COMMIT, "repo": "true-myth/true-myth",
                                   "files": [{"path": f["path"], "lines": f["lines"]} for f in FILES],
                                   "lines": sum(f["lines"] for f in FILES)})
        self.send(404, {"error": "not found"})

    def do_POST(self):
        if self.path not in ("/api/pass1", "/api/pass2"):
            return self.send(404, {"error": "not found"})
        body = read_json(self)
        if body is None:
            return self.send(400, {"error": "body must be a JSON object under 64 KB"})
        paths = body.get("paths")
        if self.path == "/api/pass2" and not (isinstance(paths, list) and paths and all(isinstance(p, str) and p in PATHS for p in paths)):
            return self.send(400, {"error": "paths must be a non-empty list of files from /api/repo"})
        try:
            if self.path == "/api/pass1":
                p1 = curate.pass1(FILES)
                return self.send(200, {**p1, "keep": curate.KEEP})
            kept = [f for f in FILES if f["path"] in set(paths)]
            p2 = curate.pass2(kept)
            return self.send(200, {**p2, "packet": curate.packet(kept, p2)})
        except (Exception, SystemExit) as e:  # API down, timeout, bad key: tell the page, keep serving
            return self.send(502, {"error": str(e)})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
    print(f"http://localhost:{port}  ({len(FILES)} files)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
