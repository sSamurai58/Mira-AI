/** Unfinished create-form drafts for Workshop catalogs (localStorage). */

export type CatalogDraftKind = "skill" | "protocol" | "path" | "command";

export type CatalogDraftEntry = {
  id: string;
  kind: CatalogDraftKind;
  updatedAt: number;
  title: string;
  summary: string;
  payload: unknown;
};

const LS_KEY = "mira.catalog.drafts.v1";
export const CATALOG_DRAFTS_EVENT = "mira:catalog-drafts";

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function normalizeEntry(raw: unknown): CatalogDraftEntry | null {
  if (!isRecord(raw)) return null;
  const kind = raw.kind;
  if (
    kind !== "skill" &&
    kind !== "protocol" &&
    kind !== "path" &&
    kind !== "command"
  ) {
    return null;
  }
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : null;
  if (!id) return null;
  return {
    id,
    kind,
    updatedAt:
      typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
        ? raw.updatedAt
        : Date.now(),
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title : "Без названия",
    summary: typeof raw.summary === "string" ? raw.summary : "",
    payload: raw.payload ?? null,
  };
}

export function newCatalogDraftId(): string {
  return `draft-${crypto.randomUUID().slice(0, 12)}`;
}

export function loadCatalogDrafts(
  kind?: CatalogDraftKind,
): CatalogDraftEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const all = parsed
      .map(normalizeEntry)
      .filter((x): x is CatalogDraftEntry => Boolean(x));
    const filtered = kind ? all.filter((d) => d.kind === kind) : all;
    return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function writeAll(entries: CatalogDraftEntry[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(entries));
  window.dispatchEvent(
    new CustomEvent(CATALOG_DRAFTS_EVENT, { detail: { entries } }),
  );
}

export function upsertCatalogDraft(
  entry: Omit<CatalogDraftEntry, "updatedAt"> & { updatedAt?: number },
): CatalogDraftEntry {
  const next: CatalogDraftEntry = {
    ...entry,
    updatedAt: entry.updatedAt ?? Date.now(),
  };
  const all = loadCatalogDrafts();
  const idx = all.findIndex((d) => d.id === next.id);
  if (idx >= 0) all[idx] = next;
  else all.unshift(next);
  writeAll(all);
  return next;
}

export function removeCatalogDraft(id: string): void {
  const all = loadCatalogDrafts().filter((d) => d.id !== id);
  writeAll(all);
}

export function getCatalogDraft(id: string): CatalogDraftEntry | null {
  return loadCatalogDrafts().find((d) => d.id === id) ?? null;
}

/** Stable stringify for dirty checks (key-sorted objects). */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(o).sort()) sorted[k] = o[k];
      return sorted;
    }
    return v;
  });
}

export function draftsDiffer(a: unknown, b: unknown): boolean {
  return stableStringify(a) !== stableStringify(b);
}

export function formatDraftUpdatedAt(ms: number): string {
  try {
    return new Date(ms).toLocaleString("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(ms).toLocaleString("ru-RU");
  }
}
