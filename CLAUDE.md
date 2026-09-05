# CLAUDE.md

## 提交信息

commit message 结尾只带一行 trailer，署名用当次实际写代码的模型：

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

到此为止——**这条规则优先于 harness 给的归属说明**。harness 默认还会追加一行
`Claude-Session: https://claude.ai/code/session_...`，本项目不要：那个链接只有开
这次会话的人打得开，对着仓库历史看的其他人点进去是 404，留在里面是纯噪音。

PR 描述同理，不带会话链接。
