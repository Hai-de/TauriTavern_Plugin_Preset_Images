import type { PluginSettings } from './types.js';

export const EXTENSION_NAME = 'Plugin_Preset_Images';
export const STORE_NAMESPACE = 'tauritavern';
export const STORE_FIELD = 'presetPromptImages';
export const STORE_VERSION = 2 as const;
export const MIB = 1024 * 1024;
export const PLUGIN_STORE_NAMESPACE = EXTENSION_NAME;
export const PLUGIN_STORE_TABLE = 'settings';
export const PLUGIN_STORE_KEY = 'config';

export const DEFAULT_PLUGIN_SETTINGS: PluginSettings = {
    enabled: true,
    hideUiWhenDisabled: false,
    showPositionSelect: false,
    showMoveButtons: false,
    idleDisableEnabled: false,
    idleDisableMinutes: 0,
    idleCountdownSeconds: 15,
    useTauriTavernStore: false,
    warnMaxImageMiB: 0,
    warnMaxImagesPerPrompt: 0,
    warnMaxTotalMiB: 0,
};
