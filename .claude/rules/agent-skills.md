# Agent skills

## Issue tracker

Issue 和 spec 以 markdown 文件的形式放在 `.scratch/<feature>/` 里，不用 GitHub Issues：
这台机器上 `gh` 这个名字被一个内部工具占着，也没有任何 GitHub 凭据。见
`docs/agents/issue-tracker.md`。

## Triage labels

用默认的五个角色标签，标签名与角色名一致。本地 tracker 里它是文件顶部的 `Status:` 行，
不是真的标签。见 `docs/agents/triage-labels.md`。

## Domain docs

单上下文：根目录一个 `CONTEXT.md`（术语表，只定义词，不记实现），ADR 放 `docs/adr/`，
有真决策时才建。见 `docs/agents/domain.md`。
