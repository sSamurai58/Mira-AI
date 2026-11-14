import { useEffect, useState } from "react";
import { StubBadge } from "./StubBadge";
import { Field, SliderField, ToggleRow } from "./SettingsFormBits";
import { MicTestCard } from "./MicTestCard";
import { SettingsElevenLabsSection } from "./SettingsElevenLabsSection";
import { ThemeSelect } from "./ThemeSelect";
import {
  getActiveVoiceId,
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
  getVoiceAudioPrefs,
  setVoiceAudioPrefs,
  type VoiceAudioPrefs,
} from "../voice/voiceAudioPrefs";
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
  const [audio, setAudio] = useState<VoiceAudioPrefs>(() =>
    getVoiceAudioPrefs(),
  );

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
    };
  }, []);

  function patchHands(patch: Partial<HandsFreePrefs>) {
    setHandsFree(setHandsFreePrefs(patch));
  }

  function patchAudio(patch: Partial<VoiceAudioPrefs>) {
    setAudio(setVoiceAudioPrefs(patch));
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
            TTS, hands-free wake-word, выбор микрофона и живой тест уровня.
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
              }}
            />
          </Field>
        )}
        <div className="integ-grid-2">
          <SliderField
            label="Скорость"
            hint="Множитель Web Speech"
            min={0.7}
            max={1.4}
            step={0.02}
            value={audio.rate}
            display={audio.rate.toFixed(2)}
            onChange={(v) => patchAudio({ rate: v })}
          />
          <SliderField
            label="Высота"
            hint="Pitch Web Speech"
            min={0.7}
            max={1.4}
            step={0.02}
            value={audio.pitch}
            display={audio.pitch.toFixed(2)}
            onChange={(v) => patchAudio({ pitch: v })}
          />
        </div>
        <SliderField
          label="Громкость"
          hint="0 = тихо, 1 = максимум"
          min={0}
          max={1}
          step={0.05}
          value={audio.volume}
          display={Math.round(audio.volume * 100) + "%"}
          onChange={(v) => patchAudio({ volume: v })}
        />
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
