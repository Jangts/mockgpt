# MockGPT 标志

此目录保存 MockGPT 标志的正式原件、组合图、构造图与母版。

| 文件 | 内容 | PNG 尺寸 |
| --- | --- | --- |
| mockgpt-icon | 独立图标，透明背景，供文档站导航与 favicon 使用 | 64 × 64 |
| mockgpt-logo | 图标与 MockGPT 字标的横向组合，透明背景，供包文档使用 | 720 × 285 |
| mockgpt-construction | 带等距网格、共线参考和对称外框的设计稿，白底 | 2760 × 1540 |
| mockgpt-m-unit | 单个 M 母版构件，透明背景 | 960 × 640 |

各项均提供 SVG 与 PNG。图标由同一个 M 母版按 0°、120°、240° 组合，外侧六角星骨架使用统一截角；三个构件保持分离，内侧三角缺口和贯通白缝保留。构造图中的分色只用于说明构件关系，不是正式标志配色。

正式颜色为绿色 `#11977B`、字标深蓝 `#152B45`。SVG 的图标为矢量路径；组合图的字标保留可编辑文字，指定 Arial Bold，回退 Helvetica／sans-serif。跨平台需要像素一致时使用 PNG。

素材身份、尺寸及母版几何保存在 assets.json。引用方通过各自的素材清单选择图标或组合图。

SDK 与 Playground 的 README 使用组合图 PNG；Playground 顶栏、欢迎区和 favicon 使用独立图标 SVG。打包副本由 `development/scripts/site-sync/brand-assets.mjs` 的集中清单生成，不单独编辑；运行 `node development/scripts/site-sync/brand-assets.mjs --write` 同步本项目品牌素材。相邻 Pages 的文档站通过其素材清单直接读取本目录原件。
