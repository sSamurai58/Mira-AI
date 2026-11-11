import { requestUserConfirm } from "../confirmBridge";
import {
  ensureDefaultTerminal,
  getTerminalPrefs,
  runCommandInTerminal,
} from "../terminal/manager";

export type TerminalPolicy = {
  enabled: boolean;
  requireConfirmDangerous: boolean;
  prefs: ReturnType<typeof getTerminalPrefs>;
};

const DANGEROUS =
  /(^|[\s;|&])(rm\s+-rf\s+(\/|~)|mkfs\.|dd\s+if=|shutdown|reboot|:\(\)\s*\{|chmod\s+-R\s+777\s+\/|chown\s+-R\s|curl\b[^\n]*\|\s*(ba)?sh|wget\b[^\n]*\|\s*(ba)?sh)/i;

export function getTerminalPolicy(): TerminalPolicy {
  return {
    enabled:
      (process.env.TERMINAL_ENABLED ?? "true").trim().toLowerCase() !== "false",
    requireConfirmDangerous:
      (process.env.TERMINAL_CONFIRM_DANGEROUS ?? "true")
        .trim()
        .toLowerCase() !== "false",
    prefs: getTerminalPrefs(),
  };
}

export function isDangerousTerminalCommand(command: string): boolean {
  return DANGEROUS.test(command);
}

export function looksLikeTerminalIntent(text: string): boolean {
  return /(выполни в терминале|запусти в терминале|run in terminal|в терминале выполни|shell:|терминал:)/i.test(
    text,
  );
}

export function extractTerminalCommand(text: string): string | null {
  const patterns = [
    /выполни в терминале\s*[:：]?\s*(.+)$/i,
    /запусти в терминале\s*[:：]?\s*(.+)$/i,
    /в терминале выполни\s*[:：]?\s*(.+)$/i,
    /run in terminal\s*[:：]?\s*(.+)$/i,
    /(?:shell|терминал)\s*[:：]\s*(.+)$/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

export async function executeTerminalFromChat(command: string): Promise<{
  ok: boolean;
  mode: "ran" | "denied" | "disabled";
  sessionId: string | null;
  output: string;
  detail: string;
  dangerous: boolean;
}> {
  const policy = getTerminalPolicy();
  if (!policy.enabled) {
    return {
      ok: false,
      mode: "disabled",
      sessionId: null,
      output: "",
      detail: "Терминал выключен (TERMINAL_ENABLED=false).",
      dangerous: false,
    };
  }

  const dangerous = isDangerousTerminalCommand(command);
  if (dangerous || policy.requireConfirmDangerous) {
    // Always confirm for dialog-driven commands in P7 (always until F12),
    // and additionally emphasize dangerous ones.
    const ok = await requestUserConfirm({
      title: dangerous
        ? "Опасная команда в терминале"
        : "Выполнить в терминале",
      body: `Mira выполнит в встроенном терминале:\n\n${command}\n\n${dangerous ? "Команда выглядит разрушительной. " : ""}Разрешить?`,
      confirmLabel: "Выполнить",
    });
    if (!ok) {
      return {
        ok: false,
        mode: "denied",
        sessionId: null,
        output: "",
        detail: "Отклонено пользователем",
        dangerous,
      };
    }
  }

  ensureDefaultTerminal();
  const result = await runCommandInTerminal(command, { waitMs: 5000 });
  return {
    ok: true,
    mode: "ran",
    sessionId: result.sessionId,
    output: result.output,
    detail: `Выполнено в сессии ${result.sessionId} (${result.backend})`,
    dangerous,
  };
}

export function formatTerminalBlock(result: {
  ok: boolean;
  mode: string;
  output: string;
  detail: string;
  dangerous: boolean;
}): string {
  return `[Терминал: ${result.mode}${result.dangerous ? " · dangerous" : ""}]\n${result.detail}\n---\n${result.output || "(нет вывода)"}`;
}
