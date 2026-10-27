import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { Landing } from "@/components/intro/Landing";

export const dynamic = "force-dynamic";

export default async function Page() {
  const u = await getCurrentUser().catch(() => null);
  if (u?.onboardedAt) redirect("/space");      // 老用户直接回到上次的上下文
  if (u && !u.onboardedAt) redirect("/welcome");
  return <Landing />;
}
