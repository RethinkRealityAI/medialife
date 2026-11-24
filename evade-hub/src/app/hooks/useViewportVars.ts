import { useEffect, type RefObject } from 'react';

/**
 * Keeps --cb-vvh (visible viewport height) and --cb-kb (on-screen keyboard height) on the app root, so the sheet
 * can sit on top of the keyboard instead of the page being pushed around when the chat input is focused.
 */
export function useViewportVars(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    const vv = window.visualViewport;
    if (!el) return;
    const update = () => {
      const h = vv ? vv.height : window.innerHeight;
      const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      el.style.setProperty('--cb-vvh', `${Math.round(h)}px`);
      el.style.setProperty('--cb-kb', `${Math.round(kb > 60 ? kb : 0)}px`);
      // iOS scrolls the layout viewport to reveal a focused input; the app is fixed full-screen, so undo it
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [ref]);
}
