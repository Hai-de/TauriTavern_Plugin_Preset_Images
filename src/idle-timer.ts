import { getPluginSettings } from './settings.js';
import { disableSelfExtension } from './lifecycle.js';
import { getRuntimeContext, t, translateText } from './runtime.js';

const SESSION_FIRED_KEY = 'Plugin_Preset_Images:idle-fired';
const ACTIVITY_THROTTLE_MS = 1000;

let installed = false;
let intervalId: number | null = null;
let countdownId: number | null = null;
let deadline = 0;
let timeoutMs = 0;
let generationActive = false;
let lastActivityAt = 0;
let countdownOverlay: HTMLDivElement | null = null;
let countdownRemaining = 0;

function safeSessionGet(key: string): string | null {
    try {
        return window.sessionStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeSessionSet(key: string, value: string): void {
    try {
        window.sessionStorage.setItem(key, value);
    } catch {
        // Session storage may be unavailable in some WebViews; the in-memory flag still prevents re-arming this load.
    }
}

function isWindowActive(): boolean {
    return document.visibilityState === 'visible' && document.hasFocus();
}

function hasBlockingFocus(): boolean {
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest('#tt-preset-image-settings, #tt-preset-image-editor, #completion_prompt_manager_popup_edit')) {
        return true;
    }

    const editPopup = document.getElementById('completion_prompt_manager_popup_edit');
    if (editPopup && getComputedStyle(editPopup).display !== 'none') {
        return true;
    }

    return false;
}

function isPaused(): boolean {
    return !isWindowActive() || generationActive || hasBlockingFocus();
}

function clearTimers(): void {
    if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
    }
    if (countdownId !== null) {
        window.clearInterval(countdownId);
        countdownId = null;
    }
}

function removeCountdownOverlay(): void {
    if (countdownOverlay?.isConnected) {
        countdownOverlay.remove();
    }
    countdownOverlay = null;
}

function resetDeadline(): void {
    if (!timeoutMs || safeSessionGet(SESSION_FIRED_KEY) === '1') {
        return;
    }
    deadline = Date.now() + timeoutMs;
}

function onActivity(event?: Event): void {
    if (event?.target instanceof Element && event.target.closest('#tt-preset-image-idle-countdown')) {
        return;
    }

    const now = Date.now();
    if (now - lastActivityAt < ACTIVITY_THROTTLE_MS) {
        return;
    }
    lastActivityAt = now;
    if (!countdownOverlay) {
        resetDeadline();
    } else {
        cancelCountdown();
    }
}

function cancelCountdown(): void {
    removeCountdownOverlay();
    if (countdownId !== null) {
        window.clearInterval(countdownId);
        countdownId = null;
    }
    resetDeadline();
    if (timeoutMs > 0 && safeSessionGet(SESSION_FIRED_KEY) !== '1' && intervalId === null) {
        intervalId = window.setInterval(tick, 1000);
    }
}

async function triggerAutoDisable(): Promise<void> {
    safeSessionSet(SESSION_FIRED_KEY, '1');
    clearTimers();
    await disableSelfExtension();
}

function showCountdown(): void {
    const context = getRuntimeContext();
    const totalSeconds = Math.max(1, Math.floor(getPluginSettings().idleCountdownSeconds || 15));
    countdownRemaining = totalSeconds;

    removeCountdownOverlay();
    countdownOverlay = document.createElement('div');
    countdownOverlay.id = 'tt-preset-image-idle-countdown';
    countdownOverlay.className = 'tt-preset-image-idle-countdown';

    const message = document.createElement('div');
    message.className = 'tt-preset-image-idle-countdown__message';
    countdownOverlay.append(message);

    const actions = document.createElement('div');
    actions.className = 'tt-preset-image-idle-countdown__actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'menu_button';
    cancel.textContent = translateText('Cancel');
    cancel.addEventListener('click', () => cancelCountdown());
    actions.append(cancel);

    const disableNow = document.createElement('button');
    disableNow.type = 'button';
    disableNow.className = 'menu_button danger';
    disableNow.textContent = translateText('Disable now');
    disableNow.addEventListener('click', () => {
        removeCountdownOverlay();
        void triggerAutoDisable();
    });
    actions.append(disableNow);

    countdownOverlay.append(actions);
    document.body.append(countdownOverlay);

    const render = (): void => {
        message.textContent = t`No activity detected. Disabling Preset Prompt Images in ${countdownRemaining} seconds.`;
    };
    render();

    countdownId = window.setInterval(() => {
        countdownRemaining -= 1;
        if (countdownRemaining <= 0) {
            if (countdownId !== null) {
                window.clearInterval(countdownId);
                countdownId = null;
            }
            removeCountdownOverlay();
            void triggerAutoDisable();
            return;
        }
        render();
    }, 1000);

    // Keep a reference so the linter does not treat this as unused; the overlay is intentionally global.
    void context;
}

function tick(): void {
    if (safeSessionGet(SESSION_FIRED_KEY) === '1') {
        clearTimers();
        return;
    }

    if (isPaused()) {
        resetDeadline();
        return;
    }

    if (Date.now() >= deadline) {
        clearTimers();
        showCountdown();
    }
}

export function reinitializeIdleTimer(): void {
    clearTimers();
    removeCountdownOverlay();

    const settings = getPluginSettings();
    if (!settings.idleDisableEnabled || settings.idleDisableMinutes <= 0) {
        timeoutMs = 0;
        return;
    }

    if (safeSessionGet(SESSION_FIRED_KEY) === '1') {
        timeoutMs = 0;
        return;
    }

    timeoutMs = settings.idleDisableMinutes * 60 * 1000;
    resetDeadline();
    intervalId = window.setInterval(tick, 1000);
}

export function initializeIdleTimer(): void {
    if (installed) {
        return;
    }
    installed = true;

    const activityEvents: Array<keyof WindowEventMap> = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'];
    for (const eventName of activityEvents) {
        window.addEventListener(eventName, onActivity, { capture: true, passive: true });
    }
    window.addEventListener('focus', onActivity);
    window.addEventListener('blur', onActivity);
    document.addEventListener('visibilitychange', onActivity);
    window.addEventListener('tt-preset-images-settings-changed', reinitializeIdleTimer);

    try {
        const context = getRuntimeContext();
        const eventSource = context.eventSource;
        const eventTypes = context.eventTypes;
        if (eventSource && eventTypes) {
            eventSource.on(eventTypes.GENERATION_STARTED, () => {
                generationActive = true;
                resetDeadline();
            });
            eventSource.on(eventTypes.GENERATION_ENDED, () => {
                generationActive = false;
                resetDeadline();
            });
            eventSource.on(eventTypes.GENERATION_STOPPED, () => {
                generationActive = false;
                resetDeadline();
            });
        }
    } catch (error) {
        console.warn('[Preset Prompt Images] Could not subscribe to generation events for idle timer.', error);
    }

    reinitializeIdleTimer();
}
