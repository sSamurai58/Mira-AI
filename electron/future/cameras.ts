import fs from "node:fs";
import path from "node:path";
import { requestUserConfirm } from "../confirmBridge";
import { openStore } from "../store";

export type CameraRow = {
  id: string;
  name: string;
  url: string;
  enabled: number;
  created_at: string;
};

export function looksLikeCameraIntent(text: string): boolean {
  return /(камер|camera|ptz|снимок с камер|запись с камер)/i.test(text);
}

export function listCameras(): CameraRow[] {
  const store = openStore();
  const rows = store
    .prepare(
      `SELECT id, name, url, enabled, created_at FROM cameras ORDER BY created_at ASC`,
    )
    .all() as CameraRow[];
  if (rows.length) return rows;
  const now = new Date().toISOString();
  store
    .prepare(
      `INSERT INTO cameras (id, name, url, enabled, created_at) VALUES (?, ?, ?, 1, ?)`,
    )
    .run(crypto.randomUUID(), "Demo Cam", "rtsp://demo.local/stream", now);
  return store
    .prepare(
      `SELECT id, name, url, enabled, created_at FROM cameras ORDER BY created_at ASC`,
    )
    .all() as CameraRow[];
}

export function upsertCamera(input: {
  id?: string;
  name: string;
  url: string;
  enabled?: boolean;
}): CameraRow {
  const id = input.id ?? crypto.randomUUID();
  const store = openStore();
  const existing = store
    .prepare(`SELECT id FROM cameras WHERE id = ?`)
    .get(id) as { id: string } | undefined;
  if (existing) {
    store
      .prepare(
        `UPDATE cameras SET name = ?, url = ?, enabled = ? WHERE id = ?`,
      )
      .run(
        input.name,
        input.url,
        input.enabled === false ? 0 : 1,
        id,
      );
  } else {
    store
      .prepare(
        `INSERT INTO cameras (id, name, url, enabled, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.url,
        input.enabled === false ? 0 : 1,
        new Date().toISOString(),
      );
  }
  return store
    .prepare(
      `SELECT id, name, url, enabled, created_at FROM cameras WHERE id = ?`,
    )
    .get(id) as CameraRow;
}

export async function handleCameraFromChat(text: string): Promise<{
  used: string;
  block: string;
}> {
  const cams = listCameras();
  const cam = cams[0];
  if (/ptz|поворот|зум|zoom/i.test(text)) {
    return {
      used: "camera:ptz:dry-run",
      block: `[Камеры] PTZ dry-run для «${cam?.name ?? "n/a"}» (live протокол позже)`,
    };
  }
  if (/запись|record/i.test(text)) {
    const ok = await requestUserConfirm({
      actionClass: "camera",
      risk: "high",
      title: "Запись с камеры",
      body: `Сохранить stub-запись с «${cam?.name}» в mira/library?`,
      confirmLabel: "Записать",
    });
    if (!ok) {
      return { used: "camera:record:denied", block: "[Камеры] Запись отклонена" };
    }
  }
  const dir = path.resolve(process.cwd(), "data", "library");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = Date.now();
  const meta = path.join(dir, `camera-snap-${stamp}.txt`);
  const png = path.join(dir, `camera-snap-${stamp}.png`);
  let note = "RTSP grab stub — PNG placeholder";
  let pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const url = cam?.url?.trim() || "";
  if (/^https?:\/\//i.test(url)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 32) {
          pngBytes = buf;
          note = `HTTP snapshot ${res.status} · ${buf.length} bytes`;
        } else {
          note = `HTTP ${res.status} слишком короткий ответ — placeholder`;
        }
      } else {
        note = `HTTP ${res.status} — placeholder`;
      }
    } catch (err) {
      note = `HTTP fail: ${err instanceof Error ? err.message : String(err)} — placeholder`;
    }
  }
  fs.writeFileSync(png, pngBytes);
  fs.writeFileSync(
    meta,
    `Mira camera snapshot\ncamera=${cam?.name}\nurl=${url}\npng=${png}\nat=${new Date().toISOString()}\nnote=${note}\n`,
    "utf8",
  );
  return {
    used: note.startsWith("HTTP snapshot")
      ? "camera:snapshot:http"
      : "camera:snapshot:ok",
    block: `[Камеры] Снимок сохранён: ${png} (${note})`,
  };
}

