/** Shared sort modes for Workshop skills / protocols catalogs. */

export type CatalogSort = "name" | "id" | "enabled" | "updated";

export const CATALOG_SORT_OPTIONS: Array<{ value: CatalogSort; label: string }> =
  [
    { value: "name", label: "По названию" },
    { value: "id", label: "По ID" },
    { value: "enabled", label: "Сначала включённые" },
    { value: "updated", label: "Сначала новые" },
  ];

export function loadCatalogSort(key: string, fallback: CatalogSort = "name"): CatalogSort {
  try {
    const raw = localStorage.getItem(key);
    if (
      raw === "name" ||
      raw === "id" ||
      raw === "enabled" ||
      raw === "updated"
    ) {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export function saveCatalogSort(key: string, mode: CatalogSort): void {
  try {
    localStorage.setItem(key, mode);
  } catch {
    /* ignore */
  }
}

export function sortCatalogItems(
  items: MiraCatalogItem[],
  mode: CatalogSort,
): MiraCatalogItem[] {
  const next = [...items];
  next.sort((a, b) => {
    if (mode === "enabled") {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return a.name.localeCompare(b.name, "ru");
    }
    if (mode === "id") return a.id.localeCompare(b.id);
    if (mode === "updated") {
      const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      if (tb !== ta) return tb - ta;
      return a.name.localeCompare(b.name, "ru");
    }
    return a.name.localeCompare(b.name, "ru");
  });
  return next;
}

export function itemToCatalogDraft(item: MiraCatalogItem): {
  id: string;
  name: string;
  description: string;
  triggers: string;
  tags: string;
  body: string;
  enabled: boolean;
  parentFolder?: string;
} {
  // folder is relative path including the skill leaf dir for layout=folder
  const parts = (item.folder ?? "")
    .split(/[/\\]+/)
    .map((p) => p.trim())
    .filter((p) => p && !/^skill\.md$/i.test(p) && p.toLowerCase() !== "skill-md");
  const parent =
    item.layout === "folder" && parts.length > 1
      ? parts.slice(0, -1).join("/")
      : item.layout === "folder"
        ? ""
        : undefined;
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    triggers: item.triggers.join(", "),
    tags: (item.tags ?? []).join(", "),
    body: item.body,
    enabled: item.enabled,
    parentFolder: parent,
  };
}

export function parseCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}
