import { readStore } from './storage.js';
import { loadPluginSettings, setPluginEnabled } from './settings.js';
import { getRuntimeContext, toastError, toastWarning } from './runtime.js';
let installed = false;
export function installPresetEvents() {
    if (installed) {
        return;
    }
    installed = true;
    const context = getRuntimeContext();
    const eventSource = context.eventSource;
    const eventTypes = context.eventTypes;
    if (!eventSource || !eventTypes?.OAI_PRESET_IMPORT_READY) {
        console.warn('[Preset Prompt Images] Preset import events are not available; import warnings disabled.');
        return;
    }
    eventSource.on(eventTypes.OAI_PRESET_IMPORT_READY, async (eventData) => {
        try {
            const preset = eventData?.data;
            const store = readStore(preset);
            if (Object.keys(store.items).length === 0) {
                return;
            }
            const pluginSettings = loadPluginSettings(context);
            if (pluginSettings.enabled) {
                return;
            }
            const Popup = context.Popup;
            if (!Popup?.show?.confirm) {
                toastWarning('This preset contains prompt images. Enable Preset Prompt Images in extension settings to send them.');
                return;
            }
            const shouldEnable = await Popup.show.confirm('Preset Prompt Images', 'This preset contains prompt images, but the plugin is disabled. Enable preset prompt images for this installation?');
            if (shouldEnable) {
                setPluginEnabled(true);
            }
        }
        catch (error) {
            console.error('[Preset Prompt Images] Failed to handle preset import.', error);
            toastError('Failed to inspect imported preset images. The preset will still be imported.');
        }
    });
}
