# 把自己做成 AI 视频角色

上传照片或视频，得到写实、可爱 3D 卡通两套角色。每套包含 8 张独立图片，以及角色总览、全身三视图、上半身四视图、离线 HTML 图库和 ZIP。

## 安装

需要支持生图的 Codex 环境，且可发现 `imagegen` Skill、调用 GPT Image 2。这个 Skill 负责角色工作流，不附带模型服务或额度。

```sh
git clone https://github.com/akiai666/aki-ai-skills.git
cd aki-ai-skills
mkdir -p "$HOME/.agents/skills/aki-ip-character-pack"
rsync -a --exclude node_modules skills/aki-ip-character-pack/ "$HOME/.agents/skills/aki-ip-character-pack/"
```

重新打开 Codex，让它发现安装到 `~/.agents/skills` 的技能。

## 上传什么

最少一张清晰正脸。想更像本人，可以补一张 45°、一张侧脸，或直接上传一段转头视频。服装有要求就说一句，没有就沿用照片中的穿搭。

## 怎么调用

> 用 $aki-ip-character-pack，把上传的照片做成写实和 3D 卡通两套视频角色素材。

剩下的参考整理、逐角度生成、检查、拼图和网页打包交给 Codex。默认 GPT Image 2，不自动换模型。缺少可用渠道时会明确告知；API 路线按宿主规则配置，内置生图不要求 API key。

## 运行说明

Agent 在技能目录运行 `bun install --frozen-lockfile`。依赖 Bun、Sharp、zip/unzip；视频另需 FFmpeg/FFprobe。`bun scripts/doctor.ts --video` 检查本地依赖；模型权限需要实际调用确认。

输出位于当前项目 `output/imagegen/<角色名>/<版本>/`。原始照片不进入分享 ZIP，参考来源和补全视角会记录。不同视角分别生成，拼图来自同一批单图；独立图片不会通过插值放大冒充高清。文件检查不能代替人工视觉检查。

只改脸、发型或衣服时指定旧版和修改要求，工具另存新版本并保留历史入口。局部蒙版外像素保持不变。

维护验证：`bun test`、`bun run check`。执行步骤见 [SKILL.md](SKILL.md)，辅助命令见 [workflow.md](references/workflow.md)。
