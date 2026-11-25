import type { Metadata } from "next";
import { BadgeCheck, CircleX, SearchX } from "lucide-react";
import { Wordmark } from "@/components/ui/logo";
import { createClient } from "@/lib/supabase/server";
import { KIND_LABEL, longDate, type LetterKind } from "@/lib/letters";

export const metadata: Metadata = { title: "Verify a letter", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Result = {
  status: "issued" | "cancelled";
  kind: LetterKind;
  ref_no: string;
  name: string;
  emp_code: string;
  designation: string;
  company: string;
  from: string;
  to: string | null;
  issue_date: string;
  cancelled_on: string | null;
};

/** Public page behind the QR code on every letter. Shows only what identifies the letter (never the salary). */
export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();
  const { data } = /^[0-9a-f]{32}$/.test(code) ? await supabase.rpc("verify_letter", { p_code: code }) : { data: null };
  const r = data as Result | null;
  const valid = r?.status === "issued";

  return (
    <main className="grid min-h-screen place-items-center bg-app px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Wordmark height={26} />
        </div>
        <div className="card animate-pop overflow-hidden">
          <div className={`flex items-center gap-3 px-6 py-5 ${!r ? "bg-grey-tile" : valid ? "bg-success-tint" : "bg-tint"}`}>
            {!r ? <SearchX className="h-7 w-7 text-body" /> : valid ? <BadgeCheck className="h-7 w-7 text-success" /> : <CircleX className="h-7 w-7 text-brand" />}
            <div>
              <h1 className="text-lg font-extrabold tracking-[-0.02em] text-ink">
                {!r ? "Letter not found" : valid ? "This letter is genuine" : "This letter was cancelled"}
              </h1>
              <p className="text-sm text-body">
                {!r
                  ? "We have no letter with this code. It may be fake, or the link was copied wrongly."
                  : valid
                    ? `Issued by ${r.company} and still valid.`
                    : `${r.company} cancelled it on ${longDate(r.cancelled_on)}. It should not be accepted.`}
              </p>
            </div>
          </div>
          {r && (
            <dl className="divide-y divide-line px-6 text-sm">
              {[
                ["Letter", KIND_LABEL[r.kind]],
                ["Reference", r.ref_no],
                ["Name", `${r.name} (${r.emp_code})`],
                ["Designation", r.designation],
                r.kind === "offer"
                  ? ["Joining date", longDate(r.from)]
                  : r.kind === "contract"
                    ? ["Contract term", `${longDate(r.from)} to ${longDate(r.to)}`]
                    : ["Worked", `${longDate(r.from)} to ${longDate(r.to)}`],
                ["Issued on", longDate(r.issue_date)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-3">
                  <dt className="text-body">{k}</dt>
                  <dd className="text-right font-semibold text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <p className="mt-5 text-center text-[13px] text-body">
          Check that the details above match the paper copy you were given.
        </p>
      </div>
    </main>
  );
}
