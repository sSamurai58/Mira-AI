import { useState } from "react";
import { detectCodeLanguage } from "./detectCodeLang";

type Props = {
  code: string;
  /** Fence language hint, e.g. python */
  langHint?: string;
};

/** Fenced chat code: language badge + copy. Never spoken (stripped in TTS). */
export function CodeBlock({ code, langHint = "" }: Props) {
  const [copied, setCopied] = useState(false);
  const language = detectCodeLanguage(code, langHint);
  const body = code.replace(/\n$/, "");

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore — clipboard may be denied */
    }
  }

  return (
    <div className="bubble-code" data-lang={language}>
      <div className="bubble-code-bar">
        <span className="bubble-code-lang">{language}</span>
        <button
          type="button"
          className="btn bubble-code-copy"
          onClick={() => void copy()}
        >
          {copied ? "Скопировано" : "Скопировать"}
        </button>
      </div>
      <pre className="bubble-code-pre">
        <code>{body}</code>
      </pre>
    </div>
  );
}
