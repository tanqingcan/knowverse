import { authed, parseBody } from "@/server/http";
import { searchHistory, HistoryQuery } from "@/server/history";
export const POST = authed(async (req, user) => searchHistory(user.id, user.timezone, await parseBody(req, HistoryQuery)));
