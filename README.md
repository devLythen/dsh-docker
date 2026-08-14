# dsh-docker

Docker template for running the DeepSeek Harness Web UI. [简体中文](README.zh.md)

## Quickstart

```sh
cp .env.example .env
docker compose up -d
```

Configure the provider URL, credentials, and model through the Web UI. Public deployments require the Nginx authentication prompt before this configuration is available.

Open <http://localhost:3080>.

Stop the service with:

```sh
docker compose down
```

## Local data and live configuration

- `config/` is mounted at `/dsh-home` and stores Harness state and user configuration.
- `workspace/` is mounted at `/home/node`, which is the default workspace location shown by the Web UI.

Configure provider settings after startup through the Web UI. Public deployments require the Nginx authentication prompt. DSH watches user configuration and credential files under `config/`; changes apply to subsequent requests without restarting the container. `.env` contains Compose-only settings such as the host port and Nginx trusted host.

## Public deployment

Public deployment requires a DNS record, a TLS certificate, Nginx, and an authenticated reverse proxy. Do not expose the Docker port directly to the Internet.

Set the public authority in `.env`:

```env
DSH_PORT=3080
DSH_TRUSTED_HOST=dsh.example.com
```

Start DSH and keep its port bound to localhost:

```sh
docker compose up -d --build
```

Configure the router to forward public TCP port `443` to the server's TCP port `443`. Use [`nginx/dsh.conf.example`](nginx/dsh.conf.example) as the reverse-proxy starting point, then set its `server_name`, TLS certificate paths, and HTTPS listener.

Protect the entire Nginx site with Basic Auth before reloading it:

```sh
sudo apt-get install apache2-utils
sudo htpasswd -cB /etc/nginx/.htpasswd dsh-admin
sudo nginx -t
sudo systemctl reload nginx
```

The public URL is then `https://dsh.example.com`.
