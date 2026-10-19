# 工具与数据工作流

## 依赖和路径

运行环境：Bun、Sharp、zip、unzip；视频输入另需 FFmpeg、FFprobe。运行 `bun scripts/doctor.ts` 检查本地依赖，视频加 `--video`。生图能力需通过宿主工具发现和实际生成确认。在 Skill 目录执行 `bun install --frozen-lockfile` 安装锁定依赖；生成图片仍调用 `imagegen`。所有输入与输出参数使用已确认的绝对路径，路径含空格时正确引用。不要在技能目录或 Vault 根目录生成用户素材。

以下 `$skill_dir` 是已发现的 Skill 目录，`$pack_dir` 是当前项目的新版本目录；由调用者设置为真实绝对路径，不要照抄占位路径。

```sh
bun "$skill_dir/scripts/cli.ts" prepare --out "$pack_dir" --name "角色名" --input "$photo_dir" --input "$video_file"
```

`--input` 可重复，接受文件或目录。默认每视频最多 36 个均匀候选帧，`--frames` 可指定 1–36；短视频每秒至多取一个均匀候选。预处理只复制/转换，不修改输入。照片自动校正 EXIF 方向、最长边限制 2048 且不放大，FFmpeg 自动应用视频方向。HEIC/HEIF 受本机 Sharp 解码器支持限制，失败时转换为 PNG/JPEG 后再输入；不静默丢弃失败素材。

输出已有目录时拒绝覆盖；需要恢复中断任务，直接使用已有 `sources.json` 和 `manifest.json`，补完缺失的生成图，不再运行 prepare。

## 文件契约

- `sources.json`：原文件路径、SHA256、来源类型，视频时长；每个候选图含编号、相对文件路径、时间戳、selected、angle、notes。原文件路径仅保留在用户项目，ZIP 不包含原照片或视频。
- `identity.md`：Agent 目视分析后写入的简短人物特征和统一造型约定。
- `manifest.json`：prepare 初始化的交付清单，Agent 随生成补全实际渠道、参考编号、提示词、检查状态和补全说明。

清单示例中的单条视图：

```json
{
  "id": "03-full-side",
  "file": "realistic/single/03-full-side.png",
  "prompt": "realistic/prompts/03-full-side.txt",
  "references": ["src-002", "realistic/single/02-full-front.png"],
  "method": "generated",
  "review": "passed",
  "issues": []
}
```

`method`：独立生成为 generated，本地蒙版修改为 local-edit，完整保留旧独立图为 inherited；旧总览裁切只能标 crop，不能通过高清检查。`review`：pending / passed / needs-review。只有实际查看并通过的图才能标 passed；脚本不做人物身份识别。`actual` 由构建时读取图片写入，不能把请求尺寸冒充实际尺寸。

根字段 `route` 填实际非敏感调用渠道名，`model` 默认 gpt-image-2；`assumptions` 写补全项；`history` 写 `{ "label": "上一版", "path": "../v1/index.html" }`。文件字段相对当前版本根；禁止指向目录外的素材，复制所需旧图到新版后引用。history 是唯一允许指向兄弟历史目录的入口。

提交前写入完整提示词，携带真实图像输入。生图工具输出复制到对应 single 文件，记录来源与检查结果。模型返回错误尺寸，最多按原角度重试一次，仍不满足时明确待完善；禁止自动放大通过检查。

## 构建与检查

```sh
bun "$skill_dir/scripts/cli.ts" build --out "$pack_dir"
bun "$skill_dir/scripts/cli.ts" verify --out "$pack_dir"
```

完整检查覆盖：每风格恰好8种视图、PNG、特写/半身不低于1024×1024、全身不低于1024×1536、独立来源、目视检查状态、提示词与参考记录、HTML 资源及链接存在。build 只从交付原图生成缩略排版，不修改 single 文件。verify 只读；问题返回非零退出码。

重试后仍有问题时：

```sh
bun "$skill_dir/scripts/cli.ts" build --out "$pack_dir" --draft
```

`--draft` 允许缺图/低清/未通过检查的包，页面与 manifest 明确标记 needs-review；不是绕过检查变成完整包。HTML 无外部字体、CDN 或网络依赖，ZIP 自带双风格页面、图像、提示词与清单。ZIP 内移除下载自身和历史页面入口，解压后不产生断链。参考原件默认不打入可分享包。

## 局部编辑

在新版本目录中工作，复制未修改的原图、提示词与元数据。为待修改图准备两种蒙版：模型编辑需要的格式按 imagegen；本地合成用无透明通道的灰度 PNG，白色255表示采用候选、黑色0表示完整保留原图、灰色为过渡。边缘仅向允许区域内部羽化。先查看蒙版，再提交模型。

```sh
bun "$skill_dir/scripts/cli.ts" composite --source "$source_png" --candidate "$candidate_png" --mask "$weight_png" --out "$new_png"
```

本工具针对本 Skill 的不透明背景图。source、candidate、mask 尺寸需一致；检查图中人脸和身体位置是否对齐后再调用，脚本不能证明空间对齐。输出必须是新文件，附 `.json` 检查报告；不改输入。报告验证蒙版为0处像素完全保留，以及原图哈希不变。

合成后查看皮肤衔接、眼镜、发际、衣领边缘；完成后设 method=local-edit、更新提示词与检查状态，从新单图重建总览。继承旧低清素材会保留限制，不能用“仅改脸”的需求去擅自重新生成身体。
