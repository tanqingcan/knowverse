import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { SpaceApp } from "@/components/space/SpaceApp";

export const dynamic = "force-dynamic";

export default async function Space() {
  const u = await getCurrentUser();
  if (!u) redirect("/");
  if (!u.onboardedAt) redirect("/welcome");
  return <SpaceApp />;
}
