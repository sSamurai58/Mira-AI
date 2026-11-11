export type ConfirmMode = "always" | "smart" | "dangerous-list";

export type ConfirmClass =
  | "web-fetch"
  | "screen"
  | "browser"
  | "messaging"
  | "mail"
  | "terminal"
  | "forget"
  | "files"
  | "iot"
  | "camera"
  | "blender"
  | "backup"
  | "skill";

export type ConfirmRisk = "low" | "high";

const DEFAULT_DANGEROUS: ConfirmClass[] = [
  "messaging",
  "mail",
  "terminal",
  "forget",
  "files",
  "iot",
  "camera",
  "screen",
  "backup",
];

function parseList(raw: string | undefined): ConfirmClass[] {
  if (!raw?.trim()) return [...DEFAULT_DANGEROUS];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as ConfirmClass[];
}

export function getConfirmPolicy(): {
  mode: ConfirmMode;
  dangerousList: ConfirmClass[];
} {
  const modeRaw = (process.env.MIRA_CONFIRM_MODE ?? "always")
    .trim()
    .toLowerCase();
  const mode: ConfirmMode =
    modeRaw === "smart" || modeRaw === "dangerous-list" ? modeRaw : "always";
  return {
    mode,
    dangerousList: parseList(process.env.MIRA_CONFIRM_DANGEROUS),
  };
}

export function setConfirmPolicyEnv(input: {
  mode?: ConfirmMode;
  dangerousList?: ConfirmClass[];
}): void {
  if (input.mode) process.env.MIRA_CONFIRM_MODE = input.mode;
  if (input.dangerousList) {
    process.env.MIRA_CONFIRM_DANGEROUS = input.dangerousList.join(",");
  }
}

/** Whether UI confirm is required for this action class/risk. */
export function shouldRequestConfirm(
  actionClass: ConfirmClass,
  risk: ConfirmRisk = "high",
): boolean {
  const { mode, dangerousList } = getConfirmPolicy();
  if (mode === "always") return true;
  if (mode === "dangerous-list") {
    return dangerousList.includes(actionClass);
  }
  // smart: only high-risk or explicitly dangerous classes
  if (risk === "low") return false;
  return dangerousList.includes(actionClass) || risk === "high";
}
