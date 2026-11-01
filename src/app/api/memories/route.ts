import { authed } from "@/server/http";
import { listMemories } from "@/server/memories";
export const GET = authed(async (_req, user) => listMemories(user));
