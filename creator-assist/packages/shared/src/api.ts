// Request and response shapes for the /api/v1 routes. The server validates every
// field (with the same messages the web forms show); these types keep the web and
// mobile clients in step with it. Money is integer paise; dates are 'YYYY-MM-DD' (IST).
import type { GstMode, TaxConfig } from "./calc";
import type { DealView } from "./deal-view";
import type { BrandRow, HomeNumbers } from "./overview";
import type { Agreement, AgreementBody, Filing, Lang, Profile } from "./types";

export const API_VERSION = "v1";

/** Error body for every non-2xx response. `code` is set where a client should branch on it. */
export type ApiErrorBody = { error: string; code?: "unauthorized" | "onboarding_required" | "not_found" | "rate_limited" | "not_configured" | string };

export type FeatureFlag = "lawyer_notice" | "file_with_us" | "deal_from_chat";
export type AppConfig = {
  flags: Record<FeatureFlag, boolean>;
  /** Mobile builds below this version must update before continuing. */
  minAppVersion: { ios: string; android: string };
  /** Which sign-in methods are switched on (phone OTP waits for SMS/DLT registration). */
  signIn: { phone: boolean; email: boolean };
};

// ---------------------------------------------------------------- session / profile

export type Me = {
  user: { id: string; email: string | null; phone: string | null };
  profile: Profile | null;
  tax: TaxConfig | null;
  isAdmin: boolean;
  hasSampleData: boolean;
};

export type ProfileInput = {
  name: string; state: string; pan?: string; gstin?: string; udyam?: string;
  bankAccount?: string; ifsc: string; upi?: string; email?: string; handle?: string; city?: string; address?: string;
};
export type OnboardInput = ProfileInput & { pan: string; bankAccount: string; consent: boolean; phone?: string };
export type UpdateProfileInput = ProfileInput & { invoicePrefix: string };

export type RatesInput = {
  gstRate: number; tdsRate: number; rbiBankRate: number; msmeMultiple: number;
  lateInterestRate: number; lateInterestPeriod: "week" | "year"; noticeLegalFeePaise: number;
};
export type ReminderSettingsInput = { everyHours: number; whatsapp: boolean; email: boolean; language: Lang; termsDays: number };

// ---------------------------------------------------------------- deals

export type CreateDealInput = {
  brand: string; paidBy: "brand" | "agency"; agency?: string | null; brandLegal?: string | null;
  contactName?: string | null; contactEmail?: string | null; contactWhatsapp?: string | null;
  brandState: string; brandGstin?: string | null;
  feePaise: number; gstMode?: GstMode;
  /** null = the brand doesn't deduct TDS. */
  tds: { rate: number } | null;
  /** null = no advance. */
  advance: { paise: number; received: boolean } | null;
  goLive?: string | null; termsDays: number;
  deliverables: { platform: string; type: string; quantity: number }[];
  /** null = no usage rights. Duration "1m".."60m" or "perpetual"; scope organic_paid | organic | paid. */
  usage: { duration: string; scope?: string } | null;
};

export type DealList = { today: string; deals: DealView[] };
export type DealDetail = { today: string; deal: DealView };

export type HomeSummary = HomeNumbers & { today: string; empty: boolean };
export type BrandList = { today: string; brands: BrandRow[] };

// ---------------------------------------------------------------- agreements, invoices, payments

export type AgreementView = { body: AgreementBody; agreement: Agreement | null; signLink: string | null };
export type SendAgreementInput = { email: boolean; whatsapp: boolean };
export type SendAgreementResult = { link: string; wa: string | null; emailed: boolean; note?: string };

export type GenerateInvoiceInput = { invoiceDate: string; email: boolean };
export type RecordPaymentInput = { amountPaise: number; tdsPaise: number; receivedOn?: string; utr?: string | null; form16a?: boolean };
export type RecordPaymentResult = { settled: boolean; tdsPaise: number };

// ---------------------------------------------------------------- reminders

export type ReminderTarget = { dealId?: string; brandId?: string; kind: "payment" | "tds"; stage: string; lang: Lang; message: string };

// ---------------------------------------------------------------- tax

export type FilingCard = { type: Filing["type"]; period: string; title: string; detail: string; due: string; filing: Filing | null };

export type AiCallInput = { slot: string; language: string; phone: string; consent: boolean };
export type LegalCallInput = { slot: string; phone: string; note?: string | null; consent: boolean };
