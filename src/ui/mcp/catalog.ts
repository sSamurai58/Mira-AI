/** MCP connector catalog for Settings → MCP (staged by docs/MCP.md catalog #). */

export type McpAuthKind = "oauth" | "api-key" | "local" | "bridge";

export type McpConnectorStatus =
  | "catalog"
  | "planned"
  | "wiring"
  | "partial"
  | "done";

/** Matches docs/MCP.md section numbers (4 docs still backlog). */
export type McpStageId = 1 | 2 | 3 | 5 | 6 | 7 | 8 | 9 | 10;

export type McpCategoryId =
  | "tasks"
  | "calendar"
  | "comms"
  | "notes"
  | "dev"
  | "design"
  | "office"
  | "crm"
  | "browser";

export type McpIconId =
  | "todoist"
  | "linear"
  | "notion"
  | "asana"
  | "clickup"
  | "jira"
  | "ms-todo"
  | "ticktick"
  | "gcal"
  | "outlook"
  | "apple-cal"
  | "calendly"
  | "toggl"
  | "gmail"
  | "slack"
  | "telegram"
  | "discord"
  | "teams"
  | "whatsapp"
  | "obsidian"
  | "apple-notes"
  | "bear"
  | "logseq"
  | "mem"
  | "github"
  | "gitlab"
  | "vscode"
  | "docker"
  | "sentry"
  | "vercel"
  | "figma"
  | "canva"
  | "miro"
  | "blender"
  | "excalidraw"
  | "gsheets"
  | "excel"
  | "gdocs"
  | "airtable"
  | "onedrive"
  | "hubspot"
  | "salesforce"
  | "amocrm"
  | "bitrix"
  | "stripe"
  | "chrome"
  | "firefox"
  | "edge"
  | "raindrop"
  | "pocket";

/** Credential / path field shown in the connector modal. */
export type McpEnvField = {
  key: string;
  /** One-line hint under the input (where to get the value). */
  hint: string;
  /** Optional longer help paragraph. */
  help?: string;
};

export type McpConnector = {
  id: string;
  name: string;
  icon: McpIconId;
  color: string;
  category: McpCategoryId;
  stage: McpStageId;
  status: McpConnectorStatus;
  auth: McpAuthKind;
  /** Short line under the tile / modal header. */
  summary: string;
  /** Detailed Russian explanation of what Mira will do. */
  description: string;
  envFields: McpEnvField[];
  /** At least three natural voice examples. */
  voiceExamples: string[];
  /** Product / overview docs. */
  docsUrl?: string;
  /** Setup / getting-started guide. */
  setupUrl?: string;
  /** OAuth app / consent console. */
  oauthHelpUrl?: string;
  /** API reference for tokens / scopes. */
  apiDocsUrl?: string;
  /** Built-in Mira tool already covers part of this. */
  builtinHint?: string;
};

/** @deprecated Prefer `envFields`; kept for drafts that keyed by env name. */
export function connectorEnvKeys(c: McpConnector): string[] {
  return c.envFields.map((f) => f.key);
}

export type McpStageMeta = {
  stage: McpStageId;
  category: McpCategoryId;
  catalogNo: number;
  title: string;
  chip: string;
  blurb: string;
};

export const MCP_STAGES: McpStageMeta[] = [
  {
    stage: 1,
    category: "tasks",
    catalogNo: 1,
    title: "Задачи и проекты",
    chip: "Задачи",
    blurb:
      "Mira создаёт и читает тикеты в трекерах — голосом «создай задачу» или «что в спринте». Сначала OAuth/API, без кликера по UI.",
  },
  {
    stage: 2,
    category: "calendar",
    catalogNo: 2,
    title: "Календарь и время",
    chip: "Календарь",
    blurb:
      "Встречи, свободные окна и трекинг времени. Confirm перед переносом или отменой чужих событий.",
  },
  {
    stage: 3,
    category: "comms",
    catalogNo: 3,
    title: "Почта и коммуникации",
    chip: "Почта",
    blurb:
      "Письма и чаты (Slack, Teams, Telegram…). Отправка — только после Confirm; черновики можно готовить голосом.",
  },
  {
    stage: 5,
    category: "notes",
    catalogNo: 5,
    title: "Заметки и личная база",
    chip: "Заметки",
    blurb:
      "PKM и быстрый захват рядом с памятью Mira: локальные vault’ы, OS Notes, AI-заметки.",
  },
  {
    stage: 6,
    category: "dev",
    catalogNo: 6,
    title: "Разработка",
    chip: "Dev",
    blurb:
      "GitHub/GitLab, IDE, Docker и observability. Токены с минимальными scope; деплой/force-push — только Confirm.",
  },
  {
    stage: 7,
    category: "design",
    catalogNo: 7,
    title: "Дизайн и креатив",
    chip: "Дизайн",
    blurb:
      "Figma, Canva, Miro, Excalidraw и Blender (вкл. built-in bpy bridge). Экспорт и правки — по явной команде.",
  },
  {
    stage: 8,
    category: "office",
    catalogNo: 8,
    title: "Офис и таблицы",
    chip: "Офис",
    blurb:
      "Sheets/Excel, Docs, Airtable, OneDrive: чтение сводок и аккуратная запись строк с подтверждением.",
  },
  {
    stage: 9,
    category: "crm",
    catalogNo: 9,
    title: "CRM, продажи, финансы",
    chip: "CRM",
    blurb:
      "Сделки, контакты и платежные статусы. Изменение воронки и списания — всегда с Confirm.",
  },
  {
    stage: 10,
    category: "browser",
    catalogNo: 10,
    title: "Браузер и веб",
    chip: "Браузер",
    blurb:
      "Вкладки, закладки и read-later поверх built-in browser tools Mira — без подмены «уже подключено».",
  },
];

export const MCP_CONNECTORS: McpConnector[] = [
  // ─── 1 tasks ─────────────────────────────────────────────
  {
    id: "todoist",
    name: "Todoist",
    icon: "todoist",
    color: "#E44332",
    category: "tasks",
    stage: 1,
    status: "catalog",
    auth: "oauth",
    summary: "Личные и командные задачи, проекты, сегодня/неделя.",
    description:
      "Mira читает проекты и секции Todoist, создаёт задачи с дедлайном и приоритетом, отмечает выполненное. Удобно для «добавь на сегодня» и обзора недели голосом. В 0.1.4 — только черновик полей; runtime/OAuth подключатся позже.",
    envFields: [
      {
        key: "MCP_TODOIST_TOKEN",
        hint: "API token из Todoist → Settings → Integrations → Developer",
        help: "Личный API token (не пароль). Для OAuth-приложения позже понадобится Client ID из того же раздела.",
      },
    ],
    voiceExamples: [
      "Добавь в Todoist купить молоко на сегодня",
      "Что у меня в Todoist на эту неделю?",
      "Отметь в Todoist задачу про отчёт как выполненную",
    ],
    docsUrl: "https://www.todoist.com/help",
    setupUrl: "https://developer.todoist.com/guides/#authorization",
    apiDocsUrl: "https://developer.todoist.com/rest/v2/",
    oauthHelpUrl: "https://developer.todoist.com/appconsole.html",
  },
  {
    id: "linear",
    name: "Linear",
    icon: "linear",
    color: "#5E6AD2",
    category: "tasks",
    stage: 1,
    status: "catalog",
    auth: "api-key",
    summary: "Инженерные тикеты, циклы, статусы команд.",
    description:
      "Mira работает с issues Linear: создание, смена статуса, список In Progress / мой цикл. Подходит для инженерных команд. Ключ — Personal API key с нужными scope.",
    envFields: [
      {
        key: "MCP_LINEAR_API_KEY",
        hint: "Settings → API → Personal API keys в Linear",
        help: "Создайте ключ с доступом к Issues. Не коммитьте ключ в git — только в локальный черновик / .env.",
      },
    ],
    voiceExamples: [
      "Создай issue в Linear: починить автообновление",
      "Какие у меня Linear issues в In Progress?",
      "Переведи тикет про MCP в Done",
    ],
    docsUrl: "https://linear.app/docs",
    setupUrl: "https://linear.app/settings/api",
    apiDocsUrl: "https://developers.linear.app/docs/graphql/working-with-the-graphql-api",
  },
  {
    id: "notion-tasks",
    name: "Notion",
    icon: "notion",
    color: "#000000",
    category: "tasks",
    stage: 1,
    status: "catalog",
    auth: "oauth",
    summary: "Базы и task-доски Notion как рабочий трекер.",
    description:
      "Mira подключается к базам Notion (task-доски, бэклог): добавляет страницы-задачи, читает статусы. Нужна интеграция с доступом к нужным databases. Секреты — только локально.",
    envFields: [
      {
        key: "MCP_NOTION_TOKEN",
        hint: "Internal Integration Token из notion.so/my-integrations",
        help: "Создайте integration, выдайте доступ к нужным страницам/базам (Share → Invite).",
      },
    ],
    voiceExamples: [
      "Добавь задачу в Notion: подготовить отчёт",
      "Покажи открытые задачи из Notion",
      "Поставь в Notion дедлайн на пятницу для задачи про релиз",
    ],
    docsUrl: "https://www.notion.so/help/integrations",
    setupUrl: "https://www.notion.so/my-integrations",
    apiDocsUrl: "https://developers.notion.com/reference/intro",
    oauthHelpUrl: "https://developers.notion.com/docs/authorization",
  },
  {
    id: "asana",
    name: "Asana",
    icon: "asana",
    color: "#F06A6A",
    category: "tasks",
    stage: 1,
    status: "catalog",
    auth: "oauth",
    summary: "Проекты, assignee, дедлайны для команд.",
    description:
      "Mira создаёт задачи в проектах Asana, назначает людей и дедлайны, читает «мои задачи на сегодня». Для продакшена предпочтителен OAuth-приложение; для черновика можно Personal Access Token.",
    envFields: [
      {
        key: "MCP_ASANA_TOKEN",
        hint: "Personal Access Token: Asana → My Settings → Apps",
        help: "Или OAuth Client ID из developer console — когда runtime включит OAuth-flow.",
      },
    ],
    voiceExamples: [
      "Поставь задачу в Asana на пятницу",
      "Что у меня в Asana на этой неделе?",
      "Назначь задачу в Asana на Ивана: подготовить демо",
    ],
    docsUrl: "https://asana.com/guide",
    setupUrl: "https://app.asana.com/0/my-apps",
    apiDocsUrl: "https://developers.asana.com/docs/overview",
    oauthHelpUrl: "https://developers.asana.com/docs/oauth",
  },
  {
    id: "clickup",
    name: "ClickUp",
    icon: "clickup",
    color: "#7B68EE",
    category: "tasks",
    stage: 1,
    status: "catalog",
    auth: "api-key",
    summary: "Универсальный workspace: задачи, доски, docs.",
    description:
      "Mira добавляет задачи в списки ClickUp, читает статусы и дедлайны. Укажите workspace/list в заметках модалки — так проще целиться голосом.",
    envFields: [
      {
        key: "MCP_CLICKUP_TOKEN",
        hint: "Settings → Apps → API Token в ClickUp",
      },
    ],
    voiceExamples: [
      "Создай задачу в ClickUp: созвон с клиентом",
      "Покажи просроченные задачи ClickUp",
      "Перенеси задачу ClickUp в колонку Review",
    ],
    docsUrl: "https://help.clickup.com/",
    setupUrl: "https://app.clickup.com/settings/apps",
    apiDocsUrl: "https://clickup.com/api/",
  },
  {
    id: "jira",
    name: "Jira",
    icon: "jira",
    color: "#2684FF",
    category: "tasks",
    stage: 1,
    status: "catalog",
    auth: "oauth",
    summary: "Классический issue-tracker Atlassian.",
    description:
      "Mira работает с Jira Cloud: issues, спринты, переходы статусов. Нужны email + API token + базовый URL сайта (например https://your-domain.atlassian.net).",
    envFields: [
      {
        key: "MCP_JIRA_EMAIL",
        hint: "Email аккаунта Atlassian",
      },
      {
        key: "MCP_JIRA_TOKEN",
        hint: "API token: id.atlassian.com → Security → API tokens",
        help: "Создайте token и используйте вместе с email как Basic auth (пока нет OAuth runtime).",
      },
      {
        key: "MCP_JIRA_BASE_URL",
        hint: "https://your-domain.atlassian.net",
      },
    ],
    voiceExamples: [
      "Открой мой спринт в Jira",
      "Создай баг в Jira: пустой экран после клика",
      "Какие у меня Jira issues In Progress?",
    ],
    docsUrl: "https://support.atlassian.com/jira-software-cloud/",
    setupUrl: "https://id.atlassian.com/manage-profile/security/api-tokens",
    apiDocsUrl: "https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/",
    oauthHelpUrl: "https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/",
  },
  {
    id: "ms-todo",
    name: "Microsoft To Do",
    icon: "ms-todo",
    color: "#2564CF",
    category: "tasks",
    stage: 1,
    status: "catalog",
    auth: "oauth",
    summary: "Списки дел Microsoft 365 / Outlook.",
    description:
      "Mira добавляет задачи в списки Microsoft To Do через Microsoft Graph. Нужна регистрация приложения в Azure Entra ID (Client ID) с делегированными правами Tasks.ReadWrite.",
    envFields: [
      {
        key: "MCP_MS_TODO_CLIENT_ID",
        hint: "Application (client) ID из portal.azure.com → App registrations",
        help: "Добавьте redirect URI для будущего OAuth Mira и permission Microsoft Graph → Tasks.ReadWrite.",
      },
    ],
    voiceExamples: [
      "Добавь в To Do позвонить маме",
      "Что в Microsoft To Do на сегодня?",
      "Отметь задачу в To Do как выполненную",
    ],
    docsUrl: "https://to-do.office.com/tasks",
    setupUrl: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps",
    apiDocsUrl: "https://learn.microsoft.com/en-us/graph/api/resources/todo-overview",
    oauthHelpUrl: "https://learn.microsoft.com/en-us/graph/auth-v2-user",
  },
  {
    id: "ticktick",
    name: "TickTick",
    icon: "ticktick",
    color: "#4772FA",
    category: "tasks",
    stage: 1,
    status: "catalog",
    auth: "oauth",
    summary: "Задачи + календарь + привычки.",
    description:
      "Mira читает и создаёт задачи TickTick, смотрит план на день/завтра. OAuth-приложение регистрируется на developer.ticktick.com.",
    envFields: [
      {
        key: "MCP_TICKTICK_TOKEN",
        hint: "Access token / Client credentials из TickTick Open API",
      },
    ],
    voiceExamples: [
      "Что в TickTick на завтра?",
      "Добавь в TickTick привычку: 20 минут английского",
      "Перенеси задачу TickTick на понедельник",
    ],
    docsUrl: "https://www.ticktick.com/",
    setupUrl: "https://developer.ticktick.com/manage",
    apiDocsUrl: "https://developer.ticktick.com/docs",
  },

  // ─── 2 calendar ──────────────────────────────────────────
  {
    id: "google-calendar",
    name: "Google Calendar",
    icon: "gcal",
    color: "#4285F4",
    category: "calendar",
    stage: 2,
    status: "catalog",
    auth: "oauth",
    summary: "События, свободные окна, напоминания.",
    description:
      "Mira показывает расписание дня, создаёт и переносит события Google Calendar. Нужен OAuth Client ID в Google Cloud Console с Calendar API. Перенос/удаление — с Confirm.",
    envFields: [
      {
        key: "MCP_GOOGLE_CALENDAR_CLIENT_ID",
        hint: "OAuth 2.0 Client ID (Desktop/Web) из Google Cloud Console",
        help: "Включите Google Calendar API, создайте OAuth consent screen, добавьте Client ID сюда (secret — отдельно в безопасное хранилище).",
      },
    ],
    voiceExamples: [
      "Что у меня в календаре сегодня?",
      "Поставь встречу на завтра в 15:00",
      "Есть ли свободное окно после обеда?",
    ],
    docsUrl: "https://support.google.com/calendar",
    setupUrl: "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com",
    apiDocsUrl: "https://developers.google.com/calendar/api/v3/reference",
    oauthHelpUrl: "https://developers.google.com/identity/protocols/oauth2",
  },
  {
    id: "outlook-calendar",
    name: "Outlook Calendar",
    icon: "outlook",
    color: "#0078D4",
    category: "calendar",
    stage: 2,
    status: "catalog",
    auth: "oauth",
    summary: "Календарь Microsoft 365 / Outlook.",
    description:
      "События Outlook / Microsoft 365 через Graph API. Client ID из Azure App Registration с Calendars.ReadWrite.",
    envFields: [
      {
        key: "MCP_OUTLOOK_CLIENT_ID",
        hint: "Azure App Registration → Application (client) ID",
        help: "Права: Calendars.ReadWrite (delegated). Один Client ID можно позже разделить с Outlook Mail.",
      },
    ],
    voiceExamples: [
      "Перенеси встречу Outlook на час позже",
      "Что в Outlook Calendar на пятницу?",
      "Создай встречу Outlook: синк с командой на 11:00",
    ],
    docsUrl: "https://support.microsoft.com/outlook",
    setupUrl: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps",
    apiDocsUrl: "https://learn.microsoft.com/en-us/graph/api/resources/calendar",
    oauthHelpUrl: "https://learn.microsoft.com/en-us/graph/auth/",
  },
  {
    id: "apple-calendar",
    name: "Apple Calendar",
    icon: "apple-cal",
    color: "#FF3B30",
    category: "calendar",
    stage: 2,
    status: "catalog",
    auth: "local",
    summary: "Локальный/iCloud календарь через OS bridge.",
    description:
      "На macOS Mira будет ходить в Calendar через OS bridge (EventKit / automation), без облачного Client ID. На Windows этот коннектор — заглушка каталога.",
    envFields: [],
    voiceExamples: [
      "Добавь в Apple Calendar тренировку",
      "Что в Apple Calendar на выходные?",
      "Перенеси событие Apple Calendar на час позже",
    ],
    docsUrl: "https://support.apple.com/calendar",
    setupUrl: "https://support.apple.com/guide/calendar/welcome/mac",
    builtinHint: "Локальный bridge — без API-ключа; доступ через разрешения ОС.",
  },
  {
    id: "calendly",
    name: "Calendly",
    icon: "calendly",
    color: "#006BFF",
    category: "calendar",
    stage: 2,
    status: "catalog",
    auth: "api-key",
    summary: "Публичные слоты и scheduled events.",
    description:
      "Mira читает scheduled events и типы встреч Calendly. Personal Access Token создаётся в интеграциях Calendly.",
    envFields: [
      {
        key: "MCP_CALENDLY_TOKEN",
        hint: "Personal Access Token: Calendly → Integrations → API & Webhooks",
      },
    ],
    voiceExamples: [
      "Какие встречи Calendly на этой неделе?",
      "Есть ли свободные слоты Calendly завтра?",
      "Отмени встречу Calendly с клиентом (с подтверждением)",
    ],
    docsUrl: "https://help.calendly.com/",
    setupUrl: "https://calendly.com/integrations/api_webhooks",
    apiDocsUrl: "https://developer.calendly.com/api-docs",
  },
  {
    id: "toggl",
    name: "Toggl Track",
    icon: "toggl",
    color: "#E57CD8",
    category: "calendar",
    stage: 2,
    status: "catalog",
    auth: "api-key",
    summary: "Трекинг времени по проектам.",
    description:
      "Старт/стоп таймеров и сводки по проектам Toggl Track. API token — в профиле Toggl (не пароль).",
    envFields: [
      {
        key: "MCP_TOGGL_TOKEN",
        hint: "Profile Settings → API Token в track.toggl.com",
      },
    ],
    voiceExamples: [
      "Старт таймера Toggl на Mira UI",
      "Сколько часов Toggl на этой неделе?",
      "Останови текущий таймер Toggl",
    ],
    docsUrl: "https://support.toggl.com/en/collections/2215275-toggl-track",
    setupUrl: "https://track.toggl.com/profile",
    apiDocsUrl: "https://developers.track.toggl.com/docs/",
  },

  // ─── 3 comms ─────────────────────────────────────────────
  {
    id: "gmail",
    name: "Gmail",
    icon: "gmail",
    color: "#EA4335",
    category: "comms",
    stage: 3,
    status: "catalog",
    auth: "oauth",
    summary: "Чтение, черновики, отправка писем (с Confirm).",
    description:
      "Mira читает входящие, готовит черновики и отправляет письма только после Confirm. В Google Cloud включите Gmail API и создайте OAuth Client ID.",
    envFields: [
      {
        key: "MCP_GMAIL_CLIENT_ID",
        hint: "OAuth Client ID из Google Cloud → Credentials",
        help: "Scopes: gmail.readonly + gmail.compose (отправка — отдельно и с Confirm).",
      },
    ],
    voiceExamples: [
      "Прочитай последние письма от Анны",
      "Напиши черновик в Gmail: итоги недели",
      "Есть ли непрочитанные письма с пометкой Important?",
    ],
    docsUrl: "https://support.google.com/mail",
    setupUrl: "https://console.cloud.google.com/apis/library/gmail.googleapis.com",
    apiDocsUrl: "https://developers.google.com/gmail/api/reference/rest",
    oauthHelpUrl: "https://developers.google.com/gmail/api/auth/about-auth",
  },
  {
    id: "outlook-mail",
    name: "Outlook Mail",
    icon: "outlook",
    color: "#0078D4",
    category: "comms",
    stage: 3,
    status: "catalog",
    auth: "oauth",
    summary: "Корпоративная почта Microsoft 365.",
    description:
      "Чтение и черновики Outlook через Microsoft Graph. Тот же Azure Client ID, что и для календаря, с Mail.Read / Mail.Send.",
    envFields: [
      {
        key: "MCP_OUTLOOK_CLIENT_ID",
        hint: "Azure Application (client) ID с правами Mail.*",
      },
    ],
    voiceExamples: [
      "Есть ли срочные письма в Outlook?",
      "Подготовь черновик Outlook: ответ клиенту",
      "Найди в Outlook письмо про договор",
    ],
    docsUrl: "https://support.microsoft.com/outlook",
    setupUrl: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps",
    apiDocsUrl: "https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview",
    oauthHelpUrl: "https://learn.microsoft.com/en-us/graph/auth-v2-user",
  },
  {
    id: "slack",
    name: "Slack",
    icon: "slack",
    color: "#4A154B",
    category: "comms",
    stage: 3,
    status: "catalog",
    auth: "oauth",
    summary: "Каналы, DM, поиск по workspace.",
    description:
      "Mira пишет в каналы/DM и ищет сообщения. Нужен Bot Token (xoxb-…) из Slack App с scopes chat:write, channels:history и т.п. Публичные посты — с Confirm.",
    envFields: [
      {
        key: "MCP_SLACK_BOT_TOKEN",
        hint: "Bot User OAuth Token (xoxb-…) из api.slack.com/apps",
        help: "Создайте Slack App → OAuth & Permissions → Install to Workspace. User token — только если нужен поиск от имени пользователя.",
      },
    ],
    voiceExamples: [
      "Напиши в Slack #mira: сборка готова",
      "Что писали в Slack про релиз 0.1.4?",
      "Отправь DM в Slack Анне: встретимся в 16:00",
    ],
    docsUrl: "https://slack.com/help",
    setupUrl: "https://api.slack.com/apps",
    apiDocsUrl: "https://api.slack.com/methods",
    oauthHelpUrl: "https://api.slack.com/authentication/oauth-v2",
  },
  {
    id: "telegram",
    name: "Telegram",
    icon: "telegram",
    color: "#26A5E4",
    category: "comms",
    stage: 3,
    status: "catalog",
    auth: "api-key",
    summary: "Bot API / усиление built-in messaging Mira.",
    description:
      "Отправка и чтение через Telegram Bot API. Токен выдаёт @BotFather. Часть сценариев уже есть в Интеграциях Mira — MCP усилит единый каталог tools.",
    envFields: [
      {
        key: "TELEGRAM_BOT_TOKEN",
        hint: "Токен от @BotFather (/newbot или /token)",
      },
    ],
    voiceExamples: [
      "Отправь в Telegram Ивану: буду через 10 минут",
      "Прочитай последние сообщения бота в Telegram",
      "Напиши в Telegram-группу статус релиза",
    ],
    docsUrl: "https://core.telegram.org/bots",
    setupUrl: "https://core.telegram.org/bots/tutorial",
    apiDocsUrl: "https://core.telegram.org/bots/api",
    builtinHint: "Частично уже в Интеграциях (Telegram Bot).",
  },
  {
    id: "discord",
    name: "Discord",
    icon: "discord",
    color: "#5865F2",
    category: "comms",
    stage: 3,
    status: "catalog",
    auth: "api-key",
    summary: "Серверы, каналы, уведомления.",
    description:
      "Посты и уведомления в каналы Discord через Bot Token. Создайте приложение на Discord Developer Portal и пригласите бота на сервер.",
    envFields: [
      {
        key: "MCP_DISCORD_BOT_TOKEN",
        hint: "Bot Token из Discord Developer Portal → Bot",
      },
    ],
    voiceExamples: [
      "Постни в Discord #updates краткий статус",
      "Напиши в Discord #dev: CI зелёный",
      "Есть ли упоминания меня в Discord за сутки?",
    ],
    docsUrl: "https://support.discord.com/",
    setupUrl: "https://discord.com/developers/applications",
    apiDocsUrl: "https://discord.com/developers/docs/intro",
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    icon: "teams",
    color: "#5059C9",
    category: "comms",
    stage: 3,
    status: "catalog",
    auth: "oauth",
    summary: "Чаты и каналы Teams.",
    description:
      "Сообщения в чаты/каналы Teams через Graph или Bot Framework. Client ID Azure с Chat.ReadWrite / ChannelMessage.Send.",
    envFields: [
      {
        key: "MCP_TEAMS_CLIENT_ID",
        hint: "Azure App Registration Client ID для Teams/Graph",
      },
    ],
    voiceExamples: [
      "Напиши в Teams: созвон переносим",
      "Что нового в канале Teams Engineering?",
      "Отправь в Teams Анне краткий апдейт",
    ],
    docsUrl: "https://support.microsoft.com/teams",
    setupUrl: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps",
    apiDocsUrl: "https://learn.microsoft.com/en-us/graph/api/resources/teams-api-overview",
    oauthHelpUrl: "https://learn.microsoft.com/en-us/microsoftteams/platform/graph-api/proactive-bots-and-messages/graph-proactive-bots-and-messages",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    icon: "whatsapp",
    color: "#25D366",
    category: "comms",
    stage: 3,
    status: "catalog",
    auth: "api-key",
    summary: "WhatsApp Business API (не личный неофициальный клиент).",
    description:
      "Только официальный WhatsApp Cloud / Business API (Meta). Нужны Permanent token и Phone number ID из Meta Developer Console. Личный WhatsApp Web не поддерживается.",
    envFields: [
      {
        key: "MCP_WHATSAPP_TOKEN",
        hint: "System User / Permanent token из Meta Business",
      },
      {
        key: "MCP_WHATSAPP_PHONE_ID",
        hint: "Phone number ID из WhatsApp → API Setup",
      },
    ],
    voiceExamples: [
      "Отправь в WhatsApp клиенту подтверждение",
      "Есть ли непрочитанные WhatsApp Business сообщения?",
      "Напиши в WhatsApp шаблон «заказ готов»",
    ],
    docsUrl: "https://developers.facebook.com/docs/whatsapp/overview",
    setupUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
    apiDocsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api/reference",
  },

  // ─── 5 notes ─────────────────────────────────────────────
  {
    id: "obsidian",
    name: "Obsidian",
    icon: "obsidian",
    color: "#7C3AED",
    category: "notes",
    stage: 5,
    status: "catalog",
    auth: "local",
    summary: "Локальный vault Markdown как память рядом с Mira.",
    description:
      "Mira пишет и ищет заметки в локальном vault Obsidian (папка Markdown). Укажите абсолютный путь к vault. Официальный Local REST API / community MCP — опционально позже.",
    envFields: [
      {
        key: "MCP_OBSIDIAN_VAULT_PATH",
        hint: "Абсолютный путь к папке vault, например /Users/you/Notes",
      },
    ],
    voiceExamples: [
      "Запиши в Obsidian идею про MCP плитки",
      "Найди в Obsidian заметки про релиз",
      "Создай в Obsidian daily note на сегодня",
    ],
    docsUrl: "https://help.obsidian.md/",
    setupUrl: "https://help.obsidian.md/Getting+started/Create+a+vault",
    apiDocsUrl: "https://coddingtonbear.github.io/obsidian-local-rest-api/",
  },
  {
    id: "apple-notes",
    name: "Apple Notes",
    icon: "apple-notes",
    color: "#FFD60A",
    category: "notes",
    stage: 5,
    status: "catalog",
    auth: "local",
    summary: "Быстрые заметки через OS bridge.",
    description:
      "Создание и поиск заметок Apple Notes на macOS через automation/OS bridge. API-ключ не нужен — нужны разрешения автоматизации.",
    envFields: [],
    voiceExamples: [
      "Создай заметку Apple Notes: список покупок",
      "Найди в Apple Notes заметку про паспорт",
      "Добавь в Apple Notes пункт: позвонить в банк",
    ],
    docsUrl: "https://support.apple.com/notes",
    setupUrl: "https://support.apple.com/guide/notes/welcome/mac",
    builtinHint: "Локальный OS bridge — без облачного токена.",
  },
  {
    id: "bear",
    name: "Bear",
    icon: "bear",
    color: "#C65E4A",
    category: "notes",
    stage: 5,
    status: "catalog",
    auth: "bridge",
    summary: "Markdown-заметки macOS/iOS.",
    description:
      "Быстрый захват в Bear через x-callback-url / automation bridge. Отдельный API-ключ обычно не требуется.",
    envFields: [],
    voiceExamples: [
      "Добавь в Bear черновик поста",
      "Найди в Bear заметки с тегом mira",
      "Создай в Bear заметку: идеи для демо",
    ],
    docsUrl: "https://bear.app/faq/",
    setupUrl: "https://bear.app/faq/X-callback-url%20Scheme%20documentation/",
  },
  {
    id: "logseq",
    name: "Logseq",
    icon: "logseq",
    color: "#86C0FF",
    category: "notes",
    stage: 5,
    status: "catalog",
    auth: "local",
    summary: "Outliner / graph PKM.",
    description:
      "Добавление блоков и поиск по локальному графу Logseq. Укажите путь к папке графа (graph).",
    envFields: [
      {
        key: "MCP_LOGSEQ_GRAPH_PATH",
        hint: "Путь к папке Logseq graph на диске",
      },
    ],
    voiceExamples: [
      "Добавь в Logseq блок про релиз 0.1.4",
      "Найди в Logseq упоминания MCP",
      "Открой сегодняшний journal в Logseq",
    ],
    docsUrl: "https://docs.logseq.com/",
    setupUrl: "https://docs.logseq.com/#/page/Terms",
  },
  {
    id: "mem",
    name: "Mem",
    icon: "mem",
    color: "#111111",
    category: "notes",
    stage: 5,
    status: "catalog",
    auth: "api-key",
    summary: "AI-заметки с быстрым захватом.",
    description:
      "Быстрый захват мыслей в Mem через API key из настроек аккаунта Mem.",
    envFields: [
      {
        key: "MCP_MEM_API_KEY",
        hint: "API key из настроек Mem (Integrations / API)",
      },
    ],
    voiceExamples: [
      "Сохрани в Mem: созвон про MCP",
      "Найди в Mem заметки про клиента",
      "Добавь в Mem follow-up после демо",
    ],
    docsUrl: "https://get.mem.ai/",
    setupUrl: "https://docs.mem.ai/",
    apiDocsUrl: "https://docs.mem.ai/",
  },

  // ─── 6 development ───────────────────────────────────────
  {
    id: "github",
    name: "GitHub",
    icon: "github",
    color: "#24292F",
    category: "dev",
    stage: 6,
    status: "catalog",
    auth: "oauth",
    summary: "Issues, PR, Actions, релизы — рабочий контур разработки.",
    description:
      "Mira создаёт issues/PR, читает CI и релизы. Для черновика — fine-grained PAT или classic token с минимальными repo/workflow scope. Публикация релизов — только по явной команде пользователя.",
    envFields: [
      {
        key: "MCP_GITHUB_TOKEN",
        hint: "PAT: github.com → Settings → Developer settings → Tokens",
        help: "Fine-grained: Contents/Issues/Pull requests Read-write по нужному репо. Не кладите token в git.",
      },
    ],
    voiceExamples: [
      "Создай issue в Mira-AI: починить MCP иконки",
      "Какой статус CI на ветке 0.1.4?",
      "Открой последний PR по MCP каталогу",
    ],
    docsUrl: "https://docs.github.com/",
    setupUrl: "https://github.com/settings/tokens",
    apiDocsUrl: "https://docs.github.com/en/rest",
    oauthHelpUrl: "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps",
  },
  {
    id: "gitlab",
    name: "GitLab",
    icon: "gitlab",
    color: "#FC6D26",
    category: "dev",
    stage: 6,
    status: "catalog",
    auth: "oauth",
    summary: "Merge requests, pipelines, issues.",
    description:
      "MR, pipelines и issues GitLab.com или self-hosted. Укажите URL инстанса и Personal Access Token с api scope.",
    envFields: [
      {
        key: "MCP_GITLAB_TOKEN",
        hint: "Personal Access Token (api) из GitLab → Preferences → Access Tokens",
      },
      {
        key: "MCP_GITLAB_URL",
        hint: "https://gitlab.com или URL self-hosted",
      },
    ],
    voiceExamples: [
      "Открой мой MR в GitLab",
      "Статус pipeline на main в GitLab?",
      "Создай issue в GitLab: обновить MCP docs",
    ],
    docsUrl: "https://docs.gitlab.com/",
    setupUrl: "https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html",
    apiDocsUrl: "https://docs.gitlab.com/ee/api/rest/",
  },
  {
    id: "vscode",
    name: "VS Code / Cursor",
    icon: "vscode",
    color: "#007ACC",
    category: "dev",
    stage: 6,
    status: "catalog",
    auth: "local",
    summary: "Открыть файл/папку проекта, дифф, терминал IDE.",
    description:
      "Локальный bridge к IDE: открыть файл, показать дифф, запустить задачу. Укажите CLI (`code`, `cursor`) если не в PATH.",
    envFields: [
      {
        key: "MCP_EDITOR_CLI",
        hint: "Имя CLI: code или cursor (если не находится в PATH)",
      },
    ],
    voiceExamples: [
      "Открой в Cursor файл SettingsMcpSection.tsx",
      "Покажи дифф текущего файла в IDE",
      "Открой папку проекта Mira в VS Code",
    ],
    docsUrl: "https://code.visualstudio.com/docs",
    setupUrl: "https://code.visualstudio.com/docs/editor/command-line",
    builtinHint: "Рядом с локальным terminal/file tools Mira.",
  },
  {
    id: "docker",
    name: "Docker",
    icon: "docker",
    color: "#2496ED",
    category: "dev",
    stage: 6,
    status: "catalog",
    auth: "local",
    summary: "Контейнеры, compose, логи — через локальный Docker socket.",
    description:
      "Список контейнеров, логи, compose up/down через локальный Docker Engine (socket). Опасные действия (rm -f, prune) — только с Confirm. Docker Desktop должен быть запущен.",
    envFields: [],
    voiceExamples: [
      "Какие контейнеры Docker сейчас запущены?",
      "Покажи логи контейнера mira-db",
      "Перезапусти docker compose в этой папке",
    ],
    docsUrl: "https://docs.docker.com/",
    setupUrl: "https://docs.docker.com/get-started/",
    apiDocsUrl: "https://docs.docker.com/engine/api/",
  },
  {
    id: "sentry",
    name: "Sentry",
    icon: "sentry",
    color: "#362D59",
    category: "dev",
    stage: 6,
    status: "catalog",
    auth: "api-key",
    summary: "Ошибки продакшена, релизы, issue triage.",
    description:
      "Mira читает новые issues Sentry и кратко резюмирует. Auth Token с project:read / event:read; org slug — из URL Sentry.",
    envFields: [
      {
        key: "MCP_SENTRY_TOKEN",
        hint: "Auth Token: sentry.io → Settings → Auth Tokens",
      },
      {
        key: "MCP_SENTRY_ORG",
        hint: "Organization slug (из URL sentry.io/organizations/…)",
      },
    ],
    voiceExamples: [
      "Сколько новых ошибок в Sentry за сутки?",
      "Какая самая частая ошибка Sentry?",
      "Есть ли регрессии Sentry после релиза 0.1.3?",
    ],
    docsUrl: "https://docs.sentry.io/",
    setupUrl: "https://sentry.io/settings/account/api/auth-tokens/",
    apiDocsUrl: "https://docs.sentry.io/api/",
  },
  {
    id: "vercel",
    name: "Vercel",
    icon: "vercel",
    color: "#000000",
    category: "dev",
    stage: 6,
    status: "catalog",
    auth: "api-key",
    summary: "Деплои, preview URL, статус проектов.",
    description:
      "Статус деплоев и preview URL проектов Vercel. Token из Account Settings → Tokens. Деплой/удаление — с Confirm.",
    envFields: [
      {
        key: "MCP_VERCEL_TOKEN",
        hint: "vercel.com → Account Settings → Tokens",
      },
    ],
    voiceExamples: [
      "Какой последний деплой Vercel?",
      "Дай preview URL последнего деплоя",
      "Есть ли упавшие деплои Vercel за сутки?",
    ],
    docsUrl: "https://vercel.com/docs",
    setupUrl: "https://vercel.com/account/tokens",
    apiDocsUrl: "https://vercel.com/docs/rest-api",
  },

  // ─── 7 design / creative (incl. Blender) ─────────────────
  {
    id: "figma",
    name: "Figma",
    icon: "figma",
    color: "#F24E1E",
    category: "design",
    stage: 7,
    status: "catalog",
    auth: "oauth",
    summary: "Файлы, комментарии, экспорт фреймов, Dev Mode links.",
    description:
      "Mira ищет файлы/фреймы, читает комментарии и готовит ссылки Dev Mode. Personal Access Token: Figma → Settings → Security. Для OAuth — приложение в Figma developers.",
    envFields: [
      {
        key: "MCP_FIGMA_TOKEN",
        hint: "Personal access token: Figma → Settings → Security",
        help: "Токен даёт доступ от вашего имени. Для командных сценариев позже — OAuth app.",
      },
    ],
    voiceExamples: [
      "Найди в Figma экран настроек MCP",
      "Какие комментарии в Figma по последнему макету?",
      "Дай ссылку Dev Mode на фрейм Home",
    ],
    docsUrl: "https://help.figma.com/",
    setupUrl: "https://www.figma.com/developers/api#access-tokens",
    apiDocsUrl: "https://www.figma.com/developers/api",
    oauthHelpUrl: "https://www.figma.com/developers/api#authentication",
  },
  {
    id: "blender",
    name: "Blender",
    icon: "blender",
    color: "#E87D0D",
    category: "design",
    stage: 7,
    status: "catalog",
    auth: "local",
    summary:
      "3D-сцены, моделирование, материалы, рендер. Связь с built-in Blender bridge Mira (P10).",
    description:
      "Mira управляет Blender локально: открыть .blend, собрать demo-сцену, запустить bpy-скрипт, рендер по запросу. Установите Blender с blender.org и укажите путь к бинарнику. Community Blender MCP servers можно подключить позже тем же каталогом; сейчас в 0.1.4 — черновик + уже существующий built-in bridge (P10).",
    envFields: [
      {
        key: "BLENDER_PATH",
        hint: "Полный путь к blender / blender.exe",
        help: "macOS часто /Applications/Blender.app/Contents/MacOS/Blender; Windows — Program Files\\Blender Foundation\\Blender…\\blender.exe.",
      },
      {
        key: "BLENDER_ENABLED",
        hint: "true / false — включить built-in bridge",
        help: "Дублирует флаг в Интеграциях. Оставьте true, если пользуетесь P10 skills.",
      },
    ],
    voiceExamples: [
      "Собери в Blender сцену с кубом и светом",
      "Запусти demo scene в Blender",
      "Открой последний .blend и сделай preview-рендер",
    ],
    docsUrl: "https://www.blender.org/",
    setupUrl: "https://www.blender.org/download/",
    apiDocsUrl: "https://docs.blender.org/api/current/",
    oauthHelpUrl: "https://docs.blender.org/manual/en/latest/",
    builtinHint:
      "Уже есть в Интеграциях / P10: bpy bridge, demo scene, skills on-demand. MCP-runtime в 0.1.4 ещё не активен — черновик полей + ссылки на установку.",
  },
  {
    id: "canva",
    name: "Canva",
    icon: "canva",
    color: "#00C4CC",
    category: "design",
    stage: 7,
    status: "catalog",
    auth: "oauth",
    summary: "Быстрые макеты, презентации, соцсети.",
    description:
      "Создание и поиск дизайнов Canva через Connect API. Зарегистрируйте интеграцию в Canva Developers и сохраните token/Client ID.",
    envFields: [
      {
        key: "MCP_CANVA_TOKEN",
        hint: "Access token / credentials из Canva Developers",
      },
    ],
    voiceExamples: [
      "Создай в Canva обложку для релиза Mira",
      "Найди в Canva шаблон презентации продукта",
      "Экспортируй последний дизайн Canva в PNG",
    ],
    docsUrl: "https://www.canva.com/help/",
    setupUrl: "https://www.canva.com/developers/",
    apiDocsUrl: "https://www.canva.com/developers/docs/",
  },
  {
    id: "miro",
    name: "Miro",
    icon: "miro",
    color: "#FFD02F",
    category: "design",
    stage: 7,
    status: "catalog",
    auth: "oauth",
    summary: "Доски, стикеры, воркшопы.",
    description:
      "Стикеры и карточки на досках Miro. Создайте приложение в Miro Developer Platform; для черновика можно взять temporary token с доски.",
    envFields: [
      {
        key: "MCP_MIRO_TOKEN",
        hint: "Access token из Miro → Profile → Your apps / board token",
      },
    ],
    voiceExamples: [
      "Добавь стикер на доску Miro: идея MCP",
      "Что на доске Miro про релиз?",
      "Создай на Miro карточку: задача по иконкам",
    ],
    docsUrl: "https://help.miro.com/",
    setupUrl: "https://developers.miro.com/docs/getting-started",
    apiDocsUrl: "https://developers.miro.com/reference/api-reference",
    oauthHelpUrl: "https://developers.miro.com/docs/getting-started-with-oauth",
  },
  {
    id: "excalidraw",
    name: "Excalidraw",
    icon: "excalidraw",
    color: "#6965DB",
    category: "design",
    stage: 7,
    status: "catalog",
    auth: "local",
    summary: "Локальные/облачные скетчи и схемы.",
    description:
      "Открытие и сохранение .excalidraw файлов из локальной папки (или Plus workspace позже). Укажите каталог со схемами.",
    envFields: [
      {
        key: "MCP_EXCALIDRAW_PATH",
        hint: "Папка с .excalidraw файлами",
      },
    ],
    voiceExamples: [
      "Открой схему архитектуры в Excalidraw",
      "Создай новый скетч Excalidraw: поток MCP",
      "Найди Excalidraw с диаграммой релизов",
    ],
    docsUrl: "https://docs.excalidraw.com/",
    setupUrl: "https://excalidraw.com/",
  },

  // ─── 8 office ────────────────────────────────────────────
  {
    id: "google-sheets",
    name: "Google Sheets",
    icon: "gsheets",
    color: "#0F9D58",
    category: "office",
    stage: 8,
    status: "catalog",
    auth: "oauth",
    summary: "Чтение/запись ячеек, сводки.",
    description:
      "Mira читает диапазоны Google Sheets, добавляет строки (расходы, логи) и делает краткие сводки голосом. В Google Cloud включите Google Sheets API и создайте OAuth 2.0 Client ID. ID таблицы можно указать в заметках модалки. Запись ячеек — с Confirm на массовые правки. В 0.1.4 сохраняется только локальный черновик полей.",
    envFields: [
      {
        key: "MCP_GOOGLE_SHEETS_CLIENT_ID",
        hint: "OAuth 2.0 Client ID из Google Cloud Console → Credentials",
        help: "Создайте проект → включите Google Sheets API → OAuth consent screen → Create credentials → OAuth client ID (Desktop или Web). Client secret храните отдельно, не в git. Spreadsheet ID — из URL таблицы (/d/SPREADSHEET_ID/).",
      },
    ],
    voiceExamples: [
      "Добавь строку в Sheets: расход 1200",
      "Сколько итог по колонке Сумма за этот месяц?",
      "Прочитай первые десять строк таблицы бюджета",
    ],
    docsUrl: "https://support.google.com/docs/topic/9054603",
    setupUrl: "https://console.cloud.google.com/apis/library/sheets.googleapis.com",
    apiDocsUrl: "https://developers.google.com/sheets/api/reference/rest",
    oauthHelpUrl: "https://developers.google.com/workspace/guides/create-credentials",
  },
  {
    id: "excel",
    name: "Excel",
    icon: "excel",
    color: "#217346",
    category: "office",
    stage: 8,
    status: "catalog",
    auth: "oauth",
    summary: "Microsoft Excel / 365 таблицы.",
    description:
      "Работа с книгами Excel в OneDrive/SharePoint через Microsoft Graph. Azure Client ID с Files.ReadWrite.",
    envFields: [
      {
        key: "MCP_EXCEL_CLIENT_ID",
        hint: "Azure Application (client) ID для Graph Excel APIs",
      },
    ],
    voiceExamples: [
      "Обнови лист Excel: план продаж",
      "Прочитай итог по листу Budget в Excel",
      "Добавь строку в Excel: новый клиент",
    ],
    docsUrl: "https://support.microsoft.com/excel",
    setupUrl: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps",
    apiDocsUrl: "https://learn.microsoft.com/en-us/graph/api/resources/excel",
    oauthHelpUrl: "https://learn.microsoft.com/en-us/graph/auth-v2-user",
  },
  {
    id: "google-docs",
    name: "Google Docs",
    icon: "gdocs",
    color: "#4285F4",
    category: "office",
    stage: 8,
    status: "catalog",
    auth: "oauth",
    summary: "Документы: черновики и вставки текста.",
    description:
      "Создание Docs и вставка текста/заголовков. OAuth Client ID с Google Docs API. Массовые правки — с Confirm.",
    envFields: [
      {
        key: "MCP_GOOGLE_DOCS_CLIENT_ID",
        hint: "OAuth Client ID с включённым Google Docs API",
      },
    ],
    voiceExamples: [
      "Создай Google Doc: протокол встречи",
      "Вставь в Doc краткое резюме созвона",
      "Найди Google Doc про оффер",
    ],
    docsUrl: "https://support.google.com/docs",
    setupUrl: "https://console.cloud.google.com/apis/library/docs.googleapis.com",
    apiDocsUrl: "https://developers.google.com/docs/api/reference/rest",
    oauthHelpUrl: "https://developers.google.com/workspace/guides/create-credentials",
  },
  {
    id: "airtable",
    name: "Airtable",
    icon: "airtable",
    color: "#18BFFF",
    category: "office",
    stage: 8,
    status: "catalog",
    auth: "api-key",
    summary: "Базы-таблицы для операций и контента.",
    description:
      "Чтение и добавление записей в базы Airtable. Personal Access Token + Base ID из URL базы.",
    envFields: [
      {
        key: "MCP_AIRTABLE_TOKEN",
        hint: "Personal Access Token: airtable.com/create/tokens",
      },
      {
        key: "MCP_AIRTABLE_BASE_ID",
        hint: "Base ID (app…) из URL или API docs базы",
      },
    ],
    voiceExamples: [
      "Добавь запись в Airtable CRM",
      "Сколько записей в таблице Leads?",
      "Обнови статус в Airtable: Closed Won",
    ],
    docsUrl: "https://support.airtable.com/",
    setupUrl: "https://airtable.com/create/tokens",
    apiDocsUrl: "https://airtable.com/developers/web/api/introduction",
  },
  {
    id: "onedrive",
    name: "OneDrive",
    icon: "onedrive",
    color: "#094AB2",
    category: "office",
    stage: 8,
    status: "catalog",
    auth: "oauth",
    summary: "Файлы Microsoft 365 / SharePoint-adjacent.",
    description:
      "Поиск и открытие файлов OneDrive через Graph. Azure Client ID с Files.Read / Files.ReadWrite.",
    envFields: [
      {
        key: "MCP_ONEDRIVE_CLIENT_ID",
        hint: "Azure Application (client) ID",
      },
    ],
    voiceExamples: [
      "Найди в OneDrive презентацию Q4",
      "Открой последний договор из OneDrive",
      "Есть ли новые файлы в папке Клиенты?",
    ],
    docsUrl: "https://support.microsoft.com/onedrive",
    setupUrl: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps",
    apiDocsUrl: "https://learn.microsoft.com/en-us/graph/api/resources/onedrive",
    oauthHelpUrl: "https://learn.microsoft.com/en-us/graph/auth-v2-user",
  },

  // ─── 9 crm ───────────────────────────────────────────────
  {
    id: "hubspot",
    name: "HubSpot",
    icon: "hubspot",
    color: "#FF7A59",
    category: "crm",
    stage: 9,
    status: "catalog",
    auth: "oauth",
    summary: "Контакты, сделки, воронка.",
    description:
      "Создание контактов/сделок и чтение воронки HubSpot. Private App token или OAuth из Developers HubSpot.",
    envFields: [
      {
        key: "MCP_HUBSPOT_TOKEN",
        hint: "Private App access token из HubSpot → Settings → Integrations",
      },
    ],
    voiceExamples: [
      "Создай сделку HubSpot: пилот Mira",
      "Сколько открытых сделок в воронке?",
      "Найди контакт HubSpot по email анны",
    ],
    docsUrl: "https://knowledge.hubspot.com/",
    setupUrl: "https://developers.hubspot.com/docs/api/private-apps",
    apiDocsUrl: "https://developers.hubspot.com/docs/api/overview",
    oauthHelpUrl: "https://developers.hubspot.com/docs/api/working-with-oauth",
  },
  {
    id: "salesforce",
    name: "Salesforce",
    icon: "salesforce",
    color: "#00A1E0",
    category: "crm",
    stage: 9,
    status: "catalog",
    auth: "oauth",
    summary: "Enterprise CRM объекты и отчёты.",
    description:
      "Поиск аккаунтов/opportunity через Salesforce Connected App (OAuth Client ID). Для sandbox укажите домен в заметках.",
    envFields: [
      {
        key: "MCP_SALESFORCE_CLIENT_ID",
        hint: "Connected App Consumer Key (Client ID)",
      },
    ],
    voiceExamples: [
      "Найди аккаунт Salesforce Acme",
      "Какие opportunity Closing в этом месяце?",
      "Создай задачу Salesforce: follow-up после демо",
    ],
    docsUrl: "https://help.salesforce.com/",
    setupUrl: "https://help.salesforce.com/s/articleView?id=sf.connected_app_create.htm",
    apiDocsUrl: "https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/",
    oauthHelpUrl: "https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_web_server_flow.htm",
  },
  {
    id: "amocrm",
    name: "amoCRM",
    icon: "amocrm",
    color: "#4C8BF5",
    category: "crm",
    stage: 9,
    status: "catalog",
    auth: "oauth",
    summary: "RU CRM: сделки и контакты.",
    description:
      "Сделки и контакты amoCRM. Нужны long-lived token (или OAuth) и поддомен аккаунта (xxx.amocrm.ru).",
    envFields: [
      {
        key: "MCP_AMOCRM_TOKEN",
        hint: "Долгосрочный токен / access token интеграции amoCRM",
      },
      {
        key: "MCP_AMOCRM_DOMAIN",
        hint: "Поддомен, например company.amocrm.ru",
      },
    ],
    voiceExamples: [
      "Переведи сделку amoCRM на этап Оплата",
      "Создай контакт в amoCRM: новый лид с сайта",
      "Сколько сделок в работе в amoCRM?",
    ],
    docsUrl: "https://www.amocrm.ru/support/",
    setupUrl: "https://www.amocrm.ru/developers/",
    apiDocsUrl: "https://www.amocrm.ru/developers/content/crm_platform/api-reference",
  },
  {
    id: "bitrix24",
    name: "Bitrix24",
    icon: "bitrix",
    color: "#2FC6F6",
    category: "crm",
    stage: 9,
    status: "catalog",
    auth: "oauth",
    summary: "CRM + задачи + чаты Bitrix24.",
    description:
      "Лиды и сделки Bitrix24 через входящий вебхук или OAuth приложения. Вебхук создаётся в разделе Разработчикам.",
    envFields: [
      {
        key: "MCP_BITRIX_WEBHOOK",
        hint: "URL входящего вебхука Bitrix24 (…/rest/1/xxx/)",
        help: "Права вебхука ограничьте CRM. Не публикуйте URL — это секрет.",
      },
    ],
    voiceExamples: [
      "Создай лид в Bitrix24",
      "Какие сделки Bitrix24 без активности?",
      "Поставь задачу в Bitrix24: перезвонить клиенту",
    ],
    docsUrl: "https://helpdesk.bitrix24.ru/",
    setupUrl: "https://apidocs.bitrix24.ru/local-integrations/local-webhooks.html",
    apiDocsUrl: "https://apidocs.bitrix24.ru/",
  },
  {
    id: "stripe",
    name: "Stripe",
    icon: "stripe",
    color: "#635BFF",
    category: "crm",
    stage: 9,
    status: "catalog",
    auth: "api-key",
    summary: "Платежи, подписки, баланс (read + осторожный write).",
    description:
      "Чтение платежей и подписок Stripe. Используйте Secret key (sk_…) только локально; write/refund — строго с Confirm. Для продакшена предпочтителен ограниченный Restricted key.",
    envFields: [
      {
        key: "MCP_STRIPE_SECRET_KEY",
        hint: "Secret key / Restricted key из dashboard.stripe.com/apikeys",
      },
    ],
    voiceExamples: [
      "Сколько успешных платежей Stripe за неделю?",
      "Есть ли failed charges Stripe за сутки?",
      "Какой статус подписки клиента Acme?",
    ],
    docsUrl: "https://stripe.com/docs",
    setupUrl: "https://dashboard.stripe.com/apikeys",
    apiDocsUrl: "https://stripe.com/docs/api",
  },

  // ─── 10 browser ──────────────────────────────────────────
  {
    id: "chrome",
    name: "Google Chrome",
    icon: "chrome",
    color: "#4285F4",
    category: "browser",
    stage: 10,
    status: "catalog",
    auth: "local",
    summary: "Вкладки, история, bookmarks — рядом с built-in browser tools.",
    description:
      "Открытие URL и работа с профилем Chrome рядом с уже существующими browser tools Mira. Отдельный API-ключ не нужен.",
    envFields: [],
    voiceExamples: [
      "Открой в Chrome документацию MCP",
      "Какие вкладки Chrome сейчас открыты?",
      "Найди в закладках Chrome страницу про Sheets API",
    ],
    docsUrl: "https://support.google.com/chrome",
    setupUrl: "https://www.google.com/chrome/",
    builtinHint: "Частично уже в Интеграциях (browser open / history).",
  },
  {
    id: "firefox",
    name: "Firefox",
    icon: "firefox",
    color: "#FF7139",
    category: "browser",
    stage: 10,
    status: "catalog",
    auth: "local",
    summary: "Профили Firefox и история.",
    description:
      "Локальный bridge к профилю Firefox (история/закладки). Без облачного токена; нужен установленный Firefox.",
    envFields: [],
    voiceExamples: [
      "Найди в истории Firefox сайт с тарифами",
      "Открой Firefox на about:preferences",
      "Какие свежие закладки в Firefox?",
    ],
    docsUrl: "https://support.mozilla.org/products/firefox",
    setupUrl: "https://www.mozilla.org/firefox/",
  },
  {
    id: "edge",
    name: "Microsoft Edge",
    icon: "edge",
    color: "#0078D7",
    category: "browser",
    stage: 10,
    status: "catalog",
    auth: "local",
    summary: "Edge на Windows как основной браузер.",
    description:
      "Открытие страниц и работа с профилем Edge (особенно Windows). Без API-ключа.",
    envFields: [],
    voiceExamples: [
      "Открой Edge на странице настроек Mira",
      "Найди в Edge закладку про Azure",
      "Открой в Edge документацию Graph API",
    ],
    docsUrl: "https://support.microsoft.com/edge",
    setupUrl: "https://www.microsoft.com/edge",
  },
  {
    id: "raindrop",
    name: "Raindrop.io",
    icon: "raindrop",
    color: "#0A64FF",
    category: "browser",
    stage: 10,
    status: "catalog",
    auth: "api-key",
    summary: "Закладки и коллекции read-later.",
    description:
      "Сохранение ссылок в коллекции Raindrop. Test token или OAuth из developer.raindrop.io.",
    envFields: [
      {
        key: "MCP_RAINDROP_TOKEN",
        hint: "Test token / Bearer из app.raindrop.io → Settings → Integrations",
      },
    ],
    voiceExamples: [
      "Сохрани текущую ссылку в Raindrop",
      "Найди в Raindrop закладки про MCP",
      "Добавь ссылку в коллекцию Read Later",
    ],
    docsUrl: "https://help.raindrop.io/",
    setupUrl: "https://app.raindrop.io/settings/integrations",
    apiDocsUrl: "https://developer.raindrop.io/",
  },
  {
    id: "pocket",
    name: "Pocket",
    icon: "pocket",
    color: "#EF4056",
    category: "browser",
    stage: 10,
    status: "catalog",
    auth: "oauth",
    summary: "Отложенное чтение статей.",
    description:
      "Добавление статей в Pocket. Consumer Key из getpocket.com/developer; полный OAuth — когда runtime готов.",
    envFields: [
      {
        key: "MCP_POCKET_CONSUMER_KEY",
        hint: "Consumer Key из getpocket.com/developer",
      },
    ],
    voiceExamples: [
      "Добавь статью в Pocket",
      "Что непрочитанного в Pocket?",
      "Найди в Pocket статьи про OAuth",
    ],
    docsUrl: "https://getpocket.com/",
    setupUrl: "https://getpocket.com/developer/",
    apiDocsUrl: "https://getpocket.com/developer/docs/overview",
  },
];

export function connectorsForStage(stage: McpStageId): McpConnector[] {
  return MCP_CONNECTORS.filter((c) => c.stage === stage);
}

export function getMcpConnector(id: string): McpConnector | undefined {
  return MCP_CONNECTORS.find((c) => c.id === id);
}

const DRAFT_KEY = "mira.mcp.drafts";

export type McpConnectorDraft = {
  enabled: boolean;
  notes: string;
  fields: Record<string, string>;
  updatedAt: string;
};

export function loadMcpDrafts(): Record<string, McpConnectorDraft> {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, McpConnectorDraft>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveMcpDraft(
  id: string,
  draft: McpConnectorDraft,
): Record<string, McpConnectorDraft> {
  const all = loadMcpDrafts();
  all[id] = draft;
  localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
  return all;
}

export const MCP_AUTH_LABEL: Record<McpAuthKind, string> = {
  oauth: "OAuth",
  "api-key": "API-ключ",
  local: "Локально / OS",
  bridge: "Automation bridge",
};

export const MCP_STATUS_LABEL: Record<McpConnectorStatus, string> = {
  catalog: "В каталоге",
  planned: "В плане",
  wiring: "Подключение",
  partial: "Частично",
  done: "Готово",
};
