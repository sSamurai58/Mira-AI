import { Fragment, type ReactNode } from "react";

type Piece =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "italic"; value: string }
  | { kind: "underline"; value: string }
  | { kind: "code"; value: string };

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
    if (p.kind === "code") return <code key={key}>{p.value}</code>;
    return <Fragment key={key}>{p.value}</Fragment>;
  });
}

/**
 * Safe chat markdown subset: **bold**, *italic*, __underline__, `code`,
 * newlines and simple bullet lists. No HTML.
 */
export function ChatMarkdown({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let listBuf: string[] = [];
  let key = 0;

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

  return <div className="bubble-md">{blocks}</div>;
}
