# 角色

只有两个：`SUPER_ADMIN`（管理员）和 `USER`（普通用户）。

角色唯一的作用是决定登录后进哪个端，判断集中在 `identity.Principal.IsSuperAdmin`
一处。再细的可见性走 `user_role_node_mappings` / `user_role_chain_mappings` 里按
用户写的行（管理端 › 转发用户 › 资源授权），要放开什么就在那里加，不是加角色。

库里 `role` 表能存更多行、JWT 也带着 `roleCodes` 数组，都是上一版 naive-admin
模板的遗留。permission 表和动态菜单已经按这条边界删过一次，`sql/init.sql` 里现在
只有 `role` / `user_roles_role`，没有 permission 那两张表。
