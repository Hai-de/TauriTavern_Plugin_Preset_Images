function toParts(content) {
    if (Array.isArray(content)) {
        return content.map(part => (part && typeof part === 'object' ? { ...part } : part));
    }
    if (typeof content === 'string' && content.length > 0) {
        return [{ type: 'text', text: content }];
    }
    return [];
}
function imagePart(image) {
    return {
        type: 'image_url',
        image_url: {
            url: image.dataUrl,
            ...(image.detail ? { detail: image.detail } : {}),
        },
    };
}
export async function appendPresetImageLayout(message, layout) {
    const beforeImages = Array.isArray(layout?.before) ? layout.before : [];
    const afterImages = Array.isArray(layout?.after) ? layout.after : [];
    if (!message || (!beforeImages.length && !afterImages.length)) {
        return;
    }
    const existing = toParts(message.content);
    message.content = [
        ...beforeImages.map(imagePart),
        ...existing,
        ...afterImages.map(imagePart),
    ];
    let imageTokens = 0;
    for (const image of [...beforeImages, ...afterImages]) {
        try {
            imageTokens += await message.getImageTokenCost(image.dataUrl, image.detail ?? 'auto');
        }
        catch (error) {
            console.warn('[Preset Prompt Images] Failed to estimate image tokens, using fallback.', error);
            imageTokens += 85;
        }
    }
    message.tokens = Number(message.tokens ?? 0) + imageTokens;
}
