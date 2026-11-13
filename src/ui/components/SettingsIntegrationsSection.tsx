import { useEffect, useState } from "react";
import { StubBadge } from "./StubBadge";
import {
  Field,
  IntegCard,
  SaveRow,
  SecretField,
  ToggleRow,
} from "./SettingsFormBits";
import { ThemeSelect } from "./ThemeSelect";
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

  if (!snap) {
    return <p className="muted">Загрузка интеграций…</p>;
  }

  return (
    <>
      <div className="row">
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Интеграции</h2>
        <StubBadge label="built-in" />
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Встроенные каналы Mira (web, экран, браузер, мессенджеры, Blender) — не
        путать с разделом <strong>MCP</strong> (стандартные внешние коннекторы).
        Включите нужное, заполните ключи и сохраните.
        {snap?.source === "browser"
          ? " Сейчас demo-браузер: значения в localStorage; в Electron — в `.env`."
          : " Значения пишутся в локальный `.env`."}
      </p>
      {!live ? (
        <p className="integ-banner">
          Тесты IPC (web / screen / browser / messaging) работают в приложении
          Electron. Поля и сохранение доступны и здесь.
        </p>
      ) : null}

      <IntegCard
        kicker="Интернет · #4"
        title="Веб-поиск и fetch"
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
        footer={
          <SaveRow
            saving={savingKey === "web"}
            note={notes.web}
            onSave={() =>
              void handleSave("web", [
                "WEB_ENABLED",
                "WEB_ALLOWLIST",
                "WEB_FETCH_CONFIRM",
              ])
            }
          >
            <button
              type="button"
              className="btn"
              disabled={busy !== null || !live}
              onClick={() => {
                if (!window.mira) return;
                setBusy("web");
                void window.mira
                  .testWeb("weather Moscow")
                  .then((res) => {
                    setWebTest(`${res.ok ? "OK" : "FAIL"} — ${res.detail}`);
                  })
                  .finally(() => setBusy(null));
              }}
            >
              Тест web.search
            </button>
            {webTest ? <span className="chip">{webTest}</span> : null}
          </SaveRow>
        }
      >
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
      </IntegCard>

      <IntegCard
        kicker="Экран · #6–7"
        title="Захват и управление экраном"
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
        footer={
          <SaveRow
            saving={savingKey === "screen"}
            note={notes.screen}
            onSave={() =>
              void handleSave("screen", [
                "SCREEN_ENABLED",
                "SCREEN_CONTROL_ENABLED",
                "OS_PRIORITY",
              ])
            }
          >
            <button
              type="button"
              className="btn"
              disabled={busy !== null || !live}
              onClick={() => {
                if (!window.mira) return;
                setBusy("screen");
                void window.mira
                  .testScreen()
                  .then((res) => {
                    setScreenTest(
                      `${res.ok ? "OK" : "FAIL"} — ${res.detail}${res.path ? ` · ${res.path}` : ""}`,
                    );
                  })
                  .finally(() => setBusy(null));
              }}
            >
              Тест screen.capture
            </button>
            {screenTest ? <span className="chip">{screenTest}</span> : null}
          </SaveRow>
        }
      >
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
          onChange={(on) => setField("SCREEN_CONTROL_ENABLED", boolToEnv(on))}
        />
        <Field label="Приоритет ОС" hint="OS_PRIORITY">
          <input
            value={draft.OS_PRIORITY ?? ""}
            onChange={(e) => setField("OS_PRIORITY", e.target.value)}
            placeholder="linux,windows,macos"
          />
        </Field>
      </IntegCard>

      <IntegCard
        kicker="Браузер · #8"
        title="Открытие URL и история"
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
        footer={
          <SaveRow
            saving={savingKey === "browser"}
            note={notes.browser}
            onSave={() =>
              void handleSave("browser", [
                "BROWSER_ENABLED",
                "BROWSER_PREFERRED",
                "BROWSER_OPEN_CONFIRM",
              ])
            }
          >
            <button
              type="button"
              className="btn"
              disabled={busy !== null || !live}
              onClick={() => {
                if (!window.mira) return;
                setBusy("browser");
                void window.mira
                  .testBrowserOpen("https://example.com")
                  .then((res) => {
                    setBrowserTest(`${res.ok ? "OK" : "FAIL"} — ${res.detail}`);
                  })
                  .finally(() => setBusy(null));
              }}
            >
              Тест open URL
            </button>
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
            {browserTest ? <span className="chip">{browserTest}</span> : null}
          </SaveRow>
        }
      >
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
          onChange={(on) => setField("BROWSER_OPEN_CONFIRM", boolToEnv(on))}
        />
        {historyText ? (
          <pre className="mono integ-pre">{historyText}</pre>
        ) : null}
      </IntegCard>

      <IntegCard
        kicker="Мессенджеры · #12"
        title="Telegram (live) · WhatsApp / Instagram (bridge)"
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
        footer={
          <SaveRow
            saving={savingKey === "messaging"}
            note={notes.messaging}
            onSave={() =>
              void handleSave("messaging", [
                "MESSAGING_ENABLED",
                "MESSAGING_MODE",
                "MESSAGING_CONFIRM",
                "MESSAGING_PRIMARY",
                "TELEGRAM_BOT_TOKEN",
                "TELEGRAM_DEFAULT_CHAT_ID",
                "WHATSAPP_BRIDGE_URL",
                "INSTAGRAM_BRIDGE_URL",
              ])
            }
          >
            <button
              type="button"
              className="btn"
              disabled={busy !== null || !live}
              onClick={() => {
                if (!window.mira) return;
                setBusy("messaging");
                void window.mira
                  .testMessagingSend({
                    recipient: "Ивану",
                    body: "тест из Настроек Mira",
                  })
                  .then((res) => {
                    setMessagingTest(
                      `${res.ok ? "OK" : "FAIL"} — ${res.detail}`,
                    );
                  })
                  .finally(() => setBusy(null));
              }}
            >
              Тест send
            </button>
            {messagingTest ? (
              <span className="chip">{messagingTest}</span>
            ) : null}
          </SaveRow>
        }
      >
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
          secretSet={snap.secretsSet.TELEGRAM_BOT_TOKEN}
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
              onChange={(e) => setField("WHATSAPP_BRIDGE_URL", e.target.value)}
              placeholder="http://127.0.0.1:8787"
            />
          </Field>
          <Field label="Instagram bridge URL" hint="INSTAGRAM_BRIDGE_URL">
            <input
              value={draft.INSTAGRAM_BRIDGE_URL ?? ""}
              onChange={(e) => setField("INSTAGRAM_BRIDGE_URL", e.target.value)}
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
      </IntegCard>

      <IntegCard
        kicker="Blender · #13"
        title="3D-сцены через bpy"
        purpose="Генерация простых сцен в Blender (куб, свет, камера). Skill blender-scene — on-demand."
        howto={
          <ol>
            <li>Установите Blender и укажите BLENDER_PATH при необходимости.</li>
            <li>Начните с BLENDER_MODE=dry-run.</li>
            <li>BLENDER_CONFIRM — подтверждение перед запуском.</li>
          </ol>
        }
        footer={
          <SaveRow
            saving={savingKey === "blender"}
            note={notes.blender}
            onSave={() =>
              void handleSave("blender", [
                "BLENDER_ENABLED",
                "BLENDER_PATH",
                "BLENDER_MODE",
                "BLENDER_CONFIRM",
              ])
            }
          >
            <button
              type="button"
              className="btn"
              disabled={busy !== null || !live}
              onClick={() => {
                if (!window.mira) return;
                setBusy("blender");
                void window.mira
                  .testBlenderDemo()
                  .then((res) => {
                    setBlenderTest(
                      `${res.ok ? "OK" : "FAIL"} · ${res.mode} — ${res.detail}`,
                    );
                  })
                  .finally(() => setBusy(null));
              }}
            >
              Тест демо-сцены
            </button>
            {blenderTest ? <span className="chip">{blenderTest}</span> : null}
          </SaveRow>
        }
      >
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
      </IntegCard>

      <IntegCard
        kicker="Future"
        title="Камеры · IoT · почта · медиа"
        purpose="Заготовки каналов F1–F7. Управление через Диалог; статусы читаются из Electron."
        howto={
          <p>
            F1 камеры · F2 IoT · F3 календарь · F4 почта · F5 файлы · F7 медиа —
            профили в Общих (F10).
          </p>
        }
        footer={
          <div className="integ-actions">
            <button
              type="button"
              className="btn"
              disabled={busy !== null || !live}
              onClick={() => {
                if (!window.mira) return;
                setBusy("future");
                void Promise.all([
                  window.mira.listCameras(),
                  window.mira.listIotDevices(),
                  window.mira.getMailPolicy(),
                  window.mira.getMediaStatus(),
                  window.mira.listCalendarEvents(),
                ])
                  .then(([cams, iot, mail, media, events]) => {
                    setFutureStatus(
                      `cams=${(cams as unknown[]).length} iot=${(iot as unknown[]).length} mail=${(mail as { mode: string }).mode} media=${JSON.stringify(media).slice(0, 80)} events=${(events as unknown[]).length}`,
                    );
                  })
                  .finally(() => setBusy(null));
              }}
            >
              Статус F1/F2/F3/F4/F7
            </button>
            {futureStatus ? <span className="chip">{futureStatus}</span> : null}
          </div>
        }
      >
        <p className="muted" style={{ margin: 0 }}>
          Отдельные API-поля появятся по мере подключения каналов. Сейчас —
          проверка доступности stubs.
        </p>
      </IntegCard>
    </>
  );
}
