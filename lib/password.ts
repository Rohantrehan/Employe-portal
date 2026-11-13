import "server-only";
import { randomInt } from "node:crypto";

// No look-alike characters (0/O, 1/l/I) so it can be read out or typed easily.
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";

/** Random temporary password, e.g. "Kq7m-Tz4r-Wp9x". Always has letters and digits. */
export function tempPassword() {
  const group = () =>
    Array.from({ length: 4 }, (_, i) => (i === 2 ? DIGITS[randomInt(DIGITS.length)] : LETTERS[randomInt(LETTERS.length)])).join("");
  return `${group()}-${group()}-${group()}`;
}
