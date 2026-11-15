/**
 * Deterministic local proofreader — NOT an LLM.
 * Flags mechanical issues; caller decides whether to apply.
 */

export type ProofIssue = {
  id: string;
  group:
    | "spaces"
    | "repeat"
    | "punct"
    | "case"
    | "quotes"
    | "ellipsis"
    | "numbers"
    | "consistency";
  message: string;
  start: number;
  end: number;
  suggestion?: string;
};

export type ProofReport = {
  issues: ProofIssue[];
  /** Text with safe auto-fixes only (spaces, double punct) */
  autoFixed: string;
};

let issueSeq = 0;
function issue(
  group: ProofIssue["group"],
  message: string,
  start: number,
  end: number,
  suggestion?: string,
): ProofIssue {
  issueSeq += 1;
  return {
    id: `pr-${issueSeq}`,
    group,
    message,
    start,
    end,
    suggestion,
  };
}

export function proofreadLocal(raw: string): ProofReport {
  const issues: ProofIssue[] = [];
  let autoFixed = raw;

  // Double spaces
  {
    const re = / {2,}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
      issues.push(
        issue("spaces", "Лишние пробелы", m.index, m.index + m[0].length, " "),
      );
    }
    autoFixed = autoFixed.replace(/ {2,}/g, " ");
  }

  // Repeated words (same token twice)
  {
    const re = /\b([А-Яа-яA-Za-zЁё]{2,})\s+\1\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
      issues.push(
        issue(
          "repeat",
          `Повтор слова «${m[1]}»`,
          m.index,
          m.index + m[0].length,
          m[1],
        ),
      );
    }
    autoFixed = autoFixed.replace(re, "$1");
  }

  // Double punctuation
  {
    const re = /([.!?]){2,}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
      issues.push(
        issue(
          "punct",
          "Повтор знака препинания",
          m.index,
          m.index + m[0].length,
          m[1],
        ),
      );
    }
    autoFixed = autoFixed.replace(/([.!?])\1+/g, "$1");
  }

  // Space before punctuation
  {
    const re = / +([.,:;!?])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
      issues.push(
        issue(
          "punct",
          "Пробел перед знаком",
          m.index,
          m.index + m[0].length,
          m[1],
        ),
      );
    }
    autoFixed = autoFixed.replace(/ +([.,:;!?])/g, "$1");
  }

  // Unbalanced quotes «»
  {
    const open = (raw.match(/«/g) || []).length;
    const close = (raw.match(/»/g) || []).length;
    if (open !== close) {
      issues.push(
        issue(
          "quotes",
          `Кавычки «» не сбалансированы (${open}/${close})`,
          0,
          Math.min(20, raw.length),
        ),
      );
    }
  }

  // Lowercase after sentence end
  {
    const re = /([.!?])\s+([а-яё])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
      issues.push(
        issue(
          "case",
          "После конца предложения строчная буква",
          m.index,
          m.index + m[0].length,
          `${m[1]} ${m[2]!.toUpperCase()}`,
        ),
      );
    }
    autoFixed = autoFixed.replace(re, (_a, p, c: string) => `${p} ${c.toUpperCase()}`);
  }

  // Weird ellipsis mix
  if (/\.\.\.|…\./.test(raw)) {
    const idx = raw.search(/\.\.\.|…\./);
    issues.push(
      issue("ellipsis", "Смешанное многоточие", idx, idx + 3, "…"),
    );
    autoFixed = autoFixed.replace(/\.{3,}/g, "…").replace(/…\.+/g, "…");
  }

  // Digit glued to letter
  {
    const re = /(\d)([А-Яа-яA-Za-zЁё])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
      issues.push(
        issue(
          "numbers",
          "Цифра склеена с буквой",
          m.index,
          m.index + m[0].length,
          `${m[1]} ${m[2]}`,
        ),
      );
    }
  }

  // Consistency: mix of ё/е in same stem — soft flag if both present heavily
  if (/ё/i.test(raw) && /(?:^|[^\w])все(?:$|[^\w])/i.test(raw) && /всё/i.test(raw)) {
    issues.push(
      issue(
        "consistency",
        "Встречаются и «все», и «всё» — проверьте смысл",
        0,
        Math.min(40, raw.length),
      ),
    );
  }

  return { issues, autoFixed: autoFixed.trim() };
}
