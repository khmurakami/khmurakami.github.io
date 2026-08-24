"""Static dev server that forbids caching.

The plain `python -m http.server` lets browsers cache JS modules and images,
which during sprite work means you reload and see the previous build — the room
updates but the script does not, so props silently vanish. Every response here
is marked no-store so a normal reload always shows current files.

Usage:
    python scripts/serve.py [port] [--host HOST]

    python scripts/serve.py                 127.0.0.1:8000
    python scripts/serve.py 8000 --lan      every interface, for a phone

`--lan` is `--host 0.0.0.0`, and prints the address to type into the phone.
Testing on a real handset is the whole point of it: emulation gets the URL-bar
height, the audio unlock, the tap handling and the frame rate wrong, which is
precisely the list of things most likely to be broken.

The default stays loopback-only. Serving a working directory to the whole
network should be something you asked for, not something you got.
"""
import argparse
import socket
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


def lan_address():
    """This machine's address on the local network, for the phone to type in.

    Connecting a UDP socket sends nothing; it just asks the routing table which
    interface would be used to reach the outside, which is the one a phone on
    the same network can see. `gethostname` is the usual answer and is wrong as
    often as it is right on a machine with several interfaces.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("port", nargs="?", type=int, default=8000)
    parser.add_argument("--host", default="127.0.0.1",
                        help="interface to bind (default: loopback only)")
    parser.add_argument("--lan", action="store_true",
                        help="bind every interface, for testing on a phone")
    args = parser.parse_args(argv)

    host = "0.0.0.0" if args.lan else args.host

    handler = partial(NoCacheHandler, directory=".")
    server = ThreadingHTTPServer((host, args.port), handler)

    print(f"serving http://127.0.0.1:{args.port}  (no-store)")
    if host == "0.0.0.0":
        ip = lan_address()
        if ip:
            print(f"on this network: http://{ip}:{args.port}")
        else:
            print("on this network: could not work out the LAN address")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()
        server.server_close()


if __name__ == "__main__":
    sys.exit(main())
