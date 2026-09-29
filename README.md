# Preset Prompt Images

为 Chat Completion Presets（预设）中的提示词条目增加图片附件。

图片会随完整预设 JSON 保存到：

```text
extensions.tauritavern.presetPromptImages
```

## 主要能力

- 给 Relative 提示词条目添加图片。
- 支持拖拽、粘贴和文件选择。
- 支持图片 `before` / `after` 文本顺序。
- 支持 `detail: auto / low / high / original`。
- 支持完整预设 JSON 导入导出时保留图片。
- 插件总开关关闭后不发送任何图片。
- 没有安装插件时，预设仍可按纯文本方式正常导入和使用。
- 支持普通 Chat Completion 组装与 Agent/headless PromptManager 组装路径。

## 安装

完整安装说明见：

- [docs/安装说明.md](docs/安装说明.md)

最简单的安装方式：

1. 把整个 `Plugin_Preset_Images` 目录复制到：
   - `data/default-user/extensions/Plugin_Preset_Images`
   - 或 `data/extensions/third-party/Plugin_Preset_Images`
2. 刷新 TauriTavern / SillyTavern。
3. 在扩展设置中启用 `Preset Prompt Images`。

仓库中已包含编译后的 `dist/index.js`，直接安装即可。

## 开发构建

从源码构建需要 Node.js >= 20。

```bash
pnpm install
pnpm build
```

或使用 npm：

```bash
npm install
npm run build
```

构建输出到 `dist/`，`manifest.json` 加载 `dist/index.js`。

## 兼容性说明

- 只支持 `marker !== true` 且 `injection_position = 0`（Relative）的提示词条目。
- marker / In-chat / Attach 条目上的图片会保留，但不会发送。
- PromptManager 自带的提示词 import/export 不包含 `extensions`，不会携带图片。
- 模型是否支持图片、支持哪些 role 和格式，由预设开发者负责。

## 目录结构

```text
Plugin_Preset_Images/
├── manifest.json
├── style.css
├── package.json
├── tsconfig.json
├── dist/
├── docs/
├── sample/
└── src/
```
