// The wiring between the experience and the app's state. Event handlers live here (not in components) so they
// always see current state and React re-renders never re-subscribe anything.
//
//   experience 'started'     -> app UI appears; ?arcade opens Bobo's Arcade
//   experience 'mode'        -> current mode (the Arcade switches Selfie / Photo to 3D before a quick game)
//   experience 'userGesture' -> unlock audio
//   experience 'arcade'      -> Bobo's Arcade: the whole list (the Arcade button) or one experience's card (a machine)
//   window 'evade:open-arcade' (the HUD menu) -> the whole list
//   ?hub=BOBO-XXXX-XXXX (a merch QR / NFC tag) or ?code=  -> the unlock form, prefilled (sent at once if signed in)
//   back from an experience that completed a mission  -> the unlock moment for the machines it opened
import type { ExperienceApi, PlayGameId } from '@/shared/contracts';
import type { AppState, AppStore, Toast } from './state/appState';
import { loadExperience, preloadAudioUnlock, unlockAudio } from './loaders';
import { BRAND } from '@/evade/brand/brand';
import { arcadeState } from '@/evade/catalog';
import { TEAM, signedInEmail, takeNewlyOpened, takeUrlCode } from '@/evade/unlocks';

/** Same name the HUD fires from its menu (src/experience/hud/hud.ts OPEN_ARCADE_EVENT). */
const OPEN_ARCADE_EVENT = 'evade:open-arcade';

export class AppController {
  experience: ExperienceApi | null = null;
  private offs: Array<() => void> = [];
  private timers = new Map<string, number>();
  private bootToken = 0;
  private arcadeOnStart = typeof location !== 'undefined' && new URLSearchParams(location.search).has('arcade');
  /** Read before anything else touches the URL (and removed from the address bar). */
  private urlCode = takeUrlCode();

  constructor(readonly store: AppStore) {}

  private get s(): AppState { return this.store.get(); }
  private set(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) { this.store.set(patch); }

  private timer(key: string, ms: number, fn: () => void) {
    const prev = this.timers.get(key);
    if (prev) clearTimeout(prev);
    this.timers.set(key, window.setTimeout(() => { this.timers.delete(key); fn(); }, ms));
  }

  showToast(kind: Toast['kind'], text: string, ms = 2800) {
    this.set({ toast: { id: Date.now(), kind, text } });
    this.timer('toast', ms, () => this.set({ toast: null }));
  }

  // ------------------------------------------------------------------ boot
  async boot(container: HTMLElement) {
    // StrictMode mounts, disposes and mounts again: only the latest boot may finish
    const token = ++this.bootToken;
    this.watchViewport();
    const { experience, source } = await loadExperience({ title: BRAND.title, lead: BRAND.lead });
    if (token !== this.bootToken) { experience.dispose(); return; }
    this.experience = experience;
    this.set({ sources: { experience: source } });
    void preloadAudioUnlock();
    this.wireExperience(experience);
    const onMenu = () => this.openArcade(null);
    window.addEventListener(OPEN_ARCADE_EVENT, onMenu);
    this.offs.push(() => window.removeEventListener(OPEN_ARCADE_EVENT, onMenu));
    experience.setReservedCorner(0);
    try {
      await experience.mount(container);
    } catch (err) {
      console.error('[app] experience.mount failed', err);
      this.showToast('error', 'The 3D view had trouble starting. Try reloading the page.', 8000);
      this.onStarted();
    }
    if (experience.started && !this.s.started) this.onStarted();
  }

  private wireExperience(exp: ExperienceApi) {
    this.offs.push(
      exp.on('started', ({ mode }) => { this.set({ expMode: mode }); this.onStarted(); }),
      exp.on('mode', ({ mode, busy }) => this.set({ expMode: mode, expBusy: busy })),
      exp.on('userGesture', () => unlockAudio()),
      exp.on('unavailable', (e) => console.info('[app] experience mode unavailable', e)),
      exp.on('arcade', ({ id }) => this.openArcade(id || null)),
    );
  }

  private onStarted() {
    if (this.s.started) return;
    this.set({ started: true });
    // /evade/hub/?arcade (an experience's home button): straight back into Bobo's Arcade
    if (this.urlCode && !TEAM) {
      const code = this.urlCode;
      this.urlCode = null;
      this.arcadeOnStart = false;
      this.timer('unlockOnStart', 650, () => this.openUnlock(code, !!signedInEmail()));
      return;
    }
    // machines opened since the last visit (a mission done in another experience): their moment, once
    void arcadeState().then((items) => {
      const fresh = takeNewlyOpened(items.filter((i) => !i.locked && !i.soon).map((i) => i.id));
      if (fresh.length) this.timer('celebrateOnStart', 900, () => this.celebrate(fresh, 'Mission complete'));
      else if (this.arcadeOnStart) {
        this.arcadeOnStart = false;
        this.timer('arcadeOnStart', 650, () => this.openArcade(null));
      }
    });
  }

  /** The unlock form (over the Arcade). `auto` sends it straight away with the saved email. */
  openUnlock(code = '', auto = false) {
    this.set({ sheetOpen: true, tab: 'games', unlockForm: { code, auto }, celebrate: null });
  }

  closeUnlock() { this.set({ unlockForm: null }); }

  /** The unlock moment for machines that just opened. */
  celebrate(ids: string[], why: string) {
    try { navigator.vibrate?.([30, 60, 30, 60, 120]); } catch { /* not allowed */ }
    this.set({ sheetOpen: true, tab: 'games', unlockForm: null, celebrate: { ids, why }, arcadeFocus: null });
  }

  endCelebrate() { this.set({ celebrate: null }); }

  // ------------------------------------------------------------------ Bobo's Arcade
  /** Open the Arcade sheet on the whole list (null) or on one experience's card. */
  openArcade(focus: string | null) {
    this.set({ sheetOpen: true, tab: 'games', arcadeFocus: focus });
  }

  setArcadeFocus(focus: string | null) { this.set({ arcadeFocus: focus }); }

  closeSheet() { this.set({ sheetOpen: false, arcadeFocus: null, unlockForm: null, celebrate: null }); }

  /** Close the sheet and start an in-hub quick game (Selfie / Photo switch to 3D first). Call from the tap. */
  async startQuickGame(id: PlayGameId): Promise<boolean> {
    const exp = this.experience;
    if (!exp?.startPlay) return false;
    this.closeSheet();
    if (exp.mode === 'face' || exp.mode === 'photo') await exp.setMode('showcase');
    const ok = await exp.startPlay(id);
    if (!ok) this.showToast('info', 'Quick games play in 3D or AR. Try the 3D view!', 2800);
    return ok;
  }

  // ------------------------------------------------------------------ viewport
  private watchViewport() {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(min-width: 901px)');
    const on = () => this.set({ isDesktop: mq.matches });
    on();
    mq.addEventListener('change', on);
    this.offs.push(() => mq.removeEventListener('change', on));
  }

  dispose() {
    this.bootToken++;
    this.offs.forEach((off) => { try { off(); } catch { /* ignore */ } });
    this.offs = [];
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    this.experience?.dispose();
    this.experience = null;
    this.set({ started: false });
  }
}
