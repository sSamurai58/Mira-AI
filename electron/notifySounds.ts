/**
 * Custom HUD notification sounds under userData/notify-sounds/.
 * Metadata lives in notify-prefs.json (customSounds + soundId).
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { app } from "electron";
import {
  loadNotifyPrefs,
  saveNotifyPrefs,
  type NotifyCustomSound,
  type NotifyPrefs,
} from "./notifyPrefs";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_EXT = new Set([
  ".wav",
  ".mp3",
  ".ogg",
  ".oga",
  ".m4a",
  ".aac",
  ".webm",
  ".flac",
]);

function soundsDir(): string {
  const dir = path.join(app.getPath("userData"), "notify-sounds");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function extOf(fileName: string, mime?: string): string {
  const fromName = path.extname(fileName || "").toLowerCase();
  if (ALLOWED_EXT.has(fromName)) return fromName;
  const map: Record<string, string> = {
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
    "audio/webm": ".webm",
    "audio/flac": ".flac",
  };
  if (mime && map[mime]) return map[mime];
  return ".wav";
}

function mimeOf(ext: string, fallback?: string): string {
  const map: Record<string, string> = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".webm": "audio/webm",
    ".flac": "audio/flac",
  };
  return map[ext] || fallback || "application/octet-stream";
}

function filePathFor(meta: NotifyCustomSound): string {
  const ext = extOf(meta.fileName || "", meta.mime);
  return path.join(soundsDir(), `${meta.id}${ext}`);
}

export function listNotifyCustomSounds(): NotifyCustomSound[] {
  return loadNotifyPrefs().customSounds;
}

export function addNotifySound(input: {
  name: string;
  bytes: Uint8Array | number[];
  fileName: string;
  mime?: string;
}): { ok: true; prefs: NotifyPrefs; sound: NotifyCustomSound } | { ok: false; detail: string } {
  const bytes = Buffer.from(input.bytes);
  if (!bytes.length) return { ok: false, detail: "Пустой файл" };
  if (bytes.length > MAX_BYTES) {
    return { ok: false, detail: "Файл больше 2 МБ" };
  }
  const ext = extOf(input.fileName, input.mime);
  if (!ALLOWED_EXT.has(ext)) {
    return { ok: false, detail: "Нужен audio: wav / mp3 / ogg / m4a / webm" };
  }
  const prefs = loadNotifyPrefs();
  if (prefs.customSounds.length >= 24) {
    return { ok: false, detail: "Не больше 24 своих звуков" };
  }

  const id = randomUUID();
  const name =
    (input.name || input.fileName || "Мой звук").trim().slice(0, 64) ||
    "Мой звук";
  const storedName = `${id}${ext}`;
  const meta: NotifyCustomSound = {
    id,
    name,
    fileName: storedName,
    mime: mimeOf(ext, input.mime),
  };

  try {
    fs.writeFileSync(path.join(soundsDir(), storedName), bytes);
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const next = saveNotifyPrefs({
    customSounds: [...prefs.customSounds, meta],
    soundId: `custom:${id}`,
    soundEnabled: true,
  });
  return { ok: true, prefs: next, sound: meta };
}

export function renameNotifySound(
  id: string,
  name: string,
): { ok: true; prefs: NotifyPrefs } | { ok: false; detail: string } {
  const trimmed = name.trim().slice(0, 64);
  if (!trimmed) return { ok: false, detail: "Пустое имя" };
  const prefs = loadNotifyPrefs();
  const idx = prefs.customSounds.findIndex((s) => s.id === id);
  if (idx < 0) return { ok: false, detail: "Звук не найден" };
  const customSounds = prefs.customSounds.map((s, i) =>
    i === idx ? { ...s, name: trimmed } : s,
  );
  return { ok: true, prefs: saveNotifyPrefs({ customSounds }) };
}

export function deleteNotifySound(
  id: string,
): { ok: true; prefs: NotifyPrefs } | { ok: false; detail: string } {
  const prefs = loadNotifyPrefs();
  const meta = prefs.customSounds.find((s) => s.id === id);
  if (!meta) return { ok: false, detail: "Звук не найден" };
  try {
    const fp = filePathFor(meta);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch {
    /* ignore */
  }
  const customSounds = prefs.customSounds.filter((s) => s.id !== id);
  const soundId =
    prefs.soundId === `custom:${id}` ? "builtin:chime" : prefs.soundId;
  return { ok: true, prefs: saveNotifyPrefs({ customSounds, soundId }) };
}

export function readNotifySound(
  id: string,
): { ok: true; base64: string; mime: string; name: string } | { ok: false; detail: string } {
  const prefs = loadNotifyPrefs();
  const meta = prefs.customSounds.find((s) => s.id === id);
  if (!meta) return { ok: false, detail: "Звук не найден" };
  const fp = filePathFor(meta);
  if (!fs.existsSync(fp)) return { ok: false, detail: "Файл звука отсутствует" };
  try {
    const buf = fs.readFileSync(fp);
    return {
      ok: true,
      base64: buf.toString("base64"),
      mime: meta.mime || mimeOf(path.extname(fp)),
      name: meta.name,
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
