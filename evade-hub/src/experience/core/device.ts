// Device and URL flags. A phone is decided by the device (user agent), never by touch: touchscreen laptops pass a
// touch check and the engine binary then fails with "No valid session manager" (house rule 2).
export const qs = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

export const IS_PHONE =
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const IS_IOS =
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** `?desktop` skips the phone check (headless simulator). */
export const DESKTOP_OK = qs.has('desktop');
export const CAN_USE_CAMERA = IS_PHONE || DESKTOP_OK;

export function reducedMotion(): boolean {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** iPhone: motion permission must be asked inside the tap, before anything async. Ask, never return early. */
export function askMotionPermission(): void {
  type Req = { requestPermission?: () => Promise<string> };
  try {
    const o = (window as unknown as { DeviceOrientationEvent?: Req }).DeviceOrientationEvent;
    o?.requestPermission?.().catch(() => undefined);
  } catch { /* none */ }
  try {
    const m = (window as unknown as { DeviceMotionEvent?: Req }).DeviceMotionEvent;
    m?.requestPermission?.().catch(() => undefined);
  } catch { /* none */ }
}

export const now = (): number => performance.now();
