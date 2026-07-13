export const CHAMPION_ACTIVATION_COUNT = 4;
export const CHAMPION_ACTIVATION_WINDOW_MS = 2500;

export function createActivationWindow({
  count = CHAMPION_ACTIVATION_COUNT,
  windowMs = CHAMPION_ACTIVATION_WINDOW_MS,
} = {}) {
  let timestamps = [];

  function reset() {
    timestamps = [];
  }

  function record(now) {
    const timestamp = Number(now);
    if (!Number.isFinite(timestamp)) {
      reset();
      return false;
    }

    if (timestamps.length && timestamp < timestamps[timestamps.length - 1]) {
      reset();
    }
    timestamps = timestamps.filter(previous => timestamp - previous <= windowMs);
    timestamps.push(timestamp);

    if (timestamps.length < count) return false;
    reset();
    return true;
  }

  return { record, reset };
}

export function initChampionCelebrationTrigger({
  wrap,
  getActiveBracket,
  onTrigger,
  signal,
}) {
  if (!(wrap instanceof HTMLElement)) {
    throw new TypeError("Champion celebration trigger requires a bracket wrapper.");
  }
  if (typeof getActiveBracket !== "function") {
    throw new TypeError("Champion celebration trigger requires getActiveBracket().");
  }
  if (typeof onTrigger !== "function") {
    throw new TypeError("Champion celebration trigger requires onTrigger().");
  }

  const activation = createActivationWindow();
  const listenerOptions = signal ? { signal } : undefined;
  const triggerSelector = "[data-champion-celebration-trigger]";

  function activeContext(target) {
    if (wrap.dataset.layout !== "mirror") return null;
    const bracket = getActiveBracket();
    if (!bracket || !bracket.classList.contains("layout-mirror")) return null;
    const trigger = target instanceof Element ? target.closest(triggerSelector) : null;
    const activeTrigger = bracket.querySelector(triggerSelector);
    if (!trigger || trigger !== activeTrigger || !bracket.contains(trigger)) return null;
    const team = trigger.dataset.team?.trim();
    return team ? { team, trigger, bracket, wrap } : null;
  }

  function completeActivation(event) {
    const context = activeContext(event.target);
    if (!context) return;
    const now = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
    if (!activation.record(now)) return;

    const current = activeContext(context.trigger);
    if (current) onTrigger(current);
  }

  function onClick(event) {
    completeActivation(event);
  }

  function onKeyDown(event) {
    if (event.repeat || (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar")) {
      return;
    }
    if (!activeContext(event.target)) return;
    event.preventDefault();
    completeActivation(event);
  }

  function preventTriggerSelection(event) {
    if (activeContext(event.target)) event.preventDefault();
  }

  wrap.addEventListener("click", onClick, listenerOptions);
  wrap.addEventListener("keydown", onKeyDown, listenerOptions);
  wrap.addEventListener("selectstart", preventTriggerSelection, listenerOptions);
  wrap.addEventListener("dblclick", preventTriggerSelection, listenerOptions);

  return {
    reset: activation.reset,
  };
}
