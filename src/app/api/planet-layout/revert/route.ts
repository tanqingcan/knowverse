import { authed } from "@/server/http";
import { revertToPublished } from "@/server/layouts";

/** 恢复上一已发布版本：用 published_items 快照替换当前草稿（revision+1，不直接发布）。 */
export const POST = authed(async (_req, user) => revertToPublished(user));
