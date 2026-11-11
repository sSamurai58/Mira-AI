# Mira

Локальный голосовой ИИ-помощник. Источник правды по продукту — [`docs/`](./docs/).

## Фаза сейчас

**P7 — Терминал:** xterm + node-pty в Мастерской; команды из Диалога + confirm.  
**P6 — Мессенджеры** · **P5 — Экран/браузер** · **P4 — Web** · **P3–P0**.

Дорожная карта: [`docs/WIP.md`](./docs/WIP.md).

## Быстрый старт

```bash
cp .env.example .env
npm install
npm run db:check
npm run p7:smoke
npm run dev:electron
```

Smokes: `p1`…`p7`. Без `OPENAI_API_KEY` — **mock**.

Live Telegram: `TELEGRAM_BOT_TOKEN` + chat id.  
Terminal prefs: `TERMINAL_SHELL`, `TERMINAL_CWD`, `TERMINAL_FONT_SIZE`.

## Структура

- `electron/` — main/preload, store, tools, `terminal/`
- `src/ui/` — AppShell + TerminalView (xterm)
- `docs/` — PRD, DESIGN, RULES, MEMORY, WIP

Секреты только в `.env`.
