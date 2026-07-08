import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppRole = "admin" | "operator";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  app_role: AppRole;
  active: boolean;
};

/**
 * Returns the current authenticated user's profile, or redirects to /login.
 * Use this at the top of every protected Server Component / action.
 */
export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, app_role, active")
    .eq("id", user.id)
    .single();

  // A user without a profile row (or deactivated) has no access.
  if (!profile || !profile.active) redirect("/login");

  return profile as Profile;
}

/** Like requireProfile, but 404s for non-admins. Use on admin-only pages. */
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.app_role !== "admin") redirect("/dashboard");
  return profile;
}
