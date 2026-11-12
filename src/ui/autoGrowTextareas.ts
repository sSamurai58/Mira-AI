/** Grow textareas to fit content app-wide (except chat rainbow composer). */

const SKIP_SELECTOR = ".rainbow-field textarea, textarea[data-autogrow='off']";

function maxHeightPx(el: HTMLTextAreaElement): number {
  const raw = el.dataset.autogrowMax;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return Math.round(window.innerHeight * 0.7);
}

function minHeightPx(el: HTMLTextAreaElement): number {
  const raw = el.dataset.autogrowMin;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 96;
}

export function syncTextareaHeight(el: HTMLTextAreaElement): void {
  if (el.matches(SKIP_SELECTOR) || el.closest(".rainbow-field")) return;

  const min = minHeightPx(el);
  const max = maxHeightPx(el);

  el.style.height = "auto";
  const content = Math.max(el.scrollHeight, min);
  const next = Math.min(content, max);
  el.style.height = `${next}px`;
  el.style.overflowY = content > max ? "auto" : "hidden";
}

function syncAll(root: ParentNode = document): void {
  root.querySelectorAll("textarea").forEach((node) => {
    if (node instanceof HTMLTextAreaElement) syncTextareaHeight(node);
  });
}

/**
 * Install document-level auto-grow for every textarea in Mira.
 * Handles typing, DOM inserts, and focus. Pair with CSS `field-sizing: content`.
 */
export function installAutoGrowTextareas(): () => void {
  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      syncAll();
    });
  };

  const onTarget = (e: Event) => {
    const t = e.target;
    if (t instanceof HTMLTextAreaElement) syncTextareaHeight(t);
  };

  document.addEventListener("input", onTarget, true);
  document.addEventListener("change", onTarget, true);
  document.addEventListener("focusin", onTarget, true);
  window.addEventListener("resize", schedule);

  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type !== "childList") continue;
      for (const node of m.addedNodes) {
        if (
          node instanceof HTMLTextAreaElement ||
          (node instanceof HTMLElement && node.querySelector("textarea"))
        ) {
          schedule();
          return;
        }
      }
    }
  });
  mo.observe(document.body, {
    childList: true,
    subtree: true,
  });

  schedule();

  return () => {
    document.removeEventListener("input", onTarget, true);
    document.removeEventListener("change", onTarget, true);
    document.removeEventListener("focusin", onTarget, true);
    window.removeEventListener("resize", schedule);
    mo.disconnect();
    if (raf) cancelAnimationFrame(raf);
  };
}
