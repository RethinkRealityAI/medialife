import { useEffect, useState } from "react";

export type Theme = "dark" | "light";
const KEY = "ml-theme";

export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(KEY) as Theme | null;
  if (stored === "dark" || stored === "light") return stored;
  return "dark";
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("dark", theme === "dark");
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    const t = getInitialTheme();
    setTheme(t);
    applyTheme(t);
  }, []);
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {}
  };
  return { theme, toggle };
}

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
  { code: "it", label: "Italiano" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "ar", label: "العربية" },
] as const;

export type LangCode = (typeof LANGUAGES)[number]["code"];
const LANG_KEY = "ml-lang";

export function useLanguage() {
  const [lang, setLangState] = useState<LangCode>("en");
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANG_KEY) as LangCode | null;
      if (stored && LANGUAGES.some((l) => l.code === stored)) setLangState(stored);
    } catch {}
  }, []);
  const setLang = (l: LangCode) => {
    setLangState(l);
    try {
      window.localStorage.setItem(LANG_KEY, l);
    } catch {}
    if (typeof document !== "undefined") document.documentElement.lang = l;
  };
  return { lang, setLang };
}
