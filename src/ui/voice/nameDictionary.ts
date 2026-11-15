/**
 * User dictionary for names/terms — post-STT replacement with a replacement journal.
 */

export type DictEntry = { from: string; to: string };
export type ReplacementLog = {
  id: string;
  at: string;
  from: string;
  to: string;
  context: string;
};

const DICT_KEY = "mira.nameDictionary.v1";
const LOG_KEY = "mira.nameDictionary.log.v1";
const MAX_LOG = 100;

export function listNameDictionary(): DictEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(DICT_KEY) || "[]") as DictEntry[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function setNameDictionary(entries: DictEntry[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(DICT_KEY, JSON.stringify(entries));
}

export function upsertNameEntry(from: string, to: string): DictEntry[] {
  const f = from.trim();
  const t = to.trim();
  if (!f || !t) return listNameDictionary();
  const next = listNameDictionary().filter(
    (e) => e.from.toLowerCase() !== f.toLowerCase(),
  );
  next.push({ from: f, to: t });
  setNameDictionary(next);
  return next;
}

export function removeNameEntry(from: string): DictEntry[] {
  const next = listNameDictionary().filter(
    (e) => e.from.toLowerCase() !== from.toLowerCase(),
  );
  setNameDictionary(next);
  return next;
}

export function listReplacementLog(): ReplacementLog[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = JSON.parse(
      localStorage.getItem(LOG_KEY) || "[]",
    ) as ReplacementLog[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function pushLog(entry: Omit<ReplacementLog, "id" | "at">): void {
  if (typeof localStorage === "undefined") return;
  const row: ReplacementLog = {
    id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    ...entry,
  };
  const next = [row, ...listReplacementLog()].slice(0, MAX_LOG);
  localStorage.setItem(LOG_KEY, JSON.stringify(next));
}

/** Apply dictionary; log every replacement. Does not invent unlisted changes. */
export function applyNameDictionary(
  text: string,
): { text: string; replacements: number } {
  let out = text;
  let replacements = 0;
  for (const { from, to } of listNameDictionary()) {
    if (!from) continue;
    const re = new RegExp(
      from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "gi",
    );
    out = out.replace(re, (match) => {
      replacements += 1;
      pushLog({
        from: match,
        to,
        context: text.slice(0, 80),
      });
      // Preserve crude case of first letter
      if (match[0] && match[0] === match[0].toUpperCase()) {
        return to.charAt(0).toUpperCase() + to.slice(1);
      }
      return to;
    });
  }
  return { text: out, replacements };
}
