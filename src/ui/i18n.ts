export type UiLang = "ru" | "en";

const KEY = "mira.uiLang";

const DICT = {
  ru: {
    home: "Главная",
    chat: "Диалог",
    memory: "Память",
    workshop: "Мастерская",
    settings: "Настройки",
    ready: "Готово",
    notes: "Заметки",
  },
  en: {
    home: "Home",
    chat: "Chat",
    memory: "Memory",
    workshop: "Workshop",
    settings: "Settings",
    ready: "Ready",
    notes: "Notes",
  },
} as const;

export type I18nKey = keyof (typeof DICT)["ru"];

export function getUiLang(): UiLang {
  const v = localStorage.getItem(KEY);
  return v === "en" ? "en" : "ru";
}

export function setUiLang(lang: UiLang): void {
  localStorage.setItem(KEY, lang);
}

export function t(key: I18nKey, lang = getUiLang()): string {
  return DICT[lang][key] ?? DICT.ru[key] ?? key;
}

export function asrLangForUi(lang = getUiLang()): string {
  return lang === "en" ? "en-US" : "ru-RU";
}
