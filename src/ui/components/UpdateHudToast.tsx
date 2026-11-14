/**
 * Floating HUD-style update notification (Mira aesthetic).
 * Shown when packaged auto-check finds an update / download / error.
 * Respects Settings → Всплывающие уведомления.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  categoryAllowed,
  loadNotifyPrefs,
  normalizeNotifyPrefs,
  NOTIFY_PREFS_EVENT,
  playNotifySound,
  saveNotifyPrefsLocal,
  type NotifyPrefs,
} from "../notifyPrefs";

export type UpdateHudToastProps = {
  /** Optional force-visible status for demos / tests. */
  demoStatus?: MiraUpdateStatus | null;
  /**
   * Always-on-top overlay window (#/update-hud): fill the BrowserWindow,
   * notify main on dismiss so it stays hidden above other apps.
   */
  overlayWindow?: boolean;
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

export function UpdateHudToast({
  demoStatus = null,
  overlayWindow = false,
}: UpdateHudToastProps) {
  const [status, setStatus] = useState<MiraUpdateStatus | null>(demoStatus);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<NotifyPrefs>(() => loadNotifyPrefs());
  /** Session hide for a specific available/downloaded version — don't spam. */
  const dismissedVersionRef = useRef<string | null>(null);
  const lastChannelRef = useRef<string | null>(null);
  const soundedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!overlayWindow) return;
    document.documentElement.classList.add("mira-update-hud-root");
    document.body.classList.add("mira-update-hud-root");
    return () => {
      document.documentElement.classList.remove("mira-update-hud-root");
      document.body.classList.remove("mira-update-hud-root");
    };
  }, [overlayWindow]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (window.mira?.getNotifyPrefs) {
        try {
          const remote = await window.mira.getNotifyPrefs();
          if (cancelled) return;
          const next = saveNotifyPrefsLocal(normalizeNotifyPrefs(remote));
          setPrefs(next);
        } catch {
          if (!cancelled) setPrefs(loadNotifyPrefs());
        }
      }
    })();
    function onLocal(e: Event) {
      const detail = (e as CustomEvent<NotifyPrefs>).detail;
      if (detail) setPrefs(normalizeNotifyPrefs(detail));
      else setPrefs(loadNotifyPrefs());
    }
    window.addEventListener(NOTIFY_PREFS_EVENT, onLocal);
    const unsub = window.mira?.onNotifyPrefs?.((next) => {
      const normalized = saveNotifyPrefsLocal(normalizeNotifyPrefs(next));
      setPrefs(normalized);
    });
    return () => {
      cancelled = true;
      window.removeEventListener(NOTIFY_PREFS_EVENT, onLocal);
      unsub?.();
    };
  }, []);

  const applyStatus = useCallback((next: MiraUpdateStatus) => {
    setStatus(next);
    lastChannelRef.current = next.channel;

    if (!isActionable(next.channel)) return;

    const ver = next.availableVersion || next.channel;
    if (
      next.channel === "available" &&
      dismissedVersionRef.current &&
      dismissedVersionRef.current === ver
    ) {
      setDismissed(true);
      return;
    }
    if (next.channel === "downloading" || next.channel === "downloaded") {
      dismissedVersionRef.current = null;
      setDismissed(false);
      return;
    }
    if (next.channel === "error") {
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

  useEffect(() => {
    if (demoStatus) return;
    if (!window.mira?.checkForUpdates || !window.mira?.getUpdateStatus) return;
    let cancelled = false;

    async function waitWhileChecking(
      maxMs: number,
    ): Promise<MiraUpdateStatus | null> {
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

        if (
          st.channel === "available" ||
          st.channel === "downloaded" ||
          st.channel === "downloading"
        ) {
          return;
        }

        if (st.channel === "checking" || !st.canCheck) {
          const settled = await waitWhileChecking(45_000);
          if (cancelled || !settled) return;
          applyStatus(settled);
          return;
        }

        if (!opts.forceCheck) return;

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
    const key =
      status?.channel === "error"
        ? `error:${ver}`
        : `${status?.channel || lastChannelRef.current || "unknown"}:${status?.availableVersion || ver}`;
    dismissedVersionRef.current =
      status?.channel === "error" ? `error:${ver}` : ver;
    setDismissed(true);
    if (overlayWindow && window.mira?.dismissUpdateHud) {
      void window.mira.dismissUpdateHud(key);
    }
  }, [status, overlayWindow]);

  // Auto-dismiss by duration prefs (sticky when 0).
  useEffect(() => {
    if (!status || dismissed) return;
    if (!prefs.hudEnabled) return;
    if (prefs.durationSec <= 0) return;
    if (status.channel === "downloading") return;
    const t = window.setTimeout(() => {
      hide();
    }, prefs.durationSec * 1000);
    return () => window.clearTimeout(t);
  }, [status, dismissed, prefs.hudEnabled, prefs.durationSec, hide]);

  // Sound once per actionable channel+version.
  useEffect(() => {
    if (!status || dismissed) return;
    if (!prefs.hudEnabled) return;
    if (!isActionable(status.channel)) return;
    const key = `${status.channel}:${status.availableVersion || ""}`;
    if (soundedForRef.current === key) return;
    soundedForRef.current = key;
    playNotifySound(prefs);
  }, [status, dismissed, prefs]);

  if (!status || dismissed) return null;
  if (!prefs.hudEnabled) return null;
  const cat =
    status.channel === "error" ? ("errors" as const) : ("updates" as const);
  if (!categoryAllowed(prefs, cat)) return null;

  const kind = kindFromChannel(status.channel);
  if (!kind) return null;
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
      className={`mira-update-hud mira-update-hud--${kind}${
        overlayWindow
          ? " mira-update-hud--overlay"
          : ` mira-update-hud--pos-${prefs.position}`
      }`}
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
              style={{
                width: `${Math.max(0, Math.min(100, status.progress))}%`,
              }}
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

  if (overlayWindow || typeof document === "undefined") return toast;
  return createPortal(toast, document.body);
}
