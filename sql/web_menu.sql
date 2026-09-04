-- Menu rows for the pages the React admin console added.
--
-- The console routes statically; the permission tree contributes only `code`,
-- which decides whether a sidebar entry is shown (see web/src/routes/nav.tsx).
-- 链路组 / 流量套餐 / 转发用户 had no permission row, so their codes were in
-- nobody's set and the entries stayed hidden — including for the super admin,
-- whose tree is "every top-level row" rather than "everything".
--
-- The `component` column is left empty on purpose. It holds Vue file paths
-- from the previous frontend and this console never reads it.
--
-- No role grant is made here. Role 1 (SUPER_ADMIN) is special-cased in
-- handler.Role.PermissionsTree and sees every top-level row without a grant;
-- these are administrative screens, so hand them to other roles deliberately
-- through 角色管理 rather than by default.
--
-- Safe to re-run: the `permission` table has no unique key on `id`, so each
-- insert is guarded by a NOT EXISTS on the code rather than by ON DUPLICATE KEY.

INSERT INTO `permission`
    (id, name, code, type, parentId, path, redirect, icon, component, layout,
     keepAlive, method, description, `show`, enable, `order`)
SELECT 24, '链路组', 'ChainGroup', 'MENU', NULL, '/chain-groups', '', 'i-fe:layers', '', '',
       0, '', '', 1, 1, 13
WHERE NOT EXISTS (SELECT 1 FROM `permission` WHERE code = 'ChainGroup');

INSERT INTO `permission`
    (id, name, code, type, parentId, path, redirect, icon, component, layout,
     keepAlive, method, description, `show`, enable, `order`)
SELECT 25, '流量套餐', 'TrafficPlan', 'MENU', NULL, '/plans', '', 'i-fe:credit-card', '', '',
       0, '', '', 1, 1, 14
WHERE NOT EXISTS (SELECT 1 FROM `permission` WHERE code = 'TrafficPlan');

INSERT INTO `permission`
    (id, name, code, type, parentId, path, redirect, icon, component, layout,
     keepAlive, method, description, `show`, enable, `order`)
SELECT 26, '转发用户', 'ForwardUser', 'MENU', NULL, '/forward-users', '', 'i-fe:users', '', '',
       0, '', '', 1, 1, 15
WHERE NOT EXISTS (SELECT 1 FROM `permission` WHERE code = 'ForwardUser');

-- The three forwarding menus predate this console and carry the old Vue routes.
-- Only `path` matters to a human reading the permission screen — the console
-- never routes off it — but leaving them wrong is misleading.
UPDATE `permission` SET path = '/nodes'  WHERE code = 'Server' AND path = '/servers';
UPDATE `permission` SET path = '/chains' WHERE code = 'Chain';
UPDATE `permission` SET path = '/rules'  WHERE code = 'Rule';
