import { BottomNav } from "@/components/nav";
import { SampleToggle } from "@/components/sample-toggle";
import { requireProfile } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { db } = await requireProfile();
  const { count } = await db.from("deals").select("id", { count: "exact", head: true }).eq("is_sample", true);
  return (
    <>
      {children}
      <SampleToggle on={(count ?? 0) > 0} />
      <BottomNav />
    </>
  );
}
