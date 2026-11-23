"""Local page for the brand-match demo.

  python data/build.py    # once, writes data/library.json (committed)
  python server.py        # http://localhost:8091   (SUBQ_API_KEY in brand-match/.env)

GET  /             the page
GET  /api/library  the brand, guidelines, the two sample uploads and the 250 assets
POST /api/rank     {"upload": "..."} -> one Snap request: a probability for every asset, and on-brand
Standard library only.
"""
import json
import mimetypes
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import rank

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(os.path.dirname(HERE), "brand", "fonts")
MAX_BODY, MAX_UPLOAD = 64 * 1024, 4000


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
        if self.path == "/api/library":
            d = rank.DATA
            return self.send(200, {"brand": d["brand"], "guidelines": d["guidelines"], "uploads": [d["upload"], d["upload_off"]],
                                   "library": [{"id": a["id"], "text": a["text"]} for a in d["library"]]})
        self.send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/api/rank":
            return self.send(404, {"error": "not found"})
        body = read_json(self)
        if body is None:
            return self.send(400, {"error": "body must be a JSON object under 64 KB"})
        upload = body.get("upload")
        if upload is not None and (not isinstance(upload, str) or not upload.strip() or len(upload) > MAX_UPLOAD):
            return self.send(400, {"error": f"upload must be a non-empty string of at most {MAX_UPLOAD} characters"})
        try:
            return self.send(200, rank.rank(upload))
        except (Exception, SystemExit) as e:  # API down, timeout, bad key: tell the page, keep serving
            return self.send(502, {"error": str(e)})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8091
    print(f"http://localhost:{port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
