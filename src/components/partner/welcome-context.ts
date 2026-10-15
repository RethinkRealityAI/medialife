/**
 * Whether the Partner Hub welcome is open. Provided by the Partner Hub layout
 * (WelcomeProvider in welcome.tsx), read by the dialog and by "Take the tour"
 * in the account menu.
 */
import { createContext, useContext } from "react";

export type WelcomeState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  show: () => void;
};

export const WelcomeContext = createContext<WelcomeState | null>(null);

/** The welcome's open state; null outside the Partner Hub. */
export const useWelcome = () => useContext(WelcomeContext);
