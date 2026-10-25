import "server-only";
import path from "node:path";
import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { fmtDateLong, fmtTimeIST, istDate } from "./dates";
import type { Agreement, AgreementBody } from "./types";

// Fonts are embedded so ₹ renders (the standard PDF fonts don't have it).
const dir = path.join(process.cwd(), "src", "fonts");
let registered = false;
export function fonts() {
  if (registered) return;
  Font.register({ family: "Jakarta", fonts: [{ src: path.join(dir, "jakarta-400.ttf") }, { src: path.join(dir, "jakarta-700.ttf"), fontWeight: 700 }] });
  Font.register({ family: "Serif", fonts: [{ src: path.join(dir, "serif-400.ttf") }, { src: path.join(dir, "serif-700.ttf"), fontWeight: 700 }] });
  Font.registerHyphenationCallback((w) => [w]);
  registered = true;
}

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: "Jakarta", fontSize: 10, color: "#0F172A", lineHeight: 1.45 },
  h1: { fontSize: 18, fontWeight: 700, lineHeight: 1.3, marginBottom: 6 },
  h2: { fontSize: 11, fontWeight: 700, marginTop: 10, marginBottom: 2 },
  muted: { color: "#475569" },
  bold: { fontWeight: 700 },
  serif: { fontFamily: "Serif", fontSize: 10.5, lineHeight: 1.6 },
  box: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 6, padding: 10, marginTop: 14 },
  foot: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8, color: "#64748B", textAlign: "center" },
});

export async function agreementPdf(args: { body: AgreementBody; agreement: Pick<Agreement, "status" | "signer_name" | "signer_designation" | "signer_email" | "signed_at" | "signer_ip" | "sign_token">; brandName: string }) {
  fonts();
  const a = args.agreement;
  const doc = (
    <Document title={args.body.title} author="Creator Assist">
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{args.body.title}</Text>
        <Text style={s.muted}>{args.body.subtitle}</Text>
        {args.body.clauses.map(([h, t]) => (
          <View key={h} wrap={false}>
            <Text style={s.h2}>{h}</Text>
            <Text style={s.serif}>{t}</Text>
          </View>
        ))}
        <View style={s.box} wrap={false}>
          {a.status === "signed" && a.signed_at ? (<>
            <Text style={s.bold}>Signed electronically on behalf of {args.brandName}</Text>
            <Text>{a.signer_name}{a.signer_designation ? `, ${a.signer_designation}` : ""}</Text>
            <Text style={s.muted}>Verified by one-time password sent to {a.signer_email}</Text>
            <Text style={s.muted}>{fmtDateLong(istDate(a.signed_at))}, {fmtTimeIST(a.signed_at)} IST{a.signer_ip && a.signer_ip !== "sample" ? ` · IP ${a.signer_ip}` : ""}</Text>
            <Text style={s.muted}>Reference {a.sign_token.slice(0, 12)}</Text>
          </>) : <Text style={s.muted}>Not signed yet.</Text>}
        </View>
        <Text style={s.foot} fixed>Generated with Creator Assist</Text>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
