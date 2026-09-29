# Preset Prompt Images

TauriTavern / SillyTavern third-party extension for attaching images to Chat Completion preset prompts.

## Data location

Prompt image data is stored inside the Chat Completion preset JSON:

```text
extensions.tauritavern.presetPromptImages
```

This keeps full preset JSON export/import self-contained and lets the text-only preset remain usable when the extension is absent.

## Build

From the repository root:

```bash
./node_modules/.bin/tsc -p Plugin/Plugin_Preset_Images/tsconfig.json
```

Or from this directory when dependencies are available:

```bash
pnpm build
```

Compiled runtime files are written to `dist/`. `manifest.json` loads `dist/index.js`.

## Install

Copy this directory into one of the standard third-party extension locations:

- `data/default-user/extensions/Plugin_Preset_Images`
- `data/extensions/third-party/Plugin_Preset_Images`

Then enable `Preset Prompt Images` from the extension settings.
