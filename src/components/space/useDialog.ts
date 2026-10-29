"use client";
import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * 最近一次获得焦点的元素。浮窗打开时触发元素往往在同一个 commit 里就被卸载
 * （打开专注浮窗会隐藏花园 HUD），等 effect 跑起来时 activeElement 已经掉回 body，
 * 所以要在 focusin 时先记下来。
 */
let lastFocusEl: HTMLElement | null = null;
if (typeof document !== "undefined") {
  document.addEventListener("focusin", (e) => { if (e.target instanceof HTMLElement) lastFocusEl = e.target; }, true);
}

/**
 * 浮窗的可访问性语义：Esc 关闭、打开时把焦点移进窗内、关闭后还给原来的触发元素
 * （触发元素已被卸载时退回到 `fallbackSelector`）、Tab / Shift+Tab 在窗内循环、
 * 打开期间锁页面滚动。
 *
 * 只补语义，不动任何面板的内容与布局；`active` 为 false 时完全不注册监听。
 */
export function useDialog(active: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void, fallbackSelector?: string) {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    const prev = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : lastFocusEl;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus?.({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab" || !el) return;
      const list = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (!list.length) { e.preventDefault(); el.focus({ preventScroll: true }); return; }
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      const cur = document.activeElement as HTMLElement | null;
      if (!e.shiftKey && cur === lastEl) { e.preventDefault(); firstEl.focus(); }
      else if (e.shiftKey && (cur === firstEl || !cur || !el.contains(cur))) { e.preventDefault(); lastEl.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      // 触发元素可能已经随界面切换被卸载，这时退回到一个稳定的落点，而不是把焦点丢回 body
      if (prev && prev.isConnected) prev.focus({ preventScroll: true });
      else if (fallbackSelector) document.querySelector<HTMLElement>(fallbackSelector)?.focus({ preventScroll: true });
    };
  }, [active, ref, onClose, fallbackSelector]);
}
