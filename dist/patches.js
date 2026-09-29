import { appendPresetImageLayout } from './message-content.js';
import { installMultimodalSquashPatch } from './squash.js';
import { getAllImageIdentifiers, getLayout, hasAnyImages } from './storage.js';
import { loadPluginSettings } from './settings.js';
import { getRuntimeContext, t, translateText, toastError, toastWarning } from './runtime.js';
import { renderPromptImageEditor } from './ui/editor.js';
let installed = false;
function isEligiblePrompt(prompt) {
    if (!prompt || prompt.marker === true) {
        return false;
    }
    return Number(prompt.injection_position ?? 0) === 0;
}
function installPreparePromptPatch(PromptManager) {
    const prototype = PromptManager.prototype;
    const original = prototype.preparePrompt;
    if (typeof original !== 'function' || original.__ttPresetImagesPatched) {
        return;
    }
    prototype.preparePrompt = function patchedPreparePrompt(prompt, originalArg) {
        const prepared = original.call(this, prompt, originalArg);
        try {
            const pluginSettings = loadPluginSettings(getRuntimeContext());
            if (pluginSettings.enabled && prepared?.identifier) {
                const source = this?.serviceSettings?.prompts?.find?.((item) => item?.identifier === prepared.identifier) ?? prompt;
                if (isEligiblePrompt(source)) {
                    const layout = getLayout(this.serviceSettings, prepared.identifier);
                    if (layout.before.length + layout.after.length > 0) {
                        prepared.presetPromptImageLayout = layout;
                    }
                }
            }
        }
        catch (error) {
            console.error('[Preset Prompt Images] Failed to attach preset images during prompt preparation.', error);
        }
        return prepared;
    };
    prototype.preparePrompt.__ttPresetImagesPatched = true;
}
function installMessageFromPromptPatch(Message) {
    const original = Message.fromPromptAsync;
    if (typeof original !== 'function' || original.__ttPresetImagesPatched) {
        return;
    }
    Message.fromPromptAsync = async function patchedFromPromptAsync(prompt, tokenHandler) {
        const message = await original.call(this, prompt, tokenHandler);
        const layout = prompt?.presetPromptImageLayout;
        if (layout?.before?.length || layout?.after?.length) {
            try {
                if (loadPluginSettings(getRuntimeContext()).enabled) {
                    await appendPresetImageLayout(message, layout);
                }
            }
            catch (error) {
                console.error('[Preset Prompt Images] Failed to append preset images.', error);
                toastError(translateText('Preset images could not be appended to the request. Text prompt will still be sent.'));
            }
            finally {
                delete prompt.presetPromptImageLayout;
            }
        }
        return message;
    };
    Message.fromPromptAsync.__ttPresetImagesPatched = true;
}
function installEditFormPatch(PromptManager) {
    const prototype = PromptManager.prototype;
    const original = prototype.loadPromptIntoEditForm;
    if (typeof original !== 'function' || original.__ttPresetImagesPatched) {
        return;
    }
    prototype.loadPromptIntoEditForm = function patchedLoadPromptIntoEditForm(prompt) {
        original.call(this, prompt);
        try {
            renderPromptImageEditor(this, prompt);
        }
        catch (error) {
            console.error('[Preset Prompt Images] Failed to render prompt image editor.', error);
        }
    };
    prototype.loadPromptIntoEditForm.__ttPresetImagesPatched = true;
}
function installPromptManagerImportPatch(PromptManager) {
    const prototype = PromptManager.prototype;
    const original = prototype.import;
    if (typeof original !== 'function' || original.__ttPresetImagesPatched) {
        return;
    }
    prototype.import = function patchedImport(importData) {
        try {
            const incomingIds = Array.isArray(importData?.data?.prompts)
                ? importData.data.prompts.map((prompt) => prompt?.identifier).filter(Boolean)
                : [];
            const existingImageIds = getAllImageIdentifiers(this?.serviceSettings);
            const overlap = incomingIds.filter((identifier) => existingImageIds.has(identifier));
            if (overlap.length > 0) {
                toastWarning(t `Imported prompt list touches ${overlap.length} identifier(s) that already have preset images. PromptManager import/export does not carry extensions.tauritavern.presetPromptImages; use the full Chat Completion preset JSON to preserve images.`);
            }
        }
        catch (error) {
            console.error('[Preset Prompt Images] Failed to inspect PromptManager import.', error);
        }
        return original.call(this, importData);
    };
    prototype.import.__ttPresetImagesPatched = true;
}
function installPromptManagerExportClickWarning(oaiSettings) {
    document.addEventListener('click', event => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }
        if (!target.closest('#prompt-manager-export') && !target.closest('#prompt-manager-import')) {
            return;
        }
        try {
            if (hasAnyImages(oaiSettings)) {
                toastWarning(translateText('PromptManager import/export only handles prompts and prompt_order. Preset prompt images live in extensions.tauritavern.presetPromptImages; use the full Chat Completion preset export/import to preserve them.'));
            }
        }
        catch (error) {
            console.error('[Preset Prompt Images] Failed to inspect PromptManager export/import state.', error);
        }
    }, true);
}
export async function installRuntimePatches() {
    if (installed) {
        return;
    }
    installed = true;
    const openaiUrl = new URL('../../../../openai.js', import.meta.url).href;
    const promptManagerUrl = new URL('../../../../PromptManager.js', import.meta.url).href;
    const [openaiModule, promptManagerModule] = await Promise.all([
        import(openaiUrl),
        import(promptManagerUrl),
    ]);
    const { Message, ChatCompletion, oai_settings: oaiSettings } = openaiModule;
    const { PromptManager } = promptManagerModule;
    installPreparePromptPatch(PromptManager);
    installMessageFromPromptPatch(Message);
    installEditFormPatch(PromptManager);
    installPromptManagerImportPatch(PromptManager);
    installPromptManagerExportClickWarning(oaiSettings);
    installMultimodalSquashPatch(ChatCompletion);
}
