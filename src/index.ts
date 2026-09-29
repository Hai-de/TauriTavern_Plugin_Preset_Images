import { installRuntimePatches } from './patches.js';
import { installPresetEvents } from './preset-events.js';
import { renderSettingsPanel } from './settings.js';
import { installPromptImageEditor } from './ui/editor.js';
import { getRuntimeContext } from './runtime.js';

let activated = false;

async function activate(): Promise<void> {
    if (activated) {
        return;
    }
    activated = true;

    try {
        const context = getRuntimeContext();
        renderSettingsPanel(context);
        await installRuntimePatches();
        installPresetEvents();
        installPromptImageEditor();
        console.info('[Preset Prompt Images] Activated');
    } catch (error) {
        console.error('[Preset Prompt Images] Activation failed.', error);
    }
}

function main(): void {
    let context;
    try {
        context = getRuntimeContext();
    } catch {
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
