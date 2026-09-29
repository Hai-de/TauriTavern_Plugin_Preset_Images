import { migrateStoreInPlace, readStore } from './storage.js';
import { persistStore } from './persistence.js';
import { loadPluginSettings, setPluginEnabled } from './settings.js';
import { getRuntimeContext, translateText, toastError, toastWarning } from './runtime.js';

let installed = false;

export function installPresetEvents(): void {
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

    eventSource.on(eventTypes.OAI_PRESET_IMPORT_READY, async (eventData: any) => {
        try {
            const preset = eventData?.data;
            if (migrateStoreInPlace(preset)) {
                console.info('[Preset Prompt Images] Migrated legacy v1 preset image data to v2.');
            }

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
                toastWarning(translateText('This preset contains prompt images. Enable Preset Prompt Images in extension settings to send them.'));
                return;
            }

            const shouldEnable = await Popup.show.confirm(
                translateText('Preset Prompt Images'),
                translateText('This preset contains prompt images, but the plugin is disabled. Enable preset prompt images for this installation?'),
            );
            if (shouldEnable) {
                setPluginEnabled(true);
            }
        } catch (error) {
            console.error('[Preset Prompt Images] Failed to handle preset import.', error);
            toastError(translateText('Failed to inspect imported preset images. The preset will still be imported.'));
        }
    });

    if (eventTypes.OAI_PRESET_CHANGED_AFTER) {
        eventSource.on(eventTypes.OAI_PRESET_CHANGED_AFTER, async () => {
            try {
                const settings = context.chatCompletionSettings ?? context.extensionSettings;
                if (settings && migrateStoreInPlace(settings)) {
                    console.info('[Preset Prompt Images] Migrated legacy v1 preset image data to v2.');
                    await persistStore(settings, readStore(settings));
                }
            } catch (error) {
                console.error('[Preset Prompt Images] Failed to migrate loaded preset image data.', error);
            }
        });
    }
}
