/**
 * 资料内容提取：TXT / Markdown / 文本 PDF / PPTX。
 *  - PPTX 记录页号（第 N 张幻灯片），PDF 记录页码，TXT/MD 记录段落号。
 *  - 扫描版 PDF（几乎没有文字层）返回 needs_ocr，不假装解析成功。
 *  - 其它类型只保存元数据，状态为 unsupported。
 */
import JSZip from "jszip";
import path from "node:path";

export type FileType = "txt" | "md" | "pdf" | "pptx" | "other";
export type ExtractedChunk = { pageNo: number | null; paragraphNo: number | null; heading: string | null; content: string };
export type ExtractResult =
  | { status: "ready"; chunks: ExtractedChunk[]; pageCount: number | null; detail: string }
  | { status: "needs_ocr" | "unsupported" | "failed"; chunks: []; pageCount: number | null; detail: string };

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function detectType(fileName: string, buf: Buffer): { type: FileType; problem?: string } {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const isZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b;
  const isPdf = buf.subarray(0, 5).toString("latin1") === "%PDF-";
  if (ext === "pdf") return isPdf ? { type: "pdf" } : { type: "pdf", problem: "扩展名为 .pdf，但文件头不是 PDF" };
  if (ext === "pptx") return isZip ? { type: "pptx" } : { type: "pptx", problem: "扩展名为 .pptx，但不是有效的 Office Open XML 压缩包" };
  if (["docx", "xlsx"].includes(ext) && !isZip) return { type: "other", problem: "Office 文件扩展名与内容不符，需要有效的 Open XML 压缩包" };
  if (ext === "txt" || ext === "md" || ext === "markdown") {
    try { new TextDecoder("utf-8", { fatal: true }).decode(buf); }
    catch { return { type: ext === "txt" ? "txt" : "md", problem: "文本文件不是 UTF-8 编码，请另存为 UTF-8 后上传" }; }
    if (isPdf || isZip || buf.includes(0)) return { type: ext === "txt" ? "txt" : "md", problem: "文本扩展名与内容不符，不能上传二进制文件" };
    return { type: ext === "txt" ? "txt" : "md" };
  }
  return { type: "other" };
}

const MAX_CHUNK = 700;

/**
 * 部分 PDF 的 ToUnicode 映射会把汉字映射到“康熙部首 / 部首补充”码位（例如 ⽤、⻉），
 * 导致检索不到“用”“贝”。这里只对这两个区块做规范化，其它字符保持原样。
 */
const RADICAL_MAP: Record<string, string> = {
  "\u2eb0": "纟", "\u2ec5": "见", "\u2ec6": "角", "\u2ec8": "讠", "\u2ec9": "贝", "\u2ecb": "车", "\u2ecc": "辶", "\u2ed0": "钅",
  "\u2ed3": "长", "\u2ed4": "门", "\u2ed9": "韦", "\u2eda": "页", "\u2edb": "风", "\u2edc": "飞", "\u2ee0": "饣", "\u2ee2": "马",
  "\u2ee5": "鱼", "\u2ee6": "鸟", "\u2ee7": "卤", "\u2ee8": "麦", "\u2ee9": "黄", "\u2eea": "黾", "\u2eec": "齐", "\u2eee": "齿",
  "\u2ef0": "龙", "\u2ef2": "亀",
};
export function normalizeCjk(text: string): string {
  return text.replace(/[\u2e80-\u2fdf]/g, (c) => RADICAL_MAP[c] ?? c.normalize("NFKC"));
}

/** 硬上限 700 字符，相邻窗口重叠最多 80 字符，不跨页或标题。 */
export function splitLong(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + MAX_CHUNK, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const boundary = Math.max(...[...window.matchAll(/[。！？；.!?;\n]/g)].map(m => m.index! + 1), 0);
      if (boundary >= MAX_CHUNK / 2) end = start + boundary;
    }
    const piece = text.slice(start, end).trim();
    if (piece) out.push(piece);
    if (end === text.length) break;
    start = Math.max(start + 1, end - 80);
  }
  return out;
}

function extractPlain(text: string, markdown: boolean): ExtractResult {
  const chunks: ExtractedChunk[] = [];
  const headings: string[] = [];
  // 段号按非空文本块编号（标题也占段号）；标题边界即使没有空行也能识别。
  let paragraph = 0, lines: string[] = [], fenced = false;
  const flush = () => {
    const body = lines.join("\n").trim(); lines = [];
    if (!body) return;
    paragraph++;
    for (const content of splitLong(body)) chunks.push({ pageNo: null, paragraphNo: paragraph, heading: headings.filter(Boolean).join(" > ") || null, content });
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = markdown && !fenced ? line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/) : null;
    if (heading) {
      flush(); paragraph++;
      const depth = heading[1].length;
      headings.length = depth;
      headings[depth - 1] = heading[2];
    } else if (!line.trim() && !fenced) flush();
    else {
      lines.push(line);
      if (markdown && /^\s*(```|~~~)/.test(line)) fenced = !fenced;
    }
  }
  flush();
  if (!chunks.length) return { status: "failed", chunks: [], pageCount: null, detail: "文件没有可提取的文字内容" };
  return { status: "ready", chunks, pageCount: null, detail: `提取 ${paragraph} 个文本块（标题计入段号），生成 ${chunks.length} 个片段；长片段重叠最多 80 字符` };
}

async function extractPdf(buf: Buffer): Promise<ExtractResult> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = (text as string[]).map((t) => normalizeCjk(t).replace(/\s+\n/g, "\n").trim());
  const textChars = pages.reduce((n, t) => n + t.replace(/\s/g, "").length, 0);
  if (textChars < Math.max(20, totalPages * 10)) {
    return { status: "needs_ocr", chunks: [], pageCount: totalPages, detail: `共 ${totalPages} 页，但几乎没有文字层（约 ${textChars} 个字符），可能是扫描件，需要 OCR 后再上传` };
  }
  const chunks: ExtractedChunk[] = [];
  pages.forEach((t, i) => {
    if (!t) return;
    const firstLine = t.split("\n")[0].slice(0, 40);
    for (const piece of splitLong(t)) chunks.push({ pageNo: i + 1, paragraphNo: null, heading: firstLine, content: piece });
  });
  return { status: "ready", chunks, pageCount: totalPages, detail: `共 ${totalPages} 页，生成 ${chunks.length} 个片段` };
}

function decodeXml(s: string) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d))).replace(/&amp;/g, "&");
}

async function extractPptx(buf: Buffer): Promise<ExtractResult> {
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(buf); } catch { return { status: "failed", chunks: [], pageCount: null, detail: "PPTX 压缩包无法打开" }; }
  const ct = await zip.file("[Content_Types].xml")?.async("string");
  if (!ct || !ct.includes("presentationml")) return { status: "failed", chunks: [], pageCount: null, detail: "不是 PowerPoint 演示文稿（缺少 presentationml 内容类型）" };
  // 按 presentation.xml 中的顺序确定页号
  const pres = (await zip.file("ppt/presentation.xml")?.async("string")) ?? "";
  const rels = (await zip.file("ppt/_rels/presentation.xml.rels")?.async("string")) ?? "";
  const relMap = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = m[0];
    const id = tag.match(/Id="([^"]+)"/)?.[1];
    const target = tag.match(/Target="([^"]+)"/)?.[1];
    if (id && target) relMap.set(id, target);
  }
  let order = [...pres.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)].map((m) => relMap.get(m[1])).filter(Boolean).map((t) => "ppt/" + t!.replace(/^\.?\//, "").replace(/^\.\.\//, ""));
  if (!order.length) {
    order = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  }
  const chunks: ExtractedChunk[] = [];
  let notesCount = 0;
  for (let i = 0; i < order.length; i++) {
    const xml = await zip.file(order[i])?.async("string");
    if (!xml) continue;
    const paras = [...xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)]
      .map((p) => [...p[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((t) => decodeXml(t[1])).join(""))
      .map((s) => s.trim()).filter(Boolean);
    const content = paras.join("\n");
    if (content) for (const piece of splitLong(content)) chunks.push({ pageNo: i + 1, paragraphNo: null, heading: paras[0].slice(0, 40), content: piece });
    // 备注必须通过该幻灯片的关系文件定位，不能假设 notesSlideN 与 slideN 对应。
    const slidePath = order[i];
    const relPath = path.posix.join(path.posix.dirname(slidePath), "_rels", path.posix.basename(slidePath) + ".rels");
    const slideRels = await zip.file(relPath)?.async("string") ?? "";
    for (const rel of slideRels.matchAll(/<Relationship\b[^>]*>/g)) {
      const tag = rel[0];
      if (!/Type=["'][^"']*\/notesSlide["']/.test(tag) || /TargetMode=["']External["']/.test(tag)) continue;
      const target = tag.match(/Target=["']([^"']+)["']/)?.[1];
      if (!target) continue;
      const notesPath = target.startsWith("/") ? target.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(slidePath), target));
      const notesXml = await zip.file(notesPath)?.async("string") ?? "";
      const texts = [...notesXml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)]
        .filter(m => !/<p:ph\b[^>]*type=["'](?:sldImg|sldNum|hdr|ftr|dt)["']/.test(m[0]))
        .flatMap(m => [...m[0].matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)])
        .map(m => [...m[0].matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)].map(t => decodeXml(t[1])).join("").trim()).filter(Boolean);
      if (texts.length) {
        notesCount++;
        for (const piece of splitLong(texts.join("\n"))) chunks.push({pageNo: i + 1, paragraphNo: null, heading: `${paras[0]?.slice(0, 40) || "幻灯片"} · 备注`, content: piece});
      }
    }
  }
  if (!chunks.length) return { status: "needs_ocr", chunks: [], pageCount: order.length, detail: `共 ${order.length} 页，但没有文本框文字（可能全是图片），需要 OCR` };
  return { status: "ready", chunks, pageCount: order.length, detail: `共 ${order.length} 页幻灯片，含 ${notesCount} 页备注，生成 ${chunks.length} 个片段` };
}

export async function extractContent(type: FileType, buf: Buffer, fileName = ""): Promise<ExtractResult> {
  try {
    if (buf.length > MAX_UPLOAD_BYTES) return { status: "failed", chunks: [], pageCount: null, detail: "文件超过 10 MB 上限" };
    if (type === "other" && /\.(docx|xlsx)$/i.test(fileName)) {
      const zip = await JSZip.loadAsync(buf);
      const required = /\.docx$/i.test(fileName) ? "word/document.xml" : "xl/workbook.xml";
      if (!zip.file(required)) return { status: "failed", chunks: [], pageCount: null, detail: "Office 扩展名与压缩包内容不一致" };
      return { status: "unsupported", chunks: [], pageCount: null, detail: `${required.startsWith("word") ? "Word" : "Excel"} 已保存文件元数据，正文未提取，不参与答疑引用` };
    }
    switch (type) {
      case "txt": return extractPlain(buf.toString("utf8"), false);
      case "md": return extractPlain(buf.toString("utf8"), true);
      case "pdf": return await extractPdf(buf);
      case "pptx": return await extractPptx(buf);
      default: return { status: "unsupported", chunks: [], pageCount: null, detail: "暂不支持解析此类型，已保存文件元数据；内容不会用于答疑引用" };
    }
  } catch (e: any) {
    return { status: "failed", chunks: [], pageCount: null, detail: `解析失败：${e?.message ?? e}` };
  }
}
