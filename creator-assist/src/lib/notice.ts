import { ADVOCATE, NOTICE_DAYS } from "./advocate";
import { lateInterest, type LateInterest } from "./calc";
import { daysBetween, fmtDate, fmtDateLong, istDate } from "./dates";
import type { DealView } from "./deal-view";
import { deliverablesProse, usageDurationProse, USAGE_SCOPES } from "./deliverables";
import { inr } from "./money";
import type { Profile } from "./types";

// Demand notice for an unpaid invoice, laid out as an advocate's letter on the
// panel advocate's letterhead. Nothing is sent until the creator presses send.
// VERIFY WITH LAWYER: wording, sections cited, notice period, interest and fee claimed.

/** A paragraph, or a list. `**text**` marks bold. */
export type Para = string | { list: string[]; ordered?: boolean };
export type Notice = {
  date: string;
  to: string[];
  alsoTo: string[] | null;
  subject: string;
  onBehalf: string[];
  intro: Para[];
  sections: { title: string; body: Para[] }[];
  conclusion: Para[];
  withoutPrejudice: string;
  representing: string;
  /** Amounts claimed, in paise. */
  claim: { principal: number; interest: number; interestLabel: string | null; legalFee: number; total: number };
};

const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const words = (n: number) => NUM[n] ?? String(n);
const plural = (n: number, s: string) => `${words(n)} ${s}${n === 1 ? "" : "s"}`;

export function buildNotice(v: DealView, p: Profile, opts: {
  date: string; account: string | null;
  /** The signed agreement's late-payment clause, and the rate read from it. */
  lateClause: string | null; late: LateInterest | null;
  legalFeePaise: number;
}): Notice {
  const d = v.d;
  const inv = d.invoice!;
  const brand = d.brand.legal_name || d.brand.name;
  const viaAgency = d.paid_by === "agency" && d.brand.agency_name;
  const payer = viaAgency ? d.brand.agency_name! : brand;
  const place = [d.brand.city, d.brand.state].filter(Boolean).join(", ");
  const client = p.name.toUpperCase();
  const due = fmtDateLong(inv.due_date);
  const advance = inv.advance_deducted_paise;
  const paidSoFar = v.received + v.tdsRecorded;
  const sent = d.reminders.filter((r) => r.kind === "payment" && r.sent_at).map((r) => istDate(r.sent_at!)).sort();
  const gst = inv.igst_paise
    ? `IGST @ ${inv.gst_rate}%: ${inr(inv.igst_paise)}`
    : inv.cgst_paise
      ? `CGST + SGST @ ${inv.gst_rate}%: ${inr(inv.cgst_paise + inv.sgst_paise)}`
      : null;
  const usage = d.usage?.enabled
    ? `Usage rights for ${usageDurationProse(d.usage.duration)}, ${USAGE_SCOPES.find((s) => s.value === d.usage!.scope)?.prose ?? ""}, included in the fee`.replace(/, ,/, ",")
    : null;
  const signed = d.agreement?.status === "signed" && d.agreement.signed_at ? d.agreement : null;
  const msme = !!p.udyam_no;
  const onDate = fmtDateLong(opts.date);
  const days = Math.max(0, daysBetween(inv.due_date, opts.date));
  const late = opts.late && opts.late.rate > 0 ? opts.late : null;
  const rateText = late ? `${late.rate}% ${late.period === "week" ? "per week" : "per annum"}` : "";
  const principal = v.remaining;
  // Contractual interest from the signed agreement; otherwise MSMED Act interest.
  const interest = late ? lateInterest(principal, days, late) : msme ? v.interest : 0;
  const interestLabel = late
    ? `Interest @ ${rateText} from ${due} to ${onDate} (${days} days)`
    : msme && interest ? `Interest under Section 16 of the MSMED Act, 2006 to ${onDate}` : null;
  const legalFee = opts.legalFeePaise;
  const total = principal + interest + legalFee;

  const to = [
    "The Authorised Signatory / Accounts Department",
    payer,
    ...(viaAgency ? [`(acting for ${brand})`] : []),
    ...(!viaAgency && place ? [place + "."] : []),
    ...(d.brand.contact_email ? [`Email: ${d.brand.contact_email}`] : []),
  ];
  const alsoTo = viaAgency
    ? ["The Marketing / Brand Partnerships Team", brand, ...(place ? [place + "."] : [])]
    : d.brand.contact_name
      ? [`${d.brand.contact_name}`, `Brand Partnerships, ${brand}`]
      : null;

  const onBehalf = [
    client,
    ...(p.handle ? [`(${p.handle.startsWith("@") ? p.handle : "@" + p.handle})`] : []),
    ...(p.address ? [p.address.replace(/\.?$/, ",")] : []),
    [p.city, p.state].filter(Boolean).join(", ") + ".",
  ];

  const sections: Notice["sections"] = [];

  sections.push({
    title: "PARTICULARS OF THE ENGAGEMENT",
    body: [
      `My Client is a professional content creator. ${viaAgency ? `${payer}, acting for ${brand}, engaged` : `${brand} engaged`} my Client for a paid brand collaboration on the following terms:`,
      {
        list: [
          `Brand: ${brand}`,
          ...(viaAgency ? [`Engaged and payable through: ${payer}`] : []),
          `Deliverables: ${deliverablesProse(d.deliverables)}`,
          ...(usage ? [usage] : []),
          `Agreed fee: ${inr(d.fee_paise)}${d.gst_mode === "add" ? " plus GST" : d.gst_mode === "incl" ? " inclusive of GST" : ""}`,
          ...(d.go_live_date ? [`Go-live date: ${fmtDateLong(d.go_live_date)}`] : []),
          `Payment terms: ${d.terms_days} days from the invoice date`,
        ],
      },
      ...(signed
        ? [`These terms were recorded in a written agreement accepted electronically on ${fmtDateLong(istDate(signed.signed_at!))} by ${signed.signer_name}${signed.signer_designation ? `, ${signed.signer_designation}` : ""}, on your behalf, after verification by one-time password sent to ${signed.signer_email}.`]
        : []),
    ],
  });

  sections.push({
    title: "INVOICE RAISED BY MY CLIENT",
    body: [
      `My Client raised Tax Invoice No. **${inv.number}** dated ${fmtDateLong(inv.invoice_date)}, the particulars of which are:`,
      {
        list: [
          `Taxable value: ${inr(inv.taxable_paise)}`,
          ...(gst ? [gst] : []),
          `Invoice total: ${inr(inv.total_paise)}`,
          ...(advance ? [`Less advance received: ${inr(advance)}`] : []),
          `Balance payable: ${inr(inv.balance_due_paise)}`,
          `Due date: ${due}`,
        ],
      },
    ],
  });

  sections.push({
    title: "MY CLIENT HAS PERFORMED IN FULL",
    body: [
      `My Client created and published the agreed deliverables${d.go_live_date ? ` on or about ${fmtDateLong(d.go_live_date)}` : ""} in accordance with the agreed brief. The content was accepted and has been used for your promotion.`,
      "At no point have you raised any objection to the quality, timing or substance of the deliverables, or to the invoice. The amount claimed is therefore an admitted and undisputed debt.",
    ],
  });

  sections.push({
    title: "REMINDERS AND CONTINUED NON-PAYMENT",
    body: [
      sent.length
        ? `Despite the due date having passed, my Client sent you ${plural(sent.length, "written reminder")} (${sent.map(fmtDate).join(", ")}) requesting payment.`
        : "Despite the due date having passed and repeated requests by my Client, payment has not been made.",
      ...(paidSoFar > 0 ? [`You have paid only ${inr(paidSoFar)} (including tax deducted at source, if any) against the balance.`] : []),
      `As on ${onDate}, a sum of **${inr(principal)}** remains unpaid and is overdue by ${days} day${days === 1 ? "" : "s"}.`,
    ],
  });

  if (late) {
    sections.push({
      title: "CONTRACTUAL INTEREST ON DELAYED PAYMENT",
      body: [
        `The agreement between the parties expressly provides: "${opts.lateClause}"`,
        `You agreed to these terms with full knowledge. Interest at **${rateText}** on the unpaid sum of ${inr(principal)} from the due date, ${due}, to the date of this notice (${days} days) amounts to **${inr(interest)}**. Interest continues to accrue at the same rate until the date of actual payment.`,
      ],
    });
  }
  if (msme) {
    sections.push({
      title: "RIGHTS UNDER THE MSMED ACT, 2006",
      body: [
        `My Client is registered as a micro enterprise under Udyam Registration No. **${p.udyam_no}**. Under Section 15 of the Micro, Small and Medium Enterprises Development Act, 2006, you were bound to pay my Client within the agreed period, and in any case within 45 days of acceptance.`,
        late
          ? "My Client also reserves the right to claim compound interest with monthly rests at three times the bank rate notified by the Reserve Bank of India under Section 16 of the said Act, whichever is higher."
          : `Under Section 16 of the said Act, you are liable to pay compound interest with monthly rests at three times the bank rate notified by the Reserve Bank of India. Such interest amounts to **${inr(interest)}** as on the date of this notice and continues to accrue.`,
      ],
    });
  }

  if (legalFee > 0) {
    sections.push({
      title: "LEGAL COSTS",
      body: [`Owing to your failure to pay, my Client has been compelled to engage the undersigned and incur legal fees of **${inr(legalFee)}** towards this notice. You are liable to reimburse the same${signed && late ? ", as also provided in the agreement" : ""}. Any further proceedings will add to the costs recoverable from you.`],
    });
  }

  if (v.tdsRemaining > 0) {
    sections.push({
      title: "TAX DEDUCTED AT SOURCE",
      body: [`If you deduct tax at source from this payment, you are required to deposit it with the Government within the prescribed time and issue the TDS certificate (Form 16A) to my Client. Any deduction not reflected in my Client's Form 26AS / AIS will be treated as unpaid.`],
    });
  }

  sections.push({
    title: "DEMAND",
    body: [
      `I therefore call upon you to pay my Client the following amounts within **${NOTICE_DAYS} days** from the receipt of this notice:`,
      {
        ordered: true,
        list: [
          `Principal amount outstanding under Tax Invoice No. ${inv.number}: ${inr(principal)}`,
          ...(interestLabel ? [`${interestLabel}: ${inr(interest)}`] : []),
          ...(legalFee > 0 ? [`Legal fee towards this notice: ${inr(legalFee)}`] : []),
          `**Total payable as on ${onDate}: ${inr(total)}**`,
        ],
      },
      ...(late ? [`together with further interest at ${rateText} on ${inr(principal)} from the date of this notice until the date of actual payment.`] : []),
      "Payment is to be made to the following account of my Client:",
      {
        list: [
          `Account name: ${p.name}`,
          ...(p.bank_name ? [`Bank: ${p.bank_name}`] : []),
          ...(opts.account ? [`Account No.: ${opts.account}`] : []),
          ...(p.ifsc ? [`IFSC: ${p.ifsc}`] : []),
          ...(p.upi ? [`UPI: ${p.upi}`] : []),
        ],
      },
      `Please quote invoice number ${inv.number} as the payment reference and share the UTR with the undersigned.`,
    ],
  });

  sections.push({
    title: "CONSEQUENCES OF NON-COMPLIANCE",
    body: [
      `Take notice that if you fail to pay the total amount within the stipulated period, my Client has instructed me to, without any further notice to you:`,
      {
        list: [
          ...(msme ? ["lodge a complaint against you before the Micro and Small Enterprises Facilitation Council under Section 18 of the MSMED Act, 2006, through the MSME Samadhaan portal;"] : []),
          "lodge a complaint against you before the appropriate authorities and forums for your wilful failure to pay for services availed and used;",
          `institute a civil suit for recovery of the principal amount, interest${late ? ` at ${rateText}` : ""} until realisation, and the legal fee and costs of all proceedings; and`,
          "initiate such other civil and criminal proceedings as my Client may be advised,",
        ],
      },
      "entirely at your risk as to costs and consequences, which please note.",
    ],
  });

  sections.push({
    title: "AUTHORISED LEGAL REPRESENTATION",
    body: [
      `My Client has authorised ${ADVOCATE.name}, Advocate, ${ADVOCATE.firm}, to represent them in this matter. All communications regarding this notice, the payment and any reconciliation may be addressed to the undersigned.`,
    ],
  });

  sections.push({
    title: "REQUEST FOR RESPONSE",
    body: [`You are requested to acknowledge this notice and confirm the date of payment in writing within ${NOTICE_DAYS} days from its receipt.`],
  });

  return {
    date: opts.date,
    to, alsoTo, onBehalf,
    subject: `LEGAL NOTICE FOR RECOVERY OF UNPAID FEES OF ${inr(principal)} WITH INTEREST AND COSTS UNDER TAX INVOICE NO. ${inv.number} DATED ${fmtDate(inv.invoice_date).toUpperCase()} – ${client}${viaAgency ? "" : ` – ${brand.toUpperCase()}`}`,
    intro: [
      `Under instructions from and on behalf of my Client, **${client}**, I hereby serve upon you this legal notice for recovery of the amount due to my Client under Tax Invoice No. ${inv.number}.`,
    ],
    sections,
    conclusion: [
      "My Client makes their position clear:",
      {
        list: [
          "My Client has delivered the agreed work in full.",
          `The principal sum of ${inr(principal)} is an admitted debt and is overdue.`,
          `You are liable to pay ${inr(total)}${interest || legalFee ? ` including ${[interest ? "interest" : "", legalFee ? "the legal fee" : ""].filter(Boolean).join(" and ")}` : ""}, within ${NOTICE_DAYS} days of receipt of this notice.`,
          "Failing payment, my Client will lodge a complaint and pursue recovery of the principal, interest and legal costs without further notice.",
        ],
      },
      "A copy of this notice has been retained in my office for further action.",
    ],
    withoutPrejudice: "This notice is issued without prejudice to all other rights, claims, contentions and remedies available to my Client under applicable law and the agreement between the parties.",
    representing: client,
    claim: { principal, interest, interestLabel, legalFee, total },
  };
}

const plain = (s: string) => s.replace(/\*\*/g, "");
const paraText = (x: Para) => (typeof x === "string" ? plain(x) : x.list.map((l, i) => `${x.ordered ? `${i + 1}.` : "•"} ${plain(l)}`).join("\n"));

/** Plain-text copy of the notice, stored with the escalation for the review queue. */
export function noticeText(n: Notice): string {
  return [
    `Date: ${fmtDate(n.date)}`,
    "BY REGISTERED POST / SPEED POST / EMAIL",
    "TO\n" + n.to.join("\n"),
    ...(n.alsoTo ? ["ALSO TO\n" + n.alsoTo.join("\n")] : []),
    "SUBJECT: " + n.subject,
    "On behalf of:\n" + n.onBehalf.join("\n"),
    "Sir/Madam,",
    ...n.intro.map(paraText),
    ...n.sections.map((s, i) => `${i + 1}. ${s.title}\n` + s.body.map(paraText).join("\n")),
    "CONCLUSION\n" + n.conclusion.map(paraText).join("\n"),
    n.withoutPrejudice,
    `Yours faithfully,\n${ADVOCATE.name}, Advocate\n${ADVOCATE.firm}\nAuthorised Representative for ${n.representing}`,
  ].join("\n\n");
}
