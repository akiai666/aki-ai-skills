# 连续动作

角色配置新增 `actions`，旧 `poses` 与 `faces` 不变。选择顺序为 `action > pose > face`；缺失资源报错。私人序列只放在输入素材目录，初始化时复制到视频工程。

每个动作使用固定画布、身体尺度和地面坐标。不要逐帧紧裁后拉伸。`bodyHeight` 表示统一站立身高，蹲下时不改它。`anchor` 是画布内固定舞台原点，通常是站立时脚底中点；跳跃时也不能把原点跟着鞋子上移。每帧 `feet` 记录实际左右脚底，`hands` 记录实际接触点，左右按画面方向命名。

```json
{
  "actions": {
    "push": {
      "label": "推送执行",
      "category": "互动",
      "scenarios": ["送出需求卡", "执行任务"],
      "width": 1024,
      "height": 1536,
      "bodyHeight": 1200,
      "anchor": {"x": 512, "y": 1380},
      "hands": {"left": {"x": 320, "y": 900}, "right": {"x": 700, "y": 900}},
      "fps": 12,
      "frames": [
        {"src": "actions/push/0000.png", "hands": {"left": {"x": 320, "y": 900}, "right": {"x": 700, "y": 900}}, "feet": {"left": {"x": 410, "y": 1380}, "right": {"x": 615, "y": 1380}}}
      ],
      "events": []
    }
  }
}
```

示例只展示一帧结构，实际 2 秒动作需有 24 个来源帧，3 秒需有 36 个。不得复制一张图声称增加了动作帧。帧顺序以数组为准。

循环另加 `loop: {start: 6, end: 18}`，区间含 start、不含 end；开启循环时先播放准备段，再重复此区间。未开启循环则完整播放并保持最后一帧。开始前显示第一帧，需要隐藏时用 Remotion Sequence。`actionSince` 按当前 Sequence 的输出帧计，速度必须大于 0。

```tsx
const frame = useCurrentFrame();
const {fps} = useVideoConfig();
const actor = {x: 500, y: 832, h: 590, action: 'push', actionSince: 30, actionSpeed: 1};
const hand = characterPoint(actor, 'right', {frame, fps});
return <><AkiCharacter {...actor}/><Card x={hand.x} y={hand.y}/></>;
```

`characterPoint` 的时钟必须与人物组件一致；动作模式省略时钟会明确报错。采样规则为 `floor((frame - actionSince) * sourceFps * speed / outputFps)`，所以 12 fps 动作放入 30 fps 工程时，来源帧依次持有 2 或 3 个输出帧；这不会增加真实中间姿势。

道具事件按来源帧定义，按时间排序，例如 `{frame: 5, type: 'contact', hand: 'right', prop: 'card'}`，随后 `{frame: 12, type: 'release', hand: 'right', prop: 'card'}`。`sampleMotion()` 返回当前 `contacts`；接触期间使用该帧手坐标，释放时取释放帧的手坐标作为独立路径起点。不要继续把飞行道具绑在手上。

## 验证

先用挥手、推送、惊讶验证局部、接触与全身动作。关键姿势确认后再生成中间姿势，每次携带固定身份和相邻关键姿势。连续帧表可固定网格切分，但须确认数量、分辨率、人物完整性和时序；切分不能自动证明动作通过验收。

初始化检查文件完整性、RGBA 格式、固定画布、逐帧手脚坐标、帧率、循环区间和接触事件。运行 `python3 -m unittest discover -s tests` 与 `node --experimental-strip-types --test tests/motion.test.ts`。实际透明像素和重复帧另用 `scripts/check-actions.py` 检查。

自动检查不判断身份、手指或流畅度。必须正常速度和慢放检查脸、眼镜、衣服闪变、脚底滑动、手指、接触与循环跳变；未过关的试制不能标记为正式素材或扩展全库。

素材可标记 `status: "pilot-not-approved"`、`annotationStatus: "pending-manual-review"`。默认初始化拒绝未验收动作；制作本地评审工程时可显式传 `--allow-draft-actions`，保留这些状态，不会把试制升级为正式资产。验收后再将状态分别设为 `approved`、`reviewed`。
