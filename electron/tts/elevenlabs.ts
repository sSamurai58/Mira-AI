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

export type ElevenLabsStatus = {
  hasKey: boolean;
  voiceId: string;
  modelId: string;
  connected: boolean;
  detail: string;
  subscription?: string | null;
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
  if (!key) {
    return {
      hasKey: false,
      voiceId,
      modelId,
      connected: false,
      detail: "Нет ключа — добавьте ELEVENLABS_API_KEY в Настройках",
      subscription: null,
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
    };
  }
  const json = (await res.json().catch(() => null)) as {
    subscription?: { tier?: string; status?: string };
  } | null;
  const tier = json?.subscription?.tier || json?.subscription?.status || null;
  return {
    hasKey: true,
    voiceId,
    modelId,
    connected: true,
    detail: tier
      ? `Подключено · план ${tier}`
      : "Подключено к ElevenLabs",
    subscription: tier,
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

export async function synthesizeElevenLabs(opts: {
  text: string;
  voiceId?: string;
  modelId?: string;
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
  const modelId = (opts.modelId || getElevenLabsModelId()).trim();
  if (!voiceId) {
    return { ok: false, detail: "Не задан Voice ID ElevenLabs" };
  }

  const body: Record<string, unknown> = {
    text: clean,
    model_id: modelId,
  };
  // eleven_v3 / flash / turbo accept language_code; multilingual_v2 ignores it.
  if (modelId !== "eleven_multilingual_v2") {
    body.language_code = "ru";
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
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
    return {
      ok: false,
      detail: mapHttpError(res.status, errText),
      modelId,
      voiceId,
    };
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) {
    return {
      ok: false,
      detail: "ElevenLabs вернул пустой аудиоответ",
      modelId,
      voiceId,
    };
  }

  cleanupTemp();
  const tempPath = path.join(
    os.tmpdir(),
    `mira-elevenlabs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`,
  );
  try {
    fs.writeFileSync(tempPath, buf);
    lastTempPath = tempPath;
  } catch {
    /* temp optional */
  }

  const audioBase64 = buf.toString("base64");
  const mimeType = "audio/mpeg";
  return {
    ok: true,
    detail: `ElevenLabs · ${modelId}`,
    mimeType,
    audioBase64,
    dataUrl: `data:${mimeType};base64,${audioBase64}`,
    tempPath: lastTempPath,
    bytes: buf.length,
    modelId,
    voiceId,
  };
}
