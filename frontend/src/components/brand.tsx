import Image from "next/image";
import { cn } from "@/lib/utils";

export function Brand({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Image src="/logo.png" alt="" width={size} height={size} priority />
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">AetherCode</span>
    </span>
  );
}
