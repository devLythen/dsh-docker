# dsh-docker

用于运行 DeepSeek Harness Web UI 的 Docker 模板。

## 使用

依赖：Docker Engine 和 Docker Compose。

```sh
cp .env.example .env
cp config/.credentials.yaml.example config/.credentials.yaml
chmod 600 config/.credentials.yaml
```

在 `config/.credentials.yaml` 中填写 `DEEPSEEK_API_KEY`，然后启动服务：

```sh
docker compose up -d
```

打开 <http://localhost:3080>。

停止服务：

```sh
docker compose down
```

## 本地数据与实时配置

- `config/settings.yaml` 保存提供方 URL 和模型配置。
- `config/.credentials.yaml` 保存 API Key，不会被 Git 跟踪。
- `workspace/` 挂载到容器内的 `/workspace`，作为 Agent 的工作目录。

DSH 会监视 `config/settings.yaml` 和 `config/.credentials.yaml`。提供方 URL 或 API Key 修改后会作用于后续请求，不需要重启容器。`.env` 只保存宿主端口、Nginx 信任主机等 Compose 配置。

需要更换宿主机端口时，在启动服务前于 `.env` 中设置 `DSH_PORT`。

## Nginx 反向代理参考

Nginx 不包含在 Compose 服务中。服务器已运行 Nginx 时，可将 [`nginx/dsh.conf.example`](nginx/dsh.conf.example) 作为配置起点。在 `.env` 中将 `DSH_TRUSTED_HOST` 设置为公网主机名，替换示例中的 `dsh.example.com`，然后校验并重载宿主机上的 Nginx 服务。
