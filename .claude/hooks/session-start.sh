#!/bin/bash
#
# Make a fresh web session able to run the suites without being asked twice.
#
# `npm run check` needs nothing at all -- the standards gate has no
# dependencies on purpose -- but `npm test` drives a real browser, so it needs
# Playwright installed and a Chromium it will accept. The image already ships
# one; point Playwright at it rather than downloading a second copy.
set -euo pipefail

# Local machines manage their own dependencies; this is for the remote image.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

npm install --no-audit --no-fund

# tests/run.mjs looks for CHROME_PATH first, then a pre-installed browser.
# Persisting it means every command in the session finds the same one.
if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -d /opt/pw-browsers ]; then
  chrome="$(find /opt/pw-browsers -maxdepth 3 -name chrome -type f 2>/dev/null | head -n 1)"
  [ -x "/opt/pw-browsers/chromium" ] && chrome=/opt/pw-browsers/chromium
  if [ -n "$chrome" ]; then
    echo "export CHROME_PATH=\"$chrome\"" >> "$CLAUDE_ENV_FILE"
  fi
fi
