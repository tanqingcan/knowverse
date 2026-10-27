import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { setSharing } from "@/server/classes";
export const POST = authed<{ id: string }>(async (req, user, p) => setSharing(user, z.string().uuid().parse(p.id), await parseBody(req, z.object({ sharePlanet: z.boolean().optional(), shareStages: z.boolean().optional(), openToPartner: z.boolean().optional() }))));
