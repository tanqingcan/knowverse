import { z } from "zod";
import { authed } from "@/server/http";
import { loadMaterialFile } from "@/server/materials";

export const GET = authed<{ id: string }>(async (req, user, params) => {
  const version = z.coerce.number().int().positive().parse(req.nextUrl.searchParams.get("v"));
  const file = await loadMaterialFile(user.id, z.string().uuid().parse(params.id), version);
  const filename = encodeURIComponent(file.name.toWellFormed()).replace(/['()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  return new Response(new Uint8Array(file.content), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(file.content.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
