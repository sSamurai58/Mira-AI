/** Browser-demo library / learn materials (localStorage). */

const LS_KEY = "mira.library.local.v1";

export type LocalLibraryItem = {
  id: string;
  title: string;
  kind: string;
  media_type: string;
  status: string;
  version: number;
  skill_id: string | null;
  source_path: string | null;
  extracted_text: string;
  created_at: string;
  updated_at: string;
};

export type LocalLearnedUnit = {
  id: string;
  library_item_id: string;
  kind: string;
  content: string;
  source_ref: string;
  created_at: string;
};

type Store = {
  items: LocalLibraryItem[];
  units: LocalLearnedUnit[];
  plans: Record<string, string[]>;
};

function now(): string {
  return new Date().toISOString();
}

function read(): Store {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { items: [], units: [], plans: {} };
    const parsed = JSON.parse(raw) as Store;
    return {
      items: parsed.items ?? [],
      units: parsed.units ?? [],
      plans: parsed.plans ?? {},
    };
  } catch {
    return { items: [], units: [], plans: {} };
  }
}

function write(store: Store) {
  localStorage.setItem(LS_KEY, JSON.stringify(store));
}

export function localListLibraryItems(): LocalLibraryItem[] {
  return read().items.slice().sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

export function localImportLibraryText(opts: {
  title: string;
  text: string;
  fileName?: string;
}): LocalLibraryItem {
  const store = read();
  const stamp = now();
  const item: LocalLibraryItem = {
    id: crypto.randomUUID(),
    title: opts.title.trim() || opts.fileName || "Материал",
    kind: "document",
    media_type: "text",
    status: "new",
    version: 1,
    skill_id: null,
    source_path: opts.fileName ?? null,
    extracted_text: opts.text,
    created_at: stamp,
    updated_at: stamp,
  };
  store.items.unshift(item);
  write(store);
  return item;
}

export function localImportLibraryBytes(opts: {
  title?: string;
  fileName: string;
  mimeType?: string;
  text?: string;
}): LocalLibraryItem {
  const text =
    opts.text?.trim() ||
    `[Файл ${opts.fileName}] Бинарный материал сохранён в demo-библиотеке без полного extract.`;
  return localImportLibraryText({
    title: opts.title?.trim() || opts.fileName.replace(/\.[^.]+$/, ""),
    text,
    fileName: opts.fileName,
  });
}

export function localListLearnedUnits(libraryItemId?: string): LocalLearnedUnit[] {
  const units = read().units;
  if (!libraryItemId) return units;
  return units.filter((u) => u.library_item_id === libraryItemId);
}

export function localDeleteLibraryItem(id: string): {
  ok: boolean;
  detail: string;
  deletedId: string | null;
} {
  const store = read();
  const item = store.items.find((i) => i.id === id);
  if (!item) {
    return { ok: false, detail: "Материал не найден", deletedId: null };
  }
  store.items = store.items.filter((i) => i.id !== id);
  store.units = store.units.filter((u) => u.library_item_id !== id);
  delete store.plans[id];
  write(store);
  return {
    ok: true,
    detail: `Удалено «${item.title}»`,
    deletedId: item.id,
  };
}

export function localGetLearnPlan(libraryItemId: string): string[] {
  return read().plans[libraryItemId] ?? [];
}

export function localProcessLibraryItem(id: string): {
  item: LocalLibraryItem;
  plan: string[];
  units: LocalLearnedUnit[];
} {
  const store = read();
  const idx = store.items.findIndex((i) => i.id === id);
  if (idx < 0) throw new Error("Материал не найден");
  const item = store.items[idx];
  const text = item.extracted_text || "";
  const stamp = now();
  store.units = store.units.filter((u) => u.library_item_id !== id);
  const units: LocalLearnedUnit[] = [];

  const letters = (text.match(/[A-Za-zА-Яа-яЁё]/g) ?? []).length;
  const words = text.match(/[A-Za-zА-Яа-яЁё]{3,}/g) ?? [];
  const readable =
    text.trim().length >= 24 &&
    letters / Math.max(1, text.replace(/\s+/g, " ").trim().length) >= 0.4 &&
    words.join("").length / Math.max(1, text.replace(/\s+/g, " ").trim().length) >=
      0.32;

  if (!readable) {
    units.push({
      id: crypto.randomUUID(),
      library_item_id: id,
      kind: "note",
      content:
        "Нет читаемого текста для разбора. Выдержки ≠ skills. Добавьте .md/.txt или вставьте текст вручную.",
      source_ref: "qa",
      created_at: stamp,
    });
  } else {
    const lines = text
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    const theses = lines
      .filter((l) => l.length > 40)
      .slice(0, 5)
      .map((l) => l.slice(0, 220));
    const phrases = lines
      .filter((l) => l.length > 12 && l.length < 120)
      .slice(0, 6);
    for (const [i, t] of theses.entries()) {
      units.push({
        id: crypto.randomUUID(),
        library_item_id: id,
        kind: "thesis",
        content: t,
        source_ref: `§${i + 1}`,
        created_at: stamp,
      });
    }
    for (const [i, p] of phrases.entries()) {
      units.push({
        id: crypto.randomUUID(),
        library_item_id: id,
        kind: "phrase",
        content: p,
        source_ref: `фр.${i + 1}`,
        created_at: stamp,
      });
    }
    if (!units.length) {
      units.push({
        id: crypto.randomUUID(),
        library_item_id: id,
        kind: "note",
        content: "Мало текста для разбора — добавьте более длинный материал.",
        source_ref: "qa",
        created_at: stamp,
      });
    }
  }
  const plan = [
    "Прочитать материал целиком",
    "Выписать 3–5 тезисов",
    "Закрепить 2 фразы в диалоге с Мирой",
    "Попросить ответ «в стиле» материала",
  ];
  store.units.push(...units);
  store.plans[id] = plan;
  store.items[idx] = {
    ...item,
    status: "learned",
    version: item.version + 1,
    updated_at: stamp,
  };
  write(store);
  return { item: store.items[idx], plan, units };
}
