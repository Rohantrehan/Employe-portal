// Creates (or promotes) an admin account.
// Usage: npm run create-admin -- admin@company.com "Full Name"
// Prints a one-time temporary password. The admin must change it on first login.
import { randomBytes } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: join(root, ".env.local"), quiet: true });

const [email, ...nameParts] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const fullName = nameParts.join(" ").trim();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !fullName) {
  console.error('Usage: npm run create-admin -- admin@company.com "Full Name"');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// Temporary password: 14 chars, letters + digits, always containing both.
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const bytes = randomBytes(12);
const tempPassword = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("") + "a7";

const { data, error } = await supabase.auth.admin.createUser({
  email: email.toLowerCase(),
  password: tempPassword,
  email_confirm: true,
  user_metadata: { full_name: fullName },
  app_metadata: { role: "admin", must_change_password: true },
});

if (error) {
  console.error("Could not create the admin:", error.message);
  process.exit(1);
}

// The DB trigger creates the profile; make sure role/name are right even if it already existed.
const { error: pErr } = await supabase
  .from("profiles")
  .update({ role: "admin", full_name: fullName, must_change_password: true, is_active: true })
  .eq("id", data.user.id);
if (pErr) {
  console.error("User created, but the profile update failed:", pErr.message);
  process.exit(1);
}

// With --save, write the password to a git-ignored file instead of the terminal.
if (process.argv.includes("--save")) {
  const { writeFileSync } = await import("node:fs");
  const file = join(root, ".admin-temp-password.txt");
  writeFileSync(
    file,
    `Email:              ${email.toLowerCase()}\nTemporary password: ${tempPassword}\n\nLog in at /login, set a new password, then DELETE this file.\n`,
    { mode: 0o600 },
  );
  console.log(`\nAdmin account created for ${email.toLowerCase()}.`);
  console.log(`Temporary password saved to ${file}\n`);
} else {
  console.log("\nAdmin account created.");
  console.log("  Email:              " + email.toLowerCase());
  console.log("  Temporary password: " + tempPassword);
  console.log("\nLog in at /login. You will be asked to set a new password.\n");
}
