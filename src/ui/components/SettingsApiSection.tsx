import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { StubBadge } from "./StubBadge";
import {
  Field,
  SaveRow,
  SecretField,
  ToggleRow,
} from "./SettingsFormBits";
import { SettingsElevenLabsSection } from "./SettingsElevenLabsSection";
import { ThemeSelect } from "./ThemeSelect";
import {
  OfficialBrandIcon,
  type OfficialBrandAsset,
} from "./OfficialBrandIcon";
import {
  boolToEnv,
  isTruthyEnv,
  loadSettingsEnv,
  modelForProvider,
  saveSettingsEnv,
  type SettingsEnvSnapshot,
} from "../settingsEnvClient";

type ProviderId =
  | "mock"
  | "openai"
  | "claude"
  | "gemini"
  | "grok"
  | "offline"
  | "elevenlabs";

type CardId = Exclude<ProviderId, "mock"> | "llm";

type ApiCard = {
  id: CardId;
  name: string;
  kind: string;
  summary: string;
  tags: string[];
  providerId?: ProviderId;
  secretKey?: string;
};

const PROVIDERS: Array<{ id: ProviderId; label: string }> = [
  { id: "mock", label: "Mock (без ключа)" },
  { id: "openai", label: "OpenAI" },
  { id: "claude", label: "Anthropic Claude" },
  { id: "gemini", label: "Google Gemini" },
  { id: "grok", label: "xAI Grok" },
  { id: "offline", label: "Offline" },
];

const PROVIDER_MODEL_HINT: Record<string, string> = {
  grok: "grok-4.7 / grok-4.6 / grok-4.3",
  openai: "gpt-4o-mini / gpt-4o",
  claude: "claude-3-5-sonnet-latest",
  gemini: "gemini-2.0-flash",
  mock: "не используется",
  offline: "локальный id модели",
};

const API_CARDS: ApiCard[] = [
  {
    id: "llm",
    name: "Активный LLM",
    kind: "Провайдер · модель",
    summary: "Какой ИИ отвечает в Диалоге",
    tags: ["LLM_PROVIDER", "VISION"],
  },
  {
    id: "openai",
    name: "OpenAI",
    kind: "Chat · Vision · Proxy",
    summary: "OpenAI и совместимые endpoint’ы",
    tags: ["OPENAI_API_KEY", "BASE_URL"],
    providerId: "openai",
    secretKey: "OPENAI_API_KEY",
  },
  {
    id: "claude",
    name: "Anthropic Claude",
    kind: "Длинный контекст",
    summary: "Модели Claude для диалога",
    tags: ["ANTHROPIC_API_KEY"],
    providerId: "claude",
    secretKey: "ANTHROPIC_API_KEY",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    kind: "AI Studio",
    summary: "Gemini через Google AI Studio",
    tags: ["GEMINI_API_KEY"],
    providerId: "gemini",
    secretKey: "GEMINI_API_KEY",
  },
  {
    id: "grok",
    name: "xAI Grok",
    kind: "Grok",
    summary: "Модели Grok от xAI",
    tags: ["XAI_API_KEY"],
    providerId: "grok",
    secretKey: "XAI_API_KEY",
  },
  {
    id: "offline",
    name: "Offline",
    kind: "Локально",
    summary: "Локальная модель без облака",
    tags: ["OFFLINE_MODEL_PATH"],
    providerId: "offline",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    kind: "Cloud TTS",
    summary: "Нейронная озвучка ответов",
    tags: ["ELEVENLABS_API_KEY", "Voice"],
    secretKey: "ELEVENLABS_API_KEY",
  },
];

const BRAND: Partial<Record<CardId, OfficialBrandAsset>> = {
  openai: { file: "openai.svg", bg: "#10A37F", scale: 0.62 },
  claude: { file: "anthropic.svg", bg: "#D4A27F", scale: 0.55 },
  gemini: { file: "gemini.svg", bg: "#0B1220", scale: 0.78 },
  grok: { file: "xai.png", bg: "#000000", scale: 0.78 },
  elevenlabs: { file: "elevenlabs.svg", bg: "#000000", scale: 0.55 },
};

function ApiBrandIcon({ id, size = 40 }: { id: CardId; size?: number }) {
  const brand = BRAND[id];
  if (brand) return <OfficialBrandIcon asset={brand} size={size} />;

  const common = {
    width: size,
    height: size,
    viewBox: "0 0 40 40",
    "aria-hidden": true as const,
  };

  if (id === "llm") {
    return (
      <svg {...common}>
        <defs>
          <linearGradient id="api-llm-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#6366F1" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="10" fill="url(#api-llm-g)" />
        <circle cx="20" cy="20" r="7" fill="none" stroke="#fff" strokeWidth="2" />
        <circle cx="20" cy="20" r="2.5" fill="#fff" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect width="40" height="40" rx="10" fill="#334155" />
      <path
        d="M14 26V14h12v12"
        fill="none"
        stroke="#E2E8F0"
        strokeWidth="1.8"
      />
      <path d="M14 20h12M20 14v12" stroke="#E2E8F0" strokeWidth="1.6" />
    </svg>
  );
}

export function SettingsApiSection() {
  const [snap, setSnap] = useState<SettingsEnvSnapshot | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "ready" | "missing">("all");
  const [editorId, setEditorId] = useState<CardId | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadSettingsEnv().then((s) => {
      if (cancelled) return;
      setSnap(s);
      setDraft(s.values);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function setField(key: string, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(group: string, keys: string[]) {
    setSavingKey(group);
    const patch: Record<string, string> = {};
    for (const key of keys) {
      const value = draft[key] ?? "";
      if (
        (key.endsWith("_API_KEY") || key === "TELEGRAM_BOT_TOKEN") &&
        (!value.trim() || value.trim().startsWith("••••"))
      ) {
        continue;
      }
      patch[key] = value;
    }
    if (!Object.keys(patch).length) {
      setNotes((prev) => ({
        ...prev,
        [group]: "Нечего сохранять (секрет без изменений)",
      }));
      setSavingKey(null);
      return;
    }
    const res = await saveSettingsEnv(patch);
    setSnap(res.snap);
    setDraft((prev) => ({ ...prev, ...res.snap.values }));
    setNotes((prev) => ({ ...prev, [group]: res.detail }));
    setSavingKey(null);
  }

  async function handleDeleteKey(group: string, secretKey: string) {
    setSavingKey(`del-${group}`);
    setDraft((prev) => ({ ...prev, [secretKey]: "" }));
    const res = await saveSettingsEnv(
      { [secretKey]: "" },
      { clearSecrets: true },
    );
    setSnap(res.snap);
    setDraft((prev) => ({ ...prev, ...res.snap.values, [secretKey]: "" }));
    setNotes((prev) => ({
      ...prev,
      [group]: `Ключ ${secretKey} удалён`,
    }));
    setSavingKey(null);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      if (window.mira?.testLlm) {
        const res = await window.mira.testLlm();
        setTestResult(`${res.ok ? "OK" : "FAIL"} — ${res.detail}`);
        return;
      }
      const {
        getRawBrowserSettings,
        resolveBrowserLlmConfig,
        SETTINGS_SECRET_KEYS,
      } = await import("../settingsEnvClient");
      const merged = { ...getRawBrowserSettings() };
      for (const [key, value] of Object.entries(draft)) {
        if (SETTINGS_SECRET_KEYS.has(key) && value.startsWith("••••")) continue;
        merged[key] = value;
      }
      const cfg = resolveBrowserLlmConfig(merged);
      if (cfg.provider === "mock") {
        setTestResult("FAIL — нет ключа (выберите grok/openai и сохраните)");
        return;
      }
      if (cfg.provider === "claude" || cfg.provider === "gemini") {
        const res = await fetch(
          cfg.provider === "claude"
            ? `${cfg.baseUrl}/v1/messages`
            : `${cfg.baseUrl}/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`,
          {
            method: "POST",
            headers:
              cfg.provider === "claude"
                ? {
                    "x-api-key": cfg.apiKey,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                    "anthropic-dangerous-direct-browser-access": "true",
                  }
                : { "Content-Type": "application/json" },
            body: JSON.stringify(
              cfg.provider === "claude"
                ? {
                    model: cfg.model,
                    max_tokens: 16,
                    messages: [{ role: "user", content: "ping" }],
                  }
                : { contents: [{ parts: [{ text: "ping" }] }] },
            ),
          },
        );
        setTestResult(
          res.ok
            ? `OK · ${cfg.label} (browser proxy)`
            : `FAIL · HTTP ${res.status} — ${(await res.text()).slice(0, 160)}`,
        );
        return;
      }
      const res = await fetch(`${cfg.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
      });
      setTestResult(
        res.ok
          ? `OK · ${cfg.label} (browser proxy)`
          : `FAIL · HTTP ${res.status} — ${(await res.text()).slice(0, 160)}`,
      );
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }

  function isReady(card: ApiCard): boolean {
    if (card.id === "llm") return (draft.LLM_PROVIDER || "mock") !== "mock";
    if (card.id === "offline") return (draft.LLM_PROVIDER || "") === "offline";
    if (!card.secretKey || !snap) return false;
    return Boolean(snap.secretsSet[card.secretKey]);
  }

  function statusLine(card: ApiCard): string {
    if (card.id === "llm") {
      const p = draft.LLM_PROVIDER || "mock";
      const label = PROVIDERS.find((x) => x.id === p)?.label ?? p;
      return `${label} · ${draft.LLM_MODEL || "модель не задана"}`;
    }
    if (card.id === "offline") {
      return draft.OFFLINE_MODEL_PATH?.trim()
        ? draft.OFFLINE_MODEL_PATH
        : "Путь модели не задан";
    }
    if (!card.secretKey) return card.summary;
    return isReady(card) ? "Ключ сохранён" : "Ключ не задан — нажмите «Настроить»";
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return API_CARDS.filter((card) => {
      const ready = isReady(card);
      if (filter === "ready" && !ready) return false;
      if (filter === "missing" && ready) return false;
      if (!q) return true;
      const hay = [card.name, card.kind, card.summary, ...card.tags]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [query, filter, draft, snap]);

  const counts = useMemo(() => {
    let ready = 0;
    for (const c of API_CARDS) if (isReady(c)) ready += 1;
    return { all: API_CARDS.length, ready, missing: API_CARDS.length - ready };
  }, [draft, snap]);

  const editor = editorId
    ? API_CARDS.find((c) => c.id === editorId) ?? null
    : null;
  const provider = draft.LLM_PROVIDER || "mock";
  const activeProvider = PROVIDERS.find((p) => p.id === provider)?.label ?? provider;

  if (!snap) {
    return <p className="muted">Загрузка настроек API…</p>;
  }

  function renderEditorBody(card: ApiCard): ReactNode {
    if (card.id === "elevenlabs") {
      return <SettingsElevenLabsSection plain />;
    }

    if (card.id === "llm") {
      return (
        <>
          <div className="integ-help">
            <div className="integ-help-block">
              <span className="integ-help-label">Для чего нужно</span>
              <p>
                Выбирает, какой ИИ отвечает в Диалоге. Без ключа — mock-ответы
                для демо UI.
              </p>
            </div>
            <div className="integ-help-block">
              <span className="integ-help-label">Как настроить</span>
              <ul className="integ-howto">
                <li>Выберите провайдера ниже.</li>
                <li>Вставьте API-ключ в карточке сервиса.</li>
                <li>«Тест соединения» проверяет активный провайдер.</li>
              </ul>
            </div>
          </div>
          <div className="integ-fields">
            <Field label="Провайдер" hint="Переменная LLM_PROVIDER">
              <ThemeSelect
                aria-label="Провайдер LLM"
                value={provider}
                options={PROVIDERS.map((p) => ({
                  value: p.id,
                  label: p.label,
                }))}
                onChange={(next) => {
                  setDraft((prev) => ({
                    ...prev,
                    LLM_PROVIDER: next,
                    LLM_MODEL: modelForProvider(next, prev.LLM_MODEL),
                  }));
                }}
              />
            </Field>
            <Field
              label="Модель"
              hint={`LLM_MODEL — для ${provider}: ${PROVIDER_MODEL_HINT[provider] ?? "см. документацию"}`}
            >
              <input
                value={draft.LLM_MODEL ?? ""}
                onChange={(e) => setField("LLM_MODEL", e.target.value)}
                placeholder={
                  PROVIDER_MODEL_HINT[provider]?.split(" / ")[0] || "model-id"
                }
              />
            </Field>
            <ToggleRow
              label="Vision"
              hint="VISION_ENABLED — анализ изображений"
              checked={isTruthyEnv(draft.VISION_ENABLED)}
              onChange={(on) => setField("VISION_ENABLED", boolToEnv(on))}
            />
          </div>
        </>
      );
    }

    if (card.id === "openai") {
      return (
        <>
          <div className="integ-help">
            <div className="integ-help-block">
              <span className="integ-help-label">Как настроить</span>
              <ol className="integ-howto">
                <li>
                  Ключ:{" "}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noreferrer"
                  >
                    platform.openai.com/api-keys
                  </a>
                </li>
                <li>Для прокси укажите Base URL.</li>
                <li>Провайдер: openai.</li>
              </ol>
            </div>
          </div>
          <div className="integ-fields">
            <SecretField
              label="OPENAI_API_KEY"
              value={draft.OPENAI_API_KEY ?? ""}
              secretSet={snap!.secretsSet.OPENAI_API_KEY}
              onChange={(v) => setField("OPENAI_API_KEY", v)}
              hint="Оставьте •••• чтобы не перезаписывать существующий ключ"
            />
            <Field
              label="OPENAI_BASE_URL"
              hint="По умолчанию https://api.openai.com/v1"
            >
              <input
                value={draft.OPENAI_BASE_URL ?? ""}
                onChange={(e) => setField("OPENAI_BASE_URL", e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </Field>
          </div>
        </>
      );
    }

    if (card.id === "claude") {
      return (
        <>
          <div className="integ-help">
            <div className="integ-help-block">
              <span className="integ-help-label">Как настроить</span>
              <p className="integ-howto">
                Ключ:{" "}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noreferrer"
                >
                  console.anthropic.com
                </a>
                . Провайдер: claude.
              </p>
            </div>
          </div>
          <div className="integ-fields">
            <SecretField
              label="ANTHROPIC_API_KEY"
              value={draft.ANTHROPIC_API_KEY ?? ""}
              secretSet={snap!.secretsSet.ANTHROPIC_API_KEY}
              onChange={(v) => setField("ANTHROPIC_API_KEY", v)}
            />
          </div>
        </>
      );
    }

    if (card.id === "gemini") {
      return (
        <>
          <div className="integ-help">
            <div className="integ-help-block">
              <span className="integ-help-label">Как настроить</span>
              <p className="integ-howto">
                Ключ:{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                >
                  aistudio.google.com/apikey
                </a>
                . Провайдер: gemini.
              </p>
            </div>
          </div>
          <div className="integ-fields">
            <SecretField
              label="GEMINI_API_KEY"
              value={draft.GEMINI_API_KEY ?? ""}
              secretSet={snap!.secretsSet.GEMINI_API_KEY}
              onChange={(v) => setField("GEMINI_API_KEY", v)}
            />
          </div>
        </>
      );
    }

    if (card.id === "grok") {
      return (
        <>
          <div className="integ-help">
            <div className="integ-help-block">
              <span className="integ-help-label">Как настроить</span>
              <p className="integ-howto">
                Ключ:{" "}
                <a href="https://console.x.ai/" target="_blank" rel="noreferrer">
                  console.x.ai
                </a>
                . Провайдер: grok.
              </p>
            </div>
          </div>
          <div className="integ-fields">
            <SecretField
              label="XAI_API_KEY"
              value={draft.XAI_API_KEY ?? ""}
              secretSet={snap!.secretsSet.XAI_API_KEY}
              onChange={(v) => setField("XAI_API_KEY", v)}
            />
          </div>
        </>
      );
    }

    return (
      <>
        <div className="integ-help">
          <div className="integ-help-block">
            <span className="integ-help-label">Offline</span>
            <p className="integ-howto">
              Укажите путь к локальной модели (`OFFLINE_MODEL_PATH`) и выберите
              провайдер Offline в карточке «Активный LLM».
            </p>
          </div>
        </div>
        <div className="integ-fields">
          <Field label="OFFLINE_MODEL_PATH" hint="Путь к весам / GGUF / каталогу">
            <input
              value={draft.OFFLINE_MODEL_PATH ?? ""}
              onChange={(e) => setField("OFFLINE_MODEL_PATH", e.target.value)}
              placeholder="/models/mira-offline"
            />
          </Field>
        </div>
      </>
    );
  }

  function renderEditorFooter(card: ApiCard): ReactNode {
    if (card.id === "elevenlabs") {
      return (
        <button type="button" className="btn" onClick={() => setEditorId(null)}>
          Закрыть
        </button>
      );
    }
    if (card.id === "llm") {
      return (
        <SaveRow
          label="Сохранить провайдер"
          saving={savingKey === "llm"}
          note={notes.llm}
          onSave={() =>
            void handleSave("llm", [
              "LLM_PROVIDER",
              "LLM_MODEL",
              "VISION_ENABLED",
            ])
          }
        >
          <button
            type="button"
            className="btn"
            disabled={testing}
            onClick={() => void handleTest()}
          >
            {testing ? "Проверка…" : "Тест соединения"}
          </button>
          {testResult ? <span className="chip">{testResult}</span> : null}
          <button type="button" className="btn" onClick={() => setEditorId(null)}>
            Закрыть
          </button>
        </SaveRow>
      );
    }
    if (card.id === "offline") {
      return (
        <SaveRow
          label="Сохранить"
          saving={savingKey === "offline"}
          note={notes.offline}
          onSave={() => void handleSave("offline", ["OFFLINE_MODEL_PATH"])}
        >
          <button type="button" className="btn" onClick={() => setEditorId(null)}>
            Закрыть
          </button>
        </SaveRow>
      );
    }
    const map: Record<string, { group: string; keys: string[]; secret: string }> =
      {
        openai: {
          group: "openai",
          keys: ["OPENAI_API_KEY", "OPENAI_BASE_URL"],
          secret: "OPENAI_API_KEY",
        },
        claude: {
          group: "anthropic",
          keys: ["ANTHROPIC_API_KEY"],
          secret: "ANTHROPIC_API_KEY",
        },
        gemini: {
          group: "gemini",
          keys: ["GEMINI_API_KEY"],
          secret: "GEMINI_API_KEY",
        },
        grok: {
          group: "xai",
          keys: ["XAI_API_KEY"],
          secret: "XAI_API_KEY",
        },
      };
    const cfg = map[card.id];
    if (!cfg) return null;
    return (
      <SaveRow
        label="Сохранить ключ"
        saving={savingKey === cfg.group}
        note={notes[cfg.group]}
        onSave={() => void handleSave(cfg.group, cfg.keys)}
        deleteLabel="Удалить ключ"
        canDelete={Boolean(snap!.secretsSet[cfg.secret])}
        deleting={savingKey === `del-${cfg.group}`}
        onDelete={() => void handleDeleteKey(cfg.group, cfg.secret)}
      >
        <button type="button" className="btn" onClick={() => setEditorId(null)}>
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
          aria-labelledby="api-edit-title"
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e: FormEvent) => e.preventDefault()}
        >
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <span className="paths-card-icon" aria-hidden>
              <ApiBrandIcon id={editor.id} size={40} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 id="api-edit-title" style={{ margin: 0 }}>
                {editor.name}
              </h2>
              <div className="paths-card-kind">{editor.kind}</div>
            </div>
          </div>
          {renderEditorBody(editor)}
          {editor.id !== "elevenlabs" ? (
            <div className="integ-footer">{renderEditorFooter(editor)}</div>
          ) : (
            <div className="integ-footer" style={{ marginTop: 8 }}>
              {renderEditorFooter(editor)}
            </div>
          )}
        </form>
      </div>,
      document.body,
    );

  return (
    <div className="stack paths-panel api-paths-panel">
      <div className="row paths-header" style={{ flexWrap: "wrap", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>API и модели</h2>
            <span className="muted">{activeProvider}</span>
            <StubBadge label="P1" />
          </div>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Ключи локально
            {snap.source === "electron"
              ? ` в \`.env\`${snap.envFile ? ` (${snap.envFile})` : ""}`
              : " в браузере (demo)"}
            . Карточки провайдеров — как в Путях. «Сохранить ключ» не затирает
            маску ••••.
          </p>
        </div>
        <button
          type="button"
          className="btn"
          disabled={testing}
          onClick={() => void handleTest()}
        >
          {testing ? "Проверка…" : "Тест соединения"}
        </button>
      </div>

      {testResult ? (
        <p className="muted" style={{ margin: 0 }}>
          <span className="chip">{testResult}</span>
        </p>
      ) : null}

      <div className="row paths-toolbar" style={{ flexWrap: "wrap", gap: 10 }}>
        <label className="paths-search">
          <span className="sr-only">Поиск</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти провайдера или ключ"
            aria-label="Найти провайдера или ключ"
          />
        </label>
        <div className="paths-filters" role="tablist" aria-label="Фильтр">
          {(
            [
              ["all", "Все", counts.all],
              ["ready", "Готовы", counts.ready],
              ["missing", "Без ключа", counts.missing],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              className={`paths-filter-btn ${filter === id ? "is-active" : ""}`}
              onClick={() => setFilter(id)}
            >
              {label} {count}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Ничего не найдено.
        </p>
      ) : (
        <div className="paths-grid">
          {filtered.map((card) => {
            const ready = isReady(card);
            const isActive =
              card.providerId &&
              (draft.LLM_PROVIDER || "mock") === card.providerId;
            return (
              <article
                key={card.id}
                className={`paths-card panel ${ready ? "is-enabled" : "is-disabled"}${isActive ? " is-active-provider" : ""}`}
              >
                <div className="paths-card-head">
                  <span className="paths-card-icon" aria-hidden>
                    <ApiBrandIcon id={card.id} size={40} />
                  </span>
                  <div className="paths-card-title">
                    <div className="paths-card-title-row">
                      <strong className="paths-card-name">{card.name}</strong>
                      <span
                        className={`paths-status-dot ${ready ? "is-on" : ""}`}
                        title={ready ? "Готово" : "Не настроено"}
                        aria-hidden
                      />
                    </div>
                    <div className="paths-card-kind">
                      {card.kind}
                      {isActive ? " · активен" : ""}
                    </div>
                  </div>
                </div>

                <div
                  className={`paths-card-path mono ${ready ? "" : "is-empty"}`}
                  title={statusLine(card)}
                >
                  {statusLine(card)}
                </div>

                <div className="paths-card-tags">
                  {card.tags.map((tag) => (
                    <span key={tag} className="paths-tag-chip is-readonly">
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="row paths-card-actions">
                  {card.providerId ? (
                    <button
                      type="button"
                      className="btn paths-open-btn"
                      disabled={
                        (draft.LLM_PROVIDER || "mock") === card.providerId
                      }
                      onClick={() => {
                        const next = card.providerId!;
                        const nextModel = modelForProvider(
                          next,
                          draft.LLM_MODEL,
                        );
                        setDraft((prev) => ({
                          ...prev,
                          LLM_PROVIDER: next,
                          LLM_MODEL: nextModel,
                        }));
                        void (async () => {
                          setSavingKey("llm");
                          const res = await saveSettingsEnv({
                            LLM_PROVIDER: next,
                            LLM_MODEL: nextModel,
                            VISION_ENABLED: draft.VISION_ENABLED ?? "",
                          });
                          setSnap(res.snap);
                          setDraft((prev) => ({
                            ...prev,
                            ...res.snap.values,
                          }));
                          setNotes((prev) => ({
                            ...prev,
                            llm: res.detail || `Активен: ${next}`,
                          }));
                          setSavingKey(null);
                        })();
                      }}
                    >
                      {(draft.LLM_PROVIDER || "mock") === card.providerId
                        ? "Активен"
                        : "Сделать активным"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn paths-edit-btn"
                    onClick={() => setEditorId(card.id)}
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
