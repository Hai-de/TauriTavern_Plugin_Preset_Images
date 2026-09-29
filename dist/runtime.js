import { EXTENSION_NAME } from './constants.js';
export function getRuntimeContext() {
    const context = window.SillyTavern?.getContext?.();
    if (!context) {
        throw new Error('SillyTavern context is not available');
    }
    return context;
}
export function getExtensionSettings(context = getRuntimeContext()) {
    context.extensionSettings ??= {};
    context.extensionSettings[EXTENSION_NAME] ??= {};
    return context.extensionSettings[EXTENSION_NAME];
}
export function saveExtensionSettings(context = getRuntimeContext()) {
    context.saveSettingsDebounced?.();
}
export function toastWarning(message) {
    if (typeof toastr !== 'undefined') {
        toastr.warning(message, 'Preset Prompt Images');
    }
    else {
        console.warn(`[Preset Prompt Images] ${message}`);
    }
}
export function toastError(message) {
    if (typeof toastr !== 'undefined') {
        toastr.error(message, 'Preset Prompt Images');
    }
    else {
        console.error(`[Preset Prompt Images] ${message}`);
    }
}
export function toastSuccess(message) {
    if (typeof toastr !== 'undefined') {
        toastr.success(message, 'Preset Prompt Images');
    }
    else {
        console.info(`[Preset Prompt Images] ${message}`);
    }
}
