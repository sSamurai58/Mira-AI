import { openStore } from "../store";
import { appendAppLog } from "../logging";

export type CalendarEventRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  remind_at: string | null;
  created_at: string;
};

export type TimerRow = {
  id: string;
  label: string;
  seconds: number;
  ends_at: string;
  status: string;
  created_at: string;
};

export function looksLikeCalendarIntent(text: string): boolean {
  return /(календар|встреч|напомин|таймер|timer|через \d+|напомни)/i.test(
    text,
  );
}

export function listEvents(limit = 30): CalendarEventRow[] {
  return openStore()
    .prepare(
      `SELECT id, title, starts_at, ends_at, remind_at, created_at
       FROM calendar_events ORDER BY starts_at ASC LIMIT ?`,
    )
    .all(limit) as CalendarEventRow[];
}

export function listTimers(limit = 20): TimerRow[] {
  return openStore()
    .prepare(
      `SELECT id, label, seconds, ends_at, status, created_at
       FROM timers ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as TimerRow[];
}

export function createEvent(input: {
  title: string;
  startsAt: string;
  endsAt?: string | null;
  remindAt?: string | null;
}): CalendarEventRow {
  const row: CalendarEventRow = {
    id: crypto.randomUUID(),
    title: input.title.trim() || "Событие",
    starts_at: input.startsAt,
    ends_at: input.endsAt ?? null,
    remind_at: input.remindAt ?? null,
    created_at: new Date().toISOString(),
  };
  openStore()
    .prepare(
      `INSERT INTO calendar_events (id, title, starts_at, ends_at, remind_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.title,
      row.starts_at,
      row.ends_at,
      row.remind_at,
      row.created_at,
    );
  return row;
}

export function startTimer(label: string, seconds: number): TimerRow {
  const now = Date.now();
  const row: TimerRow = {
    id: crypto.randomUUID(),
    label: label.trim() || "Таймер",
    seconds: Math.max(1, seconds),
    ends_at: new Date(now + Math.max(1, seconds) * 1000).toISOString(),
    status: "running",
    created_at: new Date().toISOString(),
  };
  openStore()
    .prepare(
      `INSERT INTO timers (id, label, seconds, ends_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.label,
      row.seconds,
      row.ends_at,
      row.status,
      row.created_at,
    );
  return row;
}

export function cancelTimer(id?: string): TimerRow | null {
  const store = openStore();
  const row = id
    ? (store
        .prepare(`SELECT * FROM timers WHERE id = ?`)
        .get(id) as TimerRow | undefined)
    : (store
        .prepare(
          `SELECT * FROM timers WHERE status = 'running' ORDER BY created_at DESC LIMIT 1`,
        )
        .get() as TimerRow | undefined);
  if (!row) return null;
  store
    .prepare(`UPDATE timers SET status = 'cancelled' WHERE id = ?`)
    .run(row.id);
  return { ...row, status: "cancelled" };
}

export function markTimerDone(id: string): TimerRow | null {
  const store = openStore();
  const row = store
    .prepare(`SELECT * FROM timers WHERE id = ?`)
    .get(id) as TimerRow | undefined;
  if (!row) return null;
  store.prepare(`UPDATE timers SET status = 'done' WHERE id = ?`).run(id);
  return { ...row, status: "done" };
}

async function showDesktopNotification(
  title: string,
  body: string,
): Promise<boolean> {
  try {
    if (typeof process.versions.electron === "string") {
      const { Notification } = await import("electron");
      if (Notification.isSupported()) {
        new Notification({ title, body }).show();
        return true;
      }
    }
  } catch {
    // headless
  }
  return false;
}

/** Fire due timers / reminders; call from main poll. */
export async function tickCalendarNotifications(): Promise<{
  timers: number;
  reminders: number;
}> {
  const store = openStore();
  const now = new Date().toISOString();
  const dueTimers = store
    .prepare(
      `SELECT * FROM timers WHERE status = 'running' AND ends_at <= ? LIMIT 20`,
    )
    .all(now) as TimerRow[];
  let timers = 0;
  for (const t of dueTimers) {
    markTimerDone(t.id);
    const shown = await showDesktopNotification(
      "Mira · таймер",
      `«${t.label}» завершён (${t.seconds}с)`,
    );
    appendAppLog({
      level: "info",
      category: "calendar",
      message: `timer done ${t.id} notify=${shown}`,
    });
    timers += 1;
  }

  const dueEvents = store
    .prepare(
      `SELECT * FROM calendar_events
       WHERE remind_at IS NOT NULL AND remind_at <= ? AND remind_at > ?
       LIMIT 20`,
    )
    .all(now, new Date(Date.now() - 60_000).toISOString()) as CalendarEventRow[];
  let reminders = 0;
  for (const ev of dueEvents) {
    const shown = await showDesktopNotification(
      "Mira · напоминание",
      `${ev.title} · ${ev.starts_at}`,
    );
    appendAppLog({
      level: "info",
      category: "calendar",
      message: `reminder ${ev.id} notify=${shown}`,
    });
    reminders += 1;
  }
  return { timers, reminders };
}


function parseTimerSeconds(text: string): number | null {
  const m =
    text.match(/через\s+(\d+)\s*(сек|секунд|мин|минут|час)/i) ||
    text.match(/таймер\s+на\s+(\d+)\s*(сек|секунд|мин|минут|час)?/i) ||
    text.match(/(\d+)\s*(сек|секунд|мин|минут)/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] || "мин").toLowerCase();
  if (unit.startsWith("сек")) return n;
  if (unit.startsWith("час")) return n * 3600;
  return n * 60;
}

export function handleCalendarFromChat(text: string): {
  used: string;
  block: string;
} {
  if (/отмен.*(таймер)|cancel timer/i.test(text)) {
    const t = cancelTimer();
    return {
      used: t ? `timer:cancel:${t.id}` : "timer:cancel:none",
      block: t
        ? `[Таймер] Отменён «${t.label}»`
        : "[Таймер] Нет активного таймера",
    };
  }
  const sec = parseTimerSeconds(text);
  if (sec || /таймер|timer/i.test(text)) {
    const t = startTimer("Таймер Mira", sec ?? 60);
    return {
      used: `timer:start:${t.id}`,
      block: `[Таймер] «${t.label}» на ${t.seconds}с · до ${t.ends_at}`,
    };
  }
  const title =
    text
      .replace(/добавь|создай|встречу|событие|в календарь|напомни/gi, " ")
      .replace(/\s+/g, " ")
      .trim() || "Событие Mira";
  const starts = new Date(Date.now() + 3600_000).toISOString();
  const ev = createEvent({ title, startsAt: starts, remindAt: starts });
  return {
    used: `calendar:create:${ev.id}`,
    block: `[Календарь] Событие «${ev.title}» · ${ev.starts_at}`,
  };
}
