import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/** 开发用的资产预览页：生产环境默认关闭（设置 KV_DEV_PAGES=1 可打开） */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production" && process.env.KV_DEV_PAGES !== "1") notFound();
  return children;
}
