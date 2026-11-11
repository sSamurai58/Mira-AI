import { openStore } from "../store";

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
};

export function looksLikeMediaIntent(text: string): boolean {
  return /(музык|плеер|play|pause|next|предыдущ|что играет|media)/i.test(text);
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

export function getMediaStatus() {
  const tracks = ensureTracks();
  const cur = tracks[player.index] ?? tracks[0];
  if (cur) player.title = `${cur.title}${cur.artist ? ` — ${cur.artist}` : ""}`;
  return {
    playing: player.playing,
    index: player.index,
    nowPlaying: player.title,
    tracks: tracks.length,
    mode: "local-stub",
  };
}

export function handleMediaFromChat(text: string): {
  used: string;
  block: string;
} {
  const tracks = ensureTracks();
  if (/pause|пауза|стоп музык/i.test(text)) {
    player.playing = false;
  } else if (/next|следующ/i.test(text)) {
    player.index = (player.index + 1) % Math.max(tracks.length, 1);
    player.playing = true;
  } else if (/предыдущ|previous/i.test(text)) {
    player.index =
      (player.index - 1 + Math.max(tracks.length, 1)) %
      Math.max(tracks.length, 1);
    player.playing = true;
  } else {
    player.playing = true;
  }
  const st = getMediaStatus();
  return {
    used: `media:${st.playing ? "play" : "pause"}:${st.index}`,
    block: `[Медиа] ${st.playing ? "▶" : "⏸"} ${st.nowPlaying} (${st.mode})`,
  };
}
