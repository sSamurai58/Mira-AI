import fs from "node:fs";
import path from "node:path";
import { dataRoot, seedRoot } from "../appPaths";
import { requestUserConfirmDetailed } from "../confirmBridge";
import { loadMarkdownCatalog, writeCatalogItem } from "../markdownCatalog";
import { ensureMiraLibraryLayout, miraLibraryDir } from "../paths";
import {
  addLearnedUnit,
  deleteLearnedUnitsForItem,
  getLearnPlan,
  getLibraryItem,
  insertLibraryItem,
  listLearnedUnits,
  listLibraryItems,
  searchLearnedUnits,
  updateLibraryItem,
  upsertLearnPlan,
  type LearnedUnitRow,
  type LibraryItemRow,
} from "../store";
import {
  extractPdfBuffer,
  isReadablePdfText,
} from "./pdfExtract";

export type LibraryAnalysis = {
  theses: string[];
  phrases: string[];
  styleNotes: string[];
  logicMoves: string[];
  terms: string[];
};

function libraryRoot(): string {
  return ensureMiraLibraryLayout();
}

export function detectMediaType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if ([".md", ".txt", ".markdown"].includes(ext)) return "text";
  if ([".pdf"].includes(ext)) return "pdf";
  if ([".epub"].includes(ext)) return "epub";
  if ([".mp3", ".wav", ".m4a", ".ogg"].includes(ext)) return "audio";
  if ([".mp4", ".webm", ".mkv", ".mov"].includes(ext)) return "video";
  return "unknown";
}

/**
 * Heuristic: does this look like human language (not raw PDF/binary noise)?
 * Exported for smoke tests.
 */
export function isReadableHumanText(text: string): boolean {
  // Reuse PDF gate (handles short title-page extracts too).
  if (isReadablePdfText(text)) return true;
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length < 24) return false;
  if (/^\[(pdf|epub|audio|video)\b/i.test(s)) return false;
  const words = s.match(/[A-Za-zА-Яа-яЁё]{3,}/g) ?? [];
  const wordChars = words.join("").length;
  const letters = (s.match(/[A-Za-zА-Яа-яЁё]/g) ?? []).length;
  if (letters / s.length < 0.4) return false;
  if (wordChars / s.length < 0.32) return false;
  const noise =
    (s.match(/[^\s\wа-яА-ЯёЁ.,;:!?«»"'()\-–—%/+\-*=\[\]{}]/g) ?? []).length;
  return noise / s.length <= 0.18;
}

function sidecarTranscript(filePath: string): string | null {
  for (const ext of [".txt", ".md", ".transcript.txt", ".srt"]) {
    const candidate = `${filePath}${ext}`;
    const alt = filePath.replace(/\.[^.]+$/, ext);
    for (const p of [candidate, alt]) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return fs.readFileSync(p, "utf8").slice(0, 50_000);
      }
    }
  }
  return null;
}

export async function extractContent(
  filePath: string,
  mediaType: string,
): Promise<{ text: string; note: string }> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Файл не найден: ${filePath}`);
  }
  if (mediaType === "text") {
    const text = fs.readFileSync(filePath, "utf8");
    return { text, note: "Текст прочитан напрямую" };
  }
  if (mediaType === "pdf") {
    try {
      const raw = fs.readFileSync(filePath);
      const extracted = await extractPdfBuffer(raw);
      if (extracted.text && isReadableHumanText(extracted.text)) {
        return {
          text: extracted.text.slice(0, 50_000),
          note: `pdf: ${extracted.note}`,
        };
      }
      const side = sidecarTranscript(filePath);
      if (side && isReadableHumanText(side)) {
        return {
          text: side.slice(0, 50_000),
          note: "pdf: sidecar transcript (.md/.txt рядом)",
        };
      }
      if (extracted.text && extracted.text.length > 40) {
        return {
          text: extracted.text.slice(0, 50_000),
          note: `pdf: ${extracted.note} (низкая читаемость)`,
        };
      }
      return {
        text: `[pdf] Файл «${path.basename(filePath)}» (${raw.length} байт) без читаемого текста. Попробованы pdf.js и OCR встроенных JPEG. Положите рядом .md/.txt или вставьте текст вручную, затем «Разобрать» и «Предложить skill».`,
        note: extracted.note || "pdf: unreadable",
      };
    } catch {
      return { text: `[pdf] Не удалось извлечь`, note: "extract failed" };
    }
  }
  if (mediaType === "epub") {
    try {
      const raw = fs.readFileSync(filePath);
      const asText = raw.toString("utf8");
      const htmlish = asText
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (htmlish.length > 80) {
        return {
          text: htmlish.slice(0, 50_000),
          note: "epub: best-effort utf8/html strip",
        };
      }
      return {
        text: `[epub] ${path.basename(filePath)} принят; полный ZIP/OPF парсер — later.`,
        note: "epub extract stub",
      };
    } catch {
      return { text: `[epub] extract failed`, note: "extract failed" };
    }
  }
  if (mediaType === "audio" || mediaType === "video") {
    const st = fs.statSync(filePath);
    const side = sidecarTranscript(filePath);
    if (side) {
      return {
        text: side,
        note: `${mediaType}: sidecar transcript`,
      };
    }
    return {
      text: `[${mediaType} meta] ${path.basename(filePath)} · ${Math.round(st.size / 1024)} КБ · mtime=${st.mtime.toISOString()}\nТранскрипт ASR: положите рядом .txt/.md/.srt с тем же именем.`,
      note: `${mediaType} metadata + sidecar hint`,
    };
  }
  const text = fs.readFileSync(filePath, "utf8");
  return { text: text.slice(0, 50_000), note: "unknown → utf8 best-effort" };
}


export function analyzeText(text: string, title: string): LibraryAnalysis {
  if (!isReadableHumanText(text)) {
    return {
      theses: [
        `Не удалось разобрать «${title}»: нет читаемого текста. Добавьте .md/.txt или вставьте текст вручную — тезисы/фразы ниже не являются skill.`,
      ],
      phrases: [],
      styleNotes: [],
      logicMoves: [],
      terms: [],
    };
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => isReadableHumanText(l) || l.length < 80);
  const headings = lines
    .filter((l) => /^#{1,3}\s+/.test(l) || /^[A-ZА-ЯЁ][^.]{8,60}$/.test(l))
    .slice(0, 12)
    .map((l) => l.replace(/^#+\s*/, ""))
    .filter((l) => isReadableHumanText(l) || /[A-Za-zА-Яа-яЁё]{4,}/.test(l));
  const sentences = text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40 && s.length < 240)
    .filter((s) => isReadableHumanText(s));
  const theses = (headings.length ? headings : sentences.slice(0, 8)).slice(
    0,
    8,
  );
  const phraseCandidates = sentences
    .filter((s) => /[,;—–-]/.test(s) || s.split(/\s+/).length <= 16)
    .slice(0, 8);
  const terms = Array.from(
    new Set(
      (text.match(/\b[A-ZА-ЯЁ][a-zа-яё]{3,}\b/g) ?? [])
        .filter((t) => t.length > 4)
        .slice(0, 20),
    ),
  );
  return {
    theses: theses.length
      ? theses
      : [`Материал «${title}»: основные идеи требуют ручного уточнения`],
    phrases: phraseCandidates,
    styleNotes: [
      text.length > 2000 ? "Развёрнутый didactic тон" : "Краткий конспектный тон",
      /мы |давайте |давай /i.test(text)
        ? "Обращение к читателю от «мы/давайте»"
        : "Нейтральное изложение",
    ],
    logicMoves: [
      "Выделить тезис → пример → вывод",
      "Связывать новые термины с уже известными",
    ],
    terms: terms.slice(0, 12),
  };
}

export function buildLearnPlan(
  title: string,
  analysis: LibraryAnalysis,
): string[] {
  return [
    `Просмотреть структуру «${title}» и зафиксировать ${analysis.theses.length} тезисов`,
    `Выучить ${Math.min(5, analysis.phrases.length)} устойчивых фраз и применять в диалоге`,
    `Освоить термины: ${analysis.terms.slice(0, 5).join(", ") || "—"}`,
    `Практиковать логику: ${analysis.logicMoves[0]}`,
    `По запросу поднимать стиль: ${analysis.styleNotes[0]}`,
  ];
}

function assertAllowedImportPath(absPath: string): void {
  const allowedRoots = [
    libraryRoot(),
    miraLibraryDir(),
    seedRoot(),
    seedRoot("library"),
    dataRoot("library"),
  ].map((p) => path.resolve(p));
  const resolved = path.resolve(absPath);
  const ok = allowedRoots.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep),
  );
  if (!ok) {
    throw new Error(
      "Импорт разрешён только из seed/ или mira/library (path allowlist).",
    );
  }
  // Block obvious traversal after resolve
  if (resolved.includes("..")) {
    throw new Error("Некорректный путь импорта");
  }
}

export async function importLibraryFile(opts: {
  filePath: string;
  title?: string;
}): Promise<LibraryItemRow> {
  const abs = path.resolve(opts.filePath);
  assertAllowedImportPath(abs);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    throw new Error(`Файл не найден: ${path.basename(abs)}`);
  }
  const mediaType = detectMediaType(abs);
  const base = path.basename(abs);
  const destDir = libraryRoot();
  const dest = path.join(destDir, `${Date.now()}-${base}`);
  fs.copyFileSync(abs, dest);
  const extracted = await extractContent(dest, mediaType);
  return insertLibraryItem({
    title: opts.title?.trim() || base.replace(/\.[^.]+$/, ""),
    kind: mediaType === "text" ? "document" : mediaType,
    sourcePath: dest,
    status: "new",
    mediaType,
    extractedText: extracted.text,
  });
}

export function importLibraryText(opts: {
  title: string;
  text: string;
  fileName?: string;
}): LibraryItemRow {
  const destDir = libraryRoot();
  const fileName = opts.fileName || `${slugify(opts.title)}.md`;
  const dest = path.join(destDir, `${Date.now()}-${fileName}`);
  fs.writeFileSync(dest, opts.text, "utf8");
  return insertLibraryItem({
    title: opts.title,
    kind: "document",
    sourcePath: dest,
    status: "new",
    mediaType: "text",
    extractedText: opts.text,
  });
}

const MAX_LIBRARY_BYTES = 20_000_000;

/** Import raw bytes from renderer file picker / chat attach. */
export async function importLibraryBytes(opts: {
  bytes: Uint8Array | Buffer;
  fileName: string;
  title?: string;
  /** Optional pre-extracted text from renderer (pdf.js / OCR). */
  extractedText?: string;
}): Promise<LibraryItemRow> {
  const buf = Buffer.from(opts.bytes);
  if (buf.byteLength < 1) throw new Error("Пустой файл");
  if (buf.byteLength > MAX_LIBRARY_BYTES) {
    throw new Error(
      `Файл слишком большой (${buf.byteLength} B). Лимит ${MAX_LIBRARY_BYTES} B.`,
    );
  }
  const safe =
    opts.fileName.replace(/[^\w.\-а-яА-ЯёЁ]+/gi, "_") || "material.bin";
  const destDir = libraryRoot();
  const dest = path.join(destDir, `${Date.now()}-${safe}`);
  fs.writeFileSync(dest, buf);
  const mediaType = detectMediaType(dest);
  const pre = opts.extractedText?.trim() ?? "";
  const extracted =
    pre && isReadableHumanText(pre)
      ? { text: pre.slice(0, 50_000), note: "client extract" }
      : await extractContent(dest, mediaType);
  return insertLibraryItem({
    title: opts.title?.trim() || safe.replace(/\.[^.]+$/, ""),
    kind: mediaType === "text" ? "document" : mediaType,
    sourcePath: dest,
    status: "new",
    mediaType,
    extractedText: extracted.text,
  });
}

function slugify(s: string): string {
  const map: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "c",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ъ: "",
    ы: "y",
    ь: "",
    э: "e",
    ю: "yu",
    я: "ya",
  };
  const latin = s
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("");
  const slug = latin
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slug || "material";
}

export async function processLibraryItem(id: string): Promise<{
  item: LibraryItemRow;
  analysis: LibraryAnalysis;
  plan: string[];
  units: LearnedUnitRow[];
}> {
  const item = getLibraryItem(id);
  if (!item) throw new Error(`Материал не найден: ${id}`);

  updateLibraryItem(id, { status: "processing" });

  let text = item.extracted_text ?? "";
  // Re-extract PDFs so older mojibake imports get a second chance with pdf.js/OCR.
  const shouldReextract =
    Boolean(item.source_path) &&
    (item.media_type === "pdf" || !text || !isReadableHumanText(text));
  if (shouldReextract && item.source_path) {
    const extracted = await extractContent(item.source_path, item.media_type);
    text = extracted.text;
    updateLibraryItem(id, { extractedText: text });
  }

  const analysis = analyzeText(text, item.title);
  const readable = isReadableHumanText(text);
  const plan = readable
    ? buildLearnPlan(item.title, analysis)
    : [
        `Добавить читаемый текст к «${item.title}» (.md/.txt рядом или вставка)`,
        "Нажать «Разобрать» ещё раз",
        "Затем «Предложить skill» — skill появится в Мастерская → Skills",
      ];
  upsertLearnPlan(id, plan);

  // 14.8 incremental: replace learned units for this item, bump version
  deleteLearnedUnitsForItem(id);
  const units: LearnedUnitRow[] = [];

  if (!readable) {
    units.push(
      addLearnedUnit({
        libraryItemId: id,
        kind: "note",
        title: `Нужен текст · ${item.title}`,
        content:
          "PDF/файл не дал читаемого текста. Выдержки ниже — не skills. Добавьте .md/.txt или вставьте текст, снова «Разобрать», потом «Предложить skill».",
        sourceRef: item.title,
      }),
    );
  } else {
    for (const thesis of analysis.theses) {
      units.push(
        addLearnedUnit({
          libraryItemId: id,
          kind: "thesis",
          title: `Тезис · ${item.title}`,
          content: thesis,
          sourceRef: item.title,
        }),
      );
    }
    for (const phrase of analysis.phrases.slice(0, 6)) {
      units.push(
        addLearnedUnit({
          libraryItemId: id,
          kind: "phrase",
          title: `Фраза · ${item.title}`,
          content: phrase,
          sourceRef: item.title,
        }),
      );
    }
    for (const style of analysis.styleNotes) {
      units.push(
        addLearnedUnit({
          libraryItemId: id,
          kind: "style",
          title: `Стиль · ${item.title}`,
          content: style,
          sourceRef: item.title,
        }),
      );
    }
    for (const logic of analysis.logicMoves) {
      units.push(
        addLearnedUnit({
          libraryItemId: id,
          kind: "logic",
          title: `Логика · ${item.title}`,
          content: logic,
          sourceRef: item.title,
        }),
      );
    }
  }

  const updated = updateLibraryItem(id, {
    status: "ready",
    analysisJson: JSON.stringify(analysis),
    extractedText: text,
    version: item.status === "ready" ? item.version + 1 : Math.max(1, item.version),
  });

  return {
    item: updated!,
    analysis,
    plan,
    units,
  };
}

function buildSkillSummary(analysis: LibraryAnalysis, title: string): string {
  const theses = analysis.theses.slice(0, 3).map((t) => `• ${t}`);
  const style = analysis.styleNotes.slice(0, 2).map((s) => `• ${s}`);
  const logic = analysis.logicMoves.slice(0, 2).map((l) => `• ${l}`);
  const phrases = analysis.phrases.slice(0, 3).map((p) => `• ${p}`);
  const terms = analysis.terms.slice(0, 6).join(", ") || "—";
  return [
    `Материал: ${title}`,
    "",
    "Тезисы:",
    ...(theses.length ? theses : ["• —"]),
    "",
    "Стиль:",
    ...(style.length ? style : ["• —"]),
    "",
    "Логика:",
    ...(logic.length ? logic : ["• —"]),
    "",
    "Фразы:",
    ...(phrases.length ? phrases : ["• —"]),
    "",
    `Термины: ${terms}`,
  ].join("\n");
}

function normalizeSkillId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueSkillId(base: string, existingIds: string[]): string {
  const taken = new Set(existingIds.map((id) => id.toLowerCase()));
  let id = normalizeSkillId(base) || "learned-skill";
  if (!taken.has(id)) return id;
  let n = 2;
  while (taken.has(`${id}-${n}`)) n += 1;
  return `${id}-${n}`;
}

export async function proposeSkillFromItem(id: string): Promise<{
  ok: boolean;
  detail: string;
  skillId: string | null;
}> {
  const item = getLibraryItem(id);
  if (!item) return { ok: false, detail: "Материал не найден", skillId: null };
  if (item.status !== "ready") {
    return { ok: false, detail: "Сначала выполните разбор материала", skillId: null };
  }
  if (!isReadableHumanText(item.extracted_text ?? "")) {
    return {
      ok: false,
      detail:
        "Нет читаемого текста для skill. Тезисы/фразы из битого PDF — не skills. Добавьте .md/.txt или вставьте текст, снова «Разобрать».",
      skillId: null,
    };
  }
  const analysis = item.analysis_json
    ? (JSON.parse(item.analysis_json) as LibraryAnalysis)
    : analyzeText(item.extracted_text ?? "", item.title);

  const existingIds = loadMarkdownCatalog("skills").map((s) => s.id);
  const defaultId = uniqueSkillId(
    `learned-${slugify(item.title)}`.replace(/[^a-z0-9-]/gi, ""),
    existingIds,
  );
  const defaultName = `Learned: ${item.title}`;
  const summary = buildSkillSummary(analysis, item.title);
  const body = [
    `# Skill from «${item.title}»`,
    "",
    "## Тезисы",
    ...analysis.theses.map((t) => `- ${t}`),
    "",
    "## Фразы",
    ...analysis.phrases.slice(0, 5).map((p) => `- ${p}`),
    "",
    "## Стиль",
    ...analysis.styleNotes.map((s) => `- ${s}`),
    "",
    "## Логика",
    ...analysis.logicMoves.map((l) => `- ${l}`),
    "",
    `Источник: ${item.source_path}`,
  ].join("\n");

  const confirm = await requestUserConfirmDetailed({
    actionClass: "skill",
    risk: "low",
    title: "Создать skill из материала?",
    body: `Черновик skill из «${item.title}» попадёт в каталог #9 (по умолчанию выключен). Можно изменить ID и название.`,
    confirmLabel: "Создать skill",
    skillPropose: {
      defaultId,
      defaultName,
      summary,
      existingIds,
      sourceTitle: item.title,
    },
  });
  if (!confirm.accepted) {
    return { ok: false, detail: "Отклонено пользователем", skillId: null };
  }

  const skillId = normalizeSkillId(confirm.fields?.skillId ?? defaultId);
  if (!skillId) {
    return { ok: false, detail: "Пустой ID skill", skillId: null };
  }
  if (existingIds.some((id) => id.toLowerCase() === skillId)) {
    return {
      ok: false,
      detail: `Skill «${skillId}» уже существует — выберите другое имя`,
      skillId: null,
    };
  }
  const skillName =
    (confirm.fields?.skillName ?? defaultName).trim() || defaultName;

  writeCatalogItem("skills", {
    id: skillId,
    name: skillName,
    description: `Авточерновик из библиотеки «${item.title}»`,
    triggers: [
      item.title.toLowerCase(),
      "выученное",
      `стиль ${item.title.toLowerCase()}`,
    ],
    tags: ["learned", "library"],
    enabled: false,
    body,
  });
  updateLibraryItem(id, { skillId });
  return {
    ok: true,
    detail: `Skill ${skillId} создан (enabled=false)`,
    skillId,
  };
}

export function formatLearnedBlock(units: LearnedUnitRow[]): string {
  if (!units.length) return "[Выученное] Ничего не найдено";
  const lines = units.map(
    (u, i) =>
      `${i + 1}. [${u.kind}] ${u.title}\n   ${u.content}\n   источник: ${u.source_ref}`,
  );
  return `[Выученное из библиотеки]\n${lines.join("\n")}`;
}

export function looksLikeLibraryLearnIntent(text: string): boolean {
  return /(выученн|из книг[ии]|в стиле (книги|лекции|материала)|вспомни логику|из материала|библиотека mira|learned from)/i.test(
    text,
  );
}

export function extractLearnQuery(text: string): string {
  const named = text.match(
    /(?:стиле|логик[уие]\s+из|из)\s+(?:книги|лекции|материала)\s+([^,.!?]+)/i,
  );
  if (named?.[1]) return named[1].trim().replace(/[«»"']/g, "").trim();
  return text
    .replace(
      /говори в стиле|вспомни логику из|из книги|из материала|выученное|библиотека mira|learned from/gi,
      " ",
    )
    .replace(/[«»"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getLibrarySnapshot(): {
  items: LibraryItemRow[];
  learned: LearnedUnitRow[];
} {
  return {
    items: listLibraryItems(50),
    learned: listLearnedUnits({ limit: 30 }),
  };
}

export { listLibraryItems, listLearnedUnits, searchLearnedUnits, getLearnPlan, getLibraryItem };
