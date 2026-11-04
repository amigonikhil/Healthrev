import { fail } from "@/server/context";
import { route } from "@/server/http";
import { uploadAis } from "@/server/tax";

/** Upload the AIS JSON (multipart: `file`, optional `fy`). */
export const POST = route(async (ctx, req) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) fail(400, "Choose your AIS JSON file");
  return { message: await uploadAis(ctx, { name: file.name, size: file.size, text: await file.text() }, String(form?.get("fy") ?? "")) };
});
