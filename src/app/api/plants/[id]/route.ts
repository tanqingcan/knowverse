import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { plantDossier, updateAppearance } from "@/server/world";
export const GET = authed<{ id: string }>(async (_req, user, p) => plantDossier(user, z.string().uuid().parse(p.id)));
export const PATCH = authed<{ id: string }>(async (req, user, p) => updateAppearance(user, z.string().uuid().parse(p.id), await parseBody(req, z.object({ species: z.string().optional(), color: z.string().optional(), nickname: z.string().max(16).nullable().optional(), natal: z.boolean().optional() }))));
