#!/usr/bin/env python3
"""
build_dist.py -- copy the shippable files into dist/ for Capacitor.

    python3 tools/build_dist.py

The game has no build step; this just gathers index.html, css/, js/,
assets/, vendor/, the manifest and the service worker so `npx cap sync`
does not drag node_modules or the Android project into the APK.
"""

import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
FILES = ['index.html', 'manifest.webmanifest', 'sw.js']
DIRS = ['css', 'js', 'assets', 'vendor']


def main():
    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)
    for name in FILES:
        shutil.copy2(os.path.join(ROOT, name), os.path.join(DIST, name))
    for name in DIRS:
        shutil.copytree(os.path.join(ROOT, name), os.path.join(DIST, name))
    total = sum(os.path.getsize(os.path.join(b, f)) for b, _, fs in os.walk(DIST) for f in fs)
    print('dist/: %.1f MB' % (total / 1e6))


if __name__ == '__main__':
    main()
