"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eraser, PenLine, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { HIRE_PLACEHOLDERS, PLACEHOLDERS } from "@/lib/letters";
import { saveLetterWording, saveSignature } from "./letters-actions";

export type SignatureVersion = {
  id: string;
  signer_name: string;
  signer_title: string;
  signature_url: string | null;
  seal_url: string | null;
  created_at: string;
  retired_at: string | null;
  used: number;
};

export function LetterSettings({
  versions,
  wording,
}: {
  versions: SignatureVersion[];
  wording: { prefix: string; experience: string; relieving: string; offer: string; contract: string };
}) {
  const current = versions.find((v) => !v.retired_at) ?? null;
  const old = versions.filter((v) => v.retired_at);
  const [editing, setEditing] = useState(!current);

  return (
    <section id="letters" className="mt-10 scroll-mt-24">
      <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink">Letters &amp; signature</h2>
      <p className="mt-1 text-sm text-body">Used on offer letters, contracts, and experience and relieving letters. Changing the signature never changes letters already issued.</p>

      <div className="mt-5 grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Signature"
            description={current ? `In use since ${formatDate(current.created_at)}` : "Needed before any letter can be issued."}
            action={current && !editing ? <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Change</Button> : undefined}
          />
          <CardBody>
            {current && !editing && <SignaturePreview v={current} />}
            {editing && <SignatureForm current={current} onDone={() => setEditing(false)} />}
          </CardBody>
          {old.length > 0 && (
            <div className="border-t border-line px-5 py-4 sm:px-6">
              <p className="text-[11px] font-bold uppercase tracking-wider text-body">Earlier signatures</p>
              <ul className="mt-3 space-y-3">
                {old.map((v) => (
                  <li key={v.id} className="flex items-center gap-3">
                    <span className="grid h-12 w-24 shrink-0 place-items-center rounded-xl border border-line bg-white p-1">
                      {v.signature_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.signature_url} alt={`Signature of ${v.signer_name}`} className="max-h-full max-w-full object-contain" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-semibold text-ink">
                        {v.signer_name} <span className="font-normal text-body">· {v.signer_title}</span>
                      </p>
                      <p className="text-[13px] text-body">
                        {formatDate(v.created_at)} – {formatDate(v.retired_at)} · on {v.used} letter{v.used === 1 ? "" : "s"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <WordingForm initial={wording} />
      </div>
    </section>
  );
}

function SignaturePreview({ v }: { v: SignatureVersion }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="text-sm font-semibold text-ink">For RohTre Media</p>
      <div className="mt-2 flex h-20 items-end">
        {v.signature_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.signature_url} alt={`Signature of ${v.signer_name}`} className="max-h-[72px] max-w-[200px] object-contain" />
        )}
        {v.seal_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.seal_url} alt="Company seal" className="-ml-4 h-20 w-20 object-contain opacity-90" />
        )}
      </div>
      <p className="mt-2 font-bold text-ink">{v.signer_name}</p>
      <p className="text-sm text-body">{v.signer_title}</p>
      <p className="mt-3 flex items-center gap-2 text-[13px] text-body">
        <Badge tone="success" dot>
          Current
        </Badge>
        Used on {v.used} letter{v.used === 1 ? "" : "s"}
      </p>
    </div>
  );
}

type Mode = "keep" | "upload" | "draw";

function SignatureForm({ current, onDone }: { current: SignatureVersion | null; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(current?.signer_name ?? "");
  const [title, setTitle] = useState(current?.signer_title ?? "");
  const [mode, setMode] = useState<Mode>(current ? "keep" : "draw");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [sealMode, setSealMode] = useState<"keep" | "new" | "none">(current?.seal_url ? "keep" : "none");
  const [seal, setSeal] = useState<File | null>(null);
  const pad = useRef<PadHandle>(null);

  useEffect(() => {
    if (!file) return setFilePreview(null);
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const submit = () =>
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("name", name);
      fd.set("title", title);
      if (mode === "keep") fd.set("sigMode", "keep");
      else {
        const sig = mode === "upload" ? file : await pad.current?.toFile();
        if (!sig) return setError(mode === "upload" ? "Choose a signature image." : "Draw your signature in the box first.");
        fd.set("sigMode", "new");
        fd.set("signature", sig);
      }
      fd.set("sealMode", sealMode);
      if (sealMode === "new") {
        if (!seal) return setError("Choose a seal image, or pick “No seal”.");
        fd.set("seal", seal);
      }
      const res = await saveSignature(fd);
      if (!res.ok) return setError(res.error);
      toast.success("Signature saved. New letters will use it.");
      onDone();
      router.refresh();
    });

  const tab = (m: Mode, label: string, Icon: typeof PenLine) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
        mode === m ? "bg-ink text-white" : "text-body hover:bg-app hover:text-ink",
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="animate-pop rounded-2xl bg-tint-2 px-4 py-3 text-sm font-medium text-brand">
          {error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Signer's name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Mrunal Patel" required />
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Director" required />
      </div>

      <div>
        <p className="text-sm font-semibold text-ink">Signature</p>
        <div className="mt-2 flex flex-wrap gap-1 rounded-full bg-soft p-1">
          {current && tab("keep", "Keep current", PenLine)}
          {tab("draw", "Draw", PenLine)}
          {tab("upload", "Upload", Upload)}
        </div>
        <div className="mt-3">
          {mode === "keep" && current?.signature_url && (
            <div className="grid h-24 place-items-center rounded-2xl border border-line bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={current.signature_url} alt="Current signature" className="max-h-full max-w-full object-contain" />
            </div>
          )}
          {mode === "draw" && <SignaturePad ref={pad} />}
          {mode === "upload" && (
            <div>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-white p-5 text-center hover:bg-soft">
                {filePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={filePreview} alt="New signature" className="max-h-20 max-w-full object-contain" />
                ) : (
                  <Upload className="h-6 w-6 text-body" />
                )}
                <span className="text-sm font-semibold text-ink">{file ? file.name : "Choose an image"}</span>
                <span className="text-[13px] text-body">PNG with a see-through background works best. Max 1 MB.</span>
                <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
          )}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-ink">Company seal (optional)</p>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          {(
            [
              ...(current?.seal_url ? [["keep", "Keep current"]] : []),
              ["new", "Upload new"],
              ["none", "No seal"],
            ] as [typeof sealMode, string][]
          ).map(([k, l]) => (
            <label key={k} className="flex cursor-pointer items-center gap-2">
              <input type="radio" name="sealMode" checked={sealMode === k} onChange={() => setSealMode(k)} className="accent-[#d4000f]" />
              {l}
            </label>
          ))}
        </div>
        {sealMode === "new" && (
          <input type="file" accept="image/png,image/jpeg" onChange={(e) => setSeal(e.target.files?.[0] ?? null)} className="mt-3 block w-full text-sm text-body file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-[13px] file:font-semibold file:text-white" />
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        {current && (
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button onClick={submit} loading={pending}>
          Save signature
        </Button>
      </div>
    </div>
  );
}

type PadHandle = { toFile: () => Promise<File | null> };

/** Mouse / finger / stylus signature box. Exports a trimmed PNG with a transparent background. */
function SignaturePad({ ref }: { ref: React.Ref<PadHandle> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = Math.max(2, window.devicePixelRatio || 1);
    const { width, height } = c.getBoundingClientRect();
    c.width = width * ratio;
    c.height = height * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b1f4d"; // dark blue ink
    ctx.lineWidth = 2.4;
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent) => {
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const p = point(e);
    const ctx = canvas.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    setEmpty(false);
  };
  const up = () => {
    drawing.current = false;
    last.current = null;
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  };

  // expose toFile() to the form
  useEffect(() => {
    const handle: PadHandle = {
      toFile: async () => {
        if (empty) return null;
        const c = canvas.current!;
        const ctx = c.getContext("2d")!;
        const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
        let [x0, y0, x1, y1] = [width, height, 0, 0];
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++)
            if (data[(y * width + x) * 4 + 3] > 0) {
              if (x < x0) x0 = x;
              if (y < y0) y0 = y;
              if (x > x1) x1 = x;
              if (y > y1) y1 = y;
            }
        if (x1 <= x0 || y1 <= y0) return null;
        const pad = 12;
        const out = document.createElement("canvas");
        out.width = x1 - x0 + pad * 2;
        out.height = y1 - y0 + pad * 2;
        out.getContext("2d")!.drawImage(c, x0, y0, x1 - x0, y1 - y0, pad, pad, x1 - x0, y1 - y0);
        const blob = await new Promise<Blob | null>((res) => out.toBlob(res, "image/png"));
        return blob ? new File([blob], "signature.png", { type: "image/png" }) : null;
      },
    };
    if (typeof ref === "function") ref(handle);
    else if (ref) (ref as React.RefObject<PadHandle | null>).current = handle;
  }, [ref, empty]);

  return (
    <div>
      <div className="relative">
        <canvas
          ref={canvas}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className="h-40 w-full cursor-crosshair touch-none rounded-2xl border border-line bg-white"
          aria-label="Draw your signature here"
        />
        {empty && <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-body/70">Sign here with your mouse or finger</span>}
        <span className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-dashed border-line" aria-hidden />
      </div>
      <button type="button" onClick={clear} className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-body hover:text-ink">
        <Eraser className="h-3.5 w-3.5" /> Clear
      </button>
    </div>
  );
}

function WordingForm({ initial }: { initial: { prefix: string; experience: string; relieving: string; offer: string; contract: string } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState(initial);
  const submit = () =>
    start(async () => {
      const res = await saveLetterWording(v);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Letter wording saved. It applies to letters you prepare from now on.");
      router.refresh();
    });

  return (
    <Card>
      <CardHeader title="Letter wording" description="The starting text for new letters. You can still edit each letter before issuing it." />
      <CardBody className="space-y-4">
        <Input
          label="Reference prefix"
          value={v.prefix}
          onChange={(e) => setV({ ...v, prefix: e.target.value.toUpperCase() })}
          maxLength={6}
          hint={`Numbers look like ${v.prefix || "RT"}/EXP/${new Date().getFullYear()}/001`}
        />
        <p className="pt-2 text-[12px] font-bold uppercase tracking-wider text-body">Joining</p>
        <Textarea label="Offer letter" rows={8} value={v.offer} onChange={(e) => setV({ ...v, offer: e.target.value })} maxLength={5000} />
        <Textarea label="Employment contract" rows={8} value={v.contract} onChange={(e) => setV({ ...v, contract: e.target.value })} maxLength={5000} />
        <Placeholders title="Words you can use in offer letters and contracts" items={HIRE_PLACEHOLDERS} />
        <p className="pt-2 text-[12px] font-bold uppercase tracking-wider text-body">Leaving</p>
        <Textarea label="Experience letter" rows={7} value={v.experience} onChange={(e) => setV({ ...v, experience: e.target.value })} maxLength={5000} />
        <Textarea label="Relieving letter" rows={6} value={v.relieving} onChange={(e) => setV({ ...v, relieving: e.target.value })} maxLength={5000} />
        <Placeholders title="Words you can use in experience and relieving letters" items={PLACEHOLDERS} />
        <div className="flex justify-end">
          <Button onClick={submit} loading={pending}>
            Save wording
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function Placeholders({ title, items }: { title: string; items: readonly (readonly [string, string])[] }) {
  return (
    <details className="rounded-2xl bg-soft px-4 py-3 text-sm">
      <summary className="cursor-pointer font-semibold text-ink">{title}</summary>
      <dl className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-[auto_1fr]">
        {items.map(([k, d]) => (
          <div key={k} className="contents">
            <dt className="font-mono text-[13px] text-ink">{k}</dt>
            <dd className="text-body">{d}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[13px] text-body">Leave a blank line between paragraphs.</p>
    </details>
  );
}
