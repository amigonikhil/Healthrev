// Typed client for /api/v1, used by the mobile apps. Sends the Supabase access token and
// the platform on every request, and turns error responses into ApiError with the
// server's message (the same text the web forms show).
import type {
  AiCallInput, ApiErrorBody, AppConfig, BrandList, CreateDealInput, DealDetail, DealList, GenerateInvoiceInput, HomeSummary,
  LegalCallInput, Me, OnboardInput, RatesInput, RecordPaymentInput, RecordPaymentResult, ReminderSettingsInput, ReminderTarget,
  SendAgreementInput, SendAgreementResult, UpdateProfileInput,
} from "./api";
import type { TaxConfig } from "./calc";
import type { DealView } from "./deal-view";
import type { DeliverableDef } from "./deliverables";
import type { ReminderTemplates } from "./messages";
import type { PastedDeal } from "./pasted-deal";
import type { TaxHub } from "./tax";
import type { Agreement, AgreementBody, Brand, Filing, Invoice, Lang, Profile, Reminder } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export type ApiClientOptions = {
  /** e.g. https://creator-assist-neon.vercel.app/api/v1 */
  baseUrl: string;
  /** The current Supabase access token, or null when signed out. */
  getToken: () => Promise<string | null>;
  platform: "ios" | "android" | "web";
  /** Called on a 401, e.g. to send the user back to sign-in. */
  onUnauthorized?: () => void;
  fetch?: typeof fetch;
};

type Json = Record<string, unknown> | unknown[];
type InvoiceShown = (Invoice & { draft: false }) | (Omit<Invoice, "id" | "deal_id" | "seq" | "is_sample" | "created_at"> & { draft: true });

export function createApiClient(o: ApiClientOptions) {
  const doFetch = o.fetch ?? fetch;

  async function headers(extra: Record<string, string> = {}): Promise<Record<string, string>> {
    const token = await o.getToken();
    return { "X-Client-Platform": o.platform, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
  }

  async function request<T>(method: string, path: string, body?: Json | FormData): Promise<T> {
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    const res = await doFetch(o.baseUrl + path, {
      method,
      headers: await headers(body && !isForm ? { "Content-Type": "application/json" } : {}),
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
    const text = await res.text();
    const data = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
    if (!res.ok) {
      if (res.status === 401) o.onUnauthorized?.();
      const err = (data ?? {}) as Partial<ApiErrorBody>;
      throw new ApiError(res.status, err.error ?? "Something went wrong. Please try again.", err.code);
    }
    return data as T;
  }
  const get = <T>(p: string) => request<T>("GET", p);
  const post = <T>(p: string, b: Json | FormData = {}) => request<T>("POST", p, b);
  const put = <T>(p: string, b: Json) => request<T>("PUT", p, b);
  const patch = <T>(p: string, b: Json) => request<T>("PATCH", p, b);
  const del = <T>(p: string, b?: Json) => request<T>("DELETE", p, b);
  const enc = encodeURIComponent;

  return {
    /** For downloads (PDFs, export): the URL and auth headers to hand to a file downloader. */
    async download(path: string): Promise<{ url: string; headers: Record<string, string> }> {
      return { url: o.baseUrl + path, headers: await headers() };
    },

    config: () => get<AppConfig>("/config"),
    me: () => get<Me>("/me"),
    bootstrap: () => post<Me>("/me/bootstrap"),
    onboard: (i: OnboardInput) => post<{ profile: Profile }>("/profile", i),
    updateProfile: (i: UpdateProfileInput) => patch<{ profile: Profile }>("/profile", i),
    emailCode: (email: string) => post<{ ok: true }>("/auth/email-code", { email }),

    home: () => get<HomeSummary>("/home"),
    brands: () => get<BrandList>("/brands"),
    deliverables: () => get<{ groups: { group: string; items: DeliverableDef[] }[]; usageScopes: { value: string; label: string }[]; usageMaxMonths: number }>("/deliverables"),

    deals: {
      list: () => get<DealList>("/deals"),
      get: (id: string) => get<DealDetail>(`/deals/${enc(id)}`),
      create: (i: CreateDealInput) => post<{ id: string }>("/deals", i),
      options: () => get<{ today: string; tax: TaxConfig; brands: Brand[]; creator: { stateCode: string; registered: boolean; terms: number; msme: boolean } }>("/deals/options"),
      advanceReceived: (id: string) => post<{ ok: true }>(`/deals/${enc(id)}/advance`),
      /** Paste a deal: text and/or a screenshot (FormData with `text`, `image`). Nothing is saved. */
      extract: (form: FormData) => post<{ deal: PastedDeal }>("/deals/extract", form),

      agreement: (id: string) => get<{ body: AgreementBody; agreement: Agreement | null; signLink: string | null }>(`/deals/${enc(id)}/agreement`),
      sendAgreement: (id: string, i: SendAgreementInput) => post<SendAgreementResult>(`/deals/${enc(id)}/agreement`, i),

      invoice: (id: string) => get<{ invoice: InvoiceShown; billTo: string }>(`/deals/${enc(id)}/invoice`),
      generateInvoice: (id: string, i: GenerateInvoiceInput) => post<{ invoice: Invoice; message: string; existed: boolean }>(`/deals/${enc(id)}/invoice`, i),
      recordPayment: (id: string, i: RecordPaymentInput) => post<RecordPaymentResult>(`/deals/${enc(id)}/payments`, i),

      reminders: (id: string) => get<{ ladder: Reminder[]; manual: Reminder[]; stage: string; templates: ReminderTemplates }>(`/deals/${enc(id)}/reminders`),
      escalation: (id: string) => get<{ sentNotice: unknown; callSlot: string | null; claim: { principal: number; interest: number; legalFee: number; total: number } | null }>(`/deals/${enc(id)}/escalation`),
      notice: (id: string) => get<{ notice: unknown; waHref: string | null; emailTo: string | null }>(`/deals/${enc(id)}/notice`),
      emailNotice: (id: string) => post<{ message: string }>(`/deals/${enc(id)}/notice/email`),
      logNoticeWhatsApp: (id: string) => post<{ ok: true }>(`/deals/${enc(id)}/notice/whatsapp`),
      samadhaan: (id: string) => post<{ ok: true; portal: string }>(`/deals/${enc(id)}/samadhaan`),
      bookLegalCall: (id: string, i: LegalCallInput) => post<{ id: string }>(`/deals/${enc(id)}/legal-call`, i),
    },

    invoices: {
      email: (id: string) => post<{ message: string }>(`/invoices/${enc(id)}/email`),
      pdfPath: (id: string) => `/invoices/${enc(id)}/pdf`,
    },
    agreements: { pdfPath: (id: string) => `/agreements/${enc(id)}/pdf` },

    reminders: {
      logWhatsApp: (t: ReminderTarget) => post<{ ok: true }>("/reminders/whatsapp", t),
      email: (t: ReminderTarget & { cc: boolean }) => post<{ message: string }>("/reminders/email", t),
      tds: (brandId: string) => get<{ payer: TaxHub["payers"][number]; ladder: Reminder[]; pan: string }>(`/brands/${enc(brandId)}/tds`),
      scheduleTds: (brandId: string, lang: Lang) => post<{ ok: true }>(`/brands/${enc(brandId)}/tds`, { lang }),
    },

    tax: {
      hub: () => get<{ today: string; hub: TaxHub; cards: { type: Filing["type"]; period: string; title: string; detail: string; due: string; filing: Filing | null }[]; missing: TaxHub["payers"]; filesWith: Profile["files_with"]; aisUpdatedAt: string | null }>("/tax"),
      setFiler: (who: Profile["files_with"]) => put<{ ok: true }>("/tax/filer", { who }),
      sendFilingData: (i: { type: Filing["type"]; period: string; due: string }) => post<{ message: string }>("/tax/filings", i),
      uploadAis: (form: FormData) => post<{ message: string }>("/tax/ais", form),
      addAisEntry: (i: { deductor: string; tan?: string; amountPaise: number }) => post<{ message: string }>("/tax/ais/entries", i),
      fileWithUs: () => get<{ invoiceCount: number; brands: number }>("/tax/file-with-us"),
      bookAiCall: (i: AiCallInput) => post<{ id: string }>("/ai-calls", i),
    },

    settings: {
      get: () => get<{ tax: TaxConfig; rateDefaults: Partial<TaxConfig> | null; templates: ReminderTemplates; isAdmin: boolean; hasSampleData: boolean }>("/settings"),
      rates: (i: RatesInput) => put<{ message: string }>("/settings/rates", i),
      reminders: (i: ReminderSettingsInput) => put<{ message: string }>("/settings/reminders", i),
    },

    sample: {
      load: () => post<{ message: string }>("/sample"),
      clear: () => del<{ message: string }>("/sample"),
    },
    notifications: {
      list: () => get<{ notifications: { id: string; title: string; link: string | null }[] }>("/notifications"),
      dismiss: (id: string) => post<{ ok: true }>(`/notifications/${enc(id)}/dismiss`),
    },
    feedback: (screen: string, message: string) => post<{ ok: true }>("/feedback", { screen, message }),
    /** Client analytics (screen views, taps). Fire and forget. */
    event: (name: string, opts: { screen?: string; props?: Record<string, string>; anon?: string } = {}) =>
      post<null>("/events", { name, ...opts }).catch(() => null),

    account: {
      exportPath: "/account/export",
      delete: () => del<{ ok: true }>("/account", { confirm: "DELETE" }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
export type { DealView };
