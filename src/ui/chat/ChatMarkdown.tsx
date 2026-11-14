import { Fragment, type ReactNode } from "react";
import { CodeBlock } from "./CodeBlock";

type Piece =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "italic"; value: string }
  | { kind: "underline"; value: string }
  | { kind: "code"; value: string };

type Segment =
  | { kind: "md"; text: string }
  | { kind: "code"; lang: string; code: string };

/** Split fenced ```lang ... ``` blocks from surrounding markdown. */
function splitFences(text: string): Segment[] {
  const segments: Segment[] = [];
  const re = /```([^\n`]*)\r?\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) {
      segments.push({ kind: "md", text: text.slice(last, m.index) });
    }
    segments.push({
      kind: "code",
      lang: (m[1] ?? "").trim(),
      code: m[2] ?? "",
    });
    last = m.index + m[0].length;
  }
  if (last >= text.length) {
    return segments.length ? segments : [{ kind: "md", text }];
  }

  const rest = text.slice(last);
  const openIdx = rest.indexOf("```");
  if (openIdx === -1) {
    segments.push({ kind: "md", text: rest });
    return segments;
  }
  // Streaming / unclosed fence — show as code block while it grows
  if (openIdx > 0) {
    segments.push({ kind: "md", text: rest.slice(0, openIdx) });
  }
  const after = rest.slice(openIdx + 3);
  const nl = after.indexOf("\n");
  if (nl === -1) {
    segments.push({ kind: "code", lang: after.trim(), code: "" });
  } else {
    segments.push({
      kind: "code",
      lang: after.slice(0, nl).trim(),
      code: after.slice(nl + 1),
    });
  }
  return segments;
}

/** Split one line into styled pieces (no nested markdown). */
function tokenizeInline(text: string): Piece[] {
  const pieces: Piece[] = [];
  const re = /\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) {
      pieces.push({ kind: "text", value: text.slice(last, m.index) });
    }
    if (m[1] != null) pieces.push({ kind: "bold", value: m[1] });
    else if (m[2] != null) pieces.push({ kind: "underline", value: m[2] });
    else if (m[3] != null) pieces.push({ kind: "italic", value: m[3] });
    else if (m[4] != null) pieces.push({ kind: "italic", value: m[4] });
    else if (m[5] != null) pieces.push({ kind: "code", value: m[5] });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    pieces.push({ kind: "text", value: text.slice(last) });
  }
  return pieces;
}

function renderPieces(pieces: Piece[], keyPrefix: string): ReactNode[] {
  return pieces.map((p, i) => {
    const key = `${keyPrefix}-${i}`;
    if (p.kind === "bold") return <strong key={key}>{p.value}</strong>;
    if (p.kind === "italic") return <em key={key}>{p.value}</em>;
    if (p.kind === "underline") return <u key={key}>{p.value}</u>;
    if (p.kind === "code") {
      return (
        <code key={key} className="bubble-inline-code">
          {p.value}
        </code>
      );
    }
    return <Fragment key={key}>{p.value}</Fragment>;
  });
}

function renderMarkdownChunk(text: string, keyBase: number): ReactNode[] {
  if (!text) return [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let listBuf: string[] = [];
  let key = keyBase;

  const flushList = () => {
    if (!listBuf.length) return;
    const id = key++;
    blocks.push(
      <ul key={`ul-${id}`} className="bubble-md-list">
        {listBuf.map((item, idx) => (
          <li key={`li-${id}-${idx}`}>
            {renderPieces(tokenizeInline(item), `li-${id}-${idx}`)}
          </li>
        ))}
      </ul>,
    );
    listBuf = [];
  };

  for (const line of lines) {
    const bullet = line.match(/^\s*[-*•]\s+(.+)$/);
    if (bullet) {
      listBuf.push(bullet[1]);
      continue;
    }
    flushList();
    if (!line.trim()) {
      blocks.push(<div key={`sp-${key++}`} className="bubble-md-gap" />);
      continue;
    }
    const id = key++;
    blocks.push(
      <p key={`p-${id}`} className="bubble-md-p">
        {renderPieces(tokenizeInline(line), `p-${id}`)}
      </p>,
    );
  }
  flushList();
  return blocks;
}

/**
 * Safe chat markdown: fences with language + copy, **bold**, *italic*,
 * __underline__, `code`, newlines and simple bullet lists. No HTML.
 */
export function ChatMarkdown({ text }: { text: string }) {
  if (!text) return null;
  const segments = splitFences(text.replace(/\r\n/g, "\n"));
  const blocks: ReactNode[] = [];
  let key = 0;

  for (const seg of segments) {
    if (seg.kind === "code") {
      blocks.push(
        <CodeBlock
          key={`code-${key++}`}
          code={seg.code}
          langHint={seg.lang}
        />,
      );
      continue;
    }
    blocks.push(...renderMarkdownChunk(seg.text, key));
    key += 1000;
  }

  return <div className="bubble-md">{blocks}</div>;
}
