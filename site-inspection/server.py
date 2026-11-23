"""Local page for the site-inspection demo.

  python server.py        # http://localhost:8092   (SUBQ_API_KEY in site-inspection/.env)

GET  /              the page
GET  /api/set       the four photos (with credits) and the rule book
GET  /photos/<f>    a photo from data/photos
POST /api/inspect   four Snap requests at once, one per photo: a verdict and a rule for each
Standard library only.
"""
import json
import mimetypes
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import inspect_photos as I

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(os.path.dirname(HERE), "brand", "fonts")


def short(rule):
    num, rest = rule.split(" ", 1)
    return f"{num} {rest.split('.')[0]}"


def static(folder, url_path):
    """A file directly inside folder, by the last segment of the URL path, or None. No dot-files, no
    subfolders, so `..` and friends cannot leave the folder."""
    name = url_path.split("?", 1)[0].rsplit("/", 1)[-1]
    p = os.path.join(folder, name)
    return p if name and not name.startswith(".") and os.path.isfile(p) else None


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
        for prefix, folder in (("/fonts/", FONTS), ("/photos/", os.path.join(HERE, "data", "photos"))):
            if self.path.startswith(prefix):
                p = static(folder, self.path)
                if p:
                    return self.send(200, open(p, "rb").read(), mimetypes.guess_type(p)[0] or "application/octet-stream")
        if self.path == "/api/set":
            photos = [p for f in I.SET for p in I.PHOTOS if p["file"] == f]
            return self.send(200, {"photos": photos, "rules": [short(r) for r in I.RULES.values()],
                                   "site": "Harbor Line Builders"})
        self.send(404, {"error": "not found"})

    def do_POST(self):
        if self.path == "/api/inspect":
            try:
                r = I.inspect_all()
                for x in r["photos"]:
                    x["rule_short"] = short(x["rule"]) if x["rule"] else None
                return self.send(200, r)
            except (Exception, SystemExit) as e:  # API down, timeout, bad key: tell the page, keep serving
                return self.send(502, {"error": str(e)})
        self.send(404, {"error": "not found"})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8092
    print(f"http://localhost:{port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
