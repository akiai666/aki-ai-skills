# 角色导入

`--ip-dir` 指向外部私有目录。最低输入为 RGBA `idle.png` 或 `透明全身.png`；可增加 `doubt.png`、`surprise.png`、`happy.png`。所有表情必须同尺寸、同站位。只有 idle 时，可以运行默认预览；调用缺失表情会报错。

可提供 `character.json`，精确描述原图像素坐标：

```json
{
  "width": 600,
  "height": 1500,
  "anchor": {"x": 300, "y": 1500},
  "hands": {"left": {"x": 70, "y": 900}, "right": {"x": 530, "y": 900}},
  "faces": {"idle": "idle.png", "doubt": "doubt.png", "surprise": "surprise.png", "happy": "happy.png"}
}
```

`anchor` 是脚底中点；`hands` 是道具接触点。没有配置时只提供初始估计，正式动作必须按实际图像校准。导入后生成项目内 `src/data/character.json` 和 `public/characters/*.png`；配置不携带来源绝对路径。

```tsx
const actor = {x: 450, y: 820, h: 600, rot: 5};
const hand = characterPoint(actor, 'right');
<AkiCharacter {...actor} face="happy"/>
```

`x/y/h/flip/rot/shadow/face` 为主要参数，`faceSince/seed` 保留给场景兼容。旋转围绕脚底，手点采用相同变换。`useFace` 使用段内帧排表情，`useHop` 返回位移和阴影缩放，不对角色做骨骼变形。

表情素材若存在尺寸或构图漂移，先对齐头发、眼镜等稳定特征，再局部合成脸部。身体、轮廓和 alpha 沿用原图，不能让切脸导致身体抖动。

## 独立动作图片

在同一个 character.json 中添加 `poses`。每张动作可以有不同画布尺寸和锚点，`src` 是相对角色目录的 PNG 路径。`bodyHeight` 是标定身高；省略时使用图片高度。它用来避免抬手或前倾改变图片边界后缩放整个人物。手点名称 left/right 表示图片画面左右，不是人物的解剖学左右。

```json
{
  "poses": {
    "hold": {
      "src": "hold.png", "width": 1024, "height": 1536, "bodyHeight": 1469,
      "anchor": {"x": 450, "y": 1480},
      "hands": {"left": {"x": 280, "y": 880}, "right": {"x": 860, "y": 530}}
    }
  }
}
```

上面的坐标只作格式示例，必须按实际生成图校准。`poses` 是原 manifest 的新增字段，仍需保留 width/height/anchor/hands/faces。

```tsx
const actor = {x: 500, y: 832, h: 590, pose: 'hold'};
const palm = characterPoint(actor, 'right');
<AkiCharacter {...actor}/>
```

`pose` 优先于 `face`，使用该动作图自身的表情；不会将旧站姿的脸贴到另一张姿势上。缺少指定动作立即报错。旋转、翻转与手部接触点使用同一变换。
