import { StubBadge } from "../components/StubBadge";
import type { VoiceState } from "../voiceState";

type ChatPageProps = {
  voiceState: VoiceState;
  onCycleVoiceState: () => void;
  onHoldPtt: (down: boolean) => void;
  onDemoConfirm: () => void;
};

const STATE_LABEL: Record<VoiceState, string> = {
  idle: "Готово",
  listening: "Слушаю",
  thinking: "Думаю",
  speaking: "Говорю",
  error: "Ошибка",
};

export function ChatPage({
  voiceState,
  onCycleVoiceState,
  onHoldPtt,
  onDemoConfirm,
}: ChatPageProps) {
  return (
    <div className="stack">
      <div className="row">
        <span className="chip">
          Голос <strong>Default</strong> <StubBadge />
        </span>
        <span className="chip">
          Модель <strong>—</strong> <StubBadge label="P1" />
        </span>
      </div>

      <div className="panel voice-stage">
        <div className="orb" data-state={voiceState} aria-hidden />
        <div>
          <div style={{ fontSize: "1.2rem", fontWeight: 600 }}>
            {STATE_LABEL[voiceState]}
          </div>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            Диалог и LLM подключатся в P1. Сейчас — каркас Home и state machine.
          </p>
        </div>
        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            onMouseDown={() => onHoldPtt(true)}
            onMouseUp={() => onHoldPtt(false)}
            onMouseLeave={() => onHoldPtt(false)}
            onTouchStart={() => onHoldPtt(true)}
            onTouchEnd={() => onHoldPtt(false)}
          >
            Push to talk
          </button>
          <button type="button" className="btn" onClick={onCycleVoiceState}>
            Demo state
          </button>
          <button type="button" className="btn" onClick={onDemoConfirm}>
            Demo confirm
          </button>
        </div>
      </div>

      <div className="panel thread">
        <div className="bubble assistant">
          Привет. Я Mira — каркас P0. Напиши мне в P1, когда подключим модель.
        </div>
        <div className="bubble user">Понял, жду текстовый диалог.</div>
      </div>
    </div>
  );
}
