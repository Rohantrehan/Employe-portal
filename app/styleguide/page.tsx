import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StyleguideDemo } from "./styleguide-demo";

export const metadata: Metadata = { title: "Styleguide" };

export default function StyleguidePage() {
  // Design reference for development only.
  if (process.env.NODE_ENV === "production") notFound();
  return <StyleguideDemo />;
}
