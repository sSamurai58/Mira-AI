/**
 * Best-effort EPUB text extract (ZIP + OPF + XHTML) without heavy deps.
 * Uses Node zlib + manual ZIP local-file parsing for common EPUB layouts.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export type EpubExtractResult = {
  text: string;
  note: string;
  chapterCount: number;
};

type ZipEntry = {
  name: string;
  compression: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

function readUInt32LE(buf: Buffer, off: number): number {
  return buf.readUInt32LE(off);
}

function readUInt16LE(buf: Buffer, off: number): number {
  return buf.readUInt16LE(off);
}

/** Parse central directory of a ZIP (EPUB is a ZIP). */
function listZipEntries(buf: Buffer): ZipEntry[] {
  // Find End of Central Directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_535); i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];

  const totalEntries = readUInt16LE(buf, eocd + 10);
  const cdOffset = readUInt32LE(buf, eocd + 16);
  const entries: ZipEntry[] = [];
  let off = cdOffset;
  for (let n = 0; n < totalEntries && off + 46 <= buf.length; n++) {
    if (
      buf[off] !== 0x50 ||
      buf[off + 1] !== 0x4b ||
      buf[off + 2] !== 0x01 ||
      buf[off + 3] !== 0x02
    ) {
      break;
    }
    const compression = readUInt16LE(buf, off + 10);
    const compressedSize = readUInt32LE(buf, off + 20);
    const uncompressedSize = readUInt32LE(buf, off + 24);
    const nameLen = readUInt16LE(buf, off + 28);
    const extraLen = readUInt16LE(buf, off + 30);
    const commentLen = readUInt16LE(buf, off + 32);
    const localHeaderOffset = readUInt32LE(buf, off + 42);
    const name = buf.slice(off + 46, off + 46 + nameLen).toString("utf8");
    entries.push({
      name,
      compression,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readZipEntry(buf: Buffer, entry: ZipEntry): Buffer | null {
  const off = entry.localHeaderOffset;
  if (off + 30 > buf.length) return null;
  if (
    buf[off] !== 0x50 ||
    buf[off + 1] !== 0x4b ||
    buf[off + 2] !== 0x03 ||
    buf[off + 3] !== 0x04
  ) {
    return null;
  }
  const nameLen = readUInt16LE(buf, off + 26);
  const extraLen = readUInt16LE(buf, off + 28);
  const dataStart = off + 30 + nameLen + extraLen;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buf.length) return null;
  const compressed = buf.slice(dataStart, dataEnd);
  if (entry.compression === 0) return compressed;
  if (entry.compression === 8) {
    try {
      return zlib.inflateRawSync(compressed);
    } catch {
      try {
        return zlib.unzipSync(compressed);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveHref(baseDir: string, href: string): string {
  const cleaned = href.split("#")[0]!.trim();
  if (!cleaned) return "";
  // EPUB paths are ZIP-internal with /
  const joined = path.posix.normalize(
    path.posix.join(baseDir.replace(/\\/g, "/"), cleaned),
  );
  return joined.replace(/^\.\//, "");
}

/**
 * Extract readable text from an .epub file.
 */
export function extractEpubText(filePath: string): EpubExtractResult {
  const buf = fs.readFileSync(filePath);
  const entries = listZipEntries(buf);
  if (!entries.length) {
    // Fallback: treat as raw utf8 (legacy stub path)
    const asText = buf.toString("utf8");
    const htmlish = stripHtml(asText);
    if (htmlish.length > 80) {
      return {
        text: htmlish.slice(0, 50_000),
        note: "epub: zip parse failed · utf8/html strip fallback",
        chapterCount: 0,
      };
    }
    return {
      text: `[epub] ${path.basename(filePath)}: не удалось разобрать ZIP`,
      note: "epub: not a zip / corrupt",
      chapterCount: 0,
    };
  }

  const byName = new Map(entries.map((e) => [e.name, e]));
  const container = byName.get("META-INF/container.xml");
  let opfPath = "";
  if (container) {
    const raw = readZipEntry(buf, container)?.toString("utf8") || "";
    const m = raw.match(/full-path\s*=\s*"([^"]+)"/i);
    opfPath = m?.[1]?.replace(/\\/g, "/") || "";
  }
  if (!opfPath) {
    const guess = entries.find((e) => /\.opf$/i.test(e.name));
    opfPath = guess?.name || "";
  }
  if (!opfPath) {
    // Concatenate all xhtml/html bodies
    const parts: string[] = [];
    for (const e of entries) {
      if (!/\.(x?html|htm|xml)$/i.test(e.name)) continue;
      if (/META-INF|container\.xml/i.test(e.name)) continue;
      const raw = readZipEntry(buf, e)?.toString("utf8");
      if (!raw) continue;
      const t = stripHtml(raw);
      if (t.length > 40) parts.push(t);
    }
    const text = parts.join("\n\n").slice(0, 50_000);
    return {
      text: text || `[epub] ${path.basename(filePath)}: нет текстовых глав`,
      note: text ? "epub: all xhtml concat (no OPF)" : "epub: empty",
      chapterCount: parts.length,
    };
  }

  const opfEntry = byName.get(opfPath);
  const opfRaw = opfEntry ? readZipEntry(buf, opfEntry)?.toString("utf8") || "" : "";
  const opfDir = path.posix.dirname(opfPath);

  // spine itemrefs → manifest hrefs
  const manifest = new Map<string, string>();
  const manRe =
    /<item\b[^>]*\bid\s*=\s*"([^"]+)"[^>]*\bhref\s*=\s*"([^"]+)"[^>]*>/gi;
  let mm: RegExpExecArray | null;
  while ((mm = manRe.exec(opfRaw))) {
    manifest.set(mm[1]!, mm[2]!);
  }
  // also href-before-id order
  const manRe2 =
    /<item\b[^>]*\bhref\s*=\s*"([^"]+)"[^>]*\bid\s*=\s*"([^"]+)"[^>]*>/gi;
  while ((mm = manRe2.exec(opfRaw))) {
    if (!manifest.has(mm[2]!)) manifest.set(mm[2]!, mm[1]!);
  }

  const spineIds: string[] = [];
  const spineRe = /<itemref\b[^>]*\bidref\s*=\s*"([^"]+)"[^>]*>/gi;
  while ((mm = spineRe.exec(opfRaw))) {
    spineIds.push(mm[1]!);
  }

  const hrefs =
    spineIds.length > 0
      ? spineIds.map((id) => manifest.get(id)).filter(Boolean) as string[]
      : [...manifest.values()].filter((h) => /\.(x?html|htm)$/i.test(h));

  const chapters: string[] = [];
  for (const href of hrefs) {
    const full = resolveHref(opfDir === "." ? "" : opfDir, href);
    const entry = byName.get(full) || byName.get(href);
    if (!entry) continue;
    const raw = readZipEntry(buf, entry)?.toString("utf8");
    if (!raw) continue;
    const t = stripHtml(raw);
    if (t.length > 40) chapters.push(t);
  }

  const text = chapters.join("\n\n").slice(0, 50_000);
  if (!text) {
    return {
      text: `[epub] ${path.basename(filePath)}: OPF найден, но глав без текста`,
      note: `epub: opf=${opfPath} empty spine`,
      chapterCount: 0,
    };
  }
  return {
    text,
    note: `epub: ZIP/OPF · ${chapters.length} гл. · ${opfPath}`,
    chapterCount: chapters.length,
  };
}
