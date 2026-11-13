# WIP

Временный черновик: планы, мысли, шаги реализации, идеи.  
**Не источник правды.** После реализации запись убирается отсюда и переносится в основные docs.

| Куда переносить | Когда |
|-----------------|-------|
| `PRD.md` | Фича принята в scope / сменился статус stub→done |
| `DESIGN.md` | Зафиксированы UI, экраны, токены, блоки |
| `ARHITECTURE.md` | Границы модулей, схема, дерево репо |
| `RULES.md` | Договорённость или стек стали правилом |
| `MEMORY.md` | Решение принято, баг найден/закрыт, смена фазы |

## Правила

1. Писать свободно: гипотезы, варианты, чеклисты — можно сырым текстом.
2. У каждой активной темы — заголовок и дата начала.
3. Сделали и перенесли в основные docs → **удалить** блок отсюда (не архивировать длинно).
4. Принятое решение дублировать в `MEMORY.md`; здесь не держать как «вечную» запись.
5. Секреты и содержимое `.env` сюда не писать.

---

## 2026-11-11 — План разработки (дорожная карта)

**Как ведём работу:** идём **по фазам сверху вниз**. Внутри фазы — по чекбоксам. Не прыгаем в Blender / студию / мессенджеры, пока не закрыт критерий выхода предыдущей фазы.  
После каждого значимого шага: обновить статусы в `PRD.md`, решение/фазу в `MEMORY.md`, вычеркнуть пункт здесь.  
Future **F1–F13** — только после стабилизации must (или точечно F13 Doctor-stub раньше, см. фазу 0/1).

### Статус дорожной карты

| Поле | Значение |
|------|----------|
| Текущая фаза | **Realize-all ✅** |
| Следующее действие | Дальше по запросу |
| Запрещено сейчас | Republish / retag 0.1.13 без явного OK |


### Стартовые допущения стека (подтвердить в P0 → MEMORY)

Пока не опровергнуто — работаем так:

| Слой | Допущение | Почему |
|------|-----------|--------|
| Desktop shell | **Electron + React + TypeScript** | Один процесс, быстрый UI по DESIGN, темы CSS vars |
| Store | **SQLite** (`better-sqlite3` или sql.js→native) | Уже в RULES/ARHITECTURE |
| Orchestrator | TS в том же процессе | Без микросервисов |
| LLM | Сначала **один** адаптер (OpenAI-compatible **или** Anthropic), затем Gemini | PRD #5 без lock-in |
| ASR/TTS | Адаптеры за интерфейсом; v1 — облачный TTS + простой ASR **или** локальный, выбор в P2 | PRD #2 |
| OS приоритет | **Windows + Linux** сначала; macOS следом | Экран/терминал проще унифицировать позже |
| Confirm | До F12 — всегда `always` | RULES |

Если пользователь задаёт другой стек в P0 — правим таблицу и пишем решение в MEMORY.

### Обзор фаз

| Фаза | Название | PRD focus | Критерий выхода |
|------|----------|-----------|-----------------|
| **P0** | Каркас | платформа | Репо собирается; 4 корня UI; `.env.example`; SQLite открывается |
| **P1** | MVP-0 текст | #1, #5, #3 | Текстовый диалог с LLM, история в SQLite, поиск «о чём говорили» |
| **P2** | Голос | #2, #11 (минимум) | PTT → ASR → ответ → TTS; выбор ≥1 голоса |
| **P3** | Расширения поведения | #9, #10 | Skill on-demand; протокол md + панель Run |
| **P4** | Сеть + confirm UX | #4 + modal | Search/fetch по команде; единый ConfirmModal |
| **P5** | Экран и браузер | #6, #7, #8 | Видит экран; простой клик; открыть URL / поиск по истории (1 браузер) |
| **P6** | Мессенджеры | #12 | ≥1 мессенджер: send/reply + preview/confirm |
| **P7** | Терминал | #16 | Встроенный PTY в Мастерской; команда из Диалога + confirm |
| **P8** | Библиотека и обучение | #14 | Upload → анализ → память → опц. skill draft |
| **P9** | Студия голоса | #15 | Цикл создать→фразы→upload→автообработка→в каталог |
| **P10** | Blender | #13 | Задача в Blender end-to-end + skills on-demand |
| **P11** | Стабилизация must | 1–16 polish | Статусы ≥ `partial` happy-path; Doctor-light; готовность к F* |

---

### P0 — Каркас ✅

**Цель:** пустое, но «правильное» приложение под docs.

- [x] **P0.1** Подтвердить/зафиксировать стек в `MEMORY.md` (таблица допущений выше или правки)
- [x] **P0.2** Scaffold: `package.json`, TS, lint/format, `.gitignore`, `README.md` продукта
- [x] **P0.3** Дерево `src/` по `ARHITECTURE.md` (пустые модули + index stubs)
- [x] **P0.4** `.env.example`: `DATABASE_PATH`, плейсхолдеры LLM/ASR/TTS **без секретов**
- [x] **P0.5** `store`: открытие SQLite, миграции v1 (`sessions`, `utterances` минимум)
- [x] **P0.6** `ui` AppShell: 4 корня — Диалог / Память / Мастерская / Настройки
- [x] **P0.7** Тема `deep-sea-neon` через CSS variables (DESIGN/THEMES)
- [x] **P0.8** Настройки: разделы-заглушки по карте DESIGN (Внешний вид уже с переключателем тем — хотя бы список)
- [x] **P0.9** Состояния голоса UI: `idle|listening|thinking|speaking|error` (пока без реального ASR/TTS)
- [x] **P0.10** Заготовка `ConfirmModal` + баннер error («откроется Doctor» — stub под F13)

**Выход P0:** выполнен — `npm run build` / `db:check` OK; UI shell + 14 тем; Electron поднимает store.

---

### P1 — MVP-0: диалог + LLM + память ✅

**Цель:** полезный текстовый ассистент с памятью. Голос ещё не обязателен.

- [x] **P1.1** `config`: чтение `.env`, валидация ключей
- [x] **P1.2** `llm`: интерфейс провайдера + **1** рабочий адаптер (#5) — OpenAI-compatible + mock
- [x] **P1.3** Настройки → API и модели: конфиг + тест соединения
- [x] **P1.4** `orchestrator`: сессия диалога, стриминг ответа в UI (#1)
- [x] **P1.5** Сохранение user/assistant turns в `utterances` (#3)
- [x] **P1.6** Экран **Память**: список сессий, открытие прошлого чата
- [x] **P1.7** Поиск по истории («о чём говорили…») + подъём фрагментов в контекст
- [x] **P1.8** Обновить PRD: #1/#3/#5 → `partial`

**Выход P1:** выполнен — `npm run p1:smoke` (mock) OK; UI чат/память/API.

---

### P2 — Голос (человечная речь) ✅

**Цель:** замкнуть контур слух→диалог→речь.

- [x] **P2.1** Выбрать ASR/TTS движки; записать в MEMORY — Web Speech API
- [x] **P2.2** `asr` адаптер + PTT на Home (+ Demo PTT fallback)
- [x] **P2.3** `tts` адаптер; озвучка ответа; стоп озвучки
- [x] **P2.4** `voices`: каталог системных голосов; выбор активного (#11 min)
- [x] **P2.5** Мастерская → Голоса; Настройки → Голос и аудио
- [x] **P2.6** Движок/предпочтение RU neural|local зафиксированы в MEMORY (#2 partial)
- [x] **P2.7** State machine ↔ listening/thinking/speaking

**Выход P2:** выполнен в Electron с mic; headless — `npm run p2:smoke`. Студия/импорт — P9.

---

### P3 — Skills и протоколы ✅

- [x] **P3.1** Формат skill — md + YAML frontmatter (`seed/skills`)
- [x] **P3.2** Каталог; в контекст только on-demand / explicit (#9)
- [x] **P3.3** UI Мастерская → Скиллы
- [x] **P3.4** Протоколы md + панель CRUD + Run (#10)
- [x] **P3.5** Триггер из Диалога (`протокол утро`, `/morning`, force Run)
- [x] **P3.6** `p3:smoke` — idle без skills; code turn только `code-helper`

**Выход P3:** выполнен.

---

### P4 — Интернет + единый confirm ✅

- [x] **P4.1** `web.search` (DDG) / `web.fetch`; политика `WEB_*` + UI Интеграции
- [x] **P4.2** Оркестратор вызывает web только при internet-intent
- [x] **P4.3** ConfirmBridge + ConfirmModal на `web.fetch`
- [x] **P4.4** Doctor/error banner + тест web; LLM/API errors уже в health

**Выход P4:** выполнен (`p4:smoke`, демо UI).

---

### P5 — Экран и браузер

- [x] **P5.1** OS-приоритет финально в MEMORY (`linux,windows,macos`)
- [x] **P5.2** Захват экрана → метаданные/файл в контекст (#6; пиксели→vision — later)
- [x] **P5.3** Простой контроль: клик / ввод + confirm (#7; xdotool / dry-run)
- [x] **P5.4** Браузер: открыть URL (#8; `shell.openExternal` + confirm)
- [x] **P5.5** История/поиск «где я уже был» — Mira visits + Chromium fallback
- [x] **P5.6** Настройки → Интеграции: Экран, Браузер (+ тесты)

**Выход P5:** выполнен (`p5:smoke`, демо UI).

---

### P6 — Мессенджеры

- [x] **P6.1** Первый мессенджер: **Telegram** → MEMORY
- [x] **P6.2** Адаптер: resolve chat, send, reply (Bot API / dry-run)
- [x] **P6.3** Превью + confirm обязательны
- [x] **P6.4** UI аккаунта/контактов в Интеграции + тест send
- [x] **P6.5** Заглушки WA/IG (stub status, без отправки)

**Выход P6:** выполнен (`p6:smoke`: send + reply через confirm; live при `TELEGRAM_BOT_TOKEN`).

---

### P7 — Встроенный терминал (#16)

Чеклист 16.1–16.8 ниже — выполнен. Порядок: UI эмулятор → shell → из Диалога.

**Выход P7:** выполнен (`p7:smoke`; Мастерская → Терминал; confirm из Диалога).

---

### P8 — Обучение по материалам (#14)

Чеклист 14.1–14.9 ниже — выполнен. Порядок: библиотека UI → extract → analyze → memory → skill draft.

**Выход P8:** выполнен (`p8:smoke`; материал → выученное в диалоге).

---

### P9 — Студия голоса (#15)

- [x] 15.1–15.9: проект → фразы/дедуп → upload/mic → авто QA+corpus TTS → каталог #11 → цикл + LLM-profile stub  
- [x] Smoke: `npm run p9:smoke`  
- [x] UI: Мастерская → Голоса (студия + каталог)

**Выход P9:** выполнен (цикл → голос в каталоге; neural train — later).

---

### P10 — Blender (#13)

- [x] Путь/статус Blender в Интеграции (`BLENDER_PATH`, policy, тест демо)
- [x] Bridge (`blender --background --python`) + dry-run без бинарника
- [x] Skill `blender-scene` on-demand (default off)
- [x] Демо-задача: куб + свет + камера end-to-end из Диалога
- [x] Smoke: `npm run p10:smoke`

**Выход P10:** выполнен (диалог → blender tool + skill; live при наличии Blender).

---

### P11 — Стабилизация must

- [x] Пройти критерии готовности PRD 1–16 (happy-path) — `npm run p11:smoke`
- [x] Подтянуть stubs платформы → `partial`/`done`; must 1–16 ≥ `partial`
- [x] Doctor-light для mic/API/Blender/tools (UI + `mira:run-doctor`)
- [x] F* первыми: **F11** backup/забыть → **F13** Doctor полный → **F9** barge-in

**Выход P11:** выполнен.

---


### Правила ведения пунктов (для агента)

1. Работаем **только текущую фазу** (сейчас P0), пока не выполнен критерий выхода — исключение: критичный bugfix.
2. Каждый PR/коммит-пакет — одна подзадача `P*.*` или узкая группа.
3. Секреты не коммитить; обновлять `.env.example` при новых ключах.
4. UI — DESIGN IA; design skills из `.cursor/skills/` on-demand.
5. После фазы: MEMORY (фаза), PRD статусы, вычистить выполненные чекбоксы из этого файла или пометить `[x]`.

### Открытые вопросы (закрывать в фазе, где мешают)

| Вопрос | Закрыть не позже |
|--------|------------------|
| Финальный UI/runtime стек | P0.1 |
| Первый LLM-провайдер | P1.2 |
| ASR/TTS движки | P2.1 |
| Формат skills / protocols | P3.1 |
| OS для screen control | P5.1 ✅ linux→windows→macos |
| Первый мессенджер | P6.1 |
| Движок обучения TTS студии | P9 ✅ corpus pack + Web Speech fallback |
| Blender bridge | P10 ✅ CLI bpy + dry-run |

---

## Чеклисты must (детали поздних фаз)

### PRD #14 — обучение по материалам (фаза P8)

- [x] **14.1** Загрузка книг/видео/аудио в библиотеку + метаданные  
- [x] **14.2** Извлечение текста / транскрипт (txt/md full; PDF/AV stub)  
- [x] **14.3** Глубокий анализ: тезисы, фразы, стиль, логика  
- [x] **14.4** План освоения материала  
- [x] **14.5** Запись в долговременную память со ссылкой на источник  
- [x] **14.6** Подъём выученного в диалог по запросу  
- [x] **14.7** Предложение skill → confirm → в каталог (#9), default off  
- [x] **14.8** Инкрементальное обновление при дозагрузке  
- [x] **14.9** UI библиотеки: статусы разбора и связи со skills  

### PRD #15 — студия голоса (фаза P9)

UX: **Создать → фразы → загрузить → Mira сама обработала → ещё фразы → …**

- [x] **15.1** Кнопка «Создать новый голос»  
- [x] **15.2** Генератор фраз + дедуп + «Ещё фраз»  
- [x] **15.3** Сессия записи в приложении (опц.)  
- [x] **15.4** Загрузка записанных файлов  
- [x] **15.5** Авто-анализ после загрузки (без ручного старта)  
- [x] **15.6** Авто-сборка/update TTS после принятого анализа (corpus pack stub)  
- [x] **15.7** Появление/обновление в каталоге (#11)  
- [x] **15.8** Цикл развития словаря/качества (рекомендации + повтор)  
- [x] **15.9** LLM-профиль (prompt stub, привязка к voiceId)  

Открытые #15 (later): neural TTS train; fine-tune vs prompt; partial vs full retrain.

### PRD #16 — терминал (фаза P7)

- [x] **16.1** Эмулятор (xterm.js TTY UI)  
- [x] **16.2** Interactive shell + cwd (node-pty / spawn fallback)  
- [x] **16.3** stdin / interrupt (PTY data + Ctrl+C через write)  
- [x] **16.4** Несколько сессий во внутренней панели  
- [x] **16.5** Рабочая директория (показ/cd)  
- [x] **16.6** Команды из Диалога → терминал (+ confirm)  
- [x] **16.7** История / clear  
- [x] **16.8** Prefs в Настройках → Терминал  

---

## Позже (не must) — PRD § future

| # | Тема | Не делать в коде must |
|---|------|------------------------|
| F1 | Камеры: connect, PTZ/zoom по команде, запись → библиотека Mira | ✅ stub registry + snapshot/PTZ dry-run |
| F2 | Wi‑Fi / умная техника и фурнитура | ✅ device registry + on/off confirm dry-run |
| F3 | Календарь / напоминания / таймеры голосом | ✅ events + timers from chat |
| F4 | Почта: читать + черновик/ответ (как мессенджеры, confirm) | ✅ local inbox stub + draft/send confirm |
| F5 | Файловый менеджер: открыть / найти на диске | ✅ search/open under workspace allowlist |
| F6 | Заметки Obsidian/Notion-like ↔ память #3/#14 | ✅ notes CRUD + Memory UI |
| F7 | Музыка/медиа: плеер, плейлисты | ✅ local playlist stub play/pause/next |
| F8 | Мультиязычность UI + ASR/TTS | ✅ ru/en UI + ASR lang pref |
| F9 | Wake-word / hands-free + barge-in (перебить TTS) | ✅ hands-free wake + Перебить/Space; f9:smoke |
| F10 | Профили: голос / память / ключи (scoped, не в git) | ✅ profiles.json + Settings |

| F11 | Backup/export/import + «забыть» память/библиотеку | ✅ mira-backup-v1; Настройки → Данные; f11:smoke |
| F12 | Режим confirm: always / smart / dangerous-list | ✅ policy + Settings → Общие |
| F13 | Логи + Doctor (mic / API / Blender…) | ✅ Doctor F13 + app_logs/jsonl viewer; f13:smoke |

Открытые вопросы F* — см. предыдущие итерации; поднимать при входе в конкретный F#.

---

## 2026-11-12 — MCP каталог + релиз 0.1.4 ✅

План правды: `docs/MCP.md`. UI: Настройки → MCP, этапы 1/2/3/5/6/7/8/9/10 как плитки  
(6 Dev, 7 Design/креатив с Blender + `builtinHint`). Карточки: длинное описание,
ссылки docs/setup/OAuth/API, hints полей, ≥3 voice examples; draft-only 0.1.4.

- [x] Документ плана всех категорий
- [x] Раздел MCP + плитки + подробные модалки (brand icons, stages 6+7, links/hints)
- [x] Публикация GitHub Release **0.1.4** — https://github.com/sSamurai58/Mira-AI/releases/tag/v0.1.4 (tag `v0.1.4` @ `3493529`)
- [ ] MCP runtime / OAuth (не в 0.1.4; следующий релиз после явной команды)

## 2026-11-12 — Релиз 0.1.5 ✅

Ветка `cursor/release-0-1-5-6838` @ `f1b8424`. Пакет **0.1.5**.

- [x] Bump `package.json` / `package-lock.json` → 0.1.5 (`__MIRA_VERSION__` / UI)
- [x] In-app confirm modals (`AppConfirm` / `ConfirmModal`) вместо native `window.confirm`
- [x] Frameless themed `TitleBar` (window chrome follows theme tokens)
- [x] Integrations blank-UI fix (hide/show screen control, opaque shell, portal confirms, Settings hash)
- [x] ThemeSelect phrase-bind dropdown close fix (Voice Studio)
- [x] Публикация GitHub Release **0.1.5** — https://github.com/sSamurai58/Mira-AI/releases/tag/v0.1.5 (tag `v0.1.5` @ `f1b8424`)
- [ ] MCP runtime / OAuth (по-прежнему later; после явной команды)

## 2026-11-12 — Релиз 0.1.6 ✅

Ветка `cursor/release-0-1-6-6838` @ `8baa1da`. Пакет **0.1.6**. Latest GitHub Release.

- [x] Bump `package.json` / `package-lock.json` → 0.1.6 (`__MIRA_VERSION__` / UI)
- [x] Voice Studio «Обученные фразы» modal + CatalogEditModal → `createPortal(document.body)` (nav rail z-index)
- [x] Plain-language Voice Studio TTS curriculum / train report table
- [x] Voice Studio phrase generate: corpus word-frequency novelty — avoid recycling saturated words; cover missing prepositions/particles; diversify intonation seeds (`phraseNovelty.ts`)
- [x] Публикация GitHub Release **0.1.6** — https://github.com/sSamurai58/Mira-AI/releases/tag/v0.1.6 (tag `v0.1.6` @ `8baa1da`)
- [ ] MCP runtime / OAuth (по-прежнему later; после явной команды)

## 2026-11-13 — Релиз 0.1.13 ✅ (auto toast + Paths + ThemeSelect + 16 actions)

Ветка `cursor/release-0-1-13-6838` @ `dfdcfd9`. Пакет **0.1.13**. Latest GitHub Release.

- [x] Bump 0.1.13
- [x] Auto-check after `did-finish-load` (fix boot-timer race)
- [x] Push/re-check on window focus (throttled); session dismiss respected
- [x] Paths cards: brand-colored app icons + clearer hierarchy / tags / actions
- [x] Translator language dropdowns → ThemeSelect
- [x] Custom Commands: 16 action types (type/click/clipboard/paths/notify/window/terminal)
- [x] Публикация GitHub Release **0.1.13** — https://github.com/sSamurai58/Mira-AI/releases/tag/v0.1.13 (tag `v0.1.13` @ `dfdcfd9`)

## 2026-11-13 — Релиз 0.1.12 ✅ (TTS fix + Paths/Commands/Translator)

Ветка `cursor/release-0-1-12-6838` @ `c9e72d0`. Пакет **0.1.12**.

- [x] Bump 0.1.12
- [x] ElevenLabs: sniff MP3 vs JSON/PCM; default non-stream convert; `/stream` → convert fallback
- [x] Dialog playback: decode + speech-likeness gate; Web Speech fallback (no screech-only)
- [x] Neural vocoder noise → unit-stitch / Web Speech fallback
- [x] Home HUD: mic level only while listening (no speakers→mic feedback while TTS)
- [x] `elevenlabs:smoke` sniff asserts
- [x] Settings Updates: «История обновлений» 0.1.4–0.1.12
- [x] Workshop Paths: voice-tagged app/folder/file launchers
- [x] Workshop Custom Commands: voice triggers + action chains
- [x] Translator: Быстрый HTTP + Через ИИ
- [x] Публикация GitHub Release **0.1.12** — https://github.com/sSamurai58/Mira-AI/releases/tag/v0.1.12 (tag `v0.1.12` @ `c9e72d0`)

## 2026-11-13 — Релиз 0.1.11 ✅ (pack + update HUD)

Ветка `cursor/release-0-1-11-6838` @ `c124393`. Пакет **0.1.11**.

- [x] Bump 0.1.11
- [x] MCP runtime scaffolding + honest draft/connected + Tier A probes
- [x] ElevenLabs `/stream`, voice settings, voice list, IVC, Flash for short
- [x] Wake pluggable + Porcupine stub; barge-in hint; Home TTS status; mic bars
- [x] Auto-check updates + floating Mira HUD toast
- [x] EPUB ZIP/OPF; AV ASR best-effort; FTS memory; WebGL LOD; SendInput
- [x] Neural train worker; reimport+rebuild; post-train clip hint; docs sync
- [x] Публикация GitHub Release **0.1.11** — https://github.com/sSamurai58/Mira-AI/releases/tag/v0.1.11 (tag `v0.1.11` @ `c124393`)

## 2026-11-13 — Релиз 0.1.10 WIP (живое ядро + Home HUD)

Ветка `cursor/release-0-1-10-6838` от `v0.1.9`. Пакет **0.1.10**. **Не публиковать** без OK.

- [x] Bump 0.1.10
- [x] WebGL core: faster orbit/layer spin, idle luminance pulse, context-lost recovery, visibility resume
- [x] Home HUD: level aura + progress sheen, voice bars idle pulse (voice on), reply latency tick, live tiles
- [x] `prefers-reduced-motion`: slow drift instead of full freeze for core/HUD
- [ ] Publish GitHub Release — только после явного OK

## 2026-11-13 — Релиз 0.1.9 WIP (голографическое ядро)

Ветка `cursor/release-0-1-9-6838` от `v0.1.8`. Пакет **0.1.9**. **Не публиковать** без OK.

- [x] Bump 0.1.9
- [x] Port user WebGL2 holographic core → `src/ui/core/coreWebgl.ts` (+ shaders/geometry modules)
- [x] Mira level → visibility 0…4 (`miraLevelToHoloScale`: L1≈0.3, L5→2, L15→3.5, L50+→4)
- [x] Flash on level-up; reduced-motion slows spin/orbit
- [x] Reference HTML → `docs/mira-holo-core-ref.html`
- [ ] Publish GitHub Release — только после явного OK

## 2026-11-12 — Релиз 0.1.8 WIP (ElevenLabs TTS)

Ветка `cursor/release-0-1-8-6838` от tip 0.1.7. Пакет **0.1.8**. **Не публиковать** без OK.

- [x] Bump 0.1.8
- [x] Electron main: `POST /v1/text-to-speech/{voice_id}` + status (`electron/tts/elevenlabs.ts`)
- [x] Settings: ключ save/delete, Voice ID пресет `YjESejviApN7SHrbfnA2`, модель, тест, статус
- [x] Движок TTS `elevenlabs` (замена `edge-stub`); speak path в chat/voice
- [x] `.env.example` + Doctor finding; smoke `elevenlabs:smoke`
- [ ] Пользователь: **ELEVENLABS_API_KEY** из кабинета + план/кредиты + сеть
- [ ] Publish GitHub Release — только после явного OK

## 2026-11-12 — Релиз 0.1.7 ✅

Ветка `cursor/release-0-1-7-6838` @ `d75191a`. Пакет **0.1.7**. Latest GitHub Release.

Контекст: Voice Studio **нарезка** всё ещё резала слова рано/криво, **нет нормального сращивания** после 0.1.4 (`02ad96d`). Не про chat text templates.

- [x] Boundaries: speech-island map when gaps match words; else text-weighted prior + hysteresis valley/flux snap; onset/offset pad; min word duration; reject tiny crumbs
- [x] Stitch: zero-cross OLA, adaptive 22–55 ms crossfade, RMS level-match (`tts.ts` + `stitchPcmInt16OverlapAdd`)
- [x] UI note: после обновления — re-import + полная пересборка
- [x] p9 smoke: uneven words, tiny-slice reject, stitch RMS
- [x] Neural TTS curriculum: encoder/attention/decoder/stop/TF/Adam/vocoder/RLHF/CPU path — все «есть»; CUDA kernels честно optional
- [x] Inference: synthesizeCustomVoiceNeural + A/B RLHF IPC; docs/mira-tts-report-0.1.7.md
- [x] Chat diversity: anti-repeat для шаблонных Habarovsk/plan меню
- [x] Core level XP growth (фикс «застрял на 5»)
- [x] Публикация GitHub Release **0.1.7** — https://github.com/sSamurai58/Mira-AI/releases/tag/v0.1.7 (tag `v0.1.7` @ `d75191a`)

## Шаблон новой темы

```markdown
### YYYY-MM-DD — Краткий заголовок

Контекст / зачем.

- [ ] шаг
- [ ] шаг

Мысли:
- …

После merge в основные docs — удалить эту секцию.
```
