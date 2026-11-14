import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { StubBadge } from "./StubBadge";
import {
  Field,
  SaveRow,
  SecretField,
  ToggleRow,
} from "./SettingsFormBits";
import { ThemeSelect } from "./ThemeSelect";
import {
  OfficialBrandIcon,
  type OfficialBrandAsset,
} from "./OfficialBrandIcon";
import {
  boolToEnv,
  isTruthyEnv,
  loadSettingsEnv,
  saveSettingsEnv,
  type SettingsEnvSnapshot,
} from "../settingsEnvClient";

type InstalledBrowser = {
  id: string;
  name: string;
  path: string | null;
  installed: boolean;
};

type IntegId =
  | "web"
  | "screen"
  | "browser"
  | "messaging"
  | "blender"
  | "future";

type FilterId = "all" | IntegId;

type IntegMeta = {
  id: IntegId;
  name: string;
  kind: string;
  summary: string;
  tags: string[];
  enabledKey?: string;
  saveKeys: string[];
};

const INTEG_META: IntegMeta[] = [
  {
    id: "web",
    name: "Веб-поиск и fetch",
    kind: "Интернет · #4",
    summary: "Поиск в сети и чтение страниц из allowlist",
    tags: ["WEB_ENABLED", "allowlist", "fetch"],
    enabledKey: "WEB_ENABLED",
    saveKeys: ["WEB_ENABLED", "WEB_ALLOWLIST", "WEB_FETCH_CONFIRM"],
  },
  {
    id: "screen",
    name: "Захват и управление экраном",
    kind: "Экран · #6–7",
    summary: "Скриншоты для vision и опциональные клики",
    tags: ["SCREEN_ENABLED", "control", "vision"],
    enabledKey: "SCREEN_ENABLED",
    saveKeys: ["SCREEN_ENABLED", "SCREEN_CONTROL_ENABLED", "OS_PRIORITY"],
  },
  {
    id: "browser",
    name: "Браузер и история",
    kind: "Браузер · #8",
    summary: "Открытие URL и просмотр истории визитов",
    tags: ["BROWSER_ENABLED", "URL", "history"],
    enabledKey: "BROWSER_ENABLED",
    saveKeys: ["BROWSER_ENABLED", "BROWSER_PREFERRED", "BROWSER_OPEN_CONFIRM"],
  },
  {
    id: "messaging",
    name: "Мессенджеры",
    kind: "Telegram · WA · IG",
    summary: "Отправка сообщений от имени Mira",
    tags: ["MESSAGING_ENABLED", "Telegram", "bridge"],
    enabledKey: "MESSAGING_ENABLED",
    saveKeys: [
      "MESSAGING_ENABLED",
      "MESSAGING_MODE",
      "MESSAGING_CONFIRM",
      "MESSAGING_PRIMARY",
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_DEFAULT_CHAT_ID",
      "WHATSAPP_BRIDGE_URL",
      "INSTAGRAM_BRIDGE_URL",
    ],
  },
  {
    id: "blender",
    name: "Blender",
    kind: "3D · #13",
    summary: "Генерация простых сцен через bpy",
    tags: ["BLENDER_ENABLED", "dry-run", "bpy"],
    enabledKey: "BLENDER_ENABLED",
    saveKeys: ["BLENDER_ENABLED", "BLENDER_PATH", "BLENDER_MODE", "BLENDER_CONFIRM"],
  },
  {
    id: "future",
    name: "Камеры · IoT · почта · медиа",
    kind: "Future · F1–F7",
    summary: "Заготовки каналов — статусы из Electron",
    tags: ["F1", "F2", "F3", "F4", "F7"],
    saveKeys: [],
  },
];

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "web", label: "Веб" },
  { id: "screen", label: "Экран" },
  { id: "browser", label: "Браузер" },
  { id: "messaging", label: "Мессенджеры" },
  { id: "blender", label: "Blender" },
  { id: "future", label: "Future" },
];

const DEMO_BROWSERS: InstalledBrowser[] = [
  { id: "system", name: "Системный по умолчанию", path: null, installed: true },
  {
    id: "chrome",
    name: "Google Chrome",
    path: "/usr/bin/google-chrome",
    installed: true,
  },
  {
    id: "firefox",
    name: "Firefox",
    path: "/usr/bin/firefox",
    installed: true,
  },
  {
    id: "chromium",
    name: "Chromium",
    path: "/usr/bin/chromium",
    installed: true,
  },
];

const BRAND: Partial<Record<IntegId, OfficialBrandAsset>> = {
  browser: { file: "chrome.svg", bg: "#202124", scale: 0.78 },
  messaging: { file: "telegram.svg", bg: "#229ED9", scale: 0.82 },
  blender: { file: "blender.svg", bg: "#1D1D1D", scale: 0.78 },
  screen: { file: "windows.svg", bg: "#0B1A2A", scale: 0.72 },
};

function IntegChannelIcon({ id, size = 40 }: { id: IntegId; size?: number }) {
  const brand = BRAND[id];
  if (brand) {
    return <OfficialBrandIcon asset={brand} size={size} />;
  }

  const s = size;
  const common = {
    width: s,
    height: s,
    viewBox: "0 0 40 40",
    "aria-hidden": true as const,
  };

  if (id === "web") {
    return (
      <svg {...common}>
        <rect width="40" height="40" rx="10" fill="#0F766E" />
        <circle
          cx="20"
          cy="20"
          r="10"
          fill="none"
          stroke="#ECFDF5"
          strokeWidth="2"
        />
        <ellipse
          cx="20"
          cy="20"
          rx="4.5"
          ry="10"
          fill="none"
          stroke="#ECFDF5"
          strokeWidth="1.6"
        />
        <path
          d="M10 20h20M12.5 14.5h15M12.5 25.5h15"
          stroke="#ECFDF5"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect width="40" height="40" rx="10" fill="#312E81" />
      <path
        d="M12 26V14l8-4 8 4v12l-8 4-8-4z"
        fill="none"
        stroke="#E0E7FF"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M20 10v20M12 14l8 4 8-4" stroke="#E0E7FF" strokeWidth="1.5" />
    </svg>
  );
}

function PurposeBlock({ purpose, howto }: { purpose: string; howto: ReactNode }) {
  return (
    <div className="integ-help">
      <div className="integ-help-block">
        <span className="integ-help-label">Для чего нужно</span>
        <p>{purpose}</p>
      </div>
      <div className="integ-help-block">
        <span className="integ-help-label">Как настроить</span>
        <div className="integ-howto">{howto}</div>
      </div>
    </div>
  );
}

export function SettingsIntegrationsSection() {
  const [snap, setSnap] = useState<SettingsEnvSnapshot | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [webTest, setWebTest] = useState<string | null>(null);
  const [screenTest, setScreenTest] = useState<string | null>(null);
  const [browserTest, setBrowserTest] = useState<string | null>(null);
  const [messagingTest, setMessagingTest] = useState<string | null>(null);
  const [blenderTest, setBlenderTest] = useState<string | null>(null);
  const [futureStatus, setFutureStatus] = useState<string | null>(null);
  const [historyText, setHistoryText] = useState<string | null>(null);
  const [contactsText, setContactsText] = useState<string>("");
  const [tgChatId, setTgChatId] = useState("");
  const [live, setLive] = useState(Boolean(window.mira));
  const [browsers, setBrowsers] = useState<InstalledBrowser[]>(DEMO_BROWSERS);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [editorId, setEditorId] = useState<IntegId | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const s = await loadSettingsEnv();
      if (cancelled) return;
      setSnap(s);
      setDraft(s.values);
      setLive(Boolean(window.mira));

      if (!window.mira) {
        setContactsText("Контакты доступны в Electron");
        setBrowsers(DEMO_BROWSERS);
        return;
      }
      try {
        const [contacts, installed] = await Promise.all([
          window.mira.listMessengerContacts(),
          window.mira.listInstalledBrowsers?.() ??
            window.mira.getBrowserPolicy().then((p) => p.installed ?? []),
        ]);
        if (cancelled) return;
        setContactsText(
          contacts
            .map(
              (c) =>
                `${c.provider}: ${c.display_name} (${c.handle}) → ${c.chat_id}`,
            )
            .join("\n") || "Пока нет сохранённых контактов",
        );
        if (Array.isArray(installed) && installed.length) {
          setBrowsers(
            installed.filter(
              (b): b is InstalledBrowser =>
                Boolean(b) &&
                typeof b === "object" &&
                typeof (b as InstalledBrowser).id === "string" &&
                Boolean((b as InstalledBrowser).installed),
            ),
          );
        }
      } catch {
        if (!cancelled) setContactsText("Не удалось загрузить контакты");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function setField(key: string, value: string) {
    setDraft((prev) => ({ ...prev, [key]: String(value ?? "") }));
  }

  async function handleSave(group: string, keys: string[]) {
    setSavingKey(group);
    try {
      const patch: Record<string, string> = {};
      for (const key of keys) {
        const value = draft[key] ?? "";
        if (
          (key.endsWith("_TOKEN") || key.endsWith("_API_KEY")) &&
          (!value.trim() || value.trim().startsWith("••••"))
        ) {
          continue;
        }
        patch[key] = value;
      }
      const res = await saveSettingsEnv(patch);
      const values =
        res.snap?.values && typeof res.snap.values === "object"
          ? res.snap.values
          : {};
      const secretsSet =
        res.snap?.secretsSet && typeof res.snap.secretsSet === "object"
          ? res.snap.secretsSet
          : {};
      setSnap({
        values,
        secretsSet,
        source: res.snap?.source ?? (window.mira ? "electron" : "browser"),
        envFile: res.snap?.envFile,
      });
      setDraft((prev) => ({ ...prev, ...values }));
      setNotes((prev) => ({
        ...prev,
        [group]: res.detail || (res.ok ? "Сохранено" : "Ошибка сохранения"),
      }));
    } catch (err) {
      setNotes((prev) => ({
        ...prev,
        [group]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setSavingKey(null);
    }
  }

  async function toggleEnabled(meta: IntegMeta, enabled: boolean) {
    if (!meta.enabledKey) return;
    setField(meta.enabledKey, boolToEnv(enabled));
    await handleSave(meta.id, [meta.enabledKey]);
  }

  const counts = useMemo(() => {
    const out: Record<FilterId, number> = {
      all: INTEG_META.length,
      web: 0,
      screen: 0,
      browser: 0,
      messaging: 0,
      blender: 0,
      future: 0,
    };
    for (const item of INTEG_META) out[item.id] = 1;
    return out;
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return INTEG_META.filter((item) => {
      if (filter !== "all" && item.id !== filter) return false;
      if (!q) return true;
      const hay = [item.name, item.kind, item.summary, ...item.tags]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [filter, query]);

  const editor = editorId
    ? INTEG_META.find((m) => m.id === editorId) ?? null
    : null;

  if (!snap) {
    return <p className="muted">Загрузка интеграций…</p>;
  }

  function isEnabled(meta: IntegMeta): boolean {
    if (!meta.enabledKey) return true;
    return isTruthyEnv(draft[meta.enabledKey]);
  }

  function statusLine(meta: IntegMeta): string {
    if (meta.id === "future") {
      return futureStatus || "Статусы — по кнопке в карточке";
    }
    if (!meta.enabledKey) return meta.summary;
    return isTruthyEnv(draft[meta.enabledKey])
      ? "Включено"
      : "Выключено — включите переключателем или в настройках";
  }

  async function runQuickTest(id: IntegId) {
    if (!window.mira) return;
    if (id === "web") {
      setBusy("web");
      try {
        const res = await window.mira.testWeb("weather Moscow");
        setWebTest(`${res.ok ? "OK" : "FAIL"} — ${res.detail}`);
      } finally {
        setBusy(null);
      }
      return;
    }
    if (id === "screen") {
      setBusy("screen");
      try {
        const res = await window.mira.testScreen();
        setScreenTest(
          `${res.ok ? "OK" : "FAIL"} — ${res.detail}${res.path ? ` · ${res.path}` : ""}`,
        );
      } finally {
        setBusy(null);
      }
      return;
    }
    if (id === "browser") {
      setBusy("browser");
      try {
        const res = await window.mira.testBrowserOpen("https://example.com");
        setBrowserTest(`${res.ok ? "OK" : "FAIL"} — ${res.detail}`);
      } finally {
        setBusy(null);
      }
      return;
    }
    if (id === "messaging") {
      setBusy("messaging");
      try {
        const res = await window.mira.testMessagingSend({
          recipient: "Ивану",
          body: "тест из Настроек Mira",
        });
        setMessagingTest(`${res.ok ? "OK" : "FAIL"} — ${res.detail}`);
      } finally {
        setBusy(null);
      }
      return;
    }
    if (id === "blender") {
      setBusy("blender");
      try {
        const res = await window.mira.testBlenderDemo();
        setBlenderTest(
          `${res.ok ? "OK" : "FAIL"} · ${res.mode} — ${res.detail}`,
        );
      } finally {
        setBusy(null);
      }
      return;
    }
    if (id === "future") {
      setBusy("future");
      try {
        const [cams, iot, mail, media, events] = await Promise.all([
          window.mira.listCameras(),
          window.mira.listIotDevices(),
          window.mira.getMailPolicy(),
          window.mira.getMediaStatus(),
          window.mira.listCalendarEvents(),
        ]);
        setFutureStatus(
          `cams=${(cams as unknown[]).length} iot=${(iot as unknown[]).length} mail=${(mail as { mode: string }).mode} media=${JSON.stringify(media).slice(0, 80)} events=${(events as unknown[]).length}`,
        );
      } finally {
        setBusy(null);
      }
    }
  }

  function lastTest(id: IntegId): string | null {
    if (id === "web") return webTest;
    if (id === "screen") return screenTest;
    if (id === "browser") return browserTest;
    if (id === "messaging") return messagingTest;
    if (id === "blender") return blenderTest;
    if (id === "future") return futureStatus;
    return null;
  }

  function renderEditorBody(meta: IntegMeta): ReactNode {
    if (meta.id === "web") {
      return (
        <>
          <PurposeBlock
            purpose="Mira может искать в сети и читать страницы из allowlist — для фактов, погоды, новостей."
            howto={
              <ol>
                <li>Включите WEB_ENABLED.</li>
                <li>
                  Укажите домены allowlist через запятую (например duckduckgo.com).
                </li>
                <li>
                  WEB_FETCH_CONFIRM — спрашивать подтверждение перед загрузкой URL.
                </li>
                <li>Приватные/link-local адреса всегда блокируются (SSRF).</li>
              </ol>
            }
          />
          <div className="integ-fields">
            <ToggleRow
              label="Включить веб"
              hint="WEB_ENABLED"
              checked={isTruthyEnv(draft.WEB_ENABLED)}
              onChange={(on) => setField("WEB_ENABLED", boolToEnv(on))}
            />
            <Field
              label="Allowlist доменов"
              hint="WEB_ALLOWLIST — через запятую, без http://"
            >
              <input
                value={draft.WEB_ALLOWLIST ?? ""}
                onChange={(e) => setField("WEB_ALLOWLIST", e.target.value)}
                placeholder="duckduckgo.com,api.duckduckgo.com"
              />
            </Field>
            <ToggleRow
              label="Confirm перед fetch URL"
              hint="WEB_FETCH_CONFIRM — через ConfirmModal"
              checked={isTruthyEnv(draft.WEB_FETCH_CONFIRM)}
              onChange={(on) => setField("WEB_FETCH_CONFIRM", boolToEnv(on))}
            />
          </div>
        </>
      );
    }

    if (meta.id === "screen") {
      return (
        <>
          <PurposeBlock
            purpose="Скриншоты для vision и (опционально) клики/ввод. Опасно — по умолчанию control выключен."
            howto={
              <ol>
                <li>SCREEN_ENABLED — разрешить capture в `data/screenshots/`.</li>
                <li>
                  SCREEN_CONTROL_ENABLED — клик/ввод только после ConfirmModal
                  (по умолчанию выкл.). Нужны координаты, например «кликни 640, 360».
                </li>
                <li>OS_PRIORITY — порядок платформ, например linux,windows,macos.</li>
              </ol>
            }
          />
          <div className="integ-fields">
            <ToggleRow
              label="Захват экрана"
              hint="SCREEN_ENABLED"
              checked={isTruthyEnv(draft.SCREEN_ENABLED)}
              onChange={(on) => setField("SCREEN_ENABLED", boolToEnv(on))}
            />
            <ToggleRow
              label="Управление (клик/ввод)"
              hint="SCREEN_CONTROL_ENABLED — всегда с confirm"
              checked={isTruthyEnv(draft.SCREEN_CONTROL_ENABLED)}
              onChange={(on) =>
                setField("SCREEN_CONTROL_ENABLED", boolToEnv(on))
              }
            />
            <Field label="Приоритет ОС" hint="OS_PRIORITY">
              <input
                value={draft.OS_PRIORITY ?? ""}
                onChange={(e) => setField("OS_PRIORITY", e.target.value)}
                placeholder="linux,windows,macos"
              />
            </Field>
          </div>
        </>
      );
    }

    if (meta.id === "browser") {
      return (
        <>
          <PurposeBlock
            purpose="Mira открывает ссылки в выбранном браузере и может смотреть историю визитов (read-only)."
            howto={
              <ol>
                <li>Включите BROWSER_ENABLED.</li>
                <li>
                  BROWSER_PREFERRED — выберите из установленных браузеров на этой
                  машине (или «Системный»).
                </li>
                <li>BROWSER_OPEN_CONFIRM — спрашивать перед открытием.</li>
              </ol>
            }
          />
          <div className="integ-fields">
            <ToggleRow
              label="Браузер"
              hint="BROWSER_ENABLED"
              checked={isTruthyEnv(draft.BROWSER_ENABLED)}
              onChange={(on) => setField("BROWSER_ENABLED", boolToEnv(on))}
            />
            <Field
              label="Предпочтительный браузер"
              hint={
                live
                  ? `BROWSER_PREFERRED · найдено: ${browsers.length}`
                  : "BROWSER_PREFERRED · в demo показан примерный список; в Electron — установленные"
              }
            >
              <ThemeSelect
                aria-label="Предпочтительный браузер"
                value={
                  browsers.some((b) => b.id === draft.BROWSER_PREFERRED)
                    ? draft.BROWSER_PREFERRED!
                    : "system"
                }
                onChange={(v) => setField("BROWSER_PREFERRED", v)}
                options={(browsers.some((b) => b.id === "system")
                  ? browsers
                  : [
                      {
                        id: "system",
                        name: "Системный по умолчанию",
                        path: null,
                        installed: true,
                      },
                      ...browsers,
                    ]
                ).map((b) => ({
                  value: b.id,
                  label: b.path ? `${b.name} · ${b.path}` : b.name,
                }))}
              />
            </Field>
            <ToggleRow
              label="Confirm перед открытием URL"
              hint="BROWSER_OPEN_CONFIRM"
              checked={isTruthyEnv(draft.BROWSER_OPEN_CONFIRM)}
              onChange={(on) =>
                setField("BROWSER_OPEN_CONFIRM", boolToEnv(on))
              }
            />
            {historyText ? (
              <pre className="mono integ-pre">{historyText}</pre>
            ) : null}
          </div>
        </>
      );
    }

    if (meta.id === "messaging") {
      return (
        <>
          <PurposeBlock
            purpose="Отправка сообщений от имени Mira. Telegram — основной канал; WA/IG через опциональный bridge или dry-run."
            howto={
              <ol>
                <li>
                  Создайте бота у{" "}
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noreferrer"
                  >
                    @BotFather
                  </a>{" "}
                  → получите TELEGRAM_BOT_TOKEN.
                </li>
                <li>
                  Узнайте chat id (напишите боту, затем через getUpdates или
                  @userinfobot) → TELEGRAM_DEFAULT_CHAT_ID.
                </li>
                <li>
                  MESSAGING_MODE: dry-run (безопасно) или live (реальная отправка).
                </li>
                <li>Отправка всегда через ConfirmModal.</li>
              </ol>
            }
          />
          <div className="integ-fields">
            <ToggleRow
              label="Мессенджеры"
              hint="MESSAGING_ENABLED"
              checked={isTruthyEnv(draft.MESSAGING_ENABLED)}
              onChange={(on) => setField("MESSAGING_ENABLED", boolToEnv(on))}
            />
            <div className="integ-grid-2">
              <Field label="Режим" hint="MESSAGING_MODE">
                <select
                  value={draft.MESSAGING_MODE || "dry-run"}
                  onChange={(e) => setField("MESSAGING_MODE", e.target.value)}
                >
                  <option value="dry-run">dry-run (без отправки)</option>
                  <option value="live">live</option>
                </select>
              </Field>
              <Field label="Primary" hint="MESSAGING_PRIMARY">
                <select
                  value={draft.MESSAGING_PRIMARY || "telegram"}
                  onChange={(e) => setField("MESSAGING_PRIMARY", e.target.value)}
                >
                  <option value="telegram">Telegram</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="instagram">Instagram</option>
                </select>
              </Field>
            </div>
            <ToggleRow
              label="Confirm перед отправкой"
              hint="MESSAGING_CONFIRM"
              checked={isTruthyEnv(draft.MESSAGING_CONFIRM)}
              onChange={(on) => setField("MESSAGING_CONFIRM", boolToEnv(on))}
            />
            <SecretField
              label="TELEGRAM_BOT_TOKEN"
              value={draft.TELEGRAM_BOT_TOKEN ?? ""}
              secretSet={snap!.secretsSet.TELEGRAM_BOT_TOKEN}
              onChange={(v) => setField("TELEGRAM_BOT_TOKEN", v)}
              hint="Токен вида 123456:ABC… от @BotFather"
            />
            <Field
              label="TELEGRAM_DEFAULT_CHAT_ID"
              hint="Числовой id чата по умолчанию"
            >
              <input
                value={draft.TELEGRAM_DEFAULT_CHAT_ID ?? ""}
                onChange={(e) =>
                  setField("TELEGRAM_DEFAULT_CHAT_ID", e.target.value)
                }
                placeholder="123456789"
              />
            </Field>
            <div className="integ-grid-2">
              <Field label="WhatsApp bridge URL" hint="WHATSAPP_BRIDGE_URL">
                <input
                  value={draft.WHATSAPP_BRIDGE_URL ?? ""}
                  onChange={(e) =>
                    setField("WHATSAPP_BRIDGE_URL", e.target.value)
                  }
                  placeholder="http://127.0.0.1:8787"
                />
              </Field>
              <Field label="Instagram bridge URL" hint="INSTAGRAM_BRIDGE_URL">
                <input
                  value={draft.INSTAGRAM_BRIDGE_URL ?? ""}
                  onChange={(e) =>
                    setField("INSTAGRAM_BRIDGE_URL", e.target.value)
                  }
                  placeholder="http://127.0.0.1:8788"
                />
              </Field>
            </div>
            <div className="integ-subblock">
              <span className="settings-field-label">Контакты</span>
              <pre className="mono integ-pre">{contactsText || "…"}</pre>
              <Field label="Chat ID для контакта «Иван» (Telegram)">
                <input
                  value={tgChatId}
                  onChange={(e) => setTgChatId(e.target.value)}
                  placeholder="например 123456789"
                />
              </Field>
              <button
                type="button"
                className="btn"
                disabled={busy !== null || !live || !tgChatId.trim()}
                onClick={() => {
                  if (!window.mira) return;
                  setBusy("contact");
                  void window.mira
                    .upsertMessengerContact({
                      id: "tg-ivan",
                      provider: "telegram",
                      displayName: "Иван",
                      handle: "@ivan_demo",
                      chatId: tgChatId.trim(),
                    })
                    .then((row) => {
                      setContactsText((prev) =>
                        `${row.provider}: ${row.display_name} (${row.handle}) → ${row.chat_id}\n${prev}`
                          .split("\n")
                          .filter((line, i, arr) => arr.indexOf(line) === i)
                          .join("\n"),
                      );
                    })
                    .finally(() => setBusy(null));
                }}
              >
                Сохранить chat id контакта
              </button>
            </div>
          </div>
        </>
      );
    }

    if (meta.id === "blender") {
      return (
        <>
          <PurposeBlock
            purpose="Генерация простых сцен в Blender (куб, свет, камера). Skill blender-scene — on-demand."
            howto={
              <ol>
                <li>Установите Blender и укажите BLENDER_PATH при необходимости.</li>
                <li>Начните с BLENDER_MODE=dry-run.</li>
                <li>BLENDER_CONFIRM — подтверждение перед запуском.</li>
              </ol>
            }
          />
          <div className="integ-fields">
            <ToggleRow
              label="Blender"
              hint="BLENDER_ENABLED"
              checked={isTruthyEnv(draft.BLENDER_ENABLED)}
              onChange={(on) => setField("BLENDER_ENABLED", boolToEnv(on))}
            />
            <Field label="Путь к Blender" hint="BLENDER_PATH — пусто = автопоиск">
              <input
                value={draft.BLENDER_PATH ?? ""}
                onChange={(e) => setField("BLENDER_PATH", e.target.value)}
                placeholder="/usr/bin/blender"
              />
            </Field>
            <div className="integ-grid-2">
              <Field label="Режим" hint="BLENDER_MODE">
                <select
                  value={draft.BLENDER_MODE || "dry-run"}
                  onChange={(e) => setField("BLENDER_MODE", e.target.value)}
                >
                  <option value="dry-run">dry-run</option>
                  <option value="live">live</option>
                </select>
              </Field>
              <ToggleRow
                label="Confirm"
                hint="BLENDER_CONFIRM"
                checked={isTruthyEnv(draft.BLENDER_CONFIRM)}
                onChange={(on) => setField("BLENDER_CONFIRM", boolToEnv(on))}
              />
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        <PurposeBlock
          purpose="Заготовки каналов F1–F7. Управление через Диалог; статусы читаются из Electron."
          howto={
            <p>
              F1 камеры · F2 IoT · F3 календарь · F4 почта · F5 файлы · F7 медиа —
              профили в Общих (F10).
            </p>
          }
        />
        <p className="muted" style={{ margin: 0 }}>
          Отдельные API-поля появятся по мере подключения каналов. Сейчас —
          проверка доступности stubs.
        </p>
      </>
    );
  }

  function renderEditorFooter(meta: IntegMeta): ReactNode {
    if (meta.id === "future") {
      return (
        <div className="integ-actions">
          <button
            type="button"
            className="btn"
            disabled={busy !== null || !live}
            onClick={() => void runQuickTest("future")}
          >
            Статус F1/F2/F3/F4/F7
          </button>
          {futureStatus ? <span className="chip">{futureStatus}</span> : null}
          <button
            type="button"
            className="btn"
            onClick={() => setEditorId(null)}
          >
            Закрыть
          </button>
        </div>
      );
    }

    const extra =
      meta.id === "browser" ? (
        <button
          type="button"
          className="btn"
          disabled={busy !== null || !live}
          onClick={() => {
            if (!window.mira) return;
            setBusy("history");
            void window.mira
              .searchBrowserHistory("")
              .then((rows) => {
                setHistoryText(
                  rows.length
                    ? rows
                        .slice(0, 8)
                        .map((r) => `${r.title}\n  ${r.url}`)
                        .join("\n")
                    : "(пусто)",
                );
              })
              .finally(() => setBusy(null));
          }}
        >
          История
        </button>
      ) : null;

    return (
      <SaveRow
        saving={savingKey === meta.id}
        note={notes[meta.id]}
        onSave={() => void handleSave(meta.id, meta.saveKeys)}
      >
        <button
          type="button"
          className="btn"
          disabled={busy !== null || !live}
          onClick={() => void runQuickTest(meta.id)}
        >
          {meta.id === "web"
            ? "Тест web.search"
            : meta.id === "screen"
              ? "Тест screen.capture"
              : meta.id === "browser"
                ? "Тест open URL"
                : meta.id === "messaging"
                  ? "Тест send"
                  : "Тест демо-сцены"}
        </button>
        {extra}
        {lastTest(meta.id) ? (
          <span className="chip">{lastTest(meta.id)}</span>
        ) : null}
        <button
          type="button"
          className="btn"
          onClick={() => setEditorId(null)}
        >
          Закрыть
        </button>
      </SaveRow>
    );
  }

  const modal =
    editor &&
    createPortal(
      <div
        className="modal-backdrop"
        role="presentation"
        onClick={() => {
          if (savingKey === null) setEditorId(null);
        }}
      >
        <form
          className="modal modal-wide paths-edit-modal integ-edit-modal modal-resizable"
          role="dialog"
          aria-modal="true"
          aria-labelledby="integ-edit-title"
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (editor.saveKeys.length) {
              void handleSave(editor.id, editor.saveKeys);
            }
          }}
        >
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <span className="paths-card-icon" aria-hidden>
              <IntegChannelIcon id={editor.id} size={40} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 id="integ-edit-title" style={{ margin: 0 }}>
                {editor.name}
              </h2>
              <div className="paths-card-kind">{editor.kind}</div>
            </div>
          </div>

          {renderEditorBody(editor)}
          <div className="integ-footer">{renderEditorFooter(editor)}</div>
        </form>
      </div>,
      document.body,
    );

  const enabledCount = INTEG_META.filter((m) => isEnabled(m)).length;

  return (
    <div className="stack paths-panel integ-paths-panel">
      <div className="row paths-header" style={{ flexWrap: "wrap", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Интеграции</h2>
            <span className="muted">
              {enabledCount} из {INTEG_META.length} вкл.
            </span>
            <StubBadge label="built-in" />
          </div>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Встроенные каналы Mira — как карточки в Путях. Нажмите «Настроить»,
            чтобы открыть поля и тесты. Раздел{" "}
            <strong>MCP</strong> — отдельные внешние коннекторы.
            {snap.source === "browser"
              ? " Сейчас demo-браузер: значения в localStorage."
              : " Значения пишутся в локальный `.env`."}
          </p>
        </div>
      </div>

      {!live ? (
        <p className="integ-banner">
          Тесты IPC (web / screen / browser / messaging) работают в приложении
          Electron. Поля и сохранение доступны и здесь.
        </p>
      ) : null}

      <div className="row paths-toolbar" style={{ flexWrap: "wrap", gap: 10 }}>
        <label className="paths-search">
          <span className="sr-only">Поиск</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти канал, тег или ключ"
            aria-label="Найти канал, тег или ключ"
          />
        </label>
        <div className="paths-filters" role="tablist" aria-label="Фильтр">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              className={`paths-filter-btn ${filter === id ? "is-active" : ""}`}
              onClick={() => setFilter(id)}
            >
              {label} {counts[id]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Ничего не найдено по запросу.
        </p>
      ) : (
        <div className="paths-grid">
          {filtered.map((item) => {
            const on = isEnabled(item);
            const test = lastTest(item.id);
            return (
              <article
                key={item.id}
                className={`paths-card panel ${on ? "is-enabled" : "is-disabled"}`}
              >
                <div className="paths-card-head">
                  <span className="paths-card-icon" aria-hidden>
                    <IntegChannelIcon id={item.id} size={40} />
                  </span>
                  <div className="paths-card-title">
                    <div className="paths-card-title-row">
                      <strong className="paths-card-name">{item.name}</strong>
                      <span
                        className={`paths-status-dot ${on ? "is-on" : ""}`}
                        title={on ? "Включено" : "Выключено"}
                        aria-hidden
                      />
                    </div>
                    <div className="paths-card-kind">{item.kind}</div>
                  </div>
                  {item.enabledKey ? (
                    <label
                      className="paths-card-enable"
                      title="Включить канал"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        aria-label={`«${item.name}» включён`}
                        onChange={(e) =>
                          void toggleEnabled(item, e.target.checked)
                        }
                      />
                    </label>
                  ) : null}
                </div>

                <div
                  className={`paths-card-path mono ${on ? "" : "is-empty"}`}
                  title={item.summary}
                >
                  {statusLine(item)}
                </div>

                <div className="paths-card-tags">
                  {item.tags.map((tag) => (
                    <span key={tag} className="paths-tag-chip is-readonly">
                      {tag}
                    </span>
                  ))}
                </div>

                {test ? (
                  <span className="chip" style={{ alignSelf: "flex-start" }}>
                    {test}
                  </span>
                ) : null}

                <div className="row paths-card-actions">
                  {item.id !== "future" ? (
                    <button
                      type="button"
                      className="btn paths-open-btn"
                      disabled={busy !== null || !live}
                      onClick={() => void runQuickTest(item.id)}
                    >
                      Тест
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn paths-open-btn"
                      disabled={busy !== null || !live}
                      onClick={() => void runQuickTest("future")}
                    >
                      Статус
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn paths-edit-btn"
                    onClick={() => setEditorId(item.id)}
                  >
                    Настроить
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {modal}
    </div>
  );
}
