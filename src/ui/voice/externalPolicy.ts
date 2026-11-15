/**
 * Policy for sending audio/text outside the device (cloud TTS, remote proofread).
 */

export type ExternalPolicy = {
  /** When true, cloud TTS / external calls are forbidden without confirm */
  blockExternal: boolean;
  /** Require spoken/UI confirm before each external synth */
  confirmEachExternal: boolean;
};

const KEY = "mira.externalPolicy.v1";

const DEFAULT: ExternalPolicy = {
  blockExternal: false,
  confirmEachExternal: true,
};

export function getExternalPolicy(): ExternalPolicy {
  if (typeof localStorage === "undefined") return { ...DEFAULT };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null") as
      | Partial<ExternalPolicy>
      | null;
    return {
      blockExternal: Boolean(raw?.blockExternal),
      confirmEachExternal:
        raw?.confirmEachExternal === undefined
          ? true
          : Boolean(raw.confirmEachExternal),
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function setExternalPolicy(
  patch: Partial<ExternalPolicy>,
): ExternalPolicy {
  const next = { ...getExternalPolicy(), ...patch };
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(next));
  }
  return next;
}

export type ExternalGate =
  | { allow: true }
  | { allow: false; reason: string; needsConfirm: boolean };

/** Gate before ElevenLabs / any cloud TTS. */
export function gateExternalTts(): ExternalGate {
  const p = getExternalPolicy();
  if (p.blockExternal) {
    return {
      allow: false,
      reason: "Внешние вызовы запрещены (режим личных заметок)",
      needsConfirm: false,
    };
  }
  if (p.confirmEachExternal) {
    return {
      allow: false,
      reason: "Нужно подтверждение перед облачным TTS",
      needsConfirm: true,
    };
  }
  return { allow: true };
}

/** One-shot grant after user confirms (session memory). */
let sessionGrant = false;

export function grantExternalOnce(): void {
  sessionGrant = true;
}

export function consumeExternalGrant(): boolean {
  if (!sessionGrant) return false;
  sessionGrant = false;
  return true;
}

export function clearExternalGrant(): void {
  sessionGrant = false;
}

export function gateExternalTtsWithGrant(): ExternalGate {
  const base = gateExternalTts();
  if (base.allow) return base;
  if (base.needsConfirm && consumeExternalGrant()) {
    return { allow: true };
  }
  return base;
}
