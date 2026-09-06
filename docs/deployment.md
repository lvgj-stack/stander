# 部署

## 三种拓扑

| 场景 | 怎么跑 |
|---|---|
| 本地开发 | `docker compose -f deploy/docker-compose.yaml up` |
| 单机 | `stander server`（后台任务在同进程内） |
| Kubernetes | `stander server --worker=false` × N + `stander worker` × 1 + 控制台 × N |

连不到 `proxy.golang.org` 的网络下（`go mod download` 在 build 里 exit 1），
给本地栈换个模块镜像源——compose 会把它作为 build-arg 传进 Go 那层：

```bash
GOPROXY=https://goproxy.cn,direct docker compose -f deploy/docker-compose.yaml up -d --build
```

宿主机 `go env` 里的 GOPROXY 不算数：那份配置在 `~/.config/go/env` 里，构建
容器读不到。`scripts/e2e-kind.sh` 用的是同一个开关。

基础镜像同理。Docker Hub 对匿名拉取按出口 IP 限流，共享出口下额度经常不是自己用掉
的，构建会停在解析 manifest 那一步——一层都还没下就 429：

```
failed to resolve source metadata for docker.io/nginxinc/nginx-unprivileged:
unexpected status from HEAD request ...: 429 Too Many Requests
```

换个 pull-through 镜像源，compose 会把它传给两个镜像的构建，MySQL 也跟着走：

```bash
DOCKER_MIRROR=mirror.gcr.io docker compose -f deploy/docker-compose.yaml up -d --build
```

只换 registry 主机，tag 还是上游那个。`scripts/e2e-kind.sh` 和两个 Dockerfile
（`--build-arg DOCKER_MIRROR=...`）认同一个变量。后端的运行时镜像在 gcr.io 上，
不限流，所以是写死的。

要长期解决就别走匿名：`docker login` 之后额度按账号算，或者在
`/etc/docker/daemon.json` 里配 `registry-mirrors`，那样对所有项目一次生效。

CI/CD 见 [cicd.md](cicd.md)。每个 PR 都会把整套清单部署到一个真实的 kind 集群上
跑一遍，所以这里写的步骤是被机器验证过的，不是纸面流程。

## 一条不能违反的规则

**`stander worker` 必须恰好有一个实例在跑。**

它会遍历所有用户把流量周期往前推进，两个实例同时跑会重复推进，用户的重置时间会
被多加一个周期。这条约束在清单里落实为：

- `worker` Deployment 的 `replicas: 1`
- `strategy: Recreate`——如果用默认的 `RollingUpdate`，滚动更新期间会短暂存在
  两个 worker，恰好就是要防的情况
- **不给它配 HPA**
- **不给它配 PDB**——单副本的 PodDisruptionBudget 会永久阻塞节点排空

对应地，API 的 Deployment 必须带 `--worker=false`，否则每个副本都会跑一份后台
任务。这是 `--worker` 这个开关存在的唯一理由。

## Kubernetes

清单在 `deploy/k8s`，用 kustomize 组织：

```
deploy/k8s/
├── base/                 通用定义（API、worker、控制台）
├── overlays/dev/         单副本 + 进程内 worker + 一个临时 MySQL
├── overlays/prod/        3 副本 + 独立 worker + HPA + PDB + Ingress
└── agent/                可选：集群内的转发节点
```

一共三个 Deployment：`stander-server`（API）、`stander-worker`（单例后台任务）、
`stander-web`（控制台，nginx 托管静态文件；管理端和用户端在同一份静态站点里）。

### 控制台与 API 的路由

Ingress 把 API 前缀直接路由到 `stander` Service，其余交给 `stander-web`：

| 路径 | 去向 |
|---|---|
| `/auth`、`/user`、`/stander` | `stander`（控制台 API） |
| `/api/v1` | `stander`（agent 回调、gost 上报） |
| 其余 | `stander-web`（单页应用：`/admin/*` 管理端、`/portal/*` 用户端） |

**同一个 host 是有意的**：验证码的答案存在服务端 session cookie 里，跨域下需要
`SameSite=None` 才能带上，同源省掉这一整类问题。

同一份前缀清单也出现在 `web/nginx.conf` 和 `web/vite.config.ts` 里——分别是 web
镜像自己反代 API 时（docker compose、单独 `docker run`）和 vite dev server 用的。
**加新前缀三处都要改。**

用户端的路径是 `/portal/*` 而不是 `/user/*`，因为 `/user` 已经是账号接口的前缀，
上面这张表会把它整个路由到后端。

控制台 Pod 用的是 `nginx-unprivileged` 镜像，跑在 uid 101、只读根文件系统上，
和 Go 那两个 workload 同一套安全约束。它挂了三个 emptyDir（`/etc/nginx/conf.d`、
`/var/cache/nginx`、`/tmp`），并且**必须**配 `fsGroup: 101`——否则这些卷会是
root 属主，nginx 的 entrypoint 还没绑端口就会以 "conf.d is not writable" 退出。

### 构建镜像

两个镜像。正常情况下由 `release.yml` 打标签时构建并推到 GHCR，手工构建是：

```bash
docker build \
  --build-arg VERSION=$(git describe --tags --always) \
  --build-arg COMMIT=$(git rev-parse --short HEAD) \
  -t your-registry/stander:0.1.0 .

docker build -t your-registry/stander-web:0.1.0 ./web
```

后端镜像是 distroless static + nonroot，约 35MB；控制台镜像是 nginx + 静态文件，
约 50MB。在国内网络下给后端加 `--build-arg GOPROXY=https://goproxy.cn,direct`；
拉不动 Docker Hub 时两条命令都加 `--build-arg DOCKER_MIRROR=mirror.gcr.io`。

**两个镜像用同一个 tag。** 控制台和它调用的 API 版本对不上不是一个值得支持的状态，
流水线也是这么做的。

### 部署到生产

```bash
# 1. 建库并导入 schema（一次性）
mysql -h <host> -u root -p stander < sql/init.sql

# 2. 创建 Secret（不要进 git）
kubectl create namespace stander
kubectl -n stander create secret generic stander-secrets \
  --from-literal=STANDER_DATABASE_PASSWORD='...' \
  --from-literal=STANDER_ADMIN_JWTSIGNINGKEY="$(openssl rand -base64 32)"

# 3. 改 overlays/prod 里的镜像 tag、Ingress host、数据库地址后部署
kubectl apply -k deploy/k8s/overlays/prod

# 4. 登录控制台，把 admin 和 user01 的口令都改掉（见下）
```

> [!WARNING]
> **第 4 步不是可选的。** `sql/init.sql` 建的 `admin` 和 `user01` 口令都是
> `123456`，脚本在仓库里，这个口令对所有人都是已知的。一个暴露在公网的控制台在改口令
> 之前，任何人都能用管理员身份登进去。
>
> 没改之前，`stander server` 每次启动都会点名还在用默认口令的账号：
>
> ```
> 账号 admin、user01 还在用 sql/init.sql 里的默认口令（123456）。...
> ```
>
> 想确认线上有没有这个问题，看一眼日志就够了：
>
> ```bash
> kubectl -n stander logs deploy/stander-server | grep 默认口令
> ```

部署前可以先看渲染结果：

```bash
kubectl kustomize deploy/k8s/overlays/prod
kubectl apply --dry-run=client -k deploy/k8s/overlays/prod
```

### 本地集群（kind / minikube）

dev overlay 自带一个临时 MySQL。schema 需要带外创建 ConfigMap——kustomize 不允
许引用目录之外的文件，而把 `sql/init.sql` 复制进 overlay 会让它变成第二份真相：

```bash
kubectl create namespace stander-dev
kubectl -n stander-dev create configmap stander-schema \
  --from-file=init.sql=sql/init.sql
kubectl apply -k deploy/k8s/overlays/dev
```

整套流程有脚本，也是 CI 跑的那一个：

```bash
scripts/e2e-kind.sh                 # 建集群、部署、跑检查、删掉
KEEP_CLUSTER=1 scripts/e2e-kind.sh  # 留着集群自己翻
```

### 健康探针

| 路径 | 用途 | 行为 |
|---|---|---|
| `/healthz` | liveness | 只表示进程活着，**不查数据库** |
| `/readyz` | readiness | ping 数据库，不通返回 503 |

liveness 刻意不查数据库：否则数据库一挂，kubelet 会把所有 Pod 反复重启，而数据
库才是真正出问题的那个，重启应用只会让恢复更慢。readiness 查，让连不上库的 Pod
退出 Service。

### 可观测性

所有进程都在同一个端口的 `/metrics` 暴露 Prometheus 指标，清单里已经带好了
`prometheus.io/scrape` 注解。除了 Go runtime 的标准指标，还有：

| 指标 | 说明 |
|---|---|
| `stander_http_requests_total` | 请求数，按路由 / 方法 / 状态码 |
| `stander_http_request_duration_seconds` | 请求延迟直方图 |
| `stander_worker_runs_total` | 后台任务执行次数，按成功/失败。**worker 不再增长就是它挂了** |
| `stander_worker_run_duration_seconds` | 单次后台任务耗时 |

路由标签用的是注册时的路由模式（`/user/:id`）而不是实际 URL——按 URL 打标签会
让每个用户 id 变成一条独立的时间序列，最终把 Prometheus 压垮。没匹配上任何路由
的请求统一折叠成 `<unmatched>`。

日志设置 `STANDER_SERVER_LOGFORMAT=json` 后是每行一个 JSON 对象
（`level` / `ts` / `caller` / `msg`），prod overlay 的 ConfigMap 里已经开了。

### 优雅退出

收到 SIGTERM 后进程会：取消后台 worker → 停止接收新连接 → 给在途请求最多 15 秒
完成 → 关闭数据库连接池。

清单里的 `terminationGracePeriodSeconds: 30` 必须大于这个 15 秒，否则 kubelet 会
在 drain 完成前就发 SIGKILL。改其中一个时记得改另一个
（`internal/server/app.go` 的 `shutdownGrace`）。

## agent

agent 跑在实际做端口转发的机器上。绝大多数情况下那是集群外的独立 VPS。

### 从控制台拿安装命令（推荐）

管理端 › 节点 › 新增节点，创建完直接弹出一条可以粘贴执行的命令；已有节点在行
操作菜单里选 安装命令 也能再拿一次。命令形如：

```bash
curl -fsSL .../install.sh | sudo bash -s -- <controller-addr:8123> <node-key>
```

命令里的控制面地址取自 `Server.ControllerAddr`；**集群部署一定要配上它**——不配
的话服务端只能拿浏览器访问的 Host 加 `Server.Port` 去猜，而 Ingress 后面浏览器
访问控制台和 agent 回连 `/api/v1` 根本不是同一个端口，猜出来的地址是错的。
弹窗里那个地址输入框可以改，改完命令会跟着变并记在浏览器本地，但配置项才是
一劳永逸的做法。

内网/离线部署再配上 `Server.InstallScriptURL`，让命令去自己的镜像取脚本。两项
都在 [configuration.md](configuration.md) 里。

### 手动安装

```bash
curl -fsSL https://raw.githubusercontent.com/lvgj-stack/stander/main/scripts/install.sh \
  | bash -s -- <controller-addr:8123> <node-key> [额外 agent 参数...]
```

脚本会：按机器架构（amd64/arm64）从 GitHub Release 下载对应二进制、用发布时生成的
`SHA256SUMS` 校验、跑一次 `version` 确认能执行，再装成 systemd 服务
（`ExecStart` 是 `stander-agent agent -a ... -k ...`）。二进制由 `release.yml`
在打 tag 时构建发布。

不指定版本时装的是最新**正式版**；仓库还没有正式版（只发过预览版）时，脚本会退回去
装最新的预览版，并在输出里说明。有正式版之后就不会再挑到预览版了，理由见
[cicd.md](cicd.md#发一个预览版)。

常用变体：

```bash
# 装指定版本
STANDER_VERSION=v1.2.0 bash -s -- <addr> <key>       # 管道形式同理
# 内网镜像 / 离线安装：从自己的地址取 stander_linux_<arch> 和 SHA256SUMS
STANDER_ASSET_BASE=https://mirror.internal/stander bash scripts/install.sh <addr> <key>
# 卸载
sudo scripts/install.sh uninstall
```

重复执行是安全的：二进制没变就不重装、不无谓重启；只有版本或参数变了才会重启服务。

需要 gost 数据面时（agent 带 `--enable-gost`），在同一台机器上跑
`sudo scripts/install_gost.sh`。它把 gost 的 API 固定在 `127.0.0.1:19123`——
这个地址在 `internal/client/gost.go` 里是写死的，agent 就按这个连。

### 为什么 agent 不是 DaemonSet

一个 node key 唯一标识一个节点。DaemonSet 的每个 Pod 都会拿同一个 key 去注册，
它们会被控制面认成同一个节点，并争抢同一批转发端口。

如果确实要在集群内跑转发节点，用 `deploy/k8s/agent`：一个节点一个
Deployment（`replicas: 1`），各自配自己的 Secret，靠 nodeSelector 钉在指定节点
上。它需要 `hostNetwork: true`，因为转发端口是运行时才确定的，没法提前声明成
`containerPorts`。

## 已知限制与注意事项

- **API 无状态，可以随便扩。** 用户当期已用流量是从 `user_daily_traffic` 实时算
  的，不是进程内缓存；验证码答案存在 `captcha` 表里，签发和校验可以在不同副本。
  两者都验证过跨副本可用。
- **数据库是单点。** 清单里没有包含 MySQL 的高可用方案，生产上请用托管数据库或
  自建主从。
- **单端口。** 控制台和控制面共用 `Server.Port`。agent 回拨和前端访问是同一个
  地址，Ingress 上不需要分路径。
- **没有 ServiceMonitor / PodMonitor。** 清单用的是 `prometheus.io/*` 注解，
  适配基于注解发现的部署方式。用 Prometheus Operator 的话需要自己补一个
  ServiceMonitor。
- **没有 NetworkPolicy。** agent 从集群外回拨控制面，加策略前要先想清楚放行来源。
- **schema 变更没有迁移工具。** `sql/init.sql` 是全量建表脚本，用了
  `create table if not exists`，可以重复执行，但不会改已存在的表。改表结构需要
  自己写 ALTER，然后跑 `stander gen` 重新生成 `internal/model`。
