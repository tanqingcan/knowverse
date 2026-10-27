"use client";
/**
 * 轻量、安全的 Markdown 渲染：只生成 React 元素，不注入 HTML。
 * 支持：段落、标题、列表、代码块、行内代码、粗体、引用、链接（http/https 与站内 kv:// 链接）、资料引用标记 [资料n]。
 */
import React from "react";

type Handlers = { onRef?: (ref: string) => void; onKvLink?: (href: string) => void };

function inline(text: string, h: Handlers, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[资料\d+\])|(\[([^\]]+)\]\(((?:https?|kv):\/\/[^)\s]+)\))/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (m[1]) out.push(<code key={k}>{m[1].slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{m[2].slice(2, -2)}</strong>);
    else if (m[3]) {
      const ref = m[3].slice(1, -1);
      out.push(<button key={k} type="button" className="ref" onClick={() => h.onRef?.(ref)} title={`查看${ref}的原文`}>{ref}</button>);
    } else if (m[4]) {
      const label = m[5], href = m[6];
      if (href.startsWith("kv://")) out.push(<button key={k} type="button" className="kvlink" onClick={() => h.onKvLink?.(href)}>{label}</button>);
      else out.push(<a key={k} href={href} target="_blank" rel="noreferrer noopener">{label}</a>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** 代码块：等宽字体、横向滚动、一键复制 */
export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [done, setDone] = React.useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setDone(true); setTimeout(() => setDone(false), 1500); } catch { setDone(false); }
  };
  return (
    <div className="codeblock">
      <div className="code-head"><span>{lang || (/\b(select|from|where|join)\b/i.test(code) ? "sql" : "code")}</span><button type="button" onClick={copy} aria-label="复制代码">{done ? "已复制" : "复制"}</button></div>
      <pre tabIndex={0}><code>{code}</code></pre>
    </div>
  );
}

export function Markdown({ text, ...h }: { text: string } & Handlers) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0, key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      const lang = line.replace(/^```/, "").trim();
      blocks.push(<CodeBlock key={key++} code={body.join("\n")} lang={lang} />);
      continue;
    }
    if (/^#{1,4}\s/.test(line)) { const t = line.replace(/^#{1,4}\s/, ""); blocks.push(<h4 key={key++}>{inline(t, h, `h${key}`)}</h4>); i++; continue; }
    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={key++}>{inline(body.join(" "), h, `q${key}`)}</blockquote>);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
      const L = ordered ? "ol" : "ul";
      blocks.push(React.createElement(L, { key: key++ }, items.map((it, j) => <li key={j}>{inline(it, h, `l${key}-${j}`)}</li>)));
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(```|#{1,4}\s|>\s?|\s*([-*]|\d+\.)\s+)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={key++}>{inline(para.join("\n"), h, `p${key}`)}</p>);
  }
  return <div className="md">{blocks}</div>;
}
