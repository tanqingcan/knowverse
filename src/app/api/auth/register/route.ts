import { z } from "zod";
import { open, parseBody } from "@/server/http";
import { registerUser, createSession } from "@/server/auth";
export const POST = open(async (req) => {
  const b = await parseBody(req, z.object({ handle: z.string(), displayName: z.string().max(24).optional(), password: z.string().max(100) }));
  const id = await registerUser(b.handle, b.displayName ?? "", b.password);
  await createSession(id);
  return { userId: id };
});
