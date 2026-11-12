import type { Metadata } from "next";
import { StyleguideDemo } from "./styleguide-demo";

export const metadata: Metadata = { title: "Styleguide" };

export default function StyleguidePage() {
  return <StyleguideDemo />;
}
