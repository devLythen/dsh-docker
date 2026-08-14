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
# port without weakening that application-level binding. The ports on this
# side (3080 -> 3081) are container-internal constants: clients only ever see
# the host-published DSH_PORT, so no host-side value leaks in here.
socat TCP-LISTEN:3080,bind=0.0.0.0,reuseaddr,fork TCP:127.0.0.1:3081 &
proxy_pid=$!

# The authorities clients actually use carry the host-published port from
# .env (DSH_PORT, passed through docker-compose env_file), so the trust fence
# derives from it instead of hardcoding a port. Defaults to 3080.
port="${DSH_PORT:-3080}"

set +e
if [ -n "${DSH_TRUSTED_HOST:-}" ]; then
  dsh web --port 3081 \
    --trusted-host "localhost:${port}" \
    --trusted-host "127.0.0.1:${port}" \
    --trusted-host "$DSH_TRUSTED_HOST" "$@"
else
  dsh web --port 3081 \
    --trusted-host "localhost:${port}" \
    --trusted-host "127.0.0.1:${port}" "$@"
fi
status=$?
set -e
exit "$status"
