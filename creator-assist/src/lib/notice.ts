import { ADVOCATE, NOTICE_DAYS } from "./advocate";
import { fmtDate, fmtDateLong, istDate } from "./dates";
import type { DealView } from "./deal-view";
import { deliverablesProse, usageDurationProse, USAGE_SCOPES } from "./deliverables";
import { inr } from "./money";
import type { Profile } from "./types";

// Demand notice for an unpaid invoice, laid out as an advocate's letter on the
// panel advocate's letterhead. It is never sent automatically: it goes to the
// lawyer review queue. VERIFY WITH LAWYER: wording, sections cited, notice period.

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
};

const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const words = (n: number) => NUM[n] ?? String(n);
const plural = (n: number, s: string) => `${words(n)} ${s}${n === 1 ? "" : "s"}`;

export function buildNotice(v: DealView, p: Profile, opts: { date: string; account: string | null; lateInterestClause: string | null }): Notice {
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
  const interestLine = msme
    ? ` together with compound interest under Section 16 of the MSMED Act, 2006 (${inr(v.interest)} as on ${fmtDateLong(opts.date)}, continuing to accrue until payment)`
    : opts.lateInterestClause ? " together with contractual interest as agreed" : "";

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
      `As on ${fmtDateLong(opts.date)}, a sum of **${inr(v.remaining)}** remains unpaid and is overdue by ${v.daysOverdue} day${v.daysOverdue === 1 ? "" : "s"}.`,
    ],
  });

  if (msme) {
    sections.push({
      title: "STATUTORY INTEREST UNDER THE MSMED ACT, 2006",
      body: [
        `My Client is registered as a micro enterprise under Udyam Registration No. **${p.udyam_no}**. Under Section 15 of the Micro, Small and Medium Enterprises Development Act, 2006, you were bound to pay my Client within the agreed period, and in any case within 45 days of acceptance.`,
        `Under Section 16 of the said Act, you are liable to pay compound interest with monthly rests at three times the bank rate notified by the Reserve Bank of India from the appointed day. Such interest amounts to ${inr(v.interest)} as on the date of this notice and continues to accrue.`,
      ],
    });
  } else if (opts.lateInterestClause) {
    sections.push({ title: "CONTRACTUAL INTEREST ON DELAYED PAYMENT", body: [`The agreement between the parties provides: "${opts.lateInterestClause}" You are liable to pay such interest in addition to the principal sum.`] });
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
      `I therefore call upon you to pay my Client the sum of **${inr(v.remaining)}**${interestLine}, within **${NOTICE_DAYS} days** from the receipt of this notice, to the following account of my Client:`,
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
      `If you fail to make payment within the stipulated period, my Client shall be constrained to initiate appropriate proceedings against you without further notice, including${msme ? " a reference to the Micro and Small Enterprises Facilitation Council under Section 18 of the MSMED Act, 2006, and" : ""} a civil suit for recovery of the amount with interest, entirely at your risk as to costs and consequences.`,
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
    subject: `LEGAL NOTICE FOR RECOVERY OF UNPAID FEES OF ${inr(v.remaining)} UNDER TAX INVOICE NO. ${inv.number} DATED ${fmtDate(inv.invoice_date).toUpperCase()} – ${client}${viaAgency ? "" : ` – ${brand.toUpperCase()}`}`,
    intro: [
      `Under instructions from and on behalf of my Client, **${client}**, I hereby serve upon you this legal notice for recovery of the amount due to my Client under Tax Invoice No. ${inv.number}.`,
    ],
    sections,
    conclusion: [
      "My Client makes their position clear:",
      {
        list: [
          "My Client has delivered the agreed work in full.",
          `The sum of ${inr(v.remaining)} is an admitted debt and is overdue.`,
          `Payment must be made within ${NOTICE_DAYS} days of receipt of this notice.`,
          "Failing payment, my Client will pursue recovery without further notice.",
        ],
      },
      "A copy of this notice has been retained in my office for further action.",
    ],
    withoutPrejudice: "This notice is issued without prejudice to all other rights, claims, contentions and remedies available to my Client under applicable law and the agreement between the parties.",
    representing: client,
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
