import type { SendAgreementInput } from "@creator-assist/shared/api";
import { agreementView, sendAgreement } from "@/server/agreements";
import { body, route } from "@/server/http";

/** The agreement (or a preview of it) and, once sent, the brand's signing link. */
export const GET = route(async (ctx, _req, p) => {
  const { body: doc, agreement, signLink } = await agreementView(ctx, p.id);
  return { body: doc, agreement: agreement && { ...agreement, sign_token: undefined }, signLink };
});
/** Send for e-sign by email and/or WhatsApp. The brand signs on the web link. */
export const POST = route(async (ctx, req, p) => sendAgreement(ctx, p.id, await body<SendAgreementInput>(req)));
