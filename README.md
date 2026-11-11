# Mira

Локальный голосовой ИИ-помощник. Источник правды по продукту — [`docs/`](./docs/).

## Фаза сейчас

**P6 — Мессенджеры:** Telegram send/reply + confirm; WA/IG stubs.  
**P5 — Экран/браузер** · **P4 — Web** · **P3 — Skills** · **P2 — Голос** · **P1 — чат** · **P0 — shell**.

Дорожная карта: [`docs/WIP.md`](./docs/WIP.md).

## Быстрый старт

```bash
cp .env.example .env
npm install
npm run db:check
npm run p1:smoke
npm run p2:smoke
npm run p3:smoke
npm run p4:smoke
npm run p5:smoke
npm run p6:smoke     # Telegram dry-run send/reply + confirm
npm run dev
npm run dev:electron
```

Без `OPENAI_API_KEY` используется **mock**. Для живой модели:

```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
OPENAI_API_KEY=sk-...
```

Для live Telegram:

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_DEFAULT_CHAT_ID=...
MESSAGING_MODE=live
```

Сборка: `npm run build && npm start`.

## Структура

- `electron/` — main/preload + SQLite + tools (web/screen/browser/messaging)
- `src/ui/` — React AppShell
- `docs/` — PRD, DESIGN, RULES, MEMORY, WIP

Секреты только в `.env` (не коммитить).
