"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

export type ConceptOpt = { id: string; name: string; subjectId: string; subjectName: string; isPublic: boolean; aliases: string[] };
let conceptCache: ConceptOpt[] | null = null;

export function useConcepts() {
  const [list, setList] = useState<ConceptOpt[]>(conceptCache ?? []);
  const refresh = useCallback(async () => { conceptCache = await api<ConceptOpt[]>("/api/concepts"); setList(conceptCache); }, []);
  useEffect(() => { if (!conceptCache) refresh().catch(() => {}); }, [refresh]);
  return { concepts: list, refresh };
}

/** 通用的加载状态 */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const run = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setData(await fn()); } catch (e: any) { setErr(e?.message ?? "加载失败"); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { data, setData, err, loading, reload: run };
}
