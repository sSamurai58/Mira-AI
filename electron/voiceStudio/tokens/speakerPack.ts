/**
 * Speaker pack — CosyVoice "Save Speaker .pt" equivalent for Mira.
 * Stores x-vector emb + meta so speak does NOT re-analyze ref every time.
 */
import fs from "node:fs";
import path from "node:path";
import {
  cosineSim,
  extractXVectorFromWav as extractEmb,
  XVEC_DIM,
} from "./xvector";

export type SpeakerPackMeta = {
  version: 1;
  voiceId: string;
  projectId: string;
  label: string;
  /** Emotion / style slot (calm, default, …) — separate packs per CosyVoice tip. */
  style: string;
  createdAt: string;
  sourceWav?: string;
  dim: number;
  detail: string;
  backend: "mira-xvec-v1" | "cosyvoice-pt";
};

export type SpeakerPack = {
  meta: SpeakerPackMeta;
  emb: Float32Array;
  dir: string;
};

function packDir(projectRoot: string, style = "default"): string {
  return path.join(projectRoot, "speakers", style);
}

export function speakerPackPaths(projectRoot: string, style = "default") {
  const dir = packDir(projectRoot, style);
  return {
    dir,
    meta: path.join(dir, "meta.json"),
    emb: path.join(dir, "speaker.xvec.f32"),
    /** Placeholder for future CosyVoice .pt drop-in */
    cosyPt: path.join(dir, "speaker.pt"),
  };
}

export function saveSpeakerPack(opts: {
  projectRoot: string;
  voiceId: string;
  projectId: string;
  label: string;
  style?: string;
  sourceWav: string;
}): SpeakerPack {
  const style = opts.style?.trim() || "default";
  const paths = speakerPackPaths(opts.projectRoot, style);
  fs.mkdirSync(paths.dir, { recursive: true });

  const extracted = extractEmb(opts.sourceWav);
  if (!extracted) {
    throw new Error("Не удалось извлечь speaker emb из WAV");
  }

  const meta: SpeakerPackMeta = {
    version: 1,
    voiceId: opts.voiceId,
    projectId: opts.projectId,
    label: opts.label,
    style,
    createdAt: new Date().toISOString(),
    sourceWav: opts.sourceWav,
    dim: extracted.dim,
    detail: extracted.detail,
    backend: fs.existsSync(paths.cosyPt) ? "cosyvoice-pt" : "mira-xvec-v1",
  };

  fs.writeFileSync(paths.meta, JSON.stringify(meta, null, 2), "utf8");
  fs.writeFileSync(paths.emb, Buffer.from(extracted.emb.buffer));

  return { meta, emb: extracted.emb, dir: paths.dir };
}

export function loadSpeakerPack(
  projectRoot: string,
  style = "default",
): SpeakerPack | null {
  const paths = speakerPackPaths(projectRoot, style);
  if (!fs.existsSync(paths.meta) || !fs.existsSync(paths.emb)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(paths.meta, "utf8")) as SpeakerPackMeta;
    const buf = fs.readFileSync(paths.emb);
    const emb = new Float32Array(
      buf.buffer,
      buf.byteOffset,
      Math.floor(buf.byteLength / 4),
    );
    if (emb.length < 32) return null;
    if (fs.existsSync(paths.cosyPt)) {
      meta.backend = "cosyvoice-pt";
    }
    return { meta, emb, dir: paths.dir };
  } catch {
    return null;
  }
}

export function listSpeakerStyles(projectRoot: string): string[] {
  const root = path.join(projectRoot, "speakers");
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(root, name, "meta.json")));
}

export function speakerPackStatus(projectRoot: string): {
  styles: string[];
  defaultReady: boolean;
  cosyPtReady: boolean;
} {
  const styles = listSpeakerStyles(projectRoot);
  const def = loadSpeakerPack(projectRoot, "default");
  const cosy = fs.existsSync(speakerPackPaths(projectRoot, "default").cosyPt);
  return {
    styles,
    defaultReady: Boolean(def),
    cosyPtReady: cosy,
  };
}

export { cosineSim, XVEC_DIM };
