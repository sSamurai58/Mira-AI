import { BrowserWindow, ipcMain } from "electron";

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
  ipcMain.handle("mira:confirm-response", (_e, id: string, accepted: boolean) => {
    const p = pending.get(id);
    if (!p) return { ok: false };
    pending.delete(id);
    p.resolve(Boolean(accepted));
    return { ok: true };
  });
}

export function requestUserConfirm(
  req: Omit<ConfirmRequest, "id"> & { id?: string },
  timeoutMs = 120_000,
): Promise<boolean> {
  const id = req.id ?? crypto.randomUUID();
  const payload: ConfirmRequest = {
    id,
    title: req.title,
    body: req.body,
    confirmLabel: req.confirmLabel,
  };

  for (const win of BrowserWindow.getAllWindows()) {
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
