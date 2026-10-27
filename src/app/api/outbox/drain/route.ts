import { authed } from "@/server/http";
import { drainOutbox } from "@/server/classes";
export const POST = authed(async () => drainOutbox());
