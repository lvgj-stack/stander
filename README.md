# Stander

端口转发系统。控制面、控制台、转发 agent 在同一个仓库、同一个 Go module、
同一个二进制里，用 cobra 子命令决定入口。

## 子命令

```bash
stander server                     # API：控制面 + 控制台（默认含进程内后台任务）
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
# 起一个本地栈：MySQL + stander + 控制台前端
docker compose -f deploy/docker-compose.yaml up

curl localhost:8123/healthz
open http://localhost:8080        # 控制台，默认 admin / 123456（管理端）
```

或者直接跑源码：

```bash
mysql -u root -p stander < sql/init.sql
export STANDER_DATABASE_ADDR=127.0.0.1:3306 STANDER_ADMIN_JWTSIGNINGKEY=$(openssl rand -base64 32)
go run . server
```

配置文件是可选的，所有配置项都能用 `STANDER_` 前缀的环境变量提供，
详见 [configuration.md](docs/configuration.md)。

> [!WARNING]
> **第一件事是改掉默认口令。** `sql/init.sql` 建的两个账号 `admin` 和 `user01`
> 口令都是 `123456`，它就写在这个仓库里，等于公开的。登录后进「个人资料 › 修改密码」
> 改掉，两个都要改。
>
> 没改之前，服务端每次启动都会在日志里点名还在用默认口令的账号。这条警告只有把口令
> 改掉才会消失。
>
> 同一条道理适用于 `STANDER_ADMIN_JWTSIGNINGKEY`：别用示例值，用
> `openssl rand -base64 32` 现生成一个。签名密钥泄露等于任何人都能伪造登录态，
> 改口令也拦不住。

### 接一个转发节点

管理端 › 节点 › 新增节点，创建完控制台直接给出一条安装命令，在目标机器上粘贴
执行即可——脚本会下载 agent、写好 systemd 服务并启动，节点自己就连回来了。已有
节点在行操作菜单里选 安装命令 也能再拿一次。

命令里的控制面地址来自 `Server.ControllerAddr`；部署在 nginx/Ingress 后面时要
配上它，否则服务端只能靠请求的 Host 去猜。详见
[deployment.md](docs/deployment.md#agent)。

## 两个端

控制台是一份静态站点，里面两套写死的路由，登录后按角色分流：

| 端 | 路径 | 谁进得来 | 有什么 |
|---|---|---|---|
| 管理端 | `/admin/*` | `SUPER_ADMIN` | 节点、链路、链路组、转发规则、流量套餐、转发用户、账号管理 |
| 用户端 | `/portal/*` | `USER` | 自己的流量与套餐、自己的转发规则、可用节点、个人资料 |

分流点只有一条：`identity.Principal.IsSuperAdmin()`——后端本来也只有这一条授权
边界，所以端不多不少正好两个。

**角色也正好两个**，一个账号一个，角色除了决定进哪个端不再有别的作用。更细的
可见性走按用户授权（管理端 转发用户 › 资源授权），不是加角色。

用户端能看到哪些节点和链路，由管理端的 转发用户 › 资源授权 决定
（`user_role_node_mappings` / `user_role_chain_mappings`）。这是资源授权，跟被删
掉的菜单权限树不是一回事：那张表决定菜单显示什么，这两张表决定能碰哪些真实资源，
service 层一直在强制执行。

菜单和路由都在前端代码里（`web/src/routes/index.tsx` 加两个 nav 常量）。加页面
不需要往数据库里补记录；早先那套由 `permission` 表在运行时生成菜单和 tab 的机制
已经删掉，`sql/init.sql` 里也没有那两张表。

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
| `internal/admin/` | 控制台后端的 handler / 请求响应结构 / 中间件 / 模型 |
| `internal/forward/` | 转发数据面：connector、manager、selector |
| `internal/model/` | gorm-gen 产出的 entity 与 dal |
| `internal/observability/` | Prometheus 指标与结构化日志 |
| `web/` | 控制台前端（React + shadcn/ui；管理端与用户端在同一份静态站点里） |
| `sql/init.sql` | 建表与初始数据（建库只有这一个脚本） |
| `deploy/` | Dockerfile 编排、Kubernetes 清单 |
| `.github/workflows/` | CI 与发布流水线 |
| `scripts/e2e-kind.sh` | 在 kind 集群上部署并验证整套系统（CI 跑的就是它） |

## 路由布局

一个 Hertz 实例，三组前缀：

- 控制台在根路径：`/auth/*`、`/user/*`、`/role/*`、`/stander/*`
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
| [cicd.md](docs/cicd.md) | CI 检查、版本号规则、怎么发一个版本 |
| [CHANGELOG.md](CHANGELOG.md) | 每个版本改了什么、升级要做什么、已知问题 |

## 升级提示

建库只有一个脚本：`sql/init.sql`。`v0.1.0-alpha.1` 是第一个发出去的版本，在它之前
没有别人跑着的库，所以此前那几个 `migrate-*.sql` 的结果全都并进了 init.sql，脚本本身
删掉了。往后每个改库结构的版本会带自己的迁移脚本，并记在 [CHANGELOG.md](CHANGELOG.md)。

从合仓前的两个进程迁移：控制台和控制面原来是两个端口两个进程，现在是一个端口：

- **agent 不用动**——端口沿用控制面原来的 8123
- **前端要改**——baseURL 从原来的控制台端口改成 8123
- `scripts/install.sh` 生成的 systemd unit 已改成
  `stander-agent agent -a ... -k ...`（多了 `agent` 子命令）

## 测试

```bash
go build ./... && go vet ./... && go test ./...
```

## 许可

[MIT](LICENSE)。
