/**
 * Best-effort AV transcript for library items (0.1.11).
 * Order: sidecar → whisper CLI sidecar if present → ffmpeg+metadata honest fallback.
 * Web Speech runs in renderer; main exposes this for Electron import path.
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type AvTranscriptResult = {
  text: string;
  note: string;
  method: "sidecar" | "whisper" | "ffmpeg-meta" | "none";
};

function sidecarTranscript(filePath: string): string | null {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  for (const ext of [".txt", ".md", ".transcript.txt", ".srt", ".vtt"]) {
    const candidate = path.join(dir, base + ext);
    try {
      if (fs.existsSync(candidate)) {
        const raw = fs.readFileSync(candidate, "utf8").trim();
        if (raw.length > 20) return raw.slice(0, 50_000);
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function which(cmd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      process.platform === "win32" ? "where" : "which",
      [cmd],
      { timeout: 3000 },
    );
    const line = stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    return line || null;
  } catch {
    return null;
  }
}

/** Try `whisper` CLI (openai-whisper) if installed on PATH. */
async function tryWhisperCli(filePath: string): Promise<string | null> {
  const bin = (await which("whisper")) || (await which("whisper.cpp"));
  if (!bin) return null;
  const outDir = path.join(path.dirname(filePath), ".mira-asr");
  try {
    fs.mkdirSync(outDir, { recursive: true });
    await execFileAsync(
      bin,
      [
        filePath,
        "--model",
        "base",
        "--language",
        "ru",
        "--output_dir",
        outDir,
        "--output_format",
        "txt",
      ],
      { timeout: 180_000, maxBuffer: 8 * 1024 * 1024 },
    );
    const base = path.basename(filePath, path.extname(filePath));
    const txt = path.join(outDir, `${base}.txt`);
    if (fs.existsSync(txt)) {
      const raw = fs.readFileSync(txt, "utf8").trim();
      if (raw.length > 20) return raw.slice(0, 50_000);
    }
  } catch {
    return null;
  }
  return null;
}

async function ffmpegMeta(filePath: string): Promise<string | null> {
  const ffprobe = (await which("ffprobe")) || (await which("ffmpeg"));
  if (!ffprobe) return null;
  try {
    if (path.basename(ffprobe).includes("ffprobe")) {
      const { stdout } = await execFileAsync(
        ffprobe,
        [
          "-v",
          "quiet",
          "-print_format",
          "json",
          "-show_format",
          "-show_streams",
          filePath,
        ],
        { timeout: 15000 },
      );
      const json = JSON.parse(stdout) as {
        format?: { duration?: string; tags?: Record<string, string> };
      };
      const dur = json.format?.duration
        ? `${Math.round(Number(json.format.duration))}с`
        : "?";
      const title = json.format?.tags?.title || path.basename(filePath);
      return `[av meta] «${title}» · длительность ${dur}. ASR (whisper) не найден — положите рядом .txt/.srt или установите whisper CLI.`;
    }
  } catch {
    return null;
  }
  return null;
}

export async function extractAvTranscript(
  filePath: string,
  mediaType: "audio" | "video",
): Promise<AvTranscriptResult> {
  const side = sidecarTranscript(filePath);
  if (side) {
    return {
      text: side,
      note: `${mediaType}: sidecar transcript`,
      method: "sidecar",
    };
  }

  const whispered = await tryWhisperCli(filePath);
  if (whispered) {
    return {
      text: whispered,
      note: `${mediaType}: whisper CLI`,
      method: "whisper",
    };
  }

  const meta = await ffmpegMeta(filePath);
  if (meta) {
    return {
      text: meta,
      note: `${mediaType}: ffmpeg/ffprobe metadata (no ASR)`,
      method: "ffmpeg-meta",
    };
  }

  try {
    const st = fs.statSync(filePath);
    return {
      text: `[${mediaType} meta] ${path.basename(filePath)} · ${Math.round(st.size / 1024)} КБ · mtime=${st.mtime.toISOString()}\nТранскрипт ASR: sidecar .txt/.md/.srt, либо whisper CLI на PATH, либо Web Speech в UI (best-effort).`,
      note: `${mediaType}: metadata + honest ASR fallback hint`,
      method: "none",
    };
  } catch (err) {
    return {
      text: `[${mediaType}] extract failed`,
      note: err instanceof Error ? err.message : String(err),
      method: "none",
    };
  }
}
