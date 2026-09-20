# Quaternius Universal Animation Library 1 + 2

- 来源：[UAL 1](https://quaternius.itch.io/universal-animation-library)、[UAL 2](https://quaternius.itch.io/universal-animation-library-2)
- 作者：Quaternius
- 版本：Standard，下载于 2026-09-20
- 许可：CC0 1.0 Universal
- 用途：通用人形骨骼动作底座，不作为最终人物美术资产

仓库同时保留 in-place 与 root-motion GLB。`blender/motion-library.catalog.json` 由 Blender 从这些原始动画文件生成，业务代码应通过动作目录检索，而不是硬编码 GLB 内部名称。

原包说明：文件名以 `_RM` 结尾的版本把 root motion 烘焙进每段动画；不带 `_RM` 的版本禁用 root motion。
