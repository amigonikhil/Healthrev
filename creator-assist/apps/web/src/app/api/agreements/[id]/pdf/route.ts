// Old path for agreement PDFs; same handler as /api/v1/agreements/[id]/pdf.
export const runtime = "nodejs";
export { GET } from "@/app/api/v1/agreements/[id]/pdf/route";
