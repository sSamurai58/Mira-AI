import { BrowserWindow, ipcMain } from "electron";
import { assertIpcAuth } from "./ipcSecurity";

export type ConfirmRequest = {
  id: string;
  title: string;
  body: string;
  confirmLabel?: string;
};

type Pending = {
  resolve: (ok: boolean) => void;
};

const pending = new Map<string, Pending>();
let wired = false;

export function wireConfirmBridge(): void {
  if (wired) return;
  wired = true;
  ipcMain.handle(
    "mira:confirm-response",
    (event, token: unknown, id: string, accepted: boolean) => {
      assertIpcAuth(event, token);
      const p = pending.get(id);
      if (!p) return { ok: false };
      pending.delete(id);
      p.resolve(Boolean(accepted));
      return { ok: true };
    },
  );
}

export function requestUserConfirm(
  req: Omit<ConfirmRequest, "id"> & { id?: string },
  timeoutMs = 120_000,
): Promise<boolean> {
  const auto = (process.env.MIRA_CONFIRM_AUTO ?? "").trim().toLowerCase();
  if (auto === "accept" || auto === "1" || auto === "true") {
    return Promise.resolve(true);
  }
  if (auto === "deny" || auto === "0" || auto === "false") {
    return Promise.resolve(false);
  }

  const id = req.id ?? crypto.randomUUID();
  const payload: ConfirmRequest = {
    id,
    title: req.title,
    body: req.body,
    confirmLabel: req.confirmLabel,
  };

  const windows = BrowserWindow.getAllWindows();
  if (windows.length === 0) {
    // Headless/smoke without UI: deny rather than hang until timeout.
    return Promise.resolve(false);
  }

  for (const win of windows) {
    win.webContents.send("mira:confirm-request", payload);
  }

  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(false);
    }, timeoutMs);
    pending.set(id, {
      resolve: (ok) => {
        clearTimeout(timer);
        resolve(ok);
      },
    });
  });
}
