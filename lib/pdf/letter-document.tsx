import "server-only";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { KIND_TITLE, longDate, type LetterKind, type LetterStatus } from "@/lib/letters";
import { BODY, BRAND, INK, LINE, LOGO, SOFT } from "./brand";

type Img = { data: Buffer; format: "png" | "jpg" };

export type LetterPdfData = {
  kind: LetterKind;
  status: LetterStatus;
  ref_no: string | null;
  issue_date: string | null;
  full_name: string;
  emp_code: string;
  designation: string;
  company_name: string;
  body: string;
  cancelled_at: string | null;
  signer: { name: string; title: string; signature: Img | null; seal: Img | null } | null;
  qr: Img | null;
  verifyUrl: string | null;
};

const s = StyleSheet.create({
  page: { fontFamily: "Jakarta", fontSize: 10.5, color: INK, paddingBottom: 64 },
  topBar: { height: 6, backgroundColor: BRAND },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 56, paddingTop: 32, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: LINE },
  logo: { width: 128, height: 34, objectFit: "contain" },
  companyLine: { fontSize: 8.5, color: BODY, marginTop: 6 },
  meta: { alignItems: "flex-end" },
  metaLabel: { fontSize: 7.5, color: BODY, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase" },
  metaValue: { fontSize: 10, fontWeight: 700, marginTop: 2, marginBottom: 6 },
  body: { paddingHorizontal: 56, paddingTop: 34 },
  eyebrow: { fontSize: 8.5, fontWeight: 700, color: BRAND, letterSpacing: 1.8, textTransform: "uppercase", textAlign: "center" },
  title: { fontSize: 20, fontWeight: 800, letterSpacing: -0.4, textAlign: "center", marginTop: 6 },
  salutation: { fontSize: 10.5, fontWeight: 700, marginTop: 30, marginBottom: 14, letterSpacing: 0.6 },
  para: { lineHeight: 1.5, marginBottom: 12, textAlign: "justify" },
  signBlock: { marginTop: 34, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  forCo: { fontSize: 10, fontWeight: 600 },
  sigWrap: { height: 64, justifyContent: "flex-end", marginTop: 4, flexDirection: "row", alignItems: "flex-end" },
  sig: { height: 56, maxWidth: 190, objectFit: "contain" },
  seal: { width: 76, height: 76, objectFit: "contain", marginLeft: -18, opacity: 0.9 },
  signer: { fontSize: 10.5, fontWeight: 700, marginTop: 6 },
  signerTitle: { fontSize: 9, color: BODY, marginTop: 1 },
  verify: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: SOFT, borderRadius: 10, padding: 10, width: 220 },
  qr: { width: 64, height: 64 },
  verifyTitle: { fontSize: 8.5, fontWeight: 700 },
  verifyText: { fontSize: 7.5, color: BODY, marginTop: 2, lineHeight: 1.4 },
  watermark: { position: "absolute", top: 360, left: 0, right: 0, textAlign: "center", fontSize: 92, fontWeight: 800, letterSpacing: 6, transform: "rotate(-30deg)" },
  footer: { position: "absolute", bottom: 26, left: 56, right: 56, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: BODY, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8 },
});

export function LetterDocument({ l }: { l: LetterPdfData }) {
  const title = KIND_TITLE[l.kind];
  const paras = l.body.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  const mark = l.status === "draft" ? { text: "DRAFT", color: "#f3d27a" } : l.status === "cancelled" ? { text: "CANCELLED", color: "#f4a3a8" } : null;

  return (
    <Document title={`${title} · ${l.full_name}`} author={l.company_name} subject={title} creator={`${l.company_name} Employee Portal`}>
      <Page size="A4" style={s.page}>
        <View style={s.topBar} fixed />
        {mark && <Text style={[s.watermark, { color: mark.color, opacity: 0.45 }]} fixed>{mark.text}</Text>}

        <View style={s.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={LOGO} style={s.logo} />
            <Text style={s.companyLine}>{l.company_name} · Lucknow, Uttar Pradesh, India · rohtremedia.com</Text>
          </View>
          <View style={s.meta}>
            <Text style={s.metaLabel}>Ref. No.</Text>
            <Text style={s.metaValue}>{l.ref_no ?? "Given on issue"}</Text>
            <Text style={s.metaLabel}>Date</Text>
            <Text style={[s.metaValue, { marginBottom: 0 }]}>{l.issue_date ? longDate(l.issue_date) : "Date of issue"}</Text>
          </View>
        </View>

        <View style={s.body}>
          <Text style={s.eyebrow}>{l.company_name}</Text>
          <Text style={s.title}>{title}</Text>

          <Text style={s.salutation}>TO WHOM IT MAY CONCERN</Text>
          {paras.map((p, i) => (
            <Text key={i} style={s.para}>
              {p}
            </Text>
          ))}

          <View style={s.signBlock} wrap={false}>
            <View>
              <Text style={s.forCo}>For {l.company_name}</Text>
              <View style={s.sigWrap}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                {l.signer?.signature && <Image src={l.signer.signature} style={s.sig} />}
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                {l.signer?.seal && <Image src={l.signer.seal} style={s.seal} />}
                {!l.signer?.signature && <Text style={{ color: BODY, fontSize: 9 }}>(signature)</Text>}
              </View>
              <Text style={s.signer}>{l.signer?.name ?? "Authorised signatory"}</Text>
              <Text style={s.signerTitle}>{l.signer?.title ?? ""}</Text>
            </View>

            <View style={s.verify}>
              {l.qr ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image src={l.qr} style={s.qr} />
              ) : (
                <View style={[s.qr, { borderWidth: 1, borderColor: LINE, borderStyle: "dashed", borderRadius: 6 }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.verifyTitle}>Verify this letter</Text>
                <Text style={s.verifyText}>
                  {l.qr ? "Scan the QR code to confirm it was issued by us and is still valid." : "The QR code is added when the letter is issued."}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>{l.company_name} · Lucknow, India</Text>
          <Text>
            {l.full_name} · {l.emp_code}
            {l.ref_no ? ` · ${l.ref_no}` : ""}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
