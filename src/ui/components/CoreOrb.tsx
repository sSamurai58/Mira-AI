import { useEffect, useRef, useState } from "react";
import {
  createCoreWebgl,
  paletteFromElement,
  type CoreHandle,
  type CoreVoice,
} from "../core/coreWebgl";
import { normalizeCoreLevel } from "../coreLevel";
import { MIRA_THEME_EVENT } from "../themes";
import type { VoiceState } from "../voiceState";
import { CoreOrbSvgFallback } from "./CoreOrbSvgFallback";

type CoreOrbProps = {
  level?: number;
  voiceState?: VoiceState;
  size?: number;
  /** When false, WebGL pauses (off Home). Default true. */
  active?: boolean;
};

function toCoreVoice(state: VoiceState): CoreVoice {
  if (
    state === "listening" ||
    state === "thinking" ||
    state === "speaking"
  ) {
    return state;
  }
  return "idle";
}

/** Living 3D holographic core — WebGL2 line shells + bloom; SVG fallback if GL unavailable. */
export function CoreOrb({
  level = 4,
  voiceState = "idle",
  size = 320,
  active = true,
}: CoreOrbProps) {
  const lv = normalizeCoreLevel(level);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<CoreHandle | null>(null);
  const prevLevelRef = useRef(lv);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const palette = paletteFromElement(wrap);
    const handle = createCoreWebgl(canvas, {
      level: lv,
      voice: toCoreVoice(voiceState),
      palette,
    });
    if (!handle) {
      setUseFallback(true);
      return;
    }
    handleRef.current = handle;
    setUseFallback(false);

    const syncPalette = () => {
      handleRef.current?.setPalette(paletteFromElement(wrap));
    };
    // Theme changes: CSS vars on <html>, plus explicit mira:theme event
    const mo = new MutationObserver(syncPalette);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class", "style"],
    });
    window.addEventListener(MIRA_THEME_EVENT, syncPalette);

    const ro = new ResizeObserver(() => handle.resize());
    ro.observe(wrap);

    // Keep the canvas sized when the Home tab becomes visible again
    // (rAF may throttle while hidden; a zero-size frame looks frozen).
    const onVisible = () => {
      if (document.visibilityState === "visible") handle.resize();
    };
    document.addEventListener("visibilitychange", onVisible);
    // First layout pass after mount (clientWidth can be 0 in the same tick).
    requestAnimationFrame(() => handle.resize());

    return () => {
      mo.disconnect();
      window.removeEventListener(MIRA_THEME_EVENT, syncPalette);
      document.removeEventListener("visibilitychange", onVisible);
      ro.disconnect();
      handle.destroy();
      handleRef.current = null;
    };
  }, []);

  useEffect(() => {
    const prev = prevLevelRef.current;
    handleRef.current?.setLevel(lv);
    // Subtle «Вспышка» when Mira levels up (setLevel also flashes on growth).
    if (lv > prev) handleRef.current?.flash();
    prevLevelRef.current = lv;
  }, [lv]);

  useEffect(() => {
    handleRef.current?.setVoice(toCoreVoice(voiceState));
  }, [voiceState]);

  useEffect(() => {
    handleRef.current?.setActive(active);
  }, [active]);

  return (
    <div
      ref={wrapRef}
      className="core-orb"
      data-voice={voiceState}
      data-level={lv}
      data-engine={useFallback ? "svg" : "webgl"}
      style={{ width: size, maxWidth: "100%" }}
      role="img"
      aria-label={`Ядро Mira, уровень ${lv}, состояние ${voiceState}`}
    >
      {useFallback ? (
        <CoreOrbSvgFallback level={lv} voiceState={voiceState} />
      ) : (
        <canvas ref={canvasRef} className="core-orb-canvas" />
      )}
      <div className="core-orb-glow" aria-hidden />
    </div>
  );
}
