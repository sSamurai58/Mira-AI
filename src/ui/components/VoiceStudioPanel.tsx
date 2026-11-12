import { useEffect, useRef, useState } from "react";
import { ThemeSelect } from "./ThemeSelect";
import { clearActiveVoiceId, setActiveVoiceId } from "../voice/catalog";
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
  processing: "QA аудио",
  ready_to_train: "Готов к обучению",
  training: "Обучение…",
  needs_data: "Нужно больше аудио",
  ready_partial: "Обучена (черновик)",
  ready: "Обучена",
};

function statusLabel(status: string) {
  return STATUS_LABEL[status] ?? status;
}

/** 1-based index in the full phrase array — never renumber a visible subset. */
function phraseDisplayNo(all: MiraVoicePhrase[], phraseId: string): number {
  const i = all.findIndex((p) => p.id === phraseId);
  return i >= 0 ? i + 1 : 0;
}

function phraseTextPreview(text: string, max = 42): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1))}…`;
}

function phraseSelectLabel(all: MiraVoicePhrase[], p: MiraVoicePhrase): string {
  const n = phraseDisplayNo(all, p.id);
  return `${n}. ${p.recorded ? "✓ " : ""}${p.text.slice(0, 68)}`;
}

/** Row label for uploaded/recorded audio: same 1…N as the phrase list + short text. */
function clipPhraseLinkLabel(
  all: MiraVoicePhrase[],
  phraseId: string | null,
): string {
  if (!phraseId) return "без фразы";
  const p = all.find((x) => x.id === phraseId);
  if (!p) return "фраза ?";
  const n = phraseDisplayNo(all, phraseId);
  return `${n}. ${phraseTextPreview(p.text)}`;
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
  const [phrasesOpen, setPhrasesOpen] = useState(false);
  const [playingPhraseId, setPlayingPhraseId] = useState<string | null>(null);
  const [genCount, setGenCount] = useState(8);
  const [genMinWords, setGenMinWords] = useState(4);
  const [genMaxWords, setGenMaxWords] = useState(48);
  const [trainProgress, setTrainProgress] = useState<{
    step: string;
    pct: number;
    label: string;
  } | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
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

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

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
    if (!window.confirm(`Удалить проект «${project.name}» и связанное аудио?`)) {
      return;
    }
    setBusy("delete");
    try {
      const res = electron
        ? await window.mira!.deleteVoiceProject(project.id)
        : localDeleteProject(project.id);
      if (res.clearedVoiceId) clearActiveVoiceId(res.clearedVoiceId);
      setNote(res.detail);
      setPhraseId("");
      stopPhraseAudio();
      setPhrasesOpen(false);
      await refresh();
      props.onCatalogChanged?.();
    } finally {
      setBusy(null);
    }
  }

  async function morePhrases() {
    if (!project) return;
    setBusy("phrases");
    const minW = Math.max(1, Math.min(genMinWords, 400));
    const maxW = Math.max(minW, Math.min(genMaxWords, 500));
    const count = Math.max(1, Math.min(genCount, 40));
    const opts = { count, minWords: minW, maxWords: maxW };
    try {
      const rows = electron
        ? await window.mira!.generateVoicePhrases(project.id, opts)
        : localGeneratePhrases(project.id, opts);
      setNote(
        rows.length
          ? `+${rows.length} текстов (${minW}–${maxW} слов; сначала самые частые слова/фразы). Непокрытые пока — системный TTS`
          : `Новых текстов на ${minW}–${maxW} слов нет — добавьте свою ниже`,
      );
      await refresh(project.id);
      // After train, corpus is collapsed — open list so generation isn't "silent".
      const trained =
        Boolean(project.custom_voice_id) ||
        project.status === "ready" ||
        project.status === "ready_partial";
      if (rows.length && trained) setPhrasesOpen(true);
    } catch (err) {
      setNote(
        err instanceof Error
          ? `Генерация фраз: ${err.message}`
          : "Генерация фраз не удалась",
      );
    } finally {
      setBusy(null);
    }
  }

  async function trainModel() {
    if (!project) return;
    setBusy("train");
    setTrainProgress({
      step: "validate",
      pct: 2,
      label: "Старт обучения модели…",
    });
    const unsub = electron
      ? window.mira?.onVoiceTrainProgress?.((ev) => {
          if (ev.projectId !== project.id) return;
          setTrainProgress({
            step: ev.step,
            pct: ev.pct,
            label: ev.label,
          });
        })
      : undefined;
    try {
      const res = electron
        ? await window.mira!.trainVoiceModel(project.id)
        : await localTrainVoiceModel(project.id, (ev) => {
            setTrainProgress({
              step: ev.step,
              pct: ev.pct,
              label: ev.label,
            });
          });
      const words =
        res.report.wordUnitCount != null
          ? ` · слов ${res.report.wordUnitCount}`
          : "";
      setNote(
        `${res.report.ok ? "OK" : "FAIL"} · ${res.report.detail} · аудио ${res.report.acceptedClips}, покрытие ${res.report.coveragePct}%${words}`,
      );
      if (res.voice) {
        setActiveVoiceId(res.voice.id);
        props.onCatalogChanged?.();
      }
      await refresh(project.id);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      unsub?.();
      setBusy(null);
      setTrainProgress(null);
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
          `Аудио загружено · ${statusLabel(res.processed.project.status)}`,
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

  function stopPhraseAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingPhraseId(null);
  }

  function bestClipForPhrase(phraseId: string): MiraVoiceClip | null {
    const linked = clips.filter((c) => c.phrase_id === phraseId);
    const accepted = linked.find((c) => c.accepted);
    return accepted ?? linked[0] ?? null;
  }

  async function playPhraseAudio(phraseId: string) {
    const clip = bestClipForPhrase(phraseId);
    if (!clip) {
      setNote("Нет аудио для этой фразы — загрузите или запишите");
      return;
    }
    if (!electron || clip.file_path.startsWith("browser://")) {
      setNote(
        "Плеер аудио доступен в Electron (файлы в data/voice-studio). В browser-demo байты не хранятся.",
      );
      return;
    }
    stopPhraseAudio();
    setBusy(`play-${phraseId}`);
    try {
      const dataUrl = await window.mira!.readVoicePreview(clip.file_path);
      const audio = new Audio(dataUrl);
      audioRef.current = audio;
      setPlayingPhraseId(phraseId);
      audio.onended = () => {
        if (audioRef.current === audio) {
          audioRef.current = null;
          setPlayingPhraseId(null);
        }
      };
      await audio.play();
    } catch (err) {
      setPlayingPhraseId(null);
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function beginReloadPhrase(nextPhraseId: string) {
    setPhraseId(nextPhraseId);
    setNote("Перезагрузка фразы: запишите mic или загрузите аудио");
  }

  function closePhrasesPanel() {
    stopPhraseAudio();
    setPhrasesOpen(false);
  }

  const acceptedClips = clips.filter((c) => c.accepted).length;
  const linkedAccepted = clips.filter((c) => c.accepted && c.phrase_id).length;
  const coveragePct =
    phrases.length > 0
      ? Math.round((linkedAccepted / phrases.length) * 100)
      : 0;
  const canTrain = phrases.length >= 1 && linkedAccepted >= 3;
  const isTrained =
    Boolean(project?.custom_voice_id) ||
    project?.status === "ready" ||
    project?.status === "ready_partial";
  const recordedCount = phrases.filter((p) => p.recorded).length;
  const collapseCorpus = Boolean(project && isTrained && phrases.length > 0);
  const corpusReadyLabel =
    recordedCount === phrases.length
      ? "готово"
      : `${recordedCount}/${phrases.length} с аудио`;

  return (
    <div className="panel stack">
      <div className="row">
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Студия голоса</h2>
        <span className="muted mono">P9 #15 · обучение модели</span>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Фразы обучают слова и интонацию (не готовый playback реплик). После
        обучения Mira собирает новые ответы склейкой фрагментов из клипов; слова
        вне корпуса — запасной системный TTS.
      </p>
      <ol className="muted" style={{ margin: 0, paddingLeft: "1.2rem" }}>
        <li>Создайте проект голоса (имя + язык).</li>
        <li>
          Сгенерируйте или добавьте фразы — приоритет у самых частых слов и
          ответов Mira; они нумеруются 1…N.
        </li>
        <li>
          Запишите mic / загрузите аудио, привязав запись к номеру фразы
          (удобно называть файлы 1.wav, 2.wav…).
        </li>
        <li>
          Когда набрано ≥3 принятых записей — запустите обучение модели
          (валидация → сегментация → лексикон → пакет → каталог).
        </li>
        <li>
          После обучения голос в каталоге; непокрытые слова пока говорит
          системный TTS — донабирайте корпус и переобучайте.
        </li>
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
            onChange={(id) => {
              stopPhraseAudio();
              setPhrasesOpen(false);
              void refresh(id);
            }}
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
              Корпус: фраз {phrases.length} · принятых аудио {acceptedClips} ·
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
                    ? "Валидация → сегментация → лексикон → model-pack → каталог"
                    : "Нужно ≥1 фраза и ≥3 принятых записей, привязанных к фразам"
                }
              >
                {busy === "train"
                  ? trainProgress
                    ? `Обучение ${trainProgress.pct}%`
                    : "Обучение…"
                  : project.custom_voice_id
                    ? "Переобучить модель"
                    : "Обучить модель"}
              </button>
              {busy === "train" && trainProgress ? (
                <div
                  className="muted"
                  style={{ flex: "1 1 100%", fontSize: "0.9rem" }}
                  aria-live="polite"
                >
                  <strong>{trainProgress.pct}%</strong>
                  {` · ${trainProgress.step} · ${trainProgress.label}`}
                  <div
                    style={{
                      marginTop: "0.35rem",
                      height: "0.35rem",
                      background:
                        "color-mix(in oklab, var(--fg) 12%, transparent)",
                      borderRadius: "999px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.max(2, Math.min(100, trainProgress.pct))}%`,
                        height: "100%",
                        background: "var(--accent, #3d8bfd)",
                        transition: "width 0.25s ease",
                      }}
                    />
                  </div>
                </div>
              ) : null}
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

          <div
            className="row"
            style={{
              flexWrap: "wrap",
              gap: "0.5rem",
              alignItems: "center",
            }}
          >
            <label
              className="muted"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                fontSize: "0.85rem",
              }}
              title="Сколько текстов добавить за один запуск"
            >
              шт.
              <input
                type="number"
                min={1}
                max={40}
                value={genCount}
                disabled={Boolean(busy)}
                onChange={(e) =>
                  setGenCount(
                    Math.max(1, Math.min(40, Number(e.target.value) || 1)),
                  )
                }
                style={{ width: "3.25rem" }}
              />
            </label>
            <label
              className="muted"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                fontSize: "0.85rem",
              }}
              title="Минимум слов в каждом тексте — для длинного корпуса обучения"
            >
              слов от
              <input
                type="number"
                min={1}
                max={400}
                value={genMinWords}
                disabled={Boolean(busy)}
                onChange={(e) =>
                  setGenMinWords(
                    Math.max(1, Math.min(400, Number(e.target.value) || 1)),
                  )
                }
                style={{ width: "3.5rem" }}
              />
            </label>
            <label
              className="muted"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                fontSize: "0.85rem",
              }}
              title="Максимум слов в каждом тексте"
            >
              до
              <input
                type="number"
                min={1}
                max={500}
                value={genMaxWords}
                disabled={Boolean(busy)}
                onChange={(e) =>
                  setGenMaxWords(
                    Math.max(1, Math.min(500, Number(e.target.value) || 1)),
                  )
                }
                style={{ width: "3.5rem" }}
              />
            </label>
            <button
              type="button"
              className="btn"
              disabled={Boolean(busy)}
              onClick={() => void morePhrases()}
              title="Сначала тексты из речи ассистента в заданном диапазоне слов"
            >
              {busy === "phrases" ? "Генерация…" : "Сгенерировать фразы"}
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

          <div
            className="panel stack"
            style={{ gap: "0.5rem" }}
            data-testid="voice-own-phrase"
          >
            <strong>Своя фраза</strong>
            <p className="muted" style={{ margin: 0 }}>
              Добавьте текст вручную, затем запишите mic или загрузите аудио к
              номеру фразы — так студийный голос покроет реальные ответы Mira.
            </p>
            <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
              <input
                value={customPhrase}
                onChange={(e) => setCustomPhrase(e.target.value)}
                placeholder="Своя фраза для записи…"
                style={{ flex: 1, minWidth: "14rem" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customPhrase.trim()) {
                    e.preventDefault();
                    void addPhrase();
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={Boolean(busy) || !customPhrase.trim()}
                onClick={() => void addPhrase()}
              >
                Добавить фразу
              </button>
            </div>

            <label className="stack" style={{ gap: "0.25rem" }}>
              <span className="muted">Фраза для привязки аудио</span>
              <ThemeSelect
                aria-label="Фраза для привязки аудио"
                value={phraseId}
                options={[
                  { value: "", label: "— без привязки —" },
                  ...phrases.map((p) => ({
                    value: p.id,
                    label: phraseSelectLabel(phrases, p),
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
          </div>

          {collapseCorpus ? (
            <div className="voice-phrases-summary panel stack" style={{ gap: "0.55rem" }}>
              <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                <strong style={{ margin: 0 }}>
                  {phrases.length} фраз · {corpusReadyLabel}
                </strong>
                <span className="muted mono" style={{ fontSize: "0.85rem" }}>
                  аудио {acceptedClips} · покрытие {coveragePct}%
                </span>
              </div>
              <p className="muted" style={{ margin: 0 }}>
                Список фраз свёрнут после обучения. Нумерация 1…N сохраняется —
                откройте просмотр, чтобы прослушать аудио, перезагрузить
                отдельные фразы или переобучить модель целиком. Свою фразу можно
                добавить выше в любой момент.
              </p>
              <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setPhrasesOpen(true)}
                >
                  Просмотр фраз
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={Boolean(busy) || !canTrain}
                  onClick={() => void trainModel()}
                  title={
                    canTrain
                      ? "Полное переобучение по текущему корпусу"
                      : "Нужно ≥1 фраза и ≥3 принятых записей"
                  }
                >
                  {busy === "train" ? "Обучение…" : "Переобучить"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="stack" style={{ gap: "0.35rem" }}>
                <strong>Фразы ({phrases.length})</strong>
                {phrases.length === 0 ? (
                  <span className="muted">
                    Нажмите «Сгенерировать фразы» или добавьте свою выше
                  </span>
                ) : (
                  phrases.map((p) => (
                    <div key={p.id} className="muted mono">
                      {phraseDisplayNo(phrases, p.id)}.{" "}
                      {p.recorded ? "✓" : "○"} {p.text}
                    </div>
                  ))
                )}
              </div>

              <div className="stack" style={{ gap: "0.35rem" }}>
                <strong>Аудио фраз ({clips.length})</strong>
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
                    const phraseLink = clipPhraseLinkLabel(phrases, c.phrase_id);
                    return (
                      <div key={c.id} className="muted mono">
                        {c.accepted ? "✓" : "×"} {phraseLink} · {qa}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </>
      ) : null}

      {note ? <p className="muted" style={{ margin: 0 }}>{note}</p> : null}
      {busy ? <p className="muted mono">busy: {busy}</p> : null}

      {phrasesOpen && project ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => closePhrasesPanel()}
        >
          <div
            className="modal modal-wide voice-phrases-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="voice-phrases-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row" style={{ alignItems: "flex-start", gap: "0.5rem" }}>
              <div style={{ flex: 1 }}>
                <h2 id="voice-phrases-title" style={{ margin: 0 }}>
                  Фразы · {project.name}
                </h2>
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                  {phrases.length} фраз · номера 1…{phrases.length || "N"} ·{" "}
                  {corpusReadyLabel} · аудио {acceptedClips}
                </p>
              </div>
              <button
                type="button"
                className="btn catalog-edit-close"
                aria-label="Закрыть"
                onClick={() => closePhrasesPanel()}
              >
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
                  <path
                    d="M3.2 3.2l9.6 9.6M12.8 3.2L3.2 12.8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <div className="voice-phrases-modal-list">
              {phrases.length === 0 ? (
                <span className="muted">Фраз пока нет</span>
              ) : (
                phrases.map((p) => {
                  const clip = bestClipForPhrase(p.id);
                  const activeReload = phraseId === p.id;
                  const n = phraseDisplayNo(phrases, p.id);
                  return (
                    <div
                      key={p.id}
                      className={`voice-phrase-row${activeReload ? " is-active" : ""}`}
                    >
                      <div className="voice-phrase-row-main muted mono">
                        <span>
                          {n}. {p.recorded ? "✓" : "○"} {p.text}
                        </span>
                        <span className="voice-phrase-row-meta">
                          {clip
                            ? clip.accepted
                              ? "аудио ✓"
                              : "аудио ×"
                            : "нет аудио"}
                        </span>
                      </div>
                      <div className="row" style={{ flexWrap: "wrap", gap: "0.35rem" }}>
                        <button
                          type="button"
                          className="btn"
                          disabled={Boolean(busy) || !clip}
                          onClick={() => void playPhraseAudio(p.id)}
                        >
                          {playingPhraseId === p.id ? "▶…" : "Слушать"}
                        </button>
                        <button
                          type="button"
                          className={`btn${activeReload ? " btn-primary" : ""}`}
                          disabled={Boolean(busy) && !recording}
                          onClick={() => beginReloadPhrase(p.id)}
                        >
                          {activeReload ? "Выбрана" : "Перезагрузить"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="panel stack voice-phrases-reload" style={{ gap: "0.5rem" }}>
              <strong>Перезагрузка / дозапись</strong>
              <label className="stack" style={{ gap: "0.25rem" }}>
                <span className="muted">Фраза для привязки аудио</span>
                <ThemeSelect
                  aria-label="Фраза для перезагрузки"
                  value={phraseId}
                  options={[
                    { value: "", label: "— без привязки —" },
                    ...phrases.map((p) => ({
                      value: p.id,
                      label: phraseSelectLabel(phrases, p),
                    })),
                  ]}
                  onChange={setPhraseId}
                />
              </label>
              <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
                <button
                  type="button"
                  className={`btn ${recording ? "btn-primary" : ""}`}
                  disabled={Boolean(busy) && !recording}
                  onClick={() => void toggleRecord()}
                >
                  {recording ? "Стоп запись" : "Запись mic"}
                </button>
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
                {electron ? (
                  <>
                    <input
                      value={filePath}
                      onChange={(e) => setFilePath(e.target.value)}
                      placeholder="seed/voice-studio/….wav"
                      style={{ flex: 1, minWidth: "10rem" }}
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
              </div>
              <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
                <input
                  value={customPhrase}
                  onChange={(e) => setCustomPhrase(e.target.value)}
                  placeholder="Своя фраза…"
                  style={{ flex: 1, minWidth: "12rem" }}
                />
                <button
                  type="button"
                  className="btn"
                  disabled={Boolean(busy) || !customPhrase.trim()}
                  onClick={() => void addPhrase()}
                >
                  Добавить фразу
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={Boolean(busy)}
                  onClick={() => void morePhrases()}
                >
                  +5 фраз
                </button>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() => closePhrasesPanel()}
              >
                Закрыть
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={Boolean(busy) || !canTrain}
                onClick={() => void trainModel()}
              >
                {busy === "train" ? "Обучение…" : "Полное переобучение"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
