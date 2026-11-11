import { useEffect, useState } from "react";
import { StubBadge } from "./StubBadge";
import {
  Field,
  IntegCard,
  SaveRow,
  SecretField,
  ToggleRow,
} from "./SettingsFormBits";
import {
  boolToEnv,
  isTruthyEnv,
  loadSettingsEnv,
  modelForProvider,
  saveSettingsEnv,
  type SettingsEnvSnapshot,
} from "../settingsEnvClient";

const PROVIDERS = [
  { id: "mock", label: "Mock (без ключа)" },
  { id: "openai", label: "OpenAI" },
  { id: "claude", label: "Anthropic Claude" },
  { id: "gemini", label: "Google Gemini" },
  { id: "grok", label: "xAI Grok" },
  { id: "offline", label: "Offline" },
] as const;

const PROVIDER_MODEL_HINT: Record<string, string> = {
  grok: "grok-4.7 / grok-4.6 / grok-4.3",
  openai: "gpt-4o-mini / gpt-4o",
  claude: "claude-3-5-sonnet-latest",
  gemini: "gemini-2.0-flash",
  mock: "не используется",
  offline: "локальный id модели",
};

export function SettingsApiSection() {
  const [snap, setSnap] = useState<SettingsEnvSnapshot | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

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
    for (const key of keys) patch[key] = draft[key] ?? "";
    const res = await saveSettingsEnv(patch);
    setSnap(res.snap);
    setDraft((prev) => ({ ...prev, ...res.snap.values }));
    setNotes((prev) => ({ ...prev, [group]: res.detail }));
    setSavingKey(null);
  }

  async function handleDeleteKey(group: string, secretKey: string) {
    setSavingKey(`del-${group}`);
    setDraft((prev) => ({ ...prev, [secretKey]: "" }));
    const res = await saveSettingsEnv({ [secretKey]: "" });
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

  if (!snap) {
    return <p className="muted">Загрузка настроек API…</p>;
  }

  const provider = draft.LLM_PROVIDER || "mock";

  return (
    <>
      <div className="row">
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>API и модели</h2>
        <StubBadge label="P1" />
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Ключи хранятся локально
        {snap.source === "electron"
          ? ` в \`.env\`${snap.envFile ? ` (${snap.envFile})` : ""}`
          : " в браузере (demo) — в Electron попадут в `.env`"}
        . Без ключа Mira работает в режиме mock. У каждого провайдера — свои
        «Сохранить ключ» / «Удалить ключ».
      </p>

      <IntegCard
        kicker="LLM"
        title="Провайдер и модель"
        purpose="Выбирает, какой ИИ отвечает в Диалоге. Без ключа — mock-ответы для демо UI."
        howto={
          <ul>
            <li>Выберите провайдера ниже.</li>
            <li>Вставьте API-ключ в карточке сервиса и нажмите «Сохранить ключ».</li>
            <li>«Тест соединения» проверяет активный провайдер.</li>
          </ul>
        }
        footer={
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
          </SaveRow>
        }
      >
        <Field label="Провайдер" hint="Переменная LLM_PROVIDER">
          <select
            value={provider}
            onChange={(e) => {
              const next = e.target.value;
              setDraft((prev) => ({
                ...prev,
                LLM_PROVIDER: next,
                LLM_MODEL: modelForProvider(next, prev.LLM_MODEL),
              }));
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Модель"
          hint={`LLM_MODEL — для ${provider}: ${PROVIDER_MODEL_HINT[provider] ?? "см. документацию провайдера"}`}
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
          hint="VISION_ENABLED — анализ изображений, если провайдер поддерживает"
          checked={isTruthyEnv(draft.VISION_ENABLED)}
          onChange={(on) => setField("VISION_ENABLED", boolToEnv(on))}
        />
      </IntegCard>

      <IntegCard
        kicker="OpenAI"
        title="OpenAI / совместимый endpoint"
        purpose="Чат, vision и совместимые прокси (OpenRouter, локальные OpenAI-совместимые серверы)."
        howto={
          <ol>
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
        }
        footer={
          <SaveRow
            label="Сохранить ключ"
            saving={savingKey === "openai"}
            note={notes.openai}
            onSave={() =>
              void handleSave("openai", ["OPENAI_API_KEY", "OPENAI_BASE_URL"])
            }
            deleteLabel="Удалить ключ"
            canDelete={Boolean(snap.secretsSet.OPENAI_API_KEY)}
            deleting={savingKey === "del-openai"}
            onDelete={() => void handleDeleteKey("openai", "OPENAI_API_KEY")}
          />
        }
      >
        <SecretField
          label="OPENAI_API_KEY"
          value={draft.OPENAI_API_KEY ?? ""}
          secretSet={snap.secretsSet.OPENAI_API_KEY}
          onChange={(v) => setField("OPENAI_API_KEY", v)}
          hint="Оставьте •••• чтобы не перезаписывать существующий ключ"
        />
        <Field label="OPENAI_BASE_URL" hint="По умолчанию https://api.openai.com/v1">
          <input
            value={draft.OPENAI_BASE_URL ?? ""}
            onChange={(e) => setField("OPENAI_BASE_URL", e.target.value)}
            placeholder="https://api.openai.com/v1"
          />
        </Field>
      </IntegCard>

      <IntegCard
        kicker="Anthropic"
        title="Claude"
        purpose="Модели Claude для диалога и длинного контекста."
        howto={
          <p>
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
        }
        footer={
          <SaveRow
            label="Сохранить ключ"
            saving={savingKey === "anthropic"}
            note={notes.anthropic}
            onSave={() => void handleSave("anthropic", ["ANTHROPIC_API_KEY"])}
            deleteLabel="Удалить ключ"
            canDelete={Boolean(snap.secretsSet.ANTHROPIC_API_KEY)}
            deleting={savingKey === "del-anthropic"}
            onDelete={() =>
              void handleDeleteKey("anthropic", "ANTHROPIC_API_KEY")
            }
          />
        }
      >
        <SecretField
          label="ANTHROPIC_API_KEY"
          value={draft.ANTHROPIC_API_KEY ?? ""}
          secretSet={snap.secretsSet.ANTHROPIC_API_KEY}
          onChange={(v) => setField("ANTHROPIC_API_KEY", v)}
        />
      </IntegCard>

      <IntegCard
        kicker="Google"
        title="Gemini"
        purpose="Модели Gemini через Google AI Studio."
        howto={
          <p>
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
        }
        footer={
          <SaveRow
            label="Сохранить ключ"
            saving={savingKey === "gemini"}
            note={notes.gemini}
            onSave={() => void handleSave("gemini", ["GEMINI_API_KEY"])}
            deleteLabel="Удалить ключ"
            canDelete={Boolean(snap.secretsSet.GEMINI_API_KEY)}
            deleting={savingKey === "del-gemini"}
            onDelete={() => void handleDeleteKey("gemini", "GEMINI_API_KEY")}
          />
        }
      >
        <SecretField
          label="GEMINI_API_KEY"
          value={draft.GEMINI_API_KEY ?? ""}
          secretSet={snap.secretsSet.GEMINI_API_KEY}
          onChange={(v) => setField("GEMINI_API_KEY", v)}
        />
      </IntegCard>

      <IntegCard
        kicker="xAI"
        title="Grok"
        purpose="Модели Grok от xAI."
        howto={
          <p>
            Ключ:{" "}
            <a href="https://console.x.ai/" target="_blank" rel="noreferrer">
              console.x.ai
            </a>
            . Провайдер: grok.
          </p>
        }
        footer={
          <SaveRow
            label="Сохранить ключ"
            saving={savingKey === "xai"}
            note={notes.xai}
            onSave={() => void handleSave("xai", ["XAI_API_KEY"])}
            deleteLabel="Удалить ключ"
            canDelete={Boolean(snap.secretsSet.XAI_API_KEY)}
            deleting={savingKey === "del-xai"}
            onDelete={() => void handleDeleteKey("xai", "XAI_API_KEY")}
          />
        }
      >
        <SecretField
          label="XAI_API_KEY"
          value={draft.XAI_API_KEY ?? ""}
          secretSet={snap.secretsSet.XAI_API_KEY}
          onChange={(v) => setField("XAI_API_KEY", v)}
        />
      </IntegCard>
    </>
  );
}
