// A short buzz the fan can feel (Dapo, 2026-11-22: when Bobo reaches an arcade machine "they need to feel that they've
// triggered something"). Android: navigator.vibrate. iPhone Safari has no vibrate API; since iOS 18, toggling an
// <input type="checkbox" switch> through its label plays the system haptic, so that is the fallback there.
// Must run from a frame or event the user caused; it is a silent no-op where neither works (desktop, older iOS).
let iosSwitch: HTMLLabelElement | null = null;

function iosTick(): void {
  if (!iosSwitch) {
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    iosSwitch = label;
  }
  iosSwitch.click();
}

/** 'tap' = a light tick (buttons); 'zone' = a double pulse (Bobo reached something he can open). */
export function haptic(kind: 'tap' | 'zone' = 'tap'): void {
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(kind === 'zone' ? [22, 60, 34] : 10);
      return;
    }
    iosTick();
    if (kind === 'zone') window.setTimeout(iosTick, 90);
  } catch { /* no haptics here */ }
}
