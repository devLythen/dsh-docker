#!/bin/sh
set -eu

proxy_pid=
cleanup() {
  if [ -n "${proxy_pid:-}" ]; then
    kill "$proxy_pid" 2>/dev/null || true
    wait "$proxy_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# The web profile binds to loopback by design. Forward the published container
# port without weakening that application-level binding.
socat TCP-LISTEN:3080,bind=0.0.0.0,reuseaddr,fork TCP:127.0.0.1:3081 &
proxy_pid=$!

set +e
if [ -n "${DSH_TRUSTED_HOST:-}" ]; then
  dsh web --port 3081 \
    --trusted-host localhost:3080 \
    --trusted-host 127.0.0.1:3080 \
    --trusted-host "$DSH_TRUSTED_HOST" "$@"
else
  dsh web --port 3081 \
    --trusted-host localhost:3080 \
    --trusted-host 127.0.0.1:3080 "$@"
fi
status=$?
set -e
exit "$status"
