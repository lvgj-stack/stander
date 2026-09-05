# 开发

## 起步

```bash
# 依赖：Go 1.22+、Docker
docker compose -f deploy/docker-compose.yaml up -d mysql

export STANDER_DATABASE_ADDR=127.0.0.1:13306
export STANDER_DATABASE_PASSWORD=stander
export STANDER_ADMIN_JWTSIGNINGKEY=dev-only

go run . server
```

访问 `http://localhost:8123/healthz` 确认起来了。

## 验证

```bash
go build ./... && go vet ./... && go test ./...
```

`go vet` 目前是干净的，保持它干净。

## 加一个新的领域动作

以「给节点加一个 Ping 动作」为例，一共三步：

**1. 定义请求和响应**（`internal/service/req/request.go`、`resp/response.go`）

```go
type PingNodeReq struct {
    NodeID int64 `json:"nodeId"`
}
```

**2. 写领域逻辑**（`internal/service/node.go`）

签名固定是 `func(ctx context.Context, r *req.XxxReq) (*resp.YyyResp, error)`。
不要引入 `*app.RequestContext`——`internal/service/boundary_test.go` 会红。
需要知道调用方是谁就用 `identity.FromContext(ctx)`：

```go
func PingNode(ctx context.Context, r *req.PingNodeReq) (*resp.PingNodeResp, error) {
    if err := checkUserNodePermission(ctx, r.NodeID); err != nil {
        return nil, err
    }
    // ...
}
```

**3. 挂到路由上**（`api/dispatch.go`）

```go
case "PingNode":
    res, err = call(c, ctx, service.PingNode)
```

泛型的 `call` 负责绑定请求体，所以这里就一行。如果这个动作也要暴露给控制台，
在 `internal/admin/handler/node.go` 的 switch 里加一个 case，同样用 `call`，再把
结果包成后台的 `{code, message, data}` 信封。

**4. 写测试**

服务层不依赖 HTTP，直接调就行：

```go
ctx := identity.NewContext(context.Background(), identity.Principal{
    UserID: 7, RoleCode: identity.RoleSuperAdmin,
})
got, err := service.PingNode(ctx, &req.PingNodeReq{NodeID: 1})
```

要打到 SQL 就用 `internal/service/service_test.go` 里的 `newMockDB` 辅助函数
（sqlmock）。

## 改数据库表结构

1. 改 `sql/init.sql`
2. 在开发库上执行相应的 ALTER（`init.sql` 只建表，不改已有表）
3. 跑 `stander gen` 或 `scripts/gorm_generate.sh` 重新生成
   `internal/model/entity` 与 `internal/model/dal`

生成的文件带 `// Code generated ... DO NOT EDIT.`，不要手改。

**注意**：`sql/init.sql` 里那几条种子 `INSERT` 是带列名的。给表加列时如果去掉列
名，导入会因为列数对不上直接失败——这个坑踩过一次。

## 测试写在哪

| 位置 | 覆盖什么 |
|---|---|
| `api/route_test.go` | 路由是否都注册上；注册动作本身就是对 Hertz 路由树冲突的断言（冲突会 panic） |
| `api/identity_test.go` | 请求头 / node key 到 `identity.Principal` 的翻译 |
| `api/health_test.go` | 探针语义（liveness 不查库） |
| `internal/service/boundary_test.go` | 架构不变量：service 不许 import web 框架 |
| `internal/service/*_test.go` | 领域逻辑，纯逻辑分支免数据库，需要 SQL 的用 sqlmock |
| `internal/captcha/store_test.go` | 验证码单次使用、过期、清理 |
| `internal/config/config_test.go` | 配置优先级，特别是环境变量覆盖 |

## 一些约定

- 生成代码（`internal/model/entity`、`internal/model/dal`）不手改
- 领域逻辑不引入 web 框架，这条有测试守着
- 涉及身份的判断走 `identity.Principal.IsSuperAdmin()`，不要写
  `RoleCode == "SUPER_ADMIN"`
- `import` 分组：标准库 / 第三方 / 本项目，用
  `goimports -local github.com/lvgj-stack/stander` 整理

## 前端

```bash
cd web
pnpm install
pnpm dev          # http://localhost:5173，API 请求由 vite 代理到 :8123
pnpm test         # Vitest
pnpm lint
pnpm build        # 类型检查 + 构建到 web/dist
```

需要 Node 24（`web/.nvmrc`），包管理器版本由 `packageManager` 字段钉死。
细节和后端接口的几个坑见 [web/README.md](../web/README.md)。

### 加一个页面

控制台分两个端：管理端 `/admin/*`（`SUPER_ADMIN`）和用户端 `/portal/*`（其余角
色）。加页面就是改两个文件：

1. `web/src/routes/index.tsx`——在对应那个端下面加一条路由
2. `web/src/app/admin/admin-nav.tsx` 或 `web/src/app/user/user-nav.tsx`——加菜单项

**不需要往数据库里补记录。** 早先菜单是后端 `permission` 表的一棵树在运行时建出
来的，加页面必须同时插一行，漏了菜单对谁都不可见；那套机制已经删掉了。

## 在 Kubernetes 上跑一遍

改了清单、Dockerfile、探针路径或者 nginx 配置之后，值得在真集群上过一遍——
这些东西单测碰不到：

```bash
scripts/e2e-kind.sh                 # 建 kind 集群、部署、跑检查、删掉
KEEP_CLUSTER=1 scripts/e2e-kind.sh  # 留着集群自己翻
```

需要 docker、kind、kubectl。CI 跑的就是这个脚本，本地和 CI 不会走两条路径。

脚本会把自己的 kubeconfig 写到临时目录并 `export KUBECONFIG` 指过去，**不碰
`~/.kube/config`**。开发机和 CI runner 的当前上下文很可能是某个真集群，
`kubectl apply -k overlays/dev` 打到生产不是一个值得留着的可能性。

国内网络下 Go 镜像拉不到模块时：

```bash
GOPROXY=https://goproxy.cn,direct scripts/e2e-kind.sh
```

## 常用命令

```bash
go run . server                 # 起 API（含进程内 worker）
go run . server --worker=false  # 只起 API
go run . worker                 # 只起后台任务
go run . gen                    # 重新生成 gorm-gen 代码
go run . version
go run . <cmd> --help
```
