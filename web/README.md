# Stander 管理后台前端

React + TypeScript + [shadcn/ui](https://ui.shadcn.com)，构建成静态站点，
通过 HTTP 调用 stander 的管理后台 API。

## 开发

```bash
cd web
pnpm install
cp .env.example .env      # 可选，默认就指向 127.0.0.1:8123
pnpm dev                  # http://localhost:5173
```

需要 Node 24（见 `.nvmrc`）。开发时 vite 把 `/auth`、`/user`、`/role`、
`/permission`、`/stander` 转发到 `VITE_DEV_PROXY_TARGET`（默认
`http://127.0.0.1:8123`），所以前后端同源，验证码的 session cookie 能正常带上。

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
# 后台：http://localhost:8080  默认账号 admin / 123456
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
├── components/
│   ├── ui/       # shadcn/ui 生成的组件，不手改
│   ├── data-table/
│   └── layout/
├── features/     # 按业务分目录，一个目录 = 一个页面加它的弹窗
├── hooks/        # use-auth、use-theme、use-table-params、use-action-mutation
├── lib/          # 纯函数：格式化、权限；不依赖 React，单测覆盖在这里
├── routes/       # 路由表、鉴权守卫、导航定义
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

## 菜单与权限

路由表写在 `src/routes/index.tsx`，是静态的。权限表里的 `component` 存的是上一版
Vue 前端的文件路径，对这里没有意义，所以只用 `code`：
`/role/permissions/tree` 返回的树被拍平成 code 集合，
`src/routes/nav.tsx` 里每个菜单项声明自己需要哪个 code。

新增页面时要在 `permission` 表里补一条对应 code 的记录，否则菜单项对谁都不可见
——包括超级管理员，它的树是"所有顶级记录"而不是"全部权限"。
`sql/web_menu.sql` 就是给链路组、流量套餐、转发用户三个页面补的。

## 后端能力缺口

这几处不是前端偷懒，是后端目前就没有对应接口，界面上都有说明：

- `EditChainGroup` 是空实现（`internal/service/chain_group.go`），所以链路组
  只能新建和删除，改成员要删了重建。
- `ListChainGroups` 只 select 了组 ID 和组名，拿不到组内链路，列表里看不到成员。
  它对非超级管理员还会直接返回空列表。
- 套餐只有 `ListPlans` 和 `AssociatePlan`，没有增删改，要直接动
  `traffic_plan` 表。
- `EditChain` 只写 `chain_name`，所以链路只能改名，端口和节点要删了重建。
