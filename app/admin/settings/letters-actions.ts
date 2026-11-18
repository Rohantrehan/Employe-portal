"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";

export type Result = { ok: true } | { ok: false; error: string };

const MAX = 1024 * 1024;
const TYPES: Record<string, "png" | "jpg"> = { "image/png": "png", "image/jpeg": "jpg" };

/** PNG/JPEG magic bytes, so a renamed file can't slip through. */
async function checkImage(file: File): Promise<string | null> {
  if (!TYPES[file.type]) return "Use a PNG or JPG image.";
  if (file.size === 0) return "The image is empty.";
  if (file.size > MAX) return "Images must be 1 MB or smaller.";
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const png = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const jpg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if ((file.type === "image/png" && !png) || (file.type === "image/jpeg" && !jpg)) return "That file is not a real PNG or JPG image.";
  return null;
}

/**
 * Saves a new signature version. Old versions are kept (and stay on the letters
 * issued with them). Images go to the private letter-assets bucket.
 */
export async function saveSignature(formData: FormData): Promise<Result> {
  const { supabase } = await requireRole("admin");
  const name = String(formData.get("name") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const sigMode = String(formData.get("sigMode") ?? "keep");
  const sealMode = String(formData.get("sealMode") ?? "keep");

  const { data: current } = await supabase.from("letter_signatures").select("signature_path, seal_path").is("retired_at", null).maybeSingle();

  const upload = async (field: string, folder: "signatures" | "seals"): Promise<{ path?: string; error?: string }> => {
    const file = formData.get(field);
    if (!(file instanceof File)) return { error: folder === "signatures" ? "Upload or draw a signature." : "Choose a seal image." };
    const bad = await checkImage(file);
    if (bad) return { error: bad };
    const path = `${folder}/${randomUUID()}.${TYPES[file.type]}`;
    const { error } = await supabase.storage.from("letter-assets").upload(path, file, { contentType: file.type, upsert: false });
    if (error) return { error: "Could not upload the image. Please try again." };
    return { path };
  };

  let signaturePath = current?.signature_path ?? null;
  if (sigMode === "new" || !signaturePath) {
    const r = await upload("signature", "signatures");
    if (r.error) return { ok: false, error: r.error };
    signaturePath = r.path!;
  }

  let sealPath = current?.seal_path ?? null;
  if (sealMode === "none") sealPath = null;
  if (sealMode === "new") {
    const r = await upload("seal", "seals");
    if (r.error) return { ok: false, error: r.error };
    sealPath = r.path!;
  }

  const { error } = await supabase.rpc("save_signature", { p_name: name, p_title: title, p_signature_path: signaturePath, p_seal_path: sealPath });
  if (error) return { ok: false, error: error.code === "P0001" ? error.message : "Could not save the signature." };
  revalidatePath("/admin/settings");
  revalidatePath("/admin/employees", "layout");
  return { ok: true };
}

const wordingSchema = z.object({
  prefix: z.string().trim().toUpperCase().regex(/^[A-Z]{2,6}$/, "The reference prefix must be 2 to 6 letters (A–Z)"),
  experience: z.string().trim().min(20, "The experience letter text is too short").max(5000),
  relieving: z.string().trim().min(20, "The relieving letter text is too short").max(5000),
});

export async function saveLetterWording(input: z.input<typeof wordingSchema>): Promise<Result> {
  const { supabase } = await requireRole("admin");
  const parsed = wordingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { error } = await supabase.rpc("save_letter_settings", {
    p_prefix: parsed.data.prefix,
    p_experience: parsed.data.experience,
    p_relieving: parsed.data.relieving,
  });
  if (error) return { ok: false, error: error.code === "P0001" ? error.message : "Could not save the wording." };
  revalidatePath("/admin/settings");
  return { ok: true };
}
