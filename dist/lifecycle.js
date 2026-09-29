import { EXTENSION_NAME } from './constants.js';
import { clearPluginConfigurationForUninstall, updatePluginSettings } from './settings.js';
import { getRuntimeContext, translateText, toastError, toastSuccess } from './runtime.js';
function getOwnExtensionName() {
    try {
        const segments = new URL(import.meta.url).pathname.split('/').filter(Boolean);
        const thirdPartyIndex = segments.indexOf('third-party');
        if (thirdPartyIndex !== -1 && segments[thirdPartyIndex + 1]) {
            return `third-party/${segments[thirdPartyIndex + 1]}`;
        }
    }
    catch (error) {
        console.warn('[Preset Prompt Images] Could not derive extension name from URL.', error);
    }
    return EXTENSION_NAME;
}
async function loadExtensionsModule() {
    const moduleUrl = new URL('../../../../extensions.js', import.meta.url).href;
    return import(moduleUrl);
}
export async function disableSelfExtension() {
    const name = getOwnExtensionName();
    try {
        const extensionsModule = await loadExtensionsModule();
        if (typeof extensionsModule?.disableExtension !== 'function') {
            throw new Error('disableExtension API not found');
        }
        await extensionsModule.disableExtension(name, true);
    }
    catch (error) {
        console.error('[Preset Prompt Images] Failed to disable the extension; disabling the feature instead.', error);
        updatePluginSettings({ enabled: false });
        toastError(translateText('Could not disable the extension automatically. Preset prompt images were disabled instead.'));
    }
}
export async function uninstallSelfExtension() {
    await clearPluginConfigurationForUninstall(getRuntimeContext());
    const name = getOwnExtensionName();
    const extensionsModule = await loadExtensionsModule();
    if (typeof extensionsModule?.deleteExtension !== 'function') {
        throw new Error('deleteExtension API not found');
    }
    toastSuccess(translateText('Uninstalling Preset Prompt Images.'));
    await extensionsModule.deleteExtension(name, false);
}
