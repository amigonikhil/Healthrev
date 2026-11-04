import { BottomNav } from "@/components/nav";
import { Notices } from "@/components/notices";
import { webCtx } from "@/server/context";
import { listNotifications } from "@/server/misc";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const notices = await listNotifications(await webCtx());
  return (
    <>
      <Notices items={notices} />
      {children}
      <BottomNav />
    </>
  );
}
