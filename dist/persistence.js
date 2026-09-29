import { STORE_FIELD, STORE_NAMESPACE } from './constants.js';
import { translateText, toastError } from './runtime.js';
import { getRuntimeContext } from './runtime.js';
import { writeStore } from './storage.js';
let persistChain = Promise.resolve();
export function persistStore(settings, store) {
    writeStore(settings, store);
    const context = getRuntimeContext();
    const presetManager = context.getPresetManager?.('openai');
    const presetName = presetManager?.getSelectedPresetName?.() ?? '';
    persistChain = persistChain
        .catch(() => undefined)
        .then(async () => {
        if (presetManager?.writePresetExtensionField) {
            await presetManager.writePresetExtensionField({
                ...(presetName ? { name: presetName } : {}),
                path: `${STORE_NAMESPACE}.${STORE_FIELD}`,
                value: Object.keys(store.items).length > 0 ? store : undefined,
            });
            return;
        }
        context.saveSettingsDebounced?.();
    })
        .catch(error => {
        console.error('[Preset Prompt Images] Failed to persist preset image data.', error);
        toastError(translateText('Failed to save preset image data. Check console for details.'));
    });
    return persistChain;
}
