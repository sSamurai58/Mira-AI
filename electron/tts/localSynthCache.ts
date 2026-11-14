/**
 * On-disk LRU cache for local neural TTS WAV files.
 * Keyed by voice + text + prosody — no cloud, stays under writableRoot.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { miraRoot } from "../appPaths";

const MAX_ENTRIES = 96;

type CacheIndex = {
  entries: Array<{ key: string; file: string; at: number; bytes: number }>;
};

function cacheDir(): string {
  const dir = miraRoot("tts-cache");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function indexPath(): string {
  return path.join(cacheDir(), "index.json");
}

function readIndex(): CacheIndex {
  try {
    const raw = fs.readFileSync(indexPath(), "utf8");
    const parsed = JSON.parse(raw) as CacheIndex;
    if (!Array.isArray(parsed.entries)) return { entries: [] };
    return parsed;
  } catch {
    return { entries: [] };
  }
}

function writeIndex(index: CacheIndex): void {
  fs.writeFileSync(indexPath(), JSON.stringify(index), "utf8");
}

export function synthCacheKey(
  voiceId: string,
  text: string,
  prosody: {
    speed?: number;
    pauseScale?: number;
    energy?: number;
    quality?: string;
  } = {},
): string {
  const payload = JSON.stringify({
    v: 1,
    voiceId,
    text: text.trim(),
    speed: prosody.speed ?? 1,
    pauseScale: prosody.pauseScale ?? 1,
    energy: prosody.energy ?? 1,
    quality: prosody.quality ?? "balanced",
  });
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 40);
}

export function getCachedSynthWav(key: string): string | null {
  const index = readIndex();
  const hit = index.entries.find((e) => e.key === key);
  if (!hit) return null;
  const full = path.join(cacheDir(), hit.file);
  if (!fs.existsSync(full)) {
    index.entries = index.entries.filter((e) => e.key !== key);
    writeIndex(index);
    return null;
  }
  hit.at = Date.now();
  writeIndex(index);
  return full;
}

export function putCachedSynthWav(key: string, wavPath: string): string {
  const dir = cacheDir();
  const file = `${key}.wav`;
  const dest = path.join(dir, file);
  if (path.resolve(wavPath) !== path.resolve(dest)) {
    fs.copyFileSync(wavPath, dest);
  }
  const stat = fs.statSync(dest);
  const index = readIndex();
  index.entries = index.entries.filter((e) => e.key !== key);
  index.entries.push({
    key,
    file,
    at: Date.now(),
    bytes: stat.size,
  });
  index.entries.sort((a, b) => b.at - a.at);
  while (index.entries.length > MAX_ENTRIES) {
    const drop = index.entries.pop();
    if (!drop) break;
    try {
      fs.unlinkSync(path.join(dir, drop.file));
    } catch {
      /* ignore */
    }
  }
  writeIndex(index);
  return dest;
}

export function clearSynthCache(): { removed: number } {
  const dir = cacheDir();
  let removed = 0;
  try {
    for (const name of fs.readdirSync(dir)) {
      try {
        fs.unlinkSync(path.join(dir, name));
        removed += 1;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return { removed };
}
