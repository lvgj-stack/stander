# Stander 管理后台前端设计

日期：2026-09-04

## 背景

仓库里有完整的后端：一个 Go 二进制，Hertz 在根路径挂管理后台 API，在
`/api/v1` 挂控制面与 agent API。但没有前端——`docs/api.md` 指向的是外部的
一个 Vue 演示站（`admin.isme.top`），仓库自己拿不出可运行的界面。

这份设计描述用 React + shadcn/ui 补上这一块：一个覆盖 RBAC 与 stander
转发业务的完整管理后台，构建成独立静态站点。

## 决策

| 项 | 选择 | 理由 |
|---|---|---|
| 范围 | 完整后台（RBAC + 转发业务） | 之后可彻底不依赖外部 Vue 后台 |
| 交付 | 独立静态站点 | 前后端独立发布；后端已开 `AllowAllOrigins` |
| 菜单 | 前端静态路由 + 后端 code 鉴权 | 权限表 `component` 存的是 Vue 路径，对 React 无意义 |
| 测试 | 关键逻辑 Vitest 单测 | 盯请求层、鉴权、格式化，不测渲染细节 |
| 框架 | Vite + React + TS + React Router + TanStack Query | 复杂度在表格表单，不在路由；路由选最无聊的 |

## 后端接口的两种形态

前端要面对两套并存的风格：

- **REST**：`/auth/*`、`/user/*`、`/role/*`、`/permission/*`，用
  GET/POST/PATCH/DELETE，分页参数走 query（`pageNo`、`pageSize`）。
- **Action**：`/stander/*` 全是 `POST /stander/<资源>?Action=<动作>`，
  参数在 body 里，字段名是 PascalCase（`PageNo`、`NodeName`）。

两者共用同一个响应信封：

```json
{ "code": 0, "message": "OK", "data": {}, "originUrl": "/user/detail" }
```

注意 `code` 非 0 时 **HTTP 状态码仍然是 200**（见
`internal/admin/handler/base.go` 的 `Resp.Err`）。所以"请求是否成功"只能看
`code`，不能看 HTTP 状态。这是请求层要处理的第一件事。

设计上把这两种形态收敛进同一个客户端：`request.get/post/patch/del` 给 REST，
`action(resource, name, payload)` 给 Action 风格。页面代码只调用领域 API
函数（`listNodes(...)`），看不到这个差异。

## 目录结构

```
web/
├── .nvmrc                    # 24（Vite 7 要求 ^20.19 || >=22.12）
├── .env.example              # VITE_API_BASE_URL
├── components.json           # shadcn/ui 配置
├── src/
│   ├── api/                  # 领域 API：每个资源一个文件，导出类型化函数
│   │   ├── client.ts         # 信封拆包、错误归一、JWT 注入、401 处理
│   │   ├── auth.ts  user.ts  role.ts  permission.ts
│   │   └── node.ts  chain.ts  chain-group.ts  rule.ts  plan.ts
│   ├── components/
│   │   ├── ui/               # shadcn/ui 生成的原子组件（不手改）
│   │   ├── data-table/       # 表格外壳：分页、排序、工具栏、空态
│   │   └── layout/           # 侧边栏、顶栏、面包屑、主题切换
│   ├── features/             # 按业务分目录，每个目录 = 一个页面 + 它的表单
│   ├── hooks/                # use-auth、use-permissions、use-data-table
│   ├── lib/                  # 纯函数：格式化、权限过滤、utils
│   ├── routes/               # 路由表 + 守卫
│   └── types/                # 后端实体的 TS 镜像
```

分层规则：`features/` 可以往下依赖 `components/`、`api/`、`lib/`，反过来不行；
`lib/` 不依赖 React 也不依赖 `api/`，保证它可以被纯函数单测覆盖。

## 请求层与鉴权

**信封拆包**（`api/client.ts`）：一次请求经过三道关

1. HTTP 层失败（网络错误、5xx）→ 抛 `ApiError`。
2. `code !== 0` → 抛 `ApiError(code, message)`。UI 统一用 toast 呈现。
3. `code === 0` → 返回 `data`，类型由调用方泛型指定。

**登录态**：`POST /auth/login` 返回 `accessToken`（JWT）。存 localStorage，
每个请求带 `Authorization: Bearer <token>`。收到 `code` 表示鉴权失败或
JWT 中间件返回 401 时，清除 token 并跳登录页。

**验证码**：`GET /auth/captcha` 返回的是图片二进制（不是 JSON 信封），且校验
用的 id 存在 **服务端 session cookie** 里。所以这个请求必须
`credentials: 'include'`，登录请求同理，否则 session 对不上、验证码永远错。
这是最容易踩的一个坑，单测要盯住。

**权限**：登录后拉 `/role/permissions/tree`，把树拍平成 `code` 集合存进
context。菜单项和按钮各自声明需要的 code，`useHasPermission(code)` 决定
是否渲染。SUPER_ADMIN（roleId=1）后端直接返回全部，前端不需要特判。

## 页面清单

| 路由 | 页面 | 后端 |
|---|---|---|
| `/login` | 登录（用户名/密码/验证码） | `/auth/captcha`、`/auth/login` |
| `/` | 概览：节点/链路/规则计数、流量 Top | 复用各列表接口 |
| `/nodes` | 节点：列表、新增（返回 key 需展示一次）、编辑、删除、查看链路关系 | `/stander/node` |
| `/chains` | 链路：列表、新增、改名、删除 | `/stander/chain` |
| `/chain-groups` | 链路组：列表、新增（挑选链路并设权重/备份/超时）、编辑、删除 | `/stander/chain-group` |
| `/rules` | 转发规则：列表、新增、编辑、删除、连通性测试 | `/stander/rule` |
| `/plans` | 流量套餐：列表、关联到用户 | `/stander/plan` |
| `/forward-users` | 转发用户：列表、改到期时间、看套餐与每日流量 | `/stander/user` |
| `/pms/user` | 系统用户：增删改、启停、分配角色、重置密码 | `/user` |
| `/pms/role` | 角色：增删改、分配权限、分配用户 | `/role` |
| `/pms/permission` | 权限：菜单/按钮树的增删改 | `/permission` |
| `/profile` | 个人资料与改密码 | `/user/profile/:id`、`/auth/password` |

## 表格与表单的复用模式

五张业务表格结构一致：工具栏（搜索 + 新增）→ 表格 → 分页。用一个
`DataTable` 组件承载 TanStack Table 的实例，列定义、查询函数、工具栏由页面
传入。分页与搜索状态写进 URL search params，刷新和分享链接不丢状态。

表单统一 react-hook-form + zod：schema 是唯一的真相，类型从 schema 推导，
提交时 zod 校验先跑，通过后才发请求。新增/编辑共用一个表单组件，靠传不传
初始值区分。

## 数据模型上要当心的地方

后端实体是 gorm-gen 生成的，**几乎每个字段都是指针**，序列化成 JSON 后可能
是 `null`。TS 类型必须如实写成 `string | null`，页面渲染一律走
`formatNullable` 之类的辅助函数，不能假设有值。

字段命名是混的：实体 JSON 是 camelCase（`nodeName`、`listenPort`），而
Action 请求体是 PascalCase（`NodeName`、`ListenPort`）。类型定义里分开建模：
`types/` 放响应实体，各 api 文件里放请求参数类型。

流量字段：`GetUserPlanInfo` 的 `PlanTraffic` / `UsedTraffic` 是 int32，
`entity.Rule.Traffic` 是 int64 字节数。展示统一走 `formatBytes`。

## 错误处理

- 请求失败 → toast 显示 `message`（后端返回的是中文文案，直接展示）。
- 表单校验失败 → 字段下方内联提示，不弹 toast。
- 401 / 登录态失效 → 清 token，跳 `/login`，带上 `redirect` 参数。
- 列表为空 vs 加载中 vs 出错 → `DataTable` 三种态各自有明确呈现，不共用。

## 测试

Vitest + happy-dom，只测确实容易错的地方：

1. `api/client.ts`：`code!==0` 抛错、`code===0` 拆包、HTTP 200 但业务失败、
   token 注入、401 清理登录态。
2. `lib/permissions.ts`：权限树拍平成 code 集合、菜单按 code 过滤。
3. `lib/format.ts`：字节格式化、可空字段、时间格式化。
4. `api/*.ts` 的请求构造：Action 风格 URL 与 body 拼装正确。

不测组件渲染。`tsc --noEmit` 与 ESLint 进 CI 门槛。

## 构建与交付

`pnpm build` 产出 `web/dist`，纯静态。`VITE_API_BASE_URL` 指向后端地址，
构建期注入。仓库里附一份 `web/Dockerfile`（nginx 托管 + SPA fallback）和
nginx 配置，让静态站点能和后端一起用 docker compose 起起来。

后端不需要改动。
