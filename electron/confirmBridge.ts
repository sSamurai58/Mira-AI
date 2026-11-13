import { BrowserWindow, ipcMain } from "electron";
import {
  shouldRequestConfirm,
  type ConfirmClass,
  type ConfirmRisk,
} from "./confirmPolicy";
import { assertIpcAuth } from "./ipcSecurity";

export type SkillProposeForm = {
  defaultId: string;
  defaultName: string;
  summary: string;
  existingIds: string[];
  sourceTitle: string;
};

export type ConfirmRequest = {
  id: string;
  title: string;
  body: string;
  confirmLabel?: string;
  skillPropose?: SkillProposeForm;
};

export type ConfirmFields = {
  skillId?: string;
  skillName?: string;
};

export type ConfirmResult = {
  accepted: boolean;
  fields?: ConfirmFields;
};

type Pending = {
  resolve: (result: ConfirmResult) => void;
};

const pending = new Map<string, Pending>();
let wired = false;

export function wireConfirmBridge(): void {
  if (wired) return;
  wired = true;
  ipcMain.handle(
    "mira:confirm-response",
    (
      event,
      token: unknown,
      id: string,
      accepted: boolean,
      fields?: ConfirmFields,
    ) => {
      assertIpcAuth(event, token);
      const p = pending.get(id);
      if (!p) return { ok: false };
      pending.delete(id);
      p.resolve({
        accepted: Boolean(accepted),
        fields: fields && typeof fields === "object" ? fields : undefined,
      });
      return { ok: true };
    },
  );
}

function autoConfirmResult(
  req: Omit<ConfirmRequest, "id"> & { id?: string },
): ConfirmResult | null {
  const auto = (process.env.MIRA_CONFIRM_AUTO ?? "").trim().toLowerCase();
  if (auto === "accept" || auto === "1" || auto === "true") {
    return {
      accepted: true,
      fields: req.skillPropose
        ? {
            skillId: req.skillPropose.defaultId,
            skillName: req.skillPropose.defaultName,
          }
        : undefined,
    };
  }
  if (auto === "deny" || auto === "0" || auto === "false") {
    return { accepted: false };
  }
  return null;
}

export function requestUserConfirmDetailed(
  req: Omit<ConfirmRequest, "id"> & {
    id?: string;
    actionClass?: ConfirmClass;
    risk?: ConfirmRisk;
  },
  timeoutMs = 120_000,
): Promise<ConfirmResult> {
  const auto = autoConfirmResult(req);
  if (auto) return Promise.resolve(auto);

  const actionClass = req.actionClass ?? "backup";
  const risk = req.risk ?? "high";
  if (!shouldRequestConfirm(actionClass, risk)) {
    return Promise.resolve({
      accepted: true,
      fields: req.skillPropose
        ? {
            skillId: req.skillPropose.defaultId,
            skillName: req.skillPropose.defaultName,
          }
        : undefined,
    });
  }

  const id = req.id ?? crypto.randomUUID();
  const payload: ConfirmRequest = {
    id,
    title: req.title,
    body: req.body,
    confirmLabel: req.confirmLabel,
    skillPropose: req.skillPropose,
  };

  // Prefer the main Mira window — never the compact HUD (#/hud), which has no
  // ConfirmModal and used to leave the main UI stuck behind a dead request.
  const windows = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
  const targets = windows.filter((w) => {
    try {
      const url = w.webContents.getURL();
      return !url.includes("#/hud") && !url.includes("#hud");
    } catch {
      return true;
    }
  });
  const sendTo = targets.length ? targets : windows;

  if (sendTo.length === 0) {
    return Promise.resolve({ accepted: false });
  }

  for (const win of sendTo) {
    win.webContents.send("mira:confirm-request", payload);
  }

  return new Promise<ConfirmResult>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue;
        win.webContents.send("mira:confirm-dismiss", { id });
      }
      resolve({ accepted: false });
    }, timeoutMs);
    pending.set(id, {
      resolve: (result) => {
        clearTimeout(timer);
        resolve(result);
      },
    });
  });
}

/** Boolean confirm for existing callers. */
export function requestUserConfirm(
  req: Omit<ConfirmRequest, "id"> & {
    id?: string;
    actionClass?: ConfirmClass;
    risk?: ConfirmRisk;
  },
  timeoutMs = 120_000,
): Promise<boolean> {
  return requestUserConfirmDetailed(req, timeoutMs).then((r) => r.accepted);
}
