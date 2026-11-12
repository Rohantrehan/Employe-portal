import { LogoLoader } from "@/components/ui/logo";

export default function Loading() {
  return (
    <div className="grid min-h-screen place-items-center bg-white">
      <LogoLoader />
    </div>
  );
}
