import { z } from "zod";
import { authed } from "@/server/http";
import { publicPlanet } from "@/server/planets";

/** 公开只读星球：只返回对方 share_planet / share_stages 打开的内容，未公开返回 403 */
export const GET = authed<{ userId: string }>(async (_req, _user, p) => publicPlanet(z.string().uuid().parse(p.userId)));
