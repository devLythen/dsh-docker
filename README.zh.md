# dsh-docker

用于运行 DeepSeek Harness Web UI 的 Docker 模板。

## 快速启动

依赖：Docker Engine 和 Docker Compose。

```sh
cp .env.example .env
docker compose up -d
```

容器启动时不需要提供方凭据。之后可以通过已认证的 Web UI 添加凭据，也可以根据示例创建 `config/.credentials.yaml`。

打开 <http://localhost:3080>。

停止服务：

```sh
docker compose down
```

## 本地数据与实时配置

- `config/settings.yaml` 保存可选的提供方 URL 和模型配置。
- `config/.credentials.yaml` 可选地保存 API Key，不会被 Git 跟踪。
- `workspace/` 挂载到容器内的 `/workspace`，作为 Agent 的工作目录。

DSH 会在挂载的 settings 和 credential 文件存在时监视它们。提供方 URL 或 API Key 修改后会作用于后续请求，不需要重启容器。`.env` 只保存宿主端口、Nginx 信任主机等 Compose 配置。

## 公网部署

公网部署需要 DNS 记录、TLS 证书、Nginx 和带认证的反向代理。不要将 Docker 端口直接暴露到公网。

在 `.env` 中设置公网 authority。外部端口不是默认 HTTPS 端口时，需要包含端口号：

```env
DSH_PORT=3080
DSH_TRUSTED_HOST=dsh.example.com:738
```

启动 DSH，并保持宿主端口只监听本机：

```sh
docker compose up -d --build
```

将路由器的公网 TCP `738` 转发到服务器内网 TCP `443`。以 [`nginx/dsh.conf.example`](nginx/dsh.conf.example) 为反向代理起点，然后设置 `server_name`、TLS 证书路径和 HTTPS 监听器。

重载 Nginx 前，先为整个站点启用 Basic Auth：

```sh
sudo apt-get install apache2-utils
sudo htpasswd -cB /etc/nginx/.htpasswd dsh-admin
sudo nginx -t
sudo systemctl reload nginx
```

认证必须覆盖所有路径，并保留示例中的 loopback `Host` 和 `Origin` 请求头。登录后，在 Web UI 中配置提供方 URL、凭据和模型。默认镜像包含 DeepSeek 适配器；其他提供方类型仍需要对应的适配器包和 profile 组合配置。最终公网地址为 `https://dsh.example.com:738`。
