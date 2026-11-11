import fs from "node:fs";
import path from "node:path";
import { requestUserConfirm } from "../confirmBridge";
import { writeCatalogItem } from "../markdownCatalog";
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

export type LibraryAnalysis = {
  theses: string[];
  phrases: string[];
  styleNotes: string[];
  logicMoves: string[];
  terms: string[];
};

function libraryRoot(): string {
  const dir = path.resolve(process.cwd(), "data", "library");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
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

export function extractContent(
  filePath: string,
  mediaType: string,
): { text: string; note: string } {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Файл не найден: ${filePath}`);
  }
  if (mediaType === "text") {
    const text = fs.readFileSync(filePath, "utf8");
    return { text, note: "Текст прочитан напрямую" };
  }
  if (mediaType === "pdf" || mediaType === "epub") {
    // P8: lightweight stub — try utf8 read for text-like dumps; otherwise placeholder
    try {
      const raw = fs.readFileSync(filePath);
      const asText = raw.toString("utf8");
      if (/[\x00-\x08]/.test(asText.slice(0, 200))) {
        return {
          text: `[stub extract ${mediaType}] Файл ${path.basename(filePath)} принят. Полный парсер PDF/EPUB — later. Добавьте .md/.txt для полного разбора.`,
          note: `${mediaType} extract stub`,
        };
      }
      return {
        text: asText.slice(0, 50_000),
        note: `${mediaType}: прочитан как текст (best-effort)`,
      };
    } catch {
      return {
        text: `[stub] Не удалось извлечь ${mediaType}`,
        note: "extract failed",
      };
    }
  }
  if (mediaType === "audio" || mediaType === "video") {
    return {
      text: `[stub transcript ${mediaType}] ${path.basename(filePath)}: транскрипт ASR — later. Метаданные сохранены; добавьте текстовую выжимку .md для обучения.`,
      note: `${mediaType} transcript stub`,
    };
  }
  const text = fs.readFileSync(filePath, "utf8");
  return { text: text.slice(0, 50_000), note: "unknown → utf8 best-effort" };
}

export function analyzeText(text: string, title: string): LibraryAnalysis {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const headings = lines
    .filter((l) => /^#{1,3}\s+/.test(l) || /^[A-ZА-ЯЁ][^.]{8,60}$/.test(l))
    .slice(0, 12)
    .map((l) => l.replace(/^#+\s*/, ""));
  const sentences = text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40 && s.length < 240);
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
    phrases: phraseCandidates.length
      ? phraseCandidates
      : [`Ключевая формулировка из «${title}»`],
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
    path.resolve(process.cwd(), "seed"),
    path.resolve(process.cwd(), "seed", "library"),
    path.resolve(process.cwd(), "data", "library"),
  ].map((p) => path.resolve(p));
  const resolved = path.resolve(absPath);
  const ok = allowedRoots.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep),
  );
  if (!ok) {
    throw new Error(
      "Импорт разрешён только из seed/ или data/library (path allowlist).",
    );
  }
  // Block obvious traversal after resolve
  if (resolved.includes("..")) {
    throw new Error("Некорректный путь импорта");
  }
}

export function importLibraryFile(opts: {
  filePath: string;
  title?: string;
}): LibraryItemRow {
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
  const extracted = extractContent(dest, mediaType);
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

export function processLibraryItem(id: string): {
  item: LibraryItemRow;
  analysis: LibraryAnalysis;
  plan: string[];
  units: LearnedUnitRow[];
} {
  const item = getLibraryItem(id);
  if (!item) throw new Error(`Материал не найден: ${id}`);

  updateLibraryItem(id, { status: "processing" });

  let text = item.extracted_text ?? "";
  if (!text && item.source_path) {
    const extracted = extractContent(item.source_path, item.media_type);
    text = extracted.text;
    updateLibraryItem(id, { extractedText: text });
  }

  const analysis = analyzeText(text, item.title);
  const plan = buildLearnPlan(item.title, analysis);
  upsertLearnPlan(id, plan);

  // 14.8 incremental: replace learned units for this item, bump version
  deleteLearnedUnitsForItem(id);
  const units: LearnedUnitRow[] = [];
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
  const analysis = item.analysis_json
    ? (JSON.parse(item.analysis_json) as LibraryAnalysis)
    : analyzeText(item.extracted_text ?? "", item.title);

  const skillId = `learned-${slugify(item.title)}`.replace(/[^a-z0-9-]/gi, "");
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

  const ok = await requestUserConfirm({
    actionClass: "skill",
    risk: "low",
    title: "Создать skill из материала?",
    body: `Будет создан skill «${skillId}» (default off) из «${item.title}».\n\nПодтвердите создание в каталоге #9.`,
    confirmLabel: "Создать skill",
  });
  if (!ok) {
    return { ok: false, detail: "Отклонено пользователем", skillId: null };
  }

  writeCatalogItem("skills", {
    id: skillId,
    name: `Learned: ${item.title}`,
    description: `Авточерновик из библиотеки «${item.title}»`,
    triggers: [
      item.title.toLowerCase(),
      "выученное",
      `стиль ${item.title.toLowerCase()}`,
    ],
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
