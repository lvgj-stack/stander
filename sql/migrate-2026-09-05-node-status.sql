-- 迁移：节点状态列说真话
--
-- 只对**已经跑起来的库**需要。新库直接用 sql/init.sql，那里的 status 已经没有默认值。
--
-- 背景：nodes.status 的默认值是字符串 '8123'——某次把端口写进了状态列——而在这次改动
-- 之前，后端没有任何一处写过这一列。节点注册时更新的是 ip / port / ipv4 / ipv6 /
-- manager_ip，不碰 status。于是每个节点从建出来那天起，状态列就一直是 '8123'，控制台
-- 里那条「online 显示成在线」的分支永远不会命中。
--
-- 现在有两个取值：建节点时写 'unregistered'，agent 注册时改成 'registered'。

-- 1. 去掉那个默认值。新行一律由代码显式写入。
alter table nodes
    alter column status drop default;

-- 2. 存量行里的 '8123' 清成 NULL，页面上显示为「—」。
--
-- 这里**不能**一律写成 'unregistered'：那些节点里有一部分 agent 正跑着，只是从来没人
-- 记录过。把它们说成「未注册」和继续显示 '8123' 一样是编造，只是换了个说法。NULL 是
-- 这一刻唯一诚实的答案——不知道。agent 下次重启注册时会自己写上 'registered'。
update nodes
set status = null
where status = '8123';

-- 3. 执行完这个脚本之后，在开发库上跑一次 `stander gen`。
--
-- `internal/model/entity/nodes.gen.go` 是 gorm-gen 从库里反向生成的，现在那份产物上
-- 还写着 `default:8123`——库里已经没有这个默认值了，产物还在声明它。这次没有连着改，
-- 因为按 docs/development.md 的三步走，产物只能重新生成、不能手改，而重新生成要一个
-- 已经执行过本脚本的库。
--
-- 眼下没有实际影响：AddNode 和 RegisterNode 都显式写这一列，gorm 用不上那个默认值。
-- 但下一个跑 `stander gen` 的人会看到一处来历不明的 diff，所以记在这里。
