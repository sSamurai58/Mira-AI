export type PdfExtractResult = {
  text: string;
  pages: number;
  engine: "pdfjs" | "pdfjs+ocr" | "legacy" | "none";
  note: string;
};

const MAX_PAGES = 40;
const MAX_CHARS = 50_000;
const MAX_OCR_IMAGES = 4;

function normalizeExtracted(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Heuristic: human-readable language text (not binary noise). */
export function isReadablePdfText(text: string): boolean {
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length < 8) return false;
  if (/^\[pdf\]/i.test(s)) return false;
  const words = s.match(/[A-Za-zА-Яа-яЁё]{3,}/g) ?? [];
  const wordChars = words.join("").length;
  const letters = (s.match(/[A-Za-zА-Яа-яЁё]/g) ?? []).length;
  // Short extracts (title pages / smoke PDFs): require clear word tokens
  if (s.length < 24) {
    return words.length >= 2 && letters / s.length >= 0.55;
  }
  if (letters / s.length < 0.35) return false;
  if (wordChars / s.length < 0.28) return false;
  return true;
}

/** Pull embedded JPEG page images (common in scanned PDFs). */
export function extractEmbeddedJpegs(buf: Buffer, limit = MAX_OCR_IMAGES): Buffer[] {
  const out: Buffer[] = [];
  for (let i = 0; i < buf.length - 1 && out.length < limit; ) {
    if (buf[i] === 0xff && buf[i + 1] === 0xd8) {
      let j = i + 2;
      while (j < buf.length - 1) {
        if (buf[j] === 0xff && buf[j + 1] === 0xd9) {
          const slice = buf.subarray(i, j + 2);
          // Skip tiny icons / noise
          if (slice.byteLength >= 8_000) out.push(Buffer.from(slice));
          i = j + 2;
          break;
        }
        j += 1;
      }
      if (j >= buf.length - 1) break;
    } else {
      i += 1;
    }
  }
  return out;
}

async function extractWithPdfJs(buf: Buffer): Promise<{
  text: string;
  pages: number;
}> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Main-thread parse in Electron main (asar workers are unreliable).
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = "";
  } catch {
    /* ignore */
  }

  const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;

  const totalPages = doc.numPages;
  const limit = Math.min(totalPages, MAX_PAGES);
  const parts: string[] = [];
  for (let n = 1; n <= limit; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const line = content.items
      .map((it: unknown) =>
        it &&
        typeof it === "object" &&
        "str" in it &&
        typeof (it as { str: unknown }).str === "string"
          ? (it as { str: string }).str
          : "",
      )
      .filter(Boolean)
      .join(" ");
    if (line.trim()) parts.push(line.trim());
  }
  try {
    await doc.destroy();
  } catch {
    /* ignore */
  }
  return { text: normalizeExtracted(parts.join("\n\n")), pages: totalPages };
}

async function ocrJpegBuffers(images: Buffer[]): Promise<string> {
  if (!images.length) return "";
  const Tesseract = await import("tesseract.js");
  const parts: string[] = [];
  // rus+eng covers Mira's primary locales; fall back to eng if lang pack fails.
  const langs = ["rus+eng", "eng"];
  for (const img of images) {
    let ok = false;
    for (const lang of langs) {
      try {
        const res = await Tesseract.recognize(img, lang, {
          logger: () => undefined,
        });
        const text = normalizeExtracted(res.data.text || "");
        if (text.length >= 12) {
          parts.push(text);
          ok = true;
          break;
        }
      } catch {
        /* try next lang */
      }
    }
    if (!ok) {
      // continue other pages
    }
  }
  return normalizeExtracted(parts.join("\n\n"));
}

/** Legacy regex scrape — last resort for tiny synthetic PDFs in smoke tests. */
export function extractPdfTextLegacy(buf: Buffer): string {
  const latin = buf.toString("latin1");
  const chunks: string[] = [];
  const tjRe = /\((?:\\.|[^\\)]){1,500}\)(?:\s*Tj|\s*TJ)/g;
  let m: RegExpExecArray | null;
  while ((m = tjRe.exec(latin)) && chunks.length < 4000) {
    const inner = m[0]
      .replace(/\)\s*T[jJ]$/, "")
      .replace(/^\(/, "")
      .replace(/\\([0-7]{1,3})/g, (_, oct: string) =>
        String.fromCharCode(Number.parseInt(oct, 8) & 0xff),
      )
      .replace(/\\([nrtbf()\\])/g, (_, c: string) => {
        if (c === "n") return "\n";
        if (c === "r") return "\r";
        if (c === "t") return "\t";
        return c;
      });
    if (inner.trim()) chunks.push(inner);
  }
  return normalizeExtracted(chunks.join(" "));
}

/**
 * Read a PDF buffer: pdf.js text layer first, then OCR on embedded JPEGs
 * for scanned documents, then legacy scrape.
 */
export async function extractPdfBuffer(buf: Buffer): Promise<PdfExtractResult> {
  // 1) pdf.js text layer
  try {
    const { text, pages } = await extractWithPdfJs(buf);
    if (isReadablePdfText(text)) {
      return {
        text: text.slice(0, MAX_CHARS),
        pages,
        engine: "pdfjs",
        note: `pdf.js · ${pages} стр. · ~${text.length} символов`,
      };
    }
    // 2) OCR embedded page images (scans)
    const jpegs = extractEmbeddedJpegs(buf);
    if (jpegs.length) {
      const ocr = await ocrJpegBuffers(jpegs);
      if (isReadablePdfText(ocr) || ocr.length > 40) {
        const merged = normalizeExtracted([text, ocr].filter(Boolean).join("\n\n"));
        return {
          text: merged.slice(0, MAX_CHARS),
          pages,
          engine: "pdfjs+ocr",
          note: `pdf.js + OCR (${jpegs.length} изобр.) · ~${merged.length} символов`,
        };
      }
    }
    if (text.length > 40) {
      return {
        text: text.slice(0, MAX_CHARS),
        pages,
        engine: "pdfjs",
        note: `pdf.js · слабый текстовый слой (~${text.length} символов)`,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // fall through to legacy — keep detail for note if legacy also empty
    if (process.env.MIRA_DEBUG_PDF === "1") {
      console.warn("[mira] pdfjs extract failed:", message);
    }
  }

  // 3) legacy scrape (smoke / odd files)
  const legacy = extractPdfTextLegacy(buf);
  if (legacy.length > 8) {
    return {
      text: legacy.slice(0, MAX_CHARS),
      pages: 0,
      engine: "legacy",
      note: `legacy scrape · ~${legacy.length} символов`,
    };
  }

  return {
    text: "",
    pages: 0,
    engine: "none",
    note: "pdf: no readable text layer and OCR found nothing",
  };
}
