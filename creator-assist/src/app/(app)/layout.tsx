import { BottomNav } from "@/components/nav";
import { requireProfile } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireProfile();
  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}
