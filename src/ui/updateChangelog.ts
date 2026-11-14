/**
 * In-app «История обновлений» for Settings → Updates.
 * Newest first. Keep bullets accurate to what shipped (see docs/MEMORY.md).
 */

export type MiraChangelogEntry = {
  /** Semver without leading v, e.g. "0.1.12" */
  version: string;
  /** Display date dd.mm.yyyy */
  date: string;
  /** Optional short lead paragraph (Mirada-style) */
  summary?: string;
  bullets: string[];
};

export const MIRA_CHANGELOG: MiraChangelogEntry[] = [
  {
    version: "0.1.19",
    date: "14.11.2026",
    summary:
      "Настоящее Apple Liquid Glass; Apple внутри Внешнего вида; крупнее ядро на Home.",
    bullets: [
      "Apple: цветная атмосфера под стеклом, сильный blur, без неонового свечения Mira",
      "Apple — подраздел Настройки → Внешний вид (не отдельный пункт слева)",
      "Home: ядро крупнее по умолчанию (не от уровня)",
      "macOS-стиль: синяя заливка nav, iOS-тогглы, мягкий ThemeSelect",
    ],
  },
  {
    version: "0.1.18",
    date: "14.11.2026",
    summary:
      "Apple-темы с Liquid Glass и SF Pro; черновики каталога; Workshop HUD; запуск из Путей.",
    bullets: [
      "Настройки → Apple: светлая/тёмная тема, Liquid Glass, жирный шрифт",
      "San Francisco (SF Pro Text/Display) только в Apple-темах",
      "Черновики под сетками Скиллов, Протоколов, Путей и Команд",
      "Workshop HUD: виджеты, таймер, секундомер, напоминания",
      "«Запустить»: выбор приложений из библиотеки Путей",
      "Memory hub и Create справа от сортировки в каталоге",
    ],
  },
  {
    version: "0.1.17",
    date: "14.11.2026",
    summary:
      "HUD поверх всех окон; микрофон с живым спектром; протоколы шире; полировка чата и композера.",
    bullets: [
      "Update HUD всегда поверх всех приложений",
      "Settings → Голос: выбор микрофона + живой тест уровня и спектра",
      "Протоколы: шаги шире кастомных команд (@act / @say / @pause и др.)",
      "Чат: даты без наложения; Create в каталоге выровнен с сортировкой",
      "Композер: без пустот на стыке «Файл» и поля ввода",
    ],
  },
  {
    version: "0.1.16",
    date: "14.11.2026",
    summary:
      "Протоколы = последовательности команд; полировка Settings и чата; звуки HUD.",
    bullets: [
      "Протоколы: цепочка кастомных команд (+ сказать / пауза), Run без LLM",
      "Settings: Voice / Terminal / Data & Privacy — карточные панели с контролами",
      "HUD-звуки уведомлений: встроенные + загрузка/переименование",
      "Чат: даты и время как в Telegram, прыжок к последним; тонкие скроллбары",
      "Терминал: без обрезки глифов; интеграционные тесты — только в модалке",
      "Бейдж версии: «текущая»",
    ],
  },
  {
    version: "0.1.15",
    date: "14.11.2026",
    summary:
      "Интеграции, API, Скиллы, Протоколы — карточки как в Путях; современный Терминал.",
    bullets: [
      "Settings → Всплывающие уведомления: HUD + OS, трей, тихие часы, категории",
      "Обновления приходят OS-toast’ом, если окно свёрнуто / закрыто в трей",
      "Интеграции / API / Скиллы / Протоколы — карточки как в Путях",
      "Терминал: вкладки-сессии, cwd, alive; brand icons LLM/TTS",
    ],
  },
  {
    version: "0.1.14",
    date: "13.11.2026",
    summary:
      "Реальные логотипы приложений и MCP; полный экран без панели задач; история обновлений — пять последних по умолчанию.",
    bullets: [
      "Пути и MCP: официальные brand-иконки (55 ассетов в public/brand-icons)",
      "Windows: развернуть / двойной клик по titlebar → exclusive fullscreen (панель задач скрыта)",
      "F11 — полный экран на текущем мониторе; Esc / «Восстановить» — выход",
      "Settings → Обновления: показываются 5 последних версий",
      "Кнопка «Показать больше» / «Свернуть» в теме Mira",
    ],
  },
  {
    version: "0.1.13",
    date: "13.11.2026",
    summary:
      "Плавающий MIRA · UPDATE toast появляется сам при старте и возврате в приложение; карточки Путей с узнаваемыми иконками.",
    bullets: [
      "Автопроверка после did-finish-load (без гонки с подпиской renderer)",
      "Повторный показ при focus/visibility, если обновление ещё доступно",
      "«Скрыть» действует на сессию для той же версии — без спама",
      "Мастерская → Пути: brand-иконки приложений и более читаемые карточки",
    ],
  },
  {
    version: "0.1.12",
    date: "13.11.2026",
    summary:
      "Исправление «писка» TTS в диалоге: валидный MP3, без обратной связи микрофона во время речи.",
    bullets: [
      "ElevenLabs: проверка MP3 vs JSON/PCM; по умолчанию convert, stream → fallback",
      "Воспроизведение в диалоге: decode + проверка «похоже на речь»; иначе Web Speech",
      "Нейро-вокодер с шумом → unit-stitch / Web Speech",
      "Home HUD: уровень микрофона только при прослушивании (без feedback от колонок)",
      "Мастерская → Пути: программы/папки/файлы, теги голоса, автообнаружение, открытие по фразе",
      "Мастерская → Кастомные команды: цепочки действий по фразе (сайт / запуск / клавиши / пауза / сказать)",
      "Раздел «Переводчик»: быстрый HTTP-перевод и режим через ИИ, TTS/ASR",
    ],
  },
  {
    version: "0.1.11",
    date: "13.11.2026",
    summary:
      "MCP runtime scaffolding, расширение ElevenLabs и плавающий HUD обновлений.",
    bullets: [
      "MCP: каркас runtime, честные статусы draft/connected, пробы Tier A",
      "ElevenLabs: /stream, настройки голоса, список/клон, Flash для коротких фраз",
      "Wake pluggable + stub Porcupine; статус TTS и полоски микрофона на Home",
      "Автопроверка обновлений + плавающий toast в стиле Mira HUD",
      "EPUB, AV ASR, FTS-память, WebGL LOD, Win32 SendInput",
    ],
  },
  {
    version: "0.1.10",
    date: "13.11.2026",
    bullets: [
      "Живое голографическое ядро: быстрее орбита/слои, idle-пульс яркости",
      "Home HUD: aura уровня, sheen прогресса, тик latency, «живые» плитки",
      "prefers-reduced-motion: медленный drift вместо полной заморозки",
    ],
  },
  {
    version: "0.1.9",
    date: "13.11.2026",
    bullets: [
      "Голографическое ядро WebGL2 (4 слоя, MAX blend, bloom) в coreWebgl",
      "Уровень Mira → видимость 0…4; вспышка при level-up",
      "Уважение reduced-motion: замедление spin/orbit",
    ],
  },
  {
    version: "0.1.8",
    date: "12.11.2026",
    bullets: [
      "ElevenLabs TTS в Electron main (ключ из ELEVENLABS_API_KEY)",
      "Движок elevenlabs вместо edge-stub; пресет Voice ID, тест в Настройках",
      "Doctor finding + smoke elevenlabs:smoke",
    ],
  },
  {
    version: "0.1.7",
    date: "12.11.2026",
    bullets: [
      "Voice Studio: точная нарезка слов (islands, pad) и OLA-сращивание",
      "Neural TTS на CPU: curriculum encoder→vocoder/RLHF",
      "Рост XP ядра; меньше повторов шаблонных ответов в чате",
    ],
  },
  {
    version: "0.1.6",
    date: "12.11.2026",
    bullets: [
      "Workshop-оверлеи через portal (не прячутся под боковой nav)",
      "Таблица curriculum TTS простым языком",
      "Генерация фраз: новизна словаря, меньше повторов частиц/предлогов",
    ],
  },
  {
    version: "0.1.5",
    date: "12.11.2026",
    bullets: [
      "Подтверждения в теме Mira (AppConfirm), без системного window.confirm",
      "Frameless TitleBar в токенах темы",
      "Интеграции: пустой экран при кликах; закрытие ThemeSelect по phrase-bind",
    ],
  },
  {
    version: "0.1.4",
    date: "12.11.2026",
    bullets: [
      "Каталог MCP в Настройках (плитки этапов, карточки, ссылки)",
      "Voice Studio: нарезка/перезагрузка; модалки по размеру контента",
    ],
  },
];

/** Normalize "v0.1.12" / "0.1.12" for badge match. */
export function normalizeMiraVersion(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw).trim().replace(/^v/i, "");
}
