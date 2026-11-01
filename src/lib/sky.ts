"use client";
/** 天空主题：暮色（默认）/ 星夜 / 晨雾 / 极光。目前存 localStorage；跨设备持久化需 A 在 users 上加 sky_theme。 */
import { useEffect, useState } from "react";

export type SkyTheme = "dusk" | "night" | "mist" | "aurora";

export const SKY_THEMES: { key: SkyTheme; label: string; hint: string }[] = [
  { key: "dusk", label: "暮色", hint: "深空 → 浅桃，默认" },
  { key: "night", label: "星夜", hint: "靛蓝 + 星点" },
  { key: "mist", label: "晨雾", hint: "低饱和灰蓝" },
  { key: "aurora", label: "极光", hint: "青绿极光带" },
];

const KEY = "kv-sky-theme";
const EVENT = "kv-sky-theme";

export function getSkyTheme(): SkyTheme {
  if (typeof window === "undefined") return "dusk";
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "night" || v === "mist" || v === "aurora" || v === "dusk") return v;
  } catch { /* 隐私模式 */ }
  return "dusk";
}

export function setSkyTheme(t: SkyTheme) {
  try { window.localStorage.setItem(KEY, t); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent<SkyTheme>(EVENT, { detail: t }));
}

/** 订阅天空主题：本地存储 + 自定义事件（跨组件同步） */
export function useSkyTheme(): SkyTheme {
  const [theme, setTheme] = useState<SkyTheme>("dusk");
  useEffect(() => {
    setTheme(getSkyTheme());
    const on = (e: Event) => {
      const d = (e as CustomEvent<SkyTheme | undefined>).detail;
      setTheme(d ?? getSkyTheme());
    };
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return theme;
}
