/**
 * ElevenLabs TTS — Electron main only.
 * API key never leaves the main process / .env.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../config";

export const DEFAULT_ELEVENLABS_VOICE_ID = "YjESejviApN7SHrbfnA2";
export const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";
/** Short replies prefer Flash for lower latency (0.1.11). */
export const SHORT_REPLY_FLASH_MODEL_ID = "eleven_flash_v2_5";
export const SHORT_REPLY_CHAR_LIMIT = 160;

export const ELEVENLABS_MODELS = [
  {
    id: "eleven_multilingual_v2",
    label: "Multilingual v2",
    detail: "Рекомендуется для русского · естественный голос",
  },
  {
    id: "eleven_v3",
    label: "Eleven v3",
    detail: "Новейшая модель · language_code=ru",
  },
  {
    id: "eleven_turbo_v2_5",
    label: "Turbo v2.5",
    detail: "Быстрее · ниже latency",
  },
  {
    id: "eleven_flash_v2_5",
    label: "Flash v2.5",
    detail: "Самый быстрый · короткие реплики",
  },
] as const;

export type ElevenLabsModelId = (typeof ELEVENLABS_MODELS)[number]["id"];

export type ElevenLabsVoiceSettings = {
  stability: number;
  similarityBoost: number;
  style: number;
  useSpeakerBoost: boolean;
};

export type ElevenLabsStatus = {
  hasKey: boolean;
  voiceId: string;
  modelId: string;
  connected: boolean;
  detail: string;
  subscription?: string | null;
  /** Remaining credits when user probe succeeds. */
  characterCount?: number | null;
  characterLimit?: number | null;
  voiceSettings?: ElevenLabsVoiceSettings;
};

export type ElevenLabsVoiceInfo = {
  voiceId: string;
  name: string;
  category: string;
  previewUrl: string | null;
  labels: Record<string, string>;
};

export type ElevenLabsSynthResult = {
  ok: boolean;
  detail: string;
  mimeType?: string;
  audioBase64?: string;
  dataUrl?: string;
  /** Temp file for debugging; cleaned on next synth. */
  tempPath?: string | null;
  bytes?: number;
  modelId?: string;
  voiceId?: string;
};

function apiKey(): string | null {
  loadConfig();
  return process.env.ELEVENLABS_API_KEY?.trim() || null;
}

export function getElevenLabsVoiceId(): string {
  loadConfig();
  return (
    process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_ELEVENLABS_VOICE_ID
  );
}

export function getElevenLabsModelId(): string {
  loadConfig();
  const raw = process.env.ELEVENLABS_MODEL_ID?.trim();
  if (raw && ELEVENLABS_MODELS.some((m) => m.id === raw)) return raw;
  return DEFAULT_ELEVENLABS_MODEL_ID;
}

function clamp01(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

/** Stability / similarity / style from env (0…1). */
export function getElevenLabsVoiceSettings(): ElevenLabsVoiceSettings {
  loadConfig();
  return {
    stability: clamp01(
      Number(process.env.ELEVENLABS_STABILITY ?? 0.45),
      0.45,
    ),
    similarityBoost: clamp01(
      Number(process.env.ELEVENLABS_SIMILARITY ?? 0.75),
      0.75,
    ),
    style: clamp01(Number(process.env.ELEVENLABS_STYLE ?? 0.35), 0.35),
    useSpeakerBoost:
      (process.env.ELEVENLABS_SPEAKER_BOOST ?? "true").trim().toLowerCase() !==
      "false",
  };
}

/** Pick Flash/Turbo for short replies unless user forced a specific model via opts. */
export function pickModelForText(text: string, forced?: string): string {
  if (forced?.trim()) return forced.trim();
  const configured = getElevenLabsModelId();
  const clean = text.trim();
  if (clean.length > 0 && clean.length <= SHORT_REPLY_CHAR_LIMIT) {
    // Prefer Flash for short; Turbo if user already chose turbo family.
    if (configured.includes("turbo")) return configured;
    return SHORT_REPLY_FLASH_MODEL_ID;
  }
  return configured;
}

function mapHttpError(status: number, bodyText: string): string {
  const lower = bodyText.toLowerCase();
  if (status === 401 || status === 403) {
    return "Неверный или отозванный ELEVENLABS_API_KEY. Проверьте ключ в elevenlabs.io → Profile → API Key.";
  }
  if (status === 402 || /quota|credit|payment|billing|limit/i.test(bodyText)) {
    return "Лимит ElevenLabs / нет кредитов. Пополните план в кабинете ElevenLabs.";
  }
  if (status === 404) {
    return "Голос не найден (voice_id). Проверьте Voice ID в Настройках.";
  }
  if (status === 422) {
    return `Некорректный запрос ElevenLabs: ${bodyText.slice(0, 180) || "422"}`;
  }
  if (status === 429) {
    return "Слишком много запросов к ElevenLabs (rate limit). Подождите и попробуйте снова.";
  }
  if (status >= 500) {
    return "Сервер ElevenLabs временно недоступен. Попробуйте позже или выберите Web Speech.";
  }
  if (/network|fetch failed|enotfound|econnrefused|etimedout/i.test(lower)) {
    return "Нет сети для ElevenLabs. Проверьте интернет или выберите офлайн-движок (Web Speech / Neural pack).";
  }
  return `ElevenLabs HTTP ${status}${bodyText ? `: ${bodyText.slice(0, 160)}` : ""}`;
}

async function safeFetch(
  url: string,
  init: RequestInit,
): Promise<{ ok: true; res: Response } | { ok: false; detail: string }> {
  try {
    const res = await fetch(url, init);
    return { ok: true, res };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(msg)) {
      return {
        ok: false,
        detail:
          "Нет сети для ElevenLabs. Проверьте интернет или выберите офлайн-движок (Web Speech / Neural pack).",
      };
    }
    return { ok: false, detail: `Сеть ElevenLabs: ${msg}` };
  }
}

export async function getElevenLabsStatus(
  probe = false,
): Promise<ElevenLabsStatus> {
  const key = apiKey();
  const voiceId = getElevenLabsVoiceId();
  const modelId = getElevenLabsModelId();
  const voiceSettings = getElevenLabsVoiceSettings();
  if (!key) {
    return {
      hasKey: false,
      voiceId,
      modelId,
      connected: false,
      detail: "Нет ключа — добавьте ELEVENLABS_API_KEY в Настройках",
      subscription: null,
      voiceSettings,
    };
  }
  if (!probe) {
    return {
      hasKey: true,
      voiceId,
      modelId,
      connected: true,
      detail: "Ключ сохранён · готов к озвучке",
      subscription: null,
      voiceSettings,
    };
  }

  const fetched = await safeFetch("https://api.elevenlabs.io/v1/user", {
    method: "GET",
    headers: { "xi-api-key": key, Accept: "application/json" },
  });
  if (!fetched.ok) {
    return {
      hasKey: true,
      voiceId,
      modelId,
      connected: false,
      detail: fetched.detail,
      subscription: null,
      voiceSettings,
    };
  }
  const { res } = fetched;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      hasKey: true,
      voiceId,
      modelId,
      connected: false,
      detail: mapHttpError(res.status, body),
      subscription: null,
      voiceSettings,
    };
  }
  const json = (await res.json().catch(() => null)) as {
    subscription?: {
      tier?: string;
      status?: string;
      character_count?: number;
      character_limit?: number;
    };
  } | null;
  const tier = json?.subscription?.tier || json?.subscription?.status || null;
  const characterCount = json?.subscription?.character_count ?? null;
  const characterLimit = json?.subscription?.character_limit ?? null;
  let quota = "";
  if (characterCount != null && characterLimit != null) {
    const left = Math.max(0, characterLimit - characterCount);
    quota = ` · квота ${left.toLocaleString("ru-RU")} / ${characterLimit.toLocaleString("ru-RU")}`;
  }
  return {
    hasKey: true,
    voiceId,
    modelId,
    connected: true,
    detail: tier
      ? `Подключено · план ${tier}${quota}`
      : `Подключено к ElevenLabs${quota}`,
    subscription: tier,
    characterCount,
    characterLimit,
    voiceSettings,
  };
}

let lastTempPath: string | null = null;

function cleanupTemp(): void {
  if (!lastTempPath) return;
  try {
    if (fs.existsSync(lastTempPath)) fs.unlinkSync(lastTempPath);
  } catch {
    /* ignore */
  }
  lastTempPath = null;
}

function buildVoiceSettingsBody(
  overrides?: Partial<ElevenLabsVoiceSettings>,
): Record<string, unknown> {
  const s = { ...getElevenLabsVoiceSettings(), ...overrides };
  return {
    stability: s.stability,
    similarity_boost: s.similarityBoost,
    style: s.style,
    use_speaker_boost: s.useSpeakerBoost,
  };
}

/** MPEG frame sync (0xFFE?) or ID3v2 tag — reject JSON/PCM labeled as mp3. */
export function looksLikeMp3(buf: Buffer | Uint8Array): boolean {
  if (!buf || buf.length < 3) return false;
  // ID3v2
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true;
  // MPEG audio frame sync: 11 set bits
  if (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0) return true;
  // Some encoders pad a few bytes before the first frame — scan a short window.
  const limit = Math.min(buf.length - 1, 256);
  for (let i = 1; i < limit; i++) {
    if (buf[i] === 0xff && (buf[i + 1]! & 0xe0) === 0xe0) return true;
  }
  return false;
}

export function looksLikeJsonPayload(buf: Buffer | Uint8Array): boolean {
  if (!buf?.length) return false;
  const head = Buffer.from(buf.subarray(0, Math.min(48, buf.length)))
    .toString("utf8")
    .trimStart();
  return head.startsWith("{") || head.startsWith("[");
}

export function looksLikeWav(buf: Buffer | Uint8Array): boolean {
  return (
    !!buf &&
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x41 &&
    buf[10] === 0x56 &&
    buf[11] === 0x45
  );
}

/**
 * Sniff body + Content-Type so we never play PCM/JSON as audio/mpeg
 * (that produces screech/static in the dialog).
 */
export function sniffElevenLabsAudio(
  buf: Buffer | Uint8Array,
  contentType?: string | null,
): { ok: true; mimeType: "audio/mpeg" | "audio/wav" } | { ok: false; detail: string } {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("application/json") || ct.includes("text/")) {
    return {
      ok: false,
      detail: `ElevenLabs вернул не-аудио Content-Type (${contentType || "unknown"})`,
    };
  }
  if (looksLikeJsonPayload(buf)) {
    return { ok: false, detail: "ElevenLabs вернул JSON вместо аудио" };
  }
  if (looksLikeMp3(buf)) {
    return { ok: true, mimeType: "audio/mpeg" };
  }
  if (looksLikeWav(buf) || ct.includes("wav") || ct.includes("pcm")) {
    // Dialog path expects MP3 data URLs; refuse PCM/WAV masquerading as mpeg.
    return {
      ok: false,
      detail:
        "ElevenLabs вернул PCM/WAV вместо MP3 — отказ (иначе скрип/помехи)",
    };
  }
  if (ct.includes("audio/mpeg") || ct.includes("audio/mp3")) {
    // Header claims MP3 but magic missing — still unsafe to play.
    return {
      ok: false,
      detail: "Тело ответа не похоже на MP3 (битый stream)",
    };
  }
  return {
    ok: false,
    detail: "Неизвестный формат аудио ElevenLabs (ожидался MP3)",
  };
}

export async function synthesizeElevenLabs(opts: {
  text: string;
  voiceId?: string;
  modelId?: string;
  /**
   * Use `/stream` when true. Default is **false** (0.1.12): non-stream convert
   * returns a complete MP3. Stream still available, but invalid bodies fall back.
   */
  stream?: boolean;
  voiceSettings?: Partial<ElevenLabsVoiceSettings>;
}): Promise<ElevenLabsSynthResult> {
  const clean = (opts.text || "").trim();
  if (!clean) {
    return { ok: false, detail: "Пустой текст для озвучки" };
  }

  const key = apiKey();
  if (!key) {
    return {
      ok: false,
      detail:
        "Нет ELEVENLABS_API_KEY. Настройки → Голос / API → ElevenLabs → вставьте ключ с elevenlabs.io и сохраните.",
    };
  }

  const voiceId = (opts.voiceId || getElevenLabsVoiceId()).trim();
  const modelId = pickModelForText(clean, opts.modelId);
  if (!voiceId) {
    return { ok: false, detail: "Не задан Voice ID ElevenLabs" };
  }

  const body: Record<string, unknown> = {
    text: clean,
    model_id: modelId,
    voice_settings: buildVoiceSettingsBody(opts.voiceSettings),
  };
  // eleven_v3 / flash / turbo accept language_code; multilingual_v2 ignores it.
  if (modelId !== "eleven_multilingual_v2") {
    body.language_code = "ru";
  }

  // Opt-in stream: default convert path avoids PCM/chunk artifacts labeled as mpeg.
  const useStream = opts.stream === true;
  const base = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;
  const url = `${useStream ? `${base}/stream` : base}?output_format=mp3_44100_128`;
  const fetched = await safeFetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(body),
  });
  if (!fetched.ok) {
    return { ok: false, detail: fetched.detail, modelId, voiceId };
  }

  const { res } = fetched;
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    // Stream endpoint may 404 on older accounts — retry non-stream once.
    if (useStream && (res.status === 404 || res.status === 405)) {
      return synthesizeElevenLabs({ ...opts, stream: false });
    }
    return {
      ok: false,
      detail: mapHttpError(res.status, errText),
      modelId,
      voiceId,
    };
  }

  const contentType = res.headers.get("content-type");
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) {
    if (useStream) {
      return synthesizeElevenLabs({ ...opts, stream: false });
    }
    return {
      ok: false,
      detail: "ElevenLabs вернул пустой аудиоответ",
      modelId,
      voiceId,
    };
  }

  const sniffed = sniffElevenLabsAudio(buf, contentType);
  if (!sniffed.ok) {
    // Prefer non-stream convert over playing corrupt/PCM stream as speech.
    if (useStream) {
      return synthesizeElevenLabs({ ...opts, stream: false });
    }
    return {
      ok: false,
      detail: sniffed.detail,
      modelId,
      voiceId,
    };
  }

  cleanupTemp();
  const ext = sniffed.mimeType === "audio/wav" ? "wav" : "mp3";
  const tempPath = path.join(
    os.tmpdir(),
    `mira-elevenlabs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
  );
  try {
    fs.writeFileSync(tempPath, buf);
    lastTempPath = tempPath;
  } catch {
    /* temp optional */
  }

  const audioBase64 = buf.toString("base64");
  const mimeType = sniffed.mimeType;
  return {
    ok: true,
    detail: `ElevenLabs · ${modelId}${useStream ? " · stream" : ""}`,
    mimeType,
    audioBase64,
    dataUrl: `data:${mimeType};base64,${audioBase64}`,
    tempPath: lastTempPath,
    bytes: buf.length,
    modelId,
    voiceId,
  };
}

export async function listElevenLabsVoices(): Promise<{
  ok: boolean;
  detail: string;
  voices: ElevenLabsVoiceInfo[];
}> {
  const key = apiKey();
  if (!key) {
    return {
      ok: false,
      detail: "Нет ELEVENLABS_API_KEY",
      voices: [
        {
          voiceId: DEFAULT_ELEVENLABS_VOICE_ID,
          name: "Mira preset",
          category: "preset",
          previewUrl: null,
          labels: { mira: "default" },
        },
      ],
    };
  }
  const fetched = await safeFetch("https://api.elevenlabs.io/v1/voices", {
    method: "GET",
    headers: { "xi-api-key": key, Accept: "application/json" },
  });
  if (!fetched.ok) {
    return { ok: false, detail: fetched.detail, voices: [] };
  }
  const { res } = fetched;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, detail: mapHttpError(res.status, body), voices: [] };
  }
  const json = (await res.json().catch(() => null)) as {
    voices?: Array<{
      voice_id?: string;
      name?: string;
      category?: string;
      preview_url?: string;
      labels?: Record<string, string>;
    }>;
  } | null;
  const voices: ElevenLabsVoiceInfo[] = (json?.voices ?? [])
    .filter((v) => v.voice_id)
    .map((v) => ({
      voiceId: v.voice_id!,
      name: v.name || v.voice_id!,
      category: v.category || "unknown",
      previewUrl: v.preview_url || null,
      labels: v.labels || {},
    }));
  // Ensure preset always listed.
  if (!voices.some((v) => v.voiceId === DEFAULT_ELEVENLABS_VOICE_ID)) {
    voices.unshift({
      voiceId: DEFAULT_ELEVENLABS_VOICE_ID,
      name: "Mira preset",
      category: "preset",
      previewUrl: null,
      labels: { mira: "default" },
    });
  }
  return {
    ok: true,
    detail: `Голосов: ${voices.length}`,
    voices,
  };
}

/**
 * Instant Voice Clone: upload studio clips → ElevenLabs IVC when key present.
 */
export async function cloneElevenLabsVoice(opts: {
  name: string;
  description?: string;
  /** Absolute paths to audio files (wav/mp3). */
  filePaths: string[];
}): Promise<{
  ok: boolean;
  detail: string;
  voiceId?: string;
}> {
  const key = apiKey();
  if (!key) {
    return {
      ok: false,
      detail:
        "Нет ELEVENLABS_API_KEY — Instant Voice Clone недоступен. Сохраните ключ в Настройках.",
    };
  }
  const name = (opts.name || "").trim() || "Mira clone";
  const files = (opts.filePaths || []).filter((p) => {
    try {
      return p && fs.existsSync(p) && fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
  if (!files.length) {
    return {
      ok: false,
      detail: "Нет аудиофайлов для клона. Запишите клипы в Студии голоса.",
    };
  }

  try {
    const form = new FormData();
    form.append("name", name);
    if (opts.description?.trim()) {
      form.append("description", opts.description.trim());
    }
    for (const fp of files.slice(0, 25)) {
      const buf = fs.readFileSync(fp);
      const blob = new Blob([new Uint8Array(buf)], {
        type: fp.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "audio/wav",
      });
      form.append("files", blob, path.basename(fp));
    }

    const fetched = await safeFetch(
      "https://api.elevenlabs.io/v1/voices/add",
      {
        method: "POST",
        headers: { "xi-api-key": key },
        body: form,
      },
    );
    if (!fetched.ok) {
      return { ok: false, detail: fetched.detail };
    }
    const { res } = fetched;
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, detail: mapHttpError(res.status, errText) };
    }
    const json = (await res.json().catch(() => null)) as {
      voice_id?: string;
    } | null;
    const voiceId = json?.voice_id?.trim();
    if (!voiceId) {
      return { ok: false, detail: "ElevenLabs не вернул voice_id" };
    }
    return {
      ok: true,
      detail: `Instant Voice Clone создан · ${voiceId}`,
      voiceId,
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
