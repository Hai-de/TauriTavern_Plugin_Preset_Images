import { DEFAULT_PLUGIN_SETTINGS } from './constants.js';
import { getExtensionSettings, getRuntimeContext, saveExtensionSettings, translateText } from './runtime.js';
import type { PluginSettings, RuntimeContext } from './types.js';

function asNonNegativeNumber(value: unknown, fallback: number): number {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function loadPluginSettings(context: RuntimeContext = getRuntimeContext()): PluginSettings {
    const raw = getExtensionSettings(context);
    const settings: PluginSettings = {
        enabled: raw.enabled !== false,
        showPositionSelect: raw.showPositionSelect === true,
        showMoveButtons: raw.showMoveButtons === true,
        warnMaxImageMiB: asNonNegativeNumber(raw.warnMaxImageMiB, DEFAULT_PLUGIN_SETTINGS.warnMaxImageMiB),
        warnMaxImagesPerPrompt: asNonNegativeNumber(raw.warnMaxImagesPerPrompt, DEFAULT_PLUGIN_SETTINGS.warnMaxImagesPerPrompt),
        warnMaxTotalMiB: asNonNegativeNumber(raw.warnMaxTotalMiB, DEFAULT_PLUGIN_SETTINGS.warnMaxTotalMiB),
    };

    Object.assign(raw, settings);
    return settings;
}

export function setPluginEnabled(enabled: boolean): void {
    const context = getRuntimeContext();
    const raw = getExtensionSettings(context);
    raw.enabled = enabled;
    saveExtensionSettings(context);
    renderSettingsPanel(context);
}

function readPanelSettings(context: RuntimeContext): PluginSettings {
    const panel = document.getElementById('tt-preset-image-settings');
    if (!panel) {
        return loadPluginSettings(context);
    }

    const enabled = panel.querySelector<HTMLInputElement>('#tt-preset-image-enabled')?.checked ?? true;
    const showPositionSelect = panel.querySelector<HTMLInputElement>('#tt-preset-image-show-position')?.checked ?? false;
    const showMoveButtons = panel.querySelector<HTMLInputElement>('#tt-preset-image-show-move')?.checked ?? false;
    const warnMaxImageMiB = Number(panel.querySelector<HTMLInputElement>('#tt-preset-image-max-image')?.value ?? 0);
    const warnMaxImagesPerPrompt = Number(panel.querySelector<HTMLInputElement>('#tt-preset-image-max-count')?.value ?? 0);
    const warnMaxTotalMiB = Number(panel.querySelector<HTMLInputElement>('#tt-preset-image-max-total')?.value ?? 0);

    return {
        enabled,
        showPositionSelect,
        showMoveButtons,
        warnMaxImageMiB: asNonNegativeNumber(warnMaxImageMiB, 0),
        warnMaxImagesPerPrompt: asNonNegativeNumber(warnMaxImagesPerPrompt, 0),
        warnMaxTotalMiB: asNonNegativeNumber(warnMaxTotalMiB, 0),
    };
}

export function renderSettingsPanel(context: RuntimeContext = getRuntimeContext()): void {
    const host = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!host) {
        return;
    }

    const settings = loadPluginSettings(context);
    let panel = document.getElementById('tt-preset-image-settings');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'tt-preset-image-settings';
        panel.className = 'inline-drawer tt-preset-image-settings';
        host.append(panel);
    }

    panel.innerHTML = `
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>${translateText('Preset Prompt Images')}</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <label class="checkbox_label">
                <input id="tt-preset-image-enabled" type="checkbox" ${settings.enabled ? 'checked' : ''}>
                <span>${translateText('Enable preset prompt images')}</span>
            </label>
            <div class="tt-preset-image-settings-help">
                ${translateText('When disabled, text prompts still work, but no preset image is sent to the model.')}
            </div>
            <label class="checkbox_label">
                <input id="tt-preset-image-show-position" type="checkbox" ${settings.showPositionSelect ? 'checked' : ''}>
                <span>${translateText('Show position selector for each image')}</span>
            </label>
            <div class="tt-preset-image-settings-help">
                ${translateText('The position selector is an accessibility and mobile fallback. The sortable list remains the source of truth.')}
            </div>
            <label class="checkbox_label">
                <input id="tt-preset-image-show-move" type="checkbox" ${settings.showMoveButtons ? 'checked' : ''}>
                <span>${translateText('Show move up/down buttons')}</span>
            </label>
            <div class="tt-preset-image-settings-help">
                ${translateText('Useful when native drag and drop is unavailable, such as some mobile WebViews.')}
            </div>
            <div class="tt-preset-image-settings-grid">
                <label for="tt-preset-image-max-image">${translateText('Warn if one image exceeds MiB (0 = no warning)')}</label>
                <input id="tt-preset-image-max-image" class="text_pole" type="number" min="0" step="0.1" value="${settings.warnMaxImageMiB}">
                <label for="tt-preset-image-max-count">${translateText('Warn if one prompt has more than N images (0 = no warning)')}</label>
                <input id="tt-preset-image-max-count" class="text_pole" type="number" min="0" step="1" value="${settings.warnMaxImagesPerPrompt}">
                <label for="tt-preset-image-max-total">${translateText('Warn if preset images exceed MiB (0 = no warning)')}</label>
                <input id="tt-preset-image-max-total" class="text_pole" type="number" min="0" step="0.1" value="${settings.warnMaxTotalMiB}">
            </div>
        </div>
    `;

    const commit = (): void => {
        const next = readPanelSettings(context);
        const raw = getExtensionSettings(context);
        Object.assign(raw, next);
        saveExtensionSettings(context);
    };

    panel.querySelector('#tt-preset-image-enabled')?.addEventListener('change', commit);
    panel.querySelector('#tt-preset-image-show-position')?.addEventListener('change', commit);
    panel.querySelector('#tt-preset-image-show-move')?.addEventListener('change', commit);
    panel.querySelector('#tt-preset-image-max-image')?.addEventListener('change', commit);
    panel.querySelector('#tt-preset-image-max-count')?.addEventListener('change', commit);
    panel.querySelector('#tt-preset-image-max-total')?.addEventListener('change', commit);
}
