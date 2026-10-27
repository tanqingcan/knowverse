import { authed } from "@/server/http";
import { timeline } from "@/server/world";
export const GET = authed(async (req, user) => timeline(user, { before: req.nextUrl.searchParams.get("before") ?? undefined }));
