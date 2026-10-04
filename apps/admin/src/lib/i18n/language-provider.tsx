"use client";

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type Language, type Translate, translate } from "./dictionary";

const STORAGE_KEY = "oca_lang";

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translate;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLanguage(): Language | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "lo" || value === "en" ? value : null;
  } catch {
    return null;
  }
}

export function LanguageProvider({
  children,
  initialLanguage,
}: {
  children: ReactNode;
  /** ໃຊ້ໃນ test; ຖ້າບໍ່ໃສ່ ຈະອ່ານຈາກ localStorage ແລ້ວ default ເປັນລາວ. */
  initialLanguage?: Language;
}) {
  const [language, setLanguageState] = useState<Language>(initialLanguage ?? "lo");

  useEffect(() => {
    if (initialLanguage) return;
    const stored = readStoredLanguage();
    if (stored) setLanguageState(stored);
  }, [initialLanguage]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage ໃຊ້ບໍ່ໄດ້ (private mode ຯລຯ): ຍັງໃຊ້ໄດ້ໃນ session ນີ້
    }
  }, []);

  const t = useCallback<Translate>((key, params) => translate(language, key, params), [language]);
  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext value={value}>{children}</LanguageContext>;
}

export function useT(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useT must be used within LanguageProvider");
  return context;
}
