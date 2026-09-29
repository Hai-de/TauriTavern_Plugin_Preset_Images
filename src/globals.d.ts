export {};

declare global {
    interface Window {
        SillyTavern?: {
            getContext?: () => Record<string, any>;
        };
        __TAURITAVERN__?: {
            ready?: Promise<void>;
            api?: Record<string, any>;
        };
    }

    const toastr: {
        info(message: string, title?: string): void;
        success(message: string, title?: string): void;
        warning(message: string, title?: string): void;
        error(message: string, title?: string): void;
    };
}

declare module '*/openai.js' {
    export const oai_settings: Record<string, any>;
    export let promptManager: any;

    export class Message {
        static tokensPerImage: number;
        static fromPromptAsync(prompt: any, tokenHandler?: any): Promise<Message>;
        static createAsync(role: string, content: any, identifier: string, tokenHandler?: any): Promise<Message>;
        content: any;
        tokens: number;
        role: string;
        identifier: string;
        ensureContentIsArray(): any[];
        getImageTokenCost(dataUrl: string, quality: string): Promise<number>;
    }

    export class ChatCompletion {
        messages: {
            collection: any[];
            flatten(): any[];
        };
        squashSystemMessages(messageTokenHandler?: any): Promise<void>;
    }
}

declare module '*/PromptManager.js' {
    export class PromptManager {
        serviceSettings: any;
        activeCharacter: any;
        loadPromptIntoEditForm(prompt: any): void;
        preparePrompt(prompt: any, original?: any): any;
        import(importData: any): void;
        getPromptById(identifier: string): any;
    }
}
