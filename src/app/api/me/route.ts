import { open } from "@/server/http";
import { getCurrentUser } from "@/server/auth";
import { publicLlmStatus } from "@/server/agent/llm";
export const GET = open(async () => ({ user: await getCurrentUser(), llm: publicLlmStatus() }));
