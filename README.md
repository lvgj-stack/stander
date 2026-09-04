# Stander

端口转发系统。控制面、管理后台、转发 agent 在同一个仓库、同一个 Go module、同一个二进制里。

## 子命令

```bash
stander server            # 控制面 + 管理后台，同进程同端口
stander agent -a <addr> -k <key>   # 转发节点
stander gen               # 从数据库重新生成 gorm-gen 代码
```

全局参数：`-c/--config-path`（默认 `stander.yaml`）、`--log-level`、`--pprof-addr`（默认 `:48123`，置空则不启动）。

## 快速开始

```bash
mysql -u root -p stander < sql/init.sql
cp etc/stander.yaml stander.yaml   # 改掉 Database 和 Admin.JWTSigningKey
go run . server
```

配置项都可以用 `STANDER_` 前缀的环境变量覆盖，例如
`STANDER_DATABASE_ADDR`、`STANDER_ADMIN_JWTSIGNINGKEY`。

## 目录

| 路径 | 说明 |
|---|---|
| `cmd/` | cobra 子命令 |
| `api/` | 全部 HTTP 路由注册 |
| `internal/service/` | 转发领域服务（节点、链路、规则、套餐、用量） |
| `internal/admin/` | 管理后台的 handler / 请求响应结构 / 中间件 / 模型 |
| `internal/forward/` | 转发数据面：connector、manager、selector |
| `internal/model/` | gorm-gen 产出的 entity 与 dal |
| `internal/client/` | agent → 控制面、gost 客户端 |
| `sql/init.sql` | 建表与初始数据 |
| `docs/api.md` | 接口文档 |

## 路由布局

一个 Hertz 实例，两组前缀：

- 管理后台在根路径：`/auth/*`、`/user/*`、`/role/*`、`/permission/*`、`/stander/*`
- 控制面在 `/api/v1/*`，供 agent 回调和 gost 上报使用

`/stander/*` 是给前端用的门面：它在**进程内**直接调用 `internal/service`，不再像合仓前那样绕一圈 HTTP 打到控制面。

## 部署上的变化

合仓前管理后台和控制面是两个端口两个进程。现在是一个端口：

- **agent 不用动** —— 端口沿用控制面原来的 8123
- **前端要改** —— baseURL 从原来的管理后台端口改成 8123
- `scripts/install.sh` 生成的 systemd unit 已经改成 `stander-agent agent -a ... -k ...`（多了 `agent` 子命令）

## 测试

```bash
go build ./... && go vet ./... && go test ./...
```
