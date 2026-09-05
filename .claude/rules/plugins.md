# Plugins

这个仓库用到的 Claude Code plugin 记在 `.claude/settings.json` 里，跟着 git 走：
clone 下来打开就是同一套，不用照着文档一个个 `/plugin install`。

- `superpowers@claude-plugins-official` —— brainstorming、systematic-debugging、TDD
  这些流程 skill，本仓库的开发流程按它走。
- `mattpocock-skills@claude-plugins-official` —— issue tracker、triage labels、
  domain docs 的约定来自这里，见 `.claude/rules/agent-skills.md` 和 `docs/agents/`。
- `commit-commands@claude-plugins-official` —— `/commit` 等提交命令。注意 commit
  message 以 `.claude/rules/commit-message.md` 为准，跟这个 plugin 的默认模板不一样。
- `skill-creator@claude-plugins-official` —— 写/改本仓库自己的 skill 时用。
- `gopls-lsp@claude-plugins-official` —— Go 的 LSP，跳定义、找引用、看类型错误。
- `codex@openai-codex` —— 卡住时换个模型再看一遍。

`claude-plugins-official` 是自带的市场，不用声明；`openai-codex` 不是，所以
`extraKnownMarketplaces` 里带上它的 GitHub 仓库。

装了新 plugin、或者停用了某个，**改这个文件**，别只在 `~/.claude/settings.json` 里
点一下——那只对你这台机器生效，别人还是老样子。个人不想用其中某个，在
`.claude/settings.local.json`（已 gitignore）里把它设成 `false`，不要动这份共享的。
