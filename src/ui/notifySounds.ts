/** Built-in HUD notify tones + custom sound helpers (renderer). */

export type BuiltinNotifySoundId =
  | "builtin:chime"
  | "builtin:soft"
  | "builtin:pulse"
  | "builtin:bright"
  | "builtin:deep";

export type BuiltinNotifySound = {
  id: BuiltinNotifySoundId;
  label: string;
};

export const BUILTIN_NOTIFY_SOUNDS: BuiltinNotifySound[] = [
  { id: "builtin:chime", label: "Колокольчик" },
  { id: "builtin:soft", label: "Мягкий" },
  { id: "builtin:pulse", label: "Пульс" },
  { id: "builtin:bright", label: "Яркий" },
  { id: "builtin:deep", label: "Глубокий" },
];

export const DEFAULT_NOTIFY_SOUND_ID: BuiltinNotifySoundId = "builtin:chime";

export function isBuiltinSoundId(id: string): id is BuiltinNotifySoundId {
  return BUILTIN_NOTIFY_SOUNDS.some((s) => s.id === id);
}

export function customSoundPrefId(id: string): string {
  return `custom:${id}`;
}

export function parseCustomSoundId(soundId: string): string | null {
  if (!soundId.startsWith("custom:")) return null;
  const id = soundId.slice("custom:".length).trim();
  return id || null;
}

const LOCAL_CUSTOM_KEY = "mira.notify.custom-sound-blobs";

type LocalBlobMap = Record<
  string,
  { name: string; mime: string; dataUrl: string }
>;

function readLocalBlobs(): LocalBlobMap {
  try {
    const raw = localStorage.getItem(LOCAL_CUSTOM_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as LocalBlobMap;
  } catch {
    return {};
  }
}

function writeLocalBlobs(map: LocalBlobMap): void {
  try {
    localStorage.setItem(LOCAL_CUSTOM_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

export function saveLocalCustomSoundBlob(input: {
  id: string;
  name: string;
  mime: string;
  dataUrl: string;
}): void {
  const map = readLocalBlobs();
  map[input.id] = {
    name: input.name,
    mime: input.mime,
    dataUrl: input.dataUrl,
  };
  writeLocalBlobs(map);
}

export function renameLocalCustomSoundBlob(id: string, name: string): void {
  const map = readLocalBlobs();
  if (!map[id]) return;
  map[id] = { ...map[id], name };
  writeLocalBlobs(map);
}

export function deleteLocalCustomSoundBlob(id: string): void {
  const map = readLocalBlobs();
  if (!map[id]) return;
  delete map[id];
  writeLocalBlobs(map);
}

export function getLocalCustomSoundDataUrl(id: string): string | null {
  return readLocalBlobs()[id]?.dataUrl ?? null;
}

function getAudioCtx(): AudioContext | null {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return null;
  return new Ctx();
}

function playToneSequence(
  steps: Array<{
    freq: number;
    type?: OscillatorType;
    start: number;
    dur: number;
    gain?: number;
  }>,
): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  for (const step of steps) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = step.type ?? "sine";
    osc.frequency.value = step.freq;
    const peak = step.gain ?? 0.05;
    const t0 = ctx.currentTime + step.start;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + step.dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + step.dur + 0.02);
  }
  void ctx.resume();
  const end =
    Math.max(...steps.map((s) => s.start + s.dur), 0.2) * 1000 + 80;
  setTimeout(() => void ctx.close(), end);
}

export function playBuiltinNotifySound(id: string): void {
  switch (id) {
    case "builtin:soft":
      playToneSequence([
        { freq: 520, type: "triangle", start: 0, dur: 0.28, gain: 0.045 },
      ]);
      return;
    case "builtin:pulse":
      playToneSequence([
        { freq: 660, type: "square", start: 0, dur: 0.07, gain: 0.028 },
        { freq: 660, type: "square", start: 0.12, dur: 0.07, gain: 0.022 },
      ]);
      return;
    case "builtin:bright":
      playToneSequence([
        { freq: 1320, type: "sine", start: 0, dur: 0.12, gain: 0.04 },
        { freq: 1760, type: "sine", start: 0.08, dur: 0.16, gain: 0.03 },
      ]);
      return;
    case "builtin:deep":
      playToneSequence([
        { freq: 220, type: "sine", start: 0, dur: 0.32, gain: 0.06 },
        { freq: 330, type: "triangle", start: 0.05, dur: 0.22, gain: 0.03 },
      ]);
      return;
    case "builtin:chime":
    default:
      playToneSequence([
        { freq: 880, type: "sine", start: 0, dur: 0.16, gain: 0.045 },
        { freq: 1320, type: "sine", start: 0.1, dur: 0.22, gain: 0.035 },
      ]);
  }
}

async function playUrl(url: string): Promise<void> {
  const audio = new Audio(url);
  audio.volume = 0.85;
  try {
    await audio.play();
  } catch {
    /* autoplay / decode */
  }
}

function b64ToObjectUrl(base64: string, mime: string): string {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime || "audio/wav" }));
}

/** Play a custom sound by id (Electron IPC or local browser blob). */
export async function playCustomNotifySound(id: string): Promise<void> {
  if (window.mira?.getNotifySoundData) {
    const res = await window.mira.getNotifySoundData(id);
    if (!res.ok) return;
    const url = b64ToObjectUrl(res.base64, res.mime);
    try {
      await playUrl(url);
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 8_000);
    }
    return;
  }
  const dataUrl = getLocalCustomSoundDataUrl(id);
  if (dataUrl) await playUrl(dataUrl);
}
