import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "知屿 KNOWVERSE · 在自己的星球上，养出属于你的花",
  description: "基于学习记录与关系数据库的个人学习助手",
};
export const viewport: Viewport = { themeColor: "#101629", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}<div className="paper-grain" aria-hidden="true" /></body>
    </html>
  );
}
