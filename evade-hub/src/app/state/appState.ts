// The app layer's state (React shell over the experience). Bobo doesn't talk, so there is no call / chat / voice
// state: the shell owns the toasts and Bobo's Arcade sheet; everything else is the experience's own HUD.
import type { ExperienceMode } from '@/shared/contracts';
import { createStore } from './store';
import type { Source } from '../loaders';

export type TabId = 'games';

export interface Toast {
  id: number;
  kind: 'found' | 'info' | 'error';
  text: string;
}

export interface AppState {
  started: boolean;
  sources: { experience: Source | 'loading' };
  expMode: ExperienceMode;
  expBusy: boolean;
  /** An app sheet is over the scene (the Arcade). Mini games hold their round while it is open (PlayBridge). */
  sheetOpen: boolean;
  tab: TabId;
  /** Bobo's Arcade: the experience whose card is open (null = the whole list). */
  arcadeFocus: string | null;
  toast: Toast | null;
  isDesktop: boolean;
}

export function createAppStore() {
  return createStore<AppState>({
    started: false,
    sources: { experience: 'loading' },
    expMode: 'showcase',
    expBusy: false,
    sheetOpen: false,
    tab: 'games',
    arcadeFocus: null,
    toast: null,
    isDesktop: typeof matchMedia === 'function' && matchMedia('(min-width: 901px)').matches,
  });
}

export type AppStore = ReturnType<typeof createAppStore>;
