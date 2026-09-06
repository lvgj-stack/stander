# 更新日志

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号规则见
[docs/cicd.md](docs/cicd.md#版本号)：`v<major>.<minor>.<patch>`，预览版加
`-alpha.N` / `-beta.N`。

带 ⚠️ 的条目需要在升级时做点什么，不只是换个镜像。

## v0.1.0-alpha.1（未发布）

第一个公开版本。alpha 的意思是认真的：接口、数据结构、数据库 schema 都还可能变，
换版本时请当作要重新读一遍这份日志。

### 这个版本是什么

端口转发管理系统。控制面、控制台、转发 agent 在同一个仓库、同一个 Go module、
同一个二进制里，用 cobra 子命令决定入口（`server` / `worker` / `agent` / `gen`）。

- **两个端。** 控制台是一份静态站点，登录后按角色分流：管理端 `/admin/*`
  （`SUPER_ADMIN`）管节点、链路、链路组、转发规则、流量套餐、转发用户、账号；
  用户端 `/portal/*`（`USER`）看自己的流量、套餐、转发规则和可用节点。分流点只有
  `identity.Principal.IsSuperAdmin` 一处，服务端同样按它判断。
- **只有两个角色。** 更细的可见性走 `user_role_node_mappings` /
  `user_role_chain_mappings` 里按用户写的行，不靠加角色。
- **节点接入是一条粘贴即用的命令。** 管理端建完节点直接给出安装命令，在目标机器上
  执行即可——脚本下载 agent、写好 systemd 服务并启动，节点自己连回来。已有节点在行
  操作菜单里能再拿一次，两个入口给出的命令一致。
- **流量套餐。** 套餐可以在控制台里建，建的同时就能关联给用户。
- **可观测性。** Prometheus 指标、结构化日志、健康探针、优雅退出；每个响应带请求
  id，错误按类型标准化。
- **部署。** 两个容器镜像（`stander` / `stander-web`）推到 GHCR，amd64 与 arm64
  双架构；`deploy/k8s` 下有 kustomize base 和 dev / prod 两个 overlay，也有一份
  docker compose。agent 二进制随 Release 发布，附 `SHA256SUMS`。

### ⚠️ 装之前要知道的

- **默认口令是公开的。** `sql/init.sql` 建的 `admin` 和 `user01` 口令都是
  `123456`，脚本就在这个仓库里。装完第一件事是把两个都改掉。没改之前
  `stander server` 每次启动都会在日志里点名，改掉才会不再出现。
- **`STANDER_ADMIN_JWTSIGNINGKEY` 必须自己生成**（`openssl rand -base64 32`）。
  签名密钥泄露等于任何人都能伪造登录态，改口令拦不住。
- **建库只有 `sql/init.sql` 一个脚本。** 这是第一个发出去的版本，在它之前没有别人
  跑着的库，所以此前那几个 `migrate-*.sql` 的结果全都并进了 init.sql，脚本本身删掉
  了。往后每个改库结构的版本会带自己的迁移脚本，并记在这里。
- **没有迁移工具。** `init.sql` 是全量建表脚本，可以重复执行，但不会改已存在的表。

### 已知问题

- **被授权的用户能删掉一台共享节点。** `DelNode` 有一条给非管理员走的分支：调用者
  只要在 `user_role_node_mappings` 里有指向这个节点的行就能删掉它。这条分支原本配套
  「用户自己建的节点自己删」，而建节点已经收归管理员，它没跟着走。见
  `.scratch/node-delete-permission/`。
- **改节点能绕过建节点的规则。** 名称不去空格、倍率的判断是 `>= 0`（零能通过），
  而且只改名字的那次请求会把倍率一起写掉。创建路径上这些都已经拦住了，编辑路径没有
  跟上。见 `.scratch/node-edit-validation/`。
- **节点状态只说「注册过没有」，不说「现在活着没有」。** 注册之后没有任何一处再写
  这一列，agent 挂掉状态也不会变。要分辨可达性得有心跳或 last-seen，这个版本两者
  都没有——所以列上写的是「已注册」而不是「在线」。
- **agent 不在自动部署范围内。** `deploy/k8s/agent` 只在 CI 里被渲染校验，发版时
  不会被改写镜像 tag。转发节点绝大多数在集群外的独立 VPS 上，用
  `scripts/install.sh` 装。
