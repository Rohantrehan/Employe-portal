import { CalendarDays, Clock3, FileText, Plane, Radio, Timer } from "lucide-react";
import { Wordmark } from "@/components/ui/logo";

const PILLS = [
  { icon: Clock3, label: "Clock in", pos: "left-[8%] top-[16%]" },
  { icon: Plane, label: "Leave balance", pos: "right-[10%] top-[24%]" },
  { icon: Radio, label: "Team today", pos: "left-[14%] top-[50%]" },
  { icon: CalendarDays, label: "Holidays", pos: "right-[8%] top-[58%]" },
  { icon: Timer, label: "Extra hours", pos: "left-[22%] bottom-[14%]" },
  { icon: FileText, label: "Payslips", pos: "right-[18%] bottom-[10%]" },
];

/** Two-column frame used by the login and change-password pages (same as the reference login). */
export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-2">
      <div className="flex flex-col px-4 sm:px-10">
        <div className="mx-auto my-auto w-full max-w-[400px] py-12">
          <Wordmark tone="black" height={30} className="animate-enter" />
          {children}
        </div>
      </div>

      <div
        className="relative hidden overflow-hidden bg-[linear-gradient(160deg,#fff4f4_0%,#fbe6e7_55%,#f7d5d8_100%)] lg:block"
        aria-hidden
      >
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-ink/60">Employee portal</p>
            <p className="mt-3 text-[40px] font-extrabold leading-[1.05] tracking-[-0.035em] text-ink">
              Your whole workday,
              <br />
              in one <span className="text-brand">clear view.</span>
            </p>
          </div>
        </div>
        {PILLS.map(({ icon: Icon, label, pos }, i) => (
          <span
            key={label}
            className={`animate-float absolute ${pos} flex items-center gap-2.5 rounded-full border border-white bg-white/85 px-4 py-2.5 text-sm font-semibold text-ink shadow-pop backdrop-blur`}
            style={{ animationDelay: `${i * 0.6}s` }}
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-tint text-brand">
              <Icon className="h-4 w-4" />
            </span>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
