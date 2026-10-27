"use client";
import { createContext, useContext } from "react";
import type { StageKey } from "@/lib/flora";

export type Plant = {
  id: string; gardenId: string; conceptId: string; conceptName: string; species: string; color: string; nickname: string | null;
  lon: number; lat: number; stage: StageKey; stageReason: string | null; reviewDueAt: string | null; reviewDue: boolean; isNatal: boolean; evidenceCount: number;
};
export type Space = {
  user: { id: string; handle: string; displayName: string; isDemo: boolean; timezone: string; reducedMotion: boolean; renderMode: "auto" | "3d" | "2d"; lastConversationId: string | null; lastPlantId: string | null };
  planet: { id: string; name: string; natalPlantId: string | null } | null;
  gardens: { id: string; name: string; subjectId: string; subjectName: string; sortOrder: number }[];
  plants: Plant[];
  goals: { id: string; title: string; status: string; subjectId: string; subjectName: string; route: { conceptId: string; name: string; order: number }[] }[];
  subjects: { id: string; name: string; code: string; isPublic: boolean }[];
  llm: { mode: "live" | "demo"; model: string | null; provider: string | null; configured: boolean; note: string };
};

export type PanelKey = "chat" | "history" | "dossier" | "materials" | "practice" | "timeline" | "cards" | "galaxy" | "settings";
export type PanelState = {
  panel: PanelKey | null;
  conversationId?: string | null; messageId?: string | null; plantId?: string | null; conceptId?: string | null;
  materialId?: string | null; versionNo?: number | null; chunkId?: string | null;
  attemptId?: string | null; taskVersionId?: string | null; mode?: string | null; draft?: string | null;
};

export type GrowthEvent = { id: string; conceptId: string; eventType: string; fromStage: StageKey | null; toStage: StageKey | null; reason: string; createdAt: string };

export type SpaceCtx = {
  space: Space;
  reload: () => Promise<Space | null>;
  open: (p: PanelState) => void;
  panel: PanelState;
  setPanelPatch: (p: Partial<PanelState>) => void;
  onGrowth: (events: GrowthEvent[] | undefined) => void;
  toast: (msg: string, kind?: "info" | "error") => void;
  reduced: boolean;
  wide: boolean; setWide: (b: boolean) => void;
  replay: (events: { conceptId: string; fromStage: StageKey | null; toStage: StageKey | null; createdAt: string; conceptName: string }[]) => void;
  replaying: boolean;
  /** 星灯正在思考（对话请求进行中），用于角色状态 */
  setBusy: (b: boolean) => void;
};

export const Ctx = createContext<SpaceCtx | null>(null);
export function useSpace() {
  const c = useContext(Ctx);
  if (!c) throw new Error("SpaceCtx missing");
  return c;
}
