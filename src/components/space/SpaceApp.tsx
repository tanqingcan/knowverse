"use client";
/**
 * 个人空间，两种模式：
 *  - 花园模式：星球花园是主角。顶部极简导航、一条今日建议、场景入口与简单工具栏、收起的成长时间轴；
 *    选中花朵时在侧边打开植物档案，花园仍然可见。
 *  - 专注学习模式：对话、练习、历史、资料、共学等阅读量大的内容使用宽阅读区，花园缩成侧边的小场景；一键回到花园。
 * 面板状态同步到 URL（?p=chat&c=…&m=…），刷新后恢复。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { api, fmtDate, setTimeZone } from "@/lib/api";
import { loadLayout, saveLayout, publishLayout, revertLayout, fromLayoutItem } from "@/lib/layout-api";
import { DEFAULT_TEMPLATE, loadDecor, isBuildingKind, DECOR_CATALOG, type DecorKind, type DecorPlacement } from "@/lib/decor";
import { CreativeHotbar, DEFAULT_HOTBAR, HOTBAR_KEY } from "@/components/space/CreativeHotbar";
import { DiyWorkbench } from "@/components/space/DiyWorkbench";
import { saveVariant, variantOf } from "@/lib/home/variants";
import { DEFAULT_HOME_LAYOUT } from "@/lib/home/home-layout";
import { Sky } from "@/components/ui/Sky";
import { useDecor } from "@/lib/decor";
import { FlowerSvg } from "@/components/art/Flower";
import { GuideOrb } from "@/components/art/Props";
import type { Celebration, Hotspot } from "@/components/world/GardenWorld";
import { layoutBeds, type WorldPlant } from "@/components/world/bedLayout";
import type { Pose } from "@/components/world/Characters3D";
import { STAGE_NAME, type StageKey } from "@/lib/flora";
import { Ctx, type GrowthEvent, type PanelKey, type PanelState, type Space } from "./context";
import { useDialog, useEscapeClose } from "./useDialog";
import { ChatPanel } from "./panels/ChatPanel";
import { HistoryPanel } from "./panels/HistoryPanel";
import { DossierPanel } from "./panels/DossierPanel";
import { MaterialsPanel } from "./panels/MaterialsPanel";
import { PracticePanel } from "./panels/PracticePanel";
import { TimelinePanel, useTimeline } from "./panels/TimelinePanel";
import { CardsPanel } from "./panels/CardsPanel";
import { GalaxyPanel } from "./panels/GalaxyPanel";
import { MemoryPanel } from "./panels/MemoryPanel";
import { SettingsPanel } from "./panels/SettingsPanel";
import { CreativePalette } from "./CreativePalette";
import { LayoutMenu } from "./LayoutMenu";

const StaticGarden = dynamic(() => import("@/components/world/StaticGarden").then((m) => m.StaticGarden), { ssr: false, loading: () => null });
const GardenWorld = dynamic(() => import("@/components/world/GardenWorld").then((m) => m.GardenWorld), { ssr: false, loading: () => null });

type SectionKey = "garden" | "learn" | "review" | "materials" | "together";
const SECTIONS: { key: SectionKey; label: string; panels: (PanelKey | null)[]; subs?: [PanelKey, string][] }[] = [
  { key: "garden", label: "花园", panels: [null, "dossier"] },
  { key: "learn", label: "学习", panels: ["chat", "practice", "cards"], subs: [["chat", "对话"], ["practice", "练习"], ["cards", "学习卡"]] },
  { key: "review", label: "回顾", panels: ["history", "timeline", "memory"], subs: [["history", "历史问答"], ["timeline", "成长时间轴"], ["memory", "记忆"]] },
  { key: "materials", label: "资料", panels: ["materials"] },
  { key: "together", label: "共学", panels: ["galaxy"] },
];
const FOCUS_PANELS: PanelKey[] = ["chat", "practice", "cards", "history", "timeline", "materials", "galaxy", "memory"];
const TITLES: Record<PanelKey, string> = {
  chat: "与星灯对话", history: "历史问答", dossier: "植物档案", materials: "资料温室", practice: "练习",
  timeline: "成长时间轴", cards: "学习卡", galaxy: "共学星系", memory: "记忆", settings: "设置",
};
const sectionOf = (p: PanelKey | null): SectionKey => SECTIONS.find((s) => s.panels.includes(p))?.key ?? "garden";

function readUrl(): PanelState {
  if (typeof window === "undefined") return { panel: null };
  const s = new URLSearchParams(window.location.search);
  return {
    panel: (s.get("p") as PanelKey) || null, conversationId: s.get("c"), messageId: s.get("m"), plantId: s.get("plant"),
    materialId: s.get("mat"), versionNo: s.get("v") ? Number(s.get("v")) : null, chunkId: s.get("chunk"),
    attemptId: s.get("a"), taskVersionId: s.get("tv"), mode: s.get("mode"), conceptId: s.get("k"), draft: s.get("draft"),
  };
}
function writeUrl(p: PanelState) {
  const s = new URLSearchParams();
  if (p.panel) s.set("p", p.panel);
  const map: [keyof PanelState, string][] = [["conversationId", "c"], ["messageId", "m"], ["plantId", "plant"], ["materialId", "mat"], ["versionNo", "v"], ["chunkId", "chunk"], ["attemptId", "a"], ["taskVersionId", "tv"], ["mode", "mode"], ["conceptId", "k"]];
  for (const [k, q] of map) if (p[k] != null && p[k] !== "") s.set(q, String(p[k]));
  const qs = s.toString();
  window.history.replaceState(null, "", qs ? `/space?${qs}` : "/space");
}

function useWebGL() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    try { const c = document.createElement("canvas"); setOk(!!(c.getContext("webgl2") || c.getContext("webgl"))); } catch { setOk(false); }
  }, []);
  return ok;
}
function useNarrow() {
  const [n, setN] = useState(false);
  useEffect(() => { const m = window.matchMedia("(max-width: 860px)"); const f = () => setN(m.matches); f(); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  return n;
}

type GrowthCard = { plantId: string; name: string; from: StageKey; to: StageKey; reason: string; line: string | null } | null;

export function SpaceApp() {
  const router = useRouter();
  const [space, setSpace] = useState<Space | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelState>({ panel: null });
  const [wide, setWide] = useState(true);
  const [celebrate, setCelebrate] = useState<Celebration>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: string }[]>([]);
  const [osReduced, setOsReduced] = useState(false);
  const [render3dFailed, setRender3dFailed] = useState(false);
  const [override, setOverride] = useState<Record<string, StageKey> | null>(null);
  const [replayLabel, setReplayLabel] = useState<string | null>(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const [dragged, setDragged] = useState(false);
  const [bedFocus, setBedFocus] = useState<{ x: number; z: number; key: number } | null>(null);
  const [creativeOpen, setCreativeOpen] = useState(false);
  // H16/H17：创造模式用底部 9 槽快捷栏替代左侧大面板；全量素材库按需打开（E / 「全部素材」）
  const [libOpen, setLibOpen] = useState(false);
  const [hotbar, setHotbar] = useState<(DecorKind | null)[]>(DEFAULT_HOTBAR);
  const [activeSlot, setActiveSlot] = useState(0);   // H20：当前槽（「放入槽位」的目标）
  const [slotMode, setSlotMode] = useState(false);   // H20：素材库内「放入槽位」选材模式
  const [continuous, setContinuous] = useState(false); // H21：连续放置开关
  const [diyTarget, setDiyTarget] = useState<string | null>(null); // H28：DIY 工作台目标对象
  // V4-R01：正在替换的槽位（点槽位打开素材库时设置；null = 不是替换态）
  const [slotEdit, setSlotEdit] = useState<number | null>(null);
  // V4-R05：独立「布局」面板（服务器/模板/环境密度从素材库搬出）
  const [layoutOpen, setLayoutOpen] = useState(false);
  // V4-R14：方向键步长倍率（布局面板可改，默认 1× = 0.005R）
  const [nudgeScale, setNudgeScale] = useState(1);
  // V4-R19：花圃作为独立布局对象——位移覆盖（键=花圃索引）+ 选中索引
  const [bedMoves, setBedMoves] = useState<Record<string, { x: number; z: number; rot?: number }>>({});
  const [bedSel, setBedSel] = useState<number | null>(null);
  // V4-R09：移动模式——先选中 → 点「移动」/按 M → 指针预览 → 点地面确认（一次确认才写一次历史）
  const [moveId, setMoveId] = useState<string | null>(null);
  const [focusLarge, setFocusLarge] = useState(false); // H40：学习窗「放大/专注」模式（默认不自动变大）
  // H43/H44/H45：星落动画——最多一颗星 + 3 个光点，可取消；低动效直接开窗
  const [starFall, setStarFall] = useState(false);
  const starTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<PanelState>({ panel: null });
  // H25：退出前判断「未保存改动」——savedSnap 记录最近一次成功加载/保存时的布局快照
  const savedSnap = useRef<string>('');
  const [askExit, setAskExit] = useState(false);
  const applyLayout = (arr: DecorPlacement[]) => { decorStore.setAll(arr); savedSnap.current = JSON.stringify(arr); };
  // ── V4-R07：快捷栏配置「按账号」存储（键 kv-hotbar:<userId>），与布局存储（kv-decor / 服务器）彻底分开 ──
  const hotbarKey = (uid?: string) => `${HOTBAR_KEY}:${uid ?? "anon"}`;
  const hotbarKeyRef = useRef(hotbarKey(undefined));
  const hotbarReady = useRef(false);
  const isValidHotbar = (v: unknown): v is (DecorKind | null)[] =>
    Array.isArray(v) && v.length === 9 && v.every((k) => k === null || DECOR_CATALOG.some((c) => c.kind === k));
  useEffect(() => {
    const uid = space?.user.id;
    const key = hotbarKey(uid);
    hotbarKeyRef.current = key;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const arr = JSON.parse(raw);
        if (isValidHotbar(arr)) { setHotbar(arr); }
        else { setHotbar(DEFAULT_HOTBAR); setLayoutMsg("快捷栏配置已损坏，已恢复默认（旧数据保留在本地）"); }
      } else if (uid) {
        // 从旧版全局键迁移一次（旧版本不区分账号）
        const legacyRaw = localStorage.getItem(HOTBAR_KEY);
        if (legacyRaw) {
          try {
            const arr = JSON.parse(legacyRaw);
            if (isValidHotbar(arr)) { setHotbar(arr); setLayoutMsg("已把旧版快捷栏配置迁移到当前账号"); }
          } catch { localStorage.setItem(key + ":legacy-broken", legacyRaw); }
        }
      }
    } catch {
      setHotbar(DEFAULT_HOTBAR);
      setLayoutMsg("快捷栏配置读取失败，已恢复默认");
    }
    hotbarReady.current = true;
  }, [space?.user.id]);
  // 只跟随 hotbar 变化写回；键用 ref，账号切换时不会把上一个账号的槽位写到新键
  useEffect(() => {
    if (!hotbarReady.current) return;
    try { localStorage.setItem(hotbarKeyRef.current, JSON.stringify(hotbar)); } catch { /* 隐私模式等写失败忽略 */ }
  }, [hotbar]);
  const [placingKind, setPlacingKind] = useState<string | null>(null);
  const [selectedDecorId, setSelectedDecorId] = useState<string | null>(null);
  const [layoutRev, setLayoutRev] = useState(0);
  const [layoutStatus, setLayoutStatus] = useState("draft");
  const [layoutMsg, setLayoutMsg] = useState<string | null>(null);
  const [importPrompt, setImportPrompt] = useState<{ local: number; server: number } | null>(null);
  const [layoutHasPublished, setLayoutHasPublished] = useState(false);
  const [firstDismissed, setFirstDismissed] = useState(false);
  const lastPlaceAt = useRef(0); // 刚放置后的短时间窗口，避免同一次点击又选中植物/热点而关闭创造面板
  const [busy, setBusy] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [growthCard, setGrowthCard] = useState<GrowthCard>(null);
  const [intro, setIntro] = useState<"long" | "short" | "none">("none");
  const [introPlaying, setIntroPlaying] = useState(false);
  const pendingCard = useRef<GrowthCard>(null);
  const webgl = useWebGL();
  const narrow = useNarrow();
  const decorStore = useDecor();

  // H25：isDirty 用 ref 取最新布局，避免 Esc 闭包拿到旧 decor
  const decorRef = useRef<DecorPlacement[]>(decorStore.decor);
  decorRef.current = decorStore.decor;
  const isDirty = () => savedSnap.current !== '' && JSON.stringify(decorRef.current) !== savedSnap.current;
  const tid = useRef(0);

  const reload = useCallback(async () => {
    try { const s = await api<Space>("/api/space"); setSpace(s); setTimeZone(s.user.timezone); setLoadErr(null); return s; }
    catch (e: any) {
      if (e?.status === 401) { router.replace("/"); return null; }
      setLoadErr(e?.message ?? "加载失败"); return null;
    }
  }, [router]);

  useEffect(() => {
    const red = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setOsReduced(red);
    const u0 = readUrl();
    // 入场动画：只在直接进入花园模式时播放；第一次较完整，之后更短（用户设置了低动效时 3D 场景会直接跳过）
    if (!u0.panel && !red) {
      let seen = false;
      try { seen = !!localStorage.getItem("kv-intro-seen"); localStorage.setItem("kv-intro-seen", "1"); } catch {}
      setIntro(seen ? "short" : "long"); setIntroPlaying(true);
    }
    reload().then((s) => {
      if (!s) return;
      const u = readUrl();
      if ((u.panel as string) === "planet") setPanel({ panel: null });
      else if (u.panel) setPanel(u);
      else if (new URLSearchParams(window.location.search).get("welcome")) setPanel({ panel: "dossier", plantId: s.planet?.natalPlantId ?? null });
      if (s.user.reducedMotion) setIntroPlaying(false);
    });
  }, [reload]);

  useEffect(() => { if (space) writeUrl(panel); }, [panel, space]);

  // 创造模式：从服务端加载已保存布局（G4）；失败/未保存过则保留本地草稿
  useEffect(() => {
    loadLayout().then((l) => {
      // H03：初始模板只负责「首次创建」。之后用户草稿（即使还没保存）优先于模板，
      // 刷新不会把搬走的建筑弹回原位；服务端一旦有建筑实例即以其为权威。
      const local = loadDecor();
      const localHasBuildings = local.some((d) => isBuildingKind(d.kind));
      if (l.revision === 0) {
        // 从未保存过：本地已有建筑草稿就沿用；否则套初始布局 + 保留本地旧装饰
        applyLayout(localHasBuildings ? local : [...DEFAULT_HOME_LAYOUT, ...local.filter((d) => !isBuildingKind(d.kind))]);
      } else {
        // H52：v3 及以后的布局以服务端为唯一权威——用户可能故意把建筑全删了，
        // 绝不能用 DEFAULT_HOME_LAYOUT 再补回来（旧版布局才走迁移兜底）。
        if ((l.schemaVersion ?? 1) >= 2) {
          applyLayout(l.items.map(fromLayoutItem));
          setLayoutRev(l.revision);
          setLayoutStatus(l.status);
          return;
        }
        const serverHasBuildings = l.items.some((it) => isBuildingKind(it.kind));
        if (serverHasBuildings) {
          // 服务端权威：G6 旧版 localStorage 草稿检测——先备份，不静默覆盖；差异则提示一次性导入
          try {
            const raw = localStorage.getItem("kv-decor");
            const norm = (arr: any[]) => JSON.stringify(arr.map((d) => ({ k: d?.kind, x: +(+(d?.x ?? 0)).toFixed(3), z: +(+(d?.z ?? 0)).toFixed(3), s: +(+(d?.scale ?? 1)).toFixed(3) })));
            if (Array.isArray(local) && local.length > 0 && norm(local) !== norm(l.items)) {
              if (raw) localStorage.setItem("kv-decor-backup", raw);
              setImportPrompt({ local: local.length, server: l.items.length });
            }
          } catch { /* 忽略损坏的本地草稿 */ }
          applyLayout(l.items.map(fromLayoutItem));
        } else if (localHasBuildings) {
          // H03：服务端仍是迁移前的旧布局，但本地已做过首次创建（可能未保存）——保留用户草稿，不回弹模板
          applyLayout(local);
          setLayoutMsg("本地已有新版布置（尚未保存到服务器）");
        } else {
          // H14：旧布局一次性补入初始建筑；模板只在此刻生效
          applyLayout([...DEFAULT_HOME_LAYOUT, ...l.items.map(fromLayoutItem)]);
          setLayoutMsg("已按新版补入初始建筑（保存后生效）");
        }
      }
      setLayoutRev(l.revision); setLayoutStatus(l.status); setLayoutHasPublished(!!l.hasPublished);
    }).catch(() => {
      // H14：加载失败不静默写默认布局——保留本地草稿并明确告知（toast 全局可见，不依赖素材栏是否打开）
      setLayoutMsg("布局加载失败：已保留本地草稿，可稍后重试");
      toast("布局加载失败：已保留本地草稿，可稍后重试", "error");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const saveCreative = useCallback(async () => {
    try { setLayoutMsg("保存中…"); const r = await saveLayout(layoutRev, decorStore.decor, bedMoves); setLayoutRev(r.revision); setLayoutStatus(r.status); savedSnap.current = JSON.stringify(decorStore.decor); setLayoutMsg(`已保存到服务器（revision ${r.revision}）`); }
    catch (e: any) { setLayoutMsg(`保存失败：${e?.message ?? "网络错误"}`); }
  }, [layoutRev, decorStore.decor]);
  // H25：退出创造的三条路径（右上退出按钮 / 快捷栏退出 / Esc 最后一级）统一走这里
  const doExit = () => {
    setAskExit(false); setCreativeOpen(false); setPlacingKind(null); setMoveId(null);
    setSelectedDecorId(null); setLibOpen(false); setSlotMode(false);
  };
  const requestExit = () => {
    if (isDirty()) { setAskExit(true); return; }   // 有未保存改动 → 先问
    doExit();
  };
  /** 保存并退出：保存失败时留在编辑并保留草稿（不退出、不清空） */
  const saveThenExit = async () => {
    try {
      setLayoutMsg("保存中…");
      const r = await saveLayout(layoutRev, decorStore.decor, bedMoves);
      setLayoutRev(r.revision); setLayoutStatus(r.status);
      savedSnap.current = JSON.stringify(decorStore.decor);
      setLayoutMsg(`已保存到服务器（revision ${r.revision}）`);
      doExit();
    } catch (e: any) {
      setLayoutMsg(`保存失败：${e?.message ?? "网络错误"}（改动仍在，可重试）`);
    }
  };
  const publishCreative = useCallback(async () => {
    try { setLayoutMsg("发布中…"); const r = await publishLayout(layoutRev); setLayoutStatus(r.status); setLayoutHasPublished(true); setLayoutMsg(`已发布（revision ${r.revision}）`); }
    catch (e: any) { setLayoutMsg(`发布失败：${e?.message ?? "网络错误"}`); }
  }, [layoutRev]);
  // G6：恢复上一已发布版本（用服务端 published_items 快照替换草稿，revision+1）
  const revertCreative = useCallback(async () => {
    if (!window.confirm("用上一已发布版本替换当前草稿？（revision 会 +1，未保存改动会丢失）")) return;
    try {
      setLayoutMsg("恢复中…");
      const r = await revertLayout();
      applyLayout(r.items.map(fromLayoutItem));
      setLayoutRev(r.revision); setLayoutStatus(r.status); setSelectedDecorId(null);
      setLayoutMsg(`已恢复上一已发布版本（revision ${r.revision}）`);
    } catch (e: any) { setLayoutMsg(`恢复失败：${e?.message ?? "网络错误"}`); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decorStore]);
  // G2 撤销/重做：历史在 useDecor 内（与 list 同源），见 src/lib/decor.ts
  const undo = () => { decorStore.undo(); setSelectedDecorId(null); };
  const redo = () => { decorStore.redo(); setSelectedDecorId(null); };
  // G6 初始模板 / 放弃修改
  const applyTemplate = () => {
    // H13：模板恢复「先预览」——告知将被替换成什么（件数与种类），并明确可撤销回滚
    const summary = DEFAULT_TEMPLATE.map((d) => d.kind).join("、");
    if (!window.confirm(`从模板开始：共 ${DEFAULT_TEMPLATE.length} 件（${summary}）。\n当前草稿会被整体替换，可用「撤销」回滚。`)) return;
    decorStore.applyTemplate(DEFAULT_TEMPLATE);
    setSelectedDecorId(null);
    setLayoutMsg("已载入默认模板（记得保存或发布）");
  };
  const discard = () => {
    if (!window.confirm("放弃未保存的改动，恢复服务器上的布局？")) return;
    loadLayout().then((l) => {
      // H03：服务端还没有建筑实例时，恢复服务器布局也要补回初始建筑，否则会被清空成「没有房子」
      const serverHasBuildings = l.items.some((it) => isBuildingKind(it.kind));
      applyLayout(serverHasBuildings ? l.items.map(fromLayoutItem) : [...DEFAULT_HOME_LAYOUT, ...l.items.map(fromLayoutItem)]);
      setLayoutRev(l.revision); setLayoutStatus(l.status); setLayoutMsg("已恢复服务器布局");
    }).catch((e: any) => setLayoutMsg(`恢复失败：${e?.message ?? "网络错误"}`));
  };
  // G6：旧版 localStorage 草稿一次性导入（已备份，差异提示，不静默覆盖）
  const importLocalDraft = () => {
    try {
      const raw = localStorage.getItem("kv-decor-backup");
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) {
        decorStore.setAll(arr.map((d: any, i: number) => ({ ...d, id: d?.id ?? `bk-${i}` })));
        setLayoutMsg(`已导入本地草稿 ${arr.length} 件（尚未保存到服务器）`);
      }
    } catch { setLayoutMsg("导入失败：本地草稿损坏"); }
    setImportPrompt(null);
  };
  const keepServerLayout = () => setImportPrompt(null);
  // H06：复制改为「进入跟随指针的预览」——记录源实例参数，点击球面才真正落位；Esc 取消不留幽灵
  const [copyFrom, setCopyFrom] = useState<DecorPlacement | null>(null);
  const startCopy = (id: string) => {
    const src = decorStore.decor.find((d) => d.id === id);
    if (!src) return;
    setCopyFrom(src);
    setPlacingKind(src.kind);
    setSelectedDecorId(null);
    setLayoutMsg("移动指针选择位置，点击确认；Esc 取消");
  };
  const duplicateDecor = () => { if (selectedDecorId) startCopy(selectedDecorId); };
  // Ctrl+D 复制：输入框/文本域聚焦时不拦截（H18 输入冲突要求）
  useEffect(() => {
    if (!creativeOpen) return;
    const f = (e: KeyboardEvent) => {
      if (diyTarget) return; // H36：工作台打开时屏蔽 1–9 / E 等场景快捷键
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateDecor(); }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creativeOpen, selectedDecorId, diyTarget]);
  // H18/H19：1–9 切槽、E 打开全量素材库；输入框/文本域聚焦时不拦截
  useEffect(() => {
    if (!creativeOpen) return;
    const f = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (diyTarget) return; // H36：DIY 工作台打开时屏蔽 1–9 / E 等场景快捷键
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key >= "1" && e.key <= "9") {
        const k = hotbar[Number(e.key) - 1];
        if (!k) return;
        e.preventDefault();
        setCopyFrom(null);
        setPlacingKind((prev) => (prev === k ? null : k));
        return;
      }
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        setLibOpen(true);
        return;
      }
      if (e.key === "m" || e.key === "M") {
        // V4-R19：选中花圃时，M 平移整圃
        if (bedSel != null) {
          e.preventDefault();
          setCopyFrom(null); setPlacingKind(null); setMoveId(`bed:${bedSel}`);
          setLayoutMsg("点击星球表面确定花圃新位置；Esc 取消（植物随花圃移动）");
          return;
        }
        // V4-R09：M = 移动选中对象（无选中时不拦截）
        if (!selectedDecorId) return;
        e.preventDefault();
        const it = decorStore.decor.find((d) => d.id === selectedDecorId);
        if (!it) return;
        setCopyFrom(null); setMoveId(selectedDecorId); setPlacingKind(it.kind);
        setLayoutMsg(`移动「${DECOR_CATALOG.find((c) => c.kind === it.kind)?.label ?? it.kind}」：点击星球表面确认；Esc 取消`);
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [creativeOpen, hotbar, diyTarget, selectedDecorId, bedSel]);
  // G2/G10：Esc 逐级退出创造模式（取消放置 → 取消选中 → 收起素材栏）
  useEffect(() => {
    if (!creativeOpen) return;
    const f = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (diyTarget) return; // H36：DIY 工作台自己处理 Esc
      // H19：全量素材库打开时 Esc 先关库
      if (libOpen) { setLibOpen(false); return; }
      // V4-R09：移动预览中按 Esc → 取消，对象保持原位（预览期间没写过 store）
      if (moveId) { setMoveId(null); setPlacingKind(null); setLayoutMsg("已取消移动，位置不变"); return; }
      // H06：复制预览中按 Esc → 取消预览，不留下幽灵对象
      if (placingKind) { setPlacingKind(null); setCopyFrom(null); return; }
      if (selectedDecorId) { setSelectedDecorId(null); return; }
      requestExit();
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [creativeOpen, placingKind, moveId, selectedDecorId, libOpen, diyTarget]);
  useEffect(() => { if (!introPlaying) return; const t = setTimeout(() => setIntroPlaying(false), 4500); return () => clearTimeout(t); }, [introPlaying]);
  const lastConv = useRef<string | null>(null);
  useEffect(() => { if (panel.panel === "chat" && panel.conversationId) lastConv.current = panel.conversationId; }, [panel]);

  const toast = useCallback((msg: string, kind: "info" | "error" = "info") => {
    const id = ++tid.current;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 5200);
  }, []);

  // H44：清掉未完成的星落计时器（关闭/切路由/连续点开时不留残余）
  const cancelStar = useCallback(() => {
    if (starTimer.current) { clearTimeout(starTimer.current); starTimer.current = null; }
    setStarFall(false);
  }, []);
  const open = useCallback((p: PanelState) => {
    const prev = panelRef.current.panel;
    setPanel(p);
    panelRef.current = p;
    const opening = !!p.panel && FOCUS_PANELS.includes(p.panel) && !prev;
    if (!opening) { cancelStar(); return; }
    // H44：低动效/系统减少动效时直接打开，不强制看动画
    const reduced = typeof window !== "undefined" &&
      (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.body.classList.contains("reduced-motion"));
    if (reduced) { cancelStar(); return; }
    if (starTimer.current) clearTimeout(starTimer.current);
    setStarFall(true);
    starTimer.current = setTimeout(() => { setStarFall(false); starTimer.current = null; }, 700);
  }, [cancelStar]);
  useEffect(() => () => { if (starTimer.current) clearTimeout(starTimer.current); }, []);
  const openPanelKey = useCallback((k: PanelKey | null) => {
    if (k === "chat") open({ panel: "chat", conversationId: lastConv.current ?? space?.user.lastConversationId ?? null });
    else open({ panel: k });
  }, [open, space]);
  const openSection = (s: SectionKey) => {
    const sec = SECTIONS.find((x) => x.key === s)!;
    if (sec.key === "garden") { open({ panel: null }); return; }
    if (sec.panels.includes(panel.panel)) return;
    openPanelKey(sec.panels[0]);
  };

  /** 后端已提交的成长事件 → 刷新状态 → 播放确定性动画（只在真实的阶段变化后） */
  const onGrowth = useCallback(async (events: GrowthEvent[] | undefined) => {
    if (!events?.length) return;
    const s = await reload();
    const changes = events.filter((e) => e.eventType === "stage_changed" && e.toStage);
    const planted = s ? changes.filter((c) => s.plants.some((p) => p.conceptId === c.conceptId)) : [];
    const last = planted[planted.length - 1];
    if (last && s) {
      const plant = s.plants.find((p) => p.conceptId === last.conceptId)!;
      const first = planted.filter((c) => c.conceptId === last.conceptId)[0];
      const from = (first.fromStage ?? "seed") as StageKey, to = last.toStage as StageKey;
      setCelebrate({ plantId: plant.id, fromStage: from, toStage: to, key: Date.now() });
      setCelebrating(true); setTimeout(() => setCelebrating(false), 4200);
      const reason = last.reason.split("；").pop() ?? last.reason;
      pendingCard.current = { plantId: plant.id, name: plant.nickname ?? plant.conceptName, from, to, reason, line: to === "bloom" && last.reason.includes("不使用提示") ? "这次你没有用提示。" : null };
      // 3D 场景在动画结束时显示卡片；2D / 低动效时立即显示
      setTimeout(() => {
        if (!pendingCard.current) return;
        const card = pendingCard.current; pendingCard.current = null; setGrowthCard(card);
        setTimeout(() => setGrowthCard((c) => (c === card ? null : c)), 12000); // 自动收起，不长期遮挡
      }, 3200);
    } else if (changes.length) {
      toast(`已记录：${changes[changes.length - 1].reason}`);
    } else {
      const ev = events.find((e) => e.eventType === "evidence_added");
      if (ev) toast(`已记录：${ev.reason}`);
    }
  }, [reload, toast]);

  const replay = useCallback((events: { conceptId: string; fromStage: StageKey | null; toStage: StageKey | null; createdAt: string; conceptName: string }[]) => {
    if (!space || !events.length) return;
    const byConcept = new Map(space.plants.map((p) => [p.conceptId, p]));
    const ordered = [...events].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)).filter((e) => byConcept.has(e.conceptId));
    const start: Record<string, StageKey> = {};
    const seen: Record<string, boolean> = {};
    for (const p of space.plants) start[p.id] = p.stage;
    for (const e of ordered) { const p = byConcept.get(e.conceptId)!; if (!seen[p.id]) { start[p.id] = (e.fromStage ?? "seed") as StageKey; seen[p.id] = true; } }
    setOverride({ ...start });
    setPanel({ panel: null });
    let i = 0;
    const step = () => {
      if (i >= ordered.length) { setTimeout(() => { setOverride(null); setReplayLabel(null); }, 1800); return; }
      const e = ordered[i++]; const p = byConcept.get(e.conceptId)!;
      setOverride((o) => ({ ...(o ?? {}), [p.id]: e.toStage as StageKey }));
      setCelebrate({ plantId: p.id, fromStage: (e.fromStage ?? "seed") as StageKey, toStage: e.toStage as StageKey, key: Date.now() + i });
      setReplayLabel(`${fmtDate(e.createdAt)}　「${e.conceptName}」${STAGE_NAME[(e.fromStage ?? "seed") as StageKey]} → ${STAGE_NAME[e.toStage as StageKey]}`);
      setTimeout(step, reducedRef.current ? 900 : 2800);
    };
    step();
  }, [space]);
  const reducedRef = useRef(false);
  const setPanelPatch = useCallback((p: Partial<PanelState>) => setPanel((x) => ({ ...x, ...p })), []);

  const reduced = (space?.user.reducedMotion ?? false) || osReduced;
  reducedRef.current = reduced;
  const renderMode = space?.user.renderMode ?? "auto";
  const use3d = !render3dFailed && webgl === true && (renderMode === "3d" || (renderMode === "auto"));

  const scenePlants = useMemo(() => (space?.plants ?? []).map((p) => ({ ...p, stage: override?.[p.id] ?? p.stage, gardenIndex: space!.gardens.findIndex((g) => g.id === p.gardenId) })), [space, override]);
  const sceneGardens = useMemo(() => (space?.gardens ?? []).map((g) => ({ id: g.id, name: g.name })), [space]);
  // V4-R19/R21：当前花圃布局（含手动位移覆盖），供选中坐标/整圃精调使用；与 GardenHUD 内部那份互不影响
  const bedLayoutNow = useMemo(
    () => layoutBeds(sceneGardens, (space?.plants ?? []).map((p) => ({ ...p, gardenIndex: (space?.gardens ?? []).findIndex((g) => g.id === p.gardenId) })) as WorldPlant[], bedMoves),
    [sceneGardens, space, bedMoves],
  );

  // 浮窗语义：Esc 关闭、焦点进出、Tab 不出窗（只对需要专注的浮窗与设置弹窗生效）
  const closePanel = useCallback(() => { setFocusLarge(false); open({ panel: null }); }, [open]);
  const focusWinRef = useRef<HTMLElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const focusWinOpen = !!panel.panel && FOCUS_PANELS.includes(panel.panel);
  // H47：窗口真的渲染出来（星落结束后）才算「打开」，否则 ref 为 null、焦点与 Tab 陷阱会失效
  const focus = !!panel.panel && FOCUS_PANELS.includes(panel.panel) && !starFall;
  // H47：必须用「窗口已渲染」的 focus（星落期间窗口还没挂载，ref 为 null，focus/Tab 陷阱会全部失效）
  useDialog(focus, focusWinRef, closePanel, 'nav.sections button[aria-current="page"]');
  useDialog(panel.panel === "settings", settingsRef, closePanel, 'button[aria-label="设置"]');
  // 植物档案是轻量侧栏：只补 Esc 关闭与焦点归还，不锁 Tab、不锁滚动
  useEscapeClose(panel.panel === "dossier", closePanel, '.tool-wrap .tool');

  if (loadErr && !space) return <main className="intro"><div className="auth-card paper"><h2>星球暂时没有回应</h2><p className="err">{loadErr}</p><button className="btn btn-primary" onClick={() => reload()}>重试</button></div></main>;
  if (!space) return <main className="intro"><div className="intro-copy"><GuideOrb size={56} thinking /><p className="muted">正在靠近你的星球…</p></div></main>;

  const showIntro = introPlaying && use3d;
  const ctx = { space, reload, open, panel, setPanelPatch, onGrowth, toast, reduced, wide, setWide, replay, replaying: !!override, setBusy };
  const natal = space.plants.find((p) => p.isNatal);
  const section = sectionOf(panel.panel === "settings" ? null : panel.panel);
  const sec = SECTIONS.find((s) => s.key === section)!;
  const selectedPlant = panel.panel === "dossier" ? panel.plantId ?? null : null;

  const pose: Pose = celebrating ? "celebrate" : selectedPlant ? "tend" : busy ? "think" : focus ? "read" : "idle";
  const lampState = celebrating ? "celebrate" : busy ? "think" : selectedPlant ? "guide" : "idle";

  const onHotspot = (h: Hotspot) => {
    if (h === "cottage") openPanelKey("chat");
    else if (h === "greenhouse") open({ panel: "materials" });
    else if (h === "path") open({ panel: "history" });
    else if (h === "galaxy" || h === "observatory") open({ panel: "galaxy" });
  };
  const hoverLabel = (k: string) => {
    if (k.startsWith("plant:")) {
      const p = scenePlants.find((x) => x.id === k.slice(6));
      return p ? `${p.nickname ? `「${p.nickname}」` : ""}${p.conceptName} · ${STAGE_NAME[p.stage]}${p.reviewDue ? " · 待复习" : ""}` : null;
    }
    return { cottage: "星灯书屋 · 学习与对话", greenhouse: "资料温室 · 我的资料", path: "回忆小径 · 历史问答", galaxy: "远处的星球 · 共学", observatory: "观星台 · 共学", seedshed: "种子小棚 · 待播的种子", arch: "花园拱门", pond: "小池塘 · 木桥" }[k] ?? null;
  };

  return (
    <Ctx.Provider value={ctx}>
      <div className={`app ${focus ? "is-focus" : "is-garden"} ${reduced ? "reduced-motion" : ""} ${showIntro ? "is-intro" : ""} ${creativeOpen ? "is-creating" : ""}`}>
        <Sky />

        {/* 花园场景：同一个画布在两种模式间改变大小，不重新加载 */}
        <section className="world-wrap" aria-label={`${space.planet?.name ?? "我的星球"}：${space.plants.length} 株植物`}>
          {use3d ? (
            <GardenWorld plants={scenePlants} gardens={sceneGardens} selectedId={selectedPlant}
              onSelect={(id) => { if (performance.now() - lastPlaceAt.current < 400) return; open({ panel: "dossier", plantId: id }); }}
              onHotspot={(h) => { if (performance.now() - lastPlaceAt.current < 400) return; onHotspot(h); }}
              mode={focus ? "focus" : "garden"} reduced={reduced} celebrate={celebrate} pose={pose} lampState={lampState}
              signText={natal ? (natal.nickname ?? natal.conceptName) : (space.planet?.name ?? "我的星球")} signSub={natal ? "本命花" : ""}
              recenterKey={recenterKey} focusBed={bedFocus} onDragged={setDragged} hoverLabel={hoverLabel} intro={intro} decor={decorStore.decor}
              onDecorMove={(id, x, z) => decorStore.update(id, { x, z })}
              onDecorMoveStart={(id) => {
                const it = decorStore.decor.find((d) => d.id === id);
                if (!it) return;
                setCopyFrom(null); setMoveId(id); setPlacingKind(it.kind); setSelectedDecorId(id);
                setLayoutMsg(`移动「${DECOR_CATALOG.find((c) => c.kind === it.kind)?.label ?? it.kind}」：点击星球表面确认；Esc 取消（原位不动）`);
              }}
              onPlaceMiss={() => { if (moveId || placingKind) setLayoutMsg("这里放不了：请点击星球表面"); }}
              nudgeScale={nudgeScale}
              bedMoves={bedMoves}
              selectedBedIndex={bedSel}
              bedSelPos={bedSel != null && bedLayoutNow[bedSel] ? { x: bedLayoutNow[bedSel].x, z: bedLayoutNow[bedSel].z } : null}
              onBedNudge={(i, cap) => { const gid = space?.gardens?.[i]?.id ?? String(i); setBedMoves((prev) => ({ ...prev, [gid]: { x: cap.x, z: cap.z, rot: prev[gid]?.rot ?? 0 } })); setLayoutMsg("花圃已微调（尚未保存）"); }}
              bedMoving={moveId?.startsWith("bed:") ?? false}
              onSelectBed={(i) => { setBedSel(i); setSelectedDecorId(null); const nm = space?.gardens?.[i]?.name ?? `花圃 ${i + 1}`; setLayoutMsg(`已选中花圃「${nm}」——按 M 或点操作条上的「移动」平移整圃（植物随行）`); }}
              placingKind={placingKind}
              onPlace={(x, z) => {
                // V4-R09/R11：移动确认——只在这里写一次 update（预览期间不写 store，不产生多步 undo）
                if (moveId?.startsWith("bed:")) {
                  const gi = Number(moveId.slice(4));
                  const gid = space?.gardens?.[gi]?.id ?? String(gi);
                  setBedMoves((prev) => ({ ...prev, [gid]: { x, z, rot: prev[gid]?.rot ?? 0 } }));
                  lastPlaceAt.current = performance.now();
                  setMoveId(null); setPlacingKind(null);
                  setLayoutMsg("花圃已平移，植物/土壤一起移动（尚未保存）");
                  return;
                }
                if (moveId) {
                  decorStore.update(moveId, { x, z });
                  lastPlaceAt.current = performance.now();
                  setMoveId(null); setPlacingKind(null);
                  setLayoutMsg("已移到新位置（可撤销）");
                  return;
                }
                // H06：复制预览确认 → 用源实例参数落位；普通放置 → 用素材默认参数
                if (copyFrom) {
                  const id = decorStore.place(copyFrom.kind, x, z, { rot: copyFrom.rot, scale: copyFrom.scale, color: copyFrom.color, stage: copyFrom.stage, width: copyFrom.width, length: copyFrom.length, parts: copyFrom.parts ? { ...copyFrom.parts } : undefined });
                  lastPlaceAt.current = performance.now();
                  setCopyFrom(null); setPlacingKind(null); setSelectedDecorId(id);
                  setLayoutMsg("已复制一份");
                  return;
                }
                if (placingKind) {
                  // H32：若该素材存过个人配色变体，新放置时复用（只影响新对象）
                  const vp = variantOf(placingKind as string);
                  const id = decorStore.place(placingKind as any, x, z, vp ? { parts: { ...vp } } : undefined);
                  lastPlaceAt.current = performance.now();
                  // H21：放置成功的明确反馈（热栏消息条）；连续放置开着时保持素材，否则放完退出
                  const label = DECOR_CATALOG.find((c) => c.kind === placingKind)?.label ?? placingKind;
                  setLayoutMsg(`已放置「${label}」（共 ${decorStore.decor.length + 1} 件）${continuous ? " · 连续放置中" : ""}`);
                  if (!continuous) { setPlacingKind(null); setSelectedDecorId(id); }
                }
              }}
              onDecorSelect={(id) => { setCreativeOpen(true); setSelectedDecorId(id); setBedSel(null); }}
              selectedDecorId={selectedDecorId}
              paused={creativeOpen || panel.panel !== null || introPlaying || !!diyTarget}
              editing={creativeOpen}
              onDecorDuplicate={(id) => startCopy(id)}
              onDecorRemove={(id) => { decorStore.remove(id); setSelectedDecorId(null); }}
              onDecorTransformStart={() => decorStore.beginTransform()}
              onDecorTransformEnd={() => decorStore.endTransform()}
              onDecorUpdate={(id, patch) => decorStore.update(id, patch)}
              onDecorDiy={(id) => { setSelectedDecorId(id); setDiyTarget(id); }}
              placingPreview={(() => {
                if (moveId) {
                  const it = decorStore.decor.find((d) => d.id === moveId);
                  if (it) return { kind: it.kind, rot: it.rot, scale: it.scale, color: it.color, stage: it.stage };
                }
                if (copyFrom) return { kind: copyFrom.kind, rot: copyFrom.rot, scale: copyFrom.scale, color: copyFrom.color, stage: copyFrom.stage };
                return placingKind ? { kind: placingKind, rot: 0, scale: 1 } : null;
              })()}
              onIntroDone={() => setIntroPlaying(false)} onFail={() => setRender3dFailed(true)} />
          ) : (
            <StaticGarden plants={scenePlants} gardens={sceneGardens} selectedId={selectedPlant} onSelect={(id) => open({ panel: "dossier", plantId: id })}
              onHotspot={onHotspot} celebrate={celebrate} reduced={reduced} compact={focus} pose={pose}
              decor={decorStore.decor}
              signText={natal ? (natal.nickname ?? natal.conceptName) : (space.planet?.name ?? "我的星球")} />
          )}
        </section>

        {showIntro && <div className="intro-skip" aria-hidden="true">点击任意处跳过</div>}

        <header className="topnav">
          <div className="brand" aria-label="知屿 KNOWVERSE">知屿<small>KNOWVERSE</small></div>
          <nav className="sections" aria-label="主导航">
            {SECTIONS.map((s) => (
              <button key={s.key} aria-current={section === s.key ? "page" : undefined} onClick={() => openSection(s.key)}>{s.label}</button>
            ))}
          </nav>
          <div className="nav-right">
            <ModeNotice space={space} />
            <button className="btn btn-quiet btn-icon" aria-label="设置" title="设置" onClick={() => open({ panel: "settings" })}><GearIcon /></button>
            <button className="btn btn-quiet btn-sm desktop-only" onClick={async () => { await api("/api/auth/logout", { method: "POST" }); router.replace("/"); router.refresh(); }}>离开</button>
          </div>
        </header>

        {/* H16：进入创造后保留「小型退出入口」——HUD 主体（今日建议/业务工具栏）隐藏，只留一个退出创造按钮 */}
        {creativeOpen && !focus && (
          <button className="create-exit" type="button" onClick={requestExit} aria-label="退出创造模式">退出创造</button>
        )}
        {/* H28：DIY 工作台——独立覆盖层，主场景（星球/镜头/选中）不卸载不失位 */}
        {diyTarget && (() => {
          const it = decorStore.decor.find((d) => d.id === diyTarget);
          if (!it) return null;
          return (
            <DiyWorkbench
              item={it}
              onApply={(parts, stage) => {
                // H31 遗留补修（H60 审计发现）：与当前值完全相同时不写空历史
                const sameParts = JSON.stringify(parts) === JSON.stringify(it.parts ?? {});
                const sameStage = !stage || stage === it.stage;
                if (sameParts && sameStage) { setDiyTarget(null); setLayoutMsg("配色没有变化，未产生新的撤销步骤"); return; }
                decorStore.update(it.id, stage ? { parts, stage } : { parts });
                setDiyTarget(null);
                setLayoutMsg("已应用 DIY 配色（可撤销回滚）");
              }}
              onCancel={() => setDiyTarget(null)}
              onSaveVariant={(parts) => { saveVariant(it.kind, parts); setLayoutMsg("已保存为你的素材变体（新放置同类素材时复用）"); }}
            />
          );
        })()}
        {/* H25：未保存改动的三选一对话框——保存并退出 / 放弃本轮 / 继续编辑 */}
        {askExit && (
          <div className="exit-mask" role="dialog" aria-modal="true" aria-label="退出创造模式">
            <div className="exit-card">
              <b>有未保存的改动</b>
              <p className="exit-sub">退出前要把当前布置保存到服务器吗？</p>
              <div className="exit-actions">
                <button className="btn btn-primary btn-sm" onClick={() => void saveThenExit()}>保存并退出</button>
                <button className="btn btn-quiet btn-sm" onClick={() => { setAskExit(false); void discard(); doExit(); }}>放弃本轮</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAskExit(false)}>继续编辑</button>
              </div>
            </div>
          </div>
        )}
        {!focus && !creativeOpen && (
          <GardenHUD narrow={narrow} dragged={dragged} onRecenter={() => setRecenterKey((k) => k + 1)} onLocateBed={(x, z) => setBedFocus({ x, z, key: Date.now() })} selectedPlant={selectedPlant} replayLabel={replayLabel} hidden={showIntro} creativeOpen={creativeOpen} onToggleCreative={() => { setCreativeOpen(!creativeOpen); setPlacingKind(null); }} />
        )}
        {/* H16：顶栏/主内容区在创造模式下隐藏（视觉只留星球 + 底部快捷栏） */}
        {creativeOpen && !focus && (
          <CreativeHotbar
            slots={hotbar}
            activeKind={(placingKind as DecorKind) ?? null}
            picking={!!placingKind}
            continuous={continuous}
            onToggleContinuous={() => setContinuous((v) => !v)}
            message={layoutMsg}
            currentSlot={activeSlot}
            onEditSlot={(i) => { setActiveSlot(i); setSlotEdit(i); setPlacingKind(null); setCopyFrom(null); setLibOpen(true); }}
          onPlaceSlot={(i) => { const k = hotbar[i]; if (!k) return; setActiveSlot(i); setSlotEdit(null); setCopyFrom(null); setPlacingKind(k); setLibOpen(false); }}
            onOpenLibrary={() => setLibOpen(true)}
            onOpenLayout={() => setLayoutOpen(true)}
            onSave={() => void saveCreative()}
            onExit={requestExit}
            onUndo={() => decorStore.undo()}
            onRedo={() => decorStore.redo()}
            canUndo={decorStore.canUndo}
            canRedo={decorStore.canRedo}
            onWheelSlot={(dir) => {
              // H18：滚轮在栏上切槽；在画布上仍由 .world 的 onWheel 缩放，互不串扰
              const cur = placingKind ? hotbar.indexOf(placingKind as DecorKind) : -1;
              const next = ((cur + dir) % hotbar.length + hotbar.length) % hotbar.length;
              setCopyFrom(null);
              setPlacingKind(hotbar[next]);
            }}
          />
        )}

        {/* H16/H19：左侧素材栏不再是常驻面板——只作为「全部素材库」按需覆盖打开 */}
        <CreativePalette open={creativeOpen && libOpen && !focus} placingKind={placingKind}
          selected={decorStore.decor.find((d) => d.id === selectedDecorId) ?? null}
          onUpdate={(patch) => { if (selectedDecorId) { decorStore.update(selectedDecorId, patch); } }}
          onRemove={() => { if (selectedDecorId) { decorStore.remove(selectedDecorId); setSelectedDecorId(null); } }}
          onDuplicate={duplicateDecor}
          activeSlot={activeSlot}
          onClearSlot={() => { setHotbar((prev) => prev.map((v, i) => (i === activeSlot ? null : v))); setLayoutMsg(`已清空第 ${activeSlot + 1} 槽`); }}
          replaceLabel={slotEdit != null ? `替换第 ${slotEdit + 1} 槽 · 原「${hotbar[slotEdit] ? (DECOR_CATALOG.find((c) => c.kind === hotbar[slotEdit])?.label ?? hotbar[slotEdit]) : "空槽"}」 → 待选` : null}
          onSelect={(k) => {
            const target = slotEdit ?? activeSlot;
            setHotbar((prev) => prev.map((v, i) => (i === target ? k : v)));
            setLayoutMsg(`第 ${target + 1} 槽已换成「${DECOR_CATALOG.find((c) => c.kind === k)?.label ?? k}」`);
            setSlotEdit(null); setPlacingKind(null); setCopyFrom(null); setLibOpen(false);
          }}
          onCancel={() => { setPlacingKind(null); setCopyFrom(null); }}
          onClose={() => { setLibOpen(false); setSlotMode(false); setSlotEdit(null); }}
        />
        {/* V4-R05：布局面板——服务器/模板/环境密度独立于素材库 */}
        <LayoutMenu open={creativeOpen && layoutOpen && !focus} onClose={() => setLayoutOpen(false)}
          nudgeScale={nudgeScale} onNudgeScale={setNudgeScale}
          groupDensities={{
            grass: decorStore.decor.find((d) => d.kind === "grassGroup")?.scale ?? 1,
            blooms: decorStore.decor.find((d) => d.kind === "wildflowerGroup")?.scale ?? 1,
          }}
          onGroupDensity={(kind, v) => {
            const it = decorStore.decor.find((d) => d.kind === kind);
            if (it) decorStore.update(it.id, { scale: v });
          }}
          revision={layoutRev} status={layoutStatus} message={layoutMsg}
          onSave={saveCreative} onPublish={publishCreative}
          onUndo={undo} onRedo={redo} canUndo={decorStore.canUndo} canRedo={decorStore.canRedo}
          onApplyTemplate={applyTemplate} onDiscard={discard}
          importPrompt={importPrompt} onImportLocal={importLocalDraft} onKeepServer={keepServerLayout}
          hasPublished={layoutHasPublished} onRevert={revertCreative}
          showFirstEntry={layoutRev === 0 && decorStore.decor.length === 0 && !firstDismissed}
          onFirstDefault={() => setFirstDismissed(true)}
          onFirstTemplate={() => { setFirstDismissed(true); applyTemplate(); }}
        />

        {!focus && panel.panel === "dossier" && (
          <aside className="side-card paper" aria-label="植物档案">
            <div className="panel-head">
              <h2>植物档案</h2>
              <button className="btn btn-quiet btn-icon" aria-label="关闭档案" onClick={() => open({ panel: null })}>✕</button>
            </div>
            <DossierPanel />
          </aside>
        )}

        {starFall && (
          <div className="star-fall" aria-hidden="true">
            <span className="star-core" />
            <span className="star-halo" />
            <i className="star-sp s1" /><i className="star-sp s2" /><i className="star-sp s3" />
          </div>
        )}
        {focus && panel.panel && (
          <main className={`focus paper${focusLarge ? " is-large" : ""}`} aria-label={TITLES[panel.panel]} role="dialog" aria-modal="true" ref={focusWinRef} tabIndex={-1}>
            <div className="focus-head">
              <button className="btn btn-soft btn-sm back" onClick={() => open({ panel: null })} aria-label="回到花园">← 花园</button>
              {sec.subs ? (
                <div className="subtabs" role="tablist" aria-label={`${sec.label}分区`}>
                  {sec.subs.map(([k, label]) => (
                    <button key={k} role="tab" aria-selected={panel.panel === k} onClick={() => panel.panel !== k && openPanelKey(k)}>{label}</button>
                  ))}
                </div>
              ) : <h1 className="focus-title">{TITLES[panel.panel]}</h1>}
              {panel.panel === "history" && <span className="lamp-line">你上次的问题，都在这条小径上。</span>}
              {/* H40：明确的放大/专注模式——默认保持小窗，长内容由用户主动展开 */}
              <button className="focus-zoom" type="button" onClick={() => setFocusLarge((v) => !v)} aria-pressed={focusLarge}
                title={focusLarge ? "收起到小窗" : "放大到专注模式（读长代码/练习时用）"}>{focusLarge ? "收起" : "放大"}</button>
              <button className="focus-close" type="button" onClick={() => open({ panel: null })} aria-label="关闭学习窗" title="关闭（Esc）">✕</button>
            </div>
            <div className="focus-body">
              {panel.panel === "chat" && <ChatPanel />}
              {panel.panel === "history" && <HistoryPanel />}
              {panel.panel === "materials" && <MaterialsPanel />}
              {panel.panel === "practice" && <PracticePanel />}
              {panel.panel === "timeline" && <TimelinePanel />}
              {panel.panel === "cards" && <CardsPanel />}
              {panel.panel === "galaxy" && <GalaxyPanel />}
              {panel.panel === "memory" && <MemoryPanel />}
            </div>
          </main>
        )}

        {panel.panel === "settings" && (
          <div className="modal-scrim" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) open({ panel: null }); }}>
            <div className="modal paper" role="dialog" aria-modal="true" aria-label="设置" ref={settingsRef} tabIndex={-1}>
              <div className="panel-head"><h2>设置</h2><button className="btn btn-quiet btn-icon" aria-label="关闭设置" onClick={() => open({ panel: null })}>✕</button></div>
              <SettingsPanel />
            </div>
          </div>
        )}

        {growthCard && (
          <div className={`growth-card paper ${focus ? "in-focus" : ""}`} role="status">
            <div className="row" style={{ alignItems: "flex-start", gap: 10, flexWrap: "nowrap" }}>
              <GuideOrb size={34} />
              <div className="grow">
                <div className="t">「{growthCard.name}」{STAGE_NAME[growthCard.from]} → {STAGE_NAME[growthCard.to]}</div>
                {growthCard.line && <div className="lamp-line">{growthCard.line}</div>}
                <div className="small muted">{growthCard.reason}</div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => { open({ panel: "dossier", plantId: growthCard.plantId }); setGrowthCard(null); }}>查看这次成长</button>
                  <button className="btn btn-quiet btn-sm" onClick={() => setGrowthCard(null)}>好的</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {narrow && (
          <nav className="bottom-tabs" aria-label="主导航（移动端）">
            {SECTIONS.map((s) => (
              <button key={s.key} aria-current={section === s.key ? "page" : undefined} onClick={() => openSection(s.key)}>
                <SectionIcon k={s.key} />{s.label}
              </button>
            ))}
          </nav>
        )}

        <div aria-live="polite" className="toasts">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind === "error" ? "is-error" : ""}`}>
              <GuideOrb size={24} />
              <span>{t.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </Ctx.Provider>
  );
}

/** 演示 / 真实模式提示：默认是一个小标签，点开显示说明 */
function ModeNotice({ space }: { space: Space }) {
  const [open, setOpen] = useState(false);
  const label = space.llm.mode === "demo" ? "演示模式" : space.llm.configured ? "真实模式" : "真实模式未配置";
  const cls = space.llm.mode === "demo" ? "demo" : space.llm.configured ? "live" : "bad";
  return (
    <div className="mode-notice">
      <button className={`mode-pill ${cls}`} aria-expanded={open} onClick={() => setOpen(!open)}><span className="dot" />{label}{space.user.isDemo ? " · 演示账号" : ""}</button>
      {open && (
        <div className="mode-pop paper" role="note">
          <p>{space.llm.note}</p>
          {space.llm.mode === "live" && space.llm.model && <p className="small muted">模型：{space.llm.model}{space.llm.provider ? ` · ${space.llm.provider}` : ""}</p>}
          {space.user.isDemo && <p className="small muted">演示账号：预置的历史记录都标注了“预置”。</p>}
        </div>
      )}
    </div>
  );
}

/** 花园模式的界面层：今日建议、场景入口、工具栏、收起的时间轴 */
function GardenHUD({ narrow, dragged, onRecenter, onLocateBed, selectedPlant, replayLabel, hidden, creativeOpen, onToggleCreative }: { narrow: boolean; dragged: boolean; onRecenter: () => void; onLocateBed: (x: number, z: number) => void; selectedPlant: string | null; replayLabel: string | null; hidden: boolean; creativeOpen: boolean; onToggleCreative: () => void }) {
  const { space, open } = React.useContext(Ctx)!;
  const [bedsOpen, setBedsOpen] = useState(false);
  const [bedQuery, setBedQuery] = useState("");
  const [sugOpen, setSugOpen] = useState(true);
  const ev = useTimeline();
  const lastChange = (ev ?? []).find((e) => e.eventType === "stage_changed");
  const sug = useMemo(() => suggestion(space), [space]);
  // 每个花圃在 3D 里的环位有限：摆不下的株数必须让用户看见，不能静默消失
  const beds = useMemo(() => layoutBeds(
    space.gardens.map((g) => ({ name: g.name })),
    space.plants.map((p) => ({
      id: p.id, conceptName: p.conceptName, species: p.species, color: p.color, stage: p.stage,
      isNatal: p.isNatal, gardenIndex: space.gardens.findIndex((g) => g.id === p.gardenId),
    } satisfies WorldPlant)),
  ), [space]);
  const kw = bedQuery.trim().toLowerCase();
  const hit = (p: { conceptName: string; nickname?: string | null }) =>
    !kw || p.conceptName.toLowerCase().includes(kw) || (p.nickname ?? "").toLowerCase().includes(kw);
  const lastConv = space.user.lastConversationId;
  useEffect(() => { if (!bedsOpen) return; const f = (e: KeyboardEvent) => { if (e.key === "Escape") setBedsOpen(false); }; window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f); }, [bedsOpen]);

  return (
    <div className={`hud ${hidden ? "is-hidden" : ""} ${selectedPlant ? "has-side" : ""}`}>
      {(!narrow || !selectedPlant) && sugOpen && (
        <div className="today paper-soft">
          <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start", gap: 10 }}>
            <GuideOrb size={30} />
            <div className="grow">
              <div className="lamp-line">今天想先照料哪一朵？</div>
              <div className="sug">{sug.text}</div>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={() => open(sug.go)}>{sug.action}</button>
                {narrow && <button className="btn btn-quiet btn-sm" onClick={() => setSugOpen(false)}>收起</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {replayLabel && <div className="replay-pill">回放真实记录 · {replayLabel}</div>}

      <div className="hud-bottom">
        <div className="toolbar" role="toolbar" aria-label="花园场景入口">
          <button className="tool" onClick={() => open({ panel: "chat", conversationId: lastConv })}><SceneIcon k="cottage" /><span>书屋<em>学习</em></span></button>
          <button className="tool" onClick={() => open({ panel: "materials" })}><SceneIcon k="greenhouse" /><span>温室<em>资料</em></span></button>
          <button className="tool" onClick={() => open({ panel: "history" })}><SceneIcon k="path" /><span>小径<em>回顾</em></span></button>
          <div className="tool-wrap">
            <button className="tool" aria-expanded={bedsOpen} aria-haspopup="true" onClick={() => setBedsOpen(!bedsOpen)}><SceneIcon k="bed" /><span>花圃<em>{space.plants.length} 株</em></span></button>
          </div>
          <button className={`tool ${creativeOpen ? "tool-active" : ""}`} aria-pressed={creativeOpen} onClick={onToggleCreative}><SceneIcon k="greenhouse" /><span>创造<em>布置</em></span></button>
          {dragged && <button className="tool tool-plain" onClick={onRecenter}>回到花园视角</button>}
        </div>
        {bedsOpen && (
          <div className="beds-pop paper" aria-label="花圃与植物">
            <div className="beds-search">
              <input value={bedQuery} onChange={(e) => setBedQuery(e.target.value)} placeholder="找一株花：知识点或昵称" aria-label="搜索花圃里的植物" type="search" />
            </div>
            {space.plants.length === 0 && (
              <div className="bed-empty">
                这个星球还没有花。去<button className="link" onClick={() => { setBedsOpen(false); open({ panel: "materials" }); }}>资料温室</button>挑一份资料，就能种下第一株。
              </div>
            )}
            {space.gardens.map((g, gi) => {
              const all = space.plants.filter((p) => p.gardenId === g.id);
              const list = all.filter(hit);
              const bed = beds[gi];
              return (
                <div key={g.id} className="bed-group">
                  <div className="label">
                    <span>{g.name}</span>
                    <em>{all.length} 株</em>
                    {bed && (
                      <button className="link locate" type="button" onClick={() => { onLocateBed(bed.x, bed.z); setBedsOpen(false); }} aria-label={`定位到${g.name}`}>定位</button>
                    )}
                    {bed && bed.overflow > 0 && (
                      <span className="overflow">星球上摆下 {bed.plants.length} 株，另有 {bed.overflow} 株待扩容</span>
                    )}
                  </div>
                  {all.length === 0 && <div className="bed-empty">还没有花</div>}
                  {all.length > 0 && list.length === 0 && <div className="bed-empty">没有匹配「{bedQuery.trim()}」的花</div>}
                  {list.map((p) => (
                    <button key={p.id} className="plant-row" aria-current={selectedPlant === p.id} onClick={() => { open({ panel: "dossier", plantId: p.id }); setBedsOpen(false); }}>
                      <span className="mini"><FlowerSvg uid={`hud-${p.id.slice(0, 8)}`} species={p.species} color={p.color} stage={p.stage} size={26} crop /></span>
                      <span className="name">{p.nickname ? `「${p.nickname}」` : ""}{p.conceptName}{p.isNatal ? " · 本命花" : ""}</span>
                      {p.reviewDue && <span className="review-pill">待复习</span>}
                      <span className="stage-label">{STAGE_NAME[p.stage]}</span>
                    </button>
                  ))}
                </div>
              );
            })}
            {space.goals.length > 0 && (
              <div className="bed-group">
                <div className="label"><span>探索路线</span></div>
                {space.goals.map((g) => <div key={g.id} className="small" style={{ padding: "2px 8px" }}>{g.title}：{g.route.map((r) => r.name).join(" → ")}</div>)}
              </div>
            )}
          </div>
        )}
        {!narrow && (
          <button className="last-change" onClick={() => open({ panel: "timeline" })} aria-label="打开成长时间轴">
            <span className="k">最近</span>
            {lastChange ? <span>「{lastChange.conceptName}」{STAGE_NAME[lastChange.fromStage ?? "seed"]} → {lastChange.toStage ? STAGE_NAME[lastChange.toStage] : ""} · {lastChange.localDate.slice(5)}</span> : <span>还没有成长记录</span>}
            <span className="more">时间轴 ›</span>
          </button>
        )}
      </div>
    </div>
  );
}

function suggestion(space: Space): { text: string; action: string; go: PanelState } {
  const due = space.plants.find((p) => p.reviewDue);
  if (due) return { text: `「${due.conceptName}」到了复习的时候，做一道题看看还记得多少。`, action: "去练习", go: { panel: "practice", conceptId: due.conceptId } };
  for (const g of space.goals) for (const r of [...g.route].sort((a, b) => a.order - b.order)) {
    const p = space.plants.find((x) => x.conceptId === r.conceptId);
    if (!p || p.stage === "bloom") continue;
    if (p.stage === "bud") return { text: `「${r.name}」还差一次独立变式验证就会开花。`, action: "做一道变式题", go: { panel: "practice", conceptId: r.conceptId } };
    if (p.stage === "leaf") return { text: `「${r.name}」可以试着独立作答一次了。`, action: "去练习", go: { panel: "practice", conceptId: r.conceptId } };
    return { text: `从「${r.name}」开始：先问星灯一个问题。`, action: "去书屋提问", go: { panel: "chat", conceptId: r.conceptId } };
  }
  return { text: "花圃都照料得不错。可以整理一张学习卡，或者去资料温室添一份新资料。", action: "整理学习卡", go: { panel: "cards" } };
}

function GearIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v2.4M12 18.8v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7" /></svg>;
}
function SceneIcon({ k }: { k: "cottage" | "greenhouse" | "path" | "bed" }) {
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", "aria-hidden": true, fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (k === "cottage") return <svg {...p}><path d="M4 11.5 12 5l8 6.5" /><path d="M6 10.5V19h12v-8.5" /><circle cx="12" cy="13.5" r="2.2" /></svg>;
  if (k === "greenhouse") return <svg {...p}><path d="M4 19V11l8-5 8 5v8z" /><path d="M12 6v13M4 13h16" /></svg>;
  if (k === "path") return <svg {...p}><ellipse cx="7" cy="18" rx="3" ry="1.6" /><ellipse cx="13" cy="13" rx="2.6" ry="1.4" /><ellipse cx="17.5" cy="8" rx="2.2" ry="1.2" /></svg>;
  return <svg {...p}><path d="M12 20v-7" /><path d="M12 13c-3 0-4.5-2-4.5-4.5C10 8.5 12 10 12 13z" /><path d="M12 11c0-3 2-5 5-5 0 3-2 5-5 5z" /><path d="M5 20h14" /></svg>;
}
function SectionIcon({ k }: { k: SectionKey }) {
  const p = { width: 20, height: 20, viewBox: "0 0 24 24", "aria-hidden": true, fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (k === "garden") return <svg {...p}><circle cx="12" cy="14" r="6" /><path d="M12 8V4M10 5.5l2-1.5 2 1.5" /></svg>;
  if (k === "learn") return <svg {...p}><path d="M4 6.5C7 5 9.5 5 12 6.5 14.5 5 17 5 20 6.5V18c-3-1.5-5.5-1.5-8 0-2.5-1.5-5-1.5-8 0z" /><path d="M12 6.5V18" /></svg>;
  if (k === "review") return <svg {...p}><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5M11 8v3l2 1.5" /></svg>;
  if (k === "materials") return <svg {...p}><path d="M4 19V11l8-5 8 5v8z" /><path d="M12 6v13" /></svg>;
  return <svg {...p}><circle cx="8" cy="12" r="3.5" /><circle cx="17" cy="9" r="2.2" /><circle cx="16" cy="17" r="1.6" /></svg>;
}
