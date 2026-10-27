import { z } from "zod";
import { authed } from "@/server/http";
import { listMaterials, uploadMaterial } from "@/server/materials";
import { AppError } from "@/server/errors";
export const GET = authed(async (_req, user) => listMaterials(user.id));
export const POST = authed(async (req, user) => {
  const form = await req.formData().catch(() => { throw new AppError("bad_form", "需要 multipart/form-data"); });
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("no_file", "请选择文件");
  const meta = z.object({ title: z.string().max(80).default(""), subjectId: z.string().uuid(), course: z.string().max(60).default(""), kind: z.enum(["slides", "notes", "exercises", "textbook", "other"]).default("notes"), materialId: z.string().uuid().optional() })
    .parse({ title: form.get("title") ?? undefined, subjectId: form.get("subjectId"), course: form.get("course") ?? undefined, kind: form.get("kind") ?? undefined, materialId: form.get("materialId") || undefined });
  const buf = Buffer.from(await file.arrayBuffer());
  return uploadMaterial({ userId: user.id, subjectId: meta.subjectId, title: meta.title || file.name, course: meta.course || "个人资料", kind: meta.kind, fileName: file.name, mimeType: file.type || null, buf, materialId: meta.materialId });
});
