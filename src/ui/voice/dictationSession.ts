/**
 * Dictation session store: source (immutable after lock), cleaned, versions.
 * localStorage-backed so files open as plain text exports without Mira.
 */

export type DictationVersion = {
  number: number;
  createdAt: string;
  operation: string;
  body: string;
  parentVersion: number | null;
};

export type ReadPosition = {
  version: number;
  paragraph: number;
  charInParagraph: number;
  status: "idle" | "playing" | "paused";
};

export type DictationSegment = {
  index: number;
  text: string;
  at: string;
};

export type DictationSession = {
  sessionId: string;
  createdAt: string;
  status: "draft" | "review" | "ready" | "archive";
  source: "dictation" | "import";
  /** Raw STT — never overwritten by LLM edits */
  sourceDictation: string;
  /** Technical cleanup only */
  cleanedText: string;
  currentVersion: number;
  versions: DictationVersion[];
  comments: string;
  readPosition: ReadPosition;
  lockedSource: boolean;
  /** Linked notes row id when created via voice */
  noteId?: string | null;
  /** Numbered ASR/VAD segments */
  segments: DictationSegment[];
};

const KEY = "mira.dictationSession.v1";

let session: DictationSession = loadOrCreate();
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeSessionId(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const n = String(Math.floor(Math.random() * 900) + 100);
  return `${y}-${m}-${day}-${n}`;
}

function emptySession(): DictationSession {
  return {
    sessionId: makeSessionId(),
    createdAt: nowIso(),
    status: "draft",
    source: "dictation",
    sourceDictation: "",
    cleanedText: "",
    currentVersion: 0,
    versions: [],
    comments: "",
    readPosition: {
      version: 0,
      paragraph: 0,
      charInParagraph: 0,
      status: "idle",
    },
    lockedSource: false,
    noteId: null,
    segments: [],
  };
}

function loadOrCreate(): DictationSession {
  if (typeof localStorage === "undefined") return emptySession();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptySession();
    const parsed = JSON.parse(raw) as DictationSession;
    if (!parsed?.sessionId) return emptySession();
    return {
      ...emptySession(),
      ...parsed,
      segments: Array.isArray(parsed.segments) ? parsed.segments : [],
      noteId: parsed.noteId ?? null,
    };
  } catch {
    return emptySession();
  }
}

function persist() {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(session));
  void syncSessionToDisk();
}

async function syncSessionToDisk(): Promise<void> {
  if (typeof window === "undefined" || !window.mira?.saveDictationSession) return;
  try {
    await window.mira.saveDictationSession({
      meta: {
        session_id: session.sessionId,
        created_at: session.createdAt,
        status: session.status,
        source: session.source,
        current_version: session.currentVersion,
        locked_source: session.lockedSource,
        read_position: `paragraph-${session.readPosition.paragraph}`,
        note_id: session.noteId ?? null,
      },
      sourceDictation: session.sourceDictation,
      cleanedText: session.cleanedText,
      versions: session.versions.map((v) => ({
        number: v.number,
        operation: v.operation,
        body: v.body,
        createdAt: v.createdAt,
      })),
      segments: session.segments,
    });
  } catch {
    /* disk sync best-effort */
  }
}

export function subscribeDictation(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDictationSession(): DictationSession {
  return session;
}

export function newDictationSession(titleHint?: string): DictationSession {
  session = emptySession();
  if (titleHint) {
    session.comments = `title:${titleHint}`;
  }
  persist();
  notify();
  return session;
}

/** Append raw STT text to source + cleaned (dictation mode). */
export function appendDictation(fragment: string): DictationSession {
  const piece = fragment.trim();
  if (!piece) return session;
  const seg: DictationSegment = {
    index: (session.segments.at(-1)?.index ?? 0) + 1,
    text: piece,
    at: nowIso(),
  };
  if (session.lockedSource) {
    // Source locked after first version save — append only to cleaned draft buffer
    // via a soft "working" line in cleanedText.
    const sep = session.cleanedText && !session.cleanedText.endsWith("\n") ? "\n" : "";
    session = {
      ...session,
      cleanedText: `${session.cleanedText}${sep}${piece}`,
      segments: [...session.segments, seg],
    };
  } else {
    const sep =
      session.sourceDictation && !session.sourceDictation.endsWith("\n")
        ? " "
        : "";
    const nextSource = `${session.sourceDictation}${sep}${piece}`.trim();
    session = {
      ...session,
      sourceDictation: nextSource,
      cleanedText: nextSource,
      segments: [...session.segments, seg],
    };
  }
  persist();
  notify();
  return session;
}

export function setDictationNoteId(noteId: string | null): DictationSession {
  session = { ...session, noteId };
  persist();
  notify();
  return session;
}

/** Light cleanup without rewriting meaning. */
export function setCleanedText(text: string): DictationSession {
  session = { ...session, cleanedText: text };
  persist();
  notify();
  return session;
}

/**
 * Freeze source as read-only and create an immutable version snapshot.
 * Does not overwrite sourceDictation. Remaps read position when body changes.
 */
export function saveDictationVersion(operation: string, body?: string): {
  session: DictationSession;
  version: DictationVersion;
  statusPhrase: string;
} {
  const prevBody = getActiveBody();
  const prevPara = session.readPosition.paragraph;
  const text = (body ?? (session.cleanedText || session.sourceDictation)).trim();
  const number = session.currentVersion + 1;
  const version: DictationVersion = {
    number,
    createdAt: nowIso(),
    operation,
    body: text,
    parentVersion: session.currentVersion || null,
  };
  const remapped = remapParagraphIndex(prevBody, text, prevPara);
  session = {
    ...session,
    lockedSource: true,
    currentVersion: number,
    versions: [...session.versions, version],
    cleanedText: text,
    readPosition: {
      version: number,
      paragraph: remapped,
      charInParagraph: 0,
      status: "idle",
    },
  };
  persist();
  notify();
  return {
    session,
    version,
    statusPhrase: `Черновик сохранён, версия ${number}`,
  };
}

/** Map old paragraph index into new text by best token overlap. */
export function remapParagraphIndex(
  oldText: string,
  newText: string,
  oldIndex: number,
): number {
  const oldParas = splitParagraphs(oldText);
  const newParas = splitParagraphs(newText);
  if (!newParas.length) return 0;
  if (!oldParas.length) return Math.min(oldIndex, newParas.length - 1);
  const target = oldParas[Math.min(oldIndex, oldParas.length - 1)] ?? "";
  if (!target) return 0;
  const tokens = new Set(
    target
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
  if (!tokens.size) {
    return Math.min(oldIndex, newParas.length - 1);
  }
  let bestIdx = Math.min(oldIndex, newParas.length - 1);
  let bestScore = -1;
  newParas.forEach((p, i) => {
    const pt = p
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean);
    let score = 0;
    for (const t of pt) {
      if (tokens.has(t)) score += 1;
    }
    const norm = score / Math.max(tokens.size, 1);
    if (norm > bestScore) {
      bestScore = norm;
      bestIdx = i;
    }
  });
  return bestIdx;
}

export function getVersionBody(versionNumber: number): string | null {
  if (versionNumber === 0) return session.sourceDictation || null;
  const v = session.versions.find((x) => x.number === versionNumber);
  return v?.body ?? null;
}

export function getActiveBody(): string {
  if (session.currentVersion > 0) {
    return (
      getVersionBody(session.currentVersion) ??
      (session.cleanedText || session.sourceDictation)
    );
  }
  return session.cleanedText || session.sourceDictation;
}

export function exportSessionPlain(): {
  bodyTxt: string;
  metaTxt: string;
} {
  const bodyTxt = getActiveBody();
  const metaTxt = [
    `session_id: ${session.sessionId}`,
    `created_at: ${session.createdAt}`,
    `status: ${session.status}`,
    `source: ${session.source}`,
    `current_version: ${session.currentVersion}`,
    `locked_source: ${session.lockedSource}`,
    `read_position: paragraph-${session.readPosition.paragraph}`,
  ].join("\n");
  return { bodyTxt, metaTxt };
}

export function setReadPosition(pos: Partial<ReadPosition>): DictationSession {
  session = {
    ...session,
    readPosition: { ...session.readPosition, ...pos },
  };
  persist();
  notify();
  return session;
}

export function splitParagraphs(text: string): string[] {
  const parts = text
    .split(/\n\s*\n|\r\n\s*\r\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length) return parts;
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length ? lines : text.trim() ? [text.trim()] : [];
}
