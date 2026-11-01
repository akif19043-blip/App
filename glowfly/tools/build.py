#!/usr/bin/env python3
"""
build.py -- package Glowfly for each place it can be published.

    python3 tools/build.py            # every target
    python3 tools/build.py crazygames # just one

Each target is the same game with a different portal SDK script in its
<head>, written to dist/<target>/ and zipped as dist/glowfly-<target>.zip
with index.html at the root of the zip, which is what the portals' upload
forms expect.

    crazygames  CrazyGames HTML5 SDK v3
    poki        Poki SDK v2
    web         no SDK and no ads: itch.io, your own site, anywhere else
"""

import os
import shutil
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
SHIPPED = ['index.html', 'css', 'js', 'assets']
MARKER = '<!-- PORTAL_SDK -->'

TARGETS = {
    'crazygames': '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>',
    'poki': '<script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>',
    'web': '',
}


def build(target):
    out = os.path.join(DIST, target)
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    for name in SHIPPED:
        source = os.path.join(ROOT, name)
        if os.path.isdir(source):
            shutil.copytree(source, os.path.join(out, name))
        else:
            shutil.copy2(source, os.path.join(out, name))

    page = os.path.join(out, 'index.html')
    with open(page, encoding='utf-8') as fh:
        html = fh.read()
    if MARKER not in html:
        sys.exit('index.html has lost its ' + MARKER + ' marker')
    with open(page, 'w', encoding='utf-8') as fh:
        fh.write(html.replace(MARKER, TARGETS[target]))

    archive = os.path.join(DIST, 'glowfly-%s.zip' % target)
    total = 0
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as zf:
        for base, _, files in sorted(os.walk(out)):
            for name in sorted(files):
                path = os.path.join(base, name)
                total += os.path.getsize(path)
                zf.write(path, os.path.relpath(path, out))
    print('%-11s %3d KB unpacked, %3d KB zipped -> %s' % (
        target, total // 1024, os.path.getsize(archive) // 1024,
        os.path.relpath(archive, ROOT)))


def main():
    wanted = sys.argv[1:] or list(TARGETS)
    for target in wanted:
        if target not in TARGETS:
            sys.exit('unknown target %r; pick from %s' % (target, ', '.join(TARGETS)))
        build(target)


if __name__ == '__main__':
    main()
