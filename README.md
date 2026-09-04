# Stander

端口转发系统。控制面、管理后台、转发 agent 在同一个仓库、同一个 Go module、
同一个二进制里，用 cobra 子命令决定入口。

## 子命令

```bash
stander server                     # API：控制面 + 管理后台（默认含进程内后台任务）
stander server --worker=false      # 只起 API，多副本部署时用
stander worker                     # 只起后台任务，必须恰好一个实例
stander agent -a <addr> -k <key>   # 转发节点
stander gen                        # 从数据库重新生成 gorm-gen 代码
stander version
```

全局参数：`-c/--config-path`（默认 `stander.yaml`）、`--log-level`、
`--pprof-addr`（默认 `:48123`，置空则不启动）。

## 快速开始

```bash
# 起一个本地栈：MySQL + stander + 管理后台前端
docker compose -f deploy/docker-compose.yaml up

curl localhost:8123/healthz
open http://localhost:8080        # 管理后台，默认 admin / 123456
```

或者直接跑源码：

```bash
mysql -u root -p stander < sql/init.sql
export STANDER_DATABASE_ADDR=127.0.0.1:3306 STANDER_ADMIN_JWTSIGNINGKEY=$(openssl rand -base64 32)
go run . server
```

配置文件是可选的，所有配置项都能用 `STANDER_` 前缀的环境变量提供，
详见 [configuration.md](docs/configuration.md)。

## 部署到 Kubernetes

```bash
kubectl create namespace stander
kubectl -n stander create secret generic stander-secrets \
  --from-literal=STANDER_DATABASE_PASSWORD='...' \
  --from-literal=STANDER_ADMIN_JWTSIGNINGKEY="$(openssl rand -base64 32)"
kubectl apply -k deploy/k8s/overlays/prod
```

API 无状态、可任意扩副本；`stander worker` 是单例，必须恰好一个；控制台
（`stander-web`）是静态站点，也可任意扩。细节见
[deployment.md](docs/deployment.md)。

每个 PR 都会把整套清单部署到一个真实的 kind 集群上跑通再合并，
见 [cicd.md](docs/cicd.md)。本地跑同一套：`scripts/e2e-kind.sh`。

## 目录

| 路径 | 说明 |
|---|---|
| `cmd/` | cobra 子命令 |
| `api/` | HTTP 路由、参数绑定、action 分发、健康探针 |
| `internal/service/` | 领域逻辑（不依赖任何 web 框架，有测试守着这条边界） |
| `internal/worker/` | 单例后台任务 |
| `internal/identity/` | 调用方身份（类型化 Principal，走 context.Context） |
| `internal/admin/` | 管理后台的 handler / 请求响应结构 / 中间件 / 模型 |
| `internal/forward/` | 转发数据面：connector、manager、selector |
| `internal/model/` | gorm-gen 产出的 entity 与 dal |
| `internal/captcha/` | 数据库支撑的验证码存储（多副本可用） |
| `internal/observability/` | Prometheus 指标与结构化日志 |
| `web/` | 管理后台前端（React + shadcn/ui，构建成静态站点） |
| `sql/init.sql` | 建表与初始数据 |
| `sql/web_menu.sql` | 前端新增页面的菜单权限记录 |
| `deploy/` | Dockerfile 编排、Kubernetes 清单 |
| `.github/workflows/` | CI 与发布流水线 |
| `scripts/e2e-kind.sh` | 在 kind 集群上部署并验证整套系统（CI 跑的就是它） |

## 路由布局

一个 Hertz 实例，三组前缀：

- 管理后台在根路径：`/auth/*`、`/user/*`、`/role/*`、`/permission/*`、`/stander/*`
- 控制面在 `/api/v1/*`，供 agent 回调和 gost 上报使用
- 探针 `/healthz`、`/readyz`，指标 `/metrics`

`/stander/*` 是给前端用的门面，在**进程内**直接调用 `internal/service`。

## 文档

| 文档 | 内容 |
|---|---|
| [architecture.md](docs/architecture.md) | 组成、分层、请求流转、为什么 worker 是单例 |
| [deployment.md](docs/deployment.md) | Kubernetes / Docker / 单机部署，扩容规则，agent 安装 |
| [configuration.md](docs/configuration.md) | 全部配置项、环境变量、默认值 |
| [development.md](docs/development.md) | 本地开发、怎么加一个领域动作、代码生成、测试 |
| [api.md](docs/api.md) | HTTP 接口文档 |

## 升级提示（从合仓前的两个进程迁移）

管理后台和控制面原来是两个端口两个进程，现在是一个端口：

- **agent 不用动**——端口沿用控制面原来的 8123
- **前端要改**——baseURL 从原来的管理后台端口改成 8123
- `scripts/install.sh` 生成的 systemd unit 已改成
  `stander-agent agent -a ... -k ...`（多了 `agent` 子命令）

## 测试

```bash
go build ./... && go vet ./... && go test ./...
```
