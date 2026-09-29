import { installRuntimePatches } from './patches.js';
import { installPresetEvents } from './preset-events.js';
import { renderSettingsPanel } from './settings.js';
import { installPromptImageEditor } from './ui/editor.js';
import { getRuntimeContext } from './runtime.js';
import { migrateStoreInPlace, readStore } from './storage.js';
import { persistStore } from './persistence.js';
let activated = false;
async function activate() {
    if (activated) {
        return;
    }
    activated = true;
    try {
        const context = getRuntimeContext();
        if (context.chatCompletionSettings && migrateStoreInPlace(context.chatCompletionSettings)) {
            console.info('[Preset Prompt Images] Migrated legacy v1 preset image data to v2.');
            void persistStore(context.chatCompletionSettings, readStore(context.chatCompletionSettings));
        }
        renderSettingsPanel(context);
        await installRuntimePatches();
        installPresetEvents();
        installPromptImageEditor();
        console.info('[Preset Prompt Images] Activated');
    }
    catch (error) {
        console.error('[Preset Prompt Images] Activation failed.', error);
    }
}
function main() {
    let context;
    try {
        context = getRuntimeContext();
    }
    catch {
        window.setTimeout(main, 100);
        return;
    }
    const eventSource = context.eventSource;
    const appReadyEvent = context.eventTypes?.APP_READY;
    if (eventSource?.on && appReadyEvent) {
        eventSource.on(appReadyEvent, () => { void activate(); });
        return;
    }
    void activate();
}
main();
