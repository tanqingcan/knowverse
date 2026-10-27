import { open } from "@/server/http";
import { destroySession } from "@/server/auth";
export const POST = open(async () => { await destroySession(); return { ok: true }; });
