import { createAdminClient } from "@/lib/supabase/admin";

// 1×1 read-receipt pixel embedded in reminder emails.
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    try {
      await createAdminClient().from("reminders").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null).not("sent_at", "is", null);
    } catch { /* never fail the image */ }
  }
  return new Response(new Uint8Array(GIF), { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" } });
}
