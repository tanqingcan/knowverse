"use client";
/** 开场页预览：已登录时首页会直接跳到星球，这里不经过登录判断，便于检查开场画面。 */
import { Landing } from "@/components/intro/Landing";

export default function Page() {
  return <Landing />;
}
