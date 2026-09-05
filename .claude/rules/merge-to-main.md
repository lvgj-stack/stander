# 合回 main

**不用 `git merge`。** 分支上的活干完，回主仓把那几个 commit `git cherry-pick` 到
main，再 `git push`：

```
git -C /root/code/stander cherry-pick <first>^..<last>
git -C /root/code/stander push
```

main 的历史保持一条直线，`git log --oneline` 一行一个真改动，没有
`Merge branch '...'` 这种什么都不说的 commit。cherry-pick 之前先把分支上的 commit
理干净（该 squash 的 squash，别把 "wip"、"fix typo" 也搬过去）。

有冲突就在 cherry-pick 里解，别退回去 merge。cherry-pick 完、push 成功，再删分支和
worktree。
