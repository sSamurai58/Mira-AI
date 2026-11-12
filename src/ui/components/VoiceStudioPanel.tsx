import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useAppConfirm } from "./AppConfirm";
import { ThemeSelect } from "./ThemeSelect";
import { clearActiveVoiceId, setActiveVoiceId } from "../voice/catalog";
import {
  localAddPhrase,
  localCreateProject,
  localDeletePhrase,
  localDeleteProject,
  localGeneratePhrases,
  localImportClipBytes,
  localResetVoicePhraseAudio,
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

type CurriculumUiRow = {
  concept: string;
  neural: string;
  mira: string;
  status: string;
  title?: string;
  meaning?: string;
  miraPlain?: string;
  group?: string;
};

const CURRICULUM_STATUS_RU: Record<string, string> = {
  mapped: "работает",
  proxy: "упрощённо",
  deferred: "позже",
};

const CURRICULUM_GROUP_ORDER = [
  "record_train",
  "speak",
  "later",
] as const;

const CURRICULUM_GROUP_RU: Record<string, string> = {
  record_train: "Запись и обучение",
  speak: "Сборка речи",
  later: "Что позже",
};

function curriculumStatusRu(status: string): string {
  return CURRICULUM_STATUS_RU[status] ?? status;
}

function curriculumTitle(row: CurriculumUiRow): string {
  return row.title?.trim() || row.concept;
}

function groupCurriculumRows(rows: CurriculumUiRow[]): Array<{
  key: string;
  label: string;
  rows: CurriculumUiRow[];
}> {
  const buckets = new Map<string, CurriculumUiRow[]>();
  for (const row of rows) {
    const key = row.group?.trim() || "record_train";
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }
  const ordered: Array<{ key: string; label: string; rows: CurriculumUiRow[] }> =
    [];
  for (const key of CURRICULUM_GROUP_ORDER) {
    const list = buckets.get(key);
    if (list?.length) {
      ordered.push({
        key,
        label: CURRICULUM_GROUP_RU[key] ?? key,
        rows: list,
      });
      buckets.delete(key);
    }
  }
  for (const [key, list] of buckets) {
    if (list.length) {
      ordered.push({
        key,
        label: CURRICULUM_GROUP_RU[key] ?? key,
        rows: list,
      });
    }
  }
  return ordered;
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

/** Wider by default; grows with digit count so values like 100 aren't clipped. */
function autoNumberInputStyle(value: number, minDigits = 3): CSSProperties {
  const digits = Math.max(minDigits, String(Math.abs(value)).length);
  return {
    width: `max(5rem, calc(${digits}ch + 2.5rem))`,
    minWidth: "5rem",
    boxSizing: "border-box",
  };
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
  const confirm = useAppConfirm();
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
  const [playingPhraseId, setPlayingPhraseId] = useState<string | null>(null);
  const [trainedOpen, setTrainedOpen] = useState(false);
  const [genCount, setGenCount] = useState(8);
  const [genMinWords, setGenMinWords] = useState(4);
  const [genMaxWords, setGenMaxWords] = useState(48);
  const [trainProgress, setTrainProgress] = useState<{
    step: string;
    pct: number;
    label: string;
    epoch?: number;
    epochs?: number;
    loss?: number;
    melL1?: number;
  } | null>(null);
  const [lastCurriculum, setLastCurriculum] = useState<
    Array<{
      concept: string;
      neural: string;
      mira: string;
      status: string;
      title?: string;
      meaning?: string;
      miraPlain?: string;
      group?: string;
    }>
  >([]);
  const [lastTrainMetrics, setLastTrainMetrics] = useState<{
    epochs?: number;
    trainSteps?: number;
    initialLoss?: number;
    finalLoss?: number;
    melTargets?: number;
  } | null>(null);

  const TRAIN_STEP_RU: Record<string, string> = {
    validate: "проверка записей",
    features: "разбор звука",
    segment: "границы слов",
    lexicon: "словарь",
    epochs: "проходы подгонки",
    pack: "голос-пак",
    publish: "каталог",
    done: "готово",
    error: "ошибка",
  };
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
      const trained =
        Boolean(snap.project.custom_voice_id) ||
        snap.project.status === "ready" ||
        snap.project.status === "ready_partial";
      const next = snap.phrases.find((p) => {
        if (!trained) return !p.recorded;
        const linked = snap.clips.filter((c) => c.phrase_id === p.id);
        const accepted = linked.some((c) => c.accepted);
        return !accepted && !p.recorded;
      });
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
    const ok = await confirm({
      title: "Удалить проект",
      body: `Удалить проект «${project.name}» и связанное аудио?`,
      confirmLabel: "Удалить",
      tone: "danger",
    });
    if (!ok) return;
    setBusy("delete");
    try {
      const res = electron
        ? await window.mira!.deleteVoiceProject(project.id)
        : localDeleteProject(project.id);
      if (res.clearedVoiceId) clearActiveVoiceId(res.clearedVoiceId);
      setNote(res.detail);
      setPhraseId("");
      stopPhraseAudio();
      setTrainedOpen(false);
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
          : `Не удалось собрать тексты на ${minW}–${maxW} слов — уменьшите диапазон или добавьте свою`,
      );
      await refresh(project.id);
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
      label: "Старт сборки голоса из записей…",
    });
    const unsub = electron
      ? window.mira?.onVoiceTrainProgress?.((ev) => {
          if (ev.projectId !== project.id) return;
          setTrainProgress({
            step: ev.step,
            pct: ev.pct,
            label: ev.label,
            epoch: ev.epoch,
            epochs: ev.epochs,
            loss: ev.loss,
            melL1: ev.melL1,
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
              epoch: "epoch" in ev ? (ev as { epoch?: number }).epoch : undefined,
              epochs:
                "epochs" in ev ? (ev as { epochs?: number }).epochs : undefined,
              loss: "loss" in ev ? (ev as { loss?: number }).loss : undefined,
              melL1:
                "melL1" in ev ? (ev as { melL1?: number }).melL1 : undefined,
            });
          });
      const words =
        res.report.lexiconSize != null
          ? ` · лексикон ${res.report.lexiconSize}` +
            (res.report.audioLexiconSize != null
              ? ` (аудио ${res.report.audioLexiconSize}` +
                (res.report.provisionalLexiconSize
                  ? `, TTS ${res.report.provisionalLexiconSize}`
                  : "") +
                ")"
              : "")
          : res.report.wordUnitCount != null
            ? ` · слов ${res.report.wordUnitCount}`
            : "";
      const lossBit =
        res.report.finalLoss != null
          ? ` · loss ${res.report.finalLoss.toFixed(4)}` +
            (res.report.epochs != null ? ` / ${res.report.epochs} эпох` : "")
          : "";
      if (res.report.curriculum?.length) {
        setLastCurriculum(res.report.curriculum);
      }
      setLastTrainMetrics({
        epochs: res.report.epochs,
        trainSteps: res.report.trainSteps,
        initialLoss: res.report.initialLoss,
        finalLoss: res.report.finalLoss,
        melTargets: res.report.melTargets,
      });
      setNote(
        `${res.report.ok ? "OK" : "FAIL"} · ${res.report.detail} · аудио ${res.report.acceptedClips}, покрытие ${res.report.coveragePct}%${words}${lossBit}`,
      );
      if (res.voice) {
        setActiveVoiceId(res.voice.id);
        props.onCatalogChanged?.();
      }
      // Keep the main phrase list visible — do not send corpus into a modal.
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

  async function removePendingPhrase(target: MiraVoicePhrase) {
    if (!project) return;
    if (isPhraseLearned(target)) {
      setNote("Обученные фразы удалять нельзя");
      return;
    }
    const preview = phraseTextPreview(target.text, 48);
    const ok = await confirm({
      title: "Удалить текст",
      body: `Удалить необученный текст «${preview}»?`,
      confirmLabel: "Удалить",
      tone: "danger",
    });
    if (!ok) return;
    setBusy("delete-phrase");
    try {
      const res = electron
        ? await window.mira!.deleteVoicePhrase(target.id)
        : localDeletePhrase(target.id);
      if (!res.ok) {
        setNote(res.detail);
        return;
      }
      if (phraseId === target.id) setPhraseId("");
      setNote(res.detail);
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

  /**
   * Learned-phrase «Перезагрузить»: delete clip audio, keep text in
   * `voice_phrases` (pending / Необученные queue), leave «Обученные».
   */
  async function resetLearnedPhrase(target: MiraVoicePhrase) {
    if (!project) return;
    const preview = phraseTextPreview(target.text, 48);
    const ok = await confirm({
      title: "Сбросить аудио",
      body: `Сбросить аудио для «${preview}»?\nТекст вернётся в необученные для новой загрузки; из «Обученные» фраза пропадёт.`,
      confirmLabel: "OK",
      tone: "danger",
    });
    if (!ok) return;
    stopPhraseAudio();
    setBusy("reset-phrase");
    try {
      const res = electron
        ? await window.mira!.resetVoicePhraseAudio(target.id)
        : localResetVoicePhraseAudio(target.id);
      if (!res.ok) {
        setNote(res.detail);
        return;
      }
      setPhraseId(target.id);
      setNote(res.detail);
      await refresh(project.id);
      props.onCatalogChanged?.();
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function closeTrainedPanel() {
    stopPhraseAudio();
    setTrainedOpen(false);
  }

  /** Phrase already in the trained model corpus (accepted linked audio). */
  function isPhraseLearned(p: MiraVoicePhrase): boolean {
    const clip = bestClipForPhrase(p.id);
    return Boolean(clip?.accepted) || Boolean(p.recorded);
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
  const corpusReadyLabel =
    recordedCount === phrases.length
      ? "готово"
      : `${recordedCount}/${phrases.length} с аудио`;
  // After a model exists: learned phrases leave the working list; only
  // untrained/pending stay here for further recording and generate.
  const learnedPhrases = isTrained
    ? phrases.filter((p) => isPhraseLearned(p))
    : [];
  const pendingPhrases = isTrained
    ? phrases.filter((p) => !isPhraseLearned(p))
    : phrases;

  // Drop selection if the chosen phrase left the pending dropdown after train.
  useEffect(() => {
    if (!phraseId) return;
    if (pendingPhrases.some((p) => p.id === phraseId)) return;
    setPhraseId(pendingPhrases[0]?.id ?? "");
    // pendingPhrases is derived from phrases/clips/isTrained
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phraseId, isTrained, phrases, clips]);

  return (
    <div className="panel stack">
      <div className="row">
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Студия голоса</h2>
        <span className="muted mono">P9 #15 · unit-selection</span>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Сейчас Mira собирает речь из записанных кусочков вашего голоса: режет
        фразы на слова, находит их в аудио и склеивает. Несколько проходов
        слегка подгоняют выбор кусков. Это не «нейросеть на видеокарте» —
        слова без записи пока говорит системный голос.
      </p>
      <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
        После обновления 0.1.7 нарезка/склейка пересобраны заново: заново
        импортируйте клипы (m4a/webm → PCM) и нажмите «Пересобрать голос» /
        полную пересборку. Старый model pack из 0.1.4 сам не исправится.
      </p>
      <details className="muted" style={{ margin: 0 }}>
        <summary style={{ cursor: "pointer" }}>
          Что уже умеет студия (простыми словами)
        </summary>
        <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.2rem" }}>
          <li>
            <strong>Работает:</strong> проверка записей, частотная карта звука,
            оценка похожести склейки, несколько проходов по корпусу, сборка
            речи из словаря (+ системный TTS для дыр).
          </li>
          <li>
            <strong>Упрощённо:</strong> разбор текста, поиск границ слов,
            склейка кусков, чистый хвост клипа, сверка с записью, лёгкая
            подстройка без нейросети, черновой preview.
          </li>
          <li>
            <strong>Позже:</strong> полная нейросеть на GPU и нейро-синтез
            голоса — в десктопе пока нет.
          </li>
        </ul>
      </details>
      <ol className="muted" style={{ margin: 0, paddingLeft: "1.2rem" }}>
        <li>Создайте проект голоса (имя + язык).</li>
        <li>
          Сгенерируйте или добавьте фразы — приоритет у частых ответов Mira;
          нумерация 1…N. Длинные разнообразные тексты расширяют лексикон.
        </li>
        <li>
          Запишите чистую речь (PCM wav) и привяжите к номеру фразы. Шум,
          тишина, клиппинг и mismatch отсекаются QA.
        </li>
        <li>
          ≥3 принятых пар — «Собрать голос»: проверка записей → разбор звука →
          границы слов → словарь → несколько проходов подгонки → голос в
          каталог.
        </li>
        <li>
          В каталоге: склейка из аудио-единиц; слова без записи — системный
          TTS. Донабирайте и пересобирайте.
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
        // div, not label: ThemeSelect buttons break when wrapped in <label>
        // (browser re-clicks the trigger → menu re-opens after select / won't close).
        <div className="stack" style={{ gap: "0.25rem" }}>
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
              setTrainedOpen(false);
              void refresh(id);
            }}
          />
        </div>
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
                    ? "Проверка → разбор звука → границы слов → словарь → проходы подгонки → каталог"
                    : "Нужно ≥1 фраза и ≥3 принятых записей, привязанных к фразам"
                }
              >
                {busy === "train"
                  ? trainProgress
                    ? trainProgress.step === "epochs" &&
                      trainProgress.loss != null
                      ? `Эпоха ${trainProgress.epoch ?? "…"} · loss ${trainProgress.loss.toFixed(4)}`
                      : `Сборка ${trainProgress.pct}%`
                    : "Сборка…"
                  : project.custom_voice_id
                    ? "Пересобрать голос"
                    : "Собрать голос"}
              </button>
              {busy === "train" && trainProgress ? (
                <div
                  className="muted"
                  style={{ flex: "1 1 100%", fontSize: "0.9rem" }}
                  aria-live="polite"
                >
                  <strong>{trainProgress.pct}%</strong>
                  {` · ${TRAIN_STEP_RU[trainProgress.step] ?? trainProgress.step} · ${trainProgress.label}`}
                  {trainProgress.loss != null ? (
                    <div className="mono" style={{ marginTop: "0.2rem" }}>
                      loss={trainProgress.loss.toFixed(4)}
                      {trainProgress.melL1 != null
                        ? ` · mel L1=${trainProgress.melL1.toFixed(4)}`
                        : ""}
                      {trainProgress.epoch != null &&
                      trainProgress.epochs != null
                        ? ` · эпоха ${trainProgress.epoch}/${trainProgress.epochs}`
                        : ""}
                    </div>
                  ) : null}
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
              {lastTrainMetrics?.finalLoss != null ? (
                <div
                  className="muted mono"
                  style={{ flex: "1 1 100%", fontSize: "0.85rem" }}
                >
                  Последнее обучение: эпох {lastTrainMetrics.epochs ?? "—"} ·
                  шагов {lastTrainMetrics.trainSteps ?? "—"} · loss{" "}
                  {lastTrainMetrics.initialLoss?.toFixed(4) ?? "—"} →{" "}
                  {lastTrainMetrics.finalLoss.toFixed(4)}
                  {lastTrainMetrics.melTargets != null
                    ? ` · mel-целей ${lastTrainMetrics.melTargets}`
                    : ""}
                </div>
              ) : null}
              {lastCurriculum.length > 0 ? (
                <details
                  className="muted"
                  style={{ flex: "1 1 100%", margin: 0 }}
                  open
                >
                  <summary style={{ cursor: "pointer" }}>
                    Как устроен голос Mira ({lastCurriculum.length} шагов)
                  </summary>
                  <p style={{ margin: "0.45rem 0 0.35rem", fontSize: "0.9rem" }}>
                    Сейчас Mira собирает речь из записанных кусочков: режет
                    текст на слова, находит их в аудио и склеивает. Ниже —
                    что уже работает, что сделано упрощённо, что отложено.
                  </p>
                  <div
                    className="stack"
                    style={{ gap: "0.75rem", marginTop: "0.25rem" }}
                  >
                    {groupCurriculumRows(lastCurriculum).map((section) => (
                      <div key={section.key} className="stack" style={{ gap: "0.35rem" }}>
                        <strong style={{ fontSize: "0.9rem" }}>
                          {section.label}
                        </strong>
                        <ul
                          style={{
                            margin: 0,
                            paddingLeft: 0,
                            listStyle: "none",
                            display: "grid",
                            gap: "0.45rem",
                          }}
                        >
                          {section.rows.map((row) => (
                            <li
                              key={row.concept}
                              style={{
                                borderTop:
                                  "1px solid color-mix(in oklab, var(--fg) 10%, transparent)",
                                paddingTop: "0.4rem",
                              }}
                            >
                              <div
                                className="row"
                                style={{
                                  flexWrap: "wrap",
                                  gap: "0.35rem 0.65rem",
                                  alignItems: "baseline",
                                }}
                              >
                                <strong style={{ fontSize: "0.9rem" }}>
                                  {curriculumTitle(row)}
                                </strong>
                                <span
                                  className="mono"
                                  style={{ fontSize: "0.75rem", opacity: 0.9 }}
                                >
                                  {curriculumStatusRu(row.status)}
                                </span>
                              </div>
                              {row.meaning ? (
                                <div style={{ fontSize: "0.82rem", marginTop: "0.15rem" }}>
                                  {row.meaning}
                                </div>
                              ) : null}
                              <div style={{ fontSize: "0.82rem", marginTop: "0.15rem" }}>
                                {row.miraPlain?.trim() || row.mira}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <details style={{ marginTop: "0.65rem" }}>
                    <summary style={{ cursor: "pointer", fontSize: "0.85rem" }}>
                      Для разработчиков (жаргон neural TTS)
                    </summary>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "0.78rem",
                        marginTop: "0.35rem",
                      }}
                    >
                      <thead>
                        <tr>
                          <th align="left">Концепт</th>
                          <th align="left">В Mira</th>
                          <th align="left">Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lastCurriculum.map((row) => (
                          <tr key={`tech-${row.concept}`}>
                            <td>{row.concept}</td>
                            <td>{row.mira}</td>
                            <td>
                              {row.status === "mapped"
                                ? "есть"
                                : row.status === "proxy"
                                  ? "прокси"
                                  : "отложено"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </details>
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
            className="panel stack"
            style={{ gap: "0.55rem" }}
            data-testid="voice-generate-range"
          >
            <strong>Генерация текстов для обучения</strong>
            <p className="muted" style={{ margin: 0 }}>
              Задайте сколько текстов добавить и диапазон слов (от–до) — так можно
              набирать длинный корпус. Непокрытые слова пока говорит системный
              TTS.
            </p>
            <div
              className="row"
              style={{
                flexWrap: "wrap",
                gap: "0.5rem",
                alignItems: "center",
              }}
            >
              <label
                className="field-label"
                style={{
                  display: "inline-flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: "0.35rem",
                  margin: 0,
                }}
                title="Сколько текстов добавить за один запуск"
              >
                шт.
                <input
                  type="number"
                  className="voice-gen-number"
                  min={1}
                  max={40}
                  value={genCount}
                  disabled={Boolean(busy)}
                  onChange={(e) =>
                    setGenCount(
                      Math.max(1, Math.min(40, Number(e.target.value) || 1)),
                    )
                  }
                  style={autoNumberInputStyle(genCount, 2)}
                  aria-label="Количество текстов"
                />
              </label>
              <label
                className="field-label"
                style={{
                  display: "inline-flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: "0.35rem",
                  margin: 0,
                }}
                title="Минимум слов в каждом тексте"
              >
                слов от
                <input
                  type="number"
                  className="voice-gen-number"
                  min={1}
                  max={400}
                  value={genMinWords}
                  disabled={Boolean(busy)}
                  onChange={(e) =>
                    setGenMinWords(
                      Math.max(1, Math.min(400, Number(e.target.value) || 1)),
                    )
                  }
                  style={autoNumberInputStyle(genMinWords, 3)}
                  aria-label="Минимум слов"
                />
              </label>
              <label
                className="field-label"
                style={{
                  display: "inline-flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: "0.35rem",
                  margin: 0,
                }}
                title="Максимум слов в каждом тексте"
              >
                до
                <input
                  type="number"
                  className="voice-gen-number"
                  min={1}
                  max={500}
                  value={genMaxWords}
                  disabled={Boolean(busy)}
                  onChange={(e) =>
                    setGenMaxWords(
                      Math.max(1, Math.min(500, Number(e.target.value) || 1)),
                    )
                  }
                  style={autoNumberInputStyle(genMaxWords, 3)}
                  aria-label="Максимум слов"
                />
              </label>
              <button
                type="button"
                className="btn btn-primary"
                disabled={Boolean(busy)}
                onClick={() => void morePhrases()}
                title="Новые тексты расширяют словарь: меньше повторов частых слов, больше новых фраз, интонаций и предлогов"
              >
                {busy === "phrases" ? "Генерация…" : "Сгенерировать фразы"}
              </button>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              Генерация смотрит на уже записанный корпус и избегает сотен
              повторов одних и тех же слов — добавляет новые слова, фразы,
              интонации и недостающие предлоги/частицы.
            </p>
            <div
              className="row"
              style={{ flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}
            >
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

            <div className="stack" style={{ gap: "0.25rem" }}>
              <span className="muted">Фраза для привязки аудио</span>
              <ThemeSelect
                aria-label="Фраза для привязки аудио"
                value={phraseId}
                options={[
                  { value: "", label: "— без привязки —" },
                  // After train: only untrained phrases — learned ones live in «Обученные».
                  ...pendingPhrases.map((p) => ({
                    value: p.id,
                    label: phraseSelectLabel(phrases, p),
                  })),
                ]}
                onChange={setPhraseId}
              />
            </div>

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

          <div
            className="panel stack"
            style={{ gap: "0.5rem" }}
            data-testid="voice-phrases-list"
          >
            <div
              className="row"
              style={{
                flexWrap: "wrap",
                gap: "0.5rem",
                alignItems: "center",
              }}
            >
              <strong style={{ margin: 0 }}>
                {isTrained
                  ? `Необученные фразы (${pendingPhrases.length})`
                  : `Фразы (${phrases.length})`}
                {phrases.length > 0 ? ` · ${corpusReadyLabel}` : ""}
              </strong>
              {isTrained && learnedPhrases.length > 0 ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setTrainedOpen(true)}
                  title="Обученные фразы уходят сюда после обучения модели"
                >
                  Обученные ({learnedPhrases.length})
                </button>
              ) : null}
            </div>
            <p className="muted" style={{ margin: 0 }}>
              {isTrained
                ? "Обученные фразы скрыты из рабочего списка — откройте «Обученные». Здесь только то, что ещё нужно записать."
                : "После обучения фразы с принятым аудио уйдут в «Обученные»; необученные останутся здесь."}
            </p>
            {pendingPhrases.length === 0 ? (
              <span className="muted">
                {isTrained
                  ? "Все текущие фразы уже в модели. Сгенерируйте новые или добавьте свою."
                  : "Нажмите «Сгенерировать фразы» или добавьте свою выше"}
              </span>
            ) : (
              <div
                className="voice-phrases-inline-list"
                style={{
                  display: "grid",
                  gap: "8px",
                  maxHeight: "min(42vh, 420px)",
                  overflow: "auto",
                }}
              >
                {pendingPhrases.map((p) => {
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
                      <div
                        className="row"
                        style={{ flexWrap: "wrap", gap: "0.35rem" }}
                      >
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
                          {activeReload ? "Выбрана" : "Записать / перезагрузить"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          disabled={Boolean(busy)}
                          onClick={() => void removePendingPhrase(p)}
                          title="Удалить необученный текст"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
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
      ) : null}

      {note ? <p className="muted" style={{ margin: 0 }}>{note}</p> : null}
      {busy ? <p className="muted mono">busy: {busy}</p> : null}

      {trainedOpen && project
        ? createPortal(
            <div
              className="modal-backdrop"
              role="presentation"
              onClick={() => closeTrainedPanel()}
            >
              <div
                className="modal modal-wide modal-resizable voice-phrases-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="voice-trained-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="row"
                  style={{ alignItems: "flex-start", gap: "0.5rem" }}
                >
                  <div style={{ flex: 1 }}>
                    <h2 id="voice-trained-title" style={{ margin: 0 }}>
                      Обученные фразы · {project.name}
                    </h2>
                    <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                      {learnedPhrases.length} в модели · номера из корпуса 1…
                      {phrases.length || "N"} · {corpusReadyLabel}
                    </p>
                    <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                      «Перезагрузить» удаляет аудио, возвращает текст в
                      необученные для новой загрузки и убирает фразу отсюда.
                      После новой записи нажмите «Полная пересборка».
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn catalog-edit-close"
                    aria-label="Закрыть"
                    onClick={() => closeTrainedPanel()}
                  >
                    <svg
                      viewBox="0 0 16 16"
                      width="12"
                      height="12"
                      aria-hidden
                    >
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
                  {learnedPhrases.length === 0 ? (
                    <span className="muted">Пока нет обученных фраз</span>
                  ) : (
                    learnedPhrases.map((p) => {
                      const clip = bestClipForPhrase(p.id);
                      const n = phraseDisplayNo(phrases, p.id);
                      return (
                        <div key={p.id} className="voice-phrase-row">
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
                          <div
                            className="row"
                            style={{ flexWrap: "wrap", gap: "0.35rem" }}
                          >
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
                              className="btn"
                              disabled={Boolean(busy)}
                              title="Удалить аудио и вернуть текст в необученные"
                              onClick={() => void resetLearnedPhrase(p)}
                            >
                              Перезагрузить
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => closeTrainedPanel()}
                  >
                    Закрыть
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={Boolean(busy) || !canTrain}
                    onClick={() => void trainModel()}
                  >
                    {busy === "train" ? "Сборка…" : "Полная пересборка"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
