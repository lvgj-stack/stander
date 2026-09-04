# 部署

## 三种拓扑

| 场景 | 怎么跑 |
|---|---|
| 本地开发 | `docker compose -f deploy/docker-compose.yaml up` |
| 单机 | `stander server`（后台任务在同进程内） |
| Kubernetes | `stander server --worker=false` × N + `stander worker` × 1 |

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
├── base/                 通用定义
├── overlays/dev/         单副本 + 进程内 worker + 一个临时 MySQL
├── overlays/prod/        3 副本 + 独立 worker + HPA + PDB + Ingress
└── agent/                可选：集群内的转发节点
```

### 构建镜像

```bash
docker build \
  --build-arg VERSION=$(git describe --tags --always) \
  --build-arg COMMIT=$(git rev-parse --short HEAD) \
  -t your-registry/stander:0.1.0 .
```

镜像是 distroless static + nonroot，约 35MB。在国内网络下加
`--build-arg GOPROXY=https://goproxy.cn,direct`。

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
```

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

agent 跑在实际做端口转发的机器上。绝大多数情况下那是集群外的独立 VPS，用脚本
安装：

```bash
curl -fsSL https://raw.githubusercontent.com/lvgj-stack/stander/main/scripts/install.sh \
  | bash -s -- <controller-addr:8123> <node-key>
```

脚本会装二进制并生成 systemd unit（`ExecStart` 是 `stander-agent agent -a ... -k ...`）。

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
- **单端口。** 管理后台和控制面共用 `Server.Port`。agent 回拨和前端访问是同一个
  地址，Ingress 上不需要分路径。
- **没有 ServiceMonitor / PodMonitor。** 清单用的是 `prometheus.io/*` 注解，
  适配基于注解发现的部署方式。用 Prometheus Operator 的话需要自己补一个
  ServiceMonitor。
- **没有 NetworkPolicy。** agent 从集群外回拨控制面，加策略前要先想清楚放行来源。
- **schema 变更没有迁移工具。** `sql/init.sql` 是全量建表脚本，用了
  `create table if not exists`，可以重复执行，但不会改已存在的表。改表结构需要
  自己写 ALTER，然后跑 `stander gen` 重新生成 `internal/model`。
