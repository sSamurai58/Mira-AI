import { useEffect, useState } from "react";
import {
  APPLE_APPEARANCE_EVENT,
  APPLE_GLASS_LABEL,
  appleThemeIdForMode,
  isAppleThemeId,
  loadAppleAppearance,
  saveAppleAppearance,
  type AppleAppearancePrefs,
  type AppleGlassLevel,
} from "../appleGlass";
import { appleThemes, type ThemeId } from "../themes";
import { StubBadge } from "./StubBadge";
import { ThemeSelect } from "./ThemeSelect";
import { ToggleRow } from "./SettingsFormBits";

type SettingsAppleSectionProps = {
  themeId: ThemeId;
  onThemeChange: (id: ThemeId) => void;
};

const GLASS_OPTIONS: AppleGlassLevel[] = ["solid", "regular", "clear"];

export function SettingsAppleSection({
  themeId,
  onThemeChange,
}: SettingsAppleSectionProps) {
  const [prefs, setPrefs] = useState<AppleAppearancePrefs>(() =>
    loadAppleAppearance(),
  );
  const appleActive = isAppleThemeId(themeId);
  const activeMode: "light" | "dark" = appleActive
    ? themeId === "apple-light"
      ? "light"
      : "dark"
    : prefs.mode;

  useEffect(() => {
    function onPrefs(ev: Event) {
      const detail = (ev as CustomEvent<AppleAppearancePrefs>).detail;
      if (detail) setPrefs(detail);
      else setPrefs(loadAppleAppearance());
    }
    window.addEventListener(APPLE_APPEARANCE_EVENT, onPrefs);
    return () => window.removeEventListener(APPLE_APPEARANCE_EVENT, onPrefs);
  }, []);

  function selectMode(mode: "light" | "dark") {
    const next = saveAppleAppearance({ mode });
    setPrefs(next);
    onThemeChange(appleThemeIdForMode(mode));
  }

  function setGlass(glass: AppleGlassLevel) {
    const next = saveAppleAppearance({ glass });
    setPrefs(next);
    if (!appleActive) {
      onThemeChange(appleThemeIdForMode(next.mode));
    }
  }

  function setBold(boldText: boolean) {
    const next = saveAppleAppearance({ boldText });
    setPrefs(next);
    if (!appleActive) {
      onThemeChange(appleThemeIdForMode(next.mode));
    }
  }

  return (
    <div className="apple-settings appearance-stack">
      <header className="appearance-block-head">
        <div className="row">
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Оформление</h2>
          <StubBadge label="APPLE" />
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Светлая и тёмная темы в стиле iOS · Liquid Glass · системный шрифт.
          Референс: apple-design skill.
        </p>
      </header>

      <section className="apple-grouped" aria-label="Тема оформления">
        <div className="apple-appearance-pick">
          {appleThemes().map((theme) => {
            const mode = theme.id === "apple-light" ? "light" : "dark";
            const selected = activeMode === mode && appleActive;
            return (
              <button
                key={theme.id}
                type="button"
                className={`apple-mode-card ${selected ? "active" : ""}`}
                onClick={() => selectMode(mode)}
                aria-pressed={selected}
              >
                <span
                  className={`apple-mode-preview apple-mode-preview--${mode}`}
                  aria-hidden
                >
                  <span className="apple-mode-preview-bar" />
                  <span className="apple-mode-preview-row" />
                  <span className="apple-mode-preview-row short" />
                </span>
                <span className="apple-mode-meta">
                  <strong>
                    {mode === "light" ? "Светлое" : "Тёмное"}
                  </strong>
                  <span
                    className={`apple-radio ${selected ? "on" : ""}`}
                    aria-hidden
                  />
                </span>
              </button>
            );
          })}
        </div>
        <p className="apple-footer-hint">
          Выберите светлое или тёмное оформление Apple. Цвета и материалы
          соответствуют системным настройкам iOS.
        </p>
      </section>

      <section className="apple-grouped" aria-label="Liquid Glass">
        <div className="apple-list-card">
          <div className="apple-list-row apple-list-row--select">
            <span className="apple-list-label">Liquid Glass</span>
            <ThemeSelect
              aria-label="Уровень Liquid Glass"
              value={prefs.glass}
              options={GLASS_OPTIONS.map((g) => ({
                value: g,
                label: APPLE_GLASS_LABEL[g],
              }))}
              onChange={(v) => {
                if (v === "solid" || v === "regular" || v === "clear") {
                  setGlass(v);
                }
              }}
            />
          </div>
        </div>
        <p className="apple-footer-hint">
          Эффект Liquid Glass динамически адаптируется к контенту, расположенному
          под ним. При «Сокращении прозрачности» в системе стекло становится
          плотнее.
        </p>
      </section>

      <section className="apple-grouped" aria-label="Текст">
        <div className="apple-list-card">
          <ToggleRow
            label="Жирный шрифт"
            hint="Чуть тяжелее начертание подписей и рядов"
            checked={prefs.boldText}
            onChange={setBold}
          />
        </div>
      </section>

      {!appleActive ? (
        <p className="muted" style={{ margin: 0 }}>
          Сейчас активна тема Mira. Выбор выше сразу переключит на Apple.
        </p>
      ) : null}
    </div>
  );
}
