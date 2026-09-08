#!/usr/bin/env python3
"""Local server that behaves like a real host.

    python3 site/serve.py            # http://localhost:8791/ and on the LAN

Python's built-in `http.server` sends every byte raw and no cache headers,
which makes the site feel far slower on a phone than it will in production:
the quantized models compress by about 70% under gzip, and a real host does
that automatically. This server does the same, and it tells the browser to
always re-check HTML, CSS, JS and models so a rebuild is picked up on the
next reload instead of being served from cache for minutes.

Versioned URLs (anything with `?v=`) are marked immutable, so repeat visits
are instant while fresh builds still change the URL.
"""

from __future__ import annotations

import gzip
import mimetypes
import os
import pathlib
import socket
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = pathlib.Path(__file__).resolve().parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8791

COMPRESS = {".glb", ".js", ".css", ".html", ".json", ".svg", ".txt", ".md", ".mjs"}
_gz_cache: dict[str, tuple[float, bytes]] = {}
_gz_lock = threading.Lock()

mimetypes.add_type("model/gltf-binary", ".glb")
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def log_message(self, fmt, *args):  # quieter log: one line per request
        sys.stderr.write("%s  %s\n" % (self.address_string(), fmt % args))

    def do_HEAD(self):
        self._serve(head=True)

    def do_GET(self):
        self._serve(head=False)

    def _serve(self, head: bool):
        url = urlsplit(self.path)
        rel = url.path
        path = pathlib.Path(self.translate_path(rel))
        if path.is_dir():
            if not rel.endswith("/"):
                self.send_response(301)
                self.send_header("Location", rel + "/" + (("?" + url.query) if url.query else ""))
                self.end_headers()
                return
            path = path / "index.html"
        if not path.is_file():
            self.send_error(404, "Not found")
            return

        ctype = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/json", "image/svg+xml", "text/javascript"):
            ctype += "; charset=utf-8"
        stat = path.stat()
        body = path.read_bytes()

        wants_gz = "gzip" in self.headers.get("Accept-Encoding", "")
        if wants_gz and path.suffix.lower() in COMPRESS and len(body) > 1024:
            key = str(path)
            with _gz_lock:
                cached = _gz_cache.get(key)
                if cached is None or cached[0] != stat.st_mtime:
                    cached = (stat.st_mtime, gzip.compress(body, 6))
                    _gz_cache[key] = cached
            body = cached[1]
            encoding = "gzip"
        else:
            encoding = None

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        if encoding:
            self.send_header("Content-Encoding", encoding)
        self.send_header("Vary", "Accept-Encoding")
        if "v=" in url.query:
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        else:
            self.send_header("Cache-Control", "no-cache")
        self.send_header("Last-Modified", self.date_time_string(stat.st_mtime))
        self.end_headers()
        if not head:
            self.wfile.write(body)


def lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


if __name__ == "__main__":
    os.chdir(ROOT)
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"ForgeBoard site\n  local  http://localhost:{PORT}/\n  phone  http://{lan_ip()}:{PORT}/\n", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
