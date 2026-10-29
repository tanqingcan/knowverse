"use client";
import { useSkyTheme } from "@/lib/sky";

/** 全屏天空：4 个主题，切换由 lib/sky 的 localStorage + 自定义事件驱动 */
export function Sky() {
  const theme = useSkyTheme();
  return <div className={`sky theme-${theme}`} aria-hidden="true" />;
}
