import Image from "next/image";
import { cn } from "@/lib/cn";

/** RohTre wordmark (687×181 source). */
export function Wordmark({ tone = "black", height = 26, className }: { tone?: "black" | "white"; height?: number; className?: string }) {
  return (
    <Image
      src={`/logos/rohtre-wordmark-${tone}.png`}
      alt="RohTre Media"
      width={Math.round((height * 687) / 181)}
      height={height}
      priority
      className={cn("shrink-0 object-contain", className)}
    />
  );
}

/** Red "R" mark (201×201 source). */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <Image src="/logos/rohtre-r-red.png" alt="" width={size} height={size} className={cn("shrink-0 object-contain", className)} />
  );
}

/** Full-screen loader: red R mark with pulse ring + float, as on the reference site. */
export function LogoLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center" aria-busy="true" aria-label={label}>
      <div className="flex flex-col items-center">
        <span className="animate-pulse-ring inline-block rounded-[15px]">
          <LogoMark size={56} className="animate-float" />
        </span>
        <div className="mt-6 h-1 w-24 overflow-hidden rounded-full bg-grey-tile">
          <div className="animate-loader-slide h-full w-1/3 rounded-full bg-brand" />
        </div>
      </div>
    </div>
  );
}
