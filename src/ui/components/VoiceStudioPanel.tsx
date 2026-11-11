import { useEffect, useRef, useState } from "react";
import { setActiveVoiceId } from "../voice/catalog";

export function VoiceStudioPanel(props: {
  onCatalogChanged?: () => void;
}) {
  const [projects, setProjects] = useState<MiraVoiceProject[]>([]);
  const [project, setProject] = useState<MiraVoiceProject | null>(null);
  const [phrases, setPhrases] = useState<MiraVoicePhrase[]>([]);
  const [clips, setClips] = useState<MiraVoiceClip[]>([]);
  const [name, setName] = useState("Мой голос");
  const [filePath, setFilePath] = useState(
    "seed/voice-studio/sample-phrase.wav",
  );
  const [phraseId, setPhraseId] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  async function refresh(projectId?: string) {
    if (!window.mira) {
      setNote("Нужен Electron для студии голоса.");
      return;
    }
    const snap = await window.mira.voiceStudioSnapshot(projectId);
    setProjects(snap.projects);
    setProject(snap.project);
    setPhrases(snap.phrases);
    setClips(snap.clips);
    if (snap.project && !phraseId) {
      const next = snap.phrases.find((p) => !p.recorded);
      if (next) setPhraseId(next.id);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function createProject() {
    if (!window.mira) return;
    setBusy("create");
    try {
      const row = await window.mira.createVoiceProject({
        name: name.trim() || "Новый голос",
        lang: "ru-RU",
      });
      setNote(`Проект создан: ${row.name}`);
      await refresh(row.id);
    } finally {
      setBusy(null);
    }
  }

  async function morePhrases() {
    if (!window.mira || !project) return;
    setBusy("phrases");
    try {
      const rows = await window.mira.generateVoicePhrases(project.id, 5);
      setNote(
        rows.length
          ? `+${rows.length} фраз (дедуп банка)`
          : "Новых фраз нет — банк исчерпан для демо",
      );
      await refresh(project.id);
    } finally {
      setBusy(null);
    }
  }

  async function importPath() {
    if (!window.mira || !project || !filePath.trim()) return;
    setBusy("import");
    try {
      const res = await window.mira.importVoiceClip({
        projectId: project.id,
        sourcePath: filePath.trim(),
        phraseId: phraseId || null,
      });
      const voice = res.processed.voice;
      setNote(
        voice
          ? `Автообработка OK → голос в каталоге: ${voice.id}`
          : `Анализ: ${res.processed.project.status} · ${res.processed.project.recommendation ?? ""}`,
      );
      if (voice) {
        setActiveVoiceId(voice.id);
        props.onCatalogChanged?.();
      }
      await refresh(project.id);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function uploadBytes(file: File) {
    if (!window.mira || !project) return;
    setBusy("bytes");
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const res = await window.mira.importVoiceClipBytes({
        projectId: project.id,
        bytes: Array.from(buf),
        fileName: file.name,
        phraseId: phraseId || null,
      });
      const voice = res.processed.voice;
      setNote(
        voice
          ? `Файл принят → ${voice.name} в каталоге`
          : res.processed.project.recommendation ?? "Обработано",
      );
      if (voice) {
        setActiveVoiceId(voice.id);
        props.onCatalogChanged?.();
      }
      await refresh(project.id);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function toggleRecord() {
    if (!window.mira || !project) return;
    if (recording && mediaRef.current) {
      mediaRef.current.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        void (async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const buf = new Uint8Array(await blob.arrayBuffer());
          if (buf.length < 800) {
            setNote("Запись слишком короткая");
            return;
          }
          setBusy("record");
          try {
            const res = await window.mira!.importVoiceClipBytes({
              projectId: project.id,
              bytes: Array.from(buf),
              fileName: `rec-${Date.now()}.webm`,
              phraseId: phraseId || null,
            });
            const voice = res.processed.voice;
            setNote(
              voice
                ? `Запись → голос ${voice.id}`
                : res.processed.project.recommendation ?? "OK",
            );
            if (voice) {
              setActiveVoiceId(voice.id);
              props.onCatalogChanged?.();
            }
            await refresh(project.id);
          } catch (err) {
            setNote(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(null);
          }
        })();
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true);
      setNote("Идёт запись… нажмите ещё раз, чтобы остановить");
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  }

  async function previewCustom() {
    if (!window.mira || !project?.custom_voice_id) return;
    const voices = await window.mira.listCustomVoices();
    const voice = voices.find((v) => v.id === project.custom_voice_id);
    if (!voice?.preview_path) {
      setNote("Нет preview_path");
      return;
    }
    try {
      const dataUrl = await window.mira.readVoicePreview(voice.preview_path);
      const audio = new Audio(dataUrl);
      void audio.play();
      setActiveVoiceId(voice.id);
      props.onCatalogChanged?.();
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="panel stack">
      <div className="row">
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Студия голоса</h2>
        <span className="muted mono">P9 #15</span>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Создать → фразы → загрузить/записать → Mira сама анализирует и собирает
        TTS → голос в каталоге → ещё фраз.
      </p>

      <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Имя голоса"
          style={{ minWidth: "12rem" }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={Boolean(busy)}
          onClick={() => void createProject()}
        >
          Создать новый голос
        </button>
      </div>

      {projects.length > 0 ? (
        <label className="stack" style={{ gap: "0.25rem" }}>
          <span className="muted">Проект</span>
          <select
            value={project?.id ?? ""}
            onChange={(e) => void refresh(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.status}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {project ? (
        <>
          <div className="panel stack" style={{ gap: "0.35rem" }}>
            <strong>
              {project.name} · {project.status}
            </strong>
            <span className="muted">
              {project.recommendation ?? "Нет рекомендации"}
            </span>
            {project.custom_voice_id ? (
              <span className="mono muted">
                catalog: {project.custom_voice_id}
              </span>
            ) : null}
            {project.llm_profile ? (
              <span className="muted">LLM-профиль привязан (stub 15.9)</span>
            ) : null}
          </div>

          <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn"
              disabled={Boolean(busy)}
              onClick={() => void morePhrases()}
            >
              Ещё фраз
            </button>
            <button
              type="button"
              className={`btn ${recording ? "btn-primary" : ""}`}
              disabled={Boolean(busy) && !recording}
              onClick={() => void toggleRecord()}
            >
              {recording ? "Стоп запись" : "Запись mic"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!project.custom_voice_id || Boolean(busy)}
              onClick={() => void previewCustom()}
            >
              Превью корпуса
            </button>
          </div>

          <label className="stack" style={{ gap: "0.25rem" }}>
            <span className="muted">Фраза для привязки клипа</span>
            <select
              value={phraseId}
              onChange={(e) => setPhraseId(e.target.value)}
            >
              <option value="">— без привязки —</option>
              {phrases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.recorded ? "✓ " : ""}
                  {p.text.slice(0, 72)}
                </option>
              ))}
            </select>
          </label>

          <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
            <input
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="seed/voice-studio/….wav"
              style={{ flex: 1, minWidth: "14rem" }}
            />
            <button
              type="button"
              className="btn"
              disabled={Boolean(busy)}
              onClick={() => void importPath()}
            >
              Загрузить путь
            </button>
            <label className="btn" style={{ cursor: "pointer" }}>
              Файл…
              <input
                type="file"
                accept="audio/*,.wav,.flac,.webm,.mp3,.ogg,.m4a"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadBytes(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          <div className="stack" style={{ gap: "0.35rem" }}>
            <strong>Фразы ({phrases.length})</strong>
            {phrases.length === 0 ? (
              <span className="muted">Нажмите «Ещё фраз»</span>
            ) : (
              phrases.slice(0, 8).map((p) => (
                <div key={p.id} className="muted">
                  {p.recorded ? "●" : "○"} {p.text}
                </div>
              ))
            )}
          </div>

          <div className="stack" style={{ gap: "0.35rem" }}>
            <strong>Клипы ({clips.length})</strong>
            {clips.slice(0, 6).map((c) => {
              let qa = "";
              try {
                const parsed = c.qa_json
                  ? (JSON.parse(c.qa_json) as {
                      accepted?: boolean;
                      issues?: string[];
                      approxSec?: number;
                    })
                  : null;
                qa = parsed
                  ? `${parsed.accepted ? "accept" : "reject"} · ${parsed.approxSec ?? "?"}s · ${(parsed.issues ?? []).join(",") || "ok"}`
                  : "pending";
              } catch {
                qa = "qa?";
              }
              return (
                <div key={c.id} className="muted mono">
                  {c.accepted ? "✓" : "×"} {qa}
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {note ? <p className="muted" style={{ margin: 0 }}>{note}</p> : null}
      {busy ? <p className="muted mono">busy: {busy}</p> : null}
    </div>
  );
}
