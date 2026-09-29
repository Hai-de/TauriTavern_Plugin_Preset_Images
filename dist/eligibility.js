export function isEligiblePrompt(prompt) {
    if (!prompt || prompt.marker === true) {
        return false;
    }
    if (Number(prompt.injection_position ?? 0) !== 0) {
        return false;
    }
    // PromptManager calls system prompts without forbid_overrides "Global Prompt".
    // Those are normally replaced or overridden by character cards, so images are disabled there.
    if (prompt.system_prompt === true && prompt.forbid_overrides !== true) {
        return false;
    }
    return true;
}
