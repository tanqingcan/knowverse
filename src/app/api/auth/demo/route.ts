import { z } from "zod";
import { open, parseBody } from "@/server/http";
import { createSession } from "@/server/auth";
import { q1 } from "@/db";
import { AppError } from "@/server/errors";
/** 进入预置演示账号（界面会显示“演示账号”标记） */
export const POST = open(async (req) => {
  const b = await parseBody(req, z.object({ account: z.enum(["demo", "fresh"]).default("demo") }));
  if (b.account === "fresh") {
    // 新旅人：每次创建一个全新的演示用户，用于展示开场流程
    const { registerUser } = await import("@/server/auth");
    const handle = "guest-" + Math.random().toString(36).slice(2, 8);
    const id = await registerUser(handle, "新旅人", Math.random().toString(36));
    await (await import("@/db")).q("UPDATE users SET is_demo = true WHERE id = $1", [id]);
    await createSession(id);
    return { userId: id };
  }
  const u = await q1<{ id: string }>("SELECT id FROM users WHERE handle = 'demo' AND is_demo");
  if (!u) throw new AppError("no_demo", "演示账号不存在，请先运行 npm run db:seed", 404);
  await createSession(u.id);
  return { userId: u.id };
});
