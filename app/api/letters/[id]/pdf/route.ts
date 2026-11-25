import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUrl, type LetterKind, type LetterStatus } from "@/lib/letters";
import { LetterDocument } from "@/lib/pdf/letter-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Img = { data: Buffer; format: "png" | "jpg" };

async function loadImage(path: string | null): Promise<Img | null> {
  if (!path) return null;
  const { data } = await createAdminClient().storage.from("letter-assets").download(path);
  if (!data) return null;
  return { data: Buffer.from(await data.arrayBuffer()), format: path.endsWith(".png") ? "png" : "jpg" };
}

/**
 * Letter PDF (offer, contract, experience, relieving), rendered on demand from the frozen letter text.
 * Who can read the letter is decided by RLS (admin: all; employee: own, not drafts).
 * The signature images are private, so they are fetched with the service key only
 * after RLS has returned the letter. Every non-draft download is logged.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const uid = auth?.claims?.sub;
  if (!uid) return NextResponse.redirect(new URL("/login", request.url));

  const { data: l } = await supabase
    .from("letters")
    .select("id, employee_id, kind, status, ref_no, issue_date, full_name, emp_code, designation, department, date_from, date_to, salary, company_name, body, cancelled_at, signature_id, verify_code")
    .eq("id", id)
    .maybeSingle();
  if (!l) return new NextResponse("Letter not found", { status: 404 });

  if (l.employee_id === uid) {
    if (l.status !== "issued") return new NextResponse("This letter was cancelled. Please contact the company.", { status: 410 });
    const { data: me } = await supabase.from("profiles").select("is_active, former_access").eq("id", uid).single();
    if (!me?.is_active && !me?.former_access) return new NextResponse("Not allowed", { status: 403 });
  }

  const admin = createAdminClient();
  const sigQuery = admin.from("letter_signatures").select("signer_name, signer_title, signature_path, seal_path");
  const { data: sig } = await (l.signature_id ? sigQuery.eq("id", l.signature_id) : sigQuery.is("retired_at", null)).maybeSingle();
  const [signature, seal] = await Promise.all([loadImage(sig?.signature_path ?? null), loadImage(sig?.seal_path ?? null)]);

  const origin = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const url = l.status === "draft" ? null : verifyUrl(origin, l.verify_code);
  const qr: Img | null = url ? { data: await QRCode.toBuffer(url, { margin: 0, width: 300, errorCorrectionLevel: "M" }), format: "png" } : null;

  const pdf = await renderToBuffer(
    LetterDocument({
      l: {
        kind: l.kind as LetterKind,
        status: l.status as LetterStatus,
        ref_no: l.ref_no,
        issue_date: l.issue_date,
        full_name: l.full_name,
        emp_code: l.emp_code,
        designation: l.designation,
        department: l.department,
        date_from: l.date_from,
        date_to: l.date_to,
        salary: l.salary == null ? null : Number(l.salary),
        company_name: l.company_name,
        body: l.body,
        cancelled_at: l.cancelled_at,
        signer: sig ? { name: sig.signer_name, title: sig.signer_title, signature, seal } : null,
        qr,
        verifyUrl: url,
      },
    }),
  );

  const inline = request.nextUrl.searchParams.get("view") === "1";
  if (l.status !== "draft") await supabase.rpc("log_letter_event", { p_letter: l.id, p_event: inline ? "view" : "download" });

  const kind = { experience: "Experience-Letter", relieving: "Relieving-Letter", offer: "Offer-Letter", contract: "Employment-Contract" }[l.kind as LetterKind] ?? "Letter";
  const filename = `${kind}-${l.emp_code}${l.status === "draft" ? "-DRAFT" : ""}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
