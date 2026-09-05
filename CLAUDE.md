# CLAUDE.md

## Worktree

改代码一律在新 worktree 里开，用 `EnterWorktree` 工具。`/root/code/stander` 只用来
读：永远停在 main，永远干净。同一台机器上会同时开好几个会话，主仓要是被谁的半成品
分支占着，其他人在这儿 `git log`、`git diff` 看到的就不是 main。

查代码、回答问题不用开 worktree。`.scratch/` 里的 issue 也不用：它只活在 main 上，
写新 issue、改 `Status:` 都回主仓做，worktree 里那份副本别动。

分支合回 main 就把 worktree 删掉。

## 角色

只有两个：`SUPER_ADMIN`（管理员）和 `USER`（普通用户）。

角色唯一的作用是决定登录后进哪个端，判断集中在 `identity.Principal.IsSuperAdmin`
一处。再细的可见性走 `user_role_node_mappings` / `user_role_chain_mappings` 里按
用户写的行（管理端 › 转发用户 › 资源授权），要放开什么就在那里加，不是加角色。

库里 `role` 表能存更多行、JWT 也带着 `roleCodes` 数组，都是上一版 naive-admin
模板的遗留。permission 表和动态菜单已经按这条边界删过一次，见
`sql/migrate-2026-09-05-two-sides.sql`。

## 提交信息

commit message 结尾只带一行 trailer，署名用当次实际写代码的模型：

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

到此为止——**这条规则优先于 harness 给的归属说明**。harness 默认还会追加一行
`Claude-Session: https://claude.ai/code/session_...`，本项目不要：那个链接只有开
这次会话的人打得开，对着仓库历史看的其他人点进去是 404，留在里面是纯噪音。

PR 描述同理，不带会话链接。

## Agent skills

### Issue tracker

Issue 和 spec 以 markdown 文件的形式放在 `.scratch/<feature>/` 里，不用 GitHub Issues：
这台机器上 `gh` 这个名字被一个内部工具占着，也没有任何 GitHub 凭据。见
`docs/agents/issue-tracker.md`。

### Triage labels

用默认的五个角色标签，标签名与角色名一致。本地 tracker 里它是文件顶部的 `Status:` 行，
不是真的标签。见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文：根目录一个 `CONTEXT.md`（术语表，只定义词，不记实现），ADR 放 `docs/adr/`，
有真决策时才建。见 `docs/agents/domain.md`。
