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
  volume: 80,
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

export function getMediaStatus() {
  const tracks = ensureTracks();
  const cur = tracks[player.index] ?? tracks[0];
  if (cur) player.title = `${cur.title}${cur.artist ? ` — ${cur.artist}` : ""}`;
  return {
    playing: player.playing,
    index: player.index,
    nowPlaying: player.title,
    volume: player.volume,
    tracks: tracks.length,
    playlist: tracks.map((t) => `${t.title}${t.artist ? ` — ${t.artist}` : ""}`),
    mode: "local-stub",
  };
}

export function handleMediaFromChat(text: string): {
  used: string;
  block: string;
} {
  const tracks = ensureTracks();

  if (/что играет|now playing|текущ(ий)? трек/i.test(text)) {
    const st = getMediaStatus();
    return {
      used: `media:status:${st.playing ? "play" : "pause"}`,
      block: `[Медиа] Сейчас: ${st.playing ? "▶" : "⏸"} ${st.nowPlaying} · громкость ${st.volume}% (${st.mode})`,
    };
  }

  if (/плейлист|список трек/i.test(text)) {
    const st = getMediaStatus();
    return {
      used: `media:playlist:${st.tracks}`,
      block: `[Медиа: плейлист]\n${st.playlist.map((t, i) => `${i === st.index ? "→" : "•"} ${t}`).join("\n")}`,
    };
  }

  const vol = text.match(/громкост[ьи]\s*(\d{1,3})/i);
  if (vol) {
    player.volume = Math.min(100, Math.max(0, Number(vol[1])));
    return {
      used: `media:volume:${player.volume}`,
      block: `[Медиа] Громкость ${player.volume}% (local-stub)`,
    };
  }

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
    block: `[Медиа] ${st.playing ? "▶" : "⏸"} ${st.nowPlaying} · ${st.volume}% (${st.mode})`,
  };
}
