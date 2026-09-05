# CI/CD

两条流水线，都跑在 GitHub Actions 上，都以 Kubernetes 为部署目标。

| 工作流 | 触发 | 做什么 |
|---|---|---|
| `ci.yml` | push 到 main、所有 PR | Go 检查、前端检查、清单校验，最后在真实 k8s 集群上跑端到端 |
| `release.yml` | 打 `v*` 标签，或手动触发 | 构建并推送两个镜像到 GHCR，然后滚动更新集群 |

## ci.yml

四个 job，前三个并行，`e2e` 等它们全过。

**go** — `gofmt`（跳过 `.gen.go`）、`go vet`、`go test -race`、`go build`。

**web** — `pnpm typecheck / lint / test / build`。Node 版本从 `web/.nvmrc` 读，
pnpm 版本由 `web/package.json` 的 `packageManager` 字段决定，两边不会漂。

**manifests** — 把每个 overlay 都 `kubectl kustomize` 渲染一遍，再用
[kubeconform](https://github.com/yannh/kubeconform) 按 Kubernetes 的 schema
严格校验。一个渲染不出来的 kustomization，等于一次镜像已经推完才失败的部署。

**e2e** — 这个 job 是重点，它跑的是 `scripts/e2e-kind.sh`：

1. 构建 `stander` 和 `stander-web` 两个镜像
2. 起一个 [kind](https://kind.sigs.k8s.io) 集群，把镜像 side-load 进去
3. 从 `sql/init.sql` 和 `sql/web_menu.sql` 建出 schema ConfigMap
4. `kubectl apply -k deploy/k8s/overlays/dev`——和人手部署用的是同一份清单
5. 等三个 Deployment 全部 rollout 完成
6. 用 HTTP 真跑一遍

第 6 步检查的都是单测抓不到、只会在生产暴露的东西：

- `/healthz` 与 `/readyz`。后者会连数据库，200 才说明 Pod 真能连上 MySQL——
  `/healthz` 是故意不查库的。
- `/metrics` 里有 `stander_` 开头的指标。
- 控制台返回 SPA，且 `/pms/role` 这类客户端路由能 fallback 到 index.html
  （否则用户在任何页面刷新都是 404）。
- 验证码返回的是图片，**并且带上了 session cookie**。答案在 cookie 里不在图里，
  cookie 丢了登录就永远不可能成功。
- 登录请求打到 handler 并被验证码拒绝。这里解不出验证码，但"被验证码拒绝"
  恰好证明路由、JSON 绑定、数据库查询这条链路是通的——路由错了会是 404 或 502。
- `permission` 表里有 `sql/web_menu.sql` 插的三条记录，否则控制台那三个菜单
  对谁都不可见。
- `stander-worker` 在 dev overlay 里副本数是 0。worker 必须全局恰好一个实例，
  这条不变量值得被机器盯着。

失败时脚本会 dump pod 状态、events 和三个 Deployment 的日志再退出。

脚本把自己的 kubeconfig 写在临时目录里并 `export KUBECONFIG` 指过去，
**不读也不改 `~/.kube/config`**，创建集群之后还会再确认一次目标确实是 kind
节点才肯 apply。开发机和 CI runner 的当前上下文很可能是某个真集群，
`kubectl apply -k overlays/dev` 打到生产不是一个值得留着的可能性。

本地跑同一套：

```bash
scripts/e2e-kind.sh                 # 建集群、测、删掉
KEEP_CLUSTER=1 scripts/e2e-kind.sh  # 留着集群自己翻
```

只需要 docker、kind、kubectl。

集群的 Kubernetes 版本钉在脚本里的 `KIND_NODE_IMAGE`（当前 `v1.32.2`），
跟着真实集群的版本走，而不是跟着 kind 的默认值——默认值每个 kind 版本都在变，
而 e2e 应该在你实际要部署的那个版本上跑。

**cgroup v1 的宿主机上，kind 起不来或者时好时坏。** 现象是卡在
"Starting control-plane"，节点里的 kubelet 反复以
`cgroup ["kubelet" "kubepods"] has some missing paths` 退出。
GitHub 的 ubuntu runner 是 cgroup v2，不受影响；老一点的开发机会踩到。

确认宿主机是哪种：

```bash
ls /sys/fs/cgroup/cgroup.controllers >/dev/null 2>&1 && echo v2 || echo v1
```

v1 上的应急办法是把 kubelet 缺的那几个 cgroup 目录补出来再重启它——脚本里
故意没有做这件事，往节点的 `/sys/fs/cgroup` 里塞东西是绕过环境限制，不是
这套流水线该承担的职责：

```bash
node=stander-e2e-control-plane
docker exec $node mkdir -p \
  /sys/fs/cgroup/systemd/kubelet.slice/kubelet-kubepods.slice \
  /sys/fs/cgroup/systemd/kubelet.slice/kubelet-kubepods.slice/kubelet-kubepods-besteffort.slice \
  /sys/fs/cgroup/systemd/kubelet.slice/kubelet-kubepods.slice/kubelet-kubepods-burstable.slice
docker exec $node systemctl restart kubelet
```

脚本会继续往下跑。真要经常在这种机器上跑，升级宿主机到 cgroup v2 更省事。

国内网络下 Go 模块拉不到时：

```bash
GOPROXY=https://goproxy.cn,direct scripts/e2e-kind.sh
```

## release.yml

**images** — 用 buildx 构建 `linux/amd64` 和 `linux/arm64`，推到
`ghcr.io/<owner>/stander` 和 `ghcr.io/<owner>/stander-web`。

**两个镜像永远同一个 tag。** 控制台和它调用的 API 版本对不上，不是一个值得支持的
状态。tag 来自版本标签（`v1.2.3` → `1.2.3`），手动触发时用 commit 短 SHA。

**binaries** — 只在打 tag 时跑（`workflow_dispatch` 手动部署没有对应的 Release
可以挂产物）。交叉编译 `stander_linux_amd64` 和 `stander_linux_arm64`，生成
`SHA256SUMS`，用 `gh release upload --clobber` 挂到这个 tag 的 Release 上。
`scripts/install.sh` 就按机器架构从这里下载并校验，所以产物名字要和脚本对齐。

**deploy** — 把 overlay 的 `images` 块改写成刚推的镜像，渲染、`kubectl diff`
展示变更、apply、然后等三个 Deployment 全部 rollout 完成。任何一个没起来就
`rollout undo` 回滚并让 job 失败。

没有那个 rollout status，job 会在 Pod 还在 crash-loop 的时候就变绿。

### 需要配的东西

`deploy` job 绑定在 GitHub Environment 上（`prod` 或 `dev`），每个环境要有：

| Secret | 内容 |
|---|---|
| `KUBECONFIG` | base64 编码的 kubeconfig，权限只给 stander 那个 namespace |

```bash
kubectl config view --minify --flatten | base64 -w0
```

推荐给 `prod` 环境打开 required reviewers，这样上线要人点一下。

集群里的应用密钥不走 CI，另外建：

```bash
kubectl -n stander create secret generic stander-secrets \
  --from-literal=STANDER_DATABASE_PASSWORD='...' \
  --from-literal=STANDER_ADMIN_JWTSIGNINGKEY="$(openssl rand -base64 32)"
```

`deploy/k8s/overlays/prod/kustomization.yaml` 里也写了：这个 Secret 故意不
generate，凭据不进 git。

### agent 不在自动部署范围内

`deploy/k8s/agent` 只在 CI 里被渲染和校验，不会被自动部署，它的镜像 tag 也不会
被改写。转发节点绝大多数跑在集群外的独立 VPS 上（用 `scripts/install.sh` 装），
把它塞进控制面的发布流程里，等于每次上线都去动别人机器上的转发进程。

集群内确实跑了 agent 的话，跟着手动更新：

```bash
kubectl -n stander set image deploy/stander-agent stander=ghcr.io/<owner>/stander:<tag>
```

## 三个版本号必须一起动

`go.mod` 的 go 指令、`Dockerfile` 的 builder 镜像、`ci.yml` 里 `setup-go` 的
`go-version`。三者漂开的表现是构建时静默下载另一个 toolchain，很难查。
（这个仓库出现过：go.mod 要 1.25，Dockerfile 却写 1.24。）

## API 前缀列在两个地方

后端的管理接口前缀——`/auth`、`/user`、`/role`、`/permission`、`/stander`——
出现在两处：

- `deploy/k8s/overlays/prod/ingress.yaml`：Kubernetes 里由 Ingress 直接把这些
  路径路由到 stander Service
- `web/nginx.conf`：web 镜像自己反代时用（docker compose、单独 docker run）

加新前缀要改两处。`/api/v1`（agent 回调和 gost 上报）只在 Ingress 里，
控制台不碰它。
