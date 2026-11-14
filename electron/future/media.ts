import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { openStore } from "../store";

const execFileAsync = promisify(execFile);

export type MediaTrack = {
  id: string;
  title: string;
  artist: string | null;
  path: string | null;
  created_at: string;
};

let player = {
  playing: false,
  index: 0,
  title: "—",
  volume: 80,
  backend: "local-stub" as "local-stub" | "playerctl" | "windows-smtc" | "media-keys",
};

export function looksLikeMediaIntent(text: string): boolean {
  return /(музык|плеер|play|pause|next|предыдущ|что играет|media|громкост|плейлист|трек)/i.test(
    text,
  );
}

function ensureTracks(): MediaTrack[] {
  const store = openStore();
  let rows = store
    .prepare(
      `SELECT id, title, artist, path, created_at FROM media_tracks ORDER BY created_at ASC`,
    )
    .all() as MediaTrack[];
  if (!rows.length) {
    const now = new Date().toISOString();
    for (const t of [
      { title: "Deep Sea Ambient", artist: "Mira Demo" },
      { title: "Neon Focus", artist: "Mira Demo" },
      { title: "Quiet Code", artist: "Mira Demo" },
    ]) {
      store
        .prepare(
          `INSERT INTO media_tracks (id, title, artist, path, created_at)
           VALUES (?, ?, ?, NULL, ?)`,
        )
        .run(crypto.randomUUID(), t.title, t.artist, now);
    }
    rows = store
      .prepare(
        `SELECT id, title, artist, path, created_at FROM media_tracks ORDER BY created_at ASC`,
      )
      .all() as MediaTrack[];
  }
  return rows;
}

async function tryPlayerctl(
  cmd: "play" | "pause" | "play-pause" | "next" | "previous" | "status" | "metadata",
): Promise<{ ok: boolean; out: string }> {
  try {
    const { stdout } = await execFileAsync(
      "playerctl",
      cmd === "metadata"
        ? ["metadata", "--format", "{{artist}} — {{title}}"]
        : [cmd],
      { timeout: 4000 },
    );
    return { ok: true, out: String(stdout || "").trim() };
  } catch {
    return { ok: false, out: "" };
  }
}

async function tryWindowsMediaKey(
  action: "play" | "pause" | "next" | "prev",
): Promise<boolean> {
  if (process.platform !== "win32") return false;
  // VK codes: media play/pause 0xB3, next 0xB0, prev 0xB1
  const vk =
    action === "next" ? 0xb0 : action === "prev" ? 0xb1 : 0xb3;
  const script = [
    "Add-Type -TypeDefinition @'",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public static class MiraMedia {",
    "  [DllImport(\"user32.dll\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);",
    "  public static void Tap(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); keybd_event(vk, 0, 2, UIntPtr.Zero); }",
    "}",
    "'@",
    `[MiraMedia]::Tap(${vk})`,
  ].join("\n");
  try {
    await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { timeout: 5000, windowsHide: true },
    );
    return true;
  } catch {
    return false;
  }
}

export function getMediaStatus() {
  const tracks = ensureTracks();
  const cur = tracks[player.index] ?? tracks[0];
  if (cur && player.backend === "local-stub") {
    player.title = `${cur.title}${cur.artist ? ` — ${cur.artist}` : ""}`;
  }
  return {
    playing: player.playing,
    index: player.index,
    nowPlaying: player.title,
    volume: player.volume,
    tracks: tracks.length,
    playlist: tracks.map((t) => `${t.title}${t.artist ? ` — ${t.artist}` : ""}`),
    mode: player.backend,
  };
}

export async function handleMediaFromChat(text: string): Promise<{
  used: string;
  block: string;
}> {
  const tracks = ensureTracks();

  // Prefer OS backends when available.
  const pcMeta = await tryPlayerctl("metadata");
  if (pcMeta.ok && pcMeta.out) {
    player.backend = "playerctl";
    player.title = pcMeta.out;
    const st = await tryPlayerctl("status");
    player.playing = /playing/i.test(st.out);
  }

  if (/что играет|now playing|текущ(ий)? трек/i.test(text)) {
    if (player.backend === "playerctl") {
      const meta = await tryPlayerctl("metadata");
      if (meta.ok && meta.out) player.title = meta.out;
    }
    const st = getMediaStatus();
    return {
      used: `media:status:${st.playing ? "play" : "pause"}`,
      block: `[Медиа] Сейчас: ${st.playing ? "▶" : "⏸"} ${st.nowPlaying} · ${st.mode}`,
    };
  }

  if (/плейлист|список трек/i.test(text)) {
    const st = getMediaStatus();
    return {
      used: `media:playlist:${st.tracks}`,
      block: `[Медиа: плейлист · ${st.mode}]\n${st.playlist.map((t, i) => `${i === st.index ? "→" : "•"} ${t}`).join("\n")}`,
    };
  }

  const vol = text.match(/громкост[ьи]\s*(\d{1,3})/i);
  if (vol) {
    player.volume = Math.min(100, Math.max(0, Number(vol[1])));
    return {
      used: `media:volume:${player.volume}`,
      block: `[Медиа] Громкость ${player.volume}% (${player.backend})`,
    };
  }

  if (/pause|пауза|стоп музык/i.test(text)) {
    if ((await tryPlayerctl("pause")).ok) {
      player.backend = "playerctl";
      player.playing = false;
    } else if (await tryWindowsMediaKey("pause")) {
      player.backend = "media-keys";
      player.playing = false;
    } else {
      player.playing = false;
      player.backend = "local-stub";
    }
  } else if (/next|следующ/i.test(text)) {
    if ((await tryPlayerctl("next")).ok) {
      player.backend = "playerctl";
      player.playing = true;
    } else if (await tryWindowsMediaKey("next")) {
      player.backend = "media-keys";
      player.playing = true;
    } else {
      player.index = (player.index + 1) % Math.max(tracks.length, 1);
      player.playing = true;
      player.backend = "local-stub";
    }
  } else if (/предыдущ|previous/i.test(text)) {
    if ((await tryPlayerctl("previous")).ok) {
      player.backend = "playerctl";
      player.playing = true;
    } else if (await tryWindowsMediaKey("prev")) {
      player.backend = "media-keys";
      player.playing = true;
    } else {
      player.index =
        (player.index - 1 + Math.max(tracks.length, 1)) %
        Math.max(tracks.length, 1);
      player.playing = true;
      player.backend = "local-stub";
    }
  } else {
    if ((await tryPlayerctl("play")).ok) {
      player.backend = "playerctl";
      player.playing = true;
    } else if (await tryWindowsMediaKey("play")) {
      player.backend = "media-keys";
      player.playing = true;
    } else {
      player.playing = true;
      player.backend = "local-stub";
    }
  }

  if (player.backend === "playerctl") {
    const meta = await tryPlayerctl("metadata");
    if (meta.ok && meta.out) player.title = meta.out;
  }

  const st = getMediaStatus();
  return {
    used: `media:${st.playing ? "play" : "pause"}:${st.index}`,
    block: `[Медиа] ${st.playing ? "▶" : "⏸"} ${st.nowPlaying} · ${st.volume}% (${st.mode})`,
  };
}
