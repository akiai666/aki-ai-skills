# 身份记录与提示词

## 参考判读

联系表用于筛选；关键脸部必须查看清晰原图。一张清晰正脸即可开始；有多张时选择清晰且角度互补的参考，更多照片不等于更稳定：

- 正面用于眉眼间距、鼻唇和脸型；明显广角、彩光、夸张表情不得独自定义身份。
- 45°与侧面用于鼻额、嘴唇突出程度、下颌和耳朵；镜面自拍先判断反转，不批量自动翻转全部素材。
- 后脑用于发型体积、发际和服装背面；没有后脑参考则标为补全。
- 视频帧必须检查模糊、运动变形和遮挡；若均匀抽帧遗漏明确的转头时刻，可追加少量指定时间点并保留时间戳。

`identity.md` 用短要点记录：主要参考编号；稳定可见特征；服装及配饰；背景和光照约定；补全项；用户明确要求保留/修改的区域。不要把健康、性格、民族等不可从素材可靠得出的信息写为人物事实。

在 `sources.json` 的候选项中更新 `selected`、`angle`、`notes`。`manifest.assumptions` 只放影响使用者判断的补全说明。补全说明无需塞入每张图片。

## 每张提示词的共同结构

将以下模板按实际信息展开，不能带未填占位符提交模型。提示词单独保存到对应 `prompts/<视图ID>.txt`。

```text
Use case: identity-preserve.
Asset: one standalone character reference image for AI video, not a contact sheet.
Input roles: [逐张列出实际传入的图片编号，以及真实身份参考、风格/服装锚点或编辑目标].
Subject: the same person as the real reference images; [只列辨识度相关可见特征].
View: [准确角度与取景范围，见下表].
Canvas: [全身 2:3 竖版；特写与上半身 1:1 方形；同时向工具传请求尺寸].
Identity: preserve actual eye shape/spacing, brows, nose, lips, cheeks, jaw, age cues and natural asymmetry. Do not substitute a generic beautified face.
Style: [下方写实或卡通段].
Wardrobe and proportions: [锁定衣服、配饰、身材比例].
Hair: [参考中的发型轮廓], natural irregular texture, varied fine strands; no repeated chunky spikes or evenly spaced rigid tufts.
Lighting/background: soft neutral studio light, plain light-gray background; do not import color casts or scenery from the photos.
Pose/expression: relaxed, [全身时注明完整双手、手脚和头顶留白].
Constraints: exactly one person, one view, no text, watermark, props or collage. Keep identity, glasses, outfit and scale consistent with the anchors.
```

写实段：`Photorealistic studio character reference, believable restrained skin texture, natural adult face and proportions, no plastic skin or beauty-model reshaping.`

若用户已有认可的卡通形象，将它作为独立风格参考，并明确真人图负责身份、卡通图负责渲染风格；写实锚点不能覆盖卡通风格。

卡通段：`Appealing 3D animated-film character, recognizably the same person, clearly stylized sculpted shapes and animated material shading (not a photograph), friendly expression, adult body proportions close to the realistic anchor, no chibi head enlargement, no short stubby limbs, natural soft irregular hair.`

| 视图 ID | 角度与取景 | 请求尺寸 |
|---|---|---|
| 01-face-closeup | 正面面部特写，完整头顶与下巴，少量肩部 | 1024×1024 |
| 02-full-front | 全身正面，目视前方，完整头脚和双手 | 1024×1536 |
| 03-full-side | 全身严格90°侧面，面朝画面左侧 | 1024×1536 |
| 04-full-back | 全身严格背面，不回头 | 1024×1536 |
| 05-bust-front | 正面，头部及上半身，腰部附近截取 | 1024×1024 |
| 06-bust-45 | 上半身45°，转向画面左侧 | 1024×1024 |
| 07-bust-side | 上半身严格90°，面朝画面左侧 | 1024×1024 |
| 08-bust-back | 上半身严格背面，不回头 | 1024×1024 |

按写实 01 → 写实 02 → 写实其余视图 → 卡通 01 → 卡通 02 → 卡通其余视图执行。背面仍携带同一套服装和后脑参考，不凭空换衣服背部结构。并行调用仅在工具允许、参考依赖已完成时使用；不为并行创建额外聊天。

## 定向修正

一次只改明确失败项，并重复不变量。例如：

```text
Edit target: image 1. Real identity references: images 2–N.
Change ONLY the visible face within the permitted region, matching the real eye shape, nose and lips more accurately. Keep exact head position, hairstyle silhouette, glasses design, body, clothing, pose, light and background. Do not move or rescale the face. Return the same canvas geometry.
```

发型修正指定自然疏密与细碎不规则，不能只写“更乱”，否则可能从规则发束变成拖把。局部修改必须在本地合成后再次查看，不能只凭模型提示词宣称其他区域未变。
