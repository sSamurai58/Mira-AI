import { useEffect, useRef, useState } from "react";
import {
  createCoreWebgl,
  paletteFromElement,
  type CoreHandle,
  type CoreVoice,
} from "../core/coreWebgl";
import type { VoiceState } from "../voiceState";
import { CoreOrbSvgFallback } from "./CoreOrbSvgFallback";

type CoreOrbProps = {
  level?: number;
  voiceState?: VoiceState;
  size?: number;
};

function clampLevel(level: number): number {
  return Math.min(5, Math.max(1, Math.round(level)));
}

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

/** Living 3D holographic core — WebGL particles; SVG fallback if GL unavailable. */
export function CoreOrb({
  level = 4,
  voiceState = "idle",
  size = 320,
}: CoreOrbProps) {
  const lv = clampLevel(level);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<CoreHandle | null>(null);
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

    const ro = new ResizeObserver(() => handle.resize());
    ro.observe(wrap);

    return () => {
      ro.disconnect();
      handle.destroy();
      handleRef.current = null;
    };
  }, []);

  useEffect(() => {
    handleRef.current?.setLevel(lv);
  }, [lv]);

  useEffect(() => {
    handleRef.current?.setVoice(toCoreVoice(voiceState));
  }, [voiceState]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !handleRef.current) return;
    const sync = () =>
      handleRef.current?.setPalette(paletteFromElement(wrap));
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class", "style"],
    });
    return () => mo.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      className="core-orb"
      data-voice={voiceState}
      data-level={lv}
      data-engine={useFallback ? "svg" : "webgl"}
      style={{ width: size, maxWidth: "100%" }}
      role="img"
      aria-label={`Ядро Mira, уровень ${lv} из 5, состояние ${voiceState}`}
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
