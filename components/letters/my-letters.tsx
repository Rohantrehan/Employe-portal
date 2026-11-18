import { Ban, Download, Eye, FileBadge2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { KIND_LABEL, type LetterKind, type LetterStatus } from "@/lib/letters";

export type MyLetter = { id: string; kind: LetterKind; status: LetterStatus; ref_no: string | null; issue_date: string | null; cancelled_at: string | null };

/** Employee's own letters (RLS never returns drafts). */
export function MyLetters({ letters, className }: { letters: MyLetter[]; className?: string }) {
  if (!letters.length) return null;
  const pdf = (id: string, view = false) => `/api/letters/${id}/pdf${view ? "?view=1" : ""}`;
  return (
    <Card className={className}>
      <CardHeader title="Letters" description="Signed by the company. Each one has a QR code that anyone can scan to check it's real." />
      <ul className="divide-y divide-line">
        {letters.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${l.status === "issued" ? "bg-tint text-brand" : "bg-grey-tile text-body"}`}>
              {l.status === "issued" ? <FileBadge2 className="h-5 w-5" /> : <Ban className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1 basis-[160px]">
              <p className="font-semibold text-ink">{KIND_LABEL[l.kind]}</p>
              <p className="mt-0.5 text-sm text-body">
                <span className="whitespace-nowrap">{l.ref_no}</span> · <span className="whitespace-nowrap">issued {formatDate(l.issue_date)}</span>
              </p>
            </div>
            {l.status === "issued" ? (
              <div className="flex w-full gap-2 sm:w-auto [&>a]:flex-1 sm:[&>a]:flex-none">
                <a href={pdf(l.id, true)} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>
                  <Eye className="h-3.5 w-3.5" /> View
                </a>
                <a href={pdf(l.id)} className={buttonClass("primary", "sm")}>
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              </div>
            ) : (
              <Badge>Cancelled {formatDate(l.cancelled_at)}</Badge>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
