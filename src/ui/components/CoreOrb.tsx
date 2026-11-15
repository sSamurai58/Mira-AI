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
  size = 440,
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

    let cancelled = false;
    let mo: MutationObserver | null = null;
    let ro: ResizeObserver | null = null;
    let handle: CoreHandle | null = null;
    let syncPalette: (() => void) | null = null;

    const onVisible = () => {
      if (document.visibilityState === "visible") handle?.resize();
    };

    // Defer WebGL until after first paint — Home chrome loads without waiting on shaders/FBOs.
    const boot = window.setTimeout(() => {
      if (cancelled) return;
      const palette = paletteFromElement(wrap);
      handle = createCoreWebgl(canvas, {
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
      handle.setActive(active);

      syncPalette = () => {
        handleRef.current?.setPalette(paletteFromElement(wrap));
      };
      mo = new MutationObserver(syncPalette);
      mo.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", "class", "style"],
      });
      window.addEventListener(MIRA_THEME_EVENT, syncPalette);

      ro = new ResizeObserver(() => handle?.resize());
      ro.observe(wrap);
      document.addEventListener("visibilitychange", onVisible);
      requestAnimationFrame(() => handle?.resize());
    }, 50);

    return () => {
      cancelled = true;
      window.clearTimeout(boot);
      mo?.disconnect();
      if (syncPalette) {
        window.removeEventListener(MIRA_THEME_EVENT, syncPalette);
      }
      document.removeEventListener("visibilitychange", onVisible);
      ro?.disconnect();
      handle?.destroy();
      if (handleRef.current === handle) handleRef.current = null;
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
