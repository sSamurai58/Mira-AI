import { useEffect } from "react";

const OPEN_CLASS = "mira-modal-open";
let lockCount = 0;

function applyLockClass(on: boolean): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  const body = document.body;
  if (on) {
    html.classList.add(OPEN_CLASS);
    body.classList.add(OPEN_CLASS);
  } else {
    html.classList.remove(OPEN_CLASS);
    body.classList.remove(OPEN_CLASS);
  }
}

/**
 * While a modal is open: freeze underlying app scrollers and raise the
 * modal stacking layer. Pair with createPortal(..., document.body).
 * Nested modals share one lock via a process-wide counter.
 */
export function useModalLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    lockCount += 1;
    applyLockClass(true);

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) applyLockClass(false);
    };
  }, [active]);
}
