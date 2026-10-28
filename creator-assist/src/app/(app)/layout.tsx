import { BottomNav } from "@/components/nav";
import { Notices } from "@/components/notices";
import { requireProfile } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { db } = await requireProfile();
  const { data: notices } = await db.from("notifications").select("id, title, link").is("read_at", null).order("created_at", { ascending: false }).limit(3);
  return (
    <>
      <Notices items={notices ?? []} />
      {children}
      <BottomNav />
    </>
  );
}
