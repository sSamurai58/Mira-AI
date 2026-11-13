/** Normalize fence hint + light heuristic when language is missing. */

const ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  tsx: "tsx",
  jsx: "jsx",
  py: "python",
  rb: "ruby",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  ps1: "powershell",
  pwsh: "powershell",
  yml: "yaml",
  md: "markdown",
  rs: "rust",
  csharp: "c#",
  cs: "c#",
  cpp: "c++",
  cxx: "c++",
  htaccess: "apache",
  dockerfile: "docker",
};

export function normalizeLangHint(hint: string): string {
  const raw = hint.trim().toLowerCase().split(/\s+/)[0] ?? "";
  if (!raw) return "";
  return ALIASES[raw] ?? raw;
}

export function detectCodeLanguage(code: string, hint = ""): string {
  const fromHint = normalizeLangHint(hint);
  if (fromHint) return fromHint;

  const s = code.trim();
  if (!s) return "text";

  if (
    (/^#!/.test(s) && /bash|sh|zsh/.test(s.slice(0, 40))) ||
    /^\s*(sudo\s+)?(apt|yum|brew|npm|pnpm|yarn|cargo|pip)\b/m.test(s)
  ) {
    return "bash";
  }
  if (
    /^\s*(import|from)\s+\w+/m.test(s) &&
    /\b(def|print|elif|None|True|False)\b/.test(s)
  ) {
    return "python";
  }
  if (/\b(fn\s+\w+|let\s+mut|impl\s+|cargo)\b/.test(s)) return "rust";
  if (/\b(package\s+\w+|func\s+\w+\(|fmt\.)\b/.test(s)) return "go";
  if (
    /^\s*(using\s+System|namespace\s+\w+|Console\.Write)/m.test(s) ||
    /\b(public\s+class|async\s+Task)\b/.test(s)
  ) {
    return "c#";
  }
  if (
    /^\s*(#include\s*<|int\s+main\s*\()/m.test(s) ||
    /\bstd::/.test(s)
  ) {
    return "c++";
  }
  if (
    /^\s*(interface|type)\s+\w+/m.test(s) &&
    /\b(export\s+)?(type|interface|enum)\b/.test(s)
  ) {
    return "typescript";
  }
  if (
    /\b(const|let|var|function|=>|console\.log)\b/.test(s) ||
    /^\s*import\s+.+from\s+['"]/m.test(s)
  ) {
    return "javascript";
  }
  if (/^\s*</.test(s) && /<\/?[a-zA-Z]/.test(s)) return "html";
  if (/^\s*[{[]/.test(s) && /"[^"]+"\s*:/.test(s)) return "json";
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(s)) return "sql";
  if (/^\s*(apiVersion|kind):\s*\w+/m.test(s)) return "yaml";
  if (/^\s*\{[\s\S]*"scripts"\s*:/.test(s)) return "json";

  return "text";
}
