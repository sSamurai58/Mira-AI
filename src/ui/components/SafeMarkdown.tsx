import { Fragment, type ReactNode } from "react";
import { CodeBlock } from "../chat/CodeBlock";

type Piece =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "italic"; value: string }
  | { kind: "code"; value: string }
  | { kind: "link"; href: string; label: string };

type Segment =
  | { kind: "md"; text: string }
  | { kind: "code"; lang: string; code: string };

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

function tokenizeInline(text: string): Piece[] {
  const pieces: Piece[] = [];
  const re =
    /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) {
      pieces.push({ kind: "text", value: text.slice(last, m.index) });
    }
    if (m[1] != null && m[2] != null) {
      pieces.push({ kind: "link", label: m[1], href: m[2] });
    } else if (m[3] != null) pieces.push({ kind: "bold", value: m[3] });
    else if (m[4] != null) pieces.push({ kind: "italic", value: m[4] });
    else if (m[5] != null) pieces.push({ kind: "code", value: m[5] });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    pieces.push({ kind: "text", value: text.slice(last) });
  }
  return pieces;
}

function safeHref(href: string): string | null {
  const t = href.trim();
  if (!t) return null;
  if (/^(https?:|mailto:)/i.test(t)) return t;
  if (t.startsWith("#")) return t;
  return null;
}

function renderPieces(pieces: Piece[], keyPrefix: string): ReactNode[] {
  return pieces.map((p, i) => {
    const key = `${keyPrefix}-${i}`;
    if (p.kind === "bold") return <strong key={key}>{p.value}</strong>;
    if (p.kind === "italic") return <em key={key}>{p.value}</em>;
    if (p.kind === "code") {
      return (
        <code key={key} className="safe-md-inline-code">
          {p.value}
        </code>
      );
    }
    if (p.kind === "link") {
      const href = safeHref(p.href);
      if (!href) return <Fragment key={key}>{p.label}</Fragment>;
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="safe-md-link"
        >
          {p.label}
        </a>
      );
    }
    return <Fragment key={key}>{p.value}</Fragment>;
  });
}

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function isTableSep(line: string): boolean {
  const cells = splitTableRow(line);
  if (!cells.length) return false;
  return cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function renderMarkdownChunk(text: string, keyBase: number): ReactNode[] {
  if (!text) return [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let listBuf: { ordered: boolean; items: string[] } | null = null;
  let key = keyBase;

  const flushList = () => {
    if (!listBuf?.items.length) {
      listBuf = null;
      return;
    }
    const id = key++;
    const Tag = listBuf.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={`list-${id}`} className="safe-md-list">
        {listBuf.items.map((item, idx) => (
          <li key={`li-${id}-${idx}`}>
            {renderPieces(tokenizeInline(item), `li-${id}-${idx}`)}
          </li>
        ))}
      </Tag>,
    );
    listBuf = null;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";

    // GFM table
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      isTableSep(lines[i + 1] ?? "")
    ) {
      flushList();
      const header = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").includes("|")) {
        const rowLine = lines[i] ?? "";
        if (!rowLine.trim()) break;
        rows.push(splitTableRow(rowLine));
        i += 1;
      }
      const id = key++;
      blocks.push(
        <div key={`tbl-wrap-${id}`} className="safe-md-table-wrap">
          <table className="safe-md-table">
            <thead>
              <tr>
                {header.map((cell, ci) => (
                  <th key={`th-${id}-${ci}`}>
                    {renderPieces(tokenizeInline(cell), `th-${id}-${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={`tr-${id}-${ri}`}>
                  {header.map((_, ci) => (
                    <td key={`td-${id}-${ri}-${ci}`}>
                      {renderPieces(
                        tokenizeInline(row[ci] ?? ""),
                        `td-${id}-${ri}-${ci}`,
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1]!.length;
      const content = heading[2]!;
      const id = key++;
      const kids = renderPieces(tokenizeInline(content), `h-${id}`);
      const cls = `safe-md-h safe-md-h${level}`;
      const node =
        level === 1 ? (
          <h1 key={`h-${id}`} className={cls}>
            {kids}
          </h1>
        ) : level === 2 ? (
          <h2 key={`h-${id}`} className={cls}>
            {kids}
          </h2>
        ) : level === 3 ? (
          <h3 key={`h-${id}`} className={cls}>
            {kids}
          </h3>
        ) : (
          <h4 key={`h-${id}`} className={cls}>
            {kids}
          </h4>
        );
      blocks.push(node);
      i += 1;
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushList();
      const parts: string[] = [quote[1] ?? ""];
      i += 1;
      while (i < lines.length) {
        const q = (lines[i] ?? "").match(/^>\s?(.*)$/);
        if (!q) break;
        parts.push(q[1] ?? "");
        i += 1;
      }
      const id = key++;
      blocks.push(
        <blockquote key={`bq-${id}`} className="safe-md-quote">
          {parts.map((p, idx) => (
            <p key={`bq-p-${id}-${idx}`}>
              {renderPieces(tokenizeInline(p), `bq-${id}-${idx}`)}
            </p>
          ))}
        </blockquote>,
      );
      continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ol) {
      if (!listBuf || !listBuf.ordered) {
        flushList();
        listBuf = { ordered: true, items: [] };
      }
      listBuf.items.push(ol[1]!);
      i += 1;
      continue;
    }

    const ul = line.match(/^\s*[-*•]\s+(.+)$/);
    if (ul) {
      if (!listBuf || listBuf.ordered) {
        flushList();
        listBuf = { ordered: false, items: [] };
      }
      listBuf.items.push(ul[1]!);
      i += 1;
      continue;
    }

    flushList();
    if (!line.trim()) {
      blocks.push(<div key={`sp-${key++}`} className="safe-md-gap" />);
      i += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={`hr-${key++}`} className="safe-md-hr" />);
      i += 1;
      continue;
    }

    const id = key++;
    blocks.push(
      <p key={`p-${id}`} className="safe-md-p">
        {renderPieces(tokenizeInline(line), `p-${id}`)}
      </p>,
    );
    i += 1;
  }
  flushList();
  return blocks;
}

/**
 * Safe Markdown preview (no raw HTML): headings, tables, lists, quotes,
 * links, bold/italic, inline code, and fenced code blocks.
 */
export function SafeMarkdown({ text }: { text: string }) {
  if (!text.trim()) {
    return <p className="muted safe-md-empty">Пустое тело — нечего показать.</p>;
  }
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

  return <div className="safe-md">{blocks}</div>;
}

/** Compose a GitHub-like preview: frontmatter as a table + body. */
export function composeSkillPreviewMarkdown(meta: {
  name: string;
  description: string;
  triggers: string;
  tags?: string;
  body: string;
}): string {
  const rows: Array<[string, string]> = [
    ["name", meta.name.trim() || "—"],
    ["description", meta.description.trim() || "—"],
    ["триггеры", meta.triggers.trim() || "—"],
  ];
  if (meta.tags?.trim()) rows.push(["теги", meta.tags.trim()]);
  const table = [
    "| | |",
    "| --- | --- |",
    ...rows.map(
      ([k, v]) =>
        `| ${k.replace(/\|/g, "\\|")} | ${v.replace(/\|/g, "\\|").replace(/\n/g, " ")} |`,
    ),
    "",
  ].join("\n");
  return `${table}\n${meta.body.trim()}`.trim();
}
