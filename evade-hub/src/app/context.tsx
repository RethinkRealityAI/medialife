import { createContext, useContext } from 'react';
import type { AppController } from './controller';
import type { AppState } from './state/appState';
import { useStore } from './state/store';

export const AppContext = createContext<AppController | null>(null);

export function useController(): AppController {
  const c = useContext(AppContext);
  if (!c) throw new Error('AppContext missing');
  return c;
}

/** Read a slice of app state. */
export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(useController().store, selector);
}
