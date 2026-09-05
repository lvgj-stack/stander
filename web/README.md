# Stander 控制台前端

React + TypeScript + [shadcn/ui](https://ui.shadcn.com)，构建成静态站点，
通过 HTTP 调用 stander 的控制台 API。

一份站点，两个端：

| 端 | 路径 | 谁进得来 |
|---|---|---|
| 管理端 | `/admin/*` | `SUPER_ADMIN` |
| 用户端 | `/portal/*` | 其余所有角色 |

登录后 `/` 按角色重定向到其中一个。详见下面的「两个端」。

## 开发

```bash
cd web
pnpm install
cp .env.example .env      # 可选，默认就指向 127.0.0.1:8123
pnpm dev                  # http://localhost:5173
```

需要 Node 24（见 `.nvmrc`）。开发时 vite 把 `/auth`、`/user`、`/role`、
`/stander` 转发到 `VITE_DEV_PROXY_TARGET`（默认 `http://127.0.0.1:8123`），
所以前后端同源，验证码的 session cookie 能正常带上。

后端起法见仓库根目录的 README。

## 命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 开发服务器 |
| `pnpm build` | 类型检查 + 构建到 `dist/` |
| `pnpm preview` | 本地预览构建产物 |
| `pnpm typecheck` | 只跑 `tsc` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest |

## 部署

产物是纯静态文件。`web/Dockerfile` 打的镜像用 nginx 托管，并把 API 路径反代到
`STANDER_API_UPSTREAM`（默认 `http://stander:8123`）：

```bash
docker compose -f deploy/docker-compose.yaml up
# 控制台：http://localhost:8080  默认账号 admin / 123456（进管理端）
#                                 user01 / 123456（进用户端）
```

**建议保持前端和 API 同源**（像上面这样由 nginx 反代）。验证码的答案存在服务端
session cookie 里，跨域部署需要额外处理 `SameSite=None` 和带凭证的 CORS。
如果确实要分开部署，构建时设 `VITE_API_BASE_URL` 指向后端：

```bash
VITE_API_BASE_URL=https://api.example.com pnpm build
```

## 目录

```
src/
├── api/          # 每个资源一个模块；client.ts 处理信封、JWT、401
├── app/
│   ├── admin/    # 管理端的菜单常量
│   └── user/     # 用户端的菜单常量
├── components/
│   ├── ui/       # shadcn/ui 生成的组件，不手改
│   ├── data-table/
│   └── layout/   # console-shell 是两个端共用的外框
├── features/     # 按业务分目录，一个目录 = 一个页面加它的弹窗
│   └── user/     # 用户端独有的页面
├── hooks/        # use-auth、use-theme、use-table-params、use-action-mutation
├── lib/          # 纯函数：格式化；不依赖 React，单测覆盖在这里
├── routes/       # 路由表与守卫（require-auth 管登录，require-side 管分端）
└── types/        # 后端实体的 TS 镜像
```

## 三件必须知道的后端事实

1. **业务失败时 HTTP 状态码仍然是 200**，只能看信封里的 `code`
   （`internal/admin/handler/base.go`）。`api/client.ts` 统一处理，页面代码
   拿到的要么是 data，要么是抛出的 `ApiError`。
2. **验证码的答案在服务端 session 里**，不在返回的图片里。所以
   `/auth/captcha` 和 `/auth/login` 必须带 cookie，且刷新验证码会让上一个失效。
3. **gorm-gen 实体的字段几乎全是指针**，JSON 里可能是 `null`。`types/api.ts`
   如实写成 `string | null`，渲染统一走 `lib/format.ts`。

后端还有两套并存的接口风格：`/stander/*` 是
`POST /stander/<资源>?Action=<动作>` 加 PascalCase 请求体，其余是常规 REST 加
camelCase 查询参数。`api/client.ts` 的 `action()` 和 `api.get/post/...` 分别
承载，页面代码看不到这个差异。

## 两个端

路由表和菜单都是写死的，一共三个文件：

- `src/routes/index.tsx`——`/login`、`/admin/*`、`/portal/*`，以及 `/` 的分流
- `src/app/admin/admin-nav.tsx`、`src/app/user/user-nav.tsx`——两个端各自的菜单

分端只看一件事：`useAuth().isAdmin`，也就是 `currentRole.code` 是不是
`SUPER_ADMIN`。这跟后端唯一的那条授权边界（`identity.Principal.IsSuperAdmin()`）
是同一条线，所以两个端既不多也不少。

**只看当前角色，不看账号持有的角色列表**——后端读的也正是 JWT 里那一个
`currentRoleCode`。如果这里加个"持有 SUPER_ADMIN 就算管理员"的兜底，一个角色已
经失效的 token 会被送进管理端，而每个接口都按普通用户裁剪，页面全是空的，看起来
像数据丢了。

`RequireSide` 只负责把人送到属于他的那一边，它是路由便利，不是安全边界：两个端
由同一套 API 提供服务，用户端账号的 token 对每条路由都合法。真正拦住越权的在后端
（`middleware.SuperAdmin` 和 service 层的归属检查），手敲管理端 URL 读不到别人的
行，也调不动管理员接口。详见 [architecture.md](../docs/architecture.md) 的
"授权边界"。

**用户端在 `/portal` 而不是 `/user`**：`/user` 是账号接口的前缀，nginx、Ingress
和 vite dev proxy 都会把它整个转给后端，`/user/profile` 会打到 API 而不是前端。

管理端多出来的那些页面（节点、链路、套餐、账号管理）对所有管理员都可见，没有
逐条的可见性开关——SUPER_ADMIN 本来就是后端不作限制的那个角色。

用户端看到的内容由资源授权决定，不由前端决定：管理端 转发用户 › 资源授权 勾中的
节点和链路，才是这个账号在 可用节点 里看得到、在 我的转发规则 里用得上的。没有
授权的账号，用户端是空的——这不是 bug，是还没给它分资源。

以前不是这样：后端返回一棵 `permission` 树，每行带 `path`、`component`（上一版
Vue 前端的文件路径）、`icon`、`order`，前端在运行时据此建路由和 tab，菜单项再按
`code` 过滤。于是"页面存在"和"菜单可见"由两处分别决定：新增一个页面必须同时往
`permission` 表补一条记录，漏了就是对谁都不可见——包括超级管理员，因为它拿到的是
"所有顶级记录"而不是"全部权限"。这套机制连同 `/permission/*` 接口一起删了。

## 主题

默认亮色，右上角可以切到深色，选择记在 `localStorage` 里。默认是**明确的亮色**
而不是跟随系统：系统设成深色的人不应该在没选过的情况下拿到一个深色控制台。

## 后端能力缺口

这几处不是前端偷懒，是后端目前就没有对应接口，界面上都有说明：

- `EditChainGroup` 是空实现（`internal/service/chain_group.go`），所以链路组
  只能新建和删除，改成员要删了重建。
- `ListChainGroups` 只 select 了组 ID 和组名，拿不到组内链路，列表里看不到成员。
  它对非超级管理员还会直接返回空列表。
- 套餐只有 `ListPlans` 和 `AssociatePlan`，没有增删改，要直接动
  `traffic_plan` 表。
- `EditChain` 只写 `chain_name`，所以链路只能改名，端口和节点要删了重建。
