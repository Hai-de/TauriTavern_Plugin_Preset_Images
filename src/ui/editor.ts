import {
    collectImageLimitWarnings,
    createImageId,
    estimateDataUrlBytes,
    fileToDataUrl,
    getLayout,
    readStore,
    setLayout,
} from '../storage.js';
import { loadPluginSettings } from '../settings.js';
import { t, translateText, toastError, toastWarning } from '../runtime.js';
import { persistStore } from '../persistence.js';
import type { ImageDetail, PresetImage, PresetPromptImageLayout } from '../types.js';

type PromptManagerLike = {
    serviceSettings: any;
    getPromptById(identifier: string): any;
};

type BucketName = 'before' | 'after';

let currentPromptManager: PromptManagerLike | null = null;
let currentPrompt: any = null;
let editorShell: HTMLDivElement | null = null;
let dragImageId: string | null = null;
let currentPromptEligible = false;

function getPromptIdentifier(): string {
    return String(currentPrompt?.identifier ?? '');
}

function getServiceSettings(): any {
    return currentPromptManager?.serviceSettings;
}

function isEligiblePrompt(prompt: any): boolean {
    if (!prompt || prompt.marker === true) {
        return false;
    }
    return Number(prompt.injection_position ?? 0) === 0;
}

function getLayoutState(): PresetPromptImageLayout {
    return getLayout(getServiceSettings(), getPromptIdentifier());
}

function ensureEditorShell(): HTMLDivElement | null {
    if (editorShell?.isConnected) {
        return editorShell;
    }

    const form = document.querySelector<HTMLFormElement>('#completion_prompt_manager_popup_edit .completion_prompt_manager_popup_entry_form');
    if (!form) {
        return null;
    }

    editorShell = document.createElement('div');
    editorShell.id = 'tt-preset-image-editor';
    editorShell.className = 'tt-preset-image-editor';

    const footer = form.querySelector('.completion_prompt_manager_popup_entry_form_footer');
    if (footer) {
        form.insertBefore(editorShell, footer);
    } else {
        form.append(editorShell);
    }

    return editorShell;
}

function clearChildren(element: Element): void {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

function buildEditorHeader(eligible: boolean): HTMLDivElement {
    const header = document.createElement('div');
    header.className = 'tt-preset-image-editor__header';

    const title = document.createElement('b');
    title.textContent = translateText('Prompt Images');
    header.append(title);

    const hint = document.createElement('span');
    hint.className = 'tt-preset-image-editor__hint';
    hint.textContent = eligible
        ? translateText('Drag, paste, or select images. They are embedded into the preset JSON.')
        : translateText('Only non-marker Relative prompts can send images. Existing data is kept but will not be sent.');
    header.append(hint);

    return header;
}

function buildTextAnchor(content: string): HTMLDivElement {
    const anchor = document.createElement('div');
    anchor.className = 'tt-preset-image-text-anchor';
    anchor.dataset.dropTarget = 'text';

    const label = document.createElement('div');
    label.className = 'tt-preset-image-text-anchor__label';
    label.textContent = translateText('Prompt Text');
    anchor.append(label);

    const preview = document.createElement('div');
    preview.className = 'tt-preset-image-text-anchor__preview';
    preview.textContent = content.trim().length > 0
        ? content.replace(/\s+/g, ' ').slice(0, 240)
        : translateText('Prompt text is empty');
    anchor.append(preview);

    return anchor;
}

function buildDropZone(eligible: boolean): HTMLDivElement {
    const zone = document.createElement('div');
    zone.id = 'tt-preset-image-dropzone';
    zone.className = 'tt-preset-image-editor__dropzone';
    zone.textContent = eligible
        ? translateText('Drop / paste / click to add images')
        : translateText('Image upload disabled for this prompt type');
    if (eligible) {
        zone.tabIndex = 0;
    } else {
        zone.classList.add('disabled');
    }
    return zone;
}

function buildAddRow(eligible: boolean): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'tt-preset-image-editor__add-row';
    row.append(buildDropZone(eligible));

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'menu_button tt-preset-image-editor__add-button';
    addButton.textContent = translateText('Add images');
    addButton.disabled = !eligible;
    row.append(addButton);

    const input = document.createElement('input');
    input.id = 'tt-preset-image-file';
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.hidden = true;
    row.append(input);

    if (eligible) {
        addButton.addEventListener('click', () => input.click());
        input.addEventListener('change', () => {
            const files = Array.from(input.files ?? []);
            input.value = '';
            void addFiles(files);
        });
    }

    return row;
}

function makeImagePart(image: PresetImage): any {
    return {
        type: 'image_url',
        image_url: {
            url: image.dataUrl,
            ...(image.detail ? { detail: image.detail } : {}),
        },
    };
}

function findImage(layout: PresetPromptImageLayout, imageId: string): { bucket: BucketName; index: number; image: PresetImage } | null {
    for (const bucket of ['before', 'after'] as const) {
        const index = layout[bucket].findIndex(image => image.id === imageId);
        if (index !== -1) {
            return { bucket, index, image: layout[bucket][index]! };
        }
    }
    return null;
}

function insertImage(layout: PresetPromptImageLayout, bucket: BucketName, index: number, image: PresetImage): void {
    const safeIndex = Math.max(0, Math.min(index, layout[bucket].length));
    layout[bucket].splice(safeIndex, 0, image);
}

function moveImage(layout: PresetPromptImageLayout, imageId: string, targetBucket: BucketName, targetIndex: number): boolean {
    const found = findImage(layout, imageId);
    if (!found) {
        return false;
    }

    layout[found.bucket].splice(found.index, 1);
    let index = targetIndex;
    if (found.bucket === targetBucket && found.index < targetIndex) {
        index -= 1;
    }
    insertImage(layout, targetBucket, index, found.image);
    return true;
}

function moveImageToBucketTail(layout: PresetPromptImageLayout, imageId: string, bucket: BucketName): boolean {
    return moveImage(layout, imageId, bucket, layout[bucket].length);
}

function moveWithinBucket(layout: PresetPromptImageLayout, bucket: BucketName, imageId: string, delta: number): boolean {
    const index = layout[bucket].findIndex(image => image.id === imageId);
    const next = index + delta;
    if (index === -1 || next < 0 || next >= layout[bucket].length) {
        return false;
    }
    const [image] = layout[bucket].splice(index, 1);
    if (image) {
        layout[bucket].splice(next, 0, image);
    }
    return true;
}

function commitLayout(layout: PresetPromptImageLayout): void {
    if (!currentPromptManager) {
        return;
    }
    const settings = currentPromptManager.serviceSettings;
    const identifier = getPromptIdentifier();
    const store = setLayout(settings, identifier, layout);
    warnAboutLimits(store);
    void persistStore(settings, store);
    dragImageId = null;
    renderEditor();
}

function removeImage(imageId: string): void {
    const layout = getLayoutState();
    const found = findImage(layout, imageId);
    if (!found) {
        return;
    }
    layout[found.bucket].splice(found.index, 1);
    commitLayout(layout);
}

function replaceImage(bucket: BucketName, imageId: string, file: File): void {
    void fileToDataUrl(file)
        .then(dataUrl => {
            const layout = getLayoutState();
            const found = findImage(layout, imageId);
            if (!found) {
                return;
            }
            const replacement: PresetImage = {
                id: found.image.id,
                dataUrl,
                name: file.name,
                mime: file.type,
                bytes: file.size,
                detail: found.image.detail ?? 'auto',
            };
            layout[found.bucket][found.index] = replacement;
            commitLayout(layout);
        })
        .catch(error => {
            console.error('[Preset Prompt Images] Failed to replace image file.', error);
            toastError(t`Could not read image file: ${file.name}`);
        });
}

function updateImageDetail(imageId: string, detail: ImageDetail): void {
    const layout = getLayoutState();
    const found = findImage(layout, imageId);
    if (!found) {
        return;
    }
    found.image.detail = detail;
    commitLayout(layout);
}

function updateImagePosition(imageId: string, targetBucket: BucketName): void {
    const layout = getLayoutState();
    const found = findImage(layout, imageId);
    if (!found || found.bucket === targetBucket) {
        return;
    }
    moveImageToBucketTail(layout, imageId, targetBucket);
    commitLayout(layout);
}

function buildReplaceInput(bucket: BucketName, image: PresetImage): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.hidden = true;
    input.addEventListener('change', () => {
        const file = input.files?.[0];
        input.value = '';
        if (file) {
            replaceImage(bucket, image.id, file);
        }
    });
    return input;
}

function buildImageCard(image: PresetImage, bucket: BucketName, index: number): HTMLDivElement {
    const settings = loadPluginSettings();
    const card = document.createElement('div');
    card.className = 'tt-preset-image-card';
    card.dataset.imageId = image.id;
    card.dataset.bucket = bucket;
    card.dataset.index = String(index);

    const preview = document.createElement('img');
    preview.className = 'tt-preset-image-card__preview';
    preview.src = image.dataUrl;
    preview.alt = image.name ?? image.id;
    preview.loading = 'lazy';
    card.append(preview);

    const meta = document.createElement('div');
    meta.className = 'tt-preset-image-card__meta';

    const name = document.createElement('div');
    name.className = 'tt-preset-image-card__name';
    name.textContent = image.name ?? image.id;
    name.title = image.name ?? image.id;
    meta.append(name);

    const bytes = image.bytes ?? estimateDataUrlBytes(image.dataUrl);
    const size = document.createElement('div');
    size.className = 'tt-preset-image-card__size';
    size.textContent = `${(bytes / 1024).toFixed(1)} KiB`;
    meta.append(size);

    const actions = document.createElement('div');
    actions.className = 'tt-preset-image-card__actions';

    const detail = document.createElement('select');
    detail.className = 'text_pole tt-preset-image-card__select';
    detail.title = translateText('Image detail');
    for (const value of ['auto', 'low', 'high', 'original'] as const) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = `detail: ${value}`;
        option.selected = (image.detail ?? 'auto') === value;
        detail.append(option);
    }
    detail.addEventListener('change', () => updateImageDetail(image.id, detail.value as ImageDetail));
    actions.append(detail);

    if (settings.showPositionSelect) {
        const position = document.createElement('select');
        position.className = 'text_pole tt-preset-image-card__select';
        position.title = translateText('Insert position');
        for (const value of ['before', 'after'] as const) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = translateText(value === 'before' ? 'Before text' : 'After text');
            option.selected = bucket === value;
            position.append(option);
        }
        position.addEventListener('change', () => updateImagePosition(image.id, position.value as BucketName));
        actions.append(position);
    }

    if (settings.showMoveButtons) {
        const moveBy = (delta: number): void => {
            const layout = getLayoutState();
            const current = findImage(layout, image.id);
            if (!current) {
                return;
            }

            if (current.bucket === 'before' && delta === 1 && current.index === layout.before.length - 1) {
                const [moved] = layout.before.splice(current.index, 1);
                if (moved) {
                    layout.after.unshift(moved);
                }
            } else if (current.bucket === 'after' && delta === -1 && current.index === 0) {
                const [moved] = layout.after.splice(0, 1);
                if (moved) {
                    layout.before.push(moved);
                }
            } else if (!moveWithinBucket(layout, current.bucket, image.id, delta)) {
                return;
            }

            commitLayout(layout);
        };

        const up = document.createElement('button');
        up.type = 'button';
        up.className = 'menu_button tt-preset-image-card__icon-button';
        up.textContent = '↑';
        up.title = translateText('Move up');
        up.disabled = bucket === 'before' && index === 0;
        up.addEventListener('click', () => moveBy(-1));
        actions.append(up);

        const down = document.createElement('button');
        down.type = 'button';
        down.className = 'menu_button tt-preset-image-card__icon-button';
        down.textContent = '↓';
        down.title = translateText('Move down');
        down.disabled = bucket === 'after' && index === getLayoutState()[bucket].length - 1;
        down.addEventListener('click', () => moveBy(1));
        actions.append(down);
    }

    const replace = document.createElement('button');
    replace.type = 'button';
    replace.className = 'menu_button tt-preset-image-card__action';
    replace.textContent = translateText('Replace');
    replace.addEventListener('click', () => replaceInput.click());
    actions.append(replace);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'menu_button tt-preset-image-card__action danger';
    remove.textContent = translateText('Remove');
    remove.addEventListener('click', () => removeImage(image.id));
    actions.append(remove);

    const replaceInput = buildReplaceInput(bucket, image);
    actions.append(replaceInput);

    meta.append(actions);
    card.append(meta);

    const dragHandle = document.createElement('div');
    dragHandle.className = 'tt-preset-image-card__drag-handle';
    dragHandle.draggable = true;
    dragHandle.title = translateText('Drag to reorder');
    dragHandle.textContent = '☰';
    dragHandle.addEventListener('dragstart', event => {
        dragImageId = image.id;
        card.classList.add('dragging');
        event.dataTransfer?.setData('text/plain', image.id);
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
        }
    });
    dragHandle.addEventListener('dragend', () => {
        dragImageId = null;
        card.classList.remove('dragging');
        clearDropIndicators();
    });
    card.append(dragHandle);

    card.addEventListener('dragover', event => {
        if (!dragImageId || dragImageId === image.id) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const rect = card.getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2;
        clearDropIndicators();
        card.classList.add(before ? 'drop-before' : 'drop-after');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drop-before', 'drop-after'));
    card.addEventListener('drop', event => {
        if (!dragImageId || dragImageId === image.id) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const rect = card.getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2;
        const layout = getLayoutState();
        if (moveImage(layout, dragImageId, bucket, index + (before ? 0 : 1))) {
            commitLayout(layout);
        } else {
            clearDropIndicators();
        }
    });

    return card;
}

function clearDropIndicators(): void {
    document.querySelectorAll('.drop-before, .drop-after, .drag-over').forEach(element => {
        element.classList.remove('drop-before', 'drop-after', 'drag-over');
    });
}

function appendFileToBucket(files: File[], bucket: BucketName): void {
    if (!currentPromptEligible) {
        toastWarning(translateText('Only non-marker Relative prompts can send images. Existing data is kept but will not be sent.'));
        return;
    }

    const layout = getLayoutState();
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (!imageFiles.length) {
        toastWarning(translateText('Only image files are supported.'));
        return;
    }

    void Promise.all(imageFiles.map(async file => {
        const dataUrl = await fileToDataUrl(file);
        return {
            id: createImageId(),
            dataUrl,
            name: file.name,
            mime: file.type,
            bytes: file.size,
            detail: 'auto',
        } satisfies PresetImage;
    })).then(images => {
        layout[bucket].push(...images);
        commitLayout(layout);
    }).catch(error => {
        console.error('[Preset Prompt Images] Failed to read one or more image files.', error);
        toastError(translateText('Could not read one or more image files.'));
    });
}

function addFiles(files: File[]): void {
    appendFileToBucket(files, 'after');
}

function buildBucket(bucket: BucketName, images: PresetImage[]): HTMLDivElement {
    const element = document.createElement('div');
    element.className = `tt-preset-image-bucket tt-preset-image-bucket--${bucket}`;
    element.dataset.bucket = bucket;

    if (!images.length) {
        const empty = document.createElement('div');
        empty.className = 'tt-preset-image-bucket__empty';
        empty.textContent = translateText('Drop an image here');
        element.append(empty);
    } else {
        images.forEach((image, index) => element.append(buildImageCard(image, bucket, index)));
    }

    element.addEventListener('dragover', event => {
        const hasFiles = Array.from(event.dataTransfer?.types ?? []).includes('Files');
        if (!dragImageId && !hasFiles) {
            return;
        }
        event.preventDefault();
        element.classList.add('drag-over');
    });
    element.addEventListener('dragleave', () => element.classList.remove('drag-over'));
    element.addEventListener('drop', event => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (!dragImageId && !files.length) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        element.classList.remove('drag-over');

        if (dragImageId) {
            const layout = getLayoutState();
            if (moveImageToBucketTail(layout, dragImageId, bucket)) {
                commitLayout(layout);
            } else {
                clearDropIndicators();
            }
            return;
        }

        appendFileToBucket(files, bucket);
    });

    return element;
}

function buildTextAnchorDropTarget(anchor: HTMLDivElement, layout: PresetPromptImageLayout): void {
    anchor.addEventListener('dragover', event => {
        if (!dragImageId) {
            return;
        }
        event.preventDefault();
        const rect = anchor.getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2;
        clearDropIndicators();
        anchor.classList.add(before ? 'drop-before' : 'drop-after');
    });
    anchor.addEventListener('dragleave', () => anchor.classList.remove('drop-before', 'drop-after'));
    anchor.addEventListener('drop', event => {
        if (!dragImageId) {
            return;
        }
        event.preventDefault();
        const rect = anchor.getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2;
        const current = getLayoutState();
        const targetBucket: BucketName = before ? 'before' : 'after';
        const targetIndex = before ? current.before.length : 0;
        if (moveImage(current, dragImageId, targetBucket, targetIndex)) {
            commitLayout(current);
        } else {
            clearDropIndicators();
        }
    });
}

function warnAboutLimits(store = currentPromptManager ? readStore(currentPromptManager.serviceSettings) : { version: 2 as const, items: {} }): void {
    const settings = loadPluginSettings();
    const warnings = collectImageLimitWarnings(store, settings);

    for (const warning of warnings) {
        if (warning.kind === 'image' && warning.image) {
            const bytes = warning.bytes ?? 0;
            toastWarning(t`Image "${warning.image.name ?? warning.image.id}" for prompt ${warning.identifier ?? ''} is ${(bytes / (1024 * 1024)).toFixed(2)} MiB.`);
        } else if (warning.kind === 'prompt') {
            toastWarning(t`Prompt ${warning.identifier ?? ''} has ${warning.count ?? 0} images.`);
        } else if (warning.kind === 'total') {
            toastWarning(t`Preset prompt images total ${((warning.total ?? 0) / (1024 * 1024)).toFixed(2)} MiB.`);
        }
    }
}

function renderEditor(): void {
    const shell = ensureEditorShell();
    if (!shell || !currentPromptManager || !currentPrompt) {
        return;
    }

    const identifier = getPromptIdentifier();
    if (!identifier) {
        shell.hidden = true;
        return;
    }

    const sourcePrompt = currentPromptManager.getPromptById(identifier) ?? currentPrompt;
    const eligible = isEligiblePrompt(sourcePrompt);
    currentPromptEligible = eligible;
    const layout = getLayoutState();
    const promptContent = String(sourcePrompt?.content ?? '');

    clearChildren(shell);
    shell.hidden = false;
    shell.append(buildEditorHeader(eligible));
    shell.append(buildAddRow(eligible));

    const list = document.createElement('div');
    list.className = 'tt-preset-image-editor__list';

    const beforeBucket = buildBucket('before', layout.before);
    const textAnchor = buildTextAnchor(promptContent);
    buildTextAnchorDropTarget(textAnchor, layout);
    const afterBucket = buildBucket('after', layout.after);

    list.append(beforeBucket, textAnchor, afterBucket);
    shell.append(list);

    const addRow = shell.querySelector<HTMLDivElement>('.tt-preset-image-editor__add-row');
    const dropZone = addRow?.querySelector<HTMLDivElement>('#tt-preset-image-dropzone');
    if (eligible && dropZone) {
        dropZone.addEventListener('click', () => {
            (addRow?.querySelector<HTMLInputElement>('#tt-preset-image-file'))?.click();
        });
        dropZone.addEventListener('dragover', event => {
            event.preventDefault();
            dropZone.classList.add('drag-over');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', event => {
            event.preventDefault();
            dropZone.classList.remove('drag-over');
            appendFileToBucket(Array.from(event.dataTransfer?.files ?? []), 'after');
        });
    }
}

export function renderPromptImageEditor(promptManager: PromptManagerLike, prompt: any): void {
    currentPromptManager = promptManager;
    currentPrompt = prompt;
    renderEditor();
}

export function installPromptImageEditor(): void {
    document.addEventListener('paste', event => {
        if (!editorShell || editorShell.offsetParent === null) {
            return;
        }

        const files = Array.from(event.clipboardData?.items ?? [])
            .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
            .map(item => item.getAsFile())
            .filter((file): file is File => file !== null);

        if (files.length) {
            event.preventDefault();
            appendFileToBucket(files, 'after');
        }
    });
}
