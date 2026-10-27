import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { listSubjects } from "@/server/world";
import { Onboarding } from "@/components/intro/Onboarding";

export const dynamic = "force-dynamic";

export default async function Welcome() {
  const u = await getCurrentUser();
  if (!u) redirect("/");
  const subjects = await listSubjects(u.id);
  return <Onboarding user={{ displayName: u.displayName, isDemo: u.isDemo, reducedMotion: u.reducedMotion }} subjects={subjects as any} />;
}
