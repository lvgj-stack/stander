-- 迁移：动态菜单 -> 固定两个端（用户端 + 管理端）
--
-- 只对**已经跑起来的库**需要。新库直接用 sql/init.sql，里面已经没有这两张表。
--
-- 背景：前端曾经把 permission 表当成菜单树读——path / component / icon /
-- order 决定运行时建哪些路由和 tab。现在两个端的路由都写死在前端代码里，
-- 角色只剩一个作用：决定登录后进哪个端（SUPER_ADMIN 进管理端，其余进用户端）。
-- 这两张表因此没有任何读者，后端的 /permission/* 和角色写接口也一并删了。
--
-- 这个脚本会丢数据，且不可逆。执行前先备份：
--   mysqldump -u root -p stander permission role_permissions_permission > /tmp/perm-backup.sql

DROP TABLE IF EXISTS role_permissions_permission;
DROP TABLE IF EXISTS permission;

-- ROLE_QA（质检员）是 naive-admin-go 模板留下的示例角色，没有任何代码读它。
-- 删之前先把只挂在它下面的账号归还给 USER，否则这些账号会一个角色都没有：
-- 登录后 currentRole 是空的，前端按"不是 SUPER_ADMIN"落到用户端，后端也一样，
-- 但个人资料里的所属端会显示不出来。
--
-- 顺序是先插后删，中间不能反过来——反了就没有依据知道谁挂过 ROLE_QA。
-- 角色一律按 code 定位，不写死 id：这个库的 id 未必是 init.sql 里的那几个。
--
-- 派生表 (SELECT * FROM user_roles_role) 是必须的：MySQL 不允许在 INSERT 的
-- 子查询里直接读同一张表（ER_UPDATE_TABLE_USED）。
--
-- 自定义角色不在这个脚本的范围内。角色的增删改接口已经删了，但库里原来建过的
-- 角色仍然能用——任何非 SUPER_ADMIN 的角色都进用户端。只是账号表单只提供两个
-- 选项，所以下次编辑这种账号时它会被并到 USER。
INSERT INTO user_roles_role (userId, roleId)
SELECT DISTINCT ur.userId, (SELECT id FROM (SELECT id FROM role WHERE code = 'USER') u)
FROM user_roles_role ur
WHERE ur.roleId = (SELECT id FROM (SELECT id FROM role WHERE code = 'ROLE_QA') q)
  AND NOT EXISTS (
      SELECT 1 FROM (SELECT * FROM user_roles_role) x
      WHERE x.userId = ur.userId
        AND x.roleId IN (SELECT id FROM (SELECT id FROM role WHERE code IN ('SUPER_ADMIN', 'USER')) r)
  );

DELETE FROM user_roles_role
WHERE roleId IN (SELECT id FROM (SELECT id FROM role WHERE code = 'ROLE_QA') q);
DELETE FROM role WHERE code = 'ROLE_QA';
