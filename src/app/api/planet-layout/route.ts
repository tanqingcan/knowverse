import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { getLayout, saveDraft } from "@/server/layouts";

const itemSchema = z.object({
  instanceId: z.string().max(64).nullish(),
  kind: z.string(),
  x: z.number(), z: z.number(),
  rot: z.number().optional(), scale: z.number().optional(),
  width: z.number().nullish(), length: z.number().nullish(),
  color: z.string().nullish(), stage: z.string().nullish(),
  // H34：zod 默认会剥离未声明字段——不写这一行，parts 在入口就被丢掉（部位/颜色校验也就形同虚设）
  parts: z.record(z.string(), z.string()).nullish(),
});

export const GET = authed(async (_req, user) => getLayout(user));

export const PUT = authed(async (req, user) => {
  const bedMovesSchema = z.record(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), z.object({ x: z.number(), z: z.number(), rot: z.number().optional() }));
  const body = await parseBody(req, z.object({
    baseRevision: z.number().int().min(0),
    items: z.array(itemSchema).max(300),
    // V4-R22：花圃位移随布局一起保存（与装饰 items 分开的字段）
    bedMoves: bedMovesSchema.nullish(),
  terrain: z.array(z.object({ i: z.number().int().min(0).max(48), j: z.number().int().min(0).max(48), h: z.number().min(-1).max(1) })).max(600).nullish(),
  }));
  return saveDraft(user, body.baseRevision, body.items, body.bedMoves, body.terrain);
});
