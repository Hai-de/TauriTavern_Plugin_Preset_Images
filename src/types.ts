export type ImageDetail = 'auto' | 'low' | 'high' | 'original';
export interface PresetImage {
    id: string;
    dataUrl: string;
    name?: string;
    mime?: string;
    bytes?: number;
    detail?: ImageDetail;
}

export interface PresetPromptImageLayout {
    before: PresetImage[];
    after: PresetImage[];
}

export interface PresetPromptImagesStore {
    version: 2;
    items: Record<string, PresetPromptImageLayout>;
}

export interface PluginSettings {
    enabled: boolean;
    hideUiWhenDisabled: boolean;
    showPositionSelect: boolean;
    showMoveButtons: boolean;
    idleDisableEnabled: boolean;
    idleDisableMinutes: number;
    idleCountdownSeconds: number;
    useTauriTavernStore: boolean;
    warnMaxImageMiB: number;
    warnMaxImagesPerPrompt: number;
    warnMaxTotalMiB: number;
}

export interface RuntimeContext {
    extensionSettings?: Record<string, any>;
    eventSource?: any;
    eventTypes?: Record<string, string>;
    getPresetManager?: (apiId?: string) => any;
    saveSettingsDebounced?: () => void;
    saveSettings?: () => Promise<void>;
    chatCompletionSettings?: Record<string, any>;
    Popup?: any;
    t?: any;
    translate?: (text: string, key?: string | null) => string;
    [key: string]: any;
}

export function isPlainObject(value: unknown): value is Record<string, any> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
