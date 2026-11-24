"use client";
/**
 * SQL 编辑器：行号 + 语法高亮 + 快捷键 + 一键格式化。
 * 不引入第三方编辑器：底层仍是原生 <textarea>（输入法、撤销、无障碍都可靠），
 * 上面叠一层同字体、同尺寸的高亮 <pre>，textarea 文字透明、只保留光标与选区。
 */
import React, { useMemo, useRef } from "react";

const KEYWORDS = new Set((
  "SELECT FROM WHERE AND OR NOT IN IS NULL AS ON JOIN LEFT RIGHT INNER OUTER FULL CROSS NATURAL USING GROUP BY HAVING ORDER ASC DESC " +
  "NULLS FIRST LAST LIMIT OFFSET DISTINCT UNION ALL EXCEPT INTERSECT CASE WHEN THEN ELSE END EXISTS BETWEEN LIKE ILIKE ANY SOME WITH RECURSIVE " +
  "OVER PARTITION FILTER WINDOW ROWS RANGE PRECEDING FOLLOWING UNBOUNDED CURRENT ROW INSERT UPDATE DELETE INTO VALUES SET CAST TRUE FALSE " +
  "CREATE TABLE VIEW INDEX DROP ALTER PRIMARY KEY FOREIGN REFERENCES CHECK UNIQUE DEFAULT INTERVAL"
).split(" "));

/** 另起一行的子句（格式化用），按最长匹配优先 */
const CLAUSES = [
  "LEFT OUTER JOIN", "RIGHT OUTER JOIN", "FULL OUTER JOIN", "LEFT JOIN", "RIGHT JOIN", "FULL JOIN", "INNER JOIN", "CROSS JOIN", "JOIN",
  "GROUP BY", "ORDER BY", "UNION ALL", "UNION", "EXCEPT", "INTERSECT", "SELECT", "FROM", "WHERE", "HAVING", "LIMIT", "OFFSET", "WITH",
];

type Tok = { t: "kw" | "fn" | "str" | "num" | "com" | "id" | "op" | "ws"; v: string };

/** 词法切分：注释、字符串、带引号标识符、数字、单词、空白、其余符号 */
export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /(--[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|('(?:[^']|'')*'?)|("(?:[^"]|"")*"?)|(\d+(?:\.\d+)?)|([A-Za-z_À-￿][\wÀ-￿$]*)|(\s+)|([\s\S])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[1] != null) out.push({ t: "com", v: m[1] });
    else if (m[2] != null) out.push({ t: "str", v: m[2] });
    else if (m[3] != null) out.push({ t: "id", v: m[3] });
    else if (m[4] != null) out.push({ t: "num", v: m[4] });
    else if (m[5] != null) {
      const w = m[5];
      const next = src.slice(re.lastIndex).match(/^\s*\(/);
      out.push({ t: KEYWORDS.has(w.toUpperCase()) ? "kw" : next ? "fn" : "id", v: w });
    } else if (m[6] != null) out.push({ t: "ws", v: m[6] });
    else out.push({ t: "op", v: m[7] });
  }
  return out;
}

/**
 * 格式化：关键字与函数名大写、主要子句另起一行、多余空白压缩。
 * 只改字符串/注释以外的空白和大小写，不会改变查询语义（未加引号的标识符在 PostgreSQL 中本就不区分大小写，这里也不改它们）。
 */
export function formatSql(src: string): string {
  const toks = tokenize(src).filter((k, i, a) => !(k.t === "ws" && !k.v.includes("\n") && (i === 0 || i === a.length - 1)));
  // 先把关键字/函数名大写，空白统一成单个空格（注释后的换行保留）
  const words: Tok[] = [];
  for (const k of toks) {
    if (k.t === "ws") { const prev = words[words.length - 1]; if (prev?.t === "com") words.push({ t: "ws", v: "\n" }); else if (prev && prev.t !== "ws") words.push({ t: "ws", v: " " }); continue; }
    words.push(k.t === "kw" || k.t === "fn" ? { ...k, v: k.v.toUpperCase() } : k);
  }
  // 再在主要子句前断行：只在括号外（子查询、窗口函数 OVER(...) 里保持紧凑），多词子句只在第一个词前断一次
  let s = "", depth = 0, skip = 0;
  for (let i = 0; i < words.length; i++) {
    const k = words[i];
    if (k.t === "kw") {
      if (skip > 0) skip--;
      else {
        const ahead = words.slice(i, i + 8).filter((x) => x.t !== "ws").map((x) => x.v.toUpperCase());
        const hit = CLAUSES.find((c) => c.split(" ").every((w, j) => ahead[j] === w));
        if (hit) {
          skip = hit.split(" ").length - 1;
          if (depth === 0 && s.trim()) s = s.replace(/[ \t]+$/, "") + "\n";
        }
      }
    }
    if (k.t === "op") { if (k.v === "(") depth++; else if (k.v === ")") depth = Math.max(0, depth - 1); }
    if (k.t === "ws" && s.endsWith("\n")) continue;
    s += k.v;
    if (k.t === "op" && k.v === "," && words[i + 1] && words[i + 1].t !== "ws") s += " "; // 逗号后补一个空格
  }
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n").replace(/\s*;\s*$/, ";").trim() + "\n";
}

export function SqlEditor({ value, onChange, onRun, onSubmit, readOnly, minLines = 12, label = "SQL 答案" }: {
  value: string; onChange?: (v: string) => void; onRun?: () => void; onSubmit?: () => void; readOnly?: boolean; minLines?: number; label?: string;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const hl = useRef<HTMLPreElement>(null);
  const gut = useRef<HTMLDivElement>(null);
  const lines = Math.max(minLines, value.split("\n").length);
  const toks = useMemo(() => tokenize(value), [value]);

  const sync = () => {
    const t = ta.current; if (!t) return;
    if (hl.current) { hl.current.scrollTop = t.scrollTop; hl.current.scrollLeft = t.scrollLeft; }
    if (gut.current) gut.current.scrollTop = t.scrollTop;
  };
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); (e.shiftKey ? onSubmit : onRun)?.(); return; }
    if (e.key === "Tab" && !e.shiftKey && !readOnly) {
      e.preventDefault();
      const t = e.currentTarget, a = t.selectionStart, b = t.selectionEnd;
      onChange?.(value.slice(0, a) + "  " + value.slice(b));
      requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = a + 2; });
    }
  };

  return (
    <div className={`sqled ${readOnly ? "is-readonly" : ""}`}>
      <div className="sqled-gutter" ref={gut} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
      </div>
      <div className="sqled-main">
        <pre className="sqled-hl" ref={hl} aria-hidden="true">
          {toks.map((k, i) => k.t === "ws" || k.t === "id" && !k.v.startsWith('"') ? k.v : <span key={i} className={`tk-${k.t}`}>{k.v}</span>)}
          {"\n "}
        </pre>
        <textarea ref={ta} className="sqled-input" value={value} readOnly={readOnly} spellCheck={false} autoCapitalize="off" autoComplete="off" autoCorrect="off"
          aria-label={label} placeholder={readOnly ? "" : "SELECT …\nFROM …\nWHERE …"} rows={lines}
          onChange={(e) => onChange?.(e.target.value)} onScroll={sync} onKeyDown={onKey} />
      </div>
    </div>
  );
}

/** 只读高亮（表结构说明、已提交答案等） */
export function SqlHighlight({ code, className }: { code: string; className?: string }) {
  const toks = useMemo(() => tokenize(code), [code]);
  return (
    <pre className={`sql-hl ${className ?? ""}`}>
      {toks.map((k, i) => k.t === "ws" || (k.t === "id" && !k.v.startsWith('"')) ? k.v : <span key={i} className={`tk-${k.t}`}>{k.v}</span>)}
    </pre>
  );
}
