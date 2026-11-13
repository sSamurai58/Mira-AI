/**
 * Floating HUD-style update notification (Mira aesthetic).
 * Shown when packaged auto-check finds an update / download / error.
 * Not OS-native only — matches Core / HUD chrome.
 */

import { useCallback, useEffect, useRef, useState } from "react";
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

function isActionable(channel: string): boolean {
  return (
    channel === "available" ||
    channel === "downloaded" ||
    channel === "error" ||
    channel === "downloading"
  );
}

export function UpdateHudToast({ demoStatus = null }: UpdateHudToastProps) {
  const [status, setStatus] = useState<MiraUpdateStatus | null>(demoStatus);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Session hide for a specific available/downloaded version — don't spam. */
  const dismissedVersionRef = useRef<string | null>(null);
  const lastChannelRef = useRef<string | null>(null);

  const applyStatus = useCallback((next: MiraUpdateStatus) => {
    setStatus(next);
    lastChannelRef.current = next.channel;

    if (!isActionable(next.channel)) return;

    const ver = next.availableVersion || next.channel;
    // Re-show when channel advances (available → downloading → downloaded)
    // or when a different version appears. Respect «Скрыть» for the same
    // available version within the session.
    if (
      next.channel === "available" &&
      dismissedVersionRef.current &&
      dismissedVersionRef.current === ver
    ) {
      setDismissed(true);
      return;
    }
    if (next.channel === "downloading" || next.channel === "downloaded") {
      // User started / finished download — always surface.
      dismissedVersionRef.current = null;
      setDismissed(false);
      return;
    }
    if (next.channel === "error") {
      // Don't fight a deliberate hide of "available", but show fresh errors
      // after a check the user didn't dismiss as error.
      if (dismissedVersionRef.current === `error:${ver}`) {
        setDismissed(true);
        return;
      }
      setDismissed(false);
      return;
    }
    setDismissed(false);
  }, []);

  useEffect(() => {
    if (demoStatus) {
      applyStatus(demoStatus);
    }
  }, [demoStatus, applyStatus]);

  useEffect(() => {
    if (!window.mira?.onUpdateEvent) return;
    const unsub = window.mira.onUpdateEvent((next) => {
      applyStatus(next as MiraUpdateStatus);
    });
    return () => unsub?.();
  }, [applyStatus]);

  // Auto-check on startup (packaged). Dev stays silent unless demoStatus.
  // Also re-sync when the window becomes visible again (pending update).
  useEffect(() => {
    if (demoStatus) return;
    if (!window.mira?.checkForUpdates || !window.mira?.getUpdateStatus) return;
    let cancelled = false;

    async function waitWhileChecking(maxMs: number): Promise<MiraUpdateStatus | null> {
      const started = Date.now();
      while (!cancelled && Date.now() - started < maxMs) {
        const st = await window.mira!.getUpdateStatus!();
        if (cancelled) return null;
        if (st.channel !== "checking" && st.channel !== "downloading") {
          return st;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      try {
        return await window.mira!.getUpdateStatus!();
      } catch {
        return null;
      }
    }

    async function probe(opts: { forceCheck: boolean }) {
      try {
        const st = await window.mira!.getUpdateStatus!();
        if (cancelled) return;
        applyStatus(st);

        if (!st.packaged) return;

        // Already have something to show — no need to hit the network again.
        if (
          st.channel === "available" ||
          st.channel === "downloaded" ||
          st.channel === "downloading"
        ) {
          return;
        }

        // Main may already be checking (did-finish-load schedule). Wait it out
        // instead of bailing on !canCheck (that used to drop the auto toast).
        if (st.channel === "checking" || !st.canCheck) {
          const settled = await waitWhileChecking(45_000);
          if (cancelled || !settled) return;
          applyStatus(settled);
          return;
        }

        if (!opts.forceCheck) return;

        // Brief delay so Home HUD paints first.
        await new Promise((r) => setTimeout(r, 900));
        if (cancelled) return;
        const next = await window.mira!.checkForUpdates!();
        if (!cancelled) applyStatus(next);
      } catch {
        /* keep quiet on boot probe failure — Settings still works */
      }
    }

    void probe({ forceCheck: true });

    const onFocus = () => {
      void probe({ forceCheck: false });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void probe({ forceCheck: false });
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [demoStatus, applyStatus]);

  const download = useCallback(async () => {
    if (!window.mira?.downloadUpdate) return;
    setBusy(true);
    try {
      const next = await window.mira.downloadUpdate();
      applyStatus(next);
    } finally {
      setBusy(false);
    }
  }, [applyStatus]);

  const install = useCallback(async () => {
    if (!window.mira?.quitAndInstall) return;
    setBusy(true);
    try {
      await window.mira.quitAndInstall();
    } finally {
      setBusy(false);
    }
  }, []);

  const hide = useCallback(() => {
    const ver =
      status?.availableVersion ||
      status?.channel ||
      lastChannelRef.current ||
      "unknown";
    if (status?.channel === "error") {
      dismissedVersionRef.current = `error:${ver}`;
    } else {
      dismissedVersionRef.current = ver;
    }
    setDismissed(true);
  }, [status]);

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
          <button type="button" className="btn" onClick={hide}>
            Скрыть
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return toast;
  return createPortal(toast, document.body);
}
