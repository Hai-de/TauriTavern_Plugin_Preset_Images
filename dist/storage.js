import { MIB, STORE_FIELD, STORE_NAMESPACE, STORE_VERSION } from './constants.js';
import { isPlainObject } from './types.js';
export function createStore() {
    return { version: STORE_VERSION, items: {} };
}
export function createImageId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
export function isDataUrl(value) {
    return typeof value === 'string' && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value);
}
export function parseDataUrl(dataUrl) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s.exec(dataUrl);
    if (!match) {
        return null;
    }
    return { mime: match[1], base64: match[2] };
}
export function estimateDataUrlBytes(dataUrl) {
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) {
        return 0;
    }
    const padding = parsed.base64.endsWith('==') ? 2 : parsed.base64.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((parsed.base64.length * 3) / 4) - padding);
}
export function normalizeImage(raw) {
    if (!isPlainObject(raw) || !isDataUrl(raw.dataUrl)) {
        return null;
    }
    const image = {
        id: typeof raw.id === 'string' && raw.id ? raw.id : createImageId(),
        dataUrl: raw.dataUrl,
        name: typeof raw.name === 'string' ? raw.name : undefined,
        mime: typeof raw.mime === 'string' ? raw.mime : parseDataUrl(raw.dataUrl)?.mime,
        bytes: Number.isFinite(Number(raw.bytes)) ? Number(raw.bytes) : estimateDataUrlBytes(raw.dataUrl),
        detail: isImageDetail(raw.detail) ? raw.detail : 'auto',
        position: isImagePosition(raw.position) ? raw.position : 'after',
    };
    return image;
}
export function isImageDetail(value) {
    return value === 'auto' || value === 'low' || value === 'high' || value === 'original';
}
export function isImagePosition(value) {
    return value === 'before' || value === 'after';
}
export function readStore(settings) {
    const raw = settings?.extensions?.[STORE_NAMESPACE]?.[STORE_FIELD];
    if (!isPlainObject(raw) || !isPlainObject(raw.items)) {
        return createStore();
    }
    const version = Number(raw.version ?? STORE_VERSION);
    if (version !== STORE_VERSION) {
        console.warn(`[Preset Prompt Images] Unsupported preset image schema version: ${version}`);
        return createStore();
    }
    const store = createStore();
    for (const [identifier, rawImages] of Object.entries(raw.items)) {
        if (typeof identifier !== 'string' || identifier.length === 0 || !Array.isArray(rawImages)) {
            continue;
        }
        const images = rawImages.map(normalizeImage).filter((image) => image !== null);
        if (images.length) {
            store.items[identifier] = images;
        }
    }
    return store;
}
export function writeStore(settings, store) {
    settings.extensions ??= {};
    settings.extensions[STORE_NAMESPACE] ??= {};
    if (Object.keys(store.items).length === 0) {
        delete settings.extensions[STORE_NAMESPACE][STORE_FIELD];
        if (Object.keys(settings.extensions[STORE_NAMESPACE]).length === 0) {
            delete settings.extensions[STORE_NAMESPACE];
        }
        if (Object.keys(settings.extensions).length === 0) {
            delete settings.extensions;
        }
        return;
    }
    settings.extensions[STORE_NAMESPACE][STORE_FIELD] = store;
}
export function getImages(settings, identifier) {
    return readStore(settings).items[identifier] ?? [];
}
export function setImages(settings, identifier, images) {
    const store = readStore(settings);
    if (images.length) {
        store.items[identifier] = images;
    }
    else {
        delete store.items[identifier];
    }
    writeStore(settings, store);
    return store;
}
export function getAllImageIdentifiers(settings) {
    return new Set(Object.keys(readStore(settings).items));
}
export function hasAnyImages(settings) {
    return Object.keys(readStore(settings).items).length > 0;
}
export function totalImageBytes(settings) {
    const store = readStore(settings);
    let total = 0;
    for (const images of Object.values(store.items)) {
        for (const image of images) {
            total += image.bytes ?? estimateDataUrlBytes(image.dataUrl);
        }
    }
    return total;
}
export function checkImageLimits(settings, store, pluginSettings) {
    const warnings = [];
    if (pluginSettings.warnMaxImageMiB > 0) {
        for (const [identifier, images] of Object.entries(store.items)) {
            for (const image of images) {
                const bytes = image.bytes ?? estimateDataUrlBytes(image.dataUrl);
                if (bytes > pluginSettings.warnMaxImageMiB * MIB) {
                    warnings.push(`Image "${image.name ?? image.id}" for prompt ${identifier} is ${(bytes / MIB).toFixed(2)} MiB.`);
                }
            }
        }
    }
    if (pluginSettings.warnMaxImagesPerPrompt > 0) {
        for (const [identifier, images] of Object.entries(store.items)) {
            if (images.length > pluginSettings.warnMaxImagesPerPrompt) {
                warnings.push(`Prompt ${identifier} has ${images.length} images.`);
            }
        }
    }
    if (pluginSettings.warnMaxTotalMiB > 0) {
        let total = 0;
        for (const images of Object.values(store.items)) {
            for (const image of images) {
                total += image.bytes ?? estimateDataUrlBytes(image.dataUrl);
            }
        }
        if (total > pluginSettings.warnMaxTotalMiB * MIB) {
            warnings.push(`Preset prompt images total ${(total / MIB).toFixed(2)} MiB.`);
        }
    }
    return warnings;
}
export function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string' && isDataUrl(reader.result)) {
                resolve(reader.result);
            }
            else {
                reject(new Error('File is not a supported image data URL'));
            }
        };
        reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file'));
        reader.readAsDataURL(file);
    });
}
