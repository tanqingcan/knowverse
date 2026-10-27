import { authed } from "@/server/http";
import { listConversations } from "@/server/history";
export const GET = authed(async (_req, user) => listConversations(user.id));
