import { useEffect, useRef, useState } from "react";
import { ThemeSelect } from "./ThemeSelect";
import { setActiveVoiceId } from "../voice/catalog";
import {
  localAddPhrase,
  localCreateProject,
  localDeleteProject,
  localGeneratePhrases,
  localImportClipBytes,
  localStudioSnapshot,
  localTrainVoiceModel,
  localUpdateProject,
} from "../voice/studioLocal";

const STATUS_LABEL: Record<string, string> = {
  created: "Создан",
  phrases: "Фразы собраны",
  collecting: "Сбор корпуса",
  processing: "QA клипов",
  ready_to_train: "Готов к обучению",
  training: "Обучение…",
  needs_data: "Нужно больше аудио",
  ready_partial: "Обучена (черновик)",
  ready: "Обучена",
};

function statusLabel(status: string) {
  return STATUS_LABEL[status] ?? status;
}

export function VoiceStudioPanel(props: {
  onCatalogChanged?: () => void;
  focusProjectId?: string | null;
}) {
  const [projects, setProjects] = useState<MiraVoiceProject[]>([]);
  const [project, setProject] = useState<MiraVoiceProject | null>(null);
  const [phrases, setPhrases] = useState<MiraVoicePhrase[]>([]);
  const [clips, setClips] = useState<MiraVoiceClip[]>([]);
  const [name, setName] = useState("Мой голос");
  const [lang, setLang] = useState("ru-RU");
  const [editName, setEditName] = useState("");
  const [editLang, setEditLang] = useState("ru-RU");
  const [customPhrase, setCustomPhrase] = useState("");
  const [filePath, setFilePath] = useState(
    "seed/voice-studio/sample-phrase.wav",
  );
  const [phraseId, setPhraseId] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const electron = Boolean(window.mira?.voiceStudioSnapshot);

  async function refresh(projectId?: string) {
    const snap = electron
      ? await window.mira!.voiceStudioSnapshot(projectId)
      : localStudioSnapshot(projectId);
    setProjects(snap.projects);
    setProject(snap.project);
    setPhrases(snap.phrases);
    setClips(snap.clips);
    if (snap.project) {
      setEditName(snap.project.name);
      setEditLang(snap.project.lang);
    }
    if (snap.project && !phraseId) {
      const next = snap.phrases.find((p) => !p.recorded);
      if (next) setPhraseId(next.id);
    }
    if (!electron) {
      setNote("Browser-demo · данные в localStorage; в Electron — data/voice-studio");
    }
  }

  useEffect(() => {
    void refresh(props.focusProjectId ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focusProjectId]);

  async function createProject() {
    setBusy("create");
    try {
      const row = electron
        ? await window.mira!.createVoiceProject({
            name: name.trim() || "Новый голос",
            lang: lang.trim() || "ru-RU",
          })
        : localCreateProject({
            name: name.trim() || "Новый голос",
            lang: lang.trim() || "ru-RU",
          });
      setNote(`Проект создан: ${row.name}`);
      await refresh(row.id);
      props.onCatalogChanged?.();
    } finally {
      setBusy(null);
    }
  }

  async function saveSettings() {
    if (!project) return;
    setBusy("save");
    try {
      const row = electron
        ? await window.mira!.updateVoiceProject({
            id: project.id,
            name: editName,
            lang: editLang,
          })
        : localUpdateProject(project.id, { name: editName, lang: editLang });
      setNote(`Сохранено: ${row.name} · ${row.lang}`);
      await refresh(row.id);
      props.onCatalogChanged?.();
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function removeProject() {
    if (!project) return;
    if (!window.confirm(`Удалить проект «${project.name}» и связанные клипы?`)) {
      return;
    }
    setBusy("delete");
    try {
      const res = electron
        ? await window.mira!.deleteVoiceProject(project.id)
        : localDeleteProject(project.id);
      setNote(res.detail);
      setPhraseId("");
      await refresh();
      props.onCatalogChanged?.();
    } finally {
      setBusy(null);
    }
  }

  async function morePhrases() {
    if (!project) return;
    setBusy("phrases");
    try {
      const rows = electron
        ? await window.mira!.generateVoicePhrases(project.id, 5)
        : localGeneratePhrases(project.id, 5);
      setNote(
        rows.length
          ? `+${rows.length} фраз для записи (нумеруйте аудио 1…N)`
          : "Новых фраз нет — добавьте свою ниже",
      );
      await refresh(project.id);
    } finally {
      setBusy(null);
    }
  }

  async function trainModel() {
    if (!project) return;
    setBusy("train");
    try {
      const res = electron
        ? await window.mira!.trainVoiceModel(project.id)
        : localTrainVoiceModel(project.id);
      setNote(
        `${res.report.ok ? "OK" : "FAIL"} · ${res.report.detail} · клипы ${res.report.acceptedClips}, покрытие ${res.report.coveragePct}%`,
      );
      if (res.voice) {
        setActiveVoiceId(res.voice.id);
        props.onCatalogChanged?.();
      }
      await refresh(project.id);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function addPhrase() {
    if (!project || !customPhrase.trim()) return;
    setBusy("add-phrase");
    try {
      const row = electron
        ? await window.mira!.addVoicePhrase(project.id, customPhrase)
        : localAddPhrase(project.id, customPhrase);
      setCustomPhrase("");
      setPhraseId(row.id);
      setNote(`Фраза добавлена: ${row.text.slice(0, 60)}`);
      await refresh(project.id);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function importPath() {
    if (!electron || !project || !filePath.trim()) return;
    setBusy("import");
    try {
      const res = await window.mira!.importVoiceClip({
        projectId: project.id,
        sourcePath: filePath.trim(),
        phraseId: phraseId || null,
      });
      setNote(
        res.processed.project.recommendation ??
          `QA: ${statusLabel(res.processed.project.status)}`,
      );
      await refresh(project.id);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function uploadBytes(file: File) {
    if (!project) return;
    setBusy("bytes");
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const res = electron
        ? await window.mira!.importVoiceClipBytes({
            projectId: project.id,
            bytes: Array.from(buf),
            fileName: file.name,
            phraseId: phraseId || null,
          })
        : localImportClipBytes({
            projectId: project.id,
            bytes: Array.from(buf),
            fileName: file.name,
            phraseId: phraseId || null,
          });
      setNote(
        res.processed.project.recommendation ??
          `Клип загружен · ${statusLabel(res.processed.project.status)}`,
      );
      await refresh(project.id);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function toggleRecord() {
    if (!project) return;
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
            const res = electron
              ? await window.mira!.importVoiceClipBytes({
                  projectId: project.id,
                  bytes: Array.from(buf),
                  fileName: `rec-${Date.now()}.webm`,
                  phraseId: phraseId || null,
                })
              : localImportClipBytes({
                  projectId: project.id,
                  bytes: Array.from(buf),
                  fileName: `rec-${Date.now()}.webm`,
                  phraseId: phraseId || null,
                });
            setNote(
              res.processed.project.recommendation ??
                `Запись принята · ${statusLabel(res.processed.project.status)}`,
            );
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
    if (!project?.custom_voice_id) return;
    if (electron) {
      const voices = await window.mira!.listCustomVoices();
      const voice = voices.find((v) => v.id === project.custom_voice_id);
      if (!voice?.preview_path) {
        setNote("Нет preview_path");
        return;
      }
      try {
        const dataUrl = await window.mira!.readVoicePreview(voice.preview_path);
        const audio = new Audio(dataUrl);
        void audio.play();
        setActiveVoiceId(voice.id);
        props.onCatalogChanged?.();
      } catch (err) {
        setNote(err instanceof Error ? err.message : String(err));
      }
      return;
    }
    setActiveVoiceId(project.custom_voice_id);
    props.onCatalogChanged?.();
    setNote("Browser-demo: превью через Web Speech после выбора голоса");
  }

  const acceptedClips = clips.filter((c) => c.accepted).length;
  const linkedAccepted = clips.filter((c) => c.accepted && c.phrase_id).length;
  const coveragePct =
    phrases.length > 0
      ? Math.round((linkedAccepted / phrases.length) * 100)
      : 0;
  const canTrain = acceptedClips >= 3;

  return (
    <div className="panel stack">
      <div className="row">
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Студия голоса</h2>
        <span className="muted mono">P9 #15 · обучение модели</span>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Здесь вы обучаете локальную голосовую модель Mira: собираете корпус
        «фраза ↔ аудио», прогоняете QA и запускаете обучение. После обучения
        голос появляется в каталоге (превью из клипов; синтез новых фраз — через
        профиль + Web Speech до neural-trainer).
      </p>
      <ol className="muted" style={{ margin: 0, paddingLeft: "1.2rem" }}>
        <li>Создайте проект голоса (имя + язык).</li>
        <li>Сгенерируйте или добавьте фразы — они нумеруются 1…N.</li>
        <li>
          Запишите mic / загрузите аудио, привязав клип к номеру фразы (удобно
          называть файлы 1.wav, 2.wav…).
        </li>
        <li>Когда набрано ≥3 принятых клипа — нажмите «Обучить модель».</li>
        <li>Голос попадает в каталог; можно донабрать корпус и переобучить.</li>
      </ol>

      <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Имя голоса"
          style={{ minWidth: "12rem" }}
        />
        <input
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          placeholder="ru-RU"
          style={{ width: "6.5rem" }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={Boolean(busy)}
          onClick={() => void createProject()}
        >
          Создать проект обучения
        </button>
      </div>

      {projects.length > 0 ? (
        <label className="stack" style={{ gap: "0.25rem" }}>
          <span className="muted">Проект модели</span>
          <ThemeSelect
            aria-label="Проект голоса"
            value={project?.id ?? ""}
            options={projects.map((p) => ({
              value: p.id,
              label: `${p.name} · ${statusLabel(p.status)}`,
            }))}
            onChange={(id) => void refresh(id)}
          />
        </label>
      ) : null}

      {project ? (
        <>
          <div className="panel stack" style={{ gap: "0.5rem" }}>
            <strong>Параметры модели</strong>
            <label className="field-label">
              Имя
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </label>
            <label className="field-label">
              Язык
              <input
                value={editLang}
                onChange={(e) => setEditLang(e.target.value)}
                placeholder="ru-RU"
              />
            </label>
            <div className="muted">
              Статус: <strong>{statusLabel(project.status)}</strong>
              {project.recommendation ? ` · ${project.recommendation}` : ""}
            </div>
            <div className="muted mono">
              Корпус: фраз {phrases.length} · принятых клипов {acceptedClips} ·
              привязано {linkedAccepted} · покрытие {coveragePct}%
              {project.custom_voice_id
                ? ` · catalog ${project.custom_voice_id}`
                : ""}
            </div>
            <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
              <button
                type="button"
                className="btn"
                disabled={Boolean(busy)}
                onClick={() => void saveSettings()}
              >
                Сохранить параметры
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={Boolean(busy) || !canTrain}
                onClick={() => void trainModel()}
                title={
                  canTrain
                    ? "QA клипов → сборка корпуса → публикация в каталог"
                    : "Нужно минимум 3 принятых клипа"
                }
              >
                {busy === "train"
                  ? "Обучение…"
                  : project.custom_voice_id
                    ? "Переобучить модель"
                    : "Обучить модель"}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={Boolean(busy)}
                onClick={() => void removeProject()}
              >
                Удалить проект
              </button>
            </div>
          </div>

          <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn"
              disabled={Boolean(busy)}
              onClick={() => void morePhrases()}
            >
              Сгенерировать фразы
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
              Превью модели
            </button>
          </div>

          <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
            <input
              value={customPhrase}
              onChange={(e) => setCustomPhrase(e.target.value)}
              placeholder="Своя фраза для записи…"
              style={{ flex: 1, minWidth: "14rem" }}
            />
            <button
              type="button"
              className="btn"
              disabled={Boolean(busy) || !customPhrase.trim()}
              onClick={() => void addPhrase()}
            >
              Добавить фразу
            </button>
          </div>

          <label className="stack" style={{ gap: "0.25rem" }}>
            <span className="muted">Фраза для привязки клипа</span>
            <ThemeSelect
              aria-label="Фраза для привязки клипа"
              value={phraseId}
              options={[
                { value: "", label: "— без привязки —" },
                ...phrases.map((p, i) => ({
                  value: p.id,
                  label: `${i + 1}. ${p.recorded ? "✓ " : ""}${p.text.slice(0, 68)}`,
                })),
              ]}
              onChange={setPhraseId}
            />
          </label>

          <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
            {electron ? (
              <>
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
              </>
            ) : null}
            <label className="btn" style={{ cursor: "pointer" }}>
              Загрузить аудио…
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
              <span className="muted">
                Нажмите «Сгенерировать фразы» или добавьте свою
              </span>
            ) : (
              phrases.map((p, i) => (
                <div key={p.id} className="muted mono">
                  {i + 1}. {p.recorded ? "✓" : "○"} {p.text}
                </div>
              ))
            )}
          </div>

          <div className="stack" style={{ gap: "0.35rem" }}>
            <strong>Клипы ({clips.length})</strong>
            {clips.length === 0 ? (
              <span className="muted">Пока нет загрузок / записей</span>
            ) : (
              clips.slice(0, 6).map((c) => {
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
              })
            )}
          </div>
        </>
      ) : null}

      {note ? <p className="muted" style={{ margin: 0 }}>{note}</p> : null}
      {busy ? <p className="muted mono">busy: {busy}</p> : null}
    </div>
  );
}
