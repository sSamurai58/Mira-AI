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
    version: "0.1.44",
    date: "18.11.2026",
    summary:
      "Unslop: спокойный chrome, Home = ядро Mira.",
    bullets: [
      "Quiet chrome: без rainbow/glow/idle breathe на оболочке",
      "Home: CoreOrb + короткий CTA; rail, pills и hint-chips убраны",
      "Типографика и иконки: solid text, без emoji в меню/вложениях",
      "Windows-only hotfix (тег win/v0.1.44); macOS/Android — по команде",
    ],
  },
  {
    version: "0.1.43",
    date: "17.11.2026",
    summary:
      "Ключи доступа: формат MIRA-XXXX… и срок пресетами.",
    bullets: [
      "Формат ключа MIRA-XXXX-XXXX-XXXX-XXXX",
      "Срок: 1 / 3 / 6 месяцев, год, навсегда, свой",
      "Сортировка пользователей — явный select",
      "Windows-only hotfix (тег win/v0.1.43)",
    ],
  },
  {
    version: "0.1.42",
    date: "17.11.2026",
    summary:
      "Администрирование и фон-обучение голоса на озвучке ElevenLabs (Windows).",
    bullets: [
      "Корневой раздел «Админ» перед Настройками: Статистика / Информация / Ключи / Роли",
      "Ключи доступа: срок действия и лимит устройств, создание и продление",
      "Фон-голос A: пары текст↔EL копятся, unit-stitch на машине владельца",
      "F10 «Профили» убран из Настроек — доступ через Админ",
      "Windows-only hotfix (тег win/v0.1.42)",
    ],
  },
  {
    version: "0.1.41",
    date: "16.11.2026",
    summary:
      "Голос ElevenLabs всегда в списке, если ключ сохранён (не только при ok API).",
    bullets: [
      "При сохранённом ключе в «Голос» сразу есть «Ваш голос · … (ElevenLabs)»",
      "Полный список аккаунта подмешивается, даже если /voices частично падает",
      "EL-пункты сверху списка; повторная загрузка после гидрации ключа",
      "Windows + macOS + Android одним тегом",
    ],
  },
  {
    version: "0.1.40",
    date: "16.11.2026",
    summary:
      "ElevenLabs: выбранный Voice ID в списке «Голос», без подмены на системный.",
    bullets: [
      "Каталог Голос показывает голоса аккаунта ElevenLabs при сохранённом ключе",
      "Движок ElevenLabs больше не падает тихо в Web Speech / Irina",
      "Выбор EL-голоса пишет ELEVENLABS_VOICE_ID и включает облачный TTS",
      "Windows + macOS + Android одним тегом",
    ],
  },
  {
    version: "0.1.39",
    date: "16.11.2026",
    summary:
      "Голос: sidecar F5-TTS / Chatterbox для настоящего clone (Electron).",
    bullets: [
      "speakTokenPipeline: stitch → F5 → Chatterbox → Cosy → neural",
      "Voice Studio показывает статус sidecar; MIRA_TTS_SIDECAR=auto|f5|chatterbox|cosy|off",
      "docs/EXTERNAL-TTS-SIDECARS.md; pip install f5-tts / chatterbox-tts",
      "Windows + macOS + Android одним тегом",
    ],
  },
  {
    version: "0.1.38",
    date: "16.11.2026",
    summary:
      "Планшет: обновления APK в Настройках + боковой nav как на десктопе.",
    bullets: [
      "Android/Capacitor: реальная versionName вместо 0.0.2-demo / browser-demo",
      "Проверка GitHub Releases на Mira-*-android.apk, скачать/установить APK",
      "Electron updater без изменений (desktop)",
      "Tablet side nav / dialog full width (из 0.1.37+)",
    ],
  },
  {
    version: "0.1.37",
    date: "16.11.2026",
    summary:
      "Android APK ставится: подпись + иконка Mira.",
    bullets: [
      "APK подписан (debug keystore) — больше не «пакет недействителен»",
      "Launcher icon = Mira mark; versionName из package.json",
      "CI проверяет apksigner verify перед upload",
      "Windows + macOS + Android одним тегом",
    ],
  },
  {
    version: "0.1.36",
    date: "16.11.2026",
    summary:
      "Планшет portrait/landscape, Android APK, статус обучения голоса.",
    bullets: [
      "Компактный UI: icon-rail / drawer, Мастерская chips, denser Skills, full-bleed edit modal",
      "Студия: прогресс обучения %, обучена / нужно дообучить (weightsFormat)",
      "Android: Capacitor APK в том же GitHub Release (Win + mac + Android)",
      "Electron minWidth 720 под планшетный preview",
    ],
  },
  {
    version: "0.1.35",
    date: "16.11.2026",
    summary:
      "Голос V1–V19, автообновление снова открывает Mira, легче rail, Skills/MCP.",
    bullets: [
      "Кастомный голос: vocoder без пилы, stitch по start/endMs, coverage≥75%, weightsFormat 2 (нужен retrain)",
      "После тихой установки Mira открывается; во время update — «Мира обновляется», не ошибка ярлыка",
      "Home rail: без лагов на hover Ресурсов/Нагрузки; реже опрос метрик",
      "Skills/MCP: модалка с lock/portal scroll; product-team skill в .cursor/skills",
      "Windows + macOS одним тегом",
    ],
  },
  {
    version: "0.1.34",
    date: "16.11.2026",
    summary:
      "Разборчивее локальный голос, честный % ОЗУ и три новые темы DESIGN.",
    bullets: [
      "Speak: склейка корпуса + formant fill; чище vocode; train 16 кГц/hop 160",
      "ОЗУ: available-based % (не file cache), RSS Миры, легче кэши/WebGL",
      "Темы: Carbon Mist, Silicon Valley, Ember Violet",
      "Кэш TTS сброшен (v3); Windows + macOS одним тегом",
    ],
  },
  {
    version: "0.1.33",
    date: "16.11.2026",
    summary: "Менее «роботный» нейро-голос: меньше Griffin-Lim и телефонного фильтра.",
    bullets: [
      "Синтез опирается на neural vocoder (не на 55%+ Griffin-Lim)",
      "Снят узкий 3.4 кГц фильтр; короткие фразы без нарезки чанков",
      "Без двойного time-scale в плеере; кэш синтеза сброшен (v2)",
      "Release: сначала Windows, потом macOS — чтобы не терять latest.yml",
    ],
  },
  {
    version: "0.1.32",
    date: "16.11.2026",
    summary: "Update HUD снова кликается и закрывается на Windows.",
    bullets: [
      "Исправлено «залипшее» always-on-top окно обновления: клики проходили насквозь",
      "«Скрыть» / × / Esc закрывают окно; ошибки авто-скрываются через ~12 с",
      "Релиз Windows + macOS одним тегом",
    ],
  },
  {
    version: "0.1.31",
    date: "16.11.2026",
    summary:
      "TokenStore голоса: нормализация текста, speaker pack, чанки со склейкой.",
    bullets: [
      "Студия: после обучения сохраняется speaker pack (отпечаток голоса) и TokenStore T0–T3",
      "Речь: числа→слова, фонемы/просодия, чанки с crossfade; CosyVoice sidecar опционально",
      "Кэш синтеза учитывает нормализованный текст и стиль; в UI статус TokenStore",
      "Релиз Windows + macOS одним тегом",
    ],
  },
  {
    version: "0.1.30",
    date: "15.11.2026",
    summary: "Одно окно Update HUD при скачивании обновления.",
    bullets: [
      "Убраны дубли тоста «MIRA · UPDATE» (гонка ensureWindow на download-progress)",
      "Сиротские always-on-top окна закрываются; in-app toast не дублирует overlay",
    ],
  },
  {
    version: "0.1.29",
    date: "15.11.2026",
    summary: "Голосовой пайплайн: диктовка на диск, PTT, VAD, вычитка, бэкап.",
    bullets: [
      "Диалог: клик микрофона = команда, удержание = диктовка; confirm опасных действий",
      "Заметки: create/delete через upsertNote/deleteNote; сессии в data/dictation/*.txt",
      "Стили речи уходят в ElevenLabs (style + v3 tags); политика облачного TTS",
      "VAD-сегменты, словарь имён с журналом, локальная вычитка без LLM",
      "Очередь ASR→LLM→TTS; remap позиции чтения; бэкап/verify диктовки",
    ],
  },
  {
    version: "0.1.28",
    date: "14.11.2026",
    summary: "Пути: реальные иконки программ из exe / .app.",
    bullets: [
      "Мастерская → Пути: иконка берётся из самого приложения (Windows exe/lnk, macOS .app)",
      "Кэш PNG + превью в редакторе пути; запасной вариант — бренд/заглушка",
      "Релиз по-прежнему Windows + macOS одним тегом",
    ],
  },
  {
    version: "0.1.27",
    date: "14.11.2026",
    summary:
      "macOS контроль экрана + DMG; must polish; IMAP тело; MCP refresh.",
    bullets: [
      "macOS: клик/ввод/scroll/hotkeys через cliclick или osascript (Accessibility)",
      "Release: Windows + macOS (dmg/zip x64+arm64); ЧИТАЙ-МЕНЯ для Mac",
      "Терминал: /bin/zsh на Darwin; медиа — Music.app; история браузера — пути macOS",
      "IMAP: тело письма из RFC822; MCP OAuth refresh_token на диске",
      "Porcupine: hybrid + попытка WASM; must 6–16 / F* статусы обновлены в PRD",
    ],
  },
  {
    version: "0.1.26",
    date: "14.11.2026",
    summary:
      "IMAP, клик по названию, WA Cloud, медиа OS, камеры ffmpeg, MCP OAuth callback.",
    bullets: [
      "Почта: IMAP sync (imapflow) + поля IMAP в настройках",
      "Клик по названию: nx/ny → координаты экрана",
      "WhatsApp Cloud API; медиа через playerctl / Windows media keys",
      "Камеры: ffmpeg RTSP кадр; IoT: Home Assistant / MQTT bridge",
      "MCP OAuth loopback callback :18765; Porcupine hybrid + Access Key в Voice",
    ],
  },
  {
    version: "0.1.25",
    date: "14.11.2026",
    summary:
      "Глубже мессенджеры, память, экран/браузер, скиллы и Doctor.",
    bullets: [
      "WhatsApp wa.me с текстом, Instagram-профиль; «ответь ему» → последний контакт; dry-run для WA/IG",
      "«Найди на экране …»; история браузера Mira + Chrome вместе",
      "Память: таймлайн по дням + «Забыть тему»",
      "Wake «слушаю»; таймеры/напоминания выбранным голосом + toast; Doctor «ИТОГ» по-русски",
    ],
  },
  {
    version: "0.1.24",
    date: "14.11.2026",
    summary:
      "Update HUD в углу Mira; Liquid Glass кнопками; удобные папки скиллов.",
    bullets: [
      "Тост обновления якорится к углу окна Mira (не середина чата) и следует за move/resize",
      "Liquid Glass: сегмент Плотнее / Обычный / Более прозрачный вместо dropdown",
      "Скиллы: «+ Папка» / «+ Скилл», выбор каталога, id — без SKILL.md в середине пути",
      "Вложенные «+ Папка» / «+ Скилл» на карточке; пустые каталоги на диске",
    ],
  },
  {
    version: "0.1.23",
    date: "14.11.2026",
    summary:
      "Параметрический TTS из настроек; профиль голоса с аудио или микрофона.",
    bullets: [
      "Движок «Параметрический»: синтез по Гц / высоте / скорости / энергии — без обязательной записи",
      "Снять характеристики с аудиофайла или микрофона → таблица F0, темп, паузы, энергия",
      "«Применить характеристики» заполняет слайдеры под образец",
      "Студийный neural pack по-прежнему опционален; без нарезки клипов",
    ],
  },
  {
    version: "0.1.22",
    date: "14.11.2026",
    summary:
      "Студийный голос только синтезируется — без нарезки и склейки клипов.",
    bullets: [
      "Playback = нейрогенерация (encoder→decoder→vocoder), не cut/stitch записей",
      "Speech-band постфильтр: синтез больше не отбрасывается как «шум»",
      "Нет neural-weights → системный TTS; склейка клипов только по opt-in флагу",
      "Фикс каши от неверной обрезки слов в unit-selection",
    ],
  },
  {
    version: "0.1.21",
    date: "14.11.2026",
    summary:
      "Скиллы как папки SKILL.md: каталоги, импорт, Preview/Code как на GitHub.",
    bullets: [
      "Скилл = папка с SKILL.md; вложенные каталоги (например blender-3d/animation/)",
      "Импорт файла .md / SKILL.md и импорт целой папки-каталога",
      "Редактор: «Предварительный просмотр» / «Код» — таблицы, заголовки, списки, цитаты",
      "Создание с полем «Каталог (папка)» → skills/<каталог>/<id>/SKILL.md",
    ],
  },
  {
    version: "0.1.20",
    date: "14.11.2026",
    summary:
      "Локальный VoiceEngine с характером голоса; раскладка окон и виртуальные столы Windows.",
    bullets: [
      "VoiceEngine: пресеты характера, FX (pitch/скорость/энергия/паузы), автоозвучка студийным голосом",
      "Локальный синтез: warmup, кэш, пофразовый стрим — без облачных API для mira-studio-*",
      "Команды и Протоколы: свернуть все, рабочие столы, раскладка окна left/right/fullscreen",
      "«Запустить» с раскладкой и выбором монитора (задел под мультимонитор)",
    ],
  },
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
