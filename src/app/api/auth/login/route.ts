import { z } from "zod";
import { open, parseBody } from "@/server/http";
import { loginUser, createSession } from "@/server/auth";
export const POST = open(async (req) => {
  const b = await parseBody(req, z.object({ handle: z.string(), password: z.string() }));
  const id = await loginUser(b.handle, b.password);
  await createSession(id);
  return { userId: id };
});
