# Worktree

改代码一律在新 worktree 里开，用 `EnterWorktree` 工具。`/root/code/stander` 只用来
读：永远停在 main，永远干净。同一台机器上会同时开好几个会话，主仓要是被谁的半成品
分支占着，其他人在这儿 `git log`、`git diff` 看到的就不是 main。

查代码、回答问题不用开 worktree。`.scratch/` 里的 issue 也不用：它只活在 main 上，
写新 issue、改 `Status:` 都回主仓做，worktree 里那份副本别动。

分支合回 main 就把 worktree 删掉。
