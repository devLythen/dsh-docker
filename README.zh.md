# dsh-docker

用于运行 DeepSeek Harness Web UI 的 Docker 模板。

## 快速启动

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

认证必须覆盖所有路径，并保留示例中的 loopback `Host` 和 `Origin` 请求头。这是 DSH 的 settings 和 credentials 敏感接口正常工作的必要条件。最终公网地址为 `https://dsh.example.com:738`。
