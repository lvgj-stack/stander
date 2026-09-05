-- Stander 建表脚本
--
-- 合并自 stander-forward/scripts/db_init.sql 与 naive-admin-go/init.sql。
-- 两个旧脚本描述的是同一个库：naive-admin-go 只建 admin 的 6 张表，
-- db_init.sql 建了 admin 的表加转发相关的表，但缺 6 张（chain_groups、
-- node_chain_mappings、traffic_plan、user_daily_traffic、
-- user_role_chain_mappings、user_role_node_mappings），user / nodes / rules
-- 三张表也漏了几列。这里以 internal/model/entity 下 gorm-gen 的实体为准补齐。

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- 转发数据面
-- ---------------------------------------------------------------------------

create table if not exists nodes
(
    id         bigint unsigned auto_increment primary key,
    created_at datetime(3)                 null,
    updated_at datetime(3)                 null,
    deleted_at datetime(3)                 null,
    node_name  varchar(255)                null,
    ip         varchar(255)                null,
    manager_ip varchar(255)                not null default '',
    port       int                         null,
    `key`      varchar(255)                null,
    -- 建节点时由 AddNode 写 'unregistered'，注册时 RegisterNode 改成 'registered'。
    -- 没有默认值：这一列的取值一律由代码显式写入。
    status     varchar(255)                null,
    node_type  varchar(255)                null,
    ipv4       varchar(255)                null,
    ipv6       varchar(255)                null,
    rate       float        default 1      not null,
    protocol   tinyint      default 0      not null comment '0=TLS,1=TCP',
    iepl       tinyint      default 0      not null,
    -- 安装命令要按它决定加不加 --prefer-ipv6，而安装命令在节点建好之后还会被再打开，
    -- 所以这个选择必须跟着节点存下来。列注释要和迁移脚本里的一字不差：产物是从库里
    -- 反向生成的，注释不一样就会生成出不一样的 tag。
    prefer_ipv6 tinyint(1) default 0       not null comment '建节点时勾的「默认走 IPv6」'
);

create index idx_nodes_deleted_at on nodes (deleted_at);

create table if not exists chains
(
    id         bigint unsigned auto_increment primary key,
    created_at datetime(3)  null,
    updated_at datetime(3)  null,
    deleted_at datetime(3)  null,
    chain_name varchar(255) null,
    ip         varchar(255) null,
    port       int          null,
    protocol   varchar(255) null,
    `key`      varchar(255) null,
    node_id    bigint       not null
);

create index idx_chains_deleted_at on chains (deleted_at);

create table if not exists chain_groups
(
    id               bigint unsigned auto_increment primary key,
    created_at       datetime(3)  null,
    updated_at       datetime(3)  null,
    deleted_at       datetime(3)  null,
    chain_id         bigint unsigned not null,
    chain_group_id   varchar(255) not null,
    chain_group_name varchar(255) null,
    chain_name       varchar(255) null,
    backup           tinyint      default 0 not null,
    max_fails        int unsigned null,
    timeout          int unsigned null,
    weight           int unsigned null
);

create index idx_chain_groups_deleted_at on chain_groups (deleted_at);

create table if not exists node_chain_mappings
(
    node_id  bigint not null,
    chain_id bigint not null
);

create table if not exists rules
(
    id          bigint unsigned auto_increment primary key,
    created_at  datetime(3)      null,
    updated_at  datetime(3)      null,
    deleted_at  datetime(3)      null,
    rule_name   varchar(255)     null,
    node_id     bigint           null,
    chain_id    bigint           null,
    listen_port int              null,
    remote_addr varchar(255)     null,
    protocol    varchar(255)     null,
    traffic     bigint default 0 not null comment '消耗',
    user_id     int              null
);

create index idx_rules_deleted_at on rules (deleted_at);

-- ---------------------------------------------------------------------------
-- 流量套餐与用量
-- ---------------------------------------------------------------------------

create table if not exists traffic_plan
(
    id            bigint unsigned auto_increment primary key,
    created_at    datetime(3)      null,
    updated_at    datetime(3)      null,
    deleted_at    datetime(3)      null,
    total_traffic bigint default 0 not null comment '消耗',
    period        int              null,
    plan_name     varchar(255)     null
);

create index idx_traffic_plan_deleted_at on traffic_plan (deleted_at);

create table if not exists user_daily_traffic
(
    created_at    datetime(3)      null,
    updated_at    datetime(3)      null,
    deleted_at    datetime(3)      null,
    date          date             not null,
    total_traffic bigint default 0 not null comment '消耗',
    user_id       int              not null,
    primary key (date, user_id)
);

create index idx_udt_deleted_at on user_daily_traffic (deleted_at);

-- ---------------------------------------------------------------------------
-- 转发资源的按角色授权
-- ---------------------------------------------------------------------------

create table if not exists user_role_chain_mappings
(
    user_id   int          null,
    role_code varchar(255) null,
    chain_id  int          not null
);

create table if not exists user_role_node_mappings
(
    user_id   int          null,
    role_code varchar(255) null,
    node_id   int          not null
);

-- ---------------------------------------------------------------------------
-- 账号与角色
--
-- 角色只剩一个作用：决定登录后进哪个端。SUPER_ADMIN 进管理端，其余进用户端。
-- 早先还有 permission / role_permissions_permission 两张表，存的是上一版 Vue
-- 前端的菜单树（path、component、icon、order），前端按它动态建路由和 tab。
-- 现在两个端的路由都是前端写死的，那套表没有任何读者，已经删掉。
-- ---------------------------------------------------------------------------

create table if not exists user
(
    id                 int          null,
    username           varchar(50)  null,
    password           varchar(255) null,
    enable             tinyint      null,
    createTime         datetime(6)  null,
    updateTime         datetime(6)  null,
    plan_id            bigint default 0 not null,
    expiration_time    datetime(3)  null,
    reset_traffic_time datetime(3)  null
);

create table if not exists profile
(
    id       int          null,
    gender   int          null,
    avatar   varchar(255) null,
    address  varchar(255) null,
    email    varchar(255) null,
    userId   int          null,
    nickName varchar(10)  null
);

create table if not exists role
(
    id     int         null,
    code   varchar(50) null,
    name   varchar(50) null,
    enable tinyint     null
);

create table if not exists user_roles_role
(
    userId int null,
    roleId int null
);

-- ---------------------------------------------------------------------------
-- 验证码
-- ---------------------------------------------------------------------------

-- 登录验证码的答案。放数据库而不是进程内存，是为了让 API 能跑多副本：
-- 签发验证码的副本和校验的副本通常不是同一个。过期行由 worker 定期清理。
create table if not exists captcha
(
    id         varchar(64)  not null primary key,
    answer     varchar(32)  not null,
    expires_at datetime(3)  not null
);

create index idx_captcha_expires_at on captcha (expires_at);

-- ---------------------------------------------------------------------------
-- 初始数据
-- ---------------------------------------------------------------------------

INSERT INTO `profile` VALUES (1,0,'https://wpimg.wallstcn.com/f778738c-e4f8-4870-b634-56703b4acafe.gif?imageView2/1/w/80/h/80','123123',NULL,1,'admin'),(3,0,'https://api.dicebear.com/7.x/miniavs/svg?seed=412','asdas','lvgj1998@gmail.com',3,'user01');
-- 两个端，两个角色。ROLE_QA（质检员）是 naive-admin-go 模板留下的示例角色，
-- 没有任何代码读它，随权限表一起删了。
INSERT INTO `role` VALUES (1,'SUPER_ADMIN','超级管理员',1),(4,'USER','普通用户',1);
INSERT INTO `user` (`id`,`username`,`password`,`enable`,`createTime`,`updateTime`) VALUES (1,'admin','e10adc3949ba59abbe56e057f20f883e',1,'2023-11-18 16:18:59.150632','2024-10-12 08:07:01.652188'),(3,'user01','e10adc3949ba59abbe56e057f20f883e',1,'2024-10-13 22:55:16.601588','2024-10-13 22:55:16.601588');
-- admin -> 管理端，user01 -> 用户端。一个账号一行，admin 只挂 SUPER_ADMIN。
-- 它曾经同时挂着 USER，为的是用右上角的「切换角色」预览用户端。那个接口连同
-- 「一个账号可以有多个角色」一起删了，这一行于是没有任何读者：登录只看有没有
-- SUPER_ADMIN，多出来的 USER 既不改变进哪个端，也不放开任何东西。
-- 已有的库由 migrate-2026-09-05-two-sides.sql 删掉这类多余的行，两种装法的
-- admin 因此行为一致。
INSERT INTO `user_roles_role` VALUES (1,1),(3,4);
