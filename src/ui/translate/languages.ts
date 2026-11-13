/** Languages for Переводчик (labels in Russian, as in the UI mock). */

export type TranslateLang = {
  code: string;
  label: string;
  /** Short chip label (native / Latin). */
  chip?: string;
};

export const DETECT_CODE = "auto";

export const TRANSLATE_LANGS: TranslateLang[] = [
  { code: "ru", label: "Русский", chip: "Русский" },
  { code: "en", label: "Английский", chip: "English" },
  { code: "uz", label: "Узбекский" },
  { code: "tr", label: "Турецкий" },
  { code: "de", label: "Немецкий", chip: "Deutsch" },
  { code: "fr", label: "Французский", chip: "Français" },
  { code: "es", label: "Испанский", chip: "Español" },
  { code: "it", label: "Итальянский", chip: "Italiano" },
  { code: "pt", label: "Португальский" },
  { code: "zh", label: "Китайский", chip: "中文" },
  { code: "ja", label: "Японский", chip: "日本語" },
  { code: "ko", label: "Корейский" },
  { code: "ar", label: "Арабский" },
  { code: "uk", label: "Украинский" },
  { code: "pl", label: "Польский" },
  { code: "kk", label: "Казахский" },
  { code: "hi", label: "Хинди" },
];

export const QUICK_CHIP_CODES = [
  "en",
  "ru",
  "de",
  "fr",
  "it",
  "es",
  "zh",
  "ja",
] as const;

export const MAX_TRANSLATE_CHARS = 5000;

export function langLabel(code: string): string {
  if (code === DETECT_CODE) return "Определить язык";
  return TRANSLATE_LANGS.find((l) => l.code === code)?.label ?? code;
}

export function chipLabel(code: string): string {
  const lang = TRANSLATE_LANGS.find((l) => l.code === code);
  return lang?.chip ?? lang?.label ?? code;
}
