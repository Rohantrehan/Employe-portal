import { LockKeyhole } from "lucide-react";
import { Card } from "@/components/ui/card";

/** Shown until the VAULT_KEY env var is set. */
export function SetupNotice() {
  return (
    <Card className="mt-8 border-warning/40 p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-warning-tint text-warning">
          <LockKeyhole className="h-5 w-5" />
        </span>
        <div className="text-sm text-body">
          <p className="text-base font-bold text-ink">One-time setup: add the encryption key</p>
          <p className="mt-1">
            Passwords are encrypted with a key that lives only in the server settings, never in the database. Add an environment variable named{" "}
            <code className="rounded bg-grey-tile px-1.5 py-0.5 font-mono text-ink">VAULT_KEY</code> in Vercel (and in <code className="font-mono">.env.local</code>), then redeploy.
          </p>
          <p className="mt-2">Make the key on your computer with this command, and keep a copy in a safe place. Without it, saved passwords can&apos;t be read:</p>
          <pre className="mt-2 overflow-x-auto rounded-xl bg-ink px-4 py-3 font-mono text-[13px] text-white">
            node -e &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;base64&apos;))&quot;
          </pre>
        </div>
      </div>
    </Card>
  );
}
