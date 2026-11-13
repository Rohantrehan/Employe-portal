import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (!session?.profile) redirect("/login");
  redirect(homeFor(session.profile.role));
}
