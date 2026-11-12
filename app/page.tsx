import { redirect } from "next/navigation";

// Temporary: until login exists (Phase 2), send visitors to the styleguide.
export default function Home() {
  redirect("/styleguide");
}
