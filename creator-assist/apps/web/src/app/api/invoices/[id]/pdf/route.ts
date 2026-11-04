// Old path for invoice PDFs; same handler as /api/v1/invoices/[id]/pdf.
export const runtime = "nodejs";
export { GET } from "@/app/api/v1/invoices/[id]/pdf/route";
