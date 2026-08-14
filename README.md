# dsh-docker

Docker template for running the DeepSeek Harness Web UI.

## Usage

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

To use another host port, set `DSH_PORT` in `.env` before starting the service.

## Nginx reverse proxy reference

Nginx is not included in the Compose stack. For a server that already runs Nginx, use [`nginx/dsh.conf.example`](nginx/dsh.conf.example) as a starting point. Set `DSH_TRUSTED_HOST` to the public authority, including its non-default port, replace `dsh.example.com` in the example, then validate and reload the host's Nginx service.
