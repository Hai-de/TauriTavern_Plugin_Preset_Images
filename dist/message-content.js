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
    const url = image.dataUrl;
    const detail = image.detail ?? 'auto';
    return {
        type: 'image_url',
        image_url: {
            url,
            ...(detail ? { detail } : {}),
        },
    };
}
export async function appendPresetImages(message, images) {
    if (!message || !Array.isArray(images) || images.length === 0) {
        return;
    }
    const beforeImages = images.filter(image => (image.position ?? 'after') === 'before');
    const afterImages = images.filter(image => (image.position ?? 'after') === 'after');
    const existing = toParts(message.content);
    const before = beforeImages.map(imagePart);
    const after = afterImages.map(imagePart);
    message.content = [...before, ...existing, ...after];
    let imageTokens = 0;
    for (const image of images) {
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
