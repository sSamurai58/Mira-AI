import { useEffect, useRef, useState } from "react";
import { StubBadge } from "./StubBadge";
import { Field, SliderField, ToggleRow } from "./SettingsFormBits";
import { MicTestCard } from "./MicTestCard";
import { SettingsElevenLabsSection } from "./SettingsElevenLabsSection";
import { ThemeSelect } from "./ThemeSelect";
import {
  getActiveVoiceId,
  isCustomVoiceId,
  listCatalogVoices,
  setActiveVoiceId,
} from "../voice/catalog";
import { getVoiceEngineStatus } from "../voice/engineStatus";
import {
  getHandsFreePrefs,
  setHandsFreePrefs,
  type HandsFreePrefs,
  type WakeSensitivity,
} from "../voice/handsFree";
import {
  getActiveWakeEngine,
  getWakeEngineId,
  listWakeEngines,
  setWakeEngineId,
  type WakeEngineId,
} from "../voice/wake/interface";
import { speakText, stopSpeaking } from "../voice/tts";
import {
  getActiveTtsEngine,
  listTtsEngines,
  setActiveTtsEngine,
  type TtsEngineId,
} from "../voice/ttsEngines";
import {
  applyVoicePreset,
  getVoiceSettings,
  listVoicePresets,
  setVoiceSettings,
  VOICE_LIMITS,
  type VoiceSettings,
} from "../voice/voiceSettings";
import type { VoiceInfo } from "../voice/types";

const SENS_OPTS: Array<{ value: WakeSensitivity; label: string }> = [
  { value: "strict", label: "Строгая — только точное совпадение" },
  { value: "normal", label: "Обычная — фраза или лёгкий fuzzy" },
  { value: "loose", label: "Мягкая — допускает оговорки" },
];

export function SettingsVoiceSection() {
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [activeVoiceId, setActiveVoiceIdState] = useState<string | null>(null);
  const [engineDetail, setEngineDetail] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(
    () => localStorage.getItem("mira.autoSpeak") !== "0",
  );
  const [handsFree, setHandsFree] = useState<HandsFreePrefs>(() =>
    getHandsFreePrefs(),
  );
  const [wakeEngineId, setWakeEngineIdState] = useState<WakeEngineId>(() =>
    getWakeEngineId(),
  );
  const [ttsEngine, setTtsEngine] = useState<TtsEngineId>(() =>
    getActiveTtsEngine(),
  );
  const [voice, setVoice] = useState<VoiceSettings>(() => getVoiceSettings());
  const presets = listVoicePresets();
  const previewTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listCatalogVoices().then((list) => {
      if (cancelled) return;
      setVoices(list);
      setActiveVoiceIdState(getActiveVoiceId(list));
      setEngineDetail(getVoiceEngineStatus().detail);
    });
    return () => {
      cancelled = true;
      stopSpeaking();
      if (previewTimer.current != null) {
        window.clearTimeout(previewTimer.current);
      }
    };
  }, []);

  function schedulePreview() {
    if (previewTimer.current != null) {
      window.clearTimeout(previewTimer.current);
    }
    previewTimer.current = window.setTimeout(() => {
      speakText(
        "Проверка голоса Mira.",
        activeVoiceId,
        { preferPreview: true },
      );
    }, 420);
  }

  function patchHands(patch: Partial<HandsFreePrefs>) {
    setHandsFree(setHandsFreePrefs(patch));
  }

  function patchVoice(patch: Partial<VoiceSettings>, preview = true) {
    setVoice(setVoiceSettings(patch));
    if (preview) schedulePreview();
  }

  function pickPreset(id: string) {
    setVoice(applyVoicePreset(id));
    schedulePreview();
  }

  return (
    <div className="stack paths-panel settings-polish">
      <div className="row paths-header" style={{ flexWrap: "wrap", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Голос и аудио</h2>
            <StubBadge label="F9" />
          </div>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Параметрический синтез по частоте, высоте, скорости и энергии —
            без записи аудио. Студия (neural pack) — опционально.
          </p>
        </div>
      </div>

      <div className="settings-status-bar mono">
        {engineDetail || "Определение движка…"}
      </div>

      <article className="panel stack notify-card">
        <h3 className="notify-card-title">Озвучка</h3>
        <Field
          label="Движок TTS"
          hint={listTtsEngines().find((e) => e.id === ttsEngine)?.detail}
        >
          <ThemeSelect
            aria-label="Движок TTS"
            value={ttsEngine}
            options={listTtsEngines().map((eng) => ({
              value: eng.id,
              label: `${eng.label}${eng.ready ? "" : eng.id === "elevenlabs" ? " (нужен Electron)" : " (недоступен)"}`,
            }))}
            onChange={(id) => {
              setTtsEngine(setActiveTtsEngine(id as TtsEngineId));
              setEngineDetail(getVoiceEngineStatus().detail);
            }}
          />
        </Field>
        {ttsEngine === "elevenlabs" ? (
          <SettingsElevenLabsSection compact />
        ) : null}
        <ToggleRow
          label="Автоозвучка ответов"
          hint="Озвучивать ответы Миры автоматически"
          checked={autoSpeak}
          onChange={(on) => {
            setAutoSpeak(on);
            localStorage.setItem("mira.autoSpeak", on ? "1" : "0");
          }}
        />
        {voices.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Системные голоса не найдены. Откройте Mira в Electron/Chrome.
          </p>
        ) : (
          <Field label="Активный голос" hint="Каталог студии + системные">
            <ThemeSelect
              aria-label="Активный голос"
              value={activeVoiceId ?? ""}
              options={voices.map((v) => ({
                value: v.id,
                label: `${v.name} (${v.lang})`,
              }))}
              onChange={(id) => {
                setActiveVoiceId(id);
                setActiveVoiceIdState(id);
                // Studio voices → force local neural-pack engine.
                if (isCustomVoiceId(id) && ttsEngine === "elevenlabs") {
                  setTtsEngine(setActiveTtsEngine("neural-pack"));
                  setEngineDetail(getVoiceEngineStatus().detail);
                }
              }}
            />
          </Field>
        )}
        <Field
          label="Характер"
          hint="Пресет задаёт скорость, высоту, энергию и паузы"
        >
          <ThemeSelect
            aria-label="Характер голоса"
            value={voice.presetId ?? "__custom__"}
            options={[
              { value: "__custom__", label: "Свои настройки" },
              ...presets.map((p) => ({
                value: p.id,
                label: `${p.title} — ${p.description}`,
              })),
            ]}
            onChange={(id) => {
              if (id === "__custom__") {
                patchVoice({ presetId: null });
                return;
              }
              pickPreset(id);
            }}
          />
        </Field>
        <div className="integ-grid-2">
          <SliderField
            label="Базовая частота (Гц)"
            hint="F0 параметрического синтеза — без записи"
            min={VOICE_LIMITS.baseHz.min}
            max={VOICE_LIMITS.baseHz.max}
            step={1}
            value={voice.baseHz}
            display={`${Math.round(voice.baseHz)} Гц`}
            onChange={(v) => patchVoice({ baseHz: v })}
          />
          <SliderField
            label="Высота (полутона)"
            hint="Сдвиг относительно базовой частоты"
            min={VOICE_LIMITS.pitchSemitones.min}
            max={VOICE_LIMITS.pitchSemitones.max}
            step={0.1}
            value={voice.pitchSemitones}
            display={
              (voice.pitchSemitones >= 0 ? "+" : "") +
              voice.pitchSemitones.toFixed(1)
            }
            onChange={(v) => patchVoice({ pitchSemitones: v })}
          />
        </div>
        <div className="integ-grid-2">
          <SliderField
            label="Скорость"
            hint="Темп речи"
            min={VOICE_LIMITS.speed.min}
            max={VOICE_LIMITS.speed.max}
            step={0.02}
            value={voice.speed}
            display={voice.speed.toFixed(2)}
            onChange={(v) => patchVoice({ speed: v })}
          />
          <SliderField
            label="Паузы"
            hint="Шире — спокойнее ритм"
            min={VOICE_LIMITS.pauseScale.min}
            max={VOICE_LIMITS.pauseScale.max}
            step={0.02}
            value={voice.pauseScale}
            display={voice.pauseScale.toFixed(2)}
            onChange={(v) => patchVoice({ pauseScale: v })}
          />
        </div>
        <div className="integ-grid-2">
          <SliderField
            label="Энергия"
            hint="Плотность / громкость тембра"
            min={VOICE_LIMITS.energy.min}
            max={VOICE_LIMITS.energy.max}
            step={0.02}
            value={voice.energy}
            display={voice.energy.toFixed(2)}
            onChange={(v) => patchVoice({ energy: v })}
          />
          <SliderField
            label="Громкость"
            hint="Выходной gain + soft-limiter"
            min={VOICE_LIMITS.gain.min}
            max={VOICE_LIMITS.gain.max}
            step={0.05}
            value={voice.gain}
            display={Math.round(voice.gain * 100) + "%"}
            onChange={(v) => patchVoice({ gain: v })}
          />
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              speakText(
                "Проверка голоса Mira. Звучу ли я достаточно естественно?",
                activeVoiceId,
                { preferPreview: true },
              )
            }
          >
            ▶ Прослушать
          </button>
          <button type="button" className="btn" onClick={() => stopSpeaking()}>
            Стоп
          </button>
        </div>
      </article>

      <article className="panel stack notify-card">
        <h3 className="notify-card-title">Hands-free · wake-word</h3>
        <ToggleRow
          label="Hands-free"
          hint="Слушать wake-фразу в idle без удержания кнопки"
          checked={handsFree.enabled}
          onChange={(on) => patchHands({ enabled: on })}
        />
        <ToggleRow
          label="Barge-in"
          hint="Перебить озвучку → сразу слушать (Space)"
          checked={handsFree.bargeIn}
          onChange={(on) => patchHands({ bargeIn: on })}
        />
        <ToggleRow
          label="Сигнал при wake"
          hint="Короткий beep при распознавании фразы"
          checked={handsFree.wakeBeep}
          onChange={(on) => patchHands({ wakeBeep: on })}
        />
        <div className="integ-grid-2">
          <Field label="Wake-фраза" hint="По умолчанию «мира»">
            <input
              value={handsFree.wakePhrase}
              onChange={(e) => patchHands({ wakePhrase: e.target.value })}
              placeholder="мира"
            />
          </Field>
          <Field
            label="Движок wake-word"
            hint={getActiveWakeEngine().detail}
          >
            <ThemeSelect
              aria-label="Движок wake-word"
              value={wakeEngineId}
              options={listWakeEngines().map((e) => ({
                value: e.id,
                label: e.label,
              }))}
              onChange={(id) => {
                const next = setWakeEngineId(
                  id === "porcupine-stub" ? "porcupine-stub" : "webspeech",
                );
                setWakeEngineIdState(next);
              }}
            />
          </Field>
        </div>
        <Field label="Чувствительность совпадения" hint="Как строго искать фразу">
          <ThemeSelect
            aria-label="Чувствительность wake-word"
            value={handsFree.sensitivity}
            options={SENS_OPTS}
            onChange={(v) =>
              patchHands({ sensitivity: v as WakeSensitivity })
            }
          />
        </Field>
      </article>

      <article className="panel stack notify-card">
        <h3 className="notify-card-title">Чувствительности</h3>
        <MicTestCard thresholdPct={handsFree.micThreshold} />
        <SliderField
          label="Порог микрофона"
          hint="Ниже — ловит тише; выше — меньше ложных срабатываний"
          min={0}
          max={100}
          step={1}
          value={handsFree.micThreshold}
          display={`${handsFree.micThreshold}%`}
          onChange={(v) => patchHands({ micThreshold: v })}
        />
        <SliderField
          label="Пауза после wake"
          hint="Игнор повторных срабатываний, мс"
          min={0}
          max={5000}
          step={50}
          value={handsFree.cooldownMs}
          display={`${handsFree.cooldownMs} мс`}
          onChange={(v) => patchHands({ cooldownMs: v })}
        />
        <SliderField
          label="Окно команды"
          hint="Сколько секунд слушать после wake"
          min={3}
          max={60}
          step={1}
          value={handsFree.listenTimeoutSec}
          display={`${handsFree.listenTimeoutSec} с`}
          onChange={(v) => patchHands({ listenTimeoutSec: v })}
        />
      </article>
    </div>
  );
}
