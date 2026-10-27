import { authed } from "@/server/http";
import { reviewSummary, readyTasks } from "@/server/practice";
export const GET = authed(async (_req, user) => ({ review: await reviewSummary(user.id), ready: await readyTasks(user.id) }));
