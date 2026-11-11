import { useState } from "react";
import { StubBadge } from "../components/StubBadge";

const SEGMENTS = [
  { id: "skills", label: "Скиллы", phase: "P3" },
  { id: "protocols", label: "Протоколы", phase: "P3" },
  { id: "voices", label: "Голоса", phase: "P2" },
  { id: "library", label: "Библиотека", phase: "P8" },
  { id: "terminal", label: "Терминал", phase: "P7" },
] as const;

export function WorkshopPage() {
  const [segment, setSegment] =
    useState<(typeof SEGMENTS)[number]["id"]>("skills");
  const active = SEGMENTS.find((s) => s.id === segment)!;

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
      <div className="panel stack">
        <div className="row">
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{active.label}</h2>
          <StubBadge label={active.phase} />
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Сегмент Мастерской готов как навигация. Логика модуля — в фазе{" "}
          {active.phase}.
        </p>
      </div>
    </div>
  );
}
