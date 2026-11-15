/**
 * Short TTS status phrases — prefer these over dumping file paths.
 */

type Vars = Record<string, string>;

const PHRASES: Record<string, string> = {
  draft_saved: "Черновик сохранён, версия {version}",
  note_created: "Заметка создана",
  note_deleted: "Заметка перемещена в архив",
  confirm_needed: "Нужно подтверждение",
  confirm_yes: "Подтверждено",
  confirm_no: "Отменено",
  mode_dictation: "Режим диктовки",
  mode_command: "Режим команд",
  reading: "Читаю",
  read_stopped: "Остановилась на абзаце {paragraph}",
  read_from: "Читаю с абзаца {paragraph}",
  repeat: "Повторяю",
  empty_doc: "Текст пуст",
  dictation_appended: "Добавлено в черновик",
  file_busy: "Не удалось создать версию, файл занят, повторить или сохранить под новым именем",
  external_blocked: "Внешние вызовы запрещены",
  stop: "Стоп",
};

export function statusPhrase(key: keyof typeof PHRASES | string, vars: Vars = {}): string {
  const template = PHRASES[key] ?? String(key);
  return template.replace(/\{(\w+)\}/g, (_m, name: string) => vars[name] ?? "");
}

export function listStatusPhraseKeys(): string[] {
  return Object.keys(PHRASES);
}
