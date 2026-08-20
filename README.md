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
- `workspace/` is mounted at `/home/node` (the Web UI's default workspace location); set `DSH_WORKSPACE` in `.env` to mount a custom host directory instead.
- `dsh plugin` manages profile plugins through pnpm (bundled in the image), e.g. `docker compose exec dsh dsh plugin --profile web add <package>`.

Configure provider settings after startup through the Web UI. Public deployments require the Nginx session login first. DSH watches user configuration and credential files under `config/`; changes apply to subsequent requests without restarting the container. `.env` contains Compose-only settings such as the host port and Nginx trusted host.

## Ports

Only two host ports are ever published, both defined once in `.env`:

```env
DSH_PORT=3080   # DSH Web UI, published on host 127.0.0.1
AUTH_PORT=8081  # login/session service, published on host 127.0.0.1
```

- The Compose publish mapping and DSH's trust fence (`--trusted-host`) both read `DSH_PORT` automatically; no other file needs editing.
- Container-internal ports are private constants that are never published and can be ignored when changing ports: socat `3080` → `dsh web` `3081` inside the DSH container, `8081` inside the auth container.
- Nginx is the only host-side file to sync. Its port literals are centralized in the constants block at the top of `nginx/dsh.conf.example` (two `set` lines mirroring `.env`); or let `.env` stay the single source of truth by rendering:

```sh
./scripts/render-nginx-conf.sh | sudo tee /etc/nginx/sites-available/dsh.conf
```

Port-change procedure: edit `.env` → `docker compose up -d` → re-render (or sync the constants block) → `sudo nginx -t && sudo systemctl reload nginx`.

## Updating DSH

Every `docker compose up` rebuilds the `dsh` service. During the image build, the same `oven/bun:1.3.14` used by `Dockerfile` resolves and installs `@deepseek-ai/dsh@latest` inside the image. The build does not read `package.json` or `bun.lock` from the repository; the temporary manifest and dependencies exist only during the build and in the resulting image.

Startup therefore requires access to the npm registry and may take longer than reusing an existing image. This policy automatically accepts new DSH releases, so compatibility is determined by the upstream release.

Public deployments must also synchronize the host Nginx configuration. DSH pins its model, settings, and credential APIs to loopback same-origin; `nginx/dsh.conf.example` satisfies that requirement by forwarding authenticated `/api/` requests with both loopback `Host` and `Origin` values. After updating the template or migrating from an earlier configuration, render and load it again:

```sh
./scripts/render-nginx-conf.sh | sudo tee /etc/nginx/sites-available/dsh.conf
sudo nginx -t && sudo systemctl reload nginx
```

Do not change `/api/`'s `proxy_set_header Host $dsh_backend;` or `proxy_set_header Origin http://$dsh_backend;` back to the public authority. Changing either one still makes the Models page configuration API return `403`.

`config/` and profile plugins persist through a DSH image update, but plugins are not upgraded automatically. Validate them after an update with `docker compose exec dsh dsh plugin --profile web list`, and update them separately only after checking their DSH compatibility.

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
docker compose up -d
```

Use [`nginx/dsh.conf.example`](nginx/dsh.conf.example) as the reverse-proxy starting point (ports — see “Ports” above), then set its `server_name`, TLS certificate paths, and HTTPS listener, and reload Nginx:

```sh
sudo nginx -t
sudo systemctl reload nginx
```

### Authentication behavior

- The first request to any page redirects to `/login/`; enter `AUTH_PASSWORD` from `.env`.
- A successful login sets a `dsh_session` cookie (HttpOnly + SameSite=Lax, plus Secure over HTTPS) that expires after `AUTH_TTL_HOURS` (default 24); afterwards the user is sent back to the login page.
- Sessions live in the `auth` container's memory: `docker compose restart auth` (or rebooting the host) logs everyone out immediately.
- 5 consecutive wrong passwords lock that source IP for 15 minutes.

The public URL is then `https://dsh.example.com`.
