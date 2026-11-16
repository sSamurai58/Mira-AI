/**
 * TokenStore — persistent T0–T3 (+ vocab) under voice-studio project.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { extractMelFromWav } from "../melSpectrogram";
import {
  buildCodebookFromWavs,
  encodeMelToTokens,
  loadCodebook,
  saveCodebook,
  type AcousticCodebook,
} from "./acousticCodec";
import { g2pRussian, phonemeCoverage, type PhonemeToken } from "./g2pRu";
import {
  buildProsodyPlan,
  encodeProsodyBinary,
  type ProsodyPlan,
} from "./prosody";
import { normalizeSpeechText } from "./textNormalize";

export type UtteranceMeta = {
  id: string;
  textRaw: string;
  textNorm: string;
  lang: string;
  clipPath?: string;
  createdAt: string;
  qa?: Record<string, number | string | boolean>;
  phonemeCount: number;
  acousticFrames?: number;
  vocabRev?: string;
};

export type TokenizeUtteranceResult = {
  utteranceId: string;
  meta: UtteranceMeta;
  tokens: PhonemeToken[];
  prosody: ProsodyPlan;
  coverage: { symbol: string; count: number }[];
  acousticTokens?: number;
};

function tokensRoot(projectRoot: string): string {
  return path.join(projectRoot, "tokens");
}

export function ensureTokenStore(projectRoot: string): string {
  const root = tokensRoot(projectRoot);
  fs.mkdirSync(path.join(root, "utterances"), { recursive: true });
  const vocabPath = path.join(root, "vocab.json");
  if (!fs.existsSync(vocabPath)) {
    fs.writeFileSync(
      vocabPath,
      JSON.stringify(
        {
          version: 1,
          vocabRev: "bootstrap",
          phonemes: "g2p-ru-v1",
          acoustic: null,
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );
  }
  return root;
}

function utteranceIdFor(text: string, clipPath?: string): string {
  return crypto
    .createHash("sha1")
    .update(`${clipPath ?? ""}|${text.trim()}`)
    .digest("hex")
    .slice(0, 16);
}

export function tokenizeAndStoreUtterance(opts: {
  projectRoot: string;
  text: string;
  clipPath?: string;
  prosody?: {
    speed?: number;
    pauseScale?: number;
    energy?: number;
    pitchBiasSemitones?: number;
    instruct?: string;
    seed?: number;
  };
  writeAcoustic?: boolean;
}): TokenizeUtteranceResult {
  const root = ensureTokenStore(opts.projectRoot);
  const norm = normalizeSpeechText(opts.text);
  const tokens = g2pRussian(norm.text);
  const prosody = buildProsodyPlan(tokens, opts.prosody);
  const id = utteranceIdFor(norm.text, opts.clipPath);
  const dir = path.join(root, "utterances", id);
  fs.mkdirSync(dir, { recursive: true });

  const meta: UtteranceMeta = {
    id,
    textRaw: opts.text,
    textNorm: norm.text,
    lang: "ru",
    clipPath: opts.clipPath,
    createdAt: new Date().toISOString(),
    phonemeCount: tokens.length,
  };

  // T1
  const t1 = {
    symbols: tokens.map((t) => t.symbol),
    ids: tokens.map((t) => t.id),
    stressed: tokens.map((t) => (t.stressed ? 1 : 0)),
  };
  fs.writeFileSync(path.join(dir, "t1.phonemes.json"), JSON.stringify(t1));

  // T2
  fs.writeFileSync(path.join(dir, "t2.prosody.bin"), encodeProsodyBinary(prosody));
  if (opts.prosody?.instruct) {
    fs.writeFileSync(
      path.join(dir, "t2.instruct.txt"),
      opts.prosody.instruct,
      "utf8",
    );
  }

  // T3 optional
  let acousticTokens: number | undefined;
  if (opts.writeAcoustic && opts.clipPath && fs.existsSync(opts.clipPath)) {
    let book = loadCodebook(path.join(root, "codebook.json"));
    if (!book) {
      book = buildCodebookFromWavs([opts.clipPath]);
      if (book) saveCodebook(path.join(root, "codebook.json"), book);
    }
    if (book) {
      const mel = extractMelFromWav(opts.clipPath);
      if (mel) {
        const codes = encodeMelToTokens(mel, book);
        fs.writeFileSync(path.join(dir, "t3.codec.u16"), Buffer.from(codes.buffer));
        acousticTokens = codes.length;
        meta.acousticFrames = codes.length;
        meta.vocabRev = book.vocabRev;
        // Update vocab pointer
        const vocabPath = path.join(root, "vocab.json");
        try {
          const v = JSON.parse(fs.readFileSync(vocabPath, "utf8")) as Record<
            string,
            unknown
          >;
          v.acoustic = { vocabRev: book.vocabRev, size: book.size };
          v.vocabRev = book.vocabRev;
          fs.writeFileSync(vocabPath, JSON.stringify(v, null, 2));
        } catch {
          /* ignore */
        }
      }
    }
  }

  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));

  return {
    utteranceId: id,
    meta,
    tokens,
    prosody,
    coverage: phonemeCoverage(tokens),
    acousticTokens,
  };
}

export function buildProjectAcousticCodebook(
  projectRoot: string,
  wavPaths: string[],
): AcousticCodebook | null {
  const root = ensureTokenStore(projectRoot);
  const book = buildCodebookFromWavs(wavPaths);
  if (!book) return null;
  saveCodebook(path.join(root, "codebook.json"), book);
  const vocabPath = path.join(root, "vocab.json");
  try {
    const v = JSON.parse(fs.readFileSync(vocabPath, "utf8")) as Record<
      string,
      unknown
    >;
    v.acoustic = { vocabRev: book.vocabRev, size: book.size };
    v.vocabRev = book.vocabRev;
    fs.writeFileSync(vocabPath, JSON.stringify(v, null, 2));
  } catch {
    /* ignore */
  }
  return book;
}

export function listStoredUtterances(projectRoot: string): UtteranceMeta[] {
  const dir = path.join(tokensRoot(projectRoot), "utterances");
  if (!fs.existsSync(dir)) return [];
  const out: UtteranceMeta[] = [];
  for (const name of fs.readdirSync(dir)) {
    const metaPath = path.join(dir, name, "meta.json");
    if (!fs.existsSync(metaPath)) continue;
    try {
      out.push(JSON.parse(fs.readFileSync(metaPath, "utf8")) as UtteranceMeta);
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function projectTokenCoverage(projectRoot: string): {
  utterances: number;
  symbolCounts: { symbol: string; count: number }[];
} {
  const utts = listStoredUtterances(projectRoot);
  const map = new Map<string, number>();
  for (const u of utts) {
    const t1Path = path.join(
      tokensRoot(projectRoot),
      "utterances",
      u.id,
      "t1.phonemes.json",
    );
    if (!fs.existsSync(t1Path)) continue;
    try {
      const t1 = JSON.parse(fs.readFileSync(t1Path, "utf8")) as {
        symbols: string[];
      };
      for (const s of t1.symbols) {
        if (s.startsWith("<")) continue;
        map.set(s, (map.get(s) ?? 0) + 1);
      }
    } catch {
      /* skip */
    }
  }
  return {
    utterances: utts.length,
    symbolCounts: [...map.entries()]
      .map(([symbol, count]) => ({ symbol, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/** Export FT pairs: corpus/pairs/*.wav + *.txt (SpeechT5 dataset shape). */
export function exportFineTunePairs(
  projectRoot: string,
  pairs: Array<{ wavPath: string; text: string }>,
): { dir: string; count: number } {
  const dir = path.join(projectRoot, "corpus", "pairs");
  fs.mkdirSync(dir, { recursive: true });
  let count = 0;
  for (const p of pairs) {
    if (!fs.existsSync(p.wavPath)) continue;
    const norm = normalizeSpeechText(p.text).text;
    if (!norm) continue;
    const id = utteranceIdFor(norm, p.wavPath);
    const wavOut = path.join(dir, `${id}.wav`);
    const txtOut = path.join(dir, `${id}.txt`);
    fs.copyFileSync(p.wavPath, wavOut);
    fs.writeFileSync(txtOut, norm, "utf8");
    count += 1;
  }
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify(
      {
        version: 1,
        count,
        columns: ["audio", "transcription"],
        sampleRateHintHz: 16000,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  return { dir, count };
}
