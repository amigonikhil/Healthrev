import "server-only";
import path from "node:path";
import { Document, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { ADVOCATE } from "./advocate";
import type { Notice, Para } from "./notice";
import { fonts } from "./pdf";

// Advocate's letterhead, copied from the notice the owner supplied: logos either
// side of a rounded name box, a heavy rule under it and at the foot of every page.
const assets = path.join(process.cwd(), "src", "assets", "notice");
const INK = "#111111";

const s = StyleSheet.create({
  page: { fontFamily: "Jakarta", fontSize: 10.5, color: INK, lineHeight: 1.5, paddingTop: 172, paddingBottom: 56, paddingHorizontal: 44 },
  head: { position: "absolute", top: 26, left: 44, right: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logo: { width: 62, height: 62, objectFit: "contain" },
  box: { width: 300, borderWidth: 1, borderColor: INK, borderRadius: 18, paddingVertical: 10, alignItems: "center" },
  firm: { fontSize: 18, fontWeight: 700, letterSpacing: 0.4, lineHeight: 1.2 },
  tagline: { fontSize: 13, textDecoration: "underline", marginTop: 2, lineHeight: 1.3 },
  courts: { fontSize: 11.5, textAlign: "center", marginTop: 6, lineHeight: 1.3 },
  ruleTop: { position: "absolute", top: 156, left: 44, right: 44, height: 2.6, backgroundColor: INK },
  ruleFoot: { position: "absolute", bottom: 32, left: 44, right: 44, height: 2.6, backgroundColor: INK },
  date: { textAlign: "right", marginTop: -8 },
  post: { textAlign: "center", fontWeight: 700, marginTop: -2, marginBottom: 4 },
  block: { marginTop: 12 },
  subject: { marginTop: 12, fontWeight: 700 },
  just: { textAlign: "justify" },
  h: { fontWeight: 700, marginTop: 12 },
  li: { flexDirection: "row", paddingLeft: 10 },
  bullet: { width: 14 },
  sig: { width: 92, height: 43, marginTop: 6, marginBottom: 2, objectFit: "contain" },
});

/** "**bold**" runs inside a paragraph. */
function rich(t: string) {
  return t.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part, i) =>
    part.startsWith("**") ? <Text key={i} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</Text> : part,
  );
}

function P({ x }: { x: Para }) {
  if (typeof x === "string") return <Text style={s.just}>{rich(x)}</Text>;
  return (
    <View>
      {x.list.map((l, i) => (
        <View key={i} style={s.li} wrap={false}>
          <Text style={s.bullet}>{x.ordered ? `${i + 1}.` : "•"}</Text>
          <Text style={{ flex: 1 }}>{rich(l)}</Text>
        </View>
      ))}
    </View>
  );
}

const Lines = ({ lines }: { lines: string[] }) => <>{lines.map((l, i) => <Text key={i}>{l}</Text>)}</>;

export async function noticePdf(n: Notice) {
  fonts();
  const doc = (
    <Document title={`Legal notice – ${n.representing}`} author={`${ADVOCATE.name}, ${ADVOCATE.firm}`}>
      <Page size="A4" style={s.page}>
        <View style={s.head} fixed>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
          <Image style={s.logo} src={path.join(assets, "scales.png")} />
          <View style={s.box}>
            <Text style={s.firm}>{ADVOCATE.firm.toUpperCase()}</Text>
            <Text style={s.tagline}>{ADVOCATE.tagline}</Text>
            <Text style={s.courts}>{ADVOCATE.courts.join("\n")}</Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image style={s.logo} src={path.join(assets, "bands.png")} />
        </View>
        <View style={s.ruleTop} fixed />
        <View style={s.ruleFoot} fixed />

        <Text style={s.date}>Date: {n.date.split("-").reverse().join("/")}</Text>
        <Text style={s.post}>BY REGISTERED POST / SPEED POST / EMAIL</Text>
        <View><Text>TO</Text><Lines lines={n.to} /></View>
        {n.alsoTo && <View style={s.block}><Text>ALSO TO</Text><Lines lines={n.alsoTo} /></View>}
        <Text style={s.subject}>SUBJECT: {n.subject}</Text>
        <View style={s.block}><Text>On behalf of:</Text><Lines lines={n.onBehalf} /></View>
        <Text style={s.block}>Sir/Madam,</Text>
        {n.intro.map((x, i) => <P key={i} x={x} />)}

        {n.sections.map((sec, i) => (
          <View key={sec.title}>
            <Text style={s.h} minPresenceAhead={40}>{i + 1}. {sec.title}</Text>
            {sec.body.map((x, j) => <P key={j} x={x} />)}
          </View>
        ))}

        <Text style={s.h} minPresenceAhead={40}>CONCLUSION</Text>
        {n.conclusion.map((x, i) => <P key={i} x={x} />)}
        <Text style={[s.just, s.block]}>{n.withoutPrejudice}</Text>

        <View style={s.block} wrap={false}>
          <Text>Yours faithfully,</Text>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image style={s.sig} src={path.join(assets, "signature.png")} />
          <Text>{ADVOCATE.name}, Advocate</Text>
          <Text>{ADVOCATE.firm}</Text>
          <Text>{ADVOCATE.address}</Text>
          <Text>Email : {ADVOCATE.email}</Text>
          <Text>Contact No : {ADVOCATE.phones}</Text>
          <Text style={{ fontWeight: 700 }}>Authorised Representative for {n.representing}</Text>
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
