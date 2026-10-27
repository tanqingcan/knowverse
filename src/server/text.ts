/** 文本工具：名称规范化、LIKE 转义、匹配片段与高亮分段 */

/** 全角转半角、小写、去掉空白与常见标点——用于知识点名与别名比对 */
export function normName(s: string): string {
  return s
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ")
    .toLowerCase()
    .replace(/[\s·・,，。.、:：;；'"“”‘’()（）\[\]【】<>《》!！?？\-_/\\|]+/g, "");
}

/** 转义 LIKE/ILIKE 通配符，配合 ESCAPE '\\' 使用 */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

export type Seg = { text: string; hit: boolean };

/** 把文本按关键词切成高亮分段（大小写不敏感），由前端安全渲染 <mark>，不拼 HTML */
export function highlight(text: string, keywords: string[]): Seg[] {
  const kws = keywords.map((k) => k.trim()).filter(Boolean);
  if (!kws.length) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const segs: Seg[] = [];
  let i = 0;
  while (i < text.length) {
    let best = -1, bestLen = 0;
    for (const k of kws) {
      const p = lower.indexOf(k.toLowerCase(), i);
      if (p !== -1 && (best === -1 || p < best || (p === best && k.length > bestLen))) { best = p; bestLen = k.length; }
    }
    if (best === -1) { segs.push({ text: text.slice(i), hit: false }); break; }
    if (best > i) segs.push({ text: text.slice(i, best), hit: false });
    segs.push({ text: text.slice(best, best + bestLen), hit: true });
    i = best + bestLen;
  }
  return segs;
}

/** 截取匹配位置附近的片段（约 radius 个字符），返回高亮分段 */
export function snippet(text: string, keywords: string[], radius = 48): Seg[] {
  const flat = text.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  let pos = -1;
  for (const k of keywords.filter(Boolean)) {
    const p = lower.indexOf(k.toLowerCase());
    if (p !== -1 && (pos === -1 || p < pos)) pos = p;
  }
  let start = 0, end = Math.min(flat.length, radius * 2);
  if (pos !== -1) { start = Math.max(0, pos - radius); end = Math.min(flat.length, pos + radius * 1.5); }
  let s = flat.slice(start, end);
  if (start > 0) s = "…" + s;
  if (end < flat.length) s = s + "…";
  return highlight(s, keywords);
}

/** Markdown → 纯文本（去掉演示提示行、代码块标记、强调符号与引用编号），用于摘要与匹配片段 */
export function plainText(md: string): string {
  return md
    .replace(/^>\s?演示模式[^\n]*\n?/m, "")
    .replace(/```[a-z]*\n?/g, " ")
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*[#>]+\s?/gm, "")
    .replace(/\[(资料\d+)\]/g, "")
    .replace(/\[([^\]]+)\]\(kv:\/\/[^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** 从 Markdown 文本得到一行纯文本摘要 */
export function plainSummary(md: string, n = 90): string {
  const t = plainText(md.replace(/```[\s\S]*?```/g, " [代码] "));
  return t.length > n ? t.slice(0, n) + "…" : t;
}
