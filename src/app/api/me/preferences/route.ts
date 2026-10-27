import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { setPreferences } from "@/server/world";
export const POST = authed(async (req, user) => setPreferences(user, await parseBody(req, z.object({ reducedMotion: z.boolean().optional(), renderMode: z.enum(["auto", "3d", "2d"]).optional(), timezone: z.string().max(64).optional() }))));
