[api documnet](https://apifox.com/apidoc/shared-ff4a4d32-c0d1-4caf-b0ee-6abc130f734a/api-134496720)

[web demo](https://admin.isme.top/login?redirect=/)

## api 接口

#### 统一返回格式

每个响应都带 `requestId`，同一个值也在 `X-Request-Id` 响应头里，拿它去服务端日志
里搜 `request_id=<id>` 能找到对应的请求。请求里带 `X-Request-Id` 的话会被沿用
（格式不合规的会被换掉）。

失败时 `code` 是分类，`error` 是稳定的机器可读名字——要分支判断请用 `error`，
`message` 是给人看的中文，随时可能改措辞：

| code | error | 含义 |
|---|---|---|
| 0 | （无） | 成功 |
| 400 | `invalid_argument` | 请求参数有误 |
| 401 | `unauthenticated` | 没登录 / 登录态失效 |
| 403 | `permission_denied` | 没权限（**不要**据此清登录态） |
| 404 | `not_found` | 记录不存在 |
| 409 | `conflict` | 和已有数据冲突 |
| 422 | `failed_precondition` | 当前状态下做不了 |
| 503 | `unavailable` | 依赖的服务不可用 |
| 500 | `internal` | 服务端内部错误，把 `requestId` 报给运维 |

注意 `code` 长得像 HTTP 状态码，但**不是**状态行：业务失败的 HTTP 状态仍然是 200。


正确
```
{
    "code":0,
    "message":"OK",
    "data":{},    // data 格式不唯一
    "originUrl":"/auth/login"
}
```
错误
```json
{
  "code":10002,
  "message":"授权已过期",
  "error":"error some",
  "originUrl":"/user/detail"
}
```

### 用户-登陆 post : /api/auth/login

**request**

```
{
    "username":"admin",
    "password":"123456"
}
```

**response**
```
{
    "code":0,
    "message":"OK",
    "data":{
        "accessToken":"zxcvsdfasdf"
    },
    "originUrl":"/auth/login"
}
```

### ----- 以下接口在 header 头中必带 -------

下面标了 **仅管理员** 的接口要求 `currentRoleCode` 是 `SUPER_ADMIN`，否则返回
`{"code":403}`。两个端共用这一套 API，用户端的账号持有的 token 对每条路由都是
合法的，所以这条线只能在服务端画。
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJVSUQiOjEsImV4cCI6MTcwNDk0NzgyMX0.Vkwe1P5JN4s0VxbMmJnA8l0JW5tWFkaicLV6SztJYvU

```

### 用户-详情 get : /api/user/detail

**request**

-

**response**
```
{
    "code":0,
    "message":"OK",
    "data":{
        "id":1,
        "username":"admin",
        "password":"e10adc3949ba59abbe56e057f20f883e",
        "enable":true,
        "createTime":"2023-11-18T16:18:59.150632+08:00",
        "updateTime":"2024-01-08T13:42:46.657891+08:00",
        "profile":{
            "id":1,
            "gender":1,
            "avatar":"https://wpimg.wallstcn.com/f778738c-e4f8-4870-b634-56703b4acafe.gif?imageView2/1/w/80/h/80",
            "address":"444",
            "email":"",
            "UserId":1,
            "NickName":"444"
        },
        "role":"SUPER_ADMIN"
    },
    "originUrl":"/user/detail"
}
```

`role` 只有 `SUPER_ADMIN` 和 `USER` 两个值，决定登录后进哪个端。

它取自 **token** 里的角色，不是库里存的那个——后端鉴权读的就是这一个值
（`identity.Principal.RoleCode` 即 JWT 的 `currentRoleCode`），前端必须跟着它
走：一个人在登录期间被降权，手里的 token 到期前仍然是管理员，按库里的值把他
送去用户端，他反而会看到一堆调不动的接口。库里存着其他角色（没迁移过的老库还
留着 `ROLE_QA`）时一律按 `USER` 返回，因为它们本来就和 `USER` 权限一致。


### 已删除的接口

整组 `/permission/*`、`/role/*`（含 `GET /role`）、以及
`POST /auth/current-role/switch/:role`，都没了。

前端曾经把 `permission` 表当菜单树读：每行带 `path`、`component`、`icon`、
`order`，登录后拉回来在运行时建路由和 tab。现在两个端（用户端 `/portal/*`、
管理端 `/admin/*`）的路由都写死在前端代码里，角色只剩一个作用：决定登录后
进哪个端。

角色只有 `SUPER_ADMIN` 和 `USER` 两个，一个账号一个。于是：

- **`GET /role` 没了**。它存在是为了让账号表单把 code 翻译成本库的角色 id；
  现在表单直接发 code（`"role":"SUPER_ADMIN"`），翻译在服务端做。
- **切换角色没了**。一个账号只有一个角色，没有可切的对象。这个接口原本会拿
  路径里的角色名重新签一个 token，而中间件把它直接抄进 `identity.Principal`
  ——少一个必须写对的校验，比写对它更省心。

permission 两张表已经不在 `sql/init.sql` 里了。`role` / `user_roles_role` 两张表
还在用，它们是"这个账号属于哪个端"的存储。

### 用户-列表 get : /api/user  **仅管理员**

**request**

```
{
    "enable":1,  //可选-状态：1-启用（默认）0-停用
    "gender":1,  //可选-性别：1-男，2-女
	"username":"",//可选-名陈搜索
    "pageNo":1 , //可选-页码 默认1
	"pageSize":10,//可选-数量 默认10
}
```

**response**
```
{
    "code":0,
    "message":"OK",
    "data":{
        "pageData":[
            {
                "id":1,
                "username":"admin",
                "enable":true,
                "createTime":"2023-11-18T16:18:59.150632+08:00",
                "updateTime":"2024-01-08T13:42:46.657891+08:00",
                "gender":1,
                "avatar":"https://wpimg.wallstcn.com/f778738c-e4f8-4870-b634-56703b4acafe.gif?imageView2/1/w/80/h/80",
                "address":"444",
                "email":"",
                "role":"SUPER_ADMIN"
            },
            {
                "id":13,
                "username":"ccc",
                "enable":true,
                "createTime":"2024-01-08T16:27:20.461965+08:00",
                "updateTime":"2024-01-08T16:27:20.461965+08:00",
                "gender":0,
                "avatar":"",
                "address":"",
                "email":"",
                "role":"USER"
            },
            {
                "id":14,
                "username":"eeeee",
                "enable":true,
                "createTime":"2024-01-08T16:30:59.848912+08:00",
                "updateTime":"2024-01-08T17:47:20.567814+08:00",
                "gender":0,
                "avatar":"",
                "address":"",
                "email":"",
                "role":"SUPER_ADMIN"
            }
        ],
        "total":3
    },
    "originUrl":"/user"
}
```

每行一个 `role`，只会是 `SUPER_ADMIN` 或 `USER`——库里存着别的角色（老库的
`ROLE_QA`）也按 `USER` 返回。

### 用户管理-状态停用/启用 patch : /api/user/:id  **仅管理员**

**request**

```
{
    "id":14, //列表id
    "enable":false //停用=false,启用=true
}
```

**response**
```
{
    "code":0,
    "message":"OK",
    "originUrl":"/user/14"
}
```


### 用户管理-新增 post : /api/user  **仅管理员**

**request**

```
{
    "enable":true//可传，默认true
    "username":"x", //必传
    "password":"x",//必传
    "role":"USER" //必传，SUPER_ADMIN 或 USER
}
```

**response**
```
{
    "code":0,
    "message":"OK",
    "data":"",
    "originUrl":"/user"
}
```

### 用户管理-分配所属端 patch : /api/user/:id  **仅管理员**

`role` 决定账号登录后进哪个端：`SUPER_ADMIN` 进管理端，`USER` 进用户端，只接受
这两个值。发的是 code 不是 id——库里的角色 id 不固定（`sql/init.sql` 给的是 1 和
4，从模板长出来的老库未必），服务端按 code 查出 id 再写 `user_roles_role`。

写的时候整行替换：一个账号一个角色，老库里遗留的多余行会一并清掉，否则把某人
移出管理端之后他还留在管理端。

**request**

```
{
    "id":14, //必传-用户id
    "username":"eeeee",
    "role":"USER"
}
```

**response**
```
{
    "code":0,
    "message":"OK",
    "originUrl":"/user/14"
}
```


### 用户管理-重置密码 patch : /api/user/password/reset/:id  **仅管理员**

**request**

```
{
    "id":14, //必传-用户id 
    "password":"new password" //
}
```

**response**
```
{
    "code":0,
    "message":"OK",
    "originUrl":"/user/14"
}
```


###   用户管理-删除用户  delete : /api/user/:id  **仅管理员**

**request**

-

**response**
```
{
    "code":0,
    "message":"OK",
    "data":"",
    "originUrl":"/user/15"
}
```

###  个人资料修改 patch : /api/user/profile/:id

两个端都用得到，所以不限管理员；但传的是 profile 行的 id，服务端会核对这一行属
于调用者本人（管理员除外）。

**request**

```
{
    "id":14, // 必传-用户id 
    "nickName":"eeeename",
    "gender":0,// 0-保密
    "address":"adfsd",
    "email":"adfadsfa"
}
```

**response**
```
{
    "code":0,
    "message":"OK",
    "originUrl":"/user/14"
}
```


###  修改密码 post : /api/auth/password

**request**

```
{
    "oldPassword":"eeeee",// 必传-
    "newPassword":"eeeeee"// 必传
}
```

**response**
```
{
    "code":0,
    "message":"OK",
    "data":true,
    "originUrl":"/auth/password"
}
```

###  资源授权-读取 post : /stander/user?Action=GetUserResources  **仅管理员**

一个用户被授权使用哪些节点和链路。用户端的每一次读写都落在这上面。

**request**
```
{
    "UserId":3
}
```

**response**
```
{
    "code":0,
    "message":"OK",
    "data":{
        "NodeIds":[1,2],
        "ChainIds":[5]
    },
    "originUrl":"/stander/user"
}
```

###  资源授权-保存 post : /stander/user?Action=SetUserResources  **仅管理员**

整组替换，空数组表示收回全部授权。只动这个用户自己的行，管理员建节点时按角色写
的那些行不受影响。

**request**
```
{
    "UserId":3,
    "NodeIds":[1,2],
    "ChainIds":[5]
}
```

**response**
```
{
    "code":0,
    "message":"OK",
    "originUrl":"/stander/user"
}
```

###  节点-安装信息 post : /stander/node?Action=GetAgentInstallInfo

控制台拼装节点安装命令要的那一半：agent 该回连哪里、安装脚本从哪下。另一半是
节点密钥，来自 `AddNode` 的返回或节点列表。

命令本身在前端拼（`web/src/lib/install-command.ts`），因为地址在弹窗里可以改，
改完要立刻看到新命令，不值得为此多跑一趟。

`controllerAddr` 优先取 `Server.ControllerAddr`；没配就拿本次请求的 `Host` 去掉
端口、接上 `Server.Port`，这只是个推测值，前端允许运维改。

**request**
```
{}
```

**response**
```
{
    "code":0,
    "message":"OK",
    "data":{
        "controllerAddr":"controller.example.com:8123",
        "scriptUrl":"https://raw.githubusercontent.com/lvgj-stack/stander/main/scripts/install.sh"
    },
    "originUrl":"/stander/node"
}
```
