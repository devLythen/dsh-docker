# dsh-docker

Docker template for running the DeepSeek Harness Web UI. [简体中文](README.zh.md)

## Quickstart

```sh
cp .env.example .env
docker compose up -d
```

Configure the provider URL, credentials, and model through the Web UI. Public deployments require the Nginx session login (24-hour expiry by default) before this configuration is available.

Open <http://localhost:3080>.

Stop the service with:

```sh
docker compose down
```

## Local data and live configuration

- `config/` is mounted at `/dsh-home` and stores Harness state and user configuration.
- `workspace/` is mounted at `/home/node`, which is the default workspace location shown by the Web UI.

Configure provider settings after startup through the Web UI. Public deployments require the Nginx session login first. DSH watches user configuration and credential files under `config/`; changes apply to subsequent requests without restarting the container. `.env` contains Compose-only settings such as the host port and Nginx trusted host.

## Public deployment

Public deployment requires a DNS record, a TLS certificate, Nginx, and an authenticated reverse proxy. Do not expose the Docker port directly to the Internet.

Public authentication uses a login service plus session cookies: Nginx validates every request's session cookie with an internal `auth_request` subrequest and redirects invalid or expired sessions to the `/login/` page. Sessions expire after **24 hours** by default; restarting the `auth` service invalidates every session immediately.

Set the public authority and the login password in `.env`:

```env
DSH_PORT=3080
DSH_TRUSTED_HOST=dsh.example.com
AUTH_PASSWORD=<strong random password>
# AUTH_TTL_HOURS=24
```

Generate a password:

```sh
openssl rand -base64 24 | tr '+/' '-_' | tr -d '='
```

Start DSH and the login service, and keep the host ports bound to localhost:

```sh
docker compose up -d --build
```

Use [`nginx/dsh.conf.example`](nginx/dsh.conf.example) as the reverse-proxy starting point, then set its `server_name`, TLS certificate paths, and HTTPS listener, and reload Nginx:

```sh
sudo nginx -t
sudo systemctl reload nginx
```

### Authentication behavior

- The first request to any page redirects to `/login/`; enter `AUTH_PASSWORD` from `.env`.
- A successful login sets a `dsh_session` cookie (HttpOnly + SameSite=Lax, plus Secure over HTTPS) that expires after `AUTH_TTL_HOURS` (default 24); afterwards the user is sent back to the login page.
- Sessions live in the `auth` container's memory: `docker compose restart auth` (or rebooting the host) logs everyone out immediately.
- 5 consecutive wrong passwords lock that source IP for 15 minutes.
- Optional hardening: layer Basic Auth on top of the session cookie (see the comments inside `nginx/dsh.conf.example`):

```sh
sudo apt-get install apache2-utils
sudo htpasswd -cB /etc/nginx/.htpasswd admin
```

The public URL is then `https://dsh.example.com`.
