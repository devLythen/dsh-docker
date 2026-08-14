# dsh-docker

用于运行 DeepSeek Harness Web UI 的 Docker 模板。

## 使用

依赖：Docker Engine 和 Docker Compose。

```sh
cp .env.example .env
```

在 `.env` 中填写 `DEEPSEEK_API_KEY`，然后启动服务：

```sh
docker compose up -d
```

打开 <http://localhost:3080>。

停止服务：

```sh
docker compose down
```

## 本地数据

- `config/` 挂载到容器内的 `/dsh-home`，保存 Harness 配置和会话数据。
- `workspace/` 挂载到容器内的 `/workspace`，作为 Agent 的工作目录。

可以直接修改宿主机 `config/` 下的文件。重启服务后容器会使用修改后的配置；DeepSeek Harness 支持热加载的配置文件仍按应用自身行为处理。

需要更换宿主机端口时，在启动服务前于 `.env` 中设置 `DSH_PORT`。

## Nginx 反向代理参考

Nginx 不包含在 Compose 服务中。服务器已运行 Nginx 时，可将 [`nginx/dsh.conf.example`](nginx/dsh.conf.example) 作为配置起点。在 `.env` 中将 `DSH_TRUSTED_HOST` 设置为公网主机名，替换示例中的 `dsh.example.com`，然后校验并重载宿主机上的 Nginx 服务。
