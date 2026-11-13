import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../electron/config";
import {
  addUtterance,
  closeStore,
  createSession,
  openStore,
} from "../electron/store";
import {
  addCustomPhrase,
  createVoiceProject,
  deleteVoicePhrase,
  generatePhrases,
  getCustomVoiceCorpus,
  getStudioSnapshot,
  importClip,
  listClips,
  listCustomVoices,
  listPhrases,
  resetVoicePhraseAudio,
  trainVoiceModel,
} from "../electron/voiceStudio/studio";
import {
  buildCorpusLexStats,
  scorePhraseNovelty,
} from "../electron/voiceStudio/phraseNovelty";
import {
  estimateWordBoundariesByEnergy,
  extractClipAudioFeatures,
  MIN_WORD_MS,
  noiseLikeness,
  relativeWordDurationWeights,
  textAudioMismatch,
} from "../electron/voiceStudio/audioFeatures";
import {
  convertAudioToPcmWav,
  normalizeLexKey,
  parseWavInfo,
  pcmInt16Rms,
  sliceWavToFile,
  stitchPcmInt16OverlapAdd,
  tokenizeSpeechWords,
} from "../electron/voiceStudio/modelPack";
import {
  extractMelFromWav,
  melL1,
  melToSummary,
} from "../electron/voiceStudio/melSpectrogram";
import { NEURAL_TTS_CURRICULUM } from "../electron/voiceStudio/melTrainer";
import {
  synthesizeCustomVoiceNeural,
  submitVoicePreference,
  getVoicePreferenceCandidates,
} from "../electron/voiceStudio/studio";
import { execFileSync } from "node:child_process";

loadConfig(true);
process.env.LLM_PROVIDER = "mock";
loadConfig(true);
openStore();

async function main() {
  // Seed chat so generation prefers the most frequent assistant lines first.
  const session = createSession("voice-phrase-seed");
  addUtterance(session.id, "assistant", "Слушаю вас внимательно.");
  addUtterance(session.id, "assistant", "Готово, задача выполнена.");
  // Repeat a rarer line so frequency outranks a single recent one.
  for (let i = 0; i < 5; i++) {
    addUtterance(session.id, "assistant", "Проверяю статус задачи.");
  }

  const project = createVoiceProject({ name: "Smoke Voice", lang: "ru-RU" });
  assert.equal(project.status, "created");

  const batch1 = generatePhrases(project.id, 5);
  assert.equal(batch1.length, 5);
  const texts1 = new Set(batch1.map((p) => p.text));
  assert.equal(texts1.size, 5);
  // Empty/small corpus still bootstraps from frequent assistant speech.
  assert.ok(
    batch1.some((p) => /проверяю|слушаю|готово/i.test(p.text)),
    "empty corpus should still seed assistant-used phrases",
  );
  assert.ok(
    batch1.some((p) => /проверяю/i.test(p.text)),
    "most frequent assistant phrase should appear while corpus is small",
  );

  // UI always sends { count, minWords, maxWords } — must not return [].
  const optsBatch = generatePhrases(project.id, {
    count: 4,
    minWords: 20,
    maxWords: 60,
  });
  assert.equal(optsBatch.length, 4, "opts generate should return requested count");
  for (const p of optsBatch) {
    const n = p.text.trim().split(/\s+/).filter(Boolean).length;
    assert.ok(n >= 20 && n <= 60, `word range 20–60, got ${n}: ${p.text.slice(0, 80)}`);
  }

  const longBatch = generatePhrases(project.id, {
    count: 2,
    minWords: 80,
    maxWords: 120,
  });
  assert.equal(longBatch.length, 2, "long word-range generate must not be empty");
  for (const p of longBatch) {
    const n = p.text.trim().split(/\s+/).filter(Boolean).length;
    assert.ok(n >= 80 && n <= 120, `word range 80–120, got ${n}`);
  }
  assert.notEqual(
    longBatch[0]!.text,
    longBatch[1]!.text,
    "consecutive long texts must differ",
  );

  const veryLong = generatePhrases(project.id, {
    count: 2,
    minWords: 350,
    maxWords: 400,
  });
  assert.equal(veryLong.length, 2, "400-word generate must return 2");
  assert.notEqual(
    veryLong[0]!.text,
    veryLong[1]!.text,
    "two 400-word texts must not be identical",
  );
  const overlapRatio = (() => {
    const a = new Set(veryLong[0]!.text.split(/\s+/).slice(0, 80));
    const b = veryLong[1]!.text.split(/\s+/).slice(0, 80);
    const hit = b.filter((w) => a.has(w)).length;
    return hit / Math.max(1, b.length);
  })();
  assert.ok(
    overlapRatio < 0.92,
    `long texts should diversify fillers; overlap=${overlapRatio.toFixed(2)}`,
  );

  const doomed = generatePhrases(project.id, {
    count: 1,
    minWords: 4,
    maxWords: 12,
  });
  assert.equal(doomed.length, 1);
  const del = deleteVoicePhrase(doomed[0]!.id);
  assert.equal(del.ok, true, "untrained phrase should delete");
  assert.equal(
    listPhrases(project.id).some((p) => p.id === doomed[0]!.id),
    false,
  );

  const batch2 = generatePhrases(project.id, 5);
  assert.ok(batch2.length >= 1);
  for (const p of batch2) {
    assert.equal(texts1.has(p.text), false, "dedup failed");
  }

  // Novelty: after a mock corpus saturated with the same content words,
  // new generations must not recycle those top words heavily — prefer
  // new vocabulary / missing prepositions / intonation seeds.
  const noveltyProject = createVoiceProject({
    name: "Novelty Voice",
    lang: "ru-RU",
  });
  const saturatedLine =
    "проверка статуса задачи проверка статуса задачи проверка статуса задачи";
  for (let i = 0; i < 10; i++) {
    addCustomPhrase(noveltyProject.id, `${saturatedLine} вариант ${i + 1}.`);
  }
  const mockCorpus = listPhrases(noveltyProject.id).map((p) => p.text);
  const mockStats = buildCorpusLexStats(mockCorpus, "ru-RU");
  assert.ok(mockStats.saturated.has("проверка") || (mockStats.freq.get("проверка") ?? 0) >= 8);
  assert.ok(mockStats.missingFunctionKeys.includes("через") || mockStats.missingFunctionKeys.length > 0);

  const novelBatch = generatePhrases(noveltyProject.id, {
    count: 6,
    minWords: 4,
    maxWords: 40,
  });
  assert.ok(novelBatch.length >= 3, "novelty generate should return phrases");
  const satKeys = ["проверка", "статуса", "задачи"] as const;
  let avoidedHeavy = 0;
  let coverageHit = 0;
  for (const p of novelBatch) {
    const nov = scorePhraseNovelty(p.text, mockStats, "ru-RU");
    assert.equal(
      nov.tooRepetitive,
      false,
      `candidate too repetitive vs saturated corpus: ${p.text.slice(0, 100)}`,
    );
    const keys = tokenizeSpeechWords(p.text).map((w) => normalizeLexKey(w));
    const satHits = keys.filter((k) =>
      satKeys.includes(k as (typeof satKeys)[number]),
    ).length;
    const satRatio = satHits / Math.max(1, keys.length);
    if (satRatio < 0.35) avoidedHeavy += 1;
    if (
      /через|вдоль|вокруг|предлог|вопрос|команда|перечислен|телефон|мягк/i.test(
        p.text,
      ) ||
      nov.missingFunctionHits > 0 ||
      nov.novelCount >= 2
    ) {
      coverageHit += 1;
    }
  }
  assert.ok(
    avoidedHeavy >= Math.ceil(novelBatch.length * 0.5),
    `expected most new phrases to avoid saturated content words; avoided=${avoidedHeavy}/${novelBatch.length}`,
  );
  assert.ok(
    coverageHit >= 1,
    "expected at least one novelty/coverage-oriented phrase",
  );

  const sample = path.resolve(
    process.cwd(),
    "seed",
    "voice-studio",
    "sample-phrase.wav",
  );

  // PCM features + spectral/energy alignment (unit-selection, not neural).
  const sampleFeat = extractClipAudioFeatures(
    sample,
    fs.statSync(sample).size,
  );
  assert.equal(sampleFeat.format, "pcm-wav");
  assert.ok(sampleFeat.durationMs > 200, "sample duration");
  assert.ok(sampleFeat.speechScore > 0.1, "sample should look like speech");
  const bounds = estimateWordBoundariesByEnergy(sample, 4, undefined, [
    "раз",
    "два",
    "три",
    "четыре",
  ]);
  assert.equal(bounds.length, 4);
  assert.ok(bounds[0]!.endMs > bounds[0]!.startMs);
  for (const b of bounds) {
    assert.ok(
      b.endMs - b.startMs >= Math.min(MIN_WORD_MS, 45) * 0.35,
      `word unit too tiny: ${b.endMs - b.startMs}ms`,
    );
  }
  const rel = relativeWordDurationWeights(["в", "гиперболоид", "и"]);
  assert.ok(rel[1]! > rel[0]! * 2, "long word should outweigh short particle");

  // Synthetic bursts with silence gaps: cuts should land in quiet valleys,
  // not mid-burst (old equal-energy mid-waveform chops).
  const burstPath = path.resolve(
    process.cwd(),
    "seed",
    "voice-studio",
    "_smoke-bursts.wav",
  );
  const writeWavMono = (filePath: string, sr: number, pcm: Buffer) => {
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sr, 24);
    header.writeUInt32LE(sr * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(pcm.length, 40);
    fs.writeFileSync(filePath, Buffer.concat([header, pcm]));
  };
  {
    const sr = 16000;
    const total = sr * 2; // 2s
    const pcm = Buffer.alloc(total * 2);
    const writeTone = (from: number, to: number, hz: number) => {
      for (let i = from; i < to; i++) {
        const t = i / sr;
        const env =
          i < from + 80
            ? (i - from) / 80
            : i > to - 80
              ? (to - i) / 80
              : 1;
        const s = Math.sin(2 * Math.PI * hz * t) * 0.45 * env;
        pcm.writeInt16LE((s * 32767) | 0, i * 2);
      }
    };
    // Three tone bursts (~0.35s) separated by ~0.25s silence.
    writeTone(0, Math.floor(sr * 0.35), 440);
    writeTone(Math.floor(sr * 0.6), Math.floor(sr * 0.95), 660);
    writeTone(Math.floor(sr * 1.2), Math.floor(sr * 1.55), 880);
    writeWavMono(burstPath, sr, pcm);
  }
  const burstBounds = estimateWordBoundariesByEnergy(burstPath, 3, undefined, [
    "один",
    "два",
    "три",
  ]);
  assert.equal(burstBounds.length, 3);
  // Internal cuts should sit in silence windows (~350–600ms and ~950–1200ms).
  assert.ok(
    burstBounds[0]!.endMs >= 300 && burstBounds[0]!.endMs <= 650,
    `cut0 in first silence, got ${burstBounds[0]!.endMs}`,
  );
  assert.ok(
    burstBounds[1]!.endMs >= 900 && burstBounds[1]!.endMs <= 1250,
    `cut1 in second silence, got ${burstBounds[1]!.endMs}`,
  );
  // Unequal text lengths: short + long + short against unequal burst energy
  // must not assign the long word a crumb mid-burst (0.1.4 equal-energy failure).
  const unevenPath = path.resolve(
    process.cwd(),
    "seed",
    "voice-studio",
    "_smoke-uneven.wav",
  );
  {
    const sr = 16000;
    const total = sr * 3;
    const pcm = Buffer.alloc(total * 2);
    const writeTone = (from: number, to: number, hz: number, amp = 0.4) => {
      for (let i = from; i < to; i++) {
        const t = i / sr;
        const env =
          i < from + 120
            ? (i - from) / 120
            : i > to - 120
              ? (to - i) / 120
              : 1;
        const s = Math.sin(2 * Math.PI * hz * t) * amp * env;
        pcm.writeInt16LE((s * 32767) | 0, i * 2);
      }
    };
    // Short loud · long quiet-ish · short loud, with clear silences.
    writeTone(0, Math.floor(sr * 0.28), 500, 0.5);
    writeTone(Math.floor(sr * 0.45), Math.floor(sr * 1.85), 220, 0.28);
    writeTone(Math.floor(sr * 2.05), Math.floor(sr * 2.4), 660, 0.5);
    writeWavMono(unevenPath, sr, pcm);
  }
  const unevenBounds = estimateWordBoundariesByEnergy(
    unevenPath,
    3,
    undefined,
    ["в", "путешествие", "да"],
  );
  assert.equal(unevenBounds.length, 3);
  const midDur = unevenBounds[1]!.endMs - unevenBounds[1]!.startMs;
  const short0 = unevenBounds[0]!.endMs - unevenBounds[0]!.startMs;
  assert.ok(
    midDur > short0 * 1.6,
    `long word should get longer span (${midDur} vs ${short0})`,
  );
  assert.ok(
    unevenBounds[0]!.endMs >= 250 && unevenBounds[0]!.endMs <= 520,
    `uneven cut0 in silence, got ${unevenBounds[0]!.endMs}`,
  );

  // Sliced unit edges must be near-zero after fade + zero-cross snap.
  const sliceOut = path.resolve(
    process.cwd(),
    "seed",
    "voice-studio",
    "_smoke-slice.wav",
  );
  assert.equal(
    sliceWavToFile(burstPath, sliceOut, 100, 400),
    true,
    "sliceWavToFile should succeed",
  );
  assert.equal(
    sliceWavToFile(burstPath, sliceOut + ".tiny.wav", 100, 130),
    false,
    "tiny/truncated crumb slices must be rejected",
  );
  {
    const info = parseWavInfo(sliceOut);
    assert.ok(info, "sliced wav header");
    const fd = fs.openSync(sliceOut, "r");
    try {
      const pcm = Buffer.alloc(info!.dataSize);
      fs.readSync(fd, pcm, 0, info!.dataSize, info!.dataOffset);
      const first = Math.abs(pcm.readInt16LE(0));
      const last = Math.abs(pcm.readInt16LE(info!.dataSize - 2));
      assert.ok(first < 800, `fade-in edge too hot: ${first}`);
      assert.ok(last < 800, `fade-out edge too hot: ${last}`);
    } finally {
      fs.closeSync(fd);
    }
  }

  // Stitch: RMS-matched overlap-add should not hard-click at the join.
  const stitchA = path.resolve(
    process.cwd(),
    "seed",
    "voice-studio",
    "_smoke-stitch-a.wav",
  );
  const stitchB = path.resolve(
    process.cwd(),
    "seed",
    "voice-studio",
    "_smoke-stitch-b.wav",
  );
  {
    const sr = 16000;
    const mk = (hz: number, amp: number, sec: number) => {
      const n = Math.floor(sr * sec);
      const pcm = Buffer.alloc(n * 2);
      for (let i = 0; i < n; i++) {
        const env =
          i < 200 ? i / 200 : i > n - 200 ? (n - i) / 200 : 1;
        const s = Math.sin(2 * Math.PI * hz * (i / sr)) * amp * env;
        pcm.writeInt16LE((s * 32767) | 0, i * 2);
      }
      return pcm;
    };
    writeWavMono(stitchA, sr, mk(440, 0.55, 0.35));
    writeWavMono(stitchB, sr, mk(554, 0.22, 0.35));
    const ia = parseWavInfo(stitchA)!;
    const ib = parseWavInfo(stitchB)!;
    const pa = Buffer.alloc(ia.dataSize);
    const pb = Buffer.alloc(ib.dataSize);
    const fda = fs.openSync(stitchA, "r");
    const fdb = fs.openSync(stitchB, "r");
    try {
      fs.readSync(fda, pa, 0, pa.length, ia.dataOffset);
      fs.readSync(fdb, pb, 0, pb.length, ib.dataOffset);
    } finally {
      fs.closeSync(fda);
      fs.closeSync(fdb);
    }
    const stitched = stitchPcmInt16OverlapAdd([
      { pcm: pa, sampleRate: ia.sampleRate, channels: ia.channels },
      { pcm: pb, sampleRate: ib.sampleRate, channels: ib.channels },
    ]);
    assert.ok(stitched, "stitch overlap-add must return PCM");
    const mid = Math.floor(stitched!.pcm.length / 4);
    const joinRms = pcmInt16Rms(stitched!.pcm, 1, mid - 80, 160);
    assert.ok(
      joinRms < 0.55,
      `join should not spike after RMS match + OLA, rms=${joinRms}`,
    );
    assert.ok(
      stitched!.pcm.length / 2 >
        (pa.length + pb.length) / 2 - sr * 0.08,
      "stitched length should keep most of both units",
    );
  }

  // Compressed → PCM path (user m4a / AyuGram clips). Requires ffmpeg on PATH
  // (CI installs it; local runs need `ffmpeg` or the assertion fails clearly).
  const m4aPath = path.resolve(
    process.cwd(),
    "seed",
    "voice-studio",
    "_smoke-clip.m4a",
  );
  const m4aWav = path.resolve(
    process.cwd(),
    "seed",
    "voice-studio",
    "_smoke-clip.pcm16.wav",
  );
  const ffmpegAvailable = (() => {
    try {
      execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
      return true;
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: unknown }).code)
          : "";
      return code !== "ENOENT" && code !== "ENOTFOUND";
    }
  })();
  assert.ok(
    ffmpegAvailable,
    "ffmpeg is required for p9 m4a→wav compressed-import smoke; install ffmpeg (CI apt step) or add it to PATH",
  );
  try {
    try {
      execFileSync(
        "ffmpeg",
        [
          "-y",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=500:duration=0.6",
          "-c:a",
          "aac",
          m4aPath,
        ],
        { stdio: "ignore" },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `ffmpeg failed to generate smoke m4a seed (compressed-import path): ${msg}`,
      );
    }
    const converted = convertAudioToPcmWav(m4aPath, m4aWav);
    assert.ok(converted, "ffmpeg m4a→wav conversion must succeed");
    assert.ok(parseWavInfo(converted!), "converted must be PCM wav");
  } finally {
    for (const p of [
      burstPath,
      unevenPath,
      sliceOut,
      `${sliceOut}.tiny.wav`,
      stitchA,
      stitchB,
      m4aPath,
      m4aWav,
    ]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }

  // Mel spectrogram pipeline (FFT → filterbank).
  const mel = extractMelFromWav(sample);
  assert.ok(mel, "mel from sample wav");
  assert.ok(mel!.frameCount >= 1, "mel frames");
  assert.equal(mel!.nMels, 40);
  const melSum = melToSummary(mel!);
  assert.ok(melSum.preview.length >= 1);
  assert.ok(melL1(mel!, mel!) < 1e-6, "identical mel L1 ~ 0");
  assert.ok(NEURAL_TTS_CURRICULUM.length >= 10, "curriculum rows");
  assert.ok(
    NEURAL_TTS_CURRICULUM.every((r) => r.status === "mapped"),
    "curriculum must not leave proxy/deferred rows",
  );
  assert.ok(
    textAudioMismatch("один два три четыре пять шесть семь восемь девять десять", 200)
      .length > 0,
    "short clip vs long text should warn",
  );
  assert.ok(Array.isArray(noiseLikeness(sampleFeat)));

  // Near-silent WAV must fail hard QA (not accepted into train corpus).
  const silentPath = path.resolve(
    process.cwd(),
    "seed",
    "voice-studio",
    "_smoke-silent.wav",
  );
  {
    const sr = 16000;
    const samples = sr; // 1s
    const dataSize = samples * 2;
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sr, 24);
    header.writeUInt32LE(sr * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(dataSize, 40);
    fs.writeFileSync(silentPath, Buffer.concat([header, Buffer.alloc(dataSize)]));
  }
  const silentProject = createVoiceProject({
    name: "Silent QA",
    lang: "ru-RU",
  });
  const silentPhrase = addCustomPhrase(silentProject.id, "Проверка тишины.");
  const silentImport = importClip({
    projectId: silentProject.id,
    sourcePath: silentPath,
    phraseId: silentPhrase.id,
  });
  assert.equal(
    silentImport.processed.project.status,
    "needs_data",
    "silent clip must fail QA",
  );
  try {
    fs.unlinkSync(silentPath);
  } catch {
    /* ignore */
  }

  const phrases = listPhrases(project.id);
  for (let i = 0; i < 3; i++) {
    const imported = importClip({
      projectId: project.id,
      sourcePath: sample,
      phraseId: phrases[i]?.id,
    });
    assert.equal(imported.processed.voice, null, "train is explicit");
    assert.ok(
      ["collecting", "ready_to_train", "processing", "needs_data"].includes(
        imported.processed.project.status,
      ),
    );
  }

  // Unlinked-only corpus must not train
  const unlinkedProject = createVoiceProject({ name: "Unlinked", lang: "ru-RU" });
  for (let i = 0; i < 3; i++) {
    importClip({
      projectId: unlinkedProject.id,
      sourcePath: sample,
      phraseId: null,
    });
  }
  const progressLog: string[] = [];
  const trainBlocked = await trainVoiceModel(unlinkedProject.id);
  assert.equal(
    trainBlocked.report.ok,
    false,
    "train without phrases/links must fail",
  );
  assert.equal(trainBlocked.voice, null);

  const lossLog: number[] = [];
  const trained = await trainVoiceModel(project.id, (ev) => {
    progressLog.push(`${ev.step}:${ev.pct}`);
    if (ev.step === "epochs" && typeof ev.loss === "number") {
      lossLog.push(ev.loss);
    }
  });
  assert.ok(trained.report.ok, trained.report.detail);
  assert.ok(trained.voice, "custom voice not built");
  assert.ok(trained.project.custom_voice_id, "project missing custom_voice_id");
  assert.ok(trained.project.llm_profile, "llm profile missing");
  assert.ok(["ready", "ready_partial"].includes(trained.project.status));
  assert.ok(trained.report.linkedAccepted >= 3);
  assert.ok(
    (trained.report.steps?.length ?? 0) >= 4,
    "train should emit multi-step progress",
  );
  assert.ok(
    progressLog.some((s) => s.startsWith("features:")),
    "train progress should include audio features step",
  );
  assert.ok(
    progressLog.some((s) => s.startsWith("segment:")),
    "train progress callback should receive segment/align step",
  );
  assert.ok(
    progressLog.some((s) => s.startsWith("epochs:")),
    "train progress should include mel epoch/loss step",
  );
  assert.ok(
    (trained.report.epochs ?? 0) >= 2,
    "report should include epochs",
  );
  assert.ok(
    typeof trained.report.finalLoss === "number",
    "report should include finalLoss",
  );
  assert.ok(
    (trained.report.melTargets ?? 0) >= 1,
    "mel targets extracted from wav clips",
  );
  assert.ok(
    (trained.report.curriculum?.length ?? 0) >= 10,
    "curriculum mapping in report",
  );
  assert.ok(lossLog.length >= 1, "epoch progress should emit loss numbers");
  const trainMeta = JSON.parse(trained.voice!.meta_json ?? "{}") as {
    engine?: string;
    method?: string;
    neuralTts?: boolean;
    packDir?: string;
    wordUnitCount?: number;
    unitCount?: number;
    epochs?: number;
    finalLoss?: number;
  };
  assert.equal(trainMeta.engine, "mira-voice-pack-v1");
  assert.equal(trainMeta.method, "neural-mel-cpu-v1");
  assert.equal(trainMeta.neuralTts, true);
  assert.ok(trainMeta.packDir, "model pack dir missing");
  assert.ok(
    (trainMeta.wordUnitCount ?? 0) + (trainMeta.unitCount ?? 0) > 0,
    "trained pack should contain segmented units",
  );
  assert.ok(
    fs.existsSync(path.join(trainMeta.packDir!, "model-pack.json")),
    "model-pack.json should exist after train",
  );
  assert.ok(
    fs.existsSync(path.join(trainMeta.packDir!, "train-metrics.json")),
    "train-metrics.json should exist after mel epochs",
  );
  assert.ok(
    fs.existsSync(path.join(trainMeta.packDir!, "mel-features")),
    "mel-features dir should exist",
  );
  assert.ok(
    fs.existsSync(path.join(trainMeta.packDir!, "neural-weights.json")),
    "neural-weights.json should exist after neural train",
  );
  const curriculumStatuses = (trained.report.curriculum ?? []).map(
    (r) => r.status,
  );
  assert.ok(
    curriculumStatuses.every((s) => s === "mapped"),
    "all curriculum rows should be mapped (no proxy/deferred left)",
  );
  assert.ok(
    (trained.report.neuralTts ?? trainMeta.neuralTts) === true,
    "report should mark neuralTts",
  );
  assert.ok(
    (trained.report.wordUnitCount ?? 0) > 0,
    "report should include word unit count",
  );
  assert.ok(
    (trained.report.lexiconSize ?? 0) >= (trained.report.audioLexiconSize ?? 0),
    "lexicon includes audio + provisional words",
  );
  const lexiconBefore = trained.report.lexiconSize ?? 0;
  assert.ok(
    (trained.report.provisionalLexiconSize ?? 0) > 0 ||
      (trained.report.lexiconSize ?? 0) >
        (trained.report.audioLexiconSize ?? 0),
    "unrecorded generated texts should contribute provisional lexicon entries",
  );

  // Novel unrecorded words must enlarge lexicon on retrain.
  addCustomPhrase(
    project.id,
    "Ксилофонный квазарный гиперболоид флуктуационно телепортирует зигзагообразный псевдоним.",
  );
  const afterNovel = await trainVoiceModel(project.id);
  assert.ok(afterNovel.report.ok, afterNovel.report.detail);
  assert.ok(
    (afterNovel.report.lexiconSize ?? 0) > lexiconBefore,
    `lexicon should grow after novel text: ${lexiconBefore} → ${afterNovel.report.lexiconSize}`,
  );

  // retrain after another clip keeps stable voice id
  importClip({
    projectId: project.id,
    sourcePath: sample,
    phraseId: phrases[3]?.id,
  });
  const again = await trainVoiceModel(project.id);
  assert.equal(
    again.voice?.id,
    trained.voice!.id,
    "voice id should be stable on retrain",
  );

  const catalog = listCustomVoices();
  assert.ok(catalog.some((v) => v.id === trained.voice!.id));

  const corpus = getCustomVoiceCorpus(trained.voice!.id);
  assert.equal(corpus.voice.id, trained.voice!.id);
  assert.ok(
    corpus.units.length >= 3,
    "trained voice corpus should expose accepted phrase clips",
  );

  // Neural inference path must produce a WAV.
  const synth = synthesizeCustomVoiceNeural(
    trained.voice!.id,
    "Проверка нейро синтеза.",
  );
  assert.equal(synth.ok, true, synth.detail);
  assert.ok(synth.wavPath && fs.existsSync(synth.wavPath), "neural wav");
  assert.equal(synth.method, "neural-mel-cpu-v1");

  // RLHF preference loop (A/B) when previews exist.
  const prefs = getVoicePreferenceCandidates(trained.voice!.id);
  if (prefs.aPath && prefs.bPath) {
    const pref = submitVoicePreference({
      voiceId: trained.voice!.id,
      preferred: "a",
      text: prefs.sampleText,
    });
    assert.equal(pref.ok, true, pref.detail);
    assert.equal(pref.pair.preferred, "a");
    assert.ok(
      Number.isFinite(pref.lossBefore) && Number.isFinite(pref.lossAfter),
      "preference losses recorded",
    );
    // Preference is always persisted; neural nudge must not explode loss.
    assert.ok(
      pref.lossAfter <= pref.lossBefore + 0.5,
      `preference applied (loss ${pref.lossBefore}→${pref.lossAfter})`,
    );
  }

  // «Перезагрузить»: drop audio, keep phrase text in corpus, prune pack units.
  const reloadTarget = phrases[0]!;
  const clipsBeforeReload = listClips(project.id).filter(
    (c) => c.phrase_id === reloadTarget.id,
  ).length;
  assert.ok(clipsBeforeReload >= 1, "reload target should have linked clips");
  const unitsBeforeReload = corpus.units.filter(
    (u) => u.phraseId === reloadTarget.id,
  ).length;
  assert.ok(unitsBeforeReload >= 1, "pack/corpus should expose reload target");
  const reset = resetVoicePhraseAudio(reloadTarget.id);
  assert.equal(reset.ok, true, reset.detail);
  assert.equal(reset.phraseId, reloadTarget.id);
  assert.ok(reset.deletedClips >= 1);
  assert.equal(reset.needsRebuild, true);
  const afterReload = listPhrases(project.id).find(
    (p) => p.id === reloadTarget.id,
  );
  assert.ok(afterReload, "phrase text must stay in permanent corpus");
  assert.equal(afterReload!.recorded, 0, "phrase should be unrecorded");
  assert.equal(
    listClips(project.id).some((c) => c.phrase_id === reloadTarget.id),
    false,
    "clips for reloaded phrase must be gone",
  );
  const corpusAfterReload = getCustomVoiceCorpus(trained.voice!.id);
  assert.equal(
    corpusAfterReload.units.some((u) => u.phraseId === reloadTarget.id),
    false,
    "model pack / corpus must not keep orphaned units for reloaded phrase",
  );

  const snap = getStudioSnapshot(project.id);
  assert.ok(snap.phrases.length >= 6);
  assert.ok(snap.clips.length >= 2);
  assert.ok(snap.project?.recommendation);

  // path allowlist
  let blocked = false;
  try {
    importClip({
      projectId: project.id,
      sourcePath: "/etc/passwd",
    });
  } catch {
    blocked = true;
  }
  assert.equal(blocked, true);

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectId: project.id,
        phrases: snap.phrases.length,
        clips: snap.clips.length,
        customVoiceId: trained.voice!.id,
        status: again.project.status,
        recommendation: again.project.recommendation,
        report: again.report,
      },
      null,
      2,
    ),
  );
  closeStore();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
