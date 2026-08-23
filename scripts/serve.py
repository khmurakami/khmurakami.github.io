"""Static dev server that forbids caching.

The plain `python -m http.server` lets browsers cache JS modules and images,
which during sprite work means you reload and see the previous build — the room
updates but the script does not, so props silently vanish. Every response here
is marked no-store so a normal reload always shows current files.

Usage:
    python scripts/serve.py [port]
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Log every request. Which files the browser actually asks for is the
        # only reliable way to tell which build it is running.
        super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(NoCacheHandler, directory=".")
    print(f"serving http://127.0.0.1:{port}  (no-store; errors only)")
    ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
