"use client";

import { useI18n, type Lang } from "@/lib/i18n";

const LANGS: Lang[] = ["en", "es"];

/** Compact EN/ES segmented control. Amber marks the active language. */
export function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label="Language / Idioma">
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          className={l === lang ? "on" : ""}
          aria-pressed={l === lang}
          onClick={() => setLang(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
