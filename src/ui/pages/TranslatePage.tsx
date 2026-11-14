import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { AutoGrowTextarea } from "../components/AutoGrowTextarea";
import { ThemeSelect } from "../components/ThemeSelect";
import { createAsrSession, isAsrAvailable } from "../voice/asr";
import { peekActiveVoiceId } from "../voice/catalog";
import { speakText, stopSpeaking } from "../voice/tts";
import { aiTranslate } from "../translate/aiTranslate";
import {
  DETECT_CODE,
  MAX_TRANSLATE_CHARS,
  QUICK_CHIP_CODES,
  TRANSLATE_LANGS,
  chipLabel,
  langLabel,
} from "../translate/languages";
import { quickTranslate } from "../translate/quickTranslate";

type Mode = "quick" | "ai";

const DEBOUNCE_MS = 480;

const SOURCE_LANG_OPTIONS = [
  { value: DETECT_CODE, label: "Определить язык" },
  ...TRANSLATE_LANGS.map((l) => ({ value: l.code, label: l.label })),
];

const TARGET_LANG_OPTIONS = TRANSLATE_LANGS.map((l) => ({
  value: l.code,
  label: l.label,
}));

export function TranslatePage() {
  const [mode, setMode] = useState<Mode>("quick");
  const [sourceLang, setSourceLang] = useState(DETECT_CODE);
  const [targetLang, setTargetLang] = useState("ru");
  const [sourceText, setSourceText] = useState("");
  const [resultText, setResultText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);
  const requestGen = useRef(0);
  const asrRef = useRef<ReturnType<typeof createAsrSession> | null>(null);
  const sourceLangRef = useRef(sourceLang);
  const targetLangRef = useRef(targetLang);
  const modeRef = useRef(mode);

  sourceLangRef.current = sourceLang;
  targetLangRef.current = targetLang;
  modeRef.current = mode;

  const stopMic = useCallback(() => {
    asrRef.current?.stop();
    asrRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    stopMic();
    stopSpeaking();
  }, [stopMic]);

  const runTranslate = useCallback(
    async (text: string, opts?: { force?: boolean }) => {
      const trimmed = text.slice(0, MAX_TRANSLATE_CHARS).trim();
      if (!trimmed) {
        setResultText("");
        setMeta(null);
        setError(null);
        setBusy(false);
        return;
      }

      const currentMode = modeRef.current;
      if (currentMode === "ai" && !opts?.force) {
        return;
      }

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const gen = ++requestGen.current;

      setBusy(true);
      setError(null);

      try {
        if (currentMode === "quick") {
          const r = await quickTranslate({
            text: trimmed,
            source: sourceLangRef.current,
            target: targetLangRef.current,
            signal: ac.signal,
          });
          if (gen !== requestGen.current) return;
          setResultText(r.text);
          const detected =
            r.detectedSource && sourceLangRef.current === DETECT_CODE
              ? ` · ${langLabel(r.detectedSource)}`
              : "";
          setMeta(`${r.provider}${detected}`);
        } else {
          setResultText("");
          const r = await aiTranslate({
            text: trimmed,
            source: sourceLangRef.current,
            target: targetLangRef.current,
            signal: ac.signal,
            onToken: (chunk) => {
              if (gen !== requestGen.current) return;
              setResultText((prev) => prev + chunk);
            },
          });
          if (gen !== requestGen.current) return;
          setResultText(r.text);
          setMeta(r.provider);
        }
      } catch (err) {
        if (ac.signal.aborted || gen !== requestGen.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (gen === requestGen.current) setBusy(false);
      }
    },
    [],
  );

  const scheduleQuick = useCallback(
    (text: string) => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      if (modeRef.current !== "quick") return;
      debounceRef.current = window.setTimeout(() => {
        void runTranslate(text);
      }, DEBOUNCE_MS);
    },
    [runTranslate],
  );

  function onSourceChange(value: string) {
    const next = value.slice(0, MAX_TRANSLATE_CHARS);
    setSourceText(next);
    if (mode === "quick") scheduleQuick(next);
  }

  function swapLanguages() {
    if (sourceLang === DETECT_CODE) {
      setSourceLang(targetLang);
      setTargetLang("en");
    } else {
      setSourceLang(targetLang);
      setTargetLang(sourceLang);
    }
    setSourceText(resultText);
    setResultText(sourceText);
    if (mode === "quick" && resultText.trim()) {
      scheduleQuick(resultText);
    }
  }

  async function onPaste() {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip) return;
      onSourceChange(clip);
    } catch {
      setError("Не удалось вставить из буфера (нужно разрешение).");
    }
  }

  function onClear() {
    abortRef.current?.abort();
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    setSourceText("");
    setResultText("");
    setMeta(null);
    setError(null);
    setBusy(false);
    stopMic();
  }

  async function onCopy() {
    if (!resultText) return;
    try {
      await navigator.clipboard.writeText(resultText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setError("Не удалось скопировать.");
    }
  }

  function onSpeak() {
    if (!resultText.trim()) return;
    stopSpeaking();
    speakText(resultText, peekActiveVoiceId(), {
      onError: (msg) => setError(msg),
    });
  }

  function toggleMic() {
    if (listening) {
      stopMic();
      return;
    }
    if (!isAsrAvailable()) {
      setError(
        "Распознавание речи недоступно в этом окружении. Введите текст вручную.",
      );
      return;
    }
    stopMic();
    setListening(true);
    asrRef.current = createAsrSession({
      onInterim: (t) => {
        setSourceText((prev) => {
          const base = prev.replace(/\s*…$/, "").trimEnd();
          const next = `${base ? `${base} ` : ""}${t}…`.slice(
            0,
            MAX_TRANSLATE_CHARS,
          );
          return next;
        });
      },
      onFinal: (t) => {
        setSourceText((prev) => {
          const cleaned = prev.replace(/\s*…$/, "").trimEnd();
          const next = `${cleaned ? `${cleaned} ` : ""}${t}`.slice(
            0,
            MAX_TRANSLATE_CHARS,
          );
          if (modeRef.current === "quick") scheduleQuick(next);
          return next;
        });
      },
      onError: (msg) => {
        setError(msg);
        setListening(false);
      },
      onEnd: () => setListening(false),
    });
    asrRef.current.start();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void runTranslate(sourceText, { force: true });
  }

  function setModeAndMaybeTranslate(next: Mode) {
    setMode(next);
    if (next === "quick" && sourceText.trim()) {
      scheduleQuick(sourceText);
    }
  }

  const targetLabel = langLabel(targetLang);
  const charCount = sourceText.length;

  return (
    <div className="translate-page">
      <header className="translate-header">
        <div className="translate-title-row">
          <h1 className="translate-title">Переводчик</h1>
          <p className="translate-tagline">мгновенный перевод</p>
        </div>

        <div className="translate-controls">
          <div className="translate-lang-row">
            {/* div, not label: ThemeSelect buttons break when wrapped in <label> */}
            <div className="translate-lang-select">
              <ThemeSelect
                aria-label="Исходный язык"
                className="translate-lang-theme-select"
                value={sourceLang}
                options={SOURCE_LANG_OPTIONS}
                onChange={setSourceLang}
              />
            </div>

            <button
              type="button"
              className="translate-swap"
              aria-label="Поменять языки"
              title="Поменять языки"
              onClick={swapLanguages}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 8h11M15 5l3 3-3 3M17 16H6M9 13l-3 3 3 3"
                />
              </svg>
            </button>

            <div className="translate-lang-select">
              <ThemeSelect
                aria-label="Язык перевода"
                className="translate-lang-theme-select"
                value={targetLang}
                options={TARGET_LANG_OPTIONS}
                onChange={(code) => {
                  setTargetLang(code);
                  if (mode === "quick" && sourceText.trim()) {
                    scheduleQuick(sourceText);
                  }
                }}
              />
            </div>
          </div>

          <div
            className="translate-mode"
            role="tablist"
            aria-label="Режим перевода"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "quick"}
              className={mode === "quick" ? "is-active" : ""}
              onClick={() => setModeAndMaybeTranslate("quick")}
            >
              Быстрый
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "ai"}
              className={mode === "ai" ? "is-active" : ""}
              onClick={() => setModeAndMaybeTranslate("ai")}
            >
              Через ИИ
            </button>
          </div>
        </div>

        <div className="translate-chips" aria-label="Быстрый выбор языка">
          {QUICK_CHIP_CODES.map((code) => (
            <button
              key={code}
              type="button"
              className={`translate-chip ${targetLang === code ? "is-active" : ""}`}
              onClick={() => {
                setTargetLang(code);
                if (mode === "quick" && sourceText.trim()) {
                  scheduleQuick(sourceText);
                }
              }}
            >
              {chipLabel(code)}
            </button>
          ))}
        </div>
      </header>

      <form className="translate-grid" onSubmit={onSubmit}>
        <section className="translate-box is-source" aria-label="Исходный текст">
          <div className="translate-box-head">
            <span>Исходный текст</span>
            <div className="translate-box-actions">
              <button
                type="button"
                className="translate-ico"
                title="Вставить"
                aria-label="Вставить"
                onClick={() => void onPaste()}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 4h6v3H9zM8 7h8v13H8z"
                  />
                </svg>
              </button>
              <button
                type="button"
                className={`translate-ico ${listening ? "is-hot" : ""}`}
                title="Микрофон"
                aria-label="Микрофон"
                aria-pressed={listening}
                onClick={toggleMic}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v4"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="translate-ico"
                title="Очистить"
                aria-label="Очистить"
                onClick={onClear}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    d="M8 8l8 8M16 8l-8 8"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  />
                </svg>
              </button>
            </div>
          </div>
          <AutoGrowTextarea
            className="translate-textarea"
            value={sourceText}
            onChange={(e) => onSourceChange(e.target.value)}
            placeholder="Вставьте текст на любом языке или нажмите на микрофон и говорите..."
            minHeight={220}
            maxHeight={480}
            maxLength={MAX_TRANSLATE_CHARS}
          />
          <div className="translate-box-foot">
            <span className="translate-counter">
              {charCount} / {MAX_TRANSLATE_CHARS}
            </span>
          </div>
        </section>

        <section className="translate-box is-result" aria-label="Перевод">
          <div className="translate-box-head">
            <span>Перевод · {targetLabel}</span>
            <div className="translate-box-actions">
              <button
                type="button"
                className="translate-ico"
                title={copied ? "Скопировано" : "Копировать"}
                aria-label="Копировать"
                onClick={() => void onCopy()}
                disabled={!resultText}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                  <rect
                    x="8"
                    y="8"
                    width="11"
                    height="11"
                    rx="2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  />
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    d="M6 15V6a2 2 0 0 1 2-2h9"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="translate-ico"
                title="Озвучить"
                aria-label="Озвучить"
                onClick={onSpeak}
                disabled={!resultText}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 10v4h3l4 3V7l-4 3H4zM16 9a4 4 0 0 1 0 6M18.5 7a7 7 0 0 1 0 10"
                  />
                </svg>
              </button>
            </div>
          </div>
          <AutoGrowTextarea
            className="translate-textarea"
            value={resultText}
            readOnly
            placeholder="Перевод появится здесь"
            minHeight={220}
            maxHeight={480}
          />
          <div className="translate-box-foot is-result-foot">
            <span className="translate-meta">
              {busy ? "Перевожу…" : meta || "\u00a0"}
            </span>
            <button
              type="submit"
              className="btn btn-primary translate-submit"
              disabled={busy || !sourceText.trim()}
            >
              Перевести
            </button>
          </div>
        </section>
      </form>

      {error ? (
        <p className="translate-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
