# dsh-docker

Docker template for running the DeepSeek Harness Web UI.

## Usage

Requirements: Docker Engine and Docker Compose.

```sh
cp .env.example .env
```

Set `DEEPSEEK_API_KEY` in `.env`, then start the service:

```sh
docker compose up -d
```

Open <http://localhost:3080>.

Stop the service with:

```sh
docker compose down
```

## Local data

- `config/` is mounted at `/dsh-home` and stores Harness configuration and session data.
- `workspace/` is mounted at `/workspace` and is the agent's working directory.

Edit files under `config/` on the host. The container uses the changes after restart; configuration files supported by DeepSeek Harness may also be reloaded by the application.

To use another host port, set `DSH_PORT` in `.env` before starting the service.

## Nginx reverse proxy reference

Nginx is not included in the Compose stack. For a server that already runs Nginx, use [`nginx/dsh.conf.example`](nginx/dsh.conf.example) as a starting point. Set `DSH_TRUSTED_HOST` in `.env` to the public hostname, replace `dsh.example.com` in the example, then validate and reload the host's Nginx service.
