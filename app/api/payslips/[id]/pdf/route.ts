import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { PayslipDocument, type PayslipData } from "@/lib/pdf/payslip-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Payslip PDF, generated on demand so it always matches the data.
 * Access is enforced by RLS: employees can read only their own PUBLISHED
 * slips; admins can read all (including drafts, watermarked as DRAFT).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const { data: slip } = await supabase
    .from("payslips")
    .select(
      "id, month, working_days, present_days, leave_days, overtime_hours, basic_salary, performance_bonus, extra_pay, net_pay, status, payment_status, paid_on, payment_ref, published_at, profiles!payslips_employee_id_fkey(full_name, emp_code, email, designation, date_of_joining, departments(name))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!slip) return new NextResponse("Payslip not found", { status: 404 });

  const prof = slip.profiles as unknown as {
    full_name: string;
    emp_code: string;
    email: string;
    designation: string | null;
    date_of_joining: string | null;
    departments: { name: string } | null;
  };

  const data: PayslipData = {
    ...slip,
    working_days: Number(slip.working_days),
    present_days: Number(slip.present_days),
    leave_days: Number(slip.leave_days),
    overtime_hours: Number(slip.overtime_hours),
    basic_salary: Number(slip.basic_salary),
    performance_bonus: Number(slip.performance_bonus),
    extra_pay: Number(slip.extra_pay),
    net_pay: Number(slip.net_pay),
    employee: {
      full_name: prof.full_name,
      emp_code: prof.emp_code,
      email: prof.email,
      designation: prof.designation,
      date_of_joining: prof.date_of_joining,
      department: prof.departments?.name ?? null,
    },
  };

  const pdf = await renderToBuffer(PayslipDocument({ p: data }));
  const filename = `Payslip-${data.month.slice(0, 7)}-${data.employee.emp_code}.pdf`;
  const inline = request.nextUrl.searchParams.get("view") === "1";

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
