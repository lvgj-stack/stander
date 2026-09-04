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
    status     varchar(255) default '8123' null,
    node_type  varchar(255)                null,
    ipv4       varchar(255)                null,
    ipv6       varchar(255)                null,
    rate       float        default 1      not null,
    protocol   tinyint      default 0      not null comment '0=TLS,1=TCP',
    iepl       tinyint      default 0      not null
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
-- 管理后台：用户、角色、权限
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

create table if not exists permission
(
    id          int          null,
    name        varchar(255) null,
    code        varchar(50)  null,
    type        varchar(255) null,
    parentId    int          null,
    path        varchar(255) null,
    redirect    varchar(255) null,
    icon        varchar(255) null,
    component   varchar(255) null,
    layout      varchar(255) null,
    keepAlive   tinyint      null,
    method      varchar(255) null,
    description varchar(255) null,
    `show`      tinyint      null,
    enable      tinyint      null,
    `order`     int          null
);

create table if not exists user_roles_role
(
    userId int null,
    roleId int null
);

create table if not exists role_permissions_permission
(
    roleId       int null,
    permissionId int null
);

-- ---------------------------------------------------------------------------
-- 初始数据
-- ---------------------------------------------------------------------------

INSERT INTO `permission` VALUES (1,'资源管理','Resource_Mgt','MENU',2,'/pms/resource',NULL,'i-fe:list','/src/views/pms/resource/index.vue',NULL,NULL,NULL,NULL,1,1,1),(2,'系统管理','SysMgt','MENU',NULL,NULL,NULL,'i-fe:grid',NULL,NULL,NULL,NULL,NULL,1,1,2),(3,'角色管理','RoleMgt','MENU',2,'/pms/role',NULL,'i-fe:user-check','/src/views/pms/role/index.vue',NULL,NULL,NULL,NULL,1,1,2),(4,'用户管理','UserMgt','MENU',2,'/pms/user',NULL,'i-fe:user','/src/views/pms/user/index.vue',NULL,1,NULL,NULL,1,1,3),(5,'分配用户','RoleUser','MENU',3,'/pms/role/user/:roleId',NULL,'i-fe:user-plus','/src/views/pms/role/role-user.vue','full',NULL,NULL,NULL,0,1,1),(6,'业务示例','Demo','MENU',NULL,NULL,NULL,'i-fe:grid',NULL,NULL,NULL,NULL,NULL,1,1,1),(7,'图片上传','ImgUpload','MENU',6,'/demo/upload',NULL,'i-fe:image','/src/views/demo/upload/index.vue','',1,NULL,NULL,1,1,2),(8,'个人资料','UserProfile','MENU',NULL,'/profile',NULL,'i-fe:user','/src/views/profile/index.vue',NULL,NULL,NULL,NULL,0,1,99),(9,'基础功能','Base','MENU',NULL,'',NULL,'i-fe:grid',NULL,'',NULL,NULL,NULL,1,1,0),(10,'基础组件','BaseComponents','MENU',9,'/base/components',NULL,'i-me:awesome','/src/views/base/index.vue',NULL,NULL,NULL,NULL,1,1,1),(11,'Unocss','Unocss','MENU',9,'/base/unocss',NULL,'i-me:awesome','/src/views/base/unocss.vue',NULL,NULL,NULL,NULL,1,1,2),(12,'KeepAlive','KeepAlive','MENU',9,'/base/keep-alive',NULL,'i-me:awesome','/src/views/base/keep-alive.vue',NULL,1,NULL,NULL,1,1,3),(13,'创建新用户','AddUser','BUTTON',4,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1,1,1),(14,'图标 Icon','Icon','MENU',9,'/base/icon',NULL,'i-fe:feather','/src/views/base/unocss-icon.vue','',NULL,NULL,NULL,1,1,0),(15,'MeModal','TestModal','MENU',9,'/testModal',NULL,'i-me:dialog','/src/views/base/test-modal.vue',NULL,NULL,NULL,NULL,1,1,5),(21,'服务器','Server','MENU',NULL,'/servers','','i-fe:server','/src/views/servers/index.vue','',0,'','',1,1,10),(22,'转发链','Chain','MENU',NULL,'/chains','','i-fe:fast-forward','/src/views/chains/index.vue','',0,'','',1,1,11),(23,'转发规则','Rule','MENU',NULL,'/rules','','i-fe:list','/src/views/rule/index.vue','',0,'/src/views/rule/index.vue','',1,1,12);
INSERT INTO `profile` VALUES (1,0,'https://wpimg.wallstcn.com/f778738c-e4f8-4870-b634-56703b4acafe.gif?imageView2/1/w/80/h/80','123123',NULL,1,'admin'),(3,0,'https://api.dicebear.com/7.x/miniavs/svg?seed=412','asdas','lvgj1998@gmail.com',3,'user01');
INSERT INTO `role` VALUES (1,'SUPER_ADMIN','超级管理员',1),(2,'ROLE_QA','质检员',1),(4,'USER','普通用户',1);
INSERT INTO `role_permissions_permission` VALUES (2,1),(2,2),(2,3),(2,4),(2,5),(2,9),(2,10),(2,11),(2,12),(2,14),(2,15),(4,8),(4,21),(4,22),(4,23);
INSERT INTO `user` VALUES (1,'admin','53d3c4c5c5f07891133f49250f6f13d9',1,'2023-11-18 16:18:59.150632','2024-10-12 08:07:01.652188'),(3,'user01','53d3c4c5c5f07891133f49250f6f13d9',1,'2024-10-13 22:55:16.601588','2024-10-13 22:55:16.601588');
INSERT INTO `user_roles_role` VALUES (1,1),(1,2),(1,4),(3,4);
