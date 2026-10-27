import { q, q1 } from "@/db";
import { registerUser, getUserById, type CurrentUser } from "@/server/auth";
import { onboard } from "@/server/world";

let n = 0;
export async function concept(name: string): Promise<string> {
  const r = await q1<{ id: string }>(`SELECT id FROM concepts WHERE name = $1 AND owner_user_id IS NULL`, [name]);
  if (!r) throw new Error(`concept ${name} not found`);
  return r.id;
}
export async function subject(code: string): Promise<string> {
  return (await q1<{ id: string }>(`SELECT id FROM subjects WHERE code = $1 AND owner_user_id IS NULL`, [code]))!.id;
}

/** 新建一个已完成开场的测试用户（数据库学科，种下左外连接等） */
export async function makeUser(label = "t", conceptNames = ["左外连接", "内连接"]): Promise<CurrentUser> {
  n += 1;
  const handle = `${label}${Date.now().toString(36)}${n}`.toLowerCase().slice(0, 30);
  const id = await registerUser(handle, `测试${n}`, "secret123");
  const u = (await getUserById(id))!;
  const ids = await Promise.all(conceptNames.map(concept));
  await onboard(u, {
    planetName: "测试星", goalTitle: "测试目标", subjectId: await subject("dbms"),
    conceptIds: ids, newConceptNames: [], natal: { conceptRef: ids[0], species: "rose", color: "rose", nickname: "测" },
  });
  return (await getUserById(id))!;
}

export async function taskVersion(title: string): Promise<string> {
  return (await q1<{ id: string }>(`SELECT tv.id FROM task_versions tv JOIN tasks t ON t.id = tv.task_id WHERE t.title = $1`, [title]))!.id;
}

export async function stageOf(userId: string, conceptId: string) {
  return (await q1<{ stage: string }>(`SELECT stage FROM learning_states WHERE user_id = $1 AND concept_id = $2`, [userId, conceptId]))?.stage ?? null;
}

export { q, q1 };
