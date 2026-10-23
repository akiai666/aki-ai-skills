# 动画组件

坐标为画布像素，场景内 `useCurrentFrame()` 为段内帧。`cueFrame(segment('s01'), '原话')` 从实际配音取得动作时刻。

- `AkiCharacter`、`characterPoint`、`useFace`、`useHop`：见 [character.md](character.md)。
- `brand.ts`：`V` 色板、`HAND` 字体、`G` 窗口与字幕安全区。
- `ink.tsx`：`Stage` 全画布 SVG，`HandWrite` 逐字写出，`TornBlue` 重点字，`Sticker` 卡片，`Stamp` 盖章，`InkLine` 手绘线，`Camera` 镜头，`lerp`、`usePop`、`rand` 动效函数。
- `props.tsx`：`Machine`、`Sheet`、`PaperBall`、`Pit`、`Ground`、`Bubble`、`Burst` 等道具。
- `Sound.tsx`：`Sfx name at volume`，音效 `pop/whoosh/tick/ding/thud/swish`；一段一两个主动作音效。

每段独立组件，在 `src/scenes/index.ts` 以 plan id 登记。声音、字幕和背景由 `Explainer.tsx` 统一处理。使用 `Stage` 包住 SVG 道具，避免将 HTML 放进 SVG。`HandWrite` 的逐字 span 外面包一个 div，不直接作 flex 子项。

动作由帧决定；随机用 `rand(seed)`，不使用 CSS animation 或 Math.random。纸蓝画面一屏一个重点，卡片和机器不要挡脸，字幕上方保留空隙。保留角色适当停顿，不能全程无意义弹跳。
