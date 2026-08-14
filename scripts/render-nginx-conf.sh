#!/bin/sh
# Render nginx/dsh.conf.example with the ports from .env, so .env stays the
# single source of truth for DSH_PORT / AUTH_PORT. The script rewrites only
# the two `set` lines of the nginx constants block and prints the result.
#
# Usage:
#   ./scripts/render-nginx-conf.sh | sudo tee /etc/nginx/sites-available/dsh.conf
#   sudo nginx -t && sudo systemctl reload nginx
#
# Note: .env values must be plain shell-safe tokens (no quoting, no spaces).
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

# shellcheck disable=SC1091
. "$root/.env"

dsh_port=${DSH_PORT:-3080}
auth_port=${AUTH_PORT:-8081}

for port in "$dsh_port" "$auth_port"; do
  case "$port" in
    ''|*[!0-9]*)
      echo "error: port must be numeric, got '$port'" >&2
      exit 1
      ;;
  esac
  if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
    echo "error: port out of range: $port" >&2
    exit 1
  fi
done

sed \
  -e "s|^    set \$dsh_backend .*|    set \$dsh_backend 127.0.0.1:${dsh_port};   # .env DSH_PORT|" \
  -e "s|^    set \$auth_backend .*|    set \$auth_backend 127.0.0.1:${auth_port};  # .env AUTH_PORT|" \
  "$root/nginx/dsh.conf.example"
