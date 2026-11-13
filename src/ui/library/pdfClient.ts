/**
 * Browser/Electron-renderer PDF read + light OCR.
 * Uses pdf.js for the text layer; if empty, renders first pages to canvas
 * and runs tesseract.js (rus+eng).
 */

export type ClientPdfExtract = {
  text: string;
  pages: number;
  engine: "pdfjs" | "pdfjs+ocr" | "none";
  note: string;
};

const MAX_PAGES = 30;
const MAX_OCR_PAGES = 3;
const MAX_CHARS = 50_000;

function normalize(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function looksReadable(text: string): boolean {
  const s = normalize(text);
  if (s.length < 8) return false;
  const words = s.match(/[A-Za-zА-Яа-яЁё]{3,}/g) ?? [];
  const letters = (s.match(/[A-Za-zА-Яа-яЁё]/g) ?? []).length;
  if (s.length < 24) return words.length >= 2 && letters / s.length >= 0.55;
  return letters / s.length >= 0.35 && words.join("").length / s.length >= 0.28;
}

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  } catch {
    // Main-thread parse still works if worker URL cannot be resolved.
  }
  return pdfjs;
}

async function ocrCanvas(
  canvas: HTMLCanvasElement,
): Promise<string> {
  const Tesseract = await import("tesseract.js");
  const dataUrl = canvas.toDataURL("image/png");
  for (const lang of ["rus+eng", "eng"] as const) {
    try {
      const res = await Tesseract.recognize(dataUrl, lang, {
        logger: () => undefined,
      });
      const text = normalize(res.data.text || "");
      if (text.length >= 12) return text;
    } catch {
      /* next lang */
    }
  }
  return "";
}

/** Extract text from a PDF File / ArrayBuffer in the renderer. */
export async function extractPdfInBrowser(
  input: File | ArrayBuffer | Uint8Array,
): Promise<ClientPdfExtract> {
  const buf =
    input instanceof File
      ? new Uint8Array(await input.arrayBuffer())
      : input instanceof ArrayBuffer
        ? new Uint8Array(input)
        : input;

  try {
    const pdfjs = await loadPdfJs();
    const doc = await pdfjs.getDocument({
      data: buf,
      useSystemFonts: true,
      isEvalSupported: false,
      verbosity: 0,
    }).promise;
    const total = doc.numPages;
    const limit = Math.min(total, MAX_PAGES);
    const parts: string[] = [];
    for (let n = 1; n <= limit; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const line = content.items
        .map((it) =>
          it && typeof it === "object" && "str" in it && typeof it.str === "string"
            ? it.str
            : "",
        )
        .filter(Boolean)
        .join(" ");
      if (line.trim()) parts.push(line.trim());
    }
    let text = normalize(parts.join("\n\n"));

    if (!looksReadable(text)) {
      const ocrParts: string[] = [];
      const ocrLimit = Math.min(total, MAX_OCR_PAGES);
      for (let n = 1; n <= ocrLimit; n += 1) {
        const page = await doc.getPage(n);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport }).promise;
        const piece = await ocrCanvas(canvas);
        if (piece) ocrParts.push(piece);
      }
      const ocrText = normalize(ocrParts.join("\n\n"));
      if (looksReadable(ocrText) || ocrText.length > 40) {
        text = normalize([text, ocrText].filter(Boolean).join("\n\n"));
        await doc.destroy();
        return {
          text: text.slice(0, MAX_CHARS),
          pages: total,
          engine: "pdfjs+ocr",
          note: `pdf.js + OCR · ${total} стр.`,
        };
      }
    }

    await doc.destroy();
    if (looksReadable(text) || text.length > 40) {
      return {
        text: text.slice(0, MAX_CHARS),
        pages: total,
        engine: "pdfjs",
        note: `pdf.js · ${total} стр. · ~${text.length} символов`,
      };
    }
    return {
      text: "",
      pages: total,
      engine: "none",
      note: "PDF без читаемого текста (нужен текстовый слой или чёткий скан)",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      text: "",
      pages: 0,
      engine: "none",
      note: `PDF parse failed: ${message.slice(0, 120)}`,
    };
  }
}
