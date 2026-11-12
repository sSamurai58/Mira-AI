/** Chat composer attachments (files + optional learn-import). */

export const MAX_CHAT_ATTACHMENTS = 8;
export const MAX_CHAT_FILE_BYTES = 8_000_000;
export const MAX_TEXT_EXTRACT_CHARS = 40_000;

export type ChatAttachmentKind = "text" | "image" | "pdf" | "audio" | "video" | "binary";

export type PendingChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: ChatAttachmentKind;
  /** Extracted UTF-8 text for text-like files */
  text?: string;
  /** Base64 (no data: prefix) for images / binary context */
  dataBase64?: string;
};

export type ChatAttachmentPayload = {
  name: string;
  mimeType: string;
  size: number;
  kind: ChatAttachmentKind;
  text?: string;
  dataBase64?: string;
};

const TEXT_EXT = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".csv",
  ".tsv",
  ".xml",
  ".html",
  ".htm",
  ".css",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".rs",
  ".go",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".env",
  ".sh",
  ".sql",
  ".log",
  ".rtf",
]);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function detectAttachmentKind(
  name: string,
  mimeType: string,
): ChatAttachmentKind {
  const mime = (mimeType || "").toLowerCase();
  const ext = extOf(name);
  if (mime.startsWith("image/") || [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"].includes(ext)) {
    return "image";
  }
  if (mime === "application/pdf" || ext === ".pdf") return "pdf";
  if (mime.startsWith("audio/") || [".mp3", ".wav", ".m4a", ".ogg", ".flac"].includes(ext)) {
    return "audio";
  }
  if (mime.startsWith("video/") || [".mp4", ".webm", ".mkv", ".mov"].includes(ext)) {
    return "video";
  }
  if (
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("xml") ||
    mime.includes("javascript") ||
    TEXT_EXT.has(ext)
  ) {
    return "text";
  }
  return "binary";
}

export function formatAttachmentsForPrompt(
  text: string,
  attachments: ChatAttachmentPayload[],
): string {
  const trimmed = text.trim();
  if (!attachments.length) return trimmed;
  const parts: string[] = [];
  if (trimmed) parts.push(trimmed);
  else parts.push("Смотри прикреплённые файлы.");
  parts.push("");
  parts.push(`[Вложения: ${attachments.length}]`);
  for (const a of attachments) {
    parts.push(`--- файл: ${a.name} (${a.kind}, ${a.size} B) ---`);
    if (a.kind === "image") {
      parts.push("(изображение передано модели через vision, если доступно)");
    } else if (a.text?.trim()) {
      parts.push(a.text.trim().slice(0, MAX_TEXT_EXTRACT_CHARS));
    } else if (a.kind === "pdf") {
      parts.push(
        a.text?.trim() ||
          "(PDF: текст не извлечён — файл без текстового слоя или OCR не справился)",
      );
    } else {
      parts.push(`(бинарный файл «${a.name}», содержимое не извлечено в чат)`);
    }
  }
  return parts.join("\n");
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsText(file);
  });
}

export async function fileToPendingAttachment(
  file: File,
): Promise<PendingChatAttachment> {
  if (file.size > MAX_CHAT_FILE_BYTES) {
    throw new Error(
      `«${file.name}» слишком большой (${file.size} B). Лимит ${MAX_CHAT_FILE_BYTES} B.`,
    );
  }
  const kind = detectAttachmentKind(file.name, file.type);
  const base: PendingChatAttachment = {
    id: crypto.randomUUID(),
    name: file.name || "file",
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    kind,
  };
  if (kind === "text") {
    const text = (await readAsText(file)).slice(0, MAX_TEXT_EXTRACT_CHARS);
    return { ...base, text };
  }
  if (kind === "image") {
    const dataUrl = await readAsDataUrl(file);
    const dataBase64 = dataUrl.includes(",")
      ? dataUrl.split(",")[1] ?? ""
      : dataUrl;
    return { ...base, dataBase64 };
  }
  if (kind === "pdf") {
    const dataUrl = await readAsDataUrl(file);
    const dataBase64 = dataUrl.includes(",")
      ? dataUrl.split(",")[1] ?? ""
      : dataUrl;
    try {
      const { extractPdfInBrowser } = await import("../library/pdfClient");
      const extracted = await extractPdfInBrowser(file);
      return {
        ...base,
        dataBase64,
        text: extracted.text
          ? extracted.text.slice(0, MAX_TEXT_EXTRACT_CHARS)
          : undefined,
      };
    } catch {
      return { ...base, dataBase64 };
    }
  }
  // audio / video / binary: keep metadata; optional base64 for electron import
  if (kind === "binary") {
    const dataUrl = await readAsDataUrl(file);
    const dataBase64 = dataUrl.includes(",")
      ? dataUrl.split(",")[1] ?? ""
      : dataUrl;
    return { ...base, dataBase64 };
  }
  return base;
}

export async function filesToPendingAttachments(
  files: FileList | File[],
  existingCount: number,
): Promise<{ added: PendingChatAttachment[]; errors: string[] }> {
  const list = Array.from(files);
  const errors: string[] = [];
  const added: PendingChatAttachment[] = [];
  const room = Math.max(0, MAX_CHAT_ATTACHMENTS - existingCount);
  if (list.length > room) {
    errors.push(`Можно прикрепить максимум ${MAX_CHAT_ATTACHMENTS} файлов.`);
  }
  for (const file of list.slice(0, room)) {
    try {
      added.push(await fileToPendingAttachment(file));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { added, errors };
}

export function toAttachmentPayload(
  a: PendingChatAttachment,
): ChatAttachmentPayload {
  return {
    name: a.name,
    mimeType: a.mimeType,
    size: a.size,
    kind: a.kind,
    text: a.text,
    dataBase64: a.dataBase64,
  };
}

export function isLearnableAttachment(a: ChatAttachmentPayload | PendingChatAttachment): boolean {
  return a.kind === "text" || a.kind === "pdf" || Boolean(a.text?.trim());
}
