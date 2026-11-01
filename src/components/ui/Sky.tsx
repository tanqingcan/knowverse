"use client";
import { useSkyTheme } from "@/lib/sky";

/**
 * 全屏天空：4 个主题，切换由 lib/sky 的 localStorage + 自定义事件驱动。
 * 星点分三层（远 / 中 / 近），每层用不同的平铺尺寸与密度打散重复感；
 * 最亮的一层只做极轻的呼吸，低动效（prefers-reduced-motion / .reduced-motion）时完全静态。
 */
export function Sky({ tint }: {tint?:string} = {}) {
  const theme = useSkyTheme();
  return (
    <div className={`sky theme-${theme}`} aria-hidden="true">
      <span className="sky-layer sky-far" />
      <span className="sky-layer sky-mid" />
      <span className="sky-layer sky-near" />
      <span className="sky-layer sky-nebula" />
      {tint && tint.toLowerCase() !== "#2a2338" && <span className="sky-layer" style={{background:tint,opacity:.28,mixBlendMode:"color"}}/>}
    </div>
  );
}
