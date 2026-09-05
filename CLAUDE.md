# CLAUDE.md

规则一条一个文件，放在 `.claude/rules/` 下。下面的 `@` 是导入：Claude Code 读
CLAUDE.md 时会把这些文件的正文一起载进来。`.claude/rules/` 目录本身不会被自动扫描，
**新加规则文件记得在这儿补一行 `@`**，不然它等于没写。

@.claude/rules/worktree.md
@.claude/rules/merge-to-main.md
@.claude/rules/commit-message.md
@.claude/rules/roles.md
@.claude/rules/agent-skills.md
@.claude/rules/plugins.md
