import { authed } from "@/server/http";
import { listConcepts } from "@/server/world";
export const GET = authed(async (req, user) => listConcepts(user.id, req.nextUrl.searchParams.get("subjectId") ?? undefined));
