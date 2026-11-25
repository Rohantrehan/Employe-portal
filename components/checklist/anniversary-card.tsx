"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { answerMilestone } from "@/app/app/setup/actions";
import { LINKEDIN_POST_URL, yearsText } from "@/lib/checklists";

/**
 * Work anniversary nudge. On the day: "post about it on LinkedIn". From the next
 * day: "Have you posted?" with an optional link. Nothing is checked, it's a reminder.
 */
export function AnniversaryCard({ years, daysSince, company }: { years: number; daysSince: number; company: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(daysSince > 0);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const answer = (posted: boolean) =>
    start(async () => {
      setError(null);
      const r = await answerMilestone({ years, posted, url: posted ? url : "" });
      if (!r.ok) return void setError(r.error);
      toast.success(posted ? "Thanks for sharing it!" : "Okay, we won't ask again");
      router.refresh();
    });

  const title =
    daysSince === 0
      ? `You complete ${yearsText(years)} at ${company} today!`
      : `Have you posted about your ${yearsText(years)} at ${company}?`;

  return (
    <section aria-label="Work anniversary" className="animate-enter relative mt-6 overflow-hidden rounded-[24px] border border-line bg-white p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-tint blur-2xl" aria-hidden />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white">
          <PartyPopper className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold tracking-[-0.01em] text-ink">{title}</h2>
          <p className="mt-1 text-sm text-body">
            {daysSince === 0
              ? "Congratulations! Share a short post on LinkedIn about what you worked on and learned this year. It keeps your profile fresh for your career."
              : "A short post about what you worked on and learned keeps your LinkedIn fresh. If you've posted, you can paste the link (optional)."}
          </p>

          {!asking ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={LINKEDIN_POST_URL} target="_blank" rel="noopener noreferrer" className="btn-primary h-10">
                Write a LinkedIn post <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <Button variant="secondary" onClick={() => setAsking(true)}>
                I&apos;ve posted
              </Button>
            </div>
          ) : (
            <form
              className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start"
              onSubmit={(e) => {
                e.preventDefault();
                answer(true);
              }}
            >
              <div className="min-w-0 flex-1">
                <input
                  aria-label="Link to your post (optional)"
                  placeholder="Link to your post (optional)"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  maxLength={500}
                  inputMode="url"
                  className="h-10 w-full rounded-2xl border border-line bg-white px-4 text-sm text-ink outline-none transition placeholder:text-body/60 focus:border-brand focus:ring-4 focus:ring-tint"
                />
                {error && <p className="mt-1.5 text-[13px] font-medium text-brand">{error}</p>}
              </div>
              <div className="flex gap-2">
                <Button type="submit" loading={pending}>
                  Yes, I posted
                </Button>
                {daysSince > 0 && (
                  <Button variant="ghost" disabled={pending} onClick={() => answer(false)}>
                    No, skip
                  </Button>
                )}
              </div>
            </form>
          )}
          {asking && daysSince > 0 && (
            <a href={LINKEDIN_POST_URL} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-body hover:text-ink">
              Not yet? Write it now <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
