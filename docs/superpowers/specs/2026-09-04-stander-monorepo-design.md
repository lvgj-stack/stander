# Stander Monorepo 重构设计

日期：2026-09-04

## 背景

现有两个仓库：

- **stander-forward** (`github.com/Mr-LvGJ/stander`)：Hertz 服务，单二进制靠 `-a` 参数是否为空隐式区分
  controller / agent 两种角色。包含转发数据面（connector / manager / selector）和控制面
  （service / model / dal，gorm-gen 生成）。
- **naive-admin-go** (`naive-admin-go`)：Gin 后台，自带 auth / user / role / permission，
  并通过 `STANDER_URL` 走 HTTP 调 controller 的 `/api/v1/*`，复用 stander 的 `req`/`resp` 类型。

两者已经强耦合：naive-admin-go 的 `go.mod` 里有
`replace github.com/Mr-LvGJ/stander => ../../stander`，而且该路径在当前布局下已失效。
两者共用同一个 MySQL 库，`scripts/db_init.sql` 已经包含 admin 的全部表。

## 目标

合并为单一 mono 仓库、单一 Go module、单一二进制，用 cobra 子命令决定入口。

## 已定决策

| 决策点 | 结论 |
|---|---|
| 进程拓扑 | 合并为单进程，cobra 子命令决定入口 |
| HTTP 框架 | 统一 Hertz，admin 从 Gin 移植过来 |
| Git 历史 | 不保留，全新初始化 |
| Module path | `github.com/lvgj-stack/stander` |
| 监听端口 | 单端口，默认 8123（controller 原端口），让存量 agent 零改动 |
| 模型去重 | 做，但作为阶段一之后的独立提交 |

## 目录结构

```
stander/
├── go.mod                     module github.com/lvgj-stack/stander
├── main.go                    → cmd.Execute()
├── cmd/
│   ├── root.go                cobra root，全局 flag
│   ├── server.go              `stander server`   controller + admin 同进程
│   ├── agent.go               `stander agent`
│   └── gen.go                 `stander gen`      gorm-gen 代码生成
├── internal/
│   ├── config/                viper + 环境变量
│   ├── common/                常量、连接器类型
│   ├── db/                    gorm 初始化 + dal.SetDefault
│   ├── model/{entity,dal}/    gorm-gen 产物
│   ├── service/               stander 领域服务
│   ├── admin/{handler,inout,middleware,model}/
│   ├── forward/{connector,manager,selector}/
│   ├── client/                agent→controller、gost 客户端
│   ├── server/                Hertz 实例装配
│   └── utils/                 jwt / captcha / 通用工具
├── api/route.go               统一路由注册
├── sql/init.sql               合并后的建表语句
├── deploy/  scripts/  etc/  docs/
```

用 `internal/` 而非 `pkg/`：admin 曾是唯一外部消费者，合并后不再有外部 import。

## 关键设计

### 1. 消除 admin → controller 的 HTTP 跳转

`internal/service/*.go` 里 `addNode` / `listNode` 这类 per-action 函数目前是私有的，
只被 `NodeSrv` 的 action switch 调用。

- 将这些 per-action 函数**导出**（`listNode` → `ListNode(c context.Context, ctx *app.RequestContext) (*resp.ListNodeResp, error)`）。
- `service.NodeSrv` 的 action switch **保持不变**，继续服务 `/api/v1/node`（agent 回调、gost 上报要用）。
- admin 的 `/stander/node` handler 保留自己的 action switch，把 `client.DoRequest[T](...)`
  换成直接调 `service.ListNode(c, ctx)`，拿到强类型结果后照旧包成 `{code, message, data}` 信封。

两种响应信封原样保留，前端零改动；`naive-admin-go/pkg/client` 与 `STANDER_URL` 整个删除。

**已知坑**：`api/user.go` 的 `Add` 里用 `new(gin.Context)` 伪造上下文去调 `AssociatePlan`。
直接调用后改为在真实请求上下文上显式设置 `X-User-Id` / `X-Role-Id` 对应的 context 值。

### 2. 单端口路由布局

`stander server` 起**一个** Hertz 实例：

- admin 路由挂根路径：`/auth/*`、`/user/*`、`/role/*`、`/permission/*`、`/stander/*`
- controller 路由挂 `/api/v1/*`

前缀不冲突。默认端口 8123，由 `Server.Port` 配置。前端 baseURL 需要从原 admin 端口改到 8123。

`stander agent` 仍然独立部署在远端节点，只注册 agent 路由。

### 3. Gin → Hertz 移植对照

| Gin | Hertz |
|---|---|
| `gin.HandlerFunc` | `app.HandlerFunc` = `func(context.Context, *app.RequestContext)` |
| `c.Bind` / `c.BindJSON` | `ctx.BindAndValidate` / `ctx.BindJSON` |
| `c.Query` / `c.DefaultQuery` | `ctx.Query` / `ctx.DefaultQuery` |
| `c.Param("id")` | `ctx.Param("id")` |
| `c.Set` / `c.Get` | `ctx.Set` / `ctx.Get` |
| `c.JSON(code, obj)` | `ctx.JSON(code, obj)` |
| `c.Data(code, ct, b)` | `ctx.Data(code, ct, b)` |
| `c.Abort()` | `ctx.Abort()` |
| `gin-contrib/sessions` | `hertz-contrib/sessions` v1.0.3 |
| `gin-contrib/cors` | `hertz-contrib/cors` v0.1.0 |
| `zap.S()` | `hlog`（`hertz-contrib/logger/zap` 打底） |

`base64Captcha` 与框架无关，原样保留。

### 4. 去重清单

| 项 | 处理 |
|---|---|
| `pkg/utils/jwt.go` | 无任何调用方，死代码，删除。保留 admin 版（Claims 是超集） |
| `model.User` vs `entity.User` | 映射同一张 `user` 表，是唯一真正的重复。删掉手写的 `model.User`，admin 侧改用 `entity.User`。`role`/`permission`/`profile`/两张关联表在 gorm-gen 侧**没有**对应物，不存在重复，继续手写放在 `internal/admin/model` |
| 配置 | viper 读 `etc/stander.yaml`，`STANDER_` 前缀环境变量覆盖。删除 godotenv / `.env` |
| 日志 | 统一 hlog，8 处 `zap.S()` 改写 |
| DB 句柄 | `db.Dao` 与 `model.InitMysql` 合并为一处 |

### 5. SQL

合并 `stander-forward/scripts/db_init.sql` 与 `naive-admin-go/init.sql` 为 `sql/init.sql`，
并补齐 db_init.sql 缺失的 6 张表：`chain_groups`、`node_chain_mappings`、`traffic_plan`、
`user_daily_traffic`、`user_role_chain_mappings`、`user_role_node_mappings`。

## 实施阶段

**阶段一 — 行为不变的合并**

1. 在 `/root/code/stander` 新建 git 仓库与 go module
2. 搬运两棵树到新目录结构，改写全部 import 到新 module path
3. admin 从 Gin 移植到 Hertz
4. cobra 入口（`server` / `agent` / `gen`）
5. 消除 HTTP 跳转，删除 `pkg/client`
6. 合并 SQL、脚本、文档
7. 验收：`go build ./...`、`go vet ./...` 通过；`stander server --help` / `stander agent --help` 可运行

**阶段二 — 去重**

8. 删除手写的 `model.User`，admin 改用 `entity.User`；`UserDetailRes` 不再靠内嵌
   模型继承 JSON key，改为显式字段 + `NewUserDetailRes` 映射函数
9. 配置统一到 viper（随阶段一一起完成）
10. 日志统一到 hlog（随阶段一一起完成）
11. 验收：同上，且 JSON 线格式测试通过

**范围修正**：设计阶段估的"48 处 `db.Dao` 裸查询改用 `dal.Q`"是把范围说大了。
实际清点后，`db.Dao` 的裸查询里只有 `user` 一张表和 gorm-gen 重复；其余 5 张
admin 表没有 gen 产物，把它们改写成 `dal.Q` 只是换个写法，不消除任何重复，
反而要在没有集成测试兜底的情况下动 40 多处查询。所以只做了 `user` 这一处。

## 测试

现状几乎无测试（仅 `pkg/utils/utils_test.go` 和一个空的 `com_test.go`）。本次补充：

- `api/route_test.go`：表驱动，断言所有预期路由都注册成功（回归网的主力）。
  注册动作本身就是对 Hertz 路由树冲突的断言——冲突会在注册时 panic
- `internal/utils`：jwt 签发/解析/过期/换密钥、captcha 生成与校验、
  `Md5Hash`/`IsPrivateIP`/`GenIpAndPort` 的单测
- `internal/admin/inout`：`UserDetailRes` / `UserListItem` 的 JSON key 集合断言，
  防止去重把前端可见的线格式改掉

不追求覆盖率，目标是给重构提供回归保护。

## 非目标

- 不做按领域的目录重排（`auth/ node/ chain/ ...`）——3000+ 行重写，当前测试覆盖不足以支撑
- 不改任何对外 HTTP 接口的路径与响应结构
- 不改数据库 schema（只补齐缺失建表语句）
