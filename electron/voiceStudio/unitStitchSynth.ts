/**
 * Unit-selection speak path: stitch recorded phrase/word WAVs from model-pack.
 * Much more intelligible than the tiny neural mel→Griffin-Lim path when the
 * lexicon covers the utterance.
 */
import fs from "node:fs";
import path from "node:path";
import {
  normalizeLexKey,
  parseWavInfo,
  readVoiceModelPack,
  stitchPcmInt16OverlapAdd,
  tokenizeSpeechWords,
  type VoiceModelPack,
  type VoicePackLexiconEntry,
} from "./modelPack";
import { writeParametricFillWav } from "./parametricFill";

export type UnitStitchResult = {
  ok: boolean;
  wavPath: string | null;
  detail: string;
  /** 0…1 fraction of words covered by real (non-provisional) audio units. */
  coverage: number;
  words: number;
  covered: number;
  usedPhraseExact: boolean;
};

function resolveUnitFile(packDir: string, file: string): string | null {
  const candidates = [
    path.isAbsolute(file) ? file : path.join(packDir, file),
    path.join(packDir, "units", path.basename(file)),
    path.join(packDir, path.basename(file)),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

function readWavPcmPart(
  wavPath: string,
): { pcm: Buffer; sampleRate: number; channels: number } | null {
  const info = parseWavInfo(wavPath);
  if (!info || info.bitsPerSample !== 16) return null;
  const buf = fs.readFileSync(wavPath);
  if (buf.length < info.dataOffset + info.dataSize) return null;
  const pcm = Buffer.from(
    buf.buffer,
    buf.byteOffset + info.dataOffset,
    info.dataSize,
  );
  return { pcm, sampleRate: info.sampleRate, channels: info.channels };
}

function pickBestEntry(
  entries: VoicePackLexiconEntry[] | undefined,
  packDir: string,
): { entry: VoicePackLexiconEntry; file: string } | null {
  if (!entries?.length) return null;
  const scored = entries
    .filter((e) => !e.provisional && e.file)
    .map((e) => {
      const file = resolveUnitFile(packDir, e.file);
      const score =
        (e.score ?? 0) +
        (file ? 10 : 0) +
        Math.min(2, (e.endMs - e.startMs) / 400);
      return { entry: e, file, score };
    })
    .filter((x): x is { entry: VoicePackLexiconEntry; file: string; score: number } =>
      Boolean(x.file),
    )
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;
  return { entry: best.entry, file: best.file };
}

function normalizePhraseKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findExactPhrase(
  pack: VoiceModelPack,
  packDir: string,
  text: string,
): string | null {
  const want = normalizePhraseKey(text);
  if (!want) return null;
  for (const ph of pack.phrases ?? []) {
    if (normalizePhraseKey(ph.text) !== want) continue;
    const unit = pack.units.find((u) => u.id === ph.unitId && !u.provisional);
    const file =
      (unit ? resolveUnitFile(packDir, unit.file) : null) ||
      resolveUnitFile(packDir, ph.clipPath) ||
      (ph.unitId
        ? resolveUnitFile(packDir, path.join("units", `${ph.unitId}.wav`))
        : null);
    if (file) return file;
  }
  // Also match full phrase units by text.
  for (const u of pack.units) {
    if (u.kind !== "phrase" || u.provisional) continue;
    if (normalizePhraseKey(u.text) !== want) continue;
    const file = resolveUnitFile(packDir, u.file);
    if (file) return file;
  }
  return null;
}

function writeStitchedWav(
  outPath: string,
  pcm: Buffer,
  sampleRate: number,
  channels: number,
): void {
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.concat([header, pcm]));
}

/**
 * Prefer exact phrase; else stitch word units. Requires high audio coverage
 * so we do not invent robotic gaps mid-sentence.
 */
export function synthesizeUnitStitch(
  packDir: string,
  text: string,
  opts?: { outPath?: string; minCoverage?: number },
): UnitStitchResult {
  const clean = text.trim();
  const empty: UnitStitchResult = {
    ok: false,
    wavPath: null,
    detail: "Пустой текст",
    coverage: 0,
    words: 0,
    covered: 0,
    usedPhraseExact: false,
  };
  if (!clean) return empty;

  const pack = readVoiceModelPack(packDir);
  if (!pack) {
    return { ...empty, detail: "model-pack не найден" };
  }

  const outPath =
    opts?.outPath ??
    path.join(
      packDir,
      "synth",
      `unit-stitch-${Date.now().toString(36)}.wav`,
    );
  const minCoverage = opts?.minCoverage ?? 0.85;

  const exact = findExactPhrase(pack, packDir, clean);
  if (exact) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.copyFileSync(exact, outPath);
    const words = tokenizeSpeechWords(clean).length;
    return {
      ok: true,
      wavPath: outPath,
      detail: "Фраза из корпуса (точная запись)",
      coverage: 1,
      words: Math.max(1, words),
      covered: Math.max(1, words),
      usedPhraseExact: true,
    };
  }

  const words = tokenizeSpeechWords(clean);
  if (!words.length) {
    return { ...empty, detail: "Нет слов для склейки" };
  }

  const fillDir = path.join(packDir, "synth", "fill");
  fs.mkdirSync(fillDir, { recursive: true });

  const parts: Array<{ pcm: Buffer; sampleRate: number; channels: number }> =
    [];
  let covered = 0;
  let filled = 0;
  let targetSr = 16000;
  let targetCh = 1;

  for (let wi = 0; wi < words.length; wi++) {
    const w = words[wi]!;
    const key = normalizeLexKey(w);
    const picked = pickBestEntry(pack.lexicon[key], packDir);
    if (picked) {
      const part = readWavPcmPart(picked.file);
      if (part && part.pcm.length >= 64) {
        targetSr = part.sampleRate;
        targetCh = part.channels;
        parts.push(part);
        covered += 1;
        continue;
      }
    }
    // Uncovered word → formant fill (intelligible phonemes, not clone).
    const fillPath = path.join(fillDir, `f-${wi}-${Date.now().toString(36)}.wav`);
    writeParametricFillWav(w, fillPath, { sampleRate: targetSr, speed: 1 });
    const part = readWavPcmPart(fillPath);
    try {
      fs.unlinkSync(fillPath);
    } catch {
      /* ignore */
    }
    if (!part || part.pcm.length < 32) continue;
    parts.push(part);
    filled += 1;
  }

  const coverage = covered / words.length;
  // Allow stitch when we have real audio for most words, OR full fill for short text.
  const allowFillOnly = words.length <= 4 && parts.length === words.length;
  if (
    parts.length === 0 ||
    (coverage < minCoverage && !allowFillOnly && covered === 0)
  ) {
    return {
      ok: false,
      wavPath: null,
      detail: `Склейка: покрытие ${(coverage * 100).toFixed(0)}% < ${(minCoverage * 100).toFixed(0)}%`,
      coverage,
      words: words.length,
      covered,
      usedPhraseExact: false,
    };
  }
  // If coverage is low but we filled gaps, still stitch when ≥1 real unit
  // or short all-fill utterance.
  if (coverage < minCoverage && covered === 0 && !allowFillOnly) {
    return {
      ok: false,
      wavPath: null,
      detail: `Склейка: нет аудио-юнитов (${filled} formant fill)`,
      coverage,
      words: words.length,
      covered,
      usedPhraseExact: false,
    };
  }

  const stitched = stitchPcmInt16OverlapAdd(parts, {
    minCrossfadeMs: 18,
    maxCrossfadeMs: 48,
  });
  if (!stitched) {
    return {
      ok: false,
      wavPath: null,
      detail: "Не удалось склеить PCM",
      coverage,
      words: words.length,
      covered,
      usedPhraseExact: false,
    };
  }

  writeStitchedWav(
    outPath,
    stitched.pcm,
    stitched.sampleRate,
    stitched.channels,
  );
  const fillNote = filled ? ` + ${filled} formant` : "";
  return {
    ok: true,
    wavPath: outPath,
    detail: `Склейка корпуса ${covered}/${words.length} слов${fillNote}`,
    coverage,
    words: words.length,
    covered,
    usedPhraseExact: false,
  };
}
