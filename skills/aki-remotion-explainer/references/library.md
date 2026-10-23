# 单一主库与固定快照

主库结构：`index.html`、`使用说明.md`、`素材/character.json`、`样片/`、`制作资料/`。素材与提示词只在主库修改，项目副本和导出包均不回写。

## 一次配置、按需导入

从本 Skill 目录运行，Node 24：

```sh
node scripts/new-project.ts --set-library /path/to/library/素材
node scripts/new-project.ts /path/to/project --actions wave,think --poses hold --allow-draft-actions
```

默认配置：`$XDG_CONFIG_HOME/aki-remotion-explainer/config.json`，未设置 XDG 时使用 `~/.config`；测试或隔离配置可设置 `AKI_REMOTION_CONFIG`。`--ip-dir` 优先于本机配置。

- 默认只导入 idle；`--actions`、`--poses`、`--faces` 接受逗号分隔名称或 `all`，前两者支持 `none`；faces 必须包括 idle。
- 兼容旧入口：单独传 `--ip-dir` 且无选择参数时仍导入全部；新制作应明确所选动作，避免全库复制。
- `asset-snapshot.json` 记录主库版本、所选名称、项目内路径及 SHA-256；项目使用真实文件副本，不使用主库软链接。
- 未完成视觉验收的动作只以 `--allow-draft-actions` 导入评审工程。导入不提升其状态；没有真实手部标注时保持 `contactSupported: false`。

## 更新主库和图库

添加动作时更新 `素材/character.json`：所有路径相对 `素材/`，包括 `preview`、`alphaVideo`、`representative`；姿势可含 `id`、`group`、`label`、`category`、`scenarios`。递增 `libraryVersion` 后刷新：

```sh
node scripts/refresh-library.ts /path/to/library
```

生成缩略图和内嵌目录的离线 HTML，无需服务。缩略图、HTML 都是派生产物，不单独维护。刷新需要 FFmpeg；`样片/demo-30s.mp4`、`样片/demo-cover.jpg` 和使用说明由主库保留。

## 本地导出公开版本包

```sh
node scripts/export-pack.ts --version v1 --output /path/to/aki-motion-v1.zip \
  --actions wave,think --poses hold --license /path/to/asset-license.md \
  --prompt /path/to/generic-prompt.md --allow-draft-actions
```

只包含所选 PNG、对应动作预览与透明视频、配置、文件校验清单、来源快照、明确指定的提示词和素材许可。不会复制样片、原始视频、参考照片、声音、制作日志、本机配置或渲染缓存，不自动上传。导出前检查所选提示词与许可内容；代码 MIT 不自动授权角色身份和声音。动作还在评审阶段时按原状态导出。

开源时将代码放 Git 仓库，大素材 ZIP 放 GitHub Release。下载者解压后对包根目录运行 `--set-library`；旧包保持固定，新版本重新导出。用户自带照片生成整套动作留待后续实现。
