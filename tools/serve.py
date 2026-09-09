#!/usr/bin/env python3
"""
serve.py -- tiny static server for local play and testing.

    python3 tools/serve.py [port]

Serves game/ with the right MIME type for .glb and no-store caching, so a
rebuilt model shows up on reload instead of coming back from the disk cache.
Bound to 0.0.0.0 so a phone on the same Wi-Fi can open it directly.
"""

import http.server
import os
import socket
import sys

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'game')


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map)
    extensions_map.update({
        '.glb': 'model/gltf-binary',
        '.gltf': 'model/gltf+json',
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.webmanifest': 'application/manifest+json',
        '.svg': 'image/svg+xml',
    })

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        if '304' not in (args[1] if len(args) > 1 else ''):
            super().log_message(fmt, *args)


def local_ip():
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(('8.8.8.8', 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except OSError:
        return '127.0.0.1'


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = http.server.ThreadingHTTPServer(('0.0.0.0', port), Handler)
    print('Serving %s' % ROOT)
    print('  http://localhost:%d' % port)
    print('  http://%s:%d   <- open this on your phone' % (local_ip(), port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nstopped')


if __name__ == '__main__':
    main()
