# dsh-docker

用于运行 DeepSeek Harness Web UI 的 Docker 模板。[English](README.md)

## 快速启动

```sh
cp .env.example .env
docker compose up -d
```

通过 Web UI 配置提供方 URL、凭据和模型。公网部署需要先通过 Nginx 的认证提示，才能使用这些配置功能。

打开 <http://localhost:3080>。

停止服务：

```sh
docker compose down
```

## 本地数据与实时配置

- `config/` 挂载到容器内的 `/dsh-home`，保存 Harness 状态和用户配置。
- `workspace/` 挂载到容器内的 `/home/node`，这是 Web UI 默认显示的工作区位置。

启动后，通过 Web UI 配置提供方。公网部署需要先通过 Nginx 的认证提示。DSH 会监视 `config/` 下的用户配置和凭据文件；修改后会作用于后续请求，不需要重启容器。`.env` 只保存宿主端口、Nginx 信任主机等 Compose 配置。

## 公网部署

公网部署需要 DNS 记录、TLS 证书、Nginx 和带认证的反向代理。不要将 Docker 端口直接暴露到公网。

在 `.env` 中设置公网 authority：

```env
DSH_PORT=3080
DSH_TRUSTED_HOST=dsh.example.com
```

启动 DSH，并保持宿主端口只监听本机：

```sh
docker compose up -d --build
```

将路由器的公网 TCP `443` 转发到服务器内网 TCP `443`。以 [`nginx/dsh.conf.example`](nginx/dsh.conf.example) 为反向代理起点，然后设置 `server_name`、TLS 证书路径和 HTTPS 监听器。

重载 Nginx 前，先为整个站点启用 Basic Auth：

```sh
sudo apt-get install apache2-utils
sudo htpasswd -cB /etc/nginx/.htpasswd dsh-admin
sudo nginx -t
sudo systemctl reload nginx
```

最终公网地址为 `https://dsh.example.com`。
