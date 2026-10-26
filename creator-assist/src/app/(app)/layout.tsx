import { BottomNav } from "@/components/nav";
import { Notices } from "@/components/notices";
import { SampleToggle } from "@/components/sample-toggle";
import { requireProfile } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { db } = await requireProfile();
  const [{ count }, { data: notices }] = await Promise.all([
    db.from("deals").select("id", { count: "exact", head: true }).eq("is_sample", true),
    db.from("notifications").select("id, title, link").is("read_at", null).order("created_at", { ascending: false }).limit(3),
  ]);
  return (
    <>
      <Notices items={notices ?? []} />
      {children}
      <SampleToggle on={(count ?? 0) > 0} />
      <BottomNav />
    </>
  );
}
