/** MCP connector catalog for Settings → MCP (staged tiles). */

export type McpAuthKind = "oauth" | "api-key" | "local" | "bridge";

export type McpConnectorStatus = "catalog" | "planned" | "wiring" | "partial" | "done";

export type McpStageId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type McpCategoryId =
  | "tasks"
  | "calendar"
  | "comms"
  | "notes"
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

export type McpConnector = {
  id: string;
  name: string;
  icon: McpIconId;
  /** Brand accent for tile badge */
  color: string;
  category: McpCategoryId;
  stage: McpStageId;
  status: McpConnectorStatus;
  auth: McpAuthKind;
  summary: string;
  envKeys: string[];
  voiceExamples: string[];
  docsUrl?: string;
};

export type McpStageMeta = {
  stage: McpStageId;
  category: McpCategoryId;
  catalogNo: number;
  title: string;
  blurb: string;
};

export const MCP_STAGES: McpStageMeta[] = [
  {
    stage: 1,
    category: "tasks",
    catalogNo: 1,
    title: "Задачи и проекты",
    blurb: "Тикеты, списки дел, спринты — голосом «создай задачу».",
  },
  {
    stage: 2,
    category: "calendar",
    catalogNo: 2,
    title: "Календарь и время",
    blurb: "Встречи, слоты, трекинг времени.",
  },
  {
    stage: 3,
    category: "comms",
    catalogNo: 3,
    title: "Почта и коммуникации",
    blurb: "Письма, Slack/Teams/Telegram без ручного кликера.",
  },
  {
    stage: 4,
    category: "notes",
    catalogNo: 5,
    title: "Заметки и личная база",
    blurb: "PKM и быстрые заметки рядом с памятью Mira.",
  },
  {
    stage: 5,
    category: "office",
    catalogNo: 8,
    title: "Офис и таблицы",
    blurb: "Sheets/Excel, документы, Airtable.",
  },
  {
    stage: 6,
    category: "crm",
    catalogNo: 9,
    title: "CRM, продажи, финансы",
    blurb: "Сделки, счета, платежные статусы.",
  },
  {
    stage: 7,
    category: "browser",
    catalogNo: 10,
    title: "Браузер и веб",
    blurb: "Вкладки, bookmarks, read-later — усиление built-in browser.",
  },
];

export const MCP_CONNECTORS: McpConnector[] = [
  // Stage 1 — tasks
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
    envKeys: ["MCP_TODOIST_TOKEN"],
    voiceExamples: [
      "Добавь в Todoist купить молоко на сегодня",
      "Что у меня в Todoist на эту неделю?",
    ],
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
    envKeys: ["MCP_LINEAR_API_KEY"],
    voiceExamples: [
      "Создай issue в Linear: починить автообновление",
      "Какие у меня Linear issues в In Progress?",
    ],
  },
  {
    id: "notion-tasks",
    name: "Notion",
    icon: "notion",
    color: "#FFFFFF",
    category: "tasks",
    stage: 1,
    status: "catalog",
    auth: "oauth",
    summary: "Базы и task-доски Notion как рабочий трекер.",
    envKeys: ["MCP_NOTION_TOKEN"],
    voiceExamples: [
      "Добавь задачу в Notion: подготовить отчёт",
      "Покажи открытые задачи из Notion",
    ],
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
    envKeys: ["MCP_ASANA_TOKEN"],
    voiceExamples: ["Поставь задачу в Asana на пятницу"],
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
    envKeys: ["MCP_CLICKUP_TOKEN"],
    voiceExamples: ["Создай задачу в ClickUp: созвон с клиентом"],
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
    envKeys: ["MCP_JIRA_EMAIL", "MCP_JIRA_TOKEN", "MCP_JIRA_BASE_URL"],
    voiceExamples: ["Открой мой спринт в Jira", "Создай баг в Jira"],
  },
  {
    id: "ms-todo",
    name: "Microsoft To Do",
    icon: "ms-todo",
    color: "#3CC5F7",
    category: "tasks",
    stage: 1,
    status: "catalog",
    auth: "oauth",
    summary: "Списки дел Microsoft 365 / Outlook.",
    envKeys: ["MCP_MS_TODO_CLIENT_ID"],
    voiceExamples: ["Добавь в To Do позвонить маме"],
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
    envKeys: ["MCP_TICKTICK_TOKEN"],
    voiceExamples: ["Что в TickTick на завтра?"],
  },

  // Stage 2 — calendar
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
    envKeys: ["MCP_GOOGLE_CALENDAR_CLIENT_ID"],
    voiceExamples: [
      "Что у меня в календаре сегодня?",
      "Поставь встречу на завтра в 15:00",
    ],
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
    envKeys: ["MCP_OUTLOOK_CLIENT_ID"],
    voiceExamples: ["Перенеси встречу Outlook на час позже"],
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
    envKeys: [],
    voiceExamples: ["Добавь в Apple Calendar тренировку"],
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
    envKeys: ["MCP_CALENDLY_TOKEN"],
    voiceExamples: ["Какие встречи Calendly на этой неделе?"],
  },
  {
    id: "toggl",
    name: "Toggl",
    icon: "toggl",
    color: "#E57CD8",
    category: "calendar",
    stage: 2,
    status: "catalog",
    auth: "api-key",
    summary: "Трекинг времени по проектам.",
    envKeys: ["MCP_TOGGL_TOKEN"],
    voiceExamples: ["Старт таймера Toggl на Mira UI"],
  },

  // Stage 3 — comms
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
    envKeys: ["MCP_GMAIL_CLIENT_ID"],
    voiceExamples: [
      "Прочитай последние письма от Анны",
      "Напиши черновик в Gmail: итоги недели",
    ],
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
    envKeys: ["MCP_OUTLOOK_CLIENT_ID"],
    voiceExamples: ["Есть ли срочные письма в Outlook?"],
  },
  {
    id: "slack",
    name: "Slack",
    icon: "slack",
    color: "#E01E5A",
    category: "comms",
    stage: 3,
    status: "catalog",
    auth: "oauth",
    summary: "Каналы, DM, поиск по workspace.",
    envKeys: ["MCP_SLACK_BOT_TOKEN"],
    voiceExamples: ["Напиши в Slack #mira: сборка готова"],
  },
  {
    id: "telegram",
    name: "Telegram",
    icon: "telegram",
    color: "#2AABEE",
    category: "comms",
    stage: 3,
    status: "catalog",
    auth: "api-key",
    summary: "Bot API / усиление built-in messaging Mira.",
    envKeys: ["TELEGRAM_BOT_TOKEN"],
    voiceExamples: ["Отправь в Telegram Ивану: буду через 10 минут"],
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
    envKeys: ["MCP_DISCORD_BOT_TOKEN"],
    voiceExamples: ["Постни в Discord #updates краткий статус"],
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    icon: "teams",
    color: "#6264A7",
    category: "comms",
    stage: 3,
    status: "catalog",
    auth: "oauth",
    summary: "Чаты и каналы Teams.",
    envKeys: ["MCP_TEAMS_CLIENT_ID"],
    voiceExamples: ["Напиши в Teams: созвон переносим"],
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
    envKeys: ["MCP_WHATSAPP_TOKEN", "MCP_WHATSAPP_PHONE_ID"],
    voiceExamples: ["Отправь в WhatsApp клиенту подтверждение"],
  },

  // Stage 4 — notes (catalog #5)
  {
    id: "obsidian",
    name: "Obsidian",
    icon: "obsidian",
    color: "#7C3AED",
    category: "notes",
    stage: 4,
    status: "catalog",
    auth: "local",
    summary: "Локальный vault Markdown как память рядом с Mira.",
    envKeys: ["MCP_OBSIDIAN_VAULT_PATH"],
    voiceExamples: ["Запиши в Obsidian идею про MCP плитки"],
  },
  {
    id: "apple-notes",
    name: "Apple Notes",
    icon: "apple-notes",
    color: "#FFD60A",
    category: "notes",
    stage: 4,
    status: "catalog",
    auth: "local",
    summary: "Быстрые заметки через OS bridge.",
    envKeys: [],
    voiceExamples: ["Создай заметку Apple Notes: список покупок"],
  },
  {
    id: "bear",
    name: "Bear",
    icon: "bear",
    color: "#C65E4A",
    category: "notes",
    stage: 4,
    status: "catalog",
    auth: "bridge",
    summary: "Markdown-заметки macOS/iOS.",
    envKeys: [],
    voiceExamples: ["Добавь в Bear черновик поста"],
  },
  {
    id: "logseq",
    name: "Logseq",
    icon: "logseq",
    color: "#86C0FF",
    category: "notes",
    stage: 4,
    status: "catalog",
    auth: "local",
    summary: "Outliner / graph PKM.",
    envKeys: ["MCP_LOGSEQ_GRAPH_PATH"],
    voiceExamples: ["Добавь в Logseq блок про релиз 0.1.4"],
  },
  {
    id: "mem",
    name: "Mem",
    icon: "mem",
    color: "#111111",
    category: "notes",
    stage: 4,
    status: "catalog",
    auth: "api-key",
    summary: "AI-заметки с быстрым захватом.",
    envKeys: ["MCP_MEM_API_KEY"],
    voiceExamples: ["Сохрани в Mem: созвон про MCP"],
  },

  // Stage 5 — office (catalog #8)
  {
    id: "google-sheets",
    name: "Google Sheets",
    icon: "gsheets",
    color: "#0F9D58",
    category: "office",
    stage: 5,
    status: "catalog",
    auth: "oauth",
    summary: "Чтение/запись ячеек, сводки.",
    envKeys: ["MCP_GOOGLE_SHEETS_CLIENT_ID"],
    voiceExamples: ["Добавь строку в Sheets: расход 1200"],
  },
  {
    id: "excel",
    name: "Excel",
    icon: "excel",
    color: "#217346",
    category: "office",
    stage: 5,
    status: "catalog",
    auth: "oauth",
    summary: "Microsoft Excel / 365 таблицы.",
    envKeys: ["MCP_EXCEL_CLIENT_ID"],
    voiceExamples: ["Обнови лист Excel: план продаж"],
  },
  {
    id: "google-docs",
    name: "Google Docs",
    icon: "gdocs",
    color: "#4285F4",
    category: "office",
    stage: 5,
    status: "catalog",
    auth: "oauth",
    summary: "Документы: черновики и вставки текста.",
    envKeys: ["MCP_GOOGLE_DOCS_CLIENT_ID"],
    voiceExamples: ["Создай Google Doc: протокол встречи"],
  },
  {
    id: "airtable",
    name: "Airtable",
    icon: "airtable",
    color: "#FCBA02",
    category: "office",
    stage: 5,
    status: "catalog",
    auth: "api-key",
    summary: "Базы-таблицы для операций и контента.",
    envKeys: ["MCP_AIRTABLE_TOKEN", "MCP_AIRTABLE_BASE_ID"],
    voiceExamples: ["Добавь запись в Airtable CRM"],
  },
  {
    id: "onedrive",
    name: "OneDrive",
    icon: "onedrive",
    color: "#094AB2",
    category: "office",
    stage: 5,
    status: "catalog",
    auth: "oauth",
    summary: "Файлы Microsoft 365 / SharePoint-adjacent.",
    envKeys: ["MCP_ONEDRIVE_CLIENT_ID"],
    voiceExamples: ["Найди в OneDrive презентацию Q4"],
  },

  // Stage 6 — crm (catalog #9)
  {
    id: "hubspot",
    name: "HubSpot",
    icon: "hubspot",
    color: "#FF7A59",
    category: "crm",
    stage: 6,
    status: "catalog",
    auth: "oauth",
    summary: "Контакты, сделки, воронка.",
    envKeys: ["MCP_HUBSPOT_TOKEN"],
    voiceExamples: ["Создай сделку HubSpot: пилот Mira"],
  },
  {
    id: "salesforce",
    name: "Salesforce",
    icon: "salesforce",
    color: "#00A1E0",
    category: "crm",
    stage: 6,
    status: "catalog",
    auth: "oauth",
    summary: "Enterprise CRM объекты и отчёты.",
    envKeys: ["MCP_SALESFORCE_CLIENT_ID"],
    voiceExamples: ["Найди аккаунт Salesforce Acme"],
  },
  {
    id: "amocrm",
    name: "amoCRM",
    icon: "amocrm",
    color: "#4C8BF5",
    category: "crm",
    stage: 6,
    status: "catalog",
    auth: "oauth",
    summary: "RU CRM: сделки и контакты.",
    envKeys: ["MCP_AMOCRM_TOKEN", "MCP_AMOCRM_DOMAIN"],
    voiceExamples: ["Переведи сделку amoCRM на этап Оплата"],
  },
  {
    id: "bitrix24",
    name: "Bitrix24",
    icon: "bitrix",
    color: "#2FC6F6",
    category: "crm",
    stage: 6,
    status: "catalog",
    auth: "oauth",
    summary: "CRM + задачи + чаты Bitrix24.",
    envKeys: ["MCP_BITRIX_WEBHOOK"],
    voiceExamples: ["Создай лид в Bitrix24"],
  },
  {
    id: "stripe",
    name: "Stripe",
    icon: "stripe",
    color: "#635BFF",
    category: "crm",
    stage: 6,
    status: "catalog",
    auth: "api-key",
    summary: "Платежи, подписки, баланс (read + осторожный write).",
    envKeys: ["MCP_STRIPE_SECRET_KEY"],
    voiceExamples: ["Сколько успешных платежей Stripe за неделю?"],
  },

  // Stage 7 — browser (catalog #10)
  {
    id: "chrome",
    name: "Google Chrome",
    icon: "chrome",
    color: "#4285F4",
    category: "browser",
    stage: 7,
    status: "catalog",
    auth: "local",
    summary: "Вкладки, история, bookmarks — рядом с built-in browser tools.",
    envKeys: [],
    voiceExamples: ["Открой в Chrome документацию MCP"],
  },
  {
    id: "firefox",
    name: "Firefox",
    icon: "firefox",
    color: "#FF7139",
    category: "browser",
    stage: 7,
    status: "catalog",
    auth: "local",
    summary: "Профили Firefox и история.",
    envKeys: [],
    voiceExamples: ["Найди в истории Firefox сайт с тарифами"],
  },
  {
    id: "edge",
    name: "Microsoft Edge",
    icon: "edge",
    color: "#0078D7",
    category: "browser",
    stage: 7,
    status: "catalog",
    auth: "local",
    summary: "Edge на Windows как основной браузер.",
    envKeys: [],
    voiceExamples: ["Открой Edge на странице настроек Mira"],
  },
  {
    id: "raindrop",
    name: "Raindrop",
    icon: "raindrop",
    color: "#0A64FF",
    category: "browser",
    stage: 7,
    status: "catalog",
    auth: "api-key",
    summary: "Закладки и коллекции read-later.",
    envKeys: ["MCP_RAINDROP_TOKEN"],
    voiceExamples: ["Сохрани текущую ссылку в Raindrop"],
  },
  {
    id: "pocket",
    name: "Pocket",
    icon: "pocket",
    color: "#EF4056",
    category: "browser",
    stage: 7,
    status: "catalog",
    auth: "oauth",
    summary: "Отложенное чтение статей.",
    envKeys: ["MCP_POCKET_CONSUMER_KEY"],
    voiceExamples: ["Добавь статью в Pocket"],
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
