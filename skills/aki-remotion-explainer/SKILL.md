---
name: aki-remotion-explainer
description: 将逐字稿和自有卡通 IP 制作成纸蓝手绘风的 Remotion 讲解视频，支持连续 PNG 动作、单张姿势、手部道具互动、表情、旁白和字幕。用于 Aki IP 动画、动作素材包、纸蓝讲解或把稿子做成角色演示视频。
---

# Aki IP 纸蓝讲解

输入：已定稿逐字稿、角色 PNG 目录、画幅和时长。输出：可编辑 Remotion 工程、MP4、分镜表、静帧验收。基于 Jacky Remotion 的 MIT 代码改造；未包含芽仔形象或原品牌底图。

## 初始化

Node 24、Python 3.10+、FFmpeg；依赖锁定 Remotion 4.0.533。第一次使用先读 [README.md](README.md)，下载配套素材或准备自己的透明 PNG。

```sh
node scripts/new-project.ts --set-library /path/to/library/素材
node scripts/new-project.ts /path/to/project --actions wave,think --poses hold --format h
cd /path/to/project/video
npm ci
npm run timeline
npm run lint
node scripts/render.mjs stills 60
```

配置只保存在本机。每片只导入指定动作，生成独立副本及 `asset-snapshot.json`，不回写主库；主库更新不会改变旧工程。未选素材时只导入 idle。未验收动作在评审工程中加 `--allow-draft-actions`。完整选择规则、刷新图库及导出版本包见 [library.md](references/library.md)。

画幅 `h` 为 1920×1080，`v` 为 1080×1440；以用户明确选择为准。`--ip-dir` 可覆盖默认目录，`--node-modules` 可复用匹配锁文件的依赖。已有 video/ 或 plan.json 时拒绝覆盖。角色契约见 [character.md](references/character.md)。

初始工程为 6 秒无声预览，优先展示第一个所选动作，其次姿势、idle。时间是人工示例，不能冒称已完成配音。实际项目必须替换 plan.json、words.json、captions.json 和场景。

## 制作

1. 使用用户指定稿件；用户要求起草时可起草并给出分镜，已有确认不重复询问。每段写清文意、角色动作和口播 cue；不用同一模板循环换字。
2. 使用用户录音或已授权的配音工具；本 Skill 不要求专属音色服务，也不自动调用收费 TTS。所有凭据由用户提供的环境变量读取，不写进项目。
3. 将最终成片用的声音做逐词识别，再运行 `scripts/align_words.py --asr ... --text ... --words ... --captions ...`。字幕字面以原稿为准。更改语速或插入停顿后重新对齐；不按字数均分整段语音的时间。
4. 根据真实声音写 plan.json 和分镜表；见 [plan.md](references/plan.md)。cue 必须为该段原话。
5. 每段单独编写场景；见 [kit.md](references/kit.md)。先按语义选动作图，再摆站位和道具路径；见 [poses.md](references/poses.md)。拿卡、推送、指向、惊讶等必须有对应的手脚姿势，不能只靠一张站姿图平移、倾斜、弹跳。用户要求保留单图动作时遵从其范围。角色脸是图片状态，不绘制伪口型，不要求骨骼绑定。
6. `npm run timeline`、`npm run lint`，然后渲染每段首中末、cue 和转场关键帧并实际看图。浏览器可通过 `REMOTION_BROWSER_EXECUTABLE` 指定已有可执行文件；不写死机器路径。
7. `node scripts/render.mjs video`，使用 ffprobe 检查尺寸、帧数、帧率、时长和音轨，解码检查后完整播放验收。声音相似度不能从 ASR 结果推出。

## 图像与私有素材

技能只包含通用代码、模板、字体、合成音效和空角色配置。角色素材在用户主库维护，视频项目保存所选素材快照；参考照片、旁白、API 响应不进入共享技能。个人绝对路径只放本机配置。

表情不足时，以现有形象为编辑目标，通过用户已授权的 imagegen 路径补齐。锁定脸型、眼镜、头发和衣服；将生成结果注册到同一坐标，保留原身体和 alpha。缺失表情明确报错，不回退到其他角色。

动作不足时，以原角色为身份参考生成独立全身姿势 PNG；姿态允许改变，服装、脸和头身比例保持一致。每张动作配置自己的脚底与手部锚点。图片保存在私人项目内，通过 character.json 的 poses 导入。现有四种表情输入继续兼容。

需要连续动作时使用 `actions`，记录来源帧率、帧序列、逐帧手脚坐标、循环及道具接触事件。选择顺序为动作、姿势、表情。先验证三个代表动作再扩展批量，保持统一画布与成年人比例；接口、生成及验收见 [actions.md](references/actions.md)。素材是否制作完成、是否通过视觉验收必须分别记录。

已有网页生成或用户提供的动作视频，可转成透明 PNG 序列接入同一接口，见 [video-actions.md](references/video-actions.md)。未追踪手部的素材必须标记 `contactSupported: false`；可正常播放，但 `characterPoint()` 会拒绝用其占位坐标驱动道具。

## 验收

- 脚底锚点、身高、表情切换保持一致；道具用 `characterPoint()` 获取手部位置，旋转和翻转时一起变换。
- 字体完整、字幕不越界、标题与角色不重叠，动作跟随实际 cue。
- 不存在芽仔绘制、原品牌位图、无声占位场景或未完成段落。
- 继承原版 -12 LUFS / -1 dBTP 成片混音；音效弱于旁白，不给所有移动都配音效。
- 自动检查与实际看图、试听分别报告；只在确实播放并能感知音频时声称听过。
- 保留 LICENSE、ASSETS-LICENSE.md 和第三方字体许可。Remotion 使用自身许可。除非用户要求，不提交、推送或发布。
