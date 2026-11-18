"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ban,
  Check,
  Copy,
  Download,
  Eye,
  FileBadge2,
  FilePlus2,
  History,
  LogOut,
  Pencil,
  RotateCcw,
  Send,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import {
  CONDUCT_LABEL,
  KIND_LABEL,
  PRONOUN_LABEL,
  REASON_LABEL,
  renderTemplate,
  verifyUrl,
  type Conduct,
  type ExitReason,
  type LetterKind,
  type LetterStatus,
  type Pronoun,
} from "@/lib/letters";
import { monthTitle } from "@/lib/payroll";
import { cancelLetter, deleteLetter, issueLetter, recordExit, saveLetter, setFormerAccess, undoExit } from "./exit-actions";

export type ExitInfo = { last_day: string; reason: ExitReason; conduct: Conduct; letters_allowed: boolean; note: string | null };
export type AdminLetter = {
  id: string;
  kind: LetterKind;
  status: LetterStatus;
  ref_no: string | null;
  issue_date: string | null;
  designation: string;
  department: string | null;
  date_from: string;
  date_to: string;
  conduct: Conduct | null;
  pronoun: Pronoun;
  body: string;
  verify_code: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
};
export type LetterEvent = { letter_id: string; event: "download" | "view" | "verify"; created_at: string; actor: string | null };
export type FinalPayslip = { month: string; status: "draft" | "published" | null; payment_status: "pending" | "paid" | null };
export type ExitEmployee = {
  id: string;
  full_name: string;
  emp_code: string;
  designation: string | null;
  department: string | null;
  date_of_joining: string | null;
  role: "admin" | "employee";
  left_on: string | null;
  former_access: boolean;
};

type Props = {
  employee: ExitEmployee;
  exit: ExitInfo | null;
  letters: AdminLetter[];
  events: LetterEvent[];
  templates: Record<LetterKind, string>;
  company: string;
  hasSignature: boolean;
  finalPayslip: FinalPayslip | null;
  today: string;
};

const KINDS: LetterKind[] = ["experience", "relieving"];
const pdf = (id: string, view = false) => `/api/letters/${id}/pdf${view ? "?view=1" : ""}`;

export function ExitPanel(props: Props) {
  const { employee: emp, exit, letters, events, today } = props;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [modal, setModal] = useState<
    | null
    | { type: "exit" }
    | { type: "undo" }
    | { type: "letter"; kind: LetterKind; letter: AdminLetter | null }
    | { type: "issue"; letter: AdminLetter }
    | { type: "cancel"; letter: AdminLetter }
    | { type: "history"; letter: AdminLetter }
  >(null);
  const close = () => setModal(null);

  const left = !!exit && exit.last_day < today;
  const canIssue = !!exit && exit.last_day <= today;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ?? "Something went wrong");
      toast.success(success);
      after?.();
      router.refresh();
    });

  if (emp.role !== "employee") {
    return (
      <Card>
        <CardHeader title="Exit & letters" />
        <CardBody>
          <p className="text-sm text-body">Admins can&apos;t be marked as left. Change the role to Employee first.</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Exit & letters"
        description={exit ? undefined : "Record when this person leaves. Their experience and relieving letters unlock from the last working day."}
        action={
          exit ? (
            left ? (
              <Badge>Left on {formatDate(exit.last_day)}</Badge>
            ) : (
              <Badge tone="warning" dot>
                Leaving on {formatDate(exit.last_day)}
              </Badge>
            )
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setModal({ type: "exit" })}>
              <LogOut className="h-3.5 w-3.5" /> Mark as leaving
            </Button>
          )
        }
      />

      {exit && (
        <>
          <CardBody className="space-y-5">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {[
                ["Last working day", formatDate(exit.last_day)],
                ["Reason", REASON_LABEL[exit.reason]],
                ["Conduct", CONDUCT_LABEL[exit.conduct]],
                ["Experience letter", exit.letters_allowed ? "Allowed" : "Not allowed"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 sm:block">
                  <dt className="text-body">{k}</dt>
                  <dd className="font-semibold text-ink">{v}</dd>
                </div>
              ))}
              {exit.note && (
                <div className="sm:col-span-2">
                  <dt className="text-body">Note (only admins see this)</dt>
                  <dd className="mt-0.5 whitespace-pre-line text-ink">{exit.note}</dd>
                </div>
              )}
            </dl>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line px-4 py-3 hover:bg-soft">
              <input
                type="checkbox"
                className="mt-1 accent-[#d4000f]"
                checked={emp.former_access}
                disabled={pending}
                onChange={(e) => run(() => setFormerAccess(emp.id, e.target.checked), e.target.checked ? "Documents login turned on" : "Documents login turned off")}
              />
              <span>
                <span className="block text-sm font-semibold text-ink">Documents login after leaving</span>
                <span className="block text-[13px] text-body">
                  {emp.former_access
                    ? "They can log in to download only their letters and payslips. Everything else is locked."
                    : "They can't log in. Download the letters here and send them yourself."}
                </span>
              </span>
            </label>

            {props.finalPayslip && <FinalPayslipRow p={props.finalPayslip} />}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setModal({ type: "exit" })}>
                <Pencil className="h-3.5 w-3.5" /> Edit exit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setModal({ type: "undo" })}>
                <RotateCcw className="h-3.5 w-3.5" /> Undo exit
              </Button>
            </div>
          </CardBody>

          <div className="border-t border-line">
            {!props.hasSignature && (
              <p className="mx-5 mt-4 rounded-2xl bg-warning-tint px-4 py-3 text-sm text-warning sm:mx-6">
                No signature yet. Add one in{" "}
                <Link href="/admin/settings#letters" className="font-semibold underline">
                  Settings → Letters & signature
                </Link>{" "}
                before issuing letters.
              </p>
            )}
            <ul className="divide-y divide-line">
              {KINDS.map((kind) => (
                <LetterRow
                  key={kind}
                  kind={kind}
                  all={letters.filter((l) => l.kind === kind)}
                  events={events}
                  allowed={kind === "relieving" || exit.letters_allowed}
                  canIssue={canIssue && props.hasSignature}
                  issueHint={!canIssue ? `Can be issued from ${formatDate(exit.last_day)}` : !props.hasSignature ? "Add a signature first" : null}
                  pending={pending}
                  onPrepare={(letter) => setModal({ type: "letter", kind, letter })}
                  onIssue={(letter) => setModal({ type: "issue", letter })}
                  onCancel={(letter) => setModal({ type: "cancel", letter })}
                  onHistory={(letter) => setModal({ type: "history", letter })}
                  onDelete={(letter) => run(() => deleteLetter(letter.id, emp.id), "Draft deleted")}
                />
              ))}
            </ul>
          </div>
        </>
      )}

      {modal?.type === "exit" && <ExitModal emp={emp} exit={exit} today={today} onClose={close} />}
      {modal?.type === "undo" && (
        <Modal
          open
          onClose={close}
          title="Undo exit?"
          description={`${emp.full_name} becomes a normal active employee again. Draft letters are deleted. Issued letters must be cancelled first.`}
          footer={
            <>
              <Button variant="secondary" onClick={close}>
                Keep exit
              </Button>
              <Button loading={pending} onClick={() => run(() => undoExit(emp.id), "Exit removed", close)}>
                Undo exit
              </Button>
            </>
          }
        />
      )}
      {modal?.type === "letter" && exit && (
        <LetterEditor
          emp={emp}
          exit={exit}
          kind={modal.kind}
          letter={modal.letter}
          template={props.templates[modal.kind]}
          company={props.company}
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
              <Button loading={pending} onClick={() => run(() => issueLetter(modal.letter.id, emp.id), "Letter issued", close)}>
                <Send className="h-4 w-4" /> Issue letter
              </Button>
            </>
          }
        >
          <ul className="space-y-2 text-sm text-body">
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {emp.former_access ? `${emp.full_name} can download it from the portal.` : "You can download it here and send it."}
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> The QR code on it starts working.
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

function FinalPayslipRow({ p }: { p: FinalPayslip }) {
  const done = p.payment_status === "paid";
  const label = !p.status ? "Not prepared yet" : p.status === "draft" ? "Draft, not published" : done ? "Published and paid" : "Published, payment pending";
  return (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3", done ? "bg-success-tint" : "bg-soft")}>
      <Wallet className={cn("h-5 w-5 shrink-0", done ? "text-success" : "text-brand")} />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-ink">Final payslip · {monthTitle(p.month)}</p>
        <p className="text-body">{label}</p>
      </div>
      {!done && (
        <Link href={`/admin/payroll?month=${p.month.slice(0, 7)}`} className={buttonClass("secondary", "sm")}>
          Open payroll
        </Link>
      )}
    </div>
  );
}

function LetterRow({
  kind,
  all,
  events,
  allowed,
  canIssue,
  issueHint,
  pending,
  onPrepare,
  onIssue,
  onCancel,
  onHistory,
  onDelete,
}: {
  kind: LetterKind;
  all: AdminLetter[];
  events: LetterEvent[];
  allowed: boolean;
  canIssue: boolean;
  issueHint: string | null;
  pending: boolean;
  onPrepare: (l: AdminLetter | null) => void;
  onIssue: (l: AdminLetter) => void;
  onCancel: (l: AdminLetter) => void;
  onHistory: (l: AdminLetter) => void;
  onDelete: (l: AdminLetter) => void;
}) {
  const live = all.find((l) => l.status !== "cancelled") ?? null;
  const cancelled = all.filter((l) => l.status === "cancelled");
  const count = (l: AdminLetter, e: LetterEvent["event"][]) => events.filter((x) => x.letter_id === l.id && e.includes(x.event)).length;

  const copyLink = async (l: AdminLetter) => {
    try {
      await navigator.clipboard.writeText(verifyUrl(window.location.origin, l.verify_code));
      toast.success("Check link copied");
    } catch {
      toast.error("Could not copy. Open the letter and scan the QR code instead.");
    }
  };

  return (
    <li className="px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-2xl", live?.status === "issued" ? "bg-tint text-brand" : "bg-grey-tile text-body")}>
          <FileBadge2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
            {KIND_LABEL[kind]}
            {live?.status === "draft" && <Badge tone="warning">Draft</Badge>}
            {live?.status === "issued" && (
              <Badge tone="success" dot>
                Issued
              </Badge>
            )}
          </p>
          <p className="mt-0.5 text-sm text-body">
            {!allowed
              ? "Turned off in the exit details."
              : !live
                ? "Not prepared yet."
                : live.status === "draft"
                  ? (issueHint ?? "Ready to issue. Preview it first.")
                  : `${live.ref_no} · ${formatDate(live.issue_date)} · downloaded ${count(live, ["download", "view"])}× · QR checked ${count(live, ["verify"])}×`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {allowed && !live && (
            <Button size="sm" onClick={() => onPrepare(null)}>
              <FilePlus2 className="h-3.5 w-3.5" /> Prepare
            </Button>
          )}
          {live?.status === "draft" && (
            <>
              <a href={pdf(live.id, true)} target="_blank" rel="noopener" className={buttonClass("ghost", "sm")}>
                <Eye className="h-3.5 w-3.5" /> Preview
              </a>
              <Button size="sm" variant="ghost" onClick={() => onPrepare(live)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDelete(live)} disabled={pending} aria-label="Delete draft">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" onClick={() => onIssue(live)} disabled={!canIssue} title={issueHint ?? undefined}>
                <Send className="h-3.5 w-3.5" /> Issue
              </Button>
            </>
          )}
          {live?.status === "issued" && (
            <>
              <a href={pdf(live.id, true)} target="_blank" rel="noopener" className={buttonClass("ghost", "sm")}>
                <Eye className="h-3.5 w-3.5" /> View
              </a>
              <a href={pdf(live.id)} className={buttonClass("secondary", "sm")}>
                <Download className="h-3.5 w-3.5" /> Download
              </a>
              <Button size="sm" variant="ghost" onClick={() => copyLink(live)} aria-label="Copy QR check link">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onHistory(live)} aria-label="Download history">
                <History className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="danger" onClick={() => onCancel(live)}>
                <Ban className="h-3.5 w-3.5" /> Cancel
              </Button>
            </>
          )}
        </div>
      </div>
      {cancelled.length > 0 && (
        <ul className="mt-3 space-y-1.5 pl-[52px]">
          {cancelled.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-body">
              <span className="line-through">{l.ref_no}</span>
              <span>
                cancelled {formatDate(l.cancelled_at)}
                {l.cancel_reason ? `: “${l.cancel_reason}”` : ""}
              </span>
              <a href={pdf(l.id, true)} target="_blank" rel="noopener" className="font-semibold text-ink hover:text-brand">
                View
              </a>
              <button type="button" onClick={() => onHistory(l)} className="cursor-pointer font-semibold text-ink hover:text-brand">
                History
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ExitModal({ emp, exit, today, onClose }: { emp: ExitEmployee; exit: ExitInfo | null; today: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState({
    lastDay: exit?.last_day ?? today,
    reason: exit?.reason ?? ("resigned" as ExitReason),
    conduct: exit?.conduct ?? ("good" as Conduct),
    letters: exit?.letters_allowed ?? true,
    access: exit ? emp.former_access : true,
    note: exit?.note ?? "",
  });

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await recordExit({ employeeId: emp.id, ...v });
      if (!res.ok) return setError(res.error);
      toast.success(exit ? "Exit updated" : `${emp.full_name} marked as leaving on ${formatDate(v.lastDay)}`, {
        description: `Remember the final payslip for ${monthTitle(v.lastDay.slice(0, 7) + "-01")}.`,
      });
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      onClose={onClose}
      title={exit ? "Edit exit" : `Mark ${emp.full_name.split(" ")[0]} as leaving`}
      description="They keep working normally until the last working day. After that only the documents login is left (if you allow it)."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            Save
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
          <Input label="Last working day" type="date" value={v.lastDay} min={emp.date_of_joining ?? undefined} onChange={(e) => setV({ ...v, lastDay: e.target.value })} required />
          <Select label="Reason" value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value as ExitReason })}>
            {Object.entries(REASON_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <Select label="Conduct (printed on the experience letter)" value={v.conduct} onChange={(e) => setV({ ...v, conduct: e.target.value as Conduct })}>
          {Object.entries(CONDUCT_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
        {[
          { key: "letters" as const, label: "Allow an experience letter", hint: "Turn off if they shouldn't get one (for example, after a termination). A relieving letter is always possible." },
          { key: "access" as const, label: "Documents login after leaving", hint: "They can still log in, but see only their letters and payslips." },
        ].map((t) => (
          <label key={t.key} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line px-4 py-3 hover:bg-soft">
            <input type="checkbox" checked={v[t.key]} onChange={(e) => setV({ ...v, [t.key]: e.target.checked })} className="mt-1 accent-[#d4000f]" />
            <span>
              <span className="block text-sm font-semibold text-ink">{t.label}</span>
              <span className="block text-[13px] text-body">{t.hint}</span>
            </span>
          </label>
        ))}
        <Textarea label="Private note (optional)" rows={2} maxLength={1000} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="Notice period served, laptop returned…" />
      </div>
    </Modal>
  );
}

function LetterEditor({
  emp,
  exit,
  kind,
  letter,
  template,
  company,
  onClose,
}: {
  emp: ExitEmployee;
  exit: ExitInfo;
  kind: LetterKind;
  letter: AdminLetter | null;
  template: string;
  company: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState({
    pronoun: letter?.pronoun ?? ("they" as Pronoun),
    designation: letter?.designation ?? emp.designation ?? "",
    department: letter?.department ?? emp.department ?? "",
    from: letter?.date_from ?? emp.date_of_joining ?? exit.last_day,
    to: letter?.date_to ?? exit.last_day,
    conduct: letter?.conduct ?? exit.conduct,
  });
  const rendered = useMemo(
    () =>
      renderTemplate(template, {
        name: emp.full_name,
        emp_code: emp.emp_code,
        designation: v.designation,
        department: v.department,
        company,
        from: v.from,
        to: v.to,
        conduct: v.conduct,
        pronoun: v.pronoun,
      }),
    [template, emp, company, v],
  );
  // Text follows the fields until the admin edits it by hand.
  const [touched, setTouched] = useState(!!letter);
  const [body, setBody] = useState(letter?.body ?? rendered);
  useEffect(() => {
    if (!touched) setBody(rendered);
  }, [rendered, touched]);

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await saveLetter({
        id: letter?.id ?? null,
        employeeId: emp.id,
        kind,
        designation: v.designation,
        department: v.department,
        from: v.from,
        to: v.to,
        conduct: kind === "experience" ? v.conduct : null,
        pronoun: v.pronoun,
        body,
      });
      if (!res.ok) return setError(res.error);
      toast.success("Draft saved", {
        action: res.data ? { label: "Preview", onClick: () => window.open(pdf(res.data!.id, true), "_blank", "noopener") } : undefined,
      });
      onClose();
      router.refresh();
    });

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${letter ? "Edit" : "Prepare"} ${KIND_LABEL[kind].toLowerCase()}`}
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
          <Input label="Designation" value={v.designation} onChange={set("designation")} maxLength={120} required />
          <Input label="Department" value={v.department} onChange={set("department")} maxLength={120} />
          <Input label="Worked from" type="date" value={v.from} onChange={set("from")} max={v.to} />
          <Input label="Worked to" type="date" value={v.to} onChange={set("to")} max={exit.last_day} hint="Last working day" />
          <Select label="Refer to them as" value={v.pronoun} onChange={set("pronoun")}>
            {Object.entries(PRONOUN_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          {kind === "experience" && (
            <Select label="Conduct" value={v.conduct ?? "good"} onChange={set("conduct")}>
              {Object.entries(CONDUCT_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </div>
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
            hint={touched ? "Edited by hand. Field changes above no longer update the text." : "Filled in from your template. Edit freely; leave a blank line between paragraphs."}
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

function CancelModal({ letter, employeeId, onClose }: { letter: AdminLetter; employeeId: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = () =>
    start(async () => {
      setError(null);
      const res = await cancelLetter(letter.id, employeeId, reason);
      if (!res.ok) return setError(res.error);
      toast.success(`${letter.ref_no} cancelled`);
      onClose();
      router.refresh();
    });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Cancel ${letter.ref_no}?`}
      description="The employee can no longer download it, and scanning its QR code will say “cancelled”. You can prepare a new one afterwards. This can't be undone."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep it
          </Button>
          <Button onClick={submit} loading={pending}>
            Cancel letter
          </Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="animate-pop mb-4 rounded-2xl bg-tint-2 px-4 py-3 text-sm font-medium text-brand">
          {error}
        </p>
      )}
      <Textarea label="Reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong designation, issuing a corrected letter" required />
    </Modal>
  );
}

const EVENT_LABEL: Record<LetterEvent["event"], string> = { download: "Downloaded", view: "Opened", verify: "QR code checked" };

function HistoryModal({ letter, events, onClose }: { letter: AdminLetter; events: LetterEvent[]; onClose: () => void }) {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(iso));
  return (
    <Modal open onClose={onClose} title="Download history" description={`${letter.ref_no} · ${KIND_LABEL[letter.kind]}`} footer={<Button onClick={onClose}>Done</Button>}>
      {events.length === 0 ? (
        <p className="text-sm text-body">Nobody has downloaded or checked it yet.</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {events.map((e, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 py-2.5">
              <span>
                <b className="text-ink">{EVENT_LABEL[e.event]}</b>
                <span className="text-body"> · {e.event === "verify" ? "someone scanned the QR code" : (e.actor ?? "deleted user")}</span>
              </span>
              <span className="tabular-nums text-body">{fmt(e.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
