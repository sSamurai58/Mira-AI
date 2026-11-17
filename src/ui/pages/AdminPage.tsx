import { useCallback, useEffect, useMemo, useState } from "react";
import { loadCoreLevel, loadCoreXp } from "../coreLevel";

type AdminSeg =
  | "users-stats"
  | "users-info"
  | "users-keys"
  | "roles"
  | "voice-bg";

const SEGMENTS: Array<{ id: AdminSeg; label: string; group: string }> = [
  { id: "users-stats", label: "Статистика", group: "Пользователи" },
  { id: "users-info", label: "Информация", group: "Пользователи" },
  { id: "users-keys", label: "Ключи и доступ", group: "Пользователи" },
  { id: "roles", label: "Роли", group: "Админ" },
  { id: "voice-bg", label: "Фон-голос (A)", group: "Админ" },
];

type AccessUser = {
  id: string;
  name: string;
  note: string;
  roleId: string;
  status: "active" | "blocked";
  keyId: string | null;
  createdAt: string;
  updatedAt: string;
  usage: {
    sessions: number;
    messages: number;
    lastSeenAt: string | null;
  };
};

type AccessKey = {
  id: string;
  userId: string;
  token: string;
  label: string;
  expiresAt: string;
  maxDevices: number;
  devices: Array<{ id: string; name: string; lastSeenAt: string }>;
  createdAt: string;
  updatedAt: string;
  revoked: boolean;
};

type AccessRole = {
  id: string;
  name: string;
  detail: string;
  locked: boolean;
};

type AccessStats = {
  usersTotal: number;
  usersActive: number;
  usersBlocked: number;
  keysTotal: number;
  keysActive: number;
  keysExpired: number;
  keysRevoked: number;
  devicesBound: number;
  devicesCapSum: number;
  messagesTotal: number;
  sessionsTotal: number;
  miraLevel: number | null;
  miraXp: number | null;
};

type SortKey = "name" | "status" | "expires" | "devices" | "messages";

function defaultExpiryDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function keyStatus(k: AccessKey | undefined): string {
  if (!k) return "нет ключа";
  if (k.revoked) return "отозван";
  if (Date.parse(k.expiresAt) < Date.now()) return "истёк";
  return "активен";
}

export function AdminPage() {
  const [segment, setSegment] = useState<AdminSeg>("users-stats");
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [keys, setKeys] = useState<AccessKey[]>([]);
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [stats, setStats] = useState<AccessStats | null>(null);
  const [note, setNote] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filter, setFilter] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const [newUserName, setNewUserName] = useState("");
  const [newUserNote, setNewUserNote] = useState("");
  const [keyUserName, setKeyUserName] = useState("");
  const [keyUserId, setKeyUserId] = useState("");
  const [keyExpires, setKeyExpires] = useState(() => defaultExpiryDays(30));
  const [keyDevices, setKeyDevices] = useState(1);
  const [editKeyId, setEditKeyId] = useState<string | null>(null);
  const [editExpires, setEditExpires] = useState("");
  const [editDevices, setEditDevices] = useState(1);

  const [bgStatus, setBgStatus] = useState<{
    ownerMode: boolean;
    projectId: string | null;
    pendingSinceRebuild: number;
    lastRebuildAt: string | null;
    lastError: string | null;
    pairsIngested: number;
    pairsQueued: number;
    rebuilds: number;
    outboundCount: number;
    phraseCount: number;
    acceptedClips: number;
    rebuildRunning: boolean;
  } | null>(null);

  const keyById = useMemo(() => {
    const m = new Map<string, AccessKey>();
    for (const k of keys) m.set(k.id, k);
    return m;
  }, [keys]);

  const keyByUser = useMemo(() => {
    const m = new Map<string, AccessKey>();
    for (const k of keys) {
      if (!k.revoked) m.set(k.userId, k);
    }
    return m;
  }, [keys]);

  const refresh = useCallback(async () => {
    if (!window.mira?.getAccessSnapshot) return;
    const snap = await window.mira.getAccessSnapshot();
    setUsers(snap.users as AccessUser[]);
    setKeys(snap.keys as AccessKey[]);
    setRoles(snap.roles as AccessRole[]);
    const level = loadCoreLevel();
    const xp = loadCoreXp();
    void window.mira.mirrorMiraLevel?.({ level, xp });
    const st = {
      ...(snap.stats as AccessStats),
      miraLevel: level,
      miraXp: xp,
    };
    setStats(st);
    if (window.mira.getBgLearnStatus) {
      setBgStatus(await window.mira.getBgLearnStatus());
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sortedUsers = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = users.slice();
    if (q) {
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.note.toLowerCase().includes(q) ||
          (keyByUser.get(u.id)?.token ?? "").toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const ka = keyByUser.get(a.id) ?? (a.keyId ? keyById.get(a.keyId) : undefined);
      const kb = keyByUser.get(b.id) ?? (b.keyId ? keyById.get(b.keyId) : undefined);
      switch (sortKey) {
        case "status":
          return (
            (a.status.localeCompare(b.status) || a.name.localeCompare(b.name)) *
            dir
          );
        case "expires": {
          const ea = ka ? Date.parse(ka.expiresAt) : 0;
          const eb = kb ? Date.parse(kb.expiresAt) : 0;
          return (ea - eb) * dir;
        }
        case "devices": {
          const da = ka?.maxDevices ?? 0;
          const db = kb?.maxDevices ?? 0;
          return (da - db) * dir;
        }
        case "messages":
          return (a.usage.messages - b.usage.messages) * dir;
        default:
          return a.name.localeCompare(b.name, "ru") * dir;
      }
    });
    return list;
  }, [users, filter, sortKey, sortDir, keyByUser, keyById]);

  const selected = selectedUserId
    ? users.find((u) => u.id === selectedUserId) ?? null
    : null;
  const selectedKey = selected
    ? keyByUser.get(selected.id) ??
      (selected.keyId ? keyById.get(selected.keyId) : undefined)
    : undefined;

  async function createUser() {
    if (!window.mira?.upsertAccessUser || !newUserName.trim()) return;
    await window.mira.upsertAccessUser({
      name: newUserName.trim(),
      note: newUserNote,
      roleId: "user",
    });
    setNewUserName("");
    setNewUserNote("");
    setNote("Пользователь создан");
    await refresh();
  }

  async function saveSelected() {
    if (!window.mira?.upsertAccessUser || !selected) return;
    await window.mira.upsertAccessUser({
      id: selected.id,
      name: selected.name,
      note: selected.note,
      roleId: selected.roleId,
      status: selected.status,
    });
    setNote("Карточка сохранена");
    await refresh();
  }

  async function removeUser(id: string) {
    if (!window.mira?.deleteAccessUser) return;
    await window.mira.deleteAccessUser(id);
    if (selectedUserId === id) setSelectedUserId(null);
    setNote("Пользователь удалён");
    await refresh();
  }

  async function createKey() {
    if (!window.mira?.createAccessKey) return;
    const res = await window.mira.createAccessKey({
      userId: keyUserId || undefined,
      userName: keyUserName || undefined,
      expiresAt: new Date(keyExpires).toISOString(),
      maxDevices: keyDevices,
    });
    setKeyUserName("");
    setKeyUserId("");
    setNote(`Ключ создан: ${(res.key as AccessKey).token}`);
    await refresh();
  }

  async function saveKeyEdit() {
    if (!window.mira?.updateAccessKey || !editKeyId) return;
    await window.mira.updateAccessKey({
      keyId: editKeyId,
      expiresAt: new Date(editExpires).toISOString(),
      maxDevices: editDevices,
    });
    setNote("Ключ обновлён (срок / устройства)");
    setEditKeyId(null);
    await refresh();
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  }

  return (
    <div className="settings-layout workshop-layout">
      <nav className="settings-nav workshop-seg-nav" aria-label="Администрирование">
        {SEGMENTS.map((s, i) => {
          const prev = SEGMENTS[i - 1];
          const showGroup = !prev || prev.group !== s.group;
          return (
            <div key={s.id}>
              {showGroup ? (
                <div className="muted" style={{ padding: "8px 10px 2px", fontSize: "0.75rem" }}>
                  {s.group}
                </div>
              ) : null}
              <button
                type="button"
                className={`nav-btn${segment === s.id ? " is-active" : ""}`}
                onClick={() => setSegment(s.id)}
              >
                {s.label}
              </button>
            </div>
          );
        })}
      </nav>

      <div className="workshop-main panel stack" style={{ gap: "0.85rem" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Администрирование</h2>
          <button type="button" className="btn" onClick={() => void refresh()}>
            Обновить
          </button>
        </div>
        {note ? <p className="muted" style={{ margin: 0 }}>{note}</p> : null}

        {segment === "users-stats" && stats ? (
          <>
            <p className="muted" style={{ margin: 0 }}>
              Полная сводка по пользователям, ключам, использованию и уровню Миры.
            </p>
            <div
              className="row"
              style={{ flexWrap: "wrap", gap: "0.75rem" }}
            >
              {[
                ["Пользователи", `${stats.usersActive} акт. / ${stats.usersTotal}`],
                ["Заблок.", String(stats.usersBlocked)],
                ["Ключи активны", String(stats.keysActive)],
                ["Ключи истекли", String(stats.keysExpired)],
                ["Отозваны", String(stats.keysRevoked)],
                ["Устройства", `${stats.devicesBound} / лимит ${stats.devicesCapSum}`],
                ["Сессии", String(stats.sessionsTotal)],
                ["Сообщения", String(stats.messagesTotal)],
                ["Уровень Миры", String(stats.miraLevel ?? loadCoreLevel())],
                ["XP Миры", String(stats.miraXp ?? loadCoreXp())],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="panel"
                  style={{ minWidth: 140, padding: "0.65rem 0.8rem" }}
                >
                  <div className="muted" style={{ fontSize: "0.75rem" }}>
                    {label}
                  </div>
                  <div style={{ fontSize: "1.15rem", fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>
            {bgStatus ? (
              <div className="panel stack" style={{ gap: "0.35rem" }}>
                <strong>Использование голоса (фон A)</strong>
                <span className="muted">
                  Пар в корпусе: {bgStatus.pairsIngested} · очередь:{" "}
                  {bgStatus.outboundCount} · фраз: {bgStatus.phraseCount} ·
                  принятых клипов: {bgStatus.acceptedClips} · пересборок stitch:{" "}
                  {bgStatus.rebuilds}
                </span>
              </div>
            ) : null}
          </>
        ) : null}

        {segment === "users-info" ? (
          <>
            <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Поиск…"
                style={{ flex: 1, minWidth: 160 }}
              />
              {(
                [
                  ["name", "Имя"],
                  ["status", "Статус"],
                  ["expires", "Срок ключа"],
                  ["devices", "Устройства"],
                  ["messages", "Сообщения"],
                ] as Array<[SortKey, string]>
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={`btn${sortKey === k ? " btn-primary" : ""}`}
                  onClick={() => toggleSort(k)}
                >
                  {label}
                  {sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </button>
              ))}
            </div>

            <div className="row" style={{ alignItems: "flex-start", gap: "1rem" }}>
              <div className="stack" style={{ flex: 1, minWidth: 220, gap: "0.4rem" }}>
                {sortedUsers.map((u) => {
                  const k = keyByUser.get(u.id) ?? (u.keyId ? keyById.get(u.keyId) : undefined);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      className={`btn${selectedUserId === u.id ? " btn-primary" : ""}`}
                      style={{ textAlign: "left" }}
                      onClick={() => setSelectedUserId(u.id)}
                    >
                      <div>{u.name}</div>
                      <div className="muted" style={{ fontSize: "0.75rem" }}>
                        {u.status} · ключ {keyStatus(k)} · устр.{" "}
                        {k ? `${k.devices.length}/${k.maxDevices}` : "—"}
                      </div>
                    </button>
                  );
                })}
                {!sortedUsers.length ? (
                  <p className="muted">Пока нет пользователей — создайте в «Ключи и доступ» или ниже.</p>
                ) : null}
              </div>

              <div className="panel stack" style={{ flex: 1.2, minWidth: 260, gap: "0.5rem" }}>
                <strong>Карточка пользователя</strong>
                {selected ? (
                  <>
                    <label className="stack">
                      <span className="muted">Имя</span>
                      <input
                        value={selected.name}
                        onChange={(e) =>
                          setUsers((list) =>
                            list.map((u) =>
                              u.id === selected.id
                                ? { ...u, name: e.target.value }
                                : u,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="stack">
                      <span className="muted">Заметка</span>
                      <input
                        value={selected.note}
                        onChange={(e) =>
                          setUsers((list) =>
                            list.map((u) =>
                              u.id === selected.id
                                ? { ...u, note: e.target.value }
                                : u,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="stack">
                      <span className="muted">Роль</span>
                      <select
                        value={selected.roleId}
                        onChange={(e) =>
                          setUsers((list) =>
                            list.map((u) =>
                              u.id === selected.id
                                ? { ...u, roleId: e.target.value }
                                : u,
                            ),
                          )
                        }
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="stack">
                      <span className="muted">Статус</span>
                      <select
                        value={selected.status}
                        onChange={(e) =>
                          setUsers((list) =>
                            list.map((u) =>
                              u.id === selected.id
                                ? {
                                    ...u,
                                    status: e.target.value as "active" | "blocked",
                                  }
                                : u,
                            ),
                          )
                        }
                      >
                        <option value="active">active</option>
                        <option value="blocked">blocked</option>
                      </select>
                    </label>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      Ключ: {selectedKey?.token ?? "—"}
                      <br />
                      Срок:{" "}
                      {selectedKey
                        ? new Date(selectedKey.expiresAt).toLocaleString("ru-RU")
                        : "—"}
                      <br />
                      Устройства:{" "}
                      {selectedKey
                        ? `${selectedKey.devices.length} / ${selectedKey.maxDevices}`
                        : "—"}
                      <br />
                      Сессии / сообщения: {selected.usage.sessions} /{" "}
                      {selected.usage.messages}
                    </div>
                    <div className="row">
                      <button type="button" className="btn btn-primary" onClick={() => void saveSelected()}>
                        Сохранить
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => void removeUser(selected.id)}
                      >
                        Удалить
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="muted">Выберите пользователя слева.</p>
                )}

                <hr style={{ opacity: 0.2, width: "100%" }} />
                <strong>Новый пользователь</strong>
                <input
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Имя"
                />
                <input
                  value={newUserNote}
                  onChange={(e) => setNewUserNote(e.target.value)}
                  placeholder="Заметка"
                />
                <button type="button" className="btn" onClick={() => void createUser()}>
                  Создать
                </button>
              </div>
            </div>
          </>
        ) : null}

        {segment === "users-keys" ? (
          <>
            <p className="muted" style={{ margin: 0 }}>
              Создание ключа (срок, кол-во устройств) и редактирование (продление, лимит устройств).
            </p>
            <div className="panel stack" style={{ gap: "0.5rem" }}>
              <strong>Создать ключ</strong>
              <label className="stack">
                <span className="muted">Существующий пользователь (опц.)</span>
                <select
                  value={keyUserId}
                  onChange={(e) => setKeyUserId(e.target.value)}
                >
                  <option value="">— новый —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              {!keyUserId ? (
                <input
                  value={keyUserName}
                  onChange={(e) => setKeyUserName(e.target.value)}
                  placeholder="Имя нового пользователя"
                />
              ) : null}
              <label className="stack">
                <span className="muted">Срок действия (дата)</span>
                <input
                  type="date"
                  value={keyExpires}
                  onChange={(e) => setKeyExpires(e.target.value)}
                />
              </label>
              <label className="stack">
                <span className="muted">Кол-во устройств</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={keyDevices}
                  onChange={(e) => setKeyDevices(Number(e.target.value) || 1)}
                />
              </label>
              <button type="button" className="btn btn-primary" onClick={() => void createKey()}>
                Создать ключ
              </button>
            </div>

            <div className="stack" style={{ gap: "0.5rem" }}>
              {keys.map((k) => {
                const u = users.find((x) => x.id === k.userId);
                const editing = editKeyId === k.id;
                return (
                  <div key={k.id} className="panel stack" style={{ gap: "0.35rem" }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <strong>{k.label}</strong>
                      <span className="muted">{keyStatus(k)}</span>
                    </div>
                    <code style={{ fontSize: "0.8rem", wordBreak: "break-all" }}>
                      {k.token}
                    </code>
                    <span className="muted" style={{ fontSize: "0.85rem" }}>
                      {u?.name ?? k.userId} · до{" "}
                      {new Date(k.expiresAt).toLocaleDateString("ru-RU")} · устр.{" "}
                      {k.devices.length}/{k.maxDevices}
                    </span>
                    {editing ? (
                      <>
                        <label className="stack">
                          <span className="muted">Продлить до</span>
                          <input
                            type="date"
                            value={editExpires}
                            onChange={(e) => setEditExpires(e.target.value)}
                          />
                        </label>
                        <label className="stack">
                          <span className="muted">Кол-во устройств</span>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={editDevices}
                            onChange={(e) =>
                              setEditDevices(Number(e.target.value) || 1)
                            }
                          />
                        </label>
                        <div className="row">
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => void saveKeyEdit()}
                          >
                            Сохранить
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => setEditKeyId(null)}
                          >
                            Отмена
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="row">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            setEditKeyId(k.id);
                            setEditExpires(k.expiresAt.slice(0, 10));
                            setEditDevices(k.maxDevices);
                          }}
                        >
                          Редактировать
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            void navigator.clipboard?.writeText(k.token);
                            setNote("Ключ скопирован");
                          }}
                        >
                          Копировать
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            void window.mira
                              ?.updateAccessKey?.({
                                keyId: k.id,
                                revoked: !k.revoked,
                              })
                              .then(() => refresh());
                          }}
                        >
                          {k.revoked ? "Восстановить" : "Отозвать"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : null}

        {segment === "roles" ? (
          <>
            <p className="muted" style={{ margin: 0 }}>
              Discovery ролей ещё не закрыт — стартовый набор-заглушка. Полные права
              разберём отдельно.
            </p>
            {roles.map((r) => (
              <div key={r.id} className="panel stack" style={{ gap: "0.25rem" }}>
                <strong>
                  {r.name} {r.locked ? "· locked" : ""}
                </strong>
                <span className="muted">{r.detail}</span>
              </div>
            ))}
          </>
        ) : null}

        {segment === "voice-bg" && bgStatus ? (
          <>
            <p className="muted" style={{ margin: 0 }}>
              Уровень A: пары текст↔ElevenLabs копятся; корпус и stitch-rebuild — на
              машине владельца. EL остаётся учителем/fallback.
            </p>
            <div className="panel stack" style={{ gap: "0.35rem" }}>
              <span>ownerMode: {bgStatus.ownerMode ? "да" : "нет"}</span>
              <span>projectId: {bgStatus.projectId ?? "—"}</span>
              <span>
                ingested / queued / outbound: {bgStatus.pairsIngested} /{" "}
                {bgStatus.pairsQueued} / {bgStatus.outboundCount}
              </span>
              <span>
                phrases / accepted: {bgStatus.phraseCount} /{" "}
                {bgStatus.acceptedClips}
              </span>
              <span>pending since rebuild: {bgStatus.pendingSinceRebuild}</span>
              <span>
                last rebuild:{" "}
                {bgStatus.lastRebuildAt
                  ? new Date(bgStatus.lastRebuildAt).toLocaleString("ru-RU")
                  : "—"}
              </span>
              <span>rebuilds: {bgStatus.rebuilds}</span>
              {bgStatus.lastError ? (
                <span style={{ color: "var(--danger, #c44)" }}>
                  last error: {bgStatus.lastError}
                </span>
              ) : null}
              {bgStatus.rebuildRunning ? (
                <span className="muted">Идёт пересборка stitch…</span>
              ) : null}
            </div>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  void window.mira
                    ?.setBgLearnOwnerMode?.(!bgStatus.ownerMode)
                    .then((s) => {
                      setBgStatus(s);
                      setNote(
                        s.ownerMode
                          ? "Эта машина — владелец (train здесь)"
                          : "Клиент: только очередь пар",
                      );
                    });
                }}
              >
                {bgStatus.ownerMode ? "Сделать клиентом" : "Сделать владельцем"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  void window.mira?.ingestBgLearnOutbound?.().then((r) => {
                    setNote(r.detail);
                    void refresh();
                  });
                }}
              >
                Принять очередь outbound
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  void window.mira?.rebuildBgLearnPack?.().then((r) => {
                    setNote(r.detail);
                    void refresh();
                  });
                }}
              >
                Пересобрать stitch сейчас
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
