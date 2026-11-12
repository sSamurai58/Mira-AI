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

## Этапы UI (в 0.1.4)

В настройках MCP показываем **плитки приложений** для категорий:

| Этап UI | # из каталога | Категория |
|---------|---------------|-----------|
| **1** | 1 | Задачи и проекты |
| **2** | 2 | Календарь и время |
| **3** | 3 | Почта и коммуникации |
| **4** | 5 | Заметки и личная база |
| **5** | 8 | Офис и таблицы |
| **6** | 9 | CRM, продажи, финансы |
| **7** | 10 | Браузер и веб-продуктивность |

Каждая плитка: **логотип/иконка + название**. Клик → модалка с данными коннектора  
(описание, auth, env-ключи, примеры голосовых команд, статус этапа).

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

### 5. Заметки и личная база — этап UI 4
Apple Notes, Bear, Drafts, Mem, Reflect, локальные Markdown/PKM-папки, Obsidian, Logseq

### 6. Разработка — backlog
GitHub, GitLab, Bitbucket, VS Code/Cursor/JetBrains, Docker, K8s, Sentry, Datadog,  
Grafana, PagerDuty, Vercel, Netlify, Cloudflare, DB clients, Postman/Bruno

### 7. Дизайн и креатив — backlog
Figma, FigJam, Canva, Miro, Excalidraw, Blender (частично built-in), Resolve, ComfyUI

### 8. Офис и таблицы — этап UI 5
Google Sheets, Excel / Microsoft 365, Airtable, Smartsheet, Rows, Power BI, Metabase

### 9. CRM, продажи, финансы — этап UI 6
HubSpot, Salesforce, Pipedrive, amoCRM, Bitrix24, Stripe, QuickBooks, Xero, МойСклад, 1С

### 10. Браузер и веб — этап UI 7
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
- [x] Плитки этапов 1–7 (категории 1,2,3,5,8,9,10) с иконками
- [x] Модалка с данными коннектора
- [ ] Реальный MCP runtime / OAuth — **не** в 0.1.4 (следующий релиз после явной команды)

## Связанные docs

- `PRD.md` — capability MCP / F-MCP
- `DESIGN.md` — плитки как темы + модалка
- `MEMORY.md` — решение о каталоге этапов
- `WIP.md` — черновые заметки по runtime
