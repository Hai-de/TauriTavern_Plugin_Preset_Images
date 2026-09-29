const EXCLUDED_SYSTEM_IDENTIFIERS = new Set(['newMainChat', 'newChat', 'groupNudge', 'agentSystemPrompt']);

function isMediaPart(part: any): boolean {
    return part && typeof part === 'object' && ['image_url', 'video_url', 'audio_url'].includes(part.type);
}

function messageHasMedia(message: any): boolean {
    return Array.isArray(message?.content) && message.content.some(isMediaPart);
}

function toParts(content: any): any[] {
    if (Array.isArray(content)) {
        return content.map(part => (part && typeof part === 'object' ? { ...part } : part));
    }
    if (typeof content === 'string' && content.length > 0) {
        return [{ type: 'text', text: content }];
    }
    return [];
}

function mergeParts(left: any[], right: any[]): any[] {
    const merged = [...left];

    for (const part of right) {
        const last = merged[merged.length - 1];
        if (last?.type === 'text' && part?.type === 'text') {
            last.text = `${String(last.text ?? '')}\n${String(part.text ?? '')}`;
        } else {
            merged.push({ ...part });
        }
    }

    return merged;
}

function partsToContent(parts: any[]): any {
    if (parts.every(part => part?.type === 'text')) {
        return parts.map(part => String(part.text ?? '')).join('\n');
    }
    return parts;
}

function mergeContent(left: any, right: any): any {
    return partsToContent(mergeParts(toParts(left), toParts(right)));
}

function shouldSquash(message: any): boolean {
    return Boolean(
        message
        && message.role === 'system'
        && !message.name
        && !EXCLUDED_SYSTEM_IDENTIFIERS.has(message.identifier),
    );
}

export function installMultimodalSquashPatch(ChatCompletion: any): void {
    const original = ChatCompletion?.prototype?.squashSystemMessages;
    if (typeof original !== 'function' || original.__ttPresetImagesPatched) {
        return;
    }

    ChatCompletion.prototype.squashSystemMessages = async function patchedSquashSystemMessages(messageTokenHandler?: any): Promise<void> {
        const flattened = typeof this?.messages?.flatten === 'function'
            ? this.messages.flatten()
            : (Array.isArray(this?.messages?.collection) ? this.messages.collection : []);

        const hasMedia = flattened.some((message: any) => message?.role === 'system' && messageHasMedia(message));
        if (!hasMedia) {
            return original.call(this, messageTokenHandler);
        }

        const squashed: any[] = [];
        let lastMessage: any = null;

        for (const message of flattened) {
            if (message?.role === 'system' && !message.content) {
                continue;
            }

            if (shouldSquash(message) && lastMessage && shouldSquash(lastMessage)) {
                lastMessage.content = mergeContent(lastMessage.content, message.content);
                lastMessage.tokens = Number(lastMessage.tokens ?? 0) + Number(message.tokens ?? 0);
                continue;
            }

            squashed.push(message);
            lastMessage = message;
        }

        this.messages.collection = squashed;
    };

    ChatCompletion.prototype.squashSystemMessages.__ttPresetImagesPatched = true;
}
