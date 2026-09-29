import { LEGACY_STORE_VERSION, MIB, STORE_FIELD, STORE_NAMESPACE, STORE_VERSION } from './constants.js';
import { isPlainObject } from './types.js';
export function createLayout() {
    return { before: [], after: [] };
}
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
export function isImageDetail(value) {
    return value === 'auto' || value === 'low' || value === 'high' || value === 'original';
}
function normalizeImage(raw) {
    if (!isPlainObject(raw) || !isDataUrl(raw.dataUrl)) {
        return null;
    }
    return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : createImageId(),
        dataUrl: raw.dataUrl,
        name: typeof raw.name === 'string' ? raw.name : undefined,
        mime: typeof raw.mime === 'string' ? raw.mime : parseDataUrl(raw.dataUrl)?.mime,
        bytes: Number.isFinite(Number(raw.bytes)) ? Number(raw.bytes) : estimateDataUrlBytes(raw.dataUrl),
        detail: isImageDetail(raw.detail) ? raw.detail : 'auto',
    };
}
function normalizeLayoutItems(rawItems) {
    const items = {};
    if (!isPlainObject(rawItems)) {
        return items;
    }
    for (const [identifier, rawLayout] of Object.entries(rawItems)) {
        if (typeof identifier !== 'string' || identifier.length === 0) {
            continue;
        }
        if (Array.isArray(rawLayout)) {
            const layout = migrateLegacyImages(rawLayout);
            if (layout.before.length || layout.after.length) {
                items[identifier] = layout;
            }
            continue;
        }
        if (!isPlainObject(rawLayout)) {
            continue;
        }
        const before = Array.isArray(rawLayout.before)
            ? rawLayout.before.map(normalizeImage).filter((image) => image !== null)
            : [];
        const after = Array.isArray(rawLayout.after)
            ? rawLayout.after.map(normalizeImage).filter((image) => image !== null)
            : [];
        if (before.length || after.length) {
            items[identifier] = { before, after };
        }
    }
    return items;
}
function migrateLegacyImages(images) {
    const layout = createLayout();
    for (const raw of images) {
        const image = normalizeImage(raw);
        if (!image) {
            continue;
        }
        const position = raw?.position === 'before' ? 'before' : 'after';
        layout[position].push(image);
    }
    return layout;
}
function readRawStore(settings) {
    return settings?.extensions?.[STORE_NAMESPACE]?.[STORE_FIELD];
}
export function readStore(settings) {
    const raw = readRawStore(settings);
    if (!isPlainObject(raw)) {
        return createStore();
    }
    const version = Number(raw.version ?? LEGACY_STORE_VERSION);
    if (version !== STORE_VERSION && version !== LEGACY_STORE_VERSION) {
        console.warn(`[Preset Prompt Images] Unsupported preset image schema version: ${version}`);
        return createStore();
    }
    return {
        version: STORE_VERSION,
        items: normalizeLayoutItems(raw.items),
    };
}
export function migrateStoreInPlace(settings) {
    const raw = readRawStore(settings);
    if (!isPlainObject(raw)) {
        return false;
    }
    const version = Number(raw.version ?? LEGACY_STORE_VERSION);
    if (version === STORE_VERSION) {
        return false;
    }
    if (version !== LEGACY_STORE_VERSION) {
        console.warn(`[Preset Prompt Images] Refusing to migrate unsupported preset image schema version: ${version}`);
        return false;
    }
    const migrated = readStore(settings);
    const hadItems = isPlainObject(raw.items) && Object.keys(raw.items).length > 0;
    if (!Object.keys(migrated.items).length && hadItems) {
        console.warn('[Preset Prompt Images] Legacy store contained no recognizable image data; keeping legacy data untouched.');
        return false;
    }
    writeStore(settings, migrated);
    return true;
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
export function getLayout(settings, identifier) {
    return readStore(settings).items[identifier] ?? createLayout();
}
export function setLayout(settings, identifier, layout) {
    const store = readStore(settings);
    if (layout.before.length || layout.after.length) {
        store.items[identifier] = {
            before: [...layout.before],
            after: [...layout.after],
        };
    }
    else {
        delete store.items[identifier];
    }
    writeStore(settings, store);
    return store;
}
export function allImages(layout) {
    return [...layout.before, ...layout.after];
}
export function getAllImageIdentifiers(settings) {
    const store = readStore(settings);
    return new Set(Object.entries(store.items)
        .filter(([, layout]) => layout.before.length || layout.after.length)
        .map(([identifier]) => identifier));
}
export function hasAnyImages(settings) {
    return getAllImageIdentifiers(settings).size > 0;
}
export function totalImageBytes(settings) {
    const store = readStore(settings);
    let total = 0;
    for (const layout of Object.values(store.items)) {
        for (const image of allImages(layout)) {
            total += image.bytes ?? estimateDataUrlBytes(image.dataUrl);
        }
    }
    return total;
}
export function collectImageLimitWarnings(store, pluginSettings) {
    const warnings = [];
    if (pluginSettings.warnMaxImageMiB > 0) {
        for (const [identifier, layout] of Object.entries(store.items)) {
            for (const image of allImages(layout)) {
                const bytes = image.bytes ?? estimateDataUrlBytes(image.dataUrl);
                if (bytes > pluginSettings.warnMaxImageMiB * MIB) {
                    warnings.push({ kind: 'image', identifier, image, bytes });
                }
            }
        }
    }
    if (pluginSettings.warnMaxImagesPerPrompt > 0) {
        for (const [identifier, layout] of Object.entries(store.items)) {
            const count = layout.before.length + layout.after.length;
            if (count > pluginSettings.warnMaxImagesPerPrompt) {
                warnings.push({ kind: 'prompt', identifier, count });
            }
        }
    }
    if (pluginSettings.warnMaxTotalMiB > 0) {
        let total = 0;
        for (const layout of Object.values(store.items)) {
            for (const image of allImages(layout)) {
                total += image.bytes ?? estimateDataUrlBytes(image.dataUrl);
            }
        }
        if (total > pluginSettings.warnMaxTotalMiB * MIB) {
            warnings.push({ kind: 'total', total });
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
