import type { PluginSettings } from './types.js';

export const EXTENSION_NAME = 'Plugin_Preset_Images';
export const STORE_NAMESPACE = 'tauritavern';
export const STORE_FIELD = 'presetPromptImages';
export const STORE_VERSION = 2 as const;
export const LEGACY_STORE_VERSION = 1 as const;
export const MIB = 1024 * 1024;

export const DEFAULT_PLUGIN_SETTINGS: PluginSettings = {
    enabled: true,
    showPositionSelect: false,
    showMoveButtons: false,
    warnMaxImageMiB: 0,
    warnMaxImagesPerPrompt: 0,
    warnMaxTotalMiB: 0,
};
