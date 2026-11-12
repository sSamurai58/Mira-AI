# MCP — план подключений для продуктивности

Источник правды по **MCP-коннекторам** Mira (сайты и программы).  
UI каталога в **Настройки → MCP** (плитки как темы). Реализация идёт **по этапам**.

Связь: built-in tools (web/screen/browser/messaging/terminal/Blender) остаются;  
MCP — стандартный слой «подключи сервер → получи tools/resources».

## Принципы

1. Голосовые короткие команды + Confirm на опасные действия.
2. Сначала API/OAuth-коннекторы; UI-automation — только где нет API.
3. Секреты только через `.env` / безопасное хранилище настроек (RULES).
4. Не имитировать «подключено», пока нет реального MCP-runtime.
5. Этапы A → … закрываем по порядку; остальные категории — backlog.
6. Карточка коннектора должна быть **максимально понятной**: что делает Mira,
   3+ голосовых примера, где взять Client ID/token, официальные ссылки
   (`docsUrl` / `setupUrl` / `oauthHelpUrl` / `apiDocsUrl`), подсказки к полям
   (`hint` / `help`), для локальных приложений — `builtinHint`.

## Этапы UI (в 0.1.4)

В настройках MCP показываем **плитки приложений** для категорий  
(номера этапов = номера каталога; **4 Documents** пока backlog):

| Этап UI | # из каталога | Категория | Chip |
|---------|---------------|-----------|------|
| **1** | 1 | Задачи и проекты | Задачи |
| **2** | 2 | Календарь и время | Календарь |
| **3** | 3 | Почта и коммуникации | Почта |
| **5** | 5 | Заметки и личная база | Заметки |
| **6** | 6 | Разработка | Dev |
| **7** | 7 | Дизайн и креатив (Figma, Blender, …) | Дизайн |
| **8** | 8 | Офис и таблицы | Офис |
| **9** | 9 | CRM, продажи, финансы | CRM |
| **10** | 10 | Браузер и веб-продуктивность | Браузер |

Каждая плитка: **логотип/иконка + название**. Клик → модалка:

- длинное описание (`description`) + краткий `summary`;
- блок **Ссылки** (docs / setup / OAuth / API) — `target=_blank` + `rel=noopener`;
- **≥3** голосовых примера;
- поля подключения с `hint` (и опционально `help`);
- `builtinHint` (Telegram, Chrome, Blender/P10, …);
- футер: runtime/OAuth в 0.1.4 ещё не активны — только локальный черновик.

У каждого этапа в UI — короткий explainer (`blurb`) под заголовком секции.

## Полный каталог (roadmap)

### 1. Задачи и проекты — этап UI 1
Linear, Jira, Asana, ClickUp, Todoist, TickTick, Microsoft To Do, Things, OmniFocus,  
Notion (задачи), Coda, GitHub Projects, GitLab Issues, Plane, Height

### 2. Календарь и время — этап UI 2
Google Calendar, Outlook / Microsoft 365, Apple Calendar, Calendly, Cal.com,  
Clockify, Toggl, RescueTime

### 3. Почта и коммуникации — этап UI 3
Gmail, Outlook Mail, Slack, Discord, Microsoft Teams, Telegram, WhatsApp Business,  
Mattermost, Rocket.Chat, Intercom, Zendesk, Help Scout

### 4. Документы и знания — backlog
Google Docs/Drive, Word/OneDrive/SharePoint, Notion, Obsidian, Logseq, RemNote,  
Confluence, Outline, BookStack, Dropbox, Box

### 5. Заметки и личная база — этап UI 5
Apple Notes, Bear, Drafts, Mem, Reflect, локальные Markdown/PKM-папки, Obsidian, Logseq

### 6. Разработка — этап UI 6
GitHub, GitLab, Bitbucket, VS Code/Cursor/JetBrains, Docker, K8s, Sentry, Datadog,  
Grafana, PagerDuty, Vercel, Netlify, Cloudflare, DB clients, Postman/Bruno

### 7. Дизайн и креатив — этап UI 7
Figma, FigJam, Canva, Miro, Excalidraw, **Blender** (built-in / P10 + путь к бинарнику;
ссылки blender.org / Blender Python API), Resolve, ComfyUI

### 8. Офис и таблицы — этап UI 8
Google Sheets, Excel / Microsoft 365, Airtable, Smartsheet, Rows, Power BI, Metabase

### 9. CRM, продажи, финансы — этап UI 9
HubSpot, Salesforce, Pipedrive, amoCRM, Bitrix24, Stripe, QuickBooks, Xero, МойСклад, 1С

### 10. Браузер и веб — этап UI 10
Chrome, Edge, Firefox, Brave/Arc, Raindrop, Pocket, Readwise, Typeform, Google Forms  
(+ усиление built-in browser tools Mira)

### 11. Файлы и ОС — backlog
Finder/Explorer, Spotlight/Everything, Raycast/Alfred, clipboard, PDF/OCR

### 12. Встречи — backlog
Zoom, Google Meet, Teams, Telemost, Otter/Fireflies/Grain

### 13. Обучение и контент — backlog
Anki, YouTube/podcasts, Coursera folders, Zotero, Mendeley

### 14. Дом / рутина — backlog
Home Assistant, Spotify/Яндекс Музыка, Maps/2GIS

### 15. Мосты-автоматизации — backlog
Zapier, Make, n8n, Activepieces, Shortcuts, Power Automate, AHK

## Приоритет продукта (Tier)

**Tier A:** файлы, календарь, задачи, почта, Slack/Telegram, GitHub, браузер, Notion/Obsidian  
**Tier B:** Sheets/Excel, Drive, Figma, Jira, Meet+транскрипт, Docker/Sentry, Bitrix/1С  
**Tier C:** нишевые (CRM deep, BI, smart home, research)

## Статусы реализации

| Статус | Значение |
|--------|----------|
| `catalog` | Плитка и модалка в UI (0.1.4) |
| `planned` | В roadmap, без runtime |
| `wiring` | MCP client + OAuth/env |
| `partial` | Tools работают на happy-path |
| `done` | Продакшен-контур + Confirm + голос |

## Критерий 0.1.4

- [x] Документ-план (`docs/MCP.md`)
- [x] Раздел **Настройки → MCP**
- [x] Плитки этапов 1,2,3,5,6,7,8,9,10 (вкл. Dev + Design/Blender) с brand-иконками
- [x] Модалка: описание, ≥3 voice examples, hints полей, внешние ссылки, `builtinHint`, draft-only footer
- [ ] Реальный MCP runtime / OAuth — **не** в 0.1.4 (следующий релиз после явной команды)

## Связанные docs

- `PRD.md` — capability MCP / F-MCP
- `DESIGN.md` — плитки как темы + модалка
- `MEMORY.md` — решение о каталоге этапов
- `WIP.md` — черновые заметки по runtime
