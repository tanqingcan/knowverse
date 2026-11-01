import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { q, q1 } from "@/db";
import { AppError } from "@/server/errors";
export const GET = authed(async (_req,user) => {
 const entries=await q(`SELECT p.concept_id AS "conceptId",p.place,k.name FROM garden_knowledge_places p JOIN concepts k ON k.id=p.concept_id WHERE p.user_id=$1 ORDER BY p.created_at`,[user.id]);
 const candidates=await q(`SELECT k.id,k.name FROM concepts k WHERE (k.owner_user_id IS NULL OR k.owner_user_id=$1) AND NOT EXISTS(SELECT 1 FROM plants p JOIN gardens g ON g.id=p.garden_id JOIN planets pl ON pl.id=g.planet_id WHERE pl.user_id=$1 AND p.concept_id=k.id) AND NOT EXISTS(SELECT 1 FROM garden_knowledge_places x WHERE x.user_id=$1 AND x.concept_id=k.id AND x.place='seed') ORDER BY k.name LIMIT 8`,[user.id]);
 return {entries,candidates};
});
export const POST = authed(async(req,user)=>{
 const b=await parseBody(req,z.object({conceptId:z.string().uuid(),place:z.enum(['seed','rose','aquatic']),remove:z.boolean().optional()}));
 const visible=await q1(`SELECT id FROM concepts WHERE id=$1 AND (owner_user_id IS NULL OR owner_user_id=$2)`,[b.conceptId,user.id]);
 if(!visible) throw new AppError('not_found','知识点不存在',404);
 if(b.remove) await q(`DELETE FROM garden_knowledge_places WHERE user_id=$1 AND concept_id=$2 AND place=$3`,[user.id,b.conceptId,b.place]);
 else await q(`INSERT INTO garden_knowledge_places(user_id,concept_id,place) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[user.id,b.conceptId,b.place]);
 return {saved:true};
});
