# CI/CD

两条流水线，都跑在 GitHub Actions 上。

| 工作流 | 触发 | 做什么 |
|---|---|---|
| `ci.yml` | push 到 main、所有 PR | Go 检查、前端检查、清单校验，最后在真实 k8s 集群上跑端到端 |
| `release.yml` | 打 `v*` 标签，或手动触发 | 构建并推送两个镜像到 GHCR，发布 agent 二进制 |

**流水线只发布，不部署。** 把新镜像滚到集群上是一个人做的决定，做法见
[deployment.md](deployment.md)。CI 里唯一会真的部署的是 `ci.yml` 的 `e2e`，
而它部署的是一个用完就扔的 kind 集群。

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
3. 从 `sql/init.sql` 建出 schema ConfigMap
4. `kubectl apply -k deploy/k8s/overlays/dev`——和人手部署用的是同一份清单
5. 等三个 Deployment 全部 rollout 完成
6. 用 HTTP 真跑一遍

第 6 步检查的都是单测抓不到、只会在生产暴露的东西：

- `/healthz` 与 `/readyz`。后者会连数据库，200 才说明 Pod 真能连上 MySQL——
  `/healthz` 是故意不查库的。
- `/metrics` 里有 `stander_` 开头的指标。
- 控制台返回 SPA，且 `/admin/nodes` 这类客户端路由能 fallback 到 index.html
  （否则用户在任何页面刷新都是 404）。
- 用种子账号真登录一次，请求打的是控制台而不是 API。一个请求把整条链路走完：
  nginx 反代 `/auth`、Hertz 路由、JSON 绑定、用户查询，最后返回 token——路由错
  了会是 404 或 502。反过来再发一次错口令，必须拿不到 token。
- `role` 表里有 `SUPER_ADMIN` 和 `USER` 两条记录。登录后进哪个端由角色决定，
  缺了 `SUPER_ADMIN` 就没人能进管理端。
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

**meta** — 单独一个 job，只做一件事：算出 tag、owner，以及**这次是不是预览版**。

tag 来自版本标签（`v1.2.3` → `1.2.3`），手动触发时用 commit 短 SHA。
**两个镜像永远同一个 tag。** 控制台和它调用的 API 版本对不上，不是一个值得支持的
状态。

预览版按 semver 自己的规则判定：**版本号里有连字符就是预览版**（`v0.1.0-alpha.1` 是，
`v0.1.0` 不是）。这个判断之所以单拎出来放在一个 job 里，是因为下面两处都要用它，
而两处答案不一致正是预览版会变成默认安装物的原因：

- images 只在**非预览版**时才推 `:latest`；
- binaries 建 Release 时按它决定加不加 `--prerelease`。

**images** — 用 buildx 构建 `linux/amd64` 和 `linux/arm64`，推到
`ghcr.io/<owner>/stander` 和 `ghcr.io/<owner>/stander-web`。

**binaries** — 只在打 tag 时跑（手动触发的那次没有版本标签，也就没有对应的 Release
可以挂产物）。

第一步是**确保 Release 存在**：推 tag 本身不会建 Release，少了这一步
`gh release upload` 会以「release not found」失败——而那时两个镜像已经推上去了，
于是这个版本有镜像却没有 agent 二进制，`scripts/install.sh` 要下的正是它。已经存在
的 Release 不动，只往里传产物，所以先在网页上写好 release notes 再推 tag 也可以。

然后交叉编译 `stander_linux_amd64` 和 `stander_linux_arm64`，生成 `SHA256SUMS`，用
`gh release upload --clobber` 挂上去。`scripts/install.sh` 就按机器架构从这里下载并
校验，所以产物名字要和脚本对齐。

## 版本号

`v<major>.<minor>.<patch>`，预览版在后面加 `-alpha.N` 或 `-beta.N`：

```
v0.1.0-alpha.1    还在动，接口和数据结构都可能改，只给愿意跟着改的人
v0.1.0-beta.1     功能齐了，等的是真实环境里的问题
v0.1.0            正式版
```

同一个 `v0.1.0` 下 alpha 和 beta 各自从 1 开始递增，正式版发出去之后这个号码归零，
下一轮从 `v0.2.0-alpha.1` 开始。

**带连字符的就是预览版。** 这是 semver 自己的规则，CI 也就照这一条判断，不另立名单：
往后想加 `-rc.1` 直接加，不用改 workflow。

### 发一个预览版

```bash
git tag v0.1.0-alpha.1 && git push origin v0.1.0-alpha.1
```

会发生的事：两个镜像推成 `:0.1.0-alpha.1`，**`:latest` 不动**；GitHub Release 建出来
并标成 prerelease，agent 二进制和 `SHA256SUMS` 挂在上面。

**不会**发生的事：不部署——正式版也一样，见下。

### 预览版和安装脚本的联动

GitHub 的 `/releases/latest` **不含 prerelease**，而 `scripts/install.sh` 默认就是从
那里下载的。所以在「只发过预览版、还没有正式版」的仓库上，控制台给出的那条安装命令会
404。脚本因此有一条**只在这条默认路径失败之后**才走的回退：查一次 API 拿最新的 release
（含预览版）再下一次。一旦有了正式版，重定向就能解析，这条回退再也走不到，预览版也就
不会盖过正式版。

要装某个指定版本，绕开这套判断：

```bash
curl -fsSL .../install.sh | sudo STANDER_VERSION=v0.1.0-alpha.1 bash -s -- <addr> <key>
```

## 部署不在流水线里

`release.yml` 到「镜像推上 GHCR、二进制挂上 Release」为止。没有 deploy job，也就
没有 `KUBECONFIG` secret、没有 GitHub Environment 要配。

这条边界不是省事，是因为「构建出一个版本」和「决定线上跑哪个版本」是两个决定，凑在
一个 tag 上就只剩一个了：想发布一个能让别人装的版本，就必须同时接受它立刻上线。

上线是手动的一条命令：

```bash
kubectl -n stander set image \
  deploy/stander-server stander=ghcr.io/<owner>/stander:<tag> \
  && kubectl -n stander set image \
  deploy/stander-web stander-web=ghcr.io/<owner>/stander-web:<tag> \
  && kubectl -n stander set image \
  deploy/stander-worker stander=ghcr.io/<owner>/stander:<tag>

kubectl -n stander rollout status deploy/stander-server --timeout=300s
```

或者改 `deploy/k8s/overlays/prod/kustomization.yaml` 里的 `newTag` 再
`kubectl apply -k`——那份 overlay 才是「线上应该是哪个版本」的记录，让流水线在背后改写
它，等于让 git 里那个值长期是假的。**三个 Deployment 用同一个 tag**，理由和两个镜像
同 tag 一样。集群侧的完整说明见 [deployment.md](deployment.md)。

转发节点更是从来不在自动范围内：它们绝大多数跑在集群外的独立 VPS 上（用
`scripts/install.sh` 装），把它们塞进控制面的发布流程，等于每次上线都去动别人机器上
的转发进程。`deploy/k8s/agent` 只在 CI 里被渲染和校验。

## 三个版本号必须一起动

`go.mod` 的 go 指令、`Dockerfile` 的 builder 镜像、`ci.yml` 里 `setup-go` 的
`go-version`。三者漂开的表现是构建时静默下载另一个 toolchain，很难查。
（这个仓库出现过：go.mod 要 1.25，Dockerfile 却写 1.24。）

## API 前缀列在三个地方

后端的控制台接口前缀——`/auth`、`/user`、`/role`、`/stander`——出现在三处：

- `deploy/k8s/overlays/prod/ingress.yaml`：Kubernetes 里由 Ingress 直接把这些
  路径路由到 stander Service
- `web/nginx.conf`：web 镜像自己反代时用（docker compose、单独 docker run）
- `web/vite.config.ts`：vite dev server 的 proxy

前端自己的路由必须绕开这张清单：用户端在 `/portal/*` 而不是 `/user/*`，就是
因为 `/user` 已经被账号接口占了。

加新前缀三处都要改。`/api/v1`（agent 回调和 gost 上报）只在 Ingress 里，
控制台不碰它。
