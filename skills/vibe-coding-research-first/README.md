# Vibe Coding：先调研，再开发

这是一个适用于 Codex、Claude Code、Cursor、Windsurf 等 AI Coding Agent 的研究优先工作流。

它会强制 AI 在写代码前完成：

**需求理解 → GitHub / 产品调研 → 横向比较 → Build or Buy → 产品定义 → 技术方案 → 开发计划**

## 最简单的用法

把 skill 安装到 Agent 后，直接发送：

```text
$vibe-coding-research-first

我要开发一个可以自动整理微信群聊天记录、生成每日摘要和待办事项的工具。
先不要写代码，按这个 skill 完成调研和 Build or Buy 判断。
```

AI 输出报告后，如果你确认值得做，再回复：

```text
开始开发，只做报告里的 Phase 0 和 Phase 1。
```

## 安装

```bash
git clone https://github.com/akiai666/aki-ai-skills.git
cd aki-ai-skills
mkdir -p "$HOME/.agents/skills/vibe-coding-research-first"
cp -R skills/vibe-coding-research-first/. "$HOME/.agents/skills/vibe-coding-research-first/"
```

如果你的 Agent 没有自动读取 skill，也可以直接打开本目录的 `SKILL.md`，把它作为项目规则使用。

## 关键原则

> 不要让 AI 一上来写代码。先让它证明这东西值得自己做。

## License

MIT
