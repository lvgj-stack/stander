# 配置

配置有三个来源，优先级从低到高：

1. 代码里注册的默认值（`internal/config.registerDefaults`）
2. 配置文件（`-c` 指定，默认 `stander.yaml`）
3. `STANDER_` 前缀的环境变量

环境变量名 = `STANDER_` + 配置路径里的点换成下划线，全大写。例如
`Database.Addr` → `STANDER_DATABASE_ADDR`。

**配置文件是可选的。** 走默认路径而文件不存在时，进程用环境变量启动——这是容器
里的常态。但如果显式用 `-c` 指定了一个不存在的文件，会直接报错退出，因为那多半
是操作失误而不是本意。

## 全部配置项

| 配置路径 | 环境变量 | 默认值 | 说明 |
|---|---|---|---|
| `Server.Port` | `STANDER_SERVER_PORT` | `8123` | HTTP 监听端口。控制台和控制面共用 |
| `Server.LogLevel` | `STANDER_SERVER_LOGLEVEL` | `2` | 0=trace 1=debug 2=info 3=notice 4=warn 5=error |
| `Server.LogFormat` | `STANDER_SERVER_LOGFORMAT` | `text` | `text` 或 `json`。集群里用 `json`，日志采集器才能解析成字段 |
| `Server.Timezone` | `STANDER_SERVER_TIMEZONE` | `Asia/Shanghai` | 进程时区。**会影响每日流量的日期归属**，见下 |
| `Server.WorkerIntervalSeconds` | `STANDER_SERVER_WORKERINTERVALSECONDS` | `30` | 后台任务的执行间隔 |
| `Server.NodeRole` | `STANDER_SERVER_NODEROLE` | `Controller` | 节点角色，由子命令决定，一般不用手动设 |
| `EnableRelay` | `STANDER_ENABLERELAY` | `false` | 是否启用转发链管理器（由 worker 承载） |
| `Database.Addr` | `STANDER_DATABASE_ADDR` | `127.0.0.1:3306` | MySQL 地址 |
| `Database.DBName` | `STANDER_DATABASE_DBNAME` | `stander` | 库名 |
| `Database.Username` | `STANDER_DATABASE_USERNAME` | `root` | 用户名 |
| `Database.Password` | `STANDER_DATABASE_PASSWORD` | 空 | 密码。**放 Secret，不要写进配置文件** |
| `Admin.JWTSigningKey` | `STANDER_ADMIN_JWTSIGNINGKEY` | 空 | 后台 JWT 签名密钥。**放 Secret** |

### 关于 `Server.Timezone`

不只是日志时间戳的问题。`user_daily_traffic.Date` 是一个 `date` 列，取自
`time.Now()`——时区决定了"一天"从几点开始。容器镜像是 distroless，没有
`/etc/localtime`，如果不显式设置就会退回 UTC，每日流量的滚动点比宿主机上跑的
二进制差 8 小时。时区数据通过 `time/tzdata` 内嵌进二进制，所以镜像里不需要
额外装 tzdata 包。

## agent 的参数

agent 不读配置文件，全部走命令行参数：

| 参数 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `-a, --controller-addr` | 是 | | 控制面地址 `ip:port` |
| `-k, --node-key` | 是 | | 节点密钥，由控制面在添加节点时签发 |
| `-p, --port` | | `18123` | agent 自身的 HTTP 端口 |
| `--ip` / `--ipv6` | | 自动探测 | 对外地址 |
| `--manager-ip` | | 同 `--ip` | 控制面下发规则时回拨的地址 |
| `--listen-ip` | | | 转发监听地址 |
| `--prefer-ipv6` | | `false` | 优先使用 IPv6 |
| `--enable-udp` | | `true` | 开启 UDP 转发 |
| `--enable-gost` | | `false` | 使用 gost 作为转发实现 |

## 全局参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `-c, --config-path` | `stander.yaml` | 配置文件路径 |
| `--log-level` | `2` | 覆盖配置里的日志级别 |
| `--pprof-addr` | `:48123` | pprof 监听地址，置空则不启动 |

## 示例

最小的配置文件：

```yaml
Server:
  Port: 8123
  Timezone: Asia/Shanghai
Database:
  Addr: 127.0.0.1:3306
  DBName: stander
  Username: stander
Admin: {}   # JWTSigningKey 从环境变量注入
```

纯环境变量启动（Kubernetes 里的用法）：

```bash
export STANDER_DATABASE_ADDR=mysql:3306
export STANDER_DATABASE_USERNAME=stander
export STANDER_DATABASE_PASSWORD=...      # 来自 Secret
export STANDER_ADMIN_JWTSIGNINGKEY=...    # 来自 Secret
stander server --worker=false
```
