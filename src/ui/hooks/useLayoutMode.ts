import { useEffect, useState } from "react";

export type LayoutMode = "desktop" | "tablet-landscape" | "tablet-portrait";

function readLayoutMode(): LayoutMode {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  const h = window.innerHeight;
  const portrait = h > w;
  // Compact tablet band — phones & tablets share these modes for Mira shell.
  if (w <= 820 || (portrait && w <= 1024)) return "tablet-portrait";
  if (w <= 1280) return "tablet-landscape";
  return "desktop";
}

/** Keeps `html[data-layout]` in sync for CSS compact tablet rules. */
export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(() => readLayoutMode());

  useEffect(() => {
    const apply = () => {
      const next = readLayoutMode();
      setMode(next);
      document.documentElement.dataset.layout = next;
      document.documentElement.dataset.orientation =
        window.innerHeight > window.innerWidth ? "portrait" : "landscape";
    };
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);

  return mode;
}

export function isTabletLayout(mode: LayoutMode): boolean {
  return mode === "tablet-landscape" || mode === "tablet-portrait";
}
