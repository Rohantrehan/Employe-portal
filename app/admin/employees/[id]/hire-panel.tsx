"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, FilePlus2, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import {
  contractState,
  daysUntil,
  durationText,
  KIND_LABEL,
  PRONOUN_LABEL,
  renderTemplate,
  salaryText,
  type HireKind,
  type Pronoun,
} from "@/lib/letters";
import { deleteLetter, issueLetter } from "./exit-actions";
import { CancelModal, HistoryModal, LetterRow, pdf, type AdminLetter, type LetterEvent } from "./exit-panel";
import { saveHireLetter } from "./hire-actions";

export type HireEmployee = {
  id: string;
  full_name: string;
  emp_code: string;
  designation: string | null;
  department: string | null;
  date_of_joining: string | null;
  basic_salary: number;
  role: "admin" | "employee";
};

type Props = {
  employee: HireEmployee;
  letters: AdminLetter[];
  events: LetterEvent[];
  templates: Record<HireKind, string>;
  company: string;
  hasSignature: boolean;
  today: string;
};

/** "2026-12-01" + 6 months → "2027-05-31" (the day before the same date N months later). */
function endAfter(start: string, months: number) {
  const d = new Date(start + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
const nextDay = (iso: string) => new Date(Date.parse(iso + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);
const monthsBetween = (from: string, to: string) => {
  const a = new Date(from + "T00:00:00Z");
  const b = new Date(nextDay(to) + "T00:00:00Z");
  return Math.max(1, (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()));
};

const STATE_TAG = {
  current: { label: "Current", tone: "success" },
  upcoming: { label: "Upcoming", tone: "info" },
  ended: { label: "Ended", tone: "neutral" },
} as const;

/** Offer letter + employment contracts for one employee (admin). */
export function HirePanel(props: Props) {
  const { employee: emp, letters, events, today } = props;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [modal, setModal] = useState<
    | null
    | { type: "edit"; kind: HireKind; letter: AdminLetter | null }
    | { type: "issue"; letter: AdminLetter }
    | { type: "cancel"; letter: AdminLetter }
    | { type: "history"; letter: AdminLetter }
  >(null);
  const close = () => setModal(null);

  if (emp.role !== "employee") return null;

  const offers = letters.filter((l) => l.kind === "offer");
  const contracts = letters.filter((l) => l.kind === "contract");
  const liveContracts = contracts.filter((l) => l.status !== "cancelled").sort((a, b) => b.date_from.localeCompare(a.date_from));
  const cancelledContracts = contracts.filter((l) => l.status === "cancelled");
  const issued = liveContracts.filter((l) => l.status === "issued");
  const current = issued.find((l) => contractState(l.date_from, l.date_to, today) === "current") ?? null;
  const hasDraft = liveContracts.some((l) => l.status === "draft");
  const issueHint = props.hasSignature ? null : "Add a signature first";

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ?? "Something went wrong");
      toast.success(success);
      after?.();
      router.refresh();
    });

  const rowHandlers = {
    events,
    allowed: true,
    canIssue: props.hasSignature,
    issueHint,
    pending,
    onIssue: (letter: AdminLetter) => setModal({ type: "issue", letter }),
    onCancel: (letter: AdminLetter) => setModal({ type: "cancel", letter }),
    onHistory: (letter: AdminLetter) => setModal({ type: "history", letter }),
    onDelete: (letter: AdminLetter) => run(() => deleteLetter(letter.id, emp.id), "Draft deleted"),
  };

  const endsIn = current?.date_to ? daysUntil(today, current.date_to) : null;

  return (
    <Card>
      <CardHeader
        title="Offer & contract"
        description="Signed letters with a QR check, made from your templates in Settings. The employee sees them under Documents."
        action={
          <Button size="sm" variant="secondary" onClick={() => setModal({ type: "edit", kind: "contract", letter: null })} disabled={hasDraft} title={hasDraft ? "Finish the draft contract first" : undefined}>
            <FilePlus2 className="h-3.5 w-3.5" /> {issued.length ? "Renew contract" : "New contract"}
          </Button>
        }
      />

      {current ? (
        <div className={cn("mx-5 mb-2 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl px-4 py-3 text-sm sm:mx-6", endsIn != null && endsIn <= 30 ? "bg-warning-tint" : "bg-soft")}>
          <span>
            <span className="text-body">Current contract </span>
            <b className="text-ink">
              {formatDate(current.date_from)} – {formatDate(current.date_to)}
            </b>
          </span>
          <span>
            <span className="text-body">Salary </span>
            <b className="text-ink">{salaryText(current.salary)}/month</b>
          </span>
          <span className={cn("font-semibold", endsIn != null && endsIn <= 30 ? "text-warning" : "text-ink")}>
            {endsIn === 0 ? "Ends today" : `Ends in ${endsIn} day${endsIn === 1 ? "" : "s"}`}
          </span>
        </div>
      ) : (
        issued.length === 0 && <p className="mx-5 mb-2 text-sm text-body sm:mx-6">No contract issued yet.</p>
      )}

      {!props.hasSignature && (
        <p className="mx-5 mt-2 rounded-2xl bg-warning-tint px-4 py-3 text-sm text-warning sm:mx-6">
          No signature yet. Add one in{" "}
          <Link href="/admin/settings#letters" className="font-semibold underline">
            Settings → Letters & signature
          </Link>{" "}
          before issuing.
        </p>
      )}

      <ul className="divide-y divide-line border-t border-line">
        <LetterRow kind="offer" all={offers} {...rowHandlers} onPrepare={(letter) => setModal({ type: "edit", kind: "offer", letter })} />
        {liveContracts.map((c) => {
          const st = c.status === "issued" ? STATE_TAG[contractState(c.date_from, c.date_to, today)] : null;
          return (
            <LetterRow
              key={c.id}
              kind="contract"
              all={[c]}
              title="Contract"
              note={`${formatDate(c.date_from)} – ${formatDate(c.date_to)}`}
              tag={st && <Badge tone={st.tone}>{st.label}</Badge>}
              {...rowHandlers}
              onPrepare={(letter) => setModal({ type: "edit", kind: "contract", letter })}
            />
          );
        })}
        {cancelledContracts.length > 0 && (
          <LetterRow
            kind="contract"
            all={cancelledContracts}
            title="Cancelled contracts"
            emptyText={`${cancelledContracts.length} cancelled`}
            canPrepare={false}
            {...rowHandlers}
            onPrepare={() => undefined}
          />
        )}
      </ul>

      {modal?.type === "edit" && (
        <HireEditor
          emp={emp}
          kind={modal.kind}
          letter={modal.letter}
          latest={issued[0] ?? null}
          offer={offers.find((o) => o.status !== "cancelled") ?? null}
          template={props.templates[modal.kind]}
          company={props.company}
          today={today}
          onClose={close}
        />
      )}
      {modal?.type === "issue" && (
        <Modal
          open
          onClose={close}
          title={`Issue the ${KIND_LABEL[modal.letter.kind].toLowerCase()}?`}
          description="It gets a reference number, today's date and your current signature. After this the text can't be changed (only cancelled)."
          footer={
            <>
              <Button variant="secondary" onClick={close}>
                Not yet
              </Button>
              <Button loading={pending} onClick={() => run(() => issueLetter(modal.letter.id, emp.id), "Issued", close)}>
                <Send className="h-4 w-4" /> Issue
              </Button>
            </>
          }
        >
          <ul className="space-y-2 text-sm text-body">
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {emp.full_name} can view and download it under Documents.
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> The QR code on it starts working (it never shows the salary).
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Check the preview first if you haven&apos;t.{" "}
              <a href={pdf(modal.letter.id, true)} target="_blank" rel="noopener" className="font-semibold text-brand underline">
                Open preview
              </a>
            </li>
          </ul>
        </Modal>
      )}
      {modal?.type === "cancel" && <CancelModal letter={modal.letter} employeeId={emp.id} onClose={close} />}
      {modal?.type === "history" && <HistoryModal letter={modal.letter} events={events.filter((e) => e.letter_id === modal.letter.id)} onClose={close} />}
    </Card>
  );
}

function HireEditor({
  emp,
  kind,
  letter,
  latest,
  offer,
  template,
  company,
  today,
  onClose,
}: {
  emp: HireEmployee;
  kind: HireKind;
  letter: AdminLetter | null;
  latest: AdminLetter | null;
  offer: AdminLetter | null;
  template: string;
  company: string;
  today: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Sensible starting values: a renewal continues the latest contract with the same length.
  const initial = (() => {
    if (letter) {
      return { designation: letter.designation, department: letter.department ?? "", from: letter.date_from, to: letter.date_to ?? "", salary: String(letter.salary ?? ""), pronoun: letter.pronoun };
    }
    const base = { designation: emp.designation ?? "", department: emp.department ?? "", pronoun: "they" as Pronoun };
    const salary = String(latest?.salary ?? offer?.salary ?? (emp.basic_salary > 0 ? emp.basic_salary : ""));
    if (kind === "offer") return { ...base, from: emp.date_of_joining ?? today, to: "", salary };
    if (latest?.date_to) {
      const from = nextDay(latest.date_to);
      return { ...base, designation: latest.designation, department: latest.department ?? "", pronoun: latest.pronoun, from, to: endAfter(from, monthsBetween(latest.date_from, latest.date_to)), salary };
    }
    const from = offer?.date_from ?? emp.date_of_joining ?? today;
    return { ...base, from, to: endAfter(from, 6), salary };
  })();
  const [v, setV] = useState(initial);
  const salaryNum = Number(v.salary) || null;

  const rendered = useMemo(
    () =>
      renderTemplate(template, {
        name: emp.full_name,
        emp_code: emp.emp_code,
        designation: v.designation,
        department: v.department,
        company,
        from: v.from,
        to: v.to || null,
        conduct: null,
        pronoun: v.pronoun,
        salary: salaryNum,
      }),
    [template, emp, company, v, salaryNum],
  );
  const [touched, setTouched] = useState(!!letter);
  const [body, setBody] = useState(letter?.body ?? rendered);
  useEffect(() => {
    if (!touched) setBody(rendered);
  }, [rendered, touched]);

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await saveHireLetter({ id: letter?.id ?? null, employeeId: emp.id, kind, ...v, body });
      if (!res.ok) return setError(res.error);
      toast.success("Draft saved", {
        action: res.data ? { label: "Preview", onClick: () => window.open(pdf(res.data!.id, true), "_blank", "noopener") } : undefined,
      });
      onClose();
      router.refresh();
    });

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  const term = (months: number) => setV({ ...v, to: endAfter(v.from, months) });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${letter ? "Edit" : kind === "contract" && latest ? "Renew" : "Prepare"} ${KIND_LABEL[kind].toLowerCase()}`}
      description={`${emp.full_name} · ${emp.emp_code}. Saved as a draft: preview the PDF before you issue it.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            Save draft
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p role="alert" className="animate-pop rounded-2xl bg-tint-2 px-4 py-3 text-sm font-medium text-brand">
            {error}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Position" value={v.designation} onChange={set("designation")} maxLength={120} required />
          <Input label="Department" value={v.department} onChange={set("department")} maxLength={120} />
          <Input label={kind === "offer" ? "Joining date" : "Start date"} type="date" value={v.from} onChange={set("from")} required />
          <Input
            label={kind === "offer" ? "Contract ends (optional)" : "End date"}
            type="date"
            value={v.to}
            min={v.from}
            onChange={set("to")}
            required={kind === "contract"}
            hint={v.to && v.from && v.to >= v.from ? durationText(v.from, v.to, true) : undefined}
          />
          <Input
            label="Monthly salary (₹)"
            type="number"
            inputMode="numeric"
            min={1}
            step="1"
            value={v.salary}
            onChange={set("salary")}
            required
            hint={salaryNum ? salaryText(salaryNum) + " a month" : undefined}
          />
          <Select label="Refer to them as" value={v.pronoun} onChange={set("pronoun")}>
            {Object.entries(PRONOUN_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        {kind === "contract" && v.from && (
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-body">Length:</span>
            {[3, 6, 12].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => term(m)}
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1 font-semibold",
                  v.to === endAfter(v.from, m) ? "border-ink bg-ink text-white" : "border-line text-ink hover:bg-soft",
                )}
              >
                {m === 12 ? "1 year" : `${m} months`}
              </button>
            ))}
          </div>
        )}
        {kind === "contract" && latest && (
          <p className="rounded-2xl bg-soft px-4 py-2.5 text-[13px] text-body">
            When this is issued, the unused paid leave from the earlier contract carries over to it automatically.
          </p>
        )}
        <div>
          <Textarea
            label="Letter text"
            rows={9}
            value={body}
            maxLength={5000}
            onChange={(e) => {
              setTouched(true);
              setBody(e.target.value);
            }}
            hint={touched ? "Edited by hand. Field changes above no longer update the text." : "Filled in from your template in Settings. Edit freely; leave a blank line between paragraphs."}
          />
          {touched && (
            <button
              type="button"
              onClick={() => {
                setTouched(false);
                setBody(rendered);
              }}
              className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-brand"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset to template
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
