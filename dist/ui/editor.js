import { checkImageLimits, createImageId, createStore, estimateDataUrlBytes, fileToDataUrl, getImages, readStore, setImages } from '../storage.js';
import { loadPluginSettings } from '../settings.js';
import { getRuntimeContext, toastError, toastWarning } from '../runtime.js';
import { persistStore } from '../persistence.js';
let currentPromptManager = null;
let currentPrompt = null;
let editorShell = null;
let fileInput = null;
let dropZone = null;
let imageList = null;
let noticeElement = null;
function getPromptIdentifier() {
    return String(currentPrompt?.identifier ?? '');
}
function isEligiblePrompt(prompt) {
    if (!prompt || prompt.marker === true) {
        return false;
    }
    const position = Number(prompt.injection_position ?? 0);
    return position === 0;
}
function ensureEditorShell() {
    if (editorShell?.isConnected) {
        return editorShell;
    }
    const form = document.querySelector('#completion_prompt_manager_popup_edit .completion_prompt_manager_popup_entry_form');
    if (!form) {
        return null;
    }
    editorShell = document.createElement('div');
    editorShell.id = 'tt-preset-image-editor';
    editorShell.className = 'tt-preset-image-editor';
    const footer = form.querySelector('.completion_prompt_manager_popup_entry_form_footer');
    if (footer) {
        form.insertBefore(editorShell, footer);
    }
    else {
        form.append(editorShell);
    }
    return editorShell;
}
function clearChildren(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}
function buildEditorHeader(eligible) {
    const header = document.createElement('div');
    header.className = 'tt-preset-image-editor__header';
    const title = document.createElement('b');
    title.textContent = 'Prompt Images';
    header.append(title);
    const hint = document.createElement('span');
    hint.className = 'tt-preset-image-editor__hint';
    hint.textContent = eligible
        ? 'Drag, paste, or select images. They are embedded into the preset JSON.'
        : 'Only non-marker Relative prompts can send images. Existing data is kept but will not be sent.';
    header.append(hint);
    return header;
}
function buildDropZone(eligible) {
    const zone = document.createElement('div');
    zone.id = 'tt-preset-image-dropzone';
    zone.className = 'tt-preset-image-editor__dropzone';
    zone.textContent = eligible ? 'Drop / paste / click to add images' : 'Image upload disabled for this prompt type';
    if (eligible) {
        zone.tabIndex = 0;
    }
    else {
        zone.classList.add('disabled');
    }
    return zone;
}
function buildFileInput() {
    const input = document.createElement('input');
    input.id = 'tt-preset-image-file';
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.hidden = true;
    return input;
}
function buildImageCard(image) {
    const card = document.createElement('div');
    card.className = 'tt-preset-image-card';
    card.dataset.imageId = image.id;
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
    const position = document.createElement('select');
    position.className = 'text_pole tt-preset-image-card__select';
    position.title = 'Insert position';
    for (const value of ['before', 'after']) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value === 'before' ? 'Before text' : 'After text';
        option.selected = (image.position ?? 'after') === value;
        position.append(option);
    }
    position.addEventListener('change', () => {
        updateImage(image.id, { position: position.value });
    });
    meta.append(position);
    const detail = document.createElement('select');
    detail.className = 'text_pole tt-preset-image-card__select';
    detail.title = 'Image detail';
    for (const value of ['auto', 'low', 'high', 'original']) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = `detail: ${value}`;
        option.selected = (image.detail ?? 'auto') === value;
        detail.append(option);
    }
    detail.addEventListener('change', () => {
        updateImage(image.id, { detail: detail.value });
    });
    meta.append(detail);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'menu_button tt-preset-image-card__remove';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
        removeImage(image.id);
    });
    meta.append(remove);
    card.append(meta);
    return card;
}
function renderImageList(eligible) {
    if (!imageList || !currentPromptManager) {
        return;
    }
    clearChildren(imageList);
    const settings = currentPromptManager.serviceSettings;
    const identifier = getPromptIdentifier();
    const images = getImages(settings, identifier);
    if (!images.length) {
        const empty = document.createElement('div');
        empty.className = 'tt-preset-image-editor__empty';
        empty.textContent = eligible ? 'No images attached to this prompt.' : 'No image data for this prompt.';
        imageList.append(empty);
        return;
    }
    for (const image of images) {
        imageList.append(buildImageCard(image));
    }
}
function renderEditor() {
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
    clearChildren(shell);
    shell.hidden = false;
    shell.append(buildEditorHeader(eligible));
    shell.append(buildDropZone(eligible));
    shell.append(buildFileInput());
    noticeElement = document.createElement('div');
    noticeElement.className = 'tt-preset-image-editor__notice';
    shell.append(noticeElement);
    imageList = document.createElement('div');
    imageList.className = 'tt-preset-image-editor__list';
    shell.append(imageList);
    dropZone = shell.querySelector('#tt-preset-image-dropzone');
    fileInput = shell.querySelector('#tt-preset-image-file');
    if (eligible && dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput?.click());
        dropZone.addEventListener('dragover', event => {
            event.preventDefault();
            dropZone?.classList.add('drag-over');
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone?.classList.remove('drag-over');
        });
        dropZone.addEventListener('drop', event => {
            event.preventDefault();
            dropZone?.classList.remove('drag-over');
            void addFiles(Array.from(event.dataTransfer?.files ?? []));
        });
        fileInput.addEventListener('change', () => {
            const files = Array.from(fileInput?.files ?? []);
            fileInput.value = '';
            void addFiles(files);
        });
    }
    renderImageList(eligible);
}
function updateImage(imageId, patch) {
    if (!currentPromptManager) {
        return;
    }
    const settings = currentPromptManager.serviceSettings;
    const identifier = getPromptIdentifier();
    const images = getImages(settings, identifier).map(image => (image.id === imageId ? { ...image, ...patch } : image));
    const store = setImages(settings, identifier, images);
    warnAboutLimits(store);
    void persistStore(settings, store);
    renderEditor();
}
function removeImage(imageId) {
    if (!currentPromptManager) {
        return;
    }
    const settings = currentPromptManager.serviceSettings;
    const identifier = getPromptIdentifier();
    const images = getImages(settings, identifier).filter(image => image.id !== imageId);
    const store = setImages(settings, identifier, images);
    void persistStore(settings, store);
    renderEditor();
}
async function addFiles(files) {
    if (!currentPromptManager) {
        return;
    }
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (!imageFiles.length) {
        toastWarning('Only image files are supported.');
        return;
    }
    const settings = currentPromptManager.serviceSettings;
    const identifier = getPromptIdentifier();
    const existing = getImages(settings, identifier);
    const added = [];
    for (const file of imageFiles) {
        try {
            const dataUrl = await fileToDataUrl(file);
            added.push({
                id: createImageId(),
                dataUrl,
                name: file.name,
                mime: file.type,
                bytes: file.size,
                detail: 'auto',
                position: 'after',
            });
        }
        catch (error) {
            console.error('[Preset Prompt Images] Failed to read image file.', error);
            toastError(`Could not read image file: ${file.name}`);
        }
    }
    if (!added.length) {
        return;
    }
    const store = setImages(settings, identifier, [...existing, ...added]);
    warnAboutLimits(store);
    await persistStore(settings, store);
    renderEditor();
}
function warnAboutLimits(store = currentPromptManager ? readStore(currentPromptManager.serviceSettings) : createStore()) {
    const pluginSettings = loadPluginSettings(getRuntimeContext());
    const warnings = checkImageLimits(currentPromptManager?.serviceSettings, store, pluginSettings);
    for (const warning of warnings) {
        toastWarning(warning);
    }
}
export function renderPromptImageEditor(promptManager, prompt) {
    currentPromptManager = promptManager;
    currentPrompt = prompt;
    renderEditor();
}
export function installPromptImageEditor() {
    document.addEventListener('paste', event => {
        const shell = editorShell;
        const popup = document.getElementById('completion_prompt_manager_popup_edit');
        if (!shell || !popup || getComputedStyle(popup).display === 'none') {
            return;
        }
        const files = Array.from(event.clipboardData?.items ?? [])
            .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
            .map(item => item.getAsFile())
            .filter((file) => file !== null);
        if (files.length) {
            event.preventDefault();
            void addFiles(files);
        }
    });
}
