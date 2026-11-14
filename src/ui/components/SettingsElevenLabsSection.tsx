import { useEffect, useState } from "react";
import {
  Field,
  IntegCard,
  SaveRow,
  SecretField,
} from "./SettingsFormBits";
import { ThemeSelect } from "./ThemeSelect";
import {
  loadSettingsEnv,
  saveSettingsEnv,
  type SettingsEnvSnapshot,
} from "../settingsEnvClient";
import { speakText, stopSpeaking } from "../voice/tts";
import {
  DEFAULT_ELEVENLABS_VOICE_ID,
  getActiveTtsEngine,
  setActiveTtsEngine,
} from "../voice/ttsEngines";

const FALLBACK_MODELS = [
  {
    id: "eleven_multilingual_v2",
    label: "Multilingual v2",
    detail: "Рекомендуется для русского · естественный голос",
  },
  {
    id: "eleven_v3",
    label: "Eleven v3",
    detail: "Новейшая модель · language_code=ru",
  },
  {
    id: "eleven_turbo_v2_5",
    label: "Turbo v2.5",
    detail: "Быстрее · ниже latency",
  },
  {
    id: "eleven_flash_v2_5",
    label: "Flash v2.5",
    detail: "Самый быстрый · короткие реплики",
  },
] as const;

type StatusSnap = {
  hasKey: boolean;
  voiceId: string;
  modelId: string;
  connected: boolean;
  detail: string;
  subscription?: string | null;
};

type SettingsElevenLabsSectionProps = {
  /** Compact variant for embedding under Voice without repeating howto. */
  compact?: boolean;
  /** Skip IntegCard chrome — for Paths-style API modals. */
  plain?: boolean;
};

export function SettingsElevenLabsSection({
  compact = false,
  plain = false,
}: SettingsElevenLabsSectionProps) {
  const [snap, setSnap] = useState<SettingsEnvSnapshot | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusSnap | null>(null);
  const [probing, setProbing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [models, setModels] = useState<
    Array<{ id: string; label: string; detail: string }>
  >([...FALLBACK_MODELS]);
  const [voices, setVoices] = useState<
    Array<{ voiceId: string; name: string; category: string }>
  >([]);

  async function refreshStatus(probe = false) {
    if (!window.mira?.getElevenLabsStatus) {
      setStatus({
        hasKey: false,
        voiceId: draft.ELEVENLABS_VOICE_ID || DEFAULT_ELEVENLABS_VOICE_ID,
        modelId: draft.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
        connected: false,
        detail:
          "Браузер-демо: ElevenLabs работает только в Electron (ключ не в renderer)",
      });
      return;
    }
    if (probe) setProbing(true);
    try {
      const next = await window.mira.getElevenLabsStatus(probe);
      setStatus(next);
    } finally {
      if (probe) setProbing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await loadSettingsEnv();
      if (cancelled) return;
      setSnap(s);
      const values = {
        ...s.values,
        ELEVENLABS_VOICE_ID:
          s.values.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_ELEVENLABS_VOICE_ID,
        ELEVENLABS_MODEL_ID:
          s.values.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2",
      };
      setDraft(values);
      if (window.mira?.listElevenLabsModels) {
        try {
          const list = await window.mira.listElevenLabsModels();
          if (!cancelled && list?.length) setModels(list);
        } catch {
          /* keep fallback */
        }
      }
      if (window.mira?.listElevenLabsVoices) {
        try {
          const res = await window.mira.listElevenLabsVoices();
          if (!cancelled && res?.voices?.length) {
            setVoices(
              res.voices.map((v) => ({
                voiceId: v.voiceId,
                name: v.name,
                category: v.category,
              })),
            );
          }
        } catch {
          /* optional */
        }
      }
      if (!cancelled) await refreshStatus(false);
    })();
    return () => {
      cancelled = true;
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setField(key: string, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSavingKey("eleven");
    const patch: Record<string, string> = {};
    const keyVal = draft.ELEVENLABS_API_KEY ?? "";
    if (keyVal.trim() && !keyVal.trim().startsWith("••••")) {
      patch.ELEVENLABS_API_KEY = keyVal;
    }
    patch.ELEVENLABS_VOICE_ID =
      (draft.ELEVENLABS_VOICE_ID || "").trim() || DEFAULT_ELEVENLABS_VOICE_ID;
    patch.ELEVENLABS_MODEL_ID =
      (draft.ELEVENLABS_MODEL_ID || "").trim() || "eleven_multilingual_v2";
    for (const k of [
      "ELEVENLABS_STABILITY",
      "ELEVENLABS_SIMILARITY",
      "ELEVENLABS_STYLE",
      "ELEVENLABS_SPEAKER_BOOST",
    ] as const) {
      if (draft[k] != null && String(draft[k]).trim() !== "") {
        patch[k] = String(draft[k]).trim();
      }
    }

    if (!Object.keys(patch).length) {
      setNote("Нечего сохранять");
      setSavingKey(null);
      return;
    }
    const res = await saveSettingsEnv(patch);
    setSnap(res.snap);
    setDraft((prev) => ({ ...prev, ...res.snap.values }));
    setNote(res.detail);
    setSavingKey(null);
    await refreshStatus(true);
  }

  async function handleDeleteKey() {
    setSavingKey("del-eleven");
    setDraft((prev) => ({ ...prev, ELEVENLABS_API_KEY: "" }));
    const res = await saveSettingsEnv(
      { ELEVENLABS_API_KEY: "" },
      { clearSecrets: true },
    );
    setSnap(res.snap);
    setDraft((prev) => ({ ...prev, ...res.snap.values, ELEVENLABS_API_KEY: "" }));
    setNote("Ключ ELEVENLABS_API_KEY удалён");
    setSavingKey(null);
    await refreshStatus(false);
  }

  async function handleTestSpeak() {
    setTesting(true);
    setTestMsg(null);
    stopSpeaking();
    // Ensure replies use ElevenLabs when testing this card.
    if (getActiveTtsEngine() !== "elevenlabs") {
      setActiveTtsEngine("elevenlabs");
    }
    // Persist voice/model before speak so main reads latest .env values.
    await saveSettingsEnv({
      ELEVENLABS_VOICE_ID:
        (draft.ELEVENLABS_VOICE_ID || "").trim() || DEFAULT_ELEVENLABS_VOICE_ID,
      ELEVENLABS_MODEL_ID:
        (draft.ELEVENLABS_MODEL_ID || "").trim() || "eleven_multilingual_v2",
    });
    speakText(
      "Привет! Я Мира. Это проверка голоса ElevenLabs — звучу естественно?",
      null,
      {
        onStart: () => setTestMsg("Идёт озвучка…"),
        onEnd: () => {
          setTestMsg("Готово");
          setTesting(false);
        },
        onError: (message) => {
          setTestMsg(message);
          setTesting(false);
        },
        onStatus: (message) => setTestMsg(message),
      },
    );
  }

  const hasKey = Boolean(snap?.secretsSet.ELEVENLABS_API_KEY);
  const statusClass = status?.connected ? "on" : "";
  const statusLabel = !window.mira?.getElevenLabsStatus
    ? "только Electron"
    : status?.connected
      ? "подключено"
      : hasKey
        ? "ключ есть"
        : "нет ключа";

  const modelHint =
    models.find((m) => m.id === (draft.ELEVENLABS_MODEL_ID || ""))?.detail ||
    "";

  const howto = compact ? (
    <ol>
      <li>
        Ключ:{" "}
        <a
          href="https://elevenlabs.io/app/settings/api-keys"
          target="_blank"
          rel="noreferrer"
        >
          elevenlabs.io → API Keys
        </a>
      </li>
      <li>Сохраните ключ → выберите движок «ElevenLabs» выше</li>
      <li>Проверьте «Проговорить тест»</li>
    </ol>
  ) : (
    <ol>
      <li>
        Создайте ключ на{" "}
        <a
          href="https://elevenlabs.io/app/settings/api-keys"
          target="_blank"
          rel="noreferrer"
        >
          elevenlabs.io
        </a>{" "}
        (Profile → API Key)
      </li>
      <li>Вставьте ниже и нажмите «Сохранить ключ»</li>
      <li>
        В «Голос и аудио» выберите движок <strong>ElevenLabs</strong>
      </li>
      <li>Voice ID по умолчанию уже ваш — меняйте только при необходимости</li>
    </ol>
  );

  const fields = (
    <>
      <div className="settings-field-row" style={{ marginBottom: 4 }}>
        <span className="muted" style={{ fontSize: "0.85rem" }}>
          {status?.detail || "Статус ElevenLabs…"}
        </span>
        <span className={`integ-status ${statusClass}`}>{statusLabel}</span>
      </div>

      <SecretField
        label="ELEVENLABS_API_KEY"
        hint="Секрет из кабинета ElevenLabs. Это не Voice ID."
        value={draft.ELEVENLABS_API_KEY ?? ""}
        secretSet={hasKey}
        onChange={(v) => setField("ELEVENLABS_API_KEY", v)}
      />

      <div className="integ-grid-2">
        <Field
          label="Voice ID"
          hint="Пресет вашего голоса. Не путать с API-ключом."
        >
          <input
            value={draft.ELEVENLABS_VOICE_ID ?? DEFAULT_ELEVENLABS_VOICE_ID}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setField("ELEVENLABS_VOICE_ID", e.target.value)}
            placeholder={DEFAULT_ELEVENLABS_VOICE_ID}
          />
        </Field>
        <Field label="Модель" hint={`${modelHint} · короткие реплики → Flash`}>
          <ThemeSelect
            aria-label="Модель ElevenLabs"
            value={draft.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2"}
            options={models.map((m) => ({
              value: m.id,
              label: m.label,
            }))}
            onChange={(id) => setField("ELEVENLABS_MODEL_ID", id)}
          />
        </Field>
      </div>

      {voices.length > 0 ? (
        <Field
          label="Голоса аккаунта"
          hint="Список из ElevenLabs API · выберите или оставьте пресет"
        >
          <ThemeSelect
            aria-label="Голос ElevenLabs из аккаунта"
            value={draft.ELEVENLABS_VOICE_ID || DEFAULT_ELEVENLABS_VOICE_ID}
            options={voices.map((v) => ({
              value: v.voiceId,
              label: `${v.name} (${v.category})`,
            }))}
            onChange={(id) => setField("ELEVENLABS_VOICE_ID", id)}
          />
        </Field>
      ) : null}

      <div className="integ-grid-2">
        <Field label="Stability" hint="0…1 · устойчивость тембра">
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={draft.ELEVENLABS_STABILITY ?? "0.45"}
            onChange={(e) => setField("ELEVENLABS_STABILITY", e.target.value)}
          />
        </Field>
        <Field label="Similarity" hint="0…1 · похожесть на оригинал">
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={draft.ELEVENLABS_SIMILARITY ?? "0.75"}
            onChange={(e) => setField("ELEVENLABS_SIMILARITY", e.target.value)}
          />
        </Field>
        <Field label="Style" hint="0…1 · выразительность">
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={draft.ELEVENLABS_STYLE ?? "0.35"}
            onChange={(e) => setField("ELEVENLABS_STYLE", e.target.value)}
          />
        </Field>
        <Field label="Speaker boost" hint="true / false">
          <ThemeSelect
            aria-label="Speaker boost"
            value={draft.ELEVENLABS_SPEAKER_BOOST ?? "true"}
            options={[
              { value: "true", label: "Вкл" },
              { value: "false", label: "Выкл" },
            ]}
            onChange={(id) => setField("ELEVENLABS_SPEAKER_BOOST", id)}
          />
        </Field>
      </div>
    </>
  );

  const footer = (
    <SaveRow
      label="Сохранить"
      saving={savingKey === "eleven"}
      note={note}
      onSave={() => void handleSave()}
      deleteLabel="Удалить ключ"
      canDelete={hasKey}
      deleting={savingKey === "del-eleven"}
      onDelete={() => void handleDeleteKey()}
    >
      <button
        type="button"
        className="btn"
        disabled={probing}
        onClick={() => void refreshStatus(true)}
      >
        {probing ? "Проверка…" : "Проверить связь"}
      </button>
      <button
        type="button"
        className="btn btn-primary"
        disabled={testing}
        onClick={() => void handleTestSpeak()}
      >
        {testing ? "Говорю…" : "Проговорить тест"}
      </button>
      {testMsg ? <span className="chip">{testMsg}</span> : null}
    </SaveRow>
  );

  if (plain) {
    return (
      <div className="stack integ-fields" style={{ gap: 12 }}>
        <div className="integ-help">
          <div className="integ-help-block">
            <span className="integ-help-label">Как настроить</span>
            <div className="integ-howto">{howto}</div>
          </div>
        </div>
        {fields}
        <div className="integ-footer">{footer}</div>
      </div>
    );
  }

  return (
    <IntegCard
      kicker="ElevenLabs"
      title="Облачный TTS"
      purpose={
        compact
          ? "Нейронная озвучка ответов Миры через ElevenLabs. Ключ хранится только в .env / Electron main."
          : "Красивый облачный neural TTS для чата и голоса. Voice ID уже задан; нужен только API-ключ из кабинета ElevenLabs."
      }
      howto={howto}
      footer={footer}
    >
      {fields}
    </IntegCard>
  );
}
