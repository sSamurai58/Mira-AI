/**
 * Floating HUD-style update notification (Mira aesthetic).
 * Shown when packaged auto-check finds an update / download / error.
 * Not OS-native only — matches Core / HUD chrome.
 */

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type UpdateHudToastProps = {
  /** Optional force-visible status for demos / tests. */
  demoStatus?: MiraUpdateStatus | null;
};

type ToastKind = "available" | "downloading" | "downloaded" | "error" | "info";

function kindFromChannel(channel: string): ToastKind | null {
  if (channel === "available") return "available";
  if (channel === "downloading") return "downloading";
  if (channel === "downloaded") return "downloaded";
  if (channel === "error") return "error";
  if (channel === "checking") return "info";
  return null;
}

export function UpdateHudToast({ demoStatus = null }: UpdateHudToastProps) {
  const [status, setStatus] = useState<MiraUpdateStatus | null>(demoStatus);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (demoStatus) {
      setStatus(demoStatus);
      setDismissed(false);
    }
  }, [demoStatus]);

  useEffect(() => {
    if (!window.mira?.onUpdateEvent) return;
    const unsub = window.mira.onUpdateEvent((next) => {
      setStatus(next as MiraUpdateStatus);
      // Re-show when a meaningful channel arrives.
      if (
        next.channel === "available" ||
        next.channel === "downloaded" ||
        next.channel === "error" ||
        next.channel === "downloading"
      ) {
        setDismissed(false);
      }
    });
    return () => unsub?.();
  }, []);

  // Auto-check on startup (packaged). Dev stays silent unless demoStatus.
  useEffect(() => {
    if (demoStatus) return;
    if (!window.mira?.checkForUpdates || !window.mira?.getUpdateStatus) return;
    let cancelled = false;
    void (async () => {
      try {
        const st = await window.mira!.getUpdateStatus!();
        if (cancelled) return;
        setStatus(st);
        if (!st.packaged || !st.canCheck) return;
        // Delay slightly so Home HUD paints first.
        await new Promise((r) => setTimeout(r, 1800));
        if (cancelled) return;
        const next = await window.mira!.checkForUpdates!();
        if (!cancelled) setStatus(next);
      } catch {
        /* keep quiet on boot probe failure — Settings still works */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [demoStatus]);

  const download = useCallback(async () => {
    if (!window.mira?.downloadUpdate) return;
    setBusy(true);
    try {
      const next = await window.mira.downloadUpdate();
      setStatus(next);
    } finally {
      setBusy(false);
    }
  }, []);

  const install = useCallback(async () => {
    if (!window.mira?.quitAndInstall) return;
    setBusy(true);
    try {
      await window.mira.quitAndInstall();
    } finally {
      setBusy(false);
    }
  }, []);

  if (!status || dismissed) return null;
  const kind = kindFromChannel(status.channel);
  if (!kind) return null;
  // Don't toast "checking" forever or not-available.
  if (kind === "info" && status.channel === "checking") return null;

  const title =
    kind === "available"
      ? `Доступна ${status.availableVersion || "новая версия"}`
      : kind === "downloading"
        ? "Скачивание обновления…"
        : kind === "downloaded"
          ? "Обновление готово"
          : kind === "error"
            ? "Обновление: нет связи"
            : "Обновления";

  const toast = (
    <div
      className={`mira-update-hud mira-update-hud--${kind}`}
      role="status"
      aria-live="polite"
    >
      <div className="mira-update-hud-glow" aria-hidden />
      <div className="mira-update-hud-body">
        <div className="mira-update-hud-kicker">MIRA · UPDATE</div>
        <div className="mira-update-hud-title">{title}</div>
        <p className="mira-update-hud-detail">{status.detail}</p>
        {status.progress != null && kind === "downloading" ? (
          <div className="mira-update-hud-progress" aria-hidden>
            <div
              className="mira-update-hud-progress-bar"
              style={{ width: `${Math.max(0, Math.min(100, status.progress))}%` }}
            />
          </div>
        ) : null}
        <div className="mira-update-hud-actions">
          {status.canDownload ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void download()}
            >
              Скачать
            </button>
          ) : null}
          {status.canInstall ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void install()}
            >
              Обновить и перезапустить
            </button>
          ) : null}
          <button
            type="button"
            className="btn"
            onClick={() => setDismissed(true)}
          >
            Скрыть
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return toast;
  return createPortal(toast, document.body);
}
