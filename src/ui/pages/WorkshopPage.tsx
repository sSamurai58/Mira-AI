import { useEffect, useState } from "react";
import { StubBadge } from "../components/StubBadge";
import {
  getActiveVoiceId,
  setActiveVoiceId,
  waitForVoices,
} from "../voice/catalog";
import { speakText, stopSpeaking } from "../voice/tts";
import type { VoiceInfo } from "../voice/types";

const SEGMENTS = [
  { id: "skills", label: "Скиллы", phase: "P3" },
  { id: "protocols", label: "Протоколы", phase: "P3" },
  { id: "voices", label: "Голоса", phase: "P2" },
  { id: "library", label: "Библиотека", phase: "P8" },
  { id: "terminal", label: "Терминал", phase: "P7" },
] as const;

export function WorkshopPage() {
  const [segment, setSegment] =
    useState<(typeof SEGMENTS)[number]["id"]>("voices");
  const active = SEGMENTS.find((s) => s.id === segment)!;
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void waitForVoices().then((list) => {
      if (cancelled) return;
      setVoices(list);
      setActiveId(getActiveVoiceId(list));
    });
    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, []);

  function selectVoice(id: string) {
    setActiveVoiceId(id);
    setActiveId(id);
  }

  function preview(id: string) {
    selectVoice(id);
    speakText(
      "Привет, я Mira. Это превью голоса из каталога.",
      id,
    );
  }

  return (
    <div className="stack">
      <div className="workshop-segments">
        {SEGMENTS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`btn ${segment === s.id ? "btn-primary" : ""}`}
            onClick={() => setSegment(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {segment !== "voices" ? (
        <div className="panel stack">
          <div className="row">
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{active.label}</h2>
            <StubBadge label={active.phase} />
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Сегмент готов как навигация. Логика — в фазе {active.phase}.
          </p>
        </div>
      ) : (
        <div className="panel stack">
          <div className="row">
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Голоса</h2>
            <StubBadge label="P2 #11" />
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Каталог системных TTS-голосов (speechSynthesis). Импорт своих —
            студия P9.
          </p>
          {voices.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Голоса не найдены в этой среде. Откройте приложение в Electron.
            </p>
          ) : (
            <div className="stack">
              {voices.map((v) => (
                <div key={v.id} className="panel voice-row">
                  <div>
                    <strong>{v.name}</strong>
                    <div className="muted mono">
                      {v.lang}
                      {v.localService ? " · local" : " · remote"}
                      {activeId === v.id ? " · active" : ""}
                    </div>
                  </div>
                  <div className="row">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => preview(v.id)}
                    >
                      Превью
                    </button>
                    <button
                      type="button"
                      className={`btn ${activeId === v.id ? "btn-primary" : ""}`}
                      onClick={() => selectVoice(v.id)}
                    >
                      Выбрать
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
