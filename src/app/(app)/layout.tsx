import { requireProfile } from "@/lib/auth";
import { NavSidebar } from "@/components/nav-sidebar";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col justify-between border-r border-border bg-card p-4">
        <div>
          <div className="mb-6 px-2">
            <div className="text-sm font-semibold">RK Recovery Ops</div>
            <div className="text-xs text-muted">HDFC · 4-wheeler recovery</div>
          </div>
          <NavSidebar role={profile.app_role} />
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-border p-3">
            <div className="truncate text-sm font-medium">
              {profile.full_name ?? profile.email}
            </div>
            <div className="mt-0.5 text-xs capitalize text-muted">
              {profile.app_role}
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>

      <main className="flex-1 overflow-x-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
