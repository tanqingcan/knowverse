import { authed } from "@/server/http";
import { getSpace } from "@/server/world";
export const GET = authed(async (_req, user) => getSpace(user));
