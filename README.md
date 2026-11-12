# Mira

Локальный голосовой ИИ-помощник. Источник правды — [`docs/`](./docs/).

## Фаза сейчас

**P8 — Библиотека / обучение:** upload → анализ → `learned_units` → диалог; skill после confirm.  
**P7 — Терминал** · **P6 — TG** · **P5 — экран/браузер** · **P4–P0**.

Дорожная карта: [`docs/WIP.md`](./docs/WIP.md).

## Быстрый старт

```bash
cp .env.example .env
npm install
npm run p8:smoke
npm run dev:electron
```

Smokes: `p1`…`p8`. Без API-ключа — mock LLM.

## Windows (скачать с GitHub)

Сборка кладётся в `release/` и публикуется через Actions / Releases:

- архив: `Mira-<version>-windows-x64.zip` — распаковать → `Mira.exe`
- установщик NSIS: `Mira-<version>-windows-x64.exe` (собирается на `windows-latest`)

```bash
npm run pack:win
```

Артефакты: Actions → workflow **Windows installer** → `mira-windows`.  
Релизы по тегу `v*`: workflow **Release** (GitHub Releases).

## Структура

- `electron/library/` — import/extract/analyze/plan/skill
- `electron/terminal/` — PTY
- `src/ui/` — AppShell, LibraryPanel, TerminalView
- `docs/` — PRD, DESIGN, RULES, MEMORY, WIP
- `branding/` — SVG-логотипы
- `electron-builder.yml` — упаковка Windows/Linux/macOS

Секреты только в `.env`.
