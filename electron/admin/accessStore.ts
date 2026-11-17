/**
 * Owner-side access keys + users (Администрирование).
 * Local JSON on the owner machine — not a cloud auth server.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataRoot } from "../appPaths";

export type AccessUserStatus = "active" | "blocked";

export type AccessUser = {
  id: string;
  name: string;
  note: string;
  roleId: string;
  status: AccessUserStatus;
  keyId: string | null;
  createdAt: string;
  updatedAt: string;
  usage: {
    sessions: number;
    messages: number;
    lastSeenAt: string | null;
  };
};

export type AccessDevice = {
  id: string;
  name: string;
  lastSeenAt: string;
};

export type AccessKey = {
  id: string;
  userId: string;
  token: string;
  label: string;
  expiresAt: string;
  maxDevices: number;
  devices: AccessDevice[];
  createdAt: string;
  updatedAt: string;
  revoked: boolean;
};

export type AccessRole = {
  id: string;
  name: string;
  detail: string;
  locked: boolean;
};

type AccessDb = {
  version: 1;
  users: AccessUser[];
  keys: AccessKey[];
};

const ROLES: AccessRole[] = [
  {
    id: "owner",
    name: "Владелец",
    detail: "Полный доступ к Администрированию. Нельзя снять.",
    locked: true,
  },
  {
    id: "user",
    name: "Пользователь",
    detail: "Доступ к Mira по ключу (права уточняются в discovery Ролей).",
    locked: false,
  },
];

function storePath(): string {
  const dir = dataRoot("admin");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "access.json");
}

function emptyDb(): AccessDb {
  return { version: 1, users: [], keys: [] };
}

function readDb(): AccessDb {
  try {
    const raw = fs.readFileSync(storePath(), "utf8");
    const parsed = JSON.parse(raw) as AccessDb;
    if (!parsed || parsed.version !== 1) return emptyDb();
    if (!Array.isArray(parsed.users)) parsed.users = [];
    if (!Array.isArray(parsed.keys)) parsed.keys = [];
    return parsed;
  } catch {
    return emptyDb();
  }
}

function writeDb(db: AccessDb): void {
  fs.writeFileSync(storePath(), JSON.stringify(db, null, 2), "utf8");
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Charset for MIRA-XXXX-XXXX-XXXX-XXXX (no ambiguous 0/O/1/I/l). */
const KEY_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";

/** Format: MIRA-8f6H-hd85-GZ7H-8gPi (4 groups × 4 chars). */
function mintToken(): string {
  const bytes = crypto.randomBytes(16);
  let raw = "";
  for (let i = 0; i < 16; i++) {
    raw += KEY_ALPHABET[bytes[i]! % KEY_ALPHABET.length]!;
  }
  return `MIRA-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

export function listAccessRoles(): AccessRole[] {
  return ROLES.map((r) => ({ ...r }));
}

export function listAccessUsers(): AccessUser[] {
  return readDb().users.map((u) => ({
    ...u,
    usage: { ...u.usage },
  }));
}

export function listAccessKeys(): AccessKey[] {
  return readDb().keys.map((k) => ({
    ...k,
    devices: k.devices.map((d) => ({ ...d })),
  }));
}

export function getAccessSnapshot(): {
  users: AccessUser[];
  keys: AccessKey[];
  roles: AccessRole[];
  stats: AccessStats;
} {
  const db = readDb();
  return {
    users: db.users.map((u) => ({ ...u, usage: { ...u.usage } })),
    keys: db.keys.map((k) => ({
      ...k,
      devices: k.devices.map((d) => ({ ...d })),
    })),
    roles: listAccessRoles(),
    stats: computeStats(db),
  };
}

export type AccessStats = {
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

function computeStats(db: AccessDb): AccessStats {
  const now = Date.now();
  let keysActive = 0;
  let keysExpired = 0;
  let keysRevoked = 0;
  let devicesBound = 0;
  let devicesCapSum = 0;
  for (const k of db.keys) {
    devicesBound += k.devices.length;
    devicesCapSum += Math.max(0, k.maxDevices);
    if (k.revoked) {
      keysRevoked += 1;
      continue;
    }
    if (Date.parse(k.expiresAt) < now) {
      keysExpired += 1;
      continue;
    }
    keysActive += 1;
  }
  let messagesTotal = 0;
  let sessionsTotal = 0;
  let usersActive = 0;
  let usersBlocked = 0;
  for (const u of db.users) {
    messagesTotal += u.usage.messages;
    sessionsTotal += u.usage.sessions;
    if (u.status === "blocked") usersBlocked += 1;
    else usersActive += 1;
  }
  let miraLevel: number | null = null;
  let miraXp: number | null = null;
  try {
    // Core level lives in renderer localStorage; mirror file if present.
    const mirror = path.join(dataRoot("admin"), "mira-level.json");
    if (fs.existsSync(mirror)) {
      const raw = JSON.parse(fs.readFileSync(mirror, "utf8")) as {
        level?: number;
        xp?: number;
      };
      if (typeof raw.level === "number") miraLevel = raw.level;
      if (typeof raw.xp === "number") miraXp = raw.xp;
    }
  } catch {
    /* optional */
  }
  return {
    usersTotal: db.users.length,
    usersActive,
    usersBlocked,
    keysTotal: db.keys.length,
    keysActive,
    keysExpired,
    keysRevoked,
    devicesBound,
    devicesCapSum,
    messagesTotal,
    sessionsTotal,
    miraLevel,
    miraXp,
  };
}

export function mirrorMiraLevel(level: number, xp: number): void {
  const dir = dataRoot("admin");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "mira-level.json"),
    JSON.stringify({ level, xp, at: nowIso() }),
    "utf8",
  );
}

export function upsertAccessUser(input: {
  id?: string;
  name: string;
  note?: string;
  roleId?: string;
  status?: AccessUserStatus;
}): AccessUser {
  const db = readDb();
  const stamp = nowIso();
  const name = input.name.trim() || "Пользователь";
  if (input.id) {
    const idx = db.users.findIndex((u) => u.id === input.id);
    if (idx < 0) throw new Error("Пользователь не найден");
    const cur = db.users[idx]!;
    const next: AccessUser = {
      ...cur,
      name,
      note: input.note !== undefined ? input.note : cur.note,
      roleId: input.roleId ?? cur.roleId,
      status: input.status ?? cur.status,
      updatedAt: stamp,
    };
    db.users[idx] = next;
    writeDb(db);
    return { ...next, usage: { ...next.usage } };
  }
  const row: AccessUser = {
    id: crypto.randomUUID(),
    name,
    note: (input.note ?? "").trim(),
    roleId: input.roleId ?? "user",
    status: input.status ?? "active",
    keyId: null,
    createdAt: stamp,
    updatedAt: stamp,
    usage: { sessions: 0, messages: 0, lastSeenAt: null },
  };
  db.users.push(row);
  writeDb(db);
  return { ...row, usage: { ...row.usage } };
}

export function deleteAccessUser(userId: string): { ok: boolean } {
  const db = readDb();
  const before = db.users.length;
  db.users = db.users.filter((u) => u.id !== userId);
  db.keys = db.keys.filter((k) => k.userId !== userId);
  writeDb(db);
  return { ok: db.users.length < before };
}

export function createAccessKey(input: {
  userId?: string;
  userName?: string;
  label?: string;
  expiresAt: string;
  maxDevices: number;
}): { user: AccessUser; key: AccessKey } {
  const db = readDb();
  const stamp = nowIso();
  const expiresAt = new Date(input.expiresAt).toISOString();
  if (Number.isNaN(Date.parse(expiresAt))) {
    throw new Error("Некорректный срок действия ключа");
  }
  const maxDevices = Math.max(1, Math.min(100, Math.round(input.maxDevices)));

  let user = input.userId
    ? db.users.find((u) => u.id === input.userId)
    : undefined;
  if (!user) {
    user = {
      id: crypto.randomUUID(),
      name: (input.userName ?? "Пользователь").trim() || "Пользователь",
      note: "",
      roleId: "user",
      status: "active",
      keyId: null,
      createdAt: stamp,
      updatedAt: stamp,
      usage: { sessions: 0, messages: 0, lastSeenAt: null },
    };
    db.users.push(user);
  }

  const key: AccessKey = {
    id: crypto.randomUUID(),
    userId: user.id,
    token: mintToken(),
    label: (input.label ?? `Ключ · ${user.name}`).trim(),
    expiresAt,
    maxDevices,
    devices: [],
    createdAt: stamp,
    updatedAt: stamp,
    revoked: false,
  };
  db.keys.push(key);
  user.keyId = key.id;
  user.updatedAt = stamp;
  writeDb(db);
  return {
    user: { ...user, usage: { ...user.usage } },
    key: { ...key, devices: [] },
  };
}

export function updateAccessKey(input: {
  keyId: string;
  expiresAt?: string;
  maxDevices?: number;
  label?: string;
  revoked?: boolean;
}): AccessKey {
  const db = readDb();
  const key = db.keys.find((k) => k.id === input.keyId);
  if (!key) throw new Error("Ключ не найден");
  if (input.expiresAt !== undefined) {
    const expiresAt = new Date(input.expiresAt).toISOString();
    if (Number.isNaN(Date.parse(expiresAt))) {
      throw new Error("Некорректный срок");
    }
    key.expiresAt = expiresAt;
  }
  if (input.maxDevices !== undefined) {
    key.maxDevices = Math.max(1, Math.min(100, Math.round(input.maxDevices)));
  }
  if (input.label !== undefined) key.label = input.label.trim() || key.label;
  if (input.revoked !== undefined) key.revoked = Boolean(input.revoked);
  key.updatedAt = nowIso();
  writeDb(db);
  return { ...key, devices: key.devices.map((d) => ({ ...d })) };
}

export function recordAccessUsage(input: {
  userId?: string;
  keyToken?: string;
  sessionsDelta?: number;
  messagesDelta?: number;
}): AccessUser | null {
  const db = readDb();
  let user: AccessUser | undefined;
  if (input.userId) user = db.users.find((u) => u.id === input.userId);
  if (!user && input.keyToken) {
    const key = db.keys.find((k) => k.token === input.keyToken);
    if (key) user = db.users.find((u) => u.id === key.userId);
  }
  if (!user) return null;
  user.usage.sessions += Math.max(0, input.sessionsDelta ?? 0);
  user.usage.messages += Math.max(0, input.messagesDelta ?? 0);
  user.usage.lastSeenAt = nowIso();
  user.updatedAt = user.usage.lastSeenAt;
  writeDb(db);
  return { ...user, usage: { ...user.usage } };
}
