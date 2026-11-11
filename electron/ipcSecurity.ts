import { BrowserWindow, type IpcMainInvokeEvent } from "electron";
import crypto from "node:crypto";
export { getOwnerId } from "./owner";

let ipcToken = "";

export function initIpcSecurity(): string {
  ipcToken = crypto.randomBytes(24).toString("hex");
  process.env.MIRA_IPC_TOKEN = ipcToken;
  return ipcToken;
}

export function getIpcToken(): string {
  return ipcToken || process.env.MIRA_IPC_TOKEN || "";
}

/** Desktop privileged tools (PTY, FS import, screen, etc.). Off in web-safe mode. */
export function desktopToolsEnabled(): boolean {
  const raw = (process.env.MIRA_DESKTOP_TOOLS ?? "true").trim().toLowerCase();
  if (raw === "false" || raw === "0") return false;
  // Hosted/web-safe explicit kill switch
  if ((process.env.MIRA_WEB_SAFE ?? "").trim().toLowerCase() === "true") {
    return false;
  }
  return true;
}

function senderIsOurWindow(event: IpcMainInvokeEvent): boolean {
  const sender = event.sender;
  return BrowserWindow.getAllWindows().some((w) => w.webContents.id === sender.id);
}

function senderUrlAllowed(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? "";
  if (!url) return false;
  if (url.startsWith("file://")) return true;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname;
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}

export function assertIpcAuth(
  event: IpcMainInvokeEvent,
  token: unknown,
  opts?: { privileged?: boolean },
): void {
  if (!senderIsOurWindow(event) || !senderUrlAllowed(event)) {
    throw new Error("IPC forbidden: untrusted sender");
  }
  const expected = getIpcToken();
  if (!expected || token !== expected) {
    throw new Error("IPC forbidden: invalid auth token");
  }
  if (opts?.privileged && !desktopToolsEnabled()) {
    throw new Error(
      "Privileged desktop tools disabled (MIRA_DESKTOP_TOOLS=false / MIRA_WEB_SAFE=true).",
    );
  }
}

export function authed<T extends unknown[]>(
  fn: (event: IpcMainInvokeEvent, ...args: T) => unknown,
  opts?: { privileged?: boolean },
): (event: IpcMainInvokeEvent, token: unknown, ...args: T) => unknown {
  return (event, token, ...args) => {
    assertIpcAuth(event, token, opts);
    return fn(event, ...args);
  };
}
