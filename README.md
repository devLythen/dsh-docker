# dsh-docker

Docker template for running the DeepSeek Harness Web UI.

## Quickstart

Requirements: Docker Engine and Docker Compose.

```sh
cp .env.example .env
cp config/.credentials.yaml.example config/.credentials.yaml
chmod 600 config/.credentials.yaml
```

Set `DEEPSEEK_API_KEY` in `config/.credentials.yaml`, then start the service:

```sh
docker compose up -d
```

Open <http://localhost:3080>.

Stop the service with:

```sh
docker compose down
```

## Local data and live configuration

- `config/settings.yaml` stores the provider URL and model settings.
- `config/.credentials.yaml` stores API keys and is not tracked by Git.
- `workspace/` is mounted at `/workspace` and is the agent's working directory.

DSH watches `config/settings.yaml` and `config/.credentials.yaml`. Changes to the provider URL or API key apply to subsequent requests without restarting the container. `.env` contains Compose-only settings such as the host port and Nginx trusted host.

## Public deployment

Public deployment requires a DNS record, a TLS certificate, Nginx, and an authenticated reverse proxy. Do not expose the Docker port directly to the Internet.

Set the public authority in `.env`. Include the external port when it is not the default HTTPS port:

```env
DSH_PORT=3080
DSH_TRUSTED_HOST=dsh.example.com:738
```

Start DSH and keep its port bound to localhost:

```sh
docker compose up -d --build
```

Configure the router to forward external TCP port `738` to the server's internal TCP port `443`. Use [`nginx/dsh.conf.example`](nginx/dsh.conf.example) as the reverse-proxy starting point, then set its `server_name`, TLS certificate paths, and HTTPS listener.

Protect the entire Nginx site with Basic Auth before reloading it:

```sh
sudo apt-get install apache2-utils
sudo htpasswd -cB /etc/nginx/.htpasswd dsh-admin
sudo nginx -t
sudo systemctl reload nginx
```

The proxy must keep authentication enabled for every path and preserve the loopback `Host` and `Origin` headers from the example. This is required for DSH's privileged settings and credentials APIs. The public URL is then `https://dsh.example.com:738`.
