# dsh-docker

用于运行 DeepSeek Harness Web UI 的 Docker 模板。[English](README.md)

## 快速启动

```sh
cp .env.example .env
docker compose up -d
```

通过 Web UI 配置提供方 URL、凭据和模型。公网部署需要先通过 Nginx 的会话登录页（默认 24 小时过期），才能使用这些配置功能。

打开 <http://localhost:3080>。

停止服务：

```sh
docker compose down
```

## 本地数据与实时配置

- `config/` 挂载到容器内的 `/dsh-home`，保存 Harness 状态和用户配置。
- `workspace/` 挂载到容器内的 `/home/node`，这是 Web UI 默认显示的工作区位置；在 `.env` 中设置 `DSH_WORKSPACE` 可改用自定义宿主目录。
- 用 `dsh plugin` 通过 pnpm 管理 profile 插件，例如 `docker compose exec dsh dsh plugin --profile web add <package>`（镜像内置 pnpm）。

启动后，通过 Web UI 配置提供方。公网部署需要先通过 Nginx 的会话登录页。DSH 会监视 `config/` 下的用户配置和凭据文件；修改后会作用于后续请求，不需要重启容器。`.env` 只保存宿主端口、Nginx 信任主机等 Compose 配置。

## 端口配置

宿主机上对外只发布两个端口，统一定义在 `.env`：

```env
DSH_PORT=3080   # DSH Web UI，发布到宿主 127.0.0.1
AUTH_PORT=8081  # 登录/会话服务，发布到宿主 127.0.0.1
```

- Compose 的发布映射和 DSH 的信任围栏（`--trusted-host`）都会自动读取 `DSH_PORT`，不需要改其他文件。
- 容器内部端口是私有常量、不对外发布，改端口时无需理会：DSH 容器内 socat `3080` → `dsh web` `3081`，认证服务容器内 `8081`。
- Nginx 是宿主机上唯一需要同步的地方。端口字面量集中写在 `nginx/dsh.conf.example` 顶部的常量块（两行 `set`，与 `.env` 一一对应）；也可以让 `.env` 成为唯一来源，直接渲染安装：

```sh
./scripts/render-nginx-conf.sh | sudo tee /etc/nginx/sites-available/dsh.conf
```

改端口流程：修改 `.env` → `docker compose up -d` → 重新渲染（或同步常量块）→ `sudo nginx -t && sudo systemctl reload nginx`。

## DSH 更新

每次执行 `docker compose up` 时，Compose 都会重新构建 `dsh` 服务，并在镜像内部使用与 `Dockerfile` 一致的 `oven/bun:1.3.14` 解析并安装 `@deepseek-ai/dsh@latest`。构建不读取仓库中的 `package.json` 或 `bun.lock`；临时 manifest 和依赖只存在于镜像构建过程及最终镜像中。

因此启动需要能够访问 npm registry，且每次启动可能比复用已有镜像花费更长时间。该策略会自动接受 DSH 的新版本，版本兼容性由上游发布决定。

公网部署还必须同步宿主机 Nginx 配置。DSH 将模型、设置和凭据 API 限制为回环同源，`nginx/dsh.conf.example` 通过对已认证的 `/api/` 请求同时传递回环 `Host` 和 `Origin` 来满足该限制。升级模板或从较早配置迁移后，重新渲染并加载配置：

```sh
./scripts/render-nginx-conf.sh | sudo tee /etc/nginx/sites-available/dsh.conf
sudo nginx -t && sudo systemctl reload nginx
```

不要将 `/api/` 的 `proxy_set_header Host $dsh_backend;` 或 `proxy_set_header Origin http://$dsh_backend;` 改回公网 authority；只改其中一个同样会让模型页的配置接口返回 `403`。

镜像还会为 DSH 浏览器客户端应用受保护的兼容补丁，使经过认证的公网 UI 能够加载和编辑设置文档。该补丁不放宽 DSH 的网络监听或 Nginx 认证；仅当 Compose 端口保持回环监听，且所有公网 `/api/` 请求都经过已认证的 Nginx location 时才安全。上游版本若改变预期的客户端实现，镜像构建会失败，必须先完成兼容性审查。

DSH 镜像更新不会丢失 `config/` 和 profile 插件，但插件不会自动升级。每次更新后用 `docker compose exec dsh dsh plugin --profile web list` 验证插件；确认与新版 DSH 兼容后，再单独更新插件。

## 公网部署

公网部署需要 DNS 记录、TLS 证书、Nginx 和带认证的反向代理。不要将 Docker 端口直接暴露到公网。

公网认证采用「登录服务 + 会话 Cookie」：Nginx 通过 `auth_request` 校验每个请求的会话 Cookie，无效或过期时跳转到 `/login/` 登录页。登录会话默认 **24 小时**过期；重启 `auth` 服务会立即使全部会话失效。

在 `.env` 中设置公网 authority 与登录密码：

```env
DSH_PORT=3080
DSH_TRUSTED_HOST=dsh.example.com
AUTH_PASSWORD=<strong random password>
# AUTH_TTL_HOURS=24
```

生成密码：

```sh
openssl rand -base64 24 | tr '+/' '-_' | tr -d '='
```

启动 DSH 与登录服务，并保持宿主端口只监听本机：

```sh
docker compose up -d
```

以 [`nginx/dsh.conf.example`](nginx/dsh.conf.example) 为反向代理起点（端口见「端口配置」一节），设置 `server_name`、TLS 证书路径和 HTTPS 监听器，然后重载 Nginx：

```sh
sudo nginx -t
sudo systemctl reload nginx
```

### 认证行为

- 首次访问任意页面会跳到 `/login/`，输入 `.env` 中的 `AUTH_PASSWORD`。
- 登录后获得 `dsh_session` Cookie（HttpOnly + SameSite=Lax，HTTPS 下另加 Secure），有效期 `AUTH_TTL_HOURS`（默认 24 小时）；到期后自动跳回登录页。
- 会话保存在 `auth` 容器内存中：`docker compose restart auth` 或重启宿主机即全员下线。
- 同一来源 IP 连续 5 次密码错误会被锁定 15 分钟。

最终公网地址为 `https://dsh.example.com`。
