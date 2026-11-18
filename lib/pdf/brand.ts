import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

// Brand font (Plus Jakarta Sans). It has no ₹ glyph, so amounts use "Rs.".
const fontDir = path.join(process.cwd(), "node_modules", "@fontsource", "plus-jakarta-sans", "files");
Font.register({
  family: "Jakarta",
  fonts: [
    { src: path.join(fontDir, "plus-jakarta-sans-latin-400-normal.woff"), fontWeight: 400 },
    { src: path.join(fontDir, "plus-jakarta-sans-latin-600-normal.woff"), fontWeight: 600 },
    { src: path.join(fontDir, "plus-jakarta-sans-latin-700-normal.woff"), fontWeight: 700 },
    { src: path.join(fontDir, "plus-jakarta-sans-latin-800-normal.woff"), fontWeight: 800 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

// Pass the logo as bytes: a Windows path like "D:\..." is mistaken for a URL scheme and silently fails.
export const LOGO = { data: readFileSync(path.join(process.cwd(), "public", "logos", "rohtre-wordmark-black.png")), format: "png" as const };

export const BRAND = "#d4000f";
export const INK = "#111827";
export const BODY = "#6b7280";
export const LINE = "#e5e7eb";
export const SOFT = "#fafafb";
export const TINT = "#fbe6e7";
