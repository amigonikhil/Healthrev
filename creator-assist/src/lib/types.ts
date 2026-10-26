// Row shapes as returned by PostgREST. Money columns are integer paise.

export type Lang = "en" | "te" | "hi";
export type DealStatus =
  | "draft" | "agreement_sent" | "agreed" | "in_progress" | "live"
  | "invoiced" | "overdue" | "escalated" | "partially_paid" | "paid";

export type Profile = {
  id: string; name: string; handle: string | null; phone: string | null; email: string | null;
  address: string | null; city: string | null; state: string; state_code: string;
  pan_enc: string | null; pan_masked: string | null; gstin: string | null; udyam_no: string | null;
  bank_name: string | null; bank_account_enc: string | null; bank_account_last4: string | null; ifsc: string | null;
  upi: string | null; invoice_prefix: string; default_terms_days: number; reminder_ladder: number[]; remind_every_hours: number;
  remind_whatsapp: boolean; remind_email: boolean; language: Lang; files_with: "creator_assist" | "own_ca";
  consent_at: string; sample_seeded_at: string | null; ais_updated_at: string | null;
};

export type Brand = {
  id: string; user_id: string; name: string; legal_name: string | null; gstin: string | null; tan: string | null;
  city: string | null; state: string | null; state_code: string | null; contact_name: string | null;
  contact_email: string | null; contact_whatsapp: string | null; cc_email: string | null;
  agency_name: string | null; is_sample: boolean; created_at: string;
};

export type Deal = {
  id: string; user_id: string; brand_id: string; paid_by: "brand" | "agency"; fee_paise: number;
  advance_paise: number; advance_received_at: string | null; go_live_date: string | null; terms_days: number;
  status: DealStatus; is_sample: boolean; created_at: string; updated_at: string;
  gst_mode: "add" | "incl" | "none"; tds_rate: number; notice_prompted_at?: string | null;
};

export type DealDeliverable = { id: string; deal_id: string; platform: string; type: string; quantity: number };
export type UsageRights = { deal_id: string; enabled: boolean; duration: string | null; scope: string | null };

export type AgreementBody = { title: string; subtitle: string; clauses: [string, string][] };
export type Agreement = {
  id: string; deal_id: string; body: AgreementBody; sign_token: string; status: "sent" | "signed" | "void";
  sent_at: string; viewed_at: string | null; signer_name: string | null; signer_designation: string | null;
  signer_email: string | null; signed_at: string | null; signer_ip: string | null; whatsapp_opt_in: boolean | null;
  is_sample: boolean; created_at: string;
};

export type InvoiceLine = { label: string; sac: string; amount_paise: number; included?: boolean };
export type Invoice = {
  id: string; deal_id: string; number: string; fy: string; seq: number; invoice_date: string; due_date: string;
  taxable_paise: number; cgst_paise: number; sgst_paise: number; igst_paise: number; gst_rate: number;
  total_paise: number; advance_deducted_paise: number; balance_due_paise: number; tds_rate: number;
  lines: InvoiceLine[]; is_sample: boolean; created_at: string;
};
export type Payment = {
  id: string; invoice_id: string; amount_paise: number; tds_paise: number; received_on: string; utr: string | null; is_sample: boolean;
};

export type Reminder = {
  id: string; deal_id: string | null; brand_id: string | null; kind: "payment" | "tds"; stage: string;
  channel: "email" | "whatsapp"; language: Lang; message: string | null; scheduled_at: string;
  sent_at: string | null; read_at: string | null; cancelled_at: string | null; is_sample: boolean;
};
export type Escalation = {
  id: string; deal_id: string; type: "final_reminder" | "lawyer_notice" | "msme_samadhaan";
  draft: string | null; status: string; channel: "email" | "whatsapp" | null; created_at: string;
};

export type AisEntry = { id: string; fy: string; deductor_name: string; tan: string | null; amount_paise: number; source: string; is_sample: boolean };
export type Filing = {
  id: string; type: "gstr1" | "gstr3b" | "advance_tax" | "itr"; period: string; due_date: string;
  handled_by: "creator_assist" | "own_ca"; status: string; data_sent_at: string | null;
};

export type DealFull = Deal & {
  brand: Brand;
  deliverables: DealDeliverable[];
  usage: UsageRights | null;
  invoice: (Invoice & { payments: Payment[] }) | null;
  agreement: Agreement | null;
  reminders: Reminder[];
  escalations: Escalation[];
};
