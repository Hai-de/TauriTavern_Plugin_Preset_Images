export type ImageDetail = 'auto' | 'low' | 'high' | 'original';
export type ImagePosition = 'before' | 'after';

export interface PresetImage {
    id: string;
    dataUrl: string;
    name?: string;
    mime?: string;
    bytes?: number;
    detail?: ImageDetail;
    position?: ImagePosition;
}

export interface PresetPromptImagesStore {
    version: 1;
    items: Record<string, PresetImage[]>;
}

export interface PluginSettings {
    enabled: boolean;
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
    Popup?: any;
    t?: (text: string, ...args: any[]) => string;
    [key: string]: any;
}

export function isPlainObject(value: unknown): value is Record<string, any> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
