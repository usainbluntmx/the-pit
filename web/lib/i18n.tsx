"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { en, type Copy } from "./messages/en";
import { es } from "./messages/es";
import { ES_UI } from "./messages/ui-es";

export type Lang = "en" | "es";

const DICTS: Record<Lang, Copy> = { en, es };
const STORAGE_KEY = "pit:lang";

type Ctx = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  c: Copy;
};

const LangCtx = createContext<Ctx | null>(null);

/**
 * Language state lives on the client: the app is entirely interactive and every
 * string sits in the same client tree, so there is no need for route segments or
 * a cookie round-trip. The choice survives reloads in `localStorage`; a first-time
 * visitor gets their browser language when it is Spanish, English otherwise.
 */
export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "es") {
      setLangState(saved);
      return;
    }
    setLangState(navigator.language?.toLowerCase().startsWith("es") ? "es" : "en");
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    window.localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const setLang = useCallback((next: Lang) => setLangState(next), []);

  const value = useMemo<Ctx>(() => ({ lang, setLang, c: DICTS[lang] }), [lang, setLang]);

  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(LangCtx);
  if (!ctx) throw new Error("useI18n must be used inside <LangProvider>");
  return ctx;
}

/**
 * Source-keyed translation for the dense app UI. The English string is the key;
 * a missing entry falls back to English instead of rendering a raw key.
 * Supports `{name}` placeholders.
 */
export function useT() {
  const { lang } = useI18n();
  return useCallback(
    (source: string, vars?: Record<string, string | number>) => {
      let out = lang === "es" ? ES_UI[source] ?? source : source;
      if (vars) {
        for (const [key, value] of Object.entries(vars)) {
          out = out.split(`{${key}}`).join(String(value));
        }
      }
      return out;
    },
    [lang],
  );
}

/**
 * Renders copy that carries `**emphasis**` marks as real <b> nodes, so a
 * translation can move the emphasis without splitting the sentence into keys.
 */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <b key={i}>{part.slice(2, -2)}</b>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
