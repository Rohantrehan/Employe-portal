import "server-only";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDate } from "@/lib/format";
import { amountInWords, formatRs, monthTitle, multiplierText, ratingInfo } from "@/lib/payroll";
import { BODY, BRAND, INK, LINE, LOGO, SOFT, TINT } from "./brand";

const s = StyleSheet.create({
  page: { fontFamily: "Jakarta", fontSize: 9.5, color: INK, paddingTop: 0, paddingBottom: 56, paddingHorizontal: 0 },
  topBar: { height: 6, backgroundColor: BRAND },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 40, paddingTop: 28, paddingBottom: 20 },
  logo: { width: 128, height: 34, objectFit: "contain" },
  companyLine: { fontSize: 8.5, color: BODY, marginTop: 6 },
  titleBlock: { alignItems: "flex-end" },
  eyebrow: { fontSize: 8, fontWeight: 700, color: BRAND, letterSpacing: 1.6, textTransform: "uppercase" },
  title: { fontSize: 20, fontWeight: 800, letterSpacing: -0.4, marginTop: 4 },
  status: { marginTop: 6, fontSize: 8, fontWeight: 700, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999 },
  body: { paddingHorizontal: 40 },
  card: { borderWidth: 1, borderColor: LINE, borderRadius: 12, padding: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "50%", paddingVertical: 4 },
  label: { fontSize: 7.5, color: BODY, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase" },
  value: { fontSize: 10, fontWeight: 600, marginTop: 2 },
  sectionTitle: { fontSize: 8, fontWeight: 700, color: BODY, letterSpacing: 1.2, textTransform: "uppercase", marginTop: 22, marginBottom: 8 },
  statRow: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, backgroundColor: SOFT, borderRadius: 10, padding: 10, alignItems: "center" },
  statValue: { fontSize: 14, fontWeight: 800, marginTop: 3 },
  table: { borderWidth: 1, borderColor: LINE, borderRadius: 12 },
  tr: { flexDirection: "row", paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: LINE },
  th: { backgroundColor: SOFT, paddingVertical: 8 },
  tdLeft: { flex: 1 },
  tdRight: { width: 140, textAlign: "right" },
  net: { flexDirection: "row", alignItems: "center", backgroundColor: INK, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, marginTop: 14 },
  netLabel: { color: "#ffffff", fontSize: 10, fontWeight: 700, flex: 1 },
  netValue: { color: "#ffffff", fontSize: 18, fontWeight: 800 },
  words: { marginTop: 8, fontSize: 9, color: BODY },
  footer: { position: "absolute", bottom: 22, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: BODY, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8 },
});

export type PayslipData = {
  id: string;
  month: string;
  working_days: number;
  present_days: number;
  leave_days: number;
  overtime_hours: number;
  basic_salary: number;
  late_days: number;
  excellence_bonus: number;
  rating: number | null;
  performance_bonus: number;
  night_shift_pay: number;
  remarks: string | null;
  net_pay: number;
  status: "draft" | "published";
  payment_status: "pending" | "paid";
  paid_on: string | null;
  payment_ref: string | null;
  published_at: string | null;
  employee: {
    full_name: string;
    emp_code: string;
    email: string;
    designation: string | null;
    department: string | null;
    date_of_joining: string | null;
  };
};

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function PayslipDocument({ p }: { p: PayslipData }) {
  const period = monthTitle(p.month);
  const isDraft = p.status === "draft";
  const paid = p.payment_status === "paid";
  const r = ratingInfo(p.rating);
  const negative = Number(p.performance_bonus) < 0;
  const perfLabel = (negative ? "Performance Adjustment" : "Performance Bonus") + (r ? ` (rating ${r.value}/5 · ${multiplierText(r.multiplier)})` : "");
  const earnings: [string, number][] = [
    ["Basic Salary", p.basic_salary],
    ["Excellence Bonus", p.excellence_bonus],
    [perfLabel, p.performance_bonus],
    ["Night Shift Pay", p.night_shift_pay],
  ];

  return (
    <Document title={`Payslip ${period} · ${p.employee.full_name}`} author="RohTre Media" subject={`Payslip for ${period}`} creator="RohTre Media Employee Portal">
      <Page size="A4" style={s.page}>
        <View style={s.topBar} fixed />

        <View style={s.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={LOGO} style={s.logo} />
            <Text style={s.companyLine}>RohTre Media · Lucknow, India · rohtremedia.com</Text>
          </View>
          <View style={s.titleBlock}>
            <Text style={s.eyebrow}>Payslip</Text>
            <Text style={s.title}>{period}</Text>
            <Text
              style={[
                s.status,
                isDraft ? { backgroundColor: "#fef3c7", color: "#b45309" } : paid ? { backgroundColor: "#e8f5ec", color: "#15803d" } : { backgroundColor: TINT, color: BRAND },
              ]}
            >
              {isDraft ? "DRAFT · NOT FINAL" : paid ? `PAID ON ${formatDate(p.paid_on).toUpperCase()}` : "PAYMENT PENDING"}
            </Text>
          </View>
        </View>

        <View style={s.body}>
          <View style={s.card}>
            <View style={s.grid}>
              {[
                ["Employee name", p.employee.full_name],
                ["Employee code", p.employee.emp_code],
                ["Designation", p.employee.designation ?? "—"],
                ["Department", p.employee.department ?? "—"],
                ["Date of joining", formatDate(p.employee.date_of_joining)],
                ["Email", p.employee.email],
              ].map(([k, v]) => (
                <View key={k} style={s.cell}>
                  <Text style={s.label}>{k}</Text>
                  <Text style={s.value}>{v}</Text>
                </View>
              ))}
            </View>
          </View>

          <Text style={s.sectionTitle}>Attendance summary</Text>
          <View style={s.statRow}>
            {[
              ["Working days", num(Number(p.working_days))],
              ["Days present", num(Number(p.present_days))],
              ["Leave days", num(Number(p.leave_days))],
              ["Late days", String(p.late_days)],
              ["Extra hours", num(Number(p.overtime_hours))],
            ].map(([k, v]) => (
              <View key={k} style={s.stat}>
                <Text style={s.label}>{k}</Text>
                <Text style={s.statValue}>{v}</Text>
              </View>
            ))}
          </View>

          <Text style={s.sectionTitle}>Earnings</Text>
          <View style={s.table}>
            <View style={[s.tr, s.th]}>
              <Text style={[s.tdLeft, s.label]}>Component</Text>
              <Text style={[s.tdRight, s.label]}>Amount</Text>
            </View>
            {earnings.map(([k, v], i) => (
              <View key={k} style={[s.tr, i === earnings.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                <Text style={[s.tdLeft, { fontWeight: 600 }]}>{k}</Text>
                <Text style={[s.tdRight, { fontWeight: 600 }, v < 0 ? { color: BRAND } : {}]}>{formatRs(v)}</Text>
              </View>
            ))}
          </View>

          <View style={s.net}>
            <Text style={s.netLabel}>NET PAY</Text>
            <Text style={s.netValue}>{formatRs(p.net_pay)}</Text>
          </View>
          <Text style={s.words}>{amountInWords(Number(p.net_pay))}</Text>

          {paid && p.payment_ref && (
            <Text style={[s.words, { marginTop: 4 }]}>Payment reference: {p.payment_ref}</Text>
          )}
          {p.remarks && (
            <>
              <Text style={s.sectionTitle}>Remarks</Text>
              <View style={[s.card, { backgroundColor: SOFT, borderColor: SOFT }]}>
                <Text style={{ fontSize: 9.5, lineHeight: 1.5 }}>{p.remarks}</Text>
              </View>
            </>
          )}
          <Text style={[s.words, { marginTop: 18, fontSize: 8 }]}>
            {r ? "Performance bonus = (Basic + Excellence Bonus) × (rating multiplier − 1). " : ""}
            This is a computer-generated payslip and does not require a signature.
          </Text>
        </View>

        <View style={s.footer} fixed>
          <Text>RohTre Media · Lucknow, India</Text>
          <Text>Payslip ID {p.id.slice(0, 8).toUpperCase()}</Text>
        </View>
      </Page>
    </Document>
  );
}
