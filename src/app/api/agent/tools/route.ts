import { authed } from "@/server/http";
import { toolCatalog } from "@/server/agent/tools";
export const GET = authed(async () => toolCatalog());
