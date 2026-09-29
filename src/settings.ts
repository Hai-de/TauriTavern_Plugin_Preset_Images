import {
    DEFAULT_PLUGIN_SETTINGS,
    EXTENSION_NAME,
    PLUGIN_STORE_KEY,
    PLUGIN_STORE_NAMESPACE,
    PLUGIN_STORE_TABLE,
} from './constants.js';
import { getRuntimeContext, translateText, toastError, toastSuccess } from './runtime.js';
import type { PluginSettings, RuntimeContext } from './types.js';

let cachedSettings: PluginSettings = { ...DEFAULT_PLUGIN_SETTINGS };
let initialized = false;
let saveChain: Promise<void> = Promise.resolve();

function asBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function asNonNegativeNumber(value: unknown, fallback: number): number {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function normalizeSettings(raw: any): PluginSettings {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
        enabled: asBoolean(source.enabled, DEFAULT_PLUGIN_SETTINGS.enabled),
        hideUiWhenDisabled: asBoolean(source.hideUiWhenDisabled, DEFAULT_PLUGIN_SETTINGS.hideUiWhenDisabled),
        showPositionSelect: asBoolean(source.showPositionSelect, DEFAULT_PLUGIN_SETTINGS.showPositionSelect),
        showMoveButtons: asBoolean(source.showMoveButtons, DEFAULT_PLUGIN_SETTINGS.showMoveButtons),
        idleDisableEnabled: asBoolean(source.idleDisableEnabled, DEFAULT_PLUGIN_SETTINGS.idleDisableEnabled),
        idleDisableMinutes: asNonNegativeNumber(source.idleDisableMinutes, DEFAULT_PLUGIN_SETTINGS.idleDisableMinutes),
        idleCountdownSeconds: asNonNegativeNumber(source.idleCountdownSeconds, DEFAULT_PLUGIN_SETTINGS.idleCountdownSeconds),
        useTauriTavernStore: asBoolean(source.useTauriTavernStore, DEFAULT_PLUGIN_SETTINGS.useTauriTavernStore),
        warnMaxImageMiB: asNonNegativeNumber(source.warnMaxImageMiB, DEFAULT_PLUGIN_SETTINGS.warnMaxImageMiB),
        warnMaxImagesPerPrompt: asNonNegativeNumber(source.warnMaxImagesPerPrompt, DEFAULT_PLUGIN_SETTINGS.warnMaxImagesPerPrompt),
        warnMaxTotalMiB: asNonNegativeNumber(source.warnMaxTotalMiB, DEFAULT_PLUGIN_SETTINGS.warnMaxTotalMiB),
    };
}

function getStoreApi(context: RuntimeContext = getRuntimeContext()): any | null {
    const store = (window as any).__TAURITAVERN__?.api?.extension?.store;
    if (!store?.tryGetJson || !store?.setJson) {
        return null;
    }
    return store;
}

export function isTauriTavernStoreAvailable(context: RuntimeContext = getRuntimeContext()): boolean {
    return getStoreApi(context) !== null;
}

async function saveMainSettings(context: RuntimeContext): Promise<void> {
    try {
        const scriptUrl = new URL('../../../../script.js', import.meta.url).href;
        const scriptModule: any = await import(scriptUrl);
        if (typeof scriptModule?.saveSettings === 'function') {
            await scriptModule.saveSettings();
            return;
        }
    } catch (error) {
        console.warn('[Preset Prompt Images] Could not import saveSettings; falling back to debounced save.', error);
    }
    context.saveSettingsDebounced?.();
}

async function readFromExtensionSettings(context: RuntimeContext): Promise<any> {
    return context.extensionSettings?.[EXTENSION_NAME] ?? null;
}

async function writeToExtensionSettings(context: RuntimeContext, settings: PluginSettings): Promise<void> {
    context.extensionSettings ??= {};
    context.extensionSettings[EXTENSION_NAME] = { ...settings };
    await saveMainSettings(context);
}

async function clearFromExtensionSettings(context: RuntimeContext): Promise<void> {
    if (context.extensionSettings && Object.prototype.hasOwnProperty.call(context.extensionSettings, EXTENSION_NAME)) {
        delete context.extensionSettings[EXTENSION_NAME];
        await saveMainSettings(context);
    }
}

async function readFromTauriTavernStore(context: RuntimeContext): Promise<any | null> {
    const store = getStoreApi(context);
    if (!store) {
        return null;
    }
    const result = await store.tryGetJson({
        namespace: PLUGIN_STORE_NAMESPACE,
        table: PLUGIN_STORE_TABLE,
        key: PLUGIN_STORE_KEY,
    });
    return result?.found ? result.value : null;
}

async function writeToTauriTavernStore(context: RuntimeContext, settings: PluginSettings): Promise<void> {
    const store = getStoreApi(context);
    if (!store) {
        throw new Error('TauriTavern extension store is not available');
    }
    await store.setJson({
        namespace: PLUGIN_STORE_NAMESPACE,
        table: PLUGIN_STORE_TABLE,
        key: PLUGIN_STORE_KEY,
        value: { ...settings },
    });
}

export async function clearPluginStoreNamespace(context: RuntimeContext = getRuntimeContext()): Promise<void> {
    const store = getStoreApi(context);
    if (!store || typeof store.listTables !== 'function' || typeof store.deleteTable !== 'function') {
        return;
    }

    const tables = await store.listTables({ namespace: PLUGIN_STORE_NAMESPACE });
    if (!Array.isArray(tables)) {
        return;
    }

    for (const table of tables) {
        await store.deleteTable({ namespace: PLUGIN_STORE_NAMESPACE, table });
    }
}

async function persistSettings(settings: PluginSettings, context: RuntimeContext): Promise<void> {
    if (settings.useTauriTavernStore && isTauriTavernStoreAvailable(context)) {
        await writeToTauriTavernStore(context, settings);
        return;
    }
    await writeToExtensionSettings(context, settings);
}

function schedulePersist(context: RuntimeContext = getRuntimeContext()): Promise<void> {
    saveChain = saveChain
        .catch(() => undefined)
        .then(() => persistSettings(cachedSettings, context))
        .catch(error => {
            console.error('[Preset Prompt Images] Failed to save plugin settings.', error);
            toastError(translateText('Failed to save plugin settings. Check console for details.'));
        });
    return saveChain;
}

function dispatchSettingsChanged(): void {
    window.dispatchEvent(new CustomEvent('tt-preset-images-settings-changed'));
}

export async function initializePluginSettings(context: RuntimeContext = getRuntimeContext()): Promise<PluginSettings> {
    const rawExtension = await readFromExtensionSettings(context);
    const storeAvailable = isTauriTavernStoreAvailable(context);

    if (rawExtension?.useTauriTavernStore === true && storeAvailable) {
        try {
            const stored = await readFromTauriTavernStore(context);
            cachedSettings = normalizeSettings({ ...(stored ?? rawExtension), useTauriTavernStore: true });
        } catch (error) {
            console.error('[Preset Prompt Images] Failed to read plugin configuration from TauriTavern extension store.', error);
            cachedSettings = normalizeSettings(rawExtension);
            cachedSettings.useTauriTavernStore = false;
        }
    } else if (rawExtension == null && storeAvailable) {
        try {
            const stored = await readFromTauriTavernStore(context);
            cachedSettings = stored ? normalizeSettings({ ...stored, useTauriTavernStore: true }) : { ...DEFAULT_PLUGIN_SETTINGS };
        } catch (error) {
            console.error('[Preset Prompt Images] Failed to read plugin configuration from TauriTavern extension store.', error);
            cachedSettings = { ...DEFAULT_PLUGIN_SETTINGS };
        }
    } else {
        cachedSettings = normalizeSettings(rawExtension);
        if (cachedSettings.useTauriTavernStore && !storeAvailable) {
            cachedSettings.useTauriTavernStore = false;
            void schedulePersist(context);
        }
    }

    initialized = true;
    return cachedSettings;
}

export function getPluginSettings(): PluginSettings {
    return cachedSettings;
}

export function updatePluginSettings(patch: Partial<PluginSettings>, options: { save?: boolean } = {}): PluginSettings {
    cachedSettings = normalizeSettings({ ...cachedSettings, ...patch });
    dispatchSettingsChanged();
    if (options.save !== false) {
        void schedulePersist();
    }
    return cachedSettings;
}

export async function setTauriTavernStoreEnabled(enabled: boolean, context: RuntimeContext = getRuntimeContext()): Promise<PluginSettings> {
    if (enabled) {
        if (!isTauriTavernStoreAvailable(context)) {
            throw new Error('TauriTavern extension store is not available');
        }

        const current = normalizeSettings(context.extensionSettings?.[EXTENSION_NAME] ?? cachedSettings);
        const next: PluginSettings = { ...current, useTauriTavernStore: true };
        await writeToTauriTavernStore(context, next);
        await clearFromExtensionSettings(context);
        cachedSettings = next;
        dispatchSettingsChanged();
        toastSuccess(translateText('Plugin configuration moved to the TauriTavern extension store.'));
        return next;
    }

    const stored = await readFromTauriTavernStore(context);
    const next = normalizeSettings({ ...(stored ?? cachedSettings), useTauriTavernStore: false });
    await writeToExtensionSettings(context, next);
    // The TauriTavern store copy is intentionally kept as a backup.
    cachedSettings = next;
    dispatchSettingsChanged();
    toastSuccess(translateText('Plugin configuration restored to SillyTavern settings. The TauriTavern extension store copy was kept.'));
    return next;
}

export async function clearPluginConfigurationForUninstall(context: RuntimeContext = getRuntimeContext()): Promise<void> {
    const errors: unknown[] = [];

    try {
        await clearFromExtensionSettings(context);
    } catch (error) {
        errors.push(error);
    }

    try {
        await clearPluginStoreNamespace(context);
    } catch (error) {
        errors.push(error);
    }

    if (errors.length) {
        throw new Error('Failed to clear one or more plugin configuration stores');
    }
}

function confirmAction(context: RuntimeContext, title: string, message: string): Promise<boolean> {
    const Popup = context.Popup;
    if (Popup?.show?.confirm) {
        return Popup.show.confirm(title, message);
    }
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
}

function readPanelSettings(context: RuntimeContext): PluginSettings {
    const panel = document.getElementById('tt-preset-image-settings');
    if (!panel) {
        return cachedSettings;
    }

    return normalizeSettings({
        ...cachedSettings,
        enabled: panel.querySelector<HTMLInputElement>('#tt-preset-image-enabled')?.checked,
        hideUiWhenDisabled: panel.querySelector<HTMLInputElement>('#tt-preset-image-hide-ui')?.checked,
        showPositionSelect: panel.querySelector<HTMLInputElement>('#tt-preset-image-show-position')?.checked,
        showMoveButtons: panel.querySelector<HTMLInputElement>('#tt-preset-image-show-move')?.checked,
        idleDisableEnabled: panel.querySelector<HTMLInputElement>('#tt-preset-image-idle-enabled')?.checked,
        idleDisableMinutes: Number(panel.querySelector<HTMLInputElement>('#tt-preset-image-idle-minutes')?.value ?? 0),
        warnMaxImageMiB: Number(panel.querySelector<HTMLInputElement>('#tt-preset-image-max-image')?.value ?? 0),
        warnMaxImagesPerPrompt: Number(panel.querySelector<HTMLInputElement>('#tt-preset-image-max-count')?.value ?? 0),
        warnMaxTotalMiB: Number(panel.querySelector<HTMLInputElement>('#tt-preset-image-max-total')?.value ?? 0),
    });
}

export function renderSettingsPanel(context: RuntimeContext = getRuntimeContext()): void {
    const host = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!host) {
        return;
    }

    const settings = cachedSettings;
    const storeAvailable = isTauriTavernStoreAvailable(context);
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
                <input id="tt-preset-image-hide-ui" type="checkbox" ${settings.hideUiWhenDisabled ? 'checked' : ''}>
                <span>${translateText('Hide preset image UI when disabled')}</span>
            </label>
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
            <label class="checkbox_label">
                <input id="tt-preset-image-idle-enabled" type="checkbox" ${settings.idleDisableEnabled ? 'checked' : ''}>
                <span>${translateText('Disable extension after inactivity')}</span>
            </label>
            <div class="tt-preset-image-settings-grid">
                <label for="tt-preset-image-idle-minutes">${translateText('Inactivity timeout in minutes (0 = disabled)')}</label>
                <input id="tt-preset-image-idle-minutes" class="text_pole" type="number" min="0" step="1" value="${settings.idleDisableMinutes}">
            </div>
            <div class="tt-preset-image-settings-help">
                ${translateText('The inactivity timer runs only while the window is visible and focused. It runs at most once per application startup.')}
            </div>
            <label class="checkbox_label">
                <input id="tt-preset-image-use-store" type="checkbox" ${settings.useTauriTavernStore ? 'checked' : ''} ${storeAvailable ? '' : 'disabled'}>
                <span>${translateText('Store plugin configuration in TauriTavern extension store')}</span>
            </label>
            <div class="tt-preset-image-settings-help">
                ${storeAvailable
                    ? translateText('When enabled, the plugin configuration is stored outside settings.json. The old extension_settings key is removed.')
                    : translateText('This option is unavailable because the TauriTavern extension store API was not found.')}
            </div>
            <div class="tt-preset-image-settings-grid">
                <label for="tt-preset-image-max-image">${translateText('Warn if one image exceeds MiB (0 = no warning)')}</label>
                <input id="tt-preset-image-max-image" class="text_pole" type="number" min="0" step="0.1" value="${settings.warnMaxImageMiB}">
                <label for="tt-preset-image-max-count">${translateText('Warn if one prompt has more than N images (0 = no warning)')}</label>
                <input id="tt-preset-image-max-count" class="text_pole" type="number" min="0" step="1" value="${settings.warnMaxImagesPerPrompt}">
                <label for="tt-preset-image-max-total">${translateText('Warn if preset images exceed MiB (0 = no warning)')}</label>
                <input id="tt-preset-image-max-total" class="text_pole" type="number" min="0" step="0.1" value="${settings.warnMaxTotalMiB}">
            </div>
            <div class="tt-preset-image-settings-advanced">
                <b>${translateText('Advanced')}</b>
                <button id="tt-preset-image-uninstall" type="button" class="menu_button danger">${translateText('Uninstall plugin')}</button>
            </div>
        </div>
    `;

    const commit = (): void => {
        updatePluginSettings(readPanelSettings(context));
    };

    panel.querySelector('#tt-preset-image-enabled')?.addEventListener('change', commit);
    panel.querySelector('#tt-preset-image-hide-ui')?.addEventListener('change', commit);
    panel.querySelector('#tt-preset-image-show-position')?.addEventListener('change', commit);
    panel.querySelector('#tt-preset-image-show-move')?.addEventListener('change', commit);
    panel.querySelector('#tt-preset-image-idle-enabled')?.addEventListener('change', commit);
    panel.querySelector('#tt-preset-image-max-image')?.addEventListener('change', commit);
    panel.querySelector('#tt-preset-image-max-count')?.addEventListener('change', commit);
    panel.querySelector('#tt-preset-image-max-total')?.addEventListener('change', commit);

    const idleMinutes = panel.querySelector<HTMLInputElement>('#tt-preset-image-idle-minutes');
    idleMinutes?.addEventListener('change', commit);
    if (idleMinutes) {
        idleMinutes.disabled = !settings.idleDisableEnabled;
    }
    panel.querySelector('#tt-preset-image-idle-enabled')?.addEventListener('change', () => {
        if (idleMinutes) {
            idleMinutes.disabled = !panel.querySelector<HTMLInputElement>('#tt-preset-image-idle-enabled')?.checked;
        }
    });

    const storeToggle = panel.querySelector<HTMLInputElement>('#tt-preset-image-use-store');
    storeToggle?.addEventListener('change', async () => {
        const desired = Boolean(storeToggle.checked);
        const title = translateText('Preset Prompt Images');
        const message = desired
            ? translateText('Move plugin configuration to the TauriTavern extension store? The exact extension_settings key will be removed after a successful copy.')
            : translateText('Move plugin configuration back to SillyTavern settings? The TauriTavern extension store copy will be kept.');
        const confirmed = await confirmAction(context, title, message);
        if (!confirmed) {
            storeToggle.checked = !desired;
            return;
        }

        try {
            await setTauriTavernStoreEnabled(desired, context);
            renderSettingsPanel(context);
        } catch (error) {
            console.error('[Preset Prompt Images] Failed to switch plugin configuration storage.', error);
            storeToggle.checked = !desired;
            toastError(translateText('Failed to switch plugin configuration storage.'));
        }
    });

    panel.querySelector('#tt-preset-image-uninstall')?.addEventListener('click', async () => {
        const first = await confirmAction(
            context,
            translateText('Uninstall plugin'),
            translateText('Uninstalling deletes the plugin files and plugin configuration. Images inside preset JSON are preserved. Continue?'),
        );
        if (!first) {
            return;
        }

        const second = await confirmAction(
            context,
            translateText('Uninstall plugin'),
            translateText('Are you absolutely sure? This action cannot be undone without reinstalling the plugin.'),
        );
        if (!second) {
            return;
        }

        try {
            const { uninstallSelfExtension } = await import('./lifecycle.js');
            await uninstallSelfExtension();
        } catch (error) {
            console.error('[Preset Prompt Images] Failed to uninstall plugin.', error);
            toastError(translateText('Failed to uninstall plugin. Check console for details.'));
        }
    });
}

export function isPluginSettingsInitialized(): boolean {
    return initialized;
}
